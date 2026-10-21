import {createHash} from 'node:crypto';

/** A profile identifies an immutable provider/region/bucket/prefix configuration.
 * Persist this server-only locator, never a provider URL or a signed URL. */
export type AudioObjectLocation = Readonly<{profileId:string;key:string}>;
export interface AudioObjectStorage {
 readonly provider:string;
 put(key:string,bytes:Uint8Array,mimeType:'audio/mpeg'):Promise<void>;
 get(key:string):Promise<Uint8Array>;
 // Missing returns null; permission/network errors MUST throw instead.
 stat(key:string):Promise<{size:number}|null>;
 // Used only by an authorized cleanup worker after reference checks.
 delete(key:string):Promise<void>;
}
export class AudioStorageError extends Error {
 readonly code:string;
 constructor(code:string){super(code);this.code=code;this.name='AudioStorageError';}
}
const checksum=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const validateKey=(key:string)=>{
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_./-]{0,511}$/.test(key)||key.split('/').some(x=>x==='..'||x==='.'||!x))throw new AudioStorageError('INVALID_AUDIO_OBJECT_KEY');
};
/** Routing and verified copy only; business authorization belongs before this layer. */
export function createAudioStorageRouter(adapters:Readonly<Record<string,AudioObjectStorage>>,activeProfileId:string){
 const profiles=new Map(Object.entries(adapters));
 const resolve=(id:string)=>{const store=profiles.get(id);if(!store)throw new AudioStorageError('STORAGE_PROFILE_UNAVAILABLE');return store;};
 const active=resolve(activeProfileId);
 return {
  async put(key:string,bytes:Uint8Array):Promise<AudioObjectLocation>{validateKey(key);await active.put(key,bytes,'audio/mpeg');return {profileId:activeProfileId,key};},
  get(location:AudioObjectLocation){validateKey(location.key);return resolve(location.profileId).get(location.key);},
  stat(location:AudioObjectLocation){validateKey(location.key);return resolve(location.profileId).stat(location.key);},
  delete(location:AudioObjectLocation){validateKey(location.key);return resolve(location.profileId).delete(location.key);},
  async copyToActive(location:AudioObjectLocation,expectedSha256:string):Promise<AudioObjectLocation>{
   validateKey(location.key);
   if(!/^[a-f0-9]{64}$/.test(expectedSha256))throw new AudioStorageError('INVALID_AUDIO_CHECKSUM');
   const bytes=await resolve(location.profileId).get(location.key);
   if(checksum(bytes)!==expectedSha256)throw new AudioStorageError('AUDIO_CHECKSUM_MISMATCH');
   if(location.profileId===activeProfileId)return location;
   const targetKey=`migrations/${expectedSha256}.mp3`;
   await active.put(targetKey,bytes,'audio/mpeg');
   if(checksum(await active.get(targetKey))!==expectedSha256)throw new AudioStorageError('AUDIO_COPY_VERIFICATION_FAILED');
   // Caller must commit the new locator atomically before retiring the old object.
   // Never delete the source here; copying does not consume TTS quota.
   return {profileId:activeProfileId,key:targetKey};
  }
 };
}
