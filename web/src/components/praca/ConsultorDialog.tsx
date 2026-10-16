'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/modules/auth/application/use-auth';
import { usePracas } from '@/modules/pracas/application/use-pracas';
import { useCreateConsultor, useUpdateConsultor } from '@/modules/consultores/application/use-consultores';
import type { ConsultorView, CreateConsultorInput, PixKeyType } from '@/modules/consultores/infrastructure/consultores.api';

const AreaMapa = dynamic(() => import('./AreaMapa'), { ssr: false });

/** "Centro, Savassi; Lourdes" → lista sem vazios (vírgula ou ponto e vírgula). */
const lerBairros = (s: string): string[] => s.split(/[;,]/).map((b) => b.trim()).filter(Boolean);

const TIPOS_PIX: [PixKeyType, string][] = [['cpf', 'CPF'], ['email', 'E-mail'], ['telefone', 'Telefone'], ['aleatoria', 'Aleatória']];

/** Criar/editar representante (admin). Na criação, mostra a senha provisória UMA vez. */
export function ConsultorDialog({ aberto, onFechar, consultor }: { aberto: boolean; onFechar: () => void; consultor?: ConsultorView }) {
  const { data: pracas = [] } = usePracas();
  const { user } = useAuth();
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
  const [nascimento, setNascimento] = useState(consultor?.birth_date ?? '');
  const [bairros, setBairros] = useState((consultor?.area_bairros ?? []).join(', '));
  const [centro, setCentro] = useState<{ lat: number; lng: number } | null>(
    consultor?.area_lat != null && consultor.area_lng != null ? { lat: consultor.area_lat, lng: consultor.area_lng } : null,
  );
  const [raio, setRaio] = useState(consultor?.area_radius_km != null ? String(consultor.area_radius_km) : '');
  const [senha, setSenha] = useState<string | null>(null);
  const pracaAtual = pracas.find((p) => p.id === form.praca_id);
  const inicioMapa = pracaAtual?.cobertura ? { lat: pracaAtual.cobertura.lat, lng: pracaAtual.cobertura.lon } : null;
  const campo = (k: keyof CreateConsultorInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function salvar() {
    const km = raio.trim() ? Number(raio.replace(',', '.')) : null;
    const dados: CreateConsultorInput = {
      ...form,
      praca_id: form.praca_id || pracas[0]?.id || '',
      birth_date: nascimento || null,
      area_bairros: lerBairros(bairros),
      // Centro sem raio não serve para nada: sem os dois, o raio é limpo.
      ...(centro && km
        ? { area_lat: centro.lat, area_lng: centro.lng, area_radius_km: km }
        : { area_radius_km: null }),
    };
    try {
      if (consultor) {
        await editar.mutateAsync(dados);
        onFechar();
      } else {
        const r = await criar.mutateAsync(dados);
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

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !ocupado && !senha && fechar()}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto"
        onInteractOutside={(e) => (senha || ocupado) && e.preventDefault()}
        onEscapeKeyDown={(e) => (senha || ocupado) && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{consultor ? 'Editar representante' : 'Novo representante'}</DialogTitle>
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
                <Input id={id} value={String(form[k] ?? "")} onChange={campo(k)} required />
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor="c-nascimento">Data de nascimento</Label>
              <Input id="c-nascimento" type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c-praca">Cidade (praça)</Label>
              <select id="c-praca" value={form.praca_id} onChange={campo('praca_id')} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm">
                {pracas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-[8rem_1fr] gap-2">
              <div className="space-y-1">
                <Label htmlFor="c-pix-tipo">Tipo da chave Pix</Label>
                <select id="c-pix-tipo" value={form.pix_key_type} onChange={campo('pix_key_type')} className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm">
                  {TIPOS_PIX.map(([v, r]) => (
                    <option key={v} value={v}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="c-pix">Chave Pix</Label>
                <Input id="c-pix" value={form.pix_key} onChange={campo('pix_key')} required />
              </div>
            </div>
            <fieldset className="space-y-2 rounded-md border border-border p-3">
              <legend className="px-1 text-sm font-semibold">Área de atuação</legend>
              <p className="text-xs text-muted-foreground">
                Bairros e/ou um raio no mapa. Sem nenhum dos dois, a rota pega a praça inteira.
              </p>
              <div className="space-y-1">
                <Label htmlFor="c-bairros">Bairros (separe por vírgula)</Label>
                <Input id="c-bairros" value={bairros} onChange={(e) => setBairros(e.target.value)} placeholder="Centro, Savassi, Lourdes" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="c-raio">Raio em km</Label>
                <Input id="c-raio" inputMode="decimal" value={raio} onChange={(e) => setRaio(e.target.value)} placeholder="3" />
              </div>
              <AreaMapa
                lat={centro?.lat ?? null}
                lng={centro?.lng ?? null}
                raioKm={raio.trim() ? Number(raio.replace(',', '.')) || null : null}
                inicio={inicioMapa}
                dark={user?.theme !== 'light'}
                onCentro={(lat, lng) => setCentro({ lat, lng })}
              />
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{centro ? `Centro: ${centro.lat.toFixed(5)}, ${centro.lng.toFixed(5)}` : 'Toque no mapa para marcar o centro do raio.'}</span>
                {centro && (
                  <button type="button" className="underline" onClick={() => { setCentro(null); setRaio(''); }}>
                    Limpar raio
                  </button>
                )}
              </div>
            </fieldset>
            <Button type="submit" disabled={criar.isPending || editar.isPending} className="w-full">
              {consultor ? 'Salvar' : 'Criar e gerar senha'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
