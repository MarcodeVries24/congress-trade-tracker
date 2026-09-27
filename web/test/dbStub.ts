// Stand-in for @/lib/db so the session-limit test never opens a connection.
// The entitlement function is injected in that suite, so nothing should reach
// this; if something does, it should fail loudly rather than quietly hit a
// real database from a unit test.
export const sql = {
  query: async (): Promise<never> => {
    throw new Error("the database must not be reached in this test");
  },
};
export const PUBLISHED_FILING_SQL = "";
export const PLAUSIBLE_DATES_SQL = "";
export const VOLUME_MIDPOINT_SQL = "";
