export function reviewNotificationPath(item:{type:string;body:string;ticket_id?:string|null;change_id?:string|null}):string|undefined {
  // Review alerts without an entity ID predate dedicated notification types.
  // Linked change approval/task notifications continue to open their own record.
  if(item.ticket_id||item.change_id||!['SUBMISSION_REVIEW','CHANGE_APPROVAL_REQUESTED'].includes(item.type))return;
  if(item.body.includes('Review PM'))return '/problems?reviewPM=1';
  if(item.body.includes('Review services'))return '/catalogue?reviewService=1';
  if(item.body.includes('Review KB'))return '/knowledge?reviewKB=1';
  if(item.body.includes('Review CM'))return '/changes?reviewCM=1';
}
