'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, KeyRound, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { RegraSenha } from '@/components/praca/RegraSenha';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { senhaCumpre, type Politica } from '@/modules/acesso/domain/senha';
import { ajudaDaSenha, esquemaTrocaSenha, MENSAGEM_SENHA, textosTrocaSenha, type TrocaSenhaForm } from '@/modules/entrada/domain/trocar-senha';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

/**
 * Cartão "Crie sua nova senha" da Lovable (`garden-v2/src/routes/_authenticated/trocar-senha.tsx`; UX §3.2, arquitetura §3.5), o
 * mesmo para a equipe (`/trocar-senha`) e o consultor (`/campo/senha`). A nossa troca pede a senha ATUAL **[desvio: segurança]**.
 * Ids `#atual`/`#nova`/`#confirma`, a lista `#regra-senha` e o botão "Salvar senha" são lidos pelo `browser-check`.
 *
 * `onSalvar` lança o erro da API (lido por `apiErrorMessage`, nunca achatado): o 400 `WRONG_PASSWORD` fica embaixo da senha atual, o
 * `WEAK_PASSWORD` embaixo da nova. Nenhum dos dois derruba a sessão (são 400, não 401).
 */
export function TrocarSenhaCartao({
  obrigatoria,
  politica,
  voltarPara,
  onSalvar,
  onPronto,
}: {
  obrigatoria: boolean;
  politica: Politica | undefined;
  /** Link "← Voltar" no topo — só fora da troca obrigatória. */
  voltarPara?: string;
  onSalvar: (atual: string, nova: string) => Promise<unknown>;
  onPronto: () => void;
}) {
  const esquema = useMemo(() => esquemaTrocaSenha(obrigatoria), [obrigatoria]);
  const textos = textosTrocaSenha(obrigatoria);
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TrocaSenhaForm>({ resolver: zodResolver(esquema), defaultValues: { atual: '', nova: '', confirma: '' } });
  const [mostrar, setMostrar] = useState(false);
  const nova = watch('nova');
  const ajuda = ajudaDaSenha(politica);

  async function onSubmit(v: TrocaSenhaForm) {
    // A mesma conta do servidor (§41.2), antes de gastar a ida.
    if (!senhaCumpre(v.nova, politica)) {
      setError('nova', { message: MENSAGEM_SENHA.regra });
      return;
    }
    try {
      await onSalvar(v.atual, v.nova);
      toast.success('Senha alterada.');
      onPronto();
    } catch (e) {
      const msg = apiErrorMessage(e, 'Não foi possível trocar a senha.');
      const code = (e as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
      if (code === 'WRONG_PASSWORD') setError('atual', { message: msg });
      else if (code === 'WEAK_PASSWORD' || code === 'SAME_PASSWORD') setError('nova', { message: msg });
      else toast.error(msg);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-secondary p-6">
      <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-5 rounded-2xl bg-card p-8 shadow-card" noValidate>
        {!obrigatoria && voltarPara && (
          <Link href={voltarPara} className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar
          </Link>
        )}
        <KeyRound className="h-8 w-8 text-primary" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold">Crie sua nova senha</h1>
          <p className="text-sm text-muted-foreground">{textos.subtitulo}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="atual">{textos.rotuloAtual}</Label>
          <Input
            id="atual"
            type="password"
            autoComplete="current-password"
            className="h-12"
            aria-invalid={!!errors.atual}
            aria-describedby={errors.atual ? 'atual-erro' : undefined}
            {...register('atual')}
          />
          {errors.atual && (
            <p id="atual-erro" role="alert" className="text-xs text-destructive">
              {errors.atual.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="nova">Nova senha</Label>
          <div className="flex gap-2">
            <Input
              id="nova"
              type={mostrar ? 'text' : 'password'}
              autoComplete="new-password"
              className="h-12"
              aria-invalid={!!errors.nova}
              aria-describedby={politica?.enabled ? 'regra-senha' : 'ajuda-senha'}
              {...register('nova')}
            />
            <Button type="button" variant="outline" className="h-12" onClick={() => setMostrar((m) => !m)} aria-pressed={mostrar}>
              {mostrar ? 'Esconder' : 'Mostrar'}
            </Button>
          </div>
          <RegraSenha id="regra-senha" senha={nova ?? ''} politica={politica} />
          {ajuda && (
            <p id="ajuda-senha" className="text-xs text-muted-foreground">
              {ajuda}
            </p>
          )}
          {errors.nova && (
            <p role="alert" className="text-xs text-destructive">
              {errors.nova.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirma">Confirmar senha</Label>
          <Input
            id="confirma"
            type="password"
            autoComplete="new-password"
            className="h-12"
            aria-invalid={!!errors.confirma}
            aria-describedby={errors.confirma ? 'confirma-erro' : undefined}
            {...register('confirma')}
          />
          {errors.confirma && (
            <p id="confirma-erro" role="alert" className="text-xs text-destructive">
              {errors.confirma.message}
            </p>
          )}
        </div>
        <Button type="submit" className="h-12 w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Salvar senha
        </Button>
      </form>
    </div>
  );
}
