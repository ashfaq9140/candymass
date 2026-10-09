// ============================================================
// ===== CANDY MASS - 10,000 LEVEL ENGINE (v4.0 FIXED) =========
// ------------------------------------------------------------
//  FIXES / CHANGES IN THIS VERSION
//  1. TASK LEVEL (har 5th level) me SPECIAL CANDY ab SACH ME
//     generate hoti hai (pehle sirf normal candy aati thi).
//  2. Level target ab progressive curve par chalta hai:
//     L1 = 10 candies ... L10000 = 120 candies. 9999 tak 120
//     NAHI hota (sirf level 10000 par 120).
//  3. Har level ke saath SPEED aur BOMB CHANCE badhta hai.
//  4. 3 themes ek-ek karke chalti hain, purani puri ruk jati hai:
//     1-3500 = Candy, 3501-7000 = Fish, 7001-10000 = Coffee.
//     Har theme ka apna sprite sheet, apne bomb IDs aur apne
//     shield / 10X power-up IDs hain (neeche WORLD_SHEETS dekho).
//  5. Bomb ID mapping sheet ke hisaab se define ki gayi hai
//     (fish / coffee sheets me bomb sprite par koi label nahi tha).
//     Bomb, Shield aur 10X items ke upar colour ring + label
//     draw hota hai, isliye turant pehchane jaate hain.
//  6. Purana duplicate code (do startGame, do renderGame,
//     undefined st.items / st.particles / st.confetti) hata diya.
// ============================================================

// ============================================================
// ===== 1. WORLD / SPRITE SHEET CONFIGURATION ================
// ============================================================
const COLS = 8;          // har sheet me 8 columns
const ROWS = 5;          // default rows (fish sheet 4 use karti hai)
const MAX_TARGET = 120;  // level 10000 ka target

const WORLD_SHEETS = {
    candy: {
        urls: ['candy-sheet.png', 'candysheet.png', 'candy sheet.png', 'candy-sheet.jpeg', 'candy-sheet.jpg', 'candy.png'],
        cols: 8, rows: 5,
        empty: [],
        bombs: {
            33: 'game-over',     // row5 col1  BOOM  -> instant Game Over
            34: 'life-reduce',   // row5 col2  X     -> -1 Life
            35: 'target-reduce', // row5 col3  striped bomb -> target +15
            40: 'score-reduce'   // row5 col8  SKULL -> -500 score
        },
        shieldId: 21,   // row3 col5  rainbow cube
        multiId: 23     // row3 col7  10X purple candy
    },
    fish: {
        urls: ['fish-sheet.png', 'fishsheet.png', 'fish sheet.png', 'fish-sheet.jpeg', 'fish-sheet.jpg', 'fish.png'],
        cols: 8, rows: 4,
        empty: [],                       // fish sheet me saare 32 tiles bhare hue hain
        bombs: {
            8: 'game-over',      // X-marked fish  -> instant Game Over
            13: 'life-reduce',   // seahorse       -> -1 Life
            31: 'target-reduce', // aquatic plant  -> target +15
            6: 'score-reduce'    // gold sparkles  -> -500 score
        },
        shieldId: 5,    // rainbow fish
        multiId: 7      // rainbow spiral bean (bomb ID 6 se alag rakha gaya hai)
    },
    coffee: {
        urls: ['coffee-sheet.png', 'coffeesheet.png', 'coffee sheet.png', 'coffee-sheet.jpeg', 'coffee-sheet.jpg', 'coffee.png'],
        cols: 8, rows: 5,
        empty: [36, 38],                 // sheet ki khaali jagah
        bombs: {
            34: 'game-over',     // X COFFEE badge -> instant Game Over
            40: 'life-reduce',   // DONE badge     -> -1 Life
            35: 'target-reduce', // star coffee    -> target +15
            17: 'score-reduce'   // grinder        -> -500 score
        },
        shieldId: 39,   // rainbow bean
        multiId: 37     // shiny purple bean
    }
};

function getWorldKey(lvl) {
    if (lvl <= 3500) return 'candy';
    if (lvl <= 7000) return 'fish';
    return 'coffee';
}

const WORLD_META = {
    candy: {
        name: '🍬 Candy Kingdom',
        bg: '#060012',
        topBar: 'linear-gradient(90deg,#0A001E,#1A0040)',
        bgTop: '#0a0018',
        bgBottom: '#1a0330',
        bar1: '#ff007f',
        bar2: '#ffaa00',
        taskTitle: 'Sweet Task!'
    },
    fish: {
        name: '🐟 Deep Sea Fish',
        bg: '#001133',
        topBar: 'linear-gradient(90deg,#001028,#00305c)',
        bgTop: '#000b1e',
        bgBottom: '#001a3a',
        bar1: '#00f6ff',
        bar2: '#00ffaa',
        taskTitle: 'Deep Sea Task!'
    },
    coffee: {
        name: '☕ Premium Coffee',
        bg: '#1a0d00',
        topBar: 'linear-gradient(90deg,#1a0d00,#3a1e05)',
        bgTop: '#140a00',
        bgBottom: '#2d1600',
        bar1: '#d4a373',
        bar2: '#faedcd',
        taskTitle: 'Coffee Task!'
    }
};

// ===== SPRITE SHEET LOADER (per world) =====
const worldImages = {};
const worldReady = {};
const worldCells = {};

function getValidIds(key) {
    const w = WORLD_SHEETS[key];
    const total = w.cols * w.rows;
    const ids = [];
    for (let i = 1; i <= total; i++) {
        if (w.empty.indexOf(i) === -1) ids.push(i);
    }
    return ids;
}

// Sprite sheets me kabhi-kabhi do sprite ek dusre se tak jaate hain (jaise fish
// sheet me seahorse ke niche egg cluster). Isliye crop nikaalte waqt pehle
// content-ke-runs dhoondh kar sabse bada run rakhte hain - isse padosi sprite
// ke tukde tile me nahi ghusenge.
function profileRuns(profile, thr) {
    const out = [];
    let start = -1;
    for (let i = 0; i < profile.length; i++) {
        if (profile[i] > thr && start === -1) start = i;
        else if (profile[i] <= thr && start !== -1) { out.push([start, i - 1]); start = -1; }
    }
    if (start !== -1) out.push([start, profile.length - 1]);
    return out.filter(r => (r[1] - r[0]) >= 2);
}

function computeCellBounds(key, img) {
    const w = WORLD_SHEETS[key];
    const cw = img.width / w.cols;
    const ch = img.height / w.rows;
    const cv = document.createElement('canvas');
    cv.width = img.width;
    cv.height = img.height;
    const c2 = cv.getContext('2d', { willReadFrequently: true });
    c2.drawImage(img, 0, 0);
    const cells = {};
    for (let idx = 1; idx <= w.cols * w.rows; idx++) {
        const row = Math.floor((idx - 1) / w.cols);
        const col = (idx - 1) % w.cols;
        const sx = Math.max(0, Math.round(col * cw));
        const sy = Math.max(0, Math.round(row * ch));
        const sw = Math.min(Math.round(cw), img.width - sx);
        const sh = Math.min(Math.round(ch), img.height - sy);

        let data = null;
        try {
            data = c2.getImageData(sx, sy, sw, sh).data;
        } catch (e) {
            cells[idx] = { sx: sx, sy: sy, sw: sw, sh: sh };
            continue;
        }

        // mask + row/column content profiles
        const colSum = new Int32Array(sw);
        const rowSum = new Int32Array(sh);
        let content = 0;
        for (let y = 0; y < sh; y++) {
            for (let x = 0; x < sw; x++) {
                const p = (y * sw + x) * 4;
                const a = data[p + 3];
                const r = data[p], g = data[p + 1], b = data[p + 2];
                const lum = r > g ? (r > b ? r : b) : (g > b ? g : b);
                if (a > 16 && lum > 40) {
                    colSum[x]++;
                    rowSum[y]++;
                    content++;
                }
            }
        }
        if (content === 0) {
            cells[idx] = { sx: sx, sy: sy, sw: sw, sh: sh };
            continue;
        }

        const colThr = Math.max(1, Math.floor(sh * 0.05));
        const rowThr = Math.max(1, Math.floor(sw * 0.05));

        // ---- horizontal: biggest content run ----
        let x0 = 0, x1 = sw - 1;
        const cruns = profileRuns(colSum, colThr);
        if (cruns.length) {
            let best = cruns[0], bestScore = -1;
            for (const r of cruns) {
                let s = 0;
                for (let i = r[0]; i <= r[1]; i++) s += colSum[i];
                if (s > bestScore) { bestScore = s; best = r; }
            }
            x0 = best[0]; x1 = best[1];
        } else {
            for (let x = 0; x < sw; x++) if (colSum[x] > 0) { x0 = x; break; }
            for (let x = sw - 1; x >= 0; x--) if (colSum[x] > 0) { x1 = x; break; }
        }
        const runW = x1 - x0 + 1;

        // ---- vertical: biggest content run (within the chosen columns) ----
        const subRowSum = new Int32Array(sh);
        for (let y = 0; y < sh; y++) {
            let s = 0;
            for (let x = x0; x <= x1; x++) {
                const p = (y * sw + x) * 4;
                const a = data[p + 3];
                const r = data[p], g = data[p + 1], b = data[p + 2];
                const lum = r > g ? (r > b ? r : b) : (g > b ? g : b);
                if (a > 16 && lum > 40) s++;
            }
            subRowSum[y] = s;
        }
        const rruns = profileRuns(subRowSum, rowThr);
        let y0 = 0, y1 = sh - 1;
        if (rruns.length) {
            let bestR = rruns[0], bestRScore = -1;
            for (const r of rruns) {
                let s = 0;
                for (let i = r[0]; i <= r[1]; i++) s += subRowSum[i];
                if (s > bestRScore) { bestRScore = s; bestR = r; }
            }
            y0 = bestR[0]; y1 = bestR[1];
        } else {
            for (let y = 0; y < sh; y++) if (subRowSum[y] > 0) { y0 = y; break; }
            for (let y = sh - 1; y >= 0; y--) if (subRowSum[y] > 0) { y1 = y; break; }
        }
        const runH = y1 - y0 + 1;

        // cell ke 96% se bada crop nahi (border bleed rokne ke liye), aur center rakho
        const maxW = Math.floor(sw * 0.96), maxH = Math.floor(sh * 0.96);
        let fx0 = x0, fx1 = x1, fy0 = y0, fy1 = y1;
        if (runW > maxW) {
            const cx = Math.floor((x0 + x1) / 2);
            fx0 = Math.max(0, cx - Math.floor(maxW / 2));
            fx1 = Math.min(sw - 1, fx0 + maxW - 1);
        }
        if (runH > maxH) {
            const cy = Math.floor((y0 + y1) / 2);
            fy0 = Math.max(0, cy - Math.floor(maxH / 2));
            fy1 = Math.min(sh - 1, fy0 + maxH - 1);
        }
        const pad = 1;
        fx0 = Math.max(0, fx0 - pad); fy0 = Math.max(0, fy0 - pad);
        fx1 = Math.min(sw - 1, fx1 + pad); fy1 = Math.min(sh - 1, fy1 + pad);

        cells[idx] = {
            sx: sx + fx0, sy: sy + fy0,
            sw: (fx1 - fx0) + 1, sh: (fy1 - fy0) + 1
        };
    }
    return cells;
}

function loadSheet(key) {
    const candidates = WORLD_SHEETS[key].urls.slice();
    let i = 0;
    const tryNext = () => {
        if (i >= candidates.length) {
            worldReady[key] = false;
            console.warn('Sprite sheet not found (' + key + '). Tried: ' + candidates.join(', ') +
                ' - falling back to simple shapes. Keep the sheet files in the repo root.');
            return;
        }
        const name = candidates[i++];
        const img = new Image();
        img.onload = () => {
            worldReady[key] = true;
            worldImages[key] = img;
            worldCells[key] = computeCellBounds(key, img);
            if (currentWorldKey === key) {
                currentSheet = img;
                currentSheetReady = true;
                currentSheetCells = worldCells[key];
            }
            console.log('✅ Sheet ready: ' + key + ' <- ' + name + ' (' + img.width + 'x' + img.height + ')');
        };
        img.onerror = () => { tryNext(); };
        img.src = name;
    };
    tryNext();
}

function loadSpriteSheet() {
    Object.keys(WORLD_SHEETS).forEach(k => loadSheet(k));
}

// Current world cache (theme badalne par yahi update hota hai)
let currentWorldKey = 'candy';
let currentSheet = null;
let currentSheetReady = false;
let currentSheetCells = null;

function syncWorld(level) {
    const key = getWorldKey(level);
    const cfg = WORLD_SHEETS[key];
    currentWorldKey = key;
    currentSheet = worldImages[key] || null;
    currentSheetReady = !!worldReady[key];
    currentSheetCells = worldCells[key] || null;
    // purani theme ki har cheez turant band
    st.worldKey = key;
    st.cfg = cfg;
    st.theme = WORLD_META[key];
    if (Array.isArray(st.items)) st.items.length = 0;
    updateWorldTag();
}

function updateWorldTag() {
    const tt = document.getElementById('themeTag');
    if (tt && st.theme) tt.textContent = st.theme.name;
}

// ============================================================
// ===== 2. GAME STATE ========================================
// ============================================================
const st = {
    level: 1,
    score: 0,
    lives: 3,
    running: false,
    items: [],
    particles: [],
    floats: [],
    confetti: [],
    basket: { x: 200, y: 488, w: 86, h: 26 },
    worldKey: 'candy',
    theme: WORLD_META.candy,
    cfg: WORLD_SHEETS.candy,
    speed: 3,
    spawnInterval: 90,
    spawnTimer: 0,
    bombChance: 0.01,
    levelTarget: 10,
    levelCaught: 0,
    inTask: false,
    taskKind: 'target',
    taskDef: null,
    taskCaught: 0,
    taskDone: false,
    levelCompleteTriggered: false,
    frame: 0,
    combo: 0,
    comboTimer: 0,
    shieldActive: false,
    shieldFrames: 0,
    shieldMaxFrames: 0
};

// ============================================================
// ===== 3. RESPONSIVE SCALING ================================
// ============================================================
const BASE_W = 400, BASE_H = 540;
let gameW = BASE_W, gameH = BASE_H;
let scaleX = 1, scaleY = 1;

// Device pixel ratio: high-DPI phones par canvas ko uske asli pixels se back
// karte hain, warna browser use stretch karta hai aur sprites blurry lagte hain.
let dpr = 1;
let dprScale = 1;

function getDPR() {
    return Math.min(3, Math.max(1, window.devicePixelRatio || 1));
}

function resizeCanvas() {
    const container = document.getElementById('cw');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width > 4) gameW = rect.width;
    if (rect.height > 4) gameH = rect.height;

    // ------------------------------------------------------------
    // LAPTOP/DESKTOP FIX
    // Wide screen par #app ki height 85vh hoti hai, aur top bar + HUD
    // + task bar ka space nikaal ke #cw bahut patla reh jata hai
    // (jaise 450x260). Tab basket screen ke bilkul kinare par chala
    // jata tha ya bahar — "basket dikh hi nahi rahi" bug.
    //
    // Isliye kam se kam 540px ki khelne ki height zaruri hai. Screen
    // patli ho to app ko utna lamba kar do (page thoda scroll karega,
    // par game poora dikhega).
    // ------------------------------------------------------------
    const MIN_PLAY_H = 540;
    if (gameH < MIN_PLAY_H) {
        const app = document.getElementById('app');
        if (app && app.style) {
            const need = Math.ceil(MIN_PLAY_H - gameH + 4);
            app.style.height = Math.round(window.innerHeight * 0.85 + need) + 'px';
            app.style.maxHeight = 'none';
            const r2 = container.getBoundingClientRect();
            if (r2.height > 4) gameH = Math.max(r2.height, MIN_PLAY_H);
            if (r2.width > 4) gameW = r2.width;
        } else {
            gameH = MIN_PLAY_H;
        }
    }

    dpr = getDPR();
    dprScale = dpr;
    const canvas = document.getElementById('canvas');
    if (canvas) {
        // buffer = CSS size x DPR (sharp), CSS size wahi rehti hai
        canvas.width = Math.round(gameW * dpr);
        canvas.height = Math.round(gameH * dpr);
        canvas.style.width = gameW + 'px';
        canvas.style.height = gameH + 'px';
    }
    scaleX = gameW / BASE_W;
    scaleY = gameH / BASE_H;
    layoutBasket();
}

// Basket ka size aur jagah — ek hi jagah se, taaki sab consistent rahe.
// Patli screen (laptop) par basket 2px ki patti ban jati thi, isliye
// minimum height bhi lagayi hai.
function layoutBasket() {
    if (!st || !st.basket) return;
    const scale = getBasketScale(st.level || 1);
    st.basket.w = 86 * scaleX * scale;
    st.basket.h = Math.max(14, 26 * scaleY * scale);
    st.basket.y = gameH - Math.max(52 * scaleY, 34);
    st.basket.x = Math.min(Math.max(st.basket.x, st.basket.w / 2), gameW - st.basket.w / 2);
}

function getScaledX(clientX) {
    const canvas = document.getElementById('canvas');
    if (!canvas) return gameW / 2;
    const rect = canvas.getBoundingClientRect();
    const relX = (clientX - rect.left) / rect.width;
    return relX * gameW;
}

function moveB(cx) {
    if (!st) return;
    const newX = getScaledX(cx);
    st.basket.x = Math.max(st.basket.w / 2, Math.min(gameW - st.basket.w / 2, newX));
}

// ============================================================
// ===== 4. LEVEL CURVES  (target / speed / bombs) ============
// ============================================================

// Progressive target chart.
//  L1      = 10 candy catch karo  -> level up
//  L2      = 11, L3 = 12, L5 = 13 ... (aasan ramp)
//  L3500   = 67  (Candy theme khatam)
//  L7000   = 91  (Fish theme khatam)
//  L9999   = 119
//  L10000  = 120 (yahi ek level hai jahan 120 chahiye)
// Value kabhi ghataati nahi, aur 120 se upar nahi jaati.
const TARGET_ANCHORS = [
    [1, 10], [2, 11], [4, 12], [8, 14], [15, 17], [30, 20], [60, 24], [100, 28],
    [250, 34], [500, 40], [1000, 48], [2000, 57], [3000, 64], [3500, 67], [5000, 78],
    [7000, 91], [9000, 106], [9600, 111], [9900, 115], [9970, 117], [9990, 118],
    [9995, 119], [10000, 120]
];

