import { z } from 'zod';
import type { Politica } from '@/modules/acesso/domain/senha';

/**
 * Troca de senha (arquitetura §3.5, UX §3.2): o mesmo cartão para a equipe (`/trocar-senha`, `POST /v1/auth/change-password`) e o
 * consultor (`/campo/senha`, `POST /v1/campo/auth/change-password`). As duas APIs pedem a senha atual (a Lovable não pede: é
 * segurança, não volta) e aceitam a nova com 8–72; a regra do §41.2, quando ligada, é conferida ao vivo por `senhaCumpre`.
 */
export const MENSAGEM_SENHA = {
  atual: 'Informe a sua senha atual.',
  provisoria: 'Informe a senha que você recebeu.',
  curta: 'A senha nova tem ao menos 8 caracteres.',
  longa: 'No máximo 72 caracteres.',
  diferentes: 'As senhas não coincidem.',
  igual: 'A senha nova precisa ser diferente da atual.',
  regra: 'A senha nova ainda não cumpre a regra abaixo.',
} as const;

export const esquemaTrocaSenha = (obrigatoria = false) =>
  z
    .object({
      atual: z
        .string()
        .min(6, obrigatoria ? MENSAGEM_SENHA.provisoria : MENSAGEM_SENHA.atual)
        .max(72, MENSAGEM_SENHA.longa),
      nova: z.string().min(8, MENSAGEM_SENHA.curta).max(72, MENSAGEM_SENHA.longa),
      confirma: z.string(),
    })
    .refine((v) => v.nova === v.confirma, { path: ['confirma'], message: MENSAGEM_SENHA.diferentes })
    .refine((v) => v.nova !== v.atual, { path: ['nova'], message: MENSAGEM_SENHA.igual });

export type TrocaSenhaForm = z.infer<ReturnType<typeof esquemaTrocaSenha>>;

/** Os textos do cartão: "Senha provisória" na troca obrigatória (consultor no 1º acesso), "Senha atual" fora dela. */
export const textosTrocaSenha = (obrigatoria: boolean) => ({
  rotuloAtual: obrigatoria ? 'Senha provisória' : 'Senha atual',
  subtitulo: obrigatoria ? 'Por segurança, troque a senha provisória antes de continuar.' : 'Defina uma nova senha.',
});

/**
 * Texto de ajuda abaixo da senha nova. Com a regra ligada, é a lista viva (`RegraSenha`), então nada aqui; desligada, a API só cobra
 * os 8 caracteres do DTO.
 */
export const ajudaDaSenha = (politica: Politica | undefined): string | null => (politica?.enabled ? null : 'Mínimo de 8 caracteres.');
