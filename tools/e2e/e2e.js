// E2E : node e2e.js BASE_URL OUTDIR  (puppeteer-core + Chrome) — soumet 3 demandes de TEST (à supprimer ensuite)
const p = require('/workspace/terrasse/ibis_tlemcen_site/work/node_modules/puppeteer-core');
const BASE = (process.argv[2] || 'https://sayler991.github.io/Dupre_Energies_site/').replace(/\/?$/, '/');
const OUT = (process.argv[3] || '/workspace/dupre_shots/').replace(/\/?$/, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nextWeekday = () => { const d = new Date(Date.now() + 3 * 864e5); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
(async () => {
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
  const res = {};
  const pg = await b.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.setViewport({ width: 1366, height: 860 });
  await pg.goto(BASE + '?e2e=' + Date.now(), { waitUntil: 'networkidle2' });
  await pg.waitForFunction(() => document.documentElement.getAttribute('data-live') === 'supabase', { timeout: 20000 });
  res.live = 'supabase'; res.services = await pg.$$eval('#svc-list .card', e => e.map(x => x.querySelector('h3').textContent));
  res.telLinks = await pg.$$eval('a[href^="tel:"]', e => [...new Set(e.map(a => a.getAttribute('href')))]);
  await sleep(1200); await pg.screenshot({ path: OUT + 'desktop_1_hero.png' });
  for (const [id, n] of [['services', 2], ['pourquoi', 3], ['avis', 4], ['contact', 5]]) {
    await pg.evaluate(id => document.getElementById(id).scrollIntoView(), id); await sleep(1300);
    await pg.screenshot({ path: OUT + 'desktop_' + n + '_' + id + '.png' });
  }
  // validation : envoi vide
  await pg.click('#f-send'); await sleep(400); res.emptyValidation = await pg.$eval('#f-out', e => e.textContent.trim());
  // 1) rendez-vous
  await pg.$eval('#f-day', (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, nextWeekday()); res.dayValue = await pg.$eval('#f-day', e => e.value); await pg.select('#f-slot', '10h-12h');
  await pg.type('#f-name', 'TEST E2E Dupre rdv'); await pg.type('#f-phone', '06 00 00 00 08');
  await pg.type('#f-address', '1 rue de Test, 33700 Mérignac'); await pg.type('#f-msg', 'Demande de test automatique — à supprimer');
  await pg.evaluate(() => document.querySelector('#p-form').scrollIntoView({ block: 'center' })); await sleep(300);
  await pg.screenshot({ path: OUT + 'desktop_6_form_rdv.png' });
  res.dayBefore = await pg.$eval('#f-day', e => e.value + '|' + document.querySelector('#p-form').dataset.kind); await pg.$eval('#f-out', e => { e.innerHTML = ''; }); await pg.click('#f-send'); await pg.waitForSelector('#f-out .msg', { timeout: 20000 }); await sleep(300);
  res.rdv = await pg.$eval('#f-out', e => e.textContent.trim());
  await pg.screenshot({ path: OUT + 'desktop_7_form_sent.png' });
  // 2) devis + photo
  await pg.$eval('#t-devis', e => e.click()); await pg.evaluate(() => document.querySelector('#p-form').scrollIntoView({ block: 'center' })); await pg.select('#f-service', 'Remplacement de chauffe-eau');
  await pg.type('#f-name', 'TEST E2E Dupre devis'); await pg.type('#f-phone', '06 00 00 00 09'); await pg.type('#f-msg', 'Devis de test automatique — à supprimer');
  const fi = await pg.$('#f-photo'); await fi.uploadFile(__dirname + '/test_photo.jpg');
  await pg.screenshot({ path: OUT + 'desktop_8_form_devis.png' });
  await pg.$eval('#f-out', e => { e.innerHTML = ''; }); await pg.click('#f-send'); await pg.waitForSelector('#f-out .msg', { timeout: 30000 }); res.devis = await pg.$eval('#f-out', e => e.textContent.trim());
  // 3) message
  await pg.$eval('#t-message', e => e.click()); await pg.type('#f-name', 'TEST E2E Dupre message'); await pg.type('#f-phone', '06 00 00 00 10');
  await pg.type('#f-email', 'test@example.com'); await pg.type('#f-msg', 'Message de test automatique — à supprimer');
  await pg.$eval('#f-out', e => { e.innerHTML = ''; }); await pg.click('#f-send'); await pg.waitForSelector('#f-out .msg', { timeout: 20000 }); res.message = await pg.$eval('#f-out', e => e.textContent.trim());
  res.siteErrors = errs.slice();
  // mobile 390
  const m = await b.newPage(); const merr = []; m.on('pageerror', e => merr.push(e.message));
  await m.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await m.goto(BASE, { waitUntil: 'networkidle2' }); await sleep(1800);
  await m.screenshot({ path: OUT + 'mobile_1_hero.png' });
  res.mobileOverflow = await m.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  for (const [id, n] of [['services', 2], ['pourquoi', 3], ['avis', 4], ['contact', 5]]) {
    await m.evaluate(id => document.getElementById(id).scrollIntoView(), id); await sleep(1300);
    await m.screenshot({ path: OUT + 'mobile_' + n + '_' + id + '.png' });
  }
  await m.evaluate(() => document.querySelector('.info').scrollIntoView()); await sleep(1500);
  await m.screenshot({ path: OUT + 'mobile_6_call_map.png' });
  res.stickyVisible = await m.$eval('#sticky', e => e.classList.contains('show') && getComputedStyle(e).display !== 'none');
  res.mobileErrors = merr;
  // admin
  const a = await b.newPage(); const aerr = []; a.on('pageerror', e => aerr.push(e.message));
  await a.setViewport({ width: 1280, height: 800 });
  await a.goto(BASE + 'admin/', { waitUntil: 'networkidle2' });
  await a.waitForSelector('#login:not([hidden])', { timeout: 15000 }); await sleep(400);
  await a.screenshot({ path: OUT + 'admin_login.png' });
  await a.type('#login-email', 'benduy0@gmail.com'); await a.type('#login-pw', 'mauvais-mot-de-passe-test');
  await a.click('#login-form button'); await a.waitForSelector('#login-err:not([hidden])', { timeout: 15000 });
  res.adminWrongPw = await a.$eval('#login-err', e => e.textContent); res.adminErrors = aerr;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
