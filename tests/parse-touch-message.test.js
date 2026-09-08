/**
 * Regression harness for workflow 02's `Parse Touch Message` Code node.
 *
 *   node tests/parse-touch-message.test.js
 *
 * WHY THIS EXISTS
 * The 2026-08-04 style-guide deploy moved money formatting out of this node into
 * `Build Touch Message Request` but left three fallback templates referencing the
 * deleted `total` / `cur` variables. Those live inside an object literal that is
 * evaluated on EVERY execution, so the node threw ReferenceError whether the model
 * succeeded or not — nothing could be sent. It shipped unnoticed because every cart
 * was parked, so no sweep ran the node afterwards.
 *
 * The lesson is not "test more carefully". It is that the fallback path only runs
 * when something else has already failed, so a happy-path test never touches it.
 * This harness executes the node's real source against fixtures instead.
 *
 * It reads jsCode straight out of workflows/02-verifier-touch-sender.json, so the
 * thing under test is the thing that ships. Re-export the workflow after any edit
 * in the n8n editor, then re-run this.
 *
 * Arabic fixtures are quoted verbatim from prompts/arabic-style-guide.md and
 * prompts/touch-message-generator.md — the WRONG/RIGHT pairs Hussein ruled on.
 * No Arabic is invented here (style guide: Claude is not the arbiter of Arabic).
 */

const fs = require('fs');
const path = require('path');

const WORKFLOW = path.join(__dirname, '..', 'workflows', '02-verifier-touch-sender.json');
const NODE_NAME = 'Parse Touch Message';

function loadNodeCode() {
  const raw = JSON.parse(fs.readFileSync(WORKFLOW, 'utf8'));
  const wf = Array.isArray(raw) ? raw[0] : raw;
  const node = wf.nodes.find((n) => n.name === NODE_NAME);
  if (!node) throw new Error('node not found in export: ' + NODE_NAME);
  return node.parameters.jsCode;
}

const CODE = loadNodeCode();

/**
 * Runs the node body with the same accessors n8n provides.
 * `return [{json: ...}]` at the top level of the node becomes the function's return.
 */
function runNode({ cart, req, cfg, response }) {
  const nodes = {
    'Classify Conversion Result': cart,
    'Build Touch Message Request': req,
    'Set Sweep Config': cfg
  };
  const $ = (name) => {
    if (!(name in nodes)) throw new Error('unexpected node reference: ' + name);
    return { first: () => ({ json: nodes[name] }) };
  };
  const $input = { first: () => ({ json: response }) };
  // eslint-disable-next-line no-new-func
  const fn = new Function('$', '$input', CODE);
  return fn($, $input)[0].json;
}

// ---------------------------------------------------------------- fixtures ---

const CFG = { discount_code: 'LAYLA10', store_name: 'Layla Boutique', slack_channel: '#leads' };
const URL = 'https://layla-boutique-5lw7e3c9.myshopify.com/checkouts/cn/abc123/recover?key=deadbeef';

function cart(overrides) {
  return Object.assign(
    {
      id: 'cart-1',
      customer_first_name: 'ليلى',
      cart_items: [{ title: 'عباية كلاسيكية سوداء', quantity: 1 }],
      cart_total: 1249,
      currency: 'AED',
      recovery_url: URL
    },
    overrides || {}
  );
}

function req(overrides) {
  return Object.assign(
    {
      touch_number: 1,
      language: 'ar',
      total_display: '1,249 AED',
      register_zone: 'levant_egypt',
      raw_total_digits: '1249',
      first_name: 'ليلى'
    },
    overrides || {}
  );
}

const ok = (text) => ({ content: [{ type: 'text', text }] });
const noResponse = {};

// Ruled Arabic, quoted from the style guide / prompt — not invented here.
const AR_RIGHT = 'مرحباً ليلى، لاحظنا أن حضرتك تركت عباية كلاسيكية سوداء في السلة بقيمة 1,249 AED. السلة محفوظة.';
const AR_WRONG_PRONOUN = 'سلتك محفوظة لحضرتك متى أردتِ إتمام الطلب';
const AR_WRONG_AGREEMENT = 'حضرتك اختارت العباية، والسلة محفوظة بقيمة 1,249 AED.';
const AR_NO_HADRETAK = 'مرحباً ليلى، السلة محفوظة لدينا بقيمة 1,249 AED ويسعدنا إتمام الطلب في أي وقت.';

// ------------------------------------------------------------------ runner ---

