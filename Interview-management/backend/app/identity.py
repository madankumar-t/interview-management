from __future__ import annotations

from typing import Any

import boto3
from botocore.exceptions import ClientError

from app.config import settings


class CognitoAdminError(Exception):
    pass


class CognitoAdmin:
    def __init__(self) -> None:
        self.client = boto3.client("cognito-idp", region_name=settings.aws_region)
        self.user_pool_id = settings.cognito_user_pool_id

    def create_user(self, email: str, full_name: str | None) -> dict[str, Any]:
        attributes = [{"Name": "email", "Value": email}, {"Name": "email_verified", "Value": "true"}]
        if full_name:
            attributes.append({"Name": "name", "Value": full_name})
        try:
            response = self.client.admin_create_user(
                UserPoolId=self.user_pool_id,
                Username=email,
                UserAttributes=attributes,
                DesiredDeliveryMediums=["EMAIL"],
            )
        except ClientError as exc:
            raise CognitoAdminError(exc.response["Error"].get("Message", str(exc))) from exc
        user = response["User"]
        sub = next(a["Value"] for a in user["Attributes"] if a["Name"] == "sub")
        return {
            "sub": sub,
            "username": user["Username"],
            "email": email,
            "full_name": full_name or "",
            "enabled": user.get("Enabled", True),
            "cognito_status": user["UserStatus"],
        }

    def add_to_group(self, username: str, group: str) -> None:
        self.client.admin_add_user_to_group(UserPoolId=self.user_pool_id, Username=username, GroupName=group)

    def remove_from_group(self, username: str, group: str) -> None:
        self.client.admin_remove_user_from_group(UserPoolId=self.user_pool_id, Username=username, GroupName=group)

    def groups_for_user(self, username: str) -> list[str]:
        response = self.client.admin_list_groups_for_user(UserPoolId=self.user_pool_id, Username=username)
        return [group["GroupName"] for group in response.get("Groups", [])]

    def set_groups(self, username: str, groups: list[str]) -> None:
        current = set(self.groups_for_user(username))
        target = set(groups)
        for group in current - target:
            self.remove_from_group(username, group)
        for group in target - current:
            self.add_to_group(username, group)

    def disable_user(self, username: str) -> None:
        self.client.admin_disable_user(UserPoolId=self.user_pool_id, Username=username)

    def enable_user(self, username: str) -> None:
        self.client.admin_enable_user(UserPoolId=self.user_pool_id, Username=username)

    def list_users(self) -> list[dict[str, Any]]:
        users: list[dict[str, Any]] = []
        pagination_token: str | None = None
        while True:
            kwargs: dict[str, Any] = {"UserPoolId": self.user_pool_id, "Limit": 60}
            if pagination_token:
                kwargs["PaginationToken"] = pagination_token
            response = self.client.list_users(**kwargs)
            for user in response.get("Users", []):
                attrs = {a["Name"]: a["Value"] for a in user.get("Attributes", [])}
                sub = attrs.get("sub", "")
                users.append(
                    {
                        "sub": sub,
                        "username": user["Username"],
                        "email": attrs.get("email", user["Username"]),
                        "full_name": attrs.get("name", ""),
                        "enabled": user.get("Enabled", True),
                        "cognito_status": user.get("UserStatus", ""),
                        "groups": self.groups_for_user(user["Username"]),
                    }
                )
            pagination_token = response.get("PaginationToken")
            if not pagination_token:
                break
        return users
