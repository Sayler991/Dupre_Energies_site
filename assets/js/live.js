/* Dupre Energies (maquette) — contenu en direct (Supabase dupre.site_content, secours content.json)
   + formulaires rendez-vous / devis (photo) / message + animations. */
(function () {
  'use strict';
  var C = window.DUPRE_CONFIG || {}, sb = null, DATA = null, BUCKET = 'images';
  try { sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { db: { schema: C.SCHEMA || 'dupre' }, auth: { persistSession: false } }); } catch (e) {}
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rich(t) { return esc(t).replace(/\*([^*]+)\*/g, '<em>$1</em>'); }
  function get(o, p) { return p.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  var ICONS = { alert: 1, drop: 1, pipe: 1, tank: 1, bath: 1, search: 1, flame: 1 };

  function apply(d, src) {
    DATA = d; document.documentElement.setAttribute('data-live', src);
    $$('[data-c]').forEach(function (el) { var v = get(d, el.getAttribute('data-c')); if (typeof v === 'string' && v) el.innerHTML = rich(v); });
    var b = d.business || {};
    if (b.phone) {
      $$('a[href^="tel:"]').forEach(function (a) { if (b.phone_intl) a.setAttribute('href', 'tel:' + b.phone_intl); });
      $$('.ph').forEach(function (e) { e.textContent = b.phone; });
    }
    var os = $('#openstate');
    if (b.open === false) { os.textContent = b.closed_text || 'Momentanément indisponible.'; os.hidden = false; } else os.hidden = true;
    Object.keys(d.photos || {}).forEach(function (k) {
      var p = d.photos[k]; if (!p) return;
      $$('img[data-photo="' + k + '"]').forEach(function (img) {
        if (p.alt) img.alt = p.alt;
        if (p.src) { img.removeAttribute('srcset'); img.src = p.src; }
      });
    });
    var box = $('#svc-list'), html = '', sel = $('#f-service'), opts = '<option value="">Choisir…</option>';
    (d.services || []).forEach(function (s, i) {
      var ic = ICONS[s.icon] ? s.icon : 'drop';
      html += '<article class="card reveal' + (i === 0 ? ' urgent' : '') + '"><div class="ic"><svg><use href="#i-' + ic + '"/></svg></div><h3>' + esc(s.title) + '</h3><p>' + esc(s.desc) + '</p>' +
        (i === 0 ? '<p style="margin-top:.8rem"><a href="tel:' + esc(b.phone_intl || '+33612591818') + '">📞 ' + esc(b.phone || '06 12 59 18 18') + '</a></p>' : '') + '</article>';
      opts += '<option>' + esc(s.title) + '</option>';
    });
    opts += '<option>Autre</option>';
    box.innerHTML = html; sel.innerHTML = opts;
    var bk = d.booking || {}, t = $('#t-rdv');
    if (bk.open === false) { t.disabled = true; t.title = 'Prise de rendez-vous en ligne fermée'; if (form.getAttribute('data-kind') === 'rdv') setKind('devis'); }
    else t.disabled = false;
    observe();
  }

  function load() {
    var fb = function () { return fetch('content.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (d) { apply(d, 'fallback'); }).catch(function () { document.documentElement.setAttribute('data-live', 'static'); observe(); }); };
    if (!sb) return fb();
    var to = new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 6000); });
    Promise.race([sb.from('site_content').select('data').eq('id', 1).single(), to]).then(function (r) {
      if (r.error || !r.data) throw r.error || new Error('vide'); apply(r.data.data, 'supabase');
    }).catch(fb);
  }

  /* ---------- formulaire ---------- */
  var form = $('#p-form'), out = $('#f-out');
  var LABELS = { rdv: 'Décrivez le problème *', devis: 'Décrivez votre projet *', message: 'Votre message *' };
  function setKind(k) {
    form.setAttribute('data-kind', k); out.innerHTML = '';
    $$('.tabs button').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-kind') === k)); });
    $('#f-msg-l').textContent = LABELS[k];
    $('#f-note').style.display = k === 'rdv' ? '' : 'none';
    $('#f-day').required = $('#f-slot').required = $('#f-address').required = k === 'rdv';
    $('#f-service').required = k === 'devis';
  }
  $$('.tabs button').forEach(function (b) { b.addEventListener('click', function () { setKind(b.getAttribute('data-kind')); }); });
  var today = new Date(), iso = function (d) { return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  $('#f-day').min = iso(today); $('#f-day').max = iso(new Date(Date.now() + 90 * 864e5));

  function show(t, ok) { out.innerHTML = '<p class="msg ' + (ok ? 'ok' : 'err') + '">' + esc(t) + '</p>'; }
  function bad(el, t) { el.setAttribute('aria-invalid', 'true'); el.focus(); show(t, false); return false; }
  function validate(k) {
    $$('#p-form [aria-invalid]').forEach(function (e) { e.removeAttribute('aria-invalid'); });
    if (k === 'rdv') {
      var d = $('#f-day').value; if (!d) return bad($('#f-day'), 'Choisissez une date.');
      if (d < $('#f-day').min || d > $('#f-day').max) return bad($('#f-day'), 'Date entre aujourd’hui et 90 jours.');
      if (new Date(d + 'T12:00:00').getDay() === 0) return bad($('#f-day'), 'Pas de rendez-vous le dimanche : en cas d’urgence, appelez-nous.');
      if (!$('#f-slot').value) return bad($('#f-slot'), 'Choisissez un créneau.');
    }
    if (k === 'devis' && !$('#f-service').value) return bad($('#f-service'), 'Choisissez le type de prestation.');
    if ($('#f-name').value.trim().length < 2) return bad($('#f-name'), 'Indiquez votre nom.');
    if (!/^\+?[0-9][0-9 .-]{7,18}[0-9]$/.test($('#f-phone').value.trim())) return bad($('#f-phone'), 'Numéro de téléphone invalide (ex. 06 12 34 56 78).');
    if (k === 'rdv' && $('#f-address').value.trim().length < 5) return bad($('#f-address'), 'Indiquez l’adresse d’intervention.');
    var em = $('#f-email').value.trim(); if (k !== 'rdv' && em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return bad($('#f-email'), 'E-mail invalide.');
    if ($('#f-msg').value.trim().length < 5) return bad($('#f-msg'), 'Décrivez votre demande en quelques mots.');
    var f = $('#f-photo').files[0];
    if (k === 'devis' && f) { if (f.size > 6291456) return bad($('#f-photo'), 'Photo trop lourde (6 Mo max.).'); if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return bad($('#f-photo'), 'Format accepté : JPG, PNG ou WebP.'); }
    return true;
  }
  function upload(f) {
    var ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[f.type];
    var name = 'up-dupre_devis-' + Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, 'x').padEnd(6, 'x') + '-' + Date.now() + '.' + ext;
    return sb.storage.from(BUCKET).upload(name, f, { contentType: f.type, upsert: false }).then(function (r) {
      if (r.error) throw new Error('Envoi de la photo impossible : ' + r.error.message);
      return sb.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
    });
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault(); var k = form.getAttribute('data-kind');
    if (!validate(k)) return;
    if (!sb) return show('Envoi indisponible pour le moment : appelez-nous au ' + ((DATA && DATA.business && DATA.business.phone) || '06 12 59 18 18') + '.', false);
    var btn = $('#f-send'); btn.disabled = true; btn.textContent = 'Envoi…';
    var f = k === 'devis' ? $('#f-photo').files[0] : null;
    (f ? upload(f) : Promise.resolve(null)).then(function (url) {
      var row = { kind: k, name: $('#f-name').value.trim(), phone: $('#f-phone').value.trim(), message: $('#f-msg').value.trim(), hp: $('#f-hp').value };
      if (k !== 'message') row.address = $('#f-address').value.trim() || null;
      if (k !== 'rdv') row.email = $('#f-email').value.trim() || null;
      if (k === 'rdv') { row.day = $('#f-day').value; row.slot = $('#f-slot').value; }
      if (k === 'devis') { row.service = $('#f-service').value; row.photo_url = url; }
      return sb.from('requests').insert(row).then(function (r) { if (r.error) throw new Error(r.error.message); });
    }).then(function () {
      var tx = { rdv: 'Merci ! Votre demande de rendez-vous est bien reçue. Nous vous rappelons pour confirmer le créneau.', devis: 'Merci ! Votre demande de devis est bien reçue. Nous revenons vers vous rapidement.', message: 'Merci ! Votre message est bien reçu. Nous vous recontactons rapidement.' }[k];
      form.reset(); setKind(k); show(tx, true); form.setAttribute('data-sent', '1');
    }).catch(function (err) { show((err && err.message) || 'Échec de l’envoi. Appelez-nous.', false); })
      .then(function () { btn.disabled = false; btn.textContent = 'Envoyer la demande'; });
  });

  /* ---------- animations ---------- */
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { threshold: .12 }) : null;
  function observe() { $$('.reveal:not(.in)').forEach(function (el) { if (io) io.observe(el); else el.classList.add('in'); }); }
  var nav = $('#nav'), sticky = $('#sticky'), hero = $('.hero');
  function onScroll() { var y = window.scrollY; nav.classList.toggle('solid', y > 40); sticky.classList.toggle('show', y > hero.offsetHeight * .6); }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  setKind('rdv'); observe(); load();
})();
