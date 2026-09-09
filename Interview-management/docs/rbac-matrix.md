# RBAC Matrix

| Capability | Administrator | Manager | TA | Panel |
|---|---|---|---|---|
| Manage users/groups | Yes | No | No | No |
| Manage departments/settings | Yes | No | No | No |
| View interviews | All | Assigned scope | All | Own assigned |
| Manage candidates | All | Assigned scope | All | Minimal assigned |
| Schedule/reschedule/cancel | All | Assigned scope | All | No |
| Manage own availability | Yes | Yes | Yes | Yes |
| Submit feedback | Assigned panel | Assigned panel | Assigned panel | Own assigned |
| View reports | All | Assigned scope | All | Own workload |
| View audit | All | Relevant scope | Relevant scope | Own interview actions |

Notes:
- Multi-group users get union of capabilities.
- Department/project and interview assignment restrictions still apply.
- Backend never trusts client-supplied role/user/scope identifiers.

