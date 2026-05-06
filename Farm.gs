
/**
 * =========================
 * Farm.gs 相容包裝
 * =========================
 * 農場規則與農場 API 已獨立放這個檔案。
 * Code.gs 只保留會員主表 / LINE / POS / 點數等核心邏輯。
 */

function getFarmData_(data) {
  return getFarmBootstrap_(data || {});
}

function saveFarmData_(data) {
  data = data || {};
  ensureFarmSheets_();

  const lineUserId = clean_(data.line_user_id || data.userId);
  const memberId = clean_(data.member_id);
  if (!lineUserId) return { ok: false, message: '缺少 line_user_id' };

  let farm = data.farm || data.farm_json || data.farmJson || null;
  if (typeof farm === 'string') {
    try {
      farm = JSON.parse(farm);
    } catch (err) {
      return { ok: false, message: 'farm_json 格式錯誤' };
    }
  }

  if (!farm) return { ok: false, message: '缺少 farm 資料' };

  const hit = findMemberByLineUserId_(lineUserId);
  const finalMemberId = memberId || (hit.ok ? hit.member.member_id : '');
  saveFarmState_(lineUserId, finalMemberId, farm);

  return { ok: true, message: '農場資料已儲存', farm: normalizeFarmState_(farm) };
}

/**
 * =========================
 * Farmmember 農場遊戲 API
 * 貼在 Code.gs 最下面
 * =========================
 */

const SHEET_FARM_DATA = 'farm_data';
const SHEET_FARM_LOG = 'farm_log';

const FARM_HEADERS = [
  'line_user_id',
  'member_id',
  'Game_Point',
  'plots_json',
  'farm_json',
  'last_calc_date',
  'last_water_date',
  'update_time'
];

const FARM_LOG_HEADERS = [
  'time',
  'line_user_id',
  'member_id',
  'action',
  'crop',
  'plot_index',
  'cost',
  'point_after',
  'message'
];

const FARM_PLOT_COUNT = 20;   // 農地格數（前後端一致）

function farmApi(data) {
  const action = clean_(data.action);

  if (action === 'getFarmBootstrap') {
    return getFarmBootstrap_(data);
  }

  if (action === 'farmPlant') {
    return farmPlant_(data);
  }

  if (action === 'farmWater') {
    return farmWater_(data);
  }

  if (action === 'farmHarvest') {
    return farmHarvest_(data);
  }

  if (action === 'farmRedeemCoupon') {
    return farmRedeemCoupon_(data);
  }

  if (action === 'shopBuy') {
    return farmShopBuy_(data);
  }

  if (action === 'linkByPhone') {
    return farmLinkByPhone_(data);
  }

  return {
    ok: false,
    message: '未知 farm action：' + action
  };
}

