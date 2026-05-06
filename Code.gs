const SPREADSHEET_ID = '1Oxk_FHMRvsOSCzWD4iH-XQ-MG8vIod_dKggFZZ5tha4';
const TZ = 'Asia/Taipei';

// 會員主表已改成 Main_member。
// 之後 GAS / LINE / POS 的會員資料都集中寫入這張表。
const SHEET_MEMBERS = 'Main_member';
const SHEET_LINE_SOURCE = '名單';
const SHEET_POS_SOURCE = 'pos_member';
const SHEET_LINE_BIND = 'line綁定';
const SHEET_PENDING = '待確認會員';
const SHEET_SYNC_LOG = '同步紀錄';
const SHEET_TOPUP = '儲值紀錄';
const SHEET_SALES = '消費紀錄';
const SHEET_POINTS = '點數紀錄';
const SHEET_SETTINGS = '系統設定';
const SHEET_CONFIG = 'config';

const DEFAULT_MEMBER_ID_PREFIX = 'ANG';
const DEFAULT_MEMBER_ID_START = 600;
const DEFAULT_MEMBER_ID_PAD = 4;

// Main_member 目前的表頭位置可能會改，所以程式一律用「表頭名稱」找欄位，不用固定 A/B/C。
// 電話依你最新規則：新進資料一律寫到「電話(未統一格式)」，不再寫到前面的「電話(會員編號)」。
const MAIN_MEMBER_REQUIRED_HEADERS = [
  '電話(會員編號)',
  '姓名',
  '生日',
  'Email',
  '地址',
  '餘額',
  '備註',
  '備註二',
  '已發新會員券',
  'social_campaign',
  'userid',
  'id',
  '電話(未統一格式)',
  '時間'
];

// 這些欄位不存在也不會強迫建立；有需要時可手動放在 Main_member 後面。
const MAIN_MEMBER_OPTIONAL_HEADERS = [
  '點數',
  'level',
  'status',
  'line_name',
  'line_bound',
  'bind_time',
  'last_sync_time',
  'member_source',
  'link_status',
  'referrer_line_user_id',
  'my_referral_code',
  'join_method',
  'social_coupon_sent',
  'referral_reward_sent',
  'phone_status',
  'phone_message',
  'phone_digits'
];

const MAIN_FIELD_ALIASES = {
  member_id: ['id', 'member_id', '會員編號'],
  name: ['姓名', 'name', 'line_name'],
  birthday: ['生日', 'birthday'],
  email: ['Email', 'email'],
  address: ['地址', 'address'],
  balance: ['餘額', 'wallet_balance', 'balance'],
  bonus: ['bonus_balance', 'bonus'],
  point: ['點數', 'point'],
  level: ['level', '等級'],
  status: ['status', '狀態'],
  note: ['備註', 'note'],
  note2: ['備註二', 'note2'],
  new_member_coupon_sent: ['已發新會員券', 'new_member_coupon_sent'],
  social_campaign: ['social_campaign'],
  line_user_id: ['userid', 'line_user_id', 'userId', 'LINE userId'],
  id: ['id', 'member_id', '會員編號'],
  phone_member: ['電話(會員編號)', 'phone_normalized'],
  phone_raw: ['電話(未統一格式)', 'phone_raw', '電話'],
  register_time: ['時間', 'register_time'],
  line_name: ['line_name', 'LINE名稱'],
  line_bound: ['line_bound'],
  bind_time: ['bind_time'],
  last_sync_time: ['last_sync_time'],
  member_source: ['member_source'],
  link_status: ['link_status'],
  referrer_line_user_id: ['referrer_line_user_id'],
  my_referral_code: ['my_referral_code'],
  join_method: ['join_method'],
  social_coupon_sent: ['social_coupon_sent'],
  referral_reward_sent: ['referral_reward_sent'],
  phone_status: ['phone_status'],
  phone_message: ['phone_message'],
  phone_digits: ['phone_digits']
};

const LINE_BIND_HEADERS = [
  'line_user_id',
  'line_name',
  'phone_input',
  'phone_normalized',
  'matched_member_id',
  'status',
  'bind_time',
  'source',
  'note'
];

const PENDING_HEADERS = [
  'line_user_id',
  'line_name',
  'phone_input',
  'phone_normalized',
  'status',
  'create_time',
  'note'
];

const SYNC_LOG_HEADERS = [
  'time',
  'action',
  'member_id',
  'phone_normalized',
  'result',
  'message'
];

const TOPUP_HEADERS = [
  'time',
  'member_id',
  'phone_normalized',
  'amount',
  'balance_after',
  'operator',
  'note'
];

const SALES_HEADERS = [
  'time',
  'member_id',
  'phone_normalized',
  'amount',
  'point_used',
  'point_earned',
  'operator',
  'note'
];

const POINT_HEADERS = [
  'time',
  'member_id',
  'phone_normalized',
  'change',
  'point_after',
  'type',
  'operator',
  'note'
];

const SETTINGS_HEADERS = [
  'key',
  'value',
  'note'
];

const CONFIG_HEADERS = [
  'key',
  'value'
];

/**
 * =========================
 * 統一入口
 * =========================
 */
function doPost(e) {
  try {
    const data = parseRequest_(e);
    const action = clean_(data.action);

    if (action) {
      return handleActionPost_(action, data);
    }

    return handleLegacyLiffJoin_(data);
  } catch (err) {
    logSync_('systemError', '', '', 'error', getErrorMessage_(err));
    return jsonOutput_({ ok: false, message: getErrorMessage_(err) });
  }
}

function doGet(e) {
  try {
    const data = e && e.parameter ? e.parameter : {};
    const page = clean_(data.page).toLowerCase();
    const action = clean_(data.action);

    if (page === 'farm') {
      return HtmlService.createHtmlOutputFromFile('farm')
        .setTitle('Farm')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
    }

    if (page === 'referral') {
      return HtmlService.createHtmlOutputFromFile('推薦獎勵')
        .setTitle('推薦獎勵')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
    }

    if (action) {
      return handleActionGet_(action, data);
    }

    return handleLegacyMemberCheck_(data);
  } catch (err) {
    return jsonOutput_({ ok: false, message: getErrorMessage_(err) });
  }
}

function handleActionPost_(action, data) {
  if (action === 'initSystem') return jsonOutput_(initSystem_());
  if (action === 'syncLineListToMainMember') return jsonOutput_(syncLineListToMainMember_(data));
  if (action === 'importPosMembers') return jsonOutput_(importPosMembers_(data));
  if (action === 'importLineOldData') return jsonOutput_(importLineOldData_(data));
  if (action === 'bindLineMember') return jsonOutput_(bindLineMember_(data));
  if (action === 'registerLineMember') return jsonOutput_(registerLineMember_(data));
  if (action === 'pushLineOnlyMemberByWebhook') return jsonOutput_(pushLineOnlyMemberByWebhook_(data));
  if (action === 'findMember') return jsonOutput_(findMember_(data));
  if (action === 'createMember') return jsonOutput_(createMember_(data));
  if (action === 'getInvalidPhoneList') return jsonOutput_(getInvalidPhoneList_());
  if (action === 'upsertTopup') return jsonOutput_(upsertTopup_(data));
  if (action === 'upsertSale') return jsonOutput_(upsertSale_(data));
  if (action === 'adjustPoint') return jsonOutput_(adjustPoint_(data));
  if (action === 'liffJoin') return jsonOutput_(legacyLiffJoinCore_(data));

  // Farmmember / 農場 API
  if (action === 'getFarm') return jsonOutput_(callFarmAction_('getFarmData_', data));
  if (action === 'saveFarm') return jsonOutput_(callFarmAction_('saveFarmData_', data));
  if (action === 'getFarmBootstrap') return jsonOutput_(callFarmAction_('getFarmBootstrap_', data));
  if (action === 'farmPlant') return jsonOutput_(callFarmAction_('farmPlant_', data));
  if (action === 'farmWater') return jsonOutput_(callFarmAction_('farmWater_', data));
  if (action === 'farmHarvest') return jsonOutput_(callFarmAction_('farmHarvest_', data));
  if (action === 'farmRedeemCoupon') return jsonOutput_(callFarmAction_('farmRedeemCoupon_', data));

  // 前端目前實際呼叫的 action：原本這兩個沒接，會造成前端取不到 / 寫不到資料
  if (action === 'shopBuy') return jsonOutput_(callFarmAction_('farmShopBuy_', data));
  if (action === 'linkByPhone') return jsonOutput_(callFarmAction_('farmLinkByPhone_', data));

  return jsonOutput_({ ok: false, message: '未知 action：' + action });
}

