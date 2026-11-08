(function (root) {
  'use strict';

  const STORAGE_KEY = 'hu-demo-v1';
  const ID_RE = /^[a-zA-Z0-9-]{1,64}$/;
  const MONTH_RE = /^[0-9]{4}(0[1-9]|1[0-2])$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const MAX_NOTE = 160;
  const MAX_MONTHS = 240;
  const MAX_TX_PER_MONTH = 5000;
  const MAX_RECURRING = 200;
  const MAX_JSON_CHARS = 4_000_000;

  const DEFAULT_JARS = [
    {id: 'food', name: 'Ăn uống', defaultAlloc: 2500000, icon: '♨', color: '#779c65', light: '#edf3e5', type: 'living'},
    {id: 'bills', name: 'Điện, nước, Internet, điện thoại', defaultAlloc: 500000, icon: '⌂', color: '#739d9c', light: '#e9f2ef', type: 'living'},
    {id: 'travel', name: 'Xăng xe, gửi xe, đi lại', defaultAlloc: 400000, icon: '↗', color: '#b59b63', light: '#f6f0e1', type: 'living'},
    {id: 'personal', name: 'Đồ dùng cá nhân', defaultAlloc: 300000, icon: '✧', color: '#a18aae', light: '#f1ebf4', type: 'living'},
    {id: 'friends', name: 'Hẹn hò, cà phê, gặp bạn bè', defaultAlloc: 800000, icon: '☕', color: '#c08b75', light: '#f8eee7', type: 'living'},
    {id: 'irregular', name: 'Chi không đều', defaultAlloc: 500000, icon: '◈', color: '#8496b5', light: '#ecf0f7', type: 'living'},
    {id: 'reserve', name: 'Quỹ dự phòng', defaultAlloc: 1000000, icon: '☂', color: '#739d78', light: '#e0ebdc', type: 'saving', goal: 0},
    {id: 'wedding', name: 'Tiết kiệm mục tiêu', defaultAlloc: 9000000, icon: '♡', color: '#b39467', light: '#eee4d3', type: 'saving', goal: 0, hidden: false}
  ];

  function cloneJars(list) {
    return (list || DEFAULT_JARS).map(j => ({...j}));
  }

  function jarTuple(j) {
    return [j.id, j.name, j.defaultAlloc, j.icon, j.color, j.light];
  }

  function isSavingJar(jar, jars) {
    const found = (jars || DEFAULT_JARS).find(j => j.id === jar);
    return found ? found.type === 'saving' : ['reserve', 'wedding'].includes(jar);
  }

  function validId(value) {
    return typeof value === 'string' && ID_RE.test(value);
  }

  function validNote(value) {
    return typeof value === 'string' && value.length <= MAX_NOTE;
  }

  function validMoney(value) {
    return Number.isSafeInteger(value) && value >= 0 && value <= 1e12;
  }

  function validPositiveMoney(value) {
    return Number.isSafeInteger(value) && value > 0 && value <= 1e12;
  }

  function validDate(value) {
    if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }

  function validJarDef(j, ids) {
    return j && validId(j.id) && !ids.has(j.id) &&
      typeof j.name === 'string' && j.name.length > 0 && j.name.length <= 80 &&
      validMoney(j.defaultAlloc) &&
      typeof j.icon === 'string' && j.icon.length > 0 && j.icon.length <= 8 &&
      typeof j.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(j.color) &&
      typeof j.light === 'string' && /^#[0-9a-fA-F]{6}$/.test(j.light) &&
      (j.type === 'living' || j.type === 'saving') &&
      (j.goal === undefined || validMoney(j.goal)) &&
      (j.hidden === undefined || typeof j.hidden === 'boolean');
  }

  function validTx(t, monthKey, jarIds, recurringIds) {
    if (!t || !validId(t.id) || !jarIds.has(t.jar) || !validPositiveMoney(t.amount) || !validNote(t.note)) return false;
    if (!validDate(t.date) || t.date.replaceAll('-', '').slice(0, 6) !== monthKey) return false;
    const kind = t.kind || 'expense';
    if (!['expense', 'contribute', 'withdraw', 'transfer-out', 'transfer-in', 'income'].includes(kind)) return false;
    if (t.ruleId !== undefined) {
      if (!validId(t.ruleId)) return false;
      if (t.recurrenceDate !== undefined && !validDate(t.recurrenceDate)) return false;
    }
    if (t.transferPairId !== undefined && !validId(t.transferPairId)) return false;
    if (t.automatic !== undefined && typeof t.automatic !== 'boolean') return false;
    return true;
  }

  function validMonth(key, month, jarIds, recurringIds) {
    if (!MONTH_RE.test(key) || !month || !validMoney(month.budget) || !month.alloc || !Array.isArray(month.tx)) return false;
    if (month.tx.length > MAX_TX_PER_MONTH) return false;
    if (![...jarIds].every(id => validMoney(month.alloc[id]))) return false;
    if (!month.tx.every(t => validTx(t, key, jarIds, recurringIds))) return false;
    if (month.closedAt) {
      if (typeof month.closedAt !== 'string' || !month.closeSummary) return false;
      const s = month.closeSummary;
      if (!['income', 'living', 'savings', 'remaining', 'transactions'].every(k => Number.isSafeInteger(s[k]))) return false;
    }
    return true;
  }

  function validRule(rule, jarIds, recurringCore) {
    if (recurringCore && typeof recurringCore.validRule === 'function') {
      return recurringCore.validRule(rule, [...jarIds]);
    }
    return rule && validId(rule.id) && validNote(rule.note) && rule.note.length > 0 &&
      jarIds.has(rule.jar) && validPositiveMoney(rule.amount) &&
      ['expense', 'contribute', 'withdraw'].includes(rule.kind) &&
      ['day', 'week', 'month', 'year'].includes(rule.frequency) &&
      Number.isInteger(rule.interval) && rule.interval >= 1 && rule.interval <= 365 &&
      validDate(rule.startDate);
  }

  function validateStore(data, recurringCore) {
    if (!data || (data.version !== 1 && data.version !== 2)) return false;
    if (!data.months || typeof data.months !== 'object') return false;
    const monthKeys = Object.keys(data.months);
    if (!monthKeys.length || monthKeys.length > MAX_MONTHS) return false;

    let jars = DEFAULT_JARS;
    if (data.version >= 2) {
      if (!Array.isArray(data.jars) || data.jars.length < 2 || data.jars.length > 24) return false;
      const seen = new Set();
      if (!data.jars.every(j => {
        const ok = validJarDef(j, seen);
        if (ok) seen.add(j.id);
        return ok;
      })) return false;
      if (!data.jars.some(j => j.type === 'living') || !data.jars.some(j => j.type === 'saving')) return false;
      jars = data.jars;
      if (data.meta) {
        if (typeof data.meta !== 'object') return false;
        if (data.meta.onboardingDone !== undefined && typeof data.meta.onboardingDone !== 'boolean') return false;
        if (data.meta.carryBalanceDefault !== undefined && typeof data.meta.carryBalanceDefault !== 'boolean') return false;
        if (data.meta.pinEnabled !== undefined && typeof data.meta.pinEnabled !== 'boolean') return false;
        if (data.meta.backupReminderDays !== undefined && !(Number.isInteger(data.meta.backupReminderDays) && data.meta.backupReminderDays >= 0 && data.meta.backupReminderDays <= 90)) return false;
      }
    }

    const jarIds = new Set(jars.filter(j => !j.hidden).map(j => j.id).concat(jars.map(j => j.id)));
    if (data.recurring !== undefined) {
      if (!Array.isArray(data.recurring) || data.recurring.length > MAX_RECURRING) return false;
      if (!data.recurring.every(r => validRule(r, jarIds, recurringCore))) return false;
    }
    const recurringIds = new Set((data.recurring || []).map(r => r.id));
    return monthKeys.every(k => validMonth(k, data.months[k], jarIds, recurringIds));
  }

  function migrateToV2(data) {
    if (!data) return emptyStore();
    if (data.version === 2 && Array.isArray(data.jars)) {
      data.meta = data.meta || {onboardingDone: false, carryBalanceDefault: false, pinEnabled: false, backupReminderDays: 14};
      data.recurring = data.recurring || [];
      return data;
    }
    const jars = cloneJars();
    return {
      version: 2,
      meta: {onboardingDone: Object.keys(data.months || {}).length > 0, carryBalanceDefault: false, pinEnabled: false, backupReminderDays: 14, lastBackupAt: null},
      jars,
      recurring: data.recurring || [],
      months: data.months || {}
    };
  }

  function emptyStore() {
    const now = new Date();
    const key = String(now.getFullYear()) + String(now.getMonth() + 1).padStart(2, '0');
    const jars = cloneJars();
    return {
      version: 2,
      meta: {onboardingDone: false, carryBalanceDefault: false, pinEnabled: false, backupReminderDays: 14, lastBackupAt: null},
      jars,
      recurring: [],
      months: {
        [key]: {
          budget: 0,
          alloc: Object.fromEntries(jars.map(j => [j.id, 0])),
          tx: []
        }
      }
    };
  }

  function seedStore() {
    const jars = cloneJars();
    const alloc = Object.fromEntries(jars.map(j => [j.id, j.defaultAlloc]));
    const samples = [
      ['food', 185000, '2026-10-27', 'Đi chợ cho cả tuần'],
      ['food', 45000, '2026-10-28', 'Bữa trưa văn phòng'],
      ['bills', 420000, '2026-10-05', 'Điện, nước và Internet'],
      ['travel', 120000, '2026-10-12', 'Đổ xăng'],
      ['friends', 165000, '2026-10-24', 'Cà phê cuối tuần'],
      ['personal', 90000, '2026-10-18', 'Dầu gội và sữa tắm'],
      ['reserve', 1000000, '2026-10-01', 'Đóng góp quỹ dự phòng'],
      ['wedding', 9000000, '2026-10-01', 'Dành cho mục tiêu lớn']
    ];
    const makeId = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2, 10);
    return {
      version: 2,
      meta: {onboardingDone: true, carryBalanceDefault: false, pinEnabled: false, backupReminderDays: 14, lastBackupAt: null},
      jars,
      recurring: [],
      months: {
        '202610': {
          budget: 15000000,
          alloc,
          tx: samples.map(([jar, amount, date, note]) => ({
            id: makeId(), jar, amount, date, note,
            kind: ['reserve', 'wedding'].includes(jar) ? 'contribute' : 'expense'
          }))
        }
      }
    };
  }

  function parseSizeSafe(text) {
    if (typeof text !== 'string' || text.length > MAX_JSON_CHARS) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function bufToB64(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function b64ToBuf(b64) {
    const s = atob(b64);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes.buffer;
  }

  async function deriveKey(pin, salt) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      {name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256'},
      base,
      {name: 'AES-GCM', length: 256},
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptStore(data, pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pin, salt);
    const plain = new TextEncoder().encode(JSON.stringify(data));
    const cipher = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, plain);
    return {
      version: 2,
      encrypted: true,
      salt: bufToB64(salt),
      iv: bufToB64(iv),
      payload: bufToB64(cipher)
    };
  }

  async function decryptStore(envelope, pin) {
    if (!envelope || !envelope.encrypted) return envelope;
    const salt = new Uint8Array(b64ToBuf(envelope.salt));
    const iv = new Uint8Array(b64ToBuf(envelope.iv));
    const key = await deriveKey(pin, salt);
    const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv}, key, b64ToBuf(envelope.payload));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  function livingBalance(month, jarId) {
    let used = 0;
    for (const t of month.tx || []) {
      if (t.jar !== jarId) continue;
      if (t.kind === 'transfer-in' || t.kind === 'income') used -= t.amount;
      else used += t.amount;
    }
    return (month.alloc[jarId] || 0) - used;
  }

  function carryLivingBalances(sourceMonth, jars) {
    const carry = {};
    for (const j of jars.filter(x => x.type === 'living' && !x.hidden)) {
      const bal = livingBalance(sourceMonth, j.id);
      carry[j.id] = Math.max(0, bal);
    }
    return carry;
  }

  const api = {
    STORAGE_KEY, ID_RE, MAX_NOTE, MAX_MONTHS, MAX_TX_PER_MONTH, MAX_JSON_CHARS, DEFAULT_JARS,
    cloneJars, jarTuple, isSavingJar, validId, validNote, validMoney, validPositiveMoney, validDate,
    validateStore, migrateToV2, emptyStore, seedStore, parseSizeSafe,
    encryptStore, decryptStore, livingBalance, carryLivingBalances
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HuStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