// 用電話號碼綁定 LINE user ID（找到舊會員就綁定，找不到就新建）
function farmLinkByPhone_(data) {
  initSystem_();
  const lineUserId = clean_(data.line_user_id || data.userId);
  const phoneRaw   = clean_(data.phone);
  const lineName   = clean_(data.line_name || 'LINE會員');

  if (!lineUserId) return { ok: false, message: '缺少 line_user_id' };
  if (!phoneRaw)   return { ok: false, message: '請輸入電話號碼' };

  const phoneInfo = normalizePhoneWithRule_(phoneRaw);
  if (phoneInfo.phone_status !== 'valid') {
    return { ok: false, message: '電話格式不正確，請重新輸入（如 0912345678）' };
  }

  const ss   = openSS_();
  const sh   = getOrCreateSheet_(ss, SHEET_MEMBERS);
  ensureMainMemberSheet_(ss);
  const rows = getMainMemberObjects_(sh);
  const tempHit = findMemberByLineUserId_(lineUserId);

  // 先找電話匹配的會員
  const phoneHits = rows.filter(function(r) {
    return clean_(r.phone_normalized) === phoneInfo.phone_normalized;
  });

  if (phoneHits.length > 1) {
    return { ok: false, message: '同電話對到多筆會員，請人工確認' };
  }

  let member;
  if (phoneHits.length > 0) {
    // 找到了 → 接手舊會員資料，假 ID 或空白都視為未綁定
    member = phoneHits[0];
    const oldLineUserId = clean_(member.line_user_id);

    if (oldLineUserId && oldLineUserId !== lineUserId && isRealLineUserId_(oldLineUserId)) {
      return { ok: false, message: '此電話已綁定其他 LINE 帳號，請人工確認' };
    }

    const patch = buildUpsertPatch_(
      member,
      {
        line_user_id: lineUserId,
        line_name: lineName,
        member_source: getSetting_('linked_source', 'linked'),
        link_status: 'linked'
      },
      phoneRaw,
      phoneInfo,
      clean_(member.name || member.line_name || lineName || 'LINE會員'),
      lineUserId
    );
    setMemberObjectToRow_(sh, member.__rowIndex, patch);

    if (tempHit.ok && tempHit.rowIndex !== member.__rowIndex) {
      sh.deleteRow(tempHit.rowIndex);
    }
  } else {
    // 找不到電話舊資料 → 若目前 LINE 臨時會員已存在，就直接補電話；否則才新建
    if (tempHit.ok) {
      const patch = buildUpsertPatch_(
        tempHit.member,
        {
          line_user_id: lineUserId,
          line_name: lineName,
          member_source: getSetting_('linked_source', 'linked'),
          link_status: 'linked'
        },
        phoneRaw,
        phoneInfo,
        clean_(tempHit.member.name || tempHit.member.line_name || lineName || 'LINE會員'),
        lineUserId
      );
      setMemberObjectToRow_(sh, tempHit.rowIndex, patch);
      member = readMemberObjectAtRow_(sh, tempHit.rowIndex);
    } else {
      const res = upsertMainMember_({
        line_user_id: lineUserId,
        line_name: lineName,
        name: lineName,
        phone_raw: phoneRaw,
        phone_normalized: phoneInfo.phone_normalized,
        phone_digits: phoneInfo.phone_digits,
        phone_status: phoneInfo.phone_status,
        phone_message: phoneInfo.phone_message,
        member_source: 'farmmember',
        join_method: 'farmmember',
        register_time: nowText_()
      }, { createIfPhoneInvalid: false });
      if (!res.ok) return res;
      member = res.member;
    }
  }

  // 回傳完整 bootstrap
  return getFarmBootstrap_(data);
}

function getFarmBootstrap_(data) {
  initSystem_();
  ensureFarmSheets_();

  const lineUserId = clean_(data.line_user_id || data.userId);
  if (!lineUserId) return { ok:false, message:'缺少 line_user_id' };

  let memberHit = findMemberByLineUserId_(lineUserId);

  if (!memberHit.ok) {
    const created = registerLineMember_({
      line_user_id: lineUserId,
      line_name: clean_(data.line_name || 'LINE會員'),
      source: 'farmmember',
      note: 'Farmmember 自動建立'
    });

    if (!created.ok) return created;
    memberHit = findMemberByLineUserId_(lineUserId);
  }

  if (memberHit.ok && !clean_(memberHit.member.member_id) && clean_(memberHit.member.phone_normalized)) {
    const phoneRaw = clean_(memberHit.member.phone_raw || memberHit.member.phone_normalized);
    const phoneInfo = normalizePhoneWithRule_(phoneRaw);
    const patch = buildUpsertPatch_(
      memberHit.member,
      {
        line_user_id: lineUserId,
        line_name: clean_(data.line_name || memberHit.member.line_name || memberHit.member.name || 'LINE會員'),
        member_source: getSetting_('linked_source', 'linked'),
        link_status: 'linked'
      },
      phoneRaw,
      phoneInfo,
      clean_(memberHit.member.name || memberHit.member.line_name || data.line_name || 'LINE會員'),
      lineUserId
    );
    setMemberObjectToRow_(memberHit.sheet, memberHit.rowIndex, patch);
    memberHit = findMemberByLineUserId_(lineUserId);
  }

  const member = memberHit.member;
  let farm = getOrCreateFarmState_(lineUserId, member.member_id);

  // 輪詢每日自動成長
  farm = applyDailyTick_(farm);
  saveFarmState_(lineUserId, member.member_id, farm);

  const hasPhone = !!(clean_(member.phone_normalized));

  return {
    ok: true,
    need_phone: !hasPhone,
    member: buildFarmMemberView_(member),
    farm: farm,
    crops: getFarmCrops_(),
    inventory: farm.seedInventory || {},
    offers: getMemberOffers_(member),
    redeemRule: {
      need: 20,
      text: '同一種作物收成 20 次，可獲得 1 張對應兌換券'
    }
  };
}

