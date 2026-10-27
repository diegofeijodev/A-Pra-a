'use client';

import { KeyRound, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RegraSenha } from '@/components/praca/RegraSenha';
import { useFeaturesMenu, usePoliticaSenha } from '@/modules/acesso/application/use-acesso';
import { corpoDoPerfil, perfilDe, ROTULO_PERFIL, type Perfil } from '@/modules/acesso/domain/acesso';
import { gerarSenhaProvisoria, linkWhatsappAcesso, mensagemAcesso } from '@/modules/acesso/domain/cadastro';
import { ROTA } from '@/modules/acesso/domain/enderecos';
import { senhaCumpre, type Politica } from '@/modules/acesso/domain/senha';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useCreateUser, useDeactivateUser, useSetPassword, useUpdateUser, useUsers, type UserView } from '@/modules/users/application/use-users';
import type { UpdateUserInput } from '@/modules/users/infrastructure/users.api';

/**
 * Usuários (Lovable `usuarios.tsx`, UX §4.10, arquitetura §1.1 e §5 E5.8): a equipe numa tela própria (saiu de Configurações >
 * Pessoas). Só o admin abre. A senha provisória é GERADA no navegador (`gerarSenhaProvisoria`: a regra mais forte, §41.2), aparece
 * uma vez e vai pelo `POST /v1/users` / `PUT /v1/users/:id/password` de hoje — a equipe troca quando quiser em "Trocar senha"
 * (D2: sem troca obrigatória). O admin ainda pode digitar outra no lugar da gerada.
 *
 * Abaixo de `md` a tabela vira cartões (UX §0 regra 5) com a MESMA marcação (sem controles duplicados).
 */
interface Credenciais {
  nome: string;
  email: string;
  senha: string;
  telefone: string;
}

const CARTAO = 'rounded-2xl bg-card shadow-card';

export default function UsuariosPage() {
  const { user } = useAuth();
  if (!user?.is_admin) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold">Usuários</h1>
        <p className="text-muted-foreground">Apenas administradores acessam esta página.</p>
        <Button asChild variant="outline">
          <Link href={ROTA.inicio}>Voltar ao Dashboard</Link>
        </Button>
      </div>
    );
  }
  return <Usuarios eu={user.id} />;
}