function handleActionGet_(action, data) {
  if (action === 'health') {
    return jsonOutput_({ ok: true, message: 'member system api ok', time: nowText_() });
  }

  if (action === 'initSystem') return jsonOutput_(initSystem_());
  if (action === 'syncLineListToMainMember') return jsonOutput_(syncLineListToMainMember_(data));
  if (action === 'getInvalidPhoneList') return jsonOutput_(getInvalidPhoneList_());
  if (action === 'findMember') return jsonOutput_(findMember_(data));
  if (action === 'checkMember') return jsonOutput_(legacyMemberCheckCore_(data));

  return jsonOutput_({
    ok: true,
    message: 'member system backend ready',
    mainSheet: SHEET_MEMBERS,
    phoneWriteRule: '電話一律寫入「電話(未統一格式)」，不寫入「電話(會員編號)」',
    actions: [
      'initSystem',
      'syncLineListToMainMember',
      'importPosMembers',
      'importLineOldData',
      'bindLineMember',
      'registerLineMember',
      'findMember',
      'createMember',
      'getInvalidPhoneList',
      'upsertTopup',
      'upsertSale',
      'adjustPoint',
      'pushLineOnlyMemberByWebhook',
      'liffJoin',
      'checkMember'
    ]
  });
}

function callFarmAction_(functionName, data) {
  let fn = null;

  if (typeof globalThis !== 'undefined' && typeof globalThis[functionName] === 'function') {
    fn = globalThis[functionName];
  }

  if (!fn && typeof this !== 'undefined' && typeof this[functionName] === 'function') {
    fn = this[functionName];
  }

  if (!fn) {
    try {
      const maybeFn = eval(functionName);
      if (typeof maybeFn === 'function') fn = maybeFn;
    } catch (err) {
      // ignore
    }
  }

  if (!fn) {
    return {
      ok: false,
      message: '找不到農場檔案或函式：' + functionName + '，請確認 Farm.gs 已貼上，並且已重新部署新版'
    };
  }

  try {
    return fn(data || {});
  } catch (err) {
    return {
      ok: false,
      message: '農場函式執行錯誤：' + functionName + ' / ' + getErrorMessage_(err)
    };
  }
}

/**
 * =========================
 * 初始化
 * =========================
 */
function initSystem_() {
  const ss = openSS_();

  ensureMainMemberSheet_(ss);
  ensureSheet_(ss, SHEET_LINE_BIND, LINE_BIND_HEADERS);
  ensureSheet_(ss, SHEET_PENDING, PENDING_HEADERS);
  ensureSheet_(ss, SHEET_SYNC_LOG, SYNC_LOG_HEADERS);
  ensureSheet_(ss, SHEET_TOPUP, TOPUP_HEADERS);
  ensureSheet_(ss, SHEET_SALES, SALES_HEADERS);
  ensureSheet_(ss, SHEET_POINTS, POINT_HEADERS);
  ensureSheet_(ss, SHEET_SETTINGS, SETTINGS_HEADERS);
  ensureSheet_(ss, SHEET_CONFIG, CONFIG_HEADERS);

  ensureDefaultSettings_();

  return {
    ok: true,
    message: '會員系統初始化完成',
    mainSheet: SHEET_MEMBERS
  };
}

function ensureDefaultSettings_() {
  const sh = getOrCreateSheet_(openSS_(), SHEET_SETTINGS);
  ensureSheet_(openSS_(), SHEET_SETTINGS, SETTINGS_HEADERS);
  const data = getSheetObjects_(sh);
  const map = {};
  data.forEach(function(row) {
    map[clean_(row.key)] = true;
  });

  const defaults = [
    ['member_id_prefix', DEFAULT_MEMBER_ID_PREFIX, '會員編號前綴'],
    ['default_level', 'normal', '預設會員等級'],
    ['default_status', 'active', '預設會員狀態'],
    ['phone_rule', 'digits_only_last9_prefix0_first_must_9', '電話清洗規則'],
    ['line_only_source', 'line_only', '只有 LINE 的會員來源值'],
    ['pos_source', 'pos', 'POS 會員來源值'],
    ['linked_source', 'linked', 'POS + LINE 已綁定來源值']
  ];

  const rows = [];
  defaults.forEach(function(item) {
    if (!map[item[0]]) rows.push(item);
  });

  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  forceSettingValue_('member_id_prefix', DEFAULT_MEMBER_ID_PREFIX, '會員編號前綴');
}

function forceSettingValue_(key, value, note) {
  const sh = getOrCreateSheet_(openSS_(), SHEET_SETTINGS);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (clean_(values[i][0]) === clean_(key)) {
      if (clean_(values[i][1]) !== clean_(value)) {
        sh.getRange(i + 1, 2).setValue(value);
        if (note !== undefined) sh.getRange(i + 1, 3).setValue(note);
      }
      return;
    }
  }
  sh.appendRow([key, value, note || '']);
}

function ensureMainMemberSheet_(ss) {
  const sh = getOrCreateSheet_(ss, SHEET_MEMBERS);

  if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) {
    sh.getRange(1, 1).setValue('日期：' + nowText_());
    sh.getRange(2, 1, 1, MAIN_MEMBER_REQUIRED_HEADERS.length).setValues([MAIN_MEMBER_REQUIRED_HEADERS]);
    sh.setFrozenRows(2);
    return sh;
  }

  let info = null;
  try {
    info = getMainHeaderInfo_(sh);
  } catch (err) {
    const lastRow = Math.max(sh.getLastRow(), 2);
    if (lastRow < 2) sh.insertRowsAfter(1, 1);
    sh.getRange(2, 1, 1, MAIN_MEMBER_REQUIRED_HEADERS.length).setValues([MAIN_MEMBER_REQUIRED_HEADERS]);
    sh.setFrozenRows(2);
    return sh;
  }

  // 只補「必要但不存在」的主欄位，不覆蓋既有欄位位置。
  MAIN_MEMBER_REQUIRED_HEADERS.forEach(function(header) {
    ensureMainHeaderColumn_(sh, info, header);
    info = getMainHeaderInfo_(sh);
  });

  sh.setFrozenRows(Math.max(1, info.headerRow));
  return sh;
}

function ensureMainHeaderColumn_(sh, info, header) {
  if (findColByAliases_(info, [header]) > 0) return;
  const col = Math.max(sh.getLastColumn() + 1, 1);
  sh.getRange(info.headerRow, col).setValue(header);
}

/**
 * =========================
 * LINE 舊 LIFF / 登錄核心
 * =========================
 */
function handleLegacyLiffJoin_(data) {
  return jsonOutput_(legacyLiffJoinCore_(data));
}

function legacyLiffJoinCore_(data) {
  initSystem_();

  const lineUserId = clean_(data.userId || data.line_user_id || data.userid);
  const lineName = clean_(data.name || data.line_name || data.displayName);
  const phoneInput = clean_(data.phone || data.phone_input || data.phone_raw);
  let refUserId = clean_(data.refUserId || data.ref_user_id);
  const campaign = clean_(data.campaign || data.social_campaign);

  if (!lineUserId) return { error: 'NO_USER', ok: false, message: '缺少 line_user_id' };
  if (refUserId === lineUserId) refUserId = '';

  const phoneInfo = normalizePhoneWithRule_(phoneInput);

  appendLineBind_(
    lineUserId,
    lineName,
    phoneInput,
    phoneInfo.phone_normalized,
    '',
    phoneInfo.phone_status,
    nowText_(),
    'liff',
    campaign ? ('campaign=' + campaign) : ''
  );

  const result = upsertMainMember_({
    line_user_id: lineUserId,
    line_name: lineName,
    name: lineName,
    phone_raw: phoneInput,
    phone_normalized: phoneInfo.phone_normalized,
    phone_digits: phoneInfo.phone_digits,
    phone_status: phoneInfo.phone_status,
    phone_message: phoneInfo.phone_message,
    referrer_line_user_id: refUserId,
    my_referral_code: lineUserId,
    join_method: 'LIFF',
    member_source: phoneInfo.phone_status === 'valid' ? getSetting_('linked_source', 'linked') : getSetting_('line_only_source', 'line_only'),
    link_status: phoneInfo.phone_status === 'valid' ? 'linked' : 'line_only',
    new_member_coupon_sent: '',
    social_campaign: campaign === 'social' ? '是' : '',
    register_time: nowText_(),
    bind_time: nowText_(),
    last_sync_time: nowText_()
  }, {
    allowUpdateByPhoneWhenNoLine: true,
    createIfPhoneInvalid: true
  });

  if (!result.ok) {
    if (phoneInfo.phone_status !== 'valid') {
      appendPending_(lineUserId, lineName, phoneInput, '', 'phone_invalid', phoneInfo.phone_message);
    }
    return {
      error: result.code || 'SAVE_FAILED',
      ok: false,
      message: result.message || '儲存失敗'
    };
  }

  sendCouponsIfNeeded_(lineUserId, refUserId, campaign, result);

  return {
    status: 'OK',
    ok: true,
    isNewMember: result.action === 'created',
    member_id: result.member.member_id,
    phone_normalized: result.member.phone_normalized || '',
    member_source: result.member.member_source || '',
    link_status: result.member.link_status || ''
  };
}

