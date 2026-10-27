'use client';

import { KeyRound, MoreHorizontal, Pencil, Plus, Search, UserCheck, UserX } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { RedefinirSenhaRepresentante } from '@/components/praca/AcessoRepresentante';
import { ConsultorDialog } from '@/components/praca/ConsultorDialog';
import { AlertasConfig, AtencaoAgora, RetornosEquipe } from '@/components/praca/EquipeAtencao';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useFeaturesMenu } from '@/modules/acesso/application/use-acesso';
import { podeOperar } from '@/modules/acesso/domain/acesso';
import { ROTA } from '@/modules/acesso/domain/enderecos';
import { useAuth } from '@/modules/auth/application/use-auth';
import { textoCadastrosConfirmados } from '@/modules/campo/domain/cadastros-confirmados';
import { useAtivarConsultor, useConsultor, useConsultores } from '@/modules/consultores/application/use-consultores';
import { filtrarRepresentantes, linhaDoDia, type FiltroSituacao } from '@/modules/consultores/domain/representantes';
import type { ConsultorListItem } from '@/modules/consultores/infrastructure/consultores.api';
import { usePracas } from '@/modules/pracas/application/use-pracas';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

const CARTAO = 'rounded-2xl bg-card shadow-card';
const SELECT = 'h-11 rounded-md border border-input bg-background px-2 text-sm md:h-9';

/** A edição lê o representante inteiro (`GET /v1/consultores/:id`: o banco completo só vem aí, e só para o admin). */
function EditarDaLista({ id, onFechar }: { id: string; onFechar: () => void }) {
  const { data } = useConsultor(id);
  if (!data) return null;
  return <ConsultorDialog aberto consultor={data} onFechar={onFechar} />;
}

/**
 * Representantes (Lovable `representantes.tsx`, UX §4.7, arquitetura §5 E5.5): cabeçalho com "{n} cadastrados", os filtros da Lovable
 * (busca, situação e praça) e a tabela Nome / Telefone / Status / Ações. Sem a coluna "Remuneração" (a nossa regra é versionada; o
 * campo por pessoa é a G4, fora). A lixeira da Lovable vira "Desativar": apagar de vez fica fora da tela (contrato §20.9 item 7).
 * Abaixo da tabela, "Em campo hoje" (o destino da faixa do Dashboard). Os módulos são lidos do `features`, nunca sondando rota.
 */
