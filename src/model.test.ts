import { Model, ModelEvent } from "./model";
import { describe, test, expect, beforeAll } from "vitest";
import { DeleteStrategy } from "./DeleteStrategy";
import knex from "knex";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

interface UserRecordType {
  id: number;
  name: string;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

const db = knex({
  client: "sqlite3",
  connection: ":memory:",
  useNullAsDefault: true,
  migrations: {
    directory: resolve(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "fixtures",
      "migrations"
    ),
  },
});

class UserModel extends Model<UserRecordType> {
  constructor() {
    super({
      idField: "id",
      table: "users",
      createdField: "created_at",
      updatedField: "updated_at",
      deletedField: "deleted_at",
      db,
    });
  }
}

class UserWithParseModel extends Model<UserRecordType> {
  constructor() {
    super({
      idField: "id",
      table: "users",
      createdField: "created_at",
      updatedField: "updated_at",
      db,
      parseStrategy: (record) => {
        return {
          ...record,
          created_at: new Date(
            (record as unknown as UserRecordType).created_at
          ),
        } as unknown as UserRecordType;
      },
    });
  }
}

class UserHardDeleteModel extends Model<UserRecordType> {
  constructor() {
    super({
      idField: "id",
      table: "users",
      createdField: "created_at",
      updatedField: "updated_at",
      db,
      deleteStrategy: DeleteStrategy.hard(),
    });
  }
}

beforeAll(async () => {
  await db.migrate.latest();

  // clean up function, called once after all tests run
  return async () => {
    await db.destroy();
  };
});

const User = new UserModel();
const UserWithParse = new UserWithParseModel();
const UserHardDelete = new UserHardDeleteModel();

const observe = async (
  model: Model<UserRecordType>,
  event: keyof ModelEvent<UserRecordType>,
  run: (emitted: unknown[][]) => Promise<unknown>
) => {
  const emitted: unknown[][] = [];
  const unhandled: unknown[] = [];
  const onEvent = (...args: unknown[]) => emitted.push(args);
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  model.on(event, onEvent);
  process.on("unhandledRejection", onUnhandled);
  try {
    await run(emitted);
    await new Promise(setImmediate);
  } finally {
    model.off(event, onEvent);
    process.off("unhandledRejection", onUnhandled);
  }
  return { emitted, unhandled };
};

describe("Model", () => {
  describe("constructor", () => {
    test("sets idField", () => {
      expect(User.idField).toEqual("id");
    });
    test("sets createdField", () => {
      expect(User.createdField).toEqual("created_at");
    });
    test("sets updatedField", () => {
      expect(User.updatedField).toEqual("updated_at");
    });
    test("sets table", () => {
      expect(User.table).toEqual("users");
    });
  });
  describe("save", () => {
    test("saves a user", async () => {
      await expect(User.save({ name: "foo" })).resolves.toEqual(null);
    });
    test("saves a new user with an id", async () => {
      await expect(User.save({ name: "foo", id: 100 })).resolves.toEqual(null);
    });
    test("saves, returns and updates a user", async () => {
      const user = await User.save({ name: "foo" }, { returnNew: true });
      expect(user).toEqual(
        expect.objectContaining({
          name: "foo",
        })
      );
      await expect(
        User.save({ id: user?.id, name: "foo2" }, { returnNew: true })
      ).resolves.toEqual(
        expect.objectContaining({
          id: user?.id,
          name: "foo2",
        })
      );
    });
    test("throws if there is nothing to save on a new record", async () => {
      await expect(User.save({}, { returnNew: true })).rejects.toThrow(
        "NOTHING_TO_SAVE"
      );
    });
  });
  describe("saveAndFetch", () => {
    test("saves, returns and updates a user", async () => {
      const user = await User.saveAndFetch({ name: "foo" });
      expect(user).toEqual(
        expect.objectContaining({
          name: "foo",
        })
      );
      await expect(
        User.saveAndFetch({ id: user?.id, name: "foo2" })
      ).resolves.toEqual(
        expect.objectContaining({
          id: user?.id,
          name: "foo2",
        })
      );
    });
    test("parseStrategy to convert date", async () => {
      const user = await UserWithParse.saveAndFetch({ name: "foo" });
      expect(user.created_at).toBeTypeOf("object");
      expect(user.updated_at).toBeTypeOf("string");
    });
  });
  describe("fetch", () => {
    test("returns null when record doesn't exist", async () => {
      await expect(User.fetch({ id: 1000 })).resolves.toEqual(null);
    });
  });
  describe("fetchOrThrow", () => {
    test("throws when record doesn't exist", async () => {
      await expect(User.fetchOrThrow({ id: 1000 })).rejects.toThrow(
        "RECORD_NOT_FOUND"
      );
    });
    test("returns user that does exist", async () => {
      const user = await User.saveAndFetch({ name: "foo" });
      await expect(User.fetchOrThrow({ id: user.id })).resolves.toEqual(user);
    });
  });
  describe("delete", () => {
    test("ignores if record doesn't exist", async () => {
      await expect(User.delete({ id: 1000 })).resolves.toEqual(undefined);
    });
    test("deletes record if it exists", async () => {
      const user = await User.saveAndFetch({ name: "foo" });
      await expect(User.delete({ id: user.id })).resolves.toEqual(undefined);
      await expect(User.fetch({ id: user.id })).resolves.toEqual(null);
    });
    test("deletes if not implemented", async () => {
      const user = await User.saveAndFetch({ name: "foo" });
      await expect(UserWithParse.delete({ id: user.id })).rejects.toThrow(
        "DELETE_NOT_IMPLEMENTED"
      );
    });
    test("hard deletes record if it exists", async () => {
      const user = await UserHardDelete.saveAndFetch({ name: "foo" });
      await expect(UserHardDelete.delete({ id: user.id })).resolves.toEqual(
        undefined
      );
      await expect(UserHardDelete.fetch({ id: user.id })).resolves.toEqual(
        null
      );
    });
  });
  describe("events", () => {
    test("emits create before save resolves when there is no transaction", async () => {
      const observed = await observe(User, "create", async (emitted) => {
        await User.save({ name: "direct" });
        expect(emitted).toEqual([
          [{ name: "direct" }, expect.objectContaining({ name: "direct" })],
        ]);
      });
      expect(observed.unhandled).toEqual([]);
    });
    test("emits create only after the transaction commits", async () => {
      const observed = await observe(User, "create", (emitted) =>
        db.transaction(async (trx) => {
          await User.save({ name: "committed" }, { db: trx });
          expect(emitted).toEqual([]);
        })
      );
      expect(observed).toEqual({
        emitted: [
          [
            { name: "committed" },
            expect.objectContaining({ name: "committed" }),
          ],
        ],
        unhandled: [],
      });
    });
    test("emits update only after the transaction commits", async () => {
      const user = await User.saveAndFetch({ name: "before" });
      const observed = await observe(User, "update", (emitted) =>
        db.transaction(async (trx) => {
          await User.save({ id: user.id, name: "after" }, { db: trx });
          expect(emitted).toEqual([]);
        })
      );
      expect(observed).toEqual({
        emitted: [
          [
            { id: user.id, name: "after" },
            expect.objectContaining({ id: user.id, name: "after" }),
          ],
        ],
        unhandled: [],
      });
    });
    test("emits delete only after the transaction commits", async () => {
      const user = await UserHardDelete.saveAndFetch({ name: "removed" });
      const observed = await observe(UserHardDelete, "delete", (emitted) =>
        db.transaction(async (trx) => {
          await UserHardDelete.delete({ id: user.id }, { db: trx });
          expect(emitted).toEqual([]);
        })
      );
      expect(observed).toEqual({ emitted: [[user]], unhandled: [] });
    });
    test("a rolled back save leaves no unhandled rejection and emits nothing", async () => {
      const rollback = new Error("roll back the save");
      const observed = await observe(User, "create", () =>
        expect(
          db.transaction(async (trx) => {
            await User.save({ name: "rolled back" }, { db: trx });
            throw rollback;
          })
        ).rejects.toBe(rollback)
      );
      expect(observed).toEqual({ emitted: [], unhandled: [] });
      await expect(User.fetch({ name: "rolled back" })).resolves.toEqual(null);
    });
    test("a rolled back delete leaves no unhandled rejection and emits nothing", async () => {
      const user = await UserHardDelete.saveAndFetch({ name: "kept" });
      const rollback = new Error("roll back the delete");
      const observed = await observe(UserHardDelete, "delete", () =>
        expect(
          db.transaction(async (trx) => {
            await UserHardDelete.delete({ id: user.id }, { db: trx });
            throw rollback;
          })
        ).rejects.toBe(rollback)
      );
      expect(observed).toEqual({ emitted: [], unhandled: [] });
      await expect(UserHardDelete.fetch({ id: user.id })).resolves.toEqual(
        user
      );
    });
  });
});
