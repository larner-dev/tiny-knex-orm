# tiny-knex-orm

A small library for saving, fetching and deleting single database records with [knex](https://knexjs.org).

You describe a table once as a `Model`. The model then creates or updates a record in one call, fills in created and updated timestamps, supports soft deletes, runs inside knex transactions, and emits an event after each change.

## Install

```sh
npm i tiny-knex-orm knex
```

`knex` 3.x is a peer dependency. The package ships an ES module build, a CommonJS build and TypeScript types.

## Define a model

Extend `Model` with the type of a row, and pass the table's options to `super`.

```ts
import knex from "knex";
import { Model } from "tiny-knex-orm";

interface User {
  id: number;
  name: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

const db = knex({ client: "pg", connection: process.env.DATABASE_URL });

class UserModel extends Model<User> {
  constructor() {
    super({
      db,
      table: "users",
      idField: "id",
      createdField: "created_at",
      updatedField: "updated_at",
      deletedField: "deleted_at",
    });
  }
}

export const Users = new UserModel();
```

### Options

| Option           | Required | Description                                                                                                                      |
| ---------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `db`             | yes      | The knex instance the model uses when a call passes no `db` of its own.                                                          |
| `table`          | yes      | The table name.                                                                                                                  |
| `idField`        | yes      | The primary key column. `save` uses it to choose between an insert and an update.                                                |
| `createdField`   | no       | A column that `save` sets to `new Date()` when it inserts a record that has no value for it.                                     |
| `updatedField`   | no       | A column that `save` sets to `new Date()` when it updates a record that has no value for it.                                     |
| `deletedField`   | no       | Turns on soft deletes. `delete` sets this column to `new Date()`, and `fetch` skips every row where it is not null.              |
| `deleteStrategy` | no       | `(record, db, model) => Promise<void>`, which `delete` calls in place of a soft delete. `DeleteStrategy.hard()` deletes the row. |
| `parseStrategy`  | no       | `(row) => T`, applied to every row that `fetch` returns, for example to turn date strings into `Date` objects.                   |
| `errors`         | no       | Values to throw in place of the default errors, keyed by error code. See [Errors](#errors).                                      |

## Methods

Every method takes an optional last argument with a `db` field: a knex transaction to run the queries in. See [Transactions](#transactions).

### `save(record, { returnNew, db })`

If `record` has an id and a row with that id exists, `save` updates that row with the other fields of `record`. Otherwise it inserts `record` as a new row. A field set to `undefined` is written as `null`.

`save` resolves to `null`, or to the saved row when `returnNew` is `true`. It throws `NOTHING_TO_SAVE` when `record` has no field other than the id.

```ts
await Users.save({ name: "Ada" });
await Users.save({ id: 1, name: "Ada Lovelace" });
```

### `saveAndFetch(record, { db })`

Does the same as `save` with `returnNew: true`, but always resolves to the saved row. It throws `FAILED_TO_SAVE` when the saved row cannot be read back.

```ts
const user = await Users.saveAndFetch({ name: "Ada" });
```

### `fetch(where, { db })`

Resolves to the first row that matches every field of `where`, or to `null` when no row matches. With `deletedField`, a soft deleted row never matches. With `parseStrategy`, the row goes through it before it is returned.

```ts
const user = await Users.fetch({ id: 1 });
```

### `fetchOrThrow(where, { db })`

Does the same as `fetch`, but throws `RECORD_NOT_FOUND` when no row matches.

### `delete(where, { db })`

Fetches the first row that matches `where` and deletes it:

- With `deleteStrategy`, it calls the strategy with the row.
- Otherwise, with `deletedField`, it sets that column to `new Date()`.
- Otherwise, it throws `DELETE_NOT_IMPLEMENTED`.

When no row matches, `delete` does nothing.

```ts
import { DeleteStrategy, Model } from "tiny-knex-orm";

class SessionModel extends Model<Session> {
  constructor() {
    super({
      db,
      table: "sessions",
      idField: "id",
      deleteStrategy: DeleteStrategy.hard(),
    });
  }
}

await new SessionModel().delete({ id: 1 });
```

## Transactions

Pass a knex transaction as `db` to run a call inside it.

```ts
await db.transaction(async (trx) => {
  const user = await Users.saveAndFetch({ name: "Ada" }, { db: trx });
  await Users.save({ id: user.id, name: "Ada Lovelace" }, { db: trx });
});
```

The package also exports `Transactable`, the type of that last argument, for your own functions that pass a transaction through to a model.

## Events

A model is an `EventEmitter` with typed events.

| Event    | Listener arguments      | Emitted by                      |
| -------- | ----------------------- | ------------------------------- |
| `create` | `(record, finalRecord)` | `save`, when it inserts a row   |
| `update` | `(record, finalRecord)` | `save`, when it updates a row   |
| `delete` | `(deletedRecord)`       | `delete`, when it deletes a row |

`record` is the object passed to `save`. `finalRecord` is the row as the database holds it after the write, which the model reads only when the event has a listener. `deletedRecord` is the row as it was before `delete`.

```ts
Users.on("create", (record, user) => {
  console.log(`Created ${record.name} with id ${user.id}`);
});
```

Inside a transaction, the model waits for the transaction to commit before it emits. When the transaction rolls back with an error, the model emits nothing. Knex does not tell a commit apart from two other cases, so the event still fires in them: a call to `trx.rollback()` with no error, and a nested transaction that releases its savepoint before the outer transaction rolls back.

## Errors

The model throws `new Error(code)`, or the value that the `errors` option gives for that code.

| Code                     | Thrown by                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `NOTHING_TO_SAVE`        | `save` and `saveAndFetch`, when the record has no field other than the id.                        |
| `FAILED_TO_SAVE`         | `saveAndFetch`, when the saved row cannot be read back.                                           |
| `RECORD_NOT_FOUND`       | `fetchOrThrow`, when no row matches, and `save`, when it cannot read back the row for a listener. |
| `DELETE_NOT_IMPLEMENTED` | `delete`, when the model has neither `deleteStrategy` nor `deletedField`.                         |

```ts
class UserModel extends Model<User> {
  constructor() {
    super({
      db,
      table: "users",
      idField: "id",
      errors: { RECORD_NOT_FOUND: new Error("User not found") },
    });
  }
}
```

## Development

```sh
yarn
yarn test
yarn build
```

The tests run against an in-memory SQLite database.

## License

MIT
