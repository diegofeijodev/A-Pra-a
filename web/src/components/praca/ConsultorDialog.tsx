'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFeaturesMenu } from '@/modules/acesso/application/use-acesso';
import { ehGestor } from '@/modules/acesso/domain/acesso';
import { linkWhatsappAcesso, TIPOS_CONTA } from '@/modules/acesso/domain/cadastro';
import { useAuth } from '@/modules/auth/application/use-auth';
import { usePracas } from '@/modules/pracas/application/use-pracas';
import { useCreateConsultor, useUpdateConsultor } from '@/modules/consultores/application/use-consultores';
import {
  CAMPOS_BANCO,
  CAMPOS_ENDERECO,
  type CampoPerfil,
  type ConsultorView,
  type CreateConsultorInput,
  type PerfilConsultorInput,
  type PixKeyType,
  type UpdateConsultorInput,
} from '@/modules/consultores/infrastructure/consultores.api';

const TIPOS_PIX: [PixKeyType, string][] = [['cpf', 'CPF'], ['email', 'E-mail'], ['telefone', 'Telefone'], ['aleatoria', 'Aleatória']];

const ROTULO_PERFIL: Record<CampoPerfil, string> = {
  address_cep: 'CEP',
  address_street: 'Rua',
  address_number: 'Número',
  address_complement: 'Complemento',
  address_district: 'Bairro',
  address_city: 'Cidade',
  address_state: 'UF',
  bank_name: 'Banco',
  bank_branch: 'Agência',
  bank_account: 'Conta',
  bank_account_type: 'Tipo da conta',
};

/** Endereço do link de entrada do consultor (a mensagem do WhatsApp leva o endereço completo). */
const enderecoDeEntrada = () => (typeof window !== 'undefined' ? `${window.location.origin}/campo/entrar` : '/campo/entrar');

/**
 * Criar/editar consultor (admin; com o perfil gestor ligado, também o gestor — contrato §42.3). Na criação, mostra a senha provisória
 * UMA vez. Lote E: endereço e banco (só com FIELD_CONSULTANT_PROFILE_ENABLED, recolhidos) e "Enviar pelo WhatsApp" na senha.
 * O gestor preenche o Pix ao criar e depois só vê mascarado; não mexe no modo da visita nem no banco — e o corpo dele nem leva
 * esses campos (o servidor responde 403 FORBIDDEN_FIELD só pela presença).
 */
