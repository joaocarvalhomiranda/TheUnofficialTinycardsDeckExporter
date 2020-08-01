/*jshint esversion: 8 */
const proxyAddress = 'https://api.allorigins.win/raw?url=';
var logData = "";
var errorsFound = false;
var errorsFileDownload = false;
var errorGettingDeckData = false;

// logs messages
function log(type, text, message) {
    text = new Date().toLocaleString() + " " + text;
    if (message !== undefined) message = JSON.stringify(message, null, 4);
    switch (type) {
        case "log":
            if (message === undefined) console.log(text);
            else console.log(text, message);
            break;
        case "error":
            errorsFound = true;
            if (message === undefined) console.error(text);
            else console.error(text, message);
            break;
        default:
            console.log("Unknown log type: ", type);
            if (message === undefined) console.log("Message to log was: ", text);
            else console.log("Message to log was: ", text, message);
    }
    if (message === undefined) logData += '\n' + text;
    else logData += '\n' + text + message;
}

// loads the necessary libraries
function loadScripts() {
    try {
        // import external scripts 
        var scriptsJS = ["https://cdnjs.cloudflare.com/ajax/libs/jszip/3.3.0/jszip.min.js", "https://cdnjs.cloudflare.com/ajax/libs/jszip-utils/0.1.0/jszip-utils.min.js", "https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/1.3.8/FileSaver.js", "https://cdnjs.cloudflare.com/ajax/libs/dom-to-image/2.6.0/dom-to-image.min.js"];

        for (var index = 0; index < scriptsJS.length; ++index) {
            var script = document.createElement('script');
            script.src = scriptsJS[index];
            script.type = 'text/javascript';

            injectScript(script.src)
                .then(() => {
                    log("log", 'Script loaded!');
                }).catch(error => {
                    errorsFound = true;
                    log("error", "ERROR: injectScript: ", error);
                });
        }

        function injectScript(src) {
            return new Promise((resolve, reject) => {
                log("log", "Loading script: ", src);
                const script = document.createElement('script');
                script.src = src;
                script.addEventListener('load', resolve);
                script.addEventListener('error', e => reject(e.error));
                document.head.appendChild(script);
            });
        }

        // load jquery scripts
        var scriptsJQuery = ["https://cdnjs.cloudflare.com/ajax/libs/jquery/3.5.1/jquery.min.js", "https://cdnjs.cloudflare.com/ajax/libs/jquery.blockUI/2.70/jquery.blockUI.min.js"];

        (async () => {
            for (let i = 0; i < scriptsJQuery.length; i++) {
                const resp = await fetch(scriptsJQuery[i]);
                const text = await resp.text();
                eval(text);
            }
        })();
    } catch (error) {
        errorsFound = true;
        log("error", "ERROR: loadScripts: ", error);
    }
}

// load the libraries
loadScripts();

// updates the progress information
function updateProgress(message) {
    try {
        if (message === undefined) {
            log("error", "ERROR: updateProgress: message is undefined");
            throw "Parameter undefined";
        }

        document.querySelectorAll(".blockMsg")[0].innerText = message;
    } catch (error) {
        errorsFound = true;
        log("error", "ERROR: updateProgress: ", error);
    }
}

