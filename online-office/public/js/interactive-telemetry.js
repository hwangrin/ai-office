import {TelemetryLedger} from './telemetry-model.js';
// Fixture-only scene wiring; never subscribes to real Core/Coding/Team activity.
export function attachInteractiveTelemetry({brain,getState,office}) {
 const ledger=new TelemetryLedger({brain});let selectedId=null;const select=office.select.bind(office);office.select=id=>{selectedId=id;return select(id);};const refresh=a=>{window.__officeUi?.renderHud();if(selectedId===a.id)window.__officeUi?.openPanel(a.id);};
 window.addEventListener('interactive-task-receipt',e=>{
  const {slug,taskId,text}=e.detail||{};if(!taskId||!slug)return;
  const a=getState().agents.find(a=>a.id.replace(/^slug:/,'')===slug);if(!a)return;
  const now=Date.now();if(!ledger.apply({brain,source:'DEMO',actorId:a.id,operationId:taskId,sequence:0,state:'queued',at:now},now))return;
  a.status='queued';a.queued=1;
  if(a.card){a.card.activity='queued';a.card.activityReason='fixture_confirmed_receipt';a.card.approval=null;a.card.task={id:taskId,title:text,step:null,stepKind:'fixture',status:'queued',team:'',source:'DEMO',queuePos:null,reason:'fixture_confirmed_receipt',startedAt:null,stateChangedAt:null};}
  office.setStatus(a.id,'queued');refresh(a);window.dispatchEvent(new Event('office-state'));
 });
 const timer=setInterval(()=>{const now=Date.now();for(const a of getState().agents||[]){const v=ledger.view('DEMO',a.id,now);if(v.reason==='expired'&&a.status!=='unknown'){a.status='unknown';a.queued=null;if(a.card){a.card.activity='unknown';a.card.approval=null;a.card.task=null;a.card.activityReason='fixture_receipt_expired';}office.setStatus(a.id,'unknown');refresh(a);window.dispatchEvent(new Event('office-state'));}}},1000);
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 return ledger;
}
