// Recurrence is processed locally on open/resume. No payment API is called.
const recurringUnits = {day:'ngày',week:'tuần',month:'tháng',year:'năm'};
const recurringCore = HuRecurring;
const plannerToday = () => { const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'); };
const friendlyDate = date => date ? date.split('-').reverse().join('/') : '';
const plannerTomorrow = () => { const d=new Date(plannerToday()+'T12:00:00');d.setDate(d.getDate()+1);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'); };
const repeatLabel = r => 'Mỗi '+(r.interval===1?'':r.interval+' ')+recurringUnits[r.frequency];
data.recurring ||= [];
let showStoppedRules = false;
let lastAutomaticCount = 0;

function processRecurring() {
  data.recurring ||= [];
  const count=recurringCore.sync(data,plannerToday());
  if(count){lastAutomaticCount=count;persist();}
  return count;
}
function monthIsLocked() {
  if(!current().closedAt)return false;
  toast('Tháng đã chốt. Bấm “Mở lại tháng” trước khi chỉnh sửa.');return true;
}
function renderPlanner() {
  const closed=!!current().closedAt;
  let state=$('#monthState');
  if(!state){state=document.createElement('section');state.id='monthState';$('#summary').after(state);}
  state.className='month-state'+(closed?' closed':'');
  const nextMonth=shift(month,1),summary=closed?current().closeSummary:recurringCore.closingSummary(current());
  state.innerHTML=closed?`<div><h3>✓ ${title(month)} đã chốt sổ</h3><p>Đã chi ${money(summary.living)} · Tích lũy ròng ${money(summary.savings)}. Mở lại tháng nếu cần điều chỉnh.</p></div><button id="reopenMonth">Mở lại tháng</button>`:
    `<div><h3>${title(month)} đang mở</h3><p>${month<plannerToday().replaceAll('-','').slice(0,6)?'Đã sang tháng mới. Bạn có thể xem tổng kết, chốt sổ và bắt đầu tháng tiếp theo.':'Ghi chi hằng ngày. Cuối tháng, xem tổng kết rồi chốt để giữ nguyên số liệu.'}</p></div><button id="closeMonth">Chốt sổ tháng</button>`;
  if(closed)$('#reopenMonth').onclick=reopenMonth;else $('#closeMonth').onclick=closeMonth;
  let panel=$('#planner');
  if(!panel){panel=document.createElement('section');panel.id='planner';panel.className='planner';state.after(panel);}
  const all=data.recurring||[],rules=all.filter(r=>showStoppedRules||!r.stopped&&nextRuleDate(r));
  const active=all.filter(r=>!r.stopped&&nextRuleDate(r)).length;
  panel.innerHTML=`<div class="planner-top"><div><div class="planner-heading-row"><h2>Khoản chi định kỳ</h2><span class="pill">${active} đang chạy</span></div><p>Wi-Fi, Netflix, tiền nhà… nhớ một lần, ghi đúng kỳ.</p></div><div class="planner-actions"><button class="primary" id="addRecurring">＋ Thêm khoản lặp</button><button id="nextMonthPlan">Mở tháng mới ↗</button></div></div>
    ${rules.length?`<div class="recurring-list">${rules.map(ruleCard).join('')}</div>`:`<div class="planner-empty"><span>↻</span><div><b>${all.length?'Không có lịch đang chạy':'Đỡ phải nhập lại mỗi tháng'}</b><p>${all.length?'Bạn có thể xem lịch đã dừng hoặc thêm khoản lặp mới.':'Chọn Wi-Fi hoặc Netflix để thiết lập số tiền, hũ và ngày lặp.'}</p></div></div>`}
    <div class="planner-footer"><p class="planner-help">${lastAutomaticCount?'✓ Đã cập nhật '+lastAutomaticCount+' kỳ đến hạn. ':''}Tự ghi sổ khi mở web hoặc khi web đang mở; không thanh toán tiền thật. Chỉ ghi vào tháng đã tạo và chưa chốt.</p><button id="toggleStopped">${showStoppedRules?'Ẩn lịch đã dừng':'Xem cả lịch đã dừng / kết thúc'}</button></div>`;
  $('#addRecurring').onclick=()=>recurringForm();
  $('#nextMonthPlan').onclick=()=>createMonth(data.months[nextMonth]?shift(Object.keys(data.months).sort().at(-1),1):nextMonth);
  $('#toggleStopped').onclick=()=>{showStoppedRules=!showStoppedRules;renderPlanner();};
  panel.onclick=e=>{const b=e.target.closest('button');if(!b)return;
    if(b.dataset.editRule)recurringForm(b.dataset.editRule);
    if(b.dataset.stopRule)stopRule(b.dataset.stopRule);
    if(b.dataset.copyRule)recurringForm(undefined,b.dataset.copyRule);
  };
  $('#add').disabled=closed;$('#add').textContent=closed?'✓ Tháng đã chốt':'＋ Ghi chi tiêu';
  $('#budget').disabled=$('#budgetNav').disabled=closed;
  document.querySelectorAll('.jar button,.saving button').forEach(b=>b.disabled=closed);
  $('#transactions').querySelectorAll('button').forEach(b=>b.disabled=closed);
  current().tx.filter(t=>t.ruleId).forEach(t=>{
    const button=[...$('#transactions').querySelectorAll('[data-edit]')].find(b=>b.dataset.edit===t.id);
    if(button){const badge=document.createElement('span');badge.className='rule-badge';badge.textContent='↻ Định kỳ';button.closest('.row').children[1].append(badge);}
  });
}
function nextRuleDate(r) {
  let next=recurringCore.nextDate(r,plannerToday());
  if(next===plannerToday()&&Object.values(data.months).some(m=>m.tx.some(t=>t.ruleId===r.id&&t.recurrenceDate===next))) next=recurringCore.nextDate(r,plannerTomorrow());
  return next;
}
function ruleCard(r) {
  const next=nextRuleDate(r);
  const key=next?.replaceAll('-','').slice(0,6);
  const nextMonth=key&&data.months[key];
  const status=r.stopped?'Đã dừng':!next?'Đã kết thúc':nextMonth?.closedAt?'Tháng đến hạn đã chốt':!nextMonth?'Cần mở '+title(key):'Đang chạy';
  return `<article class="recurring-card"><div class="rule-title"><h3>${esc(r.note)}</h3><strong>${money(r.amount)}</strong></div><span class="recurring-status ${r.stopped||!next?'stopped':''}">${status}</span><p>${esc(jars.find(j=>j[0]===r.jar)?.[1]||'')} · ${repeatLabel(r)}<br>${next?'Kỳ tới: <b>'+friendlyDate(next)+'</b>':'Không còn kỳ tiếp theo'}<br>${r.endDate?'Đến hết '+friendlyDate(r.endDate):'Lặp đến khi bạn bấm dừng'}</p><div class="rule-actions">${r.stopped||!next?`<button data-copy-rule="${r.id}">Tạo lại lịch này</button>`:`<button data-edit-rule="${r.id}">Sửa kỳ tiếp theo</button><button class="stop-rule" data-stop-rule="${r.id}">Dừng lặp</button>`}</div></article>`;
}
function recurringForm(id,copyId,draft) {
  const old=(data.recurring||[]).find(r=>r.id===(id||copyId))||draft;
  const editing=!!id,initial=editing?(recurringCore.nextDate(old,plannerTomorrow())||plannerTomorrow()):draft?.date||plannerToday();
  show(`<h2>${editing?'Sửa từ kỳ tiếp theo':'Thêm khoản chi định kỳ'}</h2><p>${editing?'Các giao dịch đã ghi được giữ nguyên. Lịch thay thế bắt đầu từ ngày mai hoặc ngày bạn chọn.':'Đặt một lần, ứng dụng sẽ ghi vào đúng hũ khi đến hạn.'}</p>
    <div class="template-chips" aria-label="Mẫu khoản định kỳ"><button type="button" data-template="Wi-Fi">⌂ Wi-Fi</button><button type="button" data-template="Netflix">▷ Netflix</button><button type="button" data-template="Spotify">♫ Spotify</button><button type="button" data-template="Tiền nhà">⌂ Tiền nhà</button></div>
    <label>Tên khoản chi<input name="ruleNote" maxlength="160" required placeholder="Ví dụ: Wi-Fi ở nhà" value="${esc(old?.note||'')}"></label>
    <label>Trừ / cộng vào hũ<select name="ruleJar">${jars.map(j=>`<option value="${j[0]}" ${(old?.jar||'bills')===j[0]?'selected':''}>${j[3]} ${j[1]}</option>`).join('')}</select></label>
    <label id="ruleKindLabel" hidden>Loại giao dịch<select name="ruleKind"><option value="contribute">Góp vào tích lũy</option><option value="withdraw">Rút / chi từ tích lũy</option></select></label>
    <label>Số tiền mỗi kỳ (nghìn đồng)<input name="ruleAmount" type="text" inputmode="decimal" maxlength="16" required placeholder="Ví dụ: 180 = 180.000 ₫" value="${old?old.amount/1000:''}" aria-describedby="ruleAmountPreview"></label><p id="ruleAmountPreview" aria-live="polite"></p>
    <p><b>Lặp theo</b></p><div class="frequency-choices">${Object.entries(recurringUnits).map(([value,label])=>`<label><input type="radio" name="frequency" value="${value}" ${(old?.frequency||'month')===value?'checked':''}>${label[0].toUpperCase()+label.slice(1)}</label>`).join('')}</div>
    <div class="rule-grid"><label>Cứ mỗi<input name="interval" type="number" min="1" max="365" step="1" required value="${old?.interval||1}"></label><label>Ngày bắt đầu<input name="ruleStart" type="date" min="${editing?plannerTomorrow():'1900-01-01'}" max="9999-12-31" required value="${initial}"></label></div>
    <label>Kết thúc<select name="endMode"><option value="forever">Đến khi tôi bấm dừng</option><option value="date">Vào một ngày cụ thể</option></select></label>
    <label id="ruleEndLabel" hidden>Lặp đến hết ngày<input name="ruleEnd" type="date" min="${initial}" max="9999-12-31" value="${old?.endDate&&old.endDate>=initial?old.endDate:initial}"></label>
    <div class="repeat-hint" id="rulePreview" role="status"></div>${buttons(editing?'Lưu lịch mới':'Bật lặp tự động')}`,fd=>{
      const rule={id:crypto.randomUUID(),note:fd.get('ruleNote').trim(),jar:fd.get('ruleJar'),amount:readEntryAmount(fd.get('ruleAmount'),'thousand'),kind:saving(fd.get('ruleJar'))?fd.get('ruleKind'):'expense',frequency:fd.get('frequency'),interval:Number(fd.get('interval')),startDate:fd.get('ruleStart'),endDate:fd.get('endMode')==='date'?fd.get('ruleEnd'):null,stopped:false,skipped:[]};
      if(editing&&rule.startDate===initial&&rule.frequency===old.frequency)rule.anchorDay=old.anchorDay||Number(old.startDate.slice(-2));
      if(!recurringCore.validRule(rule,jars.map(j=>j[0]))||editing&&rule.startDate<plannerTomorrow()){toast('Kiểm tra tên khoản chi, số tiền và ngày kết thúc.');return;}
      processRecurring();
      if(editing){old.stopped=true;old.stoppedAt=plannerToday();}
      if(draft){draft.ruleId=rule.id;draft.recurrenceDate=draft.date;}
      data.recurring.push(rule);const count=processRecurring();const ok=persist();$('#dialog').close();render();if(ok)toast('Đã lưu lịch lặp'+(count?' · Ghi nhận '+count+' kỳ đến hạn':''));
    });
  const f=$('#form');f.elements.ruleKind.value=old?.kind==='withdraw'?'withdraw':'contribute';
  if(old?.endDate&&old.endDate>=initial)f.elements.endMode.value='date';
  const update=()=>{
    const fd=new FormData(f),amount=readEntryAmount(fd.get('ruleAmount'),'thousand');
    f.elements.ruleAmount.setCustomValidity(f.elements.ruleAmount.value&&!Number.isSafeInteger(amount)?'Nhập số tiền hợp lệ, ví dụ 180 hoặc 180,5.':'');
    $('#ruleAmountPreview').textContent=Number.isSafeInteger(amount)?money(amount):'Nhập theo nghìn đồng, không cần gõ thêm 000.';
    $('#ruleKindLabel').hidden=!saving(fd.get('ruleJar'));
    const dated=fd.get('endMode')==='date';$('#ruleEndLabel').hidden=!dated;f.elements.ruleEnd.required=dated;f.elements.ruleEnd.disabled=!dated;f.elements.ruleEnd.min=fd.get('ruleStart');
    const r={frequency:fd.get('frequency'),interval:Number(fd.get('interval')),startDate:fd.get('ruleStart'),endDate:dated?fd.get('ruleEnd'):null};
    const valid=recurringCore.validDate(r.startDate)&&r.interval>0;
    $('#rulePreview').textContent=valid?repeatLabel(r)+' từ '+friendlyDate(r.startDate)+(r.endDate?' đến '+friendlyDate(r.endDate):', đến khi bấm dừng')+'. Kỳ đến hạn sẽ được ghi vào tháng đã tạo và chưa chốt. Ngày 29–31 được chuyển về ngày cuối tháng nếu tháng đó ngắn hơn.':'Chọn ngày bắt đầu và chu kỳ lặp.';
  };
  f.onclick=e=>{const b=e.target.closest('[data-template]');if(b){f.elements.ruleNote.value=b.dataset.template;f.elements.ruleJar.value='bills';f.elements.frequency.value='month';update();}};
  f.oninput=f.onchange=update;update();
}
function stopRule(id) {
  const rule=data.recurring.find(r=>r.id===id);if(!rule)return;
  show(`<h2>Dừng lặp ${esc(rule.note)}?</h2><p>Các giao dịch đã ghi được giữ lại. Ứng dụng sẽ không tạo thêm kỳ mới cho lịch này.</p>${buttons('Dừng lặp')}`,()=>{processRecurring();rule.stopped=true;rule.stoppedAt=plannerToday();const ok=persist();$('#dialog').close();render();if(ok)toast('Đã dừng lịch lặp');});
}
function summaryMarkup(s) {
  return `<div class="close-stats">${[['Thu nhập',s.income],['Chi sinh hoạt',s.living],['Tích lũy ròng',s.savings],['Tiền còn lại',s.remaining]].map(([label,value])=>`<div>${label}<b>${money(value)}</b></div>`).join('')}</div><p>${s.transactions} giao dịch. Tích lũy ròng = góp vào trừ tiền rút. Tiền còn lại = thu nhập trừ chi sinh hoạt và tích lũy ròng.</p>`;
}
function closeMonth() {
  processRecurring();const target=month,s=recurringCore.closingSummary(current());
  show(`<h2>Chốt sổ ${title(target)}</h2><p>Đã cập nhật các kỳ định kỳ đến hạn trong tháng này.</p>${summaryMarkup(s)}<div class="notice">Sau khi chốt, ngân sách và giao dịch sẽ được khóa. Bạn vẫn có thể mở lại tháng để điều chỉnh. Số dư hũ sinh hoạt không tự chuyển sang tháng mới; tích lũy vẫn cộng dồn.</div>${buttons('Xác nhận chốt sổ')}`,()=>{data.months[target].closedAt=new Date().toISOString();data.months[target].closeSummary=recurringCore.closingSummary(data.months[target]);const ok=persist();$('#dialog').close();render();if(ok)toast('Đã chốt '+title(target));});
}
function reopenMonth() {
  const target=month;show(`<h2>Mở lại ${title(target)}?</h2><p>Bạn có thể sửa ngân sách và giao dịch. Các kỳ định kỳ còn thiếu đến hôm nay sẽ được cập nhật lại; số tổng kết sẽ được tính lại khi chốt lần sau.</p>${buttons('Mở lại tháng')}`,()=>{delete data.months[target].closedAt;delete data.months[target].closeSummary;const ok=persist();$('#dialog').close();render();if(ok)toast('Đã mở lại tháng');});
}
const budgetWithoutLock=budget;
budget=function(){if(!monthIsLocked())budgetWithoutLock();};
const entryWithoutLock=transaction;
transaction=function(...args){if(!monthIsLocked())entryWithoutLock(...args);};
const renderWithoutPlanner=render;
render=function(){processRecurring();renderWithoutPlanner();renderPlanner();};
const oldTransactionsClick=$('#transactions').onclick;
$('#transactions').onclick=e=>{
  const b=e.target.closest('button');if(!b||monthIsLocked())return;
  const t=current().tx.find(t=>t.id===b.dataset.delete);
  if(t?.ruleId){show(`<h2>Bỏ kỳ ${esc(t.note)}?</h2><p>Khoản ${money(t.amount)} ngày ${friendlyDate(t.date)} sẽ được bỏ khỏi sổ và không tự tạo lại. Những kỳ tiếp theo vẫn chạy.</p>${buttons('Bỏ kỳ này')}`,()=>{const rule=data.recurring.find(r=>r.id===t.ruleId);if(rule){rule.skipped||=[];if(!rule.skipped.includes(t.recurrenceDate))rule.skipped.push(t.recurrenceDate);}current().tx=current().tx.filter(x=>x.id!==t.id);const ok=persist();$('#dialog').close();render();if(ok)toast('Đã bỏ kỳ này');});}
  else oldTransactionsClick(e);
};
createMonth=function(proposed=shift(month,1)){
  processRecurring();const sourceKey=month,source=current();
  show(`<h2>Tháng mới, kế hoạch mới</h2><p>Giữ lịch định kỳ, chia lại thu nhập và chốt sổ tháng trước nếu bạn đã sẵn sàng.</p><div class="rule-grid"><label>Tháng mới<input name="month" type="month" min="1900-01" max="9999-12" required value="${proposed.slice(0,4)+'-'+proposed.slice(4)}"></label><label>Thu nhập (nghìn đồng)<input name="income" type="text" inputmode="decimal" maxlength="16" required placeholder="15000 = 15 triệu"></label></div><p id="incomePreview"></p>
  <label class="checkline" id="closePreviousLabel"><input type="checkbox" name="closePrevious" checked><span>Chốt sổ ${title(sourceKey)} khi mở tháng mới<br><small>Khóa số liệu cũ. Có thể mở lại sau nếu cần sửa.</small></span></label>
  <div class="repeat-hint" id="newMonthHint"></div>${buttons('Mở tháng & chia hũ')}`,fd=>{
    const key=fd.get('month').replace('-','');
    if(data.months[key]){toast('Tháng này đã tồn tại. Hãy chọn trong danh sách tháng.');return;}
    const income=readEntryAmount(fd.get('income'),'thousand');if(!Number.isSafeInteger(income)){toast('Nhập thu nhập hợp lệ theo nghìn đồng.');return;}
    const closePrevious=fd.get('closePrevious')&&key>sourceKey&&!source.closedAt;
    if(closePrevious){source.closedAt=new Date().toISOString();source.closeSummary=recurringCore.closingSummary(source);}
    const previous=data.months[shift(key,-1)]||source;
    const weights=sum(Object.values(previous.alloc))>0?previous.alloc:Object.fromEntries(jars.map(j=>[j[0],j[2]]));
    const total=sum(Object.values(weights));let left=income;
    const alloc=Object.fromEntries(jars.map((j,i)=>{const amount=i===jars.length-1?left:Math.floor(income*weights[j[0]]/total);left-=amount;return[j[0],amount];}));
    data.months[key]={budget:income,alloc,tx:[]};month=key;$('#filter').value='';const ok=persist();$('#dialog').close();render();if(ok){toast('Đã mở '+title(key)+(closePrevious?' và chốt tháng cũ':''));budget();}
  });
  const f=$('#form');
  const update=()=>{
    const income=readEntryAmount(f.elements.income.value,'thousand'),key=f.elements.month.value.replace('-','');
    f.elements.income.setCustomValidity(f.elements.income.value&&!Number.isSafeInteger(income)?'Nhập thu nhập lớn hơn 0 theo nghìn đồng.':'');
    $('#incomePreview').textContent=Number.isSafeInteger(income)?money(income):'Ví dụ: nhập 15000 để chia ngân sách 15.000.000 ₫.';
    const canClose=key>sourceKey&&!source.closedAt;$('#closePreviousLabel').hidden=!canClose;f.elements.closePrevious.disabled=!canClose;
    $('#newMonthHint').textContent=data.months[key]?'Tháng này đã tồn tại.':(canClose&&f.elements.closePrevious.checked?'Sẽ chốt '+title(sourceKey)+' với '+source.tx.length+' giao dịch. ':'')+'Sao chép tỷ lệ hũ; lịch định kỳ được giữ. Kỳ tương lai chưa trừ tiền. Số dư sinh hoạt không tự chuyển tháng; tích lũy vẫn cộng dồn.';
  };f.oninput=f.onchange=update;update();
};
const validateBase=validData;
validData=function(d){return validateBase(d)&&(!d.recurring||Array.isArray(d.recurring)&&d.recurring.every(r=>recurringCore.validRule(r,jars.map(j=>j[0]))))&&Object.values(d.months).every(m=>!m.closedAt||typeof m.closedAt==='string'&&m.closeSummary&&['income','living','savings','remaining','transactions'].every(k=>Number.isSafeInteger(m.closeSummary[k])));};
const nav=document.createElement('button');nav.textContent='↻  Khoản định kỳ';nav.onclick=()=>{tab='overview';render();$('#planner').scrollIntoView({behavior:'smooth',block:'start'});};document.querySelector('nav').append(nav);
$('#budget').onclick=$('#budgetNav').onclick=()=>budget();
window.addEventListener('focus',()=>{if(!$('#dialog').open)render();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('#dialog').open)render();});
setInterval(()=>{if(!document.hidden&&!$('#dialog').open)render();},60000);
