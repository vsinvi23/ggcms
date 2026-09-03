import logging

import httpx
from pydantic import BaseModel

from backend.configs.settings import settings
from backend.schemas.agent_error import AgentError
from backend.agents.base import AgentExecutionError

logger = logging.getLogger(__name__)

AGENT_NAME = "WebSearchTool"
TAVILY_SEARCH_URL = "https://api.tavily.com/search"


class WebSearchResult(BaseModel):
    title: str | None = None
    url: str
    snippet: str | None = None
    rank: int


async def web_search(query: str, max_results: int | None = None) -> list[WebSearchResult]:
    """
    Searches the web for `query` and returns ranked results.

    Provider is Tavily; all provider-specific request/response handling lives
    in this function so switching providers later is a config-scoped change.
    """
    max_results = max_results or settings.web_search_max_results

    if settings.mock_mode:
        return [
            WebSearchResult(
                title=f"(mock) {query} — overview",
                url="https://example.com/mock-search-result-1",
                snippet=f"Mock search result 1 for '{query}'.",
                rank=1,
            ),
            WebSearchResult(
                title=f"(mock) {query} — deep dive",
                url="https://example.com/mock-search-result-2",
                snippet=f"Mock search result 2 for '{query}'.",
                rank=2,
            ),
        ][:max_results]

    if not settings.tavily_api_key:
        raise AgentExecutionError(AgentError(
            error_type="WEB_SEARCH_NOT_CONFIGURED",
            agent_name=AGENT_NAME,
            message="TAVILY_API_KEY is not set; cannot perform a live web search.",
            retryable=False,
        ))

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                TAVILY_SEARCH_URL,
                json={
                    "api_key": settings.tavily_api_key,
                    "query": query,
                    "max_results": max_results,
                },
            )
            response.raise_for_status()
            data = response.json()
    except Exception as e:
        logger.error(f"[{AGENT_NAME}] web search failed for query '{query}': {e}")
        raise AgentExecutionError(AgentError(
            error_type="WEB_SEARCH_FAILED",
            agent_name=AGENT_NAME,
            message=str(e),
            retryable=True,
        )) from e

    results = []
    for idx, item in enumerate(data.get("results", [])[:max_results], start=1):
        results.append(WebSearchResult(
            title=item.get("title"),
            url=item["url"],
            snippet=item.get("content"),
            rank=idx,
        ))
    return results
