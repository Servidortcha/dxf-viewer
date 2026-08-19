import DxfParser from 'dxf-parser';

export const UNIT_LABELS = {
  0: '',
  1: 'in',
  2: 'ft',
  3: 'mi',
  4: 'mm',
  5: 'cm',
  6: 'm',
  7: 'km',
  8: 'mil',
  9: 'yd',
  10: 'yd',
  11: 'ang.,stron',
  12: 'nm',
  13: 'um',
  14: 'dm',
  15: 'dam',
  16: 'hm',
  17: 'gm',
  18: 'au. u.',
  19: 'ly',
  20: 'pc'
};

export function parseDxfText(text) {
  const parser = new DxfParser();
  const dxf = parser.parseSync(text);
  if (!dxf) throw new Error('No se pudo parsear el archivo DXF.');
  const units = dxf.header && dxf.header.$INSUNITS != null ? Number(dxf.header.$INSUNITS) : 0;
  const blocks = dxf.blocks || {};
  const primitives = [];
  expandEntities(dxf.entities || [], blocks, identityTransform(), primitives, 0);
  const bounds = computeBounds(primitives);
  return { units, primitives, bounds, blockNames: Object.keys(blocks) };
}

function identityTransform() {
  return { ox: 0, oy: 0, c: 1, s: 0, sx: 1, sy: 1, rot: 0 };
}

function composeTransform(outer, inner) {
  const cos = Math.cos((outer.rot + inner.rot) * Math.PI / 180);
  const sin = Math.sin((outer.rot + inner.rot) * Math.PI / 180);
  return {
    ox: outer.ox + outer.sx * (outer.c * inner.ox - outer.s * inner.oy),
    oy: outer.oy + outer.sy * (outer.s * inner.ox + outer.c * inner.oy),
    c: cos,
    s: sin,
    sx: outer.sx * inner.sx,
    sy: outer.sy * inner.sy,
    rot: outer.rot + inner.rot
  };
}

function applyTransform(t, x, y) {
  return {
    x: t.ox + t.sx * (t.c * x - t.s * y),
    y: t.oy + t.sy * (t.s * x + t.c * y)
  };
}

