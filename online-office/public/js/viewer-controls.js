import { identityNotice } from './agent-identity.js';
import { startDemo, returnToLive, demoCatalog, demoPickText, isDemoActive } from './demo-director.js';
import { tr, ui, getLanguage, setLanguage, localizeDom } from './i18n.js';
await import('./main.js');
const {openModal,closeModal,openPanel,api,loadState}=window.__officeUi;
const $=s=>document.querySelector(s), state=window.__state;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
$('#btn-language').onclick=()=>setLanguage(getLanguage()==='en'?'vi':'en');
function modeLabel(){const ro=!!state.javisViewer?.readOnly;$('#btn-mode').textContent=ro?(getLanguage()==='vi'?'Văn phòng':'Office'):(getLanguage()==='vi'?'Xưởng làm việc':'Studio');$('#btn-demo').hidden=true;$('#btn-language').textContent=getLanguage()==='en'?'EN / VI':'VI / EN';}
$('#btn-mode').onclick=()=>openModal(getLanguage()==='vi'?'<h3>Văn phòng</h3><p>Trò chuyện kết nối trực tiếp với Javis. Di chuyển và sinh hoạt trong cảnh là mô phỏng.</p><div class="modal-actions"><button class="btn" data-close>Đóng</button></div>':'<h3>Office</h3><p>Chat connects directly to Javis. Scene movement and leisure are simulated.</p><div class="modal-actions"><button class="btn" data-close>Close</button></div>');
let rosterRender;
window.addEventListener('office-language',()=>{if(document.querySelector('#roster-list'))rosterRender?.();});
$('#btn-roster').onclick=()=>{
 const statuses=['unknown','idle','queued','working','waiting','error','offline'];
 openModal(ui`<h3>Employees</h3><div class="row2"><input id="roster-search" placeholder="Filter employees" aria-label="Filter employees"><select id="roster-status"><option value="all">All statuses</option>${statuses.map(k=>'<option value="'+k+'">'+tr(k==='unknown'?'Unknown':k[0].toUpperCase()+k.slice(1))+'</option>').join('')}</select></div><select id="roster-department"><option value="all">All departments</option>${state.departments.map(d=>'<option data-user-content value="'+esc(d.id)+'">'+esc(window.__officeUi.deptDisplayName(d.id))+'</option>').join('')}</select><div id="roster-list"></div><div class="modal-actions"><button class="btn" data-close>Close</button></div>`);
 const render=()=>{const q=$('#roster-search').value.toLowerCase(),st=$('#roster-status').value,de=$('#roster-department').value;const rows=state.agents.filter(a=>(a.name+' '+a.role+' '+(a.canonicalIdentity?.name||'')+' '+(a.canonicalIdentity?.role||'')).toLowerCase().includes(q)&&(st==='all'||st===a.status)&&(de==='all'||de===a.departmentId));$('#roster-list').innerHTML=rows.map(a=>ui`<div class="sess"><b data-user-content>${esc(a.name)}</b><p data-user-content title="${esc(a.description||a.role)}">${esc(a.role)}</p><small data-user-content>${esc(identityNotice(a,getLanguage()))}</small><small>${tr(a.status==='unknown'?'Unknown':a.status[0].toUpperCase()+a.status.slice(1))} · ${tr(a.dataSource==='LIVE'?'Connected':a.dataSource==='DEMO'?'Scene preview':'Local')}</small><p><button class="btn small" data-inspect="${esc(a.id)}">Inspect</button></p></div>`).join('')||tr('No matching employees.');localizeDom();};
 rosterRender=render;$('#roster-search').oninput=render;$('#roster-status').onchange=render;$('#roster-department').onchange=render;$('#roster-list').onclick=e=>{const b=e.target.closest('[data-inspect]');if(b){closeModal();openPanel(b.dataset.inspect);}};render();
};
async function history(selected){openModal(ui`<h3>Task history</h3><div id="history-list">Loading...</div><div class="modal-actions"><button class="btn" data-close>Close</button></div>`);const tasks=await api(selected?'/agents/'+encodeURIComponent(selected)+'/tasks':'/tasks');const box=$('#history-list');if(!box)return;box.innerHTML=(state.javisViewer?.readOnly?'<p class="warnbox">'+tr('Task history is not available yet.')+'</p>':'')+(tasks.map(t=>ui`<div class="sess"><b data-user-content>${esc(t.prompt)}</b><p>${tr(({done:'Completed',running:'Working',queued:'Queued',failed:'Failed',cancelled:'Cancelled'})[t.status]||t.status)} · ${new Date(t.createdAt).toLocaleString(getLanguage()==='vi'?'vi-VN':'en-GB',{dateStyle:'short',timeStyle:'short'})}</p><pre data-user-content>${esc(t.result||'')}</pre></div>`).join('')||tr('No observed task history.'));localizeDom();}
$('#btn-history').onclick=()=>history();$('#p-history').onclick=()=>history(window.__office.selectedId);
$('#btn-demo').onclick=()=>{
 if(isDemoActive())return;
 const t=demoPickText(),items=demoCatalog();
 openModal(ui`<h3>${esc(t.pick)}</h3><p>${esc(t.note)}</p>`+items.map(x=>'<button class="btn demo-pick" data-demo="'+x.id+'"><b>'+esc(x.name)+'</b><span>'+esc(x.desc)+'</span></button>').join('')+ui`<div class="modal-actions"><button class="btn" id="demo-reset">Disconnect / reset</button><button class="btn" data-close>Close</button></div>`);
 document.querySelectorAll('[data-demo]').forEach(b=>b.onclick=()=>{const r=startDemo(b.dataset.demo,state);if(r.ok)closeModal();else{const n=document.createElement('p');n.className='warnbox';n.textContent=r.reason;b.after(n);}});
 $('#demo-reset').onclick=async()=>{await api('/javis-viewer/mock/reset','POST',{});closeModal();await loadState();};
};
window.__returnToLive=()=>returnToLive();
window.addEventListener('office-state',modeLabel);window.addEventListener('office-language',modeLabel);modeLabel();localizeDom();

window.addEventListener('office-language',()=>{const sel=$('#roster-department');if(sel)for(const option of sel.options){if(option.value!=='all')option.textContent=window.__officeUi.deptDisplayName(option.value);}$('#roster-search')?.dispatchEvent(new Event('input'));});
