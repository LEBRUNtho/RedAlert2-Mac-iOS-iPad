(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 80 && !window.__ra2Game; i++) await sleep(500);
  const g = window.__ra2Game;
  const vus = [];
  g.events.subscribe((e) => { if ([59, 61, 63].includes(e.type)) vus.push(`t${g.currentTick} type${e.type} ${e.label ?? e.soundId}`); });
  await sleep(45000);
  return vus;
})()
