import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {ensure} from './errors';
const ajv=new Ajv({allErrors:false,strict:true});addFormats(ajv);
const str=(maxLength:number)=>({type:'string',minLength:1,maxLength});
const id={type:'string',format:'uuid'},positive={type:'integer',minimum:1};
const object=(properties:any,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const schemas:Record<string,any>={
  login:object({code:str(512)}),family:object({name:str(40)}),child:object({nickname:str(40),accent:{enum:['en-US','en-GB']}},['nickname']),book:object({name:str(60)}),
  batch:object({wordbook_id:id,words:{type:'array',items:str(120),minItems:1,maxItems:30},theme:{type:'string',maxLength:80}},['wordbook_id','words']),
  confirm:object({expected_version:positive,selections:{type:'array',minItems:1,maxItems:30,items:{oneOf:[object({item_id:id,action:{const:'select'},candidate_id:str(256)}),object({item_id:id,action:{const:'skip'}})]}}}),
  claim:object({invite_token:str(256)}),session:object({source:{const:'scheduled'}}),lease:object({lease_generation:positive}),empty:object({}),
  review:object({session_id:id,card_id:id,event_id:id,expected_version:positive,lease_generation:positive,rating:{enum:['again','hard','good','easy']}})
};
const validators=Object.fromEntries(Object.entries(schemas).map(([name,schema])=>[name,ajv.compile(schema)]));
export function validateBody(path:string[],method:string,body:unknown){
  if(method!=='POST')return;
  let kind='';const route=path.join('/');
  if(['auth/dev','auth/wechat'].includes(route))kind='login';
  else if(route==='families')kind='family';
  else if(route==='reviews')kind='review';
  else if(route==='family-invites/claim')kind='claim';
  else if(path[0]==='families'&&path[2]==='children')kind='child';
  else if(path[0]==='families'&&path[2]==='invites'||path[0]==='family-invites'&&path[2]==='approve')kind='empty';
  else if(path[0]==='children')kind=({wordbooks:'book',batches:'batch','study-sessions':'session'} as Record<string,string>)[path[2]];
  else if(path[0]==='batches'&&path[2]==='confirm')kind='confirm';
  else if(path[0]==='study-sessions'&&['heartbeat','end'].includes(path[2]))kind='lease';
  if(kind)ensure(validators[kind](body),422,'INVALID_REQUEST_BODY');
}
