'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { todaySp } from '@/lib/dates';
import type { Cargo, FreelaStatus, Interesse, VisitAnswers } from '@/modules/campo/domain/campo.types';
import { canaisExclusivos, FUNCOES_VAGA } from '@/modules/campo/domain/questionario';

const CARGOS: [Cargo, string][] = [['dono', 'Dono'], ['gerente', 'Gerente'], ['outro', 'Outro']];
const SITUACOES: [FreelaStatus, string][] = [
  ['ja_usa', 'Já usa o Freela'],
  ['cadastrou_qr', 'Cadastrou agora pelo QR'],
  ['nao_cadastrou', 'Não cadastrou'],
];
const INTERESSES: [Interesse, string][] = [['alto', 'Alto'], ['medio', 'Médio'], ['baixo', 'Baixo'], ['nenhum', 'Nenhum']];

export function Opcoes<T extends string>({
  valor,
  opcoes,
  onEscolher,
  desabilitado,
}: {
  valor: T | null;
  opcoes: [T, string][];
  onEscolher: (v: T) => void;
  desabilitado?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {opcoes.map(([v, rotulo]) => (
        <button
          key={v}
          type="button"
          aria-pressed={valor === v}
          disabled={desabilitado}
          onClick={() => onEscolher(v)}
          className={`h-11 rounded-md border px-4 text-sm font-semibold ${
            valor === v ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
          }`}
        >
          {rotulo}
        </button>
      ))}
    </div>
  );
}

export function Chips({
  marcados,
  opcoes,
  onTrocar,
  desabilitado,
}: {
  marcados: string[];
  opcoes: readonly string[];
  onTrocar: (lista: string[]) => void;
  desabilitado?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {opcoes.map((o) => {
        const on = marcados.includes(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            disabled={desabilitado}
            onClick={() => onTrocar(on ? marcados.filter((x) => x !== o) : [...marcados, o])}
            className={`h-10 rounded-full border px-3 text-sm ${on ? 'border-primary bg-primary/15 text-primary' : 'border-border'}`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** Número inteiro ≥ 0 ou `null` (campo vazio). */
const inteiro = (s: string, max: number): number | null => {
  if (s.trim() === '') return null;
  const n = Math.floor(Number(s));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : null;
};

/** Questionário da visita (spec §8.1). Controlado: cada mudança sobe inteira em `onMudar`. */
export function Questionario({
  valor,
  canais,
  onMudar,
  desabilitado,
}: {
  valor: VisitAnswers;
  canais: string[];
  onMudar: (r: VisitAnswers) => void;
  desabilitado?: boolean;
}) {
  const mudar = (parcial: Partial<VisitAnswers>) => onMudar({ ...valor, ...parcial });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="q-nome">Com quem falou</Label>
        <Input
          id="q-nome"
          value={valor.interlocutor_name ?? ''}
          maxLength={120}
          disabled={desabilitado}
          onChange={(e) => mudar({ interlocutor_name: e.target.value || null })}
          placeholder="Nome"
        />
        <Opcoes valor={valor.interlocutor_role} opcoes={CARGOS} onEscolher={(v) => mudar({ interlocutor_role: v })} desabilitado={desabilitado} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Situação no Freela</p>
        <Opcoes valor={valor.freela_status} opcoes={SITUACOES} onEscolher={(v) => mudar({ freela_status: v })} desabilitado={desabilitado} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Interesse</p>
        <Opcoes valor={valor.interest} opcoes={INTERESSES} onEscolher={(v) => mudar({ interest: v })} desabilitado={desabilitado} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="q-vagas">Vagas abertas agora</Label>
        <Input
          id="q-vagas"
          inputMode="numeric"
          value={valor.open_vagas ?? ''}
          disabled={desabilitado}
          onChange={(e) => {
            const n = inteiro(e.target.value, 500);
            mudar({ open_vagas: n, vaga_roles: n ? valor.vaga_roles : [] });
          }}
        />
        {(valor.open_vagas ?? 0) > 0 && (
          <Chips marcados={valor.vaga_roles} opcoes={FUNCOES_VAGA} onTrocar={(l) => mudar({ vaga_roles: l })} desabilitado={desabilitado} />
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="q-freelas">Freelancers que contrata por semana (mais ou menos)</Label>
        <Input
          id="q-freelas"
          inputMode="numeric"
          value={valor.freelas_per_week ?? ''}
          disabled={desabilitado}
          onChange={(e) => mudar({ freelas_per_week: inteiro(e.target.value, 1000) })}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Apps e canais que usa hoje</p>
        <Chips marcados={valor.channels} opcoes={canais} onTrocar={(l) => mudar({ channels: canaisExclusivos(valor.channels, l) })} desabilitado={desabilitado} />
        <Input
          id="q-outro"
          aria-label="Outro app ou canal"
          value={valor.channel_other ?? ''}
          maxLength={120}
          disabled={desabilitado}
          onChange={(e) => mudar({ channel_other: e.target.value || null })}
          placeholder="Outro (qual?)"
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Precisa de retorno?</p>
        <Opcoes
          valor={valor.needs_followup == null ? null : valor.needs_followup ? 'sim' : 'nao'}
          opcoes={[['sim', 'Sim'], ['nao', 'Não']] as ['sim' | 'nao', string][]}
          onEscolher={(v) =>
            mudar(v === 'sim' ? { needs_followup: true } : { needs_followup: false, followup_what: null, followup_date: null })
          }
          desabilitado={desabilitado}
        />
        {valor.needs_followup && (
          <div className="space-y-2">
            <Input
              id="q-retorno-oque"
              aria-label="O que fazer no retorno"
              value={valor.followup_what ?? ''}
              maxLength={300}
              disabled={desabilitado}
              onChange={(e) => mudar({ followup_what: e.target.value || null })}
              placeholder="O que fazer"
            />
            <Input
              id="q-retorno-data"
              aria-label="Data do retorno"
              type="date"
              min={todaySp()}
              value={valor.followup_date ?? ''}
              disabled={desabilitado}
              onChange={(e) => mudar({ followup_date: e.target.value || null })}
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="q-obs">Observação (opcional)</Label>
        <Textarea
          id="q-obs"
          value={valor.notes ?? ''}
          maxLength={2000}
          disabled={desabilitado}
          onChange={(e) => mudar({ notes: e.target.value || null })}
        />
      </div>
    </div>
  );
}