function sendCouponsIfNeeded_(lineUserId, refUserId, campaign, result) {
  const channelAccessToken = getConfig('TOKEN');
  if (!channelAccessToken) return;

  const newMemberLink = getConfig('new_member_link');
  const refSuccessLink = getConfig('referral_link');
  const socialLink = getConfig('social_link');
  const member = result.member || {};

  if (result.action === 'created' && newMemberLink && !member.new_member_coupon_sent) {
    sendCoupon_(channelAccessToken, lineUserId, '🎉 歡迎加入會員！送你 $10 折價券👇', newMemberLink);
    markMemberFlags_(member.member_id, { new_member_coupon_sent: '是' });
  }

  if (campaign === 'social' && socialLink && !member.social_coupon_sent) {
    sendCoupon_(channelAccessToken, lineUserId, '🥚 舊群專屬雞蛋兌換券👇', socialLink);
    markMemberFlags_(member.member_id, { social_campaign: '是', social_coupon_sent: '是' });
  }

  if (refUserId && refSuccessLink) {
    const refHit = findMemberByLineUserId_(refUserId);
    if (refHit.ok) {
      sendCoupon_(channelAccessToken, refUserId, '🎉 你成功邀請好友！再送 $10 折價券👇', refSuccessLink);
      markMemberFlags_(refHit.member.member_id, { referral_reward_sent: '是' });
    }
  }
}

function handleLegacyMemberCheck_(data) {
  return jsonOutput_(legacyMemberCheckCore_(data));
}

function legacyMemberCheckCore_(data) {
  initSystem_();
  const userId = clean_(data.userId || data.line_user_id || data.userid);
  const liffUrl = getConfig('liff_url');

  if (!userId) return { isMember: false };

  const hit = findMemberByLineUserId_(userId);
  if (hit.ok) {
    return {
      isMember: true,
      member_id: hit.member.member_id,
      refUrl: liffUrl ? (liffUrl + '?refUserId=' + encodeURIComponent(userId)) : ''
    };
  }

  return { isMember: false };
}

/**
 * =========================
 * Main_member 核心新增 / 更新 / 防重複
 * =========================
 */
function upsertMainMember_(input, options) {
  input = input || {};
  options = options || {};

  const sh = getOrCreateSheet_(openSS_(), SHEET_MEMBERS);
  ensureMainMemberSheet_(openSS_());

  const lineUserId = clean_(input.line_user_id || input.userid || input.userId);
  const name = clean_(input.name || input.line_name || input.displayName || 'LINE會員');
  const phoneRaw = clean_(input.phone_raw || input.phone || input.phone_input || input.phoneInput);
  const phoneInfo = input.phone_normalized
    ? {
        phone_raw: phoneRaw,
        phone_digits: input.phone_digits || phoneRaw.replace(/\D/g, ''),
        phone_normalized: clean_(input.phone_normalized),
        phone_status: clean_(input.phone_status || 'valid'),
        phone_message: clean_(input.phone_message || '電話格式正常')
      }
    : normalizePhoneWithRule_(phoneRaw);

  if (!lineUserId && !name && !phoneRaw) {
    return { ok: false, code: 'empty_data', message: '沒有可寫入的會員資料' };
  }

  const existingByLine = lineUserId ? findMemberByLineUserId_(lineUserId) : { ok: false };
  if (existingByLine.ok) {
    const patch = buildUpsertPatch_(existingByLine.member, input, phoneRaw, phoneInfo, name, lineUserId);
    setMemberObjectToRow_(sh, existingByLine.rowIndex, patch);
    const member = readMemberObjectAtRow_(sh, existingByLine.rowIndex);
    logSync_('upsertMainMember', member.member_id, member.phone_normalized, 'success', 'LINE 已存在，更新既有會員');
    return { ok: true, action: 'updated', message: 'LINE 已存在，已更新會員', member: member, rowIndex: existingByLine.rowIndex };
  }

  let existingByPhone = { ok: false };
  if (phoneInfo.phone_status === 'valid') {
    existingByPhone = findSingleMemberByPhone_(phoneInfo.phone_normalized);
  }

  if (existingByPhone.ok) {
    const oldLine = clean_(existingByPhone.member.line_user_id);
    if (oldLine && lineUserId && oldLine !== lineUserId) {
      return {
        ok: false,
        code: 'already_member',
        message: '此電話已經是會員，而且已綁定其他 LINE，請人工確認',
        member_id: existingByPhone.member.member_id,
        rowIndex: existingByPhone.rowIndex
      };
    }

    if (!options.allowUpdateByPhoneWhenNoLine && lineUserId && !oldLine) {
      return {
        ok: false,
        code: 'already_member',
        message: '此電話已經有會員資料',
        member_id: existingByPhone.member.member_id,
        rowIndex: existingByPhone.rowIndex
      };
    }

    const patch = buildUpsertPatch_(existingByPhone.member, input, phoneRaw, phoneInfo, name, lineUserId);
    setMemberObjectToRow_(sh, existingByPhone.rowIndex, patch);
    const member = readMemberObjectAtRow_(sh, existingByPhone.rowIndex);
    logSync_('upsertMainMember', member.member_id, member.phone_normalized, 'success', '電話已存在，更新既有會員');
    return { ok: true, action: 'updated', message: '電話已存在，已更新會員', member: member, rowIndex: existingByPhone.rowIndex };
  }

  if (phoneRaw && phoneInfo.phone_status !== 'valid' && !options.createIfPhoneInvalid && !lineUserId) {
    return { ok: false, code: 'invalid_phone', message: phoneInfo.phone_message };
  }

  const memberId = clean_(input.member_id || input.id) || nextMemberId_();
  const newMember = buildUpsertPatch_({ member_id: memberId }, input, phoneRaw, phoneInfo, name, lineUserId);

  appendMemberRow_(sh, buildMemberRow_(newMember));
  const rowIndex = sh.getLastRow();
  const member = readMemberObjectAtRow_(sh, rowIndex);
  logSync_('upsertMainMember', member.member_id, member.phone_normalized, 'success', '新增會員');

  return { ok: true, action: 'created', message: '新增會員成功', member: member, rowIndex: rowIndex };
}

function buildUpsertPatch_(old, input, phoneRaw, phoneInfo, name, lineUserId) {
  old = old || {};
  input = input || {};

  const hasValidPhone = phoneInfo.phone_status === 'valid';
  const source = clean_(input.member_source) || (lineUserId ? (hasValidPhone ? getSetting_('linked_source', 'linked') : getSetting_('line_only_source', 'line_only')) : getSetting_('pos_source', 'pos'));
  const linkStatus = clean_(input.link_status) || (lineUserId ? (hasValidPhone ? 'linked' : 'line_only') : (hasValidPhone ? 'pos_only' : 'needs_phone'));

  return {
    member_id: clean_(old.member_id || input.member_id || input.id) || nextMemberId_(),
    name: name || old.name || 'LINE會員',
    birthday: clean_(input.birthday || old.birthday),
    email: clean_(input.email || old.email),
    address: clean_(input.address || old.address),
    balance: input.balance !== undefined ? numberOrZero_(input.balance) : numberOrZero_(old.balance),
    point: input.point !== undefined ? numberOrZero_(input.point) : numberOrZero_(old.point),
    level: clean_(old.level || input.level || getSetting_('default_level', 'normal')),
    status: clean_(old.status || input.status || getSetting_('default_status', 'active')),
    note: clean_(input.note || old.note),
    note2: clean_(input.note2 || old.note2),
    new_member_coupon_sent: clean_(input.new_member_coupon_sent || input.issuedCoupon || old.new_member_coupon_sent),
    social_campaign: clean_(input.social_campaign || input.socialCampaign || old.social_campaign),
    line_user_id: lineUserId || clean_(old.line_user_id),
    line_name: clean_(input.line_name || old.line_name || name),
    line_bound: (lineUserId || old.line_user_id) ? 'Y' : clean_(old.line_bound || 'N'),
    bind_time: (lineUserId || old.line_user_id) ? clean_(old.bind_time || input.bind_time || nowText_()) : clean_(old.bind_time),
    last_sync_time: nowText_(),
    member_source: source,
    link_status: linkStatus,
    referrer_line_user_id: clean_(input.referrer_line_user_id || old.referrer_line_user_id),
    my_referral_code: clean_(old.my_referral_code || input.my_referral_code || lineUserId),
    join_method: clean_(old.join_method || input.join_method || input.source || ''),
    social_coupon_sent: clean_(input.social_coupon_sent || old.social_coupon_sent),
    referral_reward_sent: clean_(input.referral_reward_sent || old.referral_reward_sent),
    phone_raw: phoneRaw || clean_(old.phone_raw),
    phone_normalized: hasValidPhone ? phoneInfo.phone_normalized : clean_(old.phone_normalized),
    phone_digits: clean_(phoneInfo.phone_digits || old.phone_digits),
    phone_status: hasValidPhone ? 'valid' : clean_(phoneInfo.phone_status || old.phone_status || 'invalid'),
    phone_message: hasValidPhone ? '電話格式正常' : clean_(phoneInfo.phone_message || old.phone_message || '') ,
    register_time: clean_(old.register_time || input.register_time || input.time || nowText_())
  };
}

