import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {deflateRawSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import {parseFile,imageReader} from '../src/import-files.ts';
import {csvCell} from '../src/word-export.ts';
import {Core} from '../src/core.ts';
import {DevIdentity,FixtureDictionary} from '../src/providers.ts';
const require=createRequire(import.meta.url),{PGlite}=require('@electric-sql/pglite');
function zip(files:Record<string,string>){let offset=0,locals:Buffer[]=[],entries:Buffer[]=[];for(const [name,value] of Object.entries(files)){const n=Buffer.from(name),b=Buffer.from(value),data=deflateRawSync(b),l=Buffer.alloc(30),c=Buffer.alloc(46);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(8,8);l.writeUInt32LE(data.length,18);l.writeUInt32LE(b.length,22);l.writeUInt16LE(n.length,26);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(8,10);c.writeUInt32LE(data.length,20);c.writeUInt32LE(b.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);locals.push(l,n,data);entries.push(c,n);offset+=l.length+n.length+data.length;}const directory=Buffer.concat(entries),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,directory,end]);}
const office=(file:string,xml:string)=>zip({'[Content_Types].xml':'<Types/>',[file]:xml});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS9sAAAAASUVORK5CYII=','base64');
test('bounded text, spreadsheet and document extraction; rejects unsafe containers and binary files',()=>{
 assert.equal(parseFile('words.csv',Buffer.from('\uFEFFairport,机场\nluggage,行李')).text,'airport,机场\nluggage,行李');
 assert.equal(parseFile('words.docx',office('word/document.xml','<w:document><w:p><w:r><w:t>air</w:t></w:r><w:r><w:t>port &amp; luggage</w:t></w:r></w:p><w:p><w:r><w:t>delay</w:t></w:r></w:p></w:document>')).text,'airport & luggage\ndelay');
 const xlsx=zip({'[Content_Types].xml':'<Types/>','xl/sharedStrings.xml':'<sst><si><t>airport</t></si><si><r><t>行</t></r><r><t>李</t></r></si></sst>','xl/worksheets/sheet1.xml':'<worksheet><row><c t="s"><v>0</v></c><c t="inlineStr"><is><t>机场</t></is></c></row><row><c t="s"><v>1</v></c></row></worksheet>','xl/worksheets/sheet2.xml':'<worksheet><row><c t="inlineStr"><is><t>delay</t></is></c></row></worksheet>'});
 assert.equal(parseFile('words.xlsx',xlsx).text,'airport\t机场\n行李\ndelay');
 assert.equal(parseFile('image.png',png).mime,'image/png');
 for(const [name,data,code] of [
  ['bad.txt',Buffer.from([255,255]),'INVALID_IMPORT_ENCODING'],['bad.png',Buffer.from('not image'),'INVALID_IMPORT_FILE'],['bad.pdf',Buffer.from('%PDF'),'IMPORT_FORMAT_UNSUPPORTED'],['bad.csv',Buffer.from('a'.repeat(8001)),'IMPORT_TEXT_TOO_LONG'],['empty.txt',Buffer.from(' '),'IMPORT_EMPTY'],['secret.txt',Buffer.from('sk-'+'x'.repeat(30)),'SENSITIVE_INPUT'],['bad.xlsx',office('xl/worksheets/sheet1.xml','<row><c><f>1+1</f><v>2</v></c></row>'),'IMPORT_FORMULA_UNSUPPORTED'],['bad.docx',office('word/document.xml','<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><w:p><w:t>&x;</w:t></w:p>'),'INVALID_IMPORT_FILE'],['bad.docx',zip({'[Content_Types].xml':'<Types/>','../outside':'x','word/document.xml':'<w:p><w:t>x</w:t></w:p>'}),'INVALID_IMPORT_FILE'],['bomb.docx',office('word/document.xml','x'.repeat(3*1024*1024)),'INVALID_IMPORT_FILE']
 ] as const)assert.throws(()=>parseFile(name,data),{code});
});
test('CSV preserves quotes, newlines, Chinese and neutralizes spreadsheet formulas',()=>{
 assert.equal(csvCell('机场,"test"\n下一行'),'"机场,""test""\n下一行"');
 for(const value of ['=cmd()',' +SUM(1)','@SUM(A1)','-1','\t=1'])assert(csvCell(value).startsWith('"\''));
});
test('scope, >200 word paging, arbitrary selection/all exclusions, OCR caching and budgets',async()=>{
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/007_import_attempts.sql','utf8'));
 const db={query:(s:string,p?:any[])=>pg.query(s,p),transaction:(fn:any)=>pg.transaction((q:any)=>fn({query:(s:string,p?:any[])=>q.query(s,p)}))};
 let calls=0,revoke='',fail=false;const reader={profile:'test',read:async()=>{calls++;if(revoke)await pg.query("UPDATE wordmate.family_members SET status='removed' WHERE user_id=$1",[revoke]);if(fail)throw Error('provider failure');return 'airport\nluggage';}};
 const core=new Core(db,new DevIdentity(),new FixtureDictionary(),{} as any,'test',()=>new Date(),undefined,undefined,undefined,reader);
 try{
  const dad=(await core.login('dev-dad')).user.id,outsider=(await core.login('dev-outsider')).user.id,f=await core.createFamily(dad,'f',{name:'family'}),c=await core.createChild(dad,'c',f.id,{nickname:'child'});
  const ids:string[]=[];for(let i=0;i<205;i++){const id=randomUUID();ids.push(id);await pg.query("INSERT INTO wordmate.child_words(id,child_id,lemma,normalized_lemma,part_of_speech,sense_key,meaning_zh,dictionary_source,created_by) VALUES($1,$2,$3,$3,'noun','default','中文','test',$4)",[id,c.id,'word'+i,dad]);}
  let cursor:string|null=null,seen=new Set<string>();do{const page=await core.words(dad,c.id,{limit:100,...(cursor?{cursor}:{})});assert.equal(page.total,205);page.items.forEach((w:any)=>{assert(!seen.has(w.id));seen.add(w.id);});cursor=page.next_cursor;}while(cursor);assert.equal(seen.size,205);
  const selected=await core.exportWords(dad,c.id,{word_ids:[ids[0],ids[204]]});assert.equal(selected.count,2);assert(selected.content.startsWith('\uFEFF'));assert(selected.content.includes('"word0"'));assert(!selected.content.includes('"word1"'));
  assert.equal((await core.exportWords(dad,c.id,{all:true,excluded_ids:[ids[0]]})).count,204);
  await assert.rejects(core.exportWords(outsider,c.id,{all:true}),{code:'FAMILY_NOT_FOUND'});
  await assert.rejects(core.exportWords(dad,c.id,{word_ids:[ids[0],randomUUID()]}),{code:'EXPORT_SELECTION_CHANGED'});
  const input={name:'page.png',base64:png.toString('base64')};await assert.rejects(core.imports.extract(outsider,c.id,input),{code:'FAMILY_NOT_FOUND'});assert.equal(calls,0);
  assert.equal((await core.imports.extract(dad,c.id,{name:'words.txt',base64:Buffer.from('apple').toString('base64')})).text,'apple');assert.equal(calls,0);
  assert.equal((await core.imports.extract(dad,c.id,input)).text,'airport\nluggage');assert.equal((await core.imports.extract(dad,c.id,input)).text,'airport\nluggage');assert.equal(calls,1);
  const row=(await pg.query('SELECT * FROM wordmate.import_attempts')).rows[0];assert(!JSON.stringify(row).includes(input.base64));
  const changed={...input,base64:Buffer.concat([png,Buffer.from('different')]).toString('base64')};fail=true;for(let i=0;i<3;i++)await assert.rejects(core.imports.extract(dad,c.id,changed));await assert.rejects(core.imports.extract(dad,c.id,changed),{code:'IMPORT_ATTEMPTS_EXHAUSTED'});assert.equal(calls,4);fail=false;
  for(let i=0;i<26;i++)await pg.query("INSERT INTO wordmate.import_attempts(actor_id,child_id,digest,status) VALUES($1,$2,$3,'failed')",[dad,c.id,'budget-'+i]);
  await assert.rejects(core.imports.extract(dad,c.id,{...input,base64:Buffer.concat([png,Buffer.from('budget')]).toString('base64')}),{code:'IMPORT_DAILY_LIMIT'});
  assert.equal((await core.imports.extract(dad,c.id,input)).text,'airport\nluggage');assert.equal(calls,4);
  await pg.query("UPDATE wordmate.import_attempts SET created_at=now()-interval '26 hours'");await core.imports.purge();assert.equal((await pg.query('SELECT count(*)::int n FROM wordmate.import_attempts')).rows[0].n,0);
  await pg.query("INSERT INTO wordmate.import_attempts(actor_id,child_id,digest,status) VALUES($1,$2,'pending','running')",[dad,c.id]);await assert.rejects(core.imports.extract(dad,c.id,input),{code:'IMPORT_BUSY'});await pg.query('DELETE FROM wordmate.import_attempts');
  revoke=dad;await assert.rejects(core.imports.extract(dad,c.id,{...input,base64:Buffer.concat([png,Buffer.from('revoke')]).toString('base64')}),{code:'FAMILY_NOT_FOUND'});
 }finally{await pg.close();}
});
test('vision adapter isolates credentials and image data; handles refusal, truncation, timeout',async()=>{
 const env={OCR_PROVIDER:'qwen',OCR_API_KEY:'private-test',OCR_WORKSPACE_ID:'workspace-test',OCR_MODEL:'qwen3.7-flash-2026-07-15'};let request:any;
 const reader=imageReader(env,(async(url:any,init:any)=>{request={url,init,body:JSON.parse(init.body)};return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({text:'airport'})}}]}));}) as any)!;
 assert.equal(await reader.read(png,'image/png'),'airport');assert(request.url.startsWith('https://workspace-test.cn-beijing.maas.aliyuncs.com/'));assert.equal(request.init.redirect,'error');assert(!JSON.stringify(request.body).includes(env.OCR_API_KEY));
 for(const response of [{choices:[{finish_reason:'length'}]},{choices:[{finish_reason:'stop',message:{content:'invalid'}}]}]){const bad=imageReader(env,(async()=>new Response(JSON.stringify(response))) as any)!;await assert.rejects(bad.read(png,'image/png'),{code:'OCR_FAILED'});}
 assert.equal(imageReader({}),undefined);assert.throws(()=>imageReader({...env,OCR_WORKSPACE_ID:'attacker/../'}),{code:'OCR_CONFIGURATION_INVALID'});
});
