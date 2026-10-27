'use client';

import { MoreHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useAcoesCupom, useCandidatos, useConfigCupom, useCuponsEquipe, useDetalheCupom, useFeaturesLoteC } from '@/modules/cupons/application/use-cupons';
import {
  contarGrupos,
  detalheDaSituacao,
  doGrupo,
  grupoDoCupom,
  resumoDoCupom,
  SELO_GRUPO,
  situacaoDoGrupo,
  situacaoParaEquipe,
  type ConfigCupom,
  type CupomEquipe,
  type EscolhaGrupo,
} from '@/modules/cupons/domain/cupons';
import { usePracas } from '@/modules/pracas/application/use-pracas';

const MOTIVOS = ['Já é cliente do Freela', 'Fora do perfil', 'Pedido repetido'] as const;
const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
const CARTAO = 'rounded-2xl bg-card shadow-card';
const SELECT = 'h-11 rounded-md border border-input bg-background px-2 text-sm md:h-9';
const GRUPOS: { id: EscolhaGrupo; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'pendente', rotulo: 'Pendente' },
  { id: 'aprovado', rotulo: 'Aprovado' },
  { id: 'reprovado', rotulo: 'Reprovado' },
];

type Acao = { tipo: 'aprovar' | 'reprovar' | 'vincular' | 'desativar' | 'detalhe'; c: CupomEquipe } | null;

/** As ações "⋯" de cada pedido, pela situação (o servidor é quem decide de verdade). Quem não é admin só vê o histórico. */
function acoesDoMenu(c: CupomEquipe, admin: boolean, vincularLigado: boolean): { tipo: 'detalhe' | 'vincular' | 'tentar' | 'desativar'; rotulo: string }[] {
  return [
    { tipo: 'detalhe' as const, rotulo: 'Ver histórico' },
    ...(admin && c.situacao === 'aguardando_empresa' && vincularLigado ? [{ tipo: 'vincular' as const, rotulo: 'Vincular à conta do Freela' }] : []),
    ...(admin && (c.situacao === 'aguardando_freela' || c.situacao === 'erro') ? [{ tipo: 'tentar' as const, rotulo: 'Tentar agora' }] : []),
    ...(admin && (c.situacao === 'criado' || c.situacao === 'usado') ? [{ tipo: 'desativar' as const, rotulo: 'Desativar no Freela' }] : []),
  ];
}

/**
 * Vouchers da 1ª contratação — equipe (Lovable `vouchers.tsx`, UX §4.8, contrato §38.4). A equipe vê; só o admin aprova, reprova,
 * vincula, tenta de novo e desativa. O cartão "Solicitar voucher" da Lovable NÃO entra: o pedido é um fato que nasce na visita (lote C)
 * [desvio: regra]. O seletor da Lovable (Todos / Pendente / Aprovado / Reprovado) agrupa o nosso ciclo fino, que aparece embaixo do selo.
 * As contagens vêm do servidor, por situação.
 */
