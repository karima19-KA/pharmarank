renderSidebar("dashboard");

let allPharmacies = [];
let chartInstance = null;

function parseSizeRange(value) {
  if (!value) return null;
  const [min, max] = value.split("-").map(Number);
  return { min, max };
}

function applyFilters() {
  const secteur = document.getElementById("secteurFilter").value;
  const sizeRange = parseSizeRange(document.getElementById("sizeFilter").value);

  return allPharmacies.filter(p => {
    if (secteur && p.secteur !== secteur) return false;
    if (sizeRange) {
      const emp = p.employe ?? 0;
      if (emp < sizeRange.min || emp > sizeRange.max) return false;
    }
    return true;
  });
}

function renderKpis(filtered) {
  const total = filtered.length;
  const avgScore = total ? (filtered.reduce((s, p) => s + (p.match_score || 0), 0) / total) : 0;
  const top = filtered[0]; // already sorted by rank/score from the API

  document.getElementById("kpiGrid").innerHTML = `
    <div class="card kpi-card-icon tone-purple">
      <div class="kpi-icon-badge">${icon("building", 22)}</div>
      <div class="kpi-body">
        <span class="kpi-label">Pharmacies (filtrées)</span>
        <span class="kpi-value">${total}</span>
        <span class="kpi-sub">Sur ${allPharmacies.length} au total</span>
      </div>
      ${miniSpark("#6C63F5")}
    </div>
    <div class="card kpi-card-icon tone-red">
      <div class="kpi-icon-badge">${icon("users", 22)}</div>
      <div class="kpi-body">
        <span class="kpi-label">Candidats indexés</span>
        <span class="kpi-value" id="kpiCandidates">—</span>
        <span class="kpi-sub">Profils employés scrapés</span>
      </div>
      ${miniSpark("#F2665C")}
    </div>
    <div class="card kpi-card-icon tone-blue">
      <div class="kpi-icon-badge">${icon("star", 22)}</div>
      <div class="kpi-body">
        <span class="kpi-label">Score moyen</span>
        <span class="kpi-value">${avgScore.toFixed(1)}</span>
        <span class="kpi-sub">Sur 100</span>
      </div>
      ${miniSpark("#5B8DEF")}
    </div>
    <div class="card kpi-card-icon tone-green">
      <div class="kpi-icon-badge">${icon("medal", 22)}</div>
      <div class="kpi-body">
        <span class="kpi-label">Meilleure pharmacie</span>
        <span class="kpi-value">${top?.company_name ?? "—"}</span>
        <span class="kpi-sub">${top?.match_score ?? "—"} / 100</span>
      </div>
      ${miniSpark("#2ECC91")}
    </div>
  `;
}

function renderChart(filtered) {
  const top10 = filtered.slice(0, 10);
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(document.getElementById("topChart"), {
    type: "bar",
    data: {
      labels: top10.map(d => d.company_name),
      datasets: [{
        data: top10.map(d => d.match_score),
        backgroundColor: "#6C63F5",
        borderRadius: 6,
        maxBarThickness: 26,
      }],
    },
    options: {
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: { max: 100, grid: { color: "#F0EEFA" } },
        y: { grid: { display: false } },
      },
    },
  });
}

async function renderTopCard(filtered) {
  const panel = document.getElementById("topPharmacyCard");
  const top = filtered[0];
  if (!top) {
    panel.innerHTML = `<div class="empty-state">Aucune pharmacie ne correspond à ces filtres.<div class="empty-hint">Essayez d'élargir les critères ci-dessus.</div></div>`;
    return;
  }
  const detail = await apiGet(`/pharmacies/${encodeURIComponent(top.company_name)}`);
  panel.innerHTML = `
    <div style="font-size:17px;font-weight:600;margin-bottom:4px">${detail.company_name}</div>
    <div style="color:var(--lb-text-muted);font-size:13px;margin-bottom:14px">${detail.secteur ?? "Secteur non renseigné"}</div>
    ${detail.score_breakdown.map(b => `
      <div class="breakdown-row">
        <div>
          <div class="label">${b.label}</div>
          <div class="weight">poids ${(b.weight * 100).toFixed(0)}%</div>
        </div>
        <div style="font-weight:600">${(b.normalized * 100).toFixed(0)}%</div>
      </div>
    `).join("")}
    <a class="btn btn-outline" style="margin-top:14px;width:100%;justify-content:center"
       href="pharmacies.html?open=${encodeURIComponent(detail.company_name)}">Voir le profil complet</a>
  `;
}

