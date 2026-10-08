// Mode mission (campagne solo) : lecture des « maisons » déclarées par une carte de mission.
// Une carte de campagne ne passe pas par le salon d'escarmouche : ce sont ses sections
// [Houses] / [<Nom> House] qui disent qui existe, qui est humain, qui est allié de qui.
import { GameOpts } from "@/game/gameopts/GameOpts";

export interface ScenarioHouse {
    /** Nom de la maison tel qu'utilisé comme propriétaire des objets (« BadGuy1 House »). */
    houseName: string;
    /** Pays de la maison (« BadGuy1 »), nom utilisé par les déclencheurs. */
    countryName: string;
    credits: number;
    techLevel: number;
    iq: number;
    edge: string;
    playerControl: boolean;
    colorName: string;
    allies: string[];
}

export interface ScenarioInfo {
    mapName: string;
    /** Difficulté choisie : 0 = facile, 1 = normal, 2 = difficile (filtre des déclencheurs). */
    difficulty: number;
}

/** Les options de partie d'une mission portent ce champ en plus. */
export function getScenario(gameOpts: any): ScenarioInfo | undefined {
    return gameOpts?.scenario;
}

export function isScenario(gameOpts: any): boolean {
    return !!gameOpts?.scenario;
}

export function readScenarioHouses(mapIni: any): ScenarioHouse[] {
    const list = mapIni.getSection("Houses");
    if (!list) {
        return [];
    }
    const houses: ScenarioHouse[] = [];
    list.entries.forEach((houseName: any) => {
        if (typeof houseName !== "string") {
            return;
        }
        const s = mapIni.getSection(houseName);
        if (!s) {
            return;
        }
        houses.push({
            houseName,
            countryName: s.getString("Country"),
            // Dans les cartes, Credits est exprimé en centaines.
            credits: s.getNumber("Credits") * 100,
            techLevel: s.getNumber("TechLevel"),
            iq: s.getNumber("IQ"),
            edge: s.getString("Edge", "North"),
            playerControl: s.getBool("PlayerControl"),
            colorName: s.getString("Color", "LightGrey"),
            allies: s.getArray("Allies"),
        });
    });
    return houses;
}

/** Options de partie minimales pour lancer une carte de mission sans salon. */
export function createScenarioGameOpts(mapName: string, playerName: string, difficulty = 1): GameOpts & { scenario: ScenarioInfo } {
    return {
        gameMode: 1,
        gameSpeed: 4,
        credits: 0,
        unitCount: 0,
        shortGame: false,
        superWeapons: true,
        buildOffAlly: false,
        mcvRepacks: true,
        cratesAppear: false,
        destroyableBridges: true,
        multiEngineer: false,
        noDogEngiKills: false,
        mapName,
        mapTitle: mapName,
        mapDigest: "",
        mapSizeBytes: 0,
        maxSlots: 1,
        mapOfficial: true,
        humanPlayers: [{ name: playerName, countryId: 0, colorId: 0, startPos: 0, teamId: -1 }],
        aiPlayers: [],
        scenario: { mapName, difficulty },
    };
}