function rawTargetCurve(lvl) {
    for (let i = 0; i < TARGET_ANCHORS.length - 1; i++) {
        const a = TARGET_ANCHORS[i], b = TARGET_ANCHORS[i + 1];
        if (lvl <= b[0]) {
            const span = b[0] - a[0];
            const frac = span <= 0 ? 0 : (lvl - a[0]) / span;
            if (a[1] === b[1]) return a[1];
            return a[1] + (b[1] - a[1]) * Math.pow(frac, 0.9);
        }
    }
    return MAX_TARGET;
}

function getLevelTarget(lvl) {
    if (lvl <= 1) return 10;
    if (lvl >= 10000) return MAX_TARGET;   // sirf level 10000 par 120
    const raw = rawTargetCurve(Math.min(lvl, 9999));
    return Math.min(MAX_TARGET - 1, Math.max(10, Math.round(raw)));
}

// Speed: L1 ~2.7 px/frame se L10000 tak ~6.0 px/frame (cap).
// Pehle ye 8.6 tak jaati thi jo bahut tez thi.
const SPEED_MIN = 2.7;
const SPEED_MAX = 6.0;
function getSpeedForLevel(lvl) {
    const t = Math.min(lvl, 10000) / 10000;
    return SPEED_MIN + Math.pow(t, 0.62) * (SPEED_MAX - SPEED_MIN);
}

// Spawn interval (frames @60fps): L1 ~ 1.53s ... L10000 ~ 0.75s
const SPAWN_MIN = 45;
const SPAWN_MAX = 62;    // 62 frames = 1.03s (L40 ke baad se shuru)
function getSpawnIntervalForLevel(lvl) {
    // Pehle 40 level = "tutorial rush": shuru me aaram (L1 par 2 candy/level
    // type feel), phir tez hone lagta hai (L20 tak peak), phir normal curve
    // me smoothly mil jata hai — koi jump nahi.
    if (lvl <= 40) {
        const peak = 26;                     // sabse tez spawn (frames)
        if (lvl <= 20) {
            // L1: 62 frames (aaram se pakadne do) -> L20: 26 frames (rush)
            return Math.round(62 - (lvl - 1) * (62 - peak) / 19);
        }
        // L21 -> L40: 26 frames se wapas 62 frames (normal curve se milne ke liye)
        return Math.round(peak + (lvl - 20) * (62 - peak) / 20);
    }
    const t = Math.min(lvl, 10000) / 10000;
    return Math.round(SPAWN_MAX - (SPAWN_MAX - SPAWN_MIN) * Math.pow(t, 0.70));
}

// ===== WAVE (lehar) MOVEMENT SETTINGS =====
// Candy girte hue left-right lehar banati hai.
//
// TEEN alag "feels" mix hote hain — isse har candy alag behave karti hai,
// game repetitive nahi lagta (yahi addiction ka asli reason hai):
//
//   EASY        - bada, aaram se jhoolne wala
//   BALANCED    - beech ka, default feel
//   CHALLENGING - tez chhota jhoola, dhyan se khelna padta hai
//
// Level badhne par CHALLENGING candy ka chance badhta hai (0% -> 20%) aur
// EASY ka ghatta hai — isliye game dheere-dheere mushkil hota jaata hai.
const WAVE_EASY = { amp: 0.28, period: 4.5, ampBias: 0.95, safety: 0.90 };
const WAVE_BAL  = { amp: 0.20, period: 2.3, ampBias: 0.50, safety: 0.85 };
const WAVE_HARD = { amp: 0.16, period: 1.4, ampBias: 0.20, safety: 0.80 };
// Koi bhi candy itni chhoti lehar na kare ki dikhe hi na
const WAVE_MIN_AMP = 42;

// period (seconds) -> per frame phase step (60 FPS par)
function periodToFreq(periodSec) {
    return (Math.PI * 2) / (periodSec * 60);
}

// Ek candy kitna left-right ja sakti hai — screen ke andar rehne ke liye.
// (amp * 1.12 = jitter ka hisaab, 1.52 = dono taraf + margin)
function maxAmpForScreen() {
    return (gameW * 0.94) / (2 * 1.12 * 1.52);
}

// ------------------------------------------------------------
// ZARURI: sideways speed falling speed se tez nahi honi chahiye.
//   peakSideways (px/frame) = amp * freq
// Isliye amplitude ki limit falling speed se nikalte hain:
//   ampMax = safety * fallingSpeed / freq
// Isse low level par jhoola chhota (aasan) aur high level par bada hota hai.
// ------------------------------------------------------------
function ampCapFor(preset, fallingSpeed) {
    return (preset.safety * fallingSpeed) / periodToFreq(preset.period);
}

// Jab amplitude ka floor lagta hai (low level par), to frequency ko itna
// dheema kar do ki peak sideways speed phir bhi falling speed ke andar rahe:
//   peak = amp * freq  =>  freqMax = safety * fallingSpeed / amp
// Isse dono cheezein ek saath poori hoti hain — candy dikhti bhi hai aur
// sideways motion falling se tez bhi nahi hoti.
function ampSpeedCapFreq(amp, safety, fallingSpeed) {
    if (amp <= 0) return Infinity;
    return (safety * fallingSpeed) / amp;
}

// Level ke hisaab se teeno ka weight (total = 1)
function getWaveWeights(lvl) {
    const t = Math.min(lvl, 10000) / 10000;
    const hard = Math.pow(t, 0.45) * 0.20;          // L1: 0%   -> L10000: 20%
    let easy = 0.58 - Math.pow(t, 0.55) * 0.38;     // L1: 58%  -> L10000: 20%
    if (easy < 0.20) easy = 0.20;
    const bal = Math.max(0, 1 - easy - hard);
    return { easy: easy, bal: bal, hard: hard };
}

// Envelope (purane API/tests ke liye)
function getWaveConfig(lvl) {
    const w = getWaveWeights(lvl);
    return {
        ampMin: 0.14,
        ampMax: 0.28,
        freqMin: periodToFreq(WAVE_EASY.period),
        freqMax: periodToFreq(WAVE_HARD.period),
        weights: w
    };
}

function makeWave(lvl) {
    const cfg = getWaveConfig(lvl);
    const w = cfg.weights;
    // teeno me se ek chuno (weighted random)
    const r = Math.random();
    let preset;
    if (r < w.easy) preset = WAVE_EASY;
    else if (r < w.easy + w.bal) preset = WAVE_BAL;
    else preset = WAVE_HARD;

    const freq = periodToFreq(preset.period);
    const fallSpeed = getSpeedForLevel(lvl);

    // amplitude: preset ka hissa + level ke saath bias, phir safety cap
    const lvlT = Math.min(1, Math.max(0, (lvl - 1) / 9999));
    const frac = preset.ampBias + (1 - preset.ampBias) * Math.pow(lvlT, 0.7);
    let amp = gameW * preset.amp * frac;
    // halka variation, taaki do candy bilkul same na lagein
    amp *= 0.92 + Math.random() * 0.16;                 // +/-8%

    // speed cap + screen cap
    amp = Math.min(amp, ampCapFor(preset, fallSpeed), maxAmpForScreen());

    // ------------------------------------------------------------
    // MINIMUM floor: low level par speed cap bahut tight ho jata hai
    // (L1 par hard candy ka amp sirf ~12px reh jata tha — wo dikhta hi
    // nahi tha, "candy gayab" jaisa lagta tha). Isliye kam se kam itna
    // jhoola zaruri hai.
    // ------------------------------------------------------------
    const ampFloor = Math.min(WAVE_MIN_AMP, maxAmpForScreen());
    if (amp < ampFloor) amp = ampFloor;

    // floor lagne ke baad frequency ko bhi cap karo, taaki peak sideways
    // speed abhi bhi falling speed ke andar rahe
    let outFreq = freq * (0.94 + Math.random() * 0.12);     // +/-6% variation
    const fCap = ampSpeedCapFreq(amp, preset.safety, fallSpeed);
    if (outFreq > fCap) outFreq = fCap;

    const direction = Math.random() < 0.5 ? -1 : 1;
    return {
        amp: amp,
        freq: outFreq,
        // phase 0 se shuru: spawn par candy apni jagah par hi rehti hai,
        // phir smoothly ek taraf jhoolna shuru karti hai (koi jump nahi).
        phase: 0,
        direction: direction,
        waveKind: preset === WAVE_EASY ? 'easy' : (preset === WAVE_BAL ? 'balanced' : 'hard')
    };
}

// Bomb probability: L1 1% ... L10000 12%
function getBombChance(lvl) {
    const t = Math.min(lvl, 10000) / 10000;
    return 0.01 + Math.pow(t, 0.95) * 0.11;
}

function getBasketScale(level) {
    if (level < 3000) return 1.0;
    if (level < 5000) return 0.97;
    if (level < 7000) return 0.94;
    return 0.90;
}

function getLevelConfig(lvl) {
    return {
        speed: getSpeedForLevel(lvl),
        interval: getSpawnIntervalForLevel(lvl),
        target: getLevelTarget(lvl),
        bombChance: getBombChance(lvl)
    };
}

// ============================================================
// ===== GIFT BOX (rare, level 100 ke baad) ===================
// Bahut kam milta hai, par pakadne par +2 se +5 lives deta hai.
// (Purane CandyRainPro me tha, wapas add kiya.)
// ============================================================
const GIFT_TYPES = [
    { lives: 2, pts: 50,  color: '#FF4DA6', color2: '#FF85C8', stroke: '#CC0066', label: '+2' },
    { lives: 3, pts: 80,  color: '#FFD700', color2: '#FFF066', stroke: '#CC9900', label: '+3' },
    { lives: 4, pts: 120, color: '#00E0FF', color2: '#AAFFFF', stroke: '#0088CC', label: '+4' },
    { lives: 5, pts: 150, color: '#A855F7', color2: '#D09BFF', stroke: '#7C3AED', label: '+5' }
];

// Level 100 se pehle gift nahi. Baad me bahut halka badhta hai.
function getGiftChance(lvl) {
    if (lvl < 100) return 0;
    if (lvl < 300) return 0.008;
    if (lvl < 1000) return 0.012;
    if (lvl < 3000) return 0.016;
    return 0.02;                       // max 2%
}

// Bade gift (zyada lives) high level par
function pickGiftType(lvl) {
    const r = Math.random();
    if (lvl >= 5000 && r < 0.25) return GIFT_TYPES[3];   // +5
    if (lvl >= 2000 && r < 0.35) return GIFT_TYPES[2];   // +4
    if (lvl >= 500 && r < 0.5) return GIFT_TYPES[1];     // +3
    return GIFT_TYPES[0];                                // +2
}

// ===== TASK (har 5th level) =====
// Task me kitni special candy chahiye. Pehle sirf 3 thi (aur uske baad life
// milti thi) jo bahut aasan tha. Ab level ke saath 5 se 22 tak badhti hai.
function taskTargetCount(lvl) {
    const t = Math.min(lvl, 10000) / 10000;
    return 5 + Math.round(Math.pow(t, 0.85) * 17);
}

function isTaskLevel(lvl) { return lvl % 5 === 0 && lvl > 0; }

// Task ke liye special candy: aate-aate poori candy pool unlock hoti hai.
// Isse guarantee hai ki task wali candy sheet me maujood hai (bomb nahi).
function pickTaskTargetId() {
    const ids = getValidIds(currentWorldKey).filter(id => !isBombId(id));
    const lvl = st.level;
    let poolSize;
    if (lvl < 5) poolSize = 8;
    else if (lvl < 25) poolSize = 12;
    else if (lvl < 100) poolSize = 16;
    else if (lvl < 500) poolSize = 22;
    else poolSize = 28;
    const pool = ids.filter(id => id <= poolSize);
    const list = pool.length ? pool : ids.slice(0, 8);
    return list[Math.floor(Math.random() * list.length)];
}

function makeTaskDef() {
    const kind = Math.random() < 0.5 ? 'target' : 'special';
    const count = taskTargetCount(st.level);
    if (kind === 'target') {
        const id = pickTaskTargetId();
        return { kind: 'target', targetId: id, count: count, desc: 'Catch only the SPECIAL candy' };
    }
    return { kind: 'special', count: count, desc: 'Catch only SHIELD / 10X power-ups' };
}

// ============================================================
// ===== 5. BOMB SYSTEM =======================================
// ============================================================
const BOMB_DEFS = {
    'game-over': { label: '💥', color: '#FF0000', text: 'Game Over' },
    'life-reduce': { label: '💔', color: '#FF4444', text: '-1 Life' },
    'target-reduce': { label: '📉', color: '#FF8800', text: 'Target +15' },
    'score-reduce': { label: '💰', color: '#FFAA00', text: '-500 Score' }
};

function isBombId(id) { return !!st.cfg.bombs[id]; }

function getBombTypeForId(id) {
    const eff = st.cfg.bombs[id];
    if (!eff) return null;
    const d = BOMB_DEFS[eff];
    return { effect: eff, label: d.label, color: d.color, text: d.text };
}

function updateBombLegend() {
    const el = document.getElementById('bombLegend');
    if (!el) return;
    const b = st.cfg.bombs;
    const parts = Object.keys(b).map(id => {
        const d = BOMB_DEFS[b[id]];
        return '<span style="color:' + d.color + '">' + d.label + ' ' + d.text + '</span>';
    });
    el.innerHTML = '💣 ' + parts.join(' &nbsp;|&nbsp; ');
}

// ============================================================
// ===== 6. SPAWNING ==========================================
// ============================================================
function buildNormalCandy() {
    const valid = getValidIds(currentWorldKey).filter(id => !isBombId(id));
    const N = valid.length;
    const bias = 1.5;
    let i = Math.floor(Math.pow(Math.random(), bias) * N);
    if (i >= N) i = N - 1;
    if (i < 0) i = 0;
    return valid[i];
}

function taskSpawnKey() {
    if (st.taskKind === 'target') {
        return Math.random() < 0.72 ? 'TARGET' : 'OTHER';
    }
    return Math.random() < 0.22 ? 'POWER' : 'NORMAL';
}

function makeFallingItem(candyId, opts) {
    opts = opts || {};
    const size = (38 + Math.random() * 18) * scaleX;
    const initialX = 30 * scaleX + Math.random() * (gameW - 60 * scaleX);
    const drift = Math.random() < 0.5 ? -1 : 1;
    const bombType = getBombTypeForId(candyId);
    const wave = makeWave(st.level);
    return {
        candyId: candyId,
        x: initialX,
        y: -40 * scaleY,
        w: size,
        h: size,
        r: size / 2,
        size: size,
        speed: (st.speed + (1.0 + Math.random() * 0.9)) * (1 + Math.min(st.level, 10000) * 0.0004),
        startX: initialX,          // wave isi center ke around hilta hai
        // ---- lehar (wave) parameters ----
        waveAmp: wave.amp,
        waveFreq: wave.freq,
        waveKind: wave.waveKind,
        wavePhase: 0,        // spawn par offset 0 -> koi jump nahi
        waveAge: 0,          // ease-in ke liye (pehle 0.25s me amplitude badhti hai)
        waveDirection: wave.direction,
        rot: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() * 0.04 + 0.01) * drift,
        isBomb: !!bombType,
        bombType: bombType,
        isShield: candyId === st.cfg.shieldId,
        isMulti: candyId === st.cfg.multiId,
        isTarget: !!opts.isTarget,
        isDecoy: !!opts.isDecoy,
        pulse: Math.random() * Math.PI * 2
    };
}

function pushItem(item) { if (st.items.length < 28) st.items.push(item); }

function decideSpawn() {
    // --- TASK LEVEL: task ke alawa candies kabhi bomb nahi hoti ---
    if (st.inTask) {
        const key = taskSpawnKey();
        if (key === 'TARGET') {
            pushItem(makeFallingItem(st.taskDef.targetId, { isTarget: true }));
        } else if (key === 'POWER') {
            pushItem(makeFallingItem(Math.random() < 0.5 ? st.cfg.shieldId : st.cfg.multiId));
        } else {
            let id;
            do { id = buildNormalCandy(); }
            while (st.taskKind === 'target' && id === st.taskDef.targetId);
            pushItem(makeFallingItem(id, { isDecoy: true }));
        }
        return;
    }

    // --- NORMAL LEVEL ---
    // gift box sirf level 100+, normal level me (task me nahi)
    if (Math.random() < getGiftChance(st.level)) {
        const gift = pickGiftType(st.level);
        const item = makeFallingItem(buildNormalCandy());
        item.isGift = true;
        item.gift = gift;
        item.isBomb = false;
        item.bombType = null;
        item.isShield = false;
        item.isMulti = false;
        item.waveAmp = 0;                 // gift seedha girta hai, aasan pakadna
        item.waveFreq = 0;
        item.speed = Math.max(1.6, st.speed * 0.62);   // dheema — pakadne do
        item.size = item.size * 1.15;
        item.r = item.size / 2;
        pushItem(item);
        return;
    }
    if (Math.random() < st.bombChance) {
        const bombIds = Object.keys(st.cfg.bombs).map(Number);
        pushItem(makeFallingItem(bombIds[Math.floor(Math.random() * bombIds.length)]));
        return;
    }
    pushItem(makeFallingItem(buildNormalCandy()));
}

function spawnBurst() {
    let burstCount;
    if (st.level < 50) burstCount = 1 + Math.floor(Math.random() * 2);
    else if (st.level < 500) burstCount = 2;
    else if (st.level < 5000) burstCount = 2 + Math.floor(Math.random() * 2);
    else burstCount = 3;
    for (let b = 0; b < burstCount; b++) {
        const delay = b * 110;
        if (delay === 0) decideSpawn();
        else setTimeout(() => { if (st.running) decideSpawn(); }, delay);
    }
}

// ============================================================
// ===== 7. DRAWING ===========================================
// ============================================================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
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

function glow(c, b) { ctx.shadowColor = c; ctx.shadowBlur = b; }
function ng() { ctx.shadowBlur = 0; }

function drawItemSprite(item) {
    const cells = currentSheetCells;
    const cell = cells ? cells[item.candyId] : null;
    if (currentSheetReady && currentSheet && cell) {
        // Aspect ratio bachao (fish ya seahorse jaise lambe sprite stretch na ho),
        // par hitbox se bahut bada bhi na ho.
        const fit = Math.min(item.w / cell.sw, item.h / cell.sh);
        const maxScale = (item.w / Math.max(1, cell.sw)) * 1.75;
        const scale = Math.min(maxScale, fit);
        const dw = cell.sw * scale;
        const dh = cell.sh * scale;
        ctx.drawImage(currentSheet, cell.sx, cell.sy, cell.sw, cell.sh, -dw / 2, -dh / 2, dw, dh);
        return true;
    }
    ctx.beginPath();
    ctx.arc(0, 0, item.r, 0, Math.PI * 2);
    ctx.fillStyle = '#FF007F';
    ctx.fill();
    return false;
}

