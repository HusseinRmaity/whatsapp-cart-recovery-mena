# WhatsApp Abandoned Cart Recovery — MENA Edition

**Arabic-native WhatsApp abandoned-cart recovery for MENA stores — built as a production system the
client owns, not a template.**

A production-grade **n8n** system that watches a Shopify store for abandoned checkouts and runs a
**3-touch trilingual WhatsApp recovery sequence** — AI-written messages in the customer's own
language, sent only inside their country's waking hours, cancelled the moment they buy, and attributed
honestly when they do.

Built for Gulf and Levant Shopify stores whose customers live on WhatsApp and ignore recovery email.
It runs on the operator's own infrastructure, against their own database, on their own WhatsApp
number. Self-initiated portfolio project — a real, working system, not a mockup.

> **Demo:**
> English walkthrough — `<LOOM_EN_URL>`
> العرض بالعربي — `<LOOM_AR_URL>`

---

## Why not just use Shopify's built-in recovery?

Fair question, and the first one worth answering. Shopify recovers abandoned checkouts natively, on
every plan, for free — and if that is working for a store, that store should keep it and read no
further.

It sends **email**. There is no native WhatsApp channel. For a Gulf or Levant store whose customers
transact on WhatsApp, the channel *is* the problem; the sequence logic never was. Three consequences
follow:

- **Email recovery here goes unread** while WhatsApp is read within minutes.
- **Email recovery is one-way.** A customer replying "is this available in blue?" is a warm buyer
  talking to a no-reply address. Here that reply is classified and in front of a human in Slack, with
  the cart attached, in seconds.
