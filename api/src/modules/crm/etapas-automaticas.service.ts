/**
 * CRM automático — etapa automática por fato do Freela (arquitetura §2.4, contrato §47.2).
 *
 * `subir()` é a ÚNICA função que move um lead para a frente por um fato do Freela (A2 e A3):
 * - a guarda atômica vive no `where` do `updateMany` (achados 4/5): só para a frente, nunca arquivado/teste, etapa 8 só com
 *   fato do dia de entrada em "Perdido" ou depois, e só se a marca `auto_stage_applied` ainda não cobre o alvo (quem voltou
 *   o cartão para trás vence: cada fato move o lead uma vez só);
 * - sair da 8 limpa `lost_reason` e `reheat_at` (sem isso o lead cairia na trilha de reaquecimento);
 * - o evento vai na MESMA transação, com `auto_key` e `ON CONFLICT DO NOTHING` (rodada repetida ou duas instâncias não duplicam).
 *
 * `passadaCadastros()` é o A2: uma passada local sobre `field_signups`. O sync dos cadastros (`campo/signup-sync.service.ts`)
 * não muda; a passada só acrescenta o que ele não faz: a etapa 6 pelo primeiro serviço concluído, a saída do 8, a marca, a
 * anotação da primeira vaga e o `leads.freela_user_id` quando o vínculo é único. Chave desligada = nenhuma leitura.
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CRM_FLAGS, type FlagsCrm } from '../../common/flags/crm.flags';
import { todaySp } from '../../common/time/dates';
import { AUTOR_AUTOMATICO_FREELA } from '../../domain/catalog/crm';
import { FUNNEL_STAGES } from '../../domain/catalog/funnel';
import { alvoDoCadastro, deveAplicar, type DecisaoEtapa } from '../../domain/crm-etapas-rules';
import { classificar, diaBrasilia, type RegraConfirmacao } from '../../domain/signup-sync-rules';
import { RotasConfigService } from '../rotas/rotas-config.service';
import { erroDaRodada, registrarRodada } from './rodadas';

type Tx = Prisma.TransactionClient;

export interface SubirEtapa {
  lead_id: string;
  alvo: 5 | 6 | 7;
  /**
   * Dia de Brasília do fato que justifica o alvo ("YYYY-MM-DD"); decide a saída da etapa 8. Fato sem dia conhecido = um dia anterior
   * a qualquer `stage_since` (o `'0000-00-00'` da A3): nunca tira de Perdido.
   */
  fato_dia: string;
  autor_label: string;
  /** O fato, numa frase; a função acrescenta "Etapa: de → para." com a etapa lida dentro da transação. */
  texto: string;
  auto_key: string;
  agora: Date;
}

export interface ResumoEtapasCadastro {
  vistos: number;
  subiram: Record<'5' | '6', number>;
  vagas: number;
}

const ETAPA_PERDIDO = 8;
/** `IN` em pedaços (achado 14). */
const LOTE = 500;
const TEXTO_REGRA: Record<RegraConfirmacao, string> = {
  activated: 'primeiro acesso',
  first_vacancy: 'primeira vaga',
  first_job_completed: 'primeiro serviço concluído',
};

export const nomeEtapa = (n: number): string => FUNNEL_STAGES.find((s) => s.n === n)?.name ?? String(n);
const diaMes = (dia: string): string => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
/** A marca do automático ainda não cobre o alvo (NULL nunca casa com `lt` no SQL, daí o OR). */
const marcaNaoCobre = (alvo: number): Prisma.leadsWhereInput[] => [{ auto_stage_applied: null }, { auto_stage_applied: { lt: alvo } }];
const chaveVaga = (signupId: string): string => `a2:vaga1:${signupId}`;

export type EventoAuto = Prisma.lead_eventsCreateManyInput & { auto_key: string };

/**
 * Evento do automático com `auto_key`, por `INSERT … ON CONFLICT DO NOTHING` (`skipDuplicates`): `true` = gravou; `false` = a
 * chave já existia (rodada repetida ou outra instância). Nunca um `create` com `catch` do P2002: no Postgres o INSERT que falha
 * ABORTA a transação (o que vem depois falha e o COMMIT vira ROLLBACK). Usado pela A2, pela A3 e pela A4.
 */
export async function criarEventoAuto(tx: Tx, data: EventoAuto): Promise<boolean> {
  const r = await tx.lead_events.createMany({ data: [data], skipDuplicates: true });
  return r.count === 1;
}

export interface LeadLido {
  stage: number;
  stage_since: string;
  archived: boolean;
  is_test: boolean;
  auto_stage_applied: number | null;
}

/** Há escrita a fazer? Mesma decisão do `subir`, sobre a leitura de fora da transação (evita abrir transação à toa). A2 e A3. */
export function precisaEtapa(lead: LeadLido, alvo: 5 | 6 | 7, fatoDia: string): boolean {
  const d = deveAplicar(lead, alvo, fatoDia);
  return d === 'aplicar' || (d === 'ja_satisfeito' && (lead.auto_stage_applied ?? 0) < alvo);
}

