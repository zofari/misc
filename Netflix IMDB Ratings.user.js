// ==UserScript==
// @name         Netflix IMDB Ratings
// @version      0.1
// @description  Show IMDB ratings on Netflix
// @author       Zhao Lin
// @match        https://www.netflix.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getResourceURL
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_openInTab
// @connect      omdbapi.com
// @resource     imdbIcon   https://ia.media-imdb.com/images/M/MV5BMTczNjM0NDY0Ml5BMl5BcG5nXkFtZTgwMTk1MzQ2OTE@._V1_.png
// ==/UserScript==

// Original script https://github.com/ioannisioannou16/netflix-imdb/raw/master/netflix-imdb.user.js

(function() {
    "use strict";

    GM_addStyle(`
        @keyframes fade-in {
            from {
                opacity: 0;
            }
            to {
                opacity: 100;
            }
        }
        .imdb-container {
            display: -ms-inline-flexbox;
            display: inline-flex;
            -webkit-align-items: center;
            align-items: center;

            color: white;
            height: 23px;

            animation-name: fade-in;
            animation-duration: 1.5s;
        }
        .imdb-image {
            width: 20px;
            height: 20px;
            margin: 0 3px 0 0;
        }
        .imdb-score,
        .imdb-votes {
            margin: 3px;
        }
    `);

    let cache = {

        _nextweek: function() {
            let now = new Date();
            let day7 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
            return day7.getTime();
        },

        _key: function(title) {
            return "imdb " + title;
        },

        set: function(title, rating) {
            let key = this._key(title);
            let val = {
                "rating": rating,
                "expire": this._nextweek()
            };

            GM_setValue(key, val);
        },

        get: function(title) {
            let key = this._key(title);
            let val = GM_getValue(key);

            return val && val.rating;
        },

        purgeExpiredEntries: function() {
            let keys = GM_listValues();

            for (let i = 0; i < keys.length; i++) {
                let key = keys[i];
                let val = GM_getValue(key);

                let expire = val.expire;
                let now = (new Date()).getTime();

                if (expire < now) {
                    GM_deleteValue(key);
                }
            }
        }
    };

    let imdb = {

        _titleQueryUrl: function(title) {
            const apiKey = "314377c9";
            return "https://www.omdbapi.com/?apikey=" + apiKey + "&t=" + encodeURI(title);
        },

        getRating: function(title, callback) {
            let url = this._titleQueryUrl(title);

            GM_xmlhttpRequest({
                method: "GET",
                url: url,

                onload: function(res) {

                    if (res.status != 200) {
                        console.error(url + " failed with status " + res.status);
                        return;
                    }

                    try {
                        var response = JSON.parse(res.response);
                    } catch (e) {
                        console.error("Error parsing response: " + res.response);
                        return;
                    }

                    if (!response.imdbRating || !response.imdbVotes) {
                        console.error("Missing IMDB rating or vote count: " + res.response);
                        return;
                    }

                    if (response.imdbRating === "N/A" || response.imdbVotes === "N/A") {
                        console.error("Invalid IMDB rating or vote count: " + res.response);
                        return;
                    }

                    callback({score: response.imdbRating, votes: response.imdbVotes, url: url})
                },

                onerror: function() {
                    console.error("Error from onerror for fetching " + url);
                }
            });
        }

    };

    const imdbLogo = GM_getResourceURL("imdbIcon");

    class RatingFetcher {

        constructor(title) {
            this.title = title;
        }

        _setRatingNode(rating) {

            let iconNode = document.createElement("img");
            iconNode.classList.add("imdb-image");
            iconNode.src = imdbLogo;

            let scoreNode = document.createElement("span");
            scoreNode.classList.add("imdb-score");
            scoreNode.appendChild(document.createTextNode(rating.score));

            let voteNode = document.createElement("span");
            voteNode.classList.add("imdb-votes");
            voteNode.appendChild(document.createTextNode("(" + rating.votes + " votes)"));

            this._node.appendChild(iconNode);
            this._node.appendChild(scoreNode);
            this._node.appendChild(voteNode);

            this._node.addEventListener('click', function() {
                GM_openInTab(rating.url, { active: true, insert: true, setParent: true });
            });

            this._node.classList.add("imdb-container");
        }

        _fetchAndSetRatingNode() {

            let rating = cache.get(this.title);
            if (rating) {
                this._setRatingNode(rating);
                return;
            }

            // Need to use arrow notation to allow binding of `this` to RatingFetcher.
            imdb.getRating(this.title, (rating) => {
                cache.set(this.title, rating);
                this._setRatingNode(rating);
            });
        }

        get node() {
            this._node = document.createElement("div");
            this._fetchAndSetRatingNode();
            return this._node;
        }
    }

    class RatingRenderer {
        constructor(node) {
            this.node = node;
        }

        // child classes to fill in _getTitle(), _getParentNode()

        renderImdbRating() {
            let title = this._getTitle();

            console.log("Extracting title " + title);

            if (!title) {
                return;
            }

            let ratingFetcher = new RatingFetcher(title);
            this._getParentNode().appendChild(ratingFetcher.node);
        }
    }

    class RegularCardPreviewRenderer extends RatingRenderer {
        _getTitle() {
            let imgNode = this.node.querySelector(".previewModal--boxart");
            return imgNode && imgNode.getAttribute("alt");
        }

        _getParentNode() {
            return this.node.querySelector(".previewModal--metadatAndControls-container");
        }
    }

    class TallCardPreviewRenderer extends RatingRenderer {
        _getTitle() {
            let titleNode = this.node.querySelector(".bob-title");
            return titleNode && titleNode.innerHTML;
        }

        _getParentNode() {
            return this.node.querySelector(".bob-overview");
        }
    }

    class BillboardRenderer extends RatingRenderer {
        _getTitle() {
            let imgNode = this.node.querySelector(".title-logo");
            return imgNode && imgNode.getAttribute("alt");
        }

        _getParentNode() {
            return this.node.querySelector(".logo-and-text");
        }
    }

    let observer = new MutationObserver(mutationsList => {

        mutationsList.forEach(mutation => {

            mutation.addedNodes.forEach(node => {

                console.debug("Received mutation event with added node " + node.nodeName + " with class list " + node.classList);

                if (!(node instanceof HTMLElement)) {
                    return;
                }

                if (node.classList.contains("focus-trap-wrapper")) {
                    console.debug("Fetching imdb rating for regular card perview");

                    let renderer = new RegularCardPreviewRenderer(node);
                    renderer.renderImdbRating();
                    return;
                }

                if (node.classList.contains("bob-card")) {
                    console.debug("Fetching imdb rating for tall card preview");

                    let renderer = new TallCardPreviewRenderer(node);
                    renderer.renderImdbRating();
                    return;
                }

                let billboardNode = node.querySelector(".billboard-row");
                if (billboardNode) {
                    console.debug("Fetching imdb rating for billboard");

                    let renderer = new BillboardRenderer(node);
                    renderer.renderImdbRating();
                    return;
                }
            });
        });
    });

    // --- main ---

    // Clean up expired rating entries from the cache
    cache.purgeExpiredEntries();

    // Add rating to the billboard when just started
    let billboardNode = document.querySelector(".billboard-row");
    if (billboardNode) {
        console.debug("Fetching imdb rating for existing billboard node");

        let renderer = new BillboardRenderer(billboardNode);
        renderer.renderImdbRating();
    }

    // Listen for added nodes for rating insertion.
    observer.observe(document, {childList: true, subtree: true});

})();
