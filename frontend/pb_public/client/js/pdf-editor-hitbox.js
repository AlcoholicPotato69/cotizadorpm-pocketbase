(function () {
  const DEFAULT_MIN = 14;
  const DEFAULT_MAX = 24;

  function clampNumber(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
  }

  function getThreshold(rect, options) {
    const cfg = options && typeof options === "object" ? options : {};
    const min = clampNumber(cfg.min, 8, 32, DEFAULT_MIN);
    const max = clampNumber(cfg.max, min, 40, DEFAULT_MAX);
    const shortest = Math.max(0, Math.min(Number(rect?.width || 0), Number(rect?.height || 0)));
    return Math.round(Math.min(max, Math.max(min, shortest / 2.75)));
  }

  function resolveResizeHit(node, event, options) {
    const rect = node && typeof node.getBoundingClientRect === "function"
      ? node.getBoundingClientRect()
      : null;
    if (!rect) return { resize: false, proportional: false, cursor: "move" };

    const threshold = getThreshold(rect, options);
    let left = (event.clientX - rect.left) <= threshold;
    let right = (rect.right - event.clientX) <= threshold;
    let top = (event.clientY - rect.top) <= threshold;
    let bottom = (rect.bottom - event.clientY) <= threshold;

    if (event.shiftKey && !(left || right || top || bottom)) {
      right = true;
      bottom = true;
    }
    if (left && right) {
      if (event.clientX - rect.left <= rect.right - event.clientX) right = false;
      else left = false;
    }
    if (top && bottom) {
      if (event.clientY - rect.top <= rect.bottom - event.clientY) bottom = false;
      else top = false;
    }
    if (!(left || right || top || bottom)) return { resize: false, proportional: false, cursor: "move" };

    let cursor = "move";
    if ((left || right) && (top || bottom)) {
      cursor = ((left && top) || (right && bottom)) ? "nwse-resize" : "nesw-resize";
    } else if (left || right) {
      cursor = "ew-resize";
    } else {
      cursor = "ns-resize";
    }

    return {
      resize: true,
      left,
      right,
      top,
      bottom,
      proportional: (left || right) && (top || bottom),
      cursor
    };
  }

  function isBottomRightResizeHit(node, event, options) {
    const rect = node && typeof node.getBoundingClientRect === "function"
      ? node.getBoundingClientRect()
      : null;
    if (!rect) return false;
    const threshold = getThreshold(rect, options);
    return (rect.right - event.clientX) <= threshold && (rect.bottom - event.clientY) <= threshold;
  }

  function getPointerScale(node) {
    const ref = node?.parentElement || node;
    if (!ref || !(ref instanceof HTMLElement)) return { x: 1, y: 1 };
    const rect = ref.getBoundingClientRect();
    const rawWidth = ref.offsetWidth || parseFloat(ref.style.width || "0") || rect.width || 1;
    const rawHeight = ref.offsetHeight || parseFloat(ref.style.height || "0") || rect.height || 1;
    const scaleX = rect.width > 0 && rawWidth > 0 ? rect.width / rawWidth : 1;
    const scaleY = rect.height > 0 && rawHeight > 0 ? rect.height / rawHeight : 1;
    return { x: scaleX > 0 ? scaleX : 1, y: scaleY > 0 ? scaleY : 1 };
  }

  function installCss() {
    if (document.getElementById("pdf-editor-hitbox-style")) return;
    const style = document.createElement("style");
    style.id = "pdf-editor-hitbox-style";
    style.textContent = `
      .pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-resource,
      .pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-editable,
      .cp-pdf-root.cp-pdf-admin-enabled .cp-pdf-resource,
      .cp-pdf-root.cp-pdf-admin-enabled .cp-pdf-editable,
      .pmc-pdf-root.pmc-pdf-admin-enabled .pmc-pdf-resource,
      .pmc-pdf-root.pmc-pdf-admin-enabled .pmc-pdf-editable,
      .cpc-pdf-root.cpc-pdf-admin-enabled .cpc-pdf-resource,
      .cpc-pdf-root.cpc-pdf-admin-enabled .cpc-pdf-editable,
      .pdf-preview-resource,
      .dg-canvas-resource.is-editable {
        touch-action: none !important;
        user-select: none !important;
      }

      .pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-resource::before,
      .pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-editable::before,
      .cp-pdf-root.cp-pdf-admin-enabled .cp-pdf-resource::before,
      .cp-pdf-root.cp-pdf-admin-enabled .cp-pdf-editable::before,
      .pmc-pdf-root.pmc-pdf-admin-enabled .pmc-pdf-resource::before,
      .pmc-pdf-root.pmc-pdf-admin-enabled .pmc-pdf-editable::before,
      .cpc-pdf-root.cpc-pdf-admin-enabled .cpc-pdf-resource::before,
      .cpc-pdf-root.cpc-pdf-admin-enabled .cpc-pdf-editable::before {
        inset: -3px !important;
        border-width: 2px !important;
        background-size: 16px 16px !important;
      }

      .pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-resource::after,
      .pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-editable::after,
      .cp-pdf-root.cp-pdf-admin-enabled .cp-pdf-resource::after,
      .cp-pdf-root.cp-pdf-admin-enabled .cp-pdf-editable::after,
      .pmc-pdf-root.pmc-pdf-admin-enabled .pmc-pdf-resource::after,
      .pmc-pdf-root.pmc-pdf-admin-enabled .pmc-pdf-editable::after,
      .cpc-pdf-root.cpc-pdf-admin-enabled .cpc-pdf-resource::after,
      .cpc-pdf-root.cpc-pdf-admin-enabled .cpc-pdf-editable::after,
      .pdf-preview-resource::after,
      .dg-canvas-resource.is-editable::after {
        right: -10px !important;
        bottom: -10px !important;
        width: 18px !important;
        height: 18px !important;
        border: 2px solid #fff !important;
        box-shadow: 0 2px 8px rgba(15,23,42,.28), 0 0 0 1px rgba(15,23,42,.08) !important;
        opacity: .96 !important;
        cursor: nwse-resize !important;
      }

      .pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-edit-selected,
      .pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-base-selected,
      .cp-pdf-root.cp-pdf-admin-enabled .cp-pdf-edit-selected,
      .cp-pdf-root.cp-pdf-admin-enabled .cp-pdf-base-selected,
      .pmc-pdf-root.pmc-pdf-admin-enabled .pmc-pdf-edit-selected,
      .cpc-pdf-root.cpc-pdf-admin-enabled .cpc-pdf-edit-selected,
      .pdf-preview-base-selected {
        outline-offset: 3px !important;
      }
    `;
    document.head.appendChild(style);
  }

  window.PdfEditorHitbox = {
    getThreshold,
    resolveResizeHit,
    isBottomRightResizeHit,
    getPointerScale,
    installCss
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installCss, { once: true });
  } else {
    installCss();
  }
})();
