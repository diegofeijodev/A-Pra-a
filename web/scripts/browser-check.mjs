// Passeio headless pelo PRAÇA: entra pelo formulário, abre as 10 telas do app e
// o formulário público, e faz AÇÕES DE VERDADE (concluir uma ação e desfazer,
// criar um lead e movê-lo de etapa, montar um disparo em fila e marcá-lo
// enviado, lançar um indicador à mão) — cada uma com a limpeza dentro do
// próprio roteiro, para o banco terminar igual ao seed e o script poder rodar de
// novo em seguida.
//
// Três coisas que o roteiro garante, e que a primeira versão não garantia:
//
// 1. **pré-condições afirmadas.** O roteiro depende do seed (a praça, o dono sem
//    lead nenhum, a tabela de disparos vazia, o indicador `falta` sem
//    histórico). Elas são conferidas ANTES de serem usadas: quando o seed
//    mudar, a falha diz o que mudou em vez de estourar no meio.
// 2. **limpeza que repara, não só afirma.** Tudo que o roteiro cria sai no
//    `finally`, cada passo no seu próprio `try` — inclusive a CONCLUSÃO DA AÇÃO
//    (`POST /v1/actions/:id/uncomplete`), que antes só era afirmada: uma falha
//    entre concluir e desfazer deixava a linha em `action_completions` e **toda**
//    rodada seguinte falhava até alguém mexer no banco à mão.
// 3. **faxina de entrada.** Resíduo de uma rodada anterior interrompida (lead
//    `Casa Browser-Check …`, disparo, lançamento de indicador, conclusão de
//    ação) é apagado no começo, com aviso.
//
// Qualquer erro de console, qualquer `pageerror`, qualquer falha de rede
// (`requestfailed`) e qualquer resposta HTTP ≥ 400 derrubam a rodada. Não há
// exceção esperada: `GET /v1/freela/status` responde 200 com
// `configured: false` quando o Freela não está configurado, e a tela do Freela
// não chama mais nenhuma rota `/v1/freela/*` sem conexão. As duas únicas
// tolerâncias são do servidor de desenvolvimento do Next e estão em listas
// FECHADAS, com motivo: `IGNORADAS` (404 do `hot-update.json`) e
// `REDE_IGNORADA` (pré-carregamento `_rsc` cancelado pelo roteador).
//
// A conta vem de `PRACA_CHECK_EMAIL` / `PRACA_CHECK_PASSWORD` (padrão: a conta
// admin do seed) e o login é feito PELO FORMULÁRIO — `?demo=1` só existe com
// `NEXT_PUBLIC_DEMO_LOGIN=1` no ambiente do web.
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
/** Prefixo fixo: é por ele que a faxina de entrada acha lead de rodada morta. */
const LEAD_PREFIXO = 'Casa Browser-Check';
const LEAD_NOME = `${LEAD_PREFIXO} ${CARIMBO}`;
const EMAIL = process.env.PRACA_CHECK_EMAIL ?? 'diego@praca.local';
const SENHA = process.env.PRACA_CHECK_PASSWORD ?? 'praca123';

/** Consultor de campo criado pelo roteiro — prefixos fixos: é por eles que a faxina acha resíduo. */
const CAMPO_PREFIXO = 'campo-browser-check-';
const CAMPO_EMAIL = `${CAMPO_PREFIXO}${CARIMBO}@praca.local`;
const CAMPO_NOME = `Consultor Check ${CARIMBO}`;
const CAMPO_SENHA_NOVA = 'campoCheck123';
const CAMPO_LUGAR_PREFIXO = 'Campo Browser-Check';
const CAMPO_LUGAR = `${CAMPO_LUGAR_PREFIXO} ${CARIMBO}`;
/** Posição simulada do celular (Belo Horizonte, praça do seed). */
const POSICAO = { latitude: -19.9245, longitude: -43.9352, accuracy: 15 };

