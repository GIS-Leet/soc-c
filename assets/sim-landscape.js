/* Procedural teaching landscapes. Colours describe materials, not UI categories.
   No DEM or satellite imagery is implied. Height functions are also used by the
   profile and water mask so the visible surface and measurements stay aligned. */
(() => {
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, v) => {
    const t = clamp((v - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const noise = new SimplexNoise("geographia-landscape-3");
  const n = (x, z, scale) => noise.noise2D(x / scale, z / scale);
  const fbm = (x, z) =>
    n(x, z, 32) * 2.2 + n(x, z, 12) * 1.1 + n(x, z, 4) * 0.38;
  function volcanic(x, z, collapsed) {
    const angle = Math.atan2(z, x);
    const radial = Math.hypot(x * 0.9, z * 1.08);
    const rim = craterRim(angle);
    const ridge =
      66 +
      6 * Math.sin(angle * 3 + 1) +
      4 * Math.sin(angle * 7) +
      2 * Math.sin(angle * 13 + 0.4);
    const base = 6 + fbm(x, z) * 0.6;
    const warp = n(x, z, 28) * 1.7 + n(x, z, 11) * 0.28;
    const channels = Math.pow(
      0.5 + 0.5 * Math.sin(angle * 17 + radial * 0.038 + warp),
      6,
    );
    const branches = Math.pow(
      0.5 + 0.5 * Math.sin(angle * 39 + radial * 0.06 + warp * 1.4),
      8,
    );
    const flank = Math.max(0, 1 - (radial - rim) / 100);
    const outer =
      base +
      (ridge - base) * Math.pow(flank, 2.2) -
      (channels * 8 + branches * 2.5) *
        smooth(rim, rim + 16, radial) *
        (1 - smooth(115, 148, radial));
    if (!collapsed) {
      const cone =
        base + Math.max(0, 102 * Math.pow(Math.max(0, 1 - radial / 148), 1.35));
      return (
        cone -
        channels * 4 * smooth(12, 42, radial) * (1 - smooth(85, 130, radial)) +
        fbm(x, z) * 0.32
      );
    }
    const floor = 18 + n(x, z, 19) * 0.55;
    const wall = smooth(rim - 18, rim, radial);
    const crags =
      (n(x, z, 4.8) * 1.5 + n(x, z, 1.8) * 0.38) * smooth(0.2, 0.6, wall);
    return radial < rim
      ? floor + (ridge - floor) * wall + fbm(x, z) * wall * 0.5 + crags
      : outer + fbm(x, z) * 0.8 + n(x, z, 2.1) * 0.24 * smooth(10, 45, outer);
  }
  function craterRim(angle) {
    return 51 + 3.4 * Math.sin(angle * 3 + 0.7) + 2.1 * Math.sin(angle * 7);
  }
  const surface = {
    version: "4.0.0-landforms",
    noise: n,
    cone: (x, z) => volcanic(x, z, false),
    caldera: (x, z) => volcanic(x, z, true),
    inCrater: (x, z) =>
      Math.hypot(x * 0.9, z * 1.08) < craterRim(Math.atan2(z, x)),
    plateau: (x, z) => 7 + fbm(x, z) * 0.7,
    detail(x, z, key, stage) {
      if (key === "volcano") return 0;
      if (key === "intro" && stage === 0) return 0;
      return n(x, z, 4.3) * 0.38 + n(x, z, 1.7) * 0.13;
    },
    clamp,
    smooth,
  };
  window.Landscape = surface;

  // Triplanar material variation has no repeating bitmap seams and does not
  // displace the surface. Geometry, water boundaries and measured heights agree.
  surface.rockMaterial = (options = {}) => {
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.94,
      metalness: 0,
      ...options,
    });
    mat.color.convertSRGBToLinear();
    mat.extensions = { derivatives: true };
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader =
        "varying vec3 vTerrainPoint;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvTerrainPoint = position;",
      );
      shader.fragmentShader =
        `varying vec3 vTerrainPoint;
        float geoHash(vec3 p){p=fract(p*.3183099+vec3(.13,.31,.17));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
        float geoNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(geoHash(i),geoHash(i+vec3(1,0,0)),f.x),mix(geoHash(i+vec3(0,1,0)),geoHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(geoHash(i+vec3(0,0,1)),geoHash(i+vec3(1,0,1)),f.x),mix(geoHash(i+vec3(0,1,1)),geoHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
        ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float grains=geoNoise(vTerrainPoint*1.8)*.5+geoNoise(vTerrainPoint*5.6)*.25+geoNoise(vTerrainPoint*.32)*.25;
        float fissure=smoothstep(.04,.13,abs(geoNoise(vTerrainPoint*.65)-.5));
        diffuseColor.rgb*=mix(.82,1.08,grains)*mix(.93,1.,fissure);
      `,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        float relief=geoNoise(vTerrainPoint*1.2)*.22+geoNoise(vTerrainPoint*4.)*.045;
        vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
        vec3 rx=cross(dy,normal),ry=cross(normal,dx);
        float det=dot(dx,rx);
        normal=normalize(abs(det)*normal-sign(det)*(dFdx(relief)*rx+dFdy(relief)*ry));
      `,
      );
    };
    return mat;
  };
  surface.basinWater = (height, level, extent, segments = 150) => {
    // Clip every triangle against the exact shoreline; no circular cap bridging dry land.
    const xyz = [],
      depths = [];
    const interpolate = (a, b) => {
      const t = (level - a.y) / (b.y - a.y);
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: level };
    };
    const point = (x, z) => ({ x, z, y: height(x, z) });
    const emit = (triangle) => {
      const poly = [];
      for (let i = 0; i < 3; i++) {
        const a = triangle[i],
          b = triangle[(i + 1) % 3],
          ain = a.y < level,
          bin = b.y < level;
        if (ain) poly.push(a);
        if (ain !== bin) poly.push(interpolate(a, b));
      }
      for (let j = 1; j < poly.length - 1; j++)
        for (const p of [poly[0], poly[j], poly[j + 1]]) {
          xyz.push(p.x, level + 0.035, p.z);
          depths.push(level - p.y, 0, 0);
        }
    };
    const step = (extent * 2) / segments;
    for (let iz = 0; iz < segments; iz++)
      for (let ix = 0; ix < segments; ix++) {
        const x = -extent + ix * step,
          z = -extent + iz * step;
        const a = point(x, z),
          b = point(x + step, z),
          c = point(x, z + step),
          d = point(x + step, z + step);
        emit([a, c, b]);
        emit([b, c, d]);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(xyz, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(depths, 3));
    g.computeVertexNormals();
    return g;
  };
  // Discrete horizon visibility. This darkens sheltered surfaces; it does not
  // modify their measured height. Calculated once per stage, never per frame.
  surface.occlusion = (heights, resolution, size) => {
    const stride = resolution + 1,
      cell = size / resolution,
      out = new Float32Array(heights.length);
    const directions = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ];
    for (let row = 0; row <= resolution; row++)
      for (let col = 0; col <= resolution; col++) {
        const index = row * stride + col,
          y = heights[index];
        let blocked = 0;
        for (const [dx, dz] of directions) {
          let horizon = 0;
          for (const step of [2, 5, 11, 21]) {
            const x = col + dx * step,
              z = row + dz * step;
            if (x < 0 || z < 0 || x > resolution || z > resolution) continue;
            const slope =
              (heights[z * stride + x] - y) /
              (cell * step * Math.hypot(dx, dz));
            horizon = Math.max(horizon, slope);
          }
          blocked += Math.atan(horizon) / (Math.PI / 2);
        }
        out[index] = Math.max(0.38, 1 - (blocked / directions.length) * 0.9);
      }
    return out;
  };
})();
