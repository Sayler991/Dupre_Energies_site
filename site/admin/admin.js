/* Tableau de bord Dupre Energies (maquette) — Supabase schéma « dupre » :
   rendez-vous, devis, messages, clients (notes), stats, contenu (textes/services/horaires/photos), historique.
   Compte patron = table public.owners (fonction public.is_owner()). */
(function () {
  'use strict';
  var C = window.DUPRE_CONFIG || {};
  var sb = (window.supabase && C.SUPABASE_URL) ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { db: { schema: C.SCHEMA || 'dupre' } }) : null;
  window.DUPRE_SB = sb;
  var BUCKET = 'images', STATUSES = ['nouveau', 'confirmé', 'terminé', 'annulé'];
  var KIND = { rdv: '📅 Rendez-vous', devis: '📝 Devis', message: '✉️ Message' };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var CONTENT = null, DIRTY = false, TAB = 'rdv';

  function h(tag, attrs) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k]; if (v == null || v === false) return;
      if (k === 'text') e.textContent = v; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else if (k === 'value') e.value = v; else e.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c == null) continue; (Array.isArray(c) ? c : [c]).forEach(function (x) { if (x != null) e.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); }); }
    return e;
  }
  function toast(t, err) { var x = h('div', { class: 'toast' + (err ? ' err' : ''), text: t }); $('#toasts').appendChild(x); setTimeout(function () { x.remove(); }, err ? 7000 : 3500); }
  function dt(s) { return new Date(s).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }); }
  function dday(s) { return new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function telA(p) { return h('a', { href: 'tel:' + String(p || '').replace(/[^0-9+]/g, ''), text: p || '' }); }
  function field(label, obj, key, opt) {
    opt = opt || {};
    var inp = opt.type === 'textarea' ? h('textarea', { rows: opt.rows || 2 }) : h('input', { type: opt.type || 'text' });
    if (opt.type === 'checkbox') { inp.checked = obj[key] !== false; inp.style.width = 'auto'; inp.onchange = function () { obj[key] = inp.checked; DIRTY = true; }; return h('label', { class: 'row switch' }, inp, label); }
    inp.value = obj[key] == null ? '' : obj[key];
    inp.oninput = function () { obj[key] = inp.value; DIRTY = true; };
    return h('label', { class: 'f' }, h('span', { text: label }), inp, opt.hint ? h('small', { class: 'mut', text: opt.hint }) : null);
  }

  /* ---------- connexion ---------- */
  function showLogin(msg) {
    $('#boot').hidden = true; $('#app').hidden = true; $('#login').hidden = false;
    if (msg) { $('#login-err').textContent = msg; $('#login-err').hidden = false; }
  }
  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault(); $('#login-err').hidden = true;
    sb.auth.signInWithPassword({ email: $('#login-email').value.trim(), password: $('#login-pw').value }).then(function (r) {
      if (r.error) showLogin('Connexion refusée : ' + (r.error.message === 'Invalid login credentials' ? 'e-mail ou mot de passe incorrect.' : r.error.message));
    });
  });
  function checkOwner(session) {
    return sb.schema('public').from('owners').select('user_id').eq('user_id', session.user.id).maybeSingle().then(function (r) { return !!(r.data); });
  }

  /* ---------- squelette ---------- */
  var TABS = [['rdv', '📅 Rendez-vous'], ['devis', '📝 Devis'], ['message', '✉️ Messages'], ['clients', '👥 Clients'], ['stats', '📊 Stats'], ['contenu', '✏️ Contenu & photos'], ['historique', '🕘 Historique']];
  function shell(session) {
    var app = $('#app'); app.innerHTML = '';
    var side = h('nav', { class: 'side' });
    TABS.forEach(function (t) { side.appendChild(h('button', { type: 'button', 'data-tab': t[0], text: t[1], onclick: function () { go(t[0]); } })); });
    app.appendChild(h('header', { class: 'top' },
      h('div', { class: 'brand' }, h('img', { src: '../favicon.svg', alt: '' }), h('b', { text: 'Dupre Energies — tableau de bord' })),
      h('span', { id: 'status', text: session.user.email }),
      h('a', { class: 'btn btn-line btn-sm', href: '../', target: '_blank', text: 'Voir le site' }),
      h('button', { class: 'btn btn-line btn-sm', type: 'button', text: 'Déconnexion', onclick: function () { sb.auth.signOut(); } })));
    app.appendChild(h('div', { class: 'layout' }, side, h('main', { id: 'main' })));
    $('#boot').hidden = true; $('#login').hidden = true; app.hidden = false;
    go((location.hash || '#rdv').slice(1));
  }
  function go(tab) {
    if (DIRTY && !confirm('Modifications non enregistrées : les abandonner ?')) return;
    DIRTY = false; if (!TABS.some(function (t) { return t[0] === tab; })) tab = 'rdv'; TAB = tab;
    history.replaceState(null, '', '#' + tab);
    document.querySelectorAll('.side button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === tab); });
    var m = $('#main'); m.innerHTML = '';
    if (KIND[tab]) return viewRequests(m, tab);
    ({ clients: viewClients, stats: viewStats, contenu: viewContent, historique: viewHistory })[tab](m);
  }
  window.DUPRE_GO = function (t) { go(t); };

  /* ---------- demandes (rdv / devis / messages) ---------- */
  function viewRequests(m, kind) {
    var filt = h('select', { 'aria-label': 'Filtre' }, h('option', { value: 'actives', text: 'À traiter (nouveau + confirmé)' }), h('option', { value: '', text: 'Toutes' }), STATUSES.map(function (s) { return h('option', { value: s, text: s }); }));
    var list = h('div');
    m.appendChild(h('h2', { text: KIND[kind] + (kind === 'message' ? 's' : '') }));
    m.appendChild(h('div', { class: 'crm-bar' }, filt, h('button', { class: 'btn btn-line btn-sm', type: 'button', text: '↻ Actualiser', onclick: load })));
    m.appendChild(list); filt.onchange = load;
    function load() {
      var q = sb.from('requests').select('*').eq('kind', kind).limit(300);
      q = kind === 'rdv' ? q.order('day', { ascending: true }).order('slot') : q.order('created_at', { ascending: false });
      if (filt.value === 'actives') q = q.in('status', ['nouveau', 'confirmé']); else if (filt.value) q = q.eq('status', filt.value);
      q.then(function (r) {
        if (r.error) return toast(r.error.message, true);
        list.innerHTML = '';
        if (!r.data.length) list.appendChild(h('p', { class: 'mut', text: 'Aucune demande.' }));
        r.data.forEach(function (o) {
          var badge = h('span', { class: 'st st-' + o.status, text: o.status });
          var sel = h('select', { 'aria-label': 'Statut' }, STATUSES.map(function (s) { return h('option', { value: s, text: s }); })); sel.value = o.status; sel.style.width = 'auto';
          sel.onchange = function () {
            var v = sel.value;
            sb.from('requests').update({ status: v }).eq('id', o.id).select('id').single().then(function (r2) {
              if (r2.error) { toast(r2.error.message, true); sel.value = o.status; } else { o.status = v; badge.className = 'st st-' + v; badge.textContent = v; toast('Demande n° ' + o.id + ' : ' + v); }
            });
          };
          list.appendChild(h('section', { class: 'card req' },
            h('div', null,
              h('b', { text: 'N° ' + o.id + ' — ' + o.name }), ' ', badge, ' · ', telA(o.phone), o.email ? [' · ', h('a', { href: 'mailto:' + o.email, text: o.email })] : null,
              o.kind === 'rdv' ? h('p', { text: '🗓️ ' + dday(o.day) + ' · ' + o.slot }) : null,
              o.service ? h('p', { class: 'sm', text: '🔧 ' + o.service }) : null,
              o.address ? h('p', { class: 'sm', text: '📍 ' + o.address }) : null,
              h('p', { text: o.message }),
              o.photo_url ? h('p', { class: 'ph' }, h('a', { href: o.photo_url, target: '_blank', rel: 'noopener' }, h('img', { src: o.photo_url, alt: 'Photo jointe au devis' }))) : null,
              h('p', { class: 'sm', text: 'Reçue le ' + dt(o.created_at) })),
            h('div', { style: 'text-align:right' }, sel)));
        });
      });
    }
    load();
  }

  /* ---------- clients ---------- */
  function viewClients(m) {
    m.appendChild(h('h2', { text: 'Clients' }));
    var s = h('input', { type: 'search', placeholder: 'Rechercher nom, téléphone ou adresse' }), box = h('div');
    m.appendChild(h('div', { class: 'crm-bar' }, s)); m.appendChild(box);
    sb.from('customers').select('id,name,phone,address,notes,created_at,requests(kind,status,created_at)').order('created_at', { ascending: false }).limit(1000).then(function (r) {
      if (r.error) return toast(r.error.message, true);
      function draw() {
        var q = s.value.toLowerCase(); box.innerHTML = '';
        r.data.filter(function (c) { return !q || (c.name + ' ' + c.phone + ' ' + (c.address || '')).toLowerCase().indexOf(q) >= 0; }).forEach(function (c) {
          var n = { rdv: 0, devis: 0, message: 0 }; c.requests.forEach(function (x) { n[x.kind]++; });
          var ta = h('textarea', { rows: 2, placeholder: 'Notes privées (équipement, accès, préférences…)' }); ta.value = c.notes || '';
          box.appendChild(h('section', { class: 'card' }, h('b', { text: c.name }), ' · ', telA(c.phone), c.address ? h('p', { class: 'sm', text: '📍 ' + c.address }) : null,
            h('p', { class: 'mut', text: n.rdv + ' rdv · ' + n.devis + ' devis · ' + n.message + ' message(s) · client depuis ' + dt(c.created_at) }),
            ta, h('button', { class: 'btn btn-line btn-sm', type: 'button', text: 'Enregistrer la note', style: 'margin-top:.4rem', onclick: function () {
              sb.from('customers').update({ notes: ta.value.trim() || null }).eq('id', c.id).select('id').single().then(function (r2) { toast(r2.error ? r2.error.message : 'Note enregistrée', !!r2.error); });
            } })));
        });
        if (!box.childNodes.length) box.appendChild(h('p', { class: 'mut', text: 'Aucun client.' }));
      }
      s.oninput = draw; draw();
    });
  }

  /* ---------- stats ---------- */
  function viewStats(m) {
    m.appendChild(h('h2', { text: 'Statistiques (30 derniers jours)' }));
    var since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    sb.from('requests_daily').select('*').gte('day', since).order('day', { ascending: false }).then(function (r) {
      if (r.error) return toast(r.error.message, true);
      var t = { total: 0, rdv: 0, devis: 0, messages: 0, done: 0, cancelled: 0 };
      r.data.forEach(function (d) { Object.keys(t).forEach(function (k) { t[k] += Number(d[k]) || 0; }); });
      m.appendChild(h('div', { class: 'kpis' }, [['Demandes', t.total], ['Rendez-vous', t.rdv], ['Devis', t.devis], ['Messages', t.messages], ['Terminées', t.done], ['Annulées', t.cancelled]].map(function (k) { return h('div', { class: 'kpi' }, h('b', { text: String(k[1]) }), k[0]); })));
      m.appendChild(h('table', { style: 'margin-top:1rem' }, h('tr', null, ['Jour', 'Total', 'Rdv', 'Devis', 'Messages', 'Terminées'].map(function (x) { return h('th', { text: x }); })),
        r.data.map(function (d) { return h('tr', null, [d.day, d.total, d.rdv, d.devis, d.messages, d.done].map(function (x) { return h('td', { text: String(x) }); })); })));
    });
  }

  /* ---------- contenu ---------- */
  function loadContent() { return sb.from('site_content').select('data').eq('id', 1).single().then(function (r) { if (r.error) throw r.error; CONTENT = r.data.data; return CONTENT; }); }
  function save() {
    var err = null; (CONTENT.services || []).forEach(function (s) { s.title = String(s.title || '').trim(); if (!s.title) err = 'Un service n’a pas de titre.'; });
    if (err) return toast(err, true);
    sb.from('site_content').update({ data: CONTENT }).eq('id', 1).select('data').single().then(function (r) {
      if (r.error) return toast('Échec : ' + r.error.message, true);
      CONTENT = r.data.data; DIRTY = false; toast('Enregistré — le site est à jour.');
    });
  }
  function saveBar() { return h('div', { class: 'savebar' }, h('button', { class: 'btn btn-line', type: 'button', text: 'Annuler', onclick: function () { DIRTY = false; go(TAB); } }), h('button', { class: 'btn btn-solid', type: 'button', id: 'save', text: 'Enregistrer', onclick: save })); }
  var ORIG = { hero: 'bathroom', chauffage: 'radiator', outils: 'wrench' };
  var ICONS = [['alert', '⚠️ Urgence'], ['drop', '💧 Goutte'], ['pipe', '🔧 Tuyau'], ['tank', '🛢️ Chauffe-eau'], ['bath', '🛁 Sanitaire'], ['search', '🔍 Recherche'], ['flame', '🔥 Chauffage']];

  function viewContent(m) {
    loadContent().then(function (d) {
      var B = d.business = d.business || {}, HE = d.hero = d.hero || {}, BK = d.booking = d.booking || {};
      d.services = d.services || []; d.photos = d.photos || {};
      m.appendChild(h('h2', { text: 'Contenu & photos' }));
      m.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Ouvert / fermé' }),
        field('Entreprise disponible (décochez pour afficher un message « indisponible » sur le site)', B, 'open', { type: 'checkbox' }),
        field('Message si indisponible', B, 'closed_text', { type: 'textarea' }),
        field('Prise de rendez-vous en ligne ouverte', BK, 'open', { type: 'checkbox' }),
        field('Texte au-dessus du formulaire de rendez-vous', BK, 'note', { type: 'textarea' })));
      m.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Entreprise' }),
        h('div', { class: 'grid2' }, field('Téléphone affiché', B, 'phone'), field('Téléphone international (lien d’appel)', B, 'phone_intl', { hint: 'ex. +33612591818' })),
        field('Adresse', B, 'address'), field('Horaires', B, 'hours', { type: 'textarea', hint: 'ex. Lundi–vendredi 8h–18h' })));
      m.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Haut de page' }),
        field('Petit titre', HE, 'kicker'), field('Titre', HE, 'title', { hint: '*texte* = en couleur' }), field('Sous-titre', HE, 'tagline', { type: 'textarea' }), field('Slogan', d, 'slogan')));
      var sv = h('section', { class: 'card' }, h('h3', { text: 'Services' })), list = h('div'); sv.appendChild(list);
      function drawSv() {
        list.innerHTML = '';
        d.services.forEach(function (s, i) {
          var ic = h('select', null, ICONS.map(function (x) { return h('option', { value: x[0], text: x[1] }); })); ic.value = s.icon || 'drop'; ic.style.width = 'auto';
          ic.onchange = function () { s.icon = ic.value; DIRTY = true; };
          list.appendChild(h('div', { class: 'item' }, h('div', { class: 'grid2' }, field('Titre', s, 'title'), h('label', { class: 'f' }, h('span', { text: 'Icône' }), ic)), field('Description', s, 'desc', { type: 'textarea' }),
            h('div', { class: 'row', style: 'gap:.4rem;margin-top:.4rem' },
              h('button', { class: 'btn btn-line btn-sm', type: 'button', text: '↑', disabled: i === 0, onclick: function () { d.services.splice(i - 1, 0, d.services.splice(i, 1)[0]); DIRTY = true; drawSv(); } }),
              h('button', { class: 'btn btn-danger btn-sm', type: 'button', text: 'Supprimer', onclick: function () { d.services.splice(i, 1); DIRTY = true; drawSv(); } }))));
        });
        list.appendChild(h('button', { class: 'btn btn-line btn-sm', type: 'button', text: '+ Ajouter un service', onclick: function () { d.services.push({ icon: 'drop', title: '', desc: '' }); DIRTY = true; drawSv(); } }));
      }
      drawSv(); m.appendChild(sv);
      var ph = h('section', { class: 'card' }, h('h3', { text: 'Photos' }), h('p', { class: 'mut', text: 'JPG, PNG ou WebP, 6 Mo max. Remplace la photo sur le site après « Enregistrer ».' }));
      Object.keys(d.photos).forEach(function (k) {
        var p = d.photos[k], orig = '../assets/img/' + (ORIG[k] || k) + '-800.webp', img = h('img', { class: 'thumb', alt: '', src: p.src || orig });
        var f = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' }); f.style.width = 'auto';
        f.onchange = function () {
          var file = f.files[0]; if (!file) return; if (file.size > 6291456) return toast('Image trop lourde (6 Mo max).', true);
          var ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type]; if (!ext) return toast('Format non accepté.', true);
          var name = 'up-dupre_' + k + '-' + Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, 'x') + '-' + Date.now() + '.' + ext;
          sb.storage.from(BUCKET).upload(name, file, { contentType: file.type, cacheControl: '31536000', upsert: false }).then(function (r) {
            if (r.error) return toast(r.error.message, true);
            p.src = sb.storage.from(BUCKET).getPublicUrl(name).data.publicUrl; img.src = p.src; DIRTY = true; toast('Photo envoyée — cliquez sur Enregistrer.');
          });
        };
        ph.appendChild(h('div', { class: 'item row' }, img, h('div', null, h('b', { text: p.label || k }), h('div', null, f), field('Texte alternatif', p, 'alt'),
          p.src ? h('button', { class: 'btn btn-line btn-sm', type: 'button', text: 'Revenir à la photo d’origine', onclick: function () { p.src = ''; DIRTY = true; img.src = orig; } }) : null)));
      });
      m.appendChild(ph); m.appendChild(saveBar());
    }).catch(function (e) { toast(e.message, true); });
  }

  function viewHistory(m) {
    m.appendChild(h('h2', { text: 'Historique' })); m.appendChild(h('p', { class: 'mut', text: 'Les 40 dernières versions du contenu. Restaurer remplace le contenu actuel (qui est lui-même archivé).' }));
    sb.from('site_content_history').select('id,saved_at').order('id', { ascending: false }).limit(40).then(function (r) {
      if (r.error) return toast(r.error.message, true);
      if (!r.data.length) m.appendChild(h('p', { class: 'mut', text: 'Aucune version précédente.' }));
      r.data.forEach(function (v) {
        m.appendChild(h('div', { class: 'card row', style: 'justify-content:space-between' }, h('span', { text: 'Version du ' + dt(v.saved_at) }),
          h('button', { class: 'btn btn-line btn-sm', type: 'button', text: 'Restaurer', onclick: function () {
            if (!confirm('Restaurer cette version ?')) return;
            sb.from('site_content_history').select('data').eq('id', v.id).single().then(function (r1) {
              if (r1.error) return toast(r1.error.message, true);
              sb.from('site_content').update({ data: r1.data.data }).eq('id', 1).select('id').single().then(function (r2) { if (r2.error) return toast(r2.error.message, true); toast('Version restaurée.'); go('historique'); });
            });
          } })));
      });
    });
  }

  /* ---------- démarrage ---------- */
  if (!sb) { $('#boot').textContent = 'Configuration Supabase manquante (config.js).'; return; }
  var current;
  sb.auth.onAuthStateChange(function (ev, session) {
    var uid = session && session.user && session.user.id;
    if (uid === current) return; current = uid;
    if (!session) return showLogin();
    setTimeout(function () {
      checkOwner(session).then(function (ok) {
        if (!ok) { sb.auth.signOut(); return showLogin('Ce compte n’est pas autorisé (réservé au patron).'); }
        shell(session);
      });
    }, 0);
  });
  window.addEventListener('beforeunload', function (e) { if (DIRTY) { e.preventDefault(); e.returnValue = ''; } });
})();
