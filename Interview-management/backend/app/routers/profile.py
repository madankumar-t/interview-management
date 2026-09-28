import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from app.auth import CurrentUser
from app.config import settings
from app.repository import DynamoRepository
from app.state import local_state

router = APIRouter(prefix="/profile", tags=["profile"])
MAX_PHOTO_BYTES = 2 * 1024 * 1024
PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _photo_key(sub: str) -> str:
    return f"profiles/{sub}/photo"


class ProfileUpdate(BaseModel):
    display_name: str = Field(min_length=1, max_length=100)


def _profile(user) -> dict:
    record = (local_state.users.get(user.sub, {}) if settings.demo_mode else DynamoRepository().get_user_profile(user.sub)) or {}
    return {
        "display_name": record.get("display_name") or "",
        "email": user.email or "",
        "has_photo": record.get("has_photo", False),
    }


@router.get("/me")
def get_profile(user=CurrentUser):
    return _profile(user)


@router.put("/me")
def update_profile(payload: ProfileUpdate, user=CurrentUser):
    name = payload.display_name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Display name is required")
    if settings.demo_mode:
        local_state.users.setdefault(user.sub, {})["display_name"] = name
    else:
        DynamoRepository().update_self_profile(user.sub, name)
    return _profile(user)


@router.put("/me/photo")
async def upload_photo(request: Request, user=CurrentUser):
    content_type = request.headers.get("content-type", "").split(";")[0].lower()
    photo = await request.body()
    signatures = {
        "image/jpeg": photo.startswith(b"\xff\xd8\xff"),
        "image/png": photo.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": photo.startswith(b"RIFF") and photo[8:12] == b"WEBP",
    }
    if content_type not in PHOTO_TYPES or not photo or len(photo) > MAX_PHOTO_BYTES or not signatures[content_type]:
        raise HTTPException(status_code=422, detail="Upload a JPEG, PNG, or WebP image up to 2 MB")
    if settings.demo_mode:
        local_state.users.setdefault(user.sub, {}).update({"photo": photo, "photo_content_type": content_type, "has_photo": True})
    else:
        boto3.client("s3", region_name=settings.aws_region).put_object(
            Bucket=settings.documents_bucket, Key=_photo_key(user.sub), Body=photo, ContentType=content_type,
        )
        DynamoRepository().set_profile_photo_type(user.sub, content_type)
    return {"has_photo": True}


@router.get("/me/photo")
def get_photo(user=CurrentUser):
    if settings.demo_mode:
        record = local_state.users.get(user.sub, {})
        if not record.get("photo"):
            raise HTTPException(status_code=404, detail="Photo not found")
        return Response(content=record["photo"], media_type=record["photo_content_type"], headers={"Cache-Control": "private, no-store"})
    record = DynamoRepository().get_user_profile(user.sub) or {}
    if not record.get("has_photo"):
        raise HTTPException(status_code=404, detail="Photo not found")
    try:
        result = boto3.client("s3", region_name=settings.aws_region).get_object(
            Bucket=settings.documents_bucket, Key=_photo_key(user.sub)
        )
    except ClientError as exc:
        raise HTTPException(status_code=404, detail="Photo not found") from exc
    return Response(content=result["Body"].read(), media_type=result["ContentType"], headers={"Cache-Control": "private, no-store"})


@router.delete("/me/photo")
def delete_photo(user=CurrentUser):
    if settings.demo_mode:
        record = local_state.users.setdefault(user.sub, {})
        record.pop("photo", None)
        record.pop("photo_content_type", None)
        record["has_photo"] = False
    else:
        boto3.client("s3", region_name=settings.aws_region).delete_object(Bucket=settings.documents_bucket, Key=_photo_key(user.sub))
        DynamoRepository().set_profile_photo_type(user.sub, "")
    return {"has_photo": False}