function syncLineListToMainMember_(data) {
  initSystem_();

  const sourceSheetName = clean_(data && data.sourceSheet) || SHEET_LINE_SOURCE;
  const sourceSh = openSS_().getSheetByName(sourceSheetName);
  if (!sourceSh) return { ok: false, message: '找不到來源工作表：' + sourceSheetName };

  const values = sourceSh.getDataRange().getValues();
  if (!values || values.length < 2) return { ok: false, message: '來源工作表沒有資料' };

  const headerRowIndex = findBestHeaderRowIndexForLine_(values);
  if (headerRowIndex < 0) return { ok: false, message: '找不到名單表頭，請確認有「姓名 / 電話 / userid」' };

  const headers = values[headerRowIndex].map(function(h) { return clean_(h); });
  const dataRows = values.slice(headerRowIndex + 1);

  const idxName = findHeaderIndexByAliases_(headers, ['姓名', 'name', 'line_name']);
  const idxPhone = findHeaderIndexByAliases_(headers, ['電話', 'phone', 'phone_input', '手機', '手機號碼', '電話號碼']);
  const idxUserId = findHeaderIndexByAliases_(headers, ['userid', 'userId', 'line_user_id', 'line uid', 'uid']);
  const idxTime = findHeaderIndexByAliases_(headers, ['時間', 'time', 'register_time']);
  const idxCoupon = findHeaderIndexByAliases_(headers, ['已發新會員券', 'new_member_coupon_sent']);
  const idxCampaign = findHeaderIndexByAliases_(headers, ['social_campaign', 'campaign']);

  let added = 0;
  let updated = 0;
  let skipped = 0;
  let invalid = 0;
  const notes = [];

  dataRows.forEach(function(r) {
    const name = clean_(safeCell_(r, idxName));
    const phone = clean_(safeCell_(r, idxPhone));
    const userId = clean_(safeCell_(r, idxUserId));
    const time = safeCell_(r, idxTime);
    const coupon = clean_(safeCell_(r, idxCoupon));
    const campaign = clean_(safeCell_(r, idxCampaign));

    if (!name && !phone && !userId) return;

    const phoneInfo = normalizePhoneWithRule_(phone);
    const res = upsertMainMember_({
      name: name,
      line_name: name,
      line_user_id: userId,
      phone_raw: phone,
      phone_normalized: phoneInfo.phone_normalized,
      phone_digits: phoneInfo.phone_digits,
      phone_status: phoneInfo.phone_status,
      phone_message: phoneInfo.phone_message,
      new_member_coupon_sent: coupon,
      social_campaign: campaign,
      register_time: time || nowText_(),
      join_method: 'line_list_sync',
      member_source: phoneInfo.phone_status === 'valid' ? getSetting_('linked_source', 'linked') : getSetting_('line_only_source', 'line_only'),
      link_status: phoneInfo.phone_status === 'valid' ? 'linked' : 'line_only'
    }, {
      allowUpdateByPhoneWhenNoLine: true,
      createIfPhoneInvalid: true
    });

    if (res.ok && res.action === 'created') added++;
    else if (res.ok && res.action === 'updated') updated++;
    else {
      if (res.code === 'invalid_phone') invalid++;
      else skipped++;
      notes.push((name || userId || phone) + '：' + res.message);
    }
  });

  return {
    ok: true,
    message: '名單同步到 Main_member 完成',
    sourceSheet: sourceSheetName,
    added: added,
    updated: updated,
    skipped: skipped,
    invalid: invalid,
    notes: notes.slice(0, 30)
  };
}

/**
 * =========================
 * POS / LINE 匯入
 * =========================
 */
function importPosMembers_(data) {
  initSystem_();

  const sourceSheetName = clean_(data && data.sourceSheet) || SHEET_POS_SOURCE;
  const sourceSh = openSS_().getSheetByName(sourceSheetName);
  if (!sourceSh) return { ok: false, message: '找不到來源工作表：' + sourceSheetName };

  const values = sourceSh.getDataRange().getValues();
  if (!values || values.length < 2) return { ok: false, message: '來源工作表沒有可匯入資料' };

  const headerRowIndex = findHeaderRowIndex_(values, ['姓名']);
  if (headerRowIndex < 0) return { ok: false, message: '找不到 POS 欄位列，請確認有「姓名」欄位' };

  const headers = values[headerRowIndex].map(function(h) { return clean_(h); });
  const dataRows = values.slice(headerRowIndex + 1);

  const idxPhoneMember = findHeaderIndexByAliases_(headers, ['電話(會員編號)', '電話會員編號', 'phone_normalized']);
  const idxPhoneRaw = findHeaderIndexByAliases_(headers, ['電話(未統一格式)', '電話', '手機', 'phone', 'mobile']);
  const idxName = findHeaderIndexByAliases_(headers, ['姓名', 'name']);
  const idxBirthday = findHeaderIndexByAliases_(headers, ['生日', 'birthday']);
  const idxEmail = findHeaderIndexByAliases_(headers, ['Email', 'email']);
  const idxAddress = findHeaderIndexByAliases_(headers, ['地址', 'address']);
  const idxBalance = findHeaderIndexByAliases_(headers, ['餘額', 'balance']);
  const idxNote = findHeaderIndexByAliases_(headers, ['備註', 'note']);
  const idxNote2 = findHeaderIndexByAliases_(headers, ['備註二', 'note2']);

  let imported = 0;
  let updated = 0;
  let invalid = 0;
  let skippedEmpty = 0;

  dataRows.forEach(function(r) {
    const name = clean_(safeCell_(r, idxName));
    const phoneRaw = clean_(safeCell_(r, idxPhoneRaw)) || clean_(safeCell_(r, idxPhoneMember));
    if (!name && !phoneRaw) {
      skippedEmpty++;
      return;
    }

    const phoneInfo = normalizePhoneWithRule_(phoneRaw);
    const res = upsertMainMember_({
      name: name,
      phone_raw: phoneRaw,
      phone_normalized: phoneInfo.phone_normalized,
      phone_digits: phoneInfo.phone_digits,
      phone_status: phoneInfo.phone_status,
      phone_message: phoneInfo.phone_message,
      birthday: formatCellDate_(safeCell_(r, idxBirthday)),
      email: clean_(safeCell_(r, idxEmail)),
      address: clean_(safeCell_(r, idxAddress)),
      balance: numberOrZero_(safeCell_(r, idxBalance)),
      note: clean_(safeCell_(r, idxNote)),
      note2: clean_(safeCell_(r, idxNote2)),
      member_source: getSetting_('pos_source', 'pos'),
      link_status: phoneInfo.phone_status === 'valid' ? 'pos_only' : 'needs_phone',
      join_method: 'pos_import'
    }, {
      allowUpdateByPhoneWhenNoLine: true,
      createIfPhoneInvalid: true
    });

    if (res.ok && res.action === 'created') imported++;
    else if (res.ok && res.action === 'updated') updated++;
    else invalid++;
  });

  return {
    ok: true,
    message: 'POS 會員資料匯入完成',
    sourceSheet: sourceSheetName,
    imported: imported,
    updated: updated,
    invalid: invalid,
    skippedEmpty: skippedEmpty
  };
}

function importLineOldData_(data) {
  data = data || {};
  data.sourceSheet = clean_(data.sourceSheet || SHEET_LINE_SOURCE);
  return syncLineListToMainMember_(data);
}

