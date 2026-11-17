// Reconcile extractive AI output with source positions instead of trusting array order.
export function inSourceOrder<T>(raw:string,items:T[],anchors:(item:T)=>string[]):T[]{
 const compact=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu,'');
 const source=compact(raw);
 const positions=items.map(item=>{for(const anchor of anchors(item)){
  if(/^[a-zA-Z][a-zA-Z .’'-]*$/.test(anchor)){
   const escaped=anchor.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   // A later word may appear in an earlier entry's example. Prefer its own
   // labelled headword, Markdown heading or standalone list row.
   const heading=new RegExp('^[\\t ]*(?:\\d+[.)、][\\t ]*|[-+*][\\t ]+)?(?:\\*\\*'+escaped+'\\*\\*|__'+escaped+'__|'+escaped+'(?=[\\t ]*(?:$|[|：:/\\u3400-\\u9fff]|(?:n|v|adj|adv)\\.)))','im').exec(raw);
   if(heading)return compact(raw.slice(0,heading.index)).length;
   const match=new RegExp(`(^|[^a-zA-Z’'-])(${escaped})(?=[^a-zA-Z’'-]|$)`,'i').exec(raw);
   if(match)return compact(raw.slice(0,match.index+match[1].length)).length;
   continue;
  }
  const text=compact(anchor);if(text){const index=source.indexOf(text);if(index>=0)return index;}
 }return null;});
 // Unknown anchors (such as a requested Chinese-to-English translation) keep their
 // original slot; identifiable extracted entries are reconciled in the other slots.
 const found=items.map((item,i)=>({item,index:positions[i],i})).filter(x=>x.index!==null).sort((a,b)=>a.index!-b.index!||a.i-b.i);
 let next=0;return items.map((item,i)=>positions[i]===null?item:found[next++].item);
}
