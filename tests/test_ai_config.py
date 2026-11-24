"""AI provider configuration from env: provider selection, status, OpenAI-compatible client."""

import json

import pytest

from app.core.config import Settings
from app.integrations.ai import review_provider
from app.integrations.ai.review_provider import (
    OpenAICompatibleProvider,
    ProviderUnavailable,
    ReviewRequest,
)


def test_mock_is_default_and_labelled():
    s = Settings(_env_file=None)
    assert s.ai_provider == "mock"
    assert isinstance(review_provider.MockReviewProvider(), review_provider.ReviewProvider)


def test_openai_settings_loaded_from_env(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "openai")
    monkeypatch.setenv("AI_BASE_URL", "https://llm.internal.example/v1")
    monkeypatch.setenv("AI_MODEL", "qwen2.5-14b")
    monkeypatch.setenv("AI_API_KEY", "sk-test-not-real")
    monkeypatch.setenv("AI_TIMEOUT_SECONDS", "15")
    s = Settings(_env_file=None)
    assert s.ai_provider == "openai"
    assert s.ai_base_url == "https://llm.internal.example/v1"
    assert s.ai_model == "qwen2.5-14b"
    assert s.resolved_ai_key == "sk-test-not-real"
    assert s.ai_timeout_seconds == 15


def test_legacy_openai_key_still_used(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-legacy")
    monkeypatch.setenv("OPENAI_MODEL", "gpt-4")
    s = Settings(_env_file=None)
    assert s.resolved_ai_key == "sk-legacy"
    assert s.ai_model == "gpt-4o-mini"  # explicit AI_MODEL still wins; OPENAI_MODEL is alias only


def test_provider_status_mock(monkeypatch):
    monkeypatch.setattr(review_provider.settings, "ai_provider", "mock")
    status = review_provider.provider_status()
    assert status["provider"] == "mock"
    assert status["label"] == "DEMO/MOCK"


def test_provider_status_openai(monkeypatch):
    monkeypatch.setattr(review_provider.settings, "ai_provider", "openai")
    monkeypatch.setattr(review_provider.settings, "ai_model", "llama3.1")
    monkeypatch.setattr(review_provider.settings, "ai_api_key", "sk-x")
    status = review_provider.provider_status()
    assert status["provider"] == "openai"
    assert status["label"] == "AI: llama3.1"
    assert status["api_key_configured"] is True


def test_unknown_provider_fails_loud(monkeypatch):
    monkeypatch.setattr(review_provider.settings, "ai_provider", "nonsense")
    with pytest.raises(ValueError):
        review_provider.get_review_provider()


async def test_openai_provider_requires_api_key(monkeypatch):
    monkeypatch.setattr(review_provider.settings, "ai_api_key", None)
    monkeypatch.setattr(review_provider.settings, "openai_api_key", None)
    provider = OpenAICompatibleProvider()
    with pytest.raises(ProviderUnavailable):
        await provider.analyze(ReviewRequest(revision_id="r", change_id="c", documents=[], change_data={}))


async def test_openai_provider_parses_and_labels(monkeypatch):
    """A stub transport returns a well-formed review; no network, no real key."""
    import httpx

    payload = {
        "summary": "ok",
        "recommendation": "RECOMMEND_APPROVE",
        "factor_scores": {"configuration": 10, "service_impact": 10, "security": 10, "rollback": 5, "document_completeness": 5},
        "findings": [
            {
                "category": "ROLLBACK",
                "check_name": "rollback_plan_present",
                "status": "PASS",
                "severity": "INFO",
                "title": "rollback present",
                "evidence": [{"field": "rollback_plan", "snippet": "restore config"}],
            }
        ],
        "limitations": ["stub"],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/chat/completions")
        assert request.headers["authorization"] == "Bearer sk-test"
        body = json.loads(request.content)
        assert body["model"] == "stub-model"
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(payload)}}]})

    monkeypatch.setattr(review_provider.settings, "ai_api_key", "sk-test")
    monkeypatch.setattr(review_provider.settings, "ai_model", "stub-model")
    monkeypatch.setattr(review_provider.settings, "ai_base_url", "https://llm.test/v1")

    real_client = httpx.AsyncClient

    def patched_client(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", patched_client)

    result = await OpenAICompatibleProvider().analyze(
        ReviewRequest(revision_id="r", change_id="c", documents=[], change_data={"title": "t"})
    )
    assert result.recommendation == "RECOMMEND_APPROVE"
    assert result.data["provider_label"] == "AI: stub-model"


async def test_openai_provider_rejects_bad_json(monkeypatch):
    import httpx

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {"content": "not json"}}]})

    monkeypatch.setattr(review_provider.settings, "ai_api_key", "sk-test")
    monkeypatch.setattr(review_provider.settings, "ai_base_url", "https://llm.test/v1")

    real_client = httpx.AsyncClient

    def patched_client(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", patched_client)
    with pytest.raises(json.JSONDecodeError):
        await OpenAICompatibleProvider().analyze(
            ReviewRequest(revision_id="r", change_id="c", documents=[], change_data={})
        )

def test_parse_json_object_tolerates_extra_data():
    from app.integrations.ai.review_provider import _parse_json_object

    assert _parse_json_object('{"a": 1}') == {"a": 1}
    assert _parse_json_object('Here is the review:\n{"a": 1}\nHope that helps.') == {"a": 1}
    assert _parse_json_object('{"a": 1}{"b": 2}') == {"a": 1}
    assert _parse_json_object('```json\n{"a": 1}\n```') == {"a": 1}
    with pytest.raises(json.JSONDecodeError):
        _parse_json_object("no json here")

class _FakeResponse:
    def __init__(self, text, content_type):
        self.text = text
        self.headers = {"content-type": content_type}


def test_read_completion_text_plain_json():
    import json as j

    from app.integrations.ai.review_provider import _read_completion_text

    body = j.dumps({"choices": [{"message": {"content": '{"a": 1}'}}]})
    assert _read_completion_text(_FakeResponse(body, "application/json")) == '{"a": 1}'


def test_read_completion_text_sse_stream():
    import json as j

    from app.integrations.ai.review_provider import _read_completion_text

    events = [
        {"choices": [{"delta": {"role": "assistant", "content": ""}}]},
        {"choices": [{"delta": {"content": '{"sum'}}]},
        {"choices": [{"delta": {"content": 'mary": "ok"}'}}]},
        {"choices": [{"delta": {}, "finish_reason": "stop"}]},
    ]
    sse = "".join(f"data: {j.dumps(e)}\n\n" for e in events) + "data: [DONE]\n\n"
    resp = _FakeResponse(sse, "text/event-stream; charset=utf-8")
    assert _read_completion_text(resp) == '{"summary": "ok"}'


def test_read_completion_text_sse_reasoning_only():
    import json as j

    from app.integrations.ai.review_provider import _read_completion_text

    sse = f"data: {j.dumps({'choices': [{'delta': {'reasoning_content': '{\"a\": 1}'}}]})}\n\ndata: [DONE]\n\n"
    assert _read_completion_text(_FakeResponse(sse, "text/event-stream")) == '{"a": 1}'

def test_read_completion_text_json_then_done_tail():
    """Some servers send one JSON document followed by `data: [DONE]`."""
    import json as j

    from app.integrations.ai.review_provider import _read_completion_text

    body = j.dumps({"choices": [{"message": {"content": '{"a": 1}'}}]}) + "\ndata: [DONE]\n\n"
    resp = _FakeResponse(body, "text/event-stream")
    assert _read_completion_text(resp) == '{"a": 1}'