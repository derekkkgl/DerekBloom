import pytest

from app.services import rss


def rss_xml(*items: tuple[str, str, str]) -> bytes:
    """items: (title, link, RFC 822 date or '')"""
    body = "".join(
        f"<item><title>{t}</title><link>{link}</link>"
        + (f"<pubDate>{d}</pubDate>" if d else "")
        + "<description>&lt;p&gt;Some &amp;amp; summary&lt;/p&gt;</description></item>"
        for t, link, d in items
    )
    return f'<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>{body}</channel></rss>'.encode()


FEEDS = {
    "CNBC": rss_xml(
        ("Stocks rally on Fed hopes", "https://cnbc.com/a?utm_source=rss", "Wed, 21 Oct 2026 08:00:00 GMT"),
        ("Oil slides", "https://cnbc.com/b", "Wed, 21 Oct 2026 06:00:00 GMT"),
    ),
    "MarketWatch": rss_xml(
        ("Stocks rally on Fed hopes!", "https://marketwatch.com/x", "Wed, 21 Oct 2026 07:00:00 GMT"),  # same headline
        ("No date story", "https://marketwatch.com/y", ""),
    ),
    "CoinDesk": rss_xml(("Bitcoin tops 85K", "https://coindesk.com/c", "Wed, 21 Oct 2026 09:00:00 +0000")),
    "Cointelegraph": rss_xml(("ETH ETF flows", "https://cointelegraph.com/d", "Wed, 21 Oct 2026 05:00:00 +0000")),
    "Decrypt": rss_xml(("Bitcoin tops 85K", "https://decrypt.co/e", "Wed, 21 Oct 2026 04:00:00 +0000")),
}


@pytest.fixture
def fake_feeds(monkeypatch):
    down: set[str] = set()
    by_url = {feed.url: feed.name for feed in rss.FEEDS}

    def fake(url):
        name = by_url[url]
        if name in down:
            raise ConnectionError(f"{name} unreachable")
        return FEEDS[name]

    monkeypatch.setattr(rss, "fetch_feed", fake)
    return down


def test_news_dedupes_and_sorts_newest_first(client, fake_feeds):
    body = client.get("/api/news").json()
    titles = [i["title"] for i in body["data"]["items"]]
    assert titles == [
        "Bitcoin tops 85K",  # CoinDesk 09:00 wins over Decrypt's later copy
        "Stocks rally on Fed hopes",  # CNBC 08:00 wins over MarketWatch's 07:00 copy
        "Oil slides",
        "ETH ETF flows",
        "No date story",  # undated items sink to the bottom
    ]
    first = body["data"]["items"][0]
    assert first["published"] == "2026-10-21T09:00:00Z"
    assert first["summary"] == "Some & summary"
    assert body["data"]["items"][-1]["published"] is None
    assert body["meta"]["source"] == "rss"
    assert all(s["ok"] for s in body["data"]["sources"])


def test_category_and_limit(client, fake_feeds):
    body = client.get("/api/news?category=crypto&limit=1").json()
    assert [s["name"] for s in body["data"]["sources"]] == ["CoinDesk", "Cointelegraph", "Decrypt"]
    assert len(body["data"]["items"]) == 1
    assert body["data"]["items"][0]["category"] == "crypto"


def test_one_feed_down_still_returns_others(client, fake_feeds):
    fake_feeds.add("CNBC")
    body = client.get("/api/news?category=markets").json()
    cnbc = body["data"]["sources"][0]
    assert cnbc["ok"] is False and "CNBC unreachable" in cnbc["error"]
    assert [i["source"] for i in body["data"]["items"]] == ["MarketWatch", "MarketWatch"]


def test_down_feed_serves_stale_copy(client, fake_feeds):
    from app.core.cache import cache

    client.get("/api/news?category=markets")
    # Expire every entry by rewinding its fetch time, then take CNBC down.
    for key, entry in list(cache._entries.items()):
        cache._entries[key] = type(entry)(entry.value, entry.fetched_at - 3600)
    fake_feeds.add("CNBC")
    body = client.get("/api/news?category=markets").json()
    cnbc = body["data"]["sources"][0]
    assert cnbc["ok"] is True and cnbc["stale"] is True
    assert body["meta"]["stale"] is True


def test_all_feeds_down_is_502(client, fake_feeds):
    fake_feeds.update({"CNBC", "MarketWatch"})
    res = client.get("/api/news?category=markets")
    assert res.status_code == 502
    assert res.json()["error"]["code"] == "upstream_error"


def test_bad_params_are_400(client, fake_feeds):
    assert client.get("/api/news?category=sports").status_code == 400
    assert client.get("/api/news?limit=0").status_code == 400


def test_empty_feed_is_an_error():
    with pytest.raises(rss.UpstreamError):
        rss.shape_feed(rss.FEEDS[0], b"<html>not a feed</html>")


def test_news_csv(client, fake_feeds):
    res = client.get("/api/news?format=csv")
    assert res.text.splitlines()[0] == "title,url,source,category,published,summary"
