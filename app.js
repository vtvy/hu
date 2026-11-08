/* global HuStore, HuRecurring, $, jars, jarDefs, data, month, tab, storageOK, persist, current, sum, used, allocated, toast, title, shift, icon, money, esc, show, buttons, saving, render, budget, createMonth, transaction, validData, readEntryAmount, suggestedAmounts, shortMoney, recurringForm */
(function () {
  'use strict';
  const store = HuStore;
  const recurringCore = HuRecurring;
  const recurringUnits = {day: 'ngày', week: 'tuần', month: 'tháng', year: 'năm'};

  window.jarDefs = store.cloneJars();
  window.jars = jarDefs.map(store.jarTuple);
  window.saving = id => store.isSavingJar(id, jarDefs);
  window.data = null;
  window.month = null;
  window.tab = 'overview';
  window.storageOK = true;
  let sessionUnlocked = true;
  let cryptoPin = null;
  let showStoppedRules = false;
  let lastAutomaticCount = 0;
  let historyQuery = {q: '', from: '', to: ''};
  let unlockResolver = null;

  const plannerToday = () => {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  };
  const plannerTomorrow = () => {
    const d = new Date(plannerToday() + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  };
  const friendlyDate = date => date ? date.split('-').reverse().join('/') : '';
  const repeatLabel = r => 'Mỗi ' + (r.interval === 1 ? '' : r.interval + ' ') + recurringUnits[r.frequency];
  function readMoneyOrZero(value, unit) {
    const text = String(value).trim();
    if (text === '' || text === '0') return 0;
    return readEntryAmount(text, unit);
  }
  const visibleJars = () => jarDefs.filter(j => !j.hidden);
  const livingJars = () => visibleJars().filter(j => j.type === 'living');
  const savingJars = () => visibleJars().filter(j => j.type === 'saving');
  const syncJarViews = () => { window.jars = jarDefs.map(store.jarTuple); };

  function toast(t) {
    const el = $('#toast');
    el.textContent = t;
    el.style.display = 'block';
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3500);
  }
  window.toast = toast;

  function persist() {
    try {
      if (data.meta?.pinEnabled && cryptoPin) {
        store.encryptStore(data, cryptoPin).then(envelope => {
          localStorage.setItem(store.STORAGE_KEY, JSON.stringify(envelope));
        }).catch(() => { storageOK = false; toast('Không lưu được dữ liệu.'); });
        return true;
      }
      localStorage.setItem(store.STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch {
      storageOK = false;
      toast('Bộ nhớ trình duyệt không khả dụng. Thay đổi chỉ giữ trong phiên này.');
      return false;
    }
  }
  window.persist = persist;

  window.current = () => data.months[month];
  window.sum = a => a.reduce((s, n) => s + n, 0);
  window.used = id => {
    const isSave = saving(id);
    return sum(current().tx.filter(t => t.jar === id).map(t => {
      if (isSave) return t.kind === 'withdraw' ? -t.amount : t.amount;
      if (t.kind === 'transfer-in' || t.kind === 'income') return -t.amount;
      return t.amount;
    }));
  };
  window.allocated = () => sum(Object.values(current().alloc));
  window.title = m => `Tháng ${Number(m.slice(4))}, ${m.slice(0, 4)}`;
  window.shift = (m, n) => {
    const d = new Date(Number(m.slice(0, 4)), Number(m.slice(4)) - 1 + n, 1);
    return String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0');
  };
  window.money = n => new Intl.NumberFormat('vi-VN').format(n) + ' ₫';
  window.esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  window.icon = j => {
    const def = Array.isArray(j) ? {icon: j[3], light: j[5]} : j;
    const light = def.light || def[5];
    const glyph = def.icon || def[3];
    return `<span class="icon" style="--light:${light}">${glyph}</span>`;
  };

  window.buttons = (text = 'Lưu thay đổi') =>
    `<div class="buttons"><button type="button" data-cancel>Hủy</button><button class="primary" type="submit">${text}</button></div>`;

  window.show = (html, submit) => {
    const form = $('#form');
    form.onclick = null;
    form.oninput = null;
    form.onchange = null;
    form.innerHTML = html;
    form.onsubmit = e => { e.preventDefault(); submit(new FormData(e.target)); };
    const dialog = $('#dialog');
    const previouslyFocused = document.activeElement;
    dialog.showModal();
    const cancel = form.querySelector('[data-cancel]');
    if (cancel) cancel.onclick = () => dialog.close();
    dialog.addEventListener('close', () => {
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
    }, {once: true});
    const first = form.querySelector('input,select,button,textarea');
    if (first) first.focus();
  };

  window.validData = d => store.validateStore(d, recurringCore);

  function monthIsLocked() {
    if (!current().closedAt) return false;
    toast('Tháng đã chốt. Bấm “Mở lại tháng” trước khi chỉnh sửa.');
    return true;
  }

  function processRecurring() {
    data.recurring ||= [];
    const count = recurringCore.sync(data, plannerToday());
    if (count) { lastAutomaticCount = count; persist(); }
    return count;
  }

  function downloadBackup(payload, name) {
    const blob = new Blob([typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name || ('hu-backup-' + new Date().toISOString().slice(0, 10) + '.json');
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function autoBackupBeforeOverwrite() {
    try {
      downloadBackup(data, 'hu-autosave-before-overwrite-' + Date.now() + '.json');
      data.meta.lastBackupAt = new Date().toISOString();
    } catch { /* ignore */ }
  }

  function jarById(id) {
    return jarDefs.find(j => j.id === id) || jars.find(j => j[0] === id);
  }

  function jarLabel(id) {
    const j = jarById(id);
    return Array.isArray(j) ? j[1] : (j?.name || id);
  }

  function renderHistory() {
    const list = current().tx
      .filter(t => {
        const filter = $('#filter')?.value || '';
        if (filter && t.jar !== filter) return false;
        if (historyQuery.q && !(t.note || '').toLowerCase().includes(historyQuery.q.toLowerCase())) return false;
        if (historyQuery.from && t.date < historyQuery.from) return false;
        if (historyQuery.to && t.date > historyQuery.to) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

    const root = $('#transactions');
    root.textContent = '';
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.innerHTML = 'Chưa có giao dịch phù hợp. <button type="button" class="primary" id="emptyAdd">Ghi chi tiêu</button>';
      root.append(empty);
      $('#emptyAdd')?.addEventListener('click', () => transaction());
      return;
    }

    const groups = new Map();
    for (const t of list) {
      const arr = groups.get(t.date) || [];
      arr.push(t);
      groups.set(t.date, arr);
    }
    for (const [date, items] of groups) {
      const group = document.createElement('div');
      group.className = 'day-group';
      const h = document.createElement('h3');
      h.textContent = friendlyDate(date);
      group.append(h);
      for (const t of items) {
        const j = jarById(t.jar);
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = icon(j) + '<div></div><div class="amount"></div><div class="actions"></div>';
        const info = row.children[1];
        const titleEl = document.createElement('b');
        titleEl.textContent = t.note || jarLabel(t.jar);
        const meta = document.createElement('p');
        meta.textContent = jarLabel(t.jar) + (t.ruleId ? ' · Định kỳ' : '');
        info.append(titleEl, meta);
        if (t.ruleId) {
          const badge = document.createElement('span');
          badge.className = 'rule-badge';
          badge.textContent = '↻ Định kỳ';
          info.append(badge);
        }
        const amount = row.querySelector('.amount');
        const sign = (saving(t.jar) && t.kind !== 'withdraw') || t.kind === 'income' || t.kind === 'transfer-in' ? '+' : '−';
        amount.append(document.createTextNode(sign + money(t.amount)));
        const kind = document.createElement('p');
        kind.textContent = kindLabel(t);
        amount.append(kind);
        const actions = row.querySelector('.actions');
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.textContent = 'Sửa';
        edit.setAttribute('aria-label', 'Sửa ' + (t.note || jarLabel(t.jar)));
        edit.dataset.edit = t.id;
        const del = document.createElement('button');
        del.type = 'button';
        del.textContent = 'Xóa';
        del.setAttribute('aria-label', 'Xóa ' + (t.note || jarLabel(t.jar)));
        del.dataset.delete = t.id;
        actions.append(edit, del);
        group.append(row);
      }
      root.append(group);
    }
  }

  function kindLabel(t) {
    if (t.kind === 'income') return 'Khoản thu';
    if (t.kind === 'transfer-out') return 'Chuyển đi';
    if (t.kind === 'transfer-in') return 'Chuyển đến';
    if (saving(t.jar)) return t.kind === 'withdraw' ? 'Rút từ tích lũy' : 'Đóng góp tích lũy';
    return 'Chi sinh hoạt';
  }

  function renderSummary() {
    const m = current();
    const spent = sum(m.tx.filter(t => !saving(t.jar) && t.kind !== 'income' && t.kind !== 'transfer-in' && t.kind !== 'transfer-out').map(t => t.amount))
      + sum(m.tx.filter(t => !saving(t.jar) && t.kind === 'transfer-out').map(t => t.amount))
      - sum(m.tx.filter(t => !saving(t.jar) && (t.kind === 'transfer-in' || t.kind === 'income')).map(t => t.amount));
    const livingSpend = sum(m.tx.filter(t => !saving(t.jar) && (!t.kind || t.kind === 'expense')).map(t => t.amount));
    const contrib = sum(m.tx.filter(t => saving(t.jar)).map(t => t.kind === 'withdraw' ? -t.amount : t.amount));
    const living = sum(livingJars().map(j => m.alloc[j.id] || 0));
    const incomeExtra = sum(m.tx.filter(t => t.kind === 'income').map(t => t.amount));
    const delta = m.budget - allocated();
    $('#summary').innerHTML = [
      ['Ngân sách tháng', m.budget + incomeExtra, delta === 0 ? 'Đã phân bổ đủ' : (delta > 0 ? 'Chưa phân bổ: ' : 'Phân bổ vượt: ') + money(Math.abs(delta))],
      ['Đã chi sinh hoạt', livingSpend, 'Không gồm chuyển hũ / thu'],
      ['Sinh hoạt còn lại', living - livingSpend, 'Trên định mức ' + money(living)],
      ['Đóng góp tích lũy', contrib, 'Góp trừ rút trong tháng']
    ].map(([t, v, n]) => `<div class="stat"><small>${t}</small><strong>${money(v)}</strong><p>${n}</p></div>`).join('');
  }

  function renderJars() {
    const m = current();
    $('#jars').innerHTML = livingJars().map(j => {
      const u = used(j.id);
      const a = m.alloc[j.id] || 0;
      const p = a ? Math.round(u / a * 100) : u ? 100 : 0;
      return `<article class="jar" style="--color:${j.color};--light:${j.light}" data-jar="${j.id}">
        <div class="jarhead">${icon(j)}<span class="percent ${u > a ? 'over' : ''}">${p}% đã dùng</span></div>
        <h3>${esc(j.name)}</h3><strong class="${u > a ? 'over' : ''}">${money(a - u)}</strong> <small>còn lại</small>
        <div class="bar"><i style="width:${Math.min(100, p)}%"></i></div>
        <div class="jarbottom"><span>Đã chi ${money(u)}</span><span>Hũ ${money(a)}</span></div>
      </article>`;
    }).join('');

    $('#savings').innerHTML = savingJars().map(j => {
      const total = sum(Object.entries(data.months).filter(([k]) => k <= month).flatMap(([, v]) =>
        v.tx.filter(t => t.jar === j.id).map(t => t.kind === 'withdraw' ? -t.amount : t.amount)));
      const goal = j.goal || 0;
      const pct = goal ? Math.min(100, Math.round(total / goal * 100)) : 0;
      return `<article class="saving" data-jar="${j.id}">${icon(j)}<div>
        <h3>${esc(j.name)}</h3><strong>${money(total)}</strong>
        <p>Tổng tích lũy đến ${month}</p>
        <p>Tháng này: <b>${money(used(j.id))}</b> / ${money(m.alloc[j.id] || 0)}</p>
        ${goal ? `<div class="goal-bar" style="--brand:${j.color}"><i style="width:${pct}%;background:${j.color}"></i></div><p>Mục tiêu ${money(goal)} · ${pct}%</p>` : '<p class="field-help">Chưa đặt mục tiêu</p>'}
      </div></article>`;
    }).join('');

    document.querySelectorAll('#jars .jar').forEach(card => {
      const id = card.dataset.jar;
      const b = document.createElement('button');
      b.textContent = '− Chi từ hũ này';
      b.onclick = () => transaction(undefined, id);
      card.append(b);
      const quick = document.createElement('div');
      quick.className = 'card-quick';
      suggestedAmounts(id).slice(0, 3).forEach(amount => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.textContent = shortMoney(amount);
        chip.setAttribute('aria-label', 'Ghi ' + money(amount) + ' từ hũ ' + jarLabel(id));
        chip.onclick = () => transaction(undefined, id, {amount});
        quick.append(chip);
      });
      card.append(quick);
    });
    document.querySelectorAll('#savings .saving').forEach(card => {
      const id = card.dataset.jar;
      const b = document.createElement('button');
      b.textContent = 'Góp / rút tiền';
      b.onclick = () => transaction(undefined, id);
      card.lastElementChild.append(b);
    });
  }

  function renderOnboarding() {
    document.querySelectorAll('.onboard,.setup').forEach(el => el.remove());
    if (!data.meta.onboardingDone) {
      const box = document.createElement('div');
      box.className = 'onboard';
      box.innerHTML = `<b>Chào mừng đến Hũ</b>
        <p>Ba bước nhẹ: nhập thu nhập → chia vào các hũ → ghi khoản chi đầu tiên. Số tiền khi ghi chi có thể nhập theo <b>nghìn đồng</b> (gõ 35 = 35.000 ₫).</p>
        <ol><li>Nhập thu nhập tháng</li><li>Chia tự động hoặc chỉnh từng hũ</li><li>Ghi một khoản chi nhỏ</li></ol>
        <div class="toolbar-row"><button class="primary" id="startOnboard">Bắt đầu</button><button id="skipOnboard">Bỏ qua</button></div>`;
      $('#summary').before(box);
      $('#startOnboard').onclick = () => { budget(); };
      $('#skipOnboard').onclick = () => { data.meta.onboardingDone = true; persist(); render(); };
      return;
    }
    if (!current().budget) {
      const box = document.createElement('div');
      box.className = 'setup';
      box.innerHTML = '<b>Bắt đầu tháng bằng khoản thu nhập của bạn</b><p>Nhập số tiền đầu tháng, chia vào các hũ, sau đó ghi từng khoản chi.</p><button class="primary">Nhập thu nhập & chia hũ</button>';
      box.querySelector('button').onclick = budget;
      $('#summary').before(box);
    }
  }

  function renderMonthState() {
    const closed = !!current().closedAt;
    let state = $('#monthState');
    if (!state) {
      state = document.createElement('section');
      state.id = 'monthState';
      $('#summary').after(state);
    }
    state.className = 'month-state' + (closed ? ' closed' : '');
    const summary = closed ? current().closeSummary : recurringCore.closingSummary(current());
    state.innerHTML = closed
      ? `<div><h3>✓ ${title(month)} đã chốt sổ</h3><p>Đã chi ${money(summary.living)} · Tích lũy ròng ${money(summary.savings)}. Mở lại tháng nếu cần điều chỉnh.</p></div><button id="reopenMonth">Mở lại tháng</button>`
      : `<div><h3>${title(month)} đang mở</h3><p>${month < plannerToday().replaceAll('-', '').slice(0, 6) ? 'Đã sang tháng mới. Bạn có thể xem tổng kết, chốt sổ và bắt đầu tháng tiếp theo.' : 'Ghi chi hằng ngày. Cuối tháng, xem tổng kết rồi chốt để giữ nguyên số liệu.'}</p></div><button id="closeMonth">Chốt sổ tháng</button>`;
    if (closed) $('#reopenMonth').onclick = reopenMonth;
    else $('#closeMonth').onclick = closeMonth;
  }

  function nextRuleDate(r) {
    let next = recurringCore.nextDate(r, plannerToday());
    if (next === plannerToday() && Object.values(data.months).some(m => m.tx.some(t => t.ruleId === r.id && t.recurrenceDate === next))) {
      next = recurringCore.nextDate(r, plannerTomorrow());
    }
    return next;
  }

  function ruleCard(r) {
    const next = nextRuleDate(r);
    const key = next?.replaceAll('-', '').slice(0, 6);
    const nextMonth = key && data.months[key];
    const status = r.stopped ? 'Đã dừng' : !next ? 'Đã kết thúc' : nextMonth?.closedAt ? 'Tháng đến hạn đã chốt' : !nextMonth ? 'Cần mở ' + title(key) : 'Đang chạy';
    const article = document.createElement('article');
    article.className = 'recurring-card';
    article.innerHTML = `<div class="rule-title"><h3></h3><strong></strong></div>
      <span class="recurring-status ${r.stopped || !next ? 'stopped' : ''}"></span>
      <p></p><div class="rule-actions"></div>`;
    article.querySelector('h3').textContent = r.note;
    article.querySelector('strong').textContent = money(r.amount);
    article.querySelector('.recurring-status').textContent = status;
    article.querySelector('p').innerHTML = `${esc(jarLabel(r.jar))} · ${repeatLabel(r)}<br>${next ? 'Kỳ tới: <b>' + friendlyDate(next) + '</b>' : 'Không còn kỳ tiếp theo'}<br>${r.endDate ? 'Đến hết ' + friendlyDate(r.endDate) : 'Lặp đến khi bạn bấm dừng'}`;
    const actions = article.querySelector('.rule-actions');
    if (r.stopped || !next) {
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = 'Tạo lại lịch này';
      copy.dataset.copyRule = r.id;
      actions.append(copy);
    } else {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Sửa kỳ tiếp theo';
      edit.dataset.editRule = r.id;
      const stop = document.createElement('button');
      stop.type = 'button';
      stop.className = 'stop-rule';
      stop.textContent = 'Dừng lặp';
      stop.dataset.stopRule = r.id;
      actions.append(edit, stop);
    }
    return article;
  }

  function renderPlanner() {
    let panel = $('#planner');
    if (!panel) return;
    const all = data.recurring || [];
    const rules = all.filter(r => showStoppedRules || (!r.stopped && nextRuleDate(r)));
    const active = all.filter(r => !r.stopped && nextRuleDate(r)).length;
    const nextMonth = shift(month, 1);
    panel.innerHTML = `<div class="planner-top"><div><div class="planner-heading-row"><h2>Khoản chi định kỳ</h2><span class="pill">${active} đang chạy</span></div><p>Wi-Fi, Netflix, tiền nhà… nhớ một lần, ghi đúng kỳ.</p></div><div class="planner-actions"><button class="primary" id="addRecurring">＋ Thêm khoản lặp</button><button id="nextMonthPlan">Mở tháng mới ↗</button></div></div>
      <div id="recurringList"></div>
      <div class="planner-footer"><p class="planner-help">${lastAutomaticCount ? '✓ Đã cập nhật ' + lastAutomaticCount + ' kỳ đến hạn. ' : ''}Tự ghi sổ khi mở web; không thanh toán tiền thật.</p><button id="toggleStopped">${showStoppedRules ? 'Ẩn lịch đã dừng' : 'Xem cả lịch đã dừng / kết thúc'}</button></div>`;
    const list = $('#recurringList');
    if (!rules.length) {
      list.innerHTML = `<div class="planner-empty"><span>↻</span><div><b>${all.length ? 'Không có lịch đang chạy' : 'Đỡ phải nhập lại mỗi tháng'}</b><p>${all.length ? 'Bạn có thể xem lịch đã dừng hoặc thêm khoản lặp mới.' : 'Chọn Wi-Fi hoặc Netflix để thiết lập số tiền, hũ và ngày lặp.'}</p></div></div>`;
    } else {
      list.className = 'recurring-list';
      rules.forEach(r => list.append(ruleCard(r)));
    }
    $('#addRecurring').onclick = () => recurringForm();
    $('#nextMonthPlan').onclick = () => createMonth(data.months[nextMonth] ? shift(Object.keys(data.months).sort().at(-1), 1) : nextMonth);
    $('#toggleStopped').onclick = () => { showStoppedRules = !showStoppedRules; renderPlanner(); };
    list.onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.editRule) recurringForm(b.dataset.editRule);
      if (b.dataset.stopRule) stopRule(b.dataset.stopRule);
      if (b.dataset.copyRule) recurringForm(undefined, b.dataset.copyRule);
    };
    const closed = !!current().closedAt;
    $('#add').disabled = closed;
    $('#fabAdd').disabled = closed;
    $('#add').textContent = closed ? '✓ Tháng đã chốt' : '＋ Ghi chi tiêu';
    $('#budget').disabled = $('#budgetNav').disabled = closed;
    document.querySelectorAll('.jar button,.saving button').forEach(b => { b.disabled = closed; });
    $('#transactions').querySelectorAll('button').forEach(b => { b.disabled = closed; });
  }

  window.recurringForm = function recurringForm(id, copyId, draft) {
    const old = (data.recurring || []).find(r => r.id === (id || copyId)) || draft;
    const editing = !!id;
    const initial = editing ? (recurringCore.nextDate(old, plannerTomorrow()) || plannerTomorrow()) : draft?.date || plannerToday();
    show(`<h2>${editing ? 'Sửa từ kỳ tiếp theo' : 'Thêm khoản chi định kỳ'}</h2><p>${editing ? 'Các giao dịch đã ghi được giữ nguyên.' : 'Đặt một lần, ứng dụng sẽ ghi vào đúng hũ khi đến hạn.'}</p>
      <div class="template-chips" aria-label="Mẫu khoản định kỳ"><button type="button" data-template="Wi-Fi">⌂ Wi-Fi</button><button type="button" data-template="Netflix">▷ Netflix</button><button type="button" data-template="Spotify">♫ Spotify</button><button type="button" data-template="Tiền nhà">⌂ Tiền nhà</button></div>
      <label>Tên khoản chi<input name="ruleNote" maxlength="160" required placeholder="Ví dụ: Wi-Fi ở nhà" value="${esc(old?.note || '')}"></label>
      <label>Trừ / cộng vào hũ<select name="ruleJar">${visibleJars().map(j => `<option value="${j.id}" ${(old?.jar || 'bills') === j.id ? 'selected' : ''}>${j.icon} ${esc(j.name)}</option>`).join('')}</select></label>
      <label id="ruleKindLabel" hidden>Loại giao dịch<select name="ruleKind"><option value="contribute">Góp vào tích lũy</option><option value="withdraw">Rút / chi từ tích lũy</option></select></label>
      <label>Số tiền mỗi kỳ (nghìn đồng)<input name="ruleAmount" type="text" inputmode="decimal" maxlength="16" required placeholder="Ví dụ: 180 = 180.000 ₫" value="${old ? old.amount / 1000 : ''}" aria-describedby="ruleAmountPreview"></label><p id="ruleAmountPreview" aria-live="polite"></p>
      <p><b>Lặp theo</b></p><div class="frequency-choices">${Object.entries(recurringUnits).map(([value, label]) => `<label><input type="radio" name="frequency" value="${value}" ${(old?.frequency || 'month') === value ? 'checked' : ''}>${label[0].toUpperCase() + label.slice(1)}</label>`).join('')}</div>
      <div class="rule-grid"><label>Cứ mỗi<input name="interval" type="number" min="1" max="365" step="1" required value="${old?.interval || 1}"></label><label>Ngày bắt đầu<input name="ruleStart" type="date" min="${editing ? plannerTomorrow() : '1900-01-01'}" max="9999-12-31" required value="${initial}"></label></div>
      <label>Kết thúc<select name="endMode"><option value="forever">Đến khi tôi bấm dừng</option><option value="date">Vào một ngày cụ thể</option></select></label>
      <label id="ruleEndLabel" hidden>Lặp đến hết ngày<input name="ruleEnd" type="date" min="${initial}" max="9999-12-31" value="${old?.endDate && old.endDate >= initial ? old.endDate : initial}"></label>
      <div class="repeat-hint" id="rulePreview" role="status"></div>${buttons(editing ? 'Lưu lịch mới' : 'Bật lặp tự động')}`, fd => {
      const rule = {
        id: crypto.randomUUID(), note: fd.get('ruleNote').trim(), jar: fd.get('ruleJar'),
        amount: readEntryAmount(fd.get('ruleAmount'), 'thousand'),
        kind: saving(fd.get('ruleJar')) ? fd.get('ruleKind') : 'expense',
        frequency: fd.get('frequency'), interval: Number(fd.get('interval')),
        startDate: fd.get('ruleStart'), endDate: fd.get('endMode') === 'date' ? fd.get('ruleEnd') : null,
        stopped: false, skipped: []
      };
      if (editing && rule.startDate === initial && rule.frequency === old.frequency) rule.anchorDay = old.anchorDay || Number(old.startDate.slice(-2));
      if (!recurringCore.validRule(rule, jarDefs.map(j => j.id)) || (editing && rule.startDate < plannerTomorrow())) {
        toast('Kiểm tra tên khoản chi, số tiền và ngày kết thúc.');
        return;
      }
      processRecurring();
      if (editing) { old.stopped = true; old.stoppedAt = plannerToday(); }
      if (draft) { draft.ruleId = rule.id; draft.recurrenceDate = draft.date; }
      data.recurring.push(rule);
      const count = processRecurring();
      const ok = persist();
      $('#dialog').close();
      render();
      if (ok) toast('Đã lưu lịch lặp' + (count ? ' · Ghi nhận ' + count + ' kỳ đến hạn' : ''));
    });
    const f = $('#form');
    f.elements.ruleKind.value = old?.kind === 'withdraw' ? 'withdraw' : 'contribute';
    if (old?.endDate && old.endDate >= initial) f.elements.endMode.value = 'date';
    const update = () => {
      const fd = new FormData(f);
      const amount = readEntryAmount(fd.get('ruleAmount'), 'thousand');
      f.elements.ruleAmount.setCustomValidity(f.elements.ruleAmount.value && !Number.isSafeInteger(amount) ? 'Nhập số tiền hợp lệ.' : '');
      $('#ruleAmountPreview').textContent = Number.isSafeInteger(amount) ? money(amount) : 'Nhập theo nghìn đồng.';
      $('#ruleKindLabel').hidden = !saving(fd.get('ruleJar'));
      const dated = fd.get('endMode') === 'date';
      $('#ruleEndLabel').hidden = !dated;
      f.elements.ruleEnd.required = dated;
      f.elements.ruleEnd.disabled = !dated;
      f.elements.ruleEnd.min = fd.get('ruleStart');
      const r = {frequency: fd.get('frequency'), interval: Number(fd.get('interval')), startDate: fd.get('ruleStart'), endDate: dated ? fd.get('ruleEnd') : null};
      const valid = recurringCore.validDate(r.startDate) && r.interval > 0;
      $('#rulePreview').textContent = valid
        ? repeatLabel(r) + ' từ ' + friendlyDate(r.startDate) + (r.endDate ? ' đến ' + friendlyDate(r.endDate) : ', đến khi bấm dừng') + '.'
        : 'Chọn ngày bắt đầu và chu kỳ lặp.';
    };
    f.onclick = e => {
      const b = e.target.closest('[data-template]');
      if (b) { f.elements.ruleNote.value = b.dataset.template; f.elements.ruleJar.value = 'bills'; f.elements.frequency.value = 'month'; update(); }
    };
    f.oninput = f.onchange = update;
    update();
  };

  function stopRule(id) {
    const rule = data.recurring.find(r => r.id === id);
    if (!rule) return;
    show(`<h2>Dừng lặp ${esc(rule.note)}?</h2><p>Các giao dịch đã ghi được giữ lại.</p>${buttons('Dừng lặp')}`, () => {
      processRecurring();
      rule.stopped = true;
      rule.stoppedAt = plannerToday();
      const ok = persist();
      $('#dialog').close();
      render();
      if (ok) toast('Đã dừng lịch lặp');
    });
  }

  function summaryMarkup(s) {
    return `<div class="close-stats">${[['Thu nhập', s.income], ['Chi sinh hoạt', s.living], ['Tích lũy ròng', s.savings], ['Tiền còn lại', s.remaining]].map(([label, value]) => `<div>${label}<b>${money(value)}</b></div>`).join('')}</div>`;
  }

  function closeMonth() {
    processRecurring();
    const target = month;
    const s = recurringCore.closingSummary(current());
    show(`<h2>Chốt sổ ${title(target)}</h2>${summaryMarkup(s)}<div class="notice">Sau khi chốt, ngân sách và giao dịch sẽ được khóa.</div>${buttons('Xác nhận chốt sổ')}`, () => {
      data.months[target].closedAt = new Date().toISOString();
      data.months[target].closeSummary = recurringCore.closingSummary(data.months[target]);
      const ok = persist();
      $('#dialog').close();
      render();
      if (ok) toast('Đã chốt ' + title(target));
    });
  }

  function reopenMonth() {
    const target = month;
    show(`<h2>Mở lại ${title(target)}?</h2><p>Bạn có thể sửa ngân sách và giao dịch.</p>${buttons('Mở lại tháng')}`, () => {
      delete data.months[target].closedAt;
      delete data.months[target].closeSummary;
      const ok = persist();
      $('#dialog').close();
      render();
      if (ok) toast('Đã mở lại tháng');
    });
  }

  window.budget = function budget() {
    if (monthIsLocked()) return;
    show(`<h2>Thu nhập & chia hũ · ${title(month)}</h2><p>Nhập số tiền đầu tháng (nghìn đồng) và phân bổ vào từng hũ.</p>
      <label>Tổng ngân sách (nghìn đồng)<input type="text" name="budget" inputmode="decimal" maxlength="16" required value="${current().budget ? current().budget / 1000 : ''}"></label>
      <button type="button" class="preset" id="autoSplit">Chia tự động theo tỷ lệ mẫu</button>
      ${visibleJars().map((j, i) => `${j.type === 'saving' && (i === 0 || visibleJars()[i - 1].type !== 'saving') ? '<p><b>Tích lũy — không tính vào đã chi</b></p>' : ''}<label class="budgetrow">${esc(j.name)}<input type="text" name="${j.id}" inputmode="decimal" maxlength="16" required value="${(current().alloc[j.id] || 0) / 1000}"></label>`).join('')}
      <div class="notice" id="allocationStatus" role="status" aria-live="polite"></div>
      <label class="checkline"><input type="checkbox" name="renameGoals"><span>Đổi tên / mục tiêu hũ tích lũy</span></label>
      <div id="goalEditors" hidden>${jarDefs.filter(j => j.type === 'saving').map(j => `<label>${esc(j.name)} — tên mới<input name="name_${j.id}" maxlength="80" value="${esc(j.name)}"></label><label>Mục tiêu (nghìn đồng)<input name="goal_${j.id}" inputmode="decimal" value="${(j.goal || 0) / 1000 || ''}" placeholder="0 = chưa đặt"></label><label class="checkline"><input type="checkbox" name="hide_${j.id}" ${j.hidden ? 'checked' : ''}><span>Ẩn hũ này</span></label>`).join('')}</div>
      ${buttons()}`, fd => {
      const budgetAmt = readMoneyOrZero(fd.get('budget'), 'thousand');
      if (!Number.isSafeInteger(budgetAmt)) { toast('Thu nhập không hợp lệ'); return; }
      const alloc = {};
      for (const j of visibleJars()) {
        const n = readMoneyOrZero(fd.get(j.id), 'thousand');
        if (!Number.isSafeInteger(n)) { toast('Số tiền hũ không hợp lệ'); return; }
        alloc[j.id] = n;
      }
      // keep hidden jar alloc
      for (const j of jarDefs) if (j.hidden && current().alloc[j.id] != null) alloc[j.id] = current().alloc[j.id];
      if (sum(Object.values(alloc)) > budgetAmt) { toast('Tổng tiền chia hũ đang vượt thu nhập.'); return; }
      current().budget = budgetAmt || 0;
      current().alloc = alloc;
      if (fd.get('renameGoals')) {
        for (const j of jarDefs.filter(x => x.type === 'saving')) {
          const name = String(fd.get('name_' + j.id) || '').trim();
          if (name) j.name = name.slice(0, 80);
          const goal = readMoneyOrZero(fd.get('goal_' + j.id) || '0', 'thousand');
          j.goal = Number.isSafeInteger(goal) ? goal : 0;
          j.hidden = !!fd.get('hide_' + j.id);
        }
        data.jars = jarDefs;
        window.jarDefs = jarDefs;
        syncJarViews();
      }
      data.meta.onboardingDone = true;
      const ok = persist();
      $('#dialog').close();
      render();
      if (ok) toast('Đã cập nhật ngân sách');
    });
    const f = $('#form');
    $('#autoSplit').onclick = () => {
      const total = readMoneyOrZero(f.elements.budget.value, 'thousand');
      if (!Number.isSafeInteger(total) || total < 0) return;
      const weight = sum(visibleJars().map(j => j.defaultAlloc)) || 1;
      let left = total;
      visibleJars().forEach((j, i, arr) => {
        const amount = i === arr.length - 1 ? left : Math.floor(total * j.defaultAlloc / weight);
        f.elements[j.id].value = amount / 1000;
        left -= amount;
      });
      f.dispatchEvent(new Event('input'));
    };
    f.elements.renameGoals?.addEventListener('change', () => {
      $('#goalEditors').hidden = !f.elements.renameGoals.checked;
    });
    const update = () => {
      const fd = new FormData(f);
      const budgetAmt = readMoneyOrZero(fd.get('budget'), 'thousand') || 0;
      const allocSum = sum(visibleJars().map(j => readMoneyOrZero(fd.get(j.id), 'thousand') || 0));
      const n = budgetAmt - allocSum;
      $('#allocationStatus').textContent = n === 0 ? '✓ Đã phân bổ vừa đủ ngân sách' : (n > 0 ? 'Chưa phân bổ: ' : 'Phân bổ vượt: ') + money(Math.abs(n));
      $('#allocationStatus').classList.toggle('over', n < 0);
    };
    f.oninput = update;
    update();
  };

  window.createMonth = function createMonth(proposed = shift(month, 1)) {
    processRecurring();
    const sourceKey = month;
    const source = current();
    show(`<h2>Tháng mới, kế hoạch mới</h2><p>Giữ lịch định kỳ, chia lại thu nhập.</p>
      <div class="rule-grid"><label>Tháng mới<input name="month" type="month" min="1900-01" max="9999-12" required value="${proposed.slice(0, 4) + '-' + proposed.slice(4)}"></label>
      <label>Thu nhập (nghìn đồng)<input name="income" type="text" inputmode="decimal" maxlength="16" required placeholder="15000 = 15 triệu"></label></div>
      <p id="incomePreview" aria-live="polite"></p>
      <label class="checkline" id="closePreviousLabel"><input type="checkbox" name="closePrevious" checked><span>Chốt sổ ${title(sourceKey)} khi mở tháng mới</span></label>
      <label class="checkline"><input type="checkbox" name="carryBalance" ${data.meta.carryBalanceDefault ? 'checked' : ''}><span>Mang số dư hũ sinh hoạt còn lại sang tháng mới</span></label>
      <div class="repeat-hint" id="newMonthHint"></div>${buttons('Mở tháng & chia hũ')}`, fd => {
      const key = fd.get('month').replace('-', '');
      if (data.months[key]) { toast('Tháng này đã tồn tại.'); return; }
      const income = readEntryAmount(fd.get('income'), 'thousand');
      if (!Number.isSafeInteger(income)) { toast('Nhập thu nhập hợp lệ theo nghìn đồng.'); return; }
      const closePrevious = fd.get('closePrevious') && key > sourceKey && !source.closedAt;
      if (closePrevious) {
        source.closedAt = new Date().toISOString();
        source.closeSummary = recurringCore.closingSummary(source);
      }
      const previous = data.months[shift(key, -1)] || source;
      const weights = sum(Object.values(previous.alloc)) > 0 ? previous.alloc : Object.fromEntries(jarDefs.map(j => [j.id, j.defaultAlloc]));
      const total = sum(Object.values(weights)) || 1;
      let left = income;
      const alloc = Object.fromEntries(jarDefs.map((j, i) => {
        const amount = i === jarDefs.length - 1 ? left : Math.floor(income * (weights[j.id] || 0) / total);
        left -= amount;
        return [j.id, amount];
      }));
      if (fd.get('carryBalance')) {
        const carry = store.carryLivingBalances(previous, jarDefs);
        for (const [id, bal] of Object.entries(carry)) alloc[id] = (alloc[id] || 0) + bal;
      }
      data.meta.carryBalanceDefault = !!fd.get('carryBalance');
      data.months[key] = {budget: income, alloc, tx: []};
      month = key;
      $('#filter').value = '';
      const ok = persist();
      $('#dialog').close();
      render();
      if (ok) { toast('Đã mở ' + title(key) + (closePrevious ? ' và chốt tháng cũ' : '')); budget(); }
    });
    const f = $('#form');
    const update = () => {
      const income = readEntryAmount(f.elements.income.value, 'thousand');
      const key = f.elements.month.value.replace('-', '');
      f.elements.income.setCustomValidity(f.elements.income.value && !Number.isSafeInteger(income) ? 'Nhập thu nhập lớn hơn 0 theo nghìn đồng.' : '');
      $('#incomePreview').textContent = Number.isSafeInteger(income) ? money(income) : 'Ví dụ: nhập 15000 để chia ngân sách 15.000.000 ₫.';
      const canClose = key > sourceKey && !source.closedAt;
      $('#closePreviousLabel').hidden = !canClose;
      f.elements.closePrevious.disabled = !canClose;
      $('#newMonthHint').textContent = data.months[key] ? 'Tháng này đã tồn tại.' : 'Sao chép tỷ lệ hũ; lịch định kỳ được giữ.';
    };
    f.oninput = f.onchange = update;
    update();
  };

  function transferJars() {
    if (monthIsLocked()) return;
    show(`<h2>Chuyển tiền giữa hũ</h2><p>Điều chỉnh trong tháng mà không đổi tổng ngân sách.</p>
      <label>Từ hũ<select name="from">${livingJars().concat(savingJars()).map(j => `<option value="${j.id}">${j.icon} ${esc(j.name)}</option>`).join('')}</select></label>
      <label>Đến hũ<select name="to">${livingJars().concat(savingJars()).map(j => `<option value="${j.id}">${j.icon} ${esc(j.name)}</option>`).join('')}</select></label>
      <label>Số tiền (nghìn đồng)<input name="amount" type="text" inputmode="decimal" required placeholder="100"></label>
      <label>Ghi chú<input name="note" maxlength="160" placeholder="Chuyển quỹ"></label>
      ${buttons('Chuyển')}`, fd => {
      const from = fd.get('from');
      const to = fd.get('to');
      const amount = readEntryAmount(fd.get('amount'), 'thousand');
      if (from === to || !Number.isSafeInteger(amount)) { toast('Chọn hai hũ khác nhau và số tiền hợp lệ.'); return; }
      const pair = crypto.randomUUID();
      const date = plannerToday().slice(0, 7).replace('-', '') === month
        ? plannerToday()
        : month.slice(0, 4) + '-' + month.slice(4) + '-01';
      const note = (fd.get('note') || 'Chuyển hũ').trim().slice(0, 160);
      current().tx.push(
        {id: crypto.randomUUID(), jar: from, amount, date, note, kind: saving(from) ? 'withdraw' : 'transfer-out', transferPairId: pair},
        {id: crypto.randomUUID(), jar: to, amount, date, note, kind: saving(to) ? 'contribute' : 'transfer-in', transferPairId: pair}
      );
      const ok = persist();
      $('#dialog').close();
      render();
      if (ok) toast('Đã chuyển ' + money(amount));
    });
  }

  function addIncome() {
    if (monthIsLocked()) return;
    show(`<h2>Khoản thu giữa tháng</h2><p>Thưởng, thu nhập thêm — cộng vào ngân sách và một hũ.</p>
      <label>Số tiền (nghìn đồng)<input name="amount" type="text" inputmode="decimal" required></label>
      <label>Vào hũ<select name="jar">${visibleJars().map(j => `<option value="${j.id}">${j.icon} ${esc(j.name)}</option>`).join('')}</select></label>
      <label>Ghi chú<input name="note" maxlength="160" placeholder="Thưởng"></label>
      <label>Ngày<input name="date" type="date" required value="${plannerToday().slice(0, 7).replace('-', '') === month ? plannerToday() : month.slice(0, 4) + '-' + month.slice(4) + '-01'}"></label>
      ${buttons('Ghi khoản thu')}`, fd => {
      const amount = readEntryAmount(fd.get('amount'), 'thousand');
      const jar = fd.get('jar');
      const date = fd.get('date');
      const min = month.slice(0, 4) + '-' + month.slice(4) + '-01';
      const max = min.slice(0, 8) + new Date(Number(month.slice(0, 4)), Number(month.slice(4)), 0).getDate();
      if (!Number.isSafeInteger(amount) || date < min || date > max) { toast('Kiểm tra số tiền và ngày.'); return; }
      current().budget += amount;
      current().alloc[jar] = (current().alloc[jar] || 0) + amount;
      current().tx.push({
        id: crypto.randomUUID(), jar, amount, date,
        note: (fd.get('note') || 'Khoản thu').trim().slice(0, 160),
        kind: saving(jar) ? 'contribute' : 'income'
      });
      const ok = persist();
      $('#dialog').close();
      render();
      if (ok) toast('Đã ghi khoản thu ' + money(amount));
    });
  }

  function exportCsv() {
    const rows = [['month', 'date', 'jar', 'kind', 'amount', 'note']];
    for (const [key, m] of Object.entries(data.months).sort()) {
      for (const t of m.tx) rows.push([key, t.date, t.jar, t.kind || 'expense', t.amount, JSON.stringify(t.note || '')]);
    }
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hu-report-' + month + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Đã xuất CSV');
  }

  function monthReport() {
    const m = current();
    const living = recurringCore.closingSummary(m);
    const text = `Báo cáo ${title(month)}\nThu nhập: ${money(living.income)}\nChi sinh hoạt: ${money(living.living)}\nTích lũy ròng: ${money(living.savings)}\nCòn lại: ${money(living.remaining)}\nGiao dịch: ${living.transactions}`;
    show(`<h2>Báo cáo ${title(month)}</h2><pre style="white-space:pre-wrap;font-size:13px;line-height:1.7">${esc(text)}</pre>
      <div class="buttons"><button type="button" data-cancel>Đóng</button><button class="primary" type="button" id="copyReport">Sao chép</button><button type="button" id="csvReport">Xuất CSV</button></div>`, () => {});
    $('#copyReport').onclick = async () => {
      try { await navigator.clipboard.writeText(text); toast('Đã sao chép báo cáo'); } catch { toast('Không sao chép được'); }
    };
    $('#csvReport').onclick = () => { exportCsv(); $('#dialog').close(); };
    $('#form').onsubmit = e => e.preventDefault();
  }

  function renderInsights() {
    const panel = $('#insights');
    if (!panel) return;
    const keys = Object.keys(data.months).sort().slice(-6);
    const maxLiving = Math.max(1, ...keys.map(k => recurringCore.closingSummary(data.months[k]).living));
    panel.innerHTML = `<div class="sectionhead"><div><h2>Xu hướng gần đây</h2><p>Chi sinh hoạt 6 tháng gần nhất.</p></div>
      <div class="toolbar-row"><button id="reportBtn">Báo cáo tháng</button><button id="csvBtn">Xuất CSV</button></div></div>
      <div class="chart-wrap"><div class="chart-bars" id="trendChart"></div></div>
      <div class="insight-grid" id="insightStats"></div>
      <div class="panel-card" style="margin-top:16px"><h2>Cài đặt & bảo mật</h2>
        <div class="settings-grid">
          <label class="checkline"><input type="checkbox" id="pinToggle" ${data.meta.pinEnabled ? 'checked' : ''}><span>Bảo vệ bằng PIN (mã hóa AES trên thiết bị)</span></label>
          <button id="setPinBtn">Đặt / đổi PIN</button>
          <label>Nhắc sao lưu mỗi (ngày)<input type="number" id="backupDays" min="0" max="90" value="${data.meta.backupReminderDays ?? 14}"></label>
          <button id="enableNotif">Bật nhắc thông báo (opt-in)</button>
          <button id="installPwaHelp">Cài Hũ như ứng dụng (PWA)</button>
        </div></div>`;
    const chart = $('#trendChart');
    for (const k of keys) {
      const living = recurringCore.closingSummary(data.months[k]).living;
      const col = document.createElement('div');
      const bar = document.createElement('div');
      bar.className = 'col';
      bar.style.height = Math.max(4, Math.round(living / maxLiving * 160)) + 'px';
      bar.title = money(living);
      const label = document.createElement('small');
      label.textContent = k.slice(4) + '/' + k.slice(2, 4);
      col.append(bar, label);
      chart.append(col);
    }
    const latest = recurringCore.closingSummary(current());
    $('#insightStats').innerHTML = [
      ['Tỷ lệ tiết kiệm tháng này', latest.income ? Math.round(latest.savings / latest.income * 100) + '%' : '—'],
      ['Số tháng đã ghi', Object.keys(data.months).length],
      ['Lịch định kỳ', (data.recurring || []).filter(r => !r.stopped).length + ' đang chạy'],
      ['Lần sao lưu gần nhất', data.meta.lastBackupAt ? friendlyDate(data.meta.lastBackupAt.slice(0, 10)) : 'Chưa có']
    ].map(([t, v]) => `<div class="stat"><small>${t}</small><strong>${v}</strong></div>`).join('');
    $('#reportBtn').onclick = monthReport;
    $('#csvBtn').onclick = exportCsv;
    $('#backupDays').onchange = e => {
      data.meta.backupReminderDays = Number(e.target.value) || 0;
      persist();
      toast('Đã lưu lịch nhắc sao lưu');
    };
    $('#setPinBtn').onclick = setupPin;
    $('#pinToggle').onchange = e => {
      if (e.target.checked) setupPin();
      else {
        data.meta.pinEnabled = false;
        cryptoPin = null;
        persist();
        toast('Đã tắt PIN — dữ liệu lưu plaintext');
      }
    };
    $('#enableNotif').onclick = async () => {
      if (!('Notification' in window)) { toast('Trình duyệt không hỗ trợ thông báo'); return; }
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        new Notification('Hũ', {body: 'Đã bật nhắc. Bạn sẽ được nhắc sao lưu khi đến hạn.', icon: './icon.svg'});
        toast('Đã bật thông báo');
      } else toast('Chưa được cấp quyền thông báo');
    };
    $('#installPwaHelp').onclick = () => toast('Trên trình duyệt: menu → Cài đặt ứng dụng / Add to Home Screen');
  }

  function setupPin() {
    show(`<h2>Đặt PIN bảo vệ</h2><p>PIN không được gửi đi đâu. Quên PIN = không mở được dữ liệu đã mã hóa (hãy giữ bản sao lưu).</p>
      <label>PIN (4–12 số)<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,12}" maxlength="12" required></label>
      <label>Nhập lại PIN<input name="pin2" type="password" inputmode="numeric" pattern="[0-9]{4,12}" maxlength="12" required></label>
      ${buttons('Lưu PIN')}`, async fd => {
      const pin = fd.get('pin');
      if (pin !== fd.get('pin2') || !/^[0-9]{4,12}$/.test(pin)) { toast('PIN không khớp hoặc không hợp lệ'); return; }
      cryptoPin = pin;
      data.meta.pinEnabled = true;
      const envelope = await store.encryptStore(data, pin);
      localStorage.setItem(store.STORAGE_KEY, JSON.stringify(envelope));
      $('#dialog').close();
      toast('Đã bật mã hóa PIN');
      render();
    });
  }

  function maybeBackupReminder() {
    const days = data.meta.backupReminderDays ?? 14;
    if (!days || !data.meta.onboardingDone) return;
    const hasTx = Object.values(data.months).some(m => m.tx?.length);
    if (!hasTx) return;
    const last = data.meta.lastBackupAt ? Date.parse(data.meta.lastBackupAt) : 0;
    if (Date.now() - last > days * 86400000) {
      toast('Đến lúc sao lưu dữ liệu Hũ');
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('Hũ · Nhắc sao lưu', {body: 'Đã hơn ' + days + ' ngày chưa sao lưu.', icon: './icon.svg'});
      }
    }
  }

  function render() {
    if (!sessionUnlocked || !data) return;
    processRecurring();
    syncJarViews();
    const mkeys = Object.keys(data.months).sort();
    $('#month').innerHTML = mkeys.map(k => `<option value="${k}" ${k === month ? 'selected' : ''}>${title(k)}</option>`).join('');
    $('#monthTitle').textContent = title(month);
    renderSummary();
    renderOnboarding();
    renderMonthState();
    renderJars();
    const filter = $('#filter').value;
    $('#filter').innerHTML = '<option value="">Tất cả các hũ</option>' + visibleJars().map(j => `<option value="${j.id}">${esc(j.name)}</option>`).join('');
    $('#filter').value = filter;
    renderHistory();
    renderPlanner();
    renderInsights();
    document.body.classList.remove('tab-overview', 'tab-history', 'tab-recurring', 'tab-insights');
    document.body.classList.add('tab-' + tab);
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    const overview = $('#overview');
    const history = $('#historySection');
    const planner = $('#planner');
    const insights = $('#insights');
    const monthState = $('#monthState');
    if (overview) overview.hidden = tab !== 'overview';
    if (history) history.hidden = tab !== 'history';
    if (planner) planner.hidden = tab !== 'recurring';
    if (insights) insights.hidden = tab !== 'insights';
    if (monthState) monthState.hidden = tab !== 'overview';
    document.querySelectorAll('.onboard,.setup').forEach(el => { el.hidden = tab !== 'overview'; });
    $('#historyTitle').textContent = tab === 'history' ? 'Lịch sử giao dịch' : 'Giao dịch trong tháng';
    maybeBackupReminder();
  }
  window.render = render;

  async function loadStore() {
    const raw = localStorage.getItem(store.STORAGE_KEY);
    if (!raw) {
      data = store.emptyStore();
      month = Object.keys(data.months).sort().at(-1);
      window.jarDefs = data.jars;
      syncJarViews();
      return;
    }
    let parsed = store.parseSizeSafe(raw);
    if (!parsed) {
      data = store.seedStore();
      month = '202610';
      window.jarDefs = data.jars;
      syncJarViews();
      return;
    }
    if (parsed.encrypted) {
      sessionUnlocked = false;
      cryptoPin = await requestPinUnlock();
      try {
        parsed = await store.decryptStore(parsed, cryptoPin);
      } catch {
        cryptoPin = null;
        toast('PIN không đúng');
        return loadStore();
      }
      sessionUnlocked = true;
    }
    const migrated = store.migrateToV2(parsed);
    if (!store.validateStore(migrated, recurringCore)) {
      data = store.seedStore();
      month = '202610';
      window.jarDefs = data.jars;
      syncJarViews();
      toast('Dữ liệu không hợp lệ — đã tải bản mẫu');
      return;
    }
    data = migrated;
    window.jarDefs = data.jars;
    syncJarViews();
    month = Object.keys(data.months).sort().at(-1);
  }

  function requestPinUnlock() {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'lock-screen';
      overlay.innerHTML = `<div class="lock-card"><h2>Nhập PIN</h2><p>Dữ liệu Hũ đang được mã hóa trên thiết bị này.</p>
        <label>PIN<input id="unlockPin" type="password" inputmode="numeric" maxlength="12" autofocus></label>
        <div class="buttons"><button class="primary" type="button" id="unlockBtn">Mở</button></div></div>`;
      document.body.append(overlay);
      const done = () => {
        const pin = $('#unlockPin').value;
        overlay.remove();
        resolve(pin);
      };
      $('#unlockBtn').onclick = done;
      $('#unlockPin').onkeydown = e => { if (e.key === 'Enter') done(); };
    });
  }

  function wireEvents() {
    $('#add').onclick = () => transaction();
    $('#fabAdd').onclick = () => transaction();
    $('#budget').onclick = $('#budgetNav').onclick = () => budget();
    $('#newMonth').onclick = () => createMonth();
    $('#transferBtn').onclick = () => transferJars();
    $('#incomeBtn').onclick = () => addIncome();
    $('#month').onchange = e => { month = e.target.value; $('#filter').value = ''; render(); };
    for (const [id, n] of [['prev', -1], ['next', 1]]) {
      $('#' + id).onclick = () => {
        const k = shift(month, n);
        if (data.months[k]) { month = k; render(); }
        else createMonth(k);
      };
    }
    $('#filter').onchange = renderHistory;
    $('#historySearch').oninput = e => { historyQuery.q = e.target.value.trim(); renderHistory(); };
    $('#historyFrom').onchange = e => { historyQuery.from = e.target.value; renderHistory(); };
    $('#historyTo').onchange = e => { historyQuery.to = e.target.value; renderHistory(); };
    document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
    $('#transactions').onclick = e => {
      const b = e.target.closest('button');
      if (!b || monthIsLocked()) return;
      if (b.dataset.edit) {
        transaction(b.dataset.edit);
        return;
      }
      if (b.dataset.delete) {
        const t = current().tx.find(x => x.id === b.dataset.delete);
        if (t?.ruleId) {
          show(`<h2>Bỏ kỳ ${esc(t.note)}?</h2><p>Khoản ${money(t.amount)} sẽ không tự tạo lại.</p>${buttons('Bỏ kỳ này')}`, () => {
            const rule = data.recurring.find(r => r.id === t.ruleId);
            if (rule) {
              rule.skipped ||= [];
              if (!rule.skipped.includes(t.recurrenceDate)) rule.skipped.push(t.recurrenceDate);
            }
            current().tx = current().tx.filter(x => x.id !== t.id);
            const ok = persist();
            $('#dialog').close();
            render();
            if (ok) toast('Đã bỏ kỳ này');
          });
        } else {
          show(`<h2>Xóa giao dịch?</h2><p>Số dư hũ sẽ được tính lại ngay sau khi xóa.</p>${buttons('Xóa giao dịch')}`, () => {
            current().tx = current().tx.filter(x => x.id !== b.dataset.delete);
            if (t?.transferPairId) current().tx = current().tx.filter(x => x.transferPairId !== t.transferPairId);
            const ok = persist();
            $('#dialog').close();
            render();
            if (ok) toast('Đã xóa giao dịch');
          });
        }
      }
    };
    $('#export').onclick = () => {
      downloadBackup(data);
      data.meta.lastBackupAt = new Date().toISOString();
      persist();
      toast('Đã xuất bản sao lưu');
    };
    $('#import').onclick = () => $('#importFile').click();
    $('#importFile').onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        if (file.size > 5_000_000) throw new Error('size');
        const text = await file.text();
        if (text.length > store.MAX_JSON_CHARS) throw new Error('size');
        let parsed = JSON.parse(text);
        if (parsed.encrypted) {
          const pin = prompt('Bản sao lưu đang mã hóa. Nhập PIN:');
          parsed = await store.decryptStore(parsed, pin);
        }
        parsed = store.migrateToV2(parsed);
        if (!store.validateStore(parsed, recurringCore)) throw new Error('invalid');
        show(`<h2>Nhập bản sao lưu?</h2><p>Có ${Object.keys(parsed.months).length} tháng. Dữ liệu hiện tại sẽ được thay thế. Một bản autosave sẽ được tải xuống trước.</p>${buttons('Nhập dữ liệu')}`, () => {
          autoBackupBeforeOverwrite();
          data = parsed;
          window.jarDefs = data.jars;
          syncJarViews();
          month = Object.keys(data.months).sort().at(-1);
          const ok = persist();
          $('#dialog').close();
          $('#filter').value = '';
          render();
          if (ok) toast('Đã nhập bản sao lưu');
        });
      } catch {
        toast('File không hợp lệ hoặc quá lớn.');
      } finally {
        e.target.value = '';
      }
    };
    $('#reset').onclick = () => show(`<h2>Khôi phục dữ liệu mẫu?</h2><p>Toàn bộ thay đổi sẽ được thay bằng tháng mẫu. Autosave sẽ được tải trước.</p>${buttons('Khôi phục')}`, () => {
      autoBackupBeforeOverwrite();
      data = store.seedStore();
      window.jarDefs = data.jars;
      syncJarViews();
      month = '202610';
      const ok = persist();
      $('#dialog').close();
      $('#filter').value = '';
      render();
      if (ok) toast('Đã khôi phục dữ liệu mẫu');
    });
    $('#deleteMonth').onclick = () => {
      if (Object.keys(data.months).length <= 1) { toast('Cần giữ ít nhất một tháng'); return; }
      show(`<h2>Xóa ${title(month)}?</h2><p>Không thể hoàn tác. Tích lũy ở tháng khác vẫn giữ.</p>${buttons('Xóa tháng')}`, () => {
        autoBackupBeforeOverwrite();
        delete data.months[month];
        month = Object.keys(data.months).sort().at(-1);
        const ok = persist();
        $('#dialog').close();
        render();
        if (ok) toast('Đã xóa tháng');
      });
    };

    // Wrap transaction with lock
    const entry = window.transaction;
    window.transaction = function (...args) {
      if (monthIsLocked()) return;
      return entry(...args);
    };

    let idleTimer;
    const bump = () => {
      clearTimeout(idleTimer);
      if (!data?.meta?.pinEnabled) return;
      idleTimer = setTimeout(() => {
        if (data.meta.pinEnabled && cryptoPin) {
          persist();
          cryptoPin = null;
          sessionUnlocked = false;
          location.reload();
        }
      }, 15 * 60 * 1000);
    };
    ['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, bump));
    bump();

    window.addEventListener('focus', () => { if (!$('#dialog').open && sessionUnlocked) { processRecurring(); } });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !$('#dialog').open && sessionUnlocked) processRecurring();
    });
    setInterval(() => {
      if (!document.hidden && !$('#dialog').open && sessionUnlocked) processRecurring();
    }, 60000);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  window.bootHu = async function bootHu() {
    await loadStore();
    if (!sessionUnlocked) return;
    wireEvents();
    persist();
    render();
  };
})();
