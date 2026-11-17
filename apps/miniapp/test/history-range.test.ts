import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,deferred,tick} from './page-harness.ts';
import {selectRange} from '../src/services/date-range.ts';
const calendar={today:'2026-10-31',days:[{date:'2026-10-30',studied_words:10,reviewable_words:10,wrong_words:3},{date:'2026-10-31',studied_words:16,reviewable_words:16,wrong_words:0}]};
test('review calendar has only date and review controls, sends both range endpoints and prevents duplicate navigation',async()=>{
 const page=pageHarness('pages/calendar/index',async path=>path.includes('/history-range?')?{count:20}:calendar);
 await page.show();assert.doesNotMatch(page.text(page.render()),/打卡|补卡|月测|分享|错题|每一天/);
 const grid=()=>page.all(page.render()).find(n=>n.type==='DateRangeGrid');assert.equal(grid().props.mode,'review');grid().props.onChange({start:'2026-09-30',end:'2026-10-31'});await tick();
 assert(page.requests.some(path=>path.includes('date_from=2026-09-30&date_to=2026-10-31&scope=studied')));assert.match(page.text(page.render()),/20 个单词/);
 await Promise.all([page.button('开始复习').onClick(),page.button('开始复习').onClick()]);assert.equal(page.routes.length,1);assert.equal(page.cache.get('review_source').date_from,'2026-09-30');assert.equal(page.cache.get('review_source').date_to,'2026-10-31');
});
test('wrong calendar uses mistake counts and keeps the chosen mistake source when opening the list',async()=>{
 const page=pageHarness('pages/calendar/index',async path=>path.includes('/history-range?')?{count:3}:calendar,undefined,{query:{mode:'wrong',source:'monthly_quiz',date_from:'2026-10-01',date_to:'2026-10-31'}});
 await page.show();assert.match(page.text(page.render()),/错词日期|3 个错词/);assert.doesNotMatch(page.text(page.render()),/开始复习|打卡|补卡|分享/);assert(page.requests.some(path=>path.includes('scope=mistakes&source=monthly_quiz')));assert(page.requests.some(path=>path.includes('/calendar?month=2026-10&source=monthly_quiz')));
 assert.equal(page.all(page.render()).find(n=>n.type==='DateRangeGrid').props.mode,'wrong');await page.button('查看错词').onClick();assert.equal(page.cache.get('review_source'),undefined);assert.match(page.routes[0],/wrong\/index\?date_from=2026-10-01&date_to=2026-10-31&source=monthly_quiz/);
});
test('date grid selects a single day or a normalized range and shows only counts for its context',()=>{
 const options:any={props:{value:{start:'2026-10-01',end:'2026-10-03'},month:'2026-10',today:'2026-10-30',mode:'wrong',days:calendar.days,onMonthChange:()=>{},onChange:(value:any)=>{options.props.value=value;}}};
 const page=pageHarness('components/DateRangeCalendar',async()=>({}),'DateRangeGrid',options),day=(date:string)=>page.all(page.render()).find(n=>n.type==='Button'&&n.props?.['data-date']===date);
 assert.match(page.text(day('2026-10-30')),/3词/);assert.doesNotMatch(page.text(day('2026-10-30')),/10词/);assert.equal(day('2026-10-31').props.disabled,true);
 day('2026-10-20').props.onClick();assert.equal(options.props.value.end,'');day('2026-10-10').props.onClick();assert.equal(options.props.value.start,'2026-10-10');assert.equal(options.props.value.end,'2026-10-20');day('2026-10-15').props.onClick();day('2026-10-15').props.onClick();assert.equal(options.props.value.start,options.props.value.end);
 page.button('近7天').onClick();assert.deepEqual(JSON.parse(JSON.stringify(options.props.value)),{start:'2026-10-24',end:'2026-10-30'});
 assert.deepEqual(selectRange({start:'2026-10-01',end:''},'2026-09-30'),{start:'2026-09-30',end:'2026-10-01'});
});
test('wrong date picker loads only the requested source and returns a range without check-in controls',async()=>{
 let chosen:any;const page=pageHarness('components/DateRangeCalendar',async()=>calendar,'DateRangeCalendar',{props:{value:{start:'2026-10-30',end:'2026-10-31'},mode:'wrong',source:'review',onConfirm:(value:any)=>{chosen=value;},onClose:()=>{}}});await tick();
 assert(page.requests[0].includes('source=review'));assert.doesNotMatch(page.text(page.render()),/打卡|补卡|分享|复习日期/);page.all(page.render()).find(n=>n.type?.name==='DateRangeGrid').props.onChange({start:'2026-09-30',end:'2026-10-31'});await page.button('确定').onClick();assert.equal(chosen.start,'2026-09-30');assert.equal(chosen.end,'2026-10-31');
});
test('a stale range count cannot overwrite a later selection',async()=>{
 const waiting=deferred();let requests=0;const page=pageHarness('pages/calendar/index',async path=>{if(!path.includes('/history-range?'))return calendar;if(++requests===2)return waiting.promise;return {count:requests===1?10:2};});
 await page.show();const grid=()=>page.all(page.render()).find(n=>n.type==='DateRangeGrid');grid().props.onChange({start:'2026-10-01',end:'2026-10-20'});grid().props.onChange({start:'2026-10-30',end:'2026-10-31'});await tick();assert.match(page.text(page.render()),/2 个单词/);waiting.resolve({count:99});await tick();assert.doesNotMatch(page.text(page.render()),/99 个单词/);
});
test('wrong word list starts a complete range review with its source rather than only the loaded page',async()=>{
 const item={word:{id:'word-a',lemma:'apple',meaning_zh:'苹果'},wrong_count:1,sources:['monthly_quiz'],last_wrong_at:'2026-10-30T04:00:00Z'};
 const page=pageHarness('pages/wrong/index',async()=>({items:[item],next_cursor:'more'}),undefined,{query:{date_from:'2026-09-30',date_to:'2026-10-31',source:'monthly_quiz'}});await page.show();assert(page.requests[0].includes('date_from=2026-09-30&date_to=2026-10-31&source=monthly_quiz'));page.actionChoices.push('复习这段时间的错词');await page.button('更多错题操作').onClick();await tick();assert.deepEqual(JSON.parse(JSON.stringify(page.cache.get('review_source'))),{source:'calendar',date_from:'2026-09-30',date_to:'2026-10-31',scope:'mistakes',mistake_source:'monthly_quiz'});
});
test('home check-in keeps sharing while makeup is handled in settings',async()=>{let shares=0;const page=pageHarness('components/CheckinStatus',async()=>({}),'CheckinStatus',{props:{today:{date:'2026-10-31',checked_in:true,completed_words:16,streak_days:2,makeup_credits:1},onShare:()=>shares++,onChanged(){}}});page.button('分享打卡').onClick();assert.equal(shares,1);assert(!page.all(page.render()).some(n=>n.type==='Picker'));assert.doesNotMatch(page.text(page.render()),/补卡/);assert.equal(page.calls.length,0);page.dispose();});
test('check-in share only requests a referral code and selected learning results after opening',async()=>{
 const page=pageHarness('components/useCheckinShare',async path=>path==='/me/referral-code-image'?{code:'0123456789abcdef',base64:'eA==',mime:'image/png'}:{date:'2026-10-31',checked_in:true,quotes:[{}]},'useCheckinShare',{props:'2026-10-31'});assert.equal(page.calls.length,0);await page.render().openShare();assert.equal(page.calls.length,2);assert.equal(page.calls[0].path,'/me/referral-code-image');assert.equal(page.calls[1].path,'/children/child-a/checkin-share');assert.equal(page.calls[1].body.date,'2026-10-31');assert.equal(page.calls[1].body.local_poster,true);assert(page.all(page.render().content).some(n=>n.type==='CheckinSharePreview'&&n.props.image==='/tmp/poster-preview.png'));
});
test('a late share response cannot display a card for a different account',async()=>{
 const waiting=deferred(),page=pageHarness('components/useCheckinShare',async()=>waiting.promise,'useCheckinShare',{props:'2026-10-31'});const pending=page.render().openShare();page.cache.set('access_token','account-b');waiting.resolve({code:'0123456789abcdef',base64:'eA==',mime:'image/png'});await pending;assert.equal(page.calls.length,1);assert(!page.all(page.render().content).some(n=>n.type==='CheckinSharePreview'));
});
test('a prepared card disappears when the account changes',async()=>{
 const page=pageHarness('components/useCheckinShare',async path=>path==='/me/referral-code-image'?{code:'0123456789abcdef',base64:'eA==',mime:'image/png'}:{date:'2026-10-31',quotes:[{}]},'useCheckinShare',{props:'2026-10-31'});await page.render().openShare();assert(page.all(page.render().content).some(n=>n.type==='CheckinSharePreview'&&n.props.image));page.cache.set('access_token','account-b');assert(!page.all(page.render().content).some(n=>n.type==='CheckinSharePreview'));
});
test('character calendar opens the selected learning range',async()=>{const page=pageHarness('pages/calendar/index',async path=>path.includes('/hanzi-history-range?')?{count:2}:{today:'2026-10-31',days:[]},undefined,{query:{kind:'hanzi',date_from:'2026-10-01',date_to:'2026-10-31'}});await page.show();await tick();assert.match(page.text(page.render()),/2 个汉字/);assert.equal(page.all(page.render()).find(n=>n.type==='DateRangeGrid').props.unit,'字');await page.button('开始复习').onClick();assert.match(page.routes.at(-1),/hanzi-study\/index\?source=history&date_from=2026-10-01&date_to=2026-10-31/);page.dispose();});
test('character home check-in no longer exposes makeup',()=>{const page=pageHarness('components/HanziCheckin',async()=>({}),'HanziCheckin',{props:{progress:{completed:1,goal:10,checked_in:false,total_days:2,makeup_credits:1},onChanged(){}}});assert(!page.all(page.render()).some(n=>n.type==='Picker'));assert.doesNotMatch(page.text(page.render()),/补卡/);assert.match(page.text(page.render()),/累计 2 天/);page.dispose();});

