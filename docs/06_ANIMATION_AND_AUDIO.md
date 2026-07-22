# Animation and Audio

## Motion principles

Animations should make results feel important without slowing the host.

- Most transitions: 180–450 ms.
- Major reveal: 900–1,500 ms.
- Final winner: up to 3 seconds, then settle into a readable state.
- All animation states must have a reduced-motion alternative.
- Game state must never depend on an animation finishing.

## Cue map

### Lobby lock

- Four team bays snap into position.
- Bulbs chase once around the frame.

### Question open

- Scenic doors or panels slide apart.
- Product rises or scales from 92% to 100%.
- Timer pops into place.

### Team lock

- Team bay flashes once.
- Status changes to `LOCKED` with a short original two-note cue.

### Ten-second warning

- Timer changes to warm orange/red.
- One restrained tick per second.

### Price reveal

- Mechanical digits flip or roll.
- Paid price lands with a thick shadow.
- Chasing bulbs run left to right.

### Point winner

- Winning team color expands behind the product.
- `+3`, `+1`, or exact bonus tag slams into view.
- Use `win-burst.svg` as an original starting asset.

### Tie

- Screen freezes into a split color treatment for eligible teams.
- `AVERAGE COST TIE-BREAK` appears.
- Only eligible team laptops receive the new input.

### Leaderboard

- Scores count up from previous total.
- Changed teams briefly pulse.

### Final winner

- Full-frame bulb chase.
- Team color flood.
- Confetti built from original geometric shapes.
- Names and final score remain readable after the animation.

## Audio

`lib/sound/synth.ts` provides original Web Audio tones for tick, lock, reveal, tie, and winner cues. It avoids copyrighted recordings and works without audio files.

Licensed replacement sounds can be added later through a centralized cue map. Include a mute control and remember browser autoplay restrictions require a user interaction before sound can start.
