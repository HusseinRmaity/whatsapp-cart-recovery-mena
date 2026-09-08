---
version: 7
last_updated: 2026-09-08
v7_change_reason: |
  Rule 14 added, ruled the same day on the message the v6 fix produced. A canonical CTA must not
  carry a proclitic: `لأتم عملية الشراء` reads first-person. The two CTAs are masked out before
  every other marker runs, so the prefix has to be caught against the raw body or not at all.
v6_change_reason: |
  REVERSAL of the 2026-08-04 ruling in §1.1a. Hussein, on the two touches delivered 2026-09-08,
  both of which read `حضرتك تركتيهما`: the ي carrier is DIALECT. The MSA 2nd-person
  feminine past is bare with a final kasra (`تركتِ`), the masculine is bare (`تركت`), and an
  object pronoun is not attached to it at all. Rule 8 is deleted, rule 10 is widened to cover the
  suffixed form it used to exempt, and rule 9 gains one narrow carve-out so the required kasra is
  not read as a banned diacritic. §1.1a, the rule table, §6c and the changelog all move together.
v5_change_reason: |
  Upstream authority renamed: `arabic-style.md` was merged into `arabic-master-reference.md` at the
  work root on 2026-08-31 and deleted. Every citation in this file was remapped to the master's
  numbering (old §1 grammar → §2, old §2 glossary → §8.x, old §3 → §3/§4/§5/§7). No rule, ruling, or
  enforcement point changed.
owner: Hussein (native speaker). Ruled items are not changed without his ruling.
upstream: |
  `arabic-master-reference.md` at the work root is the AUTHORITY and applies to every project. It
  replaced `arabic-style.md` on 2026-08-31 (same rules, merged and renumbered). This file is the
  Case 2 layer: it turns those rules into things a regex can enforce, and records the Case-2-specific
  rulings. Where the two disagree the conflict is put to the owner, never resolved by inference, and
  the ruling is recorded in §8 (gender, CTAs, vowel marks) and the change log.
purpose: Single source of truth for Arabic in customer-facing messages. The system prompt in touch-message-generator.md and the deterministic checks in workflow 02's `Parse Touch Message` both derive from this file.
---

# Arabic style guide — customer-facing messages

## Why this file exists

Arabic register in this system was wrong twice in one day, and both times a native speaker caught it
by reading a message that had already been delivered — not a check, not a test, not a review. That
is not a working quality loop.

Two conclusions followed, and they are the design of everything below.

1. **A model is not a reliable arbiter of Arabic correctness, and neither is a non-native reviewer.**
   The rules therefore live in a file a native speaker owns and rules on, and nothing here is
   inferred. One of the two errors survived review precisely because the test example used a verb
   (`تركت`) spelled identically in the 2nd person and the 3rd feminine, so it read as correct
   under both.
2. **Register compliance is probabilistic, so it cannot be requested politely from a model.**
   Every rule that can be checked mechanically is enforced in code — see the Enforcement column in
   §2 — and a message that fails is discarded in favour of a static respectful template, with the
   reason recorded so the degrade rate is visible rather than silent.

**How to use this file:** anything ruled here is authoritative. If a rule is missing or ambiguous,
ask the owner rather than inferring it.

---

## 1. Register and address

**Ruled:** always address the customer as `حضرتك` for someone the store has
never spoken to. Never `أنت` / `أنتِ`, never informal imperatives.

### 1.1 Verb agreement after حضرتك

`حضرتك` functions as a **polite second person**. A past-tense verb after it stays in the
**2nd person**. It does *not* shift to 3rd person, masculine or feminine.

| Form | Example | Verdict |
|---|---|---|
| 2nd person | `حضرتك اخترت` | ✅ correct |
| 3rd masculine | `حضرتك اختار` | ❌ wrong |
| 3rd feminine | `حضرتك اختارت` | ❌ wrong |

**Why the mistake was hard to see:** for sound verbs the 2nd-person and 3rd-feminine forms are
identical in unvowelled script, so the error is invisible:

| Verb | 2nd person (correct) | 3rd feminine (wrong) | Distinguishable? |
|---|---|---|---|
| ترك | تركت | تركت | no — identical |
| طلب | طلبت | طلبت | no |
| وضع | وضعت | وضعت | no |
| أكمل | أكملت | أكملت | no |
| **اختار** | **اخترت** | **اختارت** | **yes** |
| **أضاف** | **أضفت** | **أضافت** | **yes** |
| **أراد** | **أردت** | **أرادت** | **yes** |
| **زار** | **زرت** | **زارت** | **yes** |
| **اشترى** | **اشتريت** | **اشترت** | **yes** |

Hollow and defective verbs (اختار، أراد، زار، اشترى) and form-IV أضاف are where the error becomes
visible. They are exactly the verbs the deterministic check targets.

### 1.1a An attached object pronoun takes the ي carrier

**REVERSED 2026-09-08.** The rows below are kept because two live workflows shipped under them.
The ي carrier is the dialect spelling; MSA writes the 2nd-person feminine past bare with a final
kasra, and does not weld an object pronoun onto it. Name the items instead of pronouncing them.

| Form | Example | Verdict |
|---|---|---|
| bare | `حضرتك اخترت` | ✅ correct — §1.1, unchanged |
| bare | `حضرتك تركت السلة` | ✅ correct |
| **+ pronoun** | `حضرتك تركتيهما في السلة` | ❌ wrong since 2026-09-08 — the ي is dialect |
| **+ pronoun** | `حضرتك تركتهما في السلة` | ⚠ tolerated — no longer flagged, but prefer naming the items |
| **feminine, bare** | `حضرتك تركتِ السلة` | ✅ correct since 2026-09-08 |
| **masculine, bare** | `حضرتك تركت السلة` | ✅ correct since 2026-09-08 |


**Enforcement:** rule 8 below. It is a separate marker rather than an edit to rule 5's list,
precisely because the bare form stays as ruled.

**The rule applies to female customers ONLY — ruled 2026-08-31.** Unvowelled, `تركتهما` is
simultaneously the feminine form missing its ي *and* the correct 2nd-person **masculine** form, so
the check can only be applied where `carts.customer_gender` says the customer is female. Applied to
every cart, it degraded every Arabic message to a male customer down to the static template —
observed live on 2026-08-28, on the first Arabic touch this system ever generated for a man. The
master reference §5 rules the same way from the other direction: a clearly male name takes masculine
forms. A cart whose gender is `unknown` is deliberately **not** checked by this rule either;
`unknown` already means the model was asked for gender-neutral phrasing, master reference §5 accepts
the masculine as the MSA default, and rule 7b still rejects feminine present forms there.

**Known limitation, accepted deliberately:** these verb forms are also 1st-person singular past, so a
store writing `حفظتها لحضرتك` ("I saved it for you") would trip the check. `حفظ` is therefore
excluded from the list, and only verbs describing the **customer's** action on their own cart are
matched — ترك، اختار، أضاف، أراد، زار، اشترى، طلب، وضع، أكمل، نسي، بدأ.

### 1.2 Register varies by MARKET

`حضرتك` is **not** the universal answer. It is natural in Egypt and the Levant but reads slightly
off in the Gulf, where formality is warmer and less honorific-heavy.

**The variable is formal-vs-informal. The expressions that carry it are market-specific.** So the
model is told which market it is writing for and picks appropriate phrasing, rather than being
handed one honorific to apply everywhere.

| Zone | Countries | Guidance |
|---|---|---|
| Levant / Egypt | LB, JO, SY, PS, EG | Use `حضرتك`. 2nd-person verb agreement per §1.1. |
| Gulf | AE, SA, QA, KW, BH, OM | **Do not use `حضرتك`.** Warm, plain, formal MSA. Khaleeji warmth (`حياك الله`, `أبشر`) fits where it suits the sentence. |
| Other | everything else | Plain, warm, formal MSA. |

Informality (`أنت` / `أنتِ`, informal imperatives) is blocked in **every** market. Only the
*required presence of `حضرتك`* is zone-specific.

