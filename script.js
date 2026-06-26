
// ============================================================
// ===== CANDY MASS - FINAL VERSION =====
// ===== CSS Candy System + Original Smooth Flow =====
// ============================================================

// ===== RESPONSIVE SCALING =====
const BASE_W = 400,
    BASE_H = 540;
let gameW = BASE_W,
    gameH = BASE_H;
let scaleX = 1,
    scaleY = 1;

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
        const scale = getBasketScale(st.level);
        st.basket.w = 86 * scaleX * scale;
        st.basket.h = 26 * scaleY * scale;
        st.basket.y = gameH - 52 * scaleY;
        st.basket.x = Math.min(Math.max(st.basket.x, st.basket.w / 2), gameW - st.basket.w / 2);
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
    st.basket.x = Math.max(st.basket.w / 2, Math.min(gameW - st.basket.w / 2, newX));
}

// ===== AUTH =====
const SESSION_KEY = 'cr_session_v4';

function getSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } }
function saveSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

let currentUserEmail = 'guest';
let currentUserName = 'Guest';
let gameStarted = false;
let isOnHomePage = false;
let wasGamePausedBeforeSettings = false;

function getAuth() { return window.firebaseAuth || null; }

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

// ===== HOME PAGE =====
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
    updateSkinButton();
    initSoundBtn();
    initMusicBtn();
    resizeCanvas();
}

function hideHomePage() {
    document.getElementById('homePageOv').style.display = 'none';
    isOnHomePage = false;
}

function startGameFromHome(resume) {
    hideHomePage();
    const saved = loadProgress();
    if (resume && saved && saved.level > 1) {
        startGame(true, saved);
    } else {
        startGame(false);
    }
}
window.startGameFromHome = startGameFromHome;

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
    if (auth && auth.currentUser) auth.signOut();
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

function saveProgress() { if (!currentUserEmail) return; try { localStorage.setItem(saveKey(currentUserEmail), JSON.stringify({ level: st.level, score: st.score, lives: st.lives })); } catch (e) {} }

function loadProgress() {
    if (!currentUserEmail) return null;
    try {
        const r = localStorage.getItem(saveKey(currentUserEmail));
        if (r) { const data = JSON.parse(r); return { level: data.level, score: data.score, lives: data.lives || 3 }; }
        return null;
    } catch { return null; }
}

function saveLB() {
    try {
        const lb = JSON.parse(localStorage.getItem('cr_lb_v4') || '[]');
        const idx = lb.findIndex(r => r.email === currentUserEmail);
        const entry = { name: currentUserName, email: currentUserEmail, score: st.score, level: st.level };
        if (idx >= 0) { if (st.score > lb[idx].score) lb[idx] = entry; } else lb.push(entry);
        lb.sort((a, b) => b.score - a.score);
        localStorage.setItem('cr_lb_v4', JSON.stringify(lb.slice(0, 100)));
    } catch (e) {}
}

function showLeaderboard() {
    showOv('lbOv');
    const content = document.getElementById('lbContent');
    try {
        const lb = JSON.parse(localStorage.getItem('cr_lb_v4') || '[]');
        if (!lb.length) { content.innerHTML = '<div style="text-align:center;">No scores yet.</div>'; return; }
        const medals = ['🥇', '🥈', '🥉'];
        let html = '<div>';
        lb.slice(0, 20).forEach((r, i) => {
            const isMe = r.email === currentUserEmail;
            html += `<div class="lb-row"><span class="lb-rank">${i<3?medals[i]:i+1}</span><span class="lb-name">${r.name}${isMe?' ★':''}</span><span class="lb-score">${r.score.toLocaleString()}</span><span class="lb-lv">L${r.level}</span></div>`;
        });
        html += '</div>';
        content.innerHTML = html;
    } catch (e) { content.innerHTML = '<div>Error</div>'; }
}

function closeLB() { showHomePage(); }

// ============================================================
// ===== CLOUD SAVE =====
// ============================================================

async function saveProgressToCloud() {
    if (!currentUserEmail || currentUserEmail.startsWith('guest_')) return;
    try {
        const db = window.firebaseDb;
        const doc = window.firebaseDoc;
        const setDoc = window.firebaseSetDoc;
        if (!db || !doc || !setDoc) return;
        if (!st) return;
        const userRef = doc(db, "users", currentUserEmail);
        await setDoc(userRef, {
            name: currentUserName,
            level: st.level || 1,
            score: st.score || 0,
            lives: st.lives || 3,
            updatedAt: new Date().toISOString()
        }, { merge: true });
    } catch (e) { console.error("Cloud save error:", e); }
}

async function loadProgressFromCloud() {
    if (!currentUserEmail || currentUserEmail.startsWith('guest_')) return null;
    try {
        const db = window.firebaseDb;
        const doc = window.firebaseDoc;
        const getDoc = window.firebaseGetDoc;
        if (!db || !doc || !getDoc) return null;
        const userRef = doc(db, "users", currentUserEmail);
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            return { level: data.level || 1, score: data.score || 0, lives: data.lives || 3 };
        }
        return null;
    } catch (e) { return null; }
}

// ===== AUDIO =====
let soundEnabled = localStorage.getItem('cm_sound') !== 'off';
let musicEnabled = localStorage.getItem('cm_music') !== 'off';
let musicNodes = [],
    musicInterval = null,
    musicPlaying = false;
const MUSIC_THEMES = [{ melody: [523, 659, 784, 1047, 784, 659, 523, 440, 523, 659, 784, 880], bass: [131, 131, 131, 131, 165, 165, 131, 131, 131, 165, 165, 131], tempo: 300, name: 'Candy' }];
const BOSS_MUSIC = { melody: [220, 247, 262, 220, 196, 220, 247, 220], bass: [55, 55, 55, 55, 55, 55, 55, 55], tempo: 200 };

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
            const mo = ac.createOscillator(),
                mg = ac.createGain();
            mo.connect(mg);
            mg.connect(ac.destination);
            mo.type = 'sine';
            mo.frequency.setValueAtTime(mFreq, ac.currentTime);
            mg.gain.setValueAtTime(0.08, ac.currentTime);
            mg.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + theme.tempo / 1200);
            mo.start(ac.currentTime);
            mo.stop(ac.currentTime + theme.tempo / 1000);
            musicNodes.push(mo, mg);
            if (noteIdx % 2 === 0) {
                const bo = ac.createOscillator(),
                    bg = ac.createGain();
                bo.connect(bg);
                bg.connect(ac.destination);
                bo.type = 'triangle';
                bo.frequency.setValueAtTime(theme.bass[noteIdx % theme.bass.length], ac.currentTime);
                bg.gain.setValueAtTime(0.06, ac.currentTime);
                bg.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + theme.tempo / 800);
                bo.start(ac.currentTime);
                bo.stop(ac.currentTime + theme.tempo / 600);
                musicNodes.push(bo, bg);
            }
            noteIdx++;
            if (musicNodes.length > 40) musicNodes.splice(0, 20);
        } catch (e) {}
    }
    playNote();
    musicInterval = setInterval(playNote, theme.tempo);
}

function stopMusic() { musicPlaying = false; if (musicInterval) { clearInterval(musicInterval);
        musicInterval = null; } musicNodes.forEach(n => { try { n.stop();
            n.disconnect(); } catch (e) {} }); musicNodes = []; }

function toggleMusic() { musicEnabled = !musicEnabled;
    localStorage.setItem('cm_music', musicEnabled ? 'on' : 'off'); const btn = document.getElementById('musicToggleBtn'); if (btn) btn.textContent = musicEnabled ? '🎵' : '🎵'; if (btn) btn.style.opacity = musicEnabled ? '1' : '0.35'; if (musicEnabled && st && st.running) startMusic(st.currentTheme ? st.currentTheme.id : 0); else stopMusic(); }

function toggleSound() { soundEnabled = !soundEnabled;
    localStorage.setItem('cm_sound', soundEnabled ? 'on' : 'off'); const btn = document.getElementById('soundToggleBtn'); if (btn) btn.textContent = soundEnabled ? '🔊' : '🔇'; if (soundEnabled) beep(800, 'sine', 0.1, 0.2); }