function drawPowerRing(item, color, label, pulseSpeed) {
    const p = Math.sin((st.frame * (pulseSpeed || 0.12)) + item.pulse) * 0.5 + 0.5;
    ctx.save();
    glow(color, 10 + p * 10);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.45 + p * 0.5;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, item.r * 1.15 + p * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ng();
    ctx.font = 'bold ' + Math.round(8 * scaleX) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(label, 0, -item.r * 1.5);
    ctx.restore();
}

function drawItem(item) {
    ctx.save();
    ctx.translate(item.x, item.y);

    if (item.isBomb) {
        const bt = item.bombType || BOMB_DEFS['game-over'];
        const p = Math.sin(st.frame * 0.3 + item.pulse) * 0.5 + 0.5;
        ctx.save();
        glow(bt.color, 12 + p * 10);
        ctx.strokeStyle = bt.color;
        ctx.globalAlpha = 0.65;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, item.r * 1.18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ng();
        ctx.restore();

        ctx.save();
        ctx.rotate(item.rot);
        drawItemSprite(item);
        ctx.restore();

        ctx.font = 'bold ' + Math.round(11 * scaleX) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        glow(bt.color, 8);
        ctx.fillStyle = bt.color;
        ctx.fillText(bt.label, 0, -item.r * 1.45);
        ng();
        ctx.restore();
        return;
    }

    if (item.isGift) {
        const g = item.gift || GIFT_TYPES[0];
        const s = item.size * 0.55;
        const p = Math.sin(st.frame * 0.18 + item.pulse) * 0.5 + 0.5;
        ctx.save();
        // chamakta glow
        glow(g.color, 16 + p * 16);
        // box ka body
        ctx.fillStyle = g.color;
        ctx.strokeStyle = g.stroke;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(-s * 0.9, -s * 0.5, s * 1.8, s * 1.4, s * 0.18);
        ctx.fill();
        ctx.stroke();
        ng();
        // ribbon (vertical)
        ctx.fillStyle = g.color2;
        ctx.fillRect(-s * 0.14, -s * 0.5, s * 0.28, s * 1.4);
        // ribbon (horizontal)
        ctx.fillRect(-s * 0.9, s * 0.05, s * 1.8, s * 0.24);
        // dhaakkan (lid)
        ctx.fillStyle = g.color2;
        ctx.strokeStyle = g.stroke;
        ctx.beginPath();
        ctx.roundRect(-s * 1.02, -s * 0.78, s * 2.04, s * 0.42, s * 0.12);
        ctx.fill();
        ctx.stroke();
        // upar ka bow
        glow(g.color2, 10);
        ctx.fillStyle = g.color2;
        ctx.beginPath();
        ctx.ellipse(-s * 0.3, -s * 0.95, s * 0.34, s * 0.2, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(s * 0.3, -s * 0.95, s * 0.34, s * 0.2, 0.5, 0, Math.PI * 2);
        ctx.fill();
        ng();
        // label
        ctx.font = 'bold ' + Math.round(11 * scaleX) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        glow('#FFFFFF', 8);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('❤️' + g.label, 0, -s * 1.5);
        ng();
        ctx.restore();
        return;
    }

    if (item.isShield) {
        ctx.save(); ctx.rotate(item.rot); drawItemSprite(item); ctx.restore();
        drawPowerRing(item, '#A855F7', '🛡️ SHIELD', 0.14);
        ctx.restore();
        return;
    }

    if (item.isMulti) {
        ctx.save(); ctx.rotate(item.rot); drawItemSprite(item); ctx.restore();
        drawPowerRing(item, '#FFD700', '✨ 10X', 0.2);
        ctx.restore();
        return;
    }

    if (item.isTarget) {
        const p = Math.sin(st.frame * 0.18 + item.pulse) * 0.5 + 0.5;
        ctx.save();
        glow('#00FFB0', 14 + p * 14);
        ctx.strokeStyle = '#00FFB0';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(0, 0, item.r * 1.2 + p * 3, 0, Math.PI * 2);
        ctx.stroke();
        ng();
        ctx.restore();

        ctx.save(); ctx.rotate(item.rot); drawItemSprite(item); ctx.restore();

        ctx.font = 'bold ' + Math.round(10 * scaleX) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        glow('#00FFB0', 8);
        ctx.fillStyle = '#00FFB0';
        ctx.fillText('★ CATCH', 0, -item.r * 1.5);
        ng();
        ctx.restore();
        return;
    }

    // Decoy (task me aam candy) bilkul normal candy jaisi dikhni chahiye.
    // Pehle ye 50% transparent thi, isliye door se pata chal jata tha ki ye
    // galat wali hai aur log galti nahi karte the. Ab same hai, taaki galti
    // se pakadne par sach me -1 life lage.
    if (item.isDecoy) {
        ctx.save();
        ctx.rotate(item.rot);
        drawItemSprite(item);
        ctx.restore();
        ctx.restore();
        return;
    }

    ctx.save(); ctx.rotate(item.rot); drawItemSprite(item); ctx.restore();
    ctx.restore();
}

function drawBg() {
    const th = st.theme;
    const g = ctx.createLinearGradient(0, 0, 0, gameH);
    g.addColorStop(0, th.bgTop);
    g.addColorStop(1, th.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, gameW, gameH);

    const t = st.frame * 0.013;
    for (let i = 0; i < 18; i++) {
        const sx = (i * 141.7 + Math.sin(t + i) * 18) % gameW;
        const sy = (i * 99.3 + st.frame * 0.05 + i * 3.5) % gameH;
        const br = 0.03 + 0.03 * Math.sin(st.frame * 0.05 + i);
        ctx.globalAlpha = br;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(sx, sy, 1 + (i % 3) * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    if (st.inTask) {
        ctx.fillStyle = 'rgba(0,255,176,0.045)';
        ctx.fillRect(0, 0, gameW, gameH);
    }
}

function drawProgressBar() {
    const pct = Math.min(1, st.levelCaught / Math.max(1, st.levelTarget));
    const th = st.theme;
    const pg = ctx.createLinearGradient(10 * scaleX, 0, 10 * scaleX + (gameW - 20 * scaleX) * pct, 0);
    pg.addColorStop(0, th.bar1);
    pg.addColorStop(1, th.bar2);
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.roundRect(10 * scaleX, 6 * scaleY, (gameW - 20 * scaleX) * pct, 8 * scaleY, 4 * scaleX);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = 'bold ' + (9 * scaleX) + 'px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(st.levelCaught + '/' + st.levelTarget, gameW - 12 * scaleX, 11 * scaleY);
}

// Har theme me 5 basket: pehla default (us theme ke pehle level se free),
// baaki 4 level se unlock hote hain. Coins se bhi pehle unlock kar sakte ho.
// unlockLevel = is level par apne aap unlock. cost = coins se jaldi unlock ka daam.
const BASKET_SKINS = [
    // ---------- CANDY THEME ----------
    { name: 'Wooden',      emoji: '🪣', theme: 'candy',  tier: 1, unlockLevel: 1,    cost: 0,
      b1: '#F0A060', b2: '#C8752A', b3: '#7A3A08', bt: '#FFD090', bm: '#E08830', pattern: 'weave' },
    { name: 'Candy Pink',  emoji: '🍬', theme: 'candy',  tier: 2, unlockLevel: 700,  cost: 800,
      b1: '#FF9EC4', b2: '#FF4D94', b3: '#B01858', bt: '#FFD1E3', bm: '#FF6BA8', pattern: 'stripes' },
    { name: 'Cupcake',     emoji: '🧁', theme: 'candy',  tier: 3, unlockLevel: 1400, cost: 1600,
      b1: '#C99BE8', b2: '#9B5FD0', b3: '#5B2E8C', bt: '#EBD4FF', bm: '#B47BE0', pattern: 'dots' },
    { name: 'Jelly Bean',  emoji: '🍭', theme: 'candy',  tier: 4, unlockLevel: 2100, cost: 2800,
      b1: '#7BE8A0', b2: '#28B463', b3: '#0E6B38', bt: '#CCFFDD', bm: '#4DD686', pattern: 'stripes' },
    { name: 'Rainbow',     emoji: '🌈', theme: 'candy',  tier: 5, unlockLevel: 2800, cost: 4500,
      b1: '#FF6B6B', b2: '#FFD93D', b3: '#845EF7', bt: '#FFFFFF', bm: '#FF9E44', pattern: 'rainbow' },

    // ---------- FISH THEME ----------
    { name: 'Wooden',      emoji: '🪣', theme: 'fish',   tier: 1, unlockLevel: 3501, cost: 0,
      b1: '#F0A060', b2: '#C8752A', b3: '#7A3A08', bt: '#FFD090', bm: '#E08830', pattern: 'weave' },
    { name: 'Coral',       emoji: '🪸', theme: 'fish',   tier: 2, unlockLevel: 4200, cost: 1200,
      b1: '#FF9E8A', b2: '#F4633F', b3: '#A82C12', bt: '#FFD6CB', bm: '#FF8266', pattern: 'dots' },
    { name: 'Aqua Shell',  emoji: '🐚', theme: 'fish',   tier: 3, unlockLevel: 4900, cost: 2200,
      b1: '#7BE4DE', b2: '#1FA9A0', b3: '#0B5C58', bt: '#D6FFFC', bm: '#48C9C0', pattern: 'stripes' },
    { name: 'Deep Sea',    emoji: '🌊', theme: 'fish',   tier: 4, unlockLevel: 5600, cost: 3500,
      b1: '#5B8FE8', b2: '#2A4FB0', b3: '#12265E', bt: '#C9DCFF', bm: '#4A78D6', pattern: 'bolts' },
    { name: 'Pearl Gold',  emoji: '🫧', theme: 'fish',   tier: 5, unlockLevel: 6300, cost: 5500,
      b1: '#FFE9A8', b2: '#E8C158', b3: '#9A7614', bt: '#FFFBEF', bm: '#F2D479', pattern: 'rainbow' },

    // ---------- COFFEE THEME ----------
    { name: 'Wooden',      emoji: '🪣', theme: 'coffee', tier: 1, unlockLevel: 7001, cost: 0,
      b1: '#F0A060', b2: '#C8752A', b3: '#7A3A08', bt: '#FFD090', bm: '#E08830', pattern: 'weave' },
    { name: 'Latte',       emoji: '🥛', theme: 'coffee', tier: 2, unlockLevel: 7650, cost: 1500,
      b1: '#F0DCC0', b2: '#C9A87C', b3: '#8A6A44', bt: '#FFFAF0', bm: '#DEC49E', pattern: 'dots' },
    { name: 'Mocha',       emoji: '🍫', theme: 'coffee', tier: 3, unlockLevel: 8300, cost: 2600,
      b1: '#B07A4A', b2: '#7A4A24', b3: '#42220C', bt: '#E8C9A8', bm: '#96603A', pattern: 'stripes' },
    { name: 'Copper Pot',  emoji: '🫖', theme: 'coffee', tier: 4, unlockLevel: 8950, cost: 4000,
      b1: '#E8B070', b2: '#B87333', b3: '#6E3F12', bt: '#FFE2BC', bm: '#CE8A46', pattern: 'bolts' },
    { name: 'Golden Bean', emoji: '👑', theme: 'coffee', tier: 5, unlockLevel: 9600, cost: 6000,
      b1: '#FFE066', b2: '#D4AF37', b3: '#8A6A08', bt: '#FFF8D6', bm: '#E8C64A', pattern: 'rainbow' }
];

let currentSkinIndex = 0;
let ownedSkins = {};
let coins = 0;

// ===== COINS (daily reward se milte hain, basket unlock me lagte hain) =====
function getCoins() {
    const v = parseInt(localStorage.getItem('cm_coins') || '0', 10);
    return isNaN(v) ? 0 : v;
}
function setCoins(v) {
    const old = getCoins();
    coins = Math.max(0, Math.floor(v || 0));
    localStorage.setItem('cm_coins', String(coins));
    // total lifetime coins bhi track karo (missions ke liye)
    if (coins > old) {
        const life = getLifetime();
        life.totalCoins = (life.totalCoins || 0) + (coins - old);
        setLifetime(life);
    }
    updateCoinLabels();
}
function addCoins(n) { setCoins(getCoins() + n); }

function updateCoinLabels() {
    const str = '🪙 ' + getCoins().toLocaleString();
    const a = document.getElementById('coinHud');
    if (a) a.textContent = str;
    const b = document.getElementById('homeCoinBtn');
    if (b) b.textContent = str;
    const c = document.getElementById('shopCoinLabel');
    if (c) c.textContent = str;
}

function loadSkin() {
    const saved = localStorage.getItem('cm_basket_skin');
    if (saved !== null) {
        currentSkinIndex = parseInt(saved, 10);
        if (isNaN(currentSkinIndex) || currentSkinIndex < 0 || currentSkinIndex >= BASKET_SKINS.length) currentSkinIndex = 0;
    }
    try { ownedSkins = JSON.parse(localStorage.getItem('cm_owned_skins') || '{}') || {}; } catch (e) { ownedSkins = {}; }
    coins = getCoins();
    if (!isSkinUnlocked(currentSkinIndex)) currentSkinIndex = 0;
    updateSkinButton();
    updateCoinLabels();
}

function saveSkin() {
    localStorage.setItem('cm_basket_skin', currentSkinIndex);
    updateSkinButton();
}

function saveOwnedSkins() { localStorage.setItem('cm_owned_skins', JSON.stringify(ownedSkins)); }

// Basket unlocked hai? Level se ya coins se kharida hua.
function isSkinUnlocked(i) {
    const s = BASKET_SKINS[i];
    if (!s) return false;
    if (ownedSkins[i]) return true;
    // def.level use karo (st.level ke bajaye) taaki level init se pehle bhi
    // sahi jawab mile — pehle basket shop galat lock dikhata tha.
    const lvl = (typeof st.level === 'number' && st.level > 0) ? st.level : 1;
    return lvl >= s.unlockLevel;
}

function countUnlockedBaskets() {
    let n = 0;
    for (let i = 0; i < BASKET_SKINS.length; i++) if (isSkinUnlocked(i)) n++;
    return n;
}

function updateSkinButton() {
    const cur = BASKET_SKINS[currentSkinIndex] || BASKET_SKINS[0];
    const skinText = '🎨 ' + cur.emoji + ' ' + cur.name;
    const btn = document.getElementById('skinBtn');
    if (btn) btn.textContent = skinText;
    const btn2 = document.getElementById('homeSkinBtn2');
    if (btn2) btn2.textContent = skinText;
}

// Home ka basket button ab shop kholta hai
function cycleSkin() { showBasketShop(); }

// Basket select / coins se unlock
function selectBasket(i) {
    const s = BASKET_SKINS[i];
    if (!s) return;
    if (isSkinUnlocked(i)) {
        currentSkinIndex = i;
        saveSkin();
        renderBasketShop();
        beep(880, 'sine', 0.08, 0.22);
        return;
    }
    const have = getCoins();
    if (have >= s.cost) {
        if (confirm('Unlock ' + s.emoji + ' ' + s.name + ' for ' + s.cost.toLocaleString() +
            ' 🪙 coins?\n\nYour coins: ' + have.toLocaleString() + ' 🪙')) {
            addCoins(-s.cost);
            ownedSkins[i] = true;
            saveOwnedSkins();
            currentSkinIndex = i;
            saveSkin();
            sfxSurprise();
            renderBasketShop();
        }
    } else {
        const need = s.cost - have;
        toast('🔒 <b>' + s.name + '</b> — keep playing to unlock it' +
            '<br>or unlock now for ' + s.cost.toLocaleString() + ' 🪙 (need ' + need.toLocaleString() + ' more)', '#FFB8D0', 3200);
    }
}

function showBasketShop() {
    showOv('basketOv');
    renderBasketShop();
}

function closeBasketShop() {
    if (isOnHomePage) showHomePage();
    else showOv(null);
}

function renderBasketShop() {
    const wrap = document.getElementById('basketGrid');
    if (!wrap) return;
    updateCoinLabels();
    let html = '';
    let lastTheme = '';
    BASKET_SKINS.forEach((s, i) => {
        if (s.theme !== lastTheme) {
            const tm = { candy: '🍬 Candy Kingdom', fish: '🐟 Deep Sea Fish', coffee: '☕ Premium Coffee' }[s.theme];
            html += '<div class="basket-theme-head">' + tm + '</div>';
            lastTheme = s.theme;
        }
        const unlocked = isSkinUnlocked(i);
        const equipped = (i === currentSkinIndex);
        let status;
        if (equipped) status = '<span style="color:#00FFB0;">✓ Equipped</span>';
        else if (unlocked) status = '<span style="color:#FFD700;">Tap to equip</span>';
        else if (getCoins() >= s.cost) status = '<span style="color:#FFD700;">🪙 ' + s.cost.toLocaleString() + ' — tap to unlock</span>';
        // Sirf coins se unlock ka option — level ka NAAM bhi nahi.
        // Basket apne aap (chupchap) unlock ho jata hai jab level aa jaye.
        else status = '<span style="color:#9a9ab0;">🔒 Unlock now with<br>🪙 ' + s.cost.toLocaleString() + '</span>';

        html += '<div class="basket-item ' + (equipped ? 'equipped' : '') + (unlocked ? '' : ' locked') + '" data-idx="' + i + '">' +
            '<canvas id="bkCanvas' + i + '" width="76" height="52"></canvas>' +
            '<div class="bk-name">' + s.emoji + ' ' + s.name + '</div>' +
            '<div class="bk-status">' + status + '</div></div>';
    });
    wrap.innerHTML = html;
    BASKET_SKINS.forEach((s, i) => { drawBasketPreview(i); });
    Array.prototype.forEach.call(wrap.querySelectorAll('.basket-item'), (el) => {
        el.addEventListener('click', () => selectBasket(parseInt(el.getAttribute('data-idx'), 10)));
    });
}

function drawBasketPreview(i) {
    const cv = document.getElementById('bkCanvas' + i);
    if (!cv) return;
    const g = cv.getContext('2d');
    const skin = BASKET_SKINS[i];
    g.clearRect(0, 0, cv.width, cv.height);
    g.save();
    g.translate(cv.width / 2, 8);
    paintBasket(g, 0, 0, 54, 20, skin, isSkinUnlocked(i));
    g.restore();
}

// Basket ka asli drawing (game + shop preview dono isi se)
function paintBasket(g, bx, by, bw, bh, skin, dim) {
    g.save();
    if (dim) g.globalAlpha = 0.4;

    const grad = g.createLinearGradient(bx - bw / 2, by, bx + bw / 2, by + bh * 2);
    grad.addColorStop(0, skin.b1);
    grad.addColorStop(0.45, skin.b2);
    grad.addColorStop(1, skin.b3);
    g.fillStyle = grad;
    g.strokeStyle = skin.b3;
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(bx - bw / 2, by);
    g.lineTo(bx - bw / 2 + 8, by + bh);
    g.lineTo(bx + bw / 2 - 8, by + bh);
    g.lineTo(bx + bw / 2, by);
    g.closePath();
    g.fill();
    g.stroke();

    const p = skin.pattern || 'weave';
    g.save();
    g.beginPath();
    g.moveTo(bx - bw / 2, by); g.lineTo(bx - bw / 2 + 8, by + bh);
    g.lineTo(bx + bw / 2 - 8, by + bh); g.lineTo(bx + bw / 2, by);
    g.closePath(); g.clip();
    if (p === 'weave') {
        g.strokeStyle = 'rgba(0,0,0,0.18)';
        g.lineWidth = 1.2;
        for (let k = 1; k < 4; k++) {
            const px = bx - bw / 2 + (bw / 4) * k;
            g.beginPath(); g.moveTo(px, by); g.lineTo(px + 3, by + bh); g.stroke();
        }
        for (let k = 1; k < 3; k++) {
            const py = by + (bh / 3) * k;
            g.beginPath(); g.moveTo(bx - bw / 2 + 4, py); g.lineTo(bx + bw / 2 - 4, py); g.stroke();
        }
    } else if (p === 'stripes') {
        g.fillStyle = 'rgba(255,255,255,0.28)';
        for (let sx = bx - bw / 2; sx < bx + bw / 2; sx += 10) {
            g.beginPath();
            g.moveTo(sx, by); g.lineTo(sx + 4, by + bh);
            g.lineTo(sx + 8, by + bh); g.lineTo(sx + 4, by);
            g.closePath(); g.fill();
        }
    } else if (p === 'dots') {
        g.fillStyle = 'rgba(255,255,255,0.35)';
        for (let ry = 0; ry < 3; ry++) {
            for (let rx = 0; rx < 4; rx++) {
                const cx2 = bx - bw / 2 + 8 + rx * (bw - 16) / 3 + (ry % 2 ? 5 : 0);
                const cy2 = by + 5 + ry * (bh - 8) / 2;
                g.beginPath(); g.arc(cx2, cy2, 1.8, 0, Math.PI * 2); g.fill();
            }
        }
    } else if (p === 'bolts') {
        g.strokeStyle = 'rgba(255,255,255,0.4)';
        g.lineWidth = 2;
        for (let ry = 1; ry < 3; ry++) {
            const py = by + (bh / 3) * ry;
            g.beginPath(); g.moveTo(bx - bw / 2 + 6, py); g.lineTo(bx + bw / 2 - 6, py); g.stroke();
        }
        g.fillStyle = 'rgba(255,255,255,0.5)';
        [[-bw / 2 + 8, by + 4], [bw / 2 - 8, by + 4], [-bw / 2 + 10, by + bh - 3], [bw / 2 - 10, by + bh - 3]]
            .forEach(pt => { g.beginPath(); g.arc(bx + pt[0], pt[1], 1.9, 0, Math.PI * 2); g.fill(); });
    } else if (p === 'rainbow') {
        const rg = g.createLinearGradient(bx - bw / 2, by, bx + bw / 2, by + bh);
        rg.addColorStop(0, 'rgba(255,80,80,0.55)');
        rg.addColorStop(0.25, 'rgba(255,210,60,0.55)');
        rg.addColorStop(0.5, 'rgba(70,220,130,0.55)');
        rg.addColorStop(0.75, 'rgba(80,150,255,0.55)');
        rg.addColorStop(1, 'rgba(180,90,255,0.55)');
        g.fillStyle = rg;
        g.fillRect(bx - bw / 2, by, bw, bh + 2);
    }
    g.restore();

    const rg2 = g.createLinearGradient(bx - bw / 2, by, bx + bw / 2, by);
    rg2.addColorStop(0, skin.bt);
    rg2.addColorStop(0.5, skin.bm);
    rg2.addColorStop(1, skin.bt);
    g.fillStyle = rg2;
    g.strokeStyle = skin.b3;
    g.lineWidth = 1.5;
    g.beginPath();
    g.roundRect(bx - bw / 2 - 2, by - 4, bw + 4, 8, 3);
    g.fill();
    g.stroke();

    if (skin.tier >= 5 && !dim) {
        g.strokeStyle = 'rgba(255,255,255,0.5)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.roundRect(bx - bw / 2 - 4, by - 6, bw + 8, bh + 10, 5);
        g.stroke();
    }
    g.restore();
}

function drawBasketWithSkin(bx, by, bw, bh) {
    const skin = BASKET_SKINS[currentSkinIndex] || BASKET_SKINS[0];
    ctx.save();
    glow('#FF88AA', 14);
    ctx.fillStyle = 'rgba(255,100,150,0.05)';
    ctx.beginPath();
    ctx.ellipse(bx, by + bh, bw * 0.65, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ng();
    paintBasket(ctx, bx, by, bw, bh, skin, false);
    ctx.restore();
}
// ============================================================
// ===== 8. PARTICLES / FLOATS / CONFETTI =====================
// ============================================================
function addParticles(x, y, c1, c2) {
    for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 2 + Math.random() * 5;
        st.particles.push({ x: x, y: y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 3, life: 35, maxLife: 35, color: Math.random() > 0.5 ? c1 : c2, r: 3 + Math.random() * 5 });
    }
}

function addRedParticles(x, y) {
    for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 2 + Math.random() * 3;
        st.particles.push({ x: x, y: y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 2, life: 28, maxLife: 28, color: '#FF2222', r: 3 + Math.random() * 4 });
    }
}

function spawnConfetti(count) {
    count = count || 60;
    const cols = ['#FFD700', '#FF4DA6', '#00BFFF', '#FF6090', '#A855F7', '#10D4AA', '#F43F5E', '#FFFFFF'];
    for (let i = 0; i < count; i++) {
        st.confetti.push({ x: Math.random() * gameW, y: -10 - Math.random() * 60, vx: (Math.random() - 0.5) * 3.5, vy: 2 + Math.random() * 3.5, color: cols[Math.floor(Math.random() * cols.length)], size: 5 + Math.random() * 8, rot: Math.random() * Math.PI, vrot: 0.05 + Math.random() * 0.12, life: 220 });
    }
}

function addFloat(text, color, big) {
    st.floats.push({ x: gameW / 2, y: gameH * 0.45, color: color, life: big ? 80 : 60, text: text, big: !!big });
}

// ============================================================
// ===== 9. AUDIO =============================================
// ============================================================
let soundEnabled = localStorage.getItem('cm_sound') !== 'off';
let musicEnabled = localStorage.getItem('cm_music') !== 'off';
let musicNodes = [], musicInterval = null, musicPlaying = false;
const MUSIC_THEMES = [{ melody: [523, 659, 784, 1047, 784, 659, 523, 440, 523, 659, 784, 880], bass: [131, 131, 131, 131, 165, 165, 131, 131, 131, 165, 165, 131], tempo: 300 }];
const BOSS_MUSIC = { melody: [220, 247, 262, 220, 196, 220, 247, 220], bass: [55, 55, 55, 55, 55, 55, 55, 55], tempo: 240 };
let AC = null;

function getAC() { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); return AC; }

function beep(f, t, d, v, dl) {
    dl = dl || 0;
    if (!soundEnabled) return;
    try {
        const ac = getAC(), o = ac.createOscillator(), g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type = t;
        o.frequency.setValueAtTime(f, ac.currentTime + dl);
        g.gain.setValueAtTime(v, ac.currentTime + dl);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dl + d);
        o.start(ac.currentTime + dl);
        o.stop(ac.currentTime + dl + d + 0.05);
    } catch (e) {}
}

