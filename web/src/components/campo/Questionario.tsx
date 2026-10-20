'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { todaySp } from '@/lib/dates';
import type { Cargo, FreelaStatus, Interesse, Resultado, VisitAnswers } from '@/modules/campo/domain/campo.types';
import { formatarTelefone, normalizarTelefone } from '@/modules/campo/domain/contato';
import { canaisExclusivos, FUNCOES_VAGA } from '@/modules/campo/domain/questionario';
import { MOTIVOS_RECUSA, pedeMotivoRecusa } from '@/modules/campo/domain/recusa';

const CARGOS: [Cargo, string][] = [['dono', 'Dono'], ['gerente', 'Gerente'], ['outro', 'Outro']];
const SITUACOES: [FreelaStatus, string][] = [
  ['ja_usa', 'Já usa o Freela'],
  ['cadastrou_qr', 'Cadastrou agora pelo QR'],
  ['nao_cadastrou', 'Não cadastrou'],
];
const RESULTADOS: [Resultado, string][] = [['conversa', 'Conversei'], ['fechado', 'Estava fechado']];
const INTERESSES: [Interesse, string][] = [['alto', 'Alto'], ['medio', 'Médio'], ['baixo', 'Baixo'], ['nenhum', 'Nenhum']];

function Opcoes<T extends string>({
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

function Chips({
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

/**
 * Telefone de quem atendeu (opcional, §30.3). O que se digita fica no campo; só um número VÁLIDO (ou vazio)
 * sobe para as respostas — um número pela metade nunca vai ao servidor (o rascunho é salvo a cada mudança).
 */
function TelefoneContato({ valor, onMudar, desabilitado }: { valor: string | null; onMudar: (v: string | null) => void; desabilitado?: boolean }) {
  const [texto, setTexto] = useState(valor ? formatarTelefone(valor) : '');
  const r = normalizarTelefone(texto);
  return (
    <div className="space-y-1">
      <Label htmlFor="q-contato-fone">Telefone de quem atendeu (opcional)</Label>
      <Input
        id="q-contato-fone"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        value={texto}
        disabled={desabilitado}
        onChange={(e) => {
          const novo = formatarTelefone(e.target.value);
          setTexto(novo);
          const n = normalizarTelefone(novo);
          onMudar(n.ok ? n.valor : null);
        }}
        placeholder="(11) 98765-4321"
        aria-describedby="q-contato-fone-dica"
      />
      <p id="q-contato-fone-dica" className={`text-xs ${r.ok ? 'text-muted-foreground' : 'text-warning'}`}>
        {r.ok ? 'Só para ligar de volta ou chamar no WhatsApp. DDD + número.' : 'Faltam dígitos: informe o DDD e o número (10 ou 11 dígitos). Enquanto isso, o telefone não é salvo.'}
      </p>
    </div>
  );
}

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
  const resultado: Resultado = valor.outcome ?? 'conversa';
  const fechado = resultado === 'fechado';

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium">Como foi a visita?</p>
        <Opcoes
          valor={resultado}
          opcoes={RESULTADOS}
          onEscolher={(v) => mudar(v === 'fechado' ? { outcome: v, refusal_reason: null, refusal_note: null } : { outcome: v })}
          desabilitado={desabilitado}
        />
        {fechado && (
          <p className="text-sm text-muted-foreground">
            Estabelecimento fechado: não precisa responder o questionário e a visita não entra na meta. Se quiser voltar, marque o retorno abaixo.
          </p>
        )}
      </div>

      {!fechado && (
        <>
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
        <TelefoneContato valor={valor.contact_phone ?? null} onMudar={(t) => mudar({ contact_phone: t })} desabilitado={desabilitado} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Situação no Freela</p>
        <Opcoes valor={valor.freela_status} opcoes={SITUACOES} onEscolher={(v) => mudar({ freela_status: v })} desabilitado={desabilitado} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Interesse</p>
        <Opcoes
          valor={valor.interest}
          opcoes={INTERESSES}
          onEscolher={(v) => mudar(v === 'nenhum' ? { interest: v } : { interest: v, refusal_reason: null, refusal_note: null })}
          desabilitado={desabilitado}
        />
      </div>

      {pedeMotivoRecusa(valor) && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Motivo da recusa</p>
          <Opcoes
            valor={valor.refusal_reason ?? null}
            opcoes={MOTIVOS_RECUSA.map((m) => [m.key, m.label] as [string, string])}
            onEscolher={(v) => mudar({ refusal_reason: v, ...(v === 'outro' ? {} : { refusal_note: null }) })}
            desabilitado={desabilitado}
          />
          {valor.refusal_reason === 'outro' && (
            <Input
              id="q-recusa-nota"
              aria-label="Qual foi o motivo"
              value={valor.refusal_note ?? ''}
              maxLength={120}
              disabled={desabilitado}
              onChange={(e) => mudar({ refusal_note: e.target.value || null })}
              placeholder="Qual? (curto)"
            />
          )}
          <p className="text-xs text-muted-foreground">Ajuda a equipe a entender por que não quiseram. Não é obrigatório.</p>
        </div>
      )}

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
        </>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Precisa de retorno?</p>
        <Opcoes
          valor={valor.needs_followup == null ? null : valor.needs_followup ? 'sim' : 'nao'}
          opcoes={[['sim', 'Sim'], ['nao', 'Não']] as ['sim' | 'nao', string][]}
          onEscolher={(v) =>
            mudar(v === 'sim' ? { needs_followup: true } : { needs_followup: false, followup_what: null, followup_date: null, followup_time: null })
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
            <div className="space-y-1">
              <Label htmlFor="q-retorno-hora">Hora combinada (opcional)</Label>
              <Input
                id="q-retorno-hora"
                type="time"
                value={valor.followup_time ?? ''}
                disabled={desabilitado}
                onChange={(e) => mudar({ followup_time: e.target.value || null })}
              />
              <p className="text-xs text-muted-foreground">Horário de Brasília. Sem hora, o retorno vale o dia todo.</p>
            </div>
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
