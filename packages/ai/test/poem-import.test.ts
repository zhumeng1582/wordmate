import {test} from 'node:test';
import assert from 'node:assert/strict';
import {poemImportRequest,MAX_POEM_IMPORT_ITEMS} from '../src/poem-import.ts';
const item={title:'春晓',author:'孟浩然',dynasty:'唐',body:'春眠不觉晓。',annotations:'晓：早晨；不觉晓：不知不觉天已亮。',translation:'春天里睡得香甜，不知不觉天已经亮了。'};
test('poem import requires learning sections and preserves per-poem concerns',()=>{
 const request=poemImportRequest('春晓\n春眠不觉晓。');assert.match(request.instructions,/用户没有提供时.*自动生成/);assert.match(request.instructions,/忠实保留/);
 const generated=request.validate({items:[{...item,issues:['正文可能截断']}],incomplete:true,overflow:false});assert.equal(generated.items[0].annotations,item.annotations);assert.equal(generated.items[0].translation,item.translation);assert.deepEqual(generated.items[0].issues,['正文可能截断']);
 assert.deepEqual(request.validate({items:[item],incomplete:false,overflow:false}).items[0].issues,[]);
});
test('missing, empty, placeholder and oversized learning sections never silently succeed',()=>{
 const request=poemImportRequest('春晓');
 for(const key of ['annotations','translation']){
  const missing:any={...item};delete missing[key];assert.throws(()=>request.validate({items:[missing],incomplete:false,overflow:false}));
  for(const value of ['', '  ', '未提供', '暂无。', '字'.repeat(3001)])assert.throws(()=>request.validate({items:[{...item,[key]:value}],incomplete:false,overflow:false}));
 }
 assert.throws(()=>request.validate({items:[{...item,issues:['字'.repeat(181)]}],incomplete:true,overflow:false}));
});
test('learning generation has a bounded poem count and accepts explicitly partial output for worker splitting',()=>{
 const request=poemImportRequest('诗词资料');assert.equal(MAX_POEM_IMPORT_ITEMS,10);assert.equal(request.validate({items:Array(10).fill(item),incomplete:true,overflow:true}).items.length,10);assert.throws(()=>request.validate({items:Array(11).fill(item),incomplete:true,overflow:true}));
});

test('AI poem titles are plain text while book marks in the poem body remain unchanged',()=>{
 const request=poemImportRequest('《春晓》');for(const title of ['《春晓》','〈春晓〉','  《春晓》  ']){const value=request.validate({items:[{...item,title,body:'诗句中的《书名》保留。'}],incomplete:false,overflow:false});assert.equal(value.items[0].title,'春晓');assert.equal(value.items[0].body,'诗句中的《书名》保留。');}
});
