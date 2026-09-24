// Public endpoint - branch/contact-center staff POST their survey answers
// here. No auth: the link is meant to be open, low-stakes internal survey.

const { responseStore } = require("./lib/store");

const LOCATIONS = new Set(["Մասնաճյուղում", "Կոնտակտային կենտրոնում"]);
const OUTLOOK_SOURCE = "Outlook նամակագրություն";

// Q9 is now a single choice from these categories, so the answer IS the
// category - no Claude classification needed for it any more.
const STARTING_SOURCES = new Set([
  "Ապրանքներ/ծառայություններ",
  "Ընթացակարգեր",
  "Արշավներ/առաջարկներ",
  "Ներքին նամակագրություններ(outlook)/որոշումներ",
  "Համակարգեր/տեխնիկական խնդիրներ",
  "Այլ",
]);

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
    startingSourceDetail,
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
  if (infoSources.includes(OUTLOOK_SOURCE) && (!Array.isArray(outlookTypes) || outlookTypes.length === 0)) {
    return { statusCode: 400, body: JSON.stringify({ error: "outlookTypes is required when Outlook is selected" }) };
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
  if (!STARTING_SOURCES.has(startingSource)) {
    return { statusCode: 400, body: JSON.stringify({ error: "startingSource must be one of the listed categories" }) };
  }

  const store = responseStore();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // One blob per response - concurrent submissions can't overwrite
  // each other the way a shared array would.
  await store.setJSON(`response-${id}`, {
    id,
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
    startingSource,
    // The chosen category is the theme - charts work immediately, with
    // no Analyze step and no classification error.
    startingSourceTheme: startingSource,
    startingSourceDetail:
      typeof startingSourceDetail === "string" && startingSourceDetail.trim() ? startingSourceDetail.trim() : null,
    otherNotes: typeof otherNotes === "string" && otherNotes.trim() ? otherNotes.trim() : null,
    submittedAt: new Date().toISOString(),
  });

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
