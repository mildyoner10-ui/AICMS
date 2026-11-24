"""Provider failures surface as a message the requester can act on."""

from app.routes.reviews import review_error_text


def test_provider_outage_maps_to_retry_hint():
    raw = "HTTPStatusError: Server error '503 Service Unavailable' for url 'http://x/v1/chat/completions'"
    assert "tidak tersedia" in review_error_text(raw)


def test_gateway_502_maps_like_503():
    assert "tidak tersedia" in review_error_text("litellm.BadGatewayError: 502 Bad Gateway")


def test_timeout_rate_limit_auth_and_bad_json_are_distinct():
    assert "batas waktu" in review_error_text("ReadTimeout: timed out")
    assert "sibuk" in review_error_text("Rate limit exceeded")
    assert "kredensial" in review_error_text("401 Unauthorized: invalid api key")
    assert "tidak dapat dibaca" in review_error_text("ValidationError: not valid JSON")


def test_unknown_and_empty_fall_back_to_generic():
    assert "gagal" in review_error_text(None)
    assert "gagal" in review_error_text("KeyError: 'choices'")
