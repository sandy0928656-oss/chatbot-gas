const CHATBOT_CONFIG = Object.freeze({
  spreadsheetId: '1uRcRNLEhWBYJzbAvJJbE4tvhDqmoDiQ5HGKOMy11bCs',
  sheetName: 'CHATBOT_LOG',
  model: 'gpt-5.4-mini',
  timezone: 'Asia/Taipei',
  maxOutputTokens: 900
});

const CHATBOT_SYSTEM_PROMPT = [
  '你是名叫 CHATBOT 的聊天機器人。',
  '你的個性溫和、幽默、會安慰人，也很擅長把話說得清楚又有人味。',
  '你熟悉教育學、心理學、課程與教學、班級經營、學習理論、評量與輔導等知識。',
  '回覆時使用繁體中文，語氣自然、正式且親切，不使用井字標題、粗體符號或清單標記。',
  '如果使用者心情低落，先接住感受，再提供簡短可行的下一步。',
  '可以幽默，但不要嘲笑使用者，也不要讓玩笑蓋過安慰或知識說明。',
  '不知道的事要坦白說明，避免編造。'
].join('\n');

const CHATBOT_HEADERS = [
  '日期',
  '時間',
  '時間戳記',
  '會話ID',
  '角色',
  '內容',
  '模型',
  '客戶端時間',
  '瀏覽器',
  'OpenAI請求ID'
];

function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('index')
    .setTitle('CHATBOT')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    return json_(chatWithBot(parseRequest_(e)));
  } catch (error) {
    return json_({
      ok: false,
      error: errorMessage_(error)
    });
  }
}

function chatWithBot(payload) {
  payload = payload || {};

  const message = String(payload.message || payload.text || payload.prompt || '').trim();
  const sessionId = String(payload.sessionId || Utilities.getUuid()).trim();
  const clientTime = String(payload.clientTime || '').trim();
  const userAgent = String(payload.userAgent || '').slice(0, 500);

  if (!message) {
    return {
      ok: false,
      error: '請輸入想聊的內容。'
    };
  }

  appendLog_({
    sessionId,
    role: '使用者',
    content: message,
    clientTime,
    userAgent,
    requestId: ''
  });

  try {
    const openAiResult = requestOpenAI_(message, payload.history || []);

    appendLog_({
      sessionId,
      role: 'CHATBOT',
      content: openAiResult.reply,
      clientTime,
      userAgent,
      requestId: openAiResult.requestId
    });

    return {
      ok: true,
      reply: openAiResult.reply,
      model: CHATBOT_CONFIG.model,
      serverTime: new Date().toISOString()
    };
  } catch (error) {
    appendLog_({
      sessionId,
      role: '系統',
      content: errorMessage_(error),
      clientTime,
      userAgent,
      requestId: ''
    });
    throw error;
  }
}

function setupChatbotSheet() {
  ensureSheet_();
}

function requestOpenAI_(message, history) {
  const apiKey = getOpenAIKey_();
  const payload = {
    model: CHATBOT_CONFIG.model,
    instructions: CHATBOT_SYSTEM_PROMPT,
    input: buildConversationInput_(message, history),
    max_output_tokens: CHATBOT_CONFIG.maxOutputTokens
  };

  const response = UrlFetchApp.fetch('https://api.openai.com/v1/responses', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    payload: JSON.stringify(payload)
  });

  const status = response.getResponseCode();
  const raw = response.getContentText();
  const headers = response.getAllHeaders();
  const requestId = headers['x-request-id'] || headers['X-Request-Id'] || '';

  if (status < 200 || status >= 300) {
    throw new Error(`OpenAI API 回應異常：${status} ${extractOpenAIError_(raw)}`);
  }

  const data = JSON.parse(raw);
  const reply = extractOutputText_(data);

  if (!reply) {
    throw new Error('OpenAI API 沒有回傳可顯示的文字。');
  }

  return {
    reply,
    requestId: requestId || data.id || ''
  };
}

function buildConversationInput_(message, history) {
  const lines = [];
  const safeHistory = Array.isArray(history) ? history.slice(-16) : [];

  safeHistory.forEach((item) => {
    const role = item && item.role === 'assistant' ? 'CHATBOT' : '使用者';
    const content = String(item && item.content ? item.content : '').trim();
    if (content) {
      lines.push(`${role}：${content.slice(0, 1800)}`);
    }
  });

  lines.push(`使用者：${message}`);
  lines.push('請以 CHATBOT 的身分自然回覆。');
  return lines.join('\n\n');
}

function extractOutputText_(data) {
  if (data && typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const pieces = [];
  const output = data && Array.isArray(data.output) ? data.output : [];

  output.forEach((item) => {
    const content = Array.isArray(item.content) ? item.content : [];
    content.forEach((part) => {
      if (typeof part.text === 'string') {
        pieces.push(part.text);
      }
    });
  });

  return pieces.join('').trim();
}

function getOpenAIKey_() {
  const properties = PropertiesService.getScriptProperties();
  const key = properties.getProperty('OPENAI_API_KEY') || properties.getProperty('OPEN_API_KEY');

  if (!key) {
    throw new Error('尚未設定 OPENAI_API_KEY 或 OPEN_API_KEY。');
  }

  return key;
}

function appendLog_(entry) {
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);

  try {
    const sheet = ensureSheet_();
    const now = new Date();
    sheet.appendRow([
      Utilities.formatDate(now, CHATBOT_CONFIG.timezone, 'yyyy-MM-dd'),
      Utilities.formatDate(now, CHATBOT_CONFIG.timezone, 'HH:mm:ss'),
      Utilities.formatDate(now, CHATBOT_CONFIG.timezone, 'yyyy-MM-dd HH:mm:ss'),
      entry.sessionId,
      entry.role,
      entry.content,
      CHATBOT_CONFIG.model,
      entry.clientTime,
      entry.userAgent,
      entry.requestId
    ]);
  } finally {
    lock.releaseLock();
  }
}

function ensureSheet_() {
  const spreadsheet = SpreadsheetApp.openById(CHATBOT_CONFIG.spreadsheetId);
  let sheet = spreadsheet.getSheetByName(CHATBOT_CONFIG.sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CHATBOT_CONFIG.sheetName);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(CHATBOT_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, CHATBOT_HEADERS.length).setFontWeight('bold');
    sheet.autoResizeColumns(1, CHATBOT_HEADERS.length);
  }

  return sheet;
}

function parseRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }

  const body = e.postData.contents;

  try {
    return JSON.parse(body);
  } catch (error) {
    return Object.assign({}, e.parameter, {
      message: body
    });
  }
}

function extractOpenAIError_(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.error && parsed.error.message) {
      return parsed.error.message;
    }
  } catch (error) {
    return raw.slice(0, 300);
  }

  return raw.slice(0, 300);
}

function errorMessage_(error) {
  return error && error.message ? error.message : String(error);
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