function Usuarios({ eu }: { eu: string }) {
  const { data: users, isPending, isError, refetch } = useUsers();
  const { features } = useFeaturesMenu();
  const politica = usePoliticaSenha(features.password_policy);
  const regra = features.password_policy ? politica.data : undefined;
  const atualizar = useUpdateUser();
  const desativar = useDeactivateUser();
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState<UserView | null>(null);
  const [redefinir, setRedefinir] = useState<UserView | null>(null);
  const [desligar, setDesligar] = useState<UserView | null>(null);
  const [cred, setCred] = useState<Credenciais | null>(null);
  const lista = users ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Usuários</h1>
        <Button onClick={() => setNovo(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Novo gestor/admin
        </Button>
      </div>
      {features.team_gestor && (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer py-1">ⓘ O que cada perfil pode fazer</summary>
          <p className="mt-1">
            <strong>Admin:</strong> tudo. <strong>Gestor:</strong> cria e edita representantes (o Pix só ao criar), gera senha provisória de representante,
            áreas, rotas e buscas no mapa aberto; não mexe em Pix, pagamentos, vouchers, configuração nem usuários. <strong>Equipe:</strong> vê tudo e
            trabalha no funil, sem configurar nem pagar. Representantes recebem acesso pela tela de Representantes.
          </p>
        </details>
      )}

      {isError ? (
        <div className={`${CARTAO} space-y-2 p-5`}>
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar os usuários.
          </p>
          <Button variant="outline" onClick={() => void refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : isPending ? (
        <div aria-busy="true" className="h-48 animate-pulse rounded-2xl bg-muted" />
      ) : (
        <div className={`${CARTAO} overflow-hidden`}>
          <table className="block w-full text-sm md:table">
            <thead className="hidden border-b text-left text-muted-foreground md:table-header-group">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">E-mail</th>
                <th className="px-4 py-3 font-medium">Perfil</th>
                <th className="px-4 py-3 font-medium">Ativo</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group">
              {lista.map((u) => {
                const proprio = u.id === eu;
                return (
                  <tr key={u.id} className={`block border-b p-4 last:border-0 md:table-row md:p-0 ${u.active ? '' : 'opacity-60'}`}>
                    <td className="block md:table-cell md:px-4 md:py-3">
                      <span className="flex items-center gap-2 font-medium">
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: u.color }} aria-hidden />
                        {u.name}
                      </span>
                      {u.role_label && <span className="block break-words text-xs text-muted-foreground">{u.role_label}</span>}
                    </td>
                    <td className="block break-all py-1 md:table-cell md:px-4 md:py-3">{u.email}</td>
                    <td className="inline-block py-1 pr-4 md:table-cell md:px-4 md:py-3">
                      {features.team_gestor ? (
                        <select
                          aria-label={`Perfil de ${u.name}`}
                          value={perfilDe(u)}
                          disabled={proprio || atualizar.isPending}
                          onChange={(e) => atualizar.mutate({ id: u.id, input: corpoDoPerfil(e.target.value as Perfil) })}
                          className="h-11 rounded-md border border-input bg-background px-2 text-sm md:h-9"
                        >
                          {(['admin', 'gestor', 'equipe'] as Perfil[]).map((x) => (
                            <option key={x} value={x}>
                              {ROTULO_PERFIL[x]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Badge variant="secondary">{ROTULO_PERFIL[perfilDe(u)]}</Badge>
                      )}
                    </td>
                    <td className="inline-block py-1 md:table-cell md:px-4 md:py-3">
                      <span className="flex min-h-11 items-center gap-2 md:min-h-0">
                        <Switch
                          aria-label={`${u.name} ativo`}
                          checked={u.active}
                          disabled={proprio || atualizar.isPending || desativar.isPending}
                          onCheckedChange={(v) => (v ? atualizar.mutate({ id: u.id, input: { active: true } }) : setDesligar(u))}
                        />
                        <span className="text-xs text-muted-foreground md:hidden">{u.active ? 'Ativo' : 'Desativado'}</span>
                      </span>
                    </td>
                    <td className="block pt-2 md:table-cell md:px-4 md:py-3 md:text-right">
                      <span className="flex flex-wrap gap-2 md:justify-end">
                        {proprio ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={ROTA.trocarSenha}>
                              <KeyRound className="h-4 w-4" aria-hidden /> Trocar senha
                            </Link>
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setRedefinir(u)}>
                            <KeyRound className="h-4 w-4" aria-hidden /> Redefinir senha
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" aria-label={`Editar ${u.name}`} onClick={() => setEditar(u)}>
                          <Pencil className="h-4 w-4" aria-hidden />
                        </Button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <NovoUsuario aberto={novo} onFechar={() => setNovo(false)} regra={regra} gestor={features.team_gestor} onCriado={setCred} />
      {editar && <EditarUsuario u={editar} onFechar={() => setEditar(null)} />}
      {redefinir && (
        <RedefinirSenha
          u={redefinir}
          regra={regra}
          onFechar={() => setRedefinir(null)}
          onSalva={(senha) => {
            setCred({ nome: redefinir.name, email: redefinir.email, senha, telefone: redefinir.phone });
            setRedefinir(null);
          }}
        />
      )}
      <CredenciaisEquipe cred={cred} onFechar={() => setCred(null)} />

      <AlertDialog open={!!desligar} onOpenChange={(o) => !o && setDesligar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar {desligar?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Ele não entra mais no Praça. A conta fica guardada e pode ser reativada aqui.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (desligar) desativar.mutate(desligar.id);
                setDesligar(null);
              }}
            >
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Campo da senha provisória: já vem gerada (regra mais forte); "Gerar outra" sorteia de novo; o admin pode digitar outra. */
function CampoSenha({ id, valor, onMudar, regra }: { id: string; valor: string; onMudar: (s: string) => void; regra: Politica | undefined }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Senha provisória</Label>
      <div className="flex gap-2">
        <Input id={id} value={valor} onChange={(e) => onMudar(e.target.value)} autoComplete="off" spellCheck={false} className="font-mono" aria-describedby={`${id}-regra`} />
        <Button type="button" variant="outline" onClick={() => onMudar(gerarSenhaProvisoria())}>
          Gerar outra
        </Button>
      </div>
      {regra?.enabled ? <RegraSenha id={`${id}-regra`} senha={valor} politica={regra} compacta /> : <span id={`${id}-regra`} className="sr-only" />}
    </div>
  );
}

function NovoUsuario({
  aberto,
  onFechar,
  regra,
  gestor,
  onCriado,
}: {
  aberto: boolean;
  onFechar: () => void;
  regra: Politica | undefined;
  gestor: boolean;
  onCriado: (c: Credenciais) => void;
}) {
  const criar = useCreateUser();
  const perfis: Perfil[] = gestor ? ['gestor', 'admin', 'equipe'] : ['admin', 'equipe'];
  const vazio = () => ({ nome: '', email: '', perfil: perfis[0]!, senha: gerarSenhaProvisoria() });
  const [f, setF] = useState(vazio);
  const [erro, setErro] = useState<string | null>(null);

  const fechar = () => {
    setF(vazio());
    setErro(null);
    onFechar();
  };
  const salvar = () => {
    const nome = f.nome.trim();
    const email = f.email.trim().toLowerCase();
    if (nome.length < 2) return setErro('Informe o nome.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setErro('Informe o e-mail (é o login).');
    if (!f.senha || !senhaCumpre(f.senha, regra)) return setErro('A senha provisória não cumpre a regra.');
    setErro(null);
    // Sem o perfil gestor ligado, só existe admin ou equipe (o servidor não aceita `is_gestor`, §42.1).
    const perfil = gestor ? corpoDoPerfil(f.perfil) : { is_admin: f.perfil === 'admin' };
    criar.mutate(
      { name: nome, email, password: f.senha, ...perfil },
      {
        onSuccess: (u) => {
          onCriado({ nome: u.name, email: u.email, senha: f.senha, telefone: u.phone });
          fechar();
        },
      },
    );
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !criar.isPending && fechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="u-nome">Nome completo</Label>
            <Input id="u-nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-email">E-mail</Label>
            <Input id="u-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="off" />
            <p className="text-xs text-muted-foreground">É o login da pessoa.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-perfil">Perfil</Label>
            <select
              id="u-perfil"
              value={f.perfil}
              onChange={(e) => setF({ ...f, perfil: e.target.value as Perfil })}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm md:h-9"
            >
              {perfis.map((x) => (
                <option key={x} value={x}>
                  {ROTULO_PERFIL[x]}
                </option>
              ))}
            </select>
          </div>
          <CampoSenha id="u-senha" valor={f.senha} onMudar={(senha) => setF({ ...f, senha })} regra={regra} />
          <p className="text-xs text-muted-foreground">Representantes recebem acesso pela tela de Representantes.</p>
          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={criar.isPending}>
              Criar usuário
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RedefinirSenha({ u, regra, onFechar, onSalva }: { u: UserView; regra: Politica | undefined; onFechar: () => void; onSalva: (senha: string) => void }) {
  const definir = useSetPassword();
  const [senha, setSenha] = useState(gerarSenhaProvisoria);
  const [erro, setErro] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && !definir.isPending && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redefinir senha de {u.name}</DialogTitle>
          <DialogDescription>A senha de agora deixa de valer. A nova aparece só uma vez, para você mandar à pessoa.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!senha || !senhaCumpre(senha, regra)) return setErro('A senha não cumpre a regra.');
            setErro(null);
            definir.mutate({ id: u.id, password: senha }, { onSuccess: () => onSalva(senha) });
          }}
        >
          <CampoSenha id="r-senha" valor={senha} onMudar={setSenha} regra={regra} />
          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={definir.isPending}>
              Salvar senha
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Nome, função, telefone e cor (nossos; a Lovable não edita). O e-mail não muda: nenhum `PATCH` do contrato aceita (§3). */
function EditarUsuario({ u, onFechar }: { u: UserView; onFechar: () => void }) {
  const atualizar = useUpdateUser();
  const [f, setF] = useState({ name: u.name, role_label: u.role_label, phone: u.phone, color: u.color });
  return (
    <Dialog open onOpenChange={(o) => !o && !atualizar.isPending && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar {u.name}</DialogTitle>
          <DialogDescription>{u.email}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!f.name.trim()) return;
            const mudou: UpdateUserInput = {};
            if (f.name !== u.name) mudou.name = f.name.trim();
            if (f.role_label !== u.role_label) mudou.role_label = f.role_label;
            if (f.phone !== u.phone) mudou.phone = f.phone;
            if (f.color !== u.color) mudou.color = f.color;
            if (Object.keys(mudou).length === 0) return onFechar();
            atualizar.mutate({ id: u.id, input: mudou }, { onSuccess: onFechar });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="e-nome">Nome</Label>
            <Input id="e-nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-funcao">Função</Label>
            <Input id="e-funcao" value={f.role_label} onChange={(e) => setF({ ...f, role_label: e.target.value })} />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="e-telefone">Telefone</Label>
              <Input id="e-telefone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-cor">Cor</Label>
              <input id="e-cor" type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="h-11 w-14 cursor-pointer rounded-md border border-border bg-transparent md:h-9" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={atualizar.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Acesso gerado" (Lovable `CredenciaisDialog`): aparece só agora; não fecha num clique fora nem no Esc. */
function CredenciaisEquipe({ cred, onFechar }: { cred: Credenciais | null; onFechar: () => void }) {
  if (!cred) return null;
  const dados = { nome: cred.nome, email: cred.email, senha: cred.senha, endereco: `${window.location.origin}${ROTA.entrar}`, trocaObrigatoria: false };
  const msg = mensagemAcesso(dados);
  const whatsapp = linkWhatsappAcesso({ ...dados, telefone: cred.telefone });
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Acesso gerado</DialogTitle>
          <DialogDescription>Estas credenciais aparecem só agora. Copie ou envie antes de fechar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 rounded-xl bg-secondary p-4 font-mono text-sm">
          <div className="break-all">
            Usuário: <strong>{cred.email}</strong>
          </div>
          <div>
            Senha: <strong data-testid="senha-provisoria">{cred.senha}</strong>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              void navigator.clipboard.writeText(msg).then(
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
