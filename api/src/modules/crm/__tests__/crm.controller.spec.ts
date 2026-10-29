import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { CRM_DESLIGADAS } from '../../../common/flags/crm.flags';
import type { AutomacoesService } from '../automacoes.service';
import { CrmController } from '../crm.controller';
import { CrmLigadoGuard } from '../crm.guard';
import { ResumoQueryDto, TarefaFeitaDto, TarefasQueryDto } from '../dto/crm.dto';
import type { ResumoService } from '../resumo.service';
import type { TarefasService } from '../tarefas.service';

const USER = { id: 'bbbbbbbb-0000-4000-8000-000000000001', email: 'a@b.c', name: 'Ana', is_admin: false };
const L1 = 'eeeeeeee-0000-4000-8000-000000000001';
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const valida = <T>(metatype: new () => T, value: unknown) => pipe.transform(value, { type: 'body', metatype });

describe('CrmLigadoGuard', () => {
  it('chave desligada = 404 CRM_TASKS_DISABLED em pt-BR', () => {
    const g = new CrmLigadoGuard({ ...CRM_DESLIGADAS });
    let erro: unknown;
    try {
      g.canActivate();
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(NotFoundException);
    expect((erro as NotFoundException).getResponse()).toMatchObject({ code: 'CRM_TASKS_DISABLED', message: expect.stringContaining('tarefas do Comercial') });
  });
  it('sem provedor de chaves também vale desligada; ligada deixa passar', () => {
    expect(() => new CrmLigadoGuard().canActivate()).toThrow(NotFoundException);
    expect(new CrmLigadoGuard({ ...CRM_DESLIGADAS, tasks: true }).canActivate()).toBe(true);
  });
});

describe('CrmController', () => {
  const tarefas = { listar: jest.fn(async () => ({ ok: 1 })), concluir: jest.fn(async () => ({ ok: true, lead_id: L1 })) };
  const resumoSvc = { resumo: jest.fn(async () => ({ numbers: [] })) };
  const ctrl = new CrmController(tarefas as unknown as TarefasService, resumoSvc as unknown as ResumoService, {} as AutomacoesService);
  beforeEach(() => jest.clearAllMocks());

  it('person=me usa o id do token (sub); padrão all', async () => {
    await ctrl.listar(USER, { praca_id: 'p', person: 'me' });
    expect(tarefas.listar).toHaveBeenCalledWith('p', 'me', USER.id);
    await ctrl.listar(USER, { praca_id: 'p' });
    expect(tarefas.listar).toHaveBeenLastCalledWith('p', 'all', USER.id);
  });

  it('summary repassa praca_id e day; DTO: praca_id malformado ou dia inexistente = 400, ambos opcionais', async () => {
    await ctrl.resumoDoDia({ praca_id: 'p', day: '2026-10-27' });
    expect(resumoSvc.resumo).toHaveBeenCalledWith('p', '2026-10-27');
    await expect(valida(ResumoQueryDto, {})).resolves.toBeDefined();
    await expect(valida(ResumoQueryDto, { praca_id: 'xx' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(valida(ResumoQueryDto, { day: '2026-02-30' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(valida(ResumoQueryDto, { praca_id: L1, day: '2026-10-27' })).resolves.toBeDefined();
  });

  it('done repassa o corpo e o usuário', async () => {
    const dto = { lead_id: L1, task: 'stalled', kind: 'call' } as TarefaFeitaDto;
    await expect(ctrl.feita(USER, dto)).resolves.toEqual({ ok: true, lead_id: L1 });
    expect(tarefas.concluir).toHaveBeenCalledWith(dto, USER);
  });

  it('DTO do done: kind note = 400; task fora da lista = 400; campo extra = 400; opcionais sem default', async () => {
    const ok = { lead_id: L1, task: 'stalled', kind: 'call' };
    const v = (await valida(TarefaFeitaDto, ok)) as TarefaFeitaDto;
    expect(v.text).toBeUndefined();
    expect(v.next_step).toBeUndefined();
    await expect(valida(TarefaFeitaDto, { ...ok, kind: 'note' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(valida(TarefaFeitaDto, { ...ok, task: 'send' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(valida(TarefaFeitaDto, { ...ok, extra: 1 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(valida(TarefaFeitaDto, { ...ok, text: 'x'.repeat(2001) })).rejects.toBeInstanceOf(BadRequestException);
    await expect(valida(TarefaFeitaDto, { ...ok, next_step: { what: 'Ligar', date: '2026-02-30' } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(valida(TarefaFeitaDto, { ...ok, next_step: { what: 'Ligar', date: '2026-11-03' }, text: 'ok' })).resolves.toBeDefined();
  });

  it("DTO do done aceita task 'first_contact' (o \"Feito\" da Entrada, ruling W2)", async () => {
    const v = (await valida(TarefaFeitaDto, { lead_id: L1, task: 'first_contact', kind: 'visit' })) as TarefaFeitaDto;
    expect(v).toMatchObject({ lead_id: L1, task: 'first_contact', kind: 'visit' });
  });

  it('DTO da lista: praca_id obrigatório mas malformado passa (404 vem do serviço); person inválido = 400', async () => {
    await expect(valida(TarefasQueryDto, { praca_id: 'lixo' })).resolves.toMatchObject({ praca_id: 'lixo' });
    await expect(valida(TarefasQueryDto, {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(valida(TarefasQueryDto, { praca_id: 'p', person: 'x' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
