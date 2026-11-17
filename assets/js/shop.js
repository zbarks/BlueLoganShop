/* =============================================================
   Blue Logan shop: browser code. Each page sets <body data-page>.
   Enquiry only: no prices, no basket.
   Designed by Barker Digital
   ============================================================= */
(function () {
  'use strict';

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var PLACEHOLDER = '/images/placeholders/image-1.svg';
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function api(path, body) {
    var opts = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { d._ok = r.ok; return d; });
    });
  }

  // Keeps the shop name and titles on one line by scaling them down to fit.
  function fitText() {
    $$('[data-fit]').forEach(function (el) {
      el.style.fontSize = '';
      el.classList.remove('fit-wrap');
      var min = parseFloat(el.getAttribute('data-fit')) || 12;
      var size = parseFloat(getComputedStyle(el).fontSize);
      var box = el.parentElement.clientWidth;
      if (!box || el.scrollWidth <= box) return;
      size = Math.max(min, Math.floor(size * box / el.scrollWidth));
      el.style.fontSize = size + 'px';
      var guard = 30;
      while (el.scrollWidth > box && size > min && guard--) { size -= 1; el.style.fontSize = size + 'px'; }
      // Only for very long piece names: wrap rather than run off the screen.
      if (el.scrollWidth > box && el.hasAttribute('data-fit-wrap')) { el.style.fontSize = ''; el.classList.add('fit-wrap'); }
    });
  }

  // Shop name and intro come from the portal (Settings), so Blue can change them.
  function applyText(d) {
    if (d.shop_title) $$('[data-shop-title]').forEach(function (el) { el.textContent = d.shop_title; });
    var intro = $('#intro');
    if (intro && d.intro_text) intro.textContent = d.intro_text;
    fitText();
  }

  // ---------- config, link to Blue's site, analytics ----------
  function applyConfig(c) {
    if (c.mainSiteUrl) $$('[data-main-site]').forEach(function (a) { a.href = c.mainSiteUrl.replace(/\/$/, '') + (a.getAttribute('data-main-site') || ''); });
    if (c.demo && !$('.demo-banner')) {
      var b = document.createElement('div');
      b.className = 'demo-banner';
      b.textContent = 'Preview with placeholder images. Forms are not switched on yet.';
      document.body.insertBefore(b, document.body.firstChild);
    }
    var ph = c.posthog;
    if (!ph || !ph.key || window.posthog) return;
    // Same set-up as Hepple: nothing is captured until the visitor accepts.
    /* eslint-disable */
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register identify reset get_distinct_id opt_in_capturing opt_out_capturing".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    /* eslint-enable */
    window.posthog.init(ph.key, { api_host: ph.host, person_profiles: 'identified_only', opt_out_capturing_by_default: true, disable_session_recording: true });
    var choice = null;
    try { choice = localStorage.getItem('bl:consent'); } catch (e) {}
    if (choice === 'yes') window.posthog.opt_in_capturing();
    if (choice) return;
    var bar = document.createElement('div');
    bar.className = 'consent';
    bar.innerHTML = '<p>We would like to use analytics cookies to see how the shop is used. Nothing is tracked unless you accept.</p>' +
      '<button class="btn" data-c="yes">Accept</button><button class="btn light" data-c="no">No thanks</button>';
    bar.addEventListener('click', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-c');
      if (!v) return;
      try { localStorage.setItem('bl:consent', v); } catch (err) {}
      if (v === 'yes') window.posthog.opt_in_capturing(); else window.posthog.opt_out_capturing();
      bar.remove();
    });
    document.body.appendChild(bar);
  }
  function track(ev, props) { try { if (window.posthog && window.posthog.capture) window.posthog.capture(ev, props || {}); } catch (e) {} }

  // The picture fills the screen (object-fit: cover), so part of it can be
  // off the edges. Work out where each point really lands on screen.
  function placeSpots() {
    var img = $('#hero-img'), frame = $('#hero');
    if (!img || !img.naturalWidth) return;
    var W = frame.clientWidth, H = frame.clientHeight;
    var scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    var w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    var pos = getComputedStyle(img).objectPosition.split(' ').map(parseFloat);
    var offX = (W - w) * (pos[0] / 100), offY = (H - h) * ((pos[1] === undefined ? 50 : pos[1]) / 100);
    $$('.spot', frame).forEach(function (a) {
      var x = offX + w * a.getAttribute('data-x') / 100, y = offY + h * a.getAttribute('data-y') / 100;
      a.style.left = x + 'px'; a.style.top = y + 'px';
      a.hidden = x < 12 || y < 12 || x > W - 12 || y > H - 12;   // point cropped off this screen
      a.classList.toggle('flip', x > W * 0.7);
    });
  }

  // ---------- /shop ----------
  function initShop() {
    api('/api/shop/products').then(function (d) {
      if (!d._ok) { $('#grid').innerHTML = '<p class="empty">The shop could not load. Please refresh the page.</p>'; return; }
      applyText(d);
      var list = d.products || [];
      var img = $('#hero-img');
      img.src = d.hero_image || '/images/placeholders/hero.svg';
      img.alt = d.shop_title || '';

      // Points on the main picture. Each one opens that piece.
      $('#hero').insertAdjacentHTML('beforeend', list.filter(function (p) { return p.hotspot; }).map(function (p) {
        return '<a class="spot" href="/shop/' + esc(p.slug) + '" data-x="' + p.hotspot.x + '" data-y="' + p.hotspot.y + '" aria-label="' + esc(p.title) + '">' +
          '<span class="spot-label">' + esc(p.title) + '</span></a>';
      }).join(''));
      placeSpots();
      img.addEventListener('load', placeSpots);
      window.addEventListener('resize', placeSpots);

      $('#grid').innerHTML = list.length ? list.map(function (p) {
        return '<a class="card" href="/shop/' + esc(p.slug) + '"><div class="card-img"><img src="' + esc(p.images[0] || PLACEHOLDER) + '" alt="' + esc(p.title) + '" loading="lazy"></div>' +
          '<div class="card-meta"><span class="card-title">' + esc(p.title) + '</span>' + (p.sold ? '<span class="card-note">Sold</span>' : '') + '</div></a>';
      }).join('') : '<p class="empty">New work coming soon.</p>';
    });
  }

  // ---------- /shop/[slug] ----------
  function initProduct() {
    var root = $('#product');
    var slug = decodeURIComponent(location.pathname.replace(/^\/shop\//, '').replace(/\/$/, ''));
    api('/api/shop/product?slug=' + encodeURIComponent(slug)).then(function (d) {
      if (d.shop_title) applyText(d);
      if (!d._ok || !d.product) {
        document.title = 'Not found | Blue Logan';
        root.innerHTML = '<div class="page"><h1 class="page-title">This piece is not in the shop</h1><p><a class="btn light" href="/shop">See the shop</a></p></div>';
        return;
      }
      var p = d.product;
      document.title = p.title + ' | Blue Logan';
      track('piece_viewed', { slug: p.slug });
      var images = p.images.length ? p.images : [PLACEHOLDER];
      root.innerHTML =
        '<a class="back" href="/shop">&larr; Shop</a>' +
        '<div class="piece"><div class="piece-images">' + images.map(function (src, i) {
          return '<img src="' + esc(src) + '" alt="' + esc(p.title) + (i ? ', image ' + (i + 1) : '') + '"' + (i ? ' loading="lazy"' : '') + '>';
        }).join('') + '</div>' +
        '<div class="piece-info"><h1 class="piece-title" data-fit="16" data-fit-wrap>' + esc(p.title) + '</h1>' +
        '<p class="piece-desc">' + esc(p.description) + '</p>' +
        (p.sold ? '<p class="sold-note caps">Sold</p>' : '') +
        '<form id="enquire" class="form" novalidate><h2>Enquire</h2>' +
        '<div class="field"><label for="e-name">Name</label><input id="e-name" name="name" type="text" autocomplete="name" required></div>' +
        '<div class="field"><label for="e-email">Email</label><input id="e-email" name="email" type="email" autocomplete="email" required></div>' +
        '<div class="field"><label for="e-msg">Message</label><textarea id="e-msg" name="message" required></textarea></div>' +
        '<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
        '<button class="btn" type="submit">Send enquiry</button><div id="e-status" class="status" aria-live="polite"></div></form>' +
        '</div></div>';
      fitText();
      wireForm($('#enquire'), '/api/shop/enquiry', { product_id: p.id }, $('#e-status'), 'Thank you. Your enquiry has been sent.');
    });
  }

  function wireForm(form, url, extra, statusEl, okText) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type=submit]');
      var data = {};
      $$('input, textarea', form).forEach(function (i) { if (i.name) data[i.name] = i.value; });
      Object.keys(extra || {}).forEach(function (k) { data[k] = extra[k]; });
      btn.disabled = true; statusEl.textContent = ''; statusEl.className = 'status';
      api(url, data).then(function (d) {
        btn.disabled = false;
        $$('.field-error', form).forEach(function (x) { x.remove(); });
        Object.keys(d.errors || {}).forEach(function (k) {
          var input = form.elements[k];
          if (!input) return;
          var m = document.createElement('div'); m.className = 'field-error'; m.textContent = d.errors[k];
          input.insertAdjacentElement('afterend', m);
        });
        if (d._ok) { form.reset(); statusEl.textContent = okText; track('enquiry_sent', { form: url }); }
        else { statusEl.textContent = d.error || 'Something went wrong. Please try again.'; statusEl.className = 'status bad'; }
      }).catch(function () {
        btn.disabled = false; statusEl.textContent = 'Your message could not be sent. Please check your connection.'; statusEl.className = 'status bad';
      });
    });
  }

  function initContact() {
    wireForm($('#contact-form'), '/api/shop/contact', {}, $('#c-status'), 'Thank you. Your message has been sent.');
  }

  document.addEventListener('DOMContentLoaded', function () {
    fitText();
    var t; window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(fitText, 80); });
    api('/api/shop/config').then(function (c) { if (c._ok) applyConfig(c); });
    var page = document.body.getAttribute('data-page');
    if (page !== 'shop' && page !== 'product') api('/api/shop/products').then(function (d) { if (d._ok) applyText(d); });
    ({ shop: initShop, product: initProduct, contact: initContact }[page] || function () {})();
  });
})();
