'use client';

import Link from 'next/link';
import { PainelGestor } from '@/components/praca/PainelGestor';

export default function PainelPage() {
  return (
    <>
      <div className="flex items-center justify-end">
        <Link href="/consultores" className="text-sm text-primary hover:underline">
          ← Consultores
        </Link>
      </div>
      <PainelGestor />
    </>
  );
}
