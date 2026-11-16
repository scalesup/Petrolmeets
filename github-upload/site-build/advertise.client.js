// /advertise/ page logic (plain JS, no libraries). Built into the page by site-build/build.mjs.
// Live numbers: rpc web_stats · checkout: edge function sponsor-checkout (start → Stripe, confirm on ?paid=)
(function () {
  var SB = window.PM_SB, K = window.PM_KEY, TZ = 'America/Chicago';
  var DEF = { ticker: 9900, newsletter: 14900, post: 24900, magazine: 12900 };
  var S = { st: null, pkg: 'ticker', weeks: 1, busy: false };
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' };
  var n = function (v) { return v == null ? '—' : Number(v).toLocaleString('en-US'); };
  function money(c) { return '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 }); }
  function prices() { var P = (S.st && S.st.prices) || {}; var o = {}; for (var k in DEF) o[k] = +P[k] || DEF[k]; return o; }
  function full() { var st = S.st || {}; return S.pkg === 'ticker' && st.ticker_slots != null && st.ticker_live >= st.ticker_slots; }
  function val(id) { return ($('#' + id).value || '').trim(); }
  function banner(ok, text) { var b = $('#adv-banner'); b.hidden = !text; b.className = 'notice adv-banner ' + (ok ? 'ok' : 'bad'); b.textContent = text || ''; }

  var TERMS = {
    ticker: function (w) { return ['Your business name, a short pitch (60 characters) and a link in the sponsor ticker on every page.', 'Runs ' + w + ' full ' + (w === 1 ? 'week' : 'weeks') + ', starting when we approve it (usually within one business day).', 'Clicks carry utm_source=petrolmeets so you can see them in your own analytics. Links that already have UTM tags are used as given.', 'You get the view and click counts when it ends.']; },
    newsletter: function (w) { return ['Your name, pitch and link in the sponsor slot of ' + w + ' Thursday ' + (w === 1 ? 'email' : 'emails') + ', starting with the next one after we approve it.', 'One sponsor per issue, so you’re the only one.', 'Clicks carry utm_source=petrolmeets&utm_medium=email.']; },
    post: function () { return ['A full sponsored post about your business on its own page at petrolmeets.com/sponsored/, written with you. You see the draft before it goes up.', 'A short highlight inside a PetrolMeets Magazine story opens it, and it’s featured in one weekly email. Labelled SPONSORED.', 'Stays up for good and is listed on our Sponsored Posts page. Links carry utm_source=petrolmeets.']; },
    magazine: function (w) { return ['Your business name, a short pitch (60 characters) and a link in a SPONSORED Magazine Highlight box on the PetrolMeets Magazine pages at petrolmeets.com/news/.', 'Runs ' + w + ' full ' + (w === 1 ? 'week' : 'weeks') + ', starting when we approve it (usually within one business day). Only a few sponsors run at a time. It’s a highlight box, not a full page or an article.', 'Clicks carry utm_source=petrolmeets&utm_medium=magazine. You get the view and click counts when it ends.']; }
  };
  var LABEL = { ticker: 'The sponsor ticker, on every page', newsletter: 'The Thursday email', post: 'Your highlight and sponsored post page', magazine: 'Your box in the Magazine' };

  function render() {
    var st = S.st || {}, P = prices(), known = !!S.st && st.visits_7d != null;
    // stats
    var sv = { visits_day: known ? n(st.visits_day) : '—', visits_7d: known ? n(st.visits_7d) : '—', subscribers: S.st ? n(st.subscribers) : '—', meets_30d: S.st ? n(st.meets_30d) : '—' };
    $$('[data-stat]').forEach(function (el) { el.textContent = sv[el.getAttribute('data-stat')]; });
    $('#adv-mobile').textContent = st.mobile_pct != null ? st.mobile_pct + '% of visits are on a phone.' : 'Most are on a phone.';
    var asOf = st.as_of ? new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(st.as_of)) : '';
    $('#adv-asof').textContent = !S.st ? 'Loading live numbers…' : known ? 'Live from the site’s own visit counter and the email list, as of ' + asOf + ' Central.' : 'Live numbers show here once the site’s visit counter is switched on.';
    // packages
    var left = st.ticker_slots != null ? Math.max(0, st.ticker_slots - (st.ticker_live || 0)) : null;
    var notes = { ticker: left == null ? '' : left === 0 ? 'ALL SPOTS TAKEN' : left + ' OF ' + st.ticker_slots + ' SPOTS OPEN', newsletter: st.subscribers ? n(st.subscribers) + ' SUBSCRIBERS' : '', post: '', magazine: 'LIMITED SPOTS' };
    $$('.pack').forEach(function (b) {
      var k = b.getAttribute('data-pkg'); b.setAttribute('aria-checked', String(S.pkg === k));
      $('.pp', b).textContent = money(P[k]);
      var nt = $('.pn', b); nt.textContent = notes[k]; nt.hidden = !notes[k]; nt.classList.toggle('hot', k === 'ticker' && left === 0);
    });
    // preview
    var name = val('f-adv') || 'Your shop', pitch = val('f-head') || 'your pitch, up to 60 characters';
    var ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase() || 'YS';
    $('#pv-label').textContent = LABEL[S.pkg];
    $$('[data-pv]').forEach(function (el) { el.hidden = el.getAttribute('data-pv') !== S.pkg; });
    $$('[data-v=name]').forEach(function (el) { el.textContent = name; });
    $$('[data-v=nameup]').forEach(function (el) { el.textContent = name.toUpperCase(); });
    $$('[data-v=pitch]').forEach(function (el) { el.textContent = pitch; });
    $$('[data-v=ini]').forEach(function (el) { el.textContent = ini; });
    // form
    var hl = val('f-head').length, hn = $('#f-headn'); hn.textContent = $('#f-head').value.length + ' / 60'; hn.classList.toggle('hot', hl > 52);
    var unit = S.pkg === 'newsletter' ? ['issue', 'issues'] : ['week', 'weeks'], wks = S.pkg === 'post' ? 1 : S.weeks;
    $('#f-weeks').hidden = S.pkg === 'post';
    $('#f-weeks-l').textContent = S.pkg === 'newsletter' ? 'How many weekly emails' : 'How many weeks';
    $$('.wk').forEach(function (b) { var w = +b.getAttribute('data-w'); b.setAttribute('aria-checked', String(S.weeks === w)); b.textContent = w + ' ' + (w === 1 ? unit[0] : unit[1]).toUpperCase(); });
    $('#f-terms').innerHTML = '';
    TERMS[S.pkg](wks).concat(['We check every sponsor by hand. Car-related and local businesses only. No alcohol, vape, gambling, weapons or anything that encourages street racing. If we can’t run it, you get a full refund.'])
      .forEach(function (t) { var li = document.createElement('li'); li.textContent = t; $('#f-terms').appendChild(li); });
    var tot = P[S.pkg] * wks;
    $('#f-total').textContent = money(tot) + (S.pkg === 'post' ? '' : ' · ' + wks + ' ' + (wks === 1 ? unit[0] : unit[1]));
    var sold = $('#f-sold'); sold.hidden = !st.sold; sold.textContent = st.sold ? n(st.sold) + ' SOLD' : '';
    var btn = $('#f-go'); btn.disabled = S.busy || full();
    btn.textContent = S.busy ? 'Opening checkout…' : full() ? 'Ticker is full' : 'Sponsor for ' + money(tot) + ' →';
  }

  function err(t) { var e = $('#f-err'); e.hidden = !t; e.textContent = t || ''; }

  document.addEventListener('click', function (e) {
    var p = e.target.closest && e.target.closest('.pack'); if (p) { S.pkg = p.getAttribute('data-pkg'); err(''); render(); return; }
    var w = e.target.closest && e.target.closest('.wk'); if (w) { S.weeks = +w.getAttribute('data-w'); render(); }
  });
  // arrow keys inside each radio group
  document.addEventListener('keydown', function (e) {
    var b = e.target.closest && e.target.closest('[role=radio]'); if (!b || !/Arrow(Left|Right|Up|Down)/.test(e.key)) return;
    var all = $$('[role=radio]', b.parentNode), i = all.indexOf(b) + (/Right|Down/.test(e.key) ? 1 : -1);
    var nx = all[(i + all.length) % all.length]; e.preventDefault(); nx.focus(); nx.click();
  });
  ['f-adv', 'f-head', 'f-link', 'f-email'].forEach(function (id) { $('#' + id).addEventListener('input', render); });

  $('#adv-form').addEventListener('submit', function (e) {
    e.preventDefault(); if (S.busy) return;
    if (full()) return err('Every ticker spot is taken right now. Email info@petrolmeets.com and we’ll hold the next one for you.');
    var f = e.target; if (!f.reportValidity()) return;
    S.busy = true; err(''); render();
    var fail = function (m) { S.busy = false; render(); err(m || 'Checkout isn’t open yet. Email info@petrolmeets.com and we’ll set you up by hand.'); };
    fetch(SB + '/functions/v1/sponsor-checkout', { method: 'POST', headers: H, body: JSON.stringify({ action: 'start', package: S.pkg, weeks: S.pkg === 'post' ? 1 : S.weeks, advertiser: val('f-adv'), headline: val('f-head'), link: val('f-link'), email: val('f-email') }) })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) { if (d && d.url) location.href = d.url; else fail(d && d.error); })
      .catch(function () { fail(); });
  });

  // ?package= · ?paid= · ?canceled
  var q = new URLSearchParams(location.search), paid = q.get('paid'), pk = q.get('package');
  if (pk && DEF[pk]) S.pkg = pk;
  if (paid || q.has('canceled')) { try { history.replaceState(null, '', location.pathname); } catch (x) {} }
  if (q.has('canceled')) banner(false, 'Checkout canceled. Nothing was charged. Your details are still below if you want to try again.');
  if (paid) {
    banner(true, 'Checking your payment…');
    fetch(SB + '/functions/v1/sponsor-checkout', { method: 'POST', headers: H, body: JSON.stringify({ action: 'confirm', session_id: paid }) })
      .then(function (r) { return r.json(); }).then(function (d) { return d && d.paid; }).catch(function () { return false; })
      .then(function (ok) {
        banner(ok, ok ? 'Paid. Thank you! We check every sponsor by hand, usually within one business day, and email you when you go live. If we can’t run it, you get a full refund.'
          : 'We couldn’t confirm the payment yet. If Stripe charged you, you’re fine: we’ll email you within a day. Questions: info@petrolmeets.com.');
      });
  }
  render();

  // page view (same counter the rest of the site uses) + live numbers
  if (/(^|\.)petrolmeets\.com$/.test(location.hostname)) try {
    var vid = localStorage.getItem('pm-vid'); if (!vid) { vid = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('pm-vid', vid); }
    var ref = null; try { ref = document.referrer ? new URL(document.referrer).hostname : null; } catch (x) {}
    fetch(SB + '/rest/v1/events', { method: 'POST', headers: Object.assign({ Prefer: 'return=minimal' }, H), body: JSON.stringify({ name: 'page_view', visitor: vid, ref: ref, device: window.innerWidth >= 900 ? 'desktop' : 'mobile' }) }).catch(function () {});
  } catch (x) {}
  fetch(SB + '/rest/v1/rpc/web_stats', { method: 'POST', headers: H, body: '{}' })
    .then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
    .then(function (d) { S.st = d || {}; render(); });
})();
