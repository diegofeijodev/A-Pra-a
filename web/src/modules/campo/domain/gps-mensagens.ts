export type MotivoGps = 'negado' | 'indisponivel' | 'tempo' | 'sem_suporte' | 'inseguro';

/** `GeolocationPositionError.code` → motivo. */
export function motivoDoErro(code: number | undefined): MotivoGps {
  if (code === 1) return 'negado';
  if (code === 3) return 'tempo';
  return 'indisponivel';
}

/** GPS negado → a ação não acontece e a tela ensina a liberar (spec §9). */
export const MENSAGEM_GPS: Record<MotivoGps, { titulo: string; passos: string[] }> = {
  negado: {
    titulo: 'A localização está bloqueada para este site',
    passos: [
      'iPhone (Safari): Ajustes → Privacidade e Segurança → Serviços de Localização → Safari → "Ao Usar o App". Depois, no Safari, toque em "aA" na barra de endereço → Ajustes do Site → Localização → Permitir.',
      'Android (Chrome): toque no cadeado ao lado do endereço → Permissões → Localização → Permitir.',
      'Depois, recarregue esta página e tente de novo.',
    ],
  },
  indisponivel: {
    titulo: 'Não foi possível achar sua localização',
    passos: ['Confira se a localização do celular está ligada.', 'Vá para um lugar aberto e tente de novo.'],
  },
  tempo: {
    titulo: 'A localização demorou demais para responder',
    passos: ['Tente de novo em alguns segundos, de preferência fora de prédios.'],
  },
  sem_suporte: {
    titulo: 'Este navegador não informa a localização',
    passos: ['Abra esta página no Safari (iPhone) ou no Chrome (Android).'],
  },
  inseguro: {
    titulo: 'A localização só funciona em endereço seguro (https)',
    passos: ['Abra o Praça Campo pelo endereço com https:// que a equipe mandou.'],
  },
};
