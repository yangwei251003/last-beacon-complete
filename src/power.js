/** Simplified microgrid: priority power budgets over capacity-limited connections.
 * This is NOT a voltage/current or Kirchhoff solver. Routes allocate gameplay
 * transfer capacity; values use power units and energy units (power * seconds).
 * Inputs are mutable lines/batteries; all energy changes require dt > 0.
 */
export function solveGrid({ nodes = [], lines = [], loads = [], generation = [], batteries = [], dt = 0 } = {}) {
  dt = Math.max(0, Number(dt) || 0);
  const graph = new Map();
  const touch = n => { if (!graph.has(n)) graph.set(n, []); };
  for (const n of nodes) touch(typeof n === 'object' ? n.id : n);
  for (const l of lines) {
    l.load = 0; l.requestedLoad = 0;
    touch(l.a); touch(l.b);
    if (l.closed !== false && !l.tripped && !l.fault) {
      graph.get(l.a).push({ node: l.b, line: l });
      graph.get(l.b).push({ node: l.a, line: l });
    }
  }
  const finite = (x, fallback = 0) => Number.isFinite(Number(x)) ? Math.max(0, Number(x)) : fallback;
  const sources = generation.map((s, i) => ({ id: s.id ?? `generator-${i}`, node: s.node, available: finite(s.power ?? s.capacity), used: 0, battery: null }));
  for (const b of batteries) {
    b.energy = Math.min(finite(b.energyMax, Infinity), finite(b.energy));
    b.output = 0; b.charging = 0;
    sources.push({ id: b.id, node: b.node, available: Math.min(finite(b.maxOutput), dt > 0 ? b.energy / dt : (b.energy > 0 ? Infinity : 0)), used: 0, battery: b });
  }
  // Reachability is deliberately separate from allocation success.
  const reachable = new Set();
  const queue = sources.filter(s => !s.battery && s.available > 0).map(s => s.node);
  for (const n of queue) reachable.add(n);
  for (let i = 0; i < queue.length; i++) for (const e of graph.get(queue[i]) || []) if (!reachable.has(e.node)) { reachable.add(e.node); queue.push(e.node); }
  function route(start, end, ignoreCapacity = false) {
    const q = [start], prev = new Map([[start, null]]);
    for (let i = 0; i < q.length && !prev.has(end); i++) for (const e of graph.get(q[i]) || []) {
      if (prev.has(e.node) || (!ignoreCapacity && finite(e.line.capacity, Infinity) - e.line.load < 1e-8)) continue;
      prev.set(e.node, { from: q[i], line: e.line }); q.push(e.node);
    }
    if (!prev.has(end)) return null;
    const path = []; for (let at = end; at !== start;) { const p = prev.get(at); path.push(p.line); at = p.from; }
    return path;
  }
  function allocate(node, demand, eligible) {
    let left = demand;
    const transactions = [];
    for (const s of eligible) {
      let path;
      while (left > 1e-8 && s.available - s.used > 1e-8 && (path = route(s.node, node))) {
        const amount = Math.min(left, s.available - s.used, ...path.map(l => finite(l.capacity, Infinity) - l.load));
        if (!(amount > 1e-8)) break;
        s.used += amount; for (const l of path) l.load += amount;
        transactions.push({ s, path, amount }); left -= amount;
      }
    }
    return { supplied: demand - left, transactions };
  }
  function rollback(transactions) { for (const t of transactions) { t.s.used -= t.amount; for (const l of t.path) l.load -= t.amount; } }
  const assignments = [];
  for (const load of [...loads].sort((a, b) => (b.priority || 0) - (a.priority || 0) || String(a.id).localeCompare(String(b.id)))) {
    const demand = finite(load.demand), connected = reachable.has(load.node);
    const supply = allocate(load.node, demand, sources);
    const hasSource = connected || sources.some(s => s.available > 0 && route(s.node, load.node, true));
    const powered = !!hasSource && supply.supplied + 1e-7 >= demand;
    if (!powered) {
      rollback(supply.transactions);
      // Track attempted branch demand for protection without pretending it is current.
      const reachableSources = sources.filter(s => s.available > s.used && route(s.node, load.node, true));
      const enoughSource = reachableSources.reduce((sum,s)=>sum+s.available-s.used,0)+1e-7 >= demand;
      const candidate = reachableSources[0];
      if (candidate && enoughSource) for (const l of route(candidate.node, load.node, true)) l.requestedLoad += demand;
    }
    const island = powered && !connected && demand > 0;
    assignments.push({ id: load.id, connected, powered, island, demand, supplied: powered ? demand : 0, reason: powered ? (island ? '电池孤岛供电' : '正常供电') : connected ? '供电预算或支路容量不足' : '线路断开且本区备用电力不足' });
  }
  for (const b of batteries) {
    const src = sources.find(s => s.battery === b);
    b.output = src.used;
    if (dt > 0) b.energy = Math.max(0, b.energy - src.used * dt);
    // No charging while discharging, and no battery-to-battery transfer.
    if (src.used < 1e-8 && reachable.has(b.node) && dt > 0) {
      const demand = Math.min(finite(b.maxCharge, finite(b.maxOutput)), Math.max(0, finite(b.energyMax) - b.energy) / dt);
      const charge = allocate(b.node, demand, sources.filter(s => !s.battery));
      b.charging = charge.supplied; b.energy += charge.supplied * dt;
    }
  }
  const newlyTripped = [];
  for (const l of lines) {
    l.requestedLoad += l.load;
    if (l.closed !== false && !l.fault && !l.tripped && l.requestedLoad > finite(l.capacity, Infinity) + 1e-7) l.overloadTime = (l.overloadTime || 0) + dt;
    else l.overloadTime = Math.max(0, (l.overloadTime || 0) - dt * 2);
    if (l.overloadTime >= finite(l.tripDelay, 4) && !l.tripped) { l.tripped = true; newlyTripped.push(l.id); }
  }
  const total = items => items.reduce((sum, x) => sum + x, 0);
  return { assignments, newlyTripped, connectedNodes: [...reachable], summary: { capacity: total(sources.filter(s => !s.battery).map(s => s.available)), powerUsed: total(assignments.map(a => a.supplied)), demand: total(loads.map(l => finite(l.demand))), batteryOutput: total(batteries.map(b => b.output)), batteryEnergy: total(batteries.map(b => b.energy)), charging: total(batteries.map(b => b.charging)), unpowered: assignments.filter(a => !a.powered).length, islandLoads: assignments.filter(a => a.island).length } };
}