function sfxCatch() { beep(660, 'sine', 0.08, 0.28); beep(880, 'sine', 0.07, 0.22, 0.06); }
function sfxWrong() { beep(180, 'sawtooth', 0.18, 0.25); beep(140, 'sawtooth', 0.12, 0.2, 0.1); }
function sfxMiss() { beep(220, 'sawtooth', 0.12, 0.18); }
function sfxLevelUp() { [523, 659, 784, 1047].forEach((f, i) => beep(f, 'sine', 0.12, 0.28, i * 0.1)); }
function sfxTaskDone() { [440, 550, 660, 880, 1100].forEach((f, i) => beep(f, 'triangle', 0.14, 0.3, i * 0.08)); }
function sfxLife() { beep(880, 'sine', 0.12, 0.32); beep(1100, 'sine', 0.1, 0.28, 0.12); beep(1320, 'sine', 0.09, 0.22, 0.22); }
function sfxBomb() { beep(80, 'sawtooth', 0.4, 0.5); beep(60, 'sawtooth', 0.3, 0.4, 0.1); beep(40, 'sine', 0.5, 0.3, 0.2); }
function sfxCombo(n) { beep(440 + n * 80, 'sine', 0.1, 0.3); beep(550 + n * 80, 'sine', 0.08, 0.25, 0.06); }
function sfxShield() { beep(300, 'sine', 0.08, 0.22); beep(500, 'sine', 0.1, 0.28, 0.08); beep(800, 'sine', 0.12, 0.3, 0.16); beep(1100, 'sine', 0.1, 0.25, 0.24); }
function sfxSurprise() { [400, 600, 900, 1200, 1600, 2000, 2600].forEach((f, i) => beep(f, 'sine', 0.18, 0.32, i * 0.08)); }
function sfxGameOver() { beep(300, 'sawtooth', 0.18, 0.25); beep(250, 'sawtooth', 0.15, 0.22, 0.12); beep(200, 'sawtooth', 0.12, 0.2, 0.22); beep(150, 'sine', 0.3, 0.18, 0.32); }

function startMusic(themeId) {
    if (!musicEnabled) return;
    stopMusic();
    const isBoss = themeId === -1 || (st && st.inTask);
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
            mg.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + theme.tempo / 1200);
            mo.start(ac.currentTime);
            mo.stop(ac.currentTime + theme.tempo / 1000);
            musicNodes.push(mo, mg);
            if (noteIdx % 2 === 0) {
                const bo = ac.createOscillator(), bg = ac.createGain();
                bo.connect(bg); bg.connect(ac.destination);
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

function stopMusic() {
    musicPlaying = false;
    if (musicInterval) { clearInterval(musicInterval); musicInterval = null; }
    musicNodes.forEach(n => { try { n.stop(); n.disconnect(); } catch (e) {} });
    musicNodes = [];
}

function toggleMusic() {
    musicEnabled = !musicEnabled;
    localStorage.setItem('cm_music', musicEnabled ? 'on' : 'off');
    const btn = document.getElementById('musicToggleBtn');
    if (btn) btn.style.opacity = musicEnabled ? '1' : '0.35';
    if (musicEnabled && st && st.running) startMusic(st.inTask ? -1 : 0);
    else if (!musicEnabled) stopMusic();
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('cm_sound', soundEnabled ? 'on' : 'off');
    const btn = document.getElementById('soundToggleBtn');
    if (btn) btn.textContent = soundEnabled ? '🔊' : '🔇';
    if (soundEnabled) beep(800, 'sine', 0.1, 0.2);
}

function initSoundBtn() { const btn = document.getElementById('soundToggleBtn'); if (btn) btn.textContent = soundEnabled ? '🔊' : '🔇'; initMusicBtn(); }
function initMusicBtn() { const btn = document.getElementById('musicToggleBtn'); if (btn) btn.style.opacity = musicEnabled ? '1' : '0.35'; }

// ============================================================
// ===== 10. AUTH / HOME ======================================
// ============================================================
const SESSION_KEY = 'cr_session_v4';

function getSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; } }
function saveSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

let currentUserEmail = 'guest';
let currentUserName = 'Guest';
// Firebase UID — cloud doc id isi se banta hai (email se nahi, kyunki email me
// aise characters ho sakte hain jo Firestore doc id me allowed nahi hote).
let currentUserUid = '';
let gameStarted = false;
let isOnHomePage = false;
let wasGamePausedBeforeSettings = false;

function getAuth() { return window.firebaseAuth || null; }

function enterGame(name, email, uid) {
    currentUserEmail = email;
    currentUserName = name;
    if (uid) currentUserUid = uid;
    showHomePage(name, email);
}

window.onUserLoggedIn = function (user) {
    if (gameStarted) return;
    gameStarted = true;
    const name = user.displayName;
    const email = user.email;
    if (user.uid) currentUserUid = user.uid;
    const users = JSON.parse(localStorage.getItem('cr_users_v2') || '[]');
    if (!users.find(u => u.email === email)) users.push({ name: name, email: email, via: 'google', id: user.uid });
    localStorage.setItem('cr_users_v2', JSON.stringify(users));
    saveSession({ email: email, name: name, via: 'google' });
    document.getElementById('loginScreen').style.display = 'none';
    showHomePage(name, email);
};

// Cloud se progress laao (agar local me kuch nahi hai to)
async function syncCloudProgress() {
    if (!currentUserEmail || currentUserEmail.indexOf('guest_') === 0) return;
    try {
        const cloud = await loadProgressFromCloud();
        if (!cloud) return;
        const local = loadProgress();
        // cloud aage hai to cloud wala use karo
        if (cloud.level > ((local && local.level) || 0)) {
            localStorage.setItem(saveKey(currentUserEmail), JSON.stringify({
                level: cloud.level, score: cloud.score || 0, lives: cloud.lives || 3
            }));
            toast('☁️ Cloud save mila — progress sync ho gaya!', '#00FFB0', 2600);
        } else if (local && local.level > cloud.level) {
            // local aage hai to cloud par bhej do
            saveProgressToCloud();
        }
    } catch (e) {}
}

function showHomePage(name, email) {
    if (name) { currentUserName = name; currentUserEmail = email; }
    document.getElementById('gameWrap').style.display = 'flex';
    document.getElementById('homePageOv').style.display = 'flex';
    const oldHome = document.getElementById('homeOv');
    if (oldHome) oldHome.style.display = 'none';
    document.getElementById('userName').textContent = '👤 ' + currentUserName;
    isOnHomePage = true;
    updateSkinButton();
    initSoundBtn();
    initMusicBtn();
    updateCoinLabels();
    renderBestScore();
    resizeCanvas();
    // cloud se progress sync (Google login wale ke liye)
    if (currentUserEmail && currentUserEmail.indexOf('guest_') !== 0) {
        syncCloudProgress();
    }
}

function hideHomePage() {
    document.getElementById('homePageOv').style.display = 'none';
    isOnHomePage = false;
}

function startGameFromHome(resume) {
    hideHomePage();
    const saved = loadProgress();
    if (resume && saved && saved.level > 1) startGame(true, saved);
    else startGame(false);
}

function guestLogin() {
    document.body.classList.add('game-active');
    const name = 'Guest_' + Math.floor(Math.random() * 10000);
    const email = 'guest_' + Date.now() + '@local.candymass';
    saveSession({ email: email, name: name, via: 'guest' });
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
    st.running = false;
    gameStarted = false;
    isOnHomePage = false;
}

window.addEventListener('load', () => {
    loadSkin();
    loadMissions();
    loadSpriteSheet();
    const sess = getSession();
    if (sess && sess.email && sess.email.indexOf('guest_') !== 0) {
        document.getElementById('loginScreen').style.display = 'none';
        showHomePage(sess.name, sess.email);
        gameStarted = true;
    } else {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('homePageOv').style.display = 'none';
    }
    checkDailyBadge();
    loadSettings();
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 300));
});

// ===== SAVE & LEADERBOARD =====
function saveKey(e) { return 'cr_save_v4_' + e; }
function saveProgress() {
    if (!currentUserEmail) return;
    try {
        localStorage.setItem(saveKey(currentUserEmail), JSON.stringify({ level: st.level, score: st.score, lives: st.lives }));
    } catch (e) {}
}

function loadProgress() {
    if (!currentUserEmail) return null;
    try {
        const r = localStorage.getItem(saveKey(currentUserEmail));
        if (r) {
            const data = JSON.parse(r);
            return { level: data.level || 1, score: data.score || 0, lives: data.lives || 3 };
        }
        return null;
    } catch (e) { return null; }
}

function saveLB() {
    try {
        const lb = JSON.parse(localStorage.getItem('cr_lb_v4') || '[]');
        const idx = lb.findIndex(r => r.email === currentUserEmail ||
            (currentUserUid && r.uid && r.uid === currentUserUid));
        const entry = {
            uid: currentUserUid || '',
            name: currentUserName,
            email: currentUserEmail,
            score: st.score,
            level: st.level
        };
        if (idx >= 0) { if (st.score > lb[idx].score) lb[idx] = entry; }
        else lb.push(entry);
        lb.sort((a, b) => b.score - a.score);
        localStorage.setItem('cr_lb_v4', JSON.stringify(lb.slice(0, 100)));
    } catch (e) {}
}

