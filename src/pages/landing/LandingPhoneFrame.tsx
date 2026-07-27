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
  return (
    <div
      className={`overflow-hidden rounded-[1.5rem] border border-white/12 bg-zinc-950 shadow-[0_28px_80px_-28px_rgba(14,165,233,0.45)] ring-1 ring-white/5 ${className}`}
    >
      <img
        src={src}
        alt={alt}
        width={390}
        height={844}
        className="aspect-[9/17] h-auto w-full object-cover object-top"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
      />
    </div>
  );
}
