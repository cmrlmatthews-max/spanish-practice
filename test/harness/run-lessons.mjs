#!/usr/bin/env node
/* run-lessons.mjs - runs every lesson of the tool from Start to the end in headless Chromium.
 * It replaces the Azure Speech SDK with test/harness/fake-speech-sdk.js.
 * No microphone, no Azure, no real key.
 *
 * Usage:
 *   node test/harness/run-lessons.mjs [lessonId ...] [--mode=pass|mixed|fail|nomatch|busy]
 *                                     [--lang=en|es] [--screens=dir]
 *
 * See test/harness/README.md.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const FAKE_SDK_PATH = path.join(HERE, 'fake-speech-sdk.js');
const VENDOR_URL_RE = /\/js\/vendor\/microsoft\.cognitiveservices\.speech\.sdk\.bundle-min\.js(\?.*)?$/;

// ---------- Arguments ----------

const ids = [];
const opts = { mode: 'pass', lang: '', screens: '', help: false };
for (const arg of process.argv.slice(2)) {
  if (arg === '--help' || arg === '-h') { opts.help = true; }
  else if (arg.startsWith('--mode=')) { opts.mode = arg.slice(7); }
  else if (arg.startsWith('--lang=')) { opts.lang = arg.slice(7); }
  else if (arg.startsWith('--screens=')) { opts.screens = arg.slice(10); }
  else if (arg.startsWith('--')) { console.error('Unknown option: ' + arg); process.exit(2); }
  else { ids.push(arg); }
}
if (opts.help) {
  console.log('Usage: node test/harness/run-lessons.mjs [lessonId ...] [--mode=pass|mixed|fail|nomatch|busy] [--lang=en|es] [--screens=dir]');
  process.exit(0);
}
if (!['pass', 'mixed', 'fail', 'nomatch', 'busy'].includes(opts.mode)) {
  console.error('--mode must be pass, mixed, fail, nomatch, or busy.'); process.exit(2);
}
if (opts.lang && !['en', 'es'].includes(opts.lang)) { console.error('--lang must be en or es.'); process.exit(2); }
if (opts.screens) { fs.mkdirSync(opts.screens, { recursive: true }); }

// ---------- Playwright loader ----------

// A CommonJS package gives its exports as "default" in an ES module import.
const unwrap = (mod) => (mod.chromium ? mod : mod.default);

async function loadPlaywright() {
  try { return unwrap(await import('playwright')); } catch (e) { /* try the other places */ }
  const dirs = [];
  if (process.env.PLAYWRIGHT_DIR) { dirs.push(process.env.PLAYWRIGHT_DIR); }
  try { dirs.push(execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch (e) { /* no npm */ }
  dirs.push('/opt/npm-tools/node_modules');
  for (const dir of dirs) {
    try {
      const file = createRequire(path.join(dir, 'noop.js')).resolve('playwright');
      return unwrap(await import(pathToFileURL(file).href));
    } catch (e) { /* next */ }
  }
  throw new Error('Cannot find the "playwright" package. Install it (see README.md) or set PLAYWRIGHT_DIR to its node_modules folder.');
}

// ---------- Static server ----------

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function startServer() {
  const server = http.createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); res.end('bad url'); return; }
    if (rel.endsWith('/')) { rel += 'index.html'; }
    const file = path.normalize(path.join(ROOT, rel));
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end('forbidden'); return; }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': stat.size, 'Cache-Control': 'no-store'
      });
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, base: 'http://127.0.0.1:' + server.address().port }));
  });
}

// ---------- Small helpers ----------

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exact = (s) => new RegExp('^\\s*' + esc(s) + '\\s*$');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const pad2 = (n) => String(n).padStart(2, '0');

