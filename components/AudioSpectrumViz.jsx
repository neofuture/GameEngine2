"use client";

import { useEffect, useRef } from "react";

const BAR_COUNT = 31;
const USABLE_BIN_RATIO = 0.76;
const WAVE_POINTS = 72;
const SMOOTH_RATE_ATTACK = 0.62;
const SMOOTH_RATE_RELEASE = 0.44;
const WAVE_AMP_BOOST = 1.85;
const WAVE_FLOOR = 0.08;

/** Locked beat-line tuning — per-channel baseline norm, bass-heavy, peaks to 100%. */
const BEAT = {
  bassBins: 14,
  avgFollow: 0.095,
  baselineTrim: 1.01,
  pulsePeakDecay: 0.848,
  pulseFloor: 0.016,
  mixBass: 0.47,
  mixBody: 0.17,
  mixWave: 0.24,
  mixSnap: 0.12,
  logGain: 11,
  logCurve: 0.7,
  ceiling: 1,
  outputBoost: 1.1,
  attack: 0.58,
  release: 0.28,
};

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w, h };
}

function sampleBands(freq, count) {
  const values = new Array(count).fill(0);
  const maxBin = Math.max(16, Math.floor(freq.length * USABLE_BIN_RATIO));
  for (let i = 0; i < count; i++) {
    const t0 = (i / count) ** 2;
    const t1 = ((i + 1) / count) ** 2;
    const start = Math.floor(t0 * maxBin);
    const end = Math.max(start + 1, Math.floor(t1 * maxBin));
    let peak = 0;
    for (let b = start; b < end; b++) {
      peak = Math.max(peak, freq[b]);
    }
    values[i] = peak / 255;
  }
  return values;
}

function coolify(raw) {
  const logged = raw.map((v) => Math.log1p(v * 18) / Math.log1p(18));
  const smooth = logged.map((v, i) => {
    const l = logged[i - 1] ?? v;
    const r = logged[i + 1] ?? v;
    return l * 0.14 + v * 0.72 + r * 0.14;
  });
  const avg = smooth.reduce((sum, v) => sum + v, 0) / smooth.length;
  return smooth.map((v) => {
    const mix = v * 0.78 + avg * 0.22;
    return 0.14 + mix * 0.68;
  });
}

function synthBar(phase, i) {
  const wave =
    Math.sin(phase + i * 0.38) * 0.45 +
    Math.sin(phase * 1.4 + i * 0.22) * 0.35 +
    Math.sin(phase * 0.6 + i * 0.55) * 0.2 +
    0.55;
  return 0.14 + (wave / 1.55) * 0.58;
}

function sampleBeatParts(freq, waveRaw) {
  let bassPeak = 0;
  let bassSum = 0;
  const bassBins = Math.min(BEAT.bassBins, freq.length);
  for (let i = 0; i < bassBins; i++) {
    bassPeak = Math.max(bassPeak, freq[i]);
    bassSum += freq[i];
  }

  let sumSq = 0;
  let wavePeak = 0;
  for (let i = 0; i < waveRaw.length; i++) {
    const d = Math.abs(waveRaw[i] - 128) / 128;
    sumSq += d * d;
    wavePeak = Math.max(wavePeak, d);
  }

  return {
    bassPeak: bassPeak / 255,
    bassAvg: bassSum / (bassBins * 255),
    waveRms: Math.sqrt(sumSq / waveRaw.length),
    wavePeak,
  };
}

/** Normalize each source against its own rolling baseline → 0 between beats, 1 on hits. */
function normBeatChannel(value, avgRef, peakRef) {
  avgRef.current += (value - avgRef.current) * BEAT.avgFollow;
  const punch = Math.max(0, value - avgRef.current * BEAT.baselineTrim);
  peakRef.current = Math.max(punch, peakRef.current * BEAT.pulsePeakDecay);
  return Math.min(1, punch / Math.max(peakRef.current, BEAT.pulseFloor));
}

