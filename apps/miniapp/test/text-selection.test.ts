import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick} from './page-harness.ts';

function textNode(page:ReturnType<typeof pageHarness>,value:string){
 const node=page.all(page.render()).find(n=>n.type==='Text'&&page.text(n)===value);assert(node,`missing text ${value}`);assert(node.props.selectable);assert(node.props.userSelect);return node;
}
test('native selection suppresses the release tap and swipe but preserves the next deliberate tap',()=>{
 let clicked=0,held=0,stopped=0;const event={stopPropagation(){stopped++;}};
 const p=pageHarness('components/SelectableText',async()=>({}),'SelectableText',{props:{children:'Can I have some water?',onClick:()=>clicked++,onLongPress:()=>held++}});
 const node=textNode(p,'Can I have some water?');node.props.onTouchStart(event);node.props.onClick(event);assert.equal(clicked,1);assert.equal(stopped,0);
 node.props.onLongPress(event);node.props.onTouchMove(event);node.props.onTouchEnd(event);node.props.onClick(event);assert.equal(clicked,1);assert.equal(held,1);assert.equal(stopped,4);
 node.props.onTouchStart(event);node.props.onClick(event);assert.equal(clicked,2);p.dispose();
});
for(const source of ['new','review','wrong','history'])test(`${source} sentence study exposes selectable English and Chinese without recording an answer`,async()=>{
 const p=pageHarness('pages/sentence-study/index',async()=>({id:'round',source,book_id:'book-a',lease_id:'lease',status:'active',total:1,remaining:1,wrong:0,current:{ordinal:1,sentence_id:'sentence',content_version:1,text_en:'Can I have some water?',translation_zh:'我可以喝点水吗？'}}),undefined,{query:{source}});
 await p.show();for(const value of ['Can I have some water?','我可以喝点水吗？']){const node=textNode(p,value);node.props.onLongPress({stopPropagation(){}});node.props.onClick({stopPropagation(){}});}
 assert(!p.calls.some(c=>c.path.endsWith('/answer')));assert.equal(p.routes.length,0);p.dispose();
});
test('sentence details retain selectable bilingual content independently from playback',async()=>{
 let played=0;const p=pageHarness('pages/sentence-detail/index',async()=>({items:[{sentence_id:'sentence-a',version:1,content_version:1,text_en:'Good morning.',translation_zh:'早上好。'}],book:{read_only:true}}),undefined,{query:{id:'sentence-a',bookId:'book-a'},audio:{play:async()=>{played++;}}});
 await p.show();const node=textNode(p,'Good morning.');textNode(p,'早上好。');node.props.onLongPress({stopPropagation(){}});node.props.onClick({stopPropagation(){}});assert.equal(played,0);await p.button('播放句子发音').onClick();assert.equal(played,1);p.dispose();
});
test('poem reading and review details expose the title, author, original text, notes and translation',async()=>{
 const poem={id:'p',title:'静夜思',dynasty:'唐',author:'李白',body:'床前明月光，\n疑是地上霜。',annotations:'疑：好像。',translation:'明亮的月光洒在床前。',version:1};
 for(const memorized_at of [null,'2026-11-17']){
  const p=pageHarness('pages/poems/index',async()=>({...poem,memorized_at}),undefined,{props:{detailId:'p'}});await p.show();const writes=p.calls.filter(c=>c.method!=='GET').length;
  for(const value of [poem.title,'唐 · 李白',poem.body,poem.annotations,poem.translation]){const node=textNode(p,value);node.props.onLongPress({stopPropagation(){}});node.props.onTouchEnd({stopPropagation(){}});node.props.onClick({stopPropagation(){}});}
  assert.equal(p.calls.filter(c=>c.method!=='GET').length,writes);assert.equal(p.routes.length,0);p.dispose();
 }
});
test('long pressing an example pauses daily automatic advancement and retains the same card',async()=>{
 let advanced=0;
 const card={id:'c',child_word_id:'w',version:1,word_version:1,lemma:'apple',meaning_zh:'苹果',example:{id:'s',content_version:1,text_en:'I like apples.',translation_zh:'我喜欢苹果。'}};
 const flow={format:1,source:{source:'review'},session:{id:'session'},loaded:true,phase:'test',cards:[card],pool:[{id:'w',meaning_zh:'苹果'},{id:'other',meaning_zh:'书'}],total:1,baseDone:0,testIndex:0,learnIndex:0,results:{c:{saved:true,correct:true,meaning:'苹果',selectedMeaning:'苹果',eventId:'e'}},practiceQueue:[],practiced:{},practiceTurn:0};
 class Controller{state={flow,pending:null,conflict:null,busy:false,error:null,notice:'',rejected:false};subscribe(){return()=>{};}begin(){return Promise.resolve();}advance(){advanced++;}dispose(){}heartbeat(){}}
 const p=pageHarness('components/ReviewSession',async()=>({items:[]}),'ReviewSession',{studyController:Controller});await tick();
 p.button('例句提示').onClick();const example=p.all(p.render()).find(n=>n.type==='AudioText'&&n.props.text==='I like apples.');assert(example?.props.selectable);example.props.onPlay();await p.runTimeouts();assert.equal(advanced,0);textNode(p,'苹果');p.dispose();
});
