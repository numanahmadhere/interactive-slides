// A forgiving little XML reader, enough for Office documents: elements, attributes,
// text, entities, CDATA. Element prefixes are dropped ("a:t" -> "t"), so callers
// match on local names; attributes keep theirs ("r:embed"). No DTDs or external entities are ever processed.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
  if (e[0] === '#') {
    const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
  }
  return ENTITIES[e.toLowerCase()] ?? m;
});

export function parseXml(text) {
  const root = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(text))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.children.push({ name: '#text', text: m[1] });
    else if (m[3]) {
      const name = m[3].replace(/^.*:/, '');
      if (m[2]) {
        if (stack.length > 1) stack.pop();
      } else {
        const attrs = {};
        for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3]);
        const node = { name, attrs, children: [] };
        top.children.push(node);
        if (!m[5]) {
          if (stack.length > 200) throw new Error('That file is too deeply nested.');
          stack.push(node);
        }
      }
    } else if (m[6] !== undefined) top.children.push({ name: '#text', text: decode(m[6]) });
  }
  return root;
}

export const kids = (node, name) => (node?.children ?? []).filter((c) => c.name === name);
export const kid = (node, name) => (node?.children ?? []).find((c) => c.name === name);
export function find(node, name, out = []) {
  for (const c of node?.children ?? []) {
    if (c.name === name) out.push(c);
    find(c, name, out);
  }
  return out;
}
export const textOf = (node) => (node?.children ?? []).map((c) => (c.name === '#text' ? c.text : textOf(c))).join('');
