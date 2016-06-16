"""Functions for creating data import pipelines

An import usually consists of a read followed by a chain of transformations.
For example, a typical import could look like:
    dataset = read_glob('newsgroups/*/*', tokenizer=tokenize.news)
    dataset = filter_stopwords(dataset, 'stopwords/english.txt')
    dataset = filter_rarewords(dataset, 20)
"""
import glob
import numpy
import random
import re
import scipy.sparse

from . import tokenize, segment, label


class Dataset(object):
    """Stores a bag-of-words dataset

    The dataset should be considered immutable. Consequently, dataset
    attributes are accessible only through properties which have no setters.
    The docwords matrix will be a sparse scipy matrix of uint. The vocab and
    titles will both be lists of str. The cooccurrences matrix will be a numpy
    array of float.
    """
    def __init__(self, docwords, vocab, titles, metadata=None):
        self._docwords = docwords
        self._vocab = vocab
        self._titles = titles
        self._metadata = metadata
        self._cooccurrences = None
        self._tokens = {}

        # TODO Why are titles special? Should they just be stored in metadata?

    @property
    def M(self):
        """Gets the sparse docwords matrix"""
        return self._docwords

    @property
    def docwords(self):
        """Gets the sparse docwords matrix"""
        return self.M

    @property
    def vocab(self):
        """Gets the list of vocabulary items"""
        return self._vocab

    @property
    def titles(self):
        """Gets the titles of each document"""
        return self._titles

    @property
    def metadata(self):
        """Gets the metadata of each document, if there is any"""
        return self._metadata

    @property
    def Q(self):
        """Gets the word cooccurrence matrix"""
        # TODO(nozomu) add ways to augment Q with additional labeled data
        if self._cooccurrences is None:
            self.compute_cooccurrences()
        return self._cooccurrences

    @property
    def cooccurrences(self):
        """Gets the word cooccurrence matrix"""
        return self.Q

    def compute_cooccurrences(self):
        """Computes the cooccurrence matrix for the dataset"""
        # See supplementary 4.1 of Aurora et. al. 2012 for information on these
        vocab_size, num_docs = self.M.shape
        H_tilde = scipy.sparse.csc_matrix(self.M, dtype=float)
        H_hat = numpy.zeros(vocab_size)

        # Construct H_tilde and H_hat
        for j in range(H_tilde.indptr.size - 1):
            # get indices of column j
            col_start = H_tilde.indptr[j]
            col_end = H_tilde.indptr[j + 1]
            row_indices = H_tilde.indices[col_start: col_end]

            # get count of tokens in column (document) and compute norm
            count = numpy.sum(H_tilde.data[col_start: col_end])
            norm = count * (count - 1)

            # update H_hat and H_tilde (see supplementary)
            if norm != 0:
                H_hat[row_indices] = H_tilde.data[col_start: col_end] / norm
                H_tilde.data[col_start: col_end] /= numpy.sqrt(norm)

        # construct and store normalized Q
        Q = H_tilde * H_tilde.transpose() - numpy.diag(H_hat)
        self._cooccurrences = numpy.array(Q / num_docs)

    @property
    def vocab_size(self):
        """Gets the size of the dataset vocabulary"""
        return self._docwords.shape[0]

    @property
    def num_docs(self):
        """Gets the number of documents in the dataset"""
        return self._docwords.shape[1]

    def doc_tokens(self, doc_id, rng=random):
        """Converts a document from counts to a sequence of token ids

        The conversion for any one document is only computed once, and the
        resultant tokens are shuffled. However, the computations are performed
        lazily.
        """
        if doc_id in self._tokens:
            return self._tokens[doc_id]

        token_ids, _, counts = scipy.sparse.find(self._docwords[:, doc_id])
        tokens = []
        for token_id, count in zip(token_ids, counts):
            tokens.extend([token_id] * count)
        rng.shuffle(tokens)

        self._tokens[doc_id] = tokens
        return tokens

    def doc_metadata(self, doc_id, key=None):
        """Gets the metadata for a document, if there is any.

        If a key is specified, the metadata value for that document is
        returned (assuming there is such a value). If no key specified, then
        all the metadata associated with the document is returned.
        """
        try:
            metadata = self._metadata[doc_id]
            if key:
                return metadata[key]
            else:
                return metadata
        except (IndexError, TypeError):
            return

    def get_metadata(self, key):
        """Gets the metadata value of each document for a given metadata key"""
        return [self.doc_metadata(d, key) for d in range(self.num_docs)]

    def metadata_query(self, key, value):
        """Gets the index of the documents with a particular metadata value"""
        return [d for d, v in enumerate(self.get_metadata(key)) if v == value]


