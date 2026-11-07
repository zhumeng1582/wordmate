import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {readPdfPages,renderPdfPage} from '../src/pdf-import.ts';
function pdf(image=false,override?:string){
 const objs:Buffer[]=[];const add=(s:string|Buffer)=>objs.push(Buffer.isBuffer(s)?s:Buffer.from(s));
 add('<< /Type /Catalog /Pages 2 0 R >>');add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
 add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> ${image?'/XObject << /Im1 6 0 R >>':''} >> /Contents 5 0 R >>`);add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');const content=Buffer.from(override??(image?'q 100 0 0 100 50 50 cm /Im1 Do Q':'BT /F1 20 Tf 30 200 Td (Poem title and text) Tj ET'));add(Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`),content,Buffer.from('\nendstream')]));if(image){const data=deflateSync(Buffer.from([255,0,0]));add(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${data.length} >>\nstream\n`),data,Buffer.from('\nendstream')]));}
 const chunks=[Buffer.from('%PDF-1.4\n')],offsets=[0];let len=chunks[0].length;objs.forEach((o,i)=>{offsets.push(len);const b=Buffer.concat([Buffer.from(`${i+1} 0 obj\n`),o,Buffer.from('\nendobj\n')]);chunks.push(b);len+=b.length;});const xref=len;chunks.push(Buffer.from(`xref\n0 ${objs.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));return Buffer.concat(chunks);
}
test('reads PDF text and detects image pages for OCR',async()=>{const text=await readPdfPages(pdf());assert.equal(text.pages.length,1);assert.match(text.pages[0],/Poem title and text/);assert.deepEqual(text.imagePages,[]);const scanned=pdf(true),pages=await readPdfPages(scanned);assert.deepEqual(pages.imagePages,[1]);const png=await renderPdfPage(scanned,1);assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');});
test('rejects invalid PDF bytes',async()=>{await assert.rejects(readPdfPages(Buffer.from('not pdf')),{code:'INVALID_PDF'});});
test('PDF import extracts text pages and caches billed OCR for scanned pages',async()=>{
 const {fixture}=await import('./ai-fixture.ts');let calls=0;const f=await fixture(async()=>{calls++;return new Response(JSON.stringify({id:'mock',choices:[{finish_reason:'stop',message:{content:'春晓\n春眠不觉晓。'}}],usage:{prompt_tokens:100,completion_tokens:20,prompt_tokens_details:{cached_tokens:0}}}),{status:200});});try{
  const text=await f.core.imports.extract(f.dad,f.child.id,{name:'poem.pdf',base64:pdf().toString('base64'),purpose:'poem'});assert.match(text.text,/Poem title and text/);assert.equal(calls,0);
  const input={name:'scan.pdf',base64:pdf(true).toString('base64'),purpose:'poem'},one=await f.core.imports.extract(f.dad,f.child.id,input),two=await f.core.imports.extract(f.dad,f.child.id,input);assert.match(one.text,/春眠不觉晓/);assert.equal(two.text,one.text);assert.equal(calls,1);assert.equal((await f.accounts.overview(f.dad)).frozen_micros,0);await assert.rejects(f.core.imports.extract(f.mom,f.child.id,input),{code:'FAMILY_NOT_FOUND'});
 }finally{await f.close();}
});
test('word PDF extraction handles text and scanned pages without poem-specific OCR',async()=>{
 const {fixture}=await import('./ai-fixture.ts');let calls=0,prompt='';const f=await fixture(async(_url,init)=>{calls++;prompt=JSON.parse(String(init?.body)).messages[0].content;return new Response(JSON.stringify({id:'mock',choices:[{finish_reason:'stop',message:{content:'airport 机场\nluggage 行李'}}],usage:{prompt_tokens:100,completion_tokens:20,prompt_tokens_details:{cached_tokens:0}}}),{status:200});});try{
  const text=await f.core.imports.extract(f.dad,f.child.id,{name:'words.pdf',base64:pdf().toString('base64'),existing_text:'banana'});assert.match(text.text,/Poem title and text/);assert.equal(text.source,'file');assert.equal(calls,0);
  const input={name:'scan.pdf',base64:pdf(true).toString('base64'),existing_text:'banana'},one=await f.core.imports.extract(f.dad,f.child.id,input),two=await f.core.imports.extract(f.dad,f.child.id,input);assert.equal(one.source,'file');assert.match(one.text,/airport/);assert.equal(two.text,one.text);assert.equal(calls,1);assert.match(prompt,/英语学习文字/);assert.equal((await f.accounts.overview(f.dad)).frozen_micros,0);await assert.rejects(f.core.imports.extract(f.mom,f.child.id,input),{code:'FAMILY_NOT_FOUND'});
 }finally{await f.close();}
});

test('poem PDF reads complete left and right columns independently while word layout remains unchanged',async()=>{
 const text=['BT /F1 12 Tf 20 250 Td (Left One) Tj ET','BT /F1 12 Tf 170 250 Td (Right One) Tj ET','BT /F1 12 Tf 20 225 Td (Left Two) Tj ET','BT /F1 12 Tf 170 225 Td (Right Two) Tj ET','BT /F1 12 Tf 20 200 Td (Left Three) Tj ET','BT /F1 12 Tf 170 200 Td (Right Three) Tj ET'].join('\n');
 const source=pdf(false,text),poem=(await readPdfPages(source,'poem')).pages[0],words=(await readPdfPages(source)).pages[0];assert(poem.indexOf('Left Three')<poem.indexOf('Right One'),poem);assert(words.indexOf('Right One')<words.indexOf('Left Two'),words);
});
test('small decorative PDF images do not cause OCR on text-rich poem pages',async()=>{
 const source=pdf(true,'BT /F1 12 Tf 20 250 Td (A real poem with a title and enough text.) Tj ET\nq 10 0 0 10 250 20 cm /Im1 Do Q');const poem=await readPdfPages(source,'poem');assert.match(poem.pages[0],/real poem/);assert.deepEqual(poem.imagePages,[]);assert.deepEqual((await readPdfPages(pdf(true),'poem')).imagePages,[1]);
});
test('single column pages do not acquire a fake reading order',async()=>{
 const text=['BT /F1 12 Tf 20 250 Td (A single column crossing the middle) Tj ET','BT /F1 12 Tf 20 225 Td (Second line across the page) Tj ET','BT /F1 12 Tf 20 200 Td (Third line across the page) Tj ET'].join('\n');const page=(await readPdfPages(pdf(false,text),'poem')).pages[0];assert(page.indexOf('Second line')>page.indexOf('A single'));assert(page.indexOf('Third line')>page.indexOf('Second line'));
});
test('poem PDF reports real page reading progress and includes page references',async()=>{
 const {fixture}=await import('./ai-fixture.ts');const f=await fixture();try{const progress:number[][]=[];const value=await f.core.imports.extract(f.dad,f.child.id,{name:'poem.pdf',base64:pdf().toString('base64'),purpose:'poem'},async(page,total)=>{progress.push([page,total]);});assert.deepEqual(progress,[[1,1]]);assert.match(value.text,/〔第 1 页〕/);}finally{await f.close();}
});
test('PDF imports accept a valid document larger than 4 MB within the 10 MB limit',async()=>{
 const {fixture}=await import('./ai-fixture.ts');const f=await fixture();try{const bytes=Buffer.concat([pdf(),Buffer.alloc(4*1024*1024,32)]);const value=await f.core.imports.extract(f.dad,f.child.id,{name:'long.pdf',base64:bytes.toString('base64'),purpose:'poem'});assert.match(value.text,/Poem title/);}finally{await f.close();}
});
test('Chinese bounding boxes preserve phrases and page order',async()=>{
 const {poemPagesFromBbox}=await import('../src/pdf-poem-layout.ts');const w=(x:number,y:number,t:string)=>`<word xMin="${x}" xMax="${x+15}" yMin="${y}" yMax="${y+10}">${t}</word>`;const page=(a:string,b:string)=>`<page width="300" height="300">${[0,20,40].map((y,i)=>w(20,20+y,a+i)+w(180,20+y,b+i)).join('')}</page>`;const pages=poemPagesFromBbox(page('左诗','右诗')+page('后左','后右'),['fallback1','fallback2']);assert(pages[0].indexOf('左诗2')<pages[0].indexOf('右诗0'),pages[0]);assert(pages[1].indexOf('后左2')<pages[1].indexOf('后右0'),pages[1]);
});
