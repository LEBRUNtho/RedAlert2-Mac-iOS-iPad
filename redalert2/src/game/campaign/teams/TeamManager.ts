// Équipes scriptées des missions : création (recrutement), renforts, et exécution pas à pas
// de leur script (ScriptTypes). Tourne dans la boucle de simulation, de façon déterministe.
import { ObjectType } from "@/engine/type/ObjectType";
import { Coords } from "@/game/Coords";
import { Infantry } from "@/game/gameobject/Infantry";
import { ZoneType } from "@/game/gameobject/unit/ZoneType";
import { UnlandableTrait } from "@/game/gameobject/trait/UnlandableTrait";
import { CardinalTileFinder } from "@/game/map/tileFinder/CardinalTileFinder";
import { RadialTileFinder } from "@/game/map/tileFinder/RadialTileFinder";
import { SpeedType } from "@/game/type/SpeedType";
import { GameSpeed } from "@/game/GameSpeed";
import { OrderType } from "@/game/order/OrderType";
import { TeamData, TeamType } from "./TeamData";
import { SuperWeaponsTrait } from "@/game/trait/SuperWeaponsTrait";
import { ParadropEffect } from "@/game/superweapon/ParadropEffect";
import { SuperWeaponType } from "@/game/type/SuperWeaponType";
import { attack, attackMoveTo, guard, isOrderable, issueOrder, moveTo, stop } from "./ScriptOrders";

/** Ordres de script (index = numéro dans la carte), d'après l'éditeur FinalAlert2. */
export enum ScriptAction {
    Attack = 0,
    AttackWaypoint = 1,
    GoBerzerk = 2,
    MoveToWaypoint = 3,
    MoveToCell = 4,
    GuardArea = 5,
    JumpToLine = 6,
    PlayerWins = 7,
    Unload = 8,
    Deploy = 9,
    FollowFriendlies = 10,
    DoMission = 11,
    SetGlobal = 12,
    IdleAnim = 13,
    LoadOntoTransport = 14,
    SpyOnBuilding = 15,
    PatrolToWaypoint = 16,
    ChangeScript = 17,
    ChangeTeam = 18,
    Panic = 19,
    ChangeHouse = 20,
    Scatter = 21,
    GotoNearbyShroud = 22,
    PlayerLoses = 23,
    PlaySpeech = 24,
    PlaySound = 25,
    PlayMovie = 26,
    PlayMusic = 27,
    ReduceTiberium = 28,
    BeginProduction = 29,
    FireSale = 30,
    SelfDestruct = 31,
    IonStormStart = 32,
    IonStormEnd = 33,
    CenterView = 34,
    ReshroudMap = 35,
    RevealMap = 36,
    DeleteTeamMembers = 37,
    ClearGlobal = 38,
    SetLocal = 39,
    ClearLocal = 40,
    Unpanic = 41,
    ForceFacing = 42,
    WaitTillFullyLoaded = 43,
    TruckUnload = 44,
    TruckLoad = 45,
    AttackEnemyBuilding = 46,
    MoveToEnemyBuilding = 47,
    Scout = 48,
    Success = 49,
    Flash = 50,
    PlayAnim = 51,
    TalkBubble = 52,
    GatherAtEnemy = 53,
    GatherAtBase = 54,
    IronCurtainMe = 55,
    ChronoPrepBuilding = 56,
    ChronoPrepQuarry = 57,
    MoveToOwnBuilding = 58,
    // Ajouts de Yuri's Revenge
    AttackBuildingAtWaypoint = 59,
    EnterGrinder = 60,
    OccupyTankBunker = 61,
    EnterBioReactor = 62,
    OccupyBattleBunker = 63,
    GarrisonBuilding = 64,
}

/** Mission « Do this » (paramètre de l'ordre 11). */
enum UnitMission {
    Sleep = 0,
    Attack = 1,
    Move = 2,
    QMove = 3,
    Retreat = 4,
    Guard = 5,
    Sticky = 6,
    AreaGuard = 11,
    Stop = 13,
    Ambush = 14,
    Hunt = 15,
    Harmless = 23,
    Patrol = 25,
    Wait = 28,
    AttackMove = 29,
}

const TICKS_PER_SECOND = GameSpeed.BASE_TICKS_PER_SECOND;
/** Unité de temps des ordres « garder » : 1/10 de minute de jeu. */
const GUARD_TIME_UNIT_TICKS = 6 * TICKS_PER_SECOND;
/** Délai maximal d'un déplacement avant de passer à la ligne suivante (évite les équipes bloquées). */
const MOVE_TIMEOUT_TICKS = 180 * TICKS_PER_SECOND;
/** Les équipes réévaluent leur ordre en cours deux fois par seconde. */
const THINK_INTERVAL_TICKS = Math.max(1, Math.round(TICKS_PER_SECOND / 2));

interface ActiveTeam {
    uid: number;
    type: TeamType;
    owner: any;
    members: any[];
    line: number;
    /** Ligne déjà lancée (ordres donnés), on attend sa fin. */
    started: boolean;
    startTick: number;
    waitUntil?: number;
    target?: any;
    /** Mission permanente atteinte (script terminé par « Do this »). */
    finalMission?: UnitMission;
    /** Recrutement en attente (Create Team sans unités disponibles). */
    recruiting: boolean;
    /** Équipe créée par l'IA de campagne : attend d'être complète avant de lancer son script. */
    fromAi?: boolean;
    forming?: boolean;
    /** Équipe IA : ne recrute que des unités apparues après sa création (pas les gardes de la carte). */
    minUnitId?: number;
}

