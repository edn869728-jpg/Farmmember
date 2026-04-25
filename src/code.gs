/**
 * code.gs — Farmmember Google Apps Script backend
 *
 * Endpoints (deployed as Web App, access: Anyone):
 *   GET  ?action=get_member&line_user_id=Uxxxxx
 *   GET  ?action=get_weather
 *   POST body JSON: { action, ...params }
 *
 * POST actions:
 *   bind_phone   – save phone number for a LINE user (new or existing member)
 *   add_points   – called by iPhone Shortcut after QR-code scan (amount ÷ 5 = points)
 *   sync_farm    – overwrite farm columns from frontend state
 *   water        – record today's watering event
 *
 * Spreadsheet column mapping (1-indexed, sheet "members"):
 *   A  member_id          B  name               C  phone_normalized
 *   D  phone_raw          E  phone_digits        F  phone_status
 *   G  phone_message      H  birthday            I  email
 *   J  address            K  balance             L  point
 *   M  level              N  status              O  register_time
 *   P  last_visit_time    Q  note                R  note2
 *   S  line_user_id       T  line_name           U  line_bound
 *   V  bind_time          W  last_sync_time      X  member_source
 *   Y  link_status        Z  referrer_line_user_id
 *   AA my_referral_code   AB join_method         AC new_member_coupon
 *   AD social_campaign    AE social_coupon       AF referral_reward
 *   AG farm_plots         AH farm_last_watered   AI farm_consecutive_no_water
 *   AJ cabbage_points     AK carrot_points       AL corn_points
 *   AM watermelon_points  AN strawberry_points   AO point_expire_at
 */

// ─── CONFIGURATION ───────────────────────────────────────────────────────────
// Store these values in Apps Script → Project Settings → Script Properties:
//   SPREADSHEET_ID, LINE_CHANNEL_ACCESS_TOKEN, CWA_API_KEY
// Fallback to placeholder strings so the script does not throw on first deploy.
const _props = PropertiesService.getScriptProperties();
const SPREADSHEET_ID            = _props.getProperty('SPREADSHEET_ID')            || 'YOUR_SPREADSHEET_ID';
const LINE_CHANNEL_ACCESS_TOKEN = _props.getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '';
const CWA_API_KEY               = _props.getProperty('CWA_API_KEY')               || '';
const PULI_STATION_ID           = 'C0I090'; // 埔里氣象站
const SHEET_NAME                = 'members';

// Column indices (1-based)
const COL = {
  member_id:                1,
  name:                     2,
  phone_normalized:         3,
  phone_raw:                4,
  phone_digits:             5,
  phone_status:             6,
  phone_message:            7,
  birthday:                 8,
  email:                    9,
  address:                 10,
  balance:                 11,
  point:                   12,
  level:                   13,
  status:                  14,
  register_time:           15,
  last_visit_time:         16,
  note:                    17,
  note2:                   18,
  line_user_id:            19,
  line_name:               20,
  line_bound:              21,
  bind_time:               22,
  last_sync_time:          23,
  member_source:           24,
  link_status:             25,
  referrer_line_user_id:   26,
  my_referral_code:        27,
  join_method:             28,
  new_member_coupon:       29,
  social_campaign:         30,
  social_coupon:           31,
  referral_reward:         32,
  farm_plots:              33,
  farm_last_watered:       34,
  farm_consecutive_no_water: 35,
  cabbage_points:          36,
  carrot_points:           37,
  corn_points:             38,
  watermelon_points:       39,
  strawberry_points:       40,
  point_expire_at:         41,
};

// Total number of columns in the sheet (extend if needed)
const TOTAL_COLS = 41;

// ─── CORS helper ─────────────────────────────────────────────────────────────
function buildResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── doGet ───────────────────────────────────────────────────────────────────
function doGet(e) {
  const action = e.parameter.action || '';
  try {
    if (action === 'get_member') {
      return handleGetMember(e.parameter.line_user_id);
    }
    if (action === 'get_weather') {
      return handleGetWeather();
    }
    return buildResponse({ success: false, error: 'Unknown action' });
  } catch (err) {
    return buildResponse({ success: false, error: err.message });
  }
}

