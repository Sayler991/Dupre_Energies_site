-- =====================================================================
--  Dupre Energies (maquette) — rendez-vous, devis, messages, contenu
--  Isolé dans le schéma « dupre » du projet Supabase partagé (Whoopy/ibis).
--  Ne modifie AUCUN objet des schémas public / ibis. Idempotent.
--  Après exécution : ajouter « dupre » aux schémas exposés (PATCH /postgrest).
-- =====================================================================
create schema if not exists dupre;
grant usage on schema dupre to anon, authenticated, service_role;

-- 1. CONTENU + HISTORIQUE ---------------------------------------------
create table if not exists dupre.site_content (
  id integer primary key default 1 check (id = 1),
  data jsonb not null check (jsonb_typeof(data) = 'object') check (octet_length(data::text) <= 524288),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create table if not exists dupre.site_content_history (
  id bigint generated always as identity primary key,
  saved_at timestamptz not null default now(),
  saved_by uuid,
  data jsonb not null
);
create or replace function dupre.site_content_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.data is distinct from old.data then
    insert into dupre.site_content_history (saved_by, data) values (old.updated_by, old.data);
    delete from dupre.site_content_history
     where id not in (select id from dupre.site_content_history order by id desc limit 40);
  end if;
  new.updated_at := now(); new.updated_by := auth.uid(); new.id := old.id;
  return new;
end; $$;
drop trigger if exists trg_site_content_before_update on dupre.site_content;
create trigger trg_site_content_before_update before update on dupre.site_content
  for each row execute function dupre.site_content_before_update();

-- 2. CLIENTS + DEMANDES (rdv / devis / message) -----------------------
create table if not exists dupre.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  phone text not null check (phone ~ '^\+?[0-9][0-9 .-]{7,18}[0-9]$'),
  phone_norm text generated always as (regexp_replace(phone, '[^0-9]', '', 'g')) stored,
  address text check (address is null or char_length(address) <= 200),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);
create unique index if not exists customers_phone_norm_uq on dupre.customers (phone_norm);

