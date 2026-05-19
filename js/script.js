const sections = Array.from(document.querySelectorAll(".screen"));
const navLinks = Array.from(document.querySelectorAll(".nav-link"));
const sectionButtons = Array.from(document.querySelectorAll("[data-section-target]"));

const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const drawerToggle = document.getElementById("drawerToggle");
const drawer = document.getElementById("drawer");
const drawerClose = document.getElementById("drawerClose");
const progressBar = document.getElementById("progressBar");

let currentSectionIndex = sections.findIndex((section) =>
  section.classList.contains("active")
);

if (currentSectionIndex === -1) currentSectionIndex = 0;

let chartInstance = null;
let audioUnlocked = false;

/* =========================
   PROGRESO (DESBLOQUEO SECUENCIAL)
========================= */

const PROGRESS_STORAGE_KEY = "odc:completedUpTo:v2";
const orderedSectionIds = [
  "portada",
  "entrada",
  "modulo-1",
  "modulo-2",
  "modulo-3",
  "modulo-4",
  "modulo-5",
  "modulo-6",
  "evaluacion",
  "conclusion",
  "referencias",
  "creditos",
].filter((id) => sections.some((section) => section.id === id));

const indexById = new Map(orderedSectionIds.map((id, index) => [id, index]));

let hasShownLockMessage = false;
let activeEnterTimeMs = null;
let activeSectionId = null;

const UNDER_CONSTRUCTION_MESSAGE =
  "Los módulos 2 al 12 se encuentran en construcción. Lo podrás ver pronto.";

function isUnderConstructionSectionId(id) {
  return false;
}

function showInfoDialog(message, title = "Información") {
  const dialog = document.getElementById("infoDialog");
  const titleEl = document.getElementById("infoDialogTitle");
  const messageEl = document.getElementById("infoDialogMessage");

  if (titleEl) titleEl.textContent = title || "Información";
  if (messageEl) messageEl.textContent = message || "";

  if (dialog && typeof dialog.showModal === "function") {
    if (dialog.open) dialog.close();
    dialog.showModal();
    return;
  }

  alert(message || "");
}

function inferInfoTitle(el) {
  const explicit = el?.dataset?.infoTitle;
  if (explicit) return explicit;

  const ariaLabel = el?.getAttribute?.("aria-label");
  if (ariaLabel) return ariaLabel;

  const strong = el?.querySelector?.("strong");
  if (strong?.textContent?.trim()) return strong.textContent.trim();

  const raw = el?.textContent?.trim?.() || "";
  if (!raw) return "Información";

  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (cleaned === "+info" || cleaned.toLowerCase().startsWith("+info")) return "Información";
  if (cleaned.length > 42) return "Información";

  return cleaned;
}

function showConstructionNotice(message) {
  const dialog = document.getElementById("constructionDialog");
  const messageEl = document.getElementById("constructionMessage");

  if (messageEl && message) messageEl.textContent = message;

  if (dialog && typeof dialog.showModal === "function") {
    dialog.showModal();
    return;
  }

  showInfoDialog(message || UNDER_CONSTRUCTION_MESSAGE, "Aviso");
}

/* =========================
   ACTIVIDAD COMPLETADA (MODAL)
========================= */

let completionNextSectionId = null;

function getNextSectionId(currentId) {
  const idx = indexById.get(currentId);
  if (!Number.isFinite(idx)) return null;
  const nextId = orderedSectionIds[idx + 1];
  return typeof nextId === "string" ? nextId : null;
}

function goToSectionId(sectionId) {
  const index = sections.findIndex((section) => section.id === sectionId);
  if (index !== -1) showSection(index);
}

function inferActivitySectionId(activityEl) {
  const explicit = activityEl?.dataset?.activitySection;
  if (explicit) return explicit;

  const screen = activityEl?.closest?.("section.screen");
  if (screen?.id) return screen.id;

  const dialog = activityEl?.closest?.("dialog");
  if (dialog?.id === "m2CircularDialog") return "modulo-2";
  if (dialog?.id === "m3PairsDialog") return "modulo-3";

  return null;
}

function showCompletionDialog({ title, message, nextSectionId }) {
  const dialog = document.getElementById("completionDialog");
  const titleEl = document.getElementById("completionTitle");
  const messageEl = document.getElementById("completionMessage");
  const continueBtn = document.getElementById("completionContinue");

  completionNextSectionId = nextSectionId || null;

  if (titleEl) titleEl.textContent = title || "¡Excelente!";
  if (messageEl) messageEl.textContent = message || "Actividad completada.";

  if (continueBtn) {
    continueBtn.style.display = completionNextSectionId ? "" : "none";
  }

  if (dialog && typeof dialog.showModal === "function") {
    if (dialog.open) dialog.close();
    dialog.showModal();
  }
}

function setupCompletionDialog() {
  const dialog = document.getElementById("completionDialog");
  const continueBtn = document.getElementById("completionContinue");

  if (!dialog) return;

  if (continueBtn) {
    continueBtn.addEventListener("click", () => {
      const nextId = completionNextSectionId;
      if (dialog.open) dialog.close();
      if (nextId) goToSectionId(nextId);
    });
  }

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog && dialog.open) dialog.close();
  });
}

function completeActivity(activityEl, customMessage) {
  if (!activityEl || activityEl.dataset?.odcCompleted === "true") return;

  activityEl.dataset.odcCompleted = "true";

  const sectionId = inferActivitySectionId(activityEl);
  const nextId = sectionId ? getNextSectionId(sectionId) : null;

  if (sectionId) {
    const sectionIndex = indexById.get(sectionId);
    if (Number.isFinite(sectionIndex)) {
      const completedUpTo = getCompletedUpTo();
      if (sectionIndex > completedUpTo) {
        setCompletedUpTo(sectionIndex);
        applyModuleLockState();
      }
    }
  }

  const nextTitle =
    nextId && document.getElementById(nextId)
      ? document.getElementById(nextId).querySelector("h2")?.textContent?.trim()
      : "";

  const message =
    customMessage ||
    (nextTitle
      ? `¡Excelente! Actividad completada.\nContinúa a: ${nextTitle}`
      : "¡Excelente! Actividad completada.\nContinúa al siguiente módulo.");

  const resetFn = activityEl.__odcReset;
  if (typeof resetFn === "function") {
    try {
      resetFn();
    } catch (error) {
      console.warn("No se pudo reiniciar la actividad:", error);
    }
  }

  const parentDialog = activityEl.closest?.("dialog");
  if (parentDialog && parentDialog.open && parentDialog.id !== "completionDialog") {
    parentDialog.close();
  }

  window.setTimeout(() => {
    if (activityEl?.dataset) activityEl.dataset.odcCompleted = "false";
  }, 80);

  showCompletionDialog({ title: "¡Excelente!", message, nextSectionId: nextId });
}

function getCompletedUpTo() {
  try {
    const value = Number(window.localStorage.getItem(PROGRESS_STORAGE_KEY));
    if (Number.isFinite(value) && value >= 0) return Math.floor(value);
  } catch {
    // ignore
  }

  return 0; // permite Portada (0) y abre Entrada (1) como siguiente
}

function setCompletedUpTo(value) {
  try {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, String(value));
  } catch {
    // ignore
  }
}

function canAccessSectionId(id) {
  const targetIndex = indexById.get(id);
  if (targetIndex === undefined) return true;

  const completedUpTo = getCompletedUpTo();
  return targetIndex <= completedUpTo + 1;
}

function applyModuleLockState() {
  navLinks.forEach((link) => {
    const targetId = link.dataset.section;
    const isLocked = !canAccessSectionId(targetId);

    link.disabled = isLocked;
    link.setAttribute("aria-disabled", String(isLocked));
    link.title = isLocked
      ? "Debes revisar el módulo anterior para desbloquear este contenido."
      : "";
  });

  updateNextButtonLock();
}

function updateNextButtonLock() {
  if (!nextBtn) return;

  const nextSection = sections[currentSectionIndex + 1];

  if (!nextSection) {
    nextBtn.disabled = true;
    return;
  }

  nextBtn.disabled = !canAccessSectionId(nextSection.id);
}

function maybeCompleteActiveSection() {
  const active = sections[currentSectionIndex];
  if (!active) return;

  const activeIndex = indexById.get(active.id);
  if (activeIndex === undefined) return;

  if (activeSectionId !== active.id) {
    activeSectionId = active.id;
    activeEnterTimeMs = Date.now();
  }

  if (!activeEnterTimeMs || Date.now() - activeEnterTimeMs < 6000) return;

  const bottomInView =
    active.getBoundingClientRect().bottom <= window.innerHeight + 8;

  if (!bottomInView) return;

  const completedUpTo = getCompletedUpTo();
  if (activeIndex > completedUpTo) {
    setCompletedUpTo(activeIndex);
    applyModuleLockState();
  }
}

/* =========================
   NAVEGACIÓN
========================= */

function showSection(index) {
  if (index < 0 || index >= sections.length) return;

  const previousSection = sections[currentSectionIndex];

  const targetId = sections[index].id;
  if (isUnderConstructionSectionId(targetId)) {
    showConstructionNotice(UNDER_CONSTRUCTION_MESSAGE);
    return;
  }

  if (!canAccessSectionId(targetId)) {
    const completedUpTo = getCompletedUpTo();
    const requiredId = orderedSectionIds[completedUpTo + 1] || "entrada";
    const requiredIndex = sections.findIndex((section) => section.id === requiredId);

    if (!hasShownLockMessage) {
      hasShownLockMessage = true;
      showInfoDialog(
        "Este contenido está bloqueado. Para desbloquearlo, revisa el módulo anterior y llega hasta el final.",
        "Contenido bloqueado"
      );
    }

    if (requiredIndex !== -1) {
      index = requiredIndex;
    } else {
      return;
    }
  }

  pauseAllVideos();
  resetSectionVideos(previousSection);

  sections.forEach((section, sectionIndex) => {
    section.classList.toggle("active", sectionIndex === index);
  });

  navLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.section === sections[index].id);
  });

  currentSectionIndex = index;
  updateProgress();
  updateNextButtonLock();
  maybeCompleteActiveSection();
  window.setTimeout(maybeCompleteActiveSection, 6200);
  autoplayPrimaryVideo(sections[index]);
  animateSectionEntrance(sections[index]);

  if (audioUnlocked) {
    enableAudioEverywhere();
  }

  window.location.hash = sections[index].id;

  closeDrawer();
}

function animateSectionEntrance(section) {
  if (!section) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  section.classList.remove("is-entering");
  void section.offsetWidth;
  section.classList.add("is-entering");

  const animated = Array.from(
    section.querySelectorAll(
      [
        ".caption-box",
        ".content-card",
        ".avatar-panel",
        ".microcontent",
        ".module-purpose",
        ".simulator",
        ".media-card",
        ".activity",
        ".quiz-item",
        "table",
        ".m1-zone",
        ".m2-col",
        ".m3-col",
        ".m3-guide-card",
        ".m4-compare-col",
        ".m4-aspects",
        ".m4-close",
        ".m4-question",
        ".m4-purpose",
      ].join(",")
    )
  );

  const seen = new Set();
  const unique = animated.filter((el) => {
    if (!el || seen.has(el)) return false;
    seen.add(el);
    return true;
  });

  unique.forEach((el, i) => {
    el.classList.remove("odc-animate");
    void el.offsetWidth;
    el.style.animationDelay = `${Math.min(i * 60, 420)}ms`;
    el.classList.add("odc-animate");
  });
}

function updateProgress() {
  if (!progressBar || sections.length === 0) return;

  const progress = ((currentSectionIndex + 1) / sections.length) * 100;
  progressBar.style.width = `${progress}%`;
}

function handleNavClick(event) {
  const target = event.currentTarget.dataset.section;
  const index = sections.findIndex((section) => section.id === target);

  if (index !== -1) showSection(index);
}

function handleSectionButton(event) {
  const target = event.currentTarget.dataset.sectionTarget;
  const index = sections.findIndex((section) => section.id === target);

  if (index !== -1) showSection(index);
}

/* =========================
   MENÚ
========================= */

function toggleDrawer() {
  if (!drawer || !drawerToggle) return;

  const isOpen = drawer.classList.contains("open");
  drawer.classList.toggle("open", !isOpen);
  drawer.classList.toggle("closed", isOpen);
  drawerToggle.setAttribute("aria-expanded", String(!isOpen));
}

function closeDrawer() {
  if (!drawer || !drawerToggle) return;

  drawer.classList.remove("open");
  drawer.classList.add("closed");
  drawerToggle.setAttribute("aria-expanded", "false");
}

/* =========================
   AUDIO / NARRACIÓN
========================= */

// Narración por voz eliminada para evitar redundancia de UI/texto.

/* =========================
   VIDEOS
========================= */

