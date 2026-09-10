import { redirect } from 'next/navigation';

/** A raiz não tem tela própria: quem entra no sistema cai no Hoje. */
export default function Home() {
  redirect('/hoje');
}
