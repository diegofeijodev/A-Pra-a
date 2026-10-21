'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAreas } from '@/modules/areas/application/use-areas';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useConfigModo, useSalvarConfigModo } from '@/modules/rotas/application/use-rotas-equipe';
import { alternar, CAMPOS_CONTATO, RESULTADOS_COM_CONTATO, type ConfigModo } from '@/modules/rotas/domain/fluxo-config';
import { useConsultores } from '@/modules/consultores/application/use-consultores';
import type { PracaView } from '@/modules/pracas/application/use-pracas';
import {
  useCandidatosRoteiro,
  useMontarRoteiro,
  useOrdenarRoteiro,
  useRefazerRoteiro,
  useRotaConfig,
  useRotasDoDia,
  useSalvarRotaConfig,
} from '@/modules/rotas/application/use-rotas-equipe';
import { alternarFixa, mover, mudou, pendentesParaOrdenar, resumoDaMeta, type ItemOrdem } from '@/modules/rotas/domain/ordem';
import { etaTexto } from '@/modules/rotas/domain/rota-local';
import { MODOS_DESLOCAMENTO, rotuloMotivo, type ConfigRota, type ModoDeslocamento, type RouteView } from '@/modules/rotas/domain/rota.schema';
import { todaySp } from '@/lib/dates';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

const ICONE: Record<string, string> = { visitada: '✓ feita', pendente: 'pendente', adiada: '⏭ para depois', pulada: '✕ pulada' };

function Progresso({ r }: { r: RouteView }) {
  const p = r.progress;
  const posicao = p.delta > 0 ? `${p.delta} à frente` : p.delta === 0 ? 'no ponto' : `${-p.delta} atrás`;
  return (
    <p className="text-sm text-muted-foreground">
      {p.done} de {p.meta} visitas · esperado agora {p.expected_now} ({posicao}) · {p.skipped} puladas · {p.deferred} para depois
      <br />
      <span className="text-sm">Esperado = minutos úteis (janela menos almoço) ÷ (minutos úteis do dia ÷ meta {p.meta}), segundo o servidor.</span>
    </p>
  );
}

