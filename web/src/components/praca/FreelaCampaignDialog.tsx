'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  AvisoCampo,
  AvisoFrio,
  contarVariantes,
  FreelaNaoConfigurado,
  inputCls,
  MAX_VARIANTES,
  pacingFromSettings,
  pracaCities,
  pracaCity,
  pracaUf,
} from './FreelaBits';
import { useCatalog } from '@/modules/catalog/application/use-catalog';
import {
  useDisparoPreview,
  EMPTY_FILTERS,
  type DisparoFilters,
} from '@/modules/disparos/application/use-disparos';
import {
  useAudienceOptions,
  useAudiencePreview,
  useCreateFreelaCampaign,
  useFreelaStatus,
  useSetFreelaCampaignState,
  AUDIENCE_LABELS,
  FREELA_CREATABLE_AUDIENCES,
  FREELA_MODULES,
  type CreateFreelaCampaignInput,
  type CreateFreelaCampaignResult,
  type FreelaFiltersInput,
  type FreelaPacingInput,
} from '@/modules/freela/application/use-freela';
import { useSettings, useTemplates } from '@/modules/messages/application/use-messages';
import { usePracas, useActivePraca } from '@/modules/pracas/application/use-pracas';
import { useUsers } from '@/modules/users/application/use-users';

/**
 * Campanha de WhatsApp no Freela — a caixa que monta uma campanha de ativação
 * (§18.2) a partir do Praça.
 *
 * Dois públicos muito diferentes cabem aqui:
 *
 * - **Leads do funil** (`EXTERNAL_LIST`): a lista sai do Praça com o MESMO
 *   filtro do disparo (§13, `lead_filters`), inclusive lista de bloqueio e
 *   trava de 30 dias. É por isso que o bloco de filtros é o mesmo de
 *   `Disparos.tsx`;
 * - **base do Freela** (os quatro públicos internos): a consulta é lá, e o
 *   Praça só manda o recorte da cobertura da praça (cidades, raio, UF, módulo).
 *
 * O texto é o modelo do Praça convertido (§18.3, `template_id`) ou texto
 * escrito aqui (`whatsapp_template`, até 3 variantes separadas por uma linha
 * `---`) — nunca os dois: o servidor precisa de um só.
 *
 * O botão "Campanha de WhatsApp no Freela" do cartão de campanha (aba
 * Campanhas) abre esta mesma caixa pré-preenchida — daí `initial`.
 */

export interface FreelaCampaignInitial {
  name: string;
  praca_id: string;
  /** Público do Freela: `PROVIDERS_NEVER_APPLIED` ou `CONTRACTORS_NEVER_PUBLISHED`. */
  audience: string;
  whatsapp_template: string;
}

export interface FreelaCampaignDialogProps {
  open: boolean;
  onClose: () => void;
  initial?: FreelaCampaignInitial;
}

/** Recorte da cobertura da praça sobre o público do Freela. */
type Recorte = 'cidades' | 'raio' | 'uf' | 'nenhum';

/** Raio padrão do recorte "perto da sede" — o mesmo do desenho (§7.3). */
const RAIO_KM = 50;

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export function FreelaCampaignDialog({ open, onClose, initial }: FreelaCampaignDialogProps) {
  // O formulário monta ao abrir: assim o `useState` já nasce com o `initial` do
  // cartão de campanha, sem efeito de sincronização.
  if (!open) return null;
  return <Form onClose={onClose} initial={initial} />;
}

