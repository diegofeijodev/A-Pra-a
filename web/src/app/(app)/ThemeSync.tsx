'use client';

import { useEffect } from 'react';
import { useAuth } from '@/modules/auth/application/use-auth';

/**
 * Tema é preferência de conta, gravada no banco (`users.theme`, §3), não no
 * navegador. O escuro é o padrão do CSS (`:root`); esta classe só liga o claro.
 */
export function ThemeSync() {
  const { user } = useAuth();
  const theme = user?.theme ?? 'dark';

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    // Ao desmontar (sair da área logada), devolve o `<html>` ao padrão escuro —
    // senão o `/entrar` depois do "Sair" ficaria com o tema da conta anterior.
    return () => document.documentElement.classList.remove('light');
  }, [theme]);

  return null;
}
