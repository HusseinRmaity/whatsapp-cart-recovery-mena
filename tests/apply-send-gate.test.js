/**
 * Regression harness for workflow 02's `Apply Send Gate` Code node.
 *
 *   node tests/apply-send-gate.test.js
 *
 * WHY THIS EXISTS
 * M5.2b added the touch-1 age guard to this node. That guard exists because a
 * Shopify recovery link 302s to the store root until Shopify creates its own
 * AbandonedCheckout record (~10-11 min on this store, decisions.md 2026-08-03
 * M3.6) — so a touch sent too early is a technically successful message whose
 * only call-to-action is dead. Twice in M3 that produced a false "empty cart"
 * bug report, because the tester armed a cart by hand seconds after checkout.
 *
 * The guard is deliberately NOT bypassable by TEST_MODE, which is the opposite
 * of every other gate reason. That asymmetry is easy to "tidy away" later by
 * someone making the code look consistent, so it is asserted here explicitly.
 *
 * Same contract as parse-touch-message.test.js: the jsCode is read straight out
 * of workflows/02-verifier-touch-sender.json, so the thing under test is the
 * thing that ships. Re-export the workflow after any edit, then re-run this.
 */

const fs = require('fs');
const path = require('path');

const WORKFLOW = path.join(__dirname, '..', 'workflows', '02-verifier-touch-sender.json');
const NODE_NAME = 'Apply Send Gate';

function loadNodeCode() {
  const raw = JSON.parse(fs.readFileSync(WORKFLOW, 'utf8'));
  const wf = Array.isArray(raw) ? raw[0] : raw;
  const node = wf.nodes.find((n) => n.name === NODE_NAME);
  if (!node) throw new Error('node not found in export: ' + NODE_NAME);
  return node.parameters.jsCode;
}

const CODE = loadNodeCode();

/**
 * Runs the node body with the accessors n8n provides.
 * `prayer` is deliberately omissible: Resolve Prayer Delay only executes on one
 * of the two branches, and the node has a try/catch for exactly that case — so
 * a missing node reference must THROW here, the way it does in n8n.
 */
function runNode({ cart, ctx, cfg, prayer }) {
  const nodes = {
    'Classify Conversion Result': cart,
    'Resolve Send Context': ctx,
    'Set Sweep Config': cfg
  };
  if (prayer) nodes['Resolve Prayer Delay'] = prayer;
  const $ = (name) => {
    if (!(name in nodes)) throw new Error('node did not execute on this branch: ' + name);
    return { first: () => ({ json: nodes[name] }) };
  };
  // eslint-disable-next-line no-new-func
  const fn = new Function('$', CODE);
  return fn($)[0].json;
}

// ---------------------------------------------------------------- fixtures ---

const CFG_LIVE = { test_mode: false, discount_code: 'LAYLA10' };
const CFG_TEST = { test_mode: true, discount_code: 'LAYLA10' };

const MIN = 60 * 1000;
const agoISO = (minutes) => new Date(Date.now() - minutes * MIN).toISOString();

function cart(overrides) {
  return Object.assign(
    {
      id: 'cart-1',
      checkout_token: 'tok-1',
      status: 'pending_verification',
      touches_sent: 0,
      created_at: agoISO(60), // an hour old: past the guard
      currency: 'AED'
    },
    overrides || {}
  );
}

/** Send window wide open, nothing blocking. */
function ctx(overrides) {
  return Object.assign(
    {
      timezone: 'Asia/Beirut',
      now_local: '2026-08-04 14:00',
      send_window_source: 'send_windows_row',
      in_quiet_hours: false,
      is_weekend: false,
      window_delayed: false,
      window_resume: null
    },
    overrides || {}
  );
}

const PRAYER_CLEAR = { prayer_check: 'checked', prayer_delayed: false, prayer_resume: null };

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

console.log('\nApply Send Gate — ' + WORKFLOW.replace(/.*[\\/]/, '') + '\n');

console.log('Touch-1 age guard (M5.2b):');

check('a cart younger than 15 min is blocked on touch 1', () => {
  const out = runNode({ cart: cart({ created_at: agoISO(3) }), ctx: ctx(), cfg: CFG_LIVE, prayer: PRAYER_CLEAR });
  eq(out.gate_blocked, true, 'gate_blocked');
  eq(out.cart_too_young, true, 'cart_too_young');
  eq(out.gate_reason, 'cart_too_young', 'gate_reason');
  eq(out.cart_age_minutes, 3, 'cart_age_minutes');
});

check('the resume time is created_at + 45 min, not now + something', () => {
  const created = agoISO(3);
  const out = runNode({ cart: cart({ created_at: created }), ctx: ctx(), cfg: CFG_LIVE, prayer: PRAYER_CLEAR });
  const expected = new Date(Date.parse(created) + 45 * MIN).toISOString();
  eq(out.resume_at, expected, 'resume_at');
});

check('a cart older than 15 min sends on touch 1', () => {
  const out = runNode({ cart: cart({ created_at: agoISO(46) }), ctx: ctx(), cfg: CFG_LIVE, prayer: PRAYER_CLEAR });
  eq(out.gate_blocked, false, 'gate_blocked');
  eq(out.cart_too_young, false, 'cart_too_young');
  eq(out.gate_reason, 'open', 'gate_reason');
});

check('exactly at the boundary (15 min) is allowed', () => {
  const out = runNode({ cart: cart({ created_at: agoISO(15) }), ctx: ctx(), cfg: CFG_LIVE, prayer: PRAYER_CLEAR });
  eq(out.cart_too_young, false, 'cart_too_young at boundary');
});

