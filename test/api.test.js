import { defineApiTests } from "./api-suite.js";
import { createMemoryStore } from "../src/data/memoryStore.js";
import { createSqliteStore } from "../src/data/sqliteStore.js";

defineApiTests("memory", () => createMemoryStore());
defineApiTests("SQLite", () => createSqliteStore(":memory:"));
