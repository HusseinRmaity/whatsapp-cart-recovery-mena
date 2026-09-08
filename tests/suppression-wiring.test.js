/**
 * Structural harness for phone-level opt-out suppression (2026-09-02).
 *
 *   node tests/suppression-wiring.test.js
 *
 * WHY THIS EXISTS
 * The suppression LOGIC is asserted in SQL (tests/suppressions.sql, 13
 * assertions). What SQL cannot see is whether the workflows actually go through
 * it — a perfect anti-join in case2_due_carts protects nobody if workflow 02
 * still queries /carts directly, and a suppression table nothing writes to is
 * inert. Both of those are query-shape facts living in the exports, so they are
 * asserted here.
 *
 * This is the same lesson as decide-route.test.js: a picker starved of rows by
 * limit=1 was dead code, and only a structural assertion on the QUERY caught it.
 *
 * Re-export both workflows after any edit, then re-run this.
 */

const fs = require('fs');
const path = require('path');

const SWEEP = path.join(__dirname, '..', 'workflows', '02-verifier-touch-sender.json');
const REPLY = path.join(__dirname, '..', 'workflows', '03-reply-handler-c2.json');

function loadWorkflow(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(raw) ? raw[0] : raw;
}

function node(file, name) {
  const n = loadWorkflow(file).nodes.find((x) => x.name === name);
  if (!n) throw new Error('node not found in export: ' + name);
  return n;
}

function queryParam(n, name) {
  const params = ((n.parameters.queryParameters || {}).parameters) || [];
  const hit = params.find((p) => p.name === name);
  return hit ? hit.value : undefined;
}

/** Names of nodes whose main output feeds `target`. */
function upstreamOf(file, target) {
  const conns = loadWorkflow(file).connections || {};
  const out = [];
  Object.keys(conns).forEach((from) => {
    const mains = (conns[from].main || []);
    mains.forEach((branch) => {
      (branch || []).forEach((c) => { if (c && c.node === target) out.push(from); });
    });
  });
  return out;
}

let pass = 0, fail = 0;
const failures = [];

