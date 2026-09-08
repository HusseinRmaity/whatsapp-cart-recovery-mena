/**
 * Regression harness for the four Code nodes in workflow 03 that nothing tested.
 *
 *   node tests/reply-handler-paths.test.js
 *
 * WHY THIS EXISTS
 * Workflow 03 got its first harnesses on 2026-09-02 (decide-route,
 * resolve-reply-context, suppression-wiring). Those cover cart OWNERSHIP and the
 * suppression wiring. Four Code nodes were still executed by nothing:
 *
 *   Parse Inbound Message      - the parser
 *   Parse Intent               - the classifier's output contract
 *   Build Owner Notification   - the holding-reply rule
 *   Build Opt-Out Confirmation - the compliance copy
 *
 * THE ONE THAT HAS ALREADY FAILED IN PRODUCTION
 * `Parse Inbound Message` carried `skip = (!phone || !message)` while a WhatsApp
 * VOICE NOTE arrives with an empty Body and NumMedia >= 1. Every voice note sent
 * to Case 2 between 2026-08-21 and 2026-09-01 was silently dropped: no
 * cart_messages row, no Slack, no holding reply. The customer answered and got
 * silence. The router had been fixed on 2026-08-21 but forwards the ORIGINAL
 * Twilio payload by design, so the fix never reached this parser - and its own
 * comment claimed the two matched. Nothing could see it, because no test ran
 * this node.
 *
 * Everything under test is read out of workflows/03-reply-handler-c2.json, so
 * the thing being tested is the thing that ships. Re-export after any edit.
 *
 * NO ARABIC IS INVENTED HERE. The opt-out confirmation is asserted
 * CODEPOINT-BY-CODEPOINT against arabic-master-reference.md section 8.5 line 236,
 * written as \u escapes rather than as raw text: a Windows terminal renders RTL
 * reversed, this build has already manufactured one false Arabic defect that
 * way, and for an assertion the codepoints ARE the logic. The holding-reply
 * strings are still marked v1 and unreviewed in the node itself, so they are
 * asserted only STRUCTURALLY (which register zone gets which variant) - that is
 * a property of the code, not a ruling on the Arabic.
 */

const fs = require('fs');
const path = require('path');

const WORKFLOW = path.join(__dirname, '..', 'workflows', '03-reply-handler-c2.json');

function loadWorkflow(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(raw) ? raw[0] : raw;
}

function loadNode(file, name) {
  const node = loadWorkflow(file).nodes.find((n) => n.name === name);
  if (!node) throw new Error('node not found in export: ' + name);
  return node;
}

const CODE = {
  parseInbound: loadNode(WORKFLOW, 'Parse Inbound Message').parameters.jsCode,
  parseIntent: loadNode(WORKFLOW, 'Parse Intent').parameters.jsCode,
  ownerNote: loadNode(WORKFLOW, 'Build Owner Notification').parameters.jsCode,
  optOut: loadNode(WORKFLOW, 'Build Opt-Out Confirmation').parameters.jsCode
};

/**
 * `Parse Inbound Message` reads $json directly - it is the first node after the
 * webhook and has no upstream to address by name.
 */
function runParseInbound(payload) {
  // eslint-disable-next-line no-new-func
  const fn = new Function('$json', CODE.parseInbound);
  return fn(payload)[0].json;
}

/** `Parse Intent` reads only $input: the raw Anthropic response. */
function runParseIntent(response) {
  const $input = { first: () => ({ json: response }) };
  // eslint-disable-next-line no-new-func
  const fn = new Function('$input', CODE.parseIntent);
  return fn($input)[0].json;
}

/**
 * The two builders address upstream nodes by name. The stub THROWS on an
 * un-stubbed name, reproducing n8n's "node did not execute on this branch"
 * behaviour, so a node that quietly starts reading something new fails loudly
 * here instead of silently at 3am.
 */
function makeAccessor(nodes) {
  return (name) => {
    if (!(name in nodes)) throw new Error('node did not execute on this branch: ' + name);
    return { first: () => ({ json: nodes[name] }) };
  };
}

function runOwnerNote({ ctx, intent }) {
  const $ = makeAccessor({ 'Resolve Reply Context': ctx, 'Parse Intent': intent });
  // eslint-disable-next-line no-new-func
  const fn = new Function('$', CODE.ownerNote);
  return fn($)[0].json;
}

function runOptOut({ ctx, patchRows }) {
  const $ = makeAccessor({ 'Resolve Reply Context': ctx });
  const $input = { first: () => ({ json: { body: patchRows } }) };
  // eslint-disable-next-line no-new-func
  const fn = new Function('$', '$input', CODE.optOut);
  return fn($, $input)[0].json;
}