/** CPF válido a partir de uma semente (o CPF do consultor é único). */
function cpfValido(semente) {
  const b = String(semente).replace(/\D/g, '').slice(-9).padStart(9, '1').split('').map(Number);
  const dv = (a) => {
    const s = a.reduce((t, d, i) => t + d * (a.length + 1 - i), 0);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(b);
  return [...b, d1, dv([...b, d1])].join('');
}

/**
 * Respostas ≥ 400 que NÃO são o app quebrado. Lista fechada, com motivo — a
 * versão anterior ignorava `/_next/` inteiro, e aí um 404 num
 * `/_next/static/chunks/*.js` (app quebrado de verdade) passava mudo.
 *
 * `hot-update.json`: o `next dev` recompila e o navegador pergunta por um
 * pedaço de HMR que já não existe. Só acontece com o servidor de
 * desenvolvimento, e é como ele funciona.
 */
const IGNORADAS = [/\/_next\/static\/webpack\/.*\.hot-update\.json$/];
const ignorada = (url) => IGNORADAS.some((re) => re.test(url));

/**
 * Falhas de REDE que não são o app quebrado — também lista fechada, e só por
 * par (padrão de URL + erro exato).
 *
 * `_rsc` + `ERR_ABORTED`: o roteador do Next pré-carrega a rota apontada por um
 * `<Link>` e **cancela** o pedido quando a navegação acontece antes de ele
 * terminar. É o roteador desistindo do que já não precisa; um erro de verdade
 * no mesmo pedido viria como resposta ≥ 400, que continua derrubando a rodada.
 */
const REDE_IGNORADA = [{ url: /[?&]_rsc=/, erro: 'net::ERR_ABORTED' }];
const redeIgnorada = (url, erro) =>
  ignorada(url) || REDE_IGNORADA.some((r) => r.url.test(url) && erro === r.erro);

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
  if (r.status() >= 400 && !ignorada(r.url())) {
    erros.push(`[http ${r.status()}] ${r.request().method()} ${r.url().replace(API, 'api')}`);
  }
});
// Camada de rede: conexão recusada, fetch abortado ou CORS bloqueado não geram
// `response` e podem não gerar erro de console — o cabeçalho promete que
// qualquer falha derruba a rodada, e sem isto faltava justamente a rede.
page.on('requestfailed', (r) => {
  const erro = r.failure()?.errorText ?? '?';
  if (!redeIgnorada(r.url(), erro)) {
    erros.push(`[rede] ${r.method()} ${r.url().replace(API, 'api')} — ${erro}`);
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
/** Ação concluída pelo roteiro: marcada ANTES do desfazer, para o `finally`
 *  reparar mesmo que o clique de "Desfazer conclusão" não ache a linha. */
let acaoConcluida = null;
let consultorId = null;
let leadCampoId = null;
const HOJE = hojeSp();

/** Apaga o que der para apagar, sem derrubar a rodada por causa da limpeza. */
async function tentar(nome, fn) {
  try {
    await fn();
  } catch (e) {
    ko(nome, String(e).slice(0, 200));
  }
}

/** Some com o lançamento de hoje do indicador `falta` (404 = já não existe). */
const apagarFalta = () =>
  api('DELETE', `/v1/indicators/falta/entries?praca_id=${PRACA}&date=${HOJE}`).catch(() => null);

// ── 0. token, faxina de entrada e pré-condições do seed ─────────
// O token sai do login direto na API: a faxina e as afirmações de seed rodam
// ANTES de o navegador abrir, porque é delas que depende o resto do roteiro.
try {
  const sessao = await (
    await fetch(`${API}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: SENHA }),
    })
  ).json();
  token = sessao?.access_token ?? '';
  if (!token) throw new Error(`login na API falhou para ${EMAIL} (defina PRACA_CHECK_EMAIL/PASSWORD)`);

  console.log('-- Faxina de entrada --');
  // Só o lead com o prefixo do roteiro e o lançamento de hoje somem sem
  // perguntar. Apagar TODOS os disparos e desfazer TODAS as conclusões da praça
  // também limpa o que o dono fez à mão no banco local — por isso só roda com
  // `PRACA_CHECK_FAXINA=1`; sem a variável, resíduo de rodada morta derruba a
  // rodada com a instrução, em vez de apagar em silêncio.
  const FAXINA = process.env.PRACA_CHECK_FAXINA === '1';
  const leadsAntes = await api('GET', `/v1/leads?praca_id=${PRACA}&archived=true`);
  const restos = leadsAntes.filter((l) => l.name.startsWith(LEAD_PREFIXO));
  for (const l of restos) {
    console.log(`  faxina: apagando lead residual "${l.name}"`);
    await api('DELETE', `/v1/leads/${l.id}`);
  }
  for (const l of leadsAntes.filter((x) => x.name.startsWith(CAMPO_LUGAR_PREFIXO))) {
    console.log(`  faxina: apagando lead de visita residual "${l.name}"`);
    await api('DELETE', `/v1/leads/${l.id}`);
  }
  for (const c of (await api('GET', '/v1/consultores')).filter((x) => x.email.startsWith(CAMPO_PREFIXO))) {
    console.log(`  faxina: apagando consultor de campo residual ${c.email}`);
    await api('DELETE', `/v1/consultores/${c.id}`);
  }
  await apagarFalta();
  // Disparo do seed não existe (a tabela é global e nasce vazia): o que estiver
  // aqui é de uma rodada interrompida — ou do dono.
  const disparosAntes = await api('GET', '/v1/disparos');
  const acoesAntes = await api('GET', `/v1/actions?praca_id=${PRACA}`);
  const concluidas = acoesAntes.filter((a) => a.completed_at || Object.keys(a.completions ?? {}).length);
  if (FAXINA) {
    for (const d of disparosAntes) {
      console.log(`  faxina: apagando disparo residual ${d.id}`);
      await api('DELETE', `/v1/disparos/${d.id}`);
    }
    for (const a of concluidas) {
      // `once` some com uma chamada (o `date` é ignorado); recorrente é uma
      // chamada por data concluída.
      const datas = Object.keys(a.completions ?? {});
      if (a.completed_at) {
        console.log(`  faxina: desfazendo conclusão residual de "${a.title}"`);
        await api('POST', `/v1/actions/${a.id}/uncomplete`, { date: HOJE });
      }
      for (const d of datas) {
        console.log(`  faxina: desfazendo conclusão residual de "${a.title}" em ${d}`);
        await api('POST', `/v1/actions/${a.id}/uncomplete`, { date: d });
      }
    }
  } else if (disparosAntes.length || concluidas.length) {
    throw new Error(
      `resíduo no banco: ${disparosAntes.length} disparo(s) e ${concluidas.length} ação(ões) concluída(s) na praça do seed. ` +
        'Rode de novo com PRACA_CHECK_FAXINA=1 para apagar (isso também apaga o que foi feito à mão).',
    );
  }

  console.log('-- Pré-condições do seed --');
  const praca0 = await api('GET', `/v1/pracas/${PRACA}`);
  check('praça do seed existe', praca0?.id === PRACA, String(praca0?.id));
  const leads0 = await api('GET', `/v1/leads?praca_id=${PRACA}&archived=true`);
  check('funil do seed com 25 leads', leads0.length === 25, `veio ${leads0.length}`);
  const pessoas0 = await api('GET', '/v1/users');
  const mkt0 = pessoas0.find((u) => u.name === DONO_SEM_LEADS);
  check(`a conta "${DONO_SEM_LEADS}" existe`, !!mkt0);
  check(
    `"${DONO_SEM_LEADS}" não é dono de nenhum lead do seed (é o filtro de 1 lead)`,
    !!mkt0 && leads0.every((l) => l.owner_id !== mkt0.id),
  );
  check('tabela de disparos vazia', (await api('GET', '/v1/disparos')).length === 0);
  const ind0 = await api('GET', `/v1/indicators?scope=praca&praca_id=${PRACA}`);
  const falta0 = ind0.readings.find((r) => r.key === 'falta');
  check('indicador "falta" existe e está sem histórico', !!falta0 && falta0.history.length === 0);
  const acoes0 = await api('GET', `/v1/actions?praca_id=${PRACA}`);
  check(
    'nenhuma ação começa concluída',
    acoes0.every((a) => !a.completed_at && Object.keys(a.completions ?? {}).length === 0),
  );
  check('há ação sem "resultado esperado" para concluir', acoes0.some((a) => !a.expects_result));
  check('nenhum consultor de campo no banco', (await api('GET', '/v1/consultores')).length === 0);
} catch (e) {
  ko('faxina/pré-condições', String(e).slice(0, 300));
}

try {
  // ── 1. entrada ────────────────────────────────────────────────
  console.log('-- Entrada --');
  // Pelo FORMULÁRIO, não por `?demo=1`: o atalho só existe com
  // `NEXT_PUBLIC_DEMO_LOGIN=1` (a senha do admin do seed não fica no pacote).
  await page.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' });
  check('tela de entrada com a marca PRAÇA', (await corpo(page)).includes('checklist de abertura de praças'));
  await page.locator('#email').fill(EMAIL);
  await page.locator('#senha').fill(SENHA);
  check('formulário de entrada preenchido', (await page.locator('#email').inputValue()) === EMAIL);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/hoje', { timeout: 20000 });
  await espera(1500);
  const tokenDoNavegador = await page.evaluate(() => JSON.parse(localStorage.getItem('authUser')).access_token);
  check('login leva para /hoje com sessão guardada', page.url().includes('/hoje') && tokenDoNavegador.length > 20);
  token = tokenDoNavegador;

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
    // Marca ANTES de conferir: se qualquer coisa entre aqui e o desfazer falhar
    // (a linha pode não repintar), é o `finally` que devolve a ação ao seed.
    acaoConcluida = alvo.id;
    await espera(2000);
    check(`ação "${alvo.titulo.slice(0, 40)}" ficou concluída na tela`, (await linhaCom('Desfazer conclusão').count()) === 1);
    check('a conclusão de hoje foi gravada na API', await completadaHoje());
    await linhaCom('Desfazer conclusão').locator('button[aria-label="Desfazer conclusão"]').click();
    await espera(2000);
    check('desfazer devolve a ação para pendente na tela', (await linhaCom('Concluir').count()) === 1);
    const sobrou = await completadaHoje();
    check('a conclusão sumiu da API (sem resíduo)', !sobrou);
    if (!sobrou) acaoConcluida = null;
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
  // O lead já existe no banco neste ponto: qualquer erro daqui para a frente
  // tem de encontrar o id na limpeza, então ele é lido e guardado primeiro.
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
  check('disparo criado', lista.length === 1, `${lista.length} disparo(s)`);
  // A tabela estava vazia (afirmado nas pré-condições): o único disparo é o
  // desta rodada. O id é guardado antes de qualquer afirmação sobre ele.
  disparoId = lista[0]?.id ?? null;
  check('o disparo tem id', !!disparoId);
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
  // Marca antes do clique: o lançamento pode gravar e a tela não repintar.
  indicadorLancado = true;
  await linhaFalta.getByRole('button', { name: '+', exact: true }).click();
  await espera(2200);
  const leituras = await api('GET', `/v1/indicators?scope=praca&praca_id=${PRACA}`);
  const falta = leituras.readings.find((r) => r.key === 'falta');
  check('lançamento à mão gravado no indicador', falta?.history.length === 1 && falta?.value === 2.5, JSON.stringify(falta?.value ?? null));
  check('a tela passa a mostrar o número lançado', (await corpo(page)).includes('2,5'));

  await apagarFalta();
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
    if (r.status() >= 400 && !ignorada(r.url())) {
      erros.push(`[http ${r.status()}/público] ${r.request().method()} ${r.url().replace(API, 'api')}`);
    }
  });
  pub.on('requestfailed', (r) => {
    const erro = r.failure()?.errorText ?? '?';
    if (!redeIgnorada(r.url(), erro)) {
      erros.push(`[rede/público] ${r.url().replace(API, 'api')} — ${erro}`);
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

// ── 13. Campo: o consultor no celular ───────────────────────────
// Bloco próprio: uma falha no roteiro da equipe não pula o do campo, e vice-versa.
/** `true` só durante os passos "sem sinal" — e aí só as falhas da lista fechada abaixo são esperadas. */
let offline = false;
/**
 * Lista FECHADA do que é esperado com o aparelho sem rede: a falha de rede em si
 * (`ERR_INTERNET_DISCONNECTED`) e o websocket de recarga do `next dev`, que cai
 * junto. Qualquer outra coisa derruba a rodada, offline ou não.
 */
const OFFLINE_ESPERADO = [/ERR_INTERNET_DISCONNECTED/, /webpack-hmr|turbopack-hmr|WebSocket/i];
const esperadoOffline = (...textos) => offline && textos.some((t) => OFFLINE_ESPERADO.some((re) => re.test(t)));

/** Os mesmos vigias da página principal, para cada página do campo. */
function vigiar(p, rotulo) {
  p.on('console', (m) => {
    if (m.type() === 'error' && !esperadoOffline(m.text())) {
      erros.push(`[console/${rotulo}] ${p.url().replace(BASE, '')}: ${m.text().slice(0, 200)}`);
    }
  });
  p.on('pageerror', (e) => erros.push(`[pageerror/${rotulo}] ${String(e).slice(0, 200)}`));
  p.on('response', (r) => {
    if (r.status() >= 400 && !ignorada(r.url())) {
      erros.push(`[http ${r.status()}/${rotulo}] ${r.request().method()} ${r.url().replace(API, 'api')}`);
    }
  });
  p.on('requestfailed', (r) => {
    const erro = r.failure()?.errorText ?? '?';
    if (!redeIgnorada(r.url(), erro) && !esperadoOffline(erro, r.url())) {
      erros.push(`[rede/${rotulo}] ${r.method()} ${r.url().replace(API, 'api')} — ${erro}`);
    }
  });
}

const celularCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  geolocation: POSICAO,
  permissions: ['geolocation'],
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
});
const cel = await celularCtx.newPage();
vigiar(cel, 'campo');
/** Situação de hoje do consultor do roteiro, como a equipe vê. */
const situacaoCampo = async () => (await api('GET', '/v1/consultores')).find((c) => c.id === consultorId)?.today;

try {
  console.log('-- Campo: entrada e troca de senha --');
  const criado = await api('POST', '/v1/consultores', {
    name: CAMPO_NOME,
    email: CAMPO_EMAIL,
    phone: '(31) 99999-0000',
    cpf: cpfValido(Date.now()),
    praca_id: PRACA,
    pix_key_type: 'email',
    pix_key: CAMPO_EMAIL,
  });
  consultorId = criado.consultant.id;
  check('equipe cria o consultor e recebe a senha provisória', criado.temp_password?.length === 10);

  const manifesto = await (await fetch(`${BASE}/campo/manifest.webmanifest`)).json();
  check('manifest do atalho "Praça Campo" abre em /campo', manifesto.name === 'Praça Campo' && manifesto.start_url === '/campo');
  const icone = await fetch(`${BASE}/campo/icone/192`);
  check('ícone do atalho é PNG', icone.status === 200 && (icone.headers.get('content-type') ?? '').includes('image/png'));

  await cel.goto(`${BASE}/campo/entrar`, { waitUntil: 'networkidle' });
  check('tela de entrada do campo', (await corpo(cel)).includes('entrada do consultor de campo'));
  await cel.locator('#email').fill(CAMPO_EMAIL);
  await cel.locator('#senha').fill(criado.temp_password);
  await cel.getByRole('button', { name: 'Entrar', exact: true }).click();
  await cel.waitForURL('**/campo/senha', { timeout: 20000 });
  check('senha provisória leva à troca obrigatória', cel.url().endsWith('/campo/senha'));
  await cel.locator('#atual').fill(criado.temp_password);
  await cel.locator('#nova').fill(CAMPO_SENHA_NOVA);
  await cel.locator('#confirma').fill(CAMPO_SENHA_NOVA);
  await cel.getByRole('button', { name: 'Salvar senha', exact: true }).click();
  await cel.waitForURL(/\/campo$/, { timeout: 20000 });
  await espera(1500);
  check('depois da troca, a tela de hoje do consultor', (await corpo(cel)).includes(CAMPO_NOME.toLowerCase()));
  const chaves = await cel.evaluate(() => ({
    campo: JSON.parse(localStorage.getItem('campoSession') ?? 'null'),
    equipe: localStorage.getItem('authUser'),
  }));
  check('sessão do campo numa chave própria, sem sessão da equipe', !!chaves.campo?.access_token && chaves.equipe === null);
  await cel.goto(`${BASE}/hoje`, { waitUntil: 'networkidle' });
  await espera(1200);
  check('consultor não entra nas telas da equipe (volta para /entrar)', new URL(cel.url()).pathname === '/entrar');
  await cel.goto(`${BASE}/campo`, { waitUntil: 'networkidle' });
  await espera(1200);
  check('e volta para o campo com a sessão dele', new URL(cel.url()).pathname === '/campo');
} catch (e) {
  ko('roteiro do campo interrompido', String(e).slice(0, 300));
} finally {
  await celularCtx.close();
}

// ── limpeza: o banco volta ao seed ──────────────────────────────
// CADA passo no seu próprio `try`: com um `try` só, um erro no primeiro
// `DELETE` pulava todos os outros e as afirmações de resíduo — que é como a
// rodada anterior conseguia deixar o banco sujo e derrubar a seguinte.
console.log('-- Limpeza --');

// A conclusão da ação é REPARADA, não só afirmada: `POST
// /v1/actions/:id/uncomplete` é o desfazer que a tela usa.
if (acaoConcluida) {
  await tentar('conclusão de ação desfeita pela API', async () => {
    await api('POST', `/v1/actions/${acaoConcluida}/uncomplete`, { date: HOJE });
    ok('conclusão de ação desfeita pela API');
  });
}
if (indicadorLancado) {
  await tentar('lançamento do indicador apagado', async () => {
    await apagarFalta();
    ok('lançamento do indicador apagado');
  });
}
// Ordem: disparo primeiro (a cascata leva a fila), depois o lead — que leva
// junto os eventos e o `last_contact_at` que "marcar enviada" gravou. É por
// isso que o disparo foi montado sobre um lead criado AQUI: não existe rota
// para desfazer o toque num lead de verdade.
if (disparoId) {
  await tentar('disparo de teste apagado', async () =>
    check('disparo de teste apagado', (await api('DELETE', `/v1/disparos/${disparoId}`)).ok === true),
  );
}
if (leadId) {
  await tentar('lead de teste apagado', async () =>
    check('lead de teste apagado', (await api('DELETE', `/v1/leads/${leadId}`)).ok === true),
  );
}
if (consultorId) {
  await tentar('consultor de campo apagado', async () =>
    check('consultor de campo apagado', (await api('DELETE', `/v1/consultores/${consultorId}`)).ok === true),
  );
}
if (leadCampoId) {
  await tentar('lead da visita de campo apagado', async () =>
    check('lead da visita de campo apagado', (await api('DELETE', `/v1/leads/${leadCampoId}`)).ok === true),
  );
}
await tentar('resíduo: consultores de campo', async () => {
  for (const c of (await api('GET', '/v1/consultores')).filter((x) => x.email.startsWith(CAMPO_PREFIXO))) {
    await api('DELETE', `/v1/consultores/${c.id}`);
  }
  check('nenhum consultor de campo sobrou', (await api('GET', '/v1/consultores')).length === 0);
});

await tentar('resíduo: leads', async () => {
  const leadsFim = await api('GET', `/v1/leads?praca_id=${PRACA}&archived=true`);
  check('funil de volta aos 25 leads do seed', leadsFim.length === 25, `veio ${leadsFim.length}`);
  check(
    'nenhum lead do browser-check sobrou',
    leadsFim.every((l) => !l.name.startsWith(LEAD_PREFIXO)),
  );
  check('nenhum lead de visita de campo sobrou', leadsFim.every((l) => !l.name.startsWith(CAMPO_LUGAR_PREFIXO)));
});
await tentar('resíduo: disparos', async () =>
  check('nenhum disparo sobrou', (await api('GET', '/v1/disparos')).length === 0),
);
await tentar('resíduo: envios', async () =>
  check('nenhum envio sobrou', (await api('GET', '/v1/sends/count')).total === 0),
);
await tentar('resíduo: bloqueio', async () =>
  check('lista de bloqueio vazia', (await api('GET', '/v1/blocklist')).length === 0),
);
await tentar('resíduo: ações', async () => {
  const acoesFim = await api('GET', `/v1/actions?praca_id=${PRACA}`);
  check(
    'nenhuma conclusão de ação sobrou',
    acoesFim.every((a) => !a.completed_at && Object.keys(a.completions ?? {}).length === 0),
  );
});
await tentar('resíduo: indicadores', async () => {
  const indFim = await api('GET', `/v1/indicators?scope=praca&praca_id=${PRACA}`);
  check('nenhum lançamento de indicador sobrou', indFim.readings.every((r) => r.history.length === 0));
});

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