**Enforcement:** `register_zone` is computed from `country_code` in `Build Touch Message Request`
and drives both the prompt's market note and the `missing_respectful_form` check, which now fires
only for Levant/Egypt.

---

## 2. Rules currently enforced in code

Enforced in `Parse Touch Message` (workflow 02). A message failing any of these is discarded and the
static respectful template is sent instead, with the reason recorded in `degrade_reason` so the
failure rate is visible in `run_logs` rather than invisible.

| # | Rule | `degrade_reason` tag | Source |
|---|---|---|---|
| 1 | No `أنت` / `أنتِ` | `informal_pronoun` | §1 |
| ~~2~~ | ~~No 2nd-fem past with explicit kasra (`أردتِ`)~~ — **RETIRED 2026-08-07** | — | unreachable: rule 9 rejects every vowel mark first |
| 3 | No informal imperatives (`خذي`, `استخدم`, `تفضل`, …), **except** the two canonical CTAs, which are masked out before the markers run | `informal_imperative` | §1; whitelist §8.1 |
| 4 | `حضرتك` must appear (Levant/Egypt only) | `missing_respectful_form` | §1.2 |
| 5 | No 3rd-person verb after `حضرتك` | `verb_agreement_after_hadretak` | §1.1 |
| 6 | No URL written by the model | `model_wrote_a_url` | §4 |
| 7a | No **colloquial** dropped-ن feminine present (`تستخدمي`) — wrong for everyone | `colloquial_feminine_present` | §1; narrowed by §8 |
| 7b | **MSA** feminine present (`تستخدمين`) only for `customer_gender = female` | `feminine_present_wrong_gender` | §8 |
| ~~8~~ | ~~Pronoun on a 2nd-fem past verb needs the ي~~ | **DELETED 2026-09-08** — it required the dialect spelling, so it could not be narrowed a second time | — |
| 9 | No vowel marks (tanween excepted; **and a word-final kasra on a feminine-past stem when `customer_gender = female`, carved out 2026-09-08**) | `vowel_marks_present` | §8.2 |
| 10 | A 2nd-fem past must **not** carry the ي, bare or pronoun-suffixed (`رغبت`, not `رغبتي`; `تركتِ`, not `تركتيهما`) — **widened 2026-09-08** | `bare_feminine_ya` | §6c |
| 14 | A canonical CTA must carry no proclitic (`ل`, `س`, `ب`); `و` and `ف` are allowed | `cta_prefixed` | §8.2 |
| 11 | No `إن شاء الله` for delivery, timing or logistics | `religious_phrase` | §3; arabic-master-reference.md §7 |

All markers allow an attached **و / ف** proclitic. Without it `وتركتهما` and `وتستخدمي` slip through,
because the word-boundary guard demands a non-Arabic character before the stem and `و` is an Arabic
letter — which is exactly how `وتركتهما` reached a real handset.

Rules 1–5 apply only when `language = ar` (or `mixed`). The matcher is deliberately
**high-precision, not exhaustive**: over-matching would send every Arabic customer a static
template and silently delete the personalisation, which is worse than the occasional slip.


### 2.1 Why the checks live in code rather than in the prompt

The clearest evidence for the split above came from a single cart during the build. The same prompt,
on the same cart, fifteen minutes apart, produced one generation that tripped the
informal-imperative rule and one that passed every check — and the failing one used the honorific
`حضرتك` correctly in the clause immediately before the informal imperative. Register is not a
property a prompt can guarantee; it is a distribution.

Two structural lessons are baked into §2 as a result:

- **Coverage is defined by form, not by intent.** The imperative marker `استخدمي` cannot match
  inside the present-tense `تستخدمي`, because the word-boundary guard requires a non-Arabic
  character before the stem. Present-tense forms were therefore outside coverage by construction
  until they were ruled on and added as rule 7 — a gap no amount of prompt tightening would have
  closed.
- **Proclitics are part of the form.** All markers allow an attached و / ف, because the same
  boundary guard treats `و` as an Arabic letter and lets `وتركتهما` through unmatched.

