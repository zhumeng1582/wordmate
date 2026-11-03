import {AiAccounts} from './ai-accounts';
import {TutorAsr} from './tutor-asr';
import {TutorSpeech} from './tutor-speech';
import {TutorSearch} from './tutor-search';
import {TutorImage} from './tutor-image';
import {readReleaseInfo} from './release-info';
import {ReferralCodeImage} from './referral-code';
import {AiPayments} from './ai-payments';
import {Privacy} from './privacy';
import {Lifecycle} from './lifecycle';
import type {ImageReader} from './import-files';
import type {NestExpressApplication} from '@nestjs/platform-express';
import type {EncouragementProvider} from './checkin-share';
import {audioRuntime,type AudioRuntime} from './audio-runtime';
import {checkinShareImageCache,type CheckinShareImageCache} from './checkin-share-images';
import type {VocabularyProvider} from './vocabulary';
import 'reflect-metadata';
import {All,Controller,Get,Module,Req,Res} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import type {Request,Response} from 'express';
import {randomUUID} from 'node:crypto';
import {Core} from './core';
import {connect} from './database';
import {createScheduler,DevIdentity,FixtureDictionary,UnconfiguredDictionary,WechatIdentity} from './providers';
import {DomainError,ensure} from './errors';
import {startWorkers} from './workers';
import {validateBody} from './validation';
const env=process.env,development=env.AUTH_MODE==='development',release=readReleaseInfo();
if(development&&env.NODE_ENV!=='development')throw Error('Development identities require NODE_ENV=development');
if(env.DICTIONARY_PROVIDER==='fixture'&&!development)throw Error('Fixture dictionary requires development auth');
let tutorImage:TutorImage;let tutorSearch:TutorSearch;let tutorAsr:TutorAsr;let tutorSpeech:TutorSpeech;let referralCodes:ReferralCodeImage;let core:Core;let privacy:Privacy;let lifecycle:Lifecycle;let accounts:AiAccounts;let payments:AiPayments;
@Controller('api')
class ApiController {
  @Get('health') health(){return {status:'ok',api_revision:'0.1-audio',mode:development?'development':'production',release};}
  @All('*path') async handle(@Req() req:Request,@Res() res:Response){
    const request_id=randomUUID();res.setHeader('Cache-Control','no-store');
    try {
      const p=req.path.replace(/^\/api/,'').split('/').filter(Boolean),b=req.body??{},method=req.method;
      if(p.join('/')==='payments/virtual/notify'){if(method==='GET'){const echo=String(req.query.echostr??'');payments.verify(req.query,req.query.encrypt_type==='aes'?echo:undefined);return res.send(echo);}if(method==='POST')return res.json(await payments.notify(req.query,b));}
      const aiRead=method==='GET'&&['me/ai-settings','me/ai-usage','me/ai-recharges'].includes(p.join('/'));
      if(aiRead&&req.query.capability!==undefined)ensure(typeof req.query.capability==='string'&&['text','vision'].includes(req.query.capability),422,'INVALID_REQUEST_BODY');
      const historyRead=method==='GET'&&p[0]==='children'&&['calendar','wrong-words','history-range'].includes(p[2]);
      const wordsRead=method==='GET'&&p[0]==='children'&&p[2]==='words'&&p.length===3;
      const sharedBooksRead=method==='GET'&&p[0]==='shared-wordbooks';
      const avatarRead=method==='GET'&&p[0]==='parents'&&p[2]==='avatar'&&p.length===3;
      if(avatarRead&&req.query.v!==undefined)ensure(typeof req.query.v==='string'&&/^[1-9][0-9]{0,9}$/.test(req.query.v),422,'INVALID_REQUEST_BODY');
      const cardsRead=method==='GET'&&p[0]==='study-sessions'&&p[2]==='cards';
      const quizRead=method==='GET'&&(p[0]==='monthly-quizzes'||p[0]==='children'&&p[2]==='monthly-quizzes');
      ensure(Object.keys(req.query).every(k=>avatarRead&&k==='v'||aiRead&&['family_id','capability'].includes(k)||method==='GET'&&p.join('/')==='voices'&&k==='accent'||method==='GET'&&p.join('/')==='textbook-volumes'&&k==='child_id'||quizRead&&['month','cursor','limit','scope'].includes(k)||historyRead&&(p[2]==='calendar'?['month','source']:p[2]==='history-range'?['date','date_from','date_to','scope','source']:['date','date_from','date_to','source','quiz_id','cursor','limit']).includes(k)||cardsRead&&['cursor','limit'].includes(k)||wordsRead&&['cursor','limit','q','mark','wordbook_id'].includes(k)||method==='GET'&&p[0]==='children'&&p[2]==='today'&&p.length===3&&k==='wordbook_id'||sharedBooksRead&&['q','limit','offset','grade','textbook','category','child_id'].includes(k)),422,'QUERY_NOT_IMPLEMENTED');
      validateBody(p,method,b);
      if(method==='GET'&&p.join('/')==='privacy/policy')return res.json({request_id,data:privacy.policy});
      if(method==='POST'&&p.join('/')===(development?'auth/dev':'auth/wechat'))return res.json({request_id,data:await core.login(b.code,b.invite_code,b.management_only===true)});
      const auth=req.headers.authorization;ensure(typeof auth==='string' && auth.startsWith('Bearer '),401,'UNAUTHENTICATED');const actor=await core.authenticate(auth.slice(7));
      const route=p.join('/'),privacyManagement=route==='me'||route==='me/privacy-consent'||route==='me/data-management'||method==='GET'&&['me/ai-settings','me/ai-usage','me/ai-recharges'].includes(route)||method==='DELETE'&&route==='me/ai-key'||method==='GET'&&p[0]==='me'&&p[1]==='ai-recharges'||route==='auth/logout'||p[0]==='lifecycle-jobs'||p[0]==='families'&&(method==='DELETE'||['leave','transfer-owner'].includes(p[2]))||p[0]==='children'&&method==='DELETE'&&p.length===2;
      if(!privacyManagement){ensure(!await core.managementOnly(auth.slice(7)),403,'MANAGEMENT_SESSION_ONLY');await core.requirePrivacy(actor);}
      const key=String(req.headers['idempotency-key']??'');let data:any;
      if(route==='me/privacy-consent'){
       if(method==='GET')data={...await privacy.consent(actor),management_only:await core.managementOnly(auth.slice(7))};
       if(method==='PUT'){data=await privacy.accept(actor,b);await core.upgradeSession(actor,auth.slice(7));}
       if(method==='DELETE')data=await privacy.withdraw(actor);
      }
      else if(route==='me/referral-code-image'&&method==='GET'){const me=await core.me(actor);data=await referralCodes.create(me.referral_code,request_id);}
      else if(route==='me/profile'&&method==='PUT')data=await core.saveProfile(actor,key,b);
      else if(avatarRead){const avatar=await core.parentAvatar(actor,p[1],req.query.v as string|undefined);res.setHeader('Content-Type',avatar.mime);res.setHeader('X-Content-Type-Options','nosniff');return res.send(avatar.bytes);}
      else if(route==='me/ai-settings'&&method==='GET')data=await accounts.overview(actor,req.query.family_id as string|undefined,(req.query.capability??'text') as 'text'|'vision');
      else if(route==='me/ai-settings'&&method==='PUT')data=await accounts.save(actor,b);
      else if(route==='me/ai-key'&&method==='DELETE')data=await accounts.deleteKey(actor,b.expected_version,b.capability,b.family_id);
      else if(route==='me/ai-test'&&method==='POST')data=await accounts.test(actor,b.capability,b.family_id);
      else if(route==='me/ai-usage'&&method==='GET')data=await accounts.history(actor,req.query.family_id as string|undefined);
      else if(route==='me/ai-recharges'&&method==='GET')data=await payments.catalog(actor,req.query.family_id as string|undefined);
      else if(route==='me/ai-recharges'&&method==='POST')data=await payments.create(actor,b.request_id,b);
      else if(p[0]==='me'&&p[1]==='ai-recharges'&&p.length===3&&method==='GET')data=await payments.check(actor,p[2]);
      else if(route==='me/data-management'&&method==='GET')data=await lifecycle.overview(actor);
      else if(route==='auth/logout'&&method==='POST')data=await lifecycle.logout(actor,auth.slice(7));
      else if(route==='me'&&method==='DELETE')data=await lifecycle.deleteAccount(actor);
      else if(p[0]==='lifecycle-jobs'){
       if(method==='GET'&&p.length===1)data=await lifecycle.jobs(actor);
       if(method==='GET'&&p.length===2)data=await lifecycle.job(actor,p[1]);
       if(method==='POST'&&p.length===3&&p[2]==='retry')data=await lifecycle.retry(actor,p[1]);
      }
      else if(method==='DELETE'&&p[0]==='children'&&p.length===2){data=await lifecycle.deleteChild(actor,p[1],b);res.status(202);}
      else if(method==='DELETE'&&p[0]==='families'&&p.length===2){data=await lifecycle.deleteFamily(actor,p[1],b);res.status(202);}
      else if(method==='POST'&&p[0]==='families'&&p[2]==='leave'&&p.length===3)data=await lifecycle.leave(actor,p[1]);
      else if(method==='POST'&&p[0]==='families'&&p[2]==='transfer-owner'&&p.length===3)data=await lifecycle.transfer(actor,p[1],b);
      else if(method==='DELETE'&&p[0]==='families'&&p[2]==='members'&&p.length===4)data=await lifecycle.leave(actor,p[1],p[3]);

      else if(p[0]==='word-tutor-messages'&&p.length===3&&p[2]==='audio'&&method==='POST')data=await tutorSpeech.create(actor,p[1],b.accent,b.voice_id);
      else if(p[0]==='word-tutor-audio'&&p.length===3&&p[2]==='content'&&method==='GET'){const bytes=await tutorSpeech.content(actor,p[1]);res.setHeader('Content-Type','audio/mpeg');res.setHeader('X-Content-Type-Options','nosniff');return res.send(bytes);}
      else if(p[0]==='word-tutor-sessions'&&p.length===3&&p[2]==='images'&&method==='POST')data=await tutorImage.start(actor,p[1],b.request_id);
      else if(p[0]==='word-tutor-images'&&p.length===2&&method==='GET')data=await tutorImage.get(actor,p[1]);
      else if(p[0]==='word-tutor-images'&&p.length===3&&p[2]==='content'&&method==='GET'){const bytes=await tutorImage.content(actor,p[1]);res.setHeader('Content-Type','image/png');res.setHeader('X-Content-Type-Options','nosniff');return res.send(bytes);}
      else if(p[0]==='word-tutor-sessions'&&p.length===3&&p[2]==='search'&&method==='POST')data=await tutorSearch.search(actor,p[1],b.request_id,b.question);
      else if(p[0]==='word-tutor-sessions'&&p.length===3&&p[2]==='transcriptions'&&method==='POST')data=await tutorAsr.transcribe(actor,p[1],b.request_id,b.audio_base64);
      else if(p[0]==='word-tutor-sessions'&&p.length===3&&p[2]==='messages'&&method==='POST')data=await core.tutor.answer(actor,p[1],b.request_id,b.question);
      else if(p[0]==='word-tutor-sessions'&&p.length===2&&method==='GET')data=await core.tutor.get(actor,p[1]);
      else if(p[0]==='word-tutor-sessions'&&p.length===2&&method==='DELETE')data=await core.tutor.delete(actor,p[1]);
      else if(p[0]==='children'&&p[2]==='word-tutor-sessions'&&p.length===3&&method==='GET')data=await core.tutor.list(actor,p[1]);
      else if(p[0]==='children'&&p[2]==='word-tutor-sessions'&&p.length===3&&method==='POST')data=await core.tutor.open(actor,p[1],b.word_id);
      else if(method==='POST'&&p.join('/')==='voice-previews'){data=await core.audio.previews.create(actor,b);res.status(data.status==='succeeded'?200:202);}
      else if(method==='GET'&&p[0]==='voice-previews'&&p.length===2)data=await core.audio.previews.get(actor,p[1]);
      else if(method==='GET'&&p[0]==='voice-previews'&&p[2]==='content'&&p.length===3){const bytes=await core.audio.previews.content(actor,p[1]);res.setHeader('Content-Type','audio/mpeg');res.setHeader('X-Content-Type-Options','nosniff');return res.send(Buffer.from(bytes));}
      else if(method==='GET'&&p.join('/')==='me/audio-settings')data=await core.audioSettings(actor);
      else if(method==='PUT'&&p.join('/')==='me/audio-settings')data=await core.saveAudioSettings(actor,key,b);
      else if(method==='GET'&&p.join('/')==='voices')data=await core.audio.voices(req.query.accent);
      else if(method==='POST'&&p.join('/')==='audio'){data=await core.audio.create(actor,key,b);res.status(data.status==='succeeded'?200:202);}
      else if(method==='GET'&&p[0]==='jobs'&&p.length===2)data=await core.audio.get(actor,p[1]);
      else if(method==='POST'&&p[0]==='jobs'&&p[2]==='retry'&&p.length===3){data=await core.audio.retry(actor,key,p[1]);res.status(202);}
      else if(method==='GET'&&p[0]==='audio'&&p[2]==='content'&&p.length===3){const bytes=await core.audio.content(actor,p[1]);res.setHeader('Content-Type','audio/mpeg');res.setHeader('X-Content-Type-Options','nosniff');return res.send(Buffer.from(bytes));}
      else if(method==='GET'&&p[0]==='checkin-share-images'&&p.length===2)data=await core.checkinShare.imageStatus(actor,p[1]);
      else if(method==='GET'&&p[0]==='checkin-share-images'&&p[2]==='content'&&p.length===3){const image=await core.checkinShare.imageContent(actor,p[1]);res.setHeader('Content-Type',image.mime_type);res.setHeader('X-Content-Type-Options','nosniff');return res.send(Buffer.from(image.bytes));}
      else if(p[0]==='ai-batches'&&p.length===2&&method==='PUT')data=await core.vocabulary.replace(actor,key,p[1],b);
      else if(p[0]==='ai-batches'&&p.length===2&&method==='GET')data=await core.vocabulary.get(actor,p[1]);
      else if(p[0]==='ai-batches'&&p.length===3&&p[2]==='retry'&&method==='POST')data=await core.vocabulary.retry(actor,key,p[1]);
      else if(method==='GET'&&p.join('/')==='me')data=await core.me(actor);
      else if(method==='GET'&&p.join('/')==='textbook-volumes')data=await core.textbookVolumes(actor,req.query.child_id);
      else if(sharedBooksRead&&p.length===1)data=await core.searchSharedWordbooks(actor,req.query);
      else if(sharedBooksRead&&p.length===2)data=await core.sharedWordbook(actor,p[1]);
      else if(method==='POST'&&p.join('/')==='families')data=await core.createFamily(actor,key,b);
      else if(method==='GET'&&p[0]==='families'&&p[2]==='members'&&p.length===3)data=await core.members(actor,p[1]);
      else if(p[0]==='families'&&p[2]==='invites'&&p.length===3)data=method==='GET'?await core.invites(actor,p[1]):method==='POST'?await core.createInvite(actor,key,p[1]):undefined;
      else if(method==='POST'&&p.join('/')==='family-invites/claim')data=await core.claimInvite(actor,key,b);
      else if(method==='POST'&&p.join('/')==='family-invites/resolve')data=await core.resolveInvite(actor,b);
      else if(method==='POST'&&p[0]==='family-invites'&&p[2]==='approve'&&p.length===3)data=await core.approveInvite(actor,key,p[1]);
      else if(p[0]==='families'&&p[2]==='children'&&p.length===3){data=method==='GET'?await core.children(actor,p[1]):method==='POST'?await core.createChild(actor,key,p[1],b):undefined;}
      else if(method==='GET'&&p[0]==='children'&&p[2]==='words'&&p.length===4)data=await core.word(actor,p[1],p[3]);
      else if(p[0]==='children'&&p[2]==='wordbooks'&&p.length===4){if(method==='PATCH')data=await core.renameWordbook(actor,key,p[1],p[3],b);else if(method==='DELETE')data=await core.archiveWordbook(actor,key,p[1],p[3]);}
      else if(p[0]==='children'&&p[2]==='wordbooks'&&p.length===5&&p[4]==='share'&&method==='PUT')data=await core.shareWordbook(actor,key,p[1],p[3],b);
      else if(p[0]==='children'&&p[2]==='shared-wordbooks'&&p.length===5&&p[4]==='join'&&method==='POST')data=await core.joinSharedWordbook(actor,key,p[1],p[3]);
      else if(p[0]==='children'&&p[2]==='shared-wordbooks'&&p.length===5&&p[4]==='leave'&&method==='POST')data=await core.leaveSharedWordbook(actor,key,p[1],p[3]);
      else if(p[0]==='children'&&p[2]==='textbook-units'&&p.length===5&&p[4]==='join'&&method==='POST')data=await core.joinTextbookUnit(actor,key,p[1],p[3]);
      else if(p[0]==='children'&&p[2]==='textbook-volumes'&&p.length===5&&p[4]==='join'&&method==='POST')data=await core.joinTextbookVolume(actor,key,p[1],p[3]);
      else if(method==='GET'&&p[0]==='words'&&p[2]==='annotations'&&p.length===3)data=await core.wordAnnotations(actor,p[1]);
      else if(method==='PATCH'&&p[0]==='words'&&p[2]==='annotations'&&p.length===3)data=await core.patchWordAnnotations(actor,key,p[1],b);
      else if(p[0]==='children'&&p[2]==='monthly-quizzes'&&p[3]==='preview'&&p.length===4&&method==='GET')data=await core.quizzes.preview(actor,p[1],req.query.month,req.query.scope);
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
        if(method==='GET'&&p[2]==='textbook-units')data=await core.textbookUnits(actor,id);
        if(method==='POST'&&p[2]==='import-file')data=await core.imports.extract(actor,id,b);
        if(method==='POST'&&p[2]==='word-exports')data=await core.exportWords(actor,id,b);
        if(method==='POST'&&p[2]==='checkin-share')data=await core.checkinShare.create(actor,id,b);
        if(p[2]==='learning-goal')data=method==='GET'?await core.learningGoal(actor,id):method==='PUT'?await core.setLearningGoal(actor,key,id,b):undefined;
        if(p[2]==='ai-batches')data=method==='GET'?await core.vocabulary.list(actor,id):method==='POST'?await core.vocabulary.create(actor,key,id,b):undefined;
        if(p[2]==='monthly-quizzes')data=method==='GET'?await core.quizzes.list(actor,id,req.query):method==='POST'?await core.quizzes.create(actor,key,id,b):undefined;
        if(method==='POST'&&p[2]==='checkin-makeup')data=await core.useCheckinMakeup(actor,key,id,b);
        if(method==='GET'&&p[2]==='calendar')data=await core.history.calendar(actor,id,req.query.month,req.query.source);
        if(method==='GET'&&p[2]==='history-range')data=await core.history.range(actor,id,req.query);
        if(method==='GET'&&p[2]==='wrong-words')data=await core.history.wrongWords(actor,id,req.query);
        if(method==='GET'&&p[2]==='today')data=await core.today(actor,id,req.query.wordbook_id);
        if(p[2]==='wordbooks')data=method==='GET'?await core.wordbooks(actor,id):method==='POST'?await core.createWordbook(actor,key,id,b):undefined;
        if(method==='GET'&&p[2]==='words')data=await core.words(actor,id,req.query);
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
    }catch(e){const known=e instanceof DomainError,status=known?e.status:500,code=known?e.code:'INTERNAL_ERROR';if(status>=500)console.error(JSON.stringify({event:'api_failure',request_id,method:req.method,status,code}));res.status(status).json({request_id,error:{code,message:known?code:'请求未完成，请重试'}});}
  }
}
@Module({controllers:[ApiController]}) class AppModule{}
export async function createApplication(options:{vocabulary?:VocabularyProvider,audio?:AudioRuntime,encouragement?:EncouragementProvider,reader?:ImageReader,shareImages?:CheckinShareImageCache,aiFetch?:typeof fetch,paymentFetch?:typeof fetch}={}){
  const {db,source}=await connect(env.DATABASE_URL??'');
  const shareImages=options.shareImages??await checkinShareImageCache(env,db),runtime=options.audio??await audioRuntime(env);
  referralCodes=new ReferralCodeImage(env);accounts=new AiAccounts(db,env,options.aiFetch);payments=new AiPayments(db,accounts,env,options.paymentFetch);
  privacy=new Privacy(db,env);lifecycle=new Lifecycle(db,runtime,shareImages);shareImages?.setAuthorization((q,actor,scope)=>privacy.authorizePoster(q,actor,scope));
  core=new Core(db,development?new DevIdentity():new WechatIdentity(env.WECHAT_APP_ID??'',env.WECHAT_APP_SECRET??''),env.DICTIONARY_PROVIDER==='fixture'?new FixtureDictionary():new UnconfiguredDictionary(),await createScheduler(),env.WECHAT_APP_ID??'wxcf7d28bc513949d4',()=>new Date(),options.vocabulary,runtime,options.encouragement,options.reader,shareImages,(q,actor)=>privacy.assertConsent(q,actor),options.vocabulary?undefined:accounts);
  tutorImage=new TutorImage({tx:fn=>core.tutorTransaction(fn),child:(...args)=>core.tutorChild(...args)},env,options.aiFetch);
  tutorSearch=new TutorSearch({tx:fn=>core.tutorTransaction(fn),child:(...args)=>core.tutorChild(...args)},env,options.aiFetch);
  tutorSpeech=new TutorSpeech({tx:fn=>core.tutorTransaction(fn),child:(...args)=>core.tutorChild(...args)},runtime);
  tutorAsr=new TutorAsr({tx:fn=>core.tutorTransaction(fn),child:(...args)=>core.tutorChild(...args)},env,options.aiFetch);
  const app=await NestFactory.create<NestExpressApplication>(AppModule,{bodyParser:false,logger:['error','warn']});
  // Reject compressed bodies before decoding, including unauthenticated requests.
  app.use((req:Request,res:Response,next:any)=>{const encoding=req.headers['content-encoding'];if(encoding&&String(encoding).trim().toLowerCase()!=='identity')return res.status(415).json({error:{code:'CONTENT_ENCODING_UNSUPPORTED',message:'请发送未压缩的 JSON 请求'}});next();});
  // Larger bodies only on authenticated imports; all other JSON retains a small bound.
  app.use('/api/children/:child/import-file',async(req:Request,res:Response,next:any)=>{
    try{const auth=req.headers.authorization;ensure(auth?.startsWith('Bearer '),401,'UNAUTHENTICATED');await core.authenticate(auth!.slice(7));next();}catch{res.status(401).json({error:{code:'UNAUTHENTICATED'}});}
  });
  const importPath=(req:any)=>/^\/api\/children\/[^/]+\/(?:import-file|ai-batches)\/?$/.test(req.path)||req.method==='PUT'&&/^\/api\/ai-batches\/[^/]+\/?$/.test(req.path);
  app.useBodyParser('json',{limit:'6mb',inflate:false,type:importPath});
  app.useBodyParser('json',{limit:'1mb',inflate:false,type:(req:any)=>!importPath(req)&&req.is('application/json')});
  app.use((err:any,_req:Request,res:Response,next:any)=>{if(err?.type==='entity.too.large')return res.status(413).json({error:{code:'IMPORT_FILE_TOO_LARGE'}});if(err instanceof SyntaxError)return res.status(422).json({error:{code:'INVALID_REQUEST_BODY'}});next(err);});
  await app.init();
  const workers=startWorkers(core,accounts,payments,lifecycle);
  let disposing:Promise<void>|undefined;
  const dispose=()=>disposing??= (async()=>{
   workers.stop();
   // Stop accepting requests, finish outstanding jobs, then close the database exactly once.
   await app.close();await workers.drain();await tutorImage.drain();await source.destroy();
  })();
  return {app,dispose};
}
async function bootstrap(){
  const {app,dispose}=await createApplication();
  let shuttingDown=false;
  const shutdown=()=>{if(shuttingDown)return;shuttingDown=true;console.log('Stopping API; waiting for active work to finish…');void dispose().then(()=>process.exit(0),()=>process.exit(1));};
  process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
  try{
   await app.listen(Number(env.PORT??3000),development?'127.0.0.1':env.HOST??'127.0.0.1');
   console.log(`API ready at http://127.0.0.1:${env.PORT??3000}/api/health [0.1-audio] (${development?'development':'production'})`);
  }catch(e){process.removeListener('SIGINT',shutdown);process.removeListener('SIGTERM',shutdown);await dispose();throw e;}
}
if(require.main===module)bootstrap().catch(e=>{
 console.error(e?.code==='EADDRINUSE'?'Backend startup failed: port '+(env.PORT??3000)+' is already occupied. Stop the old server before restarting.':'Backend startup failed. Check database, credentials and installed dependencies.');
 process.exitCode=1;
});
