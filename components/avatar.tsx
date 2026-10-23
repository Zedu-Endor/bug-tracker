"use client";

import { avatarTone, AVATAR_SIZES, safeAvatarUrl, type AvatarSize } from "@/lib/avatar";
import { initialsOf } from "@/lib/header-nav";

/**
 * A person's picture, or their initials on a colour derived from their name
 * (#290). Used everywhere a person is shown, so they look the same on every
 * page.
 *
 * Decorative: the name is always written next to it, so the whole thing is
 * `aria-hidden` and the image has `alt=""`. A screen reader says the name
 * once, not "Ada Lovelace Ada Lovelace".
 *
 * The box has a fixed size and the initials sit underneath the image, so:
 *  - while the picture loads, the initials are already there
 *  - if it fails (a dead URL, a blocked host), it's hidden and the initials
 *    show, with nothing moving.
 *
 * The image is requested with no referrer, so the image host doesn't learn
 * which page of this app the person was reading.
 */
export function Avatar({
  name,
  image,
  size = "sm",
  variant = "tone",
  className = "",
}: {
  name?: string | null;
  image?: string | null;
  size?: AvatarSize;
  /**
   * "tone" is the shared pastel colour derived from the name. "solid" is the
   * saturated green used on the navy chrome (the header and sidebar account
   * cards), where the pastel tints do not read against the dark background.
   * "brand" is the redesign's account avatar: white initials on primary blue.
   */
  variant?: "tone" | "solid" | "brand";
  className?: string;
}) {
  const src = safeAvatarUrl(image);
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold ${AVATAR_SIZES[size]} ${
        variant === "solid"
          ? "bg-emerald-700 text-white"
          : variant === "brand"
            ? "bg-primary font-extrabold text-white"
            : avatarTone(name)
      } ${className}`}
    >
      {initialsOf(name)}
      {src ? (
        /* A plain <img>: the host varies by sign-in provider, so it can't be allow-listed for next/image. */
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          onError={hide}
          // An image that already failed before this component hydrated
          // never fires `error` again, so check it once on mount.
          ref={hideIfAlreadyBroken}
        />
      ) : null}
    </span>
  );
}

function hide(event: { currentTarget: HTMLImageElement }) {
  event.currentTarget.style.display = "none";
}

function hideIfAlreadyBroken(img: HTMLImageElement | null) {
  if (img && img.complete && img.naturalWidth === 0) img.style.display = "none";
}