// prepares for export and starts it
async function doIt() {
    try {
        // check if libraries are loaded
        function defer(method) {
            if (window.jQuery && window.$.blockUI) {
                method();
            } else {
                setTimeout(function() {
                    defer(method);
                }, 100);
            }
        }

        defer(function() {
            // libraries are loaded, start the export
            startExport();
        });

        // starts the export process
        async function startExport() {
            try {
                log("log", "Starting export");

                // get the deck long id
                var deckShortId = window.location.pathname.split('/decks/').pop().split('/')[0];

                // check if we are in a cards page
                // _15CbF is the class for the tab pair Lessons/Cards in the page
                if (deckShortId.length == 0 || document.getElementsByClassName('_15CbF').length == 0) {
                    alert("This is not a deck page! You need to go to the Tinycards page of the deck you want to export!");
                } else {
                    // block the UI while performing the export operation
                    window.$.blockUI({
                        message: 'Exporting deck...'
                    });

                    // click on the cards tab
                    document.getElementsByClassName('_15CbF')[1].click();

                    // embed stylesheets
                    updateProgress('Retrieving style sheets...');
                    await embedStyleSheets();

                    // embed fonts
                    updateProgress('Retrieving fonts...');
                    await embedFonts();

                    // proxify images
                    updateProgress('Retrieving images...');
                    proxifyImages();

                    // embed images
                    embedImages();

                    // get the deck long id 
                    window.$.getJSON('https://tinycards.duolingo.com/api/1/decks/uuid?compactId=' + deckShortId, function(idData) {
                        var deckLongId = idData.uuid;

                        // and go for the deck
                        updateProgress('Retrieving deck\'s information...');
                        getDeck(deckLongId);
                    });
                }
            } catch (error) {
                errorsFound = true;
                log("error", "ERROR: startExport: ", error);
            }
        }
    } catch (error) {
        errorsFound = true;
        log("error", "ERROR: doIt: ", error);
    }

}

// gets the deck
function getDeck(deckLongId) {
    try {
        if (deckLongId === undefined) {
            log("error", "ERROR: getDeck: deckLongId is undefined");
            throw "Parameter undefined";
        }

        log("log", "Getting deck");

        // go through the deck data and download it
        window.$.getJSON('https://tinycards.duolingo.com/api/1/decks/' + deckLongId + '?attribution=true&expand=true', async function(deckData) {
            log("log", "deckData: ", deckData);

            // retrieve info from the deck
            var cardCount = deckData.cardCount;
            var coverImageUrl = deckData.coverImageUrl != null ? deckData.coverImageUrl : deckData.imageUrl;
            var deckDescription = deckData.description;
            var creatorName = deckData.fullname;
            var deckName = deckData.name;
            var creatorPicture = deckData.picture.replace("https", proxyAddress + "https");
            var creatorUsername = deckData.username;
            var deckZipName = deckData.slug + "_" + deckData.compactId;
            var deckUrl = window.location;

            // deck main info for csv
            var rows = [
                ["Deck name", deckName],
                ["Deck description", deckDescription],
                ["Creator username", creatorUsername],
                ["Creator name", creatorName],
                ["Number of cards", cardCount],
                ["Deck URL", deckUrl]
            ];

            // prepare the csv rows
            var deckMainInfo = rows.map(e => "\"" + e.join("\",\"") + "\"").join("\n");
            log("log", "deckMainInfo: ", deckMainInfo);

            // create a zip to bundle the resources and return it to the user at the end
            var zip = new JSZip();

            // general info to include in the zip
            zip.file("deckFullInfo.json", JSON.stringify(deckData, null, 4));

            zip.file("coverImage.jpg", coverImageUrl.startsWith("data:") ? coverImageUrl.replace(/^[^,]+,/, "") : getBinaryFile(coverImageUrl), coverImageUrl.startsWith("data:") ? {
                base64: true
            } : {
                binary: true
            });
            zip.file("creatorPicture.png", creatorPicture.startsWith("data:") ? creatorPicture.replace(/^[^,]+,/, "") : getBinaryFile(creatorPicture), creatorPicture.startsWith("data:") ? {
                base64: true
            } : {
                binary: true
            });

            // get the cards info
            updateProgress('Retrieving cards\' info...');
            zip = await getDeckCardsInfo(deckData, deckMainInfo, zip);

            // for posterity's sake
            updateProgress('Retrieving cards...');
            zip = await everyoneSmile(zip);

            updateProgress('Almost done. Generating the zip file...');
            // hold your horses, a bit useless but just to make the above message visible long enough
            await new Promise(resolve => setTimeout(resolve, 1000));

            // this zip is for you, treat it well
            log("log", "Generating zip file");

            // add log data to zip
            zip.file("log.txt", logData);

            zip.generateAsync({
                    type: "blob"
                })
                .then(function(content) {
                    // unblock the UI
                    window.$.unblockUI();

                    // display alert if errors found
                    if (errorGettingDeckData) {
                        alert("Could not download deck data. Please try again.\nYou can also check for errors found in the browser's console \(F12\) or in the log file included in the zip.");
                    } else if (errorsFileDownload) {
                        alert("Some files could not be downloaded. Please check the zip file contents.\nYou can also check for errors found in the browser's console \(F12\) or in the log file included in the zip.");
                    } else if (errorsFound) {
                        alert("Some errors were found during the export process. Please check the browser's console \(F12\) or the log file in the zip.");
                    }

                    // prompt the user to save the file
                    saveAs(content, deckZipName);

                    // refresh the page to free memory resources
                    setTimeout(function() {
                        window.location.reload();
                    }, 2000);
                }).catch(error => {
                    errorsFound = true;
                    // unblock the UI
                    window.$.unblockUI();
                    log("error", "ERROR: getDeck: zip.generateAsync: ", error);
                });
        }).fail(function(jqxhr, textStatus, error) {
            errorGettingDeckData = true;
            var err = textStatus + ", " + error;
            log("error", "ERROR: getDeck: error getting deck data: ", err);
        });
    } catch (error) {
        errorsFound = true;
        log("error", "ERROR: getDeck: ", error);
    }
}

