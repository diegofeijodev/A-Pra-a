// Catálogo do bloco B (representantes e rotas, contrato §21) — conteúdo
// estático, não vive no banco (CLAUDE.md, "Onde fica o conteúdo").

export interface CnaeDef {
  code: string;
  label: string;
}

/** CNAEs-padrão da base de estabelecimentos; editáveis em Configurações (`app_settings.field_cnaes`). */
export const CNAES_PADRAO: CnaeDef[] = [
  { code: '5611201', label: 'Restaurantes e similares' },
  { code: '5611203', label: 'Lanchonetes, casas de chá, de sucos e similares' },
  { code: '5611204', label: 'Bares e outros estabelecimentos especializados em servir bebidas, sem entretenimento' },
  { code: '5611205', label: 'Bares e outros estabelecimentos especializados em servir bebidas, com entretenimento' },
  { code: '5620102', label: 'Serviços de alimentação para eventos e recepções — bufê' },
  { code: '5510801', label: 'Hotéis' },
];

export const STATUS_FINAIS = [
  { id: 'cadastrou', label: 'Cadastrou' },
  { id: 'cadastra_depois', label: 'Vai cadastrar depois' },
  { id: 'nao_quis', label: 'Não quis' },
  { id: 'ligar_depois', label: 'Ligar depois' },
] as const;

export const MODOS_CADASTRO = [
  { id: 'qr', label: 'QR code' },
  { id: 'assistido', label: 'Cadastro assistido (no celular do representante)' },
  { id: 'nao_abriu', label: 'Não abriu o cadastro' },
] as const;

export const STATUS_VOUCHER = [
  { id: 'solicitado', label: 'Pedido ao gestor' },
  { id: 'liberado', label: 'Liberado' },
  { id: 'recusado', label: 'Recusado' },
  { id: 'usado', label: 'Usado' },
  { id: 'expirado', label: 'Expirado' },
] as const;

/** "Acima de 5 por semana" ganha a oferta do voucher (5 não ganha). */
export const VOUCHER_MINIMO_SEMANA = 5;

/** Quem disse "não quis" volta para a rota depois disso. */
export const DIAS_NAO_QUIS = 30;
