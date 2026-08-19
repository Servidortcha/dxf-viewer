import fs from 'node:fs';
import DxfParser from 'dxf-parser';

const text = fs.readFileSync(new URL('./sample.dxf', import.meta.url), 'latin1');
const parser = new DxfParser();
const dxf = parser.parseSync(text);

console.log('INSUNITS:', dxf?.header?.$INSUNITS?.value);
console.log('blocks keys:', Object.keys(dxf?.blocks || {}));

for (const b of Object.keys(dxf?.blocks || {})) {
  const blk = dxf.blocks[b];
  console.log('block', b, Object.keys(blk));
  for (const k of Object.keys(blk)) {
    const val = blk[k];
    if (Array.isArray(val)) console.log('  ', k, val.length, JSON.stringify(val[0])?.slice(0, 120));
    else console.log('  ', k, typeof val, JSON.stringify(val)?.slice(0, 80));
  }
}

console.log('entities count:', dxf.entities.length);
for (const e of dxf.entities) {
  console.log('---', e.type, JSON.stringify(e).slice(0, 400));
}

// try requiring default import flavor too
const mod = await import('dxf-parser');
console.log('module keys:', Object.keys(mod));