function normalizeBeat(parts, refs) {
  const bass = normBeatChannel(parts.bassPeak, refs.bassAvg, refs.bassPulsePeak);
  const body = normBeatChannel(parts.bassAvg, refs.bodyAvg, refs.bodyPulsePeak);
  const wave = normBeatChannel(parts.waveRms, refs.waveAvg, refs.wavePulsePeak);
  const snap = normBeatChannel(parts.wavePeak, refs.snapAvg, refs.snapPulsePeak);

  const mix =
    bass * BEAT.mixBass +
    body * BEAT.mixBody +
    wave * BEAT.mixWave +
    snap * BEAT.mixSnap;
  const logged = Math.log1p(mix * BEAT.logGain) / Math.log1p(BEAT.logGain);
  return Math.min(BEAT.ceiling, Math.pow(logged, BEAT.logCurve) * BEAT.outputBoost);
}

function synthBeat(phase) {
  const pulse = Math.sin(phase * 3.6) * 0.5 + 0.5;
  const swell = Math.sin(phase * 1.15) * 0.5 + 0.5;
  const hit = Math.max(0, Math.sin(phase * 7.2)) ** 3;
  const raw = pulse * 0.42 + swell * 0.18 + hit * 0.55;
  const trimmed = Math.max(0, raw - 0.22);
  const logged = Math.log1p(trimmed * 10) / Math.log1p(10);
  return Math.pow(logged, 0.75);
}

function synthWave(phase, i, count) {
  const t = i / count;
  return (
    Math.sin(phase + t * Math.PI * 5.5) * 0.42 +
    Math.sin(phase * 1.6 + t * Math.PI * 11) * 0.28 +
    Math.sin(phase * 0.7 + t * Math.PI * 2.2) * 0.18
  );
}

