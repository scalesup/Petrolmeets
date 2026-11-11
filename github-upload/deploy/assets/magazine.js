/* PetrolMeets Magazine renderer (shared by /news/ and /admin/magazine/). No dependencies.
 *
 * Data:  { sponsors:{live:[{id,advertiser,headline,link,logo}],price}, issues:[{slug,month,number,title,cover,spreads:[{id,week,title,pages:[page,page],published_at}]}], posts:{slug:{title,dek,tag,cover_url,author,body_md,published_at}}, meets:[...] }
 * page:  { layout:'feature'|'hero2'|'grid4'|'split'|'list'|'photo'|'free', bg?:'paper'|'ink', items:[item] }
 * item:  { type:'post', post:'slug', title?, dek?, image? }   (title/dek/image override the post's own)
 *        { type:'text', title, body }   { type:'image', image, caption }   { type:'meets', title? }
 *        { type:'sponsor', spot? }   paid sponsor box (spot 1, 2, 3… picks which live sponsor; empty = 'Sponsor this page' box)
 *        any item may add box:{x,y,w,h} (percent of the page) to sit anywhere; otherwise it fills the next layout slot.
 * cover: { mode:'auto'|'image', image_url, photo_url, photo_pos, kicker, headline, sub, lines:[{text,tag}], burst, accent }
 *
 * PMMag.reader(el, data, {start, onOpenPost})       flip-through reader
 * PMMag.page(page, ctx) / PMMag.cover(issue, ctx)  single page elements (editor previews)
 */
