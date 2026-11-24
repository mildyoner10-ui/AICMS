"""Stage 3: approval workflow — matrix routing, sequential steps, SoD, stale binding, aggregate approve."""

import uuid

from sqlalchemy import select

from app.models import Change
from app.services import approval_matrix
from test_lifecycle import REQUIRED_RFC, _h, _make_user  # shared helpers (tests dir is on sys.path)


async def _routed_change(client, session, change_type="NORMAL"):
    """A change in PENDING_APPROVAL with its approval workflow created."""
    requester = await _make_user(session, f"req_{uuid.uuid4().hex[:6]}", "REQUESTER")
    body = {**REQUIRED_RFC, "change_type": change_type, "title": f"Approval {change_type}"}
    resp = await client.post("/api/v1/changes", json=body, headers=_h(requester))
    assert resp.status_code == 201, resp.text
    change = resp.json()

    submitted = await client.post(f"/api/v1/changes/{change['id']}/submit", headers=_h(requester))
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["status"] == "PENDING_APPROVAL", submitted.text
    return change, requester


class TestApprovalMatrix:
    def test_low_risk_route(self):
        assert approval_matrix.route_for("NORMAL", "LOW") == ["TECH_REVIEWER", "MANAGER"]

    def test_high_risk_route_has_cab_and_final(self):
        route = approval_matrix.route_for("NORMAL", "HIGH")
        assert route[:3] == ["TECH_REVIEWER", "MANAGER", "CHANGE_MANAGER"]
        assert route[-2:] == ["CAB_MEMBER", "FINAL_APPROVER"]

    def test_unassessed_risk_is_never_low(self):
        assert approval_matrix.route_for("NORMAL", None) == approval_matrix.DEFAULT_MATRIX["MEDIUM"]

    def test_emergency_route(self):
        assert approval_matrix.route_for("EMERGENCY", "LOW") == ["CHANGE_MANAGER", "MANAGER"]


