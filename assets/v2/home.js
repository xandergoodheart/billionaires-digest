/* Billionaires Digest v3: the front door (index.html), sports-network homepage layout. ES5, IIFE, UI only.
   Real data only, each block on its own (one failing never blanks the others):
     hero banner          <- static art (assets/art/realistic/hero-fantasy.webp, no people) + link to the Draft room
     your franchise       <- BDFantasyStore (same browser team as team.html): your team's real points vs the S&P 500;
                             no team -> "You haven't drafted yet" + the week's top matchup from The Book
                             (data/book/index.json + week file)
     how to play          <- cap, picks and captain multiplier from the draft week file (BDFantasyCore as fallback)
     today's lede         <- digest.json (the latest edition; the full edition lives at news.html)
     From the Digest      <- up to 3 more stories from digest.json (hidden when there are none)
     Players to watch     <- top 5 by real points this scoring week, or the last scored day (BDWeekCore); nicknames
                             from data/fantasy/nicknames.json via BDDossier; names open the player dossier
     Top Headlines        <- digest.json stories
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
  // name: a link to the player page; a plain click opens the player dossier (assets/v2/dossier.js) instead
  function nameLink(p, weekId){
    var a = link('v2-player__name', p.name, 'player.html?p=' + encodeURIComponent(p.slug));
    var ceoB = window.BDCeoBadge ? window.BDCeoBadge(p) : null;
    if (ceoB) a.appendChild(ceoB);
    if (window.BDDossier){
      a.setAttribute('data-dossier', p.slug); a.setAttribute('aria-haspopup', 'dialog');
      if (weekId) a.setAttribute('data-dossier-week', weekId);
    }
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
    say(teamName() + '. ' + (total == null ? 'No team points yet.' : 'Team total ' + plainTxt(total) + ' fantasy points.') + ' ' + result(v) + '.');
  }

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
    if (ev){
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

  // ---- today's lede, story grid, headlines (digest.json) ----
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
    top.appendChild(el('span', 'hm-lede__kick', "Today's lede"));
    if (d && d.date) top.appendChild(el('span', 'hm-lede__date', String(d.date)));
    box.appendChild(top);
    var h = el('h2', 'hm-lede__h'); h.id = 'ledeh';
    if (lede) h.appendChild(link(null, lede.headline, 'news.html')); else h.textContent = "Today's edition";
    box.appendChild(h);
    if (!d){ box.appendChild(el('p', 'hm-lede__dek', "Today's edition could not load here. Open the news page to read it.")); box.appendChild(link('v2-btn v2-btn--light', 'Go to News', 'news.html')); return; }
    if (lede && lede.dek) box.appendChild(el('p', 'hm-lede__dek', lede.dek));
    if (!lede) box.appendChild(el('p', 'hm-lede__dek', 'The morning edition is on the press.'));
    var s = ledeStory(d);
    if (s && s.move){
      var mv = el('div', 'hm-lede__move');
      mv.appendChild(el('span', 'hm-lede__mk', 'The move'));
      mv.appendChild(el('p', null, firstSentences(s.move, 320)));
      var u = BD.safeUrl(s.url);
      if (u && s.source){
        var src = el('p', 'hm-lede__src');
        src.appendChild(document.createTextNode('Source: '));
        var a = link(null, s.source, u); a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.appendChild(el('span', 'v2-sr', ' (opens in a new tab)'));
        src.appendChild(a);
        mv.appendChild(src);
      }
      box.appendChild(mv);
    }
    box.appendChild(link('v2-btn v2-btn--light hm-lede__btn', "Read today's edition", 'news.html'));
  }
  // From the Digest: up to 3 of today's stories besides the lede (headline + one line); hidden when there are none
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
    st.slice(0, 10).forEach(function(s){
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

  // ---- how to play: rules from the draft week file (BDFantasyCore when the file is missing) ----
  var WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  function renderHow(wk){
    var ol = clear($('howlist'));
    var picks = wk && typeof wk.picks === 'number' ? wk.picks : C.PICKS;
    var cap = wk && typeof wk.cap === 'number' ? wk.cap : C.CAP;
    var mult = wk && typeof wk.captainMultiplier === 'number' ? wk.captainMultiplier : C.CAPTAIN_MULT;
    var pw = WORDS[picks] || String(picks);
    [
      ['Make your picks', pw.charAt(0).toUpperCase() + pw.slice(1) + ' people, ' + cap + ' cap. Each player has a cap cost; stay at or under ' + cap + '.'],
      ['Name your captain', 'Your captain scores ' + mult + '× points, good or bad.'],
      ['Watch the week play out', 'Points come from their real stock moves each trading day, head to head with the S&P 500.']
    ].forEach(function(x, i){
      var li = el('li', 'hm-how__i');
      li.appendChild(el('span', 'hm-how__n', '0' + (i + 1)));
      var t = el('div', 'hm-how__t');
      t.appendChild(el('h3', 'hm-how__h', x[0]));
      t.appendChild(el('p', 'hm-how__p', x[1]));
      li.appendChild(t);
      ol.appendChild(li);
    });
  }

  // ---- players to watch: top 5 by real points this scoring week (or the last scored day) ----
  function renderWatch(){
    var S = F.state, sec = $('watchsec');
    var src = W ? W.watchSource(S.sbWk, S.prevWk) : null;
    var top = src ? W.topPlayers(src, 5) : [];
    if (!top.length){ sec.hidden = true; return; }
    var practice = src.wk.practice ? ' (practice week)' : '';
    $('watchk').textContent = src.kind === 'week'
      ? F.fmt.weekTitle(src.wk.week) + ' · points so far, through ' + F.fmt.dayLabel(src.date)
      : 'Last scored day · ' + F.fmt.dayLabel(src.date) + practice + '. This week has no scores yet.';
    var ol = clear($('watchlist')), sal = F.salaries(), wsal = src.wk.salaries || {};
    top.forEach(function(x, i){
      var p = x.p, li = el('li', 'hm-watch__i');
      li.appendChild(el('span', 'hm-watch__rank num', String(i + 1)));
      li.appendChild(avatar(p));
      var tx = el('div', 'v2-player__txt');
      tx.appendChild(nameLink(p, src.wk.week));
      var nk = window.BDDossier ? window.BDDossier.nickname(p.slug) : null;
      if (nk) tx.appendChild(el('span', 'v2-nick', nk));
      var h = arr(p.holdings)[0] || {};
      var c = typeof sal[p.slug] === 'number' ? sal[p.slug] : (typeof wsal[p.slug] === 'number' ? wsal[p.slug] : null);
      tx.appendChild(el('span', 'v2-player__sub hm-watch__sub', [h.name, h.ticker, c == null ? null : 'cap ' + c].filter(Boolean).join(' · ')));
      li.appendChild(tx);
      var pts = el('span', 'hm-watch__pts num ' + numCls(x.points), signedTxt(x.points));
      pts.appendChild(el('span', 'v2-sr', ' points'));
      li.appendChild(pts);
      ol.appendChild(li);
    });
    sec.hidden = false;
  }

  // ---- page ----
  var tc = F.testClock();
  if (tc != null){ var tb = $('testclock'); tb.hidden = false; tb.textContent = 'Test clock (for testing only): ' + new Date(F.now()).toISOString(); }

  BD.getJson('digest.json').then(function(d){ renderLede(d); renderStories(d); renderHeadlines(d); },
    function(){ renderLede(null); renderStories(null); renderHeadlines(null); });
  BD.getJson('data/moves/markets.json').then(renderMoves, function(){ renderMoves(null); });

  renderHow(null);
  F.init().then(function(){
    renderHow(F.state.draftWk);
    renderWatch();
    if (window.BDDossier) window.BDDossier.loadNicknames().then(function(x){ if (x) renderWatch(); }, function(){});
    var v = view();
    if (v.mode !== 'none'){ renderTeamBoard(v); return; }
    return loadBook().then(renderBookBoard, function(){ renderBookBoard(null); });
  }, function(err){
    if (window.console) console.warn(err);
    loadBook().then(function(b){ if (b) renderBookBoard(b); else boardFail(); }, boardFail);
  });
})();