export function ConsultorDialog({ aberto, onFechar, consultor }: { aberto: boolean; onFechar: () => void; consultor?: ConsultorView }) {
  const { data: pracas = [] } = usePracas();
  const { user } = useAuth();
  const { features } = useFeaturesMenu();
  const gestor = ehGestor(user);
  const admin = !!user?.is_admin;
  const perfilLigado = features.consultant_profile;
  const criar = useCreateConsultor();
  const editar = useUpdateConsultor(consultor?.id ?? '');
  const [form, setForm] = useState<CreateConsultorInput>(() => ({
    name: consultor?.name ?? '',
    email: consultor?.email ?? '',
    phone: consultor?.phone ?? '',
    cpf: consultor?.cpf ?? '',
    praca_id: consultor?.praca_id ?? pracas[0]?.id ?? '',
    pix_key_type: consultor?.pix_key_type ?? 'cpf',
    pix_key: consultor?.pix_key ?? '',
  }));
  const [perfil, setPerfil] = useState<Record<CampoPerfil, string>>(
    () => Object.fromEntries([...CAMPOS_ENDERECO, ...CAMPOS_BANCO].map((k) => [k, (consultor?.[k] as string | null | undefined) ?? ''])) as Record<CampoPerfil, string>,
  );
  const [senha, setSenha] = useState<string | null>(null);
  const [fluxo, setFluxo] = useState<string>(consultor?.visit_flow ?? '');
  const campo = (k: keyof CreateConsultorInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });
  const campoPerfil = (k: CampoPerfil) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setPerfil({ ...perfil, [k]: e.target.value });
  // Pix depois de criado: só o admin muda (o gestor recebe a chave mascarada).
  const pixTravado = !!consultor && gestor;

  /** Endereço sempre que o cadastro está ligado; banco só o admin escreve. Vazio = `null` na edição (limpa), ausente na criação. */
  function corpoDoPerfil(edicao: boolean): PerfilConsultorInput {
    if (!perfilLigado) return {};
    const chaves = [...CAMPOS_ENDERECO, ...(admin ? CAMPOS_BANCO : [])];
    const out: PerfilConsultorInput = {};
    for (const k of chaves) {
      const v = perfil[k].trim();
      if (v) out[k] = v;
      else if (edicao && consultor?.[k]) out[k] = null;
    }
    return out;
  }

  async function salvar() {
    const dados = { ...form, praca_id: form.praca_id || pracas[0]?.id || '' };
    try {
      if (consultor) {
        const { pix_key, pix_key_type, ...semPix } = dados;
        const corpo: UpdateConsultorInput = gestor
          ? { ...semPix, ...corpoDoPerfil(true) }
          : { ...semPix, pix_key_type, pix_key, visit_flow: (fluxo || null) as 'simples' | 'completo' | null, ...corpoDoPerfil(true) };
        await editar.mutateAsync(corpo);
        onFechar();
      } else {
        const r = await criar.mutateAsync({ ...dados, ...corpoDoPerfil(false) });
        setSenha(r.temp_password);
      }
    } catch {
      // O toast de erro já sai pelo onError da mutação; o diálogo fica aberto para corrigir.
    }
  }

  const fechar = () => {
    setSenha(null);
    criar.reset(); // a senha provisória não fica no cache de mutações
    onFechar();
  };
  const ocupado = criar.isPending || editar.isPending;
  const whatsapp = senha && perfilLigado ? linkWhatsappAcesso({ telefone: form.phone, nome: form.name, email: form.email.trim().toLowerCase(), senha, endereco: enderecoDeEntrada() }) : null;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !ocupado && !senha && fechar()}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto"
        onInteractOutside={(e) => (senha || ocupado) && e.preventDefault()}
        onEscapeKeyDown={(e) => (senha || ocupado) && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{consultor ? 'Editar consultor' : 'Novo consultor'}</DialogTitle>
        </DialogHeader>
        {senha ? (
          <div className="space-y-3">
            <p className="text-sm">Senha provisória — aparece só agora. Mande pelo WhatsApp junto com o endereço <strong>/campo/entrar</strong>:</p>
            <p data-testid="senha-provisoria" className="rounded-md bg-secondary p-3 text-center font-mono text-lg">
              {senha}
            </p>
            <Button onClick={() => void navigator.clipboard.writeText(senha)} variant="outline" className="w-full">
              Copiar
            </Button>
            {whatsapp && (
              <Button asChild variant="outline" className="h-12 w-full">
                <a href={whatsapp} target="_blank" rel="noreferrer">
                  Enviar pelo WhatsApp
                </a>
              </Button>
            )}
            {perfilLigado && <p className="text-xs text-muted-foreground">No primeiro acesso ele cria uma senha nova (a provisória deixa de valer).</p>}
            <Button onClick={fechar} className="w-full">
              Fechar
            </Button>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void salvar();
            }}
          >
            {(
              [
                ['c-nome', 'Nome', 'name'],
                ['c-email', 'E-mail', 'email'],
                ['c-telefone', 'Telefone', 'phone'],
                ['c-cpf', 'CPF', 'cpf'],
              ] as [string, string, keyof CreateConsultorInput][]
            ).map(([id, rotulo, k]) => (
              <div key={id} className="space-y-1">
                <Label htmlFor={id}>{rotulo}</Label>
                <Input id={id} value={form[k]} onChange={campo(k)} required />
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor="c-praca">Praça</Label>
              <select id="c-praca" value={form.praca_id} onChange={campo('praca_id')} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm">
                {pracas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            {perfilLigado && (
              <details className="rounded-md border border-border p-3">
                <summary className="cursor-pointer text-sm font-bold">Endereço (opcional)</summary>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {CAMPOS_ENDERECO.map((k) => (
                    <div key={k} className={`space-y-1 ${k === 'address_street' ? 'col-span-2' : ''}`}>
                      <Label htmlFor={`c-${k}`}>{ROTULO_PERFIL[k]}</Label>
                      <Input id={`c-${k}`} value={perfil[k]} onChange={campoPerfil(k)} maxLength={k === 'address_state' ? 2 : 120} />
                    </div>
                  ))}
                </div>
              </details>
            )}
            <div className="grid grid-cols-[8rem_1fr] gap-2">
              <div className="space-y-1">
                <Label htmlFor="c-pix-tipo">Tipo da chave Pix</Label>
                <select id="c-pix-tipo" value={form.pix_key_type} onChange={campo('pix_key_type')} disabled={pixTravado} className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm">
                  {TIPOS_PIX.map(([v, r]) => (
                    <option key={v} value={v}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="c-pix">Chave Pix</Label>
                <Input id="c-pix" value={form.pix_key} onChange={campo('pix_key')} required={!pixTravado} disabled={pixTravado} />
              </div>
            </div>
            {pixTravado && <p className="text-xs text-muted-foreground">O Pix é dado de pagamento: depois de criado, só um administrador muda.</p>}
            {perfilLigado && (
              <details className="rounded-md border border-border p-3">
                <summary className="cursor-pointer text-sm font-bold">Banco, agência e conta (opcional)</summary>
                {admin ? (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(['bank_name', 'bank_branch', 'bank_account'] as const).map((k) => (
                      <div key={k} className={`space-y-1 ${k === 'bank_name' ? 'col-span-2' : ''}`}>
                        <Label htmlFor={`c-${k}`}>{ROTULO_PERFIL[k]}</Label>
                        <Input id={`c-${k}`} value={perfil[k]} onChange={campoPerfil(k)} maxLength={k === 'bank_name' ? 80 : 20} />
                      </div>
                    ))}
                    <div className="space-y-1">
                      <Label htmlFor="c-bank_account_type">{ROTULO_PERFIL.bank_account_type}</Label>
                      <select id="c-bank_account_type" value={perfil.bank_account_type} onChange={campoPerfil('bank_account_type')} className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm">
                        <option value="">—</option>
                        {TIPOS_CONTA.map(([v, r]) => (
                          <option key={v} value={v}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="col-span-2 text-xs text-muted-foreground">Só para cadastro: o pagamento continua pelo Pix.</p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm">
                    {consultor?.bank_name || consultor?.bank_account_masked
                      ? `${consultor?.bank_name ?? ''} · agência ${consultor?.bank_branch ?? '—'} · conta ${consultor?.bank_account_masked ?? '—'}`
                      : 'Sem dados de banco.'}{' '}
                    <span className="text-xs text-muted-foreground">Só um administrador vê a conta inteira e muda.</span>
                  </p>
                )}
              </details>
            )}
            {consultor && !gestor && (
              <div className="space-y-1">
                <Label htmlFor="c-fluxo">Modo da visita</Label>
                <select id="c-fluxo" value={fluxo} onChange={(e) => setFluxo(e.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm">
                  <option value="">Seguir o padrão</option>
                  <option value="simples">Simples (jeito do Diego)</option>
                  <option value="completo">Completo (nosso, mais perguntas)</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Vale para as visitas abertas daqui em diante. Hoje para ele: {consultor.visit_flow_effective === 'simples' ? 'simples' : 'completo'}. Só tem efeito com a chave
                  “escolha do modo da visita” ligada no servidor.
                </p>
              </div>
            )}
            <Button type="submit" disabled={criar.isPending || editar.isPending} className="w-full">
              {consultor ? 'Salvar' : 'Criar e gerar senha'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
