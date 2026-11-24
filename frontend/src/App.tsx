import { Navigate, Route, Routes } from "react-router";
import { RequireAuth } from "./lib/auth";
import AppShell from "./components/AppShell";
import BoardPage, { HomeRedirect } from "./pages/BoardPage";
import LoginPage from "./pages/LoginPage";
import PresentPage from "./pages/PresentPage";
import AdminLayout from "./pages/admin/AdminLayout";
import BoardsAdmin from "./pages/admin/BoardsAdmin";
import BoardEditor from "./pages/admin/BoardEditor";
import MetricsAdmin from "./pages/admin/MetricsAdmin";
import MetricEditor from "./pages/admin/MetricEditor";
import MetricValues from "./pages/admin/MetricValues";
import DataSourcesAdmin from "./pages/admin/DataSourcesAdmin";
import UsersAdmin from "./pages/admin/UsersAdmin";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/present/:boardId"
        element={
          <RequireAuth>
            <PresentPage />
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route path="boards/:boardId" element={<BoardPage />} />
        <Route
          path="admin"
          element={
            <RequireAuth admin>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="boards" replace />} />
          <Route path="boards" element={<BoardsAdmin />} />
          <Route path="boards/:boardId" element={<BoardEditor />} />
          <Route path="metrics" element={<MetricsAdmin />} />
          <Route path="metrics/new" element={<MetricEditor />} />
          <Route path="metrics/:metricId" element={<MetricEditor />} />
          <Route path="metrics/:metricId/values" element={<MetricValues />} />
          <Route path="sources" element={<DataSourcesAdmin />} />
          <Route path="users" element={<UsersAdmin />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
