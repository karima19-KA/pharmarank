renderSidebar("candidates");

const PAGE_SIZE = 5;
let currentRows = [];
let visibleCount = PAGE_SIZE;

async function loadFilters() {
  const [villes, companies] = await Promise.all([
    apiGet("/filters/villes"),
    apiGet("/filters/companies"),
  ]);
  const villeSelect = document.getElementById("villeSelect");
  villes.forEach(v => villeSelect.insertAdjacentHTML("beforeend", `<option value="${v}">${v}</option>`));
  const companySelect = document.getElementById("companySelect");
  companies.forEach(c => companySelect.insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`));
}

function renderRows() {
  const tbody = document.getElementById("candTbody");
  const footer = document.getElementById("tableFooter");

  if (!currentRows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Aucun candidat ne correspond à ces critères.<div class="empty-hint">Essayez de réduire l'expérience minimale ou de retirer un filtre (ville / pharmacie).</div></td></tr>`;
    footer.innerHTML = "";
    return;
  }

  const rows = currentRows.slice(0, visibleCount);
  tbody.innerHTML = rows.map(r => `
    <tr data-url="${encodeURIComponent(r.profile_url)}">
      <td><div class="name-cell"><span class="avatar-initial">${initials(r.employee_name)}</span>${r.employee_name}</div></td>
      <td>${r.job_title || "—"}</td>
      <td><span class="pill pill-neutral">${r.company_name}</span></td>
      <td>${r.ville_clean || "—"}</td>
      <td>${monthsToLabel(r.experience_months)}</td>
      <td>${currentPill(r.is_current)}</td>
      <td>${scoreBar(r.match_score)}</td>
    </tr>
  `).join("");

  tbody.querySelectorAll("tr[data-url]").forEach(tr => {
    tr.addEventListener("click", () => openDetail(decodeURIComponent(tr.dataset.url)));
  });

  if (visibleCount < currentRows.length) {
    footer.innerHTML = `<button class="btn-show-more" id="showMoreBtn">${icon("chevronRight", 13)} Afficher plus (${currentRows.length - visibleCount} restants)</button>`;
    document.getElementById("showMoreBtn").addEventListener("click", () => {
      visibleCount += PAGE_SIZE;
      renderRows();
    });
  } else {
    footer.innerHTML = "";
  }
}

async function runSearch() {
  const minExp = document.getElementById("expInput").value;
  const ville = document.getElementById("villeSelect").value;
  const company = document.getElementById("companySelect").value;

  document.getElementById("candTbody").innerHTML = `<tr><td colspan="7" class="loading">Chargement…</td></tr>`;
  document.getElementById("tableFooter").innerHTML = "";
  currentRows = await apiGet("/candidates", {
    query: "", min_experience_years: minExp, ville, company,
  });
  visibleCount = PAGE_SIZE;
  renderRows();
}

async function openDetail(profileUrl) {
  const overlay = document.getElementById("detailOverlay");
  const panel = document.getElementById("detailPanel");
  overlay.style.display = "flex";
  panel.innerHTML = `<div class="loading">Chargement du profil…</div>`;

  const d = await apiGet("/candidates/detail", { profile_url: profileUrl, query: "" });

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
      <div>
        <div style="font-size:19px;font-weight:600">${d.employee_name}</div>
        <div style="color:var(--lb-text-muted);font-size:13px">${d.job_title || "—"} · ${d.company_name}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:26px;font-weight:700;color:var(--lb-primary-dark)">${d.match_score}</div>
        <div style="font-size:11.5px;color:var(--lb-text-muted)">score de correspondance</div>
      </div>
    </div>

    <div class="section-title">Détail du score</div>
    ${d.score_breakdown.map(b => `
      <div class="breakdown-row">
        <div>
          <div class="label">${b.label}</div>
          <div class="weight">poids ${(b.weight * 100).toFixed(0)}%${b.raw !== undefined ? ` · ${b.raw ?? "—"}` : ""}</div>
        </div>
        <div style="font-weight:600">${(b.normalized * 100).toFixed(0)}%</div>
      </div>
    `).join("")}

    <div class="section-title" style="margin-top:14px">Informations</div>
    <div class="breakdown-row"><div class="label">Ville</div><div>${d.ville_clean || "—"}</div></div>
    <div class="breakdown-row"><div class="label">Expérience estimée</div><div>${monthsToLabel(d.experience_months)}</div></div>
    <div class="breakdown-row"><div class="label">Statut</div><div>${currentPill(d.is_current)}</div></div>

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

document.getElementById("searchBtn").addEventListener("click", runSearch);

loadFilters();
runSearch();
