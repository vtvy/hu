// Amounts remain integer VND in storage. Only the entry field uses thousands.
const quickDefaults = {
  food: [25000, 35000, 50000, 55000, 70000, 100000],
  bills: [50000, 100000, 150000, 200000, 300000, 500000],
  travel: [5000, 10000, 20000, 30000, 50000, 100000],
  personal: [30000, 50000, 100000, 150000, 200000, 300000],
  friends: [25000, 35000, 50000, 55000, 75000, 100000],
  irregular: [50000, 100000, 200000, 300000, 500000, 1000000],
  reserve: [100000, 200000, 500000, 1000000, 2000000, 5000000],
  wedding: [500000, 1000000, 2000000, 3000000, 5000000, 10000000]
};
const noteDefaults = {
  food: ['Ăn sáng', 'Ăn trưa', 'Ăn tối', 'Đi chợ'],
  bills: ['Tiền điện', 'Tiền nước', 'Internet', 'Điện thoại'],
  travel: ['Đổ xăng', 'Gửi xe', 'Đặt xe'],
  personal: ['Đồ dùng cá nhân', 'Chăm sóc bản thân'],
  friends: ['Cà phê', 'Hẹn hò', 'Gặp bạn bè'],
  irregular: ['Mua sắm', 'Sửa chữa', 'Quà tặng']
};
function shortMoney(amount) {
  return new Intl.NumberFormat('vi-VN', {maximumFractionDigits: 3}).format(amount / 1000) + 'k';
}
function entryHistory(jar, kind = 'expense', excludedId) {
  return Object.entries(data.months)
    .filter(([key]) => key <= month)
    .flatMap(([, value]) => value.tx)
    .filter(t => t.jar === jar && t.id !== excludedId &&
      (!saving(jar) || (t.kind === 'withdraw' ? 'withdraw' : 'contribute') === kind));
}
function rankedChoices(items, keyFor) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFor(item);
    const group = groups.get(key) || {item, count: 0, latest: ''};
    group.count++;
    if (item.date >= group.latest) { group.latest = item.date; group.item = item; }
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest));
}
function suggestedAmounts(jar, kind = 'expense', excludedId) {
  const learned = rankedChoices(entryHistory(jar, kind, excludedId), t => t.amount).map(x => x.item.amount);
  return [...new Set([...learned.slice(0, 4), ...quickDefaults[jar]])].slice(0, 6);
}
function readEntryAmount(value, unit) {
  const text = String(value).trim();
  if (!(unit === 'thousand' ? /^\d+(?:[.,]\d{1,3})?$/ : /^\d+$/).test(text)) return NaN;
  const raw = Number(text.replace(',', '.')) * (unit === 'thousand' ? 1000 : 1);
  const rounded = Math.round(raw);
  return Number.isFinite(raw) && Math.abs(raw - rounded) < 0.0001 &&
    Number.isSafeInteger(rounded) && rounded > 0 && rounded <= 1000000000000 ? rounded : NaN;
}

