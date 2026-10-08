// Outil maison : cherche des étiquettes dans un fichier CSF (textes du jeu).
import { readFileSync } from "fs";
import { DataStream } from "@/data/DataStream";
import { CsfFile } from "@/data/CsfFile";
import { VirtualFile } from "@/data/vfs/VirtualFile";
const [path, pattern] = process.argv.slice(2);
const buf = readFileSync(path);
const csf: any = new CsfFile(VirtualFile.fromBytes(buf, "x.csf"));
const re = new RegExp(pattern, "i");
const data: any = csf.data ?? csf.labels ?? csf;
const entries: [string, any][] = data instanceof Map ? [...data.entries()] : Object.entries(data);
for (const [k, v] of entries) if (re.test(k)) console.log(k, "=>", String(v).replace(/\n/g, " | ").slice(0, 400));
