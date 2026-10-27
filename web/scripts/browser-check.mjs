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
// `REDE_IGNORADA` (pré-carregamento `_rsc` cancelado pelo roteador). E há as
// recusas que o próprio roteiro provoca, cada uma numa JANELA aberta só em
// volta do passo e só para o par exato (método + endereço + status):
// `recusaEsperada` (a entrada única tenta a equipe antes do representante; a
// troca de senha com a atual errada) e `esperado401` (a sessão do celular cai
// depois da senha nova).
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
// Markup literal no nome: o nome é digitado pelo consultor e aparece em tooltip do Leaflet (innerHTML) — tem de sair como TEXTO.
const CAMPO_LUGAR = `${CAMPO_LUGAR_PREFIXO} ${CARIMBO} <b>x</b>`;
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
/**
 * Configurações e detalhe da praça (redesenho E5): os blocos nossos ficam em cartões RECOLHIDOS (`<details>`). O texto de dentro
 * não entra no `innerText` nem é visível para o Playwright enquanto o cartão está fechado: abre pelo `summary` antes de ler.
 */
const abrirSecao = async (p, titulo) => {
  const s = p.locator('summary', { hasText: titulo }).first();
  await s.waitFor({ timeout: 20000 });
  if (!(await s.evaluate((el) => el.parentElement.open))) await s.click();
};
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Recusa ESPERADA (redesenho E3): `null` fora da janela. Dentro dela, só o par exato não derruba a rodada:
 * - `POST /v1/auth/login` → 401: a entrada única tenta a EQUIPE primeiro; para um representante ela responde 401 e só então vai o
 *   login do campo (arquitetura §3.2). Cada login de representante pelo formulário abre a janela (`entrarComoRepresentante`).
 * - `POST /v1/auth/change-password` → 400: a troca com a senha atual errada é testada de propósito (não pode derrubar a sessão).
 * O console do Chromium registra a mesma recusa como "Failed to load resource … status of N", com o endereço em `location()`.
 */
let recusaEsperada = null;
// Endereço casado pelo SUFIXO (o web pode falar com a API por outro texto: `127.0.0.1`, barra no fim); método e status, exatos.
const ehRecusaEsperada = (status, metodo, url) =>
  !!recusaEsperada && status === recusaEsperada.status && metodo === recusaEsperada.metodo && url.endsWith(recusaEsperada.caminho);
const consoleDaRecusa = (m) => {
  if (!recusaEsperada || !m.text().includes(`status of ${recusaEsperada.status}`)) return false;
  const onde = m.location()?.url ?? '';
  return onde === '' || onde.endsWith(recusaEsperada.caminho);
};

/** Representante entra pelo formulário único (já aberto em `p`): a 1ª ida (equipe) volta 401 de propósito; fecha quando o campo responde. */
async function entrarComoRepresentante(p, email, senha) {
  await p.locator('#email').fill(email);
  await p.locator('#senha').fill(senha);
  recusaEsperada = { metodo: 'POST', caminho: '/v1/auth/login', status: 401 };
  try {
    const doCampo = p.waitForResponse((r) => r.url().endsWith('/v1/campo/auth/login'), { timeout: 20000 });
    await p.getByRole('button', { name: 'Entrar', exact: true }).click();
    await doCampo;
    await espera(300);
  } finally {
    recusaEsperada = null;
  }
}

/**
 * Mapa do Leaflet aberto em `p` com TODOS os ladrilhos já baixados (o aviso sem pinos não tem mapa: volta na hora). Trocar de visão
 * logo que o `.leaflet-container` aparece desmonta o mapa com os ladrilhos a caminho e o navegador cancela os pedidos
 * (`net::ERR_ABORTED` em `tile.openstreetmap.org`, que derruba a rodada). Lido duas vezes: o enquadramento nos pinos pode pedir
 * outra leva logo depois da primeira. Um ladrilho que falha nunca ganha `leaflet-tile-loaded` — e a falha já derrubaria a rodada.
 */
async function esperarLadrilhos(p) {
  if ((await p.locator('.leaflet-container').count()) === 0) return;
  const prontos = () =>
    p.waitForFunction(() => {
      const t = [...document.querySelectorAll('.leaflet-container .leaflet-tile')];
      return t.length > 0 && t.every((i) => i.classList.contains('leaflet-tile-loaded'));
    }, null, { timeout: 30000 });
  await prontos();
  await espera(500);
  await prontos();
}

/** Hoje em Brasília no formato do wire (`YYYY-MM-DD`), como `todaySp()`. */
const hojeSp = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1200 } });
const page = await ctx.newPage();

