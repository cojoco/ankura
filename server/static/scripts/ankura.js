var ankura = (typeof exports === "undefined")?(function ankura() {}):(exports);
if(typeof global !== "undefined") { global.ankura = ankura; }

//Solves an exponentiated gradient problem with L2 divergence
ankura.exponentiatedGradient = function exponentiatedGradient(Y, X, XX, epsilon) {
  //Generate all the stuff we need for the beginning
  var XY = numeric.dot(X, Y)
  var YY = numeric.dot(Y, Y)

  //These two variables were declared globally
  var _C1 = Math.pow(10, -4)
  var _C2 = 0.75

  var alpha = []
  for (var i = 0; i < X.length; i++) {
    alpha[i] = 1/X.length
  }
  var oldAlpha = linear.deepCloneMatrix(alpha)
  var logAlpha = numeric.log(alpha)
  var oldLogAlpha = linear.deepCloneMatrix(logAlpha)

  var AXX = numeric.dot(alpha, XX)
  var AXY = numeric.dot(alpha, XY)
  //numeric.transpose is expecting a 2D array
  var alphaNested = []
  alphaNested[0] = alpha
  var AXXA = numeric.dot(AXX, numeric.transpose(alphaNested))

  var alphaTranspose = numeric.transpose(alphaNested)

  var grad = numeric.mul(2, numeric.sub(AXX, XY))
  var oldGrad = linear.deepCloneMatrix(grad)

  var newObj = numeric.add(numeric.sub(AXXA, numeric.mul(2, AXY)), YY)

  //Initialize bookkeeping
  var stepsize = 1
  var decreased = false
  var convergence = Infinity

  while (convergence >= epsilon) {
    var oldObj = newObj
    oldAlpha = linear.deepCloneMatrix(alpha)
    oldLogAlpha = linear.deepCloneMatrix(logAlpha)
    if (newObj === 0 || stepsize === 0) {
      break
    }

    //Add the gradient and renormalize in logspace, then exponentiate
    //  (This was the comment in the Python, doesn't look like what is coded)
    logAlpha = numeric.sub(logAlpha, numeric.mul(stepsize, grad))
    logAlpha = numeric.sub(logAlpha, linear.logsumExp(logAlpha))
    alpha = numeric.exp(logAlpha)

    //Precompute quantities needed for adaptive stepsize
    AXX = numeric.dot(alpha, XX)
    AXY = numeric.dot(alpha, XY)
    alphaNested = []
    alphaNested[0] = alpha
    AXXA = numeric.dot(AXX, numeric.transpose(alphaNested))

    //See if stepsize should decrease
    oldObj = newObj
    newObj = AXXA - 2 * AXY + YY
    var compareValue = (_C1 * stepsize * numeric.dot(grad, numeric.sub(alpha, oldAlpha)))
    if (newObj > (oldObj + (_C1 * stepsize *
                            numeric.dot(grad, numeric.sub(alpha, oldAlpha))))) {
      stepsize = stepsize / 2.0
      alpha = oldAlpha
      logAlpha = oldLogAlpha
      newObj = oldObj
      decreased = true
      continue
    }

    //Compute the new gradient
    oldGrad = grad
    grad = numeric.mul(2, numeric.sub(AXX, XY))
    //See if stepsize should increase
    if (numeric.dot(grad, numeric.sub(alpha, oldAlpha)) <
        (_C2 * numeric.dot(oldGrad, numeric.sub(alpha, oldAlpha))) &&
        !decreased) {
      stepsize *= 2.0
      alpha = oldAlpha
      logAlpha = oldLogAlpha
      grad = oldGrad
      newObj = oldObj
      continue
    }

    //Update bookkeeping
    decreased = false
    convergence = numeric.dot(alpha, numeric.sub(grad, linear.matrixMin(grad)))

  }
  return alpha
}

