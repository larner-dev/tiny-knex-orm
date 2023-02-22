import { Knex } from "knex";

export interface Transactable {
  db?: Knex<Record<string, unknown>, unknown>;
}
