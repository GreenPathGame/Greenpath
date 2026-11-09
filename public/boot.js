// GreenPath boot guard.
// GitHub Pages lets browsers keep index.html for up to 10 minutes. Right after an update,
// a kept copy can point to old program files that no longer exist, which leaves only the
// green background. If the main program file fails to load, reload once to get the new page.
(function () {
  var KEY = "greenpath.bootReload";
  window.addEventListener("error", function (e) {
    var el = e.target;
    if (!el || el.tagName !== "SCRIPT" || !/\/assets\//.test(el.src || "")) return;
    try {
      if (sessionStorage.getItem(KEY)) return; // already tried once in this tab
      sessionStorage.setItem(KEY, "1");
    } catch (err) { /* storage blocked: still try once */ }
    location.reload();
  }, true);
  window.addEventListener("load", function () {
    try { sessionStorage.removeItem(KEY); } catch (err) { /* ignore */ }
  });
})();