page.on('console', (m) => {
  if (m.type() === 'error' && !consoleDaRecusa(m)) {
    erros.push(`[console] ${page.url().replace(BASE, '')}: ${m.text().slice(0, 200)}`);
  }
});
page.on('pageerror', (e) => erros.push(`[pageerror] ${page.url().replace(BASE, '')}: ${String(e).slice(0, 200)}`));
page.on('response', (r) => {
  if (r.status() >= 400 && !ignorada(r.url()) && !ehRecusaEsperada(r.status(), r.request().method(), r.url())) {
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
let leadCampoId2 = null;
/** Fluxo SIMPLES (contrato §31): consultor e lugares próprios, apagados no fim. */
let consultorSimplesId = null;
const leadsSimples = [];
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
  // Entrada única no layout da Lovable (E3): o texto do formulário está sempre à vista; o painel azul, só a partir de `lg`.
  const telaDeEntrada = await corpo(page);
  check('tela de entrada única (Lovable): formulário por e-mail e o painel "Abra praças com método."', telaDeEntrada.includes('use o e-mail e a senha fornecidos') && telaDeEntrada.includes('abra praças com método'));
  await page.locator('#email').fill(EMAIL);
  await page.locator('#senha').fill(SENHA);
  check('formulário de entrada preenchido', (await page.locator('#email').inputValue()) === EMAIL);
  // Casca da Lovable (E2, arquitetura §2.3): a página inicial da equipe é SEMPRE o Dashboard (sem o painel ligado, ele mostra o
  // aviso e a "Atenção agora"); `/hoje` (Ações) é do Comercial e continua abrindo pelo endereço. As `features` ficam guardadas:
  // as seções do Comercial nas Configurações (passo 10) dependem da chave.
  const featIni = (await api('GET', '/v1/consultores/settings/config')).features ?? {};
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/consultores/painel', { timeout: 20000 });
  await espera(1500);
  const tokenDoNavegador = await page.evaluate(() => JSON.parse(localStorage.getItem('authUser')).access_token);
  check('login leva ao Dashboard com sessão guardada', page.url().includes('/consultores/painel') && tokenDoNavegador.length > 20);
  check('login da equipe pela tela única não grava sessão do campo', (await page.evaluate(() => localStorage.getItem('campoSession'))) === null);

  // E3 (arquitetura §3.5): "Trocar senha" no rodapé do menu; com a senha atual ERRADA (só o caminho de erro: a senha do seed não
  // muda) a mensagem aparece e a sessão continua — é 400, não 401.
  console.log('-- Entrada: trocar senha e a equipe em /campo --');
  await page.locator('aside').first().getByRole('link', { name: 'Trocar senha', exact: true }).click();
  await page.waitForURL('**/trocar-senha', { timeout: 20000 });
  await page.getByRole('heading', { name: 'Crie sua nova senha' }).waitFor({ timeout: 20000 });
  check('rodapé do menu: "Trocar senha" abre o cartão pedindo a senha atual', (await page.getByLabel('Senha atual', { exact: true }).count()) === 1);
  await page.locator('#atual').fill('senha-errada-9');
  await page.locator('#nova').fill('NovaSenha123');
  await page.locator('#confirma').fill('NovaSenha123');
  recusaEsperada = { metodo: 'POST', caminho: '/v1/auth/change-password', status: 400 };
  try {
    await page.getByRole('button', { name: 'Salvar senha', exact: true }).click();
    await page.getByText('A senha atual não confere.').waitFor({ timeout: 20000 });
    await espera(300);
  } finally {
    recusaEsperada = null;
  }
  const aindaLogado = await page.evaluate(() => JSON.parse(localStorage.getItem('authUser') ?? 'null')?.access_token);
  check('trocar senha com a atual errada: mostra a mensagem e NÃO derruba a sessão', new URL(page.url()).pathname === '/trocar-senha' && aindaLogado === tokenDoNavegador);
  // A equipe que abre `/campo` passa por `/campo/entrar`, que a reconhece e devolve ao Dashboard (sem laço).
  await page.goto(`${BASE}/campo`, { waitUntil: 'networkidle' });
  await page.waitForURL('**/consultores/painel', { timeout: 20000 });
  check('equipe que abre /campo volta ao Dashboard, sem laço', new URL(page.url()).pathname === '/consultores/painel');
  await page.goto(`${BASE}/hoje`, { waitUntil: 'networkidle' });
  await espera(1000);
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

  // ── 3. Praças (lista + detalhe, E5.2) ─────────────────────────
  console.log('-- Praças --');
  // Abrir o detalhe torna a praça a ativa da conta: guarda a de antes e devolve no fim do bloco (o seed já usa a PRACA).
  const ativaAntesDoDetalhe = (await api('GET', '/v1/auth/me').catch(() => null))?.user?.active_praca_id ?? null;
  await page.goto(`${BASE}/pracas`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Praças', exact: true }).waitFor({ timeout: 20000 });
  const cartaoSeed = page.locator(`a[href="/pracas/${PRACA}"]`);
  await cartaoSeed.waitFor({ timeout: 20000 });
  const textoCartao = (await cartaoSeed.innerText()).toLowerCase();
  check('Praças: cartão do seed com Cidade/UF, situação pelas datas e "N clientes"', textoCartao.includes('belo horizonte + contagem') && /(planejamento|em andamento|concluída)/.test(textoCartao) && /\d+ clientes?/.test(textoCartao), textoCartao.replace(/\s+/g, ' '));
  check('Praças: botão "Nova praça"', (await page.getByRole('button', { name: 'Nova praça' }).count()) >= 1);
  await cartaoSeed.click();
  await page.waitForURL(`**/pracas/${PRACA}`, { timeout: 20000 });
  await page.getByRole('heading', { name: /belo horizonte \+ contagem/i }).waitFor({ timeout: 20000 });
  check('Detalhe da praça: "Editar praça", "Importar planilha" e "Buscar clientes no mapa" (admin)', (await page.getByRole('button', { name: 'Editar praça' }).count()) === 1 && (await page.getByRole('link', { name: 'Importar planilha' }).count()) === 1 && (await page.getByRole('button', { name: 'Buscar clientes no mapa' }).count()) >= 1);
  // O plano de abertura (o conteúdo de `/praca`) mora recolhido no detalhe: abre e espera as etapas.
  await abrirSecao(page, 'Plano de abertura (11 etapas)');
  await page.getByText('Mapear a região', { exact: false }).first().waitFor({ timeout: 20000 });
  await espera(800);
  const praca = await corpo(page);
  check('praça do seed no cabeçalho', praca.includes('belo horizonte + contagem'));
  check('faixa de etapas do roteiro', praca.includes('mapear a região') && praca.includes('preparar'));
  check('etapa travada pelo portão aparece', praca.includes('🔒'));
  check('contagem de ações por etapa', /\d+ de \d+/.test(praca));
  if (ativaAntesDoDetalhe && ativaAntesDoDetalhe !== PRACA) await tentar('praça ativa do admin devolvida (detalhe)', () => api('PATCH', '/v1/users/me', { active_praca_id: ativaAntesDoDetalhe }));

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

  // ── 10. Usuários e Configurações ──────────────────────────────
  // E5.8: "Pessoas" saiu das Configurações e virou a tela Usuários (Lovable), só do admin.
  console.log('-- Usuários --');
  await page.goto(`${BASE}/usuarios`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Usuários', exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: /^Editar / }).first().waitFor({ timeout: 20000 });
  const usu = await corpo(page);
  check('Usuários: as 3 contas do seed na tabela', ['diego', 'rebeca', 'mkt externo'].every((n) => usu.includes(n)), usu.slice(0, 200));
  check('Usuários: "Novo gestor/admin" e "Redefinir senha" (na própria conta, "Trocar senha")', (await page.getByRole('button', { name: 'Novo gestor/admin' }).count()) === 1 && (await page.getByRole('button', { name: 'Redefinir senha' }).count()) >= 2);
  // A senha provisória nasce gerada no navegador (regra mais forte: 12, maiúscula, minúscula, número). NÃO salva: a senha do seed fica.
  await page.getByRole('button', { name: 'Redefinir senha' }).first().click();
  await page.locator('#r-senha').waitFor({ timeout: 10000 });
  const gerada = await page.locator('#r-senha').inputValue();
  check('Redefinir senha: abre com uma senha gerada que cumpre a regra mais forte', gerada.length === 12 && /[A-Z]/.test(gerada) && /[a-z]/.test(gerada) && /[0-9]/.test(gerada), gerada.length ? `${gerada.length} caracteres` : 'vazio');
  await page.keyboard.press('Escape');
  await page.locator('#r-senha').waitFor({ state: 'detached', timeout: 10000 });

  console.log('-- Configurações --');
  await page.goto(`${BASE}/configuracoes`, { waitUntil: 'networkidle' });
  await espera(1600);
  const cfg = await corpo(page);
  check('Configurações: sem o bloco de pessoas (foi para Usuários)', (await page.getByRole('heading', { name: 'Pessoas' }).count()) === 0 && !cfg.includes('+ adicionar'));
  // E5.2: "Dados da praça" e "Áreas de atuação" foram para o detalhe da praça ("Editar praça" e o cartão recolhido).
  check('Configurações: sem "Dados da praça" nem "Áreas de atuação" (foram para o detalhe da praça)', !cfg.includes('dados da praça') && !cfg.includes('áreas de atuação'));
  // Casca da Lovable (contrato §46): as seções do Comercial só com a chave (`TEAM_COMMERCIAL_ENABLED`).
  check('variáveis padrão das mensagens só com o Comercial ligado', cfg.includes('variáveis padrão das mensagens') === !!featIni.commercial);
  check('roteiro-modelo das próximas praças só com o Comercial ligado', cfg.includes('roteiro-modelo') === !!featIni.commercial);

  // Desempenho da equipe (E5.10): "Em construção" como na Lovable; o endereço abre, fora do menu.
  await page.goto(`${BASE}/desempenho`, { waitUntil: 'networkidle' });
  await page.getByText('Em construção').first().waitFor({ timeout: 20000 });
  check('Desempenho (equipe): "Em construção", fora do menu', (await page.locator('aside nav').getByRole('link', { name: 'Desempenho' }).count()) === 0);

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
/** `true` só na janela "nova senha derruba a sessão": o 401 de /v1/campo/ é o comportamento testado. */
let esperado401 = false;
const e401 = (status, url) => esperado401 && status === 401 && url.includes('/v1/campo/');

/** Os mesmos vigias da página principal, para cada página do campo. */
function vigiar(p, rotulo) {
  p.on('console', (m) => {
    if (m.type() === 'error' && !esperadoOffline(m.text()) && !(esperado401 && /401/.test(m.text())) && !consoleDaRecusa(m)) {
      erros.push(`[console/${rotulo}] ${p.url().replace(BASE, '')}: ${m.text().slice(0, 200)}`);
    }
  });
  p.on('pageerror', (e) => erros.push(`[pageerror/${rotulo}] ${String(e).slice(0, 200)}`));
  p.on('response', (r) => {
    if (r.status() >= 400 && !ignorada(r.url()) && !e401(r.status(), r.url()) && !ehRecusaEsperada(r.status(), r.request().method(), r.url())) {
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
  // O roteiro abaixo é o do fluxo COMPLETO. Com `FIELD_VISIT_FLOW_SELECT_ENABLED` ligada e `fluxo_visita` sem escolha (produção hoje), o padrão é
  // o simples: a exceção por consultor (§31.3, só admin) prende ESTE consultor no completo. O simples tem consultor e seção próprios.
  if (criado.consultant.visit_flow_effective === 'simples') {
    await api('PATCH', `/v1/consultores/${consultorId}`, { visit_flow: 'completo' });
    check('fluxo simples é o padrão: o consultor do roteiro completo ganha a exceção "completo"', (await api('GET', `/v1/consultores/${consultorId}`)).visit_flow_effective === 'completo');
  }
  // Lote E §41.2: a senha provisória passou a 12 caracteres (a política mais forte permitida), com ou sem a flag.
  check('equipe cria o consultor e recebe a senha provisória (12 caracteres)', criado.temp_password?.length === 12);

  const manifesto = await (await fetch(`${BASE}/campo/manifest.webmanifest`)).json();
  check('manifest do atalho "Praça Campo" abre em /campo', manifesto.name === 'Praça Campo' && manifesto.start_url === '/campo');
  const icone = await fetch(`${BASE}/campo/icone/192`);
  check('ícone do atalho é PNG', icone.status === 200 && (icone.headers.get('content-type') ?? '').includes('image/png'));

  // Entrada única (E3): o representante entra pelo MESMO `/entrar` da equipe e cai na troca da senha provisória, dentro de `/campo`.
  await cel.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' });
  check('representante abre a entrada única (/entrar, 390 px)', (await corpo(cel)).includes('use o e-mail e a senha fornecidos'));
  await entrarComoRepresentante(cel, CAMPO_EMAIL, criado.temp_password);
  await cel.waitForURL('**/campo/senha', { timeout: 20000 });
  check('senha provisória leva à troca obrigatória', cel.url().endsWith('/campo/senha'));
  // Lote E §41.2: com a regra ligada, ela aparece ANTES do erro (marcada ao vivo); desligada, a tela é a de hoje.
  const politicaSenha = await (await fetch(`${API}/v1/password-policy`)).json();
  if (politicaSenha.enabled) {
    await cel.getByText('Uma letra maiúscula').waitFor({ timeout: 20000 });
    await cel.locator('#nova').fill('fraca');
    check('L9: a regra da senha nova aparece marcada ao vivo (✕ maiúscula com "fraca")', (await cel.locator('#regra-senha li', { hasText: 'Uma letra maiúscula' }).innerText()).includes('✕'));
  } else {
    check('L9 desligado: a troca de senha sem a lista da regra', (await cel.getByText('Uma letra maiúscula').count()) === 0);
  }
  await cel.locator('#atual').fill(criado.temp_password);
  await cel.locator('#nova').fill(CAMPO_SENHA_NOVA);
  await cel.locator('#confirma').fill(CAMPO_SENHA_NOVA);
  await cel.getByRole('button', { name: 'Salvar senha', exact: true }).click();
  await cel.waitForURL(/\/campo$/, { timeout: 20000 });
  await espera(1500);
  check('depois da troca, a tela de hoje do consultor', (await corpo(cel)).includes(CAMPO_NOME.toLowerCase()));
  // Casca do representante (redesenho E4, UX §2.5): faixa azul com "Sair" e as 5 abas da Lovable embaixo, "Hoje" acesa.
  const secoes = cel.getByRole('navigation', { name: 'Seções' });
  const abasRep = secoes.getByRole('button');
  check(
    'E4: as 5 abas do representante na Hoje (Hoje, Mapa, Clientes, Desempenho, Carteira)',
    JSON.stringify((await abasRep.allInnerTexts()).map((t) => t.trim())) === JSON.stringify(['Hoje', 'Mapa', 'Clientes', 'Desempenho', 'Carteira']),
  );
  check('E4: "Hoje" é a aba acesa (aria-current)', (await secoes.getByRole('button', { name: 'Hoje', exact: true }).getAttribute('aria-current')) === 'page');
  const alturasAbas = await abasRep.evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().height));
  check('E4: as 5 abas com alvo de toque ≥ 44 px', alturasAbas.length === 5 && alturasAbas.every((h) => h >= 44), JSON.stringify(alturasAbas));
  check('E4: "Sair" na faixa do topo (ícone com nome)', (await cel.getByRole('button', { name: 'Sair', exact: true }).count()) === 1);
  const chaves = await cel.evaluate(() => ({
    campo: JSON.parse(localStorage.getItem('campoSession') ?? 'null'),
    equipe: localStorage.getItem('authUser'),
  }));
  check('sessão do campo numa chave própria, sem sessão da equipe', !!chaves.campo?.access_token && chaves.equipe === null);
  await cel.goto(`${BASE}/hoje`, { waitUntil: 'networkidle' });
  await espera(1200);
  check('representante que abre endereço da equipe cai na casca dele (/campo), não na entrada', new URL(cel.url()).pathname === '/campo');
  await cel.goto(`${BASE}/campo`, { waitUntil: 'networkidle' });
  await espera(1200);
  check('e volta para o campo com a sessão dele', new URL(cel.url()).pathname === '/campo');

console.log('-- Campo: GPS negado --');
  const semGpsCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  try {
    // Negação determinística (o "perguntar" do headless varia por versão).
    await semGpsCtx.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_ok, erro) =>
        erro?.({ code: 1, message: 'User denied Geolocation', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
    });
    const sg = await semGpsCtx.newPage();
    vigiar(sg, 'campo-sem-gps');
    await sg.goto(`${BASE}/campo/entrar`, { waitUntil: 'networkidle' });
    check('o endereço do atalho (/campo/entrar) abre a mesma entrada única', (await corpo(sg)).includes('use o e-mail e a senha fornecidos'));
    await entrarComoRepresentante(sg, CAMPO_EMAIL, CAMPO_SENHA_NOVA);
    await sg.waitForURL(/\/campo$/, { timeout: 20000 });
    await sg.getByRole('button', { name: 'Iniciar jornada' }).click();
    await sg.getByText('A localização está bloqueada para este site').waitFor({ timeout: 15000 });
    const aviso = await corpo(sg);
    check('GPS negado: a tela ensina a liberar no iPhone e no Android', aviso.includes('safari') && aviso.includes('chrome'));
    check('GPS negado: nada foi registrado', (await situacaoCampo())?.status === 'nao_iniciou');
  } finally {
    await semGpsCtx.close();
  }

  console.log('-- Campo: jornada --');
  check('aviso de privacidade antes de iniciar', (await corpo(cel)).includes('a localização só é registrada com a jornada aberta'));
  await cel.getByRole('button', { name: 'Iniciar jornada' }).click();
  await cel.getByRole('button', { name: 'Encerrar jornada' }).waitFor({ timeout: 15000 });
  await cel.waitForFunction(() => !document.body.innerText.toLowerCase().includes('pendente'), null, { timeout: 20000 });
  check('equipe vê o consultor em jornada', (await situacaoCampo())?.status === 'em_jornada');

  console.log('-- Campo: visita (check-in sem sinal, questionário, checkout, CRM) --');
  await cel.getByRole('button', { name: 'Nova visita' }).click();
  await cel.waitForURL(/\/campo\?v=nova/, { timeout: 20000 });
  await cel.getByRole('tab', { name: 'Novo estabelecimento' }).click();
  await cel.locator('#novo-nome').fill(CAMPO_LUGAR);
  await cel.locator('#novo-endereco').fill('Rua do Browser-Check, 100');
  await cel.getByRole('button', { name: 'Continuar', exact: true }).click();
  // Nome com carimbo: nenhum parecido a 100 m → vai direto para a foto.
  await cel.locator('#foto-fachada').waitFor({ timeout: 15000 });
  const jpeg = await cel.evaluate(
    () =>
      new Promise((resolve) => {
        const c = document.createElement('canvas');
        c.width = 2400;
        c.height = 1800;
        const g = c.getContext('2d');
        g.fillStyle = '#2E6F7E';
        g.fillRect(0, 0, c.width, c.height);
        c.toBlob((b) => b.arrayBuffer().then((a) => resolve(Array.from(new Uint8Array(a)))), 'image/jpeg', 0.9);
      }),
  );
  await cel.locator('#foto-fachada').setInputFiles({ name: 'fachada.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg) });
  const previa = cel.getByAltText('Foto da fachada');
  await previa.waitFor({ timeout: 15000 });
  check('foto da fachada aparece antes do check-in (prévia local)', (await previa.getAttribute('src'))?.startsWith('blob:') === true);

  offline = true;
  await celularCtx.setOffline(true);
  await cel.getByRole('button', { name: 'Fazer check-in' }).click();
  // Sem sinal e SEM navegar: a visita abre como visão de /campo.
  await cel.waitForURL(/\/campo\?v=visita&ref=[0-9a-f-]{36}/, { timeout: 20000 });
  await cel.getByText('1 envio pendente').waitFor({ timeout: 15000 });
  const fotoVisita = cel.getByAltText('Foto da fachada');
  await fotoVisita.waitFor({ timeout: 15000 });
  check('sem sinal: o check-in fica na fila e a visita abre com a foto do arquivo local', (await fotoVisita.getAttribute('src'))?.startsWith('blob:') === true);
  check('checkout bloqueado com o questionário vazio', await cel.getByRole('button', { name: 'Fazer checkout' }).isDisabled());
  await celularCtx.setOffline(false);
  offline = false;
  await cel.waitForFunction(() => !document.body.innerText.toLowerCase().includes('pendente'), null, { timeout: 30000 });

  const diaCampo = async () => api('GET', `/v1/consultores/${consultorId}/days/${HOJE}`);
  const visitaEnviada = (await diaCampo()).visits.find((v) => v.lead_name === CAMPO_LUGAR);
  leadCampoId = visitaEnviada?.lead_id ?? null;
  check('sinal de volta: a visita chegou com foto reduzida (≤ 5 MB)', !!visitaEnviada && visitaEnviada.photo_bytes > 0 && visitaEnviada.photo_bytes <= 5 * 1024 * 1024);

  await cel.locator('#q-nome').fill('Maria Check');
  await cel.getByRole('button', { name: 'Dono', exact: true }).click();
  await cel.getByRole('button', { name: 'Cadastrou agora pelo QR', exact: true }).click();
  await cel.getByRole('button', { name: 'Alto', exact: true }).click();
  await cel.locator('#q-vagas').fill('2');
  await cel.getByRole('button', { name: 'Garçom', exact: true }).click();
  await cel.locator('#q-freelas').fill('5');
  await cel.getByRole('button', { name: 'Grupos de WhatsApp', exact: true }).click();
  await cel.getByRole('button', { name: 'Sim', exact: true }).click();
  await cel.locator('#q-retorno-oque').fill('Voltar com proposta');
  await cel.locator('#q-retorno-data').fill(HOJE);
  check('questionário completo libera o checkout', !(await cel.getByRole('button', { name: 'Fazer checkout' }).isDisabled()));

  // Trocar de visão logo depois de digitar (antes da espera do rascunho) não perde nada.
  await cel.getByRole('button', { name: 'QR code' }).click();
  await cel.waitForURL(/\/campo\?v=qr/, { timeout: 15000 });
  check('tela do QR (ou "código pendente" sem Freela configurado)', /aponte a câmera|código no freela ainda está pendente/.test(await corpo(cel)));
  await cel.getByRole('button', { name: 'Voltar' }).click();
  await cel.waitForURL(/\/campo\?v=visita&ref=/, { timeout: 15000 });
  check('ao voltar do QR, o questionário digitado continua preenchido', (await cel.locator('#q-nome').inputValue()) === 'Maria Check');

  await cel.getByRole('button', { name: 'Fazer checkout' }).click();
  await cel.waitForURL(/\/campo(\?v=hoje)?$/, { timeout: 20000 });
  await cel.waitForFunction(() => !document.body.innerText.toLowerCase().includes('pendente'), null, { timeout: 30000 });
  const fechada = (await diaCampo()).visits.find((v) => v.lead_id === leadCampoId);
  check('checkout gravado com as respostas', !!fechada?.checkout_at && fechada.answers.freela_status === 'cadastrou_qr');
  check('equipe vê 1 visita e 1 "cadastrou agora" hoje', (await situacaoCampo())?.visits === 1 && (await situacaoCampo())?.cadastros === 1);
  const leadCampo = await api('GET', `/v1/leads/${leadCampoId}`);
  check(
    'CRM: lead "visita de campo" em "Conversa aberta", decisor e próximo passo da visita',
    leadCampo.origem === 'visita de campo' &&
      leadCampo.stage === 3 &&
      leadCampo.decisor === 'Maria Check' &&
      leadCampo.next_step?.date === HOJE &&
      (leadCampo.events ?? []).some((e) => e.kind === 'visit'),
  );

  // Duas visitas no mesmo aparelho: trocar de uma para outra mostra as respostas DA outra (a visão leva `key`).
  const LUGAR_B = `${CAMPO_LUGAR_PREFIXO} Segundo ${CARIMBO}`;
  await cel.getByRole('button', { name: 'Nova visita' }).click();
  await cel.waitForURL(/\/campo\?v=nova/, { timeout: 20000 });
  await cel.getByRole('tab', { name: 'Novo estabelecimento' }).click();
  await cel.locator('#novo-nome').fill(LUGAR_B);
  await cel.getByRole('button', { name: 'Continuar', exact: true }).click();
  const outro = cel.getByRole('button', { name: 'É outro estabelecimento' });
  await Promise.race([cel.locator('#foto-fachada').waitFor({ timeout: 15000 }), outro.waitFor({ timeout: 15000 })]);
  if (await outro.isVisible()) await outro.click();
  await cel.locator('#foto-fachada').waitFor({ timeout: 15000 });
  await cel.locator('#foto-fachada').setInputFiles({ name: 'fachada2.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg) });
  await cel.getByAltText('Foto da fachada').waitFor({ timeout: 15000 });
  await cel.getByRole('button', { name: 'Fazer check-in' }).click();
  await cel.waitForURL(/\/campo\?v=visita&ref=[0-9a-f-]{36}/, { timeout: 20000 });
  const refB = new URL(cel.url()).searchParams.get('ref');
  await cel.locator('#q-nome').fill('Beto Segundo');
  const refA = fechada?.client_id;
  await cel.evaluate((r) => window.history.pushState(null, '', `/campo?v=visita&ref=${r}`), refA);
  await cel.waitForFunction((n) => document.querySelector('#q-nome')?.value === n, 'Maria Check', { timeout: 10000 });
  check('trocar de visita mostra as respostas da outra (A: Maria Check), não as digitadas na B', (await cel.locator('#q-nome').inputValue()) === 'Maria Check');
  await cel.evaluate((r) => window.history.pushState(null, '', `/campo?v=visita&ref=${r}`), refB);
  await cel.waitForFunction((n) => document.querySelector('#q-nome')?.value === n, 'Beto Segundo', { timeout: 10000 });
  check('e de volta à B, o que foi digitado nela foi guardado', (await cel.locator('#q-nome').inputValue()) === 'Beto Segundo');
  await cel.getByRole('button', { name: 'Dono', exact: true }).click();
  await cel.getByRole('button', { name: 'Não cadastrou', exact: true }).click();
  await cel.getByRole('button', { name: 'Baixo', exact: true }).click();
  await cel.locator('#q-vagas').fill('0');
  await cel.locator('#q-freelas').fill('1');
  await cel.getByRole('button', { name: 'Nenhum', exact: true }).last().click();
  await cel.getByRole('button', { name: 'Não', exact: true }).click();
  await cel.getByRole('button', { name: 'Fazer checkout' }).click();
  await cel.waitForURL(/\/campo(\?v=hoje)?$/, { timeout: 20000 });
  await cel.waitForFunction(() => !document.body.innerText.toLowerCase().includes('pendente'), null, { timeout: 30000 });
  const fechadaB = (await diaCampo()).visits.find((v) => v.lead_name === LUGAR_B);
  leadCampoId2 = fechadaB?.lead_id ?? null;
  check('a visita B fechou com as próprias respostas (Beto Segundo / não cadastrou)', !!fechadaB?.checkout_at && fechadaB.answers.interlocutor_name === 'Beto Segundo' && fechadaB.answers.freela_status === 'nao_cadastrou');
  check('e a visita A seguiu intacta (Maria Check)', (await diaCampo()).visits.find((v) => v.lead_id === leadCampoId)?.answers.interlocutor_name === 'Maria Check');

  console.log('-- Campo: abas do representante (Mapa, Clientes, Desempenho) --');
  {
    const meC = await cel.evaluate(async (a) => {
      const t = JSON.parse(localStorage.getItem('campoSession') ?? 'null')?.access_token;
      return (await fetch(`${a}/v1/campo/me`, { headers: { Authorization: `Bearer ${t}` } })).json();
    }, API);
    await secoes.getByRole('button', { name: 'Mapa', exact: true }).click();
    await cel.getByRole('heading', { name: 'Mapa', exact: true }).waitFor({ timeout: 15000 });
    check('E4: aba Mapa é a visão ?v=mapa da rota única', new URL(cel.url()).pathname === '/campo' && new URL(cel.url()).search === '?v=mapa');
    if (meC.features?.map_pins) {
      await cel.locator('.leaflet-container').or(cel.getByText('Nenhum cliente seu com localização ainda')).first().waitFor({ timeout: 20000 });
      await esperarLadrilhos(cel);
      check('E4: aba Mapa mostra os clientes dele (pinos ou o aviso)', true);
    } else {
      check('E4: sem FIELD_MAP_PINS_ENABLED, a aba Mapa diz que não está ligado (sem chamar a rota)', (await corpo(cel)).includes('o mapa ainda não está ligado neste servidor'));
    }
    await secoes.getByRole('button', { name: 'Clientes', exact: true }).click();
    await cel.getByRole('heading', { name: 'Clientes', exact: true }).waitFor({ timeout: 15000 });
    await cel.getByText(/Retornos de hoje e atrasados|Nenhum retorno para hoje nem atrasado/).first().waitFor({ timeout: 20000 });
    check('E4: aba Clientes (?v=clientes) abre nos retornos (os que saíram da Hoje)', new URL(cel.url()).search === '?v=clientes');
    const visitados = cel.getByRole('button', { name: 'Visitados', exact: true });
    check('E4: segmento "Visitados" só com o mapa ligado', ((await visitados.count()) === 1) === (meC.features?.map_pins === true));
    if (meC.features?.map_pins) {
      await visitados.click();
      await cel.getByTestId('lista-campo').getByText(CAMPO_LUGAR).first().waitFor({ timeout: 20000 });
      check('E4: Clientes > Visitados lista o lugar que ele visitou (GET /v1/campo/map/list)', (await cel.getByTestId('lista-campo').innerText()).includes(CAMPO_LUGAR));
    }
    await secoes.getByRole('button', { name: 'Desempenho', exact: true }).click();
    await cel.getByText('Em construção').waitFor({ timeout: 15000 });
    check('E4: aba Desempenho (?v=desempenho) "Em construção" (D5)', new URL(cel.url()).search === '?v=desempenho');
    await secoes.getByRole('button', { name: 'Hoje', exact: true }).click();
    await cel.getByRole('button', { name: 'Encerrar jornada' }).waitFor({ timeout: 15000 });
    check('E4: aba Hoje volta para /campo', new URL(cel.url()).search === '');
  }

  console.log('-- Campo: encerrar sem sinal (fila offline) --');
  offline = true;
  await celularCtx.setOffline(true);
  // As telas são visões de /campo: trocar de visão não pode buscar nada no servidor.
  await cel.getByRole('button', { name: 'QR code' }).click();
  await cel.getByText(/aponte a câmera|código no Freela ainda está pendente/i).waitFor({ timeout: 5000 });
  check('sem sinal: a visão do QR abre sem navegar (?v=qr)', new URL(cel.url()).search === '?v=qr');
  await cel.getByRole('button', { name: 'Voltar' }).click();
  await cel.getByRole('button', { name: 'Encerrar jornada' }).waitFor({ timeout: 5000 });
  check('sem sinal: voltar à tela de hoje (/campo)', new URL(cel.url()).pathname === '/campo' && new URL(cel.url()).search === '');
  // E4: as abas são visões da mesma rota — trocar sem rede não busca nada no servidor.
  await secoes.getByRole('button', { name: 'Carteira', exact: true }).click();
  await cel.getByRole('heading', { name: 'Carteira', exact: true }).waitFor({ timeout: 5000 });
  check('sem sinal: trocar para a Carteira não navega (?v=carteira)', new URL(cel.url()).search === '?v=carteira');
  await secoes.getByRole('button', { name: 'Hoje', exact: true }).click();
  await cel.getByRole('button', { name: 'Encerrar jornada' }).waitFor({ timeout: 5000 });
  cel.once('dialog', (d) => void d.accept());
  await cel.getByRole('button', { name: 'Encerrar jornada' }).click();
  await cel.getByText('1 envio pendente').waitFor({ timeout: 15000 });
  check('sem sinal: a faixa avisa que envia quando o sinal voltar', (await corpo(cel)).includes('enviando quando voltar o sinal'));
  check('sem sinal: a jornada continua aberta no servidor', (await situacaoCampo())?.status === 'em_jornada');
  await celularCtx.setOffline(false);
  offline = false;
  await cel.waitForFunction(() => !document.body.innerText.toLowerCase().includes('pendente'), null, { timeout: 30000 });
  check('sinal de volta: a fila enviou o encerramento', (await situacaoCampo())?.status === 'encerrou');

  console.log('-- Equipe: Consultores --');
  await page.goto(`${BASE}/consultores`, { waitUntil: 'networkidle' });
  check('menu tem "Representantes"', (await page.getByRole('link', { name: 'Representantes', exact: true }).count()) > 0);
  check('lista mostra o consultor do roteiro, encerrado hoje', (await corpo(page)).includes(CAMPO_NOME.toLowerCase()) && (await corpo(page)).includes('encerrou'));
  await page.getByRole('link', { name: CAMPO_NOME }).click();
  await page.waitForURL(`**/consultores/${consultorId}`, { timeout: 20000 });
  await page.getByText(CAMPO_LUGAR).first().waitFor({ timeout: 20000 });
  const detalhe = await corpo(page);
  check('detalhe: linha do tempo com início, a visita e o fim', detalhe.includes('início da jornada') && detalhe.includes(CAMPO_LUGAR.toLowerCase()) && detalhe.includes('fim da jornada'));
  check('detalhe: respostas da visita', detalhe.includes('maria check') && detalhe.includes('cadastrou agora pelo qr'));
  await page.locator('.leaflet-container').waitFor({ timeout: 20000 });
  // Os check-ins são <path> de círculo (tooltip); a linha do trajeto é um <path> sem arco ("A"/"a"), com ao menos um segmento "L".
  const dTrajeto = await page.locator('.leaflet-container path.leaflet-interactive').evaluateAll((ps) => ps.map((x) => x.getAttribute('d') ?? ''));
  check('detalhe: mapa do dia com a linha do trajeto', dTrajeto.some((d) => /L/.test(d) && !/[Aa]/.test(d)), JSON.stringify(dTrajeto).slice(0, 200));
  // XSS armazenado: o nome da visita tem `<b>x</b>`; o tooltip do check-in tem de mostrar o texto literal, sem elemento <b>.
  // Há um marcador por visita e os dois check-ins caem no MESMO ponto (um cobre o outro): o mouseover vai direto em cada <path>.
  const marcadores = page.locator('.leaflet-container path.leaflet-interactive[d*="a" i]');
  let tipTexto = '';
  let tipBs = -1;
  for (let k = 0; k < (await marcadores.count()); k++) {
    await marcadores.nth(k).dispatchEvent('mouseover');
    const tip = page.locator('.leaflet-tooltip').last();
    await tip.waitFor({ timeout: 10000 });
    const t = await tip.innerText();
    if (t.includes(CARIMBO) && t.includes('<b>')) {
      tipTexto = t;
      tipBs = await tip.locator('b').count();
      break;
    }
    await marcadores.nth(k).dispatchEvent('mouseout');
  }
  check('detalhe: tooltip do check-in mostra o nome como TEXTO (sem HTML injetado)', tipTexto.includes('<b>x</b>') && tipBs === 0, `${JSON.stringify(tipTexto)} b=${tipBs}`);
  const fachada = page.getByAltText(`Fachada — ${CAMPO_LUGAR}`);
  await fachada.waitFor({ timeout: 20000 });
  check('detalhe: foto da fachada carrega pela API', ((await fachada.getAttribute('src')) ?? '').startsWith('blob:'));

  // E5.5 (UX §4.7): "Nova senha provisória" virou "Redefinir senha", com as credenciais no "Acesso gerado" da Lovable.
  await page.getByRole('button', { name: 'Redefinir senha', exact: true }).click();
  await page.getByRole('button', { name: 'Gerar', exact: true }).click();
  await page.getByTestId('senha-provisoria').waitFor({ timeout: 15000 });
  const novaSenha = (await page.getByTestId('senha-provisoria').innerText()).trim();
  check('nova senha provisória aparece uma vez (12 caracteres)', novaSenha.length === 12);
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  // A sessão do celular cai (token_version subiu): o próximo pedido toma 401 e leva a /campo/entrar.
  // Esse 401 é ESPERADO — só nesta janela e só em /v1/campo/ (ver `esperado401` no vigia).
  esperado401 = true;
  try {
    await cel.reload({ waitUntil: 'networkidle' });
    await cel.waitForURL('**/campo/entrar', { timeout: 20000 });
  } finally {
    esperado401 = false;
  }
  check('nova senha derruba a sessão aberta no celular', cel.url().endsWith('/campo/entrar'));

  await page.goto(`${BASE}/configuracoes`, { waitUntil: 'networkidle' });
  // E5.9: cada bloco nosso num cartão recolhido ("Canais de campo", "Remuneração dos representantes"): abre antes de ler.
  await abrirSecao(page, 'Canais de campo');
  check('Configurações: cartão "Canais de campo" com a lista', (await corpo(page)).includes('apps e canais que usa hoje') && (await corpo(page)).includes('grupos de whatsapp'));

  // ── Modo do chefe S2/S3 (contrato §32): só quando a remuneração está ligada no servidor ──
  // O cartão só existe com `features.earnings` (§46); o título é o porteiro deste bloco inteiro.
  if ((await corpo(page)).includes('remuneração dos representantes')) {
    console.log('-- Equipe: Remuneração, modo do chefe (S2) --');
    await abrirSecao(page, 'Remuneração dos representantes');
    await page.getByRole('button', { name: 'Perfil do chefe' }).waitFor({ timeout: 20000 });
    const versoesAntes = (await api('GET', '/v1/consultores/earnings/config')).history.length;
    check('Remuneração: escolha de onde vem o cadastro que paga', (await corpo(page)).includes('de onde vem o cadastro que paga'));
    check('Remuneração: diária e "somar todas as atingidas"', (await corpo(page)).includes('diária (r$)') && (await corpo(page)).includes('quando vários valores de faixa são atingidos'));
    check('Remuneração: botões de perfil do chefe e completo', (await page.getByRole('button', { name: 'Perfil do chefe' }).count()) === 1 && (await page.getByRole('button', { name: 'Perfil completo' }).count()) === 1);
    await page.getByRole('button', { name: 'Perfil do chefe' }).click();
    await page.getByText('A Lovable não tem valores prontos').first().waitFor({ timeout: 10000 });
    check('Perfil do chefe: preenche o formulário e explica que a Lovable não traz valores', (await corpo(page)).includes('metas que somam') && (await corpo(page)).includes('preencha a diária'));
    check('Perfil do chefe: o formulário ganha o limite diário de declarações', (await corpo(page)).includes('limite de declarações por dia'));
    await page.getByRole('button', { name: 'Perfil completo' }).click();
    await page.getByText('Perfil completo: a regra de hoje').first().waitFor({ timeout: 10000 });
    check('Perfil completo: volta à regra de hoje', (await corpo(page)).includes('cadastro confirmado pelo freela, maior faixa, sem diária'));
    check('os perfis só preenchem: nenhuma versão nova foi criada', (await api('GET', '/v1/consultores/earnings/config')).history.length === versoesAntes);
    await page.getByLabel('Simular a semana').check();
    await page.getByText('o consultor ganha').filter({ hasText: 'na semana' }).first().waitFor({ timeout: 15000 });
    check('Simulador: calcula a semana pela mesma função do servidor', (await corpo(page)).includes('dias, o consultor ganha') || (await corpo(page)).includes('dia, o consultor ganha'));
    await page.getByLabel('Simular a semana').uncheck();

    // A tela dos declarados só existe com FIELD_DECLARED_SIGNUPS_ENABLED, lida do `features` (sem sondar rota que dá 404). E5.5: o link
    // saiu do topo de Representantes (o menu e o Financeiro levam lá); o endereço continua abrindo.
    const declaradosLigados = !!(await api('GET', '/v1/consultores/settings/config')).features?.declared_signups;
    if (declaradosLigados) {
      await page.goto(`${BASE}/consultores/declarados`, { waitUntil: 'networkidle' });
      await page.getByText('Resumo do período').waitFor({ timeout: 20000 });
      check('Declarados: relatório com resumo e filtros', (await corpo(page)).includes('resumo do período') && (await corpo(page)).includes('sem correspondência'));
    }
  }

  // ── Restante da Lovable, lote F1 (contrato §43/§45): só com as flags (descobertas pelo `features` da remuneração, sem sondar 404) ──
  // Sem a remuneração ligada a chamada direta dá 404 (fora do navegador: não conta como falha de página) e o bloco não roda.
  const remCfg = await api('GET', '/v1/consultores/earnings/config').catch(() => null);
  const remFeat = remCfg?.features ?? {};
  if (remFeat.monthly_enabled) {
    console.log('-- Equipe: bônus mensal (L11) --');
    const versoesAntesF1 = remCfg.history.length;
    await page.goto(`${BASE}/configuracoes`, { waitUntil: 'networkidle' });
    await abrirSecao(page, 'Remuneração dos representantes');
    await page.locator('#rem-period').waitFor({ timeout: 20000 });
    check('Remuneração: "Mês" entre os períodos das faixas', (await page.locator('#rem-period option[value="month"]').count()) === 1);
    await page.locator('#rem-period').selectOption('month');
    await page.getByText('O bônus do mês é pago no primeiro Pix depois do fim do mês').first().waitFor({ timeout: 10000 });
    check('Mês: a ajuda mostra a data real do Pix (mês → dia do Pix)', /\(\S+ → (seg|ter|qua|qui|sex|sáb|dom) \d{2}\/\d{2}\)/.test(await page.locator('body').innerText()));
    check('Mês: "o maior dos dois" fica desligado e o teto também', (await page.locator('#rem-combine option[value="max"]').isDisabled()) && (await page.locator('#rem-cap').isDisabled()));
    await page.getByLabel('Simular o mês').check();
    // Espera o RESULTADO do simulador (a ajuda do período também diz "O bônus do mês é pago…").
    await page.getByText(/no mês, o bônus do mês é/).first().waitFor({ timeout: 15000 });
    check('Simular o mês: calcula pela mesma função do servidor, com a conta', (await corpo(page)).includes('no mês, o bônus do mês é') && (await corpo(page)).includes('bônus do mês: r$'));
    await page.getByLabel('Simular o mês').uncheck();
    // Voltar para "Dia" refaz a simulação (com pausa de 400 ms): espera a resposta antes de sair da página (senão o POST é abortado).
    const simDia = page.waitForResponse((r) => r.url().includes('/v1/consultores/earnings/simulate'), { timeout: 15000 });
    await page.locator('#rem-period').selectOption('day');
    await simDia;
    await page.waitForLoadState('networkidle');
    check('Mês: só preenche o formulário, nenhuma versão nova', (await api('GET', '/v1/consultores/earnings/config')).history.length === versoesAntesF1);
  }
  if (remFeat.per_consultant_enabled && consultorId) {
    console.log('-- Equipe: regra de pagamento por consultor (L13) --');
    await page.goto(`${BASE}/consultores/${consultorId}`, { waitUntil: 'networkidle' });
    const resumo = page.getByText('Regra de pagamento deste consultor');
    await resumo.first().waitFor({ timeout: 15000 });
    await resumo.first().click();
    await page.getByText('Hoje vale:').first().waitFor({ timeout: 15000 });
    check('Consultor: "Hoje vale: Regra geral · versão N" (sem regra própria)', /hoje vale: regra geral · versão \d+\./.test(await corpo(page)));
    check('Consultor: o calendário fica com a regra geral (sem os campos da semana)', (await page.locator('#rem-wstart').count()) === 0 && (await page.getByRole('button', { name: 'Salvar regra própria' }).count()) === 1);    // O simulador da regra própria roda sozinho ao abrir: espera a resposta antes de sair da página (senão o POST é abortado).
    await page.getByText('o consultor ganha').first().waitFor({ timeout: 15000 });
    check('Consultor: o simulador da regra própria responde pela mesma função do servidor', (await corpo(page)).includes('num dia, o consultor ganha'));
  }

  // ── Restante da Lovable, lote A (contrato §33/§34): links e telas só com as flags; desligadas, nada é sondado (sem 404) ──
  console.log('-- Equipe: lote A da Lovable (painel, resumo do dia, mapa por situação) --');
  const lov = (await api('GET', '/v1/consultores/settings/config')).features ?? {};
  // E5.5 (UX §4.7): os links do topo de Representantes saíram (o menu tem tudo, conferido no bloco do menu); "Em campo hoje" fica embaixo.
  await page.goto(`${BASE}/consultores`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Em campo hoje', exact: true }).waitFor({ timeout: 20000 });
  const linksDoTopo = ['Painel', 'Mapa por situação', 'Mapa de calor', 'Cupons', 'Pagamentos', 'Declarados', 'Roteiros do dia'];
  let linksAchados = 0;
  for (const nome of linksDoTopo) linksAchados += await page.locator('main').getByRole('link', { name: nome, exact: true }).count();
  check('Representantes: sem os links do topo (Painel, Mapa, Cupons, Pagamentos, Declarados, Roteiros)', linksAchados === 0);
  check('Representantes: busca e filtros da Lovable', (await page.getByLabel('Buscar por nome, e-mail ou telefone').count()) === 1 && (await page.getByLabel('Situação', { exact: true }).count()) === 1);
  await page.goto(`${BASE}/consultores/painel`, { waitUntil: 'networkidle' });
  if (lov.dashboard) {
    await page.getByText('Painel ao vivo da operação').first().waitFor({ timeout: 20000 });
    await page.getByText('Visitas concluídas').first().waitFor({ timeout: 20000 });
    check('Painel: os 8 cartões, cada um com "De onde vem"', (await page.getByText('ⓘ De onde vem').count()) === 8);
    // E5.1 (UX §4.1): o período abre em "7 dias" (Lovable) e o ranking leva o nome da Lovable.
    check('Dashboard: abre em "7 dias", com "Ranking dos representantes"', (await page.getByRole('button', { name: '7 dias', exact: true }).getAttribute('aria-pressed')) === 'true' && (await page.getByText('Ranking dos representantes').count()) === 1);
  } else {
    check('Painel desligado: avisa, sem chamar a rota', (await corpo(page)).includes('ainda não está ligado neste servidor'));
  }
  // Lote B (contrato §35.2/§37.2): as seções de configuração só existem com as flags (a leitura é a mesma, 200 sempre).
  // E5.4 (D6): com os planos ligados, Rotas abre em "Clientes"; as seções de configuração ficam em "Dia de cada representante".
  await page.goto(`${BASE}/consultores/roteiros`, { waitUntil: 'networkidle' });
  if (lov.route_plans) await page.getByRole('tab', { name: 'Dia de cada representante' }).click();
  await page.getByText('Chegada ao local').first().waitFor({ timeout: 20000 });
  check('Rotas: "Roteiro da visita (checklist)" só com o checklist ligado', ((await page.getByText('Roteiro da visita (checklist)').count()) === 1) === !!lov.checklist);
  check('Rotas: "Intervalo e almoço do representante" só com o intervalo ligado', ((await page.getByText('Intervalo e almoço do representante').count()) === 1) === !!lov.breaks);
  // E5.3 (UX §4.5): o Mapa é página própria (`/consultores/mapa` até a E7), com a legenda num grupo e as pílulas de praça (a do seed é aberta).
  await page.goto(`${BASE}/consultores/mapa`, { waitUntil: 'networkidle' });
  if (lov.map_pins) {
    const legenda = page.getByRole('group', { name: 'Mostrar ou esconder por situação' });
    await legenda.waitFor({ timeout: 20000 });
    const textoLegenda = (await legenda.innerText()).toLowerCase();
    check('Mapa: legenda com as 7 situações num grupo', textoLegenda.includes('a visitar') && textoLegenda.includes('estabelecimento fechado'));
    check('Mapa: pílula "Todas (n)" das praças abertas, escolhida', (await page.getByRole('button', { name: /^Todas \(\d+\)$/ }).getAttribute('aria-pressed')) === 'true');
    check('Mapa: "Etapa do funil" só com o Comercial', ((await page.getByRole('button', { name: 'Etapa do funil' }).count()) === 1) === !!lov.commercial);
    await page.locator('.leaflet-container').waitFor({ timeout: 30000 });
    await page.waitForLoadState('networkidle');
  } else {
    check('Mapa por situação desligado: avisa, sem chamar a rota', (await corpo(page)).includes('ainda não está ligado neste servidor'));
  }

  // E5.7 (UX §4.9): Financeiro com os três cartões da Lovable sobre o `summary`; a aba "Cadastros declarados" só com a flag (lida do `features`).
  await page.goto(`${BASE}/consultores/pagamentos`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Financeiro', exact: true }).waitFor({ timeout: 20000 });
  if (lov.payouts) {
    await page.getByRole('region', { name: 'Pendente', exact: true }).waitFor({ timeout: 20000 });
    check('Financeiro: cartões "Total a pagar", "Já pago" e "Pendente"', (await page.getByRole('region', { name: 'Total a pagar', exact: true }).count()) === 1 && (await page.getByRole('region', { name: 'Já pago', exact: true }).count()) === 1);
    check('Financeiro: semana com o dia do Pix e "Esta semana" / "Semana passada"', /semana \d{2}\/\d{2} a \d{2}\/\d{2} · pix /.test(await corpo(page)) && (await page.getByRole('button', { name: 'Semana passada', exact: true }).count()) === 1);
    check('Financeiro: aba "Cadastros declarados" só com os declarados ligados', ((await page.getByRole('tab', { name: 'Cadastros declarados' }).count()) === 1) === !!lov.declared_signups);
  } else {
    check('Financeiro desligado: avisa, sem chamar a rota', (await corpo(page)).includes('ainda não está ligado neste servidor'));
  }

  // ── Lote C (contrato §36/§38): só leitura e presença; NADA cria pedido de cupom (o pedido é um fato: não sai pela API) ──
  console.log('-- Equipe: lote C da Lovable (segmentos da busca e cupons) --');
  // E5.6 (UX §4.8): h1 "Vouchers", o seletor da Lovable (Todos / Pendente / Aprovado / Reprovado, abre em Pendente) e "Regras do voucher".
  await page.goto(`${BASE}/consultores/cupons`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Vouchers', exact: true }).waitFor({ timeout: 20000 });
  if (lov.vouchers) {
    // A lista só é pedida depois de `features` chegar: espera a contagem no seletor (só existe com a resposta; o `networkidle` não espera a 2ª busca).
    await page.waitForFunction(() => [...document.querySelectorAll('#vouchers-situacao option')].some((o) => /^Pendente \(\d+\)$/.test(o.textContent.trim())), null, { timeout: 20000 });
    const opcoes = (await page.locator('#vouchers-situacao option').allTextContents()).map((t) => t.trim().replace(/ \(\d+\)$/, ''));
    check('Vouchers: seletor Todos / Pendente / Aprovado / Reprovado, aberto em Pendente', JSON.stringify(opcoes) === JSON.stringify(['Todos', 'Pendente', 'Aprovado', 'Reprovado']) && (await page.locator('#vouchers-situacao').inputValue()) === 'pendente');
    const lc = await api('GET', '/v1/consultores/vouchers?situacao=pedido');
    check('Vouchers: a contagem de Pendente é a do servidor', (await page.locator('#vouchers-situacao option[value="pendente"]').textContent()).trim() === `Pendente (${lc.counts.pedido})`);
    check('Vouchers: sem o cartão "Solicitar voucher" (o pedido nasce na visita)', (await page.getByRole('button', { name: 'Solicitar voucher' }).count()) === 0);
    if (lc.items.length === 0) {
      await page.getByText('Nenhuma solicitação.', { exact: true }).waitFor({ timeout: 20000 });
      check('Vouchers: sem pedido, o estado vazio explica de onde vêm', (await corpo(page)).includes('os representantes pedem o voucher na visita'));
    }
    await page.getByText('Regras do voucher').waitFor({ timeout: 20000 });
    check('Vouchers: "Regras do voucher" para o admin', (await page.getByText('Regras do voucher').count()) === 1);
  } else {
    check('Vouchers desligados: avisa, sem chamar a rota', (await corpo(page)).includes('ainda não está ligado neste servidor'));
  }
  if (lov.dashboard) {
    await page.goto(`${BASE}/consultores/painel`, { waitUntil: 'networkidle' });
    await page.getByText('Visitas concluídas').first().waitFor({ timeout: 20000 });
    check('Painel: cartão "Vouchers" com número só com os cupons ligados ("Não ligado" sem eles)', (await corpo(page)).includes('não ligado neste servidor') === !lov.vouchers);
  }
  await page.goto(`${BASE}/configuracoes`, { waitUntil: 'networkidle' });
  await page.getByText('Configurações').first().waitFor({ timeout: 20000 });
  // E5.9 (UX §4.11): "Segmentos da busca" no topo, à vista (tabela da Lovable, sem cartão recolhido).
  if (lov.segments) await page.getByRole('heading', { name: 'Segmentos da busca', exact: true }).waitFor({ timeout: 20000 });
  check('Configurações: "Segmentos da busca" só com os segmentos ligados', ((await page.getByRole('heading', { name: 'Segmentos da busca', exact: true }).count()) === 1) === !!lov.segments);
  if (lov.segments) {
    await page.getByText(/Busca no mapa: Restaurante ou Lanchonete com cozinha pizza/).first().waitFor({ timeout: 20000 });
    check('Segmentos: os 10 padrão descritos em português (sem etiqueta crua)', (await page.getByText(/^Busca no mapa: /).count()) >= 10);
  }
  await page.goto(`${BASE}/prospeccao`, { waitUntil: 'networkidle' });
  await page.getByText('2. O que buscar').first().waitFor({ timeout: 20000 });
  // Com a flag os chips nascem com os 5 de hoje e viram os segmentos quando a leitura chega: espera um que só existe com ela.
  await page.getByRole('button', { name: lov.segments ? 'Pizzaria' : 'Bares', exact: true }).waitFor({ timeout: 20000 });
  const chips = await page.locator('fieldset', { hasText: '2. O que buscar' }).locator('button[aria-pressed]').count();
  check(`Buscar estabelecimentos: ${lov.segments ? '10 segmentos (Lovable + nossos)' : 'os 5 tipos de hoje'} (${chips})`, chips === (lov.segments ? 10 : 5));

  // ── Lote D (contrato §39/§40): só leitura e presença; NADA gera plano nem busca shopping (a busca chamaria o Overpass) ──
  console.log('-- Equipe: lote D da Lovable (dividir em rotas e shoppings) --');
  // E5.4 (D6, UX §4.6): com os planos ligados a tela abre na aba "Clientes" (a divisão em rotas); sem eles, é o dia, sem abas.
  await page.goto(`${BASE}/consultores/roteiros`, { waitUntil: 'networkidle' });
  if (lov.route_plans) await page.getByRole('tab', { name: 'Clientes', exact: true }).waitFor({ timeout: 20000 });
  else await page.getByText('Chegada ao local').first().waitFor({ timeout: 20000 });
  check('Rotas: aba "Clientes" só com os planos ligados', ((await page.getByRole('tab', { name: 'Clientes', exact: true }).count()) === 1) === !!lov.route_plans);
  check('Rotas: aba "Shoppings" só com os shoppings ligados', ((await page.getByRole('tab', { name: 'Shoppings' }).count()) === 1) === !!lov.malls);
  check('Rotas: sem os planos, a tela é o dia de cada representante, sem abas', !!lov.route_plans === ((await page.getByRole('tablist', { name: 'Rotas' }).count()) === 1));
  if (lov.route_plans) {
    check('Rotas: abre na aba "Clientes" (Lovable, D6)', (await page.getByRole('tab', { name: 'Clientes', exact: true }).getAttribute('aria-selected')) === 'true');
    await page.getByTestId('previa-divisao').filter({ hasText: /÷|Nenhum estabelecimento|Nenhum cliente|Nenhuma área/ }).waitFor({ timeout: 20000 });
    const previa = await page.getByTestId('previa-divisao').innerText();
    check('Rotas > Clientes: a prévia com a conta aparece antes de gerar (R1)', /÷|Nenhum estabelecimento|Nenhum cliente|Nenhuma área/.test(previa));
    check('Rotas > Clientes: dois botões de gerar (carro/moto e a pé)', (await page.getByRole('button', { name: 'Gerar rota de carro/moto' }).count()) === 1 && (await page.getByRole('button', { name: 'Gerar rota a pé' }).count()) === 1);
    check('Rotas > Clientes: "Clientes por rota" e o seletor "Praça" na barra', (await page.getByLabel('Clientes por rota').count()) === 1 && (await page.getByLabel('Praça', { exact: true }).count()) === 1);
  }
  if (lov.malls) {
    await page.getByRole('tab', { name: 'Shoppings' }).click();
    await page.getByTestId('criterio-shopping').waitFor({ timeout: 20000 });
    const crit = await page.getByTestId('criterio-shopping').innerText();
    check('Shoppings: o ⓘ descreve o critério que vale (área) e a marcação à mão', crit.includes('m² de área no mapa aberto') && crit.includes('marque à mão'));
    // Sem centro na praça nem área ativa (o seed), a tela pede uma área no lugar do botão.
    check(
      'Shoppings: "Mapear shoppings da cidade" para o admin, ou o pedido de uma área (não clicado)',
      (await page.getByRole('button', { name: 'Mapear shoppings da cidade' }).count()) === 1 || (await page.getByText('Cadastre uma área de atuação no detalhe da praça').count()) === 1,
    );
  }
  if (lov.route_plans) {
    await page.getByRole('tab', { name: 'Dia de cada representante' }).click();
    await page.getByText('Chegada ao local').first().waitFor({ timeout: 20000 });
    check('Rotas: "Dia de cada representante" continua o roteiro do dia de hoje', (await page.getByText('Chegada ao local').count()) >= 1);
  }

  // ── Lote E (contrato §34.6, §41, §42; UX §3.3, §3.8, §3.9) + casca da Lovable (E2, contrato §46): menu, Clientes, Segurança, Pessoas ──
  console.log('-- Equipe: casca da Lovable (menu) e lote E (Clientes, senha, cadastro, gestor) --');
  // Endereço do Comercial com a chave desligada abre normalmente, só sem item no menu (arquitetura §2.2, D4).
  await page.goto(`${BASE}/funil`, { waitUntil: 'networkidle' });
  await page.locator('aside nav').getByRole('link', { name: 'Praças', exact: true }).waitFor({ timeout: 20000 });
  if (lov.commercial) await page.locator('aside nav').getByRole('group', { name: 'Comercial' }).waitFor({ timeout: 20000 });
  // Nomes e ordem da Lovable (o browser-check entra como admin): cada item de módulo só com a sua flag; Dashboard sempre.
  const menuEsperado = [
    'Dashboard', 'Praças', ...(lov.map_pins ? ['Clientes', 'Mapa'] : []), ...(lov.routes ? ['Rotas'] : []), 'Representantes',
    ...(lov.vouchers ? ['Vouchers'] : []), ...(lov.payouts ? ['Financeiro'] : []), 'Configurações', 'Usuários',
    ...(lov.commercial ? ['Funil', 'Entrada', 'Buscar estabelecimentos', 'Mensagens', 'Campanhas', 'Calendário', 'Indicadores', 'Ações', 'Freela'] : []),
  ];
  // Os itens com flag chegam depois de `features` (o `goto` zera o cache): espera a contagem antes de ler (se não bater, o check mostra o que veio).
  await page.waitForFunction((n) => document.querySelectorAll('aside nav a').length === n, menuEsperado.length, { timeout: 20000 }).catch(() => {});
  const menuNaTela = (await page.locator('aside nav a').allInnerTexts()).map((t) => t.trim());
  check('Menu: nomes e ordem da Lovable, cada item com a sua flag', JSON.stringify(menuNaTela) === JSON.stringify(menuEsperado), menuNaTela.join(' | '));
  check('Menu: grupo "Comercial" só com a chave ligada', ((await page.getByRole('group', { name: 'Comercial' }).count()) >= 1) === !!lov.commercial);
  check('Menu: sem os grupos antigos (Operação de campo, Administração)', (await page.getByRole('group', { name: 'Operação de campo' }).count()) === 0 && (await page.getByRole('group', { name: 'Administração' }).count()) === 0);
  check('Menu: "Funil" aceso só com a chave (endereço direto abre sem item no menu)', ((await page.locator('aside nav a[aria-current="page"]').count()) === 1) === !!lov.commercial);
  if (lov.map_pins) {
    // E5.3 (UX §4.4): Clientes é só a lista, com as pílulas de escolha única da Lovable ("Todos" escolhida; sem "A visitar").
    await page.goto(`${BASE}/consultores/clientes`, { waitUntil: 'networkidle' });
    await page.getByTestId('lista-conta').waitFor({ timeout: 20000 });
    check(
      'Clientes: abre em "Todos" (escolha única), sem a pílula "A visitar", com a conta',
      (await page.getByRole('button', { name: /^Todos/ }).getAttribute('aria-pressed')) === 'true' && (await page.getByRole('button', { name: /^A visitar/ }).count()) === 0,
    );
    check('Clientes: sem as abas antigas (o Mapa é página própria)', (await page.getByRole('tab', { name: 'Mapa', exact: true }).count()) === 0);
    // O endereço antigo do Mapa (o do menu até a E5) continua abrindo: leva à página do Mapa.
    await page.goto(`${BASE}/consultores/clientes?modo=mapa`, { waitUntil: 'networkidle' });
    await page.waitForURL('**/consultores/mapa', { timeout: 20000 });
    await page.locator('.leaflet-container').waitFor({ timeout: 30000 });
    await page.waitForLoadState('networkidle');
    check('Clientes ?modo=mapa (endereço antigo) leva à página do Mapa', new URL(page.url()).pathname === '/consultores/mapa');
  }
  await page.goto(`${BASE}/configuracoes`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Configurações', exact: true }).waitFor({ timeout: 20000 });
  await page.getByText('Canais de campo', { exact: true }).waitFor({ timeout: 20000 });
  if (lov.password_policy) await page.getByText('Segurança', { exact: true }).waitFor({ timeout: 20000 });
  check('Configurações: "Segurança" (regra da senha nova) só com a regra ligada', ((await page.getByText('Segurança', { exact: true }).count()) === 1) === !!lov.password_policy);
  // E5.8: o perfil de cada pessoa mudou para a tela Usuários.
  await page.goto(`${BASE}/usuarios`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Editar / }).first().waitFor({ timeout: 20000 });
  if (lov.team_gestor) await page.getByText('ⓘ O que cada perfil pode fazer').waitFor({ timeout: 20000 });
  check('Usuários: perfil Admin / Gestor / Equipe só com o gestor ligado', ((await page.getByLabel(/^Perfil de /).count()) > 0) === !!lov.team_gestor);
  // E5.5 (UX §4.7): o cadastro da Lovable — "Novo representante", com o endereço à vista ("CEP") e o banco só com o cadastro ligado.
  await page.goto(`${BASE}/consultores`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Novo representante' }).click();
  await page.getByRole('dialog').getByText('Novo representante', { exact: true }).waitFor({ timeout: 20000 });
  check('Novo representante: "CEP" à vista e "Banco / dados bancários" só com o cadastro ligado', ((await page.getByLabel('CEP', { exact: true }).count()) === 1) === !!lov.consultant_profile && ((await page.getByText('Banco / dados bancários').count()) === 1) === !!lov.consultant_profile);
  await page.keyboard.press('Escape');

  // Gestor (§42): só com a flag. A Rebeca do seed vira gestora pela API e volta a equipe no `finally`.
  if (lov.team_gestor) {
    console.log('-- Equipe: entrando como gestor --');
    const rebeca = (await api('GET', '/v1/users')).find((u) => u.email === 'rebeca@praca.local');
    const gestorCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    try {
      await api('PATCH', `/v1/users/${rebeca.id}`, { is_gestor: true });
      const g = await gestorCtx.newPage();
      vigiar(g, 'gestor');
      await g.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' });
      await g.locator('#email').fill('rebeca@praca.local');
      await g.locator('#senha').fill('praca123');
      await g.getByRole('button', { name: 'Entrar', exact: true }).click();
      await g.waitForURL('**/consultores/painel', { timeout: 20000 });
      check('gestor: entra no Dashboard', true);
      // A busca é do grupo Comercial (contrato §46): no menu só com a chave; sem ela, o endereço continua abrindo (abaixo).
      if (lov.commercial) {
        await g.getByRole('link', { name: 'Buscar estabelecimentos', exact: true }).first().waitFor({ timeout: 20000 });
        check('gestor: o menu tem "Buscar estabelecimentos" (só mapa aberto)', true);
      } else {
        await g.locator('aside nav').getByRole('link', { name: 'Representantes', exact: true }).waitFor({ timeout: 20000 });
        check('gestor: sem o Comercial, o menu não tem "Buscar estabelecimentos"', (await g.getByRole('link', { name: 'Buscar estabelecimentos', exact: true }).count()) === 0);
      }
      await g.goto(`${BASE}/consultores`, { waitUntil: 'networkidle' });
      await g.getByRole('button', { name: 'Novo representante' }).waitFor({ timeout: 20000 });
      check('gestor: cria representante ("Novo representante")', true);
      await g.goto(`${BASE}/consultores/roteiros`, { waitUntil: 'networkidle' });
      if (lov.route_plans) await g.getByRole('tab', { name: 'Dia de cada representante' }).click();
      await g.getByText('Chegada ao local').first().waitFor({ timeout: 20000 });
      check('gestor: monta roteiro (botão no lugar de "Só administradores montam roteiros")', (await g.getByText('Só administradores montam roteiros.').count()) === 0);
      await g.goto(`${BASE}/prospeccao`, { waitUntil: 'networkidle' });
      await g.getByText('2. O que buscar').first().waitFor({ timeout: 20000 });
      check('gestor: abre a busca de estabelecimentos', (await g.getByText('Só administradores podem buscar estabelecimentos').count()) === 0);
      // E5.2 (UX §6.2): a busca do gestor também está no detalhe da praça, sem depender do Comercial. A praça ativa da Rebeca no seed
      // já é a PRACA, então abrir o detalhe não muda nada dela.
      await g.goto(`${BASE}/pracas/${PRACA}`, { waitUntil: 'networkidle' });
      await g.getByRole('button', { name: 'Editar praça' }).waitFor({ timeout: 20000 });
      check('gestor: "Buscar clientes no mapa" no detalhe da praça', (await g.getByRole('button', { name: 'Buscar clientes no mapa' }).count()) >= 1);
      const comoGestor = await (await fetch(`${API}/v1/consultores/settings/config`, { method: 'PUT', headers: { Authorization: `Bearer ${await g.evaluate(() => JSON.parse(localStorage.getItem('authUser')).access_token)}`, 'Content-Type': 'application/json' }, body: '{}' })).status;
      check('gestor: configuração continua só do admin (PUT settings/config = 403)', comoGestor === 403);
    } finally {
      await tentar('gestor volta a ser equipe', () => api('PATCH', `/v1/users/${rebeca.id}`, { is_gestor: false }));
      await gestorCtx.close();
    }
  }
} catch (e) {
  ko('roteiro do campo interrompido', String(e).slice(0, 300));
} finally {
  await celularCtx.close();
}

// ── 13b. Campo: o fluxo SIMPLES de ponta a ponta (contrato §31; produção hoje) ──
// Consultor próprio (prefixo de e-mail e de lugar da faxina). O padrão de produção é usado como está: a exceção "simples" só entra se o
// fluxo efetivo dele não for simples (ex.: `fluxo_visita=completo`). Sem a flag do modo, a seção é pulada (não há tela simples).
// Nunca "Cadastrou agora": com FIELD_DECLARED_SIGNUPS_ENABLED a declaração é imutável e o consultor e o lugar não poderiam ser apagados.
const simplesCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  geolocation: POSICAO,
  permissions: ['geolocation'],
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
});
const cs = await simplesCtx.newPage();
vigiar(cs, 'campo-simples');
try {
  console.log('-- Campo: fluxo simples --');
  const EMAIL_S = `${CAMPO_PREFIXO}simples-${CARIMBO}@praca.local`;
  const NOME_S = `Consultor Simples ${CARIMBO}`;
  const criadoS = await api('POST', '/v1/consultores', {
    name: NOME_S,
    email: EMAIL_S,
    phone: '(31) 99999-0001',
    cpf: cpfValido(Date.now() + 7),
    praca_id: PRACA,
    pix_key_type: 'email',
    pix_key: EMAIL_S,
  });
  consultorSimplesId = criadoS.consultant.id;
  let efetivo = criadoS.consultant.visit_flow_effective;
  if (efetivo !== 'simples') {
    await api('PATCH', `/v1/consultores/${consultorSimplesId}`, { visit_flow: 'simples' });
    efetivo = (await api('GET', `/v1/consultores/${consultorSimplesId}`)).visit_flow_effective;
  }
  if (efetivo !== 'simples') {
    console.log('  (FIELD_VISIT_FLOW_SELECT_ENABLED desligada: sem fluxo simples neste servidor — seção pulada)');
  } else {
    const diaS = async () => api('GET', `/v1/consultores/${consultorSimplesId}/days/${HOJE}`);
    /** O Hoje como o próprio consultor vê (token do campo): traz a foto do checklist e os intervalos (lote B). */
    const hojeDoConsultor = () =>
      cs.evaluate(async (api) => {
        const t = JSON.parse(localStorage.getItem('campoSession') ?? 'null')?.access_token;
        return (await fetch(`${api}/v1/campo/today`, { headers: { Authorization: `Bearer ${t}` } })).json();
      }, API);
    const situacaoS = async () => (await api('GET', '/v1/consultores')).find((c) => c.id === consultorSimplesId)?.today;
    const semPendencia = () => cs.waitForFunction(() => !document.body.innerText.toLowerCase().includes('pendente'), null, { timeout: 30000 });

    await cs.goto(`${BASE}/campo/entrar`, { waitUntil: 'networkidle' });
    await entrarComoRepresentante(cs, EMAIL_S, criadoS.temp_password);
    await cs.waitForURL('**/campo/senha', { timeout: 20000 });
    await cs.locator('#atual').fill(criadoS.temp_password);
    await cs.locator('#nova').fill(CAMPO_SENHA_NOVA);
    await cs.locator('#confirma').fill(CAMPO_SENHA_NOVA);
    await cs.getByRole('button', { name: 'Salvar senha', exact: true }).click();
    await cs.waitForURL(/\/campo$/, { timeout: 20000 });
    await cs.getByText('Pronto para sair?').waitFor({ timeout: 20000 });
    const meS = await cs.evaluate(async (api) => {
      const t = JSON.parse(localStorage.getItem('campoSession') ?? 'null')?.access_token;
      const r = await fetch(`${api}/v1/campo/me`, { headers: { Authorization: `Bearer ${t}` } });
      return r.json();
    }, API);
    check('simples: a tela de hoje é a do fluxo simples ("Iniciar o dia")', (await cs.getByRole('button', { name: 'Iniciar o dia' }).count()) === 1 && meS.visit_flow === 'simples');

    await cs.getByRole('button', { name: 'Iniciar o dia' }).click();
    await cs.getByRole('button', { name: 'Encerrar o dia' }).waitFor({ timeout: 20000 });
    await semPendencia();
    check('simples: equipe vê o consultor em jornada', (await situacaoS())?.status === 'em_jornada');

    // Lote D (§39.7): "Próximos dias" só com a flag; abre o calendário (só leitura) e volta para hoje.
    const temProximos = (await cs.getByRole('button', { name: 'Próximos dias' }).count()) > 0;
    check('simples: "Próximos dias" só com os planos de rota ligados', temProximos === (meS.features?.route_plans === true && (await cs.getByText('Sem roteiro para hoje').count()) > 0));
    if (temProximos) {
      await cs.getByRole('button', { name: 'Próximos dias' }).click();
      await cs.getByRole('grid').waitFor({ timeout: 20000 });
      await cs.getByText(/Nenhuma rota neste dia|paradas? ·/).first().waitFor({ timeout: 20000 });
      const cel = await cs.getByRole('grid').getByRole('button').first().boundingBox();
      check('Próximos dias: calendário com células ≥ 48 px (R7)', !!cel && cel.height >= 48 && cel.width >= 40);
      await cs.getByRole('button', { name: 'Ir para hoje' }).click();
      await cs.getByRole('button', { name: 'Encerrar o dia' }).waitFor({ timeout: 20000 });
    }

    // Lote E (UX §2.2): "Lista | Mapa" nas paradas só com o mapa ligado; o mapa lê os pinos dele (precisa de sinal).
    await cs.goto(`${BASE}/campo?v=roteiro`, { waitUntil: 'networkidle' });
    await cs.getByText('Paradas que faltam').waitFor({ timeout: 20000 });
    check('simples: "Lista | Mapa" nas paradas só com o mapa ligado', ((await cs.getByRole('tab', { name: 'Mapa', exact: true }).count()) === 1) === (meS.features?.map_pins === true));
    if (meS.features?.map_pins) {
      await cs.getByRole('tab', { name: 'Mapa', exact: true }).click();
      await cs.locator('.leaflet-container').or(cs.getByText('Nenhum cliente seu com localização ainda')).first().waitFor({ timeout: 20000 });
      await esperarLadrilhos(cs);
      check('simples: o mapa do consultor abre no celular (pinos dele ou o aviso)', true);
    }
    await cs.getByRole('button', { name: 'Voltar', exact: true }).click();
    await cs.getByRole('button', { name: 'Encerrar o dia' }).waitFor({ timeout: 20000 });

    const jpegS = await cs.evaluate(
      () =>
        new Promise((resolve) => {
          const c = document.createElement('canvas');
          c.width = 1200;
          c.height = 900;
          const g = c.getContext('2d');
          g.fillStyle = '#7E2E5F';
          g.fillRect(0, 0, c.width, c.height);
          c.toBlob((b) => b.arrayBuffer().then((a) => resolve(Array.from(new Uint8Array(a)))), 'image/jpeg', 0.9);
        }),
    );
    /** "Visita fora do roteiro" (ou "Visita no caminho") → cadastrar o lugar → Cheguei/foto. Nunca visita lead do seed. */
    const chegar = async (nome) => {
      const fora = cs.getByRole('button', { name: 'Visita fora do roteiro' });
      if ((await fora.count()) > 0) await fora.click();
      else await cs.getByRole('button', { name: 'Visita no caminho' }).click();
      await cs.waitForURL(/\/campo\?v=nova/, { timeout: 20000 });
      await cs.getByRole('button', { name: 'Não está na lista? Cadastrar o lugar' }).click();
      await cs.locator('#novo-nome').fill(nome);
      await cs.locator('#novo-endereco').fill('Rua do Fluxo Simples, 10');
      await cs.getByRole('button', { name: 'Continuar', exact: true }).click();
      const input = cs.getByLabel(`Cheguei em ${nome}: tirar a foto da fachada`);
      const outro = cs.getByRole('button', { name: 'É outro lugar' });
      await Promise.race([input.waitFor({ state: 'attached', timeout: 15000 }), outro.waitFor({ timeout: 15000 })]);
      if (await outro.isVisible()) await outro.click();
      await input.setInputFiles({ name: 'fachada-s.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpegS) });
      await cs.waitForURL(/\/campo\?v=visita&ref=[0-9a-f-]{36}/, { timeout: 20000 });
      await cs.getByText('Como foi a visita?').waitFor({ timeout: 20000 });
      await semPendencia();
      return new URL(cs.url()).searchParams.get('ref');
    };

    // Visita 1: "Sem interesse" + motivo; concluir, DESFAZER, concluir de novo.
    const LUGAR_S1 = `${CAMPO_LUGAR_PREFIXO} Simples A ${CARIMBO}`;
    const refS1 = await chegar(LUGAR_S1);
    const v1 = (await diaS()).visits.find((v) => v.client_id === refS1);
    if (v1) leadsSimples.push(v1.lead_id);
    check('simples: a foto virou a chegada no servidor (fluxo simples, sem conclusão)', !!v1 && v1.flow === 'simples' && !v1.checkout_at);
    check('simples: sem resultado o botão diz o que falta', (await corpo(cs)).includes('falta escolher como foi a visita'));
    // Lote B, L3 (contrato §35): roteiro da conversa + cronômetro só com a flag; sem ela, a tela é a de hoje.
    if (meS.features?.checklist) {
      await cs.getByText('Roteiro da conversa · 0 de 7').waitFor({ timeout: 10000 });
      check('L3: cronômetro da visita aberta (role=timer, sem anúncio)', (await cs.getByRole('timer').getAttribute('aria-live')) === 'off');
      await cs.getByRole('checkbox', { name: /1\. Apresentação pessoal e da empresa/ }).click();
      await cs.getByText('Roteiro da conversa · 1 de 7').waitFor({ timeout: 10000 });
      check('L3: marcar uma etapa = 1 toque na linha', true);
    } else {
      check('sem FIELD_CHECKLIST_ENABLED: nem roteiro da conversa nem cronômetro', !(await corpo(cs)).includes('roteiro da conversa') && (await cs.getByRole('timer').count()) === 0);
    }
    await cs.getByRole('radio', { name: 'Sem interesse', exact: true }).click();
    await cs.getByRole('radio', { name: 'Preço', exact: true }).click();
    // Lote C (§38, UX §3.2): "Pedir cupom" opcional na tela de resultado; abre a visão própria e volta SEM enviar (nada é gravado).
    if (meS.features?.vouchers) {
      const pedir = cs.getByRole('button', { name: 'Pedir cupom da 1ª contratação' });
      await pedir.waitFor({ timeout: 10000 });
      check('C: "Pedir cupom da 1ª contratação" aparece em "Sem interesse"', await pedir.isVisible());
      if (meS.features?.checklist) check('C: atalho "Pedir cupom" na etapa "Oferecer o cupom" do roteiro', (await cs.getByRole('button', { name: /Pedir cupom$/ }).count()) === 1);
      await pedir.click();
      await cs.waitForURL(/\/campo\?v=pedir-cupom&ref=/, { timeout: 15000 });
      await cs.getByText('Falta escolher o ramo.').waitFor({ timeout: 10000 });
      check('C: a visão de pedir mostra o desconto e não deixa enviar sem o ramo', (await corpo(cs)).includes('de desconto') && (await cs.getByRole('button', { name: 'Enviar pedido do cupom' }).isDisabled()));
      await cs.getByRole('button', { name: '← Voltar para a visita' }).click();
      await cs.waitForURL(/\/campo\?v=visita&ref=/, { timeout: 15000 });
      await cs.getByRole('button', { name: 'Concluir: Sem interesse, Preço' }).waitFor({ timeout: 10000 });
      check('C: voltar não envia nada (nenhum pedido no servidor)', (await api('GET', `/v1/consultores/vouchers?consultant_id=${consultorSimplesId}`)).counts.todos === 0);
    } else {
      check('sem FIELD_VOUCHERS_ENABLED: nenhum botão de cupom', (await cs.getByRole('button', { name: /Pedir cupom/ }).count()) === 0);
    }
    const concluir1 = cs.getByRole('button', { name: 'Concluir: Sem interesse, Preço' });
    await concluir1.waitFor({ timeout: 10000 });
    check('simples: resultado em 1 chip + motivo libera "Concluir: Sem interesse, Preço"', !(await concluir1.isDisabled()));
    await concluir1.click();
    await cs.getByRole('button', { name: 'Desfazer' }).click();
    await cs.waitForURL(/\/campo\?v=visita&ref=/, { timeout: 15000 });
    await espera(1500);
    check('simples: "Desfazer" volta para a visita, que segue aberta no servidor', !(await diaS()).visits.find((v) => v.client_id === refS1)?.checkout_at);
    await cs.getByRole('button', { name: 'Concluir: Sem interesse, Preço' }).click();
    await cs.waitForURL(/\/campo(\?v=hoje)?$/, { timeout: 20000 });
    await espera(9000); // o checkout espera os segundos do "Desfazer" na fila
    await semPendencia();
    const f1 = (await diaS()).visits.find((v) => v.client_id === refS1);
    check('simples: concluída com o resultado e o motivo', !!f1?.checkout_at && f1.answers.result === 'sem_interesse' && f1.answers.refusal_reason === 'preco');
    if (meS.features?.checklist) {
      const vck = (await hojeDoConsultor()).visits.find((v) => v.client_id === refS1);
      check('L3: a marca chegou à foto do checklist da visita (1 de 7), fora de answers', vck?.checklist?.done === 1 && vck?.checklist?.total === 7 && !('checklist' in (vck?.answers ?? {})));
    }

    // Lote B, L4 (contrato §37): intervalo — 1 toque para começar, 1 para voltar; a equipe vê "em intervalo".
    if (meS.features?.breaks) {
      await cs.getByRole('button', { name: 'Intervalo', exact: true }).click();
      await cs.getByText(/Em intervalo desde/).waitFor({ timeout: 10000 });
      await espera(9500); // o início espera os segundos do "Desfazer" na fila
      await semPendencia();
      const emIntervalo = await hojeDoConsultor();
      check('L4: intervalo aberto no servidor', !!emIntervalo.breaks_open && emIntervalo.breaks.length === 1);
      const at = (await api('GET', '/v1/consultores/attention')).consultants.find((c) => c.consultant_id === consultorSimplesId);
      check('L4: a equipe vê "em intervalo desde"', !!at?.on_break_since);
      await cs.getByRole('button', { name: 'Voltar do intervalo' }).click();
      await semPendencia();
      await espera(1000);
      const depois = await hojeDoConsultor();
      check('L4: "Voltar do intervalo" encerra (manual) e o botão volta', !depois.breaks_open && depois.breaks[0]?.end_reason === 'manual' && (await cs.getByRole('button', { name: 'Intervalo', exact: true }).count()) === 1);
    } else {
      check('sem FIELD_BREAKS_ENABLED: nenhum botão de intervalo', (await cs.getByRole('button', { name: 'Intervalo', exact: true }).count()) === 0);
    }

    // Visita 2: "Quer retorno" + Amanhã + contato (o padrão exige contato no retorno).
    const LUGAR_S2 = `${CAMPO_LUGAR_PREFIXO} Simples B ${CARIMBO}`;
    const refS2 = await chegar(LUGAR_S2);
    const v2 = (await diaS()).visits.find((v) => v.client_id === refS2);
    if (v2) leadsSimples.push(v2.lead_id);
    if (meS.features?.vouchers) {
      // "Já usa o Freela" não tem 1ª contratação: o botão some (aceite C9). Depois volta para "Quer retorno".
      await cs.getByRole('radio', { name: 'Já usa o Freela', exact: true }).click();
      await espera(300);
      check('C: em "Já usa o Freela" o "Pedir cupom" some', (await cs.getByRole('button', { name: 'Pedir cupom da 1ª contratação' }).count()) === 0);
    }
    await cs.getByRole('radio', { name: 'Quer retorno', exact: true }).click();
    if (meS.features?.vouchers) check('C: em "Quer retorno" o "Pedir cupom" aparece', (await cs.getByRole('button', { name: 'Pedir cupom da 1ª contratação' }).count()) === 1);
    await cs.getByRole('radio', { name: 'Amanhã', exact: true }).click();
    await cs.locator('#r-nome').fill('Rui Simples');
    await cs.getByRole('radio', { name: 'Gerente', exact: true }).click();
    await cs.locator('#r-fone').fill('31988887777');
    // Lote E §41.4: e-mail de quem atendeu (opcional) só com a flag; errado mostra o aviso e não é gravado.
    check('simples: "E-mail de quem atendeu" só com o e-mail ligado', ((await cs.locator('#r-email').count()) === 1) === (meS.features?.contact_email === true));
    if (meS.features?.contact_email) {
      await cs.locator('#r-email').fill('rui-sem-arroba');
      await cs.locator('#r-email').blur();
      await cs.getByText('Confira o e-mail: falta o @ ou o domínio.').waitFor({ timeout: 10000 });
      check('L9: e-mail errado mostra o aviso ao sair do campo', true);
      await cs.locator('#r-email').fill('Rui@Simples.com');
    }
    const concluir2 = cs.getByRole('button', { name: 'Concluir: Quer retorno' });
    await concluir2.waitFor({ timeout: 10000 });
    check('simples: "Quer retorno" com dia e contato libera o Concluir', !(await concluir2.isDisabled()));
    await concluir2.click();
    await cs.waitForURL(/\/campo(\?v=hoje)?$/, { timeout: 20000 });
    await espera(9000);
    await semPendencia();
    const f2 = (await diaS()).visits.find((v) => v.client_id === refS2);
    const amanha = new Date(`${HOJE}T12:00:00Z`);
    amanha.setUTCDate(amanha.getUTCDate() + 1);
    check(
      'simples: retorno gravado com a data de amanhã e o contato',
      !!f2?.checkout_at && f2.answers.result === 'retorno' && f2.answers.followup_date === amanha.toISOString().slice(0, 10) && f2.answers.interlocutor_name === 'Rui Simples',
    );
    if (meS.features?.contact_email) {
      check('L9: e-mail de quem atendeu gravado (aparado, minúsculo)', f2?.answers.contact_email === 'rui@simples.com');
    }
    if (f2) {
      const leadS2 = await api('GET', `/v1/leads/${f2.lead_id}`);
      check('simples: CRM com evento de visita e o próximo passo do retorno', (leadS2.events ?? []).some((e) => e.kind === 'visit') && leadS2.next_step?.date === amanha.toISOString().slice(0, 10));
    }

    // Encerrar o dia (diálogo do navegador) → resumo do dia, se ligado.
    cs.once('dialog', (d) => void d.accept());
    await cs.getByRole('button', { name: 'Encerrar o dia' }).click();
    if (meS.features?.day_summary) {
      await cs.waitForURL(/\/campo\?v=resumo/, { timeout: 20000 });
      await cs.getByText('Resultado do seu dia').first().waitFor({ timeout: 20000 });
      check('simples: encerrar abre o resultado do dia', (await corpo(cs)).includes('resultado do seu dia'));
      if (meS.features?.breaks) {
        await cs.getByText('Tempo trabalhado (dia − intervalo)').waitFor({ timeout: 20000 });
        check('L4: o resultado do dia mostra o intervalo e o tempo trabalhado', (await corpo(cs)).includes('tempo trabalhado (dia − intervalo)'));
      }
    }
    await semPendencia();
    await espera(1500);
    check('simples: a jornada foi encerrada no servidor', (await situacaoS())?.status === 'encerrou');
  }
} catch (e) {
  ko('roteiro do fluxo simples interrompido', String(e).slice(0, 300));
} finally {
  await simplesCtx.close();
}

// ── 13c. Campo: consultor em DUAS praças (lote F2, contrato §44): só com a flag (descoberta pelo `features` da equipe) ──
// A praça B e o consultor são deste passo e saem no `finally` (o consultor primeiro: a cascata leva a jornada e o vínculo, e só
// então a praça pode ser apagada). Criar a praça muda a praça ativa do admin na API: ela é devolvida na hora.
{
  const featEquipe = (await api('GET', '/v1/consultores/settings/config').catch(() => ({})))?.features ?? {};
  if (featEquipe.multi_praca) {
    const mpCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      geolocation: POSICAO,
      permissions: ['geolocation'],
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
    });
    const cm = await mpCtx.newPage();
    vigiar(cm, 'campo-multi-praca');
    let pracaB = null;
    let consultorMpId = null;
    const ativaAntes = (await api('GET', '/v1/auth/me').catch(() => null))?.user?.active_praca_id ?? null;
    try {
      console.log('-- Campo: consultor em duas praças (lote F2) --');
      const NOME_B = `Praça Check F2 ${CARIMBO}`;
      pracaB = (await api('POST', '/v1/pracas', { name: NOME_B, city: 'Contagem · MG', start_date: '2026-09-01', end_date: '2026-12-31' })).id;
      await api('PATCH', '/v1/users/me', { active_praca_id: ativaAntes ?? PRACA });
      const EMAIL_M = `${CAMPO_PREFIXO}multi-${CARIMBO}@praca.local`;
      const criadoM = await api('POST', '/v1/consultores', {
        name: `Consultor Duas Praças ${CARIMBO}`,
        email: EMAIL_M,
        phone: '(31) 99999-0002',
        cpf: cpfValido(Date.now() + 11),
        praca_id: PRACA,
        pix_key_type: 'email',
        pix_key: EMAIL_M,
      });
      consultorMpId = criadoM.consultant.id;

      // Equipe (admin): "Praças em que atua" na página do consultor — marca B e salva.
      await page.goto(`${BASE}/consultores/${consultorMpId}`, { waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: 'Praças em que atua' }).waitFor({ timeout: 20000 });
      check('L12: a principal vem marcada e travada', (await page.getByRole('checkbox', { name: /\(principal\)/ }).isDisabled()) && (await page.getByRole('checkbox', { name: /\(principal\)/ }).getAttribute('aria-checked')) === 'true');
      await page.getByRole('checkbox', { name: NOME_B }).click();
      await page.getByRole('button', { name: 'Salvar praças' }).click();
      await page.getByText('Praças salvas.').first().waitFor({ timeout: 20000 });
      check('L12: a equipe grava as duas praças do consultor', ((await api('GET', `/v1/consultores/${consultorMpId}`)).praca_ids ?? []).length === 2);

      // Campo: a escolha da praça no início (2 praças, sem roteiro), o botão com o nome e o cabeçalho com a praça do dia.
      await cm.goto(`${BASE}/campo/entrar`, { waitUntil: 'networkidle' });
      await entrarComoRepresentante(cm, EMAIL_M, criadoM.temp_password);
      await cm.waitForURL('**/campo/senha', { timeout: 20000 });
      await cm.locator('#atual').fill(criadoM.temp_password);
      await cm.locator('#nova').fill(CAMPO_SENHA_NOVA);
      await cm.locator('#confirma').fill(CAMPO_SENHA_NOVA);
      await cm.getByRole('button', { name: 'Salvar senha', exact: true }).click();
      await cm.waitForURL(/\/campo$/, { timeout: 20000 });
      await cm.getByText('Em qual praça você está hoje?').first().waitFor({ timeout: 20000 });
      check('L12: a escolha mostra as duas praças, a principal marcada', (await cm.getByRole('radio').count()) === 2 && (await cm.getByRole('radio', { checked: true }).count()) === 1);
      await cm.getByRole('radio', { name: NOME_B }).click();
      const iniciarEm = cm.getByRole('button', { name: new RegExp(`^Iniciar (o dia|jornada) em ${NOME_B}$`) });
      check('L12: o botão diz a praça escolhida (1 toque)', (await iniciarEm.count()) === 1);
      await iniciarEm.click();
      await cm.getByRole('button', { name: /Encerrar (o dia|jornada)/ }).waitFor({ timeout: 20000 });
      await cm.waitForFunction(() => !document.body.innerText.toLowerCase().includes('pendente'), null, { timeout: 30000 });
      const hojeM = await cm.evaluate(async (a) => {
        const t = JSON.parse(localStorage.getItem('campoSession') ?? 'null')?.access_token;
        return (await fetch(`${a}/v1/campo/today`, { headers: { Authorization: `Bearer ${t}` } })).json();
      }, API);
      check('L12: a jornada no servidor é da praça escolhida', hojeM.journey?.praca_id === pracaB);
      await cm.waitForFunction((n) => document.body.innerText.includes(`· ${n}`), NOME_B, { timeout: 20000 });
      // O 1º `header` da página é a faixa azul da casca (E4); o nome e a praça ficam no topo da tela, dentro do `main`.
      check('L12: o cabeçalho mostra a praça do dia', (await cm.locator('main header').first().innerText()).includes(NOME_B));
      cm.once('dialog', (d) => void d.accept());
      await cm.getByRole('button', { name: /Encerrar (o dia|jornada)/ }).click();
      await cm.waitForFunction(() => !document.body.innerText.toLowerCase().includes('pendente'), null, { timeout: 30000 });
      await espera(1500);
      check('L12: o dia em B foi encerrado no servidor', (await api('GET', '/v1/consultores')).find((c) => c.id === consultorMpId)?.today?.status === 'encerrou');
    } catch (e) {
      ko('consultor em duas praças interrompido', String(e).slice(0, 300));
    } finally {
      await mpCtx.close().catch(() => undefined);
      if (consultorMpId) {
        await tentar('consultor das duas praças apagado', async () =>
          check('consultor das duas praças apagado', (await api('DELETE', `/v1/consultores/${consultorMpId}`)).ok === true),
        );
      }
      if (pracaB) {
        await tentar('praça B do browser-check apagada', async () => check('praça B do browser-check apagada', (await api('DELETE', `/v1/pracas/${pracaB}`)).ok === true));
      }
      await tentar('praça ativa do admin devolvida', () => api('PATCH', '/v1/users/me', { active_praca_id: ativaAntes }));
    }
  }
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
if (leadCampoId2) {
  await tentar('lead da segunda visita apagado', async () =>
    check('lead da segunda visita apagado', (await api('DELETE', `/v1/leads/${leadCampoId2}`)).ok === true),
  );
}
if (consultorSimplesId) {
  await tentar('consultor do fluxo simples apagado', async () =>
    check('consultor do fluxo simples apagado', (await api('DELETE', `/v1/consultores/${consultorSimplesId}`)).ok === true),
  );
}
for (const id of leadsSimples) {
  await tentar('lead do fluxo simples apagado', async () =>
    check('lead do fluxo simples apagado', (await api('DELETE', `/v1/leads/${id}`)).ok === true),
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
