(function () {
  var key = 'foco-trade-asset-recovery';
  window.addEventListener('error', function (event) {
    var element = event.target;
    var source = element && (element.src || element.href);
    if (!source || source.indexOf('/_next/static/') === -1) return;
    try {
      var previous = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - previous < 60000) return;
      sessionStorage.setItem(key, String(Date.now()));
      var url = new URL(window.location.href);
      url.searchParams.set('_refresh', String(Date.now()));
      window.location.replace(url.toString());
    } catch (_) {
      // Restricted browser storage must never create a reload loop.
    }
  }, true);
})();
