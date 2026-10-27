import { EmBreve } from '@/components/ui/EmBreve';

/**
 * Desempenho da equipe (Lovable `desempenho.tsx`, arquitetura §5 E5.10): "Em construção", igual à Lovable. Fica FORA do menu da
 * equipe — o endereço existe porque a Lovable o tem (o representante que abre `/desempenho` cai na aba dele, `enderecos.ts`).
 */
export default function DesempenhoPage() {
  return <EmBreve titulo="Desempenho" descricao="Seus indicadores de visitas, cadastros e conversão." />;
}
