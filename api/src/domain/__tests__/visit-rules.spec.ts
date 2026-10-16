import { codigoVoucher, efeitoNoFunil, faltandoV2, ofereceVoucher, resumoV2, temposPorParada, type RespostasV2 } from '../visit-rules';

const BASE: RespostasV2 = {
  interlocutor_name: 'João',
  interlocutor_role: 'dono',
  hires_freelancer: false,
  channels: [],
  channel_other: null,
  freelas_per_week: null,
  voucher_accepted: null,
  signup_mode: 'qr',
  final_status: 'cadastrou',
  final_date: null,
  final_reason: null,
  callback_phone: null,
  notes: null,
};
const HOJE = '2026-10-08';
const ctx = { voucherPedido: false, vagas: 0 };

describe('faltandoV2', () => {
  it('completo não falta nada', () => expect(faltandoV2(BASE, HOJE, ctx)).toEqual([]));

  it('contrata: precisa de como e quantos (≥ 1)', () => {
    expect(faltandoV2({ ...BASE, hires_freelancer: true, freelas_per_week: 0 }, HOJE, ctx)).toEqual([
      'como contrata',
      'quantos freelancers por semana',
    ]);
  });

  it('acima de 5 por semana: pede a resposta do voucher; aceitou exige pedido e vaga', () => {
    const r = { ...BASE, hires_freelancer: true, channels: ['Agência'], freelas_per_week: 6 };
    expect(faltandoV2(r, HOJE, ctx)).toEqual(['resposta da oferta do voucher']);
    expect(faltandoV2({ ...r, voucher_accepted: true }, HOJE, ctx)).toEqual(['pedir o voucher ao gestor', 'abrir a vaga do voucher']);
    expect(faltandoV2({ ...r, voucher_accepted: true }, HOJE, { voucherPedido: true, vagas: 1 })).toEqual([]);
    expect(faltandoV2({ ...r, freelas_per_week: 5 }, HOJE, ctx)).toEqual([]);
  });

  it('status final: datas, telefone e motivo', () => {
    expect(faltandoV2({ ...BASE, final_status: 'ligar_depois', final_date: '2026-10-01' }, HOJE, ctx)).toEqual([
      'data do retorno (não pode ser no passado)',
      'telefone para ligar',
    ]);
    expect(faltandoV2({ ...BASE, final_status: 'nao_quis' }, HOJE, ctx)).toEqual(['motivo de não querer']);
    expect(faltandoV2({ ...BASE, signup_mode: 'nao_abriu' }, HOJE, ctx)).toEqual(['como abriu o cadastro (cadastrou sem abrir?)']);
  });
});

describe('efeitoNoFunil', () => {
  it('cadastrou leva a 5, sem rebaixar quem já passou', () => {
    expect(efeitoNoFunil(2, BASE)).toMatchObject({ stage: 5, mudou: true });
    expect(efeitoNoFunil(6, BASE)).toMatchObject({ stage: 6, mudou: false });
  });
  it('retornos viram próximo passo e conversa aberta', () => {
    expect(efeitoNoFunil(1, { ...BASE, final_status: 'ligar_depois', final_date: '2026-10-09', callback_phone: '3199' })).toEqual({
      stage: 3,
      mudou: true,
      next_step: { what: 'Ligar (3199)', date: '2026-10-09' },
      lost_reason: null,
    });
  });
  it('não quis vai para 8 com o motivo', () => {
    expect(efeitoNoFunil(3, { ...BASE, final_status: 'nao_quis', final_reason: 'caro.' })).toMatchObject({ stage: 8, lost_reason: 'caro' });
  });
});

it('ofereceVoucher: acima de 5 e só se contrata', () => {
  expect(ofereceVoucher({ hires_freelancer: true, freelas_per_week: 6 })).toBe(true);
  expect(ofereceVoucher({ hires_freelancer: true, freelas_per_week: 5 })).toBe(false);
  expect(ofereceVoucher({ hires_freelancer: false, freelas_per_week: 9 })).toBe(false);
});

it('resumoV2: uma frase por pergunta', () => {
  const t = resumoV2(
    { ...BASE, hires_freelancer: true, channels: ['Agência'], freelas_per_week: 8, voucher_accepted: true },
    { voucher: 'PRC-ABCDEF', vagas: [{ date: '2026-10-10', funcao: 'Garçom' }] },
  );
  expect(t).toBe(
    'Visita de campo — contato: João (Dono). Contrata freelancer: sim, 8 por semana (Agência). Voucher: aceitou (PRC-ABCDEF). ' +
      'Vagas abertas na visita: Garçom em 10/10/2026. Cadastro: pelo QR code. Status final: cadastrou.',
  );
});

it('codigoVoucher: PRC- e 6 caracteres sem 0/O/1/I', () => {
  expect(codigoVoucher(() => 0)).toBe('PRC-222222');
  for (let i = 0; i < 50; i++) expect(codigoVoucher()).toMatch(/^PRC-[2-9A-HJ-NP-Z]{6}$/);
});

it('temposPorParada: no local e deslocamento (desde o início da jornada)', () => {
  const d = (h: string) => new Date(`2026-10-08T${h}:00.000Z`);
  expect(
    temposPorParada(
      [
        { checkin_at: d('12:10'), checkout_at: d('12:25') },
        { checkin_at: d('12:40'), checkout_at: null },
        { checkin_at: d('13:00'), checkout_at: d('13:05') },
      ],
      d('12:00'),
    ),
  ).toEqual([
    { minutes_on_site: 15, minutes_travel: 10 },
    { minutes_on_site: null, minutes_travel: 15 },
    { minutes_on_site: 5, minutes_travel: null },
  ]);
});
