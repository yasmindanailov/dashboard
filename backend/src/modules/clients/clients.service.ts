import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { RoleSlug } from '@prisma/client';
import { paginate, PaginatedResult } from '../../common/dto/pagination.dto';
import {
  ClientListQueryDto,
  UpdateClientProfileDto,
  AddNoteDto,
  CreateClientNoteDto,
  ClientNoteQueryDto,
} from './dto/client.dto';
import {
  CreateBillingProfileDto,
  UpdateBillingProfileDto,
} from './dto/billing-profile.dto';
import { ClientsBillingService } from './clients-billing.service';

/* ═══════════════════════════════════════
   ClientsService — Client CRUD, notes,
   and billing profile facade.
   Ref: ARCHITECTURE.md Regla 15
   ═══════════════════════════════════════ */

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: ClientsBillingService,
  ) {}

  /* ── List ── */

  async findAll(query: ClientListQueryDto): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 20, search, status } = query;
    const skip = (page - 1) * limit;

    const clientRole = await this.prisma.role.findUnique({
      where: { slug: RoleSlug.client },
    });
    if (!clientRole) throw new Error('Client role not found');

    const where: any = { role_id: clientRole.id };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { first_name: { contains: search, mode: 'insensitive' } },
        { last_name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          status: true,
          last_login_at: true,
          created_at: true,
          client_profile: {
            select: { client_type: true, phone: true, company_name: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  /* ── Detail ── */

  async findOne(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        status: true,
        email_verified_at: true,
        last_login_at: true,
        last_login_ip: true,
        two_factor_enabled: true,
        language: true,
        timezone: true,
        created_at: true,
        role: { select: { slug: true, name: true } },
        client_profile: true,
        billing_profiles: { orderBy: { created_at: 'desc' } },
      },
    });

    if (!user) throw new NotFoundException('Cliente no encontrado');
    if (user.role.slug !== RoleSlug.client)
      throw new NotFoundException('Cliente no encontrado');
    return user;
  }

  /* ── Update Profile ── */

  async updateProfile(userId: string, dto: UpdateClientProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: { select: { slug: true } } },
    });
    if (!user) throw new NotFoundException('Cliente no encontrado');
    if (user.role.slug !== RoleSlug.client)
      throw new NotFoundException('Cliente no encontrado');

    return this.prisma.clientProfile.upsert({
      where: { user_id: userId },
      create: { user_id: userId, ...dto },
      update: dto,
    });
  }

  /* ── Legacy Note ── */

  async addNote(userId: string, dto: AddNoteDto, authorId?: string) {
    const profile = await this.prisma.clientProfile.findUnique({
      where: { user_id: userId },
    });
    if (!profile)
      throw new NotFoundException('Perfil de cliente no encontrado');

    const timestamp = new Date().toISOString();
    const newNote = `[${timestamp}]\n${dto.note}`;
    const existingNotes = profile.notes_internal || '';
    const updatedNotes = existingNotes
      ? `${newNote}\n\n---\n\n${existingNotes}`
      : newNote;

    const result = await this.prisma.clientProfile.update({
      where: { user_id: userId },
      data: { notes_internal: updatedNotes },
    });

    if (authorId) {
      try {
        await this.prisma.clientNote.create({
          data: {
            user_id: userId,
            author_id: authorId,
            body: dto.note,
            category: 'general',
            is_pinned: false,
          },
        });
      } catch (e) {
        console.warn('[ClientsService] structured note sync failed:', e);
      }
    }

    return result;
  }

  /* ── Structured Notes (7.H19) ── */

  async createStructuredNote(
    userId: string,
    authorId: string,
    dto: CreateClientNoteDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Cliente no encontrado');

    return this.prisma.clientNote.create({
      data: {
        user_id: userId,
        author_id: authorId,
        body: dto.body,
        category: dto.category || 'conversation',
        conversation_id: dto.conversation_id || null,
        is_pinned: dto.is_pinned || false,
      },
    });
  }

  async listStructuredNotes(userId: string, query: ClientNoteQueryDto) {
    const { page = 1, limit = 50, category, pinned_only } = query;
    const skip = (page - 1) * limit;
    const where: any = { user_id: userId };
    if (category) where.category = category;
    if (pinned_only) where.is_pinned = true;

    const [notes, total] = await Promise.all([
      this.prisma.clientNote.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ is_pinned: 'desc' }, { created_at: 'desc' }],
      }),
      this.prisma.clientNote.count({ where }),
    ]);

    const authorIds = [...new Set(notes.map((n) => n.author_id))];
    const authors = authorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, first_name: true, last_name: true },
        })
      : [];
    const authorMap: Record<string, string> = {};
    authors.forEach((a) => {
      authorMap[a.id] = `${a.first_name} ${a.last_name}`;
    });

    const enrichedNotes = notes.map((n) => ({
      ...n,
      author_name: authorMap[n.author_id] || 'Desconocido',
    }));

    return paginate(enrichedNotes, total, page, limit);
  }

  async toggleNotePin(noteId: string) {
    const note = await this.prisma.clientNote.findUnique({
      where: { id: noteId },
    });
    if (!note) throw new NotFoundException('Nota no encontrada');
    return this.prisma.clientNote.update({
      where: { id: noteId },
      data: { is_pinned: !note.is_pinned },
    });
  }

  /* ── Billing Profile delegates ── */

  getBillingProfiles(userId: string) {
    return this.billing.getBillingProfiles(userId);
  }
  createBillingProfile(userId: string, dto: CreateBillingProfileDto) {
    return this.billing.createBillingProfile(userId, dto);
  }
  updateBillingProfile(
    userId: string,
    profileId: string,
    dto: UpdateBillingProfileDto,
  ) {
    return this.billing.updateBillingProfile(userId, profileId, dto);
  }
  deleteBillingProfile(userId: string, profileId: string) {
    return this.billing.deleteBillingProfile(userId, profileId);
  }
  setDefaultBillingProfile(userId: string, profileId: string) {
    return this.billing.setDefaultBillingProfile(userId, profileId);
  }
}
