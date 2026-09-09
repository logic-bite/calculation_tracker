// ================= Calc Log tab =================
(function(){
  const KEY_FRIENDS = 'toolbox_calc_friends';
  const KEY_ENTRIES = 'toolbox_calc_entries';
  const KEY_LAYOUT  = 'toolbox_calc_layout';
  const KEY_DISPLAY_H = 'toolbox_calc_display_h';
  const KEY_LABELS = 'toolbox_calc_labels';
  const defaultLabels = {
    loggingFor:'Logging for', entryDate:'Entry date', editLayout:'Edit Layout',
    periodSumTotal:'Sum Total', periodPassTotal:'Pass Total', periodBonus:'Bonus', periodNetTotal:'Net Total'
  };
  let customLabels = Object.assign({}, defaultLabels, load(KEY_LABELS, {}));

  const COLS = 4, GAP = 8;

  function load(key, fallback){
    try{ const v = JSON.parse(localStorage.getItem(key)); return v==null?fallback:v; }catch(e){ return fallback; }
  }
  function save(key, val){
    try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){}
    if(key===KEY_FRIENDS || key===KEY_ENTRIES || key===KEY_LAYOUT || key===KEY_HEADER_LAYOUT || key===KEY_LABELS || key===KEY_PERIOD_START || key===KEY_PERIOD_END || key===KEY_BONUS_PCT || key===KEY_CUSTOM_VARS || key===KEY_CUSTOM_PANELS){
      scheduleSync();
    }
  }

  let friends = load(KEY_FRIENDS, []);
  let activeFriend = friends[0] || null;
  let entries = load(KEY_ENTRIES, []);
  let editMode = false;
  let friendEditMode = false;
  const CORE_IDS = ['bs','clr','logsum','logpass'];

  const defaultLayout = [
    {id:'d7',x:0,y:0,w:1,h:1,action:'digit',value:'7',label:'7'},
    {id:'d8',x:1,y:0,w:1,h:1,action:'digit',value:'8',label:'8'},
    {id:'d9',x:2,y:0,w:1,h:1,action:'digit',value:'9',label:'9'},
    {id:'bs',x:3,y:0,w:1,h:1,action:'backspace',value:'',label:'⌫'},
    {id:'d4',x:0,y:1,w:1,h:1,action:'digit',value:'4',label:'4'},
    {id:'d5',x:1,y:1,w:1,h:1,action:'digit',value:'5',label:'5'},
    {id:'d6',x:2,y:1,w:1,h:1,action:'digit',value:'6',label:'6'},
    {id:'div',x:3,y:1,w:1,h:1,action:'op',value:'÷',label:'÷'},
    {id:'d1',x:0,y:2,w:1,h:1,action:'digit',value:'1',label:'1'},
    {id:'d2',x:1,y:2,w:1,h:1,action:'digit',value:'2',label:'2'},
    {id:'d3',x:2,y:2,w:1,h:1,action:'digit',value:'3',label:'3'},
    {id:'mul',x:3,y:2,w:1,h:1,action:'op',value:'×',label:'×'},
    {id:'lp',x:0,y:3,w:1,h:1,action:'op',value:'(',label:'('},
    {id:'rp',x:1,y:3,w:1,h:1,action:'op',value:')',label:')'},
    {id:'dot',x:2,y:3,w:1,h:1,action:'dot',value:'.',label:'.'},
    {id:'sub',x:3,y:3,w:1,h:1,action:'op',value:'−',label:'−'},
    {id:'d0',x:0,y:4,w:2,h:1,action:'digit',value:'0',label:'0'},
    {id:'clr',x:2,y:4,w:1,h:1,action:'clear',value:'',label:'C'},
    {id:'add',x:3,y:4,w:1,h:1,action:'op',value:'+',label:'+'},
    {id:'logpass',x:0,y:5,w:2,h:1,action:'logPass',value:'',label:'Log Pass'},
    {id:'logsum',x:2,y:5,w:2,h:1,action:'logSum',value:'',label:'Log Sum'}
  ];
  let layout = load(KEY_LAYOUT, null) || JSON.parse(JSON.stringify(defaultLayout));

  // ---- freeform header widgets (friends / manage / logging label / edit layout / entry date) ----
  const KEY_HEADER_LAYOUT = 'toolbox_calc_header_layout';
  const HEADER_COLS = 4, HEADER_ROW = 46;
  function defaultHeaderLayout(){
    return [
      {id:'friends',      x:0, y:0, w:3, h:2},
      {id:'manage',       x:3, y:0, w:1, h:1},
      {id:'loggingLabel', x:0, y:2, w:2, h:1},
      {id:'layoutBtns',   x:2, y:2, w:2, h:1},
      {id:'entryDate',    x:0, y:3, w:4, h:1}
    ];
  }
  let headerLayout = load(KEY_HEADER_LAYOUT, null) || defaultHeaderLayout();
  let headerEditMode = false;

  // ---- period summary (running totals since the last reset) ----
  const KEY_PERIOD_START = 'toolbox_calc_period_start';
  const KEY_PERIOD_END = 'toolbox_calc_period_end';
  const KEY_BONUS_PCT = 'toolbox_calc_bonus_pct';
  const KEY_KEY_FONT = 'toolbox_calc_keyfont';
  const KEY_KEY_ACCENT_FONT = 'toolbox_calc_key_accent_font';
  const KEY_CUSTOM_VARS = 'toolbox_calc_custom_vars';
  const KEY_CUSTOM_PANELS = 'toolbox_calc_custom_panels';
  let periodStart = load(KEY_PERIOD_START, null);
  if(!periodStart){ periodStart = Date.now(); save(KEY_PERIOD_START, periodStart); }
  let periodEnd = load(KEY_PERIOD_END, null); // null = open-ended, counts up to now
  let bonusPct = load(KEY_BONUS_PCT, 4); // percent, e.g. 4 = 4%
  let customVars = load(KEY_CUSTOM_VARS, []);     // [{id, name, formula}] — formula can use sum/pass/bonus/net + earlier variables
  let customPanels = load(KEY_CUSTOM_PANELS, []); // [{id, title, isPeriod, open, items:[{id,label,formula}]}]
  let periodUndoPrev = null; // in-memory only — powers the "Undo" on the reset toast

  // ---- migrate older data shapes, and make sure the built-in Period Summary
  // panel always exists (it replaces what used to be a separate, hardcoded
  // "period summary" UI — same since/until/reset logic, just modeled as the
  // first panel so it can live alongside custom panels below the calculator) ----
  function migrateVarsAndPanels(){
    let changed = false;
    customVars.forEach(v=>{
      if(v.formula===undefined){
        v.formula = (v.value!==undefined && v.value!==null) ? String(v.value) : '0';
        delete v.value;
        changed = true;
      }
    });
    customPanels.forEach(p=>{
      if(!Array.isArray(p.items)){
        p.items = [{ id:'i'+Date.now().toString(36)+Math.random().toString(36).slice(2,5), label:p.title, formula: p.formula!==undefined ? p.formula : '0' }];
        delete p.formula;
        changed = true;
      }
      if(typeof p.open !== 'boolean'){ p.open = false; changed = true; }
    });
    if(!customPanels.some(p=>p.isPeriod)){
      customPanels.unshift({
        id:'period', title:'Period Summary', isPeriod:true, open:false,
        items:[
          { id:'sum',   label:customLabels.periodSumTotal,  formula:'sum' },
          { id:'pass',  label:customLabels.periodPassTotal, formula:'pass' },
          { id:'bonus', label:customLabels.periodBonus,     formula:'bonus' },
          { id:'net',   label:customLabels.periodNetTotal,  formula:'net' }
        ]
      });
      changed = true;
    }
    if(changed){ save(KEY_CUSTOM_VARS, customVars); save(KEY_CUSTOM_PANELS, customPanels); }
  }
  migrateVarsAndPanels();
  const headerGrid = document.getElementById('headerGrid');
  const rearrangeHeaderBtn = document.getElementById('rearrangeHeaderBtn');
  const rearrangeHeaderLabel = document.getElementById('rearrangeHeaderLabel');
  const resetHeaderBtn = document.getElementById('resetHeaderBtn');
  // cache these while they still live inside #widgetTemplates, so we can move (not clone) them
  // into freeform tiles without losing any of their listeners
  const widgetBodies = {
    friends:      document.getElementById('widgetFriends'),
    manage:       document.getElementById('widgetManage'),
    loggingLabel: document.getElementById('widgetLoggingLabel'),
    layoutBtns:   document.getElementById('widgetLayoutBtns'),
    entryDate:    document.getElementById('widgetEntryDate')
  };

  const friendRow = document.getElementById('friendRow');
  const editFriendsBtn = document.getElementById('editFriendsBtn');
  const activeFriendLabel = document.getElementById('activeFriendLabel');
  const editLayoutBtn = document.getElementById('editLayoutBtn');
  const restoreBtn = document.getElementById('restoreBtn');
  const calcDisplay = document.getElementById('calcDisplay');
  const calcPreview = document.getElementById('calcPreview');
  const calcMirror = document.getElementById('calcMirror');
  const calcMirrorText = document.getElementById('calcMirrorText');
  const calcCursor = document.getElementById('calcCursor');
  const btnGrid = document.getElementById('btnGrid');
  const historyWrap = document.getElementById('historyWrap');
  const historyFilterEl = document.getElementById('historyFilter');
  let historyFilter = 'all';
  let historyDaysShown = 4; // how many day-groups to render before requiring "Show more"
  const modalRoot = document.getElementById('modalRoot');
  const toastEl = document.getElementById('toast');
  const backupBtn = document.getElementById('backupBtn');

  // ---------- cloud sync (Supabase) ----------
  const saveStatusEl = document.getElementById('saveStatus');
  const KEY_LOCAL_UPDATED = 'toolbox_local_updated';
  let syncTimer = null;
  let pendingSync = false;
  let reconciled = false; // true once the first pull-vs-local reconcile has resolved

  function setSyncStatus(state){
    if(!saveStatusEl) return;
    if(!SUPABASE_CONFIGURED){ saveStatusEl.style.display = 'none'; return; }
    saveStatusEl.style.display = 'flex';
    saveStatusEl.classList.remove('is-saving','is-saved','is-offline','is-error');
    if(state==='saving'){ saveStatusEl.classList.add('is-saving'); saveStatusEl.textContent = 'Saving…'; }
    else if(state==='saved'){ saveStatusEl.classList.add('is-saved'); const t = new Date().toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}); saveStatusEl.textContent = 'Saved ✓ ' + t; }
    else if(state==='offline'){ saveStatusEl.classList.add('is-offline'); saveStatusEl.textContent = 'Offline — will sync'; }
    else if(state==='error'){ saveStatusEl.classList.add('is-error'); saveStatusEl.textContent = 'Sync failed — will retry'; }
  }

  function scheduleSync(){
    if(!SUPABASE_CONFIGURED) return;
    pendingSync = true;
    setSyncStatus('saving');
    clearTimeout(syncTimer);
    syncTimer = setTimeout(performSync, 800);
  }

  async function performSync(){
    if(!SUPABASE_CONFIGURED) return;
    if(!reconciled){ pendingSync = true; return; } // don't push until we know how we compare to remote — avoids clobbering good remote data with a not-yet-merged local state
    if(!navigator.onLine){ setSyncStatus('offline'); return; }
    try{
      const { data: userData, error: userErr } = await supabaseClient.auth.getUser();
      if(userErr || !userData || !userData.user){ setSyncStatus('offline'); return; }
      const uid = userData.user.id;
      const payload = { friends, entries, layout, headerLayout, customLabels, periodStart, periodEnd, bonusPct, customVars, customPanels };
      const nowIso = new Date().toISOString();
      const { error } = await supabaseClient.from('toolbox_state').upsert(
        { user_id: uid, payload, updated_at: nowIso },
        { onConflict: 'user_id' }
      );
      if(error){ setSyncStatus('error'); return; }
      localStorage.setItem(KEY_LOCAL_UPDATED, nowIso);
      pendingSync = false;
      setSyncStatus('saved');
    }catch(e){
      setSyncStatus('offline');
    }
  }

  window.addEventListener('online', ()=>{ if(pendingSync) performSync(); });
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState==='hidden' && pendingSync){ clearTimeout(syncTimer); performSync(); }
  });

  async function pullAndReconcile(){
    if(!SUPABASE_CONFIGURED) return;
    setSyncStatus('saving');
    try{
      const { data: userData } = await supabaseClient.auth.getUser();
      if(!userData || !userData.user) return;
      const uid = userData.user.id;
      const { data: row } = await supabaseClient.from('toolbox_state').select('*').eq('user_id', uid).maybeSingle();
      const localUpdated = localStorage.getItem(KEY_LOCAL_UPDATED);
      if(row && row.updated_at && (!localUpdated || new Date(row.updated_at) > new Date(localUpdated))){
        const p = row.payload || {};
        // Guard against an empty/incomplete remote payload wiping out real local
        // data (e.g. a second browser's very first, still-empty state getting
        // treated as "newer"). Only adopt remote friends/entries if remote
        // actually has something, OR local is already empty too (fresh setup).
        if(Array.isArray(p.friends) && (p.friends.length || friends.length === 0)) friends = p.friends;
        if(Array.isArray(p.entries) && (p.entries.length || entries.length === 0)) entries = p.entries;
        if(Array.isArray(p.layout) && p.layout.length) layout = p.layout;
        if(Array.isArray(p.headerLayout) && p.headerLayout.length) headerLayout = p.headerLayout;
        if(p.customLabels && typeof p.customLabels==='object') customLabels = Object.assign({}, defaultLabels, p.customLabels);
        if(typeof p.periodStart==='number') periodStart = p.periodStart;
        periodEnd = (typeof p.periodEnd==='number') ? p.periodEnd : null;
        if(typeof p.bonusPct==='number') bonusPct = p.bonusPct;
        if(Array.isArray(p.customVars) && (p.customVars.length || customVars.length === 0)) customVars = p.customVars;
        if(Array.isArray(p.customPanels) && (p.customPanels.length || customPanels.length === 0)) customPanels = p.customPanels;
        save(KEY_FRIENDS, friends); save(KEY_ENTRIES, entries); save(KEY_LAYOUT, layout);
        save(KEY_HEADER_LAYOUT, headerLayout); save(KEY_LABELS, customLabels);
        save(KEY_PERIOD_START, periodStart); save(KEY_PERIOD_END, periodEnd); save(KEY_BONUS_PCT, bonusPct);
        save(KEY_CUSTOM_VARS, customVars); save(KEY_CUSTOM_PANELS, customPanels);
        localStorage.setItem(KEY_LOCAL_UPDATED, row.updated_at);
        activeFriend = friends[0] || null;
        migrateVarsAndPanels();
        stripLegacyPanelWidgets();
        safeRenderAll();
        setSyncStatus('saved');
      } else {
        await performSync();
      }
    }catch(e){
      setSyncStatus('offline');
    } finally {
      reconciled = true;
      if(pendingSync){ performSync(); }
    }
  }
  window.__toolboxOnUnlock = pullAndReconcile;
  setSyncStatus(SUPABASE_CONFIGURED ? 'saved' : null);
  if(!SUPABASE_CONFIGURED) reconciled = true;

  // Runs each render step independently — if one throws (e.g. from an
  // unexpected data shape), the rest of the UI still renders instead of
  // the whole screen going blank after the first failure.
  function safeStep(fn){
    try{ fn(); }catch(err){ console.error('[toolbox] render step failed:', err); }
  }
  function safeRenderAll(){
    safeStep(applyLabels);
    safeStep(renderFriends);
    safeStep(updateActiveLabel);
    safeStep(renderGrid);
    safeStep(renderHeaderGrid);
    safeStep(renderHistory);
    safeStep(updatePreview);
    safeStep(renderPeriodPanel);
  }

  function showToast(msg, actionLabel, onAction){
    toastEl.classList.remove('dragging');
    toastEl.style.transform = '';
    toastEl.style.opacity = '';
    toastEl.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = msg;
    toastEl.appendChild(span);
    if(actionLabel && onAction){
      const btn = document.createElement('button');
      btn.className = 'toast-action';
      btn.textContent = actionLabel;
      btn.addEventListener('click', ()=>{
        onAction();
        toastEl.classList.remove('show');
        clearTimeout(showToast._t);
      });
      toastEl.appendChild(btn);
    }
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=> toastEl.classList.remove('show'), actionLabel ? 4500 : 1800);
  }

  // ---- swipe-to-dismiss on the toast (either direction), Android-notification style ----
  (function(){
    let dragging = false, startX = 0, dx = 0, toastW = 0;
    const DISMISS_RATIO = 0.35; // fraction of toast width needed to dismiss

    toastEl.addEventListener('pointerdown', (e)=>{
      if(!toastEl.classList.contains('show')) return;
      if(e.target.closest('.toast-action')) return; // let the action button handle its own tap
      dragging = true;
      startX = e.clientX;
      dx = 0;
      toastW = toastEl.offsetWidth || 1;
      toastEl.classList.add('dragging');
      toastEl.setPointerCapture(e.pointerId);
    });

    toastEl.addEventListener('pointermove', (e)=>{
      if(!dragging) return;
      dx = e.clientX - startX;
      toastEl.style.transform = `translateX(calc(-50% + ${dx}px)) translateY(0)`;
      toastEl.style.opacity = String(Math.max(0.15, 1 - Math.abs(dx) / toastW));
    });

    function endDrag(e){
      if(!dragging) return;
      dragging = false;
      toastEl.classList.remove('dragging');
      const shouldDismiss = Math.abs(dx) > toastW * DISMISS_RATIO;
      if(shouldDismiss){
        const flyTo = dx > 0 ? toastW * 1.2 : -toastW * 1.2;
        toastEl.style.transform = `translateX(calc(-50% + ${flyTo}px)) translateY(0)`;
        toastEl.style.opacity = '0';
        clearTimeout(showToast._t);
        setTimeout(()=>{
          toastEl.classList.remove('show');
          toastEl.style.transform = '';
          toastEl.style.opacity = '';
        }, 200);
      } else {
        toastEl.style.transform = '';
        toastEl.style.opacity = '';
      }
      dx = 0;
    }

    toastEl.addEventListener('pointerup', endDrag);
    toastEl.addEventListener('pointercancel', endDrag);
  })();

  // ---------- expression evaluator (safe, no eval) ----------
  function evaluate(raw){
    let s = raw.replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-');
    s = s.replace(/[,;\s]+/g, '+');   // treat separators (commas, spaces, newlines) as addition
    s = s.replace(/\++/g, '+').replace(/\+-/g, '-').replace(/^\+/, '');
    if(!s.trim()) throw new Error('empty');
    let i = 0;
    function peek(){ return s[i]; }
    function parseExpr(){
      let v = parseTerm();
      while(peek()==='+' || peek()==='-'){
        const op = s[i++]; const rhs = parseTerm();
        v = op==='+' ? v+rhs : v-rhs;
      }
      return v;
    }
    function parseTerm(){
      let v = parseFactor();
      while(peek()==='*' || peek()==='/'){
        const op = s[i++]; const rhs = parseFactor();
        v = op==='*' ? v*rhs : v/rhs;
      }
      return v;
    }
    function parseFactor(){
      if(peek()==='+'){ i++; return parseFactor(); }
      if(peek()==='-'){ i++; return -parseFactor(); }
      if(peek()==='('){
        i++; const v = parseExpr();
        if(peek()===')') i++;
        return v;
      }
      let start = i;
      while(i<s.length && /[0-9.]/.test(s[i])) i++;
      if(start===i) throw new Error('bad token near '+s.slice(i));
      return parseFloat(s.slice(start,i));
    }
    const result = parseExpr();
    if(i < s.length) throw new Error('trailing input');
    if(!isFinite(result)) throw new Error('not finite');
    return result;
  }

  function updatePreview(){
    syncMirror();
    const raw = calcDisplay.value;
    if(!raw.trim()){ calcPreview.innerHTML='&nbsp;'; calcPreview.classList.remove('err'); return; }
    try{
      const v = evaluate(raw);
      calcPreview.textContent = '= ' + round2(v);
      calcPreview.classList.remove('err');
      return;
    }catch(e){}
    // incomplete expression (e.g. trailing operator) — show the result up to the last complete point,
    // the way a real calculator keeps showing its running total while you type the next step
    let s = raw;
    while(s.length){
      s = s.slice(0, -1);
      if(!s.trim()) break;
      try{
        const v = evaluate(s);
        calcPreview.textContent = '= ' + round2(v);
        calcPreview.classList.remove('err');
        return;
      }catch(e2){ /* keep trimming */ }
    }
    calcPreview.innerHTML = '&nbsp;';
    calcPreview.classList.remove('err');
  }
  function round2(n){ return Math.round(n*100)/100; }
  function netInfo(sum, pass){
    const diff = round2(sum - pass);
    const cls = diff > 0 ? 'net-pos' : (diff < 0 ? 'net-neg' : 'net-zero');
    const txt = diff > 0 ? ('+' + diff) : String(diff);
    return { cls, txt };
  }

  // ---------- formula evaluator for custom variables/panels (safe, no eval) ----------
  // Same style as evaluate() above, but also understands named identifiers
  // (sum, pass, bonus, net, and any custom variable name) looked up in `scope`.
  function evaluateFormula(raw, scope){
    let s = String(raw).replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-').replace(/%/g,'/100');
    if(!s.trim()) throw new Error('Empty formula');
    let i = 0;
    function skipWs(){ while(s[i]===' '||s[i]==='\t') i++; }
    function peek(){ skipWs(); return s[i]; }
    function parseExpr(){
      let v = parseTerm();
      let op;
      while((op = peek())==='+' || op==='-'){ i++; const rhs = parseTerm(); v = op==='+' ? v+rhs : v-rhs; }
      return v;
    }
    function parseTerm(){
      let v = parseFactor();
      let op;
      while((op = peek())==='*' || op==='/'){ i++; const rhs = parseFactor(); v = op==='*' ? v*rhs : v/rhs; }
      return v;
    }
    function parseFactor(){
      const c = peek();
      if(c==='+'){ i++; return parseFactor(); }
      if(c==='-'){ i++; return -parseFactor(); }
      if(c==='('){ i++; const v = parseExpr(); if(peek()===')') i++; return v; }
      if(c && /[A-Za-z_]/.test(c)){
        const start = i;
        while(i<s.length && /[A-Za-z0-9_]/.test(s[i])) i++;
        const name = s.slice(start, i);
        const key = Object.keys(scope).find(k=>k.toLowerCase()===name.toLowerCase());
        if(key===undefined) throw new Error('Unknown variable "'+name+'"');
        return Number(scope[key]) || 0;
      }
      const start = i;
      while(i<s.length && /[0-9.]/.test(s[i])) i++;
      if(start===i) throw new Error('Bad token near "'+s.slice(i)+'"');
      return parseFloat(s.slice(start,i));
    }
    const result = parseExpr();
    skipWs();
    if(i < s.length) throw new Error('Unexpected text near "'+s.slice(i)+'"');
    if(!isFinite(result)) throw new Error('Result is not a finite number');
    return result;
  }

  function buildFormulaScope(totals){
    const t = totals || computePeriodTotalsSafe();
    const scope = { sum: t.sum, pass: t.pass, bonus: t.bonus, net: t.net };
    // built up in order, so each variable's formula can use sum/pass/bonus/net
    // plus any variable defined before it (chaining) — a variable referencing
    // itself or one defined later will simply fail to resolve and fall back to 0.
    customVars.forEach(v=>{
      try{ scope[v.name] = evaluateFormula(v.formula, scope); }
      catch(e){ scope[v.name] = 0; }
    });
    return scope;
  }
  // computePeriodTotals() is defined further down (period summary section); this
  // thin wrapper lets formula code above call it before that point in the file
  // without caring about declaration order (function declarations are hoisted,
  // but this keeps intent obvious at the call site).
  function computePeriodTotalsSafe(){ return computePeriodTotals(); }

  // ---------- custom cursor (mirror-based; keeps the real textarea readonly/inert so the keyboard never pops) ----------
  function syncMirror(){
    const val = calcDisplay.value;
    calcMirrorText.textContent = val.length ? val : '\u200b';
    positionCursor();
  }
  function positionCursor(){
    const val = calcDisplay.value;
    const textNode = calcMirrorText.firstChild;
    if(!textNode){ calcCursor.style.display = 'none'; return; }
    const idx = val.length ? Math.max(0, Math.min(calcDisplay.selectionStart ?? val.length, textNode.length)) : 0;
    const range = document.createRange();
    range.setStart(textNode, idx);
    range.setEnd(textNode, idx);
    const rects = range.getClientRects();
    const rect = rects[0] || range.getBoundingClientRect();
    const wrapRect = calcMirror.getBoundingClientRect();
    calcCursor.style.left = (rect.left - wrapRect.left + calcMirror.scrollLeft) + 'px';
    calcCursor.style.top = (rect.top - wrapRect.top + calcMirror.scrollTop) + 'px';
    if(rect.height) calcCursor.style.height = rect.height + 'px';
    calcCursor.style.display = 'block';
  }
  function tapToIndex(clientX, clientY){
    const val = calcDisplay.value;
    if(!val.length) return 0;
    let node = null, offset = 0;
    if(document.caretRangeFromPoint){
      const r = document.caretRangeFromPoint(clientX, clientY);
      if(r){ node = r.startContainer; offset = r.startOffset; }
    } else if(document.caretPositionFromPoint){
      const p = document.caretPositionFromPoint(clientX, clientY);
      if(p){ node = p.offsetNode; offset = p.offset; }
    }
    if(node === calcMirrorText.firstChild) return Math.max(0, Math.min(offset, val.length));
    if(node === calcMirrorText) return offset > 0 ? val.length : 0;
    return val.length; // tapped outside recognizable text (e.g. blank space below wrapped lines) — default to end
  }
  calcMirror.addEventListener('pointerdown', (e)=>{
    if(e.pointerType==='mouse' && e.button!==0) return;
    const idx = tapToIndex(e.clientX, e.clientY);
    calcDisplay.setSelectionRange(idx, idx);
    calcDisplay.focus({ preventScroll:true });
    positionCursor();
    e.preventDefault();
  });
  calcMirror.addEventListener('scroll', positionCursor);
  window.addEventListener('resize', positionCursor);

  calcDisplay.addEventListener('input', updatePreview);

  const OP_CHARS = ['+','−','×','÷'];
  function insertAtCursor(text){
    const start = calcDisplay.selectionStart ?? calcDisplay.value.length;
    const end = calcDisplay.selectionEnd ?? calcDisplay.value.length;
    if(OP_CHARS.includes(text) && start === end){
      const lastChar = calcDisplay.value.slice(0, start).slice(-1);
      if(OP_CHARS.includes(lastChar)){
        if(lastChar === text) return; // same operator already there — do nothing
        calcDisplay.setRangeText(text, start-1, start, 'end'); // different operator — replace it
        calcDisplay.focus();
        updatePreview();
        return;
      }
    }
    calcDisplay.setRangeText(text, start, end, 'end');
    calcDisplay.focus();
    updatePreview();
  }

  // ---------- friends ----------
  function renderFriends(){
    friendRow.innerHTML = '';
    friends.forEach(name=>{
      const wrap = document.createElement('div');
      wrap.className = 'friend-chip-wrap' + (friendEditMode ? ' editing' : '');
      const chip = document.createElement('button');
      chip.className = 'friend-chip' + (name===activeFriend ? ' active' : '');
      chip.textContent = name;
      if(friendEditMode){
        chip.addEventListener('click', ()=> openRenameFriendModal(name));
      } else {
        chip.addEventListener('click', ()=>{ activeFriend = name; renderFriends(); updateActiveLabel(); });
      }
      wrap.appendChild(chip);
      if(friendEditMode){
        const del = document.createElement('div');
        del.className = 'chip-del';
        del.textContent = '×';
        del.title = 'Delete friend';
        del.addEventListener('click', (e)=>{ e.stopPropagation(); confirmDeleteFriend(name); });
        wrap.appendChild(del);
      }
      friendRow.appendChild(wrap);
    });
    if(!friendEditMode){
      const wrap = document.createElement('div');
      wrap.className = 'friend-add';
      wrap.innerHTML = '<input id="newFriendInput" placeholder="Add friend" maxlength="24"><button id="addFriendBtn">+</button>';
      friendRow.appendChild(wrap);
      document.getElementById('addFriendBtn').addEventListener('click', addFriend);
      document.getElementById('newFriendInput').addEventListener('keydown', e=>{ if(e.key==='Enter') addFriend(); });
    }
  }
  function addFriend(){
    const input = document.getElementById('newFriendInput');
    const name = input.value.trim();
    if(!name) return;
    if(!friends.includes(name)) friends.push(name);
    activeFriend = name;
    save(KEY_FRIENDS, friends);
    renderFriends();
    updateActiveLabel();
  }
  function updateActiveLabel(){
    if(!activeFriend){ activeFriendLabel.textContent = 'Pick a friend above'; return; }
    const prefix = customLabels.loggingFor;
    activeFriendLabel.innerHTML = (prefix ? escapeHtml(prefix)+' ' : '') + '<b>'+escapeHtml(activeFriend)+'</b>';
  }
  function escapeHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function openRenameFriendModal(oldName){
    modalRoot.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <h3>Rename friend</h3>
        <label>New name</label>
        <input id="mRename" maxlength="24" value="${escapeHtml(oldName)}">
        <p>Past history keeps showing "${escapeHtml(oldName)}" for entries already logged, so your records stay accurate.</p>
        <div class="modal-actions">
          <button class="cancel" id="mCancel">Cancel</button>
          <button class="confirm" id="mSave">Save</button>
        </div>
      </div>`;
    modalRoot.appendChild(overlay);
    const input = document.getElementById('mRename');
    input.focus(); input.select();
    document.getElementById('mCancel').addEventListener('click', ()=> modalRoot.innerHTML='');
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) modalRoot.innerHTML=''; });
    document.getElementById('mSave').addEventListener('click', ()=>{
      const newName = input.value.trim();
      if(!newName){ modalRoot.innerHTML=''; return; }
      if(newName!==oldName && friends.includes(newName)){ showToast('That name is already used'); return; }
      const idx = friends.indexOf(oldName);
      if(idx>-1) friends[idx] = newName;
      if(activeFriend===oldName) activeFriend = newName;
      save(KEY_FRIENDS, friends);
      modalRoot.innerHTML = '';
      renderFriends();
      updateActiveLabel();
      showToast('Renamed to '+newName);
    });
  }

  function confirmDeleteFriend(name){
    modalRoot.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <h3>Delete "${escapeHtml(name)}"?</h3>
        <p>They'll be removed from your friend list, but any history already logged for them stays and will still show their name.</p>
        <div class="modal-actions">
          <button class="cancel" id="mCancel">Cancel</button>
          <button class="confirm danger" id="mDel">Delete</button>
        </div>
      </div>`;
    modalRoot.appendChild(overlay);
    document.getElementById('mCancel').addEventListener('click', ()=> modalRoot.innerHTML='');
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) modalRoot.innerHTML=''; });
    document.getElementById('mDel').addEventListener('click', ()=>{
      modalRoot.innerHTML = '';
      deleteFriend(name);
    });
  }

  function deleteFriend(name){
    const idx = friends.indexOf(name);
    if(idx<0) return;
    const wasActive = activeFriend===name;
    friends.splice(idx, 1);
    if(wasActive) activeFriend = friends[0] || null;
    save(KEY_FRIENDS, friends);
    renderFriends();
    updateActiveLabel();
    showToast('Deleted '+name+' — their history is kept', 'Undo', ()=>{
      friends.splice(idx, 0, name);
      if(wasActive) activeFriend = name;
      save(KEY_FRIENDS, friends);
      renderFriends();
      updateActiveLabel();
    });
  }

  // ---------- customizable labels (rename or blank: "Logging for", "Entry date", "Edit Layout") ----------
  function applyLabels(){
    const entryDateEl = document.getElementById('entryDateLabelText');
    if(entryDateEl){
      entryDateEl.textContent = customLabels.entryDate;
      entryDateEl.style.display = customLabels.entryDate ? '' : 'none';
    }
    const editLayoutEl = document.getElementById('editLayoutLabelText');
    if(editLayoutEl){
      editLayoutEl.textContent = customLabels.editLayout;
      editLayoutEl.style.display = customLabels.editLayout ? '' : 'none';
    }
  }
  function openLabelsModal(){
    modalRoot.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <h3>Customize labels</h3>
        <label>"Logging for" prefix</label>
        <input id="lblLoggingFor" maxlength="24" value="${escapeHtml(customLabels.loggingFor)}" placeholder="Leave blank to hide">
        <label>Entry date label</label>
        <input id="lblEntryDate" maxlength="24" value="${escapeHtml(customLabels.entryDate)}" placeholder="Leave blank to hide">
        <label>Edit Layout button text</label>
        <input id="lblEditLayout" maxlength="24" value="${escapeHtml(customLabels.editLayout)}" placeholder="Leave blank to hide">
        <label>Bonus percentage (used by the "bonus" value in panels)</label>
        <input id="lblBonusPct" type="number" min="0" max="100" step="0.1" value="${bonusPct}">
        <p style="margin:2px 0 0; font-size:11.5px; color:var(--text-dim);">Card labels &amp; formulas for Period Summary and other panels are edited from the "Panels" button, right next to each panel below the calculator.</p>
        <div class="modal-actions">
          <button class="cancel" id="mCancel">Cancel</button>
          <button class="confirm" id="mSave">Save</button>
        </div>
      </div>`;
    modalRoot.appendChild(overlay);
    document.getElementById('mCancel').addEventListener('click', ()=> modalRoot.innerHTML='');
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) modalRoot.innerHTML=''; });
    document.getElementById('mSave').addEventListener('click', ()=>{
      customLabels.loggingFor = document.getElementById('lblLoggingFor').value;
      customLabels.entryDate = document.getElementById('lblEntryDate').value;
      customLabels.editLayout = document.getElementById('lblEditLayout').value;
      const pctVal = parseFloat(document.getElementById('lblBonusPct').value);
      bonusPct = isNaN(pctVal) ? bonusPct : pctVal;
      save(KEY_LABELS, customLabels);
      save(KEY_BONUS_PCT, bonusPct);
      modalRoot.innerHTML = '';
      applyLabels();
      updateActiveLabel();
      renderPeriodPanel();
      showToast('Labels updated');
    });
  }
  document.getElementById('editLabelsBtn').addEventListener('click', openLabelsModal);

  // ---------- keypad font size (digits/operators/C/./etc, and the Log Sum / Log Pass labels) ----------
  (function(){
    const savedKeyFont = load(KEY_KEY_FONT, 16);
    const savedAccentFont = load(KEY_KEY_ACCENT_FONT, 12.5);
    document.documentElement.style.setProperty('--key-font-size', savedKeyFont + 'px');
    document.documentElement.style.setProperty('--key-accent-font-size', savedAccentFont + 'px');

    document.getElementById('keypadSizeBtn').addEventListener('click', ()=>{
      const curKey = load(KEY_KEY_FONT, 16);
      const curAccent = load(KEY_KEY_ACCENT_FONT, 12.5);
      modalRoot.innerHTML = '';
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-card">
          <h3>Keypad font size</h3>
          <label>Numbers / operators / C / . <span id="keyFontVal">${curKey}px</span></label>
          <input id="keyFontRange" type="range" min="11" max="30" step="0.5" value="${curKey}" style="width:100%;margin:6px 0 14px;">
          <label>"Log Sum" / "Log Pass" text <span id="accentFontVal">${curAccent}px</span></label>
          <input id="accentFontRange" type="range" min="9" max="20" step="0.5" value="${curAccent}" style="width:100%;margin:6px 0 14px;">
          <div class="modal-actions">
            <button class="confirm" id="mClose">Done</button>
          </div>
        </div>`;
      modalRoot.appendChild(overlay);
      const keyRange = document.getElementById('keyFontRange');
      const accentRange = document.getElementById('accentFontRange');
      keyRange.addEventListener('input', ()=>{
        document.documentElement.style.setProperty('--key-font-size', keyRange.value + 'px');
        document.getElementById('keyFontVal').textContent = keyRange.value + 'px';
        save(KEY_KEY_FONT, parseFloat(keyRange.value));
      });
      accentRange.addEventListener('input', ()=>{
        document.documentElement.style.setProperty('--key-accent-font-size', accentRange.value + 'px');
        document.getElementById('accentFontVal').textContent = accentRange.value + 'px';
        save(KEY_KEY_ACCENT_FONT, parseFloat(accentRange.value));
      });
      document.getElementById('mClose').addEventListener('click', ()=> modalRoot.innerHTML='');
      overlay.addEventListener('click', (e)=>{ if(e.target===overlay) modalRoot.innerHTML=''; });
    });
  })();

  // ---------- period summary (running totals since the last reset) ----------
  // NOTE: the underlying since/until/reset math below is unchanged from
  // before — only how its 4 cards are displayed/edited has moved into the
  // generic panel system.
  const panelsWrap = document.getElementById('panelsWrap');

  function formatPeriodDateTime(ts){
    return new Date(ts).toLocaleString(undefined, {
      weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'
    });
  }

  function computePeriodTotals(){
    let sum = 0, pass = 0;
    entries.forEach(e=>{
      if(e.ts < periodStart) return;
      if(periodEnd != null && e.ts > periodEnd) return;
      if(historyFilter !== 'all' && e.friend !== historyFilter) return;
      if(e.kind === 'sum') sum += e.value;
      else if(e.kind === 'pass') pass += e.value;
    });
    sum = round2(sum); pass = round2(pass);
    const bonus = round2(sum * (bonusPct/100));
    const net = round2(sum - pass - bonus);
    return { sum, pass, bonus, net };
  }

  // ---------- unified panels (Period Summary + custom panels) — collapsible
  // sections rendered below the calculator, each holding its own row of
  // formula-driven stat cards ----------
  const ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const ICON_DELETE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-12"/></svg>';
  const ICON_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';
  const ICON_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  const RESERVED_NAMES = ['sum','pass','bonus','net'];

  // last formula <input>/<textarea> the user focused inside a manager modal —
  // lets the token chips insert into "wherever you were typing"
  let lastFocusedFormulaInput = null;
  function insertTokenIntoFocused(token){
    const el = lastFocusedFormulaInput;
    if(!el || !document.body.contains(el)) return;
    const start = el.selectionStart!=null ? el.selectionStart : el.value.length;
    const end = el.selectionEnd!=null ? el.selectionEnd : el.value.length;
    const val = el.value;
    el.value = val.slice(0,start) + token + val.slice(end);
    const pos = start + token.length;
    el.focus();
    try{ el.setSelectionRange(pos,pos); }catch(e){}
    el.dispatchEvent(new Event('input', {bubbles:true}));
  }

  function renderPeriodPanel(){
    if(!panelsWrap) return; // guard in case this tool's DOM isn't in this tab
    const totals = computePeriodTotals();
    const scope = buildFormulaScope(totals);
    panelsWrap.innerHTML = '';

    customPanels.forEach(p=>{
      const section = document.createElement('div');
      section.className = 'panel-section';

      const toggleRow = document.createElement('div');
      toggleRow.className = 'panel-toggle-row';
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'period-toggle-btn' + (p.open ? ' open' : '');
      toggleBtn.innerHTML = `<span>${escapeHtml(p.title || 'Panel')}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;
      toggleBtn.addEventListener('click', ()=>{
        p.open = !p.open;
        save(KEY_CUSTOM_PANELS, customPanels);
        renderPeriodPanel();
      });
      const editBtn = document.createElement('button');
      editBtn.className = 'panel-edit-btn';
      editBtn.title = 'Edit this panel';
      editBtn.innerHTML = ICON_EDIT;
      editBtn.addEventListener('click', ()=> openPanelsModal(p.id));
      toggleRow.appendChild(toggleBtn);
      toggleRow.appendChild(editBtn);
      section.appendChild(toggleRow);

      if(p.open){
        const body = document.createElement('div');
        body.className = 'period-panel';

        if(p.isPeriod){
          const sinceRow = document.createElement('div');
          sinceRow.className = 'period-since-row';
          sinceRow.innerHTML = `<div class="period-since">Since <b>${escapeHtml(formatPeriodDateTime(periodStart))}</b></div>
            <button class="mini-btn" data-act="editStart">${ICON_EDIT}<span>Edit start</span></button>`;
          body.appendChild(sinceRow);
          const untilRow = document.createElement('div');
          untilRow.className = 'period-since-row';
          untilRow.innerHTML = `<div class="period-since">${periodEnd != null ? ('Until <b>' + escapeHtml(formatPeriodDateTime(periodEnd)) + '</b>') : 'Until <b>now</b> (ongoing)'}</div>
            <button class="mini-btn" data-act="editEnd">${ICON_EDIT}<span>Edit end</span></button>`;
          body.appendChild(untilRow);
        }

        const statsRow = document.createElement('div');
        statsRow.className = 'stats-row' + (p.isPeriod ? ' period-stats' : '');
        const items = p.items || [];
        if(!items.length){
          statsRow.innerHTML = '<div class="manager-hint">No cards yet — tap the pencil above to add some.</div>';
        } else {
          items.forEach(item=>{
            const card = document.createElement('div');
            card.className = 'stat-card';
            const isNet = item.id === 'net';
            let labelSuffix = '';
            if(item.formula && item.formula.trim().toLowerCase()==='bonus') labelSuffix = ' (' + bonusPct + '%)';
            try{
              const v = round2(evaluateFormula(item.formula, scope));
              if(isNet){
                const cls = v>0?'pos':(v<0?'neg':'');
                card.innerHTML = `<div class="stat-value${cls?(' '+cls):''}">${v>0?('+'+v):v}</div><div class="stat-label">${escapeHtml(item.label||'')}${labelSuffix}</div>`;
              } else {
                card.innerHTML = `<div class="stat-value">${v}</div><div class="stat-label">${escapeHtml(item.label||'')}${labelSuffix}</div>`;
              }
            }catch(err){
              card.classList.add('error');
              card.innerHTML = `<div class="stat-value">Err</div><div class="stat-label">${escapeHtml(item.label||'')}</div>`;
            }
            statsRow.appendChild(card);
          });
        }
        body.appendChild(statsRow);

        if(p.isPeriod){
          const actions = document.createElement('div');
          actions.className = 'period-actions';
          actions.innerHTML = `<button class="tool-btn accent" data-act="reset">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
            Reset period</button>`;
          body.appendChild(actions);
        }

        section.appendChild(body);

        if(p.isPeriod){
          body.querySelector('[data-act="editStart"]').addEventListener('click', ()=> openPeriodStartModal('edit'));
          body.querySelector('[data-act="editEnd"]').addEventListener('click', ()=> openPeriodStartModal('editEnd'));
          body.querySelector('[data-act="reset"]').addEventListener('click', ()=> openPeriodStartModal('reset'));
        }
      }

      panelsWrap.appendChild(section);
    });

    const addRow = document.createElement('div');
    addRow.className = 'add-panel-row';
    addRow.innerHTML = `<button class="tool-btn accent" id="addPanelBtn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      Add panel</button>`;
    panelsWrap.appendChild(addRow);
    document.getElementById('addPanelBtn').addEventListener('click', ()=> openPanelsModal('__new__'));
  }

  function toLocalDatetimeInputValue(ts){
    const d = new Date(ts);
    const pad = n => String(n).padStart(2,'0');
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function openPeriodStartModal(mode){
    // mode: 'reset' (defaults the picker to "now", touches the running Undo),
    // 'edit' (start date, defaults to the current start), or
    // 'editEnd' (end date, defaults to current end or now; can be cleared to open-ended)
    // — unchanged from before; since/until behavior stays exactly as it was.
    const isReset = mode === 'reset';
    const isEnd = mode === 'editEnd';
    const defaultTs = isReset ? Date.now() : (isEnd ? (periodEnd != null ? periodEnd : Date.now()) : periodStart);
    modalRoot.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <h3>${isReset ? 'Reset period totals?' : (isEnd ? 'Set end date & time' : 'Set starting date & time')}</h3>
        <p>${isReset
          ? "This only restarts the Period Summary count \u2014 nothing in your daily history or entries gets deleted. You'll be able to undo right after."
          : (isEnd
            ? 'Only count entries up to this point. Leave it cleared to keep counting up to now.'
            : 'Move the Period Summary\u2019s starting point without touching your history.')}</p>
        <label>${isEnd ? 'Count up to' : 'Start counting from'}</label>
        <input type="datetime-local" id="periodStartInput" value="${toLocalDatetimeInputValue(defaultTs)}">
        <div class="modal-actions">
          <button class="cancel" id="mCancel">Cancel</button>
          ${isEnd ? '<button class="cancel" id="mClear">Clear (use now)</button>' : ''}
          <button class="confirm${isReset ? ' danger' : ''}" id="mGo">${isReset ? 'Reset' : 'Save'}</button>
        </div>
      </div>`;
    modalRoot.appendChild(overlay);
    document.getElementById('mCancel').addEventListener('click', ()=> modalRoot.innerHTML='');
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) modalRoot.innerHTML=''; });
    const clearBtn = document.getElementById('mClear');
    if(clearBtn){
      clearBtn.addEventListener('click', ()=>{
        const prevEnd = periodEnd;
        periodEnd = null;
        save(KEY_PERIOD_END, periodEnd);
        modalRoot.innerHTML = '';
        renderPeriodPanel();
        showToast('End date cleared \u2014 counting up to now', 'Undo', ()=>{
          periodEnd = prevEnd;
          save(KEY_PERIOD_END, periodEnd);
          renderPeriodPanel();
        });
      });
    }
    document.getElementById('mGo').addEventListener('click', ()=>{
      const raw = document.getElementById('periodStartInput').value;
      if(!raw){ showToast('Pick a date & time first'); return; }
      const newTs = new Date(raw).getTime();
      if(isNaN(newTs)){ showToast('That date/time looks invalid'); return; }
      if(isEnd){
        if(newTs < periodStart){ showToast('End date can\u2019t be before the start date'); return; }
        const prevEnd = periodEnd;
        periodEnd = newTs;
        save(KEY_PERIOD_END, periodEnd);
        modalRoot.innerHTML = '';
        renderPeriodPanel();
        showToast('End date & time updated', 'Undo', ()=>{
          periodEnd = prevEnd;
          save(KEY_PERIOD_END, periodEnd);
          renderPeriodPanel();
        });
        return;
      }
      if(!isReset && periodEnd != null && newTs > periodEnd){ showToast('Start date can\u2019t be after the end date'); return; }
      const prevStart = periodStart;
      const prevEnd = periodEnd;
      periodUndoPrev = prevStart;
      periodStart = newTs;
      if(isReset) periodEnd = null; // resetting starts a fresh, open-ended period
      save(KEY_PERIOD_START, periodStart);
      if(isReset) save(KEY_PERIOD_END, periodEnd);
      modalRoot.innerHTML = '';
      renderPeriodPanel();
      showToast(
        isReset ? ('Period reset \u2014 now counting from ' + formatPeriodDateTime(periodStart)) : 'Start date & time updated',
        'Undo',
        ()=>{
          periodStart = prevStart;
          periodEnd = prevEnd;
          save(KEY_PERIOD_START, periodStart);
          save(KEY_PERIOD_END, periodEnd);
          renderPeriodPanel();
        }
      );
    });
  }

  // ---------- custom variables (named formulas usable anywhere — inside
  // panel cards, or inside other variables) ----------
  let editingVarId = null;

  function openVarsModal(){
    editingVarId = null;
    renderVarsModalBody();
  }

  function renderVarsModalBody(){
    modalRoot.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const editingVar = customVars.find(v=>v.id===editingVarId);
    overlay.innerHTML = `
      <div class="modal-card">
        <h3>Your variables</h3>
        <p>Formulas you can name and reuse anywhere — in panel cards, or in other variables. They can use <code>sum</code>, <code>pass</code>, <code>bonus</code>, <code>net</code>, and any variable defined above them in the list.</p>
        <div class="manager-list" id="varsList"></div>
        <div class="manager-form">
          <input type="text" id="varNameInput" placeholder="Name, e.g. total" maxlength="40" value="${editingVar?escapeHtml(editingVar.name):''}">
          <textarea id="varFormulaInput" placeholder="Formula, e.g. sum + pass">${editingVar?escapeHtml(editingVar.formula):''}</textarea>
          <div class="token-chip-row" id="varTokenChipRow"></div>
          <div class="manager-formula-preview" id="varFormulaPreview">&nbsp;</div>
          <button class="confirm" id="varSaveBtn">${editingVar?'Save changes':'Add variable'}</button>
        </div>
        <div class="modal-actions">
          <button class="cancel" id="mClose">Close</button>
        </div>
      </div>`;
    modalRoot.appendChild(overlay);
    document.getElementById('mClose').addEventListener('click', ()=> modalRoot.innerHTML='');
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) modalRoot.innerHTML=''; });
    renderVarsList();
    renderVarTokenChips();
    const formulaInput = document.getElementById('varFormulaInput');
    lastFocusedFormulaInput = formulaInput;
    formulaInput.addEventListener('focus', ()=> lastFocusedFormulaInput = formulaInput);
    formulaInput.addEventListener('input', validateVarFormulaLive);
    document.getElementById('varSaveBtn').addEventListener('click', saveVarFromForm);
    validateVarFormulaLive();
  }

  function renderVarTokenChips(){
    const row = document.getElementById('varTokenChipRow');
    if(!row) return;
    // a variable being added goes to the end of the list, so it may use every
    // existing variable plus the reserved totals; a variable being edited may
    // only use names that come before its current position (to avoid cycles)
    let usable;
    if(editingVarId){
      const idx = customVars.findIndex(v=>v.id===editingVarId);
      usable = RESERVED_NAMES.concat(customVars.slice(0, idx).map(v=>v.name));
    } else {
      usable = RESERVED_NAMES.concat(customVars.map(v=>v.name));
    }
    row.innerHTML = usable.map(t=>`<button type="button" class="token-chip" data-token="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('');
    row.querySelectorAll('.token-chip').forEach(chip=>{
      chip.addEventListener('click', ()=> insertTokenIntoFocused(chip.dataset.token));
    });
  }

  function renderVarsList(){
    const list = document.getElementById('varsList');
    if(!list) return;
    if(!customVars.length){
      list.innerHTML = '<div class="manager-hint">No variables yet — add one below.</div>';
      return;
    }
    list.innerHTML = '';
    customVars.forEach((v,idx)=>{
      const row = document.createElement('div');
      row.className = 'manager-row';
      row.innerHTML = `
        <div class="reorder-col">
          <button class="reorder-btn" data-act="up" ${idx===0?'disabled':''} title="Move up">${ICON_UP}</button>
          <button class="reorder-btn" data-act="down" ${idx===customVars.length-1?'disabled':''} title="Move down">${ICON_DOWN}</button>
        </div>
        <div class="manager-row-main">
          <div class="manager-row-title">${escapeHtml(v.name)}</div>
          <div class="manager-row-sub">= ${escapeHtml(v.formula)}</div>
        </div>
        <div class="manager-row-actions">
          <button class="manager-icon-btn" data-act="edit" title="Edit">${ICON_EDIT}</button>
          <button class="manager-icon-btn danger" data-act="del" title="Delete">${ICON_DELETE}</button>
        </div>`;
      row.querySelector('[data-act="edit"]').addEventListener('click', ()=>{
        editingVarId = v.id;
        renderVarsModalBody();
      });
      row.querySelector('[data-act="del"]').addEventListener('click', ()=>{
        customVars = customVars.filter(x=>x.id!==v.id);
        save(KEY_CUSTOM_VARS, customVars);
        renderVarsModalBody();
        renderPeriodPanel();
        showToast('Variable deleted');
      });
      row.querySelector('[data-act="up"]').addEventListener('click', ()=> moveVar(v.id, -1));
      row.querySelector('[data-act="down"]').addEventListener('click', ()=> moveVar(v.id, 1));
      list.appendChild(row);
    });
  }

  function moveVar(id, dir){
    const idx = customVars.findIndex(v=>v.id===id);
    const swapIdx = idx+dir;
    if(idx<0 || swapIdx<0 || swapIdx>=customVars.length) return;
    const tmp = customVars[idx]; customVars[idx]=customVars[swapIdx]; customVars[swapIdx]=tmp;
    save(KEY_CUSTOM_VARS, customVars);
    renderVarsModalBody();
    renderPeriodPanel();
  }

  // scope visible to a variable sitting at array position `idx` (only
  // reserved names + variables strictly before it — keeps evaluation order
  // well-defined and prevents cycles)
  function scopeForVarPosition(idx){
    const t = computePeriodTotalsSafe();
    const scope = { sum:t.sum, pass:t.pass, bonus:t.bonus, net:t.net };
    customVars.slice(0, idx).forEach(v=>{
      try{ scope[v.name] = evaluateFormula(v.formula, scope); }catch(e){ scope[v.name] = 0; }
    });
    return scope;
  }

  function validateVarFormulaLive(){
    const preview = document.getElementById('varFormulaPreview');
    const saveBtn = document.getElementById('varSaveBtn');
    const formulaInput = document.getElementById('varFormulaInput');
    if(!preview || !saveBtn || !formulaInput) return;
    const formula = formulaInput.value.trim();
    if(!formula){ preview.innerHTML = '&nbsp;'; preview.className = 'manager-formula-preview'; saveBtn.disabled = true; return; }
    const idx = editingVarId ? customVars.findIndex(v=>v.id===editingVarId) : customVars.length;
    try{
      const v = evaluateFormula(formula, scopeForVarPosition(idx));
      preview.textContent = '= ' + round2(v) + ' (right now)';
      preview.className = 'manager-formula-preview ok';
      saveBtn.disabled = false;
    }catch(err){
      preview.textContent = err.message;
      preview.className = 'manager-formula-preview err';
      saveBtn.disabled = true;
    }
  }

  function saveVarFromForm(){
    const nameInput = document.getElementById('varNameInput');
    const formulaInput = document.getElementById('varFormulaInput');
    const name = nameInput.value.trim();
    const formula = formulaInput.value.trim();
    if(!name){ showToast('Give the variable a name'); return; }
    if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)){ showToast('Use letters/numbers/underscore, starting with a letter'); return; }
    if(!formula){ showToast('Give it a formula'); return; }
    if(RESERVED_NAMES.includes(name.toLowerCase())){ showToast('"'+name+'" is reserved — try another name'); return; }
    const dup = customVars.find(v=> v.name.toLowerCase()===name.toLowerCase() && v.id!==editingVarId);
    if(dup){ showToast('That name is already used'); return; }
    const idx = editingVarId ? customVars.findIndex(v=>v.id===editingVarId) : customVars.length;
    try{ evaluateFormula(formula, scopeForVarPosition(idx)); }
    catch(err){ showToast('Fix the formula first: ' + err.message); return; }
    if(editingVarId){
      const v = customVars.find(x=>x.id===editingVarId);
      if(v){ v.name = name; v.formula = formula; }
      editingVarId = null;
    } else {
      customVars.push({ id: 'v'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), name, formula });
    }
    save(KEY_CUSTOM_VARS, customVars);
    renderVarsModalBody();
    renderPeriodPanel();
    showToast('Variable saved');
  }

  document.getElementById('manageVarsBtn').addEventListener('click', openVarsModal);

  // ---------- custom summary panels (Period Summary is the built-in first
  // one; others are yours) — each panel is a collapsible section below the
  // calculator holding a row of formula-driven stat cards ----------
  let managePanelsFocusId = null; // null = top-level panel list, '__new__' = creating one, or a panel id = editing its cards
  let editingItemId = null;

  function openPanelsModal(focusId){
    managePanelsFocusId = (focusId === '__new__') ? '__new__' : (customPanels.some(p=>p.id===focusId) ? focusId : null);
    editingItemId = null;
    renderPanelsModalBody();
  }

  function renderPanelsModalBody(){
    modalRoot.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    if(managePanelsFocusId === '__new__'){
      overlay.innerHTML = `
        <div class="modal-card">
          <h3>New panel</h3>
          <p>Give it a name — you'll add stat cards to it next.</p>
          <div class="manager-form">
            <input type="text" id="newPanelTitle" placeholder="Title, e.g. Take-home" maxlength="40">
            <button class="confirm" id="newPanelCreateBtn">Create</button>
          </div>
          <div class="modal-actions">
            <button class="cancel" id="mClose">Cancel</button>
          </div>
        </div>`;
      modalRoot.appendChild(overlay);
      document.getElementById('mClose').addEventListener('click', ()=> modalRoot.innerHTML='');
      overlay.addEventListener('click', (e)=>{ if(e.target===overlay) modalRoot.innerHTML=''; });
      document.getElementById('newPanelCreateBtn').addEventListener('click', ()=>{
        const title = document.getElementById('newPanelTitle').value.trim();
        if(!title){ showToast('Give the panel a title'); return; }
        const p = { id:'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), title, isPeriod:false, open:true, items:[] };
        customPanels.push(p);
        save(KEY_CUSTOM_PANELS, customPanels);
        renderPeriodPanel();
        managePanelsFocusId = p.id;
        renderPanelsModalBody();
      });
      return;
    }

    const focusPanel = customPanels.find(p=>p.id===managePanelsFocusId);
    if(!focusPanel){
      const rows = customPanels.map(p=>`
        <div class="manager-row" data-id="${p.id}">
          <div class="manager-row-main">
            <div class="manager-row-title">${escapeHtml(p.title||'Panel')}${p.isPeriod?'<span class="built-in-badge">Built-in</span>':''}</div>
            <div class="manager-row-sub">${(p.items||[]).length} card${(p.items||[]).length===1?'':'s'}</div>
          </div>
          <div class="manager-row-actions">
            <button class="manager-icon-btn" data-act="edit" title="Edit">${ICON_EDIT}</button>
            ${p.isPeriod ? '' : `<button class="manager-icon-btn danger" data-act="del" title="Delete">${ICON_DELETE}</button>`}
          </div>
        </div>`).join('');
      overlay.innerHTML = `
        <div class="modal-card">
          <h3>Panels</h3>
          <p>Shown as collapsible sections below the calculator. Tap Edit to rename a panel or add/change its stat cards.</p>
          <div class="manager-list" id="panelsList">${customPanels.length ? rows : '<div class="manager-hint">No panels yet.</div>'}</div>
          <button class="confirm" id="addPanelFromModalBtn">+ Add panel</button>
          <div class="modal-actions">
            <button class="cancel" id="mClose">Close</button>
          </div>
        </div>`;
      modalRoot.appendChild(overlay);
      document.getElementById('mClose').addEventListener('click', ()=> modalRoot.innerHTML='');
      overlay.addEventListener('click', (e)=>{ if(e.target===overlay) modalRoot.innerHTML=''; });
      document.getElementById('addPanelFromModalBtn').addEventListener('click', ()=>{ managePanelsFocusId = '__new__'; renderPanelsModalBody(); });
      overlay.querySelectorAll('.manager-row').forEach(row=>{
        const id = row.dataset.id;
        const editBtn = row.querySelector('[data-act="edit"]');
        if(editBtn) editBtn.addEventListener('click', ()=>{ managePanelsFocusId = id; editingItemId = null; renderPanelsModalBody(); });
        const delBtn = row.querySelector('[data-act="del"]');
        if(delBtn) delBtn.addEventListener('click', ()=>{
          customPanels = customPanels.filter(x=>x.id!==id);
          save(KEY_CUSTOM_PANELS, customPanels);
          renderPeriodPanel();
          renderPanelsModalBody();
          showToast('Panel deleted');
        });
      });
      return;
    }

    // ---- editing focusPanel's title + cards ----
    const availableTokens = RESERVED_NAMES.concat(customVars.map(v=>v.name));
    const items = focusPanel.items || [];
    const itemRows = items.map((it,idx)=>`
      <div class="manager-row" data-id="${it.id}">
        <div class="reorder-col">
          <button class="reorder-btn" data-act="up" ${idx===0?'disabled':''} title="Move up">${ICON_UP}</button>
          <button class="reorder-btn" data-act="down" ${idx===items.length-1?'disabled':''} title="Move down">${ICON_DOWN}</button>
        </div>
        <div class="manager-row-main">
          <div class="manager-row-title">${escapeHtml(it.label||'')}</div>
          <div class="manager-row-sub">${escapeHtml(it.formula)}</div>
        </div>
        <div class="manager-row-actions">
          <button class="manager-icon-btn" data-act="edit" title="Edit">${ICON_EDIT}</button>
          <button class="manager-icon-btn danger" data-act="del" title="Delete">${ICON_DELETE}</button>
        </div>
      </div>`).join('');
    const editingItem = items.find(x=>x.id===editingItemId);
    overlay.innerHTML = `
      <div class="modal-card">
        <button class="cancel" id="mBack" style="margin-bottom:10px;">‹ Back to panels</button>
        <h3>${escapeHtml(focusPanel.title||'Panel')}${focusPanel.isPeriod?'<span class="built-in-badge">Built-in</span>':''}</h3>
        ${focusPanel.isPeriod ? '<p>Since/until and reset stay controlled from the panel itself, below the calculator. Here you can relabel or re-formula its cards, and add more.</p>' : "<p>Add stat cards with your own formulas. Tap a token below to insert it wherever you're typing.</p>"}
        <label>Panel title</label>
        <input type="text" id="panelTitleInput" maxlength="40" value="${escapeHtml(focusPanel.title||'')}">
        <div class="manager-list" id="itemsList" style="margin-top:10px;">${items.length ? itemRows : '<div class="manager-hint">No cards yet — add one below.</div>'}</div>
        <div class="manager-form">
          <input type="text" id="itemLabelInput" placeholder="Card label, e.g. Take-home" maxlength="30" value="${editingItem?escapeHtml(editingItem.label):''}">
          <textarea id="itemFormulaInput" placeholder="Formula, e.g. sum - pass - sum*rate">${editingItem?escapeHtml(editingItem.formula):''}</textarea>
          <div class="token-chip-row" id="tokenChipRow">${availableTokens.map(t=>`<button type="button" class="token-chip" data-token="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}</div>
          <div class="manager-formula-preview" id="itemFormulaPreview">&nbsp;</div>
          <button class="confirm" id="itemSaveBtn">${editingItem?'Save changes':'Add card'}</button>
        </div>
        <div class="modal-actions">
          <button class="cancel" id="mClose">Close</button>
          ${focusPanel.isPeriod ? '' : `<button class="confirm danger" id="mDeletePanel">Delete panel</button>`}
        </div>
      </div>`;
    modalRoot.appendChild(overlay);
    document.getElementById('mClose').addEventListener('click', ()=> modalRoot.innerHTML='');
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) modalRoot.innerHTML=''; });
    document.getElementById('mBack').addEventListener('click', ()=>{ managePanelsFocusId=null; editingItemId=null; renderPanelsModalBody(); });
    const delPanelBtn = document.getElementById('mDeletePanel');
    if(delPanelBtn){
      delPanelBtn.addEventListener('click', ()=>{
        customPanels = customPanels.filter(x=>x.id!==focusPanel.id);
        save(KEY_CUSTOM_PANELS, customPanels);
        renderPeriodPanel();
        managePanelsFocusId = null;
        renderPanelsModalBody();
        showToast('Panel deleted');
      });
    }
    document.getElementById('panelTitleInput').addEventListener('change', (e)=>{
      focusPanel.title = e.target.value.trim() || focusPanel.title;
      save(KEY_CUSTOM_PANELS, customPanels);
      renderPeriodPanel();
    });
    const formulaInput = document.getElementById('itemFormulaInput');
    lastFocusedFormulaInput = formulaInput;
    formulaInput.addEventListener('focus', ()=> lastFocusedFormulaInput = formulaInput);
    formulaInput.addEventListener('input', validateItemFormulaLive);
    overlay.querySelectorAll('.token-chip').forEach(chip=>{
      chip.addEventListener('click', ()=> insertTokenIntoFocused(chip.dataset.token));
    });
    document.getElementById('itemSaveBtn').addEventListener('click', ()=> saveItemFromForm(focusPanel));
    validateItemFormulaLive();

    overlay.querySelectorAll('#itemsList .manager-row').forEach(row=>{
      const id = row.dataset.id;
      row.querySelector('[data-act="edit"]').addEventListener('click', ()=>{ editingItemId = id; renderPanelsModalBody(); });
      row.querySelector('[data-act="del"]').addEventListener('click', ()=>{
        focusPanel.items = focusPanel.items.filter(x=>x.id!==id);
        save(KEY_CUSTOM_PANELS, customPanels);
        renderPeriodPanel();
        renderPanelsModalBody();
      });
      const upBtn = row.querySelector('[data-act="up"]');
      const downBtn = row.querySelector('[data-act="down"]');
      if(upBtn) upBtn.addEventListener('click', ()=> moveItem(focusPanel, id, -1));
      if(downBtn) downBtn.addEventListener('click', ()=> moveItem(focusPanel, id, 1));
    });
  }

  function moveItem(panel, id, dir){
    const idx = panel.items.findIndex(x=>x.id===id);
    const swapIdx = idx+dir;
    if(idx<0 || swapIdx<0 || swapIdx>=panel.items.length) return;
    const tmp = panel.items[idx]; panel.items[idx]=panel.items[swapIdx]; panel.items[swapIdx]=tmp;
    save(KEY_CUSTOM_PANELS, customPanels);
    renderPeriodPanel();
    renderPanelsModalBody();
  }

  function validateItemFormulaLive(){
    const preview = document.getElementById('itemFormulaPreview');
    const saveBtn = document.getElementById('itemSaveBtn');
    const formulaInput = document.getElementById('itemFormulaInput');
    if(!preview || !saveBtn || !formulaInput) return;
    const formula = formulaInput.value.trim();
    if(!formula){ preview.innerHTML = '&nbsp;'; preview.className = 'manager-formula-preview'; saveBtn.disabled = true; return; }
    try{
      const v = evaluateFormula(formula, buildFormulaScope());
      preview.textContent = '= ' + round2(v) + ' (right now)';
      preview.className = 'manager-formula-preview ok';
      saveBtn.disabled = false;
    }catch(err){
      preview.textContent = err.message;
      preview.className = 'manager-formula-preview err';
      saveBtn.disabled = true;
    }
  }

  function saveItemFromForm(panel){
    const labelInput = document.getElementById('itemLabelInput');
    const formulaInput = document.getElementById('itemFormulaInput');
    const label = labelInput.value.trim();
    const formula = formulaInput.value.trim();
    if(!label){ showToast('Give the card a label'); return; }
    try{ evaluateFormula(formula, buildFormulaScope()); }
    catch(err){ showToast('Fix the formula first: ' + err.message); return; }
    if(editingItemId){
      const it = panel.items.find(x=>x.id===editingItemId);
      if(it){ it.label = label; it.formula = formula; }
      editingItemId = null;
    } else {
      panel.items = panel.items || [];
      panel.items.push({ id:'i'+Date.now().toString(36)+Math.random().toString(36).slice(2,5), label, formula });
    }
    save(KEY_CUSTOM_PANELS, customPanels);
    renderPeriodPanel();
    renderPanelsModalBody();
    showToast('Card saved');
  }

  document.getElementById('managePanelsBtn').addEventListener('click', ()=> openPanelsModal(null));

  editFriendsBtn.addEventListener('click', ()=>{
    friendEditMode = !friendEditMode;
    editFriendsBtn.classList.toggle('on', friendEditMode);
    document.getElementById('editFriendsLabel').textContent = friendEditMode ? 'Done' : 'Manage';
    renderFriends();
  });

  // ---------- button grid (freeform, draggable, resizable) ----------
  function cellSize(){
    return Math.max(1, btnGrid.clientWidth / COLS);
  }
  function maxRow(){
    return layout.reduce((m,b)=> Math.max(m, b.y+b.h), 0);
  }
  function layoutBtn(el, b, cs){
    el.style.left = (b.x*cs) + 'px';
    el.style.top = (b.y*cs) + 'px';
    el.style.width = (b.w*cs) + 'px';
    el.style.height = (b.h*cs) + 'px';
  }

  function renderGrid(){
    btnGrid.innerHTML = '';
    const cs = cellSize();
    let rows = maxRow();
    layout.forEach(b=>{
      const el = document.createElement('button');
      el.className = 'btn-tile' + (b.action==='logSum'||b.action==='logPass' ? ' accent' : '') + (b.action==='op'?' op':'') + (editMode?' editing':'');
      el.textContent = b.label;
      layoutBtn(el, b, cs);
      if(editMode){
        const del = document.createElement('div');
        del.className = 'tile-delete';
        del.textContent = '×';
        del.addEventListener('pointerdown', ev=> ev.stopPropagation());
        del.addEventListener('click', ev=>{
          ev.stopPropagation();
          layout = layout.filter(x=>x.id!==b.id);
          save(KEY_LAYOUT, layout);
          renderGrid();
        });
        el.appendChild(del);

        const rs = document.createElement('div');
        rs.className = 'tile-resize';
        rs.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="17" cy="17" r="1.6"/><circle cx="17" cy="11" r="1.6"/><circle cx="11" cy="17" r="1.6"/></svg>';
        el.appendChild(rs);
        attachResize(rs, el, b);
        attachMove(el, b, del, rs);
      } else {
        el.addEventListener('click', ()=> handleTileClick(b));
      }
      btnGrid.appendChild(el);
    });

    if(editMode){
      const addEl = document.createElement('button');
      addEl.className = 'btn-tile add-tile';
      addEl.textContent = '+';
      layoutBtn(addEl, {x:0,y:rows,w:1,h:1}, cs);
      addEl.addEventListener('click', openAddButtonModal);
      btnGrid.appendChild(addEl);
      rows += 1;
    }
    btnGrid.style.height = (rows*cs) + 'px';
    updateRestoreVisibility();
  }

  function missingCoreButtons(){
    const presentIds = new Set(layout.map(b=>b.id));
    return defaultLayout.filter(b=> CORE_IDS.includes(b.id) && !presentIds.has(b.id));
  }
  function updateRestoreVisibility(){
    const missing = missingCoreButtons();
    restoreBtn.style.display = missing.length ? 'flex' : 'none';
  }
  function restoreMissingButtons(){
    const missing = missingCoreButtons();
    if(!missing.length){ showToast('Nothing missing — all core buttons present'); return; }
    let row = maxRow();
    missing.forEach(b=>{
      layout.push(Object.assign({}, b, {y:row}));
      row += b.h;
    });
    save(KEY_LAYOUT, layout);
    renderGrid();
    showToast('Restored '+missing.length+' button'+(missing.length===1?'':'s'));
  }
  restoreBtn.addEventListener('click', restoreMissingButtons);

  function handleTileClick(b){
    if(b.action==='digit' || b.action==='op'){ insertAtCursor(b.value); return; }
    if(b.action==='dot'){ insertAtCursor('.'); return; }
    if(b.action==='backspace'){
      const start = calcDisplay.selectionStart, end = calcDisplay.selectionEnd;
      if(start===end && start>0) calcDisplay.setRangeText('', start-1, start, 'end');
      else calcDisplay.setRangeText('', start, end, 'end');
      calcDisplay.focus(); updatePreview();
      return;
    }
    if(b.action==='clear'){ calcDisplay.value=''; updatePreview(); calcDisplay.focus(); return; }
    if(b.action==='custom'){ insertAtCursor(b.value); return; }
    if(b.action==='logSum') return logEntry('sum');
    if(b.action==='logPass') return logEntry('pass');
  }

  function attachMove(el, b, del, rs){
    let dragging=false, startPX=0, startPY=0, startX=0, startY=0;
    el.addEventListener('pointerdown', (e)=>{
      if(e.target===del || e.target===rs || rs.contains(e.target)) return;
      dragging = true;
      startPX = e.clientX; startPY = e.clientY;
      startX = b.x; startY = b.y;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e)=>{
      if(!dragging) return;
      const cs = cellSize();
      const dx = (e.clientX-startPX)/cs;
      const dy = (e.clientY-startPY)/cs;
      b.x = Math.max(-(b.w-0.2), Math.min(COLS-0.2, startX+dx));
      b.y = Math.max(-(b.h-0.2), startY+dy);
      layoutBtn(el, b, cs);
    });
    function end(){
      if(!dragging) return;
      dragging = false;
      save(KEY_LAYOUT, layout);
      renderGrid();
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  function attachResize(rs, el, b){
    let resizing=false, startPX=0, startPY=0, startW=0, startH=0;
    rs.addEventListener('pointerdown', (e)=>{
      resizing = true;
      startPX = e.clientX; startPY = e.clientY;
      startW = b.w; startH = b.h;
      rs.setPointerCapture(e.pointerId);
      e.stopPropagation();
    });
    rs.addEventListener('pointermove', (e)=>{
      if(!resizing) return;
      const cs = cellSize();
      const dw = (e.clientX-startPX)/cs;
      const dh = (e.clientY-startPY)/cs;
      b.w = Math.max(0.15, Math.min(COLS-b.x, startW+dw));
      b.h = Math.max(0.15, startH+dh);
      layoutBtn(el, b, cs);
      e.stopPropagation();
    });
    function end(e){
      if(!resizing) return;
      resizing = false;
      save(KEY_LAYOUT, layout);
      renderGrid();
      if(e) e.stopPropagation();
    }
    rs.addEventListener('pointerup', end);
    rs.addEventListener('pointercancel', end);
  }

  function openAddButtonModal(){
    modalRoot.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <h3>Add a button</h3>
        <label>Label (what it shows)</label>
        <input id="mLabel" maxlength="10" placeholder="e.g. 100">
        <label>Inserts into the display</label>
        <input id="mValue" maxlength="20" placeholder="e.g. 100">
        <div class="modal-actions">
          <button class="cancel" id="mCancel">Cancel</button>
          <button class="confirm" id="mAdd">Add</button>
        </div>
      </div>`;
    modalRoot.appendChild(overlay);
    document.getElementById('mCancel').addEventListener('click', ()=> modalRoot.innerHTML='');
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) modalRoot.innerHTML=''; });
    document.getElementById('mAdd').addEventListener('click', ()=>{
      const label = document.getElementById('mLabel').value.trim();
      const value = document.getElementById('mValue').value.trim();
      if(!label || !value) return;
      layout.push({id:'c'+Date.now(), x:0, y:maxRow(), w:1, h:1, action:'custom', value, label});
      save(KEY_LAYOUT, layout);
      modalRoot.innerHTML = '';
      renderGrid();
    });
  }

  editLayoutBtn.addEventListener('click', ()=>{
    editMode = !editMode;
    editLayoutBtn.classList.toggle('on', editMode);
    renderGrid();
  });
  window.addEventListener('resize', renderGrid);
  document.addEventListener('toolbox:tabshown', (e)=>{
    if(e.detail && e.detail.tool==='calclog'){ renderGrid(); renderHeaderGrid(); }
  });

  // Panels used to live as draggable/resizable tiles inside the header grid
  // (ids prefixed "cp_"). They've moved to their own collapsible section
  // below the calculator, so on upgrade we just drop any leftover header
  // tiles for them — safe to call any time, does nothing once cleaned up.
  function stripLegacyPanelWidgets(){
    const before = headerLayout.length;
    headerLayout = headerLayout.filter(w => w.id.indexOf('cp_')!==0);
    if(headerLayout.length !== before) save(KEY_HEADER_LAYOUT, headerLayout);
  }
  stripLegacyPanelWidgets();

  // ---------- header widget grid (freeform, draggable, resizable) ----------
  function headerColWidth(){
    return Math.max(1, headerGrid.clientWidth / HEADER_COLS);
  }
  function headerMaxRow(){
    return headerLayout.reduce((m,w)=> Math.max(m, w.y+w.h), 0);
  }
  function layoutHeaderTile(el, w, cw){
    el.style.left = (w.x*cw) + 'px';
    el.style.top = (w.y*HEADER_ROW) + 'px';
    el.style.width = (w.w*cw) + 'px';
    el.style.height = (w.h*HEADER_ROW) + 'px';
  }

  function renderHeaderGrid(){
    headerGrid.innerHTML = '';
    const cw = headerColWidth();
    headerLayout.forEach(w=>{
      const el = document.createElement('div');
      el.className = 'header-tile' + (headerEditMode ? ' editing' : '');
      const body = widgetBodies[w.id];
      if(body) el.appendChild(body); // re-parents the persistent node, listeners stay intact
      if(headerEditMode){
        const rs = document.createElement('div');
        rs.className = 'tile-resize';
        rs.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="17" cy="17" r="1.6"/><circle cx="17" cy="11" r="1.6"/><circle cx="11" cy="17" r="1.6"/></svg>';
        el.appendChild(rs);
        attachHeaderResize(rs, el, w);
        attachHeaderMove(el, w);
      }
      layoutHeaderTile(el, w, cw);
      headerGrid.appendChild(el);
    });
    headerGrid.style.height = (headerMaxRow()*HEADER_ROW) + 'px';
  }

  function attachHeaderMove(el, w){
    let dragging=false, startPX=0, startPY=0, startX=0, startY=0;
    el.addEventListener('pointerdown', (e)=>{
      if(e.target.closest('.tile-resize')) return;
      dragging = true;
      startPX = e.clientX; startPY = e.clientY;
      startX = w.x; startY = w.y;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e)=>{
      if(!dragging) return;
      const cw = headerColWidth();
      const dx = (e.clientX-startPX)/cw;
      const dy = (e.clientY-startPY)/HEADER_ROW;
      w.x = Math.max(-(w.w-0.2), Math.min(HEADER_COLS-0.2, startX+dx));
      w.y = Math.max(-(w.h-0.2), startY+dy);
      layoutHeaderTile(el, w, cw);
    });
    function end(){
      if(!dragging) return;
      dragging = false;
      save(KEY_HEADER_LAYOUT, headerLayout);
      renderHeaderGrid();
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  function attachHeaderResize(rs, el, w){
    let resizing=false, startPX=0, startPY=0, startW=0, startH=0;
    rs.addEventListener('pointerdown', (e)=>{
      resizing = true;
      startPX = e.clientX; startPY = e.clientY;
      startW = w.w; startH = w.h;
      rs.setPointerCapture(e.pointerId);
      e.stopPropagation();
    });
    rs.addEventListener('pointermove', (e)=>{
      if(!resizing) return;
      const cw = headerColWidth();
      const dw = (e.clientX-startPX)/cw;
      const dh = (e.clientY-startPY)/HEADER_ROW;
      w.w = Math.max(0.6, Math.min(HEADER_COLS-w.x, startW+dw));
      w.h = Math.max(0.6, startH+dh);
      layoutHeaderTile(el, w, cw);
      e.stopPropagation();
    });
    function end(e){
      if(!resizing) return;
      resizing = false;
      save(KEY_HEADER_LAYOUT, headerLayout);
      renderHeaderGrid();
      if(e) e.stopPropagation();
    }
    rs.addEventListener('pointerup', end);
    rs.addEventListener('pointercancel', end);
  }

  rearrangeHeaderBtn.addEventListener('click', ()=>{
    headerEditMode = !headerEditMode;
    rearrangeHeaderBtn.classList.toggle('on', headerEditMode);
    rearrangeHeaderLabel.textContent = headerEditMode ? 'Done' : 'Rearrange';
    resetHeaderBtn.style.display = headerEditMode ? 'inline-flex' : 'none';
    renderHeaderGrid();
  });
  resetHeaderBtn.addEventListener('click', ()=>{
    const def = defaultHeaderLayout();
    headerLayout.forEach(w=>{
      const d = def.find(x=>x.id===w.id);
      if(d){ w.x=d.x; w.y=d.y; w.w=d.w; w.h=d.h; }
    });
    save(KEY_HEADER_LAYOUT, headerLayout);
    renderHeaderGrid();
    showToast('Controls reset to default layout');
  });
  // Only rebuild the header layout when the viewport WIDTH actually changes
  // (real resize / rotation). On mobile, opening the on-screen keyboard fires
  // a resize event too because it shrinks the viewport HEIGHT — rebuilding
  // the header grid on that would re-parent the friend-name input and yank
  // focus away, closing the keyboard the instant it opened.
  let __lastHeaderWidth = window.innerWidth;
  window.addEventListener('resize', ()=>{
    if(window.innerWidth === __lastHeaderWidth) return;
    __lastHeaderWidth = window.innerWidth;
    renderHeaderGrid();
  });

  // ---------- logging + history ----------
  function dateKeyOf(ts){
    const d = new Date(ts);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function dayLabel(key){
    const today = dateKeyOf(Date.now());
    const yest = dateKeyOf(Date.now()-86400000);
    if(key===today) return 'Today';
    if(key===yest) return 'Yesterday';
    const [y,m,d] = key.split('-').map(Number);
    return new Date(y,m-1,d).toLocaleDateString(undefined,{month:'short', day:'numeric', year:'numeric'});
  }

  // ---- entry date picker (defaults to today, but lets you log for a past day) ----
  let logDate = dateKeyOf(Date.now()); // yyyy-mm-dd of the date new entries get logged against
  const logDateInput = document.getElementById('logDateInput');
  const resetDateBtn = document.getElementById('resetDateBtn');

  function composeTsForDate(dateKey){
    // New entries should always land at the top (newest) of their day's list, the same
    // way today's entries do — so give backdated entries a ts strictly after every
    // existing entry already logged for that date, instead of just reusing the
    // current wall-clock time (which could sort BEFORE entries logged earlier today
    // for that same past date, e.g. entries made at 19:20 vs. one added now at 10:00).
    const [y,m,d] = dateKey.split('-').map(Number);
    const dayStart = new Date(y, m-1, d, 0,0,0,0).getTime();
    const now = new Date();
    const nowOnDate = new Date(y, m-1, d, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()).getTime();
    const existingForDay = entries.filter(e=>e.dateKey===dateKey).map(e=>e.ts);
    const latest = existingForDay.length ? Math.max(...existingForDay) : dayStart;
    return Math.max(nowOnDate, latest+1);
  }
  function refreshDateInputUI(){
    logDateInput.value = logDate;
    const isToday = logDate === dateKeyOf(Date.now());
    logDateInput.classList.toggle('backdated', !isToday);
    resetDateBtn.style.display = isToday ? 'none' : 'inline-flex';
  }
  logDateInput.addEventListener('change', ()=>{
    if(!logDateInput.value){ logDateInput.value = logDate; return; }
    logDate = logDateInput.value;
    refreshDateInputUI();
  });
  resetDateBtn.addEventListener('click', ()=>{
    logDate = dateKeyOf(Date.now());
    refreshDateInputUI();
  });
  refreshDateInputUI();

  function logEntry(kind){
    const raw = calcDisplay.value.trim();
    if(!raw){ showToast('Type a number or expression first'); return; }
    if(!activeFriend){ showToast('Pick or add a friend first'); return; }
    let value;
    try{ value = evaluate(raw); }
    catch(e){ showToast("That doesn't evaluate to a number"); return; }
    const dateKey = logDate;
    const ts = composeTsForDate(dateKey);
    entries.push({ id:'e'+Date.now()+Math.random().toString(36).slice(2,7), ts, dateKey, friend:activeFriend, kind, raw, value });
    save(KEY_ENTRIES, entries);
    calcDisplay.value = '';
    updatePreview();
    renderHistory();
    const dateNote = dateKey===dateKeyOf(Date.now()) ? '' : (' for '+dayLabel(dateKey));
    showToast((kind==='sum'?'Logged sum for ':'Logged pass for ')+activeFriend+dateNote);
  }

  function confirmDeleteEntry(id){
    modalRoot.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <h3>Delete this entry?</h3>
        <p>You'll get a chance to undo right after.</p>
        <div class="modal-actions">
          <button class="cancel" id="mCancel">Cancel</button>
          <button class="confirm danger" id="mDel">Delete</button>
        </div>
      </div>`;
    modalRoot.appendChild(overlay);
    document.getElementById('mCancel').addEventListener('click', ()=> modalRoot.innerHTML='');
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) modalRoot.innerHTML=''; });
    document.getElementById('mDel').addEventListener('click', ()=>{
      modalRoot.innerHTML = '';
      deleteEntry(id);
    });
  }

  function deleteEntry(id){
    const idx = entries.findIndex(e=>e.id===id);
    if(idx<0) return;
    const [removed] = entries.splice(idx, 1);
    save(KEY_ENTRIES, entries);
    renderHistory();
    showToast('Entry deleted', 'Undo', ()=>{
      entries.splice(idx, 0, removed);
      save(KEY_ENTRIES, entries);
      renderHistory();
    });
  }

  function openEditEntryModal(id){
    const entry = entries.find(e=>e.id===id);
    if(!entry) return;
    modalRoot.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const friendOptions = Array.from(new Set([entry.friend, ...friends]))
      .map(n=> `<option value="${escapeHtml(n)}"${n===entry.friend?' selected':''}>${escapeHtml(n)}</option>`).join('');
    overlay.innerHTML = `
      <div class="modal-card">
        <h3>Edit entry</h3>
        <label>Friend</label>
        <select id="eFriend">${friendOptions}</select>
        <label>Type</label>
        <select id="eKind">
          <option value="sum"${entry.kind==='sum'?' selected':''}>Sum</option>
          <option value="pass"${entry.kind==='pass'?' selected':''}>Pass</option>
        </select>
        <label>Value / expression</label>
        <input id="eRaw" value="${escapeHtml(entry.raw)}">
        <label>Date</label>
        <input type="date" id="eDate" value="${entry.dateKey}">
        <div class="modal-actions">
          <button class="cancel" id="mCancel">Cancel</button>
          <button class="confirm" id="mSave">Save</button>
        </div>
      </div>`;
    modalRoot.appendChild(overlay);
    document.getElementById('mCancel').addEventListener('click', ()=> modalRoot.innerHTML='');
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) modalRoot.innerHTML=''; });
    document.getElementById('mSave').addEventListener('click', ()=>{
      const raw = document.getElementById('eRaw').value.trim();
      let value;
      try{ value = evaluate(raw); }
      catch(e){ showToast("That doesn't evaluate to a number"); return; }
      const newDateKey = document.getElementById('eDate').value || entry.dateKey;
      entry.raw = raw;
      entry.value = value;
      entry.kind = document.getElementById('eKind').value;
      entry.friend = document.getElementById('eFriend').value;
      if(newDateKey !== entry.dateKey){
        entry.dateKey = newDateKey;
        entry.ts = composeTsForDate(newDateKey);
      }
      save(KEY_ENTRIES, entries);
      modalRoot.innerHTML = '';
      renderHistory();
      showToast('Entry updated');
    });
  }

  function populateHistoryFilter(){
    const names = Array.from(new Set([...friends, ...entries.map(e=>e.friend)])).sort((a,b)=>a.localeCompare(b));
    const prev = historyFilterEl.value || historyFilter;
    historyFilterEl.innerHTML = '<option value="all">All friends</option>' +
      names.map(n=>`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    historyFilterEl.value = names.includes(prev) || prev==='all' ? prev : 'all';
    historyFilter = historyFilterEl.value;
  }
  historyFilterEl.addEventListener('change', ()=>{
    historyFilter = historyFilterEl.value;
    renderHistory();
  });

  function renderHistory(){
    historyWrap.innerHTML = '';
    populateHistoryFilter();
    renderPeriodPanel();
    if(!entries.length){
      const hint = document.createElement('div');
      hint.className = 'empty-hint';
      hint.textContent = 'No entries yet — log a sum or a pass above to get started.';
      historyWrap.appendChild(hint);
      return;
    }
    const byDay = {};
    entries.forEach(e=>{ (byDay[e.dateKey] = byDay[e.dateKey]||[]).push(e); });
    const allDayKeys = Object.keys(byDay).sort().reverse();
    const dayKeys = allDayKeys.slice(0, historyDaysShown);
    const todayKey = dateKeyOf(Date.now());
    let renderedAny = false;

    dayKeys.forEach(key=>{
      const dayEntries = byDay[key].slice().sort((a,b)=>a.ts-b.ts);
      const group = document.createElement('div');
      group.className = 'day-group' + (key===todayKey ? '' : ' collapsed');

      // per-friend + grand running totals, computed in chronological order (always over the FULL day,
      // so a friend filter never distorts the running totals — it only hides other friends' lines)
      const perFriendSum = {}, perFriendPass = {};
      let grandSum = 0, grandPass = 0;
      const lineData = dayEntries.map(e=>{
        if(e.kind==='sum'){
          const prev = perFriendSum[e.friend] || 0;
          perFriendSum[e.friend] = prev + e.value;
          grandSum += e.value;
          return {e, prevTotal:prev, newTotal:perFriendSum[e.friend]};
        } else {
          const prev = perFriendPass[e.friend] || 0;
          perFriendPass[e.friend] = prev + e.value;
          grandPass += e.value;
          return {e, prevTotal:prev, newTotal:perFriendPass[e.friend]};
        }
      });

      const visibleLines = historyFilter==='all' ? lineData : lineData.filter(ld=> ld.e.friend===historyFilter);
      if(!visibleLines.length) return; // nothing for this friend on this day — skip the whole group
      renderedAny = true;

      const head = document.createElement('div');
      head.className = 'day-head';
      const headSum = historyFilter==='all' ? grandSum : (perFriendSum[historyFilter]||0);
      const headPass = historyFilter==='all' ? grandPass : (perFriendPass[historyFilter]||0);
      const dayNet = netInfo(headSum, headPass);
      head.innerHTML = `
        <div>
          <div class="day-head-title">${dayLabel(key)}</div>
          <div class="day-head-sub">Sum total ${round2(headSum)} · Pass total ${round2(headPass)} · <span class="${dayNet.cls}">${dayNet.txt}</span></div>
        </div>
        <svg class="day-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>`;
      head.addEventListener('click', ()=>{ group.classList.toggle('collapsed'); });
      group.appendChild(head);

      const body = document.createElement('div');
      body.className = 'day-body';

      if(historyFilter==='all'){
        const subtotals = document.createElement('div');
        subtotals.className = 'friend-subtotals';
        const names = Array.from(new Set(dayEntries.map(e=>e.friend)));
        names.forEach(name=>{
          const card = document.createElement('div');
          card.className = 'subtotal-card';
          const fNet = netInfo(perFriendSum[name]||0, perFriendPass[name]||0);
          card.innerHTML = `<div class="name">${escapeHtml(name)}</div><div class="vals">sum ${round2(perFriendSum[name]||0)} · pass ${round2(perFriendPass[name]||0)} · <span class="${fNet.cls}">${fNet.txt}</span></div>`;
          subtotals.appendChild(card);
        });
        body.appendChild(subtotals);
      }

      // newest entry shown first; running totals above were computed chronologically
      visibleLines.slice().reverse().forEach(({e, prevTotal, newTotal})=>{
        const line = document.createElement('div');
        line.className = 'entry-line';
        const time = new Date(e.ts).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
        const detail = `${escapeHtml(e.raw)} = <b>${round2(e.value)}</b> &nbsp;(${round2(prevTotal)} → ${round2(newTotal)})`;
        line.innerHTML = `
          <div class="entry-main">
            <span class="entry-time">${time}</span> · <span class="entry-friend">${escapeHtml(e.friend)}</span>
            <div class="entry-detail${e.kind==='pass'?' pass':''}">${detail}</div>
          </div>
          <div class="entry-actions">
            <button class="entry-edit" title="Edit entry">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
            <button class="entry-del" title="Delete entry">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-12"/></svg>
            </button>
          </div>`;
        line.querySelector('.entry-edit').addEventListener('click', ()=> openEditEntryModal(e.id));
        line.querySelector('.entry-del').addEventListener('click', ()=> confirmDeleteEntry(e.id));
        body.appendChild(line);
      });

      group.appendChild(body);
      historyWrap.appendChild(group);
    });

    if(!renderedAny){
      const hint = document.createElement('div');
      hint.className = 'empty-hint';
      hint.textContent = historyFilter==='all' ? 'No entries yet.' : ('No entries yet for ' + historyFilter + '.');
      historyWrap.appendChild(hint);
    }

    if(allDayKeys.length > historyDaysShown){
      const more = document.createElement('button');
      more.className = 'tool-btn';
      more.style.width = '100%';
      more.style.marginTop = '10px';
      const remaining = allDayKeys.length - historyDaysShown;
      more.textContent = 'Show ' + Math.min(remaining, 7) + ' more day' + (Math.min(remaining,7)===1?'':'s') + ' (' + remaining + ' older)';
      more.addEventListener('click', ()=>{
        historyDaysShown += 7;
        renderHistory();
      });
      historyWrap.appendChild(more);
    } else if(allDayKeys.length > 4){
      const collapse = document.createElement('button');
      collapse.className = 'tool-btn';
      collapse.style.width = '100%';
      collapse.style.marginTop = '10px';
      collapse.textContent = 'Show fewer days';
      collapse.addEventListener('click', ()=>{
        historyDaysShown = 4;
        renderHistory();
      });
      historyWrap.appendChild(collapse);
    }
  }

  // ---------- backup & restore ----------
  function openBackupModal(){
    modalRoot.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <h3>Backup & restore</h3>
        <div class="backup-row" id="exportRow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/></svg>
          <div class="txt"><b>Export a backup file</b><span>Saves friends, history & keypad layout as a .json file</span></div>
        </div>
        <div class="backup-row" id="importRow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V9m0 0 4 4m-4-4-4 4"/><path d="M5 3v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3"/></svg>
          <div class="txt"><b>Import a backup file</b><span>Replaces everything currently on this device</span></div>
        </div>
        <input type="file" id="importFile" accept="application/json" style="display:none;">
        <div class="modal-actions">
          <button class="cancel" id="mCancel">Close</button>
        </div>
      </div>`;
    modalRoot.appendChild(overlay);
    document.getElementById('mCancel').addEventListener('click', ()=> modalRoot.innerHTML='');
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) modalRoot.innerHTML=''; });
    document.getElementById('exportRow').addEventListener('click', exportBackup);
    document.getElementById('importRow').addEventListener('click', ()=> document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', handleImportFile);
  }

  function exportBackup(){
    const data = {
      type:'toolbox-backup', version:1, exportedAt:new Date().toISOString(),
      friends, entries, layout, headerLayout, customLabels, periodStart, periodEnd, bonusPct, customVars, customPanels,
      theme: (()=>{ try{ return localStorage.getItem('toolbox_theme')||'light'; }catch(e){ return 'light'; } })()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    a.href = url;
    a.download = 'toolbox-backup-' + d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=> URL.revokeObjectURL(url), 2000);
    showToast('Backup file downloaded');
  }

  function handleImportFile(e){
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      let data;
      try{ data = JSON.parse(reader.result); }
      catch(err){ showToast('Could not read that file'); return; }
      if(!data || !Array.isArray(data.friends) || !Array.isArray(data.entries)){
        showToast("That file doesn't look like a valid backup"); return;
      }
      confirmImport(data);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function confirmImport(data){
    modalRoot.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <h3>Replace all data?</h3>
        <p>Importing this backup (${data.entries.length} entries, ${data.friends.length} friends) will overwrite everything currently saved on this device. This can't be undone.</p>
        <div class="modal-actions">
          <button class="cancel" id="mCancel">Cancel</button>
          <button class="confirm danger" id="mImport">Replace</button>
        </div>
      </div>`;
    modalRoot.appendChild(overlay);
    document.getElementById('mCancel').addEventListener('click', ()=> modalRoot.innerHTML='');
    overlay.addEventListener('click', (ev)=>{ if(ev.target===overlay) modalRoot.innerHTML=''; });
    document.getElementById('mImport').addEventListener('click', ()=>{
      friends = data.friends || [];
      entries = data.entries || [];
      if(Array.isArray(data.layout) && data.layout.length) layout = data.layout;
      if(Array.isArray(data.headerLayout) && data.headerLayout.length){
        headerLayout.forEach(w=>{
          const d = data.headerLayout.find(x=>x.id===w.id);
          if(d){ w.x=d.x; w.y=d.y; w.w=d.w; w.h=d.h; }
        });
      }
      if(data.customLabels && typeof data.customLabels==='object'){
        customLabels = Object.assign({}, defaultLabels, data.customLabels);
        save(KEY_LABELS, customLabels);
      }
      if(typeof data.periodStart==='number'){ periodStart = data.periodStart; save(KEY_PERIOD_START, periodStart); }
      periodEnd = (typeof data.periodEnd==='number') ? data.periodEnd : null;
      save(KEY_PERIOD_END, periodEnd);
      if(typeof data.bonusPct==='number'){ bonusPct = data.bonusPct; save(KEY_BONUS_PCT, bonusPct); }
      customVars = Array.isArray(data.customVars) ? data.customVars : [];
      customPanels = Array.isArray(data.customPanels) ? data.customPanels : [];
      migrateVarsAndPanels();
      stripLegacyPanelWidgets();
      save(KEY_CUSTOM_VARS, customVars); save(KEY_CUSTOM_PANELS, customPanels);
      activeFriend = friends[0] || null;
      save(KEY_FRIENDS, friends);
      save(KEY_ENTRIES, entries);
      save(KEY_LAYOUT, layout);
      save(KEY_HEADER_LAYOUT, headerLayout);
      if(data.theme){
        try{ localStorage.setItem('toolbox_theme', data.theme); }catch(err){}
        document.documentElement.setAttribute('data-theme', data.theme);
      }
      modalRoot.innerHTML = '';
      safeRenderAll();
      showToast('Backup restored');
    });
  }

  backupBtn.addEventListener('click', openBackupModal);

  // ---------- calc display resize ----------
  (function(){
    const wrap = document.getElementById('calcDisplayWrap');
    const handle = document.getElementById('calcResizeHandle');
    const MIN_H = 52;
    const maxH = () => window.innerHeight * 0.5;
    let resizing = false, startY = 0, startHeight = 0;

    const savedH = load(KEY_DISPLAY_H, null);
    if(savedH) wrap.style.height = Math.max(MIN_H, Math.min(maxH(), savedH)) + 'px';

    handle.addEventListener('pointerdown', (e)=>{
      resizing = true;
      startY = e.clientY;
      startHeight = wrap.getBoundingClientRect().height;
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    });
    handle.addEventListener('pointermove', (e)=>{
      if(!resizing) return;
      const delta = e.clientY - startY;
      const newHeight = Math.max(MIN_H, Math.min(maxH(), startHeight + delta));
      wrap.style.height = newHeight + 'px';
      e.stopPropagation();
    });
    function endResize(e){
      if(!resizing) return;
      resizing = false;
      save(KEY_DISPLAY_H, wrap.getBoundingClientRect().height);
    }
    handle.addEventListener('pointerup', endResize);
    handle.addEventListener('pointercancel', endResize);
  })();

  // ---------- init ----------
  safeRenderAll();
  if(window.__toolboxRefreshSwipeHeight) window.__toolboxRefreshSwipeHeight();
})();
