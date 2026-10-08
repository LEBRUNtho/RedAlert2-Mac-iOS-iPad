import { Engine } from '@/engine/Engine';
import { EngineType } from '@/engine/EngineType';
// Lecture des vidéos de campagne (briefings, cinématiques, vidéos « radar » en cours de mission).
// Les films sont des MP4 H.264 dans gameres/movies/ (convertis depuis les .bik du jeu par
// scripts/prepare-gameres.ts). Le shell iOS ne gère pas les requêtes partielles (Range) : on charge
// donc le fichier entier puis on le lit depuis une URL blob, ce qui fonctionne partout.

export type MovieMode = "full" | "radar";

let current: { overlay: HTMLElement; finish: () => void } | undefined;

async function loadMovieUrl(name: string): Promise<string | undefined> {
    try {
        // Les films de Yuri's Revenge (movmd03.mix) portent les mêmes noms que ceux de RA2 : dossier séparé.
        const dir = Engine.getActiveEngine() === EngineType.YurisRevenge ? "moviesmd" : "movies";
        const response = await fetch(`gameres/${dir}/${name.toLowerCase()}.mp4`);
        if (!response.ok) {
            return undefined;
        }
        return URL.createObjectURL(new Blob([await response.arrayBuffer()], { type: "video/mp4" }));
    }
    catch {
        return undefined;
    }
}

/** Joue un film. En plein écran, un toucher le passe. Résout quand le film est fini ou passé. */
export async function playMovie(name: string, mode: MovieMode = "full"): Promise<void> {
    const url = await loadMovieUrl(name);
    if (!url) {
        console.warn(`[Films] ${name} introuvable`);
        return;
    }
    current?.finish();
    return new Promise<void>((resolve) => {
        const overlay = document.createElement("div");
        const video = document.createElement("video");
        video.src = url;
        video.playsInline = true;
        video.setAttribute("playsinline", "");
        video.autoplay = true;
        if (mode === "full") {
            Object.assign(overlay.style, {
                position: "fixed", inset: "0", background: "#000", zIndex: "100000",
                display: "flex", alignItems: "center", justifyContent: "center",
            });
            Object.assign(video.style, { width: "100%", height: "100%", objectFit: "contain" });
        }
        else {
            // Vidéo « radar » : petite fenêtre en haut à droite, au-dessus de la barre latérale.
            Object.assign(overlay.style, {
                position: "fixed", top: "8px", right: "8px", width: "180px", height: "135px",
                background: "#000", border: "1px solid #8a1010", zIndex: "100000", pointerEvents: "auto",
            });
            Object.assign(video.style, { width: "100%", height: "100%", objectFit: "cover" });
        }
        overlay.appendChild(video);
        let done = false;
        const finish = () => {
            if (done) {
                return;
            }
            done = true;
            video.pause();
            overlay.remove();
            URL.revokeObjectURL(url);
            if (current?.overlay === overlay) {
                current = undefined;
            }
            resolve();
        };
        current = { overlay, finish };
        overlay.addEventListener("click", finish);
        overlay.addEventListener("touchend", (e) => {
            e.preventDefault();
            finish();
        });
        video.addEventListener("ended", finish);
        video.addEventListener("error", finish);
        document.body.appendChild(overlay);
        video.play().catch(() => {
            // Lecture refusée (navigateur sans geste utilisateur) : on retente sans le son.
            video.muted = true;
            video.play().catch(finish);
        });
    });
}
