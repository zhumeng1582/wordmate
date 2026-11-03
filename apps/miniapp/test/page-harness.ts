import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {refreshVisiblePages} from '../src/services/visible-pages.ts';
import {selectFamilyContext,reconcileFamilyChild} from '../src/services/family-context.ts';
import {familyInviteStatus} from '../src/services/family-invite-status.ts';
import * as studyFlow from '../src/services/study-flow.ts';
import * as aiHelpers from '../src/services/ai-settings.ts';
import * as parents from '../src/services/parents.ts';
import * as inviteLogin from '../src/services/invite-login.ts';
import * as vocabularyDraft from '../src/services/vocabulary-draft.ts';
import * as dateRange from '../src/services/date-range.ts';
import {checkinShareRequest} from '../src/generated/checkin-share.ts';
const require=createRequire(import.meta.url),ts=require('typescript');
export const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
export const deferred=()=>{let resolve!:(value?:any)=>void;const promise=new Promise<any>(done=>resolve=done);return {promise,resolve};};
export function pageHarness(file:string,read:(path:string,method:string,body:any)=>Promise<any>,component?:string,options:{cache?:Record<string,any>;query?:Record<string,string>;login?:(identity:string)=>Promise<any>;openLogin?:(identity:string,flow?:string)=>Promise<any>;audio?:{play?:(target:any)=>Promise<void>;stop?:()=>void;autoPlay?:boolean};extract?:(...args:any[])=>Promise<any>;confirm?:boolean;props?:any;download?:(args:any)=>Promise<any>;studyController?:any}={}){
 const cache=new Map<string,any>(Object.entries({access_token:'account-a',family_id:'family-a',child_id:'child-a','current_wordbook:child-a':'book-a',...options.cache})),slots:any[]=[],effects:(()=>void)[]=[],shows:(()=>void)[]=[],hides:(()=>void)[]=[],requests:string[]=[],calls:{path:string;method:string;body:any;key?:string}[]=[],routes:string[]=[],downloads:any[]=[],deleted:string[]=[];
 const loads:((query:Record<string,string>)=>void)[]=[],timers=new Map<number,()=>void>(),timeouts=new Map<number,()=>void>();let timerId=0,loaded=false,cursor=0,requestId=0,backCount=0;
 const hooks={
  useState:(initial:any)=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],(value:any)=>slots[i]=typeof value==='function'?value(slots[i]):value];},
  useRef:(initial:any)=>{const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
  useMemo:(compute:()=>any,deps:any[])=>{const i=cursor++,old=slots[i];if(!old||deps.some((value,index)=>value!==old.deps[index]))slots[i]={deps,value:compute()};return slots[i].value;},
  useEffect:(effect:()=>any,deps?:any[])=>{const i=cursor++,old=slots[i];if(!old||!deps||deps.some((value,index)=>value!==old.deps?.[index])){slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=effect();});}}
 };
 const storage={get:(key:string)=>cache.get(key)??'',set:(key:string,value:any)=>cache.set(key,value)};
 const api=async(path:string,method='GET',body?:any,key?:string)=>{requests.push(path);calls.push({path,method,body,key});return read(path,method,body);};
 const taro={env:{USER_DATA_PATH:'/tmp'},useLoad:(fn:(query:Record<string,string>)=>void)=>loads.push(fn),useDidShow:(fn:()=>void)=>shows.push(fn),useDidHide:(fn:()=>void)=>hides.push(fn),useRouter:()=>({params:{bookId:'book-a',...options.query}}),canIUse:()=>false,useShareAppMessage:()=>{},navigateTo:async({url}:{url:string})=>{routes.push(url);},showModal:async()=>({confirm:options.confirm!==false}),compressImage:async({src}:{src:string})=>({tempFilePath:src}),getImageInfo:async()=>({type:'png'}),downloadFile:async(args:any)=>{downloads.push(args);return options.download?options.download(args):{statusCode:200,tempFilePath:'/tmp/avatar-test.png'};},getFileSystemManager:()=>({writeFileSync:()=>{},unlink:({filePath}:any)=>deleted.push(filePath),readFile:({success}:any)=>success({data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5xkAAAAASUVORK5CYII='})}),navigateBack:async()=>{backCount++;},reLaunch:async({url}:{url:string})=>{routes.push(url);},showToast:()=>{},nextTick:(fn:()=>void)=>fn(),pageScrollTo:async()=>{},removeStorageSync:(key:string)=>cache.delete(key)};
 const audio={accent:'en-GB',stop:()=>{},prefetch:()=>{},play:async()=>{},active:'',error:'',status:'',...options.audio};
 const services={api,storage,login:options.login??(async()=>{throw Error('No login fixture');}),eventId:()=> `request-${++requestId}`,message:(e:any)=>e.message,go:(page:string)=>routes.push(`/pages/${page}/index`),openLogin:options.openLogin??(async()=>{})};
 const componentNames=['LearningGoal','AudioPreferences','DateRangeCalendar','DateRangeGrid','CheckinStatus','CheckinSharePreview','ReviewSession','AudioIcon','AudioText','AudioFeedback','FavoriteButton','ParentAvatar','ParentProfileEditor','Chevron'];
 const module={exports:{} as any},code=ts.transpileModule(readFileSync(`apps/miniapp/src/${file}.tsx`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,DEV_AUTH:false,API_BASE:'https://test.invalid/api',setInterval:(fn:()=>void)=>{timers.set(++timerId,fn);return timerId;},clearInterval:(id:number)=>timers.delete(id),setTimeout:(fn:()=>void)=>{timeouts.set(++timerId,fn);return timerId;},clearTimeout:(id:number)=>timeouts.delete(id),require:(id:string)=>{
  if(id==='react')return hooks;
  if(id==='react/jsx-runtime')return {jsx:(type:any,props:any,key:any)=>({type,props,key}),jsxs:(type:any,props:any,key:any)=>({type,props,key}),Fragment:'Fragment'};
  if(id==='@tarojs/taro')return taro;
  if(id==='@tarojs/components')return Object.fromEntries(['View','Button','Text','Picker','Input','Textarea','Switch','Canvas','Image','Form','Checkbox','CheckboxGroup'].map(name=>[name,name]));
  if(id.endsWith('/api'))return services;
  if(id.endsWith('/date-range'))return dateRange;
  if(id.endsWith('/generated/checkin-share'))return {checkinShareRequest};
  if(id.endsWith('/useCheckinShare'))return {useCheckinShare:()=>({openShare:async()=>{},shareCard:null,content:null,getShareCard:()=>null})};
  if(id.endsWith('/share-poster'))return {renderSharePoster:async()=>'/tmp/poster-preview.png'};
  if(id.endsWith('/audio'))return {useAudio:()=>audio};
  if(id.endsWith('/visible-pages'))return {refreshVisiblePages};
  if(id.endsWith('/family-context'))return {selectFamilyContext,reconcileFamilyChild};
  if(id.endsWith('/family-invite-status'))return {familyInviteStatus};
  if(id.endsWith('/study-flow'))return studyFlow;
  if(id.endsWith('/study-session'))return {StudySessionController:options.studyController};
  if(id.endsWith('/ai-settings'))return aiHelpers;
  if(id.endsWith('/vocabulary-draft'))return vocabularyDraft;
  if(id.endsWith('/parents'))return parents;
  if(id.endsWith('/invite-login'))return inviteLogin;
  if(id.endsWith('/privacy-authorization'))return {PRIVACY_AGREE_BUTTON:'agree',exposePrivacyAuthorization(){},finishPrivacyAuthorization(){}};
  if(id.endsWith('/files'))return {extractFile:options.extract??(async()=>{throw Error('No import fixture');}),isFileCancel:(e:any)=>/cancel/i.test(typeof e==='string'?e:e?.errMsg??e?.message??''),shareCsv:async()=>{}};
  return Object.fromEntries(componentNames.map(name=>[name,name]));
 }});
 const all=(node:any):any[]=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(all):[node,...all(node.props?.children)];
 const text=(node:any):string=>node==null||typeof node==='boolean'?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?text(node.props?.children):String(node);
 const render=()=>{cursor=0;loads.length=0;shows.length=0;hides.length=0;const tree=(component?module.exports[component]:module.exports.default)(options.props??{});while(effects.length)effects.shift()!();return tree;};
 const show=async()=>{render();if(!loaded){loaded=true;loads.slice().forEach(fn=>fn(options.query??{}));}shows.slice().forEach(fn=>fn());await tick();return render();};
 const hide=()=>{render();hides.slice().forEach(fn=>fn());};
 const button=(label:string)=>{const node=all(render()).find(node=>node.type==='Button'&&text(node).includes(label));assert(node,`missing button ${label}`);return node.props;};
 render();return {render,show,hide,text,all,button,cache,requests,calls,routes,downloads,deleted,get backCount(){return backCount;},poll:async()=>{for(const callback of [...timers.values()])callback();await tick();return render();},runTimeouts:async()=>{const pending=[...timeouts.values()];timeouts.clear();for(const callback of pending)callback();await tick();return render();},dispose:()=>slots.forEach(slot=>slot?.cleanup?.())};
}

