/**
 * Regression harness for workflow 03's `Resolve Reply Context` Code node.
 *
 *   node tests/resolve-reply-context.test.js
 *
 * WHY THIS EXISTS
 * Workflow 03 had NO harness until 2026-09-02. Every defect ever found in it was
 * found by a message reaching a real handset.
 *
 * THE BUG THIS WAS WRITTEN FOR (2026-09-02)
 * `Match Cart By Phone` asked for `order=created_at.desc` with `limit=1`, and
 * this node took `body[0]`. That is the same defect the router had, one workflow
 * downstream, and here it is a COMPLIANCE failure rather than a routing one:
 *
 *   `route` is derived from the chosen cart, and `Suppress Cart` acts on it. A
 *   customer holding an active cart A and a newer CONVERTED cart B who replies
 *   `توقف` had cart B suppressed — a cart that was already closed and sending
 *   nothing — while cart A carried on messaging them. The opt-out silently
 *   failed, and the run log said it succeeded.
 *
 * The ownership rule now lives in `pickCart`, identical to the router's, because
 * the two MUST agree: if the router forwards on cart X and this node acts on
 * cart Y, the system answers a conversation it did not route. The last test in
 * this file asserts the two nodes still share the same status list — n8n Code
 * nodes cannot import a shared module, so the duplication is deliberate (same
 * reason fmtMoney and register_zone are duplicated from workflow 02) and this is
 * what keeps it honest.
 *
 * Everything under test is read out of workflows/03-reply-handler-c2.json, so
 * the thing being tested is the thing that ships. Re-export after any edit.
 */

const fs = require('fs');
const path = require('path');

const WORKFLOW = path.join(__dirname, '..', 'workflows', '03-reply-handler-c2.json');
const ROUTER = path.join(__dirname, '..', 'workflows', '03r-inbound-router.json');
const NODE_NAME = 'Resolve Reply Context';
const LOOKUP_NAME = 'Match Cart By Phone';

function loadWorkflow(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(raw) ? raw[0] : raw;
}

function loadNode(file, name) {
  const node = loadWorkflow(file).nodes.find((n) => n.name === name);
  if (!node) throw new Error('node not found in export: ' + name);
  return node;
}

const CODE = loadNode(WORKFLOW, NODE_NAME).parameters.jsCode;

function lookupParam(name) {
  const params = loadNode(WORKFLOW, LOOKUP_NAME).parameters.queryParameters.parameters;
  const hit = params.find((p) => p.name === name);
  return hit ? hit.value : undefined;
}

function runNode({ carts, inbound, code }) {
  const resp = { statusCode: code === undefined ? 200 : code, body: carts };
  const nodes = { 'Parse Inbound Message': inbound || inboundMsg() };
  const $ = (name) => {
    if (!(name in nodes)) throw new Error('node did not execute on this branch: ' + name);
    return { first: () => ({ json: nodes[name] }) };
  };
  const $input = { first: () => ({ json: resp }) };
  // eslint-disable-next-line no-new-func
  const fn = new Function('$', '$input', CODE);
  return fn($, $input)[0].json;
}

// ---------------------------------------------------------------- fixtures ---

function inboundMsg(overrides) {
  return Object.assign(
    {
      inbound_phone: '+96181234567',
      inbound_message: 'كم يستغرق التوصيل؟',
      inbound_sid: 'SM-test-1',
      has_media: false,
      media_kind: null
    },
    overrides || {}
  );
}

function cart(overrides) {
  return Object.assign(
    {
      id: 'cart-1',
      checkout_token: 'tok-1',
      status: 'recovering',
      touches_sent: 1,
      opted_out: false,
      language: 'ar',
      country_code: 'LB',
      customer_first_name: 'حسين',
      cart_items: [{ title: 'عباية', quantity: 1 }],
      cart_total: 19022000,
      currency: 'LBP',
      recovery_url: 'https://example.test/recover',
      next_touch_at: null,
      created_at: '2026-09-01T11:35:00.000Z'
    },
    overrides || {}
  );
}

const CLOSED_NEWER = cart({
  id: 'closed-new',
  status: 'converted_before_first_touch',
  touches_sent: 0,
  created_at: '2026-09-01T18:05:34.000Z'
});

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

console.log('\nResolve Reply Context — ' + WORKFLOW.replace(/.*[\\/]/, '') + '\n');

console.log('Cart selection — the 2026-09-02 misattribution:');

check('an older claiming cart beats a NEWER closed cart', () => {
  const out = runNode({ carts: [CLOSED_NEWER, cart({ id: 'claiming', status: 'exhausted', touches_sent: 3 })] });
  eq(out.cart_id, 'claiming', 'cart_id');
  eq(out.cart_status, 'exhausted', 'cart_status');
});

check('an opt-out keyword suppresses the CLAIMING cart, not a newer closed one', () => {
  const out = runNode({
    carts: [CLOSED_NEWER, cart({ id: 'claiming', status: 'recovering' })],
    inbound: inboundMsg({ inbound_message: 'توقف' })
  });
  eq(out.route, 'opt_out_keyword', 'route');
  eq(out.cart_id, 'claiming', 'the cart that is actually sending must be the one suppressed');
});