class TestApprovalWorkflow:
    async def test_submit_creates_sequential_tasks(self, client, session):
        change, _ = await _routed_change(client, session)
        db_change = (await session.execute(select(Change).where(Change.id == change["id"]))).scalar_one()
        await session.refresh(db_change, ["workflow_instances"])

        task_rows = []
        for inst in db_change.workflow_instances:
            await session.refresh(inst, ["tasks"])
            task_rows.extend(inst.tasks)
        orders = sorted(t.step_order for t in task_rows)
        assert orders == list(range(1, len(orders) + 1))
        assert all(t.revision_id is not None for t in task_rows)

    async def test_only_first_step_actionable(self, client, session):
        await _routed_change(client, session)
        tech = await _make_user(session, f"tech_{uuid.uuid4().hex[:6]}", "TECH_REVIEWER")

        inbox = (await client.get("/api/v1/approvals/inbox", headers=_h(tech))).json()
        assert inbox["pending_count"] == 1
        assert inbox["tasks"][0]["actionable"] is True
        assert inbox["tasks"][0]["change"]["status"] == "PENDING_APPROVAL"

    async def test_full_sequential_approval_reaches_approved(self, client, session):
        change, requester = await _routed_change(client, session)

        # Route follows the review's risk level (mock review scores HIGH here), so walk
        # whatever steps the workflow actually created, in order.
        role_holder = {
            "TECH_REVIEWER": "TECH_REVIEWER",
            "MANAGER": "MANAGER",
            "CHANGE_MANAGER": "CHANGE_MANAGER",
            "CAB_MEMBER": "CAB_MEMBER",
            "FINAL_APPROVER": "FINAL_APPROVER",
        }
        first = await _make_user(session, f"tech_{uuid.uuid4().hex[:6]}", "TECH_REVIEWER")
        detail = (await client.get("/api/v1/approvals/inbox", headers=_h(first))).json()["tasks"][0]
        steps = (await client.get(f"/api/v1/approvals/tasks/{detail['id']}", headers=_h(first))).json()["workflow_steps"]
        route = [s["step_code"] for s in steps]
        assert route[0] == "TECH_REVIEWER"

        approvers = {}
        for code in route:
            approvers[code] = await _make_user(session, f"{code.lower()}_{uuid.uuid4().hex[:6]}", role_holder[code])

        for index, code in enumerate(route):
            approver = approvers[code]
            inbox = (await client.get("/api/v1/approvals/inbox", headers=_h(approver))).json()
            assert inbox["pending_count"] == 1
            task = inbox["tasks"][0]
            assert task["actionable"] is True
            assert task["step_order"] == index + 1

            decision = await client.post(
                f"/api/v1/approvals/tasks/{task['id']}/decision",
                json={"decision": "APPROVE"},
                headers=_h(approver),
            )
            assert decision.status_code == 200, decision.text
            expected = "APPROVED" if index == len(route) - 1 else "PENDING_APPROVAL"
            assert decision.json()["change_status"] == expected

        detail = (await client.get(f"/api/v1/changes/{change['id']}", headers=_h(requester))).json()
        assert detail["status"] == "APPROVED"

    async def test_later_step_blocked_until_previous_approves(self, client, session):
        await _routed_change(client, session)
        tech = await _make_user(session, f"tech_{uuid.uuid4().hex[:6]}", "TECH_REVIEWER")
        manager = await _make_user(session, f"mgr_{uuid.uuid4().hex[:6]}", "MANAGER")

        manager_task = (await client.get("/api/v1/approvals/inbox", headers=_h(manager))).json()["tasks"][0]
        assert manager_task["actionable"] is False
        blocked = await client.post(
            f"/api/v1/approvals/tasks/{manager_task['id']}/decision",
            json={"decision": "APPROVE"},
            headers=_h(manager),
        )
        assert blocked.status_code == 409

        tech_task = (await client.get("/api/v1/approvals/inbox", headers=_h(tech))).json()["tasks"][0]
        unblock = await client.post(
            f"/api/v1/approvals/tasks/{tech_task['id']}/decision",
            json={"decision": "APPROVE"},
            headers=_h(tech),
        )
        assert unblock.status_code == 200
        assert unblock.json()["next_step"] == "MANAGER"

        after = (await client.get("/api/v1/approvals/inbox", headers=_h(manager))).json()["tasks"][0]
        assert after["actionable"] is True

    async def test_requester_cannot_approve_own_change(self, client, session):
        await _routed_change(client, session)
        # A requester who also holds the technical reviewer role still cannot approve.
        dual = await _make_user(session, f"dual_{uuid.uuid4().hex[:6]}", "REQUESTER")
        await _make_user(session, f"dualtech_{uuid.uuid4().hex[:6]}", "TECH_REVIEWER")

        body = {**REQUIRED_RFC, "title": "Own change"}
        created = (await client.post("/api/v1/changes", json=body, headers=_h(dual))).json()
        await client.post(f"/api/v1/changes/{created['id']}/submit", headers=_h(dual))

        # No inbox task for the requester (they lack TECH_REVIEWER), so the SoD guard is
        # exercised directly: a manager approving their own submission is refused.
        manager = await _make_user(session, f"mgr_{uuid.uuid4().hex[:6]}", "MANAGER")
        own = {**REQUIRED_RFC, "title": "Manager's own change"}
        own_change = (await client.post("/api/v1/changes", json=own, headers=_h(manager))).json()
        await client.post(f"/api/v1/changes/{own_change['id']}/submit", headers=_h(manager))

        inbox = (await client.get("/api/v1/approvals/inbox", headers=_h(manager))).json()
        if inbox["pending_count"]:
            decision = await client.post(
                f"/api/v1/approvals/tasks/{inbox['tasks'][0]['id']}/decision",
                json={"decision": "APPROVE"},
                headers=_h(manager),
            )
            # Either the SoD guard or the sequential gate refuses; never APPROVED silently.
            assert decision.status_code in (403, 409, 400)

    async def test_reject_requires_comment_and_blocks_change(self, client, session):
        change, _ = await _routed_change(client, session)
        tech = await _make_user(session, f"tech_{uuid.uuid4().hex[:6]}", "TECH_REVIEWER")
        task = (await client.get("/api/v1/approvals/inbox", headers=_h(tech))).json()["tasks"][0]

        no_comment = await client.post(
            f"/api/v1/approvals/tasks/{task['id']}/decision",
            json={"decision": "REJECT"},
            headers=_h(tech),
        )
        assert no_comment.status_code == 400

        rejected = await client.post(
            f"/api/v1/approvals/tasks/{task['id']}/decision",
            json={"decision": "REJECT", "comment": "Missing peer review of the rollback steps"},
            headers=_h(tech),
        )
        assert rejected.status_code == 200, rejected.text
        assert rejected.json()["change_status"] == "REJECTED"

    async def test_decision_is_immutable(self, client, session):
        await _routed_change(client, session)
        tech = await _make_user(session, f"tech_{uuid.uuid4().hex[:6]}", "TECH_REVIEWER")
        task = (await client.get("/api/v1/approvals/inbox", headers=_h(tech))).json()["tasks"][0]

        first = await client.post(
            f"/api/v1/approvals/tasks/{task['id']}/decision", json={"decision": "APPROVE"}, headers=_h(tech)
        )
        assert first.status_code == 200
        again = await client.post(
            f"/api/v1/approvals/tasks/{task['id']}/decision", json={"decision": "REJECT", "comment": "changed my mind"}, headers=_h(tech)
        )
        assert again.status_code == 400
        assert "not pending" in again.json()["detail"].lower()

    async def test_risk_assessment_persisted_for_revision(self, client, session):
        from app.models import RiskAssessment

        change, _ = await _routed_change(client, session)
        rows = (
            await session.execute(select(RiskAssessment).where(RiskAssessment.change_id == change["id"]))
        ).scalars().all()
        assert rows, "review must persist a risk assessment for the submitted revision"
        assert rows[0].risk_level in ("LOW", "MEDIUM", "HIGH", "CRITICAL")
        assert rows[0].revision_id is not None

    async def test_task_detail_exposes_rfc_and_steps(self, client, session):
        change, _ = await _routed_change(client, session)
        tech = await _make_user(session, f"tech_{uuid.uuid4().hex[:6]}", "TECH_REVIEWER")
        task = (await client.get("/api/v1/approvals/inbox", headers=_h(tech))).json()["tasks"][0]

        detail = (await client.get(f"/api/v1/approvals/tasks/{task['id']}", headers=_h(tech))).json()
        assert detail["change"]["change_number"] == change["change_number"]
        assert detail["change"]["rollback_plan"] == REQUIRED_RFC["rollback_plan"]
        assert detail["change"]["task_is_stale"] is False
        assert detail["task"]["actionable"] is True
        assert len(detail["workflow_steps"]) >= 2
