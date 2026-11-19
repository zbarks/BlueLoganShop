-- =============================================================
--  Blue Logan shop: schema
--  A proper shop: prices, stock, basket and Stripe Checkout. Any piece
--  can instead be set to "Enquire" (no price shown, enquiry form).
--  Lives in the shared "BarkerDigtial Clientside" Supabase project,
--  next to Brioche and Cleanway. Every table, function, index and the
--  storage bucket is prefixed bl_ / blue-logan- so nothing can clash
--  with the other clients. Never run against Hepple.
--  Safe to re-run: every statement is guarded.
--  Designed by Barker Digital
-- =============================================================

-- gen_random_uuid() is built into Postgres 13+, no extension needed.

-- -------------------------------------------------------------
--  Categories (Blue can add, rename and reorder these in the portal)
-- -------------------------------------------------------------
create table if not exists public.bl_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null,
  description text not null default '',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- -------------------------------------------------------------
--  Products
--  type:  print | lampshade | one-off   (drives the shop filter)
--  mode:  buy | enquire                 (one-off pieces can be enquiry only)
--  stock: null means "not tracked" (made to order); 0 means sold out
-- -------------------------------------------------------------
create table if not exists public.bl_products (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title        text not null,
  description  text not null default '',
  type         text not null default 'print' check (type in ('print','lampshade','one-off')),
  price_pence  integer check (price_pence is null or price_pence >= 0),
  currency     text not null default 'gbp',
  mode         text not null default 'enquire' check (mode in ('buy','enquire')),
  images       text[] not null default '{}',
  stock        integer check (stock is null or stock >= 0),
  is_published boolean not null default false,
  hotspot      jsonb,          -- {"x": 0-100, "y": 0-100}: optional point on the shopfront picture
  category_id  uuid references public.bl_categories(id) on delete set null,
  is_featured  boolean not null default false,   -- shown in the shop window
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- A product people can buy must have a price.
  constraint products_buy_needs_price check (mode <> 'buy' or price_pence is not null),
  constraint products_max_images check (coalesce(array_length(images, 1), 0) <= 8)
);
create index if not exists bl_products_public_idx on public.bl_products (is_published, sort_order);
create index if not exists bl_products_category_idx on public.bl_products (category_id);

-- Optional sizes or finishes. price_pence null = use the product price.
create table if not exists public.bl_product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.bl_products(id) on delete cascade,
  label       text not null,
  price_pence integer check (price_pence is null or price_pence >= 0),
  stock       integer check (stock is null or stock >= 0),
  sort_order  integer not null default 0
);
create index if not exists bl_product_variants_product_idx on public.bl_product_variants (product_id, sort_order);

-- -------------------------------------------------------------
--  Orders (written by the Stripe webhook, managed in the portal)
--  status: paid | shipped | refunded
-- -------------------------------------------------------------
create table if not exists public.bl_orders (
  id                         bigint generated always as identity (start with 1001) primary key,
  stripe_session_id          text not null unique,          -- idempotency key
  stripe_payment_intent      text,
  status                     text not null default 'paid' check (status in ('paid','shipped','refunded')),
  customer_email             text,
  customer_name              text,
  customer_phone             text,
  shipping_address           jsonb,                         -- may be null; portal warns
  items                      jsonb not null default '[]'::jsonb,
  subtotal_pence             integer not null default 0,
  discount_code              text,
  discount_pence             integer not null default 0,
  shipping_pence             integer not null default 0,
  total_pence                integer not null default 0,
  currency                   text not null default 'gbp',
  posthog_distinct_id        text,
  tracking_number            text,
  tracking_carrier           text,                          -- hook for later label automation
  shipped_at                 timestamptz,
  refunded_at                timestamptz,
  confirmation_email_sent_at timestamptz,
  shipped_email_sent_at      timestamptz,
  created_at                 timestamptz not null default now()
);
create index if not exists bl_orders_created_idx on public.bl_orders (created_at desc);
create index if not exists bl_orders_status_idx  on public.bl_orders (status);

