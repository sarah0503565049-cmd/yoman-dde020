
export function layoutDay(events) {
  const sorted = events
    .map((e, i) => ({ e, i, start: e.startMin, end: e.startMin + Math.max(e.durationMin, 1) }))
    .sort((a, b) => a.start - b.start || b.end - a.end || a.i - b.i);

  const out = [];
  let cluster = [];
  let clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    const laneEnds = [];
    for (const it of cluster) {
      let lane = laneEnds.findIndex((end) => end <= it.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(it.end);
      } else {
        laneEnds[lane] = it.end;
      }
      it.lane = lane;
    }
    for (const it of cluster) out.push({ ...it.e, lane: it.lane, lanes: laneEnds.length });
    cluster = [];
    clusterEnd = -1;
  };

  for (const it of sorted) {
    if (cluster.length && it.start >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return out;
}
