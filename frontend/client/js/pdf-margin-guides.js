(function () {
  if (window.createPdfMarginGuideController) return;

  const STYLE_ID = "pdf-margin-guides-style";

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.pdf-margin-guides-layer{position:absolute;inset:0;z-index:90;pointer-events:none;}
.pdf-margin-guide{position:absolute;pointer-events:auto;touch-action:none;user-select:none;}
.pdf-margin-guide.is-horizontal{height:18px;margin-top:-9px;cursor:row-resize;}
.pdf-margin-guide.is-vertical{width:18px;margin-left:-9px;cursor:col-resize;}
.pdf-margin-guide__line{position:absolute;inset:0;opacity:.95;}
.pdf-margin-guide.is-horizontal .pdf-margin-guide__line{left:0;right:0;top:8px;border-top:2px dotted #2563eb;}
.pdf-margin-guide.is-vertical .pdf-margin-guide__line{top:0;bottom:0;left:8px;border-left:2px dotted #2563eb;}
.pdf-margin-guide__pill{position:absolute;display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:999px;background:rgba(37,99,235,.92);color:#fff;font:700 10px/1 "Segoe UI",Arial,sans-serif;box-shadow:0 8px 18px rgba(37,99,235,.22);white-space:nowrap;}
.pdf-margin-guide.is-horizontal .pdf-margin-guide__pill{top:-10px;right:8px;}
.pdf-margin-guide.is-vertical .pdf-margin-guide__pill{top:8px;left:-8px;transform:translateX(-100%);}
.pdf-margin-guide__dot{width:7px;height:7px;border-radius:999px;background:#dbeafe;box-shadow:0 0 0 2px rgba(255,255,255,.55);}
.pdf-margin-mini-modal{position:fixed;z-index:9999;width:min(260px,calc(100vw - 24px));padding:12px;border-radius:14px;background:rgba(15,23,42,.97);border:1px solid rgba(96,165,250,.45);box-shadow:0 18px 38px rgba(15,23,42,.38);color:#e2e8f0;font-family:"Segoe UI",Arial,sans-serif;}
.pdf-margin-mini-modal.hidden{display:none;}
.pdf-margin-mini-modal__title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#bfdbfe;margin:0 0 8px;}
.pdf-margin-mini-modal__row{display:flex;align-items:center;gap:8px;}
.pdf-margin-mini-modal input{flex:1;min-width:0;border:1px solid rgba(148,163,184,.35);border-radius:10px;background:#0f172a;color:#f8fafc;padding:8px 10px;font-size:14px;font-weight:700;outline:none;}
.pdf-margin-mini-modal input:focus{border-color:#60a5fa;box-shadow:0 0 0 2px rgba(96,165,250,.22);}
.pdf-margin-mini-modal__suffix{font-size:11px;font-weight:800;text-transform:uppercase;color:#93c5fd;}
.pdf-margin-mini-modal__actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px;}
.pdf-margin-mini-modal__btn{border:0;border-radius:999px;padding:7px 12px;font-size:11px;font-weight:800;text-transform:uppercase;cursor:pointer;}
.pdf-margin-mini-modal__btn.is-secondary{background:rgba(51,65,85,.95);color:#e2e8f0;}
.pdf-margin-mini-modal__btn.is-primary{background:#2563eb;color:#fff;}
`;
    document.head.appendChild(style);
  }

  function getNode(ref) {
    if (typeof ref === "function") return ref();
    if (typeof ref === "string") return document.querySelector(ref);
    return ref instanceof Element ? ref : null;
  }

  function clamp(value, min, max, fallback) {
    const num = Number.parseFloat(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, Math.round(num)));
  }

  function frameKey(frame, index) {
    return String(frame?.dataset?.pdfPreviewFrameKey || index);
  }

  function sideLabel(side) {
    if (side === "top") return "Margen superior";
    if (side === "bottom") return "Margen inferior";
    if (side === "left") return "Margen izquierdo";
    return "Margen derecho";
  }

  function buildGuideMarkup(side, index) {
    const axisClass = side === "top" || side === "bottom" ? "is-horizontal" : "is-vertical";
    return `
      <button type="button" class="pdf-margin-guide ${axisClass}" data-margin-guide="${side}" data-frame-index="${index}">
        <span class="pdf-margin-guide__line"></span>
        <span class="pdf-margin-guide__pill">
          <span class="pdf-margin-guide__dot"></span>
          <span data-margin-label>${sideLabel(side)}</span>
        </span>
      </button>`;
  }

  function createModal() {
    const modal = document.createElement("div");
    modal.className = "pdf-margin-mini-modal hidden";
    modal.innerHTML = `
      <p class="pdf-margin-mini-modal__title" data-margin-modal-title>Margen</p>
      <div class="pdf-margin-mini-modal__row">
        <input type="number" step="1" data-margin-modal-input>
        <span class="pdf-margin-mini-modal__suffix">px</span>
      </div>
      <div class="pdf-margin-mini-modal__actions">
        <button type="button" class="pdf-margin-mini-modal__btn is-secondary" data-margin-modal-cancel>Cancelar</button>
        <button type="button" class="pdf-margin-mini-modal__btn is-primary" data-margin-modal-save>Guardar</button>
      </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  window.createPdfMarginGuideController = function createPdfMarginGuideController(options = {}) {
    injectStyles();

    const config = {
      maxMarginPx: 4000,
      minMarginPx: -4000,
      minContentWidthPx: 48,
      minContentHeightPx: 48,
      ...options
    };
    const state = {
      overlay: null,
      modal: null,
      frames: [],
      drag: null,
      raf: 0,
      modalSide: "",
      modalValue: 0
    };

    function getContainer() {
      return getNode(config.container);
    }

    function getRoot() {
      return getNode(config.root);
    }

    function getBaseSizeLimits() {
      if (!state.frames.length) {
        return {
          minBaseWidth: Math.max(1, Number(config.maxMarginPx) || 1),
          minBaseHeight: Math.max(1, Number(config.maxMarginPx) || 1)
        };
      }
      return state.frames.reduce((acc, frame) => ({
        minBaseWidth: Math.min(acc.minBaseWidth, Math.max(1, Number(frame.baseWidth) || 1)),
        minBaseHeight: Math.min(acc.minBaseHeight, Math.max(1, Number(frame.baseHeight) || 1))
      }), {
        minBaseWidth: Number.POSITIVE_INFINITY,
        minBaseHeight: Number.POSITIVE_INFINITY
      });
    }

    function getMaxMarginForSide() {
      const minMargin = Number.isFinite(Number(config.minMarginPx)) ? Number(config.minMarginPx) : 0;
      const maxMargin = Number.isFinite(Number(config.maxMarginPx))
        ? Number(config.maxMarginPx)
        : Math.max(minMargin, 0);
      return Math.max(minMargin, maxMargin);
    }

    function sanitizeMargins(rawMargins, preferredSide = "") {
      const minMargin = Number.isFinite(Number(config.minMarginPx)) ? Number(config.minMarginPx) : 0;
      const maxMargin = Number.isFinite(Number(config.maxMarginPx))
        ? Math.max(minMargin, Number(config.maxMarginPx))
        : Math.max(minMargin, 0);
      const draft = {
        top: clamp(rawMargins?.top, minMargin, maxMargin, minMargin),
        right: clamp(rawMargins?.right, minMargin, maxMargin, minMargin),
        bottom: clamp(rawMargins?.bottom, minMargin, maxMargin, minMargin),
        left: clamp(rawMargins?.left, minMargin, maxMargin, minMargin)
      };
      if (preferredSide === "left" || preferredSide === "right" || preferredSide === "top" || preferredSide === "bottom") {
        draft[preferredSide] = clamp(draft[preferredSide], minMargin, getMaxMarginForSide(preferredSide, draft), draft[preferredSide]);
      }
      draft.left = clamp(draft.left, minMargin, maxMargin, draft.left);
      draft.right = clamp(draft.right, minMargin, maxMargin, draft.right);
      draft.top = clamp(draft.top, minMargin, maxMargin, draft.top);
      draft.bottom = clamp(draft.bottom, minMargin, maxMargin, draft.bottom);
      return draft;
    }

    function getMargins() {
      const margins = config.getMargins ? config.getMargins() : {};
      return sanitizeMargins(margins);
    }

    function ensureOverlay() {
      const container = getContainer();
      if (!container) return null;
      if (!(state.overlay instanceof HTMLElement) || state.overlay.parentElement !== container) {
        if (state.overlay?.parentElement) state.overlay.parentElement.removeChild(state.overlay);
        if (window.getComputedStyle(container).position === "static") container.style.position = "relative";
        const overlay = document.createElement("div");
        overlay.className = "pdf-margin-guides-layer";
        overlay.hidden = true;
        overlay.addEventListener("pointerdown", handlePointerDown);
        container.appendChild(overlay);
        state.overlay = overlay;
      }
      return state.overlay;
    }

    function ensureModal() {
      if (!(state.modal instanceof HTMLElement)) {
        state.modal = createModal();
        state.modal.querySelector("[data-margin-modal-cancel]")?.addEventListener("click", closeModal);
        state.modal.querySelector("[data-margin-modal-save]")?.addEventListener("click", saveModal);
        state.modal.querySelector("[data-margin-modal-input]")?.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            saveModal();
          } else if (event.key === "Escape") {
            closeModal();
          }
        });
      }
      return state.modal;
    }

    function isVisible() {
      if (typeof config.isVisible === "function") return !!config.isVisible();
      return true;
    }

    function collectFrames() {
      const container = getContainer();
      const root = getRoot();
      if (!container || !root) return [];
      const containerRect = container.getBoundingClientRect();
      return Array.from(root.querySelectorAll('[data-pdf-preview-frame="1"]'))
        .map((frame, index) => {
          const frameRect = frame.getBoundingClientRect();
          if (!frameRect.width || !frameRect.height) return null;
          const baseWidth = Math.max(1, Number.parseFloat(frame.dataset.baseWidth) || frameRect.width);
          const baseHeight = Math.max(1, Number.parseFloat(frame.dataset.baseHeight) || frameRect.height);
          return {
            key: frameKey(frame, index),
            index,
            left: frameRect.left - containerRect.left + container.scrollLeft,
            top: frameRect.top - containerRect.top + container.scrollTop,
            width: frameRect.width,
            height: frameRect.height,
            baseWidth,
            baseHeight,
            scaleX: frameRect.width / baseWidth,
            scaleY: frameRect.height / baseHeight
          };
        })
        .filter(Boolean);
    }

    function ensureGuideMarkup(frameCount) {
      const overlay = ensureOverlay();
      if (!overlay) return;
      const existing = overlay.querySelectorAll("[data-margin-guide]");
      if (existing.length === frameCount * 4) return;
      overlay.innerHTML = "";
      for (let index = 0; index < frameCount; index += 1) {
        overlay.insertAdjacentHTML(
          "beforeend",
          [
            buildGuideMarkup("top", index),
            buildGuideMarkup("bottom", index),
            buildGuideMarkup("left", index),
            buildGuideMarkup("right", index)
          ].join("")
        );
      }
    }

    function placeGuide(node, frame, side, margins) {
      if (!(node instanceof HTMLElement) || !frame) return;
      const value = margins[side];
      const label = node.querySelector("[data-margin-label]");
      if (label) label.textContent = `${sideLabel(side)}: ${value}px`;
      if (side === "top") {
        node.style.left = `${frame.left}px`;
        node.style.top = `${frame.top + (value * frame.scaleY)}px`;
        node.style.width = `${frame.width}px`;
        node.style.height = "18px";
      } else if (side === "bottom") {
        node.style.left = `${frame.left}px`;
        node.style.top = `${frame.top + frame.height - (value * frame.scaleY)}px`;
        node.style.width = `${frame.width}px`;
        node.style.height = "18px";
      } else if (side === "left") {
        node.style.left = `${frame.left + (value * frame.scaleX)}px`;
        node.style.top = `${frame.top}px`;
        node.style.width = "18px";
        node.style.height = `${frame.height}px`;
      } else {
        node.style.left = `${frame.left + frame.height * 0 + frame.width - (value * frame.scaleX)}px`;
        node.style.top = `${frame.top}px`;
        node.style.width = "18px";
        node.style.height = `${frame.height}px`;
      }
    }

    function updateGuidePositions(margins = getMargins()) {
      const overlay = ensureOverlay();
      if (!overlay) return;
      overlay.querySelectorAll("[data-margin-guide]").forEach((node) => {
        const frameIndex = Number.parseInt(node.getAttribute("data-frame-index") || "0", 10);
        const side = String(node.getAttribute("data-margin-guide") || "");
        placeGuide(node, state.frames[frameIndex], side, margins);
      });
    }

    function refresh() {
      const overlay = ensureOverlay();
      const container = getContainer();
      const root = getRoot();
      if (!overlay || !container || !root || !isVisible()) {
        if (overlay) overlay.hidden = true;
        closeModal();
        return;
      }
      state.frames = collectFrames();
      if (!state.frames.length) {
        overlay.hidden = true;
        closeModal();
        return;
      }
      overlay.hidden = false;
      overlay.style.width = `${Math.max(container.clientWidth, container.scrollWidth)}px`;
      overlay.style.height = `${Math.max(container.clientHeight, container.scrollHeight)}px`;
      ensureGuideMarkup(state.frames.length);
      updateGuidePositions();
    }

    function scheduleRefresh() {
      if (state.raf) return;
      state.raf = window.requestAnimationFrame(() => {
        state.raf = 0;
        refresh();
      });
    }

    function closeModal() {
      if (!(state.modal instanceof HTMLElement)) return;
      state.modal.classList.add("hidden");
      state.modalSide = "";
    }

    function openModal(side, anchorX, anchorY) {
      const modal = ensureModal();
      if (!modal) return;
      state.modalSide = side;
      state.modalValue = getMargins()[side];
      const title = modal.querySelector("[data-margin-modal-title]");
      const input = modal.querySelector("[data-margin-modal-input]");
      if (title) title.textContent = sideLabel(side);
      if (input) {
        input.min = String(config.minMarginPx);
        input.max = String(config.maxMarginPx);
        input.value = String(state.modalValue);
      }
      modal.classList.remove("hidden");
      const maxLeft = Math.max(12, window.innerWidth - modal.offsetWidth - 12);
      const maxTop = Math.max(12, window.innerHeight - modal.offsetHeight - 12);
      modal.style.left = `${Math.min(maxLeft, Math.max(12, anchorX + 12))}px`;
      modal.style.top = `${Math.min(maxTop, Math.max(12, anchorY + 12))}px`;
      window.requestAnimationFrame(() => {
        input?.focus();
        input?.select();
      });
    }

    function saveModal() {
      const modal = ensureModal();
      const input = modal?.querySelector("[data-margin-modal-input]");
      const side = state.modalSide;
      if (!side || !(input instanceof HTMLInputElement)) {
        closeModal();
        return;
      }
      const margins = sanitizeMargins({
        ...getMargins(),
        [side]: input.value
      }, side);
      if (typeof config.onChange === "function") config.onChange(margins, { side, source: "modal" });
      updateGuidePositions(margins);
      if (typeof config.onCommit === "function") config.onCommit(margins, { side, source: "modal" });
      closeModal();
    }

    function releasePointer(stateDrag) {
      const captureNode = stateDrag?.captureNode;
      if (!captureNode || stateDrag.pointerId === undefined) return;
      if (typeof captureNode.releasePointerCapture === "function") {
        try {
          captureNode.releasePointerCapture(stateDrag.pointerId);
        } catch (_) {}
      }
    }

    function endDrag(event) {
      if (!state.drag) return;
      const drag = state.drag;
      state.drag = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      releasePointer(drag);
      if (drag.moved) {
        if (typeof config.onCommit === "function") config.onCommit(getMargins(), { side: drag.side, source: "drag" });
      } else {
        openModal(drag.side, event?.clientX || drag.startX, event?.clientY || drag.startY);
      }
    }

    function handlePointerDown(event) {
      if (event.button !== 0) return;
      if (!isVisible()) return;
      const target = event.target instanceof Element ? event.target.closest("[data-margin-guide]") : null;
      if (!(target instanceof HTMLElement)) return;
      const frameIndex = Number.parseInt(target.getAttribute("data-frame-index") || "0", 10);
      const side = String(target.getAttribute("data-margin-guide") || "");
      const frame = state.frames[frameIndex];
      if (!frame || !["top", "bottom", "left", "right"].includes(side)) return;
      closeModal();
      const scale = (side === "top" || side === "bottom") ? frame.scaleY : frame.scaleX;
      const margins = getMargins();
      state.drag = {
        side,
        startX: event.clientX,
        startY: event.clientY,
        startValue: margins[side],
        pointerId: event.pointerId,
        captureNode: target,
        scale: scale || 1,
        moved: false
      };
      if (typeof target.setPointerCapture === "function") {
        try {
          target.setPointerCapture(event.pointerId);
        } catch (_) {}
      }
      document.body.style.userSelect = "none";
      document.body.style.cursor = side === "top" || side === "bottom" ? "row-resize" : "col-resize";
      event.preventDefault();
    }

    function handlePointerMove(event) {
      if (!state.drag) return;
      if (state.drag.pointerId !== undefined && event.pointerId !== state.drag.pointerId) return;
      const drag = state.drag;
      const deltaX = (event.clientX - drag.startX) / (drag.scale || 1);
      const deltaY = (event.clientY - drag.startY) / (drag.scale || 1);
      let nextValue = drag.startValue;
      if (drag.side === "top") nextValue = drag.startValue + deltaY;
      if (drag.side === "bottom") nextValue = drag.startValue - deltaY;
      if (drag.side === "left") nextValue = drag.startValue + deltaX;
      if (drag.side === "right") nextValue = drag.startValue - deltaX;
      const margins = sanitizeMargins({
        ...getMargins(),
        [drag.side]: nextValue
      }, drag.side);
      drag.moved = drag.moved || Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3;
      if (typeof config.onChange === "function") config.onChange(margins, { side: drag.side, source: "drag" });
      updateGuidePositions(margins);
      event.preventDefault();
    }

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", endDrag);
    document.addEventListener("pointercancel", endDrag);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal();
    });

    const container = getContainer();
    container?.addEventListener("scroll", scheduleRefresh, { passive: true });
    window.addEventListener("resize", scheduleRefresh);

    return {
      refresh,
      scheduleRefresh,
      closeModal
    };
  };
})();
