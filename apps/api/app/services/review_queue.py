"""Review job queuing: RQ in production, inline for tests/dev."""

from app.core.config import settings

QUEUE_NAME = "aicms"


def get_queue():
    """Redis-backed RQ queue, or None when reviews run inline."""
    if settings.review_mode == "inline":
        return None
    from redis import Redis
    from rq import Queue

    return Queue(QUEUE_NAME, connection=Redis.from_url(settings.redis_url))


def enqueue_review(review_job_id: str) -> str:
    """Hand a queued review job to the worker. Returns the queue ("rq" or "inline")."""
    queue = get_queue()
    if queue is None:
        return "inline"
    # Lazy import: the worker owns the DB session, the API only names the job.
    queue.enqueue("app.worker.jobs.run_review_job", review_job_id, job_timeout=600)
    return "rq"
