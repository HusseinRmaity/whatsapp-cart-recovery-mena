---
version: 17
last_updated: 2026-09-08
v17_change_reason: |
  The model now receives the customer's first name ALREADY IN ARABIC when the cart language is
  Arabic and the stored name is a Latin spelling we recognise. Reported by Hussein: the static
  fallback greeted `مرحباً Hussein` while a generated message said `مرحباً حسين`, so the same
  customer was addressed two different ways depending on whether the checker had degraded the
  message. The lookup lives in `Build Touch Message Request`, covers 35 spellings taken from the
  name lists already in workflow 01, and leaves an unrecognised name in Latin script - which is
  what arabic-master-reference.md section 5 requires. It is a lookup, never a transliteration
  engine. New harness `tests/build-touch-request.test.js` (14), red-green verified.
v16_change_reason: |
  DEPLOYED. Second ruling of the same day, on the message the v15 fix produced: the model wrote
  `لأتم عملية الشراء`, prefixing the canonical CTA with a ل so it reads as a first-person
  "so that I complete the purchase". New rule 14 (`cta_prefixed`) rejects `ل`, `س` and `ب` welded
  onto either approved CTA; `و` and `ف` stay allowed as plain conjunctions. The check runs against the
  RAW body, because the CTA whitelist masks those phrases out before every other marker - which is
  exactly why a prefixed CTA passed unexamined. The prompt now also says not to weld a letter on.
v15_change_reason: |
  DEPLOYED system-prompt change, and a REVERSAL of two earlier rulings. Ruled by Hussein
  2026-09-08 on the two touches delivered that day, both of which read `حضرتك تركتيهما`.
  The ي carrier is the DIALECT spelling. The MSA 2nd-person feminine past is written BARE with a
  final kasra (`تركتِ`), the masculine is bare (`تركت`), and neither takes an attached object
  pronoun. Three things changed together:
    - the REGISTER note stops teaching the ي carrier and tells the model to name the items;
    - the female GENDER note asks for the kasra and lists all three wrong forms;
    - the male GENDER note says explicitly that the past is bare and carries no diacritic.
  Checker: rule 8 (`feminine_suffix_missing_ya`) is DELETED - it REQUIRED the wrong spelling, so it
  could not be narrowed, only removed. Rule 10 (`bare_feminine_ya`) now also matches a ي that
  carries an object pronoun, which is what rule 8 used to exempt. The no-vowel-marks rule gains one
  narrow carve-out: a kasra is tolerated only at the END of a known feminine-past stem, and only on
  a cart whose gender is female.
v14_change_reason: |
  DEPLOYED system-prompt change. The religious-greeting ban is NARROWED so it stops contradicting
  the Gulf register note. Ruled by Hussein 2026-09-01: keep حياك الله, narrow the ban.
  Cause: the first live GULF touch (cart 598da7a2, 2026-09-01 16:45:30Z) opened with حياك الله and
  shipped with `message_degraded: false`. Two parts of the prompt disagreed:
    - system prompt: "No religious greetings and no assumptions about the customer's faith."
    - REGISTER_NOTE.gulf: "natural greetings such as حياك الله fit where they suit the sentence."
  The model followed the register note. The checker did not object because its religious rule only
  ever matched إن شاء الله — so a phrase one half of the prompt banned went to a handset unflagged.
  Same defect CLASS as 2026-08-07 (the إن شاء الله ban silently absent from the deployed prompt while
  the docs claimed otherwise): two instructions in conflict and no rule adjudicating between them.
  The ban now distinguishes a courtesy formula that is polite REGISTER in its market from religious
  SUBSTANCE. Still banned and unchanged: presuming faith (السلام عليكم as an opener) and invoking God
  for outcomes, timing or logistics (إن شاء الله), which stays absolute.
  NO checker change — `Parse Touch Message` was already correct. Two tests pin the ruling: حياك الله
  passes in the Gulf register, and إن شاء الله still degrades there, so the narrowing is not a
  loophole. 54 -> 56.
