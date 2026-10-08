import { EventType } from "./EventType";
/** Un script de mission joue une vidéo (index dans la liste [Movies] de art.ini). */
export class ScenarioMovieEvent {
    public readonly type: EventType;
    constructor(public readonly movieIndex: number, public readonly pauseGame: boolean) {
        this.type = EventType.ScenarioMovie;
    }
}
