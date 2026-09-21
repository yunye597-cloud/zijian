(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const DEFAULT_TEXT =
    "示例文本：怎样最近？最近关于命之救世主X的舆论似乎爆发了，我感觉这有些不对劲。电视和报纸对温泉旅馆事件进行着各种夸张的报道，人们口耳相传着各种版本的命之救世主X，如果我不是当事人恐怕也要以为那家伙是个什么真正的暗黑邪神救世主了。而且据说检察院却有意重新调查此事——明明温泉旅馆的事件已经过去了大半年！我隐隐感到了不对劲，某种类似误导感的感受愈发强烈。难道那家伙真的还没死，并且在策划些什么？应当稍微调查一下啊，我想。";

  const PRESETS = {
    breeze: {
      name: "微风",
      description: "大范围轻拂文字，像窗帘般缓缓摆动，松手后慢慢复位。",
      values: { breakRate: 100, repulsion: 3, gravity: 0, drift: 12, rotation: 3, drag: 65, returnForce: 35, cohesion: 0, pointerMomentum: 8, damageRate: 0 },
    },
    print: {
      name: "印刷脱落",
      description: "局部部件轻微错位后停住，留下仍可辨认的空洞。",
      values: { radius: 35, breakRate: 40, repulsion: 15, gravity: 10, drift: 20, rotation: 20, drag: 80, returnForce: 0, cohesion: 10, pointerMomentum: 5, damageRate: 0 },
    },
    uncanny: {
      name: "文字恐怖谷",
      description: "碎片不飞远，而是互相靠拢成仍像文字的陌生团块。",
      values: { radius: 60, breakRate: 65, repulsion: 18, gravity: 5, drift: 35, rotation: 35, drag: 65, returnForce: 0, cohesion: 55, pointerMomentum: 10, damageRate: 0 },
    },
    water: {
      name: "水面",
      description: "手势带走附近部件；扰动结束后，文字像水面一样恢复。",
      values: { radius: 140, breakRate: 100, repulsion: 45, gravity: 0, drift: 8, rotation: 12, drag: 45, returnForce: 75, cohesion: 0, pointerMomentum: 75, damageRate: 0 },
    },
    collapse: {
      name: "坍塌",
      description: "部件失去排版支撑，在重力下坠落并停留于画布底部。",
      values: { radius: 70, breakRate: 85, repulsion: 5, gravity: 40, drift: 15, rotation: 45, drag: 15, returnForce: 0, cohesion: 15, pointerMomentum: 8, damageRate: 0 },
    },
    explode: {
      name: "爆炸",
      description: "高排斥和高旋转让触点附近的部件向四周快速飞散。",
      values: { radius: 90, breakRate: 100, repulsion: 100, gravity: 30, drift: 20, rotation: 90, drag: 10, returnForce: 0, cohesion: 0, pointerMomentum: 15, damageRate: 0 },
    },
    decay: {
      name: "腐烂 / 侵蚀",
      description: "反复摩擦会累积损伤；部件达到临界值后才脱落。",
      values: { radius: 45, breakRate: 40, repulsion: 8, gravity: 10, drift: 10, rotation: 15, drag: 75, returnForce: 0, cohesion: 5, pointerMomentum: 5, damageRate: 50 },
    },
  };

  const els = {
    undo: $("#undo-button"), exportBackground: $("#export-background-button"),
    input: $("#text-input"), count: $("#char-count"), compose: $("#compose-button"),
    export: $("#export-button"), reset: $("#reset-button"), pause: $("#pause-button"),
    stage: $("#stage"), canvasShell: $("#canvas-shell"), empty: $("#empty-state"),
    hint: $("#canvas-hint"), state: $("#canvas-state"), statGlyphs: $("#stat-glyphs"),
    statParts: $("#stat-parts"), statFallback: $("#stat-fallback"),
    analysisNote: $("#analysis-note"), presetDescription: $("#preset-description"),
  };

  const layoutInputs = ["layout-width", "layout-height", "font-size", "line-height", "letter-spacing", "fragmentation"];
  const physicsInputs = ["radius", "break-rate", "repulsion", "gravity", "drift", "rotation", "drag", "return-force", "cohesion", "pointer-momentum", "damage-rate"];
  const controls = Object.fromEntries([...layoutInputs, ...physicsInputs].map((id) => [id, document.getElementById(id)]));

  const state = {
    fontRevision: 0, fontLoading: false, renderedFont: null,
    history: [], pointerId: null, generating: false, backgroundImage: null, backgroundRequest: 0,
    particles: [], width: 720, height: 640, dpr: 1, viewScale: 1,
    paused: false, generated: false, lastTime: 0, elapsed: 0, raf: 0,
    pointerDown: false, pointer: null, lastBurst: 0, eventCounter: 0,
    hintTimer: 0, resizeObserver: null, activePreset: "print", applyingPreset: false,
  };

  const ctx = els.stage.getContext("2d");
  const recording = window.createCanvasRecorder(els.stage, (busy) => {
    // Preserve recording dimensions; physics, gestures, colors and backgrounds stay live.
    els.compose.disabled = busy || state.generating || state.fontLoading;
    els.compose.title = busy ? "请先停止录制，再重新生成画布" : "";
    if (!busy) resizeCanvas();
  });

  const defaultFont = '"Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", serif';
  const fonts = new Map([
    ["default", { family: defaultFont }],
    ["song", { family: '"SimSun", "Songti SC", "STSong", "Noto Serif CJK SC", serif' }],
    ["sans", { family: '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Droid Sans Fallback", sans-serif' }],
    ["kai", { family: '"KaiTi", "STKaiti", "Kaiti SC", "DFKai-SB", ' + defaultFont }],
    ["fangsong", { family: '"FangSong", "STFangsong", ' + defaultFont }],
  ]);
  const fontSelect = $("#font-family");
  const fontFile = $("#font-file");
  let fontSequence = 0;
  function fontMessage(message) {
    $("#font-status").textContent = message;
    $("#font-status").hidden = !message;
  }
  function fontChanged() {
    state.fontRevision += 1;
    state.fontLoading = false;
    els.compose.disabled = state.generating || recording.busy;
    fontMessage("字体已改动，重新生成画布后生效。");
  }
  fontSelect.addEventListener("change", fontChanged);
  $("#upload-font").addEventListener("click", () => fontFile.click());
  if (typeof FontFace !== "function" || !document.fonts) {
    $("#upload-font").disabled = true;
    fontMessage("当前浏览器不支持本地字体加载，仍可选择系统字体。");
  }
  fontFile.addEventListener("change", async () => {
    const file = fontFile.files[0];
    fontFile.value = ""; // Permit choosing the same file again, including after failure.
    if (!file) return;
    const revision = ++state.fontRevision;
    state.fontLoading = false;
    els.compose.disabled = state.generating || recording.busy;
    if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) {
      fontMessage("请选择 TTF、OTF、WOFF 或 WOFF2 字体文件。"); return;
    }
    if (!file.size || file.size > 50 * 1024 * 1024) {
      fontMessage("请选择有效且不超过 50 MB 的字体文件。"); return;
    }
    state.fontLoading = true;
    els.compose.disabled = true;
    fontMessage("正在本地加载字体…");
    try {
      const buffer = await file.arrayBuffer();
      if (revision !== state.fontRevision) return;
      // The filename is only a label, never CSS. Every face gets a unique internal name.
      const id = `local-${++fontSequence}`;
      const internalName = `ZijianLocal${fontSequence}`;
      const face = new FontFace(internalName, buffer, { weight: "500" });
      await face.load();
      await face.loaded;
      if (revision !== state.fontRevision) return;
      if (face.status !== "loaded") throw new Error("Font not ready");
      document.fonts.add(face);
      const baseName = file.name.replace(/\.(ttf|otf|woff2?)$/i, "");
      let label = baseName, suffix = 2;
      const labels = new Set(Array.from(fontSelect.options, option => option.textContent));
      while (labels.has(label)) label = `${baseName} (${suffix++})`;
      fonts.set(id, { family: `"${internalName}", ${defaultFont}`, face });
      fontSelect.add(new Option(label, id));
      fontSelect.value = id;
      fontMessage("字体已改动，重新生成画布后生效。");
    } catch {
      if (revision === state.fontRevision) fontMessage("字体无法加载，请换一个有效的字体文件。原画布和已选字体仍保留。");
    } finally {
      if (revision === state.fontRevision) {
        state.fontLoading = false;
        els.compose.disabled = state.generating || recording.busy;
      }
    }
  });

  function updateCharacterCount() {
    const count = Array.from(els.input.value).length;
    els.count.textContent = `${count} / 2000`;
    els.count.classList.toggle("is-near-limit", count > 1800);
  }

  function setRangeProgress(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const value = Number(input.value);
    input.style.setProperty("--value", `${((value - min) / (max - min)) * 100}%`);
  }

  function fragmentationName(value) {
    if (value === 50) return "部件 / 笔画";
    if (value < 20) return "字符";
    if (value < 50) return "部件";
    if (value < 78) return "笔画";
    return "碎屑";
  }

  function formatControl(input) {
    const output = document.querySelector(`output[for="${input.id}"]`);
    if (output) output.textContent = input.id === "fragmentation" ? fragmentationName(Number(input.value)) : input.value;
    setRangeProgress(input);
  }

  function updateAllControls() {
    Object.values(controls).forEach(formatControl);
  }

  function getLayout() {
    return {
      width: Number(controls["layout-width"].value), height: Number(controls["layout-height"].value),
      fontSize: Number(controls["font-size"].value), lineHeight: Number(controls["line-height"].value),
      letterSpacing: Number(controls["letter-spacing"].value), fragmentation: Number(controls.fragmentation.value),
      fontId: fontSelect.value, fontFamily: fonts.get(fontSelect.value).family,
    };
  }

  function getPhysics() {
    return {
      // Keep even the opposite corner inside the wind's falloff, independent of the slider.
      radius: state.activePreset === "breeze" ? Math.hypot(state.width, state.height) * 1.5 : Number(controls.radius.value), breakRate: Number(controls["break-rate"].value),
      repulsion: Number(controls.repulsion.value), gravity: Number(controls.gravity.value),
      drift: Number(controls.drift.value), rotation: Number(controls.rotation.value),
      drag: Number(controls.drag.value), returnForce: Number(controls["return-force"].value),
      cohesion: Number(controls.cohesion.value), pointerMomentum: Number(controls["pointer-momentum"].value),
      damageRate: Number(controls["damage-rate"].value),
    };
  }

  function keyFromPhysicsName(name) {
    return { breakRate: "break-rate", returnForce: "return-force", pointerMomentum: "pointer-momentum", damageRate: "damage-rate" }[name] || name;
  }

  function applyPreset(key) {
    const preset = PRESETS[key];
    if (!preset) return;
    state.applyingPreset = true;
    state.activePreset = key;
    controls.radius.disabled = key === "breeze";
    controls.radius.closest("label").classList.toggle("is-disabled", key === "breeze");
    controls.radius.closest("label").title = key === "breeze" ? "微风范围随当前画布尺寸自动调整，覆盖整张纸" : "鼠标或手指影响多大范围";
    for (const [name, value] of Object.entries(preset.values)) {
      const input = controls[keyFromPhysicsName(name)];
      input.value = value;
      formatControl(input);
    }
    if (key === "breeze") {
      controls.radius.value = controls.radius.max;
      formatControl(controls.radius);
      document.querySelector('output[for="radius"]').textContent = "自动";
    }
    $$(".effect-preset").forEach((button) => button.classList.toggle("is-active", button.dataset.effect === key));
    els.presetDescription.textContent = preset.description;
    state.applyingPreset = false;
  }

  function resizeCanvas() {
    if (!state.generated) return;
    const availableWidth = els.canvasShell.clientWidth;
    const availableHeight = els.canvasShell.clientHeight;
    state.viewScale = Math.max(0.1, Math.min(availableWidth / state.width, availableHeight / state.height));
    const cssWidth = state.width * state.viewScale;
    const cssHeight = state.height * state.viewScale;
    if (!recording.busy) state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    els.stage.style.width = `${cssWidth}px`;
    els.stage.style.height = `${cssHeight}px`;
    els.stage.style.position = "absolute";
    els.stage.style.left = `${(availableWidth - cssWidth) / 2}px`;
    els.stage.style.top = `${(availableHeight - cssHeight) / 2}px`;
    if (!recording.busy) {
      els.stage.width = Math.round(state.width * state.dpr);
      els.stage.height = Math.round(state.height * state.dpr);
    }
    draw();
  }

  function layoutGlyphs(text, settings) {
    const measureCanvas = document.createElement("canvas");
    const measure = measureCanvas.getContext("2d");
    const font = `500 ${settings.fontSize}px ${settings.fontFamily}`;
    measure.font = font;
    measure.textBaseline = "alphabetic";
    const padding = Math.max(26, settings.fontSize * 1.15);
    const lineAdvance = settings.fontSize * settings.lineHeight;
    const baselineOffset = settings.fontSize * 0.88;
    let x = padding;
    let y = padding + baselineOffset;
    let clipped = false;
    const glyphs = [];

    for (const char of Array.from(text)) {
      if (char === "\r") continue;
      if (char === "\n") {
        x = padding;
        y += lineAdvance;
        if (y + settings.fontSize * 0.3 > settings.height - padding) { clipped = true; break; }
        continue;
      }
      const metrics = measure.measureText(char);
      const width = Math.max(metrics.width, settings.fontSize * (char.trim() ? 0.55 : 0.5));
      const advance = width + settings.letterSpacing;
      if (x + width > settings.width - padding && char.trim()) { x = padding; y += lineAdvance; }
      if (y + settings.fontSize * 0.3 > settings.height - padding) { clipped = true; break; }
      if (char.trim()) glyphs.push({ char, x, y, font, fontSize: settings.fontSize, width });
      x += advance;
    }
    return { glyphs, clipped };
  }

  function boundsForPixels(pixels, width, height) {
    let minX = width, minY = height, maxX = 0, maxY = 0;
    for (const index of pixels) {
      const x = index % width;
      const y = Math.floor(index / width);
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return { pixels, minX, minY, maxX, maxY };
  }

  function findConnectedComponents(data, width, height, threshold) {
    const visited = new Uint8Array(width * height);
    const components = [];
    const neighbors = [-1, 1, -width, width, -width - 1, -width + 1, width - 1, width + 1];
    for (let index = 0; index < width * height; index += 1) {
      if (visited[index] || data[index * 4 + 3] < threshold) continue;
      const stack = [index];
      const pixels = [];
      visited[index] = 1;
      while (stack.length) {
        const current = stack.pop();
        const px = current % width;
        const py = Math.floor(current / width);
        pixels.push(current);
        for (const offset of neighbors) {
          const next = current + offset;
          if (next < 0 || next >= width * height || visited[next]) continue;
          const nx = next % width;
          const ny = Math.floor(next / width);
          if (Math.abs(nx - px) > 1 || Math.abs(ny - py) > 1) continue;
          if (data[next * 4 + 3] >= threshold) { visited[next] = 1; stack.push(next); }
        }
      }
      if (pixels.length >= 5) components.push(boundsForPixels(pixels, width, height));
    }
    components.sort((a, b) => b.pixels.length - a.pixels.length);
    return components;
  }

  function mergeTinyComponents(components, width, height) {
    if (!components.length) return [];
    const mainArea = components[0].pixels.length;
    const stable = components.filter((part) => part.pixels.length >= Math.max(8, mainArea * 0.008));
    const tiny = components.filter((part) => !stable.includes(part));
    if (!stable.length) stable.push(components[0]);
    if (tiny.length) stable[0] = boundsForPixels(stable[0].pixels.concat(tiny.flatMap((part) => part.pixels)), width, height);
    return stable;
  }

  function splitComponentsIntoCells(components, width, height, fontSize, fragmentation, scale) {
    const factor = (fragmentation - 50) / 50;
    const cellSize = Math.max(8, Math.round(fontSize * scale * (0.62 - factor * 0.4)));
    const groups = [];
    for (const component of components) {
      const cells = new Map();
      for (const pixel of component.pixels) {
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        const key = `${Math.floor((x - component.minX) / cellSize)}:${Math.floor((y - component.minY) / cellSize)}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(pixel);
      }
      const substantial = [];
      const crumbs = [];
      for (const pixels of cells.values()) {
        if (pixels.length >= 5) substantial.push(pixels);
        else crumbs.push(...pixels);
      }
      if (!substantial.length) substantial.push(component.pixels);
      if (crumbs.length) substantial[0] = substantial[0].concat(crumbs);
      groups.push(...substantial.map((pixels) => boundsForPixels(pixels, width, height)));
    }
    groups.sort((a, b) => b.pixels.length - a.pixels.length);
    if (groups.length <= 24) return groups;
    const kept = groups.slice(0, 24);
    kept[0] = boundsForPixels(kept[0].pixels.concat(groups.slice(24).flatMap((part) => part.pixels)), width, height);
    return kept;
  }

  function createPiece(group, image, imageWidth, scale, pad, baseline, glyph, index, fallback) {
    const cropWidth = group.maxX - group.minX + 1;
    const cropHeight = group.maxY - group.minY + 1;
    const pieceCanvas = document.createElement("canvas");
    pieceCanvas.width = cropWidth;
    pieceCanvas.height = cropHeight;
    const pieceCtx = pieceCanvas.getContext("2d");
    const pieceData = pieceCtx.createImageData(cropWidth, cropHeight);
    for (const pixelIndex of group.pixels) {
      const px = pixelIndex % imageWidth;
      const py = Math.floor(pixelIndex / imageWidth);
      const source = pixelIndex * 4;
      const target = ((py - group.minY) * cropWidth + (px - group.minX)) * 4;
      pieceData.data[target] = 37; pieceData.data[target + 1] = 35; pieceData.data[target + 2] = 31;
      pieceData.data[target + 3] = image.data[source + 3];
    }
    pieceCtx.putImageData(pieceData, 0, 0);
    const localX = group.minX / scale - pad;
    const localY = group.minY / scale - baseline;
    const drawWidth = cropWidth / scale;
    const drawHeight = cropHeight / scale;
    const originX = glyph.x + localX + drawWidth / 2;
    const originY = glyph.y + localY + drawHeight / 2;
    return {
      image: pieceCanvas, x: originX, y: originY, originX, originY, width: drawWidth, height: drawHeight,
      vx: 0, vy: 0, angle: 0, angularVelocity: 0, active: false, activeAge: 0, damage: 0, fallback, neighbors: [],
      seed: ((glyph.char.codePointAt(0) || 1) * 31 + index * 71 + Math.round(originX * 3)) % 1009,
    };
  }

  function splitGlyph(glyph, fragmentation) {
    const scale = 2;
    const pad = Math.ceil(glyph.fontSize * 0.42);
    const width = Math.ceil((glyph.width + pad * 2) * scale);
    const height = Math.ceil((glyph.fontSize * 1.55 + pad * 2) * scale);
    const offscreen = document.createElement("canvas");
    offscreen.width = width;
    offscreen.height = height;
    const off = offscreen.getContext("2d", { willReadFrequently: true });
    off.scale(scale, scale);
    off.fillStyle = "#25231f";
    off.font = glyph.font;
    off.textBaseline = "alphabetic";
    const baseline = pad + glyph.fontSize;
    off.fillText(glyph.char, pad, baseline);
    off.setTransform(1, 0, 0, 1, 0, 0);
    const image = off.getImageData(0, 0, width, height);
    const connected = mergeTinyComponents(findConnectedComponents(image.data, width, height, 42), width, height);
    if (!connected.length) return { pieces: [], fallback: true };
    let groups;
    let fallback = false;
    if (fragmentation < 20) {
      groups = [boundsForPixels(connected.flatMap((part) => part.pixels), width, height)];
    } else if (fragmentation < 50) {
      groups = connected.slice(0, 12);
      fallback = groups.length === 1;
    } else {
      groups = splitComponentsIntoCells(connected, width, height, glyph.fontSize, fragmentation, scale);
    }
    return { fallback, pieces: groups.map((group, index) => createPiece(group, image, width, scale, pad, baseline, glyph, index, fallback)) };
  }

  function assignNeighbors(particles) {
    const cellSize = 58;
    const buckets = new Map();
    particles.forEach((particle, index) => {
      const key = `${Math.floor(particle.originX / cellSize)}:${Math.floor(particle.originY / cellSize)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(index);
    });
    particles.forEach((particle) => {
      const cx = Math.floor(particle.originX / cellSize);
      const cy = Math.floor(particle.originY / cellSize);
      const nearby = [];
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          for (const index of buckets.get(`${cx + ox}:${cy + oy}`) || []) {
            const candidate = particles[index];
            if (candidate === particle) continue;
            const distance = Math.hypot(candidate.originX - particle.originX, candidate.originY - particle.originY);
            if (distance < 72) nearby.push({ index, distance });
          }
        }
      }
      particle.neighbors = nearby.sort((a, b) => a.distance - b.distance).slice(0, 6).map((item) => item.index);
    });
  }

  function setGenerating(isGenerating) {
    recording.setAvailable(!isGenerating && state.generated);
    state.generating = isGenerating;
    els.compose.classList.toggle("is-working", isGenerating);
    els.compose.querySelector("span:first-child").textContent = isGenerating ? "正在分析字形…" : "生成画布";
    els.compose.disabled = isGenerating || state.fontLoading || recording.busy;
  }

  function waitForPaint() { return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); }

  async function compose() {
    if (recording.busy || state.generating || state.fontLoading) return;
    if (!els.input.value.trim()) { els.input.focus(); els.state.textContent = "请输入文字"; return; }
    endPointer();
    setGenerating(true);
    const revision = state.fontRevision;
    const settings = getLayout();
    const text = els.input.value;
    try {
      els.state.textContent = "正在准备字体";
      const selectedFont = fonts.get(settings.fontId);
      if (selectedFont.face) await selectedFont.face.loaded;
      if (document.fonts) await document.fonts.load(`500 ${settings.fontSize}px ${settings.fontFamily}`, text);
      if (revision !== state.fontRevision) return;
      els.state.textContent = "正在分析字形";
      await waitForPaint();
      if (revision !== state.fontRevision) return;
      const laidOut = layoutGlyphs(text, settings);
      const particles = [];
      let fallbackCount = 0;
      for (let i = 0; i < laidOut.glyphs.length; i += 1) {
        const result = splitGlyph(laidOut.glyphs[i], settings.fragmentation);
        if (result.fallback) fallbackCount += 1;
        particles.push(...result.pieces);
        if (i % 16 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
        if (revision !== state.fontRevision) return;
      }
      assignNeighbors(particles);
      Object.assign(state, { width: settings.width, height: settings.height, particles, generated: true, paused: false, lastTime: 0, elapsed: 0 });
      state.renderedFont = settings.fontId;
      fontMessage("");
      els.canvasShell.classList.remove("is-empty");
      els.empty.hidden = true;
      els.hint.hidden = false;
      els.hint.style.opacity = "1";
      clearTimeout(state.hintTimer);
      state.hintTimer = setTimeout(() => { els.hint.style.opacity = "0"; }, 4800);
      clearHistory();
      recolorParticles();
      updateBackgroundNote();
      els.exportBackground.disabled = false;
      els.export.disabled = false;
      els.reset.disabled = false;
      els.pause.disabled = false;
      els.pause.innerHTML = '<span aria-hidden="true">Ⅱ</span> 暂停';
      els.statGlyphs.textContent = laidOut.glyphs.length.toLocaleString("zh-CN");
      els.statParts.textContent = particles.length.toLocaleString("zh-CN");
      els.statFallback.textContent = fallbackCount.toLocaleString("zh-CN");
      els.state.textContent = "可以触碰";
      const clippedMessage = laidOut.clipped ? " 版面已满，超出文字未绘制。" : "";
      els.analysisNote.textContent = `当前按“${fragmentationName(settings.fragmentation)}”尺度生成 ${particles.length} 个碎片；${fallbackCount} 个字采用整字降级。${clippedMessage}`;
      resizeCanvas();
      cancelAnimationFrame(state.raf);
      state.raf = requestAnimationFrame(animate);
    } catch {
      els.state.textContent = "生成未完成";
      if (revision === state.fontRevision) fontMessage("字体或字形生成失败，请换一种字体后重试。原画布仍保留。");
    } finally {
      if (revision !== state.fontRevision) els.state.textContent = "字体已改动，请重新生成";
      setGenerating(false);
    }
  }

  function resetParticles() {
    endPointer();
    clearHistory();
    for (const p of state.particles) {
      Object.assign(p, { x: p.originX, y: p.originY, vx: 0, vy: 0, angle: 0, angularVelocity: 0, active: false, activeAge: 0, damage: 0 });
    }
    state.paused = false;
    els.pause.innerHTML = '<span aria-hidden="true">Ⅱ</span> 暂停';
    els.state.textContent = "已经复位";
    draw();
  }

  function pointerPosition(event) {
    const rect = els.stage.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / state.viewScale, y: (event.clientY - rect.top) / state.viewScale };
  }

  function seededRandom(seed, salt) {
    const value = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  function burstAt(x, y, intensity = 1, pointerVelocity = { x: 0, y: 0 }) {
    if (!state.generated) return;
    const physics = getPhysics();
    if (state.activePreset === "breeze") {
      for (const p of state.particles) {
        if (Math.hypot(p.originX - x, p.originY - y) <= physics.radius && seededRandom(p.seed, 1) <= physics.breakRate / 100) p.active = true;
      }
      els.state.textContent = "微风轻拂";
      els.hint.style.opacity = "0";
      return;
    }
    const salt = ++state.eventCounter;
    let affected = 0;
    for (const p of state.particles) {
      const dx = p.x - x;
      const dy = p.y - y;
      const distance = Math.max(5, Math.hypot(dx, dy));
      if (distance > physics.radius) continue;
      const falloff = 1 - distance / physics.radius;
      const chance = (physics.breakRate / 100) * (0.5 + falloff * 0.5);
      if (!p.active && physics.damageRate > 0) {
        p.damage += (physics.damageRate / 100) * intensity * (0.35 + falloff * 0.65);
        if (p.damage < 1 || seededRandom(p.seed, salt) > chance) continue;
      } else if (!p.active && seededRandom(p.seed, salt) > chance) continue;
      const jitter = (seededRandom(p.seed + 17, salt) - 0.5) * 0.7;
      const angle = Math.atan2(dy, dx) + jitter;
      const impulse = (physics.repulsion * 5.5 + 4) * falloff * intensity;
      const driftKick = physics.drift * (seededRandom(p.seed + 31, salt) - 0.5) * 1.8;
      const momentumScale = (physics.pointerMomentum / 100) * 0.55 * falloff;
      if (!p.active) p.activeAge = 0;
      p.active = true;
      p.vx += Math.cos(angle) * impulse + driftKick + pointerVelocity.x * momentumScale;
      p.vy += Math.sin(angle) * impulse + driftKick * 0.55 + pointerVelocity.y * momentumScale;
      p.angularVelocity += (seededRandom(p.seed + 7, salt) > 0.5 ? 1 : -1) * (physics.rotation / 100) * 10 * (0.3 + falloff);
      affected += 1;
    }
    if (affected) { els.state.textContent = `${affected} 个部件脱离`; els.hint.style.opacity = "0"; }
    else if (physics.damageRate > 0) els.state.textContent = "损伤正在累积";
  }

  function update(delta) {
    const physics = getPhysics();
    state.elapsed += delta;
    const velocityRetention = Math.exp(-(0.12 + physics.drag * 0.09) * delta);
    const angularRetention = Math.exp(-(0.25 + physics.drag * 0.07) * delta);
    const returnStrength = physics.returnForce * 0.115;
    const cohesionStrength = physics.cohesion * 0.028;
    for (const p of state.particles) {
      if (!p.active) continue;
      p.activeAge += delta;
      if (physics.returnForce > 0) {
        p.vx += (p.originX - p.x) * returnStrength * delta;
        p.vy += (p.originY - p.y) * returnStrength * delta;
        p.angularVelocity += -p.angle * returnStrength * 0.28 * delta;
      }
      if (physics.cohesion > 0) {
        for (const neighborIndex of p.neighbors) {
          const neighbor = state.particles[neighborIndex];
          if (!neighbor || !neighbor.active) continue;
          const nx = neighbor.x - p.x;
          const ny = neighbor.y - p.y;
          const distance = Math.max(7, Math.hypot(nx, ny));
          if (distance < 110) {
            const force = cohesionStrength * Math.min(distance, 45);
            p.vx += (nx / distance) * force * delta * 18;
            p.vy += (ny / distance) * force * delta * 18;
          }
        }
      }
      if (state.activePreset === "breeze" && state.pointerDown && state.pointer) {
        const distance = Math.hypot(p.originX - state.pointer.x, p.originY - state.pointer.y);
        const influence = Math.max(0, 1 - distance / physics.radius);
        const wave = state.elapsed * 1.7 - p.originY / 150 + p.originX / 360;
        p.vx += (Math.sin(wave) * physics.drift * 5 + physics.repulsion * 4) * influence * delta;
        p.vy += Math.cos(wave * 0.8) * physics.drift * 1.5 * influence * delta;
        p.angularVelocity += Math.sin(wave) * physics.rotation * 0.035 * influence * delta;
        p.vx += (state.pointer.vx || 0) * physics.pointerMomentum * 0.002 * influence * delta;
      }
      const breezeDrift = state.activePreset === "breeze" ? 0 : physics.drift;
      const driftPhase = state.elapsed * (1.2 + (p.seed % 7) * 0.08) + p.seed;
      p.vx += Math.sin(driftPhase) * breezeDrift * 0.85 * delta;
      p.vy += (Math.cos(driftPhase * 0.79) * breezeDrift * 0.65 + physics.gravity * 5.2) * delta;
      p.vx *= velocityRetention; p.vy *= velocityRetention; p.angularVelocity *= angularRetention;
      p.x += p.vx * delta; p.y += p.vy * delta; p.angle += p.angularVelocity * delta;
      const halfW = Math.max(2, p.width / 2);
      const halfH = Math.max(2, p.height / 2);
      if (p.x < halfW) { p.x = halfW; p.vx = Math.abs(p.vx) * 0.42; }
      else if (p.x > state.width - halfW) { p.x = state.width - halfW; p.vx = -Math.abs(p.vx) * 0.42; }
      if (p.y < halfH) { p.y = halfH; p.vy = Math.abs(p.vy) * 0.38; }
      else if (p.y > state.height - halfH) {
        p.y = state.height - halfH;
        p.vy = Math.abs(p.vy) < 28 || physics.drag > 55 ? 0 : -Math.abs(p.vy) * 0.25;
        p.vx *= 0.82; p.angularVelocity *= 0.72;
      }
      if (physics.returnForce > 0) {
        const homeDistance = Math.hypot(p.x - p.originX, p.y - p.originY);
        const speed = Math.hypot(p.vx, p.vy);
        if (!(state.activePreset === "breeze" && state.pointerDown) && homeDistance < 0.65 && speed < 2.2 && Math.abs(p.angle) < 0.035) {
          Object.assign(p, { x: p.originX, y: p.originY, vx: 0, vy: 0, angle: 0, angularVelocity: 0, active: false, activeAge: 0, damage: 0 });
        }
      } else if (physics.drag >= 60 && p.activeAge > 0.45 && Math.hypot(p.vx, p.vy) < 8) {
        p.vx = 0;
        p.vy = 0;
        p.angularVelocity = 0;
        p.active = false;
      }
    }
  }

  function drawParticles(target) {
    for (const p of state.particles) {
      target.save();
      target.translate(p.x, p.y);
      target.rotate(p.angle);
      target.drawImage(p.image, -p.width / 2, -p.height / 2, p.width, p.height);
      target.restore();
    }
  }

  function draw() {
    if (!state.generated) return;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, state.width, state.height);
    drawBackground(ctx);
    drawParticles(ctx);
  }

  function exportPng(withBackground = false) {
    if (!state.generated) return;
    const exportScale = 2;
    const output = document.createElement("canvas");
    output.width = state.width * exportScale;
    output.height = state.height * exportScale;
    const outputContext = output.getContext("2d");
    outputContext.scale(exportScale, exportScale);
    if (withBackground) drawBackground(outputContext);
    drawParticles(outputContext);
    output.toBlob((blob) => {
      if (!blob) { els.state.textContent = "导出失败，请重试"; return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      link.href = url;
      link.download = `汉字崩解-${withBackground ? "带背景" : "透明"}-${timestamp}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      els.state.textContent = withBackground ? "带背景 PNG 已导出" : "透明 PNG 已导出";
    }, "image/png");
  }

  function animate(time) {
    if (!state.generated) return;
    if (!state.lastTime) state.lastTime = time;
    const delta = Math.min((time - state.lastTime) / 1000, 0.032);
    state.lastTime = time;
    if (!state.paused) update(delta);
    draw();
    state.raf = requestAnimationFrame(animate);
  }

  function togglePause() {
    state.paused = !state.paused;
    els.pause.innerHTML = state.paused ? '<span aria-hidden="true">▶</span> 继续' : '<span aria-hidden="true">Ⅱ</span> 暂停';
    els.state.textContent = state.paused ? "运动已暂停" : "可以触碰";
  }


  const motionKeys = ["x", "y", "vx", "vy", "angle", "angularVelocity", "active", "activeAge", "damage"];
  function clearHistory() {
    state.history = [];
    els.undo.disabled = true;
  }
  function saveGesture() {
    state.history.push({ particles: state.particles.map(p => motionKeys.map(key => p[key])), elapsed: state.elapsed, eventCounter: state.eventCounter });
    if (state.history.length > 20) state.history.shift();
    els.undo.disabled = false;
  }
  function undoGesture() {
    if (state.generating) return;
    const snapshot = state.history.pop();
    if (!snapshot) return;
    endPointer();
    state.particles.forEach((p, i) => motionKeys.forEach((key, k) => { p[key] = snapshot.particles[i][k]; }));
    state.elapsed = snapshot.elapsed;
    state.eventCounter = snapshot.eventCounter;
    // Freeze the restored frame so ongoing physics cannot immediately change it.
    state.paused = true;
    state.lastTime = 0;
    els.pause.innerHTML = '<span aria-hidden="true">▶</span> 继续';
    els.undo.disabled = state.history.length === 0;
    els.state.textContent = "已撤回，点击继续可恢复运动";
    draw();
  }
  function recolorParticles() {
    for (const p of state.particles) {
      const c = p.image.getContext("2d");
      c.save();
      c.globalCompositeOperation = "source-in";
      c.fillStyle = $("#text-color").value;
      c.fillRect(0, 0, p.image.width, p.image.height);
      c.restore();
    }
    draw();
  }
  function drawBackground(target) {
    target.fillStyle = $("#background-color").value;
    target.fillRect(0, 0, state.width, state.height);
    const img = state.backgroundImage;
    if (!img) return;
    const ratios = [state.width / img.width, state.height / img.height];
    const scale = $("#background-fit").value === "cover" ? Math.max(...ratios) : Math.min(...ratios);
    const w = img.width * scale, h = img.height * scale;
    target.drawImage(img, (state.width - w) / 2, (state.height - h) / 2, w, h);
  }
  function updateBackgroundNote() {
    const img = state.backgroundImage;
    if (!img) { $("#background-note").textContent = "纯色背景；图片会等比例适配，不会拉伸。"; return; }
    const w = state.generated ? state.width : getLayout().width;
    const h = state.generated ? state.height : getLayout().height;
    const fit = $("#background-fit").value;
    const mismatch = Math.abs(img.width / img.height - w / h) > 0.01;
    const scale = fit === "cover" ? Math.max(w / img.width, h / img.height) : Math.min(w / img.width, h / img.height);
    $("#background-note").textContent = `${img.width} × ${img.height} → ${w} × ${h}。` +
      (mismatch ? (fit === "cover" ? "已等比例铺满，边缘会被裁剪。" : "已完整显示，留白使用背景颜色。") : "比例匹配，已自动适配。") +
      (scale > 1 ? "原图较小，放大后可能模糊。" : "");
  }
  $("#text-color").addEventListener("input", recolorParticles);
  $("#background-color").addEventListener("input", draw);
  $("#background-fit").addEventListener("change", () => { updateBackgroundNote(); draw(); });
  $("#background-image").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const request = ++state.backgroundRequest;
    if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type)) { $("#background-note").textContent = "请选择 PNG、JPEG、WebP、GIF 或 AVIF 图片。"; event.target.value = ""; return; }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      if (request !== state.backgroundRequest) return;
      // Cache a static, bounded bitmap, including for animated source images.
      const bitmap = document.createElement("canvas");
      const scale = Math.min(1, 4096 / Math.max(img.naturalWidth, img.naturalHeight));
      bitmap.width = Math.max(1, Math.round(img.naturalWidth * scale));
      bitmap.height = Math.max(1, Math.round(img.naturalHeight * scale));
      bitmap.getContext("2d").drawImage(img, 0, 0, bitmap.width, bitmap.height);
      state.backgroundImage = bitmap;
      $("#remove-background").disabled = false;
      updateBackgroundNote(); draw();
    } catch {
      if (request === state.backgroundRequest) $("#background-note").textContent = "图片无法读取，请换一张图片。";
    } finally { URL.revokeObjectURL(url); event.target.value = ""; }
  });
  $("#remove-background").addEventListener("click", () => {
    state.backgroundRequest += 1;
    state.backgroundImage = null;
    $("#background-image").value = "";
    $("#remove-background").disabled = true;
    updateBackgroundNote(); draw();
  });

  els.input.value = DEFAULT_TEXT;
  updateCharacterCount();
  updateAllControls();
  applyPreset("print");
  els.input.addEventListener("input", updateCharacterCount);
  $("#clear-text").addEventListener("click", () => { els.input.value = ""; updateCharacterCount(); els.input.focus(); });
  Object.values(controls).forEach((input) => {
    input.addEventListener("input", () => {
      formatControl(input);
      if (input.id === "fragmentation" && state.generated) els.state.textContent = "分解尺度已改变，请重新生成";
      else if (physicsInputs.includes(input.id) && !state.applyingPreset) {
        const preset = PRESETS[state.activePreset];
        els.presetDescription.textContent = `${preset.description}（已微调）`;
      }
    });
  });
  $$(".effect-preset").forEach((button) => button.addEventListener("click", () => applyPreset(button.dataset.effect)));
  els.compose.addEventListener("click", compose);
  els.export.addEventListener("click", () => exportPng(false));
  els.exportBackground.addEventListener("click", () => exportPng(true));
  els.undo.addEventListener("click", undoGesture);
  els.reset.addEventListener("click", resetParticles);
  els.pause.addEventListener("click", togglePause);
  els.stage.addEventListener("pointerdown", (event) => {
    if (!state.generated || state.generating || state.pointerDown || event.button !== 0) return;
    saveGesture();
    state.pointerId = event.pointerId;
    state.lastBurst = 0;
    state.pointerDown = true;
    els.stage.setPointerCapture(event.pointerId);
    const point = pointerPosition(event);
    state.pointer = { ...point, time: performance.now() };
    burstAt(point.x, point.y, 1);
  });
  els.stage.addEventListener("pointermove", (event) => {
    if (!state.pointerDown || event.pointerId !== state.pointerId) return;
    const now = performance.now();
    if (now - state.lastBurst < 42) return;
    state.lastBurst = now;
    const point = pointerPosition(event);
    const previous = state.pointer || { ...point, time: now - 16 };
    const seconds = Math.max((now - previous.time) / 1000, 0.016);
    const velocity = {
      x: Math.max(-1400, Math.min(1400, (point.x - previous.x) / seconds)),
      y: Math.max(-1400, Math.min(1400, (point.y - previous.y) / seconds)),
    };
    state.pointer = { ...point, time: now, vx: velocity.x };
    burstAt(point.x, point.y, 0.85, velocity);
  });
  function endPointer(event) {
    if (event && event.pointerId !== state.pointerId) return;
    const id = state.pointerId;
    state.pointerDown = false; state.pointer = null; state.pointerId = null;
    if (id !== null && els.stage.hasPointerCapture(id)) els.stage.releasePointerCapture(id);
  }
  els.stage.addEventListener("pointerup", endPointer);
  els.stage.addEventListener("pointercancel", endPointer);
  els.stage.addEventListener("lostpointercapture", endPointer);
  window.addEventListener("blur", () => endPointer());
  els.stage.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (!state.generated || state.generating || event.repeat) return; saveGesture(); burstAt(state.width / 2, state.height / 2, 1); }
  });
  state.resizeObserver = new ResizeObserver(resizeCanvas);
  state.resizeObserver.observe(els.canvasShell);
})();
