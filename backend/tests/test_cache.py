import threading
import time

import pytest

from app.core.cache import TTLCache


def test_fresh_hit_skips_fetch(clock):
    c = TTLCache(clock)
    calls = []
    first = c.get_or_fetch("k", 60, lambda: calls.append(1) or "v1")
    clock.advance(59)
    second = c.get_or_fetch("k", 60, lambda: calls.append(1) or "v2")
    assert (first.value, first.cached) == ("v1", False)
    assert (second.value, second.cached, second.stale) == ("v1", True, False)
    assert len(calls) == 1


def test_expired_entry_refetches(clock):
    c = TTLCache(clock)
    c.get_or_fetch("k", 60, lambda: "old")
    clock.advance(61)
    result = c.get_or_fetch("k", 60, lambda: "new")
    assert (result.value, result.cached, result.fetched_at) == ("new", False, clock.now)


def test_stale_on_error_returns_old_value(clock):
    c = TTLCache(clock)
    c.get_or_fetch("k", 60, lambda: "good")
    fetched_at = clock.now
    clock.advance(120)

    def boom():
        raise RuntimeError("Yahoo down")

    result = c.get_or_fetch("k", 60, boom)
    assert (result.value, result.stale, result.cached, result.fetched_at) == ("good", True, True, fetched_at)


def test_error_with_nothing_cached_raises(clock):
    c = TTLCache(clock)

    def boom():
        raise RuntimeError("Yahoo down")

    with pytest.raises(RuntimeError):
        c.get_or_fetch("k", 60, boom)
    assert len(c) == 0


def test_parallel_requests_trigger_one_fetch():
    c = TTLCache()
    calls = []
    start = threading.Barrier(10)

    def slow_fetch():
        calls.append(1)
        time.sleep(0.05)
        return "v"

    results = []

    def worker():
        start.wait()
        results.append(c.get_or_fetch("quote:NVDA", 60, slow_fetch))

    threads = [threading.Thread(target=worker) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(calls) == 1
    assert [r.value for r in results] == ["v"] * 10
    assert sum(not r.cached for r in results) == 1


def test_different_keys_are_independent(clock):
    c = TTLCache(clock)
    c.get_or_fetch("quote:AAPL", 60, lambda: "a")
    result = c.get_or_fetch("quote:NVDA", 60, lambda: "n")
    assert (result.value, result.cached) == ("n", False)
    assert len(c) == 2
