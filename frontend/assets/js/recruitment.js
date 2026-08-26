renderSidebar("recruitment");

const PAGE_SIZE = 5;
let currentCandidateRows = [];
let visibleCandidateCount = PAGE_SIZE;

const ALL_TIERS = ["Elite Talent", "Strong Candidate", "Potential Candidate"];
let activeTiers = new Set(ALL_TIERS);

const TIER_PILL_CLASS = {
  "Elite Talent": "pill-elite",
  "Strong Candidate": "pill-strong",
  "Potential Candidate": "pill-potential",
  "À développer": "pill-develop",
};

function tierPill(tier) {
  return `<span class="pill ${TIER_PILL_CLASS[tier] || "pill-neutral"}">${tier}</span>`;
}

function renderTierFilters() {
  const bar = document.getElementById("tierFilters");
  bar.innerHTML = ALL_TIERS.map(t => `
    <button class="chip-filter ${activeTiers.has(t) ? "active" : ""}" data-tier="${t}">
      ${t} ${activeTiers.has(t) ? '<span class="x">✕</span>' : ""}
    </button>
  `).join("");

  bar.querySelectorAll(".chip-filter").forEach(btn => {
    btn.addEventListener("click", () => {
      const tier = btn.dataset.tier;
      if (activeTiers.has(tier)) activeTiers.delete(tier); else activeTiers.add(tier);
      renderTierFilters();
      loadCandidates();
    });
  });
}

async function loadKpis() {
  document.getElementById("recruitmentIcon").innerHTML = icon("target", 20);
  const stats = await apiGet("/recruitment/stats");
  const totalCandidates = stats.total_candidates
    ?? stats.tier_distribution.reduce((sum, t) => sum + t.count, 0);

  document.getElementById("kpiGrid").innerHTML = `
    <div class="card kpi-card-icon tone-purple">
      <div class="kpi-icon-badge">${icon("gem", 22)}</div>
      <div class="kpi-body">
        <span class="kpi-label">Talents Elite identifiés</span>
        <span class="kpi-value">${stats.elite_count}</span>
      </div>
    </div>
    <div class="card kpi-card-icon tone-red">
      <div class="kpi-icon-badge">${icon("medal", 22)}</div>
      <div class="kpi-body">
        <span class="kpi-label">Top candidat</span>
        <span class="kpi-value">${stats.top_candidate?.employee_name ?? "—"}</span>
        <span class="kpi-sub">Score : ${stats.top_candidate?.recruitment_score ?? "—"}/100</span>
      </div>
    </div>
    <div class="card kpi-card-icon tone-blue">
      <div class="kpi-icon-badge">${icon("trending", 22)}</div>
      <div class="kpi-body">
        <span class="kpi-label">Score de recrutement moyen</span>
        <span class="kpi-value">${stats.avg_score}</span>
      </div>
    </div>
    <div class="card kpi-card-icon tone-green">
      <div class="kpi-icon-badge">${icon("users", 22)}</div>
      <div class="kpi-body">
        <span class="kpi-label">Candidats évalués</span>
        <span class="kpi-value">${totalCandidates}</span>
      </div>
    </div>
  `;

  new Chart(document.getElementById("tierChart"), {
    type: "doughnut",
    data: {
      labels: stats.tier_distribution.map(t => t.tier),
      datasets: [{
        data: stats.tier_distribution.map(t => t.count),
        backgroundColor: CHART_PALETTE,
        borderWidth: 2,
        borderColor: "#fff",
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: "right", labels: { boxWidth: 8, font: { size: 9.5 }, padding: 6 } } },
    },
  });

  new Chart(document.getElementById("importanceChart"), {
    type: "bar",
    data: {
      labels: stats.feature_importance.map(f => f.feature),
      datasets: [{
        data: stats.feature_importance.map(f => f.importance),
        backgroundColor: CHART_PALETTE[0],
        borderRadius: 6,
        maxBarThickness: 16,
      }],
    },
    options: {
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: { max: 0.4, grid: { color: "#F0EEFA" }, ticks: { font: { size: 9.5 } } },
        y: { grid: { display: false }, ticks: { font: { size: 9.5 } } },
      },
    },
  });
}

