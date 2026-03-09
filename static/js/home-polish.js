(function () {
  const prefersReducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  initCreatorSwitch();
  initMetricCountUp();

  function initCreatorSwitch() {
    const chips = Array.from(document.querySelectorAll("[data-creator-chip]"));
    if (!chips.length) return;

    const titleNode = document.querySelector("[data-creator-title]");
    const copyNode = document.querySelector("[data-creator-copy]");
    const primaryLink = document.querySelector("[data-creator-link]");
    const jumpLink = document.querySelector("[data-creator-jump]");
    const portals = Array.from(document.querySelectorAll("[data-portal]"));

    const creatorProfiles = {
      m: {
        title: "推荐你先进入 M 社区",
        copy: "如果你希望快速表达观点、跟进热点并获得即时反馈，M 是最轻量的起步方式。",
        linkHref: "/m.html",
        linkText: "进入 M 立即开始",
        jumpLabel: "M"
      },
      mi: {
        title: "推荐你先进入 Mi 社区",
        copy: "如果你正在做教程讲解、作品展示或项目演示视频，Mi 会更适合你建立持续曝光。",
        linkHref: "/mi.html",
        linkText: "进入 Mi 开始发视频",
        jumpLabel: "Mi"
      },
      lenny: {
        title: "推荐你先进入 Lenny 社区",
        copy: "如果你想沉淀可复用的教程和技术复盘，Lenny 更适合打造长期个人影响力。",
        linkHref: "/lenny.html",
        linkText: "进入 Lenny 开始写作",
        jumpLabel: "Lenny"
      }
    };

    const normalize = function (value) {
      return value && creatorProfiles[value] ? value : "m";
    };

    const setActiveCreator = function (key) {
      const activeKey = normalize(key);
      const profile = creatorProfiles[activeKey];

      chips.forEach(function (chip) {
        const selected = chip.dataset.creatorChip === activeKey;
        chip.classList.toggle("is-active", selected);
        chip.setAttribute("aria-selected", selected ? "true" : "false");
      });

      portals.forEach(function (portal) {
        portal.classList.toggle("is-focused", portal.dataset.portal === activeKey);
      });

      if (titleNode) titleNode.textContent = profile.title;
      if (copyNode) copyNode.textContent = profile.copy;

      if (primaryLink) {
        primaryLink.href = profile.linkHref;
        primaryLink.textContent = profile.linkText;
      }

      if (jumpLink) {
        jumpLink.href = "#portal-" + activeKey;
        jumpLink.textContent = "查看 " + profile.jumpLabel + " 入口详情";
      }
    };

    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        setActiveCreator(chip.dataset.creatorChip);
      });
    });

    portals.forEach(function (portal) {
      portal.addEventListener("mouseenter", function () {
        setActiveCreator(portal.dataset.portal);
      });
      portal.addEventListener("focusin", function () {
        setActiveCreator(portal.dataset.portal);
      });
    });

    if (jumpLink) {
      jumpLink.addEventListener("click", function (event) {
        const href = jumpLink.getAttribute("href");
        if (!href || href.charAt(0) !== "#") return;
        const target = document.querySelector(href);
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "start"
        });
        if (typeof history.replaceState === "function") {
          history.replaceState(null, "", href);
        }
      });
    }

    const hashKey = (window.location.hash || "").replace("#portal-", "");
    setActiveCreator(hashKey);
  }

  function initMetricCountUp() {
    const counters = Array.from(document.querySelectorAll("[data-count-target]"));
    if (!counters.length) return;

    counters.forEach(function (counter) {
      counter.textContent = "0";
    });

    if (prefersReducedMotion || typeof IntersectionObserver !== "function") {
      counters.forEach(function (counter) {
        counter.textContent = String(readTarget(counter));
      });
      return;
    }

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        });
      },
      {
        threshold: 0.55
      }
    );

    counters.forEach(function (counter) {
      observer.observe(counter);
    });
  }

  function animateCounter(node) {
    if (!(node instanceof HTMLElement)) return;
    if (node.dataset.countDone === "true") return;

    const target = readTarget(node);
    if (!Number.isFinite(target) || target < 1) {
      node.textContent = String(target);
      node.dataset.countDone = "true";
      return;
    }

    const startAt = performance.now();
    const duration = 760;

    const loop = function (now) {
      const progress = Math.min(1, (now - startAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(target * eased);
      node.textContent = String(value);

      if (progress < 1) {
        requestAnimationFrame(loop);
        return;
      }

      node.textContent = String(target);
      node.dataset.countDone = "true";
    };

    requestAnimationFrame(loop);
  }

  function readTarget(node) {
    return Number(node.getAttribute("data-count-target") || "0");
  }
})();
