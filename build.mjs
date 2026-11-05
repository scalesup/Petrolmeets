// PetrolMeets · static site build (runs on Netlify on every deploy, every hour, and right after a post is published).
// Reads public data from Supabase and writes real HTML pages Google can read:
//   /meets/            this week's meets      /meets/<slug>/   one page per meet (Event schema)
//   /news/             blog index             /news/<slug>/    one page per post (BlogPosting schema)
//   /sitemap.xml  /rss.xml (news)  /meets/rss.xml (upcoming meets)  /robots.txt
// It also puts real titles, descriptions and a list of meets into deploy/index.html for crawlers.
// No npm packages. Node 18+. Needs supabase/083_store_only_seo.sql.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'deploy');
const SITE = 'https://petrolmeets.com';
const SB = 'https://mgzzwhbagkaevycuzuuz.supabase.co';
const KEY = 'sb_publishable_0uVcsppq6UV7Bj7aulIgIw_fai07dgC';
const TZ = 'America/Chicago';

const rpc = async (fn, body = {}) => {
  const r = await fetch(SB + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) { console.warn('rpc ' + fn + ' → ' + r.status + ' ' + (await r.text()).slice(0, 200)); return null; }
  return r.json();
};
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const xml = esc;
const put = (rel, body) => { const p = join(ROOT, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); };
const fmt = (d, o) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...o }).format(new Date(d));
const day = d => fmt(d, { weekday: 'long', month: 'long', day: 'numeric' });
const time = d => fmt(d, { hour: 'numeric', minute: '2-digit' });
const iso = d => new Date(d).toISOString();
const NOTICE = { cancelled: 'Canceled', postponed: 'Rain delay / postponed', moved: 'New location', time_changed: 'Time changed', full: 'Full' };
const noticeOf = m => m.status === 'cancelled' ? 'cancelled' : m.notice || '';

