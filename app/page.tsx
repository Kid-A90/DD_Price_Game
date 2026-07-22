import Image from "next/image";
import { RetroStage } from "@/components/RetroStage";
import { RouteCard } from "@/components/RouteCard";

export default function HomePage() {
  return (
    <RetroStage>
      <section className="stage-panel" style={{ textAlign: "center" }}>
        <Image
          className="hero-sign"
          src="/ui/tpir-logo.webp"
          alt="The Price Is Right"
          width={595}
          height={672}
          priority
        />
        <p className="hero-copy" style={{ margin: "1.5rem auto 0" }}>
          A live four-team pricing game. Team laptops submit paid-price guesses, the projector follows the action, and the admin controls pace without entering routine scores.
        </p>
        <div className="route-grid">
          <RouteCard href="/join" className="team" title="Team Laptop">Choose a team color, add names, and enter guesses.</RouteCard>
          <RouteCard href="/display" className="display" title="Public Display">Project the product, timer, lock status, reveals, and scores.</RouteCard>
          <RouteCard href="/admin" className="admin" title="Admin Control">Create the session, open questions, reveal, and advance.</RouteCard>
        </div>
      </section>
    </RetroStage>
  );
}
