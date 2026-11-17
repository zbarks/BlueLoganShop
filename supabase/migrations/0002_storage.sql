-- =============================================================
--  Blue Logan shop: image storage
--  Public bucket so product photos can be shown on the shop.
--  Uploads only happen through /api/admin (signed upload URLs made
--  with the service role key), so no insert policy is needed here.
-- =============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blue-logan-images', 'blue-logan-images', true, 10485760,
        array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do nothing;
