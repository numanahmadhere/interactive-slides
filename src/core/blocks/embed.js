import { h } from '../dom.js';
import { str, oneOf } from '../util.js';
import { safeEmbedUrl } from '../sanitize.js';
import { registerBlock } from './registry.js';

const YOUTUBE_ID = /^[\w-]{11}$/;

// Turns a pasted page URL into something that can be framed. Known providers
// are rewritten to their embed endpoints; any other https URL is framed as-is.
export function resolveEmbed(raw) {
  const url = safeEmbedUrl(raw);
  if (!url) return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = u.pathname.slice(1);
    return YOUTUBE_ID.test(id) ? { provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    const id = u.searchParams.get('v') || (['embed', 'shorts', 'live'].includes(parts[0]) ? parts[1] : '');
    return YOUTUBE_ID.test(id || '') ? { provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === 'vimeo.com') {
    const id = u.pathname.split('/').filter(Boolean).find((s) => /^\d+$/.test(s));
    return id ? { provider: 'vimeo', src: `https://player.vimeo.com/video/${id}` } : null;
  }
  if (host === 'loom.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    const id = parts[0] === 'share' || parts[0] === 'embed' ? parts[1] : '';
    return /^[a-f0-9]{32}$/i.test(id || '') ? { provider: 'loom', src: `https://www.loom.com/embed/${id}` } : null;
  }
  return { provider: 'web', src: u.href };
}

export default registerBlock({
  type: 'embed',
  label: 'Embed',
  group: 'Content',
  defaults: () => ({ url: '', title: 'Embedded content', ratio: '16:9' }),
  normalize: (p) => ({
    url: str(p.url, '', 2000),
    title: str(p.title, 'Embedded content', 200),
    ratio: oneOf(p.ratio, ['16:9', '4:3', '1:1', 'fill'], '16:9'),
  }),
  fields: [
    { key: 'url', label: 'Link', type: 'text', placeholder: 'https://www.youtube.com/watch?v=...' },
    { key: 'title', label: 'Accessible title', type: 'text', placeholder: 'What this embed shows' },
    { key: 'ratio', label: 'Shape', type: 'select', options: [
      { value: '16:9', label: 'Widescreen 16:9' }, { value: '4:3', label: 'Standard 4:3' },
      { value: '1:1', label: 'Square' }, { value: 'fill', label: 'Fill space' },
    ] },
  ],
  render: (block, ctx) => {
    const { url, title, ratio } = block.props;
    const embed = resolveEmbed(url);
    const box = h('div', { class: 'sp-embed', 'data-ratio': ratio });
    // Editor and thumbnails get a placeholder so they never load third-party pages.
    if (!embed || ctx.mode !== 'present') {
      box.append(h('div', { class: 'sp-embed__placeholder', text: embed ? `${embed.provider} embed` : 'No embed URL' }));
      return box;
    }
    box.append(h('iframe', {
      src: embed.src,
      title,
      loading: 'lazy',
      allow: 'fullscreen; autoplay; encrypted-media; picture-in-picture',
      referrerpolicy: 'strict-origin-when-cross-origin',
      sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
    }));
    return box;
  },
});
