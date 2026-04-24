/**
 * game.js — Farmmember core logic
 *
 * Features:
 *  - LINE LIFF integration (User ID, display name)
 *  - Phone-number binding flow (first launch)
 *  - 15-cell farm grid (3 × 5)
 *  - 5 crop types, 14-day day-based growth
 *  - Daily watering + real-weather integration (CWA 埔里 station via GAS)
 *  - Weather-driven growth multipliers
 *  - Drought-death system (3 or 5 consecutive no-water days)
 *  - Crop-exchange-points (harvest → crop-specific pts, 15 pts → redeem)
 *  - Personal QR Code display (LINE userId)
 *  - Loyalty-points as farm currency (5 yuan = 1 pt via iPhone shortcut)
 *  - localStorage persistence + GAS backend sync
 */

// ─────────────────────────────────────────────
//  CONFIGURATION  (fill in before deploying)
// ─────────────────────────────────────────────
const CONFIG = {
  LIFF_ID:  'YOUR_LIFF_ID',          // LINE LIFF ID
  GAS_URL:  'YOUR_GAS_WEBAPP_URL',   // Deployed GAS web-app URL
};

// ─────────────────────────────────────────────
//  SEED CATALOGUE
// ─────────────────────────────────────────────
const SEEDS = [
  {
    id: 'cabbage',
    name: '高麗菜',
    emoji: '🥬',
    cost: 5,
    growDays: 14,
    rewardKey: 'cabbage_points',
    unlockLevel: 1,
    stages: ['🌱', '🌿', '🥬'],
  },
  {
    id: 'carrot',
    name: '胡蘿蔔',
    emoji: '🥕',
    cost: 8,
    growDays: 14,
    rewardKey: 'carrot_points',
    unlockLevel: 2,
    stages: ['🌱', '🌿', '🥕'],
  },
  {
    id: 'corn',
    name: '玉米',
    emoji: '🌽',
    cost: 10,
    growDays: 14,
    rewardKey: 'corn_points',
    unlockLevel: 3,
    stages: ['🌱', '🌿', '🌽'],
  },
  {
    id: 'watermelon',
    name: '西瓜',
    emoji: '🍉',
    cost: 12,
    growDays: 14,
    rewardKey: 'watermelon_points',
    unlockLevel: 5,
    stages: ['🌱', '🌿', '🍉'],
  },
  {
    id: 'strawberry',
    name: '草莓',
    emoji: '🍓',
    cost: 16,
    growDays: 14,
    rewardKey: 'strawberry_points',
    unlockLevel: 7,
    stages: ['🌱', '🌿', '🍓'],
  },
];

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
const GRID_COLS       = 3;
const GRID_ROWS       = 5;
const TOTAL_CELLS     = GRID_COLS * GRID_ROWS; // 15
const REDEEM_THRESHOLD = 15; // crop exchange points needed to redeem at store

// ─────────────────────────────────────────────
//  XP THRESHOLDS
// ─────────────────────────────────────────────
function xpForLevel(lvl) {
  return lvl * 100;
}

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────

/** Member / loyalty data */
let member = {
  lineUserId:        null,
  lineName:          '',
  phone:             null,
  points:            50,   // loyalty points (earned via purchases, used to buy seeds)
  level:             1,
  xp:                0,
  cabbage_points:    0,
  carrot_points:     0,
  corn_points:       0,
  watermelon_points: 0,
  strawberry_points: 0,
};

/** Farm state */
let farm = {
  plots: Array.from({ length: TOTAL_CELLS }, () => ({
    status:         'empty', // empty | growing | ready | dead
    seedId:         null,
    plantedDate:    null,    // YYYY-MM-DD
    growthProgress: 0,       // 0.0 – 1.0
  })),
  lastWatered:         null,  // YYYY-MM-DD
  consecutiveNoWater:  0,
  lastProcessedDate:   null,  // YYYY-MM-DD (last day we ran daily logic)
  wateredToday:        false,
};

