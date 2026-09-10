import { api } from '@/modules/shared/infrastructure/http';

/** `NotifItem` (§17). O `id` vem sempre prefixado com `<praca_id>:`. */
export interface NotifItem {
  id: string;
  text: string;
  tone: 'warn' | 'info';
}

export async function listNotifications(pracaId: string): Promise<NotifItem[]> {
  const { data } = await api.get('/v1/notifications', { params: { praca_id: pracaId } });
  return data as NotifItem[];
}

export async function dismissNotifications(ids: string[]): Promise<{ ok: boolean }> {
  const { data } = await api.post('/v1/notifications/dismiss', { ids });
  return data as { ok: boolean };
}
