import Image from "next/image";
import { RetroStage } from "@/components/RetroStage";
import { RouteCard } from "@/components/RouteCard";

export default function HomePage() {
  return (
    <RetroStage>
      <section className="stage-panel">
        <div className="hero-grid">
          <div>
            <h1 className="hero-title">The Price <span>Is Right</span></h1>
            <p className="hero-copy">
              A live four-team pricing game. Team laptops submit paid-price guesses, the projector follows the action, and the admin controls pace without entering routine scores.
            </p>
          </div>
          <Image className="hero-sign" src="/ui/tpir-logo.svg" alt="The Price Is Right" width={1000} height={620} priority />
        </div>
        <div className="route-grid">
          <RouteCard href="/join" className="team" title="Team Laptop">Choose a team color, add names, and enter guesses.</RouteCard>
          <RouteCard href="/display/DEMO" className="display" title="Public Display">Project the product, timer, lock status, reveals, and scores.</RouteCard>
          <RouteCard href="/admin/DEMO" className="admin" title="Admin Control">Create the session, open questions, reveal, and advance.</RouteCard>
        </div>
      </section>
    </RetroStage>
  );
}
