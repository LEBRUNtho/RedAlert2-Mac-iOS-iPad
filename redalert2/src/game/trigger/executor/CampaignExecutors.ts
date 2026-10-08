// Actions de déclencheurs propres aux missions (campagne solo).
import { TriggerExecutor } from "@/game/trigger/TriggerExecutor";
import { ScenarioCameraCenterEvent } from "@/game/event/ScenarioCameraCenterEvent";
import { ScenarioMovieEvent } from "@/game/event/ScenarioMovieEvent";
import { EventType } from "@/game/event/EventType";
import { ObjectType } from "@/engine/type/ObjectType";

function scenario(game: any) {
    return game.scenarioState;
}

/** Maison désignée par un paramètre (index dans [Countries], ou pays par nom). */
function findHouse(game: any, param: string): any {
    return game.getAllPlayers().find((p: any) => p.country && (String(p.country.id) === String(param) || p.country.name === param));
}

/** 1 « Winner is » / 2 « Loser is » : la partie s'arrête immédiatement. */
export class WinLoseExecutor extends TriggerExecutor {
    constructor(action: any, trigger: any, private winner: boolean) {
        super(action, trigger);
    }
    execute(game: any): void {
        const state = scenario(game);
        if (!state) {
            return;
        }
        const house = findHouse(game, this.action.params[1]);
        const human = state.humanPlayer;
        const humanSide = !house || state.isHumanSide(house) || (!!human && game.alliances.areAllied(house, human));
        console.info(`[Campagne] « ${this.trigger.name} » : ${this.winner ? "vainqueur" : "perdant"} = ${house?.country?.name ?? this.action.params[1]}`);
        // Victoire si notre camp est déclaré vainqueur, ou si un camp ennemi (non neutre) est déclaré perdant.
        const win = this.winner ? humanSide : (!humanSide && !!house && !house.isNeutral);
        state.finish(game, win ? "win" : "lose");
    }
}

/** 4 « Create Team » */
export class CreateTeamExecutor extends TriggerExecutor {
    execute(game: any): void {
        scenario(game)?.teams.createTeam(game, this.action.params[1]);
    }
}

/** 5 « Destroy Team » */
export class DestroyTeamExecutor extends TriggerExecutor {
    execute(game: any): void {
        scenario(game)?.teams.destroyTeam(this.action.params[1]);
    }
}

/** 7 « Reinforcement (team) » et 80 « Reinforcement (team) [at waypoint] » */
export class ReinforcementExecutor extends TriggerExecutor {
    constructor(action: any, trigger: any, private atWaypoint: boolean) {
        super(action, trigger);
    }
    execute(game: any): void {
        const waypoint = this.atWaypoint ? Number(this.action.params[6]) : undefined;
        scenario(game)?.teams.reinforce(game, this.action.params[1], waypoint);
    }
}

/** 46 / 47 « Lock / Unlock input » */
export class LockInputExecutor extends TriggerExecutor {
    constructor(action: any, trigger: any, private locked: boolean) {
        super(action, trigger);
    }
    execute(game: any): void {
        const state = scenario(game);
        if (state) {
            state.inputLocked = this.locked;
        }
    }
}

/** 48 « Center Camera at Waypoint » */
export class CenterCameraExecutor extends TriggerExecutor {
    execute(game: any): void {
        const tile = game.map.getTileAtWaypoint(Number(this.action.params[6]));
        if (tile) {
            game.events.dispatch(new ScenarioCameraCenterEvent(tile));
        }
    }
}

/** 114 « Set Tab to » */
export class SetSidebarTabExecutor extends TriggerExecutor {
    execute(game: any): void {
        const state = scenario(game);
        if (state) {
            state.sidebarTab = Number(this.action.params[1]);
            game.events.dispatch({ type: EventType.ScenarioSidebarTab, tab: state.sidebarTab });
        }
    }
}

/** 6 « All to Hunt » : toutes les unités de la maison partent à la chasse. */
export class AllToHuntExecutor extends TriggerExecutor {
    execute(game: any): void {
        const house = findHouse(game, this.action.params[1]);
        if (house) {
            scenario(game)?.teams.allToHunt(game, house);
        }
    }
}

