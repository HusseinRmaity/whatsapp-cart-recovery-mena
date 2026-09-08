-- ============================================================================
-- Case Study 2 — WhatsApp Abandoned Cart Recovery (MENA) — Core schema
-- Spec: case-study-2-spec.md §4 (Data Model), §5 (workflow behaviour)
-- PLAN step 1.5.
--
-- Runs in the SAME Supabase project as Case Study 1. It ADDS two tables
-- (carts, cart_messages) and ADDS one nullable column to the shared run_logs.
-- It does not modify or drop anything belonging to Case 1.
--
-- Run this in the Supabase SQL editor. Idempotent: safe to re-run.
-- Prerequisite: Case 1's schema.sql has already been applied (this file reuses
-- its public.touch_updated_at() function and its public.run_logs table).
-- ============================================================================

-- gen_random_uuid() lives in pgcrypto; already present from Case 1.
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- carts — one row per Shopify checkout we are tracking
--
-- checkout_token is Shopify's own token and is the single key for BOTH
-- idempotency (spec §8: checkouts/create re-fires on every cart edit) and
-- conversion attribution (orders/create carries the same token). UNIQUE on it
-- is what makes the intake upsert safe.
--
-- Carries the FULL column set now (intake + touch scheduling + attribution)
-- so no migration is needed in Milestones 3/4.
-- ----------------------------------------------------------------------------
create table if not exists public.carts (
  id                    uuid primary key default gen_random_uuid(),

  -- provenance / dedup key
  checkout_token        text not null unique,              -- Shopify's token: dedup + attribution
  shopify_checkout_id   text,                              -- numeric id, for admin links

  -- identity
  customer_first_name   text,
  customer_last_name    text,
  phone                 text,                              -- normalized E.164 — the recovery channel
  email                 text,

  -- locale (same constraint vocabulary as Case 1 leads.language)
  language              text check (language in ('ar','en','fr','mixed')),
  country_code          text,                              -- ISO 3166 alpha-2, joins send_windows
  timezone              text,                              -- IANA identifier

  -- Arabic gender agreement (arabic-master-reference.md §5, ruled for Case 2 2026-08-07).
  -- Inferred once at intake, never per touch — the register must not change
  -- between touch 1 and touch 3. 'unknown' is a first-class value, not a
  -- failure: it routes the model to gender-neutral phrasing and keeps the
  -- deterministic checker strict. NULL on rows predating the migration.
  -- Added 2026-08-07 (migration case2_add_customer_gender).
  customer_gender       text check (customer_gender in ('female','male','unknown')),

  -- cart contents
  cart_items            jsonb,                             -- [{title, quantity, price, image_url}]
  cart_total            numeric,
  currency              text,                              -- AED, SAR, KWD, QAR, USD ... always explicit
  recovery_url          text,                              -- Shopify abandoned-checkout URL

  -- lifecycle (spec §4)
  --   pending_verification -> abandoned -> recovering -> recovered
  --                                                   |-> exhausted
  --                                                   |-> opted_out
  --                                                   |-> undeliverable
  --   converted_before_first_touch = bought before touch 1; we claim NO credit
  --   undeliverable = the number cannot receive WhatsApp at all (added
  --     2026-09-03). Distinct from 'exhausted', which means three touches were
  --     actually delivered, and from 'opted_out', which the customer chose.
  --     Before this existed a dead number was postponed +2h forever and never
  --     closed, so it sat in the open queue for the full 30-day lookback.
  status                text not null default 'pending_verification'
                          check (status in ('pending_verification','abandoned','recovering',
                                            'recovered','exhausted','opted_out',
                                            'converted_before_first_touch','undeliverable')),

  -- touch scheduling
  -- 3-touch hard cap (locked decision #5) enforced HERE as well as in workflow 02,
  -- so a workflow bug can never produce a 4th touch.
  touches_sent          int not null default 0 check (touches_sent between 0 and 3),
  next_touch_at         timestamptz,                       -- null = no touch scheduled (closed or exhausted)

  -- attribution (spec §5, workflow 04)
  recovered_order_id    text,
  recovered_amount      numeric,
  -- Currency of recovered_amount, which is Shopify's shopMoney (the MERCHANT's
  -- currency). Deliberately separate from carts.currency above, which holds the
  -- PRESENTMENT currency the customer saw at checkout. A Lebanese customer can
  -- pay 42,663,000 LBP against an order the merchant books as 1,747.75 AED;
  -- without this column the row reads "1747.75 LBP" and the daily digest's
  -- "recovered revenue by currency" silently reports the wrong currency.
  -- Added 2026-08-03 (migration case2_add_recovered_currency).
  recovered_currency    text,

  -- suppression
  opted_out             boolean not null default false,

  -- WhatsApp consent (added 2026-09-03, migration case2_add_opt_in_fields).
  -- CORRECTS a wrong assumption, not a new feature: the spec used to claim that
  -- submitting a phone at checkout was implicit opt-in under Meta's
  -- utility-message rules. It is not, and touch 2 carries a discount, which is
  -- marketing. A real deployment must show an explicit, unticked WhatsApp
  -- opt-in control at checkout and store BOTH the moment it was ticked and the
  -- exact wording that was on screen -- a timestamp with no wording attached to
  -- it proves nothing, and the wording cannot be reconstructed later.
  -- The demo seeds these on dev-store carts ('seeded_demo'); no checkout
  -- checkbox is built. See spec 7 and docs/decisions.md 2026-09-03.
  whatsapp_opt_in_at    timestamptz,
  opt_in_source         text check (opt_in_source in
                          ('checkout_checkbox','seeded_demo','imported')),
  opt_in_text           text,

  -- Last inbound message from this customer, stamped by workflow 03 (added
  -- 2026-09-03). Drives the session-vs-template classification in workflow 02:
  -- inside 24h a reply may be answered free-form, outside it a production
  -- deployment pays for a Meta template. Null means never replied.
  -- Deliberately a LOWER BOUND: the WhatsApp service window belongs to the
  -- conversation with the business number, and this build shares one Twilio
  -- sandbox number across three case studies, so a reply routed to Case 1
  -- opens the real window without stamping any Case 2 cart. Erring this way
  -- can only over-report templates, never under-report them.
  last_inbound_at       timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_carts_phone      on public.carts (phone);
create index if not exists idx_carts_status     on public.carts (status);
create index if not exists idx_carts_created_at on public.carts (created_at);
-- checkout_token already has a unique index from the UNIQUE constraint.

-- The sweep index. Workflow 02 runs every 15 minutes and asks only
-- "which carts are due?" — the partial index keeps that query touching just the
-- open queue instead of the whole table, however large history grows.
create index if not exists idx_carts_next_touch_at
  on public.carts (next_touch_at)
  where next_touch_at is not null;

-- ----------------------------------------------------------------------------
-- Additive migration for a database that already exists (2026-09-03).
--
-- `create table if not exists` above is a no-op against a live table, so the
-- columns and the widened status CHECK have to be applied separately. Same
-- pattern as the run_logs.cart_id migration further down. Idempotent: every
-- statement is `if not exists` or a drop-then-add, so re-running the whole
-- schema file changes nothing.
-- ----------------------------------------------------------------------------
alter table public.carts
  add column if not exists whatsapp_opt_in_at timestamptz,
  add column if not exists opt_in_source      text,
  add column if not exists opt_in_text        text,
  add column if not exists last_inbound_at    timestamptz;

alter table public.carts drop constraint if exists carts_opt_in_source_check;
alter table public.carts add  constraint carts_opt_in_source_check
  check (opt_in_source in ('checkout_checkbox','seeded_demo','imported'));

-- The status CHECK is REPLACED, not extended -- Postgres has no "add a value"
-- for a text CHECK the way it does for an enum. Widening only, so no existing
-- row can be invalidated by it.
alter table public.carts drop constraint if exists carts_status_check;
alter table public.carts add  constraint carts_status_check
  check (status in ('pending_verification','abandoned','recovering',
                    'recovered','exhausted','opted_out',
                    'converted_before_first_touch','undeliverable'));

-- ----------------------------------------------------------------------------
-- cart_messages — every WhatsApp message sent or received, one row each
-- Mirrors Case 1's conversations table.
-- touch_number is null for inbound replies; 1/2/3 for outbound touches.
-- ----------------------------------------------------------------------------
create table if not exists public.cart_messages (
  id                uuid primary key default gen_random_uuid(),
  cart_id           uuid not null references public.carts(id) on delete cascade,
  direction         text not null check (direction in ('inbound','outbound')),
  touch_number      int  check (touch_number between 1 and 3),   -- null for replies
  message           text not null,
  twilio_message_id text,
  -- Would this send have been billed as a free-form session message or as a
  -- paid Meta template? (added 2026-09-03). Derived from carts.last_inbound_at
  -- at send time. RECORDED, NOT ACTED ON: the Twilio sandbox has no templates,
  -- so every message here is already free-form and a second send branch would
  -- be a limb no test ever exercises differently. Null on inbound rows and on
  -- rows written before the column existed.
  message_class     text check (message_class in ('session','template')),
  created_at        timestamptz not null default now()
);

create index if not exists idx_cart_messages_cart_id   on public.cart_messages (cart_id);
create index if not exists idx_cart_messages_twilio_id on public.cart_messages (twilio_message_id);

-- Additive migration for an existing database (2026-09-03), same reasoning as
-- the carts block above. Must sit AFTER the create table, not with the other
-- migration statements, or a from-scratch run alters a table that does not
-- exist yet.
alter table public.cart_messages
  add column if not exists message_class text;

alter table public.cart_messages drop constraint if exists cart_messages_message_class_check;
alter table public.cart_messages add  constraint cart_messages_message_class_check
  check (message_class in ('session','template'));

-- ---------------------------------------------------------------------------
-- case2_suppressions — phone-level opt-out. Defined HERE, before
-- case2_upsert_cart, because that function's SQL body references it and
-- language-sql bodies are validated at creation time.
-- ---------------------------------------------------------------------------
create table if not exists public.case2_suppressions (
  phone         text primary key,
  suppressed_at timestamptz not null default now(),
  source        text not null default 'keyword',
  cart_id       uuid references public.carts(id) on delete set null,
  keyword_hit   text,
  note          text
);

comment on table public.case2_suppressions is
  'Phone-level opt-out. One row per phone; presence means send nothing, ever, including to carts created after the opt-out.';

-- Same posture as carts/cart_messages: RLS on, no policies. n8n uses the
-- service_role key and bypasses RLS; a leaked anon key cannot read phone numbers.
alter table public.case2_suppressions enable row level security;

-- Idempotency for INBOUND replies (M5.2b).
-- Twilio retries an inbound webhook it does not get a timely 200 for. Before
-- this index a retry produced a second cart_messages row AND a second holding
-- reply to the customer for one message they sent once.
--
-- Workflow 03 inserts first and treats a 409 as "already handled, stop", so the
-- INSERT itself is the dedup lock. That is one mechanism with no read-then-write
-- race, unlike a SELECT-then-INSERT which two concurrent retries can both pass.
--
-- Partial: outbound touches share this column, and the guarantee we need is only
-- "one inbound row per Twilio MessageSid".
create unique index if not exists uniq_cart_messages_inbound_sid
  on public.cart_messages (twilio_message_id)
  where direction = 'inbound' and twilio_message_id is not null;

-- ----------------------------------------------------------------------------
-- run_logs — SHARED with Case 1. Additive change only.
--
-- Case 1 rows carry lead_id; Case 2 rows carry cart_id. A row has one or the
-- other, never both. Both are nullable, so neither project's inserts break the
-- other's. No backfill, no Case 1 re-test required.
-- ----------------------------------------------------------------------------
alter table public.run_logs
  add column if not exists cart_id uuid references public.carts(id) on delete set null;

create index if not exists idx_run_logs_cart_id on public.run_logs (cart_id);

-- ----------------------------------------------------------------------------
-- updated_at auto-touch trigger on carts
--
-- Reuses public.touch_updated_at() created by Case 1's schema.sql (it already
-- has the hardened `set search_path = ''` per Supabase linter 0011).
-- Deliberately NOT redefined here — one definition, one place to fix.
-- ----------------------------------------------------------------------------
drop trigger if exists trg_carts_touch_updated_at on public.carts;
create trigger trg_carts_touch_updated_at
  before update on public.carts
  for each row
  execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- Same posture as Case 1: RLS enabled with NO policies. n8n connects with the
