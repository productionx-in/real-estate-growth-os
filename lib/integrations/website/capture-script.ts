// lib/integrations/website/capture-script.ts
// The website capture script served at /capture.js. A developer adds one tag to their site:
//
//   <script src="https://<app>/capture.js" data-re-key="<website connection id>" async></script>
//
// and then, on every page:
//   • remembers where the visitor came from — UTM tags, ad click IDs (gclid, fbclid…), landing page and
//     outside referrer — for the first visit and the latest campaign visit (90 days, this site only);
//   • when one of the site's own forms is submitted, reads the name, phone, email, message, budget and
//     unit type from it and sends them, with the visit details, to RE (/api/capture).
//
// It never stops, delays or changes the site's own form handling; it never reads a form that has a password,
// card, OTP or ID-number field; and it sends nothing but the fields listed above. Options (on the tag):
//   data-re-forms="marked"  only forms marked data-re-form (default: every form with a phone or email)
//   data-re-project="<id>"  the project these enquiries belong to (a form can override it)
// On a form or field: data-re-ignore (skip), data-re-field="name|phone|email|notes|budget|unit"
// (say what a field is), data-re-honeypot (a hidden field that only bots fill in).
// In page code: REbyPX.capture({ name, phone, email, notes }), REbyPX.attribution(), REbyPX.optOut().
// data-regrow-* attributes and window.REGrow still work for sites installed before the rename.
//
// Plain ES5 + the DOM, no dependencies, so it runs on old phones and any site builder.

