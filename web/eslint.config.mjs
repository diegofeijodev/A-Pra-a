import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // A sessão vive só no arquivo de storage — convenção do freela-web-v2.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/modules/auth/infrastructure/auth.storage.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'Use modules/auth/infrastructure/auth.storage.ts.' },
      ],
    },
  },
  {
    // Kit shadcn copiado do protótipo — não é código nosso, não reformatamos.
    files: ['src/components/ui/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
];

export default config;
