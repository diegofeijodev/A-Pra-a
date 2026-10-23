'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { emailContatoValido } from '@/modules/acesso/domain/cadastro';
import { useCampoMe } from '@/modules/campo/application/use-campo';

/**
 * E-mail de quem atendeu (contrato §41.4, UX §3.5): opcional, como na Lovable; só com `features.contact_email` do `/me` (sem a
 * flag o campo não existe e o rascunho nunca leva a chave). Conferido ao sair do campo; enquanto estiver errado, não é gravado
 * (como o telefone): sobe `null`.
 */
export function EmailContato({ valor, onMudar, desabilitado, pede = false }: { valor: string | null | undefined; onMudar: (v: string | null) => void; desabilitado?: boolean; pede?: boolean }) {
  const ligado = useCampoMe().data?.features?.contact_email === true;
  const [texto, setTexto] = useState(valor ?? '');
  const [conferido, setConferido] = useState(false);
  if (!ligado) return null;
  const ok = emailContatoValido(texto);
  return (
    <div className="space-y-1">
      <Label htmlFor="r-email">E-mail de quem atendeu{pede ? '' : ' (opcional)'}</Label>
      <Input
        id="r-email"
        type="email"
        inputMode="email"
        autoComplete="off"
        maxLength={120}
        placeholder="nome@estabelecimento.com.br"
        value={texto}
        disabled={desabilitado}
        aria-invalid={conferido && !ok}
        aria-describedby={conferido && !ok ? 'r-email-erro' : undefined}
        onChange={(e) => {
          setTexto(e.target.value);
          const v = e.target.value.trim().toLowerCase();
          onMudar(v && emailContatoValido(v) ? v : null);
        }}
        onBlur={() => setConferido(true)}
        className="h-12"
      />
      {conferido && !ok && (
        <p id="r-email-erro" role="alert" className="text-sm text-warning">
          Confira o e-mail: falta o @ ou o domínio. Enquanto isso, o e-mail não é salvo.
        </p>
      )}
    </div>
  );
}
