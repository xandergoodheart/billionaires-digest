/* Billionaires Digest v3: pure helpers for "why to watch" facts, shared by the home page's Players to watch flip
   cards (assets/v2/home.js) and the Draft room's scouting drawer (assets/v2/scout.js). ES5, no DOM, no fetches.
   Global: BDScoutCore. Tested with node --test (scripts/lib/v2-scout-core.test.mjs).
   Every figure comes from the site's own data files; nothing here invents a number or a sentence.
   Game only: play money, no prizes. Not financial advice. */
(function(root){
  function arr(x){ return Array.isArray(x) ? x : []; }
  function num(x){ return typeof x === 'number' && isFinite(x); }
  function str(x){ return x == null ? '' : String(x).replace(/\s+/g, ' ').trim(); }
  function has(o, k){ return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function safeUrl(u){ return typeof u === 'string' && /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : null; }

  // Insider buy: the newest day on or after `cut` (YYYY-MM-DD) where the player's day entry scored an insider-buy
  // bonus (SEC Form 4 code P, see scripts/lib/fantasy.mjs). days: { date: dayFile }. Returns the date or null.
  function buyDay(days, slug, cut){
    var best = null;
    Object.keys(days || {}).forEach(function(d){
      var f = days[d], e = f && f.people && f.people[slug];
      if (d >= cut && e && e.bonuses && e.bonuses.insiderBuy > 0 && (!best || d > best)) best = d;
    });
    return best;
  }

  // Newest SEC Form 4 with an open-market purchase (code P) filed on or after `cut` in a by-person filings file.
  function buyFiling(data, cut){
    var hit = null;
    arr(data && data.filings).forEach(function(f){
      if (!f || !f.form4 || !f.filed || f.filed < cut || !safeUrl(f.url)) return;
      if (!arr(f.form4.transactions).some(function(t){ return t && t.code === 'P'; })) return;
      if (!hit || f.filed > hit.filed) hit = f;
    });
    return hit;
  }

  // Earnings: the earliest exact-day "Earnings & events" calendar item naming this person, in the current or next
  // scoring week. weeks: the fantasy index's week list ({ week, start, end }); curId: the current week id.
  // Returns { e: event, thisWeek } or null.
  function earnings(cal, weeks, curId, slug){
    var list = arr(weeks), i = -1;
    for (var k = 0; k < list.length; k++) if (list[k] && list[k].week === curId){ i = k; break; }
    if (!cal || i < 0) return null;
    var cur = list[i], nxt = list[i + 1], from = cur.start, to = nxt ? nxt.end : cur.end, hit = null;
    arr(cal.events).forEach(function(e){
      if (!e || e.type !== 'events' || e.approx || e.precision !== 'day' || !/\b(results|earnings)\b/i.test(e.title || '')) return;
      if (e.date < from || e.date > to) return;
      if (!arr(e.people).some(function(p){ return p && p.slug === slug; })) return;
      if (!hit || e.date < hit.date) hit = e;
    });
    return hit ? { e: hit, thisWeek: hit.date <= cur.end } : null;
  }

  // The last n scored trading days across week files (practice weeks left out), oldest first.
  function recentDates(wks, n){
    var ds = {};
    arr(wks).forEach(function(w){ if (w && !w.practice) arr(w.days).forEach(function(d){ ds[d] = 1; }); });
    return Object.keys(ds).sort().slice(-(n || 10));
  }
  // A player's daily points on those dates: [{ d, v }] with v null when no week file has a score for that day.
  function chartRows(wks, dates, slug){
    return arr(dates).map(function(d){
      var v = null;
      arr(wks).forEach(function(w){ if (v == null && w && w.daily && w.daily[d] && num(w.daily[d][slug])) v = w.daily[d][slug]; });
      return { d: d, v: v };
    });
  }

  // "Why the stock moved": the newest entry in data/fantasy/movers.json (keyed TICKER@DATE) for one of the player's
  // tickers on one of the given dates, with a sentence and a source link. Prefers entries that name the player.
  function latestMover(movers, tickers, dates, slug){
    var hit = null, tk = {}, ds = {};
    arr(tickers).forEach(function(t){ if (t) tk[t] = 1; });
    arr(dates).forEach(function(d){ ds[d] = 1; });
    Object.keys(movers || {}).forEach(function(key){
      var m = movers[key];
      if (!m || !str(m.why) || !safeUrl(m.sourceUrl) || !has(tk, m.ticker) || !has(ds, m.date)) return;
      var mine = arr(m.players).indexOf(slug) >= 0 ? 1 : 0;
      if (!hit || m.date > hit.m.date || (m.date === hit.m.date && mine > hit.mine)) hit = { m: m, mine: mine };
    });
    return hit ? hit.m : null;
  }

  // The first sentences of a text, up to max characters (a sentence end is . ! ? then a space and a capital, so
  // "$9.2" and "Sept. 25" never split). Falls back to a word cut with an ellipsis.
  function firstSentences(t, max){
    t = str(t);
    if (t.length <= max) return t;
    var re = /[.!?]["'”’)]?\s+(?=[A-Z“"])/g, m, cut = -1;
    while ((m = re.exec(t))){
      var end = m.index + m[0].length;
      if (/\b(?:Mr|Ms|Mrs|Dr|St|Inc|Co|Corp|Jr|Sr|U\.S|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\.$/.test(t.slice(0, m.index + 1))) continue;
      if (end > max) break;
      cut = end;
    }
    if (cut > 0) return t.slice(0, cut).trim();
    var sp = t.lastIndexOf(' ', max);
    return t.slice(0, sp > 0 ? sp : max).trim() + '…';
  }

  // "Who they are" from text already on file (never a new bio):
  //   CEOs: the first one or two sentences of the bio in data/ceos/index.json, with its first source;
  //   billionaires: the role (its first clause when long) and company of the first entry in the profile's "controls" (data/people/<slug>.json),
  //   with that entry's source. Company names are cut at the first " — " (the figures after it stay on the profile).
  // Returns { text, url } (url may be null) or null when there is nothing on file.
  function whoLine(profile, ceo){
    if (ceo && str(ceo.bio)){
      var src = arr(ceo.sources).filter(function(s){ return s && safeUrl(s.url); })[0];
      return { text: firstSentences(ceo.bio, 240), url: src ? src.url : null };
    }
    var c = profile && arr(profile.controls).filter(function(e){ return e && str(e.name); })[0];
    if (!c) return null;
    var co = str(c.name).split(' — ')[0].replace(/[\s,;:]+$/, ''), role = str(c.role);
    if (role.length > 60) role = role.split('; ')[0];   // keep the first clause of a long role (the rest stays on the profile)
    var text = role ? role + ' · ' + co : co;
    return { text: /[.!?]$/.test(text) ? text : text + '.', url: safeUrl(c.source) };
  }

  // Step through a list of slugs: the slug delta places away (no wrap), or null at either end / when not found.
  function step(slugs, slug, delta){
    var i = arr(slugs).indexOf(slug);
    if (i < 0) return null;
    var j = i + delta;
    return j >= 0 && j < slugs.length ? slugs[j] : null;
  }

  // SVG path for one bar: 2px rounded at the data end, square at the zero baseline.
  function barPath(x, w, y0, y1){
    var r = Math.min(2, w / 2, Math.abs(y1 - y0));
    if (y1 < y0) return 'M' + x + ',' + y0 + 'V' + (y1 + r) + 'Q' + x + ',' + y1 + ' ' + (x + r) + ',' + y1 + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y1 + ' ' + (x + w) + ',' + (y1 + r) + 'V' + y0 + 'Z';
    return 'M' + x + ',' + y0 + 'V' + (y1 - r) + 'Q' + x + ',' + y1 + ' ' + (x + r) + ',' + y1 + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y1 + ' ' + (x + w) + ',' + (y1 - r) + 'V' + y0 + 'Z';
  }

  root.BDScoutCore = {
    buyDay: buyDay, buyFiling: buyFiling, earnings: earnings, recentDates: recentDates, chartRows: chartRows,
    latestMover: latestMover, firstSentences: firstSentences, whoLine: whoLine, step: step, barPath: barPath
  };
})(typeof window !== 'undefined' ? window : globalThis);
