import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {poemImportEntries,poemImportChunks,splitPoemImportChunk} from '../src/poem-import-chunks.ts';
import {poemAnalysisChunks as previewChunks} from '../../miniapp/src/services/poem-import.ts';
const poem=(i:number)=>`标题：边界诗${i}\n作者：作者\n正文：${Array.from({length:10},()=> '诗'.repeat(90)+'。').join('\n')}\n注释：${'注'.repeat(800)}\n疑：疑似，好像。\n1. 疑：好像。\n2. 明月：明亮的月光。\n译文：${'译'.repeat(700)}\n`;
test('long materials keep complete poems, annotations and translations in one request',()=>{
 const entries=Array.from({length:8},(_,i)=>poem(i)),raw=entries.join(''),chunks=poemImportChunks(raw);
 assert(chunks.length>1);assert.equal(chunks.join(''),raw);assert(chunks.every(c=>c.length<=6000));
 for(const entry of entries)assert.equal(chunks.filter(c=>c.includes(entry)).length,1);
 assert.deepEqual(previewChunks(raw),chunks);
 const boundary='材料说明：'+'序'.repeat(5200)+'\n'+poem(1);
 assert(poemImportChunks(boundary).some(c=>c.includes(poem(1))));
});
test('overflow splits at full entries without overlaps or split learning sections',()=>{
 const raw=Array.from({length:18},(_,i)=>`诗${i}：诗句${i}。`).join('\n'),split=splitPoemImportChunk(raw)!;
 assert.equal(split.length,2);assert.equal(split.join(''),raw);
 assert(split.every(c=>c.split('\n').filter(Boolean).every(line=>/^诗\d+：诗句\d+。$/.test(line))));
 const pair=poem(1)+poem(2);assert.deepEqual(splitPoemImportChunk(pair),[poem(1),poem(2)]);
 assert.equal(splitPoemImportChunk(poem(1)),null);
});
test('ambiguous long material and oversized individual poems fail without truncation',()=>{
 assert.throws(()=>poemImportChunks('无标题的材料。'.repeat(1000)),{code:'POEM_BOUNDARY_REQUIRED'});
 assert.throws(()=>poemImportChunks('标题：长诗\n正文：'+'诗'.repeat(6000)),{code:'POEM_ENTRY_TOO_LONG'});
 assert.equal(splitPoemImportChunk('没有边界的诗文。'),null);
});
test('bracketed, Markdown, plain field titles and separators retain the exact source',()=>{
 for(const raw of ['《静夜思》\n床前明月光。\n《春晓》\n春眠不觉晓。','## 静夜思\n床前明月光。\n## 春晓\n春眠不觉晓。','静夜思\n作者：李白\n正文：床前明月光。\n春晓\n正文：春眠不觉晓。','静夜思\n床前明月光。\n---\n春晓\n春眠不觉晓。']){
  const entries=poemImportEntries(raw);assert.equal(entries.length,2);assert.equal(entries.join(''),raw);assert.equal(splitPoemImportChunk(raw)?.join(''),raw);
 }
});
test('preview and worker share the identical boundary algorithm',()=>{
 assert(readFileSync('apps/miniapp/src/services/poem-import.ts','utf8').startsWith(readFileSync('apps/api/src/poem-import-chunks.ts','utf8')));
});
