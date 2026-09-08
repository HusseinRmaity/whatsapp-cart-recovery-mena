/**
 * Regression harness for workflow 02's `Build Touch Message Request` Code node.
 *
 *   node tests/build-touch-request.test.js
 *
 * WHY THIS EXISTS
 * The node had no harness of its own. Its outputs were only ever asserted
 * indirectly, through `Parse Touch Message` fixtures that hand-build the `req`
 * object — so anything the node COMPUTES was untested by construction.
 *
 * It computes two things that reach a customer:
 *
 *   1. THE DISPLAY NAME. Shopify stores whatever the shopper typed, which on this
 *      store is `Hussein` in Latin script. The model transliterates on its own, so
 *      a generated Arabic message read `مرحباً حسين` while the static fallback read
 *      `مرحباً Hussein` — the same customer greeted two different ways depending on
 *      whether the checker had degraded the message. Reported by Hussein 2026-09-08.
 *
 *   2. THE SERVICE-WINDOW CLASS, session vs template, from `last_inbound_at`.
 *
 * Reads jsCode straight out of workflows/02-verifier-touch-sender.json, so the
 * thing under test is the thing that ships.
 *
 * The Arabic here is not invented: the spellings are the ones already carried by
 * workflow 01's name lists, and they are written as \u escapes because a Windows
 * terminal renders RTL reversed and this build has manufactured one false Arabic
 * defect that way already.
 */

const fs = require('fs');
const path = require('path');

const WORKFLOW = path.join(__dirname, '..', 'workflows', '02-verifier-touch-sender.json');
const NODE_NAME = 'Build Touch Message Request';

function loadNodeCode() {
  const raw = JSON.parse(fs.readFileSync(WORKFLOW, 'utf8').replace(/^﻿/, ''));
  const wf = Array.isArray(raw) ? raw[0] : raw;
  const node = wf.nodes.find((n) => n.name === NODE_NAME);
  if (!node) throw new Error('node not found in export: ' + NODE_NAME);
  return node.parameters.jsCode;
}

const CODE = loadNodeCode();

const CFG = { discount_code: 'LAYLA10', store_name: 'Layla Boutique', slack_channel: '#leads' };

function cart(overrides) {
  return Object.assign(
    {
      id: 'cart-1',
      customer_first_name: 'Hussein',
      customer_gender: 'male',
      language: 'ar',
      country_code: 'LB',
      cart_items: [{ title: 'Silk Hijab Set', quantity: 1 }],
      cart_total: 1249,
      currency: 'AED',
      touches_sent: 0,
      touch_number: 1,
      last_inbound_at: null
    },
    overrides || {}
  );
}

function runNode(cartJson) {
  const nodes = { 'Classify Conversion Result': cartJson, 'Set Sweep Config': CFG };
  const $ = (name) => {
    if (!(name in nodes)) throw new Error('unexpected node reference: ' + name);
    return { first: () => ({ json: nodes[name] }) };
  };
  // eslint-disable-next-line no-new-func
  return new Function('$', CODE)($)[0].json;
}

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

function eq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error((label || 'value') + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const HUSSEIN_AR = 'حسين';
const LAYLA_AR = 'ليلى';

console.log('\nDisplay name — Latin script inside an Arabic message:');

check('a known Latin name is rendered in Arabic for an Arabic cart', () => {
  const out = runNode(cart());
  eq(out.first_name, HUSSEIN_AR, 'first_name');
  eq(out.first_name_source, 'arabic_lookup', 'first_name_source');
});

check('the lookup is case-insensitive', () => {
  eq(runNode(cart({ customer_first_name: 'HUSSEIN' })).first_name, HUSSEIN_AR, 'first_name');
});

check('a spelling variant maps to the same Arabic form', () => {
  eq(runNode(cart({ customer_first_name: 'Hussain' })).first_name, HUSSEIN_AR, 'first_name');
});

check('a female name maps too', () => {
  eq(runNode(cart({ customer_first_name: 'Layla', customer_gender: 'female' })).first_name, LAYLA_AR, 'first_name');
});

// arabic-master-reference.md section 5: "if a Latin-script name can't be cleanly
// rendered, keep it in Latin script inside the Arabic sentence rather than
// mangling it". An unknown name is exactly that case. This is a LOOKUP and must
// never become a transliteration engine.
check('an UNKNOWN Latin name keeps its Latin script — never mangled', () => {
  const out = runNode(cart({ customer_first_name: 'Xavier' }));
  eq(out.first_name, 'Xavier', 'first_name');
  eq(out.first_name_source, 'as_stored', 'first_name_source');
});

check('a name already in Arabic script is passed through untouched', () => {
  const out = runNode(cart({ customer_first_name: HUSSEIN_AR }));
  eq(out.first_name, HUSSEIN_AR, 'first_name');
  eq(out.first_name_source, 'as_stored', 'first_name_source');
});

check('an ENGLISH cart keeps the Latin name — the lookup is language-gated', () => {
  const out = runNode(cart({ language: 'en' }));
  eq(out.first_name, 'Hussein', 'first_name');
  eq(out.first_name_source, 'as_stored', 'first_name_source');
});

check('a FRENCH cart keeps the Latin name', () => {
  eq(runNode(cart({ language: 'fr' })).first_name, 'Hussein', 'first_name');
});

check('a mixed-language cart is treated as Arabic', () => {
  eq(runNode(cart({ language: 'mixed' })).first_name, HUSSEIN_AR, 'first_name');
});

check('an empty name does not throw and reports as stored', () => {
  const out = runNode(cart({ customer_first_name: null }));
  eq(out.first_name, '', 'first_name');
  eq(out.first_name_source, 'as_stored', 'first_name_source');
});

console.log('\nService window — session vs template:');

check('no inbound on record is a template', () => {
  const out = runNode(cart());
  eq(out.message_class, 'template', 'message_class');
  eq(out.hours_since_inbound, null, 'hours_since_inbound');
});

check('an inbound inside 24h is a session message', () => {
  const t = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const out = runNode(cart({ last_inbound_at: t }));
  eq(out.message_class, 'session', 'message_class');
  assert(out.hours_since_inbound >= 1.9 && out.hours_since_inbound <= 2.1,
    'hours_since_inbound: got ' + out.hours_since_inbound);
});

// The window is a LOWER BOUND on purpose: one sandbox number is shared across
// three case studies, so an inbound to another case is invisible here. Erring
// toward `template` over-estimates template spend; erring the other way would
// send a session message outside the window.
check('an inbound older than 24h falls back to template', () => {
  const t = new Date(Date.now() - 30 * 3600 * 1000).toISOString();
  eq(runNode(cart({ last_inbound_at: t })).message_class, 'template', 'message_class');
});

check('an unparseable last_inbound_at is treated as no inbound, not as a session', () => {
  const out = runNode(cart({ last_inbound_at: 'not a date' }));
  eq(out.message_class, 'template', 'message_class');
  eq(out.hours_since_inbound, null, 'hours_since_inbound');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
