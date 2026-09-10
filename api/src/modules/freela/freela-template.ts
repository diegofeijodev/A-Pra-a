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

/**
 * O contexto do render sem o lead: é justamente o que o Freela não tem.
 *
 * `cidade` é a exceção: o Freela **tem** `{{cidade}}`, mas só preenche para
 * audiência interna dele — em lista externa (`EXTERNAL_LIST`) o destinatário
 * nasce com `city: null` e a variável renderizaria vazia. Então quem conhece a
 * praça passa a cidade-sede aqui e a variável vira texto; sem ela,
 * `{{cidade}}` entra em `unsupported_variables` em vez de virar buraco.
 */
export type FreelaTemplateCtx = Omit<RenderCtx, 'lead' | 'neighbor'> & {
  /** Cidade-sede da praça, quando a campanha é de uma praça só. */
  cidade?: string | undefined;
};

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
  // `{{primeiro_nome}}` não é variável do Praça, mas É do Freela: quem escreve o
  // texto na mão (§18.2, "escrever aqui") escreve no vocabulário de lá. Sem esta
  // linha ela cairia em `unsupported_variables` e a caixa avisaria o contrário
  // do que o próprio campo diz logo acima do textarea.
  primeiro_nome: 'primeiro_nome',
};

/** Separador de variantes do texto escrito na mão: uma linha só com `---`. */
const SEPARADOR_VARIANTES = /^\s*---\s*$/m;

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
    if (key === 'cidade') {
      // Com a cidade da praça na mão vira texto; sem ela, fica avisada (o
      // Freela deixaria vazio em lista externa).
      const cidade = ctx.cidade?.trim();
      if (cidade) return cidade;
      achadas.add(key);
      return bruto;
    }
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
  return converterVariantes(
    [textA, textB].filter((t): t is string => !!t && t.trim() !== ''),
    ctx,
  );
}

/** Texto escrito na mão em variantes: uma linha só com `---` separa cada uma. */
export function splitVariants(text: string): string[] {
  return (text || '')
    .split(SEPARADOR_VARIANTES)
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Texto escrito na mão (§18.2) → `whatsappTemplate` do Freela, pela MESMA
 * conversão do modelo salvo. Sem ela `{{meu_nome}}` e `{{praca}}` subiriam crus
 * e o lead receberia a chave no lugar do valor; com ela, o que a prévia do
 * disparo mostra é exatamente o que a criação da campanha manda.
 */
export function toFreelaTemplateFromText(text: string, ctx: FreelaTemplateCtx): FreelaTemplateOut {
  return converterVariantes(splitVariants(text), ctx);
}

function converterVariantes(variantes: string[], ctx: FreelaTemplateCtx): FreelaTemplateOut {
  const achadas = new Set<string>();
  const convertidas = variantes.map((t) => converterVariante(t, ctx, achadas));
  return { template: convertidas.join('\n---\n'), unsupported_variables: [...achadas] };
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
/**
 * Cidade-sede da praça para o `{{cidade}}` da campanha. Praça sem cobertura
 * escolhida cai no `city` da linha (o rótulo pode vir como
 * "Belo Horizonte · Setembro", e só a primeira parte é cidade).
 */
export function pracaCidade(
  p: { city?: string | null; cobertura_cidade?: string | null } | null | undefined,
): string | undefined {
  const cobertura = p?.cobertura_cidade?.trim();
  if (cobertura) return cobertura;
  const cidade = (p?.city ?? '').split(' · ')[0]?.trim();
  return cidade || undefined;
}

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
