/**
 * helpers.js
 *
 *   loadPage(page, url, waitUntil?)
 *     Navigate to a URL and wait for the page to be ready for injection.
 *
 *   injectAndRun(page, scriptName, mode?)
 *     Inject the chrome mock + common scripts + the named content script.
 *     mode: 'scraping' (default) — records messages, returns empty results.
 *           'container'          — returns real stubs so fillContainer() runs.
 *
 *   readMessages(page)
 *     Return the list of sendMessage calls the content script made, in order.
 *
 *   readContainer(page)
 *     Wait for #overseerr-assistant-container in the DOM (or shadow roots)
 *     and return whether it was found.
 */

const fs   = require('fs');
const path = require('path');

const ROOT        = path.resolve(__dirname, '..');
const CHROME_MOCK = path.join(__dirname, 'chrome-mock.js');

// Scripts injected before every content script, matching manifest order
const COMMON_SCRIPTS = [
    'js/lib/jquery-3.5.1.min.js',
    'js/storage.js',
    'js/overseerr-container.js',
];

function readScript(relPath) {
    return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

// ─── loadPage ─────────────────────────────────────────────────────────────────

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {'domcontentloaded'|'load'|'networkidle'} [waitUntil='domcontentloaded']
 */
async function loadPage(page, url, waitUntil = 'domcontentloaded') {
    // 'networkidle' never fires on SPAs; use 'load' + a short settle instead
    const strategy = waitUntil === 'networkidle' ? 'load' : waitUntil;
    await page.goto(url, { waitUntil: strategy, timeout: 45_000 });
    if (waitUntil === 'networkidle') {
        await page.waitForTimeout(3000);
    }
}

// ─── injectAndRun ─────────────────────────────────────────────────────────────

/**
 * Inject the chrome mock and the named content script into the already-loaded page.
 *
 * All scripts are concatenated into ONE eval call so variables defined in earlier
 * scripts (e.g. `containerOptions` from overseerr-container.js) remain in scope
 * for the content script.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} scriptName        - content script filename without .js, e.g. 'imdb'
 * @param {'scraping'|'container'} [mode='scraping']
 */
async function injectAndRun(page, scriptName, mode = 'scraping') {
    // 1. Set the mode flag, then inject the chrome mock
    const mockSrc = fs.readFileSync(CHROME_MOCK, 'utf8');
    await page.evaluate(({ src, m }) => {
        window.__OA_MODE = m;
        eval(src); // eslint-disable-line no-eval
    }, { src: mockSrc, m: mode });

    // 2. Run all scripts in ONE eval so shared variables stay in scope
    const scripts = [...COMMON_SCRIPTS, `js/content-scripts/${scriptName}.js`];
    const combined = scripts.map(readScript).join('\n;\n');

    const err = await page.evaluate((code) => {
        try { eval(code); return null; } // eslint-disable-line no-eval
        catch (e) { return e.message; }
    }, combined);

    if (err) console.error(`[OA injection error – ${scriptName}]:`, err);

    // Give async callbacks (pullStoredData, sendMessage) time to settle
    await page.waitForTimeout(500);
}

// ─── readMessages ─────────────────────────────────────────────────────────────

/**
 * Return all sendMessage calls the content script made, in order.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<object[]>}
 */
async function readMessages(page) {
    return page.evaluate(() => window.__OA_MESSAGES || []);
}

// ─── readContainer ────────────────────────────────────────────────────────────

/**
 * Wait for #overseerr-assistant-container to appear in the DOM (including shadow
 * roots, e.g. Rotten Tomatoes' media-hero element) and return whether it was found.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeoutMs=8000]
 * @returns {Promise<boolean>}
 */
async function readContainer(page, timeoutMs = 8000) {
    try {
        await page.waitForSelector('#overseerr-assistant-container', { timeout: timeoutMs });
        return true;
    } catch (_) {
        // Check inside shadow roots (e.g. Rotten Tomatoes uses <media-hero>)
        return page.evaluate(() => {
            for (const host of document.querySelectorAll('media-hero')) {
                if (host.shadowRoot?.querySelector('#overseerr-assistant-container')) return true;
            }
            return false;
        });
    }
}

// ─── isCloudflareChallenge ────────────────────────────────────────────────────

/**
 * Returns true if the current page is a Cloudflare challenge/block page.
 * Cloudflare challenge pages consistently contain one of these markers.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<boolean>}
 */
async function isCloudflareChallenge(page) {
    return page.evaluate(() => {
        const title = document.title || '';
        const body  = document.body?.innerText || '';
        return (
            title.includes('Just a moment') ||
            title.includes('Attention Required') ||
            document.querySelector('#challenge-form') !== null ||
            document.querySelector('#cf-challenge-running') !== null ||
            body.includes('Checking if the site connection is secure') ||
            body.includes('Enable JavaScript and cookies to continue')
        );
    });
}

module.exports = { loadPage, injectAndRun, readMessages, readContainer, isCloudflareChallenge };
