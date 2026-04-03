const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.setViewportSize({ width: 800, height: 600 });

  await page.goto('http://localhost:3000');
  await page.waitForTimeout(1000);

  if (page.url().includes('login') || await page.$('input[type="password"]')) {
    await page.fill('input[type="password"]', 'secret');
    await page.click('button[type="submit"]');
  }

  await page.waitForSelector('aside');
  await page.waitForSelector('button:has-text("Test Chat")');
  await page.click('button:has-text("Test Chat")');

  await page.waitForTimeout(1000);

  const scrollInfo = await page.evaluate(() => {
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
    // With column-reverse, scrollTop is 0 when at the bottom
    const isAtBottom = Math.abs(scrollInfo.scrollTop) < 5;
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
