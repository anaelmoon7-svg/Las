import worker, { pickVoice } from '/home/claude/las/src/worker.js';
let pass = 0, failn = 0;
const ok = (c, m) => { if (c) pass++; else { failn++; console.log('FAIL:', m); } };
const calls = [];
const KEY = 'SECRET-KEY-123';
const realFetch = globalThis.fetch;
const voices = [
  { languageCodes: ['ar-XA'], name: 'ar-XA-Standard-A', ssmlGender: 'FEMALE' },
  { languageCodes: ['ar-XA'], name: 'ar-XA-Wavenet-A', ssmlGender: 'FEMALE' },
  { languageCodes: ['ar-XA'], name: 'ar-XA-Wavenet-B', ssmlGender: 'MALE' },
  { languageCodes: ['ar-XA'], name: 'ar-XA-Chirp3-HD-Aoede', ssmlGender: 'FEMALE' },
  { languageCodes: ['de-DE'], name: 'de-DE-Neural2-F', ssmlGender: 'FEMALE' },
  { languageCodes: ['de-DE'], name: 'de-DE-Standard-B', ssmlGender: 'MALE' },
];
let mode = 'ok';
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  const u = String(url);
  if (mode === 'upstream500') return new Response('{"error":{"message":"KEY=' + KEY + ' leaked?"}}', { status: 500 });
  if (u.includes('translation.googleapis.com')) return new Response(JSON.stringify({ data: { translations: [{ translatedText: 'Hello world' }] } }));
  if (u.endsWith('/v1/voices')) { if (mode === 'novoices') return new Response('x', { status: 403 }); return new Response(JSON.stringify({ voices })); }
  if (u.endsWith('text:synthesize')) return new Response(JSON.stringify({ audioContent: btoa('\xff\xfb\x90\x00MP3') }));
  throw new Error('unexpected fetch ' + u);
};
const env = (extra = {}) => ({ GOOGLE_CLOUD_API_KEY: KEY, ASSETS: { fetch: async () => new Response('asset') }, ...extra });
const get = (path, headers = {}, e = env()) => worker.fetch(new Request('https://las.test' + path, { headers }), e);
const post = (path, body, headers = {}, e = env()) => worker.fetch(new Request('https://las.test' + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }), e);

// assets passthrough + health
ok(await (await get('/index.html')).text() === 'asset', 'assets passthrough');
let r = await get('/api/health'); let j = await r.json(); ok(r.status === 200 && j.translate === true, 'health configured');
r = await get('/api/health', {}, env({ GOOGLE_CLOUD_API_KEY: undefined })); j = await r.json(); ok(j.translate === false && !JSON.stringify(j).includes(KEY), 'health unconfigured, no key leak');
ok((await get('/api/nope')).status === 404, '404 unknown api');

// translate validation
ok((await post('/api/translate', { text: 'مرحبا', sl: 'ar', tl: 'en' }, {}, env({ GOOGLE_CLOUD_API_KEY: undefined }))).status === 503, '503 without key');
ok((await post('/api/translate', 'not json')).status === 400, 'bad json');
ok((await post('/api/translate', { text: 'x', sl: 'ar', tl: 'xx' })).status === 400, 'bad lang');
ok((await post('/api/translate', { text: 'x', sl: 'ar', tl: 'ar' })).status === 400, 'same lang');
ok((await post('/api/translate', { text: '', sl: 'ar', tl: 'en' })).status === 400, 'empty text');
ok((await post('/api/translate', { text: 'a'.repeat(601), sl: 'ar', tl: 'en' })).status === 413, 'too long');
ok((await get('/api/translate')).status === 405, 'GET translate 405');
ok((await post('/api/translate', { text: 'مرحبا', sl: 'ar', tl: 'en' }, { 'sec-fetch-site': 'cross-site' })).status === 403, 'cross-site blocked');
ok((await post('/api/translate', { text: 'مرحبا', sl: 'ar', tl: 'en' }, { origin: 'https://evil.test' })).status === 403, 'foreign origin blocked');
ok(calls.length === 0, 'no upstream call for rejected requests');

