'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock, Hourglass, Pause, Play, PowerOff, Plug, Search, UserCheck, type LucideIcon } from 'lucide-react';
import { CabecalhoPagina } from '@/components/praca/CabecalhoPagina';
import { Button } from '@/components/ui/button';
import { useFeaturesMenu } from '@/modules/acesso/application/use-acesso';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useAutomacoes } from '@/modules/crm/application/use-crm';
import {
  AVISO_NADA_LIGADO,
  CATALOGO_JOBS,
  JOBS_ORDEM,
  MENSAGENS,
  avisoDoFreela,
  comoLigar,
  contaDaCadencia,
  detalheTecnico,
  modoDeEnvio,
  situacaoDoJob,
  textoUltimaRodada,
  textoUltimos7Dias,
  type TipoSituacao,
} from '@/modules/crm/domain/automacoes';
import { addDays, daySp } from '@/lib/dates';
import type { AutomacoesView } from '@/modules/crm/infrastructure/crm.api';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

const CARTAO = 'rounded-2xl bg-card p-5 shadow-card';
type Job = AutomacoesView['jobs'][number];

const ICONE_JOB: Record<string, LucideIcon> = { auto_leads_busca: Search, etapas_cadastro: UserCheck, quadro_freela: Plug, sem_resposta: Hourglass };

/** Ícone e cor do selo: a situação é texto + ícone, a cor nunca vai sozinha (UX §3.2.2). */
const SELO: Record<TipoSituacao, { icone: LucideIcon; classe: string }> = {
  desligada: { icone: PowerOff, classe: 'bg-muted text-muted-foreground' },
  parada: { icone: AlertTriangle, classe: 'bg-warning/10 text-warning' },
  falhou: { icone: AlertTriangle, classe: 'bg-destructive/10 text-destructive' },
  nunca: { icone: Clock, classe: 'bg-secondary text-secondary-foreground' },
  ligada: { icone: CheckCircle2, classe: 'bg-success/10 text-success' },
};
const CLASSE_SELO = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold';

/**
 * Automações (UX §3.2): SÓ LEITURA. Se cada automação do Comercial está ligada, quando rodou e o que fez nos últimos 7 dias, mais o modo
 * de envio e as cadências. Nada aqui liga ou desliga (as chaves moram no servidor): nenhum `Switch`. Vale para todas as praças.
 * Sem `features.crm_tasks` não chama a API (nunca sondar 404).
 */
export default function AutomacoesPage() {
  const { features, carregando } = useFeaturesMenu();
  const subtitulo =
    'O que o Praça faz sozinho no Comercial: se está ligado, quando rodou pela última vez e o que fez nos últimos 7 dias. Vale para todas as praças.';
  return (
    <div className="space-y-6">
      <CabecalhoPagina titulo="Automações" subtitulo={subtitulo} />
      {carregando ? (
        <Esqueleto />
      ) : !features.crm_tasks ? (
        <p className={`${CARTAO} text-sm`}>Este recurso ainda não está ligado neste servidor.</p>
      ) : (
        <Conteudo />
      )}
    </div>
  );
}

