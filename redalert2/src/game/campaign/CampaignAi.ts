// IA des maisons ennemies en mission : « Production Begins » et « AI triggers begin ».
// Comme le jeu original, une maison IA choisit régulièrement un AITriggerType éligible
// (condition sur l'état du jeu, difficulté, poids), crée l'équipe correspondante, fait
// fabriquer les unités manquantes dans ses usines, puis l'équipe exécute son script.
import { ObjectType } from "@/engine/type/ObjectType";
import { GameSpeed } from "@/game/GameSpeed";
import { TeamManager } from "./teams/TeamManager";
import { QueueStatus } from "@/game/player/production/ProductionQueue";
import { NotifyPlaceBuilding } from "@/game/trait/interface/NotifyPlaceBuilding";
import { BuildingPlaceEvent } from "@/game/event/BuildingPlaceEvent";

const TPS = GameSpeed.BASE_TICKS_PER_SECOND;

export interface AiTriggerType {
    id: string;
    name: string;
    teamTypeId: string;
    /** Pays de la maison concernée, ou « <all> ». */
    houseName: string;
    techLevel: number;
    conditionType: number;
    conditionObject: string;
    comparatorValue: number;
    /** 0 '<' 1 '<=' 2 '==' 3 '>=' 4 '>' 5 '!=' */
    comparatorOp: number;
    weight: number;
    minWeight: number;
    maxWeight: number;
    forSkirmish: boolean;
    /** 0 tous, 1 Alliés, 2 Soviétiques */
    side: number;
    isBaseDefense: boolean;
    enabled: [boolean, boolean, boolean];
}

/** Bloc comparateur : 8 entiers 32 bits petit-boutistes en hexadécimal ; [0] valeur, [1] opérateur. */
function parseComparator(hex: string): { value: number; op: number } {
    const dword = (index: number) => {
        const chunk = hex.substring(index * 8, index * 8 + 8);
        if (chunk.length < 8) {
            return 0;
        }
        let result = 0;
        for (let byte = 3; byte >= 0; byte--) {
            result = result * 256 + parseInt(chunk.substring(byte * 2, byte * 2 + 2), 16);
        }
        return result;
    };
    return { value: dword(0), op: dword(1) };
}

function compare(actual: number, op: number, expected: number): boolean {
    switch (op) {
        case 0: return actual < expected;
        case 1: return actual <= expected;
        case 2: return actual === expected;
        case 3: return actual >= expected;
        case 4: return actual > expected;
        case 5: return actual !== expected;
        default: return false;
    }
}

function readAiTriggers(ini: any, global: boolean, enabledGlobal: Set<string>): AiTriggerType[] {
    const section = ini?.getSection("AITriggerTypes");
    const out: AiTriggerType[] = [];
    if (!section) {
        return out;
    }
    section.entries.forEach((raw: any, id: string) => {
        const f = String(Array.isArray(raw) ? raw.join(",") : raw).split(",").map((s) => s.trim());
        if (f.length < 18) {
            return;
        }
        if (global && !enabledGlobal.has(id)) {
            return;
        }
        const cmp = parseComparator(f[6] ?? "");
        out.push({
            id,
            name: f[0],
            teamTypeId: f[1],
            houseName: f[2],
            techLevel: Number(f[3]) || 0,
            conditionType: Number(f[4]),
            conditionObject: f[5],
            comparatorValue: cmp.value,
            comparatorOp: cmp.op,
            weight: parseFloat(f[7]) || 0,
            minWeight: parseFloat(f[8]) || 0,
            maxWeight: parseFloat(f[9]) || 100,
            forSkirmish: f[10] === "1",
            side: Number(f[12]) || 0,
            isBaseDefense: f[13] === "1",
            enabled: [f[15] === "1", f[16] === "1", f[17] === "1"],
        });
    });
    return out;
}

interface BaseNode {
    name: string;
    x: number;
    y: number;
}

interface HouseAi {
    production: boolean;
    aiTriggers: boolean;
    nextThink: number;
    nodes?: BaseNode[];
    /** Nœud en cours de reconstruction (bâtiment dans la file du chantier). */
    pendingNode?: BaseNode;
    /** Nœuds dont l'emplacement était occupé : pas de nouvel essai avant ce tick. */
    blockedUntil?: Map<BaseNode, number>;
    nextBaseCheck: number;
}

/** Délai entre deux nouvelles équipes d'une maison, selon la difficulté (facile, normal, difficile). */
const TEAM_DELAY_TICKS = [150 * TPS, 100 * TPS, 60 * TPS];
/** Équipes IA simultanées en formation ou en action par maison. */
const MAX_AI_TEAMS = [2, 3, 4];

export class CampaignAi {
    private triggers: AiTriggerType[];
    private houses = new Map<any, HouseAi>();

