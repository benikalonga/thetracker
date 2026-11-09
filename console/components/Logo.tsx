export default function Logo({ size = 28, light }: { size?: number; light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" width={size} height={size} />
      <span className={`font-extrabold tracking-tight ${light ? 'text-white' : 'text-ink'}`} style={{ fontSize: size * 0.68 }}>TheTracker</span>
    </span>
  );
}
