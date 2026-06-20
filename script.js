// ============================================
// CANDY MASS — COMPLETE GAME LOGIC
// Version: 3.0 (with Home Page)
// ============================================

// ============================================
// GLOBAL VARIABLES
// ============================================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let W, H;
let gameRunning = false;
let paused = false;
let animId = null;
let startTime = 0;

// Game State
let state = {
  score: 0,
  level: 1,
  lives: 3,
  maxLives: 5,
  combo: 0,
  maxCombo: 0,
  candies: [],
  bombs: [],
  particles: [],
  basket: { x: 0, y: 0, w: 80, h: 30, targetX: 0 },
  isBossLevel: false,
  boss: null,
  bossHealth: 0,
  bossMaxHealth: 0,
  shieldActive: false,
  shieldTimer: 0,
  task: null,
  taskProgress: 0,
  taskMax: 0,
  taskActive: false,
  theme: 'candy',
  themeName: 'Candy Kingdom',
  difficulty: 1,
  spawnRate: 60,
  candySpeed: 2,
};

// Settings
let settings = {
  sound: true,
  music: true,
  vibration: true,
  pocket: true,
};

// Audio Context (lazy load)
let audioCtx = null;

// Skins
const SKINS = ['candy', 'space', 'neon', 'golden'];
const SKIN_NAMES = ['🍬 Candy', '🚀 Space', '💜 Neon', '👑 Golden'];
let currentSkinIndex = 0;

// Firebase references (set by module)
let firebaseAuth = null;
let firebaseDb = null;
let firebaseDoc = null;
let firebaseSetDoc = null;
let firebaseGetDoc = null;

// Current user
let currentUser = null;

// ============================================
// DOM REFS
// ============================================
const $ = id => document.getElementById(id);
const sc = $('sc');
const lv = $('lv');
const li = $('li');
const userName = $('userName');
const themeTag = $('themeTag');
const taskHudText = $('taskHudText');
const taskHudFill = $('taskHudFill');
const taskHudPct = $('taskHudPct');
const modeTag = $('modeTag');
const shieldHud = $('shieldHud');
const shieldBar = $('shieldBar');
const shieldTimer = $('shieldTimer');

// ============================================
// CANVAS SETUP
// ============================================
function resizeCanvas() {
  const cw = $('cw');
  const rect = cw.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
  W = canvas.width;
  H = canvas.height;
  ctx.scale(1, 1);
  state.basket.x = W / 2 - state.basket.w / 2;
  state.basket.y = H - 60;
  state.basket.targetX = state.basket.x;
}
window.addEventListener('resize', resizeCanvas);

// ============================================
// HOME PAGE FUNCTIONS (NEW)
// ============================================
function showHomePage() {
  // Hide all overlays first
  document.querySelectorAll('.overlay').forEach(el => el.style.display = 'none');
  // Show home page
  const homePage = $('homePageOv');
  if (homePage) homePage.style.display = 'flex';
  // Hide game canvas elements if visible
  if (gameRunning) {
    gameRunning = false;
    if (animId) cancelAnimationFrame(animId);
  }
  console.log('🏠 Home page shown');
}

function hideHomePage() {
  const homePage = $('homePageOv');
  if (homePage) homePage.style.display = 'none';
  console.log('🏠 Home page hidden');
}

// ============================================
// AUTH / SESSION
// ============================================
const SESSION_KEY = 'cr_session_v4';
const USERS_KEY = 'cr_users_v2';

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch { return null; }
}

function setSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function getUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  } catch { return []; }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

// ============================================
// LOGIN FUNCTIONS
// ============================================
function guestLogin() {
  const guestId = 'guest_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
  const user = { name: 'Guest', email: guestId, via: 'guest', id: guestId };
  const users = getUsers();
  if (!users.find(u => u.email === guestId)) {
    users.push(user);
    saveUsers(users);
  }
  setSession(user);
  $('loginScreen').style.display = 'none';
  enterGame(user.name, user.email);
}

function logout() {
  // Clear session
  clearSession();
  // Sign out from Firebase
  if (firebaseAuth) {
    firebaseAuth.signOut().catch(() => {});
  }
  // Hide all overlays
  document.querySelectorAll('.overlay').forEach(el => el.style.display = 'none');
  // Show login screen
  $('loginScreen').style.display = 'flex';
  $('gameWrap').style.display = 'none';
  gameRunning = false;
  if (animId) cancelAnimationFrame(animId);
  console.log('👋 Logged out');
}

