'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { todaySp, WD_SHORT, wdOf } from '@/lib/dates';
import { diasDaSemana, segundaDaSemana } from '@/lib/semana';
import { useAuth } from '@/modules/auth/application/use-auth';
import type { RouteView } from '@/modules/campo/domain/campo.types';
import { useConsultores, useGerarRotas, useRotas } from '@/modules/consultores/application/use-consultores';
import { usePracas, useUpdatePraca } from '@/modules/pracas/application/use-pracas';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import { RotaEditor } from './RotaEditor';

const COR_STATUS: Record<RouteView['status'], string> = {
  aberta: 'border-border',
  iniciada: 'border-primary bg-primary/10',
  encerrada: 'border-success bg-success/10',
};

/** Equipe → Rotas da semana (§21.5): representante × dia, gerar, abrir e ajustar. */
export function RotasSemana() {
  const { user } = useAuth();
  const admin = !!user?.is_admin;
  const [semana, setSemana] = useState(() => segundaDaSemana(todaySp()));
  const { data: pracas = [] } = usePracas();
  const [pracaId, setPracaId] = useState('');
  const praca = pracas.find((p) => p.id === pracaId);
  const { data: rotas = [], isPending, isError, error } = useRotas(semana, pracaId || undefined);
  const { data: consultores = [] } = useConsultores();
  const gerar = useGerarRotas();
  const atualizarPraca = useUpdatePraca();
  const [aberta, setAberta] = useState<RouteView | null>(null);
  const dias = useMemo(() => diasDaSemana(semana), [semana]);

  const linhas = useMemo(
    () => consultores.filter((c) => c.active && (!pracaId || c.praca_id === pracaId)),
    [consultores, pracaId],
  );
  const rotaDe = (consultantId: string, day: string) => rotas.find((r) => r.consultant_id === consultantId && r.day === day);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">
          Semana de
          <Input type="date" value={semana} onChange={(e) => e.target.value && setSemana(segundaDaSemana(e.target.value))} className="mt-1 w-44" />
        </label>
        <label className="text-xs text-muted-foreground">
          Praça
          <select value={pracaId} onChange={(e) => setPracaId(e.target.value)} className="mt-1 block h-10 rounded-md border border-border bg-background px-3 text-sm">
            <option value="">todas</option>
            {pracas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {admin && (
          <Button onClick={() => gerar.mutate({ week: semana, ...(pracaId ? { consultant_ids: linhas.map((c) => c.id) } : {}) })} disabled={gerar.isPending || (!!pracaId && !linhas.length)}>
            {gerar.isPending ? 'Gerando…' : rotas.length ? 'Gerar de novo (dias não iniciados)' : 'Gerar rotas da semana'}
          </Button>
        )}
      </div>

      {praca && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          Meta de
          {admin ? (
            <Input
              aria-label="Meta de visitas por dia"
              type="number"
              min={1}
              max={60}
              defaultValue={praca.route_daily_goal}
              key={`${praca.id}-${praca.route_daily_goal}`}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (n >= 1 && n <= 60 && n !== praca.route_daily_goal) atualizarPraca.mutate({ id: praca.id, input: { route_daily_goal: n } });
              }}
              className="h-8 w-16"
            />
          ) : (
            <b>{praca.route_daily_goal}</b>
          )}
          visitas por dia · segunda a sábado, das {praca.route_start_hour}h às {praca.route_end_hour}h · as rotas abrem sozinhas toda segunda às 7h
        </p>
      )}

      {isError ? (
        <p className="text-sm text-destructive">{apiErrorMessage(error, 'Não foi possível carregar as rotas.')}</p>
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !linhas.length ? (
        <p className="text-sm text-muted-foreground">Nenhum representante ativo{pracaId ? ' nesta praça' : ''}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-2 pr-2 font-semibold">Representante</th>
                {dias.map((d) => (
                  <th key={d} className={`px-1 py-2 font-semibold ${d === todaySp() ? 'text-primary' : ''}`}>
                    {WD_SHORT[wdOf(d)]} {d.slice(8, 10)}/{d.slice(5, 7)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="py-2 pr-2 font-semibold">{c.name}</td>
                  {dias.map((d) => {
                    const r = rotaDe(c.id, d);
                    return (
                      <td key={d} className="px-1 py-1.5">
                        {r ? (
                          <button
                            onClick={() => setAberta(r)}
                            aria-label={`Rota de ${c.name} em ${d}`}
                            className={`w-full rounded-md border px-2 py-1.5 text-left tabular-nums ${COR_STATUS[r.status]}`}
                          >
                            <span className="font-bold">{r.counts.visitados}</span>/{r.counts.total}
                            <span className="block text-[10px] text-muted-foreground">{r.status}</span>
                          </button>
                        ) : (
                          <span className="block rounded-md border border-dashed border-border px-2 py-1.5 text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {aberta && <RotaEditor rota={rotas.find((r) => r.id === aberta.id) ?? aberta} onFechar={() => setAberta(null)} />}
    </section>
  );
}
