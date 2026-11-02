// Hand-drawn canvas line chart (no libraries). points: [[ts, value], ...]
window.deskChart = function (canvas, points, opts) {
  opts = opts || {};
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const g = canvas.getContext("2d");
  g.scale(dpr, dpr);
  g.clearRect(0, 0, w, h);
  const css = getComputedStyle(document.documentElement);
  const col = (n) => css.getPropertyValue(n).trim();
  if (!points || points.length < 2) {
    g.fillStyle = col("--label2"); g.font = "13px " + col("--font"); g.textAlign = "center";
    g.fillText(opts.emptyText || "Not enough data yet", w / 2, h / 2);
    return;
  }
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (opts.baseline != null) { y0 = Math.min(y0, opts.baseline); y1 = Math.max(y1, opts.baseline); }
  if (y1 === y0) { y1 += Math.abs(y1) * 0.01 || 1; y0 -= Math.abs(y0) * 0.01 || 1; }
  const pad = { t: 18, b: 18, l: 2, r: 2 };
  const X = (x) => pad.l + (x1 === x0 ? 0.5 : (x - x0) / (x1 - x0)) * (w - pad.l - pad.r);
  const Y = (y) => pad.t + (1 - (y - y0) / (y1 - y0)) * (h - pad.t - pad.b);
  const up = ys[ys.length - 1] >= (opts.baseline != null ? opts.baseline : ys[0]);
  const line = up ? col("--green") : col("--red");
  if (opts.baseline != null) {          // dashed baseline (e.g. paper start / entry)
    g.strokeStyle = col("--label3"); g.setLineDash([3, 4]); g.lineWidth = 1;
    g.beginPath(); g.moveTo(pad.l, Y(opts.baseline)); g.lineTo(w - pad.r, Y(opts.baseline)); g.stroke(); g.setLineDash([]);
  }
  const grad = g.createLinearGradient(0, pad.t, 0, h);
  grad.addColorStop(0, up ? "rgba(48,209,88,.28)" : "rgba(255,69,58,.28)"); grad.addColorStop(1, "rgba(0,0,0,0)");
  g.beginPath();
  points.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])));
  g.lineTo(X(x1), h); g.lineTo(X(x0), h); g.closePath(); g.fillStyle = grad; g.fill();
  g.beginPath();
  points.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])));
  g.strokeStyle = line; g.lineWidth = 2; g.lineJoin = "round"; g.stroke();
  const lx = X(xs[xs.length - 1]), ly = Y(ys[ys.length - 1]);
  g.fillStyle = line; g.beginPath(); g.arc(lx, ly, 3.5, 0, 7); g.fill();
  g.fillStyle = col("--label2"); g.font = "11px " + col("--font");
  const f = opts.format || (v => v.toPrecision(4));
  g.textAlign = "left"; g.fillText(f(y1), pad.l + 2, 11); g.fillText(f(y0), pad.l + 2, h - 4);
};