// ============================================
// ENTER GAME (Modified — Shows Home Page)
// ============================================
function enterGame(userNameText, userEmail) {
  currentUser = { name: userNameText, email: userEmail };
  userName.textContent = '👤 ' + userNameText;
  
  // Show game wrap
  $('gameWrap').style.display = 'flex';
  
  // Load settings
  loadSettings();
  
  // Load skin
  loadSkin();
  
  // Load progress from cloud or local
  loadProgressFromCloud(userEmail).then(() => {
    // After loading, show home page
    showHomePage();
    resizeCanvas();
  }).catch(() => {
    // If cloud fails, use local
    loadLocalProgress(userEmail);
    showHomePage();
    resizeCanvas();
  });
  
  console.log('🎮 Entered game as:', userNameText);
}

// ============================================
// START GAME (Called from Home Page buttons)
// ============================================
function startGame(useSaved = false) {
  // Hide home page
  hideHomePage();
  
  // If useSaved, load saved data
  if (useSaved) {
    const saved = getLocalSave(currentUser?.email);
    if (saved) {
      state.score = saved.score || 0;
      state.level = saved.level || 1;
      state.lives = saved.lives || 3;
    } else {
      // If no saved, start from scratch
      resetGame();
    }
  } else {
    resetGame();
  }
  
  // Start the game loop
  if (!gameRunning) {
    gameRunning = true;
    paused = false;
    updateHUD();
    if (animId) cancelAnimationFrame(animId);
    gameLoop();
  }
  
  console.log('🎮 Game started, Level:', state.level);
}

function resetGame() {
  state.score = 0;
  state.level = 1;
  state.lives = 3;
  state.combo = 0;
  state.maxCombo = 0;
  state.candies = [];
  state.bombs = [];
  state.particles = [];
  state.boss = null;
  state.bossHealth = 0;
  state.task = null;
  state.taskActive = false;
  state.shieldActive = false;
  state.shieldTimer = 0;
  state.difficulty = 1;
  state.spawnRate = 60;
  state.candySpeed = 2;
  updateHUD();
}

// ============================================
// SAVE / LOAD (Local + Cloud)
// ============================================
function getLocalSave(email) {
  try {
    const key = 'cr_save_v4_' + (email || 'guest');
    return JSON.parse(localStorage.getItem(key));
  } catch { return null; }
}

function saveLocalProgress(email) {
  try {
    const key = 'cr_save_v4_' + (email || 'guest');
    const data = {
      score: state.score,
      level: state.level,
      lives: state.lives,
      updatedAt: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) { console.warn('Save local failed:', e); }
}

function loadLocalProgress(email) {
  const data = getLocalSave(email);
  if (data) {
    state.score = data.score || 0;
    state.level = data.level || 1;
    state.lives = data.lives || 3;
    updateHUD();
  }
}

async function saveProgressToCloud(email) {
  if (!firebaseDb || !email) return;
  try {
    saveLocalProgress(email);
    const docRef = firebaseDoc(firebaseDb, 'users', email);
    await firebaseSetDoc(docRef, {
      name: currentUser?.name || 'Player',
      level: state.level,
      score: state.score,
      lives: state.lives,
      updatedAt: Date.now()
    }, { merge: true });
    console.log('☁️ Progress saved to cloud');
  } catch (e) {
    console.warn('Cloud save failed:', e);
  }
}

async function loadProgressFromCloud(email) {
  if (!firebaseDb || !email) return Promise.reject();
  try {
    const docRef = firebaseDoc(firebaseDb, 'users', email);
    const docSnap = await firebaseGetDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      state.score = data.score || 0;
      state.level = data.level || 1;
      state.lives = data.lives || 3;
      // Save to local backup
      saveLocalProgress(email);
      updateHUD();
      console.log('☁️ Loaded from cloud:', data);
      return Promise.resolve();
    } else {
      return Promise.reject();
    }
  } catch (e) {
    console.warn('Cloud load failed:', e);
    return Promise.reject();
  }
}

// ============================================
// HUD UPDATE
// ============================================
function updateHUD() {
  sc.textContent = state.score;
  lv.textContent = state.level;
  li.textContent = '❤️'.repeat(Math.min(state.lives, 5)) + '🖤'.repeat(Math.max(0, 5 - state.lives));
  themeTag.textContent = '👑 ' + state.themeName;
}

// ============================================
// SETTINGS
// ============================================
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('cm_settings') || '{}');
    settings.sound = s.sound !== undefined ? s.sound : true;
    settings.music = s.music !== undefined ? s.music : true;
    settings.vibration = s.vibration !== undefined ? s.vibration : true;
    settings.pocket = s.pocket !== undefined ? s.pocket : true;
    // Apply to checkboxes
    const setSound = $('setSound');
    const setMusic = $('setMusic');
    const setVibration = $('setVibration');
    const setPocket = $('setPocket');
    if (setSound) setSound.checked = settings.sound;
    if (setMusic) setMusic.checked = settings.music;
    if (setVibration) setVibration.checked = settings.vibration;
    if (setPocket) setPocket.checked = settings.pocket;
  } catch (e) { console.warn('Load settings failed:', e); }
}

