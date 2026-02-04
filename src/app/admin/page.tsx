"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";

type UserRole = "user" | "power_user" | "admin";

type UserStats = {
  username: string;
  role: UserRole;
  searchCount: number;
  lastSearchDate: string;
};

type User = {
  username: string;
  role: UserRole;
  createdAt: string;
};

const cardBg = "bg-[#2B203E]/95";
const inputDark =
  "w-full min-w-0 rounded-xl border border-white/20 px-3 py-2.5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#DF338C]/50 box-border bg-white/[0.08]";

const ROLE_LABELS: Record<UserRole, string> = {
  user: "User (5/day limit)",
  power_user: "Power User (unlimited)",
  admin: "Admin (unlimited + admin access)",
};

const ROLE_COLORS: Record<UserRole, string> = {
  user: "text-blue-400",
  power_user: "text-green-400",
  admin: "text-yellow-400",
};

function isAdminRole(session: { user?: { id?: string; role?: string } } | null): boolean {
  const role = session?.user?.role || session?.user?.id;
  return role === "admin";
}

export default function AdminPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isAdmin = isAdminRole(session as { user?: { id?: string; role?: string } } | null);

  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New user form
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("user");
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);

  // Password reset
  const [resetUsername, setResetUsername] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Redirect non-admin users
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (status === "authenticated" && !isAdmin) {
      router.replace("/");
    }
  }, [status, isAdmin, router]);

  // Fetch users and stats
  useEffect(() => {
    if (!isAdmin) return;
    fetchData();
  }, [isAdmin]);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const contentType = res.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error("Session expired. Please sign in again.");
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch users");
      setUsers(data.users || []);
      setStats(data.stats || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setCreating(true);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
      });
      const contentType = res.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error("Session expired. Please sign in again.");
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user");
      setSuccess(`User "${newUsername}" created successfully`);
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteUser(username: string) {
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) return;
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/admin/users?username=${encodeURIComponent(username)}`, {
        method: "DELETE",
      });
      const contentType = res.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error("Session expired. Please sign in again.");
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete user");
      setSuccess(`User "${username}" deleted`);
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete user");
    }
  }

  async function handleUpdateRole(username: string, role: UserRole) {
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, role }),
      });
      const contentType = res.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error("Session expired. Please sign in again.");
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update role");
      setSuccess(`Updated "${username}" to ${ROLE_LABELS[role]}`);
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update role");
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetUsername) return;
    setError(null);
    setSuccess(null);
    setResetting(true);

    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: resetUsername, password: resetPassword }),
      });
      const contentType = res.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error("Session expired. Please sign in again.");
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset password");
      setSuccess(`Password reset for "${resetUsername}"`);
      setResetUsername(null);
      setResetPassword("");
      setShowResetPassword(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset password");
    } finally {
      setResetting(false);
    }
  }

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#26003B]">
        <p className="text-white/80">Loading...</p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#26003B]">
        <p className="text-white/80">Access denied. Redirecting...</p>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen relative overflow-hidden bg-[#26003B] px-4 sm:px-6 py-8 sm:py-10"
      style={{ backgroundImage: "url('/login-bg.png')", backgroundSize: "cover", backgroundPosition: "center" }}
    >
      <div className="relative z-10 max-w-6xl mx-auto">
        <header className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <img src="/logo-cat.png" alt="Mouser" className="object-contain" style={{ width: "0.75in", height: "0.75in" }} />
            <div className="flex flex-col gap-0.5">
              <h1 className="text-xl font-semibold text-white">Admin Panel</h1>
              <span className="text-white/50 text-xs">User Management</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-[#DF338C] hover:text-white underline">
              ← Back to Search
            </Link>
            <Link href="/debug" className="text-sm text-white/60 hover:text-white">
              Debug
            </Link>
            <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="text-sm font-medium text-white/70 hover:text-white">
              Sign out
            </button>
          </div>
        </header>

        {/* Messages */}
        {error && (
          <div className="mb-4 rounded-xl px-4 py-3 text-sm text-white bg-red-600/80">
            ⚠ {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-xl px-4 py-3 text-sm text-white bg-green-600/80">
            ✓ {success}
          </div>
        )}

        {/* Create User Form */}
        <div className={`rounded-xl p-6 shadow-2xl mb-6 ${cardBg}`}>
          <h2 className="text-lg font-semibold text-white mb-4">Create New User</h2>
          <form onSubmit={handleCreateUser} className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[150px]">
              <label className="block text-sm text-white/70 mb-1">Username</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="username"
                required
                className={inputDark}
                disabled={creating}
              />
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="block text-sm text-white/70 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="password"
                  required
                  className={`${inputDark} pr-10`}
                  disabled={creating}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#DF338C]/50"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-sm text-white/70 mb-1">Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className={inputDark}
                disabled={creating}
              >
                <option value="user">User (5/day limit)</option>
                <option value="power_user">Power User (unlimited)</option>
                <option value="admin">Admin (unlimited + admin)</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={creating}
              className="rounded-xl px-6 py-2.5 font-semibold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(90deg, #DF338C 0%, #972D57 100%)" }}
            >
              {creating ? "Creating..." : "Create User"}
            </button>
          </form>
        </div>

        {/* Users Table */}
        <div className={`rounded-xl p-6 shadow-2xl mb-6 ${cardBg}`}>
          <h2 className="text-lg font-semibold text-white mb-4">Users ({users.length})</h2>
          {loading ? (
            <p className="text-white/60">Loading...</p>
          ) : users.length === 0 ? (
            <p className="text-white/60">No users found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-white">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="px-3 py-2 font-semibold">Username</th>
                    <th className="px-3 py-2 font-semibold">Role</th>
                    <th className="px-3 py-2 font-semibold">Created</th>
                    <th className="px-3 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.username} className="border-b border-white/10 hover:bg-white/5">
                      <td className="px-3 py-2 font-medium">{user.username}</td>
                      <td className="px-3 py-2">
                        <select
                          value={user.role}
                          onChange={(e) => handleUpdateRole(user.username, e.target.value as UserRole)}
                          className={`bg-transparent border border-white/20 rounded px-2 py-1 text-xs ${ROLE_COLORS[user.role]}`}
                          disabled={user.username === session?.user?.name}
                        >
                          <option value="user" className="bg-[#2B203E]">User</option>
                          <option value="power_user" className="bg-[#2B203E]">Power User</option>
                          <option value="admin" className="bg-[#2B203E]">Admin</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 text-white/60">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 space-x-2">
                        <button
                          onClick={() => {
                            setResetUsername(user.username);
                            setResetPassword("");
                            setShowResetPassword(false);
                          }}
                          className="text-blue-400 hover:text-blue-300 text-xs"
                        >
                          Reset Password
                        </button>
                        {user.username !== session?.user?.name && (
                          <button
                            onClick={() => handleDeleteUser(user.username)}
                            className="text-red-400 hover:text-red-300 text-xs"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Password Reset Modal */}
          {resetUsername && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className={`rounded-xl p-6 shadow-2xl max-w-md w-full mx-4 ${cardBg}`}>
                <h3 className="text-lg font-semibold text-white mb-4">
                  Reset Password for "{resetUsername}"
                </h3>
                <form onSubmit={handleResetPassword}>
                  <div className="mb-4">
                    <label className="block text-sm text-white/70 mb-1">New Password</label>
                    <div className="relative">
                      <input
                        type={showResetPassword ? "text" : "password"}
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                        placeholder="Enter new password"
                        required
                        minLength={4}
                        className={`${inputDark} pr-10`}
                        disabled={resetting}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetPassword((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 focus:outline-none"
                        aria-label={showResetPassword ? "Hide password" : "Show password"}
                      >
                        {showResetPassword ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <p className="text-white/50 text-xs mt-1">Minimum 4 characters</p>
                  </div>
                  <div className="flex gap-3 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setResetUsername(null);
                        setResetPassword("");
                        setShowResetPassword(false);
                      }}
                      className="px-4 py-2 text-sm text-white/70 hover:text-white"
                      disabled={resetting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={resetting || resetPassword.length < 4}
                      className="rounded-xl px-4 py-2 font-semibold text-white disabled:opacity-50"
                      style={{ background: "linear-gradient(90deg, #DF338C 0%, #972D57 100%)" }}
                    >
                      {resetting ? "Resetting..." : "Reset Password"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>

        {/* Search Stats Table */}
        <div className={`rounded-xl p-6 shadow-2xl ${cardBg}`}>
          <h2 className="text-lg font-semibold text-white mb-4">Search Statistics</h2>
          {loading ? (
            <p className="text-white/60">Loading...</p>
          ) : stats.length === 0 ? (
            <p className="text-white/60">No search data yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-white">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="px-3 py-2 font-semibold">Username</th>
                    <th className="px-3 py-2 font-semibold">Role</th>
                    <th className="px-3 py-2 font-semibold">Searches Today</th>
                    <th className="px-3 py-2 font-semibold">Last Search</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((stat) => (
                    <tr key={stat.username} className="border-b border-white/10 hover:bg-white/5">
                      <td className="px-3 py-2 font-medium">{stat.username}</td>
                      <td className={`px-3 py-2 ${ROLE_COLORS[stat.role]}`}>
                        {stat.role === "user" ? "User" : stat.role === "power_user" ? "Power User" : "Admin"}
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{stat.searchCount}</span>
                        {stat.role === "user" && <span className="text-white/50"> / 5</span>}
                      </td>
                      <td className="px-3 py-2 text-white/60">
                        {stat.lastSearchDate || "Never"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
