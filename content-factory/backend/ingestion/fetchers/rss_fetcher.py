import xml.etree.ElementTree as ET
import httpx
from pydantic import BaseModel

class RSSItem(BaseModel):
    title: str
    link: str
    summary: str

async def fetch_rss_feed(url: str) -> list[RSSItem]:
    """
    Salvaged from legacy article_platform.
    Fetches and parses basic RSS/Atom feeds to extract article links.
    """
    items = []
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            
            root = ET.fromstring(response.text)
            for item in root.findall(".//item"):
                title = item.findtext("title") or ""
                link = item.findtext("link") or ""
                description = item.findtext("description") or ""
                if link:
                    items.append(RSSItem(title=title, link=link, summary=description))
    except Exception as e:
        print(f"Error fetching RSS: {e}")
        
    return items