-- service_role key, which bypasses RLS entirely, so a leaked anon/public key
-- cannot read customer phone numbers or cart contents. (See docs/decisions.md.)
-- ----------------------------------------------------------------------------
alter table public.carts         enable row level security;
alter table public.cart_messages enable row level security;

-- ============================================================================
-- FUNCTIONS
--
-- Added 2026-08-04 (M5.3b). Both functions existed only inside Supabase until
-- then, which meant this repo could NOT rebuild the database from scratch —
-- the schema was version-controlled and the logic operating on it was not.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- case2_upsert_cart — the intake write (workflow 01), applied as ONE atomic
-- INSERT ... ON CONFLICT.
--
-- Locked decision #6: a cart UPDATE must never reset the touch schedule.
-- Shopify re-fires checkouts/create on every cart edit, so a plain PostgREST
-- upsert (which writes every column you send) would push next_touch_at forward
-- on each edit and a customer who fiddles with their cart would never be
-- messaged at all. Splitting it into select-then-write in n8n would work but
-- opens a read-modify-write race against the 15-minute sweep.
--
-- Two sub-rules inside it:
--   * Locale is STICKY once messaging starts — language/country/timezone and
--     (since 2026-08-07) customer_gender are correctable while touches_sent = 0
--     and frozen afterwards, so a later payload cannot flip a customer from
--     Arabic to English, or from one grammatical register to another,
--     mid-sequence (global CLAUDE.md: never force a language switch
--     mid-conversation).
--   * Phone is NOT sticky — it is the delivery channel, so a customer
--     correcting it on a later edit wins.
--
-- Never touched by the update branch: next_touch_at, touches_sent, status,
-- opted_out, recovered_order_id, recovered_amount.
--
-- was_inserted uses the xmax = 0 trick so the workflow can log created-vs-updated
-- without a second query.
--
-- ⚠ CHANGING THE PARAMETER LIST REQUIRES A DROP, NOT A CREATE OR REPLACE.
-- Adding a defaulted parameter creates an OVERLOAD rather than replacing the
-- function, and PostgREST then fails every intake call as ambiguous. The
-- 2026-08-07 gender migration drops the old signature and creates the new one
-- inside a single transaction so intake is never pointed at a missing function.
-- ----------------------------------------------------------------------------
drop function if exists public.case2_upsert_cart(
  text,text,text,text,text,text,text,text,text,jsonb,numeric,text,text,integer);

