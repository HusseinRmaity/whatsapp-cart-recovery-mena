/**
 * Regression harness for workflow 03r's `Decide Route` Code node, and for the
 * `Lookup Recent Cart` query that feeds it.
 *
 *   node tests/decide-route.test.js
 *
 * WHY THIS EXISTS
 * Workflows 03r and 03 had NO harness at all until 2026-09-02, which is exactly
 * why every defect ever found in them was found by a message reaching a real
 * handset: the voice-note drop and the `حضرتك` disagreement on 2026-09-01, and
 * then the routing bug below on 2026-09-02.
 *
 * THE BUG THIS WAS WRITTEN FOR (2026-09-02)
 * A voice note sent to a phone with four carts was routed to Case 1 and dropped.
 * The media parsing was fine. `Lookup Recent Cart` asked for `order=created_at.desc`
 * with `limit=1`, so the node saw exactly ONE cart — the newest — and let that
 * single row decide ownership. The newest cart was `converted_before_first_touch`
 * (closed), so the router concluded Case 2 had no claim and released the phone,
 * while three older carts on the same number still claimed it.
 *
 * In production that is: customer abandons cart A, converts cart B the next day,
 * cart A is still `recovering` and gets touch 2 — and the customer's reply to it
 * is handed to another system. The compliance version is worse: an `opted_out`
 * cart outranked by a newer closed cart sends a repeat STOP to the wrong system.
 *
 * `Decide Route` already solved this shape for Case 3. `pickAppointment()` exists
 * because a real `توقف` was routed to Case 1 twice on 2026-08-09 when a cancelled
 * appointment sorted ahead of a live one. Case 3 got a picker; Case 2 kept
 * `limit=1`. `pickCart()` closes that asymmetry.
 *
 * Same contract as the other three harnesses: everything under test is read
 * straight out of workflows/03r-inbound-router.json, so the thing being tested is
 * the thing that ships. Re-export the workflow after any edit, then re-run this.
 */

const fs = require('fs');
const path = require('path');

const WORKFLOW = path.join(__dirname, '..', 'workflows', '03r-inbound-router.json');
const NODE_NAME = 'Decide Route';
const LOOKUP_NAME = 'Lookup Recent Cart';

function loadWorkflow() {
  const raw = JSON.parse(fs.readFileSync(WORKFLOW, 'utf8'));
  return Array.isArray(raw) ? raw[0] : raw;
}

function loadNode(name) {
  const node = loadWorkflow().nodes.find((n) => n.name === name);
  if (!node) throw new Error('node not found in export: ' + name);
  return node;
}

const CODE = loadNode(NODE_NAME).parameters.jsCode;

/** Reads a query parameter off the Lookup Recent Cart HTTP node. */
function lookupParam(name) {
  const params = loadNode(LOOKUP_NAME).parameters.queryParameters.parameters;
  const hit = params.find((p) => p.name === name);
  return hit ? hit.value : undefined;
}

/**
 * Runs the node body with the accessors n8n provides.
 *
 * Three lookups feed this node and each is fullResponse + neverError, so each
 * arrives as { statusCode, body } rather than throwing. The waitlist lookup is
 * the node's direct input ($input); the other two are read by name.
 */
function runNode({ carts, appts, waitlist, inbound, cartCode, apptCode, wlCode }) {
  const resp = (list, code) => ({ statusCode: code === undefined ? 200 : code, body: list });
  const nodes = {
    'Parse Inbound Message': inbound || INBOUND,
    'Lookup Recent Cart': resp(carts || [], cartCode),
    'Lookup Case 3 Contact': resp(appts || [], apptCode)
  };
  const $ = (name) => {
    if (!(name in nodes)) throw new Error('node did not execute on this branch: ' + name);
    return { first: () => ({ json: nodes[name] }) };
  };
  const $input = { first: () => ({ json: resp(waitlist || [], wlCode) }) };
  // eslint-disable-next-line no-new-func
  const fn = new Function('$', '$input', CODE);
  return fn($, $input)[0].json;
}

// ---------------------------------------------------------------- fixtures ---

const INBOUND = {
  inbound_phone: '+96181234567',
  inbound_sid: 'MM9bff0721a94a5eeb64fd53d6e64fdff5',
  inbound_message: '[voice note]'
};

/** Carts come back from PostgREST already ordered created_at.desc. */
function cart(overrides) {
  return Object.assign(
    {
      id: 'cart-1',
      checkout_token: 'tok-1',
      status: 'abandoned',
      touches_sent: 0,
      opted_out: false,
      language: 'ar',
      created_at: '2026-09-01T11:35:00.000Z'
    },
    overrides || {}
  );
}

function appt(overrides) {
  return Object.assign(
    {
      id: 'appt-1',
      status: 'scheduled',
      opted_out: false,
      appointment_at: '2026-09-10T09:00:00.000Z'
    },
    overrides || {}
  );
}

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

console.log('\nDecide Route — ' + WORKFLOW.replace(/.*[\\/]/, '') + '\n');

console.log('The 2026-09-02 misroute — a closed cart must not outrank a claiming one:');

check('an older exhausted cart beats a NEWER closed cart', () => {
  const out = runNode({
    carts: [
      cart({ id: 'closed-new', status: 'converted_before_first_touch', created_at: '2026-09-01T18:05:34.000Z' }),
      cart({ id: 'exhausted-old', status: 'exhausted', touches_sent: 3, created_at: '2026-09-01T11:35:00.000Z' })
    ]
  });
  eq(out.target, 'case2', 'target');
  eq(out.route_reason, 'cart_exhausted', 'route_reason');
  eq(out.cart_id, 'exhausted-old', 'cart_id must be the cart that still owns the conversation');
});

