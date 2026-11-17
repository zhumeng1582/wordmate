export type LibraryKind='words'|'hanzi'|'poems'|'sentences';
export const libraryConfig={
 sentences:{name:'句子',book:'句子本',title:'英语句子本',store:'current_sentence_book',api:'sentence-books',list:'sentences',add:'sentence-entry',search:'search',manage:'wordbooks',edit:'sentence-book-edit',discover:'discover',share:'sentence-book-share',count:'sentence_count'},
 words:{name:'单词',book:'词本',title:'单词本',store:'current_wordbook',api:'wordbooks',list:'words',add:'add-words',search:'search',manage:'wordbooks',edit:'wordbook-edit',discover:'discover',share:'wordbook-share',count:'word_count'},
 poems:{name:'古诗',book:'诗本',title:'古诗本',store:'current_poem_book',api:'poem-books',list:'poems',add:'poem-entry',search:'search',manage:'wordbooks',edit:'poem-book-edit',discover:'discover',share:'poem-book-share',count:'poem_count'},
 hanzi:{name:'汉字',book:'字本',title:'汉字本',store:'current_hanzi_book',api:'hanzi-books',list:'hanzi',add:'hanzi-import',search:'search',manage:'wordbooks',edit:'hanzi-book-edit',discover:'discover',share:'hanzi-book-share',count:'hanzi_count'}
} as const;
export function libraryEntries(kind:LibraryKind){const c=libraryConfig[kind];return [{page:c.list,title:c.title},{page:c.add,title:`录入${c.name}`},{page:c.search,title:`搜索${c.name}`},{page:c.manage,title:'词本管理与发现'}];}
export function libraryShortcuts(kind:LibraryKind){const c=libraryConfig[kind];return [{page:c.add,title:`录入${c.name}`},{page:c.edit,title:`新建${c.book}`},{page:c.search,title:`搜索${c.name}`},{page:c.manage,title:'词本管理与发现'}];}
export const bookCategoryKeys=['','grade','textbook','category'];
export const bookCategoryLabels=['全部分类','按年级','按教材','按自定义类型'];

export type LibraryMenuEntry={title:string;page?:string;url?:string;action?:'archive'|'locate'|'export'|'copybook'};
export type LibraryMenuGroup={title:string;entries:LibraryMenuEntry[]};
export function libraryActionGroups(kind:LibraryKind,options:{archive:string;canLocate:boolean;canExport:boolean}):LibraryMenuGroup[]{
 const [add]=libraryShortcuts(kind),c=libraryConfig[kind];
 return [
  {title:`${c.name}管理`,entries:[add,...(kind==='hanzi'?[{title:'收藏汉字',url:'/pages/hanzi/index?status=favorite'}]:[]),...(options.canExport?[{title:'选择导出',action:'export' as const},...(kind==='words'?[{title:'导出英文字帖',action:'copybook' as const}]:[])]:[])]},
  ...(options.canLocate?[{title:'列表工具',entries:[{title:'定位未学',action:'locate' as const}]}]:[])
 ];
}
export function poemActionGroups():LibraryMenuGroup[]{return [{title:'古诗管理',entries:[
 {title:'录入古诗',url:'/pages/import/index?kind=poems'},
 {title:'录入记录',url:'/pages/import-records/index'},
 {title:'收藏诗词',url:'/pages/poems/index?status=favorite'}
]}];}
export async function chooseLibraryAction(groups:LibraryMenuGroup[],show:(titles:string[])=>Promise<{tapIndex:number}>,current:()=>boolean){
 if(!current())return;
 const entries=groups.flatMap(group=>group.entries);
 const selected=await show(entries.map(entry=>entry.title));if(!current())return;
 return entries[selected.tapIndex];
}

export function libraryPageRoute(page:string){const routes:Record<string,string>={'add-words':'/pages/import/index?kind=words','hanzi-import':'/pages/import/index?kind=hanzi','poem-entry':'/pages/import/index?kind=poems','sentence-entry':'/pages/import/index?kind=sentences',generation:'/pages/import-records/index','hanzi-jobs':'/pages/import-records/index','poem-jobs':'/pages/import-records/index'};return routes[page]??`/pages/${page}/index`;}