// ─── doPost ──────────────────────────────────────────────────────────────────
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (_) {
    return buildResponse({ success: false, error: 'Invalid JSON' });
  }

  try {
    switch (body.action) {
      case 'bind_phone':  return handleBindPhone(body);
      case 'add_points':  return handleAddPoints(body);
      case 'sync_farm':   return handleSyncFarm(body);
      case 'water':       return handleWater(body);
      default:
        return buildResponse({ success: false, error: 'Unknown action' });
    }
  } catch (err) {
    return buildResponse({ success: false, error: err.message });
  }
}

// ─── SHEET HELPERS ───────────────────────────────────────────────────────────

function getSheet() {
  return SpreadsheetApp
    .openById(SPREADSHEET_ID)
    .getSheetByName(SHEET_NAME);
}

/**
 * Find a row by LINE user ID (column S = index 19).
 * Returns { row: Number, data: Array } or null.
 */
function findMemberRow(lineUserId) {
  const sheet = getSheet();
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {       // skip header row (row 0)
    if (String(data[i][COL.line_user_id - 1]) === lineUserId) {
      return { row: i + 1, data: data[i] };      // 1-based row number
    }
  }
  return null;
}

function rowToMemberObject(row) {
  return {
    member_id:                row[COL.member_id               - 1],
    name:                     row[COL.name                    - 1],
    phone:                    row[COL.phone_normalized         - 1] || row[COL.phone_raw - 1],
    point:                    Number(row[COL.point             - 1]) || 0,
    level:                    Number(row[COL.level             - 1]) || 1,
    line_user_id:             row[COL.line_user_id             - 1],
    line_name:                row[COL.line_name                - 1],
    farm_plots:               row[COL.farm_plots               - 1] || null,
    farm_last_watered:        row[COL.farm_last_watered        - 1] || null,
    farm_consecutive_no_water: Number(row[COL.farm_consecutive_no_water - 1]) || 0,
    cabbage_points:           Number(row[COL.cabbage_points    - 1]) || 0,
    carrot_points:            Number(row[COL.carrot_points     - 1]) || 0,
    corn_points:              Number(row[COL.corn_points       - 1]) || 0,
    watermelon_points:        Number(row[COL.watermelon_points - 1]) || 0,
    strawberry_points:        Number(row[COL.strawberry_points - 1]) || 0,
    point_expire_at:          row[COL.point_expire_at          - 1] || null,
  };
}

// ─── GET MEMBER ──────────────────────────────────────────────────────────────
function handleGetMember(lineUserId) {
  if (!lineUserId) return buildResponse({ success: false, error: 'Missing line_user_id' });

  const found = findMemberRow(lineUserId);
  if (!found) return buildResponse({ success: true, member: null });

  const memberObj = rowToMemberObject(found.data);

  // Auto-expire points that are past the expiry date
  if (memberObj.point_expire_at) {
    const expiry = new Date(memberObj.point_expire_at);
    if (expiry < new Date()) {
      const sheet = getSheet();
      sheet.getRange(found.row, COL.point).setValue(0);
      memberObj.point = 0;
    }
  }

  return buildResponse({ success: true, member: memberObj });
}

