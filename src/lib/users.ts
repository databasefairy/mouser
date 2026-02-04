/**
 * User management module.
 * Supports multiple storage backends:
 * 1. Supabase (recommended for production/Vercel)
 * 2. MOUSER_USERS env var (simple serverless fallback)
 * 3. Local file data/users.json (development)
 * 
 * Roles:
 * - user: Basic login, 5 searches per day max
 * - power_user: Limitless searches, no admin features
 * - admin: Limitless searches + admin panel access
 */

import fs from "fs";
import path from "path";
import { getSupabase, isSupabaseConfigured } from "./supabase";

export type UserRole = "user" | "power_user" | "admin";

export type User = {
  username: string;
  password: string; // In production, this should be hashed
  role: UserRole;
  searchCount: number;
  lastSearchDate: string; // ISO date string (YYYY-MM-DD)
  createdAt: string;
};

export type UsersData = {
  users: User[];
};

const DATA_FILE = path.join(process.cwd(), "data", "users.json");

// In-memory cache for users (used when MOUSER_USERS env var is set)
let usersCache: User[] | null = null;

/**
 * Get storage mode: 'supabase', 'env', or 'file'
 */
function getStorageMode(): "supabase" | "env" | "file" {
  if (isSupabaseConfigured()) return "supabase";
  if (process.env.MOUSER_USERS) return "env";
  return "file";
}

/**
 * Ensure the data directory and file exist (local development only).
 */
function ensureDataFile(): void {
  if (getStorageMode() !== "file") return;
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    const initialData: UsersData = { users: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
  }
}

// ============== SUPABASE STORAGE ==============

async function getUsersFromSupabase(): Promise<User[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  
  const { data, error } = await supabase
    .from("users")
    .select("username, password_hash, role, search_count, last_search_date, created_at");
  
  if (error) {
    console.error("[users] Supabase error:", error.message);
    return [];
  }
  
  return (data || []).map((row) => ({
    username: row.username,
    password: row.password_hash,
    role: row.role as UserRole,
    searchCount: row.search_count || 0,
    lastSearchDate: row.last_search_date || "",
    createdAt: row.created_at,
  }));
}

async function findUserInSupabase(username: string): Promise<User | null> {
  const supabase = getSupabase();
  if (!supabase) {
    console.error("[users] Supabase client not available");
    return null;
  }
  
  const { data, error } = await supabase
    .from("users")
    .select("username, password_hash, role, search_count, last_search_date, created_at")
    .ilike("username", username)
    .single();
  
  if (error) {
    console.error("[users] Supabase findUser error:", error.message, "for username:", username);
    return null;
  }
  
  if (!data) {
    console.error("[users] User not found in Supabase:", username);
    return null;
  }
  
  return {
    username: data.username,
    password: data.password_hash,
    role: data.role as UserRole,
    searchCount: data.search_count || 0,
    lastSearchDate: data.last_search_date || "",
    createdAt: data.created_at,
  };
}

/**
 * Verify user credentials using Supabase's pgcrypto verify_user function.
 * This compares the password using bcrypt hashing.
 */
async function verifyUserInSupabase(username: string, password: string): Promise<User | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  
  const { data, error } = await supabase
    .rpc("verify_user", { p_username: username, p_password: password })
    .single();
  
  if (error || !data) return null;
  
  const row = data as { username: string; password_hash: string; role: string; search_count: number; last_search_date: string; created_at: string };
  
  return {
    username: row.username,
    password: row.password_hash, // This is the hashed password
    role: row.role as UserRole,
    searchCount: row.search_count || 0,
    lastSearchDate: row.last_search_date || "",
    createdAt: row.created_at,
  };
}

async function createUserInSupabase(username: string, password: string, role: UserRole): Promise<User | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  
  const { data, error } = await supabase
    .from("users")
    .insert({
      username,
      password_hash: password, // Will be auto-hashed by trigger
      role,
      search_count: 0,
      last_search_date: "",
      created_at: new Date().toISOString(),
    })
    .select()
    .single();
  
  if (error) {
    console.error("[users] Supabase create error:", error.message);
    return null;
  }
  
  return {
    username: data.username,
    password: data.password_hash,
    role: data.role as UserRole,
    searchCount: data.search_count || 0,
    lastSearchDate: data.last_search_date || "",
    createdAt: data.created_at,
  };
}

