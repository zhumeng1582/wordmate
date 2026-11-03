import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import type {Database,Sql} from './ports.ts';

type Migration={name:string;version:number;sha256:string;sql:string};
type Applied={name:string;sha256:string};
export function readMigrations(directory=resolve(__dirname,'../migrations')):Migration[]{
 const entries=readdirSync(directory);
 const invalid=entries.filter(name=>name.toLowerCase().endsWith('.sql')&&!/^\d{3}_[a-z0-9_]+\.sql$/.test(name));
 if(invalid.length)throw Error(`Invalid migration filename: ${invalid.sort().join(', ')}`);
 const names=entries.filter(name=>/^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
 if(!names.length||!names[0].startsWith('002_'))throw Error('Migration sequence must begin with version 002');
 const files=names.map(name=>{const sql=readFileSync(join(directory,name),'utf8');return {name,version:Number(name.slice(0,3)),sql,sha256:createHash('sha256').update(sql).digest('hex')};});
 for(let i=1;i<files.length;i++)if(files[i].version!==files[i-1].version+1)throw Error('Migrations must have unique consecutive versions');
 return files;
}
export function migrationPlan(files:Migration[],applied:Applied[]){
 const byName=new Map(files.map(file=>[file.name,file]));
 for(const row of applied){const file=byName.get(row.name);if(!file)throw Error(`Applied migration missing from release: ${row.name}`);if(file.sha256!==row.sha256)throw Error(`Applied migration checksum changed: ${row.name}`);}
 const done=new Set(applied.map(row=>row.name));let pending=false;
 for(const file of files){if(!done.has(file.name))pending=true;else if(pending)throw Error(`Migration history has a gap before ${file.name}`);}
 return files.filter(file=>!done.has(file.name));
}
const tableExists=async(q:Sql)=>!!(await q.query("SELECT to_regclass('wordmate.schema_migrations') AS name")).rows[0]?.name;
const entries=async(q:Sql):Promise<Applied[]> => (await q.query('SELECT name,sha256 FROM wordmate.schema_migrations ORDER BY name')).rows as Applied[];
export async function migrationStatus(db:Database,files=readMigrations()){
 return db.transaction(async q=>{if(!await tableExists(q))return {tracked:false,applied:0,pending:files.map(f=>f.name)};const applied=await entries(q);return {tracked:true,applied:applied.length,pending:migrationPlan(files,applied).map(f=>f.name)};});
}
/** Only a human-verified existing database may be baselined; this never executes old SQL. */
export async function baselineMigrations(db:Database,through:number,files=readMigrations()){
 const baseline=files.filter(file=>file.version<=through);if(!baseline.length||baseline.at(-1)?.version!==through)throw Error('Baseline version does not exist');
 await db.transaction(async q=>{await q.query('SELECT pg_advisory_xact_lock($1)',[879466103]);if(await tableExists(q))throw Error('Migration history already exists');
  const schema=await q.query("SELECT 1 FROM information_schema.schemata WHERE schema_name='wordmate'");if(!schema.rows.length)throw Error('Existing wordmate schema required');
  await q.query('CREATE TABLE wordmate.schema_migrations (name text PRIMARY KEY,sha256 char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT now(),baseline boolean NOT NULL DEFAULT false)');
  for(const file of baseline)await q.query('INSERT INTO wordmate.schema_migrations(name,sha256,baseline) VALUES($1,$2,true)',[file.name,file.sha256]);
 });
}
export async function applyMigrations(db:Database,files=readMigrations()){
 return db.transaction(async q=>{await q.query('SELECT pg_advisory_xact_lock($1)',[879466103]);if(!await tableExists(q))throw Error('Migration history is missing; verify and baseline the existing schema first');
  const pending=migrationPlan(files,await entries(q));
  for(const file of pending){if(/^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/im.test(file.sql))throw Error(`Migration must not manage its own transaction: ${file.name}`);await q.query(file.sql);await q.query('INSERT INTO wordmate.schema_migrations(name,sha256) VALUES($1,$2)',[file.name,file.sha256]);}
  return pending.map(file=>file.name);
 });
}
