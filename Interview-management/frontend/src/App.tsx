import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { CandidatesPage } from "./pages/CandidatesPage";
import { CandidateListPage } from "./pages/CandidateListPage";
import { RequisitionsPage } from "./pages/RequisitionsPage";
import { RequisitionListPage } from "./pages/RequisitionListPage";
import { PanelsPage } from "./pages/PanelsPage";
import { PanelListPage } from "./pages/PanelListPage";
import { InterviewsPage } from "./pages/InterviewsPage";
import { ScheduleInterviewPage } from "./pages/ScheduleInterviewPage";
import { CalendarPage } from "./pages/CalendarPage";
import { MySchedulePage } from "./pages/MySchedulePage";
import { FeedbackPage } from "./pages/FeedbackPage";
import { PendingFeedbackPage } from "./pages/PendingFeedbackPage";
import { MyAvailabilityPage } from "./pages/MyAvailabilityPage";
import { UsersPage } from "./pages/UsersPage";
import { AuditPage } from "./pages/AuditPage";
import { SimplePage } from "./pages/SimplePage";
import { ReportsPage } from "./pages/ReportsPage";
import { config } from "./lib/config";
import { getSession, handleAuthCallback, login, SESSION_EXPIRED_EVENT } from "./lib/auth";
import { hasAnyRole, ROLE_HOME } from "./lib/roles";
import type { Role, UserSession } from "./types/auth";

function RoleRoute({ session, roles, children }: { session: UserSession; roles: Role[]; children: JSX.Element }) {
  return hasAnyRole(session, roles) ? children : <Navigate to={ROLE_HOME[session.groups[0] ?? "Panel"]} replace />;
}

function App() {
  const [session, setSession] = useState(() => getSession());
  const [sessionExpired, setSessionExpired] = useState(false);
  const isAdmin = useMemo(() => session?.groups.includes("Administrator"), [session]);
  useEffect(() => {
    function onSessionExpired() {
      setSessionExpired(true);
      setSession(null);
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
  }, []);
  useEffect(() => {
    if (config.demoMode) {
      if (!session || !session.groups.includes("Administrator")) {
        login();
        setSession(getSession());
      }
      return;
    }
    if (session) {
      return;
    }
    handleAuthCallback().then((next) => {
      if (next) {
        setSessionExpired(false);
        setSession(next);
      }
    });
  }, [session]);
  if (!session) {
    return (
      <main className="mx-auto mt-20 max-w-lg rounded border bg-white p-8 text-center">
        <h1 className="mb-2 text-2xl font-semibold">Interview Management</h1>
        <p className="mb-4 text-slate-600">
          {sessionExpired ? "Your session has expired. Please log in again." : "Sign in with Cognito to continue."}
        </p>
        <button
          className="rounded bg-indigo-600 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          onClick={() => {
            login();
          }}
        >
          Login
        </button>
      </main>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout session={session} onLogout={() => setSession(null)} />}>
          <Route path="/" element={<RoleRoute session={session} roles={["Administrator", "Manager"]}><DashboardPage /></RoleRoute>} />
          <Route path="/calendar" element={<RoleRoute session={session} roles={["Administrator", "Manager", "TA", "Panel"]}><CalendarPage groups={session.groups} /></RoleRoute>} />
          <Route path="/interviews" element={<RoleRoute session={session} roles={["Administrator", "Manager", "TA", "Panel"]}><InterviewsPage groups={session.groups} /></RoleRoute>} />
          <Route path="/interviews/new" element={<RoleRoute session={session} roles={["Administrator", "Manager", "TA"]}><ScheduleInterviewPage /></RoleRoute>} />
          <Route path="/interviews/:interviewId/feedback" element={<RoleRoute session={session} roles={["Administrator", "Manager", "TA", "Panel"]}><FeedbackPage session={session} /></RoleRoute>} />
          <Route path="/candidates" element={<RoleRoute session={session} roles={["Administrator", "Manager"]}><CandidateListPage /></RoleRoute>} />
          <Route path="/candidates/new" element={<RoleRoute session={session} roles={["Administrator", "Manager"]}><CandidatesPage /></RoleRoute>} />
          <Route path="/requisitions" element={<RoleRoute session={session} roles={["Administrator", "Manager"]}><RequisitionListPage /></RoleRoute>} />
          <Route path="/requisitions/new" element={<RoleRoute session={session} roles={["Administrator", "Manager"]}><RequisitionsPage /></RoleRoute>} />
          <Route path="/panels" element={<RoleRoute session={session} roles={["Administrator", "Manager"]}><PanelsPage /></RoleRoute>} />
          <Route path="/panels/list" element={<RoleRoute session={session} roles={["Administrator", "Manager"]}><PanelListPage /></RoleRoute>} />
          <Route path="/my-schedule" element={<RoleRoute session={session} roles={["Administrator", "Manager", "TA", "Panel"]}><MySchedulePage groups={session.groups} /></RoleRoute>} />
          <Route path="/my-availability" element={<RoleRoute session={session} roles={["Administrator", "Manager", "Panel"]}><MyAvailabilityPage /></RoleRoute>} />
          <Route path="/pending-feedback" element={<RoleRoute session={session} roles={["Administrator", "Manager", "TA", "Panel"]}><PendingFeedbackPage session={session} /></RoleRoute>} />
          <Route path="/reports" element={<RoleRoute session={session} roles={["Administrator", "Manager"]}><ReportsPage /></RoleRoute>} />
          <Route path="/users" element={<RoleRoute session={session} roles={["Administrator", "Manager"]}><UsersPage /></RoleRoute>} />
          {isAdmin && <Route path="/settings" element={<SimplePage title="Settings" />} />}
          <Route path="/audit" element={<RoleRoute session={session} roles={["Administrator", "Manager"]}><AuditPage /></RoleRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
