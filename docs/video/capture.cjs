const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/video/shots', BASE = 'http://127.0.0.1:8766/?emu=1';
(async () => {
  const browser = await chromium.launch();
  const mk = async (opts) => { const c = await browser.newContext(opts); const p = await c.newPage(); p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? d.defaultValue() : undefined)); return p; };
  const A = await mk({ viewport: { width: 1300, height: 950 } });
  await A.goto(BASE + '#/'); await A.waitForSelector('text=Configuración inicial');
  await A.fill('input[name=nombre]', 'Jefe de Jueces'); await A.fill('input[name=u]', 'jefe.jueces'); await A.fill('input[name=pin]', '111111');
  await A.click('button[type=submit]'); await A.waitForSelector('#nt', { timeout: 15000 });
  await A.goto(BASE + '#/usuarios'); await A.waitForSelector('#f');
  for (const [n, pin] of [['Pedro González', '222222'], ['Ana Soto', '333333'], ['Luis Díaz', '444444']]) {
    await A.fill('input[name=nombre]', n); await A.fill('input[name=pin]', pin); await A.click('#f button[type=submit]');
    await A.waitForFunction((nm) => document.querySelector('#list')?.innerText.includes(nm) && !document.querySelector('input[name=nombre]').value, n, { timeout: 15000 });
  }
  await A.goto(BASE + '#/'); await A.fill('#nt input[name=nombre]', 'Capacitación'); await A.click('#nt button[type=submit]');
  await A.waitForFunction(() => location.hash.startsWith('#/torneo/')); const tid = (await A.evaluate(() => location.hash)).split('/')[2];
  await A.waitForSelector('#paste');
  await A.fill('#paste', 'Orden,Plataforma,Categoría,División,Fase,Jueces,Rojo,Club rojo,Peso rojo,Azul,Club azul,Peso azul\n1,1,Adulto oficial,-65 kg,Semifinal,3,Matías Fuentes,Club Dragón,64.5,Felipe Araya,Club Tigre,64.1\n2,1,Juvenil,-56 kg,Final,3,Josefa Contreras,Club Grulla,55.6,Antonia Reyes,Club Halcón,55.1');
  await A.waitForSelector('[data-import=add]:not([disabled])'); await A.click('[data-import=add]'); await A.waitForTimeout(800);

  const phone = { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
  const J = await mk(phone); const J2 = await mk(phone), J3 = await mk(phone);
  const shot = (name) => J.screenshot({ path: `${OUT}/${name}.png` });
  await J.goto(BASE + '#/'); await J.waitForSelector('input[name=u]');
  await J.fill('input[name=u]', 'pedro.gonzalez'); await J.fill('input[name=pin]', '222222'); await shot('01_login');
  await J.click('button[type=submit]'); await J.waitForSelector('text=Esperando que la mesa'); await shot('02_espera');
  for (const [p, u, pin] of [[J2, 'ana.soto', '333333'], [J3, 'luis.diaz', '444444']]) { await p.goto(BASE + '#/'); await p.fill('input[name=u]', u); await p.fill('input[name=pin]', pin); await p.click('button[type=submit]'); await p.waitForSelector('text=Esperando que la mesa'); }

  await A.goto(BASE + `#/plataforma/${tid}/1`); await A.waitForSelector('[data-seat="1"]');
  await A.selectOption('[data-seat="1"]', 'pedro_gonzalez'); await A.selectOption('[data-seat="2"]', 'ana_soto'); await A.selectOption('[data-seat="3"]', 'luis_diaz');
  await A.click('[data-saveseats]'); await J.waitForSelector('text=Esperando el próximo combate'); await shot('03_asignado');
  await A.click('[data-load]'); await J.waitForSelector('.pad-btn'); await J.waitForTimeout(300); await shot('04_bloqueado');
  await A.click('[data-a=start]'); await J.waitForSelector('.pad-btn:not([disabled])'); await J.waitForTimeout(300); await shot('05_activo');
  const tap = async (side) => { await J.click(`.pad-btn.${side}`); await J.waitForTimeout(250); };
  await tap('rojo'); await shot('06_rojo1');
  await tap('rojo'); await tap('rojo'); await shot('07_rojo3');
  await tap('azul'); await shot('08_azul1');
  await A.click('[data-a=ev][data-side=azul][data-type=amon]'); await J.waitForTimeout(500); await shot('09_penal');
  await tap('azul'); await shot('10_antes_deshacer');
  await J.click('[data-undo]'); await J.waitForTimeout(300); await shot('11_deshacer');
  await A.click('[data-a=endRound]'); await A.click('[data-a=announce]'); await J.waitForTimeout(600); await shot('12_cerrado');
  await A.click('[data-a=confirmFinal]').catch(() => {});
  // terminar rápido el combate y cargar el siguiente
  await A.click('[data-a=abs][data-k=sup]').catch(() => {}); await A.waitForTimeout(500);
  await A.click('[data-load]'); await J.waitForFunction(() => document.body.innerText.includes('Josefa'), null, { timeout: 15000 }); await J.waitForTimeout(300); await shot('13_siguiente');
  console.log('ok'); await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
