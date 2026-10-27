'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CredenciaisRepresentante } from '@/components/praca/AcessoRepresentante';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFeaturesMenu } from '@/modules/acesso/application/use-acesso';
import { ehGestor } from '@/modules/acesso/domain/acesso';
import { TIPOS_CONTA } from '@/modules/acesso/domain/cadastro';
import { ROTA } from '@/modules/acesso/domain/enderecos';
import { useAuth } from '@/modules/auth/application/use-auth';
import { usePracas } from '@/modules/pracas/application/use-pracas';
import { useCreateConsultor, useUpdateConsultor } from '@/modules/consultores/application/use-consultores';
import { useConfigRemuneracao } from '@/modules/remuneracao/application/use-remuneracao';
import { resumoRegra } from '@/modules/remuneracao/domain/remuneracao';
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

const SELECT = 'h-11 w-full rounded-md border border-input bg-background px-2 text-sm md:h-9';
const pilula = (ativa: boolean) =>
  `min-h-11 rounded-md border px-3 text-sm md:min-h-8 ${ativa ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-secondary'}`;

/**
 * "Remuneração" do cadastro, só leitura (UX §4.7 item 7): a nossa regra é versionada, com vigência e razão — editar aqui pularia isso
 * [desvio: regra]. Mostra a regra geral em vigor e leva a quem muda (Configurações; a regra própria fica na ficha).
 */
function RemuneracaoLeitura({ edicao }: { edicao: boolean }) {
  const cfg = useConfigRemuneracao();
  const v = cfg.data?.current;
  const porConsultor = !!cfg.data?.features?.per_consultant_enabled;
  return (
    <div className="space-y-1 sm:col-span-2">
      <p className="text-sm font-medium">Remuneração</p>
      <div className="space-y-1 rounded-xl bg-secondary p-3 text-sm">
        {v ? (
          <p>
            Segue a regra geral (versão {v.version}): {resumoRegra(v.config_effective ?? v.config).slice(0, 2).join(' ')}
            {porConsultor ? (edicao ? ' Se ele tiver regra própria, ela vale no lugar e está na ficha dele.' : ' Uma regra própria se cria na ficha, depois de salvar.') : ''}
          </p>
        ) : (
          <p className="text-muted-foreground">{cfg.isError ? 'Não foi possível ler a regra agora.' : 'Lendo a regra…'}</p>
        )}
        <Link href={ROTA.configuracoes} className="inline-flex min-h-11 items-center text-primary underline md:min-h-0">
          Mudar a regra
        </Link>
      </div>
    </div>
  );
}

