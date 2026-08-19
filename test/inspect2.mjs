import fs from 'node:fs';
import DxfParser from 'dxf-parser';

const text = fs.readFileSync(new URL('./block.dxf', import.meta.url), 'latin1');
const dxf = new DxfParser().parseSync(text);
console.log('INSUNITS:', dxf.header?.$INSUNITS);
console.log('blocks keys:', Object.keys(dxf.blocks || {}));
for (const name of Object.keys(dxf.blocks || {})) {
  const blk = dxf.blocks[name];
  console.log('block', name, 'keys:', Object.keys(blk).join(','));
  const ents = blk.entities || blk.entity || [];
  console.log('  entities:', Array.isArray(ents) ? ents.length : typeof ents);
  for (const e of Array.isArray(ents) ? ents : []) {
    console.log('   ', e.type, JSON.stringify(e).slice(0, 200));
  }
}