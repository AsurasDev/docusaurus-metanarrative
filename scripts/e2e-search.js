const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', err => errors.push(err.message));

  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 60000 });
    // Open search modal - DocSearch uses a button with aria-label 'Search'
    await page.waitForSelector('button[aria-label="Search"]', { timeout: 10000 });
    await page.click('button[aria-label="Search"]');
    // Focus input and type
    await page.waitForSelector('input[type="search"]', { timeout: 10000 });
    await page.type('input[type="search"]', 'Aboleth');
    // wait for results container
    await page.waitForTimeout(1500);

    // grab results
    const hits = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.DocSearch-Hit'));
      return items.slice(0,5).map(it => {
        const title = it.querySelector('.DocSearch-Hit-title')?.textContent || it.textContent || '';
        const url = it.querySelector('a')?.getAttribute('href') || null;
        return { title: title && title.trim(), url };
      });
    });

    console.log('E2E: hits sample:', hits);
    if (errors.length) {
      console.error('E2E: console errors captured:', errors.slice(0,10));
      process.exitCode = 2;
    } else {
      console.log('E2E: no console errors captured');
    }
  } catch (e) {
    console.error('E2E: test failed:', e.message || e);
    process.exitCode = 3;
  } finally {
    await browser.close();
  }
})();
