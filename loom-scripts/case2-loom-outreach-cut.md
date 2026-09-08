# Loom script — Case 2 — OUTREACH CUT (2:15–2:45)

_The tight version for cold outreach. Send this in DMs and proposals. Depth lives in the portfolio case-study text beside it, not in a longer video._

**Case 2 = Arabic-native WhatsApp automation a MENA store owns.** Abandoned carts are the first process it was pointed at, not the product — because cart recovery itself is free in Shopify and $29/month in an app. **The pitch is the channel, the Arabic, and the ownership.** Mechanically: checkout abandoned → 45-min verification the cart is really abandoned → WhatsApp recovery message in the customer's language, referencing the exact products left behind → escalating sequence → and the moment that sells it: **the system re-checks conversion before every message, so a customer who already bought is never messaged**, and a recovered sale is attributed honestly.

**⚠ Lead with the comparison, always.** Anyone evaluating this already knows Shopify emails abandoned carts for free. If you do not raise it in the first fifteen seconds, they raise it later and you sound cornered. Raise it first and you sound like someone who has thought about their own market. Full argument: `case-study-2-spec.md` §1a.

**The two peaks:** (1) the WhatsApp arriving on a real phone naming the *actual* products in the cart, in the customer's language; (2) the recovered order landing back — the "💰 recovered" Slack moment — proving revenue was brought back on autopilot.

---

## Before you hit record

**Setup, in this order:**

1. Start the tunnel; confirm the Shopify webhooks are pointed at it (checkout + order), and Twilio inbound is on your **router** (one inbound URL shared across all three cases).
2. Confirm the **HMAC verification** passes on a real Shopify delivery — you'll show this briefly as proof it's production-grade.
3. Have your own WhatsApp joined to the Twilio sandbox — you're the "customer."
4. Turn on the sweep's **test-mode timings** (45-min verification and touch gaps compressed to minutes) and drive the sweep from its manual trigger — same discipline as the other cases.
5. Windows arranged and clean: Shopify storefront, n8n, Supabase, Slack, phone. Prune old test carts so the row you show is clean.

