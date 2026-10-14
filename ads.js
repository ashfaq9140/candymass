// ============================================================
// CANDY MASS — MONETIZATION (ads + remove-ads + rate + share)
// ============================================================
// Ye file ALAG rakhi gayi hai taaki game code (script.js) saaf rahe.
//
// HATANI HO TO:
//   index.html me se ye line delete kar do:
//       <script src="ads.js?v=4.9"></script>
//   (ya sirf ye file delete kar do)
//   → Game bilkul waise hi chalega, koi ads nahi honge. Kuch aur
//     badalne ki zarurat nahi.
//
// ADS CHALU KARNE KE LIYE:
//   1. Niche ADS_CLIENT me apna AdSense client ID daalo ('ca-pub-...')
//   2. index.html me commented AdSense <script> uncomment karo
//   3. Bas — reward ads asli chalne lagenge
//
// Game ke saath kaise baat hoti hai:
//   script.js do events bhejta hai:
//     'cm:levelcomplete'  -> { level, coins }
//     'cm:gameover'       -> { level, score }
//   Baaki sab (st, updateHUD, addCoins, toast, ...) script.js ke
//   global functions hain — ye file unhe seedha use karti hai.
// ============================================================

(function () {
    'use strict';

    // ------------------------------------------------------------
    // CONFIG
    // ------------------------------------------------------------
    const ADS_CLIENT = 'ca-pub-7547034880840405';   // AdSense Publisher ID
    const ADS_ENABLED = ADS_CLIENT.length > 10;
    const AD_COOLDOWN_MS = 20000;       // do reward ads ke beech kam se kam 20s
    const RATE_KEY = 'cm_rated_v1';
    const ADS_FREE_KEY = 'cm_ads_free';
    const STORE_URL = 'https://play.google.com/store/apps/details?id=com.massgms.candymass';

    // ---- INTERSTITIAL (level complete ke baad ka forced ad) ----
    // Yahi ad "Remove Ads ₹79" ko bikwata hai.
    // Google policy ka dhyan rakha gaya hai:
    //   • gameplay ke DAURAN nahi — sirf natural break (level complete) par
    //   • level 1-2 par NAHI (naye player ko pareshan nahi karte)
    //   • har 3rd level par
    //   • 2 minute ka gap (frequency cap)
    const INTERSTITIAL_EVERY = 3;
    const INTERSTITIAL_GAP_MS = 120000;
    const INTERSTITIAL_MIN_LEVEL = 3;
    let lastInterstitialAt = 0;

    let adsFree = false;
    let adsReady = false;
    let lastAdShownAt = 0;
    let adBusy = false;

    // ------------------------------------------------------------
    // small helpers (script.js ke globals unavailable ho to chup raho)
    // ------------------------------------------------------------
    function safe(fn, fallback) {
        try { return fn(); } catch (e) { return fallback; }
    }
    function say(msg, color, ms) {
        if (typeof toast === 'function') { try { toast(msg, color, ms); } catch (e) {} }
    }
    function G() { return (typeof st !== 'undefined') ? st : null; }

    // ------------------------------------------------------------
    // ads-free flag (local + cloud)
    // ------------------------------------------------------------
    function loadAdsFree() {
        adsFree = safe(function () { return localStorage.getItem(ADS_FREE_KEY) === '1'; }, false);
        if (!adsFree) {
            adsFree = safe(function () {
                const life = getLifetime();
                return !!(life && life.adsFree);
            }, false);
        }
        updateUI();
    }

    function setAdsFree(v, pushCloud) {
        adsFree = !!v;
        safe(function () { localStorage.setItem(ADS_FREE_KEY, adsFree ? '1' : '0'); });
        safe(function () {
            const life = getLifetime();
            life.adsFree = adsFree;
            setLifetime(life);
        });
        if (pushCloud !== false && adsFree) saveAdsFreeToCloud();
        updateUI();
    }

    async function saveAdsFreeToCloud() {
        const email = safe(function () { return currentUserEmail; }, '');
        if (!email || email.indexOf('guest_') === 0) return;
        const uid = safe(function () { return lbDocId(); }, '');
        if (!uid || !window.firebaseDb || !window.firebaseSetDoc) return;
        try {
            await window.firebaseSetDoc(window.firebaseDoc(window.firebaseDb, 'users', uid), {
                uid: uid, email: email, adsFree: true, updatedAt: new Date().toISOString()
            }, { merge: true });
        } catch (e) {}
    }

    function updateUI() {
        const row = document.getElementById('removeAdsRow');
        // Billing ready nahi hai to "Remove Ads" row hi chhupao
        if (row) row.style.display = (!BILLING_READY || adsFree) ? 'none' : '';
        ['goAdLifeBtn', 'lvAdCoinsBtn'].forEach(function (id) {
            const b = document.getElementById(id);
            if (b) b.style.display = (!adsFree && b.dataset.used !== '1') ? '' : 'none';
        });
    }

    // ------------------------------------------------------------
    // rewarded ad — ads ON ho to asli ad, warna turant reward
    // ------------------------------------------------------------
    function showRewardedAd(name, onReward, onFail) {
        if (adsFree) { if (onReward) onReward(); return; }
        if (adBusy) return;
        const now = Date.now();
        if (ADS_ENABLED && now - lastAdShownAt < AD_COOLDOWN_MS) {
            say('⏳ Thoda ruk jao, ad ready nahi', '#FFB8D0', 2000);
            return;
        }
        adBusy = true;
        lastAdShownAt = now;

        let granted = false;
        function grant() {
            if (granted) return;
            granted = true;
            adBusy = false;
            if (onReward) onReward();
        }

        if (ADS_ENABLED && typeof window.adBreak === 'function') {
            try {
                window.adBreak({
                    type: 'reward',
                    name: name || 'reward',
                    beforeReward: function (fn) { try { fn(); } catch (e) { grant(); } },
                    adViewed: function () { grant(); },
                    adDismissed: function () { adBusy = false; if (onFail) onFail(); },
                    adBreakDone: function () { setTimeout(grant, 400); }
                });
                setTimeout(grant, 12000);   // safety net
                return;
            } catch (e) { /* fallback niche */ }
        }
        say('🎁 Reward mil gaya!', '#00FFB0', 1800);
        setTimeout(grant, 500);
    }

    // ------------------------------------------------------------
    // AdSense load
    // ------------------------------------------------------------
    function initAds() {
        loadAdsFree();
        if (!ADS_ENABLED) {
            console.log('ℹ️ [ads] AdSense client ID nahi — ads band, reward turant milega');
            return;
        }

        // ------------------------------------------------------------
        // ⚠️ ZARURI ORDER: pehle adsbygoogle + adBreak set karo, PHIR script
        // inject karo. Pehle script inject hota tha aur uske baad adBreak set
        // hota tha — agar script banane me koi bhi error aata (setAttribute
        // fail, head missing, CSP block...) to adBreak set hi nahi hota tha
        // aur SAARE ads chup-chaap band ho jate, bina koi error dikhaye.
        // Ab adBreak hamesha set hota hai, chahe script inject fail ho jaye.
        // ------------------------------------------------------------
        try {
            window.adsbygoogle = window.adsbygoogle || [];
            if (typeof window.adBreak !== 'function') {
                window.adBreak = window.adConfig = function (o) { window.adsbygoogle.push(o); };
            }
        } catch (e) {
            console.warn('⚠️ [ads] adBreak set nahi ho paya:', e && e.message);
            return;
        }

        // Ab AdSense script inject karo (best-effort — fail ho to bhi ads ki
        // request queue me chali jayegi).
        try {
            const sc = document.createElement('script');
            sc.async = true;
            if (typeof sc.setAttribute === 'function') {
                sc.setAttribute('data-ad-frequency-hint', '30s');
            }
            sc.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + ADS_CLIENT;
            sc.crossOrigin = 'anonymous';
            if (document.head && typeof document.head.appendChild === 'function') {
                document.head.appendChild(sc);
            }
        } catch (e) {
            console.warn('⚠️ [ads] AdSense script inject fail:', e && e.message);
        }

        try {
            window.adConfig({ preloadAdBreaks: 'on', sound: 'on', onReady: function () { adsReady = true; } });
            console.log('✅ [ads] AdSense load ho raha hai:', ADS_CLIENT);
        } catch (e) {
            console.warn('⚠️ [ads] adConfig fail:', e && e.message);
        }
    }

    // ------------------------------------------------------------
    // INTERSTITIAL ad — level complete ke baad
    // ------------------------------------------------------------
    function showInterstitial(name) {
        if (adsFree) return;                 // ₹79 liya hai to koi forced ad nahi
        if (!ADS_ENABLED) return;            // Adsense ID nahi hai to chup raho
        if (typeof window.adBreak !== 'function') return;
        const now = Date.now();
        if (now - lastInterstitialAt < INTERSTITIAL_GAP_MS) return;
        lastInterstitialAt = now;
        try {
            window.adBreak({
                type: 'next',
                name: name || 'level-end',
                beforeAd: function () { /* level-complete overlay already khula hai */ },
                afterAd: function () { },
                adBreakDone: function () { }
            });
            console.log('📺 [ads] interstitial dikhaya:', name);
        } catch (e) {
            console.warn('⚠️ [ads] interstitial fail:', e && e.message);
        }
    }

    function maybeShowInterstitial(level) {
        if (!level || level < INTERSTITIAL_MIN_LEVEL) return;
        if (level % INTERSTITIAL_EVERY !== 0) return;
        // overlay pehle render ho jaye, phir ad
        setTimeout(function () { showInterstitial('level-' + level); }, 600);
    }

    // ------------------------------------------------------------
    // REWARD 1: extra life (game over par)
    // ------------------------------------------------------------
    function giveExtraLife() {
        const g = G();
        if (!g) return;
        showRewardedAd('extra-life', function () {
            const btn = document.getElementById('goAdLifeBtn');
            if (btn) btn.dataset.used = '1';
            g.lives = Math.min(5, Math.max(g.lives, 1) + 1);
            g.running = true;
            safe(function () { updateHUD(); });
            safe(function () { showOv(null); });
            safe(function () { lastFrameTime = 0; });
            safe(function () { requestAnimationFrame(gameLoop); });
            safe(function () { sfxUnlock(); });
            safe(function () { addFloat('🎁 +1 ❤️', '#00FFB0', true); });
            say('🎁 Extra life mil gayi!', '#00FFB0', 2000);
        }, function () { say('Ad skip ho gaya', '#FFB8D0', 1800); });
    }

    // ------------------------------------------------------------
    // REWARD 2: double coins (level complete par)
    // ------------------------------------------------------------
    function giveDoubleCoins() {
        const g = G();
        if (!g) return;
        showRewardedAd('double-coins', function () {
            const btn = document.getElementById('lvAdCoinsBtn');
            if (btn) btn.dataset.used = '1';
            const extra = Math.round(g.lastCoinReward || 0);
            if (extra > 0) {
                safe(function () { addCoins(extra); });
                safe(function () { addFloat('🎁 +' + extra + ' 🪙', '#FFD700', true); });
                say('🎁 Coins double! +' + extra + ' 🪙', '#FFD700', 2400);
            } else {
                say('🎁 Reward mil gaya!', '#00FFB0', 2000);
            }
            updateUI();
        }, function () { say('Ad skip ho gaya', '#FFB8D0', 1800); });
    }

    // ------------------------------------------------------------
    // ₹79 "Remove Ads" — Google Play Billing
    // ------------------------------------------------------------
    // TWA me Play Billing Digital Goods API + Payment Request API se chalti hai.
    // Ref: developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing
    //
    // SETUP (Play Console ban jaane ke baad):
    //   1. Play Console -> Monetize -> In-app products
    //        Product ID : remove_ads
    //        Type       : One-time (non-consumable / durable)
    //        Price      : ₹79
    //        Status     : Active
    //   2. AAB dobara banao (PWABuilder me "Play Billing" ON karke)
    //   3. Neeche BILLING_READY = true karo
    //   4. Licensed test account se test karo
    //
    // ⚠️ BILLING_READY = false hone par "Remove Ads" button DIKHEGA HI NAHI.
    //    (Pehle ek bug tha: button dabane par bina paisa liye ads hat jate the.)
    // ------------------------------------------------------------
    const BILLING_READY = false;
    const BILLING_SKU = 'remove_ads';
    const BILLING_SERVICE = 'https://play.google.com/billing';

    // Digital Goods API available hai? (TWA + Chrome 101+ me hoti hai)
    function billingSupported() {
        return ('getDigitalGoodsService' in window) &&
            (typeof window.PaymentRequest === 'function');
    }

    // App khulte hi: pehle se kharida hua hai? (naye device / reinstall ke liye)
    async function restorePurchase() {
        if (!BILLING_READY || !billingSupported()) return;
        try {
            const svc = await window.getDigitalGoodsService(BILLING_SERVICE);
            const purchases = await svc.listPurchases();
            if (purchases && purchases.some(function (p) { return p.itemId === BILLING_SKU; })) {
                setAdsFree(true, true);
                console.log('✅ [billing] pehle se kharida hua mila — ads hata diye');
            }
        } catch (e) {
            console.log('ℹ️ [billing] restore skip:', e && e.message);
        }
    }

    async function buyRemoveAds() {
        if (adsFree) { say('✅ Ads already removed', '#00FFB0'); return; }

        // Bina payment ke KABHI ads-free na karo
        if (!BILLING_READY) {
            say('🚧 Coming soon!', '#FFD700', 2400);
            return;
        }

        if (!billingSupported()) {
            say('Play Store se app update karo', '#FFB8D0', 3000);
            return;
        }

        try {
            const svc = await window.getDigitalGoodsService(BILLING_SERVICE);

            // 1) Product details (price Play Console se aata hai)
            const details = await svc.getDetails([BILLING_SKU]);
            if (!details || !details.length || !details[0].price) {
                say('❌ Product available nahi hai', '#FF8080', 3000);
                return;
            }
            const price = details[0].price;

            // 2) Payment flow — Play Store ka apna checkout khulega
            const req = new window.PaymentRequest(
                [{ supportedMethods: BILLING_SERVICE, data: { sku: BILLING_SKU } }],
                { total: { label: 'Remove Ads', amount: { currency: price.currency, value: price.value } } }
            );
            const resp = await req.show();
            await resp.complete('success');

            // 3) "remove_ads" durable product hai — isliye consume() NAHI karte.
            //    resp.complete('success') acknowledgment bhi kar deta hai.
            //    Purchase listPurchases() me hamesha rahegi (restore ke liye).

            setAdsFree(true, true);
            safe(function () { sfxUnlock(); });
            say('🚫 Ads removed! Thank you ❤️', '#00FFB0', 3200);
            console.log('✅ [billing] purchase success:', BILLING_SKU);

        } catch (e) {
            const name = (e && e.name) || '';
            if (name === 'AbortError') {
                say('Purchase cancel kar diya', '#FFB8D0', 2200);   // user ne band kiya
                return;
            }
            console.warn('❌ [billing] purchase fail:', e && e.message);
            say('❌ Purchase fail — dobara try karo', '#FF8080', 3000);
        }
    }

    // ------------------------------------------------------------
    // rate us + share
    // ------------------------------------------------------------
    function openRateUs() {
        safe(function () { localStorage.setItem(RATE_KEY, '1'); });
        safe(function () { window.open(STORE_URL, '_blank'); });
        say('⭐ Thank you!', '#FFD700', 2000);
    }

    function maybeAskRate(lvl) {
        if (safe(function () { return localStorage.getItem(RATE_KEY) === '1'; }, true)) return;
        if (lvl !== 10 && lvl !== 25 && lvl !== 50) return;
        setTimeout(function () {
            let yes = false;
            try { yes = confirm('Enjoying Candy Mass? ⭐\n\nWould you rate us on the Play Store?'); } catch (e) {}
            if (yes) openRateUs();
            else safe(function () { localStorage.setItem(RATE_KEY, '1'); });
        }, 900);
    }

    function shareGame() {
        const text = 'Candy Mass — catch the falling candy wave! 🍬 Can you beat my score?';
        const wa = 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + STORE_URL);
        try {
            if (navigator.share) {
                navigator.share({ title: 'Candy Mass', text: text, url: STORE_URL }).catch(function () {});
            } else {
                window.open(wa, '_blank');
            }
        } catch (e) { safe(function () { window.open(wa, '_blank'); }); }
    }

    // ------------------------------------------------------------
    // GAME EVENTS (script.js se aate hain)
    // ------------------------------------------------------------
    document.addEventListener('cm:gameover', function () {
        const b = document.getElementById('goAdLifeBtn');
        if (b) b.dataset.used = '';
        updateUI();
    });

    document.addEventListener('cm:levelcomplete', function (ev) {
        const b = document.getElementById('lvAdCoinsBtn');
        if (b) b.dataset.used = '';
        updateUI();
        const lvl = (ev && ev.detail && ev.detail.level) || 0;
        maybeAskRate(lvl);
        maybeShowInterstitial(lvl);     // har 3rd level par forced ad
    });

    // Cloud se ₹79 purchase mila (naya device) — ads turant band karo
    document.addEventListener('cm:adsfree', function () {
        adsFree = true;
        updateUI();
    });

    // ------------------------------------------------------------
    // BUTTONS
    // ------------------------------------------------------------
    function wireButtons() {
        const life = document.getElementById('goAdLifeBtn');
        if (life) life.addEventListener('click', giveExtraLife);

        const coins = document.getElementById('lvAdCoinsBtn');
        if (coins) coins.addEventListener('click', giveDoubleCoins);

        const rm = document.getElementById('removeAdsBtn');
        if (rm) rm.addEventListener('click', buyRemoveAds);

        const rate = document.getElementById('rateUsBtn');
        if (rate) rate.addEventListener('click', openRateUs);

        const share = document.getElementById('shareBtn');
        if (share) share.addEventListener('click', shareGame);

        // overlay band hone par apna button bhi chhupa do
        ['goContinueBtn', 'goRestartBtn', 'nextLevelBtn'].forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', function () { setTimeout(updateUI, 60); });
        });

        updateUI();
    }

    // ------------------------------------------------------------
    // BOOT
    // ------------------------------------------------------------
    function boot() {
        wireButtons();
        initAds();
        // Play Billing ready ho to dekho ki pehle se kharida hua hai kya
        restorePurchase();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    // debug / manual use ke liye
    window.CandyMassAds = {
        isAdsFree: function () { return adsFree; },
        setAdsFree: setAdsFree,
        enabled: function () { return ADS_ENABLED; },
        showRewardedAd: showRewardedAd,
        showInterstitial: showInterstitial,
        maybeShowInterstitial: maybeShowInterstitial,
        buyRemoveAds: buyRemoveAds,
        openRateUs: openRateUs,
        shareGame: shareGame,
        init: initAds,
        // ---- billing (debug) ----
        billingReady: function () { return BILLING_READY; },
        billingSupported: billingSupported,
        restorePurchase: restorePurchase,
        sku: BILLING_SKU
    };
})();
