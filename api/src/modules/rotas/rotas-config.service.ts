import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import {
  aplicarConfigAlertas,
  CHAVES_CONFIG_ALERTAS,
  lerConfigAlertas,
  type ConfigAlertas,
} from '../../domain/alerta-rules';
import {
  aplicarConfigCadastro,
  CHAVES_CONFIG_CADASTRO,
  lerConfigCadastro,
  type ConfigCadastro,
} from '../../domain/signup-sync-rules';
import { aplicarConfigRota, lerConfigRota, type ConfigRota } from '../../domain/rota-rules';
import {
  aplicarConfigModo,
  CHAVES_CONFIG_MODO,
  lerConfigModo,
  PRESETS_MODO,
  type ConfigModo,
} from '../../domain/modo-campo-rules';
import { CONFIG_CHECKIN, type ConfigCheckin } from '../../domain/campo-rules';
import { CONFIG_CHECKLIST, prepararItensChecklist, type ConfigChecklist } from '../../domain/checklist-rules';
import { CONFIG_INTERVALO, type ConfigIntervalo } from '../../domain/intervalo-rules';
import type { GrupoConfig } from '../../domain/config-grupo';
import { CONFIG_PAINEL, type ConfigPainel } from '../../domain/painel-rules';
import { CONFIG_RESUMO_DIA, type ConfigResumoDia } from '../../domain/resumo-dia-rules';
import { CONFIG_SHOPPING, type ConfigShopping } from '../../domain/shopping-rules';
import type { ConfigRotaDto } from './dto/rotas.dto';

/**
 * Grupos de chaves do restante da Lovable (contrato §23.1 e §33.2). Política comum: `null` no PUT vale como ausente (o web
 * reenvia o que recebeu, lição da S1) e só as chaves ENVIADAS são gravadas (ausente continua = padrão).
 */
const GRUPOS_NOVOS = [CONFIG_CHECKIN, CONFIG_RESUMO_DIA, CONFIG_PAINEL, CONFIG_CHECKLIST, CONFIG_INTERVALO] as unknown as GrupoConfig<object>[];
const ehChaveNova = (k: string) => GRUPOS_NOVOS.some((g) => g.tem(k));

export interface ConfigView
  extends ConfigRota,
    ConfigAlertas,
    ConfigCadastro,
    ConfigModo,
    ConfigCheckin,
    ConfigResumoDia,
    ConfigPainel,
    ConfigChecklist,
    ConfigIntervalo {
  /** Os dois botões de preset da tela (contrato §31.3): só preenchem o formulário. */
  presets: { completo: ConfigModo; chefe: ConfigModo };
  atualizado_por: string | null;
  atualizado_em: string | null;
}

const pick = <T extends object>(obj: T, so: Record<string, unknown>): Partial<T> =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => k in so)) as Partial<T>;

