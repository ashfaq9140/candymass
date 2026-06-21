// ===== CANDY MASS - COMPLETE SCRIPT (WITH HOME PAGE) =====
// ===== RESPONSIVE SCALING =====
const BASE_W = 400, BASE_H = 540;
let gameW = BASE_W, gameH = BASE_H;
let scaleX = 1, scaleY = 1;

function resizeCanvas() {
    const container = document.getElementById('cw');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    gameW = rect.width;
    gameH = rect.height;
    const canvas = document.getElementById('canvas');
    if (canvas) {
        canvas.width = gameW;
        canvas.height = gameH;
    }
    scaleX = gameW / BASE_W;
    scaleY = gameH / BASE_H;
    if (st && st.basket) {
        st.basket.w = 86 * scaleX;
        st.basket.h = 26 * scaleY;
        st.basket.y = gameH - 52 * scaleY;
        st.basket.x = Math.min(Math.max(st.basket.x, st.basket.w/2), gameW - st.basket.w/2);
    }
}

function getScaledX(clientX) {
    const canvas = document.getElementById('canvas');
    const rect = canvas.getBoundingClientRect();
    const relX = (clientX - rect.left) / rect.width;
    return relX * gameW;
}

function moveB(cx) {
    if (!st) return;
    const newX = getScaledX(cx);
    st.basket.x = Math.max(st.basket.w/2, Math.min(gameW - st.basket.w/2, newX));
}

// ===== AUTH (USING MODULAR FIREBASE FROM HTML) =====
const SESSION_KEY = 'cr_session_v4';
function getSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } }
function saveSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

let currentUserEmail = 'guest';
let currentUserName = 'Guest';
let gameStarted = false;
let isOnHomePage = false;

function getAuth() {
    return window.firebaseAuth || null;
}

window.onUserLoggedIn = function(user) {
    if (gameStarted) return;
    gameStarted = true;
    const name = user.displayName;
    const email = user.email;
    const users = JSON.parse(localStorage.getItem('cr_users_v2') || '[]');
    if (!users.find(u => u.email === email)) {
        users.push({ name, email, via: 'google', id: user.uid });
    }
    localStorage.setItem('cr_users_v2', JSON.stringify(users));
    saveSession({ email, name, via: 'google' });
    document.getElementById('loginScreen').style.display = 'none';
    showHomePage(name, email);
};

// ===== HOME PAGE FUNCTIONS =====
function showHomePage(name, email) {
    if (name) {
        currentUserName = name;
        currentUserEmail = email;
    }
    document.getElementById('gameWrap').style.display = 'flex';
    document.getElementById('homePageOv').style.display = 'flex';
    document.getElementById('homeOv').style.display = 'none';
    document.getElementById('userName').textContent = '👤 ' + currentUserName;
    isOnHomePage = true;
    // Update skin button
    updateSkinButton();
    // Update sound/music buttons
    initSoundBtn();
    initMusicBtn();
    resizeCanvas();
}

function hideHomePage() {
    document.getElementById('homePageOv').style.display = 'none';
    isOnHomePage = false;
}

// ===== HOME PAGE BUTTON HANDLERS =====
function startGameFromHome(resume) {
    hideHomePage();
    // Check if we have saved progress
    const saved = loadProgress();
    if (resume && saved && saved.level > 1) {
        startGame(true, saved);
    } else {
        startGame(false);
    }
}

// Expose home page functions to HTML onclick
window.startGameFromHome = startGameFromHome;

// ===== GUEST LOGIN =====
function guestLogin() {
    document.body.classList.add('game-active');
    const name = 'Guest_' + Math.floor(Math.random() * 10000);
    const email = 'guest_' + Date.now() + '@local.candymass';
    saveSession({ email, name, via: 'guest' });
    document.getElementById('loginScreen').style.display = 'none';
    showHomePage(name, email);
}

function logout() {
    document.body.classList.remove('game-active');
    const auth = getAuth();
    if (auth && auth.currentUser) {
        auth.signOut();
    }
    clearSession();
    stopMusic();
    document.getElementById('gameWrap').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('homePageOv').style.display = 'none';
    if (typeof st !== 'undefined') st.running = false;
    gameStarted = false;
    isOnHomePage = false;
}

function enterGame(name, email) {
    // This function is called from login flow – show home page instead of direct game start
    currentUserEmail = email;
    currentUserName = name;
    showHomePage(name, email);
}

window.addEventListener('load', () => {
    loadSkin();
    const sess = getSession();
    if (sess && sess.email && !sess.email.startsWith('guest_')) {
        document.getElementById('loginScreen').style.display = 'none';
        showHomePage(sess.name, sess.email);
        gameStarted = true;
    } else {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('homePageOv').style.display = 'none';
    }
    checkDailyBadge();
    loadSettings();
});

// ===== SAVE & LEADERBOARD =====
function saveKey(e) { return 'cr_save_v4_' + e; }
function saveProgress() { if (!currentUserEmail) return; try { localStorage.setItem(saveKey(currentUserEmail), JSON.stringify({ level: st.level, score: st.score, lives: st.lives })); } catch(e) {} }
function loadProgress() {
    if (!currentUserEmail) return null;
    try {
        const r = localStorage.getItem(saveKey(currentUserEmail));
        if (r) {
            const data = JSON.parse(r);
            return { level: data.level, score: data.score, lives: data.lives || 3 };
        }
        return null;
    } catch { return null; }
}
function saveLB() {
  try {
    const lb = JSON.parse(localStorage.getItem('cr_lb_v4') || '[]');
    const idx = lb.findIndex(r => r.email === currentUserEmail);
    const entry = { name: currentUserName, email: currentUserEmail, score: st.score, level: st.level };
    if (idx >= 0) { if (st.score > lb[idx].score) lb[idx] = entry; } else lb.push(entry);
    lb.sort((a,b) => b.score - a.score);
    localStorage.setItem('cr_lb_v4', JSON.stringify(lb.slice(0,100)));
  } catch(e) {}
}
function showLeaderboard() {
  showOv('lbOv');
  const content = document.getElementById('lbContent');
  try {
    const lb = JSON.parse(localStorage.getItem('cr_lb_v4') || '[]');
    if (!lb.length) { content.innerHTML = '<div style="text-align:center;">No scores yet.</div>'; return; }
    const medals = ['🥇','🥈','🥉'];
    let html = '<div>';
    lb.slice(0,20).forEach((r,i) => {
      const isMe = r.email === currentUserEmail;
      html += `<div class="lb-row"><span class="lb-rank">${i<3?medals[i]:i+1}</span><span class="lb-name">${r.name}${isMe?' ★':''}</span><span class="lb-score">${r.score.toLocaleString()}</span><span class="lb-lv">L${r.level}</span></div>`;
    });
    html += '</div>';
    content.innerHTML = html;
  } catch(e) { content.innerHTML = '<div>Error</div>'; }
}
function closeLB() { showHomePage(); }

// ===== CLOUD SAVE (FIRESTORE) =====
async function saveProgressToCloud() {
    if (!currentUserEmail || currentUserEmail.startsWith('guest_')) {
        console.log("Guest user, skipping cloud save");
        return;
    }
    try {
        const db = window.firebaseDb;
        const doc = window.firebaseDoc;
        const setDoc = window.firebaseSetDoc;
        if (!db || !doc || !setDoc) {
            console.error("Firestore not initialized");
            return;
        }
        const userRef = doc(db, "users", currentUserEmail);
        await setDoc(userRef, {
            name: currentUserName,
            level: st.level,
            score: st.score,
            lives: st.lives,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        console.log("✅ Progress saved to cloud!");
    } catch (e) {
        console.error("❌ Cloud save error:", e);
    }
}

async function loadProgressFromCloud() {
    if (!currentUserEmail || currentUserEmail.startsWith('guest_')) {
        console.log("Guest user, skipping cloud load");
        return null;
    }
    try {
        const db = window.firebaseDb;
        const doc = window.firebaseDoc;
        const getDoc = window.firebaseGetDoc;
        if (!db || !doc || !getDoc) {
            console.error("Firestore not initialized");
            return null;
        }
        const userRef = doc(db, "users", currentUserEmail);
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            console.log("✅ Cloud data loaded:", data);
            return { level: data.level, score: data.score, lives: data.lives || 3 };
        } else {
            console.log("No cloud data found for this user");
            return null;
        }
    } catch (e) {
        console.error("❌ Cloud load error:", e);
        return null;
    }
}

// ===== AUDIO =====
let soundEnabled = localStorage.getItem('cm_sound') !== 'off';
let musicEnabled = localStorage.getItem('cm_music') !== 'off';
let musicNodes = [], musicInterval = null, musicPlaying = false;
const MUSIC_THEMES = [{ melody:[523,659,784,1047,784,659,523,440,523,659,784,880], bass:[131,131,131,131,165,165,131,131,131,165,165,131], tempo:300, name:'Candy' }];
const BOSS_MUSIC = { melody:[220,247,262,220,196,220,247,220], bass:[55,55,55,55,55,55,55,55], tempo:200 };
function startMusic(themeId) {
  if (!musicEnabled) return;
  stopMusic();
  const isBoss = themeId === -1 || (st && st.isBossActive);
  const theme = isBoss ? BOSS_MUSIC : MUSIC_THEMES[0];
  let noteIdx = 0;
  musicPlaying = true;
  function playNote() {
    if (!musicPlaying || !musicEnabled) return;
    try {
      const ac = getAC();
      const mFreq = theme.melody[noteIdx % theme.melody.length];
      const mo = ac.createOscillator(), mg = ac.createGain();
      mo.connect(mg); mg.connect(ac.destination);
      mo.type = 'sine';
      mo.frequency.setValueAtTime(mFreq, ac.currentTime);
      mg.gain.setValueAtTime(0.08, ac.currentTime);
      mg.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + theme.tempo/1200);
      mo.start(ac.currentTime); mo.stop(ac.currentTime + theme.tempo/1000);
      musicNodes.push(mo, mg);
      if (noteIdx % 2 === 0) {
        const bo = ac.createOscillator(), bg = ac.createGain();
        bo.connect(bg); bg.connect(ac.destination);
        bo.type = 'triangle';
        bo.frequency.setValueAtTime(theme.bass[noteIdx % theme.bass.length], ac.currentTime);
        bg.gain.setValueAtTime(0.06, ac.currentTime);
        bg.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + theme.tempo/800);
        bo.start(ac.currentTime); bo.stop(ac.currentTime + theme.tempo/600);
        musicNodes.push(bo, bg);
      }
      noteIdx++;
      if (musicNodes.length > 40) musicNodes.splice(0,20);
    } catch(e) {}
  }
  playNote();
  musicInterval = setInterval(playNote, theme.tempo);
}
function stopMusic() { musicPlaying = false; if(musicInterval){ clearInterval(musicInterval); musicInterval=null; } musicNodes.forEach(n=>{ try{ n.stop(); n.disconnect(); }catch(e){} }); musicNodes=[]; }
function toggleMusic() { musicEnabled = !musicEnabled; localStorage.setItem('cm_music', musicEnabled?'on':'off'); const btn=document.getElementById('musicToggleBtn'); if(btn) btn.textContent = musicEnabled?'🎵':'🎵'; if(btn) btn.style.opacity = musicEnabled?'1':'0.35'; if(musicEnabled && st && st.running) startMusic(st.currentTheme?st.currentTheme.id:0); else stopMusic(); }
function toggleSound() { soundEnabled = !soundEnabled; localStorage.setItem('cm_sound', soundEnabled?'on':'off'); const btn=document.getElementById('soundToggleBtn'); if(btn) btn.textContent = soundEnabled?'🔊':'🔇'; if(soundEnabled) beep(800,'sine',0.1,0.2); }
function initSoundBtn() { const btn=document.getElementById('soundToggleBtn'); if(btn) btn.textContent = soundEnabled?'🔊':'🔇'; initMusicBtn(); }
function initMusicBtn() { const btn=document.getElementById('musicToggleBtn'); if(btn) btn.style.opacity = musicEnabled?'1':'0.35'; }
let AC;
function getAC() { if(!AC) AC = new (window.AudioContext||window.webkitAudioContext)(); return AC; }
function beep(f,t,d,v,dl=0) { if(!soundEnabled) return; try{ const ac=getAC(), o=ac.createOscillator(), g=ac.createGain(); o.connect(g); g.connect(ac.destination); o.type=t; o.frequency.setValueAtTime(f,ac.currentTime+dl); g.gain.setValueAtTime(v,ac.currentTime+dl); g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+dl+d); o.start(ac.currentTime+dl); o.stop(ac.currentTime+dl+d+0.05); }catch(e){} }
function sfxCatch() { beep(660,'sine',0.08,0.28); beep(880,'sine',0.07,0.22,0.06); }
function sfxWrong() { beep(180,'sawtooth',0.18,0.25); beep(140,'sawtooth',0.12,0.2,0.1); }
function sfxMiss() { beep(220,'sawtooth',0.12,0.18); }
function sfxLevelUp() { [523,659,784,1047].forEach((f,i)=>beep(f,'sine',0.12,0.28,i*0.1)); }
function sfxTaskDone() { [440,550,660,880,1100].forEach((f,i)=>beep(f,'triangle',0.14,0.3,i*0.08)); }
function sfxLife() { beep(880,'sine',0.12,0.32); beep(1100,'sine',0.1,0.28,0.12); beep(1320,'sine',0.09,0.22,0.22); }
function sfxBomb() { beep(80,'sawtooth',0.4,0.5); beep(60,'sawtooth',0.3,0.4,0.1); beep(40,'sine',0.5,0.3,0.2); }
function sfxCombo(n) { beep(440+n*80,'sine',0.1,0.3); beep(550+n*80,'sine',0.08,0.25,0.06); }
function sfxShield() { beep(300,'sine',0.08,0.22); beep(500,'sine',0.1,0.28,0.08); beep(800,'sine',0.12,0.3,0.16); beep(1100,'sine',0.1,0.25,0.24); }
function sfxBossWarning() { [200,170,140,110,80].forEach((f,i)=>beep(f,'sawtooth',0.22,0.3,i*0.1)); }
function sfxBossWin() { [523,659,784,1047,1318,1047,784,1047,1318,1568].forEach((f,i)=>beep(f,'sine',0.14,0.28,i*0.09)); }
function sfxSurprise() { [400,600,900,1200,1600,2000,2600].forEach((f,i)=>beep(f,'sine',0.18,0.32,i*0.08)); }
function sfxGameOver() { beep(300,'sawtooth',0.18,0.25); beep(250,'sawtooth',0.15,0.22,0.12); beep(200,'sawtooth',0.12,0.2,0.22); beep(150,'sine',0.3,0.18,0.32); }

