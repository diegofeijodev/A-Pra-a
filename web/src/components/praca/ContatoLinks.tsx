import { linkLigar, linkWhatsApp } from '@/modules/consultores/domain/atencao';

const BOTAO = 'inline-flex h-12 min-w-[7rem] items-center justify-center rounded-md border border-border px-4 text-sm font-bold hover:bg-muted';

/**
 * "Ligar" (`tel:`) e "Chamar no WhatsApp" (`wa.me`): a própria pessoa toca e abre o aplicativo —
 * o Praça não envia nada. Sem telefone plausível, diz isso em vez de esconder o botão.
 */
export function ContatoLinks({ phone, nome, texto }: { phone: string; nome: string; texto?: string }) {
  const ligar = linkLigar(phone);
  const zap = linkWhatsApp(phone, texto);
  if (!ligar && !zap) return <p className="text-sm text-muted-foreground">Sem telefone cadastrado.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {ligar && (
        <a href={ligar} className={BOTAO} aria-label={`Ligar para ${nome}`}>
          Ligar
        </a>
      )}
      {zap && (
        <a href={zap} target="_blank" rel="noopener noreferrer" className={BOTAO} aria-label={`Chamar ${nome} no WhatsApp`}>
          Chamar no WhatsApp
        </a>
      )}
    </div>
  );
}
