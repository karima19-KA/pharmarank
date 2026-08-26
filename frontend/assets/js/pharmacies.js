renderSidebar("pharmacies");
document.getElementById("searchIcon").innerHTML = icon("search", 15);

const PAGE_SIZE = 5;
let currentRows = [];
let visibleCount = PAGE_SIZE;

function renderRows() {
  const tbody = document.getElementById("pharmaTbody");
  const footer = document.getElementById("tableFooter");

  if (!currentRows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Aucune pharmacie trouvée.</td></tr>`;
    footer.innerHTML = "";
    return;
  }

  const rows = currentRows.slice(0, visibleCount);
  tbody.innerHTML = rows.map(r => `
    <tr data-company="${encodeURIComponent(r.company_name)}">
      <td><span class="rank-badge">${r.rank}</span></td>
      <td>
        <div class="name-cell">
          <span class="avatar-initial">${initials(r.company_name)}</span>
          <div>
            <div style="font-weight:600">${r.company_name}</div>
            <div style="font-size:11px;color:var(--lb-text-muted)">${r.primary_address ? r.primary_address.slice(0, 40) : "Adresse non renseignée"}</div>
          </div>
        </div>
      </td>
      <td>${r.secteur ? `<span class="pill pill-neutral">${r.secteur}</span>` : "—"}</td>
      <td>${r.employe ? Math.round(r.employe).toLocaleString("fr-FR") : "—"}</td>
      <td>${r.other_addresses_count ?? 0}</td>
      <td>${r.has_website ? `<span class="pill pill-green">Oui</span>` : `<span class="pill pill-red">Non</span>`}</td>
      <td>${scoreBar(r.match_score)}</td>
    </tr>
  `).join("");

  tbody.querySelectorAll("tr[data-company]").forEach(tr => {
    tr.addEventListener("click", () => openDetail(decodeURIComponent(tr.dataset.company)));
  });

  if (visibleCount < currentRows.length) {
    footer.innerHTML = `<button class="btn-show-more" id="showMoreBtn">${icon("chevronRight", 13)} Afficher plus (${currentRows.length - visibleCount} restantes)</button>`;
    document.getElementById("showMoreBtn").addEventListener("click", () => {
      visibleCount += PAGE_SIZE;
      renderRows();
    });
  } else {
    footer.innerHTML = "";
  }
}

async function loadPharmacies(search = "") {
  currentRows = await apiGet("/pharmacies", { search });
  visibleCount = PAGE_SIZE;
  renderRows();
}

async function openDetail(companyName) {
  const panel = document.getElementById("detailPanel");
  panel.style.display = "block";
  panel.innerHTML = `<div class="loading">Chargement du profil…</div>`;
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });

  const d = await apiGet(`/pharmacies/${encodeURIComponent(companyName)}`);

  const employeesRows = (d.employees || []).slice(0, 8).map(e => `
    <tr>
      <td><div class="name-cell"><span class="avatar-initial">${initials(e.employee_name)}</span>${e.employee_name}</div></td>
      <td>${e.job_title || "—"}</td>
      <td>${e.ville_clean || "—"}</td>
      <td>${monthsToLabel(e.experience_months)}</td>
      <td>${currentPill(e.is_current)}</td>
    </tr>
  `).join("");

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
      <div>
        <div class="breadcrumb"><a href="#" onclick="closeDetail();return false;">← Retour à la liste</a></div>
        <div style="font-size:19px;font-weight:600">${d.company_name}</div>
        <div style="color:var(--lb-text-muted);font-size:13px">${d.secteur ?? "Secteur non renseigné"} · ${d.primary_address ?? "Adresse non renseignée"}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:26px;font-weight:700;color:var(--lb-primary-dark)">${d.match_score}</div>
        <div style="font-size:11.5px;color:var(--lb-text-muted)">score sur 100</div>
      </div>
    </div>

    <div class="grid-2">
      <div>
        <div class="section-title">Pourquoi ce score ?</div>
        ${d.score_breakdown.map(b => `
          <div class="breakdown-row">
            <div>
              <div class="label">${b.label}</div>
              <div class="weight">poids ${(b.weight * 100).toFixed(0)}% · valeur brute : ${b.raw ?? "—"}</div>
            </div>
            <div style="font-weight:600">${(b.normalized * 100).toFixed(0)}%</div>
          </div>
        `).join("")}
      </div>
      <div>
        <div class="section-title">Informations</div>
        <div class="breakdown-row"><div class="label">Site web</div><div>${d.website ? `<a href="${d.website}" target="_blank" style="color:var(--lb-primary-dark)">Visiter ↗</a>` : "—"}</div></div>
        <div class="breakdown-row"><div class="label">LinkedIn</div><div><a href="${d.linkedin_url}" target="_blank" style="color:var(--lb-primary-dark)">Profil ↗</a></div></div>
        <div class="breakdown-row"><div class="label">Autres sites</div><div>${d.other_addresses_count ?? 0}</div></div>
        <div class="breakdown-row"><div class="label">Employés indexés (scrape)</div><div>${(d.employees || []).length}</div></div>
      </div>
    </div>

    <div class="section-title" style="margin-top:6px">Employés scrapés (échantillon)</div>
    <table>
      <thead><tr><th>Nom</th><th>Poste</th><th>Ville</th><th>Expérience</th><th>Statut</th></tr></thead>
      <tbody>${employeesRows || `<tr><td colspan="5" class="empty-state">Aucun employé indexé pour cette pharmacie.</td></tr>`}</tbody>
    </table>
  `;
}

function closeDetail() {
  document.getElementById("detailPanel").style.display = "none";
}

document.getElementById("searchInput").addEventListener("input", (e) => {
  loadPharmacies(e.target.value);
});

loadPharmacies();

// support ?open=CompanyName deep link from dashboard
const params = new URLSearchParams(window.location.search);
if (params.get("open")) openDetail(params.get("open"));
