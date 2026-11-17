export type SentenceRating='again'|'hard'|'good';
export type SentenceRound={id:string;source:string;status:string;book_id:string|null;lease_id:string;lease_until:string;total:number;remaining:number;wrong:number;current:{ordinal:number;sentence_id:string;translation_zh:string;revealed:boolean;text_en:string|null;content_version:number|null}|null};
export type SentenceDraft={text_en:string;translation_zh:string;source_index?:number;original_translation?:string;translation_source?:'user'|'ai';check_status?:'ok'|'needs_review'|'uncertain';issues?:string[];suggested_translation?:string;reviewed?:boolean;edited?:boolean};
// A review page can recover this exact event after an interrupted request.
export type PendingSentenceAnswer={round_id:string;lease_id:string;ordinal:number;event_id:string;rating:SentenceRating};
export const sentenceScope=(storage:{get(k:string):any})=>`${storage.get('access_token')}:${storage.get('child_id')}`;
export function sentenceDraftRows(raw:string):SentenceDraft[]{
 const rows=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),result:SentenceDraft[]=[];
 for(const row of rows){const cells=row.split(/\t|\s*\|\s*/).filter(Boolean);if(cells.length!==2||!/[A-Za-z]/.test(cells[0])||!/\p{Script=Han}/u.test(cells[1]))return [];result.push({text_en:cells[0],translation_zh:cells[1]});}
 return result;
}

export function sentenceNeedsReview(item:SentenceDraft){return item.check_status!=='ok'||!!item.edited;}
export function sentenceCanSave(items:SentenceDraft[],checked:boolean){return checked&&items.length>0&&items.every(item=>item.text_en.trim()&&item.translation_zh.trim()&&item.check_status&&Number.isInteger(item.source_index)&&(!sentenceNeedsReview(item)||item.reviewed===true));}
