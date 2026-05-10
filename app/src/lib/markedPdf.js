import { PDFDocument, rgb } from 'pdf-lib';

const MARK_SIZE = 28;
const STROKE = 4;
const GREEN = rgb(0.13, 0.7, 0.4);
const RED = rgb(0.85, 0.2, 0.25);

function drawCheck(page, cx, cyBL, s) {
  page.drawLine({
    start: { x: cx - s / 2,  y: cyBL },
    end:   { x: cx - s / 6,  y: cyBL - s / 2 },
    color: GREEN, thickness: STROKE
  });
  page.drawLine({
    start: { x: cx - s / 6,  y: cyBL - s / 2 },
    end:   { x: cx + s / 2,  y: cyBL + s / 3 },
    color: GREEN, thickness: STROKE
  });
}

function drawCross(page, cx, cyBL, s) {
  page.drawLine({
    start: { x: cx - s / 2, y: cyBL - s / 2 },
    end:   { x: cx + s / 2, y: cyBL + s / 2 },
    color: RED, thickness: STROKE
  });
  page.drawLine({
    start: { x: cx + s / 2, y: cyBL - s / 2 },
    end:   { x: cx - s / 2, y: cyBL + s / 2 },
    color: RED, thickness: STROKE
  });
}

export async function buildMarkedPdf(pdfBytes, annotations) {
  const doc = await PDFDocument.load(pdfBytes);
  const pages = doc.getPages();
  for (const a of annotations ?? []) {
    const page = pages[a.page - 1];
    if (!page) continue;
    const { width: W, height: H } = page.getSize();
    const cx = a.x * W;
    const cyBL = H - a.y * H;
    if (a.kind === 'check') drawCheck(page, cx, cyBL, MARK_SIZE);
    else drawCross(page, cx, cyBL, MARK_SIZE);
  }
  return await doc.save();
}