/**
 * =========================
 * LINE 綁定 / 建立
 * =========================
 */
function bindLineMember_(data) {
  initSystem_();

  const lineUserId = clean_(data.line_user_id || data.userId || data.userid);
  const lineName = clean_(data.line_name || data.name || data.displayName);
  const phoneInput = clean_(data.phone_input || data.phone || data.phone_raw);
  const source = clean_(data.source || 'line');
  const note = clean_(data.note);

  if (!lineUserId) return { ok: false, message: '缺少 line_user_id' };

  const phoneInfo = normalizePhoneWithRule_(phoneInput);
  appendLineBind_(lineUserId, lineName, phoneInput, phoneInfo.phone_normalized, '', phoneInfo.phone_status, nowText_(), source, note ? (phoneInfo.phone_message + '｜' + note) : phoneInfo.phone_message);

  const res = upsertMainMember_({
    line_user_id: lineUserId,
    line_name: lineName,
    name: lineName,
    phone_raw: phoneInput,
    phone_normalized: phoneInfo.phone_normalized,
    phone_digits: phoneInfo.phone_digits,
    phone_status: phoneInfo.phone_status,
    phone_message: phoneInfo.phone_message,
    member_source: phoneInfo.phone_status === 'valid' ? getSetting_('linked_source', 'linked') : getSetting_('line_only_source', 'line_only'),
    link_status: phoneInfo.phone_status === 'valid' ? 'linked' : 'line_only',
    join_method: source,
    note: note,
    register_time: nowText_()
  }, {
    allowUpdateByPhoneWhenNoLine: true,
    createIfPhoneInvalid: true
  });

  if (!res.ok) {
    appendPending_(lineUserId, lineName, phoneInput, phoneInfo.phone_normalized, res.code || 'bind_failed', res.message);
    return res;
  }

  updateLastLineBindStatus_(lineUserId, phoneInfo.phone_normalized, res.member.member_id, res.action === 'created' ? 'created' : 'matched', res.message);

  return {
    ok: true,
    message: res.action === 'created' ? 'LINE 會員已建立' : 'LINE 綁定成功',
    member_id: res.member.member_id,
    name: res.member.name,
    phone_normalized: res.member.phone_normalized,
    member_source: res.member.member_source || ''
  };
}

function registerLineMember_(data) {
  initSystem_();

  const lineUserId = clean_(data.line_user_id || data.userId || data.userid);
  const lineName = clean_(data.line_name || data.name || data.displayName);
  const source = clean_(data.source || 'line');
  const note = clean_(data.note);

  if (!lineUserId) return { ok: false, message: '缺少 line_user_id' };

  const res = upsertMainMember_({
    line_user_id: lineUserId,
    line_name: lineName,
    name: lineName || 'LINE會員',
    phone_raw: '',
    phone_status: 'invalid',
    phone_message: '無電話，僅 LINE 會員',
    note: note || ('來源：' + source),
    member_source: getSetting_('line_only_source', 'line_only'),
    link_status: 'line_only',
    join_method: source,
    register_time: nowText_()
  }, {
    createIfPhoneInvalid: true
  });

  if (!res.ok) return res;

  return {
    ok: true,
    message: res.action === 'created' ? '建立 line_only 會員成功' : 'LINE 會員已存在，已更新',
    member_id: res.member.member_id,
    member_source: res.member.member_source || 'line_only',
    member: res.member
  };
}

function pushLineOnlyMemberByWebhook_(data) {
  return registerLineMember_({
    line_user_id: clean_(data.line_user_id || data.userId || data.userid),
    line_name: clean_(data.line_name || data.name),
    source: clean_(data.source || 'webhook'),
    note: clean_(data.note || 'webhook 建立')
  });
}

function createLegacyLiffMember_(payload) {
  return upsertMainMember_({
    line_user_id: payload.lineUserId,
    line_name: payload.lineName,
    name: payload.lineName,
    phone_raw: payload.phoneInput,
    phone_normalized: payload.phoneInfo && payload.phoneInfo.phone_normalized,
    phone_digits: payload.phoneInfo && payload.phoneInfo.phone_digits,
    phone_status: payload.phoneInfo && payload.phoneInfo.phone_status,
    phone_message: payload.phoneInfo && payload.phoneInfo.phone_message,
    referrer_line_user_id: payload.refUserId,
    my_referral_code: payload.lineUserId,
    join_method: 'LIFF',
    social_campaign: payload.campaign === 'social' ? '是' : '',
    register_time: nowText_()
  }, {
    allowUpdateByPhoneWhenNoLine: true,
    createIfPhoneInvalid: true
  });
}

function upsertLegacyLiffMember_(memberHit, payload) {
  if (!memberHit || !memberHit.ok) return createLegacyLiffMember_(payload);

  const phoneInfo = payload.phoneInfo || normalizePhoneWithRule_(payload.phoneInput);
  const patch = buildUpsertPatch_(memberHit.member, {
    line_user_id: payload.lineUserId,
    line_name: payload.lineName,
    social_campaign: payload.campaign === 'social' ? '是' : '',
    referrer_line_user_id: payload.refUserId,
    join_method: 'LIFF'
  }, payload.phoneInput, phoneInfo, payload.lineName, payload.lineUserId);

  setMemberObjectToRow_(memberHit.sheet, memberHit.rowIndex, patch);
  return { ok: true, member: readMemberObjectAtRow_(memberHit.sheet, memberHit.rowIndex) };
}

/**
 * =========================
 * 查詢 / 建立
 * =========================
 */
function findMember_(data) {
  initSystem_();

  const keyword = clean_(data.keyword);
  const phoneInput = clean_(data.phone_input || data.phone || data.phone_normalized);
  const lineUserId = clean_(data.line_user_id || data.userId || data.userid);
  const memberId = clean_(data.member_id || data.id);
  const phoneInfo = normalizePhoneWithRule_(phoneInput);

  let list = getSheetObjects_(getOrCreateSheet_(openSS_(), SHEET_MEMBERS));

  if (memberId) {
    list = list.filter(function(row) { return clean_(row.member_id).toLowerCase() === memberId.toLowerCase(); });
  } else if (lineUserId) {
    list = list.filter(function(row) { return clean_(row.line_user_id) === lineUserId; });
  } else if (phoneInput) {
    list = list.filter(function(row) { return clean_(row.phone_normalized) === phoneInfo.phone_normalized; });
  } else if (keyword) {
    const kw = keyword.toLowerCase();
    list = list.filter(function(row) {
      return clean_(row.member_id).toLowerCase().indexOf(kw) >= 0 ||
             clean_(row.name).toLowerCase().indexOf(kw) >= 0 ||
             clean_(row.phone_raw).toLowerCase().indexOf(kw) >= 0 ||
             clean_(row.phone_normalized).toLowerCase().indexOf(kw) >= 0 ||
             clean_(row.line_name).toLowerCase().indexOf(kw) >= 0 ||
             clean_(row.line_user_id).toLowerCase().indexOf(kw) >= 0;
    });
  }

  return { ok: true, count: list.length, list: list.slice(0, 100) };
}

function createMember_(data) {
  initSystem_();

  const name = clean_(data.name || data.line_name || data.displayName);
  const phoneRaw = clean_(data.phone_raw || data.phone_input || data.phone);
  const lineUserId = clean_(data.line_user_id || data.userId || data.userid);
  const lineName = clean_(data.line_name || data.name || data.displayName);
  const phoneInfo = normalizePhoneWithRule_(phoneRaw);

  if (!name && !lineUserId) return { ok: false, message: '姓名不可空白，若無姓名至少要有 line_user_id' };

  const res = upsertMainMember_({
    name: name || lineName || 'LINE會員',
    line_name: lineName,
    line_user_id: lineUserId,
    phone_raw: phoneRaw,
    phone_normalized: phoneInfo.phone_normalized,
    phone_digits: phoneInfo.phone_digits,
    phone_status: phoneInfo.phone_status,
    phone_message: phoneInfo.phone_message,
    birthday: clean_(data.birthday),
    email: clean_(data.email),
    address: clean_(data.address),
    balance: numberOrZero_(data.balance),
    point: numberOrZero_(data.point),
    level: clean_(data.level || getSetting_('default_level', 'normal')),
    status: clean_(data.status || getSetting_('default_status', 'active')),
    note: clean_(data.note),
    note2: clean_(data.note2),
    join_method: clean_(data.join_method || 'manual'),
    member_source: phoneInfo.phone_status === 'valid' && lineUserId ? getSetting_('linked_source', 'linked') : (phoneInfo.phone_status === 'valid' ? getSetting_('pos_source', 'pos') : getSetting_('line_only_source', 'line_only')),
    link_status: phoneInfo.phone_status === 'valid' && lineUserId ? 'linked' : (phoneInfo.phone_status === 'valid' ? 'pos_only' : 'line_only'),
    register_time: nowText_()
  }, {
    allowUpdateByPhoneWhenNoLine: false,
    createIfPhoneInvalid: !!lineUserId
  });

  if (!res.ok) return res;

  return {
    ok: true,
    message: res.action === 'created' ? '建立會員成功' : '會員已存在，已更新',
    member_id: res.member.member_id,
    phone_normalized: res.member.phone_normalized,
    member_source: res.member.member_source || ''
  };
}

