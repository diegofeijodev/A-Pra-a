/**
 * Lição da S1 (lote B da Lovable): o que o web ATUAL manda continua valendo e as chaves novas nulas não geram 400/422.
 * Os corpos passam pelo mesmo `ValidationPipe` global (`whitelist + forbidNonWhitelisted + transform`).
 */
import { ValidationPipe } from '@nestjs/common';
import type { AuthUser } from '../../../common/auth/auth-user';
import type { PrismaService } from '../../../common/database/prisma.service';
import { ConfigRotaDto } from '../../rotas/dto/rotas.dto';
import { RotasConfigService } from '../../rotas/rotas-config.service';
import { IntervaloDto } from '../dto/campo.dto';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
const corpo = (metatype: new () => object, body: unknown) => pipe.transform(body, { type: 'body', metatype });
const ADMIN: AuthUser = { id: '00000000-0000-4000-8000-0000000000dd', email: 'a@a.com', name: 'A', is_admin: true };

const NOVAS_B_NULAS = {
  checklist_items: null,
  checklist_obrigatorio: null,
  checklist_fluxos: null,
  checklist_aberto: null,
  intervalo_ativo: null,
  intervalo_lembrete_min: null,
  alerta_intervalo_min: null,
};
const LOTE_A = { raio_checkin_m: 200, ui_resumo_dia: 'nota', nota_peso_rota: 7, nota_peso_conversao: 3, nota_meta_conversao_pct: 30, nota_intervalo_alerta_min: 75, painel_tempo_medio: 'intervalo', painel_gap_max_min: 120 };

describe('PUT settings/config: corpos do web atual e do novo (lote B)', () => {
  it('o formulário do lote A passa sem as chaves novas e com elas nulas; nada novo é gravado', async () => {
    await expect(corpo(ConfigRotaDto, LOTE_A)).resolves.toBeDefined();
    await expect(corpo(ConfigRotaDto, { ...LOTE_A, ...NOVAS_B_NULAS })).resolves.toBeDefined();
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = { app_settings: { findUnique: jest.fn().mockResolvedValue({ field_config: {} }), upsert } };
    await new RotasConfigService(prisma as unknown as PrismaService).atualizar({ ...LOTE_A, ...NOVAS_B_NULAS } as never, ADMIN);
    const gravado = upsert.mock.calls[0][0].update.field_config;
    for (const k of Object.keys(NOVAS_B_NULAS)) expect(gravado).not.toHaveProperty(k);
  });
  it('o formulário novo (checklist + intervalo) passa; fora da faixa é recusado', async () => {
    const novo = {
      checklist_items: [{ id: 'apresentacao', text: 'Apresentação' }, { text: 'Nova' }],
      checklist_obrigatorio: 'todas',
      checklist_fluxos: ['simples'],
      checklist_aberto: false,
      intervalo_ativo: true,
      intervalo_lembrete_min: 60,
      alerta_intervalo_min: 75,
    };
    await expect(corpo(ConfigRotaDto, novo)).resolves.toBeDefined();
    for (const ruim of [{ checklist_obrigatorio: 'sim' }, { checklist_fluxos: ['outro'] }, { alerta_intervalo_min: 5 }, { intervalo_lembrete_min: 481 }, { checklist_items: 'x' }]) {
      await expect(corpo(ConfigRotaDto, ruim)).rejects.toBeDefined();
    }
  });
});

describe('corpo do intervalo (fila break_start/break_end)', () => {
  it('client_id + hora; posição opcional; campo a mais recusado', async () => {
    const c = '11111111-1111-4111-8111-111111111111';
    await expect(corpo(IntervaloDto, { client_id: c, at: '2026-10-22T15:04:00.000Z' })).resolves.toBeDefined();
    await expect(corpo(IntervaloDto, { client_id: c, at: '2026-10-22T15:04:00.000Z', lat: -19.9, lng: -43.9, accuracy: 12 })).resolves.toBeDefined();
    for (const ruim of [{ client_id: 'x', at: '2026-10-22T15:04:00.000Z' }, { client_id: c }, { client_id: c, at: '2026-10-22T15:04:00.000Z', extra: 1 }, { client_id: c, at: '2026-10-22T15:04:00.000Z', lat: 99 }]) {
      await expect(corpo(IntervaloDto, ruim)).rejects.toBeDefined();
    }
  });
});