// ---------- shared page shell ----------
const CSS = `*{box-sizing:border-box}body{margin:0;background:#0e0e0d;color:#f3f1ec;font-family:Archivo,system-ui,-apple-system,Segoe UI,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.5}
a{color:#ff3131;text-decoration:none}a:hover{color:#ff6b6b}.w{max-width:860px;margin:0 auto;padding:0 22px}
header{border-bottom:1px solid rgba(255,255,255,.08)}header .w{max-width:1200px;min-height:64px;display:flex;align-items:center;gap:22px;flex-wrap:wrap}
.logo{display:flex;align-items:center;gap:9px;color:#f3f1ec;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:17px;letter-spacing:.22em}.logo i{width:12px;height:12px;background:#ff3131;display:block}
nav{display:flex;gap:18px;flex-wrap:wrap}nav a{color:#b8b4aa;font-size:14px;padding:12px 0}
.k{font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.16em;color:#ff3131;text-transform:uppercase}
h1{font-family:Archivo,sans-serif;font-stretch:115%;font-weight:800;font-size:clamp(34px,6vw,56px);line-height:.98;margin:10px 0 14px;text-wrap:balance}
h2{font-size:22px;margin:36px 0 12px}.mute{color:#a8a49a}.card{background:#1a1a18;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:18px 20px}
.row{display:grid;grid-template-columns:110px minmax(0,1fr);gap:8px 16px;margin:0}.row dt{color:#a8a49a;font-size:14px}.row dd{margin:0}
.btns{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.btn{height:48px;padding:0 18px;display:inline-flex;align-items:center;border-radius:12px;background:#f3f1ec;color:#0e0e0d;font-family:'Geist Mono',monospace;font-size:12px;letter-spacing:.08em}
.btn.red{background:#ff3131;color:#fff}.btn.line{background:none;color:#f3f1ec;border:1px solid rgba(255,255,255,.2)}
.notice{border:1px solid #f5b301;background:#2b2410;border-radius:12px;padding:12px 16px;margin:12px 0}.notice b{color:#f5b301;font-family:'Geist Mono',monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase}
ul.list{list-style:none;padding:0;margin:0;display:grid;gap:10px}ul.list a{display:block;color:#f3f1ec}ul.list .t{font-weight:700;font-size:18px}
.post{font-size:18px;line-height:1.65;color:#e4e1da}.post img{max-width:100%;border-radius:12px}.post h2,.post h3{color:#f3f1ec}
footer{border-top:1px solid rgba(255,255,255,.08);margin-top:56px}footer .w{max-width:1200px;padding:28px 22px;display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:#8a877f}footer a{color:#8a877f}`;
const head = ({ title, desc, path, image, ld, type = 'website', extra = '' }) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${SITE}${path}">
<meta property="og:type" content="${type}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${SITE}${path}"><meta property="og:image" content="${esc(image || SITE + '/og.png')}"><meta property="og:site_name" content="PetrolMeets">
<meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/icons/icon-192.png"><link rel="alternate" type="application/rss+xml" title="PetrolMeets News" href="${SITE}/rss.xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&family=Archivo:wdth,wght@62..125,400..800&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}</style>${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}${extra}</head><body>
<header><div class="w"><a class="logo" href="/"><i></i>PETROLMEETS</a><nav><a href="/meets/">Meets</a><a href="/#map">Map</a><a href="/news/">News</a><a href="/advertise/">Advertise</a></nav></div></header>`;
const foot = (cfg) => `<footer><div class="w"><span>© ${new Date().getFullYear()} PetrolMeets · Austin, Texas</span><a href="/meets/">All meets</a><a href="/news/">News</a><a href="/rss.xml">RSS</a><a href="/advertise/">Advertise</a><a href="/terms/">Terms</a><a href="/privacy/">Privacy</a><a href="/guidelines/">Guidelines</a>${cfg.ios ? `<a href="${esc(cfg.ios)}">App Store</a>` : ''}${cfg.android ? `<a href="${esc(cfg.android)}">Google Play</a>` : ''}<a href="mailto:info@petrolmeets.com">info@petrolmeets.com</a></div></footer></body></html>`;
const getApp = cfg => cfg.app_public && (cfg.ios || cfg.android)
  ? `<div class="card"><b>Get PetrolMeets on your phone</b><p class="mute" style="margin:6px 0 0">Drive mode, convoys with friends and check-ins live in the app.</p><div class="btns">${cfg.ios ? `<a class="btn" href="${esc(cfg.ios)}">App Store</a>` : ''}${cfg.android ? `<a class="btn" href="${esc(cfg.android)}">Google Play</a>` : ''}</div></div>`
  : `<div class="card"><b>This weekend’s meets in your inbox</b><p class="mute" style="margin:6px 0 0">Free. One email every Thursday. The app for iPhone and Android is coming soon.</p><div class="btns"><a class="btn red" href="/#newsletter">Get the weekly</a></div></div>`;

// ---------- tiny markdown ----------
function md(src) {
  const inl = t => esc(t).replace(/!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, (m, a, h) => `<a href="${h}"${/^https?:\/\/(?!petrolmeets\.com)/.test(h) ? ' rel="noopener"' : ''}>${a}</a>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return String(src || '').replace(/\r/g, '').trim().split(/\n{2,}/).map(b => {
    if (/^### /.test(b)) return '<h3>' + inl(b.slice(4)) + '</h3>';
    if (/^## /.test(b)) return '<h2>' + inl(b.slice(3)) + '</h2>';
    if (/^\s*[-*] /.test(b)) return '<ul>' + b.split('\n').map(l => '<li>' + inl(l.replace(/^\s*[-*] /, '')) + '</li>').join('') + '</ul>';
    if (/^\s*\d+\. /.test(b)) return '<ol>' + b.split('\n').map(l => '<li>' + inl(l.replace(/^\s*\d+\. /, '')) + '</li>').join('') + '</ol>';
    if (/^> /.test(b)) return '<blockquote>' + inl(b.replace(/^> ?/gm, '')) + '</blockquote>';
    return '<p>' + inl(b).replace(/\n/g, '<br>') + '</p>';
  }).join('\n');
}

const meetDesc = m => {
  const n = noticeOf(m);
  return (n ? NOTICE[n] + ': ' : '') + `${m.title} — ${m.kind === 'drive' ? 'a car cruise' : m.kind === 'event' ? 'a car event' : 'a car meet'} on ${day(m.starts_at)} at ${time(m.starts_at)} in ${m.area || 'Austin'}${m.scenes?.length ? ' · ' + m.scenes.join(', ') : ''}. Free on PetrolMeets.`;
};
const appLinks = m => ({ apple: `https://maps.apple.com/?daddr=${m.lat},${m.lng}&q=${encodeURIComponent(m.venue || m.title)}&dirflg=d`, google: `https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}&travelmode=driving`, waze: `https://waze.com/ul?ll=${m.lat},${m.lng}&navigate=yes` });

function meetPage(m, others, cfg) {
  const path = '/meets/' + m.slug + '/', n = noticeOf(m), ended = new Date(m.ends_at || new Date(m.starts_at).getTime() + 4 * 36e5) < new Date();
  const status = { cancelled: 'EventCancelled', postponed: 'EventPostponed', moved: 'EventRescheduled', time_changed: 'EventRescheduled' }[n] || 'EventScheduled';
  const ld = { '@context': 'https://schema.org', '@type': 'Event', name: m.title, startDate: iso(m.starts_at), ...(m.ends_at ? { endDate: iso(m.ends_at) } : {}),
    eventStatus: 'https://schema.org/' + status, eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', url: SITE + path, image: [SITE + '/og.png'],
    description: meetDesc(m),
    location: { '@type': 'Place', name: m.private ? (m.area || 'Austin area') : (m.venue || m.area), address: m.private ? { '@type': 'PostalAddress', addressLocality: m.area, addressRegion: 'TX', addressCountry: 'US' } : (m.address || m.area + ', TX'),
      ...(m.private ? {} : { geo: { '@type': 'GeoCoordinates', latitude: m.lat, longitude: m.lng } }) },
    ...(m.org ? { organizer: { '@type': 'Organization', name: m.org.name || '@' + m.org.handle, ...(m.org.handle ? { url: 'https://instagram.com/' + String(m.org.handle).replace(/^@/, '') } : {}) } } : {}),
    ...(/^free$/i.test(String(m.entry || '').trim()) ? { isAccessibleForFree: true } : {}) };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Meets', item: SITE + '/meets/' }, { '@type': 'ListItem', position: 2, name: m.title, item: SITE + path }] };
  const L = !m.private && Number.isFinite(+m.lat) ? appLinks(m) : null;
  const kindLabel = m.kind === 'drive' ? 'Drive / cruise' : m.kind === 'event' ? 'Event' : 'Car meet';
  return head({ title: `${n ? NOTICE[n] + ': ' : ''}${m.title} · ${fmt(m.starts_at, { weekday: 'short', month: 'short', day: 'numeric' })} · ${m.area || 'Austin'} car meet | PetrolMeets`, desc: meetDesc(m), path, ld: [ld, crumbs], type: 'event' })
    + `<main class="w" style="padding-top:36px"><div class="k">${esc(kindLabel)} · ${esc(m.area || 'Austin area')}</div><h1>${esc(m.title)}</h1>`
    + (n ? `<div class="notice" role="status"><b>${esc(NOTICE[n])}</b>${m.notice_note ? `<div style="margin-top:4px">${esc(m.notice_note)}</div>` : ''}</div>` : '')
    + (ended ? `<div class="notice"><b>This meet has ended</b><div style="margin-top:4px">See what’s on next below.</div></div>` : '')
    + `<div class="card"><dl class="row"><dt>When</dt><dd><b>${esc(day(m.starts_at))}</b><br>${esc(time(m.starts_at))}${m.ends_at ? ' – ' + esc(time(m.ends_at)) : ''} Central</dd>`
    + `<dt>Where</dt><dd>${m.private ? `${esc(m.area || 'Austin area')}<br><span class="mute">Private meet: the host shares the spot with approved guests.</span>` : `<b>${esc(m.venue || '')}</b>${m.address ? '<br>' + esc(m.address) : ''}`}</dd>`
    + (m.scenes?.length ? `<dt>Scene</dt><dd>${esc(m.scenes.join(' · '))}</dd>` : '')
    + (m.entry ? `<dt>Entry</dt><dd>${esc(m.entry)}</dd>` : '')
    + (m.org ? `<dt>Host</dt><dd>${esc(m.org.name || '')}${m.org.handle ? ` <a href="https://instagram.com/${esc(String(m.org.handle).replace(/^@/, ''))}" rel="noopener">@${esc(String(m.org.handle).replace(/^@/, ''))}</a>` : ''}</dd>` : '')
    + `</dl>` + (L && !ended && n !== 'cancelled' ? `<div class="btns"><a class="btn" href="${esc(L.apple)}">Apple Maps</a><a class="btn" href="${esc(L.google)}">Google Maps</a><a class="btn" href="${esc(L.waze)}">Waze</a></div>` : '')
    + `<div class="btns"><a class="btn line" href="/?meet=${m.id}">See it on the map</a></div><p class="mute" style="font-size:13px;margin:0">Check the host’s post before you go. Times and places can change. Don’t use your phone while driving.</p></div>`
    + `<h2>More meets around Austin</h2><ul class="list">${others.map(o => `<li><a class="card" href="/meets/${o.slug}/"><span class="k">${esc(fmt(o.starts_at, { weekday: 'short', month: 'short', day: 'numeric' }))} · ${esc(time(o.starts_at))}</span><div class="t">${esc(o.title)}</div><span class="mute">${esc(o.area || '')}</span></a></li>`).join('')}</ul>`
    + `<div style="margin-top:28px">${getApp(cfg)}</div></main>` + foot(cfg);
}

function meetsIndex(list, cfg) {
  const groups = []; list.forEach(m => { const k = day(m.starts_at); let g = groups.find(x => x.k === k); if (!g) groups.push(g = { k, items: [] }); g.items.push(m); });
  const ld = { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: list.slice(0, 50).map((m, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE + '/meets/' + m.slug + '/', name: m.title })) };
  return head({ title: 'Car meets in Austin this week | PetrolMeets', desc: `${list.length} car meets, cruises and car shows around Austin, Texas coming up. Cars & coffee, JDM, Euro, trucks and more, checked by a person.`, path: '/meets/', ld })
    + `<main class="w" style="padding-top:36px"><div class="k">Austin, TX · ${list.length} coming up</div><h1>Car meets in Austin</h1><p class="mute">Every meet is checked by a person before it goes on the map. <a href="/#map">Open the map</a>.</p>`
    + groups.map(g => `<h2>${esc(g.k)}</h2><ul class="list">${g.items.map(m => { const n = noticeOf(m); return `<li><a class="card" href="/meets/${m.slug}/"><span class="k">${esc(time(m.starts_at))} · ${esc(m.kind === 'drive' ? 'Drive' : m.kind === 'event' ? 'Event' : 'Meet')}${n ? ' · ' + esc(NOTICE[n]) : ''}</span><div class="t">${esc(m.title)}</div><span class="mute">${esc(m.area || '')}${m.scenes?.length ? ' · ' + esc(m.scenes.join(', ')) : ''}</span></a></li>`; }).join('')}</ul>`).join('')
    + (list.length ? '' : '<p>No meets on the map right now. New ones go up every night.</p>')
    + `<div style="margin-top:28px">${getApp(cfg)}</div></main>` + foot(cfg);
}

