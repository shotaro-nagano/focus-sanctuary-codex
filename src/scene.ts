import * as THREE from 'three';
import { gsap } from 'gsap';

export type SceneMode = 'focus' | 'short' | 'long';
export type SceneStatus = 'idle' | 'running' | 'paused';

// Closed, variable-section ribbons. Each cross-section is an ellipse rather than
// an open plane, so the silhouette and the glass have real geometric thickness.
function ribbon(kind: 'shell' | 'glass', phase: number) {
  const length = 150, sides = 16;
  const positions: number[] = [], indices: number[] = [];
  for (let i = 0; i <= length; i++) {
    const u = i / length, t = Math.PI * u, taper = Math.pow(Math.sin(t), .72);
    const angle = phase + u * (kind === 'shell' ? 3.5 : 7.8);
    const r = kind === 'shell' ? .23 + 1.40 * taper : .31 + .60 * taper;
    const y = (u - .5) * (kind === 'shell' ? 4.65 : 3.6);
    const width = kind === 'shell' ? .025 + .56 * taper : .045 + .28 * taper;
    for (let j = 0; j <= sides; j++) {
      const v = j / sides * Math.PI * 2;
      const across = Math.cos(v) * width;
      const thickness = Math.sin(v) * (kind === 'shell' ? .062 : .105) * (.35 + taper);
      const rr = r + thickness + .08 * Math.sin(u * 11 + phase) * taper;
      positions.push(Math.cos(angle) * rr - Math.sin(angle) * across,
        y + across * .3 * Math.sin(angle), Math.sin(angle) * rr + Math.cos(angle) * across);
      if (i < length && j < sides) {
        const a = i * (sides + 1) + j, b = a + sides + 1;
        indices.push(a,a+1,b,b,a+1,b+1);
      }
    }
  }
  for(let j=1;j<sides-1;j++){
    indices.push(0,j,j+1);
    const end=length*(sides+1);indices.push(end,end+j+1,end+j);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setIndex(indices); geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function lightEnvironment(renderer: THREE.WebGLRenderer) {
  const room = new THREE.Scene();
  room.background = new THREE.Color('#171b24');
  const card = (color: string, intensity: number, pos: number[], scale: number[]) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1,1),
      new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(intensity),side:THREE.DoubleSide}));
    mesh.position.set(...pos as [number,number,number]);
    mesh.scale.set(...scale as [number,number,number]); mesh.lookAt(0,0,0); room.add(mesh);
  };
  card('#ffffff',7,[-4,3,4],[2,8,1]);
  card('#dde6ff',5,[5,1,2],[1.6,7,1]);
  card('#ffffff',8,[0,6,-2],[6,1.5,1]);
  card('#c8dcff',3,[-4,-2,-4],[3,5,1]);
  card('#d9ff62',2,[4,-2,-3],[1,5,1]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(room,.035,.1,30);
  room.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});
  pmrem.dispose(); return target;
}