function initSoundBtn() { const btn = document.getElementById('soundToggleBtn'); if (btn) btn.textContent = soundEnabled ? '🔊' : '🔇';
    initMusicBtn(); }

function initMusicBtn() { const btn = document.getElementById('musicToggleBtn'); if (btn) btn.style.opacity = musicEnabled ? '1' : '0.35'; }
let AC;

function getAC() { if (!AC) AC = new(window.AudioContext || window.webkitAudioContext)(); return AC; }

function beep(f, t, d, v, dl = 0) { if (!soundEnabled) return; try { const ac = getAC(),
            o = ac.createOscillator(),
            g = ac.createGain();
        o.connect(g);
        g.connect(ac.destination);
        o.type = t;
        o.frequency.setValueAtTime(f, ac.currentTime + dl);
        g.gain.setValueAtTime(v, ac.currentTime + dl);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dl + d);
        o.start(ac.currentTime + dl);
        o.stop(ac.currentTime + dl + d + 0.05); } catch (e) {} }

function sfxCatch() { beep(660, 'sine', 0.08, 0.28);
    beep(880, 'sine', 0.07, 0.22, 0.06); }

function sfxWrong() { beep(180, 'sawtooth', 0.18, 0.25);
    beep(140, 'sawtooth', 0.12, 0.2, 0.1); }

function sfxMiss() { beep(220, 'sawtooth', 0.12, 0.18); }

function sfxLevelUp() { [523, 659, 784, 1047].forEach((f, i) => beep(f, 'sine', 0.12, 0.28, i * 0.1)); }

function sfxTaskDone() { [440, 550, 660, 880, 1100].forEach((f, i) => beep(f, 'triangle', 0.14, 0.3, i * 0.08)); }

function sfxLife() { beep(880, 'sine', 0.12, 0.32);
    beep(1100, 'sine', 0.1, 0.28, 0.12);
    beep(1320, 'sine', 0.09, 0.22, 0.22); }

function sfxBomb() { beep(80, 'sawtooth', 0.4, 0.5);
    beep(60, 'sawtooth', 0.3, 0.4, 0.1);
    beep(40, 'sine', 0.5, 0.3, 0.2); }

function sfxCombo(n) { beep(440 + n * 80, 'sine', 0.1, 0.3);
    beep(550 + n * 80, 'sine', 0.08, 0.25, 0.06); }

function sfxShield() { beep(300, 'sine', 0.08, 0.22);
    beep(500, 'sine', 0.1, 0.28, 0.08);
    beep(800, 'sine', 0.12, 0.3, 0.16);
    beep(1100, 'sine', 0.1, 0.25, 0.24); }

function sfxBossWarning() { [200, 170, 140, 110, 80].forEach((f, i) => beep(f, 'sawtooth', 0.22, 0.3, i * 0.1)); }

function sfxBossWin() { [523, 659, 784, 1047, 1318, 1047, 784, 1047, 1318, 1568].forEach((f, i) => beep(f, 'sine', 0.14, 0.28, i * 0.09)); }

function sfxSurprise() { [400, 600, 900, 1200, 1600, 2000, 2600].forEach((f, i) => beep(f, 'sine', 0.18, 0.32, i * 0.08)); }

function sfxGameOver() { beep(300, 'sawtooth', 0.18, 0.25);
    beep(250, 'sawtooth', 0.15, 0.22, 0.12);
    beep(200, 'sawtooth', 0.12, 0.2, 0.22);
    beep(150, 'sine', 0.3, 0.18, 0.32); }

// ===== BASKET SKINS =====
const BASKET_SKINS = [
    { name: 'Candy', emoji: '🍬', b1: '#F0A060', b2: '#C8752A', b3: '#7A3A08', bt: '#FFD090', bm: '#E08830' },
    { name: 'Space', emoji: '🚀', b1: '#2a2a7a', b2: '#1a1a5a', b3: '#0a0a3a', bt: '#4a4aff', bm: '#2a2aff' },
    { name: 'Neon', emoji: '🌆', b1: '#FF1493', b2: '#FF00FF', b3: '#8A2BE2', bt: '#00FFFF', bm: '#FF00FF' },
    { name: 'Golden', emoji: '👑', b1: '#FFD700', b2: '#FFA500', b3: '#FF8C00', bt: '#FFF0A0', bm: '#FFB347' }
];
let currentSkinIndex = 0;

function loadSkin() {
    const saved = localStorage.getItem('cm_basket_skin');
    if (saved !== null) {
        currentSkinIndex = parseInt(saved);
        if (isNaN(currentSkinIndex) || currentSkinIndex < 0 || currentSkinIndex >= BASKET_SKINS.length) currentSkinIndex = 0;
    }
    updateSkinButton();
}

function saveSkin() { localStorage.setItem('cm_basket_skin', currentSkinIndex);
    updateSkinButton(); }

function updateSkinButton() {
    const skinText = `🎨 ${BASKET_SKINS[currentSkinIndex].emoji} ${BASKET_SKINS[currentSkinIndex].name}`;
    const btn = document.getElementById('skinBtn');
    if (btn) btn.textContent = skinText;
    const btn2 = document.getElementById('homeSkinBtn2');
    if (btn2) btn2.textContent = skinText;
}

function cycleSkin() {
    currentSkinIndex = (currentSkinIndex + 1) % BASKET_SKINS.length;
    saveSkin();
}
window.cycleSkin = cycleSkin;

// ============================================================
// ===== CSS CANDY SYSTEM (30+ Types) =====
// ============================================================

// Colors (6 types)
const CANDY_COLORS = [
    { name: 'red', main: '#FF4D4D', light: '#FF8080', dark: '#CC0000' },
    { name: 'blue', main: '#4D79FF', light: '#80A0FF', dark: '#0033CC' },
    { name: 'green', main: '#4DFF88', light: '#80FFAA', dark: '#00CC44' },
    { name: 'yellow', main: '#FFFF4D', light: '#FFFF80', dark: '#CCCC00' },
    { name: 'purple', main: '#994DFF', light: '#BB80FF', dark: '#6600CC' },
    { name: 'orange', main: '#FF8C00', light: '#FFB040', dark: '#CC5500' }
];

// Shapes (5 types)
const CANDY_SHAPES = [
    { name: 'round', radius: 0.9 },
    { name: 'square', radius: 0.15 },
    { name: 'jelly', radius: 0.7, jelly: true },
    { name: 'star', radius: 0.9, star: true },
    { name: 'diamond', radius: 0.85, diamond: true }
];

// Sizes (3 types)
const CANDY_SIZES = [
    { name: 'small', scale: 0.8 },
    { name: 'medium', scale: 1.0 },
    { name: 'large', scale: 1.2 }
];

// Generate unique candy type combinations
function generateCandyTypes() {
    const types = [];
    let id = 0;
    for (let c = 0; c < CANDY_COLORS.length; c++) {
        for (let s = 0; s < CANDY_SHAPES.length; s++) {
            for (let z = 0; z < CANDY_SIZES.length; z++) {
                types.push({
                    id: id++,
                    color: CANDY_COLORS[c],
                    shape: CANDY_SHAPES[s],
                    size: CANDY_SIZES[z],
                    pts: 10 + Math.floor(Math.random() * 20),
                    name: `${CANDY_COLORS[c].name}-${CANDY_SHAPES[s].name}-${CANDY_SIZES[z].name}`
                });
            }
        }
    }
    return types;
}

// All candy types (6 colors × 5 shapes × 3 sizes = 90 types)
const ALL_CANDY_TYPES = generateCandyTypes();

// Pick random candy type
function getRandomCandyType() {
    return ALL_CANDY_TYPES[Math.floor(Math.random() * ALL_CANDY_TYPES.length)];
}

// ============================================================
// ===== DIFFICULTY CONFIGURATION =====
// ============================================================

