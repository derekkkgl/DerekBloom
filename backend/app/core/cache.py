"""In-memory TTL cache with a per-key lock and stale-on-error.

Think of it as a notebook. Each page is labeled with a key (e.g. "quote:NVDA")
and holds the last answer plus the time it was fetched.

- Fresh hit: the page is younger than its TTL, so return it without calling the source.
- Miss or expired: call the source and overwrite the page.
- Per-key lock: if many requests for the same key arrive together, only one calls
  the source. The rest wait, then read the page it wrote.
- Stale-on-error: if the source fails and an older page exists, return that page
  with stale=True instead of an error. Pages are never evicted, so this always works
  once a key has succeeded at least once.
"""

import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class CacheResult:
    value: Any
    fetched_at: float  # Unix seconds when the source was actually called
    cached: bool  # True if served from memory without calling the source
    stale: bool  # True if the source failed and this is an older copy


@dataclass(frozen=True)
class _Entry:
    value: Any
    fetched_at: float


class TTLCache:
    def __init__(self, clock: Callable[[], float] = time.time):
        self._clock = clock
        self._entries: dict[str, _Entry] = {}
        self._locks: dict[str, threading.Lock] = {}
        self._guard = threading.Lock()

    def __len__(self) -> int:
        return len(self._entries)

    def clear(self) -> None:
        with self._guard:
            self._entries.clear()
            self._locks.clear()

    def get_or_fetch(self, key: str, ttl: float, fetch: Callable[[], Any]) -> CacheResult:
        hit = self._fresh(key, ttl)
        if hit:
            return hit

        with self._lock_for(key):
            # Another thread may have refreshed this key while we waited for the lock.
            hit = self._fresh(key, ttl)
            if hit:
                return hit

            try:
                value = fetch()
            except Exception:
                old = self._entries.get(key)
                if old is None:
                    raise
                return CacheResult(old.value, old.fetched_at, cached=True, stale=True)

            entry = _Entry(value, self._clock())
            self._entries[key] = entry
            return CacheResult(entry.value, entry.fetched_at, cached=False, stale=False)

    def _fresh(self, key: str, ttl: float) -> CacheResult | None:
        entry = self._entries.get(key)
        if entry and self._clock() - entry.fetched_at < ttl:
            return CacheResult(entry.value, entry.fetched_at, cached=True, stale=False)
        return None

    def _lock_for(self, key: str) -> threading.Lock:
        with self._guard:
            return self._locks.setdefault(key, threading.Lock())


cache = TTLCache()
