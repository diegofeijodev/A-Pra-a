'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { linkWhatsappAcesso, mensagemAcesso } from '@/modules/acesso/domain/cadastro';
import { ROTA_CAMPO } from '@/modules/acesso/domain/enderecos';
import { useResetSenhaConsultor } from '@/modules/consultores/application/use-consultores';

export interface CredenciaisRep {
  nome: string;
  email: string;
  telefone: string;
  senha: string;
}

/**
 * "Acesso gerado" do representante (Lovable `CredenciaisDialog`, UX §4.7), para o novo e para "Redefinir senha": aparece só agora e
 * não fecha num clique fora nem no Esc. O endereço é a entrada do campo (`/campo/entrar`, dentro do escopo do atalho instalado). O
 * "Enviar pelo WhatsApp" segue atrás do cadastro do lote E (`consultant_profile`), como antes.
 */
export function CredenciaisRepresentante({ cred, comWhatsapp, aviso, onFechar }: { cred: CredenciaisRep; comWhatsapp: boolean; aviso?: string; onFechar: () => void }) {
  const dados = { nome: cred.nome, email: cred.email, senha: cred.senha, endereco: `${window.location.origin}${ROTA_CAMPO.entrar}` };
  const whatsapp = comWhatsapp ? linkWhatsappAcesso({ ...dados, telefone: cred.telefone }) : null;
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Acesso gerado</DialogTitle>
          <DialogDescription>Estas credenciais aparecem só agora. Copie ou envie antes de fechar.</DialogDescription>
        </DialogHeader>
        {aviso && <p className="text-sm">{aviso}</p>}
        <div className="space-y-2 rounded-xl bg-secondary p-4 font-mono text-sm">
          <div className="break-all">
            E-mail: <strong>{cred.email}</strong>
          </div>
          <div>
            Senha: <strong data-testid="senha-provisoria">{cred.senha}</strong>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">No primeiro acesso ele cria uma senha nova (a provisória deixa de valer).</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              void navigator.clipboard.writeText(mensagemAcesso(dados)).then(
                () => toast.success('Copiado!'),
                () => toast.error('Não deu para copiar. Selecione o texto e copie à mão.'),
              )
            }
          >
            Copiar
          </Button>
          {whatsapp && (
            <Button asChild variant="outline">
              <a href={whatsapp} target="_blank" rel="noreferrer">
                Enviar pelo WhatsApp
              </a>
            </Button>
          )}
          <Button onClick={onFechar}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Redefinir senha" (o "Nova senha provisória" de antes): confirma a consequência, gera no servidor (`POST …/reset-password`, que
 * derruba a sessão aberta no celular) e mostra as credenciais uma vez.
 */
export function RedefinirSenhaRepresentante({
  c,
  comWhatsapp,
  onFechar,
}: {
  c: { id: string; name: string; email: string; phone: string };
  comWhatsapp: boolean;
  onFechar: () => void;
}) {
  const resetar = useResetSenhaConsultor(c.id);
  const [senha, setSenha] = useState<string | null>(null);
  const fechar = () => {
    setSenha(null);
    resetar.reset(); // a senha provisória não fica no cache de mutações
    onFechar();
  };
  if (senha) {
    return (
      <CredenciaisRepresentante
        cred={{ nome: c.name, email: c.email, telefone: c.phone, senha }}
        comWhatsapp={comWhatsapp}
        aviso="O acesso aberto no celular dele caiu; ele entra com esta senha e troca."
        onFechar={fechar}
      />
    );
  }
  return (
    <Dialog open onOpenChange={(o) => !o && !resetar.isPending && fechar()}>
      <DialogContent onInteractOutside={(e) => resetar.isPending && e.preventDefault()} onEscapeKeyDown={(e) => resetar.isPending && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Redefinir senha de {c.name}</DialogTitle>
          <DialogDescription>Gera uma senha provisória nova e derruba o acesso aberto no celular do representante.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={resetar.isPending} onClick={fechar}>
            Cancelar
          </Button>
          <Button disabled={resetar.isPending} onClick={() => resetar.mutate(undefined, { onSuccess: (r) => setSenha(r.temp_password) })}>
            {resetar.isPending ? 'Gerando…' : 'Gerar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
