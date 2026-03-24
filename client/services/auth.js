/**
 * =============================================================================
 * auth.js — Servicio de Autenticación
 * =============================================================================
 * Proporciona funciones de autenticación contra PocketBase.
 * Todas las funciones son async y retornan objetos con datos de sesión/usuario.
 *
 * Métodos:
 * - login(credentials): Inicia sesión con { email, password }
 * - logout(): Cierra la sesión y limpia tokens de localStorage
 * - getSession(): Retorna la sesión activa (token + datos básicos)
 * - getUser(): Retorna los datos del usuario autenticado
 * - getProfile(userId): Obtiene el perfil completo de un usuario por ID
 *
 * Expuesto en: window.PB_SERVICES.auth
 * =============================================================================
 */
(function () {
  window.PB_SERVICES = window.PB_SERVICES || {};
  if (window.PB_SERVICES.auth) return;

  /**
   * Obtiene la instancia del cliente PocketBase.
   * @param {Object} options - Opciones de configuración (tenant, etc.)
   * @returns {Object} Instancia del cliente PocketBase
   */
  function client(options) {
    if (!window.PBServicesShared) throw new Error("PBServicesShared no está cargado.");
    return window.PBServicesShared.getClient(options || {});
  }

  window.PB_SERVICES.auth = {
    /** Inicia sesión con email y contraseña. */
    async login(credentials, options) {
      return client(options).login(credentials || {});
    },
    /** Cierra la sesión actual y limpia tokens. */
    async logout(options) {
      return client(options).logout();
    },
    /** Retorna la sesión activa desde localStorage. */
    async getSession(options) {
      return client(options).getSession();
    },
    /** Obtiene los datos del usuario autenticado actual. */
    async getUser(options) {
      return client(options).getUser();
    },
    /** Obtiene el perfil completo de un usuario por su ID. */
    async getProfile(userId, options) {
      return client(options).getProfile(userId);
    }
  };
})();
