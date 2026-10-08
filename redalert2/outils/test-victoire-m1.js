// Test : la mission 1 se gagne quand la base soviétique (BadGuy1) est rasée.
(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__ra2Game;
  if (!g) return { erreur: 'pas de partie' };
  const bg1 = g.getAllPlayers().find(p => p.country?.name === 'BadGuy1');
  const avant = bg1.getOwnedObjects().filter(o => o.isBuilding()).length;
  for (const b of bg1.getOwnedObjects().filter(o => o.isBuilding() && !o.isDestroyed)) {
    try { g.destroyObject(b); } catch (e) {}
  }
  await sleep(3000);
  const inst = [...g.triggers.triggerInstances.values()];
  const ev = inst.find(i => i.trigger.name === 'Enable Victory');
  const mv = inst.find(i => i.trigger.name === 'Mission Victory');
  const reste = { buildingsSet: bg1.buildings?.size, owned: bg1.getOwnedObjects(true).filter(o => o.isBuilding()).map(o => o.name + (o.isDestroyed ? '(détruit)' : '')).slice(0, 10), countryId: bg1.country.id, evParams: ev?.trigger.events.map(e => e.type + ':' + e.params.join('/')) };
  const t0 = g.currentTick;
  for (let i = 0; i < 40 && !g.scenarioState?.result; i++) await sleep(1000);
  return { batimentsDetruits: avant, reste, enableVictory: ev ? { fini: ev.finished, inactif: ev.disabled } : 'absent', missionVictory: mv ? { fini: mv.finished, inactif: mv.disabled } : 'absent', ticks: g.currentTick - t0, resultat: g.scenarioState?.result ?? 'aucun', statut: g.status };
})()