check('an older OPTED-OUT cart beats a newer closed cart (repeat STOP must not leave Case 2)', () => {
  const out = runNode({
    carts: [
      cart({ id: 'closed-new', status: 'recovered', created_at: '2026-09-01T18:05:34.000Z' }),
      cart({ id: 'stopped-old', status: 'opted_out', opted_out: true, created_at: '2026-09-01T15:13:06.000Z' })
    ]
  });
  eq(out.target, 'case2', 'target');
  eq(out.route_reason, 'cart_opted_out', 'route_reason');
  eq(out.cart_id, 'stopped-old', 'cart_id');
});

check('a live cart outranks an opted-out cart', () => {
  const out = runNode({
    carts: [
      cart({ id: 'live-new', status: 'recovering', touches_sent: 1, created_at: '2026-09-02T08:00:00.000Z' }),
      cart({ id: 'stopped-old', status: 'opted_out', opted_out: true, created_at: '2026-09-01T15:13:06.000Z' })
    ]
  });
  eq(out.route_reason, 'cart_recovering', 'route_reason');
  eq(out.cart_id, 'live-new', 'cart_id');
});

check('among several claiming carts the most recent one wins', () => {
  const out = runNode({
    carts: [
      cart({ id: 'claim-new', status: 'abandoned', created_at: '2026-09-02T08:00:00.000Z' }),
      cart({ id: 'claim-old', status: 'exhausted', created_at: '2026-09-01T11:35:00.000Z' })
    ]
  });
  eq(out.cart_id, 'claim-new', 'cart_id');
  eq(out.route_reason, 'cart_abandoned', 'route_reason');
});

check('all four statuses that keep the phone are honoured', () => {
  ['pending_verification', 'abandoned', 'recovering', 'exhausted'].forEach((status) => {
    const out = runNode({
      carts: [
        cart({ id: 'closed-new', status: 'recovered', created_at: '2026-09-02T09:00:00.000Z' }),
        cart({ id: 'claiming', status: status, created_at: '2026-09-01T09:00:00.000Z' })
      ]
    });
    eq(out.target, 'case2', 'target for ' + status);
    eq(out.cart_id, 'claiming', 'cart_id for ' + status);
  });
});

console.log('\nReleasing the phone — unchanged behaviour that must stay unchanged:');

check('every cart closed releases the phone to Case 1, naming the newest', () => {
  const out = runNode({
    carts: [
      cart({ id: 'closed-new', status: 'converted_before_first_touch', created_at: '2026-09-01T18:05:34.000Z' }),
      cart({ id: 'closed-old', status: 'recovered', created_at: '2026-09-01T11:35:00.000Z' })
    ]
  });
  eq(out.target, 'case1', 'target');
  eq(out.route_reason, 'cart_closed_converted_before_first_touch', 'route_reason names the newest closed cart');
  eq(out.cart_id, 'closed-new', 'cart_id');
});

check('no cart at all goes to Case 1 as no_recent_cart', () => {
  const out = runNode({ carts: [] });
  eq(out.target, 'case1', 'target');
  eq(out.route_reason, 'no_recent_cart', 'route_reason');
  eq(out.cart_id, null, 'cart_id');
});

check('a single claiming cart still routes to Case 2 (the pre-fix happy path)', () => {
  const out = runNode({ carts: [cart({ id: 'only', status: 'recovering' })] });
  eq(out.target, 'case2', 'target');
  eq(out.route_reason, 'cart_recovering', 'route_reason');
});

console.log('\nCase 3 precedence and fail-open, which pickCart must not disturb:');

check('Case 3 still wins a collision with a claiming cart', () => {
  const out = runNode({
    carts: [cart({ id: 'claiming', status: 'recovering' })],
    appts: [appt({ status: 'confirmed' })]
  });
  eq(out.target, 'case3', 'target');
  eq(out.route_reason, 'appt_confirmed', 'route_reason');
  eq(out.multi_case_claim, true, 'multi_case_claim must record the collision');
  eq(out.case2_claim, 'cart_recovering', 'case2_claim is still reported');
});

check('a failed cart lookup with no other claim fails open as router_lookup_failed', () => {
  const out = runNode({ carts: null, cartCode: 500 });
  eq(out.target, 'case1', 'target');
  eq(out.route_reason, 'router_lookup_failed', 'route_reason');
  eq(out.lookup_ok, false, 'lookup_ok');
});

check('a failed cart lookup does NOT suppress a Case 3 claim', () => {
  const out = runNode({ carts: null, cartCode: 500, appts: [appt()] });
  eq(out.target, 'case3', 'target');
  eq(out.route_reason, 'appt_scheduled', 'route_reason');
});

console.log('\nThe query that feeds the picker (a picker starved of rows is dead code):');

check('Lookup Recent Cart does not clamp to a single row', () => {
  const limit = String(lookupParam('limit'));
  assert(limit !== '1', 'limit=1 hands the picker one row and makes pickCart unreachable');
});

check('Lookup Recent Cart still has a bounded limit (global standard #8)', () => {
  const limit = Number(lookupParam('limit'));
  assert(Number.isFinite(limit) && limit > 1 && limit <= 100, 'limit must be a bounded number > 1, got ' + lookupParam('limit'));
});

check('Lookup Recent Cart still orders newest first', () => {
  eq(lookupParam('order'), 'created_at.desc', 'order');
});

check('Lookup Recent Cart still selects the fields pickCart reads', () => {
  const select = String(lookupParam('select'));
  ['status', 'opted_out', 'created_at', 'id'].forEach((f) => {
    assert(select.indexOf(f) >= 0, 'select must include ' + f + ', got ' + select);
  });
});

// ------------------------------------------------------------------ report ---

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
if (fail) {
  failures.forEach((f) => console.log('  ' + f));
  process.exit(1);
}
