// Stand-in for @clerk/nextjs/server so the test never loads the real client.
export async function clerkClient(): Promise<never> {
  throw new Error("the real Clerk client must not be reached in this test");
}