function refresh() {
  const filtered = applyFilters();
  renderKpis(filtered);
  renderChart(filtered);
  renderTopCard(filtered);
}

function exportCsv() {
  const filtered = applyFilters();
  if (!filtered.length) return;
  const cols = ["rank", "company_name", "secteur", "employe", "match_score", "primary_address", "website"];
  const header = cols.join(",");
  const rows = filtered.map(p => cols.map(c => {
    const v = p[c] ?? "";
    return `"${String(v).replace(/"/g, '""')}"`;
  }).join(","));
  const csv = [header, ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pharmacies_filtrees.csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function loadDashboard() {
  const [stats, pharmacies] = await Promise.all([apiGet("/stats"), apiGet("/pharmacies")]);
  allPharmacies = pharmacies;

  const secteurs = [...new Set(pharmacies.map(p => p.secteur).filter(Boolean))].sort();
  const secteurSelect = document.getElementById("secteurFilter");
  secteurs.forEach(s => secteurSelect.insertAdjacentHTML("beforeend", `<option value="${s}">${s}</option>`));

  refresh();
  document.getElementById("kpiCandidates").textContent = stats.total_candidates;

  document.getElementById("exportBtn").innerHTML = icon("download", 14) + " Exporter";

  document.getElementById("secteurFilter").addEventListener("change", refresh);
  document.getElementById("sizeFilter").addEventListener("change", refresh);
  document.getElementById("exportBtn").addEventListener("click", exportCsv);
}

loadDashboard().catch(err => {
  document.getElementById("kpiGrid").innerHTML = `<div class="card empty-state">Erreur de chargement : ${err.message}</div>`;
});

/* ================= New analytics charts ================= */

/* CHART_PALETTE is defined once in common.js and shared across pages */

async function renderSectorChart() {
  const data = await apiGet("/analytics/sector-breakdown");
  new Chart(document.getElementById("sectorChart"), {
    type: "doughnut",
    data: {
      labels: data.map(d => d.label),
      datasets: [{
        data: data.map(d => d.count),
        backgroundColor: CHART_PALETTE,
        borderWidth: 2,
        borderColor: "#fff",
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "right", labels: { boxWidth: 8, font: { size: 9.5 }, padding: 6 } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${ctx.raw} (${data[ctx.dataIndex].pct}%)`,
          },
        },
      },
    },
  });
}

async function renderEmployeeCountChart() {
  const data = await apiGet("/analytics/top-companies", { n: 15 });
  new Chart(document.getElementById("employeeCountChart"), {
    type: "bar",
    data: {
      labels: data.map(d => d.company_name),
      datasets: [{
        data: data.map(d => d.employe),
        backgroundColor: "#6C63F5",
        borderRadius: 5,
        maxBarThickness: 20,
      }],
    },
    options: {
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: "#F0EEFA" }, title: { display: true, text: "Employés (déclarés)" } },
        y: { grid: { display: false }, ticks: { font: { size: 10.5 } } },
      },
    },
  });
}

async function renderCitiesChart() {
  const data = await apiGet("/analytics/top-villes", { n: 10 });
  new Chart(document.getElementById("citiesChart"), {
    type: "bar",
    data: {
      labels: data.map(d => d.ville),
      datasets: [{
        data: data.map(d => d.count),
        backgroundColor: "#9FE1CB",
        borderRadius: 5,
        maxBarThickness: 20,
      }],
    },
    options: {
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: "#F0EEFA" }, title: { display: true, text: "Employés" } },
        y: { grid: { display: false }, ticks: { font: { size: 10.5 } } },
      },
    },
  });
}

async function renderSeniorityChart() {
  const data = await apiGet("/analytics/seniority");
  new Chart(document.getElementById("seniorityChart"), {
    type: "bar",
    data: {
      labels: data.map(d => d.label),
      datasets: [{
        data: data.map(d => d.count),
        backgroundColor: ["#6C63F5", "#9FE1CB", "#F2A93B", "#D3D1C7"],
        borderRadius: 6,
        maxBarThickness: 60,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { grid: { color: "#F0EEFA" }, title: { display: true, text: "Employés" } },
        x: { grid: { display: false } },
      },
    },
  });
}

async function renderHiringTrendChart() {
  const data = await apiGet("/analytics/hiring-trend");
  new Chart(document.getElementById("hiringTrendChart"), {
    type: "line",
    data: {
      labels: data.map(d => d.month),
      datasets: [{
        data: data.map(d => d.count),
        borderColor: "#6C63F5",
        backgroundColor: "rgba(108,99,245,0.12)",
        fill: true,
        tension: 0.35,
        pointRadius: 3,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { grid: { color: "#F0EEFA" }, title: { display: true, text: "Postes démarrés" } },
        x: { grid: { display: false } },
      },
    },
  });
}

/* ---------- Compare-laboratories radar with closable tags ---------- */
let compareChartInstance = null;
let compareSelected = [];
let compareAllCompanyNames = [];

async function refreshCompareChart() {
  if (compareChartInstance) compareChartInstance.destroy();
  if (!compareSelected.length) {
    return;
  }
  const data = await apiGet("/analytics/compare", { companies: compareSelected.join(",") });
  const axisLabels = ["Profondeur talent", "Taille effectif", "Présence digitale", "Portée marché", "Dynamique de recrutement"];
  const axisKeys = ["talent_depth", "workforce_scale", "digital_presence", "market_reach", "hiring_momentum"];

  compareChartInstance = new Chart(document.getElementById("compareChart"), {
    type: "radar",
    data: {
      labels: axisLabels,
      datasets: data.map((d, i) => ({
        label: d.company_name,
        data: axisKeys.map(k => d[k]),
        borderColor: CHART_PALETTE[i % CHART_PALETTE.length],
        backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length] + "33",
        pointRadius: 3,
      })),
    },
    options: {
      maintainAspectRatio: false,
      scales: { r: { min: 0, max: 100, ticks: { display: false } } },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } },
    },
  });
}

function renderCompareTags() {
  const box = document.getElementById("compareTagBox");
  const input = box.querySelector("#compareInput");
  box.querySelectorAll(".company-tag").forEach(t => t.remove());
  compareSelected.forEach(name => {
    const tag = document.createElement("span");
    tag.className = "company-tag";
    tag.innerHTML = `${name} <button type="button" aria-label="Retirer">✕</button>`;
    tag.querySelector("button").addEventListener("click", () => {
      compareSelected = compareSelected.filter(n => n !== name);
      renderCompareTags();
      refreshCompareChart();
    });
    box.insertBefore(tag, input);
  });
}

function setupCompareBox() {
  const input = document.getElementById("compareInput");
  const dropdown = document.getElementById("compareSuggestions");

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { dropdown.style.display = "none"; return; }
    const matches = compareAllCompanyNames
      .filter(n => n.toLowerCase().includes(q) && !compareSelected.includes(n))
      .slice(0, 8);
    if (!matches.length) { dropdown.style.display = "none"; return; }
    dropdown.innerHTML = matches.map(n => `<div class="tag-suggest-item" data-name="${n}">${n}</div>`).join("");
    dropdown.style.display = "block";
    dropdown.querySelectorAll(".tag-suggest-item").forEach(item => {
      item.addEventListener("click", () => {
        if (compareSelected.length >= 5) return;
        compareSelected.push(item.dataset.name);
        input.value = "";
        dropdown.style.display = "none";
        renderCompareTags();
        refreshCompareChart();
      });
    });
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".tag-select-wrap")) dropdown.style.display = "none";
  });
}

async function initCompareBox() {
  compareAllCompanyNames = await apiGet("/filters/companies");
  // seed with a sensible default trio so the radar isn't empty on first load
  compareSelected = compareAllCompanyNames.slice(0, 3);
  renderCompareTags();
  setupCompareBox();
  refreshCompareChart();
}

renderSectorChart();
renderEmployeeCountChart();
renderCitiesChart();
renderSeniorityChart();
renderHiringTrendChart();
initCompareBox();
