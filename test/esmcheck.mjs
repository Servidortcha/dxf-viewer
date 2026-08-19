import DxfParser from "dxf-parser";
import fs from "node:fs";
const text = fs.readFileSync("./test/sample.dxf", "latin1");
const dxf = new DxfParser().parseSync(text);
console.log("entities:", dxf.entities.length);
console.log("OK");
