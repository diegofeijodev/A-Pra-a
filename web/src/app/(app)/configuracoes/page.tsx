'use client';

import Link from 'next/link';
import { useState } from 'react';
import { fmtBR } from '@/lib/dates';
import { dueDateOf, recLabel } from '@/lib/recurrence';
import { useActions } from '@/modules/actions/application/use-actions';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useCatalog } from '@/modules/catalog/application/use-catalog';
import {
  useSettings,
  useUpdateSettings,
} from '@/modules/messages/application/use-settings';
import type { TemplateDefaults } from '@/modules/messages/infrastructure/messages.api';
import {
  useActivePraca,
  useRecalcDates,
  useUpdatePraca,
  type PracaView,
} from '@/modules/pracas/application/use-pracas';
import type { UpdatePracaInput } from '@/modules/pracas/infrastructure/pracas.api';
import {
  useCreateTemplateAction,
  useDeleteTemplateAction,
  useTemplateActions,
  useUpdateTemplateAction,
} from '@/modules/template-actions/application/use-template-actions';
import {
  useCreateUser,
  useDeactivateUser,
  useSetPassword,
  useUpdateUser,
  useUsers,
} from '@/modules/users/application/use-users';

/**
 * Configurações — porte de `.prototype/src/routes/configuracoes.tsx`.
 *
 * Três desvios, todos por causa do contrato:
 * 1. **Pessoa é conta**, não um objeto solto no `localStorage`: "remover" virou
 *    "desativar" (soft delete, §3 — a API recusa autodesligamento e a última
 *    conta admin), "+ Adicionar" pede e-mail e senha, e o e-mail existente é
 *    só leitura (nenhum `PATCH` do contrato aceita trocar e-mail).
 * 2. Escrita de pessoa e de roteiro-modelo é **só de admin** (§3 e §8): quem
 *    não é admin vê a mesma tela com os controles desligados.
 * 3. Bloco NOVO **"Variáveis padrão das mensagens"** (`template_defaults`,
 *    §12) — não existia no protótipo porque lá as variáveis eram fixas.
 *
 * Todo campo grava no `blur` e só quando mudou de verdade (o mesmo tratamento
 * do `ConfigEnvio` em `Disparos.tsx`): com `onChange` cada tecla viraria um
 * `PATCH`. O `key` amarrado ao valor do servidor remonta o campo quando a
 * gravação passa, para o que está na tela nunca mentir sobre o que está gravado.
 */

const inputCls = "rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none";

export default function ConfiguracoesPage() {
  const { praca, isPending: pracasPending } = useActivePraca();

  if (pracasPending) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!praca) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma praça ainda — abra a primeira em <Link href="/praca" className="text-primary hover:underline">Praça</Link>.
      </p>
    );
  }

  return (
    <>
      <h1 className="font-display text-xl font-extrabold">Configurações</h1>
      <Pessoas />
      <DadosDaPraca praca={praca} />
      <VariaveisPadrao />
      <RoteiroModelo praca={praca} />
      <Impressao praca={praca} />
      <div className="no-print mt-8 text-[11px] text-muted-foreground">
        Lembretes por e-mail (resumo diário às 7h, resumo semanal na segunda) ficam preparados para ativação — hoje os avisos aparecem no sino de notificações.
      </div>
    </>
  );
}

// ── pessoas ───────────────────────────────────────────────────
const NOVA_PESSOA = { name: "", role_label: "", color: "#ECA826", email: "", password: "" };

