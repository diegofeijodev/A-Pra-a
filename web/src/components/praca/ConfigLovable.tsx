'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfigLovable, useSalvarConfigLovable } from '@/modules/painel/application/use-painel';
import { camposConfigLovable, corpoConfigLovable, errosConfigLovable, SEM_FEATURES, type ConfigLovableCampos } from '@/modules/painel/domain/painel';

const sel = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm';

/**
 * Chegada, resumo do dia e painel (contrato §23.1 e §33.2). O raio vale sempre (sem flag; padrão 200 m = o de hoje);
 * as chaves do resumo e do painel só aparecem com o módulo ligado no servidor. Escrita só de admin.
 */
export function ConfigLovable({ admin }: { admin: boolean }) {
  const { data, isPending, isError } = useConfigLovable();
  const salvar = useSalvarConfigLovable();
  const [form, setForm] = useState<ConfigLovableCampos | null>(null);
  useEffect(() => {
    if (data) setForm(camposConfigLovable(data));
  }, [data]);
  if (isPending) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (isError || !data || !form) return <p className="text-sm text-destructive">Não foi possível carregar esta configuração.</p>;
  const features = data.features ?? SEM_FEATURES;
  const set = (p: Partial<ConfigLovableCampos>) => setForm({ ...form, ...p });
  const erros = errosConfigLovable(form, features);
  const num = (v: string) => (v === '' ? Number.NaN : Number(v));

  return (
    <details className="card-surface p-4">
      <summary className="cursor-pointer text-sm font-bold">Chegada ao local{features.day_summary ? ', resultado do dia' : ''}{features.dashboard ? ' e painel' : ''}</summary>
      <div className="mt-3 space-y-4">
        <div className="max-w-xs space-y-1">
          <Label htmlFor="cl-raio">Raio da chegada (metros)</Label>
          <Input id="cl-raio" type="number" min={50} max={1000} disabled={!admin} value={Number.isNaN(form.raio_checkin_m) ? '' : form.raio_checkin_m} onChange={(e) => set({ raio_checkin_m: num(e.target.value) })} />
          <p className="text-sm text-muted-foreground">
            Chegada a mais de {Number.isNaN(form.raio_checkin_m) ? '—' : form.raio_checkin_m} m do endereço fica marcada “longe do local”. Padrão 200 m (como hoje e como a Lovable). Vale para as
            visitas abertas depois de salvar.
          </p>
        </div>

        {features.day_summary && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-bold">Resultado do dia do consultor</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cl-ui">O que o consultor vê ao encerrar o dia</Label>
                <select id="cl-ui" disabled={!admin} className={sel} value={form.ui_resumo_dia} onChange={(e) => set({ ui_resumo_dia: e.target.value as ConfigLovableCampos['ui_resumo_dia'] })}>
                  <option value="nota">A nota de 0 a 10, com a conta (como a Lovable)</option>
                  <option value="numeros">Só os números, sem nota (nosso)</option>
                  <option value="desligado">Nada</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cl-meta">Positivação que já vale a parte cheia (%)</Label>
                <Input id="cl-meta" type="number" min={1} max={100} disabled={!admin} value={Number.isNaN(form.nota_meta_conversao_pct) ? '' : form.nota_meta_conversao_pct} onChange={(e) => set({ nota_meta_conversao_pct: num(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cl-pr">Peso da rota na nota</Label>
                <Input id="cl-pr" type="number" min={0} max={10} disabled={!admin} value={Number.isNaN(form.nota_peso_rota) ? '' : form.nota_peso_rota} onChange={(e) => set({ nota_peso_rota: num(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cl-pc">Peso dos cadastros na nota</Label>
                <Input id="cl-pc" type="number" min={0} max={10} disabled={!admin} value={Number.isNaN(form.nota_peso_conversao) ? '' : form.nota_peso_conversao} onChange={(e) => set({ nota_peso_conversao: num(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cl-int">Avisar intervalo longo acima de (min)</Label>
                <Input id="cl-int" type="number" min={15} max={480} disabled={!admin} value={Number.isNaN(form.nota_intervalo_alerta_min) ? '' : form.nota_intervalo_alerta_min} onChange={(e) => set({ nota_intervalo_alerta_min: num(e.target.value) })} />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Nota = rota × {form.nota_peso_rota} + cadastros × {form.nota_peso_conversao} (os pesos somam 10). Rota = visitadas ÷ previstas (teto 100%); cadastros = mín(1; positivação ÷{' '}
              {form.nota_meta_conversao_pct}%). Lovable: 7, 3 e 30%.
            </p>
          </fieldset>
        )}

        {features.dashboard && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-bold">Painel do gestor</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cl-tempo">Número grande do cartão de tempo</Label>
                <select id="cl-tempo" disabled={!admin} className={sel} value={form.painel_tempo_medio} onChange={(e) => set({ painel_tempo_medio: e.target.value as ConfigLovableCampos['painel_tempo_medio'] })}>
                  <option value="intervalo">Tempo entre chegadas seguidas (como a Lovable)</option>
                  <option value="duracao">Tempo dentro do local (chegada → conclusão)</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cl-gap">Intervalo acima disso fica fora da média (min)</Label>
                <Input id="cl-gap" type="number" min={10} max={480} disabled={!admin} value={Number.isNaN(form.painel_gap_max_min) ? '' : form.painel_gap_max_min} onChange={(e) => set({ painel_gap_max_min: num(e.target.value) })} />
              </div>
            </div>
          </fieldset>
        )}

        {erros.length > 0 && (
          <ul role="alert" className="list-disc space-y-0.5 pl-5 text-sm text-destructive">
            {erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {admin && (
          <Button disabled={salvar.isPending || erros.length > 0} onClick={() => salvar.mutate(corpoConfigLovable(form, features))} className="h-10">
            {salvar.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        )}
      </div>
    </details>
  );
}
