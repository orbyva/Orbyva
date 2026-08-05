import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { DROP_ZONE_SELECTOR } from "@/lib/dropZone";

/** Arraste só começa depois deste deslocamento — evita disparar em toques. */
const ACTIVATION_PX = 6;
/** Faixa nas bordas da viewport que rola a tela durante o arraste. */
const EDGE_PX = 96;
const MAX_SCROLL_STEP = 18;

type TouchDragOptions = {
  onDrop: (itemId: string, zone: string) => void;
  onStart?: (itemId: string) => void;
  onZoneChange?: (zone: string | null) => void;
  onCancel?: () => void;
};

type DragState = {
  pointerId: number;
  itemId: string;
  label: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  zone: string | null;
};

const HANDLE_STYLE: CSSProperties = {
  touchAction: "none",
  WebkitTouchCallout: "none",
  userSelect: "none",
};

function scrollableAncestor(target: Element | null): Element {
  let node = target instanceof HTMLElement ? target : null;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (
      /(auto|scroll|overlay)/.test(overflowY) &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return document.scrollingElement ?? document.documentElement;
}

function autoScroll(x: number, y: number): boolean {
  const overshootTop = EDGE_PX - y;
  const overshootBottom = EDGE_PX - (window.innerHeight - y);
  let delta = 0;
  if (overshootTop > 0) {
    delta = -Math.ceil((Math.min(overshootTop, EDGE_PX) / EDGE_PX) * MAX_SCROLL_STEP);
  } else if (overshootBottom > 0) {
    delta = Math.ceil(
      (Math.min(overshootBottom, EDGE_PX) / EDGE_PX) * MAX_SCROLL_STEP
    );
  }
  if (delta === 0) return false;
  const scroller = scrollableAncestor(document.elementFromPoint(x, y));
  const before = scroller.scrollTop;
  scroller.scrollTop = before + delta;
  return scroller.scrollTop !== before;
}

/**
 * Arraste por toque/caneta: o HTML5 drag and drop não é disparado por toque,
 * então o punho de arraste também escuta pointer events e resolve o alvo pelo
 * `data-drop-zone` sob o dedo.
 */
export function useTouchDrag(options: TouchDragOptions) {
  const callbacks = useRef(options);
  callbacks.current = options;

  const drag = useRef<DragState | null>(null);
  const frame = useRef<number | null>(null);
  const [overlay, setOverlay] = useState<{
    label: string;
    x: number;
    y: number;
  } | null>(null);

  const hitTest = useCallback(() => {
    const current = drag.current;
    if (!current) return;
    const element = document.elementFromPoint(current.x, current.y);
    const zone =
      element?.closest<HTMLElement>(DROP_ZONE_SELECTOR)?.dataset.dropZone ??
      null;
    if (current.zone === zone) return;
    current.zone = zone;
    callbacks.current.onZoneChange?.(zone);
  }, []);

  const loop = useCallback(() => {
    const current = drag.current;
    if (!current?.active) {
      frame.current = null;
      return;
    }
    if (autoScroll(current.x, current.y)) hitTest();
    frame.current = requestAnimationFrame(loop);
  }, [hitTest]);

  useEffect(() => {
    function finish(commit: boolean) {
      const current = drag.current;
      drag.current = null;
      if (frame.current != null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
      setOverlay(null);
      if (!current?.active) return;
      callbacks.current.onZoneChange?.(null);
      if (commit && current.zone) {
        callbacks.current.onDrop(current.itemId, current.zone);
      } else {
        callbacks.current.onCancel?.();
      }
    }

    function onPointerMove(event: PointerEvent) {
      const current = drag.current;
      if (!current || event.pointerId !== current.pointerId) return;
      current.x = event.clientX;
      current.y = event.clientY;
      if (!current.active) {
        const distance = Math.hypot(
          current.x - current.startX,
          current.y - current.startY
        );
        if (distance < ACTIVATION_PX) return;
        current.active = true;
        callbacks.current.onStart?.(current.itemId);
        frame.current = requestAnimationFrame(loop);
      }
      if (event.cancelable) event.preventDefault();
      setOverlay({ label: current.label, x: current.x, y: current.y });
      hitTest();
    }

    function onPointerUp(event: PointerEvent) {
      if (drag.current && event.pointerId !== drag.current.pointerId) return;
      finish(true);
    }

    function onPointerCancel(event: PointerEvent) {
      if (drag.current && event.pointerId !== drag.current.pointerId) return;
      finish(false);
    }

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      if (frame.current != null) cancelAnimationFrame(frame.current);
    };
  }, [hitTest, loop]);

  const handleProps = useCallback((itemId: string, label: string) => ({
    style: HANDLE_STYLE,
    onPointerDown: (event: ReactPointerEvent) => {
      if (event.pointerType === "mouse" || !event.isPrimary) return;
      drag.current = {
        pointerId: event.pointerId,
        itemId,
        label,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        active: false,
        zone: null,
      };
    },
  }), []);

  const dragOverlay = overlay
    ? createPortal(
        <div
          className="pointer-events-none fixed z-50 max-w-[70vw] -translate-x-1/2 -translate-y-[150%] truncate rounded-md border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-lg"
          style={{ left: overlay.x, top: overlay.y }}
        >
          {overlay.label}
        </div>,
        document.body
      )
    : null;

  return { handleProps, dragOverlay };
}
