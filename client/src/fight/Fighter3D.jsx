import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { findClip, getFighter } from "./fighterConfig.js";

let gradientMap = null;

function getGradientMap() {
  if (!gradientMap) {
    gradientMap = new THREE.DataTexture(
      new Uint8Array([48, 132, 255]),
      3,
      1,
      THREE.RedFormat
    );
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

const outlineMaterial = new THREE.MeshBasicMaterial({
  color: "#080b08",
  side: THREE.BackSide,
});

function toToonMaterial(source) {
  if (!source) return source;

  const material = new THREE.MeshToonMaterial({
    color: source.color ? source.color.clone() : new THREE.Color("#ffffff"),
    map: source.map || null,
    alphaMap: source.alphaMap || null,
    alphaTest: source.alphaTest || 0,
    transparent: Boolean(source.transparent),
    opacity: source.opacity ?? 1,
    side: source.side,
    vertexColors: Boolean(source.vertexColors),
    gradientMap: getGradientMap(),
  });

  material.name = source.name;
  material.toneMapped = false;
  return material;
}

function measureBounds(root) {
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  root.updateWorldMatrix(true, true);

  root.traverse((object) => {
    if (!object.isMesh) return;
    const positions = object.geometry?.attributes?.position;
    if (!positions) return;

    const step = Math.max(1, Math.floor(positions.count / 600));
    for (let index = 0; index < positions.count; index += step) {
      point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
      box.expandByPoint(point);
    }
  });

  return box.isEmpty() ? new THREE.Box3().setFromObject(root) : box;
}

function buildFighter(scene) {
  const root = cloneSkeleton(scene);
  const box = measureBounds(root);
  const size = box.getSize(new THREE.Vector3());
  const scale = 2.08 / Math.max(size.y, 0.001);

  root.scale.multiplyScalar(scale);
  root.updateMatrixWorld(true);

  const scaledBox = measureBounds(root);
  const center = scaledBox.getCenter(new THREE.Vector3());
  root.position.set(-center.x, -scaledBox.min.y, -center.z);

  const outlines = [];

  root.traverse((object) => {
    if (!object.isMesh) return;

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const shouldOutline = materials.every(
      (material) => material && !/eyes/i.test(material.name || "")
    );

    object.material = Array.isArray(object.material)
      ? materials.map(toToonMaterial)
      : toToonMaterial(object.material);
    object.castShadow = true;
    object.frustumCulled = false;

    if (shouldOutline && object.isSkinnedMesh) {
      const outline = new THREE.SkinnedMesh(object.geometry, outlineMaterial);
      outline.bind(object.skeleton, object.bindMatrix);
      outline.bindMode = object.bindMode;
      outline.position.copy(object.position);
      outline.quaternion.copy(object.quaternion);
      outline.scale.copy(object.scale).multiplyScalar(1.035);
      outline.frustumCulled = false;
      outline.userData.isOutline = true;
      outlines.push({ parent: object.parent, outline });
    }
  });

  for (const entry of outlines) {
    entry.parent.add(entry.outline);
  }

  root.updateMatrixWorld(true);
  return root;
}

function resolvePose(pose) {
  if (pose === "ko" || pose === "victory" || pose === "punch" || pose === "hit") {
    return pose;
  }
  return "idle";
}

export default function Fighter3D({
  fighterId,
  side,
  pose = "idle",
  triggerId = 0,
  isAttacking = false,
  isHit = false,
  reducedMotion = false,
}) {
  const fighter = getFighter(fighterId);
  const { scene, animations } = useGLTF(fighter.model);
  const groupRef = useRef(null);
  const modelRef = useRef(null);
  const mixerRef = useRef(null);
  const actionsRef = useRef({});
  const currentRef = useRef(null);
  const returnTimerRef = useRef(null);
  const motionRef = useRef({ attackAt: -10, hitAt: -10, startedAt: -10 });
  const poseRef = useRef(pose);

  const baseX = side === "left" ? -1.18 : 1.18;
  const facing = side === "left" ? 1 : -1;

  const model = useMemo(() => buildFighter(scene), [scene]);

  const clips = useMemo(() => {
    const idle = findClip(animations, "idle");
    const punch = findClip(animations, "punch", ["ready", "idle"]);
    const hit = findClip(animations, "hit", ["ready", "idle"]);
    const death = findClip(animations, "death", ["hit", "idle"]);
    const victory = findClip(animations, "victory", ["ready", "idle"]);

    return { idle, punch, hit, death, victory };
  }, [animations]);

  useEffect(() => {
    const mixer = new THREE.AnimationMixer(model);
    const actions = {};

    for (const [role, clip] of Object.entries(clips)) {
      if (!clip) continue;
      const action = mixer.clipAction(clip);
      action.enabled = true;
      actions[role] = action;
    }

    mixerRef.current = mixer;
    actionsRef.current = actions;
    modelRef.current = model;

    const idleAction = actions.idle;
    if (idleAction) {
      idleAction.setLoop(THREE.LoopRepeat, Infinity);
      idleAction.play();
      currentRef.current = idleAction;
    }

    return () => {
      window.clearTimeout(returnTimerRef.current);
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
    };
  }, [clips, model]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    group.position.set(baseX, 0, 0);
    group.rotation.set(0, facing * (Math.PI / 2 - 0.3), 0);
    group.userData.side = side;
  }, [baseX, facing, side]);

  useEffect(() => {
    const actions = actionsRef.current;
    const mixer = mixerRef.current;
    if (!mixer) return;

    const nextPose = resolvePose(pose);
    const previousPose = poseRef.current;
    poseRef.current = pose;

    const clipRole = nextPose === "punch" ? "punch" : nextPose;
    const action = actions[clipRole] || actions.idle;
    if (!action) return;

    const isDeath = nextPose === "ko";
    const isVictory = nextPose === "victory";
    const isOneShot = nextPose === "punch" || nextPose === "hit";

    if (
      previousPose === nextPose &&
      nextPose !== "punch" &&
      nextPose !== "hit"
    ) {
      return;
    }

    window.clearTimeout(returnTimerRef.current);

    const current = currentRef.current;
    if (current === action && (isOneShot || isDeath || isVictory)) {
      action.reset();
      action.setEffectiveWeight(1);
      action.setEffectiveTimeScale(1);
      action.play();
    } else {
      action.reset();
      action.enabled = true;
      action.setEffectiveWeight(1);
      action.setEffectiveTimeScale(1);

      if (isDeath) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else if (isOneShot) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = false;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
      }

      action.play();

      if (current && current !== action) {
        action.crossFadeFrom(current, isOneShot ? 0.08 : 0.18, true);
      }

      currentRef.current = action;
    }

    if (isOneShot) {
      const durationMs = Math.max(220, action.getClip().duration * 1000 - 90);
      returnTimerRef.current = window.setTimeout(() => {
        const idleAction = actionsRef.current.idle;
        if (!idleAction || poseRef.current === "ko" || poseRef.current === "victory") {
          return;
        }
        idleAction.reset();
        idleAction.setLoop(THREE.LoopRepeat, Infinity);
        idleAction.setEffectiveWeight(1);
        idleAction.play();
        const from = currentRef.current;
        if (from && from !== idleAction) {
          idleAction.crossFadeFrom(from, 0.2, true);
        }
        currentRef.current = idleAction;
      }, durationMs);
    }
  }, [pose, triggerId]);

  useEffect(() => {
    if (!isAttacking) return;
    motionRef.current.attackAt = performance.now() / 1000;
  }, [isAttacking, triggerId]);

  useEffect(() => {
    if (!isHit) return;
    motionRef.current.hitAt = performance.now() / 1000;
  }, [isHit, triggerId]);

  useFrame((state, delta) => {
    const group = groupRef.current;
    const mixer = mixerRef.current;
    if (!group || !mixer) return;

    const now = performance.now() / 1000;
    const motion = motionRef.current;

    const attackElapsed = now - motion.attackAt;
    const hitElapsed = now - motion.hitAt;
    const attackT = Math.max(0, Math.min(1, attackElapsed / 0.38));
    const hitT = Math.max(0, Math.min(1, hitElapsed / 0.48));

    let offsetX = 0;
    let offsetY = 0;
    let tilt = 0;

    if (isAttacking && attackElapsed < 0.5) {
      offsetX += facing * Math.sin(attackT * Math.PI) * 0.22;
    }

    if (isHit && hitElapsed < 0.58) {
      const recoil = Math.exp(-hitT * 5.5) * Math.sin(hitT * Math.PI);
      offsetX -= facing * recoil * 0.48;
      offsetY += recoil * 0.035;
      tilt += facing * recoil * 0.2;
    }

    if (!reducedMotion) {
      offsetY += Math.sin(state.clock.elapsedTime * 2.2 + (side === "left" ? 0 : 1.7)) * 0.012;
    }

    group.position.x = baseX + offsetX;
    group.position.y = offsetY;
    group.position.z = side === "left" ? 0.08 : -0.04;
    group.rotation.z = tilt;

    const hitStop =
      (isHit && hitElapsed < 0.1) || (isAttacking && attackElapsed > 0.16 && attackElapsed < 0.26);
    const timeScale = reducedMotion ? 1 : hitStop ? 0.12 : 1;

    mixer.update(Math.min(delta, 0.05) * timeScale);
  });

  return (
    <group ref={groupRef}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <circleGeometry args={[0.72, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.34} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}>
        <ringGeometry args={[0.52, 0.58, 32]} />
        <meshBasicMaterial
          color={fighter.color}
          transparent
          opacity={0.55}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <primitive object={model} />
    </group>
  );
}
