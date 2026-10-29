'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AlertTriangle, BriefcaseBusiness, Clock, Inbox, Plus, Search, Zap } from 'lucide-react';
import { ROTA } from '@/modules/acesso/domain/enderecos';
import { todaySp, WD_SHORT, wdOf } from '@/lib/dates';
import { useUiStore } from '@/lib/ui-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useFeaturesMenu } from '@/modules/acesso/application/use-acesso';
import { useCatalog } from '@/modules/catalog/application/use-catalog';
import { useSelosFunil } from '@/modules/crm/application/use-crm';
import {
  isCritical,
  isStalled,
  useLeadMetrics,
  useLeads,
  type LeadListView,
} from '@/modules/leads/application/use-leads';
import {
  SEM_DADO,
  corDaBolinha,
  diasParado,
  estadoDoQuadro,
  nomeSeloFreela,
  textosDasMetricas,
  totalDaEtapa,
  type SeloDoLead,
} from '@/modules/leads/domain/funil';
import { useActivePraca } from '@/modules/pracas/application/use-pracas';
import { useUsers } from '@/modules/users/application/use-users';
import { Avatar } from '@/components/praca/bits';
import { CabecalhoPagina } from '@/components/praca/CabecalhoPagina';
import { MoveLeadDialog } from '@/components/praca/MoveLeadDialog';
import { NovoLeadDialog } from '@/components/praca/NovoLeadDialog';

type Etapa = { n: number; name: string; color: string };

const CARTAO = 'rounded-2xl bg-card shadow-card';
const SELECT = 'min-h-11 rounded-md border border-input bg-background px-3 text-sm md:min-h-9';

/** "qui 29/10" a partir de "YYYY-MM-DD". */
function diaCurto(dia: string): string {
  const [, m, d] = dia.split('-');
  return `${WD_SHORT[wdOf(dia)]} ${d}/${m}`;
}

/**
 * Funil de contratantes — visual da Lovable (UX §3.4), mesma lógica de antes.
 *
 * As seis métricas saem de `GET /v1/leads/metrics` (a média de dias até cadastrar
 * precisa da base inteira, não da página filtrada); o quadro lê `GET /v1/leads`.
 * Busca, dono e classificação continuam filtro de tela. Os selos do automático vêm
 * de `GET /v1/crm/badges`, só com `features.crm_tasks` (nunca sondar 404). Estados
 * (UX §3.4): sem praça, carregando, erro, praça sem lead e filtro sem resultado
 * (`estadoDoQuadro`); os números ficam "—" até a resposta chegar e no erro.
 * A cor da etapa só vai para a bolinha (achado 9); abaixo de `md` o quadro vira
 * acordeão por etapa e o caminho de um toque é o "Mover para etapa" do painel
 * (WCAG 2.5.7, achado 10).
 */