let pass = 0;
let fail = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    pass++;
    console.log('  PASS  ' + name);
  } catch (e) {
    fail++;
    failures.push(name + ' :: ' + e.message);
    console.log('  FAIL  ' + name + ' :: ' + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function eq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(label + ' expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
}

// ------------------------------------------------------------------- tests ---

console.log('\nParse Touch Message — ' + WORKFLOW.replace(/.*[\\/]/, '') + '\n');

// 1-9. The fallback path in every language and every touch. This is the block the
// ReferenceError lived in: it is built on EVERY execution, so if any template
// references an undefined identifier the whole node dies, degraded or not.
console.log('Fallback templates (the path that shipped broken):');
for (const lang of ['ar', 'en', 'fr']) {
  for (const touch of [1, 2, 3]) {
    check('fallback ' + lang + ' touch ' + touch, () => {
      const out = runNode({
        cart: cart(),
        req: req({ language: lang, touch_number: touch }),
        cfg: CFG,
        response: noResponse
      });
      eq(out.message_degraded, true, 'message_degraded');
      eq(out.degrade_reason, 'no_response', 'degrade_reason');
      assert(out.message.length > 0, 'empty message');
      assert(out.message.indexOf('undefined') === -1, 'template rendered "undefined"');
      assert(out.message.indexOf(URL) !== -1, 'recovery url missing');
      assert(out.message.indexOf('1,249 AED') !== -1, 'formatted total missing from fallback');
      if (touch === 2) assert(out.message.indexOf('LAYLA10') !== -1, 'discount code missing on touch 2');
      eq(out.message_chars, out.message.length, 'message_chars');
    });
  }
}

console.log('\nReturned fields (were referenced as bare identifiers):');
check('returns total_display and register_zone from req', () => {
  const out = runNode({ cart: cart(), req: req(), cfg: CFG, response: ok(AR_RIGHT) });
  eq(out.total_display, '1,249 AED', 'total_display');
  eq(out.register_zone, 'levant_egypt', 'register_zone');
  eq(out.raw_total_digits, '1249', 'raw_total_digits');
  eq(out.has_recovery_url, true, 'has_recovery_url');
});

console.log('\nHappy path:');
check('good Arabic generation is not degraded', () => {
  const out = runNode({ cart: cart(), req: req(), cfg: CFG, response: ok(AR_RIGHT) });
  eq(out.message_degraded, false, 'message_degraded');
  eq(out.degrade_reason, null, 'degrade_reason');
  assert(out.message.indexOf(AR_RIGHT) === 0, 'model body not preserved');
});

// Canonical wording since 2026-08-07 (arabic-master-reference.md §8.5, vetted [OK]). The
// quotes around the keyword are load-bearing: workflow 03's `Resolve Reply
// Context` strips quote characters so a customer copying it back verbatim is
// still recognised as opting out.
const AR_OPT_OUT = 'لإيقاف الرسائل، أرسل "توقف"';

check('touch 1 appends the opt-out line, touch 2 does not', () => {
  const t1 = runNode({ cart: cart(), req: req(), cfg: CFG, response: ok(AR_RIGHT) });
  assert(t1.message.indexOf(AR_OPT_OUT) !== -1, 'ar opt-out line missing on touch 1');
  const t2 = runNode({
    cart: cart(),
    req: req({ touch_number: 2 }),
    cfg: CFG,
    response: ok(AR_RIGHT)
  });
  assert(t2.message.indexOf(AR_OPT_OUT) === -1, 'opt-out line appended on touch 2');
});

check('english opt-out line for en carts', () => {
  const out = runNode({
    cart: cart(),
    req: req({ language: 'en' }),
    cfg: CFG,
    response: ok('Hi Sara, your cart (Silk Scarf, 1,249 AED) is still saved.')
  });
  assert(out.message.indexOf('Reply STOP to unsubscribe.') !== -1, 'en opt-out line missing');
});

console.log('\nDeterministic quality checks:');
check('model-written URL degrades', () => {
  const out = runNode({
    cart: cart(),
    req: req(),
    cfg: CFG,
    response: ok(AR_RIGHT + ' https://example.com/cart')
  });
  eq(out.message_degraded, true, 'message_degraded');
  eq(out.degrade_reason, 'model_wrote_a_url', 'degrade_reason');
});

check('raw unformatted digit run degrades', () => {
  const out = runNode({
    cart: cart({ cart_total: 42663000, currency: 'LBP' }),
    req: req({ total_display: '42,663,000 LBP', raw_total_digits: '42663000' }),
    cfg: CFG,
    response: ok('مرحباً ليلى، السلة الخاصة بحضرتك بقيمة 42663000 LBP لا تزال محفوظة.')
  });
  eq(out.message_degraded, true, 'message_degraded');
  eq(out.degrade_reason, 'unformatted_amount', 'degrade_reason');
});

// Rule 2 (ت + kasra) was RETIRED 2026-08-07 as unreachable — rule 9 rejects
// every vowel mark, so the vowelled spelling is caught one step earlier. The
// behaviour under test is unchanged: this message must still never be sent.
check('informal أنتِ verb degrades', () => {
  const out = runNode({ cart: cart(), req: req(), cfg: CFG, response: ok(AR_WRONG_PRONOUN) });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/vowel_marks_present|informal_pronoun/.test(out.degrade_reason), 'got ' + out.degrade_reason);
});

check('3rd-person verb after حضرتك degrades', () => {
  const out = runNode({ cart: cart(), req: req(), cfg: CFG, response: ok(AR_WRONG_AGREEMENT) });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/verb_agreement_after_hadretak/.test(out.degrade_reason), 'got ' + out.degrade_reason);
});

// The message that got through the checker and was DELIVERED on 2026-08-04
// before Hussein ruled the present-tense أنتِ forms wrong. Verbatim, so this
// exact regression cannot recur.
check('present-tense أنتِ form degrades (the delivered miss)', () => {
  const out = runNode({
    cart: cart(),
    req: req({ touch_number: 2 }),
    cfg: CFG,
    response: ok('كهدية بسيطة من متجر Layla Boutique، يسعدنا حضرتك تستخدمي كود الخصم LAYLA10 عند إتمام الطلب')
  });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/colloquial_feminine_present/.test(out.degrade_reason), 'got ' + out.degrade_reason);
});

