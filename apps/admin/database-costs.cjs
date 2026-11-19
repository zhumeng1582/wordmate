'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');

const DAY_MS = 86400000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

function invalid(message, status = 400) {
  throw Object.assign(Error(message), {httpStatus: status});
}

function dateDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    invalid('请填写有效日期');
  }
  const time = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    invalid('请填写有效日期');
  }
  return time / DAY_MS;
}

function today(clock) {
  return new Date(clock().getTime() + 8 * 3600000).toISOString().slice(0, 10);
}

function monthRange(month) {
  if (typeof month !== 'string' || !/^(?:20\d{2})-(?:0[1-9]|1[0-2])$/.test(month)) {
    invalid('月份格式应为 YYYY-MM，范围为 2000—2099 年');
  }
  const start = dateDay(month + '-01');
  const end = Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1) / DAY_MS;
  return {start, end};
}

function money(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(value)) {
    invalid('金额须为非负人民币金额，最多两位小数且小于一千万元');
  }
  const [whole, fraction = ''] = value.split('.');
  return (BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'))).toString();
}

function note(value) {
  if (typeof value !== 'string' || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) {
    invalid('备注最多 200 字，请勿包含换行或个人信息');
  }
  return value.trim();
}

function checkKeys(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) {
    invalid('记录字段无效');
  }
  if (!Number.isSafeInteger(input.expected_revision) || input.expected_revision < 0) {
    invalid('记录版本无效');
  }
}

function validateBill(input, clock) {
  checkKeys(input, ['expected_revision', 'month', 'amount_yuan', 'as_of_date', 'settled', 'note']);
  const range = monthRange(input.month);
  const asOf = dateDay(input.as_of_date);
  if (asOf < range.start || asOf >= range.end || asOf > dateDay(today(clock))) {
    invalid('账单截止日期须在所选月份内，且不能晚于今天');
  }
  if (typeof input.settled !== 'boolean' || input.settled && asOf !== range.end - 1) {
    invalid('整月账单的截止日期须为该月最后一天');
  }
  return {
    month: input.month,
    amount_micros: money(input.amount_yuan),
    as_of_date: input.as_of_date,
    settled: input.settled,
    note: note(input.note ?? ''),
  };
}

function validatePlan(input) {
  checkKeys(input, ['expected_revision', 'id', 'reference', 'label', 'amount_yuan', 'start_date', 'end_date', 'excluded', 'note']);
  if (typeof input.id !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(input.id)) {
    invalid('节省计划记录编号无效');
  }
  if (typeof input.reference !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(input.reference)) {
    invalid('请填写不超过 80 位的订单号或合同编号，仅使用字母、数字及 . _ : -');
  }
  if (typeof input.label !== 'string' || !input.label.trim() || input.label.length > 60 || /[\u0000-\u001f\u007f]/.test(input.label)) {
    invalid('请填写不超过 60 字的计划名称');
  }
  const duration = dateDay(input.end_date) - dateDay(input.start_date) + 1;
  if (duration < 1 || duration > 3660 || typeof input.excluded !== 'boolean') {
    invalid('计划有效期须为 1—3660 天');
  }
  return {
    id: input.id,
    reference: input.reference,
    label: input.label.trim(),
    amount_micros: money(input.amount_yuan),
    start_date: input.start_date,
    end_date: input.end_date,
    excluded: input.excluded,
    note: note(input.note ?? ''),
  };
}

// Allocate by cumulative whole-day entitlement. Differences preserve every
// micro-yuan over the full term, including leap years and partial months.
function allocation(plan, start, end) {
  if (plan.excluded) return '0';
  const first = dateDay(plan.start_date);
  const days = dateDay(plan.end_date) - first + 1;
  const elapsed = day => BigInt(Math.max(0, Math.min(days, day - first)));
  return (BigInt(plan.amount_micros) * elapsed(end) / BigInt(days)
    - BigInt(plan.amount_micros) * elapsed(start) / BigInt(days)).toString();
}

function report(data, month, clock = () => new Date()) {
  const range = monthRange(month);
  const bill = data.bills.find(value => value.month === month) ?? null;
  const cutoff = bill ? dateDay(bill.as_of_date) + 1 : Math.min(range.end, dateDay(today(clock)) + 1);
  const end = Math.max(range.start, Math.min(range.end, cutoff));
  const plans = data.plans.map(plan => ({
    ...plan,
    allocated_micros: allocation(plan, range.start, end),
  }));
  const amortization = plans.reduce((sum, plan) => sum + BigInt(plan.allocated_micros), 0n);
  return {
    revision: data.revision,
    month,
    as_of_date: end > range.start ? new Date((end - 1) * DAY_MS).toISOString().slice(0, 10) : null,
    bill,
    plans,
    summary: {
      status: bill ? bill.settled ? 'settled' : 'partial' : 'missing_bill',
      rds_payable_micros: bill?.amount_micros ?? null,
      plan_amortization_micros: amortization.toString(),
      database_total_micros: bill ? (BigInt(bill.amount_micros) + amortization).toString() : null,
    },
  };
}

