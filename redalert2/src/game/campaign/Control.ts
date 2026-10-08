// Mission : le joueur commande aussi les maisons « PlayerControl=yes » associées (Tanya House, Spies House…),
// qui restent des maisons distinctes pour les scripts de la carte.
export function controls(player: any, obj: any): boolean {
    const owner = obj?.owner;
    return !!owner && (owner === player || (!!player && owner.controlledBy === player));
}