check('an already-suppressed cart is recognised even when a newer closed cart exists', () => {
  const out = runNode({
    carts: [CLOSED_NEWER, cart({ id: 'stopped', status: 'opted_out', opted_out: true })]
  });
  eq(out.route, 'already_suppressed', 'route');
  eq(out.cart_id, 'stopped', 'cart_id');
});

check('a live cart outranks an opted-out cart', () => {
  const out = runNode({
    carts: [
      cart({ id: 'live', status: 'recovering', created_at: '2026-09-02T08:00:00.000Z' }),
      cart({ id: 'stopped', status: 'opted_out', opted_out: true, created_at: '2026-09-01T15:00:00.000Z' })
    ]
  });
  eq(out.cart_id, 'live', 'cart_id');
  eq(out.route, 'classify', 'route');
});

check('with every cart closed the newest is kept for context', () => {
  const out = runNode({
    carts: [CLOSED_NEWER, cart({ id: 'closed-old', status: 'recovered', created_at: '2026-09-01T09:00:00.000Z' })]
  });
  eq(out.cart_id, 'closed-new', 'cart_id');
  eq(out.has_cart, true, 'has_cart');
});

check('no cart at all routes to no_match', () => {
  const out = runNode({ carts: [] });
  eq(out.route, 'no_match', 'route');
  eq(out.has_cart, false, 'has_cart');
  eq(out.cart_id, null, 'cart_id');
});

check('a failed lookup routes to no_match and says the lookup failed', () => {
  const out = runNode({ carts: null, code: 500 });
  eq(out.route, 'no_match', 'route');
  eq(out.lookup_ok, false, 'lookup_ok');
});

console.log('\nThe query that feeds the picker:');

check('Match Cart By Phone does not clamp to a single row', () => {
  assert(String(lookupParam('limit')) !== '1', 'limit=1 makes pickCart unreachable');
});

check('Match Cart By Phone keeps a bounded limit (global standard #8)', () => {
  const limit = Number(lookupParam('limit'));
  assert(Number.isFinite(limit) && limit > 1 && limit <= 100, 'bounded limit > 1 required, got ' + lookupParam('limit'));
});

check('Match Cart By Phone still orders newest first', () => {
  eq(lookupParam('order'), 'created_at.desc', 'order');
});

console.log('\nOpt-out keyword matching — compliance, must keep working:');

check('the QUOTED Arabic keyword from the touch-1 opt-out line is recognised', () => {
  const out = runNode({ carts: [cart()], inbound: inboundMsg({ inbound_message: '"توقف"' }) });
  eq(out.route, 'opt_out_keyword', 'route');
  eq(out.keyword_hit, 'توقف', 'keyword_hit');
});

check('STOP in any case is recognised', () => {
  ['STOP', 'stop', 'Stop please'].forEach((m) => {
    const out = runNode({ carts: [cart()], inbound: inboundMsg({ inbound_message: m }) });
    eq(out.route, 'opt_out_keyword', 'route for ' + JSON.stringify(m));
  });
});

check('a sentence merely containing the word stop is NOT an opt-out', () => {
  const out = runNode({
    carts: [cart()],
    inbound: inboundMsg({ inbound_message: "don't stop sending these, they're useful" })
  });
  eq(out.route, 'classify', 'route');
  eq(out.keyword_hit, null, 'keyword_hit');
});

console.log('\nMedia and formatting carried into the reply:');

check('a voice note carries has_media and media_kind through', () => {
  const out = runNode({
    carts: [cart()],
    inbound: inboundMsg({ inbound_message: '[voice note]', has_media: true, media_kind: 'voice' })
  });
  eq(out.has_media, true, 'has_media');
  eq(out.media_kind, 'voice', 'media_kind');
});

check('LBP is formatted with separators and no decimals, currency last', () => {
  const out = runNode({ carts: [cart()] });
  eq(out.total_display, '19,022,000 LBP', 'total_display');
});

check('a Lebanese cart resolves the levant_egypt register zone', () => {
  const out = runNode({ carts: [cart({ country_code: 'LB' })] });
  eq(out.register_zone, 'levant_egypt', 'register_zone');
});

console.log('\nThe router and this node must not drift apart:');

check('both nodes use the same set of statuses that keep the phone', () => {
  const routerCode = loadNode(ROUTER, 'Decide Route').parameters.jsCode;
  const grab = (src) => {
    const m = src.match(/CASE2_STATUSES\s*=\s*\[([^\]]*)\]/);
    if (!m) throw new Error('CASE2_STATUSES not found');
    return m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean).sort().join(',');
  };
  eq(grab(CODE), grab(routerCode), 'status list must match the router exactly');
});

// ------------------------------------------------------------------ report ---

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
if (fail) {
  failures.forEach((f) => console.log('  ' + f));
  process.exit(1);
}