function expandEntities(entities, blocks, transform, out, depth) {
  if (depth > 12) return;
  for (const e of entities) {
    if (!e) continue;
    switch (e.type) {
      case 'INSERT': {
        const blk = blocks[e.name];
        if (!blk) break;
        const base = blk.position || { x: 0, y: 0 };
        const inner = {
          ox: e.position.x - (base.x || 0),
          oy: e.position.y - (base.y || 0),
          c: Math.cos(e.rotation * Math.PI / 180),
          s: Math.sin(e.rotation * Math.PI / 180),
          sx: e.xScale != null ? e.xScale : 1,
          sy: e.yScale != null ? e.yScale : 1,
          rot: e.rotation == null ? 0 : e.rotation
        };
        const composed = composeTransform(transform, inner);
        const ents = blk.entities || [];
        expandEntities(ents, blocks, composed, out, depth + 1);
        break;
      }
      case 'LINE': {
        const a = e.vertices && e.vertices[0];
        const b = e.vertices && e.vertices[1];
        if (a && b) {
          out.push({
            kind: 'polyline',
            points: [tr(transform, a.x, a.y), tr(transform, b.x, b.y)],
            closed: false
          });
        }
        break;
      }
      case 'LWPOLYLINE': {
        const verts = e.vertices || [];
        if (!verts.length) break;
        const pts = [];
        for (let i = 0; i < verts.length; i++) {
          const v = verts[i];
          const next = verts[(i + 1) % verts.length];
          const lastIteration = i === verts.length - 1;
          const bulge = v.bulge || 0;
          if (bulge === 0) {
            pts.push(tr(transform, v.x, v.y));
            if (lastIteration && !e.shape) break;
          } else {
            pts.push(tr(transform, v.x, v.y));
            const arcPts = arcFromBulge(v.x, v.y, next.x, next.y, bulge);
            for (let k = 1; k < arcPts.length - 1; k++) pts.push(tr(transform, arcPts[k].x, arcPts[k].y));
            if (lastIteration && e.shape) {
              if (arcPts.length) pts.push(tr(transform, arcPts[arcPts.length - 1].x, arcPts[arcPts.length - 1].y));
            }
            if (lastIteration && !e.shape) break;
          }
        }
        if (pts.length > 1) out.push({ kind: 'polyline', points: pts, closed: !!e.shape });
        break;
      }
      case 'POLYLINE': {
        const verts = e.vertices || [];
        if (!verts.length) break;
        const pts = [];
        const last = verts[verts.length - 1];
        for (let i = 0; i < verts.length; i++) {
          const v = verts[i];
          const next = verts[(i + 1) % verts.length];
          const lastIteration = i === verts.length - 1;
          const bulge = v.bulge || 0;
          if (bulge === 0) {
            pts.push(tr(transform, v.x, v.y));
            if (lastIteration && !e.shape) break;
          } else {
            pts.push(tr(transform, v.x, v.y));
            const arcPts = arcFromBulge(v.x, v.y, next.x, next.y, bulge);
            for (let k = 1; k < arcPts.length - 1; k++) pts.push(tr(transform, arcPts[k].x, arcPts[k].y));
            if (lastIteration && e.shape && arcPts.length) pts.push(tr(transform, arcPts[arcPts.length - 1].x, arcPts[arcPts.length - 1].y));
            if (lastIteration && !e.shape) break;
          }
        }
        if (pts.length > 1) out.push({ kind: 'polyline', points: pts, closed: !!e.shape });
        break;
      }
      case 'CIRCLE': {
        const c = e.center || {};
        const r = e.radius || 0;
        if (!r) break;
        const center = tr(transform, c.x, c.y);
        const scale = (Math.abs(transform.sx) + Math.abs(transform.sy)) / 2;
        const rc = r * scale;
        out.push({ kind: 'circle', cx: center.x, cy: center.y, r: rc, arc: false });
        const pts = [];
        const steps = 72;
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          pts.push(tr(transform, c.x + r * Math.cos(a), c.y + r * Math.sin(a)));
        }
        pts.push({ ...pts[0] });
        out.push({ kind: 'polyline', points: pts, closed: true });
        break;
      }
      case 'ARC': {
        const c = e.center || {};
        const r = e.radius || 0;
        if (!r) break;
        const center = tr(transform, c.x, c.y);
        const scale = (Math.abs(transform.sx) + Math.abs(transform.sy)) / 2;
        const rc = r * scale;
        out.push({ kind: 'circle', cx: center.x, cy: center.y, r: rc, arc: true });
        const start = e.startAngle || 0;
        const end = e.endAngle != null ? e.endAngle : 0;
        let sweep = end - start;
        if (sweep <= 0) sweep += Math.PI * 2;
        const steps = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 6)));
        const pts = [];
        for (let i = 0; i <= steps; i++) {
          const a = start + (sweep * i) / steps;
          pts.push(tr(transform, c.x + r * Math.cos(a), c.y + r * Math.sin(a)));
        }
        out.push({ kind: 'polyline', points: pts, closed: false });
        break;
      }
      case 'ELLIPSE': {
        const c = e.center || {};
        const mv = e.majorAxisEndPoint || { x: 0, y: 0 };
        const ratio = e.axisRatio == null ? 1 : e.axisRatio;
        const a = Math.hypot(mv.x, mv.y) || 1;
        const b = a * ratio;
        const ang = Math.atan2(mv.y, mv.x);
        const ux = mv.x / a, uy = mv.y / a;
        const vx = -uy, vy = ux;
        let s = e.startAngle == null ? 0 : e.startAngle;
        let en = e.endAngle == null ? 360 : Math.max(s + 0.01, e.endAngle);
        if (en < s) en += 360;
        const sweep = (en - s) * Math.PI / 180;
        const steps = Math.max(16, Math.ceil(sweep / (Math.PI / 12)));
        const pts = [];
        for (let i = 0; i <= steps; i++) {
          const t0 = s * Math.PI / 180 + (sweep * i) / steps;
          const px = a * Math.cos(t0) * ux + b * Math.sin(t0) * vx;
          const py = a * Math.cos(t0) * uy + b * Math.sin(t0) * vy;
          pts.push(tr(transform, c.x + px, c.y + py));
        }
        out.push({ kind: 'polyline', points: pts, closed: false });
        break;
      }
      case 'SPLINE': {
        const cps = e.controlPoints || [];
        const fts = e.fitPoints || [];
        const src = fts.length > 1 ? fts : cps;
        if (src.length > 1) {
          const pts = catmullRom(src, 8).map((p) => tr(transform, p.x, p.y));
          out.push({ kind: 'polyline', points: pts, closed: false });
        }
        break;
      }
      case 'TEXT':
      case 'MTEXT': {
        const pos = e.position || e.startPoint || {};
        const rot = e.rotation || 0;
        out.push({
          kind: 'text',
          x: e.position ? pos.x : pos.x,
          y: e.position ? pos.y : pos.y,
          text: e.text || '',
          height: e.textHeight || e.height || 2.5,
          rotation: rot
        });
        break;
      }
      case 'POINT': {
        const p = e.position || {};
        out.push({ kind: 'point', x: p.x, y: p.y });
        break;
      }
      case 'SOLID':
      case '3DFACE': {
        const pts = [];
        for (const p of e.vertices || e.points || []) {
          if (p && p.x != null) pts.push(tr(transform, p.x, p.y));
        }
        if (pts.length > 1) out.push({ kind: 'polyline', points: pts, closed: true });
        break;
      }
      default:
        break;
    }
  }
}

