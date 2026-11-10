import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {renderHanziCopybook} from '../src/hanzi-copybook.ts';
function content(pdf:Buffer){const data=pdf.toString('latin1'),blocks:string[]=[];const re=/<< \/Filter \/FlateDecode \/Length (\d+) >>\nstream\n/g;let match:RegExpExecArray|null;while((match=re.exec(data))){const start=match.index+match[0].length,end=start+Number(match[1]);blocks.push(inflateSync(pdf.subarray(start,end)).toString('ascii'));re.lastIndex=end;}return blocks;}
for(const [character,strokes,expectedSteps,expectedGrids,expectedTraces] of [['一',1,1,15,11],['春',9,9,15,3],['乾',11,11,15,1],['亵',12,12,30,15],['薇',16,16,30,11],['矚',26,26,30,1],['纜',27,27,45,15],['爨',30,30,45,12],['龘',48,0,15,12]] as const){
 test(`copybook fills stroke rows and leaves exactly three blank squares for ${character}`,async()=>{
  const pages=content(await renderHanziCopybook([{character,pinyin:'',words:'',strokes}]));assert.equal(pages.length,1);const page=pages[0],count=(re:RegExp)=>(page.match(re)||[]).length;
  assert.equal(count(/ re S\n/g),expectedGrids);const sizes=[...page.matchAll(/[\d.]+ [\d.]+ ([\d.]+) ([\d.]+) re S\n/g)].map(m=>`${m[1]}:${m[2]}`);assert.equal(sizes.length,expectedGrids);assert.equal(new Set(sizes).size,1);assert.equal(count(/BT \/C 6 Tf/g),0);assert.equal(count(/0\.63 g\n/g),expectedSteps);assert.equal(count(/0\.8 g\n/g),expectedTraces);assert.equal(expectedGrids-expectedSteps-expectedTraces,3);
 });
}

test('long pinyin remains complete across header lines without a word label',async()=>{
 const pinyin='shǎo（多少）；shào（少年）；'+ 'yīn'.repeat(19)+'zhōng';const words='春天、春风';const page=content(await renderHanziCopybook([{character:'春',pinyin,words,strokes:9}]))[0];
 const labels=[...page.matchAll(/BT \/C [\d.]+ Tf [\d.]+ [\d.]+ Td <([0-9A-F]+)> Tj ET/g)].map(m=>Buffer.from(m[1],'hex').swap16().toString('utf16le')).join('');
 assert(labels.includes(pinyin));assert(labels.includes(words));assert(!labels.includes('组词：'));assert(!labels.includes('词组：'));
});