export class TeamManager {
    private data: TeamData;
    /** Équipes du fichier ai.ini du jeu, pour les cartes qui utilisent les déclencheurs IA globaux. */
    private globalData?: TeamData;
    private teams: ActiveTeam[] = [];
    private nextUid = 1;
    private memberTeam = new Map<any, ActiveTeam>();

    constructor(mapIni: any, globalAiIni?: any) {
        this.data = TeamData.read(mapIni);
        if (globalAiIni) {
            this.globalData = TeamData.read(globalAiIni);
        }
    }

    getTeamType(id: string): TeamType | undefined {
        return this.data.teamTypes.get(id) ?? this.globalData?.teamTypes.get(id);
    }

    private getTaskForce(id: string) {
        return this.data.taskForces.get(id) ?? this.globalData?.taskForces.get(id);
    }

    private getScript(id: string) {
        return this.data.scripts.get(id) ?? this.globalData?.scripts.get(id);
    }

    /** Équipe voulue par l'IA d'une maison : elle se remplit avec les unités qui sortent des usines. */
    createAiTeam(game: any, typeId: string, owner: any): ActiveTeam | undefined {
        const type = this.getTeamType(typeId);
        if (!type) {
            return undefined;
        }
        const team = this.newTeam(type, owner, game);
        team.fromAi = true;
        team.forming = true;
        team.recruiting = true;
        team.minUnitId = game.nextObjectId?.value ?? this.maxUnitId(owner) + 1;
        return team;
    }

    private maxUnitId(owner: any): number {
        return owner.getOwnedObjects().reduce((m: number, o: any) => Math.max(m, o.id), 0);
    }

    /** Unités manquantes d'une équipe, par type (pour la production de l'IA). */
    getMissingUnits(team: ActiveTeam): Map<string, number> {
        const missing = new Map<string, number>();
        const taskForce = this.getTaskForce(team.type.taskForceId);
        for (const entry of taskForce?.entries ?? []) {
            const have = team.members.filter((m) => m.name === entry.typeName).length;
            if (entry.count > have) {
                missing.set(entry.typeName, (missing.get(entry.typeName) ?? 0) + entry.count - have);
            }
        }
        return missing;
    }

    getActiveTeams(typeId?: string): ActiveTeam[] {
        return typeId ? this.teams.filter((t) => t.type.id === typeId) : this.teams;
    }

    // ------------------------------------------------------------ création

    private findOwner(game: any, houseName: string): any {
        return game.getAllPlayers().find((p: any) => p.country?.name === houseName);
    }

    private resolveObjectType(game: any, name: string): ObjectType | undefined {
        for (const type of [ObjectType.Infantry, ObjectType.Vehicle, ObjectType.Aircraft]) {
            if (game.rules.hasObject(name, type)) {
                return type;
            }
        }
        return undefined;
    }

    private newTeam(type: TeamType, owner: any, game: any): ActiveTeam {
        const team: ActiveTeam = {
            uid: this.nextUid++,
            type,
            owner,
            members: [],
            line: 0,
            started: false,
            startTick: game.currentTick,
            recruiting: false,
        };
        this.teams.push(team);
        return team;
    }

    private addMember(team: ActiveTeam, unit: any, game?: any): void {
        const previous = this.memberTeam.get(unit);
        if (previous && previous !== team) {
            previous.members = previous.members.filter((m) => m !== unit);
        }
        this.memberTeam.set(unit, team);
        team.members.push(unit);
        // Équipe étiquetée (TeamType Tag=) : ses membres deviennent des cibles des déclencheurs de ce tag.
        if (team.type.tagId && game) {
            game.triggers.attachObjectToTag(unit, team.type.tagId, game);
        }
    }

    /** Action « Create Team » : l'équipe recrute des unités existantes de sa maison. */
    createTeam(game: any, typeId: string): void {
        const type = this.getTeamType(typeId);
        if (!type) {
            console.warn(`[Campagne] équipe inconnue ${typeId}`);
            return;
        }
        if (this.getActiveTeams(typeId).length >= Math.max(1, type.max)) {
            return;
        }
        const owner = this.findOwner(game, type.houseName);
        if (!owner) {
            console.warn(`[Campagne] maison ${type.houseName} absente pour l'équipe ${type.name}`);
            return;
        }
        const team = this.newTeam(type, owner, game);
        team.recruiting = true;
        this.recruit(game, team);
        console.info(`[Campagne] équipe créée : ${type.name} (${team.members.length} membres)`);
    }

    private recruit(game: any, team: ActiveTeam): void {
        const taskForce = this.getTaskForce(team.type.taskForceId);
        if (!taskForce) {
            team.recruiting = false;
            return;
        }
        const anchor = team.type.waypoint !== undefined ? game.map.getTileAtWaypoint(team.type.waypoint) : undefined;
        let missing = false;
        for (const entry of taskForce.entries) {
            const have = team.members.filter((m) => m.name === entry.typeName).length;
            let need = entry.count - have;
            if (need <= 0) {
                continue;
            }
            const candidates = team.owner.getOwnedObjects()
                .filter((obj: any) => obj.name === entry.typeName && isOrderable(obj) && !this.isInOtherTeam(obj, team) &&
                    (team.minUnitId === undefined || obj.id >= team.minUnitId) && !team.members.includes(obj));
            if (anchor) {
                candidates.sort((a: any, b: any) => this.tileDistance(a.tile, anchor) - this.tileDistance(b.tile, anchor) || a.id - b.id);
            }
            else {
                candidates.sort((a: any, b: any) => a.id - b.id);
            }
            for (const unit of candidates) {
                if (need <= 0) {
                    break;
                }
                this.addMember(team, unit, game);
                need--;
            }
            if (need > 0) {
                missing = true;
            }
        }
        team.recruiting = missing;
    }

