// Prueba de carga del programa (Excel / CSV de Excel en español) y edición de combates.
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.argv[2], CSV_ES = process.argv[3], BASE = 'http://127.0.0.1:8766/?emu=1';
const XLSX_FILE = path.join(__dirname, '../../ejemplos/capacitacion-3-plataformas.xlsx');
const log = (...a) => console.log('•', ...a);
const NEXT = [], ERRS = []; let PAGE;
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 950 }, acceptDownloads: true });
  const A = await ctx.newPage(); PAGE = A;
  A.on('pageerror', (e) => ERRS.push(e.message));
  A.on('console', (m) => { if (m.type() === 'error' && !/status of 400/.test(m.text())) ERRS.push(m.text()); });
  A.on('dialog', (d) => d.accept(d.type() === 'prompt' ? (NEXT.shift() ?? d.defaultValue()) : undefined));
  await A.goto(BASE + '#/'); await A.waitForSelector('text=Configuración inicial');
  await A.fill('input[name=nombre]', 'Jefe de Jueces'); await A.fill('input[name=u]', 'jefe.jueces'); await A.fill('input[name=pin]', '111111');
  await A.click('button[type=submit]'); await A.waitForSelector('#nt', { timeout: 15000 });
  await A.fill('#nt input[name=nombre]', 'Capacitación'); await A.selectOption('#nt select[name=plataformas]', '3'); await A.click('#nt button[type=submit]');
  await A.waitForFunction(() => location.hash.startsWith('#/torneo/')); const tid = (await A.evaluate(() => location.hash)).split('/')[2];
  const counts = () => A.evaluate(async (tid) => { const D = await import('./js/data.js'); const c = Object.values(await D.queryEq('combates', 'torneo', tid));
    return { total: c.length, P1: c.filter((b) => b.plataforma === 1).length, P2: c.filter((b) => b.plataforma === 2).length, P3: c.filter((b) => b.plataforma === 3).length }; }, tid);
  const bout = (orden) => A.evaluate(async ([tid, o]) => { const D = await import('./js/data.js'); return Object.entries(await D.queryEq('combates', 'torneo', tid)).map(([k, b]) => ({ code: k, ...b })).find((b) => b.orden === o); }, [tid, orden]);

  // 1) Excel
  await A.setInputFiles('#file', XLSX_FILE); await A.waitForSelector('[data-import=add]:not([disabled])');
  log('xlsx vista previa:', (await A.locator('#prev p').first().innerText()));
  await A.screenshot({ path: `${OUT}/vista_previa.png`, fullPage: true });
  await A.click('[data-import=add]'); await A.waitForFunction(() => !document.querySelector('[data-import]'));
  await A.waitForTimeout(400); log('tras agregar xlsx:', JSON.stringify(await counts()));
  const b3 = await bout(3); log('#3:', b3.cat.name, b3.judges + ' jueces', b3.rojo.name, b3.rojo.weight, '| #7 sistema:', (await bout(7)).system);

  // 2) CSV de Excel en español (;  coma decimal, Windows-1252) → Reemplazar
  await A.setInputFiles('#file', CSV_ES); await A.waitForSelector('[data-import=replace]:not([disabled])');
  await A.click('[data-import=replace]'); await A.waitForFunction(() => !document.querySelector('[data-import]')); await A.waitForTimeout(400);
  const b1 = await bout(1); log('tras reemplazar con CSV de Excel:', JSON.stringify(await counts()), '| #1:', b1.rojo.name, b1.rojo.weight, b1.cat.name, '| #4:', (await bout(4)).rojo.name);

  // 3) Editar el combate #1
  await A.click(`[data-editb="${b1.code}"]`); await A.waitForSelector('#editor');
  await A.fill('[data-ef=rojo_name]', 'Matías Fuentes Soto'); await A.selectOption('[data-ef=judges]', '5'); await A.selectOption('[data-ef=catKey]', 'light');
  await A.fill('[data-ef=division]', '-67 kg');
  await A.screenshot({ path: `${OUT}/editor.png`, fullPage: true });
  await A.click('#esave'); await A.waitForFunction(() => !document.querySelector('#editor')); await A.waitForTimeout(300);
  const e1 = await bout(1); log('editado #1:', e1.rojo.name, '|', e1.judges, 'jueces |', e1.cat.name, '| KO', e1.cat.koAllowed, '|', e1.label);

  // 4) Agregar combate a mano en P3
  await A.click('#newbout'); await A.waitForSelector('#editor');
  await A.selectOption('[data-ef=plataforma]', '3');
  await A.fill('[data-ef=rojo_name]', 'Agregado Rojo'); await A.fill('[data-ef=azul_name]', 'Agregado Azul');
  await A.click('#esave'); await A.waitForFunction(() => !document.querySelector('#editor')); await A.waitForTimeout(300);
  log('tras agregar a mano:', JSON.stringify(await counts()), '| orden nuevo:', (await bout(10))?.plataforma === 3 ? '#10 en P3' : JSON.stringify(await bout(4)));

  // 5) Plantilla Excel
  await A.click('details summary');
  const [dl] = await Promise.all([A.waitForEvent('download'), A.click('#tpl')]);
  log('plantilla descargada:', dl.suggestedFilename());

  // 6) Mesa P3 ve sus combates
  await A.goto(BASE + `#/plataforma/${tid}/3`); await A.waitForSelector('text=Siguiente');
  log('mesa P3 programa:', (await A.locator('#prog table').innerText()).split('\n').filter((l) => l.includes(' vs ')).length, 'combates');
  console.log('ERRORS:', ERRS.length ? ERRS : 'none');
  await browser.close();
})().catch(async (e) => { console.error('FAIL', e.message.split('\n')[0]); console.log('ERRS', ERRS);
  try { console.log('PAGE', (await PAGE.innerText('body')).replace(/\s+/g, ' ').slice(0, 400)); await PAGE.screenshot({ path: `${OUT}/fail.png`, fullPage: true }); } catch {}
  process.exit(1); });
