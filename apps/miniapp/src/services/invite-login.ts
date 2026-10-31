// A login-and-join action is acknowledged only after successful consent.
// Keep this in memory: reopening a card never silently submits a new application.
let pending:{id:string;account:string}|null=null;
export function beginInviteLogin(id:string){pending={id,account:''};}
export function acceptInviteLogin(id:string,account:string){if(pending?.id===id&&account)pending.account=account;}
export function consumeInviteLogin(id:string,account:string){const accepted=!!pending&&pending.id===id&&pending.account===account&&!!account;if(pending?.id===id)pending=null;return accepted;}
export function cancelInviteLogin(id:string){if(pending?.id===id)pending=null;}
