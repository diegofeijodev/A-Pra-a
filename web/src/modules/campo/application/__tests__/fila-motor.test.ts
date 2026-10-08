import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import type { ItemFila } from '../../domain/campo.types';
import { drenarCom, type DepsMotor } from '../fila-motor';

const POS = { at: '2026-10-08T15:00:00.000Z', lat: -19.9, lng: -43.9, accuracy: 10 };
const item = (seq: number, over: Partial<ItemFila> = {}): ItemFila =>
  ({ seq, kind: 'end', payload: POS, consultant_id: 'c1', tentativas: 0, proxima_em: 0, criado_em: 0, ...over }) as ItemFila;

const erroHttp = (status: number, code: string, message: string) =>
  new AxiosError(message, 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: { error: { code, message } },
  } as AxiosResponse);

function deps(fila: ItemFila[], enviar: (i: ItemFila) => Promise<void>, over: Partial<DepsMotor> = {}): DepsMotor {
  return {
    listar: vi.fn(async () => [...fila]),
    remover: vi.fn(async (seq: number) => {
      const i = fila.findIndex((x) => x.seq === seq);
      if (i >= 0) fila.splice(i, 1);
    }),
    atualizar: vi.fn(async (novo: ItemFila) => {
      const i = fila.findIndex((x) => x.seq === novo.seq);
      if (i >= 0) fila[i] = novo;
    }),
    enviar: vi.fn(enviar),
    consultorAtual: () => 'c1',
    online: () => true,
    agora: () => 1_000,
    aoEnviar: vi.fn(),
    aoRecusar: vi.fn(),
    aoPausar: vi.fn(),
    ...over,
  };
}

describe('drenarCom — a fila offline', () => {
  it('envia em ordem e esvazia', async () => {
    const fila = [item(1), item(2)];
    const d = deps(fila, async () => undefined);

    expect(await drenarCom(d)).toBe('vazia');
    expect(vi.mocked(d.enviar).mock.calls.map(([i]) => i.seq)).toEqual([1, 2]);
    expect(fila).toEqual([]);
  });

  it('sem resposta (rede): guarda, espera crescente e NÃO pula para o próximo', async () => {
    const fila = [item(1), item(2)];
    const d = deps(fila, async () => {
      throw new AxiosError('Network Error', 'ERR_NETWORK');
    });

    expect(await drenarCom(d)).toBe('esperando');
    expect(d.enviar).toHaveBeenCalledTimes(1);
    expect(fila[0]).toMatchObject({ seq: 1, tentativas: 1, proxima_em: 3_000 });
    expect(fila).toHaveLength(2);
  });

  it('401 (token de 7 dias venceu, senha trocada): pausa sem apagar nem gastar tentativa; depois do login, envia', async () => {
    const fila = [item(1), item(2)];
    const expirou = deps(fila, async () => {
      throw erroHttp(401, 'UNAUTHORIZED', 'Token inválido ou expirado');
    });

    expect(await drenarCom(expirou)).toBe('sessao');
    expect(fila.map((i) => [i.seq, i.tentativas])).toEqual([
      [1, 0],
      [2, 0],
    ]);
    expect(expirou.aoPausar).toHaveBeenCalledWith(true);
    expect(expirou.atualizar).not.toHaveBeenCalled();

    const voltou = deps(fila, async () => undefined);
    expect(await drenarCom(voltou)).toBe('vazia');
    expect(voltou.aoPausar).toHaveBeenCalledWith(false);
  });

  it('erro de regra (409/422): tira da fila, mostra a mensagem da API e segue', async () => {
    const fila = [item(1), item(2)];
    let n = 0;
    const d = deps(fila, async () => {
      n += 1;
      if (n === 1) throw erroHttp(409, 'VISIT_ALREADY_OPEN', 'Faça o checkout da visita aberta antes de começar outra.');
    });

    expect(await drenarCom(d)).toBe('vazia');
    expect(d.aoRecusar).toHaveBeenCalledWith('Faça o checkout da visita aberta antes de começar outra.');
    expect(fila).toEqual([]);
  });

  it('sem sinal não envia nada', async () => {
    const d = deps([item(1)], async () => undefined, { online: () => false });
    expect(await drenarCom(d)).toBe('offline');
    expect(d.enviar).not.toHaveBeenCalled();
  });

  it('item de outro consultor (troca de conta no mesmo celular) fica guardado', async () => {
    const fila = [item(1, { consultant_id: 'c2' })];
    const d = deps(fila, async () => undefined);
    expect(await drenarCom(d)).toBe('vazia');
    expect(d.enviar).not.toHaveBeenCalled();
    expect(fila).toHaveLength(1);
  });

  it('espera não vencida: não tenta antes da hora', async () => {
    const d = deps([item(1, { proxima_em: 5_000 })], async () => undefined);
    expect(await drenarCom(d)).toBe('esperando');
    expect(d.enviar).not.toHaveBeenCalled();
  });

  it('sem sessão: nada', async () => {
    const d = deps([item(1)], async () => undefined, { consultorAtual: () => null });
    expect(await drenarCom(d)).toBe('sem_sessao');
  });
});
