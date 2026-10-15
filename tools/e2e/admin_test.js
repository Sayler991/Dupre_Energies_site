// Interface patron + alertes (faux client Supabase). node admin_test.js OUTDIR  (serveur : racine du dépôt sur :8643)
const p = require('/workspace/terrasse/ibis_tlemcen_site/work/node_modules/puppeteer-core');
const OUT = (process.argv[2] || '/workspace/dupre_shots/').replace(/\/?$/, '/');
const BASE = 'http://127.0.0.1:8643/tools/e2e/admin_harness.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'], headless: 'new' });
  const res = {}; const pg = await b.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.evaluateOnNewDocument(() => { window.NOTIFS = []; const N = function (t, o) { NOTIFS.push(t + ' | ' + o.body); }; N.permission = 'granted'; N.requestPermission = () => Promise.resolve('granted'); window.Notification = N;
    const AC = window.AudioContext; window.BEEPS = 0; window.AudioContext = function () { const a = new AC(); const o = a.createOscillator.bind(a); a.createOscillator = function () { window.BEEPS++; return o(); }; return a; }; });
  await pg.setViewport({ width: 1280, height: 820 });
  await pg.goto(BASE + '#rdv', { waitUntil: 'networkidle0' }); await sleep(900);
  for (const t of ['rdv', 'devis', 'message', 'clients', 'stats', 'contenu', 'historique']) {
    await pg.evaluate(t => document.querySelector('.side button[data-tab="' + t + '"]').click(), t); await sleep(500);
    res[t] = await pg.$eval('#main', e => ({ h2: e.querySelector('h2').textContent, cards: e.querySelectorAll('.card').length }));
    await pg.screenshot({ path: OUT + 'admin_' + t + '.png' });
  }
  // statut + note + contenu + restauration
  await pg.evaluate(() => document.querySelector('.side button[data-tab="rdv"]').click()); await sleep(400);
  await pg.evaluate(() => { const s = document.querySelector('.card.req select'); s.value = 'confirmé'; s.dispatchEvent(new Event('change')); }); await sleep(300);
  await pg.evaluate(() => document.querySelector('.side button[data-tab="clients"]').click()); await sleep(400);
  await pg.evaluate(() => { const t = document.querySelector('.card textarea'); t.value = 'Chaudière gaz 2015'; document.querySelector('.card .btn-line').click(); }); await sleep(300);
  await pg.evaluate(() => document.querySelector('.side button[data-tab="contenu"]').click()); await sleep(500);
  await pg.evaluate(() => { const c = document.querySelector('#main .switch input'); c.click(); document.querySelector('#save').click(); }); await sleep(400);
  await pg.evaluate(() => document.querySelector('.side button[data-tab="historique"]').click()); await sleep(400);
  await pg.evaluate(() => { const b = document.querySelector('#main .card button'); if (b) b.click(); }); await sleep(500);
  // alertes : rdv via temps réel (onglet Clients ouvert) + devis via relève 30 s
  await pg.evaluate(() => document.querySelector('.side button[data-tab="clients"]').click()); await sleep(300);
  await pg.evaluate(() => rtHandler({ new: { id: 901, kind: 'rdv', name: 'Mme Test (temps réel)', day: '2026-10-21', slot: '14h-16h' } })); await sleep(500);
  await pg.evaluate(() => { pollRows.push({ id: 902, kind: 'devis', name: 'M. Test (relève)', service: 'Remplacement de chauffe-eau' }); window.__poll(); }); await sleep(600);
  Object.assign(res, await pg.evaluate(() => ({ title: document.title, badges: [...document.querySelectorAll('.al-badge')].map(e => e.parentNode.getAttribute('data-tab') + '=' + e.textContent), banners: [...document.querySelectorAll('.al-banner b')].map(e => e.textContent), notifs: NOTIFS, beeps: BEEPS, rt: document.documentElement.getAttribute('data-realtime'), log: LOG })));
  await pg.screenshot({ path: OUT + 'admin_alerts.png' });
  const m = await b.newPage(); await m.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
  await m.goto(BASE + '#rdv', { waitUntil: 'networkidle0' }); await sleep(900); await m.screenshot({ path: OUT + 'admin_mobile_rdv.png' });
  res.errors = errs; console.log(JSON.stringify(res, null, 1)); await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
