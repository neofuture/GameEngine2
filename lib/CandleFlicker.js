import * as THREE from "three";

/**
 * Candle / torch flicker for point lights. Per light we capture the original
 * intensity and colour, then on each `update(time)` we drive a smooth wobble
 * (sum of sines at varied frequencies) plus rare quick dip events that
 * mimic a draft hitting the flame. Colour stays anchored on the base hue —
 * the eye reads the change mostly as brightness, and shifting hue can make
 * the wall textures look wrong.
 */

const TWO_PI = Math.PI * 2;

/**
 * Multi-octave sine "noise" — smooth, deterministic, and cheap. Output is
 * roughly in [-1, 1] but biased a little below zero on average (so a candle
 * is more often dim than full-bright, which feels right).
 */
function candleNoise(t, seed) {
  return (
    0.45 * Math.sin(t * 7.3 + seed) +
    0.3 * Math.sin(t * 13.1 + seed * 1.7) +
    0.18 * Math.sin(t * 23.7 + seed * 2.3) +
    0.1 * Math.sin(t * 41.2 + seed * 3.1)
  );
}

/**
 * Capture base intensity / colour so the flicker can modulate around them.
 * Safe to call multiple times — already-initialised lights are skipped.
 *
 * @param {THREE.Light[]} lights
 * @param {{ baseFactor?: number, wobbleAmp?: number, dipMinGap?: number, dipMaxGap?: number, dipMinStrength?: number, dipMaxStrength?: number, dipDuration?: number }} [opts]
 */
export function initCandleFlicker(lights, opts = {}) {
  const cfg = {
    // Average multiplier around which the wobble sits. Candles never sit
    // at full brightness — they're constantly drifting under their peak.
    baseFactor: opts.baseFactor ?? 0.88,
    // ± multiplier added on top of baseFactor by the smooth wobble.
    wobbleAmp: opts.wobbleAmp ?? 0.12,
    // Seconds between random "draft hit" dip events.
    dipMinGap: opts.dipMinGap ?? 1.4,
    dipMaxGap: opts.dipMaxGap ?? 4.8,
    // Strength of the dip (fraction of intensity removed at the peak of
    // the event). 0.4 = dip down to 60% of the wobble value.
    dipMinStrength: opts.dipMinStrength ?? 0.35,
    dipMaxStrength: opts.dipMaxStrength ?? 0.6,
    // Duration of one dip event, in seconds.
    dipDuration: opts.dipDuration ?? 0.14,
  };

  for (const light of lights) {
    if (!light || light.userData?.candleFlicker) continue;
    light.userData.candleFlicker = {
      cfg,
      baseIntensity: light.intensity,
      baseColor: light.color.clone(),
      seed: Math.random() * TWO_PI * 50,
      nextDipTime:
        0.5 + cfg.dipMinGap + Math.random() * (cfg.dipMaxGap - cfg.dipMinGap),
      dipEndTime: -1,
      dipStrength: 0,
    };
  }
}

/**
 * Drive each flickering light's intensity for the current frame. `time` is
 * a monotonically increasing seconds value (e.g. `performance.now() / 1000`).
 *
 * @param {THREE.Light[]} lights
 * @param {number} time
 */
export function updateCandleFlicker(lights, time) {
  for (const light of lights) {
    const data = light?.userData?.candleFlicker;
    if (!data) continue;
    const cfg = data.cfg;

    // Smooth low-frequency wobble around baseFactor.
    const wobble = candleNoise(time, data.seed);
    let factor = cfg.baseFactor + wobble * cfg.wobbleAmp;

    // Periodic sharp dip — rolled when the previous gap elapses.
    if (time > data.nextDipTime) {
      data.dipEndTime = time + cfg.dipDuration;
      data.nextDipTime =
        time +
        cfg.dipMinGap +
        Math.random() * (cfg.dipMaxGap - cfg.dipMinGap);
      data.dipStrength =
        cfg.dipMinStrength +
        Math.random() * (cfg.dipMaxStrength - cfg.dipMinStrength);
    }
    if (time < data.dipEndTime) {
      const phase = (data.dipEndTime - time) / cfg.dipDuration;
      // Triangle-ish envelope so the dip eases in and out instead of
      // popping. Math.sin(πx) peaks at 1 at the midpoint of the event.
      const env = Math.sin(THREE.MathUtils.clamp(phase, 0, 1) * Math.PI);
      factor *= 1 - data.dipStrength * env;
    }

    // Clamp so a particularly bad random combo can't drive the light
    // negative or way past full power.
    factor = THREE.MathUtils.clamp(factor, 0.2, 1.05);
    light.intensity = data.baseIntensity * factor;
  }
}

/**
 * Restore each light to its captured base intensity / colour and clear the
 * flicker state. Useful for hot-reload paths.
 *
 * @param {THREE.Light[]} lights
 */
export function resetCandleFlicker(lights) {
  for (const light of lights) {
    const data = light?.userData?.candleFlicker;
    if (!data) continue;
    light.intensity = data.baseIntensity;
    light.color.copy(data.baseColor);
    delete light.userData.candleFlicker;
  }
}
