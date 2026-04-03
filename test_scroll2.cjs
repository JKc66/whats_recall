const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
    <style>
      .container {
        display: flex;
        flex-direction: column-reverse;
        height: 200px;
        overflow-y: auto;
        border: 1px solid black;
      }
      .child {
        display: flex;
        flex-direction: column;
      }
      .item { height: 50px; border: 1px solid red; }
    </style>
    </head>
    <body>
      <div class="container" id="container">
        <div class="child">
          <div class="item">1</div>
          <div class="item">2</div>
          <div class="item">3</div>
          <div class="item">4</div>
          <div class="item">5</div>
          <div class="item">6</div>
          <div class="item">7</div>
          <div class="item">8</div>
        </div>
      </div>
    </body>
    </html>
  `);

  const scrollInfo = await page.evaluate(() => {
    const el = document.getElementById('container');
    return {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight
    };
  });

  console.log(scrollInfo);
  await browser.close();
})();
