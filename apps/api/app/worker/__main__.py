"""RQ worker entrypoint: `python -m app.worker`.

Listens on the "aicms" queue and dispatches by dotted path, so the API only
enqueues `app.worker.jobs.run_review_job`.
"""

import sys

from redis import Redis
from rq import Queue, Worker

from app.core.config import settings


def main() -> int:
    connection = Redis.from_url(settings.redis_url)
    queue = Queue("aicms", connection=connection)
    worker = Worker([queue], connection=connection)
    worker.work(with_scheduler=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
