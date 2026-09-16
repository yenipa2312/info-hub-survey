// Public endpoint - branch/contact-center staff POST their survey answers
// here. No auth: the link is meant to be open, low-stakes internal survey.

const { responseStore } = require("./lib/store");

const LOCATIONS = new Set(["Մասնաճյուղում", "Կոնտակտային կենտրոնում"]);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  const {
    location,
    role,
    name,
    infoSources,
    infoSourceOtherText,
    outlookTypes,
    outlookOtherText,
    timeToFind,
    preferredSolutions,
    chatbotLikelihood,
    chatbotAnswerPrefs,
    startingSource,
    otherNotes,
  } = body;

  if (!LOCATIONS.has(location)) {
    return { statusCode: 400, body: JSON.stringify({ error: "location is required" }) };
  }
  if (!role || typeof role !== "string") {
    return { statusCode: 400, body: JSON.stringify({ error: "role is required" }) };
  }
  if (!Array.isArray(infoSources) || infoSources.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "infoSources is required" }) };
  }
  if (!timeToFind || typeof timeToFind !== "string") {
    return { statusCode: 400, body: JSON.stringify({ error: "timeToFind is required" }) };
  }
  if (!Array.isArray(preferredSolutions) || preferredSolutions.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "preferredSolutions is required" }) };
  }
  if (!Number.isInteger(chatbotLikelihood) || chatbotLikelihood < 1 || chatbotLikelihood > 5) {
    return { statusCode: 400, body: JSON.stringify({ error: "chatbotLikelihood must be 1-5" }) };
  }
  if (!Array.isArray(chatbotAnswerPrefs) || chatbotAnswerPrefs.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "chatbotAnswerPrefs is required" }) };
  }
  if (!startingSource || typeof startingSource !== "string" || !startingSource.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: "startingSource is required" }) };
  }

  const store = responseStore();
  const items = (await store.get("items", { type: "json" })) || [];

  items.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    location,
    role,
    name: typeof name === "string" && name.trim() ? name.trim() : null,
    infoSources,
    infoSourceOtherText: typeof infoSourceOtherText === "string" && infoSourceOtherText.trim() ? infoSourceOtherText.trim() : null,
    outlookTypes: Array.isArray(outlookTypes) ? outlookTypes : null,
    outlookOtherText: typeof outlookOtherText === "string" && outlookOtherText.trim() ? outlookOtherText.trim() : null,
    timeToFind,
    preferredSolutions,
    chatbotLikelihood,
    chatbotAnswerPrefs,
    startingSource: startingSource.trim(),
    otherNotes: typeof otherNotes === "string" && otherNotes.trim() ? otherNotes.trim() : null,
    submittedAt: new Date().toISOString(),
  });

  await store.setJSON("items", items);

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