    /** Une unité d'une autre équipe ne peut être prise que si cette équipe est « recrutable » et moins prioritaire. */
    private isInOtherTeam(unit: any, team: ActiveTeam): boolean {
        const other = this.memberTeam.get(unit);
        if (!other || other === team || !this.teams.includes(other)) {
            return false;
        }
        return !(other.type.recruitable && team.type.priority > other.type.priority);
    }

    private tileDistance(a: any, b: any): number {
        return Math.abs(a.rx - b.rx) + Math.abs(a.ry - b.ry);
    }

    /** Actions « Reinforcement » (7) et « Reinforcement at waypoint » (80) : unités créées sur place. */
    reinforce(game: any, typeId: string, waypointOverride?: number): void {
        const type = this.getTeamType(typeId);
        if (!type) {
            console.warn(`[Campagne] renfort inconnu ${typeId}`);
            return;
        }
        const owner = this.findOwner(game, type.houseName);
        const taskForce = this.getTaskForce(type.taskForceId);
        if (!owner || !taskForce) {
            console.warn(`[Campagne] renfort ${type.name} impossible (maison ou groupe manquant)`);
            return;
        }
        const waypoint = waypointOverride ?? type.waypoint;
        const tile = waypoint !== undefined ? game.map.getTileAtWaypoint(waypoint) : undefined;
        if (!tile) {
            console.warn(`[Campagne] renfort ${type.name} : point de passage ${waypoint} introuvable`);
            return;
        }
        // Infanterie seule avec point de transport : les renforts arrivent en parachute (« Soviet PARATROOPERS
        // are incoming »), largués par l'avion du moteur ; l'équipe ramasse les paras une fois au sol.
        const infantryOnly = taskForce.entries.every((e) => this.resolveObjectType(game, e.typeName) === ObjectType.Infantry);
        if (infantryOnly && type.transportWaypoint !== undefined && waypointOverride === undefined) {
            const swTrait: any = game.traits.find(SuperWeaponsTrait);
            if (swTrait) {
                const team = this.newTeam(type, owner, game);
                team.recruiting = true;
                // L'équipe attend que tous les paras soient au sol avant de lancer son script.
                team.forming = true;
                team.minUnitId = game.nextObjectId?.value;
                for (const entry of taskForce.entries) {
                    swTrait.addEffect(new ParadropEffect(SuperWeaponType.ParaDrop, owner, tile, { inf: entry.typeName, num: entry.count }, 0));
                }
                console.info(`[Campagne] renfort parachuté : ${type.name} au point ${waypoint}`);
                return;
            }
        }
        const team = this.newTeam(type, owner, game);
        // Une recherche de case par mode de déplacement : un navire cherche l'eau, l'infanterie la terre.
        const finders = new Map<any, any>();
        const nextTile = (rules: any, isInfantry: boolean) => {
            const speedType = rules.speedType;
            let finder = finders.get(speedType);
            if (!finder) {
                finder = new CardinalTileFinder(game.map.tiles, game.map.mapBounds, tile, 8, 8, (t: any) => !game.map
                    .getGroundObjectsOnTile(t)
                    .find((obj: any) => !(obj.isSmudge() || (obj.isOverlay() && obj.isTiberium()))) &&
                    game.map.terrain.getPassableSpeed(t, speedType, isInfantry, false) > 0);
                finders.set(speedType, finder);
            }
            return finder.getNextTile() ?? tile;
        };
        // Transports et véhicules d'abord, puis l'infanterie, qui embarque si un transport de l'équipe a de la place.
        const entries = [...taskForce.entries].sort((a, b) =>
            Number(this.resolveObjectType(game, a.typeName) === ObjectType.Infantry) - Number(this.resolveObjectType(game, b.typeName) === ObjectType.Infantry));
        const transports: any[] = [];
        let infantryTile: any;
        let freeSubCells: number[] = [];
        for (const entry of entries) {
            const objType = this.resolveObjectType(game, entry.typeName);
            if (objType === undefined) {
                console.warn(`[Campagne] type d'unité inconnu ${entry.typeName}`);
                continue;
            }
            const unitRules = game.rules.getObject(entry.typeName, objType);
            for (let i = 0; i < entry.count; i++) {
                const unit = game.createUnitForPlayer(unitRules, owner);
                if (objType === ObjectType.Aircraft) {
                    game.spawnObject(unit, tile);
                    unit.position.tileElevation = Coords.worldToTileHeight(unit.rules.flightLevel ?? game.rules.general.flightLevel);
                    unit.zone = ZoneType.Air;
                    unit.onBridge = false;
                    unit.traits.find(UnlandableTrait)?.setEnabled(false);
                }
                else if (objType === ObjectType.Infantry) {
                    const transport = transports.find((t) => t.transportTrait.unitFitsInside(unit));
                    if (transport) {
                        game.spawnObject(unit, transport.tile);
                        game.limboObject(unit, { selected: false, controlGroup: undefined, inTransport: true });
                        transport.transportTrait.units.push(unit);
                    }
                    else {
                        if (!infantryTile || !freeSubCells.length) {
                            infantryTile = nextTile(unitRules, true);
                            freeSubCells = [...Infantry.SUB_CELLS];
                        }
                        unit.position.subCell = freeSubCells.shift();
                        game.spawnObject(unit, infantryTile);
                    }
                }
                else {
                    game.spawnObject(unit, nextTile(unitRules, false));
                    if (unit.transportTrait && unit.transportTrait.getMaxCapacity() > 0) {
                        transports.push(unit);
                    }
                }
                this.addMember(team, unit, game);
            }
        }
        console.info(`[Campagne] renfort : ${type.name} (${team.members.map((m) => m.name + (m.isSpawned ? '' : '*') + (m.isDestroyed ? '†' : '')).join(' ')}) au point ${waypoint}`);
    }

