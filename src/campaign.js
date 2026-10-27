// Campaign definitions for the Last Beacon microgrid adaptation.
// Power figures are gameplay budgets, not physical circuit simulation.
export const CAMPAIGN = [
  { id: 0, name: '初灯', subtitle: '让第一束光照亮归航路', waves: 3, startingCredits: 300, supply: 95, capacity: 12, enemyScale: 0.72, mechanic: 'connect', tip: '先检查线路连通，再部署炮塔。青色线路表示带电。', faults: [] },
  { id: 1, name: '双潮', subtitle: '给海岸留一条退路', waves: 3, startingCredits: 350, supply: 100, capacity: 14, enemyScale: 0.85, mechanic: 'backup', tip: '备用联络线默认断开。主路故障时闭合它，让下游恢复供电。', faults: [{ wave: 2, after: 15, warning: 8, line: 'trunk-east', duration: 16 }] },
  { id: 2, name: '余辉', subtitle: '孤岛也能坚持到黎明', waves: 3, startingCredits: 400, supply: 110, capacity: 14, enemyScale: 0.95, mechanic: 'battery', tip: '电池有独立能量和输出上限；断网后只能支持同一连通区的设备。', faults: [{ wave: 2, after: 14, warning: 10, line: 'trunk-east', duration: 22 }] },
  { id: 3, name: '抉择', subtitle: '把有限的电力交给关键防线', waves: 4, startingCredits: 430, supply: 110, capacity: 10, enemyScale: 1, mechanic: 'priority', tip: '连通不代表电力充足。将关键炮塔设为高优先级，再考虑扩建。', faults: [] },
  { id: 4, name: '熔线', subtitle: '隔离危险，保存火种', waves: 4, startingCredits: 460, supply: 120, capacity: 18, enemyScale: 1.1, mechanic: 'protection', tip: '持续过载会使支路保护跳闸。先减少负荷或闭合备用线路，再复位。', faults: [{ wave: 3, after: 18, warning: 10, line: 'trunk-west', duration: 18 }] },
  { id: 5, name: '长夜', subtitle: '先储备，再迎击', waves: 4, startingCredits: 480, supply: 120, capacity: 12, enemyScale: 1.15, mechanic: 'storage', tip: '波间用剩余功率充电。满电并不等于无限输出，分散炮塔和电池的接入位置。', faults: [{ wave: 2, after: 16, warning: 10, line: 'trunk-east', duration: 25 }, { wave: 4, after: 18, warning: 10, line: 'trunk-west', duration: 25 }] },
  { id: 6, name: '风眼', subtitle: '在风暴的间隙重建防线', waves: 5, startingCredits: 520, supply: 130, capacity: 18, enemyScale: 1.2, mechanic: 'storm', tip: '留意故障倒计时；可以暂停切换线路、安排优先级和调整防线。', faults: [{ wave: 2, after: 18, warning: 10, line: 'trunk-west', duration: 20 }, { wave: 4, after: 16, warning: 10, line: 'trunk-east', duration: 25 }] },
  { id: 7, name: '最后的灯塔', subtitle: '让所有归航者看见黎明', waves: 5, startingCredits: 560, supply: 140, capacity: 20, enemyScale: 1.25, mechanic: 'finale', boss: true, tip: '双路、电池、优先级与隔离共同组成最后防线。终局巨兽需要集中火力。', faults: [{ wave: 2, after: 20, warning: 12, line: 'trunk-east', duration: 22 }, { wave: 4, after: 18, warning: 12, line: 'trunk-west', duration: 25 }, { wave: 5, after: 25, warning: 12, line: 'trunk-east', duration: 22 }] },
];
export const LEVELS = CAMPAIGN;
for (const level of CAMPAIGN) {
  level.briefing = level.tip;
  level.objective = `守住灯塔，抵御 ${level.waves} 波潮汐${level.boss ? '并击退深渊巨兽' : ''}。`;
  level.available = ['gun','mortar','frost','arc','relay',...(level.id >= 2 ? ['battery'] : [])];
}
export function getLevel(index = 0) { return CAMPAIGN[Math.max(0, Math.min(CAMPAIGN.length - 1, Number(index) || 0))]; }

for(const level of CAMPAIGN){level.briefing=level.tip;level.objective=`守住灯塔，抵御 ${level.waves} 波潮汐。`;level.available=["gun","mortar","frost","arc","relay",...(level.id>=2?["battery"]:[])];}

CAMPAIGN[2].faults.push({wave:2,after:16,warning:10,line:"trunk-west",duration:15});
CAMPAIGN[5].faults.push({wave:2,after:18,warning:10,line:"trunk-west",duration:16});
CAMPAIGN[6].faults.push({wave:4,after:24,warning:10,line:"trunk-west",duration:16});
CAMPAIGN[7].faults.push({wave:5,after:32,warning:12,line:"trunk-west",duration:14});

// Same island, different feeder constraints: layouts remain readable while each
// chapter changes which flank can carry the strongest defensive concentration.
const feeders = [[12,12,8],[14,12,12],[12,14,8],[10,10,6],[9,17,10],[16,12,6],[12,18,8],[16,16,10]];
for(const level of CAMPAIGN){
  const [east,west,tie]=feeders[level.id];
  level.feeders={east,west,tie};
  level.tieClosed=level.id===6;
  level.networkBrief=`东岸主路 ${east} / 西岸主路 ${west} / 备用联络 ${tie} 功率预算${level.tieClosed?'；联络已闭合':'；联络默认断开'}。`;
}