/**
 * `freela_user_id` por lead, só quando o vínculo é único nos DOIS sentidos: o lead tem um usuário do Freela só, e esse
 * usuário aponta para esse lead só (o UNIQUE de `field_signups` é por consultor: dois representantes podem ligar a mesma
 * empresa a leads diferentes). Conta também os leads arquivados (mais restritivo).
 */
function vinculosUnicos(linhas: Array<{ lead_id: string | null; freela_user_id: string }>): Map<string, string> {
  const porLead = new Map<string, Set<string>>();
  const porUsuario = new Map<string, Set<string>>();
  for (const s of linhas) {
    if (!s.lead_id) continue;
    if (!porLead.has(s.lead_id)) porLead.set(s.lead_id, new Set());
    porLead.get(s.lead_id)!.add(s.freela_user_id);
    if (!porUsuario.has(s.freela_user_id)) porUsuario.set(s.freela_user_id, new Set());
    porUsuario.get(s.freela_user_id)!.add(s.lead_id);
  }
  const out = new Map<string, string>();
  for (const [leadId, usuarios] of porLead) {
    if (usuarios.size !== 1) continue;
    const [u] = [...usuarios] as [string];
    if (porUsuario.get(u)!.size === 1) out.set(leadId, u);
  }
  return out;
}

@Injectable()
export class EtapasAutomaticasService {
  private readonly log = new Logger(EtapasAutomaticasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: RotasConfigService,
    @Optional() @Inject(CRM_FLAGS) private readonly crm?: FlagsCrm,
  ) {}

  /**
   * Move o lead para `alvo` se a guarda deixar, na transação de quem chama. Devolve a decisão:
   * `aplicar` = moveu (e gravou o evento); `ja_satisfeito` = já estava na etapa (grava só a marca); `ignorar` = nada.
   */
  async subir(tx: Tx, a: SubirEtapa): Promise<DecisaoEtapa> {
    const lead = await tx.leads.findUnique({
      where: { id: a.lead_id },
      select: { stage: true, stage_since: true, archived: true, is_test: true, auto_stage_applied: true },
    });
    if (!lead) return 'ignorar';
    const decisao = deveAplicar(lead, a.alvo, a.fato_dia);
    if (decisao === 'ignorar') return 'ignorar';
    if (decisao === 'aplicar') {
      const r = await tx.leads.updateMany({
        where: {
          id: a.lead_id,
          archived: false,
          is_test: false,
          OR: [{ stage: { lt: a.alvo } }, { stage: ETAPA_PERDIDO, stage_since: { lte: a.fato_dia } }],
          AND: [{ OR: marcaNaoCobre(a.alvo) }],
        },
        data: { stage: a.alvo, stage_since: todaySp(a.agora), lost_reason: null, reheat_at: null, auto_stage_applied: a.alvo },
      });
      if (r.count === 1) {
        await criarEventoAuto(tx, {
          lead_id: a.lead_id,
          at: a.agora,
          kind: 'stage',
          author_label: a.autor_label,
          stage_to: a.alvo,
          text: `${a.texto} Etapa: ${nomeEtapa(lead.stage)} → ${nomeEtapa(a.alvo)}.`,
          auto_key: a.auto_key,
        });
        return 'aplicar';
      }
      // Mudou entre a leitura e a escrita (arquivado, movido por alguém): só a marca, se ainda couber.
    } else if ((lead.auto_stage_applied ?? 0) >= a.alvo) {
      return 'ja_satisfeito';
    }
    // "Visto satisfeito": o lead já está na etapa (ou além, fora do 8); a marca impede brigar com quem o voltar depois.
    const v = await tx.leads.updateMany({
      where: { id: a.lead_id, archived: false, is_test: false, stage: { gte: a.alvo, not: ETAPA_PERDIDO }, OR: marcaNaoCobre(a.alvo) },
      data: { auto_stage_applied: a.alvo },
    });
    return v.count === 1 ? 'ja_satisfeito' : 'ignorar';
  }

