const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const contracts=[{file:'checkin-share',symbol:'checkinShare',type:'CheckinShareRequest'},{file:'quiz-create',symbol:'quizCreate',type:'QuizCreateRequest'},{file:'word-annotations',symbol:'wordAnnotations',type:'WordAnnotationsRequest'},{file:'study-session',symbol:'studySession',type:'StudySessionRequest'}];
const outputs={};
for(const contract of contracts){
 const schema=JSON.parse(fs.readFileSync(path.join(root,`contracts/${contract.file}.json`),'utf8'));
 const tsType=(property,indent=0)=>{
  if(property.oneOf)return property.oneOf.map(item=>tsType(item,indent)).join(' | ');
  if(Object.hasOwn(property,'const'))return JSON.stringify(property.const);
  if(property.enum)return property.enum.map(value=>JSON.stringify(value)).join(' | ');
  if(property.type==='array')return `Array<${tsType(property.items,indent)}>`;
  if(property.type==='object'){
   const pad=' '.repeat(indent+2),end=' '.repeat(indent);
   const fields=Object.entries(property.properties).map(([name,value])=>`${pad}${name}${property.required.includes(name)?'':'?'}: ${tsType(value,indent+2)};`).join('\n');
   return `{\n${fields}\n${end}}`;
  }
  const type=({string:'string',boolean:'boolean',integer:'number',number:'number'})[property.type];
  if(!type)throw Error('Unsupported contract type');return type;
 };
 const header=`// Generated from contracts/${contract.file}.json; run node scripts/generate-contracts.cjs.\n`;
 outputs[`apps/api/src/generated/${contract.file}.ts`]=`${header}export const ${contract.symbol}Schema = ${JSON.stringify(schema,null,2)} as const;\n`;
 outputs[`apps/miniapp/src/generated/${contract.file}.ts`]=`${header}export type ${contract.type} = ${tsType(schema)};\n`+(contract.file==='checkin-share'?`export function checkinShareRequest(date:string,localPoster:boolean):CheckinShareRequest {\n return localPoster ? {date,local_poster:true} : {date};\n}\n`:'');
}
const check=process.argv.includes('--check');let stale=false;
for(const [file,content] of Object.entries(outputs)){const target=path.join(root,file);if(check){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==content){console.error(`Contract output is stale: ${file}`);stale=true;}}else{fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);}}
if(stale)process.exitCode=1;