export default function FunilPage() {
  const { praca, isPending: pracasPending } = useActivePraca();
  const openLead = useUiStore((s) => s.openLead);
  const { features } = useFeaturesMenu();
  const { data: users } = useUsers();
  const catalogQ = useCatalog();
  const catalog = catalogQ.data;
  const [q, setQ] = useState('');
  const [owner, setOwner] = useState('all');
  const [classe, setClasse] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);
  const [pending, setPending] = useState<{ id: string; name: string; to: number } | null>(null);
  const [novo, setNovo] = useState(false);

  const metricsQ = useLeadMetrics(praca?.id);
  const leadsQuery = useLeads(
    { praca_id: praca?.id, archived: showArchived ? 'true' : 'false' },
    { enabled: !!praca?.id },
  );
  const all = leadsQuery.data;
  const selos = useSelosFunil(praca?.id, { enabled: features.crm_tasks });
  const selosPorLead = useMemo(() => {
    const mapa = new Map<string, SeloDoLead>();
    for (const s of selos.data?.items ?? []) mapa.set(s.lead_id, s);
    return mapa;
  }, [selos.data]);

  const leads = useMemo(
    () =>
      (all ?? []).filter((l) => {
        if (!showArchived && l.archived) return false;
        if (owner !== 'all' && l.owner_id !== owner) return false;
        if (classe !== 'all' && l.classe !== classe) return false;
        const t = q.trim().toLowerCase();
        if (t && !`${l.name} ${l.city} ${l.decisor}`.toLowerCase().includes(t)) return false;
        return true;
      }),
    [all, q, owner, classe, showArchived],
  );

  const subtitulo = 'Bares, restaurantes, hotéis, buffets e casas de evento da praça, etapa por etapa.';
  if (pracasPending || !praca) {
    return (
      <div className="space-y-6">
        <CabecalhoPagina titulo="Funil" subtitulo={subtitulo} />
        {pracasPending ? (
          <div aria-busy="true" className="h-40 animate-pulse rounded-2xl bg-muted" />
        ) : (
          <div className={`${CARTAO} space-y-3 p-5`}>
            <p className="text-sm">Nenhuma praça ainda. O funil é por praça.</p>
            <Button variant="outline" asChild>
              <Link href={ROTA.pracas}>Abrir Praças</Link>
            </Button>
          </div>
        )}
      </div>
    );
  }

  const people = (users ?? []).filter((u) => u.active);
  const etapas: Etapa[] = catalog?.funnel_stages ?? [];
  const move = (id: string, name: string, to: number, from: number) => {
    if (from === to) return;
    setPending({ id, name, to });
  };
  const hoje = todaySp();
  // No erro, "—" (nunca o número velho de uma leitura que falhou, nem 0).
  const numeros = textosDasMetricas(metricsQ.isError ? undefined : metricsQ.data);
  const estado = estadoDoQuadro({
    erro: leadsQuery.isError || (catalogQ.isError && !catalog),
    lido: !!all && !!catalog,
    total: all?.length ?? 0,
    filtrados: leads.length,
  });
  const limparFiltros = () => {
    setQ('');
    setOwner('all');
    setClasse('all');
  };

  const cartoesDa = (n: number, arrastavel: boolean) =>
    leads
      .filter((l) => l.stage === n)
      .map((l) => (
        <LeadCard
          key={l.id}
          lead={l}
          selo={selosPorLead.get(l.id)}
          hoje={hoje}
          arrastavel={arrastavel}
          onDragStart={() => setDrag(l.id)}
          onDragEnd={() => {
            setDrag(null);
            setSobre(null);
          }}
          onOpen={() => openLead(l.id)}
        />
      ));
  const somaDa = (n: number) => leads.filter((l) => l.stage === n).reduce((a, l) => a + l.est_value, 0);
  const qtdDa = (n: number) => leads.filter((l) => l.stage === n).length;

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Funil"
        subtitulo={subtitulo}
        comPraca
        acoes={
          <>
            <Button onClick={() => setNovo(true)}>
              <Plus /> Novo lead
            </Button>
            <Button variant="outline" asChild>
              <Link href="/entrada">
                <Inbox /> Entrada de leads
              </Link>
            </Button>
          </>
        }
      />

      <section aria-label="Números do funil">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Numero rotulo="Leads no funil" valor={numeros.total} conta="sem os arquivados" />
          <Numero rotulo="Contatado → cadastrado" valor={numeros.contatado} conta="contatados que viraram cadastrados" />
          <Numero rotulo="Cadastrado → ativo" valor={numeros.ativo} conta="cadastrados que viraram clientes ativos" />
          <Numero rotulo="Dias até cadastrar" valor={numeros.dias} conta="média dos leads cadastrados, sem o tempo parado" />
          <Numero
            rotulo="Parados há 7+ dias"
            valor={numeros.parados}
            conta="sem contato há 7 dias ou mais"
            alerta={numeros.alertaParados}
          />
          <Numero rotulo="Valor estimado" valor={numeros.valor} conta="estimativa pela classificação, etapas 1 a 6" />
        </div>
        {metricsQ.isError && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p role="alert" className="text-sm text-destructive">
              Não deu para carregar os números do funil.
            </p>
            <Button variant="outline" size="sm" onClick={() => void metricsQ.refetch()}>
              Tentar de novo
            </Button>
          </div>
        )}
        <details className="mt-3 text-sm text-muted-foreground">
          <summary className="flex min-h-11 cursor-pointer items-center md:min-h-0">ⓘ Como contamos</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            <li>Contatado → cadastrado: dos leads que passaram por “Contatado”, quantos chegaram a “Cadastrado”.</li>
            <li>Cadastrado → ativo: dos leads que chegaram a “Cadastrado”, quantos viraram clientes ativos.</li>
            <li>Dias até cadastrar: média, nos leads cadastrados, dos dias entre entrar e cadastrar, sem o tempo parado.</li>
            <li>Parados há 7+ dias: leads abertos sem contato há 7 dias ou mais.</li>
            <li>Valor estimado: soma, por classificação, dos leads das etapas 1 a 6 (não é receita fechada).</li>
            <li>Fonte: leads desta praça, agora.</li>
          </ul>
        </details>
      </section>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-11 min-w-60 flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 md:min-h-9">
            <Search size={14} className="text-muted-foreground" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Buscar por nome, cidade ou decisor"
              placeholder="Buscar por nome, cidade ou decisor"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <select aria-label="Dono" value={owner} onChange={(e) => setOwner(e.target.value)} className={SELECT}>
            <option value="all">Todos os donos</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select aria-label="Classificação" value={classe} onChange={(e) => setClasse(e.target.value)} className={SELECT}>
            <option value="all">Todas as classificações</option>
            {(catalog?.classes ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <label className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-4 w-4" />
            Mostrar arquivados
          </label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="hidden md:inline">Arraste o cartão para mudar de etapa, ou abra o lead e use “Mover para etapa”.</span>
          <span className="md:hidden">Toque no lead e use “Mover para etapa”.</span>
        </p>
      </div>

      {estado === 'erro' ? (
        <div className={`${CARTAO} space-y-2 p-5`}>
          <p role="alert" className="text-sm text-destructive">
            Não deu para carregar os leads. Verifique a internet e tente de novo.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              void leadsQuery.refetch();
              if (!catalog) void catalogQ.refetch();
            }}
          >
            Tentar de novo
          </Button>
        </div>
      ) : estado === 'carregando' ? (
        <div aria-busy="true">
          <div className="hidden gap-4 overflow-hidden pb-4 md:flex">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-72 w-72 shrink-0 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
          <div className="space-y-3 md:hidden">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        </div>
      ) : estado === 'sem-leads' ? (
        <div className={`${CARTAO} space-y-3 p-5`}>
          <p className="font-medium">Nenhum lead nesta praça ainda.</p>
          <p className="text-sm text-muted-foreground">
            Os leads entram pela visita dos representantes, pelo formulário, pela busca de estabelecimentos ou por planilha.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/entrada">
                <Inbox aria-hidden /> Entrada de leads
              </Link>
            </Button>
            <Button onClick={() => setNovo(true)}>
              <Plus aria-hidden /> Novo lead
            </Button>
          </div>
        </div>
      ) : estado === 'sem-resultado' ? (
        <div className={`${CARTAO} space-y-3 p-5`}>
          <p className="text-sm">Nenhum lead com esses filtros.</p>
          <Button variant="outline" onClick={limparFiltros}>
            Limpar filtros
          </Button>
        </div>
      ) : (
        <>
          {/* md+: quadro com rolagem lateral, alcançável pelo teclado (2.1.1) */}
          <div
            role="region"
            aria-label="Quadro do funil"
            tabIndex={0}
            className="hidden gap-4 overflow-x-auto pb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex"
          >
            {etapas.map((st) => (
              <section
                key={st.n}
                aria-labelledby={`etapa-${st.n}`}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => drag && setSobre(st.n)}
                onDrop={() => {
                  const l = drag ? leads.find((x) => x.id === drag) : undefined;
                  if (l) move(l.id, l.name, st.n, l.stage);
                  setDrag(null);
                  setSobre(null);
                }}
                className={`flex w-72 shrink-0 flex-col rounded-2xl bg-muted/60 p-2 ${sobre === st.n ? 'ring-2 ring-primary' : ''}`}
              >
                <div className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={corDaBolinha(st)} />
                    <h2 id={`etapa-${st.n}`} className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                      {st.n}. {st.name}
                    </h2>
                    <Badge variant="secondary">{qtdDa(st.n)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {totalDaEtapa(qtdDa(st.n), somaDa(st.n))}
                  </p>
                </div>
                <div className="flex-1 space-y-2">
                  {qtdDa(st.n) === 0 ? <p className="px-2 py-3 text-xs text-muted-foreground">Nenhum lead nesta etapa.</p> : cartoesDa(st.n, true)}
                </div>
              </section>
            ))}
          </div>

          {/* < md: uma etapa aberta por vez, sem rolagem lateral */}
          <div className="space-y-3 md:hidden">
            {etapas.map((st) => (
              <details key={st.n} name="etapas-funil" className={`${CARTAO} group`} open={st.n === (etapas.find((e) => qtdDa(e.n) > 0)?.n ?? etapas[0]?.n)}>
                <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 py-3">
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={corDaBolinha(st)} />
                  <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                    {st.n}. {st.name}
                  </span>
                  <Badge variant="secondary">{qtdDa(st.n)}</Badge>
                </summary>
                <div className="space-y-2 px-3 pb-3">
                  <p className="px-1 text-xs text-muted-foreground">
                    {totalDaEtapa(qtdDa(st.n), somaDa(st.n))}
                  </p>
                  {qtdDa(st.n) === 0 ? <p className="px-1 py-2 text-xs text-muted-foreground">Nenhum lead nesta etapa.</p> : cartoesDa(st.n, false)}
                </div>
              </details>
            ))}
          </div>
        </>
      )}

      {pending && <MoveLeadDialog leadId={pending.id} leadName={pending.name} to={pending.to} onClose={() => setPending(null)} />}
      {novo && <NovoLeadDialog onClose={() => setNovo(false)} />}
    </div>
  );
}

