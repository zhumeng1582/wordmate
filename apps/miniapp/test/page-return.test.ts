import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,deferred,tick} from './page-harness.ts';

test('settings reuses its child components on return and replaces only the changed account or child',async()=>{
 const page=pageHarness('pages/settings-learning/index',async()=>({}));await page.show();
 const keys=()=>Object.fromEntries(page.all(page.render()).filter(node=>['LearningGoal','AudioPreferences'].includes(node.type)).map(node=>[node.type,node.key]));
 const initial=keys();page.hide();await page.show();assert.deepEqual(keys(),initial);
 page.cache.set('child_id','child-b');await page.show();assert.notEqual(keys().LearningGoal,initial.LearningGoal);assert.equal(keys().AudioPreferences,initial.AudioPreferences);
 page.cache.set('access_token','account-b');await page.show();assert.notEqual(keys().AudioPreferences,initial.AudioPreferences);
});

test('wordbook return preserves loaded pages, expansion and usable controls until replacement is ready',async()=>{
 let hold=false;const waiting=deferred();
 const page=pageHarness('pages/words/index',async path=>{
  if(hold)await waiting.promise;
  if(path.includes('/wordbooks'))return {items:[{id:'book-a',name:'我的词本'}]};
  if(path.includes('/ai-batches'))return {items:[]};
  const after=new URL(path,'https://test.invalid').searchParams.get('cursor'),offset=after==='word-100'?100:0;
  return {items:Array.from({length:100},(_,i)=>({id:`word-${offset+i+1}`,lemma:`word${offset+i+1}`,version:1})),next_cursor:offset?null:'word-100',total:200,book_total:200,learned_count:5,first_unlearned_id:null};
 });
 await page.show();await page.button('加载更多').onClick();page.render();
 const row=page.all(page.render()).find(node=>node.props?.id==='word-word-150');assert(row);row.props.onClick();
 const count=()=>page.all(page.render()).filter(node=>node.props?.className==='wordbook-item').length;
 assert.equal(count(),200);page.hide();hold=true;await page.show();assert.equal(count(),200);assert.doesNotMatch(page.text(page.render()),/正在加载/);assert(page.all(page.render()).some(node=>node.props?.className==='wordbook-detail'));
 waiting.resolve();await tick();assert.equal(count(),200);assert(page.all(page.render()).some(node=>node.props?.className==='wordbook-detail'));
});

test('wrong-word return keeps multiple pages and selection without disabling the study action',async()=>{
 let hold=false;const waiting=deferred();
 const page=pageHarness('pages/wrong/index',async path=>{if(hold)await waiting.promise;const offset=path.includes('cursor=after-50')?50:0;return {items:Array.from({length:50},(_,i)=>({word:{id:`word-${offset+i}`,lemma:`wrong${offset+i}`,meaning_zh:'测试',part_of_speech:'noun'},wrong_count:1,sources:['review'],last_wrong_at:'2026-10-30T12:00:00Z'})),next_cursor:offset?null:'after-50'};});
 await page.show();await page.button('加载更多').onClick();page.render();page.button('选择已加载的词').onClick();assert.match(page.text(page.render()),/复习选中错词（100）/);
 page.hide();hold=true;await page.show();assert.match(page.text(page.render()),/wrong99/);assert.equal(page.button('复习选中错词').disabled,false);
 waiting.resolve();await tick();assert.match(page.text(page.render()),/复习选中错词（100）/);
});

test('a child change clears old list content immediately and late responses cannot restore it',async()=>{
 let hold=false;const waiting=deferred();
 const page=pageHarness('pages/wordbooks/index',async path=>{if(hold)await waiting.promise;return {items:[{id:path.includes('child-b')?'book-b':'book-a',name:path.includes('child-b')?'孩子 B 的词本':'孩子 A 的词本',word_count:1}]};});
 await page.show();hold=true;page.hide();await page.show();page.hide();page.cache.set('child_id','child-b');await page.show();assert.doesNotMatch(page.text(page.render()),/孩子 A/);
 waiting.resolve();await tick();assert.match(page.text(page.render()),/孩子 B/);assert.doesNotMatch(page.text(page.render()),/孩子 A/);
});

test('home return retains today progress and does not grey out its main action',async()=>{
 let hold=false;const waiting=deferred();
 const page=pageHarness('pages/home/index',async path=>{if(hold)await waiting.promise;return path==='/me'?{referral_code:''}:{child:{nickname:'小明'},completed_words:7,goal:20,due_count:15,new_count:16,remaining_new_limit:16,streak_days:3};});
 await page.show();page.hide();hold=true;await page.show();assert.match(page.text(page.render()),/小明/);assert.equal(page.button('复习单词').disabled,false);assert.doesNotMatch(page.text(page.render()),/正在加载/);waiting.resolve();await tick();
});

