/**
 * Lote F2 (contrato §44.4): o pedido de cupom com `visit_ref` usa a praça da jornada DA VISITA — a fila reenvia depois do `end`
 * daquela jornada (o guard já voltou para a principal). Só com `lead_id`, a praça ativa. Desligada, a de hoje.
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import type { CampoConsultant } from '../../../../common/auth/campo-consultant';
import type { PrismaService } from '../../../../common/database/prisma.service';
import { PracasDoConsultorService } from '../../../../common/pracas/pracas-do-consultor.service';
import type { FlagsLovableC } from '../../../rotas/rotas.tokens';
import { VoucherCouponsService } from '../voucher-coupons.service';
import { VouchersService } from '../vouchers.service';
import { NoopIssuer } from '../vouchers.tokens';
import { RepoFalso } from './fakes';

beforeAll(() => Logger.overrideLogger(false));

const A = '00000000-0000-4000-8000-0000000000aa';
const B = '00000000-0000-4000-8000-0000000000bb';
const LEAD_A = '00000000-0000-4000-8000-00000000a001';
const LEAD_B = '00000000-0000-4000-8000-00000000b001';
const VISITA_B = '00000000-0000-4000-8000-00000000c00b';
const VISITA_B_CLIENT = '00000000-0000-4000-8000-00000000cc0b';
// Depois do `end` da jornada em B: o guard resolve a principal (A).
const ANA_DEPOIS_DO_END: CampoConsultant = { id: '00000000-0000-4000-8000-0000000000a1', name: 'Ana', email: 'ana@x', praca_id: A, must_change_password: false, praca_principal_id: A };
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function montar(ligado: boolean) {
  const flags: FlagsLovableC = { segments: false, vouchers: true, voucher_coupons: false };
  const repo = new RepoFalso();
  const issuer = new NoopIssuer();
  const cupons = new VoucherCouponsService(repo, issuer, flags, false, undefined);
  const pracas = new PracasDoConsultorService({} as PrismaService, ligado);
  const service = new VouchersService(repo, cupons, issuer, flags, pracas);
  repo.leads.set(LEAD_A, { id: LEAD_A, name: 'Padaria de A', city: '', praca_id: A });
  repo.leads.set(LEAD_B, { id: LEAD_B, name: 'Café de B', city: '', praca_id: B });
  repo.pracas.set(A, { city: 'BH', cobertura_uf: 'MG', cobertura_cidade: 'Belo Horizonte' });
  repo.pracas.set(B, { city: 'Contagem', cobertura_uf: 'MG', cobertura_cidade: 'Contagem' });
  repo.visitas.push({ id: VISITA_B, client_id: VISITA_B_CLIENT, consultant_id: ANA_DEPOIS_DO_END.id, lead_id: LEAD_B, journey_praca_id: B });
  repo.consultores.set(ANA_DEPOIS_DO_END.id, 'Ana');
  return { service, repo };
}
const pedido = (over: Record<string, unknown>) => ({ client_id: uuid(), segment: 'Padaria', freelas_per_week: 3, ...over });

describe('pedido de cupom e a praça (§44.4)', () => {
  it('ligada: visit_ref de uma visita da jornada em B, reenviado depois do end — passa e fotografa B (cidade de B)', async () => {
    const { service, repo } = montar(true);
    const { view, criado } = await service.pedir(ANA_DEPOIS_DO_END, pedido({ visit_ref: VISITA_B_CLIENT }));
    expect(criado).toBe(true);
    expect(view).toMatchObject({ company_name: 'Café de B', city: 'Contagem' });
    expect((await repo.porClientId(view.client_id))?.praca_id).toBe(B);
  });

  it('ligada: só lead_id de B com a praça ativa A = 404 (não vê lead de outra praça)', async () => {
    const { service } = montar(true);
    await expect(service.pedir(ANA_DEPOIS_DO_END, pedido({ lead_id: LEAD_B }))).rejects.toMatchObject({ status: 404 });
  });

  it('desligada: a praça é a do request (a de hoje): a mesma visita de B = 404, como antes', async () => {
    const { service } = montar(false);
    await expect(service.pedir({ ...ANA_DEPOIS_DO_END, praca_principal_id: undefined }, pedido({ visit_ref: VISITA_B_CLIENT }))).rejects.toMatchObject({ status: 404 });
  });
});
