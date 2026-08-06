from ingestion.geocode import NominatimClient


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _FakeHttpClient:
    def __init__(self, payload):
        self._payload = payload
        self.calls = []

    def get(self, url, params=None, headers=None, timeout=None):
        self.calls.append({"url": url, "params": params, "headers": headers})
        return _FakeResponse(self._payload)


def test_geocode_returns_lat_lng():
    fake = _FakeHttpClient([{"lat": "-25.4284", "lon": "-49.2733"}])
    client = NominatimClient(http_client=fake, min_interval_s=0)
    coords = client.geocode("Rua XV de Novembro, Curitiba, PR")
    assert coords == (-25.4284, -49.2733)
    assert "User-Agent" in fake.calls[0]["headers"]
    assert fake.calls[0]["params"]["countrycodes"] == "br"


def test_geocode_returns_none_on_empty_result():
    fake = _FakeHttpClient([])
    client = NominatimClient(http_client=fake, min_interval_s=0)
    assert client.geocode("endereço inexistente") is None


def test_geocode_returns_none_for_blank_address():
    fake = _FakeHttpClient([{"lat": "1", "lon": "2"}])
    client = NominatimClient(http_client=fake, min_interval_s=0)
    assert client.geocode("") is None
    assert fake.calls == []
