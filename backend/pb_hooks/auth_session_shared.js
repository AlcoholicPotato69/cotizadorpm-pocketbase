(function () {
  function readHeader(e, name) {
    const safeName = String(name || "").trim();
    if (!safeName) return "";
    const header = e && e.request ? e.request.header : null;
    if (!header) return "";
    try {
      if (typeof header.get === "function") return String(header.get(safeName) || "").trim();
    } catch (_) {}
    try {
      if (typeof header.values === "function") {
        const values = header.values(safeName);
        if (Array.isArray(values) && values.length) return String(values[0] || "").trim();
      }
    } catch (_) {}
    try {
      const direct = header[safeName] || header[safeName.toLowerCase()] || header[safeName.toUpperCase()];
      if (Array.isArray(direct) && direct.length) return String(direct[0] || "").trim();
      return String(direct || "").trim();
    } catch (_) {}
    return "";
  }

  function normalizeAuthToken(rawToken) {
    const safe = String(rawToken || "").trim();
    if (!safe) return "";
    if (safe.toLowerCase().indexOf("bearer ") === 0) return String(safe.slice(7) || "").trim();
    return safe;
  }

  function shouldExposeTokenForRequest(e) {
    const authHeader = readHeader(e, "Authorization");
    if (authHeader) return true;
    // Browser fetch/XHR requests include Origin; return token so cross-origin clients can persist session.
    const origin = readHeader(e, "Origin");
    return !!origin;
  }

  module.exports = {
    readHeader,
    normalizeAuthToken,
    shouldExposeTokenForRequest
  };
})();
