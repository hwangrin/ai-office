// Prepared, local display translations only. Discovery is an authenticated GET;
// apply consumes an AI Office implementation batch, never a hover-time LLM call.
import {readFile,writeFile,mkdir,copyFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),command=args[0];
const flag=(name)=>{const i=args.indexOf('--'+name);return i<0?null:args[i+1]};
const brain=flag('brain');
if(!brain||!/^[a-z0-9-]+$/.test(brain)||!['discover','check','apply'].includes(command))throw Error('Use discover|check|apply --brain <stable-brain-id> [--input file | --registry file]');
const catalogFile=resolve(root,'public/js/agent-display-catalog.json');
const dir=resolve(root,'qa/localization-refresh',brain);await mkdir(dir,{recursive:true});
const sourceFile=resolve(dir,'source.json');
const hash=source=>createHash('sha256').update(JSON.stringify(source)).digest('hex');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const canonical=a=>({name:String(a.name||''),role:String(a.role||''),description:String(a.description||'')});
function rows(data){return (data.entries||data.agents||[]).map(a=>{
 const source=canonical(a.source||a),id=a.id||(a.slug?'slug:'+a.slug:null),agentIdentity=a.agentIdentity||a.agent_key||id;
 if(!id||!agentIdentity)throw Error('Missing stable agent identity');
 return {brainId:brain,id,agentIdentity,key:brain+'|'+agentIdentity,slug:a.slug||String(id).replace(/^slug:/,''),source,sourceHash:hash(source)};
});}
if(command==='discover'){
 let data;
 if(flag('input'))data=await read(resolve(flag('input')));
 else{
  if(!flag('registry'))throw Error('Choose an existing per-Brain credential registry or authorized metadata input; no credential is provisioned.');
  const registry=await read(resolve(flag('registry'))),entry=(Array.isArray(registry)?registry:registry.brains||[]).find(e=>e.id===brain);
  if(!entry?.path||!entry.tokenFile)throw Error('No existing read-only credential for this Brain');
  const token=(await readFile(entry.tokenFile,'utf8')).trim();
  const res=await fetch('http://127.0.0.1:7778/workforce/snapshot?'+new URLSearchParams({brain:entry.path}),{headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!res.ok)throw Error('Read-only discovery refused: HTTP '+res.status);
  data=await res.json();if(data.schema!=='javis.workforce/1')throw Error('Unexpected metadata schema');
 }
 if(data.brainId&&data.brainId!==brain)throw Error('Input Brain mismatch');
 const entries=rows(data);if(new Set(entries.map(e=>e.key)).size!==entries.length)throw Error('Duplicate identity in discovered metadata');
 await writeFile(sourceFile,JSON.stringify({brainId:brain,discoveredAt:new Date().toISOString(),entries},null,2));
 console.log(JSON.stringify({brainId:brain,discovered:entries.length,sourceFile,upstreamWrites:0}));
}else{
 const discovered=await read(sourceFile),catalog=await read(catalogFile),byKey=new Map((catalog.entries||[]).map(e=>[e.key||e.brainId+'|'+(e.agentIdentity||e.id),e]));
 if(command==='check'){
  const pending=discovered.entries.filter(e=>{const c=byKey.get(e.key);return !c||c.sourceHash!==e.sourceHash||['en','vi'].some(l=>!c[l]?.name||(e.source.role&&!c[l]?.role)||(e.source.description&&!c[l]?.description));});
  await writeFile(resolve(dir,'pending.json'),JSON.stringify({brainId:brain,instructions:'AI Office implementer: generate natural VI/EN display names, concise roles and faithful descriptions from these exact sources; do not invent duties. Description may summarize the source role, explicitly marked derivedFrom. Do not ask the owner to translate. No chat content or request-time models. Then apply the prepared file against this source snapshot.',entries:pending},null,2));
  console.log(JSON.stringify({brainId:brain,covered:discovered.entries.length-pending.length,pending:pending.length,pendingFile:resolve(dir,'pending.json')}));
 }else{
  if(!flag('input'))throw Error('apply requires the prepared implementation batch via --input');
  const prepared=await read(resolve(flag('input')));if(prepared.brainId!==brain)throw Error('Prepared Brain mismatch');
  const current=new Map(discovered.entries.map(e=>[e.key,e]));
  const seen=new Set();
  for(const e of prepared.entries||[]){
   const key=e.key||e.brainId+'|'+(e.agentIdentity||e.id),s=current.get(key);
   if(e.brainId!==brain||seen.has(key))throw Error('Mismatched Brain or duplicate prepared identity: '+key);
   seen.add(key);
   if(!s||e.sourceHash!==s.sourceHash||hash(e.source)!==s.sourceHash)throw Error('Stale or mismatched source: '+key);
   if(e.id!==s.id||(e.agentIdentity||e.id)!==s.agentIdentity)throw Error('Changed agent identity: '+key);
   for(const l of ['en','vi']){
    if(!e[l]||typeof e[l].name!=='string'||!e[l].name.trim()||typeof e[l].role!=='string'||typeof e[l].description!=='string')throw Error('Incomplete bilingual display: '+key);
    if(s.source.role&&!e[l].role.trim())throw Error('An existing role must not be erased: '+key);
    if(s.source.description&&!e[l].description.trim())throw Error('An existing description must not be erased: '+key);
    if(!s.source.role&&e[l].role)throw Error('Role has no source: '+key);
    if(!s.source.description&&e[l].description&&(!s.source.role||e.derivedFrom?.description!=='role'))throw Error('Description has no declared source: '+key);
   }
   byKey.set(key,{...e,brainId:brain,agentIdentity:s.agentIdentity,key});
  }
  await copyFile(catalogFile,resolve(dir,'catalog-before-'+Date.now()+'.json'));
  const output={...catalog,schemaVersion:2,entries:[...byKey.values()]};
  await writeFile(catalogFile+'.pending',JSON.stringify(output,null,2));await rename(catalogFile+'.pending',catalogFile);
  console.log(JSON.stringify({brainId:brain,updated:prepared.entries.length,canonicalJavisWrites:0,chatTranslations:0,modelCalls:0}));
 }
}