function saveSettings() {
  try {
    localStorage.setItem('cm_settings', JSON.stringify(settings));
  } catch (e) { console.warn('Save settings failed:', e); }
}

function toggleMusic() {
  settings.music = !settings.music;
  saveSettings();
  const btn = document.querySelector('#homePageOv .home-top-bar button:nth-child(1)');
  if (btn) btn.textContent = settings.music ? '🎵' : '🔇';
  console.log('🎵 Music:', settings.music ? 'ON' : 'OFF');
}

function toggleSound() {
  settings.sound = !settings.sound;
  saveSettings();
  const btn = document.querySelector('#homePageOv .home-top-bar button:nth-child(2)');
  if (btn) btn.textContent = settings.sound ? '🔊' : '🔇';
  console.log('🔊 Sound:', settings.sound ? 'ON' : 'OFF');
}

function togglePause() {
  if (!gameRunning) return;
  paused = !paused;
  $('pauseOv').style.display = paused ? 'flex' : 'none';
  if (!paused) {
    startTime = Date.now();
    gameLoop();
  }
}

function closeSettings() {
  // Save settings from checkboxes
  const setSound = $('setSound');
  const setMusic = $('setMusic');
  const setVibration = $('setVibration');
  const setPocket = $('setPocket');
  if (setSound) settings.sound = setSound.checked;
  if (setMusic) settings.music = setMusic.checked;
  if (setVibration) settings.vibration = setVibration.checked;
  if (setPocket) settings.pocket = setPocket.checked;
  saveSettings();
  $('settingsOv').style.display = 'none';
}

function showSettings() {
  // Load current settings into checkboxes
  const setSound = $('setSound');
  const setMusic = $('setMusic');
  const setVibration = $('setVibration');
  const setPocket = $('setPocket');
  if (setSound) setSound.checked = settings.sound;
  if (setMusic) setMusic.checked = settings.music;
  if (setVibration) setVibration.checked = settings.vibration;
  if (setPocket) setPocket.checked = settings.pocket;
  $('settingsOv').style.display = 'flex';
}

function exitGame() {
  if (confirm('Are you sure you want to exit?')) {
    logout();
  }
}

// ============================================
// SKIN SYSTEM
// ============================================
function loadSkin() {
  try {
    const idx = parseInt(localStorage.getItem('cm_basket_skin') || '0');
    currentSkinIndex = Math.min(idx, SKINS.length - 1);
    state.theme = SKINS[currentSkinIndex];
    state.themeName = SKIN_NAMES[currentSkinIndex];
  } catch { currentSkinIndex = 0; }
}

function saveSkin() {
  localStorage.setItem('cm_basket_skin', String(currentSkinIndex));
}

function cycleSkin() {
  currentSkinIndex = (currentSkinIndex + 1) % SKINS.length;
  state.theme = SKINS[currentSkinIndex];
  state.themeName = SKIN_NAMES[currentSkinIndex];
  saveSkin();
  const skinBtn = document.querySelector('#homePageOv .icon-btn:nth-child(5)');
  if (skinBtn) skinBtn.textContent = '🎨 ' + state.themeName;
  console.log('🎨 Skin changed to:', state.themeName);
}

// ============================================
// OVERLAY HELPERS
// ============================================
function showOv(id) {
  document.querySelectorAll('.overlay').forEach(el => el.style.display = 'none');
  $(id).style.display = 'flex';
}

function showHelp() {
  $('helpOv').style.display = 'flex';
}

function showLeaderboard() {
  $('lbOv').style.display = 'flex';
  renderLeaderboard();
}

function closeLB() {
  $('lbOv').style.display = 'none';
}

