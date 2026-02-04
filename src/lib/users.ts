/**
 * User management module.
 * Stores users and their search counts in a JSON file.
 * 
 * Roles:
 * - user: Basic login, 5 searches per day max
 * - power_user: Limitless searches, no admin features
 * - admin: Limitless searches + admin panel access
 */

import fs from "fs";
import path from "path";

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

/**
 * Ensure the data directory and file exist.
 */
function ensureDataFile(): void {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    const initialData: UsersData = { users: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
  }
}

/**
 * Read all users from the data file.
 */
export function getUsers(): User[] {
  ensureDataFile();
  try {
    const data = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(data) as UsersData;
    return parsed.users || [];
  } catch {
    return [];
  }
}

/**
 * Save users to the data file.
 */
function saveUsers(users: User[]): void {
  ensureDataFile();
  const data: UsersData = { users };
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

/**
 * Find a user by username.
 */
export function findUser(username: string): User | undefined {
  const users = getUsers();
  return users.find((u) => u.username.toLowerCase() === username.toLowerCase());
}

/**
 * Authenticate a user by username and password.
 */
export function authenticateUser(username: string, password: string): User | null {
  console.log("[auth] Attempting login for:", username);
  const users = getUsers();
  console.log("[auth] Found users:", users.map(u => u.username));
  const user = findUser(username);
  if (!user) {
    console.log("[auth] User not found:", username);
    return null;
  }
  console.log("[auth] User found, comparing passwords");
  console.log("[auth] Stored password:", JSON.stringify(user.password));
  console.log("[auth] Provided password:", JSON.stringify(password));
  if (user.password !== password) {
    console.log("[auth] Password mismatch");
    return null;
  }
  console.log("[auth] Login successful for:", username);
  return user;
}

/**
 * Create a new user.
 */
export function createUser(username: string, password: string, role: UserRole): User | null {
  const users = getUsers();
  
  // Check if username already exists
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
  saveUsers(users);
  return newUser;
}

/**
 * Update a user's role.
 */
export function updateUserRole(username: string, role: UserRole): boolean {
  const users = getUsers();
  const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return false;
  
  user.role = role;
  saveUsers(users);
  return true;
}

/**
 * Update a user's password.
 */
export function updateUserPassword(username: string, newPassword: string): boolean {
  const users = getUsers();
  const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return false;
  
  user.password = newPassword;
  saveUsers(users);
  return true;
}

/**
 * Delete a user.
 */
export function deleteUser(username: string): boolean {
  const users = getUsers();
  const index = users.findIndex((u) => u.username.toLowerCase() === username.toLowerCase());
  if (index === -1) return false;
  
  users.splice(index, 1);
  saveUsers(users);
  return true;
}

/**
 * Increment search count for a user.
 * Returns false if user has exceeded daily limit (for basic users).
 */
export function incrementSearchCount(username: string): { allowed: boolean; count: number; limit: number } {
  const users = getUsers();
  const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return { allowed: false, count: 0, limit: 0 };
  
  const today = new Date().toISOString().split("T")[0];
  const DAILY_LIMIT = 5;
  
  // Reset count if it's a new day
  if (user.lastSearchDate !== today) {
    user.searchCount = 0;
    user.lastSearchDate = today;
  }
  
  // Check limit for basic users
  if (user.role === "user" && user.searchCount >= DAILY_LIMIT) {
    return { allowed: false, count: user.searchCount, limit: DAILY_LIMIT };
  }
  
  user.searchCount++;
  saveUsers(users);
  
  const limit = user.role === "user" ? DAILY_LIMIT : Infinity;
  return { allowed: true, count: user.searchCount, limit };
}

/**
 * Get search statistics for all users.
 */
export function getSearchStats(): Array<{ username: string; role: UserRole; searchCount: number; lastSearchDate: string }> {
  const users = getUsers();
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
  const user = findUser(username);
  return user?.role === "admin";
}

/**
 * Check if a user has power user or admin privileges (limitless searches).
 */
export function isLimitless(username: string): boolean {
  const user = findUser(username);
  return user?.role === "power_user" || user?.role === "admin";
}

/**
 * Initialize default admin user if no users exist.
 */
export function initializeDefaultAdmin(): void {
  const users = getUsers();
  if (users.length === 0) {
    // Create default admin from environment variable or use a default
    const adminPassword = process.env.MOUSER_ADMIN_PASSWORD || "admin123";
    createUser("admin", adminPassword, "admin");
    console.log("[users] Created default admin user. Username: admin");
  }
}
