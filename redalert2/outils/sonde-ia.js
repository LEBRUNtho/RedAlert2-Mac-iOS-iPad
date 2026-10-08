(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__ra2Game;
  if (!g) return { erreur: 'pas de partie' };
  const out = [];
  for (let i = 0; i < 8; i++) {
    const ai = g.scenarioState.ai;
    const houses = [...ai.houses.entries()].map(([h, s]) => {
      const q = h.production ? h.production.getAllQueues().filter(q => q.getAll().length).map(q => `${q.type}:${q.getAll().map(it => it.rules.name + 'x' + it.quantity).join('+')}(${q.status})`).join(' ') : '';
      return `${h.country?.name} prod=${s.production} ia=${s.aiTriggers} cr=${h.credits} files=[${q}] noeud=${s.pendingNode?.name ?? '-'}`;
    });
    const aiTeams = g.scenarioState.teams.getActiveTeams().filter(t => t.fromAi).map(t => `${t.type.name}${t.forming ? '(formation)' : ''}[l${t.line}]x${t.members.length}`);
    out.push(`t${g.currentTick} ${houses.join(' | ')} || équipesIA: ${aiTeams.join(', ')}`);
    await sleep(15000);
  }
  return out;
})()
