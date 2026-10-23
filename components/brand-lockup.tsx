import Image from "next/image";
import Link from "next/link";
import { BASE_PATH } from "@/lib/base-path";

type BrandLockupProps = {
  /** When set, wraps the lockup in a link. Omit on auth pages. */
  href?: string;
  size?: "sm" | "md";
  showWordmark?: boolean;
  /** "chrome" paints the wordmark for the navy app header. */
  tone?: "default" | "chrome";
};

const asset = (file: string) => (BASE_PATH ? `${BASE_PATH}/${file}` : `/${file}`);

/**
 * The full Ziki wordmark (mark + "ziki") from the redesign brand sheet.
 * "onDark" is the white wordmark for navy chrome; "onLight" the navy one.
 * `collapsed` shows only the brand mark, for the narrow sidebar rail.
 */
export function ZikiWordmark({
  tone = "onLight",
  collapsed = false,
  className = "",
}: {
  tone?: "onDark" | "onLight";
  collapsed?: boolean;
  className?: string;
}) {
  if (collapsed) {
    return (
      <Image
        src={asset("homepage/ziki-mark.svg")}
        alt="Ziki"
        width={30}
        height={25}
        className={`h-[25px] w-[30px] ${className}`}
        unoptimized
      />
    );
  }
  return (
    <Image
      src={asset(tone === "onDark" ? "ziki-logo-dark.png" : "ziki-logo-light.png")}
      alt="Ziki"
      width={110}
      height={36}
      className={`h-9 w-[110px] object-contain ${className}`}
      unoptimized
      priority
    />
  );
}

/** Icon-only mark from zedu-fe `public/login_logo.svg` (mark path, no wordmark). */
const sizes = {
  sm: { px: 28, className: "h-7 w-7" },
  md: { px: 44, className: "h-11 w-11" },
} as const;

export function BrandLockup({
  href,
  size = "sm",
  showWordmark = true,
  tone = "default",
}: BrandLockupProps) {
  const dim = sizes[size];
  const wordmarkColor = tone === "chrome" ? "text-porcelain" : "text-slate-900";
  const content = (
    <>
      <Image
        src={BASE_PATH ? `${BASE_PATH}/ziki-logo.png` : "/ziki-logo.png"}
        alt=""
        width={dim.px}
        height={dim.px}
        className={dim.className}
        unoptimized
        priority={size === "md"}
      />
      {showWordmark ? (
        <span
          className={
            size === "md"
              ? `text-2xl font-semibold tracking-tight ${wordmarkColor}`
              : `whitespace-nowrap text-lg font-semibold tracking-tight ${wordmarkColor}`
          }
        >
          Ziki
        </span>
      ) : null}
    </>
  );

  if (!href) {
    return (
      <div className="inline-flex items-center gap-2.5" aria-label="Ziki">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2.5 rounded-md ${
        tone === "chrome"
          ? "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-tint focus-visible:ring-offset-2 focus-visible:ring-offset-deep-ocean"
          : ""
      }`}
      aria-label="Ziki"
    >
      {content}
    </Link>
  );
}
