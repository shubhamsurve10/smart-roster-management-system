// Real-database integration check (optional): npm run test:db
// Uses mongodb-memory-server to start a throwaway replica set (transactions)
// and a standalone server (fallback path). Runs the seed script, generation,
// validation, the HTTP endpoints, and the save/restore logic.
// Note: the first run downloads a MongoDB binary (~80 MB).
import { MongoMemoryReplSet, MongoMemoryServer } from "mongodb-memory-server";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

// Backend root (two levels up from tests/integration).
const B = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const Employee = (await import("../../models/Employee.js")).default;
const Roster = (await import("../../models/Roster.js")).default;
const RosterEntry = (await import("../../models/RosterEntry.js")).default;
const Process = (await import("../../models/Process.js")).default;
const Leave = (await import("../../models/Leave.js")).default;
const gen = await import("../../services/rosterGenerationService.js");
const { validateMonthlyRoster } = await import("../../services/rosterValidationService.js");

const log = (...a) => console.log(...a);
const check = (cond, msg) => { if (!cond) { console.log("FAIL:", msg); process.exitCode = 1; } else console.log("ok:", msg); };

async function seed(uri) {
  execFileSync("node", ["scripts/seedSampleData.js"], { cwd: B, env: { ...process.env, MONGODB_URI: uri }, stdio: "pipe" });
}

