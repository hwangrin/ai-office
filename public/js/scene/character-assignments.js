// Stable explicit assignments; IDs do not change Javis identities.
export const CHARACTER_ASSIGNMENTS=Object.freeze({'ly-ly-zalo':'sophie','ly-ly':'sophie',leon:'josh'});
const aliases={'ly ly':'sophie','ly ly zalo':'sophie',leon:'josh'};
const normalize=s=>String(s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[-_]+/g,' ').trim().replace(/ +/g,' ');
export function assignedCharacter(agent){
 const a=typeof agent==='string'?{id:agent}:agent;
 const explicit=CHARACTER_ASSIGNMENTS[a.id];if(explicit)return explicit;
 let saved={};try{saved=JSON.parse(localStorage.getItem('office.characterAssignments')||'{}');}catch{}
 if(['sophie','josh'].includes(saved[a.id]))return saved[a.id];
 const chosen=aliases[normalize(a.id)]||aliases[normalize(a.name)];
 if(chosen&&a.id){saved[a.id]=chosen;try{localStorage.setItem('office.characterAssignments',JSON.stringify(saved));}catch{}}
 return chosen||null;
}
