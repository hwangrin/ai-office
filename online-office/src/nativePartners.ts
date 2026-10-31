import {projectNativeJobList,projectNativeRoster} from './cloud-roster.ts';
/** Local authenticated adapter to Javis' existing Partners sessions. No CLI chat,
 * executor, credential provisioning, message database or automatic resend. */
import express, {type Request} from 'express';
import {createHash, timingSafeEqual} from 'node:crypto';
import WebSocket from 'ws';
import {JavisLiveFeed} from './javisLive.ts';
import {JavisReadOnlyViewer} from './javisViewer.ts';
import {readFileSync,existsSync} from 'node:fs';
import type {Department} from './types.ts';

const BASE=process.env.OFFICE_JAVIS_ORIGIN||'https://hwangrin.cloud';
const PUBLIC_ORIGIN=process.env.OFFICE_PUBLIC_ORIGIN||'https://hwangrin.cloud';
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const equal=(a:string,b:string)=>timingSafeEqual(Buffer.from(digest(a)),Buffer.from(digest(b)));
const slugOK=(s:string)=>!!s && !/[\s/\\:]/u.test(s);
class NativeError extends Error {constructor(public status:number,public code:string){super(code)}}
export function nativeCookie(req:Request):string {
  const value=/(?:^|;\s*)javis_session=([^;]+)/.exec(req.headers.cookie||'')?.[1];
  if(!value)throw new NativeError(401,'AUTH_ERROR');
  return 'javis_session='+value; // only the native HttpOnly session, never returned or logged
}
export function checkSession(row:any,brain:any,slug:string) {
  const normalize=(p:string)=>String(p||'').replace(/\\/g,'/').replace(/\/$/,'').toLowerCase();
  if(!row?.id || row.archived || row.channel!=='agent:'+slug || ![brain.path,brain.name].some(p=>normalize(p)===normalize(row.brain)))
    throw new NativeError(409,'partners_session_mismatch');
}
export function checkMode(requested:string|undefined,active:boolean){if(requested!==(active?'LIVE_NATIVE_PARTNERS':'ISOLATED_INTERACTIVE_FIXTURE'))throw new NativeError(409,'connection_mode_changed');}
export class NativePartnersBridge {
  active=true; selected='kyan'; seq=1; kyanVerified=false;
  private turns=new Map<string,{fingerprint:string,state:string,sid:string,at:number}>();
  private sessions=new Map<string,string>();
  constructor(private departments:Department[]){}
  private async call(cookie:string,path:string,body?:URLSearchParams) {
    // All paths are constructed here; browser input can never choose a host or URL.
    const r=await fetch(BASE+path,{method:body?'POST':'GET',headers:{Cookie:cookie,Accept:'application/json',...(body?{'Content-Type':'application/x-www-form-urlencoded',Origin:BASE}:{})},body,redirect:'error',signal:AbortSignal.timeout(12000)});
    if(r.status===401||r.status===403)throw new NativeError(r.status,'AUTH_ERROR');
    if(!r.ok)throw new NativeError(r.status,'native_http_'+r.status);
    return r.json();
  }
  private async context(req:Request) {
    const cookie=nativeCookie(req),data=await this.call(cookie,'/brains');
    const brains=(data.brains||[]).filter((b:any)=>b.name&&b.path).map((b:any)=>({...b,id:String(b.name).toLowerCase()}));
    const brain=brains.find((b:any)=>b.id===this.selected);
    if(!brain)throw new NativeError(404,'selected_brain_unavailable');
    // Revalidate the one previously observed smoke receipt from native history after
    // a staging restart; never invoke a model to unlock other agents again.
    if(!this.kyanVerified&&brain.id==='kyan'&&existsSync('qa/native-partners/smoke-receipt.json')){
      try{const receipt=JSON.parse(readFileSync('qa/native-partners/smoke-receipt.json','utf8'));const row=await this.call(cookie,'/sessions/'+encodeURIComponent(receipt.sessionId)+'?limit=60');checkSession(row,brain,'kyan');this.kyanVerified=receipt.upstream===BASE&&(row.messages||[]).some((m:any)=>m.role==='assistant'&&m.content===receipt.reply)&&(row.messages||[]).some((m:any)=>m.role==='user'&&m.content===receipt.prompt);}catch{/* A missing or inaccessible receipt keeps the gate closed. */}
    }
    return {cookie,brains,brain,seq:this.seq};
  }
  private async roster(cookie:string,brain:any) {
    const data=await this.call(cookie,'/agents?'+new URLSearchParams({brain:brain.path,prompt:'0',system:'1'}));
    return (data.agents||[]).filter((a:any)=>slugOK(a.slug));
  }
  private async session(req:Request,slug:string,create=false) {
    const c=await this.context(req);
    if(req.get('X-Office-Brain')!==c.brain.id || req.get('X-Office-Brain-Seq')!==String(c.seq))throw new NativeError(409,'brain_changed');
    const roster=await this.roster(c.cookie,c.brain);
    if(!roster.some((a:any)=>a.slug===slug))throw new NativeError(404,'agent_not_in_selected_brain');
    const key=digest(c.cookie)+'|'+c.brain.id+'|'+slug;
    let sid=this.sessions.get(key);
    if(!sid){const data=await this.call(c.cookie,'/sessions?'+new URLSearchParams({brain:c.brain.path,channel:'agent:'+slug,limit:'1'}));sid=data.sessions?.[0]?.id;}
    if(!sid&&create){const data=await this.call(c.cookie,slug==='javis-core'?'/javis-core/session':'/sessions/new',new URLSearchParams({brain:c.brain.path,channel:'agent:'+slug}));sid=data.id;}
    if(!sid)return {...c,key,row:null};
    const row=await this.call(c.cookie,'/sessions/'+encodeURIComponent(sid)+'?limit=60');checkSession(row,c.brain,slug);
    this.sessions.set(key,sid);return {...c,key,row};
  }
  async snapshot(req:Request) {
    let viewer:JavisReadOnlyViewer|undefined;
    try {
      const c=await this.context(req);
      const roster=await this.roster(c.cookie,c.brain);
      // Reuse Javis' existing authenticated, read-only Jobs badge endpoint. A failure stays Unknown;
      // it must not be converted into an all-idle roster.
      let counts:any=null;
      try{counts=await this.call(c.cookie,'/agents/jobs/counts?'+new URLSearchParams({brain:c.brain.path}));}
      catch(e:any){if(e?.status===401||e?.status===403)throw e;/* Other source failures stay Unknown. */}
      const live=new JavisLiveFeed({baseUrl:BASE,token:'',brain:c.brain.path,fetchImpl:async()=>new Response(JSON.stringify(projectNativeRoster(roster,c.brain,counts)),{headers:{'Content-Type':'application/json'}})});
      viewer=new JavisReadOnlyViewer(this.departments,false,{live,layout:existsSync('javis-layout.json')?JSON.parse(readFileSync('javis-layout.json','utf8')):undefined,brainLabel:c.brain.label||c.brain.name,openBase:BASE,openBrain:c.brain.name});
      const fresh=await live.refreshNow();
      if(!fresh.fresh)throw new NativeError(fresh.connection==='AUTH_FAILED'?401:502,fresh.connection==='AUTH_FAILED'?'AUTH_ERROR':'workforce_unavailable');
      const s:any=viewer.snapshot(),raw=live.getSnapshot()!;
      s.agents=s.agents.map((a:any)=>{const native=[...raw.agents,...raw.subagents].find(w=>w.id===a.id);return {...a,slug:native?.slug,canonicalAgentId:native?.agent_key||native?.id||a.id,visualIdentityKey:c.brain.id+'|'+(native?.agent_key||native?.id||a.id)};});
      // The established scene/UI uses slug:<slug>; retain the native key separately.
      s.agents=s.agents.map((a:any)=>({...a,nativeAgentId:a.id,id:a.actorKind!=='subagent'&&a.slug?'slug:'+a.slug:a.id}));
      s.javisViewer={...s.javisViewer,brain:c.brain.name,brainId:c.brain.id,brainSeq:c.seq,kyanAppearanceBrainKey:c.brain.id==='kyan'?'fixture-kyan':c.brain.id};
      return {...s,applicationMode:'LIVE_NATIVE_PARTNERS',executionEnabled:false,providers:['observer'],brainSeq:c.seq,nativePartners:{connection:'CONNECTED',brainId:c.brain.id,verifiedRoundTrip:this.kyanVerified}};
    } catch(e:any) {
      const auth=e.code==='AUTH_ERROR';
      if(auth)throw e; // Preserve a real upstream authentication failure as HTTP 401/403.
      return {departments:this.departments,agents:[],permissions:[],approvals:[],approvalSummary:{available:false,pending:null,questions:null},feed:[],providers:[],applicationMode:'LIVE_NATIVE_PARTNERS',executionEnabled:false,javisViewer:{enabled:true,readOnly:true,brain:this.selected,brainId:this.selected,brainSeq:this.seq,mode:'LIVE',liveConnection:auth?'AUTH_FAILED':'DISCONNECTED',liveReason:auth?'Sign in to Javis in this browser.':'Native Javis connection unavailable.',coverage:{agents:'unknown',tasks:'unknown',usage:'unknown'}},nativePartners:{connection:auth?'AUTH_ERROR':'OFFLINE',code:e.code||'native_unavailable',verifiedRoundTrip:false}};
    } finally {viewer?.shutdown();}
  }
  router(token:string,origin:string) {
    const r=express.Router();
    r.use((req,res,next)=>{
      if(!req.path.startsWith('/api/'))return next();
      if(!equal(req.get('X-Office-Token')||'',token)){res.status(401).json({code:'office_token_required'});return;}
      if(req.method==='POST'&&(req.get('Origin')!==origin||req.get('Sec-Fetch-Site')!=='same-origin')){res.status(403).json({code:'origin_refused'});return;}
      next();
    });
    r.get('/api/connection-mode',(_req,res)=>res.json({mode:this.active?'LIVE_NATIVE_PARTNERS':'ISOLATED_INTERACTIVE_FIXTURE',brainId:this.selected,brainSeq:this.seq}));
    r.post('/api/connection-mode',express.json({limit:'1kb'}),(req,res)=>{if(!['LIVE','FIXTURE'].includes(req.body?.mode)){res.status(400).end();return;}this.active=req.body.mode==='LIVE';this.seq++;res.json({ok:true});});
    r.use((req,res,next)=>{if(req.path.startsWith('/api/gateway/chat')){try{checkMode(req.get('X-Office-Mode'),this.active)}catch{res.status(409).json({state:'blocked',code:'connection_mode_changed'});return;}}this.active?next():next('router');});
    const handle=(fn:(req:express.Request,res:express.Response)=>Promise<any>)=>async(req:express.Request,res:express.Response)=>{try{await fn(req,res)}catch(e:any){if(!res.headersSent)res.status(e.status||502).json({state:e.code==='AUTH_ERROR'?'blocked':'failed',code:e.code||'native_unavailable'});else res.end();}};
    r.get('/api/state',handle(async(req,res)=>res.json(await this.snapshot(req))));
    r.get('/api/interactive/context',handle(async(req,res)=>{const c=await this.context(req),roster=await this.roster(c.cookie,c.brain);res.json({mode:'LIVE_NATIVE_PARTNERS',brain:c.brain.name,brainId:c.brain.id,brainSeq:c.seq,agents:roster.filter((a:any)=>this.kyanVerified||a.slug==='kyan').map((a:any)=>a.slug),chat:true,nativeSession:true,verifiedRoundTrip:this.kyanVerified});}));
    r.get(['/api/brains','/api/javis-viewer/brains'],handle(async(req,res)=>{const c=await this.context(req);res.json({seq:this.seq,brains:c.brains.map((b:any)=>({id:b.id,label:b.label||b.name,active:b.id===this.selected,access:'ready'}))});}));
    r.post(['/api/brains/select','/api/javis-viewer/brain'],express.json({limit:'1kb'}),handle(async(req,res)=>{const c=await this.context(req);if(!c.brains.some((b:any)=>b.id===req.body?.id))throw new NativeError(404,'brain_not_found');this.selected=req.body.id;this.seq++;res.json({ok:true,brainId:this.selected,seq:this.seq,brains:c.brains.map((b:any)=>({id:b.id,label:b.label||b.name,active:b.id===this.selected,access:'ready'}))});}));
    r.get('/api/identity-catalog',(_req,res)=>res.json({entries:[]}));
    r.get('/api/usage/today',(_req,res)=>res.json({available:false,reason:'not_in_native_chat_scope'}));
    r.get('/api/gateway/chat/history',handle(async(req,res)=>{
      const slug=String(req.query.slug||'');if(!slugOK(slug))throw new NativeError(400,'invalid_agent');
      const s=await this.session(req,slug);if(this.seq!==s.seq)throw new NativeError(409,'brain_changed');res.json({source:'javis_native_partners',brainId:s.brain.id,sessionId:s.row?.id||null,channel:'agent:'+slug,items:(s.row?.messages||[]).filter((m:any)=>['user','assistant'].includes(m.role)).map((m:any)=>({turn:String(m.id||m.ts),nativeRole:m.role,text:m.content||'',state:'completed',at:m.ts})),nativeUrl:s.row?PUBLIC_ORIGIN+'/#brain='+encodeURIComponent(s.brain.name)+'&cs=agent:'+encodeURIComponent(slug)+':'+encodeURIComponent(s.row.id):null});
    }));
    r.post('/api/gateway/chat',express.json({limit:'24kb'}),handle(async(req,res)=>{
      const {slug,text,turn}=req.body||{};
      if(typeof slug!=='string'||!slugOK(slug)||typeof text!=='string'||!text.trim()||text.length>4000||typeof turn!=='string'||!/^[A-Za-z0-9_-]{16,64}$/.test(turn)||Object.keys(req.body).some(k=>!['slug','text','turn'].includes(k)))throw new NativeError(400,'invalid_message');
      if(!this.kyanVerified&&slug!=='kyan')throw new NativeError(423,'kyan_smoke_test_first');
      const s=await this.session(req,slug,true);if(!s.row)throw new NativeError(502,'native_session_missing');
      const key=s.key+'|'+turn,fingerprint=digest(text),previous=this.turns.get(key);
      if(previous){if(previous.fingerprint!==fingerprint)throw new NativeError(409,'turn_conflict');res.json({state:previous.state,code:'not_sent_again',replayed:true,sessionId:previous.sid});return;}
      for(const [k,v]of this.turns)if(Date.now()-v.at>86400000)this.turns.delete(k);
      if(this.turns.size>500)throw new NativeError(503,'turn_guard_full');
      const record={fingerprint,state:'dispatching',sid:s.row.id,at:Date.now()};this.turns.set(key,record);
      // A second descriptor read directly before dispatch guards cross-Brain/session mixups.
      checkSession(await this.call(s.cookie,'/sessions/'+encodeURIComponent(s.row.id)+'?limit=1'),s.brain,slug);
      if(this.seq!==s.seq)throw new NativeError(409,'brain_changed');
      res.set({'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'});res.flushHeaders();
      const emit=(data:any)=>{if(!res.destroyed)res.write('data: '+JSON.stringify(data)+'\n\n')};
      const ws=new WebSocket(BASE.replace(/^http/,'ws')+'/ws',{headers:{Cookie:s.cookie,Origin:BASE}});let sent=false,reply=false,finished=false;
      const finish=(state:string,code:string)=>{if(finished)return;finished=true;record.state=state;clearTimeout(timer);emit({event:'result',state,code,sessionId:s.row.id,brainId:s.brain.id});res.end();ws.close();};
      const timer=setTimeout(()=>finish(reply?'completed':'unknown',reply?'native_reply_received':'delivery_unconfirmed'),180000);
      ws.on('message',raw=>{let frame:any;try{frame=JSON.parse(raw.toString())}catch{return;}
        if(frame.type==='hello'&&!sent){
          const running=frame.running||[];if((Array.isArray(running)?running.some((v:any)=>(v.session_id||v.sid)===s.row.id):!!running[s.row.id])){finish('busy','native_session_busy');return;}
          if(this.seq!==s.seq){finish('blocked','brain_changed');return;}
          sent=true;ws.send(JSON.stringify({message:text.trim(),brain:s.brain.path,session_id:s.row.id,voice:false,voice_input:false,wf_run:false}));emit({event:'session',sessionId:s.row.id,brainId:s.brain.id});return;
        }
        if(frame.session_id!==s.row.id)return; // no other session, Brain or hello payload escapes
        if(['status','stream','response','error','turn_done'].includes(frame.type))emit({event:'native',type:frame.type,content:typeof frame.content==='string'?frame.content:'',sessionId:s.row.id,brainId:s.brain.id});
        if(frame.type==='response'&&typeof frame.content==='string'&&frame.content.trim()){reply=true;if(s.brain.id==='kyan'&&slug==='kyan')this.kyanVerified=true;}
        if(frame.type==='error')finish('failed','native_engine_error');
        if(frame.type==='turn_done')finish(reply?'completed':'failed',reply?'native_reply_received':'native_no_reply');
      });
      ws.on('close',code=>{if(!finished)finish(sent?'unknown':'blocked',code===1008?'AUTH_ERROR':'native_socket_closed');});
      ws.on('error',()=>finish(sent?'unknown':'blocked','native_socket_error'));
      res.on('close',()=>{if(!finished){record.state=sent?'unknown':'blocked';finished=true;clearTimeout(timer);ws.close();}});
    }));
    // Explicitly prevent all fixture gateways/defaults in LIVE mode.
    r.all('/api/gateway/assign',(_req,res)=>res.status(423).json({code:'tasks_out_of_scope'}));
    r.get('/api/agents/:id/history',handle(async(req,res)=>{
      const id=String(req.params.id||''),slug=id.startsWith('slug:')?id.slice(5):id;
      if(!slugOK(slug)||slug.startsWith('slug:'))throw new NativeError(400,'invalid_agent');
      const requestedBrain=String(req.query.brainId||''),requestedSeq=String(req.query.brainSeq||'');
      if(requestedBrain!==this.selected||requestedSeq!==String(this.seq))throw new NativeError(409,'brain_changed');
      const c=await this.context(req);
      if(c.brain.id!==requestedBrain||String(c.seq)!==requestedSeq)throw new NativeError(409,'brain_changed');
      const roster=await this.roster(c.cookie,c.brain),agent=roster.find((a:any)=>a.slug===slug);
      if(!agent)throw new NativeError(404,'agent_not_in_selected_brain');
      const query=new URLSearchParams({brain:c.brain.path,source:'all',limit:'12'});
      let projected:any={available:false,items:[]};
      try{projected=projectNativeJobList(await this.call(c.cookie,'/agents/'+encodeURIComponent(slug)+'/jobs?'+query));}
      catch(e:any){if(e?.status===401||e?.status===403)throw e;/* Missing/partial source data is Unknown. */}
      if(this.seq!==c.seq)throw new NativeError(409,'brain_changed');
      const items=projected.available?projected.items.map((job:any)=>({...job,openUrl:job.sessionId
        ?PUBLIC_ORIGIN.replace(/\/+$/,'')+'/#brain='+encodeURIComponent(c.brain.name)+'&cs=agent:'+encodeURIComponent(slug)+':'+encodeURIComponent(job.sessionId)
        :null})):[];
      res.json({source:'LIVE',nativeWorkStatus:true,refs:{slug,agentKey:agent.agent_key||null},
        conversation:{available:false,reason:'use_native_chat_tab'},sessions:{available:false,items:[]},
        tasks:{available:projected.available,scope:'current_and_recent',items},
        links:{chat:slug==='javis-core'?PUBLIC_ORIGIN+'/':PUBLIC_ORIGIN.replace(/\/+$/,'')+'/#brain='+encodeURIComponent(c.brain.name)+'&cs=agent:'+encodeURIComponent(slug),task:null}});
    }));
    r.get('/api/agents/:id/tasks',(_req,res)=>res.json([]));
    r.get('/api/tasks',(_req,res)=>res.json([]));
    r.get('/api/agents/:id/events',(_req,res)=>res.json([]));
    r.use('/api',(_req,res)=>res.status(404).json({code:'not_in_native_chat_scope'}));
    r.use((err:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(err?.type==='entity.too.large'?413:400).json({state:'blocked',code:'invalid_request'}));
    return r;
  }
}
