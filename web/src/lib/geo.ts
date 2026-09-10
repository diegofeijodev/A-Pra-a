// Apresentação da geografia — porte de `.prototype/src/lib/praca/geo.ts`.
//
// A base de municípios do IBGE (500 KB) NÃO vive mais no navegador: ficou na
// API (`GET /v1/geo/*`, contrato §5), que também faz o cálculo do raio. O que
// sobra aqui é só o que a tela precisa escrever: o nome do estado por sigla, o
// raio padrão do texto e o formato curto de população.

export const UF_NOME: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MG: "Minas Gerais", MS: "Mato Grosso do Sul", MT: "Mato Grosso",
  PA: "Pará", PB: "Paraíba", PE: "Pernambuco", PI: "Piauí", PR: "Paraná",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RO: "Rondônia", RR: "Roraima",
  RS: "Rio Grande do Sul", SC: "Santa Catarina", SE: "Sergipe", SP: "São Paulo", TO: "Tocantins",
};

/** Raio padrão da cobertura de uma praça — o mesmo default da API (§5). */
export const RADIUS_KM = 50;

export const fmtPop = (p: number) =>
  p >= 1_000_000 ? `${(p / 1_000_000).toFixed(1).replace(".", ",")} mi` : `${Math.round(p / 1000)} mil`;
