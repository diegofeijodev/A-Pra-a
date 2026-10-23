/**
 * Lote E, L10 (contrato §42.5) — TESTE DE PROTEÇÃO. Percorre TODOS os controllers registrados no Nest (lidos dos módulos a partir
 * do `AppModule`, sem subir nada) e falha se aparecer uma rota de ESCRITA da equipe (POST/PUT/PATCH/DELETE, sem `@CampoRoute()`
 * nem `@Public()`) sem marca de permissão explícita: `@AdminOnly()`, `@GestorOuAdmin()` ou `@Equipe()` NO MÉTODO — na classe só
 * vale `@AdminOnly()` (o padrão restritivo). Assim uma rota nova não fica aberta ao gestor (nem à equipe) por esquecimento.
 */
import { RequestMethod } from '@nestjs/common';
import { PERMISSAO_KEY } from '../decorators/admin-only.decorator';
import { controllersDoApp, ESCRITA, rotasDoApp } from './rotas-do-app';

describe('teste de proteção — toda escrita da equipe tem marca de permissão explícita', () => {
  const rotas = rotasDoApp();
  const escritasDaEquipe = rotas.filter((r) => ESCRITA.has(RequestMethod[r.metodo as keyof typeof RequestMethod]) && !r.campo && !r.publica);

  it('achou os controllers e as rotas de verdade (um glob vazio não pode passar)', () => {
    expect(controllersDoApp().length).toBeGreaterThanOrEqual(40);
    expect(escritasDaEquipe.length).toBeGreaterThanOrEqual(90);
  });

  it('nenhuma rota de escrita da equipe sem @AdminOnly(), @GestorOuAdmin() ou @Equipe()', () => {
    const sem = escritasDaEquipe.filter((r) => !['admin', 'gestor', 'equipe'].includes(String(r.permissao))).map((r) => `${r.metodo} ${r.caminho} (${r.controller.name}.${r.handler})`);
    expect(sem).toEqual([]);
  });

  it('marca permissiva (gestor ou equipe) só no MÉTODO: na classe, só @AdminOnly()', () => {
    const permissivaNaClasse = controllersDoApp()
      .map((C) => [C.name, Reflect.getMetadata(PERMISSAO_KEY, C) as string | undefined] as const)
      .filter(([, p]) => p !== undefined && p !== 'admin');
    expect(permissivaNaClasse).toEqual([]);
  });
});
