-- =============================================================
--  Blue's Shop: settings, categories and starting products
--
--  TODO(Blue): everything here is a starting point. Product names,
--  descriptions and PRICES are placeholders (marked below). The
--  shopfront illustration, the shop name lettering and the intro are
--  Blue's to make. All of it can be changed in the portal.
--  Photos are Blue's, resized only. Never hot-link bluelogan.net.
-- =============================================================

insert into public.bl_site_settings (key, value) values
  ('shop_open', 'true'::jsonb),
  ('shop_title', '"Blue''s Shop"'::jsonb),                  -- placeholder lettering, Blue to draw
  ('intro_text', '"A curious little world of wonderful things."'::jsonb),   -- placeholder, Blue to write
  ('hero_image', '""'::jsonb),                               -- Blue's shopfront illustration (desktop), see ILLUSTRATION_FRAMEWORK.md
  ('hero_image_mobile', '""'::jsonb),                        -- Blue's shopfront illustration (phone)
  ('delivery_note', '"UK delivery. Most orders are packed and sent within five working days."'::jsonb),
  ('delivery_fee_pence', '500'::jsonb),                      -- TODO(Blue): real delivery charges
  ('free_delivery_over_pence', '15000'::jsonb)
on conflict (key) do nothing;

-- Starting categories from the brief. Blue can rename, add or remove them.
insert into public.bl_categories (slug, name, description, sort_order) values
  ('objects-and-oddities', 'Objects & Oddities', 'Ceramics, lamps, trays and unexpected things for the home.', 10),
  ('little-treasures',     'Little Treasures',   'Matchboxes, pins, coasters, cards and curious small gifts.', 20),
  ('things-to-wear',       'Things to Wear',     'Clothing, scarves and limited pieces.', 30),
  ('paper-things',         'Paper Things',       'Prints, postcards, notebooks and illustrated stationery.', 40),
  ('special-editions',     'Special Editions',   'Collaborations, one-offs and limited releases.', 50)
on conflict (slug) do nothing;

-- TODO(Blue): placeholder names, descriptions and prices.
insert into public.bl_products (slug, title, description, mode, price_pence, stock, images, is_published, is_featured, sort_order, category_id)
select v.slug, v.title, 'Description to come.', 'buy', v.price, v.stock, array[v.img], true, v.featured, v.sort, c.id
from (values
  ('lampshade-faces', 'Faces lampshade',      18000, 3,  '/images/works/lampshade-faces.jpg', true,  10, 'objects-and-oddities'),
  ('lampshade-party', 'Party lampshade',      16000, 3,  '/images/works/lampshade-party.jpg', true,  20, 'objects-and-oddities'),
  ('vase',            'Blue faces vase',      24000, 1,  '/images/works/vase.jpg',            true,  30, 'objects-and-oddities'),
  ('ritas-coaster',   'Rita''s coasters',      1800, 40, '/images/works/ritas-coaster.jpg',   false, 40, 'little-treasures'),
  ('ritas',           'Rita''s print',         4500, 25, '/images/works/ritas.jpg',           false, 50, 'paper-things')
) as v(slug, title, price, stock, img, featured, sort, cat)
join public.bl_categories c on c.slug = v.cat
on conflict (slug) do nothing;
