-- ============================================================================
-- tests/opt-in-and-delivery.sql — WhatsApp consent fields, the service-window
-- stamp, and the `undeliverable` terminal cart state.
--
--   Run in the Supabase SQL editor, or:
--   psql "$SUPABASE_DB_URL" -f tests/opt-in-and-delivery.sql
--
-- Raises an exception on the first failed assertion and rolls nothing back
-- silently — a clean run prints "ALL OPT-IN / DELIVERY ASSERTIONS PASSED".
--
-- WHY THIS EXISTS
--
-- 1. CONSENT. The spec used to assert that submitting a phone at checkout was
--    implicit opt-in for recovery messages "per Meta's utility-message rules".
--    That is wrong: touch 2 carries a discount code, which is a MARKETING
--    message, and utility category does not launder it. A real deployment needs
--    an explicit, unticked opt-in control at checkout, and it must store both
--    the moment it was ticked and the exact wording shown. This file asserts
--    the columns exist to hold that evidence.
--
-- 2. THE OVERLOAD TRAP. Adding those three parameters to case2_upsert_cart is
--    precisely the failure the schema file warns about in capitals: a defaulted
--    parameter added with CREATE OR REPLACE produces a second OVERLOAD rather
--    than replacing the function, and PostgREST then refuses every intake call
--    as ambiguous. That is a dead intake path, not a wrong value, and no
--    workflow test can see it. Assertion 6 is the reason this file exists.
--
-- 3. UNDELIVERABLE. Until 2026-09-03 a number that cannot receive WhatsApp was
--    postponed +2h and retried forever, sitting in the open queue for the full
--    30-day lookback and never closing. It is now a terminal state, and it is
--    deliberately kept OUT of the recovery-rate denominator: we tried and the
--    channel did not exist, so the customer never read a word of the copy.
--    Assertion 11 pins that down, because it is the kind of choice a later edit
--    "tidies up" without noticing it moves the headline number.
--
-- Test phones are +9999000000xx, which cannot collide with a real MENA number.
-- Same convention as tests/suppressions.sql.
-- ============================================================================

do $$
declare
  v_phone_a   text := '+99990000010';   -- undeliverable cart
  v_phone_b   text := '+99990000011';   -- consent cart
  v_tok_a     text := 'TESTTOKEN-UNDELIVERABLE-0010';
  v_tok_b     text := 'TESTTOKEN-CONSENT-0011';
  v_cart_a    uuid;
  v_cart_b    uuid;
  v_count     integer;
  v_type      text;
  v_txt       text;
  v_ts        timestamptz;
  v_before    json;
  v_after     json;
  v_start     timestamptz := now() - interval '1 hour';
  v_end       timestamptz := now() + interval '1 hour';