function farmPlant_(data) {
  initSystem_();
  ensureFarmSheets_();

  const lineUserId = clean_(data.line_user_id || data.userId);
  const cropKey = clean_(data.crop || 'cabbage');
  const index = Number(data.index);

  if (!lineUserId) return { ok:false, message:'缺少 line_user_id' };
  if (isNaN(index) || index < 0 || index > FARM_PLOT_COUNT - 1) return { ok:false, message:'農地位置錯誤' };

  const memberHit = findMemberByLineUserId_(lineUserId);
  if (!memberHit.ok) return { ok:false, message:'找不到會員' };

  const member = memberHit.member;
  const crop = getFarmCrops_()[cropKey];
  if (!crop) return { ok:false, message:'作物不存在' };

  const farm = getOrCreateFarmState_(lineUserId, member.member_id);
  const lv = numberOrZero_(farm.level) || 1;

  if (lv < crop.unlockLevel) {
    return { ok:false, message:'等級不足，需要 Lv.' + crop.unlockLevel };
  }

  // 注意：點數已在商店購買種子時扣過，種植不再扣點

  const plot = farm.plots[index];
  if (plot && plot.crop) {
    return { ok:false, message:'這格已經有作物' };
  }

  // 驗證並扣除 server 端庫存
  if (!farm.seedInventory) farm.seedInventory = {};
  const seedCount = numberOrZero_(farm.seedInventory[cropKey]);
  if (seedCount <= 0) {
    return { ok:false, message:crop.name + ' 庫存不足，請到商店購買' };
  }
  farm.seedInventory[cropKey] = seedCount - 1;

  farm.plots[index] = {
    crop: cropKey,
    stage: 0,
    progress: 0,
    plantedAt: todayText_(),
    lastWaterDate: '',
    noWaterDays: 0,
    dead: false,
    ready: false
  };

  saveFarmState_(lineUserId, member.member_id, farm);
  logFarm_(lineUserId, member.member_id, 'plant', cropKey, index, 0, numberOrZero_(member.point), '種植成功');

  return {
    ok:true,
    message:'種植成功',
    farm:farm
  };
}

function farmWater_(data) {
  initSystem_();
  ensureFarmSheets_();

  const lineUserId = clean_(data.line_user_id || data.userId);
  if (!lineUserId) return { ok:false, message:'缺少 line_user_id' };

  const memberHit = findMemberByLineUserId_(lineUserId);
  if (!memberHit.ok) return { ok:false, message:'找不到會員' };

  const today = todayText_();
  const farm = getOrCreateFarmState_(lineUserId, memberHit.member.member_id);

  if (farm.lastWaterDate === today) {
    return { ok:false, message:'今天已經澆水過了' };
  }

  farm.lastWaterDate = today;

  farm.plots.forEach(function(p){
    if (!p || !p.crop || p.dead || p.ready) return;

    p.lastWaterDate = today;
    p.noWaterDays = 0;
    p.progress = Math.min(100, numberOrZero_(p.progress) + 11);
    p.stage = calcStageByProgress_(p.progress);

    if (p.progress >= 100) {
      p.ready = true;
      p.stage = 4;
    }
  });

  saveFarmState_(lineUserId, memberHit.member.member_id, farm);
  logFarm_(lineUserId, memberHit.member.member_id, 'water', '', '', 0, memberHit.member.point, '今日澆水成功');

  return {
    ok:true,
    message:'今日澆水成功',
    farm:farm
  };
}

