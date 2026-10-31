// Pure projection. No I/O, execution, credential, timer or inferred completion.
const STATES=new Set(['queued','running','waiting','completed','failed']);
export class TelemetryLedger {
  constructor({brain,maxEntries=500,ttlMs=30000}={}) {if(!brain||maxEntries<1||ttlMs<1000||ttlMs>300000)throw Error('invalid_telemetry_config');this.brain=brain;this.max=maxEntries;this.ttl=ttlMs;this.items=new Map();}
  apply(e,now=Date.now()) {
    if(!e||e.brain!==this.brain||!['LIVE','DEMO'].includes(e.source)||!STATES.has(e.state)||!e.actorId||!e.operationId||!Number.isSafeInteger(e.sequence)||e.sequence<0||!Number.isFinite(e.at)||e.at>now+5000||now-e.at>this.ttl)return false;
    const key=JSON.stringify([e.source,e.actorId,e.operationId]),old=this.items.get(key);
    if(old&&(e.sequence<=old.sequence||e.at<old.at||['completed','failed'].includes(old.state)))return false;
    if(!old&&this.items.size>=this.max){for(const [k,v] of this.items)if(now>=v.expiresAt){this.items.delete(k);break;}if(this.items.size>=this.max)return false;}
    const expiresAt=Math.min(e.at+this.ttl,Number.isFinite(e.expiresAt)?e.expiresAt:Infinity);
    if(expiresAt<=now)return false;
    this.items.set(key,{brain:e.brain,source:e.source,actorId:String(e.actorId),operationId:String(e.operationId),sequence:e.sequence,state:e.state,at:e.at,expiresAt,approvalId:typeof e.approvalId==='string'?e.approvalId:null});return true;
  }
  view(source,actorId,now=Date.now()) {
    const entries=[...this.items.values()].filter(e=>e.source===source&&e.actorId===actorId).sort((a,b)=>b.at-a.at||b.sequence-a.sequence);
    if(!entries.length)return {state:'unknown',reason:'no_observation',approval:false};
    const e=entries[0];if(now>=e.expiresAt)return {...e,state:'unknown',reason:'expired',approval:false};
    return {...e,reason:'observed',approval:e.state==='waiting'&&!!e.approvalId};
  }
  switchBrain(brain){if(!brain)throw Error('brain_required');this.brain=brain;this.items.clear();}
}
