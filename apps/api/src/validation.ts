import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {ensure} from './errors';
const ajv=new Ajv({allErrors:false,strict:true});addFormats(ajv);
const str=(maxLength:number)=>({type:'string',minLength:1,maxLength});
const id={type:'string',format:'uuid'},positive={type:'integer',minimum:1};
const object=(properties:any,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const schemas:Record<string,any>={
  voicePreview:object({accent:{enum:['en-GB','en-US']},voice_id:str(100)}),
  audioSettings:object({accent:{enum:['en-GB','en-US']},voice_id:str(100),expected_version:positive}),
  audio:{oneOf:['word_id','sentence_id'].map(resource=>object({[resource]:id,content_version:positive,accent:{enum:['en-GB','en-US']},voice_id:str(100),speech_rate:{type:'number',minimum:0.5,maximum:1.5}}))},
  aiReplace:object({wordbook_id:id,raw_text:str(8000),source_type:{const:'text'},theme:{type:'string',maxLength:80},expected_attempts:{type:'integer',minimum:0}},['wordbook_id','raw_text','expected_attempts']),
  aiBatch:{oneOf:[object({wordbook_id:id,raw_text:str(8000),source_type:{const:'text'},theme:{type:'string',maxLength:80}},['wordbook_id','raw_text']),object({wordbook_id:id,words:{type:'array',items:str(120),minItems:1,maxItems:30},theme:{type:'string',maxLength:80}},['wordbook_id','words'])]},
  quizCreate:object({month:{type:'string',pattern:'^\\d{4}-(0[1-9]|1[0-2])$'},mode:{enum:['sample','full']},sample_count:{type:'integer',enum:[10,20,30,50]}},['month','mode']),
  quizVersion:object({expected_version:positive}),
  quizTakeover:object({expected_version:positive,expected_session_id:id,confirmed:{const:true}}),
  quizAnswer:{...object({selected_option_id:{anyOf:[{type:'string'},{type:'null'}]},flagged:{type:'boolean'},expected_version:positive,session_id:id,lease_generation:positive},['expected_version','session_id','lease_generation']),anyOf:[{properties:{selected_option_id:{}},required:['selected_option_id']},{properties:{flagged:{}},required:['flagged']}]},
  quizSubmit:object({expected_version:positive,confirm_unanswered:{type:'boolean'},session_id:id,lease_generation:positive}),
  login:object({code:str(512)}),family:object({name:str(40)}),child:object({nickname:str(40),accent:{enum:['en-US','en-GB']}},['nickname']),book:object({name:str(60)}),
  batch:object({wordbook_id:id,words:{type:'array',items:str(120),minItems:1,maxItems:30},theme:{type:'string',maxLength:80}},['wordbook_id','words']),
  confirm:object({expected_version:positive,selections:{type:'array',minItems:1,maxItems:30,items:{oneOf:[object({item_id:id,action:{const:'select'},candidate_id:str(256)}),object({item_id:id,action:{const:'skip'}})]}}}),
  claim:object({invite_token:str(256)}),session:{oneOf:[object({source:{const:'scheduled'}}),object({source:{const:'calendar'},date:{type:'string',format:'date'}}),object({source:{const:'manual'},word_ids:{type:'array',items:id,minItems:1,maxItems:100,uniqueItems:true}}),object({source:{const:'quiz'},quiz_id:id})]},lease:object({lease_generation:positive}),empty:object({}),
  review:object({session_id:id,card_id:id,event_id:id,expected_version:positive,lease_generation:positive,rating:{enum:['again','hard','good','easy']}})
};
const validators=Object.fromEntries(Object.entries(schemas).map(([name,schema])=>[name,ajv.compile(schema)]));
export function validateBody(path:string[],method:string,body:unknown){
  if(!['POST','PUT'].includes(method))return;
  let kind='';const route=path.join('/');
  if(['auth/dev','auth/wechat'].includes(route))kind='login';
  else if(route==='voice-previews')kind='voicePreview';
  else if(route==='me/audio-settings')kind='audioSettings';
  else if(route==='audio')kind='audio';
  else if(path[0]==='jobs'&&path[2]==='retry')kind='empty';
  else if(route==='families')kind='family';
  else if(route==='reviews')kind='review';
  else if(route==='family-invites/claim')kind='claim';
  else if(path[0]==='families'&&path[2]==='children')kind='child';
  else if(path[0]==='families'&&path[2]==='invites'||path[0]==='family-invites'&&path[2]==='approve')kind='empty';
  else if(path[0]==='monthly-quizzes'){kind=path[2]==='items'&&path[4]==='answer'?'quizAnswer':path[2]==='submit'?'quizSubmit':path[2]==='takeover'?'quizTakeover':['resume','abandon'].includes(path[2])?'quizVersion':'';}
  else if(path[0]==='ai-batches'&&path.length===2&&method==='PUT')kind='aiReplace';
  else if(path[0]==='ai-batches'&&path[2]==='retry')kind='empty';
  else if(path[0]==='children'&&path[2]==='monthly-quizzes')kind='quizCreate';
  else if(path[0]==='children')kind=({wordbooks:'book',batches:'batch','ai-batches':'aiBatch','study-sessions':'session'} as Record<string,string>)[path[2]];
  else if(path[0]==='batches'&&path[2]==='confirm')kind='confirm';
  else if(path[0]==='study-sessions'&&['heartbeat','end'].includes(path[2]))kind='lease';
  if(kind)ensure(validators[kind](body),422,'INVALID_REQUEST_BODY');
}