// Same sentence, female customer. Still wrong: the dropped-ن form is colloquial,
// and arabic-master-reference.md §2 takes the standard MSA form whenever one is contested.
// Ruling 5, 2026-08-07 — relaxing gender agreement did NOT relax this.
check('colloquial تستخدمي degrades even for a FEMALE customer', () => {
  const out = runNode({
    cart: cart(),
    req: req({ touch_number: 2, customer_gender: 'female' }),
    cfg: CFG,
    response: ok('كهدية بسيطة من متجر Layla Boutique، يسعدنا حضرتك تستخدمي كود الخصم LAYLA10 عند إتمام الطلب')
  });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/colloquial_feminine_present/.test(out.degrade_reason), 'got ' + out.degrade_reason);
});

// The MSA feminine present (with the ن) is the form arabic-master-reference.md §5 endorses.
// Ruled to apply to Case 2 on 2026-08-07, so it is now correct FOR A FEMALE
// customer and an error for anyone else.
check('MSA تستخدمين PASSES for a female customer', () => {
  const out = runNode({
    cart: cart(),
    req: req({ customer_gender: 'female' }),
    cfg: CFG,
    response: ok('مرحباً ليلى، يسعدنا أن تستخدمين كود الخصم عند إتمام الطلب، والسلة محفوظة لحضرتك.')
  });
  eq(out.message_degraded, false, 'message_degraded (reason: ' + out.degrade_reason + ')');
});

check('MSA تستخدمين degrades for a MALE customer', () => {
  const out = runNode({
    cart: cart(),
    req: req({ customer_gender: 'male' }),
    cfg: CFG,
    response: ok('مرحباً ليلى، يسعدنا أن تستخدمين كود الخصم عند إتمام الطلب، والسلة محفوظة لحضرتك.')
  });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/feminine_present_wrong_gender/.test(out.degrade_reason), 'got ' + out.degrade_reason);
});

// 'unknown' is not a licence to guess: the model was asked for gender-neutral
// phrasing, so a gendered form means it ignored the instruction.
check('MSA تستخدمين degrades when gender is UNKNOWN', () => {
  const out = runNode({
    cart: cart(),
    req: req({ customer_gender: 'unknown' }),
    cfg: CFG,
    response: ok('مرحباً ليلى، يسعدنا أن تستخدمين كود الخصم عند إتمام الطلب، والسلة محفوظة لحضرتك.')
  });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/feminine_present_wrong_gender/.test(out.degrade_reason), 'got ' + out.degrade_reason);
});

// ---- Rule 10: bare 2nd-fem past must not carry the ي (§6c) -------------------
// Opened 2026-08-04 by a message that was DELIVERED, ruled wrong 2026-08-07.
// Quoted verbatim so this exact regression cannot recur.
check('bare رغبتي degrades — the delivered §6c message', () => {
  const out = runNode({
    cart: cart(),
    req: req({ touch_number: 2, customer_gender: 'female' }),
    cfg: CFG,
    response: ok('عندنا هدية لحضرتك: كود الخصم LAYLA10 متاح لو رغبتي بإكمال الطلب')
  });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/bare_feminine_ya/.test(out.degrade_reason), 'got ' + out.degrade_reason);
});

check('bare اخترتي degrades', () => {
  const out = runNode({
    cart: cart(),
    req: req({ customer_gender: 'female' }),
    cfg: CFG,
    response: ok('مرحباً ليلى، حضرتك اخترتي عباية كلاسيكية سوداء، والسلة محفوظة.')
  });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/bare_feminine_ya/.test(out.degrade_reason), 'got ' + out.degrade_reason);
});

// THE 2026-09-08 REVERSAL. Ruled by Hussein on the two touches delivered that
// day, both of which read `حضرتك تركتيهما`. The ي carrier is the
// DIALECT spelling; MSA writes the 2nd-fem past with a final kasra and takes no
// ي at all. Rule 8, which used to REQUIRE the ي before an attached pronoun, is
// deleted; rule 10 now owns every case, suffixed or bare.
check('pronoun-suffixed تركتيهما now DEGRADES (ruled 2026-09-08)', () => {
  const out = runNode({
    cart: cart(),
    req: req({ customer_gender: 'female' }),
    cfg: CFG,
    response: ok('مرحباً ليلى، حضرتك تركتيهما في السلة بقيمة 1,249 AED. السلة محفوظة لحضرتك.')
  });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/bare_feminine_ya/.test(out.degrade_reason), 'got ' + out.degrade_reason);
});

// ---- Ruling 1: the two canonical CTAs are whitelisted ------------------------
// arabic-master-reference.md §8.2 marks them canonical; the checker masks them out before the
// imperative markers run, so أكمل stays blocked everywhere else in the message.
check('canonical CTA أكمل طلبك passes', () => {
  const out = runNode({
    cart: cart(), req: req(), cfg: CFG,
    response: ok('مرحباً ليلى، سلتك محفوظة لدينا بقيمة 1,249 AED. أكمل طلبك متى ما ناسب حضرتك.')
  });
  eq(out.message_degraded, false, 'message_degraded (reason: ' + out.degrade_reason + ')');
});

check('canonical CTA أتم عملية الشراء passes', () => {
  const out = runNode({
    cart: cart(), req: req(), cfg: CFG,
    response: ok('مرحباً ليلى، حضرتك تركت عباية بقيمة 1,249 AED. أتم عملية الشراء في أي وقت يناسب حضرتك.')
  });
  eq(out.message_degraded, false, 'message_degraded (reason: ' + out.degrade_reason + ')');
});