/** Today's weather (fetched once per day from GAS/CWA) */
let weather = {
  date:        null,
  temperature: null,  // °C
  rainfall:    null,  // mm
  loaded:      false,
  description: '',
};

let selectedSeed = SEEDS[0].id;

// ─────────────────────────────────────────────
//  DATE UTILITIES
// ─────────────────────────────────────────────
function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function dateAddDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// ─────────────────────────────────────────────
//  LOCAL STORAGE  (persistence across sessions)
// ─────────────────────────────────────────────
function saveState() {
  try {
    localStorage.setItem('fm_member', JSON.stringify(member));
    localStorage.setItem('fm_farm',   JSON.stringify(farm));
    localStorage.setItem('fm_weather', JSON.stringify(weather));
    localStorage.setItem('fm_seed',   selectedSeed);
  } catch (e) { /* storage quota exceeded – silently ignore */ }
}

function loadState() {
  try {
    const m = localStorage.getItem('fm_member');
    const f = localStorage.getItem('fm_farm');
    const w = localStorage.getItem('fm_weather');
    const s = localStorage.getItem('fm_seed');

    if (m) Object.assign(member, JSON.parse(m));

    if (f) {
      const fp = JSON.parse(f);
      farm.lastWatered        = fp.lastWatered        || null;
      farm.consecutiveNoWater = fp.consecutiveNoWater || 0;
      farm.lastProcessedDate  = fp.lastProcessedDate  || null;
      farm.wateredToday       = fp.wateredToday       || false;
      if (Array.isArray(fp.plots)) farm.plots = fp.plots;
    }

    if (w) {
      const wp = JSON.parse(w);
      // Only reuse cached weather if it is from today
      if (wp.date === getTodayStr()) Object.assign(weather, wp);
    }

    if (s) selectedSeed = s;
  } catch (e) { /* corrupt data – use defaults */ }
}

// ─────────────────────────────────────────────
//  DOM REFERENCES
// ─────────────────────────────────────────────
const pointsEl      = document.getElementById('points-display');
const levelEl       = document.getElementById('level');
const xpBarEl       = document.getElementById('xp-bar');
const weatherEl     = document.getElementById('weather-display');
const gridEl        = document.getElementById('farm-grid');
const seedRowEl     = document.getElementById('seed-row');
const cropPtsEl     = document.getElementById('crop-points-panel');

const harvestBtn    = document.getElementById('harvest-all-btn');
const shopBtn       = document.getElementById('shop-btn');
const waterBtn      = document.getElementById('water-btn');
const qrBtn         = document.getElementById('qr-btn');

const modalOverlay  = document.getElementById('modal-overlay');
const shopList      = document.getElementById('shop-list');
const modalClose    = document.getElementById('modal-close');

const levelupEl     = document.getElementById('levelup-popup');
const levelupBanner = document.getElementById('levelup-banner');
const toastEl       = document.getElementById('toast');

// Phone modal
const phoneModal     = document.getElementById('phone-modal');
const phoneInput     = document.getElementById('phone-input');
const phoneSubmitBtn = document.getElementById('phone-submit-btn');

// QR modal
const qrOverlay      = document.getElementById('qr-modal-overlay');
const qrClose        = document.getElementById('qr-modal-close');
const qrContainer    = document.getElementById('qr-code-container');
const qrUserInfo     = document.getElementById('qr-user-info');

