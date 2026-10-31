// AI Office-side adapter only. Requires structured native IDs/timestamps; never parses chat text.
const STATES={queued:'queued',running:'running',working:'running',waiting:'waiting',needs_input:'waiting',approval_pending:'waiting',completed:'completed',failed:'failed'};
export function executionObservation(source,record) {
 if(!['core','coding','team','workflow','subagent'].includes(source)||!record||!record.brain||!record.actor_id||!record.operation_id||!Number.isFinite(record.at)||!Number.isSafeInteger(record.sequence)||!STATES[record.status])return null;
 if(!['LIVE','DEMO'].includes(record.data_source))return null;
 return {brain:record.brain,source:record.data_source,actorId:record.actor_id,operationId:record.operation_id,sequence:record.sequence,state:STATES[record.status],at:record.at,expiresAt:record.expires_at,approvalId:record.status==='approval_pending'&&typeof record.approval_id==='string'?record.approval_id:null};
}