Both cases are pinned by tests in `tests/parse-touch-message.test.js`, several asserting on the
verbatim sentence that exposed the gap, so neither regression can recur silently.

---

## 3. Content rules (from global CLAUDE.md and spec §6)

- **Currency is never assumed and never omitted.** State the amount with its currency every time.
- **Never** `إن شاء الله` for delivery, timing or logistics. Use `سنبذل قصارى جهدنا` or a plain
  statement of fact.
- **No religious greetings or assumptions.** `مرحباً` is always safe.
- **No fake scarcity, invented deadlines, or guilt.** Honest last call only (spec §6).
- Product titles are reproduced **exactly as they appear in the store**, including English titles
  inside an Arabic sentence. Do not translate them.

### 3.1 Number and currency formatting

**Western digits, thousands separators, currency code after the number.**

| Input | Output |
|---|---|
| 42663000 LBP | `42,663,000 LBP` |
| 1249 AED | `1,249 AED` |
| 1250.00 AED | `1,250 AED` — no pointless decimals |
| 1747.75 AED | `1,747.75 AED` — real decimals kept |

**No Arabic-Indic digits** (`٤٢`): they render inconsistently across WhatsApp clients and handsets,
and Gulf/Levant commerce uses Western digits daily anyway.

**Enforcement — this is done in code, not asked of the model.** `fmtMoney()` in
`Build Touch Message Request` formats the total and passes it as `total_display`, which the prompt
instructs the model to reproduce verbatim. `Parse Touch Message` additionally rejects any message
containing the raw unformatted digit run (`degrade_reason: unformatted_amount`). Formatting asked
of a model drifts between messages; formatting done in code cannot.

---

## 4. Things the model must never write

Appended by the workflow instead, because they must be exactly right rather than probably right:

- the recovery URL (a mangled link makes the whole message worthless)
- the opt-out line — `لإيقاف الرسائل، أرسل "توقف"` (a compliance control, spec §7)

The opt-out keyword is shown to the customer **in quotes**, and copying it back verbatim is the
most likely way to send it, so `Resolve Reply Context` strips quote characters (`" ' « » “ ” ‘ ’`)
before matching. A compliance control must not depend on the customer stripping our own
punctuation.

The opt-out confirmation and the holding reply sent by `03 - Reply Handler C2` are likewise fixed
strings rather than model output, and so never pass through the checks in §2.

---

## 5. Tone across the three touches

**Touch 3 softens, it does not harden.** Tone stays consistent and respectful across all three; if
anything touch 3 is the **gentlest**, because it is the goodbye.

| Touch | Intent | Tone |
|---|---|---|
| 1 | reminder, cart is saved | warm, zero pressure |
| 2 | the discount, framed as a gift | warm — **the escalation is the OFFER, not the tone** |
| 3 | last message about this cart | **gentlest of the three** — "we'll keep your cart for you if you change your mind" |

Never fake urgency, never guilt, never invented deadlines — in any touch.

---

## 6. Where these rules come from

Ruled: **do not derive this guide from corrections one at a time.** Anchor it to how real
Gulf/Levant brands actually write recovery and marketing messages on WhatsApp and SMS — Noon,
Namshi, Ounass, and Salla merchants are the reference points. Real copy is ground truth for
register, digit style and phrasing per market in a way that rules written from memory are not.

---


## 6c. The ي carrier does not spread to bare verbs

**Ruled: `رغبتي` is wrong — rule 10.** The bare form stays `رغبت`. **Since 2026-09-08 the ي
appears nowhere at all**: the pronoun-suffixed exemption that used to justify it is gone, and the
feminine past is written `تركتِ` with a final kasra instead. This is what `arabic-master-reference.md` §2
gives independently: where a form is contested or dialectal, the standard MSA form wins, and the
bare ي is dialectal. The cause was instructive — teaching the ي-carrier rule in the prompt led the
model to generalise it from suffixed forms to bare ones, applying it correctly in one clause of a
message and over-applying it in another.

