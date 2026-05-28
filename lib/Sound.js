import * as THREE from "three";

/**
 * Clips in public/sounds/. Missing grenade clips get built-in placeholders.
 *   laser_shot.ogg — rifle fire
 *   pickup_cock.ogg — ammo + grenade collect
 *   pickup_hp.ogg — health collect
 */
const CLIP_URLS = {
  laser_shot: "/sounds/laser_shot.ogg",
  grenade_throw: "/sounds/grenade_throw.ogg",
  pickup_cock: "/sounds/pickup_cock.ogg",
  pickup_hp: "/sounds/pickup_hp.ogg",
};

export const MUSIC_TRACKS = [
  { id: "galactic-drifter", label: "Galactic Drifter", url: "/music/galactic-drifter.mp3" },
  { id: "galactic-drifter-2", label: "Galactic Drifter II", url: "/music/galactic-drifter-2.mp3" },
];

export const MUSIC_TRACK_KEY = "fps-music-track";
export const DEFAULT_LOADING_TRACK_ID = MUSIC_TRACKS[0].id;
export const DEFAULT_LEVEL_TRACK_ID = MUSIC_TRACKS[1].id;
const DEFAULT_MUSIC_VOLUME = 0.65;

function synthesizeThrowBuffer(ctx) {
  const dur = 0.24;
  const sampleRate = ctx.sampleRate;
  const length = Math.ceil(sampleRate * dur);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const t = i / length;
    const env = (1 - t) * (1 - t);
    const noise = Math.random() * 2 - 1;
    const sweep = Math.sin(t * Math.PI * 6) * (1 - t * 0.6);
    data[i] = (noise * 0.75 + sweep * 0.25) * env * 0.55;
  }
  return buffer;
}

const SYNTH_FALLBACKS = {
  grenade_throw: synthesizeThrowBuffer,
};

