export default function Head() {
  const script = `
(function () {
  function browserCountry() {
    try {
      var locales = (navigator.languages || [navigator.language || '']).filter(Boolean);
      for (var i = 0; i < locales.length; i++) {
        var parts = String(locales[i]).replace('_','-').split('-');
        for (var j = parts.length - 1; j >= 1; j--) {
          if (/^[A-Za-z]{2}$/.test(parts[j])) return parts[j].toUpperCase();
        }
      }
    } catch (_) {}
    return 'BR';
  }

  function applyCountry(country, attempt) {
    attempt = attempt || 0;
    var select = document.querySelector('select[aria-label="País do WhatsApp"]');
    if (!select) {
      if (attempt < 30) setTimeout(function () { applyCountry(country, attempt + 1); }, 100);
      return;
    }
    if (select.dataset.userChanged === '1') return;
    var option = Array.prototype.some.call(select.options, function (o) { return o.value === country; });
    if (!option) return;

    var setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, country);
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function init() {
    var select = document.querySelector('select[aria-label="País do WhatsApp"]');
    if (select && !select.dataset.countryListener) {
      select.dataset.countryListener = '1';
      select.addEventListener('change', function (event) {
        if (event.isTrusted) select.dataset.userChanged = '1';
      });
    }

    var fallback = browserCountry();
    fetch('/api/geo-country', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (data) { applyCountry((data && data.country) || fallback); })
      .catch(function () { applyCountry(fallback); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 150); });
  else setTimeout(init, 150);
})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />
}
