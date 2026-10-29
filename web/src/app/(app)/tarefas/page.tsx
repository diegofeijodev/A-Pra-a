'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  FilePlus2,
  Flame,
  Hourglass,
  Inbox,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { focarSemPular, proximoFoco } from '@/components/crm/foco-da-lista';
import { LinhaTarefa } from '@/components/crm/LinhaTarefa';
import { ResumoDoDia } from '@/components/crm/ResumoDoDia';
import { CabecalhoPagina } from '@/components/praca/CabecalhoPagina';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { todaySp } from '@/lib/dates';
import { useUiStore } from '@/lib/ui-store';
import { useFeaturesMenu } from '@/modules/acesso/application/use-acesso';
import { ROTA } from '@/modules/acesso/domain/enderecos';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useAcoesAdiadas } from '@/modules/crm/application/use-acoes-adiadas';
import { useAnuncio } from '@/modules/crm/application/use-anuncio';
import { enviosAoFecharAba, useAdiarLead, useFeito, useMarcarEnviada, useTarefas } from '@/modules/crm/application/use-crm';
import {
  AVISO_T5_SEM_FREELA,
  CONFIRMACAO_ENVIADA,
  ITENS_VISIVEIS,
  OPCOES_FEITO,
  TEXTOS_GRUPO,
  anuncioDaAcao,
  apoioDaLinha,
  chaveDaTarefa,
  contaDasTarefas,
  linkWhatsApp,
  menuDepois,
  menuQueFica,
  motivoDaTarefa,
  notaDoPassoLimpo,
  opcoesAdiar,
  pessoaDaConsulta,
  rotuloAbrirEntrada,
  textoAdiado,
  textoNadaSeu,
  textoPrimeiroContato,
  tituloDaContagem,
} from '@/modules/crm/domain/tarefas';
import type { ContatoFeito, ItemTarefaView, TarefaFeita, TipoTarefa } from '@/modules/crm/infrastructure/crm.api';
import { diaCurto } from '@/modules/planos/domain/planos';
import { useActivePraca } from '@/modules/pracas/application/use-pracas';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import { useUsers } from '@/modules/users/application/use-users';

const CARTAO = 'rounded-2xl bg-card shadow-card';

const ICONE_GRUPO: Record<TipoTarefa, LucideIcon> = {
  send: MessageCircle,
  cadence_send: Send,
  hot_visit: Flame,
  next_step: CalendarClock,
  stalled: Hourglass,
  first_vacancy: FilePlus2,
};
const ICONE_FEITO: Record<string, LucideIcon> = { call: Phone, msg_out: MessageCircle, visit: MapPin };

/** O que a linha mostra enquanto espera o Desfazer. */
interface Espera {
  texto: string;
  nota?: string;
  rotuloAbrir?: string;
}

/**
 * Tarefas (UX §3.1, contrato §47.3, desenho A5): "o que eu faço agora?". As tarefas vêm antes do resumo (achado 1): no `lg` o resumo
 * fica numa coluna à direita; no celular, no fim, com o link "Ver o resumo do dia ↓". Só com `features.crm_tasks`: desligada, nenhuma
 * chamada a `/v1/crm/*` (nunca sondar 404).
 */
export default function TarefasPage() {
  const { features, carregando } = useFeaturesMenu();
  const hoje = todaySp();
  const subtitulo = (
    <>
      Hoje, {diaCurto(hoje)}
      <span className="hidden sm:inline"> · o que precisa de você no Comercial</span>
    </>
  );

  if (carregando || !features.crm_tasks) {
    return (
      <div className="space-y-6">
        <CabecalhoPagina titulo="Tarefas" subtitulo={subtitulo} />
        {carregando ? (
          <div aria-busy="true" className="h-40 animate-pulse rounded-2xl bg-muted" />
        ) : (
          <p className={`${CARTAO} p-5 text-sm`}>Este recurso ainda não está ligado neste servidor.</p>
        )}
      </div>
    );
  }
  return <TelaTarefas hoje={hoje} subtitulo={subtitulo} />;
}

