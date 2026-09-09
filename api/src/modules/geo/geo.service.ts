import { Injectable, NotFoundException } from '@nestjs/common';
import municipiosJson from './data/municipios.json';

// Forma crua do IBGE no JSON (chaves curtas — ver `.prototype/src/lib/praca/geo.ts`).
interface MunicipioIbge {
  c: string; // código IBGE
  n: string; // nome
  u: string; // UF
  la: number; // latitude
  lo: number; // longitude
  p: number; // população
  cap: boolean; // capital
}

interface GeoJson {
  estados: string[];
  municipios: MunicipioIbge[];
}

// Forma exposta pelo serviço (e no wire, junto de `GeoController`) — nomes
// por extenso, snake_case fica só na resposta HTTP (contrato §5).
export interface Municipio {
  ibge: string;
  nome: string;
  uf: string;
  lat: number;
  lon: number;
  pop: number;
  capital: boolean;
}

export interface MunicipioVizinho extends Municipio {
  km: number;
}

export const RAIO_KM_PADRAO = 50;

// Regra do protótipo (`geo.ts:26`): estas duas cidades nunca aparecem — nem
// na lista de municípios por UF, nem como centro/vizinha de uma praça. É
// aplicada uma vez, na carga, então vale para todo mundo que usa o Map.
const EXCLUIR = new Set(['Rio de Janeiro', 'São Paulo']);

function paraWire(m: MunicipioIbge): Municipio {
  return { ibge: m.c, nome: m.n, uf: m.u, lat: m.la, lon: m.lo, pop: m.p, capital: m.cap };
}

@Injectable()
export class GeoService {
  private readonly estadosList: string[];
  private readonly porIbge = new Map<string, Municipio>();

  constructor() {
    const data = municipiosJson as GeoJson;
    this.estadosList = data.estados;
    for (const m of data.municipios) {
      if (EXCLUIR.has(m.n)) continue;
      this.porIbge.set(m.c, paraWire(m));
    }
  }

  estados(): string[] {
    return this.estadosList;
  }

  municipiosPorUf(uf: string): Municipio[] {
    return [...this.porIbge.values()]
      .filter((m) => m.uf === uf)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  find(ibge: string): Municipio | undefined {
    return this.porIbge.get(ibge);
  }

  private findOrFail(ibge: string): Municipio {
    const m = this.find(ibge);
    if (!m) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Município não encontrado.' });
    return m;
  }

  // Mesma matemática de `geo.ts:41-57`.
  haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
    const R = 6371;
    const dLat = ((bLat - aLat) * Math.PI) / 180;
    const dLon = ((bLon - aLon) * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /** Cidades dentro do raio, da maior para a menor população (exclui a própria). `404 NOT_FOUND` se `ibge` não existe. */
  cidadesNoRaio(ibge: string, km: number = RAIO_KM_PADRAO): MunicipioVizinho[] {
    const centro = this.findOrFail(ibge);
    return [...this.porIbge.values()]
      .filter((m) => m.ibge !== centro.ibge)
      .map((m) => ({ ...m, km: this.haversineKm(centro.lat, centro.lon, m.lat, m.lon) }))
      .filter((m) => m.km <= km)
      .sort((a, b) => b.pop - a.pop);
  }
}