    /** Action « Destroy Team » : l'équipe est dissoute, ses unités restent. */
    destroyTeam(typeId: string): void {
        for (const team of this.getActiveTeams(typeId)) {
            this.disband(team);
        }
    }

    private disband(team: ActiveTeam): void {
        for (const m of team.members) {
            if (this.memberTeam.get(m) === team) {
                this.memberTeam.delete(m);
            }
        }
        team.members = [];
        this.teams = this.teams.filter((t) => t !== team);
    }

    /** Missions des unités posées sur la carte : la traque est relancée, le reste attend (garde implicite). */
    applyInitialMissions(game: any, list: [any, string][]): void {
        const hunters = new Map<any, any[]>();
        for (const [unit, mission] of list) {
            if (!isOrderable(unit)) {
                continue;
            }
            switch (mission) {
                // « Harvest » : les récolteurs partent seuls à l'apparition (HarvesterTrait).
                // « Attack » sans cible désignée ne fait rien dans l'original : seule « Hunt » traque.
                case "Hunt":
                    if (!hunters.has(unit.owner)) {
                        hunters.set(unit.owner, []);
                    }
                    hunters.get(unit.owner)!.push(unit);
                    break;
                default:
                    break;
            }
        }
        for (const [owner, units] of hunters) {
            const stub: TeamType = {
                id: "@hunt-initial", name: "Initial hunters", houseName: owner.country?.name ?? "", scriptId: "", taskForceId: "",
                max: 1, priority: 0, aggressive: true, suicide: true, droppod: false, useTransportOrigin: false,
                loadable: false, full: false, recruitable: true, isBaseDefense: false, veteranLevel: 1,
            };
            const team = this.newTeam(stub, owner, game);
            units.forEach((u) => this.addMember(team, u));
            team.finalMission = UnitMission.Hunt;
            this.applyMission(game, team);
        }
    }

    /** Action « All to Hunt » : toute la maison traque l'ennemi, équipes comprises. */
    allToHunt(game: any, house: any): void {
        for (const team of this.teams.filter((t) => t.owner === house)) {
            this.disband(team);
        }
        const units = house.getOwnedObjects().filter((o: any) => o.isUnit?.() && isOrderable(o) && !o.rules.harvester);
        if (!units.length) {
            return;
        }
        const stub: TeamType = {
            id: "@hunt", name: "All to hunt", houseName: house.country?.name ?? "", scriptId: "", taskForceId: "",
            max: 1, priority: 0, aggressive: true, suicide: true, droppod: false, useTransportOrigin: false,
            loadable: false, full: false, recruitable: true, isBaseDefense: false, veteranLevel: 1,
        };
        const team = this.newTeam(stub, house, game);
        for (const u of units) {
            this.addMember(team, u);
        }
        team.finalMission = UnitMission.Hunt;
        this.applyMission(game, team);
    }

    getMembers(typeId: string): any[] {
        return this.getActiveTeams(typeId).flatMap((t) => t.members);
    }

    // ------------------------------------------------------------ exécution

    update(game: any): void {
        if (game.currentTick % THINK_INTERVAL_TICKS !== 0) {
            return;
        }
        for (const team of [...this.teams]) {
            try {
                this.updateTeam(game, team);
            }
            catch (error) {
                // Une équipe en erreur ne doit pas empêcher les autres de jouer ce pas.
                console.error(`[Campagne] équipe « ${team.type.name} » en échec`, error);
            }
        }
    }

    private updateTeam(game: any, team: ActiveTeam): void {
        {
            // Membres détruits, ou passés à une autre maison (« Change house ») : ils quittent l'équipe.
            team.members = team.members.filter((m) => {
                const keep = !m.isDestroyed && !m.isDisposed && m.owner === team.owner;
                if (!keep && this.memberTeam.get(m) === team) {
                    this.memberTeam.delete(m);
                }
                return keep;
            });
            if (team.recruiting) {
                this.recruit(game, team);
            }
            if (team.forming) {
                // Équipe IA en formation : on attend les unités des usines (au plus 3 minutes).
                const waited = game.currentTick - team.startTick;
                if (!team.recruiting || (waited > 120 * TICKS_PER_SECOND && team.members.length)) {
                    team.forming = false;
                    team.startTick = game.currentTick;
                }
                else {
                    if (waited > 180 * TICKS_PER_SECOND) {
                        this.disband(team);
                    }
                    return;
                }
            }
            if (!team.members.length) {
                if (!team.recruiting || game.currentTick - team.startTick > 60 * TICKS_PER_SECOND) {
                    this.disband(team);
                }
                return;
            }
            if (team.finalMission !== undefined) {
                this.keepMission(game, team);
                return;
            }
            this.runScript(game, team);
        }
    }

    private runScript(game: any, team: ActiveTeam): void {
        const script = this.getScript(team.type.scriptId);
        // Plusieurs lignes instantanées peuvent s'enchaîner dans le même pas (sauts, variables…).
        for (let guardSteps = 0; guardSteps < 16; guardSteps++) {
            if (!script || team.line >= script.lines.length) {
                // Script terminé : l'équipe se dissout ; ses unités inactives se mettent en garde
                // (jamais celles du joueur, qui a peut-être déjà repris la main).
                if (!game.scenarioState?.isHumanSide(team.owner)) {
                    guard(game, team.members.filter((m) => m.unitOrderTrait?.isIdle()));
                }
                this.disband(team);
                return;
            }
            if (!team.members.length) {
                // Équipe vidée en cours de script (déchargement total, membres détruits) : rien à ordonner.
                return;
            }
            const line = script.lines[team.line];
            const done = this.step(game, team, line.action, line.param);
            if (!done) {
                return;
            }
            if (!this.teams.includes(team)) {
                return;
            }
            if (team.finalMission !== undefined) {
                return;
            }
        }
    }

