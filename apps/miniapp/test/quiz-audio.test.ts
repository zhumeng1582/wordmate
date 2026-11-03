import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick} from './page-harness.ts';
const question={id:'question-nose',ordinal:5,prompt:'“nose”的中文意思是？',word:{id:'word-nose',lemma:'nose',version:3},options:[{id:'option-a',text:'阅读'},{id:'option-b',text:'鼻子'},{id:'option-c',text:'苹果'},{id:'option-d',text:'书'}],selected_option_id:null,answer_version:1};
async function openQuiz(options:{autoPlay?:boolean;autoNext?:boolean;nextCursor?:string;endError?:boolean}={}){
 const played:any[]=[],quiz={id:'quiz-a',month:'2026-10',mode:'full',status:'in_progress',version:1,total_count:10,answered_count:4};let stopped=0;
 const page=pageHarness('pages/quiz/index',async(path,method)=>{
  if(path.includes('/preview'))return {eligible_count:10,active_quiz_id:quiz.id};
  if(path.endsWith('/resume'))return {quiz,session:{id:'session-a',lease_generation:1}};
  if(path.endsWith('/end')&&options.endError)throw Error('NETWORK_TIMEOUT');
  if(path.endsWith('/answer'))return {item:{...question,selected_option_id:'option-b',correct_option_id:'option-b'},quiz_version:2,answered_count:5};
  if(path.includes('/items?'))return {items:[question,{...question,id:'question-book',ordinal:6,prompt:'“book”的中文意思是？',word:{id:'word-book',lemma:'book',version:1}}],next_cursor:options.nextCursor??null};
  return quiz;
 },undefined,{cache:{'study_auto_next:account-a':options.autoNext??false},audio:{autoPlay:options.autoPlay??false,play:async target=>{played.push(target);},stop:()=>{stopped++;}}});
 await page.show();await page.button('继续未完成的测试').onClick();page.render();await tick();page.render();return {page,played,stopped:()=>stopped};
}
test('the quiz shows just the word and plays its versioned pronunciation without answering',async()=>{
 const {page,played}=await openQuiz();assert.doesNotMatch(page.text(page.render()),/中文意思是/);assert.match(page.text(page.render()),/nose/);const before=page.calls.length;
 const speech=page.all(page.render()).find(node=>node.props?.className==='quiz-word-audio');assert(speech);assert.equal(speech.props['aria-label'],'播放单词 nose 的发音');speech.props.onClick();await tick();assert.equal(played.length,1);assert.equal(played[0].word_id,'word-nose');assert.equal(played[0].content_version,3);assert.equal(page.calls.length,before);assert.equal(page.button('下一题').disabled,true);page.dispose();
});
test('pause exits only after the current test session has been released',async()=>{
 const {page}=await openQuiz();await page.button('暂存退出').onClick();await tick();assert(page.calls.some(call=>call.path==='/study-sessions/session-a/end'&&call.body.lease_generation===1));assert.equal(page.backCount,1);page.dispose();
 const failed=await openQuiz({endError:true});await failed.page.button('暂存退出').onClick();await tick();assert.equal(failed.page.backCount,0);assert.match(failed.page.text(failed.page.render()),/NETWORK_TIMEOUT/);failed.page.dispose();
});
test('quiz reuses the next-page lookup when an answer causes a rerender',async()=>{
 const {page}=await openQuiz({nextCursor:'50'});await tick();page.render();await page.button('鼻子').onClick();await tick();page.render();await tick();assert.equal(page.calls.filter(call=>call.path.includes('cursor=50')).length,1);page.dispose();
});
test('quiz automatically reads each word and moves on only after the saved answer when enabled',async()=>{
 const {page,played}=await openQuiz({autoPlay:true,autoNext:true});page.render();await tick();assert.equal(played[0]?.word_id,'word-nose');
 await page.button('鼻子').onClick();await tick();page.render();assert.match(page.text(page.render()),/nose/);await page.runTimeouts();page.render();await tick();assert.match(page.text(page.render()),/book/);assert.equal(played[1]?.word_id,'word-book');page.dispose();
});
test('quiz keeps the answered word until manually advanced when auto next is off',async()=>{
 const {page}=await openQuiz({autoNext:false});await page.button('鼻子').onClick();await tick();page.render();await page.runTimeouts();assert.match(page.text(page.render()),/nose/);await page.button('下一题').onClick();assert.match(page.text(page.render()),/book/);page.dispose();
});
test('answer navigation still saves the answer and stops pronunciation on the next word',async()=>{
 const {page,stopped}=await openQuiz();await page.button('鼻子').onClick();await tick();assert.equal(page.calls.filter(call=>call.method==='PUT').length,1);assert.equal(page.button('下一题').disabled,false);const before=stopped();await page.button('下一题').onClick();page.render();assert(stopped()>before);assert.match(page.text(page.render()),/book/);assert.doesNotMatch(page.text(page.render()),/中文意思是/);page.dispose();
});
