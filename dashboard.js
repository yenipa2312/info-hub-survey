const refreshBtn = document.getElementById("refresh-btn");
const locationFilter = document.getElementById("location-filter");
const exportCsvBtn = document.getElementById("export-csv-btn");
const statusEl = document.getElementById("status");
const statsRowEl = document.getElementById("stats-row");
const groupsEl = document.getElementById("question-groups");

let allItems = [];

refreshBtn.addEventListener("click", loadItems);
locationFilter.addEventListener("change", render);
exportCsvBtn.addEventListener("click", exportCsv);

loadItems();

async function loadItems() {
  setStatus("Բեռնվում է...");
  try {
    const res = await fetch("/.netlify/functions/list");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load responses.");
    allItems = data.items || [];
    setStatus("");
    render();
  } catch (err) {
    setStatus(err.message, "error");
  }
}

function getVisibleItems() {
  const loc = locationFilter.value;
  return allItems.filter((i) => !loc || i.location === loc);
}

function render() {
  const visible = getVisibleItems();

  if (!visible.length) {
    statsRowEl.innerHTML = "";
    groupsEl.innerHTML = `<p class="empty-state">Պատասխաններ դեռ չկան։</p>`;
    return;
  }

  renderStats(visible);

  const cards = [
    tallyCard("Աշխատավայր", tally(visible, (i) => i.location)),
    tallyCard("Պաշտոն", tally(visible, (i) => i.role)),
    tallyCard("Որտեղ են փնտրում անհրաժեշտ տեղեկատվությունը", tallyMulti(visible, (i) => i.infoSources)),
    tallyCard(
      "Outlook նամակագրության դեպքում՝ ինչ տեսակի տեղեկատվություն",
      tallyMulti(
        visible.filter((i) => i.outlookTypes && i.outlookTypes.length),
        (i) => i.outlookTypes
      ),
      "Ցուցադրված է միայն նրանց մեջ, ովքեր նշել են Outlook նամակագրությունը"
    ),
    tallyCard("Պատասխան գտնելու ժամանակը", tally(visible, (i) => i.timeToFind)),
    tallyCard("Նախընտրելի լուծում", tallyMulti(visible, (i) => i.preferredSolutions)),
    tallyCard("Չաթբոտի օգտագործման հավանականություն (1–5)", tally(visible, (i) => String(i.chatbotLikelihood)), null, ["1", "2", "3", "4", "5"]),
    tallyCard("Ինչպես պատասխանի չաթբոտը", tallyMulti(visible, (i) => i.chatbotAnswerPrefs)),
  ].join("");

  const openText = `
    <div class="question-card stagger-in">
      <h3>Որտեղից սկսել (հարց 9)</h3>
      ${openTextList(visible, (i) => i.startingSource)}
    </div>
    <div class="question-card stagger-in">
      <h3>Այլ դիտողություններ (հարց 10)</h3>
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
    { value: topSource ? topSource[0] : "—", label: "Ամենահաճախ օգտագործվող աղբյուր" },
  ];

  statsRowEl.innerHTML = tiles
    .map(
      (t) => `
      <div class="stat-tile">
        <div class="stat-value">${escapeHtml(String(t.value))}</div>
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

function tallyCard(title, counts, note, forcedOrder) {
  const entries = forcedOrder
    ? forcedOrder.map((k) => [k, counts[k] || 0])
    : Object.entries(counts).sort((a, b) => b[1] - a[1]);

  if (!entries.length || entries.every(([, c]) => c === 0)) {
    return `
      <div class="question-card stagger-in">
        <h3>${escapeHtml(title)}</h3>
        <p class="empty-state">Տվյալ չկա</p>
      </div>`;
  }

  const max = Math.max(...entries.map(([, c]) => c), 1);

  const rows = entries
    .map(
      ([label, count]) => `
      <div class="bar-row">
        <span class="bar-label">${escapeHtml(label)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(count / max) * 100}%"></span></span>
        <span class="bar-count">${count}</span>
      </div>`
    )
    .join("");

  return `
    <div class="question-card stagger-in">
      <h3>${escapeHtml(title)}</h3>
      ${note ? `<p class="field-hint">${escapeHtml(note)}</p>` : ""}
      ${rows}
    </div>`;
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
      "Այլ դիտողություններ",
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
      i.otherNotes || "",
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
