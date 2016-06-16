var app = angular.module('anchorApp', [])
  .controller('anchorController', function($scope, $timeout, $http) {

        var ctrl = this


        //This holds all of the anchor objects.
        //  An anchor holds both anchor words for a single anchor and topic words that describe that anchor.
        ctrl.anchors = []

        // This hold previous states, so we can undo/redo
        ctrl.anchorsHistory = []

        // This tells us where we are in anchorsHistory
        ctrl.historyIndex = 0

        // When finished is set to true, it brings us to the "thank you" page
        ctrl.finished = false

        // Vocab holds the vocabulary of valid words
        ctrl.vocab

        // This holds the cooccurrences matrix from the server
        ctrl.coocc = null

        // This holds the original anchors from the server
        ctrl.baseAnchors = null

        // This holds the topic summary for each anchor
        ctrl.topicSummary = null

        // This tells us when we are loading something and need to display the spinner
        ctrl.loading = false



        // This function sends the anchorsHistory array to the server
        //   and send the user to the "thank you" page
        ctrl.done = function() {
          if(window.confirm("Are you sure you are done?")) {
            var data = JSON.stringify(ctrl.anchorsHistory)
            $http.post("/finished", data).success(function(data, status) {
                ctrl.finished = true
            })
          }
        }


        // This function adds a blank anchor to the page
        ctrl.addAnchor = function() {
          var anchorObj = {"anchors":[], "topic":[]}
          ctrl.anchors.push(anchorObj)
          ctrl.stopChanging()
        }


        //This function removes an anchor from the current list of anchors.
        //  it deletes a whole line (both anchor words and their topic words).
        ctrl.removeAnchor = function(index) {
          ctrl.anchors.splice(index, 1)
          ctrl.stopChanging()
        }


        //This function adds an anchor word when entered in via an input in the left column
        ctrl.addAnchorWord = function(textForm, newAnchor) {

          $scope.$broadcast("autofillfix:update") //Needed to make autofill and Angular work well together

          var lowercaseAnchor = textForm.target.children[0].value.toLowerCase()

          //We are checking to see if the new anchor word is in the vocabulary.
          //  If it is, we add a new anchor and prompt to update topics.
          //  If it is not, we prompt to add a valid anchor.

          var inVocab = false

          for (var i = 0; i < ctrl.vocab.length; i++) {
            if (ctrl.vocab[i] === lowercaseAnchor) inVocab = true
          }

          if (inVocab) {
            newAnchor.push(lowercaseAnchor)
            //This timeout ensures that the added anchor is put in before the popover appears.
            //  If removed, the popover will appear too high above the "Update Topics" button.
            $timeout(function() {
              $(".updateTopicsButtonClean").popover({
                placement:'top',
                trigger:'manual',
                html:true,
                content:'To see topic words for new anchors, press "Update Topics" here.'
              }).popover('show')
                .addClass("updateTopicsButtonDirty")
                .removeClass("updateTopicsButtonClean")
              //This timeout indicates how long the popover above will stay visible for.
              $timeout(function() {
                $(".updateTopicsButtonDirty").popover('hide')
                  .addClass("updateTopicsButtonClean")
                  .removeClass("updateTopicsButtonDirty")
              }, 5000)
            }, 20)
            textForm.target.children[0].value = ""
            ctrl.stopChanging()
          }

          else {
            angular.element(textForm.target).popover({
              placement:'bottom',
              trigger:'manual',
              html:true,
              content:'Invalid anchor word.'
            }).popover('show')
            $timeout(function() {
              angular.element(textForm.target).popover('hide')
            }, 2000)
          }
        }


        //This function deletes an anchor word (when you click on the little 'x' in the bubble)
        ctrl.deleteWord = function(closeButton, array) {
          var toClose = closeButton.target.parentNode.id
          $("#"+toClose).remove()
          var wordIndex = array.indexOf(closeButton.target.parentNode.textContent.replace(/✖/, "").replace(/\s/g, ''))
          if (wordIndex !== -1) {
            array.splice(wordIndex, 1)
          }
          ctrl.stopChanging()
        }


        //Tells us whether we are in single-anchor mode or not
        ctrl.singleAnchors = false


        //Creates a popup if the user tries to submit multi-word anchors
        //  when in single-anchor mode
        ctrl.singleAnchorPopup = function singleAnchorPopup() {
          $("#updateForm").popover({
              placement:'top',
              trigger:'manual',
              html:true,
              content:'Only one anchor word is allowed on each line.<br>Please remove any extra anchor words.'
            }).popover('show')
            $timeout(function() {
              $("#updateForm").popover('hide')
            }, 2000)
        }


        //Gets what the title should be
        ctrl.title = function title() {
          if (ctrl.singleAnchors) {return "Ankura ITM (Single-Word Anchors)"}
          else {return "Ankura ITM"}
        }


        //This function only gets the topics when we have no current anchors.
        ctrl.getTopics = function(getNewExampleDoc) {
          ctrl.loading = true

          //n is the number of words to have in each topic summary
          var n = 10
          var topics = ankura.recoverTopics(ctrl.coocc,
                                        ctrl.baseAnchors,
                                        ctrl.vocab)
          ctrl.topicSummary = ankura.topicSummaryTokens(topics, ctrl.vocab, n)
          //Save the data
          ctrl.anchors = getAnchorsArray(ctrl.baseAnchors, ctrl.topicSummary)
          ctrl.loading = false
          ctrl.startChanging()
          $scope.$apply()
        }


        //This function gets the data from the server
        ctrl.getServerData = function getServerData() {
          ctrl.loading = true
          $.get("/vocab", {}, function(data) {
            ctrl.vocab = data["vocab"]
          })
          $.get("/coocc", {}, function(data) {
            ctrl.coocc = data["coocc"]
            ctrl.baseAnchors = data["anchor_tokens"]
            ctrl.singleAnchors = data["single_anchors"]
            ctrl.getTopics(true)
          })
        }


        // Get data from the server
        ctrl.getServerData()


        //This function takes all anchors from the left column and gets their new topic words.
        //  It then updates the page to include the new topic words.
        //  getNewExampleDoc should be a bool
        ctrl.getNewTopics = function(getNewExampleDoc) {

          ctrl.loading = true
          // Set to false if we are in singleAnchors mode and don't have
          //   only single anchors.
          var onlySingleAnchors = true
          var currentAnchors = []
          //The server used to throw an error if there were no anchors,
          //  so we want to get the base anchors if needed.
          if ($(".anchorContainer").length !== 0) {
            //If needed, this checks if the anchors all only have 1 word
            if (ctrl.singleAnchors) {
              $(".anchorContainer").each(function() {
                var value = $(this).html().replace(/\s/g, '').replace(/<span[^>]*>/g, '').replace(/<\/span><\/span>/g, ',')
                value = value.replace(/<!--[^>]*>/g, '').replace(/,$/, '').replace(/,$/, '').replace(/\u2716/g, '')
                //This prevents errors on the server if there are '<' or '>' symbols in the anchors
                value = value.replace(/\&lt;/g, '<').replace(/\&gt;/g, '>')
                if (value === "") {
                  return true
                }
                var tempArray = value.split(",")
                if (tempArray.length !== 1) {
                  ctrl.singleAnchorPopup()
                  onlySingleAnchors = false
                  ctrl.loading = false
                  return false
                }
              })
            }
            if (!onlySingleAnchors) {return false}
            $(".anchorContainer").each(function() {
              //This parses out just the comma-separated anchors from all the html
              var value = $(this).html().replace(/\s/g, '').replace(/<span[^>]*>/g, '').replace(/<\/span><\/span>/g, ',')
              value = value.replace(/<!--[^>]*>/g, '').replace(/,$/, '').replace(/,$/, '').replace(/\u2716/g, '')
              //This prevents errors on the server if there are '<' or '>' symbols in the anchors
              value = value.replace(/\&lt;/g, '<').replace(/\&gt;/g, '>')
              if (value === "") {
                  return true
              }
              var tempArray = value.split(",")
              currentAnchors.push(tempArray)
            })

            if (currentAnchors.length !== 0) {
              var saveState = {anchors: currentAnchors,
                               topics: ctrl.topicSummary}
              //This gets rid of the possibility of redoing if another state was saved since the last undo. If nothing has been undone, this should do nothing.
              ctrl.anchorsHistory.splice(ctrl.historyIndex+1, ctrl.anchorsHistory.length-ctrl.historyIndex-1)
              //Increment historyIndex
              ctrl.historyIndex += 1
              //Save the current state (anchors and topic words)
              ctrl.anchorsHistory.push(saveState)
              //Update the anchors in the model
              $timeout(function() {
                var n = 10
                var topics = ankura.recoverTopics(ctrl.coocc,
                                                  currentAnchors,
                                                  ctrl.vocab)
                ctrl.topicSummary = ankura.topicSummaryTokens(topics, ctrl.vocab, n)
                //Update the anchors in the view
                ctrl.anchors = getAnchorsArray(currentAnchors, ctrl.topicSummary)
                ctrl.loading = false
                ctrl.startChanging()
              }, 50)
            }

            else {
              ctrl.getTopics(getNewExampleDoc)
            }
          }

          //This gets new anchors if we need them.
          else {
            ctrl.getTopics(getNewExampleDoc)
          }

        }


        // Called when an anchor word is added, moved or deleted, since the
        //   topics no longer reflect the current anchor words
        ctrl.stopChanging = function stopChanging() {
          ctrl.noChangesYet = false
        }


        // Called when an update or undo/redo occurs, since the topics
        //   now reflect the current anchor words
        ctrl.startChanging = function startChanging() {
          ctrl.noChangesYet = true
        }


    }).directive("autofillfix", function() {
      //This is required because of some problem between Angular and autofill
      return {
        require: "ngModel",
        link: function(scope, element, attrs, ngModel) {
          scope.$on("autofillfix:update", function() {
            ngModel.$setViewValue(element.val())
          })
        }
      }
    })

