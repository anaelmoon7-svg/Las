# اختبارات لاس (سكربتات الجلسة)

سكربتات Playwright (بايثون) وNode كُتبت أثناء العمل. المسارات داخلها مكتوبة لبيئة الجلسة (`/home/claude/...`) وتحتاج تعديلاً بسيطاً في مكان آخر.

- `worker_test.mjs` — اختبارات الـWorker الوسيط (تحتاج فرع `licensed-apis`).
- `engine_test.mjs` — اختبارات محرك الترجمة.
- `func.py` `voice.py` `conf.py` `overflow.py` — وظائف الصفحة والصوت ووضع المؤتمرات والعرض على 360/390/430.
- `sec_xss.py` — فحص حقن HTML. `csp_check.py` + `serve_hdr.py` — يشغّل الموقع برؤوس `_headers` ويفحص سياسة CSP.
- `packs*.py` + `hfsim.py` — تنزيل الحزم بمحاكاة HuggingFace. `sw_api.py` — الـService Worker لا يخزّن `/api/`.

تشغيل مثال: `python3 tests/func.py public`