/**
 * =========================
 * 儲值 / 消費 / 點數
 * =========================
 */
function upsertTopup_(data) {
  initSystem_();

  const memberHit = findMemberForMutation_(data);
  if (!memberHit.ok) return memberHit;

  const amount = numberOrZero_(data.amount);
  if (amount <= 0) return { ok: false, message: '儲值金額需大於 0' };

  const member = memberHit.member;
  const newBalance = numberOrZero_(member.balance) + amount;

  setMemberObjectToRow_(memberHit.sheet, memberHit.rowIndex, { balance: newBalance, last_sync_time: nowText_() });

  getOrCreateSheet_(openSS_(), SHEET_TOPUP).appendRow([
    nowText_(), member.member_id, clean_(member.phone_normalized), amount, newBalance, clean_(data.operator || 'system'), clean_(data.note)
  ]);

  logSync_('upsertTopup', member.member_id, clean_(member.phone_normalized), 'success', '儲值成功');
  return { ok: true, message: '儲值成功', member_id: member.member_id, balance_after: newBalance };
}

function upsertSale_(data) {
  initSystem_();

  const memberHit = findMemberForMutation_(data);
  if (!memberHit.ok) return memberHit;

  const amount = numberOrZero_(data.amount);
  const pointUsed = numberOrZero_(data.point_used);
  const pointEarned = numberOrZero_(data.point_earned);
  if (amount < 0) return { ok: false, message: '消費金額不可小於 0' };

  const member = memberHit.member;
  const newPoint = numberOrZero_(member.point) - pointUsed + pointEarned;

  setMemberObjectToRow_(memberHit.sheet, memberHit.rowIndex, { point: newPoint, last_visit_time: nowText_(), last_sync_time: nowText_() });

  getOrCreateSheet_(openSS_(), SHEET_SALES).appendRow([
    nowText_(), member.member_id, clean_(member.phone_normalized), amount, pointUsed, pointEarned, clean_(data.operator || 'system'), clean_(data.note)
  ]);

  getOrCreateSheet_(openSS_(), SHEET_POINTS).appendRow([
    nowText_(), member.member_id, clean_(member.phone_normalized), -pointUsed + pointEarned, newPoint, 'sale', clean_(data.operator || 'system'), clean_(data.note)
  ]);

  logSync_('upsertSale', member.member_id, clean_(member.phone_normalized), 'success', '消費入帳成功');
  return { ok: true, message: '消費入帳成功', member_id: member.member_id, point_after: newPoint };
}

function adjustPoint_(data) {
  initSystem_();

  const memberHit = findMemberForMutation_(data);
  if (!memberHit.ok) return memberHit;

  const change = numberOrZero_(data.change);
  const type = clean_(data.type || 'manual');
  const member = memberHit.member;
  const newPoint = numberOrZero_(member.point) + change;

  setMemberObjectToRow_(memberHit.sheet, memberHit.rowIndex, { point: newPoint, last_sync_time: nowText_() });

  getOrCreateSheet_(openSS_(), SHEET_POINTS).appendRow([
    nowText_(), member.member_id, clean_(member.phone_normalized), change, newPoint, type, clean_(data.operator || 'system'), clean_(data.note)
  ]);

  logSync_('adjustPoint', member.member_id, clean_(member.phone_normalized), 'success', '點數調整成功');
  return { ok: true, message: '點數調整成功', member_id: member.member_id, point_after: newPoint };
}

function findMemberForMutation_(data) {
  const phoneInput = clean_(data.phone_input || data.phone_normalized || data.phone);
  const lineUserId = clean_(data.line_user_id || data.userId || data.userid);
  const memberId = clean_(data.member_id || data.id);

  if (memberId) return findMemberByMemberId_(memberId);

  if (phoneInput) {
    const phoneInfo = normalizePhoneWithRule_(phoneInput);
    if (phoneInfo.phone_status !== 'valid') return { ok: false, message: phoneInfo.phone_message };
    return findSingleMemberByPhone_(phoneInfo.phone_normalized);
  }

  if (lineUserId) return findMemberByLineUserId_(lineUserId);

  return { ok: false, message: '請提供 phone_input、line_user_id 或 member_id' };
}

/**
 * =========================
 * 查重 / 搜尋會員
 * =========================
 */
function findSingleMemberByPhone_(phoneNormalized) {
  const sh = getOrCreateSheet_(openSS_(), SHEET_MEMBERS);
  ensureMainMemberSheet_(openSS_());
  const rows = getMainMemberObjects_(sh);
  const hits = rows.filter(function(row) {
    return clean_(row.phone_normalized) === clean_(phoneNormalized);
  });

  if (hits.length === 0) return { ok: false, message: '找不到會員' };
  if (hits.length > 1) return { ok: false, message: '同電話對到多筆會員，請人工確認' };

  return { ok: true, member: hits[0], rowIndex: hits[0].__rowIndex, sheet: sh };
}

function findMemberByLineUserId_(lineUserId) {
  if (!clean_(lineUserId)) return { ok: false, message: 'line_user_id 為空' };

  const sh = getOrCreateSheet_(openSS_(), SHEET_MEMBERS);
  ensureMainMemberSheet_(openSS_());
  const rows = getMainMemberObjects_(sh);
  const hits = rows.filter(function(row) {
    return clean_(row.line_user_id) === clean_(lineUserId);
  });

  if (hits.length === 0) return { ok: false, message: '找不到 LINE 會員' };
  if (hits.length > 1) return { ok: false, message: '同 line_user_id 對到多筆會員，請人工確認' };

  return { ok: true, member: hits[0], rowIndex: hits[0].__rowIndex, sheet: sh };
}

function isRealLineUserId_(lineUserId) {
  return /^U[0-9a-f]{32}$/i.test(clean_(lineUserId));
}

function findMemberByMemberId_(memberId) {
  const sh = getOrCreateSheet_(openSS_(), SHEET_MEMBERS);
  ensureMainMemberSheet_(openSS_());
  const rows = getMainMemberObjects_(sh);
  const hits = rows.filter(function(row) {
    return clean_(row.member_id).toLowerCase() === clean_(memberId).toLowerCase();
  });

  if (hits.length !== 1) return { ok: false, message: '找不到 member_id' };
  return { ok: true, member: hits[0], rowIndex: hits[0].__rowIndex, sheet: sh };
}

function getInvalidPhoneList_() {
  initSystem_();
  const members = getSheetObjects_(getOrCreateSheet_(openSS_(), SHEET_MEMBERS));
  const list = members.filter(function(row) {
    return clean_(row.phone_status) !== 'valid';
  });
  return { ok: true, count: list.length, list: list };
}

/**
 * =========================
 * Main_member 讀寫工具
 * =========================
 */
function getMainHeaderInfo_(sh) {
  const maxRows = Math.min(Math.max(sh.getLastRow(), 1), 10);
  const maxCols = Math.max(sh.getLastColumn(), MAIN_MEMBER_REQUIRED_HEADERS.length, 1);
  const values = sh.getRange(1, 1, maxRows, maxCols).getValues();

  for (let r = 0; r < values.length; r++) {
    const row = values[r].map(function(v) { return clean_(v); });
    const hasName = row.indexOf('姓名') >= 0 || row.indexOf('name') >= 0;
    const hasMain = row.indexOf('userid') >= 0 || row.indexOf('id') >= 0 || row.indexOf('電話(未統一格式)') >= 0 || row.indexOf('電話(會員編號)') >= 0;
    if (hasName && hasMain) {
      return {
        headerRow: r + 1,
        headers: row,
        maxCols: maxCols
      };
    }
  }

  throw new Error('找不到 Main_member 表頭列');
}

function getMainMemberObjects_(sh) {
  const info = getMainHeaderInfo_(sh);
  const values = sh.getDataRange().getValues();
  const list = [];

  for (let r = info.headerRow + 1; r <= values.length; r++) {
    const row = values[r - 1];
    const obj = rowToMainMemberObject_(row, info, r);
    if (isEmptyMemberObject_(obj)) continue;
    list.push(obj);
  }

  return list;
}

