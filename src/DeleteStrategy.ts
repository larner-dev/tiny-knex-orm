import { Knex } from "knex";
import { JsonPrimitive } from "type-fest";
import { Model } from "./model";

type DeleteStrategyType<T> = (
  record: T,
  db: Knex<Record<string, unknown>, unknown>,
  model: Model<T>
) => Promise<void>;

interface DeleteStrategyTypes {
  hard: <T>() => DeleteStrategyType<T>;
}

export const DeleteStrategy: DeleteStrategyTypes = {
  hard: () => async (record, db, model) => {
    await db(model.table)
      .where(model.idField, record[model.idField] as JsonPrimitive)
      .delete();
  },
};
