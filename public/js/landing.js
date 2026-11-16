// سكربت صفحة التعريف (كان مضمّناً في index.html؛ فصلناه ليعمل مع سياسة أمان صارمة بدون unsafe-inline).
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ----- المدار: علم لكل لغة من الـ 14 ----- */
  var FLAGS = ['🇪🇬', '🇺🇸', '🇩🇪', '🇫🇷', '🇳🇱', '🇮🇹', '🇪🇸', '🇨🇳', '🇮🇳', '🇹🇷', '🇷🇺', '🇯🇵', '🇰🇷', '🇵🇹'];
  $('#ring').innerHTML = FLAGS.map(function (f, i) {
    return '<div class="slot" style="--a:' + (360 / FLAGS.length) * i + 'deg"><div class="unrot"><span class="chip">' + f + '</span></div></div>';
  }).join('');

  var isStandalone = function () {
    return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  };
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var deferred = null;

  /* ----- إشعار صغير ----- */
  var toastEl = $('#toast'), toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 3000);
  }

  /* ----- التبويبات ----- */
  function selectTab(which) {
    ['android', 'ios'].forEach(function (k) {
      var on = k === which;
      $('#tab-' + k).setAttribute('aria-selected', on ? 'true' : 'false');
      $('#panel-' + k).hidden = !on;
    });
  }
  $('#tab-android').addEventListener('click', function () { selectTab('android'); });
  $('#tab-ios').addEventListener('click', function () { selectTab('ios'); });
  selectTab(isIOS ? 'ios' : 'android');

  /* ----- حالة الزر ----- */
  var buttons = [$('#installBtn'), $('#installBtn2'), $('#installBtn3')];
  if (isStandalone()) {
    $$('#installLabel, .installLabel').forEach(function (el) { el.textContent = 'افتح التطبيق'; });
  }

  /* ----- التثبيت ----- */
  function goToInstall() {
    selectTab(isIOS ? 'ios' : 'android');
    var box = $('#install');
    if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function onInstall() {
    if (isStandalone()) { location.href = 'app.html'; return; }
    if (deferred) {
      deferred.prompt();
      deferred.userChoice.then(function (c) {
        if (c && c.outcome === 'accepted') toast('جاري تثبيت لاس…');
        deferred = null;
      });
      return;
    }
    if (isIOS) {
      var sheet = $('#iosSheet');
      if (sheet && typeof sheet.showModal === 'function') { sheet.showModal(); return; }
    }
    goToInstall();
  }
  buttons.forEach(function (b) { if (b) b.addEventListener('click', onInstall); });

  $('#iosClose').addEventListener('click', function () { $('#iosSheet').close(); });
  $('#iosSheet').addEventListener('click', function (e) { if (e.target === this) this.close(); });

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
  });
  window.addEventListener('appinstalled', function () {
    deferred = null;
    toast('تم التثبيت ✓ ستجد لاس على شاشتك الرئيسية');
  });

  /* ----- الشريط السفلي: يظهر فقط عندما لا يكون زر الهيرو ولا قسم التثبيت أمام العين ----- */
  var sticky = $('#stickyCta'), hero = $('#heroCta'), installSec = $('#install');
  if ('IntersectionObserver' in window && sticky && hero && installSec && !isStandalone()) {
    var visible = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { visible[en.target.id] = en.isIntersecting; });
      sticky.classList.toggle('show', !visible.heroCta && !visible.install);
    }, { threshold: 0 });
    io.observe(hero);
    io.observe(installSec);
  }
  if (isStandalone() && sticky) sticky.style.display = 'none';

  /* ----- service worker ----- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