function postPage(p, recent, cfg) {
  const path = '/news/' + p.slug + '/', title = p.seo_title || p.title, desc = p.seo_desc || p.dek || p.title;
  const ld = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: desc, datePublished: iso(p.published_at), dateModified: iso(p.updated_at || p.published_at),
    author: { '@type': 'Organization', name: p.author || 'PetrolMeets' }, publisher: { '@type': 'Organization', name: 'PetrolMeets', logo: { '@type': 'ImageObject', url: SITE + '/icons/icon-512.png' } },
    mainEntityOfPage: SITE + path, image: [p.cover_url || SITE + '/og.png'] };
  return head({ title: title + ' | PetrolMeets', desc, path, image: p.cover_url, ld, type: 'article' })
    + `<main class="w" style="padding-top:36px"><div class="k">${p.sponsor ? 'Sponsored · ' + esc(p.sponsor.advertiser) : esc(p.tag || 'News')} · ${esc(fmt(p.published_at, { month: 'long', day: 'numeric', year: 'numeric' }))}</div><h1>${esc(p.title)}</h1>`
    + (p.dek ? `<p class="mute" style="font-size:20px;margin-top:0">${esc(p.dek)}</p>` : '')
    + (p.cover_url ? `<img src="${esc(p.cover_url)}" alt="" style="width:100%;border-radius:16px;margin:8px 0 20px">` : '')
    + (p.sponsor ? `<p class="mute" style="font-size:14px">This post is sponsored by ${p.sponsor.link ? `<a href="${esc(p.sponsor.link)}" rel="sponsored noopener">${esc(p.sponsor.advertiser)}</a>` : esc(p.sponsor.advertiser)}.</p>` : '')
    + `<article class="post">${md(p.body_md)}</article>`
    + (recent.length ? `<h2>More from PetrolMeets</h2><ul class="list">${recent.map(r => `<li><a class="card" href="/news/${esc(r.slug)}/"><span class="k">${esc(r.tag || 'News')}</span><div class="t">${esc(r.title)}</div></a></li>`).join('')}</ul>` : '')
    + `<div style="margin-top:28px">${getApp(cfg)}</div></main>` + foot(cfg);
}