function farmHarvest_(data) {
  initSystem_();
  ensureFarmSheets_();

  const lineUserId = clean_(data.line_user_id || data.userId);
  const index = Number(data.index);

  if (!lineUserId) return { ok:false, message:'缺少 line_user_id' };
  if (isNaN(index) || index < 0 || index > FARM_PLOT_COUNT - 1) return { ok:false, message:'農地位置錯誤' };

  const memberHit = findMemberByLineUserId_(lineUserId);
  if (!memberHit.ok) return { ok:false, message:'找不到會員' };

  const member = memberHit.member;
  const farm = getOrCreateFarmState_(lineUserId, member.member_id);
  const plot = farm.plots[index];

  if (!plot || !plot.crop) return { ok:false, message:'這格沒有作物' };

  if (plot.dead) {
    farm.plots[index] = emptyFarmPlot_();
    saveFarmState_(lineUserId, member.member_id, farm);
    return { ok:true, message:'已清除枯萎作物', farm:farm };
  }

  if (!plot.ready && plot.stage < 4) {
    return { ok:false, message:'作物尚未成熟' };
  }

  const cropKey = plot.crop;
  const crop = getFarmCrops_()[cropKey];

  farm.harvestCount[cropKey] = numberOrZero_(farm.harvestCount[cropKey]) + 1;

  let couponCreated = false;
  if (farm.harvestCount[cropKey] >= 20) {
    farm.harvestCount[cropKey] -= 20;
    farm.coupons[cropKey] = numberOrZero_(farm.coupons[cropKey]) + 1;
    couponCreated = true;
  }

  farm.xp = numberOrZero_(farm.xp) + 20;
  farm.level = calcFarmLevel_(farm.xp);
  farm.plots[index] = emptyFarmPlot_();

  saveFarmState_(lineUserId, member.member_id, farm);

  logFarm_(
    lineUserId,
    member.member_id,
    'harvest',
    cropKey,
    index,
    0,
    member.point,
    couponCreated ? crop.name + '兌換券 +1' : crop.name + '收成 +1'
  );

  return {
    ok: true,
    message: couponCreated ? crop.name + '兌換券 +1' : crop.name + '收成成功',
    crop: cropKey,
    couponCreated: couponCreated,
    farm: farm
  };
}

function farmRedeemCoupon_(data) {
  initSystem_();
  ensureFarmSheets_();

  const lineUserId = clean_(data.line_user_id || data.userId);
  const cropKey = clean_(data.crop);

  if (!lineUserId) return { ok:false, message:'缺少 line_user_id' };
  if (!cropKey) return { ok:false, message:'缺少 crop' };

  const memberHit = findMemberByLineUserId_(lineUserId);
  if (!memberHit.ok) return { ok:false, message:'找不到會員' };

  const member = memberHit.member;

  if (!canRedeemFarmCoupon_(member)) {
    return {
      ok: false,
      needBind: true,
      message: '兌換需要完成會員資料，請先填寫姓名與電話'
    };
  }

  const farm = getOrCreateFarmState_(lineUserId, member.member_id);

  if (numberOrZero_(farm.coupons[cropKey]) <= 0) {
    return { ok:false, message:'沒有可使用的兌換券' };
  }

  farm.coupons[cropKey] -= 1;
  saveFarmState_(lineUserId, member.member_id, farm);

  logFarm_(lineUserId, member.member_id, 'redeem_coupon', cropKey, '', 0, member.point, '使用兌換券');

  return {
    ok: true,
    message: '兌換成功',
    farm: farm
  };
}

