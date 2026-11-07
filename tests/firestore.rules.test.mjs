// Tests for firestore.rules, run against the Firebase emulator.
//   npm run test:rules        (needs Java and internet the first time, to download the emulator)
// Runs automatically on GitHub in .github/workflows/rules-tests.yml.
import { readFileSync } from "node:fs";
import { test, before, after, beforeEach } from "node:test";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from "firebase/firestore";

let env;
const EMAIL = (u) => `${u}@gardenquest.local`;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "greenpath-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const alice = () => env.authenticatedContext("alice", { email: EMAIL("alice") }).firestore();
const bob = () => env.authenticatedContext("bob", { email: EMAIL("bob") }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const newUser = { username: "alice", fullName: "Alice Example", progress: null };
const prog = (n, extra = {}) => ({ languageId: "en", characterId: "Manos", completedModules: n, ...extra });

async function seedAlice(progress = null) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users/alice"), { ...newUser, progress });
  });
}

// ---- What the game itself does (must keep working) ----
test("register: player creates own record (exactly what registerUser writes)", async () => {
  await assertSucceeds(setDoc(doc(alice(), "users/alice"), newUser));
});
test("read own record (login / resume)", async () => {
  await seedAlice();
  await assertSucceeds(getDoc(doc(alice(), "users/alice")));
});
test("save progress with merge (exactly what saveProgress writes)", async () => {
  await seedAlice();
  await assertSucceeds(setDoc(doc(alice(), "users/alice"), { progress: prog(0) }, { merge: true }));
  await assertSucceeds(setDoc(doc(alice(), "users/alice"), { progress: prog(1) }, { merge: true }));
});
test("change language / character keeps progress", async () => {
  await seedAlice(prog(3));
  await assertSucceeds(setDoc(doc(alice(), "users/alice"), { progress: prog(3, { languageId: "gr", characterId: "Jana" }) }, { merge: true }));
});
test("play again resets to 0", async () => {
  await seedAlice(prog(9));
  await assertSucceeds(setDoc(doc(alice(), "users/alice"), { progress: prog(0) }, { merge: true }));
});

// ---- Attacks that must be blocked ----
test("not logged in: cannot read or write anyone", async () => {
  await seedAlice();
  await assertFails(getDoc(doc(anon(), "users/alice")));
  await assertFails(setDoc(doc(anon(), "users/alice"), newUser));
});
test("other player cannot read, change or delete my record", async () => {
  await seedAlice(prog(2));
  await assertFails(getDoc(doc(bob(), "users/alice")));
  await assertFails(setDoc(doc(bob(), "users/alice"), { progress: prog(0) }, { merge: true }));
  await assertFails(deleteDoc(doc(bob(), "users/alice")));
});
test("cannot list all players", async () => {
  await seedAlice();
  await assertFails(getDocs(collection(alice(), "users")));
});
test("cannot create a record under someone else's username", async () => {
  await assertFails(setDoc(doc(alice(), "users/alice"), { ...newUser, username: "bob" }));
});
test("cannot change username later", async () => {
  await seedAlice();
  await assertFails(updateDoc(doc(alice(), "users/alice"), { username: "alice2" }));
});
test("cannot skip modules (jump to the certificate)", async () => {
  await seedAlice(prog(1));
  await assertFails(setDoc(doc(alice(), "users/alice"), { progress: prog(9) }, { merge: true }));
  await assertFails(setDoc(doc(alice(), "users/alice"), { progress: prog(3) }, { merge: true }));
});
test("cannot store invalid values", async () => {
  await seedAlice();
  const ref = doc(alice(), "users/alice");
  await assertFails(setDoc(ref, { progress: prog(10) }, { merge: true }));
  await assertFails(setDoc(ref, { progress: prog(-1) }, { merge: true }));
  await assertFails(setDoc(ref, { progress: prog(1.5) }, { merge: true }));
  await assertFails(setDoc(ref, { progress: prog(1, { languageId: "xx" }) }, { merge: true }));
  await assertFails(setDoc(ref, { progress: prog(1, { characterId: "Hacker" }) }, { merge: true }));
  await assertFails(setDoc(ref, { progress: prog(1, { extra: "junk" }) }, { merge: true }));
});
test("cannot add unknown fields or huge names", async () => {
  await assertFails(setDoc(doc(alice(), "users/alice"), { ...newUser, isAdmin: true }));
  await assertFails(setDoc(doc(alice(), "users/alice"), { ...newUser, fullName: "x".repeat(61) }));
  await assertFails(setDoc(doc(alice(), "users/alice"), { ...newUser, fullName: "" }));
  await assertFails(setDoc(doc(alice(), "users/alice"), { ...newUser, username: "Alice!" }));
});
test("cannot write anywhere else in the database", async () => {
  await assertFails(setDoc(doc(alice(), "scores/alice"), { score: 999 }));
  await assertFails(setDoc(doc(alice(), "users/alice/secret/x"), { a: 1 }));
});
