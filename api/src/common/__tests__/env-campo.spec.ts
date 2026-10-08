import { validateEnv } from '../config/env.validation';

const BASE = { DATABASE_URL: 'postgresql://praca:praca@localhost:5437/praca', JWT_SECRET: 'x'.repeat(16) };

describe('env — consultores de campo', () => {
  it('fora de produção as fotos vão para o disco', () => {
    expect(validateEnv(BASE).PHOTO_STORAGE).toBe('disk');
    expect(validateEnv(BASE).PHOTOS_DIR).toBe('./uploads');
  });

  it('em produção o padrão é o bucket S3 (spec §10)', () => {
    expect(validateEnv({ ...BASE, NODE_ENV: 'production' }).PHOTO_STORAGE).toBe('s3');
  });

  it('disco em produção só com PHOTO_STORAGE=disk explícito', () => {
    expect(validateEnv({ ...BASE, NODE_ENV: 'production', PHOTO_STORAGE: 'disk' }).PHOTO_STORAGE).toBe('disk');
  });

  it('PHOTO_STORAGE vazio (compose com ${PHOTO_STORAGE:-}) conta como ausente', () => {
    expect(validateEnv({ ...BASE, NODE_ENV: 'production', PHOTO_STORAGE: '' }).PHOTO_STORAGE).toBe('s3');
  });

  it('valor fora da lista derruba a largada', () => {
    expect(() => validateEnv({ ...BASE, PHOTO_STORAGE: 'ftp' })).toThrow('Configuração de ambiente inválida');
  });

  it('token do consultor vale 7 dias por padrão', () => {
    expect(validateEnv(BASE).CAMPO_JWT_EXPIRES_IN).toBe('7d');
  });
});