function canRedeemFarmCoupon_(member) {
  return !!clean_(member.name) &&
         !!clean_(member.phone_normalized) &&
         clean_(member.phone_status) === 'valid';
}

function ensureFarmSheets_() {
  const ss = openSS_();
  ensureSheet_(ss, SHEET_FARM_DATA, FARM_HEADERS);
  ensureSheet_(ss, SHEET_FARM_LOG, FARM_LOG_HEADERS);
}

function getOrCreateFarmState_(lineUserId, memberId) {
  const sh = getOrCreateSheet_(openSS_(), SHEET_FARM_DATA);
  const values = sh.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (clean_(values[i][0]) === lineUserId) {
      const farmJson = clean_(values[i][4]); // E欄 = farm_json（C欄為Game_Point）
      try {
        return normalizeFarmState_(JSON.parse(farmJson || '{}'));
      } catch (err) {
        return defaultFarmState_();
      }
    }
  }

  const farm = defaultFarmState_();

  sh.appendRow([
    lineUserId,
    memberId,
    0,                          // C: Game_Point
    JSON.stringify(farm.plots), // D: plots_json
    JSON.stringify(farm),       // E: farm_json
    todayText_(),               // F: last_calc_date
    '',                         // G: last_water_date
    nowText_()                  // H: update_time
  ]);

  return farm;
}

function saveFarmState_(lineUserId, memberId, farm) {
  const sh = getOrCreateSheet_(openSS_(), SHEET_FARM_DATA);
  const values = sh.getDataRange().getValues();
  const safeFarm = normalizeFarmState_(farm);

  for (let i = 1; i < values.length; i++) {
    if (clean_(values[i][0]) === lineUserId) {
      sh.getRange(i + 1, 2).setValue(memberId);                          // B: member_id
      // 第3欄(C)為 Game_Point，由 adjustPoint_ 另外管理，不在此覆蓋
      sh.getRange(i + 1, 4).setValue(JSON.stringify(safeFarm.plots));    // D: plots_json
      sh.getRange(i + 1, 5).setValue(JSON.stringify(safeFarm));          // E: farm_json
      sh.getRange(i + 1, 6).setValue(todayText_());                      // F: last_calc_date
      sh.getRange(i + 1, 7).setValue(safeFarm.lastWaterDate || '');      // G: last_water_date
      sh.getRange(i + 1, 8).setValue(nowText_());                        // H: update_time
      return;
    }
  }

  sh.appendRow([
    lineUserId,
    memberId,
    0,                                  // C: Game_Point
    JSON.stringify(safeFarm.plots),     // D: plots_json
    JSON.stringify(safeFarm),           // E: farm_json
    todayText_(),                       // F: last_calc_date
    safeFarm.lastWaterDate || '',       // G: last_water_date
    nowText_()                          // H: update_time
  ]);
}

function defaultFarmState_() {
  return {
    level: 1,
    xp: 0,
    lastWaterDate: '',
    weather: {
      rainMm: 0,
      tempC: 25,
      text: '無雨'
    },
    plots: new Array(FARM_PLOT_COUNT).fill(null).map(function(){
      return emptyFarmPlot_();
    }),
    harvestCount: {
      cabbage: 0,
      carrot: 0,
      corn: 0,
      watermelon: 0,
      strawberry: 0
    },
    coupons: {
      cabbage: 0,
      carrot: 0,
      corn: 0,
      watermelon: 0,
      strawberry: 0
    }
  };
}