// gets the cards' info
async function getDeckCardsInfo(deckData, deckMainInfo, zip) {
    try {
        if (deckData === undefined) {
            log("error", "ERROR: getDeckCardsInfo: deckData is undefined");
            throw "Parameter undefined";
        }
        if (deckMainInfo === undefined) {
            log("error", "ERROR: getDeckCardsInfo: deckMainInfo is undefined");
            throw "Parameter undefined";
        }
        if (zip === undefined) {
            log("error", "ERROR: getDeckCardsInfo: zip is undefined");
            throw "Parameter undefined";
        }

        log("log", "Getting deck cards info");

        // for the csv
        var cardsInfoCsv = "";

        // go through the cards and get the info from the cards
        var cards = deckData.cards;
        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            log("log", "card number: ", i);

            // lines with card info for the csv
            var cardFrontImageCsv = "";
            var cardFrontTextCsv = "";
            var cardBackImageCsv = "";
            var cardBackTextCsv = "";

            // each card has (at least?) two sides
            var sides = card.sides;
            log("log", "sides length: ", sides.length);
            for (var j = 0; j < sides.length; j++) {
                var side = sides[j];
                log("log", "side: ", side);

                // indexes for filenames
                var cardIndex = Number(i + 1);
                var cardDigitsLength = cards.length.toString().length;

                // get the image for the card side
                var cardSideImageFilenameCsv = "cardsUI/card" + "_" + zerofy(cardIndex, cardDigitsLength) + "_" + (j ? "back" : "front") + ".png";
                if (j) {
                    cardBackImageCsv = cardSideImageFilenameCsv;
                } else {
                    cardFrontImageCsv = cardSideImageFilenameCsv;
                }

                // each card side can have concepts
                var conceptsCsv = "";
                for (var k = 0; k < side.concepts.length; k++) {
                    var concept = side.concepts[k];
                    log("log", "side: ", side);

                    // and each concept can have facts that can be text or image
                    var fact = concept.fact;
                    log("log", "fact: ", fact);

                    // indexes for filenames
                    var sideIndex = Number(j + 1);
                    var sideDigitsLength = sides.length.toString().length;
                    var conceptIndex = Number(k + 1);
                    var conceptDigitsLength = side.concepts.length.toString().length;

                    var factFileName = "";
                    if (fact.type == 'IMAGE') {
                        // build card side
                        factFileName = "card_" + zerofy(cardIndex, cardDigitsLength) + "_side_" + zerofy(sideIndex, sideDigitsLength) + "_concept_" + zerofy(conceptIndex, conceptDigitsLength) + ".jpg";
                        log("log", "found image side at url: ", fact.imageUrl);

                        // add the image card to the zip
                        zip.file("cards/" + factFileName, fact.imageUrl.startsWith("data:") ? fact.imageUrl.replace(/^[^,]+,/, "") : getBinaryFile(fact.imageUrl), fact.imageUrl.startsWith("data:") ? {
                            base64: true
                        } : {
                            binary: true
                        });

                    } else if (fact.type == 'TEXT') {
                        factFileName = "card_" + zerofy(cardIndex, cardDigitsLength) + "_side_" + zerofy(sideIndex, sideDigitsLength) + "_concept_" + zerofy(conceptIndex, conceptDigitsLength) + ".txt";
                        log("log", "found text side: ", fact.text);

                        // add fact text to csv line
                        conceptsCsv = conceptsCsv.concat(k ? " / " : "").concat(fact.text);

                        // add the text card to the zip
                        zip.file("cards/" + factFileName, fact.text);

                        // since it's text, check if it has TTS file associated
                        if (typeof fact.ttsUrl !== "undefined") {
                            factFileName = "card_" + zerofy(cardIndex, cardDigitsLength) + "_side_" + zerofy(sideIndex, sideDigitsLength) + "_concept_" + zerofy(conceptIndex, conceptDigitsLength) + ".mp3";
                            log("log", "found tts: ", fact.ttsUrl);

                            // add the TTS file to the zip
                            zip.file("cards/" + factFileName, fact.ttsUrl.startsWith("data:") ? fact.ttsUrl.replace(/^[^,]+,/, "") : getBinaryFile(fact.ttsUrl), fact.ttsUrl.startsWith("data:") ? {
                                base64: true
                            } : {
                                binary: true
                            });
                        }
                    } else {
                        log("error", "ERROR: getDeckCardsInfo: Unexpected concept type: " + fact.type, fact);
                    }

                    // and each concept can have note facts; not yet seen populated but it's present in the structure
                    var noteFacts = concept.noteFacts;
                    for (var l = 0; l < noteFacts.length; l++) {
                        var noteFact = noteFacts[l];

                        // indexes for filenames
                        var noteFactIndex = Number(l + 1);
                        var noteFactDigitsLength = noteFacts.length.toString().length;

                        // add the note fact to the zip
                        var noteFactFileName = "card_" + zerofy(cardIndex, cardDigitsLength) + "_side_" + zerofy(sideIndex, sideDigitsLength) + "_concept_" + zerofy(conceptIndex, conceptDigitsLength) + "_noteFact_" + zerofy(noteFactIndex, noteFactDigitsLength) + ".txt";
                        log("log", "found note fact: ", noteFact);
                        zip.file("cards/" + noteFactFileName, noteFact);

                    }
                }
                // get the text for the card side
                if (j) {
                    cardBackTextCsv = conceptsCsv;
                } else {
                    cardFrontTextCsv = conceptsCsv;
                }

            }
            // the relevant info used in the cards csv
            cardsInfoCsv = cardsInfoCsv + "\"" + cardFrontImageCsv + "\",\"" + cardBackImageCsv + "\",\"" + cardFrontTextCsv + "\",\"" + cardBackTextCsv + "\"" + "\n";

        }
        // save deck and cards info to the zip
        zip.file("cardsInfo.csv", deckMainInfo + "\n\"\"\n\"\"\n" + "\"Front Card Image\",\"Front Card Text\",\"Back Card Image\",\"Back Card Text\"\n" + cardsInfoCsv);

        // create an html file with the equivalent info from the csv
        var htmlContent = "<!DOCTYPE html><html><head><meta charset='utf-8'/><style>table, th, td {border: 0px solid gray; border-collapse: collapse;} #cards td {max-width: 300px; min-width: 200px;} #deckInfo {margin-bottom: 10px;} #deckInfo td {padding:0 20px 0 0;} img {box-shadow: 0 8px 16px 0 rgba(0,0,0,0.2); border-radius: 25px 25px 25px 25px}</style></head><body><h1>" + deckMainInfo.split('\n', 1)[0].split(',')[1].replace(/(^")|("$)/g, "") + "</h1><div><table id='deckInfo'>" + deckMainInfo.replace(/^"/gm, "<tr><td>").replace(/"$/gm, "</td></tr>").replace(/","/g, "</td><td>").concat("</table></div>").replace(/(http[^<]+)(?=<)/, "<a href='$1'>$1</a>") + "<div><p><a href='./'>Base folder</a></p></div>\n<div><table id='cards'>" + "\"Front Card Image\",\"Back Card Image\",\"Front Card Text\",\"Back Card Text\"\n".replace(/^"/gm, "<tr><th>").replace(/"$/gm, "</th></tr>").replace(/","/g, "</th><th>") + cardsInfoCsv.replace(/^"/gm, "<tr><td>").replace(/"$/gm, "</td></tr>").replace(/","/g, "</td><td>").replace(/<td>cardsUI\//g, "<td><img src='./cardsUI/").replace(/.png<\/td>/g, ".png'/></td>").replace(/src=\'([^\']+)\'/g, function(a, b) {
            return "alt='" + b.replace(/\.\/cards[^\/]+\/([^\.]+)\.png/g, "$1").replace(/_/g, " ") + "' src='" + b + "'";
        }) + "</table></div></body></html>";

        // save it to the zip file
        zip.file("cardsInfo.html", htmlContent);
        return zip;
    } catch (error) {
        errorsFound = true;
        log("error", "ERROR: getDeckCardsInfo: ", error);
    }

}

