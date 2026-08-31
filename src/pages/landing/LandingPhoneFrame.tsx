/** Phone mockup frame for marketing screenshots. */
export function LandingPhoneFrame({
  src,
  alt,
  priority,
  className = "",
}: {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  const webpSrc = src.replace(/\.png$/i, ".webp");
  const hasWebp = webpSrc !== src;

  return (
    <div
      className={`rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${className}`}
    >
      <div className="overflow-hidden rounded-[calc(1.75rem-0.375rem)] border border-white/10 bg-zinc-950">
        <picture>
          {hasWebp ? (
            <source type="image/webp" srcSet={webpSrc} />
          ) : null}
          <img
            src={src}
            alt={alt}
            width={390}
            height={809}
            className="aspect-[9/19] h-auto w-full object-contain object-top"
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "low"}
            decoding="async"
          />
        </picture>
      </div>
    </div>
  );
}