def read_uci(docwords_filename, vocab_filename):
    """Reads a Dataset from disk in UCI bag-of-words format

    The docwords file is expected to have the following format:
    ---
    D
    W
    NNZ
    docId wordId count
    docId wordId count
    docId wordId count
    ...
    docId wordId count
    docId wordId count
    docId wordId count
    ---
    where D is the number of documents, W is the number of word types in the
    vocabulary, and NNZ is the number of non-zero counts in the data. Each
    subsequent row is a triple consisting of a document id, a word id, and a
    non-zero count indicating the number of occurences of the word in the
    document. Note that both the document id and the word id are
    one-indexed.

    The vocab file is expected to have the actual tokens of the vocabulary.
    There is one token per line, with the line numbers corresponding to the
    word ids in the docwords file.

    Since the uci format does not give any additional information about
    documents, we make the titles simply the string version of the docId's.
    """
    # read in the vocab file
    vocab = []
    with open(vocab_filename) as vocab_file:
        for line in vocab_file:
            vocab.append(line.strip())

    # read in the docwords file
    with open(docwords_filename) as docwords_file:
        num_docs = int(docwords_file.readline())
        num_words = int(docwords_file.readline())
        docwords_file.readline() # ignore nnz

        docwords = scipy.sparse.lil_matrix((num_words, num_docs), dtype='uint')
        for line in docwords_file:
            doc, word, count = (int(x) for x in line.split())
            docwords[word - 1, doc - 1] = count

    # construct and return the Dataset
    titles = [str(i) for i in range(num_docs)]
    return Dataset(docwords.tocsc(), vocab, titles)


def _build_dataset(docdata, tokenizer, labeler):
    # read each file, tracking vocab and word counts
    docs = []
    vocab = {}
    titles = []
    if labeler:
        metadata = []
        if not callable(labeler):
            labeler = label.aggregate(*labeler)
    else:
        metadata = None
    for title, data in docdata:
        doc = {}
        for token in tokenizer(data):
            if token not in vocab:
                vocab[token] = len(vocab)
            token_id = vocab[token]
            doc[token_id] = doc.get(token_id, 0) + 1
        docs.append(doc)
        titles.append(title)
        if labeler:
            metadata.append(labeler(title, data))

    # construct the docword matrix using the vocab map
    docwords = scipy.sparse.lil_matrix((len(vocab), len(docs)), dtype='uint')
    for doc, counts in enumerate(docs):
        for token_id, count in counts.items():
            docwords[token_id, doc] = count

    # convert vocab from a token to index map into a list of tokens
    vocab = {token_id: token for token, token_id in vocab.items()}
    vocab = [vocab[token_id] for token_id in range(len(vocab))]

    # construct and return the Dataset
    return Dataset(docwords.tocsc(), vocab, titles, metadata)


def _build_docdata(filenames, segmenter):
    for filename in filenames:
        for title, data in segmenter(open(filename, errors='replace')):
            yield title, data


def read_glob(glob_pattern, **kwargs):
    """Read a Dataset from a set of files found by a glob pattern

    Each file found by the glob pattern is read and used to construct the
    documents of the resulting Dataset. The read can be customized through the
    use of three key word arguments:

    * tokenizer - customizes how each document should be split into tokens
    * segmenter - customizes how each file should be split into documents
    * labeler - customizes how each document metadata should be generated

    By default, the each filename corresponds to a single document, which is
    given the the filename as a title. The default tokenizer is a simple string
    split, and by default no metadata is generated.
    """
    tokenizer = kwargs.get('tokenizer', tokenize.simple)
    segmenter = kwargs.get('segmenter', segment.simple)
    labeler = kwargs.get('labeler', None)

    docdata = _build_docdata(glob.glob(glob_pattern), segmenter)
    return _build_dataset(docdata, tokenizer, labeler)


