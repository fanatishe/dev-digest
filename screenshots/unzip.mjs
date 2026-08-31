import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { dirname, join } from "node:path";

const buf = readFileSync(process.argv[2]);
const OUT = process.argv[3] ?? "extracted";

let eocd = buf.length - 22;
while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
if (eocd < 0) throw new Error("no EOCD");
const cdCount = buf.readUInt16LE(eocd + 10);
let off = buf.readUInt32LE(eocd + 16);

const names = [];
for (let i = 0; i < cdCount; i++) {
  if (buf.readUInt32LE(off) !== 0x02014b50) break;
  const method = buf.readUInt16LE(off + 10);
  const compSize = buf.readUInt32LE(off + 20);
  const nameLen = buf.readUInt16LE(off + 28);
  const extraLen = buf.readUInt16LE(off + 30);
  const commentLen = buf.readUInt16LE(off + 32);
  const localOff = buf.readUInt32LE(off + 42);
  const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
  off += 46 + nameLen + extraLen + commentLen;
  const lhNameLen = buf.readUInt16LE(localOff + 26);
  const lhExtraLen = buf.readUInt16LE(localOff + 28);
  const dataStart = localOff + 30 + lhNameLen + lhExtraLen;
  const comp = buf.subarray(dataStart, dataStart + compSize);
  const data = method === 0 ? comp : inflateRawSync(comp);
  const dest = join(OUT, name);
  if (name.endsWith("/")) { mkdirSync(dest, { recursive: true }); continue; }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, data);
  names.push(name);
}
console.log(names.join("\n"));
