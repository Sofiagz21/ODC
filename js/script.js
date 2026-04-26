/* =========================================================
   ODC | Gestión Inteligente de Residuos
   Navegación SPA + Drawer + Progreso + Simulador + Actividades
========================================================= */

const drawer = document.getElementById("drawer");
const drawerToggle = document.getElementById("drawerToggle");
const navLinks = document.querySelectorAll(".nav-link");
const screens = document.querySelectorAll(".screen");
const sectionButtons = document.querySelectorAll("[data-section-target]");

const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const progressBar = document.getElementById("progressBar");

const simulateBtn = document.getElementById("simulateBtn");
const feedback = document.getElementById("simulatorFeedback");
const chartCanvas = document.getElementById("impactChart");

let impactChart = null;

function syncDrawerToggleA11y() {
  if (!drawerToggle || !drawer) return;

  const isDesktop = window.innerWidth > 980;
  const expanded = isDesktop
    ? !drawer.classList.contains("collapsed")
    : drawer.classList.contains("open");

  drawerToggle.setAttribute("aria-expanded", String(expanded));
  drawerToggle.setAttribute("aria-label", expanded ? "Cerrar menu" : "Abrir menu");
}

/* -----------------------------
   Drawer lateral
----------------------------- */
if (drawerToggle && drawer) {
  drawerToggle.addEventListener("click", () => {
    const isDesktop = window.innerWidth > 980;

    if (isDesktop) {
      drawer.classList.toggle("collapsed");
      const expanded = !drawer.classList.contains("collapsed");
      drawerToggle.setAttribute("aria-expanded", String(expanded));
    } else {
      drawer.classList.toggle("open");
      const expanded = drawer.classList.contains("open");
      drawerToggle.setAttribute("aria-expanded", String(expanded));
    }

    syncDrawerToggleA11y();
  });
}

/* -----------------------------
   Utilidades de navegación
----------------------------- */
function getActiveIndex() {
  return [...screens].findIndex((screen) =>
    screen.classList.contains("active")
  );
}

function updateProgress() {
  const index = getActiveIndex();
  const total = screens.length;
  const progress = ((index + 1) / total) * 100;

  if (progressBar) {
    progressBar.style.width = `${progress}%`;
  }

  if (prevBtn) {
    prevBtn.disabled = index === 0;
  }

  if (nextBtn) {
    nextBtn.disabled = index === total - 1;
  }
}

/* -----------------------------
   Navegación SPA
----------------------------- */
function showSection(sectionId) {
  const currentScreen = document.querySelector(".screen.active");
  const targetScreen = document.getElementById(sectionId);

  if (!targetScreen || currentScreen === targetScreen) return;

  if (currentScreen) {
    currentScreen.classList.add("leaving");

    setTimeout(() => {
      currentScreen.classList.remove("active", "leaving");
      targetScreen.classList.add("active");
      targetScreen.setAttribute("tabindex", "-1");
      targetScreen.focus({ preventScroll: true });
      updateProgress();
    }, 250);
  } else {
    targetScreen.classList.add("active");
    updateProgress();
  }

  navLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.section === sectionId);
  });

  if (window.innerWidth <= 980 && drawer) {
    drawer.classList.remove("open");
    syncDrawerToggleA11y();
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    showSection(link.dataset.section);
  });
});

sectionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    showSection(button.dataset.sectionTarget);
  });
});

/* -----------------------------
   Botones Anterior / Siguiente
----------------------------- */
if (prevBtn) {
  prevBtn.addEventListener("click", () => {
    const index = getActiveIndex();
    const previousScreen = screens[index - 1];

    if (previousScreen) {
      showSection(previousScreen.id);
    }
  });
}

if (nextBtn) {
  nextBtn.addEventListener("click", () => {
    const index = getActiveIndex();
    const nextScreen = screens[index + 1];

    if (nextScreen) {
      showSection(nextScreen.id);
    }
  });
}

/* -----------------------------
   Pop-ups +info
----------------------------- */
const infoButtons = document.querySelectorAll(".info-chip");

const infoMessages = [
  "La falta de datos en tiempo real impide saber cuándo, dónde y cuánto recolectar, generando rutas ineficientes.",
  "La transformación digital no consiste solo en usar tecnología, sino en rediseñar procesos con información medible.",
  "La analítica de datos convierte registros en patrones, indicadores y evidencia para tomar mejores decisiones.",
  "Los sensores IoT permiten monitorear contenedores y activar rutas dinámicas según el nivel de llenado.",
  "Optimizar rutas reduce consumo de combustible, emisiones y costos operativos del sistema.",
  "Una decisión basada en datos se justifica con evidencia, indicadores y comparación de escenarios."
];

