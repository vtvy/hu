const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function context() {
  const ctx = vm.createContext({Intl, data: {months: {}}, month: '202610', saving: id => ['reserve', 'wedding'].includes(id)});
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../quick-entry.js'), 'utf8'), ctx);
  return ctx;
}
test('thousand entry converts to exact integer VND, including existing odd amounts', () => {
  const c = context();
  for (const [value, expected] of [['35', 35000], ['50', 50000], ['55', 55000], ['35.5', 35500], ['35.123', 35123]]) {
    assert.equal(c.readEntryAmount(value, 'thousand'), expected);
  }
  assert.equal(c.readEntryAmount('35123', 'dong'), 35123);
  for (const value of ['', '0', '-35', 'Infinity', '0.0001', '1000000001']) assert.ok(Number.isNaN(c.readEntryAmount(value, 'thousand')));
});
test('suggestions prefer frequency, then recency, and keep jar and month boundaries', () => {
  const c = context();
  c.data.months = {
    '202609': {tx: [{id:'1',jar:'food',amount:55000,note:'Cơm',date:'2026-09-01'}]},
    '202610': {tx: [
      {id:'2',jar:'food',amount:55000,note:'Cơm',date:'2026-10-01'},
      {id:'3',jar:'food',amount:35000,note:'Phở',date:'2026-10-03'},
      {id:'4',jar:'travel',amount:999000,note:'Xăng',date:'2026-10-03'}]},
    '202611': {tx: [{id:'5',jar:'food',amount:888000,note:'Sau này',date:'2026-11-01'}]}
  };
  const choices = Array.from(c.suggestedAmounts('food'));
  assert.deepEqual(choices.slice(0,2), [55000,35000]);
  assert.ok(!choices.includes(999000) && !choices.includes(888000));
  const repeats = c.rankedChoices(c.entryHistory('food'), t => JSON.stringify([t.note, t.amount]));
  assert.equal(repeats[0].count, 2);
  assert.equal(repeats[0].item.note, 'Cơm');
  assert.equal(c.entryHistory('food','expense','2').length, 2);
});
test('savings contributions and withdrawals have separate suggestions', () => {
  const c = context();
  c.data.months = {'202610':{tx:[
    {id:'1',jar:'reserve',amount:1000000,note:'Góp',date:'2026-10-01'},
    {id:'2',jar:'reserve',amount:35000,note:'Rút',kind:'withdraw',date:'2026-10-02'}]}};
  assert.equal(c.entryHistory('reserve','contribute')[0].amount, 1000000);
  assert.equal(c.entryHistory('reserve','withdraw')[0].amount, 35000);
});