// ─────────────────────────────────────────────
//  HUD  (top bar, weather, crop points)
// ─────────────────────────────────────────────
function updateHUD() {
  if (pointsEl)  pointsEl.textContent  = member.points;
  if (levelEl)   levelEl.textContent   = `Lv.${member.level}`;

  const needed = xpForLevel(member.level);
  const pct    = Math.min(100, Math.round((member.xp / needed) * 100));
  if (xpBarEl)   xpBarEl.style.width   = pct + '%';

  // Weather badge
  if (weatherEl) {
    if (weather.loaded && weather.temperature !== null) {
      weatherEl.textContent = `${getRainEmoji(weather.rainfall)} ${weather.temperature}°C`;
      weatherEl.title = weather.description || '';
    } else {
      weatherEl.textContent = '🌤 --°C';
    }
  }

  // Watering button state
  if (waterBtn) {
    const heavyRainToday = weather.loaded && (weather.rainfall || 0) >= 25;
    if (farm.wateredToday || heavyRainToday) {
      waterBtn.disabled = true;
      waterBtn.textContent = heavyRainToday ? '🌧 雨天' : '💧 已澆水';
    } else {
      waterBtn.disabled = false;
      waterBtn.textContent = '💧 澆水';
    }
  }

  renderCropPoints();
}

function getRainEmoji(mm) {
  if (!mm && mm !== 0) return '🌤';
  if (mm > 100) return '🌊';
  if (mm >= 80)  return '⛈';
  if (mm >= 50)  return '🌧';
  if (mm >= 25)  return '🌦';
  if (mm >= 10)  return '🌦';
  if (mm > 0)    return '🌂';
  return '☀️';
}

function renderCropPoints() {
  if (!cropPtsEl) return;
  cropPtsEl.innerHTML = `
    <span title="高麗菜兌換點（集滿${REDEEM_THRESHOLD}到店兌換）">🥬 ${member.cabbage_points}</span>
    <span title="胡蘿蔔兌換點">🥕 ${member.carrot_points}</span>
    <span title="玉米兌換點">🌽 ${member.corn_points}</span>
    <span title="西瓜兌換點">🍉 ${member.watermelon_points}</span>
    <span title="草莓兌換點">🍓 ${member.strawberry_points}</span>
  `;
}

// ─────────────────────────────────────────────
//  SEED ROW
// ─────────────────────────────────────────────
function renderSeedRow() {
  seedRowEl.innerHTML = '';
  SEEDS.forEach(seed => {
    const btn = document.createElement('button');
    btn.className = 'seed-btn';
    btn.dataset.id = seed.id;

    const unlocked = member.level >= seed.unlockLevel;
    if (!unlocked) btn.classList.add('locked');
    if (seed.id === selectedSeed) btn.classList.add('selected');

    btn.innerHTML = `
      <span class="seed-emoji">${seed.emoji}</span>
      <span class="seed-name">${seed.name}</span>
      <span class="seed-cost">🎫${seed.cost}</span>
      ${!unlocked ? `<span class="lock-icon">🔒</span>` : ''}
    `;

    btn.addEventListener('click', () => {
      if (!unlocked) {
        showToast(`需要 Lv.${seed.unlockLevel} 才能解鎖！`);
        return;
      }
      selectedSeed = seed.id;
      renderSeedRow();
      saveState();
    });

    seedRowEl.appendChild(btn);
  });
}

// ─────────────────────────────────────────────
//  FARM GRID
// ─────────────────────────────────────────────
function renderGrid() {
  gridEl.innerHTML = '';
  farm.plots.forEach((_, i) => {
    const div = document.createElement('div');
    div.className = 'cell empty';
    div.dataset.index = i;
    div.innerHTML = `
      <span class="plant-icon"></span>
      <div class="progress-ring"><div class="progress-fill" style="width:0%"></div></div>
    `;
    div.addEventListener('click', () => handleCellClick(i));
    gridEl.appendChild(div);
  });
  farm.plots.forEach((_, i) => refreshCell(i));
}

