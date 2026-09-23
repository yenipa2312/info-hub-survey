const analyzeBtn = document.getElementById("analyze-btn");
const refreshBtn = document.getElementById("refresh-btn");
const locationFilter = document.getElementById("location-filter");
const roleFilter = document.getElementById("role-filter");
const exportCsvBtn = document.getElementById("export-csv-btn");
const clearBtn = document.getElementById("clear-btn");
const statusEl = document.getElementById("status");
const statsRowEl = document.getElementById("stats-row");
const groupsEl = document.getElementById("question-groups");

const loginForm = document.getElementById("login-form");
const passcodeInput = document.getElementById("passcode");
const loginBtn = document.getElementById("login-btn");
const loginStatusEl = document.getElementById("login-status");
const dashboardContentEl = document.getElementById("dashboard-content");

const PASSCODE_KEY = "dashboardPasscode";

let allItems = [];
let memoryPasscode = null;

analyzeBtn.addEventListener("click", analyzeOpenAnswers);
refreshBtn.addEventListener("click", loadItems);
locationFilter.addEventListener("change", render);
roleFilter.addEventListener("change", render);
exportCsvBtn.addEventListener("click", exportCsv);
clearBtn.addEventListener("click", clearAllResponses);
loginForm.addEventListener("submit", login);

// Remembered per browser tab only (sessionStorage), so closing the tab
// logs out - sensible on shared bank machines.
if (getPasscode()) {
  loadItems();
} else {
  showLogin();
}

function getPasscode() {
  try {
    return sessionStorage.getItem(PASSCODE_KEY);
  } catch {
    return null;
  }
}

function setPasscode(value) {
  try {
    if (value) sessionStorage.setItem(PASSCODE_KEY, value);
    else sessionStorage.removeItem(PASSCODE_KEY);
  } catch {
    // storage blocked - the in-memory value still works for this page view
  }
  memoryPasscode = value;
}

function showLogin(message) {
  dashboardContentEl.hidden = true;
  loginForm.hidden = false;
  loginStatusEl.textContent = message || "";
  loginStatusEl.classList.toggle("error", Boolean(message));
  passcodeInput.focus();
}

async function login(e) {
  e.preventDefault();
  setPasscode(passcodeInput.value);
  loginBtn.disabled = true;
  const ok = await loadItems();
  loginBtn.disabled = false;
  if (ok) passcodeInput.value = "";
}

class UnauthorizedError extends Error {}

async function authedFetch(url, options = {}) {
  // URI-encoded: header values can't hold non-Latin characters, so an
  // Armenian-layout passcode would otherwise throw before being sent.
  const passcode = (getPasscode() || memoryPasscode || "").trim();
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), "x-dashboard-passcode": encodeURIComponent(passcode) },
  });
  if (res.status === 401 || res.status === 503) {
    setPasscode(null);
    const data = await res.json().catch(() => ({}));
    throw new UnauthorizedError(data.error || "Սխալ մուտքի կոդ");
  }
  return res;
}

async function loadItems() {
  setStatus("Բեռնվում է...");
  try {
    const res = await authedFetch("/.netlify/functions/list");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load responses.");
    allItems = data.items || [];
    loginForm.hidden = true;
    dashboardContentEl.hidden = false;
    setStatus("");
    render();
    return true;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      showLogin(err.message);
    } else if (dashboardContentEl.hidden) {
      showLogin(err.message);
    } else {
      setStatus(err.message, "error");
    }
    return false;
  }
}