function setupVideoPlayer(videoId, playBtnId, volumeRangeId, volumeIconId, replayBtnId) {
  const video = document.getElementById(videoId);
  const playBtn = document.getElementById(playBtnId);
  const volumeRange = document.getElementById(volumeRangeId);
  const volumeIcon = document.getElementById(volumeIconId);
  const replayBtn = replayBtnId ? document.getElementById(replayBtnId) : null;

  if (!video || !playBtn || !volumeRange) return;

  function syncButtons() {
    playBtn.textContent = video.paused ? "▶" : "⏸";

    const currentVolume = Number.isFinite(video.volume) ? video.volume : 1;
    volumeRange.value = String(video.muted ? 0 : currentVolume);

    if (volumeIcon) {
      volumeIcon.textContent = video.muted || currentVolume === 0 ? "🔇" : "🔊";
    }
  }

  playBtn.addEventListener("click", async () => {
    try {
      if (video.paused) {
        await video.play();
      } else {
        video.pause();
      }

      syncButtons();
    } catch (error) {
      console.warn(`No se pudo reproducir el video ${videoId}:`, error);
    }
  });

  if (replayBtn) {
    replayBtn.addEventListener("click", async () => {
      try {
        video.currentTime = 0;
        await video.play();
        syncButtons();
      } catch (error) {
        console.warn(`No se pudo reiniciar el video ${videoId}:`, error);
      }
    });
  }

  volumeRange.addEventListener("input", () => {
    const value = Math.max(0, Math.min(1, Number(volumeRange.value)));
    video.volume = value;
    video.muted = value === 0;
    syncButtons();
  });

  video.addEventListener("play", syncButtons);
  video.addEventListener("pause", syncButtons);
  video.addEventListener("ended", syncButtons);
  video.addEventListener("volumechange", syncButtons);

  syncButtons();
}

function getVideoControlsParts(overlay) {
  const playBtn = overlay.querySelector('[data-video-action="toggle"]');
  const replayBtn = overlay.querySelector('[data-video-action="replay"]');
  const stopBtn = overlay.querySelector('[data-video-action="stop"]');
  const volumeRange = overlay.querySelector('[data-video-action="volume"]');
  const volumeIcon = overlay.querySelector('[data-video-action="icon"]');
  return { playBtn, replayBtn, stopBtn, volumeRange, volumeIcon };
}

function resolveTargetVideo(overlay) {
  const targetId = overlay?.dataset?.videoTarget;
  if (targetId) return document.getElementById(targetId);

  const container = overlay.closest(".cover-video-card, .entry-video-card, figure, .m3-guide-video");
  return (
    container?.querySelector?.("video") ||
    overlay.parentElement?.querySelector?.("video") ||
    null
  );
}

function setupVideoOverlayControls(overlay) {
  const video = resolveTargetVideo(overlay);
  const { playBtn, replayBtn, stopBtn, volumeRange, volumeIcon } = getVideoControlsParts(overlay);

  if (!video || !playBtn || !volumeRange) return;

  function syncPlayButton() {
    const iconEl = playBtn.querySelector("[data-video-state-icon]");
    const symbol = video.paused ? "▶" : "⏸";
    if (iconEl) iconEl.textContent = symbol;
    else playBtn.textContent = symbol;
  }

  function sync() {
    syncPlayButton();

    const currentVolume = Number.isFinite(video.volume) ? video.volume : 1;
    volumeRange.value = String(video.muted ? 0 : currentVolume);

    if (volumeIcon) {
      volumeIcon.textContent = video.muted || currentVolume === 0 ? "🔇" : "🔊";
    }
  }

  playBtn.addEventListener("click", async () => {
    try {
      if (video.paused) {
        await video.play();
      } else {
        video.pause();
      }
      sync();
    } catch (error) {
      console.warn("No se pudo reproducir el video:", error);
    }
  });

  if (replayBtn) {
    replayBtn.addEventListener("click", async () => {
      try {
        video.currentTime = 0;
        await video.play();
        sync();
      } catch (error) {
        console.warn("No se pudo reiniciar el video:", error);
      }
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      resetVideo(video);
      sync();
    });
  }

  volumeRange.addEventListener("input", () => {
    const value = Math.max(0, Math.min(1, Number(volumeRange.value)));
    video.volume = value;
    video.muted = value === 0;
    sync();
  });

  video.addEventListener("play", sync);
  video.addEventListener("pause", sync);
  video.addEventListener("ended", sync);
  video.addEventListener("volumechange", sync);

  sync();
}

function enableAudioEverywhere() {
  audioUnlocked = true;
  const videos = Array.from(document.querySelectorAll("video"));
  videos.forEach((video) => {
    video.muted = false;
    video.volume = 1;
  });

  // Controles sincronizados por eventos de `volumechange` en cada overlay.
  return;

  const portadaPlay = document.getElementById("playVideoBtn");
  const portadaVol = document.getElementById("volumeRangePortada");
  const portadaIcon = document.getElementById("volumeIconPortada");
  const portadaVideo = document.getElementById("portadaVideo");
  if (portadaPlay && portadaVideo) portadaPlay.textContent = portadaVideo.paused ? "▶" : "⏸";
  if (portadaVol) portadaVol.value = "1";
  if (portadaIcon) portadaIcon.textContent = "🔊";

  const entradaPlay = document.getElementById("playEntradaBtn");
  const entradaVol = document.getElementById("volumeRangeEntrada");
  const entradaIcon = document.getElementById("volumeIconEntrada");
  const entradaVideo = document.getElementById("entradaVideo");
  if (entradaPlay && entradaVideo) entradaPlay.textContent = entradaVideo.paused ? "▶" : "⏸";
  if (entradaVol) entradaVol.value = "1";
  if (entradaIcon) entradaIcon.textContent = "🔊";
}

function pauseAllVideos() {
  const videos = Array.from(document.querySelectorAll("video"));

  videos.forEach((video) => {
    if (!video.paused) video.pause();
  });
}

function pauseOtherVideos(activeVideo) {
  const videos = Array.from(document.querySelectorAll("video"));

  videos.forEach((video) => {
    if (video !== activeVideo && !video.paused) {
      video.pause();
    }
  });
}

function resetVideo(video) {
  if (!video) return;

  const applyReset = () => {
    try {
      video.currentTime = 0;
    } catch {
      // ignore
    }
  };

  try {
    video.pause();
  } catch {
    // ignore
  }

  if (video.readyState >= 1) {
    applyReset();
  } else {
    video.addEventListener("loadedmetadata", applyReset, { once: true });
  }
}

function resetSectionVideos(section) {
  if (!section) return;
  const videos = Array.from(section.querySelectorAll("video"));
  videos.forEach(resetVideo);
}

function setupSingleVideoPlayback() {
  document.addEventListener(
    "play",
    (event) => {
      const target = event.target;
      if (target && target.tagName === "VIDEO") {
        pauseOtherVideos(target);
      }
    },
    true
  );
}

async function autoplayPrimaryVideo(section) {
  if (!section) return;

  const primary =
    section.querySelector("video[data-primary-video]") ||
    section.querySelector("video");

  if (!primary) return;

  // Asegura que solo un video esté activo
  pauseOtherVideos(primary);
  resetVideo(primary);

  try {
    primary.volume = 1;
    primary.muted = !audioUnlocked;
    await primary.play();
  } catch {
    // ignore
  }
}

function setupVideoControls() {
  const overlays = Array.from(document.querySelectorAll("[data-video-controls]"));
  overlays.forEach(setupVideoOverlayControls);
}

/* =========================
   INFO CHIPS
 ========================= */

function setupInfoChips() {
  const chips = Array.from(document.querySelectorAll("[data-info]"));

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const message = chip.dataset.info;
      if (!message) return;
      const title = inferInfoTitle(chip);
      showInfoDialog(message, title);
    });
  });
}

function setupInfoDialog() {
  const dialog = document.getElementById("infoDialog");
  if (!dialog) return;

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog && dialog.open) {
      dialog.close();
    }
  });
}

function setupM3TermDialog() {
  const dialog = document.getElementById("m3TermDialog");
  const titleEl = document.getElementById("m3TermTitle");
  const bodyEl = document.getElementById("m3TermBody");

  if (!dialog || !titleEl || !bodyEl) return;

  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-term-button]");
    if (!button) return;

    const title = button.querySelector(".m3-term-title")?.textContent?.trim() || "Término";
    const template = button.parentElement?.querySelector?.("[data-term-template]");

    titleEl.textContent = title;
    bodyEl.textContent = "";

    if (template && template.content) {
      bodyEl.appendChild(template.content.cloneNode(true));
    }

    if (typeof dialog.showModal === "function") {
      if (dialog.open) dialog.close();
      dialog.showModal();
      return;
    }

    alert(title);
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog && dialog.open) dialog.close();
  });
}

function setupM4AspectComparator() {
  const panel = document.querySelector("[data-m4-aspect-panel]");
  if (!panel) return;

  const tabs = Array.from(document.querySelectorAll("[data-m4-aspect]"));
  const titleEl = panel.querySelector("[data-m4-aspect-title]");
  const leftTextEl = panel.querySelector("[data-m4-aspect-left] p");
  const rightTextEl = panel.querySelector("[data-m4-aspect-right] p");
  const valueEl = panel.querySelector("[data-m4-aspect-value] span");

  if (!titleEl || !leftTextEl || !rightTextEl || !valueEl) return;

  const aspects = {
    registro: {
      title: "Registro de residuos",
      traditional:
        "Manual, incompleta o inexistente. Puede depender de formatos físicos, observaciones aisladas o registros no estandarizados.",
      smart:
        "Digital, sistemática y trazable. Permite registrar fecha, punto de generación, tipo de residuo, peso, responsable y destino.",
      value:
        "Construye una línea base institucional para analizar tendencias, comparar periodos y evaluar mejoras.",
    },
    clasificacion: {
      title: "Clasificación",
      traditional:
        "Depende únicamente del usuario. Puede presentar errores por falta de cultura ambiental, señalización insuficiente o mezcla de residuos.",
      smart:
        "Puede apoyarse en inteligencia artificial, sensores, registros fotográficos, códigos QR y campañas dirigidas según los datos recolectados.",
      value:
        "Permite medir tasa de separación correcta, tasa de rechazo y kilogramos de material aprovechable.",
    },
    recoleccion: {
      title: "Recolección",
      traditional: "Frecuencia fija, sin análisis del nivel de llenado ni de la generación real de residuos.",
      smart: "Frecuencia ajustada según datos, indicadores, sensores de llenado o reportes digitales.",
      value:
        "Reduce recorridos innecesarios, tiempos de recolección y viajes en vacío; permite ajustar rutas según evidencia.",
    },
    seguimiento: {
      title: "Seguimiento",
      traditional:
        "Limitado y poco verificable. Puede no existir evidencia suficiente sobre qué ocurre después de la recolección.",
      smart: "Mediante tableros, métricas, mapas, reportes y alertas.",
      value:
        "Permite monitorear puntos críticos, desbordamientos, cumplimiento de recolección y desempeño operativo.",
    },
    decisiones: {
      title: "Toma de decisiones",
      traditional:
        "Reactiva. Las acciones se realizan cuando aparece un problema visible, como acumulación, desbordamiento, quejas o bajo reciclaje.",
      smart:
        "Basada en evidencia. Las decisiones se toman con datos históricos, indicadores, alertas y análisis descriptivo, predictivo o prescriptivo.",
      value:
        "Permite anticipar necesidades, priorizar acciones ambientales y justificar decisiones institucionales.",
    },
    costos: {
      title: "Costos operativos",
      traditional:
        "Difíciles de estimar, porque no siempre se conoce tiempo, ruta, frecuencia, peso gestionado o recursos utilizados.",
      smart:
        "Medibles mediante indicadores como costo por kilogramo gestionado, tiempo de recolección, número de recorridos, recursos utilizados y porcentaje de viajes en vacío.",
      value:
        "Facilita evaluar eficiencia operativa, identificar desperdicios y justificar mejoras en el sistema de gestión.",
    },
    impacto: {
      title: "Impacto ambiental",
      traditional:
        "Poco cuantificado. Puede desconocerse cuánto se recicla, cuánto se aprovecha, cuánto se envía a disposición final o qué emisiones podrían evitarse.",
      smart:
        "Medible mediante tasa de reciclaje, tasa de aprovechamiento, kilogramos recuperados, emisiones evitadas, reducción de residuos y reducción de recorridos.",
      value:
        "Permite demostrar avances en sostenibilidad institucional, economía circular y cumplimiento de metas ambientales.",
    },
    trazabilidad: {
      title: "Trazabilidad",
      traditional:
        "Parcial o inexistente. No siempre se conoce el recorrido del residuo desde su generación hasta su destino.",
      smart:
        "Seguimiento desde el punto de generación hasta almacenamiento, aprovechamiento o disposición final, mediante registros digitales, QR/RFID, formularios móviles o bases de datos.",
      value:
        "Permite auditar el proceso, mejorar transparencia y fortalecer la responsabilidad ambiental institucional.",
    },
  };

  function render(key) {
    const aspect = aspects[key] || aspects.registro;
    titleEl.textContent = aspect.title;
    leftTextEl.textContent = aspect.traditional;
    rightTextEl.textContent = aspect.smart;
    valueEl.textContent = aspect.value;
  }

  function setActive(key) {
    tabs.forEach((tab) => {
      const active = tab.dataset.m4Aspect === key;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    panel.dataset.m4AspectCurrent = key;
    render(key);
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const key = tab.dataset.m4Aspect;
      if (!key) return;
      setActive(key);
    });
  });

  const initial =
    tabs.find((tab) => tab.classList.contains("is-active"))?.dataset?.m4Aspect ||
    tabs[0]?.dataset?.m4Aspect ||
    "registro";
  setActive(initial);
}