function Pessoas() {
  const { user } = useAuth();
  const { data: users } = useUsers();
  const criar = useCreateUser();
  const atualizar = useUpdateUser();
  const definirSenha = useSetPassword();
  const desativar = useDeactivateUser();
  const [nova, setNova] = useState(NOVA_PESSOA);
  const [senhas, setSenhas] = useState<Record<string, string>>({});
  const admin = !!user?.is_admin;
  const lista = users ?? [];

  return (
    <section className="mt-6">
      <h2 className="tag text-muted-foreground">Pessoas</h2>
      <div className="mt-2 space-y-2">
        {lista.map((p) => (
          <div key={p.id} className={`card-surface flex flex-wrap items-center gap-2 p-3 ${p.active ? "" : "opacity-60"}`}>
            <input
              key={`cor-${p.id}-${p.color}`} type="color" defaultValue={p.color} disabled={!admin}
              onBlur={(e) => { if (e.target.value !== p.color) atualizar.mutate({ id: p.id, input: { color: e.target.value } }); }}
              className="h-8 w-10 cursor-pointer rounded-md border border-border bg-transparent"
            />
            <input
              key={`nome-${p.id}-${p.name}`} defaultValue={p.name} disabled={!admin}
              onBlur={(e) => { if (e.target.value !== p.name) atualizar.mutate({ id: p.id, input: { name: e.target.value } }); }}
              className="w-32 rounded-md border border-input bg-background px-2 py-1.5 text-sm font-bold outline-none"
            />
            <input
              key={`funcao-${p.id}-${p.role_label}`} defaultValue={p.role_label} placeholder="Função" disabled={!admin}
              onBlur={(e) => { if (e.target.value !== p.role_label) atualizar.mutate({ id: p.id, input: { role_label: e.target.value } }); }}
              className={`min-w-40 flex-1 ${inputCls}`}
            />
            {/* Nenhum PATCH do contrato troca e-mail: o campo continua na linha, só leitura. */}
            <input value={p.email} readOnly className={`w-44 ${inputCls} text-muted-foreground`} />
            <input
              key={`tel-${p.id}-${p.phone}`} defaultValue={p.phone} placeholder="telefone" disabled={!admin}
              onBlur={(e) => { if (e.target.value !== p.phone) atualizar.mutate({ id: p.id, input: { phone: e.target.value } }); }}
              className={`w-32 ${inputCls}`}
            />
            {(admin || p.id === user?.id) && (
              <>
                <input
                  type="password" value={senhas[p.id] ?? ""} placeholder="nova senha"
                  onChange={(e) => setSenhas({ ...senhas, [p.id]: e.target.value })}
                  className={`w-28 ${inputCls}`}
                />
                <button
                  onClick={() => {
                    const senha = senhas[p.id];
                    if (!senha) return;
                    definirSenha.mutate({ id: p.id, password: senha }, {
                      onSuccess: () => setSenhas((s) => ({ ...s, [p.id]: "" })),
                    });
                  }}
                  className="rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >definir senha</button>
              </>
            )}
            {admin && lista.length > 1 && (
              p.active ? (
                <button onClick={() => desativar.mutate(p.id)} className="rounded-md border border-danger/50 px-2 py-1.5 text-xs text-danger">desativar</button>
              ) : (
                <button onClick={() => atualizar.mutate({ id: p.id, input: { active: true } })} className="rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground">reativar</button>
              )
            )}
          </div>
        ))}
        <div className="card-surface flex flex-wrap items-center gap-2 p-3">
          <input type="color" value={nova.color} disabled={!admin} onChange={(e) => setNova({ ...nova, color: e.target.value })} className="h-8 w-10 cursor-pointer rounded-md border border-border bg-transparent" />
          <input value={nova.name} disabled={!admin} onChange={(e) => setNova({ ...nova, name: e.target.value })} placeholder="Nome" className="w-32 rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none" />
          <input value={nova.role_label} disabled={!admin} onChange={(e) => setNova({ ...nova, role_label: e.target.value })} placeholder="Função" className={`min-w-40 flex-1 ${inputCls}`} />
          <input value={nova.email} disabled={!admin} onChange={(e) => setNova({ ...nova, email: e.target.value })} placeholder="e-mail" className={`w-44 ${inputCls}`} />
          <input type="password" value={nova.password} disabled={!admin} onChange={(e) => setNova({ ...nova, password: e.target.value })} placeholder="senha" className={`w-32 ${inputCls}`} />
          <button
            disabled={!admin}
            onClick={() => {
              if (!nova.name.trim() || !nova.email.trim() || !nova.password) return;
              criar.mutate(
                {
                  email: nova.email.trim(),
                  password: nova.password,
                  name: nova.name.trim(),
                  role_label: nova.role_label,
                  color: nova.color,
                },
                { onSuccess: () => setNova({ ...NOVA_PESSOA, color: "#3E8E5A" }) },
              );
            }}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
          >+ Adicionar</button>
        </div>
      </div>
    </section>
  );
}

