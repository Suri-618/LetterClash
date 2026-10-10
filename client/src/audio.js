let audioContext = null;
let masterGain = null;
let musicTimer = null;
let musicStep = 0;
let musicEnabled = false;

function getAudioContext() {
  if (!audioContext) {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error("Web Audio API is not supported.");
    }

    audioContext = new AudioContextClass();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.25;
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
} = {}) {
  if (!audioContext || !masterGain) return;
  if (audioContext.state !== "running") return;

  const now = audioContext.currentTime;
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
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    now + duration
  );

  oscillator.connect(gain);
  gain.connect(masterGain);

  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

export function playHit() {
  playTone({
    frequency: 180,
    slideTo: 65,
    duration: 0.18,
    type: "sawtooth",
    volume: 0.45,
  });
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

function playChipNote(frequency, duration = 0.09, volume = 0.12) {
  if (!frequency) return;

  playTone({
    frequency,
    duration,
    type: "square",
    volume,
  });
}

function playChipBass(frequency) {
  playTone({
    frequency,
    slideTo: frequency * 0.72,
    duration: 0.13,
    type: "triangle",
    volume: 0.42,
  });

  playTone({
    frequency: frequency / 2,
    duration: 0.11,
    type: "square",
    volume: 0.12,
  });
}

function playArcadeKick() {
  playTone({
    frequency: 155,
    slideTo: 48,
    duration: 0.14,
    type: "triangle",
    volume: 0.55,
  });
}

function playArcadeSnare() {
  playTone({
    frequency: 220,
    slideTo: 100,
    duration: 0.075,
    type: "square",
    volume: 0.2,
  });

  playTone({
    frequency: 1200,
    slideTo: 500,
    duration: 0.04,
    type: "triangle",
    volume: 0.1,
  });
}

function playArcadeBlip() {
  playTone({
    frequency: 1100,
    slideTo: 500,
    duration: 0.035,
    type: "square",
    volume: 0.07,
  });
}

function playMusicNote() {
  if (!musicEnabled) return;

  const step = musicStep % 32;
  const patternStep = step % 16;

  // Energetic drum rhythm.
  if (patternStep % 4 === 0) {
    playArcadeKick();
  }

  if (patternStep === 4 || patternStep === 12) {
    playArcadeSnare();
  }

  // Quick arcade hi-hat accents.
  if (patternStep % 2 === 1) {
    playArcadeBlip();
  }

  // Bass plays on selected syncopated beats.
  if ([0, 2, 4, 6, 8, 11, 12, 14].includes(patternStep)) {
    playChipBass(bassPattern[patternStep]);
  }

  // Catchy lead melody with a second variation.
  const leadFrequency = leadPattern[patternStep];

  if (step < 16) {
    playChipNote(leadFrequency, 0.085, 0.13);
  } else {
    // Repeat with a brighter octave accent.
    playChipNote(leadFrequency, 0.075, 0.13);

    if ([2, 3, 6, 10, 11, 14].includes(patternStep)) {
      playChipNote(leadFrequency * 2, 0.045, 0.045);
    }
  }

  // Fast alternating arpeggio creates a retro game soundtrack.
  if (patternStep % 2 === 0) {
    playChipNote(arpPattern[patternStep], 0.055, 0.065);
  }

  musicStep = (musicStep + 1) % 32;
}

export function startMusic() {
  if (musicTimer !== null) return;

  musicEnabled = true;
  musicStep = 0;

  playMusicNote();

  // Fast 8-bit rhythm: 100 ms per step, approximately 150 BPM.
  musicTimer = setInterval(playMusicNote, 100);
}

export function stopMusic() {
  musicEnabled = false;

  if (musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

export function setAudioVolume(value) {
  if (!getAudioContext()) return;

  const volume = Math.max(0, Math.min(1, value));
  masterGain.gain.setTargetAtTime(
    volume,
    audioContext.currentTime,
    0.03
  );
}
