// The slice of the page's CSS that draws a slide: fonts, keyframes and the
// .sp-* rules. Used when a slide has to be drawn outside the page (PNG, print),
// where editor chrome would only add weight.

export function slideCss(doc = document) {
  let out = '';
  const keep = (rule) => {
    switch (rule.constructor.name) {
      case 'CSSFontFaceRule':
      case 'CSSKeyframesRule':
        return true;
      case 'CSSStyleRule':
        return /\.sp-|\[data-theme|:root|\[hidden\]/.test(rule.selectorText);
      case 'CSSMediaRule':
        return /\.sp-/.test(rule.cssText);
      default:
        return false;
    }
  };
  for (const sheet of doc.styleSheets) {
    try {
      for (const rule of sheet.cssRules) if (keep(rule)) out += `${rule.cssText}\n`;
    } catch { /* a cross-origin sheet cannot be read */ }
  }
  return out;
}
