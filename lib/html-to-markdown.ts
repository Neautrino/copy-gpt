import TurndownService from 'turndown';
import { gfm } from '@joplin/turndown-plugin-gfm';

const MATH_ATTRIBUTE = 'data-copy-chat-math';

let service: TurndownService | undefined;

function getService(): TurndownService {
  if (service) return service;
  service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
  });
  service.use(gfm);
  // TeX must pass through verbatim; Turndown would otherwise escape its backslashes and underscores.
  service.addRule('math', {
    filter: (node) => node.hasAttribute(MATH_ATTRIBUTE),
    replacement: (_content, node) => {
      const tex = node.textContent ?? '';
      return node.nodeName === 'DIV' ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`;
    },
  });
  // Turndown pads list markers to four columns ("-   item"); use the usual "- item" / "1. item".
  service.addRule('listItem', {
    filter: 'li',
    replacement: (content, node) => {
      const parent = node.parentElement;
      let prefix = '- ';
      if (parent?.nodeName === 'OL') {
        const start = Number.parseInt(parent.getAttribute('start') ?? '1', 10) || 1;
        prefix = `${start + [...parent.children].indexOf(node)}. `;
      }
      const body = content
        .replace(/^\n+/, '')
        .replace(/\n+$/, '\n')
        .replace(/\n(?!\n|$)/g, `\n${' '.repeat(prefix.length)}`);
      return prefix + body + (node.nextSibling && !body.endsWith('\n') ? '\n' : '');
    },
  });
  return service;
}

const LANGUAGE_LABEL = /^[\w#+.-]{1,24}$/;

function codeLanguage(pre: Element): string {
  for (const element of [pre, ...pre.querySelectorAll('[class*="language-"], [class*="lang-"]')]) {
    const match = /(?:^|\s)(?:language|lang)-([\w#+.-]+)/.exec(element.className);
    if (match?.[1]) return match[1];
  }
  const labelled = pre.querySelector('[data-language], [data-lang]');
  const attribute = labelled?.getAttribute('data-language') ?? labelled?.getAttribute('data-lang');
  if (attribute) return attribute;
  // ChatGPT and Claude render the language as a small header above the code.
  const header = pre.firstElementChild;
  const label = header && !header.matches('code') ? header.textContent?.trim() ?? '' : '';
  return LANGUAGE_LABEL.test(label) ? label.toLowerCase() : '';
}

function codeText(pre: Element): string {
  const lines = pre.querySelectorAll('.cm-line');
  if (lines.length > 0) return [...lines].map((line) => line.textContent ?? '').join('\n');
  return (pre.querySelector('code') ?? pre).textContent ?? '';
}

/** Converts a rendered chat message (KaTeX, highlighted code, tables) back to Markdown. */
export function htmlToMarkdown(element: Element): string {
  const root = element.cloneNode(true) as Element;
  const doc = root.ownerDocument;

  // `.katex-display` is KaTeX's own wrapper; signed-out ChatGPT marks display math with an attribute instead.
  for (const display of root.querySelectorAll('.katex-display, [data-assistant-math-rendered="display"]')) {
    const tex = display.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
    if (tex == null) continue;
    // The TeX is kept as text so Turndown doesn't drop the placeholder as an empty element.
    const block = doc.createElement('div');
    block.setAttribute(MATH_ATTRIBUTE, '');
    block.textContent = tex.trim();
    display.replaceWith(block);
  }
  for (const inline of root.querySelectorAll('.katex')) {
    const tex = inline.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
    if (tex == null) continue;
    const span = doc.createElement('span');
    span.setAttribute(MATH_ATTRIBUTE, '');
    span.textContent = tex.trim();
    inline.replaceWith(span);
  }

  for (const control of root.querySelectorAll('button, [role="button"], svg, .sr-only')) control.remove();

  for (const pre of root.querySelectorAll('pre')) {
    const language = codeLanguage(pre);
    const code = doc.createElement('code');
    if (language) code.className = `language-${language}`;
    code.textContent = codeText(pre);
    const clean = doc.createElement('pre');
    clean.append(code);
    pre.replaceWith(clean);
  }

  return getService().turndown(root as HTMLElement).trim();
}