    constructor(private mapIni: any, globalAiIni: any, private teams: TeamManager, private difficulty: number) {
        const enabledGlobal = new Set<string>();
        mapIni.getSection("AITriggerTypesEnable")?.entries.forEach((value: any, key: string) => {
            if (String(value).toLowerCase().startsWith("y")) {
                enabledGlobal.add(key.replace(/-G$/i, ""));
            }
        });
        const ignoreGlobal = mapIni.getSection("Basic")?.getBool("IgnoreGlobalAITriggers") ?? true;
        this.triggers = [
            ...readAiTriggers(mapIni, false, enabledGlobal),
            ...(ignoreGlobal ? [] : readAiTriggers(globalAiIni, true, enabledGlobal).filter((t) => !t.forSkirmish)),
        ];
    }

    private state(house: any): HouseAi {
        let s = this.houses.get(house);
        if (!s) {
            s = { production: false, aiTriggers: false, nextThink: 0, nextBaseCheck: 0 };
            this.houses.set(house, s);
        }
        return s;
    }

    startProduction(game: any, house: any): void {
        const s = this.state(house);
        s.production = true;
        // « Production Begins » démarre aussi les déclencheurs IA de la maison, comme l'original.
        s.aiTriggers = true;
        s.nextThink = Math.min(s.nextThink || Infinity, game.currentTick + 20 * TPS);
        console.info(`[Campagne] IA : production lancée pour ${house.country?.name}`);
    }

    setAiTriggers(game: any, house: any, enabled: boolean): void {
        const s = this.state(house);
        s.aiTriggers = enabled;
        if (enabled && !s.nextThink) {
            s.nextThink = game.currentTick + 20 * TPS;
        }
    }

    update(game: any): void {
        if (game.currentTick % TPS !== 0) {
            return;
        }
        for (const [house, s] of this.houses) {
            if (!house.defeated && s.production && game.currentTick >= s.nextBaseCheck) {
                s.nextBaseCheck = game.currentTick + 5 * TPS;
                this.rebuildBase(game, house, s);
            }
            if (house.defeated || !s.aiTriggers || game.currentTick < s.nextThink) {
                continue;
            }
            s.nextThink = game.currentTick + (TEAM_DELAY_TICKS[this.difficulty] ?? TEAM_DELAY_TICKS[1]);
            this.think(game, house, s);
        }
    }

    private think(game: any, house: any, s: HouseAi): void {
        const active = this.teams.getActiveTeams().filter((t) => t.owner === house && t.fromAi).length;
        if (active >= (MAX_AI_TEAMS[this.difficulty] ?? 3)) {
            return;
        }
        const eligible = this.triggers.filter((t) => this.isEligible(game, house, t));
        if (!eligible.length) {
            return;
        }
        const weights = eligible.map((t) => Math.max(1, Math.round(t.weight * 10)));
        const total = weights.reduce((a, b) => a + b, 0);
        let roll = game.generateRandomInt(0, total - 1);
        let picked = eligible[eligible.length - 1];
        for (let i = 0; i < eligible.length; i++) {
            roll -= weights[i];
            if (roll < 0) {
                picked = eligible[i];
                break;
            }
        }
        const team = this.teams.createAiTeam(game, picked.teamTypeId, house);
        if (!team) {
            return;
        }
        console.info(`[Campagne] IA ${house.country?.name} : équipe « ${picked.name} »`);
        if (s.production) {
            this.produceMissing(game, house, team);
        }
    }

    private isEligible(game: any, house: any, t: AiTriggerType): boolean {
        if (t.houseName !== "<all>" && t.houseName !== house.country?.name) {
            return false;
        }
        if (!t.enabled[this.difficulty]) {
            return false;
        }
        if (t.weight <= 0) {
            return false;
        }
        const type = this.teams.getTeamType(t.teamTypeId);
        if (!type) {
            return false;
        }
        if (this.teams.getActiveTeams(t.teamTypeId).length >= Math.max(1, type.max)) {
            return false;
        }
        return this.evaluateCondition(game, house, t);
    }

    private countOwned(players: any[], name: string): number {
        let n = 0;
        for (const p of players) {
            for (const o of p.getOwnedObjects()) {
                if (o.name === name && !o.isDestroyed) {
                    n++;
                }
            }
        }
        return n;
    }

    private evaluateCondition(game: any, house: any, t: AiTriggerType): boolean {
        const enemies = game.getCombatants().filter((p: any) => p !== house && !p.defeated && !game.alliances.areAllied(p, house));
        switch (t.conditionType) {
            case -1:
                return true;
            case 0:
                return compare(this.countOwned(enemies, t.conditionObject), t.comparatorOp, t.comparatorValue);
            case 1:
                return compare(this.countOwned([house], t.conditionObject), t.comparatorOp, t.comparatorValue);
            case 2:
            case 3: {
                const factor = t.conditionType === 2 ? 1 : 0.5;
                return enemies.some((e: any) => e.powerTrait && e.powerTrait.power < e.powerTrait.drain * factor);
            }
            case 4:
                return enemies.some((e: any) => compare(e.credits, t.comparatorOp, t.comparatorValue));
            case 7: {
                const neutrals = game.getAllPlayers().filter((p: any) => p.isNeutral);
                return compare(this.countOwned(neutrals, t.conditionObject), t.comparatorOp, t.comparatorValue);
            }
            default:
                return false;
        }
    }

