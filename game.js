/**
 * game.js — Farmmember core logic
 *
 * Mechanics:
 *  - 3×5 farm grid (portrait)
 *  - Seed → Sprout → Mature growth stages
 *  - Planting, harvesting, coins, XP, level system
 *  - Shop to unlock seeds
 */

// ─────────────────────────────────────────────
//  SEED CATALOGUE
// ─────────────────────────────────────────────
const SEEDS = [
  {
    id: 'carrot',
    name: '胡蘿蔔',
    emoji: '🥕',
    cost: 5,
    growTime: 10,    // seconds to mature
    reward: { coins: 15, xp: 8 },
    unlockLevel: 1,
    stages: ['🌱', '🌿', '🥕'],
  },
  {
    id: 'strawberry',
    name: '草莓',
    emoji: '🍓',
    cost: 12,
    growTime: 20,
    reward: { coins: 30, xp: 18 },
    unlockLevel: 2,
    stages: ['🌱', '🌺', '🍓'],
  },
  {
    id: 'sunflower',
    name: '向日葵',
    emoji: '🌻',
    cost: 20,
    growTime: 35,
    reward: { coins: 55, xp: 30 },
    unlockLevel: 3,
    stages: ['🌱', '🌿', '🌻'],
  },
  {
    id: 'watermelon',
    name: '西瓜',
    emoji: '🍉',
    cost: 40,
    growTime: 60,
    reward: { coins: 110, xp: 60 },
    unlockLevel: 5,
    stages: ['🌱', '🌿', '🍉'],
  },
  {
    id: 'corn',
    name: '玉米',
    emoji: '🌽',
    cost: 60,
    growTime: 90,
    reward: { coins: 180, xp: 90 },
    unlockLevel: 7,
    stages: ['🌱', '🌿', '🌽'],
  },
];

// ─────────────────────────────────────────────
//  XP THRESHOLDS  (level → xp needed)
// ─────────────────────────────────────────────
function xpForLevel(lvl) {
  return lvl * 100;
}

// ─────────────────────────────────────────────
//  GAME STATE
// ─────────────────────────────────────────────
const GRID_COLS = 3;
const GRID_ROWS = 5;
const TOTAL_CELLS = GRID_COLS * GRID_ROWS;

let state = {
  coins: 50,
  xp: 0,
  level: 1,
  selectedSeed: SEEDS[0].id,
  cells: Array.from({ length: TOTAL_CELLS }, () => ({
    status: 'empty',   // empty | planted | growing | ready
    seedId: null,
    plantedAt: null,
    progress: 0,       // 0–1
  })),
};

// ─────────────────────────────────────────────
//  DOM REFS
// ─────────────────────────────────────────────
const coinEl     = document.getElementById('coins');
const levelEl    = document.getElementById('level');
const xpBarEl    = document.getElementById('xp-bar');
const staminaEl  = document.getElementById('stamina');
const gridEl     = document.getElementById('farm-grid');
const seedRowEl  = document.getElementById('seed-row');
const harvestBtn = document.getElementById('harvest-all-btn');
const shopBtn    = document.getElementById('shop-btn');
const modalOverlay = document.getElementById('modal-overlay');
const shopList   = document.getElementById('shop-list');
const modalClose = document.getElementById('modal-close');
const levelupEl  = document.getElementById('levelup-popup');
const levelupBanner = document.getElementById('levelup-banner');
const toastEl    = document.getElementById('toast');

// ─────────────────────────────────────────────
//  RENDER HELPERS
// ─────────────────────────────────────────────
function updateHUD() {
  coinEl.textContent   = state.coins;
  levelEl.textContent  = `Lv.${state.level}`;
  const needed = xpForLevel(state.level);
  const pct    = Math.min(100, Math.round((state.xp / needed) * 100));
  xpBarEl.style.width = pct + '%';
}

function renderSeedRow() {
  seedRowEl.innerHTML = '';
  SEEDS.forEach(seed => {
    const btn = document.createElement('button');
    btn.className = 'seed-btn';
    btn.dataset.id = seed.id;

    const unlocked = state.level >= seed.unlockLevel;
    if (!unlocked) btn.classList.add('locked');
    if (seed.id === state.selectedSeed) btn.classList.add('selected');

    btn.innerHTML = `
      <span class="seed-emoji">${seed.emoji}</span>
      <span class="seed-name">${seed.name}</span>
      <span class="seed-cost">💰${seed.cost}</span>
      ${!unlocked ? `<span class="lock-icon">🔒</span>` : ''}
    `;

    btn.addEventListener('click', () => {
      if (!unlocked) {
        showToast(`需要 Lv.${seed.unlockLevel} 才能解鎖！`);
        return;
      }
      state.selectedSeed = seed.id;
      renderSeedRow();
    });

    seedRowEl.appendChild(btn);
  });
}

