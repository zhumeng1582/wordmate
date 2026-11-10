import {readFile} from 'node:fs/promises';
import {gunzip} from 'node:zlib';
import {promisify} from 'node:util';
import {resolve} from 'node:path';

// The original graphics corpus is distributed unchanged, compressed for transport.
let corpus:Promise<Map<string,string[]>>|undefined;
async function readCorpus(){
 const next=new Map<string,string[]>();
 const compressed=await readFile(resolve(process.cwd(),'apps/api/data/hanzi-strokes/graphics.txt.gz'));
 const input=(await promisify(gunzip)(compressed)).toString('utf8');let processed=0;
 for(const line of input.split('\n')){if(!line)continue;const row=JSON.parse(line);if(typeof row.character==='string'&&Array.isArray(row.strokes)&&row.strokes.every((s:unknown)=>typeof s==='string'))next.set(row.character,row.strokes);if(++processed%200===0)await new Promise<void>(resolve=>setImmediate(resolve));}
 return next;
}
function load(){if(!corpus)corpus=readCorpus().catch(error=>{corpus=undefined;throw error;});return corpus;}
export async function strokeData(character:string,declared:number|null){
 if(declared!==null&&declared>30)return {status:'too_many' as const};
 // The upstream drawing of 媾 is known to differ in stroke order from GF 0023-2020.
 if(character==='媾')return {status:'unavailable' as const};
 const strokes=(await load()).get(character);
 if(!strokes?.length)return {status:'unavailable' as const};
 if(strokes.length>30)return {status:'too_many' as const};
 if(declared!==null&&declared!==strokes.length)return {status:'mismatch' as const};
 return {status:'available' as const,strokes};
}
