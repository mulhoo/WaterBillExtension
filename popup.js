document.addEventListener('DOMContentLoaded', function() {
  const loadScript = document.getElementById('loadScript');
  const test2 = document.getElementById('test2');
  const test3 = document.getElementById('test3');
  const startAll = document.getElementById('startAll');
  const status = document.getElementById('status');

  loadScript.addEventListener('click', async () => {
    try {
      status.textContent = 'Loading script...';
      status.className = 'processing';

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });

      status.textContent = 'Script loaded! Analyzing page...';

      setTimeout(async () => {
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'checkPage' });

          if (response && response.isWaterBillPage) {
            status.textContent = `Found ${response.clientCount} accounts (${response.pageType})`;
            status.className = 'success';
            test2.disabled = false;
            test3.disabled = false;
            startAll.disabled = false;
          } else {
            status.textContent = 'No water bill accounts found on this page';
            status.className = 'error';
          }
        } catch (error) {
          status.textContent = `Communication error: ${error.message}`;
          status.className = 'error';
        }
      }, 2000);

    } catch (error) {
      status.textContent = `Failed to load script: ${error.message}`;
      status.className = 'error';
    }
  });

  test2.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, { action: 'startSequentialDownload', testLimit: 2 });
    status.textContent = 'Testing with 2 accounts...';
    status.className = 'processing';
  });

  // test3.addEventListener('click', async () => {
  //   const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  //   await chrome.tabs.sendMessage(tab.id, { action: 'startSequentialDownload', testLimit: 3 });
  //   status.textContent = 'Testing with 3 accounts...';
  //   status.className = 'processing';
  // });

  startAll.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, { action: 'startSequentialDownload' });
    status.textContent = 'Processing all accounts...';
    status.className = 'processing';
  });
});