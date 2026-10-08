(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__ra2Game;
  if (!g) return { erreur: 'pas de partie' };
  const snap = () => g.scenarioState.teams.getActiveTeams().filter(t => /Transport/.test(t.type.name)).map(t => `${t.type.name}[l${t.line}] ${t.members.map(m => m.name + (m.isSpawned ? '' : '(à bord)')).join(' ')}`);
  const a = snap();
  await sleep(25000);
  return { debut: a, apres25s: snap() };
})()
