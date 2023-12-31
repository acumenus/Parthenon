from sklearn.feature_extraction.text import CountVectorizer
from sklearn.metrics.pairwise import cosine_similarity


def get_terms_vectors(results, query, field_name):
    sentences = [query] + list(map(lambda x: x[field_name][0], results))
    cleaned_sentences = list(map(lambda text : text.lower(), sentences))
    vectorizer = CountVectorizer(analyzer='char_wb', ngram_range=(3,4))
    fitted_vectorizer = vectorizer.fit_transform(cleaned_sentences)
    vectors = fitted_vectorizer.toarray()
    return vectors


def cosine_sim_vectors(vec1, vec2):
    vec1 = vec1.reshape(1, -1)
    vec2 = vec2.reshape(1, -1)
    return cosine_similarity(vec1, vec2)[0][0]