function Numero({ rotulo, valor, conta, alerta }: { rotulo: string; valor: string; conta: string; alerta?: boolean }) {
  return (
    <div className={`${CARTAO} p-4`}>
      <p className="text-sm text-muted-foreground">{rotulo}</p>
      <p className={`mt-1 flex items-center gap-1.5 text-2xl font-semibold ${alerta ? 'text-warning' : ''}`}>
        {alerta ? <AlertTriangle className="h-5 w-5" aria-hidden /> : null}
        {valor === SEM_DADO ? (
          <>
            <span aria-hidden>{SEM_DADO}</span>
            <span className="sr-only">sem dado</span>
          </>
        ) : (
          valor
        )}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{conta}</p>
    </div>
  );
}

const SELO = 'inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground';

function LeadCard({
  lead,
  selo,
  hoje,
  arrastavel,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  lead: LeadListView;
  selo: SeloDoLead | undefined;
  hoje: string;
  arrastavel: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) {
  const { data: users } = useUsers();
  const dono = users?.find((u) => u.id === lead.owner_id);
  const crit = isCritical(lead);
  const warn = isStalled(lead);
  const freela = nomeSeloFreela(selo?.freela_hirings);
  const vencido = !!lead.next_step && lead.next_step.date < hoje;
  return (
    <button
      type="button"
      draggable={arrastavel}
      onDragStart={arrastavel ? onDragStart : undefined}
      onDragEnd={arrastavel ? onDragEnd : undefined}
      onClick={onOpen}
      className={`w-full rounded-xl bg-card p-3 text-left shadow-card hover:ring-1 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        crit ? 'ring-1 ring-destructive' : ''
      } ${lead.archived ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start gap-1.5">
        <p className="line-clamp-2 min-w-0 flex-1 text-sm font-medium">{lead.name}</p>
        {crit ? (
          <>
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <span className="sr-only">Crítico.</span>
          </>
        ) : null}
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {lead.city} · {lead.decisor}
      </p>
      {selo?.last_stage_auto || freela ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {selo?.last_stage_auto ? (
            <span className={SELO}>
              <Zap className="h-3 w-3" aria-hidden />
              Automático
            </span>
          ) : null}
          {freela ? (
            <span className={SELO}>
              <BriefcaseBusiness className="h-3 w-3" aria-hidden />
              {freela}
            </span>
          ) : null}
        </div>
      ) : null}
      <p className={`mt-2 text-xs ${vencido ? 'text-destructive' : 'text-muted-foreground'}`}>
        {lead.next_step
          ? `→ ${lead.next_step.what} · ${diaCurto(lead.next_step.date)}${vencido ? ' · vencido' : ''}`
          : lead.lost_reason
            ? `Perdido: ${lead.lost_reason}${lead.reheat_at ? ` · reaquecer em ${diaCurto(lead.reheat_at)}` : ''}`
            : 'Sem próximo passo'}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <Avatar person={dono} size={20} />
          <span className="truncate">{dono ? dono.name.split(' ')[0] : 'Sem dono'}</span>
        </span>
        <span className={`inline-flex shrink-0 items-center gap-1 ${crit ? 'text-destructive' : warn ? 'text-warning' : ''}`}>
          {warn || crit ? <Clock className="h-3 w-3" aria-hidden /> : null}
          {diasParado(lead.stalled_days)}
        </span>
      </div>
    </button>
  );
}
