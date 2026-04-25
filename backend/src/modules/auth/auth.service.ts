import { Injectable } from '@nestjs/common';
import { AuthLoginService } from './auth-login.service';
import { AuthRegisterService } from './auth-register.service';
import { AuthTokenService } from './auth-token.service';
import { AuthRecoveryService } from './auth-recovery.service';
import {
  RegisterDto,
  LoginDto,
  Verify2faDto,
  ResetPasswordDto,
} from './dto/auth.dto';

/* ═══════════════════════════════════════
   AuthService — Facade
   Delegates to domain sub-services per
   ARCHITECTURE.md Regla 15 (max 300 lines).

   Split:
     auth-login.service.ts    → login, verify2fa, handleFailedLogin
     auth-register.service.ts → register, verifyEmail, resendVerification
     auth-token.service.ts    → issueTokens, refresh, logout, sessions, getMe
     auth-recovery.service.ts → forgotPassword, resetPassword
   ═══════════════════════════════════════ */

@Injectable()
export class AuthService {
  constructor(
    private readonly loginService: AuthLoginService,
    private readonly registerService: AuthRegisterService,
    private readonly tokenService: AuthTokenService,
    private readonly recoveryService: AuthRecoveryService,
  ) {}

  /* ── Login ── */
  login(dto: LoginDto, ip: string, userAgent?: string) {
    return this.loginService.login(dto, ip, userAgent);
  }

  verify2fa(dto: Verify2faDto, ip: string, userAgent?: string) {
    return this.loginService.verify2fa(dto, ip, userAgent);
  }

  /* ── Register ── */
  register(dto: RegisterDto, ip: string, userAgent?: string) {
    return this.registerService.register(dto, ip, userAgent);
  }

  verifyEmail(token: string) {
    return this.registerService.verifyEmail(token);
  }

  resendVerification(email: string) {
    return this.registerService.resendVerification(email);
  }

  /* ── Tokens & Sessions ── */
  refresh(refreshToken: string, ip: string) {
    return this.tokenService.refresh(refreshToken, ip);
  }

  logout(userId: string, accessToken: string) {
    return this.tokenService.logout(userId, accessToken);
  }

  getSessions(userId: string) {
    return this.tokenService.getSessions(userId);
  }

  revokeSession(userId: string, sessionId: string) {
    return this.tokenService.revokeSession(userId, sessionId);
  }

  getMe(userId: string) {
    return this.tokenService.getMe(userId);
  }

  /* ── Recovery ── */
  forgotPassword(email: string, ip: string) {
    return this.recoveryService.forgotPassword(email, ip);
  }

  resetPassword(dto: ResetPasswordDto) {
    return this.recoveryService.resetPassword(dto);
  }
}
