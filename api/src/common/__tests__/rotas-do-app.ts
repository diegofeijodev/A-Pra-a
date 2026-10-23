/**
 * Rotas registradas no Nest, lidas dos MÓDULOS a partir do `AppModule` (sem subir nada nem tocar o banco). Usado pelo teste de
 * proteção e pela matriz do gestor (lote E, contrato §42.5).
 */
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSAO_KEY } from '../decorators/admin-only.decorator';
import { CAMPO_ROUTE_KEY } from '../decorators/campo-route.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

type Classe = new (...args: never[]) => unknown;
export const ESCRITA = new Set<number>([RequestMethod.POST, RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE]);
const NOME_METODO: Record<number, string> = { [RequestMethod.POST]: 'POST', [RequestMethod.PUT]: 'PUT', [RequestMethod.PATCH]: 'PATCH', [RequestMethod.DELETE]: 'DELETE' };

export interface RotaNest {
  controller: Classe;
  handler: string;
  metodo: string;
  caminho: string;
  campo: boolean;
  publica: boolean;
  permissao: string | undefined;
}

/** Os controllers de verdade: os declarados nos módulos alcançáveis a partir do `AppModule` (dinâmicos incluídos). */
export function controllersDoApp(): Classe[] {
  // O `ConfigModule.forRoot({ validate })` do AppModule valida o ambiente no import: o mínimo para importar sem banco.
  process.env.DATABASE_URL ??= 'postgresql://x:y@localhost:5437/x';
  process.env.JWT_SECRET ??= 'segredo-de-teste-com-tamanho-suficiente-1234567890';
  const { AppModule } = require('../../app.module') as { AppModule: Classe };
  const vistos = new Set<unknown>();
  const ctrls = new Set<Classe>();
  const visitar = (m: unknown) => {
    if (!m || vistos.has(m)) return;
    vistos.add(m);
    const alvo = (m as { module?: unknown }).module ?? m; // módulo dinâmico: { module, imports, controllers }
    const dinamico = m as { imports?: unknown[]; controllers?: Classe[] };
    for (const c of [...(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, alvo as object) ?? []), ...(dinamico.controllers ?? [])]) ctrls.add(c as Classe);
    for (const i of [...(Reflect.getMetadata(MODULE_METADATA.IMPORTS, alvo as object) ?? []), ...(dinamico.imports ?? [])]) visitar(i);
  };
  visitar(AppModule);
  return [...ctrls];
}

export function rotasDoApp(): RotaNest[] {
  const rotas: RotaNest[] = [];
  for (const C of controllersDoApp()) {
    const base = String(Reflect.getMetadata(PATH_METADATA, C) ?? '');
    const proto = C.prototype as Record<string, unknown>;
    for (const nome of Object.getOwnPropertyNames(proto)) {
      if (nome === 'constructor') continue;
      const h = proto[nome];
      if (typeof h !== 'function') continue;
      const metodo = Reflect.getMetadata(METHOD_METADATA, h) as number | undefined;
      if (metodo === undefined) continue;
      const doMetodo = <T>(k: string): T | undefined => (Reflect.getMetadata(k, h) as T | undefined) ?? (Reflect.getMetadata(k, C) as T | undefined);
      rotas.push({
        controller: C,
        handler: nome,
        metodo: NOME_METODO[metodo] ?? (metodo === RequestMethod.GET ? 'GET' : String(metodo)),
        caminho: `/${base}/${String(Reflect.getMetadata(PATH_METADATA, h) ?? '')}`.replace(/\/+/g, '/').replace(/\/$/, ''),
        campo: doMetodo<boolean>(CAMPO_ROUTE_KEY) === true,
        publica: doMetodo<boolean>(IS_PUBLIC_KEY) === true,
        permissao: doMetodo<string>(PERMISSAO_KEY),
      });
    }
  }
  return rotas;
}

