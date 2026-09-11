import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { CandidatesPage } from "./pages/CandidatesPage";
import { RequisitionsPage } from "./pages/RequisitionsPage";
import { InterviewsPage } from "./pages/InterviewsPage";
import { ScheduleInterviewPage } from "./pages/ScheduleInterviewPage";
import { CalendarPage } from "./pages/CalendarPage";
import { MySchedulePage } from "./pages/MySchedulePage";
import { FeedbackPage } from "./pages/FeedbackPage";
import { UsersPage } from "./pages/UsersPage";
import { SimplePage } from "./pages/SimplePage";
import { ReportsPage } from "./pages/ReportsPage";
import { config } from "./lib/config";
import { getSession, handleAuthCallback, login, SESSION_EXPIRED_EVENT } from "./lib/auth";

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
          <Route path="/" element={<DashboardPage />} />
          <Route path="/calendar" element={<CalendarPage groups={session.groups} />} />
          <Route path="/interviews" element={<InterviewsPage />} />
          <Route path="/interviews/new" element={<ScheduleInterviewPage />} />
          <Route path="/interviews/:interviewId/feedback" element={<FeedbackPage session={session} />} />
          <Route path="/candidates" element={<CandidatesPage />} />
          <Route path="/requisitions" element={<RequisitionsPage />} />
          <Route path="/my-schedule" element={<MySchedulePage groups={session.groups} />} />
          <Route path="/my-availability" element={<SimplePage title="My Availability" />} />
          <Route path="/pending-feedback" element={<SimplePage title="Pending Feedback" />} />
          <Route path="/reports" element={<ReportsPage />} />
          {isAdmin && <Route path="/users" element={<UsersPage />} />}
          {isAdmin && <Route path="/settings" element={<SimplePage title="Settings" />} />}
          <Route path="/audit" element={<SimplePage title="Audit Log" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
