// Captura escenas reales de la mesa central (con emuladores). Guarda recortes y la posición del botón a resaltar.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/tmp/claude-0/video2/shots', BASE = 'http://127.0.0.1:8766/?emu=1';
const meta = {};
(async () => {
  const browser = await chromium.launch();
  const mk = async (opts) => { const c = await browser.newContext(opts); const p = await c.newPage(); p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? d.defaultValue() : undefined)); return p; };
  const A = await mk({ viewport: { width: 1300, height: 2400 }, deviceScaleFactor: 2 });
  async function snap(name, sels, target, pad = 14) {
    await A.waitForTimeout(350);
    const boxes = []; for (const s of sels) { const b = await A.locator(s).first().boundingBox(); if (b) boxes.push(b); }
    const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad), y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
    const w = Math.max(...boxes.map((b) => b.x + b.width)) + pad - x, h = Math.max(...boxes.map((b) => b.y + b.height)) + pad - y;
    await A.screenshot({ path: `${OUT}/${name}.png`, clip: { x, y, width: w, height: h } });
    let ring = null;
    if (target) { const t = await A.locator(target).first().boundingBox(); if (t) ring = [((t.x + t.width / 2 - x) / w) * 100, ((t.y + t.height / 2 - y) / h) * 100, Math.max(t.width, t.height) / w * 100]; }
    meta[name] = { w, h, ring };
  }
  await A.goto(BASE + '#/'); await A.waitForSelector('text=Configuración inicial');
  await A.fill('input[name=nombre]', 'Jefe de Jueces'); await A.fill('input[name=u]', 'jefe.jueces'); await A.fill('input[name=pin]', '111111');
  await A.click('button[type=submit]'); await A.waitForSelector('#nt', { timeout: 15000 });
  await A.goto(BASE + '#/usuarios'); await A.waitForSelector('#f');
  for (const [n, pin] of [['Pedro González', '222222'], ['Ana Soto', '333333'], ['Luis Díaz', '444444'], ['Óscar Conti', '555555']]) {
    await A.fill('input[name=nombre]', n); await A.fill('input[name=pin]', pin); await A.click('#f button[type=submit]');
    await A.waitForFunction((nm) => document.querySelector('#list')?.innerText.includes(nm) && !document.querySelector('input[name=nombre]').value, n, { timeout: 15000 });
  }
  await A.goto(BASE + '#/'); await A.fill('#nt input[name=nombre]', 'Campeonato Nacional'); await A.click('#nt button[type=submit]');
  await A.waitForFunction(() => location.hash.startsWith('#/torneo/')); const tid = (await A.evaluate(() => location.hash)).split('/')[2];
  await A.waitForSelector('#pname'); await A.fill('#pname', 'Panel A'); await A.click('#addp'); await A.waitForSelector('[data-pm]');
  for (const n of ['Pedro González', 'Ana Soto', 'Luis Díaz']) { await A.locator('label.chip', { hasText: n }).first().locator('input').check(); await A.waitForTimeout(200); }
  await A.fill('#paste', 'Orden,Plataforma,Categoría,División,Fase,Jueces,Panel,Rojo,Club rojo,Peso rojo,Azul,Club azul,Peso azul\n1,1,Adulto oficial,-65 kg,Semifinal,3,Panel A,Matías Fuentes,Club Dragón,64.5,Felipe Araya,Club Tigre,64.1\n2,1,Juvenil,-56 kg,Final,3,Panel A,Josefa Contreras,Club Grulla,55.6,Antonia Reyes,Club Halcón,55.1\n3,1,Adulto light,-70 kg,Final,3,Panel A,Ignacio Rojas,Club Grulla,69.2,Benjamín Soto,Club Halcón,69.8');
  await A.waitForSelector('[data-import=add]:not([disabled])'); await A.click('[data-import=add]'); await A.waitForTimeout(800);

  const phone = { viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true };
  const J = [];
  for (const [u, pin] of [['pedro.gonzalez', '222222'], ['ana.soto', '333333'], ['luis.diaz', '444444']]) {
    const p = await mk(phone); await p.goto(BASE + '#/'); await p.fill('input[name=u]', u); await p.fill('input[name=pin]', pin);
    await p.click('button[type=submit]'); await p.waitForSelector('text=Esperando que la mesa'); J.push(p);
  }
  // 1 Inicio
  await A.setViewportSize({ width: 640, height: 2400 });
  await A.goto(BASE + '#/'); await A.waitForSelector('.torneo-row');
  await A.evaluate(() => document.querySelectorAll('.tag').forEach((t) => { if (t.textContent.includes('EMULADOR')) t.remove(); }));
  await snap('01_inicio', ['.topbar', '.card:has(#list)'], '.torneo-row button:has-text("Mesa P1")');
  await A.setViewportSize({ width: 1300, height: 2400 });
  // 2 Juez de plataforma
  await A.goto(BASE + `#/plataforma/${tid}/1`); await A.waitForSelector('[data-arbitro]');
  await A.selectOption('[data-arbitro]', 'oscar_conti'); await snap('02_arbitro', ['#puestos'], '[data-arbitro]');
  // 3 Asignar jueces a mano
  await A.selectOption('[data-seat="1"]', 'pedro_gonzalez'); await A.selectOption('[data-seat="2"]', 'ana_soto'); await A.selectOption('[data-seat="3"]', 'luis_diaz');
  await snap('03_puestos', ['#puestos'], '[data-saveseats]');
  await A.click('[data-saveseats]'); await A.waitForTimeout(600);
  // 4 Panel
  await A.selectOption('#panelsel', { label: 'Panel A (3)' }); await snap('04_panel', ['#puestos'], '#panelsel'); await A.click('[data-cancel]');
  // 5 Programa / siguiente
  await snap('05_siguiente', ['#prog'], '#prog [data-load]');
  // 6 Combate cargado
  await A.click('#prog [data-load]'); await A.waitForSelector('[data-a=start]'); await J[0].waitForSelector('.pad-btn');
  await snap('06_cargado', ['.fightinfo', '#mesa .grid2'], '[data-a=start]');
  // 7 Cronómetro
  await A.click('[data-a=start]'); await J[0].waitForSelector('.pad-btn:not([disabled])');
  const tap = async (p, side, k) => { for (let i = 0; i < k; i++) await p.click(`.pad-btn.${side}`); };
  await tap(J[0], 'rojo', 3); await tap(J[0], 'azul', 2); await tap(J[1], 'rojo', 2); await tap(J[1], 'azul', 2); await tap(J[2], 'rojo', 4); await tap(J[2], 'azul', 1);
  await A.waitForTimeout(1500); await snap('07_crono', ['#mesa .grid2 > .card:first-child'], '[data-a=pause]');
  // 8 Penalizaciones
  await A.click('[data-a=ev][data-side=azul][data-type=amon]');
  await snap('08_penal', ['#mesa .grid2 >> nth=1 >> .card >> nth=1'], '[data-a=ev][data-side=azul][data-type=amon]');
  // 9 Acciones registradas
  await snap('09_acciones', ['#mesa .grid2 >> nth=2 >> .card >> nth=0'], '[data-a=delEv]');
  // 10 Puntajes en vivo
  await snap('10_vivo', ['#mesa .grid2 > .card:nth-child(2)'], null);
  // 11 Revisión y anuncio
  await A.click('[data-a=endRound]'); await A.waitForSelector('[data-a=announce]');
  await snap('11_anunciar', ['#mesa .grid2 > .card:nth-child(2)'], '[data-a=announce]');
  await A.click('[data-a=announce]'); await A.waitForSelector('[data-a=nextRound]');
  // 12 Descanso
  await A.waitForTimeout(1200); await snap('12_descanso', ['#mesa .grid2 > .card:first-child'], '[data-a=nextRound]');
  // 13 Victoria absoluta
  await snap('13_absoluta', ['#mesa .grid2 >> nth=2 >> .card >> nth=1'], '[data-a=abs][data-k=ko]');
  // Round 2
  await A.click('[data-a=nextRound]'); await A.click('[data-a=start]'); await J[0].waitForSelector('.pad-btn:not([disabled])');
  await tap(J[0], 'rojo', 4); await tap(J[1], 'rojo', 3); await tap(J[2], 'rojo', 2); await tap(J[2], 'azul', 1); await A.waitForTimeout(500);
  await A.click('[data-a=endRound]'); await A.click('[data-a=announce]'); await A.waitForSelector('[data-a=confirmFinal]');
  // 14 Cerrar
  await snap('14_cerrar', ['.fightinfo', '.banner'], '[data-a=confirmFinal]');
  await A.click('[data-a=confirmFinal]'); await A.waitForSelector('text=Ver acta');
  await snap('15_final', ['.banner.final'], 'text=Ver acta');
  // 16 Acta
  await A.click('text=Ver acta'); await A.waitForSelector('text=Firmas'); await A.waitForTimeout(500);
  await snap('16_acta', ['.acta > .card >> nth=0', '.acta > .card >> nth=1'], null);
  // 17 Ausencia
  await A.goto(BASE + `#/plataforma/${tid}/1`); await A.waitForSelector('#prog [data-abs]');
  await snap('17_ausencia', ['#prog'], '#prog [data-abs]');
  fs.writeFileSync('/tmp/claude-0/video2/meta.json', JSON.stringify(meta, null, 1));
  console.log('ok', Object.keys(meta).length); await browser.close();
})().catch((e) => { console.error('FAIL', e.message.split('\n')[0]); fs.writeFileSync('/tmp/claude-0/video2/meta.json', JSON.stringify(meta, null, 1)); process.exit(1); });
