const TOP = 20;
const RIGHT = 9;
const BOTTOM = 20;
const LEFT = 9;
const CHASE_SECONDS = 0.9;

/** Bulbs around the maroon door ring; 3-phase marquee chase (every third bulb
 *  lit, stepping around the perimeter like the original big-door sign). */
export function DoorLights() {
  const dots: { key: number; style: React.CSSProperties }[] = [];
  let idx = 0;
  for (let i = 0; i < TOP; i++) {
    dots.push({ key: idx++, style: { top: 0, left: `${3.5 + (i * 93) / (TOP - 1)}%` } });
  }
  for (let i = 0; i < RIGHT; i++) {
    dots.push({ key: idx++, style: { right: 0, top: `${9 + (i * 82) / (RIGHT - 1)}%` } });
  }
  for (let i = 0; i < BOTTOM; i++) {
    dots.push({ key: idx++, style: { bottom: 0, left: `${96.5 - (i * 93) / (BOTTOM - 1)}%` } });
  }
  for (let i = 0; i < LEFT; i++) {
    dots.push({ key: idx++, style: { left: 0, top: `${91 - (i * 82) / (LEFT - 1)}%` } });
  }
  return (
    <div className="door-lights" aria-hidden="true">
      {dots.map((d) => (
        <span
          key={d.key}
          className="door-dot"
          style={{ ...d.style, animationDelay: `${(((d.key % 3) / 3) * CHASE_SECONDS).toFixed(2)}s` }}
        />
      ))}
    </div>
  );
}
