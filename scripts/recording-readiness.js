#!/usr/bin/env node
/**
 * Pre-recording readiness check for Case Study 2.
 *
 *   node scripts/recording-readiness.js
 *
 * Every item here has cost a take, or nearly did, at some point on this build.
 * It checks only what a machine can check honestly — the tunnel, the instance,
 * the data and the harnesses. The four things it CANNOT check are printed at the
 * end as a manual list, because a green run that silently skipped them would be
 * worse than no check at all.
 *
 * Exit code 0 = every automated check passed.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const N8N = 'http://localhost:5678';
// Supabase project ref. Read from the environment so the live value never
// enters this file — a published helper must not carry the identifier the
// publish-time redaction exists to strip. Set C2_SUPABASE_PROJECT before running.
const PROJECT = process.env.C2_SUPABASE_PROJECT;
if (!PROJECT) {
  console.error('C2_SUPABASE_PROJECT is not set — export your Supabase project ref first.');
  process.exit(1);
}

let pass = 0;
let fail = 0;
const failures = [];
const warnings = [];

function ok(name, detail) {
  pass++;
  console.log('  PASS  ' + name + (detail ? '  — ' + detail : ''));
}

function bad(name, detail) {
  fail++;
  failures.push(name + (detail ? ' :: ' + detail : ''));
  console.log('  FAIL  ' + name + (detail ? '  — ' + detail : ''));
}

function warn(name, detail) {
  warnings.push(name + (detail ? ' :: ' + detail : ''));
  console.log('  WARN  ' + name + (detail ? '  — ' + detail : ''));
}

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', timeout: 30000 }).trim();
}

function apiKey() {
  const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf8'));
  return cfg.mcpServers['n8n-mcp'].env.N8N_API_KEY;
}

function n8nGet(p) {
  const out = sh('curl', ['-s', '-m', '20', '-H', 'X-N8N-API-KEY: ' + apiKey(), N8N + p]);
  return JSON.parse(out);
}

console.log('\n=== 1. Stack ===');

try {
  const h = JSON.parse(sh('curl', ['-s', '-m', '6', N8N + '/healthz']));
  h.status === 'ok' ? ok('n8n healthz') : bad('n8n healthz', JSON.stringify(h));
} catch (e) {
  bad('n8n healthz', 'unreachable — is Docker Desktop running?');
}

let tunnel = null;
try {
  const t = JSON.parse(sh('curl', ['-s', '-m', '6', 'http://127.0.0.1:4040/api/tunnels']));
  tunnel = t.tunnels && t.tunnels[0] && t.tunnels[0].public_url;
  tunnel ? ok('ngrok tunnel up', tunnel) : bad('ngrok tunnel', 'no tunnel listed');
} catch (e) {
  bad('ngrok tunnel', 'agent API not answering on 127.0.0.1:4040');
}

// Two probes, and NEVER treat a 200 as evidence on its own. The first is pure
// transport: n8n 404s an unknown webhook path instantly, so the time is the
// tunnel. Shopify gives up at ~5s, so anything approaching that loses deliveries.
if (tunnel) {
  try {
    const r = sh('curl', ['--http1.1', '-s', '-o', os.devNull, '-w', '%{http_code} %{time_total}',
      '-m', '15', tunnel + '/webhook/definitely-not-a-real-path-9987']);
    const [code, secs] = r.split(' ');
    const t = parseFloat(secs);
    if (code !== '404') bad('tunnel transport probe', 'expected 404, got ' + code);
    else if (t > 2.5) bad('tunnel transport probe', t + 's — too slow, Shopify times out at ~5s');
    else if (t > 1.2) warn('tunnel transport probe', t + 's — slower than usual, watch it');
    else ok('tunnel transport probe', t + 's');
  } catch (e) { bad('tunnel transport probe', String(e.message).slice(0, 120)); }

  try {
    const body = sh('curl', ['--http1.1', '-s', '-m', '25', tunnel + '/webhook/health-c2']);
    const j = JSON.parse(body)[0];
    const c = j.checks || {};
    const down = ['anthropic', 'supabase', 'shopify'].filter((k) => !c[k] || c[k].status !== 'reachable');
    down.length ? bad('health-c2 dependencies', 'unreachable: ' + down.join(', '))
                : ok('health-c2', 'anthropic + supabase + shopify reachable');
  } catch (e) { bad('health-c2', String(e.message).slice(0, 120)); }
}

console.log('\n=== 2. Workflows ===');

const WF = [
  ['V4cSnl3LLVV5d1nl', '00-health-check-c2.json'],
  ['UjPjVhfipiOw88s2', '01-checkout-intake.json'],
  ['Ego90ZQGHf48Awe9', '02-verifier-touch-sender.json'],
  ['C2ReplyHandlr002', '03-reply-handler-c2.json'],
  ['C2RouterInbnd001', '03r-inbound-router.json'],
  ['C2ConvTracker003', '04-conversion-tracker.json'],
  ['luMDy2B0afajFyvA', '05-daily-digest-c2.json'],
  ['9zn3PbSKb9dPxNqp', '99-error-handler-c2.json']
];

const inactive = [];
for (const [id, file] of WF) {
  try {
    const w = n8nGet('/api/v1/workflows/' + id);
    if (!w.active) inactive.push(file);
  } catch (e) { bad('workflow fetch ' + file, String(e.message).slice(0, 80)); }
}
inactive.length ? bad('all 8 workflows active', 'inactive: ' + inactive.join(', '))
                : ok('all 8 workflows active');

// The `active` flag has lied four times on this build. Schedule triggers die on
// host suspend and the flag keeps saying true. Only an execution proves it.
try {
  const ex = n8nGet('/api/v1/executions?workflowId=Ego90ZQGHf48Awe9&limit=1');
  const last = ex.data && ex.data[0];
  if (!last) bad('sweep trigger alive', 'no executions at all');
  else {
    const mins = (Date.now() - Date.parse(last.startedAt)) / 60000;
    if (mins > 20) bad('sweep trigger alive',
      'last run ' + Math.round(mins) + ' min ago — the trigger is dead, republish or restart the container');
    else ok('sweep trigger alive', 'last run ' + Math.round(mins) + ' min ago');
  }
} catch (e) { bad('sweep trigger alive', String(e.message).slice(0, 80)); }

try {
  const w = n8nGet('/api/v1/workflows/Ego90ZQGHf48Awe9');
  const n = w.nodes.find((x) => x.name === 'Every 15 Minutes');
  const mins = n.parameters.rule.interval[0].minutesInterval;
  mins === 15 ? ok('sweep interval back at 15 min')
              : warn('sweep interval', mins + ' min — left compressed from a previous run');
} catch (e) { bad('sweep interval', String(e.message).slice(0, 80)); }

console.log('\n=== 3. Harnesses ===');

let total = 0;
let anyFail = false;
for (const f of fs.readdirSync(path.join(__dirname, '..', 'tests')).filter((x) => x.endsWith('.test.js'))) {
  try {
    const out = sh('node', [path.join(__dirname, '..', 'tests', f)]);
    const m = out.match(/(\d+) passed, (\d+) failed/);
    total += m ? Number(m[1]) : 0;
    if (m && Number(m[2]) > 0) anyFail = true;
  } catch (e) { anyFail = true; }
}
anyFail ? bad('node harnesses', 'at least one failure — run them individually')
        : ok('node harnesses', total + ' assertions, 0 failures');

try {
  sh('node', [path.join(__dirname, 'redact-for-publish.js'), '--check']);
  ok('redaction check');
} catch (e) { warn('redaction check', 'failed — only matters before the push, not the take'); }

console.log('\n=== 4. Manual, and NOT checkable from here ===');
[
  '  [ ] HOST SLEEP DISABLED. Schedule triggers die on suspend and `active: true` keeps',
  '      saying otherwise. This has broken the sweep four times, once mid-session today.',
  '  [ ] STOREFRONT PASSWORD entered once in BOTH the recording browser and the phone.',
  '      It cannot be disabled on a Shopify dev store. Recovery links 302 to the store',
  '      root without the cookie, which looks exactly like a broken link on camera.',
  '  [ ] HANDSET JOINED to the Twilio sandbox. An unjoined number returns 63015, which',
  '      is terminal since 2026-09-03, so the cart CLOSES on the first failure instead',
  '      of retrying. Reopen with:',
  "      update public.carts set status='abandoned', next_touch_at=now() where id='<uuid>';",
  '  [ ] WINDOWS ARRANGED: storefront · n8n canvas for 02 · Supabase carts · Slack · Shopify',
  '      admin orders. Phone in frame or mirrored.'
].forEach((l) => console.log(l));

console.log('\n' + pass + ' passed, ' + fail + ' failed, ' + warnings.length + ' warnings\n');
if (failures.length) {
  console.log('Failures:');
  failures.forEach((f) => console.log('  - ' + f));
}
if (warnings.length) {
  console.log('Warnings:');
  warnings.forEach((w) => console.log('  - ' + w));
}
process.exit(fail ? 1 : 0);
