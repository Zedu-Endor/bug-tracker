"use client";

import { useState } from "react";
import Image from "next/image";
import { formatOverflowCount, getInitials, type VoterInfo } from "@/lib/voters";

type VoterAvatarsProps = {
  voters: VoterInfo[];
  totalCount: number;
  size?: "sm" | "md";
  className?: string;
};

function SingleAvatar({
  voter,
  size,
}: {
  voter: VoterInfo;
  size: "sm" | "md";
}) {
  const [imageError, setImageError] = useState(false);
  const initials = getInitials(voter.name);
  const isSm = size === "sm";
  const dimension = isSm ? 20 : 28;

  return (
    <div
      title={voter.name}
      aria-label={voter.name}
      className={`relative inline-flex items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-700 ring-white select-none ${
        isSm ? "h-5 w-5 text-[9px] ring-1" : "h-7 w-7 text-xs ring-2"
      }`}
    >
      {voter.image && !imageError ? (
        <Image
          src={voter.image}
          alt={voter.name}
          title={voter.name}
          width={dimension}
          height={dimension}
          onError={() => setImageError(true)}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

export function VoterAvatars({
  voters,
  totalCount,
  size = "sm",
  className = "",
}: VoterAvatarsProps) {
  if (totalCount === 0 || !voters || voters.length === 0) {
    return null;
  }

  const isSm = size === "sm";
  const visibleVoters = voters.slice(0, 3);
  const overflow = formatOverflowCount(totalCount, 3);

  return (
    <div
      className={`inline-flex items-center ${
        isSm ? "-space-x-1.5" : "-space-x-2"
      } ${className}`}
      aria-label={`${totalCount} reaction${totalCount === 1 ? "" : "s"}`}
    >
      {visibleVoters.map((voter) => (
        <SingleAvatar key={voter.id} voter={voter} size={size} />
      ))}
      {overflow ? (
        <div
          title={`${totalCount - 3} more`}
          aria-label={`${totalCount - 3} more voters`}
          className={`relative inline-flex items-center justify-center rounded-full bg-slate-100 font-bold text-slate-600 ring-white tabular-nums select-none ${
            isSm ? "h-5 w-5 text-[9px] ring-1" : "h-7 w-7 text-xs ring-2"
          }`}
        >
          {overflow}
        </div>
      ) : null}
    </div>
  );
}
