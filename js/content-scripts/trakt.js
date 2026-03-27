let overseerrContainer, tmdbId, mediaType, mediaInfo;

const ANCHOR_DESKTOP = 'div.trakt-summary-contextual-content';
const ANCHOR_MOBILE = 'div.trakt-summary-meta-info';

containerOptions.textClass = '';
containerOptions.containerClass = 'oa-mt-0 oa-mb-5 oa-py-3';
containerOptions.plexButtonClass = 'oa-bg-gray-800';
containerOptions.badgeBackground = '#444444';

mediaType = document.location.pathname.startsWith('/movies') ? 'movie' : 'tv';

const mediaTitle = $('meta[property="og:title"]').attr('content') || '';

function searchMedia() {
    chrome.runtime.sendMessage({contentScriptQuery: 'search', title: mediaTitle}, json => {
        if (!json || json.results.length === 0) {
            removeSpinner();
            insertStatusButton('Media not found', 0);
            return;
        }
        const firstResult = json.results[0];
        chrome.runtime.sendMessage({contentScriptQuery: 'queryMedia', tmdbId: firstResult.id, mediaType: mediaType}, json => {
            mediaInfo = json;
            tmdbId = json.id;
            console.log(`[Trakt] TMDB id: ${tmdbId}`);
            removeSpinner();
            fillContainer(json.mediaInfo);
        });
    });
}

if (mediaTitle) {
    Promise.race([waitForElm(ANCHOR_DESKTOP), waitForElm(ANCHOR_MOBILE)]).then((el) => {
        containerOptions.anchorElement = el.matches(ANCHOR_DESKTOP) ? ANCHOR_DESKTOP : ANCHOR_MOBILE;
        console.log(`[Trakt] Anchor: "${containerOptions.anchorElement}"`);
        initializeContainer();
        insertSpinner();

        pullStoredData(function() {
            if (!userId) {
                removeSpinner();
                insertNotLoggedInButton();
                return;
            }

            searchMedia();
        });
    });
}