(function () {
  'use strict';
  var LAYOUTS = {
    feature: { label: 'Feature (1 big story)', slots: [{ x: 0, y: 0, w: 100, h: 100, size: 'xl' }] },
    photo:   { label: 'Full-page photo', slots: [{ x: 0, y: 0, w: 100, h: 100, size: 'poster' }] },
    hero2:   { label: 'Big story + 2', slots: [{ x: 5, y: 8, w: 90, h: 53, size: 'l' }, { x: 5, y: 63, w: 44, h: 30, size: 'm' }, { x: 51, y: 63, w: 44, h: 30, size: 'm' }] },
    grid4:   { label: '4 stories', slots: [{ x: 5, y: 8, w: 44, h: 42, size: 'm' }, { x: 51, y: 8, w: 44, h: 42, size: 'm' }, { x: 5, y: 52, w: 44, h: 41, size: 'm' }, { x: 51, y: 52, w: 44, h: 41, size: 'm' }] },
    split:   { label: '2 stories stacked', slots: [{ x: 5, y: 8, w: 90, h: 42, size: 'l' }, { x: 5, y: 52, w: 90, h: 41, size: 'l' }] },
    list:    { label: 'Headline list', slots: [{ x: 5, y: 8, w: 90, h: 85, size: 'list' }] },
    free:    { label: 'Freeform (drag anywhere)', slots: [] }
  };
  var TAGC = { 'NEWS': '#FE5807', 'MEET RECAP': '#E3170A', 'GUIDE': '#16A3C2', 'VENDORS': '#7A3FD1', 'THIS WEEKEND': '#E3170A', 'SPONSORED': '#5E5A5E' };
  var MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u) { u = String(u || ''); return /^https:\/\/[^\s"'()<>]+$/.test(u) ? u : ''; }
  function md(src) {
    function inl(t) {
      return esc(t).replace(/!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, function (m, a, h) { return '<a href="' + h + '"' + (/^https?:\/\/(?!petrolmeets\.com)/.test(h) ? ' rel="noopener" target="_blank"' : '') + '>' + a + '</a>'; })
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    }
    return String(src || '').replace(/\r/g, '').trim().split(/\n{2,}/).map(function (b) {
      if (/^### /.test(b)) return '<h4>' + inl(b.slice(4)) + '</h4>';
      if (/^## /.test(b)) return '<h3>' + inl(b.slice(3)) + '</h3>';
      if (/^\s*[-*] /.test(b)) return '<ul>' + b.split('\n').map(function (l) { return '<li>' + inl(l.replace(/^\s*[-*] /, '')) + '</li>'; }).join('') + '</ul>';
      if (/^\s*\d+\. /.test(b)) return '<ol>' + b.split('\n').map(function (l) { return '<li>' + inl(l.replace(/^\s*\d+\. /, '')) + '</li>'; }).join('') + '</ol>';
      if (/^> /.test(b)) return '<blockquote>' + inl(b.replace(/^> ?/gm, '')) + '</blockquote>';
      return '<p>' + inl(b).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }
  function monthTag(issue) { var d = new Date(String(issue.month || issue.slug + '-01') + 'T12:00:00Z'); return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function fmtDay(d) { try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(d)); } catch (e) { return ''; } }
  function fmtTime(d) { try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(new Date(d)).replace(':00', ''); } catch (e) { return ''; } }
  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  // ---------- styles ----------
  var CSS = '\
.pmm-page{position:relative;container-type:inline-size;width:100%;aspect-ratio:8.5/11;background:#FBF8F1;color:#141414;overflow:hidden;font-family:Archivo,system-ui,sans-serif;-webkit-font-smoothing:antialiased;user-select:none}\
.pmm-page.ink{background:#111013;color:#F4F1EA}\
.pmm-page:after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(0,0,0,var(--gut,0)) 0,transparent 7%);mix-blend-mode:multiply}\
.pmm-page.left:after{background:linear-gradient(270deg,rgba(0,0,0,.16) 0,transparent 6%)}.pmm-page.right:after{background:linear-gradient(90deg,rgba(0,0,0,.18) 0,transparent 6%)}\
.pmm-run{position:absolute;left:5%;right:5%;top:2.2%;display:flex;justify-content:space-between;align-items:center;font-size:1.55cqw;font-weight:800;letter-spacing:.2em;text-transform:uppercase;border-bottom:.35cqw solid currentColor;padding-bottom:.9cqw;z-index:3}\
.pmm-run b{font-style:italic;font-stretch:125%;letter-spacing:.06em;font-size:1.9cqw}.pmm-run i{font-style:normal;color:#E3170A}\
.pmm-num{position:absolute;bottom:2.2%;font-size:1.6cqw;font-weight:800;letter-spacing:.18em;z-index:3}.pmm-page.left .pmm-num{left:5%}.pmm-page.right .pmm-num{right:5%}\
.pmm-it{position:absolute;container-type:size;overflow:hidden;cursor:pointer;text-align:left;border:0;padding:0;background:none;color:inherit;font:inherit}\
.pmm-it:focus-visible{outline:.5cqw solid #22E4FE;outline-offset:.3cqw}\
.pmm-ph{position:absolute;inset:0;background:#1A1A1E center/cover no-repeat}\
.pmm-art{position:absolute;inset:0;overflow:hidden;background:#141418}\
.pmm-art:before{content:"";position:absolute;inset:-40%;background:repeating-linear-gradient(115deg,transparent 0 9%,var(--c) 9% 13%,transparent 13% 16%,#22E4FE 16% 17.5%,transparent 17.5% 30%)}\
.pmm-art span{position:absolute;right:4%;bottom:2%;font-weight:900;font-style:italic;font-stretch:125%;font-size:18cqh;line-height:.85;color:transparent;-webkit-text-stroke:.5cqh rgba(255,255,255,.55);text-transform:uppercase;white-space:nowrap}\
.pmm-k{display:inline-block;background:var(--c,#E3170A);color:#fff;font-weight:900;font-style:italic;letter-spacing:.1em;text-transform:uppercase;padding:.25em .55em .2em;transform:skewX(-10deg)}\
.pmm-t{font-weight:900;font-style:italic;font-stretch:118%;line-height:.95;letter-spacing:-.01em;text-transform:uppercase;text-wrap:balance}\
.pmm-d{line-height:1.3;opacity:.82;text-wrap:pretty}\
.pmm-tx>*{flex:none}.pmm-tx .pmm-d{flex:0 1 auto;min-height:0;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}.pmm-tx .pmm-k{align-self:flex-start}.pmm-tx .pmm-t{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden;padding-bottom:.08em}\
.pmm-go{font-weight:900;letter-spacing:.14em;font-size:max(9px,4cqh);color:#E3170A}\
/* size L / M: photo on top, text under */\
.pmm-it.s-l .pmm-pw,.pmm-it.s-m .pmm-pw{position:absolute;left:0;right:0;top:0;height:60%}\
.pmm-it.s-l .pmm-tx,.pmm-it.s-m .pmm-tx{position:absolute;left:0;right:0;top:62%;bottom:0;display:flex;flex-direction:column;gap:2.2cqh}\
.pmm-it.s-l .pmm-k{font-size:5cqh}.pmm-it.s-l .pmm-t{font-size:min(10cqh,7.4cqw)}.pmm-it.s-l .pmm-d{font-size:min(5cqh,3.6cqw)}\
.pmm-it.s-m .pmm-k{font-size:5.2cqh}.pmm-it.s-m .pmm-t{font-size:min(9cqh,9.5cqw)}.pmm-it.s-m .pmm-d{display:none}\
.pmm-it.s-s .pmm-pw{display:none}.pmm-it.s-s .pmm-tx{position:absolute;inset:0;display:flex;flex-direction:column;gap:3cqh;justify-content:center;border-top:1.2cqh solid var(--c);padding-top:3cqh}\
.pmm-it.s-s .pmm-k{font-size:min(9cqh,5cqw)}.pmm-it.s-s .pmm-t{font-size:min(16cqh,9cqw)}.pmm-it.s-s .pmm-d{display:none}\
/* XL feature and poster */\
.pmm-it.s-xl .pmm-pw{position:absolute;left:0;right:0;top:0;height:64%}\
.pmm-it.s-xl .pmm-tx{position:absolute;left:5%;right:5%;top:57%;bottom:5%;display:flex;flex-direction:column;gap:1.6cqh;z-index:2}\
.pmm-it.s-xl .pmm-k{font-size:2.4cqh;align-self:flex-start}.pmm-it.s-xl .pmm-t{font-size:min(7.2cqh,9.6cqw);background:var(--bgc,#FBF8F1);padding:1.2cqh 2cqw 0 0;align-self:flex-start;max-width:96%}\
.pmm-it.s-xl .pmm-d{font-size:min(2.5cqh,3.4cqw);max-width:80%}\
.pmm-it.s-poster .pmm-pw{position:absolute;inset:0}.pmm-it.s-poster .pmm-pw:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.05) 40%,rgba(0,0,0,.82))}\
.pmm-it.s-poster .pmm-tx{position:absolute;left:6%;right:6%;bottom:7%;display:flex;flex-direction:column;gap:1.4cqh;color:#fff;z-index:2}\
.pmm-it.s-poster .pmm-k{font-size:2.3cqh;align-self:flex-start}.pmm-it.s-poster .pmm-t{font-size:min(10cqh,13cqw);text-shadow:.3cqh .4cqh 0 #000,0 0 2cqh rgba(0,0,0,.5)}.pmm-it.s-poster .pmm-d{font-size:min(2.6cqh,3.6cqw);max-width:85%}\
/* list */\
.pmm-list{position:absolute;inset:0;display:flex;flex-direction:column}\
.pmm-list .pmm-lh small{display:block;font-family:Archivo,system-ui,sans-serif;font-style:normal;font-stretch:100%;font-size:.24em;letter-spacing:.2em;margin-top:1.2cqh}\
.pmm-list .pmm-lh{font-weight:900;font-style:italic;font-stretch:125%;font-size:min(9cqh,14cqw);line-height:.9;text-transform:uppercase;margin-bottom:2cqh}.pmm-list .pmm-lh em{font-family:Yellowtail,cursive;font-style:normal;font-stretch:100%;text-transform:none;color:#E3170A;font-weight:400}\
.pmm-list button{display:grid;grid-template-columns:auto 1fr;gap:0 3cqw;align-items:start;text-align:left;border:0;border-top:.35cqh solid currentColor;background:none;color:inherit;font:inherit;padding:1.6cqh 0;cursor:pointer}\
.pmm-list .n{font-weight:900;font-style:italic;font-size:min(6.5cqh,11cqw);line-height:.9;color:#E3170A;min-width:2ch}.pmm-list .pmm-t{font-size:min(3.6cqh,6cqw)}.pmm-list .pmm-d{font-size:min(2cqh,3.6cqw);margin-top:.6cqh}\
/* text, image, meets */\
.pmm-text{position:absolute;inset:0;padding:5cqh 5cqw;background:#FFD400;color:#141414;display:flex;flex-direction:column;gap:3cqh;overflow:hidden}\
.pmm-page.ink .pmm-text{background:#22E4FE}\
.pmm-text .pmm-t{font-size:min(9cqh,11cqw)}.pmm-text .b{font-size:min(4.6cqh,5.6cqw);line-height:1.35}.pmm-text .b p{margin:0 0 .6em}.pmm-text .b a{color:#141414;font-weight:800}\
.pmm-img figcaption{position:absolute;left:0;right:0;bottom:0;padding:2.5cqh 3cqw;font-size:min(4.2cqh,4cqw);font-weight:700;color:#fff;background:linear-gradient(180deg,transparent,rgba(0,0,0,.75))}\
.pmm-meets{position:absolute;inset:0;background:#141414;color:#fff;padding:4cqh 4cqw;display:flex;flex-direction:column}\
.pmm-meets .pmm-t{font-size:min(8cqh,10cqw);color:#FFD400}.pmm-meets ol{list-style:none;margin:2cqh 0 0;padding:0;display:flex;flex-direction:column;gap:0}\
.pmm-meets li{display:grid;grid-template-columns:auto 1fr;gap:2cqw;border-top:.3cqh solid rgba(255,255,255,.18);padding:1.4cqh 0;font-size:min(3.4cqh,4.4cqw);line-height:1.15}\
.pmm-meets li b{color:#22E4FE;font-weight:900;font-style:italic;white-space:nowrap}.pmm-meets li span{font-weight:700}.pmm-meets li small{display:block;opacity:.6;font-size:.82em;font-weight:500}\
.pmm-sp{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:2.6cqh;padding:5cqh 5cqw;background:#fff;color:#141414;border:1cqh solid #141414;text-decoration:none}\
.pmm-sp .lab{position:absolute;top:0;right:0;background:#141414;color:#FFD400;font-weight:900;letter-spacing:.18em;font-size:min(4.6cqh,3.4cqw);padding:1cqh 2.4cqw}\
.pmm-sp .lg{width:min(22cqh,22cqw);height:min(22cqh,22cqw);border-radius:50%;background:#141414 center/cover no-repeat;color:#FFD400;display:grid;place-items:center;font-weight:900;font-style:italic;font-size:min(8cqh,8cqw)}\
.pmm-sp .pmm-t{font-size:min(10cqh,9cqw)}.pmm-sp .pmm-d{font-size:min(5.4cqh,5cqw);opacity:1;font-weight:700}.pmm-sp .go{font-weight:900;letter-spacing:.12em;font-size:min(4.6cqh,4cqw);color:#E3170A}\
.pmm-sp.house{background:repeating-linear-gradient(135deg,#FFD400 0 6cqw,#141414 6cqw 7.2cqw);border-color:#141414}.pmm-sp.house .in{background:#FFD400;padding:4cqh 4cqw;display:flex;flex-direction:column;gap:2cqh;border:.6cqh solid #141414}\
.pmm-meets a{margin-top:auto;color:#FFD400;font-weight:900;letter-spacing:.14em;font-size:min(3.4cqh,4cqw)}\
/* cover */\
.pmm-cover{background:#0C0C0E;color:#fff}\
.pmm-cover .bgp{position:absolute;inset:0;background:#15141A center/cover no-repeat}\
.pmm-cover .bgp.none{background:radial-gradient(120% 70% at 70% 70%,#2B1A10 0,#0C0C0E 60%)}\
.pmm-cover .bgp.none:before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(118deg,transparent 0 22%,rgba(254,88,7,.85) 22% 27%,transparent 27% 30%,rgba(34,228,254,.8) 30% 31.5%,transparent 31.5% 100%)}\
.pmm-cover .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.55) 0,rgba(0,0,0,0) 26%,rgba(0,0,0,0) 55%,rgba(0,0,0,.7) 100%)}\
.pmm-cover .kick{position:absolute;left:4.5%;right:4.5%;top:2.2%;display:flex;justify-content:space-between;font-size:2.1cqw;font-weight:900;letter-spacing:.18em;text-transform:uppercase;text-shadow:0 .2cqw .6cqw rgba(0,0,0,.6)}\
.pmm-cover .kick i{font-style:normal;color:#FFD400}\
.pmm-cover .mast{position:absolute;left:3%;right:3%;top:5.2%;line-height:.78;z-index:2}\
.pmm-cover .mast .p{font-family:Yellowtail,cursive;font-size:13cqw;color:#FFD400;display:block;transform:rotate(-6deg) translate(1cqw,1.2cqw);text-shadow:.4cqw .5cqw 0 #E3170A,.9cqw 1cqw 0 rgba(0,0,0,.55);position:relative;z-index:2;width:max-content}\
.pmm-cover .mast .m{display:block;font-weight:900;font-style:italic;font-stretch:125%;font-size:21.5cqw;letter-spacing:-.04em;background:linear-gradient(180deg,#FFFFFF 0,#E9EEF3 38%,#8C98A6 50%,#FFFFFF 58%,#C9D2DC 78%,#FFFFFF 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:.25cqw #0B0B0D;filter:drop-shadow(.6cqw .8cqw 0 #E3170A) drop-shadow(0 0 1.2cqw rgba(0,0,0,.5));white-space:nowrap}\
.pmm-cover .issue{position:absolute;right:4%;top:24.5%;background:#E3170A;color:#fff;font-weight:900;font-style:italic;font-size:2.5cqw;letter-spacing:.08em;padding:.8cqw 1.6cqw;transform:skewX(-10deg);z-index:2}\
.pmm-cover .lines{position:absolute;left:4.5%;top:32%;width:46%;display:flex;flex-direction:column;gap:2.4cqw;z-index:2}\
.pmm-cover .ln{font-weight:900;font-style:italic;font-stretch:115%;text-transform:uppercase;font-size:4.2cqw;line-height:.95;color:#fff;text-shadow:.35cqw .45cqw 0 #000}\
.pmm-cover .ln:nth-child(3n+2){color:#FFD400}.pmm-cover .ln:nth-child(3n+3){color:#22E4FE}\
.pmm-cover .ln em{display:inline-block;font-style:italic;font-size:.62em;background:#E3170A;color:#fff;text-shadow:none;padding:.15em .4em;margin-bottom:.35em;letter-spacing:.08em;transform:skewX(-10deg)}\
.pmm-cover .burst{position:absolute;right:5%;top:33%;width:22cqw;height:22cqw;display:grid;place-items:center;text-align:center;background:#FFD400;color:#141414;clip-path:polygon(50% 0,58% 13%,72% 5%,74% 20%,90% 17%,84% 32%,99% 38%,87% 49%,98% 62%,83% 67%,88% 83%,72% 80%,67% 96%,55% 85%,45% 98%,38% 84%,23% 92%,22% 76%,6% 76%,14% 62%,1% 52%,14% 42%,4% 28%,20% 25%,19% 9%,34% 14%,42% 1%);transform:rotate(12deg);z-index:2}\
.pmm-cover .burst span{width:70%;font-weight:900;font-style:italic;font-size:3.2cqw;line-height:.95;text-transform:uppercase}\
.pmm-cover .hl{position:absolute;left:4.5%;right:4.5%;bottom:13.5%;z-index:2}\
.pmm-cover .hl b{display:block;font-weight:900;font-style:italic;font-stretch:125%;text-transform:uppercase;font-size:11.5cqw;line-height:.86;color:#FFD400;text-shadow:.5cqw .6cqw 0 #E3170A,1cqw 1.2cqw 0 rgba(0,0,0,.7);text-wrap:balance}\
.pmm-cover .hl span{display:block;margin-top:1.6cqw;font-weight:800;font-size:3.1cqw;text-transform:uppercase;letter-spacing:.04em;text-shadow:0 .2cqw .6cqw #000;max-width:70%}\
.pmm-cover .bar{position:absolute;right:4%;bottom:2.6%;background:#fff;color:#000;padding:1cqw 1.4cqw .6cqw;display:flex;flex-direction:column;align-items:center;gap:.3cqw;z-index:2;font-size:1.5cqw;font-weight:800;letter-spacing:.12em}\
.pmm-cover .bar svg{width:15cqw;height:6.5cqw;display:block}\
.pmm-cover .price{position:absolute;left:4.5%;bottom:3%;font-weight:900;font-size:2.2cqw;letter-spacing:.12em;z-index:2;text-shadow:0 .2cqw .5cqw #000}\
.pmm-cover.image .full{position:absolute;inset:0;background:#0C0C0E center/cover no-repeat}\
/* back cover */\
.pmm-back{background:#E3170A;color:#fff;display:flex;flex-direction:column;justify-content:center;padding:0 9%}\
.pmm-back .p{font-family:Yellowtail,cursive;font-size:11cqw;color:#FFD400;transform:rotate(-5deg);display:inline-block;text-shadow:.4cqw .5cqw 0 #000}\
.pmm-back .m{font-weight:900;font-style:italic;font-stretch:125%;font-size:9.5cqw;line-height:.9;text-transform:uppercase}\
.pmm-back p{font-size:3.6cqw;font-weight:600;line-height:1.35;margin:4cqw 0}\
.pmm-back a{align-self:flex-start;background:#FFD400;color:#141414;font-weight:900;font-size:3.4cqw;letter-spacing:.08em;padding:2.4cqw 4cqw;text-decoration:none;transform:skewX(-8deg)}\
.pmm-back small{position:absolute;left:9%;bottom:4%;font-size:1.8cqw;font-weight:800;letter-spacing:.2em}\
/* edit mode */\
.pmm-page.edit .pmm-it{outline:.25cqw dashed rgba(34,228,254,.0)}.pmm-page.edit .pmm-it:hover{outline-color:rgba(34,228,254,.9)}\
.pmm-page.edit .pmm-it.sel{outline:.5cqw solid #22E4FE;z-index:20}.pmm-page.edit .pmm-it.boxed{z-index:10}\
.pmm-page.edit .pmm-empty{position:absolute;border:.35cqw dashed rgba(127,127,127,.55);display:grid;place-items:center;font-size:2cqw;font-weight:800;letter-spacing:.14em;color:rgba(127,127,127,.9);text-transform:uppercase}\
.pmm-h{position:absolute;width:3cqw;height:3cqw;right:-1.5cqw;bottom:-1.5cqw;background:#22E4FE;border:.4cqw solid #141414;border-radius:50%;cursor:nwse-resize;z-index:30}\
/* reader */\
.pmm-r{--pw:300px;position:relative;display:flex;flex-direction:column;align-items:center;gap:14px;font-family:Archivo,system-ui,sans-serif}\
.pmm-bar{position:relative;z-index:10;width:100%;max-width:1320px;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px}\
.pmm-bar select{width:auto}.pmm-bar select,.pmm-bar button{height:40px;border:0;border-radius:10px;padding:0 14px;font:800 12px/1 Archivo,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;background:var(--card,#fff);color:var(--ink,#141414);box-shadow:0 1px 0 var(--hi,#fff) inset,3px 6px 14px -8px rgba(0,0,0,.4)}\
.pmm-bar button[aria-current=true]{background:#E3170A;color:#fff}\
.pmm-bar .chips{display:flex;gap:6px;overflow-x:auto;max-width:100%;scrollbar-width:none;padding:2px}\
.pmm-desk{position:relative;display:flex;align-items:center;justify-content:center;gap:10px;width:100%}\
.pmm-arrow{flex:none;width:46px;height:46px;border-radius:50%;border:0;background:var(--card,#fff);color:var(--ink,#141414);font-size:22px;font-weight:900;cursor:pointer;box-shadow:3px 6px 14px -6px rgba(0,0,0,.45)}.pmm-arrow:disabled{opacity:.3;cursor:default}\
.pmm-book{position:relative;width:calc(var(--pw) * var(--n,2));height:calc(var(--pw) * 11 / 8.5);perspective:calc(var(--pw) * 6);touch-action:pan-y}\
.pmm-slot{position:absolute;top:0;width:var(--pw);height:100%;box-shadow:0 20px 40px -18px rgba(0,0,0,.55)}.pmm-slot.L{left:0}.pmm-slot.R{right:0}.pmm-slot:empty{box-shadow:none}\
.pmm-leaf{position:absolute;top:0;width:var(--pw);height:100%;transform-style:preserve-3d;z-index:5;transition:transform .75s cubic-bezier(.45,.05,.25,1)}\
.pmm-leaf>div{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden}.pmm-leaf>.back{transform:rotateY(180deg)}\
.pmm-leaf>div:after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(0,0,0,.0),rgba(0,0,0,.18));opacity:var(--shade,0);transition:opacity .75s}\
@media (max-width:819px){.pmm-desk{flex-wrap:wrap;gap:14px}.pmm-book{order:1;margin:0 calc(50% - var(--pw) / 2)}.pmm-arrow{order:2}}\
.pmm-count{font:800 11px/1 Archivo,system-ui,sans-serif;letter-spacing:.2em;color:var(--faint,#888);text-transform:uppercase}\
.pmm-ov{position:fixed;inset:0;z-index:1000;background:rgba(10,9,12,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);overflow-y:auto;display:flex;justify-content:center;padding:clamp(0px,3vw,40px) 0;animation:pmmIn .25s ease}\
@keyframes pmmIn{from{opacity:0}to{opacity:1}}\
.pmm-art-page{position:relative;width:min(820px,100%);background:#FBF8F1;color:#141414;margin:auto 0;box-shadow:0 30px 80px -20px rgba(0,0,0,.8);font-family:Archivo,system-ui,sans-serif;animation:pmmUp .35s cubic-bezier(.2,.8,.2,1)}\
@keyframes pmmUp{from{transform:translateY(30px) scale(.97);opacity:0}to{transform:none;opacity:1}}\
.pmm-art-page .hero{aspect-ratio:16/9;background:#141418 center/cover no-repeat;position:relative}.pmm-art-page .hero .pmm-art{position:absolute;inset:0}\
.pmm-art-page .in{padding:clamp(20px,5vw,48px)}\
.pmm-art-page h1{font-weight:900;font-style:italic;font-stretch:120%;text-transform:uppercase;font-size:clamp(32px,6vw,58px);line-height:.92;margin:14px 0 12px;letter-spacing:-.01em;text-wrap:balance}\
.pmm-art-page .dek{font-size:clamp(18px,2.4vw,22px);line-height:1.4;color:#4A4648;margin:0}\
.pmm-art-page .by{font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#7A7477;margin:16px 0 0;padding-bottom:18px;border-bottom:4px solid #141414}\
.pmm-art-page .body{font-size:18px;line-height:1.7;margin-top:22px;columns:2 320px;column-gap:36px}\
.pmm-art-page .body>p:first-child:first-letter{float:left;font-weight:900;font-style:italic;font-size:4.4em;line-height:.8;padding:.05em .1em 0 0;color:#E3170A}\
.pmm-art-page .body h3{font-weight:900;font-style:italic;text-transform:uppercase;font-size:22px;margin:24px 0 6px;break-after:avoid}.pmm-art-page .body h4{font-size:18px;margin:18px 0 4px}\
.pmm-art-page .body a{color:#C2440A;font-weight:700}.pmm-art-page .body img{max-width:100%}\
.pmm-art-page .body blockquote{margin:22px 0;padding:4px 0 4px 18px;border-left:5px solid #E3170A;font-size:21px;font-weight:800;font-style:italic}\
.pmm-art-page .x{position:sticky;top:10px;float:right;margin:10px 10px 0 0;z-index:2;width:44px;height:44px;border-radius:50%;border:0;background:#141414;color:#fff;font-size:20px;font-weight:900;cursor:pointer}\
.pmm-art-page .foot{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px;padding-top:18px;border-top:4px solid #141414}\
.pmm-art-page .foot a,.pmm-art-page .foot button{height:46px;display:inline-flex;align-items:center;padding:0 18px;border:0;border-radius:10px;font:800 13px/1 Archivo,system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;text-decoration:none}\
.pmm-art-page .foot a{background:#FFD400;color:#141414}.pmm-art-page .foot button{background:#141414;color:#fff}\
@media (prefers-reduced-motion:reduce){.pmm-leaf,.pmm-leaf>div:after{transition:none}.pmm-ov,.pmm-art-page{animation:none}}';
  function css() { if (document.getElementById('pmm-css')) return; var s = document.createElement('style'); s.id = 'pmm-css'; s.textContent = CSS; document.head.appendChild(s); }

  // ---------- pieces ----------
  function artBox(tag) { var c = TAGC[String(tag || '').toUpperCase()] || '#FE5807'; return '<div class="pmm-art" style="--c:' + c + '"><span>' + esc(String(tag || 'PM').split(' ')[0]) + '</span></div>'; }
  function photo(url, tag) { var u = safeUrl(url); return u ? '<div class="pmm-ph" style="background-image:url(\'' + u.replace(/'/g, '%27') + '\')"></div>' : artBox(tag); }
  function sizeFor(box, slotSize) {
    if (slotSize) return slotSize;
    var a = box.w * box.h; return a >= 2600 ? 'l' : a >= 900 ? 'm' : 's';
  }
  function boxOf(b) { return { x: +b.x || 0, y: +b.y || 0, w: Math.max(5, +b.w || 30), h: Math.max(5, +b.h || 20) }; }

  function itemEl(it, box, size, ctx) {
    var t = it.type || 'post', el = h('button', 'pmm-it s-' + size);
    el.type = 'button';
    el.style.left = box.x + '%'; el.style.top = box.y + '%'; el.style.width = box.w + '%'; el.style.height = box.h + '%';
    if (t === 'post') {
      var p = (ctx.posts || {})[it.post] || null;
      var title = it.title || (p && p.title) || (ctx.edit ? '[' + (it.post || 'pick a post') + ']' : ''), tag = (p && p.tag) || 'Feature';
      if (!title) return null;                                   // post not published yet: hide on the public reader
      var dek = it.dek || (p && p.dek) || '';
      el.style.setProperty('--c', TAGC[String(tag).toUpperCase()] || '#E3170A');
      el.style.setProperty('--bgc', ctx.ink ? '#111013' : '#FBF8F1');
      if (size === 'list') return null;
      el.innerHTML = '<div class="pmm-pw" style="position:absolute">' + photo(it.image || (p && p.cover_url), tag) + '</div><div class="pmm-tx"><span class="pmm-k">' + esc(tag) + '</span><span class="pmm-t">' + esc(title) + '</span>' + (dek ? '<span class="pmm-d">' + esc(dek) + '</span>' : '') + (size === 'xl' || size === 'l' ? '<span class="pmm-go">READ →</span>' : '') + '</div>';
      el.setAttribute('aria-label', 'Read: ' + title);
      if (!ctx.edit) el.addEventListener('click', function () { ctx.open && ctx.open(it.post); });
    } else if (t === 'text') {
      el.innerHTML = '<div class="pmm-text">' + (it.title ? '<span class="pmm-t">' + esc(it.title) + '</span>' : '') + '<div class="b">' + md(it.body) + '</div></div>';
      el.style.cursor = 'default';
    } else if (t === 'image') {
      el.className += ' pmm-img';
      el.innerHTML = photo(it.image, 'PHOTO') + (it.caption ? '<figcaption>' + esc(it.caption) + '</figcaption>' : '');
      el.style.cursor = 'default';
    } else if (t === 'sponsor') {
      var SP = ctx.sponsors || {}, live = SP.live || [], k = Math.max(0, (parseInt(it.spot, 10) || 1) - 1), s = live.length ? live[k % live.length] : null;
      el = h('a', 'pmm-it'); el.style.cssText = 'left:' + box.x + '%;top:' + box.y + '%;width:' + box.w + '%;height:' + box.h + '%';
      if (s && safeUrl(s.link)) {
        var lg = safeUrl(s.logo), ini = String(s.advertiser || '').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
        el.href = safeUrl(s.link); el.target = '_blank'; el.rel = 'sponsored noopener';
        el.innerHTML = '<div class="pmm-sp"><span class="lab">SPONSORED</span><span class="lg"' + (lg ? ' style="background-image:url(\'' + lg.replace(/'/g, '%27') + '\')"' : '') + '>' + (lg ? '' : esc(ini)) + '</span><span class="pmm-t">' + esc(s.advertiser) + '</span><span class="pmm-d">' + esc(s.headline) + '</span><span class="go">VISIT →</span></div>';
        el.setAttribute('aria-label', 'Sponsored: ' + s.advertiser);
        if (!ctx.edit && ctx.adCount) { ctx.adCount(s.id, 'view'); el.addEventListener('click', function () { ctx.adCount(s.id, 'click'); }); }
      } else {
        var price = SP.price ? '$' + Math.round(SP.price / 100) + ' a week' : 'by the week';
        el.href = '/advertise/?package=magazine';
        el.innerHTML = '<div class="pmm-sp house"><div class="in"><span class="pmm-k" style="--c:#141414;font-size:min(4.4cqh,3.6cqw);align-self:flex-start">YOUR AD HERE</span><span class="pmm-t">Sponsor this page</span><span class="pmm-d">Put your shop in front of Austin drivers every week. ' + esc(price) + '.</span><span class="go">BOOK YOUR SPOT →</span></div></div>';
        el.setAttribute('aria-label', 'Sponsor this magazine page');
      }
      if (ctx.edit) el.addEventListener('click', function (ev) { ev.preventDefault(); });
    } else if (t === 'meets') {
      var ms = (ctx.meets || []).slice(0, Math.max(3, Math.min(10, Math.round(box.h / 7))));
      el.innerHTML = '<div class="pmm-meets"><span class="pmm-t">' + esc(it.title || 'This weekend') + '</span><ol>' + (ms.length ? ms.map(function (m) {
        return '<li><b>' + esc(fmtDay(m.starts_at).toUpperCase()) + '</b><span>' + esc(m.title) + '<small>' + esc(fmtTime(m.starts_at)) + (m.area ? ' · ' + esc(m.area) : '') + '</small></span></li>'; }).join('') : '<li><span>New meets go up every night.</span></li>') + '</ol><a href="/#map">THE FULL MAP →</a></div>';
      el.style.cursor = 'default';
    }
    return el;
  }

  function listEl(items, box, ctx, title) {
    var el = h('div', 'pmm-it'); el.style.cssText = 'left:' + box.x + '%;top:' + box.y + '%;width:' + box.w + '%;height:' + box.h + '%;cursor:default';
    var wrap = h('div', 'pmm-list', '<div class="pmm-lh"><em>The</em> Lineup' + (title ? '<small>' + esc(title) + '</small>' : '') + '</div>'), n = 0;
    items.forEach(function (it) {
      if ((it.type || 'post') !== 'post') return;
      var p = (ctx.posts || {})[it.post]; var tt = it.title || (p && p.title) || (ctx.edit ? '[' + it.post + ']' : ''); if (!tt) return;
      var b = h('button', '', '<span class="n">' + String(++n).padStart(2, '0') + '</span><span><span class="pmm-t">' + esc(tt) + '</span>' + ((it.dek || (p && p.dek)) ? '<div class="pmm-d">' + esc(it.dek || p.dek) + '</div>' : '') + '</span>');
      b.type = 'button'; if (!ctx.edit) b.addEventListener('click', function () { ctx.open && ctx.open(it.post); });
      wrap.appendChild(b);
    });
    el.appendChild(wrap); return el;
  }

  // ctx: {posts, meets, open(slug), edit, side:'left'|'right', run:{issue, week, title}, num, selected, onSelect(i), onBox(i, box)}
  function page(pg, ctx) {
    css(); pg = pg || { layout: 'hero2', items: [] };
    var L = LAYOUTS[pg.layout] || LAYOUTS.hero2, ink = pg.bg === 'ink';
    var el = h('div', 'pmm-page ' + (ctx.side || 'right') + (ink ? ' ink' : '') + (ctx.edit ? ' edit' : ''));
    ctx = Object.assign({}, ctx, { ink: ink });
    var full = pg.layout === 'feature' || pg.layout === 'photo';
    if (!full && ctx.run) el.appendChild(h('div', 'pmm-run', '<b>PetrolMeets</b><span>' + esc(ctx.run.title || '') + '</span><i>' + esc(ctx.run.issue || '') + '</i>'));
    if (ctx.num != null && !full) el.appendChild(h('div', 'pmm-num', String(ctx.num)));
    var items = pg.items || [], slot = 0;
    if (pg.layout === 'list') {
      var lb = L.slots[0], loose = items.filter(function (it) { return it.box; });
      el.appendChild(listEl(items.filter(function (it) { return !it.box; }), lb, ctx, ctx.run && ctx.run.title));
      items.forEach(function (it, i) { if (!it.box) return; var b = boxOf(it.box), e = itemEl(it, b, sizeFor(b), ctx); if (e) mark(e, i, b, true); });
      return el;
    }
    items.forEach(function (it, i) {
      var b, sz, boxed = !!it.box;
      if (boxed) { b = boxOf(it.box); sz = sizeFor(b); }
      else if (slot < L.slots.length) { var s = L.slots[slot++]; b = { x: s.x, y: s.y, w: s.w, h: s.h }; sz = s.size; }
      else if (ctx.edit) { b = { x: 6 + (i % 3) * 4, y: 80 - (i % 3) * 4, w: 30, h: 14 }; sz = 's'; boxed = true; }
      else return;
      var e = itemEl(it, b, sz, ctx); if (e) mark(e, i, b, boxed);
    });
    if (ctx.edit) for (; slot < L.slots.length; slot++) { var s2 = L.slots[slot], ph = h('div', 'pmm-empty', 'Empty slot'); ph.style.cssText = 'left:' + s2.x + '%;top:' + s2.y + '%;width:' + s2.w + '%;height:' + s2.h + '%'; el.appendChild(ph); }
    function mark(e, i, b, boxed) {
      if (boxed) e.classList.add('boxed');
      if (ctx.edit) {
        if (ctx.selected === i) e.classList.add('sel');
        e.addEventListener('click', function (ev) { ev.preventDefault(); ctx.onSelect && ctx.onSelect(i); });
        if (boxed && ctx.onBox) drag(el, e, b, function (nb) { ctx.onBox(i, nb); });
      }
      el.appendChild(e);
    }
    return el;
  }

  // freeform drag + resize (editor)
  function drag(pageEl, e, b, done) {
    var hd = h('span', 'pmm-h'); e.appendChild(hd);
    function start(ev, mode) {
      ev.preventDefault(); ev.stopPropagation();
      var r = pageEl.getBoundingClientRect(), sx = ev.clientX, sy = ev.clientY, o = { x: b.x, y: b.y, w: b.w, h: b.h }, n = o;
      function mv(m) {
        var dx = (m.clientX - sx) / r.width * 100, dy = (m.clientY - sy) / r.height * 100;
        n = mode === 'move' ? { x: clamp(o.x + dx, 0, 100 - o.w), y: clamp(o.y + dy, 0, 100 - o.h), w: o.w, h: o.h }
          : { x: o.x, y: o.y, w: clamp(o.w + dx, 5, 100 - o.x), h: clamp(o.h + dy, 5, 100 - o.y) };
        e.style.left = n.x + '%'; e.style.top = n.y + '%'; e.style.width = n.w + '%'; e.style.height = n.h + '%';
      }
      function up() { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (n !== o) done(round(n)); }
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    }
    e.addEventListener('pointerdown', function (ev) { if (ev.target === hd) return; if (e.classList.contains('sel')) start(ev, 'move'); });
    hd.addEventListener('pointerdown', function (ev) { start(ev, 'size'); });
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function round(n) { return { x: Math.round(n.x * 10) / 10, y: Math.round(n.y * 10) / 10, w: Math.round(n.w * 10) / 10, h: Math.round(n.h * 10) / 10 }; }

  function barcode(seed) {
    var s = 0, out = ''; for (var i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
    var x = 2; while (x < 118) { s = (s * 1103515245 + 12345) >>> 0; var w = 1 + (s >>> 16) % 3; out += '<rect x="' + x + '" y="0" width="' + w + '" height="44" />'; x += w + 1 + (s >>> 20) % 3; }
    return '<svg viewBox="0 0 120 44" preserveAspectRatio="none" fill="#000">' + out + '</svg>';
  }

  function cover(issue, ctx) {
    css(); ctx = ctx || {}; issue = issue || {}; var c = issue.cover || {}, tagm = monthTag(issue);
    var el = h('div', 'pmm-page pmm-cover right' + (c.mode === 'image' ? ' image' : ''));
    var open = function () { ctx.onOpen && ctx.onOpen(); };
    if (c.mode === 'image' && safeUrl(c.image_url)) {
      el.innerHTML = '<div class="full" style="background-image:url(\'' + safeUrl(c.image_url).replace(/'/g, '%27') + '\')" role="img" aria-label="' + esc(issue.title || 'Cover') + '"></div>';
    } else {
      var u = safeUrl(c.photo_url), lines = (Array.isArray(c.lines) ? c.lines : []).slice(0, 6);
      el.innerHTML = '<div class="bgp' + (u ? '' : ' none') + '"' + (u ? ' style="background-image:url(\'' + u.replace(/'/g, '%27') + '\');background-position:' + esc(c.photo_pos || '50% 50%') + '"' : '') + '></div><div class="shade"></div>'
        + '<div class="kick"><span>' + esc(c.kicker || 'The Austin car scene') + '</span><i>' + esc(tagm) + '</i></div>'
        + '<div class="mast"><span class="p">Petrol</span><span class="m">MEETS</span></div>'
        + '<div class="issue">ISSUE ' + String(issue.number || 1).padStart(2, '0') + ' · ' + esc(tagm) + '</div>'
        + (lines.length ? '<div class="lines">' + lines.map(function (l) { return '<div class="ln">' + (l.tag ? '<em>' + esc(l.tag) + '</em><br>' : '') + esc(l.text) + '</div>'; }).join('') + '</div>' : '')
        + (c.burst ? '<div class="burst"><span>' + esc(c.burst) + '</span></div>' : '')
        + '<div class="hl">' + (c.headline ? '<b>' + esc(c.headline) + '</b>' : '') + (c.sub ? '<span>' + esc(c.sub) + '</span>' : '') + '</div>'
        + '<div class="price">FREE · PETROLMEETS.COM</div>'
        + '<div class="bar">' + barcode(issue.slug || 'pm') + '<span>' + esc((issue.slug || '').replace('-', ' ')) + '</span></div>';
    }
    if (ctx.onOpen) { el.style.cursor = 'pointer'; el.addEventListener('click', open); }
    return el;
  }

  function back() {
    css();
    return h('div', 'pmm-page pmm-back left', '<span><span class="p">The</span></span><div class="m">Weekend’s meets,<br>before the weekend.</div><p>One free email every Thursday with every car meet, cruise and show around Austin. The app for iPhone and Android is on the way.</p><a href="/#newsletter">GET THE WEEKLY →</a><small>PETROLMEETS.COM · AUSTIN, TEXAS</small>');
  }

  // ---------- article overlay ----------
  function article(slug, data, onClose) {
    css(); var p = (data.posts || {})[slug]; if (!p) return null;
    var ov = h('div', 'pmm-ov'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', p.title);
    var u = safeUrl(p.cover_url), when = p.published_at ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(p.published_at)) : '';
    var card = h('article', 'pmm-art-page', '<button class="x" type="button" aria-label="Close">✕</button><div class="hero"' + (u ? ' style="background-image:url(\'' + u.replace(/'/g, '%27') + '\')"' : '') + '>' + (u ? '' : artBox(p.tag)) + '</div>'
      + '<div class="in"><span class="pmm-k" style="--c:' + (TAGC[String(p.tag || '').toUpperCase()] || '#E3170A') + ';font-size:13px">' + esc(p.tag || 'Feature') + '</span><h1>' + esc(p.title) + '</h1>' + (p.dek ? '<p class="dek">' + esc(p.dek) + '</p>' : '')
      + '<p class="by">' + esc(p.author || 'PetrolMeets') + (when ? ' · ' + esc(when) : '') + '</p><div class="body">' + md(p.body_md) + '</div>'
      + '<div class="foot"><button type="button" class="bk">← Back to the magazine</button><a href="/news/' + esc(slug) + '/">Open as a page</a></div></div>');
    ov.appendChild(card);
    function close() { ov.remove(); document.removeEventListener('keydown', key); document.documentElement.style.overflow = ''; onClose && onClose(); }
    function key(e) { if (e.key === 'Escape') close(); }
    card.querySelector('.x').onclick = close; card.querySelector('.bk').onclick = close;
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', key); document.documentElement.style.overflow = 'hidden';
    document.body.appendChild(ov); setTimeout(function () { card.querySelector('.x').focus(); }, 30);
    return ov;
  }

  // ---------- reader ----------
  function reader(root, data, opts) {
    css(); opts = opts || {}; data = data || { issues: [], posts: {} };
    var issues = (data.issues || []).filter(function (i) { return i && i.slug; });
    var st = { issue: 0, view: 0, wide: true, busy: false };
    root.innerHTML = ''; root.classList.add('pmm-r');
    if (!issues.length) { root.innerHTML = '<p style="text-align:center;font-weight:700">The first issue is on the way. <a href="/#newsletter">Get the weekly</a> and you won’t miss it.</p>'; return {}; }
    var bar = h('div', 'pmm-bar'), sel = h('select'); sel.setAttribute('aria-label', 'Issue');
    issues.forEach(function (is, i) { var o = h('option', '', esc(monthTag(is)) + ' · ISSUE ' + String(is.number || 1).padStart(2, '0')); o.value = i; sel.appendChild(o); });
    var chips = h('div', 'chips'); bar.appendChild(sel); bar.appendChild(chips);
    var desk = h('div', 'pmm-desk'), prev = h('button', 'pmm-arrow', '‹'), next = h('button', 'pmm-arrow', '›'), book = h('div', 'pmm-book');
    prev.type = next.type = 'button'; prev.setAttribute('aria-label', 'Previous page'); next.setAttribute('aria-label', 'Next page');
    desk.appendChild(prev); desk.appendChild(book); desk.appendChild(next);
    var count = h('div', 'pmm-count'); root.appendChild(bar); root.appendChild(desk); root.appendChild(count);

    function I() { return issues[st.issue]; }
    function ctxFor(sp, side, num) {
      return { posts: data.posts, meets: data.meets, sponsors: data.sponsors, adCount: opts.adCount, side: side, num: num, run: { title: sp.title || ('Week ' + sp.week), issue: monthTag(I()) }, open: openPost };
    }
    // a "view" = what's visible at once: [left, right] on wide screens, [one] on phones. null = empty side.
    function views() {
      var is = I(), v = [], n = 2, sp = is.spreads || [];
      var cov = function () { return cover(is, { onOpen: function () { go(st.view + 1); } }); };
      if (st.wide) {
        v.push({ label: 'Cover', pages: [null, cov] });
        sp.forEach(function (s) { var a = n, b = n + 1; n += 2; v.push({ label: s.title || 'Week ' + s.week, week: s.week, pages: [function () { return page(s.pages[0], ctxFor(s, 'left', a)); }, function () { return page(s.pages[1], ctxFor(s, 'right', b)); }] }); });
        v.push({ label: 'Back', pages: [back, null] });
      } else {
        v.push({ label: 'Cover', pages: [cov] });
        sp.forEach(function (s) { var a = n, b = n + 1; n += 2;
          v.push({ label: s.title || 'Week ' + s.week, week: s.week, pages: [function () { return page(s.pages[0], ctxFor(s, 'left', a)); }] });
          v.push({ label: s.title || 'Week ' + s.week, week: s.week, half: true, pages: [function () { return page(s.pages[1], ctxFor(s, 'right', b)); }] }); });
        v.push({ label: 'Back', pages: [back] });
      }
      return v;
    }
    var V = [];
    function size() {
      var W = root.clientWidth - 120, H = Math.max(360, window.innerHeight - (opts.chrome || 190));
      st.wide = root.clientWidth >= 820;
      var per = st.wide ? Math.min(W / 2, H * 8.5 / 11) : Math.min(root.clientWidth - 24, (window.innerHeight - 210) * 8.5 / 11);
      book.style.setProperty('--pw', Math.max(240, Math.floor(per)) + 'px'); book.style.setProperty('--n', st.wide ? 2 : 1);
      
    }
    function slotEl(fn, side) { var s = h('div', 'pmm-slot ' + side); if (fn) s.appendChild(fn()); return s; }
    function draw() {
      book.innerHTML = ''; var pv = V[st.view].pages;
      if (st.wide) { book.appendChild(slotEl(pv[0], 'L')); book.appendChild(slotEl(pv[1], 'R')); }
      else book.appendChild(slotEl(pv[0], 'L'));
      prev.disabled = st.view === 0; next.disabled = st.view === V.length - 1;
      chips.innerHTML = '';
      var seen = {};
      V.forEach(function (v, i) {
        var key = v.week != null ? 'w' + v.week : v.label; if (seen[key]) return; seen[key] = 1;
        var b = h('button', '', esc(v.week != null ? 'Week ' + v.week : v.label)); b.type = 'button';
        var cur = V[st.view]; b.setAttribute('aria-current', String(cur === v || (cur.week != null && cur.week === v.week)));
        b.onclick = function () { go(i); }; chips.appendChild(b);
      });
      count.textContent = monthTag(I()) + ' · ' + (V[st.view].label || '') + ' · ' + (st.view + 1) + ' / ' + V.length;
      hash();
    }
    function hash() {
      if (opts.noHash) return; var v = V[st.view], hsh = '#' + I().slug + (v.week != null ? '/w' + v.week + (v.half ? 'b' : '') : v.label === 'Back' ? '/back' : '');
      if (location.hash !== hsh) history.replaceState(null, '', hsh);
    }
    function go(to) {
      if (to < 0 || to >= V.length || to === st.view || st.busy) return;
      var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce || Math.abs(to - st.view) > 1) { st.view = to; draw(); return; }
      st.busy = true; var fwd = to > st.view, a = V[st.view].pages, b = V[to].pages;
      var leaf = h('div', 'pmm-leaf'), front = h('div', 'front'), bk = h('div', 'back');
      if (st.wide) {
        // under the leaf: the side that stays + the side being revealed
        book.innerHTML = '';
        book.appendChild(slotEl(fwd ? a[0] : b[0], 'L')); book.appendChild(slotEl(fwd ? b[1] : a[1], 'R'));
        if (fwd) { leaf.style.right = '0'; leaf.style.transformOrigin = 'left center'; if (a[1]) front.appendChild(a[1]()); if (b[0]) bk.appendChild(b[0]()); }
        else { leaf.style.left = '0'; leaf.style.transformOrigin = 'right center'; if (a[0]) front.appendChild(a[0]()); if (b[1]) bk.appendChild(b[1]()); }
      } else {
        book.innerHTML = ''; book.appendChild(slotEl(fwd ? b[0] : a[0], 'L'));
        leaf.style.left = '0'; leaf.style.transformOrigin = 'left center';
        if (fwd) { if (a[0]) front.appendChild(a[0]()); } else { if (b[0]) front.appendChild(b[0]()); leaf.style.transform = 'rotateY(-180deg)'; leaf.style.transition = 'none'; }
      }
      leaf.appendChild(front); leaf.appendChild(bk); book.appendChild(leaf);
      leaf.getBoundingClientRect();
      requestAnimationFrame(function () {
        leaf.style.transition = '';
        leaf.style.setProperty('--shade', '1');
        if (st.wide) leaf.style.transform = fwd ? 'rotateY(-180deg)' : 'rotateY(180deg)';
        else leaf.style.transform = fwd ? 'rotateY(-180deg)' : 'rotateY(0deg)';
      });
      var fin = false; function end() { if (fin) return; fin = true; st.view = to; st.busy = false; draw(); }
      leaf.addEventListener('transitionend', function (e) { if (e.propertyName === 'transform') end(); }); setTimeout(end, 1000);
    }
    function openPost(slug) {
      var prevHash = location.hash;
      if (!opts.noHash) history.replaceState(null, '', prevHash.split('~')[0] + '~' + slug);
      (opts.onOpenPost || article)(slug, data, function () { if (!opts.noHash) history.replaceState(null, '', prevHash.split('~')[0]); });
    }
    function setIssue(i, view) { st.issue = i; sel.value = i; V = views(); st.view = Math.min(view || 0, V.length - 1); draw(); }
    sel.onchange = function () { setIssue(+sel.value, 0); };
    prev.onclick = function () { go(st.view - 1); }; next.onclick = function () { go(st.view + 1); };
    root.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') go(st.view + 1); if (e.key === 'ArrowLeft') go(st.view - 1); });
    document.addEventListener('keydown', function (e) { if (document.querySelector('.pmm-ov') || /input|select|textarea/i.test((e.target || {}).tagName || '')) return; if (e.key === 'ArrowRight') go(st.view + 1); if (e.key === 'ArrowLeft') go(st.view - 1); });
    var tx = null; book.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
    book.addEventListener('touchend', function (e) { if (tx == null) return; var d = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(d) > 45) go(st.view + (d < 0 ? 1 : -1)); });
    var lastWide = null;
    function onResize() { var wasWide = st.wide; size(); if (lastWide !== null && wasWide !== st.wide) { var wk = V[st.view] && V[st.view].week; V = views(); var j = 0; if (wk != null) V.forEach(function (v, k) { if (v.week === wk && !j) j = k; }); st.view = j || Math.min(st.view, V.length - 1); draw(); } lastWide = st.wide; }
    addEventListener('resize', onResize);
    // start from #2026-11/w2~post-slug
    size(); lastWide = st.wide;
    var m = /^#(\d{4}-\d{2})(?:\/(w\d+b?|back))?(?:~([a-z0-9-]+))?/.exec(location.hash || '') || [];
    var ii = 0; issues.forEach(function (is, k) { if (is.slug === m[1]) ii = k; });
    st.issue = ii; sel.value = ii; V = views(); var start = 0;
    if (m[2]) V.forEach(function (v, k) { if (!start && ((m[2] === 'back' && v.label === 'Back') || (v.week != null && 'w' + v.week + (v.half ? 'b' : '') === m[2]))) start = k; });
    if (!m[2] && opts.start === 'latest' && V.length > 2) start = V.length - 2;
    st.view = start; draw();
    if (m[3]) setTimeout(function () { openPost(m[3]); }, 50);
    return { go: go, setIssue: setIssue };
  }

  window.PMMag = { LAYOUTS: LAYOUTS, page: page, cover: cover, back: back, reader: reader, article: article, md: md, monthTag: monthTag, css: css };
})();
