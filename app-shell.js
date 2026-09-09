// ================= Theme picker (light/dark/etc) =================
(function(){
  const KEY_THEME = 'toolbox_theme';
  const btn = document.getElementById('themeBtn');
  const icon = document.getElementById('themeIconMoon');
  const modalRoot = document.getElementById('modalRoot');
  const sunPath = '<path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/><circle cx="12" cy="12" r="4.5"/>';
  const moonPath = '<path d="M21 12.6A9 9 0 1 1 11.4 3a7 7 0 0 0 9.6 9.6Z"/>';

  const THEMES = [
    { id:'light',      name:'Light',      dark:false, bg:'#E4E9F2', accent:'#2F6E68' },
    { id:'dark',       name:'Midnight',   dark:true,  bg:'#1A1D26', accent:'#4FB3A6' },
    { id:'ocean',      name:'Ocean',      dark:false, bg:'#E3EEF5', accent:'#1F7A8C' },
    { id:'forest',     name:'Forest',     dark:false, bg:'#E6EDE3', accent:'#3F7D51' },
    { id:'sunset',     name:'Sunset',     dark:false, bg:'#F3E7DE', accent:'#D97A4D' },
    { id:'nightshade', name:'Nightshade', dark:true,  bg:'#1B1726', accent:'#9B6BD1' }
  ];
  function themeInfo(id){ return THEMES.find(t=>t.id===id) || THEMES[0]; }

  let theme = 'light';
  function apply(id){
    theme = id;
    document.documentElement.setAttribute('data-theme', id);
    const t = themeInfo(id);
    icon.innerHTML = t.dark ? sunPath : moonPath;
    btn.title = 'Choose theme (currently ' + t.name + ')';
  }

  try{
    const saved = localStorage.getItem(KEY_THEME);
    theme = (saved && THEMES.some(t=>t.id===saved)) ? saved :
      ((window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light');
  }catch(e){}
  apply(theme);

  const checkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  function openThemeModal(){
    modalRoot.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const cells = THEMES.map(t => `
      <div class="theme-cell">
        <button class="theme-swatch${t.id===theme?' active':''}" data-theme-id="${t.id}" style="background:${t.bg};" title="${t.name}">
          <span class="theme-swatch-dot" style="background:${t.accent};"></span>
          ${t.id===theme ? `<span class="theme-swatch-check">${checkSvg}</span>` : ''}
        </button>
        <span class="theme-name">${t.name}</span>
      </div>`).join('');
    overlay.innerHTML = `
      <div class="modal-card">
        <h3>Choose a theme</h3>
        <div class="theme-grid">${cells}</div>
        <div class="modal-actions">
          <button class="cancel" id="mCancel">Close</button>
        </div>
      </div>`;
    modalRoot.appendChild(overlay);
    overlay.querySelectorAll('.theme-swatch').forEach(elBtn=>{
      elBtn.addEventListener('click', ()=>{
        apply(elBtn.dataset.themeId);
        try{ localStorage.setItem(KEY_THEME, theme); }catch(e){}
        modalRoot.innerHTML = '';
      });
    });
    document.getElementById('mCancel').addEventListener('click', ()=> modalRoot.innerHTML='');
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) modalRoot.innerHTML=''; });
  }

  btn.addEventListener('click', openThemeModal);
})();

