/* Builds filled triangle polygons from path sample points (runs off main thread). */
self.onmessage = function (e) {
  const data = e.data || {};
  const samples = data.samples || [];
  const spikeLength = data.spikeLength || 10;
  const baseHalf = data.baseHalf || 1.5;
  const polys = [];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const tx = s.tx;
    const ty = s.ty;
    const nx = s.nx;
    const ny = s.ny;
    const x = s.x;
    const y = s.y;
    const tipX = x + nx * spikeLength;
    const tipY = y + ny * spikeLength;
    const b1x = x - tx * baseHalf;
    const b1y = y - ty * baseHalf;
    const b2x = x + tx * baseHalf;
    const b2y = y + ty * baseHalf;
    polys.push(
      tipX.toFixed(2) +
        ',' +
        tipY.toFixed(2) +
        ' ' +
        b1x.toFixed(2) +
        ',' +
        b1y.toFixed(2) +
        ' ' +
        b2x.toFixed(2) +
        ',' +
        b2y.toFixed(2)
    );
  }

  self.postMessage({
    token: data.token,
    pathIndex: data.pathIndex,
    polys: polys
  });
};
