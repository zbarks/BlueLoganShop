/* =============================================================
   Blue Logan portal. Every page sets <body data-page="...">.
   All data comes from /api/admin/*, which checks the login cookie.
   Designed by Barker Digital
   ============================================================= */
(function () {
  'use strict';
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function date(s) { return s ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; }
  function toast(msg) { var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600); }

  var refreshing = null;
  function api(action, body, retried) {
    var url = '/api/admin/' + action;
    var opts = { credentials: 'same-origin', headers: {} };
    if (body !== undefined) { opts.method = 'POST'; opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(url, opts).then(function (r) {
      if (r.status === 401 && !retried && action !== 'login') {
        refreshing = refreshing || fetch('/api/admin/refresh', { method: 'POST', credentials: 'same-origin' }).finally(function () { setTimeout(function () { refreshing = null; }, 0); });
        return refreshing.then(function (rr) {
          if (rr.ok) return api(action, body, true);
          location.href = '/portal/login?next=' + encodeURIComponent(location.pathname + location.search);
          return new Promise(function () {});
        });
      }
      return r.json().catch(function () { return {}; }).then(function (d) { d._ok = r.ok; d._status = r.status; return d; });
    });
  }

  function chrome(active, counts) {
    var links = [['/portal', 'Home', 'home'], ['/portal/products', 'Pieces', 'products'],
      ['/portal/enquiries', 'Messages', 'enquiries'], ['/portal/settings', 'Settings', 'settings']];
    var h = document.createElement('header');
    h.className = 'p-header';
    h.innerHTML = '<div class="wrap"><a class="p-brand" href="/portal">Blue Logan Portal</a><nav class="p-nav" aria-label="Portal">' +
      links.map(function (l) {
        var badge = l[2] === 'enquiries' && counts && counts.unreadEnquiries ? '<span class="badge">(' + counts.unreadEnquiries + ')</span>' : '';
        return '<a href="' + l[0] + '"' + (active === l[2] ? ' aria-current="page"' : '') + '>' + l[1] + badge + '</a>';
      }).join('') + '<a href="/shop" target="_blank" rel="noopener">View shop</a><button type="button" id="logout">Log out</button></nav></div>';
    document.body.insertBefore(h, document.body.firstChild);
    $('#logout').addEventListener('click', function () { api('logout', {}).then(function () { location.href = '/portal/login'; }); });
  }

  // Upload photos straight to storage. Large photos are scaled down in
  // proportion so they upload quickly; nothing is cropped or stretched.
  function shrink(file) {
    return new Promise(function (resolve) {
      if (file.size < 3.5 * 1024 * 1024 || !window.createImageBitmap) return resolve(file);
      createImageBitmap(file).then(function (bmp) {
        var max = 2600, scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
        if (scale === 1 && file.size < 8 * 1024 * 1024) return resolve(file);
        var c = document.createElement('canvas');
        c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        c.toBlob(function (b) { resolve(b ? new File([b], 'photo.jpg', { type: 'image/jpeg' }) : file); }, 'image/jpeg', 0.9);
      }).catch(function () { resolve(file); });
    });
  }
  function uploadOne(f) {
    return shrink(f).then(function (file) {
      return api('upload-url', { content_type: file.type }).then(function (u) {
        if (!u._ok) throw new Error(u.error || 'Upload failed');
        return fetch(u.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type, 'x-upsert': 'false' }, body: file }).then(function (r) {
          if (!r.ok) throw new Error('Upload failed (' + r.status + ')');
          return u.publicUrl;
        });
      });
    });
  }

  function errorsInto(form, errors) {
    $$('.field-error', form).forEach(function (e) { e.remove(); });
    Object.keys(errors || {}).forEach(function (k) {
      var anchor = form.querySelector('[data-err="' + k + '"]') || (form.elements[k] && form.elements[k].closest ? form.elements[k].closest('.field') : null);
      if (!anchor) return;
      var d = document.createElement('div'); d.className = 'field-error'; d.textContent = errors[k];
      anchor.appendChild(d);
    });
    var first = $('.field-error', form);
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ================= LOGIN =================
  function initLogin() {
    var next = new URLSearchParams(location.search).get('next') || '/portal';
    if (!/^\/portal(\/|$)/.test(next)) next = '/portal';
    api('status').then(function (s) {
      if (!s.configured) { $('#login-note').innerHTML = '<div class="notice warn">The portal is not connected yet. Zach needs to add the Supabase keys and ADMIN_EMAIL.</div>'; }
    });
    // Already have a refresh cookie? Go straight in.
    fetch('/api/admin/refresh', { method: 'POST', credentials: 'same-origin' }).then(function (r) { if (r.ok) location.href = next; });
    $('#login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('#login-btn'); btn.disabled = true;
      api('login', { email: $('#email').value, password: $('#password').value }).then(function (d) {
        btn.disabled = false;
        if (d._ok) location.href = next;
        else $('#login-note').innerHTML = '<div class="notice bad">' + esc(d.error || 'Could not log in.') + '</div>';
      });
    });
  }

  // ================= HOME =================
  function initHome(c) {
    $('#home').innerHTML =
      '<h1>Hello Blue</h1>' +
      '<div class="big-buttons">' +
      '<a class="big-btn" href="/portal/enquiries"><div class="n">' + c.unreadEnquiries + '</div><strong>New messages</strong><span>Enquiries and the contact form</span></a>' +
      '<a class="big-btn" href="/portal/products/new"><div class="n">+</div><strong>Add a piece</strong><span>Photos, name and description</span></a>' +
      '<a class="big-btn" href="/portal/settings"><div class="n">&#9675;</div><strong>Main picture</strong><span>The picture at the top of the shop</span></a>' +
      '</div>' +
      '<section class="howto"><h2>How to</h2><ol>' +
      '<li><b>Add a piece.</b> Go to Pieces, press "Add a piece", give it a name and description, add up to 8 photos, tick "Show in the shop" and press Save.</li>' +
      '<li><b>Put it on the main picture.</b> On the piece, click the spot on the main picture where it sits. People can then click that spot in the shop to open the piece.</li>' +
      '<li><b>Messages.</b> Every enquiry is emailed to you and kept under Messages. Press Reply to answer by email.</li>' +
      '<li><b>Sold.</b> Tick "Sold" on a piece and the shop shows it as sold.</li>' +
      '<li><b>Hide a piece.</b> In Pieces, press "Hide". It leaves the shop straight away. Press "Show" to bring it back.</li>' +
      '<li><b>Shop name, intro and main picture.</b> Change them under Settings.</li>' +
      '</ol></section>';
  }

  // ================= PIECES LIST =================
  function initProducts() {
    var root = $('#products');
    function load() {
      api('products').then(function (d) {
        var list = d.products || [];
        root.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><h1>Pieces</h1>' +
          '<a class="pbtn go" href="/portal/products/new">Add a piece</a></div>' +
          '<p class="hint">The order here is the order in the shop. Use the arrows to move a piece up or down.</p>' +
          (list.length ? '<ul class="rows">' + list.map(function (p, i) {
            return '<li data-id="' + esc(p.id) + '"><img src="' + esc(p.images[0] || '/images/placeholders/image-1.svg') + '" alt="">' +
              '<div class="grow"><a class="title" href="/portal/products/' + esc(p.id) + '">' + esc(p.title) + '</a>' +
              '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"><span class="pill ' + (p.is_published ? 'live">In the shop' : '">Hidden') + '</span>' +
              (p.stock === 0 ? '<span class="pill">Sold</span>' : '') + (p.hotspot ? '' : '<span class="pill">Not on main picture</span>') + '</div></div>' +
              '<div class="actions">' +
              '<button class="pbtn small" data-move="-1" ' + (i === 0 ? 'disabled' : '') + ' aria-label="Move up">&uarr;</button>' +
              '<button class="pbtn small" data-move="1" ' + (i === list.length - 1 ? 'disabled' : '') + ' aria-label="Move down">&darr;</button>' +
              '<a class="pbtn small" href="/portal/products/' + esc(p.id) + '">Edit</a>' +
              '<button class="pbtn small" data-pub="' + (p.is_published ? '0' : '1') + '">' + (p.is_published ? 'Hide' : 'Show') + '</button>' +
              '</div></li>';
          }).join('') + '</ul>' : '<div class="panel">No pieces yet. Press "Add a piece" to start.</div>');

        $$('[data-move]', root).forEach(function (b) {
          b.addEventListener('click', function () {
            var ids = $$('li[data-id]', root).map(function (x) { return x.getAttribute('data-id'); });
            var i = ids.indexOf(b.closest('li').getAttribute('data-id')), j = i + Number(b.getAttribute('data-move'));
            var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
            api('product-reorder', { ids: ids }).then(load);
          });
        });
        $$('[data-pub]', root).forEach(function (b) {
          b.addEventListener('click', function () {
            api('product-publish', { id: b.closest('li').getAttribute('data-id'), is_published: b.getAttribute('data-pub') === '1' }).then(function (r) {
              if (!r._ok) alert(r.error); else { toast(b.getAttribute('data-pub') === '1' ? 'Now in the shop' : 'Hidden from the shop'); load(); }
            });
          });
        });
      });
    }
    load();
  }

  // ================= PIECE EDIT =================
  function initProductEdit() {
    var id = location.pathname.split('/').pop();
    var isNew = id === 'new';
    var root = $('#edit');
    var images = [], hotspot = null, hero = '', others = [];

    function render(p) {
      p = p || { images: [], is_published: false };
      images = (p.images || []).slice();
      hotspot = p.hotspot || null;
      root.innerHTML =
        '<a class="crumb" href="/portal/products">&larr; All pieces</a><h1>' + (isNew ? 'Add a piece' : 'Edit piece') + '</h1>' +
        '<form id="pform" novalidate>' +
        '<div class="panel"><div class="field"><label for="title">Name</label><input id="title" name="title" type="text" value="' + esc(p.title) + '" maxlength="120"></div>' +
        '<div class="field"><label for="description">Description</label><textarea id="description" name="description" maxlength="5000">' + esc(p.description) + '</textarea></div>' +
        '<label class="switch"><input type="checkbox" id="sold"' + (p.stock === 0 ? ' checked' : '') + '> Sold</label></div>' +

        '<div class="panel"><h2>Photos</h2><p class="hint">Up to 8. The first one shows in the shop. Photos go up as they are; very large files are only made smaller.</p>' +
        '<div class="photos" id="photos" data-err="images"></div>' +
        '<label class="pbtn" for="files">Add photos</label><input id="files" type="file" accept="image/jpeg,image/png,image/webp" multiple class="visually-hidden">' +
        '<div id="upload-status" class="status" aria-live="polite"></div></div>' +

        '<div class="panel"><h2>Place on the main picture</h2><p class="hint">Click where this piece sits. In the shop, that spot opens this piece. Grey dots are other pieces.</p>' +
        '<div class="placer" id="placer"><img id="placer-img" src="' + esc(hero || '/images/placeholders/hero.svg') + '" alt="Main picture"></div>' +
        '<p style="margin-top:12px"><button type="button" class="pbtn small" id="clear-spot">Remove from main picture</button></p></div>' +

        '<div class="panel"><div class="field" style="margin:0"><label for="slug">Web address</label><p class="hint">Made from the name if left blank: /shop/your-words-here</p><input id="slug" name="slug" type="text" value="' + esc(p.slug) + '"></div></div>' +

        '<div class="sticky-save"><label class="switch"><input type="checkbox" id="pub"' + (p.is_published ? ' checked' : '') + '> Show in the shop</label>' +
        '<button class="pbtn go" type="submit" id="save">Save</button>' + (p.slug ? '<a class="pbtn" target="_blank" rel="noopener" href="/shop/' + esc(p.slug) + '">View in shop</a>' : '') +
        '<span id="save-status" aria-live="polite"></span></div></form>';

      drawPhotos(); drawSpots();
      $('#placer').addEventListener('click', function (e) {
        var r = $('#placer-img').getBoundingClientRect();
        hotspot = { x: Math.round((e.clientX - r.left) / r.width * 1000) / 10, y: Math.round((e.clientY - r.top) / r.height * 1000) / 10 };
        drawSpots();
      });
      $('#clear-spot').addEventListener('click', function () { hotspot = null; drawSpots(); });
      $('#files').addEventListener('change', function (e) { upload(Array.prototype.slice.call(e.target.files)); e.target.value = ''; });
      $('#pform').addEventListener('submit', save);
    }

    function drawSpots() {
      var box = $('#placer');
      $$('.spot', box).forEach(function (s) { s.remove(); });
      others.forEach(function (o) { box.insertAdjacentHTML('beforeend', '<span class="spot other" style="left:' + o.x + '%;top:' + o.y + '%"></span>'); });
      if (hotspot) box.insertAdjacentHTML('beforeend', '<span class="spot" style="left:' + hotspot.x + '%;top:' + hotspot.y + '%"></span>');
    }

    function drawPhotos() {
      $('#photos').innerHTML = images.map(function (src, i) {
        return '<div class="photo">' + (i === 0 ? '<span class="first">Main</span>' : '') + '<img src="' + esc(src) + '" alt="Photo ' + (i + 1) + '">' +
          '<div class="row"><button type="button" data-l="' + i + '" aria-label="Move left"' + (i === 0 ? ' disabled' : '') + '>&larr;</button>' +
          '<button type="button" data-x="' + i + '">Remove</button>' +
          '<button type="button" data-r="' + i + '" aria-label="Move right"' + (i === images.length - 1 ? ' disabled' : '') + '>&rarr;</button></div></div>';
      }).join('') || '<p class="hint">No photos yet.</p>';
      $$('[data-x]', $('#photos')).forEach(function (b) { b.addEventListener('click', function () { images.splice(+b.getAttribute('data-x'), 1); drawPhotos(); }); });
      $$('[data-l]', $('#photos')).forEach(function (b) { b.addEventListener('click', function () { var i = +b.getAttribute('data-l'); images.splice(i - 1, 0, images.splice(i, 1)[0]); drawPhotos(); }); });
      $$('[data-r]', $('#photos')).forEach(function (b) { b.addEventListener('click', function () { var i = +b.getAttribute('data-r'); images.splice(i + 1, 0, images.splice(i, 1)[0]); drawPhotos(); }); });
    }

    function upload(files) {
      var room = 8 - images.length;
      if (room <= 0) { $('#upload-status').textContent = 'That is the maximum of 8 photos.'; return; }
      files = files.slice(0, room);
      var done = 0;
      $('#upload-status').textContent = 'Uploading...';
      files.reduce(function (chain, f) {
        return chain.then(function () { return uploadOne(f).then(function (url) { images.push(url); done++; drawPhotos(); }); });
      }, Promise.resolve()).then(function () {
        $('#upload-status').textContent = done + ' photo' + (done === 1 ? '' : 's') + ' added. Remember to press Save.';
      }).catch(function (e) { $('#upload-status').textContent = e.message + '. Please try again.'; });
    }

    function save(e) {
      e.preventDefault();
      var f = e.target;
      var body = {
        id: isNew ? undefined : id, title: f.title.value, description: f.description.value, slug: f.slug.value,
        images: images, hotspot: hotspot, sold: $('#sold').checked, is_published: $('#pub').checked,
      };
      $('#save').disabled = true; $('#save-status').textContent = 'Saving...';
      api('product-save', body).then(function (d) {
        $('#save').disabled = false;
        errorsInto(f, d.errors);
        if (!d._ok) { $('#save-status').textContent = d.error; return; }
        toast('Saved');
        if (isNew) { history.replaceState(null, '', '/portal/products/' + d.product.id); isNew = false; id = d.product.id; }
        render(d.product);
        $('#save-status').textContent = 'Saved.';
      });
    }

    Promise.all([api('settings'), api('products')]).then(function (r) {
      hero = (r[0].settings && r[0].settings.hero_image) || '';
      var all = r[1].products || [];
      others = all.filter(function (x) { return x.id !== id && x.hotspot; }).map(function (x) { return x.hotspot; });
      if (isNew) return render();
      var p = all.filter(function (x) { return x.id === id; })[0];
      if (!p) { root.innerHTML = '<div class="panel">Piece not found. <a href="/portal/products">Back to pieces</a></div>'; return; }
      render(p);
    });
  }

  // ================= ENQUIRIES =================
  function initEnquiries() {
    var root = $('#enquiries');
    function load() {
      api('enquiries').then(function (d) {
        var list = d.enquiries || [];
        root.innerHTML = '<h1>Messages</h1>' + (list.length ? '<ul class="rows">' + list.map(function (e) {
          return '<li style="align-items:flex-start" data-id="' + e.id + '"><div class="grow">' +
            (e.is_read ? '' : '<span class="pill new">New</span> ') +
            '<b>' + esc(e.name) + '</b> <a href="mailto:' + esc(e.email) + '?subject=' + encodeURIComponent(e.product_title ? 'Your enquiry about ' + e.product_title : 'Your message') + '">' + esc(e.email) + '</a>' +
            '<div class="sub">' + date(e.created_at) + ' &middot; ' + (e.product_title ? 'About ' + esc(e.product_title) : 'Contact form') + '</div>' +
            '<p style="white-space:pre-wrap;margin:8px 0 0">' + esc(e.message) + '</p></div>' +
            '<div class="actions"><a class="pbtn small go" href="mailto:' + esc(e.email) + '">Reply</a>' +
            '<button class="pbtn small" data-read="' + (e.is_read ? '0' : '1') + '">' + (e.is_read ? 'Mark as new' : 'Mark as read') + '</button></div></li>';
        }).join('') + '</ul>' : '<div class="panel">No messages yet.</div>');
        $$('[data-read]', root).forEach(function (b) {
          b.addEventListener('click', function () {
            api('enquiry-read', { id: b.closest('li').getAttribute('data-id'), is_read: b.getAttribute('data-read') === '1' }).then(load);
          });
        });
      });
    }
    load();
  }

  // ================= SETTINGS =================
  function initSettings() {
    var root = $('#settings');
    api('settings').then(function (d) {
      var s = d.settings || {}, hero = s.hero_image || '';
      root.innerHTML = '<h1>Settings</h1><form id="sform" novalidate>' +
        '<div class="panel"><h2>Main picture</h2><p class="hint">The picture at the top of the shop. Place each piece on it from that piece\'s page.</p>' +
        '<div class="placer" style="cursor:default"><img id="hero-preview" src="' + esc(hero || '/images/placeholders/hero.svg') + '" alt="Main picture"></div>' +
        '<p style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap"><label class="pbtn" for="hero-file">Upload a new main picture</label>' +
        '<input id="hero-file" type="file" accept="image/jpeg,image/png,image/webp" class="visually-hidden"></p><div id="hero-status" class="status" aria-live="polite"></div></div>' +
        '<div class="panel"><h2>Words</h2>' +
        '<div class="field"><label for="shop_title">Shop name (top right of every page)</label><input id="shop_title" type="text" maxlength="80" value="' + esc(s.shop_title) + '"></div>' +
        '<div class="field" style="margin-bottom:0"><label for="intro_text">Intro (under the main picture, leave blank for none)</label><textarea id="intro_text" maxlength="600" style="min-height:90px">' + esc(s.intro_text) + '</textarea></div></div>' +
        '<div class="sticky-save"><button class="pbtn go" type="submit">Save settings</button><span id="s-status" aria-live="polite"></span></div></form>' +
        '<div class="panel" style="margin-top:30px"><h2>For Zach</h2><p class="hint">Stripe webhook address, only needed if sales are ever switched on. It must be exactly this, with no redirect.</p><code>' + esc(d.webhookUrl) + '</code></div>';

      $('#hero-file').addEventListener('change', function (e) {
        var f = e.target.files[0]; if (!f) return;
        $('#hero-status').textContent = 'Uploading...';
        uploadOne(f).then(function (url) { hero = url; $('#hero-preview').src = url; $('#hero-status').textContent = 'Uploaded. Press Save settings to use it.'; })
          .catch(function (err) { $('#hero-status').textContent = err.message + '. Please try again.'; });
      });
      $('#sform').addEventListener('submit', function (e) {
        e.preventDefault();
        api('settings-save', { shop_title: $('#shop_title').value, intro_text: $('#intro_text').value, hero_image: hero }).then(function (r) {
          $('#s-status').textContent = r._ok ? 'Saved.' : r.error;
          if (r._ok) toast('Settings saved');
        });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var page = document.body.getAttribute('data-page');
    if (page === 'login') return initLogin();
    api('home').then(function (c) {
      if (!c._ok) { document.body.innerHTML = '<div class="wrap p-main"><div class="notice bad">' + esc(c.error || 'The portal could not load.') + '</div></div>'; return; }
      chrome(page, c);
      ({ home: function () { initHome(c); }, products: initProducts, 'product-edit': initProductEdit, enquiries: initEnquiries, settings: initSettings }[page] || function () {})();
    });
  });
})();
