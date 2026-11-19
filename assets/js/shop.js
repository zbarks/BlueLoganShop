/* =============================================================
   Blue's Shop: browser code. Each page sets <body data-page>.
   Enquiry only: no prices, no basket.
   Designed by Barker Digital
   ============================================================= */
(function () {
  'use strict';

  var PLACEHOLDER = '/images/placeholders/image-1.svg';
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function api(path, body) {
    var opts = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { d._ok = r.ok; d._status = r.status; return d; });
    });
  }

  // ---------- one line, always: shrink to fit ----------
  function fitText() {
    $$('[data-fit]').forEach(function (el) {
      el.style.fontSize = '';
      el.classList.remove('fit-wrap');
      var min = parseFloat(el.getAttribute('data-fit')) || 14;
      var size = parseFloat(getComputedStyle(el).fontSize);
      var box = el.parentElement.clientWidth;
      if (!box || el.scrollWidth <= box) return;
      size = Math.max(min, Math.floor(size * box / el.scrollWidth));
      el.style.fontSize = size + 'px';
      var guard = 30;
      while (el.scrollWidth > box && size > min && guard--) { size -= 1; el.style.fontSize = size + 'px'; }
      if (el.scrollWidth > box && el.hasAttribute('data-fit-wrap')) { el.style.fontSize = ''; el.classList.add('fit-wrap'); }
    });
  }

  // ---------- shared shop data (one request per page) ----------
  var shopData = null;
  function loadShop() {
    if (!shopData) shopData = api('/api/shop/products').then(function (d) { if (d._ok) applyText(d); return d; });
    return shopData;
  }
  function applyText(d) {
    if (d.shop_title) $$('[data-shop-title]').forEach(function (el) { el.textContent = d.shop_title; });
    $$('[data-intro]').forEach(function (el) { el.textContent = d.intro_text || ''; el.hidden = !d.intro_text; });
    if (d.shop_open === false && !$('.closed-banner')) {
      var b = document.createElement('div'); b.className = 'closed-banner';
      b.textContent = 'The shop is closed for orders at the moment. Do have a look around.';
      $('.site-header').insertAdjacentElement('afterend', b);
    }
    fitText();
  }

  function card(p) {
    return '<a class="card" href="/shop/' + esc(p.slug) + '">' +
      (p.sold_out ? '<span class="badge">Sold</span>' : '') +
      '<div class="card-img"><img src="' + esc(p.images[0] || PLACEHOLDER) + '" alt="' + esc(p.title) + '" loading="lazy"></div>' +
      '<div class="card-title">' + esc(p.title) + '</div>' + (p.category ? '<div class="card-price">' + esc(p.category.name) + '</div>' : '') + '</a>';
  }

  // ---------- config, link to Blue's site, analytics ----------
  function applyConfig(c) {
    if (c.mainSiteUrl) $$('[data-main-site]').forEach(function (a) { a.href = c.mainSiteUrl.replace(/\/$/, '') + (a.getAttribute('data-main-site') || ''); });
    if (c.demo && !$('.demo-banner')) {
      var b = document.createElement('div'); b.className = 'demo-banner';
      b.textContent = 'Preview: the shopfront drawing is a placeholder and the forms are switched off.';
      document.body.insertBefore(b, document.body.firstChild);
    }
    var ph = c.posthog;
    if (!ph || !ph.key || window.posthog) return;
    /* eslint-disable */
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register identify reset get_distinct_id opt_in_capturing opt_out_capturing".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    /* eslint-enable */
    window.posthog.init(ph.key, { api_host: ph.host, person_profiles: 'identified_only', opt_out_capturing_by_default: true, disable_session_recording: true });
    var choice = null;
    try { choice = localStorage.getItem('bl:consent'); } catch (e) {}
    if (choice === 'yes') window.posthog.opt_in_capturing();
    if (choice) return;
    var bar = document.createElement('div'); bar.className = 'consent';
    bar.innerHTML = '<p>We would like to use analytics cookies to see how the shop is used. Nothing is tracked unless you accept.</p>' +
      '<button class="btn" data-c="yes">Accept</button><button class="btn light" data-c="no">No thanks</button>';
    bar.addEventListener('click', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-c'); if (!v) return;
      try { localStorage.setItem('bl:consent', v); } catch (err) {}
      if (v === 'yes') window.posthog.opt_in_capturing(); else window.posthog.opt_out_capturing();
      bar.remove();
    });
    document.body.appendChild(bar);
  }
  function track(ev, props) { try { if (window.posthog && window.posthog.capture) window.posthog.capture(ev, props || {}); } catch (e) {} }

  // =============== HOME: the shopfront ===============
  // Blue's drawing of the shop, with one blank spot (the window) where the
  // products he ticks "In the shop window" take turns. Nothing else on the
  // drawing is clickable; the menu and the links below do the navigating.
  function initHome() {
    Promise.all([loadShop(), fetch('/assets/shopfront/zones.json').then(function (r) { return r.json(); })]).then(function (r) {
      var d = r[0], z = r[1];
      if (!d._ok) return;
      var products = d.products || [], cats = d.categories || [];
      var featured = products.filter(function (p) { return p.featured && p.images.length; });
      var stage = $('#shopfront');

      function build() {
        var mobile = window.matchMedia('(max-width: 699px)').matches;
        var spec = mobile ? z.mobile : z.desktop;
        var art = mobile ? (d.hero_image_mobile || d.hero_image) : d.hero_image;
        stage.className = 'shopfront' + (mobile ? ' is-mobile' : '') + (art ? ' has-art' : ' placeholder');
        stage.style.aspectRatio = spec.canvas.width + ' / ' + spec.canvas.height;
        var w = spec.window;
        stage.innerHTML = (art ? '<img class="art" src="' + esc(art) + '" alt="' + esc(d.shop_title || "Blue's shop") + '">'
          : '<span class="placeholder-note">Blue\'s shopfront drawing goes here</span>') +
          '<a class="window-spot" href="' + (featured.length ? '/shop/' + esc(featured[0].slug) : '/shop') + '" style="left:' + w.x + '%;top:' + w.y + '%;width:' + w.w + '%;height:' + w.h + '%"' +
          ' aria-label="' + esc(featured.length ? featured[0].title : 'Shop all') + '">' +
          featured.map(function (p, i) {
            return '<img src="' + esc(p.images[0]) + '" alt="" data-slug="' + esc(p.slug) + '" data-title="' + esc(p.title) + '"' + (i === 0 ? ' class="on"' : '') + '>';
          }).join('') + (art ? '' : '<span class="spot-note">The blank spot: products from the shop window</span>') + '</a>';
      }
      build();
      var mq = window.matchMedia('(max-width: 699px)');
      if (mq.addEventListener) mq.addEventListener('change', build);

      if (featured.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        var n = 0;
        setInterval(function () {
          var imgs = $$('.window-spot img'); if (!imgs.length) return;
          imgs.forEach(function (im) { im.classList.remove('on'); });
          n = (n + 1) % imgs.length; imgs[n].classList.add('on');
          var a = $('.window-spot'); a.href = '/shop/' + imgs[n].getAttribute('data-slug'); a.setAttribute('aria-label', imgs[n].getAttribute('data-title'));
        }, 4200);
      }

      $('#cats').innerHTML = cats.map(function (c) {
        var first = products.filter(function (p) { return p.category && p.category.slug === c.slug && p.images.length; })[0];
        return '<a class="cat" href="/category/' + esc(c.slug) + '"><div class="cat-img">' +
          (first ? '<img src="' + esc(first.images[0]) + '" alt="" loading="lazy">' : '<span class="cat-soon">Coming soon</span>') +
          '</div><div class="cat-name-box"><span class="cat-name" data-fit="12">' + esc(c.name) + '</span></div></a>';
      }).join('');
      fitText();
      var win = featured.length ? featured : products.slice(0, 4);
      $('#window-grid').innerHTML = win.slice(0, 8).map(card).join('') || '<p class="empty"><span class="hand">New things arriving soon.</span></p>';
    });
  }

  // =============== SHOP ALL / CATEGORY / SEARCH ===============
  function initShop() {
    var path = location.pathname;
    var catSlug = (path.match(/^\/category\/([^/]+)/) || [])[1];
    var params = new URLSearchParams(location.search);
    var q = $('#q'), sort = $('#sort');
    q.value = params.get('q') || '';
    sort.value = params.get('sort') || '';
    if (path === '/search') { q.focus(); $('#list-title').textContent = 'Search'; }

    loadShop().then(function (d) {
      if (!d._ok) { $('#grid').innerHTML = '<p class="empty">The shop could not load. Please refresh the page.</p>'; return; }
      var cats = d.categories || [];
      var cat = catSlug ? cats.filter(function (c) { return c.slug === catSlug; })[0] : null;
      if (catSlug && !cat) { $('#list-title').textContent = 'Nothing here'; $('#grid').innerHTML = '<p class="empty">That category has moved. <a href="/shop"><u>See everything</u></a>.</p>'; fitText(); return; }
      if (cat) {
        $('#list-title').textContent = cat.name; $('#list-sub').textContent = cat.description || '';
        document.title = cat.name + " | " + (d.shop_title || "Blue's Shop");
      }
      $('#tabs').innerHTML = '<a href="/shop"' + (!cat && path !== '/search' ? ' aria-current="page"' : '') + '>Everything</a>' +
        cats.map(function (c) { return '<a href="/category/' + esc(c.slug) + '"' + (cat && cat.slug === c.slug ? ' aria-current="page"' : '') + '>' + esc(c.name) + '</a>'; }).join('');
      fitText();

      function render() {
        var term = q.value.trim().toLowerCase();
        var list = (d.products || []).filter(function (p) {
          if (cat && !(p.category && p.category.slug === cat.slug)) return false;
          if (!term) return true;
          return (p.title + ' ' + p.description + ' ' + (p.category ? p.category.name : '')).toLowerCase().indexOf(term) > -1;
        });
        if (sort.value === 'az') list.sort(function (a, b) { return a.title.localeCompare(b.title); });
        if (sort.value === 'new') list.reverse();
        $('#grid').innerHTML = list.length ? list.map(card).join('')
          : term ? '<p class="empty"><span class="hand">Nothing matches "' + esc(q.value.trim()) + '"</span>Try another word, or <a href="/shop"><u>see everything</u></a>.</p>'
          : '<p class="empty"><span class="hand">New things arriving soon.</span>Have a look at the rest of the shop in the meantime.</p>';
        var u = new URL(location.href);
        if (term) u.searchParams.set('q', q.value.trim()); else u.searchParams.delete('q');
        if (sort.value) u.searchParams.set('sort', sort.value); else u.searchParams.delete('sort');
        history.replaceState(null, '', u);
      }
      var t; q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { render(); track('search', { q: q.value }); }, 180); });
      sort.addEventListener('change', render);
      render();
    });
  }

  // =============== PRODUCT ===============
  function initProduct() {
    var root = $('#product');
    var slug = decodeURIComponent(location.pathname.replace(/^\/shop\//, '').replace(/\/$/, ''));
    Promise.all([api('/api/shop/product?slug=' + encodeURIComponent(slug)), loadShop()]).then(function (r) {
      var d = r[0], all = r[1];
      if (!d._ok || !d.product) {
        document.title = "Nothing here | Blue's Shop";
        root.innerHTML = '<div class="page-head"><h1 class="page-title" data-fit="24">Nothing here</h1><p class="page-sub">That piece is not in the shop. It may have sold.</p><p style="margin-top:20px"><a class="btn" href="/shop">Shop all</a></p></div>';
        fitText(); return;
      }
      var p = d.product;
      document.title = p.title + ' | ' + (d.shop_title || "Blue's Shop");
      track('product_viewed', { slug: p.slug });
      var images = p.images.length ? p.images : [PLACEHOLDER];
      root.innerHTML =
        '<div class="crumbs"><a href="/shop">Shop all</a>' + (p.category ? ' / <a href="/category/' + esc(p.category.slug) + '">' + esc(p.category.name) + '</a>' : '') + '</div>' +
        '<div class="product"><div><div class="gallery-main"><img id="main-img" src="' + esc(images[0]) + '" alt="' + esc(p.title) + '"></div>' +
        (images.length > 1 ? '<div class="thumbs">' + images.map(function (src, i) {
          return '<button type="button" data-src="' + esc(src) + '" aria-label="Image ' + (i + 1) + '"' + (i === 0 ? ' aria-current="true"' : '') + '><img src="' + esc(src) + '" alt="" loading="lazy"></button>';
        }).join('') + '</div>' : '') + '</div>' +
        '<div class="info">' + (p.category ? '<a class="cat-link" href="/category/' + esc(p.category.slug) + '">' + esc(p.category.name) + '</a>' : '') +
        '<h1 data-fit="20" data-fit-wrap>' + esc(p.title) + '</h1>' +
        (p.sold_out ? '<p class="sold-note">Sold</p>' : '') +
        '<p class="desc">' + esc(p.description) + '</p>' +
        '<form id="enquire" class="form" novalidate><h2>' + (p.sold_out ? 'Ask about something similar' : 'Enquire') + '</h2>' +
        '<div class="field"><label for="e-name">Name</label><input id="e-name" name="name" type="text" autocomplete="name" required></div>' +
        '<div class="field"><label for="e-email">Email</label><input id="e-email" name="email" type="email" autocomplete="email" required></div>' +
        '<div class="field"><label for="e-msg">Message</label><textarea id="e-msg" name="message" required></textarea></div>' +
        '<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
        '<button class="btn" type="submit">Send enquiry</button><div id="e-status" class="status" aria-live="polite"></div></form>' +
        '</div></div>';
      fitText();
      $$('.thumbs button').forEach(function (b) {
        b.addEventListener('click', function () {
          $('#main-img').src = b.getAttribute('data-src');
          $$('.thumbs button').forEach(function (x) { x.removeAttribute('aria-current'); });
          b.setAttribute('aria-current', 'true');
        });
      });
      wireForm($('#enquire'), '/api/shop/enquiry', { product_id: p.id }, $('#e-status'), 'Thank you. Your enquiry has been sent and Blue will reply by email.');

      // More from the same category
      var more = (all.products || []).filter(function (x) { return x.slug !== p.slug && p.category && x.category && x.category.slug === p.category.slug; }).slice(0, 4);
      if (more.length) {
        $('#more').hidden = false;
        $('#more-grid').innerHTML = more.map(card).join('');
        $('#more-link').href = '/category/' + p.category.slug;
      }
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
          var input = form.elements[k]; if (!input) return;
          var m = document.createElement('div'); m.className = 'field-error'; m.textContent = d.errors[k];
          input.insertAdjacentElement('afterend', m);
        });
        if (d._ok) { form.reset(); statusEl.textContent = okText; track('enquiry_sent', { form: url }); }
        else { statusEl.textContent = d.error || 'Something went wrong. Please try again.'; statusEl.className = 'status bad'; }
      }).catch(function () { btn.disabled = false; statusEl.textContent = 'Your message could not be sent. Please check your connection.'; statusEl.className = 'status bad'; });
    });
  }

  function initContact() { wireForm($('#contact-form'), '/api/shop/contact', {}, $('#c-status'), 'Thank you. Your message has been sent and Blue will reply by email.'); }

  document.addEventListener('DOMContentLoaded', function () {
    fitText();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitText);
    var t; window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(fitText, 80); });
    api('/api/shop/config').then(function (c) { if (c._ok) applyConfig(c); });
    var page = document.body.getAttribute('data-page');
    var init = { home: initHome, shop: initShop, product: initProduct, contact: initContact }[page];
    loadShop();
    if (init) init();
  });
})();