// ---------------------------------------------------------------- fixtures ---

/** A Twilio inbound webhook body, form fields as Twilio actually sends them. */
function twilio(overrides) {
  return Object.assign({
    From: 'whatsapp:+96181234567',
    Body: 'do you ship to Beirut?',
    MessageSid: 'SM' + '0'.repeat(30),
    NumMedia: '0'
  }, overrides || {});
}

function context(overrides) {
  return Object.assign({
    route: 'classify',
    has_cart: true,
    cart_id: 'cart-1',
    checkout_token: 'tok-1',
    cart_status: 'recovering',
    touches_sent: 2,
    next_touch_at: '2026-09-04T09:00:00.000Z',
    customer_first_name: 'Layla',
    phone: '+96181234567',
    language: 'en',
    country_code: 'LB',
    register_zone: 'levant_egypt',
    items_summary: 'Silk Hijab Set x1',
    item_count: 1,
    total_display: '1,249 AED',
    recovery_url: 'https://example.myshopify.com/checkouts/cn/abc/recover?key=k',
    inbound_message: 'do you ship to Beirut?',
    inbound_sid: 'SM1',
    has_media: false,
    media_kind: null
  }, overrides || {});
}

function intentOf(intent, overrides) {
  return Object.assign({
    intent: intent,
    intent_reason: 'because',
    intent_degraded: false,
    intent_detail: null,
    intent_source: 'model'
  }, overrides || {});
}

/** An Anthropic /v1/messages success envelope carrying `text`. */
function anthropic(text) {
  return { content: [{ type: 'text', text: text }], stop_reason: 'end_turn' };
}

// -------------------------------------------------------------- assertions ---

let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function eq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(label + ' expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
}

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

// ============================================================================
console.log('\nParse Inbound Message - text:');

check('a plain text reply parses and is not skipped', () => {
  const r = runParseInbound(twilio());
  eq(r.skip, false, 'skip');
  eq(r.inbound_phone, '+96181234567', 'phone');
  eq(r.inbound_message, 'do you ship to Beirut?', 'message');
  eq(r.has_media, false, 'has_media');
});

check('the whatsapp: prefix and phone punctuation are stripped', () => {
  const r = runParseInbound(twilio({ From: 'whatsapp:+961 81-234 (567)' }));
  eq(r.inbound_phone, '+96181234567', 'normalised phone');
});

check('an n8n-wrapped body ($json.body) is read the same way', () => {
  const r = runParseInbound({ body: twilio() });
  eq(r.inbound_phone, '+96181234567', 'phone');
  eq(r.skip, false, 'skip');
});

check('an empty message with no media IS skipped', () => {
  const r = runParseInbound(twilio({ Body: '' }));
  eq(r.skip, true, 'skip');
});

check('a message with no phone IS skipped', () => {
  const r = runParseInbound(twilio({ From: '' }));
  eq(r.skip, true, 'skip');
});

console.log('\nParse Inbound Message - media (the 2026-09-01 defect):');

check('a VOICE NOTE is not dropped and gets a placeholder', () => {
  const r = runParseInbound(twilio({ Body: '', NumMedia: '1', MediaContentType0: 'audio/ogg; codecs=opus' }));
  eq(r.skip, false, 'skip - a voice note reached the handler and must not be dropped');
  eq(r.media_kind, 'voice', 'media_kind');
  eq(r.has_media, true, 'has_media');
  eq(r.inbound_message, '[voice note]', 'placeholder');
});

check('each media type maps to its own placeholder', () => {
  const cases = [
    ['image/jpeg', 'image', '[image]'],
    ['video/mp4', 'video', '[video]'],
    ['application/pdf', 'document', '[document]'],
    ['application/zip', 'attachment', '[attachment]']
  ];
  cases.forEach(([ctype, kind, label]) => {
    const r = runParseInbound(twilio({ Body: '', NumMedia: '1', MediaContentType0: ctype }));
    eq(r.media_kind, kind, ctype + ' media_kind');
    eq(r.inbound_message, label, ctype + ' placeholder');
    eq(r.skip, false, ctype + ' skip');
  });
});

check('a caption sent WITH media is kept, not replaced by the placeholder', () => {
  const r = runParseInbound(twilio({ Body: 'is this the right size?', NumMedia: '1', MediaContentType0: 'image/jpeg' }));
  eq(r.inbound_message, 'is this the right size?', 'caption preserved');
  eq(r.has_media, true, 'has_media still true');
});

