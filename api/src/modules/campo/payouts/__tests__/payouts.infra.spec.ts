import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ADMIN_ONLY_KEY } from '../../../../common/decorators/admin-only.decorator';
import { CAMPO_ROUTE_KEY } from '../../../../common/decorators/campo-route.decorator';
import { PayoutsCampoController, PayoutsEquipeController } from '../payouts.controller';
import { lerPagarMultipart } from '../multipart-comprovante';
import { PrismaPayoutsRepository } from '../payouts.repository';
import { JPEG } from './fakes';

const RAIZ = join(__dirname, '..', '..', '..', '..', '..');

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory()
      ? n === 'node_modules' || n === 'dist'
        ? []
        : arquivos(p)
      : p.endsWith('.ts') && !p.includes('__tests__')
        ? [p]
        : [];
  });
}

describe('imutabilidade dos pagamentos', () => {
  it('nenhum código altera ou apaga eventos, nem apaga pagamentos (só `updateMany` por transição)', () => {
    const proibido =
      /(field_payout_events\s*\.\s*(update|updateMany|delete|deleteMany|upsert)|field_payouts\s*\.\s*(update|delete|deleteMany|upsert))\b/;
    const cru = /(UPDATE|DELETE\s+FROM|TRUNCATE)\s+"?(field_payout_events|field_payouts)/i;
    const ofensores = arquivos(join(RAIZ, 'src')).filter((f) => {
      const t = readFileSync(f, 'utf8');
      return proibido.test(t) || cru.test(t);
    });
    expect(ofensores).toEqual([]);
  });

  it('o único update de pagamento é o compare-and-set `transitar`', () => {
    const usos = arquivos(join(RAIZ, 'src')).filter((f) => /field_payouts\s*\.\s*updateMany/.test(readFileSync(f, 'utf8')));
    expect(usos.map((f) => f.split('/').pop())).toEqual(['payouts.repository.ts']);
  });

  it('o repositório não expõe método de delete/editar', () => {
    const metodos = Object.getOwnPropertyNames(PrismaPayoutsRepository.prototype);
    expect(metodos.filter((n) => /delete|remove|apagar|editar|alterar|upsert|update/i.test(n))).toEqual([]);
  });
});

describe('controllers', () => {
  const adminOnly = (alvo: object, nome: string) => Reflect.getMetadata(ADMIN_ONLY_KEY, (alvo as Record<string, object>)[nome]) === true;
  const proto = PayoutsEquipeController.prototype as unknown as Record<string, object>;

  it('toda escrita e a chave completa são só admin; leitura é da equipe', () => {
    for (const n of ['gerar', 'exportar', 'pagar', 'falhou', 'tentarDeNovo', 'cancelar', 'estornar', 'chavePix']) {
      expect(adminOnly(proto, n)).toBe(true);
    }
    for (const n of ['listar', 'detalhe', 'comprovante']) expect(adminOnly(proto, n)).toBe(false);
  });

  it('as rotas do consultor são @CampoRoute e as da equipe não', () => {
    expect(Reflect.getMetadata(CAMPO_ROUTE_KEY, PayoutsCampoController)).toBeTruthy();
    expect(Reflect.getMetadata(CAMPO_ROUTE_KEY, PayoutsEquipeController)).toBeFalsy();
  });

  it('export.csv vem antes de :id (a ordem importa)', () => {
    const t = readFileSync(join(RAIZ, 'src/modules/campo/payouts/payouts.controller.ts'), 'utf8');
    expect(t.indexOf("@Get('export.csv')")).toBeLessThan(t.indexOf("@Get(':id')"));
    const mod = readFileSync(join(RAIZ, 'src/modules/campo/campo.module.ts'), 'utf8');
    expect(mod.indexOf('PayoutsEquipeController,')).toBeLessThan(mod.indexOf('ConsultoresController,'));
  });
});

describe('leitura do multipart do comprovante', () => {
  const req = (partes: object[], multipart = true, body?: unknown) =>
    ({
      isMultipart: () => multipart,
      body,
      parts: async function* () {
        for (const p of partes) yield p;
      },
    }) as never;
  const arquivo = (bytes: Buffer, fieldname = 'proof') => ({ type: 'file', fieldname, toBuffer: async () => bytes });
  const campo = (fieldname: string, value: string) => ({ type: 'field', fieldname, value });

  it('lê campos e arquivo em qualquer ordem', async () => {
    const r = await lerPagarMultipart(req([arquivo(JPEG), campo('paid_cents', '9000'), campo('reason', 'Pix menor')]));
    expect(r.proof).toBe(JPEG);
    expect(r.campos).toMatchObject({ paid_cents: 9000, reason: 'Pix menor' });
  });

  it('campo desconhecido, arquivo com outro nome e valor inválido = 400', async () => {
    await expect(lerPagarMultipart(req([campo('x', '1')]))).rejects.toMatchObject({ status: 400 });
    await expect(lerPagarMultipart(req([arquivo(JPEG, 'file')]))).rejects.toMatchObject({ status: 400 });
    await expect(lerPagarMultipart(req([campo('paid_cents', 'abc')]))).rejects.toMatchObject({ status: 400 });
  });

  it('arquivo grande demais = 413 FILE_TOO_LARGE', async () => {
    const grande = { type: 'file', fieldname: 'proof', toBuffer: async () => { throw Object.assign(new Error('x'), { code: 'FST_REQ_FILE_TOO_LARGE' }); } };
    await expect(lerPagarMultipart(req([grande]))).rejects.toMatchObject({ status: 413, response: { code: 'FILE_TOO_LARGE' } });
  });

  it('sem multipart aceita JSON simples', async () => {
    const r = await lerPagarMultipart(req([], false, { note: 'ok' }));
    expect(r).toEqual({ campos: expect.objectContaining({ note: 'ok' }), proof: null });
  });
});

describe('armazenamento do comprovante', () => {
  const CONS = '44444444-4444-4444-8444-444444444444';
  const PROVA = '55555555-5555-4555-8555-555555555555';

  it('o disco aceita a chave do comprovante (jpg/png/pdf), devolve o tipo certo e recusa o resto', async () => {
     
    const { DiskPhotoStorage, chaveDoComprovante, mimeDaChave } = require('../../photo-storage');
    const dir = mkdtempSync(join(tmpdir(), 'praca-prova-'));
    try {
      const s = new DiskPhotoStorage(dir);
      const key = chaveDoComprovante(CONS, PROVA, 'pdf');
      expect(key).toBe(`pagamentos/${CONS}/${PROVA}.pdf`);
      await s.put(key, Buffer.from('%PDF-1.7'), 'application/pdf');
      expect(await s.get(key)).toEqual({ bytes: Buffer.from('%PDF-1.7'), mime: 'application/pdf' });
      expect(mimeDaChave(chaveDoComprovante(CONS, PROVA, 'png'))).toBe('image/png');
      await s.remove(key);
      expect(await s.get(key)).toBeNull();
      await expect(s.put(`pagamentos/${CONS}/../../x.pdf`, Buffer.alloc(1), 'application/pdf')).rejects.toThrow('chave de foto inválida');
      await expect(s.put(`pagamentos/${CONS}/${PROVA}.exe`, Buffer.alloc(1), 'x')).rejects.toThrow('chave de foto inválida');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
