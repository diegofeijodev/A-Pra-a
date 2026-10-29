/**
 * Cartão do quadro de contratantes do Freela (`GET /v1/admin/crm/pipeline`), já achatado.
 * Só o tipo: o domínio não importa de `modules/`, e o zod que o produz mora em
 * `modules/freela/freela-pipeline.ts`.
 */
export interface CartaoFreela {
  userId: string;
  name: string;
  city: string | null;
  state: string | null;
  whatsappPhone: string | null;
  /** Vagas pagas e não canceladas (conta do Freela). */
  hiringsCount: number;
  /** ISO 8601, como o Freela serializa a data do cadastro. */
  registeredAt: string;
}
