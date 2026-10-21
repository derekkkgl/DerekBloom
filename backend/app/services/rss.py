"""News from public RSS feeds.

fetch_feed only downloads bytes. shape_feed and merge_items are pure.
"""

import html
import re
from calendar import timegm
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import feedparser
import requests

from app.core.errors import ApiError, UpstreamError

Category = Literal["markets", "crypto"]

USER_AGENT = "SwissGlassTerminal/0.1 (personal RSS reader)"
TIMEOUT_SECONDS = 10
SUMMARY_CHARS = 300


@dataclass(frozen=True)
class Feed:
    name: str
    category: Category
    url: str


FEEDS: list[Feed] = [
    Feed("CNBC", "markets", "https://www.cnbc.com/id/100003114/device/rss/rss.html"),
    Feed("MarketWatch", "markets", "https://feeds.content.dowjones.io/public/rss/mw_topstories"),
    Feed("CoinDesk", "crypto", "https://www.coindesk.com/arc/outboundfeeds/rss/"),
    Feed("Cointelegraph", "crypto", "https://cointelegraph.com/rss"),
    Feed("Decrypt", "crypto", "https://decrypt.co/feed"),
]


def fetch_feed(url: str) -> bytes:
    res = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT_SECONDS)
    res.raise_for_status()
    return res.content


def get_feed(feed: Feed) -> list[dict]:
    try:
        content = fetch_feed(feed.url)
    except ApiError:
        raise
    except Exception as exc:
        raise UpstreamError(f"{feed.name} feed failed: {type(exc).__name__}: {exc}") from exc
    return shape_feed(feed, content)


def shape_feed(feed: Feed, content: bytes) -> list[dict]:
    parsed = feedparser.parse(content)
    if not parsed.entries:
        reason = parsed.get("bozo_exception") or "no entries"
        raise UpstreamError(f"{feed.name} feed returned no articles ({reason})")

    items = []
    for entry in parsed.entries:
        title = _text(entry.get("title"))
        url = entry.get("link")
        if not title or not url:
            continue
        items.append(
            {
                "title": title,
                "url": url,
                "source": feed.name,
                "category": feed.category,
                "published": _published(entry),
                "summary": _text(entry.get("summary"))[:SUMMARY_CHARS] or None,
            }
        )
    return items


def merge_items(item_lists: list[list[dict]], limit: int) -> list[dict]:
    """Newest first, then drop repeats of the same link or the same headline."""
    everything = [item for items in item_lists for item in items]
    everything.sort(key=lambda i: i["published"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)

    seen_urls: set[str] = set()
    seen_titles: set[str] = set()
    merged = []
    for item in everything:
        url_key, title_key = _url_key(item["url"]), _title_key(item["title"])
        if url_key in seen_urls or title_key in seen_titles:
            continue
        seen_urls.add(url_key)
        seen_titles.add(title_key)
        merged.append(item)
        if len(merged) == limit:
            break
    return merged


def _text(value: str | None) -> str:
    """Strip HTML tags and entities, collapse whitespace."""
    if not value:
        return ""
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", value))).strip()


def _published(entry: dict) -> datetime | None:
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    return datetime.fromtimestamp(timegm(parsed), tz=timezone.utc) if parsed else None


def _url_key(url: str) -> str:
    """Same article with different tracking parameters counts as one."""
    parts = urlsplit(url)
    query = urlencode([(k, v) for k, v in parse_qsl(parts.query) if not k.lower().startswith("utm_")])
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"), query, ""))


def _title_key(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", title.lower())