// downloads binary files
function getBinaryFile(url) {
    try {
        if (url === undefined) {
            log("error", "ERROR: getBinaryFile: url is undefined");
            throw "Parameter undefined";
        }

        if (url.startsWith("data:")) {
            log("log", "Getting binary file: data url received");
        } else {
            log("log", "Getting binary file: ", url);
        }

        return new Promise(function(resolve, reject) {
            JSZipUtils.getBinaryContent(url, function(error, data) {
                if (error) {
                    reject(error);
                } else {
                    resolve(data);
                }
            });
        }).catch(function(e) {
            errorsFileDownload = true;
            log("error", "ERROR: getBinaryContent: " + e);
            return "ERROR: could not download this file: " + e;
        });
    } catch (error) {
        errorsFound = true;
        log("error", "ERROR: getBinaryFile: ", error);
    }
}

// flips cards
async function flipCards() {
    try {
        log("log", "Flipping cards");

        // each card has class ALWo1
        // and if it's active it has class PemDv
        var sides = document.querySelectorAll(".ALWo1");
        for (let side of sides) {
            if (side.classList.contains("PemDv")) {
                // fronts go to back
                side.style.transform = 'rotateY(180deg)';
                side.classList.remove('PemDv');
            } else {
                // backs go to front
                side.style.transform = 'rotateY(0deg)';
                side.classList.add('PemDv');
            }
            side.removeAttribute('style');
        }

        // hold your horses
        await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
        errorsFound = true;
        log("error", "ERROR: flipCards: ", error);
    }
}

