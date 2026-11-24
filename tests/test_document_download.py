"""Document download: returns the stored bytes to an authenticated caller, rejects
an anonymous one, and refuses a document that belongs to another change.
"""

from test_lifecycle import REQUIRED_RFC, _h, _make_user

CONTENT = b"hostname core-sw-01\nrouter bgp 65001\n"


async def test_download_returns_uploaded_bytes(client, session):
    user = await _make_user(session, "requester-download", "REQUESTER")
    headers = _h(user)
    create = await client.post("/api/v1/changes", json=REQUIRED_RFC, headers=headers)
    assert create.status_code == 201, create.text
    change_id = create.json()["id"]

    upload = await client.post(
        f"/api/v1/changes/{change_id}/documents?document_type=BEFORE_CONFIG",
        files={"file": ("before.cfg", CONTENT, "text/plain")},
        headers=headers,
    )
    assert upload.status_code == 201, upload.text
    document_id = upload.json()["document_id"]

    ok = await client.get(
        f"/api/v1/changes/{change_id}/documents/{document_id}/download", headers=headers
    )
    assert ok.status_code == 200
    assert ok.content == CONTENT
    assert "before.cfg" in ok.headers["content-disposition"]

    anonymous = await client.get(f"/api/v1/changes/{change_id}/documents/{document_id}/download")
    assert anonymous.status_code in (401, 403)

    other = await client.post("/api/v1/changes", json=REQUIRED_RFC, headers=headers)
    mismatched = await client.get(
        f"/api/v1/changes/{other.json()['id']}/documents/{document_id}/download", headers=headers
    )
    assert mismatched.status_code == 404