// translate success
r = await post('/api/translate', { text: 'مرحبا', sl: 'ar', tl: 'en' }, { 'sec-fetch-site': 'same-origin', origin: 'https://las.test' });
j = await r.json(); ok(r.status === 200 && j.text === 'Hello world', 'translate ok');
const c = calls[0]; ok(c.init.headers['x-goog-api-key'] === KEY && !c.url.includes(KEY), 'key sent in header only');
ok(JSON.parse(c.init.body).format === 'text' && JSON.parse(c.init.body).source === 'ar', 'translate body');
ok(r.headers.get('cache-control') === 'no-store', 'translate not cached');

// upstream error not leaked
mode = 'upstream500'; r = await post('/api/translate', { text: 'مرحبا', sl: 'ar', tl: 'en' }); const t = await r.text();
ok(r.status === 502 && !t.includes(KEY) && !t.includes('leaked'), 'upstream error sanitized');

// tts
mode = 'ok'; calls.length = 0;
r = await get('/api/tts?lang=ar&text=' + encodeURIComponent('مرحبا') + '&gender=female');
ok(r.status === 200 && r.headers.get('content-type') === 'audio/mpeg', 'tts ok');
const bytes = new Uint8Array(await r.arrayBuffer()); ok(bytes[0] === 0xff && bytes[1] === 0xfb, 'tts bytes decoded');
const syn = calls.find((x) => x.url.endsWith('text:synthesize')); const sb = JSON.parse(syn.init.body);
ok(sb.voice.name === 'ar-XA-Wavenet-A' && sb.voice.languageCode === 'ar-XA' && sb.audioConfig.speakingRate === 1, 'picks WaveNet female for ar: ' + sb.voice.name);
await get('/api/tts?lang=ar&text=hi&gender=male&slow=1'); const sb2 = JSON.parse(calls.filter((x) => x.url.endsWith('text:synthesize')).pop().init.body);
ok(sb2.voice.name === 'ar-XA-Wavenet-B' && sb2.audioConfig.speakingRate === 0.7, 'male + slow');
await get('/api/tts?lang=de&text=hallo'); const sb3 = JSON.parse(calls.filter((x) => x.url.endsWith('text:synthesize')).pop().init.body);
ok(sb3.voice.name === 'de-DE-Neural2-F', 'de falls to Neural2 when no WaveNet: ' + sb3.voice.name);
ok(calls.filter((x) => x.url.endsWith('/v1/voices')).length === 1, 'voices list cached in isolate');
ok((await get('/api/tts?lang=xx&text=hi')).status === 400, 'tts bad lang');
ok((await get('/api/tts?lang=ar&text=' + 'a'.repeat(221))).status === 413, 'tts too long');
ok((await get('/api/tts?lang=ar&text=hi', { 'sec-fetch-site': 'cross-site' })).status === 403, 'tts cross-site');
ok((await post('/api/tts', {})).status === 405, 'POST tts 405');

// rate limit
const rl = env({ RL: { limit: async () => ({ success: false }) } });
r = await get('/api/tts?lang=ar&text=hi', {}, rl); ok(r.status === 429 && r.headers.get('retry-after') === '30', 'rate limited 429');
const rl2 = env({ RL: { limit: async () => { throw new Error('binding down'); } } });
ok((await get('/api/tts?lang=ar&text=hi', {}, rl2)).status === 200, 'rate-limit binding error does not block');

// pickVoice unit
ok(pickVoice(voices.filter((v) => v.languageCodes[0] === 'ar-XA'), 'female', 'standard') === 'ar-XA-Standard-A', 'standard tier');
ok(pickVoice(voices.filter((v) => v.languageCodes[0] === 'ar-XA'), 'female', 'chirp') === 'ar-XA-Chirp3-HD-Aoede', 'chirp tier');
ok(pickVoice([], 'female') === null, 'no voices -> null');

console.log(`worker tests: ${pass} passed, ${failn} failed`);
process.exit(failn ? 1 : 0);
