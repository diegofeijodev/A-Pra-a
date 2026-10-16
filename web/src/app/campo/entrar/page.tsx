'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

const entrarSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  senha: z.string().min(6, 'A senha tem ao menos 6 caracteres.'),
});

type EntrarForm = z.infer<typeof entrarSchema>;

export default function EntrarCampoPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useCampoSession((s) => s.session);
  const hydrated = useCampoSession((s) => s.hydrated);
  const hydrate = useCampoSession((s) => s.hydrate);
  const signIn = useCampoSession((s) => s.signIn);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EntrarForm>({ resolver: zodResolver(entrarSchema), defaultValues: { email: '', senha: '' } });

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  // Quem já tem sessão não vê a entrada.
  useEffect(() => {
    if (hydrated && session) router.replace(session.consultant.must_change_password ? '/campo/senha' : '/campo');
  }, [hydrated, session, router]);

  async function onSubmit(values: EntrarForm) {
    try {
      const s = await signIn(values.email, values.senha);
      // Cache de outra conta nunca vaza para esta (mesma regra do `signOut`).
      queryClient.clear();
      router.replace(s.consultant.must_change_password ? '/campo/senha' : '/campo');
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Não foi possível entrar.'));
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <p className="font-display text-3xl font-black tracking-tight">
        PRAÇA<span className="text-primary">.</span> <span className="text-lg text-muted-foreground">Campo</span>
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Entrada do representante comercial. O acesso é criado pela equipe do Praça.
      </p>
      <form className="card-surface mt-6 space-y-4 p-5" onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" inputMode="email" autoComplete="email" className="h-12" {...register('email')} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="senha">Senha</Label>
          <Input id="senha" type="password" autoComplete="current-password" className="h-12" {...register('senha')} />
          {errors.senha && <p className="text-xs text-destructive">{errors.senha.message}</p>}
        </div>
        <Button type="submit" className="h-12 w-full text-base" disabled={isSubmitting}>
          {isSubmitting ? 'Entrando...' : 'Entrar'}
        </Button>
      </form>
    </main>
  );
}