-- ...and the 15-arg signature that replaced it (pre-consent, up to 2026-09-03).
-- Adding the three opt-in parameters below is exactly the overload trap the
-- comment above warns about: without this drop, BOTH signatures exist and
-- PostgREST answers every intake call "could not choose the best candidate
-- function". A dead intake path, not a wrong value.
drop function if exists public.case2_upsert_cart(
  text,text,text,text,text,text,text,text,text,text,jsonb,numeric,text,text,integer);

create or replace function public.case2_upsert_cart(
  p_checkout_token      text,
  p_shopify_checkout_id text    default null,
  p_first_name          text    default null,
  p_last_name           text    default null,
  p_phone               text    default null,
  p_email               text    default null,
  p_language            text    default null,
  p_country_code        text    default null,
  p_timezone            text    default null,
  p_customer_gender     text    default null,
  p_cart_items          jsonb   default null,
  p_cart_total          numeric default null,
  p_currency            text    default null,
  p_recovery_url        text    default null,
  p_delay_minutes       integer default 45,
  -- WhatsApp consent, added 2026-09-03. Appended rather than slotted in beside
  -- the identity fields on purpose: PostgREST calls this by NAME, so position
  -- is free, and appending keeps the drop-signature above readable.
  p_whatsapp_opt_in_at  timestamptz default null,
  p_opt_in_source       text    default null,
  p_opt_in_text         text    default null
)
returns table(id uuid, was_inserted boolean, status text, next_touch_at timestamptz, touches_sent integer)
language sql
set search_path to ''
as $function$
  insert into public.carts as c (
    checkout_token, shopify_checkout_id,
    customer_first_name, customer_last_name, phone, email,
    language, country_code, timezone, customer_gender,
    cart_items, cart_total, currency, recovery_url,
    whatsapp_opt_in_at, opt_in_source, opt_in_text,
    status, next_touch_at, touches_sent, opted_out
  )
  values (
    p_checkout_token, p_shopify_checkout_id,
    p_first_name, p_last_name, p_phone, p_email,
    p_language, p_country_code, p_timezone, p_customer_gender,
    p_cart_items, p_cart_total, p_currency, p_recovery_url,
    p_whatsapp_opt_in_at, p_opt_in_source, p_opt_in_text,
    -- A cart created by a phone that already opted out is BORN SILENT
    -- (2026-09-02). Without this, phone-level suppression leaks on the one path
    -- per-cart opt-out could never cover: the customer opts out, checks out
    -- again, and the brand-new cart is armed with a fresh 45-minute schedule.
    case when exists (select 1 from public.case2_suppressions s where s.phone = p_phone)
         then 'opted_out' else 'pending_verification' end,
    case when exists (select 1 from public.case2_suppressions s where s.phone = p_phone)
         then null else now() + make_interval(mins => p_delay_minutes) end,
    0,
    exists (select 1 from public.case2_suppressions s where s.phone = p_phone)
  )
  on conflict (checkout_token) do update set
    cart_items          = coalesce(excluded.cart_items, c.cart_items),
    cart_total          = coalesce(excluded.cart_total, c.cart_total),
    currency            = coalesce(excluded.currency, c.currency),
    recovery_url        = coalesce(excluded.recovery_url, c.recovery_url),
    shopify_checkout_id = coalesce(excluded.shopify_checkout_id, c.shopify_checkout_id),
    phone               = coalesce(excluded.phone, c.phone),
    email               = coalesce(excluded.email, c.email),
    customer_first_name = coalesce(excluded.customer_first_name, c.customer_first_name),
    customer_last_name  = coalesce(excluded.customer_last_name, c.customer_last_name),
    -- Correctable before the first message; frozen after it.
    language     = case when c.touches_sent = 0
                        then coalesce(excluded.language, c.language)
                        else coalesce(c.language, excluded.language) end,
    country_code = case when c.touches_sent = 0
                        then coalesce(excluded.country_code, c.country_code)
                        else coalesce(c.country_code, excluded.country_code) end,
    timezone     = case when c.touches_sent = 0
                        then coalesce(excluded.timezone, c.timezone)
                        else coalesce(c.timezone, excluded.timezone) end,
    -- Same stickiness as locale, and for the same reason: a cart edit must not
    -- flip the grammatical register a customer has already been addressed with.
    customer_gender = case when c.touches_sent = 0
                        then coalesce(excluded.customer_gender, c.customer_gender)
                        else coalesce(c.customer_gender, excluded.customer_gender) end,
    -- CONSENT IS FIRST-WRITE-WINS, and is NOT part of the correctable group
    -- above. `coalesce(c.x, excluded.x)` records consent on the first checkout
    -- that carries it and never overwrites it afterwards, so a later cart edit
    -- can neither erase the consent record nor silently restamp it with a newer
    -- time than the one the customer actually saw the wording at. The whole
    -- point of storing the timestamp and the text is that they are evidence.
    whatsapp_opt_in_at = coalesce(c.whatsapp_opt_in_at, excluded.whatsapp_opt_in_at),
    opt_in_source      = coalesce(c.opt_in_source,      excluded.opt_in_source),
    opt_in_text        = coalesce(c.opt_in_text,        excluded.opt_in_text)
    -- Still never updated: next_touch_at, touches_sent, status, opted_out,
    -- recovered_order_id, recovered_amount, last_inbound_at (workflow 03 owns
    -- that one -- an intake write must never move the service-window clock).
  returning c.id, (c.xmax = 0) as was_inserted, c.status, c.next_touch_at, c.touches_sent;
