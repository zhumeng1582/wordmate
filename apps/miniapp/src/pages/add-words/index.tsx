import {Chevron} from '../../components/Chevron';
import {useEffect,useRef,useState} from 'react';
import {View,Text,Button,Input,Textarea,Picker} from '@tarojs/components';
import Taro,{useDidShow,useDidHide} from '@tarojs/taro';
import {api,storage,eventId,message,go,openLogin} from '../../services/api';
import {extractFile,isFileCancel} from '../../services/files';
import {aiQuery,aiStatus,aiMoney,type AiSettings} from '../../services/ai-settings';
import {MAX_VOCABULARY_TEXT,vocabularyKeys,emptyVocabularyDraft,readVocabularyDraft,applyMaterial,removePreparedWord,vocabularySubmission,type VocabularyDraft,type VocabularySubmission,type MaterialMode} from '../../services/vocabulary-draft';
import './index.css';

type Owner={token:string;child:string;family:string};
const owner=():Owner=>({token:String(storage.get('access_token')||''),child:String(storage.get('child_id')||''),family:String(storage.get('family_id')||'')});
const sameOwner=(a:Owner,b:Owner)=>a.token===b.token&&a.child===b.child&&a.family===b.family;
function restoredDraft(scope:Owner){
 const keys=vocabularyKeys(scope.token,scope.child),saved=storage.get(keys.draft),pending=storage.get(keys.pending);
 if(saved?.format===1)return readVocabularyDraft(saved);
 if(pending?.body?.raw_text)return readVocabularyDraft({...emptyVocabularyDraft(),raw:pending.body.raw_text,theme:pending.body.theme??'',bookId:pending.body.wordbook_id,prepared:pending.body.prepared_items??null,editing:pending.jobId?{id:pending.jobId,attempts:pending.body.expected_attempts}:null});
 return emptyVocabularyDraft();
}