function setupCaseSeriesActivities() {
  const activities = Array.from(
    document.querySelectorAll('.activity[data-activity-type="case-series"]')
  );

  activities.forEach((activity) => {
    const progressEl = activity.querySelector("[data-case-progress]");
    const scoreEl = activity.querySelector("[data-case-score]");
    const textEl = activity.querySelector("[data-case-text]");
    const feedbackEl = activity.querySelector("[data-case-feedback]");
    const nextBtn = activity.querySelector("[data-case-next]");
    const resetBtn = activity.querySelector("[data-case-reset]");
    const choiceBtns = Array.from(activity.querySelectorAll("[data-case-choice]"));

    if (!textEl || choiceBtns.length === 0) return;

    const cases = [
      {
        text: "Se recoge la basura todos los días a la misma hora, aunque los contenedores estén medio vacíos.",
        correct: "tradicional",
        feedback:
          "La frecuencia fija no considera datos reales de llenado ni demanda de recolección.",
      },
      {
        text: "Un dashboard muestra que la cafetería genera más residuos orgánicos los lunes.",
        correct: "inteligente",
        feedback:
          "El tablero permite observar patrones y tomar decisiones basadas en evidencia.",
      },
      {
        text: "No se conoce cuánto material reciclable se recupera cada semana.",
        correct: "tradicional",
        feedback:
          "Sin registro ni indicadores no se puede medir el aprovechamiento.",
      },
      {
        text: "Los códigos QR permiten registrar el peso y destino de los residuos por punto ecológico.",
        correct: "inteligente",
        feedback:
          "El registro digital fortalece la trazabilidad del residuo.",
      },
      {
        text: "Las campañas ambientales se diseñan según los errores frecuentes de separación.",
        correct: "inteligente",
        feedback:
          "Los datos permiten focalizar campañas según problemas reales de clasificación.",
      },
      {
        text: "Las decisiones se toman solo cuando hay quejas por desbordamiento.",
        correct: "tradicional",
        feedback:
          "Es una decisión reactiva: se actúa después de que el problema aparece.",
      },
      {
        text: "El sistema estima que durante la semana de parciales aumentará la generación de residuos.",
        correct: "inteligente",
        feedback:
          "La predicción permite anticipar necesidades operativas.",
      },
      {
        text: "No existe registro del destino final de los residuos recolectados.",
        correct: "tradicional",
        feedback:
          "La falta de trazabilidad impide conocer el recorrido del residuo.",
      },
    ];

    let index = 0;
    let score = 0;
    let locked = false;

    function updateMeta() {
      if (progressEl) progressEl.textContent = `Caso ${index + 1} de ${cases.length}`;
      if (scoreEl) scoreEl.textContent = `Aciertos: ${score}`;
    }

    function setFeedback(message, isCorrect) {
      if (!feedbackEl) return;
      setFeedbackTone(feedbackEl, isCorrect);
      feedbackEl.textContent = message || "";
    }

    function render() {
      const current = cases[index];
      textEl.textContent = current?.text || "";
      updateMeta();
      locked = false;
      if (nextBtn) nextBtn.disabled = true;
      setFeedback("", null);
    }

    function finish() {
      const total = cases.length;
      if (nextBtn) nextBtn.disabled = true;

      if (score >= 7) {
        setFeedback(
          "Excelente. Reconoces con claridad la diferencia entre una gestión reactiva y una gestión basada en datos.",
          true
        );
      } else if (score >= 4) {
        setFeedback(
          "Buen avance. Recuerda: la gestión tradicional reacciona cuando el problema aparece; la gestión inteligente registra, analiza y decide con evidencia.",
          null
        );
      } else {
        setFeedback(
          "Repasa el comparador. Una gestión con analítica de datos se caracteriza por registros digitales, indicadores, trazabilidad, tableros y decisiones basadas en evidencia.",
          false
        );
      }

      if (score >= 7) completeActivity(activity, `¡Excelente! Actividad completada.\nPuntaje: ${score}/${total}`);
    }

    choiceBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (locked) return;
        const choice = btn.dataset.caseChoice;
        const current = cases[index];
        if (!choice || !current) return;

        locked = true;
        const correct = choice === current.correct;
        if (correct) score += 1;

        setFeedback(correct ? `Correcto. ${current.feedback}` : `Incorrecto. ${current.feedback}`, correct);
        updateMeta();
        if (nextBtn) nextBtn.disabled = false;
      });
    });

    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        if (index >= cases.length - 1) {
          finish();
          return;
        }
        index += 1;
        render();
      });
    }

    function reset() {
      index = 0;
      score = 0;
      render();
    }

    if (resetBtn) resetBtn.addEventListener("click", reset);
    activity.__odcReset = reset;

    render();
  });
}

function setupM5IndicatorsPanel() {
  const panel = document.querySelector("[data-m5-dim-panel]");
  if (!panel) return;

  const tabs = Array.from(document.querySelectorAll("[data-m5-dim]"));
  const titleEl = panel.querySelector("[data-m5-dim-title]");
  const bodyEl = panel.querySelector("[data-m5-dim-body]");
  const noteEl = panel.querySelector("[data-m5-dim-note]");

  if (!titleEl || !bodyEl || !noteEl) return;

  const dims = {
    ambiental: {
      title: "Dimensión ambiental",
      note:
        "Estos indicadores permiten evaluar si la institución reduce la cantidad de residuos enviados a disposición final y aumenta el aprovechamiento de materiales. UNEP e ISWA (2024) destacan beneficios ambientales y económicos de modelos de economía circular.",
      rows: [
        ["Tasa de aprovechamiento", "kg aprovechados / kg totales × 100", "Porcentaje de residuos reciclados, reutilizados o compostados."],
        ["Tasa de reciclaje", "kg reciclados / kg totales × 100", "Nivel de recuperación de materiales reciclables."],
        ["Reducción de residuos", "kg iniciales - kg finales", "Disminución de residuos enviados a disposición final."],
        ["Emisiones evitadas", "km reducidos × factor de emisión", "Beneficio ambiental asociado a rutas optimizadas."],
      ],
    },
    operativa: {
      title: "Dimensión operativa",
      note:
        "Estos indicadores permiten identificar eficiencia operativa: recorridos innecesarios, acumulación o puntos críticos. El documento base sugiere programar recolecciones según demanda y medir tiempos y recorridos.",
      rows: [
        ["Eficiencia de recolección", "kg recolectados / tiempo empleado", "Productividad del proceso de recolección."],
        ["Cumplimiento de recolección", "recolecciones realizadas / recolecciones programadas × 100", "Nivel de cumplimiento de rutas internas."],
        ["Puntos críticos activos", "número de puntos con acumulación o desbordamiento", "Zonas que requieren atención prioritaria."],
        ["Tiempo promedio de recolección", "suma de tiempos / número de recorridos", "Duración media del proceso operativo."],
      ],
    },
    economica: {
      title: "Dimensión económica",
      note:
        "Medir costos permite comparar escenarios antes y después de implementar mejoras. La EPA (2025) recomienda enfoques de ciclo de vida para identificar oportunidades de reducción de impactos y costos.",
      rows: [
        ["Costo por kg gestionado", "costo total / kg gestionados", "Eficiencia económica de la gestión."],
        ["Costos evitados", "costo base - costo posterior", "Ahorro logrado por mejoras operativas."],
        ["Costo por ruta", "costo total de recolección / número de rutas", "Costo promedio de cada recorrido."],
      ],
    },
    comunitaria: {
      title: "Dimensión institucional y comunitaria",
      note:
        "Estos indicadores ayudan a evaluar apropiación de campañas y calidad de separación en la fuente, e identificar puntos donde se requiere educación o señalización.",
      rows: [
        ["Participación comunitaria", "participantes / población total × 100", "Apropiación institucional de acciones ambientales."],
        ["Tasa de separación correcta", "residuos correctamente separados / residuos evaluados × 100", "Calidad de separación en la fuente."],
        ["Tasa de rechazo", "kg rechazados / kg aprovechables recolectados × 100", "Material no aprovechable por contaminación o mala clasificación."],
      ],
    },
    datos: {
      title: "Dimensión de trazabilidad y datos",
      note:
        "La trazabilidad permite saber qué ocurre con el residuo desde su generación hasta su destino. Se puede fortalecer con formularios digitales, QR/RFID y bases de datos estructuradas.",
      rows: [
        ["Trazabilidad del residuo", "registros completos / registros totales × 100", "Seguimiento del residuo desde su origen hasta su destino."],
        ["Incidencias registradas", "número de registros con novedades", "Fallas, errores o eventos críticos."],
        ["Tiempo entre generación y retiro", "hora de retiro - hora de generación", "Tiempo que permanece el residuo en el punto de generación."],
      ],
    },
  };

  function render(key) {
    const dim = dims[key] || dims.ambiental;
    titleEl.textContent = dim.title;
    noteEl.textContent = dim.note;
    bodyEl.textContent = "";

    dim.rows.forEach(([name, formula, measures]) => {
      const tr = document.createElement("tr");
      const td1 = document.createElement("td");
      const td2 = document.createElement("td");
      const td3 = document.createElement("td");
      td1.textContent = name;
      td2.textContent = formula;
      td3.textContent = measures;
      tr.appendChild(td1);
      tr.appendChild(td2);
      tr.appendChild(td3);
      bodyEl.appendChild(tr);
    });
  }

  function setActive(key) {
    tabs.forEach((tab) => {
      const active = tab.dataset.m5Dim === key;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    panel.dataset.m5DimCurrent = key;
    render(key);
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const key = tab.dataset.m5Dim;
      if (!key) return;
      setActive(key);
    });
  });

  const initial =
    tabs.find((tab) => tab.classList.contains("is-active"))?.dataset?.m5Dim ||
    tabs[0]?.dataset?.m5Dim ||
    "ambiental";
  setActive(initial);
}

function setupCalcActivities() {
  const activities = Array.from(document.querySelectorAll('.activity[data-activity-type="calc"]'));

  activities.forEach((activity) => {
    const cards = Array.from(activity.querySelectorAll("[data-calc-case]"));
    const resetBtn = activity.querySelector("[data-calc-reset]");

    if (cards.length === 0) return;

    const completed = new Set();

    function markDone(card) {
      const key = card.dataset.calcCase || "";
      if (key) completed.add(key);
      card.dataset.calcDone = "true";

      if (completed.size >= cards.length) {
        completeActivity(activity, "¡Excelente! Completaste los cálculos clave del módulo 5.");
      }
    }

    function reset() {
      completed.clear();
      cards.forEach((card) => {
        card.dataset.calcDone = "false";
        const feedback = card.querySelector("[data-calc-feedback]");
        if (feedback) {
          setFeedbackTone(feedback, null);
          feedback.textContent = "";
        }
      });
    }

    cards.forEach((card) => {
      const runBtn = card.querySelector("[data-calc-run]");
      const aEl = card.querySelector("[data-calc-a]");
      const bEl = card.querySelector("[data-calc-b]");
      const feedbackEl = card.querySelector("[data-calc-feedback]");

      if (!runBtn || !aEl || !bEl || !feedbackEl) return;

      runBtn.addEventListener("click", () => {
        const a = Number(aEl.value);
        const b = Number(bEl.value);

        if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) {
          setFeedbackTone(feedbackEl, false);
          feedbackEl.textContent = "Revisa los valores: deben ser números y el denominador no puede ser 0.";
          return;
        }

        const type = card.dataset.calcCase;

        if (type === "reciclaje" || type === "trazabilidad") {
          const value = (a / b) * 100;
          const rounded = Math.round(value * 10) / 10;
          setFeedbackTone(feedbackEl, true);
          feedbackEl.textContent =
            type === "reciclaje"
              ? `Resultado: ${rounded} %. Esto indica qué porcentaje de residuos generados fue recuperado mediante reciclaje.`
              : `Resultado: ${rounded} %. Esto indica qué porcentaje de registros está completo (origen, peso, tipo y destino).`;
          markDone(card);
          return;
        }

        if (type === "costo") {
          const value = a / b;
          const rounded = Math.round(value * 10) / 10;
          setFeedbackTone(feedbackEl, true);
          feedbackEl.textContent =
            `Resultado: ${rounded} COP/kg. Este indicador ayuda a evaluar eficiencia económica y comparar estrategias.`;
          markDone(card);
          return;
        }

        setFeedbackTone(feedbackEl, null);
        feedbackEl.textContent = "";
      });
    });

    if (resetBtn) resetBtn.addEventListener("click", reset);
    activity.__odcReset = reset;
    reset();
  });
}