function getBasketScale(level) {
    if (level < 3000) return 1.0;
    if (level < 5000) return 0.97;
    if (level < 7000) return 0.94;
    return 0.90;
}

function getLevelConfig(lvl) {
    // Speed: 2.5 to 7.0 (gradual)
    let speed = 2.5 + (Math.min(lvl, 7000) / 7000) * 4.5;

    // Spawn interval
    const interval = Math.max(30, 80 - lvl * 0.015);

    // Target: gradual increase, max 250 at level 10000
    let target;
    if (lvl <= 10) {
        target = 8 + lvl;
    } else {
        const progress = Math.min(1, (lvl - 10) / 9990);
        target = Math.floor(10 + (240) * Math.pow(progress, 0.65));
        target = Math.max(10 + Math.floor(lvl * 0.015), target);
    }
    target = Math.min(250, Math.max(10, target));

    return { speed, interval, target };
}

function getBombChance(lvl) {
    if (lvl < 20) return 0.01;
    if (lvl < 100) return 0.02;
    if (lvl < 500) return 0.04;
    if (lvl < 2000) return 0.06;
    if (lvl < 4000) return 0.08;
    if (lvl < 6000) return 0.10;
    return 0.12;
}

function getLevelMode(lvl) {
    if (lvl < 5) return { mode: 'normal' };
    const t = lvl % 20;
    if (lvl > 5000 && t % 3 === 0) {
        return { mode: 'selective', targetShape: pickRandom(['star', 'heart', 'diamond', 'lollipop', 'wrapped', 'round']) };
    }
    if (lvl > 3000 && t % 5 === 0) {
        return { mode: 'selective', targetShape: pickRandom(['star', 'heart', 'diamond']) };
    }
    if (t === 0) return { mode: 'selective', targetShape: pickRandom(['star', 'heart', 'diamond']) };
    if (t === 10) return { mode: 'selective', targetShape: pickRandom(['lollipop', 'wrapped', 'round']) };
    if (t === 15 && lvl > 100) return { mode: 'selective', targetShape: pickRandom(['heart', 'star']) };
    if (t === 5 && lvl > 500) return { mode: 'selective', targetShape: pickRandom(['diamond', 'wrapped']) };
    return { mode: 'normal' };
}

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function getModeLabel(s) { return { star: '⭐ Star', heart: '❤️ Heart', diamond: '💎 Diamond', lollipop: '🍭 Lollipop', wrapped: '🍬 Wrapped', round: '🔴 Round' } [s] || s; }

// ============================================================
// ===== BOMB TYPES =====
// ============================================================

const BOMB_TYPES = {
    GAME_OVER: { type: 'game-over', label: '💀', effect: 'gameOver', color: '#FF0000' },
    LIFE_REDUCE: { type: 'life-reduce', label: '💔', effect: 'lifeReduce', color: '#FF4444' },
    TARGET_REDUCE: { type: 'target-reduce', label: '📉', effect: 'targetReduce', color: '#FF8800' },
    SCORE_REDUCE: { type: 'score-reduce', label: '💰', effect: 'scoreReduce', color: '#FFAA00' },
    BASKET_RESET: { type: 'basket-reset', label: '🔄', effect: 'basketReset', color: '#FF00FF' }
};

function getRandomBombType() {
    const types = Object.values(BOMB_TYPES);
    return types[Math.floor(Math.random() * types.length)];
}

// ============================================================
// ===== GAME STATE =====
// ============================================================

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        this.moveTo(x + r, y);
        this.lineTo(x + w - r, y);
        this.quadraticCurveTo(x + w, y, x + w, y + r);
        this.lineTo(x + w, y + h - r);
        this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        this.lineTo(x + r, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - r);
        this.lineTo(x, y + r);
        this.quadraticCurveTo(x, y, x + r, y);
        return this;
    };
}

const SHIELD_BASE_DURATION = 720;
let shakeFrames = 0,
    shakeIntensity = 0;

function triggerShake(intensity = 8, frames = 18) { shakeFrames = frames;
    shakeIntensity = intensity; }

const TASKS = [
    { desc: 'Catch 10 Hearts ❤️', type: 'heart', count: 10 }, { desc: 'Catch 8 Stars ⭐', type: 'star', count: 8 },
    { desc: 'Catch 15 Round 🔴', type: 'round', count: 15 }, { desc: 'Catch 6 Diamonds 💎', type: 'diamond', count: 6 },
    { desc: 'Catch 12 Wrapped 🍬', type: 'wrapped', count: 12 }, { desc: 'Catch any 20 candies', type: 'any', count: 20 }
];

const THEMES = [
    { id: 0, name: 'Candy Kingdom', emoji: '👑', bg: ['#060012', '#120030', '#200840'], star: '#FFB8FF', bar: ['#FF4DA6', '#FF8C00'], topBar: 'linear-gradient(90deg,#0A001E,#1A0040)', desc: 'Sweet candy royal world!' }
];

function getTheme(lvl) { return THEMES[0]; }

let st = {
    running: false,
    score: 0,
    lives: 3,
    level: 1,
    basket: { x: gameW / 2, w: 86, h: 26, y: gameH - 52 },
    items: [],
    particles: [],
    floats: [],
    confetti: [],
    spawnTimer: 0,
    spawnInterval: 70,
    speed: 2.5,
    frame: 0,
    levelTarget: 10,
    levelCaught: 0,
    inTask: false,
    taskDef: null,
    taskCaught: 0,
    levelMode: { mode: 'normal' },
    currentTheme: THEMES[0],
    combo: 0,
    comboTimer: 0,
    shieldActive: false,
    shieldFrames: 0,
    shieldMaxFrames: 0,
    levelCompleteTriggered: false,
    basketSkin: 'default'
};
let isGamePaused = false;

// ============================================================
// ===== PARTICLES / CONFETTI =====
// ============================================================

function addParticles(x, y, c1, c2) {
    for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 2 + Math.random() * 5;
        st.particles.push({
            x,
            y,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd - 3,
            life: 35,
            maxLife: 35,
            color: Math.random() > 0.5 ? c1 : c2,
            r: 3 + Math.random() * 5
        });
    }
}

function addRedParticles(x, y) {
    for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 2 + Math.random() * 3;
        st.particles.push({
            x,
            y,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd - 2,
            life: 28,
            maxLife: 28,
            color: '#FF2222',
            r: 3 + Math.random() * 4
        });
    }
}

function spawnConfetti(count = 60) {
    const cols = ['#FFD700', '#FF4DA6', '#00BFFF', '#FF6090', '#A855F7', '#10D4AA', '#F43F5E', '#FFFFFF'];
    for (let i = 0; i < count; i++) {
        st.confetti.push({
            x: Math.random() * gameW,
            y: -10 - Math.random() * 60,
            vx: (Math.random() - 0.5) * 3.5,
            vy: 2 + Math.random() * 3.5,
            color: cols[Math.floor(Math.random() * cols.length)],
            size: 5 + Math.random() * 8,
            rot: Math.random() * Math.PI,
            vrot: 0.05 + Math.random() * 0.12,
            life: 220
        });
    }
}

// ============================================================
// ===== SPAWN FUNCTIONS =====
// ============================================================

function spawnItem() {
    const lvl = st.level;

    // Burst count
    let burstCount;
    if (lvl < 50) burstCount = 2 + Math.floor(Math.random() * 2);
    else if (lvl < 500) burstCount = 2 + Math.floor(Math.random() * 3);
    else burstCount = 3 + Math.floor(Math.random() * 2);
    burstCount = Math.min(4, burstCount);

    for (let b = 0; b < burstCount; b++) {
        setTimeout(() => {
            if (!st || !st.running) return;

            // Check for bomb spawn
            if (Math.random() < getBombChance(lvl) && b === 0) {
                spawnBomb();
                return;
            }

            // Spawn normal candy
            const candyType = getRandomCandyType();
            const size = 16 * scaleX + Math.random() * 9 * scaleX;
            const yOffset = -b * 25 * scaleY;

            st.items.push({
                x: 30 * scaleX + Math.random() * (gameW - 60 * scaleX),
                y: -34 * scaleY + yOffset,
                type: candyType,
                size: size,
                wobble: Math.random() * Math.PI * 2,
                speed: st.speed + (0.5 + Math.random() * 0.8),
                rot: Math.random() * Math.PI * 2,
                isBomb: false,
                isShield: false,
                pulse: 0
            });

        }, b * 100);
    }
}

