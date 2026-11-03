import {MAX_IMPORT_TEXT,MAX_IMPORT_WORDS} from './vocabulary-import.ts';
import {checkinShareSchema} from './generated/checkin-share.ts';
import {quizCreateSchema} from './generated/quiz-create.ts';
import {studySessionSchema} from './generated/study-session.ts';
import {wordAnnotationsSchema} from './generated/word-annotations.ts';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {ensure} from './errors.ts';
const ajv=new Ajv({allErrors:false,strict:true});addFormats(ajv);
const str=(maxLength:number)=>({type:'string',minLength:1,maxLength});
const id={type:'string',format:'uuid'},positive={type:'integer',minimum:1};
const object=(properties:any,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const schemas:Record<string,any>={
  tutorOpen:object({word_id:id}),
  tutorImage:object({request_id:id}),
  tutorSearch:object({request_id:id,question:str(1000)}),
  tutorSpeech:object({accent:{enum:['en-GB','en-US']},voice_id:str(100)}),
  tutorTranscription:object({request_id:id,audio_base64:str(800000)}),
  tutorAnswer:object({request_id:id,question:str(1000)},['request_id']),
  parentProfile:object({display_name:{type:'string',minLength:1,maxLength:40,pattern:'^[^\\u0000-\\u001f\\u007f]+$'},expected_version:positive,avatar_base64:{type:'string',minLength:1,maxLength:174764},avatar_mime:{enum:['image/jpeg','image/png']},remove_avatar:{type:'boolean'}},['display_name','expected_version']),
  aiSettings:object({capability:{enum:['text','vision']},family_id:id,mode:{enum:['system','byok']},model_id:str(60),custom_provider:{enum:['qwen','deepseek','openai']},custom_model:{type:'string',minLength:1,maxLength:120,pattern:'^[A-Za-z0-9][A-Za-z0-9._:/-]*$'},expected_version:{type:'integer',minimum:0},api_key:{type:'string',minLength:8,maxLength:512,pattern:'^[!-~]+$'},provider_consent:{const:true}},['mode','model_id','expected_version','provider_consent']),
  aiKeyDelete:object({expected_version:{type:'integer',minimum:0},capability:{enum:['text','vision']},family_id:id},['expected_version']),
  aiTest:object({capability:{enum:['text','vision']},family_id:id},[]),
  aiRecharge:object({family_id:id,product_id:str(64),code:str(512),platform:{enum:['ios','android','other']},request_id:{type:'string',minLength:8,maxLength:128,pattern:'^[a-zA-Z0-9_-]+$'}}),
  privacyConsent:object({policy_version:str(80),policy_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},guardian_confirmed:{const:true}}),
  confirmed:object({confirm:{const:true}}),
  deleteChild:object({confirm_nickname:str(40),expected_version:positive}),
  deleteFamily:object({confirm_name:str(40),expected_version:positive,confirm_data_deletion:{const:true}}),
  transferOwner:object({member_user_id:id,expected_version:positive}),
  importFile:object({name:str(120),base64:str(5592408),existing_text:{type:'string',maxLength:MAX_IMPORT_TEXT},theme:{type:'string',maxLength:80}},['name','base64']),
  exportWords:{oneOf:[object({word_ids:{type:'array',items:id,minItems:1,maxItems:10000,uniqueItems:true},wordbook_id:id},['word_ids']),object({all:{const:true},excluded_ids:{type:'array',items:id,maxItems:10000,uniqueItems:true},wordbook_id:id},['all'])]},
  checkinShare:checkinShareSchema,
  checkinMakeup:object({date:{type:'string',format:'date'}}),
  learningGoal:object({daily_goal:{type:'integer',minimum:1,maximum:500},expected_version:positive}),
  annotations:wordAnnotationsSchema,
  voicePreview:object({accent:{enum:['en-GB','en-US']},voice_id:str(100)}),
  audioSettings:object({accent:{enum:['en-GB','en-US']},voice_id:str(100),auto_play:{type:'boolean'},expected_version:positive},['accent','voice_id','expected_version']),
  audio:{oneOf:['word_id','sentence_id'].map(resource=>object({[resource]:id,content_version:positive,accent:{enum:['en-GB','en-US']},voice_id:str(100),speech_rate:{type:'number',minimum:0.5,maximum:1.5}}))},
  aiReplace:object({wordbook_id:id,raw_text:str(MAX_IMPORT_TEXT),source_type:{const:'text'},theme:{type:'string',maxLength:80},expected_attempts:{type:'integer',minimum:0}},['wordbook_id','raw_text','expected_attempts']),
  aiBatch:{oneOf:[object({wordbook_id:id,raw_text:str(MAX_IMPORT_TEXT),source_type:{enum:['text','vision']},prepared_items:{type:'array',minItems:1,maxItems:MAX_IMPORT_WORDS,items:{type:'object',additionalProperties:false,required:['input_index','input','status','lemma','part_of_speech','ipa_gb','ipa_us','meaning_zh','sentence_en','sentence_zh','reason'],properties:{input_index:{type:'integer',minimum:0,maximum:MAX_IMPORT_WORDS-1},input:str(120),status:{enum:['ok','invalid']},lemma:{type:['string','null'],maxLength:120},part_of_speech:{type:['string','null'],maxLength:80},ipa_gb:{type:['string','null'],maxLength:140},ipa_us:{type:['string','null'],maxLength:140},meaning_zh:{type:['string','null'],maxLength:500},sentence_en:{type:['string','null'],maxLength:1000},sentence_zh:{type:['string','null'],maxLength:1000},reason:{type:['string','null'],maxLength:500}}}},theme:{type:'string',maxLength:80}},['wordbook_id','raw_text']),object({wordbook_id:id,words:{type:'array',items:str(120),minItems:1,maxItems:MAX_IMPORT_WORDS},theme:{type:'string',maxLength:80}},['wordbook_id','words'])]},
  quizCreate:quizCreateSchema,
  quizVersion:object({expected_version:positive}),
  quizTakeover:object({expected_version:positive,expected_session_id:id,confirmed:{const:true}}),
  quizAnswer:{...object({selected_option_id:{anyOf:[{type:'string'},{type:'null'}]},flagged:{type:'boolean'},expected_version:positive,session_id:id,lease_generation:positive},['expected_version','session_id','lease_generation']),anyOf:[{properties:{selected_option_id:{}},required:['selected_option_id']},{properties:{flagged:{}},required:['flagged']}]},
  quizSubmit:object({expected_version:positive,confirm_unanswered:{type:'boolean'},session_id:id,lease_generation:positive}),
  login:object({code:str(512),management_only:{type:'boolean'},invite_code:{type:'string',minLength:6,maxLength:32,pattern:'^[a-zA-Z0-9_-]+$'}},['code']),family:object({name:str(40)}),child:object({nickname:str(40),accent:{enum:['en-US','en-GB']},school_grade:{type:'string',maxLength:24,pattern:'^[^\\u0000-\\u001f\\u007f]*$'},gender:{enum:['unspecified','girl','boy']}},['nickname']),book:object({name:str(60),grade:{type:'string',maxLength:40},textbook:{type:'string',maxLength:40},category:{type:'string',maxLength:40}},['name']),bookRename:object({name:str(60),grade:{type:'string',maxLength:40},textbook:{type:'string',maxLength:40},category:{type:'string',maxLength:40},expected_version:positive},['name','expected_version']),shareBook:object({published:{type:'boolean'},title:{type:'string',minLength:1,maxLength:60},description:{type:'string',maxLength:300},author:{type:'string',minLength:1,maxLength:60},target_level:{type:'string',maxLength:40}},['published']),
  batch:object({wordbook_id:id,words:{type:'array',items:str(120),minItems:1,maxItems:30},theme:{type:'string',maxLength:80}},['wordbook_id','words']),
  confirm:object({expected_version:positive,selections:{type:'array',minItems:1,maxItems:30,items:{oneOf:[object({item_id:id,action:{const:'select'},candidate_id:str(256)}),object({item_id:id,action:{const:'skip'}})]}}}),
  claim:object({invite_token:str(256)}),session:studySessionSchema,lease:object({lease_generation:positive}),empty:object({}),
  review:object({session_id:id,card_id:id,event_id:id,expected_version:positive,lease_generation:positive,rating:{enum:['again','hard','good','easy']},wordbook_id:id},['session_id','card_id','event_id','expected_version','lease_generation','rating'])
};
const validators=Object.fromEntries(Object.entries(schemas).map(([name,schema])=>[name,ajv.compile(schema)]));
export function validateBody(path:string[],method:string,body:unknown){
  if(!['POST','PUT','PATCH','DELETE'].includes(method))return;
  if(method==='DELETE'){const route=path.join('/');const kind=route==='me/ai-key'?'aiKeyDelete':route==='me'||route==='me/privacy-consent'?'confirmed':path[0]==='children'&&path.length===2?'deleteChild':path[0]==='families'&&path.length===2?'deleteFamily':'empty';ensure(validators[kind](body),422,'INVALID_REQUEST_BODY');return;}
  let kind='';const route=path.join('/');
  if(route==='me/profile')kind='parentProfile';
  else if(route==='me/ai-settings')kind='aiSettings';
  else if(route==='me/ai-test')kind='aiTest';
  else if(route==='me/ai-recharges')kind='aiRecharge';
  else if(route==='me/privacy-consent')kind='privacyConsent';
  else if(route==='auth/logout'||path[0]==='lifecycle-jobs'&&path[2]==='retry'||path[0]==='families'&&path[2]==='leave')kind='empty';
  else if(path[0]==='families'&&path[2]==='transfer-owner')kind='transferOwner';
  else if(['auth/dev','auth/wechat'].includes(route))kind='login';
  else if(route==='voice-previews')kind='voicePreview';
  else if(route==='me/audio-settings')kind='audioSettings';
  else if(route==='audio')kind='audio';
  else if(path[0]==='jobs'&&path[2]==='retry')kind='empty';
  else if(route==='families')kind='family';
  else if(route==='reviews')kind='review';
  else if(['family-invites/claim','family-invites/resolve'].includes(route))kind='claim';
  else if(path[0]==='families'&&path[2]==='children')kind='child';
  else if(path[0]==='families'&&path[2]==='invites'||path[0]==='family-invites'&&path[2]==='approve')kind='empty';
  else if(path[0]==='monthly-quizzes'){kind=path[2]==='items'&&path[4]==='answer'?'quizAnswer':path[2]==='submit'?'quizSubmit':path[2]==='takeover'?'quizTakeover':['resume','abandon'].includes(path[2])?'quizVersion':'';}
  else if(path[0]==='ai-batches'&&path.length===2&&method==='PUT')kind='aiReplace';
  else if(path[0]==='words'&&path[2]==='annotations'&&method==='PATCH')kind='annotations';
  else if(path[0]==='ai-batches'&&path[2]==='retry')kind='empty';
  else if(path[0]==='word-tutor-messages'&&path[2]==='audio')kind='tutorSpeech';
  else if(path[0]==='word-tutor-sessions'&&path[2]==='images')kind='tutorImage';
  else if(path[0]==='word-tutor-sessions'&&path[2]==='search')kind='tutorSearch';
  else if(path[0]==='word-tutor-sessions'&&path[2]==='transcriptions')kind='tutorTranscription';
  else if(path[0]==='word-tutor-sessions'&&path[2]==='messages')kind='tutorAnswer';
  else if(path[0]==='children'&&path[2]==='word-tutor-sessions')kind='tutorOpen';
  else if(path[0]==='children'&&path[2]==='monthly-quizzes')kind='quizCreate';
  else if(path[0]==='children'&&path[2]==='checkin-makeup'&&method==='POST')kind='checkinMakeup';
  else if(path[0]==='children'&&path[2]==='wordbooks'&&path.length===4&&method==='PATCH')kind='bookRename';
  else if(path[0]==='children'&&path[2]==='wordbooks'&&path.length===5&&path[4]==='share')kind='shareBook';
  else if(path[0]==='children'&&path[2]==='shared-wordbooks'&&path[4]==='join')kind='empty';
  else if(path[0]==='children'&&path[2]==='shared-wordbooks'&&path[4]==='leave')kind='empty';
  else if(path[0]==='children'&&path[2]==='textbook-units'&&path[4]==='join')kind='empty';
  else if(path[0]==='children'&&path[2]==='textbook-volumes'&&path[4]==='join')kind='empty';
  else if(path[0]==='children')kind=({'import-file':'importFile','word-exports':'exportWords','checkin-share':'checkinShare','learning-goal':'learningGoal',wordbooks:'book',batches:'batch','ai-batches':'aiBatch','study-sessions':'session'} as Record<string,string>)[path[2]];
  else if(path[0]==='batches'&&path[2]==='confirm')kind='confirm';
  else if(path[0]==='study-sessions'&&['heartbeat','end'].includes(path[2]))kind='lease';
  if(kind)ensure(validators[kind](body),422,'INVALID_REQUEST_BODY');
}
