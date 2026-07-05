/**
 * True 3D garden — React Three Fiber + GLB amulets (useGLTF) + ground-plane pan.
 */
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

const STORAGE_KEY = 'amuletQuestionnaire';
const FOG_COLOR = '#F4F4F4';
const FOG_DENSITY = 0.1;
const CAMERA_Y = 1.5;
const PAN_SPEED = 0.028;
const LOOK_AHEAD = 6;
const ZOOM_SPEED = 0.012;
const MIN_CAMERA_Z = 3;
const MAX_CAMERA_Z = 24;
const INITIAL_CAMERA = { x: 3, y: CAMERA_Y, z: 9.5 };
const AMULET_Y = -0.65;
const AMULET_SCALE = 2;

/** Deeper spread along Z — near to far field */
const AMULET_LAYOUT = [
  { tex: 0, x: -8.0, z: 8.5 },
  { tex: 1, x: -2.5, z: 4.0 },
  { tex: 2, x: 3.0, z: 6.5 },
  { tex: 3, x: 7.5, z: 2.5 },
  { tex: 4, x: -6.5, z: -1.5 },
  { tex: 5, x: 1.0, z: -6.5 },
  { tex: 6, x: 5.0, z: -13.0 },
];

function glbUrl(i) {
  return '/public/amulets/amulet-' + i + '.glb';
}

AMULET_LAYOUT.forEach((layout) => useGLTF.preload(glbUrl(layout.tex)));

function loadAnswers() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function nextUnansweredIndex(answers, questions) {
  for (let i = 0; i < questions.length; i++) {
    const v = answers[questions[i].key];
    if (v === undefined || v === null || String(v).trim() === '') return i;
  }
  return 0;
}

function lookForward(camera) {
  camera.position.y = CAMERA_Y;
  camera.lookAt(camera.position.x, 0, camera.position.z - LOOK_AHEAD);
}

function CameraPan({ enabled }) {
  const { camera, gl } = useThree();
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    camera.position.set(INITIAL_CAMERA.x, INITIAL_CAMERA.y, INITIAL_CAMERA.z);
    lookForward(camera);
  }, [camera]);

  useEffect(() => {
    const el = gl.domElement;

    const onPointerDown = (e) => {
      if (!enabled || e.button !== 0) return;
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
      document.body.style.cursor = 'grabbing';
    };

    const onPointerMove = (e) => {
      if (!enabled || !isDragging.current) return;
      const deltaX = e.clientX - lastMouse.current.x;
      const deltaY = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      camera.position.x -= deltaX * PAN_SPEED;
      camera.position.z -= deltaY * PAN_SPEED;
      lookForward(camera);
    };

    const onPointerUp = (e) => {
      if (!isDragging.current) return;
      isDragging.current = false;
      if (el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
      document.body.style.cursor = 'grab';
    };

    const onWheel = (e) => {
      if (!enabled) return;
      e.preventDefault();
      camera.position.z = THREE.MathUtils.clamp(
        camera.position.z + e.deltaY * ZOOM_SPEED,
        MIN_CAMERA_Z,
        MAX_CAMERA_Z
      );
      lookForward(camera);
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('wheel', onWheel);
    };
  }, [enabled, camera, gl]);

  return null;
}

function Amulet({ url, position, questionIndex, focusIndex, onSelect }) {
  const { scene } = useGLTF(url);
  const isFocus = questionIndex === focusIndex;

  const clone = useMemo(() => {
    const model = scene.clone(true);
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
      }
    });
    return model;
  }, [scene]);

  useEffect(() => {
    clone.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => {
        if ('opacity' in mat) {
          mat.transparent = mat.opacity < 1 || mat.transparent;
          mat.opacity = isFocus ? 1 : 0.88;
        }
      });
    });
  }, [clone, isFocus]);

  const handleClick = useCallback(
    (e) => {
      e.stopPropagation();
      onSelect(questionIndex, e);
    },
    [onSelect, questionIndex]
  );

  return (
    <primitive
      object={clone}
      position={position}
      scale={[AMULET_SCALE, AMULET_SCALE, AMULET_SCALE]}
      onClick={handleClick}
      onPointerOver={() => {
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'grab';
      }}
    />
  );
}

