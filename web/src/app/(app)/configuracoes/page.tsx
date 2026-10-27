'use client';

import { CanaisCampo } from '@/components/praca/CanaisCampo';
import { RemuneracaoConfig } from '@/components/praca/RemuneracaoConfig';
import { SegmentosBusca } from '@/components/praca/SegmentosBusca';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { fmtBR } from '@/lib/dates';
import { dueDateOf, recLabel } from '@/lib/recurrence';
import { useFieldResync } from '@/lib/use-field-resync';
import { useActions } from '@/modules/actions/application/use-actions';
import { useFeaturesMenu, usePoliticaSenha, useSalvarPoliticaSenha } from '@/modules/acesso/application/use-acesso';
import { ROTA } from '@/modules/acesso/domain/enderecos';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useCatalog } from '@/modules/catalog/application/use-catalog';
import {
  useSettings,
  useUpdateSettings,
} from '@/modules/messages/application/use-settings';
import type { TemplateDefaults } from '@/modules/messages/infrastructure/messages.api';
import { useActivePraca, type PracaView } from '@/modules/pracas/application/use-pracas';
import {
  useCreateTemplateAction,
  useDeleteTemplateAction,
  useTemplateActions,
  useUpdateTemplateAction,
} from '@/modules/template-actions/application/use-template-actions';
import { useUsers } from '@/modules/users/application/use-users';

/**
 * Configurações no desenho da Lovable (`configuracoes.tsx`, UX §4.11, arquitetura §5 E5.9): "Segmentos da busca" no topo (o que a
 * Lovable mostra); abaixo, um cartão recolhido por bloco nosso — "Remuneração dos representantes" (só com a remuneração, §46),
 * "Canais de campo", "Segurança" (só com a regra de senha) e, com a chave do Comercial, os blocos dele. Saíram: Pessoas (→ Usuários),
 * Áreas de atuação e Dados da praça (→ detalhe da praça). A página continua aberta a toda a equipe (arquitetura §2.3, divergência
 * mantida): quem não é admin vê os blocos com os controles desligados.
 *
 * Todo campo grava no `blur` e só quando mudou de verdade; o `useFieldResync` remonta só o campo recusado (ver `lib/use-field-resync.ts`).
 */

const inputCls = "rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none";

/** Cartão recolhido da Lovable (`rounded-2xl bg-card p-5 shadow-card`) com o título no `summary`. */
function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <details className="rounded-2xl bg-card p-5 shadow-card">
      <summary className="cursor-pointer text-lg font-semibold">{titulo}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

export default function ConfiguracoesPage() {
  const { features, carregando } = useFeaturesMenu();
  if (carregando) return <div aria-busy="true" className="h-40 animate-pulse rounded-2xl bg-muted" />;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Configurações</h1>
      <SegmentosAdmin />
      {features.earnings && (
        <Secao titulo="Remuneração dos representantes">
          <RemuneracaoConfig embutido />
        </Secao>
      )}
      <Secao titulo="Canais de campo">
        <CanaisCampo embutido />
      </Secao>
      {features.password_policy && (
        <Secao titulo="Segurança">
          <SegurancaSenha />
        </Secao>
      )}
      {/* Casca da Lovable (contrato §46): as seções do Comercial (mensagens, roteiro-modelo e impressão do plano) só com a chave. */}
      {features.commercial && <BlocosComercial />}
    </div>
  );
}

/** Os blocos do Comercial dependem da praça ativa (o roteiro-modelo e a impressão leem as datas dela). */
function BlocosComercial() {
  const { praca, isPending } = useActivePraca();
  return (
    <>
      <Secao titulo="Variáveis padrão das mensagens">
        <VariaveisPadrao />
      </Secao>
      {isPending ? null : !praca ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma praça ainda — abra a primeira em <Link href={ROTA.pracas} className="text-primary hover:underline">Praças</Link>.
        </p>
      ) : (
        <>
          <Secao titulo="Roteiro-modelo (usado nas próximas praças)">
            <RoteiroModelo praca={praca} />
          </Secao>
          <Secao titulo="Impressão do plano">
            <p className="text-sm text-muted-foreground">O plano de {praca.name} (etapas, ações, donos e prazos) num PDF para imprimir.</p>
            <button onClick={() => window.print()} className="mt-2 min-h-11 rounded-md border border-border px-4 text-sm text-muted-foreground hover:text-foreground md:min-h-9">
              Exportar PDF do plano
            </button>
          </Secao>
          <Impressao praca={praca} />
          <div className="no-print text-[11px] text-muted-foreground">
            Lembretes por e-mail (resumo diário às 7h, resumo semanal na segunda) ficam preparados para ativação — hoje os avisos aparecem no sino de notificações.
          </div>
        </>
      )}
    </>
  );
}

