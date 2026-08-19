import fs from "node:fs";
import { parseDxfText } from "../src/lib/dxf.js";
import { computeMeasurement, formatValue, formatAngle } from "../src/lib/measure.js";

const text = fs.readFileSync("./test/sample.dxf", "latin1");
const doc = parseDxfText(text);
console.log("units:", doc.units, "primitives:", doc.primitives.length);
console.log("bounds:", JSON.stringify(doc.bounds));
console.log("sample:", doc.primitives.filter((p) => p.kind === "polyline").slice(0, 4).map((p) => p.kind + ":" + p.points.length).join(", "));

const d = computeMeasurement("distance", [{ x: 0, y: 0 }, { x: 100, y: 50 }]);
d.label = formatValue(d.value, doc.units);
console.log("dist:", d.label);

const a = computeMeasurement("area", [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }]);
console.log("area:", formatValue(a.value, doc.units, "area"), "perim:", formatValue(a.perimeter, doc.units));

const ang = computeMeasurement("angle", [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 86.6 }]);
console.log("angle:", formatAngle(ang.value));

// block.dxf tests INSERT expansion
const text2 = fs.readFileSync("./test/block.dxf", "latin1");
const doc2 = parseDxfText(text2);
console.log("block-primitives:", doc2.primitives.length, "bounds:", JSON.stringify(doc2.bounds));