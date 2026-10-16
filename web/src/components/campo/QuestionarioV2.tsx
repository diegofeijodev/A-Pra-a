'use client';

import { useState } from 'react';
import { Chips, Opcoes } from '@/components/campo/Questionario';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { fmtBR, todaySp } from '@/lib/dates';
import type { CargoV2, ModoCadastro, StatusFinal, VisitAnswersV2, VoucherDaVisita } from '@/modules/campo/domain/campo.types';
import { canaisExclusivos, FUNCOES_VAGA, ofereceVoucher } from '@/modules/campo/domain/questionario';

const CARGOS: [CargoV2, string][] = [['dono', 'Dono'], ['gerente', 'Gerente']];
const SIM_NAO: ['sim' | 'nao', string][] = [['sim', 'Sim'], ['nao', 'Não']];
const MODOS: [ModoCadastro, string][] = [['qr', 'Pelo QR code'], ['assistido', 'Cadastro assistido'], ['nao_abriu', 'Não abriu']];
const FINAIS: [StatusFinal, string][] = [
  ['cadastrou', 'Cadastrou'],
  ['cadastra_depois', 'Vai cadastrar depois'],
  ['nao_quis', 'Não quis'],
  ['ligar_depois', 'Ligar depois'],
];
const STATUS_VOUCHER: Record<string, string> = {
  solicitado: 'pedido ao gestor — aguardando liberação',
  liberado: 'liberado pelo gestor',
  recusado: 'recusado pelo gestor',
  usado: 'usado',
  expirado: 'expirado',
};

export interface VagaNaTela {
  key: string;
  date: string;
  funcao: string;
  pendente: boolean;
}

const simNao = (b: boolean | null) => (b == null ? null : b ? 'sim' : 'nao');

function Passo({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-bold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs">{n}</span>
        {titulo}
      </h3>
      {children}
    </section>
  );
}

/**
 * Formulário de visita v2 (§21.6), na ordem do dono: contato → função →
 * contrata freelancer? → voucher (acima de 5/semana) → vagas → cadastro →
 * status final. O check-in com foto já aconteceu antes desta tela.
 */