create table if not exists dupre.requests (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('rdv','devis','message')),
  status text not null default 'nouveau' check (status in ('nouveau','confirmé','terminé','annulé')),
  customer_id uuid references dupre.customers(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  phone text not null check (phone ~ '^\+?[0-9][0-9 .-]{7,18}[0-9]$'),
  email text check (email is null or (char_length(email) <= 120 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  address text check (address is null or char_length(address) <= 200),
  service text check (service is null or char_length(service) <= 80),
  day date,
  slot text check (slot is null or slot in ('08h-10h','10h-12h','14h-16h','16h-18h')),
  message text not null check (char_length(btrim(message)) between 5 and 2000),
  photo_url text check (photo_url is null or char_length(photo_url) <= 400),
  hp text,  -- pot de miel anti-robot (doit rester vide)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rdv_needs_slot check (kind <> 'rdv' or (day is not null and slot is not null and address is not null))
);
create index if not exists requests_created_idx on dupre.requests (created_at desc);
create index if not exists requests_kind_idx on dupre.requests (kind, status);

create or replace function dupre.requests_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_data jsonb; v_norm text; v_cid uuid;
begin
  if public.is_owner() then new.updated_at := now(); return new; end if;
  if coalesce(new.hp, '') <> '' then raise exception 'Envoi refusé.' using errcode = 'P0001'; end if;
  new.status := 'nouveau'; new.created_at := now(); new.updated_at := now(); new.customer_id := null;
  new.name := btrim(new.name); new.phone := btrim(new.phone); new.message := btrim(new.message);
  new.email := nullif(btrim(coalesce(new.email,'')),''); new.address := nullif(btrim(coalesce(new.address,'')),'');
  new.service := nullif(btrim(coalesce(new.service,'')),'');
  if new.kind <> 'rdv' then new.day := null; new.slot := null; end if;
  if new.kind <> 'devis' then new.photo_url := null; end if;
  if new.photo_url is not null and new.photo_url !~ '^https://rvreusugrtiubqtafgbk\.supabase\.co/storage/v1/object/public/images/up-dupre_devis-[a-z0-9]+-[0-9]+\.(jpg|png|webp)$' then
    raise exception 'Photo invalide.' using errcode = 'P0001';
  end if;
  select data into v_data from dupre.site_content where id = 1;
  if new.kind = 'rdv' then
    if coalesce((v_data -> 'booking' ->> 'open')::boolean, true) = false then
      raise exception 'La prise de rendez-vous en ligne est momentanément fermée : appelez-nous.' using errcode = 'P0001';
    end if;
    if new.day < (now() at time zone 'Europe/Paris')::date or new.day > (now() at time zone 'Europe/Paris')::date + 90 then
      raise exception 'Date de rendez-vous invalide (aujourd''hui à 90 jours).' using errcode = 'P0001';
    end if;
    if extract(isodow from new.day) = 7 then raise exception 'Pas de rendez-vous le dimanche : appelez-nous en cas d''urgence.' using errcode = 'P0001'; end if;
  end if;
  if (select count(*) from dupre.requests where created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Trop de demandes en ce moment, réessayez dans une minute.' using errcode = 'P0001';
  end if;
  v_norm := regexp_replace(new.phone, '[^0-9]', '', 'g');
  if (select count(*) from dupre.requests where regexp_replace(phone,'[^0-9]','','g') = v_norm and created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'Vous avez déjà envoyé plusieurs demandes : nous vous rappelons rapidement.' using errcode = 'P0001';
  end if;
  insert into dupre.customers (name, phone, address) values (new.name, new.phone, new.address)
    on conflict (phone_norm) do update set address = coalesce(excluded.address, dupre.customers.address)
    returning id into v_cid;
  new.customer_id := v_cid;
  return new;
end; $$;
drop trigger if exists trg_requests_before_insert on dupre.requests;
create trigger trg_requests_before_insert before insert on dupre.requests
  for each row execute function dupre.requests_before_insert();

create or replace function dupre.touch_updated()
returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at := now(); return new; end; $$;
drop trigger if exists trg_requests_before_update on dupre.requests;
create trigger trg_requests_before_update before update on dupre.requests
  for each row execute function dupre.touch_updated();

create or replace view dupre.requests_daily with (security_invoker = true) as
select (r.created_at at time zone 'Europe/Paris')::date as day,
       count(*) as total,
       count(*) filter (where r.kind = 'rdv') as rdv,
       count(*) filter (where r.kind = 'devis') as devis,
       count(*) filter (where r.kind = 'message') as messages,
       count(*) filter (where r.status = 'terminé') as done,
       count(*) filter (where r.status = 'annulé') as cancelled
from dupre.requests r group by 1;

-- 3. DROITS + RLS -------------------------------------------------------
revoke all on all tables in schema dupre from anon, authenticated;
revoke execute on all functions in schema dupre from public, anon, authenticated;
grant select on dupre.site_content to anon, authenticated;
grant insert (kind, name, phone, email, address, service, day, slot, message, photo_url, hp) on dupre.requests to anon, authenticated;
grant insert, update on dupre.site_content to authenticated;
grant select on dupre.site_content_history to authenticated;
grant select, update, delete on dupre.requests to authenticated;
grant select, update, delete on dupre.customers to authenticated;
grant select on dupre.requests_daily to authenticated;
grant all on all tables in schema dupre to service_role;

alter table dupre.site_content enable row level security;
alter table dupre.site_content_history enable row level security;
alter table dupre.customers enable row level security;
alter table dupre.requests enable row level security;
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'dupre' loop
    execute format('drop policy if exists %I on dupre.%I', r.policyname, r.tablename);
  end loop; end $$;
create policy "contenu : lecture publique" on dupre.site_content for select to anon, authenticated using (true);
create policy "contenu : ajout patron" on dupre.site_content for insert to authenticated with check (id = 1 and public.is_owner());
create policy "contenu : modification patron" on dupre.site_content for update to authenticated
  using (id = 1 and public.is_owner()) with check (id = 1 and public.is_owner());
create policy "historique : lecture patron" on dupre.site_content_history for select to authenticated using (public.is_owner());
create policy "demandes : envoi depuis le site" on dupre.requests for insert to anon, authenticated with check (status = 'nouveau');
create policy "demandes : patron" on dupre.requests for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "clients : patron" on dupre.customers for all to authenticated using (public.is_owner()) with check (public.is_owner());

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'dupre' and tablename = 'requests') then
    alter publication supabase_realtime add table dupre.requests;
  end if; end $$;

-- 4. PHOTOS DE DEVIS : envoi anonyme limité au bucket « images »,
--    nom strict « up-dupre_devis-<aléa>-<horodatage>.<ext> » (taille/mime limités par le bucket : 6 Mo, jpg/png/webp).
drop policy if exists "images : photo devis dupre (public)" on storage.objects;
create policy "images : photo devis dupre (public)" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'images' and name ~ '^up-dupre_devis-[a-z0-9]{6,12}-[0-9]{13}\.(jpg|png|webp)$');
