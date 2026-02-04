/**
 * Admin API for user management.
 * GET - List all users and search stats
 * POST - Create a new user
 * PATCH - Update user role
 * DELETE - Delete a user
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getUsersAsync,
  createUserAsync,
  updateUserRoleAsync,
  updateUserPasswordAsync,
  deleteUserAsync,
  getSearchStatsAsync,
  type UserRole,
} from "@/lib/users";

/**
 * Check if the current user is an admin.
 */
async function requireAdmin(request: NextRequest): Promise<{ isAdmin: boolean; error?: NextResponse }> {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role || (session?.user as { id?: string })?.id;
  
  if (role !== "admin") {
    return {
      isAdmin: false,
      error: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
    };
  }
  
  return { isAdmin: true };
}

/**
 * GET /api/admin/users - List all users and stats
 */
export async function GET(request: NextRequest) {
  const { isAdmin, error } = await requireAdmin(request);
  if (!isAdmin) return error;
  
  const allUsers = await getUsersAsync();
  const users = allUsers.map((u) => ({
    username: u.username,
    role: u.role,
    createdAt: u.createdAt,
  }));
  
  const stats = await getSearchStatsAsync();
  
  return NextResponse.json({ users, stats });
}

/**
 * POST /api/admin/users - Create a new user
 */
export async function POST(request: NextRequest) {
  const { isAdmin, error } = await requireAdmin(request);
  if (!isAdmin) return error;
  
  try {
    const body = await request.json();
    const { username, password, role } = body as { username?: string; password?: string; role?: string };
    
    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }
    
    if (username.length < 3) {
      return NextResponse.json({ error: "Username must be at least 3 characters" }, { status: 400 });
    }
    
    if (password.length < 4) {
      return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 });
    }
    
    const validRoles: UserRole[] = ["user", "power_user", "admin"];
    if (role && !validRoles.includes(role as UserRole)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    
    const user = await createUserAsync(username.trim(), password, (role as UserRole) || "user");
    if (!user) {
      return NextResponse.json({ error: "Username already exists" }, { status: 409 });
    }
    
    return NextResponse.json({ success: true, user: { username: user.username, role: user.role } });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

/**
 * PATCH /api/admin/users - Update user role or password
 */
export async function PATCH(request: NextRequest) {
  const { isAdmin, error } = await requireAdmin(request);
  if (!isAdmin) return error;
  
  try {
    const body = await request.json();
    const { username, role, password } = body as { username?: string; role?: string; password?: string };
    
    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }
    
    // Update password if provided
    if (password !== undefined) {
      if (password.length < 4) {
        return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 });
      }
      const success = await updateUserPasswordAsync(username, password);
      if (!success) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, updated: "password" });
    }
    
    // Update role if provided
    if (role !== undefined) {
      const validRoles: UserRole[] = ["user", "power_user", "admin"];
      if (!validRoles.includes(role as UserRole)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      const success = await updateUserRoleAsync(username, role as UserRole);
      if (!success) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, updated: "role" });
    }
    
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

/**
 * DELETE /api/admin/users - Delete a user
 */
export async function DELETE(request: NextRequest) {
  const { isAdmin, error } = await requireAdmin(request);
  if (!isAdmin) return error;
  
  const url = new URL(request.url);
  const username = url.searchParams.get("username");
  
  if (!username) {
    return NextResponse.json({ error: "Username is required" }, { status: 400 });
  }
  
  const success = await deleteUserAsync(username);
  if (!success) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  
  return NextResponse.json({ success: true });
}
