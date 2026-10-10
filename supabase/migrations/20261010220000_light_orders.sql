-- Orders remain pending until a real payment provider is integrated.
-- Customer details are readable only by authorized Light administrators.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.light_order_rate_limit_secret (
  singleton boolean primary key default true check (singleton),
  secret bytea not null
);
insert into private.light_order_rate_limit_secret (singleton, secret)
values (true, extensions.gen_random_bytes(32))
on conflict (singleton) do nothing;

create table if not exists private.light_order_rate_limits (
  ip_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0)
);

create table if not exists public.light_orders (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  customer_name text check (customer_name is null or char_length(customer_name) between 1 and 100),
  customer_email text check (customer_email is null or char_length(customer_email) between 3 and 120),
  customer_phone text check (customer_phone is null or char_length(customer_phone) between 10 and 20),
  recipient_name text check (recipient_name is null or char_length(recipient_name) between 1 and 100),
  shipping_address jsonb check (shipping_address is null or jsonb_typeof(shipping_address) = 'object'),
  postal_code text check (postal_code is null or postal_code ~ '^[0-9]{8}$'),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 20),
  shipping_service jsonb not null check (jsonb_typeof(shipping_service) = 'object'),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  shipping_cents integer not null check (shipping_cents >= 0),
  total_cents integer not null check (total_cents = subtotal_cents + shipping_cents),
  status text not null default 'pending_payment' check (status in ('pending_payment', 'cancelled', 'expired')),
  payment_provider text,
  payment_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  expired_at timestamptz,
  personal_data_deleted_at timestamptz
);

create index if not exists light_orders_created_at_idx on public.light_orders (created_at desc);
create index if not exists light_orders_status_created_at_idx on public.light_orders (status, created_at desc);

drop trigger if exists set_light_orders_updated_at on public.light_orders;
create trigger set_light_orders_updated_at before update on public.light_orders
for each row execute procedure public.set_updated_at();

alter table public.light_orders enable row level security;

drop policy if exists "Admins can view Light orders" on public.light_orders;
create policy "Admins can view Light orders" on public.light_orders
  for select to authenticated using (public.is_light_admin());

-- Orders are inserted only by the create-order Edge Function using its
-- server-side service key. No anonymous or browser-authenticated insert policy
-- is created, and order status changes go through the admin-only RPC below.
revoke all on public.light_orders from anon, authenticated;
grant select on public.light_orders to authenticated;
grant select, insert on public.light_orders to service_role;

create or replace function public.consume_light_order_rate_limit(client_ip text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private, extensions, public
as $$
declare
  secret_value bytea;
  current_count integer;
  ip_key_value text;
begin
  if client_ip is null or char_length(client_ip) not between 2 and 64 then
    raise exception 'valid client IP required' using errcode = '22023';
  end if;

  select secret into secret_value
    from private.light_order_rate_limit_secret
   where singleton = true;
  ip_key_value := encode(extensions.hmac(convert_to(client_ip, 'UTF8'), secret_value, 'sha256'), 'hex');

  insert into private.light_order_rate_limits as rate_limit (ip_key, window_started_at, request_count)
  values (ip_key_value, now(), 1)
  on conflict (ip_key) do update
    set request_count = case
          when rate_limit.window_started_at <= now() - interval '1 hour' then 1
          else rate_limit.request_count + 1
        end,
        window_started_at = case
          when rate_limit.window_started_at <= now() - interval '1 hour' then now()
          else rate_limit.window_started_at
        end
  returning request_count into current_count;

  return current_count <= 5;
end;
$$;
revoke all on function public.consume_light_order_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_light_order_rate_limit(text) to service_role;

create or replace function public.maintain_light_orders()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  update public.light_orders
     set status = 'expired', expired_at = now()
   where status = 'pending_payment' and expires_at <= now();

  update public.light_orders
     set customer_name = null,
         customer_email = null,
         customer_phone = null,
         recipient_name = null,
         shipping_address = null,
         postal_code = null,
         personal_data_deleted_at = now()
   where personal_data_deleted_at is null
     and ((status = 'cancelled' and cancelled_at <= now() - interval '30 days')
       or (status = 'expired' and expired_at <= now() - interval '30 days'));

  delete from private.light_order_rate_limits
   where window_started_at <= now() - interval '24 hours';
end;
$$;
revoke all on function public.maintain_light_orders() from public, anon, authenticated;

select cron.unschedule(jobid)
  from cron.job
 where jobname = 'light-orders-retention';
select cron.schedule('light-orders-retention', '*/15 * * * *', 'select public.maintain_light_orders()');

create or replace function public.cancel_pending_light_order(target_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_light_admin() then
    raise exception 'admin permission required' using errcode = '42501';
  end if;

  update public.light_orders
     set status = 'cancelled', cancelled_at = now()
   where id = target_order_id and status = 'pending_payment' and expires_at > now();

  if not found then
    raise exception 'pending order not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.cancel_pending_light_order(uuid) from public, anon;
grant execute on function public.cancel_pending_light_order(uuid) to authenticated;