(function(){
  const inputArea = document.getElementById('inputArea');
  const highlightInner = document.getElementById('highlightInner');
  const validCountEl = document.getElementById('validCount');
  const errorCountEl = document.getElementById('errorCount');
  const totalCountEl = document.getElementById('totalCount');
  const errorNav = document.getElementById('errorNav');
  const errorInfo = document.getElementById('errorInfo');
  const errorListEl = document.getElementById('errorList');
  const prevErrBtn = document.getElementById('prevErrBtn');
  const nextErrBtn = document.getElementById('nextErrBtn');
  const autoJumpSwitch = document.getElementById('autoJumpSwitch');
  const toastEl = document.getElementById('toast');

  let autoJump = true;
  let matches = [];       // all digit-runs found
  let errors = [];        // subset that are not exactly 2 digits
  let currentErrorIdx = -1;
  let lastErrorCount = 0;
  let debounceTimer = null;

  function escapeHtml(s){
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function analyze(text){
    const re = /\d+/g;
    const found = [];
    let m;
    while((m = re.exec(text)) !== null){
      found.push({start:m.index, end:m.index+m[0].length, text:m[0], valid:m[0].length===2});
    }
    return found;
  }

  function buildHighlightHTML(text, found, currentErr){
    let html = '';
    let last = 0;
    found.forEach(m=>{
      html += escapeHtml(text.slice(last, m.start));
      const cls = m.valid ? 'num-valid' : ('num-error' + (m===currentErr ? ' current' : ''));
      html += '<span class="'+cls+'">'+escapeHtml(m.text)+'</span>';
      last = m.end;
    });
    html += escapeHtml(text.slice(last));
    if(text.endsWith('\n')) html += '&nbsp;';
    return html;
  }

  function renderErrorList(){
    errorListEl.innerHTML = '';
    errors.forEach((e, i)=>{
      const chip = document.createElement('button');
      chip.className = 'error-chip';
      chip.textContent = '"'+e.text+'" ('+e.text.length+' digit'+(e.text.length===1?'':'s')+')';
      chip.addEventListener('click', ()=> jumpToError(i, true));
      errorListEl.appendChild(chip);
    });
  }

  function updateStats(){
    const validList = matches.filter(m=>m.valid);
    validCountEl.textContent = validList.length;
    errorCountEl.textContent = errors.length;
    totalCountEl.textContent = matches.length;
    errorNav.style.display = errors.length ? 'flex' : 'none';
    if(errors.length){
      if(currentErrorIdx < 0 || currentErrorIdx >= errors.length) currentErrorIdx = 0;
      errorInfo.textContent = 'Error '+(currentErrorIdx+1)+' of '+errors.length;
    } else {
      currentErrorIdx = -1;
    }
    renderErrorList();
  }

  function syncScroll(){
    highlightInner.style.transform = 'translate('+(-inputArea.scrollLeft)+'px,'+(-inputArea.scrollTop)+'px)';
  }

  function render(jumpNow){
    const text = inputArea.value;
    matches = analyze(text);
    errors = matches.filter(m=>!m.valid);
    const currentErr = (currentErrorIdx>=0 && errors[currentErrorIdx]) ? errors[currentErrorIdx] : null;
    highlightInner.innerHTML = buildHighlightHTML(text, matches, currentErr);
    syncScroll();
    updateStats();
  }

  function scrollTextareaToPosition(pos){
    const before = inputArea.value.slice(0, pos);
    const lineNum = before.split('\n').length - 1;
    const cs = getComputedStyle(inputArea);
    const lineHeight = parseFloat(cs.lineHeight) || 24;
    const target = lineNum*lineHeight - inputArea.clientHeight/2 + lineHeight;
    inputArea.scrollTop = Math.max(0, target);
    syncScroll();
  }

  function jumpToError(idx, userInitiated){
    if(!errors.length) return;
    currentErrorIdx = ((idx % errors.length) + errors.length) % errors.length;
    const e = errors[currentErrorIdx];
    if(userInitiated){
      // Only move the real cursor/selection when the user explicitly asked
      // to jump (Prev/Next or tapping an error chip). Doing this automatically
      // while the user is still typing/deleting steals the caret to a
      // different spot in the text, so their next backspace deletes the
      // wrong characters. Automatic detection below only highlights + scrolls.
      inputArea.focus();
      inputArea.setSelectionRange(e.start, e.end);
    }
    scrollTextareaToPosition(e.start);
    errorInfo.textContent = 'Error '+(currentErrorIdx+1)+' of '+errors.length;
    highlightInner.innerHTML = buildHighlightHTML(inputArea.value, matches, e);
    if(userInitiated) showToast('Jumped to "'+e.text+'"');
  }

  function showToast(msg){
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=> toastEl.classList.remove('show'), 1600);
  }

  inputArea.addEventListener('input', ()=>{
    render(false);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(()=>{
      if(autoJump && errors.length && errors.length !== lastErrorCount){
        jumpToError(0, false);
        showToast(errors.length===1 ? '1 number needs 2 digits' : errors.length+' numbers need 2 digits');
      }
      lastErrorCount = errors.length;
    }, 700);
  });
  inputArea.addEventListener('scroll', syncScroll);
  window.addEventListener('resize', syncScroll);

  prevErrBtn.addEventListener('click', ()=> jumpToError(currentErrorIdx-1, true));
  nextErrBtn.addEventListener('click', ()=> jumpToError(currentErrorIdx+1, true));

  autoJumpSwitch.addEventListener('click', ()=>{
    autoJump = !autoJump;
    autoJumpSwitch.classList.toggle('on', autoJump);
  });

  document.getElementById('pasteBtn').addEventListener('click', async ()=>{
    try{
      const text = await navigator.clipboard.readText();
      const start = inputArea.selectionStart, end = inputArea.selectionEnd;
      inputArea.value = inputArea.value.slice(0,start) + text + inputArea.value.slice(end);
      inputArea.focus();
      inputArea.setSelectionRange(start+text.length, start+text.length);
      render(false);
      lastErrorCount = errors.length;
    }catch(err){
      showToast('Tap the box and long-press to paste');
    }
  });

  document.getElementById('clearInputBtn').addEventListener('click', ()=>{
    inputArea.value = '';
    currentErrorIdx = -1;
    lastErrorCount = 0;
    render(false);
    inputArea.focus();
  });

  document.getElementById('copyStatsBtn').addEventListener('click', async ()=>{
    const validList = matches.filter(m=>m.valid).map(m=>m.text);
    const summary = 'Valid: '+validList.length+' | Errors: '+errors.length+' | Total: '+matches.length+
      (validList.length ? ('\nNumbers: '+validList.join(', ')) : '');
    try{
      await navigator.clipboard.writeText(summary);
      showToast('Result copied');
    }catch(err){
      showToast('Could not copy — clipboard blocked');
    }
  });

  document.getElementById('infoBtn').addEventListener('click', ()=>{
    showToast('Numbers must be exactly 2 digits. Any character between them works as a separator.');
  });

  // ---- drag-to-resize handle ----
  const resizeHandle = document.getElementById('resizeHandle');
  const editorWrap = document.querySelector('.editor-wrap');
  let resizing = false, startY = 0, startHeight = 0;
  const MIN_H = 120;
  const maxH = () => window.innerHeight * 0.8;

  resizeHandle.addEventListener('pointerdown', (e)=>{
    resizing = true;
    startY = e.clientY;
    startHeight = editorWrap.getBoundingClientRect().height;
    resizeHandle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  resizeHandle.addEventListener('pointermove', (e)=>{
    if(!resizing) return;
    const delta = e.clientY - startY;
    const newHeight = Math.max(MIN_H, Math.min(maxH(), startHeight + delta));
    editorWrap.style.height = newHeight + 'px';
    syncScroll();
  });
  function endResize(){ resizing = false; }
  resizeHandle.addEventListener('pointerup', endResize);
  resizeHandle.addEventListener('pointercancel', endResize);

  render(false);
})();

// ================= Tab switching (+ true infinite-direction swipe) =================
(function(){
  const tabs = document.querySelectorAll('.tab[data-tool]');
  const panelEls = { calclog: document.getElementById('calcPanel'), numbers: document.getElementById('numbersPanel') };
  const swipeArea = document.getElementById('swipeArea');
  const track = document.getElementById('swipeTrack');
  const slotLeft = document.getElementById('slotLeft');
  const slotRight = document.getElementById('slotRight');

  let current = 'calclog';
  const other = (k)=> k==='calclog' ? 'numbers' : 'calclog';

  function show(el){ el.style.display = 'block'; }

  // Canonical resting state: `current` lives in slotLeft, its counterpart in slotRight, track at x=0.
  function ensureCanonical(){
    if(slotLeft.firstElementChild !== panelEls[current]){ slotLeft.appendChild(panelEls[current]); show(panelEls[current]); }
    if(slotRight.firstElementChild !== panelEls[other(current)]){ slotRight.appendChild(panelEls[other(current)]); show(panelEls[other(current)]); }
    track.style.transition = 'none';
    track.style.transform = 'translate3d(0,0,0)';
  }

  function width(){ return swipeArea.clientWidth || 1; }

  function setHeightTo(panelKey, animate){
    const h = panelEls[panelKey].scrollHeight;
    swipeArea.style.transition = animate ? 'height .32s cubic-bezier(.22,.61,.36,1)' : 'none';
    swipeArea.style.height = h + 'px';
  }
  window.__toolboxRefreshSwipeHeight = ()=> setHeightTo(current, false);

  function afterShow(){
    tabs.forEach(x=> x.classList.toggle('active', x.dataset.tool===current));
    setHeightTo(current, true);
    document.dispatchEvent(new CustomEvent('toolbox:tabshown', { detail:{ tool: current } }));
  }

  function animateTrack(toPx, onDone){
    track.style.transition = 'transform .32s cubic-bezier(.22,.61,.36,1)';
    requestAnimationFrame(()=>{ track.style.transform = 'translate3d(' + toPx + 'px,0,0)'; });
    let done = false;
    const finish = ()=>{
      if(done) return; done = true;
      track.removeEventListener('transitionend', finish);
      onDone();
    };
    track.addEventListener('transitionend', finish, { once:true });
    setTimeout(finish, 420); // safety fallback if transitionend doesn't fire
  }

  // dir: 'left' (reveal next, entering from the right) or 'right' (reveal next, entering from the left)
  function prepFor(dir){
    if(dir === 'left'){
      // canonical layout already has `other` sitting in slotRight — nothing to move
      track.style.transition = 'none';
      track.style.transform = 'translate3d(0,0,0)';
    } else {
      // swap so `other` sits to the left, `current` shifts right, then jump baseline to match (no visible change)
      slotLeft.appendChild(panelEls[other(current)]); show(panelEls[other(current)]);
      slotRight.appendChild(panelEls[current]); show(panelEls[current]);
      track.style.transition = 'none';
      track.style.transform = 'translate3d(' + (-width()) + 'px,0,0)';
    }
  }

  function commit(dir){
    if(dir === 'left'){
      animateTrack(-width(), ()=>{ current = other(current); ensureCanonical(); afterShow(); });
    } else {
      animateTrack(0, ()=>{ current = other(current); /* already canonical: new current sits in slotLeft */ afterShow(); });
    }
  }

  function cancel(dir){
    if(dir === 'left'){
      animateTrack(0, ()=>{ /* still canonical, nothing to undo */ });
    } else {
      animateTrack(-width(), ()=>{ ensureCanonical(); });
    }
  }

  function goTo(tool){
    if(tool === current) return;
    const dir = current === 'calclog' ? 'left' : 'right'; // calclog is visually left of numbers
    prepFor(dir);
    commit(dir);
  }

  tabs.forEach(t=>{
    t.addEventListener('click', ()=> goTo(t.dataset.tool));
  });

  // keep dimensions correct as content or window size changes
  const ro = new ResizeObserver(()=>{ if(!dragging) setHeightTo(current, false); });
  Object.values(panelEls).forEach(p=> ro.observe(p));
  window.addEventListener('resize', ()=> ensureCanonical());

  // ---- live-follow swipe, direction always matches the finger, true infinite loop ----
  let sx=0, sy=0, dragging=false, decided=false, isHorizontal=false, dragDir=null;
  const THRESH_DECIDE = 8;
  const THRESH_COMMIT = 0.22;

  function excluded(target){
    return !!target.closest('.resize-handle, .tile-resize, .btn-tile.editing, .header-tile.editing, textarea, .friend-add, select, .calc-display-wrap, input[type="date"]');
  }

  swipeArea.addEventListener('pointerdown', (e)=>{
    if(e.pointerType==='mouse') return;
    if(excluded(e.target)) return;
    if(dragging){ endTrack(); } // self-heal if a previous gesture never resolved
    dragging = true; decided = false; isHorizontal = false; dragDir = null;
    sx = e.clientX; sy = e.clientY;
    // claim this pointer explicitly so we keep receiving its events for the
    // whole gesture even if the finger drifts off swipeArea mid-swipe —
    // without this, a slow/small swipe can lose its "finger lifted" event
    // entirely, leaving the panel transform stuck halfway.
    try{ swipeArea.setPointerCapture(e.pointerId); }catch(err){}
  });
  swipeArea.addEventListener('pointermove', (e)=>{
    if(!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if(!decided){
      if(Math.abs(dx) < THRESH_DECIDE && Math.abs(dy) < THRESH_DECIDE) return;
      decided = true;
      isHorizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
      if(!isHorizontal){ dragging = false; return; }
      dragDir = dx < 0 ? 'left' : 'right';
      prepFor(dragDir);
    }
    if(isHorizontal){
      const w = width();
      const baseline = dragDir === 'left' ? 0 : -w;
      const px = Math.max(-w, Math.min(0, baseline + dx));
      track.style.transition = 'none';
      track.style.transform = 'translate3d(' + px + 'px,0,0)';
      e.preventDefault();
    }
  });
  function endTrack(e){
    if(!dragging) return;
    dragging = false;
    try{ if(e && e.pointerId!=null) swipeArea.releasePointerCapture(e.pointerId); }catch(err){}
    if(!isHorizontal || !dragDir) return;
    const dx = (e && e.clientX!=null ? e.clientX : sx) - sx;
    const w = width();
    const moved = Math.abs(dx);
    const committed = moved > w * THRESH_COMMIT || moved > 60;
    if(committed) commit(dragDir); else cancel(dragDir);
  }
  // Listen on window (not just swipeArea) for the release events, so a slow
  // swipe whose pointer ends up slightly outside swipeArea's box still gets
  // caught. lostpointercapture is a safety net for the rare case the browser
  // takes capture away from us mid-gesture without firing pointerup/cancel.
  window.addEventListener('pointerup', endTrack);
  window.addEventListener('pointercancel', endTrack);
  swipeArea.addEventListener('lostpointercapture', endTrack);


  ensureCanonical();
  afterShow();
})();

