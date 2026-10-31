import {mkdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {Database,Sql} from './ports';

export async function connect(url:string):Promise<{db:Database;source:{destroy():Promise<void>}}>{
  if(!url)throw Error('DATABASE_URL is required');
  if(url.startsWith('pglite:')){
    if(process.env.NODE_ENV!=='development'||process.env.AUTH_MODE!=='development')throw Error('Embedded database is only enabled for local development');
    const {PGlite}=await import('@electric-sql/pglite');
    const directory=resolve(__dirname,'../../..',url.slice('pglite:'.length));
    const localRoot=resolve(__dirname,'../../../.local');
    if(!directory.startsWith(localRoot+'/'))throw Error('Embedded database must be inside .local/');
    mkdirSync(directory,{recursive:true});
    const pg=new PGlite(directory);await pg.waitReady;
    const exists=await pg.query("SELECT 1 FROM information_schema.schemata WHERE schema_name='wordmate'");
    if(!exists.rows.length)await pg.exec(readFileSync(resolve(__dirname,'../../../deliverables/0.1/database/001_schema.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/002_audio.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/003_audio_preferences.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/004_voice_previews.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/005_audio_autoplay.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/006_checkin_shares.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/007_import_attempts.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/008_shared_wordbooks.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/009_child_profiles.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/010_checkin_share_images.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/011_checkin_poster_pool.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/012_checkin_makeup.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/013_referrals.sql'),'utf8'));
    await pg.exec(readFileSync(resolve(__dirname,'../migrations/014_release_fixes.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/015_privacy_lifecycle.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/016_security_integrity.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/017_ai_accounts.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/018_family_ai.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/019_parent_profiles.sql'),'utf8'));await pg.exec(readFileSync(resolve(__dirname,'../migrations/020_audio_billing.sql'),'utf8'));
    const db:Database={query:async(s,p)=>({rows:(await pg.query(s,p)).rows as any}),transaction:fn=>pg.transaction(tx=>fn({query:async(s,p)=>({rows:(await tx.query(s,p)).rows as any})}))};
    return {db,source:{destroy:()=>pg.close()}};
  }
  const {DataSource}=await import('typeorm');
  const source=new DataSource({type:'postgres',url,synchronize:false,logging:false,extra:{max:10}});await source.initialize();
  const wrap=(query:(s:string,p?:any[])=>Promise<any>):Sql=>({query:async(s,p)=>{const raw=await query(s,p);return {rows:Array.isArray(raw)&&raw.length===2&&Array.isArray(raw[0])&&typeof raw[1]==='number'?raw[0]:raw};}});
  return {source,db:{...wrap(source.query.bind(source)),transaction:fn=>source.transaction(manager=>fn(wrap(manager.query.bind(manager))))}};
}
