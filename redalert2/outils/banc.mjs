// Banc d'essai : ouvre le jeu dans Chromium sans affichage, exécute un scénario JS, capture console + écran.
// Usage : node outils/banc.mjs <url-suffixe> <attente-ms> [script-a-evaluer.js] [capture.png]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, appendFileSync } from 'fs';
const [suffix = '/?shell=1', waitMs = '20000', evalFile, shot = '/tmp/ra2-banc.png'] = process.argv.slice(2);
// Profil persistant : les ~700 Mo de ressources ne sont copiés dans le stockage du navigateur qu'une fois.
const browser = await chromium.launchPersistentContext(process.env.BANC_PROFIL ?? (process.env.HOME + '/ra2-banc-profil'), { viewport: { width: 1280, height: 720 }, args: ['--use-gl=angle', '--use-angle=metal', '--mute-audio'] });
const page = browser.pages()[0] ?? await browser.newPage();
const logs = [];
const LIVE = process.env.BANC_JOURNAL ?? '/tmp/ra2-banc-live.log';
writeFileSync(LIVE, '');
const note = (l) => { logs.push(l); try { appendFileSync(LIVE, l + '\n'); } catch {} };
page.on('console', m => { const t = m.text(); if (!/^\[Our\]|\[hashFilename\]/.test(t)) note(`[${m.type()}] ${t}`); });
page.on('pageerror', e => note(`[PAGEERROR] ${e.stack || e}`));
await page.goto('http://localhost:4000' + suffix);
// BANC_PAUSE=ms : met la page en pause via le débogueur et note la pile d'appels (pages figées).
if (process.env.BANC_PAUSE) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Debugger.enable');
  cdp.on('Debugger.paused', (ev) => {
    note('[PILE] ' + ev.callFrames.slice(0, 25).map(f => `${f.functionName || '(anonyme)'}@${f.url.split('/').pop().split('?')[0]}:${f.location.lineNumber + 1}`).join(' <- '));
    cdp.send('Debugger.resume').catch(() => {});
  });
  setTimeout(() => cdp.send('Debugger.pause').catch(e => note('[PILE-ERR] ' + e)), +process.env.BANC_PAUSE);
}
await page.waitForTimeout(+waitMs);
// CLICS="x,y,attente;x,y,attente" : clics à l'écran (le menu est dessiné en WebGL, pas en HTML).
for (const c of (process.env.CLICS ?? '').split(';').filter(Boolean)) {
  const [x, y, w] = c.split(',').map(Number);
  await page.mouse.click(x, y);
  await page.waitForTimeout(w || 1500);
}
if (evalFile) { try { const r = await Promise.race([page.evaluate(readFileSync(evalFile, 'utf8')), new Promise((_, rej) => setTimeout(() => rej(new Error('sonde : délai dépassé (page figée ?)')), +(process.env.BANC_DELAI_SONDE ?? 180000)))]); logs.push('[EVAL] ' + JSON.stringify(r)); } catch (e) { logs.push('[EVAL-ERR] ' + e); } }
await Promise.race([page.screenshot({ path: shot }), new Promise(r => setTimeout(r, 20000))]);
writeFileSync(process.env.BANC_LOG ?? '/tmp/ra2-banc.log', logs.join('\n'));
console.log(logs.slice(-150).join('\n'));
await Promise.race([browser.close(), new Promise(r => setTimeout(r, 10000))]);
process.exit(0);