test('learning goal preserves an unsaved target through a delayed return refresh',async()=>{
 let hold=false;const waiting=deferred();
 const page=pageHarness('components/LearningGoal',async()=>{if(hold)await waiting.promise;return {nickname:'小明',daily_goal:20,today_goal:20,effective_from:'明天',version:1};},'LearningGoal');
 await tick();page.render();const picker=page.all(page.render()).find(node=>node.type==='Picker');picker.props.onChange({detail:{value:1}});page.render();assert.match(page.text(page.render()),/10 个 \/ 天/);
 page.hide();hold=true;await page.show();assert.match(page.text(page.render()),/10 个 \/ 天/);assert.doesNotMatch(page.text(page.render()),/正在加载/);waiting.resolve();await tick();assert.match(page.text(page.render()),/10 个 \/ 天/);
});

test('audio preferences preserve unsaved values through return without another loading placeholder',async()=>{
 let hold=false;const waiting=deferred();
 const page=pageHarness('components/AudioPreferences',async path=>{if(hold)await waiting.promise;return path==='/voices'?{items:[{id:'voice',accent:'en-GB',gender:'Male'}]}:{accent:'en-GB',voice_id:'voice',auto_play:false,version:1};},'AudioPreferences');
 await tick();page.render();page.all(page.render()).find(node=>node.type==='Switch').props.onChange({detail:{value:true}});page.render();
 page.hide();hold=true;await page.show();assert.doesNotMatch(page.text(page.render()),/正在加载设置/);assert.equal(page.all(page.render()).find(node=>node.type==='Switch').props.checked,true);
 waiting.resolve();await tick();assert.equal(page.all(page.render()).find(node=>node.type==='Switch').props.checked,true);assert.equal(page.button('保存设置').disabled,false);
});

test('failed return refresh retains the last loaded wordbooks and provides retry',async()=>{
 let fail=false;const page=pageHarness('pages/wordbooks/index',async()=>{if(fail)throw Error('NETWORK_TIMEOUT');return {items:[{id:'book-a',name:'保留的词本',word_count:5}]};});
 await page.show();page.hide();fail=true;await page.show();assert.match(page.text(page.render()),/保留的词本/);assert.match(page.text(page.render()),/NETWORK_TIMEOUT/);assert.equal(page.button('创建词本').disabled,false);
});

test('family return keeps the selected child visible and invite controls available',async()=>{
 let hold=false;const waiting=deferred();
 const page=pageHarness('pages/family/index',async path=>{if(hold)await waiting.promise;if(path==='/me')return {families:[{id:'family-a',name:'我的家庭',role:'owner'}]};if(path.endsWith('/children'))return {items:[{id:'child-a',nickname:'小明'}]};if(path.endsWith('/members'))return {items:[{user_id:'user-a',display_name:'家长',role:'owner'}]};return {items:[]};});
 await page.show();page.hide();hold=true;await page.show();assert.match(page.text(page.render()),/小明/);assert.doesNotMatch(page.text(page.render()),/正在加载家庭|等待家庭资料/);assert.equal(page.button('邀请家人').disabled,false);waiting.resolve();await tick();
});

test('returning to add words keeps the input enabled and preserves its unsubmitted text',async()=>{
 let hold=false;const waiting=deferred();
 const page=pageHarness('pages/add-words/index',async path=>{if(hold)await waiting.promise;if(path.endsWith('/wordbooks'))return {items:[{id:'book-a',name:'我的词本'}]};if(path.includes('/ai-batches'))return {items:[]};return {family_id:'family-a',available_micros:20000000,models:[]};});
 await page.show();page.all(page.render()).find(node=>node.type==='Textarea').props.onInput({detail:{value:'apple, banana'}});page.render();
 page.hide();hold=true;await page.show();const field=page.all(page.render()).find(node=>node.type==='Textarea');assert.equal(field.props.value,'apple, banana');assert.equal(field.props.disabled,false);assert.doesNotMatch(page.text(page.render()),/正在处理|正在加载单词本/);waiting.resolve();await tick();assert.equal(page.all(page.render()).find(node=>node.type==='Textarea').props.value,'apple, banana');
});

test('calendar return keeps the selected range and review action during a quiet refresh',async()=>{
 let hold=false;const waiting=deferred();
 const page=pageHarness('pages/calendar/index',async path=>{if(hold)await waiting.promise;return path.includes('/history-range?')?{count:8}:{today:'2026-10-31',days:[{date:'2026-10-02',studied_words:8,reviewable_words:8}]};});
 await page.show();page.all(page.render()).find(node=>node.type==='DateRangeGrid').props.onChange({start:'2026-10-02',end:'2026-10-03'});await tick();
 page.hide();hold=true;await page.show();assert.equal(page.button('开始复习').disabled,false);assert.equal(page.all(page.render()).find(node=>node.type==='DateRangeGrid').props.value.start,'2026-10-02');assert.doesNotMatch(page.text(page.render()),/正在读取/);waiting.resolve();await tick();assert.match(page.text(page.render()),/8 个单词/);
});
