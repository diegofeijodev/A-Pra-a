'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/modules/auth/application/use-auth';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

/**
 * `?demo=1` preenche o formulário com uma conta de demonstração — atalho de
 * desenvolvimento, atrás de flag.
 *
 * A senha NÃO vive mais no código: `diego@praca.local` é conta **admin** do
 * seed, e uma constante aqui vai para o JS estático mesmo sem o parâmetro na
 * URL — qualquer host com o seed aplicado entregaria credencial de admin
 * pronta. Com a flag desligada (o padrão), as três variáveis não existem no
 * ambiente e o Next inlina `undefined`: não há o que vazar no pacote.
 *
 * Ligar em desenvolvimento: as três linhas de `web/.env.example`.
 */
const DEMO_LIGADO = process.env.NEXT_PUBLIC_DEMO_LOGIN === '1';
const DEMO = {
  email: process.env.NEXT_PUBLIC_DEMO_EMAIL ?? '',
  senha: process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? '',
};

const entrarSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  senha: z.string().min(6, 'A senha tem ao menos 6 caracteres.'),
});

type EntrarForm = z.infer<typeof entrarSchema>;

function Entrar() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading, signIn } = useAuth();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EntrarForm>({
    resolver: zodResolver(entrarSchema),
    defaultValues: { email: '', senha: '' },
  });

  // Quem já tem sessão não vê a tela de entrada.
  useEffect(() => {
    if (!loading && user) router.replace('/hoje');
  }, [loading, user, router]);

  // A demonstração é a conta semeada, não um estado falso no navegador — e só
  // existe com `NEXT_PUBLIC_DEMO_LOGIN=1` e as duas credenciais no ambiente.
  useEffect(() => {
    if (!DEMO_LIGADO || !DEMO.email || !DEMO.senha) return;
    if (params.get('demo') === '1') {
      setValue('email', DEMO.email);
      setValue('senha', DEMO.senha);
    }
  }, [params, setValue]);

  async function onSubmit(values: EntrarForm) {
    try {
      await signIn(values.email, values.senha);
      router.replace('/hoje');
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Não foi possível entrar.'));
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm">
        <p className="font-display text-3xl font-black tracking-tight">
          PRAÇA<span className="text-primary">.</span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Checklist de abertura de praças da Freela Serviços.
        </p>
        <form className="card-surface mt-6 space-y-4 p-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" autoComplete="email" placeholder="voce@praca.local" {...register('email')} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input id="senha" type="password" autoComplete="current-password" {...register('senha')} />
            {errors.senha && <p className="text-xs text-destructive">{errors.senha.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Entrar />
    </Suspense>
  );
}
