import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { NovoLugarDto } from '../dto/campo.dto';

const erros = (o: object) => validateSync(plainToInstance(NovoLugarDto, o), { whitelist: true, forbidNonWhitelisted: true });

describe('NovoLugarDto', () => {
  it('nome com markup literal é aceito (o web escapa na exibição)', () => {
    expect(erros({ name: 'Bar <b>x</b>' })).toHaveLength(0);
  });
  it('apara o nome antes de medir: " a " tem 1 caractere útil = 400', () => {
    expect(erros({ name: ' a ' })).not.toHaveLength(0);
  });
  it('" ab " passa e vira "ab"', () => {
    const dto = plainToInstance(NovoLugarDto, { name: ' ab ' });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.name).toBe('ab');
  });
  it('120 passa, 121 não; endereço 200 passa, 201 não', () => {
    expect(erros({ name: 'a'.repeat(120), address: 'b'.repeat(200) })).toHaveLength(0);
    expect(erros({ name: 'a'.repeat(121) })).not.toHaveLength(0);
    expect(erros({ name: 'ab', address: 'b'.repeat(201) })).not.toHaveLength(0);
  });
});
