from fastapi.testclient import TestClient

from app import config
from app.auth import get_current_user
from app.main import app
from app.models import AuthContext, Role
from app.state import local_state


def test_panel_updates_only_own_display_name(monkeypatch):
    async def panel_user():
        return AuthContext(sub="panel-1", email="panel@example.com", groups={Role.PANEL}, token_use="access")

    monkeypatch.setattr(config.settings, "demo_mode", True)
    monkeypatch.setattr(local_state, "users", {"panel-1": {}, "panel-2": {"display_name": "Other"}})
    app.dependency_overrides[get_current_user] = panel_user
    try:
        client = TestClient(app)
        response = client.put("/profile/me", json={"display_name": "  Panel Member  "})
        assert response.status_code == 200
        assert response.json()["display_name"] == "Panel Member"
        assert client.get("/profile/me").json()["display_name"] == "Panel Member"
        assert local_state.users["panel-2"]["display_name"] == "Other"
        assert client.put("/profile/me", json={"display_name": "   "}).status_code == 422
        photo = b"\x89PNG\r\n\x1a\n" + b"image data"
        assert client.put("/profile/me/photo", content=photo, headers={"Content-Type": "image/png"}).status_code == 200
        downloaded = client.get("/profile/me/photo")
        assert downloaded.content == photo
        assert downloaded.headers["content-type"] == "image/png"
        assert local_state.users["panel-2"].get("photo") is None
        assert client.put("/profile/me/photo", content=b"not an image", headers={"Content-Type": "image/png"}).status_code == 422
        assert client.put("/profile/me/photo", content=b"\xff\xd8\xff" + b"x" * (2 * 1024 * 1024), headers={"Content-Type": "image/jpeg"}).status_code == 422
        assert client.delete("/profile/me/photo").json() == {"has_photo": False}
        assert client.get("/profile/me/photo").status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_photo_uses_authenticated_users_private_object(monkeypatch):
    class FakeRepo:
        photo_type = ""

        def set_profile_photo_type(self, sub, content_type):
            assert sub == "panel-1"
            FakeRepo.photo_type = content_type

        def get_user_profile(self, sub):
            assert sub == "panel-1"
            return {"has_photo": bool(FakeRepo.photo_type)}

    class FakeS3:
        stored = None

        def put_object(self, **kwargs):
            FakeS3.stored = kwargs

        def get_object(self, **kwargs):
            assert kwargs == {"Bucket": "private-documents", "Key": "profiles/panel-1/photo"}
            from io import BytesIO
            return {"Body": BytesIO(FakeS3.stored["Body"]), "ContentType": FakeRepo.photo_type}

    async def panel_user():
        return AuthContext(sub="panel-1", email="panel@example.com", groups={Role.PANEL}, token_use="access")

    monkeypatch.setattr(config.settings, "demo_mode", False)
    monkeypatch.setattr(config.settings, "documents_bucket", "private-documents")
    monkeypatch.setattr("app.routers.profile.DynamoRepository", FakeRepo)
    monkeypatch.setattr("app.routers.profile.boto3.client", lambda *_args, **_kwargs: FakeS3())
    app.dependency_overrides[get_current_user] = panel_user
    try:
        client = TestClient(app)
        image = b"\xff\xd8\xffphoto"
        assert client.put("/profile/me/photo", content=image, headers={"Content-Type": "image/jpeg"}).status_code == 200
        assert FakeS3.stored == {
            "Bucket": "private-documents", "Key": "profiles/panel-1/photo", "Body": image, "ContentType": "image/jpeg",
        }
        assert client.get("/profile/me/photo").content == image
    finally:
        app.dependency_overrides.clear()