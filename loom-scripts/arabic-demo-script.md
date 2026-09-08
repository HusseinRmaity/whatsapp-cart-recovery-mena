# Loom script — Arabic demo (سكربت العرض بالعربي)

> **DRAFT — pending Hussein's review.** The Arabic below was written by Claude and no native speaker
> has read it. Register and phrasing are Hussein's call, not Claude's — same rule as
> `prompts/arabic-style-guide.md`. Correct it in place; nothing else depends on it.
>
> Register follows the precedent set by Case 1's Arabic script: spoken Levantine narration, warm and
> professional, stage directions in English.

**Target length:** 3:15–4:00
**Audience:** أصحاب متاجر شوبيفاي ومدراء التجارة الإلكترونية في الخليج والشام (دبي، الرياض، بيروت، عمّان، القاهرة).
**Goal:** الرد على سؤال «ليش أدفع لهيك نظام وشوبيفاي بيرجّع السلّات ببلاش؟» بأول ثلاثين ثانية، وبعدين إثبات — على هاتف حقيقي — أن سلة متروكة على شوبيفاي بتولّد رسالة واتساب بالعربي بتذكر المنتجات نفسها، وأن رد الزبون بيوصل لصاحب المتجر على سلاك، وأن الطلب اللي بينتج بيتنسب بصدق.

**Positioning — read before recording (English).** This is not a video about cart recovery. Cart
recovery is free in Shopify and $29/month in an app. It is about **WhatsApp instead of email, Arabic
a native speaker does not wince at, and a system the store owns**. Every beat is evidence for one of
those three. Full argument in `case-study-2-spec.md` §1a.

**Recording notes (بالإنجليزي للتحضير):**
- Same setup checklist as the English script — tunnel verified, webhook URLs re-pointed, Arabic
  catalogue imported, `LAYLA10` created, session window open, data pruned, windows arranged.
- **Same two-cart method:** abandon Cart A about 50 minutes before recording so its touch lands live,
  and abandon Cart B on camera. Never compress the 45-minute delay — the recovery link depends on it.
- The hook is now 30 seconds, not 20, and the whole script runs 3:15–4:00. Nothing else was cut.

---

## Shot list & voiceover (التعليق الصوتي)

### 0:00–0:30 — الافتتاحية (Hook — نواجه المقارنة مباشرة)

`[VET]` — new hook, white dialect, drafted by Claude. Read it aloud before recording; register and
word choice are Hussein's call, not Claude's.

*Storefront on screen, an Arabic product page open.*

> «شوبيفاي أصلاً بيبعت إيميلات للسلّات المتروكة، وببلاش — فليش تدفع لهيك نظام؟ لأنو بالخليج هالإيميلات بالكاد حدا بيفتحها. الواتساب بينقرا خلال دقايق، وشوبيفاي ما عندو واتساب. والتطبيقات يلي عندها واتساب بتكتب عربي بيبيّن من أول سطر إنو مترجم آلياً. فهاد استرجاع سلّات عالواتساب، بعربي طبيعي، ومربوط بشغل متجرك — وإنت مالكو، مش اشتراك شهري. خليني فرجيك — شغّال على هاتفي أنا.»

**Delivery note (English):** say the first line flatly, as if agreeing with the objection. It only
works if it sounds like you raised the question yourself. Do not rush — this beat earns the next
three minutes.

### 0:30–0:55 — نترك السلة قدام الكاميرا

> «رح أتسوّق كزبون من بيروت. بضيف المنتج، بفوت عالدفع، بعبّي معلوماتي — وبعدين بعمل يلي بيعملو أغلب الناس: بطلع.»

*Add an Arabic-titled product, start checkout, fill an Arabic name + Lebanese phone, reach the payment
step, close the tab. Prices show in LBP.*

### 0:55–1:20 — الإدخال (n8n + Supabase)

> «شوبيفاي ما عندو إشعار اسمو "سلة متروكة" — بيخبرك إنو الزبون بلّش الدفع، وهاد نيّة مش ترك. فالنظام بيخزّن السلة وبيجدول أول رسالة بعد ٤٥ دقيقة.»

*n8n `01 - Checkout Intake` execution, green path. Then the Supabase `carts` row.*

> «التوقيع بينتحقق منو قبل أي شي تاني. اللغة انعرفت من الاسم العربي — بدون أي استدعاء ذكاء اصطناعي. التوقيت بيروت. وانتبه للعملة: الزبون شايف ليرة لبنانية والمتجر بيسجّل درهم. هودي عمودين مختلفين بالنظام، وهاد مقصود.»

### 1:20–1:55 — الدورة: شو بيصير قبل ما تنبعت أي رسالة

*n8n `02 - Verifier & Touch Sender`, an execution open.*

> «كل ربع ساعة، النظام بيسأل سؤالين عن كل سلة مستحقة. الأول: إجا طلب على هالسلة؟ وإذا ما قدر يوصل لشوبيفاي، بيتخطّى السلة — هالنظام دايماً بيفضّل السكوت على مخاطرة إنو يبعت لحدا دفع من قبل.»
>
> «والسؤال التاني: هلق وقت مناسب بمكان الزبون؟ ساعات الهدوء، وعطلة نهاية الأسبوع — الجمعة والسبت بالخليج، السبت والأحد بالشام — وأوقات الصلاة. الرسالة اللي بتوقع ضمن ربع ساعة من الأذان بتتأجل نص ساعة.»

*Point at the gate node and a logged `gate_reason`.*

### 1:55–2:25 — الهاتف بيرنّ (اللقطة الأهم)

> «وهاي السلة الأولى، اللي تركناها قبل ما نبلّش التسجيل.»

*Hold up the phone. The Arabic touch has arrived.*

