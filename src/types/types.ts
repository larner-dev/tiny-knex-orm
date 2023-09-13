import { Knex } from "knex";

export interface Transactable {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db?: Knex<Record<string, unknown>, unknown> | Knex.Transaction<any, any[]>;
}
