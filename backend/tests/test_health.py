def test_health(client):
    body = client.get("/api/health").json()
    assert body["data"] == {"status": "ok", "version": "0.1.0", "cache_entries": 0}
    assert body["meta"]["source"] == "local"
    assert body["meta"]["as_of"].endswith("Z")


def test_unknown_route_uses_error_envelope(client):
    res = client.get("/api/nope")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "not_found"
