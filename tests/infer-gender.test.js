/**
 * Regression harness for workflow 01's `Detect Language And Timezone` Code node —
 * specifically the gender inference added 2026-08-07, plus the Haiku routing
 * decision that sits on top of it.
 *
 *   node tests/infer-gender.test.js
 *
 * WHY THIS EXISTS
 * Hussein ruled (2026-08-07) that arabic-master-reference.md §5 "Gender agreement" applies to
 * Case 2 outbound, so workflow 02's checker relaxes its feminine-form rules for a
 * customer we know to be female. That safety depends entirely on the gender being
 * RIGHT, and a wrong guess produces visibly wrong Arabic on a real handset — worse
 * than the neutral phrasing it replaces. So the interesting assertions here are not
 * "does it find the obvious names", they are:
 *
 *   1. the exception lists beat the morphology rules (أسامة ends in ة and is male;
 *      مصطفى ends in ى and is male) — ending rules alone misgender both;
 *   2. genuinely unisex names return 'unknown' instead of a coin flip;
 *   3. nothing is guessed from a Latin trailing 'a' (Mustafa, Zakaria);
 *   4. Haiku is asked only when the answer could change a message — an English
 *      cart with an unrecognised name must NOT trigger a paid call.
 *
 * Reads jsCode straight out of workflows/01-checkout-intake.json, so the thing under
 * test is the thing that ships. Re-export the workflow after any edit, then re-run.
 *
 * Arabic names here are ordinary given names, not invented style rulings — the
 * style-guide rule that Claude is not the arbiter of Arabic still holds, and any
 * disagreement about a name in these lists is Hussein's call.
 */

const fs = require('fs');
const path = require('path');

const WORKFLOW = path.join(__dirname, '..', 'workflows', '01-checkout-intake.json');
const NODE_NAME = 'Detect Language And Timezone';

function loadNodeCode() {
  const raw = JSON.parse(fs.readFileSync(WORKFLOW, 'utf8').replace(/^﻿/, ''));
  const wf = Array.isArray(raw) ? raw[0] : raw;
  const node = wf.nodes.find((n) => n.name === NODE_NAME);
  if (!node) throw new Error('node not found in export: ' + NODE_NAME);
  return node.parameters.jsCode;
}

const CODE = loadNodeCode();

