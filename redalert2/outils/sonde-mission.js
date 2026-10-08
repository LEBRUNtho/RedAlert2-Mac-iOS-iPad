// Sonde du banc d'essai : état d'une mission en cours (à passer en 3e argument de banc.mjs).
(() => {
  const g = window.__ra2Game;
  if (!g) return { erreur: 'pas de partie' };
  const st = g.scenarioState;
  const teams = st ? st.teams.getActiveTeams().map(t => `${t.type.name}[l${t.line}${t.finalMission !== undefined ? ' mission ' + t.finalMission : ''}] x${t.members.length}`) : [];
  const local = g.localPlayer;
  const mine = local ? local.getOwnedObjects().filter(o => o.isUnit && o.isUnit()).map(o => `${o.name}@${o.tile.rx},${o.tile.ry}`) : [];
  const trig = [...g.triggers.triggerInstances.values()];
  return {
    tick: g.currentTick, secondes: Math.round(g.currentTime / 1000), statut: g.status,
    resultat: st?.result, verrou: st?.inputLocked,
    credits: local?.credits, unitesJoueur: mine.slice(0, 30),
    equipes: teams,
    declencheurs: { total: trig.length, finis: trig.filter(t => t.finished).length, actifs: trig.filter(t => !t.disabled && !t.finished).length },
  };
})()
