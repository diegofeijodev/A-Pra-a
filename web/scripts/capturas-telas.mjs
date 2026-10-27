// Capturas de tela de TODAS as telas do redesenho da Lovable, para o dono conferir o design.
//
// O que faz (e desfaz):
// - cria dados de TESTE pela API (6 clientes "Teste · …" com localização gravada por psql — a API não aceita lat/lng no lead —,
//   um representante `capturas-telas-…@praca.local` e a rota de hoje dele com esses clientes);
// - entra como o representante pela entrada única (celular), troca a senha provisória, inicia o dia, abre uma visita numa parada
//   da rota e a conclui como "Sem interesse · Preço" (nunca "Cadastrou agora" nem pedido de voucher: os dois são fatos que
//   impedem apagar o representante), e encerra o dia;
// - entra como o admin do seed (desktop 1440×900 e celular 390×844) e passa por todas as telas da equipe;
// - no FIM apaga tudo o que criou (representante primeiro: a cascata leva jornada, visita, rota e paradas; depois os clientes) e
//   confere que o banco voltou ao seed (25 clientes, nenhum representante, nenhuma rota/visita/envio).
//
// Nada derruba a rodada: erro de console, HTTP ≥ 400 e falha de rede são ANOTADOS por tela (num JSON ao lado da pasta, ou em
// `CAPTURAS_ACHADOS`), assim
// como as medições de layout (rolagem horizontal, elemento para fora da tela, texto cortado com reticências).
//
// Cada tela sai em dois arquivos quando a página rola: `NN-nome-<tamanho>.png` (o que se vê ao abrir) e
// `NN-nome-<tamanho>-inteira.png` (a página inteira, tirada com a janela do tamanho da página, para o menu lateral e as barras
// fixas ficarem no lugar certo).
//
// Requer a API na 3014 (`npm run start:smoke` com as flags de produção) e o web na 3024 (`yarn dev`). Uso:
//   nice -n 19 node scripts/capturas-telas.mjs [pasta de saída]
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '/home/doutor/coding/freela/freela-web-v2/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:3024';
const API = 'http://localhost:3014';
const SAIDA = process.argv[2] ?? '/home/doutor/Downloads/praca-telas-novas';
/** Medições e problemas anotados (JSON), fora da pasta das imagens. */
const ACHADOS = process.env.CAPTURAS_ACHADOS ?? join(SAIDA, '..', 'praca-telas-novas-achados.json');
const PRACA = '00000000-0000-4000-8000-0000000000aa';
const EMAIL = process.env.PRACA_CHECK_EMAIL ?? 'diego@praca.local';
const SENHA = process.env.PRACA_CHECK_PASSWORD ?? 'praca123';
const CARIMBO = Date.now().toString(36);
/** Prefixos fixos: é por eles que a faxina de entrada acha resíduo de uma rodada interrompida. */
const REP_PREFIXO = 'capturas-telas-';
const LEAD_PREFIXO = 'Teste · ';
const REP_EMAIL = `${REP_PREFIXO}${CARIMBO}@praca.local`;
const REP_NOME = 'Ana Teste';
const REP_SENHA = 'Capturas2026x';
const DESKTOP = { width: 1440, height: 900 };
const CELULAR = { width: 390, height: 844 };
/** Clientes de teste em volta da Savassi (BH, praça do seed). */
const CLIENTES = [
  { name: 'Bar do Zé', address: 'R. Antônio de Albuquerque, 280', lat: -19.9349, lng: -43.9361 },
  { name: 'Restaurante Sabor de Minas', address: 'R. Pernambuco, 1010', lat: -19.9336, lng: -43.9338 },
  { name: 'Padaria Pão Quente', address: 'Av. Getúlio Vargas, 1300', lat: -19.9362, lng: -43.9322 },
  { name: 'Lanchonete da Praça', address: 'Praça da Savassi, 15', lat: -19.9377, lng: -43.9349 },
  { name: 'Pizzaria Bella Napoli', address: 'R. Tomé de Souza, 845', lat: -19.9391, lng: -43.9371 },
  { name: 'Café Central', address: 'R. Paraíba, 1200', lat: -19.9355, lng: -43.9389 },
];