app.directive("autocomplete", function() {
  return {
    restrict: 'A',
    link: function(scope, elem, attr, ctrl) {
      elem.autocomplete({
        source: scope.ctrl.vocab,
        minLength: 2,
        // This function is called whenever a list choice is selected
        select: function(event, ui) {
          // This sets a listener to prevent the page from reloading
          $(this).parents("form").on('submit', function() {
            return false
          })
          // This moves the selected value into the input before the
          //   input is submitted
          $(this).val(ui.item.value)
          // This triggers the submit event, which turns the selected
          //   word into a proper anchor word (with the border)
          $(this).parents("form").submit()
          // This prevents the value from being duplicated
          return false
        }
      }).keypress(function(e) {
        // This closes the menu when the enter key is pressed
        if (!e) e = window.event
        if (e.keyCode == '13') {
          $(".anchorInput" ).autocomplete('close')
          // This sets a listener to prevent the page from reloading
          $(this).parents("form").on('submit', function() {
            return false
          })
          // This triggers the submit event, which turns the selected
          //   word into a proper anchor word (with the border)
          $(this).parents("form").submit()
          return false
        }
      })
    }
  }
})


//This function returns an array of anchor objects from arrays of anchors and topics.
//Anchor objects hold both anchor words and topic words related to the anchor words.
var getAnchorsArray = function(anchors, topics) {
  var tempAnchors = []
  for (var i = 0; i < anchors.length; i++) {
    anchor = anchors[i]
    topic = topics[i]
    tempAnchors.push({"anchors":anchor, "topic":topic})
  }
  return tempAnchors
}


