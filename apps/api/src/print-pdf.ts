import {deflateSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

type PinyinFont={data:Buffer;metrics:{glyphs:Record<string,[number,number]>;bbox:number[];ascent:number;descent:number;capHeight:number}};
let pinyinFont:Promise<PinyinFont>|undefined;
export function loadPinyinFont(){
 return pinyinFont??=(async()=>{
  const directory=resolve(process.cwd(),'apps/api/data/pinyin-font');
  const [data,metrics]=await Promise.all([readFile(resolve(directory,'WordmatePinyin.ttf')),readFile(resolve(directory,'metrics.json'),'utf8')]);
  return {data,metrics:JSON.parse(metrics)};
 })().catch(error=>{pinyinFont=undefined;throw error;});
}

export const number=(n:number)=>Number(n.toFixed(3)).toString();
const hex=(s:string)=>Array.from(s).map(c=>c.codePointAt(0)!).filter(c=>c<=0xffff).map(c=>c.toString(16).padStart(4,'0')).join('').toUpperCase();
// UniGB's predefined CJK font does not reliably render tone-marked Latin on iOS.
// Keep Chinese in /C and embed the complete Latin/pinyin glyphs in /P.
export const label=(x:number,y:number,size:number,text:string)=>{
 const runs=text.normalize('NFC').match(/[\u0020-\u024f\u0300-\u036f\u1e00-\u1eff]+|[^\u0020-\u024f\u0300-\u036f\u1e00-\u1eff]+/gu)??[];
 return `BT ${number(x)} ${number(y)} Td `+runs.map(run=>`/${run.charCodeAt(0)<0x250||(run.charCodeAt(0)>=0x300&&run.charCodeAt(0)<=0x36f)||(run.charCodeAt(0)>=0x1e00&&run.charCodeAt(0)<=0x1eff)?'P':'C'} ${number(size)} Tf <${hex(run)}> Tj `).join('')+'ET\n';
};
// Convert the corpus' SVG outlines to PDF paths, including quadratic curves.
export function pathFor(source:string,x:number,y:number,size:number){
 const tokens=source.match(/[MLQCZ]|-?\d+(?:\.\d+)?/g)||[];let i=0,op='',cx=0,cy=0;let out='';const pt=(a:number,b:number)=>[x+a*size/1024,y+(b+124)*size/1024];
 while(i<tokens.length){if(/^[MLQCZ]$/.test(tokens[i]))op=tokens[i++];if(op==='Z'){out+='h\n';op='';continue;}const count=op==='M'||op==='L'?2:op==='Q'?4:op==='C'?6:0;if(!count||i+count>tokens.length)throw Error('INVALID_STROKE_PATH');const v=tokens.slice(i,i+count).map(Number);i+=count;
  if(op==='M'||op==='L'){const [a,b]=pt(v[0],v[1]);out+=`${number(a)} ${number(b)} ${op==='M'?'m':'l'}\n`;cx=a;cy=b;if(op==='M')op='L';}
  else if(op==='Q'){const [ax,ay]=pt(v[0],v[1]),[bx,by]=pt(v[2],v[3]);out+=`${number(cx+2*(ax-cx)/3)} ${number(cy+2*(ay-cy)/3)} ${number(bx+2*(ax-bx)/3)} ${number(by+2*(ay-by)/3)} ${number(bx)} ${number(by)} c\n`;cx=bx;cy=by;}
  else{const [ax,ay]=pt(v[0],v[1]),[bx,by]=pt(v[2],v[3]),[dx,dy]=pt(v[4],v[5]);out+=`${number(ax)} ${number(ay)} ${number(bx)} ${number(by)} ${number(dx)} ${number(dy)} c\n`;cx=dx;cy=dy;}
 }
 return out+'f\n';
}
export function pdf(pages:string[],forms:string[][],font:PinyinFont){
 const objects:string[]=[];const add=(s:string)=>{objects.push(s);return objects.length;};
 add('<< /Type /Catalog /Pages 2 0 R >>');add('');add('<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [4 0 R] >>');add('<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> >>');
 const stream=(data:Buffer,extra='')=>{const compressed=deflateSync(data);return add(`<< ${extra} /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n${compressed.toString('latin1')}\nendstream`);};
 const embedded=stream(font.data,`/Length1 ${font.data.length}`),m=font.metrics;
 const descriptor=add(`<< /Type /FontDescriptor /FontName /WordmatePinyin /Flags 32 /FontBBox [${m.bbox.join(' ')}] /ItalicAngle 0 /Ascent ${m.ascent} /Descent ${m.descent} /CapHeight ${m.capHeight} /StemV 80 /FontFile2 ${embedded} 0 R >>`);
 const mapping=Buffer.alloc((Math.max(...Object.keys(m.glyphs).map(Number))+1)*2);
 for(const [code,[gid]] of Object.entries(m.glyphs))mapping.writeUInt16BE(gid,Number(code)*2);
 const gidMap=stream(mapping);
 const widths=Object.entries(m.glyphs).map(([code,[,width]])=>`${code} [${width}]`).join(' ');
 const descendant=add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /WordmatePinyin /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /CIDToGIDMap ${gidMap} 0 R /W [${widths}] >>`);
 const unicode=stream(Buffer.from('/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /WordmatePinyin-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n1 beginbfrange\n<0000> <FFFF> <0000>\nendbfrange\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend','ascii'));
 const latinFont=add(`<< /Type /Font /Subtype /Type0 /BaseFont /WordmatePinyin /Encoding /Identity-H /DescendantFonts [${descendant} 0 R] /ToUnicode ${unicode} 0 R >>`);
 const formIds=forms.map(paths=>{if(!paths.length)return 0;const data=paths.map(p=>pathFor(p,0,0,1024)).join(''),compressed=deflateSync(Buffer.from(data,'ascii'));return add(`<< /Type /XObject /Subtype /Form /BBox [0 0 1024 1024] /Resources << >> /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n${compressed.toString('latin1')}\nendstream`);});const xobjects=formIds.map((id,i)=>id?`/G${i} ${id} 0 R`:'').filter(Boolean).join(' ');
 const ids:number[]=[];for(const page of pages){const compressed=deflateSync(Buffer.from(page,'ascii'));const content=add(`<< /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n${compressed.toString('latin1')}\nendstream`);ids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /C 3 0 R /P ${latinFont} 0 R >> /XObject << ${xobjects} >> >> /Contents ${content} 0 R >>`));}objects[1]=`<< /Type /Pages /Count ${ids.length} /Kids [${ids.map(i=>`${i} 0 R`).join(' ')}] >>`;
 let out='%PDF-1.4\n%WORDMATE\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(out,'latin1'));out+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=Buffer.byteLength(out,'latin1');out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(out,'latin1');
}