check('the guard applies ONLY to touch 1 — a young cart on touch 2 is not blocked', () => {
  // Can only happen if a schedule was hand-edited, but the guard must not
  // silently defer touches 2/3, whose links are long since valid.
  const out = runNode({
    cart: cart({ created_at: agoISO(2), touches_sent: 1, status: 'recovering' }),
    ctx: ctx(),
    cfg: CFG_LIVE,
    prayer: PRAYER_CLEAR
  });
  eq(out.cart_too_young, false, 'cart_too_young');
  eq(out.gate_blocked, false, 'gate_blocked');
});

check('TEST_MODE does NOT bypass the age guard — the asymmetry is the point', () => {
  const out = runNode({ cart: cart({ created_at: agoISO(1) }), ctx: ctx(), cfg: CFG_TEST, prayer: PRAYER_CLEAR });
  eq(out.gate_blocked, true, 'gate_blocked under test mode');
  eq(out.gate_bypassed_by_test_mode, false, 'gate_bypassed_by_test_mode');
});

check('TEST_MODE still bypasses quiet hours, as before', () => {
  const out = runNode({
    cart: cart(),
    ctx: ctx({ in_quiet_hours: true, window_delayed: true, window_resume: '2026-08-05T05:00:00.000Z' }),
    cfg: CFG_TEST,
    prayer: PRAYER_CLEAR
  });
  eq(out.gate_blocked, false, 'gate_blocked');
  eq(out.gate_would_block, true, 'gate_would_block still computed honestly');
  eq(out.gate_bypassed_by_test_mode, true, 'gate_bypassed_by_test_mode');
});

check('a missing created_at does not block and does not crash', () => {
  // Defensive: the column is NOT NULL, but a hand-built fixture may omit it and
  // failing open here is right — the other gates still apply.
  const out = runNode({ cart: cart({ created_at: null }), ctx: ctx(), cfg: CFG_LIVE, prayer: PRAYER_CLEAR });
  eq(out.cart_too_young, false, 'cart_too_young');
  eq(out.cart_age_minutes, null, 'cart_age_minutes');
});

check('an unparseable created_at does not block and does not crash', () => {
  const out = runNode({ cart: cart({ created_at: 'not-a-date' }), ctx: ctx(), cfg: CFG_LIVE, prayer: PRAYER_CLEAR });
  eq(out.cart_too_young, false, 'cart_too_young');
  eq(out.cart_age_minutes, null, 'cart_age_minutes');
});

console.log('\nExisting gate reasons (must not regress):');

check('quiet hours block and push to the window start', () => {
  const resume = '2026-08-05T05:00:00.000Z';
  const out = runNode({
    cart: cart(),
    ctx: ctx({ in_quiet_hours: true, window_delayed: true, window_resume: resume }),
    cfg: CFG_LIVE,
    prayer: PRAYER_CLEAR
  });
  eq(out.gate_blocked, true, 'gate_blocked');
  eq(out.gate_reason, 'quiet_hours', 'gate_reason');
  eq(out.resume_at, resume, 'resume_at');
});

check('weekend blocks', () => {
  const out = runNode({
    cart: cart(),
    ctx: ctx({ is_weekend: true, window_delayed: true, window_resume: '2026-08-09T05:00:00.000Z' }),
    cfg: CFG_LIVE,
    prayer: PRAYER_CLEAR
  });
  eq(out.gate_blocked, true, 'gate_blocked');
  eq(out.gate_reason, 'weekend', 'gate_reason');
});

check('prayer time blocks and reports the reason', () => {
  const out = runNode({
    cart: cart(),
    ctx: ctx(),
    cfg: CFG_LIVE,
    prayer: { prayer_check: 'checked', prayer_delayed: true, prayer_resume: '2026-08-04T17:27:00.000Z' }
  });
  eq(out.gate_blocked, true, 'gate_blocked');
  eq(out.gate_reason, 'prayer_time', 'gate_reason');
  eq(out.resume_at, '2026-08-04T17:27:00.000Z', 'resume_at');
});

check('the prayer branch not executing is survivable (try/catch)', () => {
  const out = runNode({ cart: cart(), ctx: ctx(), cfg: CFG_LIVE }); // no prayer node at all
  eq(out.prayer_check, 'skipped', 'prayer_check');
  eq(out.gate_blocked, false, 'gate_blocked');
});

check('the LATEST resume time wins when several reasons stack', () => {
  const out = runNode({
    cart: cart({ created_at: agoISO(1) }), // too young -> created_at + 45min, the latest
    ctx: ctx({ in_quiet_hours: true, window_delayed: true, window_resume: '2026-01-01T00:00:00.000Z' }),
    cfg: CFG_LIVE,
    prayer: { prayer_check: 'checked', prayer_delayed: true, prayer_resume: '2026-01-02T00:00:00.000Z' }
  });
  eq(out.gate_reason, 'quiet_hours+prayer_time+cart_too_young', 'gate_reason lists all three');
  assert(Date.parse(out.resume_at) > Date.parse('2026-01-02T00:00:00.000Z'), 'resume_at should be the latest candidate');
});

console.log('\nStatus promotion:');

check('pending_verification is promoted to abandoned once Shopify proved it', () => {
  const out = runNode({ cart: cart({ status: 'pending_verification' }), ctx: ctx(), cfg: CFG_LIVE, prayer: PRAYER_CLEAR });
  eq(out.next_status, 'abandoned', 'next_status');
});

check('recovering is left alone', () => {
  const out = runNode({
    cart: cart({ status: 'recovering', touches_sent: 1 }),
    ctx: ctx(),
    cfg: CFG_LIVE,
    prayer: PRAYER_CLEAR
  });
  eq(out.next_status, 'recovering', 'next_status');
});

// ------------------------------------------------------------------ report ---

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
if (fail) {
  failures.forEach((f) => console.log('  ' + f));
  process.exit(1);
}
