
//Solves an exponentiated gradient problem with L2 divergence
var exponentiatedGradient = function exponentiatedGradient(Y, X, XX, epsilon) {
    //Generate all the stuff we need for the beginning
    var XY = numeric.dot(X, Y);
    var YY = numeric.dot(Y, Y);

    //These two variables were declared globally
    var _C1 = Math.pow(10, -4);
    var _C2 = 0.75;

    var alpha = [];
    alpha[0] = [];
    for (var i = 0; i < X.length; i++) {
        alpha[0][i] = 1/X.length;
    }
    var oldAlpha = linear.deepCloneMatrix(alpha);
    var logAlpha = numeric.log(alpha);
    var oldLogAlpha = linear.deepCloneMatrix(logAlpha);

    var AXX = numeric.dot(alpha[0], XX);
    var AXY = numeric.dot(alpha[0], XY);
    var AXXA = numeric.dot(AXX, numeric.transpose(alpha));

    var alphaTranspose = numeric.transpose(alpha);

    var grad = numeric.mul(2, numeric.sub(AXX, XY));
    grad = grad[0];
    console.log(grad);
    var oldGrad = linear.deepCloneMatrix(grad);

    newObj = numeric.add(numeric.sub(AXXA, numeric.mul(2, AXY)), YY);

    //Initialize bookkeeping
    var stepsize = 1;
    var decreased = false;
    var convergence = Infinity;

    while (convergence >= epsilon) {
        var oldObj = newObj;
        var oldAlpha = linear.deepCloneMatrix(alpha);
        var oldLogalpha = linear.deepCloneMatrix(logAlpha);
        if (newObj === 0 || stepsize === 0) {
            break;
        }

        //Add the gradient and renormalize in logspace, then exponentiate
        logAlpha = numeric.sub(logAlpha, stepsize * grad);
        logAlpha = numeric.sub(logAlpha, linear.logsumExp(logAlpha));
        alpha = numeric.exp(logAlpha);

        //Precompute quantities needed for adaptive stepsize
        AXX = numeric.dot(alpha, XX);
        AXY = numeric.dot(alpha, XY);
        AXXA = numeric.dot(AXX, numeric.transpose(alpha));

        //See if stepsize should decrease
        oldObj = newObj;
        newObj = numeric.add(numeric.sub(AXXA, numeric.mul(2, AXY)), YY);
        if (newObj > (oldObj + (_C1 * stepsize *
                                numeric.dot(grad, numeric.sub(alpha, oldAlpha))))) {
            stepsize = stepsize / 2.0;
            alpha = oldAlpha;
            logAlpha = oldLogAlpha;
            newObj = oldObj;
            decreased = true;
            continue;
        }

        //Compute the new gradient
        oldGrad = grad;
        grad = numeric.mul(2, numeric.sub(AXX, XY));
        
        //See if stepsize should increase
        if (numeric.dot(grad, numeric.sub(alpha, oldAlpha)) <
            (_C2 * numeric.dot(oldGrad, numeric.sub(alpha, oldAlpha))) &&
            !decreased) {
            stepsize *= 2.0;
            alpha = oldAlpha;
            logAlpha = oldLogAlpha;
            grad = oldGrad;
            newObj = oldObj;
            continue;
        }

        //Update bookkeeping
        decreased = false;
        convergence = numeric.dot(alpha, numeric.sub(grad, linear.matrixMin(grad)));
    }
    return alpha;
}

//Recovers topics given a set of anchors (as words) and a cooccurrences matrix
var recoverTopics = function recoverTopics(cooccMatrix, anchors, vocab) {
    //We don't want to modify the original cooccurrences matrix
    var Q = linear.deepCloneMatrix(cooccMatrix);

    var V = cooccMatrix.length;
    var K = anchors.length;
    var A = linear.matrixZeroes(V, K);

    //Create a diagonal matrix, where the ith entry of the ith row in
    //  P_w is the sum of the row in Q.
    var P_w = numeric.diag(linear.sumMatrixRows(Q));
    //This check was in the Python code, not sure why.
    for (var i = 0; i < P_w.length; i++) {
        if (isNaN(P_w[i][i])) {
            //Put in a really small number to avoid division by zero?
            P_w[i][i] = Math.pow(10, -16);
        }
    }
    //Normalize the rows of Q to get Q_prime
    Q = linear.normalizeMatrixRows(Q);

    //Compute normalized anchors X, and precompute X * X.T
    anchors = linear.anchorVectors(cooccMatrix, anchors, vocab);
    var X = linear.computeX(anchors);
    var X_T = linear.deepCloneMatrix(X);
    X_T = numeric.transpose(X_T);
    var XX = numeric.dot(X, X_T);

    //Do exponentiated gradient descent
    var epsilon = Math.pow(10, -7);
    for (var i = 0; i < 1; i++) {
        //Y = cooccMatrix[i];
        var alpha = exponentiatedGradient(cooccMatrix[i],
                                                    X, XX, epsilon);

        //if numpy.isnan(alpha).any() appears to check if anything in
        // alpha is NaN, and converts alpha to a matrix of ones if so.
        // This is in ankura/topic.py, line 115
        //I am basically rewriting the recover_topics function right now
        //Overall, I am trying to translate what happens starting at line 79
        // in server.py
    }
}
