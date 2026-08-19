import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { snapPoint } from '../lib/measure';

const COLORS = {
  bg: '#f8fafc',
  grid: '#e2e8f0',
  entity: '#1e293b',
  text: '#64748b',
  accent: '#e11d48',
  accentSoft: 'rgba(225, 29, 72, 0.18)',
  pending: '#0ea5e9',
  labelBg: 'rgba(248,250,252,0.9)'
};

const Viewer = forwardRef(function Viewer(props, ref) {
  const {
    primitives, bounds, units, tool,
    pending, measurements, hover,
    onTap, onHover, onFinalize, onUndo
  } = props;

  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const cam = useRef({ cx: 0, cy: 0, scale: 1, ready: false });
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const drawRequest = useRef(0);
  const drawSceneRef = useRef(() => {});

  const getRect = useCallback(() => canvasRef.current.getBoundingClientRect(), []);

  const fitView = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const w = c.clientWidth;
    const h = c.clientHeight;
    const p = 24;
    const scale = Math.min((w - p * 2) / bounds.w, (h - p * 2) / bounds.h, 200);
    if (!isFinite(scale) || scale <= 0) return;
    cam.current = { cx: bounds.cx, cy: bounds.cy, scale, ready: true };
    requestDraw();
  }, [bounds]);

  const screenToWorld = useCallback((sx, sy) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const w = c.clientWidth;
    const h = c.clientHeight;
    const cam0 = cam.current;
    return { x: cam0.cx + (sx - w / 2) / cam0.scale, y: cam0.cy - (sy - h / 2) / cam0.scale };
  }, []);

  useImperativeHandle(ref, () => ({
    fit: fitView,
    getScale: () => cam.current.scale,
    zoomIn: () => zoomAt(canvasRef.current.clientWidth / 2, canvasRef.current.clientHeight / 2, 1.35),
    zoomOut: () => zoomAt(canvasRef.current.clientWidth / 2, canvasRef.current.clientHeight / 2, 1 / 1.35)
  }), [fitView, zoomAt]);

  const requestDraw = useCallback(() => {
    if (drawRequest.current) return;
    drawRequest.current = requestAnimationFrame(() => {
      drawRequest.current = 0;
      drawSceneRef.current();
    });
  }, []);

  const drawScene = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    const w = c.clientWidth;
    const h = c.clientHeight;
    const cam0 = cam.current;

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    drawGrid(ctx, w, h, cam0);
    drawPrimitives(ctx, primitives, cam0);

    for (const m of measurements) drawMeasurement(ctx, m, cam0);
    drawPending(ctx, pending, hover, cam0, tool);
  }, [primitives, measurements, pending, hover, tool]);

  useEffect(() => {
    drawSceneRef.current = drawScene;
  });

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const c = canvasRef.current;
      if (!c) return;
      const w = c.clientWidth;
      const h = c.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!cam.current.ready) fitView();
      requestDraw();
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [fitView, requestDraw]);

  useEffect(() => {
    requestDraw();
  }, [drawScene, requestDraw]);

  const zoomAt = useCallback((sx, sy, factor) => {
    const c = canvasRef.current;
    if (!c) return;
    const cam0 = cam.current;
    const world = screenToWorld(sx, sy);
    const newScale = Math.max(1e-6, Math.min(1e6, cam0.scale * factor));
    cam.current = { cx: world.x, cy: world.y, scale: newScale, ready: true };
    requestDraw();
  }, [screenToWorld, requestDraw]);

  const panBy = useCallback((dx, dy) => {
    const cam0 = cam.current;
    cam.current = {
      ...cam0,
      cx: cam0.cx - dx / cam0.scale,
      cy: cam0.cy + dy / cam0.scale
    };
    requestDraw();
  }, [requestDraw]);

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    const rect = getRect();
    pointers.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top, sx: 0, sy: 0, t: performance.now() });
    canvasRef.current.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()];
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const cam0 = cam.current;
      gesture.current = { type: 'pinch', scale: cam0.scale, d, mid, world: screenToWorld(mid.x, mid.y) };
    }
  }, [getRect, screenToWorld]);

  const handlePointerMove = useCallback((e) => {
    const rect = getRect();
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = x - p.x;
    const dy = y - p.y;
    p.sx += Math.abs(dx);
    p.sy += Math.abs(dy);
    const prevX = p.x;
    const prevY = p.y;
    p.x = x;
    p.y = y;

    if (gesture.current && gesture.current.type === 'pinch') {
      const pts = [...pointers.current.values()];
      if (pts.length >= 2) {
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        const d = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const g = gesture.current;
        const factor = d / g.d;
        const newScale = Math.max(1e-6, Math.min(1e6, g.scale * factor));
        cam.current = {
          cx: g.world.x - (mid.x - canvasRef.current.clientWidth / 2) / newScale,
          cy: g.world.y + (mid.y - canvasRef.current.clientHeight / 2) / newScale,
          scale: newScale,
          ready: true
        };
      }
    } else if (pointers.current.size === 1) {
      panBy(dx, dy);
      onHover(screenToWorld(x, y));
    }
    void prevX;
    void prevY;
    requestDraw();
  }, [getRect, panBy, requestDraw, screenToWorld, onHover]);

  const handlePointerUp = useCallback((e) => {
    const p = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (gesture.current && pointers.current.size < 2) gesture.current = null;
    const rect = getRect();
    const t = performance.now();
    if (p && pointers.current.size === 0 && t - p.t < 600 && p.sx < 8 && p.sy < 8) {
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      let wpt = screenToWorld(x, y);
      wpt = snapPoint(wpt, primitives, 14, cam.current.scale);
      onTap(wpt);
    }
    onHover(null);
    if (pointers.current.size === 0) gesture.current = null;
  }, [getRect, screenToWorld, onTap, primitives, onHover]);

  useEffect(() => {
    const c = canvasRef.current;
    const wheel = (e) => {
      e.preventDefault();
      const rect = getRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const factor = Math.pow(1.0015, -e.deltaY);
      zoomAt(x, y, factor);
    };
    const ctxmenu = (e) => e.preventDefault();
    c.addEventListener('wheel', wheel, { passive: false });
    c.addEventListener('contextmenu', ctxmenu);
    return () => {
      c.removeEventListener('wheel', wheel);
      c.removeEventListener('contextmenu', ctxmenu);
    };
  }, [getRect, zoomAt]);

  useEffect(() => {
    // keep tool change from leaving dangling pinch gesture
    gesture.current = null;
  }, [tool]);

  return (
    <div ref={wrapRef} className="viewer-wrap">
      <canvas
        ref={canvasRef}
        style={{ touchAction: 'none', width: '100%', height: '100%', display: 'block' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
});

export default Viewer;

function drawGrid(ctx, w, h, cam0) {
  const pxPerUnit = cam0.scale;
  const step = niceStep(pxPerUnit);
  const ctx2 = ctx;
  ctx2.strokeStyle = COLORS.grid;
  ctx2.lineWidth = 1;
  ctx2.beginPath();
  const x0 = Math.floor((cam0.cx - w / 2 / pxPerUnit) / step) * step;
  for (let x = x0; x <= cam0.cx + w / 2 / pxPerUnit; x += step) {
    const sx = (x - cam0.cx) * pxPerUnit + w / 2;
    ctx2.moveTo(sx, 0);
    ctx2.lineTo(sx, h);
  }
  const y0 = Math.floor((cam0.cy - h / 2 / pxPerUnit) / step) * step;
  for (let y = y0; y <= cam0.cy + h / 2 / pxPerUnit; y += step) {
    const sy = h / 2 - (y - cam0.cy) * pxPerUnit;
    ctx2.moveTo(0, sy);
    ctx2.lineTo(w, sy);
  }
  ctx2.stroke();
}

function niceStep(pxPerUnit) {
  const target = 90;
  const raw = target / pxPerUnit;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  let step = mag;
  for (const m of [1, 2, 5, 10]) {
    if (mag * m >= raw) {
      step = mag * m;
      break;
    }
  }
  return step;
}

function drawPrimitives(ctx, primitives, cam0) {
  for (const p of primitives) {
    if (p.kind === 'polyline') {
      if (p.points.length < 2) continue;
      ctx.strokeStyle = COLORS.entity;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const s0 = w2s(p.points[0], cam0, ctx.canvas);
      ctx.moveTo(s0.x, s0.y);
      for (let i = 1; i < p.points.length; i++) {
        const s = w2s(p.points[i], cam0, ctx.canvas);
        ctx.lineTo(s.x, s.y);
      }
      if (p.closed) {
        const s0b = w2s(p.points[0], cam0, ctx.canvas);
        ctx.lineTo(s0b.x, s0b.y);
      }
      ctx.stroke();
    } else if (p.kind === 'point') {
      const s = w2s(p, cam0, ctx.canvas);
      ctx.fillStyle = COLORS.entity;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'text') {
      const s = w2s({ x: p.x, y: p.y }, cam0, ctx.canvas);
      const size = Math.max(6, Math.min(48, Math.abs(p.height * cam0.scale)));
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(-p.rotation * Math.PI / 180);
      ctx.fillStyle = COLORS.text;
      ctx.font = `${size}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(p.text, 0, -size * 0.35);
      ctx.restore();
    }
  }
}

function w2s(p, cam0, canvas) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  return { x: (p.x - cam0.cx) * cam0.scale + w / 2, y: h / 2 - (p.y - cam0.cy) * cam0.scale };
}

function drawPending(ctx, pending, hover, cam0, tool) {
  if (!pending.length) return;
  const c = ctx.canvas;
  ctx.save();
  ctx.strokeStyle = COLORS.pending;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  const s0 = w2s(pending[0], cam0, c);
  ctx.moveTo(s0.x, s0.y);
  for (let i = 1; i < pending.length; i++) {
    const s = w2s(pending[i], cam0, c);
    ctx.lineTo(s.x, s.y);
  }
  ctx.stroke();
  if (hover && (tool === 'distance' || tool === 'length' || tool === 'area' || tool === 'angle')) {
    const last = w2s(pending[pending.length - 1], cam0, c);
    const hv = w2s(hover, cam0, c);
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(hv.x, hv.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const p of pending) {
    const s = w2s(p, cam0, c);
    ctx.fillStyle = COLORS.pending;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

function drawMeasurement(ctx, m, cam0) {
  const c = ctx.canvas;
  ctx.save();
  ctx.strokeStyle = COLORS.accent;
  ctx.fillStyle = COLORS.accent;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([]);

  if (m.type === 'distance') {
    const a = w2s(m.points[0], cam0, c);
    const b = w2s(m.points[1], cam0, c);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    drawMarker(ctx, a);
    drawMarker(ctx, b);
    drawLabel(ctx, m.label, (a.x + b.x) / 2, (a.y + b.y) / 2);
  } else if (m.type === 'length') {
    ctx.beginPath();
    for (let i = 0; i < m.points.length; i++) {
      const s = w2s(m.points[i], cam0, c);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();
    for (const p of m.points) drawMarker(ctx, w2s(p, cam0, c));
    const last = w2s(m.points[m.points.length - 1], cam0, c);
    drawLabel(ctx, m.label, last.x + 10, last.y - 10);
  } else if (m.type === 'area') {
    const pts = m.points.map((p) => w2s(p, cam0, c));
    ctx.fillStyle = COLORS.accentSoft;
    ctx.strokeStyle = COLORS.accent;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
      else ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (const p of pts) drawMarker(ctx, p, 4);
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    drawLabel(ctx, m.label, cx, cy);
  } else if (m.type === 'radius' || m.type === 'diameter') {
    const cntr = w2s({ x: m.circle.cx, y: m.circle.cy }, cam0, c);
    const r = m.circle.r * cam0.scale;
    ctx.beginPath();
    ctx.setLineDash([5, 4]);
    ctx.arc(cntr.x, cntr.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (m.type === 'radius') {
      const end = w2s({ x: m.circle.cx + m.circle.r, y: m.circle.cy }, cam0, c);
      ctx.beginPath();
      ctx.moveTo(cntr.x, cntr.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      drawArrow(ctx, cntr, end);
      drawMarker(ctx, end, 4);
      drawLabel(ctx, m.label, (cntr.x + end.x) / 2, (cntr.y + end.y) / 2 - 16);
    } else {
      const e1 = w2s({ x: m.circle.cx - m.circle.r, y: m.circle.cy }, cam0, c);
      const e2 = w2s({ x: m.circle.cx + m.circle.r, y: m.circle.cy }, cam0, c);
      ctx.beginPath();
      ctx.moveTo(e1.x, e1.y);
      ctx.lineTo(e2.x, e2.y);
      ctx.stroke();
      drawArrow(ctx, e1, e2);
      drawMarker(ctx, e1, 4);
      drawMarker(ctx, e2, 4);
      drawLabel(ctx, m.label, (e1.x + e2.x) / 2, (e1.y + e2.y) / 2 - 16);
    }
  } else if (m.type === 'angle') {
    const [va, a, b] = m.points.map((p) => w2s(p, cam0, c));
    ctx.beginPath();
    ctx.moveTo(va.x, va.y);
    ctx.lineTo(a.x, a.y);
    ctx.moveTo(va.x, va.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    drawMarker(ctx, va, 5);
    drawMarker(ctx, a, 4);
    drawMarker(ctx, b, 4);
    // arc
    const r = 22;
    const a1 = Math.atan2(a.y - va.y, a.x - va.x);
    const a2 = Math.atan2(b.y - va.y, b.x - va.x);
    ctx.beginPath();
    ctx.arc(va.x, va.y, r, Math.min(a1, a2), Math.max(a1, a2), Math.max(a1, a2) - Math.min(a1, a2) > Math.PI);
    ctx.stroke();
    const midA = (a1 + a2) / 2;
    drawLabel(ctx, m.label, va.x + Math.cos(midA) * (r + 16), va.y + Math.sin(midA) * (r + 16));
  }
  ctx.restore();
}

function drawMarker(ctx, s, r = 5) {
  ctx.beginPath();
  ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawArrow(ctx, from, to) {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const len = 9;
  ctx.fillStyle = COLORS.accent;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - len * Math.cos(ang - 0.4), to.y - len * Math.sin(ang - 0.4));
  ctx.lineTo(to.x - len * Math.cos(ang + 0.4), to.y - len * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fill();
}

function drawLabel(ctx, text, x, y) {
  ctx.save();
  ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
  const w = ctx.measureText(text).width;
  ctx.fillStyle = COLORS.labelBg;
  ctx.fillRect(x - w / 2 - 5, y - 9, w + 10, 18);
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - w / 2 - 5, y - 9, w + 10, 18);
  ctx.fillStyle = COLORS.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}