// Dashboard passcode check. The passcode lives only in the Netlify env var
// DASHBOARD_PASSCODE - never in the page source - and the data endpoints
// (list, analyze, clear) refuse to return anything without it. Hiding the
// dashboard page alone would be pointless: the endpoints are public URLs.
//
// The browser sends the code URI-encoded: HTTP headers can't carry
// non-Latin characters, so a passcode typed on an Armenian keyboard
// layout would otherwise fail before it left the browser. Both sides are
// trimmed so a pasted trailing space doesn't lock the owner out.

const crypto = require("crypto");

function json(statusCode, error) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify({ error }) };
}

// Returns null when authorized, otherwise the response to send back.
function checkAuth(event) {
  const expected = (process.env.DASHBOARD_PASSCODE || "").trim();
  if (!expected) {
    // Still fails closed - but says why, so a missing/misscoped env var
    // isn't indistinguishable from a wrong code.
    return json(503, "DASHBOARD_PASSCODE-ը սերվերում սահմանված չէ (Netlify env var)");
  }

  const header = event.headers["x-dashboard-passcode"];
  if (typeof header !== "string" || !header) return json(401, "Սխալ մուտքի կոդ");

  let given;
  try {
    given = decodeURIComponent(header).trim();
  } catch {
    return json(401, "Սխալ մուտքի կոդ");
  }

  // Hash both sides so the comparison is constant-time regardless of
  // length, and a wrong guess can't be timed character by character.
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b) ? null : json(401, "Սխալ մուտքի կոդ");
}

module.exports = { checkAuth };
