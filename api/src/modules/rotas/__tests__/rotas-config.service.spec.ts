import type { AuthUser } from '../../../common/auth/auth-user';
import type { PrismaService } from '../../../common/database/prisma.service';
import { CONFIG_ALERTAS_PADRAO } from '../../../domain/alerta-rules';
import { CONFIG_MODO_PADRAO, PRESETS_MODO } from '../../../domain/modo-campo-rules';
import { CONFIG_ROTA_PADRAO } from '../../../domain/rota-rules';
import { RotasConfigService } from '../rotas-config.service';
import { AGORA, fakePrisma } from './fixtures';

const ADMIN: AuthUser = { id: '00000000-0000-4000-8000-0000000000dd', email: 'a@a.com', name: 'A', is_admin: true };
const falha = async (f: () => Promise<unknown>) => f().then(() => null, (e: unknown) => e);

describe('RotasConfigService', () => {
  it('sem linha no banco: devolve os padrões e nenhum autor', async () => {
    const s = new RotasConfigService(fakePrisma() as unknown as PrismaService);
    // Lote A da Lovable: + raio_checkin_m (aditivo, contrato §23.1).
    expect(await s.view()).toEqual({ ...CONFIG_ROTA_PADRAO, ...CONFIG_ALERTAS_PADRAO, ...CONFIG_MODO_PADRAO, raio_checkin_m: 200, presets: PRESETS_MODO, confirmation_rule: 'activated', atualizado_por: null, atualizado_em: null });
  });

  it('PUT parcial: mescla, grava quem/quando e preserva chaves de outras fases', async () => {
    const p = fakePrisma();
    p.app_settings.findUnique.mockResolvedValue({ field_config: { meta_diaria: 25, inatividade_min: 30 } });
    const s = new RotasConfigService(p as unknown as PrismaService);
    await s.atualizar({ minutos_por_visita: 10 }, ADMIN, AGORA);
    const gravado = p.app_settings.upsert.mock.calls[0][0].update.field_config;
    expect(gravado).toMatchObject({ meta_diaria: 25, minutos_por_visita: 10, inatividade_min: 30, atualizado_por: ADMIN.id, atualizado_em: AGORA.toISOString() });
  });

  it('valor fora da faixa ou horários incoerentes → 400 e nada gravado', async () => {
    const p = fakePrisma();
    const s = new RotasConfigService(p as unknown as PrismaService);
    const e = await falha(() => s.atualizar({ almoco_inicio: '08:00' }, ADMIN, AGORA));
    expect((e as { getStatus: () => number }).getStatus()).toBe(400);
    expect(p.app_settings.upsert).not.toHaveBeenCalled();
  });

  it('F5: PUT mistura chaves da rota e de alertas; grava as duas e valida cada uma', async () => {
    const p = fakePrisma();
    const s = new RotasConfigService(p as unknown as PrismaService);
    await s.atualizar({ meta_diaria: 20, alerta_ritmo_atras: 3, dias_trabalho: [5, 2] }, ADMIN, AGORA);
    expect(p.app_settings.upsert.mock.calls[0][0].update.field_config).toMatchObject({ meta_diaria: 20, alerta_ritmo_atras: 3, dias_trabalho: [2, 5] });
    const p2 = fakePrisma();
    const e = await falha(() => new RotasConfigService(p2 as unknown as PrismaService).atualizar({ alerta_ritmo_atras: 0 }, ADMIN, AGORA));
    expect((e as { getStatus: () => number }).getStatus()).toBe(400);
    expect(p2.app_settings.upsert).not.toHaveBeenCalled();
  });

  it('F5: limiares ausentes caem no padrão e alertas() lê só as chaves de alerta', async () => {
    const p = fakePrisma();
    p.app_settings.findUnique.mockResolvedValue({ field_config: { alerta_sem_registro_min: 45 } });
    const s = new RotasConfigService(p as unknown as PrismaService);
    expect(await s.alertas()).toEqual({ ...CONFIG_ALERTAS_PADRAO, alerta_sem_registro_min: 45 });
  });

  it('F7: confirmation_rule é validada, gravada com as demais e padrão é activated', async () => {
    const p = fakePrisma();
    p.app_settings.findUnique.mockResolvedValue({ field_config: { meta_diaria: 25 } });
    const s = new RotasConfigService(p as unknown as PrismaService);
    expect((await s.cadastro()).confirmation_rule).toBe('activated');
    await s.atualizar({ confirmation_rule: 'first_vacancy' }, ADMIN, AGORA);
    expect(p.app_settings.upsert.mock.calls[0][0].update.field_config).toMatchObject({ meta_diaria: 25, confirmation_rule: 'first_vacancy' });
    const p2 = fakePrisma();
    const e = await falha(() => new RotasConfigService(p2 as unknown as PrismaService).atualizar({ confirmation_rule: 'qualquer' }, ADMIN, AGORA));
    expect((e as { getStatus: () => number }).getStatus()).toBe(400);
    expect(p2.app_settings.upsert).not.toHaveBeenCalled();
  });

  describe('Modo do chefe (§31.3)', () => {
    it('PUT só com chaves do modo: grava SÓ as enviadas (não grava o padrão das outras) e preserva o resto', async () => {
      const p = fakePrisma();
      p.app_settings.findUnique.mockResolvedValue({ field_config: { meta_diaria: 25 } });
      const s = new RotasConfigService(p as unknown as PrismaService);
      const v = await s.atualizar({ fluxo_visita: 'simples', desfazer_segundos: 5 }, ADMIN, AGORA);
      const gravado = p.app_settings.upsert.mock.calls[0][0].update.field_config;
      expect(gravado).toMatchObject({ meta_diaria: 25, fluxo_visita: 'simples', desfazer_segundos: 5 });
      expect(gravado).not.toHaveProperty('justificativa_distancia');
      expect(gravado).not.toHaveProperty('contato_obrigatorio_em');
      expect(v).toBeDefined();
    });
    it('fluxo_visita null = "sem escolha" é gravado como null', async () => {
      const p = fakePrisma();
      const s = new RotasConfigService(p as unknown as PrismaService);
      await s.atualizar({ fluxo_visita: null }, ADMIN, AGORA);
      expect(p.app_settings.upsert.mock.calls[0][0].update.field_config).toMatchObject({ fluxo_visita: null });
    });
    it('subconjunto inválido ou fora da faixa → 400 e nada gravado', async () => {
      const p = fakePrisma();
      const s = new RotasConfigService(p as unknown as PrismaService);
      for (const dto of [{ contato_obrigatorio_em: ['fechado'] }, { desfazer_segundos: 31 }, { contato_campos: ['nome', 'nome'] }]) {
        const e = await falha(() => s.atualizar(dto as never, ADMIN, AGORA));
        expect((e as { getStatus: () => number }).getStatus()).toBe(400);
      }
      expect(p.app_settings.upsert).not.toHaveBeenCalled();
    });
    it('alerta de divergência (§32.7): valores gravados, null vale como ausente (o web reenvia o que recebeu), fora da faixa = 400', async () => {
      const p = fakePrisma();
      p.app_settings.findUnique.mockResolvedValue({ field_config: { divergencia_alerta_min: 7 } });
      const s = new RotasConfigService(p as unknown as PrismaService);
      await s.atualizar({ divergencia_alerta_min: null, divergencia_alerta_pct: 50 } as never, ADMIN, AGORA);
      const gravado = p.app_settings.upsert.mock.calls[0][0].update.field_config;
      expect(gravado).toMatchObject({ divergencia_alerta_min: 7, divergencia_alerta_pct: 50 }); // o null não apagou o 7
      for (const dto of [{ divergencia_alerta_min: 0 }, { divergencia_alerta_pct: 101 }]) {
        const e = await falha(() => s.atualizar(dto as never, ADMIN, AGORA));
        expect((e as { getStatus: () => number }).getStatus()).toBe(400);
      }
      expect((await new RotasConfigService(fakePrisma() as unknown as PrismaService).modo()).divergencia_alerta_min).toBe(5);
    });
    it('modo() lê o padrão da spec quando não há nada salvo', async () => {
      const s = new RotasConfigService(fakePrisma() as unknown as PrismaService);
      expect(await s.modo()).toEqual(CONFIG_MODO_PADRAO);
    });
  });

  describe('Restante da Lovable — raio do check-in (§23.1, L0)', () => {
    it('padrão 200 sem nada gravado; PUT grava SÓ a chave enviada; null vale como ausente', async () => {
      expect((await new RotasConfigService(fakePrisma() as unknown as PrismaService).checkin()).raio_checkin_m).toBe(200);
      const p = fakePrisma();
      p.app_settings.findUnique.mockResolvedValue({ field_config: { meta_diaria: 25, raio_checkin_m: 300 } });
      const s = new RotasConfigService(p as unknown as PrismaService);
      await s.atualizar({ raio_checkin_m: null, minutos_por_visita: 9 } as never, ADMIN, AGORA);
      expect(p.app_settings.upsert.mock.calls[0][0].update.field_config).toMatchObject({ raio_checkin_m: 300, minutos_por_visita: 9 });
      const p2 = fakePrisma();
      await new RotasConfigService(p2 as unknown as PrismaService).atualizar({ fluxo_visita: 'simples' }, ADMIN, AGORA);
      expect(p2.app_settings.upsert.mock.calls[0][0].update.field_config).not.toHaveProperty('raio_checkin_m');
      const p3 = fakePrisma();
      await new RotasConfigService(p3 as unknown as PrismaService).atualizar({ raio_checkin_m: 150 } as never, ADMIN, AGORA);
      expect(p3.app_settings.upsert.mock.calls[0][0].update.field_config).toMatchObject({ raio_checkin_m: 150 });
    });
    it('fora de 50–1000 → 400 e nada gravado', async () => {
      const p = fakePrisma();
      const s = new RotasConfigService(p as unknown as PrismaService);
      for (const dto of [{ raio_checkin_m: 49 }, { raio_checkin_m: 1001 }, { raio_checkin_m: 10.5 }]) {
        const e = await falha(() => s.atualizar(dto as never, ADMIN, AGORA));
        expect((e as { getStatus: () => number }).getStatus()).toBe(400);
      }
      expect(p.app_settings.upsert).not.toHaveBeenCalled();
    });
  });
});
