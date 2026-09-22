// Dashboard endpoint - returns every stored survey response as-is.
// Passcode-protected: responses include full names.
// Aggregation happens client-side in dashboard.js.

const { responseStore, readAllResponses } = require("./lib/store");
const { isAuthorized, UNAUTHORIZED } = require("./lib/auth");

exports.handler = async (event) => {
  if (!isAuthorized(event)) return UNAUTHORIZED;

  const store = responseStore();
  const items = await readAllResponses(store);

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items }),
  };
};