function normalizeFarmState_(farm) {
  const base = defaultFarmState_();
  farm = farm || {};

  base.level = numberOrZero_(farm.level) || 1;
  base.xp = numberOrZero_(farm.xp);
  base.lastWaterDate = clean_(farm.lastWaterDate);

  if (farm.weather) base.weather = farm.weather;

  if (Array.isArray(farm.plots)) {
    for (let i = 0; i < FARM_PLOT_COUNT; i++) {
      base.plots[i] = farm.plots[i] || emptyFarmPlot_();
    }
  }

  ['cabbage','carrot','corn','watermelon','strawberry'].forEach(function(k){
    if (farm.harvestCount) base.harvestCount[k] = numberOrZero_(farm.harvestCount[k]);
    if (farm.coupons) base.coupons[k] = numberOrZero_(farm.coupons[k]);
  });

  // 保留庫存和日期計算記錄
  base.seedInventory = farm.seedInventory || {};
  base.last_calc_date = clean_(farm.last_calc_date) || '';

  return base;
}

function emptyFarmPlot_() {
  return {
    crop: '',
    stage: -1,
    progress: 0,
    plantedAt: '',
    lastWaterDate: '',
    noWaterDays: 0,
    dead: false,
    ready: false
  };
}

function getFarmCrops_() {
  return {
    cabbage: {
      key: 'cabbage',
      name: '高麗菜',
      cost: 5,
      unlockLevel: 1,
      growDays: 14,
      couponName: '高麗菜兌換券'
    },
    carrot: {
      key: 'carrot',
      name: '胡蘿蔔',
      cost: 8,
      unlockLevel: 2,
      growDays: 14,
      couponName: '胡蘿蔔兌換券'
    },
    corn: {
      key: 'corn',
      name: '玉米',
      cost: 10,
      unlockLevel: 3,
      growDays: 14,
      couponName: '玉米兌換券'
    },
    watermelon: {
      key: 'watermelon',
      name: '西瓜',
      cost: 12,
      unlockLevel: 5,
      growDays: 14,
      couponName: '西瓜兌換券'
    },
    strawberry: {
      key: 'strawberry',
      name: '草莓',
      cost: 16,
      unlockLevel: 7,
      growDays: 14,
      couponName: '草莓兌換券'
    }
  };
}

function calcStageByProgress_(progress) {
  progress = numberOrZero_(progress);
  if (progress >= 100) return 4;
  if (progress >= 75) return 3;
  if (progress >= 50) return 2;
  if (progress >= 25) return 1;
  return 0;
}

function calcFarmLevel_(xp) {
  xp = numberOrZero_(xp);
  let level = 1;
  while (xp >= level * 100) {
    xp -= level * 100;
    level++;
  }
  return level;
}

function buildFarmMemberView_(member) {
  return {
    member_id: clean_(member.member_id),
    name: clean_(member.name || member.line_name || 'LINE會員'),
    phone: clean_(member.phone_normalized),
    line_user_id: clean_(member.line_user_id),
    line_name: clean_(member.line_name),
    line_picture: clean_(member.line_picture || member.pictureUrl || ''),
    balance: numberOrZero_(member.wallet_balance || member.balance),
    bonus: numberOrZero_(member.bonus_balance || member.bonus),
    point: numberOrZero_(member.point),
    level: clean_(member.level || 'normal'),
    status: clean_(member.status),
    referral_code: clean_(member.my_referral_code),
    new_member_coupon_sent: clean_(member.new_member_coupon_sent),
    social_campaign: clean_(member.social_campaign),
    social_coupon_sent: clean_(member.social_coupon_sent),
    referral_reward_sent: clean_(member.referral_reward_sent)
  };
}

function getMemberOffers_(member) {
  return {
    newMemberCouponSent: clean_(member.new_member_coupon_sent),
    socialCouponSent: clean_(member.social_coupon_sent),
    referralRewardSent: clean_(member.referral_reward_sent),
    referralCode: clean_(member.my_referral_code)
  };
}

function logFarm_(lineUserId, memberId, action, crop, plotIndex, cost, pointAfter, message) {
  getOrCreateSheet_(openSS_(), SHEET_FARM_LOG).appendRow([
    nowText_(),
    lineUserId || '',
    memberId || '',
    action || '',
    crop || '',
    plotIndex === '' ? '' : plotIndex,
    cost || 0,
    pointAfter || 0,
    message || ''
  ]);
}

