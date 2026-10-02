// ============================================================
// ===== CANDY MASS - 10,000 LEVEL ENGINE (v4.1 GITHUB) =======
// ------------------------------------------------------------
//  NAYA IS VERSION ME (v4.1):
//   * Sprite sheet ka naam kuch bhi ho - candy-sheet.png,
//     candysheet.png, .jpeg, .jpg - code khud har naam try
//     karta hai. Isliye repo me rename karne ki zarurat nahi.
//   * Sheet load na ho to console me saaf warning aati hai.
//   * Play Store / PWA ke liye service worker register hota hai.
//   * orientationchange par canvas resize (mobile fix).
//
//  PEHLE SE THEEK KIYE GAYE (v4.0):
//   1. TASK LEVEL (har 5th level) me SPECIAL CANDY ab SACH ME
//      generate hoti hai (pehle spawning poori band thi).
//   2. Level target progressive curve: L1 = 10 ... L10000 = 120.
//      9999 tak 120 NAHI hota (sirf level 10000 par 120).
//   3. Har level ke saath SPEED aur BOMB CHANCE badhta hai.
//   4. 3 themes ek-ek karke: 1-3500 Candy, 3501-7000 Fish,
//      7001-10000 Coffee. Theme badalte hi purani candy ruk jati hai.
//   5. Har theme ke apne bomb / shield / 10X IDs.
//   6. Purana duplicate code aur undefined arrays hata diye.
// ============================================================

// ============================================================
// ===== 1. WORLD / SPRITE SHEET CONFIGURATION ================
// ============================================================
const COLS = 8;          // har sheet me 8 columns
const ROWS = 5;          // default rows (fish sheet 4 use karti hai)
const MAX_TARGET = 120;  // level 10000 ka target

// Har world ke liye possible file naam. Loader in sab ko ek-ek karke try
// karta hai, jo pehla chale wahi use hota hai. Repo me file ka naam
// candy-sheet.png / candysheet.png / candy-sheet.jpeg jo bhi ho, chalega.
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
        empty: [],                       // fish sheet ke saare 32 tiles bhare hain
        bombs: {
            8: 'game-over',      // X-marked fish  -> instant Game Over
            13: 'life-reduce',   // seahorse       -> -1 Life
            31: 'target-reduce', // aquatic plant  -> target +15
            6: 'score-reduce'    // gold sparkles  -> -500 score
        },
        shieldId: 5,    // rainbow fish
        multiId: 7      // rainbow swirl (bomb ID 6 se alag)
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
            // canvas tainted (cross-origin sheet) -> poora cell hi use karo
            cells[idx] = { sx: sx, sy: sy, sw: sw, sh: sh };
            continue;
        }

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

        // cell ke 96% se bada crop nahi (border bleed rokne ke liye), center rakho
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

