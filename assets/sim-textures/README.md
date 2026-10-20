# Landscape surface photographs

Downloaded 2026-10-04 from Poly Haven, under [CC0](https://polyhaven.com/license).

| Local files                             | Source                                                                                         | Authors                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `rock-color.jpg`, `rock-height.jpg`     | [Rock Face 03](https://polyhaven.com/a/rock_face_03), 1k JPEG diffuse / displacement           | Dario Barresi (photography), Rico Cilliers (processing) |
| `ground-color.jpg`, `ground-height.jpg` | [Aerial Grass Rock](https://polyhaven.com/a/aerial_grass_rock), 1k JPEG diffuse / displacement | Rob Tuytel                                              |

The height images are the original downloads (checksums were compared with the source API metadata). The two colour images were re-encoded on 2026-10-20 as progressive JPEG at quality 82 (same 1024 × 1024 pixels) to cut page weight from 927 KB / 667 KB to about 220 KB each; the untouched originals are kept outside the repository. The height images perturb shading normals only, not the terrain mesh. These generic surface samples do not identify the actual rocks or vegetation of Baekdu Mountain or any particular study site. All files are served locally; students' browsers do not contact Poly Haven.

## Earth image

`earth-june.jpg` is NASA's **Blue Marble Next Generation, June 2004, with topography and bathymetry**, downloaded at 5400 × 2700 pixels and, on 2026-10-20, resized to 2048 × 1024 (quality 88) — the same size the browser already resampled it to — cutting the file from 2.4 MB to 0.37 MB. Source: [NASA Earth Observatory collection](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/), [original JPEG](https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73726/world.topo.bathy.200406.3x5400x2700.jpg). Credit: NASA Earth Observatory, Reto Stöckli / NASA GSFC.

NASA permits educational and informational uses of this material under its [media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/). No NASA endorsement is implied. The browser resamples the original to a 2048 × 1024 canvas before uploading it to the GPU. The composite is a static geographic backdrop: changing the simulated month does not change its vegetation or snow. ITCZ clouds are a deterministic illustrative opacity field, not satellite cloud observations.
