/**
 * Porta de saída para a API do Freela (`api-freela`) — §7.2 do desenho.
 *
 * O Freela não tem chave de API nem conta de serviço: a única porta é o JWT de
 * **admin** (`POST /v1/admins/login`) de uma conta com permissão `REFERRALS`.
 * Então o cliente faz login sob demanda, guarda o `accessToken` em memória e
 * refaz o login uma vez quando toma 401 (token expirou, servidor reiniciou).
 * Não há fluxo de refresh de propósito: o login é uma chamada só e o token vive
 * no processo, então "relogar" é mais simples e igualmente barato.
 *
 * Três erros, três códigos — é o que a tela do Praça precisa distinguir:
 *
 * - `503 FREELA_NOT_CONFIGURED` — falta uma das três variáveis de ambiente. O
 *   resto do Praça funciona normal; só `/v1/freela/*` e o modo `freela` param.
 * - `502 FREELA_ERROR` — o Freela respondeu e recusou. A mensagem é a **dele**
 *   ("audience inválido."), não uma nossa: quem lê a tela precisa saber o que
 *   arrumar no corpo.
 * - `502 FREELA_UNREACHABLE` — não deu para falar com ele (rede, DNS, 15 s).
 *
 * Lê `process.env` direto (e não o `ConfigService`) pelo mesmo motivo do
 * `CadenceScheduler`: o boot já validou as variáveis em
 * `common/config/env.validation.ts`, e assim o cliente é uma classe sem
 * dependências — o teste monta `new FreelaClient()` e mexe só no ambiente.
 */
import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  cadastroCriadoSchema,
  linkReemitidoSchema,
  listaCadastrosSchema,
  type CadastroCriado,
  type CadastroListado,
  type CorpoCadastroFreela,
  type FiltroListaCadastros,
  type LinkReemitido,
} from './freela-registrations';

/** Mesma frase em todo lugar que fala de conexão com o Freela ausente. */
export const FREELA_NOT_CONFIGURED_MESSAGE =
  'Conexão com o Freela não configurada (FREELA_API_URL, FREELA_ADMIN_EMAIL, FREELA_ADMIN_PASSWORD).';

/** Toda resposta do Freela vem envelopada em `{data, meta?}`. */
export interface FreelaEnvelope<T> {
  data: T;
  meta?: Record<string, unknown> | undefined;
}

/** Arquivo repassado ao Freela (upload de imagem das campanhas automáticas). */
export interface FreelaMultipart {
  field: string;
  filename: string;
  mimetype: string;
  buffer: Buffer;
}

export type FreelaMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Recusa do Freela com o status HTTP DELE. O corpo (o que a tela vê) continua
 * `{code: 'FREELA_ERROR', message}`; `freelaStatus` é o que deixa o Praça
 * distinguir "e-mail já usado" (409) de "sem permissão" (403) sem casar texto.
 */
export class FreelaHttpError extends BadGatewayException {
  constructor(
    readonly freelaStatus: number,
    message: string,
    /** SÓ `error.code` e `alreadyLinkedToThisConsultant` do Freela — o corpo inteiro nunca é guardado. */
    readonly freelaError: FreelaErrorInfo = {},
  ) {
    super({ code: 'FREELA_ERROR', message });
  }
}

export interface FreelaErrorInfo {
  code?: string | undefined;
  alreadyLinkedToThisConsultant?: boolean | undefined;
}

/** Tempo máximo de espera por resposta do Freela. */
const TIMEOUT_MS = 15_000;

const env = (k: string): string => (process.env[k] ?? '').trim();

@Injectable()
export class FreelaClient {
  private readonly log = new Logger(FreelaClient.name);
  /** `accessToken` do admin do Praça. Só existe em memória, some no restart. */
  private token: string | null = null;

  /** Base sem barra no fim — `FREELA_API_URL` pode vir com ou sem. */
  private baseUrl(): string {
    return env('FREELA_API_URL').replace(/\/+$/, '');
  }

  isConfigured(): boolean {
    return !!this.baseUrl() && !!env('FREELA_ADMIN_EMAIL') && !!env('FREELA_ADMIN_PASSWORD');
  }