function setupWordSearchActivities() {
  const activities = Array.from(document.querySelectorAll('.activity[data-activity-type="wordsearch"]'));

  activities.forEach((activity) => {
    const words = Array.from(activity.querySelectorAll("[data-word]"));
    const feedbackEl = activity.querySelector("[data-ws-feedback]");
    const resetBtn = activity.querySelector("[data-ws-reset]");

    if (words.length === 0 || !feedbackEl) return;

    const messages = {
      PRISMA: "PRISMA: organiza identificación, selección, elegibilidad e inclusión de estudios.",
      SCOPUS: "SCOPUS: base de datos utilizada para recuperar artículos científicos.",
      ANALITICA: "ANALÍTICA: permite interpretar datos y convertirlos en evidencia.",
      BIGDATA: "BIG DATA: integra grandes volúmenes de datos de sensores, registros y reportes.",
      IOT: "IoT: captura datos mediante sensores en contenedores o puntos críticos.",
      IA: "IA: apoya clasificación, predicción y detección de patrones.",
      RECICLAJE: "RECICLAJE: reincorpora materiales aprovechables a nuevos procesos.",
      TRAZABILIDAD: "TRAZABILIDAD: sigue el residuo desde su generación hasta su destino.",
      SOSTENIBILIDAD: "SOSTENIBILIDAD: orienta la reducción de impactos ambientales.",
      ECONOMIA: "ECONOMÍA: se relaciona con economía circular y aprovechamiento de materiales.",
      DASHBOARD: "DASHBOARD: visualiza indicadores para apoyar decisiones institucionales.",
      RESIDUOS: "RESIDUOS: tema central de la propuesta del ODC.",
    };

    const found = new Set();

    function setMsg(ok, text) {
      setFeedbackTone(feedbackEl, ok);
      feedbackEl.textContent = text;
    }

    function finishIfDone() {
      if (found.size >= words.length) {
        completeActivity(activity, "¡Excelente! Reconociste los términos clave que conectan PRISMA con la evidencia del ODC.");
      }
    }

    function reset() {
      found.clear();
      words.forEach((btn) => btn.classList.remove("is-found"));
      setFeedbackTone(feedbackEl, null);
      feedbackEl.textContent = "";
    }

    words.forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = String(btn.dataset.word || "").toUpperCase();
        if (!key) return;

        if (found.has(key)) {
          setMsg(true, messages[key] || "¡Ya encontrada!");
          return;
        }

        found.add(key);
        btn.classList.add("is-found");
        setMsg(true, messages[key] || "¡Encontrada!");
        finishIfDone();
      });
    });

    if (resetBtn) resetBtn.addEventListener("click", reset);
    activity.__odcReset = reset;
    reset();
  });
}

/* =========================
   ACTIVIDADES
========================= */

function setupActivities() {
  setupMultipleChoiceActivities();
  setupChecklistActivities();
  setupDragDropActivities();
  setupOrderActivities();
  setupPairsActivities();
  setupCaseSeriesActivities();
  setupCalcActivities();
  setupWordSearchActivities();
  setupModule7Quiz();
  setupModule7Hub();
  setupModule8Hub();
}

function setupModule8Hub() {
  const hubs = Array.from(
    document.querySelectorAll('.activity[data-activity-type="module8-hub"]')
  );

  hubs.forEach((hub) => {
    const tabs = Array.from(hub.querySelectorAll("[data-m8-tab]"));
    const panels = Array.from(hub.querySelectorAll("[data-m8-panel]"));
    if (tabs.length === 0 || panels.length === 0) return;

    function setActive(key) {
      tabs.forEach((tab) => {
        const isActive = tab.dataset.m8Tab === key;
        tab.classList.toggle("is-active", isActive);
        tab.setAttribute("aria-selected", String(isActive));
      });

      panels.forEach((panel) => {
        const isActive = panel.dataset.m8Panel === key;
        panel.hidden = !isActive;
      });
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => setActive(tab.dataset.m8Tab));
    });

    const initial =
      tabs.find((t) => t.classList.contains("is-active"))?.dataset?.m8Tab ||
      tabs[0].dataset.m8Tab;
    setActive(initial);
  });
}

function setupModule7Hub() {
  const hubs = Array.from(
    document.querySelectorAll('.activity[data-activity-type="module7-hub"]')
  );

  hubs.forEach((hub) => {
    const tabs = Array.from(hub.querySelectorAll("[data-m7-tab]"));
    const panels = Array.from(hub.querySelectorAll("[data-m7-panel]"));
    if (tabs.length === 0 || panels.length === 0) return;

    function setActive(key) {
      tabs.forEach((tab) => {
        const isActive = tab.dataset.m7Tab === key;
        tab.classList.toggle("is-active", isActive);
        tab.setAttribute("aria-selected", String(isActive));
      });

      panels.forEach((panel) => {
        const isActive = panel.dataset.m7Panel === key;
        panel.hidden = !isActive;
      });
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => setActive(tab.dataset.m7Tab));
    });

    const initial =
      tabs.find((t) => t.classList.contains("is-active"))?.dataset?.m7Tab ||
      tabs[0].dataset.m7Tab;
    setActive(initial);
  });
}

function setupFlipCards() {
  const cards = Array.from(document.querySelectorAll("[data-flip-card]"));

  cards.forEach((card) => {
    card.addEventListener("click", () => {
      const isFlipped = card.classList.toggle("is-flipped");
      card.setAttribute("aria-pressed", String(isFlipped));
    });
  });
}

function setupFlowGraphics() {
  const graphics = Array.from(document.querySelectorAll("[data-flow-graphic]"));

  graphics.forEach((graphic) => {
    const nodes = Array.from(graphic.querySelectorAll("[data-flow-node]"));
    const detailEl =
      graphic.parentElement?.querySelector?.("[data-flow-detail]") || null;

    if (nodes.length === 0 || !detailEl) return;

    function render(node) {
      const title = node.dataset.title || node.textContent?.trim?.() || "Paso";
      const detail = node.dataset.detail || "";

      detailEl.textContent = "";

      const strong = document.createElement("strong");
      strong.textContent = `${title}:`;

      const text = document.createTextNode(` ${detail}`);

      detailEl.appendChild(strong);
      detailEl.appendChild(text);

      detailEl.classList.remove("is-pop");
      void detailEl.offsetWidth;
      detailEl.classList.add("is-pop");
    }

    function setActive(node) {
      nodes.forEach((n) => n.classList.toggle("is-active", n === node));
      render(node);
    }

    nodes.forEach((node) => {
      node.addEventListener("click", () => setActive(node));
    });

    const initial = nodes.find((n) => n.classList.contains("is-active")) || nodes[0];
    if (initial) setActive(initial);
  });
}

function setupCircularRouteActivity() {
  const root = document.getElementById("m2-circular");
  if (!root) return;

  const caseEl = document.getElementById("m2CircularCase");
  const progressEl = document.getElementById("m2CircularProgress");
  const scoreEl = document.getElementById("m2CircularScore");
  const feedbackEl = document.getElementById("m2CircularFeedback");
  const feedbackTextEl = document.getElementById("m2CircularFeedbackText");
  const nextBtn = document.getElementById("m2CircularNext");
  const resetBtn = document.getElementById("m2CircularReset");
  const actionButtons = Array.from(root.querySelectorAll("[data-action]"));
  const cardEl = root.querySelector(".m2-circular-card");

  if (
    !caseEl ||
    !progressEl ||
    !scoreEl ||
    !feedbackEl ||
    !feedbackTextEl ||
    !nextBtn ||
    !resetBtn ||
    actionButtons.length === 0
  ) {
    return;
  }

  const cases = [
    {
      text: "En la cafetería quedan cáscaras de fruta y residuos vegetales después del consumo diario.",
      correct: "Compostar",
      correctFeedback:
        "Correcto. Los residuos orgánicos pueden aprovecharse mediante compostaje, evitando que lleguen a disposición final.",
    },
    {
      text: "En una oficina quedan hojas impresas por una sola cara y aún se pueden usar para borradores.",
      correct: "Reutilizar",
      correctFeedback:
        "Correcto. Antes de reciclar, es preferible reutilizar el material si todavía tiene vida útil.",
    },
    {
      text: "Después de una jornada académica se recogen botellas plásticas limpias y separadas correctamente.",
      correct: "Reciclar",
      correctFeedback: "Correcto. Si el plástico está limpio y separado, puede enviarse a reciclaje.",
    },
    {
      text: "En la zona de comidas se encuentran empaques contaminados con grasa y restos de alimentos.",
      correct: "Disponer",
      correctFeedback:
        "Correcto. Cuando un empaque está contaminado y no puede limpiarse ni reciclarse, debe manejarse como residuo ordinario.",
    },
    {
      text: "La universidad planea comprar insumos para un evento, pero algunos proveedores entregan productos con exceso de empaques.",
      correct: "Reducir",
      correctFeedback:
        "Correcto. La mejor decisión es reducir desde el origen, eligiendo productos o proveedores con menos empaque.",
    },
  ];

  let currentIndex = 0;
  let score = 0;
  let hasAnswered = false;

  function pulse(el, className) {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  function clearSelectionStyles() {
    actionButtons.forEach((btn) => btn.classList.remove("is-selected"));
  }

  function setButtonsEnabled(enabled) {
    actionButtons.forEach((btn) => {
      btn.disabled = !enabled;
    });
  }

  function render() {
    const total = cases.length;
    const caseNumber = currentIndex + 1;

    progressEl.textContent = `Caso ${caseNumber} de ${total}`;
    scoreEl.textContent = `Puntaje: ${score}`;
    caseEl.textContent = cases[currentIndex].text;
    pulse(cardEl, "is-switching");
    pulse(caseEl, "is-switching");

    feedbackEl.classList.remove("is-correct", "is-incorrect");
    feedbackTextEl.textContent = "Elige una acción para este caso.";

    nextBtn.disabled = true;
    hasAnswered = false;
    clearSelectionStyles();
    setButtonsEnabled(true);
  }

  function showFinalMessage() {
    const total = cases.length;

    progressEl.textContent = `Caso ${total} de ${total}`;
    scoreEl.textContent = `Puntaje final: ${score}/${total}`;
    caseEl.textContent = "Actividad finalizada.";

    feedbackEl.classList.remove("is-correct", "is-incorrect");

    let message =
      "Repasa los conceptos. La opción más sostenible es evitar generar residuos desde el origen y mantener los materiales en uso el mayor tiempo posible.";

    if (score >= 4) {
      message =
        "Excelente. Comprendiste que la gestión sostenible no consiste solo en reciclar, sino en tomar mejores decisiones desde el origen.";
    } else if (score >= 2) {
      message =
        "Buen avance. Revisa la ruta circular: reducir, reutilizar, reciclar, compostar y disponer.";
    }

    feedbackTextEl.textContent = message;
    pulse(feedbackEl, "is-pop");
    nextBtn.disabled = true;
    hasAnswered = true;
    clearSelectionStyles();
    setButtonsEnabled(false);
  }

  function handleAnswer(action, buttonEl) {
    if (hasAnswered) return;

    hasAnswered = true;
    clearSelectionStyles();
    buttonEl.classList.add("is-selected");

    const current = cases[currentIndex];
    const isCorrect = action === current.correct;

    if (isCorrect) score += 1;

    feedbackEl.classList.toggle("is-correct", isCorrect);
    feedbackEl.classList.toggle("is-incorrect", !isCorrect);
    feedbackTextEl.textContent = isCorrect
      ? current.correctFeedback
      : `Incorrecto. La mejor opción en este caso es: ${current.correct}. ${current.correctFeedback}`;

    pulse(feedbackEl, "is-pop");
    if (!isCorrect) pulse(cardEl, "is-shake");

    scoreEl.textContent = `Puntaje: ${score}`;

    setButtonsEnabled(false);
    nextBtn.disabled = false;

    const isLast = currentIndex === cases.length - 1;
    nextBtn.textContent = isLast ? "Ver resultados" : "Siguiente caso";
  }

  actionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (!action) return;
      handleAnswer(action, btn);
    });
  });

  nextBtn.addEventListener("click", () => {
    const isLast = currentIndex === cases.length - 1;
    if (isLast) {
      showFinalMessage();
      completeActivity(root);
      return;
    }

    currentIndex += 1;
    render();
  });

  resetBtn.addEventListener("click", () => {
    currentIndex = 0;
    score = 0;
    nextBtn.textContent = "Siguiente caso";
    render();
  });

  root.__odcReset = () => {
    currentIndex = 0;
    score = 0;
    nextBtn.textContent = "Siguiente caso";
    render();
  };

  render();
}

