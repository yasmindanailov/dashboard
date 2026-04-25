import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { SupportService } from './support.service';
import { CreateGuestChatDto } from './dto/support.dto';
import {
  generateGuestToken,
  GUEST_TOKEN_COOKIE_NAME,
  getGuestTokenCookieOptions,
} from '../../core/common/utils/guest-token.util';
import { ConfigService } from '@nestjs/config';

/**
 * ═══════════════════════════════════════
 * SupportGuestController — Anonymous chat endpoints
 * ═══════════════════════════════════════
 *
 * These endpoints do NOT require JWT authentication.
 * They are protected by:
 *   1. Aggressive rate limiting (3 chats/hour/IP — ROADMAP.md 7.4.3)
 *   2. Guest session tokens stored in HttpOnly cookies
 *   3. Input validation via class-validator (whitelist + forbidNonWhitelisted)
 *
 * Security model:
 *   - No access to user data, system config, or any authenticated resources
 *   - Guest can only access their own conversation via the cookie token
 *   - The token hash is stored in conversations.guest_session_hash
 *   - The raw token is only in the HttpOnly cookie (never in localStorage)
 *
 * Ref: ROADMAP.md 7.4.1-7.4.3, DECISIONS.md §38
 */

@ApiTags('Support (Guest)')
@Controller('support')
@UseGuards(ThrottlerGuard)
export class SupportGuestController {
  private readonly logger = new Logger(SupportGuestController.name);

  constructor(
    private readonly supportService: SupportService,
    private readonly config: ConfigService,
  ) {}

  /**
   * POST /support/chats/guest
   *
   * Creates a new anonymous chat conversation from the landing page.
   *
   * Flow:
   *   1. Validate input (guest_name required, guest_email optional, body required)
   *   2. Generate guest session token (32 bytes random + SHA-256 hash)
   *   3. Create conversation with guest fields (no user_id)
   *   4. Create first message (sender_type = 'client')
   *   5. Set HttpOnly cookie with the raw token
   *   6. Return conversation data
   *
   * Rate limiting: 3 requests per hour per IP (aggressive for guest endpoint)
   */
  @Post('chats/guest')
  @Throttle({ default: { ttl: 3600000, limit: 3 } }) // 3 chats per hour per IP
  @ApiOperation({
    summary: 'Create anonymous chat from landing (no auth required)',
  })
  async createGuestChat(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: CreateGuestChatDto,
  ) {
    // Normalize email to lowercase if provided (same pattern as auth.service.ts)
    if (dto.guest_email) {
      dto.guest_email = dto.guest_email.toLowerCase().trim();
    }

    // Generate guest token
    const { token, hash } = generateGuestToken();

    // Create the conversation and first message
    const conversation = await this.supportService.createGuestChat(dto, hash);

    // Set HttpOnly cookie with the raw token
    const isProduction = this.config.get('NODE_ENV') === 'production';
    res.cookie(
      GUEST_TOKEN_COOKIE_NAME,
      token,
      getGuestTokenCookieOptions(isProduction),
    );

    this.logger.log(
      `Guest chat created: ${conversation.id} (name: ${dto.guest_name}, email: ${dto.guest_email || 'not provided'})`,
    );

    return {
      conversation_id: conversation.id,
      subject: conversation.subject,
      created_at: conversation.created_at,
      message: 'Chat creado correctamente.',
    };
  }
}