function renderGrid() {
  // Only called once to build DOM; updates happen via cell refresh
  gridEl.innerHTML = '';
  state.cells.forEach((cell, i) => {
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
}

function refreshCell(index) {
  const cell  = state.cells[index];
  const el    = gridEl.children[index];
  const icon  = el.querySelector('.plant-icon');
  const fill  = el.querySelector('.progress-fill');

  el.className = `cell ${cell.status}`;

  if (cell.status === 'empty') {
    icon.textContent = '';
    fill.style.width = '0%';
    return;
  }

  const seed = SEEDS.find(s => s.id === cell.seedId);
  if (!seed) return;

  if (cell.status === 'planted') {
    icon.textContent = seed.stages[0];
    fill.style.width = '0%';
  } else if (cell.status === 'growing') {
    const elapsed = (Date.now() - cell.plantedAt) / 1000;
    const pct     = Math.min(100, Math.round((elapsed / seed.growTime) * 100));
    const stage   = pct < 50 ? seed.stages[0] : seed.stages[1];
    icon.textContent = stage;
    fill.style.width = pct + '%';
  } else if (cell.status === 'ready') {
    icon.textContent = seed.stages[2];
    fill.style.width = '100%';
  }
}

// ─────────────────────────────────────────────
//  GAME ACTIONS
// ─────────────────────────────────────────────
function handleCellClick(index) {
  const cell = state.cells[index];

  if (cell.status === 'empty') {
    plantSeed(index);
  } else if (cell.status === 'ready') {
    harvest(index);
  }
}

function plantSeed(index) {
  const seed = SEEDS.find(s => s.id === state.selectedSeed);
  if (!seed) return;

  if (state.level < seed.unlockLevel) {
    showToast(`需要 Lv.${seed.unlockLevel} 才能種植！`);
    return;
  }
  if (state.coins < seed.cost) {
    showToast('金幣不足！');
    return;
  }

  state.coins -= seed.cost;
  state.cells[index] = {
    status: 'planted',
    seedId: seed.id,
    plantedAt: Date.now(),
    progress: 0,
  };

  // After a brief moment, transition to growing
  setTimeout(() => {
    if (state.cells[index].status === 'planted') {
      state.cells[index].status = 'growing';
      refreshCell(index);
    }
  }, 600);

  updateHUD();
  refreshCell(index);
}

function harvest(index) {
  const cell = state.cells[index];
  const seed = SEEDS.find(s => s.id === cell.seedId);
  if (!seed) return;

  const el = gridEl.children[index];
  spawnSparkle(el, seed.emoji);
  spawnFloatLabel(el, `+${seed.reward.coins}💰`);

  state.coins += seed.reward.coins;
  addXP(seed.reward.xp);

  state.cells[index] = { status: 'empty', seedId: null, plantedAt: null, progress: 0 };
  updateHUD();
  refreshCell(index);
}

function harvestAll() {
  let any = false;
  state.cells.forEach((cell, i) => {
    if (cell.status === 'ready') {
      harvest(i);
      any = true;
    }
  });
  if (!any) showToast('還沒有作物成熟！');
}

function addXP(amount) {
  state.xp += amount;
  const needed = xpForLevel(state.level);
  if (state.xp >= needed) {
    state.xp -= needed;
    state.level++;
    triggerLevelUp();
    renderSeedRow(); // unlock new seeds
  }
}

// ─────────────────────────────────────────────
//  GROWTH TICK (runs every second)
// ─────────────────────────────────────────────
function growthTick() {
  let changed = false;
  state.cells.forEach((cell, i) => {
    if (cell.status !== 'growing') return;
    const seed    = SEEDS.find(s => s.id === cell.seedId);
    if (!seed) return;
    const elapsed = (Date.now() - cell.plantedAt) / 1000;
    if (elapsed >= seed.growTime) {
      cell.status = 'ready';
      changed = true;
    }
    refreshCell(i);
  });
  if (changed) updateHUD();
}

// ─────────────────────────────────────────────
//  VISUAL EFFECTS
// ─────────────────────────────────────────────
function spawnSparkle(parentEl, emoji) {
  const s = document.createElement('span');
  s.className = 'sparkle';
  s.textContent = emoji;
  s.style.left = '50%';
  s.style.top  = '50%';
  parentEl.appendChild(s);
  setTimeout(() => s.remove(), 700);
}

function spawnFloatLabel(parentEl, text) {
  const rect = parentEl.getBoundingClientRect();
  const l = document.createElement('span');
  l.className = 'float-label';
  l.textContent = text;
  l.style.left = (rect.left + rect.width / 2) + 'px';
  l.style.top  = (rect.top) + 'px';
  l.style.position = 'fixed';
  document.body.appendChild(l);
  setTimeout(() => l.remove(), 1300);
}

function triggerLevelUp() {
  levelupBanner.textContent = `🎉 升級！Lv.${state.level} 🎉`;
  levelupEl.classList.add('visible');
  setTimeout(() => levelupEl.classList.remove('visible'), 2200);
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('visible');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toastEl.classList.remove('visible'), 2000);
}

// ─────────────────────────────────────────────
//  SHOP
// ─────────────────────────────────────────────
function renderShop() {
  shopList.innerHTML = '';
  SEEDS.forEach(seed => {
    const item = document.createElement('div');
    item.className = 'shop-item';
    const canAfford   = state.coins >= seed.cost;
    const isUnlocked  = state.level >= seed.unlockLevel;
    const reqText     = isUnlocked ? '' : `（需 Lv.${seed.unlockLevel}）`;
    item.innerHTML = `
      <span class="item-emoji">${seed.emoji}</span>
      <div class="item-info">
        <strong>${seed.name} ${reqText}</strong>
        <small>種植費：💰${seed.cost} ／ 收穫：💰${seed.reward.coins} +${seed.reward.xp}XP ／ 生長：${seed.growTime}s</small>
      </div>
      <button class="shop-buy-btn" data-id="${seed.id}" ${(!canAfford || !isUnlocked) ? 'disabled' : ''}>
        買種子
      </button>
    `;
    item.querySelector('.shop-buy-btn').addEventListener('click', () => {
      state.selectedSeed = seed.id;
      renderSeedRow();
      closeModal();
      showToast(`已選擇 ${seed.name}！`);
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
//  EVENT LISTENERS
// ─────────────────────────────────────────────
harvestBtn.addEventListener('click', harvestAll);
shopBtn.addEventListener('click', openShop);
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) closeModal();
});

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
function init() {
  renderGrid();
  renderSeedRow();
  updateHUD();
  setInterval(growthTick, 1000);
}

init();
