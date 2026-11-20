/* Bend the live ink across the same relief as the printed stock. Each 440 × 544
   reference sheet encodes horizontal and vertical offsets in the map's red and green channels. */
(() => {
  const sheet = document.querySelector(".sheet");
  const filters = document.querySelectorAll("#ink-front, #ink-back");
  const backStock = new Image();
  let loaded = 0;

  new ResizeObserver(() => {
    const width = sheet.clientWidth, height = sheet.clientHeight;
    if (!width || !height) return;
    if (!backStock.src) backStock.src = "assets/paper-back.webp";
    for (const filter of filters) {
      const image = filter.querySelector("feImage");
      image.setAttribute("width", width);
      image.setAttribute("height", height);
      filter.querySelector("feDisplacementMap").setAttribute("scale", 32 * width / 440);

      if (image.hasAttribute("href")) continue;
      const map = new Image();
      map.onload = () => {
        if (++loaded === filters.length) sheet.dataset.inkReady = "";
      };
      map.src = image.dataset.src;
      image.setAttribute("href", map.src);
    }
  }).observe(sheet);
})();
