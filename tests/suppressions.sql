-- ============================================================================
-- tests/suppressions.sql — phone-level opt-out suppression
--
--   Run in the Supabase SQL editor, or:
--   psql "$SUPABASE_DB_URL" -f tests/suppressions.sql
--
-- Raises an exception on the first failed assertion and rolls nothing back
-- silently — a clean run prints "ALL SUPPRESSION ASSERTIONS PASSED".
--
-- WHY THIS EXISTS
-- Until 2026-09-02 opt-out was PER CART: `Suppress Cart` patched one cart id and
-- the sweep filtered `opted_out` per row. A customer holding two live carts who
-- sent توقف had ONE suppressed and kept receiving touches from the other, and a
-- NEW checkout from that phone was messaged as if they had never opted out.
--
-- The compliance boundary is now the PHONE, and it lives in the database rather
-- than in a workflow — same reasoning as the carts_touches_sent_check constraint:
-- a future bug in any workflow still must not be able to message someone who
-- opted out.
--
-- Test phones are +9999000000xx, which cannot collide with a real MENA number.
-- ============================================================================

do $$
declare
  v_supp_phone  text := '+99990000001';   -- opted out
  v_clean_phone text := '+99990000002';   -- never opted out
  v_cart_id     uuid;
  v_status      text;
  v_opted       boolean;
  v_next        timestamptz;
  v_count       integer;
  v_relrowsec   boolean;
begin
  -- ---------------------------------------------------------------- cleanup --
  delete from public.carts             where phone in (v_supp_phone, v_clean_phone);
  delete from public.case2_suppressions where phone in (v_supp_phone, v_clean_phone);

  -- ------------------------------------------------- 1. table + PK on phone --
  select count(*) into v_count
  from information_schema.tables
  where table_schema = 'public' and table_name = 'case2_suppressions';
  if v_count <> 1 then
    raise exception 'FAIL 1: public.case2_suppressions does not exist';
  end if;

  select count(*) into v_count
  from information_schema.table_constraints tc
  join information_schema.key_column_usage k
    on k.constraint_name = tc.constraint_name and k.table_schema = tc.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'case2_suppressions'
    and tc.constraint_type = 'PRIMARY KEY'
    and k.column_name = 'phone';
  if v_count <> 1 then
    raise exception 'FAIL 2: phone is not the primary key (one row per phone, idempotent re-STOP)';
  end if;

  -- --------------------------------------------------- 2. RLS is enabled ----
  select c.relrowsecurity into v_relrowsec
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'case2_suppressions';
  if v_relrowsec is not true then
    raise exception 'FAIL 3: RLS not enabled on case2_suppressions (it stores customer phone numbers)';
  end if;

  -- -------------------------------- 3. a NEW cart from a suppressed phone ---
  --    is born silent. This is the case per-cart opt-out could never cover.
  insert into public.case2_suppressions (phone, source) values (v_supp_phone, 'manual');

  -- `case2_upsert_cart` returns (id, was_inserted, status, next_touch_at,
  -- touches_sent) -- NOT opted_out. Read the flag off the row it just wrote.
  -- This harness selected it from the function result until 2026-09-08, so it
  -- errored at this line instead of asserting anything: `column "opted_out"
  -- does not exist`. A SQL harness that cannot PARSE is indistinguishable from
  -- one that passes if nobody runs it, which is exactly what happened across two
  -- rounds that reported "26 SQL assertions, all green".
  select id, status, next_touch_at
    into v_cart_id, v_status, v_next
  from public.case2_upsert_cart(
    p_checkout_token := 'supptest-token-001',
    p_phone          := v_supp_phone,
    p_language       := 'ar',
    p_country_code   := 'LB',
    p_cart_total     := 1000,
    p_currency       := 'LBP'
  );

  select opted_out into v_opted from public.carts where id = v_cart_id;
  if v_opted is not true then
    raise exception 'FAIL 4: cart from a suppressed phone was born opted_out=%, expected true', v_opted;
  end if;
  if v_next is not null then
    raise exception 'FAIL 5: cart from a suppressed phone was born with next_touch_at=%, expected null', v_next;
  end if;
  if v_status <> 'opted_out' then
    raise exception 'FAIL 6: cart from a suppressed phone was born status=%, expected opted_out', v_status;
  end if;

  -- ------------------------------- 4. a cart from a CLEAN phone is normal ---
  select id, status, next_touch_at
    into v_cart_id, v_status, v_next
  from public.case2_upsert_cart(
    p_checkout_token := 'supptest-token-002',
    p_phone          := v_clean_phone,
    p_language       := 'ar',
    p_country_code   := 'LB',
    p_cart_total     := 1000,
    p_currency       := 'LBP',
    p_delay_minutes  := 45
  );

  select opted_out into v_opted from public.carts where id = v_cart_id;
  if v_opted is not false then
    raise exception 'FAIL 7: clean phone cart born opted_out=%, expected false', v_opted;
  end if;
  if v_next is null then
    raise exception 'FAIL 8: clean phone cart born with a null schedule; suppression leaked to a clean phone';
  end if;
  if v_status <> 'pending_verification' then
    raise exception 'FAIL 9: clean phone cart born status=%, expected pending_verification', v_status;
  end if;

  -- ------------------------------ 5. the sweep RPC excludes suppressed -----
  --    Force BOTH carts due and open, then ask the RPC what it would send.
  update public.carts
     set status = 'abandoned', opted_out = false, next_touch_at = now() - interval '1 minute'
   where phone in (v_supp_phone, v_clean_phone);

  select count(*) into v_count
  from public.case2_due_carts(50) d
  where d.phone = v_supp_phone;
  if v_count <> 0 then
    raise exception 'FAIL 10: case2_due_carts returned % row(s) for a SUPPRESSED phone, expected 0', v_count;
  end if;

  select count(*) into v_count
  from public.case2_due_carts(50) d
  where d.phone = v_clean_phone;
  if v_count <> 1 then
    raise exception 'FAIL 11: case2_due_carts returned % row(s) for a CLEAN due cart, expected 1', v_count;
  end if;

  -- ------------------------------------- 6. the limit is honoured ----------
  select count(*) into v_count from public.case2_due_carts(1);
  if v_count > 1 then
    raise exception 'FAIL 12: case2_due_carts(1) returned % rows; the pagination cap is not applied', v_count;
  end if;

  -- ------------------------- 7. re-STOP on the same phone is idempotent ----
  insert into public.case2_suppressions (phone, source)
  values (v_supp_phone, 'keyword')
  on conflict (phone) do nothing;
  select count(*) into v_count from public.case2_suppressions where phone = v_supp_phone;
  if v_count <> 1 then
    raise exception 'FAIL 13: repeat STOP produced % suppression rows for one phone, expected 1', v_count;
  end if;

  -- ---------------------------------------------------------------- cleanup --
  delete from public.carts              where phone in (v_supp_phone, v_clean_phone);
  delete from public.case2_suppressions where phone in (v_supp_phone, v_clean_phone);

  raise notice 'ALL SUPPRESSION ASSERTIONS PASSED';
end $$;