check('media_type is reported for a kind we do not recognise', () => {
  const r = runParseInbound(twilio({ Body: '', NumMedia: '1', MediaContentType0: 'application/zip' }));
  eq(r.media_type, 'application/zip', 'media_type');
  eq(r.num_media, 1, 'num_media');
});

// ============================================================================
console.log('\nParse Intent:');

check('all four valid intents round-trip from the model', () => {
  ['wants_to_buy', 'question', 'opt_out', 'other'].forEach((intent) => {
    const r = runParseIntent(anthropic(JSON.stringify({ intent: intent, reason: 'r' })));
    eq(r.intent, intent, intent + ' intent');
    eq(r.intent_degraded, false, intent + ' degraded');
    eq(r.intent_source, 'model', intent + ' source');
  });
});

check('a fenced ```json block is unwrapped', () => {
  const r = runParseIntent(anthropic('```json\n{"intent":"question","reason":"asks about shipping"}\n```'));
  eq(r.intent, 'question', 'intent');
  eq(r.intent_degraded, false, 'degraded');
});

check('an intent the contract does not allow falls back to other', () => {
  const r = runParseIntent(anthropic(JSON.stringify({ intent: 'angry', reason: 'r' })));
  eq(r.intent, 'other', 'intent');
  eq(r.intent_degraded, true, 'degraded');
  assert(String(r.intent_detail).indexOf('unexpected_intent') === 0, 'detail should name the unexpected value, got ' + r.intent_detail);
});

check('an API error object falls back to other and says so', () => {
  const r = runParseIntent({ error: { type: 'overloaded_error', message: 'busy' } });
  eq(r.intent, 'other', 'intent');
  eq(r.intent_degraded, true, 'degraded');
  assert(String(r.intent_detail).indexOf('api_error') === 0, 'detail should be api_error, got ' + r.intent_detail);
});

check('unparseable text falls back to other rather than throwing', () => {
  const r = runParseIntent(anthropic('I think they want to buy!'));
  eq(r.intent, 'other', 'intent');
  eq(r.intent_degraded, true, 'degraded');
  eq(r.intent_detail, 'parse_error', 'detail');
});

check('a degraded classification is labelled default_fallback, never model', () => {
  const r = runParseIntent({});
  eq(r.intent, 'other', 'intent');
  eq(r.intent_source, 'default_fallback', 'source - the digest uses this to tell a real classification from a fallback');
});

// ============================================================================
console.log('\nBuild Owner Notification - the holding-reply rule:');

check('wants_to_buy gets a holding reply', () => {
  const r = runOwnerNote({ ctx: context(), intent: intentOf('wants_to_buy') });
  eq(r.needs_holding_reply, true, 'needs_holding_reply');
});

check('question gets a holding reply', () => {
  const r = runOwnerNote({ ctx: context(), intent: intentOf('question') });
  eq(r.needs_holding_reply, true, 'needs_holding_reply');
});

check('other gets NO holding reply - we promise nothing for a thumbs-up', () => {
  const r = runOwnerNote({ ctx: context({ inbound_message: '👍' }), intent: intentOf('other') });
  eq(r.needs_holding_reply, false, 'needs_holding_reply');
});

check('other PLUS MEDIA does get one (the 2026-09-01 ruling)', () => {
  const r = runOwnerNote({
    ctx: context({ inbound_message: '[voice note]', has_media: true, media_kind: 'voice' }),
    intent: intentOf('other')
  });
  eq(r.needs_holding_reply, true,
    'a voice note the classifier cannot read is still an unambiguous communication - silence there is the defect that was fixed on 2026-09-01');
});

check('a degraded classification on media still gets a holding reply', () => {
  const r = runOwnerNote({
    ctx: context({ inbound_message: '[voice note]', has_media: true, media_kind: 'voice' }),
    intent: intentOf('other', { intent_degraded: true, intent_source: 'default_fallback' })
  });
  eq(r.needs_holding_reply, true, 'needs_holding_reply');
});

// The rich content moved from `slack_text` into Block Kit on 2026-09-08, so the
// same guarantees are asserted against the blocks. `slack_text` stays as the
// notification fallback Slack shows in the sidebar and on a locked phone.
const blocksOf = (r) => JSON.stringify(r.slack_blocks);

check('the Slack body carries the cart context the owner needs to answer', () => {
  const r = runOwnerNote({ ctx: context(), intent: intentOf('question') });
  const b = blocksOf(r);
  assert(b.indexOf('Layla') >= 0, 'customer name missing');
  assert(b.indexOf('+96181234567') >= 0, 'phone missing');
  assert(b.indexOf('recovering') >= 0, 'cart status missing');
  assert(b.indexOf('touch 2 of 3') >= 0, 'touch count missing, got: ' + b);
  assert(b.indexOf('1,249 AED') >= 0, 'formatted total missing');
  assert(b.indexOf('do you ship to Beirut?') >= 0, 'the reply itself is missing');
});

