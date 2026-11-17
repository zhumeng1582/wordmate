import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pageHarness} from './page-harness.ts';
test('home remains the first configured page with review registered only once',()=>{const source=readFileSync('apps/miniapp/src/app.config.ts','utf8'),pages=source.match(/pages:\[([^\]]+)\]/)![1].match(/'([^']+)'/g)!;assert.equal(pages[0],"'pages/home/index'");assert.equal(pages.filter(p=>p==="'pages/import-review/index'").length,1);assert.equal(new Set(pages).size,pages.length);});
for(const kind of ['words','poems','hanzi'])for(const key of ['id','job'])test(`${kind} review accepts the ${key} task parameter`,async()=>{const p=pageHarness('pages/import-review/index',async()=>({}),undefined,{query:{kind,[key]:'task'}});await p.show();assert(p.all(p.render()).some(n=>n.props[kind==='words'?'taskId':kind==='poems'?'reviewId':'jobId']==='task'));assert(!p.routes.length);p.dispose();});
test('review opened without task parameters returns to the record list',async()=>{const p=pageHarness('pages/import-review/index',async()=>({}));await p.show();assert.equal(p.routes.at(-1),'/pages/import-records/index');assert.doesNotMatch(p.text(p.render()),/录入类型不正确/);p.dispose();});
test('invalid review parameters offer recovery without guessing a task type',async()=>{const p=pageHarness('pages/import-review/index',async()=>({}),undefined,{query:{kind:'invalid',id:'task'}});await p.show();p.button('返回录入记录').onClick();assert.equal(p.routes.at(-1),'/pages/import-records/index');p.dispose();});
