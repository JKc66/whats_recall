const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Set viewport to a small size to ensure scrolling is needed
  await page.setViewportSize({ width: 800, height: 600 });

  await page.goto('http://localhost:3000');

  await page.waitForTimeout(1000);

  if (page.url().includes('login') || await page.$('input[type="password"]')) {
    await page.fill('input[type="password"]', 'secret');
    await page.click('button[type="submit"]');
  }

  await page.waitForSelector('aside');
  console.log('Logged in and sidebar visible');

  await page.waitForSelector('button:has-text("Test Chat")');
  await page.click('button:has-text("Test Chat")');
  console.log('Clicked on Test Chat');

  await page.waitForTimeout(1000);

  // Take screenshot
  await page.screenshot({ path: '/home/jules/verification/verification.png' });
  console.log('Screenshot taken');

  const scrollInfo = await page.evaluate(() => {
    // There are multiple .overflow-y-auto, let's find the one containing messages
    const container = Array.from(document.querySelectorAll('.overflow-y-auto')).find(el => el.querySelector('[data-msg-id]'));
    if (!container) return null;
    return {
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight
    };
  });

  console.log('Scroll Info:', scrollInfo);

  if (scrollInfo) {
    const isAtBottom = scrollInfo.scrollHeight - scrollInfo.scrollTop - scrollInfo.clientHeight < 5;
    if (isAtBottom) {
      console.log('SUCCESS: Scrolled to bottom properly.');
    } else {
      console.log('FAIL: Did not scroll to bottom.');
      process.exitCode = 1;
    }
  } else {
    console.log('FAIL: Container not found');
    process.exitCode = 1;
  }

  await browser.close();
})();