export default function RepresentantesPage() {
  const { user } = useAuth();
  const operar = podeOperar(user);
  const { features } = useFeaturesMenu();
  const { data: consultores, isPending, isError, error, refetch } = useConsultores();
  const { data: pracas } = usePracas();
  const ativar = useAtivarConsultor();
  const [q, setQ] = useState('');
  const [situacao, setSituacao] = useState<FiltroSituacao>('todos');
  const [pracaId, setPracaId] = useState('');
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState<string | null>(null);
  const [senha, setSenha] = useState<ConsultorListItem | null>(null);
  const [ligarDesligar, setLigarDesligar] = useState<ConsultorListItem | null>(null);
  const lista = useMemo(() => filtrarRepresentantes(consultores ?? [], { q, situacao, pracaId }), [consultores, q, situacao, pracaId]);
  const n = consultores?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Representantes</h1>
          <p className="text-muted-foreground">{isPending ? 'Carregando…' : `${n.toLocaleString('pt-BR')} ${n === 1 ? 'cadastrado' : 'cadastrados'}`}</p>
        </div>
        {operar && (
          <Button onClick={() => setNovo(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Novo representante
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Buscar por nome, e-mail ou telefone"
            placeholder="Buscar por nome, e-mail ou telefone"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select aria-label="Situação" value={situacao} onChange={(e) => setSituacao(e.target.value as FiltroSituacao)} className={`${SELECT} w-36`}>
          <option value="todos">Todos</option>
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
        </select>
        <select aria-label="Praça" value={pracaId} onChange={(e) => setPracaId(e.target.value)} className={`${SELECT} w-44`}>
          <option value="">Todas as praças</option>
          {(pracas ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {isError ? (
        <div className={`${CARTAO} space-y-2 p-5`}>
          <p role="alert" className="text-sm text-destructive">
            {apiErrorMessage(error, 'Não foi possível carregar os representantes.')}
          </p>
          <Button variant="outline" onClick={() => void refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : isPending ? (
        <div aria-busy="true" className="h-48 animate-pulse rounded-2xl bg-muted" />
      ) : (
        <div className={`${CARTAO} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Telefone</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {operar && <th className="px-4 py-3 text-right font-medium">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 ? (
                <tr>
                  <td colSpan={operar ? 4 : 3} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhum representante encontrado.
                  </td>
                </tr>
              ) : (
                lista.map((c) => {
                  const confirmados = c.signups_confirmed ? textoCadastrosConfirmados(c.signups_confirmed) : null;
                  return (
                    <tr key={c.id} className="border-b align-top last:border-0">
                      <td className="px-4 py-3">
                        <Link href={`${ROTA.representantes}/${c.id}`} className="inline-flex min-h-11 items-center break-words font-medium hover:underline md:min-h-0">
                          {c.name}
                        </Link>
                        <div className="break-all text-xs text-muted-foreground">{c.email}</div>
                        <div className="break-words text-xs text-muted-foreground">{c.praca_name}</div>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">{c.phone}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <Badge variant={c.active ? 'default' : 'secondary'} className="w-fit">
                            {c.active ? 'Ativo' : 'Inativo'}
                          </Badge>
                          {c.active && <span className="text-xs text-muted-foreground">{linhaDoDia(c.today)}</span>}
                          {confirmados && (
                            <span className="text-xs text-muted-foreground" title={confirmados.conta}>
                              {confirmados.titulo} (confirmados pelo Freela)
                            </span>
                          )}
                          {!c.freela_code && (
                            <span className="text-xs text-muted-foreground" title={c.freela_sync_error ?? undefined}>
                              Código no Freela pendente
                            </span>
                          )}
                        </div>
                      </td>
                      {operar && (
                        <td className="px-4 py-3 text-right">
                          <div className="hidden justify-end gap-1 sm:flex">
                            <Button size="sm" variant="outline" onClick={() => setSenha(c)}>
                              <KeyRound className="h-4 w-4" aria-hidden /> Redefinir senha
                            </Button>
                            <Button size="icon" variant="ghost" aria-label={`Editar ${c.name}`} onClick={() => setEditar(c.id)}>
                              <Pencil className="h-4 w-4" aria-hidden />
                            </Button>
                            <Button size="icon" variant="ghost" aria-label={`${c.active ? 'Desativar' : 'Reativar'} ${c.name}`} onClick={() => setLigarDesligar(c)}>
                              {c.active ? <UserX className="h-4 w-4 text-destructive" aria-hidden /> : <UserCheck className="h-4 w-4" aria-hidden />}
                            </Button>
                          </div>
                          <div className="sm:hidden">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" aria-label={`Ações de ${c.name}`}>
                                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem className="min-h-11" onSelect={() => setSenha(c)}>
                                  <KeyRound className="h-4 w-4" aria-hidden /> Redefinir senha
                                </DropdownMenuItem>
                                <DropdownMenuItem className="min-h-11" onSelect={() => setEditar(c.id)}>
                                  <Pencil className="h-4 w-4" aria-hidden /> Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem className="min-h-11" onSelect={() => setLigarDesligar(c)}>
                                  {c.active ? <UserX className="h-4 w-4" aria-hidden /> : <UserCheck className="h-4 w-4" aria-hidden />} {c.active ? 'Desativar' : 'Reativar'}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <section id="em-campo" aria-labelledby="em-campo-titulo" className="space-y-4">
        <h2 id="em-campo-titulo" className="text-lg font-semibold">
          Em campo hoje
        </h2>
        <AtencaoAgora />
        <RetornosEquipe />
        <AlertasConfig />
      </section>

      {novo && <ConsultorDialog aberto onFechar={() => setNovo(false)} />}
      {editar && <EditarDaLista id={editar} onFechar={() => setEditar(null)} />}
      {senha && <RedefinirSenhaRepresentante c={senha} comWhatsapp={features.consultant_profile} onFechar={() => setSenha(null)} />}
      <AlertDialog open={!!ligarDesligar} onOpenChange={(o) => !o && setLigarDesligar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {ligarDesligar?.active ? 'Desativar' : 'Reativar'} {ligarDesligar?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {ligarDesligar?.active
                ? 'O acesso dele para na hora e o código no Freela deixa de vincular cadastros. As visitas e os pagamentos ficam guardados.'
                : 'Ele volta a entrar no campo e o código no Freela volta a vincular cadastros.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={ativar.isPending}
              onClick={() => ligarDesligar && ativar.mutate({ id: ligarDesligar.id, active: !ligarDesligar.active }, { onSettled: () => setLigarDesligar(null) })}
            >
              {ligarDesligar?.active ? 'Desativar' : 'Reativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