mkdirSync(SAIDA, { recursive: true });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const hojeSp = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const HOJE = hojeSp();
const psql = (sql) => execFileSync('docker', ['exec', 'praca-postgres', 'psql', '-U', 'praca', '-d', 'praca', '-tAc', sql]).toString().trim();

let token = '';
async function api(method, path, body, tk = token) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tk}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const txt = await r.text();
  if (r.status >= 400) throw new Error(`${method} ${path} → ${r.status} ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : null;
}
const cpfValido = (semente) => {
  const b = String(semente).replace(/\D/g, '').slice(-9).padStart(9, '1').split('').map(Number);
  const dv = (a) => {
    const r = (a.reduce((t, d, i) => t + d * (a.length + 1 - i), 0) * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(b);
  return [...b, d1, dv([...b, d1])].join('');
};

// ── vigias: anotam, não derrubam ─────────────────────────────────────────
const achados = { telas: [], problemas: [] };
let telaAtual = '(início)';
/** Recusa esperada: a entrada única tenta a EQUIPE antes do representante (401 de propósito). */
let recusaEsperada = false;
const IGNORAR_URL = [/\/_next\/static\/webpack\/.*\.hot-update\.json$/];
const ignorar = (url) => IGNORAR_URL.some((re) => re.test(url));
function vigiar(p, rotulo) {
  const anota = (m) => achados.problemas.push({ tela: telaAtual, contexto: rotulo, msg: m });
  p.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    if (recusaEsperada && /status of 401/.test(m.text())) return;
    if (m.type() === 'warning' && !/hydrat|key|deprecated|Each child/i.test(m.text())) return;
    anota(`[console ${m.type()}] ${m.text().slice(0, 240)}`);
  });
  p.on('pageerror', (e) => anota(`[pageerror] ${String(e).slice(0, 240)}`));
  p.on('response', (r) => {
    if (r.status() < 400 || ignorar(r.url())) return;
    if (recusaEsperada && r.status() === 401 && r.url().endsWith('/v1/auth/login')) return;
    anota(`[http ${r.status()}] ${r.request().method()} ${r.url().replace(API, 'api').replace(BASE, 'web')}`);
  });
  p.on('requestfailed', (r) => {
    const erro = r.failure()?.errorText ?? '?';
    if (ignorar(r.url()) || (/[?&]_rsc=/.test(r.url()) && erro === 'net::ERR_ABORTED')) return;
    anota(`[rede] ${r.method()} ${r.url().replace(API, 'api')} — ${erro}`);
  });
}

// ── medições de layout (no tamanho normal da janela) ─────────────────────
const medir = (p) =>
  p.evaluate(() => {
    const vw = window.innerWidth;
    const desc = (el) => {
      const t = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('alt') || '').trim().replace(/\s+/g, ' ').slice(0, 70);
      const cls = typeof el.className === 'string' ? el.className.split(' ').slice(0, 3).join('.') : '';
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''} "${t}"`;
    };
    const recortadoNoX = (el) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(a).overflowX)) return true;
      }
      return false;
    };
    const todos = [...document.body.querySelectorAll('*')];
    const fora = [];
    const cortados = [];
    for (const el of todos) {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 1 && !recortadoNoX(el) && !el.closest('.sr-only')) fora.push(desc(el));
      if (el.closest('.sr-only')) continue;
      if (s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) cortados.push(desc(el));
      else if (s.webkitLineClamp && s.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 1) cortados.push(desc(el));
    }
    // Faixas que rolam de lado (pílulas, tabelas): não é defeito, mas diz o que fica escondido à direita.
    const rolamDeLado = todos
      .filter((el) => ['auto', 'scroll'].includes(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 4 && el.getBoundingClientRect().height > 0)
      .map((el) => `${desc(el).slice(0, 90)} (${el.scrollWidth}px em ${el.clientWidth}px)`);
    return {
      rolagem_horizontal_px: document.documentElement.scrollWidth - vw,
      altura_pagina: document.documentElement.scrollHeight,
      fora_da_tela: [...new Set(fora)].slice(0, 8),
      texto_cortado: [...new Set(cortados)].slice(0, 12),
      rola_de_lado: [...new Set(rolamDeLado)].slice(0, 6),
    };
  });