// reloads all images from proxy
function proxifyImages() {
    try {
        log("log", "Proxifying images");

        // select all images in the document
        var images = document.querySelectorAll("img");

        // do it only for images not yet proxified and exclude data urls
        for (let image of images) {
            if (!image.src.startsWith(proxyAddress) && !image.src.startsWith("data:")) {
                image.src = proxyAddress + image.src;
            }
        }
    } catch (error) {
        errorsFound = true;
        log("error", "ERROR: flipCards: ", error);
    }
}

// converts external images to a local representation
function embedImages() {
    try {
        log("log", "Embedding images");

        // converts images to base64
        function convertImgToBase64(url, callback, outputFormat) {
            try {
                if (url === undefined) {
                    log("error", "ERROR: convertImgToBase64: url is undefined");
                    throw "Parameter undefined";
                }
                if (callback === undefined) {
                    log("error", "ERROR: convertImgToBase64: callback is undefined");
                    throw "Parameter undefined";
                }

                var canvas = document.createElement('CANVAS');
                var ctx = canvas.getContext('2d');
                var img = new Image();
                img.crossOrigin = 'Anonymous';
                img.onload = function() {
                    canvas.height = img.height;
                    canvas.width = img.width;
                    ctx.drawImage(img, 0, 0);
                    var dataURL = canvas.toDataURL(outputFormat || 'image/png');
                    callback.call(this, dataURL);
                    canvas = null;
                };
                img.src = url;
            } catch (error) {
                errorsFound = true;
                log("error", "ERROR: convertImgToBase64: ", error);
            }
        }

        // convert each image in the page
        var images = document.querySelectorAll("img");
        for (let image of images) {
            convertImgToBase64(image.src, function(base64Img) {
                image.src = base64Img;
            });
            image.removeAttribute("srcset");
        }
    } catch (error) {
        errorsFound = true;
        log("error", "ERROR: embedImages: ", error);
    }
}

