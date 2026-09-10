// Ajudantes de data — porte de `.prototype/src/lib/praca/store-dates.ts`.
// Módulo sem dependências para evitar ciclos de import.
//
// Único desvio do protótipo: `todayISO()` (que lia o relógio do navegador) virou
// `todaySp()`, que lê o dia em América/São_Paulo. O servidor usa a mesma regra
// (`api/src/common/time/dates.ts`), então tela e API concordam sobre "hoje"
// mesmo com o navegador em outro fuso.
export const DAY = 86400000;

export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const parse = (s: string) => {
  const [y = 2026, m = 1, dd = 1] = s.split("-").map(Number);
  return new Date(y, m - 1, dd);
};

export const addDays = (s: string, n: number) => iso(new Date(parse(s).getTime() + n * DAY));

const SP_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "Hoje" em Brasília, no formato "YYYY-MM-DD". Nunca use `toISOString()`. */
export const todaySp = () => SP_DAY.format(new Date());

export const fmtBR = (s?: string) => {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};

export const fmtShort = (s: string) => {
  const [, m, d] = s.split("-");
  return `${d}/${m}`;
};

export const diffDays = (a: string, b: string) =>
  Math.round((parse(a).getTime() - parse(b).getTime()) / DAY);

export const WD_LONG = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const WD_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// Título do calendário ("setembro 2026"). O `meses` do catálogo é a versão
// curta da mídia ("Jan", "Fev"…) e não serve aqui — ver `routes/calendario.tsx`.
export const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export const wdOf = (s: string) => parse(s).getDay();

const SP_DATETIME = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Timestamp ISO (UTC) da API exibido em horário de Brasília: "09/09 14:30". */
export const fmtDateTime = (isoStr: string) => SP_DATETIME.format(new Date(isoStr)).replace(",", "");
