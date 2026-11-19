'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.textContent = '';
    this.value = '';
  }
  append(...children) {this.children.push(...children);}
  setAttribute(key,value) {this[key] = value;}
  querySelectorAll(tag) {
    return this.children.flatMap(child => child instanceof Element ? [...(child.tagName === tag ? [child] : []),...child.querySelectorAll(tag)] : []);
  }
  reset() {
    this.querySelectorAll('input').forEach(input => {input.value = '';input.checked = false;});
  }
  focus() {this.focused = true;}
}

function view(request, extra = {}) {
  const window = {};
  const context = {
    window,
    document: {createElement: tag => new Element(tag),createTextNode: text => ({textContent:text})},
    crypto: {randomUUID: () => '10000000-0000-4000-8000-000000000001'},
    confirm: () => true,
    Date,
    ...extra,
  };
  vm.runInNewContext(readFileSync('apps/admin/database-costs.js','utf8'),context);
  return window.DatabaseCosts.load({request,month:'2026-11',onMonthChange(){},onSaved(){},isCurrent:()=>true,...extra.options});
}
const response = overrides => ({revision:0,month:'2026-11',as_of_date:'2026-11-18',bill:null,plans:[],summary:{status:'missing_bill',rds_payable_micros:null,plan_amortization_micros:'0',database_total_micros:null},...overrides});
const text = node => node instanceof Element ? [node.textContent,...node.children.map(text)].join(' ') : node.textContent;
const tick = () => new Promise(resolve => setImmediate(resolve));

test('the cost page shows unknown totals and empty confirmed-contract fields, without turning a quote into an expense', async () => {
  const calls = [];
  const root = await view(async (path,options) => {calls.push({path,options});return response();});
  assert.match(text(root),/RDS 账单待录入/);
  assert.match(text(root),/待录入/);
  assert.match(text(root),/不自动|不含 ECS/);
  const inputs = root.querySelectorAll('input');
  assert(inputs.filter(input => input.type === 'number').every(input => input.value === ''));
  assert.doesNotMatch(text(root),/583\.20|1841/);
  assert.equal(calls.length,1);
  assert.equal(calls[0].options,undefined);
});

test('rapid bill saves send one request, keep a real zero amount and do not refresh another tab with a late result', async () => {
  let resolve;
  let visible = true;
  let saved = 0;
  const gate = new Promise(done => {resolve = done;});
  const writes = [];
  const root = await view(async (_path,options) => {
    if (!options) return response();
    writes.push(JSON.parse(options.body));
    return gate;
  },{options:{isCurrent:()=>visible,onSaved:()=>{saved++;}}});
  const form = root.querySelectorAll('form')[0];
  form.querySelectorAll('input').find(input => input.type === 'number').value = '0';
  form.onsubmit({preventDefault(){}});
  form.onsubmit({preventDefault(){}});
  assert.equal(writes.length,1);
  assert.equal(writes[0].amount_yuan,'0');
  assert.equal(writes[0].month,'2026-11');
  assert.equal(writes[0].expected_revision,0);
  visible = false;
  resolve({revision:1});
  await tick();
  assert.equal(saved,0);
});

test('editing and restoring an excluded contract reuse its identity and order reference; a new form clears both', async () => {
  const contract = {id:'20000000-0000-4000-8000-000000000001',reference:'order-123',label:'年度计划',amount_micros:'583200000',start_date:'2026-11-01',end_date:'2027-10-31',excluded:true,note:'已核对',allocated_micros:'0'};
  const writes = [];
  let saved = 0;
  const root = await view(async (_path,options) => {
    if (!options) return response({revision:4,plans:[contract]});
    writes.push(JSON.parse(options.body));
    return {revision:5};
  },{options:{onSaved:()=>{saved++;}}});
  const buttons = root.querySelectorAll('button');
  buttons.find(button => button.textContent === '修改记录').onclick();
  const planForm = root.querySelectorAll('form')[1];
  assert(planForm.querySelectorAll('input').some(input => input.value === 'order-123'));
  buttons.find(button => button.textContent === '恢复统计').onclick();
  await tick();
  assert.equal(writes[0].id,contract.id);
  assert.equal(writes[0].reference,'order-123');
  assert.equal(writes[0].amount_yuan,'583.20');
  assert.equal(writes[0].excluded,false);
  assert.equal(saved,1);
  buttons.find(button => button.textContent === '清空并新增').onclick();
  assert(planForm.querySelectorAll('input').every(input => input.value === ''));
});