/**
 * Cadastro do representante (Lovable `RepForm`, UX §4.7; admin e, com o perfil gestor ligado, o gestor — contrato §42.3), na ordem e
 * na grade da Lovable. Na criação, mostra as credenciais UMA vez ("Acesso gerado"). Lote E: endereço à vista e banco (só com
 * FIELD_CONSULTANT_PROFILE_ENABLED) e "Enviar pelo WhatsApp". A praça é a principal (escolha única); as outras (F2) ficam na ficha.
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
  if (senha) {
    return (
      <CredenciaisRepresentante
        cred={{ nome: form.name, email: form.email.trim().toLowerCase(), telefone: form.phone, senha }}
        comWhatsapp={perfilLigado}
        onFechar={fechar}
      />
    );
  }

  const muitas = features.multi_praca && (consultor?.praca_ids?.length ?? 0) > 1;
  // A lista de praças pode chegar depois de o diálogo abrir: sem escolha, vale a 1ª (a mesma que o `salvar` manda).
  const pracaEscolhida = form.praca_id || pracas[0]?.id || '';
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !ocupado && fechar()}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        onInteractOutside={(e) => ocupado && e.preventDefault()}
        onEscapeKeyDown={(e) => ocupado && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{consultor ? 'Editar representante' : 'Novo representante'}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void salvar();
          }}
        >
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="c-nome">Nome completo</Label>
            <Input id="c-nome" value={form.name} onChange={campo('name')} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="c-email">E-mail</Label>
            <Input id="c-email" type="email" value={form.email} onChange={campo('email')} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="c-telefone">Telefone / WhatsApp</Label>
            <Input id="c-telefone" inputMode="tel" placeholder="(00) 00000-0000" value={form.phone} onChange={campo('phone')} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="c-cpf">CPF</Label>
            <Input id="c-cpf" inputMode="numeric" value={form.cpf} onChange={campo('cpf')} required />
          </div>
          {perfilLigado && (
            <>
              <div className="space-y-1">
                <Label htmlFor="c-address_cep">{ROTULO_PERFIL.address_cep}</Label>
                <Input id="c-address_cep" inputMode="numeric" value={perfil.address_cep} onChange={campoPerfil('address_cep')} maxLength={120} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="c-address_street">{ROTULO_PERFIL.address_street}</Label>
                <Input id="c-address_street" value={perfil.address_street} onChange={campoPerfil('address_street')} maxLength={120} />
              </div>
              {(['address_number', 'address_complement', 'address_district'] as const).map((k) => (
                <div key={k} className="space-y-1">
                  <Label htmlFor={`c-${k}`}>{ROTULO_PERFIL[k]}</Label>
                  <Input id={`c-${k}`} value={perfil[k]} onChange={campoPerfil(k)} maxLength={120} />
                </div>
              ))}
              <div className="grid grid-cols-[1fr_80px] gap-2">
                <div className="space-y-1">
                  <Label htmlFor="c-address_city">{ROTULO_PERFIL.address_city}</Label>
                  <Input id="c-address_city" value={perfil.address_city} onChange={campoPerfil('address_city')} maxLength={120} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="c-address_state">{ROTULO_PERFIL.address_state}</Label>
                  <Input id="c-address_state" value={perfil.address_state} onChange={campoPerfil('address_state')} maxLength={2} />
                </div>
              </div>
            </>
          )}
          <div className="space-y-1 sm:col-span-2">
            <p className="text-sm font-medium" id="c-praca-rotulo">
              {muitas ? 'Praça principal' : 'Praça em que atua'}
            </p>
            <div className="flex flex-wrap gap-1" role="group" aria-labelledby="c-praca-rotulo">
              {pracas.map((p) => (
                <button key={p.id} type="button" aria-pressed={pracaEscolhida === p.id} onClick={() => setForm({ ...form, praca_id: p.id })} className={pilula(pracaEscolhida === p.id)}>
                  {p.name}
                </button>
              ))}
            </div>
            {features.multi_praca && <p className="text-xs text-muted-foreground">As outras praças em que ele atua ficam na ficha dele (só administradores mudam).</p>}
          </div>
          {features.earnings && <RemuneracaoLeitura edicao={!!consultor} />}
          <div className="space-y-1">
            <Label htmlFor="c-pix-tipo">Tipo da chave Pix</Label>
            <select id="c-pix-tipo" value={form.pix_key_type} onChange={campo('pix_key_type')} disabled={pixTravado} className={SELECT}>
              {TIPOS_PIX.map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="c-pix">Chave PIX</Label>
            <Input id="c-pix" value={form.pix_key} onChange={campo('pix_key')} required={!pixTravado} disabled={pixTravado} />
          </div>
          {pixTravado && <p className="text-xs text-muted-foreground sm:col-span-2">O Pix é dado de pagamento: depois de criado, só um administrador muda.</p>}
          {perfilLigado && (
            <div className="space-y-2 sm:col-span-2">
              <p className="text-sm font-medium">Banco / dados bancários</p>
              {admin ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {(['bank_name', 'bank_branch', 'bank_account'] as const).map((k) => (
                    <div key={k} className={`space-y-1 ${k === 'bank_name' ? 'sm:col-span-2' : ''}`}>
                      <Label htmlFor={`c-${k}`}>{ROTULO_PERFIL[k]}</Label>
                      <Input id={`c-${k}`} value={perfil[k]} onChange={campoPerfil(k)} maxLength={k === 'bank_name' ? 80 : 20} />
                    </div>
                  ))}
                  <div className="space-y-1">
                    <Label htmlFor="c-bank_account_type">{ROTULO_PERFIL.bank_account_type}</Label>
                    <select id="c-bank_account_type" value={perfil.bank_account_type} onChange={campoPerfil('bank_account_type')} className={SELECT}>
                      <option value="">—</option>
                      {TIPOS_CONTA.map(([v, r]) => (
                        <option key={v} value={v}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xs text-muted-foreground sm:col-span-2">Só para cadastro: o pagamento continua pelo Pix.</p>
                </div>
              ) : (
                <p className="text-sm">
                  {consultor?.bank_name || consultor?.bank_account_masked
                    ? `${consultor?.bank_name ?? ''} · agência ${consultor?.bank_branch ?? '—'} · conta ${consultor?.bank_account_masked ?? '—'}`
                    : 'Sem dados de banco.'}{' '}
                  <span className="text-xs text-muted-foreground">Só um administrador vê a conta inteira e muda.</span>
                </p>
              )}
            </div>
          )}
          {consultor && !gestor && (
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="c-fluxo">Modo da visita</Label>
              <select id="c-fluxo" value={fluxo} onChange={(e) => setFluxo(e.target.value)} className={SELECT}>
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
          <DialogFooter className="gap-2 sm:col-span-2">
            <Button type="button" variant="outline" disabled={ocupado} onClick={fechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={ocupado}>
              {consultor ? 'Salvar' : 'Salvar e gerar senha'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
