import {createHash} from 'node:crypto';
import type {Sql} from './ports.ts';
import {ensure} from './errors.ts';
export type UsageKind='audio'|'vocabulary';
// Same WeChat account keeps its rolling budget after deleting children or re-registering.
// Only a pseudonymous key, random resource IDs and counters are retained for about 48 hours by hourly maintenance.
export async function usageBudget(q:Sql,actor:string,child:string,kind:UsageKind,now:Date){
 const user=(await q.query("SELECT wx_app_id,wx_open_id FROM users WHERE id=$1 AND status='active' FOR UPDATE",[actor])).rows[0];
 ensure(user,401,'ACCOUNT_UNAVAILABLE');
 const key=createHash('sha256').update(`${user.wx_app_id}:${user.wx_open_id}`).digest('hex');
 const usage=(await q.query('SELECT count(*) FILTER(WHERE child_id=$1)::int child_count,count(*) FILTER(WHERE budget_key=$2)::int user_count FROM provider_usage_events WHERE kind=$3 AND created_at>$4 AND (child_id=$1 OR budget_key=$2)',[child,key,kind,new Date(now.getTime()-86400000)])).rows[0];
 return {child_count:Number(usage.child_count),user_count:Number(usage.user_count),key};
}
export async function recordUsage(q:Sql,kind:UsageKind,job:string,attempt:number,key:string,child:string,now:Date){
 await q.query('INSERT INTO provider_usage_events(kind,job_id,attempt,budget_key,child_id,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[kind,job,attempt,key,child,now]);
}
