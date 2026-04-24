/**
 * notify.gs — LINE push notification helpers for Farmmember
 *
 * Uses LINE Messaging API (Push Message).
 * Requires LINE_CHANNEL_ACCESS_TOKEN to be set in code.gs.
 *
 * Usage from other .gs files:
 *   sendLineNotification(lineUserId, '訊息內容');
 *   notifyPointsAdded(lineUserId, addedPts, totalPts);
 *   checkAndNotifyExpiring(lineUserId, totalPts, expireDateStr);
 */

// ─── CORE PUSH HELPER ────────────────────────────────────────────────────────

/**
 * Send a plain-text push message to one LINE user.
 * @param {string} lineUserId  – e.g. "Uxxxxxxxxxx"
 * @param {string} text        – message body
 */
function sendLineNotification(lineUserId, text) {
  if (!lineUserId || !text) return;
  if (!LINE_CHANNEL_ACCESS_TOKEN || LINE_CHANNEL_ACCESS_TOKEN === 'YOUR_LINE_CHANNEL_ACCESS_TOKEN') {
    Logger.log('[notify] LINE token not configured – skipping push: ' + text);
    return;
  }

  const payload = {
    to: lineUserId,
    messages: [{ type: 'text', text: text }],
  };

  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method:  'post',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN,
    },
    payload:            JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}

// ─── SPECIFIC NOTIFICATION TEMPLATES ─────────────────────────────────────────

/**
 * Notify a customer that points were added to their account.
 * Called from handleAddPoints() in code.gs.
 */
function notifyPointsAdded(lineUserId, addedPts, totalPts) {
  const msg =
    `🎉 您獲得了 ${addedPts} 點！\n` +
    `目前累計點數：${totalPts} 點\n` +
    `（點數有效期限 1 年）\n\n` +
    `快來農場用點數種植作物吧！🌱`;
  sendLineNotification(lineUserId, msg);
}

/**
 * Check if points are expiring within 30 days and notify if so.
 * Called after every add_points action and also from dailyTrigger().
 */
function checkAndNotifyExpiring(lineUserId, totalPts, expireDateStr) {
  if (!expireDateStr || totalPts <= 0) return;
  const expDate  = new Date(expireDateStr);
  const diffDays = Math.round((expDate - new Date()) / 86400000);
  if (diffDays === 30) {
    const msg =
      `⏰ 點數到期提醒\n` +
      `您有 ${totalPts} 點將於 ${expireDateStr} 到期\n` +
      `剩餘 30 天，請記得到店使用或到農場種植喔！`;
    sendLineNotification(lineUserId, msg);
  }
}

/**
 * Notify about drought – crops dying soon.
 * @param {string} lineUserId
 * @param {number} noWaterDays – consecutive days without water
 */
function notifyDroughtWarning(lineUserId, noWaterDays) {
  const msg =
    `🥵 乾旱警告！\n` +
    `您的作物已連續 ${noWaterDays} 天未澆水\n` +
    `請盡快到農場澆水，否則作物將枯萎 🥀`;
  sendLineNotification(lineUserId, msg);
}

/**
 * Notify that crops died from drought.
 * @param {string} lineUserId
 */
function notifyDroughtDeath(lineUserId) {
  const msg =
    `🥀 您的作物因乾旱死亡了\n` +
    `請到農場手動點擊清除枯萎作物，再重新種植吧！`;
  sendLineNotification(lineUserId, msg);
}

/**
 * Send a weather summary to a user.
 * @param {string}  lineUserId
 * @param {number}  rainfall    – mm
 * @param {number}  temperature – °C
 */
function notifyWeather(lineUserId, rainfall, temperature) {
  let msg = `🌤 今日埔里天氣\n氣溫：${temperature}°C\n`;

  if (rainfall > 100) {
    msg += `⚠️ 極端豪雨（${rainfall}mm）\n所有作物將全部死亡！`;
  } else if (rainfall >= 80) {
    msg += `⛈ 大豪雨（${rainfall}mm）\n作物存活率 20%，請留意損失！`;
  } else if (rainfall >= 50) {
    msg += `🌧 豪雨（${rainfall}mm）\n作物存活率 80%，請留意損失！`;
  } else if (rainfall >= 25) {
    msg += `🌦 大雨（${rainfall}mm）\n今天不需要澆水，作物自動加速成長 ×1.6 🌱`;
  } else if (rainfall >= 10) {
    msg += `🌂 中雨（${rainfall}mm）\n可補充澆水以達到 ×1.5 成長速率`;
  } else if (rainfall > 0) {
    msg += `🌂 小雨（${rainfall}mm）\n可補充澆水以達到 ×1.5 成長速率`;
  } else {
    msg += `☀️ 晴天 / 陰天\n記得澆水讓作物加速成長 ×1.5 🌱`;
  }

  sendLineNotification(lineUserId, msg);
}
