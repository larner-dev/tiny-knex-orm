import { JsonObject, JsonPrimitive } from "type-fest";
import { Knex } from "knex";
import { Transactable } from "./types/types";
import EventEmitter from "events";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KnexType = Knex<any, unknown>;

interface Errors {
  NOTHING_TO_SAVE?: unknown;
  FAILED_TO_SAVE?: unknown;
  RECORD_NOT_FOUND?: unknown;
  DELETE_NOT_IMPLEMENTED?: unknown;
}

export interface ModelOptions<T> {
  db: KnexType;
  table: string;
  idField: ModelField<T>;
  createdField?: ModelField<T>;
  updatedField?: ModelField<T>;
  deletedField?: ModelField<T>;
  deleteStrategy?: (record: T, db: KnexType, model: Model<T>) => Promise<void>;
  parseStrategy?: (record: JsonObject) => T;
  errors?: Errors;
}

export interface ModelEvent<T> {
  create: (record: Partial<T>, finalRecord: T) => void;
  update: (record: Partial<T>, finalRecord: T) => void;
  delete: (deletedRecord: T) => void;
}

type ModelField<T> = Extract<keyof T, string>;

interface SaveOptions extends Transactable {
  returnNew?: boolean;
}

export abstract class Model<T> extends EventEmitter {
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
  public readonly errors?: Errors;

  constructor(params: ModelOptions<T>) {
    super();
    this._db = params.db;
    this.table = params.table;
    this.idField = params.idField;
    this.createdField = params.createdField;
    this.updatedField = params.updatedField;
    this.deletedField = params.deletedField;
    this.parseStrategy = params.parseStrategy;
    this.deleteStrategy = params.deleteStrategy;
    this.errors = params.errors;
  }

  on<K extends keyof ModelEvent<T>>(
    event: K,
    listener: ModelEvent<T>[K]
  ): this {
    return super.on(event as string, listener);
  }

  addListener<K extends keyof ModelEvent<T>>(
    event: K,
    listener: ModelEvent<T>[K]
  ): this {
    return super.on(event as string, listener);
  }

  emit<K extends keyof ModelEvent<T>>(
    event: K,
    ...args: Parameters<ModelEvent<T>[K]>
  ): boolean {
    return super.emit(event as string, ...args);
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
      throw this.errors?.NOTHING_TO_SAVE || new Error("NOTHING_TO_SAVE");
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
    let newRecord: T | null = null;
    if (opts.returnNew) {
      newRecord = await this.fetch(
        { [this.idField]: id } as unknown as T,
        opts
      );
    }
    const emitUpdate = recordExists && this.listenerCount("update") > 0;
    const emitCreate = !recordExists && this.listenerCount("create") > 0;
    if ((emitCreate || emitUpdate) && !newRecord) {
      newRecord = await this.fetchOrThrow(
        { [this.idField]: id } as unknown as T,
        opts
      );
    }
    // We're in a transaction, wait for the commit before sending events
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trx = opts.db as Knex.Transaction<any, any[]> | null;
    if (trx?.commit) {
      trx.commit().then(() => {
        if (emitCreate) {
          this.emit("create", record, newRecord!);
        }
        if (emitUpdate) {
          this.emit("update", record, newRecord!);
        }
      });
    } else if (emitCreate) {
      this.emit("create", record, newRecord!);
    } else if (emitUpdate) {
      this.emit("update", record, newRecord!);
    }

    if (opts.returnNew) {
      return newRecord;
    }

    return null;
  }
  async saveAndFetch(record: Partial<T>, opts: Transactable = {}): Promise<T> {
    const result = await this.save(record, {
      returnNew: true,
      ...opts,
    });
    if (!result) {
      throw this.errors?.FAILED_TO_SAVE || new Error("FAILED_TO_SAVE");
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
      throw this.errors?.RECORD_NOT_FOUND || new Error("RECORD_NOT_FOUND");
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
        throw (
          this.errors?.DELETE_NOT_IMPLEMENTED ||
          new Error("DELETE_NOT_IMPLEMENTED")
        );
      }
      // We're in a transaction, wait for the commit before sending events
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const trx = opts.db as Knex.Transaction<any, any[]> | null;
      if (trx?.commit) {
        trx.commit().then(() => {
          this.emit("delete", found);
        });
      } else {
        this.emit("delete", found);
      }
    }
  }
}