function refreshCell(index) {
  const plot = farm.plots[index];
  const el   = gridEl.children[index];
  if (!el) return;

  const icon = el.querySelector('.plant-icon');
  const fill = el.querySelector('.progress-fill');

  el.className = `cell ${plot.status}`;

  if (plot.status === 'empty') {
    icon.textContent  = '';
    fill.style.width  = '0%';
    return;
  }

  if (plot.status === 'dead') {
    icon.textContent  = '🥀';
    fill.style.width  = '0%';
    return;
  }

  const seed = SEEDS.find(s => s.id === plot.seedId);
  if (!seed) return;

  const pct = Math.round(plot.growthProgress * 100);
  fill.style.width = pct + '%';

  if (plot.status === 'ready') {
    icon.textContent = seed.stages[2];
  } else {
    icon.textContent = pct < 50 ? seed.stages[0] : seed.stages[1];
  }
}

// ─────────────────────────────────────────────
//  CELL CLICK HANDLER
// ─────────────────────────────────────────────
function handleCellClick(index) {
  const plot = farm.plots[index];
  if (plot.status === 'empty') {
    plantSeed(index);
  } else if (plot.status === 'ready') {
    harvest(index);
  } else if (plot.status === 'dead') {
    clearDeadCrop(index);
  }
  // 'growing' cells: do nothing (show toast if needed)
  else if (plot.status === 'growing') {
    const pct = Math.round(plot.growthProgress * 100);
    showToast(`正在生長中… ${pct}%`);
  }
}

// ─────────────────────────────────────────────
//  PLANTING
// ─────────────────────────────────────────────
function plantSeed(index) {
  const seed = SEEDS.find(s => s.id === selectedSeed);
  if (!seed) return;

  if (member.level < seed.unlockLevel) {
    showToast(`需要 Lv.${seed.unlockLevel} 才能種植！`);
    return;
  }
  if (member.points < seed.cost) {
    showToast('點數不足！請到店消費獲得點數。');
    return;
  }

  member.points -= seed.cost;

  farm.plots[index] = {
    status:         'growing',
    seedId:         seed.id,
    plantedDate:    getTodayStr(),
    growthProgress: 0,
  };

  updateHUD();
  refreshCell(index);
  saveState();
  syncToBackend();
}

// ─────────────────────────────────────────────
//  HARVEST
// ─────────────────────────────────────────────
function harvest(index) {
  const plot = farm.plots[index];
  const seed = SEEDS.find(s => s.id === plot.seedId);
  if (!seed) return;

  const el = gridEl.children[index];
  spawnSparkle(el, seed.emoji);
  spawnFloatLabel(el, `+1 ${seed.emoji}`);

  // Award one crop-exchange point
  member[seed.rewardKey] = (member[seed.rewardKey] || 0) + 1;
  addXP(20);

  farm.plots[index] = { status: 'empty', seedId: null, plantedDate: null, growthProgress: 0 };

  updateHUD();
  refreshCell(index);
  saveState();
  syncToBackend();

  const pts = member[seed.rewardKey];
  if (pts >= REDEEM_THRESHOLD) {
    showToast(`${seed.emoji} 已集滿 ${pts} 點！可到實體店兌換農產品！🎉`);
  }
}

function harvestAll() {
  let any = false;
  farm.plots.forEach((plot, i) => {
    if (plot.status === 'ready') { harvest(i); any = true; }
  });
  if (!any) showToast('還沒有作物成熟！');
}

// ─────────────────────────────────────────────
//  CLEAR DEAD CROP  (player clicks 🥀 to remove)
// ─────────────────────────────────────────────
function clearDeadCrop(index) {
  farm.plots[index] = { status: 'empty', seedId: null, plantedDate: null, growthProgress: 0 };
  refreshCell(index);
  saveState();
  showToast('已清除枯萎作物');
}

// ─────────────────────────────────────────────
//  XP & LEVEL
// ─────────────────────────────────────────────
function addXP(amount) {
  member.xp += amount;
  const needed = xpForLevel(member.level);
  if (member.xp >= needed) {
    member.xp -= needed;
    member.level++;
    triggerLevelUp();
    renderSeedRow(); // unlock new seeds if applicable
  }
  updateHUD();
}

