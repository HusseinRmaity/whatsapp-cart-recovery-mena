# Loom script — English demo

**Target length:** 3:15–4:00
**Audience:** Shopify store owners and ecommerce managers in the Gulf and Levant, plus agencies
scouting a WhatsApp automation partner.
**Goal:** Answer "why pay for this when Shopify recovers carts for free?" in the first thirty seconds,
then prove — visibly, on a real phone — that an abandoned Shopify cart produces a personalised
Arabic WhatsApp message that names the actual products, that a reply reaches the owner in Slack, and
that a resulting order is attributed honestly.

**Positioning — read before recording.** This is not a video about cart recovery. Cart recovery is
free in Shopify and $29/month in an app. The video is about **WhatsApp instead of email, Arabic a
native speaker does not wince at, and a system the store owns**. Every beat should read as evidence
for one of those three. Full argument in `case-study-2-spec.md` §1a.

---

## Before you hit record

- [ ] Tunnel running and **verified through the public URL** (three probes, all under ~3s — a tunnel
      that answers slowly loses Shopify deliveries, which have a 5-second timeout).
- [ ] The 3 Shopify webhook URLs and the Twilio inbound URL re-pointed at the current tunnel.
- [x] ~~**Arabic catalogue imported**~~ — confirmed live; a real checkout on 2026-09-08 drew
      `Silk Hijab Set — 3 pieces` and `Linen Kaftan — Sand`. Snowboards deleted, AE/LB markets stocked.
- [x] ~~Arabic is a published storefront language~~ — confirmed 2026-09-08 by opening an `ar-LB`
      recovery link on the handset into an Arabic checkout. `PUBLISHED_LOCALES` is no longer an assumption.
      Nothing damages this demo faster than a MENA boutique WhatsApp-ing a customer about snowboards.
- [ ] `LAYLA10` discount exists in Shopify (touch 2 quotes it).
- [ ] Storefront password noted (dev stores cannot disable it) — enter it once in the browser you
      record with, before you start.
- [ ] Your handset has messaged the Twilio sandbox in the last 24 hours, so the session window is open.
- [ ] Run `node scripts/recording-readiness.js` — it checks the tunnel, all 8 workflows, the sweep
      trigger by EXECUTION rather than by the `active` flag, and the harnesses.
- [x] ~~Test data pruned~~ — **do NOT prune before this take.** `carts` now holds one of every
      meaningful state, including the `recovered` cart from order `#1006` (2026-09-08). Pruning
      destroys the money shot. Prune at step 6.2, after the recording, and exclude `d873156f`.
- [ ] Windows arranged: (1) storefront, (2) n8n canvas for `02 - Verifier & Touch Sender`,
      (3) Supabase `carts`, (4) Slack, (5) Shopify admin orders. Phone mirrored or in frame.

**The pacing problem, and the honest way around it.** The first touch is scheduled 45 minutes after
checkout, and that delay is load-bearing — a Shopify recovery link does not work until Shopify creates
its abandoned-checkout record about 10–11 minutes in. **Do not compress it for the recording.**
Instead, abandon **Cart A about 50 minutes before you start**, then abandon **Cart B on camera**. Cart
A's touch lands live during the take; Cart B carries the rest of the story. One honest cut, no faked
timing.

**Touches 2 and 3 are a different question**, because +24h and +72h is four days. Those you DO
compress, and you say so once, at the cut. The operator's half of this — the exact commands, and the
sentence to say — is in `recording-runbook.md`. The rule is: move `next_touch_at`, never a gate.

---

## Shot list & voiceover

### 0:00–0:30 — The hook (meet the comparison head-on)

*Storefront on screen, an Arabic product page open.*

> "Shopify already sends abandoned-cart emails for free — so why would you pay for this? Because in
> the Gulf those emails barely get opened. WhatsApp gets read in minutes, and Shopify has no WhatsApp.
> The apps that do have it write Arabic a native speaker can tell is machine-translated. So this is
> WhatsApp recovery, in Arabic that sounds right, built into your operation — and you own it, it's
> not a subscription. Let me show you. It's running on my phone."

**Delivery note:** say the first sentence flatly, like you are agreeing with the objection. The whole
hook only works if it sounds like you raised the question yourself rather than got cornered by it. Do
not rush it — this is the beat that earns the next three minutes.

### 0:30–0:55 — Abandon a cart, on camera

> "I'll shop as a customer in Beirut. Add to cart, start checkout, enter my details — and then do what
> most people do: leave."

*Add an Arabic-titled product, go to checkout, fill an Arabic name + Lebanese phone, reach the payment
step, close the tab. Prices show in LBP.*

### 0:55–1:20 — Intake (n8n + Supabase)

> "Shopify has no 'cart abandoned' webhook — it tells you when a checkout *starts*, which is intent,
> not abandonment. So the system stores the cart and schedules a first touch 45 minutes out."

*n8n `01 - Checkout Intake` execution, green path. Then the Supabase `carts` row.*

