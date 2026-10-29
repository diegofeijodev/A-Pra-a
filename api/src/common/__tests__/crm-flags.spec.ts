import { CRM_DESLIGADAS, lerFlagsCrm } from '../flags/crm.flags';

const BASE = { DATABASE_URL: 'postgresql://praca:praca@localhost:5437/praca', JWT_SECRET: 'x'.repeat(16) };
const ler = (extra: Record<string, unknown> = {}) => lerFlagsCrm({ ...BASE, ...extra });

describe('flags do CRM automático (contrato §47)', () => {
  it('tudo desligado sem variável', () =>
    expect(ler()).toEqual({
      tasks: false,
      auto_leads: false,
      auto_stages: false,
      auto_lost: false,
      freela_pipeline: false,
    }));

  it('cada chave liga só a sua', () => {
    expect(ler({ CRM_TASKS_ENABLED: 'true' }).tasks).toBe(true);
    expect(ler({ CRM_AUTO_LEADS_FROM_SEARCH_ENABLED: 'true' })).toMatchObject({
      auto_leads: true,
      tasks: false,
    });
    expect(ler({ CRM_AUTO_STAGES_ENABLED: 'true' }).auto_stages).toBe(true);
    expect(ler({ CRM_AUTO_LOST_ENABLED: 'true' }).auto_lost).toBe(true);
    expect(ler({ CRM_FREELA_PIPELINE_ENABLED: 'true' }).freela_pipeline).toBe(true);
  });

  it('"1" ou "yes" não ligam', () => {
    expect(ler({ CRM_TASKS_ENABLED: '1' }).tasks).toBe(false);
    expect(ler({ CRM_TASKS_ENABLED: 'yes' }).tasks).toBe(false);
  });

  it('CRM_DESLIGADAS congelado', () => expect(Object.isFrozen(CRM_DESLIGADAS)).toBe(true));
});
