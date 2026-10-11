import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchApi, patchApi, postApi } from "../api";
import { PERMISSIONS, ROLE_LABELS } from "../auth/permissions";
import { PLATFORM_NAME } from "../config/brand";
import { useAuth } from "../context/AuthContext";

const ROLE_OPTIONS = Object.keys(ROLE_LABELS);

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [createForm, setCreateForm] = useState({
    email: "",
    password: "",
    name: "",
    role: "SUPPORT",
  });

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [usersResponse, logsResponse] = await Promise.all([
        fetchApi("/users"),
        fetchApi("/logs/access", { page: 1, pageSize: 25 }),
      ]);
      setUsers(usersResponse.users || []);
      setLogs(logsResponse.rows || []);
    } catch (err) {
      setError(err.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreateUser(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      const body = { ...createForm, email: createForm.email.trim() };
      // createUserSchema: name is optional but must be non-empty when present.
      if (body.name.trim()) body.name = body.name.trim();
      else delete body.name;
      await postApi("/users", body);
      setMessage("User created successfully.");
      setCreateForm({ email: "", password: "", name: "", role: "SUPPORT" });
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to create user.");
    }
  }

  async function updateUser(userId, patch) {
    setMessage("");
    setError("");
    try {
      await patchApi(`/users/${userId}`, patch);
      setMessage("User updated.");
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to update user.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8">
      <section className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">{PLATFORM_NAME}</p>
            <h1 className="mt-1 text-3xl font-semibold text-slate-900">User Management</h1>
            <p className="mt-1 text-sm text-slate-600">Admin-only access to roles, activation, and audit logs.</p>
          </div>
          <Link
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            to="/"
          >
            Back to Dashboard
          </Link>
        </div>

        {loading && <p className="text-slate-600">Loading users...</p>}
        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">{error}</p>}
        {message && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">{message}</p>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Create User</h2>
            <form className="mt-4 space-y-3" onSubmit={handleCreateUser}>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Name</span>
                <input
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
                <input
                  required
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5"
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
                <input
                  required
                  minLength={8}
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5"
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Role</span>
                <select
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5"
                  value={createForm.role}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, role: e.target.value }))}
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
                type="submit"
              >
                Create User
              </button>
            </form>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Recent Access Logs</h2>
            <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-sm text-slate-500">No access logs yet.</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <p className="font-medium text-slate-800">
                      {log.action} · {log.user?.email || "unknown"}
                    </p>
                    <p>{log.resource || "—"}</p>
                    <p>{formatDate(log.createdAt)}</p>
                  </div>
                ))
              )}
            </div>
          </article>
        </div>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Team Members</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-slate-100">
                    <td className="px-3 py-3">{user.name || "—"}</td>
                    <td className="px-3 py-3">{user.email}</td>
                    <td className="px-3 py-3">
                      <select
                        className="rounded-lg border border-slate-300 px-2 py-1"
                        disabled={user.id === currentUser?.id}
                        value={user.role}
                        onChange={(e) => updateUser(user.id, { role: e.target.value })}
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          user.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                        }`}
                      >
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {user.id !== currentUser?.id && (
                        <button
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                          onClick={() => updateUser(user.id, { isActive: !user.isActive })}
                          type="button"
                        >
                          {user.isActive ? "Deactivate" : "Activate"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}
