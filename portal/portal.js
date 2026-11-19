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
  function money(p) { return p == null ? '' : '£' + (p / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function pounds(p) { return p == null ? '' : (p / 100).toFixed(2).replace(/\.00$/, ''); }
  function date(s) { return s ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; }
  function toast(msg) { var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600); }

  function api(action, body) {
    var opts = { credentials: 'same-origin', headers: {} };
    if (body !== undefined) { opts.method = 'POST'; opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch('/api/admin/' + action, opts).then(function (r) {
      if (r.status === 401 && action !== 'login') {
        location.href = '/portal/login?next=' + encodeURIComponent(location.pathname + location.search);
        return new Promise(function () {});
      }
      return r.json().catch(function () { return {}; }).then(function (d) { d._ok = r.ok; d._status = r.status; return d; });
    });
  }

  function chrome(active, counts) {
    var links = [['/portal', 'Home', 'home'], ['/portal/orders', 'Orders', 'orders'], ['/portal/products', 'Products', 'products'],
      ['/portal/categories', 'Categories', 'categories'], ['/portal/enquiries', 'Messages', 'enquiries'], ['/portal/settings', 'Settings', 'settings']];
    var h = document.createElement('header');
    h.className = 'p-header';
    h.innerHTML = '<div class="wrap"><a class="p-brand" href="/portal">Blue\'s Shop portal</a><nav class="p-nav" aria-label="Portal">' +
      links.map(function (l) {
        var badge = l[2] === 'enquiries' && counts && counts.unreadEnquiries ? '<span class="badge">(' + counts.unreadEnquiries + ')</span>'
          : l[2] === 'orders' && counts && counts.toShip ? '<span class="badge">(' + counts.toShip + ')</span>' : '';
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
      if (!s.configured) { $('#login-note').innerHTML = '<div class="notice warn">The portal is not set up yet. Zach needs to add the Supabase keys and the portal login in Vercel.</div>'; }
    });
    $('#login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('#login-btn'); btn.disabled = true;
      api('login', { username: $('#username').value, password: $('#password').value }).then(function (d) {
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
      '<a class="big-btn" href="/portal/orders?status=paid"><div class="n">' + c.toShip + '</div><strong>To send</strong><span>Paid orders waiting to go out</span></a>' +
      '<a class="big-btn" href="/portal/enquiries"><div class="n">' + c.unreadEnquiries + '</div><strong>New messages</strong><span>Questions and enquiries</span></a>' +
      '<a class="big-btn" href="/portal/products/new"><div class="n">+</div><strong>Add a product</strong><span>Photos, price and stock</span></a>' +
      '</div>' +
      '<section class="howto"><h2>How to</h2><ol>' +
      '<li><b>Add something to sell.</b> Products, then "Add a product". Give it a name, price, stock and a category, add up to 8 photos, tick "Show in the shop" and press Save.</li>' +
      '<li><b>The shop window.</b> Tick "In the shop window" on a product and it appears in the window of your shopfront picture and under "In the window" on the home page. Tick a few and the window changes on its own.</li>' +
      '<li><b>Talk first.</b> For a one-off you would rather discuss, choose "Enquire" instead of "Buy". People see a message form instead of a price.</li>' +
      '<li><b>When an order comes in.</b> You get an email. Open Orders, pack it, press "Mark as sent" and type the tracking number. The customer is emailed straight away.</li>' +
      '<li><b>Refunds.</b> Open the order and press "Refund". The full amount goes back to the card. This cannot be undone.</li>' +
      '<li><b>Categories.</b> Rename, add or reorder them under Categories. The shelves on your shopfront picture link to them.</li>' +
      '<li><b>Going away?</b> Settings, untick "The shop is open". People can still look but cannot buy.</li>' +
      '</ol></section>';
  }

  // ================= PRODUCTS LIST =================
  function initProducts() {
    var root = $('#products');
    function load() {
      Promise.all([api('products'), api('categories')]).then(function (r) {
        var list = r[0].products || [], cats = r[1].categories || [];
        var catName = function (id) { var c = cats.filter(function (x) { return x.id === id; })[0]; return c ? c.name : 'No category'; };
        root.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><h1>Products</h1>' +
          '<a class="pbtn go" href="/portal/products/new">Add a product</a></div>' +
          '<p class="hint">The order here is the order in the shop. Use the arrows to move things up or down.</p>' +
          (list.length ? '<ul class="rows">' + list.map(function (p, i) {
            var stock = p.mode === 'enquire' ? 'Enquire' : (p.variants.length ? p.variants.map(function (v) { return v.label + ': ' + (v.stock == null ? 'made to order' : v.stock); }).join(', ') : (p.stock == null ? 'Made to order' : p.stock + ' in stock'));
            return '<li data-id="' + esc(p.id) + '"><img src="' + esc(p.images[0] || '/images/placeholders/image-1.svg') + '" alt="">' +
              '<div class="grow"><a class="title" href="/portal/products/' + esc(p.id) + '">' + esc(p.title) + '</a>' +
              '<div class="sub">' + esc(catName(p.category_id)) + ' &middot; ' + (p.mode === 'buy' ? money(p.price_pence) : 'Enquire') + ' &middot; ' + esc(stock) + '</div>' +
              '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"><span class="pill ' + (p.is_published ? 'live">In the shop' : '">Hidden') + '</span>' +
              (p.is_featured ? '<span class="pill live">In the window</span>' : '') + (p.mode === 'buy' && p.stock === 0 ? '<span class="pill">Sold out</span>' : '') + '</div></div>' +
              '<div class="actions">' +
              '<button class="pbtn small" data-move="-1" ' + (i === 0 ? 'disabled' : '') + ' aria-label="Move up">&uarr;</button>' +
              '<button class="pbtn small" data-move="1" ' + (i === list.length - 1 ? 'disabled' : '') + ' aria-label="Move down">&darr;</button>' +
              '<a class="pbtn small" href="/portal/products/' + esc(p.id) + '">Edit</a>' +
              '<button class="pbtn small" data-pub="' + (p.is_published ? '0' : '1') + '">' + (p.is_published ? 'Hide' : 'Show') + '</button></div></li>';
          }).join('') + '</ul>' : '<div class="panel">No products yet. Press "Add a product" to start.</div>');
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

  // ================= PRODUCT EDIT =================
  function initProductEdit() {
    var id = location.pathname.split('/').pop();
    var isNew = id === 'new';
    var root = $('#edit');
    var images = [], cats = [];

    function render(p) {
      p = p || { mode: 'buy', images: [], variants: [], is_published: false };
      images = (p.images || []).slice();
      root.innerHTML =
        '<a class="crumb" href="/portal/products">&larr; All products</a><h1>' + (isNew ? 'Add a product' : 'Edit product') + '</h1>' +
        '<form id="pform" novalidate>' +
        '<div class="panel"><div class="field"><label for="title">Name</label><input id="title" name="title" type="text" value="' + esc(p.title) + '" maxlength="120"></div>' +
        '<div class="field"><label for="description">Description</label><textarea id="description" name="description" maxlength="5000">' + esc(p.description) + '</textarea></div>' +
        '<div class="field"><label for="category">Category</label><select id="category" name="category" class="pselect"><option value="">No category</option>' +
        cats.map(function (c) { return '<option value="' + esc(c.id) + '"' + (p.category_id === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></div></div>' +

        '<div class="panel"><h2>Price</h2><div class="field"><label>How do people get it?</label><div class="choice" data-err="mode">' +
        '<label><input type="radio" name="mode" value="buy"' + (p.mode !== 'enquire' ? ' checked' : '') + '><span>Buy (price and basket)</span></label>' +
        '<label><input type="radio" name="mode" value="enquire"' + (p.mode === 'enquire' ? ' checked' : '') + '><span>Enquire (message form, no price)</span></label></div></div>' +
        '<div class="form-grid" id="buy-fields"><div class="field"><label for="price">Price in &pound;</label><p class="hint">For example 25 or 24.50</p><input id="price" name="price" type="text" inputmode="decimal" value="' + esc(pounds(p.price_pence)) + '"></div>' +
        '<div class="field"><label for="stock">How many do you have?</label><p class="hint">Blank if you make them to order. 0 shows as sold.</p><input id="stock" name="stock" type="text" inputmode="numeric" value="' + esc(p.stock == null ? '' : p.stock) + '"></div></div></div>' +

        '<div class="panel"><h2>Photos</h2><p class="hint">Up to 8. The first one shows in the shop. Photos go up as they are; very large files are only made smaller.</p>' +
        '<div class="photos" id="photos" data-err="images"></div>' +
        '<label class="pbtn" for="files">Add photos</label><input id="files" type="file" accept="image/jpeg,image/png,image/webp" multiple class="visually-hidden">' +
        '<div id="upload-status" class="status" aria-live="polite"></div></div>' +

        '<div class="panel" id="variants-panel"><h2>Sizes or colours (optional)</h2><p class="hint">Only if it comes in different versions. Leave the price blank to use the main price.</p>' +
        '<div id="variants" data-err="variants"></div><button type="button" class="pbtn small" id="add-variant">Add an option</button></div>' +

        '<div class="panel"><div class="field" style="margin:0"><label for="slug">Web address</label><p class="hint">Made from the name if left blank: /shop/your-words-here</p><input id="slug" name="slug" type="text" value="' + esc(p.slug) + '"></div></div>' +

        '<div class="sticky-save"><label class="switch"><input type="checkbox" id="pub"' + (p.is_published ? ' checked' : '') + '> Show in the shop</label>' +
        '<label class="switch"><input type="checkbox" id="feat"' + (p.is_featured ? ' checked' : '') + '> In the shop window</label>' +
        '<button class="pbtn go" type="submit" id="save">Save</button>' + (p.slug ? '<a class="pbtn" target="_blank" rel="noopener" href="/shop/' + esc(p.slug) + '">View in shop</a>' : '') +
        '<span id="save-status" aria-live="polite"></span></div></form>';

      var vbox = $('#variants');
      function addVariant(v) {
        v = v || {};
        var row = document.createElement('div'); row.className = 'variant-row';
        row.innerHTML = '<input type="text" placeholder="For example Large" value="' + esc(v.label) + '" data-v="label" aria-label="Option name">' +
          '<input type="text" inputmode="decimal" placeholder="Price &pound;" value="' + esc(pounds(v.price_pence)) + '" data-v="price" aria-label="Option price">' +
          '<input type="text" inputmode="numeric" placeholder="Stock" value="' + esc(v.stock == null ? '' : v.stock) + '" data-v="stock" aria-label="Option stock">' +
          '<button type="button" class="pbtn small danger">Remove</button>';
        row.querySelector('button').addEventListener('click', function () { row.remove(); });
        vbox.appendChild(row);
      }
      (p.variants || []).forEach(addVariant);
      $('#add-variant').addEventListener('click', function () { addVariant(); });
      var syncMode = function () {
        var buy = ($('input[name=mode]:checked') || {}).value !== 'enquire';
        $('#buy-fields').hidden = !buy; $('#variants-panel').hidden = !buy;
      };
      $$('input[name=mode]').forEach(function (r) { r.addEventListener('change', syncMode); }); syncMode();
      drawPhotos();
      $('#files').addEventListener('change', function (e) { upload(Array.prototype.slice.call(e.target.files)); e.target.value = ''; });
      $('#pform').addEventListener('submit', save);
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
        category_id: $('#category').value || null, mode: ($('input[name=mode]:checked') || {}).value,
        price: f.price.value, stock: f.stock.value, images: images,
        is_published: $('#pub').checked, is_featured: $('#feat').checked,
        variants: $$('.variant-row').map(function (r) {
          return { label: r.querySelector('[data-v=label]').value, price: r.querySelector('[data-v=price]').value, stock: r.querySelector('[data-v=stock]').value };
        }),
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

    Promise.all([api('categories'), isNew ? Promise.resolve(null) : api('product?id=' + encodeURIComponent(id))]).then(function (r) {
      cats = r[0].categories || [];
      if (isNew) {
        var pre = new URLSearchParams(location.search).get('category');
        return render({ mode: 'buy', images: [], variants: [], is_published: false, category_id: pre || null });
      }
      if (!r[1]._ok) { root.innerHTML = '<div class="panel">' + esc(r[1].error) + ' <a href="/portal/products">Back to products</a></div>'; return; }
      render(r[1].product);
    });
  }

  // ================= CATEGORIES =================
  function initCategories() {
    var root = $('#categories');
    function load() {
      api('categories').then(function (d) {
        var list = d.categories || [];
        root.innerHTML = '<h1>Categories</h1><p class="hint">These are the shelves and windows of your shop. Rename them, add new ones, or change the order. The order here is the order on the site.</p>' +
          '<ul class="rows" style="margin-bottom:24px">' + list.map(function (c, i) {
            return '<li data-id="' + esc(c.id) + '"><div class="grow"><input class="cat-name-input" type="text" value="' + esc(c.name) + '" aria-label="Category name" maxlength="60">' +
              '<input class="cat-desc-input" type="text" value="' + esc(c.description) + '" placeholder="A short line about it (optional)" aria-label="Description" maxlength="300">' +
              '<div class="sub">' + c.count + ' product' + (c.count === 1 ? '' : 's') + ' &middot; /category/' + esc(c.slug) + '</div></div>' +
              '<div class="actions"><button class="pbtn small" data-move="-1" ' + (i === 0 ? 'disabled' : '') + ' aria-label="Move up">&uarr;</button>' +
              '<button class="pbtn small" data-move="1" ' + (i === list.length - 1 ? 'disabled' : '') + ' aria-label="Move down">&darr;</button>' +
              '<button class="pbtn small go" data-save>Save</button><button class="pbtn small danger" data-del>Delete</button></div></li>';
          }).join('') + '</ul>' +
          '<form id="new-cat" class="panel" novalidate><h2>Add a category</h2><div class="form-grid"><div class="field"><label for="nc-name">Name</label><input id="nc-name" type="text" maxlength="60"></div>' +
          '<div class="field"><label for="nc-desc">A short line about it (optional)</label><input id="nc-desc" type="text" maxlength="300"></div></div>' +
          '<button class="pbtn go" type="submit">Add</button> <span id="nc-status"></span></form>';
        $$('[data-save]', root).forEach(function (b) {
          b.addEventListener('click', function () {
            var li = b.closest('li');
            api('category-save', { id: li.getAttribute('data-id'), name: $('.cat-name-input', li).value, description: $('.cat-desc-input', li).value }).then(function (r) {
              if (!r._ok) alert(r.error); else { toast('Saved'); load(); }
            });
          });
        });
        $$('[data-del]', root).forEach(function (b) {
          b.addEventListener('click', function () {
            if (!confirm('Delete this category?')) return;
            api('category-delete', { id: b.closest('li').getAttribute('data-id') }).then(function (r) { if (!r._ok) alert(r.error); else load(); });
          });
        });
        $$('[data-move]', root).forEach(function (b) {
          b.addEventListener('click', function () {
            var ids = $$('li[data-id]', root).map(function (x) { return x.getAttribute('data-id'); });
            var i = ids.indexOf(b.closest('li').getAttribute('data-id')), j = i + Number(b.getAttribute('data-move'));
            var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
            api('category-reorder', { ids: ids }).then(load);
          });
        });
        $('#new-cat').addEventListener('submit', function (e) {
          e.preventDefault();
          api('category-save', { name: $('#nc-name').value, description: $('#nc-desc').value }).then(function (r) {
            if (!r._ok) { $('#nc-status').textContent = r.error; return; }
            toast('Category added'); load();
          });
        });
      });
    }
    load();
  }

  // ================= ORDERS =================
  var STATUS = { paid: 'To send', shipped: 'Sent', refunded: 'Refunded' };
  function initOrders() {
    var root = $('#orders');
    var status = new URLSearchParams(location.search).get('status') || '';
    function load() {
      api('orders' + (status ? '?status=' + status : '')).then(function (d) {
        var list = d.orders || [];
        root.innerHTML = '<h1>Orders</h1><div class="tabs-p">' + [['', 'All'], ['paid', 'To send'], ['shipped', 'Sent'], ['refunded', 'Refunded']].map(function (t) {
          return '<button class="pbtn small" data-s="' + t[0] + '" aria-pressed="' + (status === t[0]) + '">' + t[1] + '</button>';
        }).join('') + '</div>' +
          (list.length ? '<ul class="rows">' + list.map(function (o) {
            var n = o.items.reduce(function (a, i) { return a + i.qty; }, 0);
            return '<li><div class="grow"><a class="title" href="/portal/orders/' + o.id + '">Order ' + o.id + ', ' + esc(o.customer_name || o.customer_email || 'Customer') + '</a>' +
              '<div class="sub">' + date(o.created_at) + ' &middot; ' + n + ' item' + (n === 1 ? '' : 's') + ' &middot; ' + money(o.total_pence) + (o.shipping_address ? '' : ' &middot; <b style="color:var(--red)">No address</b>') + '</div></div>' +
              '<span class="pill ' + (o.status === 'paid' ? 'new' : o.status === 'shipped' ? 'live' : '') + '">' + STATUS[o.status] + '</span>' +
              '<a class="pbtn small" href="/portal/orders/' + o.id + '">Open</a></li>';
          }).join('') + '</ul>' : '<div class="panel">No orders here yet.</div>');
        $$('[data-s]', root).forEach(function (b) {
          b.addEventListener('click', function () { status = b.getAttribute('data-s'); history.replaceState(null, '', '/portal/orders' + (status ? '?status=' + status : '')); load(); });
        });
      });
    }
    load();
  }

  function addressLines(a) {
    if (!a) return '<div class="notice bad">No address on this order. Check the payment in Stripe before sending.</div>';
    return [a.name, a.line1, a.line2, a.city, a.state, a.postal_code, a.country].filter(Boolean).map(esc).join('<br>');
  }

  function initOrder() {
    var id = location.pathname.split('/').pop();
    var root = $('#order');
    function draw(o, note) {
      root.innerHTML = '<a class="crumb" href="/portal/orders">&larr; All orders</a><h1>Order ' + o.id + '</h1>' + (note || '') +
        '<div class="panel"><span class="pill ' + (o.status === 'paid' ? 'new' : o.status === 'shipped' ? 'live' : '') + '">' + STATUS[o.status] + '</span><p class="sub" style="margin:10px 0 0">Ordered ' + date(o.created_at) + '</p></div>' +
        '<div class="panel"><h2>Items</h2><ul class="rows">' + o.items.map(function (i) {
          return '<li><div class="grow"><b>' + i.qty + ' x ' + esc(i.title) + '</b>' + (i.variant_label ? '<div class="sub">' + esc(i.variant_label) + '</div>' : '') + '</div><b>' + money(i.line_pence) + '</b></li>';
        }).join('') + '</ul><dl class="kv" style="margin-top:14px">' +
        (o.discount_code ? '<dt>Discount</dt><dd>' + esc(o.discount_code) + ' (' + money(o.discount_pence) + ' off)</dd>' : '') +
        '<dt>Delivery</dt><dd>' + (o.shipping_pence ? money(o.shipping_pence) : 'Free') + '</dd><dt>Total paid</dt><dd><b>' + money(o.total_pence) + '</b></dd></dl></div>' +
        '<div class="panel"><h2>Send to</h2><p>' + addressLines(o.shipping_address) + '</p><dl class="kv"><dt>Email</dt><dd>' + esc(o.customer_email || '') + '</dd><dt>Phone</dt><dd>' + esc(o.customer_phone || '') + '</dd></dl></div>' +
        (o.status !== 'refunded' ? '<div class="panel"><h2>' + (o.status === 'shipped' ? 'Sent' : 'Mark as sent') + '</h2>' +
          (o.status === 'shipped' ? '<p>Sent ' + date(o.shipped_at) + '. Tracking: <b>' + esc(o.tracking_number) + '</b></p>' : '<p class="hint">Type the tracking number from the post office. The customer is emailed it straight away.</p>') +
          '<form id="ship" novalidate><div class="form-grid"><div class="field"><label for="tracking_number">Tracking number</label><input id="tracking_number" name="tracking_number" type="text" value="' + esc(o.tracking_number || '') + '"></div>' +
          '<div class="field"><label for="carrier">Sent with (optional)</label><input id="carrier" name="carrier" type="text" placeholder="Royal Mail" value="' + esc(o.tracking_carrier || '') + '"></div></div>' +
          '<button class="pbtn go" type="submit">' + (o.status === 'shipped' ? 'Update tracking' : 'Mark as sent') + '</button></form></div>' : '') +
        '<div class="panel"><h2>Refund</h2>' + (o.status === 'refunded' ? '<p>Refunded in full on ' + date(o.refunded_at) + '.</p>'
          : '<p class="hint">Gives the full amount back to the customer\'s card. This cannot be undone.</p><button class="pbtn danger" id="refund">Refund ' + money(o.total_pence) + '</button>') + '</div>';
      var ship = $('#ship');
      if (ship) ship.addEventListener('submit', function (e) {
        e.preventDefault();
        api('order-ship', { id: o.id, tracking_number: ship.tracking_number.value, carrier: ship.carrier.value }).then(function (d) {
          errorsInto(ship, d.errors);
          if (!d._ok) return alert(d.error);
          var msg = d.emailed ? 'Marked as sent. The customer has been emailed the tracking number.'
            : d.alreadyEmailed ? 'Tracking updated. The customer was already emailed earlier.'
            : 'Marked as sent. The tracking email could not be sent' + (d.emailError ? ' (' + d.emailError + ')' : ' because email is switched off') + '.';
          draw(d.order, '<div class="notice ' + (d.emailed || d.alreadyEmailed ? 'ok' : 'warn') + '">' + esc(msg) + '</div>');
        });
      });
      var rf = $('#refund');
      if (rf) rf.addEventListener('click', function () {
        if (!confirm('Refund ' + money(o.total_pence) + ' to ' + (o.customer_name || 'the customer') + '? This cannot be undone.')) return;
        rf.disabled = true; rf.textContent = 'Refunding...';
        api('order-refund', { id: o.id }).then(function (d) {
          if (!d._ok) { rf.disabled = false; rf.textContent = 'Refund'; return alert(d.error); }
          draw(d.order, '<div class="notice ok">Refunded. The money goes back to the card within 5 to 10 days.</div>');
        });
      });
    }
    api('order?id=' + encodeURIComponent(id)).then(function (d) {
      if (!d._ok) { root.innerHTML = '<div class="panel">' + esc(d.error) + ' <a href="/portal/orders">Back to orders</a></div>'; return; }
      draw(d.order);
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
      var s = d.settings || {}, hero = s.hero_image || '', heroM = s.hero_image_mobile || '';
      var pic = function (idv, src, label, hint) {
        return '<div class="field"><label>' + label + '</label><p class="hint">' + hint + '</p>' +
          '<div class="placer" style="cursor:default;max-width:520px">' + (src ? '<img id="' + idv + '-preview" src="' + esc(src) + '" alt="">' : '<img id="' + idv + '-preview" src="/images/placeholders/hero.svg" alt="">') + '</div>' +
          '<p style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap"><label class="pbtn small" for="' + idv + '-file">Upload</label><input id="' + idv + '-file" type="file" accept="image/jpeg,image/png,image/webp" class="visually-hidden">' +
          '<button type="button" class="pbtn small" data-clear="' + idv + '">Use the wireframe</button></p><div id="' + idv + '-status" class="status"></div></div>';
      };
      root.innerHTML = '<h1>Settings</h1><form id="sform" novalidate>' +
        '<div class="panel"><h2>Shop</h2><label class="switch" style="margin-bottom:10px"><input type="checkbox" id="shop_open"' + (s.shop_open !== false ? ' checked' : '') + '> The shop is open for orders</label>' +
        '<p class="hint">Untick when you are away. People can still look but cannot buy.</p>' +
        '<div class="field"><label for="shop_title">Shop name</label><input id="shop_title" type="text" maxlength="80" value="' + esc(s.shop_title) + '"></div>' +
        '<div class="field" style="margin-bottom:0"><label for="intro_text">Welcome line (under the shopfront)</label><textarea id="intro_text" maxlength="600" style="min-height:80px">' + esc(s.intro_text) + '</textarea></div></div>' +
        '<div class="panel"><h2>Shopfront illustration</h2>' +
        pic('hero', hero, 'For computers (landscape, 2400 x 1350)', 'Your drawing of the shop. The door, window and shelves line up with the framework (see the guide).') +
        pic('herom', heroM, 'For phones (portrait, 1080 x 1440)', 'Optional. If blank, phones show the wireframe until you add one.') + '</div>' +
        '<div class="panel"><h2>Delivery</h2><div class="field"><label for="delivery_note">Delivery note</label><textarea id="delivery_note" maxlength="500" style="min-height:70px">' + esc(s.delivery_note) + '</textarea></div>' +
        '<div class="form-grid"><div class="field"><label for="delivery_fee">Delivery charge in &pound;</label><input id="delivery_fee" type="text" inputmode="decimal" value="' + esc(pounds(s.delivery_fee_pence)) + '"></div>' +
        '<div class="field"><label for="free_over">Free delivery on orders over &pound;</label><p class="hint">Blank for no free delivery.</p><input id="free_over" type="text" inputmode="decimal" value="' + esc(s.free_delivery_over_pence ? pounds(s.free_delivery_over_pence) : '') + '"></div></div></div>' +
        '<div class="sticky-save"><button class="pbtn go" type="submit">Save settings</button><span id="s-status" aria-live="polite"></span></div></form>' +
        '<div class="panel" style="margin-top:30px"><h2>Discount codes</h2>' + ((d.discounts || []).length ? '<ul class="rows" style="margin-bottom:16px">' + d.discounts.map(function (x) {
          return '<li><div class="grow"><b>' + esc(x.code) + '</b><div class="sub">' + x.percent_off + '% off</div></div><span class="pill ' + (x.active ? 'live">On' : '">Off') + '</span>' +
            '<button class="pbtn small" data-code="' + esc(x.code) + '" data-pct="' + x.percent_off + '" data-active="' + (x.active ? '0' : '1') + '">' + (x.active ? 'Switch off' : 'Switch on') + '</button></li>';
        }).join('') + '</ul>' : '') +
        '<form id="dform" class="form-grid" novalidate><div class="field"><label for="dcode">New code</label><input id="dcode" type="text" placeholder="SPRING10" style="text-transform:uppercase"></div>' +
        '<div class="field"><label for="dpct">Percent off</label><input id="dpct" type="number" min="1" max="100" placeholder="10"></div>' +
        '<div class="full"><button class="pbtn go" type="submit">Add code</button> <span id="d-status"></span></div></form></div>' +
        '<div class="panel"><h2>For Zach</h2><p class="hint">Stripe webhook address. It must be exactly this, with no redirect.</p><code>' + esc(d.webhookUrl) + '</code></div>';

      [['hero', function (u) { hero = u; }], ['herom', function (u) { heroM = u; }]].forEach(function (pair) {
        var k = pair[0], set = pair[1];
        $('#' + k + '-file').addEventListener('change', function (e) {
          var f = e.target.files[0]; if (!f) return;
          $('#' + k + '-status').textContent = 'Uploading...';
          uploadOne(f).then(function (url) { set(url); $('#' + k + '-preview').src = url; $('#' + k + '-status').textContent = 'Uploaded. Press Save settings to use it.'; })
            .catch(function (err) { $('#' + k + '-status').textContent = err.message + '. Please try again.'; });
        });
        $('[data-clear="' + k + '"]').addEventListener('click', function () { set(''); $('#' + k + '-preview').src = '/images/placeholders/hero.svg'; $('#' + k + '-status').textContent = 'Press Save settings to go back to the wireframe.'; });
      });
      $('#sform').addEventListener('submit', function (e) {
        e.preventDefault();
        api('settings-save', { shop_open: $('#shop_open').checked, shop_title: $('#shop_title').value, intro_text: $('#intro_text').value, hero_image: hero, hero_image_mobile: heroM,
          delivery_note: $('#delivery_note').value, delivery_fee: $('#delivery_fee').value, free_delivery_over: $('#free_over').value }).then(function (r) {
          $('#s-status').textContent = r._ok ? 'Saved.' : r.error; if (r._ok) toast('Settings saved');
        });
      });
      $('#dform').addEventListener('submit', function (e) {
        e.preventDefault();
        api('discount-save', { code: $('#dcode').value, percent_off: parseInt($('#dpct').value, 10), active: true }).then(function (r) {
          if (!r._ok) { $('#d-status').textContent = r.error; return; } toast('Code added'); initSettings();
        });
      });
      $$('[data-code]', root).forEach(function (b) {
        b.addEventListener('click', function () { api('discount-save', { code: b.getAttribute('data-code'), percent_off: +b.getAttribute('data-pct'), active: b.getAttribute('data-active') === '1' }).then(initSettings); });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var page = document.body.getAttribute('data-page');
    if (page === 'login') return initLogin();
    api('home').then(function (c) {
      if (!c._ok) { document.body.innerHTML = '<div class="wrap p-main"><div class="notice bad">' + esc(c.error || 'The portal could not load.') + '</div></div>'; return; }
      chrome(page, c);
      ({ home: function () { initHome(c); }, products: initProducts, 'product-edit': initProductEdit, categories: initCategories, orders: initOrders, order: initOrder, enquiries: initEnquiries, settings: initSettings }[page] || function () {})();
    });
  });
})();
