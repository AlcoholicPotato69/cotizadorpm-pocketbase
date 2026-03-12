/* Native PocketBase auth service. */
(function () {
  window.PB_SERVICES = window.PB_SERVICES || {};
  if (window.PB_SERVICES.auth) return;

  function client(options) {
    if (!window.PBServicesShared) throw new Error("PBServicesShared no está cargado.");
    return window.PBServicesShared.getClient(options || {});
  }

  window.PB_SERVICES.auth = {
    async login(credentials, options) {
      return client(options).login(credentials || {});
    },
    async logout(options) {
      return client(options).logout();
    },
    async getSession(options) {
      return client(options).getSession();
    },
    async getUser(options) {
      return client(options).getUser();
    },
    async getProfile(userId, options) {
      return client(options).getProfile(userId);
    }
  };
})();
