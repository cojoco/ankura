var app = angular.module('anchorApp', [])
    .controller('anchorController', function($scope, $timeout, $http) {
        var ctrl = this;
        ctrl.loading = true;
        //This holds all of the anchor objects.
        //  An anchor object holds both anchor words for a single anchor
        //  and topic words that describe that anchor.
        ctrl.anchorObjects = [];
        ctrl.anchors = [];
        ctrl.anchorsHistory = [];
        ctrl.historyIndex = 0;
        ctrl.undo = function() {
            if (ctrl.historyIndex > 0) {
                ctrl.anchorObjects = getAnchorsArray(ctrl.anchorsHistory[ctrl.historyIndex-1]["anchors"],
                                ctrl.anchorsHistory[ctrl.historyIndex-1]["topics"]);
                ctrl.historyIndex -= 1;
            }
            else {
                $("#undoForm").popover({
                    placement:'top',
                    trigger:'manual',
                    html:true,
                    content:'Nothing to undo.'
                }).popover('show');
                $timeout(function() {
                    $("#undoForm").popover('hide');
                }, 1000);
            }
        }
        ctrl.redo = function() {
            if (ctrl.historyIndex+1 < ctrl.anchorsHistory.length) {
                ctrl.anchorObjects = getAnchorsArray(ctrl.anchorsHistory[ctrl.historyIndex+1]["anchors"],
                                ctrl.anchorsHistory[ctrl.historyIndex+1]["topics"]);
                ctrl.historyIndex += 1;
            }
            else {
                $("#redoForm").popover({
                    placement:'top',
                    trigger:'manual',
                    html:true,
                    content:'Nothing to redo.'
                }).popover('show');
                $timeout(function() {
                    $("#redoForm").popover('hide');
                }, 1000);
            }
        }
        ctrl.finished = false;
        ctrl.done = function() {
            var data = JSON.stringify(ctrl.anchorsHistory);
            $http.post("/finished", data).success(function(data, status) {
                ctrl.finished = true;
            });
        }
        ctrl.vocab;
        ctrl.cooccurrences;
        $.get("/vocab", function(data) {
            ctrl.vocab = data.vocab;
        });
        $.get("/cooccurrences", function(data) {
            ctrl.cooccurrences = data.cooccurrences;
            ctrl.loading = false;
        })
        ctrl.addAnchor = function() {
            var anchorObj = {"anchors":[], "topic":[]};
            ctrl.anchorObjects.push(anchorObj);
            initAutocomplete();
        }
         //This function simply removes an anchor from the current
         //  list of anchors. In essence, it deletes a whole line,
         //  both anchor words and their topic words.
        ctrl.removeAnchor = function(index) {
            ctrl.anchorObjects.splice(index, 1);
        }
        //This function adds an anchor word when entered in via the input
        //  in the anchor's left column
        ctrl.addAnchorWord = function(textForm, newAnchor) {
            //Needed to make autofill and Angular work well together
            $scope.$broadcast("autofillfix:update");
            var lowercaseAnchor = textForm.target.children[0]
                                        .value.toLowerCase();
            //We are checking to see if the new anchor word is in the vocab.
            //  If it is, we add a new anchor and prompt to update topics.
            //  If it is not, we prompt to add a valid anchor.
            var inVocab = false;
            for (var i = 0; i < ctrl.vocab.length; i++) {
                if (ctrl.vocab[i] === lowercaseAnchor) inVocab = true;
             }
            if (inVocab) {
                newAnchor.push(lowercaseAnchor);
                //This timeout ensures that the added anchor is put in
                //  before the popover appears. If removed, the popover
                //  will appear too high above the "Update Topics" button.
                $timeout(function() {
                    $(".updateTopicsButtonClean").popover({
                        placement:'top',
                        trigger:'manual',
                        html:true,
                        content:'To see topic words for new anchors, press "Update Topics" here.'
                    }).popover('show')
                        .addClass("updateTopicsButtonDirty")
                        .removeClass("updateTopicsButtonClean");
                    //This timeout indicates how long the popover above
                    //  will stay visible for.
                    $timeout(function() {
                        $(".updateTopicsButtonDirty").popover('hide')
                            .addClass("updateTopicsButtonClean")
                            .removeClass("updateTopicsButtonDirty");
                    }, 5000);
                }, 20);
                textForm.target.children[0].value = "";
            }
            else {
                $("#"+textForm.target.id).popover({
                    placement:'bottom',
                    trigger:'manual',
                    html:true,
                    content:'Invalid anchor word.'
                }).popover('show');
                $timeout(function() {
                    $("#"+textForm.target.id).popover('hide');
                }, 2000);
            }
        }

        //This function deletes an anchor word
        //  (when you click on the little 'x' in the bubble)
        ctrl.deleteWord = function(closeButton, array) {
            var toClose = closeButton.target.parentNode.id;
            $("#"+toClose).remove();
            var index = array.indexOf(closeButton.target.parentNode
                .textContent.replace(/✖/, "").replace(/\s/g, ''));
            if (index !== -1) {
                array.splice(index, 1);
            }
        }
        //This function only gets the topics when we have no current anchors.
        ctrl.getBaseTopics = function() {
            $.get("/base-anchors", function(data) {
                //Ensure we can't redo something that's been written over
                ctrl.anchorsHistory.splice(ctrl.historyIndex, ctrl.anchorsHistory.length-ctrl.historyIndex-1);
                //Save the data
                ctrl.anchorsHistory.push(data);
                ctrl.anchors = data["anchors"];
                $scope.$apply();
            });
        }
        //We actually call the above function here,
        //  so we get the original topics
        ctrl.getBaseTopics();
        //This function takes all anchors from the left column
        //  and gets their new topic words.
        //  It then repaints the page to include the new topic words.
        ctrl.getNewTopics = function() {
            var currentAnchors = [];
            //The server throws an error if there are no anchors,
            //  so we want to get new anchors if needed.
            if ($(".anchorContainer").length !== 0) {
                $(".anchorContainer").each(function() {
                    var value = $(this).html()
                        .replace(/\s/g, '')
                        .replace(/<span[^>]*>/g, '')
                        .replace(/<\/span><\/span>/g, ',');
                    value = value
                        .replace(/<!--[^>]*>/g, '')
                        .replace(/,$/, '')
                        .replace(/,$/, '')
                        .replace(/\u2716/g, '');
                    if (value === "") {
                        return true;
                    }
                    var tempArray = value.split(",");
                    currentAnchors.push(tempArray);
                });
                if (currentAnchors.length !== 0) {
                    var getParams = JSON.stringify(currentAnchors);
                    ctrl.loading = true;
                    $.get("/topics", {anchors: getParams}, function(data) {
                        var saveState = {anchors: currentAnchors,
                                   topics: data["topics"]};
                        //This gets rid of the possibility of redoing if
                        //  another state was saved since the last undo.
                        //  If nothing has been undone, this should do nothing.
                        ctrl.anchorsHistory.splice(ctrl.historyIndex+1, ctrl.anchorsHistory.length-ctrl.historyIndex-1);
                        //Increment historyIndex
                        ctrl.historyIndex += 1;
                        //Save the current state (anchors and topic words)
                        ctrl.anchorsHistory.push(saveState);
                        //Update the anchors in the UI
                        ctrl.anchorObjects = getAnchorsArray(currentAnchors,
                                                data["topics"], ctrl.vocab);
                        ctrl.loading = false;
                        $scope.$apply();
                    });
                }
                else {
                    ctrl.getBaseTopics();
                }
            }
            //This gets new anchors if we need them.
            else {
                ctrl.getBaseTopics();
            }
            initAutocomplete();
        }
        // Performs a topic request using current anchors
        // cooccMatrix is the cooccurrences matrix, vocab is the vocabulary
        ctrl.topicRequest = function(cooccMatrix, anchors, vocab) {
            recoverTopics(cooccMatrix, anchors, vocab);
        }
        //This initializes autocompletion for entering new anchor words
        var initAutocomplete = function() {
            $(".anchorInput" ).autocomplete({
                minLength: 3,
                source: ctrl.vocab
            });
        };
        $timeout(function() {initAutocomplete();}, 500);
        $timeout(function() {ctrl.topicRequest(ctrl.cooccurrences,
                                    ctrl.anchors, ctrl.vocab);}, 10000);
    }).directive("autofillfix", function() {
        //This is required because of some problem between Angular and autofill
        return {
            require: "ngModel",
            link: function(scope, element, attrs, ngModel) {
                scope.$on("autofillfix:update", function() {
                    ngModel.$setViewValue(element.val());
                });
            }
        }
    });