//All functions below here enable dragging and dropping
//They could possibly be in another file and included?


var allowDrop = function(ev) {
  ev.preventDefault()
}


var drag = function(ev) {
  ev.dataTransfer.setData("text", ev.target.id)
}


//Holds next id for when we copy nodes
var copyId = 0


var drop = function(ev) {
  ev.preventDefault()
  var data = ev.dataTransfer.getData("text")
  var dataString = JSON.stringify(data)
  //If an anchor or a copy of a topic word, drop
  if (dataString.indexOf("anchor") !== -1 || dataString.indexOf("copy") !== -1) {
    //Need to cover all the possible places in the main div it could be dropped
    if($(ev.target).hasClass( "droppable" )) {
      ev.target.appendChild(document.getElementById(data))
    }
    else if($(ev.target).hasClass( "draggable" )) {
      $(ev.target).parent()[0].appendChild(document.getElementById(data))
    }
    else if($(ev.target).hasClass( "anchorInputContainer" )) {
      $(ev.target).siblings(".anchorContainer")[0].appendChild(document.getElementById(data))
    }
    else if ($(ev.target).hasClass( "anchorInput" )) {
      $(ev.target).parent().parent().siblings(".anchorContainer")[0].appendChild(document.getElementById(data))
    }
    else if ($(ev.target).hasClass( "anchor" )) {
      $(ev.target).children(".anchorContainer")[0].appendChild(document.getElementById(data))
    }
    var $scope = angular.element('body').scope()
    $scope.$apply(function() {
      $scope.ctrl.stopChanging()
    })
  }
  //If a topic word, copy it
  else {
    var nodeCopy = document.getElementById(data).cloneNode(true)
    nodeCopy.id = data + "copy" + copyId++
    var closeButton = addDeleteButton(nodeCopy.id + "close")
    nodeCopy.appendChild(closeButton)
    //Need to cover all the possible places in the main div it could be dropped
    if($(ev.target).hasClass( "droppable" )) {
      ev.target.appendChild(nodeCopy)
    }
    else if($(ev.target).hasClass( "draggable" )) {
      $(ev.target).parent()[0].appendChild(nodeCopy)
    }
    else if($(ev.target).hasClass( "anchorInputContainer" )) {
      $(ev.target).siblings(".anchorContainer")[0].appendChild(nodeCopy)
    }
    else if ($(ev.target).hasClass( "anchorInput" )) {
      $(ev.target).parent().parent().siblings(".anchorContainer")[0].appendChild(nodeCopy)
    }
    else if ($(ev.target).hasClass( "anchor" )) {
      $(ev.target).children(".anchorContainer")[0].appendChild(nodeCopy)
    }
    var $scope = angular.element('body').scope()
    $scope.$apply(function() {
      $scope.ctrl.stopChanging()
    })
  }
}


//used to delete words that are copies (because they can't access the function in the Angular scope)
var deleteWord = function(ev) {
  $("#"+ev.target.id).parent()[0].remove()
}


//Adds a delete button (little 'x' on the right side) of an anchor word
var addDeleteButton = function(id) {
  var closeButton = document.createElement("span")
  closeButton.innerHTML = " &#10006"
  var closeClass = document.createAttribute("class")
  closeClass.value = "close"
  closeButton.setAttributeNode(closeClass)
  var closeId = document.createAttribute("id")
  closeId.value = id
  closeButton.setAttributeNode(closeId)
  var closeClick = document.createAttribute("onclick")
  closeClick.value = "deleteWord(event)"
  closeButton.setAttributeNode(closeClick)
  return closeButton
}
