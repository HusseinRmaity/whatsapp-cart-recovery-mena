# Recording runbook — the operator's half

_Companion to `english-demo-script.md` (what to say) and `arabic-demo-script.md`. This file is what
to **run**, in order, and what to say about pacing. Written 2026-09-08, after the full loop was
proven end to end on real order `#1006`._

⚠ **Beat timings in the scripts moved on 2026-09-08 and this file was not re-timed.** The
repositioning grew the hook from 0:00–0:20 to 0:00–0:30 so it meets the Shopify comparison head-on,
which pushed every later beat 10 seconds and the full scripts to 3:15–4:00. The **order** of shots is
unchanged, so the shot table below is still correct — read the clock off the scripts, not off here.

---

## The pacing question, answered

The production schedule is **T+45min → +24h → +72h**. That is four days. The answer is not one rule
for all three touches, because the three delays are not the same kind of thing.

### Touch 1 — never compress it

The 45-minute delay is **load-bearing, not politeness**. Shopify does not create its
`AbandonedCheckout` record for roughly 11 minutes after a checkout, and until it does, the recovery
link 302s to the store root. Compress it and the money shot becomes a message whose only
call-to-action opens an empty store. It will look like your link is broken, on camera, in the exact
moment the demo has to land.

**Use two carts instead** (this is already in the script):

| Cart | When | Role |
|---|---|---|
| **A** | abandoned ~50 min **before** you hit record | its touch 1 lands live during the take |
| **B** | abandoned **on camera** | carries intake, the sweep, and the rest of the story |

One honest cut, no faked timing, and the phone buzzes for real.

### Touches 2 and 3 — compress, and say so once

Nobody waits four days, and pretending otherwise is worse than explaining it. **Compress the
schedule, never a gate.** That is the same rule the test suite follows, which is what makes it
sayable out loud:

> "The real cadence is 45 minutes, then a day, then three days. I've moved the timestamps forward so
> you can see all three in one sitting. What I have not touched is the logic — this is still
> production mode, the send window and the prayer-time gate are live, and the age guard on the first
> touch is satisfied by the cart's real age, not bypassed."

That sentence turns the one weakness of a demo into a statement about how the thing is built. Say it
once, at the cut, and move on.

**What compressing means, precisely:** move `next_touch_at`. Nothing else.
`TEST_MODE_FLAG` stays `false`, runs stay `mode: production`, and no gate is skipped.

---

## Timeline

| T-minus | Action |
|---|---|
| 60 min | `node scripts/recording-readiness.js` — nine automated checks, plus four manual ones it prints |
| 55 min | Disable host sleep. Enter the storefront password in **both** the recording browser and the phone |
| 50 min | **Abandon Cart A.** Confirm the row appears, then leave it alone |
| 10 min | Arrange windows. Send one WhatsApp to the sandbox so the 24h session window is open |
| 0 | Record. Abandon Cart B on camera |
| — | Cart A's touch 1 lands live |
| — | Buy from Cart A's link → `recovered`, Slack, digest |
| — | Compress Cart B for touches 2 and 3, say the sentence above |
| — | `توقف` from the handset → opt-out, suppression, silence |

---

## Commands

### Readiness

```bash
node scripts/recording-readiness.js
```

### Arm Cart A (only if its touch 1 has not fired and you need it sooner)

Requires the cart to be **at least 15 real minutes old** — the touch-1 age guard is satisfied by real
age and is never bypassed.

```sql
update public.carts set next_touch_at = now() where id = '<cart-A-uuid>';
```

### Speed the sweep up for the compressed section

The sweep is every 15 minutes in production. For the take, drop it to 2 so touches land while the
camera is rolling. **This also republishes the workflow, which revives a dead schedule trigger.**

Patch `Every 15 Minutes` → `parameters.rule.interval[0].minutesInterval` = `2`, then back to `15`
when you are done. Use a surgical node update, not a full-body PUT of workflow 01.

### Between touches 2 and 3

```sql
update public.carts set next_touch_at = now() where id = '<cart-B-uuid>';
```

Wait for the touch to commit before firing the next one — reset the schedule **after** the previous
touch has written its row, never before.

### Reset after the take

```sql
-- clear the opt-out so the handset is messageable again
delete from public.case2_suppressions where phone = '+961...';

-- put a cart back if you closed it and want another take
update public.carts set status = 'abandoned', next_touch_at = now(), touches_sent = 0
where id = '<uuid>';
```

Then set the sweep interval back to **15**.

---

## Tabs to open, in story order

One browser window, **a clean profile** — no personal bookmarks bar, no unrelated tabs, no other
history in the URL autocomplete. Tab order matches the shot list, so you move left to right and never
hunt.

