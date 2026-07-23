// Shared overlay bootstrap: connects Socket.IO, exposes window.LOBO
(function(){
  const params = new URLSearchParams(location.search);
  const isDemo = params.get('demo') === '1';

  const s = document.createElement('script');
  s.src = '/socket.io/socket.io.js';
  s.onload = init;
  document.head.appendChild(s);

  const listeners = { event:[], counters:[], config:[], status:[], hello:[] };
  window.LOBO = {
    isDemo,
    on(type, fn) { (listeners[type] || (listeners[type]=[])).push(fn); },
    config: null,
    counters: null,
    status: null,
    escapeHTML,
    template,
    startDemo,
  };

  function init() {
    /* global io */
    const sock = io({ query: { room: 'overlays' }, transports: ['websocket','polling'] });
    window.LOBO.socket = sock;
    sock.on('hello', d => { window.LOBO.config = d.config; window.LOBO.counters = d.counters; window.LOBO.status = d.status; fire('hello', d); fire('config', d.config); fire('counters', d.counters); fire('status', d.status); if (isDemo) startDemo(); });
    sock.on('event', ev => fire('event', ev));
    sock.on('counters', c => { window.LOBO.counters = c; fire('counters', c); });
    sock.on('config', c => { window.LOBO.config = c; fire('config', c); });
    sock.on('status', s => { window.LOBO.status = s; fire('status', s); });
  }
  function fire(type, data) { (listeners[type] || []).forEach(fn => { try { fn(data); } catch(_e){} }); }

  function escapeHTML(str) {
    return String(str == null ? '' : str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function template(str, vars) {
    return String(str||'').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
  }

  // Client-side demo mode: fires fake events locally (used by ?demo=1 when server demo isn't on)
  const FAKE_USERS = ['ferox_fan42','raptor_queen','chunkystego','thepack_beta','no_mercy_lobo','saddle_up','crawlerbait'];
  const FAKE_COMMENTS = ['LFG lobo','you got this','watch the utah','BLOOD FOR THE PACK','ferox W','stego is HUGE','first','lobo the goat','chain that carno'];
  const FAKE_GIFTS = [{n:'Rose',c:1},{n:'Finger Heart',c:5},{n:'Galaxy',c:1000},{n:'Sports Car',c:7000}];
  function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
  let demoTimer = null;
  function startDemo() {
    if (demoTimer) return;
    function tick() {
      const roll = Math.random();
      let ev;
      const user = { id:'demo', username: pick(FAKE_USERS), nickname: pick(FAKE_USERS), avatarUrl:'' };
      if (roll < 0.35)       ev = { v:1, id:'cli-'+Date.now(), type:'comment', user, value:{ comment: pick(FAKE_COMMENTS)}, ts:Date.now() };
      else if (roll < 0.55)  ev = { v:1, id:'cli-'+Date.now(), type:'like',    user, value:{ likeCount: 5+Math.floor(Math.random()*40), totalLikeCount: 12345 }, ts:Date.now() };
      else if (roll < 0.75)  ev = { v:1, id:'cli-'+Date.now(), type:'follow',  user, value:{}, ts:Date.now() };
      else if (roll < 0.88) { const g=pick(FAKE_GIFTS); const rc=1+Math.floor(Math.random()*4); ev = { v:1, id:'cli-'+Date.now(), type:'gift', user, value:{giftName:g.n, repeatCount:rc, coins:g.c*rc, diamondCount:g.c}, ts:Date.now() };}
      else if (roll < 0.94)  ev = { v:1, id:'cli-'+Date.now(), type:'share',   user, value:{}, ts:Date.now() };
      else                   ev = { v:1, id:'cli-'+Date.now(), type:'subscribe',user, value:{}, ts:Date.now() };
      fire('event', ev);
      demoTimer = setTimeout(tick, 2500 + Math.random()*4000);
    }
    tick();
  }
})();
