cronAdd("notifications_control_cleanup", "0 1 * * *", () => {
  try {
    require(`${__hooks}/notifications_shared.js`).purgeDismissedNotifications();
  } catch (err) {
    console.error("[notifications_control_cleanup] Error limpiando notificaciones:", String(err));
  }

  try {
    require(`${__hooks}/control_movimientos_shared.js`).purgeOldMovements();
  } catch (err) {
    console.error("[notifications_control_cleanup] Error limpiando movimientos:", String(err));
  }
});