// tests the deck and cards for its photogenicity
async function everyoneSmile(zip) {
    try {
        log("log", "Everyone smile");

        if (zip === undefined) {
            log("error", "ERROR: everyoneSmile: zip is undefined");
            throw "Parameter undefined";
        }

        // the cards, one by one
        zip = await cardsSayCheese(zip, "front");

        // the cards, group photo
        zip = await allTogetherNow(zip, "front");

        // now turn around and one by one again
        await flipCards();
        zip = await cardsSayCheese(zip, "back");

        // the cards, group photo
        zip = await allTogetherNow(zip, "back");

        // put them back as they were initially
        await flipCards();
        return zip;
    } catch (error) {
        log("error", "ERROR: everyoneSmile: ", error);
    }

}

// makes a daguerreotype portrait 
async function convertToPng(element, fullPage, width) {
    try {
        log("log", "Converting to png");

        if (element === undefined) {
            log("error", "ERROR: convertToPng: element is undefined");
            throw "Parameter undefined";
        }
        // complain if fullPage is requested but forgot to send width
        if (fullPage && width === undefined) {
            log("error", "ERROR: convertToPng: width is undefined");
            throw "Parameter undefined";
        }

        // sent in style options in domtoimage below, so they need to be set even if it's not full page
        let originalPosition = element.style.position;
        let originalLeft = element.style.left;

        // if fullPage must check width or deal with missing width
        if (fullPage) {
            element.style.position = 'absolute';
            element.style.left = '-9999px';
            element.style.width = width + 'px';
            // append it to the page
            document.body.appendChild(element);
        }

        // smile
        const dataUrl = await domtoimage.toPng(element, {
            style: {
                position: originalPosition,
                left: originalLeft,
            }
        }).catch(function(error) {
            errorsFound = true;
            log("error", "ERROR: convertToPng: domtoimage: ", error);
        });

        // photo taken, so this element is no longer needed
        if (fullPage) {
            document.body.removeChild(element);
        }

        return dataUrl;
    } catch (error) {
        errorsFound = true;
        log("error", "ERROR: convertToPng: ", error);
    }

}

// tests the cards individually for their photogenicity 
async function cardsSayCheese(zip, side) {
    try {
        log("log", "Cards say cheese");

        if (zip === undefined) {
            log("error", "ERROR: cardsSayCheese: zip is undefined");
            throw "Parameter undefined";
        }
        if (side === undefined) {
            log("error", "ERROR: cardsSayCheese: side is undefined");
            throw "Parameter undefined";
        }

        // card fronts have class PemDv
        var elements = document.querySelectorAll('.PemDv');
        var digitsLength = elements.length.toString().length;
        var index = 0;

        // take a picture for every card active front
        for (let element of elements) {
            index = index + 1;
            updateProgress('Retrieving card\'s ' + side + ' ' + index + '/' + elements.length + '...');
            var data = await convertToPng(element);
            // if element could not be converted to image, skip it
            if (data === undefined) {
                log("error", "ERROR: cardsSayCheese: data returned from convertToPng is undefined");
            } else {
                zip.file("cardsUI/" + "card" + "_" + zerofy(index, digitsLength) + "_" + side + ".png", data.startsWith("data:") ? data.replace(/^[^,]+,/, "") : getBinaryFile(data), data.startsWith("data:") ? {
                    base64: true
                } : {
                    binary: true
                });
            }
        }

        return zip;
    } catch (error) {
        errorsFound = true;
        log("error", "ERROR: cardsSayCheese: ", error);
    }

}