function setupActivityModals() {
  const activities = Array.from(document.querySelectorAll(".activity"));
  if (activities.length === 0) return;

  activities.forEach((activity) => {
    if (!(activity instanceof HTMLElement)) return;
    if (activity.closest("dialog")) return;
    if (activity.closest("#modulo-1")) return; // Módulo 1 se mantiene visible
    if (activity.dataset.modalSkip === "true") return;

    const activityId = activity.dataset.activityId || "";
    if (!activityId) return;
    if (activityId.includes("launch")) return; // ya existe un launcher (M2, M3, entrada)

    // Evita duplicar si ya fue modalizada en otra carga
    if (activity.dataset.modalized === "true") return;
    activity.dataset.modalized = "true";

    const marker = document.createElement("div");
    marker.setAttribute("data-activity-marker", activityId);
    activity.insertAdjacentElement("beforebegin", marker);

    const title =
      activity.querySelector("h3")?.textContent?.trim() ||
      activity.getAttribute("aria-label") ||
      "Actividad";

    const firstParagraph = activity.querySelector("p")?.textContent?.trim() || "";

    const dialog = document.createElement("dialog");
    dialog.className = "modal activity-dialog";
    dialog.id = `${activityId}-dialog`;

    const form = document.createElement("form");
    form.method = "dialog";
    form.className = "modal-card activity-modal-card";

    const head = document.createElement("div");
    head.className = "activity-modal-head";

    const h = document.createElement("h3");
    h.textContent = title;

    const closeTop = document.createElement("button");
    closeTop.className = "btn btn-ghost";
    closeTop.type = "submit";
    closeTop.value = "close";
    closeTop.setAttribute("aria-label", "Cerrar actividad");
    closeTop.textContent = "✕";

    head.appendChild(h);
    head.appendChild(closeTop);

    const body = document.createElement("div");
    body.className = "activity-modal-body";

    body.appendChild(activity);

    const foot = document.createElement("div");
    foot.className = "modal-actions";

    const closeBtn = document.createElement("button");
    closeBtn.className = "btn btn-primary";
    closeBtn.type = "submit";
    closeBtn.value = "close";
    closeBtn.textContent = "Cerrar";

    foot.appendChild(closeBtn);

    form.appendChild(head);
    form.appendChild(body);
    form.appendChild(foot);
    dialog.appendChild(form);
    document.body.appendChild(dialog);

    const launcher = document.createElement("div");
    launcher.className = "activity-launcher";
    launcher.dataset.activityLauncherFor = activityId;

    const launcherHead = document.createElement("div");
    launcherHead.className = "activity-launcher-head";

    const launcherTitle = document.createElement("h3");
    launcherTitle.textContent = title;

    const chip = document.createElement("span");
    chip.className = "activity-chip";
    chip.textContent = "ACTIVIDAD";

    launcherHead.appendChild(launcherTitle);
    launcherHead.appendChild(chip);

    const launcherText = document.createElement("p");
    launcherText.className = "activity-launcher-text";
    launcherText.textContent = firstParagraph;

    const launcherActions = document.createElement("div");
    launcherActions.className = "activity-launcher-actions";

    const openBtn = document.createElement("button");
    openBtn.className = "btn btn-primary";
    openBtn.type = "button";
    openBtn.textContent = "Abrir actividad";
    openBtn.addEventListener("click", () => {
      if (typeof dialog.showModal === "function") dialog.showModal();
    });

    launcherActions.appendChild(openBtn);

    launcher.appendChild(launcherHead);
    if (firstParagraph) launcher.appendChild(launcherText);
    launcher.appendChild(launcherActions);

    // Inserta el launcher donde estaba la actividad
    marker.replaceWith(launcher);
  });
}

function setFeedbackTone(feedbackEl, isCorrect) {
  if (!feedbackEl) return;
  feedbackEl.classList.remove("is-correct", "is-incorrect");
  if (isCorrect === true) feedbackEl.classList.add("is-correct");
  if (isCorrect === false) feedbackEl.classList.add("is-incorrect");
}

function setupMultipleChoiceActivities() {
  const activities = Array.from(
    document.querySelectorAll('.activity[data-activity-type="mcq"]')
  );

  activities.forEach((activity) => {
    const buttons = Array.from(activity.querySelectorAll("button[data-correct]"));
    const feedback = activity.querySelector(".feedback");

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        buttons.forEach((btn) => btn.classList.remove("selected"));
        button.classList.add("selected");

        if (feedback) {
          const isCorrect = button.dataset.correct === "true";
          setFeedbackTone(feedback, isCorrect);
          feedback.textContent = button.dataset.feedback || "";
        }

        const isCorrect = button.dataset.correct === "true";
        if (isCorrect) completeActivity(activity);
      });
    });

    activity.__odcReset = () => {
      buttons.forEach((btn) => btn.classList.remove("selected"));
      if (feedback) {
        setFeedbackTone(feedback, null);
        feedback.textContent = "";
      }
    };
  });
}

function setupChecklistActivities() {
  const activities = Array.from(
    document.querySelectorAll(
      '.activity[data-activity-type="checklist"], .activity[data-activity-type="multi"]'
    )
  );

  activities.forEach((activity) => {
    const checkBtn = activity.querySelector(".activity-check");
    const resetBtn = activity.querySelector(".activity-reset");
    const feedback = activity.querySelector(".feedback");
    const correctMessage =
      activity.dataset.feedbackCorrect ||
      "Correcto. Tus respuestas están alineadas con el objetivo.";
    const incorrectMessage =
      activity.dataset.feedbackIncorrect || "Revisa tus selecciones e inténtalo nuevamente.";

    if (checkBtn) {
      checkBtn.addEventListener("click", () => {
        const checkboxes = Array.from(activity.querySelectorAll('input[type="checkbox"]'));

        let isCorrect = true;

        checkboxes.forEach((checkbox) => {
          const required = checkbox.dataset.required === "true";
          const correct = checkbox.dataset.correct;

          if (required && !checkbox.checked) isCorrect = false;

          if (correct === "true" && !checkbox.checked) isCorrect = false;
          if (correct === "false" && checkbox.checked) isCorrect = false;
        });

        if (feedback) {
          setFeedbackTone(feedback, isCorrect);
          feedback.textContent = isCorrect ? correctMessage : incorrectMessage;
        }

        if (isCorrect) completeActivity(activity);
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        const checkboxes = Array.from(activity.querySelectorAll('input[type="checkbox"]'));
        checkboxes.forEach((checkbox) => {
          checkbox.checked = false;
        });

        if (feedback) {
          setFeedbackTone(feedback, null);
          feedback.textContent = "";
        }
      });
    }
  });
}

function setupDragDropActivities() {
  const activities = Array.from(
    document.querySelectorAll('.activity[data-activity-type="dragdrop"]')
  );

  activities.forEach((activity) => {
    const items = Array.from(activity.querySelectorAll(".drag-item"));
    const zones = Array.from(activity.querySelectorAll(".drop-zone"));
    const checkBtn = activity.querySelector(".activity-check");
    const resetBtn = activity.querySelector(".activity-reset");
    const feedback = activity.querySelector(".feedback");
    const mode = activity.dataset.dragdropMode || "pair";

    let selectedItem = null;

    items.forEach((item) => {
      item.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", item.dataset.item);
      });

      item.addEventListener("click", () => {
        selectedItem = item;
        items.forEach((i) => i.classList.remove("selected"));
        item.classList.add("selected");
      });
    });

    zones.forEach((zone) => {
      const slot = zone.querySelector(".drop-slot");

      zone.addEventListener("dragover", (event) => {
        event.preventDefault();
      });

      zone.addEventListener("drop", (event) => {
        event.preventDefault();

        const itemValue = event.dataTransfer.getData("text/plain");
        const item = items.find((i) => i.dataset.item === itemValue);

        if (item && slot) slot.appendChild(item);
      });

      zone.addEventListener("click", () => {
        if (selectedItem && slot) {
          slot.appendChild(selectedItem);
          selectedItem.classList.remove("selected");
          selectedItem = null;
        }
      });
    });

    if (checkBtn) {
      checkBtn.addEventListener("click", () => {
        if (mode === "group") {
          const allItems = Array.from(activity.querySelectorAll(".drag-item"));
          const origin = activity.querySelector(".drag-items");
          const placedItems = zones.flatMap((zone) =>
            Array.from(zone.querySelectorAll(".drop-slot .drag-item"))
          );
          const unplacedItems = origin
            ? Array.from(origin.querySelectorAll(".drag-item"))
            : [];

          let incorrectPlaced = 0;
          placedItems.forEach((item) => {
            const parentZone = item.closest(".drop-zone");
            const expected = parentZone?.dataset?.accept;
            const actual = item.dataset.category;
            const ok = expected && actual && expected === actual;
            item.classList.toggle("correct", Boolean(ok));
            item.classList.toggle("incorrect", !ok);
            if (!ok) incorrectPlaced += 1;
          });

          unplacedItems.forEach((item) => {
            item.classList.remove("correct", "incorrect");
          });

          const allPlaced = placedItems.length === allItems.length;
          const correct = allPlaced && incorrectPlaced === 0;

          if (feedback) {
            setFeedbackTone(feedback, correct);
            feedback.textContent = correct
              ? "Muy bien. Clasificar correctamente los residuos permite mejorar el aprovechamiento, evitar contaminación cruzada y fortalecer la cultura ambiental universitaria."
              : "Revisa la clasificación. Algunos residuos pierden valor cuando se mezclan o se contaminan. Por ejemplo, el plástico limpio puede reciclarse, pero un empaque sucio puede convertirse en residuo ordinario.";
          }

          if (correct) completeActivity(activity);
          return;
        }

        const correct = zones.every((zone) => {
          const slotItem = zone.querySelector(".drop-slot .drag-item");
          return slotItem && slotItem.dataset.item === zone.dataset.accept;
        });

        if (feedback) {
          setFeedbackTone(feedback, correct);
          feedback.textContent = correct
            ? "Correcto. Secuencia completa: datos → tecnología → sostenibilidad → decisiones."
            : "Aún falta ordenar la secuencia. Revisa qué va primero y valida de nuevo.";
        }

        if (correct) completeActivity(activity);
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        const dragItemsContainer = activity.querySelector(".drag-items");

        items.forEach((item) => {
          dragItemsContainer.appendChild(item);
          item.classList.remove("selected");
          item.classList.remove("correct", "incorrect");
        });

        selectedItem = null;
        if (feedback) {
          setFeedbackTone(feedback, null);
          feedback.textContent = "";
        }
      });
    }

    activity.__odcReset = () => {
      const dragItemsContainer = activity.querySelector(".drag-items");

      items.forEach((item) => {
        dragItemsContainer.appendChild(item);
        item.classList.remove("selected");
        item.classList.remove("correct", "incorrect");
      });

      if (feedback) {
        setFeedbackTone(feedback, null);
        feedback.textContent = "";
      }

      selectedItem = null;
    };
  });
}

function setupOrderActivities() {
  const activities = Array.from(
    document.querySelectorAll('.activity[data-activity-type="order"]')
  );

  activities.forEach((activity) => {
    const list = activity.querySelector(".order-list");
    const checkBtn = activity.querySelector(".activity-check");
    const resetBtn = activity.querySelector(".activity-reset");
    const feedback = activity.querySelector(".feedback");

    const fallbackOrder = ["Identificación", "Cribado", "Elegibilidad", "Inclusión"];
    const expectedOrder = (activity.dataset.orderCorrect || "")
      .split("|")
      .map((v) => v.trim())
      .filter(Boolean);
    const correctOrder = expectedOrder.length ? expectedOrder : fallbackOrder;

    const correctMessage =
      activity.dataset.feedbackCorrect ||
      (expectedOrder.length
        ? "Excelente. Comprendiste que el sistema no comienza con un dashboard, sino con datos bien capturados."
        : "Correcto. El orden PRISMA es adecuado.");

    const incorrectMessage =
      activity.dataset.feedbackIncorrect ||
      (expectedOrder.length
        ? "Revisa el flujo. Antes de analizar o visualizar información, es necesario capturar, almacenar y procesar los datos."
        : "Revisa el orden: identificación, cribado, elegibilidad e inclusión.");

    if (!list) return;

    list.addEventListener("click", (event) => {
      const upBtn = event.target.closest(".order-up");
      const downBtn = event.target.closest(".order-down");

      if (!upBtn && !downBtn) return;

      const item = event.target.closest(".order-item");
      if (!item) return;

      if (upBtn && item.previousElementSibling) {
        list.insertBefore(item, item.previousElementSibling);
      }

      if (downBtn && item.nextElementSibling) {
        list.insertBefore(item.nextElementSibling, item);
      }
    });

    if (checkBtn) {
      checkBtn.addEventListener("click", () => {
        const currentOrder = Array.from(list.querySelectorAll(".order-item")).map(
          (item) => item.dataset.step
        );

        const correct = currentOrder.every((step, index) => step === correctOrder[index]);

        if (feedback) {
          setFeedbackTone(feedback, correct);
          feedback.textContent = correct ? correctMessage : incorrectMessage;
        }

        if (correct) completeActivity(activity);
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        const items = Array.from(list.querySelectorAll(".order-item"));

        items
          .sort((a, b) => a.dataset.step.localeCompare(b.dataset.step))
          .forEach((item) => list.appendChild(item));

        if (feedback) {
          setFeedbackTone(feedback, null);
          feedback.textContent = "";
        }
      });
    }

    activity.__odcReset = () => {
      const items = Array.from(list.querySelectorAll(".order-item"));

      items
        .sort((a, b) => a.dataset.step.localeCompare(b.dataset.step))
        .forEach((item) => list.appendChild(item));

      if (feedback) {
        setFeedbackTone(feedback, null);
        feedback.textContent = "";
      }
    };
  });
}