// ---- Rule 11: إن شاء الله for logistics -------------------------------------
// Banned by global CLAUDE.md, arabic-master-reference.md §7 and style guide §3 — and until
// 2026-08-07 enforced by none of them. The instruction had silently dropped out
// of the DEPLOYED system prompt while touch-message-generator.md still claimed
// it was there, and no marker existed. Found by reading, not by testing.
check('إن شاء الله degrades', () => {
  const out = runNode({
    cart: cart(), req: req(), cfg: CFG,
    response: ok('مرحباً ليلى، حضرتك تركت عباية بقيمة 1,249 AED. سنشحنها إن شاء الله خلال يومين.')
  });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/religious_phrase/.test(out.degrade_reason), 'got ' + out.degrade_reason);
});

check('the انشاء الله spelling degrades too', () => {
  const out = runNode({
    cart: cart(), req: req(), cfg: CFG,
    response: ok('مرحباً ليلى، حضرتك تركت عباية بقيمة 1,249 AED. سنشحنها انشاء الله خلال يومين.')
  });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/religious_phrase/.test(out.degrade_reason), 'got ' + out.degrade_reason);
});

// ---------------------------------------------------------------------------
// RULES 12 + 13 — ruled by Hussein 2026-09-01, both from ONE message: the first
// model-generated Arabic touch this system ever delivered (cart 9560cb8f,
// touch 1, 14:33:37Z). It passed all eleven rules that existed at the time.
//
//   مرحباً حضرتك حسين، حفظنا لك سلتك ... طلبك بانتظارك متى حبيت تكمل الطلب.
//
// Two defects in one sentence: حبيت is Levantine (MSA: متى شئت / متى رغبت), and
// the greeting stacks حضرتك against the name. Neither was checkable before —
// no rule looked at vocabulary, and none looked at greeting shape.
// ---------------------------------------------------------------------------
check('THE DELIVERED MESSAGE now degrades (regression, 2026-09-01)', () => {
  const out = runNode({
    cart: cart(), req: req({ customer_gender: 'male' }), cfg: CFG,
    response: ok('مرحباً حضرتك حسين، حفظنا لك سلتك وفيها شال كشمير مطرز وعباية كلاسيك أسود، بمنتجان بإجمالي 19,022,000 LBP. طلبك بانتظارك متى حبيت تكمل الطلب.')
  });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/colloquial_dialect_word/.test(out.degrade_reason), 'dialect: ' + out.degrade_reason);
  assert(/greeting_stacked_with_hadretak/.test(out.degrade_reason), 'greeting: ' + out.degrade_reason);
});

check('متى حبيت degrades on its own', () => {
  const out = runNode({
    cart: cart(), req: req(), cfg: CFG,
    response: ok('مرحباً ليلى، حضرتك تركت عباية بقيمة 1,249 AED. طلبك بانتظارك متى حبيت.')
  });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/colloquial_dialect_word/.test(out.degrade_reason), 'got ' + out.degrade_reason);
});

check('the MSA replacement متى شئت passes', () => {
  const out = runNode({
    cart: cart(), req: req(), cfg: CFG,
    response: ok('مرحباً ليلى، حضرتك تركت عباية بقيمة 1,249 AED. طلبك بانتظارك متى شئت.')
  });
  eq(out.message_degraded, false, 'message_degraded (reason: ' + out.degrade_reason + ')');
});

check('other dialect tokens degrade (شو / كتير / هيك)', () => {
  ['شو رأي حضرتك', 'السلة كتير حلوة', 'هيك تكون السلة جاهزة'].forEach((frag) => {
    const out = runNode({
      cart: cart(), req: req(), cfg: CFG,
      response: ok('مرحباً ليلى، حضرتك تركت عباية بقيمة 1,249 AED. ' + frag + '.')
    });
    eq(out.message_degraded, true, 'message_degraded for: ' + frag);
    assert(/colloquial_dialect_word/.test(out.degrade_reason), frag + ' -> ' + out.degrade_reason);
  });
});

check('greeting stacked with حضرتك degrades', () => {
  const out = runNode({
    cart: cart(), req: req(), cfg: CFG,
    response: ok('مرحباً حضرتك ليلى، السلة محفوظة بقيمة 1,249 AED وحضرتك تركت عباية فيها.')
  });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/greeting_stacked_with_hadretak/.test(out.degrade_reason), 'got ' + out.degrade_reason);
});

// Precision: both approved greeting shapes must survive, or the rule is a blanket ban.
check('مرحباً + bare name passes', () => {
  const out = runNode({
    cart: cart(), req: req(), cfg: CFG,
    response: ok('مرحباً ليلى، حضرتك تركت عباية كلاسيكية في السلة بقيمة 1,249 AED. السلة محفوظة.')
  });
  eq(out.message_degraded, false, 'message_degraded (reason: ' + out.degrade_reason + ')');
});

check('the prepositional مرحباً بحضرتك passes', () => {
  const out = runNode({
    cart: cart(), req: req(), cfg: CFG,
    response: ok('مرحباً بحضرتك، حضرتك تركت عباية كلاسيكية في السلة بقيمة 1,249 AED. السلة محفوظة.')
  });
  eq(out.message_degraded, false, 'message_degraded (reason: ' + out.degrade_reason + ')');
});