function spawnBomb() {
    const bombType = getRandomBombType();
    st.items.push({
        x: 30 * scaleX + Math.random() * (gameW - 60 * scaleX),
        y: -34 * scaleY,
        size: 22 * scaleX,
        wobble: Math.random() * Math.PI * 2,
        speed: st.speed * 0.85 + Math.random() * 0.5,
        rot: Math.random() * Math.PI * 2,
        isBomb: true,
        isShield: false,
        bombType: bombType,
        pulse: 0,
        fuseTimer: 0
    });
}

function activateShield() { st.shieldActive = true;
    st.shieldFrames = SHIELD_BASE_DURATION;
    st.shieldMaxFrames = SHIELD_BASE_DURATION;
    sfxShield();
    updatePowerupHud(); }

// ============================================================
// ===== DRAWING FUNCTIONS =====
// ============================================================

function glow(c, b) { ctx.shadowColor = c;
    ctx.shadowBlur = b; }

function ng() { ctx.shadowBlur = 0; }

function drawCandy(r, candyType) {
    const color = candyType.color;
    const shape = candyType.shape;
    const size = candyType.size;

    // Glow
    glow(color.main, 12);
    ctx.strokeStyle = color.main;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ng();

    // Main body
    const grad = ctx.createRadialGradient(-r * 0.2, -r * 0.3, 0, 0, 0, r);
    grad.addColorStop(0, color.light);
    grad.addColorStop(0.6, color.main);
    grad.addColorStop(1, color.dark);

    ctx.fillStyle = grad;
    ctx.strokeStyle = color.dark;
    ctx.lineWidth = 1.5;

    // Shape rendering
    let scale = size.scale || 1;

    if (shape.name === 'round') {
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.85 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    } else if (shape.name === 'square') {
        ctx.beginPath();
        ctx.roundRect(-r * 0.7 * scale, -r * 0.7 * scale, r * 1.4 * scale, r * 1.4 * scale, r * 0.15);
        ctx.fill();
        ctx.stroke();
    } else if (shape.name === 'jelly') {
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.8 * scale, r * 0.9 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Jelly wobble mark
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.ellipse(-r * 0.2, -r * 0.25, r * 0.3 * scale, r * 0.15 * scale, -0.4, 0, Math.PI * 2);
        ctx.fill();
    } else if (shape.name === 'star') {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const a = (i * Math.PI / 5) - Math.PI / 2;
            const rad = i % 2 === 0 ? r * 0.85 * scale : r * 0.4 * scale;
            i === 0 ? ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad) : ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    } else if (shape.name === 'diamond') {
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.1 * scale);
        ctx.lineTo(r * 0.8 * scale, 0);
        ctx.lineTo(0, r * 1.1 * scale);
        ctx.lineTo(-r * 0.8 * scale, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    // Shine
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.25, -r * 0.3, r * 0.2 * scale, r * 0.1 * scale, -0.4, 0, Math.PI * 2);
    ctx.fill();
}

function drawBombItem(r, bombType, fuseT) {
    const sparkOn = Math.sin(fuseT * 0.4) > 0;

    // Fuse
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r * 0.2, -r);
    ctx.bezierCurveTo(r * 0.6, -r * 1.5, r * 0.8, -r * 1.8, r * 0.5, -r * 2.2);
    ctx.stroke();

    if (sparkOn) {
        glow('#FF8C00', 10);
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(r * 0.5, -r * 2.2, r * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ng();
    }

    // Bomb body with color
    const bombColor = bombType.color || '#FF0000';
    glow(bombColor, 8 + Math.sin(fuseT * 0.3) * 4);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.05, 0, 0, r);
    g.addColorStop(0, '#666');
    g.addColorStop(0.5, '#1a1a1a');
    g.addColorStop(1, '#000');
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ng();

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Bomb label
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `bold ${Math.round(r*1.4)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bombType.label || '💣', 0, 2);

    // Effect text below
    ctx.fillStyle = bombColor;
    ctx.font = `bold ${Math.round(r*0.45)}px sans-serif`;
    ctx.fillText(bombType.type.replace('-', ' '), 0, r * 1.8);
    ng();
}

function drawItem(item) {
    const { x, y, size: r, rot } = item;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    if (item.isBomb) {
        const fuseT = item.fuseTimer || 0;
        const bombType = item.bombType || BOMB_TYPES.GAME_OVER;
        drawBombItem(r, bombType, fuseT);
        ctx.restore();
        return;
    }

    if (item.isShield) {
        drawShieldItem(r, item.pulse || 0);
        ctx.restore();
        return;
    }

    // Normal candy
    drawCandy(r, item.type);

    ctx.restore();
}

function drawShieldItem(r, pulse) {
    const p = Math.sin(pulse) * 0.5 + 0.5;
    glow('#A855F7', 12 + p * 10);
    ctx.strokeStyle = `rgba(168,85,247,${0.4+p*0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r + 7 + p * 4, 0, Math.PI * 2);
    ctx.stroke();
    ng();
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.bezierCurveTo(r, -r, r, -r * 0.2, r, 0);
    ctx.bezierCurveTo(r, r * 0.6, 0, r * 1.1, 0, r * 1.1);
    ctx.bezierCurveTo(0, r * 1.1, -r, r * 0.6, -r, 0);
    ctx.bezierCurveTo(-r, -r * 0.2, -r, -r, 0, -r);
    const g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, '#D09BFF');
    g.addColorStop(0.5, '#A855F7');
    g.addColorStop(1, '#5C3DCF');
    ctx.fillStyle = g;
    glow('#A855F7', 10);
    ctx.fill();
    ng();
    ctx.strokeStyle = '#7C3AED';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.28, -r * 0.3, r * 0.28, r * 0.16, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `${Math.round(r*0.9)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', 0, r * 0.08);
    glow('#A855F7', 6);
    ctx.fillStyle = '#D09BFF';
    ctx.font = `bold ${Math.round(r*0.5)}px sans-serif`;
    ctx.fillText('SHIELD', 0, r * 1.75);
    ng();
}

// ============================================================
// ===== BG, PROGRESS BAR, BASKET =====
// ============================================================

function drawBg() {
    const th = st.currentTheme || THEMES[0];
    const g = ctx.createLinearGradient(0, 0, 0, gameH);
    g.addColorStop(0, th.bg[0]);
    g.addColorStop(0.5, th.bg[1]);
    g.addColorStop(1, th.bg[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, gameW, gameH);
    const t = st.frame * 0.013;
    for (let i = 0; i < 18; i++) {
        const sx = (i * 141.7 + Math.sin(t + i) * 18) % gameW;
        const sy = (i * 99.3 + st.frame * 0.05 + i * 3.5) % gameH;
        const br = 0.03 + 0.03 * Math.sin(st.frame * 0.05 + i);
        ctx.globalAlpha = br;
        ctx.fillStyle = th.star;
        ctx.beginPath();
        ctx.arc(sx, sy, 1 + (i % 3) * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
    if (st.levelMode.mode === 'selective') {
        ctx.fillStyle = 'rgba(255,60,0,0.04)';
        ctx.fillRect(0, 0, gameW, gameH);
    }
}

function drawProgressBar() {
    const pct = Math.min(1, st.levelCaught / st.levelTarget);
    const th = st.currentTheme || THEMES[0];
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.roundRect(10 * scaleX, 6 * scaleY, gameW - 20 * scaleX, 8 * scaleY, 4 * scaleX);
    ctx.fill();
    const pg = ctx.createLinearGradient(10 * scaleX, 0, 10 * scaleX + (gameW - 20 * scaleX) * pct, 0);
    pg.addColorStop(0, th.bar[0]);
    pg.addColorStop(1, th.bar[1]);
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.roundRect(10 * scaleX, 6 * scaleY, (gameW - 20 * scaleX) * pct, 8 * scaleY, 4 * scaleX);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `bold ${9*scaleX}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(st.levelCaught + '/' + st.levelTarget, gameW - 12 * scaleX, 15 * scaleY);
}

