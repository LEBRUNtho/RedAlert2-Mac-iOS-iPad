// Lecture des équipes scriptées d'une carte de mission : [TaskForces], [ScriptTypes], [TeamTypes].
// Formats documentés par FinalAlert2 (sources de l'éditeur) et ModEnc.

export interface TaskForceEntry {
    count: number;
    typeName: string;
}

export interface TaskForce {
    id: string;
    name: string;
    entries: TaskForceEntry[];
}

export interface ScriptLine {
    action: number;
    param: number;
}

export interface ScriptType {
    id: string;
    name: string;
    lines: ScriptLine[];
}

export interface TeamType {
    id: string;
    name: string;
    /** Pays propriétaire (« BadGuy1 », « Player »…), comme les déclencheurs. */
    houseName: string;
    scriptId: string;
    taskForceId: string;
    /** Point de passage d'arrivée (numéro), undefined si aucun. */
    waypoint?: number;
    transportWaypoint?: number;
    max: number;
    priority: number;
    aggressive: boolean;
    suicide: boolean;
    droppod: boolean;
    useTransportOrigin: boolean;
    loadable: boolean;
    full: boolean;
    recruitable: boolean;
    isBaseDefense: boolean;
    tagId?: string;
    veteranLevel: number;
}

/** « A » = 0, « Z » = 25, « AA » = 26… (codage des points de passage dans les cartes). */
export function decodeWaypoint(code: string | undefined): number | undefined {
    if (!code || code === "None" || code === "<none>") {
        return undefined;
    }
    if (/^\d+$/.test(code)) {
        return Number(code);
    }
    const s = code.toUpperCase();
    let n = 0;
    for (const ch of s) {
        n = n * 26 + (ch.charCodeAt(0) - 64);
    }
    return n - 1;
}

function readList(ini: any, sectionName: string): string[] {
    const section = ini.getSection(sectionName);
    if (!section) {
        return [];
    }
    const ids: string[] = [];
    section.entries.forEach((value: any) => {
        if (typeof value === "string" && value) {
            ids.push(value);
        }
    });
    return ids;
}

function numericKeys(section: any): string[] {
    const keys: string[] = [];
    section.entries.forEach((_: any, key: string) => {
        if (/^\d+$/.test(key)) {
            keys.push(key);
        }
    });
    return keys.sort((a, b) => Number(a) - Number(b));
}

export class TeamData {
    taskForces = new Map<string, TaskForce>();
    scripts = new Map<string, ScriptType>();
    teamTypes = new Map<string, TeamType>();

    static read(ini: any): TeamData {
        const data = new TeamData();
        for (const id of readList(ini, "TaskForces")) {
            const s = ini.getSection(id);
            if (!s) {
                continue;
            }
            const entries: TaskForceEntry[] = [];
            for (const key of numericKeys(s)) {
                const [count, typeName] = String(s.getString(key)).split(",");
                if (typeName) {
                    entries.push({ count: Number(count), typeName: typeName.trim() });
                }
            }
            data.taskForces.set(id, { id, name: s.getString("Name"), entries });
        }
        for (const id of readList(ini, "ScriptTypes")) {
            const s = ini.getSection(id);
            if (!s) {
                continue;
            }
            const lines: ScriptLine[] = [];
            for (const key of numericKeys(s)) {
                const [action, param] = String(s.getString(key)).split(",");
                lines.push({ action: Number(action), param: Number(param ?? 0) });
            }
            data.scripts.set(id, { id, name: s.getString("Name"), lines });
        }
        for (const id of readList(ini, "TeamTypes")) {
            const s = ini.getSection(id);
            if (!s) {
                continue;
            }
            const tag = s.getString("Tag");
            data.teamTypes.set(id, {
                id,
                name: s.getString("Name"),
                houseName: s.getString("House"),
                scriptId: s.getString("Script"),
                taskForceId: s.getString("TaskForce"),
                waypoint: decodeWaypoint(s.getString("Waypoint")),
                transportWaypoint: decodeWaypoint(s.getString("TransportWaypoint")),
                max: s.getNumber("Max", 1),
                priority: s.getNumber("Priority", 5),
                aggressive: s.getBool("Aggressive"),
                suicide: s.getBool("Suicide"),
                droppod: s.getBool("Droppod"),
                useTransportOrigin: s.getBool("UseTransportOrigin"),
                loadable: s.getBool("Loadable"),
                full: s.getBool("Full"),
                recruitable: s.getBool("AreTeamMembersRecruitable"),
                isBaseDefense: s.getBool("IsBaseDefense"),
                tagId: tag && tag !== "<none>" ? tag : undefined,
                veteranLevel: s.getNumber("VeteranLevel", 1),
            });
        }
        return data;
    }
}
