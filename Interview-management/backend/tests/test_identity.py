from app.identity import CognitoAdmin


class FakeCognitoClient:
    def __init__(self):
        self.group_usernames: list[str] = []
        self.reset_usernames: list[str] = []

    def list_users(self, **_kwargs):
        return {
            "Users": [
                {
                    "Username": "cognito-user@example.com",
                    "Attributes": [
                        {"Name": "sub", "Value": "stable-user-sub"},
                        {"Name": "email", "Value": "user@example.com"},
                    ],
                    "Enabled": True,
                    "UserStatus": "CONFIRMED",
                }
            ]
        }

    def admin_list_groups_for_user(self, **kwargs):
        self.group_usernames.append(kwargs["Username"])
        return {"Groups": [{"GroupName": "Administrator"}]}

    def admin_reset_user_password(self, **kwargs):
        self.reset_usernames.append(kwargs["Username"])


def test_list_users_uses_cognito_username_for_group_lookup():
    client = FakeCognitoClient()
    admin = CognitoAdmin.__new__(CognitoAdmin)
    admin.client = client
    admin.user_pool_id = "pool-id"

    users = admin.list_users()

    assert client.group_usernames == ["cognito-user@example.com"]
    assert users[0]["username"] == "cognito-user@example.com"
    assert users[0]["sub"] == "stable-user-sub"
    assert users[0]["groups"] == ["Administrator"]


def test_reset_user_password_uses_cognito_username():
    client = FakeCognitoClient()
    admin = CognitoAdmin.__new__(CognitoAdmin)
    admin.client = client
    admin.user_pool_id = "pool-id"

    admin.reset_user_password("cognito-user@example.com")

    assert client.reset_usernames == ["cognito-user@example.com"]