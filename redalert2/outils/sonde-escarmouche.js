(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 60 && !window.__ra2Game; i++) await sleep(1000);
  const g = window.__ra2Game;
  if (!g) return { erreur: 'pas de partie lancée' };
  await sleep(20000);
  return { tick: g.currentTick, statut: g.status, joueurs: g.getCombatants().map(p => `${p.name}:${p.country?.name}:${p.getOwnedObjects().length}`) };
})()
