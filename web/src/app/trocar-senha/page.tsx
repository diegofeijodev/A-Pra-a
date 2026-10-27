import type { Metadata } from 'next';
import { TrocaSenhaEquipe } from '@/components/entrada/TrocaSenhaEquipe';

export const metadata: Metadata = {
  title: 'Trocar senha — Praça',
  description: 'Defina uma nova senha de acesso.',
};

export default function TrocarSenhaPage() {
  return <TrocaSenhaEquipe />;
}