// Word list of a sentence as the fake SDK builds it: split on spaces, no punctuation.
function sentenceWords(text) {
  return String(text).split(/\s+/).map((w) => w.replace(/[¿?¡!.,;:"«»()]/g, '')).filter(Boolean);
}

// Remove accents (not the tilde of n), capitals, and punctuation.
function looseVariant(text) {
  return text.toLowerCase().normalize('NFD').replace(/[́̈]/g, '').normalize('NFC')
    .replace(/[\p{P}\p{S}]/gu, '').replace(/\s+/g, ' ').trim();
}

// ---------- One lesson ----------

async function runLesson(browser, base, lessonFile, lesson, extraIndexFiles) {
  const profile = lesson.audience.includes('cade') ? 'cade' : 'casey';
  const lang = opts.lang || (profile === 'cade' ? 'en' : 'es');
  const exercises = lesson.exercises;
  const N = exercises.length;
  const L = {
    lessonId: lesson.lessonId, profile, lang, mode: opts.mode, expected: N, reached: 0, endShown: false,
    errors: [], warnings: [], consoleErrors: [], pageErrors: [], failedRequests: [], lessonProblems: [],
    uiErrors: [], perExercise: [], synthCount: 0, expectedClips: 0, recogCount: 0, listProgress: ''
  };
  const fail = (msg) => { L.errors.push(msg); };

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    serviceWorkers: 'block'
  });
  context.setDefaultTimeout(15000);
  // The fake SDK replaces the vendor file.
  await context.route(VENDOR_URL_RE, (route) => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8', body: fs.readFileSync(FAKE_SDK_PATH, 'utf8')
  }));
  // Lessons that exist as files but are not in index.json yet.
  if (extraIndexFiles.length) {
    await context.route('**/lessons/index.json', async (route) => {
      const real = readJson('lessons/index.json');
      const list = real.lessons.slice();
      extraIndexFiles.forEach((f) => { if (!list.includes(f)) { list.push(f); } });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ lessons: list }) });
    });
  }
  // Fake key, fake region, and the profile. The names come from js/storage.js.
  await context.addInitScript((arg) => {
    try {
      localStorage.setItem('spanish-azure-key', 'FAKE-TEST-KEY-NOT-REAL');
      localStorage.setItem('spanish-azure-region', 'eastus');
      localStorage.setItem('spanish-current-profile', arg.profile);
      if (arg.lang) {
        localStorage.setItem('spanish-profile-' + arg.profile, JSON.stringify({ explanationLang: arg.lang, progress: {} }));
      }
    } catch (e) { /* ignore */ }
    window.__fakeSdk = { mode: arg.mode === 'nomatch' || arg.mode === 'busy' ? 'pass' : arg.mode, synth: [], recog: [] };
  }, { profile, lang: opts.lang, mode: opts.mode });

  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') { L.consoleErrors.push(m.text()); } });
  page.on('pageerror', (e) => { L.pageErrors.push(String(e && e.message || e)); });
  page.on('requestfailed', (r) => {
    const url = r.url();
    if (!url.startsWith(base)) { return; }
    L.failedRequests.push(url.replace(base, '') + ' (' + (r.failure() && r.failure().errorText) + ')');
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().startsWith(base)) { L.failedRequests.push(r.url().replace(base, '') + ' (HTTP ' + r.status() + ')'); }
  });

  const textCache = new Map();
  async function T(key, vars) {
    const id = key + JSON.stringify(vars || null);
    if (!textCache.has(id)) {
      textCache.set(id, await page.evaluate(([k, v, p]) => SP.t(k, SP.storage.getProfile(p).explanationLang, v), [key, vars || null, profile]));
    }
    return textCache.get(id);
  }
  const runner = page.locator('#lesson-runner');
  const button = async (key, vars) => runner.getByRole('button', { name: exact(await T(key, vars)) });
  async function shot(name) {
    if (!opts.screens) { return; }
    try { await page.screenshot({ path: path.join(opts.screens, lesson.lessonId + '-' + name + '.png'), fullPage: true }); } catch (e) { /* ignore */ }
  }
  // Error messages that are visible in the page now.
  async function scanUi(where) {
    const found = await page.evaluate(() => {
      const out = [];
      const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      document.querySelectorAll('#lesson-runner .error, #lesson-runner .warn, #lesson-runner .sv-error, #banner-storage:not([hidden]), #settings-notice:not([hidden])').forEach((el) => {
        const t = (el.textContent || '').trim();
        if (t && visible(el)) { out.push(t); }
      });
      return out;
    });
    found.forEach((t) => { const m = where + ': ' + t; if (!L.uiErrors.includes(m)) { L.uiErrors.push(m); } });
  }
  const setMode = (mode) => page.evaluate((m) => { window.__fakeSdk.mode = m; }, mode);
  const setScores = (s) => page.evaluate((v) => { window.__fakeSdk.scores = v; }, s);

  // ---- state for expected results ----
  const exPassed = new Array(N).fill(false); // expected pass state after the run
  let shownEnglish = false;
  let audioButtonsTested = false;
  let cancelTested = false;
  let looseTested = false;
  let tryAgainTested = false;
  let gridMidTested = false;

  try {
    // 1. Lesson list
    await page.goto(base + '/#lessons');
    await page.locator('#lessons-list').waitFor();
    await page.waitForFunction(() => document.querySelector('#lessons-list .lesson-item') || (document.getElementById('lessons-status') && /cannot load|No se pudieron/.test(document.getElementById('lessons-status').textContent)));
    const problems = await page.evaluate(() => {
      const box = document.getElementById('lessons-problems');
      if (!box || box.hidden) { return ''; }
      return (document.getElementById('lessons-problems-title').textContent + ' | ' + document.getElementById('lessons-problems-body').textContent).trim();
    });
    if (problems) { L.lessonProblems.push(problems); }
    await shot('00-lesson-list');
    const item = page.locator('#lessons-list .lesson-item').filter({ has: page.locator('.lesson-title', { hasText: exact(lesson.title) }) });
    if (await item.count() !== 1) { throw new Error('The lesson "' + lesson.title + '" is not in the lesson list for profile ' + profile + ' (found ' + await item.count() + ').'); }
    await item.click();
    await runner.waitFor();

    // 2. Start, wait for clips, Begin
    const startBtn = await button('runStart');
    await startBtn.click();
    const beginBtn = await button('runBegin');
    try {
      await beginBtn.waitFor({ timeout: 30000 });
    } catch (e) {
      throw new Error('Begin did not show after Start. The runner shows: "' + (await runner.innerText()).replace(/\s+/g, ' ').slice(0, 200) + '"');
    }
    await scanUi('after Start');
    const clipIds = new Set();
    exercises.forEach((ex) => {
      if (['listen_choose', 'listen_type', 'repeat'].includes(ex.type)) { clipIds.add((ex.voice || 'es-MX-DaliaNeural') + '|' + ex.text); }
    });
    L.expectedClips = clipIds.size;
    const synthAfterStart = await page.evaluate(() => window.__fakeSdk.synth.slice());
    const seenClips = new Set(synthAfterStart.map((s) => s.voice + '|' + s.text));
    clipIds.forEach((id) => { if (!seenClips.has(id)) { fail('Voice clip was not requested at Start: ' + id); } });
    if (synthAfterStart.length !== clipIds.size) { fail('Start requested ' + synthAfterStart.length + ' clips; expected ' + clipIds.size + '.'); }
    synthAfterStart.forEach((s) => { if (s.format !== 'Audio16Khz32KBitRateMonoMp3') { fail('Unexpected clip format: ' + s.format); } });
    await shot('01-begin');

    // 3. Exercise grid from Begin: jump to the last exercise, open the grid, go back, jump to the first.
    const jump = runner.locator('.run-jump');
    if (await jump.count() !== N) { fail('The grid shows ' + await jump.count() + ' buttons; expected ' + N + '.'); }
    const gridText = await runner.locator('.run-jump-grid').innerText();
    exercises.forEach((ex, i) => {
      if (gridText.includes(ex.text) || (ex.meaningEn && gridText.includes(ex.meaningEn))) { fail('The grid shows the sentence of exercise ' + (i + 1) + '.'); }
    });
    await jump.nth(N - 1).click();
    await runner.locator('.run-count').filter({ hasText: exact(await T('runExerciseOf', { n: N, m: N })) }).waitFor();
    await (await button('runExercisesBtn')).click();
    const backBtn = await button('runBackToExercise', { n: N });
    await backBtn.waitFor();
    await shot('02-grid');
    const currentIdx = await runner.locator('.run-jump').evaluateAll((els) => els.findIndex((e) => e.classList.contains('run-jump-current')));
    if (currentIdx !== N - 1) { fail('The grid marks exercise ' + (currentIdx + 1) + ' as current; expected ' + N + '.'); }
    await backBtn.click();
    await runner.locator('.run-count').filter({ hasText: exact(await T('runExerciseOf', { n: N, m: N })) }).waitFor();
    await (await button('runExercisesBtn')).click();
    await runner.locator('.run-jump').nth(0).click();

    // 4. Each exercise
    for (let i = 0; i < N; i++) {
      const ex = exercises[i];
      const tag = pad2(i + 1) + '-' + ex.type;
      const rec = { id: ex.exerciseId, type: ex.type, expectedPass: null, verdict: '' };
      L.perExercise.push(rec);
      try {
        await runner.locator('.run-count').filter({ hasText: exact(await T('runExerciseOf', { n: i + 1, m: N })) }).waitFor();
        await scanUi('exercise ' + (i + 1));
        await shot(tag + '-a');

        // The text rules before the answer.
        if (['listen_choose', 'listen_type', 'repeat'].includes(ex.type)) {
          const shown = await runner.innerText();
          if (shown.includes(ex.text)) { fail('Exercise ' + (i + 1) + ' (' + ex.type + ') shows the sentence before the answer.'); }
        }
        if (lang === 'es' && await runner.locator('.run-english, .run-english-text').count() > 0) {
          fail('Exercise ' + (i + 1) + ': English meaning block is present in Spanish mode.');
        }

        // Grid in the middle of a run: the check marks must match.
        if (i === 2 && !gridMidTested) {
          gridMidTested = true;
          await (await button('runExercisesBtn')).click();
          const marks = await runner.locator('.run-jump-passed').count();
          const want = exPassed.slice(0, i).filter(Boolean).length;
          if (marks !== want) { fail('The grid shows ' + marks + ' check marks; expected ' + want + '.'); }
          await (await button('runBackToExercise', { n: i + 1 })).click();
          await runner.locator('.run-count').filter({ hasText: exact(await T('runExerciseOf', { n: i + 1, m: N })) }).waitFor();
        }

        // Replay and slow replay (once per lesson).
        if (!audioButtonsTested && ex.type !== 'read_aloud') {
          audioButtonsTested = true;
          await (await button('runReplay')).click();
          await (await button('runSlow')).click();
          const rate = await page.evaluate(() => { const a = document.querySelector('audio'); return a ? a.playbackRate : null; });
          if (rate !== 0.5) { fail('Slow replay set playbackRate to ' + rate + '; expected 0.5.'); }
          await (await button('runReplay')).click();
          const rate2 = await page.evaluate(() => { const a = document.querySelector('audio'); return a ? a.playbackRate : null; });
          if (rate2 !== 1) { fail('Replay set playbackRate to ' + rate2 + '; expected 1.'); }
        }

        // Show English once (English mode only).
        let usedHint = false;
        if (lang === 'en' && !shownEnglish && ex.meaningEn && (i === Math.min(1, N - 1))) {
          shownEnglish = true;
          usedHint = true;
          await (await button('runShowEnglish')).click();
          const eng = (await runner.locator('.run-english-text').innerText()).trim();
          if (eng !== ex.meaningEn) { fail('Show English shows "' + eng + '"; expected "' + ex.meaningEn + '".'); }
        }

        // ---- answer ----
        let expectPass = true;
        if (ex.type === 'listen_choose') {
          const choices = ex.choices;
          const correct = choices.find((c) => c.correct === true);
          const wrong = choices.find((c) => c.correct !== true);
          const clickChoice = async (c) => runner.locator('.lc-choice').filter({ has: page.locator('img[src="' + c.image + '"]') }).click();
          if (opts.mode === 'fail') {
            await clickChoice(wrong);
            const dimmed = await runner.locator('.lc-choice.lc-wrong').count();
            if (dimmed !== 1) { fail('Exercise ' + (i + 1) + ': a wrong choice dimmed ' + dimmed + ' images; expected 1.'); }
            expectPass = false;
          }
          await clickChoice(correct);
        } else if (ex.type === 'listen_type') {
          let answer = ex.text;
          if (!looseTested && looseVariant(ex.text) !== ex.text) { looseTested = true; answer = looseVariant(ex.text); }
          await runner.locator('.lt-input').fill(answer);
          await runner.locator('.lt-check').click();
          if (answer !== ex.text) {
            if (await runner.locator('.lt-info').count() !== 1) { fail('Exercise ' + (i + 1) + ': no spelling note for a loose answer.'); }
          }
        } else {
          // repeat and read_aloud
          if (ex.type === 'read_aloud' && (await runner.locator('.ra-text').innerText()).trim() !== ex.text) {
            fail('Exercise ' + (i + 1) + ': the read aloud text on screen differs from the lesson.');
          }
          const rb = runner.locator('.rp-record');
          const flowState = () => runner.locator('.rp-flow').getAttribute('data-state');
          // Cancel test (once).
          if (!cancelTested && (opts.mode === 'pass' || opts.mode === 'mixed' || opts.mode === 'fail')) {
            cancelTested = true;
            await page.evaluate(() => { window.__fakeSdk.delayMs = 1500; });
            await rb.click();
            await page.waitForFunction(() => { const f = document.querySelector('#lesson-runner .rp-flow'); return f && f.getAttribute('data-state') !== 'idle'; });
            await rb.click();
            await sleep(100);
            if (await flowState() !== 'idle') { fail('Exercise ' + (i + 1) + ': a second tap did not cancel the recording.'); }
            await sleep(1600);
            if (await flowState() !== 'idle') { fail('Exercise ' + (i + 1) + ': a cancelled recording still delivered a result.'); }
            await page.evaluate(() => { window.__fakeSdk.delayMs = 300; });
          }
          // Error messages (nomatch and busy modes).
          if (opts.mode === 'nomatch' || opts.mode === 'busy') {
            await setMode(opts.mode);
            await rb.click();
            await page.waitForFunction(() => { const s = document.querySelector('#lesson-runner .rp-status'); return s && s.classList.contains('error') && s.textContent.trim(); });
            const msg = (await runner.locator('.rp-status').innerText()).trim();
            const want = await T(opts.mode === 'nomatch' ? 'speechErrNospeech' : 'speechErrBusy');
            if (msg !== want) { fail('Exercise ' + (i + 1) + ': error message "' + msg + '"; expected "' + want + '".'); }
            await shot(tag + '-error');
            await setMode('pass');
          }
          // Scores that satisfy the pass values of this exercise.
          const need = ex.pass || {};
          if (opts.mode === 'fail') { await setScores(null); expectPass = false; }
          else if (typeof need.accuracy === 'number' || typeof need.fluency === 'number') {
            const base0 = opts.mode === 'mixed' ? { accuracy: 84, fluency: 90 } : { accuracy: 92, fluency: 92 };
            await setScores({
              accuracy: Math.min(100, Math.max(base0.accuracy, (need.accuracy || 0) + 2)),
              fluency: Math.min(100, Math.max(base0.fluency, (need.fluency || 0) + 2))
            });
          } else { await setScores(null); }

          await rb.click();
          const outcome = await (await page.waitForFunction(() => {
            const f = document.querySelector('#lesson-runner .rp-flow');
            if (!f) { return 'gone'; }
            if (f.getAttribute('data-state') === 'done') { return 'done'; }
            const s = f.querySelector('.rp-status');
            if (s && s.classList.contains('error') && s.textContent.trim()) { return 'error: ' + s.textContent.trim(); }
            return false;
          }, null, { timeout: 20000 })).jsonValue();
          if (outcome !== 'done') { throw new Error('Recording ended with: ' + outcome); }

          // Score view checks.
          const words = sentenceWords(ex.text);
          const wordBtns = runner.locator('.sv-words .sv-word');
          if (await wordBtns.count() !== words.length) { fail('Exercise ' + (i + 1) + ': score view shows ' + await wordBtns.count() + ' words; expected ' + words.length + '.'); }
          if (opts.mode === 'pass' || opts.mode === 'nomatch' || opts.mode === 'busy') {
            const green = await runner.locator('.sv-words .sv-word.sv-green').count();
            if (green !== words.length) { fail('Exercise ' + (i + 1) + ': ' + green + ' green words; expected ' + words.length + '.'); }
          }
          if (opts.mode === 'mixed') {
            const red = await runner.locator('.sv-words .sv-word.sv-red').count();
            const yellow = await runner.locator('.sv-words .sv-word.sv-yellow').count();
            if (red !== 1) { fail('Exercise ' + (i + 1) + ': ' + red + ' red words; expected 1.'); }
            if (words.length > 1 && yellow !== 1) { fail('Exercise ' + (i + 1) + ': ' + yellow + ' yellow words; expected 1.'); }
          }
          if (opts.mode === 'fail') {
            if (await runner.locator('.sv-words .sv-word.sv-omitted').count() !== 1) { fail('Exercise ' + (i + 1) + ': expected one omitted word mark.'); }
            if (await runner.locator('.sv-marks').count() !== 1) { fail('Exercise ' + (i + 1) + ': the omission legend is missing.'); }
          }
          // Tap a word, read the detail, and use Hear it and Slow.
          const first = wordBtns.nth(0);
          const wordText = (await first.innerText()).trim();
          await first.click();
          const detail = (await runner.locator('.sv-detail').innerText()).trim();
          if (!/\d/.test(detail) || !detail.startsWith(wordText)) { fail('Exercise ' + (i + 1) + ': word detail looks wrong: "' + detail + '".'); }
          const gloss = runner.locator('.sv-gloss');
          const glossKey = await page.evaluate((w) => SP.lessons.wordKey(w), wordText);
          const wantGloss = lang === 'en' && ex.glosses ? ex.glosses[glossKey] : undefined;
          if (wantGloss) {
            const g = (await gloss.innerText()).trim();
            if (!g.includes(wantGloss)) { fail('Exercise ' + (i + 1) + ': gloss "' + g + '" lacks "' + wantGloss + '".'); }
          } else if (await gloss.isVisible()) {
            fail('Exercise ' + (i + 1) + ': a gloss shows where none is expected.');
          }
          if (lang === 'en' && ex.glosses) {
            // Every word of the sentence should have a gloss (a lesson rule).
            const missing = words.filter((w) => !ex.glosses[w.toLowerCase()]);
            if (missing.length) { L.warnings.push('Exercise ' + (i + 1) + ' has no gloss for: ' + missing.join(', ')); }
          } else if (lang === 'en' && !ex.glosses) {
            L.warnings.push('Exercise ' + (i + 1) + ' (' + ex.type + ') has no glosses.');
          }
          const hearRow = runner.locator('.sv-hear');
          if (!(await hearRow.isVisible())) { fail('Exercise ' + (i + 1) + ': Hear it buttons do not show after a word tap.'); }
          else {
            const idle = () => page.waitForFunction(() => !document.querySelector('#lesson-runner .sv-hear button:disabled'));
            await hearRow.getByRole('button', { name: exact(await T('svHear')) }).click();
            await idle();
            await sleep(150);
            await hearRow.getByRole('button', { name: exact(await T('svSlow')) }).click();
            await idle();
            await sleep(150);
            const rate = await page.evaluate(() => { const a = document.querySelector('audio'); return a ? a.playbackRate : null; });
            if (rate !== 0.5) { fail('Exercise ' + (i + 1) + ': slow word clip has playbackRate ' + rate + '; expected 0.5.'); }
            const after = (await runner.locator('.sv-detail').innerText()).trim();
            if (after === await T('svHearFail')) { fail('Exercise ' + (i + 1) + ': "' + await T('svHearFail') + '" shows after Hear it.'); }
          }
          await shot(tag + '-score');
        }

        // ---- result ----
        const verdictEl = runner.locator('.run-result:not([hidden]) .run-verdict');
        await verdictEl.waitFor();
        const verdict = (await verdictEl.innerText()).trim();
        rec.verdict = verdict;
        rec.expectedPass = expectPass;
        const wantVerdict = await T(expectPass ? 'runPassed' : 'runFailed');
        if (verdict !== wantVerdict) { fail('Exercise ' + (i + 1) + ' (' + ex.type + '): verdict "' + verdict + '"; expected "' + wantVerdict + '".'); }
        const spanish = runner.locator('.run-result .run-spanish');
        if (ex.type === 'repeat' || ex.type === 'listen_choose') {
          if (await spanish.count() !== 1 || (await spanish.innerText()).trim() !== ex.text) {
            fail('Exercise ' + (i + 1) + ': the result does not show the exact sentence.');
          }
        }
        const meaningCount = await runner.locator('.run-result .run-meaning').count();
        if (lang === 'en' && ex.meaningEn && meaningCount !== 1) { fail('Exercise ' + (i + 1) + ': English meaning missing after the answer.'); }
        if (lang === 'es' && meaningCount !== 0) { fail('Exercise ' + (i + 1) + ': English meaning shows in Spanish mode.'); }
        const noteText = ex.note && ex.note[lang];
        if (noteText && (await runner.locator('.run-result .run-note').innerText()).trim() !== noteText) {
          fail('Exercise ' + (i + 1) + ': the note differs from the lesson file.');
        }
        await scanUi('result ' + (i + 1));
        await shot(tag + '-b');
        L.reached++;
        exPassed[i] = expectPass;

        // Hint count in progress.
        const record = await page.evaluate(([p, id]) => SP.storage.getProgress(p)[id] || null, [profile, ex.exerciseId]);
        if (!record) { fail('Exercise ' + (i + 1) + ': no progress record saved.'); }
        else {
          if ((record.hints || 0) !== (usedHint ? 1 : 0)) { fail('Exercise ' + (i + 1) + ': hints = ' + record.hints + '; expected ' + (usedHint ? 1 : 0) + '.'); }
          if (record.attempts !== 1) { fail('Exercise ' + (i + 1) + ': attempts = ' + record.attempts + '; expected 1.'); }
          if (record.last && record.last.passed !== expectPass) { fail('Exercise ' + (i + 1) + ': saved pass state ' + record.last.passed + '; expected ' + expectPass + '.'); }
        }

        // Try again (once, on the first failed listen_choose).
        if (!expectPass && !tryAgainTested && ex.type === 'listen_choose') {
          tryAgainTested = true;
          await (await button('runTryAgain')).click();
          await runner.locator('.lc-choice').first().waitFor();
          const correct = ex.choices.find((c) => c.correct === true);
          await runner.locator('.lc-choice').filter({ has: page.locator('img[src="' + correct.image + '"]') }).click();
          const v2 = (await runner.locator('.run-result:not([hidden]) .run-verdict').innerText()).trim();
          if (v2 !== await T('runPassed')) { fail('Exercise ' + (i + 1) + ': after Try again the verdict is "' + v2 + '".'); }
          rec.verdict += ' -> (try again) ' + v2;
          exPassed[i] = true;
          rec.expectedPass = true;
        }

        // Next or Finish
        const last = i === N - 1;
        await runner.locator('.run-nav:not([hidden])').getByRole('button', { name: exact(await T(last ? 'runFinish' : 'runNext')) }).click();
      } catch (e) {
        await shot(tag + '-ERROR');
        throw new Error('Exercise ' + (i + 1) + ' (' + ex.exerciseId + ', ' + ex.type + '): ' + (e && e.message ? e.message.split('\n')[0] : e));
      }
    }

    // 5. End screen
    const doneHeading = runner.locator('h2').filter({ hasText: exact(await T('runDone')) });
    await doneHeading.waitFor();
    L.endShown = true;
    const wantPassed = exPassed.filter(Boolean).length;
    const summary = (await runner.locator('p').filter({ hasText: (await T('runPassedInRun', { passed: wantPassed, total: N })).replace('.', '') }).count());
    if (summary < 1) { fail('The end screen does not say "' + await T('runPassedInRun', { passed: wantPassed, total: N }) + '". It shows: ' + (await runner.innerText()).replace(/\s+/g, ' ')); }
    await scanUi('end');
    await shot('99-end');
    await (await button('runBackToLessons')).click();
    const metaItem = page.locator('#lessons-list .lesson-item').filter({ has: page.locator('.lesson-title', { hasText: exact(lesson.title) }) });
    await metaItem.waitFor();
    L.listProgress = (await metaItem.locator('.lesson-meta').innerText()).trim();
    const wantMeta = await T('passedCount', { passed: wantPassed, total: N });
    if (!L.listProgress.includes(wantMeta)) { fail('The lesson list shows "' + L.listProgress + '"; expected "' + wantMeta + '".'); }
  } catch (e) {
    fail(String(e && e.message ? e.message.split('\n')[0] : e));
    await shot('ERROR');
  }

  // Collect the fake SDK logs.
  try {
    const logs = await page.evaluate(() => ({ synth: window.__fakeSdk.synth, recog: window.__fakeSdk.recog }));
    L.synthCount = logs.synth.length;
    L.recogCount = logs.recog.length;
    const counts = {};
    logs.synth.forEach((s) => { const k = s.voice + '|' + s.text; counts[k] = (counts[k] || 0) + 1; });
    Object.keys(counts).forEach((k) => { if (counts[k] > 1) { fail('Clip requested ' + counts[k] + ' times (rule: once): ' + k); } });
    logs.recog.forEach((r) => {
      if (!exercises.some((ex) => ex.text === r.text)) { fail('Recognition used an unknown reference text: ' + r.text); }
    });
  } catch (e) { /* the page may be gone */ }

  if (L.consoleErrors.length) { L.consoleErrors.forEach((m) => fail('Console error: ' + m)); }
  if (L.pageErrors.length) { L.pageErrors.forEach((m) => fail('Page error: ' + m)); }
  if (L.failedRequests.length) { [...new Set(L.failedRequests)].forEach((m) => fail('Failed request: ' + m)); }
  if (L.lessonProblems.length) { L.lessonProblems.forEach((m) => fail('Lesson file problems: ' + m)); }
  if (L.uiErrors.length) { L.uiErrors.forEach((m) => fail('Error text shown in the UI: ' + m)); }
  if (L.reached !== N) { fail('Reached ' + L.reached + ' of ' + N + ' exercises.'); }
  if (!L.endShown) { fail('The end screen did not show.'); }
  await context.close();
  return L;
}

