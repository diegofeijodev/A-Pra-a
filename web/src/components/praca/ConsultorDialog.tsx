'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePracas } from '@/modules/pracas/application/use-pracas';
import { useCreateConsultor, useUpdateConsultor } from '@/modules/consultores/application/use-consultores';
import type { ConsultorView, CreateConsultorInput, PixKeyType } from '@/modules/consultores/infrastructure/consultores.api';

const TIPOS_PIX: [PixKeyType, string][] = [['cpf', 'CPF'], ['email', 'E-mail'], ['telefone', 'Telefone'], ['aleatoria', 'Aleatória']];

/** Criar/editar consultor (admin). Na criação, mostra a senha provisória UMA vez. */
export function ConsultorDialog({ aberto, onFechar, consultor }: { aberto: boolean; onFechar: () => void; consultor?: ConsultorView }) {
  const { data: pracas = [] } = usePracas();
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
  const [senha, setSenha] = useState<string | null>(null);
  const campo = (k: keyof CreateConsultorInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function salvar() {
    const dados = { ...form, praca_id: form.praca_id || pracas[0]?.id || '' };
    if (consultor) {
      await editar.mutateAsync(dados);
      onFechar();
    } else {
      const r = await criar.mutateAsync(dados);
      setSenha(r.temp_password);
    }
  }

  const fechar = () => {
    setSenha(null);
    onFechar();
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{consultor ? 'Editar consultor' : 'Novo consultor'}</DialogTitle>
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
                <Input id={id} value={form[k]} onChange={campo(k)} required />
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor="c-praca">Praça</Label>
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
            <Button type="submit" disabled={criar.isPending || editar.isPending} className="w-full">
              {consultor ? 'Salvar' : 'Criar e gerar senha'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