// ── dados da praça ────────────────────────────────────────────
function DadosDaPraca({ praca }: { praca: PracaView }) {
  const atualizar = useUpdatePraca();
  const recalcular = useRecalcDates();
  // `blur` não é mudança: entrar e sair de um campo gravava um `PATCH` à toa.
  const gravar = (atual: string, novo: string, input: UpdatePracaInput) => {
    if (novo === atual) return;
    atualizar.mutate({ id: praca.id, input });
  };

  return (
    <section className="mt-8">
      <h2 className="tag text-muted-foreground">Dados da praça</h2>
      <div className="card-surface mt-2 grid gap-3 p-4 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">Nome
          <input key={`nome-${praca.name}`} defaultValue={praca.name} onBlur={(e) => gravar(praca.name, e.target.value, { name: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary" /></label>
        <label className="text-xs text-muted-foreground">Cidade
          <input key={`cidade-${praca.city}`} defaultValue={praca.city} onBlur={(e) => gravar(praca.city, e.target.value, { city: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary" /></label>
        <label className="text-xs text-muted-foreground">Data de início
          <input key={`inicio-${praca.start_date}`} type="date" defaultValue={praca.start_date} onBlur={(e) => gravar(praca.start_date, e.target.value, { start_date: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></label>
        <label className="text-xs text-muted-foreground">Previsão de fim
          <input key={`fim-${praca.end_date}`} type="date" defaultValue={praca.end_date} onBlur={(e) => gravar(praca.end_date, e.target.value, { end_date: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => recalcular.mutate(praca.id)} className="rounded-md border border-primary px-4 py-2 text-sm font-bold text-primary">
          Recalcular datas
        </button>
        <button onClick={() => window.print()} className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
          Exportar PDF do plano
        </button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Mudar a data de início recalcula todos os prazos automaticamente. “Recalcular datas” limpa adiamentos manuais.</p>
    </section>
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

  return (
    <section className="mt-8">
      <h2 className="tag text-muted-foreground">Variáveis padrão das mensagens</h2>
      {!settings ? (
        <p className="mt-2 text-xs text-muted-foreground">Carregando…</p>
      ) : (
        <div className="card-surface mt-2 grid gap-3 p-4 sm:grid-cols-3">
          {VARIAVEIS.map((v) => {
            const atual = settings.template_defaults[v.key];
            return (
              <label key={v.key} className="text-xs text-muted-foreground">{v.label}
                <input
                  key={`${v.key}-${atual}`} defaultValue={atual}
                  onBlur={(e) => { if (e.target.value !== atual) atualizar.mutate({ template_defaults: { [v.key]: e.target.value } }); }}
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
  const admin = !!user?.is_admin;
  const lista = template ?? [];

  return (
    <section className="mt-8">
      <h2 className="tag text-muted-foreground">Roteiro-modelo (usado nas próximas praças)</h2>
      <div className="mt-2 space-y-1">
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
                  {items.map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center gap-2">
                      <input
                        key={`titulo-${a.id}-${a.title}`} defaultValue={a.title} disabled={!admin}
                        onBlur={(e) => { if (e.target.value.trim() && e.target.value !== a.title) atualizar.mutate({ id: a.id, input: { title: e.target.value } }); }}
                        className={`min-w-40 flex-1 ${inputCls}`}
                      />
                      <select
                        value={a.owners[0]} disabled={!admin}
                        onChange={(e) => atualizar.mutate({ id: a.id, input: { owners: [e.target.value] } })}
                        className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                      >
                        {(users ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      {a.rec.kind === "once" ? (
                        <label className="text-[11px] text-muted-foreground">dia
                          <input
                            key={`dia-${a.id}-${a.rec.day}`} type="number" defaultValue={a.rec.day} disabled={!admin}
                            onBlur={(e) => {
                              const dia = Number(e.target.value);
                              if (Number.isInteger(dia) && a.rec.kind === "once" && dia !== a.rec.day) {
                                atualizar.mutate({ id: a.id, input: { rec: { kind: "once", day: dia } } });
                              }
                            }}
                            className="ml-1 w-16 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                          /></label>
                      ) : (
                        <span className="tag text-muted-foreground">{recLabel({ step: a.step, rec: a.rec }, praca)}</span>
                      )}
                      {admin && <button onClick={() => apagar.mutate(a.id)} className="text-xs text-danger">✕</button>}
                    </div>
                  ))}
                  {admin && (
                    <button
                      onClick={() => {
                        const dono = users?.[0]?.id;
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
