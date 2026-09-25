/* Billionaires Digest: shared helpers for every page. ES5, exposes one global: BD. */
(function(w){
  var BD = {};

  // ---- theme toggle (button #themebtn) ----
  BD.initTheme = function(){
    var root = document.documentElement;
    var btn = document.getElementById('themebtn');
    try { var saved = localStorage.getItem('bd-theme'); if (saved) root.setAttribute('data-theme', saved); } catch(e){}
    function currentDark(){
      var t = root.getAttribute('data-theme');
      if (t) return t === 'dark';
      return w.matchMedia && w.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    if (!btn) return;
    function labelBtn(){ btn.textContent = currentDark() ? 'Paper mode' : 'Terminal mode'; }
    labelBtn();
    btn.addEventListener('click', function(){
      var next = currentDark() ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('bd-theme', next); } catch(e){}
      labelBtn();
    });
  };

  // ---- small helpers ----
  function el(tag, cls, text){ var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function safeUrl(u){ return (typeof u === 'string' && /^https?:\/\//i.test(u)) ? u : null; }
  function dirClass(d){ return d === 'up' ? 'up' : (d === 'down' ? 'down' : 'flat'); }
  function arrow(d){ return d === 'up' ? '▲ ' : (d === 'down' ? '▼ ' : '— '); }
  function arr(x){ return Array.isArray(x) ? x : []; }
  function plural(n, one, many){ return n + ' ' + (n === 1 ? one : many); }
  function reducedMotion(){ return !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  BD.el = el; BD.safeUrl = safeUrl; BD.dirClass = dirClass; BD.arrow = arrow; BD.arr = arr; BD.plural = plural; BD.reducedMotion = reducedMotion;

  // names
  function norm(x){ return String(x == null ? '' : x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  // "Carlos Slim Helu & family" -> "carlos slim helu"
  function coreName(x){ return norm(String(x == null ? '' : x).replace(/\s*&\s*family\s*$/i, '')); }
  function slug(name){ return norm(name).replace(/ /g, '-'); }
  function storyMatches(story, name){
    var n = coreName(name);
    if (!n || !story) return false;
    if (norm(story.who).indexOf(n) >= 0) return true;
    return arr(story.people).some(function(p){ return coreName(p) === n; });
  }
  function initials(name){
    var ws = String(name || '').replace(/\s*&\s*family\s*$/i, '').split(/\s+/).filter(function(x){ return /^[A-Za-zÀ-ɏ]/.test(x); });
    if (!ws.length) return '•';
    return (ws[0].charAt(0) + (ws.length > 1 ? ws[ws.length - 1].charAt(0) : '')).toUpperCase();
  }
  BD.norm = norm; BD.coreName = coreName; BD.slug = slug; BD.storyMatches = storyMatches; BD.initials = initials;

  // dates and money
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var MONTHS_LONG = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  function isoOf(x){ var m = /^(\d{4}-\d{2}-\d{2})/.exec(String(x || '')); return m ? m[1] : null; }
  function fmtDate(iso){
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? (MONTHS[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1]) : (iso || '');
  }
  // "2026-09-24" or "2026-09" -> "Sep 2026"; anything else is returned as is
  function monYear(x){
    var m = /^(\d{4})-(\d{2})(?:-\d{2})?/.exec(String(x || '').trim());
    if (!m || +m[2] < 1 || +m[2] > 12) return x ? String(x) : '';
    return MONTHS[+m[2] - 1] + ' ' + m[1];
  }
  // "Thursday, September 24, 2026" -> "2026-09-24"
  function isoFromLong(s){
    var m = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(String(s || ''));
    if (!m) return null;
    var mi = MONTHS_LONG.indexOf(m[1].toLowerCase());
    if (mi < 0) return null;
    return m[3] + '-' + (mi < 9 ? '0' : '') + (mi + 1) + '-' + (+m[2] < 10 ? '0' : '') + (+m[2]);
  }
  // "$927.9B" -> 927.9 (billions)
  function parseWorth(v){
    var m = /\$?\s*([\d,.]+)\s*([TBM])?/i.exec(String(v || ''));
    if (!m) return null;
    var n = parseFloat(m[1].replace(/,/g, ''));
    if (!isFinite(n)) return null;
    var u = (m[2] || 'B').toUpperCase();
    return u === 'T' ? n * 1000 : (u === 'M' ? n / 1000 : n);
  }
  function fmtWorth(v){ return v >= 1000 ? '$' + (v / 1000).toFixed(2).replace(/\.?0+$/, '') + 'T' : '$' + (Math.round(v * 10) / 10) + 'B'; }
  // 845000 -> "845K", 12280426 -> "12.3M", 1.2e9 -> "1.2B" (absolute value; '' when not a number)
  function compactNum(n){
    var a = Math.abs(Number(n));
    if (n === null || n === '' || !isFinite(a)) return '';
    var units = ['', 'K', 'M', 'B', 'T'], i = 0;
    while (i < units.length - 1 && a >= 999.95){ a /= 1000; i++; }
    if (i === 0) return String(Math.round(a));
    return String(a >= 99.95 ? Math.round(a) : Math.round(a * 10) / 10) + units[i];
  }
  // share counts: 12280426 -> "12.3M"
  function fmtShares(n){ return compactNum(n); }
  // dollars: 58086415 -> "$58.1M", -1.2e9 -> "-$1.2B"
  function fmtUsd(n){ var c = compactNum(n); return c ? (Number(n) < 0 ? '-$' : '$') + c : ''; }
  // "2026-09-24" -> "Sep 24"
  function monDay(iso){
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m && +m[2] >= 1 && +m[2] <= 12 ? MONTHS[+m[2] - 1] + ' ' + (+m[3]) : (iso ? String(iso) : '');
  }
  BD.MONTHS = MONTHS; BD.isoOf = isoOf; BD.fmtDate = fmtDate; BD.monYear = monYear; BD.isoFromLong = isoFromLong; BD.parseWorth = parseWorth; BD.fmtWorth = fmtWorth;
  BD.fmtShares = fmtShares; BD.fmtUsd = fmtUsd; BD.monDay = monDay;

  // text: cut at a word boundary with an ellipsis
  function clip(s, max){
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    if (s.length <= max) return s;
    var cut = s.slice(0, max - 1), sp = cut.lastIndexOf(' ');
    if (sp > max * 0.6) cut = cut.slice(0, sp);
    return cut.replace(/[\s,;:·–—-]+$/, '') + '…';
  }
  BD.clip = clip;

  // ---- sectors and halftone art plates ----
  var SECTOR_ART = {'AI & tech':'ai','Finance':'finance','Aerospace':'aerospace','Luxury & retail':'luxury','Real estate':'realestate','Energy':'energy','Media':'media','Autos':'autos','Industrials':'industrials','Health':'health'};
  var SECTORS = ['AI & tech','Finance','Aerospace','Luxury & retail','Real estate','Energy','Media','Autos','Industrials','Health','Other'];
  // "Also exposed" keywords per sector (sectors.html). Whole words only, matched against a company's
  // name (parenthetical notes removed) and ticker after BD.norm(). "ai" matches "AI" as its own word,
  // never inside "Thailand" or "xAI". Multi-word keywords match as a phrase.
  var SECTOR_KEYWORDS = {
    'AI & tech': ['nvidia','nvda','openai','anthropic','xai','ai','artificial intelligence','semiconductor','semiconductors','software','cloud','data center','data centers','data centre','data centres','microsoft','msft','alphabet','google','googl','goog','meta platforms','meta','facebook','amazon','amzn','apple','aapl','oracle','orcl','dell','tencent','bytedance','cursor','tsmc','asml','broadcom','avgo'],
    'Finance': ['bank','banks','banking','bancorp','capital','financial','finance','fund','funds','investment','investments','investors','asset management','insurance','berkshire','brk','hedge','private equity','stock exchange','payments','fintech','crypto','bitcoin','coinbase','binance','brokerage','securities'],
    'Aerospace': ['aerospace','space','spacex','spcx','rocket','rockets','satellite','satellites','starlink','aviation','airline','airlines','aircraft','defense','defence','blue origin','drone','drones'],
    'Luxury & retail': ['luxury','lvmh','hermes','chanel','fashion','apparel','retail','retailer','walmart','wmt','costco','zara','inditex','cosmetics','beauty','l oreal','store','stores','jewelry','jewellery','spirits','wine','wines','supermarket','supermarkets'],
    'Real estate': ['real estate','property','properties','reit','hotel','hotels','casino','casinos','resort','resorts','realty','developer','developers','homebuilder','homebuilders'],
    'Energy': ['oil','gas','energy','power','solar','nuclear','petroleum','petrochemical','petrochemicals','refinery','refining','coal','utility','utilities','pipeline','pipelines','battery','batteries','lng'],
    'Media': ['media','news','newspaper','newspapers','publishing','broadcasting','broadcast','television','tv','film','films','studio','studios','streaming','entertainment','music','sports','fox','paramount','bloomberg','twitter','x corp'],
    'Autos': ['auto','autos','automotive','car','cars','motor','motors','vehicle','vehicles','tesla','tsla','ev','bmw','porsche','volkswagen','toyota','ferrari','truck','trucks'],
    'Industrials': ['industries','industrial','industrials','mining','mines','metals','steel','cement','chemical','chemicals','shipping','logistics','manufacturing','construction','infrastructure','port','ports','copper','iron','aluminum','aluminium','engineering','conglomerate'],
    'Health': ['health','healthcare','pharma','pharmaceutical','pharmaceuticals','biotech','biotechnology','vaccine','vaccines','hospital','hospitals','medical','medicine','medicines','drug','drugs','therapeutics','clinic','clinics','diagnostics','life sciences','novo','moderna'],
    'Other': []
  };
  function sectorArt(s){ return 'assets/art/sector-' + (SECTOR_ART[s] || 'other') + '.jpg'; }
  function sectorSlug(s){ return slug(s); }
  function sectorFromSlug(sl){ for (var i = 0; i < SECTORS.length; i++){ if (sectorSlug(SECTORS[i]) === sl) return SECTORS[i]; } return null; }
  function sectorHref(s){ return 'sectors.html#' + sectorSlug(s); }
  var kwCache = {};
  // regex over BD.norm(text): each keyword must stand alone as a word or phrase; null when no keywords
  function sectorKeywordRe(s){
    if (!(s in kwCache)){
      var list = arr(SECTOR_KEYWORDS[s]).map(norm).filter(Boolean);
      kwCache[s] = list.length ? new RegExp('(?:^| )(?:' + list.join('|') + ')(?= |$)') : null;
    }
    return kwCache[s];
  }
  // text an "Also exposed" match may use: company name without parenthetical notes, plus ticker
  function exposureText(e){
    var name = String(e && e.name || '').replace(/\([^)]*\)/g, ' ').replace(/\s+-\s+.*$/, '');
    return norm(name + ' ' + (e && e.ticker || ''));
  }
  function artImg(cls, src, size, eager){
    var im = el('img', cls); im.src = src; im.alt = '';
    im.width = size; im.height = size;
    im.setAttribute('loading', eager ? 'eager' : 'lazy'); im.setAttribute('decoding', 'async');
    return im;
  }
  BD.SECTOR_ART = SECTOR_ART; BD.SECTORS = SECTORS; BD.SECTOR_KEYWORDS = SECTOR_KEYWORDS;
  BD.sectorArt = sectorArt; BD.sectorSlug = sectorSlug; BD.sectorFromSlug = sectorFromSlug; BD.sectorHref = sectorHref; BD.sectorKeywordRe = sectorKeywordRe; BD.exposureText = exposureText; BD.artImg = artImg;

  // ---- data loading ----
  function getJson(u){ return fetch(u, { cache: 'no-store' }).then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  BD.getJson = getJson;

  // top-100 people index (data/people/index.json), loaded once
  var peopleIndex = null;    // resolved index object, or null until loaded
  var peoplePromise = null;
  BD.loadPeople = function(){
    if (!peoplePromise){
      peoplePromise = getJson('data/people/index.json').then(function(ix){
        peopleIndex = { source: ix && ix.source, sourceUrl: ix && ix.sourceUrl, asOf: ix && ix.asOf, people: arr(ix && ix.people).filter(function(p){ return p && p.name && p.slug; }) };
        return peopleIndex;
      });
      peoplePromise.catch(function(){ peoplePromise = null; });
    }
    return peoplePromise;
  };
  BD.getPeople = function(){ return peopleIndex; };
  // true while the index is loading or once it has loaded (false after a failure)
  BD.peopleLoading = function(){ return !!peoplePromise; };
  BD.indexBySlug = function(s){
    var ps = peopleIndex ? peopleIndex.people : [];
    for (var i = 0; i < ps.length; i++){ if (ps[i].slug === s) return ps[i]; }
    return null;
  };
  BD.indexByName = function(name){
    var n = coreName(name), ps = peopleIndex ? peopleIndex.people : [];
    if (!n) return null;
    for (var i = 0; i < ps.length; i++){ if (coreName(ps[i].name) === n) return ps[i]; }
    return null;
  };
  BD.personSlug = function(name){ var p = BD.indexByName(name); return p ? p.slug : slug(name); };

  // stories the current page shows; used as a sector fallback for people outside the index
  var ctxStories = [];
  BD.setStories = function(list){ ctxStories = arr(list); };
  // sector for a person: people index -> their first story on the page -> 'Other'
  BD.personSector = function(name, stories){
    var ip = name ? BD.indexByName(name) : null;
    if (ip && ip.sector) return ip.sector;
    var st = stories ? arr(stories) : ctxStories;
    for (var i = 0; i < st.length; i++){ if (name && st[i] && st[i].sector && storyMatches(st[i], name)) return st[i].sector; }
    return 'Other';
  };

  // person profile files, loaded on demand
  var profileCache = {};     // slug -> promise of profile object or null
  BD.loadProfile = function(s){
    if (!profileCache[s]){
      profileCache[s] = fetch('data/people/' + encodeURIComponent(s) + '.json', { cache: 'no-store' }).then(function(r){
        if (r.status === 404) return null;
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
      profileCache[s].catch(function(){ delete profileCache[s]; });
    }
    return profileCache[s];
  };

  // optional morning-data files: resolve to the parsed object, or null when missing or broken. Never reject. Loaded once.
  var optionalCache = {};
  function optionalJson(u){
    if (!optionalCache[u]){
      optionalCache[u] = getJson(u).then(function(x){ return x && typeof x === 'object' ? x : null; }, function(){ return null; });
    }
    return optionalCache[u];
  }
  BD.loadFilings = function(){ return optionalJson('data/filings/latest.json'); };        // SEC EDGAR, newest filings
  BD.loadPrices = function(){ return optionalJson('data/prices/latest.json'); };          // { quotes: { SYM: { price, changePct, ... } } }
  BD.loadNetworthEst = function(){ return optionalJson('data/prices/networth-est.json'); }; // { method, people: { slug: { estDailyChange } } }

  // one person's SEC filings: null when the person has no file (404); rejects on other errors
  var personFilingsCache = {};
  BD.loadPersonFilings = function(s){
    if (!personFilingsCache[s]){
      personFilingsCache[s] = fetch('data/filings/by-person/' + encodeURIComponent(s) + '.json', { cache: 'no-store' }).then(function(r){
        if (r.status === 404) return null;
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
      personFilingsCache[s].catch(function(){ delete personFilingsCache[s]; });
    }
    return personFilingsCache[s];
  };

  // archive of editions
  var archiveIndex = null;  // promise of every edition date, newest first
  var editionCache = {};     // date -> promise of the edition object (or null when it failed)
  BD.loadArchiveIndex = function(){
    if (!archiveIndex){
      archiveIndex = getJson('archive/index.json').then(function(ix){
        return arr(ix && ix.editions).filter(function(x){ return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x); }).sort().reverse();
      });
      archiveIndex.catch(function(){ archiveIndex = null; });
    }
    return archiveIndex;
  };
  BD.loadEdition = function(dt){
    if (!editionCache[dt]){
      editionCache[dt] = getJson('archive/' + dt + '.json')
        .catch(function(){ delete editionCache[dt]; return null; });
    }
    return editionCache[dt];
  };
  // resolves to [{ iso: 'YYYY-MM-DD', ed: edition or null }] for the newest `limit` editions (default 30)
  BD.loadArchiveDated = function(limit){
    return BD.loadArchiveIndex().then(function(all){
      var dates = all.slice(0, limit || 30);
      return Promise.all(dates.map(BD.loadEdition)).then(function(eds){
        return eds.map(function(ed, i){ return { iso: dates[i], ed: ed }; });
      });
    });
  };
  BD.loadArchive = function(limit){
    return BD.loadArchiveDated(limit).then(function(list){ return list.map(function(x){ return x.ed; }); });
  };

  // ---- sector-plate avatar ----
  // person: { name, ini?, sector? }. size: px number, or a CSS length (then pass iniPx).
  BD.avatar = function(person, size, iniPx){
    var p = person || {};
    var sector = p.sector || BD.personSector(p.name);
    var wrap = el('span', 'av');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.setProperty('--av', typeof size === 'number' ? size + 'px' : String(size));
    var img = el('span', 'avimg');
    img.style.backgroundImage = "url('" + sectorArt(sector) + "')";
    wrap.appendChild(img);
    var fs = iniPx || (typeof size === 'number' ? Math.max(11, Math.round(size * 0.19)) : 11);
    var drop = Math.round(fs * 0.5);
    var tab = el('span', 'avini', p.ini || initials(p.name));
    tab.style.fontSize = fs + 'px';
    tab.style.bottom = (-drop) + 'px';
    wrap.appendChild(tab);
    wrap.style.marginBottom = (drop + 2) + 'px';
    return wrap;
  };

  // ---- story renderer ----
  // opts.personHref: prefix for links on a person's name (default '#person=')
  BD.renderStory = function(s, opts){
    var o = opts || {};
    var pre = o.personHref || '#person=';
    var art = el('article', 'story');
    var g = el('div', 'sgrid');
    g.appendChild(artImg('sart', sectorArt(s.sector), 72));
    var a = el('div', 'sbody');
    g.appendChild(a);
    art.appendChild(g);
    var r = el('div', 'srow');
    var wp = s.who ? BD.indexByName(s.who) : null;
    if (wp){
      var wl = el('a', 'who', s.who); wl.href = pre + encodeURIComponent(wp.slug);
      r.appendChild(wl);
    } else r.appendChild(el('span', 'who', s.who || ''));
    if (s.type) r.appendChild(el('span', 'badge', s.type));
    if (s.sector) r.appendChild(el('span', 'badge', s.sector));
    if (s.tickers) r.appendChild(el('span', 'label', s.tickers));
    if (s.read) r.appendChild(el('span', 'read ' + dirClass(s.direction), 'AI read · ' + arrow(s.direction) + s.read));
    a.appendChild(r);
    a.appendChild(el('h3', 'serif', s.headline || ''));
    if (s.correction && typeof s.correction === 'string') a.appendChild(el('p', 'correction', s.correction));
    var q = el('div', 'quad');
    [['The move', s.move, 'q-move'], ['Why it matters', s.why, 'q-why'], ['The bear case', s.bear, 'q-bear'], ['What to watch', s.watch, 'q-watch']].forEach(function(x){
      if (!x[1]) return;
      var cell = el('div', x[2]); cell.appendChild(el('h4', null, x[0])); cell.appendChild(el('p', null, x[1])); q.appendChild(cell);
    });
    a.appendChild(q);
    var src = el('div', 'src');
    src.appendChild(el('span', null, 'Source · ' + (s.source || 'Unlisted')));
    var u = safeUrl(s.url);
    if (u){ var link = el('a', null, 'Read original ↗'); link.href = u; link.target = '_blank'; link.rel = 'noopener noreferrer'; src.appendChild(link); }
    var rep = el('a', 'report', 'Report an error');
    rep.href = 'mailto:hello@billionairesdigest.com?subject=' + encodeURIComponent('Correction: ' + (s.headline || '')) +
      '&body=' + encodeURIComponent('Story: ' + (s.headline || '') + '\nSource: ' + (u || s.url || '') + "\n\nWhat's wrong:\n");
    src.appendChild(rep);
    a.appendChild(src);
    return art;
  };

  // lede section (dark band with hero art); ed: an edition object
  BD.renderLede = function(ed){
    var d = ed || {};
    if (!d.lede) return null;
    var ls = el('section', 'lede'), lw = el('div', 'wrap');
    var left = el('div');
    left.appendChild(el('div', 'label', d.lede.kicker || 'Lede of the day')).style.color = 'var(--accent)';
    left.appendChild(el('h1', 'serif', d.lede.headline || ''));
    left.appendChild(el('p', null, d.lede.dek || ''));
    var right = el('div');
    var pr = el('div', 'portrait');
    var lp = BD.ledePerson(d, d.lede.ini);
    pr.appendChild(BD.avatar({ name: lp || '', ini: d.lede.ini || (lp ? initials(lp) : '•'), sector: lp ? null : 'Other' }, '100%', 22));
    right.appendChild(pr);
    lw.appendChild(left); lw.appendChild(right); ls.appendChild(lw);
    return ls;
  };
  // lede person: first story person (then top 10) whose initials match lede.ini
  BD.ledePerson = function(ed, ini){
    var want = String(ini || '').toUpperCase();
    if (!want) return null;
    var names = [];
    arr(ed && ed.stories).forEach(function(s){ if (s && s.who) names.push(s.who); arr(s && s.people).forEach(function(n){ names.push(n); }); });
    arr(ed && ed.top10).forEach(function(t){ if (t && t.name) names.push(t.name); });
    for (var i = 0; i < names.length; i++){ if (initials(names[i]) === want) return names[i]; }
    return null;
  };

  // side boxes: list box (What to watch, Quick hits, memo)
  BD.listBox = function(title, items, strong){
    if (!arr(items).length) return null;
    var b = el('div', 'box' + (strong ? ' strong' : '')); b.appendChild(el('h3', 'serif', title));
    var l = el('div', 'list'); items.forEach(function(t){ l.appendChild(el('span', null, t)); }); b.appendChild(l);
    return b;
  };
  BD.consensusBox = function(c){
    if (!c || !c.headline) return null;
    var box = el('div', 'consensus');
    box.appendChild(artImg('cart', 'assets/art/consensus.jpg', 64));
    box.appendChild(el('div', 'label', 'Consensus alert'));
    box.appendChild(el('div', 't serif', c.headline));
    if (c.body) box.appendChild(el('p', null, c.body));
    var tg = el('div', 'tags'); arr(c.tags).forEach(function(t){ tg.appendChild(el('span', null, t)); }); box.appendChild(tg);
    return box;
  };

  // run fn over items with at most `n` in flight; resolves to results in order
  BD.pool = function(items, n, fn){
    var out = new Array(items.length), next = 0;
    function worker(){
      if (next >= items.length) return Promise.resolve();
      var i = next++;
      return Promise.resolve().then(function(){ return fn(items[i], i); })
        .then(function(v){ out[i] = v; }, function(){ out[i] = null; })
        .then(worker);
    }
    var ws = [];
    for (var k = 0; k < Math.min(n, items.length); k++) ws.push(worker());
    return Promise.all(ws).then(function(){ return out; });
  };

  // ---- Nav menus (details.navmore: Fantasy, Tools): close on Escape and outside click; one open at a time.
  // On phones the nav is one swipeable row: scroll the active item into view, fade the edges that can still scroll.
  // Works without JS as plain <details> and a plain scrolling row. Same code as NAV_JS in scripts/lib/nav.mjs.
  BD.initNavMore = function(){
    var d = document.querySelectorAll('details.navmore');
    function closeAll(ex){ for (var i = 0; i < d.length; i++) if (d[i] !== ex) d[i].removeAttribute('open'); }
    if (d.length) {
      document.addEventListener('click', function(e){
        for (var i = 0; i < d.length; i++) if (d[i].hasAttribute('open') && !d[i].contains(e.target)) d[i].removeAttribute('open');
      });
      document.addEventListener('keydown', function(e){
        if (e.key !== 'Escape' && e.key !== 'Esc') return;
        for (var i = 0; i < d.length; i++) if (d[i].hasAttribute('open')) {
          d[i].removeAttribute('open');
          var s = d[i].querySelector('summary'); if (s) s.focus();
        }
      });
      for (var j = 0; j < d.length; j++) d[j].addEventListener('toggle', function(){ if (this.open) closeAll(this); });
    }
    var nav = document.querySelector('.sitenav'), row = nav && nav.querySelector('.wrap');
    if (!row) return;
    function fades(){
      var max = row.scrollWidth - row.clientWidth;
      nav.classList.toggle('is-scrolled', row.scrollLeft > 2);
      nav.classList.toggle('is-end', row.scrollLeft >= max - 2);
    }
    var c = row.querySelector('.wrap>a[aria-current="page"],summary[aria-current="page"]');
    if (c && row.scrollWidth > row.clientWidth) {
      var x = c.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft;
      if (x + c.offsetWidth > row.clientWidth - 32) row.scrollLeft = Math.max(0, x - (row.clientWidth - c.offsetWidth) / 2);
    }
    fades();
    row.addEventListener('scroll', fades, { passive: true });
    window.addEventListener('resize', fades);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', BD.initNavMore);
  else BD.initNavMore();

  w.BD = BD;
})(window);
