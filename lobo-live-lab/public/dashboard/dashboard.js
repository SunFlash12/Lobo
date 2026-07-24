/* Lobo Live Lab — dashboard controller
   - Wires nav
   - Loads/saves config
   - Renders alert forms, uploads, log, url list
   - Wires demo mode and test buttons
*/
(function () {
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
  let CFG = null;
  let UPLOADS = [];
  let SOCK = null;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    // Nav
    $$('.nav-item').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

    // "Start here" jump links → switch to the referenced tab
    document.addEventListener('click', (e) => {
      const j = e.target.closest('[data-jump]');
      if (j) { switchTab(j.dataset.jump); e.preventDefault(); }
    });

    // Top bar
    $('#logoutBtn').addEventListener('click', async () => {
      await fetch('/logout', { method:'POST' });
      location.href = '/login';
    });

    // Connection
    $('#connectBtn').addEventListener('click', doConnect);
    $('#disconnectBtn').addEventListener('click', doDisconnect);
    $('#resetCountersBtn').addEventListener('click', async () => {
      await api('/api/counters/reset', 'POST');
      toast('Session counters reset.');
    });

    // Testing
    $$('[data-fire]').forEach(btn => btn.addEventListener('click', () => fireTest(btn.dataset.fire)));
    $('#demoStartBtn').addEventListener('click', async () => {
      await api('/api/demo/start', 'POST');
      updateDemoStatus(true);
      toast('Demo mode started.');
    });
    $('#demoStopBtn').addEventListener('click', async () => {
      await api('/api/demo/stop', 'POST');
      updateDemoStatus(false);
      toast('Demo mode stopped.');
    });

    // Uploads
    $('#uploadBtn').addEventListener('click', doUpload);
    $('#refreshLogBtn').addEventListener('click', loadLog);

    // Fill URL list
    fillUrls();

    // Load config + uploads + status
    reloadAll();

    // Socket for live status
    SOCK = io({ query: { room: 'dashboard' }, transports:['websocket','polling'] });
    SOCK.on('hello', d => { CFG = d.config; renderAll(); renderStatus(d.status); renderCountersMini(d.counters); renderSignal(d.signal); });
    SOCK.on('config', c => { CFG = c; renderAll(); });
    SOCK.on('status', s => renderStatus(s));
    SOCK.on('counters', c => renderCountersMini(c));
    SOCK.on('signal', s => renderSignal(s));
    SOCK.on('event', ev => prependLog(ev));
  }

  function switchTab(tab) {
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.tab').forEach(t => t.hidden = t.dataset.tab !== tab);
    if (tab === 'log') loadLog();
    if (tab === 'uploads') loadUploads();
  }

  async function reloadAll() {
    const [cfg, up, st] = await Promise.all([
      api('/api/config'),
      api('/api/uploads'),
      api('/api/status'),
    ]);
    CFG = cfg.config;
    UPLOADS = up.uploads || [];
    renderAll();
    renderStatus(st.status);
    renderCountersMini(st.counters);
    updateDemoStatus(st.demo);
  }

  function renderAll() {
    if (!CFG) return;
    $('#username').value = CFG.connection.username || '';
    renderAlerts();
    renderChat();
    renderGoal();
    renderStats();
    renderTicker();
    renderUploads();
  }

  // ---------------- Status ----------------
  function renderStatus(st) {
    const pill = $('#statusPill');
    const text = $('#statusText');
    const line = $('#statusLine');
    const sub = $('#statusSub');
    pill.classList.remove('live','error','connecting','reconnecting','idle');
    const state = (st && st.state) || 'idle';
    pill.classList.add(state);
    const nice = { live:'LIVE', error:'Error', connecting:'Connecting', reconnecting:'Reconnecting', idle:'Offline' }[state] || state;
    text.textContent = nice;
    line.textContent = (st && st.message) || 'No connection.';
    sub.textContent = st && st.since ? ('since ' + new Date(st.since).toLocaleTimeString()) : '';
  }

  function renderCountersMini(c) {
    if (!c) return;
    const el = $('#countersMini');
    el.innerHTML = '';
    for (const [k, v, lbl] of [
      ['viewers', c.viewers, 'Viewers'],
      ['peakViewers', c.peakViewers, 'Peak'],
      ['sessionLikes', c.sessionLikes, 'Likes'],
      ['followers', c.followers, 'Follows'],
      ['giftCoins', c.giftCoins, 'Coins'],
    ]) {
      const b = document.createElement('div'); b.className = 'box';
      b.innerHTML = `<div class="k">${lbl}</div><div class="v" data-testid="counter-${k}">${fmt(v)}</div>`;
      el.appendChild(b);
    }
  }

  // ---------------- Signal check ----------------
  const SIGNAL_TYPES = [
    ['chat', 'Chat'], ['like', 'Likes'], ['follow', 'Follows'], ['gift', 'Gifts'],
    ['share', 'Shares'], ['subscribe', 'Subs'], ['member', 'Joins'], ['social', 'Social'], ['viewers', 'Viewer pings'],
  ];
  function renderSignal(sig) {
    const grid = $('#signalGrid'); if (!grid) return;
    const counts = (sig && sig.events) || {};
    grid.innerHTML = '';
    for (const [key, lbl] of SIGNAL_TYPES) {
      const n = counts[key] || 0;
      const chip = document.createElement('div');
      chip.className = 'sig-chip' + (n > 0 ? ' on' : '');
      chip.innerHTML = `<span class="n" data-testid="signal-${key}">${fmt(n)}</span><span class="t">${lbl}</span>`;
      grid.appendChild(chip);
    }
    const last = $('#signalLast');
    if (sig && sig.lastEventAt) {
      const secs = Math.max(0, Math.round((Date.now() - sig.lastEventAt) / 1000));
      last.textContent = `Last event: ${secs < 5 ? 'just now' : secs + 's ago'}`;
    } else {
      last.textContent = 'No events received from TikTok yet this session.';
    }
  }
  function fmt(n) {
    n = Number(n||0);
    if (n >= 1_000_000) return (n/1_000_000).toFixed(1).replace(/\.0$/,'') + 'M';
    if (n >= 10_000) return (n/1_000).toFixed(1).replace(/\.0$/,'') + 'K';
    return String(n);
  }

  // ---------------- Connect ----------------
  async function doConnect() {
    const username = $('#username').value.trim().replace(/^@/, '');
    if (!username) return toast('Enter a TikTok username.', true);
    await api('/api/connect', 'POST', { username });
    toast('Connecting to @' + username + '…');
  }
  async function doDisconnect() { await api('/api/disconnect', 'POST'); toast('Disconnected.'); }

  // ---------------- Alerts forms ----------------
  const ALERT_TYPES = [
    { key: 'follow',    label: 'New follower',   vars:['username'] },
    { key: 'gift',      label: 'Gift',           vars:['username','giftName','repeatCount','coins'], hasMega:true },
    { key: 'like',      label: 'Like milestone', vars:['username','likeCount'], hasMilestone:true },
    { key: 'share',     label: 'Share',          vars:['username'] },
    { key: 'subscribe', label: 'Subscriber',     vars:['username'] },
    { key: 'join',      label: 'Viewer joins (welcome)', vars:['username'], hasOnce:true },
  ];
  function renderAlerts() {
    const wrap = $('#alertsForms'); wrap.innerHTML = '';
    for (const at of ALERT_TYPES) {
      const cfg = CFG.alerts[at.key] || {};
      const card = document.createElement('div');
      card.className = 'alert-card';
      card.innerHTML = `
        <header>
          <div class="name">${at.label}</div>
          <label class="switch">
            <input type="checkbox" ${cfg.enabled ? 'checked':''} data-alert="${at.key}" data-field="enabled" data-testid="alert-${at.key}-enabled"/>
            <span class="track"></span>
            <span class="lbl">${cfg.enabled?'On':'Off'}</span>
          </label>
        </header>
        <div class="alert-fields">
          <label class="fld"><span>Text template</span>
            <input type="text" data-alert="${at.key}" data-field="template" value="${escAttr(cfg.template||'')}" data-testid="alert-${at.key}-template"/>
            <div class="hint" style="margin-top:6px;">Vars: ${at.vars.map(v=>`<code>{${v}}</code>`).join(' ')}</div>
          </label>
          <label class="fld"><span>Duration (ms)</span>
            <input type="number" min="500" step="100" data-alert="${at.key}" data-field="duration" value="${cfg.duration||5000}" data-testid="alert-${at.key}-duration"/>
          </label>
          <label class="fld"><span>Sound</span>
            ${soundSelect(at.key, cfg.sound)}
          </label>
          <label class="fld"><span>Image / GIF / Video</span>
            ${imageSelect(at.key, cfg.image)}
          </label>
          <label class="fld"><span>Volume: <em id="vol-${at.key}">${Math.round((cfg.volume||0.8)*100)}%</em></span>
            <div class="range-row">
              <input type="range" min="0" max="1" step="0.05" data-alert="${at.key}" data-field="volume" value="${cfg.volume||0.8}" data-testid="alert-${at.key}-volume"/>
              <button class="btn ghost" data-preview="${at.key}" data-testid="alert-${at.key}-preview">Test</button>
            </div>
          </label>
          ${at.hasMega ? `
          <label class="fld"><span>MEGA gift coin threshold</span>
            <input type="number" min="1" step="1" data-alert="gift" data-field="megaThreshold" value="${cfg.megaThreshold||500}" data-testid="alert-gift-mega"/>
          </label>` : ''}
          ${at.hasMilestone ? `
          <label class="fld"><span>Milestone every N likes</span>
            <input type="number" min="1" step="1" data-alert="like" data-field="milestoneEvery" value="${cfg.milestoneEvery||100}" data-testid="alert-like-every"/>
          </label>` : ''}
          ${at.hasOnce ? `
          <label class="fld" style="grid-column: 1/-1;">
            <label class="switch">
              <input type="checkbox" ${cfg.oncePerSession!==false?'checked':''} data-alert="join" data-field="oncePerSession" data-testid="alert-join-once"/>
              <span class="track"></span>
              <span class="lbl">Welcome each viewer only once per stream</span>
            </label>
          </label>` : ''}
          ${at.key==='follow' ? `
          <label class="fld" style="grid-column: 1/-1;">
            <label class="switch">
              <input type="checkbox" ${cfg.tts?'checked':''} data-alert="follow" data-field="tts" data-testid="alert-follow-tts"/>
              <span class="track"></span>
              <span class="lbl">Read new follower names aloud (TTS)</span>
            </label>
          </label>` : ''}
        </div>
      `;
      wrap.appendChild(card);
    }
    wrap.addEventListener('input', onAlertsChange, { once: false });
    wrap.addEventListener('click', onAlertsClick, { once: false });
  }
  function onAlertsChange(e) {
    const t = e.target;
    if (!t.dataset.alert) return;
    const key = t.dataset.alert, field = t.dataset.field;
    if (!CFG.alerts[key]) return;
    let value;
    if (t.type === 'checkbox') value = t.checked;
    else if (t.type === 'number') value = Number(t.value);
    else if (t.type === 'range')  value = Number(t.value);
    else value = t.value;
    CFG.alerts[key][field] = value;
    if (field === 'volume') { const v = document.getElementById('vol-'+key); if (v) v.textContent = Math.round(value*100)+'%'; }
    debouncedSave();
    // update switch label
    if (t.type === 'checkbox') {
      const lbl = t.parentElement.querySelector('.lbl');
      if (lbl) lbl.textContent = t.checked ? 'On' : 'Off';
    }
  }
  function onAlertsClick(e) {
    const b = e.target.closest('[data-preview]');
    if (!b) return;
    fireTest(b.dataset.preview);
  }

  // ---------------- Chat form ----------------
  function renderChat() {
    const c = CFG.chat || {};
    $('#chatForm').innerHTML = `
      <div class="card-title">Chat box</div>
      <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 14px;">
        <label class="fld"><span>Fade after (ms, 0 = never)</span>
          <input type="number" min="0" step="500" id="chat-fade" value="${c.fadeAfter||0}" data-testid="chat-fade"/>
        </label>
        <label class="fld"><span>Max messages</span>
          <input type="number" min="5" step="1" id="chat-max" value="${c.maxMessages||40}" data-testid="chat-max"/>
        </label>
        <label class="fld"><span>Max length</span>
          <input type="number" min="10" step="10" id="chat-len" value="${c.maxLength||180}" data-testid="chat-len"/>
        </label>
        <label class="fld"><span>Streamer color</span>
          <input type="text" id="chat-color-streamer" value="${escAttr((c.roleColors||{}).streamer||'#C8102E')}" data-testid="chat-color-streamer"/>
        </label>
      </div>
      <div class="row" style="margin-top: 4px;">
        <label class="switch">
          <input type="checkbox" id="chat-profanity" ${c.profanityFilter!==false?'checked':''} data-testid="chat-profanity"/>
          <span class="track"></span>
          <span class="lbl">Profanity filter</span>
        </label>
        <label class="switch">
          <input type="checkbox" id="chat-avatars" ${c.showAvatars!==false?'checked':''} data-testid="chat-avatars"/>
          <span class="track"></span>
          <span class="lbl">Show avatars</span>
        </label>
        <label class="switch">
          <input type="checkbox" id="chat-tts" ${c.ttsComments?'checked':''} data-testid="chat-tts"/>
          <span class="track"></span>
          <span class="lbl">Read chat aloud (TTS)</span>
        </label>
      </div>
    `;
    $('#chatForm').addEventListener('input', (e) => {
      const c = CFG.chat = CFG.chat || {};
      c.fadeAfter = Number($('#chat-fade').value);
      c.maxMessages = Number($('#chat-max').value);
      c.maxLength = Number($('#chat-len').value);
      c.profanityFilter = $('#chat-profanity').checked;
      c.showAvatars = $('#chat-avatars').checked;
      c.ttsComments = $('#chat-tts').checked;
      c.roleColors = c.roleColors || {};
      c.roleColors.streamer = $('#chat-color-streamer').value;
      debouncedSave();
    });
  }

  // ---------------- Goal / Stats / Ticker ----------------
  function renderGoal() {
    const g = CFG.goal || {};
    $('#goalForm').innerHTML = `
      <div class="card-title">Follower goal</div>
      <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 14px;">
        <label class="fld" style="grid-column: 1/-1;"><span>Label</span>
          <input type="text" id="goal-label" value="${escAttr(g.label||'')}" data-testid="goal-label"/></label>
        <label class="fld"><span>Current</span>
          <input type="number" id="goal-current" value="${g.current||0}" data-testid="goal-current"/></label>
        <label class="fld"><span>Target</span>
          <input type="number" id="goal-target" value="${g.target||1000}" data-testid="goal-target"/></label>
        <label class="fld"><span>Start</span>
          <input type="number" id="goal-start" value="${g.start||0}" data-testid="goal-start"/></label>
      </div>`;
    $('#goalForm').addEventListener('input', () => {
      CFG.goal.label = $('#goal-label').value;
      CFG.goal.current = Number($('#goal-current').value);
      CFG.goal.target  = Number($('#goal-target').value);
      CFG.goal.start   = Number($('#goal-start').value);
      debouncedSave();
    });
  }
  function renderStats() {
    const s = CFG.stats || {};
    $('#statsForm').innerHTML = `
      <div class="card-title">Counter blocks</div>
      <div class="row" style="flex-direction: column; align-items: flex-start; gap: 12px;">
        <label class="switch"><input type="checkbox" id="stats-viewers" ${s.showViewers!==false?'checked':''} data-testid="stats-viewers"/><span class="track"></span><span class="lbl">Viewers</span></label>
        <label class="switch"><input type="checkbox" id="stats-likes"    ${s.showLikes!==false?'checked':''} data-testid="stats-likes"/><span class="track"></span><span class="lbl">Session likes</span></label>
        <label class="switch"><input type="checkbox" id="stats-followers"${s.showFollowers!==false?'checked':''} data-testid="stats-followers"/><span class="track"></span><span class="lbl">New followers</span></label>
      </div>`;
    $('#statsForm').addEventListener('input', () => {
      CFG.stats.showViewers   = $('#stats-viewers').checked;
      CFG.stats.showLikes     = $('#stats-likes').checked;
      CFG.stats.showFollowers = $('#stats-followers').checked;
      debouncedSave();
    });
  }
  function renderTicker() {
    const t = CFG.ticker || {};
    $('#tickerForm').innerHTML = `
      <div class="card-title">Ticker</div>
      <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 14px;">
        <label class="fld"><span>Scroll speed (seconds per loop)</span>
          <input type="number" min="10" step="5" id="ticker-speed" value="${t.speed||60}" data-testid="ticker-speed"/></label>
        <label class="fld"><span>Max items</span>
          <input type="number" min="5" step="1" id="ticker-max" value="${t.maxItems||20}" data-testid="ticker-max"/></label>
      </div>`;
    $('#tickerForm').addEventListener('input', () => {
      CFG.ticker.speed = Number($('#ticker-speed').value);
      CFG.ticker.maxItems = Number($('#ticker-max').value);
      debouncedSave();
    });
  }

  // ---------------- Uploads ----------------
  async function loadUploads() {
    const r = await api('/api/uploads');
    UPLOADS = r.uploads || [];
    renderUploads();
  }
  function renderUploads() {
    // update selects on alert cards & render library grid
    const list = $('#uploadsList'); if (!list) return;
    list.innerHTML = '';
    if (!UPLOADS.length) list.innerHTML = '<div class="hint">Nothing uploaded yet.</div>';
    for (const u of UPLOADS) {
      const card = document.createElement('div'); card.className = 'upload';
      const thumb = u.kind === 'audio'
        ? `<div class="thumb audio"><audio controls src="${u.url}"></audio></div>`
        : (u.kind === 'video'
          ? `<div class="thumb"><video src="${u.url}" autoplay muted loop playsinline style="max-width:100%;max-height:100%;"></video></div>`
          : `<div class="thumb"><img src="${u.url}" alt=""></div>`);
      card.innerHTML = `
        ${thumb}
        <div class="name">${escHTML(u.filename)}</div>
        <div class="meta"><span>${u.kind}</span><span>${(u.size/1024).toFixed(1)} KB</span></div>
        <div class="row">
          <button class="btn ghost" data-copy="${u.url}" data-testid="upload-copy">Copy URL</button>
          <button class="btn danger" data-delete="${u.id}" data-testid="upload-delete">Delete</button>
        </div>`;
      list.appendChild(card);
    }
    list.addEventListener('click', async (e) => {
      const copyBtn = e.target.closest('[data-copy]');
      if (copyBtn) { navigator.clipboard.writeText(location.origin + copyBtn.dataset.copy); toast('URL copied.'); return; }
      const delBtn = e.target.closest('[data-delete]');
      if (delBtn) {
        if (!confirm('Delete this file?')) return;
        await api('/api/uploads/' + delBtn.dataset.delete, 'DELETE');
        loadUploads();
        toast('Deleted.');
      }
    }, { once: false });
    // Re-render alert forms to refresh selects
    renderAlerts();
  }
  async function doUpload() {
    const inp = $('#uploadInput'); const status = $('#uploadStatus');
    if (!inp.files || !inp.files[0]) return toast('Choose a file first.', true);
    const fd = new FormData(); fd.append('file', inp.files[0]);
    status.textContent = 'Uploading…';
    const r = await fetch('/api/uploads', { method:'POST', body: fd });
    if (!r.ok) { const j = await r.json().catch(()=>({})); status.textContent = ''; return toast('Upload failed: '+(j.error||r.status), true); }
    status.textContent = '';
    inp.value = '';
    toast('Uploaded.');
    loadUploads();
  }
  function soundSelect(alertKey, current) {
    const options = ['<option value="">(none)</option>'];
    for (const u of UPLOADS.filter(u => u.kind === 'audio')) {
      options.push(`<option value="${u.url}" ${u.url===current?'selected':''}>${escHTML(u.filename)}</option>`);
    }
    return `<select data-alert="${alertKey}" data-field="sound" data-testid="alert-${alertKey}-sound">${options.join('')}</select>`;
  }
  function imageSelect(alertKey, current) {
    const options = ['<option value="">(none)</option>'];
    for (const u of UPLOADS.filter(u => u.kind === 'image' || u.kind === 'video')) {
      const tag = u.kind === 'video' ? ' [video]' : '';
      options.push(`<option value="${u.url}" ${u.url===current?'selected':''}>${escHTML(u.filename)}${tag}</option>`);
    }
    return `<select data-alert="${alertKey}" data-field="image" data-testid="alert-${alertKey}-image">${options.join('')}</select>`;
  }

  // ---------------- URL list / OBS ----------------
  function fillUrls() {
    const items = [
      ['Alerts', '/overlay/alerts'],
      ['Chat',   '/overlay/chat'],
      ['Goal',   '/overlay/goal'],
      ['Stats',  '/overlay/stats'],
      ['Ticker', '/overlay/ticker'],
    ];
    const el = $('#urlList');
    el.innerHTML = '';
    for (const [label, path] of items) {
      const url = location.origin + path;
      const row = document.createElement('div'); row.className = 'url-row';
      row.innerHTML = `
        <div class="label">${label}</div>
        <input type="text" readonly value="${url}" onclick="this.select()" data-testid="url-${label.toLowerCase()}"/>
        <button class="btn ghost" data-copy-url="${url}" data-testid="copy-${label.toLowerCase()}">Copy</button>
      `;
      el.appendChild(row);
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-copy-url]');
      if (!b) return;
      navigator.clipboard.writeText(b.dataset.copyUrl); toast('URL copied.');
    });
  }

  // ---------------- Test buttons / Demo ----------------
  async function fireTest(type) {
    await api('/api/demo/fire', 'POST', { type });
  }
  function updateDemoStatus(running) {
    $('#demoStatus').textContent = running ? 'Demo mode: RUNNING' : '';
  }

  // ---------------- Event log ----------------
  async function loadLog() {
    const r = await api('/api/log');
    const list = $('#logList'); list.innerHTML = '';
    (r.log||[]).slice().reverse().forEach(prependLog);
  }
  function prependLog(ev) {
    const list = $('#logList'); if (!list) return;
    const row = document.createElement('div'); row.className = 'log-row';
    const ts = new Date(ev.ts||Date.now()).toLocaleTimeString();
    const body = summarise(ev);
    row.innerHTML = `<div class="ts">${ts}</div><div class="type ${escAttr(ev.type)}">${escHTML(ev.type)}</div><div class="body">${body}</div>`;
    list.prepend(row);
    while (list.children.length > 500) list.lastChild.remove();
  }
  function summarise(ev) {
    const u = ev.user && (ev.user.nickname || ev.user.username) || '';
    if (ev.type === 'comment') return `<strong>${escHTML(u)}</strong> — ${escHTML((ev.value.comment||'').slice(0,140))}`;
    if (ev.type === 'gift')    return `<strong>${escHTML(u)}</strong> — ${escHTML(ev.value.giftName||'gift')} x${ev.value.repeatCount||1} · ${ev.value.coins||0} coins`;
    if (ev.type === 'like')    return `<strong>${escHTML(u)}</strong> — +${ev.value.likeCount||1} likes`;
    if (ev.type === 'viewers') return `viewers = ${ev.value.viewerCount||0}`;
    if (ev.type === 'follow' || ev.type === 'share' || ev.type === 'subscribe' || ev.type === 'join') return `<strong>${escHTML(u)}</strong>`;
    if (ev.type === 'streamStart' || ev.type === 'streamEnd') return escHTML(JSON.stringify(ev.value||{}));
    return '';
  }

  // ---------------- API helper ----------------
  async function api(path, method='GET', body) {
    const opts = { method, headers:{'Content-Type':'application/json'} };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(path, opts);
    if (r.status === 401) { location.href = '/login'; throw new Error('unauth'); }
    if (!r.ok) { const j = await r.json().catch(()=>({error:r.status})); throw new Error(j.error||r.status); }
    return r.json();
  }

  let saveTimer = null;
  function debouncedSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { await api('/api/config', 'PUT', { config: CFG }); }
      catch (e) { toast('Save failed', true); }
    }, 300);
  }

  // ---------------- Helpers ----------------
  function escHTML(s) {
    return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function escAttr(s) { return escHTML(s); }
  function toast(msg, err) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('err', !!err);
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }
})();