  /** E-mail da conta de serviço — a tela de Conexão mostra qual conta é. */
  adminEmail(): string | null {
    return env('FREELA_ADMIN_EMAIL') || null;
  }

  /** §7.5: só manda `contacts[].message` se o Freela já aceitar o campo. */
  perContactMessage(): boolean {
    return env('FREELA_PER_CONTACT_MESSAGE') === 'true';
  }

  /** Trava do relógio de sincronização (`FREELA_SYNC_ENABLED`). */
  syncEnabled(): boolean {
    return env('FREELA_SYNC_ENABLED') === 'true';
  }

  /** Barra a chamada com 503 quando falta configuração. */
  ensureConfigured(): void {
    if (this.isConfigured()) return;
    throw new ServiceUnavailableException({
      code: 'FREELA_NOT_CONFIGURED',
      message: FREELA_NOT_CONFIGURED_MESSAGE,
    });
  }

  /**
   * Uma chamada ao Freela, já autenticada. `path` começa com `/`. O corpo vai
   * em JSON (camelCase, como o Freela fala) ou como `FormData` quando é
   * `multipart`.
   */
  async request<T = unknown>(
    method: FreelaMethod,
    path: string,
    body?: unknown,
    multipart?: FreelaMultipart,
  ): Promise<FreelaEnvelope<T>> {
    this.ensureConfigured();
    if (!this.token) await this.login();

    let res = await this.send(method, path, body, multipart);
    // 401 com token na mão = token velho. Uma tentativa a mais, nunca duas: se
    // a conta perdeu a permissão `REFERRALS`, insistir só multiplica o erro.
    if (res.status === 401) {
      this.token = null;
      await this.login();
      res = await this.send(method, path, body, multipart);
    }
    return this.parse<T>(res);
  }

  /** `POST /v1/admins/login` — guarda o `accessToken` em memória. */
  private async login(): Promise<void> {
    const res = await this.send(
      'POST',
      '/v1/admins/login',
      { email: env('FREELA_ADMIN_EMAIL'), password: env('FREELA_ADMIN_PASSWORD') },
      undefined,
      true,
    );
    const envelope = await this.parse<{ accessToken?: string }>(res);
    const token = envelope.data?.accessToken;
    if (!token) {
      throw new BadGatewayException({
        code: 'FREELA_ERROR',
        message: 'O Freela não devolveu o token de acesso no login.',
      });
    }
    this.token = token;
    this.log.log(`autenticado no Freela como ${this.adminEmail()}`);
  }

