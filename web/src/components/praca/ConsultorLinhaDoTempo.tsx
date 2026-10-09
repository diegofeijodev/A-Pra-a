'use client';

import { useEffect, useState } from 'react';
import type { VisitView } from '@/modules/campo/domain/campo.types';
import { fmtBR } from '@/lib/dates';
import { duracaoMin, hora } from '@/modules/campo/domain/formatos';
import { fotoDaVisitaEquipe, type DiaConsultor } from '@/modules/consultores/infrastructure/consultores.api';

const SITUACAO: Record<string, string> = { ja_usa: 'Já usa o Freela', cadastrou_qr: 'Cadastrou agora pelo QR', nao_cadastrou: 'Não cadastrou' };
const INTERESSE: Record<string, string> = { alto: 'alto', medio: 'médio', baixo: 'baixo', nenhum: 'nenhum' };

function FotoVisita({ visita }: { visita: VisitView }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    let atual: string | null = null;
    fotoDaVisitaEquipe(visita.id)
      .then((b) => {
        if (!vivo) return;
        atual = URL.createObjectURL(b);
        setUrl(atual);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
      if (atual) URL.revokeObjectURL(atual);
    };
  }, [visita.id]);
  if (!url) return <div className="h-24 w-32 shrink-0 rounded-md bg-secondary" />;
  // eslint-disable-next-line @next/next/no-img-element -- URL de blob (foto privada vinda da API); next/image não otimiza
  return <img src={url} alt={`Fachada — ${visita.lead_name}`} className="h-24 w-32 shrink-0 rounded-md object-cover" />;
}

/** Linha do tempo do dia (spec §8.2): início · visitas · fim/"não encerrada". */
export function ConsultorLinhaDoTempo({ dia }: { dia: DiaConsultor }) {
  if (dia.journeys.length === 0) return <p className="text-sm text-muted-foreground">Sem jornada neste dia.</p>;
  return (
    <ol className="space-y-3">
      {dia.journeys.map((j) => (
        <li key={j.id} className="space-y-3">
          <p className="text-sm">
            <strong>{hora(j.started_at)}</strong> · Início da jornada
          </p>
          {dia.visits
            .filter((v) => v.journey_id === j.id)
            .map((v) => {
              const min = duracaoMin(v.checkin_at, v.checkout_at);
              const a = v.answers;
              return (
                <div key={v.id} className="card-surface flex gap-3 p-3">
                  <FotoVisita visita={v} />
                  <div className="min-w-0 space-y-1 text-sm">
                    <p className="font-bold">
                      {hora(v.checkin_at)} · {v.lead_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {min != null ? `${min} min` : 'sem checkout'}
                      {v.far_from_place ? ' · longe do local' : ''}
                      {v.auto_closed ? ' · fechada à meia-noite' : ''}
                      {v.possible_dup ? ' · possível duplicado' : ''}
                    </p>
                    {a.interlocutor_name && (
                      <p>
                        {a.interlocutor_name} ({a.interlocutor_role}) · {a.freela_status ? SITUACAO[a.freela_status] : '—'} · interesse{' '}
                        {a.interest ? INTERESSE[a.interest] : '—'}
                      </p>
                    )}
                    {a.open_vagas != null && (
                      <p className="text-xs">
                        Vagas: {a.open_vagas}
                        {a.vaga_roles.length ? ` (${a.vaga_roles.join(', ')})` : ''} · freelas/semana: {a.freelas_per_week ?? '—'} · canais:{' '}
                        {[...a.channels, a.channel_other].filter(Boolean).join(', ') || '—'}
                      </p>
                    )}
                    {a.needs_followup && (
                      <p className="text-xs">
                        Retorno: {a.followup_what} ({fmtBR(a.followup_date ?? undefined)})
                      </p>
                    )}
                    {a.notes && <p className="text-xs text-muted-foreground">{a.notes}</p>}
                  </div>
                </div>
              );
            })}
          <p className="text-sm">
            {j.ended_at ? (
              <>
                <strong>{hora(j.ended_at)}</strong> · Fim da jornada{j.auto_closed ? ' — não encerrada (fechada à meia-noite)' : ''}
              </>
            ) : (
              <span className="text-primary">Em jornada agora</span>
            )}
          </p>
        </li>
      ))}
    </ol>
  );
}
