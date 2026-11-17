export const searchCategories=[{key:'words',label:'单词'},{key:'poems',label:'古诗词'},{key:'hanzi',label:'汉字'},{key:'sentences',label:'句子'},{key:'books',label:'词本'}] as const;
export type SearchType='all'|'words'|'poems'|'hanzi'|'sentences'|'books';
export type SearchItem={id:string;key:string;kind:string;title:string;subtitle:string;snippet:string;source:string;book_names:string;archived:boolean;item_count:number;joined_book_id?:string};
export type SearchGroup={type:SearchType;total:number;items:SearchItem[]};
export type SearchResult={query:string;type:SearchType;counts:Record<string,number>;groups:SearchGroup[];next_cursor:string|null};
export function visibleSearchTabs(counts:Record<string,number>){const types=searchCategories.filter(c=>counts[c.key]>0);return types.length?[{key:'all',label:'全部'},...types]:[];}
export function searchTypeAfterResults(type:SearchType,counts:Record<string,number>):SearchType{return type==='all'||counts[type]>0?type:'all';}
export function searchResultRoute(item:SearchItem){const id=encodeURIComponent(item.id);return item.kind==='sentence'?`/pages/sentences/index?bookId=${encodeURIComponent(item.joined_book_id??'')}&sentenceId=${id}&status=${item.archived?'archived':'all'}`:item.kind==='sentence_book'?'/pages/sentences/index':item.kind==='word'?`/pages/word-detail/index?id=${id}`:item.kind==='poem'?`/pages/poem-detail/index?id=${id}`:item.kind==='hanzi'?`/pages/hanzi-detail/index?id=${id}`:item.kind==='wordbook'?'/pages/words/index':item.kind==='hanzi_book'?'/pages/hanzi/index':item.kind==='poem_book'?'/pages/poems/index':`/pages/book-preview/index?kind=${encodeURIComponent(item.kind)}&id=${id}`;}

export function searchDisplayTitle(item:SearchItem){return item.kind==='poem'?item.title.replace(/[《》〈〉]/g,'').trim():item.title;}
