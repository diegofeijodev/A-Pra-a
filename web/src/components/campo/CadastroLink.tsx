'use client';

import { QrDoFreela } from '@/components/campo/QrDoFreela';
import { textoParaCompartilhar, urlWhatsapp, validadeDoLink } from '@/modules/campo/domain/cadastro-empresa';

/**
 * Link de primeiro acesso em QR grande para o dono escanear no celular dele (contrato §26.0).
 * O link vive só nesta tela (estado em memória): sai quando o consultor sai daqui.
 */
export function CadastroLink({
  empresa,
  link,
  expiraEm,
  telefoneDono,
  ocupado,
  onNovoLink,
  onConcluir,
}: {
  empresa: string;
  link: string;
  expiraEm: string | null;
  telefoneDono: string | null;
  ocupado: boolean;
  onNovoLink: () => void;
  onConcluir: () => void;
}) {
  const texto = textoParaCompartilhar(empresa, link);
  const podeCompartilhar = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function compartilhar() {
    try {
      await navigator.share({ title: 'Acesso ao Freela', text: texto });
    } catch {
      // Cancelou a folha de compartilhamento: nada a fazer.
    }
  }

  return (
    <section aria-label="Link de acesso" className="space-y-5">
      <div className="text-center">
        <p className="text-lg font-bold">Acesso criado para</p>
        <p className="font-display text-2xl font-black">{empresa}</p>
      </div>
      <QrDoFreela
        url={link}
        tamanho={300}
        titulo="QR code do primeiro acesso"
        legenda="Peça para o dono apontar a câmera do celular dele. Ele escolhe a própria senha e já entra."
      />
      <p className="text-center text-sm text-muted-foreground">{validadeDoLink(expiraEm, Date.now())}</p>
      <p role="note" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
        Este link aparece só agora. Se você sair desta tela, toque em &quot;Gerar novo link&quot; para mostrar outro.
      </p>
      <div className="space-y-3">
        <a
          href={urlWhatsapp(texto, telefoneDono)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-14 w-full items-center justify-center rounded-md bg-primary text-base font-bold text-primary-foreground"
        >
          Enviar pelo meu WhatsApp
        </a>
        {podeCompartilhar && (
          <button
            type="button"
            onClick={() => void compartilhar()}
            className="flex h-14 w-full items-center justify-center rounded-md border border-border text-base font-bold"
          >
            Compartilhar
          </button>
        )}
        <button
          type="button"
          onClick={onNovoLink}
          disabled={ocupado}
          className="flex h-12 w-full items-center justify-center rounded-md border border-border text-sm font-bold disabled:opacity-50"
        >
          {ocupado ? 'Gerando…' : 'Gerar novo link'}
        </button>
        <button type="button" onClick={onConcluir} className="flex h-12 w-full items-center justify-center text-sm font-bold text-primary">
          Pronto, voltar para a visita
        </button>
      </div>
    </section>
  );
}
