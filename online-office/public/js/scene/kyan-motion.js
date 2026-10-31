import * as THREE from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
export const KYAN_BINDINGS=Object.freeze({'fixture-kyan|kyan':'louise'});
export const identityKey=(brainId,agent)=>String(brainId||'')+'|'+String(agent.canonicalAgentId||agent.id||'').replace(/^slug:/,'');
// An independent authored idle clip on the ORIGINAL Mixamo skeleton. Full-pose tracks
// prevent the seated clip bleeding into legs. Walk and seated motion remain original.
export function standingIdle(ch,clips){
 const rest=clone(ch.scene),sample=clone(ch.scene),mix=new THREE.AnimationMixer(sample);mix.clipAction(clips.walk).play();mix.setTime(clips.walk.duration*.25);
 const times=[0,1.5,3,4.5,6],tracks=[];
 rest.traverse(b=>{if(!b.isBone)return;const q=b.quaternion.clone();if(/(Arm|ForeArm|Hand)/.test(b.name)){const a=sample.getObjectByName(b.name);if(a)q.copy(a.quaternion);}
 const values=[];for(const t of times){const k=q.clone();if(/Spine1$/.test(b.name))k.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.sin(t*Math.PI/3)*.008));values.push(...k.toArray());}tracks.push(new THREE.QuaternionKeyframeTrack(b.name+'.quaternion',times,values));
 if(b.name==='mixamorigHips')tracks.push(new THREE.VectorKeyframeTrack(b.name+'.position',[0,6],[...b.position.toArray(),...b.position.toArray()]));});
 mix.stopAllAction();mix.uncacheRoot(sample);return new THREE.AnimationClip('standingIdle',6,tracks);
}