    private next(team: ActiveTeam, game: any): true {
        team.line++;
        team.started = false;
        team.waitUntil = undefined;
        team.target = undefined;
        team.startTick = game.currentTick;
        return true;
    }

    private allIdle(team: ActiveTeam): boolean {
        return team.members.every((m) => !m.unitOrderTrait || m.unitOrderTrait.isIdle());
    }

    /** Exécute la ligne courante ; renvoie true quand on peut passer à la suivante. */
    private step(game: any, team: ActiveTeam, action: number, param: number): boolean {
        switch (action) {
            case ScriptAction.MoveToWaypoint:
            case ScriptAction.AttackWaypoint:
            case ScriptAction.PatrolToWaypoint:
            case ScriptAction.MoveToCell: {
                const tile = action === ScriptAction.MoveToCell
                    ? game.map.tiles.getByMapCoords(param % 1000, Math.floor(param / 1000))
                    : game.map.getTileAtWaypoint(param);
                if (!tile) {
                    return this.next(team, game);
                }
                if (!team.started) {
                    team.started = true;
                    if (action === ScriptAction.MoveToWaypoint || action === ScriptAction.MoveToCell) {
                        moveTo(game, team.members, tile);
                    }
                    else {
                        attackMoveTo(game, team.members, tile);
                    }
                    return false;
                }
                const arrived = team.members.some((m) => this.tileDistance(m.tile, tile) <= 2);
                // Un avion ne « s'arrête » pas : arrivé au point, il passe à la suite.
                const airborne = team.members.every((m) => m.isAircraft());
                if ((arrived && (airborne || this.allIdle(team))) ||
                    (airborne && this.allIdle(team) && game.currentTick - team.startTick > 3 * TICKS_PER_SECOND) || this.allIdle(team) && game.currentTick - team.startTick > 5 * TICKS_PER_SECOND ||
                    game.currentTick - team.startTick > MOVE_TIMEOUT_TICKS) {
                    return this.next(team, game);
                }
                return false;
            }
            case ScriptAction.Attack: {
                // Attaque les cibles du type demandé jusqu'à ce qu'il n'en reste plus.
                if (team.target && !team.target.isDestroyed && team.target.isSpawned && !this.allIdle(team)) {
                    return false;
                }
                const target = this.findQuarry(game, team, param);
                if (!target) {
                    return this.next(team, game);
                }
                team.target = target;
                attack(game, team.members, target);
                return false;
            }
            case ScriptAction.AttackEnemyBuilding:
            case ScriptAction.MoveToEnemyBuilding: {
                if (team.target && !team.target.isDestroyed && team.target.isSpawned) {
                    if (action === ScriptAction.MoveToEnemyBuilding && this.allIdle(team)) {
                        return this.next(team, game);
                    }
                    if (this.allIdle(team)) {
                        attack(game, team.members, team.target);
                    }
                    return false;
                }
                if (team.started) {
                    return this.next(team, game);
                }
                const target = this.findBuildingWithProperty(game, team, param);
                if (!target) {
                    return this.next(team, game);
                }
                team.started = true;
                team.target = target;
                if (action === ScriptAction.AttackEnemyBuilding) {
                    attack(game, team.members, target);
                }
                else {
                    moveTo(game, team.members, target.tile);
                }
                return false;
            }
            case ScriptAction.GuardArea: {
                if (!team.started) {
                    team.started = true;
                    guard(game, team.members);
                    if (param <= 0) {
                        // Garde sans limite de temps.
                        team.finalMission = UnitMission.Guard;
                        return false;
                    }
                    team.waitUntil = game.currentTick + param * GUARD_TIME_UNIT_TICKS;
                    return false;
                }
                return game.currentTick >= (team.waitUntil ?? 0) ? this.next(team, game) : false;
            }
            case ScriptAction.JumpToLine:
                team.line = Math.max(0, param - 1) - 1;
                return this.next(team, game);
            case ScriptAction.Unload: {
                // Les transports gagnent la rive la plus proche si besoin, puis déchargent ; on attend
                // qu'ils soient vides (ou 30 s au plus).
                const loaded = team.members.filter((m) => m.transportTrait?.units.length && m.isSpawned);
                if (!team.started) {
                    team.started = true;
                    team.waitUntil = game.currentTick + 30 * TICKS_PER_SECOND;
                }
                for (const transport of loaded) {
                    if (!transport.unitOrderTrait.isIdle()) {
                        continue;
                    }
                    if (game.map.terrain.getPassableSpeed(transport.tile, SpeedType.Foot, false, transport.onBridge) > 0) {
                        issueOrder(game, [transport], OrderType.DeploySelected);
                    }
                    else {
                        const shore = new RadialTileFinder(game.map.tiles, game.map.mapBounds, transport.tile, { width: 1, height: 1 }, 0, 8,
                            (t: any) => game.map.terrain.getPassableSpeed(t, SpeedType.Foot, false, false) > 0 &&
                                game.map.terrain.getPassableSpeed(t, transport.rules.speedType, false, false) > 0).getNextTile();
                        if (shore) {
                            moveTo(game, [transport], shore);
                        }
                    }
                }
                if (loaded.length && game.currentTick < (team.waitUntil ?? 0)) {
                    return false;
                }
                // Paramètre : 0 garder tout, 1 garder les transports, 2 garder les passagers, 3 lâcher tout.
                const isTransport = (m: any) => !!m.transportTrait;
                if (param === 1) {
                    team.members = team.members.filter(isTransport);
                }
                else if (param === 2) {
                    this.adoptUnloadedPassengers(game, team);
                    team.members = team.members.filter((m) => !isTransport(m));
                }
                else if (param === 0) {
                    this.adoptUnloadedPassengers(game, team);
                }
                else {
                    team.members = [];
                }
                return this.next(team, game);
            }
            case ScriptAction.DoMission:
                team.finalMission = param as UnitMission;
                this.applyMission(game, team);
                return false;
            case ScriptAction.Panic:
            case ScriptAction.Scatter:
                issueOrder(game, team.members.filter((m) => m.isInfantry()), OrderType.Scatter);
                if (!team.started) {
                    team.started = true;
                    team.waitUntil = game.currentTick + 3 * TICKS_PER_SECOND;
                    return false;
                }
                return game.currentTick >= (team.waitUntil ?? 0) ? this.next(team, game) : false;
            case ScriptAction.ChangeHouse: {
                const newOwner = game.getAllPlayers().find((p: any) => p.country && Number(p.country.id) === param);
                if (newOwner) {
                    for (const m of team.members) {
                        game.changeObjectOwner(m, newOwner);
                    }
                }
                this.disband(team);
                return true;
            }
            case ScriptAction.DeleteTeamMembers:
                for (const m of team.members) {
                    this.removeSilently(game, m, team);
                }
                this.disband(team);
                return true;
            case ScriptAction.SetGlobal:
                game.triggers.toggleGlobalVariable(param as any, true);
                return this.next(team, game);
            case ScriptAction.ClearGlobal:
                game.triggers.toggleGlobalVariable(param as any, false);
                return this.next(team, game);
            case ScriptAction.SetLocal:
                game.triggers.toggleLocalVariable(param as any, true);
                return this.next(team, game);
            case ScriptAction.ClearLocal:
                game.triggers.toggleLocalVariable(param as any, false);
                return this.next(team, game);
            case ScriptAction.Deploy:
                issueOrder(game, team.members, OrderType.DeploySelected);
                return this.next(team, game);
            case ScriptAction.LoadOntoTransport:
            case ScriptAction.WaitTillFullyLoaded: {
                const transports = team.members.filter((m) => m.transportTrait);
                const passengers = team.members.filter((m) => !m.transportTrait && m.isInfantry() && m.isSpawned);
                if (!team.started) {
                    team.started = true;
                    if (action === ScriptAction.LoadOntoTransport && transports.length) {
                        let t = 0;
                        for (const p of passengers) {
                            issueOrder(game, [p], OrderType.EnterTransport, transports[t % transports.length]);
                            t++;
                        }
                    }
                    team.waitUntil = game.currentTick + 45 * TICKS_PER_SECOND;
                    return false;
                }
                // Les passagers embarqués quittent la carte (limbo) : on attend qu'il n'en reste plus dehors.
                const outside = team.members.filter((m) => !m.transportTrait && m.isInfantry() && m.isSpawned);
                return !outside.length || game.currentTick >= (team.waitUntil ?? 0) ? this.next(team, game) : false;
            }
            case ScriptAction.GatherAtEnemy:
            case ScriptAction.GatherAtBase: {
                if (!team.started) {
                    const tile = action === ScriptAction.GatherAtBase ? this.ownBaseTile(game, team) : this.enemyGatherTile(game, team);
                    team.started = true;
                    if (!tile) {
                        return this.next(team, game);
                    }
                    moveTo(game, team.members, tile);
                    return false;
                }
                return this.allIdle(team) && game.currentTick - team.startTick > 2 * TICKS_PER_SECOND ||
                    game.currentTick - team.startTick > MOVE_TIMEOUT_TICKS ? this.next(team, game) : false;
            }
            case ScriptAction.MoveToOwnBuilding: {
                if (!team.started) {
                    team.started = true;
                    const target = this.findOwnBuildingWithProperty(game, team, param);
                    if (!target) {
                        return this.next(team, game);
                    }
                    moveTo(game, team.members, target.tile);
                    return false;
                }
                return this.allIdle(team) && game.currentTick - team.startTick > 2 * TICKS_PER_SECOND ||
                    game.currentTick - team.startTick > MOVE_TIMEOUT_TICKS ? this.next(team, game) : false;
            }
            case ScriptAction.AttackBuildingAtWaypoint: {
                if (team.target && !team.target.isDestroyed && team.target.isSpawned) {
                    if (this.allIdle(team)) {
                        attack(game, team.members, team.target);
                    }
                    return false;
                }
                if (team.started) {
                    return this.next(team, game);
                }
                team.started = true;
                const tile = game.map.getTileAtWaypoint(param);
                const building = tile && game.map.getObjectsOnTile(tile).find((o: any) => o.isBuilding?.() && !o.isDestroyed);
                if (!building) {
                    return this.next(team, game);
                }
                team.target = building;
                attack(game, team.members, building);
                return false;
            }
            case ScriptAction.EnterGrinder:
            case ScriptAction.OccupyTankBunker:
            case ScriptAction.EnterBioReactor:
            case ScriptAction.OccupyBattleBunker:
            case ScriptAction.GarrisonBuilding: {
                // Les unités entrent dans le bâtiment adéquat le plus proche (broyeur, bunker, réacteur, bâtiment à occuper).
                if (!team.started) {
                    team.started = true;
                    const target = this.findEnterableBuilding(game, team, action);
                    if (!target) {
                        return this.next(team, game);
                    }
                    team.target = target;
                    issueOrder(game, team.members, OrderType.Occupy, target);
                    team.waitUntil = game.currentTick + 90 * TICKS_PER_SECOND;
                    return false;
                }
                const outside = team.members.filter((m) => m.isSpawned);
                return !outside.length || this.allIdle(team) || game.currentTick >= (team.waitUntil ?? 0) ? this.next(team, game) : false;
            }
            case ScriptAction.FollowFriendlies:
            case ScriptAction.Scout:
            case ScriptAction.ForceFacing:
            case ScriptAction.ChangeTeam:
            case ScriptAction.ChangeScript:
            case ScriptAction.IronCurtainMe:
            case ScriptAction.ChronoPrepBuilding:
            case ScriptAction.ChronoPrepQuarry:
            case ScriptAction.PlayAnim:
            case ScriptAction.TalkBubble:
            case ScriptAction.Success:
            case ScriptAction.Flash:
            case ScriptAction.IdleAnim:
            case ScriptAction.Unpanic:
            case ScriptAction.TruckLoad:
            case ScriptAction.TruckUnload:
            case ScriptAction.PlaySpeech:
            case ScriptAction.PlaySound:
            case ScriptAction.PlayMusic:
            case ScriptAction.PlayMovie:
            case ScriptAction.CenterView:
                return this.next(team, game);
            case ScriptAction.GoBerzerk:
                team.finalMission = UnitMission.Hunt;
                this.applyMission(game, team);
                return false;
            default:
                console.warn(`[Campagne] ordre de script ${action} pas encore géré (${team.type.name})`);
                return this.next(team, game);
        }
    }

