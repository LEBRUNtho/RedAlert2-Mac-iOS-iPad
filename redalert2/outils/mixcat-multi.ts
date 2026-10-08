// Extrait une liste de fichiers d'un ou plusieurs MIX vers un dossier (ceux qui existent).
import { readFileSync, writeFileSync } from "fs";
import { DataStream } from "@/data/DataStream";
import { MixFile } from "@/data/MixFile";
const origLog = console.log; console.log = () => {};
const [outDir, listFile, ...mixes] = process.argv.slice(2);
const names = readFileSync(listFile, "utf8").split(/\s+/).filter(Boolean);
const opened = mixes.map((p) => { const b = readFileSync(p); return new MixFile(new DataStream(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))); });
let n = 0;
for (const name of names) {
  for (const mix of opened) {
    const f = name.includes(".") ? name : name + ".bik";
    if ((mix as any).containsFile(f)) {
      const s = (mix as any).openFile(f).stream;
      writeFileSync(`${outDir}/${f.toLowerCase()}`, new Uint8Array(s.buffer, s.byteOffset, s.byteLength)); n++; break;
    }
  }
}
console.log = origLog; console.log(`${n}/${names.length} extraits`);
