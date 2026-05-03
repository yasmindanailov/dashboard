import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../core/database/prisma.service';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: string; // role slug
  // 'ws' añadido en Sprint 13 §13.AUTH Fase A (2026-05-03): token efímero
  // (60 segundos) usado por el browser para handshake socket.io. Cookie
  // httpOnly Next.js no es accesible al socket.io-client del cliente JS, así
  // que un Server Action lee la cookie server-side y devuelve este token
  // corto al cliente. El gateway `SupportGatewayAuth.authenticateWithJwt`
  // sigue verificando el JWT estándar; este flag solo se usa en `validate()`
  // para rechazar el token si llega vía Authorization header al backend
  // (donde solo se aceptan tokens type='access').
  type: 'access' | 'refresh' | 'temp_2fa' | 'ws';
  /**
   * JWT ID — UUID v4 random (RFC 7519 §4.1.7) emitido en cada token. Sprint
   * 13 §13.AUTH Fase B smoke test (2026-05-03) descubrió que sin `jti`, dos
   * tokens emitidos en el mismo segundo con idéntico payload (login + refresh
   * inmediato del mismo user) producen el MISMO JWT (determinístico sobre
   * `header + payload + iat` con resolución segundos), causando colisión en
   * el índice UNIQUE `sessions.token_hash`. Con `jti` random, cada token es
   * único independientemente del timing.
   *
   * NO se valida en `validate()` — informativo + diferenciador. Si en el
   * futuro se quiere revocar tokens individuales por jti (ej. blacklist),
   * la pieza ya está disponible.
   */
  jti?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET environment variable is not set');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.status === 'blocked') {
      throw new UnauthorizedException('Account is blocked');
    }

    if (user.status === 'inactive') {
      throw new UnauthorizedException('Account is inactive');
    }

    return {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      status: user.status,
      role: user.role,
      partner_id: user.partner_id,
      email_verified_at: user.email_verified_at,
    };
  }
}
