'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { QrDoFreela } from '@/components/campo/QrDoFreela';
import { ConsultorDialog } from '@/components/praca/ConsultorDialog';
import { GanhosConsultor } from '@/components/praca/GanhosConsultor';
import { ConsultorLinhaDoTempo } from '@/components/praca/ConsultorLinhaDoTempo';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { todaySp } from '@/lib/dates';
import { useAuth } from '@/modules/auth/application/use-auth';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import {
  useConsultor,
  useDiaConsultor,
  useFreelaSyncConsultor,
  useResetSenhaConsultor,
  useUpdateConsultor,
} from '@/modules/consultores/application/use-consultores';

const ConsultorMapa = dynamic(() => import('@/components/praca/ConsultorMapa'), { ssr: false });

export default function ConsultorDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const admin = !!user?.is_admin;
  const dark = user?.theme !== 'light';
  const [dia, setDia] = useState(todaySp());
  const { data: c, isError: consultorErro, error: erroConsultor, refetch: recarregarConsultor } = useConsultor(id);
  const { data: diaDados, isPending, isError: diaErro, error: erroDia, refetch: recarregarDia } = useDiaConsultor(id, dia);
  const atualizar = useUpdateConsultor(id);
  const resetar = useResetSenhaConsultor(id);
  const sincronizar = useFreelaSyncConsultor(id);
  const [editando, setEditando] = useState(false);
  const [qr, setQr] = useState(false);
  const [senhaAberta, setSenhaAberta] = useState(false);
  const [senha, setSenha] = useState<string | null>(null);

  const fecharSenha = () => {
    setSenhaAberta(false);
    setSenha(null);
    resetar.reset(); // a senha provisória não fica no cache de mutações
  };

  const trilhas = useMemo(() => diaDados?.journeys.map((j) => j.points) ?? [], [diaDados]);

  if (!c) {
    if (!consultorErro) return <p className="text-sm text-muted-foreground">Carregando…</p>;
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">{apiErrorMessage(erroConsultor, 'Não foi possível carregar o consultor.')}</p>
        <Button variant="outline" onClick={() => void recarregarConsultor()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  return (
    <>
      <h1 className="font-display text-xl font-extrabold">{c.name}</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        {c.praca_name} · {c.email} · {c.phone} · {c.active ? 'ativo' : 'desativado'}
      </p>
      <p className="mt-1 text-xs">
        {c.freela_code ? `Código Freela: ${c.freela_code}` : `Código pendente${c.freela_sync_error ? ` — ${c.freela_sync_error}` : ''}`}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setQr(true)}>
          Ver QR code
        </Button>
        {admin && (
          <>
            <Button variant="outline" onClick={() => setEditando(true)}>
              Editar
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const msg = c.active ? 'Desativar? O acesso dele para na hora e o código no Freela deixa de vincular cadastros.' : 'Reativar o consultor?';
                if (window.confirm(msg)) atualizar.mutate({ active: !c.active });
              }}
            >
              {c.active ? 'Desativar' : 'Reativar'}
            </Button>
            <Button variant="outline" onClick={() => setSenhaAberta(true)}>
              Nova senha provisória
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
            {(trilhas.some((t) => t.length > 0) || diaDados.visits.length > 0) && <ConsultorMapa trilhas={trilhas} visitas={diaDados.visits} dark={dark} />}
          </div>
        )}
      </section>

      <GanhosConsultor consultantId={id} />

      {editando && <ConsultorDialog aberto consultor={c} onFechar={() => setEditando(false)} />}

      <Dialog open={qr} onOpenChange={setQr}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>QR code de {c.name}</DialogTitle>
          </DialogHeader>
          <QrDoFreela url={c.signup_url} />
        </DialogContent>
      </Dialog>

      <Dialog
        open={senhaAberta}
        onOpenChange={(o) => {
          if (!o && !resetar.isPending && !senha) fecharSenha();
        }}
      >
        <DialogContent
          className="max-h-[85vh] overflow-y-auto"
          onInteractOutside={(e) => (senha || resetar.isPending) && e.preventDefault()}
          onEscapeKeyDown={(e) => (senha || resetar.isPending) && e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Nova senha provisória</DialogTitle>
          </DialogHeader>
          {senha ? (
            <div className="space-y-3">
              <p className="text-sm">Aparece só agora. O acesso aberto no celular dele caiu; ele entra com esta senha e troca.</p>
              <p data-testid="senha-provisoria" className="rounded-md bg-secondary p-3 text-center font-mono text-lg">
                {senha}
              </p>
              <Button
                onClick={fecharSenha}
                className="w-full"
              >
                Fechar
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">Gera uma senha nova e derruba o acesso aberto no celular do consultor.</p>
              <Button onClick={() => resetar.mutate(undefined, { onSuccess: (r) => setSenha(r.temp_password) })} disabled={resetar.isPending} className="w-full">
                Gerar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
