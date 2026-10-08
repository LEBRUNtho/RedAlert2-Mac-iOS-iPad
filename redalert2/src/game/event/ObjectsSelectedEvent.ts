import { EventType } from "./EventType";
/** Le joueur a changé sa sélection (rejoué depuis le journal d'actions, donc déterministe). */
export class ObjectsSelectedEvent {
    public readonly type: EventType;
    constructor(public readonly player: any, public readonly objects: any[]) {
        this.type = EventType.ObjectsSelected;
    }
}
