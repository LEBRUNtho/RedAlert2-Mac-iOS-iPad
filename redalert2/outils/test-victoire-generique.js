// Test générique : on rase tout ce qui est hostile au joueur, puis on attend que les scripts concluent.
(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__ra2Game;
  if (!g) return { erreur: 'pas de partie' };
  const me = g.localPlayer;
  let detruits = 0;
  for (let vague = 0; vague < 3; vague++) {
    for (const p of g.getCombatants()) {
      if (p === me || g.alliances.areAllied(p, me)) continue;
      for (const o of p.getOwnedObjects().filter(o => !o.isDestroyed && o.isSpawned)) {
        try { g.destroyObject(o); detruits++; } catch (e) {}
      }
    }
    await sleep(8000);
  }
  for (let i = 0; i < 40 && !g.scenarioState?.result; i++) await sleep(1000);
  const inst = [...g.triggers.triggerInstances.values()];
  const gagnants = inst.filter(i => i.trigger.actions.some(a => a.type === 1)).map(i => `${i.trigger.name}${i.finished ? ' ✓' : i.disabled ? ' (inactif)' : ''}`);
  return { detruits, resultat: g.scenarioState?.result ?? 'aucun', declencheursVictoire: gagnants.slice(0, 6) };
})()
