// Passeio headless pelo PRAÇA: entra pela conta da demonstração, abre as 10
// telas do app e o formulário público, e faz AÇÕES DE VERDADE (concluir uma
// ação e desfazer, criar um lead e movê-lo de etapa, montar um disparo em fila e
// marcá-lo enviado, lançar um indicador à mão) — cada uma com a limpeza dentro
// do próprio roteiro, para o banco terminar igual ao seed e o script poder rodar
// de novo em seguida.
//
// Qualquer erro de console, qualquer `pageerror` e qualquer resposta HTTP ≥ 400
// derrubam a rodada. Não há exceção esperada: `GET /v1/freela/status` responde
// 200 com `configured: false` quando o Freela não está configurado, e a tela do
// Freela não chama mais nenhuma rota `/v1/freela/*` sem conexão.
//
// Requer a API na 3014 (`npm run start:smoke` em `api/`) e o web na 3024
// (`yarn dev` em `web/`) — nunca `next build` (ver CLAUDE.md, "Regras de baixo
// consumo").
//
//   node scripts/browser-check.mjs
import { chromium } from '/home/doutor/coding/freela/freela-web-v2/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:3024';
const API = 'http://localhost:3014';
/** Praça do seed — a mesma do protótipo ("Belo Horizonte + Contagem"). */
const PRACA = '00000000-0000-4000-8000-0000000000aa';
/** "Mkt externo" não é dono de nenhum lead do seed: é o filtro que isola o
 *  lead criado aqui num disparo de UMA mensagem só. */
const DONO_SEM_LEADS = 'Mkt externo';
const CARIMBO = Date.now().toString(36);
const LEAD_NOME = `Casa Browser-Check ${CARIMBO}`;

const erros = [];
let passou = 0;
const ok = (m) => {
  passou += 1;
  console.log(`  OK    ${m}`);
};
const ko = (m, detalhe = '') => {
  erros.push(detalhe ? `${m} — ${detalhe}` : m);
  console.log(`  FALHA ${m}${detalhe ? ` — ${detalhe}` : ''}`);
};
const check = (nome, cond, detalhe = '') => (cond ? ok(nome) : ko(nome, detalhe));
const corpo = async (p) => (await p.locator('body').innerText()).toLowerCase();
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Hoje em Brasília no formato do wire (`YYYY-MM-DD`), como `todaySp()`. */
const hojeSp = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1200 } });
const page = await ctx.newPage();

page.on('console', (m) => {
  if (m.type() === 'error') {
    erros.push(`[console] ${page.url().replace(BASE, '')}: ${m.text().slice(0, 200)}`);
  }
});
page.on('pageerror', (e) => erros.push(`[pageerror] ${page.url().replace(BASE, '')}: ${String(e).slice(0, 200)}`));
page.on('response', (r) => {
  if (r.status() >= 400 && !r.url().includes('/_next/')) {
    erros.push(`[http ${r.status()}] ${r.request().method()} ${r.url().replace(API, 'api')}`);
  }
});
/** Toda chamada a `/v1/freela/*` — sem conexão só `GET /status` pode sair. */
const freelaReqs = [];
page.on('request', (r) => {
  if (r.url().startsWith(`${API}/v1/freela/`)) freelaReqs.push(r.url());
});

/** Chamada direta à API com o token da sessão do navegador (limpeza e conferência). */
let token = '';
async function api(method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const txt = await r.text();
  if (r.status >= 400) throw new Error(`${method} ${path} → ${r.status} ${txt.slice(0, 160)}`);
  return txt ? JSON.parse(txt) : null;
}

// Ids criados pelo roteiro — a limpeza no fim depende deles mesmo se algo falhar.
let leadId = null;
let disparoId = null;
let indicadorLancado = false;