// ─────────────────────────────────────────────
//  WATERING
// ─────────────────────────────────────────────
function waterFarm() {
  if (farm.wateredToday) {
    showToast('今天已經澆過水了！');
    return;
  }
  if (weather.loaded && (weather.rainfall || 0) >= 25) {
    showToast('今天下大雨，不需要澆水！🌧');
    return;
  }

  const today = getTodayStr();
  farm.lastWatered        = today;
  farm.wateredToday       = true;
  farm.consecutiveNoWater = 0;

  showToast('🌱 澆水完成！作物加速成長 ×1.5');
  updateHUD();
  saveState();
  syncWateringToBackend();
}

// ─────────────────────────────────────────────
//  DAILY GROWTH ENGINE
// ─────────────────────────────────────────────

/**
 * Calculate and apply one day's worth of growth.
 * @param {number} rain   – daily rainfall in mm
 * @param {number} temp   – temperature in °C
 * @param {boolean} watered – did the player water today?
 */
function processOneDayGrowth(rain, temp, watered) {
  const BASE = 1 / 14; // full growth in 14 days at 1× rate

  let multiplier   = 1.0;
  let allDie       = false;
  let survivalRate = 1.0;

  if (rain > 100) {
    // Extreme rain (>100 mm): all crops die, cannot be saved
    allDie = true;
  } else if (rain >= 80) {
    // 80–100 mm: 20% survival
    survivalRate = 0.20;
    multiplier   = 0.5;
  } else if (rain >= 50) {
    // 50–80 mm: 80% survival
    survivalRate = 0.80;
    multiplier   = 0.5;
  } else if (rain >= 25) {
    // 25–50 mm: big rain, ×1.6, no watering needed
    multiplier = 1.6;
  } else if (rain > 0) {
    // Small/medium rain: player can supplement-water for ×1.5, otherwise ×1.0
    multiplier = watered ? 1.5 : 1.0;
  } else {
    // No rain
    // Spec: ×0.7/週 means 70% of normal daily rate without water
    multiplier = watered ? 1.5 : 0.7;
  }

  // Update consecutive-no-water counter FIRST so death check reflects today's state
  if (watered || rain >= 25) {
    farm.consecutiveNoWater = 0;
    if (watered) farm.lastWatered = getTodayStr();
  } else {
    farm.consecutiveNoWater++;
  }

  // Drought-death threshold (check AFTER incrementing the counter)
  const droughtDays  = temp > 30 ? 3 : 5;
  const droughtDeath = !watered && rain < 25 && farm.consecutiveNoWater >= droughtDays;

  // Apply growth / death to every growing plot
  farm.plots.forEach(plot => {
    if (plot.status !== 'growing') return;

    if (allDie || droughtDeath) {
      plot.status = 'dead';
      return;
    }

    if (survivalRate < 1.0 && Math.random() > survivalRate) {
      plot.status = 'dead';
      return;
    }

    plot.growthProgress = Math.min(1.0, plot.growthProgress + BASE * multiplier);
    if (plot.growthProgress >= 1.0) {
      plot.status = 'ready';
    }
  });
}

/**
 * Called on every app open.
 * Processes all days from lastProcessedDate up to today.
 * Today's weather is fetched from backend; past days use defaults.
 */
async function runDailyProcessing() {
  const today = getTodayStr();
  if (farm.lastProcessedDate === today) return; // already processed today

  // Reset watered-today flag when the calendar day changes
  farm.wateredToday = false;

  // Process each day that was missed while the app was closed
  let cursor = farm.lastProcessedDate || today;
  while (cursor < today) {
    cursor = dateAddDays(cursor, 1);
    if (cursor >= today) break; // today is handled separately below
    const wasWatered = (farm.lastWatered === cursor);
    // No real weather data for past days – use safe defaults (no rain, 25 °C)
    processOneDayGrowth(0, 25, wasWatered);
  }

  // Fetch today's weather before processing today
  await fetchWeather();

  const rain    = weather.loaded ? (weather.rainfall    || 0)  : 0;
  const temp    = weather.loaded ? (weather.temperature || 25) : 25;
  const watered = farm.wateredToday;

  processOneDayGrowth(rain, temp, watered);

  // Notify player about heavy rain (no watering needed)
  if (rain >= 25 && rain < 50) {
    showToast('今天下大雨 🌧 不需要澆水，作物加速成長！');
  }

  farm.lastProcessedDate = today;
  saveState();
  renderGrid();
  updateHUD();
}

