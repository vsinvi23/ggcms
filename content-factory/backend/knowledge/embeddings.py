from backend.services.model_provider import get_embeddings_client


def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    Embeds a batch of texts into 768-dim vectors using the configured Gemini
    embedding model (settings.embedding_model, default models/text-embedding-004),
    matching KnowledgeChunk.embedding (Vector(768)).

    Returns an empty list for empty input, and preserves input order.
    """
    if not texts:
        return []

    client = get_embeddings_client()
    return client.embed_documents(texts)


def embed_query(text: str) -> list[float]:
    """
    Embeds a single query string, using the embedding model's query-optimized
    task type where supported (GoogleGenerativeAIEmbeddings.embed_query).
    """
    client = get_embeddings_client()
    return client.embed_query(text)
