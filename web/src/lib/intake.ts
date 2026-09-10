// Leitura de arquivo da importação — porte de
// `.prototype/src/lib/praca/intake.ts:41-108` (só `parseCsv`, `parseXml` e
// `readFile`).
//
// O que ficou de fora é de propósito: adivinhação de mapeamento, duplicidade e
// avaliação das linhas viraram `POST /v1/imports/evaluate` (§10 do contrato).
// A varredura de duplicados precisa da base inteira, e decidir no navegador com
// um retrato velho é como se cria o "mesmo lead duas vezes". O arquivo continua
// sendo lido AQUI: assim a API recebe linhas já parseadas em vez de megabytes
// de CSV.

export interface ParsedFile {
  columns: string[];
  rows: Record<string, string>[];
  kind: "csv" | "xml";
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

export function parseCsv(text: string): ParsedFile {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = clean.split("\n").filter((l) => l.trim() !== "");
  if (!lines.length) return { columns: [], rows: [], kind: "csv" };
  const head = lines[0]!;
  const sep = (head.match(/;/g)?.length ?? 0) > (head.match(/,/g)?.length ?? 0) ? ";" : ",";
  const columns = splitCsvLine(head, sep).map((c, i) => c || `coluna ${i + 1}`);
  const rows = lines.slice(1).map((l) => {
    const cells = splitCsvLine(l, sep);
    const obj: Record<string, string> = {};
    columns.forEach((c, i) => { obj[c] = cells[i] ?? ""; });
    return obj;
  });
  return { columns, rows, kind: "csv" };
}

export function parseXml(text: string): ParsedFile {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("XML inválido — confira o arquivo.");
  const root = doc.documentElement;
  const children = Array.from(root.children);
  // registros = filhos repetidos do nó raiz (ou do primeiro nó que tem filhos repetidos)
  let records = children;
  if (children.length === 1 && children[0]!.children.length > 1) records = Array.from(children[0]!.children);
  const columns: string[] = [];
  const rows = records.map((rec) => {
    const obj: Record<string, string> = {};
    for (const attr of Array.from(rec.attributes)) {
      const key = `@${attr.name}`;
      obj[key] = attr.value;
      if (!columns.includes(key)) columns.push(key);
    }
    for (const el of Array.from(rec.children)) {
      const key = el.tagName;
      obj[key] = (el.textContent ?? "").trim();
      if (!columns.includes(key)) columns.push(key);
    }
    return obj;
  });
  return { columns, rows, kind: "xml" };
}

export async function readFile(file: File): Promise<ParsedFile> {
  const text = await file.text();
  const isXml = /\.xml$/i.test(file.name) || text.trimStart().startsWith("<");
  return isXml ? parseXml(text) : parseCsv(text);
}