function renderLeaderboard() {
  const content = $('lbContent');
  try {
    const data = JSON.parse(localStorage.getItem('cr_lb_v4') || '[]');
    if (data.length === 0) {
      content.innerHTML = '<div style="color:#888;padding:20px;">No scores yet. Play a game!</div>';
      return;
    }
    const sorted = data.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 100);
    let html = '';
    sorted.forEach((item, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`;
      html += `<div class="lb-row">
        <span class="lb-rank">${medal}</span>
        <span class="lb-name">${item.name || 'Anonymous'}</span>
        <span class="lb-score">${item.score || 0}</span>
        <span class="lb-lv">Lv.${item.level || 1}</span>
      </div>`;
    });
    content.innerHTML = html;
  } catch (e) {
    content.innerHTML = '<div style="color:#888;padding:20px;">Error loading leaderboard</div>';
  }
}

function showRoadmap() {
  $('roadmapOv').style.display = 'flex';
  renderRoadmap();
}

function closeRoadmap() {
  $('roadmapOv').style.display = 'none';
}

function renderRoadmap() {
  const content = $('roadmapContent');
  const worlds = [
    { emoji: '🍬', name: 'Candy Kingdom', start: 1, end: 1000 },
    { emoji: '🍭', name: 'Lollipop Forest', start: 1001, end: 2000 },
    { emoji: '🧁', name: 'Cupcake Valley', start: 2001, end: 3000 },
    { emoji: '🍫', name: 'Chocolate Cave', start: 3001, end: 4000 },
    { emoji: '🍩', name: 'Donut Sky', start: 4001, end: 5000 },
    { emoji: '🎂', name: 'Birthday Land', start: 5001, end: 6000 },
    { emoji: '🍪', name: 'Cookie Desert', start: 6001, end: 7000 },
    { emoji: '🍦', name: 'Ice Cream Peak', start: 7001, end: 8000 },
    { emoji: '🍇', name: 'Fruit Paradise', start: 8001, end: 9000 },
    { emoji: '👑', name: 'Candy Royal', start: 9001, end: 10000 },
  ];
  let html = '';
  const currentLevel = state.level || 1;
  worlds.forEach(w => {
    const isCurrent = currentLevel >= w.start && currentLevel <= w.end;
    html += `<div class="roadmap-world" style="${isCurrent ? 'border-color:#FF4DA6;background:rgba(255,77,166,0.1);' : ''}">
      <div class="roadmap-header">
        <span class="roadmap-emoji">${w.emoji}</span>
        <span class="roadmap-name">${w.name}</span>
        <span class="roadmap-range">${w.start}-${w.end}</span>
      </div>
      ${isCurrent ? `<div class="roadmap-current">📍 You are here (Level ${currentLevel})</div>` : ''}
    </div>`;
  });
  content.innerHTML = html;
}

function showDailyReward() {
  $('dailyOv').style.display = 'flex';
  initDailyReward();
}

function closeDailyReward() {
  $('dailyOv').style.display = 'none';
}

// ============================================
// DAILY REWARD SYSTEM
// ============================================
let wheelSpinning = false;

function initDailyReward() {
  const streak = getStreak();
  renderStreak(streak);
  const lastSpin = localStorage.getItem('cm_last_spin');
  const now = Date.now();
  const cooldown = 24 * 60 * 60 * 1000;
  const canSpin = !lastSpin || (now - parseInt(lastSpin) > cooldown);
  const spinBtn = $('spinBtnEl');
  if (spinBtn) {
    spinBtn.disabled = !canSpin || wheelSpinning;
    spinBtn.style.opacity = (canSpin && !wheelSpinning) ? '1' : '0.5';
  }
  const cooldownEl = $('spinCooldown');
  if (cooldownEl) {
    if (!canSpin && lastSpin) {
      const remaining = cooldown - (now - parseInt(lastSpin));
      const hours = Math.floor(remaining / (60 * 60 * 1000));
      const mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
      cooldownEl.textContent = `⏳ Next spin in ${hours}h ${mins}m`;
    } else {
      cooldownEl.textContent = '';
    }
  }
  drawWheel();
}

function getStreak() {
  const today = new Date().toDateString();
  const streakData = JSON.parse(localStorage.getItem('cm_streak') || '{"count":0,"lastDate":""}');
  if (streakData.lastDate === today) return streakData.count;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (streakData.lastDate === yesterday.toDateString()) {
    return streakData.count;
  }
  return 0;
}

function renderStreak(count) {
  const row = $('streakRow');
  if (!row) return;
  const today = new Date().toDateString();
  const streakData = JSON.parse(localStorage.getItem('cm_streak') || '{"count":0,"lastDate":""}');
  let html = '';
  for (let i = 0; i < 7; i++) {
    let cls = 'future';
    if (i < count) cls = 'done';
    if (i === count && streakData.lastDate === today) cls = 'done';
    if (i === count && streakData.lastDate !== today) cls = 'today';
    html += `<span class="streak-dot ${cls}">${i+1}</span>`;
  }
  row.innerHTML = html;
  const msg = $('streakMsg');
  if (msg) msg.textContent = `🔥 ${count} day streak!`;
}

function drawWheel() {
  const c = document.getElementById('wheelCanvas');
  if (!c) return;
  const ctxW = c.getContext('2d');
  const Ww = c.width, Hw = c.height;
  const cx = Ww/2, cy = Hw/2, r = Math.min(Ww, Hw)/2 - 10;
  const segments = [
    { label: '🍬 10', color: '#FF6B6B' },
    { label: '🍭 20', color: '#FFD93D' },
    { label: '💎 5', color: '#6BCB77' },
    { label: '🍬 15', color: '#4D96FF' },
    { label: '💀 0', color: '#FF6B6B' },
    { label: '🍭 25', color: '#FFD93D' },
    { label: '🍬 30', color: '#6BCB77' },
    { label: '💎 10', color: '#4D96FF' },
  ];
  const n = segments.length;
  const arc = (2 * Math.PI) / n;
  ctxW.clearRect(0, 0, Ww, Hw);
  for (let i = 0; i < n; i++) {
    const start = i * arc;
    const end = start + arc;
    ctxW.beginPath();
    ctxW.moveTo(cx, cy);
    ctxW.arc(cx, cy, r, start, end);
    ctxW.closePath();
    ctxW.fillStyle = segments[i].color;
    ctxW.fill();
    ctxW.strokeStyle = '#fff';
    ctxW.lineWidth = 2;
    ctxW.stroke();
    ctxW.save();
    ctxW.translate(cx, cy);
    ctxW.rotate(start + arc/2);
    ctxW.textAlign = 'center';
    ctxW.textBaseline = 'middle';
    ctxW.fillStyle = '#fff';
    ctxW.font = 'bold 14px sans-serif';
    ctxW.fillText(segments[i].label, r * 0.65, 0);
    ctxW.restore();
  }
  // Center circle
  ctxW.beginPath();
  ctxW.arc(cx, cy, 20, 0, 2 * Math.PI);
  ctxW.fillStyle = '#FFD700';
  ctxW.fill();
  ctxW.strokeStyle = '#fff';
  ctxW.lineWidth = 3;
  ctxW.stroke();
  ctxW.fillStyle = '#2A1000';
  ctxW.font = 'bold 16px sans-serif';
  ctxW.textAlign = 'center';
  ctxW.textBaseline = 'middle';
  ctxW.fillText('🎯', cx, cy);
}

function spinWheel() {
  if (wheelSpinning) return;
  const lastSpin = localStorage.getItem('cm_last_spin');
  const now = Date.now();
  const cooldown = 24 * 60 * 60 * 1000;
  if (lastSpin && (now - parseInt(lastSpin) < cooldown)) {
    alert('Come back tomorrow for your daily spin!');
    return;
  }
  wheelSpinning = true;
  const spinBtn = $('spinBtnEl');
  if (spinBtn) spinBtn.disabled = true;
  
  const c = document.getElementById('wheelCanvas');
  if (!c) return;
  const ctxW = c.getContext('2d');
  const cx = c.width/2, cy = c.height/2, r = Math.min(c.width, c.height)/2 - 10;
  const segments = [
    { label: '🍬 10', value: 10 },
    { label: '🍭 20', value: 20 },
    { label: '💎 5', value: 5 },
    { label: '🍬 15', value: 15 },
    { label: '💀 0', value: 0 },
    { label: '🍭 25', value: 25 },
    { label: '🍬 30', value: 30 },
    { label: '💎 10', value: 10 },
  ];
  const n = segments.length;
  const arc = (2 * Math.PI) / n;
  
  // Random spin
  const rand = Math.random();
  const winIndex = Math.floor(rand * n);
  const targetAngle = (2 * Math.PI) * 3 + (n - winIndex - 0.5) * arc;
  
  let currentAngle = 0;
  const duration = 3000;
  const startTimeSpin = Date.now();
  
  function animateSpin() {
    const elapsed = Date.now() - startTimeSpin;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const ease = 1 - Math.pow(1 - progress, 3);
    const angle = currentAngle + targetAngle * ease;
    
    ctxW.clearRect(0, 0, c.width, c.height);
    for (let i = 0; i < n; i++) {
      const start = i * arc + angle;
      const end = start + arc;
      ctxW.beginPath();
      ctxW.moveTo(cx, cy);
      ctxW.arc(cx, cy, r, start, end);
      ctxW.closePath();
      ctxW.fillStyle = segments[i].color;
      ctxW.fill();
      ctxW.strokeStyle = '#fff';
      ctxW.lineWidth = 2;
      ctxW.stroke();
      ctxW.save();
      ctxW.translate(cx, cy);
      ctxW.rotate(start + arc/2);
      ctxW.textAlign = 'center';
      ctxW.textBaseline = 'middle';
      ctxW.fillStyle = '#fff';
      ctxW.font = 'bold 14px sans-serif';
      ctxW.fillText(segments[i].label, r * 0.65, 0);
      ctxW.restore();
    }
    ctxW.beginPath();
    ctxW.arc(cx, cy, 20, 0, 2 * Math.PI);
    ctxW.fillStyle = '#FFD700';
    ctxW.fill();
    ctxW.strokeStyle = '#fff';
    ctxW.lineWidth = 3;
    ctxW.stroke();
    ctxW.fillStyle = '#2A1000';
    ctxW.font = 'bold 16px sans-serif';
    ctxW.textAlign = 'center';
    ctxW.textBaseline = 'middle';
    ctxW.fillText('🎯', cx, cy);
    
    if (progress < 1) {
      requestAnimationFrame(animateSpin);
    } else {
      // Done spinning
      wheelSpinning = false;
      if (spinBtn) spinBtn.disabled = false;
      // Claim reward
      const reward = segments[winIndex].value;
      const resultEl = $('rewardResult');
      if (reward > 0) {
        state.score += reward;
        updateHUD();
        saveLocalProgress(currentUser?.email);
        if (resultEl) {
          resultEl.innerHTML = `🎉 You won ${reward} points! Total: ${state.score}`;
          resultEl.style.color = '#FFD700';
        }
        // Update streak
        const today = new Date().toDateString();
        const streakData = JSON.parse(localStorage.getItem('cm_streak') || '{"count":0,"lastDate":""}');
        if (streakData.lastDate === today) {
          // Already claimed today
        } else {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          if (streakData.lastDate === yesterday.toDateString()) {
            streakData.count += 1;
          } else {
            streakData.count = 1;
          }
          streakData.lastDate = today;
          localStorage.setItem('cm_streak', JSON.stringify(streakData));
          renderStreak(streakData.count);
          const msg = $('streakMsg');
          if (msg) msg.textContent = `🔥 ${streakData.count} day streak!`;
        }
      } else {
        if (resultEl) {
          resultEl.innerHTML = '💀 Better luck tomorrow!';
          resultEl.style.color = '#FF6B6B';
        }
      }
      localStorage.setItem('cm_last_spin', String(Date.now()));
      const cooldownEl = $('spinCooldown');
      if (cooldownEl) cooldownEl.textContent = '⏳ Come back tomorrow!';
      drawWheel();
    }
  }
  animateSpin();
}

// ============================================
// GAME LOOP (Canvas)
// ============================================
function gameLoop() {
  if (!gameRunning || paused) {
    animId = requestAnimationFrame(gameLoop);
    return;
  }
  update();
  render();
  animId = requestAnimationFrame(gameLoop);
}

function update() {
  // Update shield timer
  if (state.shieldActive) {
    state.shieldTimer -= 1/60;
    if (state.shieldTimer <= 0) {
      state.shieldActive = false;
      shieldHud.style.display = 'none';
    } else {
      shieldBar.style.width = (state.shieldTimer / 12 * 100) + '%';
      shieldTimer.textContent = Math.ceil(state.shieldTimer) + 's';
    }
  }
  
  // Spawn candies
  if (Math.random() < 1 / state.spawnRate) {
    spawnCandy();
  }
  if (Math.random() < 1 / (state.spawnRate * 3)) {
    spawnBomb();
  }
  
  // Update candies
  for (let i = state.candies.length - 1; i >= 0; i--) {
    const c = state.candies[i];
    c.y += state.candySpeed + state.difficulty * 0.2;
    if (c.y > H + 20) {
      state.candies.splice(i, 1);
      continue;
    }
    // Check catch
    if (c.y + c.r > state.basket.y && c.y - c.r < state.basket.y + state.basket.h &&
        c.x > state.basket.x && c.x < state.basket.x + state.basket.w) {
      state.score += 10 + state.combo;
      state.combo++;
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;
      spawnParticles(c.x, c.y, '#FFD700', 10);
      state.candies.splice(i, 1);
      updateHUD();
      // Check task
      if (state.taskActive && state.task.type === 'collect') {
        state.taskProgress++;
        updateTaskHUD();
        if (state.taskProgress >= state.taskMax) {
          completeTask();
        }
      }
      continue;
    }
    // Check if passed
    if (c.y > state.basket.y + state.basket.h + 20) {
      state.candies.splice(i, 1);
    }
  }
  
  // Update bombs
  for (let i = state.bombs.length - 1; i >= 0; i--) {
    const b = state.bombs[i];
    b.y += state.candySpeed + state.difficulty * 0.2;
    if (b.y > H + 20) {
      state.bombs.splice(i, 1);
      continue;
    }
    // Check collision with basket
    if (b.y + b.r > state.basket.y && b.y - b.r < state.basket.y + state.basket.h &&
        b.x > state.basket.x && b.x < state.basket.x + state.basket.w) {
      if (state.shieldActive) {
        // Shield absorbs
        state.shieldActive = false;
        shieldHud.style.display = 'none';
        spawnParticles(b.x, b.y, '#A855F7', 15);
        state.bombs.splice(i, 1);
        continue;
      }
      // Hit!
      state.lives--;
      state.combo = 0;
      spawnParticles(b.x, b.y, '#FF0000', 20);
      state.bombs.splice(i, 1);
      updateHUD();
      if (state.lives <= 0) {
        gameOver();
        return;
      }
      // Vibrate
      if (settings.vibration && navigator.vibrate) {
        navigator.vibrate(100);
      }
      continue;
    }
    if (b.y > state.basket.y + state.basket.h + 20) {
      state.bombs.splice(i, 1);
    }
  }
  
  // Update particles
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1;
    p.life -= 0.02;
    if (p.life <= 0) {
      state.particles.splice(i, 1);
    }
  }
  
  // Basket follow
  state.basket.x += (state.basket.targetX - state.basket.x) * 0.2;
}

function render() {
  ctx.clearRect(0, 0, W, H);
  
  // Draw background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0A001E');
  grad.addColorStop(0.5, '#1A0040');
  grad.addColorStop(1, '#0D0030');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  
  // Draw candies
  state.candies.forEach(c => {
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, 2 * Math.PI);
    ctx.fillStyle = c.color;
    ctx.fill();
    ctx.shadowBlur = 0;
    // Emoji on candy
    ctx.font = `${c.r * 1.2}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.emoji, c.x, c.y);
  });
  
  // Draw bombs
  state.bombs.forEach(b => {
    ctx.shadowColor = '#FF0000';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, 2 * Math.PI);
    ctx.fillStyle = '#2A0000';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `${b.r * 1.2}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💣', b.x, b.y);
  });
  
  // Draw particles
  state.particles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, 2 * Math.PI);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  });
  
  // Draw basket
  ctx.shadowColor = '#FFD700';
  ctx.shadowBlur = 20;
  const bx = state.basket.x;
  const by = state.basket.y;
  const bw = state.basket.w;
  const bh = state.basket.h;
  // Basket body
  ctx.fillStyle = '#845EF7';
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 8);
  ctx.fill();
  ctx.fillStyle = '#5C3DCF';
  ctx.beginPath();
  ctx.roundRect(bx + 5, by - 4, bw - 10, 8, 4);
  ctx.fill();
  ctx.shadowBlur = 0;
  // Basket emoji
  ctx.font = '24px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🧺', bx + bw/2, by + bh/2);
  
  // Draw shield if active
  if (state.shieldActive) {
    ctx.strokeStyle = '#A855F7';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#A855F7';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(bx + bw/2, by + bh/2, 35, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

function spawnCandy() {
  const emojis = ['🍬', '🍭', '🧁', '🍫', '🍩', '🍪', '🍦', '🍇'];
  const colors = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF4DA6', '#845EF7'];
  const x = 30 + Math.random() * (W - 60);
  const r = 20 + Math.random() * 10;
  state.candies.push({
    x: x,
    y: -20,
    r: r,
    color: colors[Math.floor(Math.random() * colors.length)],
    emoji: emojis[Math.floor(Math.random() * emojis.length)]
  });
}

function spawnBomb() {
  const x = 30 + Math.random() * (W - 60);
  state.bombs.push({
    x: x,
    y: -20,
    r: 18 + Math.random() * 8
  });
}

function spawnParticles(x, y, color, count = 10) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * 2 * Math.PI;
    const speed = 2 + Math.random() * 4;
    state.particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      size: 3 + Math.random() * 4,
      color: color,
      life: 0.6 + Math.random() * 0.4
    });
  }
}

function completeTask() {
  state.taskActive = false;
  state.score += 50;
  updateHUD();
  spawnParticles(W/2, H/2, '#FFD700', 30);
  // Show celebration
  $('celebOv').style.display = 'flex';
  $('celebEmoji').textContent = '🎯';
  $('celebTitle').textContent = 'Task Complete! +50 pts';
  $('celebSub').textContent = 'Keep going!';
}

function updateTaskHUD() {
  if (state.taskActive) {
    taskHudText.textContent = state.task.label || 'Task';
    const pct = Math.min((state.taskProgress / state.taskMax) * 100, 100);
    taskHudFill.style.width = pct + '%';
    taskHudPct.textContent = Math.round(pct) + '%';
    taskHudFill.style.display = 'block';
  } else {
    taskHudFill.style.width = '0%';
    taskHudFill.style.display = 'none';
  }
}

function gameOver() {
  gameRunning = false;
  if (animId) cancelAnimationFrame(animId);
  // Save score to leaderboard
  saveToLeaderboard(currentUser?.name || 'Player', state.score, state.level);
  // Show game over overlay
  $('goOv').style.display = 'flex';
  $('goEmoji').textContent = '💔';
  $('goTitle').textContent = 'Game Over!';
  $('goScore').textContent = 'Score: ' + state.score;
  $('goSub').textContent = 'Level: ' + state.level + ' | Best Combo: ' + state.maxCombo;
  // Vibrate
  if (settings.vibration && navigator.vibrate) {
    navigator.vibrate([100, 50, 100]);
  }
}

function saveToLeaderboard(name, score, level) {
  try {
    const data = JSON.parse(localStorage.getItem('cr_lb_v4') || '[]');
    data.push({ name: name, score: score, level: level, date: Date.now() });
    // Sort and keep top 100
    const sorted = data.sort((a, b) => b.score - a.score).slice(0, 100);
    localStorage.setItem('cr_lb_v4', JSON.stringify(sorted));
  } catch (e) { console.warn('Leaderboard save failed:', e); }
}

function afterCeleb() {
  $('celebOv').style.display = 'none';
  // Check if level complete
  checkLevelComplete();
}

function checkLevelComplete() {
  // Simple level up: every 100 points or every 10 candies collected
  // For now, level up based on score thresholds
  const target = state.level * 100;
  if (state.score >= target) {
    levelUp();
  }
}

function levelUp() {
  state.level++;
  state.difficulty = Math.min(10, 1 + Math.floor(state.level / 10));
  state.spawnRate = Math.max(20, 60 - state.level * 2);
  state.candySpeed = Math.min(5, 2 + state.level * 0.1);
  // Show level complete overlay
  $('levelOv').style.display = 'flex';
  $('lvEmoji').textContent = '🎉';
  $('lvTitle').textContent = 'Level ' + (state.level - 1) + ' Complete!';
  $('lvScore').textContent = 'Score: ' + state.score;
  $('lvSub').textContent = 'Next: Level ' + state.level;
  // Save progress
  saveProgressToCloud(currentUser?.email);
  updateHUD();
}

function nextLevel() {
  $('levelOv').style.display = 'none';
  // Resume game
  if (!gameRunning) {
    gameRunning = true;
    gameLoop();
  }
}

// ============================================
// TOUCH / MOUSE CONTROLS
// ============================================
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const touch = e.touches[0];
  const x = (touch.clientX - rect.left) / rect.width * W;
  state.basket.targetX = x - state.basket.w / 2;
});

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const touch = e.touches[0];
  const x = (touch.clientX - rect.left) / rect.width * W;
  state.basket.targetX = x - state.basket.w / 2;
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * W;
  if (x >= 0 && x <= W) {
    state.basket.targetX = x - state.basket.w / 2;
  }
});

// ============================================
// POLYFILL FOR roundRect
// ============================================
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radii) {
    const r = typeof radii === 'number' ? radii : (radii || 0);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    return this;
  };
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
  if (e.key === 'p' || e.key === 'P') togglePause();
  if (e.key === 'm' || e.key === 'M') toggleMusic();
});

// ============================================
// WINDOW LOAD — CHECK SESSION
// ============================================
window.addEventListener('load', () => {
  const session = getSession();
  if (session) {
    // User is logged in, show game wrap and home page
    $('loginScreen').style.display = 'none';
    $('gameWrap').style.display = 'flex';
    currentUser = { name: session.name, email: session.email };
    userName.textContent = '👤 ' + session.name;
    loadSettings();
    loadSkin();
    // Load progress from cloud
    loadProgressFromCloud(session.email).then(() => {
      showHomePage();
      resizeCanvas();
    }).catch(() => {
      loadLocalProgress(session.email);
      showHomePage();
      resizeCanvas();
    });
    console.log('🔐 Auto-login:', session.name);
  } else {
    // Show login screen
    $('loginScreen').style.display = 'flex';
  }
});

// ============================================
// SAVE INTERVAL (Auto-save every 30 seconds)
// ============================================
setInterval(() => {
  if (currentUser?.email && gameRunning) {
    saveProgressToCloud(currentUser.email);
  }
}, 30000);

console.log('🍬 Candy Mass v3.0 loaded!');
console.log('🏠 Home Page integration complete!');