// Ruled by Hussein 2026-09-01, after حياك الله shipped on the first live GULF touch
// (cart 598da7a2). The system prompt banned "religious greetings" outright while the
// Gulf register note deliberately offers حياك الله — two instructions contradicting
// each other, with no rule adjudicating. Ruled: KEEP حياك الله, narrow the ban.
// The checker was already correct and is unchanged; these pin that it stays correct.
check('حياك الله passes — a Gulf courtesy formula, not a religious claim', () => {
  const out = runNode({
    cart: cart({ country_code: 'AE' }), req: req({ register_zone: 'gulf' }), cfg: CFG,
    response: ok('مرحباً حسين، حياك الله. حفظنا لك سلتك بقيمة 1,249 AED. أكمل طلبك متى شئت.')
  });
  eq(out.message_degraded, false, 'message_degraded (reason: ' + out.degrade_reason + ')');
});

check('إن شاء الله still degrades in the Gulf register — the narrowing is not a loophole', () => {
  const out = runNode({
    cart: cart({ country_code: 'AE' }), req: req({ register_zone: 'gulf' }), cfg: CFG,
    response: ok('مرحباً حسين، حياك الله. سنشحن طلبك إن شاء الله خلال يومين.')
  });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/religious_phrase/.test(out.degrade_reason), 'got ' + out.degrade_reason);
});

// Precision: the approved alternative from the glossary must survive.
check('سنبذل قصارى جهدنا passes', () => {
  const out = runNode({
    cart: cart(), req: req(), cfg: CFG,
    response: ok('مرحباً ليلى، حضرتك تركت عباية بقيمة 1,249 AED. سنبذل قصارى جهدنا لشحنها بسرعة.')
  });
  eq(out.message_degraded, false, 'message_degraded (reason: ' + out.degrade_reason + ')');
});

check('أكمل outside the canonical CTA still degrades', () => {
  const out = runNode({
    cart: cart(), req: req(), cfg: CFG,
    response: ok('مرحباً ليلى، أكمل الآن يا حضرتك، السلة بقيمة 1,249 AED في انتظارك.')
  });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/informal_imperative/.test(out.degrade_reason), 'got ' + out.degrade_reason);
});

// Precision guard: the new marker must not fire on ordinary Arabic that merely
// contains these letters. Over-matching would send every Arabic customer a
// template and delete the personalisation (style guide §2).
check('present-tense marker does not fire on the ruled-correct message', () => {
  const out = runNode({
    cart: cart(),
    req: req(),
    cfg: CFG,
    response: ok('مرحباً ليلى، لاحظنا أن حضرتك اخترت عباية كلاسيكية سوداء وتركتها في السلة بقيمة 1,249 AED.')
  });
  eq(out.message_degraded, false, 'message_degraded (' + out.degrade_reason + ')');
});

// RULE 8 IS DELETED - ruled by Hussein 2026-09-08. It used to REQUIRE the ي
// before an attached object pronoun (تركتيهما); that spelling is the dialect one.
// The MSA 2nd-fem past is written with a final kasra and never with a ي, so the
// suffixed form the rule demanded was itself the error. These two cases are the
// SAME fixtures as before with their expectations swapped - kept rather than
// deleted, because the pair is the whole record of the reversal.
check('pronoun suffix without ي now PASSES for a female customer (rule 8 deleted)', () => {
  const out = runNode({
    cart: cart(),
    req: req({ touch_number: 2, customer_gender: 'female' }),
    cfg: CFG,
    response: ok('مرحباً ليلى، لاحظنا أن حضرتك اخترت The Complete Snowboard وتركتهما في السلة، بقيمة 1,249 AED.')
  });
  eq(out.message_degraded, false, 'message_degraded (' + out.degrade_reason + ')');
});

check('pronoun suffix WITH ي now DEGRADES (the form delivered on 2026-09-08)', () => {
  const out = runNode({
    cart: cart(),
    req: req({ touch_number: 2, customer_gender: 'female' }),
    cfg: CFG,
    response: ok('مرحباً ليلى، لاحظنا أن حضرتك اخترت The Complete Snowboard وتركتيهما في السلة، بقيمة 1,249 AED.')
  });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/bare_feminine_ya/.test(out.degrade_reason), 'got ' + out.degrade_reason);
});

// Kept from the 2026-08-31 ruling as a regression guard. The bare suffixed form is
// the correct masculine 2nd person and always was; it degraded a real male customer
// (cart f75d8d6a, 2026-08-28) only because rule 8 demanded a feminine spelling of it.
// With rule 8 gone nothing can flag it again, for any gender.
check('bare pronoun suffix PASSES for a male customer', () => {
  const out = runNode({
    cart: cart(),
    req: req({ touch_number: 2, customer_gender: 'male' }),
    cfg: CFG,
    response: ok('مرحباً ليلى، لاحظنا أن حضرتك اخترت The Complete Snowboard وتركتهما في السلة، بقيمة 1,249 AED.')
  });
  eq(out.message_degraded, false, 'message_degraded (' + out.degrade_reason + ')');
});

// Same guard for an unknown-gender cart. Under rule 8 this was a deliberate gap;
// it is now simply correct Arabic, so the assertion outlives the rule that made it
// interesting.
check('bare pronoun suffix PASSES when gender is unknown', () => {
  const out = runNode({
    cart: cart(),
    req: req({ touch_number: 2, customer_gender: 'unknown' }),
    cfg: CFG,
    response: ok('مرحباً ليلى، لاحظنا أن حضرتك اخترت The Complete Snowboard وتركتهما في السلة، بقيمة 1,249 AED.')
  });
  eq(out.message_degraded, false, 'message_degraded (' + out.degrade_reason + ')');
});

