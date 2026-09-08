---
version: 1
last_updated: 2026-08-04
change_reason: Initial version (Milestone 4.3)
model: claude-haiku-4-5-20251001
purpose: Classify a customer's inbound WhatsApp reply to an abandoned-cart recovery message so workflow 03 can route it
authority: |
  Arabic wording in this file and in the workflow's static replies derives from
  prompts/arabic-style-guide.md, which Hussein owns as the native speaker. The classifier reads
  Arabic; it never writes customer-facing Arabic.
---

# Reply Intent Classifier

Classifies one inbound WhatsApp message from a customer who was sent an abandoned-cart recovery
touch. Runs on Claude **Haiku 4.5** — this is a four-way bucket over a short message, which is
exactly what Haiku is for; Sonnet would cost 3× for no gain.

The workflow reads `.intent` and routes:

| Intent | Route |
|---|---|
| `opt_out` | suppress the cart permanently, one confirmation message, never message again |
| `wants_to_buy` | Slack the owner with full cart context + holding reply to the customer |
| `question` | Slack the owner with full cart context + holding reply to the customer |
| `other` | Slack the owner (quieter wording), no holding reply, schedule untouched |

## Opt-out is checked in code BEFORE this prompt runs

`Check Opt-Out Keywords` matches `STOP`, `توقف`, `الغاء`, `إلغاء`, `UNSUBSCRIBE`, `ARRET` on the
trimmed message body and short-circuits straight to suppression without calling the model at all.

The opt-out line the system sends says *"reply STOP"* / *"للإيقاف أرسل: توقف"*, so a customer who
does exactly what they were told must be honoured with certainty, not with high probability. Same
rule as the recovery link and the opt-out line itself (decisions.md 2026-08-03): anything that must
be right every time is not the model's job.

The model still has an `opt_out` class, because it catches what the keyword list cannot —
"please don't message me again", "لا أريد رسائل", "arrêtez de m'écrire". Between the two, a
false `opt_out` costs one lost recovery and a false negative costs a compliance breach and an
annoyed customer, so the classifier is told to lean toward suppression when it is unsure.

## System prompt

```
You classify ONE inbound WhatsApp message from a customer of a MENA online store. The store sent
them a message about a shopping cart they abandoned; this is their reply. Assign ONE intent.

Intents:
- "opt_out"      They want the messages to stop. Any request to unsubscribe, stop, be removed, or
                 be left alone - however politely or rudely phrased, in any language. Also anger
                 directed at being messaged at all.
- "wants_to_buy" They intend to complete the purchase or are asking to be helped to complete it:
                 "I'll take it", "how do I pay", "can you send the link again", "is cash on
                 delivery available", "reserve it for me".
- "question"     A genuine question about the products, delivery, sizing, price, stock, returns,
                 or the store - without a clear statement of intent to buy.
- "other"        Anything else: a greeting with no content, a thank-you, an emoji, a wrong number,
                 spam, or a message you cannot interpret.

Rules:
- Judge intent from substance, not politeness or length.
- If a message contains BOTH a question and a clear intent to buy, choose "wants_to_buy".
- If you are torn between "opt_out" and anything else, choose "opt_out". A customer who is
  wrongly left alone loses the store one sale; a customer who is wrongly messaged again after
  asking to stop is a compliance failure.
- "Not now" / "later" / "I changed my mind" is NOT an opt-out - it is "other". They are declining
  this cart, not the channel.
- Arabic, Arabizi (Arabic in Latin letters), English, French and mixed messages are all normal
  input. Judge them equally.
- Output STRICT JSON only. No prose, no markdown, no code fences.

Output shape:
{"intent": "wants_to_buy|question|opt_out|other", "reason": "<=12 word justification"}
```

## User prompt template

```
Customer language on file: {{language}}
Touches sent so far: {{touches_sent}}
Cart: {{items_summary}} - {{total_display}}
Their message:
{{inbound_message}}
```

The cart context is included because the same words mean different things against a cart: "how
much is shipping to Beirut" is a `question`, while "send me the link" against a cart with an
expired recovery URL is `wants_to_buy`.

## Examples

| Reply | Expected output |
|---|---|
| `هل في توصيل لبيروت؟` | `{"intent":"question","reason":"asks about delivery to Beirut"}` |
| `بدي اشتري، كيف بدفع؟` | `{"intent":"wants_to_buy","reason":"states intent to buy, asks how to pay"}` |
| `Please stop messaging me` | `{"intent":"opt_out","reason":"explicit request to stop messages"}` |
| `Not now, maybe later` | `{"intent":"other","reason":"declines this cart, not the channel"}` |
| `👍` | `{"intent":"other","reason":"no interpretable content"}` |

## Expected output

Strict JSON, e.g.:

```json
{"intent": "question", "reason": "asks whether the item ships to Lebanon"}
```

## Failure behaviour

An unparseable or failed Anthropic call defaults to **`other`** with the run logged as `partial`,
and the owner is still notified in Slack with the raw message text. The customer receives no
automated holding reply on this path — a message we could not read is one a human should answer,
and a holding reply promising a callback is a commitment the system should not make on a guess.

The cart's touch schedule is **never** modified by classification. Only `opt_out` stops the
sequence; a question or a purchase intent leaves touches 2 and 3 exactly where they were.
