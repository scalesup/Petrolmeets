// PetrolMeets · static site build (runs on Netlify on every deploy, every hour, and right after a post is published).
// Reads public data from Supabase and writes real HTML pages Google can read:
//   /meets/            this week's meets      /meets/<slug>/   one page per meet (Event schema)
//   /news/             MAGAZINE index         /news/<slug>/    one page per story (BlogPosting schema)
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

// ---------- shared page shell (Blaze v4 look · LIGHT / DARK, same as the homepage; choice in localStorage pm-theme) ----------
const CSS = `*{box-sizing:border-box}
:root{--bg:#EFECEE;--card:#FAF9FA;--well:#EFECEE;--track:#E4E0E3;--ph:#E2DEE1;--glass:rgba(250,249,250,.88);--ink:#15161A;--mute:#5E5A5E;--faint:#8A8489;--rule:#B8B2B7;--line:rgba(21,22,26,.07);--hot:#C2440A;--orange:#FE5807;--cyan:#22E4FE;--solid:#15161A;--on-solid:#FAF9FA;--hi:#fff;--script:#D24A08;--sh:0 1px 0 #fff inset,3px 4px 0 rgba(60,50,56,.05),8px 18px 34px -18px rgba(60,50,56,.4);--hs-c:3px 3px 0 #22E4FE;--hs-o:3px 3px 0 #FE5807;--hs-script:0 1px 0 #fff,2px 4px 10px rgba(210,74,8,.22);--n-bg:#FFF4D1;--n-ink:#7A5400;color-scheme:light}
html[data-theme=han]{--bg:#07060D;--card:#13101D;--well:#0C0A14;--track:#1B1727;--ph:#1D1929;--glass:rgba(16,13,26,.84);--ink:#F4F0FA;--mute:#B3ACC4;--faint:#8E88A3;--rule:#4A4361;--line:rgba(255,255,255,.08);--hot:#FF5AA9;--orange:#FF2E88;--solid:#FF2E88;--on-solid:#0B0A12;--hi:rgba(255,255,255,.07);--script:#22E4FE;--sh:0 1px 0 rgba(255,255,255,.07) inset,8px 18px 34px -18px rgba(0,0,0,.6);--hs-c:0 0 14px rgba(34,228,254,.55),2px 2px 0 #FF2E88;--hs-o:0 0 14px rgba(255,46,136,.6),2px 2px 0 #22E4FE;--hs-script:0 0 10px rgba(34,228,254,.8),0 0 30px rgba(34,228,254,.35);--n-bg:#2B2410;--n-ink:#F5B301;color-scheme:dark}
html[data-theme=han] body{background-image:radial-gradient(70% 45% at 90% -5%,rgba(255,46,136,.14),transparent 60%),radial-gradient(55% 40% at -5% 35%,rgba(34,228,254,.08),transparent 60%);background-attachment:fixed}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Archivo,system-ui,-apple-system,Segoe UI,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.5}
a{color:var(--hot);text-decoration:none}a:hover{color:var(--orange)}:focus-visible{outline:2px solid var(--orange);outline-offset:2px}
.w{max-width:880px;margin:0 auto;padding:0 clamp(16px,4.5vw,28px)}
.hd{position:sticky;top:0;z-index:20;padding:clamp(8px,2vw,12px) clamp(10px,2.5vw,16px) 0}
.hd .bar{max-width:1320px;margin:0 auto;border-radius:16px;background:var(--glass);backdrop-filter:blur(16px) saturate(1.3);-webkit-backdrop-filter:blur(16px) saturate(1.3);box-shadow:0 1px 0 var(--hi) inset,6px 14px 30px -12px rgba(60,50,56,.28);padding:0 clamp(10px,2vw,18px);min-height:62px;display:flex;align-items:center;gap:clamp(14px,3vw,32px)}
.logo{flex:none;display:flex;align-items:center;gap:10px;color:var(--ink)}.logo:hover{color:var(--ink)}.logo img{height:40px;width:auto;filter:drop-shadow(1px 2px 2px rgba(60,50,56,.18))}
.logo .p{font-family:Yellowtail,cursive;font-size:25px;line-height:1}.logo .m{font-weight:900;font-style:italic;font-stretch:125%;font-size:14px;letter-spacing:.02em}
.hd nav{display:flex;gap:clamp(14px,2.4vw,26px);flex:1;min-width:0;overflow-x:auto;white-space:nowrap;scrollbar-width:none}.hd nav a{font-size:14px;font-weight:500;color:var(--mute);padding:12px 0}.hd nav a.on{color:var(--ink);font-weight:700}
.look{flex:none;display:flex;gap:3px;padding:3px;border-radius:11px;background:var(--track);box-shadow:inset 2px 3px 6px rgba(0,0,0,.14)}
.look button{height:34px;padding:0 11px;border:0;border-radius:8px;background:none;color:var(--mute);font:800 10.5px/1 Archivo,system-ui,sans-serif;letter-spacing:.16em;cursor:pointer}
.look button[aria-pressed=true]{background:var(--cyan);color:#15161A}html[data-theme=han] .look button[aria-pressed=true]{background:#FF2E88;box-shadow:0 0 14px rgba(255,46,136,.6)}
@media (max-width:760px){.hd .bar{flex-wrap:wrap;padding-top:6px;padding-bottom:4px;row-gap:0}.hd nav{order:3;flex-basis:100%}.look{margin-left:auto}}
.k{display:flex;align-items:center;gap:10px;font-size:11px;font-weight:700;letter-spacing:.24em;color:var(--faint);text-transform:uppercase}.k:before{content:"";flex:none;width:14px;height:4px;background:var(--orange);transform:skewX(-24deg)}
.script{font-family:Yellowtail,cursive;font-weight:400;font-size:clamp(36px,5vw,56px);line-height:1;color:var(--script);text-shadow:var(--hs-script);transform:rotate(-3deg);transform-origin:left bottom;display:inline-block;margin:14px 0 -4px}
h1{font-weight:900;font-style:italic;font-stretch:120%;font-size:clamp(34px,6.4vw,64px);line-height:.98;letter-spacing:-.015em;margin:10px 0 16px;text-wrap:balance;text-shadow:var(--hs-c)}
h1.mag{font-stretch:125%;font-size:clamp(52px,11vw,120px);line-height:.9;margin-top:0;text-shadow:var(--hs-o)}
h2{font-weight:900;font-style:italic;font-stretch:118%;font-size:clamp(24px,3.4vw,32px);letter-spacing:-.01em;margin:44px 0 14px}
.mute{color:var(--mute)}.card{background:var(--card);border-radius:16px;padding:clamp(16px,2.6vw,22px);box-shadow:var(--sh)}
.row{display:grid;grid-template-columns:96px minmax(0,1fr);gap:10px 16px;margin:0}.row dt{color:var(--faint);font-size:11px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;padding-top:3px}.row dd{margin:0}
.btns{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.btn{height:48px;padding:0 18px;display:inline-flex;align-items:center;border-radius:12px;background:var(--cyan);color:#15161A;font-size:14px;font-weight:700;box-shadow:0 1px 0 rgba(255,255,255,.7) inset,0 -3px 0 rgba(0,120,140,.25) inset}.btn:hover{color:#15161A}
.btn.red{background:var(--solid);color:var(--on-solid);box-shadow:none}.btn.line{background:var(--well);color:var(--ink);box-shadow:0 1px 0 var(--hi) inset,0 -2px 0 rgba(0,0,0,.08) inset}
.notice{background:var(--n-bg);box-shadow:inset 0 0 0 1.5px #F5B301;border-radius:12px;padding:12px 16px;margin:12px 0}.notice b{color:var(--n-ink);font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}
ul.list{list-style:none;padding:0;margin:0;display:grid;gap:12px}ul.list a{display:block;color:var(--ink);transition:transform .2s}ul.list a:hover{transform:translateY(-2px)}ul.list .t{font-weight:700;font-size:19px;letter-spacing:-.01em;margin:4px 0 2px}
.dash{height:6px;margin:26px 0 0;background:repeating-linear-gradient(90deg,var(--orange) 0 34px,transparent 34px 56px);transform:skewX(-24deg);opacity:.9}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:20px;margin-top:28px}
.tile{display:grid;gap:12px;align-content:start;padding:10px 10px 20px;border-radius:20px;background:var(--card);color:var(--ink);box-shadow:var(--sh);transition:transform .2s}.tile:hover{transform:translateY(-4px);color:var(--ink)}
.tile .ph{aspect-ratio:3/2;border-radius:14px;background:var(--ph) center/cover no-repeat}.tile .k,.tile .t,.tile .d{padding:0 10px}.tile .t{font-size:20px;font-weight:700;line-height:1.25;letter-spacing:-.01em;text-wrap:pretty}.tile .d{font-size:15px;color:var(--mute)}
.tile.lead{grid-column:1/-1}@media (min-width:760px){.tile.lead{grid-template-columns:1.4fr 1fr;align-items:center;padding:12px}.tile.lead .ph{aspect-ratio:16/10}.tile.lead .t{font-size:clamp(26px,3vw,36px);font-weight:900;font-style:italic;font-stretch:115%;line-height:1.05}}
.cover{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:22px;margin:10px 0 26px;box-shadow:0 1px 0 var(--hi) inset,14px 30px 60px -20px rgba(60,50,56,.45)}
.dek{font-size:clamp(18px,2.4vw,22px);line-height:1.45;color:var(--mute);margin:0 0 8px;text-wrap:pretty}
.post{font-size:18px;line-height:1.7;color:var(--ink)}.post>p:first-child:first-letter{float:left;font-weight:900;font-style:italic;font-size:4.2em;line-height:.8;padding:.06em .1em 0 0;color:var(--orange)}
.post img{max-width:100%;border-radius:14px}.post h2,.post h3{color:var(--ink)}.post h3{font-size:22px;font-weight:800;margin:32px 0 8px}
.post blockquote{margin:28px 0;padding:4px 0 4px 20px;border-left:4px solid var(--orange);font-size:22px;font-weight:700;font-style:italic;line-height:1.4}
.ft{margin-top:72px;border-top:1px solid var(--line)}.ft .w{max-width:1320px;padding:44px clamp(16px,4.5vw,28px) 36px;display:grid;gap:22px;justify-items:center;text-align:center}
.ft img{height:72px;width:auto}.ft nav{display:flex;gap:10px 22px;flex-wrap:wrap;justify-content:center;font-size:14px}.ft nav a{color:var(--mute)}.ft small{font-size:12.5px;color:var(--faint)}`;
const LOOK = '<div class="look" role="group" aria-label="Site look"><button type="button" data-look="oconner" title="Light look">LIGHT</button><button type="button" data-look="han" title="Dark neon look">DARK</button></div>';
const THEME_EARLY = "<script>try{if(localStorage.getItem('pm-theme')==='han')document.documentElement.setAttribute('data-theme','han')}catch(e){}</script>";
const THEME_JS = "<script>(function(){var d=document.documentElement;function sync(){var h=d.getAttribute('data-theme')==='han';document.querySelectorAll('[data-look]').forEach(function(b){b.setAttribute('aria-pressed',String((b.getAttribute('data-look')==='han')===h))});var m=document.querySelector('meta[name=theme-color]');if(m)m.content=h?'#07060D':'#EFECEE'}document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-look]');if(!b)return;var t=b.getAttribute('data-look');if(t==='han')d.setAttribute('data-theme','han');else d.removeAttribute('data-theme');try{localStorage.setItem('pm-theme',t)}catch(x){}sync()});sync()})();</script>";
const head = ({ title, desc, path, image, ld, type = 'website', extra = '', on = '' }) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${THEME_EARLY}
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${SITE}${path}"><meta name="theme-color" content="#EFECEE">
<meta property="og:type" content="${type}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${SITE}${path}"><meta property="og:image" content="${esc(image || SITE + '/og.png')}"><meta property="og:site_name" content="PetrolMeets">
<meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/icons/icon-192.png"><link rel="alternate" type="application/rss+xml" title="PetrolMeets Magazine" href="${SITE}/rss.xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,100..900;1,62..125,100..900&family=Yellowtail&display=swap" rel="stylesheet">
<style>${CSS}</style>${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}${extra}</head><body>
<header class="hd"><div class="bar"><a class="logo" href="/"><img src="/assets/pm-emblem.png" alt=""><span class="p">Petrol</span><span class="m">MEETS</span></a><nav><a href="/meets/"${on === 'meets' ? ' class="on"' : ''}>Meets</a><a href="/#map">Map</a><a href="/news/"${on === 'mag' ? ' class="on"' : ''}>Magazine</a><a href="/#join">Promoters</a><a href="/advertise/">Advertise</a></nav>${LOOK}</div></header>`;
const foot = (cfg) => `<footer class="ft"><div class="w"><img src="/assets/pm-emblem.png" alt=""><nav><a href="/meets/">All meets</a><a href="/news/">Magazine</a><a href="/advertise/">Advertise</a><a href="/rss.xml">RSS</a><a href="/terms/">Terms</a><a href="/privacy/">Privacy</a><a href="/guidelines/">Guidelines</a>${cfg.ios ? `<a href="${esc(cfg.ios)}">App Store</a>` : ''}${cfg.android ? `<a href="${esc(cfg.android)}">Google Play</a>` : ''}<a href="mailto:info@petrolmeets.com">info@petrolmeets.com</a></nav>${LOOK}<small>© ${new Date().getFullYear()} PetrolMeets · Austin, Texas</small></div></footer>${THEME_JS}</body></html>`;
const getApp = cfg => cfg.app_public && (cfg.ios || cfg.android)
  ? `<div class="card"><b style="font-size:19px">Get PetrolMeets on your phone</b><p class="mute" style="margin:6px 0 0">Drive mode, convoys with friends and check-ins live in the app.</p><div class="btns">${cfg.ios ? `<a class="btn" href="${esc(cfg.ios)}">App Store</a>` : ''}${cfg.android ? `<a class="btn" href="${esc(cfg.android)}">Google Play</a>` : ''}</div></div>`
  : `<div class="card"><span class="script" style="font-size:36px;margin:0 0 4px">The weekly</span><div style="font-weight:900;font-style:italic;font-stretch:118%;font-size:22px;line-height:1.1">THE WEEKEND’S MEETS, BEFORE THE WEEKEND.</div><p class="mute" style="margin:8px 0 0">Free. One email every Thursday. The app for iPhone and Android is coming soon.</p><div class="btns"><a class="btn" href="/#newsletter">Get the weekly →</a></div></div>`;

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
  return head({ title: `${n ? NOTICE[n] + ': ' : ''}${m.title} · ${fmt(m.starts_at, { weekday: 'short', month: 'short', day: 'numeric' })} · ${m.area || 'Austin'} car meet | PetrolMeets`, desc: meetDesc(m), path, ld: [ld, crumbs], type: 'event', on: 'meets' })
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
  return head({ title: 'Car meets in Austin this week | PetrolMeets', desc: `${list.length} car meets, cruises and car shows around Austin, Texas coming up. Cars & coffee, JDM, Euro, trucks and more.`, path: '/meets/', ld, on: 'meets' })
    + `<main class="w" style="padding-top:36px"><div class="k">Austin, TX · ${list.length} coming up</div><span class="script">Every car meet in</span><h1 class="mag" style="text-shadow:var(--hs-c)">AUSTIN</h1><div class="btns"><a class="btn" href="/#map">Open the map →</a></div><div class="dash"></div>`
    + groups.map(g => `<h2>${esc(g.k)}</h2><ul class="list">${g.items.map(m => { const n = noticeOf(m); return `<li><a class="card" href="/meets/${m.slug}/"><span class="k">${esc(time(m.starts_at))} · ${esc(m.kind === 'drive' ? 'Drive' : m.kind === 'event' ? 'Event' : 'Meet')}${n ? ' · ' + esc(NOTICE[n]) : ''}</span><div class="t">${esc(m.title)}</div><span class="mute">${esc(m.area || '')}${m.scenes?.length ? ' · ' + esc(m.scenes.join(', ')) : ''}</span></a></li>`; }).join('')}</ul>`).join('')
    + (list.length ? '' : '<p>No meets on the map right now. New ones go up every night.</p>')
    + `<div style="margin-top:28px">${getApp(cfg)}</div></main>` + foot(cfg);
}

const tagOf = p => p.sponsor ? 'Partner · ' + p.sponsor.advertiser : (p.tag || 'Feature');
const coverStyle = p => p.cover_url && /^https:\/\//.test(p.cover_url) ? ` style="background-image:url('${esc(p.cover_url).replace(/'/g, '%27')}')"` : '';
const tile = (p, lead) => `<a class="tile${lead ? ' lead' : ''}" href="/news/${esc(p.slug)}/"><div class="ph"${coverStyle(p)}></div><div style="display:grid;gap:10px"><span class="k">${esc(tagOf(p))} · ${esc(fmt(p.published_at, { month: 'short', day: 'numeric' }))}</span><span class="t">${esc(p.title)}</span>${p.dek ? `<span class="d">${esc(p.dek)}</span>` : ''}</div></a>`;

function postPage(p, recent, cfg) {
  const path = '/news/' + p.slug + '/', title = p.seo_title || p.title, desc = p.seo_desc || p.dek || p.title;
  const ld = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: desc, datePublished: iso(p.published_at), dateModified: iso(p.updated_at || p.published_at),
    author: { '@type': 'Organization', name: p.author || 'PetrolMeets' }, publisher: { '@type': 'Organization', name: 'PetrolMeets', logo: { '@type': 'ImageObject', url: SITE + '/icons/icon-512.png' } },
    mainEntityOfPage: SITE + path, image: [p.cover_url || SITE + '/og.png'] };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Magazine', item: SITE + '/news/' }, { '@type': 'ListItem', position: 2, name: p.title, item: SITE + path }] };
  return head({ title: title + ' | PetrolMeets Magazine', desc, path, image: p.cover_url, ld: [ld, crumbs], type: 'article', on: 'mag' })
    + `<main class="w" style="padding-top:40px"><a href="/news/" class="k">Magazine · ${esc(tagOf(p))}</a><h1>${esc(p.title)}</h1>`
    + (p.dek ? `<p class="dek">${esc(p.dek)}</p>` : '')
    + `<p class="mute" style="font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;margin:12px 0 0">${esc(p.author || 'PetrolMeets')} · ${esc(fmt(p.published_at, { month: 'long', day: 'numeric', year: 'numeric' }))}</p>`
    + (p.cover_url ? `<img class="cover" src="${esc(p.cover_url)}" alt="">` : '<div class="dash" style="margin:26px 0 30px"></div>')
    + (p.sponsor ? `<p class="mute" style="font-size:14px">This story is sponsored by ${p.sponsor.link ? `<a href="${esc(p.sponsor.link)}" rel="sponsored noopener">${esc(p.sponsor.advertiser)}</a>` : esc(p.sponsor.advertiser)}.</p>` : '')
    + `<article class="post">${md(p.body_md)}</article>`
    + (recent.length ? `<h2>More from the Magazine</h2><div class="grid" style="margin-top:0">${recent.map(r => tile(r)).join('')}</div>` : '')
    + `<div style="margin-top:36px">${getApp(cfg)}</div></main>` + foot(cfg);
}

function newsIndex(posts, cfg) {
  return head({ title: 'PetrolMeets Magazine: the Austin car scene', desc: 'Meet recaps, builds, new spots and guides from the Austin car scene.', path: '/news/', on: 'mag' })
    + `<main class="w" style="max-width:1320px;padding-top:40px"><span class="k">PetrolMeets · Austin, TX</span><span class="script">The</span><h1 class="mag">MAGAZINE</h1><p class="dek" style="max-width:560px">Meet recaps, builds, new spots and guides from the Austin car scene.</p><div class="dash"></div>`
    + (posts.length ? `<div class="grid">${posts.map((p, i) => tile(p, i === 0)).join('')}</div>` : '<div class="card" style="margin-top:28px;max-width:880px"><b style="font-size:19px">The first issue is on the way.</b><p class="mute" style="margin:6px 0 0"><a href="/#newsletter">Get the weekly</a> and you won’t miss it.</p></div>')
    + `<div style="margin-top:40px;max-width:880px">${getApp(cfg)}</div></main>` + foot(cfg);
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

put('rss.xml', rss('PetrolMeets Magazine', SITE + '/news/', 'Meet recaps, builds, guides and news from the Austin car scene.', posts.slice(0, 30).map(p => ({ title: p.title, link: SITE + '/news/' + p.slug + '/', date: p.published_at, desc: p.dek || '' })), SITE + '/rss.xml'));
put('meets/rss.xml', rss('PetrolMeets: upcoming Austin car meets', SITE + '/meets/', 'Car meets, cruises and shows around Austin.', upcoming.slice(0, 60).map(m => ({ title: (noticeOf(m) ? NOTICE[noticeOf(m)] + ': ' : '') + m.title + ' · ' + fmt(m.starts_at, { weekday: 'short', month: 'short', day: 'numeric' }), link: SITE + '/meets/' + m.slug + '/', date: m.updated_at || m.starts_at, desc: meetDesc(m) })), SITE + '/meets/rss.xml'));

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
  const desc = 'Car meets, cruises and car shows in Austin, Texas this week. Cars & coffee, JDM, Euro, trucks and more.';
  const ldSite = { '@context': 'https://schema.org', '@type': 'WebSite', name: 'PetrolMeets', url: SITE + '/' };
  const tags = `<!--pm-seo--><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${SITE}/"><meta property="og:title" content="PetrolMeets: every car meet in Austin, on one map"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${SITE}/og.png"><meta property="og:url" content="${SITE}/"><meta name="twitter:card" content="summary_large_image"><link rel="alternate" type="application/rss+xml" title="PetrolMeets News" href="${SITE}/rss.xml"><script type="application/ld+json">${JSON.stringify(ldSite)}</script><!--/pm-seo-->`;
  const body = `<!--pm-seo--><div id="pm-static" style="max-width:860px;margin:0 auto;padding:24px;font-family:system-ui,sans-serif;color:#222"><h1>Every car meet in Austin. One map.</h1><p>${esc(desc)}</p><h2>Coming up</h2><ul>${upcoming.slice(0, 40).map(m => `<li><a href="/meets/${m.slug}/">${esc(m.title)}</a> · ${esc(fmt(m.starts_at, { weekday: 'short', month: 'short', day: 'numeric' }))} ${esc(time(m.starts_at))} · ${esc(m.area || '')}</li>`).join('')}</ul><p><a href="/meets/">All meets</a> · <a href="/news/">News</a> · <a href="/advertise/">Advertise</a></p>${posts.length ? `<h2>News</h2><ul>${posts.slice(0, 6).map(p => `<li><a href="/news/${esc(p.slug)}/">${esc(p.title)}</a></li>`).join('')}</ul>` : ''}</div><!--/pm-seo-->`;
  h = h.replace(/<head>/i, '<head>' + tags).replace(/<body>/i, '<body>' + body);
  writeFileSync(homeFile, h);
}
console.log('site build done');