async function updateUserInSupabase(username: string, updates: Partial<{ password_hash: string; role: UserRole; search_count: number; last_search_date: string }>): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  
  const { error } = await supabase
    .from("users")
    .update(updates)
    .ilike("username", username);
  
  if (error) {
    console.error("[users] Supabase update error:", error.message);
    return false;
  }
  
  return true;
}

async function deleteUserInSupabase(username: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  
  const { error } = await supabase
    .from("users")
    .delete()
    .ilike("username", username);
  
  if (error) {
    console.error("[users] Supabase delete error:", error.message);
    return false;
  }
  
  return true;
}

// ============== LOCAL/ENV STORAGE ==============

function getUsersFromLocal(): User[] {
  const mode = getStorageMode();
  
  if (mode === "env") {
    if (usersCache) return usersCache;
    try {
      const parsed = JSON.parse(process.env.MOUSER_USERS!) as UsersData;
      usersCache = parsed.users || [];
      return usersCache;
    } catch {
      console.error("[users] Failed to parse MOUSER_USERS env var");
      return [];
    }
  }
  
  // File storage
  ensureDataFile();
  try {
    const data = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(data) as UsersData;
    return parsed.users || [];
  } catch {
    return [];
  }
}

function saveUsersToLocal(users: User[]): void {
  const mode = getStorageMode();
  
  if (mode === "env") {
    usersCache = users;
    console.log("[users] Updated in-memory cache. To persist, update MOUSER_USERS env var.");
    return;
  }
  
  ensureDataFile();
  const data: UsersData = { users };
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ============== PUBLIC API (async) ==============

/**
 * Read all users from storage.
 */
export async function getUsersAsync(): Promise<User[]> {
  if (getStorageMode() === "supabase") {
    return getUsersFromSupabase();
  }
  return getUsersFromLocal();
}

/**
 * Read all users (sync version for backwards compatibility).
 * Note: Uses cached data when Supabase is configured.
 */
export function getUsers(): User[] {
  if (getStorageMode() === "supabase") {
    // Return empty for sync calls when using Supabase - use getUsersAsync instead
    console.warn("[users] getUsers() called with Supabase configured. Use getUsersAsync() for accurate data.");
    return [];
  }
  return getUsersFromLocal();
}

/**
 * Find a user by username.
 */
export async function findUserAsync(username: string): Promise<User | null> {
  if (getStorageMode() === "supabase") {
    return findUserInSupabase(username);
  }
  const users = getUsersFromLocal();
  return users.find((u) => u.username.toLowerCase() === username.toLowerCase()) || null;
}

/**
 * Find a user by username (sync version).
 */
export function findUser(username: string): User | undefined {
  if (getStorageMode() === "supabase") {
    console.warn("[users] findUser() called with Supabase configured. Use findUserAsync() for accurate data.");
    return undefined;
  }
  const users = getUsersFromLocal();
  return users.find((u) => u.username.toLowerCase() === username.toLowerCase());
}

/**
 * Authenticate a user by username and password.
 * Uses pgcrypto verify_user function for Supabase (bcrypt comparison).
 */
export async function authenticateUserAsync(username: string, password: string): Promise<User | null> {
  if (getStorageMode() === "supabase") {
    // Use Supabase's verify_user function for bcrypt password comparison
    return verifyUserInSupabase(username, password);
  }
  
  // For local/env storage, compare plain text (not recommended for production)
  const user = await findUserAsync(username);
  if (!user) return null;
  if (user.password !== password) return null;
  return user;
}

/**
 * Authenticate a user (sync version for backwards compatibility).
 */
export function authenticateUser(username: string, password: string): User | null {
  if (getStorageMode() === "supabase") {
    // Can't do async in sync function - this will be handled in auth.ts
    return null;
  }
  const user = findUser(username);
  if (!user) return null;
  if (user.password !== password) return null;
  return user;
}

/**
 * Create a new user.
 */
export async function createUserAsync(username: string, password: string, role: UserRole): Promise<User | null> {
  if (getStorageMode() === "supabase") {
    // Check if user exists
    const existing = await findUserInSupabase(username);
    if (existing) return null;
    return createUserInSupabase(username, password, role);
  }
  
  const users = getUsersFromLocal();
  if (users.find((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return null;
  }
  
  const newUser: User = {
    username,
    password,
    role,
    searchCount: 0,
    lastSearchDate: "",
    createdAt: new Date().toISOString(),
  };
  
  users.push(newUser);
  saveUsersToLocal(users);
  return newUser;
}

/**
 * Create a new user (sync version).
 */
export function createUser(username: string, password: string, role: UserRole): User | null {
  if (getStorageMode() === "supabase") {
    console.warn("[users] createUser() called with Supabase configured. Use createUserAsync().");
    return null;
  }
  
  const users = getUsersFromLocal();
  if (users.find((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return null;
  }
  
  const newUser: User = {
    username,
    password,
    role,
    searchCount: 0,
    lastSearchDate: "",
    createdAt: new Date().toISOString(),
  };
  
  users.push(newUser);
  saveUsersToLocal(users);
  return newUser;
}

/**
 * Update a user's role.
 */
export async function updateUserRoleAsync(username: string, role: UserRole): Promise<boolean> {
  if (getStorageMode() === "supabase") {
    return updateUserInSupabase(username, { role });
  }
  
  const users = getUsersFromLocal();
  const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return false;
  
  user.role = role;
  saveUsersToLocal(users);
  return true;
}

/**
 * Update a user's role (sync version).
 */
export function updateUserRole(username: string, role: UserRole): boolean {
  if (getStorageMode() === "supabase") {
    console.warn("[users] updateUserRole() called with Supabase configured. Use updateUserRoleAsync().");
    return false;
  }
  
  const users = getUsersFromLocal();
  const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return false;
  
  user.role = role;
  saveUsersToLocal(users);
  return true;
}

/**
 * Update a user's password.
 */
export async function updateUserPasswordAsync(username: string, newPassword: string): Promise<boolean> {
  if (getStorageMode() === "supabase") {
    return updateUserInSupabase(username, { password_hash: newPassword });
  }
  
  const users = getUsersFromLocal();
  const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return false;
  
  user.password = newPassword;
  saveUsersToLocal(users);
  return true;
}

/**
 * Update a user's password (sync version).
 */
export function updateUserPassword(username: string, newPassword: string): boolean {
  if (getStorageMode() === "supabase") {
    console.warn("[users] updateUserPassword() called with Supabase configured. Use updateUserPasswordAsync().");
    return false;
  }
  
  const users = getUsersFromLocal();
  const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return false;
  
  user.password = newPassword;
  saveUsersToLocal(users);
  return true;
}

/**
 * Delete a user.
 */
export async function deleteUserAsync(username: string): Promise<boolean> {
  if (getStorageMode() === "supabase") {
    return deleteUserInSupabase(username);
  }
  
  const users = getUsersFromLocal();
  const index = users.findIndex((u) => u.username.toLowerCase() === username.toLowerCase());
  if (index === -1) return false;
  
  users.splice(index, 1);
  saveUsersToLocal(users);
  return true;
}

/**
 * Delete a user (sync version).
 */
export function deleteUser(username: string): boolean {
  if (getStorageMode() === "supabase") {
    console.warn("[users] deleteUser() called with Supabase configured. Use deleteUserAsync().");
    return false;
  }
  
  const users = getUsersFromLocal();
  const index = users.findIndex((u) => u.username.toLowerCase() === username.toLowerCase());
  if (index === -1) return false;
  
  users.splice(index, 1);
  saveUsersToLocal(users);
  return true;
}

/**
 * Increment search count for a user.
 */
export async function incrementSearchCountAsync(username: string): Promise<{ allowed: boolean; count: number; limit: number }> {
  const DAILY_LIMIT = 5;
  const today = new Date().toISOString().split("T")[0];
  
  if (getStorageMode() === "supabase") {
    const user = await findUserInSupabase(username);
    if (!user) return { allowed: false, count: 0, limit: 0 };
    
    let count = user.searchCount;
    if (user.lastSearchDate !== today) {
      count = 0;
    }
    
    if (user.role === "user" && count >= DAILY_LIMIT) {
      return { allowed: false, count, limit: DAILY_LIMIT };
    }
    
    count++;
    await updateUserInSupabase(username, { search_count: count, last_search_date: today });
    
    const limit = user.role === "user" ? DAILY_LIMIT : Infinity;
    return { allowed: true, count, limit };
  }
  
  const users = getUsersFromLocal();
  const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return { allowed: false, count: 0, limit: 0 };
  
  if (user.lastSearchDate !== today) {
    user.searchCount = 0;
    user.lastSearchDate = today;
  }
  
  if (user.role === "user" && user.searchCount >= DAILY_LIMIT) {
    return { allowed: false, count: user.searchCount, limit: DAILY_LIMIT };
  }
  
  user.searchCount++;
  saveUsersToLocal(users);
  
  const limit = user.role === "user" ? DAILY_LIMIT : Infinity;
  return { allowed: true, count: user.searchCount, limit };
}

/**
 * Increment search count (sync version).
 */
export function incrementSearchCount(username: string): { allowed: boolean; count: number; limit: number } {
  if (getStorageMode() === "supabase") {
    console.warn("[users] incrementSearchCount() called with Supabase configured. Use incrementSearchCountAsync().");
    return { allowed: true, count: 0, limit: Infinity }; // Allow but don't track
  }
  
  const DAILY_LIMIT = 5;
  const today = new Date().toISOString().split("T")[0];
  
  const users = getUsersFromLocal();
  const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return { allowed: false, count: 0, limit: 0 };
  
  if (user.lastSearchDate !== today) {
    user.searchCount = 0;
    user.lastSearchDate = today;
  }
  
  if (user.role === "user" && user.searchCount >= DAILY_LIMIT) {
    return { allowed: false, count: user.searchCount, limit: DAILY_LIMIT };
  }
  
  user.searchCount++;
  saveUsersToLocal(users);
  
  const limit = user.role === "user" ? DAILY_LIMIT : Infinity;
  return { allowed: true, count: user.searchCount, limit };
}

/**
 * Get search statistics for all users.
 */
export async function getSearchStatsAsync(): Promise<Array<{ username: string; role: UserRole; searchCount: number; lastSearchDate: string }>> {
  const users = await getUsersAsync();
  return users.map((u) => ({
    username: u.username,
    role: u.role,
    searchCount: u.searchCount,
    lastSearchDate: u.lastSearchDate,
  }));
}

/**
 * Get search statistics (sync version).
 */
export function getSearchStats(): Array<{ username: string; role: UserRole; searchCount: number; lastSearchDate: string }> {
  if (getStorageMode() === "supabase") {
    console.warn("[users] getSearchStats() called with Supabase configured. Use getSearchStatsAsync().");
    return [];
  }
  
  const users = getUsersFromLocal();
  return users.map((u) => ({
    username: u.username,
    role: u.role,
    searchCount: u.searchCount,
    lastSearchDate: u.lastSearchDate,
  }));
}

/**
 * Check if a user has admin privileges.
 */
export function isAdmin(username: string): boolean {
  if (getStorageMode() === "supabase") {
    return false; // Use async version
  }
  const user = findUser(username);
  return user?.role === "admin";
}

/**
 * Check if a user has power user or admin privileges (limitless searches).
 */
export function isLimitless(username: string): boolean {
  if (getStorageMode() === "supabase") {
    return false; // Use async version
  }
  const user = findUser(username);
  return user?.role === "power_user" || user?.role === "admin";
}

/**
 * Initialize default admin user if no users exist (local development only).
 */
export function initializeDefaultAdmin(): void {
  const mode = getStorageMode();
  
  if (mode === "supabase") {
    console.log("[users] Using Supabase for user storage.");
    return;
  }
  
  if (mode === "env") {
    const users = getUsersFromLocal();
    if (users.length === 0) {
      console.warn("[users] MOUSER_USERS env var is set but contains no users. Add users to the JSON.");
    }
    return;
  }
  
  const users = getUsersFromLocal();
  if (users.length === 0) {
    const adminPassword = process.env.MOUSER_ADMIN_PASSWORD || "admin123";
    createUser("admin", adminPassword, "admin");
    console.log("[users] Created default admin user. Username: admin");
  }
}

/**
 * Check storage mode.
 */
export function getStorageModeInfo(): string {
  return getStorageMode();
}
