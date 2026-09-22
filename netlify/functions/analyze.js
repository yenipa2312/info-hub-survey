// Dashboard endpoint - turns the two open-text questions into metrics:
//  - Q9 (startingSource) gets classified into a fixed category, matching
//    the platform's own content areas (products, procedures, campaigns,
//    internal news, systems, other) - so it can be charted like every
//    other question.
//  - Q10 (otherNotes) gets a short free-form topic label, reusing the
//    same label across similar notes so they cluster together.
//
// Processes at most BATCH_SIZE unanalyzed responses per call and reports
// how many remain; the dashboard calls again until none are left. One
// big call doesn't work: Armenian output is token-heavy, so ~25+ answers
// overflow the reply limit, and a long reply can outrun Netlify's ~10s
// function timeout.

const { responseStore, readAllResponses } = require("./lib/store");
const { isAuthorized, UNAUTHORIZED } = require("./lib/auth");

const BATCH_SIZE = 10;

const STARTING_SOURCE_THEMES = [
  "Ապրանքներ/ծառայություններ",
  "Ընթացակարգեր",
  "Արշավներ/առաջարկներ",
  "Ներքին նորություններ/որոշումներ",
  "Համակարգեր/տեխնիկական խնդիրներ",
  "Այլ",
];

function json(statusCode, body) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (!isAuthorized(event)) return UNAUTHORIZED;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(500, { error: "Server is missing ANTHROPIC_API_KEY. Set it in Netlify env vars." });
  }

  const store = responseStore();
  const items = await readAllResponses(store);
  const unanalyzed = items.filter((item) => !item.startingSourceTheme);

  if (unanalyzed.length === 0) {
    return json(200, { items, remaining: 0 });
  }

  const batch = unanalyzed.slice(0, BATCH_SIZE);

  // Numbered 1..N instead of the long record ids - shorter prompt, shorter
  // reply, and nothing for the model to mistype.
  const listForPrompt = batch
    .map(
      (item, i) =>
        `${i + 1}: startingSource: "${item.startingSource}"  otherNotes: ${item.otherNotes ? `"${item.otherNotes}"` : "(no otherNotes)"}`
    )
    .join("\n");

  const prompt = `You are analyzing an internal discovery survey for a bank's front-line
staff (branch + contact center) about building an internal info-hub
platform. All text is in Armenian.

For each numbered response below, classify:
- "startingSourceTheme": which category the "startingSource" answer
  (their answer to "if we could start with just one information source,
  which one") falls into. One of exactly: ${STARTING_SOURCE_THEMES.join(", ")}
- "otherNotesSubject": if "otherNotes" is present (not "(no otherNotes)"),
  a short (2-5 word) Armenian label for its topic. If two or more
  responses raise the same underlying point, use the EXACT SAME label
  text for all of them so they can be grouped together. If otherNotes is
  "(no otherNotes)", use null.

Responses:
${listForPrompt}

Respond with ONLY valid JSON (no markdown fences, no commentary), one entry per response number:
{"items":[{"n":1,"startingSourceTheme":"...","otherNotesSubject":"..." or null}]}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return json(response.status, { error: `Anthropic API error: ${errText}` });
    }

    const data = await response.json();
    if (data.stop_reason === "max_tokens") {
      return json(502, { error: "Claude's reply was cut off before finishing this batch." });
    }

    const raw = data.content?.[0]?.text ?? "{}";
    const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "");
    const parsed = JSON.parse(cleaned);

    const resultsById = new Map();
    for (const result of parsed.items || []) {
      const item = batch[Number(result.n) - 1];
      if (item) resultsById.set(item.id, result);
    }

    const updated = items.map((item) => {
      const result = resultsById.get(item.id);
      if (!result) return item;
      return {
        ...item,
        startingSourceTheme: STARTING_SOURCE_THEMES.includes(result.startingSourceTheme)
          ? result.startingSourceTheme
          : "Այլ",
        otherNotesSubject: result.otherNotesSubject || null,
      };
    });

    // Write back only the records that actually changed, each to its own
    // key - never rewrites the whole set, so a submission landing during
    // analysis can't be clobbered.
    await Promise.all(
      updated
        .filter((item) => resultsById.has(item.id))
        .map((item) => store.setJSON(`response-${item.id}`, item))
    );

    return json(200, { items: updated, remaining: unanalyzed.length - resultsById.size });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