function RoteiroCartao({ r, admin }: { r: RouteView; admin: boolean }) {
  const ordenar = useOrdenarRoteiro();
  const refazer = useRefazerRoteiro();
  const original = useMemo(() => pendentesParaOrdenar(r.stops), [r.stops]);
  const [ordem, setOrdem] = useState<ItemOrdem[]>(original);
  useEffect(() => setOrdem(original), [original]);
  const porId = new Map(r.stops.map((s) => [s.id, s]));
  const feitas = r.stops.filter((s) => s.status === 'visitada');
  const outras = r.stops.filter((s) => s.status === 'pulada' || s.status === 'adiada');
  const alterada = mudou(original, ordem);

  return (
    <section className="card-surface space-y-3 p-4" aria-label={`Roteiro de ${r.consultant_name}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-bold">{r.consultant_name}</h3>
        <span className="text-sm text-muted-foreground">
          {r.plan.planned} planejadas · {r.plan.reserve} reserva · ~{String(r.plan.walk_km).replace('.', ',')} km de rua (soma dos trechos em linha reta × {String(r.params.fator_desvio).replace('.', ',')})
        </span>
      </div>
      <p className="text-sm" data-testid="modo-rota">
        <strong>{r.travel_mode === 'carro' ? 'De carro' : 'A pé'}</strong>
        <span className="text-muted-foreground"> — {r.travel?.text ?? `A pé: ${String(r.params.velocidade_kmh).replace('.', ',')} km/h`}</span>
      </p>
      <Progresso r={r} />
      {!r.plan.fits_meta && <p className="text-sm text-warning">⚠ {resumoDaMeta(r.plan, r.progress.meta, r.progress.done)}</p>}

      <ol className="space-y-1">
        {feitas.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
            <span>
              ✓ {s.name}
            </span>
            <span className="text-muted-foreground">feita {s.eta ? `· ${etaTexto(s.eta)}` : ''}</span>
          </li>
        ))}
        {ordem.map((it, i) => {
          const s = porId.get(it.id)!;
          return (
            <li key={it.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                {i + 1 + feitas.length}. {s.name} {s.kind === 'reserva' && <em className="text-muted-foreground">(reserva)</em>}
                {it.fixa && <span title="Fixa"> 📌</span>}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <span className="text-muted-foreground">{etaTexto(s.eta)}</span>
                {admin && (
                  <>
                    <button type="button" aria-label={`Subir ${s.name}`} onClick={() => setOrdem(mover(ordem, i, -1))} className="h-8 w-8 rounded border border-border">
                      ↑
                    </button>
                    <button type="button" aria-label={`Descer ${s.name}`} onClick={() => setOrdem(mover(ordem, i, 1))} className="h-8 w-8 rounded border border-border">
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-pressed={it.fixa}
                      aria-label={`${it.fixa ? 'Soltar' : 'Fixar'} ${s.name}`}
                      onClick={() => setOrdem(alternarFixa(ordem, it.id))}
                      className="h-8 rounded border border-border px-2"
                    >
                      {it.fixa ? 'Soltar' : 'Fixar'}
                    </button>
                  </>
                )}
              </span>
            </li>
          );
        })}
        {outras.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span className="truncate">{s.name}</span>
            <span>
              {ICONE[s.status]}
              {s.status === 'pulada' ? `: ${rotuloMotivo(s.skip_reason)}${s.skip_note ? ` — ${s.skip_note}` : ''}` : ''}
            </span>
          </li>
        ))}
      </ol>

      {admin && (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!alterada || ordenar.isPending}
            onClick={() => ordenar.mutate({ id: r.id, version: r.version, stops: ordem })}
            className="h-10"
          >
            {ordenar.isPending ? 'Salvando…' : 'Salvar ordem'}
          </Button>
          {alterada && (
            <Button variant="outline" onClick={() => setOrdem(original)} className="h-10">
              Descartar mudanças
            </Button>
          )}
          <Button variant="outline" disabled={refazer.isPending} onClick={() => refazer.mutate(r.id)} className="h-10">
            {refazer.isPending ? 'Refazendo a rota…' : 'Refazer rota'}
          </Button>
        </div>
      )}
    </section>
  );
}

const HORAS: (keyof ConfigRota)[] = ['janela_inicio', 'janela_fim', 'almoco_inicio', 'almoco_fim'];
const NUMEROS: [keyof ConfigRota, string][] = [
  ['meta_diaria', 'Meta de visitas por dia'],
  ['minutos_por_visita', 'Minutos por visita'],
  ['velocidade_kmh', 'Velocidade a pé (km/h)'],
  ['fator_desvio', 'Fator de desvio (reta → rua)'],
];
const ROTULO_HORA: Record<string, string> = { janela_inicio: 'Começa às', janela_fim: 'Termina às', almoco_inicio: 'Almoço a partir das', almoco_fim: 'Almoço até as' };

/** Parâmetros do roteiro (contrato §23.1): meta, horários, tempo por visita e as duas permissões. Escrita só de admin. */
function Configuracao({ admin }: { admin: boolean }) {
  const { data, isPending, isError } = useRotaConfig();
  const salvar = useSalvarRotaConfig();
  const [form, setForm] = useState<Partial<ConfigRota>>({});
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);
  if (isPending) return <p className="text-sm text-muted-foreground">Carregando a configuração…</p>;
  if (isError || !data) return <p className="text-sm text-destructive">Não foi possível carregar a configuração.</p>;
  const set = (k: keyof ConfigRota, v: string | number | boolean) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <details className="card-surface p-4">
      <summary className="cursor-pointer text-sm font-bold">Meta e horários do roteiro</summary>
      <div className="mt-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {HORAS.map((k) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`cfg-${k}`}>{ROTULO_HORA[k]}</Label>
              <Input id={`cfg-${k}`} type="time" disabled={!admin} value={String(form[k] ?? '')} onChange={(e) => set(k, e.target.value)} />
            </div>
          ))}
          {NUMEROS.map(([k, rotulo]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`cfg-${k}`}>{rotulo}</Label>
              <Input
                id={`cfg-${k}`}
                type="number"
                step={k === 'velocidade_kmh' || k === 'fator_desvio' ? 0.1 : 1}
                disabled={!admin}
                value={Number(form[k] ?? 0)}
                onChange={(e) => set(k, Number(e.target.value))}
              />
            </div>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={!admin} checked={!!form.gerar_ao_iniciar} onChange={(e) => set('gerar_ao_iniciar', e.target.checked)} />
          Montar o roteiro sozinho quando o consultor iniciar a jornada (se ainda não houver)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={!admin} checked={!!form.consultor_pode_gerar} onChange={(e) => set('consultor_pode_gerar', e.target.checked)} />
          Deixar o consultor montar o próprio dia no celular
        </label>
        <p className="text-sm text-muted-foreground">
          Conta do tempo: (janela − almoço) ÷ meta = minutos por visita, já com o deslocamento. Hoje: {data.meta_diaria} visitas, {data.minutos_por_visita} min parado em cada.
          {data.atualizado_em ? ` Última alteração em ${new Date(data.atualizado_em).toLocaleString('pt-BR')}.` : ''}
        </p>
        {admin && (
          <Button disabled={salvar.isPending} onClick={() => salvar.mutate(form)} className="h-10">
            {salvar.isPending ? 'Salvando…' : 'Salvar configuração'}
          </Button>
        )}
      </div>
    </details>
  );
}

/** Escolha do modo da visita (contrato §31.3). Os presets só preenchem o formulário; o admin revisa e salva. */
function FluxoVisitaConfig({ admin }: { admin: boolean }) {
  const { data, isPending, isError } = useConfigModo();
  const salvar = useSalvarConfigModo();
  const [form, setForm] = useState<ConfigModo | null>(null);
  useEffect(() => {
    if (data) setForm({ fluxo_visita: data.fluxo_visita, justificativa_distancia: data.justificativa_distancia, contato_obrigatorio_em: data.contato_obrigatorio_em, contato_campos: data.contato_campos, fechado_conta_na_meta: data.fechado_conta_na_meta, desfazer_segundos: data.desfazer_segundos, divergencia_alerta_min: data.divergencia_alerta_min, divergencia_alerta_pct: data.divergencia_alerta_pct });
  }, [data]);
  if (isPending) return <p className="text-sm text-muted-foreground">Carregando o modo da visita…</p>;
  if (isError || !data || !form) return <p className="text-sm text-destructive">Não foi possível carregar o modo da visita.</p>;
  const set = (p: Partial<ConfigModo>) => setForm({ ...form, ...p });
  const sel = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm';

  return (
    <details className="card-surface p-4">
      <summary className="cursor-pointer text-sm font-bold">Modo da visita do consultor</summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-muted-foreground">
          <strong>Simples</strong> = jeito do Diego: o consultor escolhe como foi a visita em 1 toque. <strong>Completo</strong> = o nosso, com mais perguntas. Vale para as visitas abertas daqui em diante;
          a exceção por consultor fica na ficha dele. Só funciona com a chave “escolha do modo da visita” ligada no servidor; desligada, todos usam o completo.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={!admin} onClick={() => setForm(data.presets.chefe)} className="h-10">
            Perfil do chefe
          </Button>
          <Button type="button" variant="outline" disabled={!admin} onClick={() => setForm(data.presets.completo)} className="h-10">
            Perfil completo
          </Button>
          <span className="self-center text-xs text-muted-foreground">Só preenche o formulário; confira e salve.</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="fv-fluxo">Modo padrão</Label>
            <select id="fv-fluxo" disabled={!admin} className={sel} value={form.fluxo_visita ?? ''} onChange={(e) => set({ fluxo_visita: (e.target.value || null) as ConfigModo['fluxo_visita'] })}>
              <option value="">Sem escolha (com a chave ligada vale o simples)</option>
              <option value="simples">Simples (jeito do Diego)</option>
              <option value="completo">Completo (nosso)</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fv-just">Visita longe do local (mais de {data.raio_checkin_m ?? 200} m)</Label>
            <select id="fv-just" disabled={!admin} className={sel} value={form.justificativa_distancia} onChange={(e) => set({ justificativa_distancia: e.target.value as ConfigModo['justificativa_distancia'] })}>
              <option value="nao">Só marcar</option>
              <option value="opcional">Pedir o motivo, sem obrigar</option>
              <option value="obrigatoria">Motivo obrigatório (como a Lovable)</option>
            </select>
          </div>
        </div>
        <fieldset className="space-y-1">
          <legend className="text-sm font-bold">Contato de quem atendeu é obrigatório quando o resultado for</legend>
          <div className="flex flex-wrap gap-3">
            {RESULTADOS_COM_CONTATO.map(([k, r]) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="checkbox" disabled={!admin} checked={form.contato_obrigatorio_em.includes(k)} onChange={() => set({ contato_obrigatorio_em: alternar(form.contato_obrigatorio_em, k, RESULTADOS_COM_CONTATO) })} />
                {r}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-1">
          <legend className="text-sm font-bold">Nesses casos, exigir</legend>
          <div className="flex flex-wrap gap-3">
            {CAMPOS_CONTATO.map(([k, r]) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="checkbox" disabled={!admin} checked={form.contato_campos.includes(k)} onChange={() => set({ contato_campos: alternar(form.contato_campos, k, CAMPOS_CONTATO) })} />
                {r}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={!admin} checked={form.fechado_conta_na_meta} onChange={(e) => set({ fechado_conta_na_meta: e.target.checked })} />
          “Estabelecimento fechado” fotografado conta na meta (só no modo simples; “Pular” nunca conta)
        </label>
        <div className="max-w-xs space-y-1">
          <Label htmlFor="fv-desfazer">Segundos para desfazer a conclusão</Label>
          <Input id="fv-desfazer" type="number" min={0} max={30} disabled={!admin} value={form.desfazer_segundos} onChange={(e) => set({ desfazer_segundos: Number(e.target.value) })} />
        </div>
        {form.divergencia_alerta_min !== undefined && form.divergencia_alerta_pct !== undefined && (
          <div className="space-y-1">
            <p className="text-sm font-bold">Alerta de divergência dos cadastros declarados</p>
            <p className="text-sm text-muted-foreground">
              Aparece em “Atenção agora” quando, nos últimos 7 dias (até ontem), um consultor tem pelo menos este número de declarações sem correspondência no Freela E pelo menos esta porcentagem das declaradas. Só vale com o ganho
              declarado ligado no servidor.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="fv-div-min">Mínimo de declarações sem correspondência</Label>
                <Input id="fv-div-min" type="number" min={1} max={1000} disabled={!admin} value={form.divergencia_alerta_min} onChange={(e) => set({ divergencia_alerta_min: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="fv-div-pct">Mínimo de porcentagem (%)</Label>
                <Input id="fv-div-pct" type="number" min={1} max={100} disabled={!admin} value={form.divergencia_alerta_pct} onChange={(e) => set({ divergencia_alerta_pct: Number(e.target.value) })} />
              </div>
            </div>
          </div>
        )}
        {admin && (
          <Button disabled={salvar.isPending} onClick={() => salvar.mutate(form)} className="h-10">
            {salvar.isPending ? 'Salvando…' : 'Salvar modo da visita'}
          </Button>
        )}
      </div>
    </details>
  );
}

/** `/consultores/roteiros` — montar o dia dos consultores e acompanhar o planejado × realizado (UX §5.2, contrato §23.4). */
export function RoteirosEquipe({ praca }: { praca: PracaView }) {
  const { user } = useAuth();
  const admin = !!user?.is_admin;
  const hoje = todaySp();
  const [day, setDay] = useState(hoje);
  const [consultantId, setConsultantId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [modoEscolhido, setModoEscolhido] = useState<ModoDeslocamento | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);

  const { data: consultores } = useConsultores();
  const doPraca = (consultores ?? []).filter((c) => c.praca_id === praca.id && c.active);
  const { data: areas } = useAreas(praca.id);
  const candidatos = useCandidatosRoteiro({ pracaId: praca.id, day, areaId: areaId || undefined });
  const rotas = useRotasDoDia(day, praca.id);
  const montar = useMontarRoteiro();
  const consultor = doPraca.find((c) => c.id === consultantId);
  const meta = rotas.data?.[0]?.progress.meta ?? 30;
  // Sem escolha, vale o modo do roteiro que esse consultor já tem no dia (nunca volta a pé sem querer).
  const existente = rotas.data?.find((r) => r.consultant_id === consultantId);
  const modo: ModoDeslocamento = modoEscolhido ?? existente?.travel_mode ?? 'a_pe';
  const kmhPe = String(rotas.data?.[0]?.params.velocidade_kmh ?? 4.5).replace('.', ',');
  const desvio = String(rotas.data?.[0]?.params.fator_desvio ?? 1.3).replace('.', ',');

  const alternar = (id: string) =>
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const desligado = rotas.isError && /ROUTES_DISABLED|não está habilitado/i.test(apiErrorMessage(rotas.error, ''));

  return (
    <div className="mt-4 space-y-5">
      <Configuracao admin={admin} />
      <FluxoVisitaConfig admin={admin} />

      {desligado ? (
        <p className="card-surface p-4 text-sm">O roteiro do dia está desligado neste servidor. Peça para ligar `FIELD_ROUTES_ENABLED`.</p>
      ) : (
        <>
          <section className="card-surface space-y-3 p-4" aria-label="Montar roteiro">
            <h2 className="text-base font-bold">Montar roteiro</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="rot-dia">Dia</Label>
                <Input id="rot-dia" type="date" min={hoje} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rot-consultor">Consultor</Label>
                <select id="rot-consultor" className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm" value={consultantId} onChange={(e) => setConsultantId(e.target.value)}>
                  <option value="">Escolha…</option>
                  {doPraca.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="rot-area">Área</Label>
                <select id="rot-area" className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                  <option value="">Todas as áreas ativas</option>
                  {(areas ?? []).filter((a) => a.active).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">Como o consultor se desloca</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Modo de deslocamento">
                {MODOS_DESLOCAMENTO.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={modo === m.id}
                    onClick={() => setModoEscolhido(m.id)}
                    className={`h-10 rounded-md border px-4 text-sm font-semibold ${modo === m.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}
                  >
                    {m.rotulo}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {modo === 'carro'
                  ? `De carro: velocidade média do servidor (padrão 25 km/h, sem estacionar) × desvio de rua ${desvio}. Chega antes e cabem mais paradas na janela; o tempo parado em cada visita é o mesmo.`
                  : `A pé: ${kmhPe} km/h × desvio de rua ${desvio}.`}
              </p>
            </fieldset>

            {candidatos.isPending ? (
              <p className="text-sm text-muted-foreground">Carregando estabelecimentos…</p>
            ) : candidatos.isError ? (
              <div className="space-y-2">
                <p className="text-sm text-destructive">{apiErrorMessage(candidatos.error, 'Não foi possível carregar os estabelecimentos.')}</p>
                <Button variant="outline" onClick={() => void candidatos.refetch()}>
                  Tentar de novo
                </Button>
              </div>
            ) : (candidatos.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ainda não há estabelecimentos com localização exata nesta área. Use “Buscar estabelecimentos” e adicione os achados como leads.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    {marcados.size} escolhidos de {candidatos.data!.length} · meta {meta} por dia
                  </span>
                  <span className="flex gap-2">
                    <Button variant="outline" className="h-9" onClick={() => setMarcados(new Set(candidatos.data!.slice(0, Math.ceil(meta * 1.5)).map((c) => c.id)))}>
                      Marcar {Math.min(Math.ceil(meta * 1.5), candidatos.data!.length)} primeiros
                    </Button>
                    <Button variant="outline" className="h-9" onClick={() => setMarcados(new Set())}>
                      Limpar
                    </Button>
                  </span>
                </div>
                <ul className="max-h-72 space-y-1 overflow-y-auto">
                  {candidatos.data!.map((c) => (
                    <li key={c.id}>
                      <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-muted">
                        <input type="checkbox" checked={marcados.has(c.id)} onChange={() => alternar(c.id)} />
                        <span className="min-w-0 flex-1 truncate">
                          {c.name} <span className="text-muted-foreground">{[c.category, c.address].filter(Boolean).join(' · ')}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {admin ? (
              <Button disabled={!consultantId || marcados.size === 0 || montar.isPending} onClick={() => setConfirmando(true)} className="h-10">
                {montar.isPending ? 'Calculando as rotas…' : 'Montar roteiro'}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Só administradores montam roteiros.</p>
            )}
            <p className="text-sm text-muted-foreground">
              Só entram estabelecimentos com localização exata, fora do roteiro de outro consultor no dia. A ordem sai do caminho mais curto em linha reta × {String(rotas.data?.[0]?.params.fator_desvio ?? 1.3).replace('.', ',')}, dentro da janela de trabalho e do almoço; o que não couber vira reserva.
            </p>
          </section>

          <section className="space-y-3" aria-label="Roteiros do dia">
            <h2 className="text-base font-bold">Roteiros de {day.split('-').reverse().join('/')}</h2>
            {rotas.isPending ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : rotas.isError ? (
              <div className="space-y-2">
                <p className="text-sm text-destructive">{apiErrorMessage(rotas.error, 'Não foi possível carregar os roteiros.')}</p>
                <Button variant="outline" onClick={() => void rotas.refetch()}>
                  Tentar de novo
                </Button>
              </div>
            ) : rotas.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum roteiro montado para este dia.</p>
            ) : (
              rotas.data.map((r) => <RoteiroCartao key={r.id} r={r} admin={admin} />)
            )}
          </section>
        </>
      )}

      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Publicar o roteiro?</DialogTitle>
            <DialogDescription>
              Publicar o roteiro de {day.split('-').reverse().join('/')} para {consultor?.name ?? 'o consultor'} com {marcados.size} estabelecimentos ({modo === 'carro' ? 'de carro' : 'a pé'})? Ele vê na tela Hoje ao abrir o aplicativo. Se já havia um roteiro, o conjunto é substituído (o que já foi visitado fica).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
            <Button
              disabled={montar.isPending}
              onClick={() =>
                montar.mutate(
                  { consultant_id: consultantId, day, lead_ids: [...marcados], travel_mode: modo, ...(areaId ? { area_id: areaId } : {}) },
                  { onSuccess: () => { setConfirmando(false); setMarcados(new Set()); } },
                )
              }
            >
              Publicar roteiro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
