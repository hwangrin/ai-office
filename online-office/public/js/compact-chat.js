import {modeReady} from './office-mode.js';
await modeReady;
// Fixture frontend: preserve original HUD/Profile, add two views of the existing chat transport.
// Native Partners transport remains HELD. No Assign UI, provider calls or new conversation store here.
import {getLanguage} from './i18n.js';
import {norm,draftBody,resolveMentions} from './mentions.js';
const $=s=>document.querySelector(s);
const W={en:{placeholder:'Message…',history:'Quick chat history',send:'Send',close:'Close',empty:'No messages yet.',none:'No conversations yet.',search:'No matching agents.',sending:'Sending…',failed:'Message not delivered.',unknown:'Delivery unconfirmed. Not sent again.',load:'Unable to load messages.',held:'Native messaging is not enabled.',you:'You',retry:'Refresh',pick:'Choose one recipient',profile:'Profile',chat:'Chat',open:'Open conversation',back:'Conversations',collapse:'Collapse dashboard',expand:'Expand dashboard'},vi:{placeholder:'Nhắn tin…',history:'Lịch sử chat nhanh',send:'Gửi',close:'Đóng',empty:'Chưa có tin nhắn.',none:'Chưa có hội thoại.',search:'Không tìm thấy trợ lý.',sending:'Đang gửi…',failed:'Chưa gửi được tin.',unknown:'Chưa xác nhận đã gửi. Không tự gửi lại.',load:'Không tải được tin nhắn.',held:'Chưa bật gửi tin thật.',you:'Bạn',retry:'Tải lại',pick:'Chọn một người nhận',profile:'Hồ sơ',chat:'Trò chuyện',open:'Mở hội thoại',back:'Các hội thoại',collapse:'Thu gọn bảng thông tin',expand:'Mở bảng thông tin'}};
const t=k=>(W[getLanguage()]||W.en)[k];
let initialized=false;
function init(){
 if(initialized||!window.__office||!window.__officeUi||!window.__state||!$('#cc-assign'))return;initialized=true;
 const token=$('meta[name="office-token"]')?.content,headers={'X-Office-Token':token};
 const basePanel=$('#panel'),hud=$('#hud');
 // Move no original nodes: preserve their IDs, event listeners, hierarchy and data renderers.
 const originalNodes=[...basePanel.children].filter(e=>e.id!=='panel-resizer');for(const e of originalNodes)e.classList.add('qc-profile-content');
 const style=document.createElement('style');style.id='compact-chat-style';style.textContent=`
 #chat-composer,#interactive-mode,#assign-dialog,#panel-assign,#panel-chat,body #mu-compose-toggle,#hint{display:none!important}
 #qc-fixture{position:fixed;right:16px;top:70px;z-index:72;border:1px solid #8974b5;background:#251c36e8;border-radius:6px;padding:4px 8px;color:#e8dbff;font:10px 'Chivo Mono',monospace;pointer-events:none}
 #qc-hud-toggle{flex:none;width:26px;height:26px;padding:0;border:1px solid #526078;border-radius:6px;background:#172333;color:#eaf0f8;cursor:pointer}
 #hud.qc-hud-collapsed>:not(.eyebrow-row){display:none!important}
 #qc-tabs{display:flex;gap:4px;flex:none;padding:8px 12px;position:sticky;top:0;z-index:4;background:#182333;border-bottom:1px solid #425269}
 #qc-tabs button{border:1px solid transparent;border-radius:7px;padding:8px 14px;background:transparent;color:#c7d1de;cursor:pointer;font:600 12px 'Be Vietnam Pro',sans-serif}
 #qc-tabs button[aria-selected=true]{border-color:#7ca992;background:#273d36;color:#eaf9f0}
 #panel[data-qc-tab=chat]>.qc-profile-content{display:none!important}
 #panel[data-qc-tab=profile]>#agent-chat{display:none!important}
 #panel.open{overflow:auto;z-index:71;bottom:82px;max-height:calc(100dvh - 100px)}
 #panel[data-qc-tab=chat].open{display:flex;flex-direction:column;overflow:hidden}
 #compact-chat{position:fixed;z-index:70;bottom:20px;left:50%;transform:translateX(-50%);width:min(560px,calc(100vw - 32px));color:#eaf0f8;font:13px 'Be Vietnam Pro',sans-serif}
 .compact-row{height:50px;display:flex;align-items:center;gap:7px;padding:5px 7px;background:#151e2cf2;border:1px solid #425269;border-radius:15px;box-shadow:0 7px 28px #0004;box-sizing:border-box}
 .compact-row textarea{flex:1;min-width:0;height:36px!important;max-height:36px!important;resize:none;border:0;background:transparent;color:inherit;font:inherit;line-height:24px;padding:6px;box-sizing:border-box;outline:none}
 .compact-row button,.qc-head button{flex:none;border:0;border-radius:9px;background:transparent;color:#dce7f8;min-width:38px;height:38px;cursor:pointer;font-size:18px}
 .compact-row button:last-child{background:#a8dbc4;color:#12251e}.compact-row button:disabled{opacity:.4;cursor:default}
 #compact-chat [hidden],#agent-chat[hidden]{display:none!important}
 .qc-pop{position:absolute;bottom:60px;left:0;width:min(380px,100%);max-height:min(48dvh,380px);overflow:auto;background:#172231;border:1px solid #425269;border-radius:12px;padding:5px;box-shadow:0 8px 30px #0007;box-sizing:border-box;overscroll-behavior:contain}
 .qc-pop button{display:flex;flex-direction:column;gap:3px;text-align:left;width:100%;border:0;border-radius:7px;padding:9px 12px;background:transparent;color:#eaf0f8;cursor:pointer;font:inherit}.qc-pop button small{color:#a8b6c8;font-size:11px}.qc-pop button:hover,.qc-pop button[aria-selected=true]{background:#304158}.qc-pop p{padding:8px;margin:0;color:#a8b6c8}
 .qc-pop-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border-bottom:1px solid #425269}.qc-pop-head button{width:auto;flex:none;padding:6px}
 #qc-quick-log{display:flex;flex-direction:column;gap:8px;padding:8px;max-height:230px;overflow:auto}
 #agent-chat{display:flex;flex-direction:column;flex:1;min-height:200px;overflow:hidden;background:#131e2cf5;color:#edf2f8;font:13px 'Be Vietnam Pro',sans-serif}
 .qc-head{display:flex;align-items:center;justify-content:space-between;padding:9px 10px 9px 16px;border-bottom:1px solid #354252;min-height:44px}.qc-head h2{margin:0;font:600 16px 'Chivo Mono',monospace;overflow-wrap:anywhere}.qc-head>div{display:flex}
 #qc-messages{flex:1;overflow:auto;min-height:0;padding:14px;display:flex;flex-direction:column;gap:12px;overscroll-behavior:contain}
 .qc-message{max-width:86%;padding:9px 12px;line-height:1.5;border-radius:12px;white-space:pre-wrap;overflow-wrap:anywhere}.qc-message.me{align-self:flex-end;background:#304658}.qc-message.them{align-self:flex-start;background:#263327}.qc-message small{display:block;font-size:10px;color:#b4c4d3;margin-bottom:4px}.qc-empty{margin:auto;color:#aab9c9;text-align:center;line-height:1.6}
 #qc-panel-row{margin:0 10px 10px;box-shadow:none;border-radius:10px}.qc-status{margin:0;padding:0 14px 10px;color:#ffce8b;line-height:1.5;overflow-wrap:anywhere}.qc-status:empty{display:none}
 #compact-chat :focus-visible,#panel :focus-visible,#qc-hud-toggle:focus-visible{outline:2px solid #a8dbc4;outline-offset:2px}
 @media(min-width:601px){#qc-hud-toggle{display:block}}
 @media(max-width:600px){#qc-hud-toggle{display:none}#compact-chat{bottom:max(12px,env(safe-area-inset-bottom));width:calc(100vw - 24px)}#panel.open:not(.min){top:var(--qc-panel-top,170px)!important;bottom:82px!important;height:auto!important;max-height:none!important;left:12px!important;right:12px!important;width:auto!important;overflow:auto}#panel[data-qc-tab=chat].open:not(.min){overflow:hidden}#panel.min{bottom:82px!important}#agent-chat{min-height:120px}#hud.mu-expanded{max-height:43dvh!important;overflow:auto!important}#qc-fixture{top:var(--qc-badge-top,154px);right:12px}.qc-pop{width:100%;max-height:min(45dvh,340px)}#qc-quick-log{max-height:180px}}

/* Shared fixture shell: tab changes only replace its contents. */
@media(min-width:601px){
 body #hud{width:338px;max-width:calc(100vw - 58px);padding:10px 12px;box-sizing:border-box}
 body #hud h1{font-size:19px;line-height:1.22;margin:5px 0}
 body #hud .eyebrow{font-size:10px;letter-spacing:.07em}
 body #hud .clock-badge{font-size:10px;padding:2px 6px}
 body #hud .hud-metrics,body #hud #hud-metrics{gap:4px}
 body #hud #hud-metrics .m{padding:4px 6px;column-gap:5px}
 body #hud #hud-metrics .m-n{font-size:17px}
 body #hud #hud-comment{font-size:11px;padding:6px 8px}
 body #panel.open:not(.min){top:20px;bottom:90px;height:calc(100dvh - 110px);max-height:none}
}
body #panel.open:not(.min){background:var(--panel);color:var(--text);border:1px solid var(--line-2);border-radius:16px;box-sizing:border-box}
#qc-tabs{background:#151619;border-color:var(--line);padding:8px 56px 8px 12px;min-height:58px;box-sizing:border-box;align-items:center}
#qc-tabs button{color:#c8c4bb}
#qc-tabs button[aria-selected=true]{background:#302a1f;border-color:#8c754c;color:#f1dfbc}
#qc-tabs #qc-shell-close{position:absolute;top:6px;right:6px;width:44px;height:44px;padding:0;border:0;border-radius:9px;color:var(--text);font:28px/1 sans-serif;background:transparent;cursor:pointer}
#qc-tabs #qc-shell-close:hover{background:#ffffff12}
#p-close,#qc-close{display:none!important}
#agent-chat{background:transparent;color:var(--text)}
#agent-chat .qc-head{background:transparent;border-color:var(--line);flex-shrink:0}
#qc-panel-row{background:#181a1e;border-color:#53534f;flex-shrink:0}
.qc-message.me{background:#30342f}.qc-message.them{background:#252629}
/* The existing roster container is #modal-box.box.card, not .modal-box. */
#modal-box:has(#roster-list){background:#151619;color:var(--text);border:1px solid var(--line-2);border-radius:14px;scrollbar-color:#66635c #151619;color-scheme:dark}
#modal-box:has(#roster-list) .row2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
#modal-box:has(#roster-list) :is(input,select){width:100%;min-width:0;background:#202226;color:#ece8df;border:1px solid #64615a;border-radius:7px;padding:9px 10px;font:12px 'Be Vietnam Pro',sans-serif;color-scheme:dark;box-sizing:border-box}
#roster-department{margin-top:8px}
#modal-box:has(#roster-list) select option{background:#202226;color:#ece8df}
#roster-list>.sess{background:#191b1f;border-color:#3b3d40!important}
#roster-list :is(p,small){color:#bbb7ae}
/* Keep a visible keyboard indicator; typing uses the containing row's quiet halo. */
#compact-chat :is(button,textarea):focus-visible,#panel :is(button,textarea):focus-visible,#qc-hud-toggle:focus-visible{outline:2px solid #bda577;outline-offset:2px}
#modal-box:has(#roster-list) :is(input,select):focus{outline:none;border-color:#bda577;box-shadow:0 0 0 2px #d9b46a26}
#compact-chat textarea:focus-visible,#panel textarea:focus-visible{outline:none;box-shadow:none}
#compact-chat .compact-row:focus-within,#panel .compact-row:focus-within{border-color:#bda577;box-shadow:0 0 0 2px #d9b46a26}
@media(forced-colors:active){#compact-chat textarea:focus-visible,#panel textarea:focus-visible,#modal-box:has(#roster-list) :is(input,select):focus-visible{outline:2px solid Highlight;outline-offset:2px}}
@media(max-width:600px){
 #panel.open:not(.min),#panel[data-qc-tab=chat].open:not(.min){height:auto!important;background:var(--panel)}
 #modal-box:has(#roster-list){max-width:100%;padding:16px;box-sizing:border-box}
 #modal-box:has(#roster-list) .row2{grid-template-columns:minmax(0,1fr)}
 #qc-tabs{flex-shrink:0}
 #compact-chat textarea,#panel #qc-panel-input,#modal-box:has(#roster-list) :is(input,select){font-size:16px}
}
`;document.head.append(style);
 const tabs=document.createElement('div');tabs.id='qc-tabs';tabs.setAttribute('role','tablist');tabs.innerHTML='<button id="qc-profile-tab" role="tab" aria-controls="panel" type="button"></button><button id="qc-chat-tab" role="tab" aria-controls="agent-chat" type="button"></button>';basePanel.insertBefore(tabs,basePanel.querySelector('header'));
 const root=document.createElement('section');root.id='compact-chat';root.innerHTML='<div id="qc-history" class="qc-pop" hidden></div><div id="qc-suggestions" class="qc-pop" role="listbox" hidden></div><div class="compact-row"><button id="qc-history-toggle" type="button" aria-expanded="false">◷</button><textarea id="qc-global-input" rows="1" role="combobox" aria-autocomplete="list" aria-controls="qc-suggestions" aria-expanded="false"></textarea><button id="qc-global-send" type="button">↑</button></div><p id="qc-global-status" class="qc-status" role="status"></p>';
 const chat=document.createElement('section');chat.id='agent-chat';chat.innerHTML='<header class="qc-head"><h2 id="qc-agent-name"></h2><div><button id="qc-refresh" type="button">↻</button><button id="qc-close" type="button">×</button></div></header><div id="qc-messages" role="log" aria-live="polite" aria-relevant="additions text"></div><p id="qc-panel-status" class="qc-status" role="status"></p><div id="qc-panel-row" class="compact-row"><textarea id="qc-panel-input" rows="1"></textarea><button id="qc-panel-send" type="button">↑</button></div>';basePanel.append(chat);document.body.append(root);const shellClose=document.createElement('button');shellClose.id='qc-shell-close';shellClose.type='button';shellClose.textContent='×';shellClose.setAttribute('aria-label',t('close'));tabs.append(shellClose);shellClose.onclick=()=>$('#p-close').click();
 // Original HUD already provides the DEMO provenance indicator.
 const collapse=document.createElement('button');collapse.id='qc-hud-toggle';collapse.type='button';collapse.textContent='⌃';hud.querySelector('.eyebrow-row').append(collapse);collapse.onclick=()=>{hud.classList.toggle('qc-hud-collapsed');localize();layout();};
 const input=$('#qc-global-input'),panelInput=$('#qc-panel-input'),history=$('#qc-history'),suggestions=$('#qc-suggestions');
 const sessionRefs=new Map();const messages=new Map(),drafts=new Map(),recent=new Set(),busy=new Set(),errors=new Map(),loads=new Map();let ctx=null,quickId=null,panelId=null,tab='profile',choices=[],choiceIndex=0,composing=false,historyList=false;
 const display=s=>String(s||'').replace(/\s*[·-]?\s*FIXTURE\s*[·-]?\s*/gi,' ').trim();
 const slug=a=>a.id.replace(/^slug:/,'');const agents=()=>{const allow=ctx?.agents||[];return (window.__state?.agents||[]).filter(a=>allow.includes(slug(a)));};const agent=id=>agents().find(a=>a.id===id);
 let key='office.fixture.compact-view.v2';
 const scopeOf=()=>JSON.stringify([ctx?.mode,ctx?.brainId,ctx?.brainSeq]);
 const scopedHeaders=()=>({...headers,'X-Office-Mode':ctx?.mode||'',...(ctx?.nativeSession?{'X-Office-Brain':ctx.brainId,'X-Office-Brain-Seq':String(ctx.brainSeq)}:{})});
 function save(){try{sessionStorage.setItem(key,JSON.stringify({quickId,panelId,tab,global:input.value,drafts:[...drafts],recent:[...recent]}));}catch{}}
 function hidePop(){history.hidden=true;suggestions.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');$('#qc-history-toggle').setAttribute('aria-expanded','false');}
 function layout(){if(!matchMedia('(max-width:600px)').matches)return;const end=Math.max(hud.getBoundingClientRect().bottom,$('#toolbar').getBoundingClientRect().bottom)+8;document.documentElement.style.setProperty('--qc-panel-top',Math.ceil(end)+'px');document.documentElement.style.setProperty('--qc-badge-top',Math.ceil(end)+'px');}
 function localize(){$('#qc-shell-close').setAttribute('aria-label',t('close'));for(const el of [input,panelInput]){el.placeholder=t('placeholder');el.setAttribute('aria-label',t('placeholder'));}$('#qc-history-toggle').setAttribute('aria-label',t('history'));$('#qc-global-send').setAttribute('aria-label',t('send'));$('#qc-panel-send').setAttribute('aria-label',t('send'));$('#qc-refresh').setAttribute('aria-label',t('retry'));$('#qc-close').setAttribute('aria-label',t('close'));$('#qc-profile-tab').textContent=t('profile');$('#qc-chat-tab').textContent=t('chat');suggestions.setAttribute('aria-label',t('pick'));collapse.setAttribute('aria-expanded',String(!hud.classList.contains('qc-hud-collapsed')));collapse.setAttribute('aria-label',t(hud.classList.contains('qc-hud-collapsed')?'expand':'collapse'));collapse.title=collapse.getAttribute('aria-label');render();renderMessages();}
 function render(){basePanel.dataset.qcTab=tab;$('#qc-profile-tab').setAttribute('aria-selected',String(tab==='profile'));$('#qc-chat-tab').setAttribute('aria-selected',String(tab==='chat'));$('#qc-profile-tab').tabIndex=tab==='profile'?0:-1;$('#qc-chat-tab').tabIndex=tab==='chat'?0:-1;$('#qc-agent-name').textContent=display(agent(panelId)?.name);const ref=sessionRefs.get(panelId);chat.dataset.session=ref?.id||'';chat.dataset.brain=ref?.brain||'';root.dataset.quickSession=sessionRefs.get(quickId)?.id||'';root.dataset.brain=ctx?.brainId||ctx?.brain||'';
 $('#qc-global-send').disabled=!ctx?.chat||!quickId||busy.has(quickId)||!draftBody(input.value,agent(quickId)).trim();$('#qc-panel-send').disabled=!ctx?.chat||!panelId||busy.has(panelId)||!panelInput.value.trim();$('#qc-panel-status').textContent=busy.has(panelId)?t('sending'):errors.get(panelId)||'';$('#qc-global-status').textContent=busy.has(quickId)?t('sending'):errors.get(quickId)||'';layout();}
 function drawLog(box,id){box.replaceChildren();const rows=messages.get(id)||[];if(!rows.length){const p=document.createElement('p');p.className='qc-empty';p.textContent=t('empty');box.append(p);}for(const r of rows){for(const [kind,text]of (r.nativeRole?[[r.nativeRole==='user'?'me':'them',r.text]]:[['me',r.text],...((r.state==='completed'||r.reply)?[['them',r.reply||'']]:[])])){const d=document.createElement('div');d.className='qc-message '+kind;const n=document.createElement('small');n.textContent=kind==='me'?t('you'):display(agent(id)?.name);d.append(n,document.createTextNode(text));box.append(d);}if(r.state!=='completed'){const p=document.createElement('p');p.className='qc-status';p.textContent=r.state==='unknown'?t('unknown'):r.state==='dispatching'?t('sending'):t('failed');box.append(p);}}box.scrollTop=box.scrollHeight;}
 function drawHistory(){history.replaceChildren();if(historyList||!quickId){const list=[...recent].map(agent).filter(Boolean);if(!list.length){const p=document.createElement('p');p.textContent=t('none');history.append(p);}for(const a of list){const b=document.createElement('button');b.type='button';b.textContent=display(a.name);b.onclick=()=>{quickId=a.id;historyList=false;setRecipient(a,false);load(a.id);drawHistory();};history.append(b);}return;}
 const a=agent(quickId);if(!a)return;const head=document.createElement('div');head.className='qc-pop-head';const n=document.createElement('strong');n.textContent=display(a.name);const back=document.createElement('button');back.textContent='◷';back.setAttribute('aria-label',t('back'));back.onclick=()=>{historyList=true;drawHistory();};head.append(n,back);const box=document.createElement('div');box.id='qc-quick-log';box.setAttribute('role','log');box.setAttribute('aria-live','polite');const open=document.createElement('button');open.type='button';open.id='qc-open-full';open.textContent=t('open');open.onclick=()=>openFull(a.id);history.append(head,box,open);drawLog(box,a.id);}
 function renderMessages(){if(panelId)drawLog($('#qc-messages'),panelId);if(!history.hidden)drawHistory();}
 async function load(id){if(!agent(id))return;const scope=scopeOf();const seq=(loads.get(id)||0)+1;loads.set(id,seq);try{const r=await fetch('/office/api/gateway/chat/history?slug='+encodeURIComponent(slug(agent(id))),{headers:scopedHeaders()});const data=r.ok?await r.json():null;if(loads.get(id)!==seq||scope!==scopeOf())return;if(r.ok){sessionRefs.set(id,{id:data.sessionId,brain:data.brainId,url:data.nativeUrl});messages.set(id,data?.items||[]);errors.delete(id);}else errors.set(id,t('load'));}catch{if(loads.get(id)!==seq||scope!==scopeOf())return;errors.set(id,t('load'));}renderMessages();render();}
 function setTab(next){if(panelId)drafts.set(panelId,panelInput.value);tab=next;panelInput.value=drafts.get(panelId)||'';render();if(next==='chat'&&panelId)load(panelId);save();}
 const nativeSelect=window.__office.select.bind(window.__office);window.__office.select=id=>{if(panelId)drafts.set(panelId,panelInput.value);const r=nativeSelect(id);panelId=id&&agent(id)?id:null;tab='profile';panelInput.value=drafts.get(panelId)||'';render();save();return r;};
 function openFull(id){if(!agent(id))return;hidePop();window.__officeUi.openPanel(id);setTab('chat');panelInput.focus();}
 $('#qc-profile-tab').onclick=()=>setTab('profile');$('#qc-chat-tab').onclick=()=>setTab('chat');tabs.onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();setTab(tab==='profile'?'chat':'profile');$(tab==='profile'?'#qc-profile-tab':'#qc-chat-tab').focus();};
 $('#qc-close').onclick=()=>$('#p-close').click();$('#qc-refresh').onclick=()=>panelId&&load(panelId);
 function setRecipient(a,focus=true){const body=quickId?draftBody(input.value,agent(quickId)).trim():input.value.replace(/(?:^|\s)@[^\s@]*$/,'').trim();quickId=a.id;recent.add(a.id);input.value='@'+slug(a)+' '+body;hidePop();render();save();if(focus)input.focus();}
 function pick(i){const a=choices[i];if(!a)return;const before=input.value.slice(0,input.selectionStart??input.value.length),after=input.value.slice(input.selectionStart??input.value.length),m=before.match(/(?:^|\s)@[^\s@]*$/);if(m){const at=before.lastIndexOf('@');input.value=before.slice(0,at)+'@'+slug(a)+' '+after;}else input.value='@'+slug(a)+' '+input.value;quickId=a.id;recent.add(a.id);hidePop();render();save();input.focus();load(a.id);}
 function drawChoices(){suggestions.replaceChildren();suggestions.hidden=false;input.setAttribute('aria-expanded','true');if(!choices.length){const p=document.createElement('p');p.textContent=t('search');suggestions.append(p);return;}choices.forEach((a,i)=>{const b=document.createElement('button');b.type='button';b.role='option';b.id='qc-option-'+i;b.setAttribute('aria-selected',String(i===choiceIndex));const n=document.createElement('strong'),r=document.createElement('small');n.textContent=display(a.name);r.textContent=display(a.role);b.append(n,r);b.onpointerdown=e=>{e.preventDefault();pick(i);};suggestions.append(b);});input.setAttribute('aria-activedescendant','qc-option-'+choiceIndex);}
 function refreshInput(){const found=resolveMentions(input.value,agents());quickId=found.length===1?found[0].id:null;const m=input.value.slice(0,input.selectionStart??input.value.length).match(/(?:^|\s)@([^\s@]*)$/);if(m&&!composing){choices=agents().filter(a=>norm(a.name+' '+slug(a)+' '+(a.role||'')).includes(norm(m[1]))).slice(0,6);choiceIndex=0;history.hidden=true;$('#qc-history-toggle').setAttribute('aria-expanded','false');drawChoices();}else{suggestions.hidden=true;input.setAttribute('aria-expanded','false');}render();save();}
 input.addEventListener('input',refreshInput);panelInput.addEventListener('input',()=>{if(panelId)drafts.set(panelId,panelInput.value);render();save();});
 function showHistory(){historyList=false;suggestions.hidden=true;input.setAttribute('aria-expanded','false');history.hidden=false;$('#qc-history-toggle').setAttribute('aria-expanded','true');drawHistory();if(quickId)load(quickId);}
 $('#qc-history-toggle').onclick=()=>{if(!history.hidden)hidePop();else showHistory();};
 async function submit(id,text,source){if(!ctx?.chat||!agent(id)||busy.has(id)||!text.trim())return;text=text.trim();const scope=scopeOf();const a=agent(id),turn=crypto.randomUUID().replaceAll('-','');busy.add(id);errors.delete(id);recent.add(id);messages.set(id,[...(messages.get(id)||[]),{turn,text,state:'dispatching'}]);if(source==='quick'){input.value='@'+slug(a)+' ';showHistory();}else{panelInput.value='';drafts.set(id,'');}renderMessages();render();save();let data;try{const response=await fetch('/office/api/gateway/chat',{method:'POST',headers:{...scopedHeaders(),'Content-Type':'application/json'},body:JSON.stringify({slug:slug(a),text,turn})});if(ctx?.nativeSession&&response.headers.get('Content-Type')?.includes('text/event-stream')){
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',partial='';data={state:'unknown'};
 while(true){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});let end;while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);if(!block.startsWith('data: '))continue;let e;try{e=JSON.parse(block.slice(6))}catch{continue;}if(scope!==scopeOf()||(e.brainId&&e.brainId!==ctx?.brainId))continue;if(e.event==='session'){sessionRefs.set(id,{id:e.sessionId,brain:e.brainId});render();}if(e.event==='native'&&(e.type==='stream'||e.type==='response')){partial=e.type==='response'?e.content:partial+e.content;const pending=messages.get(id)?.find(r=>r.turn===turn);if(pending)pending.reply=partial;renderMessages();}if(e.event==='result')data=e;}}
 }else{try{data=await response.json();}catch{data={state:'unknown'};}}}catch{data={state:'unknown'};}if(scope!==scopeOf())return;busy.delete(id);await load(id);if(data.state!=='completed'){errors.set(id,data.state==='unknown'?t('unknown'):t('failed'));if(['blocked','busy','conflict','failed'].includes(data.state)&&data.code!=='engine_error'){if(source==='quick'&&quickId===id&&draftBody(input.value,a).trim()==='')input.value='@'+slug(a)+' '+text;else if(source==='panel'&&panelId===id&&!panelInput.value){panelInput.value=text;drafts.set(id,text);}}}renderMessages();render();save();window.dispatchEvent(new CustomEvent('chat-turn',{detail:{slug:slug(a),turn,state:data.state}}));}
 const sendQuick=()=>quickId&&submit(quickId,draftBody(input.value,agent(quickId)),'quick');$('#qc-global-send').onclick=sendQuick;$('#qc-panel-send').onclick=()=>panelId&&submit(panelId,panelInput.value,'panel');
 for(const el of [input,panelInput]){el.addEventListener('compositionstart',()=>composing=true);el.addEventListener('compositionend',()=>{composing=false;if(el===input)refreshInput();});el.addEventListener('keydown',e=>{if(e.isComposing||composing||e.keyCode===229)return;if(el===input&&!suggestions.hidden&&choices.length){if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();choiceIndex=(choiceIndex+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length;return drawChoices();}if(['Enter','Tab'].includes(e.key)){e.preventDefault();pick(choiceIndex);return;}}if(e.key==='Escape'&&el===input){e.preventDefault();hidePop();return;}if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(el===input)sendQuick();else if(panelId)submit(panelId,panelInput.value,'panel');}});}
 document.addEventListener('pointerdown',e=>{if(!root.contains(e.target))hidePop();});window.addEventListener('office-language',localize);window.addEventListener('resize',layout);new ResizeObserver(layout).observe(hud);new ResizeObserver(layout).observe($('#toolbar'));
 let contextRequest=0;
 async function refreshContext(){
  const ticket=++contextRequest;
  const response=await fetch('/office/api/interactive/context',{headers});if(!response.ok){ctx=null;messages.clear();sessionRefs.clear();renderMessages();render();$('#qc-global-status').textContent=t('held');return;}
  const data=await response.json();if(ticket!==contextRequest)return;const changed=ctx&&(ctx.brainId!==data.brainId||ctx.mode!==data.mode||ctx.brainSeq!==data.brainSeq);if(changed){messages.clear();sessionRefs.clear();loads.clear();drafts.clear();recent.clear();busy.clear();errors.clear();quickId=null;panelId=null;input.value='';panelInput.value='';}
  ctx=data;key=ctx.nativeSession?'office.native.compact-view.'+ctx.brainId+'.v1':'office.fixture.compact-view.v2';
  if(!changed){try{const old=JSON.parse(sessionStorage.getItem(key)||'null');if(old){for(const [id,value]of old.drafts||[])drafts.set(id,value);for(const id of old.recent||[])recent.add(id);input.value=old.global||'';quickId=agent(old.quickId)?old.quickId:null;const id=old.panelId||old.active;if(agent(id)){window.__officeUi.openPanel(id);setTab(old.tab==='chat'?'chat':'profile');}}}catch{}}
  refreshInput();localize();if(panelId)load(panelId);if(quickId&&quickId!==panelId)load(quickId);
 }
 window.addEventListener('office-native-reset',()=>{contextRequest++;ctx=null;messages.clear();sessionRefs.clear();loads.clear();drafts.clear();busy.clear();errors.clear();recent.clear();quickId=null;panelId=null;input.value='';panelInput.value='';hidePop();renderMessages();render();});
 window.addEventListener('office-brain',()=>refreshContext().catch(()=>{}));window.addEventListener('office-native-context',()=>refreshContext().catch(()=>{}));refreshContext().catch(()=>{$('#qc-global-status').textContent=t('held');});localize();
}
const timer=setInterval(()=>{init();if(initialized)clearInterval(timer);},100);window.addEventListener('office-state',init);init();
