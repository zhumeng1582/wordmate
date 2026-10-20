import {DataSource} from 'typeorm';
import type {Database,Sql} from './ports';
export async function connect(url:string):Promise<{db:Database;source:DataSource}>{
  if(!url)throw Error('DATABASE_URL is required');
  const source=new DataSource({type:'postgres',url,synchronize:false,logging:false,extra:{max:10}});await source.initialize();
  const wrap=(query:(s:string,p?:any[])=>Promise<any>):Sql=>({query:async(s,p)=>({rows:await query(s,p)})});
  return {source,db:{...wrap(source.query.bind(source)),transaction:fn=>source.transaction(manager=>fn(wrap(manager.query.bind(manager))))}};
}
