import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class MunicipiosQueryDto {
  // "@IsString() @Length(2,2) é o bastante" (brief da tarefa) — não valida
  // maiúsculas: uma UF em minúsculo simplesmente não bate com nenhum
  // município (o Map só guarda os códigos do IBGE, sempre maiúsculos).
  @IsString()
  @Length(2, 2)
  uf!: string;
}

export class VizinhasQueryDto {
  // Sem `@Type(() => Number)` a string da query nunca vira number e o
  // `@IsInt()` derruba tudo com VALIDATION_ERROR — o `ValidationPipe` global
  // (main.ts) não liga `enableImplicitConversion`.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  km?: number;
}