function rowToMainMemberObject_(row, info, rowIndex) {
  const obj = {};

  Object.keys(MAIN_FIELD_ALIASES).forEach(function(key) {
    obj[key] = getMainValue_(row, info, key);
  });

  const phoneA = clean_(obj.phone_member);
  const phoneRaw = clean_(obj.phone_raw);
  const phoneInfo = normalizePhoneWithRule_(phoneRaw || phoneA);

  obj.member_id = clean_(obj.member_id || obj.id);
  obj.name = clean_(obj.name);
  obj.line_user_id = clean_(obj.line_user_id);
  obj.phone_raw = phoneRaw || phoneA;
  obj.phone_normalized = phoneInfo.phone_status === 'valid' ? phoneInfo.phone_normalized : '';
  obj.phone_digits = clean_(obj.phone_digits || phoneInfo.phone_digits);
  obj.phone_status = clean_(obj.phone_status || phoneInfo.phone_status);
  obj.phone_message = clean_(obj.phone_message || phoneInfo.phone_message);
  obj.balance = numberOrZero_(obj.balance);
  obj.point = numberOrZero_(obj.point);
  obj.level = clean_(obj.level || getSetting_('default_level', 'normal'));
  obj.status = clean_(obj.status || getSetting_('default_status', 'active'));
  obj.line_bound = clean_(obj.line_bound || (obj.line_user_id ? 'Y' : 'N'));
  obj.member_source = clean_(obj.member_source || (obj.line_user_id ? (obj.phone_normalized ? getSetting_('linked_source', 'linked') : getSetting_('line_only_source', 'line_only')) : getSetting_('pos_source', 'pos')));
  obj.link_status = clean_(obj.link_status || (obj.line_user_id ? (obj.phone_normalized ? 'linked' : 'line_only') : (obj.phone_normalized ? 'pos_only' : 'needs_phone')));
  obj.__rowIndex = rowIndex;

  return obj;
}

function readMemberObjectAtRow_(sh, rowIndex) {
  const info = getMainHeaderInfo_(sh);
  const row = sh.getRange(rowIndex, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  return rowToMainMemberObject_(row, info, rowIndex);
}

function setMemberObjectToRow_(sh, rowIndex, patch) {
  const info = getMainHeaderInfo_(sh);
  const oldRow = sh.getRange(rowIndex, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  const oldObj = rowToMainMemberObject_(oldRow, info, rowIndex);
  const nextObj = mergeObjects_(oldObj, patch || {});
  const nextRow = buildMemberRow_(nextObj);
  sh.getRange(rowIndex, 1, 1, nextRow.length).setValues([nextRow]);
}

function buildMemberRow_(objA, objB, objC) {
  const sh = getOrCreateSheet_(openSS_(), SHEET_MEMBERS);
  ensureMainMemberSheet_(openSS_());
  const info = getMainHeaderInfo_(sh);
  const obj = mergeObjects_(objA || {}, objB || {}, objC || {});
  const row = new Array(Math.max(sh.getLastColumn(), info.headers.length)).fill('');

  setMainValue_(row, info, 'member_id', obj.member_id || obj.id);
  setMainValue_(row, info, 'name', obj.name || obj.line_name || 'LINE會員');
  setMainValue_(row, info, 'birthday', obj.birthday);
  setMainValue_(row, info, 'email', obj.email);
  setMainValue_(row, info, 'address', obj.address);
  setMainValue_(row, info, 'balance', obj.balance);
  setMainValue_(row, info, 'point', obj.point);
  setMainValue_(row, info, 'level', obj.level);
  setMainValue_(row, info, 'status', obj.status);
  setMainValue_(row, info, 'note', obj.note);
  setMainValue_(row, info, 'note2', obj.note2);
  setMainValue_(row, info, 'new_member_coupon_sent', obj.new_member_coupon_sent);
  setMainValue_(row, info, 'social_campaign', obj.social_campaign);
  setMainValue_(row, info, 'line_user_id', obj.line_user_id);
  setMainValue_(row, info, 'line_name', obj.line_name);
  setMainValue_(row, info, 'line_bound', obj.line_bound);
  setMainValue_(row, info, 'bind_time', obj.bind_time);
  setMainValue_(row, info, 'last_sync_time', obj.last_sync_time);
  setMainValue_(row, info, 'member_source', obj.member_source);
  setMainValue_(row, info, 'link_status', obj.link_status);
  setMainValue_(row, info, 'referrer_line_user_id', obj.referrer_line_user_id);
  setMainValue_(row, info, 'my_referral_code', obj.my_referral_code);
  setMainValue_(row, info, 'join_method', obj.join_method);
  setMainValue_(row, info, 'social_coupon_sent', obj.social_coupon_sent);
  setMainValue_(row, info, 'referral_reward_sent', obj.referral_reward_sent);
  setMainValue_(row, info, 'phone_status', obj.phone_status);
  setMainValue_(row, info, 'phone_message', obj.phone_message);
  setMainValue_(row, info, 'phone_digits', obj.phone_digits);

  // 最新規則：電話寫後面「電話(未統一格式)」欄位，不寫前面「電話(會員編號)」。
  setMainValue_(row, info, 'phone_raw', obj.phone_raw || obj.phone || obj.phone_input || '');

  setMainValue_(row, info, 'register_time', obj.register_time || obj.time || nowText_());

  return row;
}

function appendMemberRow_(sh, row) {
  sh.appendRow(row);
}

function getMainValue_(row, info, key) {
  const col = findColByAliases_(info, MAIN_FIELD_ALIASES[key] || [key]);
  if (col <= 0) return '';
  return row[col - 1];
}

function setMainValue_(row, info, key, value) {
  const col = findColByAliases_(info, MAIN_FIELD_ALIASES[key] || [key]);
  if (col <= 0) return;
  row[col - 1] = value === undefined || value === null ? '' : value;
}

function findColByAliases_(info, aliases) {
  const normalizedAliases = aliases.map(function(a) { return normalizeHeader_(a); });
  for (let i = 0; i < info.headers.length; i++) {
    if (normalizedAliases.indexOf(normalizeHeader_(info.headers[i])) >= 0) return i + 1;
  }
  return -1;
}

function isEmptyMemberObject_(obj) {
  return !clean_(obj.member_id) && !clean_(obj.name) && !clean_(obj.phone_raw) && !clean_(obj.line_user_id);
}

/**
 * =========================
 * line綁定 / 待確認 / 紀錄
 * =========================
 */
function appendLineBind_(lineUserId, lineName, phoneInput, phoneNormalized, matchedMemberId, status, bindTime, source, note) {
  getOrCreateSheet_(openSS_(), SHEET_LINE_BIND).appendRow([
    lineUserId, lineName, phoneInput, phoneNormalized, matchedMemberId, status, bindTime, source, note
  ]);
}

function appendPending_(lineUserId, lineName, phoneInput, phoneNormalized, status, note) {
  getOrCreateSheet_(openSS_(), SHEET_PENDING).appendRow([
    lineUserId, lineName, phoneInput, phoneNormalized, status, nowText_(), note
  ]);
}

function updateLastLineBindStatus_(lineUserId, phoneNormalized, memberId, status, note) {
  const sh = getOrCreateSheet_(openSS_(), SHEET_LINE_BIND);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0].map(function(h) { return clean_(h); });
  const idxLineUserId = headers.indexOf('line_user_id');
  const idxPhoneNormalized = headers.indexOf('phone_normalized');
  const idxMatched = headers.indexOf('matched_member_id');
  const idxStatus = headers.indexOf('status');
  const idxNote = headers.indexOf('note');

  for (let i = values.length - 1; i >= 1; i--) {
    const rowLineUserId = clean_(values[i][idxLineUserId]);
    const rowPhoneNormalized = idxPhoneNormalized >= 0 ? clean_(values[i][idxPhoneNormalized]) : '';

    if (rowLineUserId === clean_(lineUserId) && rowPhoneNormalized === clean_(phoneNormalized)) {
      if (idxMatched >= 0) sh.getRange(i + 1, idxMatched + 1).setValue(memberId);
      if (idxStatus >= 0) sh.getRange(i + 1, idxStatus + 1).setValue(status);
      if (idxNote >= 0) sh.getRange(i + 1, idxNote + 1).setValue(note);
      break;
    }
  }
}

function markMemberFlags_(memberId, patch) {
  const hit = findMemberByMemberId_(memberId);
  if (!hit.ok) return false;
  setMemberObjectToRow_(hit.sheet, hit.rowIndex, mergeObjects_(patch || {}, { last_sync_time: nowText_() }));
  return true;
}

function logSync_(action, memberId, phoneNormalized, result, message) {
  try {
    const sh = getOrCreateSheet_(openSS_(), SHEET_SYNC_LOG);
    ensureSheet_(openSS_(), SHEET_SYNC_LOG, SYNC_LOG_HEADERS);
    sh.appendRow([nowText_(), action || '', memberId || '', phoneNormalized || '', result || '', message || '']);
  } catch (err) {
    Logger.log('logSync error: ' + getErrorMessage_(err));
  }
}

/**
 * =========================
 * 發券
 * =========================
 */
function sendCoupon_(token, userId, text, url) {
  if (!token || !userId) return;

  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text: text + '\n' + url }],
      notificationDisabled: false
    }),
    muteHttpExceptions: true
  });
}

