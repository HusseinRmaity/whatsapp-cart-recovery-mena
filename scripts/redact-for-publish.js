#!/usr/bin/env node
/**
 * redact-for-publish.js — publish-time redaction for the workflow exports.
 *
 * WHY THIS EXISTS
 * ---------------
 * Two standards on this build are individually right and jointly impossible:
 *
 *   A. The workflow JSONs are exported byte-for-byte from the running n8n
 *      instance and verified node-for-node against it. That check is what has
 *      caught export drift three times.
 *   B. Published exports must not carry live infrastructure identifiers.
 *      Case Study 1 (public since 2026-08) redacts its Supabase URLs to
 *      `https://YOUR_PROJECT.supabase.co/...`, and Case 2 must not silently
 *      break a standard an already-published repo set.
 *
 * They only coexist if redaction happens at PUBLISH time rather than at export
 * time. So the working tree holds live-accurate exports right up until the
 * commit, this script rewrites the identifiers, and the commit carries the
 * redacted copies. Ruled by Hussein 2026-09-02.
 *
 * WHAT IS AND IS NOT A SECRET HERE
 * --------------------------------
 * A Supabase project URL is not a credential — every browser-side Supabase app
 * ships one. Nothing exploitable is exposed by it: the anon/service keys live in
 * the n8n credential store and never enter a workflow JSON, and the credential
 * IDs that DO appear are local database row ids, meaningless off this instance.
 * This is about not publishing a live endpoint shared by three case studies, and
 * about matching what Case 1 already does. It is not a leak response.
 *
 * Corrected 2026-09-08: the rules below match by shape, not by literal value.
 * Hardcoding the project reference as the search key meant this file published
 * the exact string it was written to strip.
 *
 * USAGE
 * -----
 *   node scripts/redact-for-publish.js            # rewrite files in place
 *   node scripts/redact-for-publish.js --check    # exit 1 if any live id remains
 *
 * Idempotent: running it twice changes nothing.
 *
 * THE ROUND TRIP (the part that is easy to get wrong)
 * --------------------------------------------------
 *   1. Re-export all 8 workflows from the live instance  -> real identifiers
 *   2. Diff node-for-node against the instance           -> must be 8/8
 *   3. node scripts/redact-for-publish.js                -> placeholders
 *   4. Commit
 *
 * After step 3 the files intentionally NO LONGER match the instance. To verify
 * exports against live again, either re-export (step 1) or apply the same map to
 * the live payload before comparing. Do not "fix" the resulting diff by pulling
 * live into the files and committing that — it republishes the identifiers.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// The documented redaction map. Add a rule here rather than doing a one-off
// find-and-replace, so the next person can see exactly what is rewritten.
//
// Rules match by SHAPE, never by literal value. An earlier version of this file
// hardcoded the project reference as its search key, which meant publishing the
// script republished the identifier it exists to remove — the redaction tool was
// the leak. Matching the shape also makes the script portable: point it at any
// case study's workflows/ and it does the right thing with no edit.
const MAP = [
  {
    // Supabase project refs are exactly 20 lowercase alphanumerics. The
    // placeholder itself cannot match (uppercase + underscore), so this is
    // idempotent, which is what makes --check meaningful after a rewrite.
    live: /\b[a-z0-9]{20}\.supabase\.co\b/g,
    published: 'YOUR_PROJECT.supabase.co',
    note: 'Supabase project ref, shared by all three case studies (Case 1 redacts identically)',
  },
];

const WF_DIR = path.join(__dirname, '..', 'workflows');
const checkOnly = process.argv.includes('--check');

const files = fs.readdirSync(WF_DIR).filter((f) => f.endsWith('.json')).sort();
if (files.length === 0) {
  console.error('No workflow JSONs found in ' + WF_DIR);
  process.exit(1);
}

let totalRewritten = 0;
let totalRemaining = 0;

for (const file of files) {
  const full = path.join(WF_DIR, file);
  const before = fs.readFileSync(full, 'utf8');
  let after = before;
  let n = 0;

  for (const { live, published } of MAP) {
    const hits = (after.match(live) || []).length;
    if (hits > 0) {
      after = after.replace(live, published);
      n += hits;
    }
  }

  if (checkOnly) {
    if (n > 0) {
      console.log('  LIVE ID PRESENT  ' + file + '  (' + n + ')');
      totalRemaining += n;
    }
    continue;
  }

  if (n > 0) {
    // Preserve LF endings and the trailing newline the export writer emits.
    fs.writeFileSync(full, after, { encoding: 'utf8' });
    console.log('  redacted ' + String(n).padStart(3) + '  ' + file);
    totalRewritten += n;
  }
}

if (checkOnly) {
  if (totalRemaining === 0) {
    console.log('PASS — no live identifiers in workflows/ (' + files.length + ' files checked)');
    process.exit(0);
  }
  console.error('FAIL — ' + totalRemaining + ' live identifier(s) still present. Run without --check before committing.');
  process.exit(1);
}

console.log(
  totalRewritten === 0
    ? 'Nothing to redact — already published-safe (' + files.length + ' files).'
    : 'Redacted ' + totalRewritten + ' identifier(s) across ' + files.length + ' files.'
);