async function showLeaderboard() {
    showOv('lbOv');
    const content = document.getElementById('lbContent');
    if (!content) return;
    content.innerHTML = '<div style="text-align:center; padding:16px; color:#FFD700;">⏳ Loading…</div>' +
        '<div style="text-align:center; font-size:11px; color:rgba(255,255,255,0.4);">' + lbSourceTag() + '</div>';

    if (lbCloudBusy) return;
    lbCloudBusy = true;

    let rows = [];
    try {
        rows = await buildLeaderboard();
    } catch (e) {
        rows = [];
    }
    lbCloudBusy = false;

    if (!rows.length) {
        content.innerHTML = '<div style="text-align:center; padding:14px;">No scores yet.<br>' +
            '<span style="font-size:11px; color:rgba(255,255,255,0.45);">Play a game to get on the board!</span></div>' +
            '<div style="text-align:center; font-size:11px; color:rgba(255,255,255,0.4); margin-top:6px;">' + lbSourceTag() + '</div>';
        return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    let html = '<div style="text-align:center; font-size:10.5px; color:rgba(255,255,255,0.45); margin-bottom:6px;">' + lbSourceTag() + '</div>';

    // apni rank dhoondho
    const meIdx = rows.findIndex(isMeRow);
    if (meIdx >= 0) {
        const me = rows[meIdx];
        html += '<div class="lb-row me" style="border-left-color:#00FFB0; background:rgba(0,255,176,0.10);">' +
            '<span class="lb-rank">#' + (meIdx + 1) + '</span>' +
            '<span class="lb-name">' + me.name + ' ★ you</span>' +
            '<span class="lb-score">' + (me.score || 0).toLocaleString() + '</span>' +
            '<span class="lb-lv">L' + (me.level || 1).toLocaleString() + '</span></div>' +
            '<div style="height:1px; background:rgba(255,255,255,0.14); margin:6px 2px;"></div>';
    }

    rows.slice(0, 30).forEach((r, i) => {
        const isMe = isMeRow(r);
        html += '<div class="lb-row"' + (isMe ? ' style="border-left-color:#00FFB0;"' : '') + '>' +
            '<span class="lb-rank">' + (i < 3 ? medals[i] : (i + 1)) + '</span>' +
            '<span class="lb-name">' + (r.name || 'Player') + (isMe ? ' ★' : '') + (r.cloud ? '' : '') + '</span>' +
            '<span class="lb-score">' + (r.score || 0).toLocaleString() + '</span>' +
            '<span class="lb-lv">L' + (r.level || 1).toLocaleString() + '</span></div>';
    });
    content.innerHTML = html;
}

function closeLB() { showHomePage(); }

// ============================================================
// ===== CLOUD LEADERBOARD (Firestore) ========================
// Firestore me 'scores' collection hai. Har player ka ek document (uid/email)
// hota hai. Sirf apna hi score bhej sakta hai aur sirf behtar score hi
// likha jaa sakta hai — isliye fake scores nahi ho sakte.
// Net na ho ya Firebase load na ho to local leaderboard dikhta hai.
// ============================================================
const LB_CLOUD_LIMIT = 50;          // top 50 cloud se
const LB_CACHE_KEY = 'cm_lb_cloud_cache';
let lbCloudBusy = false;

// ------------------------------------------------------------
// Cloud doc id = Firebase UID
// ------------------------------------------------------------
// Pehle email use kar rahe the, par email me aise characters ho sakte hain
// jo Firestore doc id me allowed nahi (+ / space etc). Us case me code
// characters hata deta tha aur rules se match fail ho jata tha -> leaderboard
// chupchap toot jata tha. UID hamesha safe hota hai aur rules me
// request.auth.uid se exact match karta hai.
function lbDocId() {
    if (currentUserUid) return currentUserUid;
    // fallback (agar uid na mile) — safe email
    const e = currentUserEmail || 'guest';
    return e.replace(/[^a-zA-Z0-9_.@-]/g, '_').slice(0, 120);
}

// Leaderboard row apna hai ya nahi
function isMeRow(r) {
    if (currentUserUid && r.uid) return r.uid === currentUserUid;
    return r.email === currentUserEmail;
}

function canUseCloudLB() {
    return !!(currentUserEmail && currentUserEmail.indexOf('guest_') !== 0 &&
        window.firebaseDb && window.firebaseDoc && window.firebaseSetDoc &&
        window.firebaseGetDoc && window.firebaseCollection && window.firebaseGetDocs);
}

function getLBCache() {
    try { return JSON.parse(localStorage.getItem(LB_CACHE_KEY) || '[]') || []; } catch (e) { return []; }
}
function setLBCache(rows) {
    try { localStorage.setItem(LB_CACHE_KEY, JSON.stringify((rows || []).slice(0, LB_CLOUD_LIMIT))); } catch (e) {}
}

// Apna best score cloud par bhejo (sirf behtar score hi jaata hai)
async function submitScoreToCloud() {
    if (!canUseCloudLB() || !st) return;
    if (st.score <= 0) return;
    // pehle local best check — bekaar ka write na ho
    const life = getLifetime();
    const best = Math.max(life.bestScore || 0, st.score);
    if (st.score < best) return;

    try {
        const db = window.firebaseDb;
        const ref = window.firebaseDoc(db, 'scores', lbDocId());
        await window.firebaseSetDoc(ref, {
            uid: lbDocId(),
            name: (currentUserName || 'Player').slice(0, 20),
            email: currentUserEmail,
            score: st.score,
            level: st.level || 1,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        console.log('☁️ Score cloud par bheja:', st.score);
    } catch (e) {
        console.warn('Cloud score submit fail:', e && e.message);
    }
}

// Top scores cloud se laao (cache me bhi rakh lo — offline ke liye)
async function fetchCloudScores() {
    if (!canUseCloudLB()) return null;
    try {
        const db = window.firebaseDb;
        const col = window.firebaseCollection(db, 'scores');
        const q = window.firebaseQuery
            ? window.firebaseQuery(col, window.firebaseOrderBy('score', 'desc'), window.firebaseLimit(LB_CLOUD_LIMIT))
            : col;
        const snap = await window.firebaseGetDocs(q);
        const rows = [];
        snap.forEach(d => {
            const v = d.data() || {};
            rows.push({
                uid: v.uid || d.id,
                name: v.name || 'Player',
                email: v.email || '',
                score: v.score || 0,
                level: v.level || 1,
                cloud: true
            });
        });
        rows.sort((a, b) => b.score - a.score);
        setLBCache(rows);
        return rows;
    } catch (e) {
        console.warn('Cloud leaderboard fetch fail:', e && e.message);
        return null;
    }
}

// Leaderboard rows taiyaar karo: cloud + local ko mila kar
async function buildLeaderboard() {
    const local = (function () {
        try { return JSON.parse(localStorage.getItem('cr_lb_v4') || '[]'); } catch (e) { return []; }
    })();

    let cloud = null;
    if (canUseCloudLB()) cloud = await fetchCloudScores();
    if (!cloud || !cloud.length) cloud = getLBCache();

    // dono ko jodo — uid (cloud) ya email (local) ke hisaab se unique.
    // Same player ka sirf BEST score rakha jata hai.
    const map = {};
    function add(r) {
        if (!r) return;
        const key = r.uid ? ('u:' + r.uid) : (r.email ? ('e:' + r.email) : null);
        if (!key) return;
        const ex = map[key];
        if (!ex || (r.score || 0) > (ex.score || 0)) {
            map[key] = {
                uid: r.uid || '',
                name: r.name || 'Player',
                email: r.email || '',
                score: r.score || 0,
                level: r.level || 1,
                cloud: !!r.cloud
            };
        }
    }
    (cloud || []).forEach(add);
    local.forEach(add);

    const rows = Object.keys(map).map(k => map[k]);
    rows.sort((a, b) => b.score - a.score);
    return rows.slice(0, LB_CLOUD_LIMIT);
}

function lbSourceTag() {
    if (canUseCloudLB()) return '<span style="color:#00FFB0;">🌍 Global (cloud)</span>';
    if (currentUserEmail && currentUserEmail.indexOf('guest_') === 0) return '<span style="color:#FFB8D0;">📱 This device (sign in for global)</span>';
    return '<span style="color:#FFB8D0;">📱 This device (offline)</span>';
}

// ===== CLOUD SAVE =====
// ------------------------------------------------------------
// CLOUD SAVE (progress) — ab UID-based
// ------------------------------------------------------------
// Pehle email doc id thi, par rules uid chahte hain (email me unsafe
// characters ho sakte hain). Isliye:
//   1. Naya data UID par save hota hai
//   2. Purana data (email par) MILNE PAR apne aap UID par migrate ho jata hai
async function saveProgressToCloud() {
    if (!currentUserEmail || currentUserEmail.indexOf('guest_') === 0) return;
    const uid = lbDocId();
    if (!uid) return;
    try {
        const db = window.firebaseDb, docFn = window.firebaseDoc, setDoc = window.firebaseSetDoc;
        if (!db || !docFn || !setDoc) return;
        const userRef = docFn(db, 'users', uid);
        await setDoc(userRef, {
            uid: uid,
            email: currentUserEmail,
            name: currentUserName,
            level: st.level || 1,
            score: st.score || 0,
            lives: st.lives || 3,
            updatedAt: new Date().toISOString()
        }, { merge: true });
    } catch (e) { console.error('Cloud save error:', e); }
}

async function loadProgressFromCloud() {
    if (!currentUserEmail || currentUserEmail.indexOf('guest_') === 0) return null;
    const uid = lbDocId();
    try {
        const db = window.firebaseDb, docFn = window.firebaseDoc, getDocFn = window.firebaseGetDoc;
        if (!db || !docFn || !getDocFn) return null;

        // 1) UID par dekho
        if (uid) {
            const snap = await getDocFn(docFn(db, 'users', uid));
            if (snap.exists()) {
                const d = snap.data();
                return { level: d.level || 1, score: d.score || 0, lives: d.lives || 3 };
            }
        }

        // 2) Purana data email par ho sakta hai — usse UID par migrate karo
        //    (rules ke hisaab se ab email par likhna allowed nahi hai)
        if (currentUserEmail && currentUserEmail !== uid) {
            const oldSnap = await getDocFn(docFn(db, 'users', currentUserEmail));
            if (oldSnap.exists()) {
                const d = oldSnap.data();
                const data = { level: d.level || 1, score: d.score || 0, lives: d.lives || 3 };
                // UID par migrate karo
                if (uid && window.firebaseSetDoc) {
                    try {
                        await window.firebaseSetDoc(docFn(db, 'users', uid), {
                            uid: uid,
                            email: currentUserEmail,
                            name: d.name || currentUserName,
                            level: data.level,
                            score: data.score,
                            lives: data.lives,
                            updatedAt: new Date().toISOString()
                        }, { merge: true });
                        console.log('☁️ Purana progress UID par migrate ho gaya');
                    } catch (e) {}
                }
                return data;
            }
        }
        return null;
    } catch (e) { return null; }
}

// ============================================================
// ===== 11. HUD / OVERLAYS ===================================
// ============================================================
// Level number dikhta hai (player ko pata chale kaunsa level chal raha hai),
// par KUL KITNE LEVEL HAIN ye kabhi nahi dikhta — na percentage, na "X / Y" .
// getProgressPct() rakha hai sirf internal use ke liye (missions/stats).
function getProgressPct(lvl) {
    const p = Math.round(Math.min(1, Math.max(0, (lvl - 1) / 9999)) * 100);
    return p + '%';
}

function updateHUD() {
    document.getElementById('lv').textContent = st.level.toLocaleString();
    let h = '';
    for (let i = 0; i < st.lives; i++) h += '❤️';
    document.getElementById('li').innerHTML = h || '🖤';
    // score animated counter se update hota hai (gameLoop me)
}

// Home screen par best score/level dikhao
function renderBestScore() {
    const life = getLifetime();
    const el = document.getElementById('bestLine');
    if (el) {
        el.innerHTML = (life.bestScore > 0)
            ? '🏆 Best: <b>' + life.bestScore.toLocaleString() + '</b> &nbsp;·&nbsp; Level <b>' + life.bestLevel.toLocaleString() + '</b>'
            : '🏆 No record yet — play your first game!';
    }
    const g = document.getElementById('goBest');
    if (g) {
        g.innerHTML = (life.bestScore > 0)
            ? 'Best: ' + life.bestScore.toLocaleString() + ' · Level ' + life.bestLevel.toLocaleString()
            : '';
    }
}

function updateTaskHud() {
    const textEl = document.getElementById('taskHudText');
    const fillEl = document.getElementById('taskHudFill');
    const pctEl = document.getElementById('taskHudPct');
    if (!st.inTask || !st.taskDef) {
        textEl.textContent = '';
        fillEl.style.width = '0%';
        pctEl.textContent = '';
        return;
    }
    const pct = Math.min(100, Math.round(st.taskCaught / Math.max(1, st.taskDef.count) * 100));
    textEl.textContent = st.taskKind === 'target'
        ? ('🎯 TASK: catch special candy ' + st.taskCaught + '/' + st.taskDef.count + ' ')
        : ('🎯 TASK: catch 🛡️/✨ power-ups ' + st.taskCaught + '/' + st.taskDef.count + ' ');
    fillEl.style.width = pct + '%';
    pctEl.textContent = '';
}

function updatePowerupHud() {
    const hud = document.getElementById('powerupHud');
    const shud = document.getElementById('shieldHud');
    if (hud) hud.style.display = st.shieldActive ? 'flex' : 'none';
    if (shud) {
        if (st.shieldActive) {
            shud.style.display = 'flex';
            const timerSpan = document.getElementById('shieldTimer');
            if (timerSpan) timerSpan.textContent = Math.ceil(st.shieldFrames / 60) + 's';
            const bar = document.getElementById('shieldBar');
            if (bar) bar.style.width = Math.max(0, (st.shieldFrames / Math.max(1, st.shieldMaxFrames)) * 100) + '%';
        } else {
            shud.style.display = 'none';
        }
    }
}

const SHIELD_BASE_DURATION = 720;

function activateShield() {
    st.shieldActive = true;
    st.shieldFrames = SHIELD_BASE_DURATION;
    st.shieldMaxFrames = SHIELD_BASE_DURATION;
    sfxShield();
    updatePowerupHud();
}

let shakeFrames = 0, shakeIntensity = 0;
function triggerShake(intensity, frames) { shakeFrames = frames || 18; shakeIntensity = intensity || 8; }

function showOv(id) {
    const overlays = ['homeOv', 'levelOv', 'taskOv', 'celebOv', 'lbOv', 'roadmapOv', 'dailyOv', 'basketOv', 'missionOv', 'goOv', 'settingsOv', 'helpOv', 'pauseOv'];
    overlays.forEach(s => { const el = document.getElementById(s); if (el) el.style.display = 'none'; });
    const homePage = document.getElementById('homePageOv');
    if (homePage) homePage.style.display = 'none';
    if (id) document.getElementById(id).style.display = 'flex';
}

// ============================================================
// ===== 12. BOMB EFFECTS =====================================
// ============================================================
function handleBombEffect(bombType) {
    const eff = bombType.effect;
    if (eff === 'game-over') {
        st.lives = 0;
        updateHUD();
        haptic([80, 50, 120]);
        addRedParticles(gameW / 2, gameH * 0.8);
        endGame(true);
        return;
    }
    if (eff === 'life-reduce') {
        st.lives--;
        updateHUD();
        sfxWrong();
        haptic([50, 40, 50]);
        triggerShake(6, 14);
        addFloat('💔 -1 Life!', '#FF4444', true);
        if (st.lives <= 0) endGame(false);
        return;
    }
    if (eff === 'target-reduce') {
        st.levelTarget = Math.min(MAX_TARGET, st.levelTarget + 15);
        sfxWrong();
        triggerShake(5, 12);
        addFloat('📉 Target +15 → ' + st.levelTarget, '#FF8800', true);
        return;
    }
    if (eff === 'score-reduce') {
        st.score = Math.max(0, st.score - 500);
        updateHUD();
        sfxWrong();
        triggerShake(6, 12);
        addFloat('💰 -500 Score!', '#FFAA00', true);
        return;
    }
}

// ============================================================
// ===== 13. LEVEL INIT / FLOW ================================
// ============================================================
function initLevel(lvl, score, lives) {
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = 0; }
    // save se aaya level? (basket unlock aur missions ke liye zaruri)
    if (typeof lvl === 'number' && lvl > 0) st.level = lvl;
    const cfg = getLevelConfig(lvl);
    syncWorld(lvl);

    st.level = lvl;
    st.score = score || 0;
    st.lives = lives || 3;
    st.items = [];
    st.particles = [];
    st.floats = [];
    st.confetti = [];
    st.frame = 0;
    st.speed = cfg.speed;
    st.spawnInterval = cfg.interval;
    st.spawnTimer = 0;
    st.bombChance = cfg.bombChance;
    st.levelTarget = cfg.target;
    st.levelCaught = 0;
    st.levelCompleteTriggered = false;
    st.combo = 0;
    st.comboTimer = 0;
    st.shieldActive = false;
    st.shieldFrames = 0;
    st.shieldMaxFrames = 0;

    // Task level? (har 5th level) -> task definition turant bana do,
    // warna decideSpawn() ko taskDef nahi milega.
    st.taskDone = false;
    st.taskCaught = 0;
    if (isTaskLevel(lvl)) {
        const def = makeTaskDef();
        st.inTask = true;
        st.taskDef = def;
        st.taskKind = def.kind;
    } else {
        st.inTask = false;
        st.taskDef = null;
        st.taskKind = 'target';
    }

    shakeFrames = 0;
    shakeIntensity = 0;

    st.basket.x = gameW / 2;
    layoutBasket();

    // per-level flags
    st.lostLifeThisLevel = false;
    st.lastCoinReward = 0;

    applyTheme();
    updateHUD();
    updateTaskHud();
    updatePowerupHud();
    updateWorldTag();
    updateBombLegend();
    updateCoinLabels();
    renderBestScore();
}

function applyTheme() {
    const th = st.theme;
    const topBar = document.getElementById('topBar');
    if (topBar) topBar.style.background = th.topBar;
    document.body.style.background = th.bg;
    const tt = document.getElementById('themeTag');
    if (tt) tt.textContent = th.name;
}

function startGame(resume, savedData) {
    try { getAC().resume(); } catch (e) {}
    const saved = savedData || loadProgress();
    if (resume && saved && saved.level > 1) initLevel(saved.level, saved.score, saved.lives || 3);
    else initLevel(1, 0, 3);
    hideHomePage();
    showOv(null);
    st.running = true;
    isGamePaused = false;
    lastFrameTime = 0;
    startMusic(0);
    requestAnimationFrame(gameLoop);
}

function nextLevel() { advanceLevel(); }

function advanceLevel() {
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = 0; }
    const carriedScore = st.score;
    const carriedLives = st.lives;
    const fromLvl = st.level;
    const next = Math.min(10000, st.level + 1);
    initLevel(next, carriedScore, carriedLives);
    checkBasketUnlocks(fromLvl, next);
    showOv(null);
    st.running = true;
    isGamePaused = false;
    lastFrameTime = 0;
    startMusic(0);
    requestAnimationFrame(gameLoop);
}

// Level badhne par naya basket unlock hua? Player ko batao.
function checkBasketUnlocks(fromLvl, toLvl) {
    const unlocked = [];
    BASKET_SKINS.forEach((s, i) => {
        if (s.cost === 0) return;
        if (s.unlockLevel > fromLvl && s.unlockLevel <= toLvl && !ownedSkins[i]) unlocked.push(s);
    });
    if (!unlocked.length) return;
    sfxSurprise();
    addFloat('🎨 New basket unlocked!', '#FFD700', true);
    const names = unlocked.map(s => s.emoji + ' ' + s.name).join(', ');
    // Chupchap unlock — koi "level X par mila" jaisa message nahi,
    // warna player andaza laga lega ki kitne level hain.
    toast('🎨 New basket unlocked: <b>' + names + '</b>', '#FFD700', 3000);
}

// ============================================================
// ===== 14. TASK (har 5 level par) ===========================
// ============================================================
function onLevelComplete() {
    st.running = false;

    // --- coins reward ---
    const reward = getLevelCoinReward(st.level);
    awardCoins(reward, gameW / 2, gameH * 0.62);
    st.lastCoinReward = reward;

    // --- missions ---
    tickMission('levels', 1);
    if (!st.lostLifeThisLevel) tickMission('nohit', 1);
    tickMission('jars', countUnlockedBaskets(), 'abs');
    tickMission('coins', getLifetime().totalCoins, 'abs');

    // --- best score/level ---
    const life = checkLifetimeRecords();

    saveProgress();
    saveProgressToCloud();
    saveLB();
    submitScoreToCloud();     // global leaderboard par bhejo

    // Monetization (ads.js) ko khabar do — agar wo file na ho to kuch nahi hota
    try {
        document.dispatchEvent(new CustomEvent('cm:levelcomplete', {
            detail: { level: st.level, coins: st.lastCoinReward || 0 }
        }));
    } catch (e) {}
    sfxLevelUp();

    if (isTaskLevel(st.level) && !st.taskDone) {
        showTask();
        return;
    }
    if (st.level % 50 === 0) { showCelebration(); return; }
    showLevelComplete();
}

function showTask() {
    const def = makeTaskDef();
    st.inTask = true;
    st.taskDef = def;
    st.taskKind = def.kind;
    st.taskCaught = 0;
    st.taskDone = false;
    st.items = [];

    const emoji = document.querySelector('#taskOv .ov-emoji');
    if (emoji) emoji.textContent = '🎯';
    const title = document.querySelector('#taskOv .ov-title');
    if (title) title.textContent = (st.theme.taskTitle || 'Bonus Task!') + ' — Level ' + st.level;

    let desc;
    if (def.kind === 'target') {
        const name = (st.cfg.multiId === def.targetId) ? '✨ 10X candy' : ('Candy #' + def.targetId);
        desc = '🎯 Catch only the <b>' + name + '</b> and let the other candies fall!';
        desc += '<br><span style="color:#FF6B6B;">Catching a wrong candy = -1 ❤️</span>';
        desc += '<br><span style="color:#00FFB0;">Look for the green ring + ★ CATCH label.</span>';
    } else {
        desc = '🎯 Catch only <b>🛡️ SHIELD</b> or <b>✨ 10X</b> power-ups and let everything else fall!';
        desc += '<br><span style="color:#FF6B6B;">Catching a wrong item = -1 ❤️</span>';
    }

    document.getElementById('taskDesc').innerHTML = desc;
    document.getElementById('taskProg').textContent = '0 / ' + def.count;
    document.getElementById('taskFill').style.width = '0%';
    updateTaskHud();
    showOv('taskOv');
}

function startTaskPlay() {
    try { getAC().resume(); } catch (e) {}
    showOv(null);
    st.running = true;
    isGamePaused = false;
    st.taskCaught = 0;
    st.levelCaught = 0;
    st.items = [];
    lastFrameTime = 0;
    startMusic(-1);
    requestAnimationFrame(gameLoop);
}

function onTaskComplete() {
    st.running = false;
    st.taskDone = true;
    sfxTaskDone();
    sfxLife();
    st.lives = Math.min(st.lives + 1, 5);
    updateHUD();
    st.inTask = false;
    st.taskDef = null;
    updateTaskHud();

    const emoji = document.getElementById('celebEmoji');
    const title = document.getElementById('celebTitle');
    const sub = document.getElementById('celebSub');
    if (emoji) emoji.textContent = '🎯';
    if (title) title.textContent = 'Task Complete!';
    if (sub) sub.innerHTML = 'Excellent! +1 ❤️ life earned!<br>Score: ' + st.score.toLocaleString();
    showOv('celebOv');
}

function afterCeleb() {
    const emoji = document.getElementById('celebEmoji');
    const title = document.getElementById('celebTitle');
    if (emoji) emoji.textContent = '🎉';
    if (title) title.textContent = 'Level Complete!';
    showLevelComplete();
}

function showLevelComplete() {
    document.getElementById('lvEmoji').textContent = '🎉';
    document.getElementById('lvTitle').textContent = 'Level ' + st.level + ' Complete!';
    document.getElementById('lvScore').innerHTML = 'Score: ' + st.score.toLocaleString() +
        (st.lastCoinReward ? ' &nbsp; <span style="color:#FFD700;">+' + st.lastCoinReward + ' 🪙</span>' : '');
    const nl = Math.min(10000, st.level + 1);
    const nextTarget = getLevelTarget(nl);
    let sub = 'Next target: <b style="color:#FFD700;">' + nextTarget + '</b> candies';
    const nextKey = getWorldKey(nl);
    if (nextKey !== currentWorldKey) sub += '<br>🌍 Naya theme: <b style="color:#00FFB0;">' + WORLD_META[nextKey].name + '</b>';
    else if (isTaskLevel(nl)) sub += '<br>🎯 Next level me TASK aayega!';
    document.getElementById('lvSub').innerHTML = sub;
    showOv('levelOv');
}

function showCelebration() {
    sfxSurprise();
    spawnConfetti(70);
    saveLB();
    document.getElementById('celebEmoji').textContent = '🏆';
    document.getElementById('celebTitle').textContent = 'Level ' + st.level.toLocaleString() + '!';
    document.getElementById('celebSub').innerHTML = 'Amazing progress!<br>Score: ' + st.score.toLocaleString() + '<br>💾 Progress Saved!';
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
    } else {
        sfxGameOver();
        document.getElementById('goEmoji').textContent = '💔';
        document.getElementById('goTitle').textContent = 'Game Over!';
        document.getElementById('goTitle').style.color = '#FF4466';
    }
    checkLifetimeRecords();
    document.getElementById('goScore').textContent = 'Score: ' + st.score.toLocaleString();
    renderBestScore();
    document.getElementById('goSub').innerHTML = 'You reached level ' + st.level + '.<br>Progress saved — you can continue!';
    saveProgress();
    saveProgressToCloud();
    saveLB();
    submitScoreToCloud();     // global leaderboard par bhejo
    try {
        document.dispatchEvent(new CustomEvent('cm:gameover', {
            detail: { level: st.level, score: st.score }
        }));
    } catch (e) {}
    showOv('goOv');
}

