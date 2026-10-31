import {ensure} from './errors.ts';
import {parseFile} from './import-files.ts';
import type {Row} from './ports.ts';
export const parentDto=(user:Row)=>({id:user.id,display_name:user.display_name,version:user.profile_version??1,avatar_path:user.avatar_mime&&user.avatar_revision>0?`/parents/${user.id}/avatar?v=${user.avatar_revision}`:null});
export function decodeAvatar(base64:unknown,mime:unknown){
 ensure(typeof base64==='string'&&base64.length>0&&base64.length<=174764&&/^[A-Za-z0-9+/]+={0,2}$/.test(base64),422,'INVALID_AVATAR');
 ensure(mime==='image/jpeg'||mime==='image/png',422,'INVALID_AVATAR');
 const bytes=Buffer.from(base64,'base64');ensure(bytes.length<=131072&&bytes.toString('base64')===base64,422,'INVALID_AVATAR');
 try{const parsed=parseFile(mime==='image/png'?'avatar.png':'avatar.jpg',bytes,262144);ensure(parsed.mime===mime,422,'INVALID_AVATAR');}catch{ensure(false,422,'INVALID_AVATAR');}
 return {bytes,mime:mime as string};
}
