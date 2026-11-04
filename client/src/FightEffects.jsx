import { useEffect, useRef } from "react";
import Phaser from "phaser";

const MAX_ACTIVE_EFFECTS = 120;

export default function FightEffects({
  combatEffect,
  defenderSlot,
  reducedMotion = false,
}) {
  const containerRef = useRef(null);
  const gameRef = useRef(null);
  const sceneRef = useRef(null);
  const lastEffectRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    class EffectsScene extends Phaser.Scene {
      constructor() {
        super("FightEffects");
        this.activeEffects = new Set();
      }

      create() {
        sceneRef.current = this;
      }

      createEffect(x, y, radius, color, alpha = 1) {
        if (this.activeEffects.size >= MAX_ACTIVE_EFFECTS) {
          return null;
        }

        const effect = this.add.circle(x, y, radius, color, alpha);
        this.activeEffects.add(effect);

        effect.once("destroy", () => {
          this.activeEffects.delete(effect);
        });

        return effect;
      }

      burst(x, y, damage) {
        const intensity = Phaser.Math.Clamp(damage / 30, 0.35, 1);
        const count = Phaser.Math.Clamp(
          Math.round(12 + damage * 0.8),
          12,
          36
        );

        // Particle burst
        for (let i = 0; i < count; i += 1) {
          const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
          const speed = Phaser.Math.Between(55, 190) * intensity;
          const size = Phaser.Math.Between(2, 5);

          const particle = this.createEffect(
            x,
            y,
            size,
            Phaser.Math.RND.pick([
              0xffd166,
              0xff8c42,
              0xffffff,
              0xe34432,
            ])
          );

          if (!particle) break;

          particle.setBlendMode(Phaser.BlendModes.ADD);

          this.tweens.add({
            targets: particle,
            x: x + Math.cos(angle) * speed,
            y: y + Math.sin(angle) * speed,
            alpha: 0,
            scale: 0.1,
            duration: Phaser.Math.Between(250, 520),
            ease: "Cubic.Out",
            onComplete: () => particle.destroy(),
          });
        }

        // Expanding outer impact ring
        const ring = this.createEffect(x, y, 12, 0xffffff, 0);

        if (ring) {
          ring.setStrokeStyle(4, 0xffd166, 1);

          this.tweens.add({
            targets: ring,
            radius: 75 + damage * 0.5,
            alpha: 0,
            duration: 350,
            ease: "Cubic.Out",
            onComplete: () => ring.destroy(),
          });
        }

        // Crimson impact flash
        const flash = this.createEffect(x, y, 24, 0xe34432, 0.75);

        if (flash) {
          flash.setBlendMode(Phaser.BlendModes.ADD);

          this.tweens.add({
            targets: flash,
            scale: 2.2 + intensity * 0.5,
            alpha: 0,
            duration: 180,
            ease: "Cubic.Out",
            onComplete: () => flash.destroy(),
          });
        }

        // Bright central impact core
        const core = this.createEffect(x, y, 10, 0xffffff, 0.95);

        if (core) {
          core.setBlendMode(Phaser.BlendModes.ADD);

          this.tweens.add({
            targets: core,
            scale: 2.8 + intensity,
            alpha: 0,
            duration: 120,
            ease: "Cubic.Out",
            onComplete: () => core.destroy(),
          });
        }

        this.cameras.main.shake(
          110 + damage * 2,
          0.0015 + intensity * 0.002
        );
      }
    }

    const game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent: containerRef.current,
      transparent: true,
      backgroundColor: "rgba(0,0,0,0)",
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: 800,
        height: 500,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      render: {
        transparent: true,
        antialias: true,
        powerPreference: "low-power",
      },
      audio: {
        noAudio: true,
      },
      scene: EffectsScene,
    });

    gameRef.current = game;

    return () => {
      sceneRef.current = null;
      gameRef.current = null;
      game.destroy(true);
    };
  }, []);

  useEffect(() => {
    if (!combatEffect?.id || reducedMotion) return;
    if (lastEffectRef.current === combatEffect.id) return;

    lastEffectRef.current = combatEffect.id;

    const scene = sceneRef.current;
    if (!scene || !scene.sys.isActive()) return;

    const width = scene.scale.width;
    const height = scene.scale.height;

    const x = defenderSlot === 2 ? width * 0.72 : width * 0.28;
    const y = height * 0.48;

    scene.burst(x, y, combatEffect.damage || 10);
  }, [combatEffect, defenderSlot, reducedMotion]);

  return (
    <div
      ref={containerRef}
      className="fight-effects-canvas"
      aria-hidden="true"
    />
  );
}