begin
  -- ---------------------------------------------------------------- cleanup --
  delete from public.carts              where phone in (v_phone_a, v_phone_b)
                                           or checkout_token in (v_tok_a, v_tok_b);
  delete from public.case2_suppressions where phone in (v_phone_a, v_phone_b);

  -- ------------------------------------------- 1. consent columns exist ------
  select data_type into v_type from information_schema.columns
   where table_schema = 'public' and table_name = 'carts'
     and column_name = 'whatsapp_opt_in_at';
  if v_type is distinct from 'timestamp with time zone' then
    raise exception 'FAIL 1: carts.whatsapp_opt_in_at missing or not timestamptz (got %)',
      coalesce(v_type, '<absent>');
  end if;

  select count(*) into v_count from information_schema.columns
   where table_schema = 'public' and table_name = 'carts'
     and column_name in ('opt_in_source', 'opt_in_text') and data_type = 'text';
  if v_count <> 2 then
    raise exception 'FAIL 1b: carts.opt_in_source / opt_in_text missing or not text (found %)', v_count;
  end if;

  -- --------------------------------------- 2. last_inbound_at exists ---------
  select data_type into v_type from information_schema.columns
   where table_schema = 'public' and table_name = 'carts'
     and column_name = 'last_inbound_at';
  if v_type is distinct from 'timestamp with time zone' then
    raise exception 'FAIL 2: carts.last_inbound_at missing or not timestamptz (got %)',
      coalesce(v_type, '<absent>');
  end if;

  -- ------------------------------- 3. cart_messages.message_class exists -----
  select data_type into v_type from information_schema.columns
   where table_schema = 'public' and table_name = 'cart_messages'
     and column_name = 'message_class';
  if v_type is distinct from 'text' then
    raise exception 'FAIL 3: cart_messages.message_class missing or not text (got %)',
      coalesce(v_type, '<absent>');
  end if;

  -- ------------------------------------ 4. opt_in_source CHECK accepts 3 -----
  insert into public.carts (checkout_token, phone, opt_in_source)
  values (v_tok_b, v_phone_b, 'seeded_demo')
  returning id into v_cart_b;

  update public.carts set opt_in_source = 'checkout_checkbox' where id = v_cart_b;
  update public.carts set opt_in_source = 'imported'          where id = v_cart_b;
  update public.carts set opt_in_source = 'seeded_demo'       where id = v_cart_b;

  -- ...and rejects a fourth. A CHECK that accepts anything is not a CHECK.
  begin
    update public.carts set opt_in_source = 'vibes' where id = v_cart_b;
    raise exception 'FAIL 4: opt_in_source accepted an invalid value';
  exception
    when check_violation then null;   -- expected
  end;

  -- ------------------------------- 5. consent round-trips through upsert -----
  -- The three values must survive the RPC, and a SECOND upsert on the same
  -- token must NOT restamp them: consent is evidence, first write wins.
  delete from public.carts where checkout_token = v_tok_b;

  perform public.case2_upsert_cart(
    p_checkout_token     => v_tok_b,
    p_phone              => v_phone_b,
    p_whatsapp_opt_in_at => timestamptz '2026-01-01 10:00:00+00',
    p_opt_in_source      => 'seeded_demo',
    p_opt_in_text        => 'Send me WhatsApp updates about my order.'
  );

  select id, whatsapp_opt_in_at, opt_in_text into v_cart_b, v_ts, v_txt
    from public.carts where checkout_token = v_tok_b;

  if v_ts is distinct from timestamptz '2026-01-01 10:00:00+00' then
    raise exception 'FAIL 5: opt-in timestamp did not survive the upsert (got %)',
      coalesce(v_ts::text, '<null>');
  end if;
  if v_txt is distinct from 'Send me WhatsApp updates about my order.' then
    raise exception 'FAIL 5b: opt-in text did not survive the upsert (got %)',
      coalesce(v_txt, '<null>');
  end if;

  perform public.case2_upsert_cart(
    p_checkout_token     => v_tok_b,
    p_phone              => v_phone_b,
    p_whatsapp_opt_in_at => timestamptz '2026-06-01 10:00:00+00',
    p_opt_in_source      => 'checkout_checkbox',
    p_opt_in_text        => 'a later, different wording'
  );

  select whatsapp_opt_in_at, opt_in_text into v_ts, v_txt
    from public.carts where checkout_token = v_tok_b;
  if v_ts is distinct from timestamptz '2026-01-01 10:00:00+00' then
    raise exception 'FAIL 5c: a cart edit RESTAMPED the consent timestamp to % — first write must win', v_ts;
  end if;
  if v_txt is distinct from 'Send me WhatsApp updates about my order.' then
    raise exception 'FAIL 5d: a cart edit overwrote the stored consent wording';
  end if;

  -- ------------------------ 6. case2_upsert_cart has exactly ONE signature ---
  -- THE ONE THAT MATTERS. Adding a defaulted parameter with CREATE OR REPLACE
  -- creates an overload instead of replacing the function; PostgREST then
  -- answers "could not choose the best candidate function" on EVERY intake
  -- call. Nothing else in the suite can see this — the workflow harnesses read
  -- JSON, and the round-trip above passes happily with two overloads present
  -- because a direct SQL call resolves by named arguments.
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'case2_upsert_cart';
  if v_count <> 1 then
    raise exception 'FAIL 6: case2_upsert_cart has % signatures, expected exactly 1 — PostgREST rejects every intake call as ambiguous. Drop the stale one.', v_count;
  end if;

  -- --------------------------- 7. status CHECK accepts 'undeliverable' -------
  insert into public.carts (checkout_token, phone, status, next_touch_at)
  values (v_tok_a, v_phone_a, 'abandoned', now() - interval '5 minutes')
  returning id into v_cart_a;

  update public.carts set status = 'undeliverable' where id = v_cart_a;

  -- ...and still rejects an invented value. 'undelivered' is Twilio's word for
  -- the message; ours is 'undeliverable' and describes the NUMBER. Fat-fingering
  -- one for the other is the likeliest way to break this.
  begin
    update public.carts set status = 'undelivered' where id = v_cart_a;
    raise exception 'FAIL 7: carts.status accepted an invalid value';
  exception
    when check_violation then null;   -- expected
  end;

  -- ---------------------- 8. an open cart IS returned by the sweep queue -----
  -- Asserted before closing it, so assertion 9 proves the STATUS did the work
  -- rather than the row being invisible for some unrelated reason.
  update public.carts
     set status = 'abandoned', next_touch_at = now() - interval '5 minutes'
   where id = v_cart_a;

  select count(*) into v_count
    from public.case2_due_carts(200) d where d.id = v_cart_a;
  if v_count <> 1 then
    raise exception 'FAIL 8: an open, due cart was not returned by case2_due_carts (got % rows)', v_count;
  end if;

  -- ------------- 9. an undeliverable cart is NOT returned by the queue -------
  update public.carts set status = 'undeliverable', next_touch_at = null where id = v_cart_a;

  select count(*) into v_count
    from public.case2_due_carts(200) d where d.id = v_cart_a;
  if v_count <> 0 then
    raise exception 'FAIL 9: case2_due_carts still returns an undeliverable cart — it would be retried forever';
  end if;

  -- ----------------------- 10. the digest COUNTS the undeliverable cart ------
  -- Measured as a delta rather than an absolute, so real rows in the window
  -- cannot make this pass or fail by accident.
  update public.carts set status = 'abandoned' where id = v_cart_a;
  v_before := public.case2_daily_digest(v_start, v_end);

  update public.carts set status = 'undeliverable', next_touch_at = null where id = v_cart_a;
  v_after := public.case2_daily_digest(v_start, v_end);

  if (v_after ->> 'undeliverable')::int <> (v_before ->> 'undeliverable')::int + 1 then
    raise exception 'FAIL 10: digest undeliverable count went % -> %, expected +1',
      v_before ->> 'undeliverable', v_after ->> 'undeliverable';
  end if;

  -- --------- 11. ...and leaves the recovery-rate denominator UNTOUCHED -------
  -- A dead number is not a failed recovery attempt. Counting it would move the
  -- headline rate for a reason that has nothing to do with the copy or the
  -- timing. The separate count above is what keeps that honest rather than
  -- hidden, and this assertion is what stops a later "tidy-up" folding it in.
  if (v_after ->> 'recovery_attempts_closed')::int
     <> (v_before ->> 'recovery_attempts_closed')::int then
    raise exception 'FAIL 11: an undeliverable cart entered the recovery-rate denominator (% -> %)',
      v_before ->> 'recovery_attempts_closed', v_after ->> 'recovery_attempts_closed';
  end if;

  -- ------------------ 12. message_class CHECK accepts both, rejects junk -----
  insert into public.cart_messages (cart_id, direction, touch_number, message, message_class)
  values (v_cart_a, 'outbound', 1, 'session test', 'session');
  insert into public.cart_messages (cart_id, direction, touch_number, message, message_class)
  values (v_cart_a, 'outbound', 2, 'template test', 'template');

  begin
    insert into public.cart_messages (cart_id, direction, touch_number, message, message_class)
    values (v_cart_a, 'outbound', 3, 'bad class', 'freeform');
    raise exception 'FAIL 12: cart_messages.message_class accepted an invalid value';
  exception
    when check_violation then null;   -- expected
  end;

  -- An inbound reply has no class at all, and must stay insertable.
  insert into public.cart_messages (cart_id, direction, touch_number, message)
  values (v_cart_a, 'inbound', null, 'hello');

  -- ------------------- 13. the digest breaks touches down by class -----------
  v_after := public.case2_daily_digest(v_start, v_end);
  if (v_after -> 'touches_by_message_class') is null then
    raise exception 'FAIL 13: digest has no touches_by_message_class key';
  end if;
  if (v_after -> 'touches_by_message_class' ->> 'session') is null
     or (v_after -> 'touches_by_message_class' ->> 'template') is null then
    raise exception 'FAIL 13b: touches_by_message_class did not report both classes (got %)',
      v_after -> 'touches_by_message_class';
  end if;

  -- ---------------------------------------------------------------- cleanup --
  delete from public.carts              where phone in (v_phone_a, v_phone_b)
                                           or checkout_token in (v_tok_a, v_tok_b);
  delete from public.case2_suppressions where phone in (v_phone_a, v_phone_b);

  raise notice 'ALL OPT-IN / DELIVERY ASSERTIONS PASSED (13)';
end $$;
