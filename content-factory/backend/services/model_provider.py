from typing import Literal

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

# Tier classification layered on top of the 4 fixed roles above (see
# docs/architecture/AUTONOMOUS_CONTENT_FACTORY_IMPLEMENTATION_PLAN.md §7/§16).
# This does NOT change which model any existing role resolves to -- it's
# purely a label for cost reporting / for new non-role call sites (see
# get_llm_for_tier below) to pick a sensibly-priced model without inventing
# a fake 5th role.
#   - planner/researcher/reviewer: MID -- structured-output extraction/
#     analysis work, not the highest-stakes generation step.
#   - writer: PREMIUM -- the actual learner-facing prose; quality here is
#     the whole product, so it stays on the best available model.
#   - (CHEAP has no existing role -- it's for new call sites only, e.g. the
#     upcoming topic-dedup/classification helper.)
ROLE_TIERS: dict[str, Literal["CHEAP", "MID", "PREMIUM"]] = {
    "planner": "MID",
    "researcher": "MID",
    "writer": "PREMIUM",
    "reviewer": "MID",
}

# Tier -> model-name resolver, one dict per provider, independent of the
# role dicts above. CHEAP has no corresponding settings field on AppSetting
# (backend/models/domain.py) yet -- see settings.py's gemini_cheap_model/
# claude_cheap_model for the fallback-default rationale. MID/PREMIUM reuse
# an existing role's model name so tier-based lookups stay consistent with
# role-based ones for roles that already exist.
_GEMINI_MODEL_BY_TIER = {
    "CHEAP": lambda: settings.gemini_cheap_model,
    "MID": lambda: settings.gemini_model_planner,
    "PREMIUM": lambda: settings.gemini_model_writer,
}
_CLAUDE_MODEL_BY_TIER = {
    "CHEAP": lambda: settings.claude_cheap_model,
    "MID": lambda: settings.claude_model_planner,
    "PREMIUM": lambda: settings.claude_model_writer,
}


def _build_chat_model(model_name: str, temperature: float):
    """
    Shared provider-switching logic behind get_llm/get_llm_for_tier: picks
    gemini vs claude per settings.llm_provider, resolves the API key (with
    the same mock-mode guards as before), and constructs the LangChain chat
    model for the given resolved `model_name`.
    """
    if settings.llm_provider == "claude":
        from langchain_anthropic import ChatAnthropic

        api_key = settings.anthropic_api_key or "sk-ant-MOCK_KEY_DO_NOT_USE"
        return ChatAnthropic(
            model=model_name,
            api_key=api_key,
            base_url=settings.anthropic_base_url or None,
            temperature=temperature,
            max_retries=2,
        )

    api_key = settings.gemini_api_key
    if api_key in ("mock", "your_api_key_here"):
        api_key = "AIzaSy_MOCK_KEY_DO_NOT_USE" # Prevents init crash in mock mode, will fail on actual call if not caught

    return ChatGoogleGenerativeAI(
        model=model_name,
        google_api_key=api_key,
        temperature=temperature,
        max_retries=2,
        base_url=settings.gemini_base_url or None,
    )


def get_model_name(role: str) -> str:
    """
    Resolves just the model name string for a role (planner/researcher/
    writer/reviewer), without constructing a chat model -- used by agents'
    settings.mock_mode branches to pass a real, price-lookup-able model name
    into CostTracker.add_usage()/backend.agents.base.record_mock_usage.
    """
    model_by_role = _CLAUDE_MODEL_BY_ROLE if settings.llm_provider == "claude" else _GEMINI_MODEL_BY_ROLE
    return model_by_role[role]()


def get_llm(role: str, temperature: float = 0.7):
    """
    Returns an initialized LangChain chat model for the given agent role
    (planner/researcher/writer/reviewer), backed by whichever provider
    is selected via LLM_PROVIDER ("gemini" or "claude").
    """
    model_by_role = _CLAUDE_MODEL_BY_ROLE if settings.llm_provider == "claude" else _GEMINI_MODEL_BY_ROLE
    model_name = model_by_role[role]()
    return _build_chat_model(model_name, temperature)


def get_llm_for_tier(tier: Literal["CHEAP", "MID", "PREMIUM"], temperature: float = 0.3):
    """
    Returns an initialized LangChain chat model for a cost TIER rather than
    one of the 4 fixed agent roles -- for new call sites (e.g. topic-dedup/
    classification helpers) that don't map onto planner/researcher/writer/
    reviewer and shouldn't be forced into inventing a fake 5th role.

    Reuses the exact same provider-switching/API-key logic as get_llm via
    _build_chat_model; only the model-name resolution differs (tier lookup
    instead of role lookup). Does not affect get_llm or ROLE_TIERS in any
    way -- existing role call sites are untouched.
    """
    model_by_tier = _CLAUDE_MODEL_BY_TIER if settings.llm_provider == "claude" else _GEMINI_MODEL_BY_TIER
    model_name = model_by_tier[tier]()
    return _build_chat_model(model_name, temperature)

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
