'use client';

import { useState } from 'react';
import { EmailContato } from '@/components/campo/EmailContato';
import { Chip, Grupo } from '@/components/campo/simples/Chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Cargo, Interesse, VisitAnswers } from '@/modules/campo/domain/campo.types';
import { formatarTelefone, normalizarTelefone } from '@/modules/campo/domain/contato';
import type { CampoContato } from '@/modules/campo/domain/fluxo';
import { canaisExclusivos, FUNCOES_VAGA } from '@/modules/campo/domain/questionario';

const CARGOS: [Cargo, string][] = [['dono', 'Dono'], ['gerente', 'Gerente'], ['outro', 'Outro']];
const INTERESSES: [Interesse, string][] = [['alto', 'Alto'], ['medio', 'Médio'], ['baixo', 'Baixo'], ['nenhum', 'Nenhum']];

type Muda = (p: Partial<VisitAnswers>) => void;

/** Nome, cargo e telefone de quem atendeu. Telefone: só um número VÁLIDO (ou vazio) sobe para as respostas. */
export function ContatoCampos({ valor, onMudar, desabilitado, campos }: { valor: VisitAnswers; onMudar: Muda; desabilitado?: boolean; campos: CampoContato[] }) {
  const [fone, setFone] = useState(valor.contact_phone ? formatarTelefone(valor.contact_phone) : '');
  const r = normalizarTelefone(fone);
  const pede = (c: CampoContato) => campos.includes(c);
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="r-nome">Nome de quem atendeu{pede('nome') ? '' : ' (opcional)'}</Label>
        <Input id="r-nome" value={valor.interlocutor_name ?? ''} maxLength={120} disabled={desabilitado} onChange={(e) => onMudar({ interlocutor_name: e.target.value || null })} className="h-12" />
      </div>
      <Grupo rotulo="Cargo de quem atendeu" colunas={3}>
        {CARGOS.map(([v, rotulo]) => (
          <Chip key={v} ativo={valor.interlocutor_role === v} desabilitado={desabilitado} onEscolher={() => onMudar({ interlocutor_role: v })}>
            {rotulo}
          </Chip>
        ))}
      </Grupo>
      <div className="space-y-1">
        <Label htmlFor="r-fone">Telefone de quem atendeu{pede('telefone') ? '' : ' (opcional)'}</Label>
        <Input
          id="r-fone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="(11) 98765-4321"
          value={fone}
          disabled={desabilitado}
          onChange={(e) => {
            const novo = formatarTelefone(e.target.value);
            setFone(novo);
            const n = normalizarTelefone(novo);
            onMudar({ contact_phone: n.ok ? n.valor : null });
          }}
          className="h-12"
        />
        {!r.ok && <p className="text-sm text-warning">Faltam dígitos: DDD + número (10 ou 11). Enquanto isso, o telefone não é salvo.</p>}
      </div>
      <EmailContato valor={valor.contact_email} onMudar={(v) => onMudar({ contact_email: v })} desabilitado={desabilitado} pede={pede('email')} />
    </div>
  );
}

function Passo({ rotulo, valor, max, onMudar, desabilitado }: { rotulo: string; valor: number | null; max: number; onMudar: (n: number) => void; desabilitado?: boolean }) {
  const n = valor ?? 0;
  const botao = 'flex h-12 w-12 items-center justify-center rounded-md border border-border text-xl font-bold disabled:opacity-50';
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-bold">{rotulo}</span>
      <span className="flex items-center gap-3">
        <button type="button" aria-label={`Menos ${rotulo}`} disabled={desabilitado || n <= 0} onClick={() => onMudar(n - 1)} className={botao}>−</button>
        <span className="w-8 text-center text-lg font-black" aria-live="polite">{n}</span>
        <button type="button" aria-label={`Mais ${rotulo}`} disabled={desabilitado || n >= max} onClick={() => onMudar(n + 1)} className={botao}>+</button>
      </span>
    </div>
  );
}

/**
 * "Mais detalhes (opcional)" (UX §2.2): as perguntas do questionário completo, todas opcionais e todas gravadas se
 * preenchidas. Acordeão na própria tela. `contatoFora`: nome/cargo/telefone já aparecem acima (obrigatórios).
 */
export function MaisDetalhes({ valor, canais, onMudar, desabilitado, contatoFora }: { valor: VisitAnswers; canais: string[]; onMudar: Muda; desabilitado?: boolean; contatoFora: boolean }) {
  return (
    <details className="card-surface p-4">
      <summary className="flex min-h-12 cursor-pointer items-center text-base font-bold">Mais detalhes (opcional)</summary>
      <div className="mt-3 space-y-5">
        {!contatoFora && <ContatoCampos valor={valor} onMudar={onMudar} desabilitado={desabilitado} campos={[]} />}

        <div className="space-y-2">
          <p className="text-sm font-bold">Interesse</p>
          <Grupo rotulo="Interesse" colunas={2}>
            {INTERESSES.map(([v, rotulo]) => (
              <Chip key={v} ativo={valor.interest === v} desabilitado={desabilitado} onEscolher={() => onMudar({ interest: v })}>
                {rotulo}
              </Chip>
            ))}
          </Grupo>
        </div>

        <Passo rotulo="Vagas abertas agora" valor={valor.open_vagas} max={500} desabilitado={desabilitado} onMudar={(n) => onMudar({ open_vagas: n, vaga_roles: n === 0 ? [] : valor.vaga_roles })} />
        {(valor.open_vagas ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2">
            {FUNCOES_VAGA.map((f) => {
              const on = valor.vaga_roles.includes(f);
              return (
                <button key={f} type="button" aria-pressed={on} disabled={desabilitado} onClick={() => onMudar({ vaga_roles: on ? valor.vaga_roles.filter((x) => x !== f) : [...valor.vaga_roles, f] })} className={`h-12 rounded-full border px-4 text-sm ${on ? 'border-primary bg-primary/15 font-bold' : 'border-border'}`}>
                  {on ? '✓ ' : ''}{f}
                </button>
              );
            })}
          </div>
        )}

        <Passo rotulo="Freelas por semana" valor={valor.freelas_per_week} max={1000} desabilitado={desabilitado} onMudar={(n) => onMudar({ freelas_per_week: n })} />

        <div className="space-y-2">
          <p className="text-sm font-bold">Apps e canais que usa</p>
          <div className="flex flex-wrap gap-2">
            {canais.map((c) => {
              const on = valor.channels.includes(c);
              return (
                <button key={c} type="button" aria-pressed={on} disabled={desabilitado} onClick={() => onMudar({ channels: canaisExclusivos(valor.channels, on ? valor.channels.filter((x) => x !== c) : [...valor.channels, c]) })} className={`h-12 rounded-full border px-4 text-sm ${on ? 'border-primary bg-primary/15 font-bold' : 'border-border'}`}>
                  {on ? '✓ ' : ''}{c}
                </button>
              );
            })}
          </div>
          <Input aria-label="Outro app ou canal" placeholder="Outro" maxLength={120} disabled={desabilitado} value={valor.channel_other ?? ''} onChange={(e) => onMudar({ channel_other: e.target.value || null })} className="h-12" />
        </div>

        <div className="space-y-1">
          <Label htmlFor="r-obs">Observação</Label>
          <Textarea id="r-obs" maxLength={2000} disabled={desabilitado} value={valor.notes ?? ''} onChange={(e) => onMudar({ notes: e.target.value || null })} />
        </div>
      </div>
    </details>
  );
}
