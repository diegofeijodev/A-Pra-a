import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password!: string;
}

/**
 * `POST /v1/auth/change-password` (contrato §2, redesenho E3): a pessoa logada troca a PRÓPRIA senha. O id vem do token — não há
 * campo de id aqui, e o `forbidNonWhitelisted` recusa um `user_id` no corpo. Sem inicializador (CLAUDE.md).
 */
export class ChangeOwnPasswordDto {
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  current_password!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  new_password!: string;
}