function setupModule7Quiz() {
  const activities = Array.from(
    document.querySelectorAll('.activity[data-activity-type="module7-quiz"]')
  );

  activities.forEach((activity) => {
    const form = activity.querySelector(".module7-quiz-form");
    const checkBtn = activity.querySelector(".activity-check");
    const resetBtn = activity.querySelector(".activity-reset");
    const feedback = activity.querySelector(".feedback");

    if (!form || !checkBtn || !feedback) return;

    const answers = {
      q1: "b",
      q2: "a",
      q3: "a",
      q4: "a",
    };

    function validate() {
      const data = new FormData(form);
      let allAnswered = true;
      let allCorrect = true;

      Object.entries(answers).forEach(([question, correct]) => {
        const value = data.get(question);
        if (!value) {
          allAnswered = false;
          allCorrect = false;
        }

        if (value && value !== correct) {
          allCorrect = false;
        }
      });

      if (!allAnswered) {
        setFeedbackTone(feedback, false);
        feedback.textContent = "Responde todas las preguntas antes de verificar.";
        return;
      }

      setFeedbackTone(feedback, allCorrect);
      feedback.textContent = allCorrect
        ? "Muy bien. Todas las respuestas son correctas."
        : "Revisa tus respuestas y corrige las opciones incorrectas.";

      if (allCorrect) {
        completeActivity(activity, "¡Bien! El dato está listo para convertirse en decisión institucional.");
      }
    }

    function reset() {
      form.reset();
      setFeedbackTone(feedback, null);
      feedback.textContent = "";
    }

    checkBtn.addEventListener("click", validate);
    if (resetBtn) resetBtn.addEventListener("click", reset);

    activity.__odcReset = reset;
    reset();
  });
}

function setupPairsActivities() {
  const activities = Array.from(
    document.querySelectorAll('.activity[data-activity-type="pairs"]')
  );

  activities.forEach((activity) => {
    const cards = Array.from(activity.querySelectorAll(".m3-pairs-card"));
    const feedbackEl = activity.querySelector("[data-pairs-feedback]");
    const progressEl = activity.querySelector("[data-pairs-progress]");
    const resetBtn = activity.querySelector("[data-pairs-reset]");
    const levelTabs = Array.from(activity.querySelectorAll("[data-pairs-level-tab]"));
    const rightTitleEl = activity.querySelector("[data-pairs-right-title]");

    const techCards = cards.filter((card) => card.dataset.pairsGroup === "tech");
    const funcCards = cards.filter((card) => card.dataset.pairsGroup === "func");
    const appCards = cards.filter((card) => card.dataset.pairsGroup === "app");

    if (techCards.length === 0 || (funcCards.length === 0 && appCards.length === 0)) return;

    let currentLevel = "func";

    function getRightCards() {
      return currentLevel === "app" ? appCards : funcCards;
    }

    function getTotalPairs() {
      const rightCards = getRightCards();
      return Math.min(techCards.length, rightCards.length);
    }

    const hints = {
      analitica: "Piensa en interpretar registros y convertirlos en indicadores.",
      ia: "Esta tecnologia aprende de datos y puede predecir o clasificar.",
      iot: "Busca la opcion relacionada con sensores y captura automatica.",
      bigdata: "Se relaciona con grandes volumenes y variedad de datos.",
      sig: "Se relaciona con mapas, ubicacion y analisis espacial.",
      dashboard: "Sirve para visualizar indicadores de forma grafica.",
    };

    let selectedTech = null;
    let selectedRight = null;
    let matchedCount = 0;

    function setFeedback(message, tone) {
      if (!feedbackEl) return;
      feedbackEl.classList.remove("is-correct", "is-incorrect");
      if (tone === "correct") feedbackEl.classList.add("is-correct");
      if (tone === "incorrect") feedbackEl.classList.add("is-incorrect");
      feedbackEl.textContent = message || "";
    }

    function updateProgress() {
      if (!progressEl) return;
      progressEl.textContent = `${matchedCount} de ${getTotalPairs()} parejas`;
    }

    function clearSelections() {
      cards.forEach((card) => card.classList.remove("is-selected"));
      selectedTech = null;
      selectedRight = null;
    }

    function markMatched(techCard, rightCard) {
      techCard.classList.add("is-matched");
      rightCard.classList.add("is-matched");
      techCard.disabled = true;
      rightCard.disabled = true;
      techCard.setAttribute("aria-pressed", "false");
      rightCard.setAttribute("aria-pressed", "false");

      window.setTimeout(() => {
        techCard.classList.add("is-cleared");
        rightCard.classList.add("is-cleared");
        techCard.setAttribute("aria-hidden", "true");
        rightCard.setAttribute("aria-hidden", "true");
      }, 220);
    }

    function showFinalFeedback() {
      const totalPairs = getTotalPairs();

      if (matchedCount === totalPairs) {
        setFeedback(
          "Excelente. Comprendiste como cada tecnologia cumple una funcion dentro de una gestion inteligente de residuos: unas capturan datos, otras los procesan, otras los analizan y otras los visualizan para tomar decisiones.",
          "correct"
        );
        return;
      }

      if (matchedCount >= 3) {
        setFeedback(
          "Buen avance. Recuerda la ruta: IoT captura datos, Big Data los integra, la analitica y la IA los interpretan, el SIG los ubica en mapas y el dashboard los comunica mediante indicadores.",
          null
        );
        return;
      }

      setFeedback(
        "Revisa nuevamente las tarjetas. La gestion inteligente de residuos funciona como un sistema: primero se capturan datos, luego se procesan, se analizan y finalmente se visualizan para apoyar decisiones.",
        null
      );
    }

    function evaluatePair() {
      if (!selectedTech || !selectedRight) return;

      const keyTech = selectedTech.dataset.pairsKey;
      const keyRight = selectedRight.dataset.pairsKey;

      if (keyTech && keyTech === keyRight) {
        matchedCount += 1;
        markMatched(selectedTech, selectedRight);
        clearSelections();
        updateProgress();
        setFeedback("Correcto. Pareja encontrada.", "correct");

        if (matchedCount === getTotalPairs()) {
          showFinalFeedback();
          completeActivity(activity);
        }

        return;
      }

      const hint = hints[keyTech] || "Pista: revisa la funcion principal de la tecnologia.";
      setFeedback(`Incorrecto. ${hint}`, "incorrect");
      clearSelections();
    }

    function handleCardClick(card) {
      if (card.disabled) return;

      const group = card.dataset.pairsGroup;
      if (group !== "tech" && group !== "func" && group !== "app") return;

      if (group === "tech") {
        techCards.forEach((c) => c.classList.remove("is-selected"));
        selectedTech = card;
        card.classList.add("is-selected");
        card.setAttribute("aria-pressed", "true");
      } else {
        if (group !== currentLevel) return;

        const rightCards = getRightCards();
        rightCards.forEach((c) => c.classList.remove("is-selected"));
        selectedRight = card;
        card.classList.add("is-selected");
        card.setAttribute("aria-pressed", "true");
      }

      if (selectedTech && selectedRight) evaluatePair();
    }

    function reset() {
      matchedCount = 0;
      cards.forEach((card) => {
        card.disabled = false;
        card.classList.remove("is-selected", "is-matched", "is-cleared");
        card.setAttribute("aria-pressed", "false");
        card.removeAttribute("aria-hidden");
      });
      selectedTech = null;
      selectedRight = null;
      updateProgress();
      setFeedback("Elige una tecnologia y luego su funcion.", null);
    }

    function syncLevelUI() {
      const showFunc = currentLevel === "func";
      funcCards.forEach((card) => card.classList.toggle("is-hidden", !showFunc));
      appCards.forEach((card) => card.classList.toggle("is-hidden", showFunc));

      levelTabs.forEach((tab) => {
        const level = tab.dataset.pairsLevelTab;
        const active = level === currentLevel;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
      });

      if (rightTitleEl) {
        rightTitleEl.textContent = currentLevel === "app" ? "Aplicacion" : "Funcion";
      }

      setFeedback(
        currentLevel === "app"
          ? "Elige una tecnologia y luego su aplicacion institucional."
          : "Elige una tecnologia y luego su funcion.",
        null
      );
      updateProgress();
    }

    function setLevel(level) {
      if (level !== "func" && level !== "app") return;
      currentLevel = level;
      clearSelections();
      reset();
      syncLevelUI();
    }

    cards.forEach((card) => {
      card.setAttribute("aria-pressed", "false");
      card.addEventListener("click", () => handleCardClick(card));
    });

    if (resetBtn) resetBtn.addEventListener("click", reset);

    levelTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const level = tab.dataset.pairsLevelTab;
        setLevel(level);
      });
    });

    activity.__odcReset = reset;

    reset();
    syncLevelUI();
  });
}

/* =========================
   WORD SEARCH ACTIVITY (MÓDULO 6)
========================= */

