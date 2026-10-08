import { EventType } from "./EventType";
/** Un script de mission demande de centrer la vue sur une case. */
export class ScenarioCameraCenterEvent {
    public readonly type: EventType;
    constructor(public readonly tile: any) {
        this.type = EventType.ScenarioCameraCenter;
    }
}