check('a degraded classification is flagged to the owner, not hidden', () => {
  const r = runOwnerNote({
    ctx: context(),
    intent: intentOf('other', { intent_degraded: true, intent_source: 'default_fallback' })
  });
  assert(blocksOf(r).indexOf('classifier unavailable') >= 0,
    'the owner must be told the intent was a fallback, not a reading');
});

// ---- Ruled 2026-09-08: the phone must be one tap away ------------------------
// The owner reads this on a phone and answers on WhatsApp. A plain E.164 string
// makes them copy, switch app and paste; a wa.me link opens the conversation.
check('the phone is rendered as a clickable wa.me link', () => {
  const r = runOwnerNote({ ctx: context(), intent: intentOf('question') });
  const b = blocksOf(r);
  assert(b.indexOf('https://wa.me/96181234567') >= 0, 'wa.me link missing, got: ' + b);
  assert(b.indexOf('wa.me/+') < 0, 'the + must be stripped from the wa.me path or the link 404s');
});

check('the wa.me path keeps digits only, whatever the stored format', () => {
  const r = runOwnerNote({
    ctx: context({ phone: '+961 81 234 567' }),
    intent: intentOf('question')
  });
  assert(blocksOf(r).indexOf('https://wa.me/96181234567') >= 0,
    'spaces in the stored phone must not reach the URL');
});

check('the blocks open with a header so the channel scans in one line', () => {
  const r = runOwnerNote({ ctx: context(), intent: intentOf('wants_to_buy') });
  eq(r.slack_blocks[0].type, 'header', 'first block type');
});

check('slack_text stays a short notification fallback, not the whole message', () => {
  const r = runOwnerNote({ ctx: context(), intent: intentOf('question') });
  assert(r.slack_text.length <= 120, 'fallback too long (' + r.slack_text.length + '): ' + r.slack_text);
  assert(r.slack_text.indexOf('Layla') >= 0, 'fallback should still name the customer');
});

console.log('\nBuild Owner Notification - language and register selection:');

check('holding text follows the cart language, and mixed maps to Arabic', () => {
  const ar = runOwnerNote({ ctx: context({ language: 'ar' }), intent: intentOf('question') });
  const mixed = runOwnerNote({ ctx: context({ language: 'mixed' }), intent: intentOf('question') });
  eq(mixed.holding_text, ar.holding_text, 'mixed must inherit the Arabic string');
});

check('the Levant variant carries the honorific and the plain one does not', () => {
  // Structural only. The Arabic wording itself is still marked v1 and
  // unreviewed in the node; what is asserted here is that the register-zone
  // switch actually selects a different string, which is code, not Arabic.
  const HADRETAK = 'حضرتك';
  const levant = runOwnerNote({ ctx: context({ language: 'ar', register_zone: 'levant_egypt' }), intent: intentOf('question') });
  const gulf = runOwnerNote({ ctx: context({ language: 'ar', register_zone: 'gulf' }), intent: intentOf('question') });
  assert(levant.holding_text.indexOf(HADRETAK) >= 0, 'the Levant/Egypt variant should carry the honorific');
  assert(gulf.holding_text.indexOf(HADRETAK) < 0, 'the Gulf variant must NOT carry it - it reads as Egyptian/Levantine there');
  assert(levant.holding_text !== gulf.holding_text, 'the two register zones must not collapse to one string');
});

check('en and fr each get their own holding text', () => {
  const en = runOwnerNote({ ctx: context({ language: 'en' }), intent: intentOf('question') });
  const fr = runOwnerNote({ ctx: context({ language: 'fr' }), intent: intentOf('question') });
  assert(en.holding_text !== fr.holding_text, 'en and fr must differ');
  assert(/team/i.test(en.holding_text), 'en text should mention the team, got: ' + en.holding_text);
  assert(/équipe/i.test(fr.holding_text), 'fr text should mention the equipe, got: ' + fr.holding_text);
});

check('a holding reply never invents a time, a price or a stock claim', () => {
  ['en', 'fr'].forEach((lang) => {
    const r = runOwnerNote({ ctx: context({ language: lang }), intent: intentOf('question') });
    assert(!/\d/.test(r.holding_text),
      lang + ' holding text contains a digit, which risks promising a time or a price: ' + r.holding_text);
  });
});

// ============================================================================