  /** `fetch` com timeout e cabeçalhos. Erro de rede vira `FREELA_UNREACHABLE`. */
  private async send(
    method: FreelaMethod,
    path: string,
    body?: unknown,
    multipart?: FreelaMultipart,
    isLogin = false,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (!isLogin && this.token) headers.Authorization = `Bearer ${this.token}`;

    let payload: BodyInit | undefined;
    if (multipart) {
      const form = new FormData();
      form.append(
        multipart.field,
        new Blob([new Uint8Array(multipart.buffer)], { type: multipart.mimetype }),
        multipart.filename,
      );
      // Sem `Content-Type` na mão: quem escreve o boundary é o próprio fetch.
      payload = form;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    try {
      return await fetch(`${this.baseUrl()}${path}`, {
        method,
        headers,
        ...(payload === undefined ? {} : { body: payload }),
        signal: controller.signal,
      });
    } catch (e) {
      const erro = e as { name?: string; message?: string };
      if (erro?.name === 'AbortError') {
        throw new BadGatewayException({
          code: 'FREELA_UNREACHABLE',
          message: 'O Freela não respondeu em 15 s.',
        });
      }
      throw new BadGatewayException({
        code: 'FREELA_UNREACHABLE',
        message: `Não foi possível falar com o Freela: ${erro?.message ?? 'erro de rede'}.`,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Corpo da resposta → `{data, meta}`; recusa vira `FREELA_ERROR`. */
  private async parse<T>(res: Response): Promise<FreelaEnvelope<T>> {
    const texto = await res.text();
    let corpo: Record<string, unknown> | null = null;
    let quebrado = false;
    if (texto.trim()) {
      try {
        corpo = JSON.parse(texto) as Record<string, unknown>;
      } catch {
        // HTML de proxy, corpo cortado: não é 500 nosso, é o Freela respondendo
        // o que não devia.
        quebrado = true;
      }
    }

    if (!res.ok) throw new FreelaHttpError(res.status, this.mensagem(corpo, res.status), this.infoDoErro(corpo));
    if (quebrado) {
      throw new BadGatewayException({
        code: 'FREELA_ERROR',
        message: 'O Freela respondeu num formato que não é JSON.',
      });
    }

    const meta = corpo?.meta;
    return {
      data: (corpo?.data ?? null) as T,
      ...(meta && typeof meta === 'object' ? { meta: meta as Record<string, unknown> } : {}),
    };
  }

  /** `error.code` e `error.alreadyLinkedToThisConsultant` (contrato do cadastro assistido); o resto do corpo é descartado. */
  private infoDoErro(corpo: Record<string, unknown> | null): FreelaErrorInfo {
    const erro = corpo?.error;
    if (!erro || typeof erro !== 'object') return {};
    const e = erro as { code?: unknown; alreadyLinkedToThisConsultant?: unknown };
    return {
      ...(typeof e.code === 'string' ? { code: e.code } : {}),
      ...(typeof e.alreadyLinkedToThisConsultant === 'boolean'
        ? { alreadyLinkedToThisConsultant: e.alreadyLinkedToThisConsultant }
        : {}),
    };
  }

  /**
   * Valida `dado` com zod. Falhou = `FREELA_ERROR` de mensagem FIXA: nem o corpo nem os
   * issues do zod (que ecoam valores) vão para a mensagem ou para o log — o corpo tem o link.
   */
  private validar<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }, dado: unknown): T {
    const r = schema.safeParse(dado);
    if (r.success) return r.data;
    throw new BadGatewayException({
      code: 'FREELA_ERROR',
      message: 'O Freela respondeu fora do formato esperado.',
    });
  }

  // ── cadastro assistido da empresa (§26) ─────────────────────────────

  /** `POST /v1/admins/consultants/:id/registrations`. `created:false` = replay (sem link). */
  async createCompanyRegistration(freelaConsultantId: string, corpo: CorpoCadastroFreela): Promise<CadastroCriado> {
    const r = await this.request('POST', `/v1/admins/consultants/${encodeURIComponent(freelaConsultantId)}/registrations`, corpo);
    return this.validar(cadastroCriadoSchema, r.data);
  }

  /** `POST …/registrations/:userId/reissue-link` — invalida o link anterior. */
  async reissueRegistrationLink(freelaConsultantId: string, userId: string, reason?: string): Promise<LinkReemitido> {
    const r = await this.request(
      'POST',
      `/v1/admins/consultants/${encodeURIComponent(freelaConsultantId)}/registrations/${encodeURIComponent(userId)}/reissue-link`,
      reason ? { reason } : {},
    );
    return this.validar(linkReemitidoSchema, r.data);
  }

  /** `GET …/registrations` (usada na F7). `nextCursor` vem em `meta`. */
  async listRegistrations(
    freelaConsultantId: string,
    filtro: FiltroListaCadastros = {},
  ): Promise<{ data: CadastroListado[]; nextCursor: string | null }> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filtro)) if (v !== undefined && v !== '') q.set(k, String(v));
    const qs = q.toString();
    const r = await this.request(
      'GET',
      `/v1/admins/consultants/${encodeURIComponent(freelaConsultantId)}/registrations${qs ? `?${qs}` : ''}`,
    );
    const nextCursor = (r.meta as { nextCursor?: unknown } | undefined)?.nextCursor;
    return this.validar(listaCadastrosSchema, { data: r.data, nextCursor: typeof nextCursor === 'string' ? nextCursor : null });
  }

  /** A mensagem do Freela: `error.message`, `message` ou o status HTTP. */
  private mensagem(corpo: Record<string, unknown> | null, status: number): string {
    const erro = corpo?.error as { message?: unknown } | undefined;
    if (erro && typeof erro.message === 'string' && erro.message.trim()) return erro.message;
    const direta = corpo?.message;
    if (typeof direta === 'string' && direta.trim()) return direta;
    if (Array.isArray(direta) && direta.length) return direta.join(' | ');
    return `O Freela respondeu HTTP ${status}.`;
  }
}
