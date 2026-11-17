import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick,deferred} from './page-harness.ts';
const session={id:'s',lemma:'cat',meaning_zh:'猫',messages:[{id:'m',role:'assistant',content:'cat 表示猫。'}],quiz:null};
function type(page:any,text:string){const wrap=page.all(page.render()).find((n:any)=>n.props?.className==='tutor-input-wrap');wrap.props.onTouchStart({touches:[{clientY:400}]});wrap.props.onTouchEnd();page.all(page.render()).find((n:any)=>n.type==='Input').props.onInput({detail:{value:text}});page.button('发送').onClick();}
test('default entry restores original tutor history with no separate welcome page or date toolbar',async()=>{
 const p=pageHarness('pages/word-tutor/index',async()=>({items:[]}));await tick();await tick();assert.match(p.text(p.render()),/AI 学童聊天记录/);assert(!p.all(p.render()).some(n=>n.props?.className==='la-page'));assert.doesNotMatch(p.text(p.render()),/今天，换个方式|最近7天|最近30天|写故事/);p.dispose();
});
test('learning queries and wrong-word practice stay in the existing tutor conversation and composer',async()=>{
 const p=pageHarness('pages/word-tutor/index',async(path,method,body)=>{if(method==='POST'&&path.endsWith('/messages'))return {...session,messages:[...session.messages,{id:'u',role:'user',content:body.question},{id:'a',role:'assistant',content:'最近学了 cat。',payload:{kind:'summary',words:[{lemma:'cat'}]}}],quiz:body.question.includes('错词')?{id:'q',index:0,total:3,question:{question:'cat 表示什么？',options:['猫','狗','鸟']}}:null};if(path.endsWith('/agent'))return {...session,messages:[...session.messages,{id:'answer',role:'assistant',content:'答对了！'}]};return session;},undefined,{query:{session:'s'},cache:{'tutor_notice_v2:account-a:child-a':true}});
 await tick();await tick();type(p,'我最近学了什么');await tick();await tick();assert.equal(p.calls.find(x=>x.path.endsWith('/messages'))?.path,'/word-tutor-sessions/s/messages');assert.match(p.text(p.render()),/最近学了 cat/);assert.match(p.render().props.className,/tutor-chat/);
 type(p,'练习最近错词');await tick();await tick();p.button('猫').onClick();await tick();assert.equal(p.calls.find(x=>x.path.endsWith('/agent'))?.body.action,'quiz_answer');assert.equal(p.calls.find(x=>x.path.endsWith('/agent'))?.path,'/word-tutor-sessions/s/agent');assert.match(p.text(p.render()),/答对了/);assert.equal(p.routes.length,0);p.dispose();
});
test('existing general history is read in the same tutor interface without recreating the removed page',async()=>{
 const p=pageHarness('pages/word-tutor/index',async()=>({...session,general:true,lemma:'AI 学童'}),undefined,{query:{agent_session:'s'}});await tick();await tick();assert(p.calls.some(x=>x.path==='/word-tutor-sessions/s/adopt'&&x.method==='POST'));assert.match(p.render().props.className,/tutor-chat/);assert.doesNotMatch(p.text(p.render()),/今天，换个方式|最近7天|最近30天/);type(p,'这个词是什么意思');await tick();await tick();assert(p.calls.some(x=>x.path==='/word-tutor-sessions/s/agent'&&x.body.action==='auto'));p.dispose();
});
test('a reply from the previous child cannot replace the current tutor view',async()=>{
 const gate=deferred<any>(),p=pageHarness('pages/word-tutor/index',async(path,method)=>method==='POST'?gate.promise:session,undefined,{query:{session:'s'},cache:{'tutor_notice_v2:account-a:child-a':true}});await tick();await tick();type(p,'我最近学了什么');await tick();p.cache.set('child_id','another-child');gate.resolve({...session,messages:[{id:'private',role:'assistant',content:'旧孩子的学习记录'}]});await tick();await tick();assert(!p.text(p.render()).includes('旧孩子的学习记录'));p.dispose();
});
