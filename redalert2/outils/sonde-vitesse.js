// Mesure la vitesse de simulation (ticks par seconde réelle) et le coût de nos systèmes de campagne.
(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__ra2Game;
  if (!g) return { erreur: 'pas de partie' };
  const st = g.scenarioState;
  let tAi = 0, tTeams = 0, tTrig = 0, n = 0;
  const wrap = (obj, key, add) => { const f = obj[key].bind(obj); obj[key] = (...a) => { const t = performance.now(); try { return f(...a); } finally { add(performance.now() - t); } }; };
  wrap(st.ai, 'update', d => tAi += d); wrap(st.teams, 'update', d => tTeams += d); wrap(g.triggers, 'update', d => { tTrig += d; n++; });
  const t0 = g.currentTick, w0 = performance.now();
  await sleep(10000);
  const ticks = g.currentTick - t0, secs = (performance.now() - w0) / 1000;
  return { tick: g.currentTick, ticksParSeconde: +(ticks / secs).toFixed(1), msParTick: { ia: +(tAi / n).toFixed(2), equipes: +(tTeams / n).toFixed(2), declencheurs: +(tTrig / n).toFixed(2) }, equipes: st.teams.getActiveTeams().length, objets: g.getAllPlayers().reduce((a, p) => a + p.getOwnedObjects().length, 0) };
})()
