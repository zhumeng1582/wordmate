import {useEffect,useRef,useState} from 'react';
import Taro,{useDidHide,useDidShow,useRouter} from '@tarojs/taro';
import {View,Textarea,Button,Text,Picker} from '@tarojs/components';
import {Chevron} from '../../components/Chevron';
import {api,eventId,message,storage} from '../../services/api';
import {selectImportMaterial,isFileCancel} from '../../services/files';
import '../add-words/index.css';
import './index.css';
type Mode='text'|'image'|'file';
type Draft={format:1;raw:string;bookId:string;mode:Mode;excluded:string[];aiCandidates:string[]|null;aiWarning:string};
const scope=()=>`${storage.get('access_token')}:${storage.get('child_id')}`;
const draftKey=(key:string)=>`hanzi_add_draft:${key}`,pendingKey=(key:string,job:string)=>`hanzi_add_pending:${key}:${job}`;
const empty=():Draft=>({format:1,raw:'',bookId:'',mode:'text',excluded:[],aiCandidates:null,aiWarning:''});
export default function HanziImport({embedded=false,onBusyChange,jobId=''}:{embedded?:boolean;onBusyChange?:(busy:boolean)=>void;jobId?:string}={}){
 const router=useRouter(),job=String(jobId||router.params.job||''),[form,setForm]=useState<Draft>(()=>!job&&storage.get(draftKey(scope()))?.format===1?storage.get(draftKey(scope())):empty()),[formScope,setFormScope]=useState(scope()),[books,setBooks]=useState<any[]>([]),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(''),[jobStatus,setJobStatus]=useState(job?'loading':'manual'),[pending,setPending]=useState<any>(()=>storage.get(pendingKey(scope(),job))||null);
 const serial=useRef(0),currentOwner=useRef(scope()),formRef=useRef(form),upload=useRef<{signature:string;id:string}|null>(null),aiPending=useRef<{text:string;id:string}|null>(null),jobLoaded=useRef(false);formRef.current=form;
 const valid=(n:number,key:string)=>n===serial.current&&key===scope(),update=(patch:Partial<Draft>)=>setForm(old=>({...old,...patch}));
 useEffect(()=>{if(!job&&formScope===scope())try{storage.set(draftKey(formScope),form);}catch{setError('草稿暂时无法保存在本机，请勿离开页面。');}},[form,formScope]);
 const load=async()=>{
  const key=scope(),n=++serial.current,child=String(storage.get('child_id')||'');if(!child){setError('请先选择孩子。');return;}setBusy(true);
  if(currentOwner.current!==key){currentOwner.current=key;jobLoaded.current=false;setFormScope(key);const saved=storage.get(draftKey(key));formRef.current=!job&&saved?.format===1?saved:empty();setForm(formRef.current);setBooks([]);setLoaded(false);setPending(storage.get(pendingKey(key,job))||null);setJobStatus(job?'loading':'manual');setResult('');setError('');aiPending.current=null;upload.current=null;}
  try{
   const data=await api(`/children/${child}/hanzi-books`);if(!valid(n,key))return;const available=data.items.filter((b:any)=>!b.read_only);setBooks(available);
   const recorded=job?storage.get(`hanzi_job_book:${key}:${job}`):'',submitted=storage.get(pendingKey(key,job)),saved=submitted?.body?.book_id||recorded||storage.get(`current_hanzi_book:${child}`),book=available.find((b:any)=>b.id===saved)??available.find((b:any)=>b.id===formRef.current.bookId)??available[0];
   update({bookId:book?.id??''});setLoaded(true);setError('');
   if(book){storage.set(`current_hanzi_book:${child}`,book.id);storage.set(`current_hanzi_book_name:${child}`,book.name);}
   if(job&&!jobLoaded.current){const r=await api(`/children/${child}/hanzi/imports/${encodeURIComponent(job)}`);if(!valid(n,key))return;if(r.book_id){const target=available.find((b:any)=>b.id===r.book_id);if(!target)throw Error('原字本已移除或不可编辑，请返回录入记录。');update({bookId:r.book_id});storage.set(`current_hanzi_book:${child}`,r.book_id);storage.set(`current_hanzi_book_name:${child}`,target.name);}update({raw:String(r.raw_text||'')});setJobStatus(r.status);if(r.status==='saved')setResult('该任务已完成，汉字已录入。');else if(r.status!=='ready')setError('该任务已不可核对，请返回录入记录查看。');jobLoaded.current=true;}
  }catch(e){if(valid(n,key))setError(message(e));}finally{if(valid(n,key))setBusy(false);}
 };
 useDidShow(()=>{void load();});useDidHide(()=>{serial.current++;setBusy(false);});
 useEffect(()=>{if(embedded)void load();},[]);
 useEffect(()=>{onBusyChange?.(busy);return()=>onBusyChange?.(false);},[busy]);
 const all=form.aiCandidates??[...new Set(Array.from(form.raw).filter(c=>/^\p{Script=Han}$/u.test(c)))],unique=all.filter(c=>!form.excluded.includes(c)),locked=busy||!!pending;
 const chooseBook=(id:string)=>{const book=books.find(b=>b.id===id);if(!book)return;update({bookId:id});storage.set(`current_hanzi_book:${storage.get('child_id')}`,id);storage.set(`current_hanzi_book_name:${storage.get('child_id')}`,book.name);};
 const analyze=async()=>{
  if(locked)return;const input=form.raw.trim();if(!input){setError('请先输入或读取材料。');return;}if(input.length>6000){setError('AI 每次最多整理 6000 字，请将材料分段整理；也可以直接从全部候选中筛选。');return;}
  const key=scope(),choice=await Taro.showModal({title:'AI 提取生字',content:'将材料文字发送给当前文字 AI，使用家庭额度或个人 AI 服务。AI 可能遗漏或识别错误，请核对；整理时请保持页面打开。',confirmText:'开始整理'});if(!choice.confirm||key!==scope())return;
  const n=++serial.current;if(!aiPending.current||aiPending.current.text!==input)aiPending.current={text:input,id:eventId()};setBusy(true);setError('');
  try{const r=await api(`/children/${storage.get('child_id')}/hanzi/analyze`,'POST',{request_id:aiPending.current.id,text:input},undefined,120000);if(valid(n,key)){update({aiCandidates:r.characters,excluded:[],aiWarning:r.incomplete?'AI 提示材料中可能有遗漏，请查看原文核对。':'AI 结果可能有遗漏，请查看原文核对。'});aiPending.current=null;}}
  catch(e:any){if(valid(n,key)){if(e?.status&&e.status<500&&e.message!=='TUTOR_GENERATING')aiPending.current=null;setError(`${message(e)}；如结果不确定，可重新点击继续。`);}}finally{if(valid(n,key))setBusy(false);}
 };
 const save=async()=>{
  if(busy)return;if(!pending&&(!form.bookId||!unique.length||unique.length>300)){setError(!form.bookId?'请选择可编辑的汉字本。':unique.length>300?'每次最多录入 300 个不同的汉字，请分批保存。':'请粘贴需要录入的汉字。');return;}
  const key=scope(),n=++serial.current,request=pending||{id:eventId(),body:{characters:unique,book_id:form.bookId,...(job?{job_id:job}:{})}};
  try{storage.set(pendingKey(key,job),request);}catch{setError('无法保存待确认操作，请释放本机存储后重试。');return;}setPending(request);setBusy(true);setError('');
  try{const r=await api(`/children/${storage.get('child_id')}/hanzi/batch`,'POST',request.body,request.id);if(valid(n,key)){Taro.removeStorageSync(pendingKey(key,job));setPending(null);if(job)setJobStatus('saved');setResult(`已录入 ${r.added} 字，已有字加入本字本 ${r.linked||0} 字，跳过 ${r.skipped} 字。`);update({raw:'',excluded:[],aiCandidates:null,aiWarning:''});}}
  catch(e:any){if(valid(n,key)){if(e?.status>=400&&e.status<500){Taro.removeStorageSync(pendingKey(key,job));setPending(null);}setError(message(e));}}finally{if(valid(n,key))setBusy(false);}
 };
 const importFile=async(kind:'camera'|'album'|'file')=>{
  if(locked||!form.bookId)return;const key=scope(),n=++serial.current,child=String(storage.get('child_id')),destination=form.bookId;setBusy(true);setError('');
  try{const choice=await Taro.showModal({title:'读取汉字材料',content:'材料将上传到服务器读取，图片和 PDF 图片页会发送给图片 AI 并使用相应额度。上传完成后可离开，读取结果需要逐字核对。',confirmText:'继续'});if(!choice.confirm||!valid(n,key))return;
   const material=await selectImportMaterial(kind,()=>{},'hanzi');if(!valid(n,key))return;const signature=JSON.stringify([key,material.name,material.data,destination]);if(upload.current?.signature!==signature)upload.current={signature,id:eventId()};
   storage.set(`hanzi_job_book:${key}:${upload.current!.id}`,destination);await api(`/children/${child}/hanzi/imports`,'POST',{id:upload.current!.id,name:material.name,base64:material.data,book_id:destination},undefined,120000);if(valid(n,key)){upload.current=null;await Taro.navigateTo({url:'/pages/import-records/index'});}
  }catch(e){if(valid(n,key)&&!isFileCancel(e))setError(`${message(e)}；如上传结果不确定，请先查看录入记录。`);}finally{if(valid(n,key))setBusy(false);}
 };
 return <View className='page add-words-page'><View className='add-topline'><Text className='add-eyebrow'>把学习材料变成汉字本</Text><Button className='add-text-button' onClick={()=>void Taro.navigateTo({url:'/pages/import-records/index'})}>录入记录<Chevron/></Button></View><View className='title'>{job?'核对读取结果':'录入汉字'}</View>{error&&<View className='error'>{error}{!loaded&&<Button className='text-action' onClick={()=>void load()}>重新加载</Button>}</View>}{result&&<View className='notice'>{result}</View>}{!loaded?<View className='card muted'>正在准备录入汉字…</View>:!books.length?<View className='card add-empty'><View className='add-section-title'>先准备一个可编辑的汉字本</View><View className='muted'>共享字本为只读，请新建字本后录入。</View><Button className='btn primary' onClick={()=>void Taro.navigateTo({url:'/pages/hanzi-book-edit/index'})}>创建我的汉字本</Button></View>:<>
  {!job&&<View className='add-material-tabs'>{([['text','输入文字'],['image','拍照 / 图片'],['file','导入文件']] as const).map(([mode,label])=><Button key={mode} className={`add-material-tab ${form.mode===mode?'is-selected':''}`} disabled={locked} onClick={()=>update({mode})}>{label}</Button>)}</View>}
  <View className='card hanzi-import-form add-composer'>
   {!job&&form.mode==='image'&&<View className='add-import-panel'><View className='add-section-title'>拍下课本上的汉字</View><View className='add-image-actions'><Button className='btn primary' disabled={locked} onClick={()=>void importFile('camera')}>拍照识别</Button><Button className='btn secondary' disabled={locked} onClick={()=>void importFile('album')}>从相册选择</Button></View><View className='muted small'>识别完成后在录入记录中核对，不会自动录入。</View></View>}
   {!job&&form.mode==='file'&&<View className='add-import-panel'><Button className='btn secondary' disabled={locked} onClick={()=>void importFile('file')}>从微信聊天选择文件</Button><View className='muted small'>支持 PDF、TXT、Markdown、CSV、TSV、Excel 和 Word；读取后逐字核对。</View></View>}
   {(job||form.mode==='text'||!!form.raw)&&<><View>{job?'核对读取结果':'放入要学的汉字'}</View><View className='muted small'>标点和空格会忽略，每次最多录入 300 个不同的字，不会覆盖已有资料和学习状态。</View><Textarea className='field hanzi-import-text' value={form.raw} maxlength={1000000} disabled={locked||!!job&&jobStatus!=='ready'} placeholder='例如：春 夏 秋 冬' onInput={e=>{update({raw:e.detail.value,excluded:[],aiCandidates:null,aiWarning:''});setResult('');}}/><View className='hanzi-import-tools'><Button className='text-action' disabled={locked||!!job&&jobStatus!=='ready'||!form.raw.trim()} onClick={()=>void analyze()}>AI 提取生字</Button>{form.aiCandidates!==null&&<Button className='text-action' disabled={locked} onClick={()=>update({aiCandidates:null,aiWarning:'',excluded:[]})}>查看全部候选</Button>}{!job&&<Button className='text-action' disabled={locked} onClick={()=>void Taro.navigateTo({url:'/pages/hanzi-detail/index?new=1'})}>逐字录入资料</Button>}</View>{form.aiWarning&&<View className='notice'>{form.aiWarning}</View>}<View className='hanzi-import-preview'>待录入 {unique.length} 字{all.length>500?'（只显示前 500 个，请先在原文中删减）':''}</View><View className='hanzi-import-grid'>{all.slice(0,500).map(c=><Button key={c} disabled={locked} className={`hanzi-candidate ${form.excluded.includes(c)?'is-excluded':''}`} aria-label={`${c}${form.excluded.includes(c)?'，已排除':'，已选择'}`} onClick={()=>update({excluded:form.excluded.includes(c)?form.excluded.filter(x=>x!==c):[...form.excluded,c]})}><Text>{c}</Text></Button>)}</View></>}
   <View className='add-destination'><View><Text className='muted'>存入</Text><View className='add-book-name'>{books.find(b=>b.id===form.bookId)?.name||'请选择汉字本'}</View></View><Picker mode='selector' range={books.map(b=>b.name)} value={Math.max(0,books.findIndex(b=>b.id===form.bookId))} disabled={locked} onChange={e=>chooseBook(books[Number(e.detail.value)]?.id??'')}><View className='add-book-switch'>更换<Chevron direction='down'/></View></Picker></View><Button className='add-text-button' disabled={locked} onClick={()=>void Taro.navigateTo({url:'/pages/hanzi-book-edit/index'})}>新建汉字本</Button>
   {(job||form.mode==='text'||!!form.raw||pending)&&<Button className='btn primary' disabled={busy||!!job&&jobStatus!=='ready'||!pending&&(!unique.length||all.length>500||!form.bookId)} onClick={()=>void save()}>{busy?'正在保存…':pending?'重试上次提交':'核对后保存'}</Button>}
  </View>{!job&&<View className='add-submit-hint'>草稿自动保留，离开后可以接着录入。</View>}
 </>}</View>;
}