export class SanctuaryScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34,1,.1,80);
  root = new THREE.Group();
  shells: THREE.Mesh[] = [];
  ribbons: THREE.Mesh[] = [];
  orbit = new THREE.Group();
  particles: THREE.Points;
  core: THREE.Mesh;
  light: THREE.PointLight;
  glow: THREE.Sprite;
  mode: SceneMode = 'focus';
  status: SceneStatus = 'idle';
  reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  quality: 'high' | 'medium';
  progress = 0;
  private smoothProgress = 0;
  private time = 0;
  private speed = 1;
  private prev = 0;
  private raf = 0;
  private mobile = false;
  private pointer = new THREE.Vector2();
  private drag = new THREE.Vector2();
  private dragTarget = new THREE.Vector2();
  private pointerDown?: { x: number; y: number };
  private p = { open:0, twist:0, distance:10.5, orbit:0, r:.85,g:1,b:.25 };
  private shot = { intro:0, release:0, collapse:0, flash:0, turn:0 };
  private activation = { value:0 };
  private activationTween?:gsap.core.Tween;
  private uniforms = { clock:{value:0}, progress:{value:0} };
  private introTimeline?: gsap.core.Timeline;
  private completionTimeline?: gsap.core.Timeline;
  private modeTween?: gsap.core.Tween;
  private environment: THREE.WebGLRenderTarget;
  private cleanups: (()=>void)[] = [];
  private active = true;

  constructor(private container: HTMLElement, private report: (message: string)=>void) {
    const qualityParam = new URLSearchParams(location.search).get('quality');
    this.quality = qualityParam === 'high' ? 'high' : qualityParam === 'medium' || innerWidth < 700 ? 'medium' : 'high';
    this.renderer = new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
    this.renderer.setClearColor(0x000000,0);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,this.quality==='high'?1.75:1.25));
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.05;
    this.renderer.transmissionResolutionScale = this.quality==='high' ? .75 : .4;
    this.renderer.domElement.setAttribute('aria-label','ドラッグして浮遊彫刻の角度を変える');
    container.append(this.renderer.domElement);
    this.environment=lightEnvironment(this.renderer); this.scene.environment=this.environment.texture;
    this.scene.environmentIntensity=.8;
    this.scene.add(this.root);
    for(let i=0;i<3;i++) {
      const material=new THREE.MeshPhysicalMaterial({color:'#d5d9e0',metalness:1,roughness:.16+i*.025,
        clearcoat:1,clearcoatRoughness:.13,envMapIntensity:1.3});
      material.onBeforeCompile=shader=>{
        shader.uniforms.uClock=this.uniforms.clock;shader.uniforms.uProgress=this.uniforms.progress;
        shader.vertexShader='uniform float uClock; uniform float uProgress;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\ntransformed += normal * (sin(position.y * 3.2 + uClock * .7 + '+i.toFixed(1)+') * .018 + uProgress * .028 * sin(position.y * 2.));');
      };
      const mesh=new THREE.Mesh(ribbon('shell',i*Math.PI*2/3+.3),material);
      mesh.scale.setScalar([1,.94,1.04][i]);this.root.add(mesh);this.shells.push(mesh);
    }
    for(let i=0;i<2;i++){
      const mesh=new THREE.Mesh(ribbon('glass',i*Math.PI+.25),new THREE.MeshPhysicalMaterial({
        color:i===0?'#f2fcff':'#fff6ff',metalness:0,roughness:.045,transmission:1,thickness:.4,
        ior:1.42,dispersion:1.8,iridescence:.25,iridescenceIOR:1.35,iridescenceThicknessRange:[150,450],
        attenuationColor:'#d4f4ed',attenuationDistance:4,envMapIntensity:.65}));
      this.root.add(mesh);this.ribbons.push(mesh);
    }
    const nucleusGeo=new THREE.IcosahedronGeometry(.29,5);
    const attr=nucleusGeo.getAttribute('position');
    for(let i=0;i<attr.count;i++){
      const y=attr.getY(i),scale=.57+.1*Math.sin(y*23);attr.setXYZ(i,attr.getX(i)*scale,y*1.8,attr.getZ(i)*scale);
    }
    nucleusGeo.computeVertexNormals();
    this.core=new THREE.Mesh(nucleusGeo,new THREE.MeshPhysicalMaterial({color:'#d9ff62',emissive:'#b0ed32',emissiveIntensity:2,roughness:.22,metalness:.45}));
    this.root.add(this.core);
    this.light=new THREE.PointLight('#d9ff62',8,9,2);this.root.add(this.light);
    const glowCanvas=document.createElement('canvas');glowCanvas.width=128;glowCanvas.height=128;
    const ctx=glowCanvas.getContext('2d')!;
    const gradient=ctx.createRadialGradient(64,64,0,64,64,64);
    gradient.addColorStop(0,'rgba(255,255,255,.8)');gradient.addColorStop(.2,'rgba(255,255,255,.24)');gradient.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
    this.glow=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(glowCanvas),color:'#d9ff62',transparent:true,opacity:.44,blending:THREE.AdditiveBlending,depthWrite:false}));
    this.glow.scale.setScalar(2.5);this.root.add(this.glow);
    this.root.add(this.orbit);
    for(let i=0;i<7;i++){
      const points:THREE.Vector3[]=[];
      for(let j=0;j<=60;j++){
        const angle=i*.98+j/60*(i%2?.55:1.35),r=2.05+i*.035;
        points.push(new THREE.Vector3(Math.cos(angle)*r,Math.sin(angle)*r*.85,Math.sin(angle)*.3));
      }
      const curve=new THREE.CatmullRomCurve3(points);
      const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,60,i%3===0?.012:.006,5,false),
        new THREE.MeshStandardMaterial({color:i%3===0?'#d9ff62':'#a3abb8',emissive:i%3===0?'#a1d33a':'#344051',emissiveIntensity:.9,metalness:.7,roughness:.25}));
      this.orbit.add(mesh);
    }
    const count=this.quality==='high'?600:280, coords=new Float32Array(count*3);
    // Deterministic seed, the composition is reproducible on each reload.
    let seed=71;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
    for(let i=0;i<count;i++){coords[i*3]=(rand()-.5)*19;coords[i*3+1]=(rand()-.5)*12;coords[i*3+2]=(rand()-.5)*13;}
    const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(coords,3));
    this.particles=new THREE.Points(pg,new THREE.PointsMaterial({color:'#bac6a4',size:.015,transparent:true,opacity:.52,sizeAttenuation:true,depthWrite:false}));this.scene.add(this.particles);
    const shadowCanvas=document.createElement('canvas');shadowCanvas.width=128;shadowCanvas.height=128;
    const sc=shadowCanvas.getContext('2d')!,sg=sc.createRadialGradient(64,64,0,64,64,64);
    sg.addColorStop(0,'rgba(150,180,105,.34)');sg.addColorStop(.5,'rgba(80,105,60,.08)');sg.addColorStop(1,'transparent');
    sc.fillStyle=sg;sc.fillRect(0,0,128,128);
    const pool=new THREE.Mesh(new THREE.PlaneGeometry(6,6),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));
    pool.position.y=-3.28;pool.rotation.x=-Math.PI/2;this.scene.add(pool);
    // Fine luminous strands behind the glass expose the transmission distortion.
    for(let i=0;i<3;i++){
      const strand:THREE.Vector3[]=[];
      for(let j=0;j<100;j++){const u=j/99,a=u*6.2+i*2.1;strand.push(new THREE.Vector3(Math.cos(a)*.45,(u-.5)*2.7,Math.sin(a)*.45-.2));}
      const filament=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(strand),100,.008,4,false),new THREE.MeshBasicMaterial({color:i===1?'#c6e5ff':'#e2ff92'}));this.root.add(filament);
    }
    const key=new THREE.DirectionalLight('#ffffff',3);key.position.set(-3,5,5);this.scene.add(key);
    const rim=new THREE.DirectionalLight('#a3c8ff',2);rim.position.set(4,2,-3);this.scene.add(rim);
    this.scene.add(new THREE.AmbientLight('#c2d0e5',.4));
    this.bind();this.resize();this.raf=requestAnimationFrame(this.frame);
    this.report('');
  }

  private on(target: EventTarget, event: string, listener: EventListener) {
    target.addEventListener(event,listener);this.cleanups.push(()=>target.removeEventListener(event,listener));
  }
  private bind(){
    this.on(window,'resize',()=>this.resize());
    this.on(window,'pointermove',(e)=>{const ev=e as PointerEvent;
      this.pointer.set((ev.clientX/innerWidth-.5)*2,(ev.clientY/innerHeight-.5)*2);
      if(this.pointerDown)this.dragTarget.set(THREE.MathUtils.clamp((ev.clientX-this.pointerDown.x)*.004,-.8,.8),THREE.MathUtils.clamp((ev.clientY-this.pointerDown.y)*.003,-.5,.5));
    });
    this.on(this.renderer.domElement,'pointerdown',(e)=>{const ev=e as PointerEvent;this.pointerDown={x:ev.clientX,y:ev.clientY};this.renderer.domElement.setPointerCapture(ev.pointerId);});
    this.on(window,'pointerup',()=>{this.pointerDown=undefined;this.dragTarget.set(0,0);});
    this.on(window,'pointercancel',()=>{this.pointerDown=undefined;this.dragTarget.set(0,0);});
    this.on(document,'visibilitychange',()=>{
      if(document.hidden){cancelAnimationFrame(this.raf);this.introTimeline?.pause();this.completionTimeline?.pause();this.modeTween?.pause();}
      else{this.prev=0;this.introTimeline?.resume();this.completionTimeline?.resume();this.modeTween?.resume();this.raf=requestAnimationFrame(this.frame);}
    });
    this.on(this.renderer.domElement,'webglcontextlost',(e)=>{e.preventDefault();this.active=false;cancelAnimationFrame(this.raf);this.report('3Dの描画が中断されました。タイマーは動作中です。再読み込みで復帰できます。');});
    this.on(this.renderer.domElement,'webglcontextrestored',()=>{this.active=true;this.report('');this.prev=0;this.raf=requestAnimationFrame(this.frame);});
    const mq=matchMedia('(prefers-reduced-motion: reduce)');this.on(mq,'change',()=>{this.reduced=mq.matches;if(this.reduced){this.introTimeline?.progress(1);this.completionTimeline?.progress(1);this.modeTween?.progress(1);}});
  }
  private resize(){
    const w=this.container.clientWidth,h=this.container.clientHeight;
    this.mobile=w<700;this.camera.aspect=w/h;this.camera.fov=this.mobile?39:34;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);
  }
  setMode(mode:SceneMode, immediate=false){
    this.mode=mode;
    const values=mode==='focus'?{open:0,twist:0,distance:10.5,orbit:0,r:.85,g:1,b:.25}:
      mode==='short'?{open:.62,twist:.48,distance:11.5,orbit:.7,r:.5,g:.87,b:1}:
      {open:1.05,twist:-.38,distance:12.3,orbit:-.7,r:1,g:.72,b:.51};
    this.modeTween?.kill();this.modeTween=gsap.to(this.p,{...values,duration:immediate||this.reduced?0:1.5,ease:'power2.inOut'});
  }
  setStatus(status:SceneStatus){
    const previous=this.status;this.status=status;
    if(status==='running'&&previous==='idle'&&!this.reduced){this.activationTween?.kill();this.activation.value=.4;this.activationTween=gsap.to(this.activation,{value:0,duration:1.4,ease:'power2.inOut'});}
  }
  replay(){
    this.introTimeline?.kill();
    if(this.reduced){this.shot.intro=0;return;}
    this.shot.intro=1;
    this.introTimeline=gsap.timeline().to(this.shot,{intro:0,duration:3,ease:'power3.inOut'});
  }
  complete(onFinish?:()=>void){
    this.introTimeline?.kill();this.shot.intro=0;
    this.completionTimeline?.kill();Object.assign(this.shot,{release:0,collapse:0,flash:0,turn:0});
    if(this.reduced){onFinish?.();return;}
    this.completionTimeline=gsap.timeline({onComplete:onFinish})
      .to(this.shot,{collapse:1,duration:.55,ease:'power2.in'},0)
      .to(this.shot,{collapse:0,release:1,turn:.45,duration:1.15,ease:'expo.out'},.55)
      .to(this.shot,{flash:1,duration:.65,ease:'power2.out'},.8)
      .to(this.shot,{flash:0,duration:1.4},1.45)
      .to(this.shot,{release:0,turn:0,duration:1.8,ease:'power3.inOut'},2.1);
  }
  private frame=(now:number)=>{
    if(!this.active)return;
    const dt=this.prev?Math.min((now-this.prev)/1000,.05):0;this.prev=now;
    const targetSpeed=this.reduced?0:this.status==='paused'?0:this.status==='running'?1.2:.55;
    this.speed=this.reduced?0:THREE.MathUtils.damp(this.speed,targetSpeed,3,dt);this.time+=dt*this.speed;
    this.smoothProgress=THREE.MathUtils.damp(this.smoothProgress,this.progress,2,dt);
    this.uniforms.clock.value=this.time;this.uniforms.progress.value=this.smoothProgress;
    const t=this.time,s=this.shot,p=this.p;
    this.drag.lerp(this.dragTarget,1-Math.exp(-dt*5));
    const px=this.reduced?0:this.pointer.x,py=this.reduced?0:this.pointer.y;
    const rx=.16+this.drag.y+py*.045,ry=-.2+this.drag.x+px*.12+p.twist+s.turn;
    this.root.rotation.x=THREE.MathUtils.damp(this.root.rotation.x,rx,4,dt);
    this.root.rotation.y=THREE.MathUtils.damp(this.root.rotation.y,ry,4,dt);
    this.root.rotation.z=-.38+Math.sin(t*.22)*.025;
    this.root.position.y=.20+Math.sin(t*.55)*.065;
    const opening=p.open+s.release*1.65-s.collapse*.42+this.activation.value-(this.status==='running'?.07:0)+this.smoothProgress*.14;
    this.shells.forEach((mesh,i)=>{
      const a=i*Math.PI*2/3+.3;
      mesh.position.set(Math.cos(a)*opening,Math.sin(a)*opening*.35,Math.sin(a)*opening);
      mesh.rotation.set(Math.sin(t*.26+i)*.035+opening*.13,Math.sin(t*.18+i)*.045+opening*(i-1)*.35,opening*(i-1)*.14);
      mesh.scale.y=(i===1?.94:i===2?1.04:1)*(1+s.intro*.6-s.collapse*.15);
    });
    this.ribbons.forEach((m,i)=>{m.rotation.y=t*(i?-.13:.095)+p.twist*2; m.rotation.z=Math.sin(t*.4+i)*.09; m.scale.setScalar(1+opening*.32+s.release*.25+this.smoothProgress*.18);});
    this.orbit.rotation.set(.65+p.orbit+Math.sin(t*.17)*.08,.28+t*.035,t*.075+p.twist);
    this.orbit.scale.setScalar(1+opening*.2-s.collapse*.55+s.flash*.6);
    this.particles.rotation.y=t*.017;this.particles.rotation.z=Math.sin(t*.08)*.035;
    this.particles.scale.setScalar(1-s.collapse*.7+s.flash*.5);
    const color=new THREE.Color(p.r,p.g,p.b);
    const cm=this.core.material as THREE.MeshPhysicalMaterial;cm.color.copy(color);cm.emissive.copy(color);
    cm.emissiveIntensity=(this.status==='running'?2.6:1.4)+Math.sin(t*1.7)*.15+s.flash*2;
    this.core.scale.setScalar(1+Math.sin(t*1.7)*.035+s.collapse*.35+s.flash*.4);
    this.core.rotation.y=t*.4;
    this.light.color.copy(color);this.light.intensity=7+s.flash*10;this.light.position.x=px*.3;
    this.glow.material.color.copy(color);this.glow.scale.setScalar(2.3+s.flash*3);
    this.glow.material.opacity=this.quality==='high'?.36+s.flash*.2:.26+s.flash*.15;
    const distance=p.distance+(this.mobile?.7:0)-s.intro*7+s.release*.8;
    this.camera.position.set(px*.22+s.intro*1.8,py*-.13+s.intro*.8,distance);
    this.camera.lookAt(this.mobile?0:-.1,s.intro*.7+.12,0);
    this.renderer.render(this.scene,this.camera);
    this.raf=requestAnimationFrame(this.frame);
  };
  dispose(){
    cancelAnimationFrame(this.raf);this.introTimeline?.kill();this.completionTimeline?.kill();this.modeTween?.kill();this.activationTween?.kill();
    this.cleanups.forEach(fn=>fn());
    this.scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Points||o instanceof THREE.Sprite){if('geometry'in o)o.geometry.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms){if('map'in m)(m.map as THREE.Texture|null)?.dispose();m.dispose();}}});
    this.environment.dispose();this.renderer.dispose();this.renderer.domElement.remove();
  }
}
