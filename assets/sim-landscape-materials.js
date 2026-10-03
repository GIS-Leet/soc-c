/* Photo-based surface shading, not geologic data. Source / CC0 in sim-textures/README.md. */
(() => {
  const loader = new THREE.TextureLoader(),
    textures = {};
  let loaded = 0,
    failed = false;
  for (const name of [
    "rock-color",
    "rock-height",
    "ground-color",
    "ground-height",
  ]) {
    const texture = loader.load(
      `assets/sim-textures/${name}.jpg`,
      () => {
        loaded++;
        document.body.dataset.materials = failed
          ? "fallback"
          : loaded === 4
            ? "ready"
            : "loading";
        Lab.invalidate?.();
      },
      undefined,
      () => {
        failed = true;
        document.body.dataset.materials = "fallback";
        Lab.invalidate?.();
      },
    );
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    // sRGB colour photographs are linearised explicitly by the shader. Heights
    // remain linear data. Sampling UVs in object space avoids swimming materials.
    textures[name] = texture;
  }
  Landscape.photoMaterial = () => {
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.91,
      metalness: 0,
      vertexColors: true,
    });
    material.extensions = { derivatives: true };
    material.onBeforeCompile = (shader) => {
      for (const [key, name] of [
        ["rockColor", "rock-color"],
        ["rockHeight", "rock-height"],
        ["groundColor", "ground-color"],
        ["groundHeight", "ground-height"],
      ])
        shader.uniforms[key] = { value: textures[name] };
      shader.vertexShader =
        "attribute vec3 surfaceData; varying vec3 vSurface; varying vec3 vObjectPoint; varying vec3 vObjectNormal;\n" +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvSurface=surfaceData;vObjectPoint=position;vObjectNormal=normal;",
      );
      shader.fragmentShader =
        `
        uniform sampler2D rockColor;uniform sampler2D rockHeight;uniform sampler2D groundColor;uniform sampler2D groundHeight;
        varying vec3 vSurface;varying vec3 vObjectPoint;varying vec3 vObjectNormal;
        vec3 linearPhoto(vec3 c){return pow(c,vec3(2.2));}
        vec4 triplanar(sampler2D tex,vec3 p,vec3 w){return texture2D(tex,p.zy)*w.x+texture2D(tex,p.xz)*w.y+texture2D(tex,p.xy)*w.z;}
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `
        vec3 blendWeights=pow(abs(normalize(vObjectNormal)),vec3(4.));blendWeights/=max(dot(blendWeights,vec3(1.)),.0001);
        vec3 rockUV=vObjectPoint/18.;
        vec2 groundUV=vObjectPoint.xz/28.;
        vec3 rock=linearPhoto(triplanar(rockColor,rockUV,blendWeights).rgb);
        vec3 ground=linearPhoto(texture2D(groundColor,groundUV).rgb);
        // Broad vertex colour modulation avoids obvious tiled patches; the
        // photograph supplies real aggregate detail, not new altitude data.
        rock*=vec3(.94,.98,1.03);
        ground*=vec3(.71,.83,.66);
        float rockMix=clamp(vSurface.x,0.,1.);
        vec3 naturalSurface=mix(ground,rock,rockMix);
        naturalSurface*=mix(.77,1.14,clamp(vColor.r*2.6,0.,1.));
        diffuseColor.rgb*=naturalSurface;
        diffuseColor.rgb*=mix(1.,.62,vSurface.z);
        float terrainAO=clamp(vSurface.y,.32,1.);
      `,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        vec3 weights=pow(abs(normalize(vObjectNormal)),vec3(4.));weights/=max(dot(weights,vec3(1.)),.0001);
        float rockBump=triplanar(rockHeight,vObjectPoint/18.,weights).r;
        float groundBump=texture2D(groundHeight,vObjectPoint.xz/28.).r;
        float bump=mix(groundBump*.21,rockBump*.95,clamp(vSurface.x,0.,1.));
        vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition),rx=cross(dy,normal),ry=cross(normal,dx);
        float det=dot(dx,rx);
        normal=normalize(abs(det)*normal-sign(det)*(dFdx(bump)*rx+dFdy(bump)*ry));
      `,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
        reflectedLight.indirectDiffuse*=terrainAO;
        reflectedLight.directDiffuse*=mix(.82,1.,terrainAO);
      `,
      );
    };
    return material;
  };
})();
