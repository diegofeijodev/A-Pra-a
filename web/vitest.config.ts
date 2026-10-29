import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Só lógica pura do campo (fila offline, dia local, questionário, foto) — sem
// DOM. Um processo só: a máquina do dono trava com paralelismo (CLAUDE.md).
export default defineConfig({
  // O tsconfig usa `jsx: preserve` (Next); o esbuild do vitest precisa do runtime automático para renderizar componentes.
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
