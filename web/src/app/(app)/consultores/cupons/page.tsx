'use client';

import Link from 'next/link';
import { CuponsEquipe } from '@/components/praca/CuponsEquipe';

export default function CuponsPage() {
  return (
    <>
      <div className="flex items-center justify-end">
        <Link href="/consultores" className="text-sm text-primary hover:underline">
          ← Consultores
        </Link>
      </div>
      <CuponsEquipe />
    </>
  );
}
