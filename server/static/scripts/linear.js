var linear = (typeof exports === "undefined")?(function linear() {}):(exports);
if(typeof global !== "undefined") { global.linear = linear; }

//When the term "matrix" is used, it means an array of arrays.

//Returns an array with the sums of each row of a matrix
linear.sumMatrixRows = function sumMatrixRows(matrix) {
  var sumOfRows = [];
  for (var i = 0; i < matrix.length; i++) {
    var sum = 0;
    for (var j = 0; j < matrix[i].length; j++) {
      sum += matrix[i][j];
    }
    sumOfRows.push(sum);
  }
  return sumOfRows;
}

//Returns an array with the sums of each column of a matrix
linear.sumMatrixCols = function sumMatrixCols(matrix) {
  var sumOfCols = [];
  for (var i = 0; i < matrix[i].length; i++) {
    sumOfCols[i] = 0;
  }
  for (var i = 0; i < matrix.length; i++) {
    for (var j = 0; j < matrix[i].length; j++) {
      sumOfCols[j] += matrix[i][j];
    }
  }
  return sumOfCols;
}

//Creates a matrix of the specified number of rows and columns full of zeroes
linear.matrixZeroes = function matrixZeroes(rows, cols) {
  var arr = [];
  for (var i = 0; i < rows; i++) {
    arr[i] = [];
    for (var j = 0; j < cols; j++) {
      arr[i][j] = 0;
    }
  }
  return arr;
}

//Creates a matrix of the specified number of rows and columns full of ones
linear.matrixOnes = function matrixOnes(rows, cols) {
  var arr = [];
  for (var i = 0; i < rows; i++) {
    arr[i] = [];
    for (var j = 0; j < cols; j++) {
      arr[i][j] = 1;
    }
  }
  return arr;
}

//Creates a deep copy of a matrix
linear.deepCloneMatrix = function deepCloneMatrix(arr) {
  var len = arr.length;
  var newArr = new Array(len);
  for (var i=0; i<len; i++) {
    if (Array.isArray(arr[i])) {
      newArr[i] = deepCloneMatrix(arr[i]);
    }
    else {
      newArr[i] = arr[i];
    }
  }
  return newArr;
}

//Performs matrix multiplication
linear.matrixMultiply = function matrixMultiply(A, B) {
  var result = []
  for (var i = 0; i < A.length; i++) {
    result[i] = []
    for (var j = 0; j < B[0].length; j++) {
      var sum = 0
      for (var k = 0; k < A[0].length; k++) {
        sum += A[i][k] * B[k][j]
      }
      result[i][j] = sum
    }
  }
  return result
}

//Normalizes the rows of the matrix passed into it
linear.normalizeMatrixRows = function normalizeMatrixRows(matrix) {
  var normalizedMatrix = matrix;
  var matrixLength = normalizedMatrix.length;
  for (var i = 0; i < matrixLength; i++) {
    var rowLength = normalizedMatrix[i].length;
    //Need to sum the row first to normalize it correctly.
    var rowSum = 0;
    for (var j = 0; j < rowLength; j++) {
      rowSum += normalizedMatrix[i][j];
    }
    //Now we normalize the row values
    for (var j = 0; j < rowLength; j++) {
      normalizedMatrix[i][j] = (normalizedMatrix[i][j]/rowSum);
    }
  }
  return normalizedMatrix;
}

//Sums an array of numbers
linear.sumRow = function sumRow(row) {
  var sum = 0;
  for (var i = 0; i < row.length; i++) {
    sum += row[i];
  }
  return sum;
}

//Sums a col of a matrix
linear.sumCol = function sumCol(colNum, matrix) {
  var sum = 0;
  for (var i = 0; i < matrix.length; i++) {
    sum += matrix[i][colNum];
  }
  return sum;
}

//Creates a single basis vector given the cooccurrences matrix and an anchor
linear.createBasisVector = function createBasisVector(cooccMatrix, anchor) {
  var basisVector = [];
  for (var i = 0; i < cooccMatrix.length; i++) {
    var sum = 0;
    for (var j = 0; j < anchor.length; j++) {
      sum += cooccMatrix[anchor[j]][i];
    }
    basisVector[i] = sum / anchor.length;
  }
  return basisVector;
}

//Constructs basis vectors from a list of anchor indices
linear.anchorVectors = function anchorVectors(cooccMatrix, anchors, vocab) {
  var basis = [];
  for (var i = 0; i < anchors.length; i++) {
    var anchor = [];
    for (var j = 0; j < anchors[i].length; j++) {
      anchor.push(vocab.indexOf(anchors[i][j]));
    }
    basis[i] = linear.createBasisVector(cooccMatrix, anchor, vocab);
  }
  return basis;
}

//Computes the X matrix, which is just a row-normalized basis
linear.computeX = function computeX(anchors) {
  var X = linear.deepCloneMatrix(anchors);
  for (var i = 0; i < X.length; i++) {
    var rowSum = linear.sumRow(X[i]);
    for (var j = 0; j < X[i].length; j++) {
      X[i][j] = (X[i][j]/rowSum);
    }
  }
  return X;
}

//Takes the log of each entry in a 2d matrix and returns the resulting matrix
linear.matrixLog = function matrixLog(matrix) {
  for (var i = 0; i < matrix.length; i++) {
    for (var j = 0; j < matrix[i].length; j++) {
      matrix[i][j] = Math.log(matrix[i][j]);
    }
  }
  return matrix;
}

//Computes the sum of a matrix in log space
linear.logsumExp = function logsumExp(matrix) {
  max = linear.matrixMax(matrix);
  return max + Math.log(numeric.sum(numeric.exp(numeric.sub(matrix, max))));
}

//Returns true if any value in the matrix is NaN, false otherwise
linear.hasNaN = function isnan(matrix) {
  //If just an array
  if (matrix[0] !== Array) {
    for (var i = 0; i < matrix.length; i++) {
      if (Number.isNaN(matrix[i])) {
        return true
      }
    }
    return false
  }
  else {
    for (var i = 0; i < matrix.length; i++) {
      for (var j = 0; j < matrix[i].length; j++) {
        if (Number.isNaN(matrix[i][j])) {
          return true
        }
      }
    }
    return false
  }
  //I don't think we ever actually get to this throw statement
  throw "linear.hasNaN called on something not a 1D or 2D matrix"
}

//Finds the minimum value in a 2D matrix
linear.matrixMin = function matrixMin(matrix) {
  //If just an array
  if (matrix[0] !== Array) {
    //The "..." operator spreads an array into its parts
    return Math.min(...matrix)
  }
  //If a 2D matrix
  else {
    var min = matrix[0][0];
    for (var i = 0; i < matrix.length; i++) {
      for (var j = 0; j < matrix[i].length; j++) {
        if (matrix[i][j] < min) {
          min = matrix[i][j];
        }
      }
    }
    return min;
  }
  throw "linear.matrixMin invoked on something other than a 1D or 2D matrix"
}

//Finds the maximum value in a 1D (array) or 2D matrix
linear.matrixMax = function matrixMax(matrix) {
  //If just an array
  if (matrix[0] !== Array) {
    //The "..." operator spreads an array into its parts
    return Math.max(...matrix)
  }
  //If a 2D matrix
  else {
    var max = matrix[0][0];
    for (var i = 0; i < matrix.length; i++) {
      for (var j = 0; j < matrix[i].length; j++) {
        if (matrix[i][j] > max) {
          max = matrix[i][j];
        }
      }
    }
    return max;
  }
  throw "linear.matrixMax invoked on something other than a 1D or 2D matrix"
}
