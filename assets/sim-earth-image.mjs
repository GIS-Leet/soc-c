// NASA Blue Marble NG, June 2004 composite; static geography, not live weather.
// Limit GPU texture dimensions independently of the original source file.
export const earthImage = new Promise((resolve) => {
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 1024;
    canvas.getContext("2d").drawImage(image, 0, 0, 2048, 1024);
    resolve(canvas);
  };
  image.onerror = () => resolve(null);
  image.src = "assets/sim-textures/earth-june.jpg";
});
