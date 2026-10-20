import type { PrismaService } from '../../../common/database/prisma.service';
import { CONFIG_MODO_PADRAO } from '../../../domain/modo-campo-rules';
import { ModoCampoService } from '../modo-campo.service';
import type { RotasConfigService } from '../rotas-config.service';

const montar = (ligado: boolean, global: 'simples' | 'completo' | null, consultor: string | null) => {
  const prisma = { field_consultants: { findUnique: jest.fn().mockResolvedValue({ visit_flow: consultor }) } };
  const configs = { modo: jest.fn().mockResolvedValue({ ...CONFIG_MODO_PADRAO, fluxo_visita: global }) };
  return new ModoCampoService(prisma as unknown as PrismaService, configs as unknown as RotasConfigService, ligado);
};

describe('ModoCampoService.fluxoDoConsultor (§31.1)', () => {
  it('flag desligada: completo, sem consultar nada', async () => {
    const s = montar(false, 'simples', 'simples');
    expect(s.ligado).toBe(false);
    expect(await s.fluxoDoConsultor('c1')).toBe('completo');
  });
  it('flag ligada: chave ausente = simples; global vale; consultor vale mais que o global', async () => {
    expect(await montar(true, null, null).fluxoDoConsultor('c1')).toBe('simples');
    expect(await montar(true, 'completo', null).fluxoDoConsultor('c1')).toBe('completo');
    expect(await montar(true, 'completo', 'simples').fluxoDoConsultor('c1')).toBe('simples');
    expect(await montar(true, 'simples', 'completo').fluxoDoConsultor('c1')).toBe('completo');
  });
  it('sem a flag injetada (testes antigos): desligado', () => {
    const s = new ModoCampoService({} as never, {} as never);
    expect(s.ligado).toBe(false);
  });
});
