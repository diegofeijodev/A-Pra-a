'use client';

import { ArrowLeft, FileSpreadsheet, Pencil, Search } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AreasAtuacao } from '@/components/praca/AreasAtuacao';
import { BuscaEstabelecimentos } from '@/components/praca/BuscaEstabelecimentos';
import { DadosDaPraca } from '@/components/praca/DadosDaPraca';
import { PlanoAbertura } from '@/components/praca/PlanoAbertura';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { todaySp } from '@/lib/dates';
import { RADIUS_KM } from '@/lib/geo';
import { useUiStore } from '@/lib/ui-store';
import { useFeaturesMenu, useListaClientes } from '@/modules/acesso/application/use-acesso';
import { podeOperar } from '@/modules/acesso/domain/acesso';
import { ROTA } from '@/modules/acesso/domain/enderecos';
import { useAuth } from '@/modules/auth/application/use-auth';
import { diaCurto } from '@/modules/planos/domain/planos';
import { usePracas, useSetActivePraca, type PracaView } from '@/modules/pracas/application/use-pracas';
import { cidadeUf, linhaClientes, ROTULO_SITUACAO_PRACA, situacaoDaPraca } from '@/modules/pracas/domain/status-praca';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

/**
 * Detalhe da praça (Lovable `pracas.$id.tsx`, UX §4.3, arquitetura §5 E5.2). Cabeçalho com a situação (pelas datas) e os botões da
 * Lovable: [Editar praça] (no lugar do seletor de situação), [Importar planilha] (ligado, abre a Entrada) e [Buscar clientes no mapa]
 * (o nosso `BuscaEstabelecimentos`, mapa aberto). [Atualizar dados do Google] sai (decisão 5). Tabela de clientes da lista do §34.6
 * (só com `features.map_pins`: desligada, a rota responde 404 e não é chamada). Embaixo, recolhidos: "Áreas de atuação" e o
 * "Plano de abertura (11 etapas)" (o conteúdo da `/praca` de antes da E7). A coluna "Origem" da Lovable fica de fora até a lista trazer a origem (G3).
 *
 * Abrir o detalhe torna a praça a ATIVA da conta (`active_praca_id`, o conceito de sempre): Rotas, Entrada e as telas do Comercial
 * leem a praça ativa.
 */
