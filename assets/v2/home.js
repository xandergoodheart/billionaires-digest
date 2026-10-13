/* Billionaires Digest v3: the front door (index.html), sports-network homepage layout. ES5, IIFE, UI only.
   Real data only, each block on its own (one failing never blanks the others):
     hero banner          <- static art (assets/art/realistic/hero-fantasy.webp, no people) + link to the Draft room
     your franchise       <- BDFantasyStore (same browser team as team.html): your team's real points vs the S&P 500;
                             no team -> "You haven't drafted yet" + the week's top matchup from The Book
                             (data/book/index.json + week file)
     how to play          <- cap, picks and captain multiplier from the draft week file (BDFantasyCore as fallback)
     top story            <- digest.json lede (headline, dek, source link, Read today's edition; full edition at news.html)
     From the Digest      <- up to 3 more stories from digest.json (hidden when there are none)
     Players to watch     <- five flip cards under the hero:
                             a mixed watch list (top scorers, earnings, insider buy, value) from BDWeekCore scores,
                             BDFantasyStore stats, data/insights/calendar.json; the back loads a 10-day chart and
                             reasons lazily (see "players to watch" below); + Draft opens draft.html?add=<slug>
     Top Headlines        <- digest.json stories (5) + All news
     Share your team      <- assets/v2/team-share.js (canvas image, made in the browser), only with a saved or drafted team of 5
     Next Moves odds      <- data/moves/markets.json (+ this browser's practice prices, bd-moves-v1)
   Old links: index.html#person=<slug> is forwarded to news.html by a one-line script in the page head.
   Play money only, no prizes, not financial advice. */
