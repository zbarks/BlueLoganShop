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
        d.goto(SITE + '/'); d.wait_for_selector('#shopfront .zone')
        expect(d.locator('#shopfront')).to_have_class('shopfront wireframe')
        for label in ['Things to Wear', 'Special Editions', 'Objects & Oddities', 'Little Treasures', 'Paper Things']:
            expect(d.locator(f'#shopfront a.zone[aria-label="{label}"]')).to_have_count(1)
        expect(d.locator('#shopfront .window-show img')).to_have_count(3)
        d.locator('#shopfront a.zone[data-kind="door"]').click(); d.wait_for_url('**/shop')
        d.goto(SITE + '/'); d.wait_for_selector('#shopfront .zone')
        d.locator('#shopfront a.zone[aria-label="Paper Things"]').click(); d.wait_for_url('**/category/paper-things')
        expect(d.locator('#list-title')).to_have_text('Paper Things'); expect(d.locator('.card')).to_have_count(1)
    step('desktop shopfront: door opens Shop all, shelves open categories, window shows 3 products', shopfront_desktop)

    def shop_all_always_visible():
        for path in ['/', '/shop', '/shop/vase', '/basket', '/contact', '/category/little-treasures', '/search']:
            d.goto(SITE + path); expect(d.locator('.main-nav .shop-all')).to_be_visible()
    step('Shop all button is visible on every page', shop_all_always_visible)
    d.close()

    # ---------- phone: shopping ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: None if 'Transition was aborted' in str(e) else errors.append(str(e)))

    def phone_shopfront():
        pg.goto(SITE + '/'); pg.wait_for_selector('#shopfront .zone')
        expect(pg.locator('#shopfront')).to_have_class('shopfront is-mobile wireframe')
        expect(pg.locator('.cat')).to_have_count(5)
        expect(pg.locator('#window-grid .card')).to_have_count(3)
    step('phone gets its own portrait shopfront, categories and window', phone_shopfront)

    def search_and_sort():
        pg.goto(SITE + '/search'); pg.wait_for_selector('.card')
        pg.fill('#q', 'lamp'); expect(pg.locator('.card')).to_have_count(2)
        pg.fill('#q', 'zzzz'); expect(pg.locator('.empty')).to_contain_text('Nothing matches')
        pg.fill('#q', ''); pg.select_option('#sort', 'low'); expect(pg.locator('.card').first).to_contain_text("Rita's coasters")
        assert 'sort=low' in pg.url
    step('search and sort', search_and_sort)

    def add_to_basket():
        pg.goto(SITE + '/shop/vase'); pg.wait_for_selector('#add')
        expect(pg.locator('#price')).to_have_text('£240')
        expect(pg.locator('.cat-link')).to_have_text('Objects & Oddities')
        pg.click('#add'); expect(pg.locator('#added')).to_contain_text('In your basket')
        expect(pg.locator('.basket-count')).to_have_text('1')
        pg.goto(SITE + '/shop/ritas-coaster'); pg.wait_for_selector('#add')
        pg.click('button[data-q="1"]'); pg.click('#add'); expect(pg.locator('.basket-count')).to_have_text('3')
    step('product pages: price, category, add to basket', add_to_basket)

    def basket_and_pay():
        pg.goto(SITE + '/basket'); pg.wait_for_selector('.line')
        expect(pg.locator('.sum-row.total')).to_contain_text('£276')   # 240 + 2 x 18, free delivery over £150
        pg.fill('#code', 'nope'); pg.click('#code-form button[type=submit]'); expect(pg.locator('.summary')).to_contain_text('not recognised')
        before = len(emails())
        pg.click('#checkout'); pg.wait_for_url('**/pay/**'); pg.click('#pay'); pg.wait_for_url('**/order/thanks**')
        expect(pg.locator('#thanks-title')).to_have_text('Thank you, Test!')
        expect(pg.locator('.basket-count')).to_have_text('0')
        sent = emails()[before:]
        assert any(e['to'][0] == 'customer@example.com' for e in sent) and any(e['to'][0] == 'blue@example.com' for e in sent)
    step('basket, Stripe checkout (mock), thanks page, both emails', basket_and_pay)

    def ask_question():
        pg.goto(SITE + '/shop/lampshade-party'); pg.wait_for_selector('#ask')
        pg.click('#ask'); pg.fill('#e-name', 'Ann'); pg.fill('#e-email', 'ann@example.com'); pg.fill('#e-msg', 'Do you post to France?')
        pg.click('#enquire button[type=submit]'); expect(pg.locator('#e-status')).to_contain_text('has been sent')
    step('"Ask Blue a question" on a product page', ask_question)

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
        pg.goto(SITE + '/portal/orders'); pg.wait_for_url('**/portal/login**')
        pg.fill('#username', 'admin'); pg.fill('#password', 'wrong'); pg.click('#login-btn')
        expect(pg.locator('#login-note')).to_contain_text('did not match')
        pg.fill('#password', 'test-only-password'); pg.click('#login-btn')
        pg.wait_for_url('**/portal/orders'); pg.wait_for_selector('.rows')
    step('portal login, back to the page asked for', portal_login)

    def ship_and_refund():
        pg.locator('.rows li').first.locator('text=Open').click(); pg.wait_for_selector('#ship')
        before = len(emails())
        pg.fill('#tracking_number', 'RM123456789GB'); pg.click('#ship button[type=submit]')
        expect(pg.locator('.notice.ok')).to_contain_text('emailed the tracking number')
        assert 'RM123456789GB' in emails()[before]['html']
        pg.once('dialog', lambda dlg: dlg.accept()); pg.click('#refund')
        expect(pg.locator('.notice.ok')).to_contain_text('Refunded')
    step('portal: mark as sent (tracking email) and refund', ship_and_refund)

    def add_product():
        pg.goto(SITE + '/portal/products/new'); pg.wait_for_selector('#pform')
        pg.fill('#title', 'Studio Scarf'); pg.select_option('#category', label='Things to Wear')
        pg.fill('#price', '45'); pg.fill('#stock', '10')
        pg.set_input_files('#files', files=[{'name': 'a.png', 'mimeType': 'image/png', 'buffer': PNG}])
        expect(pg.locator('#upload-status')).to_contain_text('1 photo added')
        pg.check('#pub'); pg.check('#feat'); pg.click('#save'); expect(pg.locator('#save-status')).to_contain_text('Saved')
        pg.goto(SITE + '/category/things-to-wear'); pg.wait_for_selector('.card')
        expect(pg.locator('.card')).to_contain_text('Studio Scarf'); expect(pg.locator('.card')).to_contain_text('£45')
        pg.goto(SITE + '/'); pg.wait_for_selector('#window-grid .card'); expect(pg.locator('#window-grid')).to_contain_text('Studio Scarf')
    step('portal: add a product with price, stock, category and window; it appears in the shop', add_product)

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
        pg.goto(SITE + '/'); pg.wait_for_selector('#shopfront .zone')
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