function initializeWordSearch() {
  // Find all word search activities
  const wordSearchActivities = Array.from(
    document.querySelectorAll('[data-activity-type="wordsearch"]')
  );

  wordSearchActivities.forEach((activity) => {
    const grid = activity.querySelector(".ws-grid");
    const wordButtons = activity.querySelectorAll(".ws-word");
    const feedbackEl = activity.querySelector(".feedback");
    const resetBtn = activity.querySelector("[data-ws-reset]");

    if (!grid || wordButtons.length === 0) return;

    const words = Array.from(wordButtons)
      .map((btn) => (btn.dataset.word || "").trim().toUpperCase())
      .filter(Boolean);

    const maxWordLen = words.reduce((max, w) => Math.max(max, w.length), 0);

    function createSeededRandom(seedString) {
      // FNV-1a hash -> 32-bit seed
      let hash = 2166136261;
      for (let i = 0; i < seedString.length; i++) {
        hash ^= seedString.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      // Mulberry32
      return function random() {
        hash |= 0;
        hash = (hash + 0x6d2b79f5) | 0;
        let t = Math.imul(hash ^ (hash >>> 15), 1 | hash);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function buildWordSearchGrid(tableEl, size, wordList) {
      const random = createSeededRandom(
        `${activity.dataset.activityId || ""}-${activity.dataset.activitySection || ""}-${size}`
      );

      const gridMatrix = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => "")
      );

      const directions = [
        { dx: 1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 1, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: -1 },
        { dx: -1, dy: -1 },
        { dx: 1, dy: -1 },
        { dx: -1, dy: 1 },
      ];

      const sortedWords = [...wordList].sort((a, b) => b.length - a.length);

      function canPlace(word, row, col, dir) {
        for (let i = 0; i < word.length; i++) {
          const r = row + dir.dy * i;
          const c = col + dir.dx * i;
          const existing = gridMatrix[r][c];
          if (existing && existing !== word[i]) return false;
        }
        return true;
      }

      function placeWord(word) {
        const maxAttempts = 600;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const dir = directions[Math.floor(random() * directions.length)];
          const rowMin = dir.dy === -1 ? word.length - 1 : 0;
          const rowMax = dir.dy === 1 ? size - word.length : size - 1;
          const colMin = dir.dx === -1 ? word.length - 1 : 0;
          const colMax = dir.dx === 1 ? size - word.length : size - 1;

          const row = rowMin + Math.floor(random() * (rowMax - rowMin + 1));
          const col = colMin + Math.floor(random() * (colMax - colMin + 1));

          if (!canPlace(word, row, col, dir)) continue;

          for (let i = 0; i < word.length; i++) {
            const r = row + dir.dy * i;
            const c = col + dir.dx * i;
            gridMatrix[r][c] = word[i];
          }
          return true;
        }
        return false;
      }

      // Place all words; if any fail, fall back to a larger grid
      for (const word of sortedWords) {
        const ok = placeWord(word);
        if (!ok) return false;
      }

      // Fill the rest with random letters
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (!gridMatrix[r][c]) {
            gridMatrix[r][c] = alphabet[Math.floor(random() * alphabet.length)];
          }
        }
      }

      // Render table
      tableEl.innerHTML = "";
      const tbody = document.createElement("tbody");
      for (let r = 0; r < size; r++) {
        const tr = document.createElement("tr");
        for (let c = 0; c < size; c++) {
          const td = document.createElement("td");
          td.textContent = gridMatrix[r][c];
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      tableEl.appendChild(tbody);

      return true;
    }

    // Ensure the grid can actually contain the longest word (e.g., SOSTENIBILIDAD)
    let rows = grid.querySelectorAll("tr").length;
    let cols =
      grid.querySelector("tr")?.querySelectorAll("td")?.length || 0;

    const targetSize = Math.max(14, maxWordLen);
    if (rows < targetSize || cols < targetSize) {
      // Try build with target size; if placement fails (rare), grow and retry
      let size = targetSize;
      while (size <= targetSize + 4) {
        const built = buildWordSearchGrid(grid, size, words);
        if (built) break;
        size += 1;
      }
      rows = grid.querySelectorAll("tr").length;
      cols = grid.querySelector("tr")?.querySelectorAll("td")?.length || 0;
    }

    // Get cells from table (after potential rebuild)
    const cells = Array.from(grid.querySelectorAll("td"));

    // Track found words
    const foundWords = new Set();
    let selectedCells = [];
    let selectionStartCell = null;

    // Word list with positions (horizontal, vertical, diagonal directions)
    const wordPositions = findWords(cells, rows, cols);

    function findWords(cells, rows, cols) {
      const positions = {};
      words.forEach((word) => {
        // Check all directions: right, down, diagonal-right, diagonal-left
        const directions = [
          { dx: 1, dy: 0 }, // right
          { dx: 0, dy: 1 }, // down
          { dx: 1, dy: 1 }, // diagonal-right
          { dx: 1, dy: -1 }, // diagonal-left
          { dx: -1, dy: 0 }, // left
          { dx: 0, dy: -1 }, // up
          { dx: -1, dy: -1 }, // diagonal-left-up
          { dx: -1, dy: 1 }, // diagonal-right-up
        ];

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            for (const dir of directions) {
              const path = [];
              let match = true;

              for (let i = 0; i < word.length; i++) {
                const r = row + dir.dy * i;
                const c = col + dir.dx * i;

                if (r < 0 || r >= rows || c < 0 || c >= cols) {
                  match = false;
                  break;
                }

                const cellIndex = r * cols + c;
                const cellContent = cells[cellIndex]?.textContent?.trim() || "";

                if (cellContent !== word[i]) {
                  match = false;
                  break;
                }

                path.push(cellIndex);
              }

              if (match) {
                positions[word] = path;
              }
            }
          }
        }
      });

      return positions;
    }

    // Pointer events for grid selection (mouse + touch + pen)
    let activePointerId = null;

    function getCellIndexFromEvent(evt) {
      const target = evt.target instanceof Element ? evt.target : null;
      const td = target?.closest?.("td") || null;
      if (!td || !grid.contains(td)) return null;
      const idx = cells.indexOf(td);
      return idx >= 0 ? idx : null;
    }

    function finishSelection() {
      checkSelection();
      selectionStartCell = null;
      selectedCells = [];
      updateSelection();
      activePointerId = null;
    }

    grid.addEventListener("pointerdown", (evt) => {
      const index = getCellIndexFromEvent(evt);
      if (index === null) return;

      activePointerId = evt.pointerId;
      grid.setPointerCapture(activePointerId);

      selectionStartCell = index;
      selectedCells = [index];
      updateSelection();

      evt.preventDefault();
    });

    grid.addEventListener("pointermove", (evt) => {
      if (activePointerId === null || evt.pointerId !== activePointerId) return;
      if (selectionStartCell === null) return;

      const index = getCellIndexFromEvent(evt);
      if (index === null) return;

      selectedCells = getLineCells(selectionStartCell, index, rows, cols);
      updateSelection();
    });

    grid.addEventListener("pointerup", (evt) => {
      if (activePointerId === null || evt.pointerId !== activePointerId) return;
      finishSelection();
    });

    grid.addEventListener("pointercancel", (evt) => {
      if (activePointerId === null || evt.pointerId !== activePointerId) return;
      finishSelection();
    });

    // Helper to get cells in a line
    function getLineCells(start, end, rows, cols) {
      const startRow = Math.floor(start / cols);
      const startCol = start % cols;
      const endRow = Math.floor(end / cols);
      const endCol = end % cols;

      const path = [];
      const dx = endCol === startCol ? 0 : endCol > startCol ? 1 : -1;
      const dy = endRow === startRow ? 0 : endRow > startRow ? 1 : -1;

      let row = startRow;
      let col = startCol;

      while (true) {
        path.push(row * cols + col);
        if (row === endRow && col === endCol) break;
        if (row !== endRow) row += dy;
        if (col !== endCol) col += dx;
      }

      return path;
    }

    function updateSelection() {
      cells.forEach((cell, index) => {
        cell.classList.toggle("selected", selectedCells.includes(index));
      });
    }

    function checkSelection() {
      if (selectedCells.length === 0) return;

      const selectedText = selectedCells
        .map((i) => cells[i].textContent?.trim() || "")
        .join("");

      const selectedTextReverse = [...selectedCells]
        .reverse()
        .map((i) => cells[i].textContent?.trim() || "")
        .join("");

      let foundWord = null;

      for (const word of words) {
        if (
          selectedText === word ||
          selectedTextReverse === word ||
          selectedText === word.split("").reverse().join("")
        ) {
          foundWord = word;
          break;
        }
      }

      if (foundWord && !foundWords.has(foundWord)) {
        foundWords.add(foundWord);
        markWordAsFound(foundWord);
        updateFeedback(foundWord);

        if (foundWords.size === wordButtons.length) {
          showCompletionMessage();
        }
      }
    }

    function markWordAsFound(word) {
      // Mark cells
      const cellIndices = wordPositions[word] || [];
      cellIndices.forEach((index) => {
        cells[index].classList.add("found");
      });

      // Mark button
      const btn = Array.from(wordButtons).find(
        (b) => b.dataset.word === word
      );
      if (btn) {
        btn.classList.add("found");
        btn.disabled = true;
      }
    }

    function updateFeedback(foundWord) {
      const remaining = wordButtons.length - foundWords.size;
      if (remaining === 0) return;

      const btn = Array.from(wordButtons).find(
        (b) => (b.dataset.word || "").trim().toUpperCase() === foundWord
      );
      const label = (btn?.textContent || foundWord).replace(/\s+/g, " ").trim();
      const hint = (btn?.dataset.hint || "").trim();

      feedbackEl.textContent = hint
        ? `¡Bien! Encontraste "${label}". ${hint} Te quedan ${remaining} palabra${remaining === 1 ? "" : "s"}.`
        : `¡Bien! Encontraste "${label}". Te quedan ${remaining} palabra${remaining === 1 ? "" : "s"}.`;
      feedbackEl.classList.add("success");
      setTimeout(() => feedbackEl.classList.remove("success"), 2000);
    }

    function showCompletionMessage() {
      feedbackEl.textContent =
        "¡Excelente! Has encontrado todas las palabras del módulo 6.";
      feedbackEl.classList.add("success");
    }

    function reset() {
      foundWords.clear();
      selectedCells = [];
      selectionStartCell = null;

      cells.forEach((cell) => {
        cell.classList.remove("selected", "found");
      });

      wordButtons.forEach((btn) => {
        btn.classList.remove("found");
        btn.disabled = false;
      });

      feedbackEl.textContent = "Busca las palabras relacionadas con el módulo.";
      feedbackEl.classList.remove("success");
    }

    // Attach reset handler
    if (resetBtn) {
      resetBtn.addEventListener("click", reset);
    }

    activity.__odcReset = reset;

    // Initialize
    reset();
  });
}

// Initialize word search when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeWordSearch);
} else {
  initializeWordSearch();
}

/* =========================
   QUIZ FINAL
========================= */

function setupQuiz() {
  const finalQuiz = document.getElementById("finalQuiz");
  const resetQuizBtn = document.getElementById("resetQuizBtn");

  if (!finalQuiz) return;

  const items = Array.from(finalQuiz.querySelectorAll(".quiz-item"));

  function getCorrectLabelText(fieldset) {
    if (!fieldset) return "";
    const correctValue = fieldset.dataset.correct;
    if (!correctValue) return "";

    const correctInput = fieldset.querySelector(
      `input[type="radio"][value="${correctValue}"]`
    );
    if (!correctInput) return "";

    const label = correctInput.closest("label");
    if (!label) return "";

    return (label.textContent || "").replace(/\s+/g, " ").trim();
  }

  function showItemFeedback(fieldset) {
    const correctValue = fieldset.dataset.correct;
    const explanation = (fieldset.dataset.feedback || "").trim();
    const feedbackEl = fieldset.querySelector(".item-feedback");

    if (!feedbackEl || !correctValue) return;

    const selected = fieldset.querySelector('input[type="radio"]:checked');
    if (!selected) {
      feedbackEl.textContent = "";
      setFeedbackTone(feedbackEl, null);
      return;
    }

    const isCorrect = selected.value === correctValue;
    const correctText = getCorrectLabelText(fieldset);

    if (isCorrect) {
      setFeedbackTone(feedbackEl, true);
      feedbackEl.textContent = explanation
        ? `Correcto. ${explanation}`
        : "Correcto.";
      return;
    }

    setFeedbackTone(feedbackEl, false);
    feedbackEl.textContent = explanation
      ? `Incorrecto. Respuesta correcta: ${correctText} ${explanation}`
      : `Incorrecto. Respuesta correcta: ${correctText}`;
  }

  items.forEach((fieldset) => {
    fieldset.addEventListener("change", () => showItemFeedback(fieldset));
  });

  function computeScore() {
    const formData = new FormData(finalQuiz);
    let score = 0;

    for (let i = 1; i <= 8; i += 1) {
      const answer = formData.get(`q${i}`);
      const fieldset = finalQuiz
        .querySelector(`input[name="q${i}"]`)
        ?.closest?.(".quiz-item");
      const correct = fieldset?.dataset?.correct;
      if (correct && answer === correct) score += 1;
    }

    return score;
  }

  function renderFinalFeedback(score) {
    const quizResult = document.getElementById("quizResult");
    const quizReview = document.getElementById("quizReview");

    const passed = score >= 6;

    if (quizResult) {
      quizResult.textContent = `Obtuviste ${score} de 8 respuestas correctas.`;
      setFeedbackTone(quizResult, passed);
    }

    if (quizReview) {
      let message = "";

      if (score === 8) {
        message =
          "Excelente desempeño. Comprendiste los conceptos, tecnologías, indicadores y fundamentos metodológicos del ODC. Puedes explicar cómo la analítica de datos contribuye a una gestión de residuos más sostenible y basada en evidencia.";
      } else if (score >= 6) {
        message =
          "Buen desempeño. Alcanzaste el resultado de aprendizaje. Se recomienda repasar los módulos sobre indicadores, PRISMA y funcionamiento del sistema para fortalecer la comprensión.";
      } else if (score >= 4) {
        message =
          "Desempeño básico. Reconoces algunos conceptos importantes, pero necesitas revisar nuevamente los módulos centrales sobre tecnologías, indicadores y gestión inteligente.";
      } else {
        message =
          "Requiere refuerzo. Es recomendable volver a estudiar los módulos del ODC antes de repetir la evaluación, especialmente los conceptos de RSU, tecnologías digitales, indicadores y aplicación institucional.";
      }

      quizReview.textContent = message;
      setFeedbackTone(quizReview, passed);
    }
  }

  finalQuiz.addEventListener("submit", (event) => {
    event.preventDefault();

    items.forEach((fieldset) => showItemFeedback(fieldset));
    renderFinalFeedback(computeScore());
  });

  if (resetQuizBtn) {
    resetQuizBtn.addEventListener("click", () => {
      finalQuiz.reset();

      items.forEach((fieldset) => {
        const feedbackEl = fieldset.querySelector(".item-feedback");
        if (!feedbackEl) return;
        setFeedbackTone(feedbackEl, null);
        feedbackEl.textContent = "";
      });

      const quizResult = document.getElementById("quizResult");
      const quizReview = document.getElementById("quizReview");

      if (quizResult) {
        setFeedbackTone(quizResult, null);
        quizResult.textContent = "";
      }
      if (quizReview) {
        setFeedbackTone(quizReview, null);
        quizReview.textContent = "";
      }
    });
  }
}

/* =========================
   SIMULADOR / CHART
========================= */

function createChart() {
  const impactChartEl = document.getElementById("impactChart");

  if (!impactChartEl || typeof Chart === "undefined") return;

  const ctx = impactChartEl.getContext("2d");

  chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Ruta fija", "Umbral 80%", "Ruta dinámica"],
      datasets: [
        {
          label: "Kilómetros",
          data: [120, 95, 80],
          backgroundColor: "rgba(57, 255, 136, 0.5)",
          borderColor: "rgba(57, 255, 136, 1)",
          borderWidth: 1,
        },
        {
          label: "Combustible",
          data: [85, 70, 60],
          backgroundColor: "rgba(255, 255, 255, 0.15)",
          borderColor: "rgba(255, 255, 255, 0.65)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: {
            color: "#eefbf5",
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#eefbf5" },
          grid: { color: "rgba(255,255,255,0.08)" },
        },
        y: {
          ticks: { color: "#eefbf5" },
          grid: { color: "rgba(255,255,255,0.08)" },
        },
      },
    },
  });
}

