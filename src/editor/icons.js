import { svgIcon } from '../core/dom.js';

const PATHS = {
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'm15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  plus: 'M12 5v14M5 12h14',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M5 12l7 7 7-7',
  play: 'M7 4l13 8-13 8z',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  upload: 'M12 15V3M7 8l5-5 5 5M5 21h14',
  chevron: 'M6 9l6 6 6-6',
  bold: 'M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z',
  italic: 'M19 4h-9M14 20H5M15 4 9 20',
  code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  clear: 'M4 7V4h16v3M9 20h6M12 4v16M4 20l16-16',
  close: 'M18 6 6 18M6 6l12 12',
  file: 'M14 3H6v18h12V7zM14 3v4h4',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6',
  dots: 'M12 5.5v.01M12 12v.01M12 18.5v.01',
};

export function icon(name, size = 16) {
  return svgIcon(PATHS[name] ?? PATHS.plus, { size });
}
