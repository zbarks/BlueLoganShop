-- =============================================================
--  Blue Logan shop: settings and starting pieces
--
--  The main picture is Blue's Desert 5 mural. It is not a piece for sale,
--  so no points are placed on it yet; Blue places points in the portal.
--  The photos are Blue's (in /images/works, resized only, never cropped
--  or altered). Titles are working titles and descriptions are
--  placeholders: Blue writes the real ones in the portal, along with the
--  shop name and intro. Never hot-link bluelogan.net.
-- =============================================================

insert into public.bl_site_settings (key, value) values
  ('shop_open', 'true'::jsonb),
  ('shop_title', '"Blue Logan Shop"'::jsonb),                       -- placeholder, Blue to write
  ('intro_text', '""'::jsonb),                                      -- placeholder, Blue to write
  ('hero_image', '"/images/works/desert-5-mural.jpg"'::jsonb)       -- main picture (Desert 5 mural); Blue can replace it
on conflict (key) do nothing;

insert into public.bl_products (slug, title, description, mode, images, is_published, sort_order, hotspot) values
  ('lampshade-faces', 'Lampshade, faces',  'Description to come.', 'enquire', array['/images/works/lampshade-faces.jpg'], true, 10, null),
  ('lampshade-party', 'Lampshade, party',  'Description to come.', 'enquire', array['/images/works/lampshade-party.jpg'], true, 20, null),
  ('vase',            'Vase',              'Description to come.', 'enquire', array['/images/works/vase.jpg'],            true, 30, null),
  ('ritas',           'Rita''s',           'Description to come.', 'enquire', array['/images/works/ritas.jpg'],           true, 40, null),
  ('ritas-coaster',   'Rita''s coaster',   'Description to come.', 'enquire', array['/images/works/ritas-coaster.jpg'],   true, 50, null)
on conflict (slug) do nothing;