async function analyzeOpenAnswers() {
  analyzeBtn.disabled = true;
  setStatus("Վերլուծվում է Claude-ի միջոցով...");
  try {
    // The server analyzes one batch per call; keep calling until nothing
    // is left. Stop if a call makes no progress, so a response Claude
    // can't classify can't spin this loop forever.
    let previousRemaining = Infinity;
    for (;;) {
      const res = await authedFetch("/.netlify/functions/analyze", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed.");
      allItems = data.items || [];
      render();

      const remaining = data.remaining ?? 0;
      if (remaining === 0) break;
      if (remaining >= previousRemaining) {
        throw new Error(`${remaining} պատասխան չհաջողվեց վերլուծել։ Փորձեք կրկին։`);
      }
      previousRemaining = remaining;
      setStatus(`Վերլուծվում է... մնացել է ${remaining} պատասխան`);
    }
    setStatus("Պատրաստ է։", "success");
  } catch (err) {
    if (err instanceof UnauthorizedError) showLogin(err.message);
    else setStatus(err.message, "error");
  } finally {
    analyzeBtn.disabled = false;
  }
}

async function clearAllResponses() {
  const total = allItems.length;
  if (!total) {
    setStatus("Ջնջելու պատասխաններ չկան։");
    return;
  }
  const ok = window.confirm(
    `Ջնջե՞լ բոլոր ${total} պատասխանները։\n\nԱյս գործողությունը հնարավոր չէ հետարկել։ ` +
      `Եթե պետք է պահպանել տվյալները, նախ սեղմեք «Արտահանել CSV»։`
  );
  if (!ok) return;

  clearBtn.disabled = true;
  setStatus("Ջնջվում է...");
  try {
    const res = await authedFetch("/.netlify/functions/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "DELETE_ALL" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Delete failed.");
    allItems = [];
    render();
    setStatus(`Ջնջվեց ${data.deleted} պատասխան։`, "success");
  } catch (err) {
    if (err instanceof UnauthorizedError) showLogin(err.message);
    else setStatus(err.message, "error");
  } finally {
    clearBtn.disabled = false;
  }
}

function getVisibleItems() {
  const loc = locationFilter.value;
  const role = roleFilter.value;
  return allItems.filter((i) => (!loc || i.location === loc) && (!role || i.role === role));
}

function render() {
  const visible = getVisibleItems();

  if (!visible.length) {
    statsRowEl.innerHTML = "";
    groupsEl.innerHTML = `<p class="empty-state">Պատասխաններ դեռ չկան։</p>`;
    return;
  }

  renderStats(visible);

  const total = visible.length;
  const outlookUsers = visible.filter((i) => i.outlookTypes && i.outlookTypes.length);

  // Donuts for single-choice questions (shares of one whole), bars for
  // multi-select (people pick several, so shares wouldn't add to 100%),
  // columns for the 1-5 scale.
  const cards = [
    donutCard("Աշխատավայր", tally(visible, (i) => i.location), total),
    tallyCard("Պաշտոն", tally(visible, (i) => i.role), total),
    tallyCard("Որտեղ են փնտրում անհրաժեշտ տեղեկատվությունը", tallyMulti(visible, (i) => i.infoSources), total, "Հնարավոր է մեկից ավելի պատասխան"),
    tallyCard(
      "Outlook նամակագրության դեպքում՝ ինչ տեսակի տեղեկատվություն",
      tallyMulti(outlookUsers, (i) => i.outlookTypes),
      outlookUsers.length,
      "Միայն նրանց մեջ, ովքեր նշել են Outlook նամակագրությունը"
    ),
    donutCard("Պատասխան գտնելու ժամանակը", tally(visible, (i) => i.timeToFind), total),
    tallyCard("Նախընտրելի լուծում", tallyMulti(visible, (i) => i.preferredSolutions), total, "Հնարավոր է մեկից ավելի պատասխան"),
    columnCard(
      "Չաթբոտի օգտագործման հավանականություն (1–5)",
      tally(visible, (i) => String(i.chatbotLikelihood)),
      total,
      visible.reduce((sum, i) => sum + (i.chatbotLikelihood || 0), 0) / total
    ),
    tallyCard("Ինչպես պատասխանի չաթբոտը", tallyMulti(visible, (i) => i.chatbotAnswerPrefs), total, "Հնարավոր է մեկից ավելի պատասխան"),
  ].join("");

  const q9Themed = visible.filter((i) => i.startingSourceTheme);
  const q9Card = q9Themed.length
    ? donutCard("Մեկնարկային աղբյուր (հարց 9)", tally(q9Themed, (i) => i.startingSourceTheme), q9Themed.length)
    : "";

  const q10Themed = visible.filter((i) => i.otherNotesSubject);
  const q10Card = q10Themed.length
    ? tallyCard("Այլ դիտողություններ՝ ըստ թեմայի (հարց 10)", tally(q10Themed, (i) => i.otherNotesSubject), q10Themed.length)
    : "";

  const openText = `
    ${q9Card}
    <div class="question-card stagger-in">
      <h3>Մեկնարկային աղբյուր — մանրամասնումներ (հարց 9)</h3>
      ${openTextList(
        visible.filter((i) => i.startingSourceDetail),
        (i) => `${i.startingSourceDetail} (${i.startingSource})`
      )}
    </div>
    ${q10Card}
    <div class="question-card stagger-in">
      <h3>Այլ դիտողություններ — բոլոր պատասխանները (հարց 10)</h3>
      ${openTextList(
        visible.filter((i) => i.otherNotes),
        (i) => i.otherNotes
      )}
    </div>`;

  groupsEl.innerHTML = cards + openText;
}

function renderStats(visible) {
  const total = visible.length;
  const avgLikelihood = (visible.reduce((sum, i) => sum + (i.chatbotLikelihood || 0), 0) / total).toFixed(1);
  const chatbotPct = Math.round(
    (visible.filter((i) => i.preferredSolutions.includes("AI չաթբոտ")).length / total) * 100
  );
  const sourceCounts = tallyMulti(visible, (i) => i.infoSources);
  const topSource = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0];

  const tiles = [
    { value: total, label: "Պատասխանների քանակ" },
    { value: avgLikelihood, label: "Միջին հավանականություն (1–5)" },
    { value: `${chatbotPct}%`, label: "Նախընտրում են AI չաթբոտ" },
    // A source name is long text, not a number - it needs to wrap at a
    // smaller size instead of overflowing the tile.
    { value: topSource ? topSource[0] : "—", label: "Ամենահաճախ օգտագործվող աղբյուր", text: true },
  ];

  statsRowEl.innerHTML = tiles
    .map(
      (t, i) => `
      <div class="stat-tile" style="--tile-accent: var(--chart-${i + 1})">
        <div class="stat-value${t.text ? " text" : ""}">${escapeHtml(String(t.value))}</div>
        <div class="stat-label">${escapeHtml(t.label)}</div>
      </div>`
    )
    .join("");
}

