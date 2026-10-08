// Campagnes de Red Alert 2 (ordre de ra2.mix/local.mix/mapsel.ini) et progression enregistrée sur l'appareil.

export type CampaignSide = "allied" | "soviet";

export interface CampaignMission {
    /** Carte de mission (dans maps01/02.mix). */
    map: string;
    /** Clé de texte : NAME:<key> pour le nom, BRIEF:<key> pour le briefing. */
    key: string;
}

/** Campagnes de Red Alert 2 (app « Red Alert 2 »). */
export const RA2_CAMPAIGNS: Record<CampaignSide, CampaignMission[]> = {
    allied: ["all01t", "all02s", "all03u", "all04u", "all05s", "all06u", "all07t", "all08u", "all09t", "all10s", "all11t", "all12s"]
        .map((m, i) => ({ map: `${m}.map`, key: `ALL${String(i + 1).padStart(2, "0")}` })),
    soviet: ["sov01t", "sov02t", "sov03u", "sov04s", "sov05u", "sov06t", "sov07s", "sov08u", "sov09u", "sov10t", "sov11s", "sov12s"]
        .map((m, i) => ({ map: `${m}.map`, key: `SOV${String(i + 1).padStart(2, "0")}` })),
};

/** Campagnes de Yuri's Revenge (ra2md.mix/localmd.mix/battlemd.ini, cartes dans mapsmd03.mix). */
export const YR_CAMPAIGNS: Record<CampaignSide, CampaignMission[]> = {
    allied: ["all01umd", "all02umd", "all03umd", "all04dmd", "all05umd", "all06umd", "all07smd"]
        .map((m, i) => ({ map: `${m}.map`, key: `ALL${String(i + 1).padStart(2, "0")}MD` })),
    soviet: ["sov01umd", "sov02smd", "sov03umd", "sov04dmd", "sov05umd", "sov06lmd", "sov07tmd"]
        .map((m, i) => ({ map: `${m}.map`, key: `SOV${String(i + 1).padStart(2, "0")}MD` })),
};

/** Campagne du jeu actif : RA2 dans l'app Red Alert 2, Yuri's Revenge dans l'app Yuri. */
export let CAMPAIGNS: Record<CampaignSide, CampaignMission[]> = RA2_CAMPAIGNS;
export function useCampaigns(yuri: boolean): void {
    CAMPAIGNS = yuri ? YR_CAMPAIGNS : RA2_CAMPAIGNS;
    storageKey = yuri ? "ra2.campagne.progression.yr" : "ra2.campagne.progression";
}

export const DIFFICULTY_LABELS = ["Easy", "Normal", "Hard"];

let storageKey = "ra2.campagne.progression";

interface Progress {
    /** Nombre de missions gagnées par campagne (la suivante est débloquée). */
    won: Record<CampaignSide, number>;
    difficulty: number;
    side: CampaignSide;
}

export function loadProgress(): Progress {
    const fallback: Progress = { won: { allied: 0, soviet: 0 }, difficulty: 1, side: "allied" };
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) {
            return fallback;
        }
        const p = JSON.parse(raw);
        return {
            won: { allied: Number(p?.won?.allied) || 0, soviet: Number(p?.won?.soviet) || 0 },
            difficulty: [0, 1, 2].includes(p?.difficulty) ? p.difficulty : 1,
            side: p?.side === "soviet" ? "soviet" : "allied",
        };
    }
    catch {
        return fallback;
    }
}

export function saveProgress(progress: Progress): void {
    try {
        localStorage.setItem(storageKey, JSON.stringify(progress));
    }
    catch {
        // Stockage indisponible : la progression ne sera simplement pas retenue.
    }
}

/** Appelé à la victoire d'une mission : débloque la suivante de la même campagne. */
export function markMissionWon(mapName: string, yuri: boolean): void {
    // La campagne active dépend du jeu, pas du dernier écran ouvert (lancement direct, « Load Game »…).
    useCampaigns(yuri);
    const lower = mapName.toLowerCase();
    const progress = loadProgress();
    for (const side of ["allied", "soviet"] as CampaignSide[]) {
        const index = CAMPAIGNS[side].findIndex((m) => m.map === lower);
        if (index >= 0 && progress.won[side] < index + 1) {
            progress.won[side] = index + 1;
            saveProgress(progress);
        }
    }
}
