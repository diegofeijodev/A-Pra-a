/** Lote E (contrato §41.1, §42.1): o que entra no wire só com as flags — `features` da configuração e `UserView.is_gestor`. */
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../../../common/database/prisma.service';
import { LOVABLE_E_DESLIGADAS } from '../../../common/flags/lovable-e.flags';
import { AuthService } from '../../auth/auth.service';
import { RotasConfigController } from '../../rotas/rotas-equipe.controller';

const LINHA = {
  id: 'u1',
  email: 'rebeca@praca.local',
  name: 'Rebeca',
  role_label: '',
  color: '#ECA826',
  phone: '',
  is_admin: false,
  is_gestor: true,
  active: true,
  theme: 'dark',
  active_praca_id: null,
  sort: 0,
};

describe('UserView.is_gestor (§42.1)', () => {
  it('desligada: a projeção é a de hoje (sem a chave); ligada: a chave entra com o valor do banco', () => {
    const off = new AuthService({} as PrismaService, {} as JwtService, LOVABLE_E_DESLIGADAS).toUserView(LINHA);
    expect(off).not.toHaveProperty('is_gestor');
    expect(Object.keys(off).sort()).toEqual(['active', 'active_praca_id', 'color', 'email', 'id', 'is_admin', 'name', 'phone', 'role_label', 'sort', 'theme']);
    expect(new AuthService({} as PrismaService, {} as JwtService).toUserView(LINHA)).not.toHaveProperty('is_gestor');
    const on = new AuthService({} as PrismaService, {} as JwtService, { ...LOVABLE_E_DESLIGADAS, team_gestor: true }).toUserView(LINHA);
    expect(on.is_gestor).toBe(true);
    expect(new AuthService({} as PrismaService, {} as JwtService, { ...LOVABLE_E_DESLIGADAS, team_gestor: true }).toUserView({ ...LINHA, is_gestor: false }).is_gestor).toBe(false);
  });
});

describe('GET settings/config: features do lote E (aditivas; desligadas por padrão)', () => {
  it('as quatro chaves seguem as flags', async () => {
    const config = { view: jest.fn().mockResolvedValue({}) };
    const off = await new RotasConfigController(config as never).get();
    expect(off.features).toMatchObject({ password_policy: false, consultant_profile: false, contact_email: false, team_gestor: false });
    const on = await new RotasConfigController(config as never, undefined, undefined, undefined, undefined, {
      password_policy: true,
      consultant_profile: true,
      contact_email: true,
      team_gestor: true,
    }).get();
    expect(on.features).toMatchObject({ password_policy: true, consultant_profile: true, contact_email: true, team_gestor: true });
  });
});