def read_file(filename, **kwargs):
    """Read a Dataset from a single file

    The file read can be customized through the use of three key word
    arguments:

    * tokenizer - customizes how each document should be split into tokens
    * segmenter - customizes how each file should be split into documents
    * labeler - customizes how each document metadata should be generated

    By default, each line is considered to be a single document, with the title
    being the first sequence of characters unbroken by whitespace and the data
    being the remainder of the line. The default tokenizer is a simple string
    split, and by default no metadata is generated.
    """
    tokenizer = kwargs.get('tokenizer', tokenize.simple)
    segmenter = kwargs.get('segmenter', segment.lines)
    labeler = kwargs.get('labeler', None)

    docdata = segmenter(open(filename, errors='replace'))
    return _build_dataset(docdata, tokenizer, labeler)


def _filter_vocab(dataset, filter_func):
    """Filters out a set of stopwords based on a filter function"""
    # track which vocab indices should be discarded and which should be kept
    stop_index = []
    keep_index = []
    for i, word in enumerate(dataset.vocab):
        if filter_func(i, word):
            keep_index.append(i)
        else:
            stop_index.append(i)

    # construct dataset with filtered docwords and vocab
    docwords = dataset.docwords[keep_index, :]
    vocab = scipy.delete(dataset.vocab, stop_index)
    return Dataset(docwords, vocab.tolist(), dataset.titles, dataset.metadata)


def _get_wordlist(filename, tokenizer):
    if tokenizer:
        return set(tokenizer(open(filename)))
    else:
        return {word.strip() for word in open(filename)}


def filter_stopwords(dataset, stopword_filename, tokenizer=None):
    """Filters out a set of stopwords from a dataset

    The stopwords file is expected to contain a single stopword token per line.
    The original dataset is unchanged.
    """
    stopwords = _get_wordlist(stopword_filename, tokenizer)
    keep = lambda i, v: v not in stopwords
    return _filter_vocab(dataset, keep)


def _combine_words(dataset, words, replace):
    """Combines a set of words into a single token type"""
    reverse = {v: i for i, v in enumerate(dataset.vocab)}
    index = sorted([reverse[v] for v in words if v in reverse])
    sums = dataset.docwords[index, :].sum(axis=0)

    keep = lambda i, v: i not in index[1:]
    combined = _filter_vocab(dataset, keep)
    combined.docwords[index[0], :] = sums
    combined.vocab[index[0]] = replace
    return combined


def combine_words(dataset, combine_filename, replace, tokenizer=None):
    """Combines a set of words into a single token

    The combine file is expected to contain a single token per line. The
    original dataset is unchanged.
    """
    words = _get_wordlist(combine_filename, tokenizer)
    return _combine_words(dataset, words, replace)


def combine_regex(dataset, regex, replace):
    """Combines a set of words which match a regex

    The regex must match an entire token to be considered a match. Each
    matching token is combined into the replace token. The original dataset is
    unchanged.
    """
    pattern = re.compile(regex)
    words = {token for token in dataset.vocab if pattern.fullmatch(token)}
    return _combine_words(dataset, words, replace)


def filter_rarewords(dataset, doc_threshold):
    """Filters rare words which do not appear in enough documents"""
    keep = lambda i, v: dataset.docwords[i, :].nnz >= doc_threshold
    return _filter_vocab(dataset, keep)


def filter_empty_words(dataset):
    """Filters words which do not appear in any documents"""
    return filter_rarewords(dataset, 1)


def filter_commonwords(dataset, doc_threshold):
    """Filters rare words which appear in too many documents"""
    keep = lambda i, v: dataset.docwords[i, :].nnz <= doc_threshold
    return _filter_vocab(dataset, keep)


def filter_smalldocs(dataset, token_threshold, prune_vocab=True):
    """Filters documents whose token count is less than the threshold

    After removing all short documents, the vocabulary can optionally be pruned
    so that if all documents containing a particular token, that token will
    also be removed from the vocabulary. By default, prune_vocab is True.
    """
    token_counts = dataset.docwords.sum(axis=0)
    keep_index = []
    stop_index = []
    for i, count in enumerate(token_counts.flat):
        if count < token_threshold:
            stop_index.append(i)
        else:
            keep_index.append(i)

    docwords = dataset.docwords[:, keep_index]
    titles = scipy.delete(dataset.titles, stop_index)
    if dataset.metadata:
        metadata = scipy.delete(dataset.metadata, stop_index)
    else:
        metadata = None
    dataset = Dataset(docwords, dataset.vocab, titles, metadata)

    if prune_vocab:
        return filter_rarewords(dataset, 1)
    else:
        return dataset

    # TODO(jeff) fix inefficiency with changing sparsity