function runNode(input) {
  const json = Object.assign({ first_name: null, last_name: null, phone: null, locale: null }, input);
  // eslint-disable-next-line no-new-func
  return new Function('$json', CODE)(json)[0].json;
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

function eq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error((label || 'value') + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
}

const LB = '+9613111222';   // Lebanon  -> ar
const AE = '+971501234567'; // UAE      -> ar
const GB = '+447700900123'; // UK       -> en

function genderOf(first, phone) {
  return runNode({ first_name: first, phone: phone || LB }).customer_gender;
}

// --------------------------------------------------------- morphology rules ---

console.log('\nArabic morphology (applied only after the exception lists):');

check('ة ending -> female (فاطمة)', () => eq(genderOf('فاطمة'), 'female'));
check('اء ending -> female (أسماء)', () => eq(genderOf('أسماء'), 'female'));
check('ى ending -> female (ليلى)', () => eq(genderOf('ليلى'), 'female'));
check('hamza spelling variants normalise (اسماء == أسماء)', () => eq(genderOf('اسماء'), 'female'));

// These are the cases the ending rules get WRONG on their own. If someone ever
// "simplifies" inferGender by deleting the exception lists, these four fail.
console.log('\nException lists must beat the ending rules:');

check('أسامة ends in ة but is MALE', () => eq(genderOf('أسامة'), 'male'));
check('حمزة ends in ة but is MALE', () => eq(genderOf('حمزة'), 'male'));
check('مصطفى ends in ى but is MALE', () => eq(genderOf('مصطفى'), 'male'));
check('يحيى ends in ى but is MALE', () => eq(genderOf('يحيى'), 'male'));
check('ضياء ends in اء but is MALE', () => eq(genderOf('ضياء'), 'male'));

// ------------------------------------------------------------------ unknown ---

console.log('\nUnknown is a correct answer, not a failure:');

check('unisex نور is not guessed', () => eq(genderOf('نور'), 'unknown'));
check('unisex Noor (Latin) is not guessed', () => eq(genderOf('Noor', AE), 'unknown'));
check('unrecognised name -> unknown', () => eq(genderOf('Xyzzy', AE), 'unknown'));
check('no name at all -> unknown', () => eq(genderOf('', AE), 'unknown'));
check('no name reports the reason', () => eq(runNode({ first_name: null, phone: AE }).gender_source, 'no_name'));

// Latin script deliberately has NO ending rule: a trailing 'a' would misgender
// all four of these on the first cart the system ever saw.
console.log('\nNo guessing from a Latin trailing vowel:');

check('Mustafa -> male, not female', () => eq(genderOf('Mustafa', AE), 'male'));
check('Zakaria -> male, not female', () => eq(genderOf('Zakaria', AE), 'male'));
check('Musa -> male, not female', () => eq(genderOf('Musa', AE), 'male'));
check('Sara -> female (list, not ending)', () => eq(genderOf('Sara', AE), 'female'));

// --------------------------------------------------------------- name shape ---

console.log('\nName handling:');

check('only the FIRST token is read', () => eq(genderOf('ليلى العلي'), 'female'));
check('a full Latin name reads the first token', () => eq(genderOf('Sara Haddad', AE), 'female'));
check('tashkeel is stripped before matching', () => eq(genderOf('مُحَمَّد'), 'male'));

// ------------------------------------------------- Haiku routing (cost control) ---
// Every call here is billed to a client in production. The gender question is
// meaningless outside Arabic, so it must never trigger a call on its own for an
// English or French cart.
console.log('\nHaiku is asked only when the answer could change a message:');

check('Arabic cart + unknown gender -> ask', () => {
  const out = runNode({ first_name: 'Xyzzy', phone: AE });
  eq(out.language, 'ar', 'language');
  eq(out.needs_ai, true, 'needs_ai');
  eq(out.ai_reason, 'gender', 'ai_reason');
});

check('English cart + unknown gender -> do NOT ask', () => {
  const out = runNode({ first_name: 'Xyzzy', phone: GB });
  eq(out.language, 'en', 'language');
  eq(out.needs_ai, false, 'needs_ai');
});

check('Arabic cart + known gender -> do NOT ask', () => {
  const out = runNode({ first_name: 'محمد', phone: AE });
  eq(out.customer_gender, 'male', 'customer_gender');
  eq(out.needs_ai, false, 'needs_ai');
});

check('no language resolvable -> ask, reason=language', () => {
  const out = runNode({ first_name: 'Hans', phone: '+4915112345678' });
  eq(out.language, null, 'language');
  eq(out.needs_ai, true, 'needs_ai');
  eq(out.ai_reason, 'language', 'ai_reason');
});

// ------------------------------------------------------------ no regressions ---
// The gender work sits inside the node that also does language and timezone.
// These guard the behaviour that was already proven in M2/M3/M5.
console.log('\nExisting language/timezone behaviour is unchanged:');

check('Arabic name still sets language=ar via name_script', () => {
  const out = runNode({ first_name: 'ليلى', phone: GB });
  eq(out.language, 'ar', 'language');
  eq(out.language_source, 'name_script', 'language_source');
});

check('+971 still resolves AE / Asia/Dubai', () => {
  const out = runNode({ first_name: 'Sara', phone: AE });
  eq(out.country_code, 'AE', 'country_code');
  eq(out.timezone, 'Asia/Dubai', 'timezone');
});

check('en locale still loses to phone country', () => {
  const out = runNode({ first_name: 'Sara', phone: AE, locale: 'en-US' });
  eq(out.language, 'ar', 'language');
  eq(out.language_source, 'phone_country', 'language_source');
});

// The name on EVERY demo cart, pinned in both scripts. On 2026-09-08 a touch went
// to the handset reading the feminine `تركتِ` while the cart said `Hussein`,
// because a 2026-09-02 session had forced customer_gender to 'female' on that row to
// exercise the feminine branch and nobody re-read the name. The inference was never
// wrong - these two assertions are what makes that provable next time.
check('Hussein (Latin) -> male', () => eq(genderOf('Hussein'), 'male'));
check('حسين (Arabic) -> male', () => eq(genderOf('حسين'), 'male'));

// ------------------------------------------------------------------ summary ---

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
