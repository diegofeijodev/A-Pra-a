'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useQuery } from '@tanstack/react-query';
import { RegraSenha } from '@/components/praca/RegraSenha';
import { politicaSchema, senhaCumpre } from '@/modules/acesso/domain/senha';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { campoApi } from '@/modules/campo/infrastructure/campo-http';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

const senhaSchema = z
  .object({
    atual: z.string().min(6, 'Informe a senha que você recebeu.'),
    nova: z.string().min(8, 'A senha nova tem ao menos 8 caracteres.').max(72, 'No máximo 72 caracteres.'),
    confirma: z.string(),
  })
  .refine((v) => v.nova === v.confirma, { path: ['confirma'], message: 'As duas senhas não são iguais.' })
  .refine((v) => v.nova !== v.atual, { path: ['nova'], message: 'A senha nova precisa ser diferente da atual.' });

type SenhaForm = z.infer<typeof senhaSchema>;

/** Troca obrigatória no primeiro acesso (spec §2.4) — fica fora da guarda de `(sessao)`. */
export default function SenhaCampoPage() {
  const router = useRouter();
  const session = useCampoSession((s) => s.session);
  const hydrated = useCampoSession((s) => s.hydrated);
  const hydrate = useCampoSession((s) => s.hydrate);
  const trocarSenha = useCampoSession((s) => s.trocarSenha);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SenhaForm>({ resolver: zodResolver(senhaSchema), defaultValues: { atual: '', nova: '', confirma: '' } });
  // Lote E §41.2: a regra da senha NOVA, marcada enquanto digita. `GET /v1/password-policy` é público e responde 200 sempre
  // (desligada = `{ enabled: false }` e a tela é a de hoje).
  const politica = useQuery({
    queryKey: ['senha', 'politica', 'campo'],
    queryFn: async () => politicaSchema.parse((await campoApi.get('/v1/password-policy')).data),
    staleTime: 5 * 60_000,
    enabled: !!session,
    retry: 1,
  });
  const [mostrar, setMostrar] = useState(false);
  const nova = watch('nova');

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  useEffect(() => {
    if (hydrated && !session) router.replace('/campo/entrar');
  }, [hydrated, session, router]);

  async function onSubmit(values: SenhaForm) {
    if (!senhaCumpre(values.nova, politica.data)) {
      setError('nova', { message: 'A senha nova ainda não cumpre a regra abaixo.' });
      return;
    }
    try {
      await trocarSenha(values.atual, values.nova);
      toast.success('Senha trocada.');
      router.replace('/campo');
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Não foi possível trocar a senha.'));
    }
  }

  if (!hydrated || !session) {
    return <div className="grid min-h-dvh place-items-center text-sm text-muted-foreground">Carregando…</div>;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <h1 className="font-display text-2xl font-black">Troque sua senha</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {session.consultant.must_change_password
          ? 'Primeiro acesso: troque a senha provisória que você recebeu da equipe.'
          : 'Escolha uma senha nova.'}
      </p>
      <form className="card-surface mt-6 space-y-4 p-5" onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <Label htmlFor="atual">Senha atual (a provisória)</Label>
          <Input id="atual" type="password" autoComplete="current-password" className="h-12" {...register('atual')} />
          {errors.atual && <p className="text-xs text-destructive">{errors.atual.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="nova">Senha nova</Label>
          {politica.data?.enabled ? (
            <>
              <div className="flex gap-2">
                <Input id="nova" type={mostrar ? 'text' : 'password'} autoComplete="new-password" className="h-12" aria-describedby="regra-senha" {...register('nova')} />
                <Button type="button" variant="outline" className="h-12" onClick={() => setMostrar((m) => !m)} aria-pressed={mostrar}>
                  {mostrar ? 'Esconder' : 'Mostrar'}
                </Button>
              </div>
              <RegraSenha id="regra-senha" senha={nova ?? ''} politica={politica.data} />
            </>
          ) : (
            <Input id="nova" type="password" autoComplete="new-password" className="h-12" {...register('nova')} />
          )}
          {errors.nova && <p role="alert" className="text-xs text-destructive">{errors.nova.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirma">Repita a senha nova</Label>
          <Input id="confirma" type="password" autoComplete="new-password" className="h-12" {...register('confirma')} />
          {errors.confirma && <p className="text-xs text-destructive">{errors.confirma.message}</p>}
        </div>
        <Button type="submit" className="h-12 w-full text-base" disabled={isSubmitting}>
          {isSubmitting ? 'Salvando...' : 'Salvar senha'}
        </Button>
      </form>
    </main>
  );
}
