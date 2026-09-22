// Dashboard passcode check. The passcode lives only in the Netlify env var
// DASHBOARD_PASSCODE - never in the page source - and the data endpoints
// (list, analyze) refuse to return anything without it. Hiding the
// dashboard page alone would be pointless: the endpoints are public URLs.
//
// Fails closed: if DASHBOARD_PASSCODE isn't set, nobody gets in.

const crypto = require("crypto");

function isAuthorized(event) {
  const expected = process.env.DASHBOARD_PASSCODE;
  const given = event.headers["x-dashboard-passcode"];
  if (!expected || typeof given !== "string") return false;

  // Hash both sides so the comparison is constant-time regardless of
  // length, and a wrong guess can't be timed character by character.
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

const UNAUTHORIZED = {
  statusCode: 401,
  body: JSON.stringify({ error: "Սխալ մուտքի կոդ" }),
};

module.exports = { isAuthorized, UNAUTHORIZED };