// ─────────────────────────────────────────────
//  WEATHER  (fetched once per day from GAS backend)
// ─────────────────────────────────────────────
async function fetchWeather() {
  const today = getTodayStr();
  if (weather.loaded && weather.date === today) return; // already have today's data

  // Development fallback when GAS is not yet configured
  if (!CONFIG.GAS_URL || CONFIG.GAS_URL === 'YOUR_GAS_WEBAPP_URL') {
    weather = { date: today, temperature: 24, rainfall: 0, loaded: true, description: '晴天（開發模式）' };
    saveState();
    return;
  }

  try {
    const res  = await fetch(`${CONFIG.GAS_URL}?action=get_weather`);
    const data = await res.json();
    if (data.success) {
      weather = {
        date:        today,
        temperature: data.temperature,
        rainfall:    data.rainfall,
        loaded:      true,
        description: data.description || '',
      };
      saveState();
    }
  } catch (e) {
    console.warn('Weather fetch failed:', e);
  }
}

// ─────────────────────────────────────────────
//  BACKEND SYNC  (GAS web-app)
// ─────────────────────────────────────────────

/** Sync full farm + member state to the spreadsheet */
async function syncToBackend() {
  if (!CONFIG.GAS_URL || CONFIG.GAS_URL === 'YOUR_GAS_WEBAPP_URL') return;
  if (!member.lineUserId) return;
  try {
    await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify({
        action:                    'sync_farm',
        line_user_id:              member.lineUserId,
        farm_plots:                JSON.stringify(farm.plots),
        farm_last_watered:         farm.lastWatered,
        farm_consecutive_no_water: farm.consecutiveNoWater,
        cabbage_points:            member.cabbage_points,
        carrot_points:             member.carrot_points,
        corn_points:               member.corn_points,
        watermelon_points:         member.watermelon_points,
        strawberry_points:         member.strawberry_points,
        points:                    member.points,
        level:                     member.level,
        xp:                        member.xp,
      }),
    });
  } catch (e) { /* silently ignore network errors */ }
}

/** Record today's watering in the spreadsheet */
async function syncWateringToBackend() {
  if (!CONFIG.GAS_URL || CONFIG.GAS_URL === 'YOUR_GAS_WEBAPP_URL') return;
  if (!member.lineUserId) return;
  try {
    await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify({
        action:       'water',
        line_user_id: member.lineUserId,
        date:         getTodayStr(),
      }),
    });
  } catch (e) { /* silently ignore */ }
}

/** Load member data from the spreadsheet (called after LIFF login) */
async function loadMemberFromBackend(lineUserId) {
  if (!CONFIG.GAS_URL || CONFIG.GAS_URL === 'YOUR_GAS_WEBAPP_URL') return false;
  try {
    const res  = await fetch(`${CONFIG.GAS_URL}?action=get_member&line_user_id=${encodeURIComponent(lineUserId)}`);
    const data = await res.json();
    if (data.success && data.member) {
      const m = data.member;
      member.phone             = m.phone             || null;
      member.points            = m.point             || m.points || member.points;
      member.cabbage_points    = m.cabbage_points    || 0;
      member.carrot_points     = m.carrot_points     || 0;
      member.corn_points       = m.corn_points       || 0;
      member.watermelon_points = m.watermelon_points || 0;
      member.strawberry_points = m.strawberry_points || 0;

      if (m.farm_plots) {
        try { farm.plots = JSON.parse(m.farm_plots); } catch (_) { /* keep default */ }
      }
      farm.lastWatered        = m.farm_last_watered         || null;
      farm.consecutiveNoWater = m.farm_consecutive_no_water || 0;

      return true;
    }
  } catch (e) {
    console.warn('loadMemberFromBackend failed:', e);
  }
  return false;
}