**Enforcement:** rule 10 matches a customer-action stem followed by ي at a **word boundary**, so it
cannot fire on the pronoun-suffixed form ruled correct in §1.1a. Rules 8 and 10 are complements, not
overlaps — `تركتيهما` passes both, `تركتهما` trips 8, `رغبتي` trips 10.
**Superseded 2026-09-08:** rule 8 is deleted and rule 10 was widened to match the ي with or without
an attached pronoun, so `تركتيهما` now trips 10 and `تركتهما` trips nothing. The prompt was
tightened in the same pass to say the ي appears only before an attached pronoun, so the model has
less reason to over-generalise it in the first place.

**Known limitation, deliberately accepted** (same treatment as `حفظ` in rule 8): for some stems this
shape is also a first-person possessive noun — `رغبتي` can mean "my desire". A false positive costs
the personalisation and still sends the respectful template, which is the cheap direction to be
wrong in.

---

## 8. Gender agreement

`arabic-master-reference.md` §5 says to match the **customer's** gender, inferred from their first name where
confident, and to prefer neutral rephrasing when it is not. Ruled to apply to Case 2 outbound as
well, which is a real change: until now the checker banned every 2nd-person-feminine form outright.

**Only the full MSA form is acceptable.**

| Form | Example | Verdict |
|---|---|---|
| MSA feminine present (keeps the ن) | `تستخدمين`, `تطلبين`, `ترغبين` | ✅ **for a female customer** |
| Colloquial dropped-ن | `تستخدمي`, `تطلبي` | ❌ wrong for everyone — dialectal, arabic-master-reference.md §2 |
| MSA feminine present to a male customer | `تستخدمين` | ❌ wrong |
| MSA feminine present when gender is unknown | `تستخدمين` | ❌ wrong — see below |

**`unknown` is not a licence to guess.** When the signal is `unknown` the model is asked for
gender-neutral phrasing, so a gendered form means it ignored the instruction. Blocking it is what
keeps `unknown` a *safe* state rather than a silent coin flip.

**Where the signal comes from.** `carts.customer_gender` (`female | male | unknown`), inferred once
at **intake** and made sticky by `case2_upsert_cart` on the same terms as locale — correctable while
`touches_sent = 0`, frozen after. Gender is a property of the customer, not of a touch: it must not
change between touch 1 and touch 3. Inference is a high-precision name heuristic, then Haiku for
names it does not recognise, and **only on Arabic carts** — agreement is meaningless in en/fr and a
paid call that changes nothing is a real bill on a client's account. If Haiku is unreachable the
answer stays `unknown`. Covered by `tests/infer-gender.test.js`.

**The part that is easy to get wrong:** the morphology rules (ة / اء / ى → feminine) misgender
`أسامة`, `حمزة`, `مصطفى`, `يحيى` and `ضياء`, so the explicit name lists are checked **first**. There
is deliberately no Latin ending rule — a trailing "a" would misgender Mustafa, Musa and Zakaria on
the first cart the system ever saw.

### 8.1 Canonical CTAs — whitelisted

`arabic-master-reference.md` §8.2 marks `أكمل طلبك` and `أتمّ عملية الشراء` canonical, but rule 3 blocks `أكمل` as
an informal imperative, so **every message containing the canonical CTA was being silently degraded
to the static template.** Ruled: whitelist them.

**How, and why it is done this way:** the two phrases are *masked out of a copy of the message*
before the markers run, rather than removed from the marker list. `أكمل` on its own stays blocked
everywhere else in the message. They are **fixed strings** — §2 of the root file says these are
inserted identically every time and not regenerated — so they are **not inflected for gender**, and
the prompt says so explicitly.

> **Open, low priority:** if you want the CTA to agree with the customer's gender

### 8.2 Vowel marks: the total ban stands

`arabic-master-reference.md` §8 writes the glossary with shadda (`سلّتك`, `أتمّ`) and §5 marks a feminine
pronoun suffix with a kasra (`طلبكِ`). Rule 9 rejects **every** vowel mark, so those spellings would
degrade every message that used them. Ruled: **keep the total ban**, and write the
glossary unvowelled in messages (`سلتك`, `أتم`, `طلبك`) — consistent with §2 of the root file, which
says to omit tashkeel in the message body. Feminine marking is carried by the **verb** form
(`تستخدمين`), not by a mark on a pronoun. Rule 2 became unreachable as a result and was retired.