// ===== BASKET SKINS =====
const BASKET_SKINS = [
  { name:'Candy', emoji:'🍬', b1:'#F0A060', b2:'#C8752A', b3:'#7A3A08', bt:'#FFD090', bm:'#E08830' },
  { name:'Space', emoji:'🚀', b1:'#2a2a7a', b2:'#1a1a5a', b3:'#0a0a3a', bt:'#4a4aff', bm:'#2a2aff' },
  { name:'Neon', emoji:'🌆', b1:'#FF1493', b2:'#FF00FF', b3:'#8A2BE2', bt:'#00FFFF', bm:'#FF00FF' },
  { name:'Golden', emoji:'👑', b1:'#FFD700', b2:'#FFA500', b3:'#FF8C00', bt:'#FFF0A0', bm:'#FFB347' }
];
let currentSkinIndex = 0;
function loadSkin() {
  const saved = localStorage.getItem('cm_basket_skin');
  if(saved !== null){
    currentSkinIndex = parseInt(saved);
    if(isNaN(currentSkinIndex)||currentSkinIndex<0||currentSkinIndex>=BASKET_SKINS.length) currentSkinIndex=0;
  }
  updateSkinButton();
}
function saveSkin() { localStorage.setItem('cm_basket_skin', currentSkinIndex); updateSkinButton(); }
function updateSkinButton() {
  const skinText = `🎨 ${BASKET_SKINS[currentSkinIndex].emoji} ${BASKET_SKINS[currentSkinIndex].name}`;
  // Update old button (if exists)
  const btn = document.getElementById('skinBtn');
  if (btn) btn.textContent = skinText;
  // Update new home page grid button
  const btn2 = document.getElementById('homeSkinBtn2');
  if (btn2) btn2.textContent = skinText;
  // Top bar skin button remains '🎨' to keep layout clean
}
function cycleSkin() {
  currentSkinIndex = (currentSkinIndex + 1) % BASKET_SKINS.length;
  saveSkin();
}
window.cycleSkin = cycleSkin;

// ===== CANVAS & GAME (FULL ORIGINAL LOGIC) =====
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
if(!CanvasRenderingContext2D.prototype.roundRect){
  CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r){
    if(w<2*r) r=w/2; if(h<2*r) r=h/2;
    this.moveTo(x+r,y); this.lineTo(x+w-r,y); this.quadraticCurveTo(x+w,y,x+w,y+r);
    this.lineTo(x+w,y+h-r); this.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    this.lineTo(x+r,y+h); this.quadraticCurveTo(x,y+h,x,y+h-r);
    this.lineTo(x,y+r); this.quadraticCurveTo(x,y,x+r,y);
    return this;
  };
}
const ALL_TYPES = [
  {shape:'lollipop',color:'#FF4DA6',color2:'#FF85C8',stroke:'#CC0066',pts:15,name:'lollipop'},
  {shape:'round',color:'#FF5533',color2:'#FF9980',stroke:'#CC2200',pts:10,name:'round'},
  {shape:'star',color:'#FFD700',color2:'#FFF066',stroke:'#CC9900',pts:20,name:'star'},
  {shape:'heart',color:'#FF3366',color2:'#FF80A0',stroke:'#CC0033',pts:25,name:'heart'},
  {shape:'wrapped',color:'#FF6090',color2:'#FFAACC',stroke:'#CC2060',pts:30,name:'wrapped'},
  {shape:'diamond',color:'#845EF7',color2:'#BBA0FF',stroke:'#5C3DCF',pts:15,name:'diamond'}
];
const BOMB_TYPE = {shape:'bomb',color:'#1a1a1a',color2:'#444',stroke:'#000',pts:0,name:'bomb'};
function getBombChance(lvl){ if(lvl<20) return 0; if(lvl<100) return 0.03; if(lvl<500) return 0.05; return 0.07; }
const SHIELD_TYPE={shape:'shield',color:'#A855F7',color2:'#D09BFF',stroke:'#7C3AED',pts:0,name:'shield'};
const SHIELD_BASE_DURATION=720;
function getShieldChance(lvl){ if(lvl<10) return 0; if(lvl<100) return 0.004; if(lvl<500) return 0.007; return 0.01; }
function activateShield(){ st.shieldActive=true; st.shieldFrames=SHIELD_BASE_DURATION; st.shieldMaxFrames=SHIELD_BASE_DURATION; sfxShield(); updatePowerupHud(); }
let shakeFrames=0, shakeIntensity=0;
function triggerShake(intensity=8, frames=18){ shakeFrames=frames; shakeIntensity=intensity; }
const TASKS = [
  {desc:'Catch 10 Hearts ❤️', type:'heart', count:10}, {desc:'Catch 8 Stars ⭐', type:'star', count:8},
  {desc:'Catch 15 Round 🔴', type:'round', count:15}, {desc:'Catch 6 Diamonds 💎', type:'diamond', count:6},
  {desc:'Catch 12 Wrapped 🍬', type:'wrapped', count:12}, {desc:'Catch any 20 candies', type:'any', count:20},
  {desc:'Catch 10 Lollipops 🍭', type:'lollipop', count:10}, {desc:'Catch any 25 candies', type:'any', count:25},
  {desc:'Catch 15 Stars ⭐', type:'star', count:15}, {desc:'Catch 12 Hearts ❤️', type:'heart', count:12},
  {desc:'Catch 8 Diamonds 💎', type:'diamond', count:8}, {desc:'Catch 18 Round 🔴', type:'round', count:18}
];
function pickRandom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function getLevelMode(lvl){
  if(lvl<5) return {mode:'normal'};
  const t = lvl%20;
  if(t===0) return {mode:'selective', targetShape:pickRandom(['star','heart','diamond'])};
  if(t===10) return {mode:'selective', targetShape:pickRandom(['lollipop','wrapped','round'])};
  if(t===15 && lvl>100) return {mode:'selective', targetShape:pickRandom(['heart','star'])};
  if(t===5 && lvl>500) return {mode:'selective', targetShape:pickRandom(['diamond','wrapped'])};
  return {mode:'normal'};
}
function getModeLabel(s){ return {star:'⭐ Star', heart:'❤️ Heart', diamond:'💎 Diamond', lollipop:'🍭 Lollipop', wrapped:'🍬 Wrapped', round:'🔴 Round'}[s]||s; }
const THEMES = [
  {id:0,name:'Candy Kingdom',emoji:'👑', bg:['#060012','#120030','#200840'],star:'#FFB8FF', bar:['#FF4DA6','#FF8C00'],topBar:'linear-gradient(90deg,#0A001E,#1A0040)', desc:'Sweet candy royal world!'},
  {id:1,name:'Space',emoji:'🚀', bg:['#000008','#000520','#001040'],star:'#B4D2FF', bar:['#00BFFF','#845EF7'],topBar:'linear-gradient(90deg,#000010,#000838)', desc:'Candy rain among stars!'},
  {id:2,name:'Underwater',emoji:'🌊', bg:['#001828','#003050','#005878'],star:'#64E6FF', bar:['#00E0FF','#0088CC'],topBar:'linear-gradient(90deg,#001020,#002840)', desc:'Deep ocean candies!'},
  {id:3,name:'Forest',emoji:'🌿', bg:['#021008','#052018','#083828'],star:'#96FF96', bar:['#22C55E','#10D4AA'],topBar:'linear-gradient(90deg,#021008,#073020)', desc:'Cool forest shade!'},
  {id:4,name:'Desert',emoji:'🏜️', bg:['#1a0a00','#3d1a00','#5c2800'],star:'#FFC864', bar:['#FF8C00','#FFD700'],topBar:'linear-gradient(90deg,#1a0a00,#3d1a00)', desc:'Sandstorm candy shower!'},
  {id:5,name:'Ice World',emoji:'❄️', bg:['#001828','#002848','#004068'],star:'#B4E6FF', bar:['#A8D8FF','#00BFFF'],topBar:'linear-gradient(90deg,#001828,#003050)', desc:'Frozen crystal candies!'},
  {id:6,name:'Volcano',emoji:'🌋', bg:['#1a0000','#3d0500','#600800'],star:'#FF7832', bar:['#FF4444','#FF8C00'],topBar:'linear-gradient(90deg,#1a0000,#3d0500)', desc:'Hot lava candy rain!'},
  {id:7,name:'Neon City',emoji:'🌆', bg:['#000010','#050018','#080030'],star:'#FF00FF', bar:['#FF00FF','#00FFFF'],topBar:'linear-gradient(90deg,#000010,#050030)', desc:'Grand finale of 10,000 levels!'}
];
function getTheme(lvl){ const idx = Math.min(7, Math.floor((lvl-1)/1000)); return THEMES[idx]; }
function getLevelConfig(lvl){
  let speed; if(lvl<=1000) speed=1.6+lvl*0.0014; else speed=3.5;
  const interval = Math.max(45,80-lvl*0.02);
  let target;
  if(lvl<=10) target=8+lvl; else if(lvl<=50) target=18+Math.floor(lvl*0.5);
  else if(lvl<=100) target=43+Math.floor((lvl-50)*0.6); else if(lvl<=300) target=73+Math.floor((lvl-100)*0.4);
  else if(lvl<=500) target=153+Math.floor((lvl-300)*0.3); else if(lvl<=1000) target=213+Math.floor((lvl-500)*0.25);
  else if(lvl<=2000) target=338+Math.floor((lvl-1000)*0.2); else if(lvl<=5000) target=538+Math.floor((lvl-2000)*0.15);
  else if(lvl<=8000) target=988+Math.floor((lvl-5000)*0.1); else target=1288+Math.floor((lvl-8000)*0.07);
  return { speed, interval, target: Math.min(target,2000) };
}
let st = {
  running:false, score:0, lives:3, level:1,
  basket:{ x:gameW/2, w:86, h:26, y:gameH-52 },
  items:[], particles:[], floats:[], confetti:[],
  spawnTimer:0, spawnInterval:70, speed:2.0, frame:0,
  levelTarget:8, levelCaught:0,
  inTask:false, taskDef:null, taskCaught:0,
  levelMode:{ mode:'normal' },
  currentTheme:THEMES[0],
  combo:0, comboTimer:0,
  shieldActive:false, shieldFrames:0, shieldMaxFrames:0,
  levelCompleteTriggered:false
};
let isGamePaused = false;

