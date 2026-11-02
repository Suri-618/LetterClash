let audioContext = null;
let masterGain = null;
let sfxGain = null;
let musicGain = null;
let musicSchedulerTimer = null;
let musicStep = 0;
let musicEnabled = false;
let nextNoteTime = 0;
let musicVolume = 0.25;
let sfxVolume = 0.8;
let hitSounds = null;

function createHitAudio(src, volume) {
  if (typeof Audio === "undefined") return null;

  const audio = new Audio(src);
  audio.preload = "auto";
  audio.volume = volume;
  audio.load();
  return audio;
}

function getHitSounds() {
  if (!hitSounds) {
    const base = import.meta.env.BASE_URL;

    hitSounds = {
      left: createHitAudio(`${base}sounds/hit-left.wav`, 0.52),
      right: createHitAudio(`${base}sounds/hit-right.wav`, 0.48),
    };
  }

  return hitSounds;
}

function getAudioContext() {
  if (!audioContext) {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error("Web Audio API is not supported.");
    }

    audioContext = new AudioContextClass();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 1;

    musicGain = audioContext.createGain();
    musicGain.gain.value = musicVolume;
    musicGain.connect(masterGain);

    sfxGain = audioContext.createGain();
    sfxGain.gain.value = sfxVolume;
    sfxGain.connect(masterGain);

    masterGain.connect(audioContext.destination);
  }

  return audioContext;
}

export async function enableAudio() {
  try {
    const ctx = getAudioContext();

    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    // Start loading the sample-based hit sounds as soon as sound is enabled.
    try {
      getHitSounds();
    } catch {
      // The tone-based sounds can still work even if samples cannot load.
    }

    return true;
  } catch (error) {
    console.error("Could not enable audio:", error);
    return false;
  }
}

function playTone({
  frequency = 440,
  duration = 0.12,
  type = "sine",
  volume = 0.3,
  slideTo = null,
  bus = "sfx",
  when = null,
} = {}) {
  if (!audioContext) return;
  if (audioContext.state !== "running") return;

  const destination = bus === "music" ? musicGain : sfxGain;
  if (!destination) return;

  const now = when ?? audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);

  if (slideTo !== null) {
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(1, slideTo),
      now + duration
    );
  }

  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  oscillator.connect(gain);
  gain.connect(destination);

  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

export function playHit(side = "left") {
  const sounds = getHitSounds();
  const audio = side === "right" ? sounds.right : sounds.left;

  if (!audio) return;

  try {
    audio.currentTime = 0;
    const playback = audio.play();

    if (playback && typeof playback.catch === "function") {
      // Autoplay policies can still block playback; never surface that as
      // an unhandled rejection during a match.
      playback.catch(() => {});
    }
  } catch {
    // Ignore playback failures and keep the match running.
  }
}

export function playAttack() {
  playTone({
    frequency: 420,
    slideTo: 180,
    duration: 0.1,
    type: "triangle",
    volume: 0.25,
  });
}

export function playSelect() {
  playTone({
    frequency: 760,
    slideTo: 980,
    duration: 0.055,
    type: "square",
    volume: 0.13,
  });
}

export function playLock() {
  playTone({
    frequency: 320,
    slideTo: 640,
    duration: 0.09,
    type: "square",
    volume: 0.3,
  });

  window.setTimeout(() => {
    playTone({
      frequency: 920,
      duration: 0.11,
      type: "triangle",
      volume: 0.22,
    });
  }, 55);
}

export function playCountdown() {
  playTone({
    frequency: 660,
    duration: 0.12,
    type: "square",
    volume: 0.2,
  });
}

export function playVictory() {
  [523, 659, 784, 1047].forEach((frequency, index) => {
    setTimeout(() => {
      playTone({
        frequency,
        duration: 0.24,
        type: "triangle",
        volume: 0.3,
      });
    }, index * 150);
  });
}

export function playDefeat() {
  [392, 330, 262].forEach((frequency, index) => {
    setTimeout(() => {
      playTone({
        frequency,
        duration: 0.3,
        type: "triangle",
        volume: 0.25,
      });
    }, index * 180);
  });
}

// ===== RETRO 8-BIT ARCADE BATTLE MUSIC =====

// Frequencies for a catchy, looping chiptune melody.
const leadPattern = [
  659, 0, 784, 988,
  784, 659, 523, 0,
  587, 0, 784, 880,
  784, 659, 523, 587,

  659, 0, 784, 988,
  1175, 988, 784, 659,
  698, 0, 880, 1047,
  880, 784, 659, 0,
];

// Deep, punchy bass sequence.
const bassPattern = [
  82, 82, 123, 82,
  98, 98, 147, 98,
  110, 110, 165, 110,
  73, 73, 110, 147,
];

