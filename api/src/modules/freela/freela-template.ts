/**
 * Conversão de modelo e de ritmo do Praça para o formato das campanhas do
 * Freela — §7.4 do desenho. Arquivo **puro**: nada de Nest, banco ou rede, para
 * a prévia do disparo e o outbox usarem exatamente a mesma conversão.
 *
 * O Freela só conhece três variáveis por destinatário (`{{nome}}`,
 * `{{primeiro_nome}}`, `{{cidade}}`). O Praça tem dezesseis. A conversão faz
 * três coisas:
 *
 * 1. **traduz** o que existe dos dois lados (`{{primeiro_nome_dono}}` é o
 *    `{{primeiro_nome}}` de lá);
 * 2. **resolve agora** o que é fixo por campanha (`{{meu_nome}}`, `{{praca}}`,
 *    `{{link_cadastro}}`…) — vira texto no modelo que sobe;
 * 3. **deixa intacto** o que só existe lead a lead (`{{estabelecimento}}`,
 *    `{{bairro}}`, `{{estabelecimento_vizinho}}`, `{{data_vaga}}`) e devolve a
 *    lista em `unsupported_variables`, para a tela avisar antes de disparar.
 *    Mandar `⟨estabelecimento⟩` para 2.000 pessoas seria pior que avisar.
 */
import { renderTemplate, type RenderCtx } from '../../domain/template-render';
import type { SendSettings } from '../../domain/send-schedule';

/** O contexto do render sem o lead: é justamente o que o Freela não tem. */
export type FreelaTemplateCtx = Omit<RenderCtx, 'lead' | 'neighbor'>;

export interface FreelaTemplateOut {
  /** Texto pronto para `whatsappTemplate`, variantes separadas por `\n---\n`. */
  template: string;
  /** Variáveis do Praça que ficaram no texto porque o Freela não as tem. */
  unsupported_variables: string[];
}

export interface FreelaPacing {
  messagesPerHour: number;
  dailyCap: number;
  windowStartHour: number;
  windowEndHour: number;
  weekdaysOnly: boolean;
}

/** `{{variavel}}` — mesma forma do render do Praça (`template-render.ts`). */
const VAR_RE = /\{\{\s*([\w_]+)\s*\}\}/g;

/** Variável do Praça → variável equivalente do Freela. */
const EQUIVALENTES: Record<string, string> = {
  primeiro_nome_dono: 'primeiro_nome',
  nome: 'nome',
  cidade: 'cidade',
};

/**
 * Variáveis fixas por campanha: são resolvidas AQUI, com o contexto de quem
 * dispara, e viram texto no modelo. `data`/`praca` saem da praça; o resto vem
 * de `app_settings.template_defaults`.
 */
const RESOLVIDAS = [
  'praca',
  'meu_nome',
  'link_video_caso',
  'link_cadastro',
  'funcao',
  'valor',
  'turno',
  'dia_forte',
  'data',
] as const;

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/**
 * Converte uma variante. Devolve o texto e junta em `achadas` as variáveis que
 * o Freela não suporta (na ordem em que aparecem).
 */
function converterVariante(text: string, ctx: FreelaTemplateCtx, achadas: Set<string>): string {
  return (text || '').replace(VAR_RE, (bruto, key: string) => {
    const equivalente = EQUIVALENTES[key];
    if (equivalente) return `{{${equivalente}}}`;
    if ((RESOLVIDAS as readonly string[]).includes(key)) {
      // Mesmo render do Praça: variável sem valor continua visível como
      // `⟨praca⟩` em vez de sumir e deixar a frase pela metade.
      return renderTemplate(bruto, ctx);
    }
    achadas.add(key);
    return bruto;
  });
}

/**
 * Modelo do Praça (variante A e, quando houver, B) → `whatsappTemplate` do
 * Freela. O Freela alterna as variantes por índice do destinatário, que é
 * exatamente o teste A/B do Praça.
 */
export function toFreelaTemplate(
  textA: string,
  textB: string | null | undefined,
  ctx: FreelaTemplateCtx,
): FreelaTemplateOut {
  const achadas = new Set<string>();
  const variantes = [textA, textB]
    .filter((t): t is string => !!t && t.trim() !== '')
    .map((t) => converterVariante(t, ctx, achadas));
  return { template: variantes.join('\n---\n'), unsupported_variables: [...achadas] };
}

/**
 * Ritmo do Praça (`GET /v1/settings`) → ritmo da campanha do Freela.
 *
 * O Praça guarda intervalo entre mensagens em segundos (sorteado entre
 * `gap_min` e `gap_max`); o Freela pede mensagens por hora. A conversão usa o
 * intervalo médio e prende nos limites do Freela (1..60 por hora, 1..1000 por
 * dia).
 *
 * `weekdaysOnly = !sunday`: o Freela não distingue sábado, então "não mandar no
 * domingo" no Praça vira "só dias úteis" lá — o sábado se perde, e é de
 * propósito (o contrato §18 avisa).
 */
export function toFreelaPacing(s: SendSettings): FreelaPacing {
  const medio = (s.gap_min + s.gap_max) / 2;
  const porHora = medio > 0 ? Math.round(3600 / medio) : 60;
  return {
    messagesPerHour: clamp(porHora, 1, 60),
    dailyCap: clamp(Math.round(s.daily_limit), 1, 1000),
    windowStartHour: clamp(Math.round(s.window_start), 0, 23),
    // Fim de janela é exclusivo nos dois lados (1..24).
    windowEndHour: clamp(Math.round(s.window_end), 1, 24),
    weekdaysOnly: !s.sunday,
  };
}
