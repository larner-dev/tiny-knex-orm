import { JsonObject, JsonPrimitive } from "type-fest";
import { Knex } from "knex";
import { Transactable } from "./types/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KnexType = Knex<any, unknown>;

export interface ModelOptions<T> {
  db: KnexType;
  table: string;
  idField: ModelField<T>;
  createdField?: ModelField<T>;
  updatedField?: ModelField<T>;
  deletedField?: ModelField<T>;
  deleteStrategy?: (record: T, db: KnexType, model: Model<T>) => Promise<void>;
  parseStrategy?: (record: JsonObject) => T;
}

type ModelField<T> = Extract<keyof T, string>;

interface SaveOptions extends Transactable {
  returnNew?: boolean;
}

export abstract class Model<T> {
  public readonly _db: KnexType;
  public readonly table: string;
  public readonly idField: ModelField<T>;
  public readonly createdField?: ModelField<T>;
  public readonly updatedField?: ModelField<T>;
  public readonly deletedField?: ModelField<T>;
  public readonly deleteStrategy?: (
    record: T,
    db: KnexType,
    model: Model<T>
  ) => Promise<void>;
  public readonly parseStrategy?: (record: JsonObject) => T;

  constructor(params: ModelOptions<T>) {
    this._db = params.db;
    this.table = params.table;
    this.idField = params.idField;
    this.createdField = params.createdField;
    this.updatedField = params.updatedField;
    this.deletedField = params.deletedField;
    this.parseStrategy = params.parseStrategy;
    this.deleteStrategy = params.deleteStrategy;
  }

  private db(opts?: Transactable) {
    return (opts?.db || this._db) as KnexType;
  }

  async save(record: Partial<T>, opts: SaveOptions = {}): Promise<T | null> {
    const db = this.db(opts);
    const saveRecord = { ...record };
    const keys: ModelField<T>[] = Object.keys(record) as ModelField<T>[];
    const keysWithoutId = keys.filter((k) => k !== this.idField);

    // Change undefined values to null
    for (const key of keysWithoutId) {
      if (saveRecord[key] === undefined) {
        // @ts-expect-error allow for null
        saveRecord[key] = null;
      }
    }

    if (!keysWithoutId.length) {
      throw new Error("NOTHING_TO_SAVE");
    }

    let id = record[this.idField];
    let recordExists = false;

    if (id !== undefined) {
      recordExists = !!(await db
        .table(this.table)
        .first("id")
        .where(this.idField, id));
    }

    if (recordExists) {
      delete saveRecord[this.idField];
      if (this.updatedField && !record[this.updatedField]) {
        (saveRecord[this.updatedField] as unknown as Date) = new Date();
      }
      await db(this.table)
        .where(this.idField, id as JsonPrimitive)
        .update(saveRecord);
    } else {
      if (this.createdField && !record[this.createdField]) {
        (saveRecord[this.createdField] as unknown as Date) = new Date();
      }
      const result = await db(this.table).insert(saveRecord, ["id"]);
      id = (result[0] as T)[this.idField];
    }
    if (opts.returnNew) {
      return this.fetch({ [this.idField]: id } as unknown as T, opts);
    }
    return null;
  }
  async saveAndFetch(record: Partial<T>, opts: Transactable = {}): Promise<T> {
    const result = await this.save(record, {
      returnNew: true,
      ...opts,
    });
    if (!result) {
      throw new Error("FAILED_TO_SAVE");
    }
    return result;
  }
  async fetch(record: Partial<T>, opts: Transactable = {}): Promise<T | null> {
    const db = this.db(opts);
    let promise = db<JsonObject>(this.table).where(record);
    if (this.deletedField) {
      promise = promise.andWhere(this.deletedField, null);
    }
    const result = await promise.first();
    if (!result) {
      return null;
    }
    let fetchedRecord = result as T;
    if (this.parseStrategy) {
      fetchedRecord = this.parseStrategy(result);
    }
    return fetchedRecord;
  }
  async fetchOrThrow(record: Partial<T>, opts: Transactable = {}): Promise<T> {
    const result = await this.fetch(record, opts);
    if (!result) {
      throw new Error("RECORD_NOT_FOUND");
    }
    return result;
  }
  async delete(record: Partial<T>, opts: Transactable = {}): Promise<void> {
    const db = this.db(opts);
    const found = await this.fetch(record, opts);
    if (found) {
      if (this.deleteStrategy) {
        await this.deleteStrategy(found, db, this);
      } else if (this.deletedField) {
        await this.save({ ...record, [this.deletedField]: new Date() });
      } else {
        throw new Error("DELETE_NOT_IMPLEMENTED");
      }
    }
  }
}