try {
  // ── 1. entrada ────────────────────────────────────────────────
  console.log('-- Entrada --');
  await page.goto(`${BASE}/entrar?demo=1`, { waitUntil: 'networkidle' });
  check('tela de entrada com a marca PRAÇA', (await corpo(page)).includes('checklist de abertura de praças'));
  check('?demo=1 preenche a conta semeada', (await page.locator('#email').inputValue()) === 'diego@praca.local');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/hoje', { timeout: 20000 });
  await espera(1500);
  token = await page.evaluate(() => JSON.parse(localStorage.getItem('authUser')).access_token);
  check('login leva para /hoje com sessão guardada', page.url().includes('/hoje') && token.length > 20);

  // ── 2. Hoje ───────────────────────────────────────────────────
  console.log('-- Hoje --');
  const hoje = await corpo(page);
  check('seletor de pessoa com "Todos"', hoje.includes('todos'));
  check('barra de carga do dia', hoje.includes('ações hoje'));
  check('seção "Atrasado"', hoje.includes('atrasado'));
  check('seção "Para hoje"', hoje.includes('para hoje'));
  check('seção "Próximos 7 dias"', hoje.includes('próximos 7 dias'));
  check('bloco do funil de contratantes', hoje.includes('funil — contratantes'));
  check('botão de nova ação', hoje.includes('nova ação'));

  // Ação pendente de verdade: concluir e desfazer. A linha é escolhida pelo
  // `aria-label` do quadradinho ("Concluir"), e evita-se a que abre o painel
  // pedindo o número (`expects_result`) — nela o clique não conclui nada.
  //
  // A linha vem da seção "Para hoje" de propósito: em "Atrasado" o servidor
  // mostra a ocorrência perdida MAIS ANTIGA da janela de 7 dias (§6), então
  // concluir uma faz a linha sumir e outra data tomar o lugar — não dá para
  // conferir nem para desfazer pela tela. A ocorrência de hoje continua listada
  // depois de concluída, e é o quadradinho que muda de estado.
  const acoes = await api('GET', `/v1/actions?praca_id=${PRACA}`);
  const semResultado = new Set(acoes.filter((a) => !a.expects_result).map((a) => a.title));
  const paraHoje = page.locator('section').filter({ hasText: 'Para hoje' }).first();
  const linhas = paraHoje.locator('div:has(> button[aria-label="Concluir"])');
  let alvo = null;
  for (let i = 0; i < (await linhas.count()); i += 1) {
    const titulo = (await linhas.nth(i).innerText()).split('\n')[0]?.trim() ?? '';
    if (semResultado.has(titulo)) {
      alvo = { titulo, id: acoes.find((a) => a.title === titulo).id };
      break;
    }
  }
  check('há ação de hoje pendente e sem "resultado esperado"', !!alvo, alvo ? '' : 'nenhuma linha pendente');
  if (alvo) {
    // Relocalizar por TÍTULO a cada passo: concluir troca o `aria-label` da
    // linha, e um índice guardado passaria a apontar para a linha vizinha.
    const linhaCom = (label) =>
      paraHoje.locator(`div:has(> button[aria-label="${label}"])`).filter({ hasText: alvo.titulo }).first();
    const completadaHoje = async () => {
      const a = (await api('GET', `/v1/actions?praca_id=${PRACA}`)).find((x) => x.id === alvo.id);
      return a.rec.kind === 'once' ? !!a.completed_at : !!a.completions?.[hojeSp()];
    };
    await linhaCom('Concluir').locator('button[aria-label="Concluir"]').click();
    await espera(2000);
    check(`ação "${alvo.titulo.slice(0, 40)}" ficou concluída na tela`, (await linhaCom('Desfazer conclusão').count()) === 1);
    check('a conclusão de hoje foi gravada na API', await completadaHoje());
    await linhaCom('Desfazer conclusão').locator('button[aria-label="Desfazer conclusão"]').click();
    await espera(2000);
    check('desfazer devolve a ação para pendente na tela', (await linhaCom('Concluir').count()) === 1);
    check('a conclusão sumiu da API (sem resíduo)', !(await completadaHoje()));
  }

  // ── 3. Praça ──────────────────────────────────────────────────
  console.log('-- Praça --');
  await page.goto(`${BASE}/praca`, { waitUntil: 'networkidle' });
  await espera(1500);
  const praca = await corpo(page);
  check('praça do seed no cabeçalho', praca.includes('belo horizonte + contagem'));
  check('faixa de etapas do roteiro', praca.includes('mapear a região') && praca.includes('preparar'));
  check('etapa travada pelo portão aparece', praca.includes('🔒'));
  check('contagem de ações por etapa', /\d+ de \d+/.test(praca));

  // ── 4. Calendário ─────────────────────────────────────────────
  console.log('-- Calendário --');
  await page.goto(`${BASE}/calendario`, { waitUntil: 'networkidle' });
  await espera(1200);
  check('mês e ano no título', /\b(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/.test(await corpo(page)));
  check('botões de navegação do calendário', (await page.getByRole('button', { name: 'Hoje', exact: true }).count()) === 1);
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  await espera(900);
  check('visão de semana abre', (await corpo(page)).includes('semana de'));

  // ── 5. Funil: lead novo, mudança de etapa ─────────────────────
  console.log('-- Funil --');
  await page.goto(`${BASE}/funil`, { waitUntil: 'networkidle' });
  await espera(1600);
  const funil = await corpo(page);
  check('6 cartões de métrica do funil', funil.includes('leads no funil') && funil.includes('valor estimado'));
  check('quadro com as 8 etapas', funil.includes('1. lead novo') && funil.includes('8. perdido / reaquecer'));
  const antes = await api('GET', `/v1/leads?praca_id=${PRACA}`);
  check('funil do seed com 25 leads', antes.length === 25, `veio ${antes.length}`);

  await page.getByRole('button', { name: /Novo lead/ }).click();
  await espera(700);
  check('diálogo "Novo lead" abriu', (await corpo(page)).includes('só o essencial'));
  await page.locator('label:has-text("Estabelecimento") input').fill(LEAD_NOME);
  await page.locator('label:has-text("Telefone") input').fill(`(31) 9${CARIMBO.slice(-4)}-0001`);
  await page.locator('label:has-text("Dono") select').selectOption({ label: DONO_SEM_LEADS });
  await page.getByRole('button', { name: 'Criar lead', exact: true }).click();
  await espera(2000);
  const criados = await api('GET', `/v1/leads?praca_id=${PRACA}`);
  const novo = criados.find((l) => l.name === LEAD_NOME);
  leadId = novo?.id ?? null;
  const pessoas = await api('GET', '/v1/users');
  const mkt = pessoas.find((u) => u.name === DONO_SEM_LEADS);
  check('lead criado pela tela', !!novo);
  check('lead nasce na etapa 1', novo?.stage === 1, `etapa ${novo?.stage}`);
  check(`o dono escolhido (${DONO_SEM_LEADS}) foi gravado`, !!mkt && novo?.owner_id === mkt.id);

  await page.locator('button').filter({ hasText: LEAD_NOME }).first().click();
  await espera(1200);
  check('painel do lead abriu', (await corpo(page)).includes('mover para etapa'));
  await page.locator('aside').last().getByRole('button', { name: '2. Contatado', exact: true }).click();
  await espera(600);
  check('diálogo de mudança de etapa abriu', (await corpo(page)).includes('mudança de etapa'));
  await page.getByPlaceholder('Ex.: ligar para o gerente na quinta').fill('Ligar para o gerente amanhã');
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await espera(2000);
  const movido = await api('GET', `/v1/leads/${leadId}`);
  check('lead foi para a etapa 2 (Contatado)', movido.stage === 2, `etapa ${movido.stage}`);
  check('próximo passo gravado', movido.next_step?.what === 'Ligar para o gerente amanhã');
  check(
    'evento de mudança de etapa na linha do tempo',
    movido.events.some((e) => e.kind === 'stage' || (e.text ?? '').toLowerCase().includes('etapa')),
  );
  check('painel mostra a etapa nova', (await corpo(page)).includes('2. contatado'));
  await page.locator('aside').last().getByRole('button', { name: 'Fechar' }).click();
  await espera(600);

  // ── 6. Entrada de leads ───────────────────────────────────────
  console.log('-- Entrada --');
  await page.goto(`${BASE}/entrada`, { waitUntil: 'networkidle' });
  await espera(1400);
  const entrada = await corpo(page);
  check('título "Entrada de leads"', entrada.includes('entrada de leads'));
  check('caixa de importar arquivo', entrada.includes('1. importar arquivo') && entrada.includes('.csv'));
  check('formulário público de captura com o endereço da praça', entrada.includes('2. formulário de captura') && entrada.includes(`/formulario/${PRACA}`));
  check('fila "Para tocar hoje" e histórico de importações', entrada.includes('para tocar hoje') && entrada.includes('histórico de importações'));

  // ── 7. Mensagens: modelos e disparo em fila ───────────────────
  console.log('-- Mensagens --');
  await page.goto(`${BASE}/mensagens`, { waitUntil: 'networkidle' });
  await espera(1500);
  check('aba de modelos com a biblioteca do seed', (await corpo(page)).includes('8 modelos'));
  await page.getByRole('button', { name: 'disparos', exact: true }).click();
  await espera(1500);
  check('composer do disparo abriu', (await corpo(page)).includes('1. público — filtro do funil'));

  await page.locator('label:has-text("Praça") select').selectOption({ label: 'Belo Horizonte + Contagem' });
  await page.locator('label:has-text("Dono") select').selectOption({ label: DONO_SEM_LEADS });
  await espera(2200);
  const previa = await corpo(page);
  check('o filtro isola 1 lead (o criado agora)', previa.includes('1 leads selecionados'));
  check('prévia mostra 1 mensagem real', previa.includes('prévia de 5 mensagens reais') && previa.includes(LEAD_NOME.toLowerCase()));
  check('nenhuma variável ficou em ⟨⟩ na prévia', !previa.includes('⟨'));
  await page.getByRole('button', { name: /Fila manual/ }).click();
  await espera(500);
  await page.getByRole('button', { name: /Revisar e confirmar/ }).click();
  await espera(700);
  check('caixa "Confirmar disparo" abriu', (await corpo(page)).includes('confirmar disparo'));
  check('a caixa diz quantas mensagens saem', (await corpo(page)).includes('1 mensagens'));
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await espera(2500);

  const lista = await api('GET', '/v1/disparos');
  disparoId = lista[0]?.id ?? null;
  check('disparo criado', lista.length === 1 && !!disparoId, `${lista.length} disparo(s)`);
  check('o lote nasce agendado com 1 na fila', lista[0]?.status === 'agendado' && lista[0]?.counts.queued === 1);
  check('modo do lote é fila', lista[0]?.mode === 'fila');

  await page.getByRole('button', { name: /abrir painel/ }).first().click();
  await espera(1800);
  const painel = await corpo(page);
  check('painel do lote abriu com os 6 números', painel.includes('na fila') && painel.includes('entraram no bloqueio'));
  check('gráfico de respostas por hora', painel.includes('respostas por hora'));
  check('fila manual explica o passo a passo', painel.includes('copie, abra a conversa'));
  await page.getByRole('button', { name: /marcar enviada/ }).click();
  await espera(2200);
  const marcado = await api('GET', `/v1/disparos/${disparoId}`);
  check('marcar enviada tira a mensagem da fila', marcado.stats.queued === 0 && marcado.stats.sent === 1);
  check('o lote fecha quando a fila zera', marcado.disparo.status === 'concluido');
  check('painel na tela mostra a mensagem enviada', (await corpo(page)).includes('enviada'));

  // ── 8. Campanhas ──────────────────────────────────────────────
  console.log('-- Campanhas --');
  await page.goto(`${BASE}/campanhas`, { waitUntil: 'networkidle' });
  await espera(1600);
  const campanhas = await corpo(page);
  check('título de Campanhas (mídia)', campanhas.includes('campanhas'));
  check('as 2 campanhas do seed', campanhas.includes('bh-contratante-cadastro') && campanhas.includes('bh-freelancer'));

  // ── 9. Indicadores: lançar "Falta" à mão ──────────────────────
  console.log('-- Indicadores --');
  await page.goto(`${BASE}/indicadores`, { waitUntil: 'networkidle' });
  await espera(2000);
  const ind = await corpo(page);
  check('os heróis do portão final', ind.includes('clientes ativos') && ind.includes('recontratação'));
  check('lista completa dos indicadores', ind.includes('lista completa dos indicadores'));
  check('indicador "Falta" na lista', ind.includes('falta'));

  const linhaFalta = page
    .locator('tr')
    .filter({ hasText: 'Falta' })
    .filter({ has: page.getByPlaceholder('valor') })
    .first();
  await linhaFalta.getByPlaceholder('valor').fill('2.5');
  await linhaFalta.getByRole('button', { name: '+', exact: true }).click();
  await espera(2200);
  indicadorLancado = true;
  const leituras = await api('GET', `/v1/indicators?scope=praca&praca_id=${PRACA}`);
  const falta = leituras.readings.find((r) => r.key === 'falta');
  check('lançamento à mão gravado no indicador', falta?.history.length === 1 && falta?.value === 2.5, JSON.stringify(falta?.value ?? null));
  check('a tela passa a mostrar o número lançado', (await corpo(page)).includes('2,5'));

  await api('DELETE', `/v1/indicators/falta/entries?praca_id=${PRACA}&date=${hojeSp()}`);
  indicadorLancado = false;
  const depoisDelete = await api('GET', `/v1/indicators?scope=praca&praca_id=${PRACA}`);
  const faltaDepois = depoisDelete.readings.find((r) => r.key === 'falta');
  check('apagar o lançamento devolve o indicador ao estado do seed', faltaDepois?.history.length === 0 && faltaDepois?.stale === true);

  // ── 10. Configurações ─────────────────────────────────────────
  console.log('-- Configurações --');
  await page.goto(`${BASE}/configuracoes`, { waitUntil: 'networkidle' });
  await espera(1600);
  const cfg = await corpo(page);
  check('bloco de pessoas', cfg.includes('pessoas'));
  // Os nomes são campos editáveis: o valor está no `value` do input, não no texto.
  const valores = await page.locator('input').evaluateAll((els) => els.map((e) => e.value));
  check(
    'as 3 contas do seed nos campos de pessoa',
    ['Diego', 'Daniel', 'Mkt externo'].every((n) => valores.includes(n)),
    valores.filter(Boolean).slice(0, 8).join(' | '),
  );
  check('dados da praça', cfg.includes('dados da praça'));
  check('variáveis padrão das mensagens', cfg.includes('variáveis padrão das mensagens'));
  check('roteiro-modelo das próximas praças', cfg.includes('roteiro-modelo'));

  // ── 11. Freela (sem conexão) ──────────────────────────────────
  console.log('-- Freela --');
  await page.goto(`${BASE}/freela`, { waitUntil: 'networkidle' });
  await espera(1800);
  const freela = await corpo(page);
  check('as 3 abas do Freela', freela.includes('campanhas') && freela.includes('automáticas') && freela.includes('conexão'));
  check('cartão de "não configurada" na tela', freela.includes('conexão com o freela não configurada'));
  check('as 3 variáveis de ambiente listadas', freela.includes('freela_api_url') && freela.includes('freela_admin_email') && freela.includes('freela_admin_password'));
  await page.getByRole('button', { name: 'conexão', exact: true }).click();
  await espera(1400);
  const conexao = await corpo(page);
  check('aba Conexão diz que não está configurada', conexao.includes('configurada') && conexao.includes('não'));
  // Sem conexão, a tela pede SÓ o status (200 com `configured: false`). Qualquer
  // outra rota `/v1/freela/*` responderia 503 e sujaria a tela de erro.
  check(
    'a tela do Freela só chama GET /v1/freela/status',
    freelaReqs.length > 0 && freelaReqs.every((u) => u.endsWith('/v1/freela/status')),
    freelaReqs.join(' '),
  );

  // ── 12. Formulário público (contexto novo, sem sessão) ────────
  console.log('-- Formulário público --');
  const anon = await browser.newContext({ viewport: { width: 900, height: 1000 } });
  const pub = await anon.newPage();
  pub.on('console', (m) => {
    if (m.type() === 'error') erros.push(`[console/público] ${m.text().slice(0, 200)}`);
  });
  pub.on('pageerror', (e) => erros.push(`[pageerror/público] ${String(e).slice(0, 200)}`));
  pub.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('/_next/')) {
      erros.push(`[http ${r.status()}/público] ${r.request().method()} ${r.url().replace(API, 'api')}`);
    }
  });
  await pub.goto(`${BASE}/formulario/${PRACA}?origem=organico`, { waitUntil: 'networkidle' });
  await espera(1500);
  const form = await corpo(pub);
  check('manchete do formulário público', form.includes('sua casa fica sem gente'));
  check('a praça do link aparece no texto', form.includes('belo horizonte + contagem'));
  check('campos do formulário', form.includes('nome do estabelecimento') && form.includes('telefone (whatsapp)'));
  check('botão de envio presente', (await pub.getByRole('button', { name: /Quero receber contato/ }).count()) === 1);
  check('formulário público não pede login', !pub.url().includes('/entrar'));
  // Sem sessão, rota do app volta para a entrada — é a guarda do layout.
  await pub.goto(`${BASE}/hoje`, { waitUntil: 'networkidle' });
  await espera(1500);
  check('rota do app sem sessão volta para /entrar', pub.url().includes('/entrar'));
  await anon.close();
} catch (e) {
  ko('roteiro interrompido', String(e).slice(0, 300));
}

