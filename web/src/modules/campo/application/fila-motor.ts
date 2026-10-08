import axios from 'axios';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import type { ItemFila } from '../domain/campo.types';
import { classificar, proximaTentativa } from '../domain/fila-politica';

/** Tudo o que o motor toca, injetado — é o que deixa a fila testável sem IndexedDB nem rede. */
export interface DepsMotor {
  listar: () => Promise<ItemFila[]>;
  remover: (seq: number) => Promise<void>;
  /** Regrava o item SÓ se ele ainda existir (um rascunho novo pode tê-lo substituído no meio do envio). */
  atualizar: (item: ItemFila) => Promise<void>;
  enviar: (item: ItemFila) => Promise<void>;
  consultorAtual: () => string | null;
  online: () => boolean;
  agora: () => number;
  /** Aguardado antes do próximo passo: a tela precisa do `/today` novo antes de a fila esvaziar o item. */
  aoEnviar: (item: ItemFila) => void | Promise<void>;
  aoRecusar: (mensagem: string) => void;
  aoPausar: (pausada: boolean) => void;
}

export type ResultadoDrenagem = 'vazia' | 'esperando' | 'offline' | 'sessao' | 'sem_sessao' | 'bloqueada';

function lerFalha(e: unknown): { status?: number; code?: string } {
  if (!axios.isAxiosError(e)) return {};
  const corpo = e.response?.data as { error?: { code?: string } } | undefined;
  return { status: e.response?.status, code: corpo?.error?.code };
}

/**
 * Envia a fila do consultor logado EM ORDEM (spec §9). Para no primeiro item
 * que não saiu: a ordem importa (o checkout não pode passar na frente do check-in).
 */
export async function drenarCom(d: DepsMotor): Promise<ResultadoDrenagem> {
  const consultor = d.consultorAtual();
  if (!consultor) return 'sem_sessao';
  for (;;) {
    // Lido a cada volta: se a conta mudou durante um envio longo, o resto NÃO sai com o token do outro.
    if (d.consultorAtual() !== consultor) return 'sem_sessao';
    if (!d.online()) return 'offline';
    const fila = await d.listar();
    const cabeca = fila.find((i) => i.consultant_id === consultor);
    if (!cabeca) return 'vazia';
    // Checkout com questionário incompleto: a fila espera o consultor corrigir.
    if (cabeca.kind === 'checkout' && cabeca.bloqueio) return 'bloqueada';
    if (cabeca.proxima_em > d.agora()) return 'esperando';

    let falha: unknown = null;
    try {
      await d.enviar(cabeca);
    } catch (e) {
      falha = e;
    }
    const { status, code } = falha ? lerFalha(falha) : { status: 200, code: undefined };
    const desfecho = classificar(status, code);

    if (desfecho === 'regra' && cabeca.kind === 'checkout' && status === 422) {
      // Não repete e não apaga: fica marcado e a fila para aqui (a tela mostra o aviso).
      await d.atualizar({ ...cabeca, bloqueio: apiErrorMessage(falha, 'Falta responder o questionário.') });
      d.aoPausar(false);
      return 'bloqueada';
    }
    if (desfecho === 'ok' || desfecho === 'regra') {
      await d.remover(cabeca.seq as number);
      if (desfecho === 'regra') {
        const mensagem = apiErrorMessage(falha, 'Um envio foi recusado pelo servidor.');
        if (cabeca.kind === 'checkin') {
          // Sem a visita no servidor, respostas e checkout dela virariam 404: saem juntos.
          const ref = cabeca.payload.client_id;
          // Relê a fila: respostas/checkout guardados durante o envio demorado também saem.
          for (const dep of await d.listar()) {
            if (dep.consultant_id === consultor && (dep.kind === 'answers' || dep.kind === 'checkout') && dep.visit_ref === ref) {
              await d.remover(dep.seq as number);
            }
          }
          d.aoRecusar(`Visita em ${cabeca.payload.place_name} não foi registrada: ${mensagem}`);
        } else if (cabeca.kind !== 'points') {
          // Ponto de trilha depois do fechamento da meia-noite é esperado: some em silêncio.
          d.aoRecusar(mensagem);
        }
      }
      d.aoPausar(false);
      await d.aoEnviar(cabeca);
      continue;
    }
    if (desfecho === 'sessao') {
      // Nada é apagado nem conta tentativa: o axios do campo já mandou para
      // /campo/entrar, e depois do login a fila sai com o token novo.
      d.aoPausar(true);
      return 'sessao';
    }
    await d.atualizar({
      ...cabeca,
      tentativas: cabeca.tentativas + 1,
      proxima_em: proximaTentativa(cabeca.tentativas, d.agora()),
    });
    return 'esperando';
  }
}