export const CAPTURE_SCRIPT = String.raw`/*! RE website capture */
(function (w, d) {
  'use strict';
  if (w.REbyPX && w.REbyPX.__capture) return;
  function A(el, n) { return el.getAttribute('data-re-' + n) || el.getAttribute('data-regrow-' + n); }
  function H(el, n) { return el.hasAttribute('data-re-' + n) || el.hasAttribute('data-regrow-' + n); }
  var script = d.currentScript;
  if (!script) { var all = d.querySelectorAll('script[data-re-key],script[data-regrow-key]'); script = all[all.length - 1]; }
  if (!script) return;
  var KEY = A(script, 'key');
  if (!KEY) return;
  var ENDPOINT;
  try { ENDPOINT = new URL(script.src, w.location.href).origin + '/api/capture'; } catch (e) { return; }
  var ONLY_MARKED = A(script, 'forms') === 'marked';
  var PROJECT = A(script, 'project') || null;
  var STORE = 'regrow_attr_v1', OPTOUT = 'regrow_optout' /* stored names kept so visitors keep their choices */, TTL = 90 * 864e5;
  var UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  var CLICK = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'li_fat_id', 'ttclid'];
  var LOADED = Date.now();

  function get(k) { try { return w.localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { w.localStorage.setItem(k, v); } catch (e) {} }
  function drop(k) { try { w.localStorage.removeItem(k); } catch (e) {} }
  function optedOut() { return get(OPTOUT) === '1'; }
  function clip(v, n) {
    v = v == null ? '' : String(v);
    v = v.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    return v.length > n ? v.slice(0, n) : v;
  }
  function keys(o) { var k = [], p; for (p in o) if (Object.prototype.hasOwnProperty.call(o, p)) k.push(p); return k; }
  function pageUrl() { return clip(String(w.location.href).split('#')[0], 1000); }

  function params() {
    var out = {}, q = String(w.location.search || '').replace(/^\?/, '').split('&'), i, kv, k;
    var wanted = UTM.concat(CLICK);
    for (i = 0; i < q.length; i++) {
      if (!q[i]) continue;
      kv = q[i].split('=');
      try { k = decodeURIComponent(kv[0]).toLowerCase(); } catch (e) { continue; }
      if (wanted.indexOf(k) < 0 || out[k]) continue;
      try { out[k] = clip(decodeURIComponent((kv[1] || '').replace(/\+/g, ' ')), 200); } catch (e) {}
      if (!out[k]) delete out[k];
    }
    return out;
  }
  function outsideReferrer() {
    var r = d.referrer;
    if (!r) return '';
    try { return new URL(r).hostname === w.location.hostname ? '' : clip(r, 1000); } catch (e) { return ''; }
  }
  function load() {
    try { var a = JSON.parse(get(STORE) || 'null'); if (a && a.exp > Date.now()) return a; } catch (e) {}
    return null;
  }
  // First visit, and the latest visit that came from a campaign or another website.
  function track() {
    if (optedOut()) return;
    var a = load() || {}, p = params(), ref = outsideReferrer(), fromCampaign = keys(p).length > 0 || !!ref;
    if (!a.first || fromCampaign) {
      p.landing = pageUrl();
      if (ref) p.referrer = ref;
      p.at = new Date().toISOString();
      if (!a.first) a.first = p;
      if (fromCampaign) a.last = p;
    }
    a.pages = (a.pages || 0) + 1;
    a.exp = Date.now() + TTL;
    put(STORE, JSON.stringify(a));
  }

  var SKIP_TYPE = /^(hidden|password|submit|button|reset|image|file|checkbox|radio|range|color|search)$/;
  function hint(el) {
    var h = [el.name, el.id, el.getAttribute('autocomplete'), el.getAttribute('placeholder'), el.getAttribute('aria-label')];
    if (el.labels && el.labels.length) h.push(el.labels[0].textContent);
    return h.join(' ').toLowerCase();
  }
  function classify(el) {
    var tag = String(el.tagName || '').toUpperCase(), type = String(el.type || '').toLowerCase();
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return null;
    if (type === 'password') return 'sensitive';
    var h = hint(el);
    if (/cc-|card|cvv|cvc|expiry|otp|one-time|passcode|aadha+r|\bpan\b|\bssn\b|account.?n(o|umber)|ifsc/.test(h)) return 'sensitive';
    if (H(el, 'honeypot')) return 'honeypot';
    var explicit = A(el, 'field');
    if (explicit) return /^(name|phone|email|notes|budget|unit)$/.test(explicit) ? explicit : null;
    if (SKIP_TYPE.test(type)) return null;
    if (type === 'email' || /e-?mail/.test(h)) return 'email';
    if (type === 'tel' || /\btel\b|phone|mobile|whats ?app|contact.?(no|num)|\bph\b/.test(h)) return 'phone';
    if (/budget|price.?range/.test(h)) return 'budget';
    if (/bhk|configuration|unit.?type|property.?type|flat.?type/.test(h)) return 'unit';
    if (tag === 'TEXTAREA' || /message|comment|query|enquiry|inquiry|requirement|remark|\bnotes?\b/.test(h)) return 'notes';
    if (/first.?name|given.?name|fname/.test(h)) return 'first';
    if (/last.?name|family.?name|surname|lname/.test(h)) return 'last';
    if (/user.?name|login|company|organi[sz]ation|project|city|location|subject|coupon|promo|captcha/.test(h)) return null;
    if (/name/.test(h)) return 'name';
    return null;
  }
  function valueOf(el) {
    if (String(el.tagName).toUpperCase() === 'SELECT') {
      var o = el.options && el.options[el.selectedIndex];
      return o && o.value ? o.text : '';
    }
    return el.value;
  }
  // The enquiry in a form, or null if it has none (or must not be read).
  function collect(form) {
    var out = {}, els = form.elements || [], i, el, k, v, hp = false;
    for (i = 0; i < els.length; i++) {
      el = els[i];
      if (el.disabled || (el.closest && el.closest('[data-re-ignore],[data-regrow-ignore]'))) continue;
      k = classify(el);
      if (k === 'sensitive') return null;
      if (k === 'honeypot') { if (clip(el.value, 10)) hp = true; continue; }
      if (!k) continue;
      v = clip(valueOf(el), k === 'notes' ? 1000 : 200);
      if (!v) continue;
      if (k === 'notes' && out.notes) out.notes = clip(out.notes + ' | ' + v, 1000);
      else if (!out[k]) out[k] = v;
    }
    if (!out.name && (out.first || out.last)) out.name = clip((out.first || '') + ' ' + (out.last || ''), 120);
    delete out.first; delete out.last;
    if (!out.phone && !out.email) return null;
    if (hp) out.hp = '1';
    return out;
  }

  function token() {
    if (w.crypto && w.crypto.randomUUID) return w.crypto.randomUUID();
    var b = new Array(16), i, h = [];
    for (i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    for (i = 0; i < 16; i++) h.push((b[i] + 256).toString(16).slice(1));
    h = h.join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  var recent = {};
  function send(data, ctx) {
    var sig = [data.name, data.phone, data.email].join('|'), now = Date.now();
    if (recent[sig] && now - recent[sig] < 10000) return false; // double-click or a site that submits twice
    recent[sig] = now;
    var a = load() || {};
    var body = JSON.stringify({
      key: KEY, token: token(),
      name: data.name || '', phone: data.phone || '', email: data.email || '',
      notes: data.notes || '', budget: data.budget || '', unit: data.unit || '', hp: data.hp || '',
      formId: ctx.formId || null, projectId: ctx.projectId || null,
      pageUrl: pageUrl(), pageTitle: clip(d.title, 200),
      first: a.first || null, last: a.last || a.first || null, pages: a.pages || 1,
      fillMs: now - (ctx.started || LOADED)
    });
    try {
      if (w.navigator.sendBeacon && w.navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return true;
    } catch (e) {}
    try {
      w.fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain' } });
      return true;
    } catch (e) { return false; }
  }

  var started = typeof WeakMap === 'function' ? new WeakMap() : null;
  d.addEventListener('focusin', function (e) {
    var f = e.target && e.target.form;
    if (f && started && !started.has(f)) started.set(f, Date.now());
  }, true);

  // Capture phase: runs before the site's own handlers, so it works even when they cancel the submit.
  d.addEventListener('submit', function (e) {
    try {
      var form = e.target;
      if (!form || String(form.tagName).toUpperCase() !== 'FORM' || optedOut()) return;
      if (form.closest && form.closest('[data-re-ignore],[data-regrow-ignore]')) return;
      if (ONLY_MARKED && !H(form, 'form')) return;
      var data = collect(form);
      if (!data) return;
      send(data, {
        formId: A(form, 'form') || form.getAttribute('id') || form.getAttribute('name'),
        projectId: A(form, 'project') || PROJECT,
        started: started && started.get(form)
      });
    } catch (err) { /* never break the site */ }
  }, true);

  w.REbyPX = w.REGrow = {
    __capture: true,
    /** For forms that do not submit (e.g. built with JavaScript): REbyPX.capture({ name, phone, email, notes }). */
    capture: function (data, opts) {
      if (!data || optedOut()) return false;
      var c = {
        name: clip(data.name, 120), phone: clip(data.phone, 40), email: clip(data.email, 200),
        notes: clip(data.notes || data.message, 1000), budget: clip(data.budget, 100), unit: clip(data.unit, 100)
      };
      if (!c.phone && !c.email) return false;
      return send(c, { formId: (opts && opts.formId) || 'script', projectId: (opts && opts.projectId) || PROJECT, started: opts && opts.startedAt });
    },
    attribution: function () { return load(); },
    optOut: function () { put(OPTOUT, '1'); drop(STORE); },
    optIn: function () { drop(OPTOUT); track(); }
  };

  track();
})(window, document);
`