> «بتذكر المنتجات يلي بالسلة بالاسم، بالعربي، والمبلغ مكتوب صح — أرقام إنجليزية، فواصل آلاف، ورمز العملة. وفيها رابط الاسترجاع، وسطر واحد بيقول للزبون كيف يوقف الرسائل. الرابط وسطر الإيقاف بيكتبهن النظام مش النموذج — رابط مكسور بيلغي قيمة الرسالة كلها، وسطر الإيقاف التزام قانوني، فما منتركهن للاحتمالات.»
>
> `[VET]` «وهون بالضبط وين التطبيقات الجاهزة بتغلط. مستوى التهذيب هون مناسب لهالسوق، ونفسو بالخليج بيجي غلط. والفعل متوافق مع هالزبون بالذات. وهالشي بينفحص بالكود قبل ما الرسالة تطلع — وإذا النموذج كتب عربي بيكسر وحدة منهن، بتنرمى الرسالة وبينبعت قالب آمن بدالها. فما بيصير براندك يحكي متل الترجمة الآلية، لأنو الرسالة الغلط ما فيها توصل للزبون أصلاً.»

### 2:25–2:55 — الرد بيوصل لإنسان

*Reply from the handset in Arabic — e.g. asking about delivery.*

> `[VET]` «الزبون اللي بيرد مش عم يحكي مع عنوان "لا ترد" — وهاد بالضبط شو بيكون إيميل الاسترجاع. الرد بينصنّف، وصاحب المتجر بيوصلو على سلاك مع تفاصيل السلة، والزبون بياخد رد أمين بيقلّو إنو رسالتو وصلت — بدون ما يخترع وقت توصيل أو سعر.»

*Show the Slack card. Then, briefly:*

> «وإذا رد بكلمة "توقف"، بينمسك بالكود قبل ما يشوفها أي نموذج ذكاء اصطناعي — إيقاف فوري، تأكيد واحد، وبعدها ولا رسالة.»

### 2:55–3:25 — البيع، والنسبة الصادقة

*Open Cart A's recovery link, complete the order with the test gateway.*

> «إشعار الطلب بيسكّر السلة، بيلغي الرسائل المتبقية، وبيبلّغ على سلاك بالمبلغ بالعملتين.»
>
> «وهون الشي اللي بحب الزبون ينتبهلو: إذا إجا الطلب وما كنا بعتنا ولا رسالة، النظام بيسجّلو "تحوّل قبل أول رسالة" وما بيدّعي إنو استرجعو. برامج الاسترجاع بالعادة بتاخد الفضل بزبون كان راجع لحالو. هاد النظام بيرفض يعمل هيك.»

### 3:25–3:45 — معايير الإنتاج

> «ثلاث رسائل كحد أقصى — محدودة بالنظام وكمان بقيد على قاعدة البيانات، فما في خطأ برمجي بيقدر يبعت رابعة لزبون حقيقي. وكل مسار بيقرر إنو ما يتصرف بيسجّل سطر بالسجل. وفي تقرير يومي الساعة ثمانية بيعرض الإيرادات لكل عملة على حدة، مش مجموعة برقم واحد ما بيعني شي. والنظام تم اختباره تحت الضغط: شوبيفاي واقع، تويليو فاشل، خمس إشعارات مكررة بنفس اللحظة، وزبون بيشتري بنص عملية الإرسال.»

### 3:45–4:00 — الدعوة للتواصل (CTA — نسكّر الدايرة مع الافتتاحية)

`[VET]` — rewritten to answer the hook's question. Read aloud before recording.

> «خلّينا نرجع للسؤال يلي بلّشنا فيه. إذا إيميلات شوبيفاي المجانية ماشي حالها مع زباينك، خلّيك عليها، ما بتحتاجني. أما إذا زباينك عالواتساب والعربي بيفرق معك — أنا ببنيلك هالنظام على متجرك، ورقمك، ولغاتك — وإنت بتملكو: مساراتك، وقاعدة بياناتك، ولائحة الإيقاف تبعك. واسترجاع السلّات هوّي بس أول شي منوجّهو عليه. الرابط بالوصف.»

---

## Notes (ملاحظات)

- The phone reveal is the emotional peak — keep it in frame.
- لا تُستخدم «إن شاء الله» لأي وعد بتوقيت أو توصيل (قاعدة دليل الأسلوب §3). ولا عبارات دينية بتفترض دين المشاهد.
- Do not compress the 45-minute delay for the shoot; it is what makes the recovery link work.
- Touches 2 and 3 fall outside WhatsApp's 24-hour window — if demoed, say plainly that production uses
  approved template messages.
- No invented numbers on screen. ROI is an illustrative model (`docs/case-study.md`).
- **لا تذكر أي نسبة فتح للإيميل أو الواتساب.** مش «الواتساب 90%» ولا «الإيميل 15%» — أرقام بلا مصدر،
  وأي مشتري بيتأكد من واحد فيهن بيوقف يثق بكل الباقي. «بالكاد حدا بيفتحها» و«بينقرا خلال دقايق»
  بتوصل نفس الفكرة وما بتنحاسب عليها. رقم الـ 70% للسلّات المتروكة هو الرقم الوحيد اللي منذكرو.
- **إذا انسألت مباشرة «مو شوبيفاي أصلاً بيعمل هيك؟»** — وافق أولاً، بعدين فرّق: إي، وهو إيميل بس،
  باتجاه واحد، وما عندو فكرة عن مستوى اللغة بالعربي. وبعدين اعترف بالناقص: متجر زغير وزباينو بيقروا
  إنجليزي فعلاً بكفيه شوبيفاي. الاعتراف بالحالة يلي ما بتربحها هو يلي بيخلّي الباقي مصدّق.
