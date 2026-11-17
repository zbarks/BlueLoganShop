"""Browser test of the whole customer and portal journey (Playwright).
Run with the harness up:  python3 tests/ui_test.py
"""
import json, sys, urllib.request
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

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    pg = ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: None if 'Transition was aborted' in str(e) else errors.append(str(e)))  # a cross-page fade cut short by a fast click is harmless

    def shop_and_spots():
        pg.goto(SITE + '/shop'); pg.wait_for_selector('.card')
        expect(pg.locator('.card')).to_have_count(5)
        expect(pg.locator('#hero .spot')).to_have_count(0)
        assert pg.locator('text=£').count() == 0, 'a price is showing'
        box = pg.locator('#hero').bounding_box(); vp = pg.viewport_size
        assert box['x'] == 0 and abs(box['width'] - vp['width']) <= 1, 'main picture is not edge to edge'
        assert pg.locator('#hero-img').get_attribute('src').endswith('desert-5-mural.jpg')
        assert pg.locator('.main-nav a', has_text='Blue Logan').get_attribute('href') == 'https://bluelogan.co.uk'
        assert pg.locator('text=Back to').count() == 0
        pg.locator('.card').first.click(); pg.wait_for_url('**/shop/lampshade-faces')
        expect(pg.locator('h1')).to_have_text('Lampshade, faces')
    step('shop: mural fills the screen edge to edge, five pieces, no prices', shop_and_spots)

    def enquire():
        pg.goto(SITE + '/shop/ritas'); pg.wait_for_selector('#enquire')
        pg.click('#enquire button[type=submit]')  # name/email empty
        pg.fill('#e-name', 'Ann'); pg.fill('#e-email', 'not-an-email'); pg.click('#enquire button[type=submit]')
        expect(pg.locator('#enquire .field-error', has_text='valid email')).to_have_count(1)
        pg.fill('#e-email', 'ann@example.com'); pg.fill('#e-msg', 'Is this still available?'); pg.click('#enquire button[type=submit]')
        expect(pg.locator('#e-status')).to_contain_text('enquiry has been sent')
    step('piece page: enquiry form validates and sends', enquire)

    def contact():
        pg.goto(SITE + '/contact')
        pg.fill('#c-name', 'Bob'); pg.fill('#c-email', 'bob@example.com'); pg.fill('#c-msg', 'Do you do commissions?')
        pg.click('#contact-form button[type=submit]')
        expect(pg.locator('#c-status')).to_contain_text('message has been sent')
    step('contact form sends', contact)

    def not_found():
        r = pg.goto(SITE + '/shop/does-not-exist'); pg.wait_for_selector('h1')
        expect(pg.locator('h1')).to_contain_text('not in the shop')
        expect(pg.locator('.main-nav a', has_text='Shop')).to_be_visible()
    step('unknown product shows a friendly page with a way out', not_found)

    # ---------------- portal ----------------
    def portal_gate():
        pg.goto(SITE + '/portal/enquiries'); pg.wait_for_url('**/portal/login**')
        pg.fill('#email', 'blue@example.com'); pg.fill('#password', 'wrong'); pg.click('#login-btn')
        expect(pg.locator('#login-note')).to_contain_text('did not match')
        pg.fill('#password', 'correct horse'); pg.click('#login-btn')
        pg.wait_for_url('**/portal/enquiries'); pg.wait_for_selector('.rows')
    step('portal: login required, then returns to the page asked for', portal_gate)

    def add_product():
        pg.goto(SITE + '/portal/products/new'); pg.wait_for_selector('#pform')
        pg.fill('#title', 'Studio Print Test'); pg.fill('#description', 'A test.')
        png = __import__('base64').b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
        pg.set_input_files('#files', files=[{'name': 'a.png', 'mimeType': 'image/png', 'buffer': png}])
        expect(pg.locator('#upload-status')).to_contain_text('1 photo added')
        pg.locator('#placer-img').scroll_into_view_if_needed(); box = pg.locator('#placer-img').bounding_box()
        pg.mouse.click(box['x'] + box['width'] * 0.6, box['y'] + box['height'] * 0.5)
        expect(pg.locator('#placer .spot:not(.other)')).to_have_count(1)
        pg.check('#pub'); pg.click('#save'); expect(pg.locator('#save-status')).to_contain_text('Saved')
        assert '/portal/products/' in pg.url and 'new' not in pg.url
        pg.goto(SITE + '/shop'); pg.wait_for_selector('.card')
        spot = pg.locator('#hero .spot[aria-label="Studio Print Test"]')
        expect(spot).to_have_count(1)
        x, y = float(spot.get_attribute('data-x')), float(spot.get_attribute('data-y'))
        assert abs(x - 60) <= 1 and abs(y - 50) <= 1, (x, y)
        spot.scroll_into_view_if_needed()
        spot.click(); pg.wait_for_url('**/shop/studio-print-test')
    step('portal: add a piece with a photo, place it on the main picture, it opens from the shop', add_product)

    def hide_product():
        pg.goto(SITE + '/portal/products'); pg.wait_for_selector('.rows')
        row = pg.locator('li', has_text='Studio Print Test')
        row.locator('button[data-pub]').click(); expect(row.locator('.pill')).to_have_text('Hidden')
        pg.goto(SITE + '/shop'); pg.wait_for_selector('.card')
        expect(pg.locator('.card', has_text='Studio Print Test')).to_have_count(0)
    step('portal: hide a product and it leaves the shop', hide_product)

    def messages_settings():
        pg.goto(SITE + '/portal/enquiries'); pg.wait_for_selector('.rows')
        expect(pg.locator('.rows')).to_contain_text("About Rita's")
        expect(pg.locator('.rows')).to_contain_text('Contact form')
        pg.goto(SITE + '/portal/settings'); pg.wait_for_selector('#sform')
        pg.fill('#shop_title', 'Blue Logan Studio'); pg.fill('#intro_text', 'Hello from Blue.'); pg.click('#sform button[type=submit]')
        expect(pg.locator('#s-status')).to_contain_text('Saved')
        pg.goto(SITE + '/shop'); pg.wait_for_selector('.card')
        expect(pg.locator('.wordmark')).to_have_text('Blue Logan Studio'); expect(pg.locator('#intro')).to_have_text('Hello from Blue.')
    step('portal: messages list, shop name and intro edited from settings', messages_settings)

    def home_and_logout():
        pg.goto(SITE + '/portal'); pg.wait_for_selector('.howto')
        expect(pg.locator('.howto')).to_contain_text('main picture')
        pg.click('#logout'); pg.wait_for_url('**/portal/login')
        pg.goto(SITE + '/portal/settings'); pg.wait_for_url('**/portal/login**')
    step('portal: how-to panel, log out locks it again', home_and_logout)

    step('no JavaScript errors on any page', lambda: (_ for _ in ()).throw(AssertionError('; '.join(errors))) if errors else None)
    b.close()

print(f'\n{len(ok)} passed, {len(bad)} failed')
sys.exit(1 if bad else 0)