- **Translation is not register.** Shopify will render a template in Arabic. It has no concept of
  `حضرتك` reading naturally in Cairo and wrong in Riyadh, of verb agreement depending on who the
  customer is, or of rejecting its own output when it gets those wrong. This system does — as
  [14 deterministic checks in code](#arabic-correctness-is-enforced-in-code-not-requested-in-a-prompt),
  against rules a native speaker owns.

Third-party WhatsApp recovery apps exist and some are good. What they cost beyond the subscription:
machine-translated Arabic a native reader spots on the first line, a contact list and opt-out
suppression record that live in someone else's dashboard and leave when you cancel, Monday-to-Friday
scheduling defaults that know nothing about prayer times or a Friday–Saturday weekend, and no way to
extend into the process a Gulf store usually needs next — COD confirmation, not more cart touches.

**When you should buy the app instead:** small store, English-speaking customers, standard flows, no
appetite for owning infrastructure. It will be cheaper and it will be enough. This is built for the
store where WhatsApp is the primary channel, Arabic quality is a brand question rather than a
checkbox, and cart recovery is the first automation rather than the only one.

---

## The pattern that makes this work

**Shopify has no "cart abandoned" webhook.** It fires `checkouts/create` the moment a customer reaches
checkout — which is not abandonment, it is intent. Anything built on that event alone messages people
who are still typing their card number.

So abandonment is *inferred*, not received:

```
checkouts/create  ──►  store the cart, schedule a first touch at T+45min
                              │
        every 15 minutes ─────┤  is this cart due?
                              ├─ ask Shopify: has an order appeared for this checkout token?
                              │     yes → close it, cancel the remaining touches, attribute
                              │     API down → skip this cart, send nothing, try next sweep
                              └─ no  → send window open? → generate → send → verify delivery
```

Two consequences the whole design turns on:

- **The conversion check happens immediately before every send**, never once at the start. If the
  check fails, the cart is skipped. Silence is always preferable to messaging someone who already paid.
- **The 45-minute delay is load-bearing, not politeness.** A Shopify recovery link 302s to the store
  root until Shopify creates its own `AbandonedCheckout` record — about 10–11 minutes. A touch sent
  earlier is a technically successful message whose only call-to-action is dead, so the sender refuses
  to send touch 1 to a cart younger than 15 minutes.

---

## Architecture

```
 Shopify: checkouts/create ──► 01 — Checkout Intake
                               HMAC (raw body) → parse → require token + phone
                               → language (name script › locale › phone country › Haiku)
                               → country/timezone → atomic upsert by checkout_token
                                          │
                                          ▼  next_touch_at
 ┌───────────────────────────────────────────────────────────────────────────┐
 │ 02 — Verifier & Touch Sender          every 15 min, LIMIT 50              │
 │   fetch due carts → per cart:                                            │
 │     conversion check (Shopify GraphQL) ─ converted → close + attribute   │
 │                                        ─ failed    → skip, log, retry    │
 │     send gate: cart age · send window · weekend · prayer time            │
 │     generate touch (Sonnet 5) → deterministic register + money checks    │
 │     send (Twilio) → wait → re-read delivery state → only then count it   │
 │       dead number → close the cart, no retry; a rate cap → back off 24h    │
 │   sweep summary: one alert per degraded sweep, never one per cart        │
 └───────────────────────────────────────────────────────────────────────────┘
      ▲                                                    │
      │ inbound reply                                      ▼ 3 touches → exhausted
 03r — Inbound Router          03 — Reply Handler C2
 one Twilio number,            opt-out keywords in code → suppress + confirm once
 two case studies:             else Haiku intent → question / wants_to_buy → Slack
 active cart wins              + holding reply · other → Slack, no reply

 Shopify: orders/create ──► 04 — Conversion Tracker
                            HMAC → match checkout_token → cancel touches
                            → recovered | converted_before_first_touch | after_opt_out

 05 — Daily Digest C2   08:00 Asia/Dubai — carts, touches, replies, opt-outs,
                        revenue per currency, recovery rate with its denominator
 99 — Error Handler C2  unhandled crash → run_logs + Slack, with the execution link
 00 — Health Check C2   Anthropic + Supabase + Shopify reachability probe
```

8 workflows · 130 functional nodes · 18 sticky notes on the non-obvious logic.

---

## Stack

| Layer | Choice |
|---|---|
| Orchestration | n8n (self-hosted, Docker) |
| Store | Shopify — **GraphQL** Admin API `2026-07` (REST has been legacy since 2024-10) |
| Language + reply intent | Claude **Haiku 4.5** |
| Touch message generation | Claude **Sonnet 5** |
| Messaging | Twilio WhatsApp Business API (sandbox for the demo) |
| Database | Supabase (Postgres) — `carts`, `cart_messages`, shared `run_logs` / `send_windows` |
| Notifications | Slack |
| Prayer times | aladhan.com (free) |

Model choice is cost-driven and mostly *avoided*: language detection runs a heuristic chain (Arabic
name script, then Shopify locale, then phone country) and only calls Haiku when all three miss —
most carts never make an AI call for language at all. The same call returns the customer's
grammatical gender for Arabic agreement, and it fires **only for Arabic carts** with a name the
heuristic does not recognise: agreement is meaningless in English or French, and a per-cart call that
cannot change the message is a real line on a client's bill. Sonnet is reserved for the one job that
needs real writing: the touch message.

---

## Built for MENA, not localized afterwards

Everything below is the evidence for the section above. None of it is a setting an app exposes,
because none of it is a setting — it is logic, and it is the reason this is a build rather than a
subscription.

- **Arabic / English / French**, detected per customer and never switched mid-sequence — the upsert
  deliberately freezes language once set, so a cart edit cannot flip a customer from Arabic to English.
- **Register varies by market.** `حضرتك` is natural in Egypt and the Levant and reads wrong in the
  Gulf, so the market drives the phrasing rather than one honorific being applied everywhere.
  Informal address is blocked in every market.
- **Grammatical gender is carried as data, not guessed by the model.** Arabic agreement depends on
  the customer's gender, so it is inferred once at intake and frozen like the language — the register
  cannot change between the first message and the last. When it cannot be determined confidently the
  answer is `unknown`, which asks for gender-neutral phrasing rather than a coin flip.
- **Money is formatted in code, never asked of the model** — Western digits, thousands separators,
  currency code after the number (`42,663,000 LBP`, `1,249 AED`). A model asked to format numbers
  drifts between messages; a function does not.
- **Presentment vs shop currency are different columns.** A Lebanese customer pays 42,663,000 LBP
  against an order the merchant books in AED. The digest reports revenue **per currency and never
  sums it**, because a single blended figure would be a fiction.
- **Weekend-aware** — Gulf Friday–Saturday, Levant Saturday–Sunday, per country, not a global default.
- **Prayer-time-aware** — a send falling within 15 minutes of a prayer is delayed 30 minutes.
- **Quiet hours in the customer's own timezone**, with an honest fallback: a cart whose timezone
  cannot be resolved is messaged in the *store's* hours and the log says so rather than claiming a
  customer timezone that was never known.

### Arabic correctness is enforced in code, not requested in a prompt

Arabic register went wrong twice early in this build, and both times a native speaker caught it in a
message that had **already been delivered**. Politely asking a model for the right register is not a
quality loop.

So the rules live in a file a native speaker owns, and the mechanical ones are enforced in
`Parse Touch Message` as **14 deterministic checks**. A generated message that trips any of them is
**discarded**, the static respectful template is sent instead, and the reason is recorded in
`degrade_reason` — so the failure rate shows up in `run_logs` and the daily digest rather than
reaching a customer. Among them: informal address, a wrong-person verb after `حضرتك`, feminine forms
that disagree with the customer, vowel marks, `إن شاء الله` used for delivery timing, a URL, and an
unformatted amount.

**Six of those rules exist because a wrong message was delivered to a real handset first.** That is
the honest origin of this layer, and it is also the argument for it: the same prompt and the same
cart, fifteen minutes apart, produced one rejected generation and one clean one. Register compliance
from a language model is probabilistic. The code layer is what makes it not.

Two examples of what "enforced in code" buys you, both found by reading rather than testing:

- **A rule can be written in three places and enforced in none.** The ban on `إن شاء الله` for
  delivery timing appears in the global standards, in the Arabic authority file and in the project
  style guide. It had silently dropped out of the *deployed* system prompt while the versioned prompt
  file still claimed it was there, and no check existed either. It is now a rule in the checker,
  where it cannot fall out of a prompt unnoticed.
- **Grammatical gender is a data problem, not a prompt problem.** Arabic verb agreement depends on
  who the customer is, so the model is never asked to guess it from a name. Gender is inferred once
  at intake and frozen alongside the language, and `unknown` is a first-class value that asks for
  gender-neutral phrasing and keeps the checker strict — a wrong guess is visible to a native reader
  in a way neutral phrasing never is. The name heuristic checks explicit lists *before* the
  morphology rules, because `أسامة` and `حمزة` end in ة and `مصطفى` and `يحيى` end in ى, and all
  four are male.

**A third example, and the one that says most about the method.** The first end-to-end run put
model-generated Arabic on a real handset for the first time. The message passed all eleven checks
that existed — and was still wrong twice: a dialect word where Modern Standard Arabic was required,
and an honorific stacked against the customer's name in the greeting. **No rule had ever looked at
vocabulary.** The others check pronouns, imperatives, agreement, vowel marks and religious phrasing,
so an entire category was unguarded and no amount of passing tests could reveal it. Two rules were
added the same hour, and the next generation came back clean without any prompt-level nagging.

The detail worth keeping: the new greeting rule anchors on the greeting, not on the name, because the
model transliterates — the cart carried `Hussein` and the message said `حسين`. Matching the stored
name would have missed the defect completely.

**Status: the mechanism is sound and the rules are enforced, but "settled" would be the wrong word.**
Every time a real Arabic message reaches a handset, this layer has learned something a passing test
suite could not tell it. What remains beyond that: the few-shot examples in the prompt are still
invented rather than drawn from real Gulf/Levant brand copy, and replacing them is the next
improvement to every Arabic message the system sends. That is deliberately left undone rather than
filled with plausible-looking copy.

---

## Production hardening (the 8-point standard)

| # | Standard | How it's met |
|---|---|---|
| 1 | Error handling | Every external call carries an explicit timeout / retry / Continue-On-Fail decision, audited against the live API. |
| 2 | Validation | Token and phone required at intake; a phone that cannot be resolved to E.164 returns **null** rather than an invented recipient; malformed input gets its own logged branch. |
| 3 | Idempotency | Four independent mechanisms: atomic upsert by `checkout_token`, a unique index on inbound message SIDs, filtered PATCHes that match 0 rows on a retry, and status guards on every cart writer. |
| 4 | Observability | Every branch that decides *not* to act writes a `run_logs` row — skipped carts and dropped duplicates included. "Nothing happened" is never acceptable evidence. |
| 5 | Global error workflow | `99 - Error Handler C2` on all 8 workflows; proven with a real crash. |
| 6 | Credentials | Nothing in any node, URL or code path. The webhook signing secret is a `crypto` credential read by the native Crypto node. |
| 7 | Naming | 0 of 130 nodes carry a default name; sticky notes cover the fail-safe, the send gate, the 3-touch cap and the raw-body HMAC rule. |
| 8 | Loop caps | Sweep `LIMIT 50`; 3-touch cap in workflow logic **and** a database check constraint; 30-day reply lookback; no unbounded pagination. |
| + | HMAC on every Shopify webhook | Raw-body HMAC-SHA256 on `checkouts/create` and `orders/create`. Valid signatures accepted, forged ones dropped with a logged security event. |

**Chaos-tested:** Shopify API down mid-sweep (carts skipped, zero sends, one alert, full recovery on
the next sweep) · Twilio delivery failure (touch **not** counted, retried in 2h) · five concurrent
signed webhooks for one checkout in 170 ms (one cart row, one schedule) · a conversion landing
mid-sweep (the write matches 0 rows and says so).

### What this system does *not* claim

- **Delivery confirmation is a 10-second poll, not a Twilio status callback.** It costs ~10s per cart,
  which puts a ceiling around 80 carts per sweep. Named because a client will hit it.
- **Touches 2 and 3 fall outside WhatsApp's 24-hour session window.** In production they must be
  Meta-approved template messages (utility category; the discount touch is marketing). The sandbox
  does not enforce this — a real deployment must register templates first.
- **WhatsApp consent is seeded, not collected.** The development store has no opt-in checkbox, so
  seeded carts carry `whatsapp_opt_in_at`, `opt_in_source` and `opt_in_text` with the source
  `seeded_demo`. A real deployment must show an explicit, unticked WhatsApp opt-in at checkout and
  store both the timestamp and the exact wording shown. Collecting a phone number is not consent, and
  the discount touch is a marketing message that the utility category does not cover.
- **The three Twilio nodes have no timeout**, because the n8n Twilio node exposes no such option.
  Compensating controls: retry 3×2s, Continue-On-Fail into the postpone branch, and the delivery poll.

---

## Store configuration is half the battle

Four Shopify settings will make the automation look broken when they are wrong, and none of them are
visible from inside n8n. They belong in any client onboarding checklist:

1. **Checkout must collect a phone.** Settings → Checkout → contact method "Phone number or email",
   **and** shipping-address phone "Required". Without the second, a customer who types an email leaves
   no phone at all and the cart is unrecoverable on a WhatsApp-only channel.
2. **Shipping zones gate the address step** — and therefore the customer's *name*. A store that does
   not ship to a country cannot collect that country's customers' names, which silently degrades
   language detection to phone-prefix only.
3. **Markets must include the products.** A market can be live, converting currency correctly, and
   carry an empty catalog — every product shows "sold out" to that country while selling fine
   elsewhere. A store that cannot sell to a market cannot generate recoverable carts for it.
4. **A password-protected storefront destroys every recovery link.** The link redirects to the
   password page and the checkout session is gone.

Also: **register the webhooks in the Shopify admin UI, not through the API.** Admin-UI webhooks are
signed with the secret shown on that page; API-registered ones are signed with the app's client
secret. Mixing the two produces HMAC failures that look exactly like a code bug.

---

## Run it yourself

**Prerequisites:** Docker, a Supabase project, a Shopify store (a free Partners development store
works), and API access for Anthropic, Twilio (WhatsApp sandbox) and Slack.

1. **Database** — run `db/schema-c2.sql` in the Supabase SQL editor. It creates `carts`,
   `cart_messages` and `case2_suppressions`, adds a nullable `cart_id` to `run_logs`, and installs
   three RPCs (`case2_upsert_cart`, `case2_due_carts`, `case2_daily_digest`). Idempotent, safe to
   re-run against an existing database, and it does not touch anything else in the project.
2. **n8n** — `docker compose up -d`, then import each file in `workflows/`.
3. **Credentials** — add Supabase, Anthropic, Twilio and Slack credentials, a Header Auth credential
   for the Shopify Admin API token (`X-Shopify-Access-Token`), and a **`crypto` credential** holding
   the Shopify webhook signing secret in `hmacSecret`. Every imported node references them by name.
4. **Point the URLs at your own store and project** — the exports carry the development store's
   `myshopify.com` domain, and their Supabase host is the placeholder
   `YOUR_PROJECT.supabase.co` (see the note under **Repository layout**). Replace both, and grant the
   Shopify scopes `read_orders` + `read_checkouts`.
5. **Webhooks** — in the Shopify admin, `Checkout creation` → `<your-n8n-url>/webhook/shopify-checkout`
   and `Order creation` → `<your-n8n-url>/webhook/shopify-order`. Point the Twilio inbound URL at
   `<your-n8n-url>/webhook/whatsapp-inbound-router`.
6. **Activate** all 8 workflows and check `GET /webhook/health-c2` returns `ok` for all three services.
7. **Tests** — eight Node harnesses, **227 assertions**, no dependencies and no test runner:

   | File | Asserts |
   |---|---|
   | `parse-touch-message.test.js` (73) | Arabic register rules, money formatting, fallbacks, recovery-link locale |
   | `reply-handler-paths.test.js` (38) | inbound parsing incl. voice notes, intent contract, holding-reply rule, opt-out copy |
   | `infer-gender.test.js` (30) | gender inference at intake |
   | `suppression-wiring.test.js` (24) | node WIRING and query shape, which no unit test can see |
   | `resolve-reply-context.test.js` (17) | which cart owns a reply |
   | `apply-send-gate.test.js` (16) | send window, prayer gate, touch-1 age guard |
   | `decide-route.test.js` (15) | which case study owns an inbound phone |
   | `build-touch-request.test.js` (14) | the Anthropic request shape for a touch |

   Run each with `node tests/<file>`. They read the real `jsCode` out of the workflow exports and run
   it under stubs, so they cannot drift from what ships. **Re-export before running them**, with a
   BOM-free writer — a UTF-8 byte-order mark makes every harness fail on the first character.

   Two SQL files (26 assertions) run in the Supabase SQL editor and clean up after themselves:
   `tests/suppressions.sql` (13) and `tests/opt-in-and-delivery.sql` (13).

### The first two things a real deployment changes

1. **A stable public hostname.** This build runs on quick Cloudflare tunnels, which died seven times
   during development — usually with the process still alive and the hostname no longer resolving.
   Shopify's webhook delivery timeout is 5 seconds and an endpoint that keeps failing eventually has
   its subscription removed, so a flaky tunnel loses orders silently.
2. **The Twilio status-callback webhook**, replacing the delivery poll and its ~80-cart/sweep ceiling.
   It needs (1) to exist first.

---

## Repository layout

```
├── workflows/       n8n exports (00, 01, 02, 03r, 03, 04, 05, 99)
├── prompts/         versioned Claude system prompts + the Arabic style guide
├── db/              schema-c2.sql — tables, indexes, both RPCs
├── tests/           eight regression harnesses, two SQL suites, a signed-webhook sender, fixtures
├── scripts/         publish-time redaction for the workflow exports
├── docs/            case study, product seed CSV
└── loom-scripts/    demo scripts (EN + AR)
```

**A note on the workflow JSONs.** Supabase URLs in `workflows/*.json` read
`https://YOUR_PROJECT.supabase.co/...`. They are exported byte-for-byte from a running n8n instance
and verified node-for-node against it, then the project identifier is rewritten by
`scripts/redact-for-publish.js` as the last step before commit. Point them at your own project and
they run as-is. Nothing else is altered, and no credential ever appears in an export — keys live in
n8n's credential store, and the credential IDs you will see are local database row ids, meaningless
outside the instance that created them.

See [`docs/case-study.md`](docs/case-study.md) for the full write-up and the cost model.

---

## License

MIT — see [`LICENSE`](LICENSE).

## Author

**Hussein Rmaity** — automation engineer, Tyre, Lebanon. WhatsApp-first AI automation for MENA
service businesses.
Portfolio: [husseinrmaity.github.io](https://husseinrmaity.github.io) · GitHub: [@HusseinRmaity](https://github.com/HusseinRmaity)

_Self-initiated case study. The system is real and working; the figures in the case study are an
illustrative model, labeled as such — no client results are represented._