async function decodeClip(ctx, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sound fetch failed: ${url}`);
  const data = await res.arrayBuffer();
  return ctx.decodeAudioData(data);
}

export function loadStoredLoadingTrackId() {
  if (typeof window === "undefined") return DEFAULT_LOADING_TRACK_ID;
  const stored = window.localStorage.getItem(MUSIC_TRACK_KEY);
  if (stored && MUSIC_TRACKS.some((track) => track.id === stored)) return stored;
  return DEFAULT_LOADING_TRACK_ID;
}

/** @deprecated Use loadStoredLoadingTrackId */
export function loadStoredMusicTrackId() {
  return loadStoredLoadingTrackId();
}

function tapMusicAnalysers(audio, displayAnalyser, beatAnalyser, listener) {
  const output = audio.getOutput?.() ?? audio.gain;
  output.disconnect();
  output.connect(displayAnalyser);
  output.connect(beatAnalyser);
  displayAnalyser.connect(listener.getInput());
}

function connectMusicDirect(audio, listener) {
  const output = audio.getOutput?.() ?? audio.gain;
  output.disconnect();
  output.connect(listener.getInput());
}

export function createSoundManager(camera) {
  const listener = new THREE.AudioListener();
  camera.add(listener);

  const buffers = new Map();
  const musicBuffers = new Map();
  let preloadPromise = null;
  let loadingTrackId = loadStoredLoadingTrackId();
  let levelTrackId = DEFAULT_LEVEL_TRACK_ID;
  let loadingMusicAudio = null;
  let loadingAnalyser = null;
  let loadingBeatAnalyser = null;
  let levelMusicAudio = null;
  let musicPreloaded = false;
  let audioPreloaded = false;

  function getMusicBuffer(trackId) {
    return musicBuffers.get(trackId) ?? musicBuffers.get(MUSIC_TRACKS[0].id);
  }

  async function preload() {
    if (preloadPromise) return preloadPromise;
    const ctx = listener.context;
    preloadPromise = (async () => {
      await Promise.all(
        Object.entries(CLIP_URLS).map(async ([key, url]) => {
          try {
            buffers.set(key, await decodeClip(ctx, url));
          } catch {
            // Optional file missing — synth fallback below.
          }
        })
      );
      for (const [key, synth] of Object.entries(SYNTH_FALLBACKS)) {
        if (!buffers.has(key)) {
          buffers.set(key, synth(ctx));
        }
      }
      await Promise.all(
        MUSIC_TRACKS.map(async (track) => {
          try {
            musicBuffers.set(track.id, await decodeClip(ctx, track.url));
          } catch (err) {
            console.error(`Music track failed to load (${track.label}):`, err);
          }
        })
      );
      musicPreloaded = musicBuffers.size > 0;
      audioPreloaded = true;
    })();
    return preloadPromise;
  }

  function resume() {
    const ctx = listener.context;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  }

  function play(key, { volume = 1 } = {}) {
    resume();
    const buffer = buffers.get(key);
    if (!buffer) return;
    const audio = new THREE.Audio(listener);
    audio.setBuffer(buffer);
    audio.setVolume(volume);
    audio.play();
  }

  function playSupplyPickup({ volume = 0.65 } = {}) {
    play("pickup_cock", { volume });
  }

  function playHpPickup({ volume = 0.6 } = {}) {
    play("pickup_hp", { volume });
  }

  function startLoadingMusic({ trackId = loadingTrackId, volume = DEFAULT_MUSIC_VOLUME } = {}) {
    resume();
    if (trackId) loadingTrackId = trackId;
    const buffer = getMusicBuffer(loadingTrackId);
    if (!buffer) return;
    if (loadingMusicAudio?.isPlaying) return;

    const ctx = listener.context;
    loadingAnalyser = ctx.createAnalyser();
    loadingAnalyser.fftSize = 512;
    loadingAnalyser.smoothingTimeConstant = 0.82;
    loadingBeatAnalyser = ctx.createAnalyser();
    loadingBeatAnalyser.fftSize = 512;
    loadingBeatAnalyser.smoothingTimeConstant = 0.28;

    loadingMusicAudio = new THREE.Audio(listener);
    loadingMusicAudio.setBuffer(buffer);
    loadingMusicAudio.setLoop(true);
    loadingMusicAudio.setVolume(volume);
    tapMusicAnalysers(loadingMusicAudio, loadingAnalyser, loadingBeatAnalyser, listener);
    loadingMusicAudio.play();
  }

  function stopLoadingMusic() {
    if (loadingMusicAudio?.isPlaying) loadingMusicAudio.stop();
    loadingMusicAudio = null;
    loadingAnalyser = null;
    loadingBeatAnalyser = null;
  }

  function setLoadingTrack(trackId) {
    if (!musicBuffers.has(trackId)) return;
    const wasPlaying = loadingMusicAudio?.isPlaying;
    loadingTrackId = trackId;
    if (wasPlaying) {
      stopLoadingMusic();
      startLoadingMusic({ trackId });
    }
  }

  function startLevelMusic({ trackId = levelTrackId, volume = DEFAULT_MUSIC_VOLUME } = {}) {
    resume();
    if (trackId) levelTrackId = trackId;
    const buffer = getMusicBuffer(levelTrackId);
    if (!buffer) return;
    if (levelMusicAudio?.isPlaying) return;

    levelMusicAudio = new THREE.Audio(listener);
    levelMusicAudio.setBuffer(buffer);
    levelMusicAudio.setLoop(true);
    levelMusicAudio.setVolume(volume);
    connectMusicDirect(levelMusicAudio, listener);
    levelMusicAudio.play();
  }

  function stopLevelMusic() {
    if (levelMusicAudio?.isPlaying) levelMusicAudio.stop();
    levelMusicAudio = null;
  }

  function getLoadingAnalyser() {
    return loadingAnalyser;
  }

  function getLoadingBeatAnalyser() {
    return loadingBeatAnalyser;
  }

  function isMusicPreloaded() {
    return musicPreloaded;
  }

  function isAudioPreloaded() {
    return audioPreloaded;
  }

  function isLoadingMusicPlaying() {
    return !!(loadingMusicAudio?.isPlaying);
  }

  function dispose() {
    stopLoadingMusic();
    stopLevelMusic();
    camera.remove(listener);
    buffers.clear();
    musicBuffers.clear();
    preloadPromise = null;
    audioPreloaded = false;
    musicPreloaded = false;
  }

  return {
    preload,
    resume,
    play,
    playSupplyPickup,
    playHpPickup,
    startLoadingMusic,
    stopLoadingMusic,
    setLoadingTrack,
    startLevelMusic,
    stopLevelMusic,
    getLoadingAnalyser,
    getLoadingBeatAnalyser,
    isMusicPreloaded,
    isAudioPreloaded,
    isLoadingMusicPlaying,
    dispose,
  };
}
