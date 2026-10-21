/** Fase L0, item 15 (contrato §28.5): "Versão 1 · vale desde 01/01/1970" — correção só de LEITURA (o valor gravado não muda). */
import type { AuthUser } from '../../../../common/auth/auth-user';
import { REGRA_PADRAO, VIGENCIA_INICIAL } from '../../../../domain/earnings-rules';
import type { RotasConfigService } from '../../../rotas/rotas-config.service';
import { EarningsService, versaoView } from '../earnings.service';
import { AGORA, FakeInputs, FakeRepo } from './fakes';

const ADMIN: AuthUser = { id: 'dddddddd-0000-4000-8000-000000000001', email: 'a@x.com', name: 'Diego', is_admin: true };

function montar() {
  const repo = new FakeRepo();
  const config = { cadastro: async () => ({ confirmation_rule: 'activated' as const }) } as unknown as RotasConfigService;
  return { s: new EarningsService(repo, new FakeInputs(), config, { ligado: true, autoClose: false, janelaNaoConfirmadosDias: 45 }), repo };
}

describe('versão inicial da regra (item 15)', () => {
  it('a sentinela continua 1970-01-01 (vigência "desde sempre"); a visão diz is_initial e installed_at', async () => {
    expect(VIGENCIA_INICIAL).toBe('1970-01-01');
    const { s, repo } = montar();
    const c = await s.lerConfig(AGORA);
    expect(c.current).toMatchObject({ version: 1, valid_from: '1970-01-01', is_initial: true, installed_at: repo.versions[0]!.created_at.toISOString() });
    // O valor gravado não é tocado.
    expect(repo.versions[0]!.valid_from).toBe('1970-01-01');
  });

  it('versão nova não é inicial; installed_at = created_at', async () => {
    const { s } = montar();
    const v = await s.salvarConfig({ valid_from: '2026-11-02', config: { ...REGRA_PADRAO } }, ADMIN, AGORA);
    expect(v).toMatchObject({ version: 2, is_initial: false });
    expect(v.installed_at).toBe(v.created_at);
  });

  it('versaoView só acrescenta campos (os antigos continuam iguais)', () => {
    const at = new Date('2026-10-23T03:00:00.000Z');
    const view = versaoView({ version: 1, valid_from: VIGENCIA_INICIAL, config: REGRA_PADRAO, reason: 'Padrão inicial', created_by_name: 'sistema', created_at: at });
    expect(view).toMatchObject({ version: 1, valid_from: '1970-01-01', reason: 'Padrão inicial', created_by: 'sistema', created_at: at.toISOString(), is_initial: true, installed_at: at.toISOString() });
  });
});
