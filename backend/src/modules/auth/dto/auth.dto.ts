import {
  IsEmail,
  IsString,
  MinLength,
  Matches,
  IsOptional,
  IsEnum,
  IsBoolean,
  ValidateIf,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingProfileType } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'Juan' })
  @IsString()
  @MinLength(2)
  first_name: string;

  @ApiProperty({ example: 'García' })
  @IsString()
  @MinLength(2)
  last_name: string;

  @ApiProperty({ example: 'juan@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'MiPassword1' })
  @IsString()
  @MinLength(8)
  @Matches(/[A-Z]/, {
    message: 'La contraseña debe contener al menos una mayúscula',
  })
  @Matches(/[a-z]/, {
    message: 'La contraseña debe contener al menos una minúscula',
  })
  @Matches(/[0-9]/, {
    message: 'La contraseña debe contener al menos un número',
  })
  password: string;

  // ── E11 (registro fiscal) — todos opcionales (backward-compatible). El
  //    perfil de facturación (BillingProfile) se crea solo para autonomo/empresa
  //    [personal no aporta dirección, requerida por el modelo]. Validación
  //    condicional vía @ValidateIf: cuando aplica, el campo es obligatorio. ──

  @ApiPropertyOptional({ example: '+34 600 00 00 00' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ enum: BillingProfileType, default: 'personal' })
  @IsOptional()
  @IsEnum(BillingProfileType)
  account_type?: BillingProfileType;

  @ApiPropertyOptional({ description: 'Obligatorio para empresa' })
  @ValidateIf((o: RegisterDto) => o.account_type === 'empresa')
  @IsString({ message: 'La razón social es obligatoria para empresas.' })
  @MaxLength(200)
  company_name?: string;

  @ApiPropertyOptional({ description: 'Obligatorio para autónomo/empresa' })
  @ValidateIf(
    (o: RegisterDto) =>
      o.account_type === 'autonomo' || o.account_type === 'empresa',
  )
  @IsString({ message: 'El NIF/CIF es obligatorio para autónomos y empresas.' })
  @MaxLength(20)
  nif_cif?: string;

  @ApiPropertyOptional({ description: 'Dirección fiscal (autónomo/empresa)' })
  @ValidateIf(
    (o: RegisterDto) =>
      o.account_type === 'autonomo' || o.account_type === 'empresa',
  )
  @IsString({ message: 'La dirección fiscal es obligatoria.' })
  @MaxLength(255)
  address_line1?: string;

  @ApiPropertyOptional()
  @ValidateIf(
    (o: RegisterDto) =>
      o.account_type === 'autonomo' || o.account_type === 'empresa',
  )
  @IsString({ message: 'La ciudad es obligatoria.' })
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @ValidateIf(
    (o: RegisterDto) =>
      o.account_type === 'autonomo' || o.account_type === 'empresa',
  )
  @IsString({ message: 'El código postal es obligatorio.' })
  @MaxLength(20)
  postal_code?: string;

  @ApiPropertyOptional({ example: 'ES', default: 'ES' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @ApiPropertyOptional({ description: 'Aceptación de términos + privacidad' })
  @IsOptional()
  @IsBoolean()
  terms_accepted?: boolean;
}

export class LoginDto {
  @ApiProperty({ example: 'juan@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'MiPassword1' })
  @IsString()
  password: string;
}

export class Verify2faDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(6)
  code: string;

  @ApiProperty({ description: 'Temporary token from login step 1' })
  @IsString()
  temp_token: string;
}

export class VerifyEmailDto {
  @ApiProperty()
  @IsString()
  token: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'juan@example.com' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty({ example: 'NuevaPassword1' })
  @IsString()
  @MinLength(8)
  @Matches(/[A-Z]/, {
    message: 'La contraseña debe contener al menos una mayúscula',
  })
  @Matches(/[a-z]/, {
    message: 'La contraseña debe contener al menos una minúscula',
  })
  @Matches(/[0-9]/, {
    message: 'La contraseña debe contener al menos un número',
  })
  password: string;
}
