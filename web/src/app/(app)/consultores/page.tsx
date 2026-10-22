'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ConsultorDialog } from '@/components/praca/ConsultorDialog';
import { AlertasConfig, AtencaoAgora, MetaLinha, RetornosEquipe } from '@/components/praca/EquipeAtencao';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/modules/auth/application/use-auth';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import { textoCadastrosConfirmados } from '@/modules/campo/domain/cadastros-confirmados';
import { hora, plural } from '@/modules/campo/domain/formatos';
import { usePagamentos } from '@/modules/pagamentos/application/use-pagamentos';
import { useAtencao, useConsultores } from '@/modules/consultores/application/use-consultores';
import { useFeaturesLovable } from '@/modules/painel/application/use-painel';

const SITUACAO = { em_jornada: 'em jornada agora', encerrou: 'encerrou', nao_iniciou: 'não começou' } as const;
export default function ConsultoresPage() {
  const { user } = useAuth();
  const { data: consultores, isPending, isError, error, refetch } = useConsultores();
  const { data: atencao } = useAtencao();
  // O link some quando FIELD_PAYOUTS_ENABLED está desligada no servidor (404 PAYOUTS_DISABLED).
  const pagamentos = usePagamentos();
  const pagamentosLigados = pagamentos.isSuccess;
  // O link só aparece com FIELD_DECLARED_SIGNUPS_ENABLED ligada: o "Atenção agora" só traz `declared_alerts` nesse caso
  // (sem sondar a rota: um 404 a mais na página).
  const declaradosLigados = atencao?.declared_alerts !== undefined;
  // Lote A da Lovable (contrato §33.1): os links só aparecem com o módulo ligado, lido da configuração (200), sem sondar rota desligada.
  const lovable = useFeaturesLovable();
  const [novo, setNovo] = useState(false);
  const metaDe = new Map((atencao?.consultants ?? []).map((c) => [c.consultant_id, c]));

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-extrabold">Consultores de campo</h1>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {lovable.dashboard && (
            <Link href="/consultores/painel" className="text-sm text-primary hover:underline">
              Painel
            </Link>
          )}
          {lovable.map_pins && (
            <Link href="/consultores/mapa" className="text-sm text-primary hover:underline">
              Mapa por situação
            </Link>
          )}
          <Link href="/consultores/calor" className="text-sm text-primary hover:underline">
            Mapa de calor
          </Link>
          {pagamentosLigados && (
            <Link href="/consultores/pagamentos" className="text-sm text-primary hover:underline">
              Pagamentos
            </Link>
          )}
          {declaradosLigados && (
            <Link href="/consultores/declarados" className="text-sm text-primary hover:underline">
              Declarados
            </Link>
          )}
          <Link href="/consultores/roteiros" className="text-sm text-primary hover:underline">
            Roteiros do dia
          </Link>
          {user?.is_admin && <Button onClick={() => setNovo(true)}>Novo consultor</Button>}
        </div>
      </div>
      <div className="mt-4 space-y-4">
        <AtencaoAgora />
        <RetornosEquipe />
        <AlertasConfig />
      </div>
      {isPending ? (
        <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>
      ) : isError ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-destructive">{apiErrorMessage(error, 'Não foi possível carregar os consultores.')}</p>
          <Button variant="outline" onClick={() => void refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : !consultores?.length ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhum consultor ainda.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {consultores.map((c) => (
            <li key={c.id} className={`card-surface p-4 ${c.active ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/consultores/${c.id}`} className="font-bold hover:underline">
                  {c.name}
                </Link>
                <span className="text-xs text-muted-foreground">{c.active ? SITUACAO[c.today.status] : 'desativado'}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {c.praca_name} · {plural(c.today.visits - (c.today.closed ?? 0), 'visita', 'visitas')} hoje{c.today.closed ? ` (+ ${c.today.closed} fechado${c.today.closed === 1 ? '' : 's'}, fora da meta)` : ''} · {plural(c.today.cadastros, 'cadastrou', 'cadastraram')} agora · último ponto {c.today.last_point_at ? hora(c.today.last_point_at) : '—'}
              </p>
              {c.signups_confirmed && (
                <p className="mt-1 text-xs" title={textoCadastrosConfirmados(c.signups_confirmed).conta}>
                  <span className="font-bold">{textoCadastrosConfirmados(c.signups_confirmed).titulo}</span>{' '}
                  <span className="text-muted-foreground">(confirmados pelo Freela)</span>
                </p>
              )}
              {metaDe.get(c.id) && <MetaLinha goal={metaDe.get(c.id)!.goal} status={metaDe.get(c.id)!.status} emIntervaloDesde={metaDe.get(c.id)!.on_break_since} />}
              <p className="mt-1 text-xs">
                {c.freela_code ? `Código Freela: ${c.freela_code}` : `Código pendente${c.freela_sync_error ? ` — ${c.freela_sync_error}` : ''}`}
              </p>
            </li>
          ))}
        </ul>
      )}
      {novo && <ConsultorDialog aberto onFechar={() => setNovo(false)} />}
    </>
  );
}
