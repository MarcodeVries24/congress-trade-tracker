import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * next/link, without prefetching unless a link asks for it.
 *
 * Next prefetches every link that scrolls into view, and for these pages a
 * prefetch is a server render: a list of 50 trades asked the server for 50
 * trade pages before anyone clicked one, and a crawler reading the lists
 * multiplied that across the site. A page now loads when it is clicked, from
 * the cache in most cases, which is fast enough that nobody misses the head
 * start.
 */
export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
