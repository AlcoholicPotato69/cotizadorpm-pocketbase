(function () {
  const NOTIFICATIONS_COLLECTION = "hub_notifications";
  const AUTH_COLLECTION = "app_users";
  const DISMISSED_RETENTION_DAYS = 5;
  const ALLOWED_ROLES = {
    admin: true,
    plaza_mayor: true,
    casa_de_piedra: true,
    verificador: true
  };

  const STATUS_LABELS = {
    borrador: "Borrador",
    pendiente: "Pendiente",
    aprobada: "Aprobada",
    rechazada: "Rechazada",
    finalizada: "Finalizada",
    cancelada: "Cancelada"
  };

  const DOC_LABELS = {
    doc_acta_constitutiva: "Acta constitutiva",
    doc_ine: "INE",
    doc_comprobante_domicilio: "Comprobante de domicilio",
    doc_constancia_fiscal: "Constancia de situacion fiscal"
  };

  function trim(value) {
    return String(value || "").trim();
  }

  function normalizeRole(value) {
    const role = trim(value).toLowerCase();
    if (role === "administrador" || role === "superadmin" || role === "super_admin") return "admin";
    return ALLOWED_ROLES[role] ? role : "";
  }

  function normalizeTenant(value) {
    const tenant = trim(value).toLowerCase();
    return (tenant === "plaza_mayor" || tenant === "casa_de_piedra") ? tenant : "";
  }

  function tenantLabel(tenant) {
    return normalizeTenant(tenant) === "casa_de_piedra" ? "Casa de Piedra" : "Plaza Mayor";
  }

  function tenantPath(tenant) {
    return normalizeTenant(tenant) === "casa_de_piedra" ? "cotizadorcp" : "cotizador";
  }

  function buildTenantLink(tenant, route, params) {
    const basePath = tenantPath(tenant) + "/" + trim(route || "");
    const query = [];
    const source = params && typeof params === "object" ? params : {};
    const keys = Object.keys(source);
    for (let i = 0; i < keys.length; i += 1) {
      const key = trim(keys[i]);
      const value = trim(source[key]);
      if (!key || !value) continue;
      query.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
    }
    return query.length ? (basePath + "?" + query.join("&")) : basePath;
  }

  function statusLabel(status) {
    const normalized = trim(status).toLowerCase();
    return STATUS_LABELS[normalized] || (normalized ? normalized : "sin estatus");
  }

  function getCollection(name) {
    try {
      return $app.findCollectionByNameOrId(name);
    } catch (_) {
      return null;
    }
  }

  function collectionHasField(collection, fieldName) {
    try {
      return !!collection.fields.getByName(fieldName);
    } catch (_) {
      return false;
    }
  }

  function getRecordString(record, field) {
    if (!record) return "";
    try {
      if (typeof record.getString === "function") return trim(record.getString(field));
      if (typeof record.get === "function") return trim(record.get(field));
      return trim(record[field]);
    } catch (_) {
      return "";
    }
  }

  function getRecordBool(record, field) {
    if (!record) return false;
    try {
      if (typeof record.getBool === "function") return record.getBool(field) === true;
      if (typeof record.get === "function") return record.get(field) === true;
      return record[field] === true;
    } catch (_) {
      return false;
    }
  }

  function escapeFilterValue(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function buildNotificationKey(payload) {
    const source = payload && typeof payload === "object" ? payload : {};
    const explicit = trim(source.notification_key || source.notificationKey);
    if (explicit) return explicit.slice(0, 120);
    const meta = source.metadata && typeof source.metadata === "object" ? source.metadata : {};
    const type = trim(source.type || "system").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "system";
    const tenant = normalizeTenant(meta.tenant || meta.tenant_slug || source.tenant) || "global";
    const target = trim(meta.cotizacion_id || meta.cliente_id || meta.redirect_kind || source.link)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 24) || "evt";
    const nonce = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    return [type, tenant, target, nonce].join("_").slice(0, 120);
  }

  function getNotificationKey(record) {
    return getRecordString(record, "notification_key") || getRecordString(record, "id");
  }

  function isNotificationDismissed(record) {
    return getRecordBool(record, "dismissed") || !!getRecordString(record, "dismissed_at");
  }

  function getAllUsers() {
    const users = [];
    try {
      let offset = 0;
      while (true) {
        const batch = $app.findRecordsByFilter(
          AUTH_COLLECTION,
          '(role = "admin" || role = "plaza_mayor" || role = "casa_de_piedra" || role = "verificador")',
          "created_at",
          500,
          offset
        ) || [];
        if (!batch.length) break;
        for (let i = 0; i < batch.length; i += 1) {
          const role = normalizeRole(getRecordString(batch[i], "role"));
          if (role) users.push(batch[i]);
        }
        if (batch.length < 500) break;
        offset += batch.length;
      }
    } catch (err) {
      console.log("[hub_notifications] No se pudieron leer usuarios:", String(err));
    }
    return users;
  }

  function createNotification(userId, payload) {
    const collection = getCollection(NOTIFICATIONS_COLLECTION);
    if (!collection || !trim(userId)) return false;

    const nowIso = new Date().toISOString();
    const source = payload && typeof payload === "object" ? payload : {};
    const notificationKey = buildNotificationKey(source);
    try {
      const record = new Record(collection);
      record.set("user_id", trim(userId));
      record.set("title", trim(source.title).slice(0, 180));
      record.set("message", trim(source.message).slice(0, 600));
      record.set("type", trim(source.type || "system").slice(0, 40));
      record.set("source_app", trim(source.source_app || source.type || "system").slice(0, 80));
      record.set("link", trim(source.link).slice(0, 255));
      record.set("metadata", source.metadata && typeof source.metadata === "object" ? source.metadata : {});
      if (collectionHasField(collection, "notification_key")) record.set("notification_key", notificationKey);
      if (collectionHasField(collection, "dismissed")) record.set("dismissed", false);
      if (collectionHasField(collection, "dismissed_at")) record.set("dismissed_at", "");
      record.set("created_at", trim(source.created_at) || nowIso);
      record.set("updated_at", trim(source.updated_at) || nowIso);
      $app.save(record);
      return true;
    } catch (err) {
      console.log("[hub_notifications] No se pudo crear notificacion:", String(err));
      return false;
    }
  }

  function notifyAllUsers(payload) {
    const sharedPayload = Object.assign({}, payload || {});
    sharedPayload.notification_key = buildNotificationKey(sharedPayload);
    const users = getAllUsers();
    for (let i = 0; i < users.length; i += 1) {
      createNotification(getRecordString(users[i], "id"), sharedPayload);
    }
  }

  function purgeDismissedNotifications() {
    const cutoffDate = new Date(Date.now() - (DISMISSED_RETENTION_DAYS * 86400000));
    const cutoffIso = cutoffDate.toISOString();
    try {
      while (true) {
        const candidates = $app.findRecordsByFilter(
          NOTIFICATIONS_COLLECTION,
          `dismissed = true && dismissed_at != "" && dismissed_at <= "${cutoffIso}"`,
          "-dismissed_at",
          200,
          0
        ) || [];
        if (!candidates.length) break;

        const checked = {};
        let deleted = 0;
        for (let i = 0; i < candidates.length; i += 1) {
          const key = getNotificationKey(candidates[i]);
          if (!key || checked[key]) continue;
          checked[key] = true;

          const siblings = $app.findRecordsByFilter(
            NOTIFICATIONS_COLLECTION,
            `notification_key = "${escapeFilterValue(key)}"`,
            "-dismissed_at",
            500,
            0
          ) || [];
          if (!siblings.length) continue;
          if (siblings.some(function (record) { return !isNotificationDismissed(record); })) continue;

          let latestDismissedAt = "";
          for (let j = 0; j < siblings.length; j += 1) {
            const dismissedAt = getRecordString(siblings[j], "dismissed_at");
            if (dismissedAt && dismissedAt > latestDismissedAt) latestDismissedAt = dismissedAt;
          }
          if (!latestDismissedAt || latestDismissedAt > cutoffIso) continue;

          for (let j = 0; j < siblings.length; j += 1) {
            try {
              $app.delete(siblings[j]);
              deleted += 1;
            } catch (err) {
              console.log("[hub_notifications] No se pudo eliminar notificacion descartada:", String(err));
            }
          }
        }

        if (!deleted) break;
      }
    } catch (err) {
      console.log("[hub_notifications] No se pudo limpiar notificaciones descartadas:", String(err));
    }
  }

  function normalizeDocEntry(doc) {
    if (typeof doc === "string") {
      return { field: doc, label: DOC_LABELS[doc] || doc };
    }
    const source = doc && typeof doc === "object" ? doc : {};
    const field = trim(source.field || source.documento_campo || source.name);
    return {
      field,
      label: trim(source.label || source.documento_nombre || DOC_LABELS[field] || field),
      type: trim(source.type || source.tipo_movimiento || ""),
      file: trim(source.file || source.archivo || ""),
      reason: trim(source.reason || source.motivo || source.rejection_reason || "")
    };
  }

  function summarizeDocs(docs) {
    const list = [];
    const seen = {};
    const source = Array.isArray(docs) ? docs : [];
    for (let i = 0; i < source.length; i += 1) {
      const item = normalizeDocEntry(source[i]);
      const label = item.label || item.field;
      if (!label || seen[label]) continue;
      seen[label] = true;
      list.push(label);
    }
    if (!list.length) return "documentos del cliente";
    if (list.length === 1) return list[0];
    if (list.length === 2) return list[0] + " y " + list[1];
    return list.slice(0, -1).join(", ") + " y " + list[list.length - 1];
  }

  function normalizeClientPayload(client) {
    const source = client && typeof client === "object" ? client : {};
    return {
      id: trim(source.id || source.cliente_id),
      tenant: normalizeTenant(source.tenant),
      name: trim(source.name || source.nombre || source.cliente_nombre || source.nombre_completo) || "Cliente"
    };
  }

  function actorLabel(actor) {
    const source = actor && typeof actor === "object" ? actor : {};
    return trim(source.name || source.actor_nombre || source.login_username || source.username || source.email) || "Sistema";
  }

  function notifyQuoteStatusChanged(before, after, actor) {
    const previous = before && typeof before === "object" ? before : {};
    const current = after && typeof after === "object" ? after : {};
    const tenant = normalizeTenant(current.tenant || previous.tenant);
    if (!tenant) return;
    const oldStatus = trim(previous.status).toLowerCase();
    const newStatus = trim(current.status).toLowerCase();
    if (!newStatus || oldStatus === newStatus) return;

    const quoteId = trim(current.id || previous.id);
    const folio = trim(current.folio || current.numero_orden || current.id) || "cotizacion";
    const clientName = trim(current.clientName || current.cliente_nombre || previous.clientName || "");
    const targetLink = buildTenantLink(tenant, "orders.html", quoteId ? { quote: quoteId } : {});
    notifyAllUsers({
      title: "Estatus de cotizacion actualizado",
      message: tenantLabel(tenant) + ": " + folio + " cambio de " + statusLabel(oldStatus) + " a " + statusLabel(newStatus) + (clientName ? " para " + clientName : "") + ".",
      type: "quote_status",
      source_app: "cotizador",
      link: targetLink,
      metadata: {
        tenant,
        cotizacion_id: quoteId,
        cotizacion_folio: folio,
        estado_anterior: oldStatus,
        estado_actual: newStatus,
        actor_id: trim(actor && actor.id),
        actor_nombre: trim(actor && actor.name),
        cliente_nombre: clientName,
        redirect_url: targetLink,
        redirect_kind: "quote_detail"
      }
    });
  }

  function notifyClientDocumentsUploaded(client, docs, actor) {
    const target = normalizeClientPayload(client);
    if (!target.tenant || !target.id) return;
    const docSummary = summarizeDocs(docs);
    const targetLink = buildTenantLink(target.tenant, "clientes.html", { verify: target.id });
    notifyAllUsers({
      title: "Documentos cargados por cliente",
      message: tenantLabel(target.tenant) + ": " + target.name + " cargo " + docSummary + ".",
      type: "client_document_uploaded",
      source_app: "document",
      link: targetLink,
      metadata: {
        tenant: target.tenant,
        cliente_id: target.id,
        cliente_nombre: target.name,
        documentos: (Array.isArray(docs) ? docs : []).map(normalizeDocEntry),
        actor_id: trim(actor && actor.id),
        actor_nombre: trim(actor && actor.name),
        redirect_url: targetLink,
        redirect_kind: "client_verify"
      }
    });
  }

  function notifyClientDocumentsApproved(client, docs, actor) {
    const target = normalizeClientPayload(client);
    if (!target.tenant || !target.id) return;
    const docSummary = summarizeDocs(docs);
    const targetLink = buildTenantLink(target.tenant, "clientes.html", { verify: target.id });
    notifyAllUsers({
      title: "Documentos de cliente aprobados",
      message: tenantLabel(target.tenant) + ": se aprobo " + docSummary + " de " + target.name + ".",
      type: "client_document_approved",
      source_app: "document",
      link: targetLink,
      metadata: {
        tenant: target.tenant,
        cliente_id: target.id,
        cliente_nombre: target.name,
        documentos: (Array.isArray(docs) ? docs : []).map(normalizeDocEntry),
        actor_id: trim(actor && actor.id),
        actor_nombre: trim(actor && actor.name),
        redirect_url: targetLink,
        redirect_kind: "client_verify"
      }
    });
  }

  function notifyClientDocumentsRejected(client, docs, actor) {
    const target = normalizeClientPayload(client);
    if (!target.tenant || !target.id) return;
    const docList = Array.isArray(docs) ? docs : [docs];
    const reviewer = actorLabel(actor);
    const targetLink = buildTenantLink(target.tenant, "clientes.html", { verify: target.id });

    for (let i = 0; i < docList.length; i += 1) {
      const item = normalizeDocEntry(docList[i]);
      const label = item.label || item.field || "documento";
      const reason = trim(item.reason);
      const message = reviewer + " rechazo " + label + " del cliente " + target.name + (reason ? " por " + reason + "." : ".");
      notifyAllUsers({
        title: "Documento de cliente rechazado",
        message,
        type: "client_document_rejected",
        source_app: "document",
        link: targetLink,
        metadata: {
          tenant: target.tenant,
          cliente_id: target.id,
          cliente_nombre: target.name,
          documentos: [item],
          documento: item,
          motivo: reason,
          actor_id: trim(actor && actor.id),
          actor_nombre: reviewer,
          redirect_url: targetLink,
          redirect_kind: "client_verify"
        }
      });
    }
  }

  module.exports = {
    purgeDismissedNotifications,
    notifyAllUsers,
    notifyQuoteStatusChanged,
    notifyClientDocumentsUploaded,
    notifyClientDocumentsApproved,
    notifyClientDocumentsRejected
  };
})();
