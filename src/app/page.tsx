'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';


// 扩展Navigator接口以支持WebGPU
declare global {
  interface Navigator {
    gpu?: any;
  }
}

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | any>(null);
  const diceRefs = useRef<THREE.Mesh[]>([]);
  const [webgpuSupported, setWebgpuSupported] = useState<boolean>(false);
  const [rendererType, setRendererType] = useState<string>('检测中...');
  const [isClient, setIsClient] = useState<boolean>(false);
  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [currentFaces, setCurrentFaces] = useState<number[]>([1, 1, 1, 1, 1]);
  const [selectedDice, setSelectedDice] = useState<boolean[]>([false, false, false, false, false]);

  useEffect(() => {
    // 标记为客户端渲染
    setIsClient(true);

    if (!containerRef.current) return;

    checkWebGPUAndInit();

    // 清理函数
    return () => {
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, []);

  // 创建骰子纹理 - 按照BoxGeometry面的顺序
  const createDiceTextures = () => {
    const textures = [];
    const size = 256;

    // BoxGeometry的面顺序: [+X(右), -X(左), +Y(上), -Y(下), +Z(前), -Z(后)]
    // 根据测试结果调整：1点和6点正确，2和5、3和4需要交换
    const faceNumbers = [3, 4, 2, 5, 1, 6]; // 对应BoxGeometry的6个面

    for (let i = 0; i < 6; i++) {
      const faceNumber = faceNumbers[i];
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      // 绘制白色背景
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);

      // 绘制黑色边框
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, size, size);

      // 绘制点数
      ctx.fillStyle = '#000000';
      const dotRadius = 20;
      const positions = getDotPositions(faceNumber, size, dotRadius);

      positions.forEach(pos => {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      });

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      textures.push(texture);
    }

    return textures;
  };

  // 获取骰子点数位置
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

  // 骰子6个面的精确旋转角度 (弧度) - 对应实际显示的点数
  // 根据BoxGeometry面顺序和纹理分配重新定义旋转角度
  const diceRotations = [
    { x: 0, y: 0, z: 0 },                           // 显示1点 (前面 +Z)
    { x: Math.PI/2, y: 0, z: 0 },                   // 显示2点 (下面 -Y)
    { x: 0, y: -Math.PI/2, z: 0 },                  // 显示3点 (左面 -X)
    { x: 0, y: Math.PI/2, z: 0 },                   // 显示4点 (右面 +X)
    { x: -Math.PI/2, y: 0, z: 0 },                  // 显示5点 (上面 +Y)
    { x: 0, y: Math.PI, z: 0 }                      // 显示6点 (后面 -Z)
  ];



  // 验证并设置精确角度
  const setExactRotation = (object: THREE.Mesh, rotation: { x: number; y: number; z: number }, expectedDots?: number) => {
    // 使用 rotation.set() 方法确保精确设置
    object.rotation.set(rotation.x, rotation.y, rotation.z);

    // 强制更新所有相关矩阵
    object.updateMatrix();
    object.updateMatrixWorld(true);

    // 验证设置是否正确
    const actualX = Math.round(object.rotation.x * 1000) / 1000;
    const actualY = Math.round(object.rotation.y * 1000) / 1000;
    const actualZ = Math.round(object.rotation.z * 1000) / 1000;

    if (expectedDots) {
      console.log(`骰子设置: ${expectedDots}点 - 角度 x=${actualX}, y=${actualY}, z=${actualZ}`);
    }
  };

  // 更新骰子材质颜色
  const updateDiceMaterial = (diceIndex: number, isSelected: boolean) => {
    const dice = diceRefs.current[diceIndex];
    if (!dice || !Array.isArray(dice.material)) return;

    const diceTextures = createDiceTextures();

    // 创建新的材质，根据选中状态设置颜色
    const materials = diceTextures.map(texture => {
      const material = new THREE.MeshBasicMaterial({ map: texture.clone() });
      if (isSelected) {
        material.color.setHex(0xff6666); // 红色调
      } else {
        material.color.setHex(0xffffff); // 白色
      }
      return material;
    });

    dice.material = materials;
  };

  // 处理骰子点击
  const handleDiceClick = (event: MouseEvent) => {
    if (isRolling) return;

    const canvas = rendererRef.current?.domElement;
    if (!canvas) return;

    // 获取鼠标在canvas中的位置
    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // 创建射线检测
    const raycaster = new THREE.Raycaster();
    const camera = rendererRef.current?.camera;
    if (!camera) return;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(diceRefs.current);

    if (intersects.length > 0) {
      const clickedDice = intersects[0].object;
      const diceIndex = diceRefs.current.indexOf(clickedDice as THREE.Mesh);

      if (diceIndex !== -1) {
        // 切换选中状态
        const newSelectedDice = [...selectedDice];
        newSelectedDice[diceIndex] = !newSelectedDice[diceIndex];
        setSelectedDice(newSelectedDice);

        // 更新材质
        updateDiceMaterial(diceIndex, newSelectedDice[diceIndex]);

        console.log(`骰子${diceIndex + 1} ${newSelectedDice[diceIndex] ? '选中' : '取消选中'}`);
      }
    }
  };

  // 改进的随机数生成器 - 确保真正的均匀分布
  const getRandomFace = () => {
    // 使用时间戳和随机数组合提高随机性
    const timestamp = Date.now();
    const random1 = Math.random();
    const random2 = Math.random();

    // 组合多个随机源
    const combinedRandom = (random1 + random2 + (timestamp % 1000) / 1000) % 1;
    const face = Math.floor(combinedRandom * 6);

    return face;
  };

  // 随机旋转5个骰子 - 跳过选中的骰子
  const rollDice = () => {
    if (diceRefs.current.length === 0 || isRolling) return;

    setIsRolling(true);

    // 为每个骰子生成随机面和旋转参数，跳过选中的骰子
    const diceResults = diceRefs.current.map((dice, index) => {
      // 如果骰子被选中，跳过旋转
      if (selectedDice[index]) {
        return null;
      }

      const randomFace = getRandomFace();
      const faceNumber = randomFace + 1;
      const targetRotation = diceRotations[randomFace];

      // 每个骰子独立的旋转参数
      const extraRotationsX = Math.floor(2 + Math.random() * 3) * Math.PI * 2;
      const extraRotationsY = Math.floor(2 + Math.random() * 3) * Math.PI * 2;
      const directionX = Math.random() > 0.5 ? 1 : -1;
      const directionY = Math.random() > 0.5 ? 1 : -1;

      const finalRotation = {
        x: targetRotation.x + extraRotationsX * directionX,
        y: targetRotation.y + extraRotationsY * directionY,
        z: targetRotation.z
      };

      return {
        dice,
        randomFace,
        faceNumber,
        targetRotation,
        finalRotation,
        index
      };
    }).filter(result => result !== null);

    console.log(`=== 开始旋转骰子 ===`);
    console.log(`选中的骰子: [${selectedDice.map((selected, i) => selected ? i+1 : null).filter(x => x !== null).join(', ')}]`);
    diceResults.forEach((result) => {
      console.log(`骰子${result.index+1}: ${result.faceNumber}点`);
    });

    // 如果没有骰子需要旋转，直接结束
    if (diceResults.length === 0) {
      console.log('所有骰子都被选中，跳过旋转');
      setIsRolling(false);
      return;
    }

    // 同时启动所有骰子的动画
    let completedCount = 0;
    const newFaces: number[] = [...currentFaces]; // 保持当前面数

    diceResults.forEach((result) => {
      animateToRotation(result.dice, result.finalRotation, 4500, () => {
        // 设置精确角度
        setExactRotation(result.dice, result.targetRotation, result.faceNumber);
        newFaces[result.index] = result.faceNumber;
        completedCount++;

        // 所有骰子都完成旋转时
        if (completedCount === diceResults.length) {
          setCurrentFaces(newFaces);
          console.log(`=== 旋转完成 ===`);
          console.log(`结果: [${newFaces.join(', ')}]`);
          console.log(`总点数: ${newFaces.reduce((sum, face) => sum + face, 0)}`);
          setIsRolling(false);
        }
      });
    });
  };

  // 平滑旋转动画 - 确保精确停止在正视图
  const animateToRotation = (
    object: THREE.Mesh,
    targetRotation: { x: number; y: number; z: number },
    duration: number,
    onComplete?: () => void
  ) => {
    const startRotation = {
      x: object.rotation.x,
      y: object.rotation.y,
      z: object.rotation.z
    };

    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      if (progress < 1) {
        // 使用更平缓的缓动函数 (ease-out-cubic)
        const easeProgress = 1 - Math.pow(1 - progress, 3);

        object.rotation.x = startRotation.x + (targetRotation.x - startRotation.x) * easeProgress;
        object.rotation.y = startRotation.y + (targetRotation.y - startRotation.y) * easeProgress;
        object.rotation.z = startRotation.z + (targetRotation.z - startRotation.z) * easeProgress;

        requestAnimationFrame(animate);
      } else {
        // 动画结束时，使用精确角度设置函数
        // 这是关键步骤，确保完全正视图
        setExactRotation(object, targetRotation);

        onComplete?.();
      }
    };

    animate();
  };

  const checkWebGPUAndInit = async () => {
    const hasWebGPU = hasWebGPUSupport();
    setWebgpuSupported(hasWebGPU);

    if (hasWebGPU) {
      try {
        await initWebGPUScene();
        setRendererType('WebGPU');
      } catch (error) {
        console.warn('WebGPU初始化失败，回退到WebGL:', error);
        initWebGLScene();
        setRendererType('WebGL (WebGPU回退)');
      }
    } else {
      initWebGLScene();
      setRendererType('WebGL');
    }
  };

  const initWebGPUScene = async () => {
    if (!containerRef.current) return;

    try {
      // 动态导入WebGPU渲染器
      const WebGPUModule = await import('three/src/renderers/webgpu/WebGPURenderer.js');
      const WebGPURenderer = WebGPUModule.default;

      // 创建场景
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x222222);

      // 创建正交相机 - 确保所有骰子都是完全正视图，无透视变形
      const aspect = 960 / 540;
      const frustumSize = 4; // 调整这个值来控制视野大小
      const camera = new THREE.OrthographicCamera(
        frustumSize * aspect / -2, // left
        frustumSize * aspect / 2,  // right
        frustumSize / 2,           // top
        frustumSize / -2,          // bottom
        0.1,                       // near
        1000                       // far
      );
      camera.position.set(0, 0, 6); // 正面视角
      camera.lookAt(0, 0, 0); // 看向中心

      // 创建WebGPU渲染器
      const renderer = new WebGPURenderer({ antialias: true });
      renderer.setSize(960, 540);
      rendererRef.current = renderer;
      rendererRef.current.camera = camera; // 保存相机引用
      containerRef.current.appendChild(renderer.domElement);

      // 添加鼠标点击事件监听器
      renderer.domElement.addEventListener('click', handleDiceClick);

      // 创建5个独立的骰子
      const geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8); // 缩小骰子尺寸
      const diceTextures = createDiceTextures();

      // 清空骰子引用数组
      diceRefs.current = [];

      // 创建5个骰子，横向排列
      for (let i = 0; i < 5; i++) {
        // 为每个骰子创建独立的材质，避免共享
        const materials = diceTextures.map(texture =>
          new THREE.MeshBasicMaterial({ map: texture.clone() })
        );

        const dice = new THREE.Mesh(geometry, materials);
        // 设置位置：从左到右排列，适合正交视图的间距
        dice.position.x = (i - 2) * 1.2; // -2.4, -1.2, 0, 1.2, 2.4
        dice.position.y = 0;
        dice.position.z = 0;

        // 设置初始旋转为1点正视图
        setExactRotation(dice, diceRotations[0], 1);

        diceRefs.current.push(dice);
        scene.add(dice);
      }

      // 渲染循环
      const animate = () => {
        requestAnimationFrame(animate);

        renderer.render(scene, camera);
      };

      // 初始化WebGPU
      await renderer.init();

      animate();
    } catch (error) {
      console.error('WebGPU渲染器导入失败:', error);
      throw error; // 重新抛出错误以触发回退
    }
  };

  const initWebGLScene = () => {
    if (!containerRef.current) return;

    // 创建场景
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    // 创建正交相机 - 确保所有骰子都是完全正视图，无透视变形
    const aspect = 960 / 540;
    const frustumSize = 4; // 调整这个值来控制视野大小
    const camera = new THREE.OrthographicCamera(
      frustumSize * aspect / -2, // left
      frustumSize * aspect / 2,  // right
      frustumSize / 2,           // top
      frustumSize / -2,          // bottom
      0.1,                       // near
      1000                       // far
    );
    camera.position.set(0, 0, 6); // 正面视角
    camera.lookAt(0, 0, 0); // 看向中心

    // 创建WebGL渲染器
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(960, 540);
    rendererRef.current = renderer;
    rendererRef.current.camera = camera; // 保存相机引用
    containerRef.current.appendChild(renderer.domElement);

    // 添加鼠标点击事件监听器
    renderer.domElement.addEventListener('click', handleDiceClick);

    // 创建5个独立的骰子
    const geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8); // 缩小骰子尺寸
    const diceTextures = createDiceTextures();

    // 清空骰子引用数组
    diceRefs.current = [];

    // 创建5个骰子，横向排列
    for (let i = 0; i < 5; i++) {
      // 为每个骰子创建独立的材质，避免共享
      const materials = diceTextures.map(texture =>
        new THREE.MeshLambertMaterial({ map: texture.clone() })
      );

      const dice = new THREE.Mesh(geometry, materials);
      // 设置位置：从左到右排列，适合正交视图的间距
      dice.position.x = (i - 2) * 1.2; // -2.4, -1.2, 0, 1.2, 2.4
      dice.position.y = 0;
      dice.position.z = 0;

      // 设置初始旋转为1点正视图
      setExactRotation(dice, diceRotations[0], 1);

      diceRefs.current.push(dice);
      scene.add(dice);
    }

    // 添加光源
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // 渲染循环
    const animate = () => {
      requestAnimationFrame(animate);

      renderer.render(scene, camera);
    };

    animate();
  };

  const hasWebGPUSupport = () => {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <h1 className="text-3xl font-bold mb-6">Three.js WebGPU项目</h1>

      <div
        ref={containerRef}
        className="border-2 border-gray-400 rounded-lg shadow-lg"
        style={{ width: '960px', height: '540px' }}
      />

      <div className="flex flex-col items-center mt-4">
        <button
          onClick={rollDice}
          disabled={isRolling}
          className={`px-6 py-3 rounded-lg font-semibold text-white transition-all duration-200 ${
            isRolling
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-500 hover:bg-blue-600 active:bg-blue-700 shadow-lg hover:shadow-xl'
          }`}
        >
          {isRolling ? '🎲 旋转中...' : '🎲 随机旋转'}
        </button>
      </div>
    </div>
  );
}
