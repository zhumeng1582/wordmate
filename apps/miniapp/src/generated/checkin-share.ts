// Generated from contracts/checkin-share.json; run node scripts/generate-contracts.cjs.
export type CheckinShareRequest = {
  date: string;
  local_poster?: boolean;
};
export function checkinShareRequest(date:string,localPoster:boolean):CheckinShareRequest {
 return localPoster ? {date,local_poster:true} : {date};
}
