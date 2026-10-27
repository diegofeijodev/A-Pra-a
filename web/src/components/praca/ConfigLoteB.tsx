'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfigLoteB, useSalvarConfigLoteB } from '@/modules/painel/application/use-painel';
import {
  corpoChecklist,
  corpoIntervalo,
  errosChecklist,
  errosIntervalo,
  formIntervalo,
  type FormIntervalo,
  FORM_CHECKLIST_LOVABLE,
  formChecklist,
  MAX_ETAPAS,
  moverEtapa,
  toquesObrigatorios,
  type FormChecklist,
} from '@/modules/painel/domain/config-lote-b';

const caixa = 'h-5 w-5';

/**
 * Roteiro da conversa (checklist da visita, contrato §35.2; UX §3.9). Só aparece com `features.checklist`; escrita só de admin.
 * O padrão é o da Lovable (7 etapas, não obrigatório, nos dois fluxos); "nossa versão" = desmarcar os dois fluxos.
 */
export function ConfigLoteB({ admin }: { admin: boolean }) {
  return (
    <>
      <ConfigChecklist admin={admin} />
      <ConfigIntervalo admin={admin} />
    </>
  );
}

function ConfigChecklist({ admin }: { admin: boolean }) {
  const { data } = useConfigLoteB();
  const salvar = useSalvarConfigLoteB();
  const [ck, setCk] = useState<FormChecklist | null>(null);
  useEffect(() => {
    if (data) setCk(formChecklist(data));
  }, [data]);
  if (!data || !ck || !data.features?.checklist) return null;
  const set = (p: Partial<FormChecklist>) => setCk({ ...ck, ...p });
  const erros = errosChecklist(ck);

  return (
    <details className="card-surface p-4">
      <summary className="cursor-pointer text-sm font-bold">Roteiro da visita (checklist)</summary>
      <div className="mt-3 space-y-4">
        <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <label className="flex min-h-12 items-center gap-2">
            <input type="checkbox" className={caixa} disabled={!admin} checked={ck.simples} onChange={(e) => set({ simples: e.target.checked })} />
            Mostrar no fluxo simples
          </label>
          <label className="flex min-h-12 items-center gap-2">
            <input type="checkbox" className={caixa} disabled={!admin} checked={ck.completo} onChange={(e) => set({ completo: e.target.checked })} />
            Mostrar no fluxo completo
          </label>
          <label className="flex min-h-12 items-center gap-2">
            <input type="checkbox" className={caixa} disabled={!admin} checked={ck.aberto} onChange={(e) => set({ aberto: e.target.checked })} />
            Começa aberto
          </label>
          <label className="flex min-h-12 items-center gap-2">
            <input
              type="checkbox"
              className={caixa}
              disabled={!admin}
              checked={ck.obrigatorio === 'todas'}
              onChange={(e) => set({ obrigatorio: e.target.checked ? 'todas' : 'nao' })}
            />
            Obrigatório para concluir
          </label>
        </div>
        {ck.obrigatorio === 'todas' && (
          <p role="status" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            ⚠ {toquesObrigatorios(ck.itens.length, data.meta_diaria)} (etapas × meta diária de visitas da configuração do roteiro). A Lovable não exige.
          </p>
        )}
        {!ck.simples && !ck.completo && <p className="text-sm text-muted-foreground">Sem fluxo marcado, a visita não mostra o roteiro (como era antes).</p>}

        <ol className="space-y-2">
          {ck.itens.map((it, i) => (
            <li key={it.id ?? `nova-${i}`} className="flex flex-wrap items-center gap-2">
              <span className="w-6 text-right text-sm font-bold">{i + 1}</span>
              <Input
                aria-label={`Texto da etapa ${i + 1}`}
                maxLength={120}
                disabled={!admin}
                value={it.text}
                onChange={(e) => set({ itens: ck.itens.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                className="h-12 min-w-0 flex-1"
              />
              {admin && (
                <div className="flex gap-1">
                  <Button type="button" variant="outline" className="h-12 w-12" aria-label={`Subir a etapa ${i + 1}`} disabled={i === 0} onClick={() => set({ itens: moverEtapa(ck.itens, i, -1) })}>
                    ↑
                  </Button>
                  <Button type="button" variant="outline" className="h-12 w-12" aria-label={`Descer a etapa ${i + 1}`} disabled={i === ck.itens.length - 1} onClick={() => set({ itens: moverEtapa(ck.itens, i, 1) })}>
                    ↓
                  </Button>
                  <Button type="button" variant="outline" className="h-12" disabled={ck.itens.length <= 1} onClick={() => set({ itens: ck.itens.filter((_, j) => j !== i) })}>
                    Remover
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>

        {erros.length > 0 && (
          <ul role="alert" className="list-disc space-y-0.5 pl-5 text-sm text-destructive">
            {erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {admin && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="h-12" disabled={ck.itens.length >= MAX_ETAPAS} onClick={() => set({ itens: [...ck.itens, { text: '' }] })}>
              + Adicionar etapa
            </Button>
            <Button type="button" variant="outline" className="h-12" onClick={() => setCk({ ...FORM_CHECKLIST_LOVABLE, itens: FORM_CHECKLIST_LOVABLE.itens.map((e) => ({ ...e })) })}>
              Voltar ao padrão da Lovable
            </Button>
            <Button type="button" className="h-12" disabled={salvar.isPending || erros.length > 0} onClick={() => salvar.mutate(corpoChecklist(ck))}>
              {salvar.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        )}
        <p className="text-sm text-muted-foreground">Vale para as visitas abertas depois de salvar (a lista é guardada na chegada de cada visita).</p>
      </div>
    </details>
  );
}

/** Intervalo da jornada (contrato §37.2; UX §3.6). Só com `features.breaks`. */
function ConfigIntervalo({ admin }: { admin: boolean }) {
  const { data } = useConfigLoteB();
  const salvar = useSalvarConfigLoteB();
  const [f, setF] = useState<FormIntervalo | null>(null);
  useEffect(() => {
    if (data) setF(formIntervalo(data));
  }, [data]);
  if (!data || !f || !data.features?.breaks) return null;
  const erros = errosIntervalo(f);
  const num = (v: string) => (v === '' ? Number.NaN : Number(v));
  return (
    <details className="card-surface p-4">
      <summary className="cursor-pointer text-sm font-bold">Intervalo e almoço do representante</summary>
      <div className="mt-3 space-y-4">
        <label className="flex min-h-12 items-center gap-2 text-sm">
          <input type="checkbox" className={caixa} disabled={!admin} checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} />
          Mostrar “Intervalo” no campo (como a Lovable). Desmarcado = só a janela de almoço configurada (nosso).
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="iv-lembrete" className="text-sm font-bold">
              Lembrar o consultor depois de (min)
            </label>
            <Input id="iv-lembrete" type="number" min={15} max={480} disabled={!admin} value={Number.isNaN(f.lembrete) ? '' : f.lembrete} onChange={(e) => setF({ ...f, lembrete: num(e.target.value) })} className="h-12" />
          </div>
          <div className="space-y-1">
            <label htmlFor="iv-alerta" className="text-sm font-bold">
              Avisar a equipe (“Atenção agora”) depois de (min)
            </label>
            <Input id="iv-alerta" type="number" min={15} max={480} disabled={!admin} value={Number.isNaN(f.alerta) ? '' : f.alerta} onChange={(e) => setF({ ...f, alerta: num(e.target.value) })} className="h-12" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          No dia com intervalo, o ritmo desconta o intervalo real no lugar do almoço configurado (nunca os dois), e a localização fica pausada. Padrões: lembrete 60 min (UX), alerta 75 min (Lovable).
        </p>
        {erros.length > 0 && (
          <ul role="alert" className="list-disc space-y-0.5 pl-5 text-sm text-destructive">
            {erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {admin && (
          <Button type="button" className="h-12" disabled={salvar.isPending || erros.length > 0} onClick={() => salvar.mutate(corpoIntervalo(f))}>
            {salvar.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        )}
      </div>
    </details>
  );
}
