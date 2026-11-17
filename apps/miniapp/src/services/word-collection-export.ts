import {api,storage} from './api';
import {shareWordPdf} from './files';
type Options={kind:'favorites'|'mistakes';format?:'copybook';start?:string;end?:string;source?:string;ids?:string[]};
/** Read all filtered pages, not just the visible page, then use the authorized PDF exporter. */
export async function collectWordCollectionIds(options:Options,current:()=>boolean){
 const child=storage.get('child_id'),ids=new Set<string>();let cursor:string|null=null;
 if(options.ids)options.ids.forEach(id=>ids.add(id));
 else do{
  const query=options.kind==='favorites'?'words?mark=favorite&limit=100':`wrong-words?limit=100${options.start&&options.end?`&date_from=${options.start}&date_to=${options.end}`:''}${options.source?`&source=${options.source}`:''}`;
  const result:any=await api(`/children/${child}/${query}${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);if(!current())return;
  for(const item of result.items){const word=options.kind==='favorites'?item:item.word;if(!word.archived_at)ids.add(word.id);}
  if(ids.size>10000)throw Error('EXPORT_TOO_LARGE');const next:string|null=result.next_cursor??null;if(next&&next===cursor)throw Error('EXPORT_SELECTION_CHANGED');cursor=next;
 }while(cursor);
 if(!current())return;if(!ids.size)throw Error('EXPORT_EMPTY');
 return [...ids];
}
export async function exportWordCollection(options:Options,current:()=>boolean){
 const child=storage.get('child_id'),ids=await collectWordCollectionIds(options,current);if(!ids||!current())return;
 const result=await api(`/children/${child}/word-exports`,'POST',{word_ids:ids,...(options.format?{format:options.format}:{})},undefined,120000);if(current())await shareWordPdf(result.base64);
}