function check(name, fn) {
  try { fn(); pass++; console.log('  PASS  ' + name); }
  catch (e) { fail++; failures.push(name + ' :: ' + e.message); console.log('  FAIL  ' + name + ' :: ' + e.message); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function eq(a, b, label) {
  if (a !== b) throw new Error(label + ' expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
}

console.log('\nPhone-level suppression wiring\n');

console.log('Workflow 02 — the sweep must draw its queue through the anti-join:');

check('Fetch Due Carts calls the case2_due_carts RPC', () => {
  const n = node(SWEEP, 'Fetch Due Carts');
  assert(String(n.parameters.url).indexOf('/rpc/case2_due_carts') >= 0,
    'sweep still queries the carts table directly, so suppressed phones are not excluded; url=' + n.parameters.url);
});

check('Fetch Due Carts POSTs (an RPC call, not a table read)', () => {
  eq(node(SWEEP, 'Fetch Due Carts').parameters.method, 'POST', 'method');
});

check('Fetch Due Carts still passes a bounded limit (global standard #8)', () => {
  const body = String(node(SWEEP, 'Fetch Due Carts').parameters.jsonBody || '');
  assert(body.indexOf('p_limit') >= 0, 'p_limit must be sent so the pagination cap still applies; body=' + body);
});

console.log('\nWorkflow 03 — a STOP must suppress the PHONE, not one cart:');

check('Suppress Cart no longer targets a single cart id', () => {
  const n = node(REPLY, 'Suppress Cart');
  assert(queryParam(n, 'id') === undefined,
    'Suppress Cart still filters id=eq.<one cart>, so a second live cart keeps sending');
});

check('Suppress Cart filters by phone', () => {
  const v = String(queryParam(node(REPLY, 'Suppress Cart'), 'phone') || '');
  assert(v.indexOf('eq.') >= 0, 'expected a phone=eq.<phone> filter, got ' + JSON.stringify(v));
});

check('Suppress Cart still guards on opted_out so it cannot re-close a closed cart', () => {
  eq(String(queryParam(node(REPLY, 'Suppress Cart'), 'opted_out')), 'eq.false', 'opted_out guard');
});

check('Suppress Cart only touches OPEN carts, never a converted one', () => {
  const v = String(queryParam(node(REPLY, 'Suppress Cart'), 'status') || '');
  assert(v.indexOf('in.') >= 0 && v.indexOf('recovered') < 0,
    'status filter must restrict to open states so a recovered cart is not overwritten; got ' + JSON.stringify(v));
});

console.log('\nThe suppression row itself:');

check('a node writes the phone into case2_suppressions', () => {
  const wf = loadWorkflow(REPLY);
  const writer = wf.nodes.find((n) =>
    String((n.parameters || {}).url || '').indexOf('case2_suppressions') >= 0 &&
    String((n.parameters || {}).method || '') === 'POST');
  assert(writer, 'no node POSTs to case2_suppressions; the table would stay empty and suppression would never engage');
});

check('the suppression row is written BEFORE the cart patch', () => {
  const wf = loadWorkflow(REPLY);
  const writer = wf.nodes.find((n) =>
    String((n.parameters || {}).url || '').indexOf('case2_suppressions') >= 0 &&
    String((n.parameters || {}).method || '') === 'POST');
  assert(writer, 'suppression writer not found');
  const feeds = upstreamOf(REPLY, 'Suppress Cart');
  assert(feeds.indexOf(writer.name) >= 0,
    'the suppression row must be recorded first: if the cart PATCH succeeds and the row write then fails, ' +
    'future carts from that phone are unprotected. Upstream of Suppress Cart is currently: ' + JSON.stringify(feeds));
});

check('the suppression write records how the opt-out was detected', () => {
  const wf = loadWorkflow(REPLY);
  const writer = wf.nodes.find((n) =>
    String((n.parameters || {}).url || '').indexOf('case2_suppressions') >= 0);
  const body = String((writer.parameters || {}).jsonBody || '');
  assert(body.indexOf('source') >= 0, 'body must carry a source (keyword vs model_intent) for the audit trail');
});

check('the suppression write tolerates a repeat STOP', () => {
  const wf = loadWorkflow(REPLY);
  const writer = wf.nodes.find((n) =>
    String((n.parameters || {}).url || '').indexOf('case2_suppressions') >= 0);
  const headers = JSON.stringify(((writer.parameters || {}).headerParameters || {}));
  assert(headers.indexOf('resolution=ignore-duplicates') >= 0 || headers.indexOf('merge-duplicates') >= 0,
    'phone is the PK, so a second STOP would 409 without a Prefer resolution header; headers=' + headers);
});

check('the opt-out run log treats suppressing SEVERAL carts as success, not partial', () => {
  const body = String(node(REPLY, 'Log Opt-Out Run').parameters.jsonBody || '');
  assert(body.indexOf('rows_updated === 1') < 0,
    'a phone-scoped PATCH can legitimately update 2+ carts; === 1 would log a correct multi-cart opt-out as "partial"');
  assert(body.indexOf('rows_updated >= 1') >= 0,
    'expected rows_updated >= 1 as the success condition');
});

// ============================================================================
// SERVICE-WINDOW STAMP AND TERMINAL DELIVERY STATES (added 2026-09-03)
//
// Same reasoning as everything above: SQL cannot see whether the workflows
// actually go through the new path, and a correct node wired into the wrong
// place is worse than no node. Both of these are ORDERING facts that no unit
// test on the jsCode could ever catch.
// ============================================================================

console.log('\nService-window stamp (workflow 03):');

check('Stamp Last Inbound is DOWNSTREAM of the duplicate check, never upstream', () => {
  // A Twilio webhook retry hits the 409 idempotency lock in Log Inbound Message
  // and exits. If the stamp ran before that check, a redelivery would reopen a
  // 24-hour service window the customer never actually reopened.
  const feeds = upstreamOf(REPLY, 'Stamp Last Inbound');
  assert(feeds.indexOf('Is Duplicate Inbound') >= 0,
    'expected Is Duplicate Inbound to feed the stamp; upstream is currently ' + JSON.stringify(feeds));
});

check('every reply route passes through the stamp, including an opt-out', () => {
  const feeds = upstreamOf(REPLY, 'Route Reply Path');
  assert(feeds.indexOf('Stamp Last Inbound') >= 0,
    'the stamp must sit in front of the router, or a reply that turns out to be an opt-out never records that the customer replied; upstream is ' + JSON.stringify(feeds));
  assert(feeds.indexOf('Is Duplicate Inbound') < 0,
    'the old direct edge from Is Duplicate Inbound to Route Reply Path is still there, so the stamp can be bypassed');
});

check('the stamp writes ONLY a timestamp - no status, schedule or touch count', () => {
  // This is why it is allowed to skip the status/opted_out guards every other
  // cart writer carries: it cannot resurrect a closed cart, because it does not
  // touch any of the fields that define one.
  const body = String(node(REPLY, 'Stamp Last Inbound').parameters.jsonBody || '');
  assert(body.indexOf('last_inbound_at') >= 0, 'expected last_inbound_at in the body');
  ['status', 'next_touch_at', 'touches_sent', 'opted_out'].forEach((f) => {
    assert(body.indexOf(f) < 0,
      'the stamp must not write ' + f + ' - the moment it does, the missing status guard becomes a resurrection bug');
  });
});

check('the stamp targets one cart by id', () => {
  eq(queryParam(node(REPLY, 'Stamp Last Inbound'), 'id'),
    "=eq.{{ $('Resolve Reply Context').first().json.cart_id }}",
    'the stamp must follow the cart pickCart chose, not the phone');
});

console.log('\nTerminal delivery states (workflow 02):');

check('Route Send Failure sits between Did Send Succeed and the retry', () => {
  const feeds = upstreamOf(SWEEP, 'Route Send Failure');
  eq(feeds.length, 1, 'exactly one upstream expected, got ' + JSON.stringify(feeds));
  eq(feeds[0], 'Did Send Succeed', 'upstream');
  const postponeFeeds = upstreamOf(SWEEP, 'Postpone After Send Failure');
  assert(postponeFeeds.indexOf('Route Send Failure') >= 0,
    'the retry must now be reached THROUGH the classifier; upstream is ' + JSON.stringify(postponeFeeds));
  assert(postponeFeeds.indexOf('Did Send Succeed') < 0,
    'the old direct edge is still there, so a terminal failure can still be retried forever');
});

check('a Twilio non-acceptance still goes straight to the retry, unclassified', () => {
  // No SID means no delivery poll ran, so there is nothing to classify. That
  // branch must bypass Route Send Failure rather than read an absent node.
  const postponeFeeds = upstreamOf(SWEEP, 'Postpone After Send Failure');
  assert(postponeFeeds.indexOf('Did Twilio Accept') >= 0,
    'Did Twilio Accept must still feed the retry directly; upstream is ' + JSON.stringify(postponeFeeds));
});

check('Evaluate Delivery emits the terminal flag the router branches on', () => {
  const code = String(node(SWEEP, 'Evaluate Delivery').parameters.jsCode || '');
  assert(code.indexOf('delivery_terminal') >= 0, 'Evaluate Delivery does not emit delivery_terminal');
  assert(code.indexOf('retry_after_minutes') >= 0, 'Evaluate Delivery does not emit retry_after_minutes');
  const cond = JSON.stringify(node(SWEEP, 'Route Send Failure').parameters.conditions || {});
  assert(cond.indexOf('delivery_terminal') >= 0, 'Route Send Failure branches on something else');
});

check('the frequency cap is a LONGER RETRY, never a terminal state', () => {
  // Meta's guidance on 131049 is to wait at least 24h and try again. Treating
  // it as terminal would write off a live customer over a rate limit.
  const code = String(node(SWEEP, 'Evaluate Delivery').parameters.jsCode || '');
  const terminal = /TERMINAL_CODES\s*=\s*\[([^\]]*)\]/.exec(code);
  const slow = /SLOW_RETRY_CODES\s*=\s*\[([^\]]*)\]/.exec(code);
  assert(terminal && slow, 'expected both code lists in Evaluate Delivery');
  assert(terminal[1].indexOf('131049') < 0, '131049 (frequency cap) must NOT be terminal');
  assert(slow[1].indexOf('131049') >= 0, '131049 must be in the slow-retry list');
});

check('Close Undeliverable Cart keeps the guards and does not fake a touch', () => {
  const n = node(SWEEP, 'Close Undeliverable Cart');
  assert(String(queryParam(n, 'status') || '').indexOf('pending_verification') >= 0,
    'a cart that converted or opted out mid-send must not be overwritten to undeliverable');
  eq(queryParam(n, 'opted_out'), 'is.false', 'opted_out guard');
  const body = String(n.parameters.jsonBody || '');
  assert(body.indexOf("status: 'undeliverable'") >= 0, 'expected the undeliverable status');
  assert(body.indexOf('touches_sent') < 0,
    'touches_sent must NOT move - the customer received nothing, and exhausted would claim three delivered messages');
});

check('the sweep summary counts the new terminal step', () => {
  // Without this the cart WAS processed but carts_processed under-reports every
  // sweep that meets a dead number.
  const code = String(node(SWEEP, 'Build Sweep Summary').parameters.jsCode || '');
  assert(code.indexOf('cart_closed_undeliverable') >= 0,
    'Build Sweep Summary does not count cart_closed_undeliverable');
  assert(/carts_processed:[^\n]*undeliverable/.test(code),
    'undeliverable is counted but not added to carts_processed');
});

check('an undeliverable close does NOT mark the sweep degraded', () => {
  // A dead number is a campaign outcome, not a system fault. Alerting on it
  // would page the owner for something they cannot fix.
  const code = String(node(SWEEP, 'Build Sweep Summary').parameters.jsCode || '');
  const degraded = /const degraded = ([^;]*);/.exec(code);
  assert(degraded, 'could not find the degraded expression');
  assert(degraded[1].indexOf('undeliverable') < 0,
    'undeliverable entered the degraded condition: ' + degraded[1]);
  const logStatus = String(node(SWEEP, 'Log Undeliverable Close').parameters.jsonBody || '');
  assert(logStatus.indexOf("'failed'") < 0,
    'the undeliverable log row must not be status failed, or every such sweep alerts');
});

check('cart_messages records which class of message was billed', () => {
  const body = String(node(SWEEP, 'Log Touch Message').parameters.jsonBody || '');
  assert(body.indexOf('message_class') >= 0,
    'Log Touch Message does not persist message_class, so the digest cost model has nothing to read');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
if (fail) { failures.forEach((f) => console.log('  ' + f)); process.exit(1); }
