/* Shared visual helpers. They never change scientific model values. */
(() => {
  const colorToken = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  function theme(scene) {
    const update = () => {
      scene.background = new THREE.Color(colorToken("--sim-canvas"));
      if (scene.fog) scene.fog.color.copy(scene.background);
      Lab.invalidate?.();
    };
    update();
    document.addEventListener("lab:theme", update);
  }
  function surfaceData(geometry, options = {}) {
    const p = geometry.attributes.position,
      n = geometry.attributes.normal;
    let a = geometry.getAttribute("surfaceData");
    if (!a) {
      a = new THREE.BufferAttribute(new Float32Array(p.count * 3), 3);
      geometry.setAttribute("surfaceData", a);
    }
    const level = options.water ?? -1000;
    for (let i = 0; i < p.count; i++) {
      const slope =
        Math.sqrt(Math.max(0, 1 - n.getY(i) ** 2)) /
        Math.max(0.05, Math.abs(n.getY(i)));
      a.setXYZ(
        i,
        options.rock ?? THREE.MathUtils.smoothstep(slope, 0.3, 1.1),
        1,
        1 - THREE.MathUtils.smoothstep(Math.abs(p.getY(i) - level), 0, 2),
      );
    }
    a.needsUpdate = true;
  }
  function photoSurface(geometry, options = {}) {
    surfaceData(geometry, options);
    const material = Landscape.photoMaterial(options);
    return material;
  }
  function calmWater(water) {
    water.material.fragmentShader = water.material.fragmentShader
      .replace("float rf0 = 0.3;", "float rf0 = 0.02;")
      .replace("vec3( 1.5, 1.0, 1.5 )", "vec3( .3, 1.0, .3 )");
    water.material.uniforms.distortionScale.value = 0.55;
    water.material.uniforms.waterColor.value.set(0x20566b);
  }
  function fit(camera, controls, geometry, padding = 1.12) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox,
      center = box.getCenter(new THREE.Vector3());
    const dir = camera.position.clone().sub(controls.target).normalize(),
      right = new THREE.Vector3().crossVectors(camera.up, dir).normalize(),
      up = new THREE.Vector3().crossVectors(dir, right),
      tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let distance = 0;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const p = new THREE.Vector3(x, y, z).sub(center);
          distance = Math.max(
            distance,
            p.dot(dir) + Math.abs(p.dot(right)) / (tan * camera.aspect),
            p.dot(dir) + Math.abs(p.dot(up)) / tan,
          );
        }
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(dir, distance * padding);
    controls.update();
  }
  window.SceneVisual = { theme, surfaceData, photoSurface, calmWater, fit };
})();
