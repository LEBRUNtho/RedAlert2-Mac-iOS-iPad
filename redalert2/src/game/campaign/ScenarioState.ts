// État propre à une mission en cours : équipes scriptées, verrou des commandes, issue de la partie,
// demandes de caméra. Créé par GameFactory pour les cartes de campagne, mis à jour à chaque pas.
import { TeamManager } from "./teams/TeamManager";
import { CampaignAi } from "./CampaignAi";

export type ScenarioResult = "win" | "lose";

export class ScenarioState {
    readonly teams: TeamManager;
    readonly ai: CampaignAi;
    /** « Lock input » : le joueur regarde une cinématique scriptée. */
    inputLocked = false;
    result?: ScenarioResult;
    /** Point de passage où la caméra démarre ([Basic] HomeCell). */
    readonly homeCell?: number;
    /** Maison du joueur humain ([Basic] Player=), fixée à la création : la simulation ne lit jamais l'interface. */
    humanPlayer?: any;

    /** Le joueur humain et les maisons qu'il commande (PlayerControl=yes). */
    isHumanSide(player: any): boolean {
        return !!player && !!this.humanPlayer && (player === this.humanPlayer || player.controlledBy === this.humanPlayer);
    }
    /** Onglet de barre latérale demandé par la mission (0-3). */
    sidebarTab?: number;

    constructor(mapIni: any, globalAiIni: any, difficulty: number) {
        this.teams = new TeamManager(mapIni, globalAiIni);
        this.ai = new CampaignAi(mapIni, globalAiIni, this.teams, Math.min(2, Math.max(0, difficulty)));
        const home = mapIni.getSection("Basic")?.getString("HomeCell");
        this.homeCell = home !== undefined && home !== "" ? Number(home) : undefined;
    }

    private initialMissions: [any, string][] = [];

    noteInitialMission(obj: any, mission: string): void {
        if (obj.isUnit?.()) {
            this.initialMissions.push([obj, mission]);
        }
    }

    update(game: any): void {
        if (this.initialMissions.length) {
            // Premier pas de jeu : les unités posées sur la carte prennent leur mission d'origine.
            this.teams.applyInitialMissions(game, this.initialMissions);
            this.initialMissions = [];
        }
        try {
            this.ai.update(game);
        }
        catch (error) {
            console.error("[Campagne] erreur IA", error);
        }
        try {
            this.teams.update(game);
        }
        catch (error) {
            console.error("[Campagne] erreur équipes", error);
        }
    }

    /** Fin de mission décidée par un script : « Winner is » / « Loser is ». */
    finish(game: any, result: ScenarioResult): void {
        if (this.result) {
            return;
        }
        this.result = result;
        console.info(`[Campagne] fin de mission : ${result === "win" ? "victoire" : "défaite"}`);
        const human = this.humanPlayer ?? game.localPlayer;
        if (result === "lose" && human) {
            human.defeated = true;
        }
        // Après le pas en cours : les actions restantes du même déclencheur s'exécutent normalement.
        game.afterTick(() => game.end());
    }
}