export default function PracaDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const { data: pracas, isPending, isError, refetch } = usePracas();
  const praca = pracas?.find((p) => p.id === id);

  if (isError) {
    return (
      <div className="space-y-2">
        <VoltarPracas />
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar a praça.
        </p>
        <Button variant="outline" onClick={() => void refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  }
  if (isPending) return <div aria-busy="true" className="h-40 animate-pulse rounded-2xl bg-muted" />;
  if (!praca) {
    return (
      <div className="space-y-3">
        <VoltarPracas />
        <p className="text-muted-foreground">Praça não encontrada.</p>
      </div>
    );
  }
  return <Detalhe praca={praca} />;
}

function VoltarPracas() {
  return (
    <Link href={ROTA.pracas} className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:min-h-0">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Praças
    </Link>
  );
}

/** Cartão recolhido; o conteúdo só monta quando abre (o mapa das áreas não carrega ladrilhos escondido). */
function Recolhida({ titulo, children }: { titulo: string; children: ReactNode }) {
  const [aberta, setAberta] = useState(false);
  return (
    <details className="rounded-2xl bg-card p-5 shadow-card" onToggle={(e) => setAberta(e.currentTarget.open)}>
      <summary className="cursor-pointer text-lg font-semibold">{titulo}</summary>
      {aberta && <div className="mt-3">{children}</div>}
    </details>
  );
}

function Detalhe({ praca }: { praca: PracaView }) {
  const { user } = useAuth();
  const { features } = useFeaturesMenu();
  const ativar = useSetActivePraca();
  const pediu = useRef<string | null>(null);
  const [editar, setEditar] = useState(false);
  const [buscar, setBuscar] = useState(false);
  const operador = podeOperar(user);

  // Uma vez por praça aberta, e só se ela ainda não é a ativa (sem laço: a resposta grava a sessão nova).
  useEffect(() => {
    if (!user || user.active_praca_id === praca.id || pediu.current === praca.id) return;
    pediu.current = praca.id;
    ativar.mutate(praca.id);
  }, [user, praca.id, ativar]);

  const situacao = situacaoDaPraca(praca, todaySp());
  const cobertura = praca.cobertura ? ` · raio de ${RADIUS_KM} km, ${praca.cobertura.vizinhas.length} cidades em volta` : '';

  return (
    <div className="space-y-6">
      <VoltarPracas />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-3xl font-semibold">{praca.name}</h1>
          <p className="text-muted-foreground">
            {cidadeUf(praca)} · {linhaClientes(praca)}
            {cobertura}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" title="Pelas datas de início e de previsão de fim">
            {ROTULO_SITUACAO_PRACA[situacao]}
          </Badge>
          <Button variant="outline" onClick={() => setEditar(true)}>
            <Pencil className="h-4 w-4" aria-hidden /> Editar praça
          </Button>
          <Button asChild variant="outline">
            <Link href={`/entrada?praca=${praca.id}`}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden /> Importar planilha
            </Link>
          </Button>
          {operador && (
            <Button onClick={() => setBuscar(true)}>
              <Search className="h-4 w-4" aria-hidden /> Buscar clientes no mapa
            </Button>
          )}
        </div>
      </div>

      {features.map_pins ? (
        <ClientesDaPraca pracaId={praca.id} onBuscar={operador ? () => setBuscar(true) : undefined} />
      ) : (
        <p className="rounded-2xl bg-card p-5 text-sm text-muted-foreground shadow-card">A lista de clientes ainda não está ligada neste servidor.</p>
      )}
      <p className="text-xs text-muted-foreground">Dados de estabelecimentos do mapa aberto (© colaboradores do OpenStreetMap).</p>

      <Recolhida titulo="Áreas de atuação">
        <AreasAtuacao praca={praca} embutido />
      </Recolhida>
      <Recolhida titulo="Plano de abertura (11 etapas)">
        <PlanoAbertura praca={praca} />
      </Recolhida>

      <Dialog open={editar} onOpenChange={setEditar}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar praça</DialogTitle>
            <DialogDescription>A situação ({ROTULO_SITUACAO_PRACA[situacao]}) sai destas datas.</DialogDescription>
          </DialogHeader>
          <DadosDaPraca praca={praca} />
        </DialogContent>
      </Dialog>

      <Dialog open={buscar} onOpenChange={setBuscar}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Buscar clientes no mapa</DialogTitle>
            <DialogDescription>Encontre estabelecimentos da cidade por segmento e importe para a praça.</DialogDescription>
          </DialogHeader>
          <BuscaEstabelecimentos praca={praca} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Clientes da praça no desenho da tabela da Lovable (Cliente, Contato, Situação), sobre a lista do §34.6 com `praca_id` (todas as
 * situações, telefone só mascarado). O nome abre o painel do cliente. Paginada; a busca por nome é nossa (com centenas de clientes,
 * sem ela não se acha ninguém).
 */
function ClientesDaPraca({ pracaId, onBuscar }: { pracaId: string; onBuscar?: () => void }) {
  const [busca, setBusca] = useState('');
  const [paginas, setPaginas] = useState<string[]>([]);
  const cursor = paginas[paginas.length - 1];
  const lista = useListaClientes({ praca_id: pracaId, q: busca, cursor }, true);
  const abrirLead = useUiStore((s) => s.openLead);
  const r = lista.data;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <label htmlFor="praca-busca" className="sr-only">
          Buscar por nome
        </label>
        <Input
          id="praca-busca"
          type="search"
          value={busca}
          onChange={(e) => {
            setPaginas([]);
            setBusca(e.target.value);
          }}
          placeholder="Buscar por nome"
          className="max-w-xs"
        />
      </div>
      <div className="overflow-hidden rounded-2xl bg-card shadow-card">
        {lista.isError ? (
          <div className="space-y-2 p-5">
            <p role="alert" className="text-sm text-destructive">
              {apiErrorMessage(lista.error, 'Não foi possível carregar os clientes.')}
            </p>
            <Button variant="outline" onClick={() => void lista.refetch()}>
              Tentar de novo
            </Button>
          </div>
        ) : !r ? (
          <div aria-busy="true" className="h-32 animate-pulse bg-muted" />
        ) : r.items.length === 0 ? (
          <div className="space-y-3 px-5 py-10 text-center text-muted-foreground">
            <p>{busca.trim().length >= 2 ? 'Nenhum cliente com esse nome nesta praça.' : 'Nenhum cliente. Use a busca no mapa para começar.'}</p>
            {onBuscar && busca.trim().length < 2 && (
              <Button onClick={onBuscar}>
                <Search className="h-4 w-4" aria-hidden /> Buscar clientes no mapa
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm" data-testid="clientes-da-praca">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Contato</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Situação</th>
              </tr>
            </thead>
            <tbody>
              {r.items.map((i) => (
                <tr key={i.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => abrirLead(i.id)} className="min-h-11 break-words text-left font-medium hover:underline md:min-h-0">
                      {i.name}
                    </button>
                    <div className="break-words text-xs text-muted-foreground">
                      {[i.address, i.city].filter(Boolean).join(' · ')}
                      {!i.has_location ? ' · sem localização exata' : ''}
                    </div>
                    {/* Abaixo de `lg` a situação vem aqui (a coluna própria some). */}
                    <div className="text-xs lg:hidden">
                      <span style={{ color: i.color }} aria-hidden>
                        ●
                      </span>{' '}
                      {i.label}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    {i.phone ? (
                      <>
                        {i.phone.masked}
                        {i.phone.kind === 'whatsapp' && <span className="block text-xs text-muted-foreground">WhatsApp</span>}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    <span style={{ color: i.color }} aria-hidden>
                      ●
                    </span>{' '}
                    {i.label}
                    <span className="block text-xs text-muted-foreground">
                      {i.last_visit ? `última visita ${diaCurto(i.last_visit.day)}${i.last_visit.consultant_name ? ` · ${i.last_visit.consultant_name}` : ''}` : 'sem visita'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {r && (r.next_cursor || paginas.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {paginas.length > 0 && (
            <Button variant="outline" onClick={() => setPaginas((p) => p.slice(0, -1))}>
              ← Anteriores
            </Button>
          )}
          {r.next_cursor && (
            <Button variant="outline" onClick={() => setPaginas((p) => [...p, r.next_cursor!])}>
              Próximos →
            </Button>
          )}
        </div>
      )}
      {r && (
        <p className="text-xs text-muted-foreground">
          {r.total.toLocaleString('pt-BR')} {r.total === 1 ? 'cliente' : 'clientes'} {busca.trim().length >= 2 ? 'com esse nome' : 'nesta praça'} ·{' '}
          {r.without_location.toLocaleString('pt-BR')} sem localização exata. A situação vem da última visita.
        </p>
      )}
    </div>
  );
}
