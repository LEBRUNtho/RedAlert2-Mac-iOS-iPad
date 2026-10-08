// Outil maison : extrait un fichier d'un MIX, chemin type "local.mix/battle.ini" (MIX imbriqués séparés par /).
import { readFileSync, writeFileSync } from "fs";
import { DataStream } from "@/data/DataStream";
import { MixFile } from "@/data/MixFile";
const origLog = console.log; console.log = () => {};
const [mixPath, inner, outPath] = process.argv.slice(2);
const buf = readFileSync(mixPath);
let mix: any = new MixFile(new DataStream(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
const parts = inner.split("/");
for (let i = 0; i < parts.length - 1; i++) mix = new MixFile(mix.openFile(parts[i]).stream);
const f = mix.openFile(parts[parts.length - 1]);
const s = f.stream; const bytes = new Uint8Array(s.buffer, s.byteOffset, s.byteLength);
console.log = origLog;
if (outPath) writeFileSync(outPath, bytes); else process.stdout.write(Buffer.from(bytes));
