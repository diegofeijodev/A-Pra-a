'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { WD_SHORT } from '@/lib/dates';
import {
  AvisoFrio,
  FreelaNaoConfigurado,
  inputCls,
  pacingFromSettings,
  pracaCities,
  pracaUf,
} from './FreelaBits';
import {
  useCreateFreelaTemplate,
  useFreelaStatus,
  useUpdateFreelaTemplate,
  useUploadFreelaImage,
  AUDIENCE_LABELS,
  FREELA_CHANNELS,
  FREELA_MODULES,
  FREELA_PREVIEWABLE_AUDIENCES,
  type FreelaPacingInput,
  type FreelaTemplateBody,
  type FreelaTemplateView,
} from '@/modules/freela/application/use-freela';
import { useSettings } from '@/modules/messages/application/use-messages';
import { usePracas, useActivePraca } from '@/modules/pracas/application/use-pracas';

/**
 * Campanha **automática** do Freela (§18.2 / §7.7) — nova ou em edição.
 *
 * Quem guarda a campanha automática é o Freela; o Praça só guarda o vínculo
 * com a praça (`freela_templates`). Por isso a leitura chega em camelCase, como
 * veio de lá, e a escrita sai em snake_case (o DTO do Praça) — a tradução é do
 * servidor.
 *
 * Ela nasce **desligada**: quem liga é o interruptor da lista
 * (`PATCH /:id/enabled`), depois de alguém conferir texto e público.
 */

/** Recorte da cobertura da praça — campanha automática NÃO tem raio (§18.2). */
type Recorte = 'cidades' | 'uf' | 'nenhum';

export interface FreelaTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  /** Ausente = nova; presente = edição (`PUT` substitui o corpo inteiro lá). */
  template?: FreelaTemplateView | null;
}

export function FreelaTemplateDialog({ open, onClose, template }: FreelaTemplateDialogProps) {
  if (!open) return null;
  return <Form onClose={onClose} template={template ?? null} />;
}