function tr(transform, x, y) {
  return applyTransform(transform, x, y);
}

function arcFromBulge(ax, ay, bx, by, bulge) {
  const theta = 4 * Math.atan(bulge);
  const dx = bx - ax;
  const dy = by - ay;
  const chord = Math.hypot(dx, dy);
  const pts = [];
  if (Math.abs(Math.sin(theta / 2)) < 1e-9) {
    pts.push({ x: ax, y: ay }, { x: bx, y: by });
    return pts;
  }
  const r = Math.abs(chord / (2 * Math.sin(theta / 2)));
  const sign = Math.sign(bulge) || 1;
  const perpX = -dy / chord;
  const perpY = dx / chord;
  const dist = r * Math.cos(theta / 2);
  const cx = (ax + bx) / 2 + perpX * dist * sign;
  const cy = (ay + by) / 2 + perpY * dist * sign;
  const a0 = Math.atan2(ay - cy, ax - cx);
  const steps = Math.max(4, Math.ceil(Math.abs(theta) / (Math.PI / 16)));
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (theta * i) / steps;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

function catmullRom(pts, stepsPer) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    for (let s = 0; s < stepsPer; s++) {
      const t = s / stepsPer;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
      });
    }
  }
  out.push({ ...pts[pts.length - 1] });
  return out;
}

export function computeBounds(primitives) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let any = false;
  for (const p of primitives) {
    if (p.kind === 'polyline') {
      for (const pt of p.points) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
        any = true;
      }
    } else if (p.kind === 'point') {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
      any = true;
    } else if (p.kind === 'text') {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
      any = true;
    } else if (p.kind === 'circle') {
      if (p.cx - p.r < minX) minX = p.cx - p.r;
      if (p.cy - p.r < minY) minY = p.cy - p.r;
      if (p.cx + p.r > maxX) maxX = p.cx + p.r;
      if (p.cy + p.r > maxY) maxY = p.cy + p.r;
      any = true;
    }
  }
  if (!any) return { minX: 0, minY: 0, maxX: 1, maxY: 1, cx: 0.5, cy: 0.5, w: 1, h: 1 };
  const w = maxX - minX;
  const h = maxY - minY;
  return { minX, minY, maxX, maxY, w: w || 1, h: h || 1, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}