'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CadastroLink } from '@/components/campo/CadastroLink';
import { CampoTopo } from '@/components/campo/CampoTopo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { useCampoMe, useDia } from '@/modules/campo/application/use-campo';
import { enfileirar, useFilaStore } from '@/modules/campo/application/use-fila';
import { useOnline } from '@/modules/campo/application/use-online';
import { irPara } from '@/modules/campo/application/use-tela';
import {
  formInicial,
  manterClientId,
  mensagemDoErro,
  montarPayload,
  ROTULO_SITUACAO,
  situacao,
  validarForm,
  type ErrosForm,
  type FormCadastro,
  type SignupView,
} from '@/modules/campo/domain/cadastro-empresa';
import { campoCadastroDaVisita, campoCriarCadastro, campoReemitirLink } from '@/modules/campo/infrastructure/campo.api';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

const CAMPO = 'h-12 text-base';

function Campo({ id, rotulo, erro, children }: { id: string; rotulo: string; erro?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-bold">
        {rotulo}
      </label>
      {children}
      {erro && (
        <p role="alert" className="text-sm text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}

/**
 * Visão `cadastro` de `/campo` (contrato §26): cadastra a empresa visitada no Freela e mostra o
 * link de primeiro acesso em QR. O consultor nunca vê senha; o link só existe nesta tela.
 */
export function CadastroEmpresaTela({ refVisita }: { refVisita: string }) {
  const consultantId = useCampoSession((s) => s.session?.consultant.id ?? '');
  const itens = useFilaStore((s) => s.itens);
  const online = useOnline();
  const qc = useQueryClient();
  const { dia } = useDia();
  const me = useCampoMe();
  const nomeLocal = dia.visitas.find((v) => v.ref === refVisita)?.nome ?? '';

  const consulta = useQuery({
    queryKey: ['campo', 'company-signup', refVisita],
    queryFn: () => campoCadastroDaVisita(refVisita),
    enabled: online,
    retry: false,
    // Resposta sem link, mas com telefone mascarado: nada fica guardado entre sessões.
    gcTime: 0,
  });

  const [edicao, setEdicao] = useState<FormCadastro | null>(null);
  const form = edicao ?? formInicial(consulta.data?.prefill ?? null, nomeLocal);
  const [erros, setErros] = useState<ErrosForm>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /** O link só existe aqui, em memória (contrato §26.0). */
  const [comLink, setComLink] = useState<SignupView | null>(null);
  const [telefoneDono, setTelefoneDono] = useState<string | null>(null);
  const clientId = useRef(crypto.randomUUID());

  const naFila = itens.some((i) => i.kind === 'signup' && i.visit_ref === refVisita);
  const checkinNaFila = itens.some((i) => i.kind === 'checkin' && i.payload.client_id === refVisita);
  // O envio da fila terminou: busca o estado novo (o link nunca vem junto, §26.0).
  const eraNaFila = useRef(naFila);
  useEffect(() => {
    if (eraNaFila.current && !naFila) void qc.invalidateQueries({ queryKey: ['campo', 'company-signup', refVisita] });
    eraNaFila.current = naFila;
  }, [naFila, qc, refVisita]);
  const signup = consulta.data?.signup ?? null;
  const sit = situacao(signup, naFila);

  const voltar = () => irPara({ v: 'visita', ref: refVisita }, 'replace');
  const mudar = (campo: keyof FormCadastro, valor: string) => setEdicao({ ...form, [campo]: valor });

  async function guardarNaFila(payload: ReturnType<typeof montarPayload>) {
    await enfileirar({ kind: 'signup', visit_ref: refVisita, payload }, consultantId);
    toast.success('Cadastro guardado no celular. O link aparece quando houver sinal.');
  }

  async function enviar() {
    const e = validarForm(form);
    setErros(e);
    setErro(null);
    if (Object.keys(e).length > 0) return;
    const payload = montarPayload(form, clientId.current);
    setOcupado(true);
    try {
      // Sem sinal, ou com o check-in da visita ainda na fila (a visita ainda não existe lá): a fila cuida, em ordem.
      if (!online || checkinNaFila) {
        await guardarNaFila(payload);
        return;
      }
      try {
        const v = await campoCriarCadastro(refVisita, payload);
        setTelefoneDono(form.phone);
        setComLink(v);
        void qc.invalidateQueries({ queryKey: ['campo', 'company-signup', refVisita] });
      } catch (falha) {
        if (axios.isAxiosError(falha) && !falha.response) {
          // Pode ter chegado ao servidor: o mesmo client_id torna o reenvio seguro.
          await guardarNaFila(payload);
          return;
        }
        const code = axios.isAxiosError(falha) ? (falha.response?.data as { error?: { code?: string } } | undefined)?.error?.code : undefined;
        setErro(mensagemDoErro(code, apiErrorMessage(falha, 'Não foi possível cadastrar agora.')));
        // Recusa definitiva: o próximo envio, com dados corrigidos, é um cadastro novo. Se o Freela pode
        // ter criado a conta (5xx, 429), a MESMA chave evita 409 "já cadastrada" no reenvio.
        const status = axios.isAxiosError(falha) ? falha.response?.status : undefined;
        if (!manterClientId(status)) clientId.current = crypto.randomUUID();
        void qc.invalidateQueries({ queryKey: ['campo', 'company-signup', refVisita] });
      }
    } catch {
      setErro('Não foi possível guardar o cadastro neste aparelho.');
    } finally {
      setOcupado(false);
    }
  }

  async function novoLink(id: string) {
    if (comLink && !window.confirm('Gerar um novo link invalida o anterior. Continuar?')) return;
    setErro(null);
    setOcupado(true);
    try {
      const v = await campoReemitirLink(id);
      setComLink(v);
      void qc.invalidateQueries({ queryKey: ['campo', 'company-signup', refVisita] });
    } catch (falha) {
      const code = axios.isAxiosError(falha) ? (falha.response?.data as { error?: { code?: string } } | undefined)?.error?.code : undefined;
      setErro(mensagemDoErro(code, apiErrorMessage(falha, 'Não foi possível gerar o link agora.')));
      void qc.invalidateQueries({ queryKey: ['campo', 'company-signup', refVisita] });
    } finally {
      setOcupado(false);
    }
  }

  if (me.data && me.data.features?.company_signup !== true) {
    return (
      <main className="space-y-4">
        <CampoTopo titulo="Cadastrar no Freela" />
        <p className="card-surface p-5 text-sm">O cadastro assistido não está disponível agora. Use o QR code do seu código.</p>
        <button type="button" onClick={voltar} className="flex h-12 w-full items-center justify-center rounded-md border border-border text-sm font-bold">
          Voltar para a visita
        </button>
      </main>
    );
  }

  // Sem saber o estado da visita, o formulário poderia duplicar um cadastro que já existe.
  const carregando = online && consulta.isPending;
  const falhouAoLer = consulta.isError;
  const falhaCodigo = axios.isAxiosError(consulta.error) ? (consulta.error.response?.data as { error?: { code?: string } } | undefined)?.error?.code : undefined;
  const indisponivel = falhaCodigo === 'SIGNUP_UNAVAILABLE' || falhaCodigo === 'FREELA_NOT_CONFIGURED';

  if (comLink?.setup_link) {
    return (
      <main className="space-y-5 pb-10">
        <CampoTopo titulo="Cadastrar no Freela" />
        <CadastroLink
          empresa={comLink.company_name}
          link={comLink.setup_link}
          expiraEm={comLink.link_expires_at}
          telefoneDono={telefoneDono}
          ocupado={ocupado}
          onNovoLink={() => void novoLink(comLink.id)}
          onConcluir={voltar}
        />
        {erro && (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
            {erro}
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="space-y-5 pb-10">
      <CampoTopo titulo="Cadastrar no Freela" />
      <button type="button" onClick={voltar} className="text-sm font-bold text-primary">
        ← Voltar para a visita
      </button>

      {comLink && !comLink.setup_link && (
        <p role="status" className="rounded-md border border-border p-3 text-sm">
          Este cadastro já existia. Toque em &quot;Gerar link de acesso&quot; para mostrar o QR.
        </p>
      )}
      {erro && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
          {erro}
        </p>
      )}

      {carregando && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {falhouAoLer && !naFila && (
        <div role="alert" className="space-y-2 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
          <p>
            {indisponivel
              ? mensagemDoErro('SIGNUP_UNAVAILABLE', '')
              : `Não deu para ver se esta empresa já foi cadastrada: ${apiErrorMessage(consulta.error, 'erro ao carregar')}.`}
          </p>
          {!indisponivel && (
            <button type="button" onClick={() => void consulta.refetch()} className="flex h-12 items-center rounded-md border border-border px-4 text-sm font-bold">
              Tentar de novo
            </button>
          )}
        </div>
      )}

      {!carregando && (!falhouAoLer || naFila) && (
        <p className="text-sm font-bold" data-testid="situacao-cadastro">
          {ROTULO_SITUACAO[sit.tipo]}
        </p>
      )}

      {sit.tipo === 'na_fila' && (
        <p className="card-surface p-4 text-sm">
          O cadastro está guardado neste celular e será criado quando houver sinal. <strong>O link só aparece quando o celular tiver sinal</strong>: depois
          que o envio terminar, volte aqui e toque em &quot;Gerar link de acesso&quot;.
        </p>
      )}

      {(sit.tipo === 'aguardando_dono' || (comLink && !comLink.setup_link)) && signup && (
        <div className="space-y-3">
          <p className="card-surface p-4 text-sm">
            {signup.company_name} · {signup.phone_masked}. O dono ainda não definiu a senha.
          </p>
          <Button onClick={() => void novoLink(signup.id)} disabled={ocupado || !online} className="h-14 w-full text-base">
            {ocupado ? 'Gerando…' : 'Gerar link de acesso'}
          </Button>
          {!online && <p className="text-sm text-muted-foreground">Sem sinal: o link só aparece quando o celular tiver sinal.</p>}
        </div>
      )}

      {sit.tipo === 'ativado' && signup && (
        <p className="card-surface p-4 text-sm">{signup.company_name} já tem acesso ao Freela. Não é preciso gerar outro link.</p>
      )}

      {sit.tipo === 'ja_cadastrada' && (
        <p role="status" className="card-surface p-4 text-sm">
          {mensagemDoErro(signup?.last_error_code ?? undefined, sit.mensagem)}
        </p>
      )}

      {!carregando && !indisponivel && (sit.tipo === 'novo' || sit.tipo === 'tentar_de_novo' || sit.tipo === 'ja_cadastrada') && (
        <form
          className="space-y-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            void enviar();
          }}
        >
          {sit.tipo === 'tentar_de_novo' && sit.mensagem && <p className="text-sm text-muted-foreground">Da última vez: {sit.mensagem}</p>}
          <Campo id="cad-empresa" rotulo="Nome da empresa" erro={erros.company_name}>
            <Input id="cad-empresa" className={CAMPO} value={form.company_name} maxLength={120} onChange={(e) => mudar('company_name', e.target.value)} />
          </Campo>
          <Campo id="cad-responsavel" rotulo="Nome do responsável" erro={erros.contact_name}>
            <Input id="cad-responsavel" className={CAMPO} value={form.contact_name} maxLength={120} autoComplete="off" onChange={(e) => mudar('contact_name', e.target.value)} />
          </Campo>
          <Campo id="cad-telefone" rotulo="WhatsApp do responsável" erro={erros.phone}>
            <Input id="cad-telefone" className={CAMPO} type="tel" inputMode="tel" value={form.phone} placeholder="(11) 9____-____" onChange={(e) => mudar('phone', e.target.value)} />
          </Campo>
          <Campo id="cad-email" rotulo="E-mail (opcional)" erro={erros.email}>
            <Input id="cad-email" className={CAMPO} type="email" inputMode="email" value={form.email} onChange={(e) => mudar('email', e.target.value)} />
          </Campo>
          <details className="space-y-4 rounded-md border border-border p-3">
            <summary className="flex min-h-12 cursor-pointer items-center text-sm font-bold">Conferir endereço e CNPJ (opcional)</summary>
            <Campo id="cad-cnpj" rotulo="CNPJ" erro={erros.cnpj}>
              <Input id="cad-cnpj" className={CAMPO} inputMode="numeric" value={form.cnpj} onChange={(e) => mudar('cnpj', e.target.value)} />
            </Campo>
            <Campo id="cad-rua" rotulo="Endereço">
              <Input id="cad-rua" className={CAMPO} value={form.street} maxLength={200} onChange={(e) => mudar('street', e.target.value)} />
            </Campo>
            <div className="grid grid-cols-[1fr_5rem] gap-3">
              <Campo id="cad-cidade" rotulo="Cidade">
                <Input id="cad-cidade" className={CAMPO} value={form.city} maxLength={80} onChange={(e) => mudar('city', e.target.value)} />
              </Campo>
              <Campo id="cad-uf" rotulo="UF">
                <Input id="cad-uf" className={CAMPO} value={form.uf} maxLength={2} onChange={(e) => mudar('uf', e.target.value.toUpperCase())} />
              </Campo>
            </div>
          </details>
          {!online && (
            <p role="note" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              Sem sinal: o cadastro fica guardado e é criado quando o sinal voltar. <strong>O link só aparece quando o celular tiver sinal.</strong>
            </p>
          )}
          <Button type="submit" disabled={ocupado} className="h-14 w-full text-base">
            {ocupado ? 'Criando acesso…' : online ? 'Criar acesso' : 'Guardar cadastro'}
          </Button>
        </form>
      )}
    </main>
  );
}
