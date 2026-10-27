'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addDays, todaySp } from '@/lib/dates';
import { RADIUS_KM } from '@/lib/geo';
import { useEstados, useMunicipios } from '@/modules/geo/application/use-geo';
import { useCreatePraca, type PracaView } from '@/modules/pracas/application/use-pracas';

const norm = (s: string) => s.trim().toLocaleLowerCase('pt-BR');

/**
 * "Nova praça" no desenho da Lovable (`pracas.index.tsx`, UX §4.2): Nome, Cidade + UF (`grid-cols-[1fr_80px]`), Data de início e
 * [Criar]. Nossos campos: a cidade é a do IBGE da UF escolhida (lista do `GET /v1/geo/municipios`; a API resolve cobertura, centro e
 * as cidades em volta — o navegador manda só `{ibge, km}`), e a **Previsão de fim** (a API exige) [desvio: dado]. Cidade fora da
 * lista (São Paulo e Rio ficam fora de propósito) abre a praça sem as cidades em volta: o campo trabalha pelas áreas de atuação.
 * "Abrir com o mapa da região" leva à `AberturaPraca` (raio e cidades em volta no mapa).
 */
export function NovaPracaDialog({
  aberto,
  onFechar,
  onCriada,
  onComMapa,
}: {
  aberto: boolean;
  onFechar: () => void;
  onCriada: (p: PracaView) => void;
  onComMapa: () => void;
}) {
  const criar = useCreatePraca();
  const { data: estados } = useEstados();
  const [f, setF] = useState(() => ({ nome: '', cidade: '', uf: '', inicio: todaySp(), fim: addDays(todaySp(), 98) }));
  const [erro, setErro] = useState<string | null>(null);
  const { data: municipios } = useMunicipios(f.uf || null);
  const achada = useMemo(() => (municipios ?? []).find((m) => norm(m.nome) === norm(f.cidade)) ?? null, [municipios, f.cidade]);

  const fechar = () => {
    setF({ nome: '', cidade: '', uf: '', inicio: todaySp(), fim: addDays(todaySp(), 98) });
    setErro(null);
    onFechar();
  };
  const salvar = () => {
    const nome = f.nome.trim();
    const cidade = achada?.nome ?? f.cidade.trim();
    if (!nome || !cidade || !f.uf) return setErro('Preencha nome, cidade e UF.');
    if (!f.inicio || !f.fim || f.fim < f.inicio) return setErro('A previsão de fim vem depois da data de início.');
    setErro(null);
    criar.mutate(
      {
        name: nome,
        city: `${cidade} · ${f.uf}`,
        start_date: f.inicio,
        end_date: f.fim,
        ...(achada ? { cobertura: { ibge: achada.ibge, km: RADIUS_KM } } : {}),
      },
      {
        onSuccess: (p) => {
          fechar();
          onCriada(p);
        },
      },
    );
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !criar.isPending && fechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova praça</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="np-nome">Nome</Label>
            <Input id="np-nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="ex.: Savassi" />
          </div>
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="np-cidade">Cidade</Label>
              <Input
                id="np-cidade"
                list="np-cidades"
                value={f.cidade}
                disabled={!f.uf}
                placeholder={f.uf ? 'Digite e escolha na lista' : 'Escolha a UF primeiro'}
                onChange={(e) => setF({ ...f, cidade: e.target.value })}
              />
              <datalist id="np-cidades">
                {(f.cidade.trim().length >= 3 ? (municipios ?? []).filter((m) => norm(m.nome).includes(norm(f.cidade))).slice(0, 50) : []).map((m) => (
                  <option key={m.ibge} value={m.nome} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-uf">UF</Label>
              <select
                id="np-uf"
                value={f.uf}
                onChange={(e) => setF({ ...f, uf: e.target.value, cidade: '' })}
                className="h-11 w-full rounded-md border border-input bg-background px-2 text-sm md:h-9"
              >
                <option value="">—</option>
                {(estados ?? []).map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {f.cidade.trim() && f.uf && municipios && (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {achada
                ? `Cidade do IBGE: a praça já abre com as cidades em volta (raio de ${RADIUS_KM} km).`
                : 'Cidade fora da lista do IBGE: a praça abre sem as cidades em volta; o trabalho de campo usa as áreas de atuação.'}
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="np-inicio">Data de início</Label>
              <Input id="np-inicio" type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value, fim: e.target.value ? addDays(e.target.value, 98) : f.fim })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-fim">Previsão de fim</Label>
              <Input id="np-fim" type="date" value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} />
            </div>
          </div>
          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
          <DialogFooter className="items-center gap-2 sm:justify-between">
            <button
              type="button"
              className="min-h-11 text-sm text-primary underline-offset-4 hover:underline md:min-h-0"
              onClick={() => {
                fechar();
                onComMapa();
              }}
            >
              Abrir com o mapa da região
            </button>
            <Button type="submit" disabled={criar.isPending}>
              Criar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