/** Save phone binding to backend (or just locally in dev mode) */
async function savePhoneToBackend(phone) {
  if (!CONFIG.GAS_URL || CONFIG.GAS_URL === 'YOUR_GAS_WEBAPP_URL') {
    // Dev mode: persist locally only
    member.phone = phone;
    saveState();
    return true;
  }
  try {
    const res  = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify({
        action:       'bind_phone',
        line_user_id: member.lineUserId,
        line_name:    member.lineName,
        phone:        phone,
      }),
    });
    const data = await res.json();
    if (data.success) {
      member.phone = phone;
      saveState();
      return true;
    }
  } catch (e) {
    console.warn('savePhoneToBackend failed:', e);
  }
  return false;
}

// ─────────────────────────────────────────────
//  PHONE BINDING MODAL
// ─────────────────────────────────────────────
function showPhoneModal() {
  phoneModal.classList.add('visible');
}

function hidePhoneModal() {
  phoneModal.classList.remove('visible');
}

async function submitPhone() {
  const phone = phoneInput.value.trim();
  if (!phone) { showToast('請輸入電話號碼'); return; }

  phoneSubmitBtn.disabled    = true;
  phoneSubmitBtn.textContent = '儲存中…';

  const ok = await savePhoneToBackend(phone);
  if (ok) {
    hidePhoneModal();
    showToast('電話號碼已儲存！歡迎使用農場遊戲！🌾');
    updateHUD();
  } else {
    showToast('儲存失敗，請重試');
  }

  phoneSubmitBtn.disabled    = false;
  phoneSubmitBtn.textContent = '儲存';
}

// ─────────────────────────────────────────────
//  QR CODE MODAL
// ─────────────────────────────────────────────
function showQRModal() {
  // Build (or refresh) QR code
  qrContainer.innerHTML = '';
  const userId = member.lineUserId || 'DEMO_USER';

  if (typeof QRCode !== 'undefined') {
    new QRCode(qrContainer, {
      text:       userId,
      width:      200,
      height:     200,
      colorDark:  '#4E342E',
      colorLight: '#FFF8E7',
    });
  } else {
    // Fallback: plain text
    qrContainer.textContent = userId;
  }

  qrUserInfo.innerHTML = `
    <strong>${member.lineName || '會員'}</strong><br>
    <small>ID：${userId}</small>
    ${member.phone ? `<br><small>📱 ${member.phone}</small>` : ''}
    <br><small>🎫 累計點數：${member.points}</small>
  `;

  qrOverlay.classList.add('visible');
}

function hideQRModal() {
  qrOverlay.classList.remove('visible');
}

// ─────────────────────────────────────────────
//  SHOP
// ─────────────────────────────────────────────
function renderShop() {
  shopList.innerHTML = '';
  SEEDS.forEach(seed => {
    const item         = document.createElement('div');
    item.className     = 'shop-item';
    const canAfford    = member.points  >= seed.cost;
    const isUnlocked   = member.level   >= seed.unlockLevel;
    const reqText      = isUnlocked ? '' : `（需 Lv.${seed.unlockLevel}）`;

    item.innerHTML = `
      <span class="item-emoji">${seed.emoji}</span>
      <div class="item-info">
        <strong>${seed.name} ${reqText}</strong>
        <small>種子費：🎫${seed.cost} ／ 收穫：${seed.emoji}+1兌換點 ／ 生長：${seed.growDays}天</small>
      </div>
      <button class="shop-buy-btn" data-id="${seed.id}" ${(!canAfford || !isUnlocked) ? 'disabled' : ''}>
        選用
      </button>
    `;

    item.querySelector('.shop-buy-btn').addEventListener('click', () => {
      selectedSeed = seed.id;
      renderSeedRow();
      closeModal();
      showToast(`已選擇 ${seed.name}！點擊空格農田種植`);
    });

    shopList.appendChild(item);
  });
}

