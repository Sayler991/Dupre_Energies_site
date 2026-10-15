/* Dupre Energies — alertes « nouvelle demande » (rendez-vous / devis / message).
   Supabase Realtime (INSERT sur dupre.requests) + relève de secours toutes les 30 s.
   Son WebAudio, bannière rouge, pastille sur l'onglet, titre de l'onglet, notification du navigateur.
   Dépend de window.DUPRE_SB (créé par admin.js). */
(function () {
  'use strict';
  var sb = window.DUPRE_SB; if (!sb) return;
  var BASE_TITLE = document.title, unread = { rdv: 0, devis: 0, message: 0 }, maxId = null, seen = {}, chan = null, pollT = null, ac = null, running = false;
  var LBL = { rdv: 'Nouveau rendez-vous', devis: 'Nouvelle demande de devis', message: 'Nouveau message' };
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function total() { return unread.rdv + unread.devis + unread.message; }

  function audio() { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) {} return ac; }
  function beep() {
    var a = audio(); if (!a) return;
    [0, 0.18, 0.36].forEach(function (t, i) {
      var o = a.createOscillator(), g = a.createGain(), s = a.currentTime + t;
      o.type = 'triangle'; o.frequency.value = [880, 1175, 1568][i];
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.35, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.16);
      o.connect(g).connect(a.destination); o.start(s); o.stop(s + 0.18);
    });
  }
  document.addEventListener('pointerdown', audio, { once: true });

  function badge() {
    Object.keys(unread).forEach(function (k) {
      var b = document.querySelector('.side button[data-tab="' + k + '"]'); if (!b) return;
      b.style.position = 'relative'; var x = b.querySelector('.al-badge'), n = unread[k];
      if (!n) { if (x) x.remove(); return; }
      if (!x) { x = el('span', 'al-badge'); b.appendChild(x); }
      x.textContent = n > 99 ? '99+' : String(n); x.setAttribute('aria-label', n + ' non lue(s)');
    });
    var t = total(); document.title = t ? '(' + t + ') 🔔 Nouvelle demande — ' + BASE_TITLE : BASE_TITLE;
  }
  function clearCurrent() {
    var k = (location.hash || '#rdv').slice(1);
    if (unread[k] && document.visibilityState === 'visible') { unread[k] = 0; badge(); }
  }
  window.addEventListener('hashchange', clearCurrent);
  document.addEventListener('visibilitychange', clearCurrent);
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.side button[data-tab]'); if (b && unread[b.getAttribute('data-tab')] != null) setTimeout(function () { unread[b.getAttribute('data-tab')] = 0; badge(); }, 0); });

  function open(k) { var t = document.querySelector('.side button[data-tab="' + k + '"]'); if (t) t.click(); }
  function desc(o) { return (o.name || 'Client') + (o.kind === 'rdv' && o.day ? ' — ' + new Date(o.day + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + (o.slot || '') : o.service ? ' — ' + o.service : ''); }
  function banner(o) {
    var box = document.getElementById('al-stack');
    if (!box) { box = el('div', 'al-stack'); box.id = 'al-stack'; box.setAttribute('role', 'alert'); document.body.appendChild(box); }
    var b = el('div', 'al-banner');
    b.appendChild(el('b', null, '🔔 ' + LBL[o.kind] + ' n° ' + o.id));
    b.appendChild(el('span', null, desc(o)));
    var v = el('button', 'btn btn-solid btn-sm', 'Voir'); v.type = 'button'; v.onclick = function () { open(o.kind); b.remove(); };
    var x = el('button', 'al-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Fermer'); x.onclick = function () { b.remove(); };
    b.appendChild(v); b.appendChild(x); box.appendChild(b);
    setTimeout(function () { b.remove(); }, 60000);
  }
  function notify(o) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try { var n = new Notification('Dupre Energies — ' + LBL[o.kind], { body: desc(o), tag: 'dupre-' + o.id, icon: '../favicon.svg' }); n.onclick = function () { window.focus(); open(o.kind); n.close(); }; } catch (e) {}
  }
  function permButton() {
    var top = document.querySelector('header.top'); if (!top || top.querySelector('.al-perm')) return;
    var need = ('Notification' in window) && Notification.permission === 'default';
    var b = el('button', 'btn btn-line btn-sm al-perm', '🔔'); b.type = 'button';
    b.appendChild(el('span', 'al-lbl', need ? ' Activer les alertes' : ' Tester le son')); b.setAttribute('aria-label', need ? 'Activer les alertes' : 'Tester le son');
    b.onclick = function () { audio(); beep(); if (need) Notification.requestPermission().then(function () { b.remove(); }); else b.remove(); };
    top.insertBefore(b, top.querySelector('#status'));
  }
  function handle(o) {
    if (!o || seen[o.id] || !LBL[o.kind]) return; seen[o.id] = 1;
    if (maxId != null && o.id <= maxId && !o._rt) return;
    if (o.id > (maxId || 0)) maxId = o.id;
    unread[o.kind]++; clearCurrent(); badge(); beep(); banner(o); notify(o);
    if ((location.hash || '#rdv').slice(1) === o.kind) { var r = document.querySelector('.crm-bar .btn-line'); if (r && /Actualiser/.test(r.textContent)) r.click(); }
    document.dispatchEvent(new CustomEvent('dupre:new-request', { detail: o }));
  }
  function poll() {
    if (maxId == null) return;
    sb.from('requests').select('id,kind,name,day,slot,service').gt('id', maxId).order('id').limit(20).then(function (r) { if (!r.error) (r.data || []).forEach(handle); });
  }
  function start() {
    if (running) return; running = true;
    sb.from('requests').select('id').order('id', { ascending: false }).limit(1).then(function (r) {
      if (r.error) { running = false; return; }
      maxId = r.data && r.data[0] ? r.data[0].id : 0;
      chan = sb.channel('dupre-requests')
        .on('postgres_changes', { event: 'INSERT', schema: 'dupre', table: 'requests' }, function (p) { var o = p.new; o._rt = 1; handle(o); })
        .subscribe(function (st) { document.documentElement.setAttribute('data-realtime', st); });
      pollT = setInterval(poll, 30000);
      var t = setInterval(function () { if (document.querySelector('header.top')) { permButton(); badge(); clearInterval(t); } }, 300);
    });
  }
  function stop() { running = false; if (chan) sb.removeChannel(chan); chan = null; clearInterval(pollT); }
  sb.auth.onAuthStateChange(function (ev, session) {
    if (session && session.access_token && sb.realtime && sb.realtime.setAuth) sb.realtime.setAuth(session.access_token);
    if (session) setTimeout(start, 0); else stop();
  });
  window.DUPRE_ALERTS = { test: function (k) { handle({ id: (maxId || 0) + 1000 + Math.floor(Math.random() * 1000), kind: k || 'rdv', name: 'Test', day: new Date().toISOString().slice(0, 10), slot: '10h-12h' }); } };
})();