v13_change_reason: |
  DEPLOYED change to `REGISTER_NOTE.levant_egypt` (the per-market block in the USER message, built in
  `Build Touch Message Request` — not the system prompt body this file reproduces, which is
  unchanged). حضرتك is now stated as REQUIRED at least once in the body, on every touch, rather than
  merely "natural here".
  Cause: touch 3 of cart 9560cb8f degraded with `missing_respectful_form` (2026-09-01 15:00:28Z) and
  the customer got the static template. Two contributing factors, both real:
    1. A latent mismatch that predates v12 — the prompt SUGGESTED حضرتك while `Parse Touch Message`
       treats its absence as a hard rejection for levant_egypt carts. Prompt and checker disagreed
       about whether the honorific was optional.
    2. The v12 rule-13 wording ("حضرتك belongs later in the sentence, not beside the name") plausibly
       pushed the model to drop it entirely on touch 3, which is the shortest and gentlest of the
       three. Introduced while fixing the greeting defect; owned rather than explained away.
  Touches 1 and 2 on the same cart were NOT degraded, so this is probabilistic rather than a hard
  break — which is exactly why the fix is to align the prompt with the checker instead of tuning
  wording until one generation looks right.
v12_change_reason: |
  DEPLOYED prompt change, and two new deterministic rules beside it (12 and 13). Both come from one
  message: the first model-generated Arabic touch this system has ever delivered (cart 9560cb8f,
  touch 1, 2026-09-01 14:33:37Z), which passed all eleven rules that existed and was still wrong
  twice. Ruled by Hussein the same hour.
    - `متى حبيت` — حبيت is Levantine for "you liked/wanted"; MSA is متى شئت / متى رغبت. No rule had
      ever looked at VOCABULARY: the eleven checked pronouns, imperatives, agreement, vowel marks
      and religious phrasing, so a dialect word was completely unguarded.
    - `مرحباً حضرتك حسين` — the honorific must not be stacked against the name in the greeting.
      Correct is the bare name (مرحباً حسين) or the prepositional مرحباً بحضرتك.
  Rule 13 anchors on the GREETING rather than the name, because the model transliterates: the cart
  carried `Hussein` and the message said حسين, so matching `first_name` would have missed it.
  A third suspected issue in the same message — `بمنتجان` after a preposition, where the dual should
  arguably be بمنتجين — was raised and NOT ruled a defect. No rule was added for it.
v11_change_reason: |
  Documentation only — the system prompt body is UNCHANGED and nothing was redeployed. Records the
  2026-08-31 ruling that rule 8 (`feminine_suffix_missing_ya`) applies to female customers only,
  after the first Arabic touch ever generated for a male customer was degraded to the static
  template by it (cart f75d8d6a, live 2026-08-28). The deterministic-quality table below is the
  document of record for degrade reasons, so leaving it describing the pre-ruling behaviour is the
  same drift class as the 2026-08-07 `إن شاء الله` defect.
v10_change_reason: |
  Reference-only change: the upstream Arabic authority `arabic-style.md` was merged into
  `arabic-master-reference.md` (work root) on 2026-08-31 and deleted. Citations in this file were
  remapped to the master's numbering. The system prompt body, the model, and every rule are
  UNCHANGED — this is a pointer update, not a prompt revision.
v9_change_reason: |
  `arabic-style.md` (repo root, now `arabic-master-reference.md`) arrived as the authoritative Arabic source, vetted `[OK]` throughout,
  and reconciling it against this prompt produced four rulings from Hussein (2026-08-07):
  (1) `أكمل طلبك` and `أتم عملية الشراء` are CANONICAL CTAs and are now whitelisted — the checker
  masks them before the imperative markers run, so `أكمل` stays blocked everywhere else;
  (2) the bare 2nd-fem past must NOT carry the ي (`رغبت`, not `رغبتي`) — the §6c question, open since
  2026-08-04 on a delivered message, is now rule 10;
  (3) §3 "Gender agreement" applies to Case 2, so the blanket ban on 2nd-fem forms becomes
  CONDITIONAL on a real gender signal — `customer_gender` is inferred once at intake (workflow 01,
  name heuristic + Haiku fallback), stored sticky on `carts`, and passed in the user prompt;
  (4) only the FULL MSA feminine present is acceptable (`تستخدمين`); the dropped-ن colloquial form
  (`تستخدمي`) stays wrong for everyone, including a female customer.
  Also added: the fixed glossary from `arabic-master-reference.md` §8 as canonical wording the model must not
  paraphrase or inflect, the quantity-plural rule from §5.1, and the canonical opt-out line
  `لإيقاف الرسائل، أرسل "توقف"`. Fixed an example that wrote `AED 1,469.91` — currency goes AFTER
  the number (§3.1), and the example contradicted the instruction to reproduce `total_display`
  verbatim. Rule 2 (ت + kasra) retired as unreachable: rule 9 rejects every vowel mark already.
