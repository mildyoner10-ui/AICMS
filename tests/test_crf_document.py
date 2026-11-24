"""CRF is a valid document type and survives the upload round-trip."""

from test_lifecycle import REQUIRED_RFC, _h, _make_user

CRF = b"Change Request Form\nTitle: BGP policy ISP-A\nImpact: outbound path change\n"


async def test_crf_document_type_accepted(client, session):
    user = await _make_user(session, "requester-crf", "REQUESTER")
    headers = _h(user)
    create = await client.post("/api/v1/changes", json=REQUIRED_RFC, headers=headers)
    change_id = create.json()["id"]

    upload = await client.post(
        f"/api/v1/changes/{change_id}/documents?document_type=CRF",
        files={"file": ("crf.txt", CRF, "text/plain")},
        headers=headers,
    )
    assert upload.status_code == 201, upload.text

    listing = await client.get(f"/api/v1/changes/{change_id}/documents")
    assert listing.json()["items"][0]["document_type"] == "CRF"
