import { IsEmail, IsString, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
  @Matches(/[A-Z]/, { message: 'La contraseña debe contener al menos una mayúscula' })
  @Matches(/[a-z]/, { message: 'La contraseña debe contener al menos una minúscula' })
  @Matches(/[0-9]/, { message: 'La contraseña debe contener al menos un número' })
  password: string;
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
  @Matches(/[A-Z]/, { message: 'La contraseña debe contener al menos una mayúscula' })
  @Matches(/[a-z]/, { message: 'La contraseña debe contener al menos una minúscula' })
  @Matches(/[0-9]/, { message: 'La contraseña debe contener al menos un número' })
  password: string;
}
