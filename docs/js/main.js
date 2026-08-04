// Fetch latest GitHub release tag and update download button
(async function () {
  try {
    const response = await fetch('https://api.github.com/repos/Mikatech-dev/sort-x/releases/latest');
    if (!response.ok) return;
    const data = await response.json();
    if (data.tag_name) {
      const btnText = document.getElementById('download-btn-text');
      if (btnText) {
        btnText.textContent = `Download Release (${data.tag_name})`;
      }
      const btn = document.getElementById('download-btn');
      if (btn && data.html_url) {
        btn.href = data.html_url;
      }
    }
  } catch (err) {
    // Fallback remains https://github.com/Mikatech-dev/sort-x/releases/latest
  }
})();

// Interactive Installation Tabs Switcher
document.addEventListener('DOMContentLoaded', function () {
  const tabs = document.querySelectorAll('.install-tab-btn');
  const panels = document.querySelectorAll('.install-tab-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', function () {
      switchTab(this);
    });

    tab.addEventListener('keydown', function (e) {
      const tabList = Array.from(tabs);
      const index = tabList.indexOf(this);
      let newIndex;

      if (e.key === 'ArrowRight') {
        newIndex = (index + 1) % tabList.length;
      } else if (e.key === 'ArrowLeft') {
        newIndex = (index - 1 + tabList.length) % tabList.length;
      } else if (e.key === 'Home') {
        newIndex = 0;
      } else if (e.key === 'End') {
        newIndex = tabList.length - 1;
      }

      if (newIndex !== undefined) {
        e.preventDefault();
        tabList[newIndex].focus();
        switchTab(tabList[newIndex]);
      }
    });
  });

  function switchTab(targetTab) {
    tabs.forEach(tab => {
      const isSelected = tab === targetTab;
      tab.classList.toggle('active', isSelected);
      tab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      tab.setAttribute('tabindex', isSelected ? '0' : '-1');
    });

    const targetPanelId = targetTab.getAttribute('aria-controls');
    panels.forEach(panel => {
      if (panel.id === targetPanelId) {
        panel.removeAttribute('hidden');
        panel.classList.add('active');
      } else {
        panel.setAttribute('hidden', '');
        panel.classList.remove('active');
      }
    });
  }

  // Click to Copy for <code> elements
  document.querySelectorAll('code').forEach(codeEl => {
    codeEl.setAttribute('data-tooltip', 'Click to copy');
    codeEl.addEventListener('click', async function () {
      const textToCopy = this.textContent.trim();
      try {
        await navigator.clipboard.writeText(textToCopy);
        this.setAttribute('data-tooltip', 'Copied!');
        setTimeout(() => {
          this.setAttribute('data-tooltip', 'Click to copy');
        }, 1500);
      } catch (err) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        this.setAttribute('data-tooltip', 'Copied!');
        setTimeout(() => {
          this.setAttribute('data-tooltip', 'Click to copy');
        }, 1500);
      }
    });
  });
});

