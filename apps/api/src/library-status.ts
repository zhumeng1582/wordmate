import {ensure} from './errors.ts';
// Archive is the effective state; learning history remains available on restore.
// The product calls this existing reversible state “已掌握”.
export function libraryStatusSql(archived:string,learned:string){return `CASE WHEN ${archived} IS NOT NULL THEN 'archived' WHEN ${learned} THEN 'learned' ELSE 'unlearned' END`;}
export function librarySelection(status:unknown='all',archive:unknown='active',allowImportant=false){
 ensure(typeof archive==='string'&&['active','archived','all'].includes(archive),422,'INVALID_REQUEST_BODY');
 ensure(typeof status==='string',422,'INVALID_REQUEST_BODY');
 if(status==='all'||(allowImportant&&status==='important'))return {archive,statuses:null};
 const statuses=status.split(',').map(s=>s==='memorized'?'learned':s==='unmemorized'?'unlearned':s);
 ensure(statuses.length>0&&statuses.length<=3&&new Set(statuses).size===statuses.length&&statuses.every(s=>['unlearned','learned','archived'].includes(s)),422,'INVALID_REQUEST_BODY');
 return {archive:statuses.includes('archived')?(statuses.length===1?'archived':'all'):'active',statuses};
}
export function librarySelectionSql(selection:ReturnType<typeof librarySelection>,effective:string,archived:string){
 const scope=selection.archive==='all'?'TRUE':`${archived} IS ${selection.archive==='active'?'':'NOT '}NULL`;
 return `(${scope}) AND (${selection.statuses?`${effective} IN (${selection.statuses.map(s=>`'${s}'`).join(',')})`:'TRUE'})`;
}
