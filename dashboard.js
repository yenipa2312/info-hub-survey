const analyzeBtn = document.getElementById("analyze-btn");
const refreshBtn = document.getElementById("refresh-btn");
const locationFilter = document.getElementById("location-filter");
const roleFilter = document.getElementById("role-filter");
const exportCsvBtn = document.getElementById("export-csv-btn");
const statusEl = document.getElementById("status");
const summaryPanelEl = document.getElementById("summary-panel");
const statsRowEl = document.getElementById("stats-row");
const groupsEl = document.getElementById("question-groups");

let allItems = [];

analyzeBtn.addEventListener("click", analyzeOpenAnswers);
refreshBtn.addEventListener("click", loadItems);
locationFilter.addEventListener("change", render);
roleFilter.addEventListener("change", render);
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

async function analyzeOpenAnswers() {
  analyzeBtn.disabled = true;
  setStatus("Վերլուծվում է Claude-ի միջոցով...");
  try {
    const res = await fetch("/.netlify/functions/analyze", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Analysis failed.");
    allItems = data.items || [];
    setStatus("Պատրաստ է։", "success");
    render();
  } catch (err) {
    setStatus(err.message, "error");
  } finally {
    analyzeBtn.disabled = false;
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
    summaryPanelEl.hidden = true;
    statsRowEl.innerHTML = "";
    groupsEl.innerHTML = `<p class="empty-state">Պատասխաններ դեռ չկան։</p>`;
    return;
  }

  renderSummary(visible);
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

  const q9Themed = visible.filter((i) => i.startingSourceTheme);
  const q9Card = q9Themed.length
    ? tallyCard("Մեկնարկային աղբյուր՝ ըստ կատեգորիայի (հարց 9)", tally(q9Themed, (i) => i.startingSourceTheme))
    : `<div class="question-card stagger-in"><h3>Մեկնարկային աղբյուր (հարց 9)</h3><p class="field-hint">Դեռ չի վերլուծվել — սեղմեք «Վերլուծել բաց պատասխանները»</p></div>`;

  const q10Themed = visible.filter((i) => i.otherNotesSubject);
  const q10Card = q10Themed.length
    ? tallyCard("Այլ դիտողություններ՝ ըստ թեմայի (հարց 10)", tally(q10Themed, (i) => i.otherNotesSubject))
    : "";

  const openText = `
    ${q9Card}
    <div class="question-card stagger-in">
      <h3>Մեկնարկային աղբյուր — բոլոր պատասխանները (հարց 9)</h3>
      ${openTextList(visible, (i) => i.startingSource)}
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

function renderSummary(visible) {
  const total = visible.length;
  const avgLikelihood = visible.reduce((sum, i) => sum + (i.chatbotLikelihood || 0), 0) / total;
  const chatbotPct = Math.round(
    (visible.filter((i) => i.preferredSolutions.includes("AI չաթբոտ")).length / total) * 100
  );
  const slowPct = Math.round(
    (visible.filter((i) => i.timeToFind === "10 րոպեից ավելի" || i.timeToFind === "Հաճախ նախընտրում եմ հարցնել գործընկերոջս").length /
      total) *
      100
  );

  const sourceCounts = tallyMulti(visible, (i) => i.infoSources);
  const topSourceEntry = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0];

  const themed = visible.filter((i) => i.startingSourceTheme);
  const themeCounts = tally(themed, (i) => i.startingSourceTheme);
  const topThemeEntry = Object.entries(themeCounts).sort((a, b) => b[1] - a[1])[0];

  let text = `${total} պատասխանից ${slowPct}%-ը նշում է, որ ճիշտ պատասխան գտնելը տևում է 10+ րոպե կամ նախընտրում է հարցնել գործընկերոջը։ `;
  text += `Հարցվածների ${chatbotPct}%-ը նշել է AI չաթբոտը որպես նախընտրելի լուծումներից մեկը, միջին հավանականությունը՝ ${avgLikelihood.toFixed(1)}/5։ `;
  if (topSourceEntry) {
    text += `Ամենահաճախ օգտագործվող աղբյուրը՝ «${topSourceEntry[0]}»։ `;
  }
  if (topThemeEntry) {
    text += `Եթե սկսելու էինք մեկ բաժնից, ամենահաճախ ցանկալի կատեգորիան է՝ «${topThemeEntry[0]}» (${topThemeEntry[1]} պատասխան${themed.length < total ? `, ${total - themed.length} պատասխան դեռ չի վերլուծվել` : ""})։`;
  } else {
    text += `Հարց 9-ի պատասխանները դեռ չեն վերլուծվել կատեգորիաների — սեղմեք «Վերլուծել բաց պատասխանները»։`;
  }

  summaryPanelEl.hidden = false;
  summaryPanelEl.innerHTML = `<h3>Ամփոփում</h3><p>${escapeHtml(text)}</p>`;
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
      i.startingSourceTheme || "",
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
