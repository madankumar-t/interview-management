# RBAC Matrix

| Capability | Administrator | Manager | TA | Panel |
|---|---|---|---|---|
| Manage users/groups | Yes | Yes | No | No |
| Manage departments/settings | Yes | No | No | No |
| View interviews | All | Assigned scope | All | Own assigned |
| Manage candidates | All | Assigned scope | No | No |
| Schedule interviews | All | Assigned scope | All visible requisitions | No |
| Reschedule/cancel interviews | All | Assigned scope | No | No |
| Manage own availability | Yes | Yes | No | Yes |
| Submit feedback | All visible interviews | Assigned scope | All visible interviews | Own assigned |
| View reports | All | Assigned scope | No | No |
| View audit | All | Relevant scope | No | No |

Notes:
- Multi-group users get union of capabilities.
- Department/project and interview assignment restrictions still apply.
- Backend never trusts client-supplied role/user/scope identifiers.
- Frontend navigation and routes mirror this matrix: TA sees the Interview
  Calendar, Interviews, interview scheduling, My Schedule, and Pending Feedback.
  Candidate/requisition administration, panel administration, user management,
  reports, and audit pages remain hidden from TA and Panel and are enforced via
  `Capability` checks in
  `backend/app/permissions.py`.