function createStore(filename, clock = () => new Date()) {
  function read() {
    let raw;
    try {
      if (fs.statSync(filename).size > MAX_FILE_BYTES) throw Error('cost file too large');
      raw = fs.readFileSync(filename, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return {format: 1, revision: 0, bills: [], plans: []};
      invalid('数据库成本记录无法读取，请检查服务器文件', 500);
    }
    try {
      const data = JSON.parse(raw);
      if (data.format !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 0
        || data.revision >= Number.MAX_SAFE_INTEGER || !Array.isArray(data.bills) || !Array.isArray(data.plans)
        || data.bills.length > 1200 || data.plans.length > 200) throw Error('invalid cost file');
      // Validate persisted records too. Corruption must never appear as zero cost.
      for (const bill of data.bills) {
        validateBill({expected_revision: 0, month: bill.month, amount_yuan: decimal(bill.amount_micros), as_of_date: bill.as_of_date, settled: bill.settled, note: bill.note}, clock);
      }
      for (const plan of data.plans) {
        validatePlan({expected_revision: 0, id: plan.id, reference: plan.reference, label: plan.label, amount_yuan: decimal(plan.amount_micros), start_date: plan.start_date, end_date: plan.end_date, excluded: plan.excluded, note: plan.note});
      }
      if (new Set(data.bills.map(bill => bill.month)).size !== data.bills.length
        || new Set(data.plans.map(plan => plan.id)).size !== data.plans.length
        || new Set(data.plans.map(plan => plan.reference)).size !== data.plans.length) throw Error('duplicate records');
      return data;
    } catch {
      invalid('数据库成本记录损坏，请从备份恢复，不能按零成本继续统计', 500);
    }
  }

  function save(input, type) {
    const record = type === 'bill' ? validateBill(input, clock) : validatePlan(input);
    fs.mkdirSync(path.dirname(filename), {recursive: true, mode: 0o700});
    const lock = filename + '.lock';
    let descriptor;
    try {
      descriptor = fs.openSync(lock, 'wx', 0o600);
    } catch (error) {
      if (error.code === 'EEXIST') invalid('成本记录正在保存，请稍后刷新重试', 409);
      throw error;
    }
    const temporary = filename + '.' + randomUUID() + '.tmp';
    try {
      const data = read();
      if (data.revision !== input.expected_revision) invalid('成本记录已更新，请刷新核对后再保存', 409);
      const records = type === 'bill' ? data.bills : data.plans;
      const key = type === 'bill' ? 'month' : 'id';
      const index = records.findIndex(value => value[key] === record[key]);
      if (type === 'plan' && data.plans.some(plan => plan.id !== record.id && plan.reference === record.reference)) invalid('该订单已录入，请修改现有记录或恢复统计，避免重复计入', 409);
      if (index < 0 && records.length >= (type === 'bill' ? 1200 : 200)) invalid('成本记录数量已达上限');
      const saved = {...record, updated_at: clock().toISOString()};
      if (index < 0) records.push(saved);
      else records[index] = saved;
      data.revision++;
      const content = JSON.stringify(data, null, 2) + '\n';
      if (Buffer.byteLength(content) > MAX_FILE_BYTES) invalid('成本记录文件已达容量上限');
      const output = fs.openSync(temporary, 'wx', 0o600);
      try {
        fs.writeFileSync(output, content);
        fs.fsyncSync(output);
      } finally {
        fs.closeSync(output);
      }
      fs.renameSync(temporary, filename);
      return {revision: data.revision};
    } finally {
      fs.closeSync(descriptor);
      fs.rmSync(temporary, {force: true});
      fs.rmSync(lock, {force: true});
    }
  }

  return {get: month => report(read(), month, clock), saveBill: input => save(input, 'bill'), savePlan: input => save(input, 'plan')};
}

function decimal(micros) {
  if (typeof micros !== 'string' || !/^\d{1,14}$/.test(micros) || BigInt(micros) % 10000n !== 0n) {
    throw Error('invalid monetary amount');
  }
  return `${BigInt(micros) / 1000000n}.${(BigInt(micros) % 1000000n / 10000n).toString().padStart(2, '0')}`;
}

module.exports = {createStore, allocation, report, monthRange};
