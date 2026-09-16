// Dashboard endpoint - turns the two open-text questions into metrics:
//  - Q9 (startingSource) gets classified into a fixed category, matching
//    the platform's own content areas (products, procedures, campaigns,
//    internal news, systems, other) - so it can be charted like every
//    other question.
//  - Q10 (otherNotes) gets a short free-form topic label, reusing the
//    same label across similar notes so they cluster together.
// Only processes responses that don't have these fields yet.

const { responseStore, readAllResponses } = require("./lib/store");

const STARTING_SOURCE_THEMES = [
  "Ապրանքներ/ծառայություններ",
  "Ընթացակարգեր",
  "Արշավներ/առաջարկներ",
  "Ներքին նորություններ/որոշումներ",
  "Համակարգեր/տեխնիկական խնդիրներ",
  "Այլ",
];

exports.handler = async () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server is missing ANTHROPIC_API_KEY. Set it in Netlify env vars." }),
    };
  }

  const store = responseStore();
  const items = await readAllResponses(store);
  const unanalyzed = items.filter((item) => !item.startingSourceTheme);

  if (unanalyzed.length === 0) {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }),
    };
  }

  const listForPrompt = unanalyzed
    .map(
      (item) =>
        `${item.id}: startingSource: "${item.startingSource}"  otherNotes: ${item.otherNotes ? `"${item.otherNotes}"` : "(no otherNotes)"}`
    )
    .join("\n");

  const prompt = `You are analyzing an internal discovery survey for a bank's front-line
staff (branch + contact center) about building an internal info-hub
platform. All text is in Armenian.

For each response below, classify:
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

Respond with ONLY valid JSON (no markdown fences, no commentary), matching each item by its exact id:
{"items":[{"id":"...","startingSourceTheme":"...","otherNotesSubject":"..." or null}]}`;

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
      return { statusCode: response.status, body: JSON.stringify({ error: `Anthropic API error: ${errText}` }) };
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text ?? "{}";
    const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "");
    const parsed = JSON.parse(cleaned);

    const byId = new Map((parsed.items || []).map((i) => [i.id, i]));
    const updated = items.map((item) => {
      const result = byId.get(item.id);
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
        .filter((item) => byId.has(item.id))
        .map((item) => store.setJSON(`response-${item.id}`, item))
    );

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: updated }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