async function loadCandidates() {
  const tbody = document.getElementById("candTbody");
  const footer = document.getElementById("tableFooter");
  tbody.innerHTML = `<tr><td colspan="6" class="loading">Chargement…</td></tr>`;
  footer.innerHTML = "";
  const tiersParam = [...activeTiers].join(",");
  currentCandidateRows = await apiGet("/recruitment/candidates", { tiers: tiersParam || "__none__" });
  visibleCandidateCount = PAGE_SIZE;
  renderCandidateRows();
}

function renderCandidateRows() {
  const tbody = document.getElementById("candTbody");
  const footer = document.getElementById("tableFooter");

  if (!currentCandidateRows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Aucun candidat pour ces tiers.</td></tr>`;
    footer.innerHTML = "";
    return;
  }

  const rows = currentCandidateRows.slice(0, visibleCandidateCount);
  tbody.innerHTML = rows.map(r => `
    <tr data-url="${encodeURIComponent(r.profile_url)}">
      <td><div class="name-cell"><span class="avatar-initial">${initials(r.employee_name)}</span>${r.employee_name}</div></td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.job_title || "—"}</td>
      <td><span class="pill pill-neutral">${r.company_name}</span></td>
      <td>${r.ville_clean || "—"}</td>
      <td>${monthsToLabel(r.experience_months)}</td>
      <td>${scoreBar(r.recruitment_score)}</td>
    </tr>
  `).join("");

  tbody.querySelectorAll("tr[data-url]").forEach(tr => {
    tr.addEventListener("click", () => openDetail(decodeURIComponent(tr.dataset.url)));
  });

  if (visibleCandidateCount < currentCandidateRows.length) {
    footer.innerHTML = `<button class="btn-show-more" id="showMoreCandBtn">${icon("chevronRight", 13)} Afficher plus (${currentCandidateRows.length - visibleCandidateCount} restants)</button>`;
    document.getElementById("showMoreCandBtn").addEventListener("click", () => {
      visibleCandidateCount += PAGE_SIZE;
      renderCandidateRows();
    });
  } else {
    footer.innerHTML = "";
  }
}

document.getElementById("voirToutBtn")?.addEventListener("click", () => {
  visibleCandidateCount = currentCandidateRows.length;
  renderCandidateRows();
});

async function openDetail(profileUrl) {
  const overlay = document.getElementById("detailOverlay");
  const panel = document.getElementById("detailPanel");
  overlay.style.display = "flex";
  panel.innerHTML = `<div class="loading">Chargement du profil…</div>`;

  const d = await apiGet("/recruitment/candidates/detail", { profile_url: profileUrl });

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
      <div>
        <div style="font-size:19px;font-weight:600">${d.employee_name}</div>
        <div style="color:var(--lb-text-muted);font-size:13px">${d.job_title || "—"} · ${d.company_name}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:26px;font-weight:700;color:var(--lb-primary-dark)">${d.recruitment_score}</div>
        <div style="font-size:11.5px;color:var(--lb-text-muted)">${tierPill(d.tier)}</div>
      </div>
    </div>
    <div class="section-title">Détail du score</div>
    ${d.score_breakdown.map(b => `
      <div class="breakdown-row">
        <div>
          <div class="label">${b.label}</div>
          <div class="weight">poids ${(b.weight * 100).toFixed(0)}%</div>
        </div>
        <div style="font-weight:600">${(b.normalized * 100).toFixed(0)}%</div>
      </div>
    `).join("")}
    <div style="display:flex;gap:8px;margin-top:14px">
      <a class="btn btn-outline" style="flex:1;justify-content:center" href="${d.profile_url}" target="_blank">Voir sur LinkedIn ↗</a>
      <button class="btn" id="closeDetailBtn">${icon("x", 14)} Fermer</button>
    </div>
  `;
  document.getElementById("closeDetailBtn").addEventListener("click", closeDetail);
}

function closeDetail() {
  document.getElementById("detailOverlay").style.display = "none";
}

document.getElementById("detailOverlay")?.addEventListener("click", (e) => {
  if (e.target.id === "detailOverlay") closeDetail();
});

renderTierFilters();
loadKpis();
loadCandidates();