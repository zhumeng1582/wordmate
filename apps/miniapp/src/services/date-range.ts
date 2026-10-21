export type DateRange={start:string;end:string};
export function selectRange(range:DateRange,day:string):DateRange{
 if(!range.start||range.end)return {start:day,end:''};
 return day<range.start?{start:day,end:range.start}:{start:range.start,end:day};
}
export function monthDays(month:string){
 const first=new Date(`${month}-01T00:00:00Z`);
 return {offset:(first.getUTCDay()+6)%7,count:new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate()};
}
