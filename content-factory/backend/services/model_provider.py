from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from backend.configs.settings import settings

_GEMINI_MODEL_BY_ROLE = {
    "planner": lambda: settings.gemini_model_planner,
    "researcher": lambda: settings.gemini_model_researcher,
    "writer": lambda: settings.gemini_model_writer,
    "reviewer": lambda: settings.gemini_model_reviewer,
}
_CLAUDE_MODEL_BY_ROLE = {
    "planner": lambda: settings.claude_model_planner,
    "researcher": lambda: settings.claude_model_researcher,
    "writer": lambda: settings.claude_model_writer,
    "reviewer": lambda: settings.claude_model_reviewer,
}

def get_llm(role: str, temperature: float = 0.7):
    """
    Returns an initialized LangChain chat model for the given agent role
    (planner/researcher/writer/reviewer), backed by whichever provider
    is selected via LLM_PROVIDER ("gemini" or "claude").
    """
    if settings.llm_provider == "claude":
        from langchain_anthropic import ChatAnthropic

        api_key = settings.anthropic_api_key or "sk-ant-MOCK_KEY_DO_NOT_USE"
        return ChatAnthropic(
            model=_CLAUDE_MODEL_BY_ROLE[role](),
            api_key=api_key,
            base_url=settings.anthropic_base_url or None,
            temperature=temperature,
            max_retries=2,
        )

    api_key = settings.gemini_api_key
    if api_key in ("mock", "your_api_key_here"):
        api_key = "AIzaSy_MOCK_KEY_DO_NOT_USE" # Prevents init crash in mock mode, will fail on actual call if not caught

    return ChatGoogleGenerativeAI(
        model=_GEMINI_MODEL_BY_ROLE[role](),
        google_api_key=api_key,
        temperature=temperature,
        max_retries=2,
        base_url=settings.gemini_base_url or None,
    )

def get_embeddings_client(model_name: str | None = None) -> GoogleGenerativeAIEmbeddings:
    """
    Returns an initialized LangChain Google GenAI embeddings client.
    Defaults to settings.embedding_model (models/text-embedding-004, 768-dim,
    matching KnowledgeChunk.embedding). Uses the same mock-key guard as get_llm.
    Embeddings stay on Gemini regardless of LLM_PROVIDER -- Anthropic has no
    embeddings endpoint.
    """
    api_key = settings.gemini_api_key
    if api_key in ("mock", "your_api_key_here"):
        api_key = "AIzaSy_MOCK_KEY_DO_NOT_USE" # Prevents init crash in mock mode, will fail on actual call if not caught

    return GoogleGenerativeAIEmbeddings(
        model=model_name or settings.embedding_model,
        google_api_key=api_key,
        base_url=settings.gemini_base_url or None,
    )
