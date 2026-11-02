// Plan B write actions: Pages can't reach the desk, so every write goes through the Telegram bot,
// which uses the same command router as the local API (DECISIONS D28-D30).
window.deskActions = (function () {
  const BOT = "https://t.me/rlass19bot";
  const AGENTS = ["scanner", "auditor", "analyst", "executor", "risk"];
  function link(payload) { return BOT + "?start=" + encodeURIComponent(payload); }
  return {
    bot: BOT,
    pause: (a) => AGENTS.includes(a) ? link("pause_" + a) : null,
    resume: (a) => AGENTS.includes(a) ? link("resume_" + a) : null,
    paper: () => link("mode_PAPER"),
    live: () => link("mode_LIVE"),              // the bot then asks for: /live LIVE
    setCommand: (key, value) => "/set " + key + " " + value,   // copy + paste into the bot
    pushCommand: (sub) => "/push " + JSON.stringify(sub),       // copy + paste into the bot
    open: (url) => { window.location.href = url; },
  };
})();