function drawBasketWithSkin(bx, by, bw, bh) {
    const skin = BASKET_SKINS[currentSkinIndex];
    ctx.save();
    glow('#FF88AA', 14);
    ctx.fillStyle = 'rgba(255,100,150,0.05)';
    ctx.beginPath();
    ctx.ellipse(bx, by + bh, bw * 0.65, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ng();
    const g = ctx.createLinearGradient(bx - bw / 2, by, bx + bw / 2, by + bh * 2);
    g.addColorStop(0, skin.b1);
    g.addColorStop(0.4, skin.b2);
    g.addColorStop(1, skin.b3);
    ctx.fillStyle = g;
    ctx.strokeStyle = skin.b3;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(bx - bw / 2, by);
    ctx.lineTo(bx - bw / 2 + 8, by + bh);
    ctx.lineTo(bx + bw / 2 - 8, by + bh);
    ctx.lineTo(bx + bw / 2, by);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1.2;
    for (let i = 1; i < 4; i++) {
        const px = bx - bw / 2 + (bw / 4) * i;
        ctx.beginPath();
        ctx.moveTo(px, by);
        ctx.lineTo(px + 3, by + bh);
        ctx.stroke();
    }
    const rg = ctx.createLinearGradient(bx - bw / 2, by, bx + bw / 2, by);
    rg.addColorStop(0, skin.bt);
    rg.addColorStop(0.5, skin.bm);
    rg.addColorStop(1, skin.bt);
    ctx.fillStyle = rg;
    ctx.strokeStyle = skin.b3;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(bx - bw / 2 - 2, by - 4, bw + 4, 8, 3);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

// ============================================================
// ===== INIT LEVEL, UPDATE HUD =====
// ============================================================

function initLevel(lvl, score, lives) {
    const cfg = getLevelConfig(lvl);
    const lm = getLevelMode(lvl);
    const th = getTheme(lvl);
    Object.assign(st, {
        score: score || 0,
        lives: lives || 3,
        level: lvl,
        items: [],
        particles: [],
        floats: [],
        confetti: [],
        spawnTimer: 0,
        spawnInterval: cfg.interval,
        speed: cfg.speed,
        frame: 0,
        levelTarget: cfg.target,
        levelCaught: 0,
        inTask: false,
        taskDef: null,
        taskCaught: 0,
        levelMode: lm,
        currentTheme: th,
        combo: 0,
        comboTimer: 0,
        shieldActive: false,
        shieldFrames: 0,
        shieldMaxFrames: 0,
        levelCompleteTriggered: false
    });
    shakeFrames = 0;
    shakeIntensity = 0;
    const scale = getBasketScale(lvl);
    st.basket.x = gameW / 2;
    st.basket.w = 86 * scaleX * scale;
    st.basket.h = 26 * scaleY * scale;
    st.basket.y = gameH - 52 * scaleY;
    applyTheme(th);
    updateModeTag();
    updateHUD();
    updateTaskHud();
}

function applyTheme(th) {
    st.currentTheme = th;
    document.getElementById('topBar').style.background = th.topBar;
    document.body.style.background = th.bg[0];
    const tt = document.getElementById('themeTag');
    if (tt) tt.textContent = th.emoji + ' ' + th.name;
}

function updateModeTag() {
    const tag = document.getElementById('modeTag');
    if (st.levelMode.mode === 'selective') {
        tag.textContent = '⚠️ Only ' + getModeLabel(st.levelMode.targetShape) + '!';
        tag.style.background = 'rgba(255,80,0,0.25)';
        tag.style.color = '#FF8C00';
    } else {
        tag.textContent = '';
        tag.style.background = 'transparent';
    }
}

function updateHUD() {
    document.getElementById('sc').textContent = st.score.toLocaleString();
    document.getElementById('lv').textContent = st.level.toLocaleString();
    let h = '';
    for (let i = 0; i < st.lives; i++) h += '❤️';
    document.getElementById('li').innerHTML = h || '🖤';
}

function updateTaskHud() {
    if (!st.taskDef) {
        document.getElementById('taskHudText').textContent = '';
        document.getElementById('taskHudFill').style.width = '0%';
        document.getElementById('taskHudPct').textContent = '';
        return;
    }
    const pct = Math.min(100, Math.round(st.taskCaught / st.taskDef.count * 100));
    document.getElementById('taskHudText').textContent = st.taskDef.desc + ' ';
    document.getElementById('taskHudFill').style.width = pct + '%';
    document.getElementById('taskHudPct').textContent = st.taskCaught + '/' + st.taskDef.count;
}

function showOv(id) {
    const overlays = ['homeOv', 'levelOv', 'taskOv', 'celebOv', 'lbOv', 'themeOv', 'roadmapOv', 'dailyOv', 'bossOv', 'bossWinOv', 'goOv', 'settingsOv', 'helpOv', 'pauseOv'];
    overlays.forEach(s => { const el = document.getElementById(s); if (el) el.style.display = 'none'; });
    const homePage = document.getElementById('homePageOv');
    if (homePage) homePage.style.display = 'none';
    if (id) document.getElementById(id).style.display = 'flex';
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

// ============================================================
// ===== BOMB HANDLERS =====
// ============================================================

function handleBombEffect(bombType) {
    switch (bombType.type) {
        case 'game-over':
            st.lives = 0;
            updateHUD();
            endGame(true);
            break;
        case 'life-reduce':
            st.lives--;
            updateHUD();
            sfxWrong();
            triggerShake(5, 10);
            st.floats.push({ x: gameW / 2, y: gameH / 2, color: '#FF4444', life: 60, text: '💔 -1 Life!', big: true });
            if (st.lives <= 0) { endGame(false); }
            break;
        case 'target-reduce':
            st.levelTarget = Math.max(st.levelCaught + 5, st.levelTarget - 15);
            sfxWrong();
            st.floats.push({ x: gameW / 2, y: gameH / 2, color: '#FF8800', life: 60, text: '📉 +15 more needed!', big: true });
            break;
        case 'score-reduce':
            st.score = Math.max(0, st.score - 500);
            updateHUD();
            sfxWrong();
            st.floats.push({ x: gameW / 2, y: gameH / 2, color: '#FFAA00', life: 60, text: '💰 -500 Score!', big: true });
            break;
        case 'basket-reset':
            currentSkinIndex = 0;
            saveSkin();
            updateSkinButton();
            sfxWrong();
            st.floats.push({ x: gameW / 2, y: gameH / 2, color: '#FF00FF', life: 60, text: '🔄 Basket Reset!', big: true });
            break;
    }
}

// ============================================================
// ===== GAME LOOP =====
// ============================================================

const TARGET_FPS = 60;
const FRAME_INTERVAL = 1000 / TARGET_FPS;
let lastFrameTime = 0;

function gameLoop(timestamp) {
    if (!st.running) return;
    if (timestamp - lastFrameTime < FRAME_INTERVAL) { requestAnimationFrame(gameLoop); return; }
    lastFrameTime = timestamp;
    st.frame++;
    if (isGamePaused) { requestAnimationFrame(gameLoop); return; }

    ctx.save();

    // Shake
    if (shakeFrames > 0) {
        const sx = (Math.random() - 0.5) * shakeIntensity;
        const sy = (Math.random() - 0.5) * shakeIntensity;
        ctx.translate(sx, sy);
        shakeFrames--;
        shakeIntensity *= 0.88;
    } else {
        shakeIntensity = 0;
    }

    ctx.clearRect(-20, -20, gameW + 40, gameH + 40);
    drawBg();

    if (st.shieldActive) {
        st.shieldFrames--;
        if (st.shieldFrames <= 0) st.shieldActive = false;
        updatePowerupHud();
    }
    if (st.comboTimer > 0) {
        st.comboTimer--;
        if (st.comboTimer === 0) st.combo = 0;
    }

    st.spawnTimer++;
    if (st.spawnTimer >= st.spawnInterval) {
        spawnItem();
        st.spawnTimer = 0;
    }

    const { x: bx, y: by, w: bw, h: bh } = st.basket;

    st.items = st.items.filter(item => {
        item.y += item.speed;
        item.wobble += 0.028;

        if (item.isBomb) {
            item.fuseTimer = (item.fuseTimer || 0) + 1;
            item.rot += 0.03;
        } else {
            // Original smooth flow
            item.rot += 0.015;
            // Smooth sine wave drift with level-based amplitude
            let amplitude = 1.8 + (st.level / 10000) * 3.2; // 1.8 to 5.0
            item.x += Math.sin(item.wobble) * amplitude;
        }

        item.x = Math.max(item.size, Math.min(gameW - item.size, item.x));

        const caught = item.y > by - 10 && item.y < by + bh + 4 &&
            item.x > bx - bw / 2 - item.size * 0.6 &&
            item.x < bx + bw / 2 + item.size * 0.6;

        if (caught) {
            if (item.isBomb) {
                if (st.shieldActive) {
                    sfxShield();
                    triggerShake(4, 10);
                    st.shieldActive = false;
                    st.shieldFrames = 0;
                    updatePowerupHud();
                    addRedParticles(item.x, by);
                    st.floats.push({ x: item.x, y: by - 20, color: '#A855F7', life: 60, text: '🛡️ SHIELD SAVED!', big: true });
                    return false;
                }
                handleBombEffect(item.bombType);
                addRedParticles(item.x, by);
                return false;
            }

            if (item.isShield) {
                activateShield();
                addParticles(item.x, by, '#A855F7', '#D09BFF');
                st.floats.push({ x: item.x, y: by - 20, color: '#A855F7', life: 70, text: '🛡️ SHIELD! 12s', big: true });
                return false;
            }

            // Normal candy catch
            const pts = item.type.pts || 10;
            st.combo++;
            st.comboTimer = 90;
            const multi = Math.min(st.combo, 5);
            const totalPts = pts * multi;
            if (multi > 1) sfxCombo(multi);
            sfxCatch();
            addParticles(item.x, by, item.type.color.main, item.type.color.light);
            st.floats.push({
                x: item.x,
                y: by - 16,
                color: multi > 1 ? '#FFD700' : item.type.color.light,
                life: 40,
                text: (multi > 1 ? 'x' + multi + ' ' : '') + '+' + totalPts,
                big: multi >= 3
            });
            st.score += totalPts;
            st.levelCaught++;
            updateHUD();

            if (st.levelCaught >= st.levelTarget) {
                if (st.levelCompleteTriggered) return false;
                st.levelCompleteTriggered = true;
                st.running = false;
                setTimeout(() => onLevelComplete(), 100);
                return false;
            }
            return false;
        }

        if (item.y > gameH + 40) {
            if (item.isBomb || item.isShield) return false;
            if (st.inTask && st.taskDef) return false;
            sfxMiss();
            triggerShake(4, 10);
            st.combo = 0;
            st.comboTimer = 0;
            st.lives--;
            updateHUD();
            if (st.lives <= 0) { endGame(false); return false; }
            return false;
        }

        drawItem(item);
        return true;
    });

    // Particles
    st.particles = st.particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.22;
        p.life--;
        ctx.save();
        ctx.globalAlpha = p.life / p.maxLife;
        glow(p.color, 6);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (p.life / p.maxLife), 0, Math.PI * 2);
        ctx.fill();
        ng();
        ctx.restore();
        return p.life > 0;
    });

    // Floats
    st.floats = st.floats.filter(f => {
        f.y -= 1.3;
        f.life--;
        ctx.save();
        const maxLife = f.big ? 80 : 45;
        ctx.globalAlpha = f.life / maxLife;
        glow(f.color, f.big ? 12 : 8);
        ctx.fillStyle = f.color;
        ctx.font = `bold ${f.big?18*scaleX:15*scaleX}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(f.text, f.x, f.y);
        ng();
        ctx.restore();
        return f.life > 0;
    });

    // Confetti
    st.confetti = st.confetti.filter(c => {
        c.x += c.vx;
        c.y += c.vy;
        c.vy += 0.04;
        c.rot += c.vrot;
        c.life--;
        ctx.save();
        ctx.globalAlpha = Math.min(1, c.life / 30);
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
        ctx.restore();
        return c.life > 0 && c.y < gameH + 20;
    });

    // Combo display
    if (st.combo >= 2) {
        const multi = Math.min(st.combo, 5);
        const colors = ['', '', '#FFD700', '#FF8C00', '#FF4DA6', '#FF00FF'];
        ctx.save();
        ctx.globalAlpha = 0.85;
        glow(colors[multi] || '#FFD700', 8);
        ctx.fillStyle = colors[multi] || '#FFD700';
        ctx.font = `bold ${13*scaleX}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText('🔥 COMBO x' + multi, 12 * scaleX, gameH - 16 * scaleY);
        ng();
        ctx.restore();
    }

    drawProgressBar();

    if (st.shieldActive) {
        const pulse = Math.sin(st.frame * 0.12) * 0.4 + 0.6;
        ctx.save();
        glow('#A855F7', 12 * pulse);
        ctx.strokeStyle = `rgba(168,85,247,${0.55*pulse})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(bx, by - 10, st.basket.w * 0.72 + 8, Math.PI, 0, false);
        ctx.stroke();
        ctx.strokeStyle = `rgba(168,85,247,${0.3*pulse})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(bx - st.basket.w * 0.72 - 8, by - 10);
        ctx.lineTo(bx - st.basket.w * 0.72 - 8, by + st.basket.h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bx + st.basket.w * 0.72 + 8, by - 10);
        ctx.lineTo(bx + st.basket.w * 0.72 + 8, by + st.basket.h);
        ctx.stroke();
        ng();
        ctx.restore();
    }

    drawBasketWithSkin(bx, by, bw, bh);
    ctx.restore();
    requestAnimationFrame(gameLoop);
}

// ============================================================
// ===== GAME FLOW FUNCTIONS =====
// ============================================================

function startGame(resume, savedData) {
    try { getAC().resume(); } catch (e) {}
    let saved = savedData || loadProgress();
    if (resume && saved && saved.level > 1) {
        initLevel(saved.level, saved.score, saved.lives || 3);
    } else {
        initLevel(1, 0, 3);
    }
    hideHomePage();
    showOv(null);
    st.running = true;
    lastFrameTime = 0;
    startMusic(0);
    requestAnimationFrame(gameLoop);
}

function nextLevel() {
    st.level++;
    initLevel(st.level, st.score, st.lives);
    startMusic(0);
    showOv(null);
    st.running = true;
    requestAnimationFrame(gameLoop);
}

function onLevelComplete() {
    st.running = false;
    saveProgress();
    saveProgressToCloud();
    saveLB();
    sfxLevelUp();
    if (st.level % 5 === 0) { showTask(); return; }
    if (st.level % 50 === 0) { showCelebration(); return; }
    showLevelComplete();
}

function showTask() {
    const td = TASKS[Math.floor(Math.random() * TASKS.length)];
    st.taskDef = td;
    st.taskCaught = 0;
    document.getElementById('taskDesc').textContent = '👉 ' + td.desc;
    document.getElementById('taskProg').textContent = '0 / ' + td.count;
    document.getElementById('taskFill').style.width = '0%';
    updateTaskHud();
    showOv('taskOv');
}

function showLevelComplete() {
    const emoji = '🎉';
    document.getElementById('lvEmoji').textContent = emoji;
    document.getElementById('lvTitle').textContent = 'Level ' + st.level + ' Complete!';
    document.getElementById('lvScore').textContent = 'Score: ' + st.score.toLocaleString();
    const cfg = getLevelConfig(st.level + 1);
    document.getElementById('lvSub').innerHTML = 'Next target: <b style="color:#FFD700;">' + cfg.target + '</b> candies<br>💪 Keep going!';
    showOv('levelOv');
}

function showCelebration() {
    sfxSurprise();
    spawnConfetti(60);
    saveLB();
    document.getElementById('celebEmoji').textContent = '🏆';
    document.getElementById('celebTitle').textContent = 'Level ' + st.level.toLocaleString() + '!';
    document.getElementById('celebSub').innerHTML = 'Amazing progress!\nScore: ' + st.score.toLocaleString() + '\n💾 Progress Saved!';
    showOv('celebOv');
}

function afterCeleb() { showLevelComplete(); }

function startTaskPlay() {
    try { getAC().resume(); } catch (e) {}
    showOv(null);
    st.inTask = true;
    st.taskCaught = 0;
    st.items = [];
    st.running = true;
    requestAnimationFrame(gameLoop);
}

function onTaskComplete() {
    st.running = false;
    sfxTaskDone();
    sfxLife();
    st.lives = Math.min(st.lives + 1, 5);
    updateHUD();
    st.inTask = false;
    st.taskDef = null;
    updateTaskHud();
    document.getElementById('celebEmoji').textContent = '🎯';
    document.getElementById('celebTitle').textContent = 'Task Complete!';
    document.getElementById('celebSub').innerHTML = 'Excellent! +1 ❤️ Life gained!';
    showOv('celebOv');
}

function endGame(isBomb) {
    st.running = false;
    stopMusic();
    if (isBomb) {
        sfxBomb();
        triggerShake(18, 35);
        document.getElementById('goEmoji').textContent = '💥';
        document.getElementById('goTitle').textContent = 'BOOM!';
        document.getElementById('goTitle').style.color = '#FF4400';
        document.getElementById('goScore').textContent = 'Score: ' + st.score.toLocaleString();
        document.getElementById('goSub').innerHTML = 'You reached level ' + st.level + '.\nSaved progress — you can continue!';
    } else {
        sfxGameOver();
        document.getElementById('goEmoji').textContent = '💔';
        document.getElementById('goTitle').textContent = 'Game Over!';
        document.getElementById('goTitle').style.color = '#FF4466';
        document.getElementById('goScore').textContent = 'Score: ' + st.score.toLocaleString();
        document.getElementById('goSub').innerHTML = 'You reached level ' + st.level + '.\nSaved progress — you can continue!';
    }
    saveProgress();
    saveProgressToCloud();
    saveLB();
    showOv('goOv');
}

// ============================================================
// ===== PAUSE, ROADMAP, DAILY, SETTINGS =====
// ============================================================

function togglePause() {
    if (!st.running) return;
    const pauseOv = document.getElementById('pauseOv');
    if (!isGamePaused) {
        isGamePaused = true;
        if (pauseOv) pauseOv.style.display = 'flex';
        stopMusic();
    } else {
        isGamePaused = false;
        if (pauseOv) pauseOv.style.display = 'none';
        if (musicEnabled) startMusic(0);
    }
}

function showRoadmap() {
    showOv('roadmapOv');
    const saved = loadProgress();
    const curLevel = saved ? saved.level : 1;
    const worlds = [
        { id: 0, emoji: '👑', name: 'Candy Kingdom', min: 1, max: 10000, color: '#FF4DA6' }
    ];
    let html = '';
    worlds.forEach(w => {
        const pct = Math.round((curLevel / 10000) * 100);
        html += `<div class="roadmap-world" style="border-left-color: ${w.color};">
            <div class="roadmap-header">
                <span class="roadmap-emoji">${w.emoji}</span>
                <div class="roadmap-name">${w.name} ▶ Current</div>
                <div class="roadmap-range">${w.min}-${w.max}</div>
            </div>
            <div class="roadmap-current">📍 You are here: Level ${curLevel}</div>
            <div style="height:6px; background:rgba(255,255,255,0.1); border-radius:3px; margin:6px 0;">
                <div style="width:${pct}%; height:100%; background:${w.color}; border-radius:3px;"></div>
            </div>
            <div style="font-size:12px; color:#FFD700;">${curLevel.toLocaleString()} / 10,000 (${pct}%)</div>
        </div>`;
    });
    document.getElementById('roadmapContent').innerHTML = html;
}

function closeRoadmap() { showHomePage(); }

// ===== DAILY REWARD =====
const DAILY_KEY = 'cm_daily_v1';
const STREAK_KEY = 'cm_streak_v1';
const WHEEL_SEGMENTS = [
    { label: '+500', emoji: '⭐', color: '#FF4DA6', reward: { type: 'pts', val: 500 } },
    { label: '+2 ❤️', emoji: '❤️', color: '#FF3366', reward: { type: 'lives', val: 2 } },
    { label: '+1000', emoji: '💎', color: '#FFD700', reward: { type: 'pts', val: 1000 } },
    { label: '🛡️', emoji: '🛡️', color: '#845EF7', reward: { type: 'shield', val: 1 } },
    { label: '+3 ❤️', emoji: '💖', color: '#FF6EB4', reward: { type: 'lives', val: 3 } },
    { label: '+200', emoji: '🍬', color: '#10D4AA', reward: { type: 'pts', val: 200 } },
    { label: 'JACKPOT!', emoji: '🏆', color: '#FF8C00', reward: { type: 'jackpot', val: 5000 } }
];
let wheelAngle = 0,
    wheelSpinning = false;

function getDailyData() { try { return JSON.parse(localStorage.getItem(DAILY_KEY) || 'null'); } catch { return null; } }

function setDailyData(d) { localStorage.setItem(DAILY_KEY, JSON.stringify(d)); }

function getStreak() { try { return JSON.parse(localStorage.getItem(STREAK_KEY) || '{streak:0,lastDate:""}'); } catch { return { streak: 0, lastDate: "" }; } }

function setStreak(d) { localStorage.setItem(STREAK_KEY, JSON.stringify(d)); }

function getTodayStr() { return new Date().toISOString().slice(0, 10); }

function canClaimToday() { const d = getDailyData(); if (!d) return true; return d.lastClaim !== getTodayStr(); }

function checkDailyBadge() { const badge = document.getElementById('dailyBadge'); if (badge) badge.style.display = canClaimToday() ? 'block' : 'none'; }

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
    if (already) updateCooldownTimer();
}
let cooldownTimerInterval = null;