async function replicaSetSuite() {
  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  const uri = rs.getUri("roster");
  await seed(uri);
  await mongoose.connect(uri);
  check((await Employee.countDocuments()) === 33, "seed imported 33 employees");

  const admin = await Employee.create({ name: "Ops Admin", email: "admin@example.com", password: await bcrypt.hash("Admin@123456", 4), role: "admin" });
  await Roster.create({ month: "2026-12" });
  const tara = await Employee.findOne({ email: "e31@example.com" });
  const neel = await Employee.findOne({ email: "e22@example.com" });
  const b20cs = (await Process.find().populate("brand")).find((p) => p.brand.name === "Terra Threads" && p.type === "CS");
  // manual entry should survive regeneration
  await RosterEntry.create({ rosterMonth: "2026-12", employee: neel._id, date: "2026-12-03", status: "WORKING", processes: [b20cs._id], isManual: true });

  let t = Date.now();
  const result = await gen.generateMonthlyRoster("2026-12");
  log("generate (replica set) ms", Date.now() - t, "saveMode", result.saveMode, "entries", result.totalEntries, "conflicts", result.totalConflicts, "warnings", result.totalWarnings);
  check(result.saveMode === "TRANSACTION", "uses a transaction on a replica set");
  const activeCount = await Employee.countDocuments({ active: true });
  check((await RosterEntry.countDocuments({ rosterMonth: "2026-12" })) === activeCount * 31, "one entry per active employee per day (incl. manual)");
  const manual = await RosterEntry.findOne({ rosterMonth: "2026-12", employee: neel._id, date: "2026-12-03" });
  check(manual.isManual === true && manual.status === "WORKING", "manual entry preserved");

  const again = await gen.generateMonthlyRoster("2026-12");
  check(again.totalEntries === result.totalEntries, "regeneration is stable");

  t = Date.now();
  const validation = await validateMonthlyRoster("2026-12");
  log("validate ms", Date.now() - t, "isValid", validation.isValid, "errors", validation.totalErrors, JSON.stringify(validation.summary.byType));
  check(validation.isValid === true, "generated roster validates");

  // duplicate key inside a transaction -> rolled back, clear error
  const before = await RosterEntry.countDocuments({ rosterMonth: "2026-12" });
  const dupEntries = [{ rosterMonth: "2026-12", employee: tara._id, date: "2026-12-01", status: "WORKING", processes: [] }, { rosterMonth: "2026-12", employee: tara._id, date: "2026-12-01", status: "WORKING", processes: [] }];
  let err = null;
  try { await gen.saveGeneratedEntries("2026-12", dupEntries); } catch (e) { err = e; }
  check(err && /Nothing was changed/.test(err.message), "duplicate during save is reported");
  check((await RosterEntry.countDocuments({ rosterMonth: "2026-12" })) === before, "transaction rolled back (no partial replacement)");

  // legacy helpers still work
  const availability = await gen.getEmployeeAvailability(String(tara._id), "2026-12-08");
  check(availability.available === true && availability.preferredOff === true, "getEmployeeAvailability works (Tuesday preferred off)");
  const legacyPlan = await gen.buildDailyAllocationPlan(await Process.find().lean(), "2026-12-08", new Set());
  check(Array.isArray(legacyPlan.allocations) && legacyPlan.allocations.length > 0, "buildDailyAllocationPlan works");

  // HTTP: start server and hit the routes
  const port = 5099;
  const server = spawn("node", ["server.js"], { cwd: B, env: { ...process.env, MONGODB_URI: uri, JWT_SECRET: "test-secret", PORT: String(port) }, stdio: "pipe" });
  await new Promise((resolve) => server.stdout.on("data", (d) => String(d).includes("Server running") && resolve()));
  const token = jwt.sign({ id: String(admin._id) }, "test-secret");
  const agentToken = jwt.sign({ id: String(tara._id) }, "test-secret");
  const roster = await Roster.findOne({ month: "2026-12" });
  const api = async (method, path, body, tk = token) => {
    const res = await fetch(`http://localhost:${port}${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* csv */ }
    return { status: res.status, json, text };
  };
  let r = await api("POST", `/api/rosters/${roster._id}/generate`);
  check(r.status === 200 && r.json.data.saveMode === "TRANSACTION", "POST /generate works");
  r = await api("POST", `/api/rosters/${roster._id}/validate`);
  check(r.status === 200 && r.json.data.isValid === true, "POST /validate works");
  r = await api("POST", `/api/rosters/${roster._id}/leave-impact`, { employee: String(tara._id), startDate: "2026-12-18", endDate: "2026-12-18", type: "LEAVE" });
  check(r.status === 200 && r.json.data.coverageGapCreated === true && r.json.data.replacements.length === 1, "POST /leave-impact reports the B24 gap");
  log("  leave-impact:", r.json.message);
  const countAfterImpact = await RosterEntry.countDocuments({ rosterMonth: "2026-12" });
  check(countAfterImpact === before && (await Leave.countDocuments({ employee: tara._id, status: "APPROVED" })) === 0, "leave-impact saved nothing");
  r = await api("POST", `/api/rosters/${roster._id}/leave-impact`, { employee: String(tara._id), startDate: "2026-12-18", endDate: "2026-12-18" }, agentToken);
  check(r.status === 403, "leave-impact is admin only");
  r = await api("POST", `/api/rosters/${roster._id}/leave-impact`, { employee: String(tara._id), startDate: "2026-12-20", endDate: "2026-12-18" });
  check(r.status === 400, "leave-impact validates input");
  r = await api("GET", `/api/rosters/${roster._id}/views`);
  check(r.status === 200 && r.json.data.brands.length === 24 && r.json.data.employees.length === activeCount, "GET /views returns brand/pod/process/employee views");
  r = await api("GET", `/api/rosters/${roster._id}/export?view=coverage`);
  check(r.status === 200 && r.text.split("\n").length === 52, "GET /export?view=coverage returns CSV");
  r = await api("POST", `/api/rosters/${roster._id}/publish`);
  check(r.status === 200 && r.json.data.status === "PUBLISHED", "POST /publish works (warnings do not block)");
  server.kill();

  await mongoose.disconnect();
  await rs.stop();
}

async function standaloneSuite() {
  const server = await MongoMemoryServer.create();
  const uri = server.getUri("roster");
  await seed(uri);
  await mongoose.connect(uri);
  await Roster.create({ month: "2026-11" });
  const result = await gen.generateMonthlyRoster("2026-11");
  check(result.saveMode === "NON_TRANSACTIONAL_FALLBACK", "falls back on standalone MongoDB");
  const count = await RosterEntry.countDocuments({ rosterMonth: "2026-11" });
  check(count === (await Employee.countDocuments({ active: true })) * 30, "fallback saved every entry");

  const tara = await Employee.findOne({ email: "e31@example.com" });
  const snapshot = (await RosterEntry.find({ rosterMonth: "2026-11" }).sort({ employee: 1, date: 1 }).lean()).map((e) => `${e.employee}|${e.date}|${e.status}`);
  let err = null;
  try {
    await gen.saveGeneratedEntries("2026-11", [
      { rosterMonth: "2026-11", employee: tara._id, date: "2026-11-02", status: "WORKING", processes: [] },
      { rosterMonth: "2026-11", employee: tara._id, date: "2026-11-02", status: "WORKING", processes: [] },
    ]);
  } catch (e) { err = e; }
  check(err && err.restored === true, "failed fallback insert is reported and old entries restored");
  const after = (await RosterEntry.find({ rosterMonth: "2026-11" }).sort({ employee: 1, date: 1 }).lean()).map((e) => `${e.employee}|${e.date}|${e.status}`);
  check(JSON.stringify(after) === JSON.stringify(snapshot), "restored entries match the previous roster exactly");

  // unrelated error: must not fall back
  check(gen.isTransactionUnsupportedError(new Error("E11000 duplicate key")) === false, "unrelated errors are not treated as 'no transactions'");
  await mongoose.disconnect();
  await server.stop();
}

await replicaSetSuite();
await standaloneSuite();
console.log(process.exitCode ? "SOME CHECKS FAILED" : "ALL DB CHECKS PASSED");
process.exit(process.exitCode || 0);