// Ruled 2026-08-04: commercial Arabic is unvowelled. Short vowels are banned;
// tanween is NOT, because مرحباً / شكراً carry it by convention and appear in
// the approved fallback templates. Both directions are asserted, because a
// literal ban on every diacritic would degrade every message that says hello.
check('vowelled اخترتِ degrades (the spelling that exposed the rule-2 conflict)', () => {
  const out = runNode({
    cart: cart(),
    req: req({ touch_number: 2 }),
    cfg: CFG,
    response: ok('مرحباً ليلى، لاحظنا أن حضرتك اخترتِ العباية وتركتِهما في السلة بقيمة 1,249 AED.')
  });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/vowel_marks_present/.test(out.degrade_reason), 'got ' + out.degrade_reason);
});

check('tanween in مرحباً does NOT degrade — it is in our own templates', () => {
  const out = runNode({
    cart: cart(),
    req: req(),
    cfg: CFG,
    response: ok('مرحباً ليلى، شكراً لاهتمامك. السلة الخاصة بحضرتك محفوظة بقيمة 1,249 AED.')
  });
  eq(out.message_degraded, false, 'message_degraded (' + out.degrade_reason + ')');
});

check('every Arabic fallback template survives the vowel-mark rule', () => {
  for (const touch of [1, 2, 3]) {
    const out = runNode({
      cart: cart(),
      req: req({ language: 'ar', touch_number: touch }),
      cfg: CFG,
      response: noResponse
    });
    assert(!/[َ-ْٰ]/.test(out.message),
      'fallback ar touch ' + touch + ' contains a banned vowel mark');
  }
});

check('BARE 2nd-fem past still passes — §1.1 is unchanged by the suffix rule', () => {
  const out = runNode({
    cart: cart(),
    req: req(),
    cfg: CFG,
    response: ok('مرحباً ليلى، لاحظنا أن حضرتك اخترت عباية كلاسيكية سوداء بقيمة 1,249 AED. السلة محفوظة.')
  });
  eq(out.message_degraded, false, 'message_degraded (' + out.degrade_reason + ')');
});

// The market ruling (style guide §1.2): حضرتك is REQUIRED in Levant/Egypt and
// WRONG to require in the Gulf. Both directions are asserted, because a check
// that fires everywhere would force an Egyptian honorific on a Khaleeji customer.
check('missing حضرتك degrades for a Levant cart', () => {
  const out = runNode({
    cart: cart(),
    req: req({ register_zone: 'levant_egypt' }),
    cfg: CFG,
    response: ok(AR_NO_HADRETAK)
  });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/missing_respectful_form/.test(out.degrade_reason), 'got ' + out.degrade_reason);
});

check('missing حضرتك does NOT degrade for a Gulf cart', () => {
  const out = runNode({
    cart: cart({ country_code: 'AE' }),
    req: req({ register_zone: 'gulf' }),
    cfg: CFG,
    response: ok(AR_NO_HADRETAK)
  });
  eq(out.message_degraded, false, 'message_degraded (' + out.degrade_reason + ')');
});

check('non-Arabic messages skip the Arabic checks', () => {
  const out = runNode({
    cart: cart(),
    req: req({ language: 'en', register_zone: 'levant_egypt' }),
    cfg: CFG,
    response: ok('Hi Sara, your cart (Silk Scarf, 1,249 AED) is still saved.')
  });
  eq(out.message_degraded, false, 'message_degraded (' + out.degrade_reason + ')');
});

console.log('\nLength budget (spec §6: 500 chars):');
check('over-long body is clipped and the whole message stays under 500', () => {
  const out = runNode({
    cart: cart(),
    req: req({ language: 'en' }),
    cfg: CFG,
    response: ok('Hello '.repeat(200))
  });
  assert(out.message.length <= 500, 'message is ' + out.message.length + ' chars');
  assert(out.message.indexOf(URL) !== -1, 'recovery url lost while clipping');
  assert(out.message.indexOf('Reply STOP to unsubscribe.') !== -1, 'opt-out line lost while clipping');
});

check('a cart with no recovery url still produces a message', () => {
  const out = runNode({
    cart: cart({ recovery_url: null }),
    req: req({ language: 'en' }),
    cfg: CFG,
    response: ok('Hi, your cart (Silk Scarf, 1,249 AED) is still saved.')
  });
  eq(out.has_recovery_url, false, 'has_recovery_url');
  assert(out.message.length > 0, 'empty message');
});

// 2026-08-04: Sonnet 5 runs adaptive thinking when `thinking` is omitted, and
// max_tokens caps thinking + text together — the model spent all 400 tokens
// thinking and returned no text block. The old code called that 'no_response',
// which reads as an API failure. Assert the diagnostic instead.
check('thinking-only response names the stop reason and block types', () => {
  const out = runNode({
    cart: cart(),
    req: req(),
    cfg: CFG,
    response: {
      content: [{ type: 'thinking', thinking: '', signature: 'abc' }],
      stop_reason: 'max_tokens'
    }
  });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/^no_text_block: stop=max_tokens blocks=\[thinking\]/.test(out.degrade_reason),
    'got ' + out.degrade_reason);
  assert(out.message.length > 0, 'fallback not substituted');
});

check('anthropic error response degrades with the api_error reason', () => {
  const out = runNode({
    cart: cart(),
    req: req(),
    cfg: CFG,
    response: { error: { type: 'overloaded_error', message: 'Overloaded' } }
  });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/^api_error:/.test(out.degrade_reason), 'got ' + out.degrade_reason);
});

