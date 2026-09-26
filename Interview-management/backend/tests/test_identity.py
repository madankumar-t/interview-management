from app.identity import CognitoAdmin


class FakeCognitoClient:
    def __init__(self):
        self.group_usernames: list[str] = []
        self.reset_usernames: list[str] = []
        self.resend_requests: list[dict] = []

    def list_users(self, **_kwargs):
        return {
            "Users": [
                {
                    "Username": "cognito-user@example.com",
                    "Attributes": [
                        {"Name": "sub", "Value": "stable-user-sub"},
                        {"Name": "email", "Value": "user@example.com"},
                        {"Name": "email_verified", "Value": "true"},
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

    def admin_create_user(self, **kwargs):
        self.resend_requests.append(kwargs)


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
    assert users[0]["email_verified"] is True


def test_reset_user_password_uses_cognito_username():
    client = FakeCognitoClient()
    admin = CognitoAdmin.__new__(CognitoAdmin)
    admin.client = client
    admin.user_pool_id = "pool-id"

    admin.reset_user_password("cognito-user@example.com")

    assert client.reset_usernames == ["cognito-user@example.com"]


def test_resend_user_invitation_uses_cognito_resend_action():
    client = FakeCognitoClient()
    admin = CognitoAdmin.__new__(CognitoAdmin)
    admin.client = client
    admin.user_pool_id = "pool-id"

    admin.resend_user_invitation("cognito-user@example.com")

    assert client.resend_requests == [{
        "UserPoolId": "pool-id",
        "Username": "cognito-user@example.com",
        "MessageAction": "RESEND",
        "DesiredDeliveryMediums": ["EMAIL"],
    }]