    /** Retire une unité sans la « tuer » (pas de mort comptée ni d'explosion), passagers embarqués compris. */
    private removeSilently(game: any, unit: any, team: ActiveTeam): void {
        if (unit.isDestroyed || unit.isDisposed) {
            return;
        }
        for (const passenger of [...(unit.transportTrait?.units ?? [])]) {
            this.removeSilently(game, passenger, team);
        }
        if (unit.transportTrait) {
            unit.transportTrait.units.length = 0;
        }
        if (unit.isSpawned) {
            game.unspawnObject(unit);
        }
        else {
            // Passager en limbo : on le sort de son transport et de la liste de son propriétaire.
            for (const other of team.members) {
                const list = other.transportTrait?.units;
                const i = list ? list.indexOf(unit) : -1;
                if (i >= 0) {
                    list.splice(i, 1);
                }
            }
            try {
                unit.owner?.removeOwnedObject(unit);
            }
            catch {
                // Déjà retiré.
            }
        }
        unit.dispose?.();
        this.memberTeam.delete(unit);
    }

    /** Après un déchargement, les passagers débarqués près du transport restent dans l'équipe. */
    private adoptUnloadedPassengers(game: any, team: ActiveTeam): void {
        for (const transport of team.members.filter((m) => m.transportTrait)) {
            const nearby = team.owner.getOwnedObjects().filter((o: any) => o.isInfantry?.() && isOrderable(o) &&
                !this.memberTeam.get(o) && this.tileDistance(o.tile, transport.tile) <= 3);
            for (const unit of nearby) {
                this.addMember(team, unit, game);
            }
        }
    }

