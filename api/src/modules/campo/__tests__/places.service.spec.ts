import { ConflictException } from '@nestjs/common';
import type { CampoConsultant } from '../../../common/auth/campo-consultant';
import type { PrismaService } from '../../../common/database/prisma.service';
import type { JourneysService } from '../journeys.service';
import { PlacesService } from '../places.service';

const PRACA = '00000000-0000-4000-8000-0000000000aa';
const C: CampoConsultant = { id: 'c1', name: 'Ana', email: 'a@b.com', praca_id: PRACA, must_change_password: false };
const AQUI = { lat: -19.9245, lng: -43.9352 };

const lead = (id: string, name: string, lat: number | null, lng: number | null) => ({
  id,
  name,
  address: 'Rua X',
  stage: 1,
  lat,
  lng,
});

function montar(linhas: ReturnType<typeof lead>[]) {
  const p = { leads: { findMany: jest.fn().mockResolvedValue(linhas) } };
  const journeys = { abertaOuFalha: jest.fn().mockResolvedValue({ id: 'j1' }) };
  return { p, journeys, s: new PlacesService(p as unknown as PrismaService, journeys as unknown as JourneysService) };
}

const SEM_JORNADA = new ConflictException({ code: 'NO_OPEN_JOURNEY', message: 'Não há jornada aberta.' });

describe('PlacesService', () => {
  it('perto de mim: só a praça, só com localização no raio de 500 m, do mais perto ao mais longe', async () => {
    const { p, s } = montar([
      lead('l3', 'Longe', -19.9199, -43.9352), // ~512 m — fora
      lead('l2', 'Médio', -19.9225, -43.9352), // ~222 m
      lead('l1', 'Perto', -19.9240, -43.9352), // ~56 m
    ]);

    const r = await s.list(C, AQUI);

    expect(r.map((x) => [x.id, x.distance_m])).toEqual([
      ['l1', 56],
      ['l2', 222],
    ]);
    const where = (p.leads.findMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ praca_id: PRACA, archived: false });
    expect(where).toHaveProperty('lat.gte');
  });

  it('busca por nome ignora acento e caixa e devolve até 20', async () => {
    const muitos = Array.from({ length: 25 }, (_, i) => lead(`x${i}`, `Café ${i}`, null, null));
    const { s } = montar([lead('b1', 'Bar do Mercado', null, null), ...muitos]);

    expect((await s.list(C, { q: 'mercado' })).map((x) => x.id)).toEqual(['b1']);
    expect(await s.list(C, { q: 'CAFE' })).toHaveLength(20);
  });

  it('sem q e sem lat+lng = 400', async () => {
    const { s } = montar([]);
    await expect(s.list(C, {})).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });

  it('parecidos: nome parecido a até 100 m', async () => {
    const { s } = montar([
      lead('a', 'Bar do Zé Moema', -19.9241, -43.9352), // ~44 m, parecido
      lead('b', 'Pizzaria Napoli', -19.9244, -43.9352), // ~11 m, outro nome
      lead('c', 'Bar do Zé', -19.9230, -43.9352), // ~167 m, longe demais
    ]);
    expect((await s.similar(C, { name: 'Bar do Zé', ...AQUI })).map((x) => [x.id, x.distance_m])).toEqual([['a', 44]]);
  });

  it('perto de mim e parecidos exigem jornada aberta (409) e não consultam leads sem ela', async () => {
    const { p, journeys, s } = montar([]);
    journeys.abertaOuFalha.mockRejectedValue(SEM_JORNADA);

    await expect(s.list(C, AQUI)).rejects.toMatchObject({ response: { code: 'NO_OPEN_JOURNEY' } });
    await expect(s.similar(C, { name: 'Bar do Zé', ...AQUI })).rejects.toMatchObject({ response: { code: 'NO_OPEN_JOURNEY' } });
    expect(p.leads.findMany).not.toHaveBeenCalled();
  });

  it('busca por nome (sem posição) não exige jornada', async () => {
    const { journeys, s } = montar([lead('b1', 'Bar do Mercado', null, null)]);
    journeys.abertaOuFalha.mockRejectedValue(SEM_JORNADA);

    expect((await s.list(C, { q: 'mercado' })).map((x) => x.id)).toEqual(['b1']);
    expect(journeys.abertaOuFalha).not.toHaveBeenCalled();
  });

  it('busca por nome também não traz arquivados', async () => {
    const { p, s } = montar([]);
    await s.list(C, { q: 'bar' });
    expect(p.leads.findMany.mock.calls[0]![0]).toMatchObject({ where: { praca_id: PRACA, archived: false } });
  });
});
