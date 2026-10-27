'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { QrDoFreela } from '@/components/campo/QrDoFreela';
import { RedefinirSenhaRepresentante } from '@/components/praca/AcessoRepresentante';
import { ConsultorDialog } from '@/components/praca/ConsultorDialog';
import { GanhosConsultor } from '@/components/praca/GanhosConsultor';
import { PracasDoConsultor } from '@/components/praca/PracasDoConsultor';
import { ConsultorLinhaDoTempo } from '@/components/praca/ConsultorLinhaDoTempo';
import { ResumoDiaEquipe } from '@/components/praca/ResumoDiaEquipe';
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
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { todaySp } from '@/lib/dates';
import { useFeaturesMenu } from '@/modules/acesso/application/use-acesso';
import { podeOperar } from '@/modules/acesso/domain/acesso';
import { ROTA } from '@/modules/acesso/domain/enderecos';
import { useAuth } from '@/modules/auth/application/use-auth';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import { useConsultor, useDiaConsultor, useFreelaSyncConsultor, useUpdateConsultor } from '@/modules/consultores/application/use-consultores';

const ConsultorMapa = dynamic(() => import('@/components/praca/ConsultorMapa'), { ssr: false });

/**
 * Ficha do representante (nossa; a Lovable não tem — UX §4.7): "← Representantes", os botões de sempre e o conteúdo de hoje (linha do
 * tempo, mapa, resultado do dia, praças e ganhos). "Início/fim da jornada" continuam: a jornada é do dia.
 */
export default function ConsultorDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  // Lote E §42.3: editar, desativar, senha provisória e o código no Freela também para o gestor (com a flag); apagar segue só admin.
  const operar = podeOperar(user);
  const { features } = useFeaturesMenu();
  const [dia, setDia] = useState(todaySp());
  const { data: c, isError: consultorErro, error: erroConsultor, refetch: recarregarConsultor } = useConsultor(id);
  const { data: diaDados, isPending, isError: diaErro, error: erroDia, refetch: recarregarDia } = useDiaConsultor(id, dia);
  const atualizar = useUpdateConsultor(id);
  const sincronizar = useFreelaSyncConsultor(id);
  const [editando, setEditando] = useState(false);
  const [qr, setQr] = useState(false);
  const [senhaAberta, setSenhaAberta] = useState(false);
  const [ligarDesligar, setLigarDesligar] = useState(false);

  const trilhas = useMemo(() => diaDados?.journeys.map((j) => j.points) ?? [], [diaDados]);

  if (!c) {
    if (!consultorErro) return <p className="text-sm text-muted-foreground">Carregando…</p>;
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">{apiErrorMessage(erroConsultor, 'Não foi possível carregar o representante.')}</p>
        <Button variant="outline" onClick={() => void recarregarConsultor()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  return (
    <>
      <Link href={ROTA.representantes} className="inline-flex min-h-11 items-center text-sm text-primary hover:underline md:min-h-0">
        ← Representantes
      </Link>
      <h1 className="mt-1 text-3xl font-semibold">{c.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {c.praca_name} · {c.email} · {c.phone} · {c.active ? 'ativo' : 'desativado'}
      </p>
      <p className="mt-1 text-xs">
        {c.freela_code ? `Código Freela: ${c.freela_code}` : `Código pendente${c.freela_sync_error ? ` — ${c.freela_sync_error}` : ''}`}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setQr(true)}>
          Ver QR code
        </Button>
        {operar && (
          <>
            <Button variant="outline" onClick={() => setEditando(true)}>
              Editar
            </Button>
            <Button variant="outline" onClick={() => setLigarDesligar(true)}>
              {c.active ? 'Desativar' : 'Reativar'}
            </Button>
            <Button variant="outline" onClick={() => setSenhaAberta(true)}>
              Redefinir senha
            </Button>
            {(!c.freela_code || c.freela_sync_error) && (
              <Button variant="outline" onClick={() => sincronizar.mutate()} disabled={sincronizar.isPending}>
                Tentar código no Freela
              </Button>
            )}
          </>
        )}
      </div>

      <section className="mt-6 space-y-4">
        <div className="flex items-center gap-2">
          <label htmlFor="dia" className="tag text-muted-foreground">
            Dia
          </label>
          <Input id="dia" type="date" max={todaySp()} value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} className="w-44" />
        </div>
        {diaErro ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{apiErrorMessage(erroDia, 'Não foi possível carregar o dia.')}</p>
            <Button variant="outline" onClick={() => void recarregarDia()}>
              Tentar de novo
            </Button>
          </div>
        ) : isPending || !diaDados ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <ConsultorLinhaDoTempo dia={diaDados} />
            {(trilhas.some((t) => t.length > 0) || diaDados.visits.length > 0) && <ConsultorMapa trilhas={trilhas} visitas={diaDados.visits} dark={false} />}
          </div>
        )}
        <ResumoDiaEquipe consultantId={id} dia={dia} />
      </section>

      {/* Lote F2 (§44.7): as praças em que atua — só admin e só com a flag. */}
      {user?.is_admin && features.multi_praca && <PracasDoConsultor consultor={c} />}

      <GanhosConsultor consultantId={id} nome={c.name} />

      {editando && <ConsultorDialog aberto consultor={c} onFechar={() => setEditando(false)} />}

      <Dialog open={qr} onOpenChange={setQr}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>QR code de {c.name}</DialogTitle>
          </DialogHeader>
          <QrDoFreela url={c.signup_url} />
        </DialogContent>
      </Dialog>

      {senhaAberta && <RedefinirSenhaRepresentante c={c} comWhatsapp={features.consultant_profile} onFechar={() => setSenhaAberta(false)} />}

      <AlertDialog open={ligarDesligar} onOpenChange={setLigarDesligar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {c.active ? 'Desativar' : 'Reativar'} {c.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {c.active
                ? 'O acesso dele para na hora e o código no Freela deixa de vincular cadastros. As visitas e os pagamentos ficam guardados.'
                : 'Ele volta a entrar no campo e o código no Freela volta a vincular cadastros.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={atualizar.isPending} onClick={() => atualizar.mutate({ active: !c.active })}>
              {c.active ? 'Desativar' : 'Reativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