v8_change_reason: |
  Two Arabic rules ruled by Hussein after reviewing DELIVERED messages, both invisible to the
  existing checks: (1) 2nd-person-feminine PRESENT forms (تستخدمي / تستخدمين) are wrong — the
  imperative marker could not match them because استخدمي cannot appear inside تستخدمي under the
  word-boundary guard; (2) an object pronoun on a 2nd-fem past verb takes the ي carrier
  (تركتيهما, not تركتهما) while the BARE form stays exactly as ruled in §1.1.
  **(2) was REVERSED on 2026-09-08 - see v15 above. Kept here as the record of what shipped.** All markers now also
  allow an attached و/ف proclitic — وتركتهما was slipping past for that reason alone. The Levant
  register note additionally tells the model not to command the customer to use the discount code,
  since reaching for the imperative on touch 2 is what kept tripping the register rules.
v7_change_reason: |
  Documentation-only correction, no behaviour change. The v6 deploy updated the workflow but left
  THIS file's system-prompt body on the old universal-حضرتك rule, so the versioned prompt and the
  running prompt disagreed on the one thing v6 changed. Body, user-prompt template and the
  degrade_reason table now match the deployed `Build Touch Message Request` verbatim, and the new
  regression harness (tests/parse-touch-message.test.js) is referenced. Found while fixing the
  ReferenceError that same deploy left in `Parse Touch Message`.
v6_change_reason: |
  Hussein ruled all four open style-guide questions (see arabic-style-guide.md v2):
  (1) register varies by MARKET — حضرتك is Levant/Egypt, not Gulf, so the prompt now receives a
  per-market register note computed from country_code and the missing_respectful_form check only
  fires for Levant/Egypt; (2) money is formatted in code (42,663,000 LBP) and handed to the model
  ready to use, with a check rejecting raw digit runs; (3) touch 3 is the GENTLEST of the three,
  not the hardest — the escalation is the offer in touch 2, never the tone; (4) the invented
  example lines here are to be replaced by real Noon/Namshi/Ounass/Salla copy once Hussein
  supplies screenshots — Claude must not fabricate them.
