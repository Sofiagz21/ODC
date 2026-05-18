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

let speechSynthesisUtterance = null;
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
  stopSpeech();

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
  autoplaySectionVideos(sections[index]);

  if (audioUnlocked) {
    enableAudioEverywhere();
  }

  window.location.hash = sections[index].id;

  closeDrawer();
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

function speakText(text) {
  if (!window.speechSynthesis || !text) return;

  stopSpeech();

  speechSynthesisUtterance = new SpeechSynthesisUtterance(text);
  speechSynthesisUtterance.lang = "es-ES";
  speechSynthesisUtterance.rate = 1;

  speechSynthesis.speak(speechSynthesisUtterance);
}

function stopSpeech() {
  if (!window.speechSynthesis) return;

  speechSynthesis.cancel();
  speechSynthesisUtterance = null;
}

function setupAudioControls() {
  const narrationPlays = Array.from(document.querySelectorAll(".narration-play"));
  const narrationStops = Array.from(document.querySelectorAll(".narration-stop"));

  narrationPlays.forEach((button) => {
    button.addEventListener("click", () => {
      const narrationText = button.dataset.narration;
      speakText(narrationText);
    });
  });

  narrationStops.forEach((button) => {
    button.addEventListener("click", stopSpeech);
  });
}

/* =========================
   VIDEOS
========================= */

function setupVideoPlayer(videoId, playBtnId, volumeRangeId, volumeIconId) {
  const video = document.getElementById(videoId);
  const playBtn = document.getElementById(playBtnId);
  const volumeRange = document.getElementById(volumeRangeId);
  const volumeIcon = document.getElementById(volumeIconId);

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

function enableAudioEverywhere() {
  audioUnlocked = true;
  const videos = Array.from(document.querySelectorAll("video"));
  videos.forEach((video) => {
    video.muted = false;
    video.volume = 1;
  });

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

async function autoplaySectionVideos(section) {
  if (!section) return;
  const videos = Array.from(section.querySelectorAll("video"));

  for (const video of videos) {
    try {
      video.volume = 1;
      video.muted = !audioUnlocked;
      await video.play();
    } catch {
      // ignore
    }
  }
}

function setupVideoControls() {
  setupVideoPlayer(
    "portadaVideo",
    "playVideoBtn",
    "volumeRangePortada",
    "volumeIconPortada"
  );
  setupVideoPlayer(
    "entradaVideo",
    "playEntradaBtn",
    "volumeRangeEntrada",
    "volumeIconEntrada"
  );
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

/* =========================
   ACTIVIDADES
========================= */

function setupActivities() {
  setupMultipleChoiceActivities();
  setupChecklistActivities();
  setupDragDropActivities();
  setupOrderActivities();
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
      });
    });
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
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        const dragItemsContainer = activity.querySelector(".drag-items");

        items.forEach((item) => {
          dragItemsContainer.appendChild(item);
          item.classList.remove("selected");
        });

        selectedItem = null;
        if (feedback) {
          setFeedbackTone(feedback, null);
          feedback.textContent = "";
        }
      });
    }
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

    const correctOrder = ["Identificación", "Cribado", "Elegibilidad", "Inclusión"];

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
          feedback.textContent = correct
            ? "Correcto. El orden PRISMA es adecuado."
            : "Revisa el orden: identificación, cribado, elegibilidad e inclusión.";
        }
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
  });
}

/* =========================
   QUIZ FINAL
========================= */

function setupQuiz() {
  const finalQuiz = document.getElementById("finalQuiz");
  const resetQuizBtn = document.getElementById("resetQuizBtn");

  if (!finalQuiz) return;

  finalQuiz.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(finalQuiz);
    let score = 0;

    for (let i = 1; i <= 8; i += 1) {
      if (formData.get(`q${i}`) === "a") score += 1;
    }

    const quizResult = document.getElementById("quizResult");
    const quizReview = document.getElementById("quizReview");

    if (quizResult) {
      quizResult.textContent = `Obtuviste ${score} de 8 respuestas correctas.`;
      setFeedbackTone(quizResult, score === 8);
    }

    if (quizReview) {
      quizReview.textContent =
        score === 8
          ? "Muy bien: todas las respuestas son correctas."
          : "Revisa los módulos sugeridos para mejorar tu puntaje.";
      setFeedbackTone(quizReview, score === 8);
    }
  });

  if (resetQuizBtn) {
    resetQuizBtn.addEventListener("click", () => {
      finalQuiz.reset();

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
  const audioDialog = document.getElementById("audioDialog");
  const entryPuzzleDialog = document.getElementById("entryPuzzleDialog");

  document.addEventListener("click", (event) => {
    const target = event.target;

    if (target.matches("#helpBtn") && helpDialog) {
      helpDialog.showModal();
    }

    if (target.matches("#audioCtrlBtn") && audioDialog) {
      audioDialog.showModal();
    }

    if (target.matches("#entryPuzzleBtn") && entryPuzzleDialog) {
      entryPuzzleDialog.showModal();
    }
  });
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

  setupAudioControls();
  setupVideoControls();
  setupInfoDialog();
  setupInfoChips();
  setupActivities();
  setupQuiz();
  setupSimulator();
  setupModals();

  // Intenta autoplay en la sección activa (normalmente Portada)
  autoplaySectionVideos(sections[currentSectionIndex]);

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
      
      // Add active class to clicked button
      this.classList.add('active');

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
  
  // Correct options are 7 (data-correct="true")
  const correctOptions = document.querySelectorAll('.m1-option[data-correct="true"]');
  const incorrectOptions = document.querySelectorAll('.m1-option[data-correct="false"]');
  
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
  document.getElementById('m1-verify-btn').disabled = true;
}

function resetChallenge() {
  const options = document.querySelectorAll('.m1-option');
  const feedback = document.getElementById('m1-feedback');
  const feedbackText = document.getElementById('m1-feedback-text');
  const verifyBtn = document.getElementById('m1-verify-btn');

  options.forEach(option => {
    option.classList.remove('selected', 'correct', 'incorrect');
  });

  feedback.classList.remove('is-correct', 'is-incorrect');
  feedbackText.textContent = 'Selecciona los datos que creas que son útiles para la gestión ambiental.';
  
  verifyBtn.disabled = false;
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