/**
 * 商店購買種子 — 扣遊戲點，增加 seedInventory
 */
function farmShopBuy_(data) {
  initSystem_();
  ensureFarmSheets_();

  const lineUserId = clean_(data.line_user_id || data.userId);
  const cropKey    = clean_(data.crop);
  const qty        = Math.max(1, Number(data.qty || 1));

  if (!lineUserId) return { ok:false, message:'缺少 line_user_id' };
  if (!cropKey)    return { ok:false, message:'缺少 crop' };

  const memberHit = findMemberByLineUserId_(lineUserId);
  if (!memberHit.ok) return { ok:false, message:'找不到會員' };

  const member = memberHit.member;
  const crop   = getFarmCrops_()[cropKey];
  if (!crop) return { ok:false, message:'作物不存在' };

  const lv = numberOrZero_(getOrCreateFarmState_(lineUserId, member.member_id).level) || 1;
  if (lv < (crop.unlockLevel || 1)) {
    return { ok:false, message:'等級不足，需要 Lv.' + crop.unlockLevel };
  }

  const cost  = crop.cost * qty;
  const point = numberOrZero_(member.point);
  if (point < cost) {
    return { ok:false, message:'遊戲點數不足（需要 ' + cost + ' 點）' };
  }

  adjustPoint_({
    line_user_id: lineUserId,
    change: -cost,
    type: 'farm_seed_buy',
    operator: 'farmmember',
    note: '購買種子 ' + crop.name + ' × ' + qty
  });

  const farm = getOrCreateFarmState_(lineUserId, member.member_id);
  if (!farm.seedInventory) farm.seedInventory = {};
  farm.seedInventory[cropKey] = numberOrZero_(farm.seedInventory[cropKey]) + qty;
  saveFarmState_(lineUserId, member.member_id, farm);

  logFarm_(lineUserId, member.member_id, 'shop_buy', cropKey, '', cost, point - cost,
           '購買 ' + crop.name + ' × ' + qty);

  return {
    ok: true,
    message: '已購買 ' + crop.name + ' × ' + qty,
    inventory: farm.seedInventory,
    point_after: point - cost
  };
}

function todayText_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

/**
 * 計算兩個 yyyy-MM-dd 字串之間相差幾天（to - from）
 */
function dateDiffDays_(from, to) {
  try {
    var a = new Date(from + 'T00:00:00+08:00');
    var b = new Date(to   + 'T00:00:00+08:00');
    return Math.round((b - a) / 86400000);
  } catch(e) { return 0; }
}

/**
 * 每日成長 tick：補算從 last_calc_date 到今天漏掉的天數
 * 規則：
 *   - 每天基礎成長 +7%（不澆水約 14 天成熟）
 *   - 超過 4 天沒澆水 → 枯萎
 *   - 已 ready / dead 的格子不動
 */
function applyDailyTick_(farm) {
  var today = todayText_();
  var lastCalc = farm.last_calc_date || farm.lastCalcDate || today;
  var days = dateDiffDays_(lastCalc, today);
  if (days <= 0) return farm;

  farm.plots.forEach(function(p) {
    if (!p || !p.crop || p.dead || p.ready) return;

    var lastWater = p.lastWaterDate || p.plantedAt || lastCalc;
    var noWaterDays = dateDiffDays_(lastWater, today);

    // 超過 4 天沒澆水就枯萎
    if (noWaterDays > 4) {
      p.dead = true;
      p.noWaterDays = noWaterDays;
      return;
    }

    // 每過一天基礎成長 7%
    p.progress = Math.min(100, numberOrZero_(p.progress) + days * 7);
    p.noWaterDays = noWaterDays;
    p.stage = calcStageByProgress_(p.progress);

    if (p.progress >= 100) {
      p.ready = true;
      p.stage = 4;
    }
  });

  farm.last_calc_date = today;
  return farm;
}