// Filename dhoondhne wala loader: candidate list me se jo pehla load ho jaye use
// le lo. Kuch bhi na mile to fallback drawing chalti rehti hai.
function loadSheet(key) {
    const candidates = WORLD_SHEETS[key].urls.slice();
    let i = 0;
    const tryNext = () => {
        if (i >= candidates.length) {
            worldReady[key] = false;
            console.warn('⚠️ Sheet nahi mili (' + key + '). Tried: ' + candidates.join(', ') +
                ' — game fallback shapes se chalega. Sheet files repo ke root me rakho.');
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

function resizeCanvas() {
    const container = document.getElementById('cw');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width > 4) gameW = rect.width;
    if (rect.height > 4) gameH = rect.height;
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

// Speed: L1 ~2.7 px/frame se L10000 ~8.6 px/frame
function getSpeedForLevel(lvl) {
    const t = Math.min(lvl, 10000) / 10000;
    return 2.7 + Math.pow(t, 0.85) * 5.9;
}

// Spawn interval (frames @60fps): L1 ~ 1.5s ... L10000 ~ 0.6s
function getSpawnIntervalForLevel(lvl) {
    const t = Math.min(lvl, 10000) / 10000;
    return Math.round(92 - 56 * Math.pow(t, 0.75));
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

// ===== TASK (har 5th level) =====
function taskTargetCount(lvl) {
    const t = Math.min(lvl, 10000) / 10000;
    return Math.min(15, 3 + Math.round(t * 12));
}

function isTaskLevel(lvl) { return lvl % 5 === 0 && lvl > 0; }

// Task ke liye special candy: aate-aate poori candy pool unlock hoti hai.
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
        return { kind: 'target', targetId: id, count: count, desc: 'Sirf SPECIAL candy catch karo' };
    }
    return { kind: 'special', count: count, desc: 'Sirf SHIELD / 10X power-up catch karo' };
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
    return {
        candyId: candyId,
        x: initialX,
        y: -40 * scaleY,
        w: size,
        h: size,
        r: size / 2,
        size: size,
        speed: (st.speed + (1.0 + Math.random() * 0.9)) * (1 + Math.min(st.level, 10000) * 0.0004),
        wobble: Math.random() * Math.PI * 2,
        waveAmplitude: (14 + Math.random() * 18) * scaleX,
        waveFrequency: 0.03 + Math.random() * 0.02,
        waveOffset: Math.random() * Math.PI * 4,
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
    if (st.inTask && st.taskDef) {
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
        // Aspect ratio bachao (lambi fish stretch na ho), par hitbox se bahut bada bhi na ho
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

    if (item.isDecoy) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.rotate(item.rot);
        drawItemSprite(item);
        ctx.restore();
        ctx.globalAlpha = 1;
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

const BASKET_SKINS = [
    { name: 'Default', emoji: '🪣', b1: '#F0A060', b2: '#C8752A', b3: '#7A3A08', bt: '#FFD090', bm: '#E08830' },
    { name: 'Copper', emoji: '🪙', b1: '#B87333', b2: '#D4956A', b3: '#8B5A2B', bt: '#E8B88A', bm: '#C08040' },
    { name: 'Retro', emoji: '📼', b1: '#6C8C9C', b2: '#8CACBC', b3: '#4C6C7C', bt: '#BCD8E8', bm: '#7C9CAC' },
    { name: 'Golden', emoji: '👑', b1: '#D4AF37', b2: '#F0D060', b3: '#B8960F', bt: '#FFE880', bm: '#E0B820' }
];
let currentSkinIndex = 0;

function loadSkin() {
    const saved = localStorage.getItem('cm_basket_skin');
    if (saved !== null) {
        currentSkinIndex = parseInt(saved, 10);
        if (isNaN(currentSkinIndex) || currentSkinIndex < 0 || currentSkinIndex >= BASKET_SKINS.length) currentSkinIndex = 0;
    }
    updateSkinButton();
}

function saveSkin() { localStorage.setItem('cm_basket_skin', currentSkinIndex); updateSkinButton(); }

function updateSkinButton() {
    const skinText = '🎨 ' + BASKET_SKINS[currentSkinIndex].emoji + ' ' + BASKET_SKINS[currentSkinIndex].name;
    const btn = document.getElementById('skinBtn');
    if (btn) btn.textContent = skinText;
    const btn2 = document.getElementById('homeSkinBtn2');
    if (btn2) btn2.textContent = skinText;
}

function cycleSkin() {
    currentSkinIndex = (currentSkinIndex + 1) % BASKET_SKINS.length;
    saveSkin();
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
let gameStarted = false;
let isOnHomePage = false;
let wasGamePausedBeforeSettings = false;

function getAuth() { return window.firebaseAuth || null; }

function enterGame(name, email) {
    currentUserEmail = email;
    currentUserName = name;
    showHomePage(name, email);
}

window.onUserLoggedIn = function (user) {
    if (gameStarted) return;
    gameStarted = true;
    const name = user.displayName;
    const email = user.email;
    const users = JSON.parse(localStorage.getItem('cr_users_v2') || '[]');
    if (!users.find(u => u.email === email)) users.push({ name: name, email: email, via: 'google', id: user.uid });
    localStorage.setItem('cr_users_v2', JSON.stringify(users));
    saveSession({ email: email, name: name, via: 'google' });
    document.getElementById('loginScreen').style.display = 'none';
    showHomePage(name, email);
};

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
    resizeCanvas();
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
        const idx = lb.findIndex(r => r.email === currentUserEmail);
        const entry = { name: currentUserName, email: currentUserEmail, score: st.score, level: st.level };
        if (idx >= 0) { if (st.score > lb[idx].score) lb[idx] = entry; }
        else lb.push(entry);
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
            html += '<div class="lb-row"><span class="lb-rank">' + (i < 3 ? medals[i] : i + 1) + '</span><span class="lb-name">' + r.name + (isMe ? ' ★' : '') + '</span><span class="lb-score">' + r.score.toLocaleString() + '</span><span class="lb-lv">L' + r.level + '</span></div>';
        });
        html += '</div>';
        content.innerHTML = html;
    } catch (e) { content.innerHTML = '<div>Error</div>'; }
}

function closeLB() { showHomePage(); }

// ===== CLOUD SAVE =====
async function saveProgressToCloud() {
    if (!currentUserEmail || currentUserEmail.indexOf('guest_') === 0) return;
    try {
        const db = window.firebaseDb, docFn = window.firebaseDoc, setDoc = window.firebaseSetDoc;
        if (!db || !docFn || !setDoc) return;
        const userRef = docFn(db, 'users', currentUserEmail);
        await setDoc(userRef, {
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
    try {
        const db = window.firebaseDb, docFn = window.firebaseDoc, getDocFn = window.firebaseGetDoc;
        if (!db || !docFn || !getDocFn) return null;
        const docSnap = await getDocFn(docFn(db, 'users', currentUserEmail));
        if (docSnap.exists()) {
            const data = docSnap.data();
            return { level: data.level || 1, score: data.score || 0, lives: data.lives || 3 };
        }
        return null;
    } catch (e) { return null; }
}

// ============================================================
// ===== 11. HUD / OVERLAYS ===================================
// ============================================================
function updateHUD() {
    document.getElementById('sc').textContent = st.score.toLocaleString();
    document.getElementById('lv').textContent = st.level.toLocaleString();
    let h = '';
    for (let i = 0; i < st.lives; i++) h += '❤️';
    document.getElementById('li').innerHTML = h || '🖤';
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
        ? ('🎯 TASK: special candy catch karo ' + st.taskCaught + '/' + st.taskDef.count + ' ')
        : ('🎯 TASK: 🛡️/✨ power-up catch karo ' + st.taskCaught + '/' + st.taskDef.count + ' ');
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
    const overlays = ['homeOv', 'levelOv', 'taskOv', 'celebOv', 'lbOv', 'roadmapOv', 'dailyOv', 'goOv', 'settingsOv', 'helpOv', 'pauseOv'];
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
        addRedParticles(gameW / 2, gameH * 0.8);
        endGame(true);
        return;
    }
    if (eff === 'life-reduce') {
        st.lives--;
        updateHUD();
        sfxWrong();
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

    const scale = getBasketScale(lvl);
    st.basket.x = gameW / 2;
    st.basket.w = 86 * scaleX * scale;
    st.basket.h = 26 * scaleY * scale;
    st.basket.y = gameH - 52 * scaleY;

    applyTheme();
    updateHUD();
    updateTaskHud();
    updatePowerupHud();
    updateWorldTag();
    updateBombLegend();
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
    const next = Math.min(10000, st.level + 1);
    initLevel(next, carriedScore, carriedLives);
    showOv(null);
    st.running = true;
    isGamePaused = false;
    lastFrameTime = 0;
    startMusic(0);
    requestAnimationFrame(gameLoop);
}

// ============================================================
// ===== 14. TASK (har 5 level par) ===========================
// ============================================================
function onLevelComplete() {
    st.running = false;
    saveProgress();
    saveProgressToCloud();
    saveLB();
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
        desc = '🎯 Sirf <b>' + name + '</b> catch karo, baaki candies ko JAANE do!';
        desc += '<br><span style="color:#FF6B6B;">Galat candy catch ki = -1 ❤️</span>';
        desc += '<br><span style="color:#00FFB0;">Target par green ring + ★ CATCH label dikhega.</span>';
    } else {
        desc = '🎯 Sirf <b>🛡️ SHIELD</b> ya <b>✨ 10X</b> power-up catch karo, baaki sab JAANE do!';
        desc += '<br><span style="color:#FF6B6B;">Galat item catch kiya = -1 ❤️</span>';
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
    if (sub) sub.innerHTML = 'Excellent! +1 ❤️ life mila!<br>Score: ' + st.score.toLocaleString();
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
    document.getElementById('lvScore').textContent = 'Score: ' + st.score.toLocaleString();
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
    document.getElementById('goScore').textContent = 'Score: ' + st.score.toLocaleString();
    document.getElementById('goSub').innerHTML = 'You reached level ' + st.level + '.<br>Saved progress — you can continue!';
    saveProgress();
    saveProgressToCloud();
    saveLB();
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
            st.score += 20;
            updateHUD();
            sfxCatch();
            addParticles(item.x, by, '#00FFB0', '#FFFFFF');
            addFloat('+20 🎯', '#00FFB0', true);
            onTaskProgress();
        } else {
            // GALAT candy -> life kam
            st.lives--;
            updateHUD();
            sfxWrong();
            triggerShake(6, 12);
            addRedParticles(item.x, by);
            addFloat('❌ Galat candy! -1 ❤️', '#FF4444', true);
            if (st.lives <= 0) endGame(false);
        }
        return;
    }

    // ---------- NORMAL CANDY ----------
    st.combo++;
    st.comboTimer = 90;
    const multi = Math.min(st.combo, 5);
    const pts = 10 * multi;
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
    // task level me galat candy chhod dena sahi baat hai -> koi penalty nahi
    if (st.inTask) return;
    sfxMiss();
    triggerShake(4, 10);
    st.combo = 0;
    st.comboTimer = 0;
    st.lives--;
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

function gameLoop(timestamp) {
    if (!st.running) { animFrameId = 0; return; }
    if (timestamp - lastFrameTime < FRAME_INTERVAL) { animFrameId = requestAnimationFrame(gameLoop); return; }
    lastFrameTime = timestamp;
    st.frame++;
    if (isGamePaused) { animFrameId = requestAnimationFrame(gameLoop); return; }

    ctx.save();
    if (shakeFrames > 0) {
        ctx.translate((Math.random() - 0.5) * shakeIntensity, (Math.random() - 0.5) * shakeIntensity);
        shakeFrames--;
        shakeIntensity *= 0.88;
    } else {
        shakeIntensity = 0;
    }
    ctx.clearRect(-20, -20, gameW + 40, gameH + 40);
    drawBg();

    if (st.shieldActive) {
        st.shieldFrames--;
        if (st.shieldFrames <= 0) { st.shieldActive = false; updatePowerupHud(); }
    }

    if (st.comboTimer > 0) {
        st.comboTimer--;
        if (st.comboTimer === 0) st.combo = 0;
    }

    st.spawnTimer++;
    if (st.spawnTimer >= st.spawnInterval) {
        st.spawnTimer = 0;
        spawnBurst();
    }

    autoSpinTimer++;
    if (autoSpinTimer > 90) { autoSpinTimer = 0; refreshSpinIfNeeded(); }

    const bx = st.basket.x, by = st.basket.y, bw = st.basket.w, bh = st.basket.h;
    const keep = [];

    for (let i = 0; i < st.items.length; i++) {
        const it = st.items[i];
        it.y += it.speed;
        it.wobble += 0.028;
        it.rot += it.rotationSpeed;
        it.x += Math.sin(it.wobble) * 0.5;
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
// ===== 17. PAUSE / ROADMAP / DAILY / SETTINGS ===============
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
        if (musicEnabled) startMusic(st.inTask ? -1 : 0);
    }
}

function showRoadmap() {
    showOv('roadmapOv');
    const saved = loadProgress();
    const curLevel = saved ? saved.level : 1;
    const pct = Math.round((curLevel / 10000) * 100);
    function world(key, from, to) {
        const meta = WORLD_META[key];
        const active = curLevel >= from && curLevel <= to;
        const emoji = meta.name.split(' ')[0];
        const label = meta.name.replace(/^\S+\s/, '');
        return '<div class="roadmap-world" style="border-left-color:' + meta.bar1 + ';' + (active ? '' : 'opacity:0.55;') + '">' +
            '<div class="roadmap-header"><span class="roadmap-emoji">' + emoji + '</span>' +
            '<div class="roadmap-name">' + label + (active ? ' ▶ Current' : '') + '</div>' +
            '<div class="roadmap-range">' + from.toLocaleString() + '-' + to.toLocaleString() + '</div></div>' +
            (active ? '<div class="roadmap-current">📍 You are here: Level ' + curLevel + '</div>' : '') +
            '</div>';
    }
    let html = world('candy', 1, 3500) + world('fish', 3501, 7000) + world('coffee', 7001, 10000);
    html += '<div style="height:6px;background:rgba(255,255,255,0.1);border-radius:3px;margin:8px 4px;">' +
        '<div style="width:' + pct + '%;height:100%;background:#FF4DA6;border-radius:3px;"></div></div>' +
        '<div style="font-size:12px;color:#FFD700;text-align:center;">' + curLevel.toLocaleString() + ' / 10,000 (' + pct + '%)</div>';
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
    const spinBtn = document.getElementById('spinBtnEl');
    const already = !canClaimToday();
    spinBtn.disabled = already;
    spinBtn.style.opacity = already ? '0.4' : '1';
    spinBtn.textContent = already ? 'Already Spun' : 'Spin Now';
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
    msg.textContent = streak === 0 ? 'Spin daily for rewards!' : '🔥 ' + streak + ' day streak!';
}

function drawWheel(angle) {
    const c = document.getElementById('wheelCanvas');
    if (!c) return;
    const wctx = c.getContext('2d');
    const cx = 110, cy = 110, r = 100;
    wctx.clearRect(0, 0, 220, 220);
    const segAngle = (Math.PI * 2) / WHEEL_SEGMENTS.length;
    for (let i = 0; i < WHEEL_SEGMENTS.length; i++) {
        const seg = WHEEL_SEGMENTS[i];
        const start = angle + i * segAngle;
        const end = start + segAngle;
        wctx.beginPath();
        wctx.moveTo(cx, cy);
        wctx.arc(cx, cy, r, start, end);
        wctx.closePath();
        wctx.fillStyle = seg.color;
        wctx.fill();
        wctx.save();
        wctx.translate(cx + Math.cos(start + segAngle / 2) * r * 0.65, cy + Math.sin(start + segAngle / 2) * r * 0.65);
        wctx.fillStyle = '#fff';
        wctx.font = 'bold 12px "Segoe UI"';
        wctx.shadowBlur = 2;
        wctx.shadowColor = 'black';
        wctx.fillText(seg.emoji, -8, -8);
        wctx.font = 'bold 10px "Segoe UI"';
        wctx.fillStyle = '#FFD700';
        wctx.fillText(seg.label, -12, 6);
        wctx.restore();
    }
    wctx.beginPath();
    wctx.arc(cx, cy, 18, 0, Math.PI * 2);
    wctx.fillStyle = '#FFD700';
    wctx.fill();
    wctx.shadowBlur = 0;
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
        else { wheelSpinning = false; claimReward(WHEEL_SEGMENTS[winIdx]); }
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

    let msg = '';
    switch (seg.reward.type) {
        case 'pts': st.score += seg.reward.val; updateHUD(); msg = '+' + seg.reward.val + ' Points!'; sfxCatch(); break;
        case 'lives': st.lives = Math.min(st.lives + seg.reward.val, 5); updateHUD(); msg = '+' + seg.reward.val + ' Life!'; sfxLife(); break;
        case 'shield': activateShield(); msg = 'Shield Activated!'; break;
        case 'jackpot': st.score += seg.reward.val; st.lives = Math.min(st.lives + 2, 5); updateHUD(); msg = 'JACKPOT! +' + seg.reward.val + ' pts & +2❤️!'; sfxSurprise(); spawnConfetti(); break;
    }
    saveProgress();
    saveLB();
    const resultDiv = document.getElementById('rewardResult');
    if (resultDiv) {
        resultDiv.textContent = seg.emoji + ' ' + msg;
        resultDiv.style.display = 'block';
        setTimeout(() => { resultDiv.style.display = 'none'; }, 3000);
    }
    showDailyReward();
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
window.getLevelTarget = getLevelTarget;
window.CandyMassDebug = {
    st: st,
    getLevelTarget: getLevelTarget,
    getBombChance: getBombChance,
    getSpeedForLevel: getSpeedForLevel,
    getSpawnIntervalForLevel: getSpawnIntervalForLevel,
    getWorldKey: getWorldKey,
    WORLD_SHEETS: WORLD_SHEETS,
    worldReady: worldReady,
    worldImages: worldImages,
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
        'homeSettingsBtn': showSettings, 'homeSkinBtn2': cycleSkin, 'homeHelpBtn': showHelp
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

    canvas.addEventListener('mousemove', e => { if (st.running) moveB(e.clientX); });
    canvas.addEventListener('touchmove', e => { e.preventDefault(); if (st.running && e.touches && e.touches.length) moveB(e.touches[0].clientX); }, { passive: false });
    canvas.addEventListener('touchstart', e => { e.preventDefault(); if (st.running && e.touches && e.touches.length) moveB(e.touches[0].clientX); }, { passive: false });
});

// ============================================================
// ===== 20. SERVICE WORKER (Play Store / offline ke liye) ====
// ============================================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => { /* sw optional hai */ });
    });
}

// ============================================================
// ===== 21. DEBUG TABLE (level curve check) ==================
// ============================================================
console.log('✅ Candy Mass v4.1 loaded — 10,000 level engine');
console.log('🎯 Target curve:', [1, 2, 3, 5, 10, 20, 50, 100, 500, 1000, 2000, 3500, 5000, 7000, 9000, 9999, 10000]
    .map(l => 'L' + l + '=' + getLevelTarget(l)).join('  '));
console.log('💣 Worlds:', Object.keys(WORLD_SHEETS).map(k => k + ' bombs[' + Object.keys(WORLD_SHEETS[k].bombs).join(',') + ']').join(' | '));