export function QuestionarioV2({
  valor,
  canais,
  desabilitado,
  onMudar,
  vagas,
  onAbrirVaga,
  voucher,
  onPedirVoucher,
  signupUrl,
  onMostrarQr,
}: {
  valor: VisitAnswersV2;
  canais: string[];
  desabilitado: boolean;
  onMudar: (r: VisitAnswersV2) => void;
  vagas: VagaNaTela[];
  onAbrirVaga: (v: { date: string; funcao: string }) => void;
  /** `pendente` = pedido ainda na fila do aparelho. */
  voucher: VoucherDaVisita | 'pendente' | null;
  onPedirVoucher: () => void;
  signupUrl: string | null;
  onMostrarQr: () => void;
}) {
  const set = <K extends keyof VisitAnswersV2>(k: K, v: VisitAnswersV2[K]) => onMudar({ ...valor, [k]: v });
  const [vagaData, setVagaData] = useState(todaySp());
  const [vagaFuncao, setVagaFuncao] = useState<string>(FUNCOES_VAGA[0]);
  const oferta = ofereceVoucher(valor);
  let n = 0;

  return (
    <div className="space-y-6">
      <Passo n={++n} titulo="Nome do contato">
        <Input
          id="v2-contato"
          aria-label="Nome do contato"
          value={valor.interlocutor_name ?? ''}
          maxLength={120}
          disabled={desabilitado}
          onChange={(e) => set('interlocutor_name', e.target.value)}
        />
      </Passo>

      <Passo n={++n} titulo="Função">
        <Opcoes valor={valor.interlocutor_role} opcoes={CARGOS} desabilitado={desabilitado} onEscolher={(v) => set('interlocutor_role', v)} />
      </Passo>

      <Passo n={++n} titulo="Contrata freelancer?">
        <Opcoes
          valor={simNao(valor.hires_freelancer)}
          opcoes={SIM_NAO}
          desabilitado={desabilitado}
          onEscolher={(v) =>
            onMudar({
              ...valor,
              hires_freelancer: v === 'sim',
              // "Não" limpa o que só vale para quem contrata.
              ...(v === 'nao' ? { channels: [], channel_other: null, freelas_per_week: null, voucher_accepted: null } : {}),
            })
          }
        />
        {valor.hires_freelancer && (
          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="space-y-1">
              <Label>Como contrata hoje</Label>
              <Chips
                marcados={valor.channels}
                opcoes={canais}
                desabilitado={desabilitado}
                onTrocar={(lista) => set('channels', canaisExclusivos(valor.channels, lista))}
              />
              <Input
                aria-label="Outro jeito de contratar"
                placeholder="Outro (escreva)"
                value={valor.channel_other ?? ''}
                maxLength={120}
                disabled={desabilitado}
                onChange={(e) => set('channel_other', e.target.value || null)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="v2-quantos">Quantos freelancers por semana</Label>
              <Input
                id="v2-quantos"
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                value={valor.freelas_per_week ?? ''}
                disabled={desabilitado}
                onChange={(e) => set('freelas_per_week', e.target.value === '' ? null : Math.max(0, Math.min(1000, Math.trunc(Number(e.target.value)))))}
                className="w-32"
              />
            </div>
          </div>
        )}
      </Passo>

      {oferta && (
        <Passo n={++n} titulo="Oferta do voucher">
          <div className="space-y-3 rounded-md border border-primary/50 bg-primary/10 p-3">
            <p className="text-sm">
              Contrata mais de 5 por semana: ofereça o voucher — <b>abre uma vaga e contrata 1 freelancer grátis</b>, válido até sábado.
            </p>
            <Opcoes
              valor={simNao(valor.voucher_accepted)}
              opcoes={[['sim', 'Aceitou'], ['nao', 'Não aceitou']]}
              desabilitado={desabilitado || !!voucher}
              onEscolher={(v) => set('voucher_accepted', v === 'sim')}
            />
            {valor.voucher_accepted &&
              (voucher ? (
                <p className="text-sm font-semibold">
                  {voucher === 'pendente' ? 'Voucher pedido — enviando quando houver sinal.' : `Voucher ${voucher.code}: ${STATUS_VOUCHER[voucher.status] ?? voucher.status}`}
                  {voucher !== 'pendente' && voucher.status === 'recusado' && voucher.decision_note ? ` (${voucher.decision_note})` : ''}
                </p>
              ) : (
                <Button type="button" onClick={onPedirVoucher} disabled={desabilitado} className="h-11 w-full">
                  Pedir voucher ao gestor
                </Button>
              ))}
            {valor.voucher_accepted && <p className="text-xs text-muted-foreground">Faça o cadastro na hora e abra a vaga logo abaixo.</p>}
          </div>
        </Passo>
      )}

      <Passo n={++n} titulo={oferta && valor.voucher_accepted ? 'Abrir a vaga (obrigatório com voucher)' : 'Vagas abertas na visita'}>
        {vagas.length > 0 && (
          <ul className="space-y-1">
            {vagas.map((v) => (
              <li key={v.key} className="flex justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span>
                  {v.funcao} · {fmtBR(v.date)}
                </span>
                {v.pendente && <span className="text-xs text-muted-foreground">enviando</span>}
              </li>
            ))}
          </ul>
        )}
        {!desabilitado && (
          <div className="flex flex-wrap items-end gap-2">
            <select
              aria-label="Função da vaga"
              value={vagaFuncao}
              onChange={(e) => setVagaFuncao(e.target.value)}
              className="h-11 rounded-md border border-border bg-background px-3 text-sm"
            >
              {FUNCOES_VAGA.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
            <Input aria-label="Data da vaga" type="date" min={todaySp()} value={vagaData} onChange={(e) => setVagaData(e.target.value)} className="h-11 w-40" />
            <Button type="button" variant="outline" className="h-11" disabled={!vagaData || vagaData < todaySp()} onClick={() => onAbrirVaga({ date: vagaData, funcao: vagaFuncao })}>
              Abrir vaga
            </Button>
          </div>
        )}
      </Passo>

      <Passo n={++n} titulo="Abrir o cadastro">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={onMostrarQr}>
            Mostrar QR code
          </Button>
          {signupUrl && (
            <a href={signupUrl} target="_blank" rel="noreferrer" className="flex h-11 items-center rounded-md border border-border px-4 text-sm font-semibold">
              Cadastrar no meu celular
            </a>
          )}
        </div>
        <Opcoes valor={valor.signup_mode} opcoes={MODOS} desabilitado={desabilitado} onEscolher={(v) => set('signup_mode', v)} />
      </Passo>

      <Passo n={++n} titulo="Status final">
        <Opcoes
          valor={valor.final_status}
          opcoes={FINAIS}
          desabilitado={desabilitado}
          onEscolher={(v) => onMudar({ ...valor, final_status: v, final_date: null, final_reason: null, callback_phone: null })}
        />
        {(valor.final_status === 'cadastra_depois' || valor.final_status === 'ligar_depois') && (
          <div className="space-y-1">
            <Label htmlFor="v2-data">{valor.final_status === 'ligar_depois' ? 'Ligar quando' : 'Cadastrar até quando'}</Label>
            <Input id="v2-data" type="date" min={todaySp()} value={valor.final_date ?? ''} disabled={desabilitado} onChange={(e) => set('final_date', e.target.value || null)} className="w-44" />
          </div>
        )}
        {valor.final_status === 'ligar_depois' && (
          <div className="space-y-1">
            <Label htmlFor="v2-telefone">Telefone para ligar</Label>
            <Input id="v2-telefone" inputMode="tel" maxLength={30} value={valor.callback_phone ?? ''} disabled={desabilitado} onChange={(e) => set('callback_phone', e.target.value || null)} />
          </div>
        )}
        {valor.final_status === 'nao_quis' && (
          <div className="space-y-1">
            <Label htmlFor="v2-motivo">Por que não quis</Label>
            <Input id="v2-motivo" maxLength={300} value={valor.final_reason ?? ''} disabled={desabilitado} onChange={(e) => set('final_reason', e.target.value || null)} />
          </div>
        )}
      </Passo>

      <div className="space-y-1">
        <Label htmlFor="v2-obs">Observação (opcional)</Label>
        <Textarea id="v2-obs" maxLength={2000} value={valor.notes ?? ''} disabled={desabilitado} onChange={(e) => set('notes', e.target.value || null)} />
      </div>
    </div>
  );
}
