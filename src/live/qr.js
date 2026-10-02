// A QR code as an SVG element, built node by node (no innerHTML).

import qrcode from 'qrcode-generator';

export function qrElement(text, { size = 200, label = 'QR code' } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const margin = 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n + margin * 2} ${n + margin * 2}`);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.setAttribute('shape-rendering', 'crispEdges');
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', '100%');
  bg.setAttribute('height', '100%');
  bg.setAttribute('fill', '#ffffff');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', '#0F1117');
  svg.append(bg, path);
  return svg;
}
