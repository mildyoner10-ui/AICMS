import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.db.session import Base


# ── Enums ────────────────────────────────────────────────────────────────────


class UserRoleCode(str, enum.Enum):
    REQUESTER = "REQUESTER"
    ENGINEER = "ENGINEER"
    TECH_REVIEWER = "TECH_REVIEWER"
    MANAGER = "MANAGER"
    CHANGE_MANAGER = "CHANGE_MANAGER"
    CAB_MEMBER = "CAB_MEMBER"
    FINAL_APPROVER = "FINAL_APPROVER"
    AUDITOR = "AUDITOR"
    ADMIN = "ADMIN"
    AI_ADMIN = "AI_ADMIN"


class ChangeStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    DOCUMENT_VALIDATION = "DOCUMENT_VALIDATION"
    AI_REVIEW = "AI_REVIEW"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    SCHEDULED = "SCHEDULED"
    IN_PROGRESS = "IN_PROGRESS"
    VALIDATION = "VALIDATION"
    COMPLETED = "COMPLETED"
    CLOSED = "CLOSED"
    # Exception states
    REVISION_REQUIRED = "REVISION_REQUIRED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    FAILED = "FAILED"
    ROLLED_BACK = "ROLLED_BACK"
    REVIEW_FAILED = "REVIEW_FAILED"
    STALE = "STALE"


class ChangeType(str, enum.Enum):
    STANDARD = "STANDARD"
    NORMAL = "NORMAL"
    EMERGENCY = "EMERGENCY"


class ChangeCategory(str, enum.Enum):
    HEAD_OFFICE = "HEAD_OFFICE"
    CHANNEL = "CHANNEL"
    BRANCH_OFFICE = "BRANCH_OFFICE"
    OTHER = "OTHER"


class Environment(str, enum.Enum):
    PRODUCTION = "PRODUCTION"
    STAGING = "STAGING"
    TEST = "TEST"
    DEVELOPMENT = "DEVELOPMENT"


class DocumentType(str, enum.Enum):
    MOP = "MOP"
    CRF = "CRF"
    BEFORE_CONFIG = "BEFORE_CONFIG"
    AFTER_CONFIG = "AFTER_CONFIG"
    ROLLBACK_PLAN = "ROLLBACK_PLAN"
    TEST_PLAN = "TEST_PLAN"
    COMMUNICATION_PLAN = "COMMUNICATION_PLAN"
    IMPACT_ANALYSIS = "IMPACT_ANALYSIS"
    OTHER = "OTHER"


class DocumentScanStatus(str, enum.Enum):
    PENDING = "PENDING"
    SCANNING = "SCANNING"
    CLEAN = "CLEAN"
    FAILED = "FAILED"
    ERROR = "ERROR"


class DocumentExtractionStatus(str, enum.Enum):
    PENDING = "PENDING"
    EXTRACTING = "EXTRACTING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    ERROR = "ERROR"