/**
 * =========================
 * 電話規則
 * =========================
 */
function normalizePhoneWithRule_(raw) {
  const source = clean_(raw);
  const digits = source.replace(/\D/g, '');

  if (!digits) {
    return { phone_raw: source, phone_digits: '', phone_normalized: '', phone_status: 'invalid', phone_message: '電話為空白，未寫入' };
  }

  if (digits.length < 9) {
    return { phone_raw: source, phone_digits: digits, phone_normalized: '', phone_status: 'invalid', phone_message: '數字不足 9 碼，未寫入' };
  }

  let work = digits;
  if (work.indexOf('886') === 0 && work.length >= 12) work = '0' + work.slice(3);

  const last9 = work.slice(-9);
  if (last9.charAt(0) !== '9') {
    return { phone_raw: source, phone_digits: digits, phone_normalized: '', phone_status: 'needs_review', phone_message: '後 9 碼首位不是 9，請人工確認' };
  }

  return { phone_raw: source, phone_digits: digits, phone_normalized: '0' + last9, phone_status: 'valid', phone_message: '電話格式正常' };
}

/**
 * =========================
 * 一般工作表工具
 * =========================
 */
function getSheetObjects_(sh) {
  if (sh.getName() === SHEET_MEMBERS) return getMainMemberObjects_(sh);

  const values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return [];

  const headers = values[0].map(function(h) { return clean_(h); });
  const list = [];

  for (let i = 1; i < values.length; i++) {
    const obj = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = values[i][j];
    list.push(obj);
  }

  return list;
}

function ensureSheet_(ss, sheetName, headers) {
  if (sheetName === SHEET_MEMBERS) return ensureMainMemberSheet_(ss);

  const sh = getOrCreateSheet_(ss, sheetName);
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();

  if (lastRow === 0 || lastCol === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    return sh;
  }

  const currentHeaders = sh.getRange(1, 1, 1, Math.max(lastCol, headers.length)).getValues()[0];
  let needsRewrite = false;
  for (let i = 0; i < headers.length; i++) {
    if (clean_(currentHeaders[i]) !== clean_(headers[i])) {
      needsRewrite = true;
      break;
    }
  }

  if (needsRewrite && lastRow <= 1) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  sh.setFrozenRows(1);
  return sh;
}

function getOrCreateSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function openSS_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function parseRequest_(e) {
  if (!e) return {};
  if (e.postData && e.postData.contents) {
    const txt = e.postData.contents;
    try {
      return JSON.parse(txt);
    } catch (err) {
      return e.parameter || {};
    }
  }
  return e.parameter || {};
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getConfig(key) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_CONFIG);
  if (!sheet) return '';

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (clean_(data[i][0]) === clean_(key)) return clean_(data[i][1]);
  }
  return '';
}

function getSetting_(key, fallback) {
  const sh = getOrCreateSheet_(openSS_(), SHEET_SETTINGS);
  const values = sh.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (clean_(values[i][0]) === clean_(key)) return clean_(values[i][1]) || fallback;
  }

  return fallback;
}

function nextMemberId_() {
  const prefix = DEFAULT_MEMBER_ID_PREFIX;
  const rows = getSheetObjects_(getOrCreateSheet_(openSS_(), SHEET_MEMBERS));
  let maxNum = DEFAULT_MEMBER_ID_START;

  rows.forEach(function(row) {
    const id = clean_(row.member_id);
    const m = id.match(/(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
  });

  return prefix + padNum_(maxNum + 1, DEFAULT_MEMBER_ID_PAD);
}

function findHeaderRowIndex_(values, requiredHeaders) {
  for (let i = 0; i < values.length; i++) {
    const row = values[i].map(function(v) { return clean_(v); });
    const ok = requiredHeaders.every(function(h) { return row.indexOf(clean_(h)) >= 0; });
    if (ok) return i;
  }
  return -1;
}

function findBestHeaderRowIndexForLine_(values) {
  for (let i = 0; i < values.length; i++) {
    const row = values[i].map(function(v) { return normalizeHeader_(v); });
    let score = 0;
    if (hasAnyAlias_(row, ['line_user_id', 'userid', 'user_id', 'lineuid', 'uid', 'lineid'])) score += 3;
    if (hasAnyAlias_(row, ['line_name', 'display_name', 'displayname', '顯示名稱', '暱稱', '姓名', 'name'])) score += 2;
    if (hasAnyAlias_(row, ['phone_input', 'phone', 'mobile', '手機', '電話', '手機號碼', '電話號碼', '聯絡電話'])) score += 3;
    if (score >= 4) return i;
  }
  return -1;
}

function findHeaderIndexByAliases_(headers, aliases) {
  const normalizedHeaders = headers.map(function(h) { return normalizeHeader_(h); });
  const normalizedAliases = aliases.map(function(a) { return normalizeHeader_(a); });
  for (let i = 0; i < normalizedHeaders.length; i++) {
    if (normalizedAliases.indexOf(normalizedHeaders[i]) >= 0) return i;
  }
  return -1;
}

function hasAnyAlias_(normalizedHeaders, aliases) {
  const normalizedAliases = aliases.map(function(a) { return normalizeHeader_(a); });
  return normalizedHeaders.some(function(h) { return normalizedAliases.indexOf(h) >= 0; });
}

function normalizeHeader_(v) {
  return clean_(v).toLowerCase().replace(/\s+/g, '').replace(/[\(\)\[\]【】_\-]/g, '');
}

function mergeObjects_() {
  const out = {};
  for (let i = 0; i < arguments.length; i++) {
    const item = arguments[i] || {};
    Object.keys(item).forEach(function(k) {
      if (item[k] !== undefined) out[k] = item[k];
    });
  }
  return out;
}

function rowArrayToObject_(headers, row) {
  const obj = {};
  headers.forEach(function(h, i) { obj[h] = row[i]; });
  return obj;
}

function nowText_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
}


function formatCellDate_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  }
  return clean_(v);
}

function numberOrZero_(v) {
  const n = Number(String(v == null ? '' : v).replace(/,/g, '').trim());
  return isNaN(n) ? 0 : n;
}

function clean_(v) {
  return String(v == null ? '' : v).trim();
}

function safeCell_(row, idx) {
  if (!row || idx < 0 || idx >= row.length) return '';
  return row[idx];
}

function padNum_(n, len) {
  let s = String(n);
  while (s.length < len) s = '0' + s;
  return s;
}

function getErrorMessage_(err) {
  if (!err) return 'unknown error';
  if (err.message) return err.message;
  return String(err);
}

/**
 * =========================
 * 手動工具
 * =========================
 */
function 手動初始化系統() {
  Logger.log(JSON.stringify(initSystem_()));
}

function 手動同步名單到MainMember() {
  Logger.log(JSON.stringify(syncLineListToMainMember_({ sourceSheet: '名單' })));
}

function 手動匯入POS會員資料() {
  Logger.log(JSON.stringify(importPosMembers_({ sourceSheet: SHEET_POS_SOURCE })));
}

function 手動匯入LINE舊資料() {
  Logger.log(JSON.stringify(importLineOldData_({ sourceSheet: SHEET_LINE_SOURCE })));
}

function 手動建立LINE會員_測試() {
  Logger.log(JSON.stringify(registerLineMember_({
    line_user_id: 'U_test_001',
    line_name: 'LINE測試會員',
    source: 'manual_test',
    note: '手動測試'
  })));
}

function 手動測試_LIFF加入() {
  Logger.log(JSON.stringify(legacyLiffJoinCore_({
    userId: 'U_test_join_001',
    name: 'LIFF測試會員',
    phone: '0912-345-678',
    refUserId: '',
    campaign: 'social'
  })));
}

function 手動查看異常電話() {
  Logger.log(JSON.stringify(getInvalidPhoneList_()));
}
