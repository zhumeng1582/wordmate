import * as homeContent from '../src/services/home-content.ts';
import * as sentenceLearning from '../src/services/sentence-learning.ts';
import * as checkinBackgrounds from '../src/services/checkin-backgrounds.ts';
import * as hanziSpeech from '../src/services/hanzi-speech.ts';
import * as hanziStudyFlow from '../src/services/hanzi-study-flow.ts';
import * as unifiedSearch from '../src/services/unified-search.ts';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {refreshVisiblePages} from '../src/services/visible-pages.ts';
import {selectFamilyContext,selectChildContext,reconcileFamilyChild,forgetChildContext} from '../src/services/family-context.ts';
import {familyInviteStatus} from '../src/services/family-invite-status.ts';
import * as libraryStatus from '../src/services/library-status.ts';
import * as libraryNavigation from '../src/services/library-navigation.ts';
import * as studyFlow from '../src/services/study-flow.ts';
import * as aiHelpers from '../src/services/ai-settings.ts';
import * as parents from '../src/services/parents.ts';
import * as inviteLogin from '../src/services/invite-login.ts';
import * as vocabularyDraft from '../src/services/vocabulary-draft.ts';
import * as dateRange from '../src/services/date-range.ts';
import * as poemImport from '../src/services/poem-import.ts';
import * as homeSections from '../src/services/home-sections.ts';
import {checkinShareRequest} from '../src/generated/checkin-share.ts';
const require=createRequire(import.meta.url),ts=require('typescript');
export const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
export const deferred=()=>{let resolve!:(value?:any)=>void;const promise=new Promise<any>(done=>resolve=done);return {promise,resolve};};
export function pageHarness(file:string,read:(path:string,method:string,body:any)=>Promise<any>,component?:string,options:{cache?:Record<string,any>;query?:Record<string,string>;login?:(identity:string)=>Promise<any>;openLogin?:(identity:string,flow?:string)=>Promise<any>;audio?:{play?:(target:any)=>Promise<void>;stop?:()=>void;autoPlay?:boolean};extract?:(...args:any[])=>Promise<any>;confirm?:boolean;actionIndex?:number;actionIndexes?:number[];actionChoices?:string[];actionSheetError?:string;actionSheet?:(items:string[])=>Promise<{tapIndex:number}>;props?:any;download?:(args:any)=>Promise<any>;studyController?:any;recorder?:any;poemSpeech?:any}={}){
 const cache=new Map<string,any>(Object.entries({access_token:'account-a',family_id:'family-a',child_id:'child-a','current_wordbook:child-a':'book-a',...options.cache})),slots:any[]=[],effects:(()=>void)[]=[],shows:(()=>void)[]=[],hides:(()=>void)[]=[],requests:string[]=[],actionSheets:string[][]=[],actionChoices=[...(options.actionChoices??[])],calls:{path:string;method:string;body:any;key?:string}[]=[],routes:string[]=[],downloads:any[]=[],deleted:string[]=[],modals:any[]=[];
 const bottoms:(()=>void)[]=[],pulls:(()=>void)[]=[];let refreshStops=0;
 const loads:((query:Record<string,string>)=>void)[]=[],timers=new Map<number,()=>void>(),timeouts=new Map<number,()=>void>();let timerId=0,loaded=false,cursor=0,requestId=0,backCount=0;
 const hooks={
  useState:(initial:any)=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],(value:any)=>slots[i]=typeof value==='function'?value(slots[i]):value];},
  useRef:(initial:any)=>{const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
  useMemo:(compute:()=>any,deps:any[])=>{const i=cursor++,old=slots[i];if(!old||deps.some((value,index)=>value!==old.deps[index]))slots[i]={deps,value:compute()};return slots[i].value;},
  useEffect:(effect:()=>any,deps?:any[])=>{const i=cursor++,old=slots[i];if(!old||!deps||deps.some((value,index)=>value!==old.deps?.[index])){slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=effect();});}}
 };
 const storage={get:(key:string)=>cache.get(key)??'',set:(key:string,value:any)=>cache.set(key,value),keys:()=>[...cache.keys()],remove:(key:string)=>{cache.delete(key);}};
 const api=async(path:string,method='GET',body?:any,key?:string)=>{requests.push(path);calls.push({path,method,body,key});return read(path,method,body);};
 const taro={env:{USER_DATA_PATH:'/tmp'},useLoad:(fn:(query:Record<string,string>)=>void)=>loads.push(fn),useDidShow:(fn:()=>void)=>shows.push(fn),useDidHide:(fn:()=>void)=>hides.push(fn),useReachBottom:(fn:()=>void)=>bottoms.push(fn),usePullDownRefresh:(fn:()=>void)=>pulls.push(fn),stopPullDownRefresh:async()=>{refreshStops++;},useRouter:()=>({params:{bookId:'book-a',...options.query}}),canIUse:()=>false,useShareAppMessage:()=>{},navigateTo:async({url}:{url:string})=>{routes.push(url);},redirectTo:async({url}:{url:string})=>{routes.push(url);},showModal:async(args:any)=>{modals.push(args);return {confirm:options.confirm!==false};},showActionSheet:async({itemList}:{itemList:string[]})=>{actionSheets.push(itemList);if(options.actionSheet)return options.actionSheet(itemList);if(options.actionSheetError)throw {errMsg:options.actionSheetError};if(itemList.length>6)throw {errMsg:'showActionSheet:fail itemList exceeds limit'};const label=actionChoices.shift();if(label!==undefined){assert(itemList.includes(label),`missing action ${label} in ${itemList}`);return {tapIndex:itemList.indexOf(label)};}return {tapIndex:options.actionIndexes?.shift()??options.actionIndex??0};},compressImage:async({src}:{src:string})=>({tempFilePath:src}),getImageInfo:async()=>({type:'png',width:941,height:1672}),downloadFile:async(args:any)=>{downloads.push(args);return options.download?options.download(args):{statusCode:200,tempFilePath:'/tmp/avatar-test.png'};},setInnerAudioOption:async()=>{},createInnerAudioContext:()=>({src:'',play:()=>{},pause:()=>{},stop:()=>{},destroy:()=>{},onEnded:()=>{},onError:()=>{}}),getFileSystemManager:()=>({writeFileSync:()=>{},unlink:({filePath}:any)=>deleted.push(filePath),readFile:({success}:any)=>success({data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5xkAAAAASUVORK5CYII='})}),navigateBack:async()=>{backCount++;},reLaunch:async({url}:{url:string})=>{routes.push(url);},showToast:()=>{},authorize:async()=>{},nextTick:(fn:()=>void)=>fn(),pageScrollTo:async()=>{},removeStorageSync:(key:string)=>cache.delete(key)};
 Object.assign(taro,{getSystemInfoSync:()=>({windowWidth:375}),createCanvasContext:()=>new Proxy({},{get:()=>()=>{}})});
 const audio={accent:'en-GB',stop:()=>{},prefetch:()=>{},play:async()=>{},active:'',error:'',status:'',...options.audio};
 const services={api,storage,login:options.login??(async()=>{throw Error('No login fixture');}),eventId:()=> `request-${++requestId}`,message:(e:any)=>e.message,go:(page:string)=>routes.push(libraryNavigation.libraryPageRoute(page)),openLogin:options.openLogin??(async()=>{})};
 const componentNames=['SentenceHomeCard','SentenceImport','Icon','LibraryFilter','ChatSuggestions','TutorArticle','BookManagement','BookSharing','LearningGoal','AudioPreferences','DateRangeCalendar','DateRangeGrid','CheckinStatus','HanziCheckin','CheckinSharePreview','ReviewSession','TutorFloat','WordFeedback','AudioIcon','AudioText','AudioFeedback','FavoriteButton','ParentAvatar','ParentProfileEditor','Chevron','HanziStrokes'];
 let selectionModule:any;
 const loadSelectable=()=>{
  if(selectionModule)return selectionModule;
  const nested={exports:{}};
  const source=ts.transpileModule(readFileSync('apps/miniapp/src/components/SelectableText.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(source,{module:nested,exports:nested.exports,require:(name:string)=>name==='react'?hooks:name==='react/jsx-runtime'?{jsx:(type:any,props:any)=>({type,props}),jsxs:(type:any,props:any)=>({type,props})}:name==='@tarojs/components'?{Text:'Text'}:{}});
  selectionModule=nested.exports;return selectionModule;
 };
 const module={exports:{} as any},code=ts.transpileModule(readFileSync(`apps/miniapp/src/${file}.tsx`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,DEV_AUTH:false,API_BASE:'https://test.invalid/api',setInterval:(fn:()=>void)=>{timers.set(++timerId,fn);return timerId;},clearInterval:(id:number)=>timers.delete(id),setTimeout:(fn:()=>void)=>{timeouts.set(++timerId,fn);return timerId;},clearTimeout:(id:number)=>timeouts.delete(id),require:(id:string)=>{
  if(id.endsWith('/SelectableText'))return loadSelectable();
  if(id.endsWith('/content-marks')){const nested={exports:{}};const source=ts.transpileModule(readFileSync('apps/miniapp/src/services/content-marks.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;vm.runInNewContext(source,{module:nested,exports:nested.exports,require:(name:string)=>name==='@tarojs/taro'?taro:services});return nested.exports;}
  if(id.endsWith('/home-content'))return homeContent;
  if(id==='react')return hooks;
  if(id==='react/jsx-runtime')return {jsx:(type:any,props:any,key:any)=>typeof type==='function'&&['LibraryCard','LearningCard','LibraryHeader','LibraryOverview','LibraryItemSummary','ListLoadState','ContentActions','HomeContentPlaceholder','SelectableText'].includes(type.name)?type(props):({type,props,key}),jsxs:(type:any,props:any,key:any)=>typeof type==='function'&&['LibraryCard','LearningCard','LibraryHeader','LibraryOverview','LibraryItemSummary','ListLoadState','ContentActions','HomeContentPlaceholder','SelectableText'].includes(type.name)?type(props):({type,props,key}),Fragment:'Fragment'};
  if(id==='@tarojs/taro')return taro;
  if(id==='@tarojs/components')return Object.fromEntries(['View','Button','Text','Picker','Input','Textarea','ScrollView','Switch','Canvas','Image','Form','Checkbox','CheckboxGroup'].map(name=>[name,name]));
  if(id.endsWith('/HomeContentPlaceholder')||id.endsWith('/ContentActions')||id.endsWith('/LibraryHeader')||id.endsWith('/LibraryItemSummary')||id.endsWith('/ListLoadState')){
   const child={exports:{}},source=ts.transpileModule(readFileSync('apps/miniapp/src/components/'+(id.endsWith('/HomeContentPlaceholder')?'HomeContentPlaceholder':id.endsWith('/ContentActions')?'ContentActions':id.endsWith('/LibraryHeader')?'LibraryHeader':id.endsWith('/ListLoadState')?'ListLoadState':'LibraryItemSummary')+'.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
   vm.runInNewContext(source,{module:child,exports:child.exports,require:(name:string)=>name==='react'?hooks:name==='@tarojs/taro'?taro:name.endsWith('/api')?services:name.endsWith('/home-content')?homeContent:name.endsWith('/SelectableText')?loadSelectable():name==='react/jsx-runtime'?{jsx:(type:any,props:any)=>typeof type==='function'&&type.name==='SelectableText'?type(props):({type,props}),jsxs:(type:any,props:any)=>typeof type==='function'&&type.name==='SelectableText'?type(props):({type,props})}:name==='@tarojs/components'?{View:'View',Text:'Text',Button:'Button',Picker:'Picker'}:{Icon:'Icon',Chevron:'Chevron',AudioIcon:'AudioIcon'}});return child.exports;
  }
  if(id.endsWith('/word-collection-export')){const nested={exports:{}};const source=ts.transpileModule(readFileSync('apps/miniapp/src/services/word-collection-export.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(source,{module:nested,exports:nested.exports,require:(name:string)=>name==='./api'?services:{shareWordPdf:async(base64:string)=>{downloads.push({wordPdf:base64});}}});return nested.exports;}
  if(id.endsWith('/use-list-pagination')){const nested={exports:{}};const source=ts.transpileModule(readFileSync('apps/miniapp/src/services/use-list-pagination.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;vm.runInNewContext(source,{module:nested,exports:nested.exports,require:(name:string)=>name==='react'?hooks:taro});return nested.exports;}
  if(id.endsWith('/api'))return services;
  if(id.endsWith('/unified-search'))return unifiedSearch;
  if(id.endsWith('/date-range'))return dateRange;
  if(id.endsWith('/library-checkin'))return {waitForLibraryViews:async()=>{},recordLibraryView:(kind:string,item_id:string)=>{const path=`/children/${storage.get('child_id')}/library-checkins`;requests.push(path);calls.push({path,method:'POST',body:{kind,item_id}});}};
  if(id.endsWith('/poem-import'))return poemImport;
  if(id.endsWith('/generated/checkin-share'))return {checkinShareRequest};
  if(id.endsWith('/usePoemSpeech'))return {usePoemSpeech:()=>options.poemSpeech??({play:async()=>{},stop:()=>{},active:'',status:'',error:''})};
  if(id.endsWith('/useCheckinShare'))return {useCheckinShare:()=>({openShare:async()=>{},shareCard:null,content:null,getShareCard:()=>null})};
  if(id.endsWith('/checkin-backgrounds'))return checkinBackgrounds;
  if(id.endsWith('/share-poster'))return {renderSharePoster:async()=>'/tmp/poster-preview.png',POSTER_WIDTH:1800,POSTER_HEIGHT:2400};
  if(id.endsWith('/audio'))return {useAudio:()=>audio};
  if(id.endsWith('/visible-pages'))return {refreshVisiblePages};
  if(id.endsWith('/family-context'))return {selectFamilyContext,selectChildContext,reconcileFamilyChild,forgetChildContext};
  if(id.endsWith('/home-sections'))return homeSections;
  if(id.endsWith('/family-invite-status'))return {familyInviteStatus};
  if(id.endsWith('/tutor-recorder'))return {tutorRecorder:()=>options.recorder,subscribeTutorRecorder:(stop:any,fail:any)=>{if(options.recorder){options.recorder.onStop=stop;options.recorder.onError=fail;}return()=>{};}};
  if(id.endsWith('/hanzi-speech'))return hanziSpeech;
  if(id.endsWith('/hanzi-study-flow'))return hanziStudyFlow;
  if(id.endsWith('/sentence-learning'))return sentenceLearning;
  if(id.endsWith('/study-flow'))return studyFlow;
  if(id.endsWith('/library-navigation'))return libraryNavigation;
  if(id.endsWith('/library-status'))return libraryStatus;
  if(id.endsWith('/study-session'))return {StudySessionController:options.studyController};
  if(id.endsWith('/ai-settings'))return aiHelpers;
  if(id.endsWith('/vocabulary-draft'))return vocabularyDraft;
  if(id.endsWith('/parents'))return parents;
  if(id.endsWith('/invite-login'))return inviteLogin;
  if(id.endsWith('/privacy-authorization'))return {PRIVACY_AGREE_BUTTON:'agree',exposePrivacyAuthorization(){},finishPrivacyAuthorization(){}};
  if(id.endsWith('/files'))return {selectImportMaterial:options.extract??(async()=>{throw Error('No import fixture');}),extractFile:options.extract??(async()=>{throw Error('No import fixture');}),isFileCancel:(e:any)=>/cancel/i.test(typeof e==='string'?e:e?.errMsg??e?.message??''),shareWordPdf:async()=>{},clearWordPdf:()=>{},shareCopybook:async()=>{},clearCopybook:()=>{}};
  return Object.fromEntries(componentNames.map(name=>[name,name]));
 }});
 const all=(node:any):any[]=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(all):[node,...all(node.props?.children)];
 const text=(node:any):string=>node==null||typeof node==='boolean'?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?text(node.props?.children):String(node);
 const render=()=>{cursor=0;loads.length=0;shows.length=0;hides.length=0;bottoms.length=0;pulls.length=0;const tree=(component?module.exports[component]:module.exports.default)(options.props??{});while(effects.length)effects.shift()!();return tree;};
 const show=async()=>{render();if(!loaded){loaded=true;loads.slice().forEach(fn=>fn(options.query??{}));}shows.slice().forEach(fn=>fn());await tick();return render();};
 const hide=()=>{render();hides.slice().forEach(fn=>fn());};
 const button=(label:string)=>{const node=all(render()).find(node=>node.type==='Button'&&(text(node).includes(label)||node.props['aria-label']===label));assert(node,`missing button ${label}`);return node.props;};
 render();return {render,show,hide,text,all,button,cache,requests,calls,routes,downloads,deleted,modals,actionSheets,actionChoices,get backCount(){return backCount;},get refreshStops(){return refreshStops;},reachBottom:async()=>{render();bottoms.slice().forEach(fn=>fn());await tick();return render();},pullDown:async()=>{render();pulls.slice().forEach(fn=>fn());await tick();return render();},poll:async()=>{for(const callback of [...timers.values()])callback();await tick();return render();},runTimeouts:async()=>{const pending=[...timeouts.values()];timeouts.clear();for(const callback of pending)callback();await tick();return render();},dispose:()=>slots.forEach(slot=>slot?.cleanup?.())};
}


export async function selectLibraryMenu(page:ReturnType<typeof pageHarness>,...choices:string[]){const buttons=page.all(page.render()).filter(n=>n.type==='Button'),find=(prefix:string)=>buttons.find(n=>String(n.props['aria-label']||'').startsWith(prefix));if(choices[1]?.startsWith('筛选：')){find('筛选')!.props.onClick();const panel=page.all(page.render()).find(n=>n.type==='LibraryFilter');assert(panel,'missing multiselect filter');const labels:Record<string,string>={'全部':'all','未学':'unlearned','未学过':'unlearned','已学':'learned','已学过':'learned','学习中':'learned','已归档':'archived','已掌握':'archived'};panel.props.onChange(labels[choices[2]]??choices[2]);panel.props.onClose();}else if(choices[1]?.startsWith('搜索')){find('搜索')!.props.onClick();}else{const name=find('更多')!.props['aria-label'].includes('汉字')?'汉字':find('更多')!.props['aria-label'].includes('古诗')?'古诗':'单词';if(choices[0]==='添加与搜索'||choices[1]==='选择导出')choices[0]=name+'管理';page.actionChoices.push(choices[1]);find('更多')!.props.onClick();}await tick();}

export async function selectPoemAction(page:ReturnType<typeof pageHarness>,title:string){if(!/编辑|删除/.test(title)){page.button('标记诗词').onClick();await tick();}page.button(title).onClick();await tick();}

export async function selectHanziAction(page:ReturnType<typeof pageHarness>,title:string){if(!/编辑|删除/.test(title)){page.button('标记汉字').onClick();await tick();}page.button(title).onClick();await tick();}
