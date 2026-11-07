// Poppler's bounding boxes preserve layout even when -layout interleaves columns.
type Word={text:string;x0:number;x1:number;y0:number;y1:number};
type Line={words:Word[];y:number};
const entity=(s:string)=>s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,v:string)=>v[0]==='#'?String.fromCodePoint(v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):Number(v.slice(1))):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"} as Record<string,string>)[v.toLowerCase()]);
const attr=(s:string,n:string)=>Number(s.match(new RegExp(`\\b${n}="([0-9.]+)"`))?.[1]);
export function poemPagesFromBbox(xml:string,fallback:string[]):string[]{
 const matches=[...xml.matchAll(/<page\b([^>]*)>([\s\S]*?)<\/page>/g)];if(matches.length!==fallback.length)return fallback;
 return matches.map((page,index)=>{
  const width=attr(page[1],'width');if(!Number.isFinite(width)||width<=0)return fallback[index];const words:Word[]=[];
  for(const m of page[2].matchAll(/<word\b([^>]*)>([\s\S]*?)<\/word>/g)){const w={text:entity(m[2].replace(/<[^>]*>/g,'')),x0:attr(m[1],'xMin'),x1:attr(m[1],'xMax'),y0:attr(m[1],'yMin'),y1:attr(m[1],'yMax')};if(w.text.trim()&&[w.x0,w.x1,w.y0,w.y1].every(Number.isFinite))words.push(w);}
  if(words.length<6)return fallback[index];
  // Find a clear central gutter supported by multiple rows on both sides.
  let best=0,score=0;for(let x=width*.32;x<=width*.68;x+=width*.01){const left=words.filter(w=>w.x1<x-width*.015),right=words.filter(w=>w.x0>x+width*.015),cross=words.filter(w=>w.x0<x+width*.015&&w.x1>x-width*.015);if(left.length<3||right.length<3||cross.length>Math.max(2,words.length*.08))continue;const rows=(list:Word[])=>new Set(list.map(w=>Math.round(w.y0/Math.max(3,(w.y1-w.y0)*.7)))).size;const l=rows(left),r=rows(right);if(l<3||r<3)continue;const value=Math.min(l,r)-cross.length*2;if(value>score){score=value;best=x;}}
  if(!best)return fallback[index];
  const lines:Line[]=[];for(const word of words.sort((a,b)=>a.y0-b.y0||a.x0-b.x0)){const tolerance=Math.max(2,(word.y1-word.y0)*.45);let line=lines.find(l=>Math.abs(l.y-word.y0)<=tolerance);if(!line){line={words:[],y:word.y0};lines.push(line);}line.words.push(word);}
  const groups:{left:Word[];right:Word[];full:Word[]}[]=[];let group={left:[] as Word[],right:[] as Word[],full:[] as Word[]};
  for(const line of lines.sort((a,b)=>a.y-b.y)){const crossing=line.words.some(w=>w.x0<best&&w.x1>best);if(crossing){if(group.left.length||group.right.length){groups.push(group);group={left:[],right:[],full:[]};}groups.push({left:[],right:[],full:line.words});continue;}for(const w of line.words)(w.x1<=best?group.left:group.right).push(w);}
  if(group.left.length||group.right.length)groups.push(group);
  const render=(ws:Word[])=>{const rows:Line[]=[];for(const w of ws.sort((a,b)=>a.y0-b.y0||a.x0-b.x0)){let row=rows.find(l=>Math.abs(l.y-w.y0)<=Math.max(2,(w.y1-w.y0)*.45));if(!row){row={words:[],y:w.y0};rows.push(row);}row.words.push(w);}return rows.sort((a,b)=>a.y-b.y).map(l=>l.words.sort((a,b)=>a.x0-b.x0).map(w=>w.text).reduce((out,next)=>out+(/[\u3400-\u9fff，。！？；：、（）《》]$/.test(out)&&/^[\u3400-\u9fff，。！？；：、（）《》]/.test(next)?'':' ')+next,'').trimStart()).join('\n');};
  const result=groups.flatMap(g=>[render(g.full),render(g.left),render(g.right)]).filter(Boolean).join('\n\n');return result||fallback[index];
 });
}
