class WaterBillAutomator {
  constructor() {
    this.isRunning = false;
    this.settings = { delay: 2000, testMode: false };
    this.processedCount = 0;
    this.isAutoProcessing = false;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sendResponse);
    });
  }

  handleMessage(message, sendResponse) {
    switch (message.action) {
      case 'checkPage':
        sendResponse(this.analyzeCurrentPage());
        break;

      case 'openAllBills':
        this.openAllBillsInTabs();
        sendResponse({ success: true });
        break;

      case 'processHistoryPage':
        this.processHistoryPageAutomatically();
        sendResponse({ success: true });
        break;

      case 'collectDownloadLinks':
        this.collectDownloadLinksFromBillPage();
        sendResponse({ success: true });
        break;

      case 'startSequentialDownload':
        this.isAutoProcessing = true;
        this.openAllBillsSequentially(message.testLimit);
        sendResponse({ success: true });
        break;
    }
  }

  analyzeCurrentPage() {
    const accountItems = document.querySelectorAll('.accountItem[data-account]');
    const isHistoryTablePage = this.isHistoryTablePage();
    const isIndividualBillPage = this.isOnIndividualBillPage();

    if (accountItems.length > 0) {
      const accounts = this.extractAccountData(accountItems);
      return {
        isWaterBillPage: true,
        pageType: 'Account Dashboard (Step 1 of 3)',
        clientCount: accounts.length,
        accounts: accounts,
        step: 1
      };

    } else if (isHistoryTablePage) {
      const historyRows = this.extractHistoryTableData();
      return {
        isWaterBillPage: true,
        pageType: 'Bill History Table (Step 2 of 3)',
        clientCount: historyRows.length,
        accounts: historyRows,
        step: 2
      };

    } else if (isIndividualBillPage) {
      return {
        isWaterBillPage: true,
        pageType: 'Individual Bill Page (Step 3 of 3)',
        clientCount: 1,
        downloadable: this.findDownloadButtonsOnBillPage().length > 0,
        step: 3
      };
    }

    return {
      isWaterBillPage: false,
      pageType: 'Unknown',
      clientCount: 0,
      step: 0
    };
  }

  isHistoryTablePage() {
    const accountItems = document.querySelectorAll('.accountItem[data-account]');
    if (accountItems.length > 0) {
      return false;
    }

    const hasTable = document.querySelector('table#billHistoryTable') ||
                    document.querySelector('.table-container') ||
                    document.querySelector('table');

    const viewBillLinks = Array.from(document.querySelectorAll('a, button')).filter(el => {
      const text = el.textContent.trim();
      const href = el.getAttribute('href') || '';
      return text === 'View Bill' || (text.includes('View') && href.includes('view-external-bill'));
    });

    const isHistoryPage = hasTable && viewBillLinks.length > 0;

    return isHistoryPage;
  }

  extractHistoryTableData() {
    const tableRows = document.querySelectorAll('table tr');
    const historyItems = [];

    tableRows.forEach((row, index) => {
      const allClickables = row.querySelectorAll('a, button, [onclick]');

      allClickables.forEach(clickable => {
        const text = clickable.textContent.trim();
        const href = clickable.getAttribute('href') || '';
        const onclick = clickable.getAttribute('onclick') || '';

        if (text.toLowerCase().includes('view') &&
            (text.toLowerCase().includes('bill') ||
            href.includes('view-external-bill') ||
            onclick.includes('viewBill') ||
            onclick.includes('view-bill'))) {

          const cells = row.querySelectorAll('td');
          let accountNumber = 'Unknown';
          let documentDate = 'Unknown';
          let amount = 'Unknown';

          if (cells.length >= 3) {
            accountNumber = cells[0]?.textContent.trim() || 'Unknown';
            documentDate = cells[2]?.textContent.trim() || 'Unknown';
            amount = cells[5]?.textContent.trim() || 'Unknown';
          }

          historyItems.push({
            index: historyItems.length,
            accountNumber: accountNumber,
            documentDate: documentDate,
            amount: amount,
            viewBillButton: clickable,
            element: row
          });
        }
      });
    });

    return historyItems;
  }

  extractAccountData(accountItems) {
    const accounts = [];

    accountItems.forEach((item, index) => {
      try {
        const accountDataStr = item.getAttribute('data-account');
        const accountData = JSON.parse(accountDataStr);
        const viewBillButton = this.findViewBillButtonInItem(item);

        if (viewBillButton) {
          accounts.push({
            index: index,
            accountId: accountData.accountId || 'Unknown',
            accountNumber: accountData.accountNumber || 'Unknown',
            amountDue: accountData.amountDue || '0.00',
            dueDate: accountData.dueDateDisplay || 'Unknown',
            documentKey: this.extractDocumentKey(accountData),
            element: item,
            viewBillButton: viewBillButton,
            accountData: accountData
          });
        }
      } catch (error) {
        console.log(`Error parsing account data for item ${index}:`, error);
      }
    });

    return accounts;
  }

  extractDocumentKey(accountData) {
    try {
      if (accountData.clientDataFields) {
        const clientData = JSON.parse(accountData.clientDataFields);
        return clientData.documentKey || 'Unknown';
      }
    } catch (error) {
      console.log('Error parsing clientDataFields:', error);
    }
    return 'Unknown';
  }

  findViewBillButtonInItem(accountItem) {
    const buttons = accountItem.querySelectorAll('button, a');

    for (const button of buttons) {
      const text = button.textContent.trim().toLowerCase();
      const title = (button.getAttribute('title') || '').toLowerCase();

      if (text.includes('view bill') ||
          text.includes('view') && (text.includes('bill') || text.includes('statement')) ||
          title.includes('view bill') ||
          title.includes('view') && title.includes('bill')) {
        return button;
      }
    }

    const clickables = accountItem.querySelectorAll('a[href], button[onclick], [data-url]');
    if (clickables.length > 0) {
      return clickables[0];
    }

    return null;
  }

  async processHistoryPageAutomatically() {
    await this.sleep(2000);

    const historyData = this.extractHistoryTableData();

    if (historyData.length === 0) {
      this.notifyProgress('No bills found in history table', 'error');
      return;
    }

    const mostRecentBill = historyData[0];
    const button = mostRecentBill.viewBillButton;
    const dataUrl = button.getAttribute('data-url');

    if (dataUrl) {
      const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
      const fullUrl = dataUrl.startsWith('http') ? dataUrl : baseUrl + dataUrl;

      this.notifyProgress(`Opening bill PDF...`, 'processing');

      window.location.href = fullUrl;

    } else {
      const allScripts = document.querySelectorAll('script');
      let foundHandler = false;

      for (const script of allScripts) {
        if (script.textContent.includes('view-external-bill')) {
          foundHandler = true;
          break;
        }
      }

      if (!foundHandler) {
        if (typeof jQuery !== 'undefined' || typeof $ !== 'undefined') {
          const $ = jQuery || window.$;
          $(button).trigger('click');
        }
      }
    }
  }

  async openAllBillsSequentially(testLimit = null) {
    const pageAnalysis = this.analyzeCurrentPage();

    if (pageAnalysis.step !== 1) {
      this.notifyProgress('Navigate to the account dashboard to start', 'error');
      return;
    }

    const accounts = pageAnalysis.accounts;
    const accountsToProcess = testLimit ? accounts.slice(0, testLimit) : accounts;

    this.isRunning = true;
    this.processedCount = 0;

    this.notifyProgress(`Opening ${accountsToProcess.length} accounts in separate tabs (${testLimit ? 'TEST MODE' : 'FULL MODE'})...`, 'processing');

    try {
      sessionStorage.setItem('waterBillAutoProcessing', 'true');
    } catch (e) {
      console.log('Could not set session storage flag');
    }

    for (let i = 0; i < accountsToProcess.length && this.isRunning; i++) {
      const account = accountsToProcess[i];

      this.notifyProgress(`Opening account ${i + 1}/${accountsToProcess.length}: ${account.accountNumber} in new tab`, 'processing');

      try {
        this.openBillInNewTab(account.viewBillButton, account);

        await this.sleep(1000);

        this.processedCount++;

      } catch (error) {
        console.log(`Error processing account ${account.accountNumber}:`, error);
      }
    }

    this.notifyProgress(`Opened ${this.processedCount} account tabs. Each will auto-navigate to PDF.`, 'success');
    this.isRunning = false;

    setTimeout(() => {
      try {
        sessionStorage.removeItem('waterBillAutoProcessing');
      } catch (e) {
        console.log('Could not clear session storage flag');
      }
    }, 10000);
  }

  openAllBillsInTabs() {
    this.openAllBillsSequentially();
  }

  openBillInNewTab(button, account) {
    let url = null;

    if (button && button.tagName === 'A' && button.href) {
      url = button.href;
    } else {
      const a = button?.closest?.('a');
      if (a && a.href) url = a.href;
    }

    if (!url) {
      const dataUrl = button?.getAttribute?.('data-url');
      if (dataUrl) {
        url = toAbsoluteUrl(dataUrl);
      }
    }

    if (url) {
      button.dataset.wbaOpened = 'iu';

      chrome.runtime.sendMessage({
        action: 'openAccountTab',
        url,
        accountNumber: account?.accountNumber || account?.id || null
      });
    } else {
      button?.click?.();
    }
  }

  toAbsoluteUrl(maybeRelative) {
    try {
      if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;

      const base = new URL(window.location.href);
      if (maybeRelative.startsWith('/')) {
        return base.origin + maybeRelative;
      }
      const dir = base.pathname.replace(/[^/]*$/, '');
      return base.origin + dir + maybeRelative;
    } catch {
      return maybeRelative;
    }
  }

  simulateClick(element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        detail: 1
      });
      element.dispatchEvent(clickEvent);

      if (typeof element.click === 'function') {
        element.click();
      }
    }, 300);
  }

  isOnIndividualBillPage() {
    const pageText = document.textContent ? document.textContent.toLowerCase() : '';
    const hasWaterBillContent = pageText.includes('water bill #') ||
                               pageText.includes('account details') ||
                               pageText.includes('statement') ||
                               (pageText.includes('bill') && pageText.includes('amount due'));

    const url = window.location && window.location.href ? window.location.href.toLowerCase() : '';
    const hasBillUrl = url.includes('bill') ||
                      url.includes('statement') ||
                      url.includes('invoice') ||
                      (url.includes('account') && (url.includes('view') || url.includes('detail')));

    return hasWaterBillContent || hasBillUrl;
  }

  findDownloadButtonsOnBillPage() {
    const allButtons = document.querySelectorAll('button, a, input[type="submit"], [onclick*="download"], [onclick*="pdf"]');

    return Array.from(allButtons).filter(el => {
      const text = el.textContent.toLowerCase();
      const title = (el.getAttribute('title') || '').toLowerCase();
      const href = (el.getAttribute('href') || '').toLowerCase();
      const onclick = (el.getAttribute('onclick') || '').toLowerCase();
      const className = el.className.toLowerCase();

      return text.includes('download') || text.includes('pdf') || text.includes('print') ||
             title.includes('download') || title.includes('pdf') ||
             href.includes('download') || href.includes('.pdf') ||
             onclick.includes('download') || onclick.includes('pdf') ||
             className.includes('download') || className.includes('pdf');
    });
  }

  collectDownloadLinksFromBillPage() {
    if (document.contentType === 'application/pdf' || window.location.href.includes('.pdf')) {
      console.log('📄 This page appears to be a PDF itself');
      this.notifyProgress('PDF page opened - you can save it manually (Ctrl+S)', 'success');
      return;
    }

    const embeddedPdf = document.querySelector('embed[type="application/pdf"], object[type="application/pdf"], iframe[src*=".pdf"]');
    if (embeddedPdf) {
      const pdfUrl = embeddedPdf.src || embeddedPdf.data;
      if (pdfUrl) {
        this.notifyProgress('PDF found and ready for download (Ctrl+S)', 'success');
        return;
      }
    }

    const allLinks = document.querySelectorAll('a[href]');

    const pdfLinks = Array.from(allLinks).filter(link => {
      const href = link.href.toLowerCase();
      return href.includes('.pdf') || href.includes('pdf') || href.includes('download');
    });

    const printButtons = Array.from(document.querySelectorAll('button, a, [onclick]')).filter(el => {
      const text = el.textContent.toLowerCase();
      const onclick = (el.getAttribute('onclick') || '').toLowerCase();
      return text.includes('print') || onclick.includes('print') || onclick.includes('window.print');
    });

    this.notifyProgress('Bill page opened - use Ctrl+S to save or check for download options', 'success');
  }

  notifyProgress(message, type) {
    chrome.runtime.sendMessage({
      action: 'downloadProgress',
      message: message,
      type: type
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  shouldAutoProcess() {
    return true;
  }
}

const automator = new WaterBillAutomator();

if (document.readyState === 'complete') {
  setTimeout(() => {
    if (automator.shouldAutoProcess()) {
      const pageAnalysis = automator.analyzeCurrentPage();

      if (pageAnalysis.step === 2) {
        automator.processHistoryPageAutomatically();
      } else if (pageAnalysis.step === 3) {
        automator.collectDownloadLinksFromBillPage();
      }
    }
  }, 3000);
} else {
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (automator.shouldAutoProcess()) {
        const pageAnalysis = automator.analyzeCurrentPage();

        if (pageAnalysis.step === 2) {
          automator.processHistoryPageAutomatically();
        } else if (pageAnalysis.step === 3) {
          automator.collectDownloadLinksFromBillPage();
        }
      }
    }, 3000);
  });
}