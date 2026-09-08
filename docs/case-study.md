# Case Study — Arabic-Native WhatsApp Automation for a MENA Store

_Built as a production system the client owns, not a template. Abandoned carts are the first process
it was pointed at._

**Type:** Self-initiated portfolio project — a real, working system built end to end.
**Role:** Sole engineer (architecture, build, testing, hardening).
**Stack:** n8n · Claude (Haiku 4.5 + Sonnet 5) · Shopify GraphQL Admin API · Twilio WhatsApp · Supabase · Slack.

> **English demo:** `<LOOM_EN_URL>` · **العرض بالعربي:** `<LOOM_AR_URL>` · **Code:** [github.com/HusseinRmaity/whatsapp-cart-recovery-mena](https://github.com/HusseinRmaity/whatsapp-cart-recovery-mena)

---

## The problem

Roughly 70% of ecommerce checkouts are abandoned, and recovering them is a solved problem — Shopify
does it natively, for free, on every plan. Which makes "we recover your abandoned carts" a strange
thing to sell, and is exactly why this project is not that.

**Shopify's recovery is email.** That is a reasonable answer in markets where people read email. In
the Gulf and the Levant they largely do not: shoppers live in WhatsApp, and a recovery email lands in
a tab nobody opens. It is also one-way — a customer who replies "is this available in blue?" is a
warm buyer talking to a no-reply address — and it is English-first, timezone-blind, and has no
concept of Arabic register.

Meanwhile the apps that do offer WhatsApp recovery are built on Western assumptions: Monday-to-Friday
cadence, one blended revenue figure across currencies, quiet hours in the store's timezone rather than
the customer's, and Arabic that reads like it was translated by a tool. They are also rentals — the
contact list, the message history and the opt-out suppression record live in the vendor's dashboard
and leave when the subscription does.

So the gap is not the feature. It is the **channel**, the **Arabic**, and **who owns the thing when
it works**.

## Who it's for

Shopify stores doing roughly $100K–$5M a year in the Gulf and Levant — fashion, beauty, home,
electronics — whose customers are WhatsApp-primary, whose brand voice in Arabic is worth protecting,
and for whom cart recovery is the first automation rather than the only one.

## "Why not just use Shopify's built-in recovery?"

Because it is email, it cannot be replied to, and it has no register. Shopify will render a template
in Arabic; it has no concept of `حضرتك` reading naturally in Cairo and wrong in Riyadh, of verb
agreement depending on who the customer is, or of rejecting its own output when it gets those wrong.
It also has no per-country weekend and no prayer-time awareness — and no reason to, because an email
arriving at 3am is rude in a way a WhatsApp message at 3am is not.

**And when you should not hire me for this:** a small store with English-speaking customers and
standard flows should buy a $29 app. It will be cheaper and it will be enough. This is built for the
store where WhatsApp is the primary channel, Arabic quality is a brand question rather than a
checkbox, and the operator wants the system, the data and the opt-out record under their own account.
The setup cost buys a WhatsApp automation runtime that the next process runs on — COD confirmation,
order updates, win-back — for the cost of building that process rather than another subscription.

## What I built

A production-grade n8n system that detects an abandoned Shopify checkout and runs a three-touch
WhatsApp recovery sequence:

- **T+45min** — a warm reminder naming the actual products left in the cart, in the customer's language;
- **T+24h** — a discount, framed as a gift rather than a countdown;
- **T+72h** — the gentlest of the three, because it is the goodbye. Then it stops. Permanently.

Replies are read and routed: a question reaches the store owner in Slack with the cart attached and
the customer gets an honest holding reply; "STOP" or "توقف" suppresses the cart instantly. The moment
an order appears, the remaining touches are cancelled and the sale is attributed — or explicitly *not*
attributed, if the customer was going to buy anyway.

---

## How it works

**Shopify has no "cart abandoned" webhook.** It fires `checkouts/create` when a customer reaches
checkout, which is intent, not abandonment. Building on that event alone messages people who are
still typing their card number.

So abandonment is inferred. The checkout is stored with a first touch scheduled 45 minutes out, and a
sweep runs every 15 minutes asking two questions per due cart: *has an order appeared for this
checkout token?* and *is it a reasonable hour where this customer lives?*

Three design decisions carry most of the weight:

1. **A fresh conversion check immediately before every send** — never once at the start of the run. If
   Shopify cannot be reached, the cart is skipped and retried next sweep. The system will always
   choose silence over the risk of messaging someone who has already paid.
2. **The 45-minute delay is load-bearing.** A Shopify recovery link redirects to the store homepage
   until Shopify creates its own abandoned-checkout record, about 10–11 minutes after the fact. A
   touch sent earlier is a message whose only call-to-action is dead. The sender refuses to send a
   first touch to a cart younger than 15 minutes, and that is the one gate a test-mode flag cannot
   bypass — compressing it does not speed a test up, it invalidates it.
3. **A touch counts only once delivery is confirmed.** Twilio returning a message ID means *accepted*,
   not *delivered*. Early in the build, three messages nobody received each consumed one of only three
   permitted touches. Now the workflow re-reads the delivery state before incrementing the counter,
   and a failure postpones the cart instead of spending its budget.

---

## Built for MENA — the part off-the-shelf tools miss

| Feature | Why it matters here |
|---|---|
| **Arabic / English / French**, detected per customer | Detected from name script, store locale and phone country before any AI call — and frozen, so a cart edit can't flip a customer's language mid-sequence. |
| **Register varies by market** | `حضرتك` is natural in Egypt and the Levant and reads wrong in the Gulf. The market drives the phrasing; informal address is blocked everywhere. |
| **Grammatical gender carried as data** | Arabic verb agreement depends on the customer's gender, so it is resolved once at intake and frozen — the register can't shift between the first message and the last. Where it isn't certain, the answer is `unknown` and the copy avoids gendered forms rather than guessing. |
| **Revenue reported per currency, never summed** | A Beirut customer pays 42,663,000 LBP against an order booked in AED. One blended "revenue recovered" number would be a fiction. |
| **Per-country weekends** | Gulf Friday–Saturday, Levant Saturday–Sunday. Not a global Mon–Fri assumption. |
| **Prayer-time-aware sending** | A send within 15 minutes of a prayer is delayed 30 minutes. |
| **Honest attribution** | An order with zero touches sent is recorded as `converted_before_first_touch` and explicitly **not** counted as a recovery — it is excluded from both sides of the recovery rate. |

That last row is a sales decision as much as an engineering one. Recovery tools routinely claim credit
for customers who were coming back anyway. A client who discovers that once stops trusting every
number the system reports.

---

## Engineering rigor

Built to a strict 8-point production standard, then chaos-tested: Shopify API down mid-sweep, Twilio
failing, five concurrent duplicate webhooks, and a conversion landing in the middle of a send. Each
test asserts a specific log row rather than "nothing bad happened" — in this build, *no row was
written* is never acceptable evidence, because it is indistinguishable from a webhook that never
arrived.

Five defects that survived review and were caught by testing are worth naming, because they are the
argument for the process:

- **A paid customer put back in the send queue.** The sweep writes to the cart table from four
  different nodes; only two carried a concurrency guard. A cart closed by an order webhook *between*
  the conversion check and the write was resurrected — status overwritten, schedule re-armed. I fixed
  two by reading the code, believed I was done, and a chaos test found a third. The generalisable
  lesson: when fixing a class of bug, enumerate every site *first*.
- **A deploy that reported success and changed nothing.** The n8n CLI import writes the database
  without reaching the running process. The stored workflow verified correct while the old version
  kept executing — proven when a request deployed with one token limit executed with the previous one
  exactly. Three test rounds were spent interpreting stale-code results as logic bugs. The rule that
  came out of it: a local test passing while the live run contradicts it is a *deployment* hypothesis
  first.
- **A model silently spending its whole budget on thinking.** On Sonnet 5, omitting the thinking
  parameter enables adaptive thinking, and the token cap covers thinking *plus* text. Once the prompt
  grew, the model returned no text at all and every touch quietly fell back to a static template — a
  degradation that looked like success.
- **An n8n Switch discarding items with no error.** A misplaced fallback setting meant three routing
  outcomes were dropped on the floor: no exception, no log row, workflow green. Caught only because
  the test demanded a specific row exist.
- **A customer sent a voice note and got silence.** WhatsApp delivers a voice note with an empty
  message body, and the inbound parser treated an empty body as nothing to handle — so it was
  dropped: no record, no notification to the owner, no reply. The parser existed in four copies
  across the system, its own comment said *"if you change one, change all four"*, and an earlier fix
  had reached two of them. Voice notes are a dominant WhatsApp modality in the Gulf and the Levant,
  so this was a hole on the busiest customer-facing path, not an edge case. The same lesson as the
  first defect above, arriving a second time by a different route: I audited all four copies rather
  than fixing the one that had failed, and found a second system with the same gap.

**On Arabic specifically:** register was wrong twice early on, and both times a native speaker caught
it in a message that had already been delivered. The response was not "write a better prompt" — it was
to move the rules into a file a native speaker owns and enforce the mechanical ones in code, as 14
deterministic checks. A generated message with informal address, wrong verb agreement, gender forms
that disagree with the customer, a model-written URL or an unformatted amount is discarded and
replaced with a respectful static template, with the reason logged so the degrade rate is measurable.
It has already stopped real generations from reaching customers. The same prompt, on the same cart,
fifteen minutes apart, produced one rejected message and one clean one — which is the whole argument
for enforcing rather than asking.

Three later findings sharpened that argument:

- **An entire category of error that no test could have found.** The first end-to-end run put a
  model-generated Arabic message on a real handset for the first time. It passed every check that
  existed and was still wrong twice — a dialect word where Modern Standard Arabic was required, and
  an honorific stacked against the customer's name in the greeting. Every existing rule looked at
  grammar: pronouns, agreement, vowel marks, religious phrasing. **None looked at vocabulary.** A
  passing suite cannot reveal a category nobody thought to check; only a real message to a real
  person did. The two new rules went in the same hour, and the next generation came back clean.
  A detail that generalises: the greeting rule anchors on the greeting rather than the customer's
  name, because the model transliterates — the record said `Hussein`, the message said `حسين`.

- **A rule written in three documents and enforced in none.** The ban on `إن شاء الله` for delivery
  timing appears in the global standards, the Arabic authority file and the project style guide. It
  had silently dropped out of the *deployed* system prompt while the versioned prompt file still
  claimed it was present — and no check existed to catch it either. Found by reading the running
  prompt against the file, not by any test. Instructions can fall out of a prompt; a rule in code
  cannot fall out unnoticed.
- **Fixing one string broke a compliance control two workflows away.** Aligning the opt-out line to
  the client's canonical wording meant the keyword customers are shown is now quoted — and the reply
  handler stripped ordinary punctuation but not quote characters, so a customer copying the keyword
  back verbatim would not have been recognised as opting out. Nothing failed loudly; it would simply
  have been logged as an ordinary reply. A compliance control must not depend on the customer
  stripping the sender's own punctuation.

**Grammatical gender turned out to be a data problem, not a prompt problem.** Arabic agreement
depends on who the customer is, so the model is never asked to infer it from a name. It is resolved
once at intake and frozen alongside the language, so the register cannot shift between the first
message and the last, and `unknown` is a first-class value that asks for gender-neutral phrasing
rather than a guess — a wrong guess is visible to a native reader in a way neutral phrasing never is.
The heuristic checks explicit name lists *before* the morphology rules, because the endings that
usually mark a feminine name also end several common male ones.

---

## The economics (illustrative model)

> These figures are a transparent model, not measured client results. This is a self-initiated
> project; no real client outcomes are represented.

**What it costs to run** (a store with ~1,000 abandoned carts/month): roughly **$86/month** —
n8n hosting ~$6, WhatsApp messages ~$45, Anthropic API ~$35. Supabase and Slack sit on free tiers.

**Illustrative return.** A store doing $100K/month in revenue is abandoning roughly $230K/month of
carts at a 70% abandonment rate. Recovering **5%** of that is ~$11,500/month. Against roughly $600/month
all-in (infrastructure plus a service retainer), that models to about **19×**. Doubling the recovery
rate doubles the multiple.

I deliberately do not quote a channel open rate. The commonly repeated "WhatsApp gets 90%, email gets
15%" numbers are unsourced, and a buyer who checks one of them stops trusting all of the others. What
is defensible is directional and enough: recovery email underperforms in these markets, WhatsApp is
read within minutes, and recovering a small single-digit percentage of carts a store has already
written off pays for the system many times over — unlike an ad budget, on traffic already paid for.

**The half of the return that is not in that model:** at the end of it the store owns a WhatsApp
automation runtime, not a subscription. The message history, the customer contact record and the
opt-out suppression list are in their own database. The next process — COD confirmation, order
updates, win-back — is built on the same stack rather than bought again. A $29/month app is cheaper
every month and owns nothing at the end of any of them.

---

## Deploying this for your store

I build this on **your** stack — your Shopify store, your WhatsApp number, your Supabase project,
your languages and markets. You own the workflows, the database and the opt-out record. Nothing here
is a seat in my dashboard, and nothing stops working if we stop working together.

That is what the setup fee buys, and it is why it is not comparable to a monthly app subscription:
one is a build you keep, the other is access you rent.

- Setup: **Levant** $1,000–1,800 · **Gulf** $1,800–3,500
- Retainer: $300–800/month (monitoring, copy optimization, seasonal campaigns)
- Live in days. WhatsApp Business API in MENA needs no US-style A2P registration, but touches 2 and 3
  fall outside WhatsApp's 24-hour session window and need Meta-approved template messages — about a
  day of approval, and part of onboarding rather than an afterthought.

Also part of onboarding, because they make the automation look broken when missed: the checkout must
collect a phone number, shipping zones must cover the target markets, and those markets must actually
contain the products.

If your store sells into the Gulf or the Levant, your customers are on WhatsApp, and your Arabic
matters to you, [let's talk](https://husseinrmaity.github.io).

---

## Tech stack

n8n (self-hosted) · Claude Haiku 4.5 + Sonnet 5 · Shopify GraphQL Admin API 2026-07 · Twilio WhatsApp
Business API · Supabase (Postgres) · Slack · aladhan.com.

**Author:** Hussein Rmaity — WhatsApp-first AI automation for MENA. Portfolio: [husseinrmaity.github.io](https://husseinrmaity.github.io) · Code: [github.com/HusseinRmaity/whatsapp-cart-recovery-mena](https://github.com/HusseinRmaity/whatsapp-cart-recovery-mena).
