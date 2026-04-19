import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { RoleSlug } from '@prisma/client';
import { paginate, PaginatedResult } from '../../common/dto/pagination.dto';
import { ClientListQueryDto, UpdateClientProfileDto, AddNoteDto } from './dto/client.dto';
import { CreateBillingProfileDto, UpdateBillingProfileDto } from './dto/billing-profile.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  /* ═══════════════════════════════════════
     LIST CLIENTS (admin/agent)
     ═══════════════════════════════════════ */
  async findAll(query: ClientListQueryDto): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 20, search, status } = query;
    const skip = (page - 1) * limit;

    // Only show users with role 'client'
    const clientRole = await this.prisma.role.findUnique({
      where: { slug: RoleSlug.client },
    });
    if (!clientRole) throw new Error('Client role not found');

    const where: any = { role_id: clientRole.id };

    if (status) {
      where.status = status;
    }

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
            select: {
              client_type: true,
              phone: true,
              company_name: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  /* ═══════════════════════════════════════
     GET CLIENT DETAIL (ficha completa)
     ═══════════════════════════════════════ */
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
        billing_profiles: {
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!user) throw new NotFoundException('Cliente no encontrado');

    // EC-4.3: Only allow viewing clients, not agents/admins
    if (user.role.slug !== RoleSlug.client) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return user;
  }

  /* ═══════════════════════════════════════
     UPDATE CLIENT PROFILE
     ═══════════════════════════════════════ */
  async updateProfile(userId: string, dto: UpdateClientProfileDto) {
    // EC-4.4: Use select to avoid loading password_hash
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: { select: { slug: true } } },
    });
    if (!user) throw new NotFoundException('Cliente no encontrado');
    if (user.role.slug !== RoleSlug.client) throw new NotFoundException('Cliente no encontrado');

    // Upsert profile (create if doesn't exist — safety net)
    const profile = await this.prisma.clientProfile.upsert({
      where: { user_id: userId },
      create: { user_id: userId, ...dto },
      update: dto,
    });

    return profile;
  }

  /* ═══════════════════════════════════════
     ADD INTERNAL NOTE
     ═══════════════════════════════════════ */
  async addNote(userId: string, dto: AddNoteDto) {
    const profile = await this.prisma.clientProfile.findUnique({
      where: { user_id: userId },
    });

    if (!profile) throw new NotFoundException('Perfil de cliente no encontrado');

    // Append note with timestamp to existing notes
    const timestamp = new Date().toISOString();
    const newNote = `[${timestamp}]\n${dto.note}`;
    const existingNotes = profile.notes_internal || '';
    const updatedNotes = existingNotes
      ? `${newNote}\n\n---\n\n${existingNotes}`
      : newNote;

    return this.prisma.clientProfile.update({
      where: { user_id: userId },
      data: { notes_internal: updatedNotes },
    });
  }

  /* ═══════════════════════════════════════
     BILLING PROFILES
     ═══════════════════════════════════════ */

  async getBillingProfiles(userId: string) {
    return this.prisma.billingProfile.findMany({
      where: { user_id: userId },
      orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
    });
  }

  async createBillingProfile(userId: string, dto: CreateBillingProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Cliente no encontrado');

    // Validate business rules per type
    if ((dto.type === 'autonomo' || dto.type === 'empresa') && !dto.nif_cif) {
      throw new BadRequestException(
        `El NIF/CIF es obligatorio para perfiles de tipo ${dto.type}.`,
      );
    }

    if (dto.type === 'empresa' && !dto.company_name) {
      throw new BadRequestException(
        'El nombre de empresa es obligatorio para perfiles de tipo empresa.',
      );
    }

    // EC-4.5: Use $transaction to prevent race condition on is_default
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.billingProfile.count({
        where: { user_id: userId },
      });

      const isDefault = dto.is_default ?? existing === 0;

      if (isDefault) {
        await tx.billingProfile.updateMany({
          where: { user_id: userId, is_default: true },
          data: { is_default: false },
        });
      }

      return tx.billingProfile.create({
        data: {
          user_id: userId,
          type: dto.type,
          label: dto.label,
          first_name: dto.first_name,
          last_name: dto.last_name,
          company_name: dto.company_name,
          nif_cif: dto.nif_cif,
          address_line1: dto.address_line1,
          address_line2: dto.address_line2,
          city: dto.city,
          postal_code: dto.postal_code,
          country: dto.country ?? 'ES',
          is_default: isDefault,
        },
      });
    });
  }

  // EC-4.1: Added userId param to verify ownership
  async updateBillingProfile(userId: string, profileId: string, dto: UpdateBillingProfileDto) {
    const profile = await this.prisma.billingProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile || profile.user_id !== userId) {
      throw new NotFoundException('Perfil de facturación no encontrado');
    }

    // Validate business rules if type changes
    const newType = dto.type ?? profile.type;
    const newNif = dto.nif_cif ?? profile.nif_cif;
    const newCompany = dto.company_name ?? profile.company_name;

    if ((newType === 'autonomo' || newType === 'empresa') && !newNif) {
      throw new BadRequestException(
        `El NIF/CIF es obligatorio para perfiles de tipo ${newType}.`,
      );
    }
    if (newType === 'empresa' && !newCompany) {
      throw new BadRequestException(
        'El nombre de empresa es obligatorio para perfiles de tipo empresa.',
      );
    }

    // EC-4.5: Use $transaction for default toggle
    return this.prisma.$transaction(async (tx) => {
      if (dto.is_default === true) {
        await tx.billingProfile.updateMany({
          where: { user_id: profile.user_id, is_default: true },
          data: { is_default: false },
        });
      }

      return tx.billingProfile.update({
        where: { id: profileId },
        data: dto,
      });
    });
  }

  // EC-4.1: Added userId param to verify ownership
  async deleteBillingProfile(userId: string, profileId: string) {
    const profile = await this.prisma.billingProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile || profile.user_id !== userId) {
      throw new NotFoundException('Perfil de facturación no encontrado');
    }

    if (profile.is_default) {
      throw new BadRequestException(
        'No puedes eliminar el perfil de facturación por defecto. Asigna otro como predeterminado primero.',
      );
    }

    // TODO: Sprint 6 — check if profile has associated invoices before deleting

    return this.prisma.billingProfile.delete({ where: { id: profileId } });
  }

  async setDefaultBillingProfile(userId: string, profileId: string) {
    const profile = await this.prisma.billingProfile.findUnique({
      where: { id: profileId },
    });

    if (!profile || profile.user_id !== userId) {
      throw new NotFoundException('Perfil de facturación no encontrado');
    }

    // EC-4.5: Use $transaction for default swap
    return this.prisma.$transaction(async (tx) => {
      await tx.billingProfile.updateMany({
        where: { user_id: userId, is_default: true },
        data: { is_default: false },
      });

      return tx.billingProfile.update({
        where: { id: profileId },
        data: { is_default: true },
      });
    });
  }
}
