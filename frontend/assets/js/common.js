const API_BASE = "/api";

const CHART_PALETTE = [
  "#F2665C", "#9FE1CB", "#5B8DEF", "#F2A93B", "#6C63F5",
  "#DC4E44", "#2ECC91", "#B23FA6", "#8B8790", "#F0EBEA",
];

async function apiGet(path, params = {}) {
  const url = new URL(API_BASE + path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status} on ${path}`);
  return res.json();
}

async function apiPost(path, body) {
  const url = new URL(API_BASE + path, window.location.origin);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status} on ${path}`);
  return res.json();
}

function initials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/);
  return (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
}

function scoreBar(score) {
  const pct = Math.max(0, Math.min(100, score || 0));
  return `<div style="display:flex;align-items:center;gap:8px">
    <div class="score-bar-track"><div class="score-bar-fill" style="width:${pct}%"></div></div>
    <span style="font-weight:600">${pct.toFixed(1)}</span>
  </div>`;
}

function currentPill(isCurrent) {
  return isCurrent
    ? `<span class="pill pill-green">● En poste</span>`
    : `<span class="pill pill-neutral">Historique</span>`;
}

function monthsToLabel(months) {
  if (months === null || months === undefined) return "—";
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} mois`;
  if (m === 0) return `${y} an${y > 1 ? "s" : ""}`;
  return `${y} an${y > 1 ? "s" : ""} ${m} mois`;
}

const SIDEBAR_GROUPS = [
  {
    label: "Analyse",
    dotLabel: "•",
    links: [
      { href: "index.html", ic: "dashboard", label: "Tableau de bord", key: "dashboard" },
      { href: "pharmacies.html", ic: "factory", label: "Pharmacies", key: "pharmacies" },
      { href: "candidates.html", ic: "users", label: "Candidats", key: "candidates" },
    ],
  },
  {
    label: "Outils",
    dotLabel: "••",
    links: [
      { href: "recruitment.html", ic: "target", label: "Recrutement", key: "recruitment" },
      { ic: "message", label: "Assistant IA", key: "assistant", action: "toggle-assistant" },
    ],
  },
];

const SIDEBAR_STORAGE_KEY = "pharmarank_sidebar_collapsed";

function renderSidebar(active) {
  const sidebarEl = document.getElementById("sidebar");

  const renderLink = (l) => {
    if (l.action) {
      return `
        <button type="button" class="nav-link nav-action" data-action="${l.action}" title="${l.label}">
          <span class="ic">${icon(l.ic, 17)}</span><span class="label">${l.label}</span>
        </button>`;
    }
    return `
      <a class="nav-link ${l.key === active ? "active" : ""}" href="${l.href}" title="${l.label}">
        <span class="ic">${icon(l.ic, 17)}</span><span class="label">${l.label}</span>
      </a>`;
  };

  sidebarEl.innerHTML = `
    <div class="brand"><span class="dot"></span> <span class="brand-text">Pharank</span></div>
    ${SIDEBAR_GROUPS.map(group => `
      <div class="nav-group-label">
        <span class="full-label">${group.label}</span>
        <span class="dot-label">${group.dotLabel}</span>
      </div>
      ${group.links.map(renderLink).join("")}
    `).join("")}
    <div class="sidebar-profile">
      <span class="avatar-initial">EA</span>
      <div class="who">
        <div class="name">Espace Admin</div>
      </div>
    </div>
  `;

  sidebarEl.querySelector('[data-action="toggle-assistant"]')
    ?.addEventListener("click", () => toggleAssistantPanel());

  const toggleBtn = document.createElement("button");
  toggleBtn.className = "collapse-toggle";
  toggleBtn.setAttribute("aria-label", "Réduire / afficher le menu");
  sidebarEl.appendChild(toggleBtn);

  const applyState = (collapsed) => {
    sidebarEl.classList.toggle("collapsed", collapsed);
    toggleBtn.innerHTML = icon(collapsed ? "chevronRight" : "chevronLeft", 12);
  };

  const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
  const collapsedByDefault = stored === null ? true : stored === "1";
  applyState(collapsedByDefault);

  toggleBtn.addEventListener("click", () => {
    const collapsed = !sidebarEl.classList.contains("collapsed");
    applyState(collapsed);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "1" : "0");
  });

  renderAssistantWidget();
}

/* ---------- AI Assistant (shared floating widget, all pages) ---------- */
const ASSISTANT_HISTORY_KEY = "pharmarank_assistant_history";

function getAssistantHistory() {
  try {
    return JSON.parse(sessionStorage.getItem(ASSISTANT_HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveAssistantHistory(history) {
  sessionStorage.setItem(ASSISTANT_HISTORY_KEY, JSON.stringify(history));
}

function toggleAssistantPanel(forceOpen) {
  const panel = document.getElementById("assistantPanel");
  if (!panel) return;
  const shouldOpen = forceOpen !== undefined ? forceOpen : !panel.classList.contains("open");
  panel.classList.toggle("open", shouldOpen);
  if (shouldOpen) {
    document.getElementById("assistantInput")?.focus();
  }
}

function renderAssistantMessages() {
  const container = document.getElementById("assistantMessages");
  if (!container) return;
  const history = getAssistantHistory();
  if (!history.length) {
    container.innerHTML = `<div class="assistant-empty">Pose une question sur les pharmacies ou les candidats : "Quelle est la meilleure pharmacie ?", "Top candidats à Casablanca ?"…</div>`;
    return;
  }
  container.innerHTML = history.map(m => `
    <div class="assistant-msg ${m.role}${m.error ? " error" : ""}">${m.content}</div>
  `).join("");
  container.scrollTop = container.scrollHeight;
}

async function sendAssistantMessage() {
  const input = document.getElementById("assistantInput");
  const message = input.value.trim();
  if (!message) return;
  input.value = "";

  const history = getAssistantHistory();
  history.push({ role: "user", content: message });
  saveAssistantHistory(history);
  renderAssistantMessages();

  const container = document.getElementById("assistantMessages");
  container.insertAdjacentHTML("beforeend", `<div class="assistant-msg assistant" id="assistantTyping">…</div>`);
  container.scrollTop = container.scrollHeight;

  try {
    const res = await apiPost("/assistant", { message, history: history.slice(0, -1) });
    document.getElementById("assistantTyping")?.remove();
    const updated = getAssistantHistory();
    updated.push({ role: "assistant", content: res.reply, error: !!res.error });
    saveAssistantHistory(updated);
    renderAssistantMessages();
  } catch (err) {
    document.getElementById("assistantTyping")?.remove();
    const updated = getAssistantHistory();
    updated.push({ role: "assistant", content: `Erreur : ${err.message}`, error: true });
    saveAssistantHistory(updated);
    renderAssistantMessages();
  }
}

function renderAssistantWidget() {
  if (document.getElementById("assistantFab")) return; // already rendered on this page

  const fab = document.createElement("button");
  fab.id = "assistantFab";
  fab.className = "assistant-fab";
  fab.innerHTML = icon("message", 24);
  fab.setAttribute("aria-label", "Ouvrir l'assistant IA");
  fab.addEventListener("click", () => toggleAssistantPanel());

  const panel = document.createElement("div");
  panel.id = "assistantPanel";
  panel.className = "assistant-panel";
  panel.innerHTML = `
    <div class="assistant-header">
      <span class="assistant-header-title">${icon("bot", 17)} Assistant Pharank</span>
      <button class="close-btn" id="assistantClose">${icon("x", 15)}</button>
    </div>
    <div class="assistant-messages" id="assistantMessages"></div>
    <div class="assistant-input-row">
      <input type="text" id="assistantInput" placeholder="Pose ta question…">
      <button id="assistantSend">${icon("send", 15)}</button>
    </div>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  document.getElementById("assistantClose").addEventListener("click", () => toggleAssistantPanel(false));
  document.getElementById("assistantSend").addEventListener("click", sendAssistantMessage);
  document.getElementById("assistantInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendAssistantMessage();
  });

  renderAssistantMessages();
}

// Small decorative up-trend sparkline used by colorful KPI icon cards
// (dashboard + recruitment). Shared here so every page can use it.
function miniSpark(color) {
  return `<svg class="kpi-spark" width="52" height="22" viewBox="0 0 52 22" fill="none">
    <polyline points="1,18 10,13 19,15 28,8 37,10 51,2" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}
