import { ROTA, ROTA_CAMPO, rotaDoRepresentante } from './enderecos';

/**
 * Endereços de antes da E7 → os da Lovable (arquitetura §3.4, §5 E7). Uma tabela só, lida pelo `redirects()` do `next.config.ts`
 * (por caminho RELATIVO: lá não há o atalho `@/`, por isso este arquivo só importa `./enderecos`, que não importa nada) e conferida no
 * vitest (`__tests__/redirecionamentos.test.ts`). Servem a favoritos, vídeos e links velhos.
 *
 * - **307, nunca 308** (`permanent: false`): o 308 fica no cache do navegador para sempre, e um nome ainda pode mudar se vier outra
 *   versão da Lovable. Trocar depois de estabilizar é uma linha.
 * - **Destino sem `?`**: o Next repassa a query que chegou (`/consultores/calor?praca=…` → `/mapa/calor?praca=…`, os filtros do Mapa
 *   de calor moram na URL). A única exceção é `/roteiro/:id`, que nunca existiu aqui (é o endereço da Lovable).
 * - **Ordem importa** (vale a 1ª que casa): `?modo=mapa` antes de `/consultores/clientes`; as estáticas antes de `/consultores/:id`.
 * - **Sem cadeia**: nenhum destino é origem de outra linha.
 *
 * Não redirecionam (de propósito): `/campo/entrar` e `/campo/senha` (o atalho instalado não sai do `scope: '/campo'`, E3), o Comercial
 * (`/hoje`, `/funil`…, mesmos endereços) e `/`, que escolhe pela sessão.
 */
export interface Redirecionamento {
  source: string;
  destination: string;
  permanent: false;
  has?: { type: 'query'; key: string; value: string }[];
}

const r = (source: string, destination: string, has?: Redirecionamento['has']): Redirecionamento => ({
  source,
  destination,
  permanent: false,
  ...(has ? { has } : {}),
});

export const REDIRECIONAMENTOS: readonly Redirecionamento[] = [
  r('/consultores/painel', ROTA.inicio),
  // O Mapa dividia a página com Clientes até a E5.3 (`?modo=mapa`, o do menu de antes). O `modo` vai junto e o Mapa o ignora.
  r('/consultores/clientes', ROTA.mapa, [{ type: 'query', key: 'modo', value: 'mapa' }]),
  r('/consultores/clientes', ROTA.clientes),
  r('/consultores/mapa', ROTA.mapa),
  r('/consultores/calor', ROTA.mapaCalor),
  r('/consultores/roteiros', ROTA.rotas),
  r('/consultores/cupons', ROTA.vouchers),
  r('/consultores/pagamentos', ROTA.financeiro),
  r('/consultores/declarados', ROTA.declarados),
  r('/consultores/:id', rotaDoRepresentante(':id')),
  r('/consultores', ROTA.representantes),
  // O plano da praça ativa: mora recolhido no detalhe de cada praça (E5.2).
  r('/praca', ROTA.pracas),
  // Endereço da Lovable para o roteiro do representante, que aqui é uma visão de `/campo` (D1). A equipe que cair ali vai para
  // `/campo/entrar`, que a devolve ao Dashboard.
  r('/roteiro/:id', `${ROTA_CAMPO.inicio}?v=roteiro`),
];
