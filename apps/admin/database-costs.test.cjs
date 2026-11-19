'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {createStore, report, allocation, monthRange} = require('./database-costs.cjs');
const {createServer} = require('./server.cjs');
const clock = () => new Date('2026-11-18T12:00:00Z');
const bill = extra => ({expected_revision: 0, month: '2026-11', amount_yuan: '10.00', as_of_date: '2026-11-18', settled: false, note: '', ...extra});
const plan = extra => ({expected_revision: 0, id: randomUUID(), reference: randomUUID(), label: '已购买计划', amount_yuan: '583.20', start_date: '2026-11-01', end_date: '2027-10-31', excluded: false, note: '', ...extra});
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wordmate-costs-'));
  const file = path.join(directory, 'costs.json');
  return {directory, file, store: createStore(file, clock), close: () => fs.rmSync(directory, {recursive: true, force: true})};
}

test('a missing bill is unknown, a genuine zero is recorded, and rows survive a restart', () => {
  const f = fixture();
  try {
    const empty = f.store.get('2026-11');
    assert.equal(empty.summary.status, 'missing_bill');
    assert.equal(empty.summary.database_total_micros, null);
    assert.equal(fs.existsSync(f.file), false);
    f.store.saveBill(bill({amount_yuan:'0'}));
    const saved = createStore(f.file, clock).get('2026-11');
    assert.equal(saved.revision, 1);
    assert.equal(saved.summary.rds_payable_micros, '0');
    assert.equal(saved.summary.database_total_micros, '0');
    assert.equal(fs.statSync(f.file).mode & 0o777, 0o600);
  } finally {f.close();}
});

test('database cost adds only RDS payable after offsets and the plan allocation for the same bill period', () => {
  const f = fixture();
  try {
    f.store.savePlan(plan({amount_yuan:'300', end_date:'2026-11-30'}));
    assert.equal(f.store.get('2026-11').summary.database_total_micros, null);
    f.store.saveBill(bill({expected_revision:1, amount_yuan:'12.34', as_of_date:'2026-11-10'}));
    const data = f.store.get('2026-11');
    assert.equal(data.summary.plan_amortization_micros, '100000000');
    assert.equal(data.summary.database_total_micros, '112340000');
    assert.equal(data.as_of_date, '2026-11-10');
    assert.equal(data.summary.status, 'partial');
  } finally {f.close();}
});

test('daily allocation preserves the entire contract across leap years, partial first and last months', () => {
  const saved = {amount_micros:'583200000', start_date:'2023-11-18', end_date:'2024-11-17', excluded:false};
  let sum = 0n;
  for (let year = 2023; year <= 2024; year++) {
    for (let month = 1; month <= 12; month++) {
      const range = monthRange(`${year}-${String(month).padStart(2,'0')}`);
      sum += BigInt(allocation(saved,range.start,range.end));
    }
  }
  assert.equal(sum,583200000n);
  const feb = monthRange('2024-02');
  assert.equal(allocation(saved,feb.start,feb.end),(583200000n*104n/366n-583200000n*75n/366n).toString());
});

test('excluding a duplicate record is reversible and multiple valid contracts are added once each', () => {
  const f = fixture();
  try {
    const first = plan({amount_yuan:'30',start_date:'2026-11-01',end_date:'2026-11-30'});
    f.store.savePlan(first);
    assert.throws(() => f.store.savePlan({...first,id:randomUUID(),expected_revision:1}), {httpStatus:409});
    f.store.savePlan(plan({expected_revision:1,amount_yuan:'60',start_date:'2026-11-01',end_date:'2026-11-30'}));
    assert.equal(f.store.get('2026-11').summary.plan_amortization_micros,'54000000');
    f.store.savePlan({...first,expected_revision:2,excluded:true});
    assert.equal(f.store.get('2026-11').summary.plan_amortization_micros,'36000000');
    f.store.savePlan({...first,expected_revision:3});
    assert.equal(f.store.get('2026-11').plans.length,2);
    assert.equal(f.store.get('2026-11').summary.plan_amortization_micros,'54000000');
  } finally {f.close();}
});

test('stale writes and concurrent file locks do not overwrite an already recorded bill', () => {
  const f = fixture();
  try {
    f.store.saveBill(bill());
    assert.throws(() => f.store.saveBill(bill({amount_yuan:'99'})), {httpStatus:409});
    fs.writeFileSync(f.file+'.lock','');
    assert.throws(() => f.store.saveBill(bill({expected_revision:1})), {httpStatus:409});
    assert.equal(f.store.get('2026-11').summary.rds_payable_micros,'10000000');
    fs.unlinkSync(f.file+'.lock');
    f.store.saveBill(bill({expected_revision:1,amount_yuan:'11'}));
    assert.equal(f.store.get('2026-11').summary.rds_payable_micros,'11000000');
  } finally {f.close();}
});

