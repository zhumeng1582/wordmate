import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick,deferred} from './page-harness.ts';
const question={id:'question-nose',ordinal:5,prompt:'“nose”的中文意思是？',word:{id:'word-nose',lemma:'nose',version:3,part_of_speech:'noun',example_en:'Touch your nose.'},options:[{id:'option-a',text:'阅读'},{id:'option-b',text:'鼻子'},{id:'option-c',text:'苹果'},{id:'option-d',text:'书'}],selected_option_id:null,answer_version:1};
async function openQuiz(options:{autoPlay?:boolean;autoNext?:boolean;nextCursor?:string;endError?:boolean;answerWait?:Promise<any>}={}){
 const played:any[]=[],quiz={id:'quiz-a',month:'2026-10',mode:'full',status:'in_progress',version:1,total_count:10,answered_count:4};let stopped=0;
 const page=pageHarness('pages/quiz/index',async(path,method)=>{
  if(path.includes('/preview'))return {eligible_count:10,active_quiz_id:quiz.id};
  if(path.endsWith('/resume'))return {quiz,session:{id:'session-a',lease_generation:1}};
  if(path.endsWith('/end')&&options.endError)throw Error('NETWORK_TIMEOUT');
  if(path.endsWith('/answer')){if(options.answerWait)await options.answerWait;return {item:{...question,selected_option_id:'option-b',correct_option_id:'option-b'},quiz_version:2,answered_count:5};}
  if(path.includes('/items?'))return {items:[question,{...question,id:'question-book',ordinal:6,prompt:'“book”的中文意思是？',word:{id:'word-book',lemma:'book',version:1}}],next_cursor:options.nextCursor??null};
  return quiz;
 },undefined,{cache:{'study_auto_next:account-a':options.autoNext??false},audio:{autoPlay:options.autoPlay??false,play:async target=>{played.push(target);},stop:()=>{stopped++;}}});
 await page.show();await page.button('继续未完成的测试').onClick();page.render();await tick();page.render();return {page,played,stopped:()=>stopped};
}
test('the quiz shows just the word and plays its versioned pronunciation without answering',async()=>{
 const {page,played}=await openQuiz();assert.doesNotMatch(page.text(page.render()),/中文意思是/);assert.match(page.text(page.render()),/nose/);assert.match(page.text(page.render()),/Touch your nose\./);const before=page.calls.length;
 const speech=page.all(page.render()).find(node=>node.props?.className==='quiz-word-audio');assert(speech);assert.equal(speech.props['aria-label'],'播放单词 nose 的发音');speech.props.onClick();await tick();assert.equal(played.length,1);assert.equal(played[0].word_id,'word-nose');assert.equal(played[0].content_version,3);assert.equal(page.calls.length,before);assert.equal(page.button('下一题').disabled,true);page.dispose();
});
test('leaving the quiz releases the session while answers remain saved',async()=>{
 const {page}=await openQuiz();assert.doesNotMatch(page.text(page.render()),/暂存退出/);page.hide();await tick();assert(page.calls.some(call=>call.path==='/study-sessions/session-a/end'&&call.body.lease_generation===1));page.dispose();
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
test('long pressing a test example pauses automatic navigation and does not play or submit',async()=>{
 const {page,played}=await openQuiz({autoNext:true});await page.button('鼻子').onClick();await tick();page.render();
 const example=page.all(page.render()).find(n=>n.type==='Text'&&page.text(n)==='Touch your nose.');assert(example?.props.selectable);assert(example?.props.userSelect);
 example.props.onLongPress({stopPropagation(){}});example.props.onTouchEnd({stopPropagation(){}});example.props.onClick({stopPropagation(){}});
 await page.runTimeouts();assert.match(page.text(page.render()),/nose/);assert.equal(played.length,0);assert.equal(page.calls.filter(c=>c.method==='PUT').length,1);
 const word=page.all(page.render()).find(n=>n.type==='Text'&&page.text(n)==='nose');assert(word?.props.userSelect);assert(!page.all(page.render()).some(n=>n.type==='Button'&&page.text(n)==='nose'));page.dispose();
});
test('selection begun while an answer is saving also prevents its late acknowledgement from advancing',async()=>{
 const gate=deferred(),{page}=await openQuiz({autoNext:true,answerWait:gate.promise});const saving=page.button('鼻子').onClick();await tick();
 const example=page.all(page.render()).find(n=>n.type==='Text'&&page.text(n)==='Touch your nose.');example.props.onLongPress({stopPropagation(){}});
 gate.resolve();await saving;page.render();await page.runTimeouts();assert.match(page.text(page.render()),/nose/);assert.equal(page.calls.filter(c=>c.method==='PUT').length,1);page.dispose();
});
test('answer navigation still saves the answer and stops pronunciation on the next word',async()=>{
 const {page,stopped}=await openQuiz();await page.button('鼻子').onClick();await tick();assert.equal(page.calls.filter(call=>call.method==='PUT').length,1);assert.equal(page.button('下一题').disabled,false);const before=stopped();await page.button('下一题').onClick();page.render();assert(stopped()>before);assert.match(page.text(page.render()),/book/);assert.doesNotMatch(page.text(page.render()),/中文意思是/);page.dispose();
});
test('quiz history provides a top return to test setup',async()=>{const page=pageHarness('pages/quiz/index',async path=>path.includes('/preview')?{eligible_count:3}:path.includes('monthly-quizzes?')?{items:[],next_cursor:null}:{});await page.show();await page.button('历史成绩').onClick();const tree=page.render(),back=page.all(tree).find(n=>n.type==='Button'&&n.props?.className==='text-action quiz-inline-back');assert(back);assert.match(page.text(back),/返回测试设置/);back.props.onClick();assert.match(page.text(page.render()),/看看这个月记住了多少/);page.dispose();});

test('failed preparation has one return action and a new quiz can be started without abandoning the failed one', async () => {
  let attempts = 0;
  const page = pageHarness('pages/quiz/index', async (path, method) => {
    if (path.includes('/preview')) return {eligible_count: 20, active_quiz_id: null};
    if (method === 'POST' && path.endsWith('/monthly-quizzes')) {
      attempts++;
      return {id: 'quiz-' + attempts, status: attempts === 1 ? 'failed' : 'preparing', total_count: 20};
    }
    throw Error('Unexpected request');
  });
  try {
    await page.show();
    await page.button('开始月测').onClick();
    const tree = page.render();
    const buttons = page.all(tree).filter(node => node.type === 'Button');
    assert.deepEqual(buttons.map(node => page.text(node)), ['返回测试设置']);
    assert.doesNotMatch(page.text(tree), /请检查词本释义/);
    await buttons[0].props.onClick();
    await tick();
    await page.button('开始月测').onClick();
    assert.match(page.text(page.render()), /正在准备 20 道题/);
    assert.equal(attempts, 2);
    assert(!page.calls.some(call => call.path.endsWith('/abandon')));
  } finally {
    page.dispose();
  }
});

test('a quiz opened from history returns to the loaded history list before settings', async () => {
  const quiz = {id: 'failed-quiz', status: 'failed', month: '2026-11', mode: 'sample', total_count: 20};
  const page = pageHarness('pages/quiz/index', async path => {
    if (path.includes('/preview')) return {eligible_count: 20};
    if (path.includes('monthly-quizzes?')) return {items: [quiz], next_cursor: null};
    return quiz;
  });
  try {
    await page.show();
    await page.button('历史成绩').onClick();
    const entry = page.all(page.render()).find(node => node.props?.className === 'card history-card');
    assert(entry);
    await entry.props.onClick();
    await page.button('返回历史成绩').onClick();
    assert.match(page.text(page.render()), /抽样 20 题/);
    assert.equal(page.calls.filter(call => call.path.includes('monthly-quizzes?')).length, 1);
    await page.button('返回测试设置').onClick();
    assert.match(page.text(page.render()), /看看这个月记住了多少/);
  } finally {
    page.dispose();
  }
});

test('leaving a preparing quiz ignores its late failure after a new quiz starts', async () => {
  const late = deferred();
  let created = 0;
  const page = pageHarness('pages/quiz/index', async (path, method) => {
    if (path.includes('/preview')) return {eligible_count: 20};
    if (method === 'POST' && path.endsWith('/monthly-quizzes')) {
      created++;
      return {id: 'quiz-' + created, status: 'preparing', total_count: created * 10};
    }
    if (path === '/monthly-quizzes/quiz-1') return late.promise;
    throw Error('Unexpected request');
  });
  try {
    await page.show();
    await page.button('开始月测').onClick();
    page.render();
    await page.poll();
    await page.button('返回测试设置').onClick();
    await tick();
    await page.button('开始月测').onClick();
    page.render();
    late.resolve({id: 'quiz-1', status: 'failed'});
    await tick();
    assert.match(page.text(page.render()), /正在准备 20 道题/);
    assert.doesNotMatch(page.text(page.render()), /本次没有成绩/);
  } finally {
    page.dispose();
  }
});
