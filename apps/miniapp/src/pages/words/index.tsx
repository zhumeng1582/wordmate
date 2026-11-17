import {ListLoadState} from '../../components/ListLoadState';
import {useListPagination} from '../../services/use-list-pagination';
import {Icon} from '../../components/Icon';
import {LibraryItemSummary} from '../../components/LibraryItemSummary';
import {LibraryHeader,LibraryOverview} from '../../components/LibraryHeader';
import {TutorFloat} from '../../components/TutorFloat';
import {shareWordPdf,clearWordPdf,isFileCancel} from '../../services/files';
import {useEffect,useRef,useState} from 'react';
import {View,Button,Text,ScrollView} from '@tarojs/components';
import Taro,{useDidShow,useDidHide} from '@tarojs/taro';
import {api,storage,go,message} from '../../services/api';
import {useAudio} from '../../services/audio';
import {AudioFeedback} from '../../components/AudioControls';
import {refreshVisiblePages} from '../../services/visible-pages';
import {libraryActionGroups,chooseLibraryAction} from '../../services/library-navigation';
import {LibraryFilter as LibraryFilterPanel} from '../../components/LibraryFilter';
import {libraryStatus,libraryStatusLabels,libraryIncludes,type LibraryFilter} from '../../services/library-status';
import './index.css';
export default function Words(){
 const audio=useAudio(),serial=useRef(0),scope=useRef(''),windowScope=useRef(''),windowStart=useRef<string|undefined>(undefined),reading=useRef(false),menuSerial=useRef(0);
 const [bookOpen,setBookOpen]=useState(false),bookOwner=useRef('');
 const [filterOpen,setFilterOpen]=useState(false),filterOwner=useRef('');
 const archiveType=useRef<LibraryFilter>('all'),[archive,setArchive]=useState<LibraryFilter>('all');
 const [cursor,setCursor]=useState<string|null>(null),[total,setTotal]=useState(0),[allTotal,setAllTotal]=useState(0),[selecting,setSelecting]=useState(false),[all,setAll]=useState(false),[selected,setSelected]=useState<string[]>([]),[exporting,setExporting]=useState(false),[exportFormat,setExportFormat]=useState<'list'|'copybook'>('list');
 const count=all?allTotal-selected.length:selected.length;
 const picked=(id:string)=>all?!selected.includes(id):selected.includes(id);
 const select=(id:string)=>setSelected(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id]);
 const [words,setWords]=useState<any[]>([]),[books,setBooks]=useState<any[]>([]),[bookId,setBookId]=useState(''),[bookTotal,setBookTotal]=useState(0),[learnedCount,setLearnedCount]=useState(0),[firstUnlearnedId,setFirstUnlearnedId]=useState<string|null>(null),[firstUnlearnedCursor,setFirstUnlearnedCursor]=useState<string|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[active,setActive]=useState(false),[visible,setVisible]=useState(true);
 const refresh=async(more=false,quiet=false)=>{
  const n=++serial.current,child=storage.get('child_id'),key=`${storage.get('access_token')}:${child}`,scopeChanged=scope.current!==key,current=()=>n===serial.current&&key===`${storage.get('access_token')}:${storage.get('child_id')}`;
  reading.current=true;if(!quiet||!loaded||scopeChanged)setBusy(true);
  if(scopeChanged){setBookOpen(false);setFilterOpen(false);archiveType.current='all';setArchive('all');scope.current=key;setWords([]);setBooks([]);setSelected([]);setSelecting(false);setAll(false);setCursor(null);setLoaded(false);setAllTotal(0);setBookTotal(0);setTotal(0);more=false;windowStart.current=undefined;}
  try{
   const b=await api(`/children/${child}/wordbooks`);if(!current())return;
   const saved=storage.get(`current_wordbook:${child}`),selectedBook=b.items.some((x:any)=>x.id===saved)?saved:(!scopeChanged&&b.items.some((x:any)=>x.id===bookId)?bookId:(b.items[0]?.id??'')),windowKey=`${key}:${selectedBook}`,changedBook=windowScope.current!==windowKey;
   setBooks(b.items);setBookId(selectedBook);if(saved!==selectedBook)storage.set(`current_wordbook:${child}`,selectedBook);
   if(changedBook){windowScope.current=windowKey;windowStart.current=undefined;setWords([]);setSelected([]);setAll(false);setCursor(null);setLoaded(false);more=false;setBusy(true);}
   const read=(after?:string)=>api(`/children/${child}/words?limit=100&status=${archiveType.current}${selectedBook?`&wordbook_id=${encodeURIComponent(selectedBook)}`:''}${after?`&cursor=${encodeURIComponent(after)}`:''}`);
   const [data,jobs]=await Promise.all([more?read(cursor??undefined):refreshVisiblePages(read,changedBook?100:Math.max(100,words.length),current,windowStart.current),api(`/children/${child}/ai-batches`)]);
   if(!data||!current())return;
   setWords(old=>more?[...old,...data.items.filter((w:any)=>!old.some(x=>x.id===w.id))]:data.items);setCursor(data.next_cursor);setTotal(data.total);setAllTotal(data.total);setBookTotal(data.overall_total??data.book_total);setLearnedCount(data.overall_learned_count??data.learned_count);setFirstUnlearnedId(data.first_unlearned_id);setFirstUnlearnedCursor(data.first_unlearned_cursor);setActive(jobs.items.some((j:any)=>['queued','running'].includes(j.status)));setLoaded(true);setError('');
  return true;}catch(e){if(!more&&current())setError(message(e));return false;}finally{if(n===serial.current){reading.current=false;setBusy(false);}}
 };
 useEffect(()=>()=>clearWordPdf(),[]);
 useDidShow(()=>{setVisible(true);void refresh(false,true);});useDidHide(()=>{menuSerial.current++;setVisible(false);setBookOpen(false);setFilterOpen(false);serial.current++;reading.current=false;audio.stop();});
 useEffect(()=>{if(!visible||!active||selecting)return;const timer=setInterval(()=>{if(!reading.current&&!busy)void refresh(false,true);},2000);return()=>clearInterval(timer);},[visible,active,busy,selecting]);
 const toggle=(id:string)=>{if(selecting){select(id);return;}audio.stop();void Taro.navigateTo({url:`/pages/word-detail/index?id=${encodeURIComponent(id)}`}).catch(e=>setError(message(e)));};
 const menuContext=()=>`${storage.get('access_token')}:${storage.get('child_id')}:${storage.get(`current_wordbook:${storage.get('child_id')}`)}:${menuSerial.current}`;
 const chooseArchive=async()=>{filterOwner.current=menuContext();setFilterOpen(open=>!open);};
 const applyFilter=(next:LibraryFilter)=>{if(filterOwner.current!==menuContext()){setFilterOpen(false);return;}audio.stop();archiveType.current=next;setArchive(next);windowStart.current=undefined;setWords([]);setLoaded(false);setSelecting(false);setSelected([]);setAll(false);void refresh();};
 const exportSelection=async()=>{if(exporting||!count)return;const key=`${storage.get('access_token')}:${storage.get('child_id')}`;setExporting(true);setError('');try{const result=await api(`/children/${storage.get('child_id')}/word-exports`,'POST',all?{...(exportFormat==='copybook'?{format:'copybook'}:{}),all:true,excluded_ids:selected,wordbook_id:bookId,status:archive}:{...(exportFormat==='copybook'?{format:'copybook'}:{}),word_ids:selected,wordbook_id:bookId});if(key===`${storage.get('access_token')}:${storage.get('child_id')}`)await shareWordPdf(result.base64);}catch(e){if(!isFileCancel(e))setError(message(e));}finally{setExporting(false);}};
 const locateFirstUnlearned=async()=>{if(!firstUnlearnedId)return;let target=words.find(w=>w.id===firstUnlearnedId);if(!target){setBusy(true);try{const child=storage.get('child_id'),params=[`limit=100`,`status=${archive}`];if(bookId)params.push(`wordbook_id=${encodeURIComponent(bookId)}`);if(firstUnlearnedCursor)params.push(`cursor=${encodeURIComponent(firstUnlearnedCursor)}`);const page=await api(`/children/${child}/words?${params.join('&')}`);windowStart.current=firstUnlearnedCursor??undefined;setWords(page.items);setCursor(page.next_cursor);target=page.items.find((w:any)=>w.id===firstUnlearnedId);}catch(e){setError(message(e));return;}finally{setBusy(false);}}if(target){Taro.nextTick(()=>Taro.pageScrollTo({selector:`#word-${firstUnlearnedId}`,duration:280}));}};
 const openActions=async()=>{if(busy||selecting||exporting)return;menuSerial.current++;const key=menuContext(),current=()=>key===menuContext();try{const entry=await chooseLibraryAction(libraryActionGroups('words',{archive:libraryStatusLabels[archive],canLocate:loaded&&libraryIncludes(archive,'unlearned')&&!!firstUnlearnedId,canExport:loaded}),itemList=>Taro.showActionSheet({itemList}),current);if(!entry)return;if(entry.page){audio.stop();go(entry.page);}else if(entry.action==='archive')await chooseArchive();else if(entry.action==='locate')await locateFirstUnlearned();else if(entry.action==='export'||entry.action==='copybook'){audio.stop();setExportFormat(entry.action==='copybook'?'copybook':'list');setSelecting(true);}}catch(e){if(!isFileCancel(e)&&current())setError('操作菜单暂时无法打开，请重试。');}};
 const switchBook=(next:string)=>{setBookOpen(false);if(bookOwner.current!==menuContext())return;if(next===bookId)return;audio.stop();setFilterOpen(false);archiveType.current='all';setArchive('all');setSelecting(false);setBookId(next);storage.set(`current_wordbook:${storage.get('child_id')}`,next);setWords([]);setSelected([]);setAll(false);setCursor(null);void refresh();};
 const BookList=books.length>5?ScrollView:View;
 const bookAction=(page:string)=>{setBookOpen(false);if(bookOwner.current!==menuContext())return;audio.stop();go(page);};
 const paging=useListPagination({key:menuContext().split(':').slice(0,-1).join(':')+':'+archive,hasMore:!!cursor,count:words.length,ready:loaded&&!busy&&!error,blocked:busy||exporting||bookOpen||filterOpen,refreshBlocked:selecting,canLoad:()=>!reading.current,more:()=>refresh(true,true),refresh:()=>refresh(false,true)});
 return <View className={`page wordbook-page ${selecting?'wordbook-selecting':''}`}><LibraryHeader name='单词' title='我的单词本' books={books} bookId={bookId} onBookChange={switchBook} onOpenBooks={()=>{menuSerial.current++;bookOwner.current=menuContext();setFilterOpen(false);setBookOpen(true);}} disabled={busy||exporting} selecting={selecting} onSearch={()=>{audio.stop();go('search');}} onMore={()=>{setFilterOpen(false);void openActions();}}/>
 {bookOpen&&<View className='book-switch-overlay' onClick={()=>setBookOpen(false)}><View className='book-switch-panel' role='dialog' aria-label='切换词本' onClick={e=>e.stopPropagation()}><View className='book-switch-heading'><Text>切换词本</Text><View className='book-switch-actions'><Button className='library-header-button' aria-label='新建词本' disabled={busy||exporting} onClick={()=>bookAction('wordbook-edit')}><Icon name='plus'/></Button><Button className='library-header-button' aria-label='词本管理与发现' disabled={busy||exporting} onClick={()=>bookAction('wordbooks')}><Icon name='book'/></Button></View></View><BookList scrollY className={`book-switch-list ${books.length>5?'book-switch-list-scroll':''}`}>{books.map(book=><Button key={book.id} className={`book-switch-option ${book.id===bookId?'selected':''}`} disabled={busy||exporting} onClick={()=>switchBook(book.id)}><View className='book-switch-name'>{book.name}{book.read_only&&<Text className='muted small'> · 共享</Text>}</View>{book.id===bookId&&<Text className='book-switch-current'>当前词本</Text>}</Button>)}{!books.length&&<View className='muted'>还没有词本，可以点击右上角新建。</View>}</BookList><Button className='text-action book-switch-close' onClick={()=>setBookOpen(false)}>关闭</Button></View></View>}


 {filterOpen&&<LibraryFilterPanel value={archive} onChange={applyFilter} onClose={()=>setFilterOpen(false)}/>}
 {error&&<View className='error'>{error}<Button className='btn' disabled={busy} onClick={()=>refresh()}>重新加载</Button></View>}{busy&&!loaded&&<View className='muted'>正在加载…</View>}

 {audio.error&&<AudioFeedback audio={audio}/>}{active&&<View className='wordbook-status muted small'>新单词正在生成，完成后自动显示。</View>}
 {loaded&&!words.length&&!error&&archive==='all'&&<View className='muted'>当前筛选下没有单词，可调整筛选查看其他状态。<Text className='link' onClick={()=>go('add-words')}> 录入单词</Text></View>}
 {loaded&&!words.length&&!error&&archive!=='all'&&<View className='muted'>没有符合条件的单词。</View>}
 <LibraryOverview name='单词' count={loaded?`已学 ${learnedCount}/${bookTotal}`:''} scope={libraryStatusLabels[archive]} disabled={busy||exporting||selecting} onFilter={()=>{menuSerial.current++;void chooseArchive();}}/>
 {selecting&&<View className='muted small'>{all?'已选当前筛选结果，点击单词可将其排除。':'点击单词勾选，可跨页选择。'}{exportFormat==='copybook'?'导出英文字帖，仅含一个英文范字和四线临写空间。':'导出为 A4 双栏 PDF，可直接打印。'}</View>}
 {!!words.length&&<View className='wordbook-list'>{words.map((w,index)=>{const target={word_id:w.id,content_version:w.version},activeAudio=audio.active===JSON.stringify(target);return <View id={`word-${w.id}`} className='wordbook-item' key={w.id} onClick={()=>!exporting&&toggle(w.id)}>{index>0&&<View className='library-divider'/>}<LibraryItemSummary title={w.lemma} status={libraryStatusLabels[libraryStatus(w,'words')]} description={(w.senses?.length?w.senses:[{part_of_speech:w.part_of_speech,meaning_zh:w.meaning_zh}]).map((sense:any)=>[sense.part_of_speech,sense.meaning_zh].filter(Boolean).join(' ')).filter(Boolean).join('；')||'释义待补充'} selecting={selecting} selected={picked(w.id)} audioLabel='播放单词发音' audioActive={activeAudio} audioPlaying={activeAudio&&audio.status==='正在播放…'} onPronounce={()=>void audio.play(target)} onOpen={()=>toggle(w.id)}/></View>})}</View>}
 <ListLoadState {...paging}/>
 {selecting&&<View className='wordbook-export-bar'><View className='wordbook-export-info'><Text className='wordbook-export-count'>已选 <Text>{count}</Text> 词</Text><Button className='wordbook-export-all' disabled={exporting} onClick={()=>{setAll(!all);setSelected([]);}}>{all?'取消全选':archive==='all'?'全选整个词本':'全选当前状态'}</Button></View><View className='wordbook-export-actions'><Button className='wordbook-export-cancel' disabled={exporting} onClick={()=>{setSelecting(false);setSelected([]);setAll(false);}}>取消</Button><Button className='wordbook-export-confirm' disabled={exporting||count<=0} onClick={exportSelection}>{exporting?'正在导出…':exportFormat==='copybook'?'导出英文字帖':'导出 PDF'}</Button></View></View>}
 <TutorFloat onOpen={()=>audio.stop()}/>
 </View>;
}