function setupSimulator() {
  const simulateBtn = document.getElementById("simulateBtn");
  const resetSimBtn = document.getElementById("resetSimBtn");

  if (simulateBtn) {
    simulateBtn.addEventListener("click", () => {
      const selected = document.querySelector('input[name="simStrategy"]:checked');

      if (!selected) return;
      if (!chartInstance) createChart();

      const feedback = document.getElementById("simulatorFeedback");

      if (feedback) {
        feedback.textContent = `Estrategia seleccionada: ${selected.value}. Observa el gráfico y compara la eficiencia.`;
      }
    });
  }

  if (resetSimBtn) {
    resetSimBtn.addEventListener("click", () => {
      if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
      }

      const feedback = document.getElementById("simulatorFeedback");

      if (feedback) {
        feedback.textContent =
          "Simulación reiniciada. Selecciona una estrategia y presiona Simular.";
      }
    });
  }
}

/* =========================
   MODALES
========================= */

function setupModals() {
  const helpDialog = document.getElementById("helpDialog");
  const entryPuzzleDialog = document.getElementById("entryPuzzleDialog");
  const m2CircularDialog = document.getElementById("m2CircularDialog");
  const m3PairsDialog = document.getElementById("m3PairsDialog");

  document.addEventListener("click", (event) => {
    const target = event.target;

    if (target.matches("#helpBtn") && helpDialog) {
      helpDialog.showModal();
    }

    if (target.matches("#entryPuzzleBtn") && entryPuzzleDialog) {
      entryPuzzleDialog.showModal();
    }

    if (target.matches("#m2CircularOpen") && m2CircularDialog) {
      m2CircularDialog.showModal();
      const firstAction = m2CircularDialog.querySelector(".m2-circular-btn");
      if (firstAction) firstAction.focus();
    }

    if (target.matches("#m3PairsOpen") && m3PairsDialog) {
      m3PairsDialog.showModal();
      const firstCard = m3PairsDialog.querySelector(".m3-pairs-card");
      if (firstCard) firstCard.focus();
    }
  });

  if (m2CircularDialog) {
    m2CircularDialog.addEventListener("click", (event) => {
      if (event.target === m2CircularDialog && m2CircularDialog.open) {
        m2CircularDialog.close();
      }
    });
  }

  if (m3PairsDialog) {
    m3PairsDialog.addEventListener("click", (event) => {
      if (event.target === m3PairsDialog && m3PairsDialog.open) {
        m3PairsDialog.close();
      }
    });
  }
}

/* =========================
   INICIALIZACIÓN
========================= */

function init() {
  navLinks.forEach((link) => link.addEventListener("click", handleNavClick));
  sectionButtons.forEach((button) =>
    button.addEventListener("click", handleSectionButton)
  );

  if (prevBtn) {
    prevBtn.addEventListener("click", () => showSection(currentSectionIndex - 1));
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => showSection(currentSectionIndex + 1));
  }

  if (drawerToggle) {
    drawerToggle.addEventListener("click", toggleDrawer);
  }

  if (drawerClose) {
    drawerClose.addEventListener("click", closeDrawer);
  }

  if (drawer) {
    drawer.addEventListener("click", (event) => {
      if (event.target === drawer && drawer.classList.contains("open")) {
        closeDrawer();
      }
    });
  }

  setupVideoControls();
  setupSingleVideoPlayback();
  setupInfoDialog();
  setupCompletionDialog();
  setupInfoChips();
  setupM3TermDialog();
  setupM4AspectComparator();
  setupM5IndicatorsPanel();
  setupFlipCards();
  setupFlowGraphics();
  decorateSectionTargetButtons();
  setupCircularRouteActivity();
  setupActivityModals();
  setupActivities();
  setupQuiz();
  setupSimulator();
  setupModals();

  // Intenta autoplay en la sección activa (normalmente Portada)
  autoplayPrimaryVideo(sections[currentSectionIndex]);

  // En el primer gesto del usuario, fuerza audio activo (los navegadores suelen bloquear autoplay con sonido).
  document.addEventListener("pointerdown", enableAudioEverywhere, { once: true });
  document.addEventListener("keydown", enableAudioEverywhere, { once: true });

  applyModuleLockState();
  window.addEventListener("scroll", maybeCompleteActiveSection, { passive: true });

  if (window.location.hash) {
    const hashIndex = sections.findIndex(
      (section) => `#${section.id}` === window.location.hash
    );

    if (hashIndex !== -1) {
      showSection(hashIndex);
    } else {
      showSection(currentSectionIndex);
    }
  } else {
    showSection(currentSectionIndex);
  }

  updateProgress();
}

function decorateSectionTargetButtons() {
  const buttons = Array.from(
    document.querySelectorAll('button.btn.btn-primary[data-section-target]')
  );

  const emojiByTarget = {
    entrada: "🚀",
    "modulo-1": "🧭",
    "modulo-2": "🗑️",
    "modulo-3": "💻",
    "modulo-4": "⚖️",
    "modulo-5": "📏",
    "modulo-6": "📚",
    "modulo-7": "🧠",
    "modulo-8": "🏛️",
    evaluacion: "✅",
    conclusion: "🎓",
  };

  buttons.forEach((button) => {
    if (!button || button.dataset.decorated === "true") return;
    button.dataset.decorated = "true";

    const target = button.dataset.sectionTarget;
    const emoji = emojiByTarget[target] || "➡️";

    button.classList.add("btn-module-next");

    const originalText = button.textContent || "";
    button.textContent = "";

    const emojiSpan = document.createElement("span");
    emojiSpan.className = "btn-emoji";
    emojiSpan.setAttribute("aria-hidden", "true");
    emojiSpan.textContent = `${emoji} `;

    const textSpan = document.createElement("span");
    textSpan.className = "btn-text";
    textSpan.textContent = originalText.trim();

    const arrowSpan = document.createElement("span");
    arrowSpan.className = "btn-arrow";
    arrowSpan.setAttribute("aria-hidden", "true");
    arrowSpan.textContent = " →";

    button.appendChild(emojiSpan);
    button.appendChild(textSpan);
    button.appendChild(arrowSpan);
  });
}

document.addEventListener("DOMContentLoaded", init);
// ========== MODULE 1: PROBLEMA AMBIENTAL ==========

// Cause Explorer Interaction
document.addEventListener('DOMContentLoaded', function() {
  // Cause buttons
  const causeButtons = document.querySelectorAll('.m1-cause-btn');
  const causeContents = document.querySelectorAll('.m1-cause-content');

  causeButtons.forEach(button => {
    button.addEventListener('click', function() {
      const causeName = this.getAttribute('data-cause');

      // Remove active class from all buttons
      causeButtons.forEach(btn => btn.classList.remove('active'));
      causeButtons.forEach(btn => btn.setAttribute('aria-selected', 'false'));
      
      // Add active class to clicked button
      this.classList.add('active');
      this.setAttribute('aria-selected', 'true');

      // Hide all cause contents
      causeContents.forEach(content => content.classList.add('hidden'));

      // Show the selected cause content
      const selectedContent = document.getElementById(`m1-cause-${causeName}`);
      if (selectedContent) {
        selectedContent.classList.remove('hidden');
      }
    });
  });

  // Challenge options
  const options = document.querySelectorAll('.m1-option');
  options.forEach(option => {
    option.addEventListener('click', function() {
      this.classList.toggle('selected');
    });

    // Keyboard accessibility
    option.setAttribute('role', 'button');
    option.setAttribute('tabindex', '0');
    option.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.click();
      }
    });
  });

  // Verify button
  const verifyBtn = document.getElementById('m1-verify-btn');
  if (verifyBtn) {
    verifyBtn.addEventListener('click', function() {
      verifyChallenge();
    });
  }

  // Reset button
  const resetBtn = document.getElementById('m1-reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', function() {
      resetChallenge();
    });
  }

  // Audio controls
  const playBtn = document.getElementById('m1-play-btn');
  const stopBtn = document.getElementById('m1-stop-btn');
  
  if (playBtn && stopBtn) {
    // Create audio element dynamically
    let audioElement = document.getElementById('m1-audio-element');
    if (!audioElement) {
      audioElement = document.createElement('audio');
      audioElement.id = 'm1-audio-element';
      audioElement.src = 'assets/audio/modulo-1.mp3'; // Adjust path as needed
      document.body.appendChild(audioElement);
    }

    playBtn.addEventListener('click', function() {
      audioElement.play();
      playBtn.style.display = 'none';
      stopBtn.style.display = 'inline-flex';
    });

    stopBtn.addEventListener('click', function() {
      audioElement.pause();
      audioElement.currentTime = 0;
      stopBtn.style.display = 'none';
      playBtn.style.display = 'inline-flex';
    });

    audioElement.addEventListener('ended', function() {
      stopBtn.style.display = 'none';
      playBtn.style.display = 'inline-flex';
    });
  }
});

function verifyChallenge() {
  const selectedOptions = document.querySelectorAll('.m1-option.selected');
  const feedback = document.getElementById('m1-feedback');
  const feedbackText = document.getElementById('m1-feedback-text');
  const verifyBtn = document.getElementById('m1-verify-btn');
  
  // Correct options are 7 (data-correct="true")
  const correctOptions = document.querySelectorAll('.m1-option[data-correct="true"]');
  const incorrectOptions = document.querySelectorAll('.m1-option[data-correct="false"]');

  if (!feedback || !feedbackText || !verifyBtn) return;

  if (selectedOptions.length === 0) {
    feedback.classList.add('is-incorrect');
    feedback.classList.remove('is-correct');
    feedbackText.textContent = 'Selecciona al menos un dato antes de validar.';
    return;
  }
  
  let correctCount = 0;
  let userCorrectCount = 0;
  let userIncorrectCount = 0;

  selectedOptions.forEach(option => {
    if (option.getAttribute('data-correct') === 'true') {
      userCorrectCount++;
      option.classList.add('correct');
      option.classList.remove('selected');
    } else {
      userIncorrectCount++;
      option.classList.add('incorrect');
      option.classList.remove('selected');
    }
  });

  correctCount = correctOptions.length;

  // Calculate score
  const totalCorrect = correctOptions.length;
  const score = userCorrectCount;
  const percentage = totalCorrect > 0 ? Math.round((score / totalCorrect) * 100) : 0;

  // Provide feedback
  if (userIncorrectCount === 0 && userCorrectCount === totalCorrect) {
    feedback.classList.add('is-correct');
    feedback.classList.remove('is-incorrect');
    feedbackText.textContent = `¡Excelente! Seleccionaste correctamente los ${totalCorrect} datos necesarios. (${percentage}%)`;

    const activity = document.querySelector('.activity[data-activity-id="m1-datos"]');
    if (activity) completeActivity(activity);
  } else if (userIncorrectCount === 0) {
    feedback.classList.add('is-incorrect');
    feedback.classList.remove('is-correct');
    feedbackText.textContent = `Casi! Seleccionaste ${userCorrectCount} de ${totalCorrect} datos correctos. (${percentage}%) Falta seleccionar ${totalCorrect - userCorrectCount} dato(s) más.`;
  } else {
    feedback.classList.add('is-incorrect');
    feedback.classList.remove('is-correct');
    feedbackText.textContent = `Necesitas revisar. Seleccionaste ${userIncorrectCount} dato(s) incorrecto(s). Intenta de nuevo.`;
  }

  // Disable verification button
  verifyBtn.disabled = true;
}

function resetChallenge() {
  const options = document.querySelectorAll('.m1-option');
  const feedback = document.getElementById('m1-feedback');
  const feedbackText = document.getElementById('m1-feedback-text');
  const verifyBtn = document.getElementById('m1-verify-btn');

  options.forEach(option => {
    option.classList.remove('selected', 'correct', 'incorrect');
  });

  if (feedback) feedback.classList.remove('is-correct', 'is-incorrect');
  if (feedbackText) feedbackText.textContent = 'Selecciona los datos que creas que son útiles para la gestión ambiental.';
  
  if (verifyBtn) verifyBtn.disabled = false;
}

// Accessibility: Ensure all interactive elements are keyboard navigable
document.addEventListener('DOMContentLoaded', function() {
  const interactiveElements = document.querySelectorAll('.m1-cause-btn, .m1-option, .btn');
  
  interactiveElements.forEach(element => {
    if (!element.hasAttribute('tabindex')) {
      element.setAttribute('tabindex', '0');
    }

    // Focus visible indicator
    element.addEventListener('focus', function() {
      this.style.outline = '2px solid var(--primary)';
      this.style.outlineOffset = '2px';
    });

    element.addEventListener('blur', function() {
      this.style.outline = 'none';
    });

    // Keyboard interaction
    element.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.click();
      }
    });
  });
});
