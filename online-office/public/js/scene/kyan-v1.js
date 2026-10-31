// Kyan-specific clone of the recovered café character. Shared Louise GLB stays immutable.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {attachHazelHair} from './kyan-hazel-hair.js';
import {MixamoPerson} from './mixamo.js';
import {KYAN_BINDINGS,identityKey,standingIdle} from './kyan-motion.js';
export class KyanLibrary {
 async load(people){this.people=people;this.character=people.chars.find(c=>c.id==='louise');this.hair=(await new GLTFLoader().loadAsync('/office/models/kyan-v1/hazel-hair-original.glb')).scene;return !!this.character;}
 create(agent){const key=identityKey(this.brainId,agent);if(!KYAN_BINDINGS[key])return null;if(!this.character)throw Error('Kyan Louise asset unavailable: refusing random character assignment');return new KyanPerson(agent.id,this.character,this.people.clipsFor(this.character),this.people.manifest.states,key,this.hair);}
}
function tintedMap(map,hex,minimum){
 const image=map?.image;if(!image)return null;const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,c.width,c.height),color=new THREE.Color(hex).convertLinearToSRGB();
 for(let i=0;i<data.data.length;i+=4){const lum=(.2126*data.data[i]+.7152*data.data[i+1]+.0722*data.data[i+2])/255;const shade=Math.min(1,minimum+lum*.65);data.data[i]=color.r*255*shade;data.data[i+1]=color.g*255*shade;data.data[i+2]=color.b*255*shade;}
 ctx.putImageData(data,0,0);const t=new THREE.CanvasTexture(c);t.flipY=map.flipY;t.colorSpace=map.colorSpace;t.wrapS=map.wrapS;t.wrapT=map.wrapT;t.userData.shared=false;return t;
}
export class KyanPerson extends MixamoPerson {
 constructor(id,ch,clips,states,key,hair){super(id,ch,{...clips,standingIdle:standingIdle(ch,clips)},states);this.identityKey=key;this.sourceCharacterId='louise';this.root.name='Kyan · exclusive Louise appearance';this.ownedTextures=[];
 this.model.traverse(o=>{if(!o.isMesh)return;const spec=o.name.includes('_Suit')?['#eee3cf',.72]:o.name.includes('_Shirt')?['#b67f89',.65]:o.name.includes('_Pants')?['#34343a',.4]:null;if(!spec)return;for(const m of [].concat(o.material)){const t=tintedMap(m.map,...spec);if(t){m.map=t;this.ownedTextures.push(t);m.color.set('#ffffff');if(o.name.includes('_Hair')){m.opacity=1;m.transparent=false;m.alphaTest=.45;m.depthWrite=true;m.side=THREE.DoubleSide;m.roughness=.8;m.metalness=0;}m.needsUpdate=true;}}});
 // Fit/bind in the known standing reference pose; all original motion clips remain untouched.
 this.mixer.stopAllAction();this.current=null;super.play('standingIdle',0);this.mixer.update(0);this.root.updateMatrixWorld(true);
 if(!hair)throw Error('Original Hazel transplant unavailable: refusing bun substitution');attachHazelHair(this,hair);
 this.scenePreview=true;this.sittingDisabled=false;this.previewPaused=false;
 }
 loopFor(status){return this.poseStanding?'standingIdle':super.loopFor(status);}
 idleSet(){return this.poseStanding?['standingIdle']:super.idleSet();}
 place(x,h,z,facing){super.place(x,h,z,facing);if(!this.initialPlaced){this.initialPlaced=true;this.standAnchor=new THREE.Vector3(x+2,0,z+2);this.standFacing=facing;this.previewStanding();}}
 previewStanding(){this.trip=null;this.setProp(null);this.poseStanding=true;this.previewPaused=false;this.anchor.copy(this.standAnchor);this.root.position.copy(this.anchor);this.root.rotation.y=this.standFacing;this.standing=1;this.baseY=0;super.play('standingIdle',.35);this.mode='standing idle';}
 travel(args){this.poseStanding=false;this.previewPaused=false;this.mode='walk → sit';super.travel(args);}
 arrive(seat){this.poseStanding=false;super.arrive(seat);this.mode='seated idle';}
 update(t,dt){if(this.previewPaused)return;super.update(t,dt);this.mode=this.trip?'walk · '+this.trip.phase:(this.current?.getClip().name||'idle');}
 dispose(){this.transplantGeometry?.dispose();this.ownedTextures.forEach(t=>t.dispose());super.dispose();}
}
