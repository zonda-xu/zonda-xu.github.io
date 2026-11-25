"use strict";

(() => {
  const byId = id => document.getElementById(id);
  const canvas = byId("field");
  const shotMix = byId("shot-mix"), hitMix = byId("hit-mix");
  const rpm = byId("rpm"), damage = byId("damage");
  const configStatus = byId("config-status"), cadence = byId("cadence");
  const bank = byId("bank"), log = byId("log"), demo = byId("demo");
  const audio = new FeedbackAudio(available => {
    byId("audio-status").hidden = available;
    if (!available) byId("audio-status").textContent = "浏览器暂时无法播放音频。请允许此页面播放声音后再次试听。";
  });
  let target = new TrainingTarget();
  const scene = new TargetScene(canvas, target);
  const samples = new Map();
  let shots = 0, hits = 0, timer = 0, input = null, pointer = null;
  let lastShotAt = -Infinity;
  let previewTimer = 0;

  function updateSettings() {
    const validRate = rpm.validity.valid;
    const validDamage = damage.validity.valid && Number.isSafeInteger(damage.valueAsNumber);
    rpm.setAttribute("aria-invalid", String(!validRate));
    damage.setAttribute("aria-invalid", String(!validDamage));
    const messages = [];
    if (!validRate) messages.push("请输入 1 至 1800 之间的整数射速。");
    if (!validDamage) messages.push("单发伤害须为正整数。");
    configStatus.textContent = messages.join(" ");
    configStatus.hidden = messages.length === 0;
    cadence.textContent = validRate ? Math.round(60000 / rpm.valueAsNumber) + " ms / 发" : "";
    return validRate && validDamage;
  }

  function updateVitals() {
    byId("shield").textContent = target.shield;
    byId("health").textContent = target.health;
    byId("shield-bar").style.transform = "scaleX(" + target.shield / TrainingTarget.shieldCapacity + ")";
    byId("health-bar").style.transform = "scaleX(" + target.health / TrainingTarget.healthCapacity + ")";
    const state = byId("target-state");
    const kind = target.shield > 0 ? "shield" : target.health > 0 ? "body" : "down";
    state.textContent = { shield: "护盾在线", body: "本体暴露", down: "已击倒" }[kind];
    state.style.setProperty("--state-color", ImpactSound.cues[kind].color);
  }

  function record(event) {
    hits++;
    const cue = ImpactSound.cues[event.kind];
    const entry = document.createElement("li");
    entry.style.setProperty("--cue", cue.color);
    const label = document.createElement("strong");
    label.textContent = cue.label;
    const damage = [];
    if (event.shieldDamage) damage.push("护盾 −" + event.shieldDamage);
    if (event.healthDamage) damage.push("生命 −" + event.healthDamage);
    const details = document.createElement("small");
    details.textContent = damage.join(" · ");
    entry.append(label, details);
    log.append(entry);
    log.hidden = false;
    byId("empty-log").hidden = true;
    byId("count").textContent = hits + " 次命中";
    byId("announce").textContent = cue.label + "，" + details.textContent;
  }

  function stopFiring() {
    clearTimeout(timer);
    timer = 0;
    const captured = pointer;
    pointer = null;
    input = null;
    if (captured && canvas.hasPointerCapture(captured.id)) canvas.releasePointerCapture(captured.id);
    demo.classList.remove("running");
    byId("demo-label").textContent = "演示连击";
  }

  function clearPreview() {
    clearTimeout(previewTimer);
    for (const button of samples.values()) button.classList.remove("playing");
    audio.stopPreview();
  }

  function reset() {
    stopFiring();
    clearPreview();
    audio.reset();
    target = new TrainingTarget();
    shots = hits = 0;
    lastShotAt = -Infinity;
    scene.reset(target);
    updateVitals();
    log.replaceChildren();
    log.hidden = true;
    byId("empty-log").hidden = false;
    byId("count").textContent = "0 次命中";
    byId("announce").textContent = "训练目标已重置";
  }

  function fire(now) {
    let point = { x: scene.cx, y: scene.cy };
    if (pointer) {
      const box = canvas.getBoundingClientRect();
      point = { x: pointer.clientX - box.left, y: pointer.clientY - box.top };
      if (point.x < 0 || point.x >= box.width || point.y < 0 || point.y >= box.height) return;
    }
    const event = scene.contains(point) ? target.hit(damage.valueAsNumber, now) : null;
    audio.fire(event, shots % 3, { shot: shotMix.checked, hit: hitMix.checked });
    shots++;
    scene.impact(event, point, now);
    if (event) {
      record(event);
      updateVitals();
      if (event.kind === "down") stopFiring();
    }
  }

  // All inputs use the last actual shot as their clock. A delayed timer fires once.
  function tick() {
    clearTimeout(timer);
    const interval = 60000 / rpm.valueAsNumber;
    const now = performance.now();
    if (now >= lastShotAt + interval) {
      lastShotAt = now;
      fire(now);
    }
    if (input) timer = setTimeout(tick, Math.max(0, Math.ceil(lastShotAt + interval - performance.now())));
  }

  function startFiring(kind, pointerEvent) {
    stopFiring();
    if (!updateSettings()) return;
    clearPreview();
    audio.arm();
    input = kind;
    if (pointerEvent) {
      pointer = { id: pointerEvent.pointerId, clientX: pointerEvent.clientX, clientY: pointerEvent.clientY };
      canvas.setPointerCapture(pointer.id);
    }
    if (kind === "demo") {
      demo.classList.add("running");
      byId("demo-label").textContent = "停止演示";
    }
    tick();
  }

  // Draw min/max sample windows; every card uses its actual first PCM variant.
  function drawWave(element, pcm, color) {
    const columns = 38, height = 44;
    element.width = columns * 4; element.height = height;
    const c = element.getContext("2d");
    c.fillStyle = color;
    let peak = 0;
    for (const sample of pcm) peak = Math.max(peak, Math.abs(sample));
    for (let i = 0; i < columns; i++) {
      let min = 0, max = 0;
      const end = Math.floor((i+1)*pcm.length/columns);
      for (let j = Math.floor(i*pcm.length/columns); j < end; j++) {
        min = Math.min(min, pcm[j]); max = Math.max(max, pcm[j]);
      }
      c.fillRect(i*4, height/2 - (height/2-1)*max/peak, 2.5, Math.max(1.5, (max-min)*(height/2-1)/peak));
    }
  }

  for (const kind of ["shot", "shield", "break", "body", "down"]) {
    const cue = ImpactSound.cues[kind];
    const button = document.createElement("button");
    button.type = "button"; button.className = "sample"; button.dataset.cue = kind;
    button.style.setProperty("--cue", cue.color);
    button.setAttribute("aria-label", "试听" + cue.label + "，" + cue.detail);
    button.innerHTML = '<span class="play" aria-hidden="true"><i class="play-icon"></i></span>' +
      '<span class="sample-copy"><strong></strong><small></small></span>' +
      '<span class="wave" aria-hidden="true"><canvas></canvas><small></small></span>';
    button.querySelector("strong").textContent = cue.label;
    button.querySelector(".sample-copy small").textContent = cue.detail;
    button.querySelector(".wave small").textContent = Math.round(cue.seconds*1000) + " ms";
    drawWave(button.querySelector("canvas"), audio.samples.get(kind)[0], cue.color);
    button.addEventListener("click", () => {
      stopFiring();
      clearPreview();
      audio.reset();
      if (!audio.arm()) return;
      audio.preview(kind);
      button.classList.add("playing");
      previewTimer = setTimeout(() => button.classList.remove("playing"), 1000 * cue.seconds);
    });
    bank.append(button); samples.set(kind, button);
  }

  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    startFiring("pointer", event);
  });
  canvas.addEventListener("pointermove", event => {
    if (pointer && pointer.id === event.pointerId) {
      pointer.clientX = event.clientX; pointer.clientY = event.clientY;
    }
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
    canvas.addEventListener(name, event => {
      if (pointer && pointer.id === event.pointerId) stopFiring();
    });
  }
  document.addEventListener("keydown", event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing ||
        event.target === rpm || event.target === damage) return;
    if (event.code === "KeyR" && !event.repeat) { reset(); return; }
    if (event.target !== canvas && event.target !== document.body) return;
    if (event.code !== "Space" && event.code !== "Enter") return;
    event.preventDefault();
    if (!event.repeat) startFiring(event.code);
  });
  document.addEventListener("keyup", event => {
    if (input === event.code) stopFiring();
  });
  window.addEventListener("blur", stopFiring);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopFiring(); });
  byId("reset").addEventListener("click", reset);
  demo.addEventListener("click", () => {
    if (input === "demo") { stopFiring(); return; }
    if (!updateSettings()) return;
    reset();
    startFiring("demo");
  });
  byId("volume").addEventListener("input", event => {
    const value = Number(event.target.value);
    audio.setLevel(value / 100);
    byId("volume-value").textContent = value + "%";
  });
  for (const field of [rpm, damage]) {
    field.addEventListener("input", () => {
      clearTimeout(timer);
      if (updateSettings() && input) tick();
    });
  }
  updateSettings();
  updateVitals();
})();
