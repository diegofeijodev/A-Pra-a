import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { chaveNomeArea, validarArea } from '../../domain/area-rules';
import { violouUnico } from '../campo/prisma-errors';
import { CreateAreaDto, UpdateAreaDto } from './dto/areas.dto';

export interface AreaView {
  id: string;
  praca_id: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  active: boolean;
  created_at: string;
}

type AreaRow = {
  id: string;
  praca_id: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  active: boolean;
  created_at: Date;
};

const naoEncontrada = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Área não encontrada.' });
const pracaNaoEncontrada = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
const nomeEmUso = () =>
  new ConflictException({ code: 'AREA_NAME_TAKEN', message: 'Já existe uma área com esse nome nesta praça.' });

function assertValida(a: { lat: number; lng: number; radius_m: number }) {
  const erro = validarArea(a);
  if (erro) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: erro });
}

/**
 * Áreas de atuação do campo (§21). Toda operação filtra por `id` E `praca_id`:
 * área de outra praça é 404, nunca vaza.
 */
@Injectable()
export class AreasService {
  constructor(private readonly prisma: PrismaService) {}

  async list(pracaId: string): Promise<AreaView[]> {
    await this.assertPraca(pracaId);
    const rows = await this.prisma.field_areas.findMany({
      where: { praca_id: pracaId },
      orderBy: { created_at: 'asc' },
    });
    return rows.map(toView);
  }

  async create(dto: CreateAreaDto, user: AuthUser): Promise<AreaView> {
    await this.assertPraca(dto.praca_id);
    assertValida(dto);
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'name: informe o nome da área.' });
    }
    const name_key = chaveNomeArea(name);
    await this.assertNomeLivre(dto.praca_id, name_key);
    try {
      const row = await this.prisma.field_areas.create({
        data: {
          praca_id: dto.praca_id,
          name,
          name_key,
          lat: dto.lat,
          lng: dto.lng,
          radius_m: dto.radius_m,
          created_by: user.id,
        },
      });
      return toView(row);
    } catch (e) {
      if (violouUnico(e)) throw nomeEmUso();
      throw e;
    }
  }

  async update(id: string, pracaId: string, dto: UpdateAreaDto): Promise<AreaView> {
    const atual = await this.findOrFail(id, pracaId);
    const final = {
      lat: dto.lat ?? atual.lat,
      lng: dto.lng ?? atual.lng,
      radius_m: dto.radius_m ?? atual.radius_m,
    };
    assertValida(final);

    let nome: { name: string; name_key: string } | undefined;
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'name: informe o nome da área.' });
      }
      nome = { name, name_key: chaveNomeArea(name) };
      await this.assertNomeLivre(pracaId, nome.name_key, id);
    }

    try {
      // `updateMany` com `praca_id` no filtro: a escrita também é escopada.
      const { count } = await this.prisma.field_areas.updateMany({
        where: { id, praca_id: pracaId },
        data: { ...nome, ...final, active: dto.active },
      });
      if (count === 0) throw naoEncontrada();
    } catch (e) {
      if (violouUnico(e)) throw nomeEmUso();
      throw e;
    }
    return toView(await this.findOrFail(id, pracaId));
  }

  // ── internos ────────────────────────────────────────────────
  private async assertPraca(pracaId: string): Promise<void> {
    if (!isUuid(pracaId)) throw pracaNaoEncontrada();
    const praca = await this.prisma.pracas.findUnique({ where: { id: pracaId }, select: { id: true } });
    if (!praca) throw pracaNaoEncontrada();
  }

  private async findOrFail(id: string, pracaId: string): Promise<AreaRow> {
    if (!isUuid(id) || !isUuid(pracaId)) throw naoEncontrada();
    const row = await this.prisma.field_areas.findFirst({ where: { id, praca_id: pracaId } });
    if (!row) throw naoEncontrada();
    return row;
  }

  private async assertNomeLivre(pracaId: string, nameKey: string, exceptId?: string): Promise<void> {
    const outra = await this.prisma.field_areas.findFirst({
      where: { praca_id: pracaId, name_key: nameKey, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (outra) throw nomeEmUso();
  }
}

function toView(r: AreaRow): AreaView {
  return {
    id: r.id,
    praca_id: r.praca_id,
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    radius_m: r.radius_m,
    active: r.active,
    created_at: r.created_at.toISOString(),
  };
}