function Esqueleto() {
  return (
    <div aria-busy="true" className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-56 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function Conteudo() {
  const { user } = useAuth();
  const admin = !!user?.is_admin;
  const q = useAutomacoes({ enabled: true });
  if (q.isPending) return <Esqueleto />;
  if (q.isError) {
    return (
      <div className={`${CARTAO} space-y-2`}>
        <p role="alert" className="text-sm text-destructive">
          {apiErrorMessage(q.error, 'Não deu para carregar as automações.')}
        </p>
        <Button variant="outline" onClick={() => void q.refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  }
  return <Tela v={q.data} admin={admin} />;
}

function Tela({ v, admin }: { v: AutomacoesView; admin: boolean }) {
  const agora = new Date();
  const freela = avisoDoFreela(v);
  const porChave = new Map(v.jobs.map((j) => [j.key, j]));
  const jobs = JOBS_ORDEM.map((k) => porChave.get(k)).filter((j): j is Job => !!j);
  const nadaLigado = jobs.length > 0 && jobs.every((j) => !j.enabled);
  const hoje = daySp(agora);
  const periodo = `${fmt(addDays(hoje, -6))} a ${fmt(hoje)}`;
  const modo = modoDeEnvio(v.send_mode, v.freela_configured);

  return (
    <>
      {v.warnings.map((w) => (
        <p key={w} role="status" className="rounded-xl bg-secondary p-4 text-sm">
          {w}
        </p>
      ))}
      {nadaLigado && (
        <p role="status" className="rounded-xl bg-secondary p-4 text-sm">
          {AVISO_NADA_LIGADO}
        </p>
      )}
      {freela && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <p className="flex min-w-0 items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{freela}</span>
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link href="/freela">Abrir a tela Freela</Link>
          </Button>
        </div>
      )}

      <section aria-labelledby="auto-leads-etapas" className="space-y-3">
        <h2 id="auto-leads-etapas" className="text-lg font-semibold">
          Leads e etapas
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {jobs.map((j) => (
            <CartaoJob key={j.key} j={j} admin={admin} agora={agora} periodo={periodo} />
          ))}
        </div>
      </section>

      <section aria-labelledby="auto-mensagens" className="space-y-3">
        <h2 id="auto-mensagens" className="text-lg font-semibold">
          Mensagens
        </h2>
        <div className={`${CARTAO} flex flex-wrap items-center justify-between gap-3`}>
          <div className="min-w-0 space-y-1">
            <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold">
              {modo.titulo}
              {modo.selo && (
                <span className={`${CLASSE_SELO} ${SELO.parada.classe}`}>
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  {modo.selo}
                </span>
              )}
            </h3>
            <p className="text-sm">{modo.texto}</p>
          </div>
          <Button variant="outline" size="sm" asChild className="w-full sm:w-auto">
            <Link href={modo.acao.href}>{modo.acao.rotulo}</Link>
          </Button>
        </div>

        <div className={CARTAO}>
          <h3 className="text-base font-semibold">Cadências</h3>
          {v.cadences.length === 0 ? (
            <p className="mt-2 text-sm">Nenhuma cadência criada.</p>
          ) : (
            <ul className="mt-2 divide-y">
              {v.cadences.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="font-medium">{c.name}</span>
                  <span className="flex flex-wrap items-center gap-3 text-sm">
                    {c.paused ? (
                      <span className={`${CLASSE_SELO} bg-muted text-muted-foreground`}>
                        <Pause className="h-3.5 w-3.5" aria-hidden />
                        Pausada
                      </span>
                    ) : (
                      <span className={`${CLASSE_SELO} bg-success/10 text-success`}>
                        <Play className="h-3.5 w-3.5" aria-hidden />
                        Rodando
                      </span>
                    )}
                    <span className="text-muted-foreground">{contaDaCadencia(c.active_enrollments)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-sm text-muted-foreground">As cadências-modelo nascem pausadas: ligar é sempre um clique de alguém da equipe.</p>
          <Button variant="outline" size="sm" asChild className="mt-3 w-full sm:w-auto">
            <Link href={`${MENSAGENS}?aba=cadencias`}>{v.cadences.length === 0 ? 'Criar em Mensagens' : 'Ligar ou pausar em Mensagens'}</Link>
          </Button>
        </div>
      </section>
    </>
  );
}

const fmt = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

function CartaoJob({ j, admin, agora, periodo }: { j: Job; admin: boolean; agora: Date; periodo: string }) {
  const info = CATALOGO_JOBS[j.key as keyof typeof CATALOGO_JOBS];
  if (!info) return null;
  const Icone = ICONE_JOB[j.key] ?? Search;
  const sit = situacaoDoJob(j, agora);
  const selo = SELO[sit.tipo];
  const SeloIcone = selo.icone;
  const ligar = comoLigar(j, admin);
  const tecnico = detalheTecnico(j, admin);
  const id = `auto-${j.key}`;
  const ultima = j.last_run;
  const autor = j.key === 'quadro_freela' || j.key === 'etapas_cadastro' ? 'Automático · Freela ou Freela (sincronização)' : 'Automático';

  return (
    <section aria-labelledby={id} className={`${CARTAO} min-w-0`} data-job={j.key}>
      <h3 id={id} className="flex items-center gap-2 text-base font-semibold">
        <Icone className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        {info.titulo}
      </h3>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={`${CLASSE_SELO} ${selo.classe}`}>
          <SeloIcone className="h-3.5 w-3.5" aria-hidden />
          {sit.rotulo}
        </span>
      </div>
      {sit.apoio && <p className="mt-1 text-xs text-muted-foreground">{sit.apoio}</p>}
      <p className="mt-3 text-sm">{info.faz}</p>
      <p className="mt-1 text-sm text-muted-foreground">{info.quando}</p>

      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 border-t pt-3 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Última rodada</dt>
        <dd>
          {ultima && !textoSemConexao(j) ? <ComTempo texto={textoUltimaRodada(j, agora)} iso={ultima.at} /> : textoUltimaRodada(j, agora)}
        </dd>
        <dt className="text-muted-foreground">Últimos 7 dias</dt>
        <dd>{textoUltimos7Dias(j)}</dd>
      </dl>

      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="min-h-11 cursor-pointer py-1 md:min-h-0">ⓘ De onde vem</summary>
        <p className="break-words">
          Última rodada: o registro das rodadas do trabalho. Últimos 7 dias: eventos com o autor {autor} na ficha dos leads, de {periodo}.
        </p>
      </details>

      {admin && ligar && (
        <details className="mt-1 text-sm">
          <summary className="min-h-11 cursor-pointer py-1 font-medium md:min-h-0">Como ligar</summary>
          <p className="break-words text-muted-foreground">{ligar}</p>
        </details>
      )}
      {!admin && !j.enabled && <p className="mt-2 text-sm text-muted-foreground">{info.paraLigar}</p>}
      {tecnico && (
        <details className="mt-1 text-sm">
          <summary className="min-h-11 cursor-pointer py-1 font-medium md:min-h-0">Detalhe técnico</summary>
          <pre className="whitespace-pre-wrap break-words rounded-md bg-muted p-2 font-mono text-xs">{tecnico}</pre>
        </details>
      )}
    </section>
  );
}

const textoSemConexao = (j: Job) => (j.last_run?.summary as { nao_configurado?: unknown } | null | undefined)?.nao_configurado === true;

/** A data da rodada dentro de `<time dateTime>`: o texto já começa por "hoje 14h02". */
function ComTempo({ texto, iso }: { texto: string; iso: string }) {
  const [quando, ...resto] = texto.split(' · ');
  return (
    <>
      <time dateTime={iso}>{quando}</time>
      {resto.length > 0 ? ` · ${resto.join(' · ')}` : ''}
    </>
  );
}