// adds zeroes to the left of a number until it fills a specified length
function zerofy(number, length) {
    try {
        if (number === undefined) {
            log("error", "ERROR: zerofy: number is undefined");
            throw "Parameter undefined";
        }
        if (length === undefined) {
            log("error", "ERROR: zerofy: length is undefined");
            throw "Parameter undefined";
        }

        // cast it
        var zerofied = '' + number;
        // fill it from the left
        while (zerofied.length < length) {
            zerofied = '0' + zerofied;
        }

        return zerofied;
    } catch (error) {
        errorsFound = true;
        log("error", "ERROR: zerofy: ", error);
    }

}

// tests the deck for its photogenicity
async function allTogetherNow(zip, side) {
    try {
        log("log", "All together now");

        if (zip === undefined) {
            log("error", "ERROR: allTogetherNow: zip is undefined");
            throw "Parameter undefined";
        }
        if (side === undefined) {
            log("error", "ERROR: allTogetherNow: side is undefined");
            throw "Parameter undefined";
        }

        // update progress
        updateProgress('Retrieving deck\'s ' + side + '. This may take a while and slow down your browser temporarily. Please wait...');
        await new Promise(resolve => setTimeout(resolve, 100));

        // hide the non-active side of the cards
        var backSides = document.querySelectorAll('.ALWo1:not(.PemDv)');
        for (let backSide of backSides) {
            backSide.style.display = 'none';
        }

        // let's clone the page to be able to remove undesired elements before the screenshot
        var page = document.querySelector('body').cloneNode(true);

        // if the export button is injected in the page, remove it, because it interferes with domtoimage
        var exportButton = page.querySelector('#export');
        if (exportButton != null) exportButton.parentNode.removeChild(exportButton);

        // remove also the blocking overlay from the cloned tree
        var blockDivs = page.querySelectorAll(".blockOverlay, .blockMsg");
        if (blockDivs != null) {
            for (let blockDiv of blockDivs) {
                if (blockDiv != null) blockDiv.parentNode.removeChild(blockDiv);
            }
        }

        // screenshot the page
        await new Promise(resolve => setTimeout(resolve, 100));
        var data = await convertToPng(page, true, document.querySelector('body').clientWidth);
        await new Promise(resolve => setTimeout(resolve, 100));

        // put the non-active side of the cards like they were before
        for (let backSide of backSides) {
            backSide.removeAttribute('style');
        }

        // if element could not be converted to image, skip it
        if (data === undefined) {
            log("error", "ERROR: allTogetherNow: data returned from convertToPng is undefined");
        } else {
            // save it
            zip.file("deck" + side.charAt(0).toUpperCase() + side.slice(1) + ".png", data.startsWith("data:") ? data.replace(/^[^,]+,/, "") : getBinaryFile(data), data.startsWith("data:") ? {
                base64: true
            } : {
                binary: true
            });
        }

        return zip;
    } catch (error) {
        errorsFound = true;
        log("error", "ERROR: allTogetherNow: ", error);
    }

}