  /** A2: uma rodada sobre os cadastros vinculados. Grava UMA linha em `crm_automation_runs` (`etapas_cadastro`). */
  async passadaCadastros(agora: Date): Promise<ResumoEtapasCadastro> {
    const r: ResumoEtapasCadastro = { vistos: 0, subiram: { '5': 0, '6': 0 }, vagas: 0 };
    if (!this.crm?.auto_stages) return r;
    const extra = { vinculados: 0, erros: 0 };
    let primeiroErro: unknown = null;
    const resumo = () => ({ vistos: r.vistos, subiram: { ...r.subiram }, vagas: r.vagas, ...extra });
    try {
      const regra = (await this.config.cadastro()).confirmation_rule;
      const linhas = await this.prisma.field_signups.findMany({
        where: { match_status: 'linked', lead_id: { not: null } },
        select: {
          id: true,
          freela_user_id: true,
          lead_id: true,
          activated_at: true,
          first_vacancy_at: true,
          first_vacancy_day: true,
          first_job_completed_at: true,
          lead: { select: { stage: true, stage_since: true, archived: true, is_test: true, auto_stage_applied: true, freela_user_id: true } },
        },
        orderBy: { id: 'asc' },
      });
      const unicos = vinculosUnicos(linhas);
      const grupos = new Map<string, typeof linhas>();
      for (const s of linhas) {
        if (!s.lead_id || !s.lead || s.lead.archived || s.lead.is_test) continue;
        if (!grupos.has(s.lead_id)) grupos.set(s.lead_id, []);
        grupos.get(s.lead_id)!.push(s);
      }
      const anotadas = await this.chavesExistentes(
        [...grupos.values()].flat().filter((s) => s.first_vacancy_at).map((s) => chaveVaga(s.id)),
      );

      for (const leadId of [...grupos.keys()].sort()) {
        const cadastros = grupos.get(leadId)!;
        const lead = cadastros[0]!.lead!;
        r.vistos += cadastros.length;

        // Alvo do lead: o maior entre os cadastros; empate = o fato mais recente.
        let melhor: ReturnType<typeof alvoDoCadastro> = null;
        for (const s of cadastros) {
          const a = alvoDoCadastro({ confirmado_em: classificar(s, regra).em, first_job_completed_at: s.first_job_completed_at });
          if (a && (!melhor || a.alvo > melhor.alvo || (a.alvo === melhor.alvo && a.fato > melhor.fato))) melhor = a;
        }
        const etapa = melhor && precisaEtapa(lead, melhor.alvo, diaBrasilia(melhor.fato)) ? melhor : null;
        const vinculo = lead.freela_user_id === null ? unicos.get(leadId) : undefined;
        const vagas = cadastros.filter((s) => s.first_vacancy_at && !anotadas.has(chaveVaga(s.id)));
        if (!etapa && !vinculo && vagas.length === 0) continue;

        try {
          const out = await this.prisma.$transaction(async (tx) => {
            let decisao: DecisaoEtapa = 'ignorar';
            if (etapa) {
              const fatoDia = diaBrasilia(etapa.fato);
              decisao = await this.subir(tx, {
                lead_id: leadId,
                alvo: etapa.alvo,
                fato_dia: fatoDia,
                autor_label: AUTOR_AUTOMATICO_FREELA,
                texto:
                  etapa.motivo === 'servico'
                    ? `Primeiro serviço concluído no Freela em ${diaMes(fatoDia)}.`
                    : `Cadastro confirmado no Freela (${TEXTO_REGRA[regra]}, ${diaMes(fatoDia)}).`,
                auto_key: `a2:etapa:${leadId}:${etapa.alvo}`,
                agora,
              });
            }
            let vinculou = false;
            if (vinculo) {
              const v = await tx.leads.updateMany({
                where: { id: leadId, freela_user_id: null, archived: false, is_test: false },
                data: { freela_user_id: vinculo },
              });
              vinculou = v.count === 1;
            }
            let novas = 0;
            for (const s of vagas) {
              const dia = s.first_vacancy_day ?? diaBrasilia(s.first_vacancy_at!);
              const criada = await criarEventoAuto(tx, {
                lead_id: leadId,
                at: agora,
                kind: 'note',
                author_label: AUTOR_AUTOMATICO_FREELA,
                text: `Publicou a primeira vaga no Freela em ${diaMes(dia)}`,
                auto_key: chaveVaga(s.id),
              });
              if (criada) novas++;
            }
            return { decisao, vinculou, novas };
          });
          if (etapa && out.decisao === 'aplicar') r.subiram[String(etapa.alvo) as '5' | '6']++;
          if (out.vinculou) extra.vinculados++;
          r.vagas += out.novas;
        } catch (e) {
          // Um lead com problema não para a rodada; o erro (saneado) vai para a linha da rodada.
          extra.erros++;
          primeiroErro ??= e;
          this.log.warn(`lead ${leadId}: etapa automática falhou (${erroDaRodada(e)})`);
        }
      }
    } catch (e) {
      // A gravação da rodada tem o seu próprio `catch`: se ela falhar também, sobe o erro ORIGINAL.
      try {
        await registrarRodada(this.prisma, { job: 'etapas_cadastro', started_at: agora, ok: false, summary: resumo(), error: erroDaRodada(e) });
      } catch (e2) {
        this.log.error(`A2: rodada não gravada: ${erroDaRodada(e2)}`);
      }
      throw e;
    }
    await registrarRodada(this.prisma, {
      job: 'etapas_cadastro',
      started_at: agora,
      ok: extra.erros === 0,
      summary: resumo(),
      ...(primeiroErro ? { error: erroDaRodada(primeiroErro) } : {}),
    });
    return r;
  }

  /** Quais destas `auto_key` já existem (uma consulta por lote): a rodada não abre transação para anotação já feita. */
  private async chavesExistentes(chaves: string[]): Promise<Set<string>> {
    const out = new Set<string>();
    for (let i = 0; i < chaves.length; i += LOTE) {
      const r = await this.prisma.lead_events.findMany({ where: { auto_key: { in: chaves.slice(i, i + LOTE) } }, select: { auto_key: true } });
      for (const e of r) if (e.auto_key) out.add(e.auto_key);
    }
    return out;
  }
}