infoButtons.forEach((button, index) => {
  button.addEventListener("click", () => {
    showToast(infoMessages[index] || "Información adicional del módulo.");
  });
});

function showToast(message) {
  const existingToast = document.querySelector(".toast-message");

  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement("div");
  toast.className = "toast-message";
  toast.textContent = message;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("visible");
  }, 50);

  setTimeout(() => {
    toast.classList.remove("visible");

    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4500);
}

/* -----------------------------
   Actividades con retroalimentación
----------------------------- */
function checkAnswer(button, correct) {
  const activity = button.closest(".activity");
  const feedbackBox = activity.querySelector(".feedback");

  if (!activity || !feedbackBox) return;

  const buttons = activity.querySelectorAll("button");

  buttons.forEach((btn) => {
    btn.disabled = true;
    btn.classList.remove("answer-correct", "answer-wrong");
  });

  if (correct) {
    button.classList.add("answer-correct");
    feedbackBox.textContent =
      "✅ Correcto. Esta respuesta se relaciona con el uso de datos para mejorar la gestión de residuos.";
    feedbackBox.style.color = "#39ff88";
  } else {
    button.classList.add("answer-wrong");
    feedbackBox.textContent =
      "❌ Incorrecto. Revisa el contenido del módulo y piensa en cómo los datos apoyan la toma de decisiones.";
    feedbackBox.style.color = "#ff6b6b";
  }
}

window.checkAnswer = checkAnswer;

/* -----------------------------
   Simulador de decisión IoT
----------------------------- */
function runIoTSimulation() {
  if (!window.Chart || !chartCanvas) {
    if (feedback) {
      feedback.textContent =
        "No se pudo cargar Chart.js. Verifica la conexión o el enlace CDN.";
    }
    return;
  }

  const beforeIoT = {
    rutas: 100,
    combustible: 100,
    tiempo: 100,
    emisiones: 100,
    aprovechamiento: 42,
  };

  const afterIoT = {
    rutas: 72,
    combustible: 68,
    tiempo: 64,
    emisiones: 70,
    aprovechamiento: 78,
  };

  const labels = [
    "Rutas",
    "Combustible",
    "Tiempo",
    "Emisiones",
    "Aprovechamiento",
  ];

  if (impactChart) {
    impactChart.destroy();
  }

  impactChart = new Chart(chartCanvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Sin sensores IoT",
          data: Object.values(beforeIoT),
          borderWidth: 1,
          borderRadius: 10,
        },
        {
          label: "Con sensores IoT",
          data: Object.values(afterIoT),
          borderWidth: 1,
          borderRadius: 10,
        },
      ],
    },
    options: {
      responsive: true,
      animation: {
        duration: 1200,
        easing: "easeOutQuart",
      },
      plugins: {
        legend: {
          labels: {
            color: "#eefbf5",
            font: {
              weight: "bold",
            },
          },
        },
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.dataset.label}: ${context.raw}%`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#9fb8ad",
            font: {
              weight: "bold",
            },
          },
          grid: {
            color: "rgba(255,255,255,0.08)",
          },
        },
        y: {
          beginAtZero: true,
          max: 110,
          ticks: {
            color: "#9fb8ad",
            callback(value) {
              return `${value}%`;
            },
          },
          grid: {
            color: "rgba(255,255,255,0.08)",
          },
        },
      },
    },
  });

  if (feedback) {
    feedback.innerHTML = `
      <strong>Resultado de la simulación:</strong>
      con sensores IoT se reducen rutas, consumo de combustible, tiempo operativo
      y emisiones. Además, aumenta el aprovechamiento gracias a decisiones basadas
      en datos.
    `;
  }
}

if (simulateBtn) {
  simulateBtn.addEventListener("click", runIoTSimulation);
}

/* -----------------------------
   Navegación con teclado
----------------------------- */
document.addEventListener("keydown", (event) => {
  const index = getActiveIndex();

  if (event.key === "Escape") {
    if (drawer) {
      drawer.classList.remove("open");
    }

    syncDrawerToggleA11y();
  }

  if (event.key === "ArrowRight") {
    const nextScreen = screens[index + 1];

    if (nextScreen) {
      showSection(nextScreen.id);
    }
  }

  if (event.key === "ArrowLeft") {
    const previousScreen = screens[index - 1];

    if (previousScreen) {
      showSection(previousScreen.id);
    }
  }
});

/* -----------------------------
   Estado inicial
----------------------------- */
window.addEventListener("load", () => {
  updateProgress();
  syncDrawerToggleA11y();
});

window.addEventListener("resize", syncDrawerToggleA11y);
