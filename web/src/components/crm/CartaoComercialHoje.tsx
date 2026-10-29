'use client';

import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import { ListTodo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { todaySp } from '@/lib/dates';
import { useFeaturesMenu } from '@/modules/acesso/application/use-acesso';
import { ROTA } from '@/modules/acesso/domain/enderecos';
import { useResumoCrm } from '@/modules/crm/application/use-crm';
import {
  TITULO_CARTAO,
  fonteDoCartao,
  linhaDeTarefas,
  linhasDoResumoCartao,
  somarGrupos,
  subtituloDoCartao,
} from '@/modules/crm/domain/comercial-hoje';
import { fetchTarefas } from '@/modules/crm/infrastructure/crm.api';
import { usePracas } from '@/modules/pracas/application/use-pracas';

/**
 * "Comercial hoje" do Dashboard (UX §3.3): tarefas, leads novos e mudanças de etapa DO DIA, com a conta e a fonte. Só existe com
 * `features.commercial` E `features.crm_tasks` (desligado, nada é chamado). Segue o "Praça" do Dashboard (`pracaId` vazio = todas) e
 * NÃO segue o período. As tarefas vêm de uma consulta por praça (a rota exige `praca_id`), com as mesmas chaves da tela Tarefas; o
 * resumo, do `GET /v1/crm/summary` sem praça. Se falhar, só o cartão avisa: o resto do Dashboard continua.
 */
export function CartaoComercialHoje({ pracaId }: { pracaId: string | null }) {
  const { features } = useFeaturesMenu();
  if (!features.commercial || !features.crm_tasks) return null;
  return <Conteudo pracaId={pracaId || null} />;
}

const CARTAO = 'rounded-2xl bg-card p-5 shadow-card';

function Conteudo({ pracaId }: { pracaId: string | null }) {
  const dia = todaySp();
  const { data: pracas, isPending: lendoPracas } = usePracas();
  const ids = pracaId ? [pracaId] : (pracas ?? []).map((p) => p.id);
  const resumo = useResumoCrm(pracaId, dia, { enabled: true });
  const tarefas = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['crm-tasks', id, 'all'],
      queryFn: () => fetchTarefas(id, 'all'),
      refetchInterval: 60_000,
    })),
  });

  const nome = pracaId ? (pracas?.find((p) => p.id === pracaId)?.name ?? null) : null;
  const r = resumo.isPlaceholderData ? undefined : resumo.data;
  const tarefasProntas = !lendoPracas && tarefas.every((t) => t.data);
  const erro = resumo.isError || tarefas.some((t) => t.isError);

  const refazer = () => {
    void resumo.refetch();
    tarefas.forEach((t) => void t.refetch());
  };

  let corpo;
  if (erro && !(r && tarefasProntas)) {
    corpo = (
      <div className="mt-4 space-y-2">
        <p role="alert" className="text-sm text-destructive">
          Não deu para carregar o Comercial de hoje.
        </p>
        <Button variant="outline" onClick={refazer}>
          Tentar de novo
        </Button>
      </div>
    );
  } else if (!r || !tarefasProntas) {
    corpo = <div aria-busy="true" className="mt-4 h-44 animate-pulse rounded-2xl bg-muted" />;
  } else {
    const linhas = [linhaDeTarefas(somarGrupos(tarefas.map((t) => t.data!.groups))), ...linhasDoResumoCartao(r)];
    const lido = new Date(Math.max(...tarefas.map((t) => t.dataUpdatedAt), 0));
    corpo = (
      <>
        <dl className="mt-4 grid divide-y sm:grid-cols-3 sm:gap-4 sm:divide-y-0">
          {linhas.map((l) => (
            <div key={l.chave} className="flex flex-wrap items-baseline justify-between gap-x-3 py-3 first:pt-0 sm:block sm:py-0">
              <dt className="text-sm text-muted-foreground">{l.rotulo}</dt>
              <dd className="text-2xl font-semibold sm:mt-1 sm:text-3xl">{l.numero}</dd>
              <dd className="basis-full break-words text-xs text-muted-foreground">{l.conta}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <details className="text-xs text-muted-foreground">
            <summary className="min-h-11 cursor-pointer py-1 md:min-h-0">ⓘ De onde vem</summary>
            <p className="break-words">{fonteDoCartao(dia, tarefas.length > 0 ? lido : null)}</p>
          </details>
          <Button asChild className="w-full sm:w-auto">
            <Link href={ROTA.tarefas}>Abrir tarefas</Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <section aria-labelledby="comercial-hoje-titulo" className={CARTAO}>
      <h2 id="comercial-hoje-titulo" className="flex items-center gap-2 text-lg font-semibold">
        <ListTodo className="h-5 w-5 text-primary" aria-hidden />
        {TITULO_CARTAO}
      </h2>
      <p className="text-sm text-muted-foreground">{subtituloDoCartao(dia, nome)}</p>
      {corpo}
    </section>
  );
}
