'use strict';
// Private operator console: bind only to loopback and reach it over an SSH tunnel.
const http=require('node:http');
const {randomBytes,timingSafeEqual}=require('node:crypto');
const {readFileSync}=require('node:fs');
const {join,resolve,isAbsolute}=require('node:path');
const {createStore}=require('./database-costs.cjs');
const repair=require('./repair.cjs');
const library=require('./library.cjs');
const operations = require('./operations.cjs');
const contentAudio = require('./content-audio.cjs');
function createServer(pool,port,token,runtime,options={}){
const costsFile=options.databaseCostsFile||process.env.ADMIN_DATABASE_COSTS_FILE||resolve(runtime?.spoolDir||resolve(__dirname,'../../.local/audio-spool'),'../admin-database-costs.json');
if(!isAbsolute(costsFile))throw Error('ADMIN_DATABASE_COSTS_FILE must be an absolute path');
const databaseCosts=createStore(costsFile,options.clock);
const statuses=['pending','in_progress','resolved','dismissed'];
const union=`SELECT 'word' AS source,f.id,f.kind,f.created_at,w.lemma,w.meaning_zh,s.text_en,s.translation_zh,NULL::text AS message,f.audio_id::text AS audio_id,f.word_version::text AS reported_version,w.version::text AS current_version FROM wordmate.word_feedback f JOIN wordmate.child_words w ON w.id=f.child_word_id LEFT JOIN wordmate.sentences s ON s.id=f.sentence_id
 UNION ALL SELECT 'audio',f.id,'pronunciation',f.created_at,COALESCE(w.lemma,''),COALESCE(w.meaning_zh,''),s.text_en,s.translation_zh,NULL::text,f.audio_id::text,a.content_version::text,NULL::text FROM wordmate.audio_feedback f JOIN wordmate.audio_assets a ON a.id=f.audio_id LEFT JOIN wordmate.child_words w ON w.id=a.child_word_id LEFT JOIN wordmate.sentences s ON s.id=a.sentence_id
 UNION ALL SELECT 'tutor',e.id,e.kind,e.created_at,s.lemma,s.meaning_zh,s.example_en,s.example_zh,m.content,NULL::text,NULL::text,NULL::text FROM wordmate.word_tutor_learning_events e JOIN wordmate.word_tutor_sessions s ON s.id=e.session_id JOIN wordmate.word_tutor_messages m ON m.id=e.message_id WHERE e.kind LIKE 'feedback_%'`;
function secretEqual(value){if(typeof value!=='string')return false;const a=Buffer.from(value),b=Buffer.from(token);return a.length===b.length&&timingSafeEqual(a,b)}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))}
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>4096){reject(Error('body too large'));req.destroy()}});req.on('end',()=>{try{resolve(JSON.parse(s))}catch{reject(Error('invalid json'))}});req.on('error',reject)})}
const server=http.createServer(async(req,res)=>{
 try{
  const expected=`127.0.0.1:${port}`;if(req.headers.host!==expected)return send(res,403,{error:'无效访问地址'});
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  const u=new URL(req.url,`http://${expected}`);
  if(req.method==='GET'&&['/','/app.js','/style.css','/database-costs.js','/operations.js'].includes(u.pathname)){const file=u.pathname==='/'?'index.html':u.pathname.slice(1);res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(readFileSync(join(__dirname,file)))}
  if(!secretEqual(req.headers['x-admin-token']))return send(res,401,{error:'管理凭证无效'});
  if(req.headers.origin&&req.headers.origin!==`http://${expected}`)return send(res,403,{error:'来源无效'});
  if (req.method === 'GET' && u.pathname === '/api/database-costs') {
    return send(res, 200, databaseCosts.get(u.searchParams.get('month')));
  }
  if (req.method === 'PUT' && ['/api/database-costs/bill', '/api/database-costs/plan'].includes(u.pathname)) {
    if (req.headers.origin !== `http://${expected}` || !String(req.headers['content-type'] || '').startsWith('application/json')) {
      return send(res, 403, {error: '来源无效'});
    }
    let input;
    try {
      input = await body(req);
    } catch {
      return send(res, 400, {error: '成本记录 JSON 无效或过长'});
    }
    const saved = u.pathname.endsWith('/bill')
      ? databaseCosts.saveBill(input)
      : databaseCosts.savePlan(input);
    return send(res, 200, saved);
  }
  if (req.method === 'GET') {
    const params = u.searchParams;
    const lists = {'/api/contents':operations.contents, '/api/repair-records':operations.repairs, '/api/import-tasks':operations.imports};
    if (Object.hasOwn(lists,u.pathname)) return send(res,200,await lists[u.pathname](pool,params));
    if (u.pathname === '/api/content-detail') return send(res,200,await operations.contentDetail(pool,params.get('kind'),params.get('id')));
    if (u.pathname === '/api/repair-detail') return send(res,200,await operations.repairDetail(pool,params.get('id')));
    if (u.pathname === '/api/content-clips') return send(res,200,await contentAudio.clips(pool,runtime,params.get('kind'),params.get('id'),params.get('part')));
    if (['/api/library-repair-audio','/api/cached-content-audio'].includes(u.pathname)) {
      const bytes = u.pathname === '/api/library-repair-audio'
        ? await contentAudio.repairBytes(pool,params.get('id'))
        : await contentAudio.cachedBytes(pool,runtime,params.get('kind'),params.get('target'),params.get('part'),params.get('id'));
      res.writeHead(200,{'Content-Type':'audio/mpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      return res.end(bytes);
    }
  }
  if(req.method==='GET'&&u.pathname==='/api/feedback'){
   const status=u.searchParams.get('status')||'all',source=u.searchParams.get('source')||'all',offset=Math.min(Math.max(Number(u.searchParams.get('offset'))||0,0),100000);
   if(!['all',...statuses].includes(status)||!['all','word','audio','tutor'].includes(source))return send(res,400,{error:'筛选条件无效'});
   const sql=`WITH feedback AS (${union}), joined AS (SELECT f.*,CASE WHEN a.status='resolved' AND (f.source='audio' OR f.source='word' AND f.kind IN ('pronunciation','example_pronunciation')) AND NOT EXISTS(SELECT 1 FROM wordmate.admin_audio_repairs r WHERE r.status='applied' AND ((f.source='audio' AND r.audio_feedback_id=f.id) OR (f.source='word' AND r.word_feedback_id=f.id))) THEN 'in_progress' ELSE COALESCE(a.status,'pending') END AS status,COALESCE(a.note,'') AS note,a.created_at AS handled_at FROM feedback f LEFT JOIN LATERAL (SELECT status,note,created_at FROM wordmate.admin_feedback_actions a WHERE (f.source='word' AND a.word_feedback_id=f.id) OR (f.source='audio' AND a.audio_feedback_id=f.id) OR (f.source='tutor' AND a.tutor_event_id=f.id) ORDER BY a.id DESC LIMIT 1) a ON true) SELECT * FROM joined WHERE ($1='all' OR status=$1) AND ($2='all' OR source=$2) ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET $3`;
   return send(res,200,(await pool.query(sql,[status,source,offset])).rows);
  }
  if(req.method==='GET'&&u.pathname==='/api/audio-repair/options'){
   const result=await repair.assets(pool,u.searchParams.get('source'),u.searchParams.get('id'));
   return send(res,200,{...result,voices:runtime?.voices??[],available:!!runtime?.synthesize});
  }
  if(req.method==='GET'&&u.pathname==='/api/audio-repair/preview'){
   const bytes=await repair.preview(pool,u.searchParams.get('id'));res.writeHead(200,{'Content-Type':'audio/mpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(bytes);
  }
  if(req.method==='GET'&&u.pathname==='/api/audio-repair/original'){
   const bytes=await repair.original(pool,runtime,u.searchParams.get('source'),u.searchParams.get('feedback'),u.searchParams.get('id'));res.writeHead(200,{'Content-Type':'audio/mpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(bytes);
  }
  if(req.method==='POST'&&['/api/audio-repair/generate','/api/audio-repair/apply'].includes(u.pathname)){
   if(req.headers.origin!==`http://${expected}`||!String(req.headers['content-type']||'').startsWith('application/json'))return send(res,403,{error:'来源无效'});
   const x=await body(req);return send(res,200,u.pathname.endsWith('/generate')?await repair.generate(pool,runtime,x):await repair.apply(pool,runtime,x.id));
  }
  if(req.method==='POST'&&u.pathname==='/api/feedback/action'){
   if(req.headers.origin!==`http://${expected}`||!String(req.headers['content-type']||'').startsWith('application/json'))return send(res,403,{error:'来源无效'});
   const x=await body(req);if(!x||!['word','audio','tutor'].includes(x.source)||!/^[-a-f0-9]{36}$/i.test(x.id||'')||!statuses.includes(x.status)||typeof x.note!=='string'||x.note.length>500)return send(res,400,{error:'处理内容无效'});
   if(x.status==='resolved'&&!x.note.trim())return send(res,400,{error:'请填写实际处理结果后再标记解决'});
   if(x.status==='resolved'&&x.source==='audio')return send(res,409,{error:'发音反馈须先试听并替换音频，才能标记解决'});
   if(x.status==='resolved'&&x.source==='word'){
    const f=(await pool.query("SELECT kind,audio_id,EXISTS(SELECT 1 FROM wordmate.admin_audio_repairs r WHERE r.word_feedback_id=f.id AND r.status='applied') AS repaired FROM wordmate.word_feedback f WHERE id=$1",[x.id])).rows[0];
    if(f&&['pronunciation','example_pronunciation'].includes(f.kind)&&!(f.audio_id===null&&f.repaired&&x.note.trim()))return send(res,409,{error:'发音反馈须先试听并替换音频；未指定音频的反馈还需填写核查备注'});
   }
   const col={word:'word_feedback_id',audio:'audio_feedback_id',tutor:'tutor_event_id'}[x.source];const sourceTable={word:'wordmate.word_feedback',audio:'wordmate.audio_feedback',tutor:'wordmate.word_tutor_learning_events'}[x.source];
   const r=await pool.query(`INSERT INTO wordmate.admin_feedback_actions (${col},status,note) SELECT id,$2,$3 FROM ${sourceTable} WHERE id=$1 ${x.source==='tutor'?"AND kind LIKE 'feedback_%'":''} RETURNING id`,[x.id,x.status,x.note.trim()]);return send(res,r.rowCount?200:404,r.rowCount?{ok:true}:{error:'反馈不存在'});
  }
  if(req.method==='GET'&&u.pathname==='/api/users')return send(res,200,(await pool.query(`SELECT u.id,u.display_name,u.status,u.created_at,(SELECT count(*)::int FROM wordmate.family_members f WHERE f.user_id=u.id AND f.status='active') families,(SELECT count(DISTINCT c.id)::int FROM wordmate.family_members f JOIN wordmate.children c ON c.family_id=f.family_id WHERE f.user_id=u.id AND f.status='active' AND c.archived_at IS NULL) children FROM wordmate.users u ORDER BY u.created_at DESC,u.id DESC LIMIT 51 OFFSET $1`,[Math.min(Math.max(Number(u.searchParams.get('offset'))||0,0),100000)])).rows);
  if(req.method==='GET'&&u.pathname==='/api/books')return send(res,200,(await pool.query(`SELECT '个人' AS type,b.id,b.name,b.created_at,b.archived_at,(SELECT count(*)::int FROM wordmate.wordbook_words bw WHERE bw.wordbook_id=b.id) word_count FROM wordmate.wordbooks b UNION ALL SELECT '共享',s.id,s.title,s.created_at,NULL,s.word_count FROM wordmate.shared_wordbooks s WHERE s.published ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET $1`,[Math.min(Math.max(Number(u.searchParams.get('offset'))||0,0),100000)])).rows);
  if(req.method==='GET'&&u.pathname==='/api/words')return send(res,200,await library.words(pool,u.searchParams));
  if(req.method==='GET'&&u.pathname==='/api/library-audio'){
   const bytes=await library.audio(pool,runtime,u.searchParams.get('id'));res.writeHead(200,{'Content-Type':'audio/mpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(bytes);
  }
  if(req.method==='GET'&&u.pathname==='/api/usage')return send(res,200,(await pool.query(`SELECT kind,mode,state,count(*)::int AS calls,COALESCE(sum(input_tokens),0)::text AS input_tokens,COALESCE(sum(output_tokens),0)::text AS output_tokens,COALESCE(sum(cost_micros),0)::text AS cost_micros,COALESCE(sum(charge_micros),0)::text AS charge_micros,count(cost_micros)::int AS cost_recorded FROM wordmate.ai_calls WHERE created_at>=now()-interval '30 days' GROUP BY kind,mode,state UNION ALL SELECT 'admin_audio_repair','platform',status,count(*)::int,'0','0','0','0',0 FROM wordmate.admin_audio_repairs WHERE created_at>=now()-interval '30 days' GROUP BY status ORDER BY calls DESC`)).rows);
  return send(res,404,{error:'未找到'});
 }catch(e){console.error('Admin request failed:',e.code||e.message);if(!res.headersSent)send(res,e.httpStatus||500,{error:e.httpStatus?e.message:'操作失败，请检查服务日志'});else res.end()}
});
return server;
}
module.exports={createServer};
if(require.main===module){
 const {Pool}=require('../api/node_modules/pg');
 const port=Number(process.env.ADMIN_PORT||8787);
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid ADMIN_PORT');
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required');
 const token=randomBytes(32).toString('hex');
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:3});
 require('../api/dist/audio-runtime.js').audioRuntime(process.env).then(runtime=>{
  const server=createServer(pool,port,token,runtime);
  server.listen(port,'127.0.0.1',()=>console.log(`管理后台仅本机可访问：http://127.0.0.1:${port}/#${token}\n通过 SSH 隧道访问，请勿分享链接。`));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>pool.end().then(()=>process.exit(0))));
 }).catch(()=>{console.error('音频配置初始化失败');pool.end();process.exitCode=1});
}
