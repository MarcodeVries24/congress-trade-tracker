import Link from "next/link";
import { MemberPhoto } from "./MemberPhoto";
import type { ProofFace } from "@/lib/upgradeProof";

/**
 * The faces on a page that is asking for money — belonging to the people the
 * product is about, not to invented customers.
 *
 * These are the members who file most, with their official portraits, each
 * linking to their own page. It puts real, recognisable human beings above
 * the fold, and every one of them is checkable: the alternative, stock
 * photographs standing in for subscribers, is the sort of thing an audience
 * that came here to check on politicians would reverse-image-search for
 * sport.
 */
export function MemberFaces({ faces, total }: { faces: ProofFace[]; total: number }) {
  if (faces.length < 4) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <ul className="flex -space-x-2">
        {faces.map((face) => (
          <li key={face.slug} className="transition-transform hover:z-10 hover:-translate-y-0.5">
            <Link href={`/politicians/${face.slug}`} title={`${face.name} — ${face.trades.toLocaleString("en-US")} trades`}>
              <MemberPhoto
                name={face.name}
                photoUrl={face.photoUrl}
                className="h-9 w-9 ring-2 ring-bg"
              />
              <span className="sr-only">{face.name}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-muted">
        Every trade by <span className="font-medium text-ink">{total.toLocaleString("en-US")} members</span>, including
        the ones who file most.
      </p>
    </div>
  );
}
