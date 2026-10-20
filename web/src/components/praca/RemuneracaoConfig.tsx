'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { todaySp } from '@/lib/dates';
import { useAuth } from '@/modules/auth/application/use-auth';
import {
  useConfigRemuneracao,
  useSalvarConfigRemuneracao,
  useSimularRemuneracao,
} from '@/modules/remuneracao/application/use-remuneracao';
import {
  brl,
  corpoSimulacao,
  DIAS_SEMANA,
  formParaRegra,
  regraParaForm,
  resumoRegra,
  sugerirInicio,
  tituloSimulacao,
  type FormRegra,
  type VersaoRegra,
} from '@/modules/remuneracao/domain/remuneracao';
import { diaMes } from '@/modules/remuneracao/domain/remuneracao';

const campo = 'h-11 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-base';
const rotulo = 'text-sm font-medium text-muted-foreground';

function Campo({ id, titulo, ajuda, children }: { id: string; titulo: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className={rotulo}>
        {titulo}
      </label>
      {children}
      {ajuda && <p className="text-sm text-muted-foreground">{ajuda}</p>}
    </div>
  );
}

function Versao({ v, atual }: { v: VersaoRegra; atual?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-bold">
        Versão {v.version} · vale desde {diaMes(v.valid_from)}/{v.valid_from.slice(0, 4)}
        {atual ? ' (vigente hoje)' : ''}
      </p>
      <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
        {resumoRegra(v.config).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        {v.created_by ? `Por ${v.created_by}` : 'Padrão inicial'}
        {v.reason ? ` · ${v.reason}` : ''}
      </p>
    </div>
  );
}

/**
 * Configurações → "Remuneração do consultor" (contrato §28). Nada de valor fixo: tudo vem do servidor e cada
 * alteração vira uma NOVA versão com data de início (o passado não muda). Sem a flag no servidor, não aparece.
 */
export function RemuneracaoConfig() {
  const { user } = useAuth();
  const admin = !!user?.is_admin;
  const cfg = useConfigRemuneracao();
  const salvar = useSalvarConfigRemuneracao();
  const simular = useSimularRemuneracao();
  const atual = cfg.data?.current;

  const [form, setForm] = useState<FormRegra | null>(null);
  const [validoDe, setValidoDe] = useState(todaySp());
  const [motivo, setMotivo] = useState('');
  const [cadastros, setCadastros] = useState('12');
  const [visitas, setVisitas] = useState('0');
  const [jornada, setJornada] = useState(true);

  useEffect(() => {
    if (atual) {
      setForm(regraParaForm(atual.config));
      setValidoDe(sugerirInicio(todaySp(), atual.config));
    }
  }, [atual]);

  const set = <K extends keyof FormRegra>(k: K, v: FormRegra[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const regra = useMemo(() => (form ? formParaRegra(form) : null), [form]);
  const corpo = useMemo(() => (form ? corpoSimulacao(form, { signups: cadastros, visits: visitas, journey_open: jornada }) : null), [form, cadastros, visitas, jornada]);

  // Simulador: chama o servidor (a mesma função do cálculo real), com pausa para não disparar a cada tecla.
  const { mutate: rodar, reset: limparSimulacao } = simular;
  const corpoJson = corpo ? JSON.stringify(corpo) : null;
  useEffect(() => {
    if (!corpoJson) {
      limparSimulacao();
      return;
    }
    const t = setTimeout(() => rodar(JSON.parse(corpoJson)), 400);
    return () => clearTimeout(t);
  }, [corpoJson, rodar, limparSimulacao]);

  if (cfg.desligada) return null;
  if (cfg.isPending) return <p className="mt-8 text-sm text-muted-foreground">Carregando a remuneração…</p>;
  if (cfg.isError || !cfg.data || !atual || !form) {
    return (
      <section className="mt-8 space-y-2">
        <h2 className="tag text-muted-foreground">Remuneração do consultor</h2>
        <p className="text-sm text-destructive">Não conseguimos carregar a regra de remuneração. Tente de novo.</p>
        <Button variant="outline" className="h-11" onClick={() => void cfg.refetch()}>
          Tentar de novo
        </Button>
      </section>
    );
  }

  const gravar = () => {
    if (!regra || !regra.ok) return;
    salvar.mutate({ valid_from: validoDe, config: regra.regra, ...(motivo.trim() ? { reason: motivo.trim() } : {}) });
  };

  return (
    <section className="mt-8 space-y-4">
      <div>
        <h2 className="tag text-muted-foreground">Remuneração do consultor</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Quanto o consultor ganha por cadastro confirmado pelo Freela. Cada mudança cria uma versão nova a partir da data de início: semanas já fechadas nunca são
          recalculadas.
        </p>
      </div>

      <div className="card-surface space-y-4 p-4">
        <Versao v={atual} atual />
        {cfg.data.upcoming.map((v) => (
          <Versao key={v.version} v={v} />
        ))}
      </div>

      <div className="card-surface space-y-4 p-4">
        <h3 className="text-base font-bold">{admin ? 'Nova versão da regra' : 'Simulador'}</h3>
        {admin && (
          <fieldset className="grid gap-4 sm:grid-cols-2" disabled={salvar.isPending}>
            <Campo id="rem-unit" titulo="Valor por cadastro confirmado (R$)">
              <Input id="rem-unit" inputMode="decimal" className="h-11" value={form.unit} onChange={(e) => set('unit', e.target.value)} />
            </Campo>
            <Campo id="rem-combine" titulo="Como combinar valor por cadastro e faixa" ajuda="“Maior” paga o que for maior; “Soma” paga os dois; “Só faixa” ignora o valor por cadastro.">
              <select id="rem-combine" className={campo} value={form.combine} onChange={(e) => set('combine', e.target.value as FormRegra['combine'])}>
                <option value="max">O maior dos dois</option>
                <option value="sum">Soma dos dois</option>
                <option value="tier_only">Só a faixa</option>
              </select>
            </Campo>
            <Campo id="rem-period" titulo="As faixas contam cadastros por" ajuda="Faixa semanal só pode começar na primeira data da semana.">
              <select id="rem-period" className={campo} value={form.tiers_period} onChange={(e) => set('tiers_period', e.target.value as FormRegra['tiers_period'])}>
                <option value="day">Dia</option>
                <option value="week">Semana</option>
              </select>
            </Campo>
            <Campo id="rem-cap" titulo="Teto por período (R$)" ajuda="Em branco = sem teto.">
              <Input id="rem-cap" inputMode="decimal" className="h-11" value={form.cap} onChange={(e) => set('cap', e.target.value)} />
            </Campo>

            <div className="space-y-2 sm:col-span-2">
              <p className={rotulo}>Faixas (a maior atingida vale)</p>
              {form.tiers.map((t, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <Campo id={`rem-tmin-${i}`} titulo="A partir de (cadastros)">
                    <Input id={`rem-tmin-${i}`} inputMode="numeric" className="h-11 w-32" value={t.min} onChange={(e) => set('tiers', form.tiers.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)))} />
                  </Campo>
                  <Campo id={`rem-tval-${i}`} titulo="Paga (R$)">
                    <Input id={`rem-tval-${i}`} inputMode="decimal" className="h-11 w-36" value={t.valor} onChange={(e) => set('tiers', form.tiers.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} />
                  </Campo>
                  <Button type="button" variant="outline" className="h-11 min-w-12" aria-label={`Remover faixa ${i + 1}`} onClick={() => set('tiers', form.tiers.filter((_, j) => j !== i))}>
                    Remover
                  </Button>
                </div>
              ))}
              {form.tiers.length < 10 && (
                <Button type="button" variant="outline" className="h-11" onClick={() => set('tiers', [...form.tiers, { min: '', valor: '' }])}>
                  Adicionar faixa
                </Button>
              )}
            </div>

            <Campo id="rem-floor" titulo="Piso por diária (R$)" ajuda="0 = sem piso. Garante esse valor no dia quando a condição abaixo vale.">
              <Input id="rem-floor" inputMode="decimal" className="h-11" value={form.floor} onChange={(e) => set('floor', e.target.value)} />
            </Campo>
            <Campo id="rem-fcond" titulo="Condição do piso" ajuda="“Nenhuma” paga o piso todo dia para consultor ativo, até sem visitas.">
              <select id="rem-fcond" className={campo} value={form.floor_condition} onChange={(e) => set('floor_condition', e.target.value as FormRegra['floor_condition'])}>
                <option value="none">Nenhuma (todo dia)</option>
                <option value="journey_open">Houve jornada iniciada no dia</option>
                <option value="min_visits">Mínimo de visitas feitas</option>
              </select>
            </Campo>
            {form.floor_condition === 'min_visits' && (
              <>
                <Campo id="rem-fvis" titulo="Mínimo de visitas no dia">
                  <Input id="rem-fvis" inputMode="numeric" className="h-11" value={form.floor_min_visits} onChange={(e) => set('floor_min_visits', e.target.value)} />
                </Campo>
                <Campo id="rem-vcount" titulo="A visita conta quando">
                  <select id="rem-vcount" className={campo} value={form.visits_count} onChange={(e) => set('visits_count', e.target.value as FormRegra['visits_count'])}>
                    <option value="checkin">Faz o check-in</option>
                    <option value="checkout">Faz o checkout</option>
                  </select>
                </Campo>
              </>
            )}

            <Campo id="rem-wstart" titulo="A semana começa na" ajuda="Não muda depois que houver ganhos lançados.">
              <select id="rem-wstart" className={campo} value={form.week_start_weekday} onChange={(e) => set('week_start_weekday', e.target.value)}>
                {DIAS_SEMANA.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id="rem-pay" titulo="Dia do Pix e do fechamento">
              <select id="rem-pay" className={campo} value={form.payout_weekday} onChange={(e) => set('payout_weekday', e.target.value)}>
                {DIAS_SEMANA.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id="rem-hour" titulo="Fechar sozinho a partir das (hora, Brasília)">
              <Input id="rem-hour" inputMode="numeric" className="h-11" value={form.autoclose_hour} onChange={(e) => set('autoclose_hour', e.target.value)} />
            </Campo>
            <Campo id="rem-grace" titulo="Confirmação tardia vale por (dias)" ajuda="Depois do fechamento, um cadastro confirmado dentro desse prazo entra como ajuste na semana corrente.">
              <Input id="rem-grace" inputMode="numeric" className="h-11" value={form.late_grace_days} onChange={(e) => set('late_grace_days', e.target.value)} />
            </Campo>
            <Campo id="rem-from" titulo="Vale a partir de" ajuda="Hoje ou depois. O passado não é reescrito.">
              <Input id="rem-from" type="date" className="h-11" min={todaySp()} value={validoDe} onChange={(e) => e.target.value && setValidoDe(e.target.value)} />
            </Campo>
            <Campo id="rem-why" titulo="Motivo da mudança (opcional)">
              <Input id="rem-why" className="h-11" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </Campo>
          </fieldset>
        )}

        <div className="rounded-md border border-border p-3" aria-live="polite">
          <p className="text-sm font-bold">Simulador</p>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <Campo id="sim-n" titulo="Cadastros confirmados no dia">
              <Input id="sim-n" inputMode="numeric" className="h-11 w-36" value={cadastros} onChange={(e) => setCadastros(e.target.value)} />
            </Campo>
            <Campo id="sim-v" titulo="Visitas no dia">
              <Input id="sim-v" inputMode="numeric" className="h-11 w-28" value={visitas} onChange={(e) => setVisitas(e.target.value)} />
            </Campo>
            <label className="flex h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-5" checked={jornada} onChange={(e) => setJornada(e.target.checked)} />
              Houve jornada iniciada
            </label>
          </div>
          {regra && !regra.ok && <p className="mt-2 text-sm text-destructive">{regra.erro}</p>}
          {!corpo && regra?.ok && <p className="mt-2 text-sm text-muted-foreground">Informe números inteiros (até 1000).</p>}
          {simular.isPending && <p className="mt-2 text-sm text-muted-foreground">Calculando…</p>}
          {simular.isError && <p className="mt-2 text-sm text-destructive">Esta regra não é válida ainda. Confira os campos e tente de novo.</p>}
          {simular.data && corpo && (
            <div className="mt-2 space-y-1">
              <p className="text-base font-bold">{tituloSimulacao(corpo.signups_confirmed, simular.data.day.total_cents)}</p>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                {simular.data.day.conta.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {admin && (
          <div className="flex flex-wrap items-center gap-3">
            <Button className="h-12" onClick={gravar} disabled={salvar.isPending || !regra?.ok}>
              Salvar como nova versão
            </Button>
            <p className="text-sm text-muted-foreground">
              {regra?.ok ? `Passa a valer em ${diaMes(validoDe)}/${validoDe.slice(0, 4)}; cada cadastro confirmado: ${brl(regra.regra.unit_cents)}.` : 'Corrija os campos para salvar.'}
            </p>
          </div>
        )}
      </div>

      <details className="card-surface p-4">
        <summary className="min-h-12 cursor-pointer text-sm font-bold leading-[3rem]">Histórico de versões ({cfg.data.history.length})</summary>
        <div className="mt-2 space-y-4">
          {cfg.data.history.map((v) => (
            <Versao key={v.version} v={v} atual={v.version === atual.version} />
          ))}
        </div>
      </details>
    </section>
  );
}