    private applyMission(game: any, team: ActiveTeam): void {
        switch (team.finalMission) {
            case UnitMission.Sleep:
            case UnitMission.Sticky:
            case UnitMission.Stop:
            case UnitMission.Harmless:
            case UnitMission.Wait:
                stop(game, team.members);
                break;
            case UnitMission.Hunt:
            case UnitMission.Attack:
            case UnitMission.AttackMove:
                this.hunt(game, team);
                break;
            default:
                guard(game, team.members);
        }
    }

    /** Missions permanentes : la traque relance l'attaque quand l'équipe n'a plus rien à faire. */
    private keepMission(game: any, team: ActiveTeam): void {
        if ((team.finalMission === UnitMission.Hunt || team.finalMission === UnitMission.Attack ||
            team.finalMission === UnitMission.AttackMove) && this.allIdle(team)) {
            this.hunt(game, team);
        }
    }

    private hunt(game: any, team: ActiveTeam): void {
        const target = this.findQuarry(game, team, 1);
        if (target) {
            attack(game, team.members, target);
        }
    }

    private isEnemy(game: any, team: ActiveTeam, obj: any): boolean {
        const owner = obj.owner;
        return !!owner && owner !== team.owner && !owner.isNeutral && !game.alliances.areAllied(owner, team.owner);
    }

    /** Cibles de l'ordre « Attack » : 1 tout, 2 bâtiments, 3 récolteurs, 4 infanterie, 5 véhicules,
     * 6 usines, 7 défenses, 9 centrales, 10 bâtiments occupables, 11 technologie. */
    private findQuarry(game: any, team: ActiveTeam, quarry: number): any {
        const leader = team.members.find((m) => m.isSpawned) ?? team.members[0];
        if (!leader) {
            return undefined;
        }
        let best: any;
        let bestDist = Infinity;
        for (const player of game.getCombatants()) {
            if (player === team.owner || player.isNeutral || game.alliances.areAllied(player, team.owner)) {
                continue;
            }
            for (const obj of player.getOwnedObjects()) {
                if (!obj.isSpawned || obj.isDestroyed || !this.matchesQuarry(obj, quarry)) {
                    continue;
                }
                const d = this.tileDistance(obj.tile, leader.tile);
                if (d < bestDist || (d === bestDist && obj.id < best.id)) {
                    best = obj;
                    bestDist = d;
                }
            }
        }
        return best;
    }

