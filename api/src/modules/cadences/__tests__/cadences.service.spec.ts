/**
 * A invariante do §19.24/§19.16: **cadência não nasce rodando**.
 *
 * O motor roda a cada 15 s e matricula até 30 leads por rodada; uma cadência
 * com entrada automática (`stage_novo`, `reheat_due`, `first_vaga`) que nasça
 * despausada começa a gravar mensagens para a base inteira — em modo `fila`
 * queima a contabilidade, em modo `freela` são WhatsApp de verdade saindo.
 *
 * Até a T25 quem garantia isso era **uma linha do web** (`Cadencias.tsx`,
 * `paused: true`): o `CadenceBody` do contrato não listava o campo, então um
 * cliente que seguisse o contrato à risca o omitia — e o `PUT` (documentado
 * como "mesmo corpo do POST") despausava qualquer uma das 5 cadências-modelo
 * em silêncio, disparando a base ao editar o texto de um passo.
 */
import type { PrismaService } from '../../../common/database/prisma.service';
import { CadencesService } from '../cadences.service';
import type { CadenceBodyDto } from '../dto/cadences.dto';

const CADENCIA = '66666666-6666-4666-8666-666666666666';

function linha(over: Record<string, unknown> = {}) {
  return {
    id: CADENCIA,
    name: 'Reaquecimento',
    audience: 'todos',
    entry: 'reheat_due',
    exit_action: 'sai_conversa',
    exit_note: '',
    paused: true,
    created_at: new Date('2026-09-09T12:00:00Z'),
    nodes: [],
    ...over,
  };
}

function fakePrisma(atual: Record<string, unknown> = {}) {
  const p = {
    $transaction: jest.fn(),
    cadences: {
      create: jest.fn().mockImplementation(async (args: { data: Record<string, unknown> }) =>
        linha({ paused: args.data.paused }),
      ),
      update: jest.fn().mockResolvedValue(linha()),
      findUnique: jest.fn().mockResolvedValue(linha(atual)),
    },
    cadence_nodes: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
    msg_templates: { count: jest.fn().mockResolvedValue(0) },
  };
  p.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(p));
  return p;
}

const corpo = (over: Partial<CadenceBodyDto> = {}): CadenceBodyDto =>
  ({
    name: 'Reaquecimento',
    audience: 'todos',
    entry: 'reheat_due',
    exit: { action: 'sai_conversa' },
    nodes: [{ kind: 'task', day: 0, task: 'Ligar' }],
    ...over,
  }) as CadenceBodyDto;

/** `data` do `create`/`update` que foi gravado. */
const gravado = (mock: jest.Mock): Record<string, unknown> =>
  (mock.mock.calls[0]![0] as { data: Record<string, unknown> }).data;

describe('CadencesService.create — paused', () => {
  it('sem `paused` no corpo, a cadência nasce PAUSADA', async () => {
    const p = fakePrisma();

    const out = await new CadencesService(p as unknown as PrismaService).create(corpo());

    expect(gravado(p.cadences.create).paused).toBe(true);
    expect(out.paused).toBe(true);
  });

  it('`paused: false` explícito é respeitado (a tela pode ligar na hora)', async () => {
    const p = fakePrisma();

    await new CadencesService(p as unknown as PrismaService).create(corpo({ paused: false }));

    expect(gravado(p.cadences.create).paused).toBe(false);
  });
});

describe('CadencesService.replace — paused', () => {
  it('`paused` ausente MANTÉM o valor atual (não despausa ao salvar o texto)', async () => {
    const p = fakePrisma({ paused: true });

    await new CadencesService(p as unknown as PrismaService).replace(CADENCIA, corpo());

    expect(gravado(p.cadences.update).paused).toBe(true);
  });

  it('`paused` ausente numa cadência que estava RODANDO também mantém — não repausa', async () => {
    const p = fakePrisma({ paused: false });

    await new CadencesService(p as unknown as PrismaService).replace(CADENCIA, corpo());

    expect(gravado(p.cadences.update).paused).toBe(false);
  });

  it('`paused: false` no corpo despausa de verdade', async () => {
    const p = fakePrisma({ paused: true });

    await new CadencesService(p as unknown as PrismaService).replace(CADENCIA, corpo({ paused: false }));

    expect(gravado(p.cadences.update).paused).toBe(false);
  });

  it('`paused: true` no corpo pausa', async () => {
    const p = fakePrisma({ paused: false });

    await new CadencesService(p as unknown as PrismaService).replace(CADENCIA, corpo({ paused: true }));

    expect(gravado(p.cadences.update).paused).toBe(true);
  });
});