-- -------------------------------------------------------------
--  Settings (same key/value pattern as Hepple)
-- -------------------------------------------------------------
create table if not exists public.bl_site_settings (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------------
--  Enquiries (product "Enquire" form and the contact page)
-- -------------------------------------------------------------
create table if not exists public.bl_enquiries (
  id         bigint generated always as identity primary key,
  product_id uuid references public.bl_products(id) on delete set null,
  source     text not null default 'contact' check (source in ('contact','product')),
  name       text not null,
  email      text not null,
  message    text not null,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists bl_enquiries_created_idx on public.bl_enquiries (created_at desc);

-- -------------------------------------------------------------
--  Discount codes (same idea as Hepple's promo codes)
-- -------------------------------------------------------------
create table if not exists public.bl_discount_codes (
  code        text primary key check (code = upper(btrim(code)) and code <> ''),
  percent_off integer not null check (percent_off between 1 and 100),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- -------------------------------------------------------------
--  Row level security
--  The public (anon key) can read published products, their
--  variants and a short list of public settings. Nothing else.
--  Server routes use the service role key, which bypasses RLS.
-- -------------------------------------------------------------
alter table public.bl_categories       enable row level security;
alter table public.bl_products         enable row level security;
alter table public.bl_product_variants enable row level security;
alter table public.bl_orders           enable row level security;
alter table public.bl_site_settings    enable row level security;
alter table public.bl_enquiries        enable row level security;
alter table public.bl_discount_codes   enable row level security;

drop policy if exists "public reads categories" on public.bl_categories;
create policy "public reads categories" on public.bl_categories
  for select to anon, authenticated using (true);

drop policy if exists "public reads published products" on public.bl_products;
create policy "public reads published products" on public.bl_products
  for select to anon, authenticated
  using (is_published);

drop policy if exists "public reads variants of published products" on public.bl_product_variants;
create policy "public reads variants of published products" on public.bl_product_variants
  for select to anon, authenticated
  using (exists (select 1 from public.bl_products p where p.id = product_id and p.is_published));

drop policy if exists "public reads public settings" on public.bl_site_settings;
create policy "public reads public settings" on public.bl_site_settings
  for select to anon, authenticated
  using (key in ('shop_open','delivery_note','delivery_fee_pence','free_delivery_over_pence','shop_title','intro_text','hero_image','hero_image_mobile'));

-- No policies on orders, enquiries or discount_codes: anon gets nothing.
-- Belt and braces: remove write grants from the public roles everywhere.
revoke insert, update, delete on public.bl_categories, public.bl_products, public.bl_product_variants, public.bl_orders,
  public.bl_site_settings, public.bl_enquiries, public.bl_discount_codes from anon, authenticated;

-- -------------------------------------------------------------
--  updated_at on products
-- -------------------------------------------------------------
create or replace function public.bl_touch_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_bl_products_touch on public.bl_products;
create trigger trg_bl_products_touch before update on public.bl_products
  for each row execute function public.bl_touch_updated_at();

-- -------------------------------------------------------------
--  create_order: called by the webhook. One transaction:
--    1. insert the order, keyed on stripe_session_id
--    2. if (and only if) the row is new, reduce stock
--  A repeated Stripe event finds the existing row and changes nothing,
--  so it can never create a second order or reduce stock twice.
-- -------------------------------------------------------------
create or replace function public.bl_create_order(p jsonb)
returns table (order_id bigint, is_new boolean)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  new_id bigint;
  it     jsonb;
begin
  insert into public.bl_orders (
    stripe_session_id, stripe_payment_intent, customer_email, customer_name, customer_phone,
    shipping_address, items, subtotal_pence, discount_code, discount_pence, shipping_pence,
    total_pence, currency, posthog_distinct_id
  ) values (
    p->>'stripe_session_id', p->>'stripe_payment_intent', p->>'customer_email', p->>'customer_name',
    p->>'customer_phone', p->'shipping_address', coalesce(p->'items', '[]'::jsonb),
    coalesce((p->>'subtotal_pence')::int, 0), nullif(p->>'discount_code', ''),
    coalesce((p->>'discount_pence')::int, 0), coalesce((p->>'shipping_pence')::int, 0),
    coalesce((p->>'total_pence')::int, 0), coalesce(p->>'currency', 'gbp'), p->>'posthog_distinct_id'
  )
  on conflict (stripe_session_id) do nothing
  returning id into new_id;

  if new_id is null then
    return query select o.id, false from public.bl_orders o where o.stripe_session_id = p->>'stripe_session_id';
    return;
  end if;

  for it in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    if nullif(it->>'variant_id', '') is not null then
      update public.bl_product_variants
         set stock = greatest(stock - coalesce((it->>'qty')::int, 1), 0)
       where id = (it->>'variant_id')::uuid and stock is not null;
    elsif nullif(it->>'product_id', '') is not null then
      update public.bl_products
         set stock = greatest(stock - coalesce((it->>'qty')::int, 1), 0)
       where id = (it->>'product_id')::uuid and stock is not null;
    end if;
  end loop;

  return query select new_id, true;
end $$;

revoke all on function public.bl_create_order(jsonb) from public, anon, authenticated;
grant execute on function public.bl_create_order(jsonb) to service_role;

-- -------------------------------------------------------------
--  Swap two products' positions (portal "move up / move down")
-- -------------------------------------------------------------
create or replace function public.bl_set_product_order(ids uuid[])
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare i int;
begin
  for i in 1 .. coalesce(array_length(ids, 1), 0) loop
    update public.bl_products set sort_order = i * 10 where id = ids[i];
  end loop;
end $$;

revoke all on function public.bl_set_product_order(uuid[]) from public, anon, authenticated;
grant execute on function public.bl_set_product_order(uuid[]) to service_role;

-- Safe upgrades for a database created before these columns existed.
alter table public.bl_products add column if not exists hotspot jsonb;
alter table public.bl_products add column if not exists category_id uuid references public.bl_categories(id) on delete set null;
alter table public.bl_products add column if not exists is_featured boolean not null default false;
