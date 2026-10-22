'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AvisoGps } from '@/components/campo/AvisoGps';
import { CampoTopo } from '@/components/campo/CampoTopo';
import { ChecklistVisita } from '@/components/campo/ChecklistVisita';
import { Cronometro } from '@/components/campo/Cronometro';
import { FaixaFila } from '@/components/campo/FaixaFila';
import { Chip, Grupo } from '@/components/campo/simples/Chip';
import { MaisDetalhes, ContatoCampos } from '@/components/campo/simples/MaisDetalhes';
import { Input } from '@/components/ui/input';
import { addDays, todaySp } from '@/lib/dates';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { useCampoMe, useDia } from '@/modules/campo/application/use-campo';
import { useChecklist } from '@/modules/campo/application/use-checklist';
import { desfazerCheckout, descartarEnvio, enfileirar, useFilaStore } from '@/modules/campo/application/use-fila';
import { useFluxo } from '@/modules/campo/application/use-fluxo';
import { useFotoUrl } from '@/modules/campo/application/use-foto-url';
import { useSol } from '@/modules/campo/application/use-sol';
import { irPara } from '@/modules/campo/application/use-tela';
import type { VisitAnswers } from '@/modules/campo/domain/campo.types';
import { checklistDaTela, pendenciasChecklist, type ChecklistTela } from '@/modules/campo/domain/checklist';
import {
  faltandoSimples,
  frasePendencia,
  HORAS_RETORNO,
  OPCOES_QUANDO,
  rascunhoSimples,
  RESULTADOS_SIMPLES,
  ROTULO_RESULTADO,
  textoConcluir,
  type ResultadoSimples,
} from '@/modules/campo/domain/fluxo';
import { seqsParaDescartar } from '@/modules/campo/domain/fila-politica';
import { hora } from '@/modules/campo/domain/formatos';
import type { MotivoGps } from '@/modules/campo/domain/gps-mensagens';
import { RESPOSTAS_VAZIAS } from '@/modules/campo/domain/questionario';
import { MOTIVOS_RECUSA_SIMPLES, rotuloMotivoRecusa } from '@/modules/campo/domain/recusa';
import { campoCancelarVisita } from '@/modules/campo/infrastructure/campo.api';
import { ErroGps, lerPosicao } from '@/modules/campo/infrastructure/gps';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

const ESPERA_RASCUNHO_MS = 800;
const CHIPS_DISTANCIA = ['O endereço está errado', 'Estou na porta mesmo'];

/**
 * Resultado da visita do fluxo SIMPLES (UX §2.2 S2): "Como foi a visita?" em 1 chip, sub-escolha no mesmo lugar,
 * "Mais detalhes" opcional (as 8 perguntas antigas, todas preservadas) e "Concluir" fixo com Desfazer de alguns segundos.
 */