function drawBackground(ctx, w, h) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "rgba(4, 10, 22, 1)");
  bg.addColorStop(0.5, "rgba(6, 18, 38, 0.98)");
  bg.addColorStop(1, "rgba(2, 6, 14, 1)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(70, 110, 200, 0.05)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += w / 14) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += h / 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawSpectrum(ctx, w, h, values) {
  const padX = w * 0.05;
  const padY = h * 0.1;
  const floor = h - padY;
  const ceiling = padY;
  const maxH = floor - ceiling;
  const gap = Math.max(1, w * 0.004);
  const innerW = Math.max(0, w - padX * 2);
  const barW = Math.max(0, (innerW - gap * (BAR_COUNT - 1)) / BAR_COUNT);
  if (barW <= 0) return;

  for (let i = 0; i < BAR_COUNT; i++) {
    const v = values[i];
    const barH = Math.max(0, v * maxH);
    const x = padX + i * (barW + gap);
    const cx = x + barW * 0.5;
    const y = floor - barH;
    const tint = i / BAR_COUNT;

    ctx.shadowColor = "#5eaaff";
    ctx.shadowBlur = 2 + v * 5;

    const grad = ctx.createLinearGradient(0, y, 0, floor);
    grad.addColorStop(0, `rgba(110, 160, 255, ${0.12 + v * 0.28})`);
    grad.addColorStop(0.4, `rgba(70, ${120 + tint * 16}, 230, ${0.2 + v * 0.18})`);
    grad.addColorStop(1, `rgba(${50 + tint * 24}, 40, 160, ${0.18 + v * 0.16})`);
    ctx.fillStyle = grad;
    if (barH > 0) ctx.fillRect(x, y, barW, barH);

    const capRadius = barW * 0.3;
    if (v > 0.38 && capRadius > 0) {
      ctx.fillStyle = `rgba(170, 200, 255, ${(v - 0.38) * 0.22})`;
      ctx.beginPath();
      ctx.arc(cx, y, capRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.shadowBlur = 0;
}

function waveLevel(sample) {
  const raw = Math.abs(sample / 128 - 1);
  return Math.min(1, WAVE_FLOOR + Math.pow(raw, 0.68) * WAVE_AMP_BOOST);
}

function drawWaveform(ctx, w, h, wave, glow) {
  const padX = w * 0.05;
  const padY = h * 0.1;
  const floor = h - padY;
  const ceiling = padY;
  const amp = floor - ceiling;
  const step = (wave.length - 1) / (WAVE_POINTS - 1);
  const innerW = w - padX * 2;

  ctx.beginPath();
  ctx.moveTo(padX, floor);
  for (let i = 0; i < WAVE_POINTS; i++) {
    const idx = Math.min(wave.length - 1, Math.floor(i * step));
    const v = waveLevel(wave[idx]);
    const x = padX + (i / (WAVE_POINTS - 1)) * innerW;
    const y = floor - v * amp;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(padX + innerW, floor);
  ctx.closePath();

  const fillGrad = ctx.createLinearGradient(0, ceiling, 0, floor);
  fillGrad.addColorStop(0, "rgba(94, 170, 255, 0.36)");
  fillGrad.addColorStop(0.45, "rgba(70, 130, 230, 0.2)");
  fillGrad.addColorStop(1, "rgba(60, 50, 160, 0.08)");
  ctx.fillStyle = fillGrad;
  ctx.fill();

  ctx.lineWidth = Math.max(1.5, w * 0.004);
  ctx.shadowColor = "#5eaaff";
  ctx.shadowBlur = glow;
  ctx.strokeStyle = "rgba(120, 170, 255, 0.55)";
  ctx.beginPath();
  for (let i = 0; i < WAVE_POINTS; i++) {
    const idx = Math.min(wave.length - 1, Math.floor(i * step));
    const v = waveLevel(wave[idx]);
    const x = padX + (i / (WAVE_POINTS - 1)) * innerW;
    const y = floor - v * amp;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.strokeStyle = "#a8c4ff";
  ctx.shadowBlur = glow * 0.6;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawEnergyLine(ctx, w, h, energy, pulse) {
  const padX = w * 0.05;
  const y = h * 0.1;
  const innerW = w - padX * 2;
  const lineH = Math.max(2, h * 0.018);
  const level = Math.min(1, Math.max(0, energy));
  const fillW = innerW * level;

  ctx.fillStyle = "rgba(70, 120, 220, 0.22)";
  ctx.fillRect(padX, y - lineH * 0.5, innerW, lineH);

  if (fillW > 0.5) {
    const grad = ctx.createLinearGradient(padX, 0, padX + fillW, 0);
    grad.addColorStop(0, `rgba(94, 170, 255, ${0.55 + pulse * 0.35})`);
    grad.addColorStop(0.7, "rgba(80, 130, 240, 0.9)");
    grad.addColorStop(1, "rgba(100, 70, 220, 0.95)");
    ctx.fillStyle = grad;
    ctx.shadowColor = "#5eaaff";
    ctx.shadowBlur = 10 + pulse * 6;
    ctx.fillRect(padX, y - lineH * 0.5, fillW, lineH);
    ctx.shadowBlur = 0;
  }
}

function drawHudFrame(ctx, w, h, pulse) {
  const pad = w * 0.05;
  const arm = Math.min(w, h) * 0.11;
  ctx.strokeStyle = `rgba(94, 170, 255, ${0.3 + pulse * 0.2})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad, pad + arm);
  ctx.lineTo(pad, pad);
  ctx.lineTo(pad + arm, pad);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(pad, h - pad - arm);
  ctx.lineTo(pad, h - pad);
  ctx.lineTo(pad + arm, h - pad);
  ctx.stroke();
}

function drawScanline(ctx, w, h, phase) {
  const y = (phase % 1) * h;
  const band = ctx.createLinearGradient(0, y - 12, 0, y + 12);
  band.addColorStop(0, "transparent");
  band.addColorStop(0.5, "rgba(94, 170, 255, 0.07)");
  band.addColorStop(1, "transparent");
  ctx.fillStyle = band;
  ctx.fillRect(0, y - 12, w, 24);
}

export default function AudioSpectrumViz({
  getAnalyser,
  getBeatAnalyser,
  musicEnabled = true,
  active = true,
  resetKey,
  className = "",
  canvasClassName = "audioSpectrumViz",
  synthFallback = true,
}) {
  const canvasRef = useRef(null);
  const freqDataRef = useRef(new Uint8Array(256));
  const beatFreqDataRef = useRef(new Uint8Array(256));
  const waveDataRef = useRef(new Uint8Array(128));
  const barSmoothRef = useRef(new Array(BAR_COUNT).fill(0.38));
  const beatRefs = useRef({
    bassAvg: { current: 0.05 },
    bassPulsePeak: { current: 0.04 },
    bodyAvg: { current: 0.05 },
    bodyPulsePeak: { current: 0.04 },
    waveAvg: { current: 0.05 },
    wavePulsePeak: { current: 0.04 },
    snapAvg: { current: 0.05 },
    snapPulsePeak: { current: 0.04 },
  });
  const beatSmoothRef = useRef(0);

  useEffect(() => {
    const r = beatRefs.current;
    r.bassAvg.current = 0.05;
    r.bassPulsePeak.current = 0.04;
    r.bodyAvg.current = 0.05;
    r.bodyPulsePeak.current = 0.04;
    r.waveAvg.current = 0.05;
    r.wavePulsePeak.current = 0.04;
    r.snapAvg.current = 0.05;
    r.snapPulsePeak.current = 0.04;
    beatSmoothRef.current = 0;
  }, [resetKey]);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let rafId = 0;
    let phase = 0;

    const frame = (time) => {
      rafId = requestAnimationFrame(frame);
      const { w, h } = resizeCanvas(canvas);
      phase += 0.014;

      const smooth = barSmoothRef.current;
      const wave = new Array(128).fill(128);
      let targets;
      let energy = 0;
      let beatLevel = synthBeat(phase);

      if (musicEnabled && getAnalyser?.()) {
        const freq = freqDataRef.current;
        const waveRaw = waveDataRef.current;
        getAnalyser().getByteFrequencyData(freq);
        getAnalyser().getByteTimeDomainData(waveRaw);
        targets = coolify(sampleBands(freq, BAR_COUNT));

        const beatAnalyser = getBeatAnalyser?.() ?? getAnalyser();
        const beatFreq = beatFreqDataRef.current;
        beatAnalyser.getByteFrequencyData(beatFreq);
        beatLevel = normalizeBeat(
          sampleBeatParts(beatFreq, waveRaw),
          beatRefs.current
        );

        for (let i = 0; i < wave.length; i++) {
          wave[i] = waveRaw[i];
        }
      } else if (synthFallback) {
        targets = new Array(BAR_COUNT);
        for (let i = 0; i < BAR_COUNT; i++) {
          targets[i] = synthBar(phase * 5, i);
        }
        for (let i = 0; i < wave.length; i++) {
          wave[i] = 128 + synthWave(phase * 4, i, wave.length) * 78;
        }
      } else {
        targets = new Array(BAR_COUNT).fill(0);
        beatLevel = 0;
      }

      const values = new Array(BAR_COUNT);
      for (let i = 0; i < BAR_COUNT; i++) {
        const target = targets[i];
        const rate =
          target > smooth[i] ? SMOOTH_RATE_ATTACK : SMOOTH_RATE_RELEASE;
        smooth[i] += (target - smooth[i]) * rate;
        const wobble = 1 + Math.sin(phase * 6 + i * 0.45) * 0.04;
        values[i] = Math.min(1, smooth[i] * wobble);
        energy += values[i];
      }
      energy /= BAR_COUNT;

      const prevBeat = beatSmoothRef.current;
      const beatRate = beatLevel > prevBeat ? BEAT.attack : BEAT.release;
      beatSmoothRef.current += (beatLevel - prevBeat) * beatRate;

      const pulse = Math.sin(phase * 2.2) * 0.5 + 0.5;
      ctx.clearRect(0, 0, w, h);
      drawBackground(ctx, w, h);
      drawEnergyLine(ctx, w, h, beatSmoothRef.current, pulse);
      drawSpectrum(ctx, w, h, values);
      drawWaveform(ctx, w, h, wave, 10 + energy * 22);
      drawHudFrame(ctx, w, h, pulse);
      drawScanline(ctx, w, h, (time * 0.0003) % 1);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [active, getAnalyser, getBeatAnalyser, musicEnabled, resetKey, synthFallback]);

  return (
    <div className={className}>
      <canvas ref={canvasRef} className={canvasClassName} aria-hidden="true" />
    </div>
  );
}
