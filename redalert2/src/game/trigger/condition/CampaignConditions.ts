// Événements de déclencheurs propres aux missions.
import { EventType } from "@/game/event/EventType";
import { TriggerCondition } from "@/game/trigger/TriggerCondition";

function humanPlayer(game: any): any {
    return game.scenarioState?.humanPlayer ?? game.getCombatants().find((p: any) => !p.isAi);
}

/** 4 « Discovered by player » : un objet rattaché sort du brouillard pour le joueur. */
export class DiscoveredByPlayerCondition extends TriggerCondition {
    private discovered = false;
    check(game: any): any[] | boolean {
        if (this.discovered) {
            return false;
        }
        const player = humanPlayer(game);
        const shroud = player && game.mapShroudTrait.getPlayerShroud(player);
        if (!shroud) {
            return false;
        }
        for (const target of this.targets) {
            const tile = target.tile ?? target;
            if (target.isSpawned === false || target.isDestroyed) {
                continue;
            }
            if (tile && !shroud.isShrouded(tile, target.tileElevation ?? 0)) {
                this.discovered = true;
                return [target];
            }
        }
        return false;
    }
}

/** 33 « Selected by player » */
export class SelectedByPlayerCondition extends TriggerCondition {
    check(game: any, events: any[]): any[] {
        const player = humanPlayer(game);
        return events
            .filter((e) => e.type === EventType.ObjectsSelected && e.player === player)
            .flatMap((e) => e.objects.filter((o: any) => this.targets.includes(o)));
    }
}

/** 5 « House discovered » : un objet quelconque de la maison devient visible pour le joueur. */
export class HouseDiscoveredCondition extends TriggerCondition {
    private discovered = false;
    check(game: any): boolean {
        if (this.discovered) {
            return true;
        }
        if (game.currentTick % 15 !== 0) {
            return false;
        }
        const player = humanPlayer(game);
        const shroud = player && game.mapShroudTrait.getPlayerShroud(player);
        const houseId = Number(this.event.params[1]);
        const house = game.getAllPlayers().find((p: any) => p.country && Number(p.country.id) === houseId);
        if (!shroud || !house) {
            return false;
        }
        this.discovered = house.getOwnedObjects().some((o: any) => o.isSpawned && o.tile && !shroud.isShrouded(o.tile, o.tileElevation ?? 0));
        return this.discovered;
    }
}

/** 60 / 61 (Yuri) « TechType Exists / does not Exist » : au moins N objets de ce type, à n'importe qui. */
export class TechTypeExistsCondition extends TriggerCondition {
    private count: number;
    private typeName: string;
    constructor(event: any, trigger: any, private negate: boolean) {
        super(event, trigger);
        this.count = Math.max(1, Number(this.event.params[1]) || 1);
        this.typeName = String(this.event.params[2] ?? "");
    }
    check(game: any): boolean {
        if (game.currentTick % 15 !== 0) {
            return this.last ?? false;
        }
        let n = 0;
        for (const p of game.getAllPlayers()) {
            for (const o of p.getOwnedObjects(true)) {
                if (o.name === this.typeName && !o.isDestroyed) {
                    n++;
                }
            }
        }
        this.last = this.negate ? n === 0 : n >= this.count;
        return this.last;
    }
}

/** 58 (Yuri) « Power Full » : la maison n'est pas en sous-alimentation. */
export class PowerFullCondition extends TriggerCondition {
    check(game: any): boolean {
        const houseId = Number(this.event.params[1]);
        const house = game.getAllPlayers().find((p: any) => p.country && Number(p.country.id) === houseId);
        return !!house?.powerTrait && !house.powerTrait.isLowPower();
    }
}