test('HD background download failure can be retried and never exposes an unfinished image',async()=>{
 let attempts=0;
 const page=pageHarness('components/useCheckinShare',async path=>path==='/me/referral-code-image'?{code:'0123456789abcdef',base64:'eA==',mime:'image/png'}:{date:'2026-10-31',quotes:[{}]},'useCheckinShare',{props:'2026-10-31',download:async args=>{assert.match(args.url,/checkin-backgrounds/);if(++attempts<=2)throw Error('offline');return {statusCode:200,tempFilePath:'/tmp/background.webp'};}});
 await page.render().openShare();let preview=page.all(page.render().content).find(n=>n.type==='CheckinSharePreview');assert.equal(preview.props.image,'');assert.match(preview.props.error,/高清背景加载失败/);assert.equal(preview.props.busy,false);
 await preview.props.onRetry();preview=page.all(page.render().content).find(n=>n.type==='CheckinSharePreview');assert.equal(attempts,3);assert.equal(preview.props.image,'/tmp/poster-preview.png');assert.equal(preview.props.error,'');page.dispose();
});
test('an HD background that finishes loading after switching account cannot display a poster',async()=>{
 const loading=deferred(),page=pageHarness('components/useCheckinShare',async path=>path==='/me/referral-code-image'?{code:'0123456789abcdef',base64:'eA==',mime:'image/png'}:{date:'2026-10-31',quotes:[{}]},'useCheckinShare',{props:'2026-10-31',download:()=>loading.promise});
 const work=page.render().openShare();await tick();page.cache.set('access_token','account-b');page.render();loading.resolve({statusCode:200,tempFilePath:'/tmp/late-background.webp'});await work;assert(!page.all(page.render().content).some(n=>n.type==='CheckinSharePreview'));page.dispose();
});
