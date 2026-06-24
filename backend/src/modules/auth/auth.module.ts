import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthLoginService } from './auth-login.service';
import { AuthRegisterService } from './auth-register.service';
import { AuthTokenService } from './auth-token.service';
import { AuthRecoveryService } from './auth-recovery.service';
import { AuthAccountService } from './auth-account.service';
import { AuthController } from './auth.controller';
import { AccountController } from './account.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController, AccountController],
  providers: [
    AuthService,
    AuthLoginService,
    AuthRegisterService,
    AuthTokenService,
    AuthRecoveryService,
    AuthAccountService,
    JwtStrategy,
    JwtAuthGuard,
  ],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
