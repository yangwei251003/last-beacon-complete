import test from 'node:test';
import assert from 'node:assert/strict';
import {solveGrid} from '../src/power.js';
import {Game} from '../src/game.js';
const line=(id,a,b,capacity=20)=>({id,a,b,capacity,closed:true});
test('island battery respects output and energy conservation',()=>{
 const b={id:'b',node:'island',energy:12,energyMax:30,maxOutput:4,maxCharge:2};
 const result=solveGrid({batteries:[b],loads:[{id:1,node:'island',demand:3}],dt:2});
 assert.equal(result.assignments[0].powered,true);assert.equal(result.assignments[0].connected,false);assert.equal(b.energy,6);assert.equal(b.output,3);
 const second=solveGrid({batteries:[b],loads:[{id:1,node:'island',demand:5}],dt:1});assert.equal(second.assignments[0].powered,false);assert.equal(b.energy,6);
 solveGrid({batteries:[b],loads:[{id:1,node:'island',demand:3}],dt:2});assert.equal(b.energy,0);
 assert.equal(solveGrid({batteries:[b],loads:[{id:1,node:'island',demand:3}],dt:1}).assignments[0].powered,false);
});
test('charging draws remaining source capacity and never creates energy',()=>{
 const b={id:'b',node:'n',energy:0,energyMax:20,maxOutput:4,maxCharge:4};
 const result=solveGrid({lines:[line('a','s','n')],generation:[{node:'s',power:5}],batteries:[b],loads:[{id:1,node:'n',demand:3}],dt:2});
 assert.equal(b.energy,4);assert.equal(result.summary.charging,2);assert.equal(b.output,0);
});
test('priority selects critical demand and reports shortage separately from disconnection',()=>{
 const r=solveGrid({lines:[line('a','s','n')],generation:[{node:'s',power:4}],loads:[{id:1,node:'n',demand:3,priority:0},{id:2,node:'n',demand:3,priority:2}]});
 assert.equal(r.assignments.find(x=>x.id===2).powered,true);assert.equal(r.assignments.find(x=>x.id===1).powered,false);assert.equal(r.assignments.find(x=>x.id===1).connected,true);
});
test('alternate connection restores isolated branch; open line carries zero',()=>{
 const links=[line('main','s','n'),{...line('tie','s','n'),closed:false}];links[0].fault=true;
 const input={lines:links,generation:[{node:'s',power:6}],loads:[{id:1,node:'n',demand:3}]};
 assert.equal(solveGrid(input).assignments[0].powered,false);links[1].closed=true;
 assert.equal(solveGrid(input).assignments[0].powered,true);assert.equal(links[0].load,0);
});
test('sustained branch overload trips protection, not unrelated branch',()=>{
 const links=[line('small','s','n',2),line('safe','s','other',10)];
 const args={lines:links,generation:[{node:'s',power:20}],loads:[{id:1,node:'n',demand:3},{id:2,node:'other',demand:3}],dt:1};
 for(let i=0;i<4;i++)solveGrid(args);
 assert.equal(links[0].tripped,true);assert.notEqual(links[1].tripped,true);
});
test('preview does not change currency, energy, towers or line state',()=>{
 const g=new Game({level:2});g.build('battery',4);const before=JSON.stringify(g.toSnapshot());g.previewBuild('gun',7);assert.equal(JSON.stringify(g.toSnapshot()),before);
});
test('snapshot resumes live battle and rejects corrupt version/pads/energy',()=>{
 const g=new Game({level:3});g.build('battery',4);g.startWave();for(let i=0;i<30;i++)g.tick(.05);
 const saved=g.toSnapshot(),copy=Game.fromSnapshot(saved);assert.equal(copy.wave,g.wave);assert.equal(copy.enemies.length,g.enemies.length);
 assert.throws(()=>Game.fromSnapshot({...saved,version:999}));
 const bad=structuredClone(saved);bad.state.towers[0].pad=999;assert.throws(()=>Game.fromSnapshot(bad));
 const badEnergy=structuredClone(saved);badEnergy.state.towers.find(t=>t.type==='battery').energy=-1;assert.throws(()=>Game.fromSnapshot(badEnergy));
});
test('fault warning precedes outage, pauses freeze timer, outage restores',()=>{
 const g=new Game({level:1});g.wave=1;g.startWave();const f=g.faultSchedule[0],l=g.lines.find(l=>l.id===f.line);
 g.updateFaults(f.after-f.warning+.1);assert.ok(l.warningRemaining>0);assert.equal(l.fault,false);
 g.paused=true;const elapsed=g.waveElapsed;g.tick(.05);assert.equal(g.waveElapsed,elapsed);g.paused=false;
 g.updateFaults(f.warning);assert.equal(l.fault,true);g.updateFaults(f.duration);assert.equal(l.fault,false);
});
test('sandbox starts and preserves editable economy, wave button idempotent',()=>{
 const g=new Game({sandbox:true});assert.equal(g.credits,9999);assert.equal(g.startWave(),true);assert.equal(g.startWave(),false);assert.equal(g.wave,1);
});

test('generation shortage alone does not heat or trip an otherwise adequate feeder',()=>{
 const links=[line('feeder','s','n',10)];const args={lines:links,generation:[{node:'s',power:2}],loads:[{id:1,node:'n',demand:12}],dt:10};
 const r=solveGrid(args);assert.equal(r.assignments[0].connected,true);assert.equal(r.assignments[0].powered,false);assert.notEqual(links[0].tripped,true);assert.equal(links[0].overloadTime,0);
});
test('protection refresh uses dt=0 and never deducts island battery energy twice',()=>{
 const g=new Game();g.build('battery',4);g.build('gun',7);g.lines.find(l=>l.id==='trunk-west').fault=true;g.lines.find(l=>l.id==='trunk-east').capacity=2;
 const b=g.towers.find(t=>t.type==='battery');const before=b.energy;g.recomputePower(4);
 assert.equal(g.lines.find(l=>l.id==='trunk-east').tripped,true);assert.equal(b.energy,before-3*4);assert.equal(g.towers.find(t=>t.pad===7).powered,true);
});
test('relay provides valuable night visibility and requires a powered connection',()=>{
 const g=new Game({level:3});g.build('relay',9);g.wave=3;g.phase='wave';const e=g.spawn('crawler',2);e.x=2;e.y=3;g.illuminate();assert.equal(g.isNight(),true);assert.equal(e.seen,true);
 g.toggleLine('branch-9');g.illuminate();assert.equal(e.seen,false);
});
test('sandbox has fifth-wave boss and continues past campaign endings',()=>{
 const g=new Game({sandbox:true});for(let n=1;n<=11;n++){assert.equal(g.startWave(),true);if(n===5)assert.ok(g.queue.includes('boss'));g.queue=[];g.enemies=[];g.tick(.05);assert.equal(g.phase,'build');}assert.equal(g.wave,11);
});
test('campaign chapters have distinct feeder budgets with preserved save roundtrip',()=>{
 const fingerprints=new Set();for(let level=0;level<8;level++){const g=new Game({level});fingerprints.add(JSON.stringify(g.lines.slice(0,3).map(l=>[l.capacity,l.closed])));g.upgradeGrid();assert.doesNotThrow(()=>Game.fromSnapshot(g.toSnapshot()));}assert.equal(fingerprints.size,8);
});