function updateCooldownTimer() {
    if (cooldownTimerInterval) clearInterval(cooldownTimerInterval);
    cooldownTimerInterval = setInterval(() => {
        const now = new Date();
        const tomorrow = new Date();
        tomorrow.setHours(24, 0, 0, 0);
        const diff = tomorrow - now;
        if (diff <= 0) {
            clearInterval(cooldownTimerInterval);
            document.getElementById('spinCooldown').style.display = 'none';
            document.getElementById('spinBtnEl').disabled = false;
            document.getElementById('spinBtnEl').style.opacity = '1';
            document.getElementById('spinBtnEl').textContent = 'Spin Now';
            return;
        }
        const h = Math.floor(diff / 3600000),
            m = Math.floor((diff % 3600000) / 60000),
            s = Math.floor((diff % 60000) / 1000);
        document.getElementById('cooldownTimer').textContent = `${h}h ${m}m ${s}s`;
    }, 1000);
}

function renderStreak() {
    const sd = getStreak();
    const streak = sd.streak || 0;
    const row = document.getElementById('streakRow');
    const msg = document.getElementById('streakMsg');
    let html = '';
    for (let i = 0; i < 7; i++) {
        let cls = 'future';
        if (i < streak % 7) cls = 'done';
        if (i === streak % 7 && canClaimToday()) cls = 'today';
        html += `<div class="streak-dot ${cls}">${cls==='done'?'✓':'🍬'}</div>`;
    }
    row.innerHTML = html;
    msg.textContent = streak === 0 ? 'Spin daily for rewards!' : `🔥 ${streak} day streak!`;
}

