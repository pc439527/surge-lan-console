/* global localStorage, window, document */
// Apply persisted appearance before paint without requiring an inline CSP exception.
(function () {
  try {
    var raw = localStorage.getItem("surge-lan-console.preferences");
    var appearance = raw ? (JSON.parse(raw).state || {}).appearance : undefined;
    var dark = appearance === "dark" || (!appearance && window.matchMedia("(prefers-color-scheme: dark)").matches);
    var root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.dataset.theme = dark ? "dark" : "light";
  } catch {
    // Invalid preferences must not prevent the application from loading.
  }
})();