function initLevel(lvl, score, lives){
  const cfg = getLevelConfig(lvl);
  const lm = getLevelMode(lvl);
  const th = getTheme(lvl);
  Object.assign(st, {
    score:score||0, lives:lives||3, level:lvl,
    items:[], particles:[], floats:[], confetti:[],
    spawnTimer:0, spawnInterval:cfg.interval, speed:cfg.speed, frame:0,
    levelTarget:cfg.target, levelCaught:0,
    inTask:false, taskDef:null, taskCaught:0, levelMode:lm,
    currentTheme:th, combo:0, comboTimer:0,
    shieldActive:false, shieldFrames:0, shieldMaxFrames:0,
    levelCompleteTriggered:false
  });
  shakeFrames=0; shakeIntensity=0;
  st.basket.x = gameW/2;
  st.basket.w = 86 * scaleX;
  st.basket.h = 26 * scaleY;
  st.basket.y = gameH - 52 * scaleY;
  applyTheme(th);
  updateModeTag(); updateHUD(); updateTaskHud();
}
function applyTheme(th){
  st.currentTheme=th;
  document.getElementById('topBar').style.background=th.topBar;
  document.body.style.background=th.bg[0];
  const tt=document.getElementById('themeTag');
  if(tt) tt.textContent=th.emoji+' '+th.name;
}
function updateModeTag(){
  const tag=document.getElementById('modeTag');
  if(st.levelMode.mode==='selective'){ tag.textContent='⚠️ Only '+getModeLabel(st.levelMode.targetShape)+'!'; tag.style.background='rgba(255,80,0,0.25)'; tag.style.color='#FF8C00'; }
  else{ tag.textContent=''; tag.style.background='transparent'; }
}
function updateHUD(){
  document.getElementById('sc').textContent=st.score.toLocaleString();
  document.getElementById('lv').textContent=st.level.toLocaleString();
  let h=''; for(let i=0;i<st.lives;i++) h+='❤️';
  document.getElementById('li').innerHTML=h||'🖤';
}
function updateTaskHud(){
  if(!st.taskDef){ document.getElementById('taskHudText').textContent=''; document.getElementById('taskHudFill').style.width='0%'; document.getElementById('taskHudPct').textContent=''; return; }
  const pct=Math.min(100,Math.round(st.taskCaught/st.taskDef.count*100));
  document.getElementById('taskHudText').textContent=st.taskDef.desc+' ';
  document.getElementById('taskHudFill').style.width=pct+'%';
  document.getElementById('taskHudPct').textContent=st.taskCaught+'/'+st.taskDef.count;
}
function showOv(id){
  const overlays = ['homeOv','levelOv','taskOv','celebOv','lbOv','themeOv','roadmapOv','dailyOv','bossOv','bossWinOv','goOv','settingsOv','helpOv','pauseOv'];
  overlays.forEach(s=>{ const el=document.getElementById(s); if(el) el.style.display='none'; });
  // CRITICAL FIX: Hide the new home page when showing an overlay popup
  const homePage = document.getElementById('homePageOv');
  if (homePage) homePage.style.display = 'none';
  if(id) document.getElementById(id).style.display='flex';
}
function startGame(resume, savedData) {
    try{ getAC().resume(); }catch(e){}
    let saved = savedData || loadProgress();
    if (resume && saved && saved.level > 1) {
        initLevel(saved.level, saved.score, saved.lives || 3);
    } else {
        initLevel(1, 0, 3);
    }
    hideHomePage();
    showOv(null);
    st.running = true;
    startMusic(st.currentTheme ? st.currentTheme.id : 0);
    requestAnimationFrame(gameLoop);
}
function nextLevel(){
  st.level++;
  initLevel(st.level, st.score, st.lives);
  startMusic(st.currentTheme?st.currentTheme.id:0);
  showOv(null);
  st.running=true;
  requestAnimationFrame(gameLoop);
}
function isBossLevel(lvl){ return lvl%100===0 && lvl>0; }
function onLevelComplete(){
  st.running = false;
  saveProgress();
  saveProgressToCloud();
  saveLB();
  sfxLevelUp();
  const prevTh = getTheme(st.level);
  const nextTh = getTheme(st.level+1);
  if(prevTh.id !== nextTh.id){ showThemeUnlock(nextTh); return; }
  if(isBossLevel(st.level+1)){ showBossIntro(st.level+1); return; }
  if(st.level%5===0 && !isBossLevel(st.level)){ showTask(); return; }
  if(st.level%50===0){ showCelebration(); return; }
  showLevelComplete();
}
function getBossData(lvl){
  const n = Math.floor(lvl/100);
  const bosses = [
    {name:'Sugar Demon', emoji:'👹', desc:'Looks sweet but dangerous!'},
    {name:'Candy Witch', emoji:'🧙‍♀️', desc:'Beware of magic candies!'},
    {name:'Choco Monster', emoji:'🍫', desc:'Devours everything!'},
    {name:'Lollipop King', emoji:'👑', desc:'His world is all lollipops!'},
    {name:'Bomb Master', emoji:'💣', desc:'King of bombs — be careful!'},
    {name:'Rainbow Beast', emoji:'🌈', desc:'Danger in every color!'},
    {name:'Ice Titan', emoji:'❄️', desc:'Cold heart, hot challenge!'},
    {name:'Fire Dragon', emoji:'🔥', desc:'Fast as fire!'},
    {name:'Thunder God', emoji:'⚡', desc:'Lightning speed!'},
    {name:'GRAND MASTER', emoji:'👾', desc:'Ultimate final boss!'}
  ];
  const b = bosses[(n-1)%bosses.length];
  return {...b, target:Math.min(50+n*5,200), bonusLives:Math.min(1+Math.floor(n/3),4), bonusScore:n*500};
}
function showBossIntro(bossLvl){
  sfxBossWarning(); const bd=getBossData(bossLvl);
  document.getElementById('bossEmoji').textContent=bd.emoji;
  document.getElementById('bossTitle').textContent='⚠️ BOSS LEVEL '+bossLvl+'!';
  document.getElementById('bossName').textContent=bd.name;
  document.getElementById('bossSub').innerHTML=bd.desc+'\n\n💣 More bombs!\n⚡ Speed boost!\n🎯 Target: '+bd.target+' candies\n\n🏆 Win: +'+bd.bonusLives+'❤️ +'+bd.bonusScore+' Score!';
  showOv('bossOv');
}
function startBossLevel(){
  const bossLvl=st.level+1; const bd=getBossData(bossLvl); const cfg=getLevelConfig(bossLvl);
  st.level=bossLvl;
  Object.assign(st,{
    items:[], particles:[], floats:[], confetti:[], spawnTimer:0,
    spawnInterval:Math.max(30,cfg.interval-15), speed:cfg.speed+0.8, frame:0,
    levelTarget:bd.target, levelCaught:0,
    inTask:false, taskDef:null, taskCaught:0, levelMode:{mode:'boss'},
    currentTheme:getTheme(bossLvl), isBossActive:true, bossData:bd, levelCompleteTriggered:false
  });
  st.basket.w = 86 * scaleX;
  st.basket.h = 26 * scaleY;
  st.basket.y = gameH - 52 * scaleY;
  st.basket.x = gameW/2;
  applyTheme(getTheme(bossLvl)); updateModeTag(); updateHUD(); updateTaskHud();
  startMusic(-1); showOv(null); st.running=true; requestAnimationFrame(gameLoop);
}
function onBossComplete(){
  st.running=false; sfxBossWin(); spawnConfetti();
  const bd=st.bossData||getBossData(st.level);
  st.lives=Math.min(st.lives+bd.bonusLives,5); st.score+=bd.bonusScore; st.isBossActive=false;
  updateHUD();
  saveProgress();
  saveProgressToCloud();
  saveLB();
  document.getElementById('bossWinEmoji').textContent='🏆';
  document.getElementById('bossWinTitle').textContent='BOSS DEFEATED! 🎉';
  document.getElementById('bossWinSub').innerHTML=bd.emoji+' '+bd.name+' defeated!\n\n+'+bd.bonusLives+'❤️ Lives!\n+'+bd.bonusScore.toLocaleString()+' Bonus!\n\nTotal: '+st.score.toLocaleString();
  showOv('bossWinOv');
}
function afterBossWin(){ showLevelComplete(); }
function showThemeUnlock(th){ sfxTheme(); spawnConfetti(); document.getElementById('themeEmoji').textContent=th.emoji; document.getElementById('themeTitle').textContent=th.emoji+' '+th.name+' Unlocked!'; document.getElementById('themeSub').innerHTML=th.desc+'\n\nLevel '+(st.level+1)+' to '+(st.level>0?Math.min(st.level+1000,10000):'1000')+'\n\nScore: '+st.score.toLocaleString()+'\n🎊 New World Unlocked!'; showOv('themeOv'); }
function enterNewTheme(){ if(st.level%5===0){ showTask(); return; } showLevelComplete(); }
function showTask(){ const td = TASKS[Math.floor(Math.random()*TASKS.length)]; st.taskDef=td; st.taskCaught=0; document.getElementById('taskDesc').textContent='👉 '+td.desc; document.getElementById('taskProg').textContent='0 / '+td.count; document.getElementById('taskFill').style.width='0%'; updateTaskHud(); showOv('taskOv'); }
function showLevelComplete(){
  const emoji = st.level>=9000?'👑':st.level>=7000?'🌟':st.level>=5000?'🏆':st.level>=3000?'💎':st.level>=1000?'🚀':st.level>=500?'⭐':st.level>=100?'🎊':'🎉';
  document.getElementById('lvEmoji').textContent=emoji;
  document.getElementById('lvTitle').textContent='Level '+st.level+' Complete!';
  document.getElementById('lvScore').textContent='Score: '+st.score.toLocaleString();
  const cfg=getLevelConfig(st.level+1);
  const lm=getLevelMode(st.level+1);
  let subText = 'Next target: <b style="color:#FFD700;">'+cfg.target+'</b> candies';
  if(lm.mode==='selective') subText += '<br>⚠️ Only <b style="color:#FF8C00;">'+getModeLabel(lm.targetShape)+'</b> allowed!<br>Wrong catch = -1 ❤️';
  else subText += '<br>💪 Just catch and win!';
  document.getElementById('lvSub').innerHTML = subText;
  showOv('levelOv');
}
function showCelebration(){
  sfxCeleb(); spawnConfetti(120); saveLB();
  const milestones = [[10000,'🌍 10,000 LEVELS! CANDY RAIN LEGEND! 👑'],[9000,'9,000! Only 1000 more!'],[8000,'8,000! Incredible!'],[7000,'7,000 Levels! Astonishing! 🌟'],[6000,'6,000! Unstoppable! 💫'],[5000,'5,000 Levels! Halfway to Legend! 🏆'],[4000,'4,000! Phenomenal!'],[3000,'3,000 Levels! Simply amazing! 💎'],[2000,'2,000! You cannot be stopped! 🚀'],[1000,'1,000 Levels! True Gamer! 🎮'],[500,'500! You are different! ⭐'],[200,'200! Well done! 🔥'],[100,'100 Levels! Real Player! 🎉'],[50,'First milestone! Congratulations! 🥳']];
  let msg='Awesome!';
  for(const[l,m] of milestones){ if(st.level>=l){ msg=m; break; } }
  const emoji=st.level>=9000?'👑':st.level>=5000?'🏆':st.level>=1000?'🚀':'🌟';
  document.getElementById('celebEmoji').textContent=emoji;
  document.getElementById('celebTitle').textContent='Level '+st.level.toLocaleString()+'!';
  document.getElementById('celebSub').innerHTML=msg+'\n\nScore: '+st.score.toLocaleString()+'\n💾 Progress Saved!';
  showOv('celebOv');
}
function afterCeleb(){ showLevelComplete(); }
function startTaskPlay(){
  try{ getAC().resume(); }catch(e){}
  showOv(null);
  st.inTask = true;
  st.taskCaught = 0;
  st.items = [];
  st.running = true;
  requestAnimationFrame(gameLoop);
}
function onTaskComplete(){
  st.running = false;
  sfxTaskDone(); sfxLife();
  st.lives = Math.min(st.lives + 1, 5);
  updateHUD();
  st.inTask = false;
  st.taskDef = null;
  updateTaskHud();
  document.getElementById('celebEmoji').textContent = '🎯';
  document.getElementById('celebTitle').textContent = 'Task Complete!';
  document.getElementById('celebSub').innerHTML = 'Excellent! +1 ❤️ Life gained!\nClick Continue to finish the level.';
  showOv('celebOv');
}
function endGame(isBomb){
  st.running=false; stopMusic();
  if(isBomb){
    sfxBomb(); triggerShake(18,35);
    for(let i=0;i<40;i++){ const a=Math.random()*Math.PI*2, spd=4+Math.random()*8; st.particles.push({ x:gameW/2, y:gameH/2, vx:Math.cos(a)*spd, vy:Math.sin(a)*spd-3, life:55, maxLife:55, color:i%3===0?'#FF4444':i%3===1?'#FF8C00':'#FFD700', r:4+Math.random()*7 }); }
    document.getElementById('goEmoji').textContent='💥';
    document.getElementById('goTitle').textContent='BOOM!';
    document.getElementById('goTitle').style.color='#FF4400';
    document.getElementById('goScore').textContent='Score: '+st.score.toLocaleString();
    document.getElementById('goSub').innerHTML='Bomb caught! You reached level '+st.level+'.\nSaved progress — you can continue!';
  } else {
    sfxGameOver();
    document.getElementById('goEmoji').textContent='💔';
    document.getElementById('goTitle').textContent='Game Over!';
    document.getElementById('goTitle').style.color='#FF4466';
    document.getElementById('goScore').textContent='Score: '+st.score.toLocaleString();
    document.getElementById('goSub').innerHTML='You reached level '+st.level+'.\nSaved progress — you can continue!';
  }
  saveProgress();
  saveProgressToCloud();
  saveLB();
  showOv('goOv');
}
function updatePowerupHud() {
  const hud = document.getElementById('powerupHud');
  const shud = document.getElementById('shieldHud');
  const sOn = st.shieldActive;
  if (hud) hud.style.display = sOn ? 'flex' : 'none';
  if (shud) {
    if (sOn) {
      shud.style.display = 'flex';
      const timerSpan = document.getElementById('shieldTimer');
      if (timerSpan) timerSpan.textContent = Math.ceil(st.shieldFrames / 60) + 's';
      const bar = document.getElementById('shieldBar');
      if (bar) {
        const pct = Math.max(0, (st.shieldFrames / st.shieldMaxFrames) * 100);
        bar.style.width = pct + '%';
      }
    } else {
      shud.style.display = 'none';
    }
  }
}
const SURPRISE_TYPES = [
  {shape:'gift', lives:2, color:'#FF4DA6', color2:'#FF85C8', stroke:'#CC0066', label:'+2❤️', pts:50},
  {shape:'gift', lives:3, color:'#FFD700', color2:'#FFF066', stroke:'#CC9900', label:'+3❤️', pts:80},
  {shape:'gift', lives:4, color:'#00E0FF', color2:'#AAFFFF', stroke:'#0088CC', label:'+4❤️', pts:120},
  {shape:'gift', lives:5, color:'#A855F7', color2:'#D09BFF', stroke:'#7C3AED', label:'+5❤️', pts:150}
];
function getSurpriseChance(lvl){ if(lvl<100) return 0; if(lvl<300) return 0.008; if(lvl<1000) return 0.012; if(lvl<3000) return 0.016; return 0.02; }
function pickSurpriseType(lvl){ const r=Math.random(); if(lvl>=5000 && r<0.25) return SURPRISE_TYPES[3]; if(lvl>=2000 && r<0.35) return SURPRISE_TYPES[2]; if(lvl>=500 && r<0.5) return SURPRISE_TYPES[1]; return SURPRISE_TYPES[0]; }
function spawnItem(){
  if(st.level>=20 && !st.inTask && Math.random()<getBombChance(st.level)){ st.items.push({ x:30*scaleX+Math.random()*(gameW-60*scaleX), y:-34*scaleY, type:BOMB_TYPE, size:20*scaleX+Math.random()*5*scaleX, wobble:Math.random()*Math.PI*2, speed:st.speed*0.85+Math.random()*0.5, rot:Math.random()*Math.PI*2, isBomb:true, isShield:false, isSurprise:false, fuseTimer:0, pulse:0 }); return; }
  if(st.level>=10 && !st.shieldActive && !st.inTask && Math.random()<getShieldChance(st.level)){ st.items.push({ x:30*scaleX+Math.random()*(gameW-60*scaleX), y:-34*scaleY, type:SHIELD_TYPE, size:22*scaleX, wobble:Math.random()*Math.PI*2, speed:Math.max(1.1,st.speed*0.5), rot:0, isShield:true, isBomb:false, isSurprise:false, pulse:0 }); return; }
  if(st.level>=100 && !st.inTask && Math.random()<getSurpriseChance(st.level)){ const stype=pickSurpriseType(st.level); st.items.push({ x:30*scaleX+Math.random()*(gameW-60*scaleX), y:-40*scaleY, type:stype, size:22*scaleX+Math.random()*6*scaleX, wobble:Math.random()*Math.PI*2, speed:Math.max(1.2,st.speed*0.6), rot:0, isSurprise:true, pulse:0 }); return; }
  let type; if(st.levelMode.mode==='selective') type=Math.random()<0.55? pickRandom(ALL_TYPES.filter(t=>t.name===st.levelMode.targetShape)): pickRandom(ALL_TYPES.filter(t=>t.name!==st.levelMode.targetShape)); else type=ALL_TYPES[Math.floor(Math.random()*ALL_TYPES.length)];
  st.items.push({ x:30*scaleX+Math.random()*(gameW-60*scaleX), y:-34*scaleY, type, size:16*scaleX+Math.random()*9*scaleX, wobble:Math.random()*Math.PI*2, speed:st.speed+Math.random()*0.9, rot:Math.random()*Math.PI*2, isSurprise:false });
}
function spawnConfetti(count=80){ const cols=['#FFD700','#FF4DA6','#00BFFF','#FF6090','#A855F7','#10D4AA','#F43F5E','#FFFFFF']; for(let i=0;i<count;i++) st.confetti.push({ x:Math.random()*gameW, y:-10-Math.random()*60, vx:(Math.random()-0.5)*3.5, vy:2+Math.random()*3.5, color:cols[Math.floor(Math.random()*cols.length)], size:5+Math.random()*8, rot:Math.random()*Math.PI, vrot:0.05+Math.random()*0.12, life:220 }); }
function addParticles(x,y,c1,c2){ for(let i=0;i<10;i++){ const a=Math.random()*Math.PI*2, spd=2+Math.random()*5; st.particles.push({ x,y, vx:Math.cos(a)*spd, vy:Math.sin(a)*spd-3, life:35, maxLife:35, color:Math.random()>0.5?c1:c2, r:3+Math.random()*5 }); } }
function addRedParticles(x,y){ for(let i=0;i<8;i++){ const a=Math.random()*Math.PI*2, spd=2+Math.random()*3; st.particles.push({ x,y, vx:Math.cos(a)*spd, vy:Math.sin(a)*spd-2, life:28, maxLife:28, color:'#FF2222', r:3+Math.random()*4 }); } }
function glow(c,b){ ctx.shadowColor=c; ctx.shadowBlur=b; }
function ng(){ ctx.shadowBlur=0; }
function drawLollipop(r,c1,c2,s){
  const sg=ctx.createLinearGradient(0,r,r*0.4,r*2.5); sg.addColorStop(0,'#D4956A'); sg.addColorStop(1,'#8B4513');
  ctx.strokeStyle=sg; ctx.lineWidth=3.5; ctx.beginPath(); ctx.moveTo(0,r*0.85); ctx.lineTo(r*0.45,r*2.5); ctx.stroke();
  glow(c1,22); const g=ctx.createRadialGradient(-r*0.3,-r*0.3,r*0.08,0,0,r);
  g.addColorStop(0,c2); g.addColorStop(0.5,c1); g.addColorStop(1,s);
  ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fillStyle=g; ctx.fill(); ng();
  ctx.strokeStyle=s; ctx.lineWidth=1.5; ctx.stroke();
  ctx.save(); ctx.clip(); ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=2.5;
  ctx.beginPath(); for(let a=0;a<Math.PI*2;a+=0.12){ const rr=r*(0.15+a/(Math.PI*2)*0.75); ctx.lineTo(Math.cos(a-Math.PI/2)*rr,Math.sin(a-Math.PI/2)*rr); }
  ctx.stroke(); ctx.restore();
  ctx.fillStyle='rgba(255,255,255,0.38)'; ctx.beginPath(); ctx.ellipse(-r*0.28,-r*0.3,r*0.22,r*0.13,-0.5,0,Math.PI*2); ctx.fill();
}
function drawRound(r,c1,c2,s){
  glow(c1,20); const g=ctx.createRadialGradient(-r*0.35,-r*0.35,r*0.05,0,0,r);
  g.addColorStop(0,c2); g.addColorStop(0.55,c1); g.addColorStop(1,s);
  ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fillStyle=g; ctx.fill(); ng();
  ctx.strokeStyle=s; ctx.lineWidth=1.8; ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.clip();
  ctx.strokeStyle='rgba(255,255,255,0.26)'; ctx.lineWidth=r*0.55;
  ctx.beginPath(); ctx.moveTo(-r,r*0.25); ctx.lineTo(r,-r*0.25); ctx.stroke(); ctx.restore();
  ctx.fillStyle='rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(-r*0.27,-r*0.3,r*0.25,r*0.14,-0.4,0,Math.PI*2); ctx.fill();
}
function drawStar(r,c1,c2,s){
  glow(c1,20); ctx.beginPath();
  for(let i=0;i<10;i++){ const a=(i*Math.PI/5)-Math.PI/2, rad=i%2===0?r:r*0.42; i===0?ctx.moveTo(Math.cos(a)*rad,Math.sin(a)*rad):ctx.lineTo(Math.cos(a)*rad,Math.sin(a)*rad); }
  ctx.closePath(); const g=ctx.createRadialGradient(-r*0.2,-r*0.2,0,0,0,r);
  g.addColorStop(0,c2); g.addColorStop(0.5,c1); g.addColorStop(1,s);
  ctx.fillStyle=g; ctx.fill(); ng(); ctx.strokeStyle=s; ctx.lineWidth=1.5; ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(-r*0.22,-r*0.22,r*0.2,0,Math.PI*2); ctx.fill();
}
function drawHeart(r,c1,c2,s){
  glow(c1,22); ctx.beginPath();
  ctx.moveTo(0,r*0.28); ctx.bezierCurveTo(-r*0.95,-r*0.42,-r*1.38,r*0.52,0,r*1.05);
  ctx.bezierCurveTo(r*1.38,r*0.52,r*0.95,-r*0.42,0,r*0.28);
  const g=ctx.createRadialGradient(-r*0.3,-r*0.1,0,0,r*0.3,r*1.1);
  g.addColorStop(0,c2); g.addColorStop(0.5,c1); g.addColorStop(1,s);
  ctx.fillStyle=g; ctx.fill(); ng(); ctx.strokeStyle=s; ctx.lineWidth=1.5; ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.ellipse(-r*0.38,-r*0.05,r*0.2,r*0.12,-0.3,0,Math.PI*2); ctx.fill();
}
function drawWrapped(r,c1,c2,s){
  glow(c1,18); const g=ctx.createLinearGradient(-r,-r*0.6,r,r*0.6);
  g.addColorStop(0,c2); g.addColorStop(0.5,c1); g.addColorStop(1,s);
  ctx.beginPath(); ctx.roundRect(-r*1.15,-r*0.68,r*2.3,r*1.36,r*0.55);
  ctx.fillStyle=g; ctx.fill(); ng(); ctx.strokeStyle=s; ctx.lineWidth=2; ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=2;
  for(let i=-1;i<=1;i++){ ctx.beginPath(); ctx.moveTo(i*r*0.55 - r*0.22, -r*0.68); ctx.lineTo(i*r*0.55 + r*0.22, r*0.68); ctx.stroke(); }
  ctx.fillStyle=s;
  ctx.beginPath(); ctx.ellipse(-r*1.15,0,r*0.22,r*0.55,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(r*1.15,0,r*0.22,r*0.55,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.36)'; ctx.beginPath(); ctx.ellipse(-r*0.3,-r*0.22,r*0.35,r*0.13,-0.3,0,Math.PI*2); ctx.fill();
}
function drawDiamond(r,c1,c2,s){
  glow(c1,18); ctx.beginPath();
  ctx.moveTo(0,-r*1.3); ctx.lineTo(r*0.95,0); ctx.lineTo(0,r*1.3); ctx.lineTo(-r*0.95,0); ctx.closePath();
  const g=ctx.createLinearGradient(-r,-r,r,r);
  g.addColorStop(0,c2); g.addColorStop(0.5,c1); g.addColorStop(1,s);
  ctx.fillStyle=g; ctx.fill(); ng(); ctx.strokeStyle=s; ctx.lineWidth=1.5; ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,0.44)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(-r*0.3,-r*0.9); ctx.lineTo(r*0.4,-r*0.15); ctx.stroke();
}
function drawShieldItem(r,pulse){
  const p=Math.sin(pulse)*0.5+0.5;
  glow('#A855F7',16+p*14);
  ctx.strokeStyle=`rgba(168,85,247,${0.4+p*0.5})`;
  ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,r+7+p*4,0,Math.PI*2); ctx.stroke(); ng();
  ctx.beginPath();
  ctx.moveTo(0,-r);
  ctx.bezierCurveTo(r,-r,r,-r*0.2,r,0);
  ctx.bezierCurveTo(r,r*0.6,0,r*1.1,0,r*1.1);
  ctx.bezierCurveTo(0,r*1.1,-r,r*0.6,-r,0);
  ctx.bezierCurveTo(-r,-r*0.2,-r,-r,0,-r);
  const g=ctx.createLinearGradient(-r,-r,r,r);
  g.addColorStop(0,'#D09BFF'); g.addColorStop(0.5,'#A855F7'); g.addColorStop(1,'#5C3DCF');
  ctx.fillStyle=g;
  glow('#A855F7',12); ctx.fill(); ng();
  ctx.strokeStyle='#7C3AED'; ctx.lineWidth=2; ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.ellipse(-r*0.28,-r*0.3,r*0.28,r*0.16,-0.5,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.9)';
  ctx.font=`${Math.round(r*0.9)}px sans-serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('✦',0,r*0.08);
  glow('#A855F7',8);
  ctx.fillStyle='#D09BFF'; ctx.font=`bold ${Math.round(r*0.5)}px sans-serif`;
  ctx.fillText('SHIELD',0,r*1.75); ng();
}
function drawBombItem(r,fuseT){
  const sparkOn=Math.sin(fuseT*0.4)>0;
  ctx.strokeStyle='#8B6914'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(r*0.2,-r); ctx.bezierCurveTo(r*0.6,-r*1.5,r*0.8,-r*1.8,r*0.5,-r*2.2); ctx.stroke();
  if(sparkOn){
    glow('#FF8C00',12); ctx.fillStyle='#FFD700';
    ctx.beginPath(); ctx.arc(r*0.5,-r*2.2,r*0.22,0,Math.PI*2); ctx.fill(); ng();
  }
  glow('#FF2222',10+Math.sin(fuseT*0.3)*6);
  const g=ctx.createRadialGradient(-r*0.3,-r*0.3,r*0.05,0,0,r);
  g.addColorStop(0,'#444'); g.addColorStop(0.5,'#1a1a1a'); g.addColorStop(1,'#000');
  ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fillStyle=g; ctx.fill(); ng();
  ctx.strokeStyle='#333'; ctx.lineWidth=2; ctx.stroke();
  ctx.fillStyle='rgba(255,60,60,0.85)'; ctx.font=`bold ${Math.round(r*1.1)}px sans-serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('💣',0,0);
  glow('#FF2222',8); ctx.fillStyle='#FF4444'; ctx.font=`bold ${Math.round(r*0.55)}px sans-serif`;
  ctx.fillText('BOMB',0,r*1.7); ng();
}
function drawGiftBox(r,c1,c2,s,label,pulse){
  const glowSize=18+Math.sin(pulse)*8;
  glow(c1,glowSize);
  const g=ctx.createLinearGradient(-r,-r,r,r);
  g.addColorStop(0,c2); g.addColorStop(0.5,c1); g.addColorStop(1,s);
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.roundRect(-r,-r,r*2,r*2,r*0.22);
  ctx.fill(); ng();
  ctx.strokeStyle=s; ctx.lineWidth=2; ctx.stroke();
  ctx.fillStyle=c2; ctx.beginPath(); ctx.rect(-r,-r*0.18,r*2,r*0.36); ctx.fill();
  ctx.beginPath(); ctx.rect(-r*0.18,-r,r*0.36,r*2); ctx.fill();
  ctx.save(); ctx.translate(-r*0.18,-r*0.18); ctx.scale(0.7,0.7);
  ctx.fillStyle=c1; ctx.beginPath(); ctx.ellipse(-r*0.3,-r*0.3,r*0.35,r*0.2,-0.6,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(r*0.3,-r*0.3,r*0.35,r*0.2,0.6,0,Math.PI*2); ctx.fill();
  ctx.restore();
  ctx.fillStyle='rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.ellipse(-r*0.3,-r*0.3,r*0.32,r*0.18,-0.4,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#fff'; ctx.font=`bold ${Math.round(r*0.62)}px sans-serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  glow('#fff',10); ctx.fillText(label,0,r*1.7); ng();
}
function drawItem(item){
  const{x,y,type:t,size:r,rot}=item;
  ctx.save(); ctx.translate(x,y); ctx.rotate(rot);
  if(item.isBomb){
    const pulse=Math.sin((item.fuseTimer||0)*0.25)*0.5+0.5;
    glow('#FF2222',14+pulse*12);
    ctx.strokeStyle=`rgba(255,50,50,${0.4+pulse*0.4})`;
    ctx.lineWidth=2.5; ctx.beginPath(); ctx.arc(0,0,r+6,0,Math.PI*2); ctx.stroke(); ng();
  } else if(item.isShield){
    item.pulse=(item.pulse||0)+0.1;
    const p=Math.sin(item.pulse)*0.5+0.5;
    glow('#A855F7',14+p*10);
    ctx.strokeStyle=`rgba(168,85,247,${0.4+p*0.4})`;
    ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,r+6,0,Math.PI*2); ctx.stroke(); ng();
  } else if(item.isSurprise){
    const p=Math.sin((item.pulse||0)*0.8)*0.5+0.5;
    glow('#FFD700',14+p*10);
    ctx.strokeStyle=`rgba(255,215,0,${0.4+p*0.4})`;
    ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,r+6,0,Math.PI*2); ctx.stroke(); ng();
  } else {
    if(st.levelMode.mode==='selective' && t.name===st.levelMode.targetShape){
      glow('#FFFFFF',14); ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.arc(0,0,r+5,0,Math.PI*2); ctx.stroke(); ng();
    }
    if(st.inTask && st.taskDef){
      const isTT=st.taskDef.type==='any'||t.name===st.taskDef.type;
      if(isTT){
        glow('#00FF88',18); ctx.strokeStyle='rgba(0,255,136,0.7)'; ctx.lineWidth=2.5;
        ctx.beginPath(); ctx.arc(0,0,r+6,0,Math.PI*2); ctx.stroke(); ng();
      } else {
        glow('#FF2222',10); ctx.strokeStyle='rgba(255,50,50,0.45)'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.arc(0,0,r+4,0,Math.PI*2); ctx.stroke(); ng();
      }
    }
  }
  switch(t.shape){
    case'lollipop': drawLollipop(r,t.color,t.color2,t.stroke); break;
    case'round': drawRound(r,t.color,t.color2,t.stroke); break;
    case'star': drawStar(r,t.color,t.color2,t.stroke); break;
    case'heart': drawHeart(r,t.color,t.color2,t.stroke); break;
    case'wrapped': drawWrapped(r,t.color,t.color2,t.stroke); break;
    case'diamond': drawDiamond(r,t.color,t.color2,t.stroke); break;
    case'shield': drawShieldItem(r,item.pulse||0); break;
    case'bomb': drawBombItem(r,item.fuseTimer||0); break;
    case'gift': drawGiftBox(r,t.color,t.color2,t.stroke,t.label,item.pulse||0); break;
  }
  ctx.restore();
}
function drawBasketWithSkin(bx,by,bw,bh){
  const skin = BASKET_SKINS[currentSkinIndex];
  ctx.save(); glow('#FF88AA',20); ctx.fillStyle='rgba(255,100,150,0.05)'; ctx.beginPath(); ctx.ellipse(bx,by+bh,bw*0.65,7,0,0,Math.PI*2); ctx.fill(); ng();
  const g = ctx.createLinearGradient(bx-bw/2, by, bx+bw/2, by+bh*2);
  g.addColorStop(0, skin.b1);
  g.addColorStop(0.4, skin.b2);
  g.addColorStop(1, skin.b3);
  ctx.fillStyle=g;
  ctx.strokeStyle=skin.b3;
  ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.moveTo(bx-bw/2, by); ctx.lineTo(bx-bw/2+8, by+bh); ctx.lineTo(bx+bw/2-8, by+bh); ctx.lineTo(bx+bw/2, by); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle='rgba(0,0,0,0.15)'; ctx.lineWidth=1.2;
  for(let i=1;i<4;i++){ const px=bx-bw/2+(bw/4)*i; ctx.beginPath(); ctx.moveTo(px,by); ctx.lineTo(px+3,by+bh); ctx.stroke(); }
  const rg=ctx.createLinearGradient(bx-bw/2, by, bx+bw/2, by);
  rg.addColorStop(0, skin.bt); rg.addColorStop(0.5, skin.bm); rg.addColorStop(1, skin.bt);
  ctx.fillStyle=rg; ctx.strokeStyle=skin.b3; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.roundRect(bx-bw/2-2, by-4, bw+4, 8, 3); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function drawBg(){
  const th=st.currentTheme||THEMES[0];
  const g=ctx.createLinearGradient(0,0,0,gameH);
  g.addColorStop(0,th.bg[0]); g.addColorStop(0.5,th.bg[1]); g.addColorStop(1,th.bg[2]);
  ctx.fillStyle=g; ctx.fillRect(0,0,gameW,gameH);
  const t=st.frame*0.013;
  for(let i=0;i<30;i++){
    const sx=(i*141.7+Math.sin(t+i)*18)%gameW, sy=(i*99.3+st.frame*0.05+i*3.5)%gameH;
    const br=0.03+0.03*Math.sin(st.frame*0.05+i);
    ctx.globalAlpha=br; ctx.fillStyle=th.star; ctx.beginPath(); ctx.arc(sx,sy,1+(i%3)*0.5,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=1;
  }
  if(st.levelMode.mode==='selective'){ ctx.fillStyle='rgba(255,60,0,0.04)'; ctx.fillRect(0,0,gameW,gameH); }
  if(st.isBossActive){ const pulse=Math.sin(st.frame*0.08)*0.04+0.06; ctx.fillStyle=`rgba(255,0,0,${pulse})`; ctx.fillRect(0,0,gameW,gameH); ctx.save(); ctx.fillStyle='rgba(255,80,0,0.85)'; ctx.font='bold 11px sans-serif'; ctx.textAlign='center'; glow('#FF4400',10); ctx.fillText('⚔️ BOSS: '+(st.bossData?st.bossData.emoji+' '+st.bossData.name:'BOSS'),gameW/2,gameH-12); ng(); ctx.restore(); }
}
function drawProgressBar(){
  const pct=Math.min(1,st.levelCaught/st.levelTarget);
  const th=st.currentTheme||THEMES[0];
  ctx.fillStyle='rgba(255,255,255,0.07)'; ctx.beginPath(); ctx.roundRect(10*scaleX,6*scaleY,gameW-20*scaleX,8*scaleY,4*scaleX); ctx.fill();
  const pg=ctx.createLinearGradient(10*scaleX,0,10*scaleX+(gameW-20*scaleX)*pct,0);
  if(st.isBossActive){ pg.addColorStop(0,'#FF4400'); pg.addColorStop(1,'#FF0000'); } else { pg.addColorStop(0,th.bar[0]); pg.addColorStop(1,th.bar[1]); }
  ctx.fillStyle=pg; ctx.beginPath(); ctx.roundRect(10*scaleX,6*scaleY,(gameW-20*scaleX)*pct,8*scaleY,4*scaleX); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.6)'; ctx.font=`bold ${9*scaleX}px sans-serif`; ctx.textAlign='right';
  ctx.fillText(st.levelCaught+'/'+st.levelTarget, gameW-12*scaleX, 15*scaleY);
}
function gameLoop(){
  if(!st.running) return;
  st.frame++;
  if(isGamePaused){
    requestAnimationFrame(gameLoop);
    return;
  }
  ctx.save();
  if(shakeFrames>0){ const sx=(Math.random()-0.5)*shakeIntensity; const sy=(Math.random()-0.5)*shakeIntensity; ctx.translate(sx,sy); shakeFrames--; shakeIntensity*=0.88; }
  ctx.clearRect(-20,-20,gameW+40,gameH+40); drawBg();
  if(st.shieldActive){ st.shieldFrames--; if(st.shieldFrames<=0) st.shieldActive=false; updatePowerupHud(); }
  if(st.comboTimer>0){ st.comboTimer--; if(st.comboTimer===0) st.combo=0; }
  st.spawnTimer++; if(st.spawnTimer>=st.spawnInterval){ spawnItem(); st.spawnTimer=0; }
  const {x:bx,y:by,w:bw,h:bh}=st.basket;
  st.items = st.items.filter(item=>{
    item.y+=item.speed; item.wobble+=0.028;
    if(item.isBomb){ item.fuseTimer=(item.fuseTimer||0)+1; item.rot+=0.03; }
    else if(item.isShield){ item.pulse=(item.pulse||0)+0.1; item.x+=Math.sin(item.wobble)*0.8; }
    else if(item.isSurprise){ item.pulse=(item.pulse||0)+0.12; item.x+=Math.sin(item.wobble)*1.2; }
    else{ item.rot+=0.015; item.x+=Math.sin(item.wobble)*1.8; }
    item.x=Math.max(item.size,Math.min(gameW-item.size,item.x));
    const caught = item.y>by-10 && item.y<by+bh+4 && item.x>bx-bw/2-item.size*0.6 && item.x<bx+bw/2+item.size*0.6;
    if(caught){
      if(item.isShield){ activateShield(); addParticles(item.x,by,'#A855F7','#D09BFF'); st.floats.push({x:item.x,y:by-20,color:'#A855F7',life:70,text:'🛡️ SHIELD! 12s',big:true}); return false; }
      if(item.isBomb){
        if(st.shieldActive){ sfxShield(); triggerShake(4,10); st.shieldActive=false; st.shieldFrames=0; updatePowerupHud(); addRedParticles(item.x,by); st.floats.push({x:item.x,y:by-20,color:'#A855F7',life:60,text:'🛡️ SHIELD SAVED!',big:true}); return false; }
        st.lives=0; updateHUD(); endGame(true); return false;
      }
      if(item.isSurprise){
        sfxSurprise(); const lives=item.type.lives, prevLives=st.lives; st.lives=Math.min(st.lives+lives,5); st.score+=item.type.pts; updateHUD();
        for(let i=0;i<25;i++){ const a=Math.random()*Math.PI*2, spd=3+Math.random()*6; st.particles.push({x:item.x,y:by, vx:Math.cos(a)*spd, vy:Math.sin(a)*spd-4, life:50, maxLife:50, color:i%2===0?item.type.color:item.type.color2, r:4+Math.random()*6 }); }
        const gained=st.lives-prevLives; st.floats.push({x:item.x,y:by-20,color:'#FFD700',life:80,text:'🎁 +'+gained+'❤️ SURPRISE!',big:true}); return false;
      }
      if(st.inTask && st.taskDef){
        const isTT = st.taskDef.type==='any'||item.type.name===st.taskDef.type;
        if(!isTT){ sfxWrong(); addRedParticles(item.x,by); triggerShake(5,12); st.floats.push({x:item.x,y:by-16,color:'#FF2222',life:45,text:'❌ Wrong!'}); st.combo=0; st.comboTimer=0; st.lives--; updateHUD(); if(st.lives<=0){ endGame(); return false; } return false; }
        sfxCatch(); addParticles(item.x,by,item.type.color,item.type.color2); st.combo++; st.comboTimer=90; const multi=Math.min(st.combo,5); const pts=item.type.pts*multi; if(multi>1) sfxCombo(multi); st.floats.push({x:item.x,y:by-16,color:multi>1?'#FFD700':item.type.color2,life:40,text:(multi>1?'x'+multi+' ':'')+'+'+pts}); st.score+=pts; st.taskCaught++; updateHUD(); updateTaskHud(); document.getElementById('taskFill').style.width=Math.min(100,Math.round(st.taskCaught/st.taskDef.count*100))+'%'; document.getElementById('taskProg').textContent=st.taskCaught+' / '+st.taskDef.count; if(st.taskCaught>=st.taskDef.count){ st.running=false; setTimeout(onTaskComplete,100); return false; } return false;
      }
      const isTarget = st.levelMode.mode==='normal' || (item.type.name===st.levelMode.targetShape);
      if(!isTarget){
        if(st.shieldActive){ sfxShield(); triggerShake(3,8); addRedParticles(item.x,by); st.floats.push({x:item.x,y:by-16,color:'#A855F7',life:45,text:'🛡️ Blocked!'}); st.combo=0; st.comboTimer=0; return false; }
        sfxWrong(); addRedParticles(item.x,by); triggerShake(5,12); st.floats.push({x:item.x,y:by-16,color:'#FF2222',life:45,text:'❌ Wrong!'}); st.combo=0; st.comboTimer=0; st.lives--; updateHUD(); if(st.lives<=0){ endGame(); return false; } return false;
      }
      st.combo++; st.comboTimer=90; const multi=Math.min(st.combo,5); const pts=item.type.pts*multi; if(multi>1) sfxCombo(multi); sfxCatch(); addParticles(item.x,by,item.type.color,item.type.color2); st.floats.push({x:item.x,y:by-16,color:multi>1?'#FFD700':item.type.color2,life:40,text:(multi>1?'x'+multi+' ':'')+'+'+pts,big:multi>=3}); st.score+=pts; st.levelCaught++; updateHUD();
      if(st.levelCaught >= st.levelTarget){
        if(st.levelCompleteTriggered) return false;
        st.levelCompleteTriggered = true;
        st.running = false;
        if(st.isBossActive) setTimeout(()=>onBossComplete(),100);
        else setTimeout(()=>onLevelComplete(),100);
        return false;
      }
      return false;
    }
    if(item.y>gameH+40){
      if(item.isBomb||item.isSurprise||item.isShield) return false;
      if(st.inTask && st.taskDef) return false;
      if(st.levelMode.mode==='normal'||(item.type.name===st.levelMode.targetShape)){
        if(st.shieldActive){ st.floats.push({x:Math.random()*gameW,y:gameH-80,color:'#A855F7',life:35,text:'🛡️'}); return false; }
        sfxMiss(); triggerShake(4,10); st.combo=0; st.comboTimer=0; st.lives--; updateHUD(); if(st.lives<=0){ endGame(); return false; }
      }
      return false;
    }
    drawItem(item);
    return true;
  });
  st.particles = st.particles.filter(p=>{ p.x+=p.vx; p.y+=p.vy; p.vy+=0.22; p.life--; ctx.save(); ctx.globalAlpha=p.life/p.maxLife; glow(p.color,8); ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.r*(p.life/p.maxLife),0,Math.PI*2); ctx.fill(); ng(); ctx.restore(); return p.life>0; });
  st.floats = st.floats.filter(f=>{ f.y-=1.3; f.life--; ctx.save(); const maxLife=f.big?80:45; ctx.globalAlpha=f.life/maxLife; glow(f.color,f.big?16:10); ctx.fillStyle=f.color; ctx.font=`bold ${f.big?18*scaleX:15*scaleX}px sans-serif`; ctx.textAlign='center'; ctx.fillText(f.text,f.x,f.y); ng(); ctx.restore(); return f.life>0; });
  st.confetti = st.confetti.filter(c=>{ c.x+=c.vx; c.y+=c.vy; c.vy+=0.04; c.rot+=c.vrot; c.life--; ctx.save(); ctx.globalAlpha=Math.min(1,c.life/30); ctx.translate(c.x,c.y); ctx.rotate(c.rot); ctx.fillStyle=c.color; ctx.fillRect(-c.size/2,-c.size/4,c.size,c.size/2); ctx.restore(); return c.life>0 && c.y<gameH+20; });
  if(st.combo>=2){ const multi=Math.min(st.combo,5); const colors=['','','#FFD700','#FF8C00','#FF4DA6','#FF00FF']; ctx.save(); ctx.globalAlpha=0.85; glow(colors[multi]||'#FFD700',12); ctx.fillStyle=colors[multi]||'#FFD700'; ctx.font=`bold ${13*scaleX}px sans-serif`; ctx.textAlign='left'; ctx.fillText('🔥 COMBO x'+multi,12*scaleX,gameH-16*scaleY); ng(); ctx.restore(); }
  drawProgressBar();
  if(st.shieldActive){ const pulse=Math.sin(st.frame*0.12)*0.4+0.6; ctx.save(); glow('#A855F7',16*pulse); ctx.strokeStyle=`rgba(168,85,247,${0.55*pulse})`; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(bx,by-10,st.basket.w*0.72+8,Math.PI,0,false); ctx.stroke(); ctx.strokeStyle=`rgba(168,85,247,${0.3*pulse})`; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(bx-st.basket.w*0.72-8,by-10); ctx.lineTo(bx-st.basket.w*0.72-8,by+st.basket.h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(bx+st.basket.w*0.72+8,by-10); ctx.lineTo(bx+st.basket.w*0.72+8,by+st.basket.h); ctx.stroke(); if(st.frame%4===0){ const angle=Math.random()*Math.PI; st.particles.push({ x:bx+Math.cos(angle)*(st.basket.w*0.72+8), y:by-10-Math.abs(Math.sin(angle))*25, vx:(Math.random()-0.5)*1.5, vy:-0.8-Math.random(), life:22, maxLife:22, color:'#D09BFF', r:2+Math.random()*2 }); } ng(); ctx.restore(); }
  drawBasketWithSkin(bx,by,bw,bh);
  ctx.restore();
  requestAnimationFrame(gameLoop);
}
// Attach input events
canvas.addEventListener('mousemove', e=>{ if(st.running) moveB(e.clientX); });
canvas.addEventListener('touchmove', e=>{ e.preventDefault(); if(st.running) moveB(e.touches[0].clientX); },{passive:false});
canvas.addEventListener('touchstart', e=>{ e.preventDefault(); if(st.running) moveB(e.touches[0].clientX); },{passive:false});

function togglePause(){
  if(!st.running) return;
  const pauseOv = document.getElementById('pauseOv');
  if(!isGamePaused){
    isGamePaused = true;
    if(pauseOv) pauseOv.style.display = 'flex';
  } else {
    isGamePaused = false;
    if(pauseOv) pauseOv.style.display = 'none';
  }
}
function showRoadmap() {
  showOv('roadmapOv');
  const saved = loadProgress();
  const curLevel = saved ? saved.level : 1;
  const curThemeId = getTheme(curLevel).id;
  const worlds = [
    {id:0, emoji:'👑', name:'Candy Kingdom', min:1, max:1000, color:'#FF4DA6'},
    {id:1, emoji:'🚀', name:'Space', min:1001, max:2000, color:'#00BFFF'},
    {id:2, emoji:'🌊', name:'Underwater', min:2001, max:3000, color:'#00E0FF'},
    {id:3, emoji:'🌿', name:'Forest', min:3001, max:4000, color:'#22C55E'},
    {id:4, emoji:'🏜️', name:'Desert', min:4001, max:5000, color:'#FF8C00'},
    {id:5, emoji:'❄️', name:'Ice World', min:5001, max:6000, color:'#A8D8FF'},
    {id:6, emoji:'🌋', name:'Volcano', min:6001, max:7000, color:'#FF4444'},
    {id:7, emoji:'🌆', name:'Neon City', min:7001, max:10000, color:'#FF00FF'}
  ];
  let html = '';
  worlds.forEach(w => {
    const isCurrent = curThemeId === w.id;
    const unlocked = curLevel >= w.min;
    const pct = unlocked ? Math.min(100, Math.round(((curLevel - w.min) / (w.max - w.min)) * 100)) : 0;
    html += `<div class="roadmap-world" style="border-left-color: ${w.color};">
      <div class="roadmap-header">
        <span class="roadmap-emoji">${w.emoji}</span>
        <div class="roadmap-name">${w.name}${isCurrent ? ' ▶ Current' : ''}</div>
        <div class="roadmap-range">${w.min}-${w.max}</div>
        <div style="font-size:12px; color:${unlocked ? w.color : '#aaa'};">${unlocked ? pct+'%' : '🔒'}</div>
      </div>
      ${unlocked ? `<div class="roadmap-progress-bar" style="height:4px; background:rgba(255,255,255,0.1); border-radius:2px; margin:6px 0;"><div style="width:${pct}%; height:100%; background:${w.color}; border-radius:2px;"></div></div>` : ''}
      ${isCurrent ? `<div class="roadmap-current">📍 You are here: Level ${curLevel}</div>` : ''}
    </div>`;
  });
  const totalPct = Math.round((curLevel/10000)*100);
  html += `<div style="background:rgba(255,215,0,0.08); border-radius:16px; padding:12px; margin-top:10px; text-align:center;">
    <div style="font-size:13px;">🌍 Overall Progress</div>
    <div style="height:6px; background:rgba(255,255,255,0.1); border-radius:3px; margin:8px 0;"><div style="width:${totalPct}%; height:100%; background:linear-gradient(90deg,#FFD700,#FF8C00); border-radius:3px;"></div></div>
    <div style="font-size:14px; font-weight:bold; color:#FFD700;">${curLevel.toLocaleString()} / 10,000 (${totalPct}%)</div>
    ${saved ? `<div style="font-size:11px;">Score: ${saved.score.toLocaleString()}</div>` : ''}
  </div>`;
  document.getElementById('roadmapContent').innerHTML = html;
}
function closeRoadmap() { showHomePage(); }

// ===== DAILY REWARD (FULLY FIXED) =====
const DAILY_KEY = 'cm_daily_v1';
const STREAK_KEY = 'cm_streak_v1';
const WHEEL_SEGMENTS = [
  {label:'+500', emoji:'⭐', color:'#FF4DA6', reward:{type:'pts',val:500}},
  {label:'+2 ❤️', emoji:'❤️', color:'#FF3366', reward:{type:'lives',val:2}},
  {label:'+1000', emoji:'💎', color:'#FFD700', reward:{type:'pts',val:1000}},
  {label:'🛡️', emoji:'🛡️', color:'#845EF7', reward:{type:'shield',val:1}},
  {label:'+3 ❤️', emoji:'💖', color:'#FF6EB4', reward:{type:'lives',val:3}},
  {label:'+200', emoji:'🍬', color:'#10D4AA', reward:{type:'pts',val:200}},
  {label:'JACKPOT!', emoji:'🏆', color:'#FF8C00', reward:{type:'jackpot',val:5000}}
];
let wheelAngle = 0, wheelSpinning = false;
function getDailyData() { try { return JSON.parse(localStorage.getItem(DAILY_KEY)||'null'); } catch { return null; } }
function setDailyData(d) { localStorage.setItem(DAILY_KEY, JSON.stringify(d)); }
function getStreak() { try { return JSON.parse(localStorage.getItem(STREAK_KEY)||'{streak:0,lastDate:""}'); } catch { return {streak:0,lastDate:""}; } }
function setStreak(d) { localStorage.setItem(STREAK_KEY, JSON.stringify(d)); }
function getTodayStr() { return new Date().toISOString().slice(0,10); }
function canClaimToday() { const d = getDailyData(); if(!d) return true; return d.lastClaim !== getTodayStr(); }
function checkDailyBadge() { const badge = document.getElementById('dailyBadge'); if(badge) badge.style.display = canClaimToday() ? 'block' : 'none'; }
function showDailyReward() {
  showOv('dailyOv');
  drawWheel(wheelAngle);
  renderStreak();
  const spinBtn = document.getElementById('spinBtnEl');
  const already = !canClaimToday();
  spinBtn.disabled = already;
  spinBtn.style.opacity = already ? '0.4' : '1';
  spinBtn.textContent = already ? 'Already Spun' : 'Spin Now';
  document.getElementById('spinCooldown').style.display = already ? 'block' : 'none';
  if(already) updateCooldownTimer();
}
let cooldownTimerInterval = null;
function updateCooldownTimer() {
  if(cooldownTimerInterval) clearInterval(cooldownTimerInterval);
  cooldownTimerInterval = setInterval(() => {
    const now = new Date();
    const tomorrow = new Date(); tomorrow.setHours(24,0,0,0);
    const diff = tomorrow - now;
    if(diff <= 0) { clearInterval(cooldownTimerInterval); document.getElementById('spinCooldown').style.display = 'none'; document.getElementById('spinBtnEl').disabled = false; document.getElementById('spinBtnEl').style.opacity = '1'; document.getElementById('spinBtnEl').textContent = 'Spin Now'; return; }
    const h = Math.floor(diff/3600000), m = Math.floor((diff%3600000)/60000), s = Math.floor((diff%60000)/1000);
    document.getElementById('cooldownTimer').textContent = `${h}h ${m}m ${s}s`;
  }, 1000);
}
function renderStreak() {
  const sd = getStreak(); const streak = sd.streak || 0;
  const row = document.getElementById('streakRow');
  const msg = document.getElementById('streakMsg');
  let html = '';
  for(let i=0;i<7;i++){ let cls = 'future'; if(i < streak%7) cls = 'done'; if(i === streak%7 && canClaimToday()) cls = 'today'; html += `<div class="streak-dot ${cls}">${cls==='done'?'✓':'🍬'}</div>`; }
  row.innerHTML = html;
  msg.textContent = streak === 0 ? 'Spin daily for rewards!' : `🔥 ${streak} day streak!`;
}
function drawWheel(angle) {
  const c = document.getElementById('wheelCanvas'); if(!c) return;
  const ctx = c.getContext('2d');
  const cx=110, cy=110, r=100;
  ctx.clearRect(0,0,220,220);
  const segAngle = (Math.PI*2)/WHEEL_SEGMENTS.length;
  for(let i=0; i<WHEEL_SEGMENTS.length; i++) {
    const seg = WHEEL_SEGMENTS[i];
    const start = angle + i*segAngle;
    const end = start + segAngle;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,start,end); ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    ctx.save();
    ctx.translate(cx+Math.cos(start+segAngle/2)*r*0.65, cy+Math.sin(start+segAngle/2)*r*0.65);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px "Segoe UI"';
    ctx.shadowBlur = 2;
    ctx.shadowColor = 'black';
    ctx.fillText(seg.emoji, -8, -8);
    ctx.font = 'bold 10px "Segoe UI"';
    ctx.fillStyle = '#FFD700';
    ctx.fillText(seg.label, -12, 6);
    ctx.restore();
  }
  ctx.beginPath(); ctx.arc(cx,cy,18,0,Math.PI*2);
  ctx.fillStyle = '#FFD700';
  ctx.fill();
  ctx.shadowBlur = 0;
}
function spinWheel() {
  if(wheelSpinning || !canClaimToday()) return;
  const winIdx = Math.floor(Math.random()*WHEEL_SEGMENTS.length);
  const spins = 5 + Math.random()*3;
  const targetAngle = spins*Math.PI*2 + (winIdx * (Math.PI*2/WHEEL_SEGMENTS.length));
  const startAngle = wheelAngle;
  const duration = 3000;
  const startTime = performance.now();
  wheelSpinning = true;
  function animate(now) {
    const t = Math.min((now-startTime)/duration,1);
    wheelAngle = startAngle + targetAngle * (1 - Math.pow(1-t,3));
    drawWheel(wheelAngle);
    if(t<1) requestAnimationFrame(animate);
    else { wheelSpinning = false; claimReward(WHEEL_SEGMENTS[winIdx]); }
  }
  requestAnimationFrame(animate);
}
function claimReward(seg) {
    setDailyData({lastClaim: getTodayStr()});
    const sd = getStreak();
    const today = getTodayStr();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let streak = sd.streak || 0;
    if (sd.lastDate === yesterday) streak++;
    else if (sd.lastDate !== today) streak = 1;
    setStreak({ streak, lastDate: today });

    let msg = '';
    switch (seg.reward.type) {
        case 'pts':
            st.score += seg.reward.val;
            updateHUD();
            msg = `+${seg.reward.val} Points!`;
            sfxCatch();
            break;
        case 'lives':
            st.lives = Math.min(st.lives + seg.reward.val, 5);
            updateHUD();
            msg = `+${seg.reward.val} Life!`;
            sfxLife();
            break;
        case 'shield':
            activateShield();
            msg = 'Shield Activated!';
            break;
        case 'jackpot':
            st.score += seg.reward.val;
            st.lives = Math.min(st.lives + 2, 5);
            updateHUD();
            msg = `JACKPOT! +${seg.reward.val} pts & +2❤️!`;
            sfxCeleb();
            spawnConfetti();
            break;
    }
    saveProgress();
    saveLB();

    const rewardEmoji = document.getElementById('rewardEmoji');
    const rewardText = document.getElementById('rewardText');
    const resultDiv = document.getElementById('rewardResult');
    if (rewardEmoji) rewardEmoji.textContent = seg.emoji;
    if (rewardText) rewardText.textContent = msg;
    if (resultDiv) resultDiv.style.display = 'block';
    setTimeout(() => {
        if (resultDiv) resultDiv.style.display = 'none';
    }, 3000);
    showDailyReward();
}

function closeDailyReward() { if(cooldownTimerInterval) clearInterval(cooldownTimerInterval); showHomePage(); }
function loadSettings() {
  const sound = localStorage.getItem('game_sound');
  const music = localStorage.getItem('game_music');
  const vib = localStorage.getItem('game_vibration');
  const pocket = localStorage.getItem('game_pocket');
  if(document.getElementById('setSound')) document.getElementById('setSound').checked = sound !== 'off';
  if(document.getElementById('setMusic')) document.getElementById('setMusic').checked = music !== 'off';
  if(document.getElementById('setVibration')) document.getElementById('setVibration').checked = vib === 'on';
  if(document.getElementById('setPocket')) document.getElementById('setPocket').checked = pocket !== 'off';
  soundEnabled = document.getElementById('setSound')?.checked ?? true;
  musicEnabled = document.getElementById('setMusic')?.checked ?? true;
  if(musicEnabled && st && st.running) startMusic(st.currentTheme?st.currentTheme.id:0); else stopMusic();
}
function saveSettings() {
  localStorage.setItem('game_sound', document.getElementById('setSound').checked ? 'on' : 'off');
  localStorage.setItem('game_music', document.getElementById('setMusic').checked ? 'on' : 'off');
  localStorage.setItem('game_vibration', document.getElementById('setVibration').checked ? 'on' : 'off');
  localStorage.setItem('game_pocket', document.getElementById('setPocket').checked ? 'on' : 'off');
  soundEnabled = document.getElementById('setSound').checked;
  musicEnabled = document.getElementById('setMusic').checked;
  if(musicEnabled && st && st.running) startMusic(st.currentTheme?st.currentTheme.id:0); else stopMusic();
}
function showSettings() { showOv('settingsOv'); }
function closeSettings() { saveSettings(); showHomePage(); }
function showHelp() { showOv('helpOv'); }
function exitGame() {
  document.body.classList.remove('game-active');
  
  // Stop the game loop
  if (typeof st !== 'undefined') {
    st.running = false;
  }
  stopMusic();
  
  // Hide any game overlays
  const overlays = ['levelOv','taskOv','celebOv','lbOv','themeOv','roadmapOv','dailyOv','bossOv','bossWinOv','goOv','settingsOv','helpOv','pauseOv'];
  overlays.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  
  // CRITICAL FIX: Do NOT clear session or logout.
  // Just go back to the home page (main menu) while staying logged in.
  showHomePage(currentUserName, currentUserEmail);
  
  // Optional: let user know
  alert("Game closed. You can start a new game or continue from the home page.");
}
// Global exports
window.startGame = startGame; window.nextLevel = nextLevel; window.startTaskPlay = startTaskPlay;
window.afterCeleb = afterCeleb; window.enterNewTheme = enterNewTheme; window.logout = logout;
window.guestLogin = guestLogin; window.showLeaderboard = showLeaderboard; window.closeLB = closeLB;
window.showRoadmap = showRoadmap; window.closeRoadmap = closeRoadmap; window.showDailyReward = showDailyReward;
window.closeDailyReward = closeDailyReward; window.spinWheel = spinWheel; window.cycleSkin = cycleSkin;
window.showSettings = showSettings; window.closeSettings = closeSettings; window.showHelp = showHelp;
window.togglePause = togglePause; window.toggleMusic = toggleMusic; window.toggleSound = toggleSound;
// ===== HOME PAGE BUTTONS - EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', () => {
    // Home page buttons
    const homeBtns = {
        'homeMusicBtn': toggleMusic,
        'homeSoundBtn': toggleSound,
        'homeSkinBtn': cycleSkin,
        'homeLogoutBtn': logout,
        'homeNewGameBtn': () => startGame(false),
        'homeContinueBtn': () => startGame(true),
        'homeLbBtn': showLeaderboard,
        'homeMapBtn': showRoadmap,
        'homeDailyBtn': showDailyReward,
        'homeSettingsBtn': showSettings,
        'homeSkinBtn2': cycleSkin,
        'homeHelpBtn': showHelp
    };
    Object.keys(homeBtns).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', homeBtns[id]);
    });

    // Google Login button (already has listener in module)
    // Guest Login
    const guestBtn = document.getElementById('guestLoginBtn');
    if (guestBtn) guestBtn.addEventListener('click', guestLogin);

    // Settings overlay buttons
    const settingsLogout = document.getElementById('settingsLogoutBtn');
    if (settingsLogout) settingsLogout.addEventListener('click', logout);
    const exitGameBtn = document.getElementById('exitGameBtn');
    if (exitGameBtn) exitGameBtn.addEventListener('click', exitGame);
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettings);

    // Help back
    const helpBack = document.getElementById('helpBackBtn');
    if (helpBack) helpBack.addEventListener('click', showHomePage);

    // Pause resume
    const resumeBtn = document.getElementById('resumeBtn');
    if (resumeBtn) resumeBtn.addEventListener('click', togglePause);

    // Level complete
    const nextLevelBtn = document.getElementById('nextLevelBtn');
    if (nextLevelBtn) nextLevelBtn.addEventListener('click', nextLevel);

    // Task
    const startTaskBtn = document.getElementById('startTaskBtn');
    if (startTaskBtn) startTaskBtn.addEventListener('click', startTaskPlay);

    // Celebration
    const celebContinue = document.getElementById('celebContinueBtn');
    if (celebContinue) celebContinue.addEventListener('click', afterCeleb);

    // Leaderboard
    const lbBack = document.getElementById('lbBackBtn');
    if (lbBack) lbBack.addEventListener('click', closeLB);

    // Roadmap
    const roadmapBack = document.getElementById('roadmapBackBtn');
    if (roadmapBack) roadmapBack.addEventListener('click', closeRoadmap);

    // Daily Reward
    const spinBtn = document.getElementById('spinBtnEl');
    if (spinBtn) spinBtn.addEventListener('click', spinWheel);
    const dailyBack = document.getElementById('dailyBackBtn');
    if (dailyBack) dailyBack.addEventListener('click', closeDailyReward);

    // Boss
    const bossFight = document.getElementById('bossFightBtn');
    if (bossFight) bossFight.addEventListener('click', startBossLevel);
    const bossWinContinue = document.getElementById('bossWinContinueBtn');
    if (bossWinContinue) bossWinContinue.addEventListener('click', afterBossWin);

    // Game Over
    const goContinue = document.getElementById('goContinueBtn');
    if (goContinue) goContinue.addEventListener('click', () => startGame(true));
    const goRestart = document.getElementById('goRestartBtn');
    if (goRestart) goRestart.addEventListener('click', () => startGame(false));

    // Theme
    const enterTheme = document.getElementById('enterThemeBtn');
    if (enterTheme) enterTheme.addEventListener('click', enterNewTheme);

    // Old home screen buttons (if needed)
    const oldNewGame = document.getElementById('oldNewGameBtn');
    if (oldNewGame) oldNewGame.addEventListener('click', () => startGame(false));
    const oldContinue = document.getElementById('oldContinueBtn');
    if (oldContinue) oldContinue.addEventListener('click', () => startGame(true));
    const oldLb = document.getElementById('oldLbBtn');
    if (oldLb) oldLb.addEventListener('click', showLeaderboard);
    const oldMap = document.getElementById('oldMapBtn');
    if (oldMap) oldMap.addEventListener('click', showRoadmap);
    const oldDaily = document.getElementById('oldDailyBtn');
    if (oldDaily) oldDaily.addEventListener('click', showDailyReward);
    const oldSkin = document.getElementById('oldSkinBtn');
    if (oldSkin) oldSkin.addEventListener('click', cycleSkin);
    const oldSettings = document.getElementById('oldSettingsBtn');
    if (oldSettings) oldSettings.addEventListener('click', showSettings);
    const oldHelp = document.getElementById('oldHelpBtn');
    if (oldHelp) oldHelp.addEventListener('click', showHelp);

    // Top bar buttons (game)
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) settingsBtn.addEventListener('click', showSettings);
    const musicToggleBtn = document.getElementById('musicToggleBtn');
    if (musicToggleBtn) musicToggleBtn.addEventListener('click', toggleMusic);
    const soundToggleBtn = document.getElementById('soundToggleBtn');
    if (soundToggleBtn) soundToggleBtn.addEventListener('click', toggleSound);
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) pauseBtn.addEventListener('click', togglePause);
});