function transaction(id, selected, preset) {
  const editing = current().tx.find(t => t.id === id);
  const jar = editing?.jar || selected || 'food';
  const min = month.slice(0, 4) + '-' + month.slice(4) + '-01';
  const max = min.slice(0, 8) + new Date(Number(month.slice(0, 4)), Number(month.slice(4)), 0).getDate();
  const today = new Date();
  const localDate = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
  const date = localDate >= min && localDate <= max ? localDate : min;
  const initialAmount = editing?.amount || preset?.amount;
  show(`
    <div class="entry-heading"><span class="eyebrow">GHI NHANH · NHẸ ĐẦU</span><h2>${editing ? 'Sửa giao dịch' : 'Hôm nay bạn chi gì?'}</h2>
    <p>Chọn hũ, chạm số tiền, rồi lưu là xong.</p></div>
    <div class="entry-selects"><label>Chọn hũ<select name="jar">${jars.map(j => `<option value="${j[0]}" ${jar === j[0] ? 'selected' : ''}>${j[3]} ${j[1]}</option>`).join('')}</select></label>
    <label id="kindLabel">Loại giao dịch<select name="kind"><option value="contribute">Góp vào tích lũy</option><option value="withdraw">Rút / chi từ tích lũy</option></select></label></div>
    <div class="entry-money"><div class="entry-money-head"><label for="entryAmount">Số tiền</label><select name="unit" aria-label="Đơn vị nhập tiền"><option value="thousand">Nghìn đồng (× 1.000)</option><option value="dong">Đồng (₫)</option></select></div>
    <div class="entry-amount-wrap"><input id="entryAmount" name="amount" type="text" maxlength="16" inputmode="decimal" autocomplete="off" required placeholder="35" value="${initialAmount ? initialAmount / 1000 : ''}" aria-describedby="amountPreview amountHelp"><span id="amountSuffix" aria-hidden="true">nghìn ₫</span></div>
    <div id="amountPreview" class="amount-preview" aria-live="polite"></div><p id="amountHelp">Gõ 35 = 35.000 ₫ · Gõ 35,5 = 35.500 ₫</p></div>
    <section class="entry-suggestions" aria-label="Chọn nhanh số tiền"><div class="entry-section-title">Chạm để chọn số tiền <span id="amountSource"></span></div><div class="amount-chips" id="amountChoices"></div></section>
    <section class="entry-suggestions" id="repeatSection" hidden><div class="entry-section-title">Bạn hay ghi <span>Theo lịch sử của hũ này</span></div><div class="repeat-chips" id="repeatChoices"></div></section>
    <label>Ghi chú <span class="optional">Không bắt buộc</span><input name="note" maxlength="160" placeholder="Chọn gợi ý bên dưới hoặc nhập thêm…" value="${esc(editing?.note || preset?.note || '')}"></label>
    <div class="note-chips" id="noteChoices" aria-label="Gợi ý ghi chú"></div>
    ${editing?.ruleId ? '<p class="planner-help">↻ Bạn đang sửa riêng kỳ này. Để đổi các kỳ sau, dùng “Sửa kỳ tiếp theo” trong Khoản chi định kỳ.</p>' : '<label class="checkline"><input type="checkbox" name="setupRepeat"><span>Lặp lại khoản này<br><small>Chọn chu kỳ và ngày kết thúc sau khi lưu.</small></span></label>'}
    <label>Ngày<input name="date" type="date" min="${min}" max="${max}" value="${editing?.date || date}" required></label>
    <div class="notice balance-hint" id="balanceHint" role="status"></div>
    ${buttons(editing ? 'Lưu thay đổi' : 'Lưu giao dịch')}
  `, fd => {
    const amount = readEntryAmount(fd.get('amount'), fd.get('unit'));
    const selectedJar = fd.get('jar'), selectedDate = fd.get('date');
    if (!Number.isSafeInteger(amount) || selectedDate < min || selectedDate > max) {
      toast('Kiểm tra số tiền và ngày giao dịch trước khi lưu.'); return;
    }
    const entry = {id: editing?.id || crypto.randomUUID(), jar: selectedJar, amount,
      date: selectedDate, note: fd.get('note').trim(),
      kind: saving(selectedJar) ? fd.get('kind') : 'expense'};
    if (editing?.ruleId) Object.assign(entry, {ruleId: editing.ruleId, recurrenceDate: editing.recurrenceDate, automatic: editing.automatic});
    if (editing) current().tx[current().tx.findIndex(t => t.id === id)] = entry;
    else current().tx.push(entry);
    const ok = persist();
    $('#dialog').close(); render();
    if (ok) toast('Đã lưu ' + money(amount) + ' · ' + jars.find(j => j[0] === selectedJar)[1]);
    if (ok && fd.get('setupRepeat') && typeof recurringForm === 'function') recurringForm(undefined, undefined, entry);
  });
  const form = $('#form'), amountInput = form.elements.amount, unitInput = form.elements.unit;
  form.elements.kind.value = editing?.kind === 'withdraw' ? 'withdraw' : 'contribute';
  let previousUnit = 'thousand';
  function setAmount(amount) {
    amountInput.value = unitInput.value === 'thousand' ? amount / 1000 : amount;
  }
  function updatePreview() {
    const selectedJar = form.elements.jar.value, isSaving = saving(selectedJar);
    const kind = isSaving ? form.elements.kind.value : 'expense';
    const parsed = readEntryAmount(amountInput.value, unitInput.value);
    const amount = Number.isSafeInteger(parsed) ? parsed : 0;
    amountInput.setCustomValidity(amountInput.value && !amount ? 'Nhập số tiền lớn hơn 0. Ví dụ: 35 hoặc 35,5 nghìn đồng.' : '');
    $('#amountPreview').textContent = amount ? money(amount) : amountInput.value ? 'Số tiền chưa hợp lệ' : 'Chọn số tiền bên dưới hoặc nhập nhanh';
    const history = entryHistory(selectedJar, kind, id);
    const balance = isSaving ? sum(Object.entries(data.months).filter(([key]) => key <= month)
      .flatMap(([, m]) => m.tx.filter(t => t.jar === selectedJar && t.id !== id)
        .map(t => t.kind === 'withdraw' ? -t.amount : t.amount))) :
      current().alloc[selectedJar] - sum(history.map(t => t.amount));
    const after = balance + (isSaving && kind === 'contribute' ? amount : -amount);
    $('#balanceHint').innerHTML = '<span>Số dư hũ <b>' + money(balance) + '</b></span><span>Sau giao dịch <b>' + money(after) + '</b></span>' + (after < 0 ? '<span>Khoản này vượt số dư hũ.</span>' : '');
    $('#balanceHint').classList.toggle('over', after < 0);
    form.querySelectorAll('[data-amount]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.amount) === parsed)));
    form.querySelectorAll('[data-note]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.note === form.elements.note.value)));
    form.querySelectorAll('[data-repeat-amount]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.repeatAmount) === parsed && b.dataset.repeatNote === form.elements.note.value)));
  }
  function renderSuggestions() {
    const selectedJar = form.elements.jar.value, isSaving = saving(selectedJar);
    const kind = isSaving ? form.elements.kind.value : 'expense';
    $('#kindLabel').hidden = !isSaving;
    const history = entryHistory(selectedJar, kind, id);
    $('#amountSource').textContent = history.length ? 'Ưu tiên số tiền bạn hay dùng' : 'Gợi ý cho hũ này';
    $('#amountChoices').innerHTML = suggestedAmounts(selectedJar, kind, id).map(amount =>
      `<button type="button" data-amount="${amount}" aria-label="Chọn ${money(amount)}" aria-pressed="false">${shortMoney(amount)}</button>`).join('');
    const repeats = rankedChoices(history.filter(t => t.note.trim()), t => JSON.stringify([t.note.trim(), t.amount])).slice(0, 4);
    $('#repeatSection').hidden = !repeats.length;
    $('#repeatChoices').innerHTML = repeats.map(({item, count}) =>
      `<button type="button" data-repeat-amount="${item.amount}" data-repeat-note="${esc(item.note)}" aria-pressed="false"><span>${esc(item.note)}</span><strong>${shortMoney(item.amount)}</strong><small>${count} lần</small></button>`).join('');
    const notes = [...new Set([...rankedChoices(history.filter(t => t.note.trim()), t => t.note.trim()).map(x => x.item.note.trim()), ...(noteDefaults[selectedJar] || [])])].slice(0, 5);
    $('#noteChoices').innerHTML = notes.map(note => `<button type="button" data-note="${esc(note)}" aria-pressed="false">${esc(note)}</button>`).join('');
    updatePreview();
  }
  form.onclick = event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.amount) setAmount(Number(button.dataset.amount));
    if (button.dataset.repeatAmount) { setAmount(Number(button.dataset.repeatAmount)); form.elements.note.value = button.dataset.repeatNote; }
    if (button.dataset.note !== undefined) form.elements.note.value = button.dataset.note;
    updatePreview();
  };
  form.oninput = updatePreview;
  form.onchange = event => {
    if (event.target === unitInput) {
      const amount = readEntryAmount(amountInput.value, previousUnit);
      previousUnit = unitInput.value;
      amountInput.inputMode = previousUnit === 'thousand' ? 'decimal' : 'numeric';
      $('#amountSuffix').textContent = previousUnit === 'thousand' ? 'nghìn ₫' : '₫';
      $('#amountHelp').textContent = previousUnit === 'thousand' ? 'Gõ 35 = 35.000 ₫ · Gõ 35,5 = 35.500 ₫' : 'Nhập đầy đủ số tiền bằng đồng. Ví dụ: 35000.';
      amountInput.placeholder = previousUnit === 'thousand' ? '35' : '35000';
      if (Number.isSafeInteger(amount)) setAmount(amount);
    }
    if (event.target === form.elements.jar || event.target === form.elements.kind) renderSuggestions();
    else updatePreview();
  };
  renderSuggestions();
}
