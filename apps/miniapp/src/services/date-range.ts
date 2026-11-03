export type DateRange={start:string;end:string};
export function selectRange(range:DateRange,day:string):DateRange{
 if(!range.start||range.end)return {start:day,end:''};
 return day<range.start?{start:day,end:range.start}:{start:range.start,end:day};
}
export function monthDays(month:string){
 const first=new Date(`${month}-01T00:00:00Z`);
 return {offset:(first.getUTCDay()+6)%7,count:new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate()};
}
export function recentRange(today:string,days=7):DateRange{const start=new Date(Date.parse(`${today}T00:00:00Z`)-(days-1)*86400000).toISOString().slice(0,10);return {start:start<'2000-01-01'?'2000-01-01':start,end:today};}
export function rangeLabel(range:DateRange){return !range.start?'全部日期':!range.end?`${range.start} · 选择结束日期`:range.start===range.end?range.start:`${range.start} 至 ${range.end}`;}
