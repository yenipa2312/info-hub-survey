// Dashboard endpoint - permanently deletes every stored response, for
// wiping test data before the survey goes live. Passcode-protected, POST
// only, and the body must repeat back the confirmation word so a stray
// request can't trigger it.

const { responseStore } = require("./lib/store");
const { isAuthorized, UNAUTHORIZED } = require("./lib/auth");

exports.handler = async (event) => {
  if (!isAuthorized(event)) return UNAUTHORIZED;
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let confirm;
  try {
    ({ confirm } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) };
  }
  if (confirm !== "DELETE_ALL") {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing confirmation" }) };
  }

  const store = responseStore();
  const { blobs } = await store.list({ prefix: "response-" });
  const legacy = (await store.get("items", { type: "json" })) || [];

  await Promise.all(blobs.map((blob) => store.delete(blob.key)));
  await store.delete("items");

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deleted: blobs.length + legacy.length }),
  };
};
