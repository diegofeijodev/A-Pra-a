'use client';

import { useState } from 'react';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useCatalog } from '@/modules/catalog/application/use-catalog';
import { useCreateLead } from '@/modules/leads/application/use-leads';
import { useActivePraca, usePracas } from '@/modules/pracas/application/use-pracas';
import { useUsers } from '@/modules/users/application/use-users';

/**
 * Novo lead — porte de `.prototype/src/components/praca/NovoLeadDialog.tsx`.
 * Classificações e origens vêm do catálogo (`classes`, `import_origens`); o
 * dono padrão é quem está logado, não `s.people[0]`.
 */
export function NovoLeadDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { praca } = useActivePraca();
  const { data: pracas } = usePracas();
  const { data: users } = useUsers();
  const { data: catalog } = useCatalog();
  const createLead = useCreateLead();
  const people = (users ?? []).filter((u) => u.active);
  const [f, setF] = useState({
    name: "",
    city: praca?.city.split(" · ")[0] ?? "",
    phone: "",
    classe: "alvo",
    origem: "prospecção ativa",
    ownerId: user?.id ?? "",
    pracaId: praca?.id ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const ok = f.name.trim() && f.phone.trim();

  return (
    <div className="no-print fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-popover p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-base font-extrabold">Novo lead</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Só o essencial — o resto pode ser completado depois na ficha.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <Field label="Estabelecimento" wide>
            <input autoFocus value={f.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Cidade">
            <input value={f.city} onChange={(e) => set("city", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Telefone">
            <input value={f.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Classificação">
            <select value={f.classe} onChange={(e) => set("classe", e.target.value)} className={inputCls}>
              {(catalog?.classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Origem">
            <select value={f.origem} onChange={(e) => set("origem", e.target.value)} className={inputCls}>
              {(catalog?.import_origens ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Praça">
            <select value={f.pracaId} onChange={(e) => set("pracaId", e.target.value)} className={inputCls}>
              {(pracas ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="">sem praça</option>
            </select>
          </Field>
          <Field label="Dono">
            <select value={f.ownerId} onChange={(e) => set("ownerId", e.target.value)} className={inputCls}>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground">Cancelar</button>
          <button
            disabled={!ok || createLead.isPending}
            onClick={() => {
              if (!ok || !f.ownerId) return;
              createLead.mutate(
                {
                  // `praca_id` só vai quando tem valor: "sem praça" é a AUSÊNCIA
                  // do campo, e `""` não passa no `@IsUUID()` do servidor.
                  ...(f.pracaId ? { praca_id: f.pracaId } : {}),
                  name: f.name.trim(),
                  city: f.city.trim(),
                  address: "",
                  phone: f.phone.trim(),
                  decisor: "—",
                  decisor_role: "",
                  classe: f.classe,
                  origem: f.origem,
                  owner_id: f.ownerId,
                  stage: 1,
                },
                { onSuccess: () => onClose() },
              );
            }}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            Criar lead
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = "mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary";

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`text-xs text-muted-foreground ${wide ? "col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}
