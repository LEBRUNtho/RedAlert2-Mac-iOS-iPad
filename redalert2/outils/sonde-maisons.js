(() => {
  const g = window.__ra2Game;
  if (!g) return { erreur: 'pas de partie' };
  const me = g.localPlayer;
  return {
    joueur: `${me.name} (${me.scenarioHouse?.houseName})`,
    commande: g.getAllPlayers().filter(p => p.controlledBy === me).map(p => `${p.scenarioHouse?.houseName}: ${p.getOwnedObjects().filter(o => o.isUnit?.()).map(o => o.name).slice(0, 6).join(' ')}`),
    ennemis: g.getCombatants().filter(p => p !== me && !g.alliances.areAllied(p, me)).map(p => `${p.scenarioHouse?.houseName}:${p.getOwnedObjects().length}`),
  };
})()
