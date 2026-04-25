import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import {
  CreateBillingProfileDto,
  UpdateBillingProfileDto,
} from './dto/billing-profile.dto';

/* ═══════════════════════════════════════
   ClientsBillingService — Billing profile
   CRUD for clients.
   Ref: ARCHITECTURE.md Regla 15
   ═══════════════════════════════════════ */

@Injectable()
export class ClientsBillingService {
  constructor(private readonly prisma: PrismaService) {}

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

  // EC-4.1: userId param verifies ownership
  async updateBillingProfile(
    userId: string,
    profileId: string,
    dto: UpdateBillingProfileDto,
  ) {
    const profile = await this.prisma.billingProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile || profile.user_id !== userId)
      throw new NotFoundException('Perfil de facturación no encontrado');

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
      return tx.billingProfile.update({ where: { id: profileId }, data: dto });
    });
  }

  // EC-4.1: userId param verifies ownership
  async deleteBillingProfile(userId: string, profileId: string) {
    const profile = await this.prisma.billingProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile || profile.user_id !== userId)
      throw new NotFoundException('Perfil de facturación no encontrado');

    if (profile.is_default) {
      throw new BadRequestException(
        'No puedes eliminar el perfil de facturación por defecto. Asigna otro como predeterminado primero.',
      );
    }

    return this.prisma.billingProfile.delete({ where: { id: profileId } });
  }

  async setDefaultBillingProfile(userId: string, profileId: string) {
    const profile = await this.prisma.billingProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile || profile.user_id !== userId)
      throw new NotFoundException('Perfil de facturación no encontrado');

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