// ---- Ruled 2026-09-08: no link previews on the notification -----------------
// Hussein, on the first card posted with the wa.me link: Slack unfurled it into a
// full "WhatsApp Messenger" preview - logo, title, description - several times
// the height of the notification itself and saying nothing the owner needs. The
// recovery link would unfurl into a Shopify preview for the same reason. BOTH
// flags are needed: `unfurl_links` suppresses the URL preview, `unfurl_media`
// suppresses the image it drags in.
//
// This is the ONLY Slack post in Case 2 that emits a URL - checked node by node
// across all eight workflows rather than assumed - so there is no sibling to fix.
check('the Slack post disables link and media unfurling', () => {
  const body = loadNode(WORKFLOW, 'Slack Notify Owner').parameters.jsonBody;
  assert(/unfurl_links:\s*false/.test(body), 'unfurl_links not disabled: ' + body);
  assert(/unfurl_media:\s*false/.test(body), 'unfurl_media not disabled: ' + body);
});

console.log('\nBuild Opt-Out Confirmation:');

// arabic-master-reference.md section 8.5 line 236, status [OK], adopted verbatim
// 2026-09-02. Written as escapes because the codepoints ARE the assertion - see
// the file header. 26 characters.
const AR_OPTOUT_REF =
  'تم إيقاف الرسائل. ' +
  'شكراً لك';

check('the Arabic confirmation is codepoint-identical to reference 8.5 line 236', () => {
  const r = runOptOut({ ctx: context({ language: 'ar' }), patchRows: [{ id: 'c1' }] });
  eq(r.confirmation_text.length, 26, 'length');
  eq(r.confirmation_text, AR_OPTOUT_REF,
    'the vetted glossary string must ship byte-for-byte - it is a fixed string (reference rule 0.2), never regenerated, paraphrased or inflected');
});

check('the Arabic string does NOT branch on register zone', () => {
  // A glossary term is a fixed string and does not inflect. The register branch
  // was deleted on 2026-09-02; this is what stops it coming back.
  const levant = runOptOut({ ctx: context({ language: 'ar', register_zone: 'levant_egypt' }), patchRows: [{}] });
  const gulf = runOptOut({ ctx: context({ language: 'ar', register_zone: 'gulf' }), patchRows: [{}] });
  eq(levant.confirmation_text, gulf.confirmation_text, 'both register zones must send the identical fixed string');
});

check('mixed inherits the Arabic confirmation', () => {
  const r = runOptOut({ ctx: context({ language: 'mixed' }), patchRows: [{}] });
  eq(r.confirmation_text, AR_OPTOUT_REF, 'mixed maps to ar');
});

check('en and fr describe PHONE-level scope, not one cart', () => {
  const en = runOptOut({ ctx: context({ language: 'en' }), patchRows: [{}] });
  const fr = runOptOut({ ctx: context({ language: 'fr' }), patchRows: [{}] });
  assert(!/this cart/i.test(en.confirmation_text),
    'en still scopes the promise to one cart, but suppression is per phone since 2026-09-02: ' + en.confirmation_text);
  assert(!/panier/i.test(fr.confirmation_text),
    'fr still scopes the promise to one cart: ' + fr.confirmation_text);
  assert(/de notre part/i.test(fr.confirmation_text),
    'fr must keep "de notre part" or it claims we can stop messages we do not send');
});

check('an unknown language falls back to English rather than throwing', () => {
  const r = runOptOut({ ctx: context({ language: 'de' }), patchRows: [{}] });
  assert(r.confirmation_text && r.confirmation_text.length > 0, 'a confirmation must always be produced');
});

check('zero rows updated means already suppressed - no second confirmation', () => {
  const r = runOptOut({ ctx: context({ language: 'en' }), patchRows: [] });
  eq(r.rows_updated, 0, 'rows_updated');
  eq(r.already_suppressed, true, 'already_suppressed - this is what stops a repeat STOP getting a second reply');
});

check('a phone-scoped opt-out updating TWO carts is not "already suppressed"', () => {
  // Since 2026-09-02 one STOP suppresses every open cart on the phone, so
  // rows_updated of 2 is a correct multi-cart opt-out, not an anomaly.
  const r = runOptOut({ ctx: context({ language: 'en' }), patchRows: [{ id: 'a' }, { id: 'b' }] });
  eq(r.rows_updated, 2, 'rows_updated');
  eq(r.already_suppressed, false, 'already_suppressed');
});

// ----------------------------------------------------------------- summary ---

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
if (fail) {
  failures.forEach((f) => console.log('  ' + f));
  process.exit(1);
}