/** 37 « Make ally » / 38 « Make enemy » : la maison du déclencheur change d'attitude envers une autre. */
export class SetAllianceExecutor extends TriggerExecutor {
    constructor(action: any, trigger: any, private ally: boolean) {
        super(action, trigger);
    }
    execute(game: any): void {
        const self = game.getAllPlayers().find((p: any) => p.country?.name === this.trigger.houseName);
        const other = findHouse(game, this.action.params[1]);
        if (!self || !other || self === other || self.isNeutral || other.isNeutral) {
            return;
        }
        const allied = game.alliances.areAllied(self, other);
        if (this.ally && !allied) {
            game.onAllianceChange(game.alliances.forceAlliance(self, other), self, true);
        }
        else if (!this.ally && allied) {
            const alliance = game.alliances.findByPlayers(self, other);
            game.alliances.breakAlliance(self, other);
            game.onAllianceChange(alliance, self, false);
        }
    }
}

/** 18 « Reveal zone of waypoint » : révèle une large zone autour du point pour le joueur. */
export class RevealZoneExecutor extends TriggerExecutor {
    execute(game: any): void {
        const tile = game.map.getTileAtWaypoint(Number(this.action.params[1]));
        const player = scenario(game)?.humanPlayer;
        if (tile && player) {
            game.mapShroudTrait.getPlayerShroud(player)?.revealAround(tile, 12);
        }
    }
}

/** 3 « Production Begins » / 74 « AI triggers begin » / 75 « AI triggers stop » */
export class HouseAiExecutor extends TriggerExecutor {
    constructor(action: any, trigger: any, private mode: "production" | "start" | "stop") {
        super(action, trigger);
    }
    execute(game: any): void {
        const state = scenario(game);
        const house = findHouse(game, this.action.params[1]);
        if (!state || !house) {
            return;
        }
        if (this.mode === "production") {
            state.ai.startProduction(game, house);
        }
        else {
            state.ai.setAiTriggers(game, house, this.mode === "start");
        }
    }
}

/** 100 / 117 « Play Ingame Movie » : vidéo dans la fenêtre radar (effet purement visuel). */
export class IngameMovieExecutor extends TriggerExecutor {
    constructor(action: any, trigger: any, private pause: boolean) {
        super(action, trigger);
    }
    execute(game: any): void {
        game.events.dispatch(new ScenarioMovieEvent(Number(this.action.params[1]), this.pause));
    }
}

/** 119-122 (Yuri) « Destroy all … of house » */
export class DestroyAllOfExecutor extends TriggerExecutor {
    constructor(action: any, trigger: any, private kind: "all" | "buildings" | "land" | "naval") {
        super(action, trigger);
    }
    execute(game: any): void {
        const house = findHouse(game, this.action.params[1]);
        if (!house) {
            return;
        }
        for (const obj of house.getOwnedObjects()) {
            if (obj.isDestroyed || !obj.isSpawned) {
                continue;
            }
            const ok = this.kind === "all" ||
                (this.kind === "buildings" && obj.isBuilding()) ||
                (this.kind === "land" && obj.isUnit?.() && !obj.rules.naval && !obj.isAircraft()) ||
                (this.kind === "naval" && obj.isUnit?.() && obj.rules.naval);
            if (ok) {
                game.destroyObject(obj);
            }
        }
    }
}

/** 125 (Yuri) « Create Building At » : la maison du déclencheur reçoit ce bâtiment au point de passage. */
export class CreateBuildingAtExecutor extends TriggerExecutor {
    execute(game: any): void {
        const owner = game.getAllPlayers().find((p: any) => p.country?.name === this.trigger.houseName);
        const tile = game.map.getTileAtWaypoint(Number(this.action.params[6]));
        const name = String(this.action.params[1]);
        if (!owner || !tile || !game.rules.hasObject(name, ObjectType.Building)) {
            return;
        }
        game.getConstructionWorker(owner).placeAt(name, tile, true);
    }
}

/** Actions sans effet sur la simulation (pour l'instant) : production IA, clignotements, vidéos… */
export class CampaignNoopExecutor extends TriggerExecutor {
    private static warned = new Set<number>();
    execute(): void {
        if (!CampaignNoopExecutor.warned.has(this.action.type)) {
            CampaignNoopExecutor.warned.add(this.action.type);
            console.info(`[Campagne] action ${this.action.type} ignorée pour l'instant (${this.getDebugName()})`);
        }
    }
}