//This function returns an array of anchor objects from arrays
//  of anchors and topics. Anchor objects hold both anchor words
//  and topic words related to the anchor words.
var getAnchorsArray = function(anchorObjects, topics) {
    var tempAnchors = [];
    for (var i = 0; i < anchorObjects.length; i++) {
        anchor = anchorObjects[i];
        var topic = topics[i];
        tempAnchors.push({"anchors":anchor, "topic":topic});
    }
    return tempAnchors;
};


//All functions below here enable dragging and dropping
//They could possibly be in another file and included?

var allowDrop = function(ev) {
    ev.preventDefault();
};

var drag = function(ev) {
    ev.dataTransfer.setData("text", ev.target.id);
};

//Holds next id for when we copy nodes
var copyId = 0;

var drop = function(ev) {
    ev.preventDefault();
    var data = ev.dataTransfer.getData("text");
    var dataString = JSON.stringify(data);
    //If an anchor or a copy of a topic word, drop
    if (dataString.indexOf("anchor") !== -1 ||
        dataString.indexOf("copy") !== -1) {
        //Need to cover all the possible places in the main div
        //  that it could be dropped.
        if($(ev.target).hasClass( "droppable" )) {
            ev.target.appendChild(document.getElementById(data));
        }
        else if($(ev.target).hasClass( "draggable" )) {
            $(ev.target).parent()[0]
                .appendChild(document.getElementById(data));
        }
        else if($(ev.target).hasClass( "anchorInputContainer" )) {
            $(ev.target).siblings(".anchorContainer")[0]
                .appendChild(document.getElementById(data));
        }
        else if ($(ev.target).hasClass( "anchorInput" )) {
            $(ev.target).parent().parent().siblings(".anchorContainer")[0]
                .appendChild(document.getElementById(data));
        }
        else if ($(ev.target).hasClass( "anchor" )) {
            $(ev.target).children(".anchorContainer")[0]
                .appendChild(document.getElementById(data));
        }
    }
    //If a topic word, copy it
    else {
        var nodeCopy = document.getElementById(data).cloneNode(true);
        nodeCopy.id = data + "copy" + copyId++;
        var closeButton = addDeleteButton(nodeCopy.id + "close");
        nodeCopy.appendChild(closeButton);
        //Need to cover all the possible places in the main div
        //  that it could be dropped.
        if($(ev.target).hasClass( "droppable" )) {
            ev.target.appendChild(nodeCopy);
        }
        else if($(ev.target).hasClass( "draggable" )) {
            $(ev.target).parent()[0].appendChild(nodeCopy);
        }
        else if($(ev.target).hasClass( "anchorInputContainer" )) {
            $(ev.target).siblings(".anchorContainer")[0]
                .appendChild(nodeCopy);
        }
        else if ($(ev.target).hasClass( "anchorInput" )) {
            $(ev.target).parent().parent().siblings(".anchorContainer")[0]
                .appendChild(nodeCopy);
        }
        else if ($(ev.target).hasClass( "anchor" )) {
            $(ev.target).children(".anchorContainer")[0]
                .appendChild(nodeCopy);
        }
    }
};

//used to delete words that are copies because they can't
//  access the function in the Angular scope.
var deleteWord = function(ev) {
    $("#"+ev.target.id).parent()[0].remove();
}

//Adds a delete button (little 'x' on the right side) of an anchor word
var addDeleteButton = function(id) {
    var closeButton = document.createElement("span");
    closeButton.innerHTML = " &#10006"
    var closeClass = document.createAttribute("class");
    closeClass.value = "close";
    closeButton.setAttributeNode(closeClass);
    var closeId = document.createAttribute("id");
    closeId.value = id;
    closeButton.setAttributeNode(closeId);
    var closeClick = document.createAttribute("onclick");
    closeClick.value = "deleteWord(event)";
    closeButton.setAttributeNode(closeClick);
    return closeButton
};