**Traps that ruin the take:**
- **Abandon the checkout for real** — get to the checkout page with contact info entered, then leave. If you complete it, there's nothing to recover.
- **Use products with recognizable names** (Arabic or English to match the language you're demoing) so the "it named exactly what I left behind" moment lands. Bland "Product 1" kills it.
- **One cart per phone at a time** — a second live cart on the same number tangles the replies.
- **For the conversion-check peak:** you need to actually complete a purchase mid-sequence to show a touch being *cancelled* — plan that beat, don't wing it.

---

# ENGLISH — outreach cut

**Target:** 2:15–2:45

---

### 0:00–0:30 — Hook (answer the objection before it's raised)

*Open on a Shopify checkout page, or a cart with items sitting in it.*

> "Shopify already sends abandoned-cart emails for free — so why pay for this? Because in the Gulf those emails barely get opened. WhatsApp gets read in minutes, and Shopify has no WhatsApp. And the apps that do have it write Arabic a native speaker can tell is machine-translated. So this is WhatsApp recovery, in Arabic that sounds right, built into your operation — and you own it, it's not a subscription. Let me show you, on my own phone."

**Delivery:** flat on the first sentence, like you're agreeing. The whole hook only lands if it sounds like your question, not their objection.

### 0:30–1:00 — A cart is abandoned

*On the storefront: add products to cart, go to checkout, enter contact info, then leave the page.*

> "A customer fills their cart, starts checkout, and leaves — the single most common thing that happens in any store. Shopify has no 'abandoned cart' signal, so the system does it properly: it catches the checkout, waits, then checks the store's own orders to see whether it actually became a sale."

*Cut briefly to the Supabase cart row + the HMAC verification node.*

> "Every webhook from Shopify is signature-verified before it's trusted — this is real store data, so it's treated like it."

### 1:00–1:35 — The phone buzzes (first peak)

*Hold up the handset — the Arabic (or English) recovery message has arrived, naming the actual products.*

> "There it is. In the customer's language, naming the exact products they left in the cart — not a generic 'you left something behind,' but the real items — with a link straight back to their checkout."

> "And notice the tone: a helpful nudge, not desperation. The offer escalates later in the sequence — a reminder, then an incentive, then a gentle last call — but it never guilt-trips and never fakes scarcity."

> "The Arabic is the part a generic app gets wrong. The politeness level here is right for this market and would read wrong in the Gulf; the verb agrees with this specific customer. That's checked in code before the message is allowed out — break a rule and it's thrown away and a safe template goes instead. Your brand never sounds machine-translated."

**Do not quote a rule count on camera** — the documents currently disagree on the number. "Checked in code" until that is reconciled.

### 1:35–2:15 — The part that protects the store (main peak)

*Now complete the purchase — either reply to buy, or complete checkout on the storefront.*

> "Now here's the piece that matters most. Before every single message, the system re-checks: did this cart already convert? Because the worst thing an automation can do is message someone 'you forgot your cart' after they've already paid."

*Cut to Slack: the "💰 recovered" notification with the amount. Then the Supabase row: status recovered, remaining touches cancelled.*

> "The moment this customer buys, the remaining messages are cancelled, and the recovered sale is logged — honestly. If they'd bought before we ever messaged them, it's marked as such, not claimed as our win. The store gets recovered revenue it can actually trust, with zero staff effort."

### 2:15–2:40 — CTA (close the loop on the hook)

> "So — back to the question I opened with. If Shopify's free email is working for your customers, keep it. If your customers are on WhatsApp and your Arabic matters, I build this on your store, your number, your languages — and you own it. Your workflows, your database, your opt-out list. Cart recovery is just the first thing we point it at. Link's below."

---

# ARABIC — outreach cut (النسخة المختصرة)

> **`[VET]` — pending Hussein's native pass.** Register: **white dialect (لهجة بيضاء)** — natural
> Levantine softened at Lebanon-only words so Gulf listeners never stumble. Not Gulf accent, not heavy
> MSA. Read aloud and finalize. Glossary terms should align with `arabic-master-reference.md` §8.2.

**Target:** 2:15–2:45

---

### 0:00–0:30 — الافتتاحية

`[VET]` — new hook, white dialect. Read aloud before recording; register is Hussein's call.

*Shopify checkout / a full cart.*

> «شوبيفاي أصلاً بيبعت إيميلات للسلّات المتروكة، وببلاش — فليش تدفع لهيك نظام؟ لأنو بالخليج هالإيميلات بالكاد حدا بيفتحها. الواتساب بينقرا خلال دقايق، وشوبيفاي ما عندو واتساب. والتطبيقات يلي عندها واتساب بتكتب عربي بيبيّن من أول سطر إنو مترجم آلياً. فهاد استرجاع سلّات عالواتساب، بعربي طبيعي، ومربوط بشغل متجرك — وإنت مالكو، مش اشتراك شهري. خليني فرجيك — على تلفوني أنا.»

**Delivery:** الجملة الأولى بنبرة عادية، كأنك موافق عالسؤال. الافتتاحية بتزبط بس إذا حسّها إنها سؤالك إنت.

### 0:30–1:00 — سلّة بتنترك

*Add to cart, reach checkout, enter info, leave.*

> «الزبون بيعبّي سلّتو، بيبلّش الدفع، وبيترك — أكتر شي بيصير بأي متجر. شوبيفاي ما بيعطي إشارة "سلّة متروكة"، فالنظام بيعملها صح: بيمسك عملية الدفع، بينتظر، وبعدين بيراجع طلبات المتجر نفسو ليشوف إذا فعلاً صارت عملية شراء.»

*Cut to Supabase row + HMAC node.*

> «كل إشارة من شوبيفاي بينتحقق من توقيعها قبل ما ينوثق فيها — هاي بيانات متجر حقيقية، فبتنعامل متل هيك.»

### 1:00–1:35 — التلفون بيرنّ (الذروة الأولى)

*Handset — recovery message naming actual products.*

> «هيّو. بلغة الزبون، وعم يسمّي المنتجات يلي تركها بالضبط — مش "نسيت شي بسلّتك" عامة، لأ، المنتجات الحقيقية — مع رابط بيرجّعو مباشرة لصفحة الدفع.»

> «ولاحظ الأسلوب: تذكير لطيف، مش استجداء. العرض بيتصاعد بعدين بالتسلسل — تذكير، بعدها حافز، بعدها آخر رسالة لطيفة — بس بلا تأنيب وبلا ندرة مفتعلة.»

> `[VET]` «والعربي هو الشي يلي التطبيقات الجاهزة بتغلط فيه. مستوى التهذيب هون مناسب لهالسوق، ونفسو بالخليج بيجي غلط؛ والفعل متوافق مع هالزبون بالذات. وهالشي بينفحص بالكود قبل ما الرسالة تطلع — وإذا انكسرت وحدة منهن، بتنرمى الرسالة وبينبعت قالب آمن بدالها. فما بيصير براندك يحكي متل الترجمة الآلية.»

### 1:35–2:15 — الجزء يلي بيحمي المتجر (الذروة الأساسية)

*Complete the purchase.*

> «هلّق أهم جزء. قبل كل رسالة، النظام بيتأكد: هل هالسلّة صارت طلب فعلاً؟ لأنو أسوأ شي ممكن يعملو نظام آلي إنو يبعت لحدا "نسيت سلّتك" بعد ما يكون دفع.»

*Cut to Slack "💰 recovered" + Supabase: recovered, touches cancelled.*

> «بلحظة ما هالزبون بيشتري، باقي الرسايل بتنلغى، والمبيع المسترجع بينتسجّل — بأمانة. ولو كان اشترى قبل ما نبعتلو ولا رسالة، بينتسجّل هيك، مش بننسبو لإلنا. المتجر بياخد إيراد مسترجع فعلاً فيه يثق فيه، وبلا أي مجهود من الموظفين.»

### 2:15–2:40 — الدعوة للتواصل

`[VET]` — rewritten to answer the hook's question.

> «خلّينا نرجع للسؤال يلي بلّشنا فيه. إذا إيميلات شوبيفاي المجانية ماشي حالها مع زباينك، خلّيك عليها. أما إذا زباينك عالواتساب والعربي بيفرق معك — أنا ببنيلك هالنظام على متجرك، ورقمك، ولغاتك — وإنت بتملكو: مساراتك، وقاعدة بياناتك، ولائحة الإيقاف تبعك. واسترجاع السلّات هوّي بس أول شي منوجّهو عليه. الرابط تحت.»

---

## Screen-by-screen cheat sheet

| Beat | On screen | You do |
|---|---|---|
| Hook | Checkout / full cart | Name the Shopify comparison first, then talk over it |
| Cart abandoned | Storefront → checkout → **leave** | Add items, enter info, abandon |
| Proof it's real | Supabase row + **HMAC node** | Brief flash — "signature-verified" |
| Phone buzzes | **Phone** | Hold up, show real product names |
| Protection peak | Complete purchase → **Slack 💰** → Supabase | Buy, show touch cancelled + honest attribution |
| CTA | Slack / camera | The ask |

**Two moments to let breathe (don't talk over):** the phone buzzing with the product-named message, and the "💰 recovered" Slack notification. Silence sells both.

---

## Delivery notes

- **The Shopify comparison is the hook and it is never trimmed for time.** If a cut has to come from somewhere, it comes from the escalation-tone line or the hardening beat — never from the first thirty seconds. A viewer who watches the whole video without hearing why Shopify's free email is not the answer has been sold nothing.
- **The concession is a feature, not a weakness.** If asked live, say plainly that a small English-speaking store with standard flows should just buy the $29 app. Conceding the case you would lose is what makes the case you win believable, and it stops you pitching stores that will never pay Gulf setup rates.
- **The product-naming moment is the first peak** — make sure the cart has real, recognizable product names on screen so the viewer sees the message match the cart. This is what separates you from generic "you left something" blasts.
- **The conversion-check is your credibility peak** — most cart bots *will* message someone who already bought. Showing that yours *won't* is the senior differentiator. Give it the spotlight.
- **Honest attribution** ("if they bought before we messaged, we don't claim it") is a trust signal to the store owner — it says you won't inflate your own numbers. Keep it.
- **Record the phone separately** if a live take is fragile; the script works as voiceover.
- **Arabic:** white dialect, align glossary to `arabic-master-reference.md`, `[VET]` your pass.
- **No invented revenue numbers on screen** — the recovered amount is whatever the real test order was. The 70% abandonment stat is a cited industry figure; don't fabricate store results.
- **Never quote a channel open rate.** Not "WhatsApp gets 90%", not "email gets 15%". Both are unsourced, and a prospect who checks one stops trusting everything else you said. "Barely get opened" and "read in minutes" are directional, defensible, and land just as hard.
- **Pacing:** if tight, trim the escalation-tone line in the first peak — never trim the hook, the phone-buzz, or the conversion-check peak.

---

## Which version goes where

| Version | Where | Length |
|---|---|---|
| Outreach cut (this) | Cold DMs, Upwork, LinkedIn | 2:15–2:45 |
| Portfolio text (not a longer video) | Portfolio deep-dive | written |

Same principle as Cases 1 and 3: one tight video, reused in both places; the engineering depth (HMAC, sweep architecture, fail-safe conversion checks, revenue attribution) lives in the written case study beside it, where a technical buyer can skim it in 30 seconds.