// ============================================================
// ===== 15. CATCH / MISS LOGIC ===============================
// ============================================================
function onCatch(item) {
    const by = st.basket.y;

    // ---------- BOMB ----------
    if (item.isBomb) {
        if (st.shieldActive) {
            st.shieldActive = false;
            st.shieldFrames = 0;
            updatePowerupHud();
            sfxShield();
            triggerShake(4, 10);
            addRedParticles(item.x, by);
            addFloat('🛡️ SHIELD SAVED!', '#A855F7', true);
            return;
        }
        handleBombEffect(item.bombType);
        addRedParticles(item.x, by);
        return;
    }

    // ---------- GIFT BOX ----------
    if (item.isGift) {
        const g = item.gift || GIFT_TYPES[0];
        const prev = st.lives;
        st.lives = Math.min(st.lives + g.lives, 5);
        const gained = st.lives - prev;
        st.score += g.pts;
        updateHUD();
        sfxSurprise();
        haptic([15, 25, 15, 25, 15]);
        spawnConfetti(24);
        // golden burst
        for (let i = 0; i < 22; i++) {
            const a = Math.random() * Math.PI * 2, spd = 3 + Math.random() * 6;
            st.particles.push({
                x: item.x, y: by, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 4,
                life: 50, maxLife: 50, color: i % 2 === 0 ? g.color : g.color2, r: 4 + Math.random() * 6
            });
        }
        const txt = gained > 0
            ? '🎁 SURPRISE!  +' + gained + ' ❤️  +' + g.pts
            : '🎁 SURPRISE!  +' + g.pts + ' (lives full)';
        addFloat(txt, '#FFD700', true);
        return;
    }

    // ---------- SHIELD ----------
    if (item.isShield) {
        activateShield();
        addParticles(item.x, by, '#A855F7', '#D09BFF');
        addFloat('🛡️ SHIELD! 12s', '#A855F7', true);
        if (st.inTask && st.taskKind === 'special') {
            st.taskCaught++;
            onTaskProgress();
        }
        return;
    }

    // ---------- 10X ----------
    if (item.isMulti) {
        st.combo = Math.min(st.combo + 2, 8);
        st.comboTimer = 90;
        sfxCombo(Math.min(st.combo, 5));
        addParticles(item.x, by, '#FFD700', '#FFFFFF');
        addFloat('✨ 10X BOOST!', '#FFD700', true);
        if (st.inTask && st.taskKind === 'special') {
            st.taskCaught++;
            onTaskProgress();
        }
        return;
    }

    // ---------- TASK LEVEL ----------
    if (st.inTask && st.taskDef) {
        const wantThis = (st.taskKind === 'target') && (item.isTarget || item.candyId === st.taskDef.targetId);
        if (wantThis) {
            st.taskCaught++;
            st.levelCaught++;
            st.score += 10;
            haptic(14);
            if (st.taskCaught >= st.taskDef.count) tickMission('tasks', 1);
            updateHUD();
            sfxCatch();
            addParticles(item.x, by, '#00FFB0', '#FFFFFF');
            addFloat('+10 🎯', '#00FFB0', true);
            onTaskProgress();
        } else {
            // GALAT candy -> life kam
            st.lives--;
            updateHUD();
            sfxWrong();
            haptic([40, 60, 40]);
            triggerShake(6, 12);
            addRedParticles(item.x, by);
            addFloat('❌ Wrong candy! -1 ❤️', '#FF4444', true);
            if (st.lives <= 0) endGame(false);
        }
        return;
    }

    // ---------- NORMAL CANDY ----------
    st.combo++;
    st.comboTimer = 90;
    const multi = Math.min(st.combo, 5);
    const pts = 10 * multi;
    // haptics + missions
    haptic(multi >= 3 ? [12, 30, 12] : 12);
    tickMission('total', 1);
    tickMission('combo', multi, 'max');
    st.score += pts;
    st.levelCaught++;
    if (multi > 1) sfxCombo(multi);
    sfxCatch();
    const colors = ['#FF4D4D', '#4D79FF', '#4DFF88', '#FFFF4D', '#994DFF', '#FF8C00'];
    const col = colors[(item.candyId || 0) % colors.length];
    addParticles(item.x, by, col, '#FFFFFF');
    st.floats.push({ x: item.x, y: by - 16, color: multi > 1 ? '#FFD700' : col, life: 40, text: (multi > 1 ? 'x' + multi + ' ' : '') + '+' + pts, big: multi >= 3 });
    updateHUD();

    if (st.levelCaught >= st.levelTarget) {
        if (st.levelCompleteTriggered) return;
        st.levelCompleteTriggered = true;
        st.running = false;
        setTimeout(onLevelComplete, 120);
    }
}

function onTaskProgress() {
    const def = st.taskDef;
    if (!def) return;
    document.getElementById('taskProg').textContent = st.taskCaught + ' / ' + def.count;
    document.getElementById('taskFill').style.width = Math.min(100, st.taskCaught / def.count * 100) + '%';
    updateTaskHud();
    if (st.taskCaught >= def.count) {
        st.running = false;
        setTimeout(onTaskComplete, 120);
    }
}

function onMiss() {
    // game ruk chuka hai to kuch na karo (warna lives negative chali jayegi)
    if (!st.running) return;
    // task level me galat candy chhod dena sahi baat hai -> koi penalty nahi
    if (st.inTask) return;
    // Har miss par life jaati hai - aakhri life bhi.
    // (Pehle yahan ek early-return tha, jisse 1 life par game kabhi khatam
    //  hi nahi hota tha.)
    st.lostLifeThisLevel = true;
    st.lives--;
    sfxMiss();
    haptic([25, 35]);
    triggerShake(4, 10);
    st.combo = 0;
    st.comboTimer = 0;
    updateHUD();
    if (st.lives <= 0) endGame(false);
}

// ============================================================
// ===== 16. MAIN LOOP ========================================
// ============================================================
const TARGET_FPS = 60;
const FRAME_INTERVAL = 1000 / TARGET_FPS;
let lastFrameTime = 0;
let animFrameId = 0;
let isGamePaused = false;
let autoSpinTimer = 0;

// SMOOTHNESS (v4.4): pehle loop har frame par 60 FPS ka check lagata tha.
// 90Hz / 120Hz screen par isse movement har doosre frame par hi badalti thi ->
// candy ruk-ruk kar chalti dikhti thi. Ab movement asli beetey hue time (dt)
// par based hai, isliye kisi bhi refresh rate par bilkul smooth chalti hai.
function gameLoop(timestamp) {
    if (!st.running) { animFrameId = 0; return; }
    if (isGamePaused) { lastFrameTime = timestamp; animFrameId = requestAnimationFrame(gameLoop); return; }

    // Pehla frame: lastFrameTime reset. Warna pehle frame me dt bahut bada
    // aata hai aur candy ek hi frame me ~37px aage chali jaati hai.
    if (!lastFrameTime) lastFrameTime = timestamp;
    let dtMs = timestamp - lastFrameTime;
    lastFrameTime = timestamp;
    if (!(dtMs > 0)) dtMs = FRAME_INTERVAL;
    if (dtMs > 34) dtMs = 34;               // tab switch ke baad bada jump na ho
    const dtScale = dtMs / FRAME_INTERVAL;  // 1.0 = ek 60 FPS frame

    st.frame += dtScale;
    autoSpinTimer += dtScale;

    // animated counters (score aur coins dheere-dheere badhte hain)
    animateScore();
    updateCoinDisplay();

    // ------------------------------------------------------------
    // ZARURI: transform reset karo — warna DPR scale har frame me
    // multiply hota rehta hai (3, 9, 27 ... 1e62) aur saari drawing
    // screen se bahut bahar chali jati hai (khali screen dikhti hai).
    // `save()` SCALE SE PEHLE hona chahiye, tabhi `restore()` use reset karega.
    // ------------------------------------------------------------
    ctx.save();
    if (dprScale !== 1) ctx.scale(dprScale, dprScale);

    if (shakeFrames > 0) {
        const k = Math.min(1.5, dtScale);
        ctx.translate((Math.random() - 0.5) * shakeIntensity * k, (Math.random() - 0.5) * shakeIntensity * k);
        shakeFrames -= k;
        shakeIntensity *= Math.pow(0.88, k);
    } else {
        shakeIntensity = 0;
    }
    ctx.clearRect(-20, -20, gameW + 40, gameH + 40);
    drawBg();

    if (st.shieldActive) {
        st.shieldFrames -= dtScale;
        if (st.shieldFrames <= 0) { st.shieldActive = false; updatePowerupHud(); }
    }

    if (st.comboTimer > 0) {
        st.comboTimer -= dtScale;
        if (st.comboTimer === 0) st.combo = 0;
    }

    st.spawnTimer += dtScale;
    if (st.spawnTimer >= st.spawnInterval) {
        st.spawnTimer = 0;
        spawnBurst();
    }

    if (autoSpinTimer > 90) { autoSpinTimer = 0; refreshSpinIfNeeded(); }

    const bx = st.basket.x, by = st.basket.y, bw = st.basket.w, bh = st.basket.h;
    const keep = [];

    for (let i = 0; i < st.items.length; i++) {
        const it = st.items[i];
        it.y += it.speed * dtScale;

        // ---- LEHAR (WAVE) MOVEMENT: girte-girte left-right ----
        // Time-based, isliye 60/90/120 Hz har screen par smooth.
        // Spawn par offset 0 aur amplitude pehle 0.25s me dheere se poori hoti
        // hai, isliye entry bhi smooth lagti hai (koi jump nahi).
        if (typeof it.waveAmp === 'number' && typeof it.waveFreq === 'number') {
            if (typeof it.startX !== 'number') it.startX = it.x;
            if (typeof it.waveAge !== 'number') it.waveAge = 0;
            it.waveAge += dtScale;
            it.wavePhase += it.waveFreq * dtScale;
            let ease = it.waveAge / 15;                       // 15 frames = 0.25 s
            if (ease > 1) ease = 1;
            ease = ease * ease * (3 - 2 * ease);              // smoothstep
            it.x = it.startX + Math.sin(it.wavePhase) * it.waveAmp * ease;
        }
        it.rot += it.rotationSpeed;
        it.x = Math.max(it.size * 0.5, Math.min(gameW - it.size * 0.5, it.x));

        const caught = it.y > by - 12 && it.y < by + bh + 6 &&
            it.x > bx - bw / 2 - it.size * 0.55 &&
            it.x < bx + bw / 2 + it.size * 0.55;

        if (caught) {
            onCatch(it);
            if (!st.running) { ctx.restore(); animFrameId = 0; return; }
            continue;
        }

        if (it.y - it.size > gameH) {
            // bomb ko girne dena = sahi khel (dodge). Isliye bomb chhodne par
            // koi life nahi girti — pehle yahan onMiss() bhi chal raha tha,
            // jisse bomb bachane par bhi life kam hoti thi (bug).
            if (it.isBomb) {
                tickMission('bombs', 1);
                continue;
            }
            // gift box chhod dena = koi penalty nahi (wo bonus tha)
            if (it.isGift) continue;
            if (!st.inTask) onMiss();
            if (!st.running) { ctx.restore(); animFrameId = 0; return; }
            continue;
        }

        drawItem(it);
        keep.push(it);
    }
    st.items = keep;

    st.particles = st.particles.filter(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.22; p.life--;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        glow(p.color, 6);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.r * (p.life / p.maxLife)), 0, Math.PI * 2);
        ctx.fill();
        ng();
        ctx.restore();
        return p.life > 0;
    });

    st.floats = st.floats.filter(f => {
        f.y -= 1.3; f.life--;
        ctx.save();
        const maxLife = f.big ? 80 : 45;
        ctx.globalAlpha = Math.max(0, Math.min(1, f.life / maxLife));
        glow(f.color, f.big ? 12 : 8);
        ctx.fillStyle = f.color;
        ctx.font = 'bold ' + (f.big ? 18 * scaleX : 15 * scaleX) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(f.text, f.x, f.y);
        ng();
        ctx.restore();
        return f.life > 0;
    });

    st.confetti = st.confetti.filter(c => {
        c.x += c.vx; c.y += c.vy; c.vy += 0.04; c.rot += c.vrot; c.life--;
        ctx.save();
        ctx.globalAlpha = Math.min(1, c.life / 30);
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
        ctx.restore();
        return c.life > 0 && c.y < gameH + 20;
    });

    // coin fly animation ("+5 🪙" upar tairta hua)
    if (coinFly.length) {
        coinFly = coinFly.filter(c => {
            c.y -= 1.4; c.life--;
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, c.life / c.maxLife));
            glow('#FFD700', 10);
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold ' + (15 * scaleX) + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(c.text, c.x, c.y);
            ng();
            ctx.restore();
            return c.life > 0;
        });
    }

    if (st.combo >= 2 && !st.inTask) {
        const multi = Math.min(st.combo, 5);
        const colors = ['', '', '#FFD700', '#FF8C00', '#FF4DA6', '#FF00FF'];
        ctx.save();
        ctx.globalAlpha = 0.85;
        glow(colors[multi] || '#FFD700', 8);
        ctx.fillStyle = colors[multi] || '#FFD700';
        ctx.font = 'bold ' + (13 * scaleX) + 'px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('🔥 COMBO x' + multi, 12 * scaleX, gameH - 16 * scaleY);
        ng();
        ctx.restore();
    }

    if (st.inTask && st.taskDef) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        glow('#00FFB0', 10);
        ctx.fillStyle = '#00FFB0';
        ctx.font = 'bold ' + (12 * scaleX) + 'px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('🎯 TASK  ' + st.taskCaught + '/' + st.taskDef.count, 12 * scaleX, gameH - 16 * scaleY);
        ng();
        ctx.restore();
    } else {
        drawProgressBar();
    }

    if (st.shieldActive) {
        const pulse = Math.sin(st.frame * 0.12) * 0.4 + 0.6;
        ctx.save();
        glow('#A855F7', 12 * pulse);
        ctx.strokeStyle = 'rgba(168,85,247,' + (0.55 * pulse) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(bx, by - 10, st.basket.w * 0.72 + 8, Math.PI, 0, false);
        ctx.stroke();
        ng();
        ctx.restore();
    }

    drawBasketWithSkin(bx, by, bw, bh);
    ctx.restore();
    animFrameId = requestAnimationFrame(gameLoop);
}

