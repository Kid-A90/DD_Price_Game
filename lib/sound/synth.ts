"use client";

/** Original Web Audio cues. No television-show recordings are embedded. */
function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return AudioContextClass ? new AudioContextClass() : null;
}

function tone(ctx: AudioContext, frequency: number, start: number, duration: number, gain = 0.08, type: OscillatorType = "square") {
  const oscillator = ctx.createOscillator();
  const volume = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  volume.gain.setValueAtTime(0.0001, start);
  volume.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(volume).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

export async function playCue(cue: "tick" | "lock" | "reveal" | "tie" | "winner") {
  const ctx = context();
  if (!ctx) return;
  await ctx.resume();
  const now = ctx.currentTime + 0.02;

  if (cue === "tick") tone(ctx, 720, now, 0.08, 0.04, "sine");
  if (cue === "lock") {
    tone(ctx, 440, now, 0.12);
    tone(ctx, 660, now + 0.11, 0.16);
  }
  if (cue === "reveal") {
    [392, 523, 659, 784].forEach((frequency, index) => tone(ctx, frequency, now + index * 0.09, 0.25, 0.07, "sawtooth"));
  }
  if (cue === "tie") {
    tone(ctx, 250, now, 0.18, 0.07, "square");
    tone(ctx, 250, now + 0.25, 0.18, 0.07, "square");
  }
  if (cue === "winner") {
    [392, 494, 587, 784, 988].forEach((frequency, index) => tone(ctx, frequency, now + index * 0.1, 0.4, 0.08, "triangle"));
  }
}
