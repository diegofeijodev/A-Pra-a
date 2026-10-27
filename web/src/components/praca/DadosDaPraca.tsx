'use client';

import { useFieldResync } from '@/lib/use-field-resync';
import { useRecalcDates, useUpdatePraca, type PracaView } from '@/modules/pracas/application/use-pracas';
import type { UpdatePracaInput } from '@/modules/pracas/infrastructure/pracas.api';

const campo = 'mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary';

/**
 * Nome, cidade, início e previsão de fim da praça + "Recalcular datas" (saiu de Configurações para o "Editar praça" do detalhe,
 * UX §4.3). Cada campo grava no `blur` e só quando mudou; no erro (o contrato recusa `end_date` antes de `start_date`, §6), só o
 * campo recusado volta a ler a praça (`useFieldResync`). A situação da praça sai destas datas (`status-praca.ts`).
 */
export function DadosDaPraca({ praca }: { praca: PracaView }) {
  const atualizar = useUpdatePraca();
  const recalcular = useRecalcDates();
  const { keyFor, bump } = useFieldResync();
  const gravar = (atual: string, novo: string, input: UpdatePracaInput) => {
    if (novo === atual) return;
    atualizar.mutate({ id: praca.id, input }, { onError: () => Object.keys(input).forEach((c) => bump(praca.id, c)) });
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Nome
          <input key={`${keyFor(praca.id, 'name')}-${praca.name}`} defaultValue={praca.name} onBlur={(e) => gravar(praca.name, e.target.value, { name: e.target.value })} className={campo} />
        </label>
        <label className="text-xs text-muted-foreground">
          Cidade
          <input key={`${keyFor(praca.id, 'city')}-${praca.city}`} defaultValue={praca.city} onBlur={(e) => gravar(praca.city, e.target.value, { city: e.target.value })} className={campo} />
        </label>
        <label className="text-xs text-muted-foreground">
          Data de início
          <input
            key={`${keyFor(praca.id, 'start_date')}-${praca.start_date}`}
            type="date"
            defaultValue={praca.start_date}
            onBlur={(e) => gravar(praca.start_date, e.target.value, { start_date: e.target.value })}
            className={campo}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Previsão de fim
          <input
            key={`${keyFor(praca.id, 'end_date')}-${praca.end_date}`}
            type="date"
            defaultValue={praca.end_date}
            onBlur={(e) => gravar(praca.end_date, e.target.value, { end_date: e.target.value })}
            className={campo}
          />
        </label>
      </div>
      <button onClick={() => recalcular.mutate(praca.id)} disabled={recalcular.isPending} className="min-h-11 rounded-md border border-primary px-4 text-sm font-bold text-primary md:min-h-9">
        Recalcular datas
      </button>
      <p className="text-[11px] text-muted-foreground">
        Cada campo grava ao sair dele. Mudar a data de início recalcula todos os prazos automaticamente. “Recalcular datas” limpa adiamentos manuais.
      </p>
    </div>
  );
}
