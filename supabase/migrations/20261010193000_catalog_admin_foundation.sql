-- Light.loja: catálogo, campanhas e controle de acesso administrativo.
-- This migration is intentionally self-contained so it can be run in the
-- Supabase SQL Editor and tracked with the source code.

create table if not exists public.light_admins (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

-- The owner signing into the current Supabase project receives admin access.
-- Additional people can be added later with: insert into public.light_admins(email) values ('email@dominio.com');
insert into public.light_admins (email)
values ('mecontahistorias.cristo@gmail.com')
on conflict (email) do nothing;

create or replace function public.is_light_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.light_admins admin
    join auth.users account on lower(account.email) = admin.email
    where account.id = auth.uid()
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.catalog_categories (
  id text primary key check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 40),
  icon text not null default '✦' check (char_length(icon) between 1 and 3),
  sort_order integer not null default 100 check (sort_order >= 0),
  show_on_nav boolean not null default true,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.catalog_products (
  id text primary key check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 90),
  category_id text not null references public.catalog_categories(id) on update cascade on delete restrict,
  price_cents integer not null check (price_cents >= 0),
  compare_at_price_cents integer check (compare_at_price_cents is null or compare_at_price_cents >= price_cents),
  sku text unique,
  tag text not null default 'Peça especial' check (char_length(tag) <= 40),
  description text not null default '' check (char_length(description) <= 420),
  material text not null default 'PLA impresso em 3D' check (char_length(material) <= 80),
  production_time text not null default 'Produção em 3 a 5 dias úteis' check (char_length(production_time) <= 80),
  availability text not null default 'Sob encomenda' check (char_length(availability) <= 40),
  stock integer check (stock is null or stock >= 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  featured_rank integer not null default 0 check (featured_rank >= 0),
  art text not null default 'art-lamp' check (art in ('art-lamp', 'art-arch', 'art-house', 'art-orbit')),
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array'),
  shipping jsonb not null default '{"weight":0.3,"height":13,"width":10,"length":15}'::jsonb,
  seo_title text check (seo_title is null or char_length(seo_title) <= 70),
  seo_description text check (seo_description is null or char_length(seo_description) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.catalog_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  eyebrow text not null default '' check (char_length(eyebrow) <= 60),
  title text not null check (char_length(title) <= 120),
  description text not null default '' check (char_length(description) <= 320),
  image_url text not null,
  cta_label text not null default 'Conhecer a coleção' check (char_length(cta_label) <= 50),
  cta_target_type text not null default 'catalog' check (cta_target_type in ('catalog', 'category', 'product', 'url')),
  cta_target text not null default '#produtos',
  sort_order integer not null default 100 check (sort_order >= 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

-- Moving the products and deleting the category must be a single transaction.
-- Calling this RPC also avoids exposing a half-complete catalog to the storefront.
create or replace function public.delete_catalog_category(target_id text, replacement_category_id text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  attached_product_count integer;
begin
  if not public.is_light_admin() then
    raise exception 'admin permission required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.catalog_categories where id = target_id) then
    raise exception 'category not found' using errcode = 'P0002';
  end if;

  if (select count(*) from public.catalog_categories) <= 1 then
    raise exception 'at least one category must remain' using errcode = '23514';
  end if;

  select count(*) into attached_product_count from public.catalog_products where category_id = target_id;
  if attached_product_count > 0 then
    if replacement_category_id is null or replacement_category_id = target_id or not exists (select 1 from public.catalog_categories where id = replacement_category_id) then
      raise exception 'a valid replacement category is required' using errcode = '23514';
    end if;
    update public.catalog_products set category_id = replacement_category_id where category_id = target_id;
  end if;

  delete from public.catalog_categories where id = target_id;
end;
$$;

grant execute on function public.delete_catalog_category(text, text) to authenticated;

drop trigger if exists set_catalog_categories_updated_at on public.catalog_categories;
create trigger set_catalog_categories_updated_at before update on public.catalog_categories
for each row execute procedure public.set_updated_at();

drop trigger if exists set_catalog_products_updated_at on public.catalog_products;
create trigger set_catalog_products_updated_at before update on public.catalog_products
for each row execute procedure public.set_updated_at();

drop trigger if exists set_catalog_campaigns_updated_at on public.catalog_campaigns;
create trigger set_catalog_campaigns_updated_at before update on public.catalog_campaigns
for each row execute procedure public.set_updated_at();

alter table public.light_admins enable row level security;
alter table public.catalog_categories enable row level security;
alter table public.catalog_products enable row level security;
alter table public.catalog_campaigns enable row level security;

drop policy if exists "Owners can view Light admins" on public.light_admins;
create policy "Owners can view Light admins" on public.light_admins for select to authenticated using (public.is_light_admin());

drop policy if exists "Public can read visible categories" on public.catalog_categories;
create policy "Public can read visible categories" on public.catalog_categories for select to anon, authenticated using (visible = true);
drop policy if exists "Admins manage categories" on public.catalog_categories;
create policy "Admins manage categories" on public.catalog_categories for all to authenticated using (public.is_light_admin()) with check (public.is_light_admin());

drop policy if exists "Public can read published products" on public.catalog_products;
create policy "Public can read published products" on public.catalog_products for select to anon, authenticated using (
  status = 'published'
  and exists (
    select 1
    from public.catalog_categories category
    where category.id = catalog_products.category_id
      and category.visible = true
  )
);
drop policy if exists "Admins manage products" on public.catalog_products;
create policy "Admins manage products" on public.catalog_products for all to authenticated using (public.is_light_admin()) with check (public.is_light_admin());

drop policy if exists "Public can read active campaigns" on public.catalog_campaigns;
create policy "Public can read active campaigns" on public.catalog_campaigns for select to anon, authenticated using (
  status = 'published'
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at > now())
);
drop policy if exists "Admins manage campaigns" on public.catalog_campaigns;
create policy "Admins manage campaigns" on public.catalog_campaigns for all to authenticated using (public.is_light_admin()) with check (public.is_light_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog-media', 'catalog-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view catalog media" on storage.objects;
create policy "Public can view catalog media" on storage.objects for select to public using (bucket_id = 'catalog-media');
drop policy if exists "Admins upload catalog media" on storage.objects;
create policy "Admins upload catalog media" on storage.objects for insert to authenticated with check (bucket_id = 'catalog-media' and public.is_light_admin());
drop policy if exists "Admins update catalog media" on storage.objects;
create policy "Admins update catalog media" on storage.objects for update to authenticated using (bucket_id = 'catalog-media' and public.is_light_admin()) with check (bucket_id = 'catalog-media' and public.is_light_admin());
drop policy if exists "Admins delete catalog media" on storage.objects;
create policy "Admins delete catalog media" on storage.objects for delete to authenticated using (bucket_id = 'catalog-media' and public.is_light_admin());

insert into public.catalog_categories (id, name, icon, sort_order, show_on_nav, visible)
values
  ('decoracao', 'Decoração', '⌂', 1, true, true),
  ('presentes', 'Presentes', '⌑', 2, true, true)
on conflict (id) do nothing;

insert into public.catalog_products (id, title, category_id, price_cents, tag, description, material, production_time, availability, stock, status, featured_rank, art, photos, shipping, published_at)
values
  ('presepio-sagrada-familia', 'Presépio Sagrada Família', 'presentes', 7990, 'Coleção de Natal', 'Uma leitura minimalista da Sagrada Família, impressa camada por camada para acompanhar os seus rituais de dezembro.', 'PLA impresso em 3D', 'Produção em 3 a 5 dias úteis', 'Sob encomenda', null, 'published', 2, 'art-arch', '["https://lightloja.vercel.app/assets/presepio-sagrada-familia.webp"]'::jsonb, '{"weight":0.35,"height":14,"width":14,"length":18}'::jsonb, now()),
  ('presepio-arco-da-estrela', 'Presépio Arco da Estrela', 'decoracao', 9490, 'Novo', 'Um arco escultural com estrela-guia para iluminar a cena mais especial da estação.', 'PLA impresso em 3D', 'Produção em 3 a 5 dias úteis', 'Sob encomenda', null, 'published', 1, 'art-arch', '["https://lightloja.vercel.app/assets/presepio-arco-da-estrela.webp"]'::jsonb, '{"weight":0.45,"height":22,"width":12,"length":20}'::jsonb, now()),
  ('presepio-completo', 'Presépio Completo', 'presentes', 12990, 'Edição especial', 'Conjunto completo de figuras para montar uma cena afetiva, cheia de pequenos detalhes.', 'PLA impresso em 3D', 'Produção em 4 a 7 dias úteis', 'Sob encomenda', null, 'published', 3, 'art-house', '["https://lightloja.vercel.app/assets/presepio-completo.webp"]'::jsonb, '{"weight":0.7,"height":14,"width":22,"length":28}'::jsonb, now()),
  ('organizador-vila-de-natal', 'Organizador Vila de Natal', 'decoracao', 5490, 'Para presentear', 'Bandeja organizadora com vila iluminada para guardar chaves, bilhetes e pequenos objetos.', 'PLA impresso em 3D', 'Produção em 3 a 5 dias úteis', 'Sob encomenda', null, 'published', 4, 'art-house', '["https://lightloja.vercel.app/assets/organizador-vila-natal.webp"]'::jsonb, '{"weight":0.55,"height":10,"width":22,"length":25}'::jsonb, now())
on conflict (id) do nothing;

insert into public.catalog_campaigns (name, eyebrow, title, description, image_url, cta_label, cta_target_type, cta_target, sort_order, status, published_at)
select * from (values
  ('Sagrada Família', 'Coleção de Natal', 'Peças que iluminam dezembro.', 'Presépios e objetos impressos em 3D para transformar a casa em cenário de memória e afeto.', 'https://lightloja.vercel.app/assets/presepio-sagrada-familia.webp', 'Conhecer a coleção', 'catalog', '#produtos', 1, 'published', now()),
  ('Arco da Estrela', 'Estrela-guia', 'Um arco para guardar a cena.', 'O Presépio Arco da Estrela une uma forma escultural e uma tradição cheia de significado.', 'https://lightloja.vercel.app/assets/presepio-arco-da-estrela.webp', 'Ver presépios', 'category', 'decoracao', 2, 'published', now()),
  ('Presépio Completo', 'Edição especial', 'Uma história inteira à mesa.', 'O Presépio Completo convida a montar a cena com figuras e detalhes para observar de perto.', 'https://lightloja.vercel.app/assets/presepio-completo.webp', 'Ver conjunto', 'category', 'presentes', 3, 'published', now()),
  ('Vila de Natal', 'Casa em festa', 'Pequenos rituais, bem guardados.', 'Uma bandeja organizadora com vila iluminada para receber chaves, bilhetes e coisas queridas.', 'https://lightloja.vercel.app/assets/organizador-vila-natal.webp', 'Conhecer a vila', 'category', 'decoracao', 4, 'published', now())
) as seed(name, eyebrow, title, description, image_url, cta_label, cta_target_type, cta_target, sort_order, status, published_at)
where not exists (select 1 from public.catalog_campaigns);
