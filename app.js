// Desk iPhone web app (Plan B: static JSON on GitHub Pages, polled with ?t=). No frameworks.
// Setup link: <site>/#t=<APP_TOKEN>&d=<DATA_PATH>  -> stored in localStorage, then stripped from the URL (D41).
(function () {
  "use strict";
  const LS_T = "desk.token", LS_D = "desk.data";
  const AGENTS = ["scanner", "auditor", "analyst", "executor", "risk"];
  const LAYERS = { 1: "Mint authority", 2: "Freeze authority", 3: "Dev holding", 4: "Top 10 holders",
                   5: "LP locked", 6: "Age", 7: "Bundled wallets", 8: "Delegated" };
  const POLL_MS = 15000, STALE_S = 180;
  const $app = document.getElementById("app");
  let route = "", stateData = null, stateErr = null, timer = null, renderSeq = 0;

  // ---------------------------------------------------------------- setup (fragment -> localStorage)
  (function takeFragment() {
    const h = location.hash.replace(/^#/, "");
    if (!/(^|&)(t|d)=/.test(h)) return;
    const p = new URLSearchParams(h);
    if (p.get("t")) localStorage.setItem(LS_T, p.get("t"));
    if (p.get("d")) localStorage.setItem(LS_D, p.get("d"));
    history.replaceState(null, "", location.pathname + location.search + "#/home");
  })();
  const dataPath = localStorage.getItem(LS_D) || "";
  const hasToken = !!localStorage.getItem(LS_T);
  const configured = hasToken && /^[A-Za-z0-9_-]{8,64}$/.test(dataPath);
  const BASE = "d/" + encodeURIComponent(dataPath) + "/";

  // ---------------------------------------------------------------- helpers
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const usd = (v, d = 2) => v == null || isNaN(v) ? "–" : (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const sgnUsd = (v) => v == null ? "–" : (v >= 0 ? "+" : "") + usd(v);
  const pct = (v, d = 1) => v == null || isNaN(v) ? "–" : (v >= 0 ? "+" : "") + Number(v).toFixed(d) + "%";
  const price = (v) => v == null ? "–" : "$" + Number(v).toPrecision(4);
  const cls = (v) => v == null ? "dim" : v >= 0 ? "pos" : "neg";
  const short = (m) => m ? m.slice(0, 4) + "…" + m.slice(-4) : "";
  function ago(ts) {
    if (!ts) return "never";
    const s = Math.max(0, Date.now() / 1000 - ts);
    if (s < 60) return Math.round(s) + "s ago";
    if (s < 3600) return Math.round(s / 60) + "m ago";
    if (s < 86400) return Math.round(s / 3600) + "h ago";
    return Math.round(s / 86400) + "d ago";
  }
  const clock = (ts) => new Date(ts * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  async function getJSON(name) {
    const r = await fetch(BASE + name + ".json?t=" + Date.now(), { cache: "no-store" });
    if (r.status === 404) { const e = new Error("not published"); e.empty = true; throw e; }
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  function toast(msg) {
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 1800);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast("Copied"); }
    catch (e) { toast("Select the text and copy it"); }
  }
  window.deskCopy = copy;

  // ---------------------------------------------------------------- states
  const loadingView = (rows = 3) => `<div aria-busy="true" aria-label="Loading">` +
    `<div class="skel" style="height:150px"></div>` + Array.from({ length: rows }, () => `<div class="skel" style="height:64px"></div>`).join("") + `</div>`;
  const emptyView = (title, text, ico = "○") => `<div class="state"><div class="ico">${ico}</div><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
  const errorView = (err) => `<div class="state"><div class="ico" style="color:var(--red)">!</div><h3>Couldn't load</h3>` +
    `<p>${esc(err && err.message || err)}. Check your connection.</p><button class="btn gray" data-act="retry">Try again</button></div>`;

  function header(title, opts = {}) {
    const s = stateData;
    const badge = s ? `<span class="badge ${s.mode === "LIVE" ? "live" : "paper"}">${esc(s.mode)}</span>` : "";
    let pre = "";
    if (s && s.sample) pre += `<div class="sample-banner">SAMPLE DATA · not real</div>`;
    if (s && Date.now() / 1000 - s.generated_at > STALE_S) pre += `<div class="stale">Data is ${esc(ago(s.generated_at))}. The desk may be asleep.</div>`;
    if (stateErr && !s) pre += `<div class="stale">Can't reach desk data: ${esc(stateErr.message)}</div>`;
    const back = opts.back ? `<div class="nav"><button class="back" data-go="${esc(opts.back)}">‹ ${esc(opts.backText || "Back")}</button></div>` : "";
    return pre + back + `<h1 class="large-title">${esc(title)} ${badge}</h1>`;
  }

  // ---------------------------------------------------------------- screens
  const screens = {
    async home() {
      const [chart, act] = await Promise.all([getJSON("chart"), getJSON("activity").catch(() => ({ items: [] }))]);
      const s = stateData || await getJSON("state");
      const start = s.paper_start || 200;
      const eq = s.balance.paper_equity, pl = eq - start;
      const sigs = (act.items || []).filter(a => a.kind === "signal").slice(0, 5);
      let h = header("Desk") + `<div class="card hero"><div class="k">${s.mode === "PAPER" ? "Paper equity" : "Equity"}</div>
        <div class="big">${usd(eq)}</div><div class="pl ${cls(pl)}">${sgnUsd(pl)} (${pct(pl / start * 100)}) since start</div>
        <canvas class="chart" id="balChart" aria-label="Balance chart"></canvas></div>
        <div class="grid2"><div class="card metric"><div class="k">Cash</div><div class="v">${usd(s.balance.paper_cash)}</div></div>
        <div class="card metric"><div class="k">Watching</div><div class="v">${s.watching}</div></div></div>`;
      h += `<div class="section-h">Open positions</div>`;
      h += s.open_positions.length ? `<div class="list">` + s.open_positions.map(p => `<div class="row tap" data-go="coin/${esc(p.mint)}">
          <div class="main"><div class="t">${esc(p.symbol || short(p.mint))}</div><div class="s">${usd(p.size_usd)} · stop ${price(p.stop_price)}${p.trail_active ? " · trailing" : ""}</div></div>
          <div class="v ${cls(p.unrealized_pct)}">${pct(p.unrealized_pct)}</div><span class="chev"></span></div>`).join("") + `</div>`
        : `<div class="card">${emptyView("No open positions", "When you tap Bought on a signal, the position shows up here.", "◌")}</div>`;
      h += `<div class="section-h">Latest signals</div>`;
      h += sigs.length ? `<div class="list">` + sigs.map(a => `<div class="row tap" data-go="coin/${esc(a.mint)}">
          <div class="main"><div class="t">${esc(a.message)}</div><div class="s">${esc(short(a.mint))} · ${esc(ago(a.ts))}</div></div><span class="chev"></span></div>`).join("") + `</div>`
        : `<div class="card">${emptyView("No signals yet", "Coins that pass all five agents appear here.", "◌")}</div>`;
      return { html: h, after() { deskChart(document.getElementById("balChart"), chart.points, { baseline: start, format: v => "$" + v.toFixed(0), emptyText: "Balance history appears after the first trade" }); } };
    },

    async agents() {
      const s = stateData || await getJSON("state");
      const det = await Promise.all(AGENTS.map(a => getJSON("agents/" + a).catch(() => null)));
      const day = Date.now() / 1000 - 86400;
      let h = header("Agents");
      h += s.agents.map((a, i) => {
        const d = det[i];
        const n24 = d ? d.decisions.filter(x => x.ts >= day).length : 0;
        const sk = d ? d.skip_reasons_24h.reduce((t, r) => t + r.n, 0) : 0;
        return `<div class="card agent-card" data-go="agent/${a.name}" role="button" tabindex="0">
          <div class="head"><span class="dot ${esc(a.status)}"></span><span class="name">${esc(a.name)}</span>
          <span class="footnote">${esc(a.status)}</span><span class="chev"></span></div>
          <div class="stats"><span>Heartbeat <b>${a.heartbeat_age_s == null ? "never" : esc(a.heartbeat_age_s + "s ago")}</b></span>
          <span>Decisions 24h <b>${n24}</b></span><span>Rejects 24h <b>${sk}</b></span>${a.name === "scanner" ? `<span>Reconnects <b>${a.ws_reconnects}</b></span>` : ""}</div></div>`;
      }).join("");
      return { html: h };
    },

    async agent(name) {
      if (!AGENTS.includes(name)) return { html: header("Agent", { back: "agents" }) + emptyView("Unknown agent", "") };
      const d = await getJSON("agents/" + name);
      const a = d.agent;
      let h = header(name.charAt(0).toUpperCase() + name.slice(1), { back: "agents", backText: "Agents" });
      h += `<div class="card"><div class="head" style="display:flex;gap:10px;align-items:center"><span class="dot ${esc(a.status)}"></span>
        <b style="flex:1;text-transform:capitalize">${esc(a.status)}</b><span class="footnote">heartbeat ${a.heartbeat_age_s == null ? "never" : esc(a.heartbeat_age_s + "s ago")}</span></div>
        <div class="btn-row">${a.paused ? `<a class="btn primary" href="${deskActions.resume(name)}">Resume in Telegram</a>`
          : `<a class="btn gray" href="${deskActions.pause(name)}">Pause in Telegram</a>`}</div></div>`;
      if (d.skip_reasons_24h.length) h += `<div class="section-h">Top reject reasons · 24h</div><div class="list">` +
        d.skip_reasons_24h.slice(0, 8).map(r => `<div class="row"><div class="main"><div class="s" style="color:var(--label)">${esc(r.reason)}</div></div><div class="v">${r.n}</div></div>`).join("") + `</div>`;
      h += `<div class="section-h">Decisions</div>`;
      h += d.decisions.length ? `<div class="list">` + d.decisions.map(x => feedRow(x)).join("") + `</div>`
        : `<div class="card">${emptyView("No decisions yet", "This agent hasn't logged anything.")}</div>`;
      h += `<div class="section-h">Settings</div><div class="list">` + Object.entries(d.settings).map(([k, v]) =>
        `<div class="row tap" data-set="${esc(name + "." + k)}" data-val="${esc(JSON.stringify(v))}"><div class="main"><div class="t" style="font-size:15px">${esc(k)}</div></div><div class="v dim">${esc(v)}</div></div>`).join("") + `</div>`;
      return { html: h };
    },

    async activity() {
      const act = await getJSON("activity");
      let h = header("Activity");
      if (!act.items.length) return { html: h + emptyView("No activity yet", "Agent events appear here as the desk runs.") };
      let last = "";
      h += act.items.map(x => {
        const day = new Date(x.ts * 1000).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
        const sep = day !== last ? `${last ? "</div>" : ""}<div class="section-h">${esc(day)}</div><div class="list">` : "";
        last = day; return sep + feedRow(x);
      }).join("") + "</div>";
      return { html: h };
    },

    async account() {
      const [acc, st] = await Promise.all([getJSON("account"), getJSON("settings")]);
      let h = header("Account");
      h += `<div class="card"><div class="footnote">FOMO account</div><div style="font-size:20px;font-weight:600;margin:2px 0 10px">@${esc(acc.fomo_handle)}</div>
        <div class="grid2" style="margin:0"><div class="metric"><div class="k">Paper cash</div><div class="v">${usd(acc.paper_cash)}</div></div>
        <div class="metric"><div class="k">Realized P&amp;L</div><div class="v ${cls(acc.realized_pnl_usd)}">${sgnUsd(acc.realized_pnl_usd)}</div></div>
        <div class="metric"><div class="k">Trades / wins</div><div class="v">${acc.closed_trades} / ${acc.wins}</div></div>
        <div class="metric"><div class="k">Fees paid</div><div class="v">${usd(acc.fees_paid_usd)}</div></div></div></div>`;
      const z = acc.sizing;
      if (z) h += `<div class="section-h">Ticket size</div><div class="card">${z.warning ? `<div class="warn" role="alert" style="color:var(--orange);font-weight:600;margin-bottom:8px">⚠️ ${esc(z.warning)}</div>` : ""}
        <div class="footnote">PAPER ticket ${esc(z.stack_pct)}% of stack = ${usd(z.base_ticket)}${z.bumped ? " → bumped to " + usd(z.ticket) : ""} · min stack ${usd(z.min_stack)} (${usd(z.min_ticket)} / ${esc(z.stack_pct)}%) · pool cap ${esc(z.max_pool_pct)}%</div></div>`;
      const L = acc.live_stack;
      if (L) h += `<div class="section-h">LIVE stack</div><div class="card"><div style="font-size:20px;font-weight:600">${L.set ? usd(L.live_stack) : "Not set"}</div>
        <div class="footnote">${L.set ? "You set it " + esc(ago(L.set_ts)) + (L.age_h > 24 ? " · over 24h ago, update it if you traded" : "") : "Set it in Telegram: /set desk.live_stack &lt;usd&gt;"}</div>
        <p class="caption" style="margin:8px 0 0">Used only in LIVE. The desk never changes it and never trades: you buy and sell on FOMO, then update it.</p></div>`;
      h += `<div class="section-h">Mode</div><div class="card"><div style="display:flex;align-items:center;gap:10px"><span class="badge ${acc.mode === "LIVE" ? "live" : "paper"}">${esc(acc.mode)}</span>
        <span class="footnote">${acc.paper_nights} full PAPER night(s) · LIVE ${acc.live_allowed ? "unlocked" : "locked until 1 full PAPER night"}</span></div>
        <div class="btn-row"><a class="btn gray" href="${deskActions.paper()}">PAPER</a><a class="btn gray" href="${deskActions.live()}">LIVE…</a></div>
        <p class="caption" style="margin:8px 0 0">Changes are made by the Telegram bot. LIVE also needs you to send <span class="mono">/live LIVE</span>.</p></div>`;
      h += `<div class="section-h">Agents</div><div class="list">` + (stateData ? stateData.agents : AGENTS.map(n => ({ name: n, paused: false, status: "?" }))).map(a =>
        `<div class="row"><span class="dot ${esc(a.status)}"></span><div class="main"><div class="t" style="text-transform:capitalize">${esc(a.name)}</div></div>
        <a class="chip" href="${a.paused ? deskActions.resume(a.name) : deskActions.pause(a.name)}">${a.paused ? "Resume" : "Pause"}</a></div>`).join("") + `</div>`;
      h += `<div class="section-h">Notifications</div><div class="card" id="pushCard"><button class="btn blue" data-act="push">Enable push notifications</button>
        <p class="caption" style="margin:8px 0 0">On iPhone this works only after Share → Add to Home Screen, opened from the Home Screen (iOS 16.4+).</p></div>`;
      // settings grouped by agent, with defaults (D65)
      const defs = acc.defaults || {}, ORDER = ["scanner", "auditor", "analyst", "executor", "risk", "desk"];
      const keys = [...new Set([...Object.keys(defs), ...Object.keys(st)])].filter(k => !k.startsWith("agent."));
      const groups = {};
      keys.forEach(k => { const g = k.split(".")[0]; (groups[g] = groups[g] || []).push(k); });
      const gnames = Object.keys(groups).sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
      const changed = keys.filter(k => k in defs && k in st && JSON.stringify(st[k]) !== JSON.stringify(defs[k])).length;
      h += `<div class="section-h">Settings</div><p class="caption" style="margin:0 0 8px">${changed ? changed + " changed from default" : "All settings at defaults"}</p>`;
      h += gnames.map(g => `<div class="section-h" style="text-transform:capitalize">${esc(g)}</div><div class="list">` +
        groups[g].map(k => {
          const v = k in st ? st[k] : defs[k], d = defs[k], diff = k in defs && JSON.stringify(v) !== JSON.stringify(d);
          return `<div class="row tap" data-set="${esc(k)}" data-val="${esc(JSON.stringify(v))}"><div class="main"><div class="t" style="font-size:15px">${esc(k.slice(g.length + 1))}</div>
            <div class="s">default ${esc(d === undefined ? "–" : d)}${diff ? " · changed" : ""}</div></div><div class="v ${diff ? "" : "dim"}" style="font-size:15px${diff ? ";color:var(--orange)" : ""}">${esc(v)}</div></div>`;
        }).join("") + `</div>`).join("");
      h += `<p class="caption">Tap a setting to get the Telegram command that changes it.</p>`;
      h += `<div class="section-h">Ledger</div>`;
      h += acc.ledger.length ? `<div class="list">` + acc.ledger.slice(0, 30).map(l => `<div class="row"><div class="main"><div class="t" style="font-size:15px">${esc(l.note || l.kind)}</div>
        <div class="s">${esc(l.mode)} · ${esc(ago(l.ts))}</div></div><div class="v"><div class="${cls(l.amount_usd)}" style="font-size:15px">${sgnUsd(l.amount_usd)}</div><div class="caption">${usd(l.balance_usd)}</div></div></div>`).join("") + `</div>`
        : emptyView("No ledger entries", "");
      h += `<div class="list"><a class="row tap" href="${esc(acc.profile_url)}" target="_blank" rel="noopener"><div class="main"><div class="t">FOMO profile</div></div><span class="chev"></span></a>
        <a class="row tap" href="${esc(acc.telegram_bot)}" target="_blank" rel="noopener"><div class="main"><div class="t">Open Telegram bot</div></div><span class="chev"></span></a></div>`;
      return { html: h };
    },

    async coin(mint) {
      const d = await getJSON("coin/" + mint);
      const c = d.coin, sc = d.latest_scan || {}, v = d.verdict, a = d.audit;
      let h = header(c.symbol || short(mint), { back: "home", backText: "Home" });
      h += `<div class="card hero"><div class="k">${esc(c.name || "")} · ${esc(c.status)}</div><div class="big">${price(sc.price_usd)}</div>
        <div class="pl ${cls(sc.change_h1)}">${pct(sc.change_h1)} 1h · ${pct(sc.change_m5)} 5m</div><canvas class="chart" id="pxChart" aria-label="Price chart"></canvas></div>`;
      h += `<a class="btn primary" href="${esc(c.coin_url)}" target="_blank" rel="noopener">Buy on FOMO</a>`;
      h += `<div class="grid2" style="margin-top:12px">` + [["Liquidity", usd(sc.liquidity_usd, 0)], ["Market cap", usd(sc.market_cap, 0)],
        ["Volume 1h", usd(sc.volume_h1, 0)], ["Buys / sells 1h", sc.buys_h1 == null ? "–" : sc.buys_h1 + " / " + sc.sells_h1],
        ["Top 10", sc.top10_pct == null ? "–" : Number(sc.top10_pct).toFixed(1) + "%"], ["Age", sc.age_min == null ? "–" : Math.round(sc.age_min) + "m"]]
        .map(([k, val]) => `<div class="card metric"><div class="k">${k}</div><div class="v">${esc(val)}</div></div>`).join("") + `</div>`;
      h += `<div class="section-h">Verdict</div>`;
      h += v ? `<div class="card"><div style="display:flex;align-items:center;gap:10px"><span class="dot ${v.gate_pass ? "green" : "red"}"></span>
        <b style="flex:1">${v.gate_pass ? "Gate passed" : "Rejected"}</b><span class="footnote">${esc(ago(v.ts))}</span></div>
        <div class="stats" style="display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;font-size:13px;color:var(--label2)">
        <span>Score <b style="color:var(--label)">${v.score == null ? "–" : Math.round(v.score)}</b></span><span>Alive <b style="color:var(--label)">${v.alive ?? "–"}</b></span>
        <span>Organic <b style="color:var(--label)">${v.organic ?? "–"}</b></span><span>Chase <b style="color:var(--label)">${v.chase ?? "–"}</b></span></div>
        <p class="footnote" style="margin:8px 0 0">${esc(v.reason)}</p></div>` : `<div class="card">${emptyView("No verdict yet", "The Analyst rates a coin after a green audit.")}</div>`;
      h += `<div class="list"><div class="row tap" data-go="audit/${esc(mint)}"><span class="dot ${a ? (a.status === "green" ? "green" : "red") : ""}"></span>
        <div class="main"><div class="t">Audit</div><div class="s">${a ? (a.status === "green" ? "All 8 layers green" : "Red at layer " + a.first_red_layer) : "Not audited yet"}</div></div><span class="chev"></span></div></div>`;
      if (d.skips.length) h += `<div class="section-h">Rejects</div><div class="list">` + d.skips.map(s => `<div class="row"><div class="main"><div class="s" style="color:var(--label)">${esc(s.reason)}</div><div class="s">${esc(s.agent)} · ${esc(ago(s.ts))}</div></div></div>`).join("") + `</div>`;
      h += `<p class="caption mono">${esc(mint)}</p>`;
      return { html: h, after() { deskChart(document.getElementById("pxChart"), d.chart.points, { format: v => "$" + v.toPrecision(3), emptyText: "Price history appears after a few polls" }); } };
    },

    async audit(mint) {
      const d = await getJSON("audit/" + mint);
      let h = header("Auditor", { back: "coin/" + mint, backText: "Coin" });
      const a = d.audits[0];
      if (!a) return { html: h + emptyView("Not audited yet", "The Auditor runs once the Scanner passes the coin.") };
      const L = a.layers || {};
      h += `<div class="card"><div style="display:flex;align-items:center;gap:10px"><span class="dot ${a.status === "green" ? "green" : "red"}"></span>
        <b style="flex:1">${a.status === "green" ? "All 8 layers green" : "Stopped at layer " + a.first_red_layer}</b><span class="footnote">${esc(ago(a.ts))}</span></div></div>`;
      h += `<div class="list">` + [1, 2, 3, 4, 5, 6, 7, 8].map(n => {
        const l = L[n] || L[String(n)];
        const st = l ? l.status : "skipped";
        const val = l && l.value != null ? (typeof l.value === "number" ? Number(l.value.toFixed(4)) : l.value) : (l ? "null" : "");
        return `<div class="row layer ${st}"><span class="num">${n}</span><div class="main"><div class="t">${LAYERS[n]}</div>
          <div class="s">${l ? esc(l.note) : "not checked: an earlier layer was red"}</div></div><div class="v ${st === "red" ? "neg" : st === "green" ? "pos" : "dim"}" style="font-size:15px">${esc(st === "skipped" ? "–" : val)}</div></div>`;
      }).join("") + `</div>`;
      return { html: h };
    },
  };

  function feedRow(x) {
    const color = /kill|red|reject|cancel|error|drop|expired/.test(x.kind) ? "red" : /pass|green|signal|bought|exit/.test(x.kind) ? "green" : "";
    const go = x.mint ? ` tap" data-go="coin/${esc(x.mint)}` : "";
    return `<div class="row${go}"><span class="dot ${color}"></span><div class="main"><div class="t" style="font-size:15px;white-space:normal">${esc(x.message)}</div>
      <div class="s">${esc(x.agent)} · ${esc(x.kind)}${x.mint ? " · " + esc(short(x.mint)) : ""} · ${esc(clock(x.ts))}</div></div>${x.mint ? '<span class="chev"></span>' : ""}</div>`;
  }

  // ---------------------------------------------------------------- push (D49)
  function b64ToU8(b64) {
    const pad = "=".repeat((4 - b64.length % 4) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }
  async function enablePush() {
    const card = document.getElementById("pushCard");
    const standalone = window.navigator.standalone || matchMedia("(display-mode: standalone)").matches;
    const say = (html) => { card.innerHTML = html; };
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return say(`<p class="footnote" style="margin:0">Push isn't available here. ${/iPhone|iPad/.test(navigator.userAgent) && !standalone ? "Tap Share → Add to Home Screen, then open Desk from your Home Screen and try again." : "This browser doesn't support web push."}</p>`);
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return say(`<p class="footnote" style="margin:0">Notifications are off. Turn them on in Settings → Notifications → Desk.</p>`);
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ||
        await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(window.VAPID_PUBLIC_KEY) });
      const cmd = deskActions.pushCommand(sub.toJSON());
      say(`<p class="footnote" style="margin:0 0 8px">Last step: send this to the Telegram bot so the desk can reach this phone.</p>
        <textarea class="copy" readonly>${esc(cmd)}</textarea>
        <div class="btn-row"><button class="btn gray" data-copy="${esc(cmd)}">Copy</button><a class="btn blue" href="${deskActions.bot}">Open Telegram</a></div>`);
    } catch (e) { say(`<p class="footnote" style="margin:0;color:var(--red)">Couldn't enable push: ${esc(e.message)}</p>`); }
  }

  // ---------------------------------------------------------------- settings sheet
  function showSet(key, val) {
    const cmd = deskActions.setCommand(key, val);
    const el = document.createElement("div");
    el.className = "card"; el.style.cssText = "position:fixed;left:12px;right:12px;bottom:calc(var(--tab-h) + var(--safe-b) + 12px);z-index:15;box-shadow:0 8px 40px rgba(0,0,0,.6);background:var(--card2)";
    el.innerHTML = `<div class="footnote" style="margin-bottom:6px">Change <b style="color:var(--label)">${esc(key)}</b>: edit the value, then send it to the bot.</div>
      <textarea class="copy" style="min-height:44px">${esc(cmd)}</textarea>
      <div class="btn-row"><button class="btn gray" data-act="close">Close</button><button class="btn gray" data-act="copyset">Copy</button><a class="btn blue" href="${deskActions.bot}">Telegram</a></div>`;
    document.body.appendChild(el);
    el.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]");
      if (!act) return;
      if (act.dataset.act === "close") el.remove();
      if (act.dataset.act === "copyset") copy(el.querySelector("textarea").value);
    });
  }

  // ---------------------------------------------------------------- paste setup (D63, Home Screen app)
  async function pasteSetup() {
    const field = document.getElementById("setupField"), msg = document.getElementById("setupMsg");
    let text = field.value.trim();
    if (!text && navigator.clipboard && navigator.clipboard.readText) {
      try { text = (await navigator.clipboard.readText()).trim(); } catch (e) { text = ""; }
    }
    if (!text) {
      msg.style.color = "var(--label2)";
      msg.textContent = "Couldn't read the clipboard. Long-press the box above, tap Paste, then tap Paste setup link again.";
      field.focus();
      return;
    }
    try {
      const v = window.deskParseSetup(text);
      localStorage.setItem(LS_T, v.t);
      localStorage.setItem(LS_D, v.d);
      field.value = "";
      location.replace(location.pathname + location.search + "#/home");
      location.reload();
    } catch (e) {
      field.value = "";
      msg.style.color = "var(--red)";
      msg.textContent = e.message;
    }
  }

  // ---------------------------------------------------------------- router
  function parseRoute() { const r = location.hash.replace(/^#\/?/, ""); return r || "home"; }
  async function render(silent) {
    const seq = ++renderSeq;
    route = parseRoute();
    const [name, arg] = route.split("/");
    const tab = { home: "home", coin: "home", audit: "home", agents: "agents", agent: "agents", activity: "activity", account: "account" }[name] || "home";
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t.dataset.tab === tab));
    if (!configured) {
      $app.innerHTML = `<div class="screen"><div class="state" style="padding-bottom:16px"><div class="ico">🔑</div><h3>Set up this phone</h3>
        <p>Open your bot in Telegram, send /link, long-press the link and Copy, then come back here and tap Paste setup link.</p></div>
        <div class="card"><textarea class="copy" id="setupField" style="min-height:64px" placeholder="Setup link" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-label="Setup link"></textarea>
        <div class="btn-row"><button class="btn blue" data-act="pastesetup">Paste setup link</button></div>
        <p class="footnote" id="setupMsg" role="alert" style="margin:8px 0 0"></p></div></div>`;
      return;
    }
    const fn = screens[name] || screens.home;
    if (!silent) $app.innerHTML = `<div class="screen">${header({ coin: "Coin", audit: "Auditor", agent: "Agent" }[name] || (name.charAt(0).toUpperCase() + name.slice(1)))}${loadingView()}</div>`;
    try {
      const out = await fn(arg ? decodeURIComponent(arg) : undefined);
      if (seq !== renderSeq) return;
      const y = window.scrollY;
      $app.innerHTML = `<div class="${silent ? "" : "screen"}">${out.html}</div>`;
      if (silent) window.scrollTo(0, y);
      if (out.after) out.after();
    } catch (e) {
      if (seq !== renderSeq) return;
      if (silent) return;            // keep the last good view on a failed background refresh
      const title = { coin: "Coin", audit: "Auditor", agent: "Agent" }[name] || (name.charAt(0).toUpperCase() + name.slice(1));
      $app.innerHTML = `<div class="screen">${header(title)}${e.empty ? emptyView("Nothing published yet", name === "coin" || name === "audit" ? "Only coins active in the last 24 hours are published." : "The desk hasn't published this data yet.") : errorView(e)}</div>`;
    }
  }

  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) { location.hash = "#/" + go.dataset.go; return; }
    const t = e.target.closest(".tab");
    if (t) { location.hash = "#/" + t.dataset.tab; return; }
    const act = e.target.closest("[data-act]");
    if (act && act.dataset.act === "retry") render();
    if (act && act.dataset.act === "push") enablePush();
    if (act && act.dataset.act === "pastesetup") pasteSetup();
    const cp = e.target.closest("[data-copy]");
    if (cp) copy(cp.dataset.copy);
    const st = e.target.closest("[data-set]");
    if (st) { let v = st.dataset.val; try { v = JSON.parse(v); } catch (x) {} showSet(st.dataset.set, typeof v === "string" ? v : JSON.stringify(v)); }
  });
  window.addEventListener("hashchange", () => { window.scrollTo(0, 0); render(); });

  if (configured) {
    deskPoll(BASE, "state", (d, err) => {
      const first = !stateData && !stateErr;
      if (d) { stateData = d; stateErr = null; } else stateErr = err;
      if (!first) render(true);
    }, POLL_MS);
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  render();
})();
