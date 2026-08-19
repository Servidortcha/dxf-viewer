import { UNIT_LABELS } from './dxf.js';

export const TOOLS = {
  pan: { id: 'pan', label: 'Navegar', icon: 'move' },
  distance: { id: 'distance', label: 'Distancia', icon: 'ruler' },
  length: { id: 'length', label: 'Longitud', icon: 'polyline' },
  area: { id: 'area', label: 'Área', icon: 'shapes' },
  angle: { id: 'angle', label: 'Ángulo', icon: 'angle' }
};

export function computeMeasurement(type, points) {
  if (type === 'distance') {
    if (points.length < 2) return null;
    return { type, points: [points[0], points[points.length - 1]], value: dist(points[0], points[1]) };
  }
  if (type === 'length') {
    if (points.length < 2) return null;
    const total = polylineLength(points);
    return { type, points, value: total };
  }
  if (type === 'area') {
    if (points.length < 3) return null;
    const vn = [...points, points[0]];
    const area = shoelace(vn);
    return { type, points, value: Math.abs(area), perimeter: polylineLength(vn) };
  }
  if (type === 'angle') {
    if (points.length < 3) return null;
    const [a, b, c] = points;
    const ang = angleBetween(a, b, c);
    return { type, points, value: ang };
  }
  return null;
}

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function polylineLength(pts) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  return total;
}

function shoelace(pts) {
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    s += pts[i].x * pts[i + 1].y - pts[i + 1].x * pts[i].y;
  }
  return s / 2;
}

function angleBetween(vertex, a, b) {
  const v1x = a.x - vertex.x;
  const v1y = a.y - vertex.y;
  const v2x = b.x - vertex.x;
  const v2y = b.y - vertex.y;
  let ang = Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y);
  ang = Math.abs(ang * 180 / Math.PI);
  if (ang > 180) ang = 360 - ang;
  return ang;
}

export function formatValue(value, units, type = 'length') {
  const u = UNIT_LABELS[units] || '';
  const v = Math.abs(value);
  let decimals;
  if (units === 4) decimals = 2;       // mm
  else if (units === 5) decimals = 2;  // cm
  else if (units === 6) decimals = 3;  // m
  else if (units === 7) decimals = 4;  // km
  else if (units === 2) decimals = 2;  // ft
  else if (units === 1) decimals = 3;  // in
  else decimals = 2;
  let s = v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
  if (type === 'area') {
    const su = u ? u + '\u00B2' : '';
    if (units === 5) return s + ' cm\u00B2';
    if (units === 4) return s + ' mm\u00B2';
    if (units === 6) return s + ' m\u00B2';
    return s + ' ' + (su || '');
  }
  return s + (u ? ' ' + u : '');
}

export function formatAngle(value) {
  return value.toFixed(2).replace(/\.00$/, '') + '°';
}

export function snapPoint(world, primitives, radius, scale) {
  let best = null;
  let bestD = radius / (scale || 1);
  for (const p of primitives) {
    if (p.kind === 'polyline') {
      for (const pt of p.points) {
        const d = Math.hypot(pt.x - world.x, pt.y - world.y);
        if (d < bestD) {
          bestD = d;
          best = pt;
        }
      }
    }
  }
  return best || world;
}