/** Tira `NN-nome-<tamanho>.png` (a janela) e, se a página rola, `…-inteira.png` com a janela do tamanho da página. */
async function capturar(p, nome, tamanho) {
  telaAtual = `${nome}-${tamanho}`;
  await p.evaluate(() => document.fonts.ready).catch(() => {});
  await esperarLadrilhos(p).catch(() => {});
  await espera(600);
  const vp = p.viewportSize();
  await p.evaluate(() => window.scrollTo(0, 0));
  const medidas = await medir(p).catch((e) => ({ erro: String(e) }));
  const arquivo = `${nome}-${tamanho}.png`;
  await p.screenshot({ path: join(SAIDA, arquivo), animations: 'disabled', caret: 'hide' });
  const arquivos = [arquivo];
  const altura = await p.evaluate(() => document.documentElement.scrollHeight);
  if (altura > vp.height + 40) {
    // Teto de ~16 mil pixels reais por imagem (limite de textura do Chromium).
    const dpr = await p.evaluate(() => window.devicePixelRatio || 1);
    await p.setViewportSize({ width: vp.width, height: Math.min(altura, Math.floor(16000 / dpr)) });
    await espera(700);
    await esperarLadrilhos(p).catch(() => {});
    const inteira = `${nome}-${tamanho}-inteira.png`;
    await p.screenshot({ path: join(SAIDA, inteira), animations: 'disabled', caret: 'hide' });
    arquivos.push(inteira);
    await p.setViewportSize(vp);
    await espera(400);
  }
  achados.telas.push({ tela: `${nome}-${tamanho}`, url: p.url().replace(BASE, ''), arquivos, ...medidas });
  console.log(`  📸 ${arquivos.join(' + ')}${medidas.rolagem_horizontal_px > 0 ? `  ⚠ rolagem horizontal ${medidas.rolagem_horizontal_px}px` : ''}`);
}

/** Mapa do Leaflet com todos os ladrilhos baixados (sem mapa, volta na hora). */
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

const ctxBase = { locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' };
const ctxCelular = { ...ctxBase, viewport: CELULAR, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

// ── 0. login na API, faxina de entrada e pré-condições do seed ───────────
const sessao = await (
  await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: SENHA }) })
).json();
token = sessao?.access_token ?? '';
if (!token) throw new Error(`login na API falhou para ${EMAIL}`);
const adminId = sessao.user?.id ?? (await api('GET', '/v1/auth/me')).user.id;
const ativaAntes = (await api('GET', '/v1/auth/me').catch(() => null))?.user?.active_praca_id ?? null;

console.log('-- Faxina de entrada --');
for (const c of (await api('GET', '/v1/consultores')).filter((x) => x.email.startsWith(REP_PREFIXO))) {
  console.log(`  apagando representante residual ${c.email}`);
  await api('DELETE', `/v1/consultores/${c.id}`);
}
for (const l of (await api('GET', `/v1/leads?praca_id=${PRACA}&archived=true`)).filter((x) => x.name.startsWith(LEAD_PREFIXO))) {
  console.log(`  apagando cliente residual "${l.name}"`);
  await api('DELETE', `/v1/leads/${l.id}`);
}
const leads0 = await api('GET', `/v1/leads?praca_id=${PRACA}&archived=true`);
const reps0 = await api('GET', '/v1/consultores');
if (leads0.length !== 25 || reps0.length !== 0) {
  throw new Error(`banco fora do seed (${leads0.length} clientes, ${reps0.length} representantes): nada foi criado, confira antes de rodar`);
}

// Sem o "hinting" do Linux: as larguras das letras e dos espaços ficam as de verdade (Mac, iPhone, Android), não arredondadas
// para pixel inteiro — com o padrão, o espaço da Manrope a 12 px cai de 2,4 para 2 px e o texto miúdo parece grudado.
const browser = await chromium.launch({ args: ['--font-render-hinting=none'] });
let repId = null;
const leadIds = [];

