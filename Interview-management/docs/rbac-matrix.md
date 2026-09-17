# RBAC Matrix

| Capability | Administrator | Manager | TA | Panel |
|---|---|---|---|---|
| Manage users/groups | Yes | Yes | No | No |
| Manage departments/settings | Yes | No | No | No |
| View interviews | All | Assigned scope | Assigned/own | Own assigned |
| Manage candidates | All | Assigned scope | No | No |
| Schedule/reschedule/cancel | All | Assigned scope | No | No |
| Manage own availability | Yes | Yes | No | Yes |
| Submit feedback | Assigned panel | Assigned panel | Assigned panel | Own assigned |
| View reports | All | Assigned scope | No | No |
| View audit | All | Relevant scope | No | No |

Notes:
- Multi-group users get union of capabilities.
- Department/project and interview assignment restrictions still apply.
- Backend never trusts client-supplied role/user/scope identifiers.
- Frontend navigation and routes mirror this matrix: TA only sees the Interview
  Calendar, Interviews (view-only), My Schedule, and Pending Feedback; scheduling,
  candidate, requisition, panel, user, report, and audit pages are hidden from TA
  and Panel and enforced server-side via `Capability` checks in
  `backend/app/permissions.py`.

