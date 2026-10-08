// Outil maison : cherche des fichiers par nom dans les MIX (récursif sur les MIX imbriqués).
import { readFileSync } from "fs";
import { DataStream } from "@/data/DataStream";
import { MixFile } from "@/data/MixFile";
const origLog = console.log; console.log = () => {};
const [mixPath, ...names] = process.argv.slice(2);
const buf = readFileSync(mixPath);
const root = new MixFile(new DataStream(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
const subs = ["local.mix","cache.mix","maps01.mix","maps02.mix","conquer.mix","generic.mix","isotemp.mix","isosnow.mix","isourb.mix","temperat.mix","snow.mix","urban.mix","sounds.mix","audio.mix","cameo.mix","theme.mix","neutral.mix","mapsmd03.mix","localmd.mix","cachemd.mix","movies01.mix","movies02.mix","movmd03.mix","missions.mix","mission.mix"];
const out: string[] = [];
function scan(mix: any, path: string) {
  for (const n of names) if (mix.containsFile(n)) out.push(`${path} -> ${n}`);
  for (const s of subs) if (mix.containsFile(s)) { try { const f = mix.openFile(s); scan(new MixFile(f.stream), path + "/" + s); } catch (e) { out.push(`${path}/${s} ERR ${e}`); } }
}
scan(root, mixPath.split("/").pop()!);
console.log = origLog; console.log(out.join("\n"));