function tally(items, getValue) {
  const counts = {};
  for (const item of items) {
    const v = getValue(item);
    if (!v) continue;
    counts[v] = (counts[v] || 0) + 1;
  }
  return counts;
}

function tallyMulti(items, getValues) {
  const counts = {};
  for (const item of items) {
    const values = getValues(item) || [];
    for (const v of values) {
      counts[v] = (counts[v] || 0) + 1;
    }
  }
  return counts;
}

const CHART_COLORS = 6;

function cardShell(title, note, body) {
  return `
    <div class="question-card stagger-in">
      <h3>${escapeHtml(title)}</h3>
      ${note ? `<p class="field-hint">${escapeHtml(note)}</p>` : ""}
      ${body}
    </div>`;
}

function pct(count, total) {
  return total ? Math.round((count / total) * 100) : 0;
}

// Horizontal bars - used for multi-select questions and long option lists.
function tallyCard(title, counts, total, note) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return cardShell(title, note, `<p class="empty-state">Տվյալ չկա</p>`);

  const max = Math.max(...entries.map(([, c]) => c), 1);
  const rows = entries
    .map(
      ([label, count]) => `
      <div class="bar-row">
        <span class="bar-label">${escapeHtml(label)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(count / max) * 100}%"></span></span>
        <span class="bar-count">${count} · ${pct(count, total)}%</span>
      </div>`
    )
    .join("");

  return cardShell(title, note, rows);
}

