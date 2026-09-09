/* ============================================================
   SUPABASE CONFIG — fill these in after you set up your project.
   See the setup guide for exact steps to get these three values.
   Until you fill these in (replace the YOUR_... placeholders),
   the app runs unlocked with local-only storage, same as before.
============================================================ */
const SUPABASE_URL = 'https://ffulfucazvgmhvvprquf.supabase.co';           // e.g. https://abcdefgh.supabase.co
const SUPABASE_ANON_KEY = 'sb_publishable_MeZQQaleGFcC32PW-7JmvQ_5-N1pelP'; // Settings > API > Project API keys > anon public
const AUTH_EMAIL = 'zeroquality505@gmail.com';              // the email of the auth user you create in Supabase

const SUPABASE_CONFIGURED = !SUPABASE_URL.includes('YOUR_') && !SUPABASE_ANON_KEY.includes('YOUR_') && !AUTH_EMAIL.includes('YOUR_');
const supabaseClient = SUPABASE_CONFIGURED ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const KEY_UNLOCK_UNTIL = 'toolbox_unlock_until';
const UNLOCK_DAYS = 30;

function isUnlockedLocally(){
  const until = parseInt(localStorage.getItem(KEY_UNLOCK_UNTIL) || '0', 10);
  return until > Date.now();
}
function extendUnlock(){
  localStorage.setItem(KEY_UNLOCK_UNTIL, String(Date.now() + UNLOCK_DAYS*24*60*60*1000));
}

const lockOverlay = document.getElementById('lockOverlay');
const lockForm = document.getElementById('lockForm');
const lockInput = document.getElementById('lockPinInput');
const lockError = document.getElementById('lockError');
const lockSubmit = document.getElementById('lockSubmit');

function showLock(){
  lockOverlay.classList.add('visible');
  setTimeout(()=>{ if(lockInput) lockInput.focus(); }, 50);
}
function hideLock(){
  lockOverlay.classList.remove('visible');
}

async function tryAutoUnlock(){
  if(!SUPABASE_CONFIGURED){ hideLock(); return; } // not set up yet — run unlocked, local-only
  if(!isUnlockedLocally()){ showLock(); return; }
  try{
    const { data } = await supabaseClient.auth.getSession();
    if(data && data.session){
      hideLock();
      if(window.__toolboxOnUnlock) window.__toolboxOnUnlock();
    } else {
      showLock();
    }
  }catch(e){
    showLock();
  }
}

if(lockForm){
  lockForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    lockError.textContent = '';
    lockSubmit.disabled = true;
    lockSubmit.textContent = 'Checking…';
    const pin = lockInput.value.trim();
    try{
      const { error } = await supabaseClient.auth.signInWithPassword({ email: AUTH_EMAIL, password: pin });
      if(error){
        lockError.textContent = 'Incorrect PIN. Try again.';
        lockInput.value = '';
        lockInput.focus();
      } else {
        extendUnlock();
        hideLock();
        if(window.__toolboxOnUnlock) window.__toolboxOnUnlock();
      }
    }catch(err){
      lockError.textContent = 'Could not reach the server — check your connection.';
    }
    lockSubmit.disabled = false;
    lockSubmit.textContent = 'Unlock';
  });
}

tryAutoUnlock();

