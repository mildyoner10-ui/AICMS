from typing import Protocol


class StorageAdapter(Protocol):
    def put(self, key: str, data: bytes) -> None: ...
    def get(self, key: str) -> bytes: ...
    def exists(self, key: str) -> bool: ...
    def delete(self, key: str) -> None: ...


class LocalStorageAdapter:
    """Dev backend: private dir on disk. No network, no auth needed."""

    def __init__(self, base_path: str):
        import pathlib

        self.base = pathlib.Path(base_path)
        self.base.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str):
        import pathlib

        # ponytail: traversal guard is the one non-negotiable here.
        p = (self.base / key).resolve()
        if not p.is_relative_to(self.base.resolve()):
            raise ValueError("Invalid storage key")
        return p

    def put(self, key: str, data: bytes) -> None:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)


class S3StorageAdapter:
    """S3/MinIO via minio client. Kept for prod; unused when STORAGE_BACKEND=local."""

    def __init__(self, endpoint, access_key, secret_key, bucket, use_ssl):
        from minio import Minio

        self.bucket = bucket
        self.client = Minio(endpoint, access_key, secret_key, secure=use_ssl)
        if not self.client.bucket_exists(bucket):
            self.client.make_bucket(bucket)

    def put(self, key: str, data: bytes) -> None:
        import io

        self.client.put_object(self.bucket, key, io.BytesIO(data), len(data))

    def get(self, key: str) -> bytes:
        resp = self.client.get_object(self.bucket, key)
        try:
            return resp.read()
        finally:
            resp.close()

    def exists(self, key: str) -> bool:
        from minio.error import S3Error

        try:
            self.client.stat_object(self.bucket, key)
            return True
        except S3Error:
            return False

    def delete(self, key: str) -> None:
        self.client.remove_object(self.bucket, key)


def get_storage() -> StorageAdapter:
    from app.core.config import settings

    if settings.storage_backend == "local":
        return LocalStorageAdapter(settings.storage_local_path)
    return S3StorageAdapter(
        settings.minio_endpoint,
        settings.minio_access_key,
        settings.minio_secret_key,
        settings.minio_bucket,
        settings.minio_use_ssl,
    )
