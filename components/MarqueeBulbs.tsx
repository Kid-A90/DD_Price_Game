export function MarqueeBulbs({ count = 9, animating }: { count?: number; animating?: boolean }) {
  return (
    <div className={`marquee-strip${animating ? " animating" : ""}`} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span className="marquee-bulb" key={index} />
      ))}
    </div>
  );
}