authority: |
  Arabic rules in this prompt are NOT decided here. Upstream authority is `arabic-master-reference.md` at the
  work root (Hussein's, applies to every project); `prompts/arabic-style-guide.md` is the Case 2
  layer that turns it into enforceable rules. If a rule is missing or ambiguous, ask him — do not
  infer it.
v5_change_reason: |
  My v4 agreement rule was WRONG and Hussein corrected it. I had encoded حضرتك as a 3rd-person noun
  phrase (حضرتك اختارت); it is a polite SECOND person and takes 2nd-person verbs (حضرتك اخترت).
  The error survived my own testing because the example I used, تركت, is spelled identically for
  2nd person and 3rd feminine, so it read as correct under both rules. Hollow verbs (اختار → اخترت
  vs اختارت) are where the difference shows. Prompt and the deterministic check both corrected, and
  the check now rejects 3rd-person forms of BOTH genders after حضرتك.
v4_change_reason: |
  A delivered message read "لاحظنا أن حضرتك ترك ..." — correct respectful register, wrong
  conjugation. حضرتك is a noun phrase and takes 3rd-person FEMININE agreement (تركت), so the
  masculine form is a grammatical error a native reader notices immediately, and it reads as
  careless rather than casual. Added the agreement rule with the real WRONG/RIGHT pair, and a
  matching deterministic check in Parse Touch Message
  (`informal_arabic:verb_agreement_after_hadretak`) so it cannot be sent even if the model slips.
change_reason: |
  v2 rewrote the formality rule as a prohibition (always حضرتك, never أنت/أنتِ) after v1 produced
  inconsistent register. v2 was still not obeyed — the next generation wrote
  "سلتك محفوظة لحضرتك متى أردتِ", mixing the respectful form with an أنتِ verb. v3 does two things:
  (a) adds contrastive WRONG/RIGHT examples drawn from the actual failures, since an abstract
  prohibition was not enough to move the model off natural 2nd-person feminine address, and
  (b) stops relying on the prompt alone — `Parse Touch Message` now applies a deterministic
  informal-marker check and substitutes the static template if it trips. Verified: the generation
  after this change passed the check un-degraded and was delivered.
model: claude-sonnet-5
purpose: Generate the personalized WhatsApp recovery message for touches 1, 2 and 3 of an abandoned Shopify cart, in the customer's language
---

# Touch Message Generator

Produces the **body text** of an outbound WhatsApp abandoned-cart recovery message for a MENA
Shopify store. One prompt serves all three touches; `touch_number` changes the intent, not the
prompt. Runs on Claude **Sonnet 5** — this message is a stranger's first impression of the
brand, in Arabic, and tone/formality errors are visible to a native speaker.

## Why the model does NOT write the recovery link

The model returns **body text only**. The `Parse Touch Message` node appends, deterministically:

1. the Shopify `recovery_url` on its own line, and
2. on touch 1 only, the localized opt-out line (`STOP` / `توقف` / `STOP`).

Two reasons. A ~150-character signed Shopify checkout URL is exactly the kind of token an LLM
silently truncates or "tidies", and a broken recovery link makes the entire message worthless.
And the opt-out instruction is a compliance control (spec §7) — it must be present with
certainty, not with high probability. Anything that must be exactly right is not the model's job.

Budget: the workflow gives the model **320 characters** for the body so that body + link +
opt-out line stays under the 500-character limit in spec §6.

## System prompt

```
You write ONE WhatsApp message from a MENA online store to a customer who added items to their
cart and left without completing checkout. You are a helpful shop assistant, not a marketer.

Write in the customer's language (given as language = ar | en | fr | mixed):
- "ar"    Natural Modern Standard Arabic, adjusted to the customer's country.
- "en"    Natural, warm professional English.
- "fr"    Natural professional French.
- "mixed" Lead in Arabic; a light English touch is acceptable.

Touch number decides the intent - this is the only thing that changes between touches:
- touch 1 (about an hour after they left): a helpful reminder, ZERO pressure. Their cart is
  saved. No discount, no urgency, no persuasion.
- touch 2 (next day): offer the discount code you are given, framed as a gift from the store,
  never as desperation and never as a countdown. State the code exactly as given.
- touch 3 (two days later): the GENTLEST of the three, not the hardest. It is a warm goodbye:
  say plainly that this is the last message about this cart, and that it stays saved if they
  change their mind. The escalation in this sequence is the OFFER in touch 2, never the tone.
  No fake scarcity, no invented stock levels, no invented deadlines, no guilt, no pressure.

The message MUST:
1. Greet the customer by first name if one is given; otherwise a warm neutral greeting.
   In Arabic, greet with the NAME ALONE: مرحباً حسين. Do NOT stack the honorific and the name
   in the greeting - مرحباً حضرتك حسين is WRONG. If you want the honorific in the greeting
   itself, the only correct form is the prepositional مرحباً بحضرتك. Otherwise حضرتك
   belongs later in the sentence, not beside the name.
2. Name the actual product(s) they left - at most 2 by name, then "and N more" if there are
   more. Use the titles exactly as given, including Arabic titles.
3. State the cart total WITH its currency code. Never state an amount without its currency,
   and never convert between currencies.
4. On touch 2 only: state the discount code exactly as provided.

Cultural rules (non-negotiable):
- Formality: always respectful. The customer is a stranger to the store. NEVER use أنت / أنتِ and
  never use informal imperatives (خذي وقتك، أردتِ), however friendly the brand. Grammatical gender
  is GIVEN to you in the user message - use it, and do not infer it from the name yourself. The
  RESPECTFUL EXPRESSIONS THEMSELVES VARY BY MARKET - use the market guidance given in the user
  message, not one honorific everywhere.

  These are wrong in EVERY market - informality to a stranger:
    WRONG: خذي وقتك، السلة بانتظارك   (informal feminine imperative)
    WRONG: سلتك محفوظة متى أردتِ   (أنتِ verb)
- NEVER use إن شاء الله or "God willing" for delivery, timing or logistics. Say what is true,
  or سنبذل قصارى جهدنا.
- Do not ASSUME the customer's faith, and never make the message religious in substance.
  مرحباً / Hello / Bonjour is always safe and is the default.
  NARROWED 2026-09-01 (Hussein): a conventional COURTESY formula that is simply polite register
  in its market is allowed - حياك الله in the Gulf is a greeting, not a religious claim, and the
  Gulf guidance below offers it deliberately. What stays banned is presuming faith (do not open
  with السلام عليكم) and invoking God for OUTCOMES - see the إن شاء الله rule above, which is
  absolute and unchanged.
- No fake scarcity ("only 2 left!"), no invented deadlines, no guilt, no hype.

Arabic canonical wording - the store's FIXED vocabulary (arabic-master-reference.md section 8).
When you express one of these ideas, reproduce the phrase EXACTLY as written here.
Do not paraphrase it and do not inflect it for gender - these are fixed strings that
must read identically in every message the store ever sends:
    your cart              سلتك
    we saved your cart     حفظنا لك سلتك
    your order is waiting  طلبك بانتظارك
    complete your order    أكمل طلبك
    complete the purchase  أتم عملية الشراء
    discount code          كود خصم
    free shipping          شحن مجاني
    we will do our best    سنبذل قصارى جهدنا
    thank you              شكراً لك

Counting products (Arabic number agreement):
    1 item      منتج واحد
    2 items     منتجان
    3-10 items  3 منتجات   (Western digit + plural)
    11+ items   15 منتجاً   (Western digit + singular, per MSA)

Arabic vocabulary - MODERN STANDARD ARABIC ONLY:
- Dialect words are forbidden, however natural they sound in speech. These are all WRONG:
    حبيت، بدك، بدي، عايز، شو، ليش، هلق، كتير، منيح، يلا، بكرا، لسا، هيك
- For "whenever you like" write متى شئت or متى رغبت. NEVER متى حبيت.

Arabic spelling:
- Write Arabic WITHOUT vowel marks: no fatha, damma, kasra, shadda or sukun.
  Write اخترت, never اخترتِ. Commercial Arabic is written unvowelled.
- The tanween on مرحباً / شكراً is normal and expected - keep it.

Style:
- HARD LIMIT: 320 characters. Shorter is better. This is WhatsApp, not email.
- Do NOT write any URL, link, "click here", or opt-out/STOP instruction. The system appends
  the real link and the opt-out line itself. Writing your own will break the message.
- At most one tasteful emoji, and only if it fits. Default to none.
- Output ONLY the message text. No quotes, no JSON, no code fences, no preamble, no signature.
```

## User prompt template

```
Store: {{store_name}}
Customer:
- first_name: {{first_name}}
- language: {{language}}
- country: {{country_code}}
- gender: {{customer_gender}}    <- female | male | unknown; never inferred by the model
Cart:
- items: {{items_summary}}          e.g. "عباية كلاسيكية سوداء ×1; Silk Scarf ×2; and 1 more"
- item_count: {{item_count}}
- total: {{total_display}}   <- write the total EXACTLY like this, do not reformat it
Touch:
- touch_number: {{touch_number}}
- discount_code: {{discount_code}}  (touch 2 only; empty otherwise)


{{register_note}}

{{gender_note}}

Write the message body now.
```

`{{total_display}}` is formatted by `fmtMoney()` in `Build Touch Message Request`, not by the model
(style guide §3.1): `42,663,000 LBP`, `1,249 AED`, `1,747.75 AED`.

`{{register_note}}` is selected by `register_zone`, computed from `country_code` in the same node.
The variable is formal-vs-informal; the **expressions that carry it are market-specific**, so the
model is told which market it is writing for rather than handed one honorific to use everywhere
(style guide §1.2, ruled by Hussein 2026-08-04):

| `register_zone` | Countries | Note given to the model |
|---|---|---|
| `levant_egypt` | LB, JO, SY, PS, EG | Use `حضرتك`; it is a polite **2nd** person, so verbs after it stay 2nd person (`حضرتك اخترت`, never `اختارت` / `اختار`). Do **not** attach an object pronoun to that verb - name the items instead (`حضرتك تركتِ ...`, never `حضرتك تركتيهما`). Ruled 2026-09-08. |
| `gulf` | AE, SA, QA, KW, BH, OM | **Do not** use `حضرتك` — it reads as Egyptian/Levantine. Warm, plain, formal MSA; Khaleeji warmth (`حياك الله`) where it suits |
| `other` | everything else | Plain, warm, formal MSA |

`{{gender_note}}` is selected by `customer_gender`, which is **inferred once at intake** (workflow
01: name heuristic, then Haiku for ambiguous names on Arabic carts only) and stored sticky on
`carts.customer_gender`, so the register cannot change between touch 1 and touch 3. The model is
never asked to infer it — a wrong guess is visible to a native speaker on a real handset, and
`unknown` is a better answer than a coin flip (arabic-master-reference.md §5 prefers rephrasing to guessing).

| `customer_gender` | Note given to the model |
|---|---|
| `female` | Feminine agreement. Use the **full MSA** present forms that keep the ن (`تستخدمين`, `تطلبين`); the dropped-ن colloquial form (`تستخدمي`) is wrong. The past is written **bare with a final kasra** and takes **no** ي and **no** attached object pronoun: `تركتِ`, `اخترتِ` - never `تركتي`, `تركتيهما` or `تركتِهما`. The kasra is the only diacritic permitted anywhere in the message. Reversed the 2026-08-04 ruling on 2026-09-08. |
| `male` | Masculine agreement throughout (`اخترت`, `طلبك`). No feminine forms |
| `unknown` | **Do not guess.** Prefer phrasing that avoids gendered verbs and pronouns entirely (`السلة محفوظة`, `يمكن إتمام الطلب`). If unavoidable, masculine as the MSA default |

## Examples

| Input | Example output (shape, not verbatim) |
|---|---|
| touch 1, ar, AE, "ليلى", عباية كلاسيكية سوداء ×1, 350 AED | `مرحباً ليلى، لاحظنا أن حضرتك تركت عباية كلاسيكية سوداء في السلة بقيمة 350 AED. السلة محفوظة، ويمكن إتمام الطلب متى ما ناسبك.` |
| touch 2, en, LB, "Sara", Silk Scarf ×2 and 1 more, 1469.91 AED | `Hi Sara, your cart with the Silk Scarf and 1 more item (1,469.91 AED) is still saved. Here's a gift from us: use SAVE10 for 10% off whenever you're ready.` |
| touch 3, fr, MA, no name, Kaftan ×1, 5165.65 AED | `Bonjour, dernier message au sujet de votre panier (Kaftan, 5 165,65 AED). Il reste enregistré si vous souhaitez finaliser. Sans réponse, nous n'insisterons pas davantage.` |

## Expected output

A single plain-text WhatsApp message body, in the customer's language, **under 320 characters**,
containing no URL and no opt-out instruction.

`Parse Touch Message` then builds the final message:

```
<body>
<recovery_url>
[touch 1 only] Reply STOP to unsubscribe.   /   للإيقاف أرسل: توقف   /   Répondez STOP pour vous désabonner.
```

## Failure behaviour

On a failed, empty, or over-length Anthropic call the node substitutes a static template keyed
by `language` × `touch_number` and **still sends** — a slightly generic reminder beats silence,
and the link is the part that actually recovers the cart. The run is logged with
`message_degraded: true` so the daily digest can show how often the model was bypassed.

The same substitution happens when the generated text fails a **deterministic quality check** in
`Parse Touch Message`, with the reason recorded in `degrade_reason`:

| Check | `degrade_reason` | Why it is enforced in code |
|---|---|---|
| Message contains a URL | `model_wrote_a_url` | Two links, one possibly mangled, makes the message worthless |
| The raw digit run appears instead of the formatted total (`42663000`) | `unformatted_amount` | Formatting asked of a model drifts between messages; `42663000 LBP` is unreadable |
| Arabic uses `أنت` / `أنتِ` | `informal_arabic:informal_pronoun` | v2 prompt alone did not hold the register |
| Arabic uses an informal imperative (`خذي`, `استخدم`, …) | `informal_arabic:informal_imperative` | The two canonical CTAs (`أكمل طلبك`, `أتم عملية الشراء`) are masked out first — whitelisted 2026-08-07 |
| `إن شاء الله` for delivery or timing | `informal_arabic:religious_phrase` | Banned in three documents and enforced in none of them until 2026-08-07 — the instruction had drifted out of the deployed prompt |
| Arabic omits `حضرتك` — **`levant_egypt` carts only** | `informal_arabic:missing_respectful_form` | Required where it is natural; requiring it in the Gulf would force an Egyptian honorific on a Khaleeji customer |
| `حضرتك` followed by a 3rd-person past verb (`حضرتك اختارت`) | `informal_arabic:verb_agreement_after_hadretak` | Shipped in a live message; wrong agreement reads as careless |
| Colloquial dropped-ن feminine present (`تستخدمي`) | `informal_arabic:colloquial_feminine_present` | Ruled 2026-08-04 after `يسعدنا حضرتك تستخدمي كود الخصم` was **delivered**. Still wrong for a *female* customer too — arabic-master-reference.md §2 takes the MSA form whenever one is contested |
| MSA feminine present (`تستخدمين`) sent to a male or unknown customer | `informal_arabic:feminine_present_wrong_gender` | Correct **only** for `customer_gender = female` (ruled 2026-08-07). `unknown` means the model was asked for neutral phrasing and ignored it |
| ~~Pronoun on a 2nd-fem past verb without the ي~~ | ~~`informal_arabic:feminine_suffix_missing_ya`~~ | **DELETED 2026-09-08.** Ruled 2026-08-04, narrowed to female-only 2026-08-31, removed outright when Hussein ruled the ي carrier itself wrong. The rule demanded the dialect spelling, so it could not be narrowed again - only deleted. Both touches sent on 2026-09-08 shipped the form it required. |
| 2nd-fem past carrying a ي (`رغبتي`, `تركتيهما`) | `informal_arabic:bare_feminine_ya` | Style guide §6c, open since 2026-08-04 on a **delivered** message; ruled wrong 2026-08-07. **Widened 2026-09-08** to match a ي that carries an attached object pronoun, which rule 8 used to exempt. It now owns every case, bare or suffixed. |
| A canonical CTA carrying a `ل` / `س` / `ب` proclitic (`لأتم عملية الشراء`) | `informal_arabic:cta_prefixed` | Ruled 2026-09-08 on a **delivered** message. Tested against the raw body, before the CTA whitelist masks the phrase out |

**Regression harnesses:** `tests/infer-gender.test.js` covers the intake-side gender signal this
prompt now depends on (the exception lists that stop `أسامة` and `مصطفى` being misgendered, `unknown`
for unisex names, and the rule that a non-Arabic cart never triggers a paid Haiku call).
`tests/parse-touch-message.test.js` runs the real `jsCode` out of
`workflows/02-verifier-touch-sender.json` against fixtures — every language × every touch on the
fallback path, plus each check above in both directions. Run it after any edit to this prompt, the
style guide, or the node (`node tests/parse-touch-message.test.js`). It exists because the v6 deploy
left three fallback templates referencing deleted variables, which threw on **every** execution and
was invisible to inspection.

The Arabic matcher is deliberately **high-precision rather than exhaustive**: over-matching would
send every Arabic customer a static template and silently delete the personalisation that is the
point of the feature. It flags only unambiguous markers, and uses the Arabic letter range
`ء-ي` for word boundaries because JavaScript's `\b` is ASCII-only. Unit-tested against
both real failing generations and all three fallback templates (8/8).

**The Arabic fallback templates themselves use `حضرتك`.** They originally did not — they used
`يمكنك` / `استخدم` / `رغبت` — which would have meant substituting one register violation for
another whenever the check tripped.