def convert_cooccurences(dataset):
    """Transforms a Dataset to use word cooccurrence features instead words

    The new Dataset will have a docwords matrix generated by taking the minimum
    value of each row representing word frequency in the original docwords,
    thereby creating a word cooccurrence matrix.

    For example:
                    doc1 doc2
                cat  1    1
                dog  2    2
    becomes:
                    doc1 doc2
            cat-dog  1    1

    Note that the original dataset is unchanged by this operation.
    """
    # calculates the size of the new matrix
    size = int((dataset.vocab_size * (dataset.vocab_size - 1)) / 2)

    if size == 0:
        return Dataset(scipy.sparse.csc_matrix((0, 0)), [], [])
    docwords = scipy.sparse.lil_matrix((size, dataset.num_docs))

    # compares each row in original matrix to the ones that come after
    row_index = 0
    for wordi in range(dataset.vocab_size):
        for wordj in range(wordi + 1, dataset.vocab_size):
            for doc in range(dataset.num_docs):
                docwords[row_index, doc] = min(dataset.M[wordi, doc],
                                               dataset.M[wordj, doc])
            row_index += 1

    # generates new vocab list for new matrix
    vocab = []
    for i in range(dataset.vocab_size):
        for j in range(i + 1, dataset.vocab_size):
            vocab.append(dataset.vocab[i] + '-' + dataset.vocab[j])

    dataset = Dataset(docwords, vocab, dataset.titles, dataset.metadata)
    dataset = filter_empty_words(dataset)
    return dataset


def convert_format(dataset, conversion):
    """Applies a transformation to the docwords matrix of a dataset

    The most typical usage of this function will be to change the format of the
    docwords matrix. For example, one could change the format from the default
    lil matrix to a csc matrix with:
    dataset = convert_docwords(dataset, scipy.sparse.csc_matrix)
    """
    docwords = conversion(dataset.docwords)
    return Dataset(docwords, dataset.vocab, dataset.titles, dataset.metadata)


def pregenerate_doc_tokens(dataset):
    """Pregenerates the doc tokens for each document in the dataset

    In addition to generating the doc tokens for the entire dataset, this
    function returns the original dataset so that it can be used inside a
    pipeline.
    """
    for doc in range(dataset.num_docs):
        dataset.doc_tokens(doc)
    return dataset


def pregenerate_Q(dataset):
    """Pregenerate the Q matrix for the dataset

    In addition to generating the Q matrix for the dataset, this function
    returns the original dataset so that it can be used inside a pipeline.
    """
    dataset.compute_cooccurrences()
    return dataset


def _prepare_split(dataset, indices):
    split_docwords = dataset.docwords[:, indices]
    split_titles = [dataset.titles[i] for i in indices]
    if dataset.metadata:
        split_metadata = [dataset.doc_metadata(i) for i in indices]
    else:
        split_metadata = None
    return Dataset(split_docwords, dataset.vocab, split_titles, split_metadata)


def train_test_split(dataset, train_percent=.75, rng=random):
    """Splits a dataset into training and test sets

    The train_percent gives the percent of the documents which should be used
    for training. The remaining are placed in test. Both sets will share the
    same vocab after the split, but the vocabulary is pruned so that words
    which only appear in test are discarded.
    """
    # find the indices of the docs for both train and test
    shuffled_docs = list(range(dataset.num_docs))
    rng.shuffle(shuffled_docs)
    split = int(len(shuffled_docs) * train_percent)
    train_docs, test_docs = shuffled_docs[:split], shuffled_docs[split:]

    # split the datasets into train and test
    train_data = _prepare_split(dataset, train_docs)
    test_data = _prepare_split(dataset, test_docs)

    # filter out words which only appear in test
    keep = lambda i, v: train_data.docwords[i, :].nnz > 0
    return _filter_vocab(train_data, keep), _filter_vocab(test_data, keep)

# FIXME(jeff) Recreate run_pipeline with reads having kwargs
