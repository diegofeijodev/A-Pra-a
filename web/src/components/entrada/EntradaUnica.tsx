'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, MapPin } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/modules/auth/application/auth.store';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { useEntrada } from '@/modules/entrada/application/use-entrada';
import { destinoDaSessao } from '@/modules/entrada/domain/entrada';

/**
 * `?demo=1` preenche o formulário com uma conta de demonstração — atalho de desenvolvimento, atrás de flag.
 *
 * A senha NÃO vive no código: `diego@praca.local` é conta **admin** do seed, e uma constante aqui iria para o JS estático mesmo sem o
 * parâmetro na URL. Com a flag desligada (o padrão), as três variáveis não existem no ambiente e o Next inlina `undefined`.
 * Ligar em desenvolvimento: as três linhas de `web/.env.example`.
 */
const DEMO_LIGADO = process.env.NEXT_PUBLIC_DEMO_LOGIN === '1';
const DEMO = {
  email: process.env.NEXT_PUBLIC_DEMO_EMAIL ?? '',
  senha: process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? '',
};

const entrarSchema = z.object({
  email: z.string().trim().email('Informe um e-mail válido.'),
  senha: z.string().min(6, 'A senha tem ao menos 6 caracteres.').max(72, 'No máximo 72 caracteres.'),
});
type EntrarForm = z.infer<typeof entrarSchema>;

/**
 * Entrada única no layout da Lovable (`garden-v2/src/routes/index.tsx`; UX §3.1, arquitetura §3.2): metade `bg-brand` + formulário.
 * O campo é **E-mail** (o login por usuário `@praca.local` da Lovable fica fora, por segurança). Montada em `/entrar` e em
 * `/campo/entrar` (o atalho instalado do consultor não sai do `scope: '/campo'`). Envia para a equipe e, só num 401, para o consultor.
 */
export function EntradaUnica() {
  const router = useRouter();
  const params = useSearchParams();
  const entrar = useEntrada();

  const user = useAuthStore((s) => s.user);
  const authPronto = useAuthStore((s) => s.hydrated);
  const hidratarAuth = useAuthStore((s) => s.hydrate);
  const sessaoCampo = useCampoSession((s) => s.session);
  const campoPronto = useCampoSession((s) => s.hydrated);
  const hidratarCampo = useCampoSession((s) => s.hydrate);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EntrarForm>({ resolver: zodResolver(entrarSchema), defaultValues: { email: '', senha: '' } });

  useEffect(() => {
    if (!authPronto) hidratarAuth();
    if (!campoPronto) hidratarCampo();
  }, [authPronto, campoPronto, hidratarAuth, hidratarCampo]);

  // Quem já tem sessão não vê a entrada (a equipe vence). Durante o envio quem navega é o `onSubmit`: o login grava a sessão no
  // meio do caminho e o efeito sairia antes de a outra sessão ser limpa.
  const indo = useRef(false);
  const enviando = useRef(false);
  useEffect(() => {
    if (!authPronto || !campoPronto || indo.current || enviando.current) return;
    const destino = destinoDaSessao({
      equipe: !!user,
      campo: sessaoCampo ? { must_change_password: sessaoCampo.consultant.must_change_password } : null,
    });
    if (destino) {
      indo.current = true;
      router.replace(destino);
    }
  }, [authPronto, campoPronto, user, sessaoCampo, router]);

  // A demonstração é a conta semeada, não um estado falso no navegador.
  useEffect(() => {
    if (!DEMO_LIGADO || !DEMO.email || !DEMO.senha) return;
    if (params.get('demo') === '1') {
      setValue('email', DEMO.email);
      setValue('senha', DEMO.senha);
    }
  }, [params, setValue]);

  async function onSubmit(values: EntrarForm) {
    enviando.current = true;
    try {
      const r = await entrar(values.email, values.senha);
      if ('erro' in r) {
        // O que foi digitado fica no formulário.
        toast.error(r.erro);
        return;
      }
      indo.current = true;
      router.replace(r.destino);
    } finally {
      enviando.current = false;
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-brand p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <MapPin className="h-6 w-6" aria-hidden /> Praça
        </div>
        <div className="space-y-4">
          <h1 className="text-5xl font-semibold leading-tight">Abra praças com método.</h1>
          <p className="max-w-md text-lg opacity-80">Representantes, clientes, rotas e visitas em campo — tudo num só lugar.</p>
        </div>
        <p className="text-sm opacity-60">© {new Date().getFullYear()} Praça</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-6" noValidate>
          <div className="flex items-center gap-2 text-primary lg:hidden">
            <MapPin className="h-6 w-6" aria-hidden /> <span className="text-lg font-semibold">Praça</span>
          </div>
          <div>
            <h2 className="text-2xl font-semibold">Entrar</h2>
            {/* Lovable: "Use o usuário e a senha fornecidos." — aqui o login é por e-mail. */}
            <p className="text-sm text-muted-foreground">Use o e-mail e a senha fornecidos.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              className="h-12"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-erro' : undefined}
              {...register('email')}
            />
            {errors.email && (
              <p id="email-erro" className="text-xs text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              type="password"
              autoComplete="current-password"
              className="h-12"
              aria-invalid={!!errors.senha}
              aria-describedby={errors.senha ? 'senha-erro' : undefined}
              {...register('senha')}
            />
            {errors.senha && (
              <p id="senha-erro" className="text-xs text-destructive">
                {errors.senha.message}
              </p>
            )}
          </div>
          <Button type="submit" className="h-12 w-full text-base" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Entrar
          </Button>
        </form>
      </div>
    </div>
  );
}
