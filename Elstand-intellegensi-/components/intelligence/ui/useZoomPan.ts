"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from "react";

/**
 * useZoomPan — a small, dependency-free pan/zoom/pinch controller for
 * "canvas-like" panels (node maps, heatmaps, etc.), in the spirit of
 * Arkham Intelligence's wallet graph explorer.
 *
 * Interaction model (mirrors Google Maps / Figma conventions on purpose,
 * so it needs no onboarding):
 *  - Mouse: click-drag to pan. Ctrl/Cmd + scroll to zoom — plain scroll is
 *    left alone so the page underneath keeps scrolling normally.
 *  - Touch: a single finger is never captured, so the page still scrolls
 *    past the map like normal. Two fingers pinch/drag together to pan+zoom.
 *  - Always-visible +/-/reset controls and double-click/double-tap cover
 *    anyone who doesn't discover the gestures.
 *
 * Layout math note: this hook never reads getBoundingClientRect() for its
 * own geometry. Callers that draw connectors between children (e.g. an SVG
 * of edges between nodes) should measure with offsetLeft/offsetTop too —
 * those are unaffected by the CSS `transform` this hook applies, so
 * positions stay correct in the untransformed local space and the whole
 * group scales/pans together as one unit with no per-frame recalculation.
 */

export interface ZoomPanOptions {
  minScale?: number;
  maxScale?: number;
  /** Minimum px of content that must keep overlapping the viewport at the pan limits. */
  edgePadding?: number;
  reducedMotion?: boolean;
}

interface Camera {
  scale: number;
  x: number;
  y: number;
}
interface Point {
  x: number;
  y: number;
}
interface PanGesture {
  kind: "pan";
  startCamera: Camera;
  startPoint: Point;
  moved: boolean;
}
interface PinchGesture {
  kind: "pinch";
  startCamera: Camera;
  startDist: number;
  anchor: Point;
  moved: boolean;
}
type Gesture = PanGesture | PinchGesture;

const DEFAULT_MIN = 0.6;
const DEFAULT_MAX = 3;
const DEFAULT_PADDING = 64;
const DRAG_THRESHOLD = 6;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_DIST = 26;
const CLICK_SUPPRESS_MS = 300;

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
function clampAxis(pos: number, contentPx: number, viewportPx: number, padding: number) {
  if (contentPx <= viewportPx) return (viewportPx - contentPx) / 2;
  const min = padding - contentPx;
  const max = viewportPx - padding;
  return Math.min(max, Math.max(min, pos));
}