export default function AddWords(){
 const context=useRef(owner()),alive=useRef(true),shown=useRef(true),serial=useRef(0),reading=useRef(false),inFlight=useRef(false),reloadAfter=useRef(false);
 const keys=vocabularyKeys(context.current.token,context.current.child);
 const [form,setForm]=useState<VocabularyDraft>(()=>restoredDraft(context.current)),formRef=useRef(form);formRef.current=form;
 const [books,setBooks]=useState<any[]>([]),[jobs,setJobs]=useState<any[]>([]),[ai,setAi]=useState<{text:AiSettings|null;vision:AiSettings|null}>({text:null,vision:null}),[loaded,setLoaded]=useState(false),[loading,setLoading]=useState(false);
 const [pending,setPending]=useState<VocabularySubmission|null>(()=>storage.get(keys.pending)||null),pendingRef=useRef(pending);pendingRef.current=pending;
 const [resultId,setResultId]=useState<string>(()=>storage.get(keys.result)||''),[busy,setBusy]=useState<'choose'|'import'|'submit'|'create'|''>(''),[visible,setVisible]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(()=>form.raw?'已恢复上次未提交的内容。':''),[more,setMore]=useState(false),[rawOpen,setRawOpen]=useState(false);
 const isCurrent=(scope:Owner)=>sameOwner(scope,owner())&&sameOwner(scope,context.current);
 const change=(next:VocabularyDraft,scope=context.current)=>{
  if(!isCurrent(scope))return;formRef.current=next;if(alive.current)setForm(next);
  try{storage.set(vocabularyKeys(scope.token,scope.child).draft,next);}catch{if(alive.current)setError('草稿暂时无法保存在本机，请勿离开页面，释放存储空间后重试。');}
 };
 const update=(patch:Partial<VocabularyDraft>)=>change({...formRef.current,...patch});
 const refresh=async(scope=context.current)=>{
  const ticket=++serial.current;reading.current=true;
  try{
   const results=await Promise.allSettled([api(`/children/${scope.child}/wordbooks`),api(`/children/${scope.child}/ai-batches`),api<AiSettings>('/me/ai-settings'+aiQuery('text',scope.family)),api<AiSettings>('/me/ai-settings'+aiQuery('vision',scope.family))]);
   if(!alive.current||!shown.current||ticket!==serial.current||!isCurrent(scope))return false;
   const [bookResponse,jobResponse,textResponse,visionResponse]=results;
   if(bookResponse.status==='rejected')throw bookResponse.reason;if(jobResponse.status==='rejected')throw jobResponse.reason;
   const available=bookResponse.value.items.filter((item:any)=>!item.read_only);setBooks(available);setJobs(jobResponse.value.items);
   setAi(previous=>({text:textResponse.status==='fulfilled'?textResponse.value:previous.text,vision:visionResponse.status==='fulfilled'?visionResponse.value:previous.vision}));
   const current=formRef.current,book=available.find((item:any)=>item.id===current.bookId)??available.find((item:any)=>item.id===storage.get(`current_wordbook:${scope.child}`))??available[0];
   if((book?.id??'')!==current.bookId)change({...current,bookId:book?.id??''},scope);
   setLoaded(true);return true;
  }finally{if(ticket===serial.current)reading.current=false;}
 };
 const syncOwner=()=>{const next=owner();
  if(sameOwner(next,context.current))return false;
  {
   context.current=next;serial.current++;const currentKeys=vocabularyKeys(next.token,next.child),draft=restoredDraft(next);formRef.current=draft;setForm(draft);setBooks([]);setJobs([]);setAi({text:null,vision:null});setLoaded(false);pendingRef.current=storage.get(currentKeys.pending)||null;setPending(pendingRef.current);setResultId(storage.get(currentKeys.result)||'');setError('');setNotice(draft.raw?'已恢复未提交的内容。':'');setMore(false);setRawOpen(false);setLoading(!!next.token&&!!next.child);
  }
  return true;
 };
 const load=async()=>{
  const scope=context.current;if(!scope.token||!scope.child){setLoading(false);return;}if(!loaded)setLoading(true);
  try{
   if(!await refresh(scope))return;
   const currentKeys=vocabularyKeys(scope.token,scope.child),edit=storage.get(currentKeys.edit);
   if(edit&&!pendingRef.current){
    if(formRef.current.raw.trim()&&formRef.current.raw!==edit.raw_text){const answer=await Taro.showModal({title:'替换当前材料？',content:'当前有未提交的内容。继续后会换成需要重新编辑的那一批。',confirmText:'继续编辑'});if(!answer.confirm)return;}
    if(!isCurrent(scope))return;
    change({...emptyVocabularyDraft(),raw:edit.raw_text??'',theme:edit.theme??'',bookId:edit.wordbook_id,editing:{id:edit.id,attempts:edit.attempts}},scope);Taro.removeStorageSync(currentKeys.edit);setResultId('');Taro.removeStorageSync(currentKeys.result);setNotice('正在重新编辑上次未完成的材料。');
   }
  }catch(e){if(isCurrent(scope)&&alive.current)setError(message(e));}finally{if(alive.current){if(isCurrent(scope))setLoading(false);else if(shown.current)syncOwner();}}
 };
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;serial.current++;};},[]);
 useDidShow(()=>{shown.current=true;setVisible(true);syncOwner();if(inFlight.current)reloadAfter.current=true;else void load();});
 useDidHide(()=>{shown.current=false;setVisible(false);serial.current++;reading.current=false;});
 const active=jobs.find(job=>['queued','running'].includes(job.status)),result=jobs.find(job=>job.id===resultId),resultBusy=result&&['queued','running'].includes(result.status);
 useEffect(()=>{if(!visible||!active)return;const timer=setInterval(()=>{if(!inFlight.current&&!reading.current)void refresh().catch(e=>{if(shown.current)setError(message(e));});},2500);return()=>clearInterval(timer);},[visible,active?.id,active?.status]);
 const run=async(stage:typeof busy,action:(scope:Owner)=>Promise<void>)=>{
  if(inFlight.current)return;const scope=context.current;inFlight.current=true;serial.current++;reading.current=false;setBusy(stage);setError('');setNotice('');
  try{await action(scope);}catch(e){if(isCurrent(scope)&&alive.current)setError(message(e));}
  finally{inFlight.current=false;if(alive.current){setBusy('');const changed=syncOwner();if((reloadAfter.current||changed)&&shown.current){reloadAfter.current=false;void load();}}}
 };
 const settingsFor=(mode:MaterialMode)=>mode==='image'?ai.vision:ai.text;
 const importFile=(kind:'camera'|'album'|'file')=>run('choose',async scope=>{
  const settings=settingsFor(kind==='file'?'file':'image');
  if(kind!=='file'&&(!settings||!aiStatus(settings).ready))throw Error('请先在 AI 助手中确认图片识别服务和额度。');
  const snapshot=formRef.current;
  try{const material=await extractFile(scope.child,kind,snapshot.raw,snapshot.theme,()=>{if(alive.current&&isCurrent(scope))setBusy('import');});if(!isCurrent(scope))return;change(applyMaterial(snapshot,material),scope);setRawOpen(false);setNotice(material.source==='image'?'识别完成，检查后即可加入词本。':'文件已读取，检查文字后即可整理。');}
  catch(e){if(!isFileCancel(e))throw e;}
 });
 const submit=async(draft:VocabularySubmission,scope:Owner)=>{
  const currentKeys=vocabularyKeys(scope.token,scope.child);let job:any;
  try{job=await api(draft.jobId?`/ai-batches/${draft.jobId}`:`/children/${scope.child}/ai-batches`,draft.jobId?'PUT':'POST',draft.body,draft.key,60000);}
  catch(e){if(isCurrent(scope)&&(e as any)?.status>=400&&(e as any)?.status<500){Taro.removeStorageSync(currentKeys.pending);pendingRef.current=null;setPending(null);}throw e;}
  if(!isCurrent(scope))return;
  Taro.removeStorageSync(currentKeys.pending);pendingRef.current=null;setPending(null);storage.set(currentKeys.result,job.id);setResultId(job.id);setJobs(old=>[job,...old.filter(item=>item.id!==job.id)]);
  change({...emptyVocabularyDraft(),bookId:draft.body.wordbook_id},scope);setRawOpen(false);setMore(false);setNotice('');
  void refresh(scope).catch(()=>{});
 };
 const start=()=>run('submit',async scope=>{
  if(pendingRef.current){await submit(pendingRef.current,scope);return;}
  if(active)throw Error('上一批仍在整理，请先查看进度。');
  const draft=vocabularySubmission(formRef.current,eventId());storage.set(vocabularyKeys(scope.token,scope.child).pending,draft);pendingRef.current=draft;setPending(draft);await submit(draft,scope);
 });
 const createBook=()=>run('create',async scope=>{const book=await api(`/children/${scope.child}/wordbooks`,'POST',{name:'我的单词本'},eventId());if(!isCurrent(scope))return;change({...formRef.current,bookId:book.id},scope);storage.set(`current_wordbook:${scope.child}`,book.id);await refresh(scope);});
 const continueAdding=()=>{setResultId('');Taro.removeStorageSync(keys.result);setError('');setNotice('');};
 const selectedBook=books.find(item=>item.id===form.bookId),validPrepared=form.prepared?.filter(item=>item.status==='ok').length??0,locked=!!busy||!!pending;
 const textStatus=ai.text?aiStatus(ai.text):null,canGenerate=!!form.prepared||!!textStatus?.ready;
 const setupAi=()=>go(textStatus?.action==='usage'?'ai-usage':'ai-settings');
 const savedCount=result?.saved_count??result?.items?.filter((item:any)=>item.word_id).length??0,resultDone=result?.status==='succeeded',resultPartial=result?.status==='partial';
 const header=<View className='add-topline'><Text className='add-eyebrow'>把学习材料变成单词本</Text><Button className='add-text-button' onClick={()=>go('generation')}>添加记录<Chevron/></Button></View>;
 return <View className='page add-words-page'>
  {header}<View className='title'>添加单词</View><View className='add-intro'>放入材料，自动补全音标、释义和例句。</View>
  {error&&<View className='error add-message'>{error}{!loaded&&<Button className='add-text-button' disabled={!!busy||loading} onClick={()=>void load()}>重新加载</Button>}</View>}
  {!context.current.token?<View className='card add-empty'><View className='add-section-title'>登录后保存学习材料</View><Button className='btn primary' onClick={()=>void openLogin()}>微信登录</Button></View>:!context.current.child?<View className='card add-empty'><View className='add-section-title'>先选择孩子</View><View className='muted'>单词和学习进度会分别保存。</View><Button className='btn primary' onClick={()=>go('family')}>选择孩子</Button></View>:!loaded?<View className='card add-loading'><View className='add-placeholder-line'/><View className='add-placeholder-area'/><View className='muted'>{loading?'正在准备添加单词…':'暂时无法加载，请重试。'}</View></View>:result?<>
   <View className='card add-result'><View className={`add-result-mark ${resultBusy?'is-working':''}`}>{resultDone?'✓':resultBusy?'…':'!'}</View><View className='add-result-title'>{resultDone?`已加入 ${savedCount} 个单词`:resultPartial?`已加入 ${savedCount} 词，部分待处理`:resultBusy?'正在整理单词':'这次还没完成'}</View><View className='muted'>{resultDone?'音标、释义和例句已准备好，可以开始学习了。':resultBusy?'完成后会自动保存，离开页面也会继续。':'已保存的单词会保留，可在添加记录中处理其余内容。'}</View>
    {result.bulk&&<View className='add-import-status'>已完成 {result.bulk.completed_parts} / {result.bulk.total_parts} 批 · 已保存 {savedCount} 词</View>}
    {resultBusy&&<View className='add-job-steps'><View className='is-done'>已提交</View><Chevron/><View className='is-current'>整理中</View><Chevron/><View>加入词本</View></View>}
    {!!result.items?.length&&<View className='add-result-words'>{result.items.slice(0,6).map((item:any)=><Text key={item.ordinal}>{item.input}</Text>)}{result.items.length>6&&<Text>等 {result.items.length} 词</Text>}</View>}
    <View className='add-result-destination'>存入：{books.find(item=>item.id===result.wordbook_id)?.name??'所选单词本'}</View>
    <Button className='btn primary' onClick={()=>{if(resultDone){storage.set('review_source',{source:'new_words'});storage.set('study_intent','start');go('review');}else go(resultBusy?'words':'generation');}}>{resultDone?'开始学习':resultBusy?'先回单词本':'查看并处理'}</Button>{resultDone&&<Button className='add-text-button' onClick={()=>go('words')}>查看单词本</Button>}<Button className='add-text-button add-result-next' onClick={continueAdding}>{resultBusy?'继续准备下一批':'继续添加单词'}</Button>
   </View>
  </>:<>
   {notice&&<View className='add-notice'>{notice}</View>}
   {pending&&<View className='card add-pending'><View className='add-section-title'>上次提交还没确认</View><View className='muted small'>材料已保留。重试会核对同一次提交。</View><Button className='btn primary' disabled={!!busy} onClick={start}>{busy==='submit'?'正在核对…':'重试上次提交'}</Button></View>}
   {active&&!pending&&<View className='add-active'><View>有一批单词正在整理<View className='muted small'>可先准备下一批，完成后再提交</View></View><Button className='add-text-button' onClick={()=>{storage.set(keys.result,active.id);setResultId(active.id);}}>查看进度<Chevron/></Button></View>}
   {!books.length?<View className='card add-empty'><View className='add-section-title'>先准备一个单词本</View><View className='muted'>创建后就能放入学习材料。</View><Button className='btn primary' disabled={!!busy} onClick={createBook}>{busy==='create'?'正在创建…':'创建我的单词本'}</Button></View>:<>
    {form.editing&&<View className='add-editing'><Text>重新编辑未完成的材料</Text><Button className='add-text-button' disabled={locked} onClick={()=>{change({...emptyVocabularyDraft(),bookId:form.bookId});setNotice('已退出编辑，原记录保留。');}}>退出编辑</Button></View>}
    {!form.prepared&&<View className='add-material-tabs'>{([['text','输入文字'],['image','拍照 / 图片'],['file','导入文件']] as const).map(([mode,label])=><Button key={mode} className={`add-material-tab ${form.mode===mode?'is-selected':''}`} disabled={locked} onClick={()=>{update({mode});setError('');}}>{label}</Button>)}</View>}
    <View className='card add-composer'>
     {form.mode==='image'&&!form.prepared&&<View className='add-import-panel'><View className='add-section-title'>拍下课本上的单词</View><View className='muted small'>尽量拍清楚，多页材料可逐页添加。</View>{ai.vision&&!aiStatus(ai.vision).ready&&<View className='add-ai-note'>{aiStatus(ai.vision).detail}<Button className='add-text-button' onClick={()=>go(aiStatus(ai.vision!).action==='usage'?'ai-usage':'ai-settings')}>检查图片识别服务<Chevron/></Button></View>}<View className='add-image-actions'><Button className='btn primary' disabled={locked} onClick={()=>importFile('camera')}>拍照识别</Button><Button className='btn secondary' disabled={locked} onClick={()=>importFile('album')}>从相册选择</Button></View><View className='add-import-hint'>识别会使用 AI 额度，检查结果后再加入词本。<View>请仅上传学习材料，支持 JPG / PNG，最大 4 MB。</View></View></View>}
     {form.mode==='file'&&<View className='add-import-panel'><View className='add-section-title'>{form.raw?'继续导入学习文件':'从文件里导入单词'}</View><View className='muted small'>先将文件发到微信聊天，再从这里选择。</View><Button className='btn secondary' disabled={locked} onClick={()=>importFile('file')}>从微信聊天选择文件</Button><View className='add-import-hint'>支持 TXT、Markdown（MD）、CSV、TSV、Excel（XLSX）、Word（DOCX），最大 4 MB。</View></View>}
     {busy==='import'&&<View className='add-import-status'>{form.mode==='image'?'正在识别并整理图片，请稍候…':'正在读取文件，请稍候…'}</View>}
     {form.prepared?<View className='add-preview'><View className='add-preview-heading'><View className='add-section-title'>检查识别结果</View><Text>{validPrepared} 词可加入</Text></View><View className='muted small'>不需要的词可以直接移除。</View>{form.prepared.map((item,index)=><View className='add-preview-word' key={`${index}:${item.input}`}><View><View className='add-preview-lemma'>{item.lemma??item.input}</View><View className={item.status==='ok'?'muted small':'add-invalid small'}>{item.status==='ok'?item.meaning_zh:item.reason||'暂未识别，可移除后继续'}</View></View><Button className='add-remove' aria-label={`移除 ${item.input}`} disabled={locked} onClick={()=>change(removePreparedWord(formRef.current,index))}>×</Button></View>)}<Button className='add-text-button add-edit-source' disabled={locked} onClick={()=>setRawOpen(value=>!value)}>{rawOpen?'收起原文':'查看 / 修改原文'}<Chevron direction={rawOpen?'up':'down'}/></Button>{rawOpen&&<View className='add-import-hint'>修改原文或主题后，需要重新整理单词。</View>}</View>:null}
     {(form.mode==='text'||!!form.raw)&&(!form.prepared||rawOpen)&&<View className='add-text-input'><View className='add-input-heading'><Text>{form.prepared?'识别原文':form.mode==='text'?'放入要学的单词':'检查学习内容'}</Text>{!form.raw&&form.mode==='text'&&<Button className='add-text-button' disabled={locked} onClick={()=>update({raw:'apple\nbanana\nread a book',prepared:null})}>试试示例</Button>}</View><Textarea className='field add-material-input' placeholder={'apple\nbanana\nread a book\n\n也支持编号、中文释义和表格'} maxlength={MAX_VOCABULARY_TEXT} disabled={locked} value={form.raw} onInput={event=>update({raw:event.detail.value,prepared:event.detail.value===formRef.current.raw?formRef.current.prepared:null})}/><View className='add-input-meta'><Text>最多 8000 词 · 已输入 {form.raw.length} 字符</Text>{!!form.raw&&<Button className='add-text-button' disabled={locked} onClick={()=>update({raw:'',prepared:null})}>清空</Button>}</View></View>}
     <View className='add-destination'><View><Text className='muted'>存入</Text><View className='add-book-name'>{selectedBook?.name??'请选择单词本'}</View></View>{books.length>1&&<Picker mode='selector' range={books.map(item=>item.name)} value={Math.max(0,books.findIndex(item=>item.id===form.bookId))} disabled={locked} onChange={event=>{const book=books[Number(event.detail.value)];if(book){update({bookId:book.id});storage.set(`current_wordbook:${context.current.child}`,book.id);}}}><View className='add-book-switch'>更换<Chevron direction='down'/></View></Picker>}</View>
     <Button className='add-text-button add-more-trigger' disabled={locked} onClick={()=>setMore(value=>!value)}>{more?'收起选填设置':'主题与费用说明'}<Chevron direction={more?'up':'down'}/></Button>
     {more&&<View className='add-more'><View className='add-field-label'>例句主题（选填）</View><Input className='field' value={form.theme} maxlength={80} disabled={locked} placeholder='如：校园生活、机场出行' onInput={event=>update({theme:event.detail.value,prepared:event.detail.value===formRef.current.theme?formRef.current.prepared:null})}/><View className='muted small'>不填写也可以，系统会自动选择合适例句。</View><View className='add-pricing'>{ai.text?.mode==='byok'?'文字整理费用由你的个人 AI 账号承担。':`文字整理使用家庭额度${ai.text?`，当前可用 ${aiMoney(ai.text.available_micros)}`:''}。`}{ai.vision?.mode==='byok'?'图片识别费用由你的个人 AI 账号承担。':'图片识别使用家庭额度。'}<View>生成前预留费用，完成后按实际使用结算。已识别的图片词条直接确认保存，不再重复生成。</View><Button className='add-text-button' onClick={()=>go('ai-usage')}>查看额度与用量<Chevron/></Button></View></View>}
    </View>
    {!pending&&(form.mode==='text'||!!form.raw)&&<View className='add-submit-area'>{!canGenerate&&!form.prepared&&<View className='add-ai-note'>{textStatus?.detail??'暂时无法确认 AI 服务，可在 AI 助手中检查。'}</View>}<Button className='btn primary add-submit' disabled={!!busy||!!active||!form.raw.trim()||!form.bookId||!!form.prepared&&!validPrepared} onClick={()=>canGenerate?start():setupAi()}>{busy==='submit'?'正在提交…':busy==='import'?'正在读取材料…':active?'上一批正在整理':!canGenerate&&form.raw.trim()?(textStatus?.action==='usage'?'查看家庭额度':'设置 AI 服务'):form.prepared?`确认加入 ${validPrepared} 个单词`:form.editing?'重新整理并加入词本':'整理并加入词本'}</Button><View className='add-submit-hint'>{form.raw?'草稿自动保留，离开后可以接着添加。':'填写后即可整理，音标、释义和例句会自动补全。'}</View></View>}
   </>}
  </>}
 </View>;
}