class ReviewStatus(str, enum.Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    STALE = "STALE"


class ReviewRecommendation(str, enum.Enum):
    RECOMMEND_APPROVE = "RECOMMEND_APPROVE"
    RECOMMEND_APPROVE_WITH_CONDITIONS = "RECOMMEND_APPROVE_WITH_CONDITIONS"
    REQUEST_REVISION = "REQUEST_REVISION"
    NOT_RECOMMENDED = "NOT_RECOMMENDED"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"


class ReviewDecision(str, enum.Enum):
    ACCEPT = "ACCEPT"
    RETURN_FOR_REVISION = "RETURN_FOR_REVISION"


class FindingStatus(str, enum.Enum):
    PASS = "PASS"
    WARN = "WARN"
    FAIL = "FAIL"
    NOT_ASSESSED = "NOT_ASSESSED"


class FindingSeverity(str, enum.Enum):
    INFO = "INFO"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ApprovalTaskStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    REVISION_REQUESTED = "REVISION_REQUESTED"
    CANCELLED = "CANCELLED"
    DELEGATED = "DELEGATED"


class ApprovalDecision(str, enum.Enum):
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    REQUEST_REVISION = "REQUEST_REVISION"


class WorkflowInstanceStatus(str, enum.Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class ImplementationOutcome(str, enum.Enum):
    SUCCESSFUL = "SUCCESSFUL"
    SUCCESSFUL_WITH_DEVIATION = "SUCCESSFUL_WITH_DEVIATION"
    FAILED = "FAILED"
    ROLLED_BACK = "ROLLED_BACK"


class AuditActorType(str, enum.Enum):
    USER = "USER"
    SYSTEM = "SYSTEM"
    AI = "AI"


# ── Models ───────────────────────────────────────────────────────────────────


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    display_name = Column(String(200), nullable=True)
    hashed_password = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    auth_provider = Column(String(50), default="local")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    roles = relationship("UserRole", back_populates="user")
    changes_as_requester = relationship("Change", back_populates="requester", foreign_keys="Change.requester_id")
    audit_events = relationship("AuditEvent", back_populates="actor_user")
    created_revisions = relationship("ChangeRevision", back_populates="creator")

    @property
    def role_codes(self) -> list[str]:
        return [ur.role.code for ur in self.roles if ur.role]


class Role(Base):
    __tablename__ = "roles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)


class UserRole(Base):
    __tablename__ = "user_roles"
    __table_args__ = (
        UniqueConstraint("user_id", "role_id", "scope_type", "scope_id", name="uq_user_role_scope"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=False)
    scope_type = Column(String(50), nullable=True)
    scope_id = Column(UUID(as_uuid=True), nullable=True)

    user = relationship("User", back_populates="roles")
    role = relationship("Role")


class Change(Base):
    __tablename__ = "changes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    change_number = Column(String(50), unique=True, nullable=False, index=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(Enum(ChangeCategory), nullable=False)
    change_type = Column(Enum(ChangeType), nullable=False, default=ChangeType.NORMAL)
    business_justification = Column(Text, nullable=True)
    affected_services = Column(JSONB, default=list)
    affected_devices = Column(JSONB, default=list)
    environment = Column(Enum(Environment), nullable=False, default=Environment.TEST)
    implementation_start = Column(DateTime(timezone=True), nullable=True)
    implementation_end = Column(DateTime(timezone=True), nullable=True)
    impact_description = Column(Text, nullable=True)
    implementation_plan = Column(Text, nullable=True)
    test_plan = Column(Text, nullable=True)
    rollback_plan = Column(Text, nullable=True)
    communication_plan = Column(Text, nullable=True)
    requester_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    status = Column(Enum(ChangeStatus), default=ChangeStatus.DRAFT, index=True)
    approved_revision_id = Column(UUID(as_uuid=True), ForeignKey("change_revisions.id"), nullable=True)
    emergency_justification = Column(Text, nullable=True)
    emergency_incident_ref = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    # Soft delete: hidden from lists, but audit and FKs stay intact.
    deleted_at = Column(DateTime(timezone=True), nullable=True, index=True)
    deleted_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    requester = relationship("User", back_populates="changes_as_requester", foreign_keys=[requester_id])
    revisions = relationship(
        "ChangeRevision",
        back_populates="change",
        cascade="all, delete-orphan",
        foreign_keys="[ChangeRevision.change_id]",
    )
    status_transitions = relationship(
        "ChangeStatusTransition",
        back_populates="change",
        cascade="all, delete-orphan",
        order_by="ChangeStatusTransition.occurred_at",
    )
    documents = relationship("Document", back_populates="change", cascade="all, delete-orphan")
    review_jobs = relationship("ReviewJob", back_populates="change", cascade="all, delete-orphan")
    risk_assessments = relationship("RiskAssessment", back_populates="change", cascade="all, delete-orphan")
    workflow_instances = relationship("WorkflowInstance", back_populates="change", cascade="all, delete-orphan")
    implementation_records = relationship("ImplementationRecord", back_populates="change", cascade="all, delete-orphan")
    current_revision = relationship(
        "ChangeRevision",
        primaryjoin="and_(ChangeRevision.change_id==Change.id, ChangeRevision.is_current==True)",
        uselist=False,
        foreign_keys="[ChangeRevision.change_id]",
        viewonly=True,
    )


class ChangeRevision(Base):
    __tablename__ = "change_revisions"
    __table_args__ = (
        UniqueConstraint("change_id", "revision_number", name="uq_change_revision"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    change_id = Column(UUID(as_uuid=True), ForeignKey("changes.id"), nullable=False, index=True)
    revision_number = Column(Integer, nullable=False)
    snapshot = Column(JSONB, nullable=False)
    content_hash = Column(String(64), nullable=True)
    is_current = Column(Boolean, default=True)
    locked_at = Column(DateTime(timezone=True), nullable=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    change = relationship("Change", back_populates="revisions", foreign_keys=[change_id])
    creator = relationship("User", foreign_keys=[created_by_id])
    documents = relationship("Document", back_populates="revision")
    review_jobs = relationship("ReviewJob", back_populates="revision", cascade="all, delete-orphan")
    risk_assessments = relationship("RiskAssessment", back_populates="revision", cascade="all, delete-orphan")


class ChangeStatusTransition(Base):
    """Append-only status timeline for a change."""

    __tablename__ = "change_status_transitions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    change_id = Column(UUID(as_uuid=True), ForeignKey("changes.id"), nullable=False, index=True)
    revision_id = Column(UUID(as_uuid=True), ForeignKey("change_revisions.id"), nullable=True)
    from_status = Column(Enum(ChangeStatus), nullable=True)
    to_status = Column(Enum(ChangeStatus), nullable=False)
    reason = Column(Text, nullable=True)
    actor_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    actor_type = Column(String(20), nullable=False, default="USER")
    occurred_at = Column(DateTime(timezone=True), server_default=func.now())

    change = relationship("Change", back_populates="status_transitions")


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        UniqueConstraint("change_id", "original_filename", "version_number", name="uq_doc_filename_version"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    change_id = Column(UUID(as_uuid=True), ForeignKey("changes.id"), nullable=False, index=True)
    revision_id = Column(UUID(as_uuid=True), ForeignKey("change_revisions.id"), nullable=True)
    original_filename = Column(String(500), nullable=False)
    object_key = Column(String(1000), nullable=False)
    mime_type = Column(String(100), nullable=True)
    size_bytes = Column(Integer, nullable=False)
    sha256 = Column(String(64), nullable=False, index=True)
    document_type = Column(Enum(DocumentType), nullable=True)
    version_number = Column(Integer, nullable=False, default=1)
    scan_status = Column(Enum(DocumentScanStatus), default=DocumentScanStatus.PENDING)
    extraction_status = Column(Enum(DocumentExtractionStatus), default=DocumentExtractionStatus.PENDING)
    uploaded_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())

    change = relationship("Change", back_populates="documents")
    revision = relationship("ChangeRevision", back_populates="documents")
    uploader = relationship("User", foreign_keys=[uploaded_by_id])


class ReviewJob(Base):
    __tablename__ = "review_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    change_id = Column(UUID(as_uuid=True), ForeignKey("changes.id"), nullable=False, index=True)
    revision_id = Column(UUID(as_uuid=True), ForeignKey("change_revisions.id"), nullable=False)
    status = Column(Enum(ReviewStatus), default=ReviewStatus.QUEUED, index=True)
    provider = Column(String(100), nullable=True)
    model_name = Column(String(100), nullable=True)
    prompt_version = Column(String(50), nullable=True)
    ruleset_version = Column(String(50), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    error_code = Column(String(100), nullable=True)
    error_message = Column(Text, nullable=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    change = relationship("Change", back_populates="review_jobs")
    revision = relationship("ChangeRevision", back_populates="review_jobs")
    creator = relationship("User", foreign_keys=[created_by_id])
    result = relationship("ReviewResult", back_populates="job", uselist=False, cascade="all, delete-orphan")


class ReviewResult(Base):
    __tablename__ = "review_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    review_job_id = Column(UUID(as_uuid=True), ForeignKey("review_jobs.id"), nullable=False, unique=True)
    recommendation = Column(Enum(ReviewRecommendation), nullable=True)
    overall_risk_score = Column(Float, nullable=True)
    summary = Column(Text, nullable=True)
    limitations = Column(JSONB, default=list)
    result_json = Column(JSONB, nullable=True)
    formula_version = Column(String(50), nullable=True)
    # Human verification of the AI result. The AI output stays untouched.
    decision = Column(Enum(ReviewDecision), nullable=True)
    decision_comment = Column(Text, nullable=True)
    decided_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    decided_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    job = relationship("ReviewJob", back_populates="result")
    decided_by = relationship("User", foreign_keys=[decided_by_id])
    findings = relationship("Finding", back_populates="result", cascade="all, delete-orphan")


class Finding(Base):
    __tablename__ = "findings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    review_result_id = Column(UUID(as_uuid=True), ForeignKey("review_results.id"), nullable=False, index=True)
    check_category = Column(String(50), nullable=False)
    check_name = Column(String(200), nullable=True)
    status = Column(Enum(FindingStatus), nullable=False)
    severity = Column(Enum(FindingSeverity), nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    evidence = Column(JSONB, default=list)
    remediation = Column(Text, nullable=True)
    confidence = Column(Float, nullable=True)
    human_validation_required = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    result = relationship("ReviewResult", back_populates="findings")


class RiskAssessment(Base):
    __tablename__ = "risk_assessments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    change_id = Column(UUID(as_uuid=True), ForeignKey("changes.id"), nullable=False, index=True)
    revision_id = Column(UUID(as_uuid=True), ForeignKey("change_revisions.id"), nullable=True)
    formula_version = Column(String(50), nullable=False, default="v1")
    score = Column(Float, nullable=False)
    risk_level = Column(String(20), nullable=False)
    factors = Column(JSONB, nullable=False, default=dict)
    hard_blockers = Column(JSONB, default=list)
    calculated_at = Column(DateTime(timezone=True), server_default=func.now())

    change = relationship("Change", back_populates="risk_assessments")
    revision = relationship("ChangeRevision", back_populates="risk_assessments")


class WorkflowDefinition(Base):
    __tablename__ = "workflow_definitions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    version = Column(String(20), nullable=False, default="1")
    enabled = Column(Boolean, default=True)
    routing_rules = Column(JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class WorkflowInstance(Base):
    __tablename__ = "workflow_instances"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    change_id = Column(UUID(as_uuid=True), ForeignKey("changes.id"), nullable=False, index=True)
    revision_id = Column(UUID(as_uuid=True), ForeignKey("change_revisions.id"), nullable=True)
    workflow_definition_id = Column(UUID(as_uuid=True), ForeignKey("workflow_definitions.id"), nullable=True)
    status = Column(Enum(WorkflowInstanceStatus), default=WorkflowInstanceStatus.PENDING)
    current_step = Column(String(100), nullable=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    change = relationship("Change", back_populates="workflow_instances")
    tasks = relationship(
        "ApprovalTask",
        back_populates="workflow_instance",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class ApprovalTask(Base):
    __tablename__ = "approval_tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_instance_id = Column(UUID(as_uuid=True), ForeignKey("workflow_instances.id"), nullable=False, index=True)
    revision_id = Column(
        UUID(as_uuid=True), ForeignKey("change_revisions.id", ondelete="SET NULL"), nullable=True
    )
    step_code = Column(String(100), nullable=False)
    step_order = Column(Integer, default=0)
    assigned_role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=True)
    assigned_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    status = Column(Enum(ApprovalTaskStatus), default=ApprovalTaskStatus.PENDING, index=True)
    due_at = Column(DateTime(timezone=True), nullable=True)
    decided_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    decision = Column(Enum(ApprovalDecision), nullable=True)
    comment = Column(Text, nullable=True)
    decided_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    workflow_instance = relationship("WorkflowInstance", back_populates="tasks")
    approver = relationship("User", foreign_keys=[assigned_user_id], lazy="selectin")
    decision_by = relationship("User", foreign_keys=[decided_by_id])


class ImplementationRecord(Base):
    __tablename__ = "implementation_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    change_id = Column(UUID(as_uuid=True), ForeignKey("changes.id"), nullable=False, unique=True)
    actual_start = Column(DateTime(timezone=True), nullable=True)
    actual_end = Column(DateTime(timezone=True), nullable=True)
    implementer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    outcome = Column(Enum(ImplementationOutcome), nullable=True)
    execution_notes = Column(Text, nullable=True)
    precheck = Column(JSONB, default=dict)
    postcheck = Column(JSONB, default=dict)
    rollback_performed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    change = relationship("Change", back_populates="implementation_records")
    implementer = relationship("User", foreign_keys=[implementer_id])


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    actor_type = Column(String(20), nullable=False, default=AuditActorType.USER.value)
    action = Column(String(100), nullable=False, index=True)
    object_type = Column(String(50), nullable=False, index=True)
    object_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    correlation_id = Column(String(100), nullable=True, index=True)
    event_data = Column(JSONB, default=dict)
    occurred_at = Column(DateTime(timezone=True), server_default=func.now())

    actor_user = relationship("User", foreign_keys=[actor_user_id])


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recipient_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    channel = Column(String(50), nullable=False, default="console")
    template_code = Column(String(100), nullable=True)
    payload = Column(JSONB, default=dict)
    status = Column(String(20), default="PENDING")
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
