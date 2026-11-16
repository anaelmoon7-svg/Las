import { createTranslator, NoTranslation, PHRASEBOOK } from '/home/claude/las/public/js/translate.js';
let pass = 0, bad = 0; const ok = (c, m) => { if (c) pass++; else { bad++; console.log('FAIL:', m); } };
const res = (status, body) => ({ ok: status < 400, status, json: async () => body });
const mk = (fn, extra = {}) => createTranslator({ fetch: fn, timeout: 500, isOffline: () => false, ...extra });

// success + request shape
let seen; let t = mk(async (u, init) => { seen = { u, init }; return res(200, { text: 'Hello' }); });
let r = await t.translate('مرحبا', 'ar', 'en-US');
ok(r.text === 'Hello' && r.via === 'cloud', 'success via cloud');
ok(seen.u === '/api/translate' && seen.init.method === 'POST' && JSON.parse(seen.init.body).tl === 'en', 'POST /api/translate with base codes');
r = await t.translate('مرحبا', 'ar', 'en-US'); ok(r.via === 'cache', 'cached second time');

// 503 not configured: no retry, then honest failure
let n = 0; t = mk(async () => { n++; return res(503, { error: 'not_configured' }); });
try { await t.translate('اختبار', 'ar', 'de'); ok(false, 'should throw'); } catch (e) { ok(e instanceof NoTranslation && n === 1, '503 -> no retry (calls=' + n + ')'); ok(e.reasons[0].startsWith('cloud:'), 'reason tagged cloud'); }
// 429 no retry
n = 0; t = mk(async () => { n++; return res(429, {}); }); try { await t.translate('اختبار٢', 'ar', 'de'); } catch (e) { ok(n === 1, '429 no retry'); }
// 500 then ok (one retry)
n = 0; t = mk(async () => { n++; return n === 1 ? res(500, {}) : res(200, { text: 'ok2' }); });
r = await t.translate('اختبار٣', 'ar', 'fr'); ok(r.text === 'ok2' && n === 2, 'retry once on 500');
// empty text from server -> error
t = mk(async () => res(200, { text: '' })); try { await t.translate('اختبار٤', 'ar', 'fr'); ok(false, 'empty should throw'); } catch (e) { ok(e instanceof NoTranslation, 'empty result is failure'); }
// local model fallback when cloud fails
t = mk(async () => res(503, {})); t.setLocal(async (x) => 'LOCAL:' + x, () => true);
r = await t.translate('اختبار٥', 'ar', 'en-US'); ok(r.via === 'local' && r.text === 'LOCAL:اختبار٥', 'falls back to local model');
// phrasebook offline
t = mk(async () => { throw new Error('should not fetch offline'); }, { isOffline: () => true });
const key = Object.keys(PHRASEBOOK)[0]; r = await t.translate(key, 'ar', 'en-US'); ok(r.via === 'phrasebook', 'phrasebook offline');
// no third-party hosts anywhere
const src = (await import('node:fs')).readFileSync('/home/claude/las/public/js/translate.js', 'utf8');
ok(!/googleapis|mymemory|translate\.google/i.test(src), 'no google/mymemory hosts in translate.js');
// long text is chunked, each chunk a separate POST
let posts = 0; t = mk(async () => { posts++; return res(200, { text: 'x' }); });
r = await t.translate(('جملة قصيرة. ').repeat(80), 'ar', 'en-US'); ok(posts > 1 && r.via === 'cloud', 'long text chunked (' + posts + ' posts)');
console.log(`engine tests: ${pass} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