> "The signature is verified before anything else runs. Language came from the Arabic name script — no
> AI call needed. Timezone Beirut. And note the currency: the customer sees Lebanese pounds while the
> store books AED. Those are two different columns here, deliberately."

### 1:20–1:55 — The sweep: what happens before a message is ever sent

*n8n `02 - Verifier & Touch Sender`, an execution open.*

> "Every fifteen minutes the sweep asks two questions about each due cart. First: has an order shown
> up for this checkout? If Shopify can't be reached, the cart is skipped — this system will always
> choose silence over the risk of messaging someone who already paid."
>
> "Second: is it a reasonable hour where this customer lives? Quiet hours, the local weekend — Friday
> and Saturday in the Gulf, Saturday and Sunday in the Levant — and prayer times. A send within
> fifteen minutes of a prayer waits half an hour."

*Point at the gate node and a logged `gate_reason`.*

### 1:55–2:25 — The phone buzzes (the money shot)

> "Here's Cart A, abandoned before we started recording."

*Hold up the phone. The Arabic touch has arrived.*

> "It names the actual products in the cart, in Arabic, with the total formatted properly — Western
> digits, thousands separators, currency code. It carries the recovery link, and one line telling the
> customer exactly how to stop. The link and that opt-out line are written by the workflow, never by
> the model — a mangled link makes the whole message worthless, and the opt-out is a compliance
> control, so neither is left to probability."
>
> "And this is the part a generic app gets wrong. The politeness level here is right for this market
> and would read wrong in the Gulf. The verb agrees with this customer specifically. That's checked in
> code before the message is allowed out — if the model writes Arabic that breaks a rule, it's thrown
> away and a safe template goes instead, and the reason is logged. Your brand never sounds
> machine-translated, because a bad message can't reach a customer at all."

**Do not quote a rule count on camera.** The documents currently disagree (README says 14, project
`CLAUDE.md` says 13, and the style-guide table omits two rules that exist in the code). Say "checked
in code" until that is reconciled — a number a viewer could count and find wrong costs more than it
buys.

### 2:25–2:55 — A reply reaches a human

*Reply from the handset in Arabic — e.g. asking about delivery.*

> "A customer who replies isn't talking to a no-reply address — which is exactly what a recovery
> email is. The reply is classified, the owner gets it in Slack with the cart attached, and the
> customer gets an honest holding message. It never invents a delivery time or a price."

*Show the Slack card. Then, briefly:*

> "And if they reply STOP, or توقف in Arabic, that's matched in code before any model sees it —
> suppressed instantly, one confirmation, and nothing again."

### 2:55–3:25 — The sale, attributed honestly

*Open Cart A's recovery link, complete the order with the test gateway.*

> "The order webhook closes the cart, cancels the remaining touches, and reports it in Slack with the
> amount in both currencies."
>
> "And here's the part I'd want a client to notice: if an order arrives with zero touches sent, this
> system records it as *converted before first touch* and explicitly does not claim it as a recovery.
> Recovery tools take credit for customers who were coming back anyway. This one refuses to."

### 3:25–3:45 — Hardening

> "Three touches maximum — enforced in the workflow and again as a database constraint, so no bug can
> produce a fourth message to a real customer. Every branch that decides *not* to act writes a log
> row. There's a daily digest at 8am with revenue reported per currency, never blended into one
> fictional number. And it's been chaos-tested: Shopify down mid-sweep, Twilio failing, five duplicate
> webhooks at once, a customer buying in the middle of a send."

### 3:45–4:00 — CTA (close the loop on the hook)

> "So — back to the question I opened with. If Shopify's free email is working for your customers,
> keep it, you don't need me. If your customers are on WhatsApp and your Arabic matters, I build this
> on your store, your number, your languages — and you own it. Your workflows, your database, your
> opt-out list. Cart recovery is just the first thing we point it at. Link's in the description."

---

## Notes

- The phone reveal is the emotional peak — keep it in frame, don't cut away.
- Do not shorten the 45-minute delay to speed up the shoot. It is what makes the recovery link work;
  compressing it produces a message whose only call-to-action lands on the homepage.
- Touches 2 and 3 sit outside WhatsApp's 24-hour session window. If you demo touch 2, message the
  sandbox from the handset first, and say out loud that production uses approved template messages —
  it reads as expertise, not as a caveat.
- No invented numbers on screen. The ROI figure is an illustrative model (see `docs/case-study.md`);
  say so if asked.
- **Never quote a channel open rate.** Not "WhatsApp gets 90%", not "email gets 15%" — both are
  unsourced and a buyer who checks one stops trusting everything else you said. "Barely get opened"
  and "read in minutes" are directional, defensible, and land just as hard. The 70% abandonment figure
  is a real industry benchmark and is the only number you quote.
- **If asked live "isn't this what Shopify already does?"** — agree first, then separate: yes, and
  it's email-only, one-way, and has no Arabic register. Then offer the concession: a small
  English-speaking store should genuinely just use it. Conceding the case you'd lose makes the case
  you win believable.
- If a take fails because a send was blocked by the gate, that is the system working. Show the log
  row rather than re-shooting around it — a blocked send is a better proof point than a smooth one.
