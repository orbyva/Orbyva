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
      className={`overflow-hidden rounded-[1.5rem] border border-white/12 bg-zinc-950 shadow-[0_28px_80px_-28px_rgba(14,165,233,0.45)] ring-1 ring-white/5 ${className}`}
    >
      <picture>
        {hasWebp ? (
          <source type="image/webp" srcSet={webpSrc} />
        ) : null}
        <img
          src={src}
          alt={alt}
          width={390}
          height={809}
          className="aspect-[9/17] h-auto w-full object-cover object-top"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding={priority ? "sync" : "async"}
        />
      </picture>
    </div>
  );
}