| # | Tab | Used at | Have it showing |
|---|---|---|---|
| 1 | Storefront `?country=LB` | hook, and abandoning cart B | a product page, password already entered |
| 2 | Shopify admin → **Orders** | the sale | list view, newest first |
| 3 | Shopify admin → **Abandoned checkouts** | optional — **consider dropping it**, see below | filtered to today, or not shown at all |
| 4 | n8n → **01 Checkout Intake** canvas | intake | whole canvas fitted, last execution loaded |
| 5 | n8n → **02 Verifier & Touch Sender** canvas | the sweep, the core beat | fitted; this is the workflow people screenshot |
| 6 | n8n → **02 executions** list | proving it ran, and timings | newest first |
| 7 | Supabase → **SQL editor** | carts and run_logs | query pre-typed, not yet run |
| 8 | Slack **#leads** | the reply, the conversion post | scrolled to the bottom, nothing unread above |

```
1  https://layla-boutique-5lw7e3c9.myshopify.com/?country=LB
2  https://admin.shopify.com/store/layla-boutique-5lw7e3c9/orders
3  https://admin.shopify.com/store/layla-boutique-5lw7e3c9/checkouts
4  http://localhost:5678/workflow/UjPjVhfipiOw88s2
5  http://localhost:5678/workflow/Ego90ZQGHf48Awe9
6  http://localhost:5678/workflow/Ego90ZQGHf48Awe9/executions
7  https://supabase.com/dashboard/project/<project-ref>/sql/new
8  Slack #leads
```

**Pre-type these in the SQL editor** so you never write SQL on camera:

```sql
-- the cart lifecycle, one row per state
select customer_first_name, language, country_code, status, touches_sent,
       cart_total, currency, recovered_order_id, next_touch_at
from public.carts order by created_at desc;

-- observability: every run, success and failure, newest first
select created_at, workflow_name, step_name, status, metadata
from public.run_logs order by created_at desc limit 20;

-- the day in one call
select public.case2_daily_digest(date_trunc('day', now()), now());
```

### About the abandoned-checkouts list

**Shopify gives you no way to delete abandoned checkouts** — no button in the admin, no delete
mutation in the API. They age out on their own after a few months. So the list will show every test
checkout from this build, all of them yours.

Three honest options, in order of preference:

1. **Drop the tab.** The point it makes — "Shopify has no abandoned-cart webhook, so this has to be a
   sweep, not a trigger" — is made far better by the workflow 02 canvas.
2. **Filter it** to today and only ever show the top row.
3. **Show it and name it**: "this is my test store, these are all mine." Two seconds, and it reads as
   honest rather than sloppy.

⚠ **Orders are different — test-gateway orders CAN be deleted.** If you tidy the Orders list, **leave
`#1006` alone.** It is the 2026-09-08 recovery, cart `d873156f` points at it, and deleting it breaks
the attribution story the whole recording is built on.

### Close these before you record

- **n8n → Credentials.** Nothing good happens if that page appears, even for a second.
- **Twilio console.** The account SID is on screen the moment it loads.
- **Anthropic and Supabase settings/API pages.** Keys live there.
- Any terminal showing `.env`, the n8n API key, or the ngrok auth token.

### Two identifiers WILL be on camera

The **Supabase project ref** appears in every dashboard URL, and the **ngrok hostname** appears if you
show a webhook URL in n8n. Neither is a credential on its own, but both are live identifiers that
`scripts/redact-for-publish.js` deliberately strips from the repo before publishing — so showing them
in a public video undoes that on the video's own terms. Decide before the take: either blur them in
post, keep those panels off screen, or accept it knowingly. The Shopify dev-store domain is already
effectively public and is fine.

---

## Things that have cost a take

- **The `active` flag lies.** Schedule triggers die on host suspend and the flag keeps reading
  `true`. Verify by **execution**, never by the flag. The readiness script does this.
- **An unjoined handset returns 63015, which is terminal since 2026-09-03.** The cart closes on the
  first failed delivery instead of retrying. Confirm the handset is joined before you start.
- **No storefront password cookie = recovery links 302 to the store root.** Indistinguishable from a
  broken link on camera. Dev stores cannot disable the password.
- **A slow tunnel loses Shopify deliveries silently.** Shopify gives up at ~5 seconds. The readiness
  script fails the check above 2.5s and warns above 1.2s.
- **A blocked send is not a failed take.** If the gate defers a message, show the log row and say
  why. A system that refuses to message someone at 3am is a better proof point than a smooth one.

---

## Do not fake

- No invented numbers on screen. The ROI figure in `docs/case-study.md` is an illustrative model —
  say so if it appears.
- The demo carts carry `opt_in_source = 'seeded_demo'`, because the dev store has no opt-in checkbox.
  If consent comes up, say that plainly: the data model and the workflows are exercised exactly as
  they would be in production while the collection step is stubbed. It is a demo shortcut, named as
  one, and the public README says so too.
- Say "compressed timestamps" out loud at the cut. Once is enough.