// ─── BIND PHONE ──────────────────────────────────────────────────────────────
function handleBindPhone(body) {
  const { line_user_id, line_name, phone } = body;
  if (!line_user_id || !phone) {
    return buildResponse({ success: false, error: 'Missing required fields' });
  }

  const sheet    = getSheet();
  const found    = findMemberRow(line_user_id);
  const now      = new Date();
  const todayStr = Utilities.formatDate(now, 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');

  if (found) {
    // Update existing row
    sheet.getRange(found.row, COL.phone_normalized).setValue(phone);
    sheet.getRange(found.row, COL.phone_raw).setValue(phone);
    sheet.getRange(found.row, COL.line_name).setValue(line_name || '');
    sheet.getRange(found.row, COL.line_bound).setValue(true);
    sheet.getRange(found.row, COL.bind_time).setValue(todayStr);
    sheet.getRange(found.row, COL.last_sync_time).setValue(todayStr);
  } else {
    // Create new member row
    const newRow = new Array(TOTAL_COLS).fill('');
    const memberId = 'M' + now.getTime();
    newRow[COL.member_id         - 1] = memberId;
    newRow[COL.phone_normalized  - 1] = phone;
    newRow[COL.phone_raw         - 1] = phone;
    newRow[COL.point             - 1] = 0;
    newRow[COL.level             - 1] = 1;
    newRow[COL.status            - 1] = 'active';
    newRow[COL.register_time     - 1] = todayStr;
    newRow[COL.last_visit_time   - 1] = todayStr;
    newRow[COL.last_sync_time    - 1] = todayStr;
    newRow[COL.line_user_id      - 1] = line_user_id;
    newRow[COL.line_name         - 1] = line_name || '';
    newRow[COL.line_bound        - 1] = true;
    newRow[COL.bind_time         - 1] = todayStr;
    newRow[COL.member_source     - 1] = 'LIFF';
    sheet.appendRow(newRow);
  }

  return buildResponse({ success: true });
}

// ─── ADD POINTS (iPhone Shortcut → QR scan) ──────────────────────────────────
/**
 * Expected body: { action: "add_points", line_user_id, amount }
 * amount = consumption in NTD; points = Math.floor(amount / 5)
 */
function handleAddPoints(body) {
  const { line_user_id, amount } = body;
  if (!line_user_id || amount === undefined) {
    return buildResponse({ success: false, error: 'Missing required fields' });
  }

  const pts   = Math.floor(Number(amount) / 5);
  if (pts <= 0) return buildResponse({ success: false, error: 'Amount too small' });

  const found = findMemberRow(line_user_id);
  if (!found) return buildResponse({ success: false, error: 'Member not found' });

  const sheet       = getSheet();
  const currentPts  = Number(found.data[COL.point - 1]) || 0;
  const newPts      = currentPts + pts;
  // Rolling 1-year expiry: each new transaction extends the expiry date to 1 year
  // from now (whole balance shares a single expiry for simplicity).
  const expireDate  = new Date();
  expireDate.setFullYear(expireDate.getFullYear() + 1);
  const expireStr   = Utilities.formatDate(expireDate, 'Asia/Taipei', 'yyyy-MM-dd');
  const now         = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');

  sheet.getRange(found.row, COL.point).setValue(newPts);
  sheet.getRange(found.row, COL.point_expire_at).setValue(expireStr);
  sheet.getRange(found.row, COL.last_visit_time).setValue(now);
  sheet.getRange(found.row, COL.last_sync_time).setValue(now);

  // LINE push notification: points added
  try {
    notifyPointsAdded(line_user_id, pts, newPts);
  } catch (e) { /* non-fatal */ }

  // 30-day expiry reminder check (send if within 30 days of expiry)
  try {
    checkAndNotifyExpiring(line_user_id, newPts, expireStr);
  } catch (e) { /* non-fatal */ }

  return buildResponse({ success: true, added: pts, total: newPts });
}

// ─── SYNC FARM ───────────────────────────────────────────────────────────────
function handleSyncFarm(body) {
  const { line_user_id } = body;
  if (!line_user_id) return buildResponse({ success: false, error: 'Missing line_user_id' });

  const found = findMemberRow(line_user_id);
  if (!found) return buildResponse({ success: false, error: 'Member not found' });

  const sheet = getSheet();
  const row   = found.row;
  const now   = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');

  if (body.farm_plots               !== undefined) sheet.getRange(row, COL.farm_plots).setValue(body.farm_plots);
  if (body.farm_last_watered        !== undefined) sheet.getRange(row, COL.farm_last_watered).setValue(body.farm_last_watered || '');
  if (body.farm_consecutive_no_water !== undefined) sheet.getRange(row, COL.farm_consecutive_no_water).setValue(Number(body.farm_consecutive_no_water) || 0);
  if (body.cabbage_points           !== undefined) sheet.getRange(row, COL.cabbage_points).setValue(Number(body.cabbage_points) || 0);
  if (body.carrot_points            !== undefined) sheet.getRange(row, COL.carrot_points).setValue(Number(body.carrot_points) || 0);
  if (body.corn_points              !== undefined) sheet.getRange(row, COL.corn_points).setValue(Number(body.corn_points) || 0);
  if (body.watermelon_points        !== undefined) sheet.getRange(row, COL.watermelon_points).setValue(Number(body.watermelon_points) || 0);
  if (body.strawberry_points        !== undefined) sheet.getRange(row, COL.strawberry_points).setValue(Number(body.strawberry_points) || 0);
  if (body.points                   !== undefined) sheet.getRange(row, COL.point).setValue(Number(body.points) || 0);
  if (body.level                    !== undefined) sheet.getRange(row, COL.level).setValue(Number(body.level) || 1);

  sheet.getRange(row, COL.last_sync_time).setValue(now);

  return buildResponse({ success: true });
}

// ─── WATER ───────────────────────────────────────────────────────────────────
function handleWater(body) {
  const { line_user_id, date } = body;
  if (!line_user_id) return buildResponse({ success: false, error: 'Missing line_user_id' });

  const found = findMemberRow(line_user_id);
  if (!found) return buildResponse({ success: false, error: 'Member not found' });

  const sheet = getSheet();
  sheet.getRange(found.row, COL.farm_last_watered).setValue(date || '');
  sheet.getRange(found.row, COL.farm_consecutive_no_water).setValue(0);

  return buildResponse({ success: true });
}

// ─── WEATHER (CWA open data – 埔里站 C0I090) ─────────────────────────────────
function handleGetWeather() {
  const cached = CacheService.getScriptCache().get('puli_weather');
  if (cached) {
    return buildResponse(JSON.parse(cached));
  }

  const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0003-001` +
    `?Authorization=${CWA_API_KEY}&StationId=${PULI_STATION_ID}&format=JSON`;

  let result = { success: false, temperature: null, rainfall: null, description: '' };

  try {
    const resp    = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const json    = JSON.parse(resp.getContentText());
    const station = json.records && json.records.Station && json.records.Station[0];

    if (station) {
      const elem        = station.WeatherElement || {};
      // CWA O-A0003-001: AirTemperature is a top-level number; precipitation is
      // nested under `Now.Precipitation` in the current schema. Support both
      // current and legacy layouts so the call works either way.
      const tempRaw     = (elem.AirTemperature !== undefined) ? elem.AirTemperature : null;
      // Precipitation lives under `Now.Precipitation` in the current schema; fall back to legacy top-level field.
      let rainRaw = (elem.Now && elem.Now.Precipitation !== undefined) ? elem.Now.Precipitation : undefined;
      if (rainRaw === undefined) rainRaw = (elem.Precipitation !== undefined) ? elem.Precipitation : 0;
      let temperature   = parseFloat(tempRaw);
      let rainfall      = parseFloat(rainRaw);
      if (!isFinite(temperature) || temperature < -50) temperature = null;
      // CWA uses -99 / -991 etc. as "missing data" sentinels – treat as 0
      if (!isFinite(rainfall) || rainfall < 0) rainfall = 0;

      result = {
        success:     true,
        temperature: temperature,
        rainfall:    rainfall,
        description: buildWeatherDescription(temperature, rainfall),
      };
    }
  } catch (e) {
    result.error = e.message;
  }

  // Cache for 1 hour (3600 seconds) to avoid hammering the API
  CacheService.getScriptCache().put('puli_weather', JSON.stringify(result), 3600);
  return buildResponse(result);
}

function buildWeatherDescription(temp, rain) {
  let desc = '';
  if (temp !== null) desc += `氣溫 ${temp}°C`;
  if (rain > 100)    desc += '　極端豪雨';
  else if (rain >= 80) desc += '　大豪雨';
  else if (rain >= 50) desc += '　豪雨';
  else if (rain >= 25) desc += '　大雨';
  else if (rain >= 10) desc += '　中雨';
  else if (rain > 0)   desc += '　小雨';
  else                 desc += '　晴天/陰天';
  return desc;
}

// ─── DAILY TRIGGER (set via Apps Script Triggers) ────────────────────────────
/**
 * Run once per day (e.g. 07:00 Asia/Taipei).
 * – Clears weather cache so fresh data is fetched.
 * – Sends rain/drought notifications to all members.
 */
function dailyTrigger() {
  // Clear weather cache so the next GET will fetch fresh data
  CacheService.getScriptCache().remove('puli_weather');

  // Fetch fresh weather
  const weatherResp = JSON.parse(handleGetWeather().getContent());
  if (!weatherResp.success) return;

  const rain = weatherResp.rainfall    || 0;
  const temp = weatherResp.temperature || 25;

  const sheet = getSheet();
  const data  = sheet.getDataRange().getValues();
  const today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');

  for (let i = 1; i < data.length; i++) {
    const row       = data[i];
    const userId    = String(row[COL.line_user_id - 1]);
    if (!userId || userId === '') continue;

    const lastWatered = String(row[COL.farm_last_watered        - 1] || '');
    const noWaterDays = Number(row[COL.farm_consecutive_no_water - 1]) || 0;
    const farmPlotsRaw = row[COL.farm_plots - 1];

    // Only notify members who have active crops
    let hasActiveCrops = false;
    if (farmPlotsRaw) {
      try {
        const plots = JSON.parse(farmPlotsRaw);
        hasActiveCrops = plots.some(p => p.status === 'growing');
      } catch (_) {}
    }
    if (!hasActiveCrops) continue;

    // Heavy rain notification
    if (rain >= 100) {
      sendLineNotification(userId, '⚠️ 今日極端豪雨（>100mm），所有作物已死亡，請到農場查看 🥀');
    } else if (rain >= 80) {
      sendLineNotification(userId, `⛈ 今日大豪雨（${rain}mm），作物存活率 20%，請注意損失！`);
    } else if (rain >= 50) {
      sendLineNotification(userId, `🌧 今日豪雨（${rain}mm），作物存活率 80%，請注意損失！`);
    } else if (rain >= 25) {
      sendLineNotification(userId, `🌦 今天大雨（${rain}mm），不需要澆水！作物加速成長 ×1.6 🌱`);
    }

    // Drought warning – notify the day BEFORE the death threshold so the player
    // still has a chance to open the app and water.
    const droughtLimit = temp > 30 ? 3 : 5;
    if (noWaterDays >= droughtLimit - 1 && lastWatered !== today) {
      sendLineNotification(userId, `☀️ 您的作物已連續 ${noWaterDays} 天未澆水，明天若不澆水將枯萎 🥀 請盡快到農場澆水！`);
    }

    // Expiry reminder (30 days before)
    const expireAt  = String(row[COL.point_expire_at - 1] || '');
    const points    = Number(row[COL.point - 1]) || 0;
    if (expireAt && points > 0) {
      const expDate   = new Date(expireAt);
      const diffDays  = Math.round((expDate - new Date()) / 86400000);
      if (diffDays === 30) {
        sendLineNotification(userId, `⏰ 提醒：您有 ${points} 點將在 30 天後到期，記得到店使用喔！`);
      }
    }
  }
}
