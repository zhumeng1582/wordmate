import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePoemImport,mergePoemAnalysis,emptyPoem} from '../src/services/poem-import.ts';
test('more than 300 recognized poems remain available for review',()=>{
 const items=Array.from({length:301},(_,i)=>({...emptyPoem(),title:`诗${i}`,body:`正文${i}`}));const result=mergePoemAnalysis([{items,incomplete:false}]);assert.equal(result.items.length,301);assert.equal(result.items[300].title,'诗300');
});
test('parses multiple labelled poems with optional fields and line breaks',()=>{
 const p=parsePoemImport('静夜思\n作者：李白\n朝代：唐\n正文：床前明月光，\n疑是地上霜。\n注释：疑：好像\n---\n春晓\n正文：春眠不觉晓。');assert.equal(p.length,2);assert.equal(p[0].body,'床前明月光，\n疑是地上霜。');assert.equal(p[0].annotations,'疑：好像');assert.equal(p[1].title,'春晓');
});
test('parses CSV quoted fields and sparse spreadsheet columns without shifting',()=>{
 const p=parsePoemImport('标题,作者,朝代,正文,译文\n静夜思,李白,唐,"床前明月光，\n疑是地上霜。","月光,洒在床前"');assert.equal(p[0].body,'床前明月光，\n疑是地上霜。');assert.equal(p[0].translation,'月光,洒在床前');
 const t=parsePoemImport('标题\t作者\t朝代\t正文\t备注\n春晓\t\t唐\t春眠不觉晓\t记忆');assert.equal(t[0].author,'');assert.equal(t[0].dynasty,'唐');assert.equal(t[0].notes,'记忆');
});
test('rejects malformed, missing, oversized or ambiguous input without truncation',()=>{
 assert.throws(()=>parsePoemImport('标题,正文\n春晓,"未闭合'));assert.throws(()=>parsePoemImport('标题,正文\n春晓,'));assert.throws(()=>parsePoemImport('标题,正文,无关\n春晓,春眠不觉晓,x'));assert.throws(()=>parsePoemImport('春晓\n'+ '字'.repeat(1001)));assert.throws(()=>parsePoemImport(Array(301).fill('春晓\n春眠不觉晓').join('\n---\n')));
});
test('detects multiple explicitly marked titles and rejects incomplete table headers',()=>{
 const p=parsePoemImport('标题：静夜思\n正文：床前明月光\n标题：春晓\n正文：春眠不觉晓');assert.deepEqual(p.map(x=>x.title),['静夜思','春晓']);
 assert.equal(parsePoemImport('《静夜思》\n床前明月光\n《春晓》\n春眠不觉晓').length,2);assert.throws(()=>parsePoemImport('标题,作者\n春晓,孟浩然'),/表头/);
});

test('supports 300 poems in text and table and rejects 301 without truncation',()=>{
 const text=Array.from({length:300},(_,i)=>`标题：诗${i+1}\n正文：${'字'.repeat(800)}`).join('\n---\n');assert(text.length>100000);const result=parsePoemImport(text);assert.equal(result.length,300);assert.equal(result[299].title,'诗300');
 const table='标题,正文\n'+Array.from({length:300},(_,i)=>`诗${i+1},春眠不觉晓`).join('\n');assert.equal(parsePoemImport(table).length,300);assert.throws(()=>parsePoemImport(table+'\n诗301,春眠不觉晓'),/300/);
});

test('overlapping chunks merge a poem even when generated learning sections differ',()=>{
 const core={...emptyPoem(),title:'春晓',author:'孟浩然',body:'春眠不觉晓。'},merged=mergePoemAnalysis([{items:[{...core,annotations:'晓：早晨',translation:'',issues:['可能跨页']}],incomplete:true},{items:[{...core,annotations:'晓指早晨。',translation:'春天里睡得香甜，天已不知不觉亮了。',issues:[]}],incomplete:false}]);assert.equal(merged.items.length,1);assert.equal(merged.items[0].annotations,'晓：早晨');assert.match(merged.items[0].translation,/天已/);assert.deepEqual(merged.items[0].issues,['可能跨页']);
});

test('labelled and table titles drop book marks and overlapping wrapped titles merge',()=>{
 assert.equal(parsePoemImport('标题：〈春晓〉\n正文：春眠不觉晓。')[0].title,'春晓');assert.equal(parsePoemImport('标题,正文\n《春晓》,春眠不觉晓。')[0].title,'春晓');
 const poem={...emptyPoem(),title:'《春晓》',body:'春眠不觉晓。'},merged=mergePoemAnalysis([{items:[poem],incomplete:false},{items:[{...poem,title:'春晓'}],incomplete:false}]);assert.equal(merged.items.length,1);assert.equal(merged.items[0].title,'春晓');
});