function drawWheel(angle) {
    const c = document.getElementById('wheelCanvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    const cx = 110,
        cy = 110,
        r = 100;
    ctx.clearRect(0, 0, 220, 220);
    const segAngle = (Math.PI * 2) / WHEEL_SEGMENTS.length;
    for (let i = 0; i < WHEEL_SEGMENTS.length; i++) {
        const seg = WHEEL_SEGMENTS[i];
        const start = angle + i * segAngle;
        const end = start + segAngle;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, start, end);
        ctx.closePath();
        ctx.fillStyle = seg.color;
        ctx.fill();
        ctx.save();
        ctx.translate(cx + Math.cos(start + segAngle / 2) * r * 0.65, cy + Math.sin(start + segAngle / 2) * r * 0.65);
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
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#FFD700';
    ctx.fill();
    ctx.shadowBlur = 0;
}

function spinWheel() {
    if (wheelSpinning || !canClaimToday()) return;
    const winIdx = Math.floor(Math.random() * WHEEL_SEGMENTS.length);
    const spins = 5 + Math.random() * 3;
    const targetAngle = spins * Math.PI * 2 + (winIdx * (Math.PI * 2 / WHEEL_SEGMENTS.length));
    const startAngle = wheelAngle;
    const duration = 3000;
    const startTime = performance.now();
    wheelSpinning = true;

    function animate(now) {
        const t = Math.min((now - startTime) / duration, 1);
        wheelAngle = startAngle + targetAngle * (1 - Math.pow(1 - t, 3));
        drawWheel(wheelAngle);
        if (t < 1) requestAnimationFrame(animate);
        else { wheelSpinning = false;
            claimReward(WHEEL_SEGMENTS[winIdx]); }
    }
    requestAnimationFrame(animate);
}

function claimReward(seg) {
    setDailyData({ lastClaim: getTodayStr() });
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
            sfxSurprise();
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

function closeDailyReward() { if (cooldownTimerInterval) clearInterval(cooldownTimerInterval);
    showHomePage(); }

// ===== SETTINGS =====
function loadSettings() {
    const sound = localStorage.getItem('game_sound');
    const music = localStorage.getItem('game_music');
    const vib = localStorage.getItem('game_vibration');
    const pocket = localStorage.getItem('game_pocket');
    if (document.getElementById('setSound')) document.getElementById('setSound').checked = sound !== 'off';
    if (document.getElementById('setMusic')) document.getElementById('setMusic').checked = music !== 'off';
    if (document.getElementById('setVibration')) document.getElementById('setVibration').checked = vib === 'on';
    if (document.getElementById('setPocket')) document.getElementById('setPocket').checked = pocket !== 'off';
    soundEnabled = document.getElementById('setSound')?.checked ?? true;
    musicEnabled = document.getElementById('setMusic')?.checked ?? true;
    if (musicEnabled && st && st.running) startMusic(0);
    else stopMusic();
}

function saveSettings() {
    localStorage.setItem('game_sound', document.getElementById('setSound').checked ? 'on' : 'off');
    localStorage.setItem('game_music', document.getElementById('setMusic').checked ? 'on' : 'off');
    localStorage.setItem('game_vibration', document.getElementById('setVibration').checked ? 'on' : 'off');
    localStorage.setItem('game_pocket', document.getElementById('setPocket').checked ? 'on' : 'off');
    soundEnabled = document.getElementById('setSound').checked;
    musicEnabled = document.getElementById('setMusic').checked;
    if (musicEnabled && st && st.running) startMusic(0);
    else stopMusic();
}

function showSettings() {
    if (st && st.running && !isGamePaused) {
        wasGamePausedBeforeSettings = true;
        isGamePaused = true;
        stopMusic();
    } else {
        wasGamePausedBeforeSettings = false;
    }
    showOv('settingsOv');
}

function closeSettings() {
    saveSettings();
    if (wasGamePausedBeforeSettings && st && st.running) {
        isGamePaused = false;
        wasGamePausedBeforeSettings = false;
        if (musicEnabled) startMusic(0);
    }
    if (isOnHomePage) {
        showHomePage();
    } else {
        showOv(null);
    }
}

function showHelp() { showOv('helpOv'); }

function exitGame() {
    document.body.classList.remove('game-active');
    if (typeof st !== 'undefined') st.running = false;
    stopMusic();
    const overlays = ['levelOv', 'taskOv', 'celebOv', 'lbOv', 'themeOv', 'roadmapOv', 'dailyOv', 'bossOv', 'bossWinOv', 'goOv', 'settingsOv', 'helpOv', 'pauseOv'];
    overlays.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    showHomePage(currentUserName, currentUserEmail);
}

// ===== GLOBAL EXPORTS =====
window.startGame = startGame;
window.nextLevel = nextLevel;
window.startTaskPlay = startTaskPlay;
window.afterCeleb = afterCeleb;
window.logout = logout;
window.guestLogin = guestLogin;
window.showLeaderboard = showLeaderboard;
window.closeLB = closeLB;
window.showRoadmap = showRoadmap;
window.closeRoadmap = closeRoadmap;
window.showDailyReward = showDailyReward;
window.closeDailyReward = closeDailyReward;
window.spinWheel = spinWheel;
window.cycleSkin = cycleSkin;
window.showSettings = showSettings;
window.closeSettings = closeSettings;
window.showHelp = showHelp;
window.togglePause = togglePause;
window.toggleMusic = toggleMusic;
window.toggleSound = toggleSound;
window.exitGame = exitGame;

// ===== EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', () => {
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

    document.getElementById('guestLoginBtn')?.addEventListener('click', guestLogin);
    document.getElementById('settingsLogoutBtn')?.addEventListener('click', logout);
    document.getElementById('exitGameBtn')?.addEventListener('click', exitGame);
    document.getElementById('closeSettingsBtn')?.addEventListener('click', closeSettings);
    document.getElementById('helpBackBtn')?.addEventListener('click', () => { if (isOnHomePage) showHomePage();
        else showOv(null); });
    document.getElementById('resumeBtn')?.addEventListener('click', togglePause);
    document.getElementById('nextLevelBtn')?.addEventListener('click', nextLevel);
    document.getElementById('startTaskBtn')?.addEventListener('click', startTaskPlay);
    document.getElementById('celebContinueBtn')?.addEventListener('click', afterCeleb);
    document.getElementById('lbBackBtn')?.addEventListener('click', closeLB);
    document.getElementById('roadmapBackBtn')?.addEventListener('click', closeRoadmap);
    document.getElementById('spinBtnEl')?.addEventListener('click', spinWheel);
    document.getElementById('dailyBackBtn')?.addEventListener('click', closeDailyReward);
    document.getElementById('goContinueBtn')?.addEventListener('click', () => startGame(true));
    document.getElementById('goRestartBtn')?.addEventListener('click', () => startGame(false));

    document.getElementById('settingsBtn')?.addEventListener('click', showSettings);
    document.getElementById('musicToggleBtn')?.addEventListener('click', toggleMusic);
    document.getElementById('soundToggleBtn')?.addEventListener('click', toggleSound);
    document.getElementById('pauseBtn')?.addEventListener('click', togglePause);
});

// ---- Input events ----
canvas.addEventListener('mousemove', e => { if (st.running) moveB(e.clientX); });
canvas.addEventListener('touchmove', e => { e.preventDefault(); if (st.running) moveB(e.touches[0].clientX); }, { passive: false });
canvas.addEventListener('touchstart', e => { e.preventDefault(); if (st.running) moveB(e.touches[0].clientX); }, { passive: false });

console.log("✅ Candy Mass - FINAL VERSION Loaded!");
console.log(`🎨 90+ Candy Types Available (${CANDY_COLORS.length} colors × ${CANDY_SHAPES.length} shapes × ${CANDY_SIZES.length} sizes)`);
console.log("💣 5 Bomb Types: Game Over, -Life, -Target, -Score, Basket Reset");
console.log("🎯 Target: 250 candies at Level 10000");
