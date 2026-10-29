'use client';

import { useEffect, useRef } from 'react';
import { ChevronDown, MessageCircle, Phone, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { linkLigar, linkWhatsApp } from '@/modules/crm/domain/tarefas';

export interface OpcaoMenuLinha {
  id: string;
  rotulo: string;
  icone?: LucideIcon;
}

export interface LinhaTarefaProps {
  /** Chave estável da linha (`data-chave`): a tela acha a linha seguinte para o foco quando esta sai. */
  chave: string;
  nome: string;
  /** Abre o `LeadPanel` (o `Sheet`). */
  onAbrirLead: () => void;
  motivo: string;
  apoio?: string | null;
  /** Mensagem pronta (T1 e cadência), com "Copiar mensagem". */
  mensagem?: string | null;
  onCopiarMensagem?: () => void;
  telefone?: string | null;
  /**
   * WhatsApp: `principal` = "Abrir WhatsApp" na linha inteira do celular (T1), senão "WhatsApp" de conversa sem texto (T2–T5, com "Ligar"
   * no celular). `destaque` = botão cheio. Só abre a conversa: NUNCA grava (achado 3, U1); `onAbrir` é só para a tela lembrar que abriu.
   */
  whatsapp?: { texto?: string; principal?: boolean; destaque?: boolean; onAbrir?: () => void } | null;
  /** Linha de aviso abaixo do motivo ("Mandou? Toque em Feito."). */
  aviso?: string | null;
  /** "Feito" de 1 toque (`onFeito`) ou com o menu "O que você fez?" (`opcoes`); ausente = só leitura. */
  feito?: { onFeito: () => void; destaque?: boolean } | { opcoes: OpcaoMenuLinha[]; onEscolher: (id: string) => void } | null;
  adiar?: { opcoes: OpcaoMenuLinha[]; onEscolher: (id: string) => void } | null;
  /** Esperando o prazo do Desfazer (ou gravando, sem `onDesfazer`): a confirmação toma o lugar das ações. */
  confirmacao?: { texto: string; nota?: string; rotuloAbrir?: string; onDesfazer?: () => void; onAbrir?: () => void } | null;
  /** O pedido falhou: a linha volta com a mensagem do servidor. */
  erro?: { mensagem: string; onTentarDeNovo: () => void } | null;
  /** Menu aberto ou fechado (a tela segura a releitura enquanto um menu está aberto). */
  onMenu?: (aberto: boolean) => void;
}

/** No celular, dois botões por linha (44 px); no computador, cada um do seu tamanho. */
const METADE = 'flex-1 basis-[calc(50%-0.25rem)] md:flex-none md:basis-auto';

/**
 * Linha de uma tarefa (UX §3.1.3), a mesma da fila da Entrada (§3.6): nome (abre o lead), motivo numa frase, apoio, a mensagem pronta
 * e as ações. Só apresentação: quem decide o que cada ação grava, e quando, é a tela (o Desfazer de 5 s mora em `useAcoesAdiadas`).
 */
export function LinhaTarefa(p: LinhaTarefaProps) {
  const gatilho = useRef<'feito' | 'adiar' | null>(null);
  const escolheuNoMenu = useRef(false);
  const feitoRef = useRef<HTMLButtonElement>(null);
  const adiarRef = useRef<HTMLButtonElement>(null);
  const confirmacaoRef = useRef<HTMLDivElement>(null);
  const liRef = useRef<HTMLLIElement>(null);
  const recolhida = !!p.confirmacao;
  const antes = useRef(recolhida);

  // Foco (UX §3.1.8): ao recolher, vai para a confirmação; ao desfazer (ou falhar), volta ao botão usado. Só mexe se o foco estava nesta
  // linha (ou caiu no `body` porque o botão sumiu) — nunca rouba o foco de quem já está em outro lugar.
  useEffect(() => {
    if (antes.current === recolhida) return;
    antes.current = recolhida;
    const ativo = document.activeElement;
    if (ativo && ativo !== document.body && !liRef.current?.contains(ativo)) return;
    if (recolhida) confirmacaoRef.current?.focus();
    else (gatilho.current === 'adiar' ? adiarRef : feitoRef).current?.focus();
  }, [recolhida]);

  const whats = p.whatsapp ? linkWhatsApp(p.telefone, p.whatsapp.texto) : null;
  const tel = p.whatsapp && !p.whatsapp.principal ? linkLigar(p.telefone) : null;
  const aoAbrirMenu = (aberto: boolean) => {
    if (aberto) escolheuNoMenu.current = false;
    p.onMenu?.(aberto);
  };
  // Escolheu um item: a linha recolhe e o gatilho some; o Radix não deve tentar devolver o foco a ele.
  const aoFecharMenu = (e: Event) => {
    if (escolheuNoMenu.current) e.preventDefault();
  };

  if (p.confirmacao) {
    const c = p.confirmacao;
    return (
      <li ref={liRef} data-chave={p.chave} className="px-5 py-4">
        <div ref={confirmacaoRef} tabIndex={-1} data-foco-linha aria-busy={!c.onDesfazer} className="space-y-1 rounded-md focus:outline-none">
          <p className="font-medium">{p.nome}</p>
          <p className="flex flex-wrap items-center gap-x-1 text-sm">
            <span>{c.texto}</span>
            {c.onDesfazer && (
              <>
                <span aria-hidden>·</span>
                <Button variant="link" size="sm" className="px-1 text-sm" aria-label={`Desfazer: ${p.nome}`} onClick={c.onDesfazer}>
                  Desfazer
                </Button>
              </>
            )}
            {c.onAbrir && (
              <>
                <span aria-hidden>·</span>
                <Button variant="link" size="sm" className="px-1 text-sm" aria-haspopup="dialog" onClick={c.onAbrir}>
                  {c.rotuloAbrir ?? 'Abrir o lead'}
                </Button>
              </>
            )}
          </p>
          {c.nota && <p className="text-sm text-muted-foreground">{c.nota}</p>}
        </div>
      </li>
    );
  }

  const feito = p.feito;
  return (
    <li ref={liRef} data-chave={p.chave} className="px-5 py-4">
      <button
        type="button"
        data-foco-linha
        aria-haspopup="dialog"
        onClick={p.onAbrirLead}
        className="inline-flex min-h-11 items-center text-left font-medium hover:underline md:min-h-0"
      >
        {p.nome}
      </button>
      <p className="text-sm">{p.motivo}</p>
      {p.apoio && <p className="text-xs text-muted-foreground">{p.apoio}</p>}
      {p.mensagem && (
        <>
          <p className="mt-2 line-clamp-3 whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">{p.mensagem}</p>
          {p.onCopiarMensagem && (
            <Button variant="link" size="sm" className="min-h-11 px-0 md:min-h-0" onClick={p.onCopiarMensagem}>
              Copiar mensagem
            </Button>
          )}
        </>
      )}
      {p.aviso && <p className="mt-2 text-sm">{p.aviso}</p>}
      {p.erro && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-destructive">
            {p.erro.mensagem}
          </p>
          <Button variant="outline" size="sm" onClick={p.erro.onTentarDeNovo}>
            Tentar de novo
          </Button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {tel && (
          <Button variant="outline" asChild className={cn(METADE, 'md:hidden')}>
            <a href={tel}>
              <Phone aria-hidden />
              Ligar<span className="sr-only"> para {p.nome}</span>
            </a>
          </Button>
        )}
        {whats && (
          <Button
            variant={p.whatsapp?.destaque === false || !p.whatsapp?.principal ? 'outline' : 'default'}
            asChild
            className={cn(METADE, p.whatsapp?.principal && 'basis-full md:basis-auto')}
          >
            <a href={whats} target="_blank" rel="noopener noreferrer" onClick={p.whatsapp?.onAbrir}>
              <MessageCircle aria-hidden />
              {p.whatsapp?.principal ? 'Abrir WhatsApp' : 'WhatsApp'}
              <span className="sr-only"> de {p.nome} (abre em outra aba)</span>
            </a>
          </Button>
        )}
        {feito &&
          ('onFeito' in feito ? (
            <Button
              ref={feitoRef}
              variant={feito.destaque ? 'default' : 'outline'}
              className={METADE}
              aria-label={`Feito: ${p.nome}`}
              onClick={() => {
                gatilho.current = 'feito';
                feito.onFeito();
              }}
            >
              Feito
            </Button>
          ) : (
            <DropdownMenu onOpenChange={aoAbrirMenu}>
              <DropdownMenuTrigger asChild>
                <Button ref={feitoRef} className={METADE} aria-label={`Feito: ${p.nome}`}>
                  Feito
                  <ChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" onCloseAutoFocus={aoFecharMenu}>
                <DropdownMenuLabel>O que você fez?</DropdownMenuLabel>
                {feito.opcoes.map((o) => (
                  <DropdownMenuItem
                    key={o.id}
                    className="min-h-11"
                    onSelect={() => {
                      gatilho.current = 'feito';
                      escolheuNoMenu.current = true;
                      feito.onEscolher(o.id);
                    }}
                  >
                    {o.icone && <o.icone aria-hidden />}
                    {o.rotulo}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
        {p.adiar && (
          <DropdownMenu onOpenChange={aoAbrirMenu}>
            <DropdownMenuTrigger asChild>
              <Button ref={adiarRef} variant="outline" className={METADE} aria-label={`Adiar: ${p.nome}`}>
                Adiar
                <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" onCloseAutoFocus={aoFecharMenu}>
              <DropdownMenuLabel>Adiar até</DropdownMenuLabel>
              {p.adiar.opcoes.map((o) => (
                <DropdownMenuItem
                  key={o.id}
                  className="min-h-11"
                  onSelect={() => {
                    gatilho.current = 'adiar';
                    escolheuNoMenu.current = true;
                    p.adiar?.onEscolher(o.id);
                  }}
                >
                  {o.rotulo}
                </DropdownMenuItem>
              ))}
              <p className="max-w-64 px-2 py-1.5 text-xs text-muted-foreground">O lead some das tarefas e da Entrada até lá.</p>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </li>
  );
}