// ---------- Main ----------

async function main() {
  const index = readJson('lessons/index.json');
  const byId = new Map();
  const problemsLoading = [];
  const loadFile = (file) => {
    try { const l = readJson('lessons/' + file); byId.set(l.lessonId, { file, lesson: l }); }
    catch (e) { problemsLoading.push(file + ': ' + e.message); }
  };
  index.lessons.forEach(loadFile);
  const wanted = ids.length ? ids : index.lessons.map((f) => { const m = [...byId.values()].find((v) => v.file === f); return m && m.lesson.lessonId; }).filter(Boolean);
  const extraFiles = [];
  const runs = [];
  for (const id of wanted) {
    if (!byId.has(id)) {
      const file = 'lesson-' + id + '.json';
      if (fs.existsSync(path.join(ROOT, 'lessons', file))) { loadFile(file); if (byId.has(id)) { extraFiles.push(file); runs.push({ id, virtual: true }); continue; } }
      runs.push({ id, missing: true });
    } else { runs.push({ id, virtual: false }); }
  }

  const { chromium } = await loadPlaywright();
  const { server, base } = await startServer();
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  console.log('Harness: mode=' + opts.mode + (opts.lang ? ' lang=' + opts.lang : '') + ' server=' + base + ' lessons=' + wanted.join(', '));
  problemsLoading.forEach((p) => console.log('WARNING: cannot read lesson file ' + p));

  const results = [];
  for (const r of runs) {
    if (r.missing) {
      results.push({ lessonId: r.id, errors: ['No lesson with this id (not in index.json, no file lessons/lesson-' + r.id + '.json).'], warnings: [], perExercise: [], expected: 0, reached: 0 });
      continue;
    }
    const { file, lesson } = byId.get(r.id);
    const t0 = Date.now();
    const L = await runLesson(browser, base, file, lesson, extraFiles);
    L.seconds = ((Date.now() - t0) / 1000).toFixed(1);
    if (r.virtual) { L.warnings.push('Not in lessons/index.json. The harness added it to the index for this run.'); }
    results.push(L);
  }
  await browser.close();
  server.close();

  // ---------- Report ----------
  let bad = 0;
  console.log('');
  for (const L of results) {
    const ok = L.errors.length === 0;
    if (!ok) { bad++; }
    console.log('=== Lesson ' + L.lessonId + ' [' + (ok ? 'OK' : 'FAIL') + ']' + (L.profile ? ' profile=' + L.profile + ' lang=' + L.lang + ' mode=' + L.mode : '') + (L.seconds ? ' (' + L.seconds + ' s)' : ''));
    if (L.expected) {
      console.log('  exercises reached: ' + L.reached + ' of ' + L.expected + '; end screen: ' + (L.endShown ? 'yes' : 'NO') + '; lesson list: ' + (L.listProgress || '-'));
      console.log('  voice clips: ' + L.synthCount + ' requests (' + L.expectedClips + ' sentence clips expected at Start; the rest are word clips); recognitions: ' + L.recogCount);
      L.perExercise.forEach((p) => {
        console.log('    ' + p.id.padEnd(9) + p.type.padEnd(14) + (p.verdict || '(not reached)'));
      });
      console.log('  console errors: ' + L.consoleErrors.length + '; page errors: ' + L.pageErrors.length + '; failed requests: ' + new Set(L.failedRequests).size + '; lesson file problems: ' + L.lessonProblems.length + '; UI errors: ' + L.uiErrors.length);
    }
    L.warnings.forEach((w) => console.log('  warning: ' + w));
    L.errors.forEach((e) => console.log('  ERROR: ' + e));
  }
  console.log('');
  console.log(bad === 0 ? 'ALL ' + results.length + ' LESSON(S) OK' : bad + ' of ' + results.length + ' LESSON(S) FAILED');
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((e) => { console.error('Harness crashed: ' + (e && e.stack || e)); process.exit(2); });
