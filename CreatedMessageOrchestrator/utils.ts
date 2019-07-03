import { Function2 } from "fp-ts/lib/function";

/**
 * Extracts the input type of an activity handler
 */
// tslint:disable-next-line: no-any
export type HandlerInputType<T> = T extends Function2<any, infer A, any>
  ? A
  : never;
