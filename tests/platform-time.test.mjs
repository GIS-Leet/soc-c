// 실제 경과 시간에 따른 시뮬레이션 속도와 중단 동작을 검증한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createElapsedClock, advancePhase, approach} from '../assets/simulation-time.mjs';
test('30/60/120Hz에서 같은 물리 시간은 같은 결과다',()=>{
 const results=[30,60,120].map(hz=>{const clock=createElapsedClock();let phase=6,sea=0;clock.tick(0);for(let i=1;i<=hz*10;i++){const dt=clock.tick(i*1000/hz);phase=advancePhase(phase,.9,dt,1,13);sea=approach(sea,25,.05,dt);}return {phase,sea};});
 for(const result of results){assert.ok(Math.abs(result.phase-3)<1e-9);assert.ok(Math.abs(result.sea-results[0].sea)<1e-9);}
});
test('일시 정지와 숨겨진 페이지 복귀는 시간을 누적하지 않는다',()=>{const clock=createElapsedClock();assert.equal(clock.tick(0),0);assert.equal(clock.tick(100,false),0);assert.equal(clock.tick(5000),0);assert.equal(clock.tick(5010),.01);assert.equal(clock.tick(10000),0);assert.equal(approach(3,9,.05,0),3);});

// 페이지가 공통 시간 함수를 실제 움직임과 일시 정지에 연결하는지 검증한다.
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('계절 페이지의 일시 정지는 공전·자전·배경 회전을 모두 멈춘다',async()=>{
 const html=await readFile(new URL('../climate_3d.html',import.meta.url),'utf8');
 const body=html.slice(html.indexOf('        function animate(timestamp) {'),html.indexOf('        // 최초 1회 실행'));
 const context={createElapsedClock,advancePhase,clock:createElapsedClock(),requestAnimationFrame(){},isPlaying:false,document:{hidden:false},orbitMonth:6,monthSlider:{value:6,setAttribute(){}},updateSimulation(){},earth:{rotation:{y:0}},starField:{rotation:{y:0}},controls:{update(){}},renderer:{render(){}},scene:{},camera:{}};
 vm.createContext(context);vm.runInContext(body,context);context.animate(0);context.animate(100);assert.equal(context.earth.rotation.y,0);assert.equal(context.starField.rotation.y,0);assert.equal(context.orbitMonth,6);
 context.isPlaying=true;context.animate(200);context.animate(300);assert.ok(Math.abs(context.earth.rotation.y-.3)<1e-9);assert.ok(Math.abs(context.orbitMonth-6.09)<1e-9);
 context.document.hidden=true;context.animate(400);context.document.hidden=false;context.animate(9000);assert.ok(Math.abs(context.earth.rotation.y-.3)<1e-9);
});
test('일시 정지 중 해수면 수동 조작도 숫자 표시를 갱신한다',async()=>{
 const html=await readFile(new URL('../terrain.html',import.meta.url),'utf8'),line=html.split('\n').find(x=>x.includes('seaInput.oninput ='));
 const context={seaInput:{value:'25'},seaVal:{innerText:'5m'},motionPaused:true,water:{position:{y:5}},targetSeaLevel:5};vm.createContext(context);vm.runInContext(line,context);context.seaInput.oninput();assert.equal(context.water.position.y,25);assert.equal(context.seaVal.innerText,'25m');
});
test('인라인 모듈의 의존성 로드 실패도 대체 안내를 표시한다',async()=>{
 for(const page of ['climate_3d.html','climate_itcz.html','terrain.html']){
 const html=await readFile(new URL('../'+page,import.meta.url),'utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1],handlers={},notice={hidden:true};const context={window:{addEventListener:(event,fn)=>handlers[event]=fn},document:{getElementById:()=>notice,addEventListener(){}}};vm.createContext(context);vm.runInContext(script,context);handlers.error({target:{tagName:'SCRIPT',src:'',type:'module'}});assert.equal(notice.hidden,false,page);
 }
});
test('진도표는 데이터 수신 전과 수신 후 오류를 빈 성공과 구분한다',async()=>{
 const html=await readFile(new URL('../progress.html',import.meta.url),'utf8'),body=html.slice(html.indexOf('    function render() {'),html.indexOf('    function renderDash(total)'));
 const heading={},empty={hidden:true,querySelector:()=>heading},message={},seed={};const context={lessons:[{}],loadError:'network',loaded:false,isAdmin:false,document:{getElementById:id=>id==='empty'?empty:id==='emptyMsg'?message:seed},renderDash(){},renderPicker(){},renderUnits(){},syncAdminInputs(){},window:{},firstPaint:true};vm.createContext(context);vm.runInContext(body,context);context.render();assert.equal(empty.hidden,false);assert.match(heading.textContent,/불러오지 못/);context.loadError=null;context.lessons=[];context.render();assert.match(heading.textContent,/불러오는 중/);
});
