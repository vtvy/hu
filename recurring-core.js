(function (root) {
  'use strict';
  const DAY = 86400000;
  function validDate(value) {
    if (typeof value !== 'string' || !/^(19|[2-9]\d)\d{2}-\d{2}-\d{2}$/.test(value)) return false;
    const [y,m,d] = value.split('-').map(Number), date = new Date(Date.UTC(y,m-1,d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m-1 && date.getUTCDate() === d;
  }
  const stamp = value => Date.parse(value + 'T00:00:00Z');
  const iso = date => date.toISOString().slice(0,10);
  function validRule(rule, jarIds) {
    return rule && typeof rule.id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(rule.id) &&
      typeof rule.note === 'string' && rule.note.length > 0 && rule.note.length <= 160 &&
      jarIds.includes(rule.jar) && Number.isSafeInteger(rule.amount) && rule.amount > 0 && rule.amount <= 1e12 &&
      ['expense','contribute','withdraw'].includes(rule.kind) &&
      ['day','week','month','year'].includes(rule.frequency) && Number.isInteger(rule.interval) && rule.interval >= 1 && rule.interval <= 365 &&
      (rule.anchorDay === undefined || Number.isInteger(rule.anchorDay) && rule.anchorDay >= 1 && rule.anchorDay <= 31) &&
      validDate(rule.startDate) && (!rule.endDate || validDate(rule.endDate) && rule.endDate >= rule.startDate) &&
      (rule.stopped === undefined || typeof rule.stopped === 'boolean') &&
      (rule.skipped === undefined || Array.isArray(rule.skipped) && rule.skipped.every(validDate));
  }
  function occurrenceAt(rule, index) {
    const [year,month,day] = rule.startDate.split('-').map(Number);
    if (rule.frequency === 'day' || rule.frequency === 'week') {
      const value = new Date(stamp(rule.startDate) + index * rule.interval * (rule.frequency === 'week' ? 7 : 1) * DAY);
      return value.getUTCFullYear() <= 9999 ? iso(value) : null;
    }
    const offset = index * rule.interval;
    const totalMonth = year * 12 + month - 1 + (rule.frequency === 'year' ? offset * 12 : offset);
    const y = Math.floor(totalMonth / 12), m = totalMonth % 12;
    if (y > 9999) return null;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return iso(new Date(Date.UTC(y, m, Math.min(rule.anchorDay || day,last))));
  }
  function firstIndex(rule, date) {
    const [y,m] = date.split('-').map(Number), [sy,sm] = rule.startDate.split('-').map(Number);
    const diff = rule.frequency === 'day' ? (stamp(date)-stamp(rule.startDate))/DAY :
      rule.frequency === 'week' ? (stamp(date)-stamp(rule.startDate))/DAY/7 :
      rule.frequency === 'month' ? (y-sy)*12+m-sm : y-sy;
    return Math.max(0,Math.floor(diff/rule.interval));
  }
  function nextDate(rule, from) {
    if (rule.stopped) return null;
    let index = firstIndex(rule,from), date = occurrenceAt(rule,index);
    while (date && (date < from || (rule.skipped || []).includes(date))) date = occurrenceAt(rule,++index);
    return date && (!rule.endDate || date <= rule.endDate) ? date : null;
  }
  function monthDates(rule, key, until) {
    if (rule.stopped) return [];
    const start = key.slice(0,4)+'-'+key.slice(4)+'-01';
    const end = iso(new Date(Date.UTC(Number(key.slice(0,4)),Number(key.slice(4)),0)));
    const limit = [end,until,rule.endDate || '9999-12-31'].sort()[0];
    if (limit < start) return [];
    const dates = [];
    let index = firstIndex(rule,start), date = occurrenceAt(rule,index);
    while (date && date <= limit) {
      if (date >= start && !(rule.skipped || []).includes(date)) dates.push(date);
      date = occurrenceAt(rule,++index);
    }
    return dates;
  }
  function sync(store, today) {
    let count = 0;
    for (const [key,month] of Object.entries(store.months)) {
      if (month.closedAt) continue;
      for (const rule of store.recurring || []) {
        for (const date of monthDates(rule,key,today)) {
          const id = 'repeat-'+rule.id+'-'+date;
          if (month.tx.some(t => t.id === id || t.ruleId === rule.id && t.recurrenceDate === date)) continue;
          month.tx.push({id,jar:rule.jar,amount:rule.amount,note:rule.note,date,kind:rule.kind,
            ruleId:rule.id,recurrenceDate:date,automatic:true});
          count++;
        }
      }
    }
    return count;
  }
  function closingSummary(month) {
    const living = month.tx.filter(t => !['reserve','wedding'].includes(t.jar)).reduce((s,t)=>s+t.amount,0);
    const savings = month.tx.filter(t => ['reserve','wedding'].includes(t.jar)).reduce((s,t)=>s+(t.kind==='withdraw'?-t.amount:t.amount),0);
    return {income:month.budget,living,savings,remaining:month.budget-living-savings,transactions:month.tx.length};
  }
  const api = {validDate,validRule,occurrenceAt,nextDate,monthDates,sync,closingSummary};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HuRecurring = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
