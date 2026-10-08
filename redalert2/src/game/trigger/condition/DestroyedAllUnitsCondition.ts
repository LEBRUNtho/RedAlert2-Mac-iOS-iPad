import { ObjectType } from "@/engine/type/ObjectType";
import { EventType } from "@/game/event/EventType";
import { TriggerCondition } from "@/game/trigger/TriggerCondition";
export class DestroyedAllUnitsCondition extends TriggerCondition {
    private allDestroyed: boolean;
    private houseId: number;
    constructor(params: any[], trigger: any) {
        super(params, trigger);
        this.allDestroyed = false;
        this.houseId = Number(this.event.params[1]);
    }
    check(_game: any, events: any[]): boolean {
        if (this.allDestroyed) {
            return true;
        }
        const hasDestroyedAll = events.some((event) => {
            if (event.type !== EventType.ObjectDestroy) {
                return false;
            }
            const target = event.target;
            if (!target.isUnit() || target.owner?.country?.id !== this.houseId) {
                return false;
            }
            return !this.hasUnitsLeft(target.owner);
        });
        if (hasDestroyedAll) {
            this.allDestroyed = true;
        }
        return hasDestroyedAll;
    }
    private hasUnitsLeft(owner: any): boolean {
        const unitTypes = [
            ObjectType.Aircraft,
            ObjectType.Vehicle,
            ObjectType.Infantry,
        ];
        for (const type of unitTypes) {
            // L'unité détruite figure encore dans la liste de son propriétaire au moment de l'événement.
            if (owner.getOwnedObjectsByType(type, true).some((o: any) => !o.isDestroyed)) {
                return true;
            }
        }
        return false;
    }
}
