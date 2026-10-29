import { CRM_DESLIGADAS } from '../../../common/flags/crm.flags';
import { RotasConfigController } from '../rotas-equipe.controller';

const view = { cidade: 'Jundiaí' };
const config = { view: jest.fn(async () => view) } as any;

describe('GET /v1/consultores/settings/config: features do CRM (contrato §47.1)', () => {
  it('sem o provedor ou com as chaves desligadas: crm_tasks e crm_auto_leads false (sempre presentes)', async () => {
    for (const ctrl of [
      new RotasConfigController(config),
      new RotasConfigController(config, undefined, undefined, undefined, undefined, undefined, undefined, undefined, CRM_DESLIGADAS),
    ]) {
      const r = await ctrl.get();
      expect(r.features).toMatchObject({ crm_tasks: false, crm_auto_leads: false });
    }
  });

  it('o resto de features não muda: as chaves antigas continuam, e só as duas novas se somam', async () => {
    const antes = Object.keys((await new RotasConfigController(config).get()).features).filter((k) => !k.startsWith('crm_'));
    expect(antes).toEqual([
      'dashboard', 'day_summary', 'map_pins', 'checklist', 'breaks', 'segments', 'vouchers', 'voucher_coupons', 'route_plans', 'malls',
      'password_policy', 'consultant_profile', 'contact_email', 'team_gestor', 'multi_praca', 'commercial', 'routes', 'earnings', 'payouts', 'declared_signups',
    ]);
  });

  it('ligadas: cada chave reflete a sua; as outras três não aparecem', async () => {
    const ctrl = new RotasConfigController(config, undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
      ...CRM_DESLIGADAS, tasks: true, auto_lost: true,
    });
    const f = (await ctrl.get()).features as Record<string, boolean>;
    expect(f.crm_tasks).toBe(true);
    expect(f.crm_auto_leads).toBe(false);
    expect(Object.keys(f)).not.toContain('crm_auto_lost');
    expect(await ctrl.get()).toMatchObject(view);
  });
});