try {
  // ── 1. dados de teste ────────────────────────────────────────────────
  console.log('-- Dados de teste --');
  for (const [i, c] of CLIENTES.entries()) {
    const l = await api('POST', '/v1/leads', {
      praca_id: PRACA,
      name: `${LEAD_PREFIXO}${c.name}`,
      address: c.address,
      city: 'Belo Horizonte',
      phone: `(31) 98${String(700 + i).padStart(3, '0')}-${String(1000 + i * 37).slice(-4)}`,
      classe: 'alvo',
      origem: 'prospecção',
      owner_id: adminId,
    });
    leadIds.push(l.id);
    psql(`update leads set lat=${c.lat}, lng=${c.lng}, location_precision='point' where id='${l.id}' and name like 'Teste · %'`);
  }
  const criado = await api('POST', '/v1/consultores', {
    name: REP_NOME,
    email: REP_EMAIL,
    phone: '(31) 99876-5432',
    cpf: cpfValido(Date.now()),
    praca_id: PRACA,
    pix_key_type: 'email',
    pix_key: REP_EMAIL,
  });
  repId = criado.consultant.id;
  if (criado.consultant.visit_flow_effective !== 'simples') console.log(`  aviso: fluxo efetivo do representante = ${criado.consultant.visit_flow_effective}`);
  const rota = await api('POST', '/v1/routes', { consultant_id: repId, day: HOJE, lead_ids: leadIds });
  const primeira = rota.stops.find((s) => s.kind === 'planejada' && s.status === 'pendente') ?? rota.stops[0];
  console.log(`  ${leadIds.length} clientes, representante ${REP_EMAIL}, rota de hoje com ${rota.stops.length} paradas (1ª: ${primeira.name})`);

  // ── 2. entrada única (sem sessão) ────────────────────────────────────
  console.log('-- Entrada --');
  const anonD = await browser.newContext({ ...ctxBase, viewport: DESKTOP });
  const anonM = await browser.newContext(ctxCelular);
  for (const [ctx, tam] of [[anonD, 'desktop'], [anonM, 'celular']]) {
    const p = await ctx.newPage();
    vigiar(p, `entrada-${tam}`);
    await p.goto(`${BASE}/entrar`, { waitUntil: 'networkidle', timeout: 90000 });
    await p.locator('#email').waitFor({ timeout: 30000 });
    await capturar(p, '01-entrar', tam);
  }
  await anonD.close();
  await anonM.close();

  // ── 3. representante no celular: até a visita aberta ─────────────────
  console.log('-- Representante (celular) --');
  const repCtx = await browser.newContext({
    ...ctxCelular,
    geolocation: { latitude: primeira.lat, longitude: primeira.lng, accuracy: 15 },
    permissions: ['geolocation'],
  });
  const cs = await repCtx.newPage();
  vigiar(cs, 'representante');
  const semPendencia = () =>
    cs
      .waitForFunction(() => !document.body.innerText.toLowerCase().includes('pendente'), null, { timeout: 30000 })
      .catch(() => achados.problemas.push({ tela: telaAtual, contexto: 'representante', msg: 'a palavra "pendente" não sumiu da tela em 30 s (fila não esvaziou?)' }));
  /** Um bloco que falha é anotado e o resto da rodada segue (a equipe não depende do representante). */
  const bloco = async (nome, fn) => {
    try {
      await fn();
      return true;
    } catch (e) {
      achados.problemas.push({ tela: telaAtual, contexto: 'roteiro de captura', msg: `${nome} interrompido: ${String(e).slice(0, 400)}` });
      console.log(`✗ ${nome} interrompido em ${telaAtual}: ${String(e).slice(0, 300)}`);
      return false;
    }
  };
  const nomeParada = primeira.name;
  let refVisita = null;
  const repOk = await bloco('representante até a visita', async () => {
  await cs.goto(`${BASE}/entrar`, { waitUntil: 'networkidle', timeout: 90000 });
  await cs.locator('#email').fill(REP_EMAIL);
  await cs.locator('#senha').fill(criado.temp_password);
  recusaEsperada = true;
  try {
    const doCampo = cs.waitForResponse((r) => r.url().endsWith('/v1/campo/auth/login'), { timeout: 30000 });
    await cs.getByRole('button', { name: 'Entrar', exact: true }).click();
    await doCampo;
    await cs.waitForURL('**/campo/senha', { timeout: 60000 });
    await espera(500);
  } finally {
    recusaEsperada = false;
  }
  await cs.getByText('Uma letra maiúscula').waitFor({ timeout: 30000 }).catch(() => {});
  await capturar(cs, '20-rep-troca-de-senha-obrigatoria', 'celular');
  await cs.locator('#atual').fill(criado.temp_password);
  await cs.locator('#nova').fill(REP_SENHA);
  await cs.locator('#confirma').fill(REP_SENHA);
  await cs.getByRole('button', { name: 'Salvar senha', exact: true }).click();
  await cs.waitForURL(/\/campo$/, { timeout: 60000 });
  await cs.getByRole('button', { name: 'Iniciar o dia' }).waitFor({ timeout: 60000 });
  await capturar(cs, '21-rep-hoje-antes-de-iniciar', 'celular');

  await cs.getByRole('button', { name: 'Iniciar o dia' }).click();
  await cs.getByRole('button', { name: 'Encerrar o dia' }).waitFor({ timeout: 30000 });
  await espera(9500); // o início espera os segundos do "Desfazer" na fila
  await semPendencia();
  await espera(1500);
  await capturar(cs, '22-rep-hoje-em-rota', 'celular');

  await cs.goto(`${BASE}/campo?v=roteiro`, { waitUntil: 'networkidle', timeout: 90000 });
  await cs.getByRole('button', { name: 'Minhas rotas' }).waitFor({ timeout: 60000 });
  await cs.getByRole('region', { name: 'Andamento do dia' }).waitFor({ timeout: 30000 });
  await capturar(cs, '23-rep-roteiro', 'celular');

  // Foto de fachada de mentira (gradiente com legenda), como o browser-check faz com um quadro liso.
  const jpeg = await cs.evaluate(
    () =>
      new Promise((resolve) => {
        const c = document.createElement('canvas');
        c.width = 1200;
        c.height = 900;
        const g = c.getContext('2d');
        const grad = g.createLinearGradient(0, 0, 1200, 900);
        grad.addColorStop(0, '#2b4c7e');
        grad.addColorStop(1, '#7aa6d6');
        g.fillStyle = grad;
        g.fillRect(0, 0, 1200, 900);
        g.fillStyle = 'rgba(255,255,255,.9)';
        g.font = 'bold 64px sans-serif';
        g.fillText('Fachada (foto de teste)', 160, 470);
        c.toBlob((b) => b.arrayBuffer().then((a) => resolve(Array.from(new Uint8Array(a)))), 'image/jpeg', 0.85);
      }),
  );
  await cs.getByLabel(`Cheguei em ${nomeParada}: tirar a foto da fachada`).first().setInputFiles({ name: 'fachada.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg) });
  await cs.waitForURL(/\/campo\?v=visita&ref=[0-9a-f-]{36}/, { timeout: 60000 });
  await cs.getByText('Como foi a visita?').waitFor({ timeout: 30000 });
  await semPendencia();
  await espera(1200);
  await capturar(cs, '24-rep-visita-aberta', 'celular');
  refVisita = new URL(cs.url()).searchParams.get('ref');
  });

  // ── 4. equipe: desktop e celular, com o representante "em visita" ────
  console.log('-- Equipe (desktop e celular) --');
  await bloco('equipe', async () => {
  const eqD = await browser.newContext({ ...ctxBase, viewport: DESKTOP });
  const eqM = await browser.newContext(ctxCelular);
  const pd = await eqD.newPage();
  const pm = await eqM.newPage();
  vigiar(pd, 'equipe-desktop');
  vigiar(pm, 'equipe-celular');
  for (const p of [pd, pm]) {
    await p.goto(`${BASE}/entrar`, { waitUntil: 'networkidle', timeout: 90000 });
    await p.locator('#email').fill(EMAIL);
    await p.locator('#senha').fill(SENHA);
    await p.getByRole('button', { name: 'Entrar', exact: true }).click();
    await p.waitForURL('**/inicio', { timeout: 60000 });
  }
  /** Uma tela da equipe nos dois tamanhos: `pronto(p)` espera a tela estar montada (e faz os cliques de aba). */
  async function telaEquipe(nome, caminho, pronto) {
    for (const [p, tam] of [[pd, 'desktop'], [pm, 'celular']]) {
      telaAtual = `${nome}-${tam}`;
      try {
        if (caminho) await p.goto(`${BASE}${caminho}`, { waitUntil: 'networkidle', timeout: 90000 });
        await pronto(p);
        await p.waitForLoadState('networkidle').catch(() => {});
        await capturar(p, nome, tam);
      } catch (e) {
        achados.problemas.push({ tela: telaAtual, contexto: 'roteiro de captura', msg: `não capturada: ${String(e).slice(0, 240)}` });
        console.log(`  ✗ ${nome}-${tam}: ${String(e).slice(0, 160)}`);
      }
    }
  }
  const T = 60000;
  await telaEquipe('02-trocar-senha', '/trocar-senha', (p) => p.getByRole('heading', { name: 'Crie sua nova senha' }).waitFor({ timeout: T }));
  await telaEquipe('03-dashboard', '/inicio', async (p) => {
    await p.getByText('Visitas concluídas').first().waitFor({ timeout: T });
    await p.getByText('ⓘ De onde vem').first().waitFor({ timeout: T });
  });
  await telaEquipe('04-pracas', '/pracas', (p) => p.locator(`a[href="/pracas/${PRACA}"]`).waitFor({ timeout: T }));
  await telaEquipe('05-praca-detalhe', `/pracas/${PRACA}`, (p) => p.getByRole('button', { name: 'Editar praça' }).waitFor({ timeout: T }));
  await telaEquipe('06-clientes', '/clientes', (p) => p.getByTestId('lista-conta').waitFor({ timeout: T }));
  await telaEquipe('07-mapa', '/mapa', async (p) => {
    await p.getByRole('group', { name: 'Mostrar ou esconder por situação' }).waitFor({ timeout: T });
    await p.locator('.leaflet-container').waitFor({ timeout: T });
    await esperarLadrilhos(p);
  });
  await telaEquipe('08-rotas-aba-clientes-perfil', '/rotas', async (p) => {
    await p.getByRole('tab', { name: 'Clientes', exact: true }).waitFor({ timeout: T });
    await p.getByTestId('previa-divisao').filter({ hasText: /÷|Nenhum estabelecimento|Nenhum cliente|Nenhuma área/ }).waitFor({ timeout: T });
    await p.locator('section[aria-label="Dividir a área em rotas"]').getByRole('group', { name: 'Perfil dos clientes' }).waitFor({ timeout: T });
  });
  await telaEquipe('09-rotas-aba-shoppings', null, async (p) => {
    await p.getByRole('tab', { name: 'Shoppings' }).click();
    await p.getByTestId('criterio-shopping').waitFor({ timeout: T });
  });
  await telaEquipe('10-rotas-aba-dia-de-cada-representante', null, async (p) => {
    await p.getByRole('tab', { name: 'Dia de cada representante' }).click();
    await p.getByText('Chegada ao local').first().waitFor({ timeout: T });
    await p.getByText(REP_NOME).first().waitFor({ timeout: T }).catch(() => {});
  });
  await telaEquipe('11-representantes', '/representantes', async (p) => {
    await p.getByRole('heading', { name: 'Em campo hoje', exact: true }).waitFor({ timeout: T });
    await p.getByText(REP_NOME).first().waitFor({ timeout: T });
  });
  await telaEquipe('12-representante-ficha', `/representantes/${repId}`, async (p) => {
    await p.getByText(nomeParada).first().waitFor({ timeout: T });
    await p.locator('.leaflet-container').first().waitFor({ timeout: T }).catch(() => {});
    await esperarLadrilhos(p);
  });
  await telaEquipe('13-vouchers', '/vouchers', async (p) => {
    await p.getByRole('heading', { name: 'Vouchers', exact: true }).waitFor({ timeout: T });
    await p.waitForFunction(() => [...document.querySelectorAll('#vouchers-situacao option')].some((o) => /^Pendente \(\d+\)$/.test(o.textContent.trim())), null, { timeout: T });
    await p.getByText('Regras do voucher').waitFor({ timeout: T });
  });
  await telaEquipe('14-financeiro', '/financeiro', async (p) => {
    await p.getByRole('heading', { name: 'Financeiro', exact: true }).waitFor({ timeout: T });
    await p.getByRole('region', { name: 'Pendente', exact: true }).waitFor({ timeout: T });
  });
  await telaEquipe('15-usuarios', '/usuarios', (p) => p.getByRole('button', { name: /^Editar / }).first().waitFor({ timeout: T }));
  await telaEquipe('16-configuracoes', '/configuracoes', async (p) => {
    await p.getByRole('heading', { name: 'Segmentos da busca', exact: true }).waitFor({ timeout: T });
    await p.getByText(/^Busca no mapa: /).first().waitFor({ timeout: T });
  });
  await telaEquipe('17-desempenho', '/desempenho', (p) => p.getByText('Em construção').first().waitFor({ timeout: T }));
  await eqD.close();
  await eqM.close();
  telaAtual = '(equipe encerrada)';
  });

  // ── 5. representante: concluir a visita, as abas e encerrar o dia ────
  console.log('-- Representante: abas e fim do dia --');
  if (repOk && refVisita) await bloco('representante: abas e fim do dia', async () => {
  await cs.goto(`${BASE}/campo?v=visita&ref=${refVisita}`, { waitUntil: 'networkidle', timeout: 90000 });
  await cs.getByText('Como foi a visita?').waitFor({ timeout: 30000 });
  await cs.getByRole('radio', { name: 'Sem interesse', exact: true }).click();
  await cs.getByRole('radio', { name: 'Preço', exact: true }).click();
  await cs.getByRole('button', { name: 'Concluir: Sem interesse, Preço' }).click();
  await cs.waitForURL((u) => !u.search.includes('v=visita'), { timeout: 30000 });
  await espera(9500); // o checkout espera os segundos do "Desfazer" na fila
  await semPendencia();
  const secoes = cs.getByRole('navigation', { name: 'Seções' });
  const aba = async (nome, pronto, arquivo) => {
    telaAtual = arquivo;
    try {
      await secoes.getByRole('button', { name: nome, exact: true }).click();
      await pronto();
      await cs.waitForLoadState('networkidle').catch(() => {});
      await capturar(cs, arquivo, 'celular');
    } catch (e) {
      achados.problemas.push({ tela: arquivo, contexto: 'roteiro de captura', msg: `não capturada: ${String(e).slice(0, 240)}` });
      console.log(`  ✗ ${arquivo}: ${String(e).slice(0, 160)}`);
    }
  };
  await aba('Mapa', async () => {
    await cs.getByRole('heading', { name: 'Mapa', exact: true }).waitFor({ timeout: 30000 });
    await cs.locator('.leaflet-container').or(cs.getByText('Nenhum cliente seu com localização ainda')).first().waitFor({ timeout: 30000 });
    await esperarLadrilhos(cs);
  }, '25-rep-mapa');
  await aba('Clientes', async () => {
    await cs.getByRole('heading', { name: 'Clientes', exact: true }).waitFor({ timeout: 30000 });
    await cs.getByText(/Retornos de hoje e atrasados|Nenhum retorno para hoje nem atrasado/).first().waitFor({ timeout: 30000 });
  }, '26-rep-clientes');
  await aba('Desempenho', () => cs.getByText('Em construção').first().waitFor({ timeout: 30000 }), '27-rep-desempenho');
  await aba('Carteira', async () => {
    await cs.getByRole('heading', { name: 'Carteira', exact: true }).waitFor({ timeout: 30000 });
    await espera(2500);
  }, '28-rep-carteira');
  await secoes.getByRole('button', { name: 'Hoje', exact: true }).click();
  await cs.getByRole('button', { name: 'Encerrar o dia' }).waitFor({ timeout: 30000 });
  cs.once('dialog', (d) => void d.accept());
  await cs.getByRole('button', { name: 'Encerrar o dia' }).click();
  await cs.waitForURL(/\/campo\?v=roteiro/, { timeout: 30000 });
  await cs.getByText('Resultado do seu dia').first().waitFor({ timeout: 30000 });
  await semPendencia();
  await espera(1500);
  await capturar(cs, '29-rep-resultado-do-dia', 'celular');
  });
  await repCtx.close();
} catch (e) {
  achados.problemas.push({ tela: telaAtual, contexto: 'roteiro de captura', msg: `rodada interrompida: ${String(e).slice(0, 400)}` });
  console.log(`✗ rodada interrompida em ${telaAtual}: ${String(e).slice(0, 300)}`);
} finally {
  // ── 6. limpeza: o banco volta ao seed ─────────────────────────────────
  console.log('-- Limpeza --');
  const passo = async (nome, fn) => {
    try {
      await fn();
      console.log(`  ok  ${nome}`);
    } catch (e) {
      achados.problemas.push({ tela: '(limpeza)', contexto: 'limpeza', msg: `${nome}: ${String(e).slice(0, 240)}` });
      console.log(`  ✗   ${nome}: ${String(e).slice(0, 200)}`);
    }
  };
  if (repId) await passo('representante apagado (leva jornada, visita, rota e paradas)', () => api('DELETE', `/v1/consultores/${repId}`));
  for (const id of leadIds) await passo(`cliente de teste ${id.slice(0, 8)} apagado`, () => api('DELETE', `/v1/leads/${id}`));
  await passo('resíduo por prefixo', async () => {
    for (const c of (await api('GET', '/v1/consultores')).filter((x) => x.email.startsWith(REP_PREFIXO))) await api('DELETE', `/v1/consultores/${c.id}`);
    for (const l of (await api('GET', `/v1/leads?praca_id=${PRACA}&archived=true`)).filter((x) => x.name.startsWith(LEAD_PREFIXO))) await api('DELETE', `/v1/leads/${l.id}`);
  });
  const ativaAgora = (await api('GET', '/v1/auth/me').catch(() => null))?.user?.active_praca_id ?? null;
  if (ativaAgora !== ativaAntes) await passo(`praça ativa do admin devolvida (${ativaAntes})`, () => api('PATCH', '/v1/users/me', { active_praca_id: ativaAntes }));
  const fim = psql(
    "select (select count(*) from leads)||'|'||(select count(*) from field_consultants)||'|'||(select count(*) from field_routes)||'|'||(select count(*) from field_route_stops)||'|'||(select count(*) from field_visits)||'|'||(select count(*) from field_journeys)||'|'||(select count(*) from msg_sends)||'|'||(select count(*) from field_vouchers)||'|'||(select count(*) from field_declared_signups)||'|'||(select count(*) from field_earnings_ledger)",
  );
  achados.banco_no_fim = { 'leads|consultores|rotas|paradas|visitas|jornadas|envios|vouchers|declarados|razão': fim, esperado: '25|0|0|0|0|0|0|0|0|0' };
  console.log(`  banco no fim (leads|consultores|rotas|paradas|visitas|jornadas|envios|vouchers|declarados|razão): ${fim}${fim === '25|0|0|0|0|0|0|0|0|0' ? ' = seed' : ' ≠ SEED!'}`);
  await browser.close();
  writeFileSync(ACHADOS, JSON.stringify(achados, null, 2));
  console.log(`\n${achados.telas.length} telas capturadas, ${achados.problemas.length} anotação(ões) de problema.`);
}