    /** Nœuds de base de la maison ([<Nom> House] 000=TYPE,x,y…) : ce que l'IA reconstruit. */
    private readNodes(house: any): BaseNode[] {
        const section = this.mapIni.getSection(house.scenarioHouse?.houseName ?? "");
        const nodes: BaseNode[] = [];
        const count = section?.getNumber("NodeCount") ?? 0;
        for (let i = 0; i < count; i++) {
            const raw = section.getString(String(i).padStart(3, "0"));
            const [name, x, y] = raw.split(",");
            if (name && x !== undefined && y !== undefined) {
                nodes.push({ name: name.trim(), x: Number(x), y: Number(y) });
            }
        }
        return nodes;
    }

    /** Reconstruction de la base : un bâtiment manquant à la fois, fabriqué puis posé à sa place d'origine. */
    private rebuildBase(game: any, house: any, s: HouseAi): void {
        s.nodes ??= this.readNodes(house);
        if (!s.nodes.length || !house.production) {
            return;
        }
        const buildings = house.getOwnedObjectsByType(ObjectType.Building);
        const exists = (n: BaseNode) => buildings.some((b: any) => b.name === n.name && Math.abs(b.tile.rx - n.x) <= 1 && Math.abs(b.tile.ry - n.y) <= 1);
        if (s.pendingNode) {
            const rules = game.rules.getObject(s.pendingNode.name, ObjectType.Building);
            const queue = house.production.getQueueForObject(rules);
            if (exists(s.pendingNode)) {
                s.pendingNode = undefined;
            }
            else if (queue.status === QueueStatus.Ready && queue.getFirst()?.rules === rules) {
                if (!this.placeBuilding(game, house, rules, s.pendingNode, queue)) {
                    s.blockedUntil?.set(s.pendingNode, game.currentTick + 120 * TPS);
                }
                s.pendingNode = undefined;
            }
            else if (!queue.getAll().length) {
                s.pendingNode = undefined;
            }
            return;
        }
        s.blockedUntil ??= new Map();
        for (const node of s.nodes) {
            if (exists(node) || !game.rules.hasObject(node.name, ObjectType.Building) ||
                game.currentTick < (s.blockedUntil.get(node) ?? 0)) {
                continue;
            }
            const rules = game.rules.getObject(node.name, ObjectType.Building);
            // Un nœud trop cher ou sans chantier adéquat ne bloque pas la reconstruction des suivants.
            if (!house.production.hasFactoryFor(rules) || house.credits < rules.cost) {
                continue;
            }
            const tile = game.map.tiles.getByMapCoords(node.x, node.y);
            if (!tile || !game.getConstructionWorker(house).canPlaceAt(rules.name, tile, { normalizedTile: true })) {
                s.blockedUntil.set(node, game.currentTick + 120 * TPS);
                continue;
            }
            const queue = house.production.getQueueForObject(rules);
            if (queue.getAll().length) {
                return;
            }
            queue.push(rules, 1, rules.cost);
            s.pendingNode = node;
            return;
        }
    }

    private placeBuilding(game: any, house: any, rules: any, node: BaseNode, queue: any): boolean {
        const tile = game.map.tiles.getByMapCoords(node.x, node.y);
        const worker = game.getConstructionWorker(house);
        if (!tile || !worker.canPlaceAt(rules.name, tile, { normalizedTile: true })) {
            // Emplacement occupé : on rend l'argent et on réessaiera plus tard.
            const spent = queue.getFirst()?.creditsSpent ?? 0;
            queue.pop(rules, 1);
            house.credits += spent;
            return false;
        }
        const placed = worker.placeAt(rules.name, tile, true);
        house.addUnitsBuilt(rules, 1);
        queue.shift(rules, 1);
        const building = placed[0];
        if (building) {
            game.traits.filter(NotifyPlaceBuilding).forEach((trait: any) => trait[NotifyPlaceBuilding.onPlace](building, game));
            game.events.dispatch(new BuildingPlaceEvent(building));
        }
        return true;
    }

    /** Met en fabrication les unités qui manquent à l'équipe, dans les usines de la maison. */
    private produceMissing(game: any, house: any, team: any): void {
        const production = house.production;
        if (!production) {
            return;
        }
        for (const [typeName, count] of this.teams.getMissingUnits(team)) {
            let rules: any;
            for (const type of [ObjectType.Infantry, ObjectType.Vehicle, ObjectType.Aircraft]) {
                if (game.rules.hasObject(typeName, type)) {
                    rules = game.rules.getObject(typeName, type);
                    break;
                }
            }
            if (!rules || !production.hasFactoryFor(rules)) {
                continue;
            }
            const queue = production.getQueueForObject(rules);
            const room = Math.max(0, queue.maxSize - queue.currentSize);
            const quantity = Math.min(count, room, queue.maxItemQuantity);
            if (quantity > 0) {
                queue.push(rules, quantity, rules.cost);
            }
        }
    }
}
