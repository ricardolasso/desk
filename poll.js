// Plan B polling helper: fetch data JSON with a cache-busting ?t=<now> query.
// dataBase is the data folder URL (e.g. "d/<path>/"), supplied at runtime, never hard-coded here.
window.deskPoll = function (dataBase, name, onData, intervalMs) {
  intervalMs = intervalMs || 15000;
  let stopped = false;
  async function tick() {
    if (stopped) return;
    try {
      const r = await fetch(dataBase + name + ".json?t=" + Date.now(), { cache: "no-store" });
      if (r.ok) onData(await r.json(), null); else onData(null, new Error("HTTP " + r.status));
    } catch (e) { onData(null, e); }
    if (!stopped) setTimeout(tick, intervalMs);
  }
  tick();
  return function stop() { stopped = true; };
};
