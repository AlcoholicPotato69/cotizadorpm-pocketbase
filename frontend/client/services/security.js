/**
 * =============================================================================
 * security.js — Utilidades de Seguridad y Sanitización
 * =============================================================================
 * Módulo de prevención de XSS y validación de inputs. Todas las funciones son
 * puras (sin side effects) y se pueden usar tanto en frontend como en tests.
 *
 * Funciones:
 * - escapeHtml(): Escapa caracteres HTML peligrosos (<, >, &, ", ')
 * - sanitizeInput(): Limpia strings de caracteres de control + max length
 * - stripHtmlTags(): Elimina todas las etiquetas HTML de un string
 * - isValidEmail(): Valida formato de correo electrónico
 * - isValidPhone(): Valida formato de teléfono
 * - isSafeRedirectUrl(): Previene open redirect (solo URLs relativas/same-origin)
 * - isValidTenant(): Valida que el tenant sea uno de los permitidos
 *
 * Expuesto en: window.SecurityUtils
 * =============================================================================
 */
(function () {
  if (window.SecurityUtils) return;

  /**
   * Escape HTML special characters to prevent XSS.
   * Safe for use in innerHTML when inserting user-controlled text.
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  /**
   * Sanitize a string input: trim, remove control characters, enforce max length.
   */
  function sanitizeInput(str, maxLen) {
    if (str === null || str === undefined) return '';
    var text = String(str).trim();
    // Remove ASCII control characters (0x00-0x1F except tab/newline, and 0x7F)
    text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    if (maxLen && text.length > maxLen) text = text.slice(0, maxLen);
    return text;
  }

  /**
   * Strip HTML tags from a string (simple regex-based).
   */
  function stripHtmlTags(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/<[^>]*>/g, '');
  }

  /**
   * Validate email format.
   */
  function isValidEmail(str) {
    if (!str) return false;
    var email = String(str).trim();
    if (email.length > 254) return false;
    return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(email);
  }

  /**
   * Validate phone number format (digits, +, -, spaces, parentheses).
   */
  function isValidPhone(str) {
    if (!str) return false;
    var phone = String(str).trim();
    if (phone.length > 30 || phone.length < 7) return false;
    return /^[\d\s+\-().]+$/.test(phone);
  }

  /**
   * Check if a URL is safe for redirect (same origin or relative path).
   * Blocks javascript:, data:, and external URLs.
   */
  function isSafeRedirectUrl(url) {
    if (!url) return false;
    var cleaned = String(url).trim();
    if (!cleaned) return false;
    // Block dangerous protocols
    var lower = cleaned.toLowerCase();
    if (lower.indexOf('javascript:') === 0) return false;
    if (lower.indexOf('data:') === 0) return false;
    if (lower.indexOf('vbscript:') === 0) return false;
    // Allow relative paths
    if (cleaned.indexOf('/') === 0 && cleaned.indexOf('//') !== 0) return true;
    if (cleaned.indexOf('./') === 0 || cleaned.indexOf('../') === 0) return true;
    // Allow same origin
    try {
      var parsed = new URL(cleaned, window.location.origin);
      return parsed.origin === window.location.origin;
    } catch (_) {
      return false;
    }
  }

  /**
   * Validate that a tenant value is one of the allowed values.
   */
  function isValidTenant(val) {
    var tenant = String(val || '').trim().toLowerCase();
    return tenant === 'plaza_mayor' || tenant === 'casa_de_piedra';
  }

  window.SecurityUtils = {
    escapeHtml: escapeHtml,
    sanitizeInput: sanitizeInput,
    stripHtmlTags: stripHtmlTags,
    isValidEmail: isValidEmail,
    isValidPhone: isValidPhone,
    isSafeRedirectUrl: isSafeRedirectUrl,
    isValidTenant: isValidTenant
  };
})();