function Form({ onClose, initial }: { onClose: () => void; initial?: FreelaCampaignInitial }) {
  const { data: status } = useFreelaStatus();
  const { data: catalog } = useCatalog();
  const { data: pracas } = usePracas();
  const { praca: ativa } = useActivePraca();
  const { data: users } = useUsers();
  const { data: templates } = useTemplates();
  const { data: settings } = useSettings();
  const create = useCreateFreelaCampaign();
  const setState = useSetFreelaCampaignState();
  const contar = useAudiencePreview();

  const [name, setName] = useState(initial?.name ?? '');
  const [pracaId, setPracaId] = useState('');
  const [audience, setAudience] = useState(initial?.audience ?? 'EXTERNAL_LIST');
  const [recorte, setRecorte] = useState<Recorte>('cidades');
  const [modulo, setModulo] = useState('all');
  const [leadFilters, setLeadFilters] = useState<DisparoFilters>({
    ...EMPTY_FILTERS,
    praca_id: initial?.praca_id ?? 'all',
  });
  const [modo, setModo] = useState<'texto' | 'modelo'>(initial?.whatsapp_template ? 'texto' : 'modelo');
  const [texto, setTexto] = useState(initial?.whatsapp_template ?? '');
  const [templateId, setTemplateId] = useState('');
  // `Required`: quando o operador mexe num campo, o corpo leva o ritmo
  // INTEIRO — meio ritmo faria o Freela completar o resto com o padrão dele.
  const [pacing, setPacing] = useState<Required<FreelaPacingInput> | null>(null);
  // Público do Freela: a conversão do modelo só é buscada a pedido (a rota da
  // prévia varre o funil do Praça, que não tem nada a ver com esse público).
  const [verTexto, setVerTexto] = useState(false);
  const [result, setResult] = useState<CreateFreelaCampaignResult | null>(null);

  const configured = status?.configured === true;
  const lista = templates ?? [];
  // O valor só existe depois que a API responde — daí o `||` em vez de estado
  // inicial (mesmo padrão de `Disparos.tsx`).
  const praca = (pracas ?? []).find((p) => p.id === (pracaId || initial?.praca_id || ativa?.id));
  const pracaAtual = praca?.id ?? '';
  const tplId = templateId || lista[0]?.id || '';
  const externa = audience === 'EXTERNAL_LIST';
  // `pacing` só deixa de ser nulo quando o operador MEXE num campo. Ausente no
  // corpo, o servidor converte o ritmo de `GET /v1/settings` sozinho (§18.3) —
  // mandar o que o cliente calculou (ainda por cima com o cache frio, quando
  // `pacingFromSettings` cai nos padrões embutidos) seria trocar a configuração
  // da conta por um palpite. Enquanto as configurações não chegam, os campos
  // nem aparecem: mostrar número que não vai subir é pior do que não mostrar.
  const ritmoPadrao = settings ? pacingFromSettings(settings) : null;
  const ritmo = pacing ?? ritmoPadrao;
  const cidades = pracaCities(praca);
  const sede = pracaCity(praca);
  const uf = pracaUf(praca);

  const options = useAudienceOptions(audience);

  /**
   * A conversão do modelo do Praça (§18.3) vem da MESMA rota que a prévia do
   * disparo (`POST /v1/disparos/preview` com `mode: "freela"`): é o servidor
   * que converte, então o que se revê aqui é o texto que vai subir. Em
   * `EXTERNAL_LIST` ela ainda devolve o tamanho do público — é o mesmo filtro.
   *
   * Três cuidados para a prévia ser FIEL à criação:
   *
   * 1. `split: true` — a criação converte sempre com a variante B
   *    (`toFreelaTemplate(text_a, text_b, …)`), e o servidor degrada sozinho
   *    quando o modelo não tem B (`split = dto.split && hasB`). Com `false` a
   *    caixa esconderia metade do que vai subir;
   * 2. a praça do filtro é a praça DA CAMPANHA: é de `dto.praca_id` que a
   *    criação tira `{{praca}}` e `{{cidade}}`. Com `all` a prévia mostraria
   *    `⟨praca⟩` e um aviso falso de variável desconhecida;
   * 3. em "escrever aqui" vai `text` no lugar de `template_id` (§13): a rota
   *    converte o texto pelo MESMO caminho da criação da campanha, então o
   *    quadro "como vai sair pelo Freela" vale nos dois modos. `dupes` fica
   *    zerado — a trava de 30 dias é por modelo, e aqui não há modelo.
   */
  const leadFiltersFinal: DisparoFilters = { ...leadFilters, praca_id: pracaAtual || 'all' };
  // Nos quatro públicos internos a prévia não conta nada que valha (o funil do
  // Praça não é o público), e ainda assim varre o funil inteiro no servidor a
  // cada tecla — então ali ela só sai a pedido.
  const previaLigada = !!pracaAtual && (externa || (modo === 'modelo' && verTexto));
  const { data: previa } = useDisparoPreview({
    filters: externa ? leadFiltersFinal : { ...EMPTY_FILTERS, praca_id: pracaAtual || 'all' },
    template_id: previaLigada && modo === 'modelo' ? tplId : '',
    ...(previaLigada && modo === 'texto' ? { text: texto } : {}),
    split: true,
    mode: 'freela',
  });

  const f = (p: Partial<DisparoFilters>) => setLeadFilters((x) => ({ ...x, ...p }));
  const setRitmo = (p: Partial<FreelaPacingInput>) => {
    if (ritmo) setPacing({ ...ritmo, ...p });
  };

  const filtros = (): FreelaFiltersInput | undefined => {
    if (externa) return undefined;
    const out: FreelaFiltersInput = {};
    if (recorte === 'cidades' && cidades.length) out.cities = cidades;
    if (recorte === 'uf' && uf) out.ufs = [uf];
    if (recorte === 'raio' && sede) out.radius = { city: sede, km: RAIO_KM };
    if (modulo !== 'all') out.modules = [modulo];
    return Object.keys(out).length ? out : undefined;
  };

  /**
   * Recorte escolhido que não produz campo NENHUM — praça sem cobertura, sem
   * sede ou sem UF. Se isso passasse, `filters` sumiria do corpo e a campanha
   * pegaria a base inteira do Freela (nacional), que é o pior desfecho de um
   * disparo frio. "Sem recorte — base inteira" continua existindo: só precisa
   * ser escolhido de propósito.
   */
  const recorteVazio =
    !externa &&
    ((recorte === 'cidades' && !cidades.length) ||
      (recorte === 'uf' && !uf) ||
      (recorte === 'raio' && !sede));

  const variantes = contarVariantes(texto);
  const semTexto = modo === 'texto' ? !texto.trim() : !tplId;
  // A janela só é conferida quando o ritmo VAI no corpo: omitido, quem monta é
  // o servidor e ela é válida por construção. `window_end_hour <= start` é
  // `502 INVALID_SEND_WINDOW` do Freela.
  const janelaOk = !pacing || pacing.window_end_hour > pacing.window_start_hour;
  const podeCriar =
    configured &&
    name.trim().length >= 3 &&
    !!pracaAtual &&
    !semTexto &&
    !recorteVazio &&
    janelaOk &&
    !create.isPending;

  const criar = (startNow: boolean) => {
    if (!podeCriar) return;
    const recorteAtual = filtros();
    const body: CreateFreelaCampaignInput = {
      name: name.trim(),
      praca_id: pracaAtual,
      audience,
      // Nunca os dois: `EXTERNAL_LIST` usa o filtro do funil, os outros usam o
      // recorte da base do Freela.
      ...(externa ? { lead_filters: leadFiltersFinal } : recorteAtual ? { filters: recorteAtual } : {}),
      ...(modo === 'modelo' ? { template_id: tplId } : { whatsapp_template: texto.trim() }),
      // Ausente = o ritmo de `GET /v1/settings` convertido pelo servidor.
      ...(pacing ? { pacing } : {}),
      start_now: startNow,
    };
    create.mutate(body, {
      onSuccess: (r) => {
        setResult(r);
        toast.success(startNow ? 'Campanha criada e iniciada no Freela.' : 'Rascunho criado no Freela.');
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div
        className="h-full w-full max-w-3xl overflow-y-auto border-l border-border bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-extrabold">Campanha de WhatsApp no Freela</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            fechar
          </button>
        </div>

        {!configured && <FreelaNaoConfigurado />}

        {result ? (
          <Resultado
            result={result}
            onClose={onClose}
            onStart={() =>
              setState.mutate(
                { id: result.campaign.freela_id, action: 'start' },
                {
                  onSuccess: (c) => {
                    setResult({ ...result, campaign: c, start_error: null });
                    toast.success('Campanha iniciada.');
                  },
                },
              )
            }
            starting={setState.isPending}
          />
        ) : (
          <>
            <div className="mt-4">
              <AvisoFrio />
            </div>

            {/* 1. nome e praça */}
            <p className="tag mt-4 text-muted-foreground">1. Nome e praça</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-muted-foreground">
                Nome da campanha
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  placeholder="Reativar bares de BH"
                  className={`mt-1 w-full ${inputCls}`}
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Praça
                <select
                  value={pracaAtual}
                  onChange={(e) => setPracaId(e.target.value)}
                  className={`mt-1 w-full ${inputCls}`}
                >
                  {(pracas ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {!!name.trim() && name.trim().length < 3 && (
              <AvisoCampo>O nome precisa ter ao menos 3 letras.</AvisoCampo>
            )}

            {/* 2. público */}
            <p className="tag mt-4 text-muted-foreground">2. Público</p>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className={`mt-2 w-full ${inputCls}`}
            >
              {FREELA_CREATABLE_AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {AUDIENCE_LABELS[a] ?? a}
                </option>
              ))}
            </select>

            {externa ? (
              <>
                {/* A trava de 30 dias é POR MODELO (`audienceForFreela` só roda
                    o plano quando há `template_id`); com texto escrito aqui o
                    servidor aplica apenas a lista de bloqueio, e prometer a
                    trava treinaria o operador a confiar no que não existe. */}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {modo === 'modelo'
                    ? 'A lista sai do funil do Praça, com a lista de bloqueio e a trava de 30 dias do mesmo modelo — o mesmo filtro do disparo.'
                    : 'A lista sai do funil do Praça, com a lista de bloqueio e sem telefone repetido. A trava de 30 dias só vale quando o texto vem de um modelo do Praça — com texto escrito aqui, quem recebeu há 5 dias recebe de novo.'}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {/* A praça do filtro NÃO é escolha à parte: a campanha é uma
                      só e é dela que `{{praca}}`/`{{cidade}}` saem na criação.
                      Deixar "todas" aqui faria a prévia mostrar uma cidade que
                      não é a que vai sair. */}
                  <label className="text-xs text-muted-foreground">
                    Praça
                    <select
                      value={pracaAtual}
                      disabled
                      className={`mt-1 w-full ${inputCls} disabled:opacity-60`}
                    >
                      {(pracas ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <span className="mt-0.5 block text-[10px]">a mesma da campanha</span>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Etapa
                    <select
                      value={leadFilters.stage}
                      onChange={(e) => f({ stage: Number(e.target.value) })}
                      className={`mt-1 w-full ${inputCls}`}
                    >
                      <option value={0}>todas</option>
                      {(catalog?.funnel_stages ?? []).map((st) => (
                        <option key={st.n} value={st.n}>
                          {st.n}. {st.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Classificação
                    <select
                      value={leadFilters.classe}
                      onChange={(e) => f({ classe: e.target.value })}
                      className={`mt-1 w-full ${inputCls}`}
                    >
                      <option value="all">todas</option>
                      {(catalog?.classes ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Origem
                    <select
                      value={leadFilters.origem}
                      onChange={(e) => f({ origem: e.target.value })}
                      className={`mt-1 w-full ${inputCls}`}
                    >
                      <option value="all">todas</option>
                      {(catalog?.origens ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Dono
                    <select
                      value={leadFilters.owner_id}
                      onChange={(e) => f({ owner_id: e.target.value })}
                      className={`mt-1 w-full ${inputCls}`}
                    >
                      <option value="all">todos</option>
                      {(users ?? [])
                        .filter((u) => u.active)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Dias parado (mínimo)
                    <input
                      type="number"
                      min={0}
                      value={leadFilters.min_stalled}
                      onChange={(e) =>
                        f({ min_stalled: Math.min(3650, Math.max(0, Number(e.target.value) || 0)) })
                      }
                      className={`mt-1 w-full ${inputCls}`}
                    />
                  </label>
                </div>
                {previa ? (
                  <p className="mt-2 rounded-md bg-secondary/60 px-3 py-2 text-xs">
                    <b className="font-display text-sm">{previa.audience} leads selecionados</b> ·{' '}
                    {modo === 'modelo' ? (
                      <>
                        {previa.sendable} podem receber · {previa.blocked} na lista de bloqueio ·{' '}
                        {previa.dupes} já receberam este modelo nos últimos 30 dias
                      </>
                    ) : (
                      <>
                        {previa.sendable} podem receber · {previa.blocked} na lista de bloqueio ·
                        sem trava de 30 dias (o texto não vem de um modelo)
                      </>
                    )}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Este público é da base do Freela. O recorte abaixo é a cobertura da praça.
                </p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {(
                    [
                      ['cidades', `Cidades da praça (${cidades.length})`],
                      ['raio', `Raio de ${RAIO_KM} km da sede`],
                      ['uf', `UF${uf ? ` (${uf})` : ''}`],
                      ['nenhum', 'Sem recorte — base inteira'],
                    ] as const
                  ).map(([id, label]) => (
                    <label key={id} className="flex items-center gap-1.5 text-xs">
                      <input
                        type="radio"
                        checked={recorte === id}
                        onChange={() => setRecorte(id)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {recorteVazio && (
                  <AvisoCampo>
                    Esta praça não tem{' '}
                    {recorte === 'uf' ? 'UF' : recorte === 'raio' ? 'cidade-sede' : 'cobertura'}{' '}
                    cadastrada, então este recorte não filtra nada e a campanha iria para a base
                    inteira do Freela. Cadastre a cobertura da praça, escolha outro recorte — ou
                    marque “Sem recorte — base inteira” de propósito.
                  </AvisoCampo>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className="text-xs text-muted-foreground">
                    Módulo
                    <select
                      value={modulo}
                      onChange={(e) => setModulo(e.target.value)}
                      className={`ml-2 ${inputCls}`}
                    >
                      <option value="all">os dois</option>
                      {FREELA_MODULES.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => contar.mutate({ audience, filters: filtros() })}
                    disabled={!configured || contar.isPending || recorteVazio}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-bold disabled:opacity-40"
                  >
                    {contar.isPending ? 'Contando…' : 'Contar'}
                  </button>
                  {contar.data && (
                    <span className="text-xs">
                      <b className="font-display text-sm">{contar.data.total} pessoas</b> ·{' '}
                      {contar.data.byChannel.WHATSAPP} com WhatsApp
                      {contar.data.semCoordenada > 0 &&
                        ` · ${contar.data.semCoordenada} sem coordenada ficaram de fora do raio`}
                    </span>
                  )}
                </div>
                {recorte === 'cidades' && options.data && (
                  <p className="mt-2 rounded-md bg-secondary/60 px-3 py-2 text-[11px] text-muted-foreground">
                    Na base do Freela:{' '}
                    {cidades
                      .map((c) => {
                        const achada = options.data.cities.find((x) => fold(x.city) === fold(c));
                        return `${c} ${achada ? achada.total : 0}`;
                      })
                      .join(' · ')}
                  </p>
                )}
              </>
            )}

            {/* 3. texto */}
            <p className="tag mt-4 text-muted-foreground">3. Texto</p>
            <div className="mt-2 flex flex-wrap gap-3">
              <label className="flex items-center gap-1.5 text-xs">
                <input type="radio" checked={modo === 'modelo'} onChange={() => setModo('modelo')} />
                modelo do Praça (convertido)
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                <input type="radio" checked={modo === 'texto'} onChange={() => setModo('texto')} />
                escrever aqui
              </label>
            </div>

            {modo === 'modelo' ? (
              <>
                <select
                  value={tplId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className={`mt-2 w-full ${inputCls}`}
                >
                  {lista.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {!externa && !verTexto && (
                  <button
                    type="button"
                    onClick={() => setVerTexto(true)}
                    disabled={!tplId}
                    className="mt-2 rounded-md border border-border px-3 py-1.5 text-xs font-bold disabled:opacity-40"
                  >
                    Ver como vai sair pelo Freela
                  </button>
                )}
                {previaLigada && previa?.freela && (
                  <div className="mt-2 rounded-md border border-border bg-background/50 p-3">
                    <p className="tag text-muted-foreground">Como vai sair pelo Freela</p>
                    <p className="mt-2 whitespace-pre-wrap text-xs">{previa.freela.template}</p>
                    {previa.freela.unsupported_variables.length > 0 && (
                      <p className="mt-2 rounded-md bg-warning/12 px-3 py-2 text-[11px] text-warning">
                        O Freela não conhece{' '}
                        {previa.freela.unsupported_variables.map((v) => `{{${v}}}`).join(' · ')} —
                        essas variáveis vão sair no texto do jeito que estão.
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  maxLength={4000}
                  rows={6}
                  placeholder={'Oi {{primeiro_nome}}, aqui é da Freela…\n---\nOi {{primeiro_nome}}! Tudo certo?'}
                  className={`mt-2 w-full font-mono ${inputCls}`}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {texto.length}/4000 · {variantes} variação(ões) — separe até {MAX_VARIANTES} por
                  uma linha só com <code className="font-mono">---</code> (espaços em volta valem).
                  O Freela conhece{' '}
                  <code className="font-mono">{'{{nome}}'}</code>,{' '}
                  <code className="font-mono">{'{{primeiro_nome}}'}</code> e{' '}
                  <code className="font-mono">{'{{cidade}}'}</code>.
                </p>
                {variantes > MAX_VARIANTES && (
                  <AvisoCampo>
                    O Freela usa só as {MAX_VARIANTES} primeiras variantes — as outras são
                    descartadas em silêncio, sem recusar a campanha.
                  </AvisoCampo>
                )}
              </>
            )}

            {/* 4. ritmo */}
            <p className="tag mt-4 text-muted-foreground">4. Ritmo</p>
            {!ritmo ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Lendo o ritmo das Configurações do Praça…
              </p>
            ) : (
              <>
                <div className="mt-2 grid gap-2 sm:grid-cols-4">
                  <label className="text-xs text-muted-foreground">
                    Mensagens por hora
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={ritmo.messages_per_hour}
                      onChange={(e) =>
                        setRitmo({
                          messages_per_hour: Math.min(60, Math.max(1, Number(e.target.value) || 1)),
                        })
                      }
                      className={`mt-1 w-full ${inputCls}`}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Teto por dia
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={ritmo.daily_cap}
                      onChange={(e) =>
                        setRitmo({
                          daily_cap: Math.min(1000, Math.max(1, Number(e.target.value) || 1)),
                        })
                      }
                      className={`mt-1 w-full ${inputCls}`}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Janela — início
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={ritmo.window_start_hour}
                      onChange={(e) =>
                        setRitmo({
                          window_start_hour: Math.min(23, Math.max(0, Number(e.target.value) || 0)),
                        })
                      }
                      className={`mt-1 w-full ${inputCls}`}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Janela — fim
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={ritmo.window_end_hour}
                      onChange={(e) =>
                        setRitmo({
                          window_end_hour: Math.min(24, Math.max(1, Number(e.target.value) || 1)),
                        })
                      }
                      className={`mt-1 w-full ${inputCls}`}
                    />
                  </label>
                </div>
                <label className="mt-2 flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={ritmo.weekdays_only}
                    onChange={(e) => setRitmo({ weekdays_only: e.target.checked })}
                  />
                  só dias úteis (o Freela não separa sábado de domingo)
                </label>
                {!janelaOk && (
                  <AvisoCampo>
                    A janela precisa terminar depois de começar (início 0–23, fim 1–24) — o Freela
                    recusa o contrário.
                  </AvisoCampo>
                )}
                {!pacing && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Sem mexer em nada, o ritmo não sobe no corpo: quem converte é a API, a partir das
                    Configurações do Praça na hora de criar.
                  </p>
                )}
              </>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => criar(true)}
                disabled={!podeCriar}
                className="rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40"
              >
                {create.isPending ? 'Criando…' : 'Criar e iniciar'}
              </button>
              <button
                type="button"
                onClick={() => criar(false)}
                disabled={!podeCriar}
                className="rounded-md border border-border px-3 py-2 text-sm font-bold disabled:opacity-40"
              >
                Salvar rascunho
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-2 py-2 text-sm text-muted-foreground"
              >
                cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * O que a criação devolveu. Fica na tela em vez de a caixa fechar sozinha
 * porque é aqui que aparece o que ficou de fora: telefone inválido, telefone
 * repetido, variável que o Freela não conhece — e o `start_error`, que é a
 * campanha que NASCEU e não começou (ela ficou em `DRAFT` lá, §18.2).
 */
function Resultado({
  result,
  onClose,
  onStart,
  starting,
}: {
  result: CreateFreelaCampaignResult;
  onClose: () => void;
  onStart: () => void;
  starting: boolean;
}) {
  const c = result.campaign;
  return (
    <div className="mt-4">
      {result.start_error && (
        <div className="rounded-md bg-danger/10 p-3 text-xs text-danger">
          <b className="font-display text-sm">A campanha nasceu, mas não começou.</b>
          <p className="mt-1">{result.start_error}</p>
          <p className="mt-1">
            Ela está em rascunho no Freela e nada sai até alguém iniciar.
          </p>
          <button
            type="button"
            onClick={onStart}
            disabled={starting}
            className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-40"
          >
            {starting ? 'Iniciando…' : 'Tentar iniciar de novo'}
          </button>
        </div>
      )}

      <div className="mt-3 rounded-lg border border-border bg-background/50 p-3">
        <p className="font-display text-sm font-extrabold">{c.name}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {c.status} · {c.audience} · id do Freela {c.freela_id}
        </p>
        <ul className="mt-2 space-y-1 text-xs">
          <li>
            Destinatários:{' '}
            <b>{result.recipients_count === null ? 'contados pelo Freela' : result.recipients_count}</b>
          </li>
          <li>Telefones inválidos descartados: {result.invalid_phones}</li>
          <li>Telefones repetidos descartados: {result.duplicate_phones}</li>
        </ul>
        {result.unsupported_variables.length > 0 && (
          <p className="mt-2 rounded-md bg-warning/12 px-3 py-2 text-[11px] text-warning">
            O Freela não conhece {result.unsupported_variables.map((v) => `{{${v}}}`).join(' · ')} —
            essas variáveis saíram no texto do jeito que estão.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-4 rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"
      >
        fechar
      </button>
    </div>
  );
}