function newsIndex(posts, cfg) {
  return head({ title: 'News: Austin car scene | PetrolMeets', desc: 'Meet recaps, new spots, guides and news from the Austin car scene.', path: '/news/' })
    + `<main class="w" style="padding-top:36px"><div class="k">PetrolMeets</div><h1>News</h1>`
    + (posts.length ? `<ul class="list">${posts.map(p => `<li><a class="card" href="/news/${esc(p.slug)}/"><span class="k">${p.sponsor ? 'Sponsored · ' + esc(p.sponsor.advertiser) : esc(p.tag || 'News')} · ${esc(fmt(p.published_at, { month: 'short', day: 'numeric' }))}</span><div class="t">${esc(p.title)}</div>${p.dek ? `<span class="mute">${esc(p.dek)}</span>` : ''}</a></li>`).join('')}</ul>` : '<p class="mute">The first posts are on the way. <a href="/#newsletter">Get the weekly</a> and you won’t miss them.</p>')
    + `<div style="margin-top:28px">${getApp(cfg)}</div></main>` + foot(cfg);
}

function rss(title, link, desc, items, self) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${xml(title)}</title><link>${link}</link><description>${xml(desc)}</description><language>en-us</language><atom:link href="${self}" rel="self" type="application/rss+xml"/>`
    + items.map(i => `<item><title>${xml(i.title)}</title><link>${i.link}</link><guid isPermaLink="true">${i.link}</guid><pubDate>${new Date(i.date).toUTCString()}</pubDate><description>${xml(i.desc || '')}</description></item>`).join('') + `</channel></rss>`;
}

// ---------- run ----------
const [meetsRaw, postsRaw, cfgRaw] = await Promise.all([rpc('web_meets_build'), rpc('web_posts_build'), rpc('web_config')]);
const cfg = cfgRaw || {};
const meets = (meetsRaw || []).filter(m => m && m.slug);
const posts = (postsRaw || []).filter(p => p && p.slug);
const now = Date.now();
const upcoming = meets.filter(m => new Date(m.ends_at || new Date(m.starts_at).getTime() + 4 * 36e5).getTime() > now);
console.log(`meets ${meets.length} (upcoming ${upcoming.length}) · posts ${posts.length}`);

for (const d of ['meets', 'news']) { const p = join(ROOT, d); if (existsSync(p)) rmSync(p, { recursive: true, force: true }); }
put('meets/index.html', meetsIndex(upcoming, cfg));
for (const m of meets) {
  const others = upcoming.filter(o => o.id !== m.id).slice(0, 6);
  put('meets/' + m.slug + '/index.html', meetPage(m, others, cfg));
}
put('meets/missing/index.html', head({ title: 'Meet | PetrolMeets', desc: 'Car meets in Austin.', path: '/meets/', extra: '<meta name="robots" content="noindex">' })
  + `<main class="w" style="padding-top:36px"><h1>Finding that meet…</h1><p class="mute" id="msg">One second.</p><p><a href="/meets/">See every meet</a></p></main>`
  + `<script>(async()=>{const u=(location.pathname.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\\/?$/i)||[])[1];if(u){location.replace('/?meet='+u);return}const k=(location.pathname.match(/-([0-9a-f]{8})\\/?$/)||[])[1];if(!k){document.getElementById('msg').textContent='That meet isn’t on the map any more.';return}try{const r=await fetch('${SB}/rest/v1/rpc/web_meet_key',{method:'POST',headers:{apikey:'${KEY}',Authorization:'Bearer ${KEY}','Content-Type':'application/json'},body:JSON.stringify({p_key:k})});const id=await r.json();if(id&&typeof id==='string'){location.replace('/?meet='+id);return}}catch(e){}document.getElementById('msg').textContent='That meet isn’t on the map any more.'})()</script>` + foot(cfg));
put('news/index.html', newsIndex(posts, cfg));
posts.forEach((p, i) => put('news/' + p.slug + '/index.html', postPage(p, posts.filter(x => x.slug !== p.slug).slice(0, 4), cfg)));

put('rss.xml', rss('PetrolMeets News', SITE + '/news/', 'Meet recaps, guides and news from the Austin car scene.', posts.slice(0, 30).map(p => ({ title: p.title, link: SITE + '/news/' + p.slug + '/', date: p.published_at, desc: p.dek || '' })), SITE + '/rss.xml'));
put('meets/rss.xml', rss('PetrolMeets: upcoming Austin car meets', SITE + '/meets/', 'Car meets, cruises and shows around Austin, checked by a person.', upcoming.slice(0, 60).map(m => ({ title: (noticeOf(m) ? NOTICE[noticeOf(m)] + ': ' : '') + m.title + ' · ' + fmt(m.starts_at, { weekday: 'short', month: 'short', day: 'numeric' }), link: SITE + '/meets/' + m.slug + '/', date: m.updated_at || m.starts_at, desc: meetDesc(m) })), SITE + '/meets/rss.xml'));

const urls = [['/', 'daily', '1.0'], ['/meets/', 'hourly', '0.9'], ['/news/', 'daily', '0.8'], ['/advertise/', 'weekly', '0.5'], ['/terms/', 'monthly', '0.2'], ['/privacy/', 'monthly', '0.2'], ['/guidelines/', 'monthly', '0.2']]
  .map(([u, f, p]) => `<url><loc>${SITE}${u}</loc><changefreq>${f}</changefreq><priority>${p}</priority></url>`)
  .concat(upcoming.map(m => `<url><loc>${SITE}/meets/${m.slug}/</loc><lastmod>${iso(m.updated_at || m.starts_at)}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`))
  .concat(posts.map(p => `<url><loc>${SITE}/news/${p.slug}/</loc><lastmod>${iso(p.updated_at || p.published_at)}</lastmod><priority>0.6</priority></url>`));
put('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
put('robots.txt', `User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /admin/\nDisallow: /go/\nDisallow: /meets/missing/\n\nSitemap: ${SITE}/sitemap.xml\n`);

// Homepage: real head tags + a plain list of meets/posts for crawlers (the app replaces it when JS runs).
const homeFile = join(ROOT, 'index.html');
if (existsSync(homeFile)) {
  let h = readFileSync(homeFile, 'utf8').replace(/<!--pm-seo-->[\s\S]*?<!--\/pm-seo-->/g, '');
  const desc = 'Car meets, cruises and car shows in Austin, Texas this week. Cars & coffee, JDM, Euro, trucks and more, checked by a person before they go on the map.';
  const ldSite = { '@context': 'https://schema.org', '@type': 'WebSite', name: 'PetrolMeets', url: SITE + '/' };
  const tags = `<!--pm-seo--><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${SITE}/"><meta property="og:title" content="PetrolMeets: every car meet in Austin, on one map"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${SITE}/og.png"><meta property="og:url" content="${SITE}/"><meta name="twitter:card" content="summary_large_image"><link rel="alternate" type="application/rss+xml" title="PetrolMeets News" href="${SITE}/rss.xml"><script type="application/ld+json">${JSON.stringify(ldSite)}</script><!--/pm-seo-->`;
  const body = `<!--pm-seo--><div id="pm-static" style="max-width:860px;margin:0 auto;padding:24px;font-family:system-ui,sans-serif;color:#222"><h1>Every car meet in Austin. One map.</h1><p>${esc(desc)}</p><h2>Coming up</h2><ul>${upcoming.slice(0, 40).map(m => `<li><a href="/meets/${m.slug}/">${esc(m.title)}</a> · ${esc(fmt(m.starts_at, { weekday: 'short', month: 'short', day: 'numeric' }))} ${esc(time(m.starts_at))} · ${esc(m.area || '')}</li>`).join('')}</ul><p><a href="/meets/">All meets</a> · <a href="/news/">News</a> · <a href="/advertise/">Advertise</a></p>${posts.length ? `<h2>News</h2><ul>${posts.slice(0, 6).map(p => `<li><a href="/news/${esc(p.slug)}/">${esc(p.title)}</a></li>`).join('')}</ul>` : ''}</div><!--/pm-seo-->`;
  h = h.replace(/<head>/i, '<head>' + tags).replace(/<body>/i, '<body>' + body);
  writeFileSync(homeFile, h);
}
console.log('site build done');