function Form({ onClose, template }: { onClose: () => void; template: FreelaTemplateView | null }) {
  const { data: status } = useFreelaStatus();
  const { data: pracas } = usePracas();
  const { praca: ativa } = useActivePraca();
  const { data: settings } = useSettings();
  const create = useCreateFreelaTemplate();
  const update = useUpdateFreelaTemplate();
  const upload = useUploadFreelaImage();

  const filtrosDe = template?.audienceFilters ?? null;
  const [name, setName] = useState(template?.name ?? '');
  const [pracaId, setPracaId] = useState(template?.praca_id ?? '');
  const [kind, setKind] = useState(template?.scheduleKind ?? 'WEEKLY');
  const [weekdays, setWeekdays] = useState<number[]>(template?.weekdays ?? [2]);
  const [sendHour, setSendHour] = useState(template?.sendHour ?? 9);
  const [targetDay, setTargetDay] = useState(template?.targetDay ?? 1);
  const [targetMonth, setTargetMonth] = useState(template?.targetMonth ?? 1);
  const [todoAno, setTodoAno] = useState(!template?.targetYear);
  const [targetYear, setTargetYear] = useState(template?.targetYear ?? new Date().getFullYear());
  const [leadDays, setLeadDays] = useState(template?.leadDays ?? 0);
  const [audience, setAudience] = useState(template?.audience ?? FREELA_PREVIEWABLE_AUDIENCES[0]);
  const [recorte, setRecorte] = useState<Recorte>(
    filtrosDe?.ufs?.length ? 'uf' : filtrosDe?.cities?.length ? 'cidades' : 'nenhum',
  );
  const [modulo, setModulo] = useState(filtrosDe?.modules?.[0] ?? 'all');
  const [channels, setChannels] = useState<string[]>(template?.channels ?? ['WHATSAPP']);
  const [texto, setTexto] = useState(template?.whatsappTemplate ?? '');
  const [pushTitle, setPushTitle] = useState(template?.pushTitle ?? '');
  const [pushBody, setPushBody] = useState(template?.pushBody ?? '');
  const [imageKey, setImageKey] = useState(template?.imageKey ?? '');
  const [imageUrl, setImageUrl] = useState('');
  const [deepLink, setDeepLink] = useState(template?.deepLink ?? '');
  const [maxPerRun, setMaxPerRun] = useState(template?.maxPerRun ?? 0);
  const [pacing, setPacing] = useState<FreelaPacingInput | null>(
    template
      ? {
          messages_per_hour: template.messagesPerHour,
          daily_cap: template.dailyCap,
          window_start_hour: template.windowStartHour,
          window_end_hour: template.windowEndHour,
          weekdays_only: template.weekdaysOnly,
        }
      : null,
  );

  const configured = status?.configured === true;
  const praca = (pracas ?? []).find((p) => p.id === (pracaId || template?.praca_id || ativa?.id));
  const pracaAtual = praca?.id ?? '';
  const ritmo = pacing ?? pacingFromSettings(settings);
  const setRitmo = (p: Partial<FreelaPacingInput>) => setPacing({ ...ritmo, ...p });
  const salvando = create.isPending || update.isPending;
  const temWhats = channels.includes('WHATSAPP');
  const temPush = channels.includes('PUSH');
  const podeSalvar = configured && !!name.trim() && !!pracaAtual && channels.length > 0 && !salvando;

  const toggleDia = (d: number) =>
    setWeekdays((x) => (x.includes(d) ? x.filter((n) => n !== d) : [...x, d].sort()));

  const toggleCanal = (c: string) =>
    setChannels((x) => (x.includes(c) ? x.filter((n) => n !== c) : [...x, c]));

  const filtros = (): FreelaTemplateBody['filters'] => {
    const out: NonNullable<FreelaTemplateBody['filters']> = {};
    if (recorte === 'cidades') {
      const cidades = pracaCities(praca);
      if (cidades.length) out.cities = cidades;
    }
    if (recorte === 'uf') {
      const uf = pracaUf(praca);
      if (uf) out.ufs = [uf];
    }
    if (modulo !== 'all') out.modules = [modulo];
    return Object.keys(out).length ? out : undefined;
  };

  const salvar = () => {
    if (!podeSalvar) return;
    const recorteAtual = filtros();
    // Campo opcional vazio é OMITIDO, nunca mandado em branco: o corpo sobe
    // inteiro no `PUT` e o Freela guarda o que chega.
    const body: FreelaTemplateBody = {
      praca_id: pracaAtual,
      name: name.trim(),
      schedule_kind: kind,
      audience,
      channels,
      send_hour: sendHour,
      ...(kind === 'WEEKLY'
        ? { weekdays }
        : {
            target_day: targetDay,
            target_month: targetMonth,
            ...(todoAno ? {} : { target_year: targetYear }),
            lead_days: leadDays,
          }),
      ...(recorteAtual ? { filters: recorteAtual } : {}),
      ...(temWhats && texto.trim() ? { whatsapp_template: texto.trim() } : {}),
      ...(temPush && pushTitle.trim() ? { push_title: pushTitle.trim() } : {}),
      ...(temPush && pushBody.trim() ? { push_body: pushBody.trim() } : {}),
      ...(imageKey ? { image_key: imageKey } : {}),
      ...(deepLink.trim() ? { deep_link: deepLink.trim() } : {}),
      pacing: ritmo,
      ...(maxPerRun > 0 ? { max_per_run: maxPerRun } : {}),
    };
    const feito = () => {
      toast.success(
        template ? 'Campanha automática salva.' : 'Campanha automática criada — ela nasce pausada.',
      );
      onClose();
    };
    if (template) update.mutate({ id: template.id, body }, { onSuccess: feito });
    else create.mutate(body, { onSuccess: feito });
  };

  const enviarImagem = (file: File | undefined) => {
    if (!file) return;
    upload.mutate(file, {
      onSuccess: (r) => {
        setImageKey(r.key);
        setImageUrl(r.url);
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div
        className="h-full w-full max-w-3xl overflow-y-auto border-l border-border bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-extrabold">
            {template ? 'Campanha automática' : 'Nova campanha automática'}
          </h2>
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
            fechar
          </button>
        </div>

        {!configured && <FreelaNaoConfigurado />}

        <div className="mt-4">
          <AvisoFrio />
        </div>

        {/* 1. nome e praça */}
        <p className="tag mt-4 text-muted-foreground">1. Nome e praça</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            Nome
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="Toda terça · freelancers parados"
              className={`mt-1 w-full ${inputCls}`}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Praça
            <select
              value={pracaAtual}
              onChange={(e) => setPracaId(e.target.value)}
              className={`mt-1 w-full ${inputCls}`}
            >
              {(pracas ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* 2. agenda */}
        <p className="tag mt-4 text-muted-foreground">2. Agenda</p>
        <div className="mt-2 flex flex-wrap gap-3">
          <label className="flex items-center gap-1.5 text-xs">
            <input type="radio" checked={kind === 'WEEKLY'} onChange={() => setKind('WEEKLY')} />
            toda semana
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input type="radio" checked={kind === 'DATED'} onChange={() => setKind('DATED')} />
            numa data
          </label>
        </div>

        {kind === 'WEEKLY' ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {WD_SHORT.map((d, i) => (
              <button
                key={d}
                onClick={() => toggleDia(i)}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  weekdays.includes(i) ? 'border-primary bg-primary/10 text-primary' : 'border-border'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-4">
            <label className="text-xs text-muted-foreground">
              Dia
              <input
                type="number"
                min={1}
                max={31}
                value={targetDay}
                onChange={(e) => setTargetDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
                className={`mt-1 w-full ${inputCls}`}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Mês
              <input
                type="number"
                min={1}
                max={12}
                value={targetMonth}
                onChange={(e) => setTargetMonth(Math.min(12, Math.max(1, Number(e.target.value) || 1)))}
                className={`mt-1 w-full ${inputCls}`}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Ano
              <input
                type="number"
                min={2020}
                max={2100}
                disabled={todoAno}
                value={targetYear}
                onChange={(e) =>
                  setTargetYear(Math.min(2100, Math.max(2020, Number(e.target.value) || 2026)))
                }
                className={`mt-1 w-full ${inputCls} disabled:opacity-40`}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Dias antes
              <input
                type="number"
                min={0}
                max={60}
                value={leadDays}
                onChange={(e) => setLeadDays(Math.min(60, Math.max(0, Number(e.target.value) || 0)))}
                className={`mt-1 w-full ${inputCls}`}
              />
            </label>
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="text-xs text-muted-foreground">
            Hora do envio
            <input
              type="number"
              min={0}
              max={23}
              value={sendHour}
              onChange={(e) => setSendHour(Math.min(23, Math.max(0, Number(e.target.value) || 0)))}
              className={`ml-2 w-20 ${inputCls}`}
            />
          </label>
          {kind === 'DATED' && (
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={todoAno} onChange={(e) => setTodoAno(e.target.checked)} />
              repetir todo ano
            </label>
          )}
        </div>

        {/* 3. público */}
        <p className="tag mt-4 text-muted-foreground">3. Público</p>
        <select
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          className={`mt-2 w-full ${inputCls}`}
        >
          {FREELA_PREVIEWABLE_AUDIENCES.map((a) => (
            <option key={a} value={a}>
              {AUDIENCE_LABELS[a] ?? a}
            </option>
          ))}
        </select>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {(
            [
              ['cidades', 'Cidades da praça'],
              ['uf', 'UF da praça'],
              ['nenhum', 'Sem recorte'],
            ] as const
          ).map(([id, label]) => (
            <label key={id} className="flex items-center gap-1.5 text-xs">
              <input type="radio" checked={recorte === id} onChange={() => setRecorte(id)} />
              {label}
            </label>
          ))}
          <label className="text-xs text-muted-foreground">
            Módulo
            <select
              value={modulo}
              onChange={(e) => setModulo(e.target.value)}
              className={`ml-2 ${inputCls}`}
            >
              <option value="all">os dois</option>
              {FREELA_MODULES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Campanha automática não recorta por raio — só cidades, UF e módulo.
        </p>

        {/* 4. canais e conteúdo */}
        <p className="tag mt-4 text-muted-foreground">4. Canais e conteúdo</p>
        <div className="mt-2 flex flex-wrap gap-3">
          {FREELA_CHANNELS.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={channels.includes(c.id)}
                onChange={() => toggleCanal(c.id)}
              />
              {c.label}
            </label>
          ))}
        </div>

        {temWhats && (
          <>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={4000}
              rows={5}
              placeholder={'Oi {{primeiro_nome}}, tem vaga nova em {{cidade}}…'}
              className={`mt-2 w-full font-mono ${inputCls}`}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {texto.length}/4000 · até 3 variantes separadas por uma linha só com{' '}
              <code className="font-mono">---</code>.
            </p>
          </>
        )}

        {temPush && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              Título do push
              <input
                value={pushTitle}
                onChange={(e) => setPushTitle(e.target.value)}
                maxLength={120}
                className={`mt-1 w-full ${inputCls}`}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Corpo do push
              <input
                value={pushBody}
                onChange={(e) => setPushBody(e.target.value)}
                maxLength={500}
                className={`mt-1 w-full ${inputCls}`}
              />
            </label>
          </div>
        )}

        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            Imagem (PNG, JPEG ou WEBP, até 5 MB)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => enviarImagem(e.target.files?.[0])}
              className={`mt-1 w-full ${inputCls}`}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Link de destino (deep link)
            <input
              value={deepLink}
              onChange={(e) => setDeepLink(e.target.value)}
              maxLength={256}
              className={`mt-1 w-full ${inputCls}`}
            />
          </label>
        </div>
        {upload.isPending && <p className="mt-1 text-[11px] text-muted-foreground">Enviando imagem…</p>}
        {imageKey && (
          <p className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-mono">{imageKey}</span>
            {imageUrl && (
              <a href={imageUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                ver
              </a>
            )}
            <button onClick={() => { setImageKey(''); setImageUrl(''); }} className="hover:text-danger">
              remover
            </button>
          </p>
        )}

        {/* 5. ritmo */}
        <p className="tag mt-4 text-muted-foreground">5. Ritmo</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-5">
          <label className="text-xs text-muted-foreground">
            Mensagens por hora
            <input
              type="number"
              min={1}
              max={60}
              value={ritmo.messages_per_hour}
              onChange={(e) =>
                setRitmo({ messages_per_hour: Math.min(60, Math.max(1, Number(e.target.value) || 1)) })
              }
              className={`mt-1 w-full ${inputCls}`}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Teto por dia
            <input
              type="number"
              min={1}
              max={1000}
              value={ritmo.daily_cap}
              onChange={(e) =>
                setRitmo({ daily_cap: Math.min(1000, Math.max(1, Number(e.target.value) || 1)) })
              }
              className={`mt-1 w-full ${inputCls}`}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Janela — início
            <input
              type="number"
              min={0}
              max={23}
              value={ritmo.window_start_hour}
              onChange={(e) =>
                setRitmo({ window_start_hour: Math.min(23, Math.max(0, Number(e.target.value) || 0)) })
              }
              className={`mt-1 w-full ${inputCls}`}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Janela — fim
            <input
              type="number"
              min={1}
              max={24}
              value={ritmo.window_end_hour}
              onChange={(e) =>
                setRitmo({ window_end_hour: Math.min(24, Math.max(1, Number(e.target.value) || 1)) })
              }
              className={`mt-1 w-full ${inputCls}`}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Máximo por rodada
            <input
              type="number"
              min={0}
              value={maxPerRun}
              onChange={(e) => setMaxPerRun(Math.max(0, Number(e.target.value) || 0))}
              className={`mt-1 w-full ${inputCls}`}
            />
          </label>
        </div>
        <label className="mt-2 flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={ritmo.weekdays_only}
            onChange={(e) => setRitmo({ weekdays_only: e.target.checked })}
          />
          só dias úteis (o Freela não separa sábado de domingo)
        </label>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Máximo por rodada em 0 = sem teto por ocorrência.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            onClick={salvar}
            disabled={!podeSalvar}
            className="rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            {salvando ? 'Salvando…' : template ? 'Salvar' : 'Criar (nasce pausada)'}
          </button>
          <button onClick={onClose} className="px-2 py-2 text-sm text-muted-foreground">
            cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
