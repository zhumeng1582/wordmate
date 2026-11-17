import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {renderHanziCopybook} from '../src/hanzi-copybook.ts';
function content(pdf:Buffer){const data=pdf.toString('latin1'),blocks:string[]=[];const re=/<< \/Filter \/FlateDecode \/Length (\d+) >>\nstream\n/g;let match:RegExpExecArray|null;while((match=re.exec(data))){const start=match.index+match[0].length,end=start+Number(match[1]);const decoded=inflateSync(pdf.subarray(start,end)).toString('ascii');if(decoded.startsWith('0.1 g\n'))blocks.push(decoded);re.lastIndex=end;}return blocks;}
for(const [character,strokes,expectedSteps,expectedGrids,expectedTraces] of [['一',1,1,10,6],['春',9,9,20,8],['乾',11,11,20,6],['亵',12,12,20,5],['薇',16,16,20,1],['矚',26,26,30,1],['纜',27,27,40,10],['爨',30,30,40,7],['龘',48,0,10,7]] as const){
 test(`copybook fills stroke rows and leaves exactly three blank squares for ${character}`,async()=>{
  const pages=content(await renderHanziCopybook([{character,pinyin:'',words:'',strokes}]));assert.equal(pages.length,1);const page=pages[0],count=(re:RegExp)=>(page.match(re)||[]).length;
  assert.equal(count(/ re S\n/g),expectedGrids);const sizes=[...page.matchAll(/[\d.]+ [\d.]+ ([\d.]+) ([\d.]+) re S\n/g)].map(m=>`${m[1]}:${m[2]}`);assert.equal(sizes.length,expectedGrids);assert.equal(new Set(sizes).size,1);assert.equal(count(/BT \/C 6 Tf/g),0);assert.equal(count(/0\.4 g\n(?=[\d.-])/g),expectedSteps);assert.equal(count(/0\.78 g\n(?:q |BT )/g),expectedTraces);assert.equal(expectedGrids-expectedSteps-expectedTraces,3);
 });
}

test('long pinyin remains complete across header lines without a word label',async()=>{
 const pinyin='shǎo（多少）；shào（少年）；'+ 'yīn'.repeat(19)+'zhōng';const words='春天、春风';const page=content(await renderHanziCopybook([{character:'春',pinyin,words,strokes:9}]))[0];
 const labels=[...page.matchAll(/<([0-9A-F]+)> Tj/g)].map(m=>Buffer.from(m[1],'hex').swap16().toString('utf16le')).join('');
 assert(labels.includes(pinyin));assert(labels.includes(words));assert(!labels.includes('组词：'));assert(!labels.includes('词组：'));
});

test('pinyin uses an embedded font with actual glyphs and widths for every tone',async()=>{
 const {readFile}=await import('node:fs/promises');
 const {glyphs}=JSON.parse(await readFile('apps/api/data/pinyin-font/metrics.json','utf8'));
 const pinyin='dì、de rén nǐ wǒ āáǎà ēéěè īíǐì ōóǒò ūúǔù ǖǘǚǜ ü ńňǹ ḿ ê';
 const pdf=await renderHanziCopybook([{character:'地',pinyin,words:'土地、大地',strokes:6}]);
 const source=pdf.toString('latin1');assert.match(source,/\/FontFile2 \d+ 0 R/);assert.match(source,/\/CIDToGIDMap \d+ 0 R/);assert.match(source,/\/ToUnicode \d+ 0 R/);
 const page=content(pdf)[0];
 const latin=[...page.matchAll(/\/P [\d.]+ Tf <([0-9A-F]+)> Tj/g)].map(m=>Buffer.from(m[1],'hex').swap16().toString('utf16le')).join('');
 for(const character of pinyin.replace(/、/g,'')){
  assert(latin.includes(character),`not using embedded font: ${character}`);
  const [gid,width]=glyphs[character.codePointAt(0)!]??[];assert(gid>0&&width>0,`missing pinyin glyph: ${character}`);
 }
});
