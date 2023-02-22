# tiny-knex-orm

Knex is a flexible and battle tested query builder for node. Bookshelf is a popular ORM built on top
of the knex query builder, made by the same developers as knex. However, bookshelf has a cumbersome
and outdated syntax.

tiny-knex-orm does not try to be a full fledged ORM. Instead, it's a simple and clean library for
manipulating **single records**. If you're looking for a tool to query multiple records you can use
knex itself or a more full fledged ORM.

## Setup

`npm i tiny-knex-orm`

## Usage

```ts
import knex from "knex";
import { Model } from "tiny-knex-orm";
const db = knex({
  /*...*/
});

interface UserRecord {
  id: number;
  name: string;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

class UserModel extends Model<UserRecord> {
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

const User = new UserModel();

// Saves sally in the database
let sally = await User.save({ name: "Sally" });

// Updates Sally's name and updated_at timestamp
sally.name = "Sally Doe";
sally = await User.saveAndFetch(sally);

// Returns the user with id 271 if they exist, or null
const maybeJohn = await User.fetch({ id: 271 });

// Returns the user with id 271 or throws an error if they don't exist
const definitelyJohn = await User.fetchOrThrow({ id: 271 });

// Deletes the user with id 28 if they exist
await User.delete({ id: 28 });
```

### Config

#### Model Constructor

When you define a new model you can customize it with the following options:

table: string;
idField: ModelField<T>;
createdField?: ModelField<T>;
updatedField?: ModelField<T>;
deletedField?: ModelField<T>;
deleteStrategy?: (record: T, db: KnexType, model: Model<T>) => Promise<void>;
parseStrategy?: (record: JsonObject) => T;

- `db` (required, knex instance): knex database connection instance.
- `table` (required, string): the table to manipulate for this model.
- `idField` (required, string): the primary key field of the table
- `createdField` (optional, string): a timestamp field to set whenever a new record is created.
- `updatedField` (optional, string): a timestamp field to set whenever an existing record is update.
- `deletedField` (optional, string): a timestamp field to set to "soft" delete records. Note: either the `deletedField` or the `deleteStrategy` must be set in order to use Model.delete.
- `deleteStrategy` (optional, function): a function to be used for deleting. The function accepts three arguments: `record` (the record to be deleted), `db` (the knex instance), and `model` (the model). There is one built-in delete strategy `DeleteStrategy.hard()`, which will perform a permanent database delete operation when used. Note: either the `deletedField` or the `deleteStrategy` must be set in order to use Model.delete.
- `parseStrategy`: (optional, function): a function to be used for parsing raw database records. For example, timestamps may come back from the database as strings. If you want to parse them into Date objects before they are returned you can use this function. The function takes a json object record as a single argument and should return the record type associated with the model.

### Model.save

Save a new record, or update an existing record in the database.

#### Arguments

- `record` (required, plain object): The record to be saved. The record passed in should uniquely define a single row in the database (usually by specifying the id field). If the record matches multiple rows in the table, it will pick the first row.
- `options` (optional, save options object): Options to customize the save.
  - `db` (optional, knex instance or transaction): The knex instance or transaction instance to be used for the save. If not specified, it will use the knex instance that was configured in the constructor.
  - `returnNew` (optional, boolean): If true, returns the record that was just created or updated. Defaults to false.

#### Returns

If `returnNew` is true then the record that was just created or updated will be returned. Otherwise null.

### Model.saveAndFetch

Saves a record and returns the updated record. Equivalent to `Model.save({ ... }, { returnNew: true })`.

- `record` (required, plain object): The record to be saved. The record passed in should uniquely define a single row in the database (usually by specifying the id field). If the record matches multiple rows in the table, it will pick the first row.
- `options` (optional, save options object): Options to customize the save.
  - `db` (optional, knex instance or transaction): The knex instance or transaction instance to be used for the save. If not specified, it will use the knex instance that was configured in the constructor.

#### Returns

The record that was just created or updated will be returned. If the record failed to save it will throw a "FAILED_TO_SAVE" error.

### Model.fetch

Fetches a record from the database.

- `record` (required, plain object): The record to be fetched. Under the hood, `knex.where({ ... })` is used. Each property on the object must match the returned record. If multiple records match, the first one is chosen.
- `options` (optional, save options object): Options to customize the save.
  - `db` (optional, knex instance or transaction): The knex instance or transaction instance to be used for the save. If not specified, it will use the knex instance that was configured in the constructor.

#### Returns

The first record that matched the fetch criteria or null if nothing matched.

### Model.fetchOrThrow

Fetches a record from the database or throws an error if no record was found.

- `record` (required, plain object): The record to be fetched. Under the hood, `knex.where({ ... })` is used. Each property on the object must match the returned record. If multiple records match, the first one is chosen.
- `options` (optional, save options object): Options to customize the save.
  - `db` (optional, knex instance or transaction): The knex instance or transaction instance to be used for the save. If not specified, it will use the knex instance that was configured in the constructor.

#### Returns

The first record that matched the fetch criteria.

### Model.delete

Uses the `deleteStrategy` if one is specified or marks the `deletedField` on the matching record if one is specified. Either a `deleteStrategy` or a `deletedField` should be specified to use this method.

- `record` (required, plain object): The record to be deleted. Under the hood, `knex.where({ ... })` is used. Each property on the object must match the returned record. If multiple records match, the first one is chosen.
- `options` (optional, save options object): Options to customize the save.
  - `db` (optional, knex instance or transaction): The knex instance or transaction instance to be used for the save. If not specified, it will use the knex instance that was configured in the constructor.

#### Returns

Undefined.
