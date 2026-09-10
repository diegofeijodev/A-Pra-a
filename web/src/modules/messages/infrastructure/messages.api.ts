import { api } from '@/modules/shared/infrastructure/http';

/**
 * `/v1/settings` (§12 do contrato) — os ajustes de envio da operação. A Task 21
 * completa o módulo (modelos de mensagem, bloqueio); aqui só o que a fila do
 * dia da tela de Entrada precisa: `daily_quota`, o "leads por dia por pessoa".
 */

export interface TemplateDefaults {
  link_video_caso: string;
  link_cadastro: string;
  funcao: string;
  valor: string;
  dia_forte: string;
  turno: string;
}

export interface SettingsView {
  mode: string;
  window_start: number;
  window_end: number;
  sunday: boolean;
  daily_limit: number;
  gap_min: number;
  gap_max: number;
  daily_quota: number;
  template_defaults: TemplateDefaults;
}

export type UpdateSettingsInput = Partial<Omit<SettingsView, 'template_defaults'>> & {
  template_defaults?: Partial<TemplateDefaults>;
};

export async function fetchSettings(): Promise<SettingsView> {
  const { data } = await api.get('/v1/settings');
  return data as SettingsView;
}

export async function updateSettings(input: UpdateSettingsInput): Promise<SettingsView> {
  const { data } = await api.patch('/v1/settings', input);
  return data as SettingsView;
}
