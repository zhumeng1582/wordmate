export type LibraryStatus='unlearned'|'learned'|'archived';
export type LibraryFilter='all'|LibraryStatus|'unlearned,learned'|'unlearned,archived'|'learned,archived'|'unlearned,learned,archived';
export const libraryFilterOptions:LibraryStatus[]=['unlearned','learned','archived'];
export const libraryStatusLabels:Record<LibraryFilter,string>={all:'未学过、学习中',unlearned:'未学过',learned:'学习中',archived:'已掌握','unlearned,learned':'未学过、学习中','unlearned,archived':'未学过、已掌握','learned,archived':'学习中、已掌握','unlearned,learned,archived':'全部'};
export function normalizeLibraryFilter(value:unknown):LibraryFilter{return value==='memorized'?'learned':value==='unmemorized'?'unlearned':typeof value==='string'&&Object.prototype.hasOwnProperty.call(libraryStatusLabels,value)?value as LibraryFilter:'all';}
export function librarySelectedStatuses(value:LibraryFilter):LibraryStatus[]{return value==='all'?['unlearned','learned']:value.split(',') as LibraryStatus[];}
export function libraryFilterValue(selected:LibraryStatus[]):LibraryFilter{const ordered=libraryFilterOptions.filter(s=>selected.includes(s));return !ordered.length||ordered.join(',')==='unlearned,learned'?'all':ordered.join(',') as LibraryFilter;}
export function libraryIncludes(value:LibraryFilter,status:LibraryStatus){return librarySelectedStatuses(value).includes(status);}
export function libraryArchiveScope(value:LibraryFilter):'active'|'archived'|'all'{return libraryIncludes(value,'archived')?(value==='archived'?'archived':'all'):'active';}
export function libraryStatus(item:any,kind:'words'|'hanzi'|'poems'):LibraryStatus{
 if(item.library_archived_at)return 'archived';
 return (kind==='words'?item.library_status==='learned'||item.learning_status==='learned':kind==='hanzi'?!!item.learned_at:!!item.memorized_at)?'learned':'unlearned';
}
