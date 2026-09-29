/* Billionaires Digest v3: pure helpers for the player dossier pop-up (assets/v2/dossier.js). ES5, no DOM.
   Exposes one global: BDDossierCore. Works on the site's data files as they are and never adds numbers of its
   own: every figure it returns is read from a file or is plain arithmetic on figures read from files (sums,
   a rank, shares × price). Tested with node --test (scripts/lib/v2-dossier-core.test.mjs).
   Game only: play money, no prizes. Not financial advice. */
(function(root){
  var MINUS = '−';
  function arr(x){ return Array.isArray(x) ? x : []; }
  function num(x){ return typeof x === 'number' && isFinite(x); }
  function has(o, k){ return !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k); }
  function str(x){ return x == null ? '' : String(x).trim(); }

  // "Co-founder, President and CEO (since 1993)" -> 1993; "Chairman since May 2004" -> 2004; none -> null.
  function roleSince(text){
    var m = /\bsince\s+(?:[A-Za-z]+\.?\s+)?(?:\d{1,2},?\s+)?(\d{4})\b/i.exec(str(text));
    if (!m) return null;
    var y = +m[1];
    return y >= 1800 && y <= 2100 ? y : null;
  }

  // The company a player is best known for in the game: the heaviest "controls" holding, else the heaviest one.
  // Returns { ticker, name } or null.
  function primaryHolding(p){
    var hs = arr(p && p.holdings).filter(function(h){ return h && h.ticker; });
    if (!hs.length) return null;
    function w(h){ return num(h.weight) ? h.weight : 0; }
    var ctl = hs.filter(function(h){ return h.tier === 'controls'; });
    var list = (ctl.length ? ctl : hs).slice().sort(function(a, b){ return w(b) - w(a); });
    return { ticker: String(list[0].ticker), name: str(list[0].name) || null };
  }

  // Market cap estimate: SEC share count × latest price. null unless both are positive numbers.
  function marketCap(shares, price){
    return num(shares) && num(price) && shares > 0 && price > 0 ? shares * price : null;
  }

  // Season totals over real (non-practice) week files: { slug: { total, days } }. Each week counts once.
  function seasonTotals(weeks){
    var out = {}, seen = {};
    arr(weeks).forEach(function(wk){
      if (!wk || wk.practice || !wk.week || seen[wk.week]) return;
      seen[wk.week] = 1;
      arr(wk.days).forEach(function(d){
        var m = wk.daily && wk.daily[d];
        if (!m) return;
        for (var s in m){
          if (!has(m, s) || !num(m[s])) continue;
          if (!out[s]) out[s] = { total: 0, days: 0 };
          out[s].total += m[s]; out[s].days++;
        }
      });
    });
    return out;
  }

  // Rank of slug's season total among the pool (1 = best; ties share a rank). Only pool members with a total count.
  // Returns { rank, of } or null when slug has no total.
  function seasonRank(totals, poolSlugs, slug){
    var mine = totals && totals[slug] ? totals[slug].total : null;
    if (!num(mine)) return null;
    var of = 0, better = 0, seen = {};
    arr(poolSlugs).concat([slug]).forEach(function(s){
      if (seen[s]) return; seen[s] = 1;
      var t = totals[s] ? totals[s].total : null;
      if (!num(t)) return;
      of++;
      if (t > mine) better++;
    });
    return { rank: better + 1, of: of };
  }

  // A player's week, day by day, from the week file (points that count) and the day files (the breakdown).
  // wk: week file; days: { 'YYYY-MM-DD': day file }; mult: captain multiplier (week file's captainMultiplier).
  // Returns { rows: [{ date, returnPct, pricePoints, insiderBuy, stories, points, captain }] (oldest first),
  //           returnSum, pricePoints, bonuses, points, captain, n, rules } or null when no day scored the player.
  function weekLog(wk, days, slug, mult){
    if (!wk) return null;
    var m = num(mult) ? mult : (num(wk.captainMultiplier) ? wk.captainMultiplier : null);
    var rows = [], rules = null;
    arr(wk.days).slice().sort().forEach(function(d){
      var pts = wk.daily && wk.daily[d] && num(wk.daily[d][slug]) ? wk.daily[d][slug] : null;
      var df = days && days[d], e = df && df.people && df.people[slug];
      if (df && df.rules && !rules) rules = df.rules;
      if (pts == null && !e) return;
      var b = (e && e.bonuses) || {};
      if (pts == null && e && num(e.points)) pts = e.points;
      rows.push({
        date: d,
        returnPct: e && num(e.returnPct) ? e.returnPct : null,
        pricePoints: e && num(e.pricePoints) ? e.pricePoints : null,
        insiderBuy: num(b.insiderBuy) ? b.insiderBuy : 0,
        stories: num(b.stories) ? b.stories : 0,
        points: pts,
        captain: pts != null && m != null ? Math.round(pts * m) : null
      });
    });
    if (!rows.length) return null;
    var out = { rows: rows, returnSum: null, pricePoints: null, bonuses: 0, points: null, captain: null, n: rows.length, rules: rules, mult: m };
    var allRet = rows.every(function(r){ return r.returnPct != null; });
    var allPp = rows.every(function(r){ return r.pricePoints != null; });
    rows.forEach(function(r){
      if (allRet) out.returnSum = (out.returnSum || 0) + r.returnPct;
      if (allPp) out.pricePoints = (out.pricePoints || 0) + r.pricePoints;
      out.bonuses += r.insiderBuy + r.stories;
      if (r.points != null) out.points = (out.points || 0) + r.points;
      if (r.captain != null) out.captain = (out.captain || 0) + r.captain;
    });
    return out;
  }

  // The scoring rule sentence, only from what the day file's rules say.
  function rulesText(rules){
    if (!rules || typeof rules !== 'object') return '';
    var parts = [];
    if (str(rules.pricePoints)) parts.push('Price points = ' + str(rules.pricePoints) + '.');
    if (num(rules.insiderBuy)) parts.push('Insider buy (Form 4 open-market purchase): +' + rules.insiderBuy + '.');
    if (num(rules.perStory)) parts.push('Each Digest story about them: +' + rules.perStory + '.');
    return parts.join(' ');
  }

  // Nicknames file, whatever its exact shape: { nicknames: { slug: 'x' | { nickname } } }, { people: … } or { slug: … }.
  function nickname(file, slug){
    if (!file || typeof file !== 'object' || !slug) return null;
    var maps = [file.nicknames, file.people, file];
    for (var i = 0; i < maps.length; i++){
      var m = maps[i], v;
      if (Array.isArray(m)){
        for (var j = 0; j < m.length; j++) if (m[j] && m[j].slug === slug){ v = m[j]; break; }
      } else if (has(m, slug)) v = m[slug];
      if (v == null) continue;
      var t = typeof v === 'string' ? v : (v && (v.nickname || v.nick || v.name));
      t = str(t);
      if (t) return t;
    }
    return null;
  }

  // ---- SEC financials (data/financials/index.json, built by scripts/build-financials.mjs) ----
  // Entry shape: { available, reason?, name, secUrl, sharesOutstanding: { value, asOf }, quarter: { start, end, form,
  // filed, revenue, netIncome, epsDiluted }, ttm: { start, end, revenue, netIncome, epsDiluted }, revenueGrowthQ,
  // revenueGrowthTTM, netMarginQ, netMarginTTM } (growth and margin in percent; growth is against a year earlier).
  function val(x){ if (num(x)) return x; if (x && typeof x === 'object' && num(x.value)) return x.value; return null; }
  function pick(o, keys){ for (var i = 0; i < keys.length; i++){ if (has(o, keys[i]) && o[keys[i]] != null) return o[keys[i]]; } return null; }
  // e: the ticker entry; o: its period; suffix: 'Q' or 'TTM' for the entry-level percent fields
  function period(e, o, suffix){
    if (!o || typeof o !== 'object') return null;
    var rev = val(pick(o, ['revenue']));
    var ni = val(pick(o, ['netIncome']));
    var margin = val(pick(o, ['netMarginPct']));
    if (margin == null) margin = val(pick(e, ['netMargin' + suffix]));
    if (margin == null && rev != null && ni != null && rev > 0) margin = ni / rev * 100;
    var growth = val(pick(o, ['revenueGrowthPct']));
    if (growth == null) growth = val(pick(e, ['revenueGrowth' + suffix]));
    return {
      start: str(pick(o, ['start'])) || null,
      end: str(pick(o, ['end'])) || null,
      form: str(pick(o, ['form'])) || null,
      filed: str(pick(o, ['filed'])) || null,
      revenue: rev,
      netIncome: ni,
      eps: val(pick(o, ['epsDiluted', 'dilutedEps'])),
      growth: growth,
      margin: margin
    };
  }
  // -> { ticker, name, secUrl, asOf, shares: { value, asOf } | null, quarter, ttm }, or null when the ticker is
  //    not in the file or is marked available: false.
  function financials(file, ticker){
    if (!file || typeof file !== 'object' || !ticker) return null;
    var map = file.tickers && typeof file.tickers === 'object' ? file.tickers : null;
    var e = map && has(map, ticker) ? map[ticker] : null;
    if (!e || typeof e !== 'object' || e.available === false) return null;
    var so = e.sharesOutstanding;
    var shares = val(so) != null ? { value: val(so), asOf: str(so && so.asOf) || null } : null;
    var url = str(e.secUrl);
    return {
      ticker: ticker, name: str(e.name) || null,
      secUrl: /^https?:\/\//i.test(url) ? url : null,
      asOf: str(file.generated) || null,
      shares: shares, quarter: period(e, e.quarter, 'Q'), ttm: period(e, e.ttm, 'TTM')
    };
  }

  // ---- CEOs (data/ceos/index.json) ----
  // The CEO entry for a slug, or null. file: { people: [{ slug, type: 'ceo', name, company, ticker, exchange, role,
  // roleSince, sector, secCik, bio, sources: [{ title, url, date }] }] }.
  function ceoEntry(file, slug){
    var list = arr(file && file.people);
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].slug === slug) return list[i];
    return null;
  }
  // "Chair and CEO · Advanced Micro Devices, Inc." (either part may be missing; '' when both are).
  function ceoRoleLine(c){ return c ? [str(c.role), str(c.company)].filter(Boolean).join(' · ') : ''; }
  // The company's filings: the SEC EDGAR company page when the entry has a 10-digit CIK, else its first https source.
  // Returns { url, label } or null.
  function ceoFilingsLink(c){
    if (!c) return null;
    var cik = str(c.secCik);
    if (/^\d{10}$/.test(cik)) return { url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=' + cik + '&owner=include&count=40', label: 'SEC filings' };
    var src = arr(c.sources).filter(function(x){ return x && /^https:\/\//i.test(str(x.url)); })[0];
    return src ? { url: str(src.url), label: str(src.title) || 'Source' } : null;
  }
  // Sources with an https url only, as { title, url, date }.
  function ceoSources(c){
    return arr(c && c.sources).filter(function(x){ return x && /^https:\/\//i.test(str(x.url)); })
      .map(function(x){ return { title: str(x.title) || 'Source', url: str(x.url), date: str(x.date) || null }; });
  }

  // ---- formatting (true minus sign) ----
  function money(n){
    if (!num(n)) return '—';
    var a = Math.abs(n), s = n < 0 ? MINUS + '$' : '$', v, u;
    if (a >= 1e12){ v = a / 1e12; u = 'T'; }
    else if (a >= 1e9){ v = a / 1e9; u = 'B'; }
    else if (a >= 1e6){ v = a / 1e6; u = 'M'; }
    else if (a >= 1e3){ v = a / 1e3; u = 'K'; }
    else return s + (Math.round(a * 100) / 100).toFixed(a % 1 ? 2 : 0);
    return s + (v >= 100 ? v.toFixed(0) : (v >= 10 ? v.toFixed(1) : v.toFixed(2))) + u;
  }
  function eps(n){ return num(n) ? (n < 0 ? MINUS : '') + '$' + Math.abs(n).toFixed(2) : '—'; }
  function pct(x, digits){
    if (!num(x)) return '—';
    var d = digits == null ? 1 : digits, a = Math.abs(x).toFixed(d);
    if (+a === 0) return (0).toFixed(d) + '%';
    return (x > 0 ? '+' : MINUS) + a + '%';
  }
  function plainPct(x, digits){
    if (!num(x)) return '—';
    var d = digits == null ? 1 : digits;
    return (x < 0 ? MINUS : '') + Math.abs(x).toFixed(d) + '%';
  }
  function signed(n){ return !num(n) ? '—' : (n > 0 ? '+' + n : (n < 0 ? MINUS + Math.abs(n) : '0')); }

  root.BDDossierCore = {
    roleSince: roleSince, primaryHolding: primaryHolding, marketCap: marketCap,
    seasonTotals: seasonTotals, seasonRank: seasonRank, weekLog: weekLog, rulesText: rulesText,
    nickname: nickname, financials: financials,
    ceoEntry: ceoEntry, ceoRoleLine: ceoRoleLine, ceoFilingsLink: ceoFilingsLink, ceoSources: ceoSources,
    money: money, eps: eps, pct: pct, plainPct: plainPct, signed: signed
  };
})(typeof window !== 'undefined' ? window : globalThis);