/** Parâmetros de negócio do roteiro em `app_settings.field_config` (contrato §23.1). */
@Injectable()
export class RotasConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private async bruto(): Promise<Record<string, unknown>> {
    const s = await this.prisma.app_settings.findUnique({ where: { id: 1 }, select: { field_config: true } });
    const v = s?.field_config;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  }

  /** Configuração válida (padrão onde faltar). Usada por quem monta roteiros. */
  async config(): Promise<ConfigRota> {
    return lerConfigRota(await this.bruto());
  }

  /** Limiares de "Atenção agora" e demais chaves da F5 (contrato §25.1). */
  async alertas(): Promise<ConfigAlertas> {
    return lerConfigAlertas(await this.bruto());
  }

  /** Regra de "cadastro confirmado" (contrato §27.4). */
  async cadastro(): Promise<ConfigCadastro> {
    return lerConfigCadastro(await this.bruto());
  }

  /** Fluxo da visita e parâmetros do modo do chefe (contrato §31.3). */
  async modo(): Promise<ConfigModo> {
    return lerConfigModo(await this.bruto());
  }

  /** Raio do check-in (contrato §23.1, L0). Sem flag: vale sempre (padrão 200 m = o de hoje). */
  async checkin(): Promise<ConfigCheckin> {
    return CONFIG_CHECKIN.ler(await this.bruto());
  }

  /** Resumo/nota do dia (contrato §33.2). */
  async resumoDia(): Promise<ConfigResumoDia> {
    return CONFIG_RESUMO_DIA.ler(await this.bruto());
  }

  /** Painel do gestor (contrato §33.2). */
  async painel(): Promise<ConfigPainel> {
    return CONFIG_PAINEL.ler(await this.bruto());
  }

  /** Checklist da visita (contrato §35.2): a foto do check-in usa a configuração do instante. */
  async checklist(): Promise<ConfigChecklist> {
    return CONFIG_CHECKLIST.ler(await this.bruto());
  }

  /** Intervalo da jornada (contrato §37.2). */
  async intervalo(): Promise<ConfigIntervalo> {
    return CONFIG_INTERVALO.ler(await this.bruto());
  }

  /** Shoppings (lote D, §40.2): grupo próprio em `field_config.shopping` (rota própria; o PUT daqui não o mexe). */
  async shopping(): Promise<ConfigShopping> {
    return CONFIG_SHOPPING.ler((await this.bruto()).shopping);
  }

  async view(): Promise<ConfigView> {
    const raw = await this.bruto();
    const novos = Object.assign({}, ...GRUPOS_NOVOS.map((g) => g.ler(raw))) as ConfigCheckin &
      ConfigResumoDia &
      ConfigPainel &
      ConfigChecklist &
      ConfigIntervalo;
    return {
      ...lerConfigRota(raw),
      ...lerConfigAlertas(raw),
      ...lerConfigCadastro(raw),
      ...lerConfigModo(raw),
      ...novos,
      presets: PRESETS_MODO,
      atualizado_por: typeof raw.atualizado_por === 'string' ? raw.atualizado_por : null,
      atualizado_em: typeof raw.atualizado_em === 'string' ? raw.atualizado_em : null,
    };
  }

  async atualizar(dto: ConfigRotaDto, user: AuthUser, agora = new Date()): Promise<ConfigView> {
    const raw = await this.bruto();
    const parcial = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
    // Checklist (§35.2): etapa nova ganha `id` do servidor (estável) antes da validação do grupo.
    if (parcial.checklist_items != null) {
      const prep = prepararItensChecklist(parcial.checklist_items, () => `etapa_${randomUUID().replace(/-/g, '').slice(0, 8)}`);
      if (!prep.ok) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: prep.erro });
      parcial.checklist_items = prep.itens;
    }
    const chavesAlerta = new Set<string>(CHAVES_CONFIG_ALERTAS);
    const doAlerta = Object.fromEntries(Object.entries(parcial).filter(([k]) => chavesAlerta.has(k)));
    const chavesCadastro = new Set<string>(CHAVES_CONFIG_CADASTRO);
    const doCadastro = Object.fromEntries(Object.entries(parcial).filter(([k]) => chavesCadastro.has(k)));
    const chavesModo = new Set<string>(CHAVES_CONFIG_MODO);
    // `null` nas chaves de alerta de divergência (S3) vale como ausente: o web reenvia o que recebeu (lição da S1).
    const nuloVaiComoAusente = new Set(['divergencia_alerta_min', 'divergencia_alerta_pct']);
    const doModo = Object.fromEntries(
      Object.entries(parcial).filter(([k, v]) => chavesModo.has(k) && !(v === null && nuloVaiComoAusente.has(k))),
    );
    const daRota = Object.fromEntries(
      Object.entries(parcial).filter(([k]) => !chavesAlerta.has(k) && !chavesCadastro.has(k) && !chavesModo.has(k) && !ehChaveNova(k)),
    );
    const gravarNovos: Record<string, unknown> = {};
    for (const g of GRUPOS_NOVOS) {
      const doGrupo = Object.fromEntries(Object.entries(parcial).filter(([k, v]) => g.tem(k) && v !== null));
      if (Object.keys(doGrupo).length === 0) continue;
      const n = g.aplicar(g.ler(raw), doGrupo);
      if (!n.ok) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: n.erro });
      Object.assign(gravarNovos, pick(n.config, doGrupo));
    }
    const r = aplicarConfigRota(lerConfigRota(raw), daRota);
    if (!r.ok) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: r.erro });
    const a = aplicarConfigAlertas(lerConfigAlertas(raw), doAlerta);
    if (!a.ok) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: a.erro });
    const c = aplicarConfigCadastro(lerConfigCadastro(raw), doCadastro);
    if (!c.ok) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: c.erro });
    const m = aplicarConfigModo(lerConfigModo(raw), doModo);
    if (!m.ok) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: m.erro });
    // Preserva as chaves de outras fases que já estejam no JSON. As do modo só entram quando o PUT as traz:
    // gravar o padrão em toda chave faria "chave ausente" (fluxo_visita) virar escolha da equipe sem querer.
    const novo = { ...raw, ...r.config, ...a.config, ...c.config, ...pick(m.config, doModo), ...gravarNovos, atualizado_por: user.id, atualizado_em: agora.toISOString() };
    await this.prisma.app_settings.upsert({
      where: { id: 1 },
      update: { field_config: novo as Prisma.InputJsonValue },
      create: { id: 1, field_config: novo as Prisma.InputJsonValue },
    });
    return this.view();
  }
}
