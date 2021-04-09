import { ServiceResponse, TableQuery, TableService } from "azure-storage";

import { Either, isLeft, left, right } from "fp-ts/lib/Either";

import { FiscalCodeHash } from "../generated/definitions/FiscalCodeHash";

/**
 * A minimal storage table Entry
 */
type TableEntry = Readonly<{
  // eslint-disable-next-line @typescript-eslint/naming-convention
  readonly RowKey: Readonly<{
    readonly _: string;
  }>;
}>;

/**
 * A function that returns a page of query reults given a pagination token
 *
 * @see https://docs.microsoft.com/en-us/rest/api/storageservices/query-timeout-and-pagination
 */
export type PagedQuery = (
  currentToken: TableService.TableContinuationToken
) => Promise<Either<Error, TableService.QueryEntitiesResult<TableEntry>>>;

/**
 * Returns a paged query function for a certain query on a storage table
 */
export const getPagedQuery = (tableService: TableService, table: string) => (
  tableQuery: TableQuery
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
): PagedQuery => currentToken =>
  new Promise(resolve =>
    tableService.queryEntities(
      table,
      tableQuery,
      currentToken,
      (
        error: Error,
        result: TableService.QueryEntitiesResult<TableEntry>,
        response: ServiceResponse
      ) => resolve(response.isSuccessful ? right(result) : left(error))
    )
  );

/**
 * Iterates over all pages of entries returned by the provided paged query
 * function.
 *
 * @throws Exception on query failure
 */
async function* iterateOnPages(
  pagedQuery: PagedQuery
): AsyncIterableIterator<ReadonlyArray<TableEntry>> {
  // eslint-disable-next-line functional/no-let
  let token: TableService.TableContinuationToken = null;
  do {
    // query for a page of entries
    const errorOrResults = await pagedQuery(token);
    if (isLeft(errorOrResults)) {
      // throw an exception in case of error
      throw errorOrResults.value;
    }
    // call the async callback with the current page of entries
    const results = errorOrResults.value;
    yield results.entries;
    // update the continuation token, the loop will continue until
    // the token is defined
    token = results.continuationToken;
  } while (token !== undefined && token !== null);
}

/**
 * Extracts a user ID hash from a table entry.
 *
 * @see https://github.com/teamdigitale/io-functions-app/blob/master/UpdateSubscriptionsFeedActivity/index.ts
 */
const hashFromEntry = (e: TableEntry): FiscalCodeHash | undefined => {
  const rowKey = e.RowKey._;
  const parts = rowKey.split("-");
  return parts.length === 6 || parts.length === 7
    ? (parts[parts.length - 1] as FiscalCodeHash)
    : undefined;
};

/**
 * Do something with the user hash extracted from the table entry
 */
const withHashFromEntry = (f: (s: FiscalCodeHash) => void) => (
  e: TableEntry
): void => {
  const hash = hashFromEntry(e);
  if (hash !== undefined) {
    f(hash);
  }
};

/**
 * Fetches all user hashed returned by the provided paged query
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export async function queryUsers(
  pagedQuery: PagedQuery
): Promise<ReadonlySet<FiscalCodeHash>> {
  const entries = new Set<FiscalCodeHash>();
  const addToSet = withHashFromEntry(s => entries.add(s));
  for await (const page of iterateOnPages(pagedQuery)) {
    page.forEach(addToSet);
  }
  return entries;
}

/**
 * Returns a query filter to get the RowKey(s) for all entries that have the
 * provided partition key
 */
export const queryFilterForKey = (partitionKey: string): TableQuery =>
  new TableQuery().select("RowKey").where("PartitionKey == ?", partitionKey);