export function useZoomPan(viewportRef: RefObject<HTMLDivElement>, contentRef: RefObject<HTMLDivElement>, options: ZoomPanOptions = {}) {
  const minScale = options.minScale ?? DEFAULT_MIN;
  const maxScale = options.maxScale ?? DEFAULT_MAX;
  const edgePadding = options.edgePadding ?? DEFAULT_PADDING;
  const reducedMotion = options.reducedMotion ?? false;

  const [camera, setCameraState] = useState<Camera>({ scale: 1, x: 0, y: 0 });
  const [isInteracting, setIsInteracting] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  const pointers = useRef<Map<number, Point>>(new Map());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<{ t: number; p: Point } | null>(null);
  const suppressClickUntil = useRef(0);
  const transitionTimer = useRef<ReturnType<typeof setTimeout>>();

  const clamp = useCallback(
    (next: Camera): Camera => {
      const scale = Math.min(maxScale, Math.max(minScale, next.scale));
      const vpEl = viewportRef.current;
      const contentEl = contentRef.current;
      if (!vpEl || !contentEl) return { scale, x: next.x, y: next.y };
      const vw = vpEl.clientWidth;
      const vh = vpEl.clientHeight;
      const cw = contentEl.offsetWidth * scale;
      const ch = contentEl.offsetHeight * scale;
      return {
        scale,
        x: clampAxis(next.x, cw, vw, edgePadding),
        y: clampAxis(next.y, ch, vh, edgePadding),
      };
    },
    [minScale, maxScale, edgePadding, viewportRef, contentRef]
  );

  const setCamera = useCallback(
    (next: Camera, animate = false) => {
      setCameraState(clamp(next));
      if (animate && !reducedMotion) {
        setIsTransitioning(true);
        clearTimeout(transitionTimer.current);
        transitionTimer.current = setTimeout(() => setIsTransitioning(false), 260);
      }
    },
    [clamp, reducedMotion]
  );

  useEffect(() => () => clearTimeout(transitionTimer.current), []);

  const zoomAt = useCallback(
    (cx: number, cy: number, factor: number, animate = false) => {
      const prev = cameraRef.current;
      const nextScale = Math.min(maxScale, Math.max(minScale, prev.scale * factor));
      const k = nextScale / prev.scale;
      setCamera({ scale: nextScale, x: cx - k * (cx - prev.x), y: cy - k * (cy - prev.y) }, animate);
    },
    [minScale, maxScale, setCamera]
  );

  const zoomIn = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    zoomAt(vp.clientWidth / 2, vp.clientHeight / 2, 1.4, true);
  }, [viewportRef, zoomAt]);

  const zoomOut = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    zoomAt(vp.clientWidth / 2, vp.clientHeight / 2, 1 / 1.4, true);
  }, [viewportRef, zoomAt]);

  const reset = useCallback(() => setCamera({ scale: 1, x: 0, y: 0 }, true), [setCamera]);

  const localFromScreen = useCallback((p: Point, cam: Camera): Point => ({ x: (p.x - cam.x) / cam.scale, y: (p.y - cam.y) / cam.scale }), []);

  const pointFromEvent = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>): Point => {
      const rect = viewportRef.current?.getBoundingClientRect();
      return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
    },
    [viewportRef]
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const p = pointFromEvent(e);
      pointers.current.set(e.pointerId, p);

      // Double-click / double-tap to jump zoom, checked whenever this is the
      // first pointer of a fresh gesture — before deciding what (if
      // anything) to start.
      if (pointers.current.size === 1) {
        const now = Date.now();
        const last = lastTap.current;
        if (last && now - last.t < DOUBLE_TAP_MS && dist(p, last.p) < DOUBLE_TAP_DIST) {
          lastTap.current = null;
          if (cameraRef.current.scale > 1.15) reset();
          else zoomAt(p.x, p.y, 2 / cameraRef.current.scale, true);
          return;
        }
        lastTap.current = { t: now, p };
      }

      // A single touch is never captured, so the page keeps scrolling past
      // the map normally — only a second finger (pinch) engages the canvas.
      if (e.pointerType === "touch" && pointers.current.size === 1) return;

      viewportRef.current?.setPointerCapture(e.pointerId);

      if (pointers.current.size === 1) {
        gesture.current = { kind: "pan", startCamera: cameraRef.current, startPoint: p, moved: false };
      } else if (pointers.current.size >= 2) {
        const pts = Array.from(pointers.current.values()).slice(0, 2);
        const m = midpoint(pts[0], pts[1]);
        gesture.current = {
          kind: "pinch",
          startCamera: cameraRef.current,
          startDist: dist(pts[0], pts[1]) || 1,
          anchor: localFromScreen(m, cameraRef.current),
          moved: false,
        };
      }
      setIsInteracting(true);
    },
    [pointFromEvent, viewportRef, localFromScreen, reset, zoomAt]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!pointers.current.has(e.pointerId)) return;
      const p = pointFromEvent(e);
      pointers.current.set(e.pointerId, p);

      const g = gesture.current;
      if (!g) return;

      if (g.kind === "pan") {
        const dx = p.x - g.startPoint.x;
        const dy = p.y - g.startPoint.y;
        if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        g.moved = true;
        setCamera({ scale: g.startCamera.scale, x: g.startCamera.x + dx, y: g.startCamera.y + dy });
      } else if (g.kind === "pinch" && pointers.current.size >= 2) {
        const pts = Array.from(pointers.current.values()).slice(0, 2);
        const m = midpoint(pts[0], pts[1]);
        const d = dist(pts[0], pts[1]) || 1;
        const nextScale = Math.min(maxScale, Math.max(minScale, (g.startCamera.scale * d) / g.startDist));
        g.moved = true;
        setCamera({ scale: nextScale, x: m.x - nextScale * g.anchor.x, y: m.y - nextScale * g.anchor.y });
      }
    },
    [pointFromEvent, setCamera, minScale, maxScale]
  );

  const endPointer = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      pointers.current.delete(e.pointerId);
      const vp = viewportRef.current;
      if (vp && vp.hasPointerCapture(e.pointerId)) vp.releasePointerCapture(e.pointerId);

      if (pointers.current.size === 0) {
        if (gesture.current?.moved) suppressClickUntil.current = Date.now() + CLICK_SUPPRESS_MS;
        gesture.current = null;
        setIsInteracting(false);
      } else if (pointers.current.size === 1 && gesture.current?.kind === "pinch") {
        // Downgrade a pinch to a single-finger pan instead of ending the
        // gesture, so lifting one finger mid-pinch doesn't jolt the map.
        const [remaining] = Array.from(pointers.current.values());
        gesture.current = { kind: "pan", startCamera: cameraRef.current, startPoint: remaining, moved: true };
        suppressClickUntil.current = Date.now() + CLICK_SUPPRESS_MS;
      }
    },
    [viewportRef]
  );

  // Ctrl/Cmd + wheel to zoom. Attached as a native listener (not React's
  // onWheel) because React registers wheel handlers as passive by default,
  // which would silently ignore preventDefault() and scroll the page too.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = Math.min(1.3, Math.max(0.75, Math.pow(1.0016, -e.deltaY)));
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [viewportRef, zoomAt]);

  const contentStyle: CSSProperties = {
    transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
    transformOrigin: "0 0",
    transition: isTransitioning && !reducedMotion ? "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)" : undefined,
    willChange: "transform",
  };

  const viewportStyle: CSSProperties = {
    touchAction: "pan-y",
    cursor: isInteracting ? "grabbing" : "grab",
    userSelect: isInteracting ? "none" : undefined,
  };

  return {
    scale: camera.scale,
    isInteracting,
    contentStyle,
    viewportStyle,
    viewportHandlers: { onPointerDown, onPointerMove, onPointerUp: endPointer, onPointerCancel: endPointer },
    zoomIn,
    zoomOut,
    reset,
    canZoomIn: camera.scale < maxScale - 0.001,
    canZoomOut: camera.scale > minScale + 0.001,
    isAtDefault: Math.abs(camera.scale - 1) < 0.001 && Math.abs(camera.x) < 0.5 && Math.abs(camera.y) < 0.5,
    shouldSuppressClick: () => Date.now() < suppressClickUntil.current,
  };
}
