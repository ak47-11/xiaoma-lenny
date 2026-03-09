(function () {
  var STORAGE_KEY = "xiaoma_apple_variant_v2";
  var DEFAULT_VARIANT = "b";

  function normalizeVariant(value) {
    return value === "b" ? "b" : "a";
  }

  function readStoredVariant() {
    try {
      return normalizeVariant(window.localStorage.getItem(STORAGE_KEY));
    } catch (_error) {
      return DEFAULT_VARIANT;
    }
  }

  function persistVariant(variant) {
    try {
      window.localStorage.setItem(STORAGE_KEY, variant);
    } catch (_error) {
      // Ignore storage errors in private mode.
    }
  }

  function applyVariant(variant) {
    var value = normalizeVariant(variant);
    if (document.body) {
      document.body.setAttribute("data-apple-variant", value);
    }
    document.documentElement.setAttribute("data-apple-variant", value);
    return value;
  }

  function getToggleLabel(variant) {
    if (variant === "b") return "高级版 · 切换标准";
    return "标准版 · 切换高级";
  }

  function findHostContainer() {
    var selectors = [
      ".hub-top .hub-nav",
      ".top .nav",
      ".top .top-links",
      ".top .actions",
      ".action-stack",
      ".hero-actions",
      ".nav"
    ];

    for (var index = 0; index < selectors.length; index += 1) {
      var node = document.querySelector(selectors[index]);
      if (node) return node;
    }
    return null;
  }

  function insertToggle(currentVariant) {
    if (document.getElementById("appleVariantToggle")) return;
    var host = findHostContainer();
    if (!host) return;

    var button = document.createElement("button");
    button.id = "appleVariantToggle";
    button.type = "button";
    button.className = "btn apple-variant-toggle";
    button.textContent = getToggleLabel(currentVariant);
    button.setAttribute("aria-label", "切换全站视觉风格");
    button.setAttribute("data-variant", currentVariant);

    if (host.classList.contains("top-links") || host.classList.contains("minor-links")) {
      button.className = "mini-link apple-variant-toggle";
    }

    button.addEventListener("click", function () {
      var nextVariant = button.getAttribute("data-variant") === "b" ? "a" : "b";
      var applied = applyVariant(nextVariant);
      persistVariant(applied);
      button.setAttribute("data-variant", applied);
      button.textContent = getToggleLabel(applied);
    });

    host.appendChild(button);
  }

  function boot() {
    var initialVariant = applyVariant(readStoredVariant());
    insertToggle(initialVariant);

    window.addEventListener("storage", function (event) {
      if (event.key !== STORAGE_KEY) return;
      var variant = applyVariant(normalizeVariant(event.newValue));
      var toggle = document.getElementById("appleVariantToggle");
      if (!toggle) return;
      toggle.setAttribute("data-variant", variant);
      toggle.textContent = getToggleLabel(variant);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
