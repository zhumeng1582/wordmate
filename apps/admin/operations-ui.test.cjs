'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
class Element {
  constructor(tag,text = '') {this.tagName=tag;this.textContent=text;this.children=[];this.value='';this.isConnected=true;this.hidden=false;}
  append(...children) {for(const child of children){child.parentNode=this;this.children.push(child);}}
  replaceChildren(...children) {
    const disconnect = node => {node.isConnected=false;node.parentNode=null;node.children.forEach(disconnect);};
    this.children.forEach(disconnect);this.children=[];this.append(...children);
  }
  setAttribute(key,value) {this[key]=value;}
  querySelectorAll(tag) {return this.children.flatMap(child => [...(child.tagName===tag?[child]:[]),...child.querySelectorAll(tag)]);}
  pause() {this.paused=true;}
  async play() {this.played=true;}
}
const text = node => [node.textContent,...node.children.map(text)].join(' ');
function harness(extra={}) {
  const window = {},revoked=[];
  vm.runInNewContext(readFileSync('apps/admin/operations.js','utf8'),{window,URLSearchParams,URL:{revokeObjectURL:url=>revoked.push(url)}});
  const el = (tag,value,cls) => {const node=new Element(tag,value);node.className=cls;return node;};
  const select = (options,value,onchange) => {const node=el('select');node.options=options;node.value=value;node.onchange=()=>onchange(node.value);return node;};
  const table = (headers,rows) => {const node=el('table',headers.join(' '));for(const row of rows) for(const cell of row) node.append(cell instanceof Element?cell:el('td',String(cell)));return node;};
  return {module:window.AdminOperations,revoked,context:{el,select,table,date:String,isCurrent:()=>true,trackUrl(){},...extra}};
}
const gate = () => {let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};

test('operator filters retain type, child and query state and reset through one reload callback',() => {
  const {module,context}=harness();
  const root=new Element('div'),state={kind:'poems',status:'failed',q:'task',child_id:'child'};
  let reloads=0;
  module.filters({...context,page:'repairs',state,root,reload:()=>reloads++});
  const inputs=root.querySelectorAll('input');
  assert.equal(inputs[0].value,'task');assert.equal(inputs[1].value,'child');
  inputs[0].value=' new task ';inputs[1].value=' new child ';
  root.querySelectorAll('button')[0].onclick();
  assert.equal(state.q,'new task');assert.equal(state.child_id,'new child');assert.equal(reloads,1);
});

test('late detail response cannot replace a newer selected record and missing cost is displayed explicitly',async () => {
  const first=gate(),second=gate();
  const {module,context}=harness({request:async path=>{
    if(path.includes('repair-detail')) return path.endsWith('first')?first.promise:second.promise;
    return {items:['first','second'].map(id=>({id,kind:'words',status:'failed',target_id:'target',calls:1,recorded_cost:0,known_cost_micros:null,charge_micros:'0'})),next_offset:null};
  }});
  const {view,hasMore}=await module.load({...context,page:'repairs',state:{kind:'all'},offset:0});
  assert.equal(hasMore,false);assert.match(text(view),/未记录成本/);
  const buttons=view.querySelectorAll('button');
  const a=buttons[0].onclick(),b=buttons[1].onclick();
  const detail = description => ({status:'failed',description,changes:{},original:{},pronunciations:[]});
  second.resolve(detail('SECOND'));await b;
  first.resolve(detail('FIRST'));await a;
  assert.match(text(view),/SECOND/);assert.doesNotMatch(text(view),/FIRST/);
});

test('audio lookup uses current corrected resource, blocks duplicate plays and discards a late blob after navigation',async () => {
  let visible=true;const blob=gate(),paths=[],tracked=[];
  const {module,context,revoked}=harness({isCurrent:()=>visible,trackUrl:url=>tracked.push(url),request:async path=>{
    paths.push(path);return [{id:'corrected',source:'repair',accent:'en-GB',voice_id:'test',speech_rate:1}];
  },audioBlob:async path=>{paths.push(path);return blob.promise;}});
  const view=module.audio(context,{kind:'words',id:'word',part:'word'},'单词');
  await view.querySelectorAll('button')[0].onclick();
  assert(view.querySelectorAll('select')[0].options[0][1].includes('AI 已纠错'));
  const play=view.querySelectorAll('button')[1];
  const result=play.onclick();await play.onclick();
  assert.equal(paths.filter(path=>path.includes('library-repair-audio')).length,1);
  visible=false;blob.resolve('blob:late');await result;
  assert.deepEqual(revoked,['blob:late']);assert.equal(tracked.length,0);
  assert.equal(view.querySelectorAll('audio')[0].played,undefined);
});

test('audio reread stops old playback and rejects a late response from a detached player',async () => {
  const blob=gate();let lookup=0;
  const {module,context,revoked}=harness({request:async()=>[{id:`clip-${++lookup}`,source:'asset',accent:'en-US',voice_id:'test',speech_rate:1}],audioBlob:()=>blob.promise});
  const view=module.audio(context,{kind:'sentences',id:'sentence',part:'body'},'句子');
  const refresh=view.querySelectorAll('button')[0];await refresh.onclick();
  const old=view.querySelectorAll('audio')[0];const play=view.querySelectorAll('button')[1].onclick();
  await refresh.onclick();assert.equal(old.paused,true);
  blob.resolve('blob:old');await play;assert.deepEqual(revoked,['blob:old']);assert.equal(old.played,undefined);
});