---


## 7. Known limitation — the few-shot examples are illustrative

The few-shot register examples in `touch-message-generator.md` are written for this system, not
lifted from real merchant copy. They are labelled as such wherever they appear and are not presented
as authentic brand messages.

This is a deliberate constraint rather than an oversight: inventing plausible-looking "real brand
copy" would reintroduce exactly the failure this guide exists to prevent — confident output nobody
with the standing to judge it has ever read. The intended anchor is real Gulf and Levant merchant
copy, per §6.

---

## 9. Change log

| Date | Change | Ruled by |
|---|---|---|
| 2026-08-03 | Always respectful; never `أنت`/`أنتِ` or informal imperatives | Hussein |
| 2026-08-03 | Verbs after `حضرتك` stay **2nd person** (`اخترت`), not 3rd person — corrects my earlier wrong rule | Hussein |
| 2026-08-04 | Register **varies by market**: `حضرتك` for Levant/Egypt, NOT Gulf — supersedes "always `حضرتك`" | Hussein |
| 2026-08-04 | Money: Western digits, thousands separators, currency after, no pointless decimals | Hussein |
| 2026-08-04 | Touch 3 is the **gentlest**; escalation lives in the offer, not the tone | Hussein |
| 2026-08-04 | Anchor to real Noon/Namshi/Ounass/Salla copy rather than rules written from memory | Hussein |
| 2026-08-04 | 2nd-fem **present** forms (`تستخدمي`, `تستخدمين`) are wrong — rule 7 | Hussein |
| 2026-08-04 | Object pronoun on a 2nd-fem past verb takes the ي (`تركتيهما`); **bare form unchanged** — rule 8, §1.1a — **REVERSED 2026-09-08** | Hussein |
| 2026-08-07 | `arabic-style.md` (repo root) adopted as the upstream authority for every project | Hussein |
| 2026-08-07 | Canonical CTAs `أكمل طلبك` / `أتم عملية الشراء` whitelisted; masked before the imperative markers, never inflected — §8.1 | Hussein |
| 2026-08-07 | Bare 2nd-fem past must NOT carry the ي (`رغبت`, not `رغبتي`) — closes §6c as rule 10 | Hussein |
| 2026-08-07 | Gender agreement applies to Case 2: MSA feminine present allowed **for female customers only**; signal inferred at intake and sticky — §8 | Hussein |
| 2026-08-07 | Only the **full MSA** feminine form (`تستخدمين`); the dropped-ن colloquial form stays wrong for everyone — rule 7a/7b | Hussein |
| 2026-08-07 | Vowel-mark ban stands; glossary written unvowelled in messages. Rule 2 retired as unreachable — §8.2 | Hussein |
| 2026-08-07 | `إن شاء الله` enforced in code (rule 11) after an audit found the ban documented in three places and enforced in none | per existing rule |
| 2026-08-28 | Public edition (v4): internal QA log and open action items moved to an untracked working copy; no rule changed | — |
| 2026-08-31 | `arabic-style.md` merged into `arabic-master-reference.md` (work root) and deleted; that file is now the upstream authority. No rule changed — section numbers remapped only | Hussein |
| 2026-08-31 | Rule 8 is **female-only**: unvowelled, the suffixed form is also the correct masculine 2nd person, so applying it to every cart degraded every Arabic message to a male customer (found live) | Hussein |
| 2026-09-08 | The 2nd-fem past is bare with a final kasra (`تركتِ`), the masculine is bare (`تركت`), and neither takes the ي or an attached object pronoun — rule 8 deleted, rule 10 widened, rule 9 carve-out | Hussein |
| 2026-09-08 | A canonical CTA must not be prefixed (`لأتم عملية الشراء` reads first-person) — rule 14 | Hussein |
