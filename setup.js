// Parse a pasted Desk setup link (D63). Returns {t, d} or throws an Error with a friendly message.
// Never logs or sends the values anywhere.
(function (root) {
  const SAFE = /^[A-Za-z0-9_-]+$/;
  function parse(text) {
    const s = String(text || "").trim();
    if (!s) throw new Error("The field is empty. Paste the link from Telegram first.");
    const i = s.indexOf("#");
    if (i < 0) throw new Error("That doesn't look like a Desk setup link (it has no #t=… part). Send /link to your bot and copy the link again.");
    const p = new URLSearchParams(s.slice(i + 1).split(/\s/)[0]);
    const t = p.get("t") || "", d = p.get("d") || "";
    if (!t || !d) throw new Error("The link is incomplete. Copy the whole link from Telegram, including the end.");
    if (!SAFE.test(t) || t.length < 32 || t.length > 128) throw new Error("The access code in the link is invalid. Copy the link again.");
    if (!SAFE.test(d) || d.length < 32 || d.length > 64) throw new Error("The data code in the link is invalid. Copy the link again.");
    return { t: t, d: d };
  }
  root.deskParseSetup = parse;
  if (typeof module !== "undefined" && module.exports) module.exports = { parse: parse };
})(typeof window !== "undefined" ? window : globalThis);
