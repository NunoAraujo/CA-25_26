import os
import tempfile
from urllib.parse import urlparse

import httpx
from minio import Minio

_minio_client: Minio | None = None


def get_minio_client() -> Minio:
    global _minio_client

    if _minio_client is not None:
        return _minio_client

    endpoint = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
    parsed = urlparse(endpoint)
    host = parsed.netloc or parsed.path
    secure = parsed.scheme == "https"

    _minio_client = Minio(
        host,
        access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
        secret_key=os.getenv("MINIO_SECRET_KEY", "minioadmin"),
        secure=secure,
    )
    return _minio_client


def fetch_audio_to_tempfile(
    audio_object_key: str | None,
    audio_url: str,
    audio_format: str,
) -> str:
    output_dir = os.getenv("AUDIO_TEMP_DIR", "/tmp/audio-temp")
    os.makedirs(output_dir, exist_ok=True)

    suffix = f".{audio_format}" if audio_format and "." not in audio_format else ".wav"
    with tempfile.NamedTemporaryFile(
        delete=False,
        dir=output_dir,
        suffix=suffix,
    ) as temp_file:
        temp_path = temp_file.name

    if audio_object_key:
        bucket = os.getenv("MINIO_BUCKET", "journals")
        response = get_minio_client().get_object(bucket, audio_object_key)
        try:
            with open(temp_path, "wb") as output_file:
                output_file.write(response.read())
        finally:
            response.close()
            response.release_conn()
        return temp_path

    with httpx.Client(timeout=30.0) as client:
        response = client.get(audio_url)
        response.raise_for_status()
        with open(temp_path, "wb") as output_file:
            output_file.write(response.content)

    return temp_path