// ── limpeza: o banco volta ao seed ──────────────────────────────
console.log('-- Limpeza --');
try {
  if (indicadorLancado) await api('DELETE', `/v1/indicators/falta/entries?praca_id=${PRACA}&date=${hojeSp()}`);
  // Ordem: disparo primeiro (a cascata leva a fila), depois o lead — que leva
  // junto os eventos e o `last_contact_at` que "marcar enviada" gravou. É por
  // isso que o disparo foi montado sobre um lead criado AQUI: não existe rota
  // para desfazer o toque num lead de verdade.
  if (disparoId) check('disparo de teste apagado', (await api('DELETE', `/v1/disparos/${disparoId}`)).ok === true);
  if (leadId) check('lead de teste apagado', (await api('DELETE', `/v1/leads/${leadId}`)).ok === true);

  const leadsFim = await api('GET', `/v1/leads?praca_id=${PRACA}&archived=true`);
  check('funil de volta aos 25 leads do seed', leadsFim.length === 25, `veio ${leadsFim.length}`);
  check('nenhum disparo sobrou', (await api('GET', '/v1/disparos')).length === 0);
  check('nenhum envio sobrou', (await api('GET', '/v1/sends/count')).total === 0);
  check('lista de bloqueio vazia', (await api('GET', '/v1/blocklist')).length === 0);
  const acoesFim = await api('GET', `/v1/actions?praca_id=${PRACA}`);
  check(
    'nenhuma conclusão de ação sobrou',
    acoesFim.every((a) => !a.completed_at && Object.keys(a.completions ?? {}).length === 0),
  );
  const indFim = await api('GET', `/v1/indicators?scope=praca&praca_id=${PRACA}`);
  check('nenhum lançamento de indicador sobrou', indFim.readings.every((r) => r.history.length === 0));
} catch (e) {
  ko('limpeza incompleta', String(e).slice(0, 300));
}

await browser.close();

console.log();
const unicos = [...new Set(erros)];
if (unicos.length) {
  console.log(`${unicos.length} problema(s):`);
  unicos.forEach((e) => console.log('  - ' + e));
  console.log(`\n${passou} checagens ok, ${unicos.length} problema(s).`);
  process.exit(1);
}
console.log(`${passou}/${passou} ok — nenhum erro de console, nenhuma resposta HTTP ≥ 400.`);