function TelaTarefas({ hoje, subtitulo }: { hoje: string; subtitulo: ReactNode }) {
  const { user } = useAuth();
  const { praca, isPending: lendoPracas } = useActivePraca();
  const hojePerson = useUiStore((s) => s.hojePerson);
  const setHojePerson = useUiStore((s) => s.setHojePerson);
  const abrirLead = useUiStore((s) => s.openLead);
  const { data: users } = useUsers();
  const person = pessoaDaConsulta(hojePerson, user?.id);

  const [anuncio, anunciar] = useAnuncio();
  const [menuAberto, setMenuAberto] = useState<string | null>(null);
  const [whatsAbertos, setWhatsAbertos] = useState<ReadonlySet<string>>(() => new Set());
  const [expandidos, setExpandidos] = useState<ReadonlySet<TipoTarefa>>(() => new Set());
  const [focoDepois, setFocoDepois] = useState<string | null>(null);

  const acoes = useAcoesAdiadas<Espera>({ antesDeSumir: (chave) => setFocoDepois(proximoFoco(chave, '#tudo-em-dia, #nada-seu')) });
  const tarefas = useTarefas(praca?.id, person, { enabled: true, pausado: acoes.esperando > 0 || menuAberto !== null });
  const feito = useFeito();
  const marcar = useMarcarEnviada();
  const adiar = useAdiarLead();

  // A lista de outra praça (ou da outra pílula), guardada enquanto a nova chega, não aparece com o título desta.
  const r = tarefas.isPlaceholderData ? undefined : tarefas.data;
  const { esquecerAusentes } = acoes;
  useEffect(() => {
    if (!r) return;
    const presentes = new Set(r.groups.flatMap((g) => g.items.map((i) => chaveDaTarefa(g.task, i))));
    esquecerAusentes(presentes);
    setMenuAberto((m) => menuQueFica(m, presentes));
  }, [r, esquecerAusentes]);

  // A linha saiu: o foco vai ao nome da seguinte, ao h2 do próximo grupo ou ao "Tudo em dia" (UX §3.1.8). Nunca cai no `body`.
  useEffect(() => {
    if (!focoDepois) return;
    focarSemPular(focoDepois);
    setFocoDepois(null);
  }, [focoDepois, acoes.feitas]);

  const grupos = (r?.groups ?? []).map((g) => {
    const visiveis = g.items.filter((i) => !acoes.feitas.has(chaveDaTarefa(g.task, i)));
    return { ...g, visiveis, total: g.total - (g.items.length - visiveis.length) };
  });
  const conta = contaDasTarefas(grupos);

  const marcarMenu = useCallback((chave: string, aberto: boolean) => setMenuAberto((m) => menuDepois(m, chave, aberto)), []);
  const faltamDepois = () => conta.total - acoes.esperando - 1;

  function agendarEnviada(item: ItemTarefaView) {
    const sendId = item.send_id;
    if (!sendId) return;
    acoes.agendar(chaveDaTarefa('send', item), {
      meta: { texto: `✓ ${CONFIRMACAO_ENVIADA}` },
      enviar: (urgente) => (urgente ? enviosAoFecharAba.marcarEnviada(sendId) : marcar.mutateAsync(sendId)),
    });
    anunciar(anuncioDaAcao(CONFIRMACAO_ENVIADA, item.lead_name, faltamDepois()));
  }

  // Só as tarefas que são grupo desta tela (`first_contact` é o "Feito" da Entrada).
  function agendarFeito(task: Extract<TarefaFeita, TipoTarefa>, item: ItemTarefaView, kind: ContatoFeito) {
    const opcao = OPCOES_FEITO.find((o) => o.kind === kind);
    if (!opcao) return;
    const input = { lead_id: item.lead_id, task, kind };
    const passo = task === 'next_step';
    acoes.agendar(chaveDaTarefa(task, item), {
      meta: {
        texto: `✓ ${opcao.confirmacao}`,
        nota: passo ? notaDoPassoLimpo(item.next_step?.what) : undefined,
        rotuloAbrir: passo ? 'Marcar o próximo passo' : 'Abrir o lead',
      },
      enviar: (urgente) => (urgente ? enviosAoFecharAba.feito(input) : feito.mutateAsync(input)),
    });
    anunciar(anuncioDaAcao(opcao.confirmacao, item.lead_name, faltamDepois()));
  }

  function agendarAdiar(task: TipoTarefa, item: ItemTarefaView, ate: string) {
    acoes.agendar(chaveDaTarefa(task, item), {
      meta: { texto: textoAdiado(ate) },
      enviar: (urgente) => (urgente ? enviosAoFecharAba.adiar(item.lead_id, ate) : adiar.mutateAsync({ id: item.lead_id, until: ate })),
    });
    anunciar(`${textoAdiado(ate)}.`);
  }

  function copiar(texto: string) {
    if (!navigator.clipboard) {
      toast.error('Não deu para copiar. Selecione o texto e copie.');
      return;
    }
    void navigator.clipboard.writeText(texto).then(
      () => toast.success('Mensagem copiada.'),
      () => toast.error('Não deu para copiar. Selecione o texto e copie.'),
    );
  }

  function linha(task: TipoTarefa, item: ItemTarefaView) {
    const chave = chaveDaTarefa(task, item);
    const s = acoes.situacao(chave);
    const soLeitura = task === 'cadence_send' || !!item.readonly;
    const envio = task === 'send';
    const abriu = whatsAbertos.has(chave);
    const dono = item.owner_id ? users?.find((u) => u.id === item.owner_id)?.name : null;
    return (
      <LinhaTarefa
        key={chave}
        chave={chave}
        nome={item.lead_name}
        onAbrirLead={() => abrirLead(item.lead_id)}
        motivo={motivoDaTarefa(task, item, hoje)}
        apoio={apoioDaLinha({ ownerId: item.owner_id, nomeDoDono: dono, person, telefone: item.phone })}
        mensagem={envio || soLeitura ? item.text : null}
        onCopiarMensagem={item.text ? () => copiar(item.text ?? '') : undefined}
        telefone={item.phone}
        whatsapp={
          envio || soLeitura
            ? {
                texto: item.text,
                principal: true,
                destaque: envio ? !abriu : true,
                onAbrir: envio ? () => setWhatsAbertos((prev) => new Set(prev).add(chave)) : undefined,
              }
            : {}
        }
        aviso={envio && abriu ? 'Mandou? Toque em Feito.' : null}
        feito={
          soLeitura
            ? null
            : envio
              ? { onFeito: () => agendarEnviada(item), destaque: abriu || !linkWhatsApp(item.phone) }
              : {
                  opcoes: OPCOES_FEITO.map((o) => ({ id: o.kind, rotulo: o.rotulo, icone: ICONE_FEITO[o.kind] })),
                  onEscolher: (kind) => agendarFeito(task as Extract<TarefaFeita, TipoTarefa>, item, kind as ContatoFeito),
                }
        }
        adiar={
          soLeitura
            ? null
            : { opcoes: opcoesAdiar(hoje).map((o) => ({ id: o.ate, rotulo: o.rotulo })), onEscolher: (ate) => agendarAdiar(task, item, ate) }
        }
        confirmacao={
          s && s.tipo !== 'erro'
            ? {
                texto: s.meta.texto,
                nota: s.meta.nota,
                rotuloAbrir: s.meta.rotuloAbrir,
                onDesfazer:
                  s.tipo === 'pendente'
                    ? () => {
                        if (acoes.desfazer(chave)) anunciar('Desfeito.');
                      }
                    : undefined,
                // Abrir o lead aceita o que foi marcado: manda já (o painel pode marcar um passo novo, que o envio atrasado limparia).
                onAbrir: s.meta.rotuloAbrir
                  ? () => {
                      acoes.enviarAgora(chave);
                      abrirLead(item.lead_id);
                    }
                  : undefined,
              }
            : null
        }
        erro={s?.tipo === 'erro' ? { mensagem: s.mensagem, onTentarDeNovo: () => acoes.tentarDeNovo(chave) } : null}
        onMenu={(aberto) => marcarMenu(chave, aberto)}
      />
    );
  }

  let lista: ReactNode;
  if (tarefas.isError && !r) {
    lista = (
      <div className={`${CARTAO} space-y-2 p-5`}>
        <p role="alert" className="text-sm text-destructive">
          {apiErrorMessage(tarefas.error, 'Não deu para carregar as tarefas. Verifique a internet e tente de novo.')}
        </p>
        <Button variant="outline" onClick={() => void tarefas.refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  } else if (!r) {
    lista = (
      <div aria-busy="true" className="space-y-4">
        <div className="h-48 animate-pulse rounded-2xl bg-muted" />
        <div className="h-48 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  } else {
    const deOutros = r.counts.all - r.counts.me;
    const vazio = conta.total === 0;
    // As mensagens da cadência (só leitura) não contam como tarefa, mas ainda pedem o WhatsApp: com elas na tela, nada de "Tudo em dia".
    const comCadencia = grupos.some((g) => g.task === 'cadence_send' && g.visiveis.length > 0);
    lista = (
      <>
        {vazio &&
          (person === 'me' && deOutros > 0 ? (
            <div className={`${CARTAO} space-y-3 p-5`}>
              <p id="nada-seu" tabIndex={-1} className="text-sm">
                {textoNadaSeu(deOutros)}
              </p>
              <Button variant="outline" onClick={() => setHojePerson('all')}>
                Ver todas
              </Button>
            </div>
          ) : comCadencia ? null : (
            <section aria-labelledby="tudo-em-dia" className={`${CARTAO} space-y-3 p-8 text-center`}>
              <CheckCircle2 className="mx-auto h-8 w-8 text-success" aria-hidden />
              <h2 id="tudo-em-dia" tabIndex={-1} className="text-lg font-semibold">
                Tudo em dia
              </h2>
              <p className="text-sm text-muted-foreground">
                Nenhuma tarefa para hoje nesta praça. Quando uma mensagem vencer, um cliente gostar da visita ou uma conversa parar, ela
                aparece aqui.
              </p>
              <Button variant="outline" asChild>
                {r.entrada.novos > 0 ? <Link href="/entrada">{rotuloAbrirEntrada(r.entrada.novos)}</Link> : <Link href="/funil">Ver o funil</Link>}
              </Button>
            </section>
          ))}

        {grupos
          .filter((g) => g.visiveis.length > 0)
          .map((g) => {
            const Icone = ICONE_GRUPO[g.task];
            const textos = TEXTOS_GRUPO[g.task];
            const aberto = expandidos.has(g.task);
            const mostrar = aberto ? g.visiveis : g.visiveis.slice(0, ITENS_VISIVEIS);
            const corte = g.total > g.visiveis.length && (aberto || g.visiveis.length <= ITENS_VISIVEIS);
            return (
              <section key={g.task} data-grupo={g.task} aria-labelledby={`grupo-${g.task}`} className={`${CARTAO} overflow-hidden`}>
                <div className="flex items-center gap-2 px-5 pt-5">
                  <Icone className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <h2 id={`grupo-${g.task}`} tabIndex={-1} className="text-lg font-semibold">
                    {textos.titulo}
                  </h2>
                  <Badge variant="secondary">
                    {g.total}
                    <span className="sr-only">{g.task === 'cadence_send' ? ' mensagens' : ' tarefas'}</span>
                  </Badge>
                </div>
                <p className="px-5 pb-3 text-sm text-muted-foreground">{textos.explicacao}</p>
                {g.task === 'first_vacancy' && !r.freela_configured && (
                  <p className="mx-5 mb-3 rounded-lg bg-secondary p-3 text-sm">{AVISO_T5_SEM_FREELA}</p>
                )}
                <ul className="divide-y border-t">{mostrar.map((item) => linha(g.task, item))}</ul>
                {!aberto && g.visiveis.length > ITENS_VISIVEIS && (
                  <Button variant="ghost" className="w-full rounded-none border-t" onClick={() => setExpandidos((prev) => new Set(prev).add(g.task))}>
                    Ver mais {g.visiveis.length - ITENS_VISIVEIS}
                  </Button>
                )}
                {corte && (
                  <p className="border-t px-5 py-3 text-xs text-muted-foreground">
                    Mostrando {g.visiveis.length} de {g.total}. As outras aparecem quando estas saírem.
                  </p>
                )}
              </section>
            );
          })}

        {(!vazio || comCadencia) && r.entrada.novos > 0 && (
          <section aria-labelledby="primeiro-contato" className={`${CARTAO} space-y-3 p-5`}>
            <div className="flex items-center gap-2">
              <Inbox className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              <h2 id="primeiro-contato" className="text-lg font-semibold">
                Primeiro contato
              </h2>
            </div>
            <p className="text-sm">{textoPrimeiroContato(r.entrada.novos)}</p>
            <Button variant="outline" asChild>
              <Link href="/entrada">Abrir a Entrada</Link>
            </Button>
          </section>
        )}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <CabecalhoPagina titulo="Tarefas" subtitulo={subtitulo} comPraca />
      {lendoPracas ? (
        <div aria-busy="true" className="h-40 animate-pulse rounded-2xl bg-muted" />
      ) : !praca ? (
        <div className={`${CARTAO} space-y-3 p-5`}>
          <p className="text-sm">Nenhuma praça ainda. As tarefas são por praça.</p>
          <Button variant="outline" asChild>
            <Link href={ROTA.pracas}>Abrir Praças</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <div role="group" aria-label="De quem" className="flex flex-wrap gap-2">
              {(['me', 'all'] as const).map((p) => {
                const ativa = person === p;
                const n = r ? (ativa ? conta.total : p === 'me' ? r.counts.me : r.counts.all) : null;
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={ativa}
                    onClick={() => setHojePerson(p === 'me' ? (user?.id ?? 'all') : 'all')}
                    className={`flex min-h-11 items-center gap-2 rounded-full border px-3 py-1 text-sm md:min-h-9 ${ativa ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}
                  >
                    {ativa && <span aria-hidden>✓</span>}
                    {p === 'me' ? 'Minhas' : 'Todas'} {n !== null && <b>{n.toLocaleString('pt-BR')}</b>}
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-muted-foreground">Em “Minhas” entram as suas e as que ainda não têm dono.</p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="min-w-0 space-y-4 lg:col-span-2">
              {/* Sem `aria-live`: a região do fim da página já diz "Faltam N tarefas" (dois anúncios por toque cansam). */}
              <div>
                {r && conta.total > 0 && (
                  <>
                    <p className="text-lg font-semibold">{tituloDaContagem(conta.total)}</p>
                    <p className="text-sm text-muted-foreground">{conta.texto}</p>
                  </>
                )}
              </div>
              <a
                href="#resumo-do-dia"
                className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline lg:hidden"
              >
                Ver o resumo do dia ↓
              </a>
              {lista}
            </div>
            <div className="min-w-0 self-start lg:sticky lg:top-8">
              <ResumoDoDia pracaId={praca.id} pracaNome={praca.name} />
            </div>
          </div>
        </>
      )}
      <p aria-live="polite" className="sr-only">
        {anuncio}
      </p>
    </div>
  );
}