//Recovers topics given a set of anchors (as words) and a cooccurrences matrix
ankura.recoverTopics = function recoverTopics(cooccMatrix, anchors, vocab) {
  //We don't want to modify the original cooccurrences matrix
  var Q = linear.deepCloneMatrix(cooccMatrix)

  var V = cooccMatrix.length
  var K = anchors.length
  var A = linear.matrixZeroes(V, K)

  //Create a diagonal matrix, where the ith entry of the ith row in
  //  P_w is the sum of the row in Q.
  var P_w = numeric.diag(linear.sumMatrixRows(Q))
  //This check was in the Python code, not sure why.
  for (var i = 0; i < P_w.length; i++) {
    if (isNaN(P_w[i][i])) {
      //Put in a really small number to avoid division by zero?
      P_w[i][i] = Math.pow(10, -16)
    }
  }
  //Normalize the rows of Q to get Q_prime
  Q = linear.normalizeMatrixRows(Q)

  //Compute normalized anchors X, and precompute X * X.T
  anchors = linear.anchorVectors(cooccMatrix, anchors, vocab)
  var X = linear.computeX(anchors)
  var X_T = linear.deepCloneMatrix(X)
  X_T = numeric.transpose(X_T)
  var XX = numeric.dot(X, X_T)

  //Do exponentiated gradient descent
  var epsilon = 2 * Math.pow(10, -7)
  for (var i = 0; i < V; i++) {
    var alpha = ankura.exponentiatedGradient(Q[i],
                                             X,
                                             XX,
                                             epsilon)
    if (linear.hasNaN(alpha)) {
      var ones = linear.matrixOnes(1, alpha.length)
      alpha = numeric.div(ones, numeric.sum(ones))
    }
    A[i] = alpha
  }
  A = linear.matrixMultiply(P_w, A)
  for (var j = 0; j < K; j++) {
    colSum = linear.sumCol(j, A)
    for (var i = 0; i < A.length; i++) {
      A[i][j] = A[i][j] / colSum
    }
  }
  return A
}

//Returns a list of the indices of the top n tokens per topic
ankura.topicSummaryIndices = function topicSummaryIndices(topics, vocab, n) {
  var indices = []
  for (var k = 0; k < topics[0].length; k++) {
    var index = []
    //Get topics[:, k] if this was Python
    var words = []
    for (var topicIterator = 0; topicIterator < topics.length; topicIterator++) {
      words.push(topics[topicIterator][k])
    }
    //numpy.argsort(topics[:, k]) if this was Python
    var topWordsIndices = ankura.argSort(words)
    //numpy.argsort(topics[:, k])[-n:][::-1] if this was Python
    //This gives the indices of the n highest values in words, largest to smallest
    for (var i = topWordsIndices.length-1; i > topWordsIndices.length - 1 - n; i--) {
      index.push(topWordsIndices[i])
    }
    indices.push(index)
  }
  return indices
}

//Returns a list of top n tokens per topic
ankura.topicSummaryTokens = function topicSummaryTokens(topics, vocab, n) {
  var summaries = []
  var indices = ankura.topicSummaryIndices(topics, vocab, n)
  for (var i = 0; i < indices.length; i++) {
    var summary = []
    for (var j = 0; j < indices[i].length; j++) {
      summary.push(vocab[indices[i][j]])
    }
    summaries.push(summary)
  }
  return summaries
}

//Returns the indices of the words array from index of the smallest word to index of the largest word
ankura.argSort = function argSort(words) {
  sortedIndices = []
  sortedIndices[0] = 0
  for (var i = 1; i < words.length; i++) {
    if (words[i] <= words[sortedIndices[0]]) {
      sortedIndices.splice(0, 0, i)
    }
    else if (words[i] > words[sortedIndices[sortedIndices.length-1]]) {
      sortedIndices.push(i)
    }
    else {
      for (var j = 0; j < sortedIndices.length; j++) {
        if (words[i] <= words[sortedIndices[j]]) {
          //splice(index, numThingsToDelete, item)
          sortedIndices.splice(j, 0, i)
          break
        }
      }
    }
  }
  return sortedIndices
}
