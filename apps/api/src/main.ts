import type {VocabularyProvider} from './vocabulary';
import {vocabularyProvider} from './vocabulary';
import 'reflect-metadata';
import {All,Controller,Get,Module,Req,Res} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import type {Request,Response} from 'express';
import {randomUUID} from 'node:crypto';
import {Core} from './core';
import {connect} from './database';
import {createScheduler,DevIdentity,FixtureDictionary,UnconfiguredDictionary,WechatIdentity} from './providers';
import {DomainError,ensure} from './errors';
import {StoredMeaningQuizBuilder} from './quiz';
import {validateBody} from './validation';
const env=process.env,development=env.AUTH_MODE==='development';
if(development&&env.NODE_ENV!=='development')throw Error('Development identities require NODE_ENV=development');
if(env.DICTIONARY_PROVIDER==='fixture'&&!development)throw Error('Fixture dictionary requires development auth');
let core:Core;
@Controller('api')
class ApiController {
  @Get('health') health(){return {status:'ok',api_revision:'0.1-ai-vocabulary',mode:development?'development':'production'};}
  @All('*path') async handle(@Req() req:Request,@Res() res:Response){
    const request_id=randomUUID();res.setHeader('Cache-Control','no-store');
    try {
      const p=req.path.replace(/^\/api/,'').split('/').filter(Boolean),b=req.body??{},method=req.method;
      const historyRead=method==='GET'&&p[0]==='children'&&['calendar','wrong-words'].includes(p[2]);
      const cardsRead=method==='GET'&&p[0]==='study-sessions'&&p[2]==='cards';
      const quizRead=method==='GET'&&(p[0]==='monthly-quizzes'||p[0]==='children'&&p[2]==='monthly-quizzes');
      ensure(Object.keys(req.query).every(k=>quizRead&&['month','cursor','limit'].includes(k)||historyRead&&(p[2]==='calendar'?['month']:['date','source','quiz_id','cursor','limit']).includes(k)||cardsRead&&['cursor','limit'].includes(k)),422,'QUERY_NOT_IMPLEMENTED');
      validateBody(p,method,b);
      if(method==='POST'&&p.join('/')===(development?'auth/dev':'auth/wechat'))return res.json({request_id,data:await core.login(b.code)});
      const auth=req.headers.authorization;ensure(typeof auth==='string' && auth.startsWith('Bearer '),401,'UNAUTHENTICATED');const actor=await core.authenticate(auth.slice(7));
      const key=String(req.headers['idempotency-key']??'');let data:any;
      if(p[0]==='ai-batches'&&p.length===2&&method==='PUT')data=await core.vocabulary.replace(actor,key,p[1],b);
      else if(p[0]==='ai-batches'&&p.length===2&&method==='GET')data=await core.vocabulary.get(actor,p[1]);
      else if(p[0]==='ai-batches'&&p.length===3&&p[2]==='retry'&&method==='POST')data=await core.vocabulary.retry(actor,key,p[1]);
      else if(method==='GET'&&p.join('/')==='me')data=await core.me(actor);
      else if(method==='POST'&&p.join('/')==='families')data=await core.createFamily(actor,key,b);
      else if(method==='GET'&&p[0]==='families'&&p[2]==='members'&&p.length===3)data=await core.members(actor,p[1]);
      else if(p[0]==='families'&&p[2]==='invites'&&p.length===3)data=method==='GET'?await core.invites(actor,p[1]):method==='POST'?await core.createInvite(actor,key,p[1]):undefined;
      else if(method==='POST'&&p.join('/')==='family-invites/claim')data=await core.claimInvite(actor,key,b);
      else if(method==='POST'&&p[0]==='family-invites'&&p[2]==='approve'&&p.length===3)data=await core.approveInvite(actor,key,p[1]);
      else if(p[0]==='families'&&p[2]==='children'&&p.length===3){data=method==='GET'?await core.children(actor,p[1]):method==='POST'?await core.createChild(actor,key,p[1],b):undefined;}
      else if(method==='GET'&&p[0]==='children'&&p[2]==='words'&&p.length===4)data=await core.word(actor,p[1],p[3]);
      else if(p[0]==='children'&&p[2]==='monthly-quizzes'&&p[3]==='preview'&&p.length===4&&method==='GET')data=await core.quizzes.preview(actor,p[1],req.query.month);
      else if(p[0]==='monthly-quizzes'){
        const id=p[1];
        if(method==='GET'&&p.length===2)data=await core.quizzes.get(actor,id);
        if(method==='GET'&&p.length===3&&['items','results','mistakes'].includes(p[2]))data=await core.quizzes.items(actor,id,req.query,p[2] as 'items'|'results'|'mistakes');
        if(method==='POST'&&p.length===3&&['resume','takeover'].includes(p[2]))data=await core.quizzes.resume(actor,key,id,b,p[2]==='takeover');
        if(method==='PUT'&&p.length===5&&p[2]==='items'&&p[4]==='answer')data=await core.quizzes.answer(actor,key,id,p[3],b);
        if(method==='POST'&&p.length===3&&p[2]==='submit')data=await core.quizzes.submit(actor,key,id,b);
        if(method==='POST'&&p.length===3&&p[2]==='abandon')data=await core.quizzes.abandon(actor,key,id,b);
      }
      else if(p[0]==='children'&&p.length===3){const id=p[1];
        if(p[2]==='ai-batches')data=method==='GET'?await core.vocabulary.list(actor,id):method==='POST'?await core.vocabulary.create(actor,key,id,b):undefined;
        if(p[2]==='monthly-quizzes')data=method==='GET'?await core.quizzes.list(actor,id,req.query):method==='POST'?await core.quizzes.create(actor,key,id,b):undefined;
        if(method==='GET'&&p[2]==='calendar')data=await core.history.calendar(actor,id,req.query.month);
        if(method==='GET'&&p[2]==='wrong-words')data=await core.history.wrongWords(actor,id,req.query);
        if(method==='GET'&&p[2]==='today')data=await core.today(actor,id);
        if(p[2]==='wordbooks')data=method==='GET'?await core.wordbooks(actor,id):method==='POST'?await core.createWordbook(actor,key,id,b):undefined;
        if(method==='GET'&&p[2]==='words')data=await core.words(actor,id);
        if(method==='POST'&&p[2]==='batches')data=await core.createBatch(actor,key,id,b);
        if(method==='POST'&&p[2]==='study-sessions')data=await core.startSession(actor,key,id,b);
      }
      else if(method==='POST'&&p[0]==='batches'&&p[2]==='confirm'&&p.length===3)data=await core.confirmBatch(actor,key,p[1],b);
      else if(p[0]==='study-sessions'&&p.length===3){
        if(method==='GET'&&p[2]==='cards')data=await core.cards(actor,p[1],req.query);
        if(method==='POST'&&['heartbeat','end'].includes(p[2]))data=await core.heartbeat(actor,p[1],b,p[2]==='end');
      }
      else if(method==='POST'&&p.join('/')==='reviews')data=await core.review(actor,b);
      ensure(data!==undefined,404,'ROUTE_NOT_IMPLEMENTED');res.json({request_id,data});
    }catch(e){const known=e instanceof DomainError;res.status(known?e.status:500).json({request_id,error:{code:known?e.code:'INTERNAL_ERROR',message:known?e.code:'请求未完成，请重试'}});}
  }
}
@Module({controllers:[ApiController]}) class AppModule{}
export async function createApplication(options:{vocabulary?:VocabularyProvider}={}){
  const {db,source}=await connect(env.DATABASE_URL??'');
  core=new Core(db,development?new DevIdentity():new WechatIdentity(env.WECHAT_APP_ID??'',env.WECHAT_APP_SECRET??''),env.DICTIONARY_PROVIDER==='fixture'?new FixtureDictionary():new UnconfiguredDictionary(),await createScheduler(),env.WECHAT_APP_ID??'wxcf7d28bc513949d4',()=>new Date(),options.vocabulary??await vocabularyProvider(env));
  const app=await NestFactory.create(AppModule,{bodyParser:true,logger:['error','warn']});
  app.enableShutdownHooks();
  const close=()=>{void source.destroy();};process.once('SIGTERM',close);process.once('SIGINT',close);
  await app.init();
  let preparing=false;
  const timer=setInterval(async()=>{if(preparing)return;preparing=true;try{await core.quizzes.prepare(new StoredMeaningQuizBuilder());}catch{console.error('Quiz preparation cycle failed');}finally{preparing=false;}},2000);timer.unref();
  let generation:Promise<void>|undefined;
  const aiTimer=setInterval(()=>{if(generation)return;generation=core.vocabulary.processOne().catch(()=>{console.error('Vocabulary generation cycle failed');}).finally(()=>{generation=undefined;});},1000);aiTimer.unref();
  return {app,dispose:async()=>{clearInterval(timer);clearInterval(aiTimer);await generation;await app.close();await source.destroy();}};
}
async function bootstrap(){
  const {app}=await createApplication();
  await app.listen(Number(env.PORT??3000),development?'127.0.0.1':env.HOST??'127.0.0.1');
  console.log(`API ready at http://127.0.0.1:${env.PORT??3000}/api/health [0.1-ai-vocabulary] (${development?'development':'production'})`);
}
if(require.main===module)bootstrap().catch(()=>{console.error('Backend startup failed. Check database, credentials and installed dependencies.');process.exitCode=1;});
