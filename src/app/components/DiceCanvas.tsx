'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, Dispatch, SetStateAction } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// 扩展Navigator接口以支持WebGPU
declare global {
  interface Navigator {
    gpu?: any;
  }
}

interface DiceCanvasProps {
  isRolling: boolean;
  selectedDice: boolean[];
  setSelectedDice: Dispatch<SetStateAction<boolean[]>>;
  setRendererType: (type: string) => void;
  rollsLeft: number;
  isMyTurn?: boolean;
  onDiceSelectionChange?: (selectedDice: boolean[]) => void;
}

export interface DiceCanvasHandle {
  roll: (options: { selectedDice: boolean[]; duration: number }) => Promise<number[]>;
  rollWithResults: (options: { selectedDice: boolean[]; duration: number; results: number[] }) => Promise<void>;
  reset: () => void;
  setDiceResults: (results: number[]) => void;
}

const DiceCanvas = forwardRef<DiceCanvasHandle, DiceCanvasProps>(({ isRolling, selectedDice, setSelectedDice, setRendererType, rollsLeft, isMyTurn = true, onDiceSelectionChange }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<any>(null); // WebGLRenderer or WebGPURenderer
  const diceRefs = useRef<THREE.Mesh[]>([]);

  // Ref to hold latest props that the click handler needs
  const propsRef = useRef({ isRolling, rollsLeft, setSelectedDice, isMyTurn, onDiceSelectionChange });
  useEffect(() => {
    propsRef.current = { isRolling, rollsLeft, setSelectedDice, isMyTurn, onDiceSelectionChange };
  });

  // 骰子6个面的精确旋转角度 (弧度) - 对应实际显示的点数
  const diceRotations = [
    { x: 0, y: 0, z: 0 },                           // 显示1点 (前面 +Z)
    { x: Math.PI / 2, y: 0, z: 0 },                 // 显示2点 (下面 -Y)
    { x: 0, y: -Math.PI / 2, z: 0 },                // 显示3点 (左面 -X)
    { x: 0, y: Math.PI / 2, z: 0 },                 // 显示4点 (右面 +X)
    { x: -Math.PI / 2, y: 0, z: 0 },                // 显示5点 (上面 +Y)
    { x: 0, y: Math.PI, z: 0 }                      // 显示6点 (后面 -Z)
  ];

  // 创建优化的骰子纹理
  const createDiceTextures = () => {
    const textures = [];
    const size = 512; // 提高分辨率
    const faceNumbers = [3, 4, 2, 5, 1, 6];

    for (let i = 0; i < 6; i++) {
      const faceNumber = faceNumbers[i];
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      // 创建径向渐变背景
      const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
      gradient.addColorStop(0, '#f8f8f8'); // 中心浅色
      gradient.addColorStop(0.7, '#e8e8e8'); // 中间色
      gradient.addColorStop(1, '#d0d0d0'); // 边缘深色

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);

      // 添加细微的纹理效果
      ctx.fillStyle = 'rgba(0, 0, 0, 0.02)';
      for (let x = 0; x < size; x += 4) {
        for (let y = 0; y < size; y += 4) {
          if (Math.random() > 0.7) {
            ctx.fillRect(x, y, 2, 2);
          }
        }
      }

      // 绘制圆角边框
      const borderRadius = 20;
      const borderWidth = 6;
      ctx.strokeStyle = '#888888';
      ctx.lineWidth = borderWidth;
      ctx.beginPath();
      ctx.roundRect(borderWidth/2, borderWidth/2, size - borderWidth, size - borderWidth, borderRadius);
      ctx.stroke();

      // 绘制改进的点
      const dotRadius = 24;
      const positions = getDotPositions(faceNumber, size, dotRadius);

      positions.forEach(pos => {
        // 绘制点的阴影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.arc(pos.x + 3, pos.y + 3, dotRadius, 0, Math.PI * 2);
        ctx.fill();

        // 绘制主点
        const dotGradient = ctx.createRadialGradient(
          pos.x - dotRadius/3, pos.y - dotRadius/3, 0,
          pos.x, pos.y, dotRadius
        );
        dotGradient.addColorStop(0, '#444444');
        dotGradient.addColorStop(1, '#222222');

        ctx.fillStyle = dotGradient;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, dotRadius, 0, Math.PI * 2);
        ctx.fill();

        // 添加高光
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(pos.x - dotRadius/3, pos.y - dotRadius/3, dotRadius/3, 0, Math.PI * 2);
        ctx.fill();
      });

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      textures.push(texture);
    }
    return textures;
  };

  const getDotPositions = (number: number, size: number, dotRadius: number) => {
    const margin = dotRadius * 2;
    const positions = [];
    switch (number) {
      case 1:
        positions.push({ x: size / 2, y: size / 2 });
        break;
      case 2:
        positions.push({ x: margin, y: margin });
        positions.push({ x: size - margin, y: size - margin });
        break;
      case 3:
        positions.push({ x: margin, y: margin });
        positions.push({ x: size / 2, y: size / 2 });
        positions.push({ x: size - margin, y: size - margin });
        break;
      case 4:
        positions.push({ x: margin, y: margin });
        positions.push({ x: size - margin, y: margin });
        positions.push({ x: margin, y: size - margin });
        positions.push({ x: size - margin, y: size - margin });
        break;
      case 5:
        positions.push({ x: margin, y: margin });
        positions.push({ x: size - margin, y: margin });
        positions.push({ x: size / 2, y: size / 2 });
        positions.push({ x: margin, y: size - margin });
        positions.push({ x: size - margin, y: size - margin });
        break;
      case 6:
        positions.push({ x: margin, y: margin });
        positions.push({ x: size - margin, y: margin });
        positions.push({ x: margin, y: size / 2 });
        positions.push({ x: size - margin, y: size / 2 });
        positions.push({ x: margin, y: size - margin });
        positions.push({ x: size - margin, y: size - margin });
        break;
    }
    return positions;
  };

  const setExactRotation = (object: THREE.Mesh, rotation: { x: number; y: number; z: number }) => {
    object.rotation.set(rotation.x, rotation.y, rotation.z);
    object.updateMatrix();
    object.updateMatrixWorld(true);
  };
  
  const updateDiceMaterial = (diceIndex: number, isSelected: boolean) => {
    const dice = diceRefs.current[diceIndex];
    if (!dice || !Array.isArray(dice.material)) return;

    (dice.material as THREE.Material[]).forEach(mat => {
        if (isSelected) {
            // 选中时使用金色高光效果
            if (mat instanceof THREE.MeshStandardMaterial) {
                // MeshStandardMaterial 支持 emissive 和 emissiveIntensity
                mat.color.setHex(0xffffff);
                mat.emissive.setHex(0x444422); // 金色发光
                mat.emissiveIntensity = 0.3;
            } else if (mat instanceof THREE.MeshLambertMaterial) {
                // MeshLambertMaterial 支持 emissive 但没有 emissiveIntensity
                mat.color.setHex(0xffffff);
                mat.emissive.setHex(0x444422); // 金色发光
            } else if (mat instanceof THREE.MeshBasicMaterial) {
                // MeshBasicMaterial 不支持 emissive，使用颜色变化
                mat.color.setHex(0xffdd44); // 金色
            }
        } else {
            // 正常状态
            if (mat instanceof THREE.MeshStandardMaterial) {
                mat.color.setHex(0xffffff);
                mat.emissive.setHex(0x000000); // 无发光
                mat.emissiveIntensity = 0;
            } else if (mat instanceof THREE.MeshLambertMaterial) {
                mat.color.setHex(0xffffff);
                mat.emissive.setHex(0x000000); // 无发光
            } else if (mat instanceof THREE.MeshBasicMaterial) {
                mat.color.setHex(0xffffff); // 白色
            }
        }
        mat.needsUpdate = true;
    });
  };
  
  const handleDiceClick = (event: MouseEvent) => {
    // Use props from the ref to avoid stale closure
    const { isRolling: currentIsRolling, rollsLeft: currentRollsLeft, setSelectedDice: currentSetSelectedDice, isMyTurn: currentIsMyTurn, onDiceSelectionChange } = propsRef.current;

    if (currentIsRolling || currentRollsLeft === 3 || !currentIsMyTurn) return;
    const canvas = rendererRef.current?.domElement;
    if (!canvas || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    const camera = rendererRef.current?.camera;
    if (!camera) return;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(diceRefs.current);

    if (intersects.length > 0) {
      const clickedDice = intersects[0].object;
      const diceIndex = diceRefs.current.indexOf(clickedDice as THREE.Mesh);

      if (diceIndex !== -1) {
        currentSetSelectedDice((prevSelectedDice) => {
          const newSelectedDice = [...prevSelectedDice];
          newSelectedDice[diceIndex] = !newSelectedDice[diceIndex];

          // 通知外部组件骰子选择状态变化
          if (onDiceSelectionChange) {
            onDiceSelectionChange(newSelectedDice);
          }

          return newSelectedDice;
        });
      }
    }
  };

  const getRandomFace = () => {
    const timestamp = Date.now();
    const random1 = Math.random();
    const random2 = Math.random();
    const combinedRandom = (random1 + random2 + (timestamp % 1000) / 1000) % 1;
    return Math.floor(combinedRandom * 6);
  };

  const animateToRotation = (
    object: THREE.Mesh,
    targetRotation: { x: number; y: number; z: number },
    duration: number,
    onComplete?: () => void
  ) => {
    const startRotation = { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z };
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      if (progress < 1) {
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        object.rotation.x = startRotation.x + (targetRotation.x - startRotation.x) * easeProgress;
        object.rotation.y = startRotation.y + (targetRotation.y - startRotation.y) * easeProgress;
        object.rotation.z = startRotation.z + (targetRotation.z - startRotation.z) * easeProgress;
        requestAnimationFrame(animate);
      } else {
        setExactRotation(object, targetRotation);
        onComplete?.();
      }
    };
    animate();
  };

  useImperativeHandle(ref, () => ({
    roll: (options: { selectedDice: boolean[]; duration: number }): Promise<number[]> => {
      return new Promise((resolve) => {
        if (diceRefs.current.length === 0) {
            resolve([]);
            return;
        };
        const { selectedDice: currentSelectedDice, duration } = options;

        const diceResults = diceRefs.current.map((dice, index) => {
          if (currentSelectedDice[index]) return null;

          const randomFace = getRandomFace();
          const faceNumber = randomFace + 1;
          const targetRotation = diceRotations[randomFace];

          // 不同的速度与方向: 为每个轴随机生成旋转圈数 (2-5圈) 和方向
          const rotationsX = (2 + Math.floor(Math.random() * 4)) * Math.PI * 2;
          const rotationsY = (2 + Math.floor(Math.random() * 4)) * Math.PI * 2;
          const rotationsZ = (2 + Math.floor(Math.random() * 4)) * Math.PI * 2;

          const directionX = Math.random() < 0.5 ? 1 : -1;
          const directionY = Math.random() < 0.5 ? 1 : -1;
          const directionZ = Math.random() < 0.5 ? 1 : -1;

          const finalRotation = {
            x: targetRotation.x + (rotationsX * directionX),
            y: targetRotation.y + (rotationsY * directionY),
            z: targetRotation.z + (rotationsZ * directionZ)
          };
          return { dice, faceNumber, targetRotation, finalRotation, index };
        }).filter((r): r is NonNullable<typeof r> => r !== null);

        if (diceResults.length === 0) {
            resolve(currentSelectedDice.map((_, i) => -1));
            return;
        }

        let completedCount = 0;
        const newFaces: number[] = [];
        diceResults.forEach((result) => {
          animateToRotation(result.dice, result.finalRotation, duration, () => {
            setExactRotation(result.dice, result.targetRotation);
            newFaces[result.index] = result.faceNumber;
            completedCount++;

            if (completedCount === diceResults.length) {
              resolve(newFaces);
            }
          });
        });
      });
    },

    rollWithResults: (options: { selectedDice: boolean[]; duration: number; results: number[] }): Promise<void> => {
      return new Promise((resolve) => {
        if (diceRefs.current.length === 0) {
            resolve();
            return;
        };
        const { selectedDice: currentSelectedDice, duration, results } = options;

        const diceResults = diceRefs.current.map((dice, index) => {
          if (currentSelectedDice[index]) return null;

          const faceNumber = results[index] || 1;
          const targetRotation = diceRotations[faceNumber - 1];

          // 不同的速度与方向: 为每个轴随机生成旋转圈数 (2-5圈) 和方向
          const rotationsX = (2 + Math.floor(Math.random() * 4)) * Math.PI * 2;
          const rotationsY = (2 + Math.floor(Math.random() * 4)) * Math.PI * 2;
          const rotationsZ = (2 + Math.floor(Math.random() * 4)) * Math.PI * 2;

          const directionX = Math.random() < 0.5 ? 1 : -1;
          const directionY = Math.random() < 0.5 ? 1 : -1;
          const directionZ = Math.random() < 0.5 ? 1 : -1;

          const finalRotation = {
            x: targetRotation.x + (rotationsX * directionX),
            y: targetRotation.y + (rotationsY * directionY),
            z: targetRotation.z + (rotationsZ * directionZ)
          };
          return { dice, faceNumber, targetRotation, finalRotation, index };
        }).filter((r): r is NonNullable<typeof r> => r !== null);

        if (diceResults.length === 0) {
            resolve();
            return;
        }

        let completedCount = 0;
        diceResults.forEach((result) => {
          animateToRotation(result.dice, result.finalRotation, duration, () => {
            setExactRotation(result.dice, result.targetRotation);
            completedCount++;

            if (completedCount === diceResults.length) {
              resolve();
            }
          });
        });
      });
    },
    reset: () => {
      if (diceRefs.current.length > 0) {
        diceRefs.current.forEach((dice, i) => {
          setExactRotation(dice, diceRotations[0]);
          updateDiceMaterial(i, false);
        });
      }
    },

    setDiceResults: (results: number[]) => {
      if (diceRefs.current.length > 0) {
        diceRefs.current.forEach((dice, i) => {
          if (results[i] && results[i] >= 1 && results[i] <= 6) {
            setExactRotation(dice, diceRotations[results[i] - 1]);
          }
        });
      }
    }
  }));

  const hasWebGPUSupport = () => typeof navigator !== 'undefined' && 'gpu' in navigator;

  const initScene = (renderer: THREE.WebGLRenderer | any) => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    if (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const scene = new THREE.Scene();
    const frustumSize = 4;
    const camera = new THREE.OrthographicCamera(
      frustumSize / -2, frustumSize / 2,
      frustumSize / 2, frustumSize / -2,
      0.1, 1000
    );
    camera.position.set(0, 0, 6);
    camera.lookAt(0, 0, 0);

    rendererRef.current = renderer;
    rendererRef.current.camera = camera;
    container.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.addEventListener('click', handleDiceClick);
    
    renderer.setClearColor(0x000000, 0);

    // 创建圆角骰子几何体
    const geometry = new RoundedBoxGeometry(0.8, 0.8, 0.8, 4, 0.1);
    const diceTextures = createDiceTextures();
    diceRefs.current = [];

    for (let i = 0; i < 5; i++) {
      const materials = diceTextures.map(texture => {
        const mat = renderer instanceof THREE.WebGLRenderer 
          ? new THREE.MeshLambertMaterial({ map: texture.clone() })
          : new THREE.MeshBasicMaterial({ map: texture.clone() });
        mat.transparent = true;
        return mat;
      });
      const dice = new THREE.Mesh(geometry, materials);
      dice.position.x = (i - 2) * 1.2;
      setExactRotation(dice, diceRotations[0]);
      diceRefs.current.push(dice);
      scene.add(dice);
    }
    
    const isWebGL = renderer instanceof THREE.WebGLRenderer;
    if (isWebGL) {
      scene.add(new THREE.AmbientLight(0xffffff, 0.8));
      const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
      directionalLight.position.set(2, 5, 5);
      scene.add(directionalLight);
    }

    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };

    const resizeObserver = new ResizeObserver(entries => {
        const entry = entries[0];
        const { width, height } = entry.contentRect;
        const aspect = width / height;
        camera.left = frustumSize * aspect / -2;
        camera.right = frustumSize * aspect / 2;
        camera.top = frustumSize / 2;
        camera.bottom = frustumSize / -2;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    });
    resizeObserver.observe(container);
    
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      if (containerRef.current && renderer.domElement) {
        try {
          containerRef.current.removeChild(renderer.domElement);
        } catch (e) {
            // Ignore error if element is already gone
        }
      }
      renderer.dispose();
    };
  }

  const checkWebGPUAndInit = async () => {
    if (hasWebGPUSupport()) {
      try {
        const { default: WebGPURenderer } = await import('three/src/renderers/webgpu/WebGPURenderer.js');
        const renderer = new WebGPURenderer({ antialias: true });
        await renderer.init();
        initScene(renderer);
        setRendererType('WebGPU');
      } catch (error) {
        console.warn('WebGPU初始化失败，回退到WebGL:', error);
        initScene(new THREE.WebGLRenderer({ antialias: true, alpha: true }));
        setRendererType('WebGL (WebGPU回退)');
      }
    } else {
      initScene(new THREE.WebGLRenderer({ antialias: true, alpha: true }));
      setRendererType('WebGL');
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;
    checkWebGPUAndInit();
    
    return () => {
      if (rendererRef.current) {
        rendererRef.current.dispose();
        if (containerRef.current && containerRef.current.firstChild) {
            containerRef.current.removeChild(containerRef.current.firstChild);
        }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // 响应selectedDice的变化来更新材质
  useEffect(() => {
      selectedDice.forEach((isSelected, index) => {
          updateDiceMaterial(index, isSelected);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDice]);


  return (
    <div ref={containerRef} className="w-full h-full" />
  );
});

DiceCanvas.displayName = "DiceCanvas";
export default DiceCanvas; 