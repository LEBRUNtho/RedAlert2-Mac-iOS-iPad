// Ordres donnés aux unités par les scripts de mission, depuis l'intérieur de la simulation.
// Même logique que OrderUnitsAction (validation, ordres de repli, répartition des déplacements),
// sans passer par la file d'actions du joueur ni par le contrôle du brouillard : un script
// sait où il envoie ses troupes, et l'exécution reste déterministe (sauvegardes/rejeu).
import { OrderFactory } from "@/game/order/OrderFactory";
import { OrderType } from "@/game/order/OrderType";
import { orderPriorities } from "@/game/order/orderPriorities";
import { MoveOrder } from "@/game/order/MoveOrder";
import { MovePositionHelper } from "@/game/gameobject/unit/MovePositionHelper";
import { UnitSelectionLite } from "@/game/gameobject/selection/UnitSelectionLite";
import { TargetBridgeMode } from "@/game/Target";
import { ScatterPositionHelper } from "@/game/gameobject/unit/ScatterPositionHelper";

/** Dispersion (panique des civils, « Scatter ») : chaque unité reçoit une case libre voisine. */
function scatter(game: any, units: any[]): void {
    const movable = units.filter((u) => u.isInfantry() || u.isVehicle());
    if (!movable.length) {
        return;
    }
    const selection = new UnitSelectionLite(movable[0].owner);
    selection.update(movable);
    const factory = new OrderFactory(game, game.map);
    const positions = new ScatterPositionHelper(game).findPositions(movable);
    for (const unit of movable) {
        const position = positions.get(unit);
        if (!position) {
            continue;
        }
        const order = factory.create(OrderType.Scatter, selection);
        order.set(unit, game.createTarget(undefined, position.tile, position.onBridge ? TargetBridgeMode.Bridge : TargetBridgeMode.Ground));
        if (order.isValid() && order.isAllowed()) {
            unit.unitOrderTrait.addOrder(order, false);
        }
    }
}

export function isOrderable(unit: any): boolean {
    return !!unit && unit.isSpawned && !unit.isDestroyed && !unit.isCrashing && !unit.isDisposed &&
        !!unit.unitOrderTrait && !unit.rules.spawned;
}

/** Donne un ordre à un groupe d'unités. Cible : objet (attaque, entrée…) ou case. */
export function issueOrder(game: any, units: any[], orderType: OrderType, targetObj?: any, targetTile?: any): void {
    const orderable = units.filter(isOrderable);
    if (!orderable.length) {
        return;
    }
    if (orderType === OrderType.Scatter) {
        scatter(game, orderable);
        return;
    }
    const tile = targetTile ?? targetObj?.tile;
    const target = tile || targetObj ? game.createTarget(targetObj, tile) : undefined;
    const selection = new UnitSelectionLite(orderable[0].owner);
    selection.update(orderable);
    const factory = new OrderFactory(game, game.map);
    const orders: any[] = [];
    for (const unit of orderable) {
        const order = factory.create(orderType, selection);
        order.set(unit, target);
        if (order.isValid() && order.isAllowed()) {
            orders.push(order);
            continue;
        }
        let found = false;
        for (const fallbackType of orderPriorities) {
            const fallback = factory.create(fallbackType, selection);
            fallback.set(unit, target);
            if (fallback.targetOptional === !target && fallback.isValid() && fallback.isAllowed()) {
                orders.push(fallback);
                found = true;
                break;
            }
        }
        if (!found && target) {
            const move = factory.create(OrderType.Move, selection);
            move.set(unit, target);
            if (move.isValid() && move.isAllowed()) {
                orders.push(move);
            }
        }
    }
    // Les déplacements vers une case sont répartis autour de la destination, comme pour le joueur.
    const moves = orders.filter((o) => o instanceof MoveOrder && !targetObj);
    if (moves.length && tile) {
        const positions = new MovePositionHelper(game.map).findPositions(moves.map((o) => o.sourceObject), tile, undefined, false);
        for (const order of moves) {
            const position = positions.get(order.sourceObject);
            if (position) {
                order.target = game.createTarget(undefined, position, TargetBridgeMode.Auto);
            }
        }
    }
    for (const order of orders) {
        order.sourceObject.unitOrderTrait.addOrder(order, false);
    }
}

export function moveTo(game: any, units: any[], tile: any): void {
    issueOrder(game, units, OrderType.Move, undefined, tile);
}

export function attackMoveTo(game: any, units: any[], tile: any): void {
    issueOrder(game, units, OrderType.AttackMove, undefined, tile);
}

export function attack(game: any, units: any[], target: any): void {
    issueOrder(game, units, OrderType.Attack, target);
}

/** Les récolteurs gardent leur travail : un ordre de garde ou d'arrêt les empêcherait de récolter. */
const notHarvester = (u: any) => !u.rules?.harvester && !u.harvesterTrait;

/** Garde sur place (riposte et poursuit brièvement les ennemis à portée). */
export function guard(game: any, units: any[]): void {
    issueOrder(game, units.filter(notHarvester), OrderType.Guard);
}

export function stop(game: any, units: any[]): void {
    issueOrder(game, units.filter(notHarvester), OrderType.Stop);
}
