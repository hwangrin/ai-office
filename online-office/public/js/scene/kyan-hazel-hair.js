// Exact Hazel mesh/material extraction from the historical MPFB V1, fitted to Louise.
// Only this new geometry is transformed/reweighted. No body or original asset is changed.
import * as THREE from 'three';
export function attachHazelHair(person,source){
 source.updateMatrixWorld(true);const original=[];source.traverse(o=>{if(o.isMesh)original.push(o)});
 if(original.length!==1)throw Error('Expected exact single Hazel mesh');
 const src=original[0],geometry=src.geometry.clone();geometry.applyMatrix4(src.matrixWorld);
 const positions=geometry.attributes.position,indices=[],weights=[];
 for(let i=0;i<positions.count;i++){
  let x=(positions.getX(i)+.00225)*1.10,y=1.755+(positions.getY(i)-1.88077438)*1.10,z=positions.getZ(i)*1.08-.005;
  const lower=THREE.MathUtils.smoothstep(1.55-y,0,.25);
  if(z<-.025)z-=.045*lower;
  if(z>.06)z=THREE.MathUtils.lerp(z,Math.max(z,.185),lower);
  positions.setXYZ(i,x,y,z);
  const torso=THREE.MathUtils.smoothstep(1.53-y,0,.20)*.95;
  const neck=Math.sin(Math.PI*THREE.MathUtils.clamp((1.58-y)/.28,0,1))*.25*(1-torso);
  indices.push(0,1,2,0);weights.push(1-torso-neck,neck,torso,0);
 }
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData.shared=true;
 const materials=[].concat(src.material).map(m=>{const c=m.clone();c.userData.shared=false;for(const t of [c.map,c.normalMap])if(t)t.userData.shared=true;person.materials.push(c);return c;});
 const hair=new THREE.SkinnedMesh(geometry,materials.length===1?materials[0]:materials);hair.name='Kyan_Hazel_Hair_transplanted';hair.frustumCulled=false;hair.castShadow=true;hair.receiveShadow=true;hair.userData.dynamic=true;hair.userData.sourceMesh='elvs_hazel_hair';person.model.add(hair);person.root.updateMatrixWorld(true);
 const bones=['mixamorigHead','mixamorigNeck','mixamorigSpine2'].map(n=>person.model.getObjectByName(n));if(bones.some(b=>!b))throw Error('Louise head/neck/upper-back bone missing');
 const skeleton=new THREE.Skeleton(bones,bones.map(b=>b.matrixWorld.clone().invert()));hair.bind(skeleton,hair.matrixWorld.clone());hair.normalizeSkinWeights();hair.userData.transplant='Original MPFB Hazel mesh; 3 influences on existing Louise bones, no MPFB skeleton';person.hazelHair=hair;person.transplantGeometry=geometry;
 person.model.traverse(o=>{if(o.name==='Ch07_Hair')o.visible=false;});
 return hair;
}