$function$;

-- ----------------------------------------------------------------------------
-- case2_daily_digest — one call returns the whole day for workflow 05.
--
-- The workflow sends a window; the DB does the aggregation; no raw customer rows
-- cross the wire. Same contract as Case 1's case1_daily_digest.
--
-- Two things it deliberately does NOT do:
--   1. It never sums money across currencies. A Lebanese order is booked by the
--      merchant in AED while the customer paid in LBP, so a single "revenue"
--      figure would be a fiction. Revenue is grouped by recovered_currency.
--   2. It never counts converted_before_first_touch as a recovery (locked
--      decision #9). Those orders get their own line so the operator sees them
--      without the system claiming credit for them.
--
-- run_logs is shared with Case 1, so every count filters on the Case 2 workflow
-- names. touches_total counts recovery touches only — the opt-out confirmation
-- and the holding reply carry touch_number = null and are reported separately
-- (found by cross-checking the first digest run against direct SQL).
-- ----------------------------------------------------------------------------
create or replace function public.case2_daily_digest(
  p_start timestamptz,
  p_end   timestamptz
)
returns json
language sql
stable
set search_path to ''
as $function$
  with c2 as (
    select * from public.run_logs
    where created_at >= p_start and created_at < p_end
      and workflow_name in (
        '00 - Health Check C2', '01 - Checkout Intake', '02 - Verifier & Touch Sender',
        '03r - Inbound Router', '03 - Reply Handler C2', '04 - Conversion Tracker',
        '05 - Daily Digest C2'
      )
  ),
  closed as (
    select status, recovered_amount, recovered_currency
    from public.carts
    where updated_at >= p_start and updated_at < p_end
      and status in ('recovered', 'exhausted', 'opted_out', 'converted_before_first_touch',
                     'undeliverable')
  )
  select json_build_object(
    'window_start', p_start,
    'window_end',   p_end,

    'carts_created', (
      select count(*) from public.carts
      where created_at >= p_start and created_at < p_end
    ),
    'cart_updates',   (select count(*) from c2 where step_name = 'cart_updated'),
    'no_phone_skips', (select count(*) from c2 where step_name = 'no_phone_skip'),
    'hmac_failures',  (select count(*) from c2 where step_name = 'hmac_fail'),

    'touches_total', (
      select count(*) from public.cart_messages
      where created_at >= p_start and created_at < p_end
        and direction = 'outbound' and touch_number is not null
    ),
    'touches_by_number', (
      select coalesce(json_object_agg(touch_number, c), '{}'::json) from (
        select touch_number, count(*) c
        from public.cart_messages
        where created_at >= p_start and created_at < p_end
          and direction = 'outbound' and touch_number is not null
        group by touch_number
      ) t
    ),
    'auto_replies_sent', (
      select count(*) from public.cart_messages
      where created_at >= p_start and created_at < p_end
        and direction = 'outbound' and touch_number is null
    ),
    'deferrals',            (select count(*) from c2 where step_name = 'touch_deferred_send_window'),
    'send_failures',        (select count(*) from c2 where step_name = 'twilio_send_failed'),
    'skipped_api_failure',  (select count(*) from c2 where step_name = 'conversion_check_failed'),

    'replies_received', (
      select count(*) from public.cart_messages
      where created_at >= p_start and created_at < p_end and direction = 'inbound'
    ),
    'replies_handled',   (select count(*) from c2 where step_name = 'reply_handled'),
    'opt_outs',          (select count(*) from c2 where step_name = 'opt_out'),
    'duplicate_inbound', (select count(*) from c2 where step_name = 'duplicate_inbound'),

    'recovered_orders', (select count(*) from closed where status = 'recovered'),
    'recovered_revenue', (
      select coalesce(json_object_agg(cur, amt), '{}'::json) from (
        select coalesce(recovered_currency, 'unknown') cur, sum(coalesce(recovered_amount, 0)) amt
        from closed where status = 'recovered'
        group by 1
      ) t
    ),
    'converted_before_first_touch', (select count(*) from closed where status = 'converted_before_first_touch'),
    'pre_touch_revenue', (
      select coalesce(json_object_agg(cur, amt), '{}'::json) from (
        select coalesce(recovered_currency, 'unknown') cur, sum(coalesce(recovered_amount, 0)) amt
        from closed where status = 'converted_before_first_touch'
        group by 1
      ) t
    ),
    'exhausted',        (select count(*) from closed where status = 'exhausted'),
    'opted_out_carts',  (select count(*) from closed where status = 'opted_out'),
    -- Carts closed because the number cannot receive WhatsApp at all. Reported
    -- as its own number rather than folded into exhausted, because "we sent
    -- three messages and they did not buy" and "we could not reach them at all"
    -- are different problems with different fixes.
    'undeliverable',    (select count(*) from closed where status = 'undeliverable'),

    -- Would each touch have been billed as a free-form session message or as a
    -- paid Meta template? The sandbox charges neither, so this is the cost
    -- model a client deployment would run, made visible now rather than
    -- estimated later. Rows written before message_class existed count as null.
    'touches_by_message_class', (
      select coalesce(json_object_agg(coalesce(message_class, 'unclassified'), c), '{}'::json) from (
        select message_class, count(*) c
        from public.cart_messages
        where created_at >= p_start and created_at < p_end
          and direction = 'outbound' and touch_number is not null
        group by message_class
      ) t
    ),

    -- Recovery rate over ATTEMPTS THAT CLOSED in this window: of the carts we
    -- actually tried to recover and that reached an end state, how many bought.
    -- converted_before_first_touch is excluded from both halves — we never tried.
    -- 'undeliverable' is excluded for the mirror-image reason: we tried and the
    -- channel did not exist, so the customer never read a word of the copy.
    -- Leaving it in would move the headline number for a reason that has
    -- nothing to do with the messages or the timing, which is what this rate is
    -- for. It is counted separately above, so nothing is hidden by the choice —
    -- a run of dead numbers shows up as its own line rather than as a slump.
    'recovery_attempts_closed', (
      select count(*) from closed where status in ('recovered', 'exhausted', 'opted_out')
    ),
    'recovery_rate_pct', (
      select case when count(*) = 0 then null
        else round(100.0 * count(*) filter (where status = 'recovered') / count(*), 1)
      end
      from closed where status in ('recovered', 'exhausted', 'opted_out')
    ),

    'sweeps_logged',   (select count(*) from c2 where step_name = 'sweep_summary'),
    'sweeps_degraded', (select count(*) from c2 where step_name = 'sweep_summary' and status = 'partial'),
    'runs_total',      (select count(*) from c2),
    'runs_partial',    (select count(*) from c2 where status = 'partial'),
    'runs_failed',     (select count(*) from c2 where status = 'failed'),
    'errors', (
      select coalesce(json_agg(e), '[]'::json) from (
        select workflow_name as workflow, step_name as step,
               error_message as error, created_at as at
        from c2 where status = 'failed'
        order by created_at desc
        limit 5
      ) e
    )
  );
$function$;

-- ============================================================================
-- PHONE-LEVEL OPT-OUT SUPPRESSION (added 2026-09-02)
--
-- Opt-out used to be PER CART: workflow 03 patched one cart id and the sweep
-- filtered carts.opted_out per row. A customer holding two live carts who sent
-- توقف had ONE suppressed and kept receiving touches from the other, and a NEW
-- checkout from that phone was messaged as if they had never opted out. Found
-- on 2026-09-02 while retesting the stop action.
--
-- The compliance boundary is now the PHONE, and it lives here rather than in a
-- workflow — the same reasoning as carts_touches_sent_check: a future bug in any
-- workflow must still not be able to message someone who opted out.
--
-- carts.opted_out is KEPT. It still records which cart the STOP arrived on and
-- still drives the existing writer guards in workflows 02 and 04; this table is
-- the outer boundary, not a replacement.
-- ============================================================================



-- ----------------------------------------------------------------------------
-- case2_due_carts — the sweep's queue, carrying the suppression anti-join.
--
-- Workflow 02's `Fetch Due Carts` calls this instead of GET /carts. PostgREST
-- cannot express "and this phone is not in another table", so the queue has to
-- be a function. Returns setof carts, so `Prepare Cart Queue` downstream sees
-- exactly the row shape it saw before.
--
-- UN-SUPPRESSING A PHONE (needed before recording a demo on a handset that has
-- ever sent توقف / STOP):
--     delete from public.case2_suppressions where phone = '+961...';
-- ----------------------------------------------------------------------------
create or replace function public.case2_due_carts(p_limit integer default 50)
returns setof public.carts
language sql
stable
set search_path to ''
as $function$
  select c.*
  from public.carts c
  where c.next_touch_at <= now()
    and c.status in ('pending_verification', 'abandoned', 'recovering')
    and c.opted_out is false
    and not exists (
      select 1 from public.case2_suppressions s where s.phone = c.phone
    )
  order by c.next_touch_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$function$;

comment on function public.case2_due_carts(integer) is
  'Carts due for a touch, excluding any phone in case2_suppressions. The limit is clamped to 200 (global standard #8: no unbounded pagination).';

-- One-time backfill of phones that had already opted out per-cart. Safe to
-- re-run, but note it will RE-SUPPRESS a phone you deliberately cleared, so it
-- is a migration step and not a maintenance job.
--   insert into public.case2_suppressions (phone, source, cart_id, note)
--   select distinct on (c.phone) c.phone, 'backfill', c.id, 'backfilled from carts.opted_out'
--   from public.carts c where c.opted_out is true and c.phone is not null
--   order by c.phone, c.created_at desc
--   on conflict (phone) do nothing;

-- NOTE: case2_upsert_cart (above) also consults this table — a cart created by a
-- suppressed phone is born status 'opted_out' with a null schedule. That is the
-- one path per-cart opt-out could never cover.

-- ----------------------------------------------------------------------------
-- Not created here — already exists from Case 1 and reused as-is:
--   public.send_windows   seeded with AE SA QA KW BH OM EG JO LB MA
--                         (db/seed-send-windows.sql in case-study-1-real-estate)
--                         covers every Case 2 target market. No re-seed needed.
--   public.run_logs       observability table, extended above.
--   public.touch_updated_at()
-- ----------------------------------------------------------------------------