// gets a base 64 representation for a linked file
async function getBase64File(url) {
    try {
        log("log", "Getting a base64 representation of: ", url);

        if (url === undefined) {
            log("error", "ERROR: getBase64File: url is undefined");
            throw "Parameter undefined";
        }
        // get it
        const response = await fetch(url);
        const blob = await response.blob();
        const reader = new FileReader();

        // convert it
        await new Promise((resolve, reject) => {
            reader.onload = resolve;
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

        return reader.result;
    } catch (error) {
        errorsFound = true;
        log("error", "ERROR: getBase64File: ", error);
    }
}

// embeds the fonts
async function embedFonts() {
    try {
        log("log", "Embedding fonts");

        var styles = document.querySelectorAll("style[type='text/css']");
        for (let style of styles) {
            // remove all font formats but woff2
            style.textContent = style.textContent.replace(/url\(\/\/[^,]+(woff|truetype|svg)"\),?/g, "");
            style.textContent = style.textContent.replace(/format\("woff2\"\),/g, "format(\"woff2\")");

            // introduce some newlines to reduce impact of long lines
            style.textContent = style.textContent.replace(/@font-face/g, "\n@font-face");

            // let's replace external fonts by data url
            var regex = /url\(\/\/[^)]+\)/g;
            var links = [];
            var link;

            // first get all unique font links
            while ((link = regex.exec(style.textContent)) !== null) {
                link[0] = (link[0]).replace(/\)$/, "").replace(/^url\(/, "");
                links.push(link[0]);
            }
            var linksUniqueAndSorted = [...new Set(links)].sort();

            // and then replace them by their base64 representation
            for (var i = 0; i < linksUniqueAndSorted.length; i++) {
                var element = linksUniqueAndSorted[i];
                var proxifiedElement = "";
                // proxify url
                if (!element.startsWith(proxyAddress)) {
                    proxifiedElement = proxyAddress + "https:" + element;
                }
                var encodedItem = await getBase64File(proxifiedElement);

                // create regex using the element to replace
                var replaceElement = new RegExp(element, "g");
                style.textContent = style.textContent.replace(replaceElement, encodedItem);
            }
        }
    } catch (error) {
        errorsFound = true;
        log("error", "ERROR: embedFonts: ", error);
    }
}

// embeds the style sheets
async function embedStyleSheets() {
    try {
        log("log", "Embedding style sheets");

        // gets the external css files
        async function getExternalCSS(url) {
            if (url === undefined) {
                log("error", "ERROR: getExternalCSS: url is undefined");
                throw "Parameter undefined";
            }
            var xhr = new XMLHttpRequest();
            return new Promise(function(resolve, reject) {
                try {
                    xhr.onreadystatechange = function() {
                        if (xhr.readyState == 4) {
                            if (xhr.status >= 300) {
                                reject("ERROR: status code = " + xhr.status);
                            } else {
                                resolve(xhr.responseText);
                            }
                        }
                    };

                    xhr.open('get', url);
                    xhr.send();
                } catch (error) {
                    errorsFound = true;
                    log("error", "ERROR: embedStyleSheets: getExternalCSS: Promise: ", error);
                }
            });
        }

        // for each css link move content to a style tag in head
        var styleSheets = document.querySelectorAll("LINK[href*='.css']");
        for (let styleSheet of styleSheets) {
            var cssUrl = styleSheet.href;

            // get the external stylesheet but don't process styles injected from extensions (well, from firefox in this case)
            if (!cssUrl.startsWith("moz-extension")) {
                // proxify css url
                if (!cssUrl.startsWith(proxyAddress)) {
                    cssUrl = proxyAddress + cssUrl;
                }

                await getExternalCSS(cssUrl)
                    .then(function(result) {
                        if (result === undefined) log("error", "ERROR: getExternalCSS: result is undefined");
                        var head = document.head || document.getElementsByTagName('head')[0];
                        var style = document.createElement('style');
                        style.type = 'text/css';
                        if (style.styleSheet) {
                            style.styleSheet.cssText = result;
                        } else {
                            style.appendChild(document.createTextNode(result));
                        }
                        head.appendChild(style);

                    }, function(error) {
                        log("error", "ERROR: embedStyleSheets: ", error);
                    });

                // remove the css link
                styleSheet.remove();
            }
        }
    } catch (error) {
        errorsFound = true;
        log("error", "ERROR: embedStyleSheets: ", error);
    }
}

// let's go
doIt();