test('invalid inputs and corrupt persisted values never silently become zero-cost records', () => {
  const f = fixture();
  try {
    for (const amount of ['-1','NaN','1e3','1.001',100,'10000000','']) {
      assert.throws(() => f.store.saveBill(bill({amount_yuan:amount})), {httpStatus:400});
    }
    for (const input of [bill({as_of_date:'2026-11-31'}),bill({as_of_date:'2026-12-01'}),bill({settled:true}),bill({month:'2026-13'}),bill({amount_yuan:'1',provider:'rds'})]) {
      assert.throws(() => f.store.saveBill(input), {httpStatus:400});
    }
    assert.throws(() => f.store.savePlan(plan({end_date:'2026-10-31'})), {httpStatus:400});
    fs.writeFileSync(f.file,'{bad');
    assert.throws(() => f.store.get('2026-11'), {httpStatus:500});
    assert.throws(() => f.store.saveBill(bill()), {httpStatus:500});
    assert.equal(fs.readFileSync(f.file,'utf8'),'{bad');
    assert.equal(fs.existsSync(f.file+'.lock'),false);
  } finally {f.close();}
});

test('whole-month accounting includes the final effective day and keeps future months empty', () => {
  const f = fixture();
  try {
    f.store.savePlan(plan({start_date:'2026-10-31',end_date:'2026-11-01',amount_yuan:'10'}));
    f.store.saveBill(bill({expected_revision:1,month:'2026-10',as_of_date:'2026-10-31',settled:true,amount_yuan:'2'}));
    const october = f.store.get('2026-10');
    assert.equal(october.summary.status,'settled');
    assert.equal(october.summary.database_total_micros,'7000000');
    assert.equal(f.store.get('2026-11').summary.plan_amortization_micros,'5000000');
    const future = f.store.get('2026-12');
    assert.equal(future.as_of_date,null);
    assert.equal(future.summary.plan_amortization_micros,'0');
  } finally {f.close();}
});

test('admin cost routes require existing credentials, correct origin and JSON, without writing the learning database', async () => {
  const f = fixture();
  let queries = 0;
  const pool = {query: async () => {queries++; throw Error('cost recording must not touch business data');}};
  const token = 'a'.repeat(64);
  const port = 18874;
  const server = createServer(pool,port,token,undefined,{databaseCostsFile:f.file,clock});
  await new Promise((resolve,reject) => {server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  const base = `http://127.0.0.1:${port}`;
  const auth = {'X-Admin-Token':token};
  const put = (value, headers={}) => fetch(base+'/api/database-costs/bill',{method:'PUT',headers:{...auth,Origin:base,'Content-Type':'application/json',...headers},body:JSON.stringify(value)});
  try {
    assert.equal((await fetch(base+'/api/database-costs?month=2026-11')).status,401);
    assert.equal((await fetch(base+'/api/database-costs?month=2026-11',{headers:{...auth,Origin:'https://evil.example'}})).status,403);
    assert.equal((await put(bill(),{Origin:'https://evil.example'})).status,403);
    assert.equal((await put(bill(),{'Content-Type':'text/plain'})).status,403);
    assert.equal((await put(bill())).status,200);
    assert.equal((await put(bill())).status,409);
    const data = await (await fetch(base+'/api/database-costs?month=2026-11',{headers:auth})).json();
    assert.equal(data.summary.database_total_micros,'10000000');
    assert.equal((await fetch(base+'/api/database-costs?month=invalid',{headers:auth})).status,400);
    const savedPlan = plan({expected_revision:1});
    const planWrite = await fetch(base+'/api/database-costs/plan',{method:'PUT',headers:{...auth,Origin:base,'Content-Type':'application/json'},body:JSON.stringify(savedPlan)});
    assert.equal(planWrite.status,200);
    const duplicate = await fetch(base+'/api/database-costs/plan',{method:'PUT',headers:{...auth,Origin:base,'Content-Type':'application/json'},body:JSON.stringify({...savedPlan,id:randomUUID(),expected_revision:2})});
    assert.equal(duplicate.status,409);
    const malformed = await fetch(base+'/api/database-costs/bill',{method:'PUT',headers:{...auth,Origin:base,'Content-Type':'application/json'},body:'{bad'});
    assert.equal(malformed.status,400);
    assert.equal((await fetch(base+'/admin-database-costs.json',{headers:auth})).status,404);
    const script = await fetch(base+'/database-costs.js');
    assert.equal(script.status,200);
    assert.match(script.headers.get('content-type'),/javascript/);
    assert.equal(queries,0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    f.close();
  }
});