// Fast arpeggios give the track its classic arcade feel.
const arpPattern = [
  523, 659, 784, 659,
  494, 587, 740, 587,
  440, 554, 659, 554,
  392, 494, 587, 494,
];

function playChipNote(frequency, duration = 0.09, volume = 0.13, when = null) {
  if (!frequency) return;

  playTone({
    frequency,
    duration,
    type: "square",
    volume,
    bus: "music",
    when,
  });
}

function playChipBass(frequency, when = null) {
  playTone({
    frequency,
    slideTo: frequency * 0.72,
    duration: 0.13,
    type: "triangle",
    volume: 0.42,
    bus: "music",
    when,
  });

  playTone({
    frequency: frequency / 2,
    duration: 0.11,
    type: "square",
    volume: 0.12,
    bus: "music",
    when,
  });
}

function playArcadeKick(when = null) {
  playTone({
    frequency: 155,
    slideTo: 48,
    duration: 0.14,
    type: "triangle",
    volume: 0.55,
    bus: "music",
    when,
  });
}

function playArcadeSnare(when = null) {
  playTone({
    frequency: 220,
    slideTo: 100,
    duration: 0.075,
    type: "square",
    volume: 0.2,
    bus: "music",
    when,
  });

  playTone({
    frequency: 1200,
    slideTo: 500,
    duration: 0.04,
    type: "triangle",
    volume: 0.1,
    bus: "music",
    when,
  });
}

function playArcadeBlip(when = null) {
  playTone({
    frequency: 1100,
    slideTo: 500,
    duration: 0.035,
    type: "square",
    volume: 0.07,
    bus: "music",
    when,
  });
}

function scheduleMusicStep(stepTime) {
  if (!musicEnabled || !audioContext) return;

  const step = musicStep % 32;
  const patternStep = step % 16;

  // Energetic drum rhythm.
  if (patternStep % 4 === 0) {
    playArcadeKick(stepTime);
  }

  if (patternStep === 4 || patternStep === 12) {
    playArcadeSnare(stepTime);
  }

  if (patternStep % 2 === 1) {
    playArcadeBlip(stepTime);
  }

  if ([0, 2, 4, 6, 8, 11, 12, 14].includes(patternStep)) {
    playChipBass(bassPattern[patternStep], stepTime);
  }

  const leadFrequency = leadPattern[patternStep];

  if (step < 16) {
    playChipNote(leadFrequency, 0.085, 0.13, stepTime);
  } else {
    playChipNote(leadFrequency, 0.075, 0.13, stepTime);

    if ([2, 3, 6, 10, 11, 14].includes(patternStep)) {
      playChipNote(leadFrequency * 2, 0.045, 0.045, stepTime);
    }
  }

  if (patternStep % 2 === 0) {
    playChipNote(arpPattern[patternStep], 0.055, 0.065, stepTime);
  }

  musicStep = (musicStep + 1) % 32;
}

function runMusicScheduler() {
  if (!musicEnabled || !audioContext) {
    if (musicSchedulerTimer !== null) {
      clearTimeout(musicSchedulerTimer);
      musicSchedulerTimer = null;
    }
    return;
  }

  // Look ahead 150ms to avoid browser timer jitter and background-tab
  // throttling. Schedule directly onto the AudioContext timeline.
  while (nextNoteTime < audioContext.currentTime + 0.15) {
    scheduleMusicStep(nextNoteTime);
    nextNoteTime += 0.1;
  }

  musicSchedulerTimer = window.setTimeout(runMusicScheduler, 25);
}

export function startMusic() {
  try {
    getAudioContext();
  } catch {
    return;
  }

  if (musicEnabled) return;

  musicEnabled = true;
  musicStep = 0;
  nextNoteTime = audioContext.currentTime + 0.02;

  runMusicScheduler();
}

export function stopMusic() {
  musicEnabled = false;

  if (musicSchedulerTimer !== null) {
    clearTimeout(musicSchedulerTimer);
    musicSchedulerTimer = null;
  }
}

export function setAudioVolume(value) {
  try {
    getAudioContext();
  } catch {
    return;
  }

  musicVolume = Math.max(0, Math.min(1, value));
  if (musicGain) {
    musicGain.gain.setTargetAtTime(musicVolume, audioContext.currentTime, 0.03);
  }
}

export function setSfxVolume(value) {
  try {
    getAudioContext();
  } catch {
    return;
  }

  sfxVolume = Math.max(0, Math.min(1, value));
  if (sfxGain) {
    sfxGain.gain.setTargetAtTime(sfxVolume, audioContext.currentTime, 0.03);
  }
}
