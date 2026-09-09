import { phoneKey, toE164BR } from '../phone/phone';
describe('phone', () => {
  it('phoneKey pega os 9 últimos dígitos', () => expect(phoneKey('(31) 98765-4321')).toBe('987654321'));
  it('E.164 a partir de máscara', () => expect(toE164BR('(31) 98765-4321')).toBe('+5531987654321'));
  it('E.164 a partir de 55 na frente', () => expect(toE164BR('5531987654321')).toBe('+5531987654321'));
  it('rejeita número curto', () => expect(toE164BR('1234')).toBeNull());
});