function GardenScene({ activeIndices, focusIndex, controlsEnabled, onSelect }) {
  return (
    <>
      <color attach="background" args={[FOG_COLOR]} />
      <fogExp2 attach="fog" args={[FOG_COLOR, FOG_DENSITY]} />
      <ambientLight intensity={1.05} />

      <CameraPan enabled={controlsEnabled} />

      {activeIndices.map((questionIndex) => {
        const layout = AMULET_LAYOUT[questionIndex % AMULET_LAYOUT.length];
        if (!layout) return null;
        return (
          <Amulet
            key={questionIndex}
            url={glbUrl(layout.tex)}
            position={[layout.x, AMULET_Y, layout.z]}
            questionIndex={questionIndex}
            focusIndex={focusIndex}
            onSelect={onSelect}
          />
        );
      })}
    </>
  );
}

function GardenApp() {
  const questions = window.AMULET_QUESTIONS || [];
  const stageRef = useRef(null);
  const [answersVersion, setAnswersVersion] = useState(0);
  const [focusIndex, setFocusIndex] = useState(0);
  const [controlsEnabled, setControlsEnabled] = useState(true);

  const answers = useMemo(() => loadAnswers(), [answersVersion]);

  const activeIndices = useMemo(() => questions.map((_, i) => i), [questions]);

  useEffect(() => {
    setFocusIndex(nextUnansweredIndex(answers, questions));
  }, [answers, questions, answersVersion]);

  const handleSelect = useCallback((index, event) => {
    if (document.body.classList.contains('is-panel-open')) {
      window.dispatchEvent(new CustomEvent('questionnaire:close-panel'));
      return;
    }
    setFocusIndex(index);

    const pagmar = stageRef.current?.closest('.pagmar-canvas');
    const rect = pagmar?.getBoundingClientRect();
    const native = event.nativeEvent || event;
    const anchor = rect
      ? { x: native.clientX - rect.left, y: native.clientY - rect.top }
      : { x: 0, y: 0 };

    window.dispatchEvent(
      new CustomEvent('questionnaire:star-click', {
        detail: { anchor, index },
      })
    );
  }, []);

  useEffect(() => {
    const onAnswered = () => setAnswersVersion((v) => v + 1);
    const onOpen = () => setControlsEnabled(false);
    const onClose = () => setControlsEnabled(true);

    window.addEventListener('questionnaire:answered', onAnswered);
    window.addEventListener('questionnaire:panel-open', onOpen);
    window.addEventListener('questionnaire:panel-close', onClose);
    return () => {
      window.removeEventListener('questionnaire:answered', onAnswered);
      window.removeEventListener('questionnaire:panel-open', onOpen);
      window.removeEventListener('questionnaire:panel-close', onClose);
    };
  }, []);

  useEffect(() => {
    window.questionnaireStar = {
      getAnchorCanvasPoint() {
        return { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 };
      },
      pauseFloat() {
        setControlsEnabled(false);
      },
      resumeFloat() {
        setControlsEnabled(true);
      },
      placeAtCenter() {},
    };
  }, []);

  return (
    <div ref={stageRef} style={{ width: '100%', height: '100%', touchAction: 'none', cursor: 'grab' }}>
      <Canvas
        camera={{ position: [INITIAL_CAMERA.x, INITIAL_CAMERA.y, INITIAL_CAMERA.z], fov: 75, near: 0.1, far: 200 }}
        onCreated={({ camera }) => lookForward(camera)}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2.5]}
        style={{ width: '100%', height: '100%', display: 'block', background: FOG_COLOR }}
      >
        <Suspense fallback={null}>
          <GardenScene
            activeIndices={activeIndices}
            focusIndex={focusIndex}
            controlsEnabled={controlsEnabled}
            onSelect={handleSelect}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

const mount = document.getElementById('questionGarden');
if (mount) {
  createRoot(mount).render(<GardenApp />);
}
