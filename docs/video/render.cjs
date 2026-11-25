const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  for (let i = 0; i < 15; i++) { await p.goto(`http://127.0.0.1:8777/slides.html#${i}`); await p.reload(); await p.waitForLoadState('networkidle'); await p.waitForTimeout(150);
    await p.screenshot({ path: `/tmp/claude-0/video/frames/s${String(i).padStart(2, '0')}.png` }); }
  await b.close(); console.log('ok'); })();
