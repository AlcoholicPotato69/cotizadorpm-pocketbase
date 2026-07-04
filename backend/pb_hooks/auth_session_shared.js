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

  function isLoopbackHost(host) {
    const safe = String(host || "").trim().toLowerCase();
    return safe === "127.0.0.1" || safe === "localhost" || safe === "::1" || safe === "[::1]";
  }

  function isPrivateIpv4Host(host) {
    const safe = String(host || "").trim().toLowerCase();
    if (!safe || /[^0-9.]/.test(safe)) return false;
    if (safe.indexOf(".") === -1) return false;
    if (safe.indexOf("10.") === 0) return true;
    if (safe.indexOf("192.168.") === 0) return true;
    const parts = safe.split(".");
    const first = Number(parts[0] || 0);
    const second = Number(parts[1] || 0);
    return first === 172 && second >= 16 && second <= 31;
  }

  function parseUrlHost(rawUrl) {
    let safe = String(rawUrl || "").trim().toLowerCase();
    if (!safe || safe === "null") return "";
    safe = safe.replace(/^https?:\/\//, "");
    const slashIndex = safe.indexOf("/");
    if (slashIndex !== -1) safe = safe.slice(0, slashIndex);
    if (!safe) return "";
    if (safe.charAt(0) === "[") {
      const closingIndex = safe.indexOf("]");
      if (closingIndex !== -1) return safe.slice(1, closingIndex);
    }
    const colonIndex = safe.indexOf(":");
    if (colonIndex !== -1) safe = safe.slice(0, colonIndex);
    return String(safe || "").trim().toLowerCase();
  }

  function parseHeaderHost(rawHost) {
    const safe = String(rawHost || "").trim().toLowerCase();
    if (!safe) return "";
    if (safe.charAt(0) === "[") {
      const closingIndex = safe.indexOf("]");
      if (closingIndex !== -1) return safe.slice(1, closingIndex);
    }
    const parts = safe.split(":");
    return String(parts[0] || "").trim().toLowerCase();
  }

  function isAllowedRequestOrigin(e, origin) {
    const safeOrigin = String(origin || "").trim();
    if (!safeOrigin || safeOrigin === "null") return false;
    if (!/^https?:\/\//i.test(safeOrigin)) return false;

    const originHost = parseUrlHost(safeOrigin);
    if (!originHost) return false;
    if (isLoopbackHost(originHost)) return true;
    if (isPrivateIpv4Host(originHost)) return true;

    const requestHost = parseHeaderHost(
      readHeader(e, "X-Forwarded-Host") || readHeader(e, "Host") || ""
    );
    return !!(requestHost && originHost === requestHost);
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
    const origin = readHeader(e, "Origin");
    if (!origin) return false;
    return isAllowedRequestOrigin(e, origin);
  }

  function applyApiSecurityHeaders(e) {
    const header = e && e.response && typeof e.response.header === "function" ? e.response.header() : null;
    if (!header || typeof header.set !== "function") return;
    try { header.set("X-Content-Type-Options", "nosniff"); } catch (_) {}
    try { header.set("X-Frame-Options", "DENY"); } catch (_) {}
    try { header.set("Referrer-Policy", "strict-origin-when-cross-origin"); } catch (_) {}
  }

  module.exports = {
    readHeader,
    normalizeAuthToken,
    shouldExposeTokenForRequest,
    isAllowedRequestOrigin,
    applyApiSecurityHeaders
  };
})();
