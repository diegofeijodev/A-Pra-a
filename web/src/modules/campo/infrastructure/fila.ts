import type { ItemFila } from '../domain/campo.types';
import {
  campoCheckin,
  campoCheckout,
  campoEncerrarJornada,
  campoEnviarPontos,
  campoAdiarParada,
  campoDesfazerParada,
  campoIniciarJornada,
  campoPularParada,
  campoRefazerRota,
  campoSalvarRespostas,
} from './campo.api';

/** Um item da fila vira uma chamada — o servidor é idempotente por `client_id` (reenvio não duplica). */
export async function enviarItem(item: ItemFila): Promise<void> {
  switch (item.kind) {
    case 'start':
      await campoIniciarJornada(item.payload);
      return;
    case 'points':
      await campoEnviarPontos(item.payload.points);
      return;
    case 'checkin':
      await campoCheckin(item.payload, item.foto);
      return;
    case 'answers':
      await campoSalvarRespostas(item.visit_ref, item.payload);
      return;
    case 'checkout':
      await campoCheckout(item.visit_ref, item.payload);
      return;
    case 'end':
      await campoEncerrarJornada(item.payload);
      return;
    case 'stop_skip':
      await campoPularParada(item.stop_id, item.payload);
      return;
    case 'stop_defer':
      await campoAdiarParada(item.stop_id, item.payload);
      return;
    case 'stop_undo':
      await campoDesfazerParada(item.stop_id, item.payload);
      return;
    case 'route_reoptimize':
      await campoRefazerRota(item.payload);
      return;
  }
}