function openShop() {
  renderShop();
  modalOverlay.classList.add('visible');
}

function closeModal() {
  modalOverlay.classList.remove('visible');
}

// ─────────────────────────────────────────────
//  VISUAL EFFECTS
// ─────────────────────────────────────────────
function spawnSparkle(parentEl, emoji) {
  const s       = document.createElement('span');
  s.className   = 'sparkle';
  s.textContent = emoji;
  s.style.left  = '50%';
  s.style.top   = '50%';
  parentEl.appendChild(s);
  setTimeout(() => s.remove(), 700);
}

function spawnFloatLabel(parentEl, text) {
  const rect    = parentEl.getBoundingClientRect();
  const l       = document.createElement('span');
  l.className   = 'float-label';
  l.textContent = text;
  l.style.left  = (rect.left + rect.width  / 2) + 'px';
  l.style.top   = (rect.top)                    + 'px';
  l.style.position = 'fixed';
  document.body.appendChild(l);
  setTimeout(() => l.remove(), 1300);
}

function triggerLevelUp() {
  levelupBanner.textContent = `🎉 升級！Lv.${member.level} 🎉`;
  levelupEl.classList.add('visible');
  setTimeout(() => levelupEl.classList.remove('visible'), 2200);
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('visible');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toastEl.classList.remove('visible'), 2500);
}

// ─────────────────────────────────────────────
//  LINE LIFF INITIALISATION
// ─────────────────────────────────────────────
async function initLiff() {
  if (typeof liff === 'undefined') {
    console.warn('LIFF SDK not loaded – running in browser / dev mode');
    return;
  }
  if (!CONFIG.LIFF_ID || CONFIG.LIFF_ID === 'YOUR_LIFF_ID') {
    console.warn('LIFF_ID not configured – skipping LIFF init');
    return;
  }

  try {
    await liff.init({ liffId: CONFIG.LIFF_ID });

    if (liff.isLoggedIn()) {
      const profile      = await liff.getProfile();
      member.lineUserId  = profile.userId;
      member.lineName    = profile.displayName;

      // Attempt to load latest data from spreadsheet
      await loadMemberFromBackend(profile.userId);
      saveState();

      // Show phone-binding modal if phone not yet registered
      if (!member.phone) {
        showPhoneModal();
      }
    } else {
      liff.login();
    }
  } catch (e) {
    console.error('LIFF init error:', e);
    // Continue in offline / non-LIFF mode so the game is still playable
  }
}

// ─────────────────────────────────────────────
//  EVENT LISTENERS
// ─────────────────────────────────────────────
harvestBtn.addEventListener('click', harvestAll);
shopBtn.addEventListener('click', openShop);
waterBtn.addEventListener('click', waterFarm);
qrBtn.addEventListener('click', showQRModal);

modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

phoneSubmitBtn.addEventListener('click', submitPhone);
phoneInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitPhone(); });

qrClose.addEventListener('click', hideQRModal);
qrOverlay.addEventListener('click', e => { if (e.target === qrOverlay) hideQRModal(); });

// ─────────────────────────────────────────────
//  INITIALISATION
// ─────────────────────────────────────────────
async function init() {
  loadState();
  renderGrid();
  renderSeedRow();
  updateHUD();

  // LIFF login + member data (async – UI is already visible)
  await initLiff();

  // Run daily processing (growth, weather, drought checks)
  await runDailyProcessing();

  // Re-render after processing
  renderGrid();
  updateHUD();
}

init();