export function ResultadoTela({ refVisita }: { refVisita: string }) {
  const consultantId = useCampoSession((s) => s.session?.consultant.id ?? '');
  const { config } = useFluxo();
  const { dia, hoje, carregando } = useDia(config.fechado_conta_na_meta);
  const me = useCampoMe();
  const itens = useFilaStore((s) => s.itens);
  const foto = useFotoUrl(refVisita);
  const { sol } = useSol();
  const qc = useQueryClient();
  const [gps, setGps] = useState<MotivoGps | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const local = dia.visitas.find((v) => v.ref === refVisita) ?? null;
  const doServidor = hoje?.visits.find((v) => v.client_id === refVisita) ?? null;
  const rascunhoNaFila = [...itens].reverse().find((i) => i.kind === 'answers' && i.visit_ref === refVisita);
  const inicial: VisitAnswers = (rascunhoNaFila?.kind === 'answers' ? rascunhoNaFila.payload : null) ?? doServidor?.answers ?? RESPOSTAS_VAZIAS;
  const checkoutBloqueado = itens.find((i) => i.kind === 'checkout' && i.visit_ref === refVisita && i.bloqueio);
  const cadastroLigado = me.data?.features?.company_signup === true;

  const [respostas, setRespostas] = useState<VisitAnswers | null>(null);
  const atual = respostas ?? inicial;
  const resultado = (RESULTADOS_SIMPLES as readonly string[]).includes(atual.result ?? '') ? (atual.result as ResultadoSimples) : null;
  const longe = doServidor?.far_from_place === true;
  // Lote B §35: roteiro da conversa (só com a flag; não obrigatório por padrão = nenhum toque a mais).
  const ck = useChecklist({ flow: 'simples', naServidor: !!doServidor, foto: doServidor?.checklist, respostas: atual });
  const falta = [...faltandoSimples(atual, todaySp(), config, { far_from_place: longe }), ...pendenciasChecklist(ck.checklist)];

  const pendente = useRef<VisitAnswers | null>(null);
  const relogio = useRef<number | null>(null);
  const consultor = useRef(consultantId);
  consultor.current = consultantId;
  const cfgRef = useRef<{ config: typeof config; longe: boolean; checklist: ChecklistTela | null }>({ config, longe, checklist: ck.checklist });
  cfgRef.current = { config, longe, checklist: ck.checklist };

  const guardar = useCallback(async () => {
    if (relogio.current !== null) {
      window.clearTimeout(relogio.current);
      relogio.current = null;
    }
    const r = pendente.current;
    if (!r) return;
    pendente.current = null;
    // O checklist entra na conta do "completo" só quando existe (com as marcas DESTE rascunho).
    const lista = cfgRef.current.checklist;
    const pendCk = lista ? pendenciasChecklist(checklistDaTela({ ligado: true, flow: 'simples', naServidor: true, foto: { ...lista, done: 0, total: lista.items.length }, marcas: r.checklist ?? null })) : [];
    const completo = faltandoSimples(r, todaySp(), cfgRef.current.config, { far_from_place: cfgRef.current.longe }).length === 0 && pendCk.length === 0;
    await enfileirar({ kind: 'answers', visit_ref: refVisita, payload: rascunhoSimples(r) }, consultor.current, { completo });
  }, [refVisita]);

  useEffect(() => {
    const aoEsconder = () => {
      if (document.visibilityState === 'hidden') void guardar();
    };
    document.addEventListener('visibilitychange', aoEsconder);
    return () => {
      document.removeEventListener('visibilitychange', aoEsconder);
      void guardar();
    };
  }, [guardar]);

  function mudar(r: VisitAnswers) {
    pendente.current = r;
    setRespostas(r);
    if (relogio.current !== null) window.clearTimeout(relogio.current);
    relogio.current = window.setTimeout(() => void guardar(), ESPERA_RASCUNHO_MS);
  }
  const set = (p: Partial<VisitAnswers>) => mudar({ ...atual, ...p });

  function escolher(r: ResultadoSimples) {
    if (r === atual.result) return;
    // Trocar de resultado limpa a sub-escolha do anterior (valor errado vira dado falso).
    set({ result: r, refusal_reason: null, refusal_note: null, followup_date: null, followup_time: null });
  }

  const fechada = !!local?.checkout_at || !!local?.auto_closed;
  const [escolhendoDia, setEscolhendoDia] = useState(false);
  const hojeDia = todaySp();

  async function concluir() {
    setGps(null);
    setOcupado(true);
    try {
      await guardar();
      const p = await lerPosicao();
      const seg = config.desfazer_segundos;
      await enfileirar({ kind: 'checkout', visit_ref: refVisita, payload: p }, consultantId, { segurarMs: seg * 1000 });
      const nome = local?.nome ?? 'visita';
      if (seg > 0) {
        toast(`Visita concluída: ${nome}.`, {
          duration: seg * 1000,
          action: {
            label: 'Desfazer',
            onClick: () =>
              void desfazerCheckout(refVisita, consultantId).then((ok) => {
                if (ok) irPara({ v: 'visita', ref: refVisita });
                else toast('Essa visita já foi enviada.');
              }),
          },
        });
      } else toast.success(`Visita concluída: ${nome}.`);
      irPara({ v: 'hoje' }, 'replace');
    } catch (e) {
      if (e instanceof ErroGps) setGps(e.motivo);
      else toast.error('Não foi possível guardar a conclusão neste aparelho.');
    } finally {
      setOcupado(false);
    }
  }

  async function salvarCorrecoes() {
    setOcupado(true);
    try {
      if (!pendente.current) pendente.current = atual;
      await guardar();
      toast.success('Correções salvas. A conclusão será enviada de novo.');
    } catch {
      toast.error('Não foi possível guardar as correções neste aparelho.');
    } finally {
      setOcupado(false);
    }
  }

  /** Cancelar a visita aberta por engano (contrato §31.7): ainda na fila = sai da fila; já enviada = apaga no servidor. */
  async function cancelar() {
    if (!window.confirm('Cancelar esta visita? A foto e a chegada serão apagadas.')) return;
    setOcupado(true);
    try {
      pendente.current = null;
      const checkin = itens.find((i) => i.kind === 'checkin' && i.payload.client_id === refVisita);
      if (checkin) {
        await descartarEnvio(seqsParaDescartar(itens, checkin));
      } else {
        try {
          await campoCancelarVisita(refVisita);
        } catch (e) {
          if (!(axios.isAxiosError(e) && e.response?.status === 404)) throw e; // 404 = já não existe
        }
        await Promise.all([qc.refetchQueries({ queryKey: ['campo', 'today'] }), qc.refetchQueries({ queryKey: ['campo', 'route'] })]);
      }
      irPara({ v: 'hoje' }, 'replace');
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Não foi possível cancelar agora. Tente com sinal.'));
    } finally {
      setOcupado(false);
    }
  }

  if (carregando) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!local) {
    return (
      <main className="space-y-4">
        <CampoTopo titulo="Visita" />
        <p className="card-surface p-5 text-sm">Visita não encontrada neste aparelho.</p>
        <button type="button" onClick={() => irPara({ v: 'hoje' })} className="flex h-12 w-full items-center justify-center rounded-md border border-border text-sm font-bold">
          Voltar
        </button>
      </main>
    );
  }

  const contatoObrigatorio = resultado !== null && (config.contato_obrigatorio_em as string[]).includes(resultado);
  const frase = frasePendencia(falta);

  return (
    <main data-sol={sol} className="space-y-5 pb-40">
      <CampoTopo titulo={local.nome} />
      <FaixaFila />
      {gps && <AvisoGps motivo={gps} onFechar={() => setGps(null)} />}
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => irPara({ v: 'hoje' })} className="min-h-12 text-sm font-bold text-primary">
          ← Voltar
        </button>
        {!fechada && (
          <button type="button" disabled={ocupado} onClick={() => void cancelar()} className="min-h-12 text-sm text-muted-foreground underline">
            Cancelar visita
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- blob: local, next/image não serve */}
        {foto && <img src={foto} alt="Foto da fachada" className="h-16 w-16 rounded-md object-cover" />}
        <p className="text-sm text-muted-foreground">
          ✓ Chegada registrada · {hora(local.checkin_at)}
          {local.auto_closed ? ' · fechada sem conclusão' : ''}
          {ck.ligado && !fechada && (
            <>
              {' · '}
              <Cronometro desde={local.checkin_at} />
            </>
          )}
        </p>
      </div>

      {longe && config.justificativa_distancia !== 'nao' && (
        <section className="card-surface space-y-2 p-3" aria-label="Distância do local">
          <p className="text-sm">
            Você está a {doServidor?.distance_m ?? '—'} m do endereço.
            {config.justificativa_distancia === 'obrigatoria' ? ' Diga o motivo para concluir.' : ' Se quiser, diga o motivo.'}
          </p>
          <Grupo rotulo="Motivo da distância">
            {CHIPS_DISTANCIA.map((c) => (
              <Chip key={c} ativo={atual.distance_note === c} desabilitado={fechada} onEscolher={() => set({ distance_note: c })}>
                {c}
              </Chip>
            ))}
          </Grupo>
          <Input
            aria-label="Outro motivo"
            placeholder="Outro motivo"
            maxLength={200}
            disabled={fechada}
            value={CHIPS_DISTANCIA.includes(atual.distance_note ?? '') ? '' : (atual.distance_note ?? '')}
            onChange={(e) => set({ distance_note: e.target.value || null })}
            className="h-12"
          />
        </section>
      )}

      {ck.checklist && (
        <ChecklistVisita checklist={ck.checklist} abertoInicial={ck.abertoInicial} desabilitado={fechada} onMarcas={(m) => set({ checklist: m })} />
      )}

      <section id="como-foi" className="space-y-3">
        <h2 className="text-[22px] font-black">Como foi a visita?</h2>
        <Grupo rotulo="Resultado da visita">
          {RESULTADOS_SIMPLES.map((r) => (
            <Chip key={r} ativo={resultado === r} desabilitado={fechada || ocupado} onEscolher={() => escolher(r)} className={r === 'fechado' ? 'col-span-2' : ''}>
              {ROTULO_RESULTADO[r]}
            </Chip>
          ))}
        </Grupo>
      </section>

      <div aria-live="polite" className="space-y-4">
        {resultado === 'sem_interesse' && (
          <section className="space-y-2">
            <h3 className="text-base font-bold">Por quê?</h3>
            <Grupo rotulo="Motivo">
              {MOTIVOS_RECUSA_SIMPLES.map((m) => (
                <Chip key={m.key} ativo={atual.refusal_reason === m.key} desabilitado={fechada} onEscolher={() => set({ refusal_reason: m.key, refusal_note: m.key === 'outro' ? atual.refusal_note ?? null : null })}>
                  {m.label}
                </Chip>
              ))}
            </Grupo>
            {atual.refusal_reason === 'outro' && (
              <Input aria-label="Qual o motivo?" placeholder="Qual o motivo? (opcional)" maxLength={120} value={atual.refusal_note ?? ''} disabled={fechada} onChange={(e) => set({ refusal_note: e.target.value || null })} className="h-12" />
            )}
          </section>
        )}

        {resultado === 'retorno' && (
          <section className="space-y-2">
            <h3 className="text-base font-bold">Quando?</h3>
            <Grupo rotulo="Quando voltar">
              {OPCOES_QUANDO.map((o) => {
                const data = o.dias === null ? null : addDays(hojeDia, o.dias);
                const ativo = o.dias === null ? escolhendoDia : !escolhendoDia && atual.followup_date === data;
                return (
                  <Chip
                    key={o.id}
                    ativo={ativo}
                    desabilitado={fechada}
                    onEscolher={() => {
                      if (o.dias === null) {
                        setEscolhendoDia(true);
                        set({ followup_date: null, followup_time: null });
                      } else {
                        setEscolhendoDia(false);
                        set({ followup_date: data, followup_time: o.hora ?? null });
                      }
                    }}
                  >
                    {o.rotulo}
                  </Chip>
                );
              })}
            </Grupo>
            {escolhendoDia && (
              <Input type="date" aria-label="Dia do retorno" min={hojeDia} value={atual.followup_date ?? ''} disabled={fechada} onChange={(e) => set({ followup_date: e.target.value || null })} className="h-12" />
            )}
            <p className="text-sm text-muted-foreground">Hora (opcional)</p>
            <Grupo rotulo="Hora do retorno">
              {HORAS_RETORNO.map(([h, rotulo]) => (
                <Chip key={h} ativo={atual.followup_time === h} desabilitado={fechada} onEscolher={() => set({ followup_time: atual.followup_time === h ? null : h })}>
                  {rotulo}
                </Chip>
              ))}
            </Grupo>
          </section>
        )}

        {resultado === 'cadastrou' && (
          <section className="card-surface space-y-2 p-4">
            <h3 className="text-base font-bold">Dar acesso ao Freela</h3>
            <button type="button" onClick={() => irPara({ v: 'qr' })} className="flex h-14 w-full items-center justify-center rounded-md border border-primary text-base font-bold">
              Mostrar o QR
            </button>
            {cadastroLigado && (
              <button type="button" onClick={() => irPara({ v: 'cadastro', ref: refVisita })} className="flex h-14 w-full items-center justify-center rounded-md border border-primary text-base font-bold">
                Cadastrar por ele
              </button>
            )}
            <p className="text-sm text-muted-foreground">O Freela confirma depois. Só então conta nos ganhos.</p>
          </section>
        )}

        {contatoObrigatorio && (
          <section className="space-y-2">
            <h3 className="text-base font-bold">Quem atendeu</h3>
            <ContatoCampos valor={atual} onMudar={set} desabilitado={fechada} campos={config.contato_campos} />
          </section>
        )}
      </div>

      <MaisDetalhes valor={atual} canais={me.data?.channels ?? []} onMudar={set} desabilitado={fechada} contatoFora={contatoObrigatorio} />

      {checkoutBloqueado?.kind === 'checkout' && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
          A conclusão foi recusada: {checkoutBloqueado.bloqueio}
        </p>
      )}

      {!fechada && (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto max-w-md space-y-2">
            {frase &&
              (ck.checklist && falta[0] === 'resultado da visita' ? (
                // Com o roteiro aberto os chips descem: a frase vira atalho para eles (UX §3.5).
                <button
                  type="button"
                  onClick={() => {
                    const alvo = document.getElementById('como-foi');
                    alvo?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    alvo?.querySelector<HTMLButtonElement>('[role="radio"]')?.focus({ preventScroll: true });
                  }}
                  className="mx-auto block min-h-12 text-center text-sm text-muted-foreground underline underline-offset-4"
                >
                  {frase}
                </button>
              ) : (
                <p className="text-center text-sm text-muted-foreground">{frase}</p>
              ))}
            {checkoutBloqueado ? (
              <button type="button" onClick={() => void salvarCorrecoes()} disabled={ocupado || falta.length > 0} className="flex h-14 w-full items-center justify-center rounded-md bg-primary text-base font-bold text-primary-foreground disabled:opacity-50">
                Salvar correções
              </button>
            ) : (
              <button type="button" onClick={() => void concluir()} disabled={ocupado || falta.length > 0} className="flex h-14 w-full items-center justify-center rounded-md bg-primary px-3 text-center text-base font-bold text-primary-foreground disabled:opacity-50">
                {ocupado ? 'Pegando a localização…' : textoConcluir(atual, rotuloMotivoRecusa)}
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
