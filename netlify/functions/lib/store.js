// Netlify normally auto-configures Blobs for deployed functions, but some
// sites don't get that context injected. Falling back to explicit
// siteID/token (from env vars) if they're set, per Netlify's own guidance
// for MissingBlobsEnvironmentError.
//
// Storage model: one blob per response (key = "response-<id>"), NOT a
// single shared array. This matters because the survey goes out to the
// whole front line at once - with a shared array, two people submitting
// at the same moment would overwrite each other. Separate keys never
// collide.

const { getStore } = require("@netlify/blobs");

function namedStore(name) {
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;

  if (siteID && token) {
    return getStore({ name, siteID, token });
  }

  return getStore(name);
}

function responseStore() {
  return namedStore("responses");
}

// Reads every response. Also picks up anything left in the old single
// "items" array from before the per-key switch, so no early responses
// get stranded.
async function readAllResponses(store) {
  const legacy = (await store.get("items", { type: "json" })) || [];

  const { blobs } = await store.list({ prefix: "response-" });
  const perKey = await Promise.all(
    blobs.map((blob) => store.get(blob.key, { type: "json" }))
  );

  return [...legacy, ...perKey.filter(Boolean)].sort((a, b) =>
    (a.submittedAt || "").localeCompare(b.submittedAt || "")
  );
}

module.exports = { responseStore, readAllResponses };