// ── segurança (lote E §41.2) ──────────────────────────────────
/** Regra da senha NOVA (só admin muda; só com PASSWORD_POLICY_ENABLED). Vale para senhas novas; ninguém é obrigado a trocar. */
function SegurancaSenha() {
  const { user } = useAuth();
  const { features } = useFeaturesMenu();
  const politica = usePoliticaSenha(features.password_policy);
  const salvar = useSalvarPoliticaSenha();
  const p = politica.data?.enabled ? politica.data : null;
  const [min, setMin] = useState<number | null>(null);
  const [maiuscula, setMaiuscula] = useState<boolean | null>(null);
  const [numero, setNumero] = useState<boolean | null>(null);
  if (!features.password_policy || !p) return null;
  const admin = !!user?.is_admin;
  const vMin = min ?? p.min_length;
  const vMai = maiuscula ?? p.require_upper;
  const vNum = numero ?? p.require_digit;
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2">Senha nova precisa de
        <input type="number" min={8} max={12} value={vMin} disabled={!admin} onChange={(e) => setMin(Number(e.target.value))} className="h-10 w-16 rounded-md border border-input bg-background px-2" />
        caracteres
      </label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={vMai} disabled={!admin} onChange={(e) => setMaiuscula(e.target.checked)} className="h-5 w-5" /> 1 maiúscula</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={vNum} disabled={!admin} onChange={(e) => setNumero(e.target.checked)} className="h-5 w-5" /> 1 número</label>
      {admin && (
        <button
          disabled={salvar.isPending}
          onClick={() => salvar.mutate({ min_length: vMin, require_upper: vMai, require_digit: vNum }, { onSuccess: () => { setMin(null); setMaiuscula(null); setNumero(null); } })}
          className="h-10 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground"
        >Salvar</button>
      )}
      <p className="w-full text-xs text-muted-foreground">
        {p.is_default ? 'Padrão da Lovable: 8 caracteres, 1 maiúscula e 1 número. ' : ''}Vale para senhas novas (troca do representante, senha da equipe criada ou redefinida em Usuários); ninguém é obrigado a trocar a senha que já tem. De 8 a 12 caracteres: a senha provisória gerada sempre cumpre a regra mais forte (12, com maiúscula e número).
      </p>
    </div>
  );
}

// ── variáveis padrão das mensagens ────────────────────────────
const VARIAVEIS: { key: keyof TemplateDefaults; label: string }[] = [
  { key: "link_video_caso", label: "Vídeo do caso" },
  { key: "link_cadastro", label: "Link de cadastro" },
  { key: "funcao", label: "Função" },
  { key: "valor", label: "Valor" },
  { key: "dia_forte", label: "Dia forte" },
  { key: "turno", label: "Turno" },
];

