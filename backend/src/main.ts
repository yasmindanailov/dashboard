// Sentry DEBE inicializarse antes de cualquier otro import. No mover de sitio.
import './instrument';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './core/common/filters/global-exception.filter';
import { PrismaService } from './core/database/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // ── Security ──
  app.use(helmet());
  // Sprint 13 §13.AUTH Fase A (2026-05-03): cookie-parser activo. Cierra el
  // bug latente del flow `/auth/refresh` que ya leía `req.cookies` desde Sprint
  // 9.6 sin middleware registrado. Cubre además la guest cookie del módulo
  // support (`GUEST_TOKEN_COOKIE_NAME`) que hasta ahora vivía solo en el
  // endpoint específico y dependía de Express raw cookies parser implícito.
  // Compatible con la doctrina ADR-078 Amendment A1 (Modelo A): aunque las
  // cookies httpOnly del JWT viven en dominio Next.js (no aquí), este parser
  // es necesario para futuros flows tipo guest, callbacks de plugins externos
  // (Sprint 15B Stripe webhook), y robustez general del parsing de cookies.
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002',
    credentials: true,
  });

  // ── Global prefix ──
  app.setGlobalPrefix('api/v1');

  // ── Validation ──
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Global exception filter ──
  const prisma = app.get(PrismaService);
  app.useGlobalFilters(new GlobalExceptionFilter(prisma));

  // ── Swagger ──
  const config = new DocumentBuilder()
    .setTitle('Aelium Dashboard API')
    .setDescription('API del dashboard de billing, soporte y gestión de Aelium')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/v1/docs', app, document);

  // ── Graceful shutdown ──
  app.enableShutdownHooks();

  // ── Start ──
  const port = process.env.PORT || 3001;
  await app.listen(port);
  logger.log(`🚀 Aelium API running on http://localhost:${port}/api/v1`);
  logger.log(`📚 Swagger docs at http://localhost:${port}/api/v1/docs`);
}
bootstrap().catch((err: unknown) => {
  // main.ts: crash visible directamente en stderr (es el único punto sin logger)
  console.error('Fatal startup error:', err);
  process.exit(1);
});
