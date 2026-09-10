'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import {
  getPublicPraca,
  postPublicLead,
  type PublicLeadInput,
} from '@/modules/public/infrastructure/public.api';

/**
 * Formulário de captura — porte de
 * `.prototype/src/routes/formulario.$pracaId.tsx`.
 *
 * Página PÚBLICA: vive fora do grupo `(app)`, sem guarda de sessão e sem o
 * shell. Fala com `/v1/public/*` por uma instância própria de axios (sem o
 * interceptor de token) — é o destino dos anúncios, aberto por quem nunca vai
 * entrar no painel.
 */
const inputCls = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary";

export default function FormularioPage() {
  // `useSearchParams` obriga uma fronteira de Suspense (Next 15).
  return (
    <Suspense fallback={null}>
      <Formulario />
    </Suspense>
  );
}

function Formulario() {
  const { pracaId } = useParams<{ pracaId: string }>();
  const searchParams = useSearchParams();
  const origem: PublicLeadInput["origem"] = searchParams.get("origem") === "pago" ? "pago" : "organico";
  const camp = searchParams.get("camp") ?? undefined;

  const { data: praca } = useQuery({
    queryKey: ['public-praca', pracaId],
    queryFn: () => getPublicPraca(pracaId),
    enabled: !!pracaId,
    retry: false,
  });

  const [f, setF] = useState({ name: "", city: "", phone: "", decisor: "", freq: "" });
  const [cityTouched, setCityTouched] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const ok = f.name.trim() && f.phone.trim() && f.city.trim();

  // A cidade da praça só chega depois do GET; preenche enquanto quem está
  // olhando não tiver escrito nada no campo.
  useEffect(() => {
    if (cityTouched || !praca) return;
    setF((p) => ({ ...p, city: praca.city.split(" · ")[0] ?? "" }));
  }, [praca, cityTouched]);

  const send = useMutation({
    mutationFn: (input: PublicLeadInput) => postPublicLead(input),
    // Telefone repetido responde `{ok:true, duplicate:true}`: o contato virou
    // nota no lead que já existe. Para quem preencheu, é a mesma tela.
    onSuccess: () => setSent(true),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível enviar seu contato.')),
  });

  const submit = () => {
    if (!ok) return;
    send.mutate({
      praca_id: pracaId,
      name: f.name.trim(),
      city: f.city.trim(),
      phone: f.phone.trim(),
      ...(f.decisor.trim() ? { decisor: f.decisor.trim() } : {}),
      ...(f.freq ? { freq: f.freq } : {}),
      origem,
      ...(camp ? { camp } : {}),
    });
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <p className="font-display text-xs font-black tracking-widest text-primary uppercase">Freela Serviços</p>
      <h1 className="mt-2 font-display text-2xl font-black tracking-tight">
        Sua casa fica sem gente? A gente resolve.
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {praca ? `Atendimento em ${praca.name}.` : "Conte pra gente onde você está."} Garçons, cozinheiros e apoio avaliados, chamados na hora que precisar.
      </p>

      {sent ? (
        <div className="mt-6 rounded-lg border border-success/50 bg-success/10 p-4">
          <p className="font-display text-base font-extrabold text-success">Recebemos seu contato.</p>
          <p className="mt-1 text-sm text-muted-foreground">A gente fala com você em até um dia útil no WhatsApp informado.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <label className="block text-xs text-muted-foreground">
            Nome do estabelecimento
            <input value={f.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
          </label>
          <label className="block text-xs text-muted-foreground">
            Cidade
            <input value={f.city} onChange={(e) => { setCityTouched(true); set("city", e.target.value); }} className={inputCls} />
          </label>
          <label className="block text-xs text-muted-foreground">
            Telefone (WhatsApp)
            <input value={f.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} />
          </label>
          <label className="block text-xs text-muted-foreground">
            Nome do responsável
            <input value={f.decisor} onChange={(e) => set("decisor", e.target.value)} className={inputCls} />
          </label>
          <label className="block text-xs text-muted-foreground">
            Quantas vezes por mês você fica sem gente?
            <select value={f.freq} onChange={(e) => set("freq", e.target.value)} className={inputCls}>
              <option value="">escolha</option>
              <option value="0">quase nunca</option>
              <option value="2">1 a 2 vezes</option>
              <option value="5">3 a 5 vezes</option>
              <option value="10">mais de 5 vezes</option>
            </select>
          </label>
          <button
            disabled={!ok || send.isPending}
            onClick={submit}
            className="w-full rounded-md bg-primary py-3 font-display text-sm font-extrabold tracking-wide text-primary-foreground uppercase disabled:opacity-40"
          >
            Quero receber contato
          </button>
          <p className="text-[11px] text-muted-foreground">Seus dados ficam só com a nossa equipe comercial.</p>
        </div>
      )}
    </main>
  );
}
