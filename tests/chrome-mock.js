/**
 * chrome-mock.js
 *
 * Injected into every page before the content scripts run.
 *
 * Two modes, controlled by window.__OA_MODE (set before injecting this file):
 *
 *   'scraping'  (default)
 *     Records every sendMessage call into window.__OA_MESSAGES.
 *     Returns empty results so the script stops right after scraping — no
 *     container is inserted. Tests assert on the captured message arguments.
 *
 *   'container'
 *     Returns realistic stub responses so the full script flow runs:
 *     search → queryMedia → fillContainer → DOM insertion.
 *     Tests assert that #overseerr-assistant-container appears in the DOM.
 */

window.__OA_MESSAGES = [];

// Realistic stub returned for queryMedia so fillContainer() can run fully.
function _mediaStub(tmdbId, mediaType) {
    const imdbMatch = window.location.pathname.match(/\/title\/(tt\d+)/);
    return {
        id: tmdbId || 550,
        mediaType: mediaType || 'movie',
        externalIds: { imdbId: imdbMatch ? imdbMatch[1] : 'tt0137523' },
        mediaInfo: { status: 5, mediaUrl: 'http://127.0.0.1:5055/movie/550', requests: [] },
    };
}

window.chrome = {
    runtime: {
        sendMessage(message, callback) {
            window.__OA_MESSAGES.push(message);

            const mode = window.__OA_MODE || 'scraping';
            let stub = null;

            if (message.contentScriptQuery === 'getOverseerrVersion') {
                stub = { version: '99.0.0' }; // high version → skips legacy branches
            } else if (message.contentScriptQuery === 'checkJellyseerr') {
                stub = false;
            } else if (message.contentScriptQuery === 'listenForUrlChange') {
                stub = null;
            } else if (mode === 'scraping') {
                // Scraping mode: return empty results so the script halts after the first call.
                if (message.contentScriptQuery === 'search') stub = { results: [] };
                // queryMedia is never reached in scraping mode.
            } else {
                // Container mode: return enough data for fillContainer() to run.
                if (message.contentScriptQuery === 'search') {
                    stub = { results: [{ id: 550, mediaType: 'movie', title: 'Fight Club' }] };
                } else if (message.contentScriptQuery === 'queryMedia') {
                    stub = _mediaStub(message.tmdbId, message.mediaType);
                }
            }

            setTimeout(() => callback && callback(stub), 0);
        },
        getURL(path) {
            if (path.endsWith('.png')) return 'data:image/png;base64,iVBORw0KGgo=';
            return path;
        },
        onMessage: {
            addListener() { /* no-op */ }
        }
    },
    storage: {
        sync: {
            get(_keys, callback) {
                // pullStoredData() needs these fields to consider the user logged-in.
                callback({
                    serverAPIKey: 'test-key',
                    serverIp:     '127.0.0.1',
                    serverPort:   '5055',
                    serverProtocol: 'http',
                    serverPath:   '/',
                    userId:       1,
                    overseerrVersion: '99.0.0',
                });
            },
            set(_data, callback) { if (callback) callback(); }
        }
    }
};
