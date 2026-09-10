'use client';

/**
 * Atalho "Campanha de WhatsApp no Freela" — ESQUELETO.
 *
 * A caixa de verdade (que monta a campanha no api-freela a partir do briefing)
 * é da Task 24; este arquivo existe só para o botão do cartão de campanha ter
 * o que importar sem criar dependência circular entre as tarefas. A Task 24
 * substitui o arquivo MANTENDO as mesmas props e o tipo `FreelaCampaignInitial`.
 */

export interface FreelaCampaignInitial {
  name: string;
  praca_id: string;
  /** Público do Freela: `PROVIDERS_NEVER_APPLIED` ou `CONTRACTORS_NEVER_PUBLISHED`. */
  audience: string;
  whatsapp_template: string;
}

export interface FreelaCampaignDialogProps {
  open: boolean;
  onClose: () => void;
  initial?: FreelaCampaignInitial;
}

export const FreelaCampaignDialog: (props: FreelaCampaignDialogProps) => null = () => null;
