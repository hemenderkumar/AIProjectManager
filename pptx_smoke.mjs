import PptxGenJS from "pptxgenjs";
const pptx = new PptxGenJS();
const slide = pptx.addSlide();
slide.addText("Hello", { x: 1, y: 1, w: 5, h: 1, fontSize: 20 });
slide.addChart(pptx.ChartType.bar, [
  { name: "Planned", labels: ["A","B"], values: [1,2] },
  { name: "Actual", labels: ["A","B"], values: [2,3] },
], { x: 1, y: 2, w: 5, h: 3 });
const buf = await pptx.write({ outputType: "nodebuffer" });
console.log("OK, bytes:", buf.length);