function VariaveisPadrao() {
  const { data: settings } = useSettings();
  const atualizar = useUpdateSettings();
  // As 6 variáveis ficam lado a lado e cada uma grava sozinha: o contador é por
  // variável, senão um erro em "Valor" remontaria "Turno" no meio da digitação.
  const { keyFor, bump } = useFieldResync();

  return (
    <section>
      {!settings ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {VARIAVEIS.map((v) => {
            const atual = settings.template_defaults[v.key];
            return (
              <label key={v.key} className="text-xs text-muted-foreground">{v.label}
                <input
                  key={`${keyFor("template_defaults", v.key)}-${atual}`} defaultValue={atual}
                  onBlur={(e) => {
                    if (e.target.value === atual) return;
                    atualizar.mutate(
                      { template_defaults: { [v.key]: e.target.value } },
                      { onError: () => bump("template_defaults", v.key) },
                    );
                  }}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <span className="mt-0.5 block text-[10px] text-muted-foreground">{`{{${v.key}}}`}</span>
              </label>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        É o que entra no lugar da variável quando o modelo é renderizado. Campo em branco volta ao padrão do catálogo — variável vazia não faria o texto render.
      </p>
    </section>
  );
}

// ── roteiro-modelo ────────────────────────────────────────────
function RoteiroModelo({ praca }: { praca: PracaView }) {
  const { user } = useAuth();
  const { data: catalog } = useCatalog();
  const { data: users } = useUsers();
  const { data: template } = useTemplateActions();
  const criar = useCreateTemplateAction();
  const atualizar = useUpdateTemplateAction();
  const apagar = useDeleteTemplateAction();
  const [editStep, setEditStep] = useState<number | null>(null);
  const { keyFor, bump } = useFieldResync();
  const admin = !!user?.is_admin;
  const lista = template ?? [];
  // Conta desativada some da visão Pessoa dos indicadores e não trabalha mais:
  // atribuir uma ação-modelo a ela seria dar dono a quem não existe. A API não
  // barra (`assertPessoas` não olha `active`), então quem barra é a lista.
  const people = (users ?? []).filter((u) => u.active);
  // Por ação e por campo: várias etapas ficam abertas ao mesmo tempo e um título
  // recusado não pode remontar o "dia" (nem o título de outra ação) sendo digitado.
  const gravar = (id: string, input: Parameters<typeof atualizar.mutate>[0]["input"]) =>
    atualizar.mutate({ id, input }, {
      onError: () => Object.keys(input).forEach((campo) => bump(id, campo)),
    });

  return (
    <section>
      <div className="space-y-1">
        {(catalog?.steps ?? []).map((st) => {
          const items = lista.filter((a) => a.step === st.n);
          const open = editStep === st.n;
          return (
            <div key={st.n} className="card-surface">
              <button onClick={() => setEditStep(open ? null : st.n)} className="flex w-full items-center justify-between px-4 py-2.5 text-left">
                <span className="text-sm font-semibold">Etapa {st.n} — {st.name}</span>
                <span className="text-[11px] text-muted-foreground">{items.length} ações</span>
              </button>
              {open && (
                <div className="space-y-1.5 border-t border-border p-3">
                  {items.map((a) => {
                    const dono = a.owners[0];
                    // Dono que já foi desativado continua na lista, desligado: sem a
                    // opção o `<select>` "pularia" para a primeira pessoa e a tela
                    // mostraria um dono que não é o que está gravado.
                    const donoInativo = !!dono && !people.some((u) => u.id === dono);
                    return (
                    <div key={a.id} className="flex flex-wrap items-center gap-2">
                      <input
                        key={`${keyFor(a.id, "title")}-${a.title}`} defaultValue={a.title} disabled={!admin}
                        onBlur={(e) => { if (e.target.value.trim() && e.target.value !== a.title) gravar(a.id, { title: e.target.value }); }}
                        className={`min-w-40 flex-1 ${inputCls}`}
                      />
                      <select
                        value={dono} disabled={!admin}
                        onChange={(e) => gravar(a.id, { owners: [e.target.value] })}
                        className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                      >
                        {donoInativo && (
                          <option value={dono} disabled>{users?.find((u) => u.id === dono)?.name ?? dono}</option>
                        )}
                        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      {a.rec.kind === "once" ? (
                        <label className="text-[11px] text-muted-foreground">dia
                          <input
                            key={`${keyFor(a.id, "rec")}-${a.rec.day}`} type="number" defaultValue={a.rec.day} disabled={!admin}
                            onBlur={(e) => {
                              const dia = Number(e.target.value);
                              if (Number.isInteger(dia) && a.rec.kind === "once" && dia !== a.rec.day) {
                                gravar(a.id, { rec: { kind: "once", day: dia } });
                              }
                            }}
                            className="ml-1 w-16 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                          /></label>
                      ) : (
                        <span className="tag text-muted-foreground">{recLabel({ step: a.step, rec: a.rec }, praca)}</span>
                      )}
                      {admin && <button onClick={() => apagar.mutate(a.id)} className="text-xs text-danger">✕</button>}
                    </div>
                    );
                  })}
                  {admin && (
                    <button
                      onClick={() => {
                        const dono = people[0]?.id;
                        if (!dono) return;
                        criar.mutate({ step: st.n, title: "Nova ação-modelo", owners: [dono], rec: { kind: "once", day: 1 } });
                      }}
                      className="tag rounded-sm border border-border px-2 py-1 text-muted-foreground hover:text-primary"
                    >+ ação-modelo</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── versão para impressão ─────────────────────────────────────
function Impressao({ praca }: { praca: PracaView }) {
  const { data: catalog } = useCatalog();
  const { data: users } = useUsers();
  const { data: actions } = useActions(praca.id);
  const lista = actions ?? [];

  return (
    <div className="print-only">
      <h1>PRAÇA — Plano de {praca.name}</h1>
      <p>{praca.city} · início {fmtBR(praca.start_date)} · fim previsto {fmtBR(praca.end_date)}</p>
      {(catalog?.steps ?? []).map((st) => (
        <div key={st.n}>
          <h2>Etapa {st.n} — {st.name} ({st.block})</h2>
          <p><em>{st.expected}</em></p>
          <table width="100%" cellPadding={4} style={{ borderCollapse: "collapse" }} border={1}>
            <thead><tr><th>Ação</th><th>Dono</th><th>Prazo</th></tr></thead>
            <tbody>
              {lista.filter((a) => a.step === st.n).map((a) => (
                <tr key={a.id}>
                  <td>{a.title}</td>
                  <td>{a.owners.map((id) => users?.find((u) => u.id === id)?.name).join(", ")}</td>
                  <td>{a.rec.kind === "once" ? fmtBR(dueDateOf(a, praca)) : recLabel(a, praca)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/** Segmentos da busca (lote C, contrato §36): só com a flag; escrita só de admin. */
function SegmentosAdmin() {
  const { user } = useAuth();
  return <SegmentosBusca admin={!!user?.is_admin} />;
}
