// Hero demo: switch between the example chat and its Markdown; "Copy chat" shows the Markdown and copies it.
const demo = document.querySelector('[data-demo]');

if (demo) {
  const tabs = [...demo.querySelectorAll('[role="tab"]')];
  const copyButton = demo.querySelector('.demo-copy');
  const copyLabel = demo.querySelector('.demo-copy-label');
  const markdown = demo.querySelector('.md');
  let resetTimer;

  const show = (view, focus = false) => {
    demo.dataset.view = view;
    for (const tab of tabs) {
      const selected = tab.getAttribute('aria-controls') === (view === 'chat' ? 'view-chat' : 'view-md');
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    }
  };

  for (const tab of tabs) {
    tab.addEventListener('click', () => show(tab.id === 'tab-chat' ? 'chat' : 'markdown'));
    // Arrow keys move between tabs, per the ARIA tabs pattern.
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      show(demo.dataset.view === 'chat' ? 'markdown' : 'chat', true);
    });
  }

  copyButton.addEventListener('click', async () => {
    show('markdown');
    clearTimeout(resetTimer);
    try {
      await navigator.clipboard.writeText(markdown.textContent);
      copyButton.dataset.copied = '';
      copyLabel.textContent = 'Copied';
    } catch {
      copyLabel.textContent = 'Copy chat';
    }
    resetTimer = setTimeout(() => {
      delete copyButton.dataset.copied;
      copyLabel.textContent = 'Copy chat';
    }, 2000);
  });
}
