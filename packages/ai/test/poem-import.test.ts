import {test} from 'node:test';
import assert from 'node:assert/strict';
import {poemImportRequest} from '../src/poem-import.ts';
test('poem import preserves per-poem concerns and accepts earlier results without them',()=>{
 const request=poemImportRequest('春晓');const item={title:'春晓',author:'孟浩然',dynasty:'唐',body:'春眠不觉晓。'};
 assert.deepEqual(request.validate({items:[{...item,issues:['正文可能截断']}],incomplete:true,overflow:false}).items[0].issues,['正文可能截断']);
 assert.deepEqual(request.validate({items:[item],incomplete:false,overflow:false}).items[0].issues,[]);
 assert.throws(()=>request.validate({items:[{...item,issues:['字'.repeat(181)]}],incomplete:true,overflow:false}));
});
