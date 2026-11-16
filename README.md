# لاس (LAS)

مترجم صوتي فوري بـ 14 لغة مع النطق مكتوباً بحروف عربية. تطبيق ويب قابل للتثبيت (PWA).

- `public/` — ملفات الموقع كما تُنشر (`app.html` التطبيق، `index.html` صفحة التعريف).
- `src/worker.js` — Worker وسيط يخدم `/api/*` فقط: `/api/translate` و`/api/tts` عبر Google Cloud الرسمي، و`/api/health`.
- `wrangler.jsonc` — إعداد النشر على Cloudflare Workers (الملفات الثابتة لا تمرّ من الـWorker).

النشر: أي تعديل على الفرع `main` يُنشر تلقائياً على Cloudflare (Worker: shiny-frog-c209).

## تفعيل الترجمة والنطق السحابيين (مرة واحدة قبل النشر)

1. في Google Cloud Console: فعّل **Cloud Translation API** و**Cloud Text-to-Speech API**، وأنشئ مفتاح API وقيّده بهاتين الخدمتين فقط.
2. ضع سقفاً يومياً للاستهلاك (Quotas) وتنبيهاً للميزانية (Budget alert) حتى لا ترتفع الفاتورة بلا قصد.
3. في Cloudflare: Workers & Pages ← shiny-frog-c209 ← Settings ← Variables and Secrets ← أضف **Secret** باسم `GOOGLE_CLOUD_API_KEY`.
4. اختياري: متغير نصي `TTS_TIER` بإحدى القيم `standard` أو `wavenet` (الافتراضي) أو `neural2` أو `chirp` لاختيار جودة الصوت وسعره.

بدون المفتاح يرجع الـWorker `503 not_configured` وتعمل الواجهة بالموديلات المحلية والجمل الجاهزة فقط.
