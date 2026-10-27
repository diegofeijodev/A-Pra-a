/** Casca da Lovable (contrato §46): as `features` de navegação do `GET settings/config` são aditivas e desligadas por padrão. */
import { UI_DESLIGADAS, lerFlagsUi } from '../flags/ui.flags';
import { RotasConfigController } from '../../modules/rotas/rotas-equipe.controller';

const BASE = { DATABASE_URL: 'postgresql://praca:praca@localhost:5437/praca', JWT_SECRET: 'x'.repeat(16) };
const CHAVES = ['commercial', 'routes', 'earnings', 'payouts', 'declared_signups'] as const;

/** O controller como o Nest monta: as 6 dependências opcionais dos lotes A–F2 ausentes e as flags de navegação por último. */
const controller = (ui?: typeof UI_DESLIGADAS) =>
  new RotasConfigController({ view: jest.fn().mockResolvedValue({ raio_checkin_m: 200 }) } as never, undefined, undefined, undefined, undefined, undefined, undefined, ui);

describe('GET settings/config: features de navegação (§46.2)', () => {
  it('sem o provedor (servidor montado à mão): as cinco chaves existem e valem false', async () => {
    const r = await controller().get();
    for (const k of CHAVES) expect(r.features[k]).toBe(false);
    // O resto da resposta não muda (a configuração e as features dos lotes anteriores continuam lá).
    expect(r).toMatchObject({ raio_checkin_m: 200, features: { dashboard: false, map_pins: false, vouchers: false, team_gestor: false, multi_praca: false } });
  });

  it('padrão do ambiente: tudo desligado', async () => {
    const r = await controller(lerFlagsUi(BASE)).get();
    expect(Object.fromEntries(CHAVES.map((k) => [k, r.features[k]]))).toEqual(UI_DESLIGADAS);
  });

  it('com as flags: cada chave segue a sua; Pix e declarados só com a remuneração', async () => {
    const t = 'true';
    const tudo = await controller(
      lerFlagsUi({ ...BASE, TEAM_COMMERCIAL_ENABLED: t, FIELD_ROUTES_ENABLED: t, FIELD_EARNINGS_ENABLED: t, FIELD_PAYOUTS_ENABLED: t, FIELD_DECLARED_SIGNUPS_ENABLED: t }),
    ).get();
    expect(tudo.features).toMatchObject({ commercial: true, routes: true, earnings: true, payouts: true, declared_signups: true });

    const semRemuneracao = await controller(lerFlagsUi({ ...BASE, FIELD_PAYOUTS_ENABLED: t, FIELD_DECLARED_SIGNUPS_ENABLED: t })).get();
    expect(semRemuneracao.features).toMatchObject({ commercial: false, earnings: false, payouts: false, declared_signups: false });

    const soComercial = await controller(lerFlagsUi({ ...BASE, TEAM_COMMERCIAL_ENABLED: t })).get();
    expect(soComercial.features).toMatchObject({ commercial: true, routes: false, earnings: false, payouts: false, declared_signups: false });
  });
});
