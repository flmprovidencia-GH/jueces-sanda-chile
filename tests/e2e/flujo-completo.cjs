const { chromium } = require('playwright');
let PAGES = [], ERRS = [];
const OUT = process.argv[2], BASE = 'http://127.0.0.1:8766/?emu=1';
const log = (...a) => console.log('•', ...a);
(async () => {
  const browser = await chromium.launch();
  const errors = ERRS;
  const mk = async (name, opts = {}) => {
    const ctx = await browser.newContext(opts); const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error' || /PERMISSION|permission_denied/i.test(m.text())) errors.push(`${name}: ${m.text()}`); });
    p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? d.defaultValue() : undefined));
    PAGES.push([name, p]); return p;
  };
  const phone = { viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true };
  const A = await mk('admin', { viewport: { width: 1300, height: 950 } });
  await A.goto(BASE + '#/');
  await A.waitForSelector('text=Configuración inicial');
  await A.fill('input[name=nombre]', 'Jefe de Jueces');
  await A.fill('input[name=u]', 'jefe.jueces'); await A.fill('input[name=pin]', '111111');
  await A.click('button[type=submit]');
  await A.waitForSelector('text=Torneos', { timeout: 15000 }); log('admin creado y logueado');

  await A.goto(BASE + '#/usuarios'); await A.waitForSelector('text=Nuevo usuario');
  const judges = [['Pedro González', '222222'], ['Ana Soto', '333333'], ['Luis Díaz', '444444']];
  for (const [n, pin] of judges) {
    await A.fill('input[name=nombre]', n); await A.fill('input[name=pin]', pin);
    await A.click('#f button[type=submit]');
    await A.waitForFunction((nm) => document.querySelector('#list')?.innerText.includes(nm) && !document.querySelector('input[name=nombre]').value, n, { timeout: 15000 });
  }
  log('jueces creados:', (await A.locator('#list code').allInnerTexts()).join(', '));
  await A.screenshot({ path: `${OUT}/usuarios.png`, fullPage: true });

  await A.goto(BASE + '#/'); await A.fill('#nt input[name=nombre]', 'Copa Primavera 2026'); await A.fill('#nt input[name=fecha]', '2026-11-21');
  await A.selectOption('#nt select[name=plataformas]', '2'); await A.click('#nt button[type=submit]');
  await A.waitForFunction(() => location.hash.startsWith('#/torneo/'));
  const tid = (await A.evaluate(() => location.hash)).split('/')[2]; log('torneo', tid);
  await A.waitForSelector('#pname');
  await A.fill('#pname', 'Panel A'); await A.click('#addp');
  await A.waitForSelector('[data-pm]');
  for (const n of ['Pedro González', 'Ana Soto', 'Luis Díaz']) { await A.locator('label.chip', { hasText: n }).first().locator('input').check(); await A.waitForTimeout(150); }
  const H = 'Orden\tPlataforma\tCategoría\tDivisión\tFase\tSistema\tJueces\tPanel\tKO\tRojo\tClub rojo\tPeso rojo\tAzul\tClub azul\tPeso azul';
  const rows = [H,
    '1\t1\tAdulto oficial\t-65 kg\tSemifinal\tEliminación\t3\tPanel A\t\tCamila Rojas\tClub Dragón\t64.2\tValentina Soto\tClub Tigre\t63.8',
    '2\t1\tSuper lucha\t-75 kg\tFinal\tEliminación\t3\tPanel A\t\tMatías Pérez\tClub Grulla\t74\tJorge Muñoz\tClub Halcón\t75',
    '3\t2\tInfantil\t-40 kg\tFinal\tEliminación\t3\t\t\tTomás Díaz\tClub Dragón\t39.5\tLuis Pérez\tClub Tigre\t38.9'].join('\n');
  await A.fill('#paste', rows);
  await A.waitForSelector('#doimport:not([disabled])'); await A.click('#doimport');
  await A.waitForFunction(() => document.body.innerText.includes('Camila Rojas') && document.body.innerText.includes('3 combates'), null, { timeout: 15000 });
  log('programa importado'); await A.screenshot({ path: `${OUT}/torneo.png`, fullPage: true });

  // Jueces ingresan desde sus celulares
  const J = [];
  for (const [i, [n, pin]] of judges.entries()) {
    const p = await mk('juez' + (i + 1), phone); await p.goto(BASE + '#/');
    await p.fill('input[name=u]', ['pedro.gonzalez', 'ana.soto', 'luis.diaz'][i]); await p.fill('input[name=pin]', pin);
    await p.click('button[type=submit]'); await p.waitForSelector('text=Esperando que la mesa', { timeout: 15000 }); J.push(p);
  }
  log('3 jueces conectados esperando'); await J[0].screenshot({ path: `${OUT}/juez_espera.png` });

  // Mesa plataforma 1
  await A.goto(BASE + `#/plataforma/${tid}/1`); await A.waitForSelector('text=Siguiente');
  await A.click('[data-load]'); // acepta cargar Panel A
  await J[0].waitForSelector('.pad-btn', { timeout: 15000 }); log('jueces asignados automáticamente por panel');
  await A.click('[data-a=start]'); await J[0].waitForSelector('.pad-btn:not([disabled])');
  const tap = async (p, side, k) => { for (let i = 0; i < k; i++) await p.click(`.pad-btn.${side}`); };
  for (const round of [1, 2]) {
    await tap(J[0], 'rojo', 4); await tap(J[0], 'azul', 2); await tap(J[1], 'rojo', 3); await tap(J[1], 'azul', 3); await tap(J[2], 'rojo', 5); await tap(J[2], 'azul', 1);
    if (round === 1) { await A.click('[data-a=ev][data-side=azul][data-type=adv]'); await A.waitForTimeout(400); await A.screenshot({ path: `${OUT}/mesa_plataforma.png`, fullPage: true }); await J[1].screenshot({ path: `${OUT}/juez_puntuando.png` }); }
    await A.waitForTimeout(300);
    await A.click('[data-a=endRound]'); await A.click('[data-a=announce]'); await A.waitForTimeout(400);
    if (round === 1) { await A.click('[data-a=nextRound]'); await A.click('[data-a=start]'); await J[0].waitForSelector('.pad-btn:not([disabled])'); }
  }
  log('banner:', (await A.locator('.banner').first().innerText()).replace(/\s+/g, ' '));
  await A.click('[data-a=confirmFinal]'); await A.waitForSelector('text=Ver acta');
  const scr = await mk('pantalla', { viewport: { width: 1280, height: 720 } });
  await scr.goto(BASE + `#/pantalla/${tid}/1`); await scr.waitForSelector('.fighter'); await scr.screenshot({ path: `${OUT}/pantalla.png` });
  await A.click('text=Ver acta'); await A.waitForSelector('text=Firmas'); await A.waitForTimeout(400);
  await A.screenshot({ path: `${OUT}/acta.png`, fullPage: true });
  log('acta:', (await A.locator('.acta .card').nth(1).innerText()).replace(/\s+/g, ' ').slice(0, 200));
  // Siguiente combate: jueces cambian solos
  await A.goBack(); await A.waitForSelector('text=Siguiente');
  await A.click('[data-load]'); await J[2].waitForFunction(() => document.body.innerText.includes('Matías Pérez'), null, { timeout: 15000 });
  log('jueces pasaron solos al combate #2');
  // Seguridad: Pedro (Juez 1) intenta escribir en el puesto 2 y en otro combate
  const sec = await J[0].evaluate(async (tid) => {
    const D = await import('./js/data.js');
    const code = await D.get(`plataformas/${tid}/1/actual`);
    const tryW = async (path) => { try { await D.update({ [path]: 99 }); return 'PERMITIDO'; } catch (e) { return 'bloqueado'; } };
    return { propio: await tryW(`jueces/${code}/1/x`), ajeno: await tryW(`jueces/${code}/2/x`), combate: await tryW(`combates/${code}/phase`), usuarios: await tryW('usuarios/pedro_gonzalez/roles/admin') };
  }, tid);
  log('seguridad (juez 1):', JSON.stringify(sec));
  ERRS.splice(0, ERRS.length, ...ERRS.filter((e) => !/permission_denied/.test(e)));
  console.log('ERRORS:', errors.length ? errors : 'none');
  await browser.close();
})().catch(async (e) => { console.error('FAIL', e.message.split('\n')[0]); console.log('ERRS', ERRS);
  for (const [n, p] of PAGES) { try { console.log('PAGE', n, (await p.innerText('body')).replace(/\s+/g,' ').slice(0, 250)); await p.screenshot({ path: `${process.argv[2]}/fail_${n}.png` }); } catch {} }
  process.exit(1); });
