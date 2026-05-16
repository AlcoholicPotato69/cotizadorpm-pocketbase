(function () {
  routerUse(function (e) {
    const shared = require(`${__hooks}/auth_session_shared.js`);
    const readHeader = shared.readHeader;

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

    function shouldAllowCorsOrigin(origin) {
      const safeOrigin = String(origin || "").trim();
      if (!safeOrigin || safeOrigin === "null") return false;
      return /^https?:\/\//i.test(safeOrigin);
    }

    function applyCorsHeaders(origin) {
      const responseHeader = e?.response?.header?.();
      if (!responseHeader) return;
      responseHeader.set("Access-Control-Allow-Origin", String(origin || "").trim());
      responseHeader.set("Access-Control-Allow-Credentials", "true");
      responseHeader.set("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS");
      responseHeader.set(
        "Access-Control-Allow-Headers",
        "Accept, Authorization, Content-Type, Origin, X-Requested-With, X-Tenant"
      );
      responseHeader.set("Access-Control-Max-Age", "600");
      responseHeader.set("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
    }

    const path = String(e?.request?.url?.path || "");
    if (path.indexOf("/api/") !== 0) return e.next();

    const origin = readHeader(e, "Origin");
    const allowCors = shouldAllowCorsOrigin(origin);
    if (allowCors) {
      applyCorsHeaders(origin);
      const method = String(e?.request?.method || "").trim().toUpperCase();
      if (method === "OPTIONS") return e.json(200, { ok: true });
    }

    const header = e?.request?.header;
    if (!header) return e.next();

    const existing = readHeader(e, "Authorization");
    if (existing) {
      const result = e.next();
      if (allowCors) applyCorsHeaders(origin);
      return result;
    }

    try {
      const cookie = e?.request?.cookie("hub_auth_session_v1");
      const cookieToken = String(cookie?.value || "").trim();
      if (cookieToken) header.set("Authorization", cookieToken);
    } catch (_) {}

    const result = e.next();
    if (allowCors) applyCorsHeaders(origin);
    return result;
  });

  routerAdd("POST", "/api/hub/session/login", function (e) {
    const shared = require(`${__hooks}/auth_session_shared.js`);
    const readHeader = shared.readHeader;
    const shouldExposeTokenForRequest = shared.shouldExposeTokenForRequest;

    const AUTH_COLLECTION = "app_users";
    const SESSION_COOKIE_NAME = "hub_auth_session_v1";
    const SESSION_MAX_AGE_SECONDS = 2 * 60 * 60;
    const SAME_SITE_STRICT_MODE = 3;

    function normalizeIdentity(value) {
      return String(value || "").trim().slice(0, 190);
    }

    function normalizePassword(value) {
      return String(value || "").trim().slice(0, 512);
    }

    function resolveCookieSecureFlag() {
      try {
        if (e && typeof e.isTLS === "function" && e.isTLS()) return true;
      } catch (_) {}
      const forwardedProto = String(readHeader(e, "X-Forwarded-Proto") || "").trim().toLowerCase();
      return forwardedProto === "https";
    }

    function resolveRequestOrigin() {
      const proto = resolveCookieSecureFlag() ? "https" : "http";
      const host = String(
        readHeader(e, "X-Forwarded-Host")
        || readHeader(e, "Host")
        || ""
      ).trim().toLowerCase();
      return host ? (proto + "://" + host) : "";
    }

    function shouldExposeSessionToken() {
      return shouldExposeTokenForRequest(e);
    }

    function buildSessionCookie(token, maxAgeSeconds) {
      return new Cookie({
        name: SESSION_COOKIE_NAME,
        value: String(token || ""),
        path: "/",
        httpOnly: true,
        secure: resolveCookieSecureFlag(),
        sameSite: SAME_SITE_STRICT_MODE,
        maxAge: Math.max(0, Number(maxAgeSeconds) || 0)
      });
    }

    function clearSessionCookie() {
      e.setCookie(new Cookie({
        name: SESSION_COOKIE_NAME,
        value: "",
        path: "/",
        httpOnly: true,
        secure: resolveCookieSecureFlag(),
        sameSite: SAME_SITE_STRICT_MODE,
        maxAge: -1
      }));
    }

    function applySessionResponseHeaders() {
      e.response.header().set("Cache-Control", "no-store, no-cache, must-revalidate, private");
      e.response.header().set("Pragma", "no-cache");
      e.response.header().set("X-Content-Type-Options", "nosniff");
      e.response.header().set("Referrer-Policy", "same-origin");
    }

    function normalizeTenantValue(value) {
      const safe = String(value || "").trim().toLowerCase();
      if (safe === "pm" || safe === "plaza mayor" || safe === "plaza_mayor") return "plaza_mayor";
      if (safe === "cp" || safe === "casa de piedra" || safe === "casa_de_piedra") return "casa_de_piedra";
      return safe;
    }

    function serializeAuthRecord(record) {
      if (!record) return null;
      const rbac = require(`${__hooks}/rbac_shared.js`);
      if (rbac && typeof rbac.buildSessionUser === "function") return rbac.buildSessionUser(record);
      throw e.internalServerError("No se pudo resolver la sesion RBAC.");
    }

    function resolveAuthRecordByIdentity(identity) {
      const safeIdentity = normalizeIdentity(identity);
      if (!safeIdentity) return null;
      const lowerIdentity = safeIdentity.toLowerCase();

      if (safeIdentity.indexOf("@") !== -1) {
        try {
          return $app.findAuthRecordByEmail(AUTH_COLLECTION, lowerIdentity);
        } catch (_) {}

        if (lowerIdentity.indexOf(".com.mx") !== -1) {
          const altIdentity = lowerIdentity.replace(".com.mx", ".com");
          if (altIdentity && altIdentity !== lowerIdentity) {
            try {
              return $app.findAuthRecordByEmail(AUTH_COLLECTION, altIdentity);
            } catch (_) {}
          }
        }
      }

      try {
        return $app.findFirstRecordByData(AUTH_COLLECTION, "login_username", safeIdentity);
      } catch (_) {}

      try {
        return $app.findFirstRecordByData(AUTH_COLLECTION, "username", safeIdentity);
      } catch (_) {}

      if (safeIdentity.indexOf("@") === -1) {
        try {
          return $app.findAuthRecordByEmail(AUTH_COLLECTION, safeIdentity.toLowerCase());
        } catch (_) {}
      }

      return null;
    }

    applySessionResponseHeaders();

    const payload = new DynamicModel({
      identity: "",
      password: ""
    });
    e.bindBody(payload);

    const identity = normalizeIdentity(payload.identity);
    const password = normalizePassword(payload.password);

    if (!identity || !password) {
      throw e.badRequestError("Debes proporcionar usuario y contrasena.");
    }

    const authRecord = resolveAuthRecordByIdentity(identity);
    if (!authRecord || !authRecord.validatePassword(password)) {
      clearSessionCookie();
      throw e.unauthorizedError("Credenciales invalidas.");
    }

    const token = String(authRecord.newAuthToken() || "").trim();
    if (!token) {
      clearSessionCookie();
      throw e.internalServerError("No se pudo iniciar la sesion.");
    }

    e.setCookie(buildSessionCookie(token, SESSION_MAX_AGE_SECONDS));
    return e.json(200, {
      ok: true,
      token: shouldExposeSessionToken() ? token : "",
      expiresIn: SESSION_MAX_AGE_SECONDS,
      user: serializeAuthRecord(authRecord)
    });
  });

  routerAdd("GET", "/api/hub/session/current", function (e) {
    const shared = require(`${__hooks}/auth_session_shared.js`);
    const readHeader = shared.readHeader;
    const normalizeAuthToken = shared.normalizeAuthToken;
    const shouldExposeTokenForRequest = shared.shouldExposeTokenForRequest;

    const SESSION_COOKIE_NAME = "hub_auth_session_v1";
    const SESSION_MAX_AGE_SECONDS = 2 * 60 * 60;
    const SAME_SITE_STRICT_MODE = 3;

    function resolveCookieSecureFlag() {
      try {
        if (e && typeof e.isTLS === "function" && e.isTLS()) return true;
      } catch (_) {}
      const forwardedProto = String(readHeader(e, "X-Forwarded-Proto") || "").trim().toLowerCase();
      return forwardedProto === "https";
    }

    function resolveRequestOrigin() {
      const proto = resolveCookieSecureFlag() ? "https" : "http";
      const host = String(
        readHeader(e, "X-Forwarded-Host")
        || readHeader(e, "Host")
        || ""
      ).trim().toLowerCase();
      return host ? (proto + "://" + host) : "";
    }

    function shouldExposeSessionToken() {
      return shouldExposeTokenForRequest(e);
    }

    function buildSessionCookie(token, maxAgeSeconds) {
      return new Cookie({
        name: SESSION_COOKIE_NAME,
        value: String(token || ""),
        path: "/",
        httpOnly: true,
        secure: resolveCookieSecureFlag(),
        sameSite: SAME_SITE_STRICT_MODE,
        maxAge: Math.max(0, Number(maxAgeSeconds) || 0)
      });
    }

    function clearSessionCookie() {
      e.setCookie(new Cookie({
        name: SESSION_COOKIE_NAME,
        value: "",
        path: "/",
        httpOnly: true,
        secure: resolveCookieSecureFlag(),
        sameSite: SAME_SITE_STRICT_MODE,
        maxAge: -1
      }));
    }

    function applySessionResponseHeaders() {
      e.response.header().set("Cache-Control", "no-store, no-cache, must-revalidate, private");
      e.response.header().set("Pragma", "no-cache");
      e.response.header().set("X-Content-Type-Options", "nosniff");
      e.response.header().set("Referrer-Policy", "same-origin");
    }

    function normalizeTenantValue(value) {
      const safe = String(value || "").trim().toLowerCase();
      if (safe === "pm" || safe === "plaza mayor" || safe === "plaza_mayor") return "plaza_mayor";
      if (safe === "cp" || safe === "casa de piedra" || safe === "casa_de_piedra") return "casa_de_piedra";
      return safe;
    }

    function serializeAuthRecord(record) {
      if (!record) return null;
      const rbac = require(`${__hooks}/rbac_shared.js`);
      if (rbac && typeof rbac.buildSessionUser === "function") return rbac.buildSessionUser(record);
      throw e.internalServerError("No se pudo resolver la sesion RBAC.");
    }

    function resolveAuthTokenFromRequest() {
      const authHeader = normalizeAuthToken(readHeader(e, "Authorization"));
      if (authHeader) return authHeader;
      try {
        const cookie = e?.request?.cookie(SESSION_COOKIE_NAME);
        const value = normalizeAuthToken(cookie?.value || "");
        if (value) return value;
      } catch (_) {}
      return "";
    }

    function resolveAuthRecordFromRequest() {
      const token = resolveAuthTokenFromRequest();
      if (!token) return null;
      try {
        return $app.findAuthRecordByToken(token, "auth");
      } catch (_) {
        return null;
      }
    }

    applySessionResponseHeaders();

    const currentToken = resolveAuthTokenFromRequest();
    const authRecord = resolveAuthRecordFromRequest();
    if (!authRecord) {
      clearSessionCookie();
      throw e.unauthorizedError("Sesion invalida.");
    }
    if (currentToken) {
      e.setCookie(buildSessionCookie(currentToken, SESSION_MAX_AGE_SECONDS));
    }

    return e.json(200, {
      ok: true,
      token: shouldExposeSessionToken() ? currentToken : "",
      expiresIn: SESSION_MAX_AGE_SECONDS,
      user: serializeAuthRecord(authRecord)
    });
  });

  routerAdd("POST", "/api/hub/session/refresh", function (e) {
    const shared = require(`${__hooks}/auth_session_shared.js`);
    const readHeader = shared.readHeader;
    const normalizeAuthToken = shared.normalizeAuthToken;
    const shouldExposeTokenForRequest = shared.shouldExposeTokenForRequest;

    const SESSION_COOKIE_NAME = "hub_auth_session_v1";
    const SESSION_MAX_AGE_SECONDS = 2 * 60 * 60;
    const SAME_SITE_STRICT_MODE = 3;

    function resolveCookieSecureFlag() {
      try {
        if (e && typeof e.isTLS === "function" && e.isTLS()) return true;
      } catch (_) {}
      const forwardedProto = String(readHeader(e, "X-Forwarded-Proto") || "").trim().toLowerCase();
      return forwardedProto === "https";
    }

    function resolveRequestOrigin() {
      const proto = resolveCookieSecureFlag() ? "https" : "http";
      const host = String(
        readHeader(e, "X-Forwarded-Host")
        || readHeader(e, "Host")
        || ""
      ).trim().toLowerCase();
      return host ? (proto + "://" + host) : "";
    }

    function shouldExposeSessionToken() {
      return shouldExposeTokenForRequest(e);
    }

    function buildSessionCookie(token, maxAgeSeconds) {
      return new Cookie({
        name: SESSION_COOKIE_NAME,
        value: String(token || ""),
        path: "/",
        httpOnly: true,
        secure: resolveCookieSecureFlag(),
        sameSite: SAME_SITE_STRICT_MODE,
        maxAge: Math.max(0, Number(maxAgeSeconds) || 0)
      });
    }

    function clearSessionCookie() {
      e.setCookie(new Cookie({
        name: SESSION_COOKIE_NAME,
        value: "",
        path: "/",
        httpOnly: true,
        secure: resolveCookieSecureFlag(),
        sameSite: SAME_SITE_STRICT_MODE,
        maxAge: -1
      }));
    }

    function applySessionResponseHeaders() {
      e.response.header().set("Cache-Control", "no-store, no-cache, must-revalidate, private");
      e.response.header().set("Pragma", "no-cache");
      e.response.header().set("X-Content-Type-Options", "nosniff");
      e.response.header().set("Referrer-Policy", "same-origin");
    }

    function normalizeTenantValue(value) {
      const safe = String(value || "").trim().toLowerCase();
      if (safe === "pm" || safe === "plaza mayor" || safe === "plaza_mayor") return "plaza_mayor";
      if (safe === "cp" || safe === "casa de piedra" || safe === "casa_de_piedra") return "casa_de_piedra";
      return safe;
    }

    function serializeAuthRecord(record) {
      if (!record) return null;
      const rbac = require(`${__hooks}/rbac_shared.js`);
      if (rbac && typeof rbac.buildSessionUser === "function") return rbac.buildSessionUser(record);
      throw e.internalServerError("No se pudo resolver la sesion RBAC.");
    }

    function resolveAuthTokenFromRequest() {
      const authHeader = normalizeAuthToken(readHeader(e, "Authorization"));
      if (authHeader) return authHeader;
      try {
        const cookie = e?.request?.cookie(SESSION_COOKIE_NAME);
        const value = normalizeAuthToken(cookie?.value || "");
        if (value) return value;
      } catch (_) {}
      return "";
    }

    function resolveAuthRecordFromRequest() {
      const token = resolveAuthTokenFromRequest();
      if (!token) return null;
      try {
        return $app.findAuthRecordByToken(token, "auth");
      } catch (_) {
        return null;
      }
    }

    applySessionResponseHeaders();

    const authRecord = resolveAuthRecordFromRequest();
    if (!authRecord) {
      clearSessionCookie();
      throw e.unauthorizedError("Sesion invalida.");
    }

    const token = String(authRecord.newAuthToken() || "").trim();
    if (!token) {
      clearSessionCookie();
      throw e.internalServerError("No se pudo renovar la sesion.");
    }

    e.setCookie(buildSessionCookie(token, SESSION_MAX_AGE_SECONDS));
    return e.json(200, {
      ok: true,
      token: shouldExposeSessionToken() ? token : "",
      expiresIn: SESSION_MAX_AGE_SECONDS,
      user: serializeAuthRecord(authRecord)
    });
  });

  routerAdd("POST", "/api/hub/session/logout", function (e) {
    const shared = require(`${__hooks}/auth_session_shared.js`);
    const readHeader = shared.readHeader;

    const SAME_SITE_STRICT_MODE = 3;

    function resolveCookieSecureFlag() {
      try {
        if (e && typeof e.isTLS === "function" && e.isTLS()) return true;
      } catch (_) {}
      const forwardedProto = String(readHeader(e, "X-Forwarded-Proto") || "").trim().toLowerCase();
      return forwardedProto === "https";
    }

    function clearSessionCookie() {
      e.setCookie(new Cookie({
        name: "hub_auth_session_v1",
        value: "",
        path: "/",
        httpOnly: true,
        secure: resolveCookieSecureFlag(),
        sameSite: SAME_SITE_STRICT_MODE,
        maxAge: -1
      }));
    }

    function applySessionResponseHeaders() {
      e.response.header().set("Cache-Control", "no-store, no-cache, must-revalidate, private");
      e.response.header().set("Pragma", "no-cache");
      e.response.header().set("X-Content-Type-Options", "nosniff");
      e.response.header().set("Referrer-Policy", "same-origin");
    }

    applySessionResponseHeaders();
    clearSessionCookie();
    return e.json(200, { ok: true });
  });
})();
