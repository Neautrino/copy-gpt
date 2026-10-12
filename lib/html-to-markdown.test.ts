// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from './html-to-markdown';

const render = (html: string) => {
  const element = document.createElement('div');
  element.innerHTML = html;
  return htmlToMarkdown(element);
};

const katex = (tex: string) =>
  `<span class="katex"><span class="katex-mathml"><math><semantics><mrow></mrow><annotation encoding="application/x-tex">${tex}</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">rendered</span></span>`;

describe('htmlToMarkdown', () => {
  it('restores KaTeX math as TeX without escaping it', () => {
    const markdown = render(
      `<p>Energy ${katex('E = mc^2')} and</p><span class="katex-display">${katex('\\frac{a_1}{b}')}</span>`,
    );

    expect(markdown).toBe('Energy $E = mc^2$ and\n\n$$\n\\frac{a_1}{b}\n$$');
  });

  it('treats signed-out ChatGPT display math as a block', () => {
    const markdown = render(`<p>Mass:</p><span data-assistant-math-rendered="display">${katex('E=mc^2')}</span>`);

    expect(markdown).toBe('Mass:\n\n$$\nE=mc^2\n$$');
  });

  it('turns highlighted code blocks into fenced code with their language and without UI text', () => {
    const markdown = render(
      '<pre><div class="header">python<button>Copy code</button></div><div><code class="hljs"><span>print</span>("hi")</code></div></pre>',
    );

    expect(markdown).toBe('```python\nprint("hi")\n```');
  });

  it('keeps tables as GitHub tables', () => {
    const markdown = render('<table><thead><tr><th>Name</th><th>Qty</th></tr></thead><tbody><tr><td>Tea</td><td>2</td></tr></tbody></table>');

    expect(markdown).toBe('| Name | Qty |\n| --- | --- |\n| Tea | 2   |');
  });

  it('writes compact list markers and indents nested lists under their parent item', () => {
    const markdown = render(
      '<ol start="3"><li><p>Step</p><ul>\n<li>detail</li>\n</ul></li><li>Next</li></ol>',
    );

    expect(markdown).toBe('3. Step\n\n   - detail\n4. Next');
  });
});
