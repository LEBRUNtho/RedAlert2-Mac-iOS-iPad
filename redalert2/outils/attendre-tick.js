(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 80 && !window.__ra2Game; i++) await sleep(500);
  const g = window.__ra2Game;
  const cible = +(new URLSearchParams(location.search).get('tick') ?? 680);
  while (g.currentTick < cible) await sleep(100);
  return g.currentTick;
})()