export function CuponsEquipe() {
  const { user } = useAuth();
  const admin = !!user?.is_admin;
  const lc = useFeaturesLoteC();
  const [grupo, setGrupo] = useState<EscolhaGrupo>('pendente');
  const [pracaId, setPracaId] = useState('');
  const [busca, setBusca] = useState('');
  const { data: pracas } = usePracas();
  const lista = useCuponsEquipe({ situacao: situacaoDoGrupo(grupo), praca_id: pracaId || undefined, q: busca.trim() || undefined }, lc.vouchers);
  const [acao, setAcao] = useState<Acao>(null);
  const acoes = useAcoesCupom();

  const d = lista.data;
  const cabecalho = (
    <div>
      <h1 className="text-3xl font-semibold">Vouchers</h1>
      <p className="text-muted-foreground">
        {admin ? 'Aprove ou reprove os vouchers solicitados pelos representantes.' : 'Os vouchers pedidos pelos representantes. Só administradores aprovam ou reprovam.'}
      </p>
      {d && (!d.coupons_enabled || !d.freela_configured) && (
        <p className="mt-1 text-sm text-muted-foreground">
          {!d.coupons_enabled ? 'Neste servidor, aprovar é só registro: o cupom no Freela não está ligado.' : 'A conexão com o Freela não está configurada: os aprovados esperam por ela.'}
        </p>
      )}
    </div>
  );
  if (lc.carregando)
    return (
      <div className="space-y-6">
        {cabecalho}
        <div aria-busy="true" className="h-40 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  if (!lc.vouchers)
    return (
      <div className="space-y-6">
        {cabecalho}
        <p className={`${CARTAO} p-5 text-sm`}>Este recurso ainda não está ligado neste servidor.</p>
      </div>
    );

  const n = d ? contarGrupos(d.counts) : null;
  const itens = d ? doGrupo(d.items, grupo) : [];
  const vincularLigado = !!d && d.coupons_enabled && d.freela_configured;
  const escolherAcao = (c: CupomEquipe, tipo: 'detalhe' | 'vincular' | 'tentar' | 'desativar') => {
    if (tipo === 'tentar') acoes.tentar.mutate(c.id);
    else setAcao({ tipo, c });
  };
  const menu = (c: CupomEquipe) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={`Mais ações de ${c.company_name}`}>
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {acoesDoMenu(c, admin, vincularLigado).map((a) => (
          <DropdownMenuItem key={a.tipo} className="min-h-11" disabled={a.tipo === 'tentar' && acoes.tentar.isPending} onSelect={() => escolherAcao(c, a.tipo)}>
            {a.rotulo}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const selo = (c: CupomEquipe) => {
    const g = SELO_GRUPO[grupoDoCupom(c.situacao)];
    const fino = detalheDaSituacao(c);
    return (
      <div className="flex flex-col gap-1">
        <Badge variant={g.variante} className="w-fit">
          {g.rotulo}
        </Badge>
        {fino && <span className={`text-xs text-muted-foreground ${c.situacao === 'criado' ? 'font-mono' : ''}`}>{fino}</span>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {cabecalho}
      <p className="rounded-xl bg-secondary p-4 text-sm">Os representantes pedem o voucher na visita, depois de marcar o resultado. O pedido chega aqui para aprovar.</p>

      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">Solicitações</h2>
          <div className="flex flex-wrap items-end gap-2">
            <label htmlFor="vouchers-situacao" className="sr-only">
              Situação
            </label>
            <select id="vouchers-situacao" value={grupo} onChange={(e) => setGrupo(e.target.value as EscolhaGrupo)} className={`${SELECT} w-44`}>
              {GRUPOS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.id === 'todos' || !n ? g.rotulo : `${g.rotulo} (${n[g.id]})`}
                </option>
              ))}
            </select>
            <label htmlFor="vouchers-praca" className="sr-only">
              Praça
            </label>
            <select id="vouchers-praca" value={pracaId} onChange={(e) => setPracaId(e.target.value)} className={`${SELECT} w-44`}>
              <option value="">Todas as praças</option>
              {(pracas ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <label htmlFor="vouchers-busca" className="sr-only">
              Buscar por cliente
            </label>
            <Input id="vouchers-busca" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por cliente" className="w-full sm:w-56" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Contagem: pedidos por situação agora (a praça e a busca valem para os números). Fonte: pedidos dos representantes.</p>
      </div>

      {lista.isPending && <div aria-busy="true" className="h-32 animate-pulse rounded-2xl bg-muted" />}
      {lista.isError && (
        <p role="alert" className={`${CARTAO} p-4 text-sm`}>
          Não deu para carregar os vouchers.{' '}
          <button type="button" className="min-h-11 font-bold underline" onClick={() => void lista.refetch()}>
            Tentar de novo
          </button>
        </p>
      )}
      {d && itens.length === 0 && (
        <div className={`${CARTAO} space-y-1 p-6 text-center text-sm text-muted-foreground`}>
          <p>Nenhuma solicitação.</p>
          <p>Os representantes pedem o voucher na visita, depois de escolher como foi.</p>
        </div>
      )}
      {d && itens.length > 0 && (
        <>
          {d.items.length >= 500 && grupo === 'aprovado' && (
            <p className="text-xs text-muted-foreground">Mostrando os 500 pedidos mais recentes: filtre por praça ou cliente para ver os outros.</p>
          )}
          <div className={`${CARTAO} hidden overflow-hidden md:block`}>
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Cidade/UF</th>
                  <th className="px-4 py-3 font-medium">Ramo</th>
                  <th className="px-4 py-3 text-right font-medium">Freelas/sem.</th>
                  <th className="px-4 py-3 font-medium">Representante</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {itens.map((c) => (
                  <tr key={c.id} className="border-b align-top last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap">{dia(c.created_at)}</td>
                    <td className="px-4 py-3 font-medium">
                      {c.company_name}
                      {c.contractor_user_id && <span className="block text-xs font-normal text-muted-foreground">✓ Conta no Freela: {c.contractor_name ?? 'vinculada'}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {c.city || '—'}/{c.uf || '—'}
                    </td>
                    <td className="px-4 py-3">{c.segment}</td>
                    <td className="px-4 py-3 text-right">{c.freelas_per_week}</td>
                    <td className="px-4 py-3">{c.consultant_name}</td>
                    <td className="px-4 py-3">{selo(c)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {admin && c.situacao === 'pedido' && (
                          <>
                            <Button size="sm" onClick={() => setAcao({ tipo: 'aprovar', c })}>
                              Aprovar
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => setAcao({ tipo: 'reprovar', c })}>
                              Reprovar
                            </Button>
                          </>
                        )}
                        {menu(c)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="grid grid-cols-1 gap-3 md:hidden">
            {itens.map((c) => {
              const st = situacaoParaEquipe(c);
              return (
                <li key={c.id} className={`${CARTAO} space-y-2 p-4`}>
                  <div className="flex items-start justify-between gap-2">
                    {selo(c)}
                    <span className="text-xs text-muted-foreground">pedido em {dia(c.created_at)}</span>
                  </div>
                  <p className="text-base font-semibold">{c.company_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {c.city || '—'}/{c.uf || '—'} · {c.segment} · {c.freelas_per_week} {c.freelas_per_week === 1 ? 'freela' : 'freelas'}/semana · {c.consultant_name}
                  </p>
                  <p className="text-xs">
                    <span aria-hidden>{st.icone} </span>
                    {st.texto}
                  </p>
                  {c.contractor_user_id && <p className="text-sm">✓ Conta no Freela: {c.contractor_name ?? 'vinculada'}</p>}
                  {c.coupon_code && ['criado', 'usado', 'vencido', 'desativado'].includes(c.situacao) && <p className="font-mono text-lg font-bold">{c.coupon_code}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    {admin && c.situacao === 'pedido' && (
                      <>
                        <Button onClick={() => setAcao({ tipo: 'aprovar', c })}>Aprovar</Button>
                        <Button variant="destructive" onClick={() => setAcao({ tipo: 'reprovar', c })}>
                          Reprovar
                        </Button>
                      </>
                    )}
                    {menu(c)}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {admin && <RegrasDoCupom />}

      {acao?.tipo === 'aprovar' && d && <AprovarDialog c={acao.c} podeVincular={vincularLigado} cuponsLigados={d.coupons_enabled} onFechar={() => setAcao(null)} />}
      {acao?.tipo === 'reprovar' && <ReprovarDialog c={acao.c} onFechar={() => setAcao(null)} />}
      {acao?.tipo === 'vincular' && <VincularDialog c={acao.c} onFechar={() => setAcao(null)} />}
      {acao?.tipo === 'desativar' && <DesativarDialog c={acao.c} onFechar={() => setAcao(null)} />}
      {acao?.tipo === 'detalhe' && <HistoricoDialog id={acao.c.id} nome={acao.c.company_name} onFechar={() => setAcao(null)} />}
    </div>
  );
}

function SeletorContratante({ c, valor, onEscolher }: { c: CupomEquipe; valor: string | null; onEscolher: (v: { user_id: string; name: string } | null) => void }) {
  const [q, setQ] = useState(c.company_name);
  const [buscar, setBuscar] = useState(c.company_name);
  const cand = useCandidatos(c.id, buscar, true);
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold">Conta da empresa no Freela (busca do CRM, só por nome)</p>
      <div className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} className="h-12" aria-label="Nome da empresa no Freela" />
        <Button variant="outline" className="h-12" onClick={() => setBuscar(q.trim())}>
          Buscar
        </Button>
      </div>
      {cand.isPending && <p className="text-sm text-muted-foreground">Buscando no Freela…</p>}
      {cand.isError && <p className="text-sm">Não deu para buscar no Freela agora.</p>}
      {cand.data && cand.data.items.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma conta de bares e restaurantes com esse nome.</p>}
      <div role="radiogroup" aria-label="Conta encontrada" className="space-y-1">
        {(cand.data?.items ?? []).map((x) => (
          <label key={x.user_id} className="flex min-h-12 items-center gap-2 text-sm">
            <input type="radio" name={`conta-${c.id}`} className="h-5 w-5" checked={valor === x.user_id} onChange={() => onEscolher({ user_id: x.user_id, name: x.name })} />
            {x.name}
            {x.city ? ` · ${x.city}` : ''}
          </label>
        ))}
        {valor && (
          <button type="button" className="min-h-12 text-sm underline" onClick={() => onEscolher(null)}>
            Aprovar sem vincular agora
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Nunca vinculamos sozinhos pelo nome: confira cidade e nome antes de escolher.</p>
    </div>
  );
}

function AprovarDialog({ c, podeVincular, cuponsLigados, onFechar }: { c: CupomEquipe; podeVincular: boolean; cuponsLigados: boolean; onFechar: () => void }) {
  const { aprovar } = useAcoesCupom();
  const cfg = useConfigCupom(true);
  const [conta, setConta] = useState<{ user_id: string; name: string } | null>(null);
  const frase = cfg.data ? resumoDoCupom(cfg.data) : '…';
  return (
    <Dialog open onOpenChange={(o) => !o && !aprovar.isPending && onFechar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Aprovar o voucher de {c.company_name}?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {cuponsLigados ? (
            <p>
              Cria no Freela um cupom de <strong>{frase}</strong>, na 1ª contratação. Depois de criado, só dá para desativar.
            </p>
          ) : (
            <p>O pedido fica aprovado só como registro: o cupom no Freela não está ligado neste servidor.</p>
          )}
          {cuponsLigados && podeVincular && <SeletorContratante c={c} valor={conta?.user_id ?? null} onEscolher={setConta} />}
          {cuponsLigados && !conta && <p className="text-muted-foreground">Sem a conta da empresa, o pedido fica aprovado e o cupom é criado quando ela for vinculada.</p>}
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="outline" className="h-12" onClick={onFechar} disabled={aprovar.isPending}>
            Voltar
          </Button>
          <Button
            className="h-12"
            disabled={aprovar.isPending}
            onClick={() => aprovar.mutate({ id: c.id, contractor_user_id: conta?.user_id ?? null, contractor_name: conta?.name ?? null }, { onSuccess: onFechar })}
          >
            {cuponsLigados && conta ? 'Aprovar e criar cupom' : 'Aprovar pedido'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReprovarDialog({ c, onFechar }: { c: CupomEquipe; onFechar: () => void }) {
  const { reprovar } = useAcoesCupom();
  const [chip, setChip] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const motivo = [chip, texto.trim()].filter(Boolean).join(' — ');
  const ok = motivo.length >= 3;
  return (
    <Dialog open onOpenChange={(o) => !o && !reprovar.isPending && onFechar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reprovar o pedido de {c.company_name}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm">{c.consultant_name} vê o motivo.</p>
        <div className="flex flex-wrap gap-2">
          {MOTIVOS.map((m) => (
            <button key={m} type="button" aria-pressed={chip === m} onClick={() => setChip(chip === m ? null : m)} className={`min-h-12 rounded-full border px-3 text-sm ${chip === m ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
              {m}
            </button>
          ))}
        </div>
        <label className="text-sm">
          Outro motivo ou detalhe
          <Input value={texto} maxLength={400} onChange={(e) => setTexto(e.target.value)} className="mt-1 h-12" />
        </label>
        {!ok && <p className="text-sm text-muted-foreground">O motivo é obrigatório: escolha um ou escreva.</p>}
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" className="h-12" onClick={onFechar} disabled={reprovar.isPending}>
            Voltar
          </Button>
          <Button className="h-12" disabled={!ok || reprovar.isPending} onClick={() => reprovar.mutate({ id: c.id, reason: motivo }, { onSuccess: onFechar })}>
            Reprovar pedido
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VincularDialog({ c, onFechar }: { c: CupomEquipe; onFechar: () => void }) {
  const { vincular } = useAcoesCupom();
  const [conta, setConta] = useState<{ user_id: string; name: string } | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && !vincular.isPending && onFechar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vincular {c.company_name} à conta do Freela</DialogTitle>
        </DialogHeader>
        <SeletorContratante c={c} valor={conta?.user_id ?? null} onEscolher={setConta} />
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" className="h-12" onClick={onFechar} disabled={vincular.isPending}>
            Voltar
          </Button>
          <Button className="h-12" disabled={!conta || vincular.isPending} onClick={() => conta && vincular.mutate({ id: c.id, contractor_user_id: conta.user_id, contractor_name: conta.name }, { onSuccess: onFechar })}>
            Vincular esta conta
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DesativarDialog({ c, onFechar }: { c: CupomEquipe; onFechar: () => void }) {
  const { desativar } = useAcoesCupom();
  const [motivo, setMotivo] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && !desativar.isPending && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desativar o cupom {c.coupon_code}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm">O cupom deixa de valer no Freela. Não dá para desfazer daqui.</p>
        <label className="text-sm">
          Motivo
          <Input value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} className="mt-1 h-12" />
        </label>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" className="h-12" onClick={onFechar} disabled={desativar.isPending}>
            Voltar
          </Button>
          <Button className="h-12" disabled={motivo.trim().length < 3 || desativar.isPending} onClick={() => desativar.mutate({ id: c.id, reason: motivo.trim() }, { onSuccess: onFechar })}>
            Desativar cupom
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const ROTULO_EVENTO: Record<string, string> = {
  requested: 'Pedido',
  approved: 'Aprovado',
  rejected: 'Reprovado',
  contractor_linked: 'Conta do Freela vinculada',
  coupon_created: 'Cupom criado no Freela',
  coupon_adopted: 'Cupom confirmado no Freela',
  coupon_failed: 'Erro ao criar o cupom',
  coupon_retried: 'Tentar agora',
  coupon_redeemed: 'Usado',
  coupon_unredeemed: 'Devolvido (vaga cancelada)',
  coupon_expired: 'Venceu',
  coupon_deactivated: 'Desativado',
};

function HistoricoDialog({ id, nome, onFechar }: { id: string; nome: string; onFechar: () => void }) {
  const { data, isPending } = useDetalheCupom(id);
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico do voucher de {nome}</DialogTitle>
        </DialogHeader>
        {isPending && <p className="text-sm text-muted-foreground">Carregando…</p>}
        <ol className="space-y-2 text-sm">
          {(data?.events ?? []).map((e) => (
            <li key={e.id}>
              <strong>{ROTULO_EVENTO[e.type] ?? e.type}</strong> · {new Date(e.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
              {e.actor_name ? ` · ${e.actor_name}` : e.actor_kind === 'sistema' ? ' · automático' : ''}
              {e.reason ? ` · ${e.reason}` : ''}
            </li>
          ))}
        </ol>
        {data?.coupon_error && <p className="text-sm">Última tentativa: {data.coupon_error}</p>}
      </DialogContent>
    </Dialog>
  );
}

/** Regras do cupom (§38.2): só admin; valem para as próximas aprovações. */
function RegrasDoCupom() {
  const cfg = useConfigCupom(true);
  const { salvarConfig } = useAcoesCupom();
  const [f, setF] = useState<ConfigCupom | null>(null);
  useEffect(() => {
    if (cfg.data) setF(cfg.data);
  }, [cfg.data]);
  if (!f) return null;
  const corpo = {
    max_por_empresa: f.max_por_empresa,
    discount_type: f.discount_type,
    percent_off: f.discount_type === 'PERCENT' ? f.percent_off : null,
    amount_off_cents: f.discount_type === 'FIXED' ? f.amount_off_cents : null,
    single_use: f.single_use,
    validade_dias: f.validade_dias,
    min_job_hours: f.min_job_hours,
    motivo_reprovacao: f.motivo_reprovacao,
  };
  const num = (v: string): number | null => (v.trim() === '' ? null : Number(v));
  return (
    <details className="rounded-2xl bg-card p-4 shadow-card">
      <summary className="cursor-pointer text-sm font-bold">Regras do voucher</summary>
      <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
        <label>
          Desconto
          <select value={f.discount_type} onChange={(e) => setF({ ...f, discount_type: e.target.value as 'PERCENT' | 'FIXED' })} className="mt-1 block h-12 w-full rounded-md border border-border bg-background px-3">
            <option value="PERCENT">Porcentagem</option>
            <option value="FIXED">Valor fixo</option>
          </select>
        </label>
        {f.discount_type === 'PERCENT' ? (
          <label>
            % de desconto
            <Input type="number" min={1} max={100} value={f.percent_off ?? ''} onChange={(e) => setF({ ...f, percent_off: num(e.target.value) })} className="mt-1 h-12" />
          </label>
        ) : (
          <label>
            Valor do desconto (R$)
            <Input type="number" min={0.01} step="0.01" value={f.amount_off_cents == null ? '' : f.amount_off_cents / 100} onChange={(e) => setF({ ...f, amount_off_cents: e.target.value === '' ? null : Math.round(Number(e.target.value) * 100) })} className="mt-1 h-12" />
          </label>
        )}
        <label>
          Validade (dias; vazio = sem prazo)
          <Input type="number" min={1} max={365} value={f.validade_dias ?? ''} onChange={(e) => setF({ ...f, validade_dias: num(e.target.value) })} className="mt-1 h-12" />
        </label>
        <label>
          Jornada mínima da vaga (horas; vazio = qualquer)
          <Input type="number" min={1} max={24} value={f.min_job_hours ?? ''} onChange={(e) => setF({ ...f, min_job_hours: num(e.target.value) })} className="mt-1 h-12" />
        </label>
        <label>
          Pedidos por estabelecimento (pendentes + aprovados)
          <Input type="number" min={1} max={10} value={f.max_por_empresa} onChange={(e) => setF({ ...f, max_por_empresa: Number(e.target.value) })} className="mt-1 h-12" />
        </label>
        <label className="flex min-h-12 items-center gap-2">
          <input type="checkbox" className="h-5 w-5" checked={f.single_use} onChange={(e) => setF({ ...f, single_use: e.target.checked })} />
          Vale 1 vez
        </label>
        <label className="flex min-h-12 items-center gap-2">
          <input type="checkbox" className="h-5 w-5" checked={f.motivo_reprovacao === 'obrigatorio'} onChange={(e) => setF({ ...f, motivo_reprovacao: e.target.checked ? 'obrigatorio' : 'opcional' })} />
          Motivo obrigatório ao reprovar
        </label>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Fica assim: {resumoDoCupom(corpo)}. Vale para as próximas aprovações (as já aprovadas guardam o que valia).</p>
      <Button className="mt-3 h-12" disabled={salvarConfig.isPending} onClick={() => salvarConfig.mutate(corpo)}>
        Salvar regras
      </Button>
    </details>
  );
}