// Donut - single-choice questions, where the slices really do make a whole.
function donutCard(title, counts, total, note) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return cardShell(title, note, `<p class="empty-state">Տվյալ չկա</p>`);

  // r chosen so the circumference is 100 - each slice's dasharray is then
  // simply its percentage.
  const r = 15.915;
  let offset = 25; // start at 12 o'clock
  const segments = entries
    .map(([label, count], i) => {
      const share = total ? (count / total) * 100 : 0;
      const circle = `<circle class="donut-seg" cx="21" cy="21" r="${r}" fill="none"
        stroke="var(--chart-${(i % CHART_COLORS) + 1})" stroke-width="6"
        stroke-dasharray="${share} ${100 - share}" stroke-dashoffset="${offset}"><title>${escapeHtml(label)}: ${count}</title></circle>`;
      offset = (offset - share + 100) % 100;
      return circle;
    })
    .join("");

  const legend = entries
    .map(
      ([label, count], i) => `
      <div class="legend-row">
        <span class="legend-dot" style="background: var(--chart-${(i % CHART_COLORS) + 1})"></span>
        <span class="legend-label">${escapeHtml(label)}</span>
        <span class="legend-value">${count} · ${pct(count, total)}%</span>
      </div>`
    )
    .join("");

  return cardShell(
    title,
    note,
    `<div class="donut-wrap">
       <svg class="donut" viewBox="0 0 42 42" role="img" aria-label="${escapeHtml(title)}">
         <circle cx="21" cy="21" r="${r}" fill="none" stroke="var(--surface-recessed)" stroke-width="6"></circle>
         ${segments}
         <text class="donut-center" x="21" y="21.5" text-anchor="middle" dominant-baseline="middle">${total}</text>
       </svg>
       <div class="legend">${legend}</div>
     </div>`
  );
}

// Vertical columns - the 1-5 rating, where the order of the scale matters.
function columnCard(title, counts, total, average) {
  const scale = ["1", "2", "3", "4", "5"];
  const values = scale.map((k) => counts[k] || 0);
  const max = Math.max(...values, 1);

  const columns = scale
    .map(
      (label, i) => `
      <div class="column">
        <span class="column-value">${values[i]}</span>
        <div class="column-bar" style="height:${(values[i] / max) * 100}%"></div>
        <span class="column-label">${label}</span>
        <span class="column-pct">${pct(values[i], total)}%</span>
      </div>`
    )
    .join("");

  return cardShell(
    title,
    null,
    `<div class="column-chart">${columns}</div>
     <p class="chart-caption">Միջինը՝ ${average.toFixed(1)} / 5 &nbsp;·&nbsp; 1 — բոլորովին հավանական չէ, 5 — շատ հավանական է</p>`
  );
}

function openTextList(items, getText) {
  const withText = items.filter((i) => getText(i));
  if (!withText.length) {
    return `<p class="empty-state">Պատասխաններ չկան</p>`;
  }
  return `
    <div class="open-text-list">
      ${withText
        .map(
          (i) => `
        <div class="open-text-item">
          ${escapeHtml(getText(i))}
          <span class="open-text-meta">${escapeHtml(i.name || "Անանուն")} &middot; ${escapeHtml(i.role)} &middot; ${escapeHtml(i.location)}</span>
        </div>`
        )
        .join("")}
    </div>`;
}

function exportCsv() {
  const visible = getVisibleItems();
  if (!visible.length) {
    setStatus("Արտահանելու տվյալ չկա։", "error");
    return;
  }

  const rows = [
    [
      "Անուն",
      "Աշխատավայր",
      "Պաշտոն",
      "Տեղեկատվության աղբյուրներ",
      "Outlook տեսակներ",
      "Ժամանակ",
      "Նախընտրելի լուծում",
      "Հավանականություն (1-5)",
      "Չաթբոտի պատասխանի նախապատվություն",
      "Որտեղից սկսել",
      "Մանրամասնում",
      "Սկսելու կատեգորիա",
      "Այլ դիտողություններ",
      "Դիտողության թեմա",
      "Ուղարկվել է",
    ],
  ];
  for (const i of visible) {
    rows.push([
      i.name || "Անանուն",
      i.location,
      i.role,
      i.infoSources.join("; "),
      (i.outlookTypes || []).join("; "),
      i.timeToFind,
      i.preferredSolutions.join("; "),
      i.chatbotLikelihood,
      i.chatbotAnswerPrefs.join("; "),
      i.startingSource,
      i.startingSourceDetail || "",
      i.otherNotes || "",
      i.otherNotesSubject || "",
      i.submittedAt,
    ]);
  }
  const content = rows.map((r) => r.map(csvEscape).join(",")).join("\n");

  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "info-hub-survey-export.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", kind === "error");
  statusEl.classList.toggle("success", kind === "success");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
