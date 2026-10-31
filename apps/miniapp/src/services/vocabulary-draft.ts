export type MaterialMode='text'|'image'|'file';
export type PreparedWord={input_index:number;input:string;status:'ok'|'invalid';lemma:string|null;meaning_zh:string|null;reason:string|null;[key:string]:any};
export type VocabularyDraft={format:1;mode:MaterialMode;raw:string;theme:string;bookId:string;prepared:PreparedWord[]|null;editing:{id:string;attempts:number}|null};
export type VocabularySubmission={jobId?:string;body:{wordbook_id:string;source_type:'vision'|'text';raw_text:string;theme:string;expected_attempts?:number;prepared_items?:PreparedWord[]};key:string};
export const vocabularyKeys=(token:string,child:string)=>({draft:`vocabulary-draft:${token}:${child}`,pending:`vocabulary-submit:${token}:${child}`,edit:`vocabulary-edit:${token}:${child}`,result:`vocabulary-result:${token}:${child}`});
export const emptyVocabularyDraft=():VocabularyDraft=>({format:1,mode:'text',raw:'',theme:'',bookId:'',prepared:null,editing:null});
export function readVocabularyDraft(value:any):VocabularyDraft{
 if(value?.format!==1||typeof value.raw!=='string'||value.raw.length>8000||typeof value.theme!=='string'||value.theme.length>80)return emptyVocabularyDraft();
 return {...emptyVocabularyDraft(),...value,mode:['text','image','file'].includes(value.mode)?value.mode:'text',bookId:typeof value.bookId==='string'?value.bookId:'',prepared:Array.isArray(value.prepared)&&value.prepared.length>0&&value.prepared.length<=30?value.prepared:null};
}
export function applyMaterial(draft:VocabularyDraft,result:{text:string;prepared_items?:PreparedWord[];source:'image'|'file'}):VocabularyDraft{
 const raw=result.source==='image'?result.text:[draft.raw.trim(),result.text].filter(Boolean).join('\n');
 if(raw.length>8000)throw Error('IMPORT_TEXT_TOO_LONG');if(!raw.trim())throw Error('IMPORT_EMPTY');
 return {...draft,mode:result.source==='image'?'image':'file',raw,prepared:result.source==='image'&&result.prepared_items?.length?result.prepared_items:null};
}
export function removePreparedWord(draft:VocabularyDraft,index:number):VocabularyDraft{
 const prepared=draft.prepared?.filter((_,i)=>i!==index).map((item,input_index)=>({...item,input_index}))??[];
 return {...draft,prepared:prepared.length?prepared:null,raw:prepared.length?draft.raw:'',mode:prepared.length?draft.mode:'image'};
}
export function vocabularySubmission(draft:VocabularyDraft,key:string):VocabularySubmission{
 if(!draft.bookId||!draft.raw.trim())throw Error('INVALID_REQUEST_BODY');
 return {jobId:draft.editing?.id,key,body:{wordbook_id:draft.bookId,source_type:draft.prepared?'vision':'text',raw_text:draft.raw,theme:draft.theme.trim(),...(draft.editing?{expected_attempts:draft.editing.attempts}:{}),...(draft.prepared?{prepared_items:draft.prepared}:{})}};
}