// ============================================================
// ===== HAPTICS (vibration) ==================================
// Settings me Vibration toggle pehle sirf save hota tha, kabhi use nahi hota tha.
// ============================================================
let hapticsOn = localStorage.getItem('game_vibration') === 'on';

function haptic(pattern) {
    if (!hapticsOn) return;
    try {
        if (navigator && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
    } catch (e) {}
}

// ============================================================
// ===== TOAST (native alert ki jagah) ========================
// alert() blocking hota hai — usse sound aur animation ruk jati thi.
// ============================================================
let toastTimer = null;
function toast(msg, color, ms) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.innerHTML = msg;
    el.style.color = color || '#FFD700';
    el.style.display = 'block';
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.display = 'none'; }, ms || 2200);
}

// ============================================================
// ===== LIFETIME STATS (best score / best level) =============
// ============================================================
function getLifetime() {
    try {
        const d = JSON.parse(localStorage.getItem('cm_lifetime') || 'null');
        if (d) return { bestScore: d.bestScore || 0, bestLevel: d.bestLevel || 1, totalCoins: d.totalCoins || 0 };
    } catch (e) {}
    return { bestScore: 0, bestLevel: 1, totalCoins: 0 };
}
function setLifetime(d) { localStorage.setItem('cm_lifetime', JSON.stringify(d)); }

// Naya record bana? Toast dikhao aur save karo.
function checkLifetimeRecords() {
    const life = getLifetime();
    let changed = false;
    if (st.score > (life.bestScore || 0)) { life.bestScore = st.score; changed = true; }
    if (st.level > (life.bestLevel || 1)) { life.bestLevel = st.level; changed = true; }
    if (changed) setLifetime(life);
    return life;
}

// ============================================================
// ===== SCORE / COIN ANIMATION ===============================
// ============================================================
let shownScore = 0;
let shownCoins = 0;
let coinFly = [];

function animateScore() {
    if (shownScore !== st.score) {
        const diff = st.score - shownScore;
        const step = Math.max(1, Math.ceil(Math.abs(diff) / 6));
        shownScore += diff > 0 ? Math.min(step, diff) : Math.max(-step, diff);
        const el = document.getElementById('sc');
        if (el) el.textContent = shownScore.toLocaleString();
    }
}

function updateCoinDisplay() {
    const target = getCoins();
    if (shownCoins !== target) {
        const diff = target - shownCoins;
        const step = Math.max(1, Math.ceil(Math.abs(diff) / 6));
        shownCoins += diff > 0 ? Math.min(step, diff) : Math.max(-step, diff);
    }
    const str = '🪙 ' + shownCoins.toLocaleString();
    const a = document.getElementById('coinHud');
    if (a) a.textContent = str;
    const b = document.getElementById('homeCoinBtn');
    if (b) b.textContent = str;
    const c = document.getElementById('shopCoinLabel');
    if (c) c.textContent = str;
}

// Level complete par milne wale coins (level ke saath badhte hain)
function getLevelCoinReward(lvl) {
    const base = 1 + Math.floor(Math.min(lvl, 10000) / 400);
    const isTask = (lvl % 5 === 0);
    return Math.min(25, base + (isTask ? 3 : 0));
}

// Coins do + screen par "+N" dikhao
// NOTE: totalCoins ka hisaab setCoins() khud rakhta hai, isliye yahan dobara
// nahi jodte (warna double count ho jata).
function awardCoins(n, x, y) {
    if (!n) return;
    addCoins(n);
    coinFly.push({ x: (x === undefined ? gameW / 2 : x), y: (y === undefined ? gameH * 0.6 : y), text: '+' + n + ' 🪙', life: 70, maxLife: 70 });
    sfxCoin();
}

function sfxCoin() { beep(1200, 'sine', 0.07, 0.22); beep(1600, 'sine', 0.06, 0.18, 0.06); }
function sfxUnlock() { [660, 880, 1100, 1320].forEach((f, i) => beep(f, 'triangle', 0.12, 0.26, i * 0.09)); }

// ============================================================
// ===== MISSIONS / ACHIEVEMENTS ==============================
// Har mission ka apna progress hota hai, aur poora hone par coins milte hain.
// ============================================================
const MISSIONS = [
    { id: 'total', def: 500, reward: 20, icon: '🍬', name: 'Candy Collector', text: 'Catch {n} candies (total)' },
    { id: 'combo', def: 15, reward: 30, icon: '🔥', name: 'Combo Master', text: 'Reach a {n}x combo' },
    { id: 'levels', def: 25, reward: 40, icon: '📈', name: 'High Climber', text: 'Clear {n} rounds' },
    { id: 'tasks', def: 5, reward: 50, icon: '🎯', name: 'Task Hero', text: 'Complete {n} bonus tasks' },
    { id: 'bombs', def: 10, reward: 35, icon: '💣', name: 'Bomb Dodger', text: 'Dodge {n} bombs (let them fall)' },
    { id: 'nohit', def: 5, reward: 45, icon: '🛡️', name: 'Untouchable', text: 'Clear {n} rounds without losing a life' },
    { id: 'jars', def: 5, reward: 60, icon: '🎨', name: 'Basket Fan', text: 'Unlock {n} baskets' },
    { id: 'coins', def: 1000, reward: 50, icon: '🪙', name: 'Coin Saver', text: 'Earn {n} coins (total)' }
];

let missions = {};

function loadMissions() {
    try { missions = JSON.parse(localStorage.getItem('cm_missions') || '{}') || {}; } catch (e) { missions = {}; }
    if (typeof missions !== 'object' || !missions) missions = {};
    MISSIONS.forEach(m => {
        if (!missions[m.id]) missions[m.id] = { v: 0, done: false };
        if (typeof missions[m.id].v !== 'number') missions[m.id].v = 0;
    });
}
function saveMissions() { localStorage.setItem('cm_missions', JSON.stringify(missions)); }

// Mission progress badhao. Agar poora ho gaya to coins + toast.
// mode: 'add' (default) | 'max' | 'abs'
function tickMission(id, amount, mode) {
    const m = missions[id];
    if (!m) return;
    const def = MISSIONS.filter(x => x.id === id)[0];
    if (!def) return;
    if (m.done) return;                    // ek baar poora hone ke baad dobara nahi
    if (mode === 'max') m.v = Math.max(m.v, amount);
    else if (mode === 'abs') m.v = amount;
    else m.v += amount;
    const justDone = m.v >= def.def;
    if (justDone) {
        m.done = true;
        m.v = def.def;
        addCoins(def.reward);       // totalCoins setCoins() khud track karta hai
        sfxUnlock();
        toast(def.icon + ' <b>' + def.name + '</b> complete!  +' + def.reward + ' 🪙', '#00FFB0', 3000);
    }
    saveMissions();
}

function missionProgressText(def, m) {
    const v = Math.min(m.v, def.def);
    return v.toLocaleString() + ' / ' + def.def.toLocaleString();
}

function renderMissions() {
    const wrap = document.getElementById('missionList');
    if (!wrap) return;
    const done = MISSIONS.filter(m => missions[m.id] && missions[m.id].done).length;
    const head = document.getElementById('missionHead');
    if (head) head.textContent = done + ' / ' + MISSIONS.length + ' complete';
    let html = '';
    MISSIONS.forEach(def => {
        const m = missions[def.id] || { v: 0, done: false };
        const pct = Math.min(100, Math.round(Math.min(m.v, def.def) / def.def * 100));
        html += '<div class="mission ' + (m.done ? 'done' : '') + '">' +
            '<div class="ms-top"><span class="ms-icon">' + def.icon + '</span>' +
            '<span class="ms-name">' + def.name + '</span>' +
            '<span class="ms-reward">' + (m.done ? '✅' : '+' + def.reward + ' 🪙') + '</span></div>' +
            '<div class="ms-text">' + def.text.replace('{n}', def.def.toLocaleString()) + '</div>' +
            '<div class="ms-bar"><div class="ms-fill" style="width:' + pct + '%"></div></div>' +
            '<div class="ms-prog">' + missionProgressText(def, m) + '</div></div>';
    });
    wrap.innerHTML = html;
}

function showMissions() {
    showOv('missionOv');
    renderMissions();
}

function closeMissions() {
    if (isOnHomePage) showHomePage();
    else showOv(null);
}

// ============================================================
// ===== 17. PAUSE / ROADMAP / DAILY / SETTINGS ===============
// ============================================================
function togglePause() {
    if (!st.running) return;
    const pauseOv = document.getElementById('pauseOv');
    if (!isGamePaused) {
        isGamePaused = true;
        if (pauseOv) pauseOv.style.display = 'flex';
        stopMusic();
        renderPauseStats();
    } else {
        isGamePaused = false;
        if (pauseOv) pauseOv.style.display = 'none';
        if (musicEnabled) startMusic(st.inTask ? -1 : 0);
    }
}

// Pause menu me current stats + toggle states dikhao
function renderPauseStats() {
    const el = document.getElementById('pauseStats');
    if (el) {
        el.innerHTML = 'Level <b>' + st.level.toLocaleString() + '</b> &nbsp;·&nbsp; Score <b>' +
            st.score.toLocaleString() + '</b> &nbsp;·&nbsp; ' + '❤️'.repeat(Math.max(0, st.lives));
    }
    const sBtn = document.getElementById('pauseSoundBtn');
    if (sBtn) sBtn.textContent = soundEnabled ? '🔊 Sound ON' : '🔇 Sound OFF';
    const mBtn = document.getElementById('pauseMusicBtn');
    if (mBtn) mBtn.textContent = musicEnabled ? '🎵 Music ON' : '🔇 Music OFF';
    const vBtn = document.getElementById('pauseVibBtn');
    if (vBtn) vBtn.textContent = hapticsOn ? '📳 Vibration ON' : '📴 Vibration OFF';
}

// Restart current level (lives 3 se, score same)
function restartLevel() {
    isGamePaused = false;
    const pauseOv = document.getElementById('pauseOv');
    if (pauseOv) pauseOv.style.display = 'none';
    const lvl = st.level;
    const score = st.score;
    initLevel(lvl, score, 3);
    showOv(null);
    st.running = true;
    lastFrameTime = 0;
    startMusic(st.inTask ? -1 : 0);
    requestAnimationFrame(gameLoop);
}

// Pause se home jao
function pauseGoHome() {
    isGamePaused = false;
    const pauseOv = document.getElementById('pauseOv');
    if (pauseOv) pauseOv.style.display = 'none';
    st.running = false;
    saveProgress();
    saveProgressToCloud();
    stopMusic();
    showHomePage(currentUserName, currentUserEmail);
}

// Roadmap ab sirf 3 themes dikhata hai — koi level number nahi,
// aur "you are here" bhi nahi (usse pata chal jata ki kitne level hain).
function showRoadmap() {
    showOv('roadmapOv');
    const el = document.getElementById('roadmapContent');
    if (!el) return;
    const themes = [
        // Koi level range nahi likhna — usse total level count pata chal jata hai.
        { key: 'candy', emoji: '🍬', name: 'Candy Kingdom', desc: 'Where your journey begins' },
        { key: 'fish', emoji: '🐟', name: 'Deep Sea Fish', desc: 'A whole new ocean of candy' },
        { key: 'coffee', emoji: '☕', name: 'Premium Coffee', desc: 'The final grind' }
    ];
    let html = '';
    themes.forEach(t => {
        const meta = WORLD_META[t.key];
        html += '<div class="roadmap-world" style="border-left-color:' + meta.bar1 + ';">' +
            '<div class="roadmap-header"><span class="roadmap-emoji">' + t.emoji + '</span>' +
            '<div class="roadmap-name">' + t.name + '</div></div>' +
            '<div class="roadmap-current" style="color:rgba(255,255,255,0.6);">' + t.desc + '</div>' +
            '</div>';
    });
    html += '<div style="font-size:12px; color:#FFD700; text-align:center; margin-top:10px;">' +
        'Keep playing — the themes change as you go! 🌍</div>';
    el.innerHTML = html;
}

function closeRoadmap() { showHomePage(); }

// ===== DAILY REWARD =====
const DAILY_KEY = 'cm_daily_v1';
const STREAK_KEY = 'cm_streak_v1';
const WHEEL_SEGMENTS = [
    { label: '+500',    emoji: '⭐', color: '#E23E7A', reward: { type: 'pts', val: 500 } },
    { label: '+50 🪙',  emoji: '🪙', color: '#3D8BFD', reward: { type: 'coins', val: 50 } },
    { label: '+2 ❤️',   emoji: '❤️', color: '#E23E7A', reward: { type: 'lives', val: 2 } },
    { label: '🛡️ 20s',  emoji: '🛡️', color: '#8B5CF6', reward: { type: 'shield', val: 20 } },
    { label: '+150 🪙', emoji: '💰', color: '#3D8BFD', reward: { type: 'coins', val: 150 } },
    { label: '+5 ❤️',   emoji: '💖', color: '#E23E7A', reward: { type: 'lives', val: 5 } },
    { label: '+2000',   emoji: '💎', color: '#3D8BFD', reward: { type: 'pts', val: 2000 } },
    { label: 'JACKPOT', emoji: '🏆', color: '#F0A020', reward: { type: 'jackpot', val: 5000 } }
];
let wheelAngle = 0, wheelSpinning = false;

function getDailyData() { try { return JSON.parse(localStorage.getItem(DAILY_KEY) || 'null'); } catch (e) { return null; } }
function setDailyData(d) { localStorage.setItem(DAILY_KEY, JSON.stringify(d)); }
function getStreak() { try { return JSON.parse(localStorage.getItem(STREAK_KEY) || '{"streak":0,"lastDate":""}'); } catch (e) { return { streak: 0, lastDate: '' }; } }
function setStreak(d) { localStorage.setItem(STREAK_KEY, JSON.stringify(d)); }
function getTodayStr() { return new Date().toISOString().slice(0, 10); }
function canClaimToday() { const d = getDailyData(); if (!d) return true; return d.lastClaim !== getTodayStr(); }
function checkDailyBadge() { const badge = document.getElementById('dailyBadge'); if (badge) badge.style.display = canClaimToday() ? 'block' : 'none'; }

function showDailyReward() {
    showOv('dailyOv');
    drawWheel(wheelAngle);
    renderStreak();
    updateCoinLabels();
    const spinBtn = document.getElementById('spinBtnEl');
    const already = !canClaimToday();
    spinBtn.disabled = already;
    spinBtn.style.opacity = already ? '0.45' : '1';
    spinBtn.textContent = already ? '✅ Already spun today' : '🎰 SPIN NOW';
    const cd = document.getElementById('spinCooldown');
    cd.style.display = already ? 'block' : 'none';
    if (already) updateCooldownTimer();
}

function refreshSpinIfNeeded() {
    const cd = document.getElementById('spinCooldown');
    if (!cd || cd.style.display === 'none') return;
    updateCooldownTimer();
}

let cooldownTimerInterval = null;

function updateCooldownTimer() {
    const now = new Date();
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    const diff = tomorrow - now;
    const cd = document.getElementById('spinCooldown');
    const spinBtn = document.getElementById('spinBtnEl');
    if (diff <= 0) {
        if (cooldownTimerInterval) { clearInterval(cooldownTimerInterval); cooldownTimerInterval = null; }
        if (cd) cd.style.display = 'none';
        if (spinBtn) { spinBtn.disabled = false; spinBtn.style.opacity = '1'; spinBtn.textContent = 'Spin Now'; }
        return;
    }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const txt = h + 'h ' + m + 'm ' + s + 's';
    const timerEl = document.getElementById('cooldownTimer');
    if (timerEl) timerEl.textContent = txt;
    else if (cd) cd.textContent = 'Next spin in ' + txt;
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
        html += '<div class="streak-dot ' + cls + '">' + (cls === 'done' ? '✓' : '🍬') + '</div>';
    }
    row.innerHTML = html;
    msg.textContent = streak === 0 ? 'Spin every day to earn coins!' : '🔥 ' + streak + ' day streak!';
}

