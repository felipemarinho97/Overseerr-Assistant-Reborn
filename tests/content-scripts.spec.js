/**
 * content-scripts.spec.js
 *
 * Tests that each content script correctly SCRAPES its page.
 *
 * Strategy: we inject a chrome mock that records every sendMessage call instead
 * of returning Overseerr data. We then assert on what the script sent — that is
 * the scraped value (title, imdbId, tmdbId, mediaType…).
 *
 * No container rendering, no fake API responses, no Overseerr dependency.
 *
 * Run:
 *   npm test
 *   npx playwright test --grep "IMDb"
 *   PWDEBUG=1 npx playwright test   # headed mode for debugging
 */

const { test, expect } = require('@playwright/test');
const { loadPage, injectAndRun, readMessages, readContainer, isCloudflareChallenge } = require('./helpers');
const { name } = require('../playwright.config');

// ─── Test cases ───────────────────────────────────────────────────────────────
//
// Fields:
//   name       {string}   Test name.
//   url        {string}   Real page to visit.
//   script     {string}   Content script filename without .js.
//   waitUntil  {string?}  Page load strategy (default: 'domcontentloaded').
//   timeout    {number?}  Per-test timeout in ms. Defaults to playwright.config value.
//
//   expected   {object}   Fields to assert on the scraping sendMessage call:
//     .query      {string}  contentScriptQuery value ('search' or 'queryMedia').
//     .title      {string?} title sent in a 'search' message.
//     .tmdbId     {number?} numeric TMDB id sent in a 'queryMedia' message.
//     .mediaType  {string?} mediaType sent in a 'queryMedia' message.

const CASES = [
    {
        name: 'TMDB – Movie',
        url: 'https://www.themoviedb.org/movie/550-fight-club',
        script: 'tmdb',
        expected: { query: 'queryMedia', tmdbId: 550, mediaType: 'movie' },
    },
    {
        name: 'TMDB – TV Show',
        url: 'https://www.themoviedb.org/tv/1396-breaking-bad',
        script: 'tmdb',
        expected: { query: 'queryMedia', tmdbId: 1396, mediaType: 'tv' },
    },
    {
        name: 'IMDb – Movie',
        url: 'https://www.imdb.com/title/tt0137523/',
        script: 'imdb',
        waitUntil: 'networkidle',
        timeout: 60_000,
        expected: { query: 'search', title: 'imdb:tt0137523' },
    },
    {
        name: 'IMDb – TV Show',
        url: 'https://www.imdb.com/title/tt0903747/',
        script: 'imdb',
        waitUntil: 'networkidle',
        timeout: 60_000,
        expected: { query: 'search', title: 'imdb:tt0903747' },
    },
    {
        name: 'Letterboxd – Movie',
        url: 'https://letterboxd.com/film/fight-club/',
        script: 'letterboxd',
        expected: { query: 'queryMedia', tmdbId: 550, mediaType: 'movie' },
    },
    {
        name: 'Letterboxd – TV Show',
        url: 'https://letterboxd.com/film/shogun-2024/',
        script: 'letterboxd',
        expected: { query: 'queryMedia', tmdbId: 126308, mediaType: 'tv' },
    },
    {
        name: 'JustWatch – Movie',
        url: 'https://www.justwatch.com/us/movie/fight-club',
        script: 'justwatch',
        waitUntil: 'networkidle',
        timeout: 60_000,
        expected: { query: 'search', title: 'Fight Club' },
    },
    {
        name: 'JustWatch – TV Show',
        url: 'https://www.justwatch.com/us/tv-show/breaking-bad',
        script: 'justwatch',
        waitUntil: 'networkidle',
        timeout: 60_000,
        expected: { query: 'search', title: 'Breaking Bad' },
    },
    {
        name: 'Filmow – Movie',
        url: 'https://filmow.com/clube-da-luta-t318/',
        script: 'filmow',
        expected: { query: 'search', title: 'Fight Club' },
    },
    {
        name: 'Filmow – TV Show',
        url: 'https://filmow.com/breaking-bad-1a-temporada-t13854/',
        script: 'filmow',
        expected: { query: 'search', title: 'Breaking Bad' },
    },
    {
        name: 'AlloCiné – Movie',
        url: 'https://www.allocine.fr/film/fichefilm_gen_cfilm=21189.html',
        script: 'allocine',
        expected: { query: 'search', title: 'Fight Club' },
    },
    {
        name: 'AlloCiné – TV Show',
        url: 'https://www.allocine.fr/series/ficheserie_gen_cserie=3517.html',
        script: 'allocine',
        expected: { query: 'search', title: 'Breaking Bad' },
    },
    {
        name: 'Rotten Tomatoes – Movie',
        url: 'https://www.rottentomatoes.com/m/fight_club',
        script: 'rottentomatoes',
        waitUntil: 'networkidle',
        timeout: 60_000,
        expected: { query: 'search', title: 'Fight Club' },
    },
    {
        name: 'Rotten Tomatoes – TV Show',
        url: 'https://www.rottentomatoes.com/tv/breaking_bad',
        script: 'rottentomatoes',
        waitUntil: 'networkidle',
        timeout: 60_000,
        expected: { query: 'search', title: 'Breaking Bad' },
    },
    {
        name: 'TVDB – Movie',
        url: 'https://thetvdb.com/movies/fight-club',
        script: 'tvdb',
        expected: { query: 'queryMedia', tmdbId: "550", mediaType: 'movie' },
    },
    {
        name: 'TVDB – TV Show',
        url: 'https://thetvdb.com/series/breaking-bad',
        script: 'tvdb',
        expected: { query: 'queryMedia', tmdbId: "1396", mediaType: 'tv' },
    },
    {
        name: 'Taste.io – Movie',
        url: 'https://www.taste.io/movies/fight-club',
        script: 'taste',
        waitUntil: 'networkidle',
        timeout: 60_000,
        expected: { query: 'search', title: 'Fight Club' },
    },
    {
        name: 'Taste.io – TV Show',
        url: 'https://www.taste.io/tv/breaking-bad',
        script: 'taste',
        waitUntil: 'networkidle',
        timeout: 60_000,
        expected: { query: 'search', title: 'Breaking Bad' },
    },
    {
        name: 'Trakt – Movie',
        url: 'https://trakt.tv/movies/fight-club-1999',
        script: 'trakt',
        waitUntil: 'networkidle',
        expected: { query: 'queryMedia', tmdbId: 550, mediaType: 'movie' },
    },
    {
        name: 'Trakt – TV Show',
        url: 'https://trakt.tv/shows/breaking-bad',
        script: 'trakt',
        waitUntil: 'networkidle',
        expected: { query: 'queryMedia', tmdbId: 1396, mediaType: 'tv' },
    },
    {
        name: 'SensCritique – Movie',
        url: 'https://www.senscritique.com/film/fight_club/363185',
        script: 'senscritique',
        waitUntil: 'networkidle',
        expected: { query: 'search', title: 'Fight Club' },
    },
    {
        name: 'SensCritique – TV Show',
        url: 'https://www.senscritique.com/serie/breaking_bad/264963',
        script: 'senscritique',
        waitUntil: 'networkidle',
        expected: { query: 'search', title: 'Breaking Bad' },
    }
];