(function(){
  var F = window.BDFantasyStore, C = window.BDFantasyCore, W = window.BDWeekCore;
  var el = BD.el, arr = BD.arr;
  var MINUS = '−';
  var $ = function(id){ return document.getElementById(id); };

  // ---- small helpers ----
  function clear(n){ while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function link(cls, text, href){ var a = el('a', cls, text); a.href = href; return a; }
  function signedTxt(n){ return n > 0 ? '+' + n : (n < 0 ? MINUS + Math.abs(n) : '0'); }
  function plainTxt(n){ return n < 0 ? MINUS + Math.abs(n) : String(n); }
  function numCls(n){ return n > 0 ? 'v2-pos' : (n < 0 ? 'v2-neg' : 'v2-zero'); }
  // portraits: only plain site-relative paths from window.BDPortraits (assets/v2/portraits.js)
  function safePath(u){ return typeof u === 'string' && /^[A-Za-z0-9_\-./]+$/.test(u) && u.indexOf('..') < 0 ? u : null; }
  function portraitSrc(slug){
    var P = window.BDPortraits, p = P && Object.prototype.hasOwnProperty.call(P, slug) ? P[slug] : null;
    return p ? safePath(p.img) : safePath(window.BDPortraitFallback);
  }
  function avatar(p){
    var pic = portraitSrc(p.slug);
    var a = el('span', 'v2-av' + (pic ? ' v2-av--pic' : ''), pic ? '' : BD.initials(p.name));
    a.setAttribute('data-sector', BD.sectorSlug(p.sector || 'Other'));
    a.setAttribute('aria-hidden', 'true');
    if (pic){ var im = el('img'); im.src = pic; im.alt = ''; im.loading = 'lazy'; a.appendChild(im); }
    return a;
  }
  function nyFmt(ms, opts){
    try { opts.timeZone = 'America/New_York'; return new Intl.DateTimeFormat('en-US', opts).format(new Date(ms)); }
    catch (e) { return new Date(ms).toUTCString(); }
  }
  function lockText(ms){ return nyFmt(ms, { weekday: 'short' }) + ' ' + nyFmt(ms, { hour: 'numeric', minute: '2-digit' }) + ' ET'; }
  function surname(name){
    var ws = String(name || '').replace(/\s*&\s*family\s*$/i, '').trim().split(/\s+/);
    return ws[ws.length - 1] || '';
  }
  function odds(n){ n = Number(n); if (!isFinite(n)) return ''; return n > 0 ? '+' + n : (n < 0 ? MINUS + Math.abs(n) : 'EVEN'); }
  function firstSentences(t, max){
    t = String(t || '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    // sentence ends: . ! ? followed by a space and a capital letter (so "$9.2" and "Sept. 25" never split)
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
  var liveT = null;
  function say(t){ var n = $('live'); if (!n) return; n.textContent = ''; clearTimeout(liveT); liveT = setTimeout(function(){ n.textContent = t; }, 40); }

  // ---- which team this browser has (same rules as team.html, plus an unsaved working draft) ----
  function view(){
    var S = F.state, wk = S.sbWk, team = wk ? F.matchTeam(wk) : null;
    if (team){
      var res = F.teamWeek(wk, team);
      return { mode: 'scoring', wk: wk, team: team, res: res, any: res.scored.length > 0 };
    }
    var saved = F.store().teams[S.draftWeek];
    if (saved && saved.picks && S.draftWk) return { mode: 'upcoming', wk: S.draftWk, weekId: S.draftWeek, team: saved, res: null, any: false };
    var d = F.store().draft;
    if (d && arr(d.picks).length) return { mode: 'draft', wk: null, team: { picks: arr(d.picks), captain: d.captain || null }, res: null, any: false };
    return { mode: 'none', wk: null, team: null, res: null, any: false };
  }
  function bench(v){ return v.mode === 'scoring' && v.any && v.wk.benchmarks && typeof v.wk.benchmarks.spy === 'number' ? v.wk.benchmarks.spy : null; }
  function result(v){
    if (v.mode === 'draft') return 'Draft in progress';
    if (v.mode === 'upcoming') return 'Ready for ' + F.fmt.weekTitle(v.weekId);
    if (!v.any) return 'Waiting for the first scores';
    var bm = bench(v);
    if (bm == null) return 'No benchmark yet';
    var diff = v.res.total - bm, over = F.weekOver(v.wk);
    if (diff > 0) return (over ? 'Won by ' : 'Leading by ') + diff;
    if (diff < 0) return (over ? 'Lost by ' : 'Trailing by ') + Math.abs(diff);
    return 'Tied';
  }
  function status(v){
    if (v.mode === 'draft') return 'Not saved';
    if (v.mode === 'upcoming') return 'Locks ' + lockText(C.weekInfo(v.weekId).locksAt);
    if (v.wk.practice) return F.weekOver(v.wk) ? 'Practice · Final' : 'Practice';
    if (F.weekOver(v.wk)) return 'Final';
    return v.any ? 'Live · thru ' + F.fmt.dayLabel(v.res.scored[v.res.scored.length - 1]) : 'Live';
  }
  function teamName(){ var me = F.me(); return me && me.nickname ? me.nickname : 'Your team'; }
  function captainName(v){
    var c = v.team && v.team.captain, p = c ? F.person(c) : null;
    return p && p.name ? p.name : null;
  }

  // one side of the scoreboard: name, sub line, big score (null -> dash)
  function side(cls, name, sub, score, win){
    var s = el('div', 'hm-sb__side ' + cls + (win ? ' is-win' : ''));
    var t = el('div', 'hm-sb__team');
    t.appendChild(el('span', 'hm-sb__name', name));
    if (sub) t.appendChild(el('span', 'hm-sb__sub', sub));
    s.appendChild(t);
    s.appendChild(el('span', 'hm-sb__score num', score == null ? '—' : score));
    return s;
  }

  // ---- featured scoreboard: your team vs S&P 500 ----
  function renderTeamBoard(v){
    var box = clear($('hmteam'));
    box.removeAttribute('aria-busy');
    var total = v.any ? v.res.total : null, bm = bench(v);
    var leftWin = total != null && bm != null && total > bm, rightWin = total != null && bm != null && bm > total;
    var head = el('div', 'hm-sb__head');
    head.appendChild(el('span', 'hm-sb__kick', 'Your franchise' + (v.mode === 'scoring' ? ' · ' + F.fmt.weekTitle(v.wk.week) : v.mode === 'upcoming' ? ' · ' + F.fmt.weekTitle(v.weekId) : '')));
    head.appendChild(link('hm-sb__more', 'Scores', 'scores.html'));
    box.appendChild(head);
    var sb = el('div', 'hm-sb');
    var cap = captainName(v);
    sb.appendChild(side('hm-sb__side--a', teamName(), v.team.picks.length + ' of ' + C.PICKS + ' picked' + (cap ? ' · C ' + surname(cap) : ''), total == null ? null : plainTxt(total), leftWin));
    var mid = el('div', 'hm-sb__mid');
    mid.appendChild(el('span', 'hm-sb__status' + (v.mode === 'scoring' && !F.weekOver(v.wk) && !v.wk.practice ? ' is-live' : ''), status(v)));
    mid.appendChild(el('span', 'hm-sb__vs', 'vs'));
    sb.appendChild(mid);
    sb.appendChild(side('hm-sb__side--b', 'S&P 500', 'Benchmark', bm == null ? null : plainTxt(bm), rightWin));
    box.appendChild(sb);
    var foot = el('div', 'hm-sb__foot');
    var res = el('p', 'hm-sb__result', result(v));
    if (total != null) res.appendChild(el('span', 'hm-sb__pts', 'Real points so far this week: ' + plainTxt(total)));
    foot.appendChild(res);
    var row = el('div', 'hm-sb__btns');
    if (v.mode === 'draft'){
      row.appendChild(link('v2-btn v2-btn--primary v2-btn--sm', 'Finish your draft', 'draft.html'));
      row.appendChild(link('v2-btn v2-btn--ghost v2-btn--sm', 'Go to my team', 'team.html'));
    } else {
      row.appendChild(link('v2-btn v2-btn--primary v2-btn--sm', 'Go to my team', 'team.html'));
      row.appendChild(link('v2-btn v2-btn--ghost v2-btn--sm', 'Edit your starting five', 'draft.html'));
    }
    foot.appendChild(row);
    box.appendChild(foot);
    var sh = shareFor(v);
    if (sh){ row.appendChild(sh.toggle); box.appendChild(sh.panel); }
    say(teamName() + '. ' + (total == null ? 'No team points yet.' : 'Team total ' + plainTxt(total) + ' fantasy points.') + ' ' + result(v) + '.');
  }

  // ---- Share your team: only with a saved or drafted team of 5 (assets/v2/team-share.js) ----
  function shareFor(v){
    var picks = v.team ? arr(v.team.picks) : [];
    if (!window.BDTeamShare || picks.length < C.PICKS) return null;
    var pts = v.mode === 'scoring' && v.any ? v.res.bySlug || {} : null;
    var weekId = v.mode === 'scoring' ? v.wk.week : (v.mode === 'upcoming' ? v.weekId : F.state.draftWeek);
    var start = null;
    if (!(v.mode === 'scoring' && v.any)){
      var from = v.team.lateFrom || (weekId ? C.weekInfo(weekId).start : null);
      if (from) start = F.fmt.dayLabel(from);
    }
    return window.BDTeamShare.build({
      week: weekId ? F.fmt.weekTitle(weekId) : '',
      total: v.mode === 'scoring' && v.any ? v.res.total : null,
      startDay: start,
      picks: picks.map(function(slug){
        var p = F.person(slug);
        return { name: p && p.name ? p.name : slug, captain: slug === v.team.captain, pts: pts && typeof pts[slug] === 'number' ? pts[slug] : null };
      })
    });
  }

  // The Book is hidden from the menus (scripts/lib/nav.mjs MENU_HIDDEN / BOOK_HIDDEN): no Book matchup or
  // "All matchups" link here either. Set to false together with nav.mjs to bring it back.
  var BOOK_HIDDEN = true;

  // ---- featured scoreboard without a team: the week's top matchup on The Book ----
  function renderBookBoard(book){
    var box = clear($('hmteam'));
    box.removeAttribute('aria-busy');
    var ev = book && arr(book.events).filter(function(e){ return e && e.type === 'h2h' && e.params && e.params.a && e.params.b; })[0];
    var head = el('div', 'hm-sb__head');
    head.appendChild(el('span', 'hm-sb__kick', 'Your franchise'));
    head.appendChild(link('hm-sb__more', 'Rules', 'play-terms.html'));
    box.appendChild(head);
    var empty = el('div', 'hm-fr__empty');
    empty.appendChild(el('h3', 'hm-fr__h', "You haven't drafted yet"));
    empty.appendChild(el('p', 'hm-fr__p', 'Draft five of the world\'s richest and score on their real stock moves. Nothing is saved in this browser yet.'));
    var row = el('div', 'hm-sb__btns');
    row.appendChild(link('v2-btn v2-btn--primary v2-btn--sm', 'Draft your five', 'draft.html'));
    row.appendChild(link('v2-btn v2-btn--ghost v2-btn--sm', 'Lucky five', 'draft.html#lucky'));
    empty.appendChild(row);
    box.appendChild(empty);
    if (ev && !BOOK_HIDDEN){
      var model = book.model || {};
      var mk = function(slug){
        var ml = arr(ev.selections).filter(function(s){ return s.market === 'ml' && s.person === slug; })[0];
        var nm = model[slug] && model[slug].name ? model[slug].name : slug;
        return { name: nm, sector: model[slug] && model[slug].sector, odds: ml ? odds(ml.americanOdds) : null };
      };
      var a = mk(ev.params.a), b = mk(ev.params.b);
      var at = Date.parse(book.locksAt), pre = isFinite(at) && Date.now() < at;
      var bh = el('div', 'hm-sb__head hm-fr__book');
      bh.appendChild(el('span', 'hm-sb__kick', 'Top matchup this week · The Book'));
      bh.appendChild(link('hm-sb__more', 'All matchups', 'book.html'));
      box.appendChild(bh);
      var sb = el('div', 'hm-sb hm-sb--odds hm-sb--last');
      sb.appendChild(side('hm-sb__side--a', surname(a.name), a.sector || '', a.odds, false));
      var mid = el('div', 'hm-sb__mid');
      mid.appendChild(el('span', 'hm-sb__status', pre ? lockText(at) : 'This week'));
      mid.appendChild(el('span', 'hm-sb__vs', 'Moneyline'));
      sb.appendChild(mid);
      sb.appendChild(side('hm-sb__side--b', surname(b.name), b.sector || '', b.odds, false));
      box.appendChild(sb);
    }
    say("Play the billionaires. You haven't drafted yet.");
  }
  function loadBook(){
    return BD.getJson('data/book/index.json').then(function(idx){
      var w = idx && idx.latest;
      if (!w || !/^\d{4}-W\d{2}$/.test(w)) return null;
      return BD.getJson('data/book/' + w + '.json');
    });
  }
  function boardFail(){
    var box = clear($('hmteam'));
    box.removeAttribute('aria-busy');
    box.appendChild(el('p', 'hm-sb__result', 'The game data is not available right now, so your team cannot show here.'));
    var row = el('div', 'hm-sb__btns');
    row.appendChild(link('v2-btn v2-btn--primary v2-btn--sm', 'Draft your five', 'draft.html'));
    row.appendChild(link('v2-btn v2-btn--ghost v2-btn--sm', 'Go to my team', 'team.html'));
    box.appendChild(row);
  }

  // ---- top story, story grid, headlines (digest.json) ----
  function ledeStory(d){
    var st = arr(d.stories).filter(function(s){ return s && s.headline; });
    var h = d.lede && d.lede.headline;
    for (var i = 0; i < st.length; i++) if (st[i].headline === h) return st[i];
    return null;
  }
  function renderLede(d){
    var box = clear($('ledebody'));
    var lede = d && d.lede && d.lede.headline ? d.lede : null;
    var top = el('div', 'hm-lede__top');
    top.appendChild(el('span', 'hm-lede__kick', 'Top story'));
    if (d && d.date) top.appendChild(el('span', 'hm-lede__date', String(d.date)));
    box.appendChild(top);
    var h = el('h2', 'hm-lede__h'); h.id = 'ledeh';
    if (lede) h.appendChild(link(null, lede.headline, 'news.html')); else h.textContent = "Today's edition";
    box.appendChild(h);
    if (!d){ box.appendChild(el('p', 'hm-lede__dek', "Today's edition could not load here. Open the news page to read it.")); box.appendChild(link('v2-btn v2-btn--primary', 'Go to News', 'news.html')); return; }
    if (lede && lede.dek) box.appendChild(el('p', 'hm-lede__dek', lede.dek));
    if (!lede) box.appendChild(el('p', 'hm-lede__dek', 'The morning edition is on the press.'));
    // the source of the story behind the top story (every fact links its source)
    var s = ledeStory(d), u = s ? BD.safeUrl(s.url) : null;
    if (u && s.source){
      var src = el('p', 'hm-lede__src');
      src.appendChild(document.createTextNode('Source: '));
      var a = link(null, s.source, u); a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.appendChild(el('span', 'v2-sr', ' (opens in a new tab)'));
      src.appendChild(a);
      box.appendChild(src);
    }
    box.appendChild(link('v2-btn v2-btn--primary hm-lede__btn', "Read today's edition", 'news.html'));
  }
  // From the Digest: up to 3 of today's stories besides the top story (headline + one line); hidden when there are none
  function renderStories(d){
    var ul = clear($('storygrid')), lede = d ? ledeStory(d) : null, foot = clear($('storyfoot'));
    var st = d ? arr(d.stories).filter(function(s){ return s && s.headline && s !== lede; }) : [];
    $('digestsec').hidden = !!d && !st.length;
    foot.hidden = true;
    if (!st.length){ if (!d){ var li0 = el('li', 'hm-story'); li0.appendChild(el('p', 'v2-msg', 'Stories could not load right now.')); ul.appendChild(li0); } return; }
    st.slice(0, 3).forEach(function(s, i){
      var li = el('li', 'hm-story');
      var k = el('span', 'hm-story__kick');
      k.appendChild(el('span', 'hm-story__n', (i < 9 ? '0' : '') + (i + 1)));
      k.appendChild(document.createTextNode([s.sector, s.who].filter(Boolean).join(' · ')));
      li.appendChild(k);
      var h = el('h3', 'hm-story__h');
      h.appendChild(link(null, s.headline, 'news.html'));
      li.appendChild(h);
      if (s.move) li.appendChild(el('p', 'hm-story__p', firstSentences(s.move, 150)));
      if (s.source) li.appendChild(el('span', 'hm-story__src', s.source));
      ul.appendChild(li);
    });
    var iso = BD.isoFromLong ? BD.isoFromLong(d.date) : null;
    if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)){
      foot.appendChild(link(null, 'Read the ' + BD.monDay(iso) + ' edition', 'editions/' + iso + '/'));
      foot.hidden = false;
    }
  }
  function renderHeadlines(d){
    var ul = clear($('headlines'));
    var st = d ? arr(d.stories).filter(function(s){ return s && s.headline; }) : [];
    if (!st.length){ ul.appendChild(el('li', 'v2-msg', d ? 'No headlines yet.' : 'Headlines could not load right now.')); return; }
    st.slice(0, 5).forEach(function(s){
      var li = el('li');
      li.appendChild(link(null, s.headline, 'news.html'));
      ul.appendChild(li);
    });
  }

  // ---- Next Moves: open markets from data/moves/markets.json ----
  // "Yes" is this browser's practice price (moves.html keeps practice trades in bd-moves-v1, LMSR); with no practice
  // trades it equals the starting odds.
  function practiceState(){
    try { var s = JSON.parse(window.localStorage.getItem('bd-moves-v1') || 'null'); return s && s.v === 1 && s.mk ? s.mk : {}; }
    catch (e) { return {}; }
  }
  function clampP(p){ p = Number(p); if (!(p > 0 && p < 1)) p = 0.5; return Math.min(0.99, Math.max(0.01, p)); }
  function pctN(p){ return Math.min(99, Math.max(1, Math.round(p * 100))); }
  function renderMoves(data){
    var box = clear($('d-moves'));
    if (!data){ box.appendChild(el('p', 'v2-msg', 'Could not load the markets right now.')); return; }
    var now = Date.now(), mk = practiceState();
    var open = arr(data.markets).filter(function(m){ return m && m.question && m.status !== 'closed' && new Date(m.closes_at).getTime() > now; });
    if (!open.length){ box.appendChild(el('p', 'v2-msg', 'No markets are open right now. New ones open as fresh SEC filings come in.')); return; }
    var top = open.map(function(m, i){ return { m: m, i: i, t: new Date(m.closes_at).getTime() }; })
      .sort(function(a, b){ return a.t - b.t || a.i - b.i; }).slice(0, 3);
    var ul = el('ul', 'hm-mv');
    top.forEach(function(x){
      var m = x.m, b = +m.b || 100, start = clampP(m.startProb), s = mk[m.slug];
      var nowP = s && typeof s.qy === 'number' && typeof s.qn === 'number' ? 1 / (1 + Math.exp((s.qn - s.qy) / b)) : start;
      var y = pctN(nowP), n = 100 - y;
      var li = el('li', 'hm-mv__i');
      li.appendChild(link('hm-mv__q', m.question, 'moves.html'));
      var row = el('div', 'hm-mv__odds');
      var yes = el('span', 'hm-mv__opt'); yes.appendChild(el('span', null, 'Yes')); yes.appendChild(el('strong', 'num', y + '%'));
      var no = el('span', 'hm-mv__opt'); no.appendChild(el('span', null, 'No')); no.appendChild(el('strong', 'num', n + '%'));
      row.appendChild(yes); row.appendChild(no);
      li.appendChild(row);
      li.appendChild(el('span', 'hm-mv__close', 'Closes ' + nyFmt(x.t, { month: 'short', day: 'numeric' })));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    box.appendChild(el('p', 'hm-mv__fine', open.length + (open.length === 1 ? ' open market' : ' open markets') + '. Settled only from public SEC filings. Play-money coins, no cash value.'));
  }

  // ---- players to watch: five flip cards ----
  // The pick: the top 2 scorers (this scoring week, or the last scored day), then the best scorer with earnings in the
  // current or next scoring week, with an insider buy in the last 14 days, and the best value pick; the rest are the
  // next top scorers, so there are always 5 different players. Every reason comes from existing data only:
  //   scores, avg/day, insider-buy bonus    <- BDFantasyStore (week + day files it already loaded)
  //   earnings                              <- data/insights/calendar.json (fetched with the page, ~47 KB)
  //   chart + best day (on the first flip)  <- week files' daily points (+1 older week file), the best day's day file
  //   insider-buy filing link (on flip)     <- data/filings/by-person/<slug>.json (only for a card with a buy)
  //   in the news (on flip)                 <- digest.json (already loaded for the lede)
  var CHART_DAYS = 10;
  var DIGEST = null, CAL = null;
  var calP = BD.getJson('data/insights/calendar.json').then(function(c){ CAL = c; return c; }, function(){ return null; });
  var winP = null, dayP = {}, filP = {};
  function today(){ return C.nyDate(F.now()); }
  function capOf(slug, wk){
    var sal = F.salaries(), ws = (wk && wk.salaries) || {};
    return typeof sal[slug] === 'number' ? sal[slug] : (typeof ws[slug] === 'number' ? ws[slug] : null);
  }
  function avgOf(slug){ var a = F.stat(slug).avg; return typeof a === 'number' && isFinite(a) ? Math.round(a) : null; }
  function indexWeek(id){ var w = arr(F.state.index && F.state.index.weeks); for (var i = 0; i < w.length; i++) if (w[i].week === id) return { w: w[i], i: i, all: w }; return null; }
  function dayParts(d){ var s = F.fmt.dayLabel(d), k = s.indexOf(' '); return { wd: s.slice(0, k), md: s.slice(k + 1), full: s }; }
  // hot streak: positive on at least 4 of the last 5 trading days (the store's 5-day series)
  function hotCount(slug){ var n = 0; arr(F.stat(slug).series).forEach(function(v){ if (typeof v === 'number' && v > 0) n++; }); return n; }
  // insider buy: a scored insider-buy bonus (Form 4 code P, see scripts/lib/fantasy.mjs) on a day in the last 14 days
  function buyDay(slug){
    var cut = C.addDays(today(), -14), best = null, days = F.state.days || {};
    Object.keys(days).forEach(function(d){
      var e = days[d] && days[d].people && days[d].people[slug];
      if (d >= cut && e && e.bonuses && e.bonuses.insiderBuy > 0 && (!best || d > best)) best = d;
    });
    return best;
  }
  // earnings: an exact-day "Earnings & events" calendar item for this person in the current or next scoring week
  function earnings(slug){
    var ix = F.state.index, cur = indexWeek((F.state.sbWk && F.state.sbWk.week) || (ix && ix.currentWeek));
    if (!CAL || !cur) return null;
    var nxt = cur.all[cur.i + 1], from = cur.w.start, to = nxt ? nxt.end : cur.w.end, hit = null;
    arr(CAL.events).forEach(function(e){
      if (!e || e.type !== 'events' || e.approx || e.precision !== 'day' || !/\b(results|earnings)\b/i.test(e.title || '')) return;
      if (e.date < from || e.date > to) return;
      if (!arr(e.people).some(function(p){ return p && p.slug === slug; })) return;
      if (!hit || e.date < hit.date) hit = e;
    });
    return hit ? { e: hit, thisWeek: hit.date <= cur.w.end } : null;
  }
  function valueSet(pool, wk){
    var avgs = pool.map(function(p){ return avgOf(p.slug); }).filter(function(a){ return a != null; }).sort(function(a, b){ return b - a; });
    if (!avgs.length) return {};
    var cut = avgs[Math.max(0, Math.ceil(avgs.length / 4) - 1)], out = {};
    pool.forEach(function(p){ var a = avgOf(p.slug), c = capOf(p.slug, wk); if (a != null && c != null && c <= 14 && a >= cut) out[p.slug] = true; });
    return out;
  }
  var TAGS = { top: ['🏆', 'Top scorer'], hot: ['🔥', 'Hot streak'], earn: ['📅', 'Earnings'], buy: ['🧾', 'Insider buy'], value: ['💰', 'Value'] };
  function pickWatch(src){
    var ranked = W.topPlayers(src, 1000), rank = {}, used = {}, out = [];
    ranked.forEach(function(x, i){ rank[x.p.slug] = i + 1; });
    var pool = arr(F.state.draftWk && F.state.draftWk.draftable).length ? F.state.draftWk.draftable : src.wk.draftable;
    var vals = valueSet(arr(pool), src.wk);
    function add(x, why, extra){ used[x.p.slug] = 1; out.push({ x: x, rank: rank[x.p.slug], why: why, extra: extra || null }); }
    function first(test){ for (var i = 0; i < ranked.length; i++){ if (!used[ranked[i].p.slug]){ var r = test(ranked[i]); if (r) return { x: ranked[i], r: r }; } } return null; }
    ranked.slice(0, 2).forEach(function(x){ add(x, 'top'); });
    var e = first(function(x){ return earnings(x.p.slug); });
    if (e && out.length < 5) add(e.x, 'earn', e.r);
    var b = first(function(x){ return buyDay(x.p.slug); });
    if (b && out.length < 5) add(b.x, 'buy', b.r);
    var bestV = null;
    ranked.forEach(function(x){ if (!used[x.p.slug] && vals[x.p.slug] && (!bestV || avgOf(x.p.slug) > avgOf(bestV.p.slug))) bestV = x; });
    if (bestV && out.length < 5) add(bestV, 'value');
    for (var i = 0; i < ranked.length && out.length < 5; i++) if (!used[ranked[i].p.slug]) add(ranked[i], hotCount(ranked[i].p.slug) >= 4 ? 'hot' : 'top');
    return { list: out, vals: vals };
  }
  function tagText(c){
    var t = TAGS[c.why];
    if (c.why === 'earn' && c.extra){ var dp = dayParts(c.extra.e.date); return [t[0], 'Earnings ' + (c.extra.thisWeek ? dp.wd : dp.md)]; }
    return t;
  }
  function tagEl(c){
    var t = tagText(c), s = el('span', 'hm-ptw__tag hm-ptw__tag--' + c.why);
    s.appendChild(el('span', 'hm-ptw__ico', t[0])).setAttribute('aria-hidden', 'true');
    s.appendChild(document.createTextNode(' ' + t[1]));
    return s;
  }

  // ---- lazy data for the back (first flip only, shared by all cards, cached) ----
  function weekPts(wks, d, slug){
    for (var i = 0; i < wks.length; i++){ var w = wks[i]; if (w && w.daily && w.daily[d] && typeof w.daily[d][slug] === 'number') return w.daily[d][slug]; }
    return null;
  }
  // the last CHART_DAYS trading days with scores (not practice weeks), newest week first until there are enough
  function loadWindow(){
    if (winP) return winP;
    var S = F.state, base = indexWeek((S.sbWk && S.sbWk.week) || (S.index && S.index.currentWeek));
    var wks = [S.sbWk, S.prevWk].filter(Boolean);
    function count(){ var n = 0; wks.forEach(function(w){ if (!w.practice) n += arr(w.days).length; }); return n; }
    function more(k){
      if (count() >= CHART_DAYS || !base || base.i - k < 0 || k > 4) return Promise.resolve();
      var id = base.all[base.i - k].week;
      return F.loadWeek(id).then(function(w){ if (w && !w.practice) wks.push(w); return more(k + 1); });
    }
    winP = more(2).then(function(){
      var ds = {};
      wks.forEach(function(w){ if (!w.practice) arr(w.days).forEach(function(d){ ds[d] = 1; }); });
      return { dates: Object.keys(ds).sort().slice(-CHART_DAYS), wks: wks };
    }, function(){ winP = null; return null; });
    return winP;
  }
  function loadDayFile(d){
    if (F.state.days && F.state.days[d]) return Promise.resolve(F.state.days[d]);
    if (!dayP[d]) dayP[d] = BD.getJson('data/fantasy/days/' + d + '.json').then(null, function(){ return null; });
    return dayP[d];
  }
  function loadFilings(slug){
    if (!filP[slug]) filP[slug] = BD.getJson('data/filings/by-person/' + slug + '.json').then(null, function(){ return null; });
    return filP[slug];
  }
  // newest Form 4 with a code P (open-market purchase) filed in the last 14 days; its EDGAR URL comes from the data
  function buyFiling(data){
    var cut = C.addDays(today(), -14), hit = null;
    arr(data && data.filings).forEach(function(f){
      if (!f || !f.form4 || !f.filed || f.filed < cut || !BD.safeUrl(f.url)) return;
      if (!arr(f.form4.transactions).some(function(t){ return t && t.code === 'P'; })) return;
      if (!hit || f.filed > hit.filed) hit = f;
    });
    return hit;
  }

  // ---- the back: chart + reasons ----
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(n, attrs){ var e = document.createElementNS(SVGNS, n); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  // one bar: rounded 2px at the data end, square at the zero baseline
  function barPath(x, w, y0, y1){
    var r = Math.min(2, w / 2, Math.abs(y1 - y0));
    if (y1 < y0) return 'M' + x + ',' + y0 + 'V' + (y1 + r) + 'Q' + x + ',' + y1 + ' ' + (x + r) + ',' + y1 + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y1 + ' ' + (x + w) + ',' + (y1 + r) + 'V' + y0 + 'Z';
    return 'M' + x + ',' + y0 + 'V' + (y1 - r) + 'Q' + x + ',' + y1 + ' ' + (x + r) + ',' + y1 + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y1 + ' ' + (x + w) + ',' + (y1 - r) + 'V' + y0 + 'Z';
  }
  function chart(name, rows){
    var box = el('figure', 'hm-ptw__chart');
    var W0 = 200, H = 52, pad = 2, n = rows.length, slot = W0 / Math.max(n, 1), bw = Math.max(4, slot - 4);
    var vals = rows.map(function(r){ return r.v; }).filter(function(v){ return v != null; });
    var hi = Math.max(0, Math.max.apply(null, vals.concat([0]))), lo = Math.min(0, Math.min.apply(null, vals.concat([0])));
    if (hi === lo) hi = lo + 1;
    function y(v){ return pad + (hi - v) / (hi - lo) * (H - 2 * pad); }
    var svg = svgEl('svg', { viewBox: '0 0 ' + W0 + ' ' + H, preserveAspectRatio: 'none', 'class': 'hm-ptw__svg', focusable: 'false', 'aria-hidden': 'true' });
    rows.forEach(function(r, i){
      var x = i * slot + (slot - bw) / 2, g = svgEl('g', {});
      var t = svgEl('title', {}); t.textContent = F.fmt.dayLabel(r.d) + ': ' + (r.v == null ? 'no score' : signedTxt(r.v) + ' points'); g.appendChild(t);
      g.appendChild(svgEl('rect', { x: i * slot, y: 0, width: slot, height: H, fill: 'transparent' }));
      if (r.v != null && r.v !== 0) g.appendChild(svgEl('path', { d: barPath(x, bw, y(0), y(r.v)), 'class': r.v > 0 ? 'hm-ptw__bar is-pos' : 'hm-ptw__bar is-neg' }));
      svg.appendChild(g);
    });
    svg.appendChild(svgEl('line', { x1: 0, x2: W0, y1: y(0), y2: y(0), 'class': 'hm-ptw__base' }));
    box.appendChild(svg);
    var cap = el('figcaption', 'hm-ptw__cap', 'Daily points, last ' + n + ' trading days');
    box.appendChild(cap);
    // table view for screen readers
    var tw = el('div', 'v2-sr'), tb = el('table'), cp = el('caption', null, name + ': daily points, last ' + n + ' trading days');
    tb.appendChild(cp);
    var tbody = el('tbody');
    rows.forEach(function(r){ var tr = el('tr'); tr.appendChild(el('th', null, F.fmt.dayLabel(r.d))); tr.appendChild(el('td', null, r.v == null ? 'no score' : signedTxt(r.v))); tbody.appendChild(tr); });
    tb.appendChild(tbody); tw.appendChild(tb); box.appendChild(tw);
    return box;
  }
  function reasonLi(ico, parts, href, ext){
    var li = el('li', 'hm-ptw__r');
    li.appendChild(el('span', 'hm-ptw__ico', ico)).setAttribute('aria-hidden', 'true');
    var body = el('span', 'hm-ptw__rt');
    body.appendChild(el('strong', null, parts[0] + ' '));
    if (href){
      var a = link(null, parts[1], href);
      if (ext){ a.target = '_blank'; a.rel = 'noopener noreferrer'; a.appendChild(el('span', 'v2-sr', ' (opens in a new tab)')); }
      body.appendChild(a);
    } else body.appendChild(document.createTextNode(parts[1]));
    li.appendChild(body);
    return li;
  }
  function fillBack(li, c, src, win){
    var p = c.x.p, slug = p.slug, box = clear(li.querySelector('.hm-ptw__bbody'));
    var rows = win ? win.dates.map(function(d){ return { d: d, v: weekPts(win.wks, d, slug) }; }) : [];
    if (rows.length) box.appendChild(chart(p.name, rows));
    box.appendChild(el('p', 'hm-ptw__wh', "Why they're on the watch list"));
    var ul = el('ul', 'hm-ptw__why'), reasons = [];
    // best day in the window, and the holding that moved most in its direction that day (from the day file)
    var best = null;
    rows.forEach(function(r){ if (r.v != null && r.v > 0 && (!best || r.v > best.v)) best = r; });
    var jobs = [best ? loadDayFile(best.d) : null, c.why === 'buy' || buyDay(slug) ? loadFilings(slug) : null];
    return Promise.all(jobs).then(function(r){
      var e = earnings(slug), hc = hotCount(slug), f = r[1] ? buyFiling(r[1]) : null;
      if (f){
        var tk = f.form4 && f.form4.ticker ? ' (' + f.form4.ticker + ')' : '';
        reasons.push(reasonLi('🧾', ['Insider buy:', 'Form 4 purchase filed ' + dayParts(f.filed).full + tk], f.url, true));
      }
      if (e) reasons.push(reasonLi('📅', ['Earnings ' + dayParts(e.e.date).full + ':', e.e.title], 'calendar.html'));
      if (hc >= 4) reasons.push(reasonLi('🔥', ['Hot streak:', 'up on ' + hc + ' of the last 5 trading days'], null));
      if (best){
        var led = '', dp = r[0] && r[0].people && r[0].people[slug];
        if (dp){
          var hs = arr(dp.holdings).filter(function(h){ return h && h.ticker && typeof h.changePct === 'number' && typeof h.weight === 'number'; });
          hs.sort(function(a, b){ return b.weight * b.changePct - a.weight * a.changePct; });
          if (hs.length && hs[0].changePct > 0) led = ', led by ' + hs[0].ticker + ' +' + hs[0].changePct.toFixed(1) + '%';
        }
        reasons.push(reasonLi('📈', ['Best day:', signedTxt(best.v) + ' on ' + dayParts(best.d).full + led], null));
      }
      var story = DIGEST ? arr(DIGEST.stories).filter(function(s){ return s && s.headline && arr(s.people).indexOf(p.name) >= 0; })[0] : null;
      if (story) reasons.push(reasonLi('📰', ['In the news:', story.headline], 'news.html'));
      if (c.why === 'value' || li._vals[slug]){
        reasons.push(reasonLi('💰', ['Value:', 'cap ' + capOf(slug, src.wk) + ', avg/day ' + signedTxt(avgOf(slug)) + ' (top quarter of the pool)'], null));
      }
      // the card's own reason first, then the rest, at most 3
      var key = { buy: '🧾', earn: '📅', hot: '🔥', value: '💰' }[c.why];
      reasons.sort(function(a, b){ return (b.firstChild.textContent === key) - (a.firstChild.textContent === key); });
      if (!reasons.length) reasons.push(reasonLi('🏆', ['Top scorer:', 'No. ' + c.rank + ' by ' + (src.kind === 'week' ? 'points this week' : 'points on ' + dayParts(src.date).full)], null));
      reasons.slice(0, 3).forEach(function(x){ ul.appendChild(x); });
      box.appendChild(ul);
      li._filled = true;
      setFocusable(li.querySelector('.hm-ptw__back'), li.classList.contains('is-flipped'));
    });
  }

  // ---- flip ----
  var FOCUSABLE = 'a[href], button, [tabindex]';
  function setFocusable(face, on){
    if (!face) return;
    face.setAttribute('aria-hidden', on ? 'false' : 'true');
    var f = face.querySelectorAll(FOCUSABLE);
    for (var i = 0; i < f.length; i++){ if (on) f[i].removeAttribute('tabindex'); else f[i].setAttribute('tabindex', '-1'); }
  }
  function flip(li, on, src){
    var front = li.querySelector('.hm-ptw__front'), back = li.querySelector('.hm-ptw__back'), btn = li.querySelector('.hm-ptw__flip');
    li.classList.toggle('is-flipped', on);
    btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    setFocusable(back, on);
    setFocusable(front, !on);
    if (on){
      var fb = li.querySelector('.hm-ptw__back-btn');
      if (fb) fb.focus({ preventScroll: true });
      if (!li._filled && !li._loading){
        li._loading = true;
        loadWindow().then(function(win){ return fillBack(li, li._c, src, win); }).then(null, function(e){ if (window.console) console.warn(e); });
      }
    } else btn.focus({ preventScroll: true });
  }

  function renderWatch(){
    var S = F.state, sec = $('watchsec');
    var src = W ? W.watchSource(S.sbWk, S.prevWk) : null;
    var picked = src ? pickWatch(src) : { list: [], vals: {} }, top = picked.list;
    if (!top.length){ sec.hidden = true; return; }
    var practice = src.wk.practice ? ' (practice week)' : '';
    $('watchk').textContent = src.kind === 'week'
      ? F.fmt.weekTitle(src.wk.week) + ' · points so far, through ' + F.fmt.dayLabel(src.date)
      : 'Last scored day · ' + F.fmt.dayLabel(src.date) + practice + (S.sbWk && S.sbWk.week !== src.wk.week
        ? '. ' + F.fmt.weekTitle(S.sbWk.week) + ' has no scores yet.'
        : '.');
    var ol = clear($('watchlist'));
    top.forEach(function(c, i){
      var x = c.x, p = x.p, id = 'ptwb-' + p.slug;
      var li = el('li', 'hm-ptw__card' + (i === 0 ? ' is-top' : ''));
      li._c = c; li._vals = picked.vals;
      var inner = el('div', 'hm-ptw__inner');
      // front: one button (no links inside it); + Draft sits beside it, outside the button
      var front = el('div', 'hm-ptw__face hm-ptw__front');
      var b = el('button', 'hm-ptw__flip'); b.type = 'button';
      b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', id);
      var pic = el('span', 'hm-ptw__pic');
      var av = avatar(p); av.className += ' hm-ptw__av';
      pic.appendChild(av);
      pic.appendChild(el('span', 'hm-ptw__rank num', '#' + c.rank));
      b.appendChild(pic);
      var who = el('span', 'hm-ptw__who');
      var nm = el('span', 'hm-ptw__name', p.name), ceoB = window.BDCeoBadge ? window.BDCeoBadge(p) : null;
      if (ceoB) nm.appendChild(ceoB);
      who.appendChild(nm);
      var nk = window.BDDossier ? window.BDDossier.nickname(p.slug) : null;
      if (nk) who.appendChild(el('span', 'v2-nick hm-ptw__nick', nk));
      who.appendChild(tagEl(c));
      b.appendChild(who);
      var nums = el('span', 'hm-ptw__nums');
      var pts = el('span', 'hm-ptw__pts num ' + numCls(x.points), signedTxt(x.points));
      pts.appendChild(el('span', 'hm-ptw__unit', ' pts'));
      nums.appendChild(pts);
      b.appendChild(nums);
      {
        var avg = avgOf(p.slug), cap = capOf(p.slug, src.wk);
        if (avg != null || cap != null){
          var meta = el('span', 'hm-ptw__meta');
          if (avg != null){ var m1 = el('span', 'hm-ptw__m'); m1.appendChild(el('span', null, 'Avg/day ')); m1.appendChild(el('strong', 'num ' + numCls(avg), signedTxt(avg))); meta.appendChild(m1); }
          if (cap != null){ var m2 = el('span', 'hm-ptw__m'); m2.appendChild(el('span', null, 'Cap ')); m2.appendChild(el('strong', 'num', String(cap))); meta.appendChild(m2); }
          nums.appendChild(meta);
        }
      }
      b.appendChild(el('span', 'v2-sr', '. Flip for details'));
      front.appendChild(b);
      front.appendChild(draftBtn(p));
      inner.appendChild(front);
      // back: chart, reasons, + Draft, Full profile, Flip back (filled on the first flip)
      var back = el('div', 'hm-ptw__face hm-ptw__back'); back.id = id;
      back.setAttribute('role', 'group'); back.setAttribute('aria-label', p.name + ': details');
      var bhd = el('div', 'hm-ptw__bhd');
      bhd.appendChild(el('p', 'hm-ptw__bh', p.name));
      var fb = el('button', 'hm-ptw__back-btn', 'Flip back'); fb.type = 'button';
      bhd.appendChild(fb);
      back.appendChild(bhd);
      var bb = el('div', 'hm-ptw__bbody');
      bb.appendChild(el('p', 'v2-loading hm-ptw__load', 'Loading…'));
      back.appendChild(bb);
      var acts = el('div', 'hm-ptw__acts');
      acts.appendChild(draftBtn(p));
      var prof = link('hm-ptw__prof', 'Full profile', 'player.html?p=' + encodeURIComponent(p.slug));
      prof.appendChild(el('span', null, ' →')).setAttribute('aria-hidden', 'true');
      if (window.BDDossier){ prof.setAttribute('data-dossier', p.slug); prof.setAttribute('aria-haspopup', 'dialog'); prof.setAttribute('data-dossier-week', src.wk.week); }
      acts.appendChild(prof);
      back.appendChild(acts);
      inner.appendChild(back);
      li.appendChild(inner);
      setFocusable(back, false);
      b.addEventListener('click', function(){ flip(li, true, src); });
      fb.addEventListener('click', function(){ flip(li, false, src); });
      back.addEventListener('keydown', function(e){ if (e.key === 'Escape' || e.keyCode === 27){ e.preventDefault(); flip(li, false, src); } });
      ol.appendChild(li);
    });
    sec.hidden = false;
  }
  function draftBtn(p){
    // draft.html?add=<slug> adds the player in the Draft room (assets/v2/draft.js addFromUrl; same rules as + Add)
    var dr = link('v2-btn v2-btn--primary v2-btn--sm hm-ptw__draft', '', 'draft.html?add=' + encodeURIComponent(p.slug));
    dr.appendChild(el('span', null, '+ Draft'));
    dr.appendChild(el('span', 'v2-sr', ' ' + p.name + ' in the Draft room'));
    return dr;
  }

  // ---- page ----
  var tc = F.testClock();
  if (tc != null){ var tb = $('testclock'); tb.hidden = false; tb.textContent = 'Test clock (for testing only): ' + new Date(F.now()).toISOString(); }

  BD.getJson('digest.json').then(function(d){ DIGEST = d; renderLede(d); renderStories(d); renderHeadlines(d); },
    function(){ renderLede(null); renderStories(null); renderHeadlines(null); });
  BD.getJson('data/moves/markets.json').then(renderMoves, function(){ renderMoves(null); });

  F.init().then(function(){
    // the watch list waits for the calendar (earnings picks); nicknames re-render it once they arrive
    calP.then(function(){
      renderWatch();
      if (window.BDDossier) window.BDDossier.loadNicknames().then(function(x){ if (x) renderWatch(); }, function(){});
    });
    var v = view();
    if (v.mode !== 'none'){ renderTeamBoard(v); return; }
    if (BOOK_HIDDEN){ renderBookBoard(null); return; }
    return loadBook().then(renderBookBoard, function(){ renderBookBoard(null); });
  }, function(err){
    if (window.console) console.warn(err);
    if (BOOK_HIDDEN){ boardFail(); return; }
    loadBook().then(function(b){ if (b) renderBookBoard(b); else boardFail(); }, boardFail);
  });
})();