    private matchesQuarry(obj: any, quarry: number): boolean {
        const r = obj.rules;
        switch (quarry) {
            case 2: return obj.isBuilding();
            case 3: return !!r.harvester;
            case 4: return obj.isInfantry();
            case 5: return obj.isVehicle() || obj.isAircraft();
            case 6: return obj.isBuilding() && !!r.factory;
            case 7: return obj.isBuilding() && !!r.isBaseDefense;
            case 9: return obj.isBuilding() && (r.power ?? 0) > 0;
            case 10: return obj.isBuilding() && !!obj.garrisonTrait;
            default: return obj.isBuilding() || obj.isUnit();
        }
    }

    private findEnterableBuilding(game: any, team: ActiveTeam, action: number): any {
        const leader = team.members.find((m) => m.isSpawned) ?? team.members[0];
        if (!leader) {
            return undefined;
        }
        const friendly = (p: any) => p === team.owner || game.alliances.areAllied(p, team.owner);
        const candidates: any[] = [];
        for (const p of game.getAllPlayers()) {
            for (const b of p.getOwnedObjectsByType?.(ObjectType.Building) ?? []) {
                if (b.isDestroyed || !b.isSpawned) {
                    continue;
                }
                const r = b.rules;
                const ok = (action === ScriptAction.EnterGrinder && r.grinding && friendly(p)) ||
                    (action === ScriptAction.OccupyTankBunker && r.bunker && friendly(p)) ||
                    (action === ScriptAction.EnterBioReactor && (r.infantryAbsorb || /BIO|NANRCT|YAREFN/i.test(b.name)) && friendly(p)) ||
                    ((action === ScriptAction.OccupyBattleBunker || action === ScriptAction.GarrisonBuilding) && b.garrisonTrait &&
                        (friendly(p) || p.isNeutral));
                if (ok) {
                    candidates.push(b);
                }
            }
        }
        candidates.sort((a, b) => this.tileDistance(a.tile, leader.tile) - this.tileDistance(b.tile, leader.tile) || a.id - b.id);
        return candidates[0];
    }

    /** Centre de la base de l'équipe (chantier de construction, sinon premier bâtiment). */
    private ownBaseTile(game: any, team: ActiveTeam): any {
        const buildings = team.owner.getOwnedObjectsByType?.(ObjectType.Building) ?? [];
        const yard = buildings.find((b: any) => b.rules.constructionYard) ?? buildings[0];
        return yard?.tile;
    }

    /** Point de rassemblement avant l'assaut : aux deux tiers du chemin vers la base ennemie la plus proche. */
    private enemyGatherTile(game: any, team: ActiveTeam): any {
        const leader = team.members.find((m) => m.isSpawned) ?? team.members[0];
        if (!leader) {
            return undefined;
        }
        let best: any;
        let bestDist = Infinity;
        for (const player of game.getCombatants()) {
            if (player === team.owner || game.alliances.areAllied(player, team.owner)) {
                continue;
            }
            for (const b of player.getOwnedObjectsByType?.(ObjectType.Building) ?? []) {
                const d = this.tileDistance(b.tile, leader.tile);
                if (d < bestDist) {
                    best = b;
                    bestDist = d;
                }
            }
        }
        if (!best) {
            return undefined;
        }
        const rx = Math.round(leader.tile.rx + (best.tile.rx - leader.tile.rx) * 2 / 3);
        const ry = Math.round(leader.tile.ry + (best.tile.ry - leader.tile.ry) * 2 / 3);
        return game.map.tiles.getByMapCoords(rx, ry) ?? best.tile;
    }

    private findOwnBuildingWithProperty(game: any, team: ActiveTeam, param: number): any {
        let typeName: string | undefined;
        try {
            typeName = game.rules.getTechnoByInternalId(param & 0xffff, ObjectType.Building).name;
        }
        catch {
            return undefined;
        }
        const leader = team.members.find((m) => m.isSpawned) ?? team.members[0];
        if (!leader) {
            return undefined;
        }
        const list = (team.owner.getOwnedObjectsByType?.(ObjectType.Building) ?? []).filter((b: any) => b.name === typeName);
        list.sort((a: any, b: any) => this.tileDistance(a.tile, leader.tile) - this.tileDistance(b.tile, leader.tile) || a.id - b.id);
        return list[0];
    }

    /** Ordre 46/47 : paramètre = index du type de bâtiment (16 bits bas) + critère (bits hauts :
     * 0 menace la plus faible, 1 la plus forte, 2 le plus proche, 3 le plus loin). */
    private findBuildingWithProperty(game: any, team: ActiveTeam, param: number): any {
        const typeIndex = param & 0xffff;
        const criterion = (param >> 16) & 0xf;
        let typeName: string | undefined;
        try {
            typeName = game.rules.getTechnoByInternalId(typeIndex, ObjectType.Building).name;
        }
        catch {
            return undefined;
        }
        const leader = team.members.find((m) => m.isSpawned) ?? team.members[0];
        if (!leader) {
            return undefined;
        }
        const candidates: any[] = [];
        for (const player of game.getAllPlayers()) {
            if (player === team.owner || game.alliances.areAllied(player, team.owner)) {
                continue;
            }
            for (const obj of player.getOwnedObjectsByType?.(ObjectType.Building) ?? []) {
                if (obj.name === typeName && obj.isSpawned && !obj.isDestroyed) {
                    candidates.push(obj);
                }
            }
        }
        if (!candidates.length) {
            return undefined;
        }
        candidates.sort((a, b) => this.tileDistance(a.tile, leader.tile) - this.tileDistance(b.tile, leader.tile) || a.id - b.id);
        return criterion === 3 ? candidates[candidates.length - 1] : candidates[0];
    }
}
