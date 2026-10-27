'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContatoLinks } from '@/components/praca/ContatoLinks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ROTA } from '@/modules/acesso/domain/enderecos';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useAtencao, useConfigAlertas, useRetornosEquipe, useSalvarConfigAlertas } from '@/modules/consultores/application/use-consultores';
import {
  DIAS_SEMANA,
  diaCurto,
  porcentagem,
  ritmoDaLinha,
  rotuloVencimentoComHora,
  ROTULO_ALERTA,
  type ConfigAlertas,
  type FollowupView,
  type GoalView,
} from '@/modules/consultores/domain/atencao';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

/** Bloco "Atenção agora" (UX §5.4): alertas calculados na hora, só dentro da tela. */
export function AtencaoAgora() {
  const { data, isPending, isError, error, refetch } = useAtencao();
  return (
    <section className="card-surface p-4" aria-labelledby="atencao-titulo">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="atencao-titulo" className="font-display text-lg font-extrabold">
          Atenção agora{data ? ` (${data.alerts.length + (data.payout_alerts?.length ?? 0) + (data.declared_alerts?.length ?? 0)})` : ''}
        </h2>
        {data && <span className="text-sm text-muted-foreground">Atualizado às {data.now}, a cada minuto</span>}
      </div>
      {isPending ? (
        <p className="mt-2 text-sm text-muted-foreground">Carregando os alertas…</p>
      ) : isError ? (
        <div className="mt-2 space-y-2" role="alert">
          <p className="text-sm text-destructive">{apiErrorMessage(error, 'Não foi possível carregar os alertas.')}</p>
          <Button variant="outline" className="h-12" onClick={() => void refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : data.alerts.length === 0 && !(data.payout_alerts?.length) && !(data.declared_alerts?.length) ? (
        <p className="mt-2 text-sm">
          {data.dia_de_trabalho ? '✓ Nenhum alerta agora: quem está em campo está dentro dos limites.' : 'Hoje não é dia de trabalho: sem alertas nem cobrança de ritmo.'}
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {data.payout_alerts?.map((a) => (
            <li key={a.payout_id} className="rounded-md border border-warning/40 bg-warning/10 p-3">
              <p className="text-sm font-bold">
                <span aria-hidden>⚠ </span>
                <span className="sr-only">{a.kind === 'pix_bloqueado' ? 'Pix bloqueado' : 'Pix falhou'}: </span>
                {a.message}
              </p>
              <Link href={ROTA.financeiro} className="inline-flex h-12 items-center text-sm font-bold text-primary hover:underline">
                Abrir pagamentos
              </Link>
            </li>
          ))}
          {data.declared_alerts?.map((a) => (
            <li key={`decl-${a.consultant_id}`} className="rounded-md border border-warning/40 bg-warning/10 p-3">
              <p className="text-sm font-bold">
                <span aria-hidden>⚠ </span>
                <span className="sr-only">Divergência nos cadastros declarados: </span>
                {a.message}
              </p>
              <Link href={ROTA.declarados} className="inline-flex h-12 items-center text-sm font-bold text-primary hover:underline">
                Abrir cadastros declarados
              </Link>
            </li>
          ))}
          {data.alerts.map((a) => (
            <li key={`${a.consultant_id}-${a.code}`} className="rounded-md border border-warning/40 bg-warning/10 p-3">
              <p className="text-sm font-bold">
                <span aria-hidden>⚠ </span>
                <span className="sr-only">{ROTULO_ALERTA[a.code]}: </span>
                {a.message}
              </p>
              <p className="text-sm text-muted-foreground">{a.praca_name}</p>
              <details className="mt-1 text-sm">
                <summary className="inline-flex h-12 cursor-pointer items-center font-bold text-primary">Ver a conta</summary>
                <p className="pb-2 text-muted-foreground">{a.conta}</p>
              </details>
              <ContatoLinks phone={a.phone} nome={a.consultant_name} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Meta de hoje + ritmo de um consultor na lista, com a conta escondida num toque. */
export function MetaLinha({ goal, status, emIntervaloDesde }: { goal: GoalView; status: 'em_jornada' | 'encerrou' | 'nao_iniciou'; emIntervaloDesde?: string | null }) {
  const ritmo = ritmoDaLinha(goal, status);
  return (
    <div className="mt-2 space-y-1">
      {emIntervaloDesde && (
        // Lote B §37.6 (UX §3.6): a equipe vê que o consultor está em intervalo (o "sem registro" não sai nesse tempo).
        <p className="text-sm font-bold">
          <span aria-hidden>☕ </span>Em intervalo desde {new Date(emIntervaloDesde).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
        </p>
      )}
      <p className="text-sm">
        <span className="font-bold">Meta de hoje: {goal.feitas} de {goal.meta}</span>{' '}
        <span className={ritmo.ok ? 'text-success' : 'text-warning'}>· {ritmo.texto}</span>
      </p>
      <div role="progressbar" aria-label="Visitas feitas na meta do dia" aria-valuemin={0} aria-valuemax={goal.meta} aria-valuenow={Math.min(goal.feitas, goal.meta)} className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${porcentagem(goal.feitas, goal.meta)}%` }} />
      </div>
      <details className="text-sm">
        <summary className="inline-flex h-12 cursor-pointer items-center font-bold text-primary">Ver a conta</summary>
        <p className="text-muted-foreground">{goal.conta}</p>
        <p className="pb-2 text-muted-foreground">{goal.fonte}</p>
      </details>
    </div>
  );
}

/** Quantos retornos aparecem direto; o resto fica atrás de um toque para não empurrar a lista de consultores. */
const VISIVEIS_RETORNOS = 5;

function RetornoItem({ f }: { f: FollowupView }) {
  return (
    <>
      <p className="text-sm font-bold">{f.lead_name}</p>
      <p className={`text-sm font-bold ${f.due === 'atrasado' ? 'text-warning' : 'text-success'}`}>
        {f.due === 'atrasado' ? '⚠ ' : '✓ '}
        {rotuloVencimentoComHora(f)} ({diaCurto(f.followup_date)})
      </p>
      <p className="text-sm">{f.followup_what || 'Sem descrição do retorno.'}</p>
      <p className="text-sm text-muted-foreground">
        Visita de {f.consultant_name}
        {f.interlocutor_name ? `, falou com ${f.interlocutor_name}` : ''}. {f.address}
        {f.contact_phone_masked ? ` Telefone de quem atendeu: ${f.contact_phone_masked}.` : ''}
        {f.contact_email_masked ? ` E-mail: ${f.contact_email_masked}.` : ''}
      </p>
      <ContatoLinks phone={f.phone} nome={f.lead_name} />
    </>
  );
}

/** "Retornos de hoje e atrasados" da equipe (§25.4). */
export function RetornosEquipe() {
  const { data, isPending, isError, error, refetch } = useRetornosEquipe();
  return (
    <section className="card-surface p-4" aria-labelledby="retornos-titulo">
      <h2 id="retornos-titulo" className="font-display text-lg font-extrabold">
        Retornos de hoje e atrasados{data ? ` (${data.total})` : ''}
      </h2>
      {data && (
        <p className="text-sm text-muted-foreground">
          {data.today} para hoje + {data.overdue} atrasados = {data.total}. Fonte: visitas com retorno pedido e sem visita depois.
        </p>
      )}
      {isPending ? (
        <p className="mt-2 text-sm text-muted-foreground">Carregando os retornos…</p>
      ) : isError ? (
        <div className="mt-2 space-y-2" role="alert">
          <p className="text-sm text-destructive">{apiErrorMessage(error, 'Não foi possível carregar os retornos.')}</p>
          <Button variant="outline" className="h-12" onClick={() => void refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : data.items.length === 0 ? (
        <p className="mt-2 text-sm">Nenhum retorno pendente.</p>
      ) : (
        <>
          <ul className="mt-3 space-y-3">
            {data.items.slice(0, VISIVEIS_RETORNOS).map((f) => (
              <li key={f.visit_id} className="rounded-md border border-border p-3">
                <RetornoItem f={f} />
              </li>
            ))}
          </ul>
          {data.items.length > VISIVEIS_RETORNOS && (
            <details className="mt-2">
              <summary className="flex h-12 cursor-pointer items-center justify-center rounded-md border border-border text-sm font-bold">
                Ver os outros {data.items.length - VISIVEIS_RETORNOS}
              </summary>
              <ul className="mt-3 space-y-3">
                {data.items.slice(VISIVEIS_RETORNOS).map((f) => (
                  <li key={f.visit_id} className="rounded-md border border-border p-3">
                    <RetornoItem f={f} />
                  </li>
                ))}
              </ul>
            </details>
          )}
          {data.truncated && <p className="mt-2 text-sm text-muted-foreground">Mostrando os 200 mais antigos de {data.total}.</p>}
        </>
      )}
    </section>
  );
}

const CAMPOS_NUMERICOS: [keyof ConfigAlertas, string, string][] = [
  ['alerta_inicio_apos_min', 'Não iniciou: tolerância após o início da janela (min)', '0 a 240'],
  ['alerta_visita_aberta_min', 'Visita aberta há mais de (min)', '5 a 480'],
  ['alerta_sem_registro_min', 'Sem registro há mais de (min)', '5 a 480'],
  ['alerta_ritmo_atras', 'Ritmo atrasado a partir de (visitas atrás)', '1 a 100'],
  ['alerta_parada_vencida_min', 'Parada do roteiro vencida após (min)', '5 a 240'],
];

/** Limites dos alertas (§25.1). Qualquer um da equipe vê; só admin salva. */
export function AlertasConfig() {
  const { user } = useAuth();
  const admin = !!user?.is_admin;
  const { data, isPending, isError } = useConfigAlertas();
  const salvar = useSalvarConfigAlertas();
  const [form, setForm] = useState<ConfigAlertas | null>(null);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  return (
    <details className="card-surface p-4">
      <summary className="cursor-pointer text-sm font-bold">Limites dos alertas e dias de trabalho</summary>
      {isPending || !form ? (
        <p className="mt-2 text-sm text-muted-foreground">{isError ? 'Não foi possível carregar os limites.' : 'Carregando…'}</p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {CAMPOS_NUMERICOS.map(([k, rotulo, faixa]) => (
              <div key={k} className="space-y-1">
                <Label htmlFor={`al-${k}`}>{rotulo}</Label>
                <Input
                  id={`al-${k}`}
                  type="number"
                  inputMode="numeric"
                  disabled={!admin}
                  value={Number(form[k])}
                  onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })}
                  aria-describedby={`al-${k}-faixa`}
                />
                <p id={`al-${k}-faixa`} className="text-sm text-muted-foreground">
                  Aceita {faixa}.
                </p>
              </div>
            ))}
          </div>
          <fieldset className="space-y-1">
            <legend className="text-sm font-bold">Dias de trabalho (fora deles não há alerta nem cobrança de ritmo)</legend>
            <div className="flex flex-wrap gap-2">
              {DIAS_SEMANA.map((nome, dia) => {
                const marcado = form.dias_trabalho.includes(dia);
                return (
                  <label key={nome} className="flex h-12 min-w-[4.5rem] items-center justify-center gap-2 rounded-md border border-border px-3 text-sm">
                    <input
                      type="checkbox"
                      disabled={!admin}
                      checked={marcado}
                      onChange={() =>
                        setForm({ ...form, dias_trabalho: marcado ? form.dias_trabalho.filter((d) => d !== dia) : [...form.dias_trabalho, dia].sort((a, b) => a - b) })
                      }
                    />
                    {nome}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <label className="flex min-h-12 items-center gap-2 text-sm">
            <input type="checkbox" disabled={!admin} checked={form.retornos_no_roteiro} onChange={(e) => setForm({ ...form, retornos_no_roteiro: e.target.checked })} />
            Retornos vencidos entram sozinhos no roteiro automático do consultor
          </label>
          <p className="text-sm text-muted-foreground">
            Os horários e a meta são os de &quot;Meta e horários do roteiro&quot;. Os alertas ficam só nesta tela: nada sai por WhatsApp, e-mail ou push.
          </p>
          {salvar.isError && <p className="text-sm text-destructive">{apiErrorMessage(salvar.error, 'Não foi possível salvar.')}</p>}
          {admin ? (
            <Button className="h-12" disabled={salvar.isPending || form.dias_trabalho.length === 0} onClick={() => salvar.mutate(form)}>
              {salvar.isPending ? 'Salvando…' : 'Salvar limites'}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Só administradores alteram os limites.</p>
          )}
        </div>
      )}
    </details>
  );
}
