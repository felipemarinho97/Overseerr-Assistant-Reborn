// playwright.config.js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    timeout: 90_000,          // per-test timeout (real pages can be slow)
    retries: 1,               // retry once on flaky network failures
    workers: 3,               // run up to 3 sites in parallel
    reporter: [
        ['list'],
        ['html', { outputFolder: 'tests/report', open: 'never' }],
    ],
    use: {
        headless: true,
        // Real UA so sites don't serve bot-blocking pages
        userAgent:
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
        // Accept all cookies / locale to avoid popups interfering
        locale: 'en-US',
        extraHTTPHeaders: {
            'Accept-Language': 'en-US,en;q=0.9',
        },
        // Capture screenshot + trace only on failure
        screenshot: 'only-on-failure',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { browserName: 'chromium' },
        },
    ],
});
