// ==UserScript==
// @name         Netflix IMDB Ratings
// @version      0.1
// @description  Show IMDB ratings on Netflix
// @author       Zhao Lin
// @match        https://www.netflix.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getResourceText
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
        .imdb-rating {
            display: -webkit-inline-box;
            display: -webkit-inline-flex;
            display: -moz-inline-box;
            display: -ms-inline-flexbox;
            display: inline-flex;
            -webkit-flex-wrap: nowrap;
                -ms-flex-wrap: nowrap;
                    flex-wrap: nowrap;
            -webkit-box-align: center;
            -webkit-align-items: center;
            -moz-box-align: center;
                -ms-flex-align: center;
                    align-items: center;
            color: white;
            padding: 8px 0;
        }

        .imdb-image {
            width: 20px;
            height: 20px;
            margin: 3px;
        }

        .imdb-error,
        .imdb-loading,
        .imdb-score,
        .imdb-votes,
        .imdb-no-rating {
            margin: 0 3px;
        }
    `);

    let cache = {

        __nextweek: function() {
            let now = new Date();
            let day7 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
            return day7.getTime();
        },

        set: function(title, rating) {
            let key = "imdb " + title;
            let val = {
                "rating": rating,
                "expire": this.__nextweek()
            };

            GM_setValue(key, val);
        },

        get: function(title) {
            let key = "imdb " + title;
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

        __titleQueryUrl: function(title) {
            const apiKey = "314377c9";
            return "https://www.omdbapi.com/?apikey=" + apiKey + "&t=" + encodeURI(title);
        },

        getRating: function(title, cb) {
            let url = this.__titleQueryUrl(title);

            GM_xmlhttpRequest({
                method: "GET",
                url: url,

                onload: function(res) {
                    console.log("Called " + url + " status: " + res.status);

                    if (res.status != 200) {
                        return cb("Error " + res.status);
                    }

                    try {
                        var resObj = JSON.parse(res.response);
                    } catch (e) {
                        return cb("Error parsing");
                    }

                    if (!resObj.imdbRating) {
                        return cb("Error not found");
                    }

                    cb(null, {score: resObj.imdbRating, votes: resObj.imdbVotes, url: url})
                },

                onerror: function() {
                    cb("Error Internal");
                }
            });
        }

    };

    const imdbLogo = GM_getResourceURL("imdbIcon");

    class RatingFetcher {

        constructor(title) {
            this.__initNode();
            this.__fetchRating(title);
        }

        __initNode() {
            this.node = document.createElement("div");

            this.node.classList.add("imdb-rating");
            this.node.style.cursor = "default";

            let img = document.createElement("img");
            img.classList.add("imdb-image");
            img.src = imdbLogo;

            this.node.appendChild(img);
            this.node.appendChild(document.createElement("div"));
        }

        __setDiv(msg, style) {
            let span = document.createElement("span");
            span.classList.add(style);
            span.appendChild(document.createTextNode(msg));

            let div = document.createElement("div");
            div.appendChild(span);

            this.node.replaceChild(div, this.node.querySelector("div"));
        }

        __setErrorDiv(msg) {
            this.__setDiv(msg, "imdb-error");
        }

        __setLoadingDiv(msg) {
            this.__setDiv(msg, "imdb-loading");
        }

        __setRatingDiv(rating) {
            if (!rating || !rating.score || !rating.votes || !rating.url) {
                this.__setDiv("N/A", "imdb-no-rating");
                return;
            }

            let score = document.createElement("span");
            score.classList.add("imdb-score");
            score.appendChild(document.createTextNode(rating.score));

            let votes = document.createElement("span");
            votes.classList.add("imdb-votes");
            votes.appendChild(document.createTextNode("(" + rating.votes + " votes)"));

            let div = document.createElement("div");
            div.appendChild(score);
            div.appendChild(votes);

            div.addEventListener('click', function() {
                GM_openInTab(rating.url, { active: true, insert: true, setParent: true });
            });
            div.style.cursor = "pointer";

            this.node.replaceChild(div, this.node.querySelector("div"));
        }

        __fetchRating(title) {
            this.__setLoadingDiv("Loading...");

            let rating = cache.get(title);
            if (rating) {
                this.__setRatingDiv(rating);
                return;
            }

            // Need to use arrow notation to allow binding of `this` to RatingFetcher.
            imdb.getRating(title, (err, rating) => {
                if (err) {
                    this.__setErrorDiv(err);
                } else {
                    cache.set(title, rating);
                    this.__setRatingDiv(rating);
                }
            });
        }

        getFormattedNode() {
            return this.node;
        }
    }

    class RatingRenderer {
        constructor(node) {
            this.node = node;
        }

        // child classes to fill in __getTitle(), __getParentNode(), __getSiblingNode()

        renderImdbRating() {
            let title = this.__getTitle();

            console.log("Extracting title " + title);

            if (!title) {
                return;
            }

            let ratingFetcher = new RatingFetcher(title);
            this.__getParentNode().insertBefore(ratingFetcher.getFormattedNode(), this.__getSiblingNode());
        }
    }

    class RegularCardPreviewRenderer extends RatingRenderer {
        __getTitle() {
            let imgNode = this.node.querySelector(".previewModal--boxart");
            return imgNode && imgNode.getAttribute("alt");
        }

        __getParentNode() {
            return this.node.querySelector(".previewModal--metadatAndControls-container");
        }

        __getSiblingNode() {
            return this.node.querySelector(".previewModal--metadatAndControls-tags-container");
        }
    }

    class TallCardPreviewRenderer extends RatingRenderer {
        __getTitle() {
            let titleNode = this.node.querySelector(".bob-title");
            return titleNode && titleNode.innerHTML;
        }

        __getParentNode() {
            return this.node.querySelector(".bob-overview");
        }

        __getSiblingNode() {
            return this.node.querySelector(".bob-overview-evidence-wrapper");
        }
    }

    class BillboardRenderer extends RatingRenderer {
        __getTitle() {
            let imgNode = this.node.querySelector(".title-logo");
            return imgNode && imgNode.getAttribute("alt");
        }

        __getParentNode() {
            return this.node.querySelector(".logo-and-text");
        }

        __getSiblingNode() {
            return this.node.querySelector(".billboard-links");
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