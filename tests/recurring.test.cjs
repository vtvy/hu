const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../recurring-core.js');
const rule=(overrides={})=>({id:'test-rule',jar:'bills',note:'Wi-Fi',amount:180000,kind:'expense',frequency:'month',interval:1,startDate:'2026-01-31',endDate:null,stopped:false,skipped:[],...overrides});
const month=()=>({budget:15000000,alloc:{bills:500000},tx:[]});
test('monthly recurrence clamps short months but retains the original anchor',()=>{
  const r=rule();assert.equal(core.occurrenceAt(r,1),'2026-02-28');assert.equal(core.occurrenceAt(r,2),'2026-03-31');
  assert.deepEqual(core.monthDates(r,'202602','2026-03-01'),['2026-02-28']);
});
test('yearly leap day returns to February 29 in leap years',()=>{
  const r=rule({frequency:'year',startDate:'2024-02-29'});
  assert.equal(core.occurrenceAt(r,1),'2025-02-28');assert.equal(core.occurrenceAt(r,4),'2028-02-29');
});
test('editing a monthly amount in a short month retains the original billing day',()=>{
  const r=rule({startDate:'2026-02-28',anchorDay:31});
  assert.equal(core.occurrenceAt(r,0),'2026-02-28');
  assert.equal(core.occurrenceAt(r,1),'2026-03-31');
});
test('daily and weekly intervals cross months with inclusive end dates',()=>{
  const r=rule({frequency:'day',interval:2,startDate:'2026-10-29',endDate:'2026-11-04'});
  assert.deepEqual(core.monthDates(r,'202611','2026-11-30'),['2026-11-02','2026-11-04']);
  assert.equal(core.nextDate(r,'2026-11-05'),null);
  assert.deepEqual(core.monthDates(rule({frequency:'week',interval:2,startDate:'2026-10-02'}),'202610','2026-10-31'),['2026-10-02','2026-10-16','2026-10-30']);
});
test('sync catches up open months once, never creates months or posts future dates',()=>{
  const store={recurring:[rule({startDate:'2026-10-01',frequency:'day'})],months:{'202610':month()}};
  assert.equal(core.sync(store,'2026-10-03'),3);assert.equal(core.sync(store,'2026-10-03'),0);
  assert.equal(store.months['202610'].tx[0].amount,180000);
  assert.equal(Object.keys(store.months).length,1);
  assert.equal(core.sync(store,'2026-10-04'),1);
});
test('closed months are immutable, reopen can catch up, summary stays stable',()=>{
  const m=month();m.closedAt='2026-10-31T12:00:00Z';m.closeSummary=core.closingSummary(m);
  const store={recurring:[rule({startDate:'2026-10-01'})],months:{'202610':m}};
  const before=JSON.stringify(m);assert.equal(core.sync(store,'2026-11-01'),0);assert.equal(JSON.stringify(m),before);
  delete m.closedAt;assert.equal(core.sync(store,'2026-11-01'),1);
  assert.equal(core.closingSummary(m).remaining,14820000);
});
test('skipped or stopped occurrences do not return; edited entries retain identity',()=>{
  const r=rule({startDate:'2026-10-01',skipped:['2026-10-01']});
  const store={recurring:[r],months:{'202610':month(),'202611':month()}};
  assert.equal(core.sync(store,'2026-10-31'),0);r.skipped=[];
  store.months['202610'].tx.push({id:'manual',ruleId:r.id,recurrenceDate:'2026-10-01',jar:'bills',amount:190000,kind:'expense',note:'Đã sửa',date:'2026-10-02'});
  assert.equal(core.sync(store,'2026-10-31'),0);r.stopped=true;
  assert.equal(core.sync(store,'2026-11-30'),0);
});
test('validates rules and impossible dates in backups',()=>{
  assert.ok(core.validRule(rule(),['bills']));assert.equal(core.validRule(rule({interval:0}),['bills']),false);
  assert.equal(core.validRule(rule({endDate:'2025-01-01'}),['bills']),false);
  assert.equal(core.validDate('2026-02-30'),false);assert.equal(core.validDate('2024-02-29'),true);
  assert.equal(core.validRule(rule({skipped:['bad']}),['bills']),false);
});
