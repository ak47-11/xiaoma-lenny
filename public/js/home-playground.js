(function () {
  document.documentElement.classList.add("motion-ready");
  const BEST_SCORE_KEY = "xiaoma_flow_catch_best_v1";
  const prefersReducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  initRevealMotion();
  initTiltCards();
  document.querySelectorAll("[data-flow-catch]").forEach(function (stage) {
    initFlowCatch(stage);
  });

  function initRevealMotion() {
    const nodes = Array.from(document.querySelectorAll("[data-reveal]"));
    if (!nodes.length) return;

    nodes.forEach(function (node, index) {
      node.style.transitionDelay = Math.min(index * 70, 420) + "ms";
    });

    if (prefersReducedMotion || typeof IntersectionObserver !== "function") {
      nodes.forEach(function (node) {
        node.classList.add("is-visible");
      });
      return;
    }

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      {
        threshold: 0.14,
        rootMargin: "0px 0px -42px 0px"
      }
    );

    nodes.forEach(function (node) {
      observer.observe(node);
    });
  }

  function initTiltCards() {
    if (prefersReducedMotion) return;
    if (
      typeof window.matchMedia === "function" &&
      !window.matchMedia("(hover: hover) and (pointer: fine)").matches
    ) {
      return;
    }

    document.querySelectorAll("[data-tilt-card]").forEach(function (card) {
      card.addEventListener("pointermove", function (event) {
        const rect = card.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const percentX = (event.clientX - rect.left) / rect.width - 0.5;
        const percentY = (event.clientY - rect.top) / rect.height - 0.5;
        const rotateX = (-percentY * 5.8).toFixed(2);
        const rotateY = (percentX * 7.2).toFixed(2);

        card.style.setProperty("--tilt-x", rotateX + "deg");
        card.style.setProperty("--tilt-y", rotateY + "deg");
      });

      card.addEventListener("pointerleave", function () {
        card.style.setProperty("--tilt-x", "0deg");
        card.style.setProperty("--tilt-y", "0deg");
      });
    });
  }

  function initFlowCatch(stage) {
    const canvas = stage.querySelector(".playground-canvas");
    const startBtn = stage.querySelector("[data-flow-start]");
    const scoreEl = stage.querySelector("[data-flow-score]");
    const bestEl = stage.querySelector("[data-flow-best]");
    const timeEl = stage.querySelector("[data-flow-time]");
    if (!canvas || !startBtn || !scoreEl || !bestEl || !timeEl) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const state = {
      width: 0,
      height: 0,
      running: false,
      roundSeconds: 15,
      score: 0,
      best: loadBestScore(),
      timeLeft: 15,
      startAt: 0,
      lastFrameAt: performance.now(),
      lastSpawnAt: 0,
      dots: [],
      particles: [],
      ambient: createAmbientParticles(20)
    };

    updateHud();
    resizeCanvas();
    requestAnimationFrame(loopFrame);

    window.addEventListener("resize", debounce(resizeCanvas, 120));

    startBtn.addEventListener("click", function () {
      if (state.running) return;
      startRound();
    });
    stage.addEventListener("pointerdown", function (event) {
      if (
        event.target instanceof Element &&
        event.target.closest(".playground-hud")
      ) {
        return;
      }
      if (!state.running) {
        startRound();
        return;
      }
      handlePointerHit(event);
    });

    stage.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (!state.running) startRound();
      }
    });

    stage.tabIndex = 0;

    function startRound() {
      state.running = true;
      state.score = 0;
      state.timeLeft = state.roundSeconds;
      state.startAt = performance.now();
      state.lastSpawnAt = state.startAt;
      state.dots = [];
      state.particles = [];
      stage.dataset.state = "running";
      startBtn.textContent = "挑战进行中...";
      startBtn.disabled = true;
      updateHud();
      spawnDot();
      spawnDot();
    }

    function finishRound() {
      state.running = false;
      state.timeLeft = 0;
      stage.dataset.state = "idle";
      startBtn.textContent = "再来一局";
      startBtn.disabled = false;

      if (state.score > state.best) {
        state.best = state.score;
        safeWriteBestScore(state.best);
        createBurst(state.width * 0.5, state.height * 0.5, 14, 0.95);
      }

      updateHud();
      stage.setAttribute(
        "aria-label",
        "本局结束，得分 " + state.score + "，最高 " + state.best + "。"
      );
    }

    function spawnDot() {
      const radius = randomRange(12, 20);
      const margin = radius + 8;
      const x = randomRange(margin, Math.max(margin, state.width - margin));
      const y = randomRange(margin, Math.max(margin, state.height - margin));
      const speed = randomRange(78, 152);
      const angle = randomRange(0, Math.PI * 2);
      state.dots.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: radius,
        ttl: randomRange(2.4, 3.8),
        hue: randomRange(192, 230),
        pulse: randomRange(0.6, 1.2)
      });
    }

    function handlePointerHit(event) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      let hitIndex = -1;
      for (let index = state.dots.length - 1; index >= 0; index -= 1) {
        const dot = state.dots[index];
        const dx = x - dot.x;
        const dy = y - dot.y;
        if (Math.sqrt(dx * dx + dy * dy) <= dot.r + 10) {
          hitIndex = index;
          break;
        }
      }

      if (hitIndex >= 0) {
        const hitDot = state.dots[hitIndex];
        state.dots.splice(hitIndex, 1);
        state.score += 1;
        createBurst(hitDot.x, hitDot.y, 10, 0.72);
        updateHud();
        if (state.running && state.dots.length < 3) {
          spawnDot();
        }
      } else {
        state.score = Math.max(0, state.score - 1);
        createBurst(x, y, 5, 0.32);
        updateHud();
      }
    }

    function createBurst(x, y, amount, alpha) {
      for (let index = 0; index < amount; index += 1) {
        const angle = randomRange(0, Math.PI * 2);
        const speed = randomRange(48, 148);
        const life = randomRange(0.34, 0.8);
        state.particles.push({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          ttl: life,
          life: life,
          size: randomRange(1.8, 4.6),
          alpha: alpha
        });
      }
    }

    function updateHud() {
      scoreEl.textContent = String(state.score);
      bestEl.textContent = String(state.best);
      timeEl.textContent = String(Math.max(0, Math.ceil(state.timeLeft)));
    }

    function resizeCanvas() {
      const rect = stage.getBoundingClientRect();
      state.width = Math.max(280, rect.width);
      state.height = Math.max(180, rect.height);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(state.width * dpr);
      canvas.height = Math.round(state.height * dpr);
      canvas.style.width = state.width + "px";
      canvas.style.height = state.height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function loopFrame(now) {
      const delta = Math.max(0.001, Math.min(0.04, (now - state.lastFrameAt) / 1000));
      state.lastFrameAt = now;

      updateAmbient(delta);
      updateDots(delta, now);
      updateParticles(delta);
      drawScene(now);

      requestAnimationFrame(loopFrame);
    }

    function updateAmbient(delta) {
      state.ambient.forEach(function (dot) {
        dot.x += dot.vx * delta;
        dot.y += dot.vy * delta;
        if (dot.x < -12) dot.x = state.width + 12;
        if (dot.x > state.width + 12) dot.x = -12;
        if (dot.y < -12) dot.y = state.height + 12;
        if (dot.y > state.height + 12) dot.y = -12;
      });
    }

    function updateDots(delta, now) {
      if (state.running) {
        state.timeLeft = state.roundSeconds - (now - state.startAt) / 1000;
        if (state.timeLeft <= 0) {
          finishRound();
        } else {
          if (now - state.lastSpawnAt > 560 && state.dots.length < 6) {
            spawnDot();
            state.lastSpawnAt = now;
          }
          updateHud();
        }
      }

      for (let index = state.dots.length - 1; index >= 0; index -= 1) {
        const dot = state.dots[index];
        dot.ttl -= delta;
        dot.x += dot.vx * delta;
        dot.y += dot.vy * delta;

        if (dot.x <= dot.r || dot.x >= state.width - dot.r) {
          dot.vx *= -1;
          dot.x = clamp(dot.x, dot.r, state.width - dot.r);
        }
        if (dot.y <= dot.r || dot.y >= state.height - dot.r) {
          dot.vy *= -1;
          dot.y = clamp(dot.y, dot.r, state.height - dot.r);
        }

        if (dot.ttl <= 0) {
          createBurst(dot.x, dot.y, 6, 0.22);
          state.dots.splice(index, 1);
        }
      }
    }

    function updateParticles(delta) {
      for (let index = state.particles.length - 1; index >= 0; index -= 1) {
        const particle = state.particles[index];
        particle.ttl -= delta;
        if (particle.ttl <= 0) {
          state.particles.splice(index, 1);
          continue;
        }
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.vx *= 0.98;
        particle.vy *= 0.98;
      }
    }

    function drawScene(now) {
      ctx.clearRect(0, 0, state.width, state.height);

      drawAmbient();
      drawDots(now);
      drawParticles();
    }

    function drawAmbient() {
      state.ambient.forEach(function (dot) {
        ctx.beginPath();
        ctx.fillStyle = "rgba(128, 192, 255, 0.16)";
        ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    function drawDots(now) {
      state.dots.forEach(function (dot) {
        const pulse = 1 + Math.sin(now * 0.005 * dot.pulse) * 0.1;
        const radius = dot.r * pulse;
        const glow = ctx.createRadialGradient(dot.x, dot.y, radius * 0.2, dot.x, dot.y, radius * 1.8);
        glow.addColorStop(0, "hsla(" + dot.hue + ", 98%, 70%, 0.96)");
        glow.addColorStop(0.6, "hsla(" + dot.hue + ", 98%, 64%, 0.38)");
        glow.addColorStop(1, "hsla(" + dot.hue + ", 98%, 64%, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, radius * 1.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "hsla(" + dot.hue + ", 100%, 76%, 0.98)";
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    function drawParticles() {
      state.particles.forEach(function (particle) {
        const life = clamp(particle.ttl / particle.life, 0, 1);
        ctx.fillStyle = "rgba(175, 220, 255," + (particle.alpha * life).toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * life, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  function createAmbientParticles(amount) {
    const list = [];
    for (let index = 0; index < amount; index += 1) {
      list.push({
        x: randomRange(0, 320),
        y: randomRange(0, 220),
        vx: randomRange(-8, 8),
        vy: randomRange(-8, 8),
        r: randomRange(1, 2.8)
      });
    }
    return list;
  }
  function loadBestScore() {
    let raw = 0;
    try {
      raw = Number(localStorage.getItem(BEST_SCORE_KEY) || "0");
    } catch (_error) {
      raw = 0;
    }
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  }

  function safeWriteBestScore(value) {
    try {
      localStorage.setItem(BEST_SCORE_KEY, String(Math.max(0, value)));
    } catch (_error) {
      // Ignore storage errors (private mode / blocked storage).
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function debounce(fn, delay) {
    let timer = null;
    return function () {
      const args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(null, args);
      }, delay);
    };
  }
})();


