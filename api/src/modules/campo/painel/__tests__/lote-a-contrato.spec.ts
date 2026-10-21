/**
 * Lição da S1 (lote A da Lovable): o que o web ATUAL manda continua valendo, e os campos novos nulos não geram 422/400.
 * Os payloads passam pelo mesmo `ValidationPipe` global (`whitelist + forbidNonWhitelisted + transform`).
 */
import { ValidationPipe } from '@nestjs/common';
import type { AuthUser } from '../../../../common/auth/auth-user';
import type { PrismaService } from '../../../../common/database/prisma.service';
import { ConfigRotaDto } from '../../../rotas/dto/rotas.dto';
import { RotasConfigService } from '../../../rotas/rotas-config.service';
import { PinosCampoQueryDto, PinosQueryDto } from '../../pinos/pinos.dto';
import { PainelQueryDto, ResumoDiaQueryDto } from '../painel.dto';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
const corpo = (metatype: new () => object, body: unknown) => pipe.transform(body, { type: 'body', metatype });
const query = (metatype: new () => object, q: unknown) => pipe.transform(q, { type: 'query', metatype });

const ROTA = { meta_diaria: 30, janela_inicio: '09:00', janela_fim: '18:00', almoco_inicio: '12:00', almoco_fim: '13:00', minutos_por_visita: 8, velocidade_kmh: 4.5, fator_desvio: 1.3, pool_fator: 1.5, dias_sem_revisitar: 14, estagio_maximo_rota: 4, gerar_ao_iniciar: false, consultor_pode_gerar: false };
const MODO = { fluxo_visita: null, justificativa_distancia: 'opcional', contato_obrigatorio_em: ['cadastrou', 'retorno'], contato_campos: ['nome', 'cargo', 'telefone'], fechado_conta_na_meta: true, desfazer_segundos: 8, divergencia_alerta_min: 5, divergencia_alerta_pct: 40 };
const ALERTAS = { alerta_inicio_apos_min: 30, alerta_visita_aberta_min: 40, alerta_sem_registro_min: 30, alerta_ritmo_atras: 5, alerta_parada_vencida_min: 30, dias_trabalho: [1, 2, 3, 4, 5, 6], retornos_no_roteiro: true };
const NOVAS_NULAS = { raio_checkin_m: null, ui_resumo_dia: null, nota_peso_rota: null, nota_peso_conversao: null, nota_meta_conversao_pct: null, nota_intervalo_alerta_min: null, painel_tempo_medio: null, painel_gap_max_min: null };
const ADMIN: AuthUser = { id: '00000000-0000-4000-8000-0000000000dd', email: 'a@a.com', name: 'A', is_admin: true };

describe('PUT settings/config: corpos do web atual e do novo', () => {
  it('os três formulários de hoje (rota, modo, alertas) passam sem as chaves novas e com elas nulas', async () => {
    for (const b of [ROTA, MODO, ALERTAS]) {
      await expect(corpo(ConfigRotaDto, b)).resolves.toBeDefined();
      await expect(corpo(ConfigRotaDto, { ...b, ...NOVAS_NULAS })).resolves.toBeDefined();
    }
  });
  it('o formulário novo (raio + nota + painel) passa; fora da faixa é recusado', async () => {
    const novo = { raio_checkin_m: 200, ui_resumo_dia: 'nota', nota_peso_rota: 7, nota_peso_conversao: 3, nota_meta_conversao_pct: 30, nota_intervalo_alerta_min: 75, painel_tempo_medio: 'intervalo', painel_gap_max_min: 120 };
    await expect(corpo(ConfigRotaDto, novo)).resolves.toBeDefined();
    await expect(corpo(ConfigRotaDto, { raio_checkin_m: 200 })).resolves.toBeDefined();
    for (const ruim of [{ raio_checkin_m: 10 }, { ui_resumo_dia: 'grafico' }, { nota_peso_rota: 11 }, { painel_tempo_medio: 'x' }, { painel_gap_max_min: 5 }]) {
      await expect(corpo(ConfigRotaDto, ruim)).rejects.toBeDefined();
    }
  });
  it('no serviço: corpo do modo com as novas nulas não grava nada novo nem dá 400', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = { app_settings: { findUnique: jest.fn().mockResolvedValue({ field_config: {} }), upsert } };
    const s = new RotasConfigService(prisma as unknown as PrismaService);
    await s.atualizar({ ...MODO, ...NOVAS_NULAS } as never, ADMIN);
    const gravado = upsert.mock.calls[0][0].update.field_config;
    for (const k of Object.keys(NOVAS_NULAS)) expect(gravado).not.toHaveProperty(k);
  });
});

describe('queries novas', () => {
  it('painel e resumo: dias e praça', async () => {
    await expect(query(PainelQueryDto, {})).resolves.toBeDefined();
    await expect(query(PainelQueryDto, { from: '2026-10-15', to: '2026-10-21', praca_id: '00000000-0000-4000-8000-0000000000aa' })).resolves.toBeDefined();
    await expect(query(PainelQueryDto, { from: '2026-02-30' })).rejects.toBeDefined();
    await expect(query(PainelQueryDto, { praca_id: 'x' })).rejects.toBeDefined();
    await expect(query(ResumoDiaQueryDto, { day: '2026-10-21' })).resolves.toBeDefined();
    await expect(query(ResumoDiaQueryDto, { day: 'hoje' })).rejects.toBeDefined();
  });
  it('pinos: limite 1–2000 (texto da URL vira número), cursor uuid, modo fechado', async () => {
    await expect(query(PinosQueryDto, { mode: 'estagio', limit: '2000', cursor: '00000000-0000-4000-8000-000000000001' })).resolves.toMatchObject({ limit: 2000 });
    for (const ruim of [{ limit: '2001' }, { limit: '0' }, { cursor: 'x' }, { mode: 'calor' }, { extra: 1 }]) await expect(query(PinosQueryDto, ruim)).rejects.toBeDefined();
    await expect(query(PinosCampoQueryDto, { praca_id: '00000000-0000-4000-8000-0000000000aa' })).rejects.toBeDefined();
  });
});