// ============================================================================
// RECOVERY-LINK LOCALE (added 2026-09-03)
//
// Shopify's abandoned_checkout_url carries the locale of the storefront the
// shopper browsed, which on a single-language store is en-LB for everyone. An
// Arabic message therefore ended in a link that opened an English checkout, at
// the one moment in the sequence where the customer is asked to act.
//
// The two guards matter more than the rewrite. Getting this wrong breaks the
// single most load-bearing element of the message, and a dead recovery link
// looks exactly like four unrelated store-configuration faults this build has
// already chased. Note that every OTHER test in this file uses a URL with no
// locale parameter at all, so they collectively assert the leave-alone path.
// ============================================================================

const URL_LOC = 'https://example.myshopify.com/checkouts/cn/abc123/recover?key=deadbeef&locale=en-LB';
const URL_LOC_NO_REGION = 'https://example.myshopify.com/checkouts/cn/abc123/recover?key=deadbeef&locale=en';

console.log('\nRecovery-link locale:');

check('an Arabic cart gets an Arabic checkout, region subtag preserved', () => {
  const out = runNode({ cart: cart({ recovery_url: URL_LOC }), req: req(), cfg: CFG, response: ok(AR_RIGHT) });
  assert(out.message.indexOf('locale=ar-LB') >= 0, 'expected locale=ar-LB in: ' + out.message);
  assert(out.message.indexOf('locale=en-LB') < 0, 'the English locale should be gone');
  eq(out.recovery_url_locale, 'ar-LB', 'recovery_url_locale');
  eq(out.recovery_url_localized, true, 'recovery_url_localized');
});

check('nothing but the language subtag changes', () => {
  const out = runNode({ cart: cart({ recovery_url: URL_LOC }), req: req(), cfg: CFG, response: ok(AR_RIGHT) });
  const link = out.message.split('\n').find((l) => l.indexOf('http') === 0);
  eq(link, URL_LOC.replace('locale=en-LB', 'locale=ar-LB'),
    'the path, the recovery key and every other parameter must survive untouched');
});

check('a locale with no region subtag is rewritten without inventing one', () => {
  const out = runNode({ cart: cart({ recovery_url: URL_LOC_NO_REGION }), req: req(), cfg: CFG, response: ok(AR_RIGHT) });
  assert(out.message.indexOf('locale=ar') >= 0, 'expected locale=ar');
  assert(!/locale=ar-/.test(out.message), 'a region subtag must not be invented');
});

check('GUARD 1 - a URL with no locale parameter is returned byte-identical', () => {
  const out = runNode({ cart: cart(), req: req(), cfg: CFG, response: ok(AR_RIGHT) });
  const link = out.message.split('\n').find((l) => l.indexOf('http') === 0);
  eq(link, URL, 'Shopify also expresses locale as a PATH PREFIX; synthesising one would 404 the link');
  eq(out.recovery_url_localized, false, 'recovery_url_localized');
  eq(out.recovery_url_locale, null, 'recovery_url_locale');
});

check('GUARD 2 - a language the store does not publish leaves the link alone', () => {
  // French is a supported MESSAGE language but not a published STOREFRONT
  // language. Asking Shopify for an unpublished locale degrades the link, so
  // the customer gets a working link in the wrong language instead.
  const out = runNode({
    cart: cart({ recovery_url: URL_LOC }),
    req: req({ language: 'fr', register_zone: 'other' }),
    cfg: CFG,
    response: ok('Bonjour, votre panier est enregistré, 1,249 AED.')
  });
  assert(out.message.indexOf('locale=en-LB') >= 0, 'the link must be untouched for an unpublished locale');
  eq(out.recovery_url_localized, false, 'recovery_url_localized');
  eq(out.recovery_url_locale, 'en-LB', 'the locale that was there is still reported for the log');
});

check('an English cart already on en-LB is left alone rather than rewritten', () => {
  const out = runNode({
    cart: cart({ recovery_url: URL_LOC }),
    req: req({ language: 'en', register_zone: 'other' }),
    cfg: CFG,
    response: ok('Hi Layla, your cart is still saved, 1,249 AED.')
  });
  assert(out.message.indexOf('locale=en-LB') >= 0, 'unchanged');
  eq(out.recovery_url_localized, false, 'no rewrite when it already matches');
});

check('language "mixed" localizes to Arabic, like every other Arabic path here', () => {
  const out = runNode({
    cart: cart({ recovery_url: URL_LOC }),
    req: req({ language: 'mixed' }),
    cfg: CFG,
    response: ok(AR_RIGHT)
  });
  assert(out.message.indexOf('locale=ar-LB') >= 0, 'mixed must follow tlang to ar');
});

check('the localized link survives the 500-character overflow rebuild', () => {
  // The overflow guard rebuilds the message from `body + url + STOP`. If it read
  // the raw column instead of the localized value the link would silently revert
  // on exactly the longest messages.
  const out = runNode({
    cart: cart({ recovery_url: URL_LOC, cart_items: [{ title: 'ع'.repeat(200), quantity: 1 }] }),
    req: req(),
    cfg: CFG,
    response: ok('م'.repeat(480))
  });
  assert(out.message.length <= 500, 'hard cap breached: ' + out.message.length);
  assert(out.message.indexOf('locale=ar-LB') >= 0, 'the link reverted to the un-localized URL on the overflow path');
});

check('a cart with no recovery_url at all still produces a message', () => {
  const out = runNode({ cart: cart({ recovery_url: null }), req: req(), cfg: CFG, response: ok(AR_RIGHT) });
  eq(out.has_recovery_url, false, 'has_recovery_url');
  eq(out.recovery_url_locale, null, 'recovery_url_locale');
  assert(out.message.length > 0, 'message still sent');
});

