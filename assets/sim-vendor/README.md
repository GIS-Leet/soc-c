# Simulator dependencies

These local browser distributions keep the learning tools available without third-party script CDNs. Version upgrades require a simulator browser check because the three.js examples use its legacy global API.

| Files | Version | Upstream | License |
| --- | --- | --- | --- |
| `three.min.js`, `OrbitControls.js`, `Sky.js`, `Water.js` | three.js r128 | https://github.com/mrdoob/three.js/tree/r128 | `THREE-LICENSE.txt` (MIT) |
| `simplex-noise.min.js` | 2.4.0 | https://github.com/jwagner/simplex-noise.js/tree/2.4.0 | `SIMPLEX-LICENSE.txt` (MIT) |
| `chart.umd.min.js` | 4.5.1 | https://github.com/chartjs/Chart.js/tree/v4.5.1 | `CHART-LICENSE.txt` (MIT) |
| `leaflet.js`, `leaflet.css`, `images/*` | 1.9.4 | https://github.com/Leaflet/Leaflet/tree/v1.9.4 | `LEAFLET-LICENSE.txt` (BSD-2-Clause) |

`waternormals.jpg` is the example water normal map from https://threejs.org/examples/textures/waternormals.jpg. Library distributions were obtained from the versioned jsDelivr packages; the water texture was obtained from the three.js examples site.

The Seoul atlas uses standard OpenStreetMap tiles with visible contributor attribution. Tiles need a network connection and are not bundled or downloaded for offline use. See https://operations.osmfoundation.org/policies/tiles/.

Run `npm ci`, `npx playwright install chromium`, then `npm run test:simulators` for interaction and responsive checks. The test starts its own local server. Run `npm test` for model and platform tests, and `npm run stamp` after editing browser assets.
