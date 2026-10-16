'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { todaySp } from '@/lib/dates';
import { diasDaSemana } from '@/lib/semana';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useConsultores, usePainel, useTrilhas } from '@/modules/consultores/application/use-consultores';
import type { NumerosPainel } from '@/modules/consultores/infrastructure/consultores.api';
import { usePracas } from '@/modules/pracas/application/use-pracas';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import { CORES_REPRESENTANTE } from './TrilhasMapa';

const TrilhasMapa = dynamic(() => import('./TrilhasMapa'), { ssr: false });

type Periodo = 'hoje' | 'semana' | 'outro';

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string | number; detalhe?: string }) {
  return (
    <div className="card-surface p-3">
      <p className="font-display text-2xl font-black tabular-nums">{valor}</p>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      {detalhe && <p className="mt-0.5 text-[11px] text-muted-foreground">{detalhe}</p>}
    </div>
  );
}

const pct = (n: NumerosPainel) => (n.pct_meta == null ? '—' : `${n.pct_meta}%`);

/** Equipe → Painel (§21.9): rotas, visitas, cadastros, vouchers e vagas, por período e representante. */
export function PainelRepresentantes() {
  const { user } = useAuth();
  const hoje = todaySp();
  const semana = diasDaSemana(hoje);
  const [periodo, setPeriodo] = useState<Periodo>('hoje');
  const [de, setDe] = useState(hoje);
  const [ate, setAte] = useState(hoje);
  const [pracaId, setPracaId] = useState('');
  const [consultor, setConsultor] = useState('');
  const { data: pracas = [] } = usePracas();
  const { data: consultores = [] } = useConsultores();
  const [from, to] = periodo === 'hoje' ? [hoje, hoje] : periodo === 'semana' ? [semana[0]!, semana[5]!] : [de, ate];
  const params = useMemo(
    () => ({ from, to, ...(pracaId ? { praca_id: pracaId } : {}), ...(consultor ? { consultant_id: consultor } : {}) }),
    [from, to, pracaId, consultor],
  );
  const { data, isPending, isError, error } = usePainel(params);
  const umDia = from === to;
  const { data: trilhas } = useTrilhas({ day: from, ...(pracaId ? { praca_id: pracaId } : {}) }, umDia);
  const t = data?.totals;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 text-xs text-muted-foreground">
        <div className="flex gap-1">
          {(
            [
              ['hoje', 'Hoje'],
              ['semana', 'Esta semana'],
              ['outro', 'Período'],
            ] as [Periodo, string][]
          ).map(([id, r]) => (
            <button
              key={id}
              onClick={() => setPeriodo(id)}
              className={`rounded-full border px-3 py-1.5 ${periodo === id ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}
            >
              {r}
            </button>
          ))}
        </div>
        {periodo === 'outro' && (
          <>
            <label>
              De
              <Input type="date" value={de} max={ate} onChange={(e) => e.target.value && setDe(e.target.value)} className="mt-1 w-40" />
            </label>
            <label>
              Até
              <Input type="date" value={ate} min={de} onChange={(e) => e.target.value && setAte(e.target.value)} className="mt-1 w-40" />
            </label>
          </>
        )}
        <label>
          Praça
          <select value={pracaId} onChange={(e) => setPracaId(e.target.value)} className="mt-1 block h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground">
            <option value="">todas</option>
            {pracas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Representante
          <select value={consultor} onChange={(e) => setConsultor(e.target.value)} className="mt-1 block h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground">
            <option value="">todos</option>
            {consultores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isError ? (
        <p className="text-sm text-destructive">{apiErrorMessage(error, 'Não foi possível carregar o painel.')}</p>
      ) : isPending || !t ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Numero rotulo="rotas iniciadas" valor={`${t.rotas_iniciadas}/${t.rotas}`} detalhe={`${t.rotas_abertas} ainda abertas`} />
            <Numero rotulo={umDia ? 'visitas no dia' : 'visitas no período'} valor={t.visitas} detalhe={`${pct(t)} da meta (${t.meta})`} />
            <Numero rotulo="cadastros feitos" valor={t.cadastros} />
            <Numero rotulo="vouchers liberados" valor={t.vouchers_liberados} detalhe={`${t.vouchers_solicitados} pedidos · ${t.vouchers_usados} usados`} />
            <Numero rotulo="vagas abertas" valor={t.vagas} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  {['Representante', 'Rotas', 'Visitas', '% meta', 'Cadastros', 'Vouchers', 'Vagas'].map((h) => (
                    <th key={h} className="py-2 pr-3 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {data.por_representante.map((r, i) => (
                  <tr key={r.consultant_id} className="border-t border-border">
                    <td className="py-2 pr-3 font-semibold">
                      {umDia && (
                        <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ background: CORES_REPRESENTANTE[(trilhas?.consultants.findIndex((c) => c.id === r.consultant_id) ?? i) % CORES_REPRESENTANTE.length] }} />
                      )}
                      {r.name}
                    </td>
                    <td className="py-2 pr-3">
                      {r.rotas_iniciadas}/{r.rotas}
                    </td>
                    <td className="py-2 pr-3">{r.visitas}</td>
                    <td className="py-2 pr-3">{pct(r)}</td>
                    <td className="py-2 pr-3">{r.cadastros}</td>
                    <td className="py-2 pr-3">
                      {r.vouchers_liberados}/{r.vouchers_solicitados}
                    </td>
                    <td className="py-2 pr-3">{r.vagas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {umDia && trilhas && trilhas.consultants.length > 0 && <TrilhasMapa trilhas={trilhas} dark={user?.theme !== 'light'} />}
        </>
      )}
    </section>
  );
}