console.log('\nService-window classification passthrough:');

check('message_class and hours_since_inbound reach the log unchanged', () => {
  const out = runNode({
    cart: cart(),
    req: req({ message_class: 'session', hours_since_inbound: 3.2 }),
    cfg: CFG,
    response: ok(AR_RIGHT)
  });
  eq(out.message_class, 'session', 'message_class');
  eq(out.hours_since_inbound, 3.2, 'hours_since_inbound');
});

check('a template-class touch is carried through the same way', () => {
  const out = runNode({
    cart: cart(),
    req: req({ message_class: 'template', hours_since_inbound: null }),
    cfg: CFG,
    response: ok(AR_RIGHT)
  });
  eq(out.message_class, 'template', 'message_class');
  eq(out.hours_since_inbound, null, 'hours_since_inbound');
});


// ---- Ruling 2026-09-08: the feminine past carries a word-final kasra ---------
// Hussein, on the two touches delivered 2026-09-08: the 2nd-person feminine past
// is `تركتِ`, the masculine is bare `تركت`, and neither takes a ي. The kasra
// collides head-on with the 2026-08-04 no-vowel-marks ruling, which was made
// precisely because a vowelled `تركتِ` was indistinguishable from the form rule
// 1.1 called correct. The carve-out is therefore as narrow as it can be: a kasra
// is tolerated ONLY at the end of a known 2nd-fem past stem, and ONLY when the
// cart's gender is female. Everywhere else every short vowel stays banned.
check('word-final kasra on a 2nd-fem past verb PASSES for a female customer', () => {
  const out = runNode({
    cart: cart(),
    req: req({ customer_gender: 'female' }),
    cfg: CFG,
    response: ok('مرحباً ليلى، حضرتك تركتِ عباية كلاسيكية سوداء في السلة بقيمة 1,249 AED. السلة محفوظة.')
  });
  eq(out.message_degraded, false, 'message_degraded (' + out.degrade_reason + ')');
});

// The carve-out is female-only on purpose. Addressed to a man the same kasra is
// the wrong person as well as a banned diacritic, so it must still degrade - the
// mirror of the 2026-08-31 ruling that made rule 8 female-only.
check('the same kasra DEGRADES for a male customer', () => {
  const out = runNode({
    cart: cart(),
    req: req({ customer_gender: 'male' }),
    cfg: CFG,
    response: ok('مرحباً ليلى، حضرتك تركتِ عباية كلاسيكية سوداء في السلة بقيمة 1,249 AED. السلة محفوظة.')
  });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/vowel_marks_present/.test(out.degrade_reason), 'got ' + out.degrade_reason);
});

// A kasra with a pronoun welded onto it is NOT carved out. Hussein's ruling names
// the bare form only, and the prompt now tells the model to drop the attached
// pronoun entirely, so a mid-word kasra means the model ignored both instructions.
// Degrading sends the respectful template, which is the cheap direction to be
// wrong in (locked decision #4: silence over a wrong message).
check('kasra before an attached pronoun still DEGRADES, even for a female customer', () => {
  const out = runNode({
    cart: cart(),
    req: req({ customer_gender: 'female' }),
    cfg: CFG,
    response: ok('مرحباً ليلى، حضرتك تركتِهما عباية كلاسيكية سوداء في السلة بقيمة 1,249 AED. السلة محفوظة.')
  });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/vowel_marks_present/.test(out.degrade_reason), 'got ' + out.degrade_reason);
});


// ---- Ruling 2026-09-08: a canonical CTA must not carry a prefixed letter -------
// Found on the corrected touch that same day: the model wrote `لأتم عملية الشراء`, which
// reads as a first-person "so that I complete the purchase". The two CTAs are MASKED
// out before the markers run (§8.2, whitelisted 2026-08-07), so a letter welded onto
// the front of one sailed through every rule unexamined - the mask removed the
// evidence. Prefixes that change person or mood are rejected; و and ف are
// left alone because they are plain conjunctions that do not touch the verb.
check('a ل prefixed onto a canonical CTA degrades', () => {
  const out = runNode({
    cart: cart(), req: req(), cfg: CFG,
    response: ok('مرحباً ليلى، سلتك محفوظة لحضرتك متى لأتم عملية الشراء')
  });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/cta_prefixed/.test(out.degrade_reason), 'got ' + out.degrade_reason);
});

check('a ب prefixed onto the other canonical CTA degrades', () => {
  const out = runNode({
    cart: cart(), req: req(), cfg: CFG,
    response: ok('مرحباً ليلى، سلتك محفوظة لحضرتك متى بأكمل طلبك')
  });
  eq(out.message_degraded, true, 'message_degraded');
  assert(/cta_prefixed/.test(out.degrade_reason), 'got ' + out.degrade_reason);
});

// Precision guard. The bare CTA is canonical and must keep passing, or the whitelist
// that has been in the node since 2026-08-07 stops working.
check('the bare canonical CTA still passes', () => {
  const out = runNode({
    cart: cart(), req: req(), cfg: CFG,
    response: ok('مرحباً ليلى، سلتك محفوظة لحضرتك متى أتم عملية الشراء')
  });
  eq(out.message_degraded, false, 'message_degraded (' + out.degrade_reason + ')');
});

// ------------------------------------------------------------------ report ---

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
if (fail) {
  failures.forEach((f) => console.log('  ' + f));
  process.exit(1);
}
