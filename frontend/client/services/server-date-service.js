/**
 * server-date-service.js
 * Servicio centralizado para obtener la fecha y hora del SERVIDOR.
 *
 * Calcula el offset entre la hora local del navegador y la hora del servidor
 * PocketBase, y expone funciones que devuelven timestamps alineados al servidor.
 * Esto impide que un usuario con la hora local alterada genere registros con
 * fechas incorrectas.
 *
 * USO:
 *   window.__serverDateService.nowISO()        → "2026-04-27T21:53:07.123Z"
 *   window.__serverDateService.nowDate()        → Date ajustado al servidor
 *   window.__serverDateService.todayISO()       → "2026-04-27"
 *   window.__serverDateService.todayLocale(loc) → "27/04/2026"
 */
(function () {
  'use strict';

  if (window.__serverDateService) return;

  var PB_URL = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseUrl) || 'http://127.0.0.1:8090';
  var ENDPOINT = String(PB_URL).replace(/\/+$/, '') + '/api/cotizador/server-time';
  var REFRESH_INTERVAL_MS = 5 * 60 * 1000; // Refresh every 5 minutes

  /** Offset in ms: server - local.  Positive = server is ahead. */
  var _offsetMs = 0;
  var _synced = false;
  var _syncPromise = null;
  var _refreshTimer = null;

  /**
   * Fetch the server time and compute the offset.
   * @returns {Promise<void>}
   */
  function sync() {
    if (_syncPromise) return _syncPromise;

    _syncPromise = (async function () {
      try {
        var t0 = Date.now();
        var resp = await fetch(ENDPOINT, { cache: 'no-store', credentials: 'omit' });
        var t1 = Date.now();
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var data = await resp.json();
        var serverIso = String(data && data.now || '').trim();
        if (!serverIso) throw new Error('Empty server time');
        var serverTs = new Date(serverIso).getTime();
        if (isNaN(serverTs)) throw new Error('Invalid server time');

        // Use the midpoint of the request to estimate when the server generated its timestamp
        var localMid = (t0 + t1) / 2;
        _offsetMs = serverTs - localMid;
        _synced = true;
      } catch (err) {
        // If we can't sync, keep previous offset (or 0 on first failure)
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[server-date-service] Sync failed, using local time:', err.message || err);
        }
      } finally {
        _syncPromise = null;
      }
    })();

    return _syncPromise;
  }

  /**
   * Start the periodic refresh timer.
   */
  function startRefresh() {
    if (_refreshTimer) return;
    _refreshTimer = setInterval(function () {
      sync();
    }, REFRESH_INTERVAL_MS);
  }

  /**
   * Returns a Date object adjusted to the server's clock.
   * @returns {Date}
   */
  function nowDate() {
    return new Date(Date.now() + _offsetMs);
  }

  /**
   * Returns the server-aligned time as an ISO 8601 string.
   * @returns {string}
   */
  function nowISO() {
    return nowDate().toISOString();
  }

  /**
   * Returns today's date (server-aligned) in YYYY-MM-DD format.
   * @returns {string}
   */
  function todayISO() {
    return nowISO().split('T')[0];
  }

  /**
   * Returns today's date (server-aligned) formatted with toLocaleDateString.
   * @param {string} [locale='es-MX'] - BCP 47 locale string
   * @param {object} [options] - Intl.DateTimeFormat options
   * @returns {string}
   */
  function todayLocale(locale, options) {
    var loc = locale || 'es-MX';
    var opts = options || { day: '2-digit', month: '2-digit', year: 'numeric' };
    return nowDate().toLocaleDateString(loc, opts);
  }

  /**
   * Returns the full date+time (server-aligned) formatted with toLocaleString.
   * @param {string} [locale='es-MX'] - BCP 47 locale string
   * @param {object} [options] - Intl.DateTimeFormat options
   * @returns {string}
   */
  function nowLocaleString(locale, options) {
    var loc = locale || 'es-MX';
    var opts = options || { dateStyle: 'short', timeStyle: 'medium' };
    return nowDate().toLocaleString(loc, opts);
  }

  /**
   * Returns whether the service has successfully synced at least once.
   * @returns {boolean}
   */
  function isSynced() {
    return _synced;
  }

  /**
   * Returns the current offset in ms (server - local).
   * @returns {number}
   */
  function getOffsetMs() {
    return _offsetMs;
  }

  /**
   * Force a re-sync with the server.
   * @returns {Promise<void>}
   */
  function forceSync() {
    _syncPromise = null;
    return sync();
  }

  /**
   * Wait until the first sync is complete (or timeout after 3s).
   * @returns {Promise<void>}
   */
  function ready() {
    if (_synced) return Promise.resolve();
    return new Promise(function (resolve) {
      var elapsed = 0;
      var interval = 50;
      var maxWait = 3000;
      var check = setInterval(function () {
        elapsed += interval;
        if (_synced || elapsed >= maxWait) {
          clearInterval(check);
          resolve();
        }
      }, interval);
    });
  }

  // Public API
  window.__serverDateService = {
    nowDate: nowDate,
    nowISO: nowISO,
    todayISO: todayISO,
    todayLocale: todayLocale,
    nowLocaleString: nowLocaleString,
    isSynced: isSynced,
    getOffsetMs: getOffsetMs,
    forceSync: forceSync,
    ready: ready,
    sync: sync
  };

  // Initial sync + start periodic refresh
  sync();
  startRefresh();
})();