// ─── Test runner ──────────────────────────────────────────────────────────────
// Two tests are generated for every case: scraping and container insertion.

for (const tc of CASES) {
    // ── Test 1: scraping ──────────────────────────────────────────────────────
    // Verifies the script reads the correct metadata from the page DOM.
    test(`${tc.name} – scraping`, async ({ page }) => {
        if (tc.timeout) test.setTimeout(tc.timeout);

        await loadPage(page, tc.url, tc.waitUntil);

        if (await isCloudflareChallenge(page)) {
            test.skip(true, 'Cloudflare challenge page — cannot run headless');
        }

        await injectAndRun(page, tc.script, 'scraping');

        const messages = await readMessages(page);

        // Find the first message of the expected query type.
        // Some scripts send housekeeping messages first (e.g. IMDb sends
        // getOverseerrVersion before search), so we skip those.
        const msg = messages.find(m => m.contentScriptQuery === tc.expected.query);
        expect(msg, `No '${tc.expected.query}' message sent — scraping produced nothing`).toBeTruthy();

        if (tc.expected.title     !== undefined) expect(msg.title,     'Wrong scraped title').toBe(tc.expected.title);
        if (tc.expected.tmdbId    !== undefined) expect(msg.tmdbId,    'Wrong scraped TMDB id').toBe(tc.expected.tmdbId);
        if (tc.expected.mediaType !== undefined) expect(msg.mediaType, 'Wrong scraped mediaType').toBe(tc.expected.mediaType);
    });

    // ── Test 2: container insertion ───────────────────────────────────────────
    // Verifies the script inserts #overseerr-assistant-container into the page.
    test(`${tc.name} – container insertion`, async ({ page }) => {
        if (tc.timeout) test.setTimeout(tc.timeout);

        await loadPage(page, tc.url, tc.waitUntil);

        if (await isCloudflareChallenge(page)) {
            test.skip(true, 'Cloudflare challenge page — cannot run headless');
        }

        await injectAndRun(page, tc.script, 'container');

        const found = await readContainer(page);
        expect(found, `#overseerr-assistant-container not inserted on ${tc.url}`).toBe(true);
    });
}
