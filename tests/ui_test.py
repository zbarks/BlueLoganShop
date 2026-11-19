"""Browser test of the whole customer and portal journey (Playwright, phone size).
Run with the harness up:  python3 tests/ui_test.py
"""
import json, sys, base64, urllib.request
from playwright.sync_api import sync_playwright, expect

SITE = 'http://localhost:4100'
RESEND = 'http://localhost:4103'
ok = []; bad = []

def step(name, fn):
    try:
        fn(); ok.append(name); print('  ok  ', name)
    except Exception as e:
        bad.append(name); print('  FAIL', name, '\n       ', str(e).split('\n')[0][:300])

def emails():
    return json.load(urllib.request.urlopen(RESEND + '/__emails'))

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')

with sync_playwright() as p:
    b = p.chromium.launch()
    errors = []

    # ---------- desktop: the shopfront ----------
    d = b.new_page(viewport={'width': 1440, 'height': 900})
    d.on('pageerror', lambda e: None if 'Transition was aborted' in str(e) else errors.append(str(e)))
    def shopfront_desktop():
        d.goto(SITE + '/'); d.wait_for_selector('#shopfront .window-spot')
        expect(d.locator('#shopfront')).to_have_class('shopfront placeholder')
        expect(d.locator('#shopfront .window-spot img')).to_have_count(3)
        expect(d.locator('#shopfront a')).to_have_count(1)          # only the window spot is a link
        assert d.locator('text=£').count() == 0, 'a price is showing'
        d.locator('#shopfront .window-spot').click(); d.wait_for_url('**/shop/*')
    step('desktop shopfront: one blank spot showing window products, nothing else clickable, no prices', shopfront_desktop)

    def shop_all_always_visible():
        for path in ['/', '/shop', '/shop/vase', '/contact', '/category/little-treasures', '/search']:
            d.goto(SITE + path); expect(d.locator('.main-nav .shop-all')).to_be_visible()
            assert d.locator('.basket-link').count() == 0
    step('Shop all is on every page; there is no basket', shop_all_always_visible)

    def photos_never_cropped():
        d.goto(SITE + '/'); d.wait_for_selector('.cat img')
        for sel in ['.cat-img img', '.card-img img', '.window-spot img']:
            fits = d.eval_on_selector_all(sel, 'els => els.map(e => getComputedStyle(e).objectFit)')
            assert fits and all(f == 'contain' for f in fits), (sel, fits)
    step('photos are shown whole (never cropped) in tiles, cards and the window', photos_never_cropped)
    d.close()

    # ---------- phone: shopping ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: None if 'Transition was aborted' in str(e) else errors.append(str(e)))

    def phone_shopfront():
        pg.goto(SITE + '/'); pg.wait_for_selector('#shopfront .window-spot')
        expect(pg.locator('#shopfront')).to_have_class('shopfront is-mobile placeholder')
        expect(pg.locator('.cat')).to_have_count(5)
        expect(pg.locator('#window-grid .card')).to_have_count(3)
    step('phone gets its own portrait shopfront, categories and window', phone_shopfront)

    def search_and_sort():
        pg.goto(SITE + '/search'); pg.wait_for_selector('.card')
        pg.fill('#q', 'lamp'); expect(pg.locator('.card')).to_have_count(2)
        pg.fill('#q', 'zzzz'); expect(pg.locator('.empty')).to_contain_text('Nothing matches')
        pg.fill('#q', ''); pg.select_option('#sort', 'az'); expect(pg.locator('.card').first).to_contain_text('Blue faces vase')
        assert 'sort=az' in pg.url
    step('search and sort', search_and_sort)

    def enquire():
        pg.goto(SITE + '/shop/vase'); pg.wait_for_selector('#enquire')
        expect(pg.locator('.cat-link')).to_have_text('Objects & Oddities')
        assert pg.locator('#add').count() == 0 and pg.locator('text=£').count() == 0
        before = len(emails())
        pg.fill('#e-name', 'Ann'); pg.fill('#e-email', 'ann@example.com'); pg.fill('#e-msg', 'Is this available?')
        pg.click('#enquire button[type=submit]'); expect(pg.locator('#e-status')).to_contain_text('has been sent')
        sent = emails()[before:]
        assert sent and sent[0]['to'][0] == 'blue@example.com' and 'Blue faces vase' in sent[0]['subject']
    step('product page: no price, enquiry form emails Blue', enquire)

    def contact():
        pg.goto(SITE + '/contact'); pg.fill('#c-name', 'Bob'); pg.fill('#c-email', 'bob@example.com'); pg.fill('#c-msg', 'Commission?')
        pg.click('#contact-form button[type=submit]'); expect(pg.locator('#c-status')).to_contain_text('has been sent')
    step('contact form', contact)

    def not_found():
        pg.goto(SITE + '/shop/nope'); pg.wait_for_selector('h1'); expect(pg.locator('h1')).to_have_text('Nothing here')
        pg.goto(SITE + '/category/nope'); expect(pg.locator('#list-title')).to_have_text('Nothing here')
    step('unknown product or category: friendly page with a way on', not_found)

    # ---------- portal ----------
    def portal_login():
        pg.goto(SITE + '/portal/enquiries'); pg.wait_for_url('**/portal/login**')
        pg.fill('#username', 'admin'); pg.fill('#password', 'wrong'); pg.click('#login-btn')
        expect(pg.locator('#login-note')).to_contain_text('did not match')
        pg.fill('#password', 'test-only-password'); pg.click('#login-btn')
        pg.wait_for_url('**/portal/enquiries'); pg.wait_for_selector('.rows')
    step('portal login, back to the page asked for', portal_login)

    def add_product():
        pg.goto(SITE + '/portal/products/new'); pg.wait_for_selector('#pform')
        pg.fill('#title', 'Studio Scarf'); pg.select_option('#category', label='Things to Wear')
        pg.set_input_files('#files', files=[{'name': 'a.png', 'mimeType': 'image/png', 'buffer': PNG}])
        expect(pg.locator('#upload-status')).to_contain_text('1 photo added')
        pg.check('#pub'); pg.check('#feat'); pg.click('#save'); expect(pg.locator('#save-status')).to_contain_text('Saved')
        pg.goto(SITE + '/category/things-to-wear'); pg.wait_for_selector('.card')
        expect(pg.locator('.card')).to_contain_text('Studio Scarf')
        pg.goto(SITE + '/'); pg.wait_for_selector('#window-grid .card'); expect(pg.locator('#window-grid')).to_contain_text('Studio Scarf')
    step('portal: add a product with category and window; it appears in the shop', add_product)

    def categories():
        pg.goto(SITE + '/portal/categories'); pg.wait_for_selector('#new-cat')
        pg.fill('#nc-name', 'Odd Socks'); pg.click('#new-cat button[type=submit]')
        expect(pg.locator('.cat-name-input').last).to_have_value('Odd Socks')
        pg.goto(SITE + '/shop'); pg.wait_for_selector('#tabs a'); expect(pg.locator('#tabs')).to_contain_text('Odd Socks')
    step('portal: add a category and it appears in the shop', categories)

    def settings():
        pg.goto(SITE + '/portal/settings'); pg.wait_for_selector('#sform')
        pg.fill('#shop_title', "Blue's Little Shop"); pg.fill('#intro_text', 'Come in.'); pg.click('#sform button[type=submit]')
        expect(pg.locator('#s-status')).to_contain_text('Saved')
        pg.goto(SITE + '/'); pg.wait_for_selector('#shopfront .window-spot')
        expect(pg.locator('.wordmark')).to_have_text("Blue's Little Shop"); expect(pg.locator('#intro')).to_have_text('Come in.')
    step('portal: shop name and welcome line change the shop', settings)

    def logout():
        pg.goto(SITE + '/portal'); pg.wait_for_selector('.howto'); pg.click('#logout'); pg.wait_for_url('**/portal/login')
        pg.goto(SITE + '/portal/settings'); pg.wait_for_url('**/portal/login**')
    step('portal: log out locks it again', logout)

    step('no JavaScript errors on any page', lambda: (_ for _ in ()).throw(AssertionError('; '.join(errors))) if errors else None)
    b.close()

print(f'\n{len(ok)} passed, {len(bad)} failed')
sys.exit(1 if bad else 0)
