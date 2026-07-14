import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export function CadViewer({ url }: { url: string | null }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = host.current;
    if (element === null || url === null) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f4f8);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100_000);
    camera.position.set(3, 3, 3);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    element.append(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x667085, 2.2));
    const light = new THREE.DirectionalLight(0xffffff, 2.5);
    light.position.set(5, 8, 6);
    scene.add(light);

    let frame = 0;
    let disposed = false;
    const resize = () => {
      const width = Math.max(1, element.clientWidth);
      const height = Math.max(1, element.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();

    new GLTFLoader().load(
      url,
      (gltf) => {
        if (disposed) return;
        scene.add(gltf.scene);
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3()).length();
        controls.target.copy(center);
        camera.position.copy(center).add(new THREE.Vector3(size, size, size));
        camera.near = Math.max(size / 10_000, 0.001);
        camera.far = Math.max(size * 100, 100);
        camera.updateProjectionMatrix();
        controls.update();
      },
      undefined,
      () => setError('The model preview could not be loaded.'),
    );
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          const mesh = object as THREE.Mesh<
            THREE.BufferGeometry,
            THREE.Material | THREE.Material[]
          >;
          mesh.geometry.dispose();
          const materials: THREE.Material[] = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [url]);

  return (
    <div ref={host} className="viewer-canvas" aria-label="Interactive CAD model">
      {error !== null && <div className="viewer-error">{error}</div>}
    </div>
  );
}