function shade(hex, amt) {
    if (!hex || hex.charAt(0) !== '#') return hex;
    let r = parseInt(hex.slice(1, 3), 16), g2 = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    r = Math.round(r + (255 - r) * amt);
    g2 = Math.round(g2 + (255 - g2) * amt);
    b = Math.round(b + (255 - b) * amt);
    return '#' + [r, g2, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

function drawWheel(angle) {
    const c = document.getElementById('wheelCanvas');
    if (!c) return;
    const g = c.getContext('2d');
    const cx = c.width / 2, cy = c.height / 2;
    const R = Math.min(cx, cy) - 14;
    const segs = WHEEL_SEGMENTS;
    const segA = (Math.PI * 2) / segs.length;
    g.clearRect(0, 0, c.width, c.height);

    g.beginPath(); g.arc(cx, cy, R + 8, 0, Math.PI * 2);
    const rim = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    rim.addColorStop(0, '#FFF3B0');
    rim.addColorStop(0.45, '#FFD700');
    rim.addColorStop(1, '#B8860B');
    g.fillStyle = rim; g.fill();

    for (let i = 0; i < segs.length; i++) {
        const sA = angle + i * segA, eA = sA + segA;
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, R, sA, eA);
        g.closePath();
        const lg = g.createRadialGradient(cx, cy, R * 0.12, cx, cy, R);
        lg.addColorStop(0, shade(segs[i].color, 0.45));
        lg.addColorStop(1, segs[i].color);
        g.fillStyle = lg;
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.55)';
        g.lineWidth = 1.5;
        g.stroke();

        const mid = sA + segA / 2;
        const lx = cx + Math.cos(mid) * R * 0.63;
        const ly = cy + Math.sin(mid) * R * 0.63;
        g.save();
        g.translate(lx, ly);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.shadowColor = 'rgba(0,0,0,0.6)';
        g.shadowBlur = 4;
        g.font = 'bold 16px "Segoe UI Emoji", sans-serif';
        g.fillText(segs[i].emoji, 0, -9);
        g.font = 'bold 11px "Segoe UI", sans-serif';
        g.fillStyle = '#FFFFFF';
        g.fillText(segs[i].label, 0, 9);
        g.restore();
    }

    const hub = g.createRadialGradient(cx - 6, cy - 6, 2, cx, cy, 21);
    hub.addColorStop(0, '#FFFFFF');
    hub.addColorStop(0.5, '#FFD700');
    hub.addColorStop(1, '#B8860B');
    g.beginPath(); g.arc(cx, cy, 20, 0, Math.PI * 2);
    g.fillStyle = hub; g.fill();
    g.strokeStyle = '#8A6508'; g.lineWidth = 2; g.stroke();
    g.font = 'bold 17px "Segoe UI Emoji", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('🍬', cx, cy + 1);

    g.beginPath();
    g.moveTo(cx, cy - R + 4);
    g.lineTo(cx - 12, cy - R - 16);
    g.lineTo(cx + 12, cy - R - 16);
    g.closePath();
    g.fillStyle = '#FF3B6B';
    g.shadowColor = '#FF3B6B'; g.shadowBlur = 12;
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = '#FFFFFF'; g.lineWidth = 2; g.stroke();
}
function spinWheel() {
    if (wheelSpinning || !canClaimToday()) return;
    const segs = WHEEL_SEGMENTS;
    const segA = (Math.PI * 2) / segs.length;
    const winIdx = Math.floor(Math.random() * segs.length);

    // pointer upar (-90 deg) par hai; winner segment ko pointer ke neeche laao
    const targetCenter = -Math.PI / 2;
    const center = targetCenter - winIdx * segA;
    const start = wheelAngle;
    let delta = center - start;
    delta = ((delta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const turns = 6 + Math.floor(Math.random() * 3);
    const total = turns * Math.PI * 2 + delta;

    const duration = 3800;
    const t0 = performance.now();
    wheelSpinning = true;
    const btn = document.getElementById('spinBtnEl');
    if (btn) { btn.disabled = true; btn.textContent = '🎡 Spinning...'; }

    let tick = 0;
    function animate(now) {
        const t = Math.min((now - t0) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3.2);
        wheelAngle = start + total * eased;
        drawWheel(wheelAngle);
        if (tick++ % 7 === 0) beep(1100 - Math.round(t * 450), 'square', 0.03, 0.05);
        if (t < 1) requestAnimationFrame(animate);
        else { wheelSpinning = false; claimReward(segs[winIdx]); }
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
    setStreak({ streak: streak, lastDate: today });

    const r = seg.reward;
    let msg = '';
    let color = '#FFD700';

    if (r.type === 'pts') {
        st.score += r.val; updateHUD();
        msg = '+' + r.val.toLocaleString() + ' points'; color = '#00FFB0'; sfxCatch();
    } else if (r.type === 'coins') {
        addCoins(r.val);
        msg = '+' + r.val.toLocaleString() + ' coins — spend them in the Basket Shop!';
        color = '#FFD700'; sfxShield();
    } else if (r.type === 'lives') {
        st.lives = Math.min(st.lives + r.val, 5); updateHUD();
        msg = '+' + r.val + ' ❤️ lives (max 5)'; color = '#FF6EB4'; sfxLife();
    } else if (r.type === 'shield') {
        st.shieldActive = true;
        st.shieldFrames = 60 * r.val;
        st.shieldMaxFrames = 60 * r.val;
        updatePowerupHud();
        msg = '🛡️ Shield ' + r.val + ' second ke liye ready!'; color = '#A855F7'; sfxShield();
    } else if (r.type === 'jackpot') {
        st.score += r.val; addCoins(500);
        st.lives = Math.min(st.lives + 2, 5); updateHUD();
        msg = 'JACKPOT! +' + r.val.toLocaleString() + ' points, +500 🪙 aur +2 ❤️';
        color = '#FF8C00'; sfxSurprise(); spawnConfetti(70);
    }

    // ---- streak bonus: day 3 par 100 coins, day 7 par 300 coins ----
    let streakBonus = 0;
    if (streak > 0 && streak % 7 === 0) streakBonus = 300;
    else if (streak > 0 && streak % 3 === 0) streakBonus = 100;
    if (streakBonus > 0) {
        addCoins(streakBonus);
        msg += '  |  🔥 ' + streak + '-day streak bonus: +' + streakBonus + ' 🪙';
        sfxUnlock();
    }

    saveProgress();
    saveLB();
    updateCoinLabels();
    checkDailyBadge();

    const emojiEl = document.getElementById('rewardEmoji');
    const textEl = document.getElementById('rewardText');
    const resultDiv = document.getElementById('rewardResult');
    if (emojiEl) emojiEl.textContent = seg.emoji;
    if (textEl) { textEl.textContent = msg; textEl.style.color = color; }
    if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.classList.remove('pop');
        void resultDiv.offsetWidth;
        resultDiv.classList.add('pop');
    }

    const btn = document.getElementById('spinBtnEl');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.45'; btn.textContent = '✅ Already spun today'; }
    const cd = document.getElementById('spinCooldown');
    if (cd) cd.style.display = 'block';
    updateCooldownTimer();
}

function closeDailyReward() {
    if (cooldownTimerInterval) { clearInterval(cooldownTimerInterval); cooldownTimerInterval = null; }
    showHomePage();
}

// ===== SETTINGS =====
function loadSettings() {
    const sound = localStorage.getItem('game_sound');
    const music = localStorage.getItem('game_music');
    const vib = localStorage.getItem('game_vibration');
    const pocket = localStorage.getItem('game_pocket');
    const elSound = document.getElementById('setSound');
    const elMusic = document.getElementById('setMusic');
    const elVib = document.getElementById('setVibration');
    const elPocket = document.getElementById('setPocket');
    if (elSound) elSound.checked = sound !== 'off';
    if (elMusic) elMusic.checked = music !== 'off';
    if (elVib) elVib.checked = vib === 'on';
    if (elPocket) elPocket.checked = pocket !== 'off';
    soundEnabled = elSound ? elSound.checked : true;
    musicEnabled = elMusic ? elMusic.checked : true;
    hapticsOn = elVib ? elVib.checked : false;
    initSoundBtn();
    if (musicEnabled && st && st.running) startMusic(st.inTask ? -1 : 0);
    else stopMusic();
}

function saveSettings() {
    const elSound = document.getElementById('setSound');
    const elMusic = document.getElementById('setMusic');
    const elVib = document.getElementById('setVibration');
    const elPocket = document.getElementById('setPocket');
    localStorage.setItem('game_sound', elSound.checked ? 'on' : 'off');
    localStorage.setItem('game_music', elMusic.checked ? 'on' : 'off');
    localStorage.setItem('game_vibration', elVib.checked ? 'on' : 'off');
    localStorage.setItem('game_pocket', elPocket.checked ? 'on' : 'off');
    soundEnabled = elSound.checked;
    musicEnabled = elMusic.checked;
    hapticsOn = elVib.checked;
    if (musicEnabled && st && st.running) startMusic(st.inTask ? -1 : 0);
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
        if (musicEnabled) startMusic(st.inTask ? -1 : 0);
    }
    if (isOnHomePage) showHomePage();
    else showOv(null);
}

function showHelp() { showOv('helpOv'); }

function exitGame() {
    document.body.classList.remove('game-active');
    st.running = false;
    stopMusic();
    const overlays = ['levelOv', 'taskOv', 'celebOv', 'lbOv', 'roadmapOv', 'dailyOv', 'goOv', 'settingsOv', 'helpOv', 'pauseOv'];
    overlays.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    showHomePage(currentUserName, currentUserEmail);
}

// ============================================================
// ===== 18. GLOBAL EXPORTS ===================================
// ============================================================
window.enterGame = enterGame;
window.startGame = startGame;
window.startGameFromHome = startGameFromHome;
window.nextLevel = nextLevel;
window.startTaskPlay = startTaskPlay;
window.afterCeleb = afterCeleb;
window.logout = logout;
window.guestLogin = guestLogin;
window.showLeaderboard = showLeaderboard;
window.submitScoreToCloud = submitScoreToCloud;
window.buildLeaderboard = buildLeaderboard;
window.closeLB = closeLB;
window.showRoadmap = showRoadmap;
window.closeRoadmap = closeRoadmap;
window.showDailyReward = showDailyReward;
window.closeDailyReward = closeDailyReward;
window.spinWheel = spinWheel;
window.cycleSkin = cycleSkin;
window.showBasketShop = showBasketShop;
window.closeBasketShop = closeBasketShop;
window.selectBasket = selectBasket;
window.renderBasketShop = renderBasketShop;
window.showMissions = showMissions;
window.closeMissions = closeMissions;
window.restartLevel = restartLevel;
window.pauseGoHome = pauseGoHome;
window.toast = toast;
window.showSettings = showSettings;
window.closeSettings = closeSettings;
window.showHelp = showHelp;
window.togglePause = togglePause;
window.toggleMusic = toggleMusic;
window.toggleSound = toggleSound;
window.exitGame = exitGame;
window.getLevelTarget = getLevelTarget;
window.CandyMassDebug = {
    VERSION: 'v4.9',
    st: st,
    worldReady: worldReady,
    worldImages: worldImages,
    worldCells: worldCells,
    getValidIds: getValidIds,
    taskTargetCount: taskTargetCount,
    isTaskLevel: isTaskLevel,
    isSkinUnlocked: isSkinUnlocked,
    getCoins: getCoins,
    setCoins: setCoins,
    addCoins: addCoins,
    getWaveConfig: getWaveConfig,
    getWaveWeights: getWaveWeights,
    getGiftChance: getGiftChance,
    pickGiftType: pickGiftType,
    GIFT_TYPES: GIFT_TYPES,
    WAVE_EASY: WAVE_EASY, WAVE_BAL: WAVE_BAL, WAVE_HARD: WAVE_HARD,
    getLevelCoinReward: getLevelCoinReward,
    countUnlockedBaskets: countUnlockedBaskets,
    getLifetime: getLifetime,
    buildLeaderboard: buildLeaderboard,
    canUseCloudLB: canUseCloudLB,
    lbDocId: lbDocId,
    MISSIONS: MISSIONS,
    missions: missions,
    tickMission: tickMission,
    toast: toast,
    awardCoins: awardCoins,
    BASKET_SKINS: BASKET_SKINS,
    getLevelTarget: getLevelTarget,
    getBombChance: getBombChance,
    getSpeedForLevel: getSpeedForLevel,
    getSpawnIntervalForLevel: getSpawnIntervalForLevel,
    getWorldKey: getWorldKey,
    WORLD_SHEETS: WORLD_SHEETS,
    computeCellBounds: computeCellBounds
};

// ============================================================
// ===== 19. EVENT LISTENERS ==================================
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const homeBtns = {
        'homeMusicBtn': toggleMusic, 'homeSoundBtn': toggleSound, 'homeSkinBtn': cycleSkin,
        'homeLogoutBtn': logout, 'homeNewGameBtn': () => startGame(false), 'homeContinueBtn': () => startGame(true),
        'homeLbBtn': showLeaderboard, 'homeMapBtn': showRoadmap, 'homeDailyBtn': showDailyReward,
        'homeSettingsBtn': showSettings, 'homeSkinBtn2': cycleSkin, 'homeHelpBtn': showHelp,
        'homeMissionBtn': showMissions
    };
    Object.keys(homeBtns).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', homeBtns[id]);
    });

    document.getElementById('guestLoginBtn')?.addEventListener('click', guestLogin);
    document.getElementById('settingsLogoutBtn')?.addEventListener('click', logout);
    document.getElementById('exitGameBtn')?.addEventListener('click', exitGame);
    document.getElementById('closeSettingsBtn')?.addEventListener('click', closeSettings);
    document.getElementById('helpBackBtn')?.addEventListener('click', () => { if (isOnHomePage) showHomePage(); else showOv(null); });
    document.getElementById('resumeBtn')?.addEventListener('click', togglePause);
    document.getElementById('pauseRestartBtn')?.addEventListener('click', restartLevel);
    document.getElementById('pauseHomeBtn')?.addEventListener('click', pauseGoHome);
    document.getElementById('pauseSoundBtn')?.addEventListener('click', () => { toggleSound(); renderPauseStats(); });
    document.getElementById('pauseMusicBtn')?.addEventListener('click', () => { toggleMusic(); renderPauseStats(); });
    document.getElementById('pauseVibBtn')?.addEventListener('click', () => {
        hapticsOn = !hapticsOn;
        localStorage.setItem('game_vibration', hapticsOn ? 'on' : 'off');
        const el = document.getElementById('setVibration');
        if (el) el.checked = hapticsOn;
        haptic(30);
        renderPauseStats();
    });
    document.getElementById('homeMissionBtn')?.addEventListener('click', showMissions);
    document.getElementById('missionBackBtn')?.addEventListener('click', closeMissions);
    document.getElementById('nextLevelBtn')?.addEventListener('click', nextLevel);
    document.getElementById('startTaskBtn')?.addEventListener('click', startTaskPlay);
    document.getElementById('celebContinueBtn')?.addEventListener('click', afterCeleb);
    document.getElementById('lbBackBtn')?.addEventListener('click', closeLB);
    document.getElementById('roadmapBackBtn')?.addEventListener('click', closeRoadmap);
    document.getElementById('spinBtnEl')?.addEventListener('click', spinWheel);
    document.getElementById('dailyBackBtn')?.addEventListener('click', closeDailyReward);
    document.getElementById('basketBackBtn')?.addEventListener('click', closeBasketShop);
    document.getElementById('homeCoinBtn')?.addEventListener('click', showDailyReward);
    document.getElementById('coinHud')?.addEventListener('click', showBasketShop);
    document.getElementById('goContinueBtn')?.addEventListener('click', () => startGame(true));
    document.getElementById('goRestartBtn')?.addEventListener('click', () => startGame(false));
    document.getElementById('settingsBtn')?.addEventListener('click', showSettings);
    document.getElementById('musicToggleBtn')?.addEventListener('click', toggleMusic);
    document.getElementById('soundToggleBtn')?.addEventListener('click', toggleSound);
    document.getElementById('pauseBtn')?.addEventListener('click', togglePause);

    canvas.addEventListener('mousemove', e => { if (st.running) moveB(e.clientX); });
    canvas.addEventListener('touchmove', e => { e.preventDefault(); if (st.running && e.touches && e.touches.length) moveB(e.touches[0].clientX); }, { passive: false });
    canvas.addEventListener('touchstart', e => { e.preventDefault(); if (st.running && e.touches && e.touches.length) moveB(e.touches[0].clientX); }, { passive: false });
});

// ============================================================
// ===== 20. DEBUG TABLE (level curve check) ==================
// ============================================================
// ============================================================
// ===== AUDIO LIFECYCLE ======================================
// Tab background me jaane par music band, wapas aane par chalu.
// iOS par AudioContext background se aane ke baad suspend reh jata hai.
// ============================================================
let musicWasPlayingBeforeHide = false;

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        musicWasPlayingBeforeHide = musicPlaying;
        if (musicPlaying) stopMusic();
        if (st && st.running) isGamePaused = true;
    } else {
        try { if (AC && AC.state === 'suspended') AC.resume(); } catch (e) {}
        if (st && st.running) isGamePaused = false;
        if (musicWasPlayingBeforeHide && musicEnabled && st && st.running) startMusic(st.inTask ? -1 : 0);
        musicWasPlayingBeforeHide = false;
    }
});

window.addEventListener('blur', () => {
    if (musicPlaying) stopMusic();
    if (st && st.running) isGamePaused = true;
});
window.addEventListener('focus', () => {
    try { if (AC && AC.state === 'suspended') AC.resume(); } catch (e) {}
    if (st && st.running && !document.getElementById('pauseOv')) isGamePaused = false;
});

// ============================================================
// ===== SERVICE WORKER (offline + Play Store TWA ke liye) =====
// ============================================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => { /* sw optional hai */ });
    });
}

console.log('✅ Candy Mass v4.9 loaded');
console.log('   (if this does not say v4.7, an old cached version is loading — press Ctrl+Shift+R)');
console.log('🎯 Target curve:', [1, 2, 3, 5, 10, 20, 50, 100, 500, 1000, 2000, 3500, 5000, 7000, 9000, 9999, 10000]
    .map(l => 'L' + l + '=' + getLevelTarget(l)).join('  '));
console.log('💣 Worlds:', Object.keys(WORLD_SHEETS).map(k => k + ' bombs[' + Object.keys(WORLD_SHEETS[k].bombs).join(',') + ']').join(' | '));
