// Dashboard endpoint - returns every stored survey response as-is.
// Aggregation happens client-side in dashboard.js.

const { responseStore } = require("./lib/store");

exports.handler = async () => {
  const store = responseStore();
  const items = (await store.get("items", { type: "json" })) || [];

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items }),
  };
};
