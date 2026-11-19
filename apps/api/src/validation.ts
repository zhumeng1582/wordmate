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
const poemImportFields=Object.fromEntries(Object.entries({title:100,author:100,dynasty:40,body:1000,genre:80,annotations:3000,translation:3000,background:3000,source:200,notes:3000,pinyin:3000}).map(([name,maxLength])=>[name,{type:'string',maxLength}]));
const poemImportItems={type:'array',minItems:1,maxItems:300,items:object({...poemImportFields,title:str(100),body:str(1000)},['title','body'])};
const poemReviewBatch={type:'array',maxItems:2000,items:object({draft:object(poemImportFields,['title','author','dynasty','body']),key:str(100),saved:{type:'boolean'},locked:{type:'boolean'},issues:{type:'array',maxItems:6,items:{type:'string',maxLength:180}},issuesReviewed:{type:'boolean'}},['draft','key','saved','locked'])};
const poemReviewGeneration={type:'integer',minimum:0};
const schemas:Record<string,any>={
  sentenceSave:object({book_id:id,reviewed:{type:'boolean'},items:{type:'array',minItems:1,maxItems:300,items:object({text_en:str(1000),translation_zh:str(1000),source_index:{type:'integer',minimum:0,maximum:299},reviewed:{type:'boolean'}},['text_en','translation_zh'])}},['items']),
  sentenceImport:object({id,book_id:id,raw_text:str(12000)},['id','raw_text']),
  sentenceUpdate:object({text_en:str(1000),translation_zh:str(1000),notes:{type:'string',maxLength:1000},favorite:{type:'boolean'},archived:{type:'boolean'},expected_version:positive},['expected_version']),
  sentenceGoal:object({daily_goal:{type:'integer',minimum:1,maximum:100},expected_version:{type:'integer',minimum:0}}),
  sentenceRound:object({source:{enum:['new','review','favorite','wrong','history']},book_id:id,date:{type:'string',format:'date'},date_from:{type:'string',format:'date'},date_to:{type:'string',format:'date'}},['source']),
  sentenceLease:object({lease_id:id}),
  sentenceReveal:object({lease_id:id,ordinal:positive}),
  sentenceAnswer:object({lease_id:id,ordinal:positive,event_id:id,rating:{enum:['again','hard','good']}}),

  libraryCheckin:object({kind:{enum:['poems','hanzi']},item_id:id}),
  archiveMark:object({archived:{type:'boolean'},expected_version:positive}),
  hanziCopybook:object({ids:{type:'array',minItems:1,maxItems:300,uniqueItems:true,items:id}}),
  hanziImport:object({id,name:str(120),base64:str(13981016),book_id:id},['id','name','base64']),
  hanziBatch:object({characters:{type:'array',minItems:1,maxItems:300,items:str(4)},job_id:id,book_id:id},['characters']),
  hanzi:object({character:str(4),pinyin:{type:'string',maxLength:200},radical:{type:'string',maxLength:20},strokes:{type:['integer','null'],minimum:1,maximum:100},meaning:{type:'string',maxLength:2000},words:{type:'string',maxLength:1000},example:{type:'string',maxLength:1000},tags:{type:'string',maxLength:200},notes:{type:'string',maxLength:1000},expected_version:positive,book_id:id},['character']),
  hanziMark:object({important:{type:'boolean'},expected_version:positive},['important','expected_version']),
  poem:object({title:str(100),author:{type:'string',maxLength:100},dynasty:{type:'string',maxLength:40},body:str(1000),genre:{type:'string',maxLength:80},annotations:{type:'string',maxLength:3000},translation:{type:'string',maxLength:3000},background:{type:'string',maxLength:3000},source:{type:'string',maxLength:200},notes:{type:'string',maxLength:3000},pinyin:{type:'string',maxLength:3000},expected_version:positive,reset_memorized:{type:'boolean'},book_id:id},['title','body']),
  poemImport:{oneOf:[object({id,raw_text:str(MAX_IMPORT_TEXT),book_id:id},['id','raw_text']),object({id,name:str(120),base64:str(13981016),book_id:id},['id','name','base64'])]},
  poemImportSave:{oneOf:[object({items:poemImportItems}),object({items:poemImportItems,request_id:id,expected_batch:poemReviewGeneration,remaining_batch:poemReviewBatch})]},
  poemImportDraft:object({batch:poemReviewBatch,expected_batch:poemReviewGeneration}),
  poemAnalyze:object({request_id:id,text:str(6000)}),
  hanziPinyin:object({request_id:id}),
  contentRepair:object({kind:{enum:['words','sentences','poems','hanzi']},target_id:id,issue:str(40),description:{type:'string',maxLength:500},expected_version:positive,identity_confirmed:{type:'boolean'},accent:{enum:['en-GB','en-US']},voice_id:str(100)},['kind','target_id','issue','expected_version']),
  favoriteMark:object({favorite:{type:'boolean'},expected_version:positive}),
  poemMark:object({memorized:{type:'boolean'},expected_version:positive}),
  assistantAnswer:object({request_id:id,question:str(1000),action:{enum:['auto','summary','article','rewrite','quiz','mistakes','practice','quiz_answer']},days:{enum:[1,7,30]},source:{enum:['studied','mistakes']},date_from:{type:'string',format:'date'},date_to:{type:'string',format:'date'},quiz_id:id,index:{type:'integer',minimum:0,maximum:2},choice:{type:'integer',minimum:0,maximum:2}},['request_id','question']),
  tutorOpen:object({word_id:id}),
  tutorImage:object({request_id:id}),
  tutorSearch:object({request_id:id,question:str(1000)}),
  tutorSpeech:object({accent:{enum:['en-GB','en-US']},voice_id:str(100),part:{enum:['example']}},['accent','voice_id']),
  tutorTranscription:object({request_id:id,audio_base64:str(800000)}),
  tutorAnswer:object({request_id:id,question:str(1000),use_school_grade:{type:'boolean'},exercise_answer:{type:'boolean'}},['request_id']),
  tutorLearningEvent:object({event_id:id,kind:{enum:['lesson_opened','exercise_started','exercise_answered','exercise_completed','feedback_wrong','feedback_hard','feedback_unnatural']},message_id:id},['event_id','kind']),
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
  importFile:object({name:str(120),base64:str(13981016),existing_text:{type:'string',maxLength:MAX_IMPORT_TEXT},theme:{type:'string',maxLength:80},purpose:{enum:['poem','sentence']}},['name','base64']),
  exportWords:{oneOf:[object({word_ids:{type:'array',items:id,minItems:1,maxItems:10000,uniqueItems:true},format:{enum:['list','copybook']},wordbook_id:id,status:{enum:['all','unlearned','learned','archived','unlearned,learned','unlearned,archived','learned,archived','unlearned,learned,archived']}},['word_ids']),object({all:{const:true},excluded_ids:{type:'array',items:id,maxItems:10000,uniqueItems:true},format:{enum:['list','copybook']},wordbook_id:id,status:{enum:['all','unlearned','learned','archived','unlearned,learned','unlearned,archived','learned,archived','unlearned,learned,archived']}},['all'])]},
  checkinShare:checkinShareSchema,
  checkinMakeup:object({date:{type:'string',format:'date'}}),
  learningGoal:object({daily_goal:{type:'integer',minimum:1,maximum:500},expected_version:positive}),
  hanziRoundCreate:object({source:{enum:['new','review','important','wrong','history']},ids:{type:'array',items:id,minItems:1,maxItems:5000,uniqueItems:true},book_id:id},['source','ids']),
  hanziRoundAnswer:object({ordinal:positive,action:{enum:['learn','review','skip']},correct:{type:'boolean'},event_id:id,lease_id:id,lease_generation:positive},['ordinal','action','event_id','lease_id','lease_generation']),
  hanziGoal:object({daily_goal:{type:'integer',minimum:1,maximum:500},expected_version:{type:'integer',minimum:0}}),
  hanziLearningEvent:object({event_id:id,hanzi_id:id,kind:{enum:['learn','review','test']},correct:{type:'boolean'}},['event_id','hanzi_id','kind']),
  hanziQuizCreate:object({month:{type:'string',pattern:'^\\d{4}-(0[1-9]|1[0-2])$'},mode:{enum:['sample','full']},sample_count:{enum:[10,20,30,50]},book_id:id},['month','mode']),
  hanziQuizAnswer:object({answer:str(100),expected_version:positive,lease_id:id,lease_generation:positive}),
  hanziQuizSubmit:object({expected_version:positive,confirm_unanswered:{type:'boolean'},lease_id:id,lease_generation:positive},['expected_version','lease_id','lease_generation']),
  hanziQuizAbandon:object({expected_version:positive,lease_id:id,lease_generation:positive}),
  hanziQuizLease:object({lease_id:id,lease_generation:positive}),
  annotations:wordAnnotationsSchema,
  voicePreview:object({accent:{enum:['en-GB','en-US']},voice_id:str(100)}),
  audioSettings:object({accent:{enum:['en-GB','en-US']},voice_id:str(100),auto_play:{type:'boolean'},expected_version:positive},['accent','voice_id','expected_version']),
  audio:{oneOf:['word_id','sentence_id'].map(resource=>object({[resource]:id,content_version:positive,accent:{enum:['en-GB','en-US']},voice_id:str(100),speech_rate:{type:'number',minimum:0.5,maximum:1.5}}))},
  wordFeedback:object({kind:{enum:['pronunciation','spelling','translation','example','example_pronunciation']},word_version:positive,sentence_id:id,sentence_version:positive,audio_id:id},['kind','word_version']),
  aiReplace:object({review_before_save:{type:'boolean'},wordbook_id:id,raw_text:str(MAX_IMPORT_TEXT),source_type:{const:'text'},theme:{type:'string',maxLength:80},expected_attempts:{type:'integer',minimum:0}},['wordbook_id','raw_text','expected_attempts']),
  aiBatch:{oneOf:[object({review_before_save:{type:'boolean'},wordbook_id:id,raw_text:str(MAX_IMPORT_TEXT),source_type:{enum:['text','vision']},prepared_items:{type:'array',minItems:1,maxItems:MAX_IMPORT_WORDS,items:{type:'object',additionalProperties:false,required:['input_index','input','status','lemma','part_of_speech','ipa_gb','ipa_us','meaning_zh','sentence_en','sentence_zh','reason'],properties:{input_index:{type:'integer',minimum:0,maximum:MAX_IMPORT_WORDS-1},input:str(120),status:{enum:['ok','invalid']},lemma:{type:['string','null'],maxLength:120},part_of_speech:{type:['string','null'],maxLength:80},ipa_gb:{type:['string','null'],maxLength:140},ipa_us:{type:['string','null'],maxLength:140},meaning_zh:{type:['string','null'],maxLength:500},sentence_en:{type:['string','null'],maxLength:1000},sentence_zh:{type:['string','null'],maxLength:1000},reason:{type:['string','null'],maxLength:500}}}},theme:{type:'string',maxLength:80}},['wordbook_id','raw_text']),object({wordbook_id:id,words:{type:'array',items:str(120),minItems:1,maxItems:MAX_IMPORT_WORDS},theme:{type:'string',maxLength:80}},['wordbook_id','words'])]},
  vocabularyConfirm:object({decisions:{type:'array',minItems:1,maxItems:30,items:object({item_id:id,selected:{type:'boolean'},correction:object({meaning_zh:str(500),sentence_en:str(1000),sentence_zh:str(1000)})},['item_id','selected'])}}),
  quizCreate:quizCreateSchema,
  quizVersion:object({expected_version:positive}),
  quizTakeover:object({expected_version:positive,expected_session_id:id,confirmed:{const:true}}),
  quizAnswer:{...object({selected_option_id:{anyOf:[{type:'string'},{type:'null'}]},flagged:{type:'boolean'},expected_version:positive,session_id:id,lease_generation:positive},['expected_version','session_id','lease_generation']),anyOf:[{properties:{selected_option_id:{}},required:['selected_option_id']},{properties:{flagged:{}},required:['flagged']}]},
  quizSubmit:object({expected_version:positive,confirm_unanswered:{type:'boolean'},session_id:id,lease_generation:positive}),
  login:object({code:str(512),management_only:{type:'boolean'},invite_code:{type:'string',minLength:6,maxLength:32,pattern:'^[a-zA-Z0-9_-]+$'}},['code']),family:object({name:str(40)}),child:object({nickname:str(40),accent:{enum:['en-US','en-GB']},school_grade:{type:'string',maxLength:24,pattern:'^[^\\u0000-\\u001f\\u007f]*$'},gender:{enum:['unspecified','girl','boy']}},['nickname']),book:object({name:str(60),grade:{type:'string',maxLength:40},textbook:{type:'string',maxLength:40},category:{type:'string',maxLength:40}},['name']),bookRename:object({name:str(60),grade:{type:'string',maxLength:40},textbook:{type:'string',maxLength:40},category:{type:'string',maxLength:40},expected_version:positive},['name','expected_version']),shareBook:object({published:{type:'boolean'},title:{type:'string',minLength:1,maxLength:60},description:{type:'string',maxLength:300},author:{type:'string',minLength:1,maxLength:60},target_level:{type:'string',maxLength:40}},['published']),
  batch:object({wordbook_id:id,words:{type:'array',items:str(120),minItems:1,maxItems:30},theme:{type:'string',maxLength:80}},['wordbook_id','words']),
  confirm:object({expected_version:positive,selections:{type:'array',minItems:1,maxItems:30,items:{oneOf:[object({item_id:id,action:{const:'select'},candidate_id:str(256)}),object({item_id:id,action:{const:'skip'}})]}}}),
  childUpdate:object({nickname:str(40),school_grade:{type:'string',maxLength:24},gender:{enum:['unspecified','girl','boy']},expected_version:positive}),
  claim:object({invite_token:str(256)}),session:studySessionSchema,lease:object({lease_generation:positive}),empty:object({}),
  review:object({session_id:id,card_id:id,event_id:id,expected_version:positive,lease_generation:positive,rating:{enum:['again','hard','good','easy']},wordbook_id:id},['session_id','card_id','event_id','expected_version','lease_generation','rating'])
};
const validators=Object.fromEntries(Object.entries(schemas).map(([name,schema])=>[name,ajv.compile(schema)]));
export function validateBody(path:string[],method:string,body:unknown){
  if(!['POST','PUT','PATCH','DELETE'].includes(method))return;
  if(method==='DELETE'){const route=path.join('/');const kind=route==='me/ai-key'?'aiKeyDelete':route==='me'||route==='me/privacy-consent'?'confirmed':path[0]==='children'&&path.length===2?'deleteChild':path[0]==='families'&&path.length===2?'deleteFamily':'empty';ensure(validators[kind](body),422,'INVALID_REQUEST_BODY');return;}
  let kind='';const route=path.join('/');
  if(path[0]==='children'&&path[2]==='content-repairs')kind=path.length===3?'contentRepair':'empty';
  else if(path[0]==='children'&&['hanzi','poems'].includes(path[2])&&path.length===5&&path[4]==='favorite')kind='favoriteMark';
  else if(path[0]==='children'&&['hanzi','poems','words'].includes(path[2])&&path.length===5&&path[4]==='archive')kind='archiveMark';
  else if(path[0]==='children'&&['hanzi-books','poem-books'].includes(path[2]))kind=path[4]==='share'?'shareBook':path.length===3?'book':'bookRename';
  else if(path[0]==='children'&&['shared-hanzi-books','shared-poem-books'].includes(path[2]))kind='empty';
  else if(path[0]==='children'&&path[2]==='hanzi'){kind=path[4]==='sessions'?(path[6]==='messages'?'tutorAnswer':path[6]==='transcriptions'?'tutorTranscription':'empty'):path[3]==='imports'?(path.length===4?'hanziImport':'empty'):path[3]==='copybook'?'hanziCopybook':path[3]==='batch'?'hanziBatch':path[3]==='analyze'?'poemAnalyze':['pinyin','words'].includes(path[4])?'hanziPinyin':path[4]==='mark'?'hanziMark':path[4]==='audio'?'empty':'hanzi';}
  else if(path[0]==='children'&&path[2]==='poems'){kind=path[4]==='sessions'?(path[6]==='messages'?'tutorAnswer':path[6]==='transcriptions'?'tutorTranscription':'empty'):path[3]==='imports'?(path.length===4?'poemImport':path[5]==='save'?'poemImportSave':path[5]==='draft'?'poemImportDraft':'empty'):path.length===3?'poem':path.length===4&&path[3]==='analyze'?'poemAnalyze':path.length===4?'poem':path[4]==='memorization'?'poemMark':path[4]==='sessions'&&path[6]==='messages'?'tutorAnswer':'empty';}
  else if(route==='me/profile')kind='parentProfile';
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
  else if(path[0]==='children'&&path.length===2&&method==='PATCH')kind='childUpdate';
  else if(path[0]==='families'&&path[2]==='children')kind='child';
  else if(path[0]==='families'&&path[2]==='invites'||path[0]==='family-invites'&&['approve','reject','revoke','cancel'].includes(path[2]))kind='empty';
  else if(path[0]==='monthly-quizzes'){kind=path[2]==='items'&&path[4]==='answer'?'quizAnswer':path[2]==='submit'?'quizSubmit':path[2]==='takeover'?'quizTakeover':['resume','abandon'].includes(path[2])?'quizVersion':'';}
  else if(path[0]==='ai-batches'&&path.length===2&&method==='PUT')kind='aiReplace';
  else if(path[0]==='words'&&path[2]==='annotations'&&method==='PATCH')kind='annotations';
  else if(path[0]==='ai-batches'&&path[2]==='confirm')kind='vocabularyConfirm';
  else if(path[0]==='audio'&&path.length===3&&path[2]==='feedback')kind='empty';
  else if(path[0]==='words'&&path.length===3&&path[2]==='feedback')kind='wordFeedback';
  else if(path[0]==='ai-batches'&&['retry','cancel'].includes(path[2]))kind='empty';
  else if(path[0]==='children'&&path[2]==='sentence-books')kind=path[4]==='share'?'shareBook':method==='POST'?'book':method==='PATCH'?'bookRename':'';
  else if(path[0]==='children'&&path[2]==='shared-sentence-books')kind='empty';
  else if(path[0]==='children'&&path[2]==='sentence-progress')kind='sentenceGoal';
  else if(path[0]==='children'&&path[2]==='sentence-checkin-makeup')kind='checkinMakeup';
  else if(path[0]==='children'&&path[2]==='sentence-study-rounds')kind=path.length===3?'sentenceRound':path[4]==='reveal'?'sentenceReveal':path[4]==='answer'?'sentenceAnswer':'sentenceLease';
  else if(path[0]==='children'&&path[2]==='sentences')kind=path[3]==='save'?'sentenceSave':path[3]==='imports'?path.length===4?'sentenceImport':path[5]==='save'?'sentenceSave':'empty':'sentenceUpdate';
  else if(path[0]==='children'&&path[2]==='learning-assistant-sessions')kind='empty';
  else if(path[0]==='learning-assistant-sessions'&&path[2]==='messages')kind='assistantAnswer';
  else if(path[0]==='learning-assistant-messages'&&path[2]==='audio')kind='tutorSpeech';
  else if(path[0]==='word-tutor-messages'&&path[2]==='audio')kind='tutorSpeech';
  else if(path[0]==='word-tutor-sessions'&&path[2]==='images')kind='tutorImage';
  else if(path[0]==='word-tutor-sessions'&&path[2]==='search')kind='tutorSearch';
  else if(path[0]==='word-tutor-sessions'&&path[2]==='transcriptions')kind='tutorTranscription';
  else if(path[0]==='word-tutor-sessions'&&path[2]==='adopt')kind='empty';
  else if(path[0]==='word-tutor-sessions'&&path[2]==='agent')kind='assistantAnswer';
  else if(path[0]==='word-tutor-sessions'&&path[2]==='messages')kind='tutorAnswer';
  else if(path[0]==='word-tutor-sessions'&&path[2]==='learning-events')kind='tutorLearningEvent';
  else if(path[0]==='children'&&path[2]==='word-tutor-sessions')kind='tutorOpen';
  else if(path[0]==='children'&&path[2]==='monthly-quizzes')kind='quizCreate';
  else if(path[0]==='children'&&path[2]==='library-checkins')kind='libraryCheckin';
  else if(path[0]==='children'&&path[2]==='hanzi-study-rounds')kind=path.length===3?'hanziRoundCreate':path[4]==='answer'?'hanziRoundAnswer':path[4]==='takeover'?'quizTakeover':path[4]==='resume'?'quizVersion':'hanziQuizLease';
  else if(path[0]==='children'&&path[2]==='hanzi-progress')kind='hanziGoal';
  else if(path[0]==='children'&&path[2]==='hanzi-learning-events')kind='hanziLearningEvent';
  else if(path[0]==='children'&&path[2]==='hanzi-monthly-quizzes')kind=path.length===3?'hanziQuizCreate':path[4]==='items'&&path[6]==='answer'?'hanziQuizAnswer':path[4]==='submit'?'hanziQuizSubmit':path[4]==='abandon'?'hanziQuizAbandon':['heartbeat','end'].includes(path[4])?'hanziQuizLease':path[4]==='takeover'?'quizTakeover':'quizVersion';
  else if(path[0]==='children'&&path[2]==='checkin-makeup'&&method==='POST')kind='checkinMakeup';
  else if(path[0]==='children'&&path[2]==='hanzi-checkin-makeup'&&method==='POST')kind='checkinMakeup';
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
