import * as THREE from 'three'; // Импорт ядра Three.js

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { scene, camera, orthoCamera, renderer, activeCamera, ambientLight, directionalLight, setActiveSceneCamera, initRenderer } from './sceneSetup.js';

import {
    showCabinetConfigMenu,
    createCabinetConfigMenu, // Убедитесь, что он импортирован, если используется напрямую
    updateSpecificConfigFields,
    hideCabinetConfigMenu,
    showFacadeSetsManager, // <--- Импортируем
    hideFacadeSetsManager, // <--- Импортируем
    addFacadeSetRow,       // <--- Импортируем (для onclick)
    applyFacadeSetsChanges // <--- Импортируем (для onclick)
  } from './menus.js';

  import {
    cube, edges, // Нужен для добавления объектов, проверки пересечений и т.д.
    selectedFaceIndex, // Важен для логики добавления объектов
    currentLength, currentWidth, currentHeight, // Нужны для расчетов в других местах
    faceNormals, // Нужны для определения стены
    createCube, 
    initRoomManagerDOM,// Будет вызываться из init и applySize (который теперь в roomManager)
    materials,
    applySize as applyRoomSize, // Экспортируем, чтобы кнопка "Применить" работала
    //setLeftView, setFrontView, setTopView, setIsometricView, // Для кнопок управления видом
    setRoomSelectedFace,   // Импортируем функцию для установки
    resetRoomSelectedFace,
    updateSelectedFaceDisplay, // Для обновления UI
    updateEdgeColors,
    updateFaceBounds,
    determineClickedWallFace_OldLogic, // <--- ИМПОРТИРУЕМ СТАРУЮ ЛОГИКУ
    setLeftView,
    setFrontView,
    setTopView,
    setIsometricView,
    handleRoomClick,
    roomDimensions
    // ... другие необходимые импорты ...
} from './roomManager.js';

import { controls } from './sceneSetup.js';


// Также убедись, что у рендерера включены карты теней
//renderer.shadowMap.enabled = true; // Добавь это при настройке renderer
//renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Тип теней (опционально)

// И у объектов, которые должны отбрасывать/принимать тени, включены свойства:
//mesh.castShadow = true;
//mesh.receiveShadow = true;
//planeMesh.receiveShadow = true; // Например, пол


const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

//let cube, edges;
//let selectedFaceIndex = -1;
//let currentLength = 1, currentWidth = 1, currentHeight = 1;
//let materials = [];
let windows = [];
let cabinets = [];
let selectedCabinet = null; // Добавляем глобальную переменную
let selectedCabinets = []; // массив шкафов для множественного выделения
let countertops = [];

let isRotating = false; // Флаг вращения куба мышью
let previousMouseX = 0; // Предыдущая позиция мыши по X
let previousMouseY = 0; // Предыдущая позиция мыши по Y
const rotationSpeed = 0.3; // Чувствительность вращения (можно настроить)
let isPanning = false;
let previousPanX = 0;
let previousPanY = 0;
let panTarget = new THREE.Vector3(0, 0, 0); // Точка, вокруг которой панорамируем (изначально центр)

let potentialDrag = false; // Флаг: true, если mousedown был на шкафу, но drag еще не 

const gltfLoaderInstance = new GLTFLoader();
const gltfLoaderInstance_Preload = new GLTFLoader(); // Можно использовать тот же инстанс, что и раньше, или новый
const modelsToPreload = [
    'oven_450.glb',
    'oven_600.glb',
    'mkw_362.glb',
    'dishwasher_600.glb',
    'dishwasher_450.glb'
 // Добавьте сюда все нужные модели
    // 'microwave_large.glb',
    // 'fridge_standard.glb',
];
const loadedModelsCache = new Map(); // Кэш для загруженных моделей
const preloadedModelsCache = new Map();

let allModelsLoaded = false; // Флаг для индикации завершения загрузки

// Стек истории действий (максимум 10)
const actionHistory = [];
const maxHistorySize = 20;

// Глобальные параметры кухни (значения в миллиметрах)
const kitchenGlobalParams = {
    countertopHeight: 910,         // Высота столешницы от пола, мм
    countertopType: "postforming", // Тип столешницы
    countertopThickness: 38,       // Толщина столешницы, мм
    countertopDepth: 600,          // Глубина столешницы, мм
    plinthHeight: 100,             // Высота цоколя, мм
    handleType: "standard",        // Тип ручек
    kitchenType: "linear",         // Тип кухни
    totalHeight: 2400,             // Общая высота кухни, мм
    apronHeight: 600,              // Высота фартука, мм
    mezzanineHeight: 400,           // Высота антресольных шкафов, мм
    panelThicknessMm: 18, // <--- Толщина материала корпуса в мм
    golaMinHeightMm: 30 // <--- Новый параметр (значение по умолчанию 30 мм)
};


// ---- Render scheduler ----
let renderRequested = false;
let continuousRendering = false;

function requestRender() {
  if (!renderRequested) {
    renderRequested = true;
    requestAnimationFrame(renderFrame);
  }
}

function setContinuousRendering(on) {
  if (on && !continuousRendering) {
    continuousRendering = true;
    requestRender(); // стартуем цикл
  } else if (!on) {
    continuousRendering = false; // цикл затихнет сам после текущего кадра
  }
}

function shouldContinue() {
  const isRotatingNow = typeof isRotating !== 'undefined' && isRotating;
  const isDraggingNow = typeof draggedCabinet !== 'undefined' && !!draggedCabinet;
  const isPanningNow  = typeof isPanning  !== 'undefined' && isPanning;
  return continuousRendering || isRotatingNow || isDraggingNow || isPanningNow;
}


//предварительная загрузка всех моделей
/**
 * Загружает одну модель и сохраняет ее в кэш.
 * @param {string} modelName Имя файла модели.
 * @returns {Promise<THREE.Group>}
 */
function preloadSingleModel(modelName) {
    const modelPath = `assets/models/${modelName}`;
    return new Promise((resolve, reject) => {
        if (loadedModelsCache.has(modelPath)) { // Если вдруг уже есть в кэше
            console.log(`[Preloader] Модель ${modelName} уже в кэше.`);
            resolve(loadedModelsCache.get(modelPath)); // Возвращаем оригинал, клон будет делаться при использовании
            return;
        }
        gltfLoaderInstance_Preload.load(
            modelPath,
            (gltf) => {
                console.log(`[Preloader] Модель ${modelName} предварительно загружена.`);
                loadedModelsCache.set(modelPath, gltf.scene); // Кэшируем ОРИГИНАЛ сцены
                resolve(gltf.scene);
            },
            undefined,
            (error) => {
                console.error(`[Preloader] Ошибка предварительной загрузки модели ${modelName} (${modelPath}):`, error);
                reject(error);
            }
        );
    });
}

/**
 * Запускает предварительную загрузку всех необходимых моделей.
 * @returns {Promise<void>} Promise, который разрешается, когда все модели загружены.
 */
async function preloadAllModels() {
    console.log("[Preloader] Начало предварительной загрузки всех моделей...");
    const preloadPromises = modelsToPreload.map(modelName => preloadSingleModel(modelName));
    
    try {
        await Promise.all(preloadPromises);
        allModelsLoaded = true;
        console.log("[Preloader] Все модели успешно предварительно загружены!");
        // Здесь можно скрыть индикатор загрузки, если он был
        // document.getElementById('loadingIndicator').style.display = 'none';
    } catch (error) {
        allModelsLoaded = false; // Или true, если часть загрузилась, а часть нет, но мы хотим продолжить
        console.error("[Preloader] Ошибка во время предварительной загрузки одной или нескольких моделей:", error);
        alert("Не удалось загрузить все 3D модели. Некоторые функции могут быть недоступны.");
        // Можно решить, блокировать ли приложение дальше или работать с тем, что есть
    }
}

// Функция для получения модели из кэша (используется в createDetailed...Geometry)
// Эта функция заменяет ваш предыдущий loadAndCacheOvenModel, если все грузится заранее
/**
 * Получает клонированную модель из кэша. Предполагается, что модель уже была предварительно загружена.
 * @param {string} modelName Имя файла модели.
 * @returns {THREE.Group | null} Клонированная сцена модели или null, если не найдена.
 */
function getPreloadedModelClone(modelName) {
    const modelPath = `assets/models/${modelName}`;
    if (loadedModelsCache.has(modelPath)) {
        const originalScene = loadedModelsCache.get(modelPath);
        return originalScene.clone(true);
    } else {
        console.warn(`[ModelProvider] Модель ${modelName} не найдена в кэше предварительно загруженных моделей!`);
        // Можно попытаться загрузить ее "на лету" здесь, если предзагрузка не обязательна,
        // но это вернет нас к асинхронности для этого случая.
        // Либо просто вернуть null.
        return null;
    }
}
//конец блока предварительной загрузки моделей

/**
 * Загружает GLB модель духовки и кэширует ее.
 * @param {string} modelName Имя файла модели (например, 'oven_450.glb').
 * @returns {Promise<THREE.Group>} Promise, который разрешается с клонированной сценой модели.
 */
function loadAndCacheOvenModel(modelName) {
    const modelPath = `assets/models/${modelName}`;
    return new Promise((resolve, reject) => {
        if (loadedModelsCache.has(modelPath)) {
            // console.log(`[ModelLoader] Используется кэшированная модель: ${modelName}`);
            const originalScene = loadedModelsCache.get(modelPath);
            resolve(originalScene.clone(true));
            return;
        }

        gltfLoaderInstance.load(
            modelPath,
            (gltf) => {
                const ovenScene = gltf.scene;
                // console.log(`[ModelLoader] Модель ${modelName} загружена успешно.`);
                loadedModelsCache.set(modelPath, ovenScene); // Кэшируем оригинал
                resolve(ovenScene.clone(true)); // Возвращаем клон
            },
            undefined, 
            (error) => {
                console.error(`[ModelLoader] Ошибка загрузки модели ${modelName} (${modelPath}):`, error);
                reject(error); // Отклоняем Promise при ошибке
            }
        );
    });
}

// Вспомогательная функция для получения толщины в метрах
function getPanelThickness() {
    return (kitchenGlobalParams.panelThicknessMm || 18) / 1000;
}
// Конфигурация для разных стен
// Функция возвращает конфигурацию для заданного wallId с актуальными размерами
function getWallConfig(wallId, cabinet, cabinets) {
    const configs = {
        'Back': {
            axis: 'x',
            offsetParam: 'offsetAlongWall',
            sizeParam: 'width',
            maxSize: currentLength,
            lineStart: (cabinet) => new THREE.Vector3(
                cabinet.boundaries.leftBoundary,
                -currentWidth / 2 + cabinet.offsetBottom + cabinet.height,
                -currentHeight / 2 + cabinet.offsetFromParentWall + cabinet.depth
            ),
            lineEnd: (cabinet) => new THREE.Vector3(
                cabinet.boundaries.rightBoundary,
                -currentWidth / 2 + cabinet.offsetBottom + cabinet.height,
                -currentHeight / 2 + cabinet.offsetFromParentWall + cabinet.depth
            ),
            leftPoint: (cabinet) => new THREE.Vector3(
                cabinet.boundaries.leftBoundary + (cabinet.mesh.position.x - cabinet.width / 2 - cabinet.boundaries.leftBoundary) / 2,
                -currentWidth / 2 + cabinet.offsetBottom + cabinet.height,
                -currentHeight / 2 + cabinet.offsetFromParentWall + cabinet.depth
            ),
            rightPoint: (cabinet) => new THREE.Vector3(
                cabinet.mesh.position.x + cabinet.width / 2 + (cabinet.boundaries.rightBoundary - (cabinet.mesh.position.x + cabinet.width / 2)) / 2,
                -currentWidth / 2 + cabinet.offsetBottom + cabinet.height,
                -currentHeight / 2 + cabinet.offsetFromParentWall + cabinet.depth
            ),
            leftValue: (cabinet) => cabinet.mesh.position.x - cabinet.width / 2 - cabinet.boundaries.leftBoundary,
            rightValue: (cabinet) => cabinet.boundaries.rightBoundary - (cabinet.mesh.position.x + cabinet.width / 2)
        },
        'Left': {
            axis: 'z',
            offsetParam: 'offsetAlongWall',
            sizeParam: 'width',
            maxSize: currentHeight,
            lineStart: (cabinet) => new THREE.Vector3(
                -currentLength / 2 + cabinet.offsetFromParentWall + cabinet.depth,
                -currentWidth / 2 + cabinet.offsetBottom + cabinet.height,
                cabinet.boundaries.leftBoundary
            ),
            lineEnd: (cabinet) => new THREE.Vector3(
                -currentLength / 2 + cabinet.offsetFromParentWall + cabinet.depth,
                -currentWidth / 2 + cabinet.offsetBottom + cabinet.height,
                cabinet.boundaries.rightBoundary
            ),
            leftPoint: (cabinet) => new THREE.Vector3(
                -currentLength / 2 + cabinet.offsetFromParentWall + cabinet.depth,
                -currentWidth / 2 + cabinet.offsetBottom + cabinet.height,
                cabinet.boundaries.leftBoundary + (cabinet.mesh.position.z - cabinet.width / 2 - cabinet.boundaries.leftBoundary) / 2
            ),
            rightPoint: (cabinet) => new THREE.Vector3(
                -currentLength / 2 + cabinet.offsetFromParentWall + cabinet.depth,
                -currentWidth / 2 + cabinet.offsetBottom + cabinet.height,
                cabinet.mesh.position.z + cabinet.width / 2 + (cabinet.boundaries.rightBoundary - (cabinet.mesh.position.z + cabinet.width / 2)) / 2
            ),
            leftValue: (cabinet) => cabinet.mesh.position.z - cabinet.width / 2 - cabinet.boundaries.leftBoundary,
            rightValue: (cabinet) => cabinet.boundaries.rightBoundary - (cabinet.mesh.position.z + cabinet.width / 2)
        },
        'Right': {
            axis: 'z',
            offsetParam: 'offsetAlongWall',
            sizeParam: 'width',
            maxSize: currentHeight,
            lineStart: (cabinet) => new THREE.Vector3(
                currentLength / 2 - cabinet.offsetFromParentWall - cabinet.depth,
                -currentWidth / 2 + cabinet.offsetBottom + cabinet.height,
                cabinet.boundaries.leftBoundary
            ),
            lineEnd: (cabinet) => new THREE.Vector3(
                currentLength / 2 - cabinet.offsetFromParentWall - cabinet.depth,
                -currentWidth / 2 + cabinet.offsetBottom + cabinet.height,
                cabinet.boundaries.rightBoundary
            ),
            leftPoint: (cabinet) => new THREE.Vector3(
                currentLength / 2 - cabinet.offsetFromParentWall - cabinet.depth,
                -currentWidth / 2 + cabinet.offsetBottom + cabinet.height,
                cabinet.boundaries.leftBoundary + (cabinet.mesh.position.z - cabinet.width / 2 - cabinet.boundaries.leftBoundary) / 2
            ),
            rightPoint: (cabinet) => new THREE.Vector3(
                currentLength / 2 - cabinet.offsetFromParentWall - cabinet.depth,
                -currentWidth / 2 + cabinet.offsetBottom + cabinet.height,
                cabinet.mesh.position.z + cabinet.width / 2 + (cabinet.boundaries.rightBoundary - (cabinet.mesh.position.z + cabinet.width / 2)) / 2
            ),
            leftValue: (cabinet) => cabinet.mesh.position.z - cabinet.width / 2 - cabinet.boundaries.leftBoundary,
            rightValue: (cabinet) => cabinet.boundaries.rightBoundary - (cabinet.mesh.position.z + cabinet.width / 2)
        }
    };
    const config = configs[wallId];
    return {
        ...config,
        lineStart: config.lineStart,
        lineEnd: config.lineEnd,
        leftPoint: config.leftPoint,
        rightPoint: config.rightPoint,
        leftValue: config.leftValue,
        rightValue: config.rightValue
    };
}

const roomDimention = {
    length: parseFloat(document.getElementById('length').value) / 1000,
    width: parseFloat(document.getElementById('width').value) / 1000,
    height: parseFloat(document.getElementById('height').value) / 1000
}

// Функция сохранения текущего состояния
function saveState(actionType, data) {
    const state = {
        actionType: actionType,
        data: data,
        windows: windows.map(obj => ({
            ...obj,
            mesh: {
                position: { x: obj.mesh.position.x, y: obj.mesh.position.y, z: obj.mesh.position.z },
                rotation: { y: obj.mesh.rotation.y }
            },
            initialColor: typeof obj.initialColor === 'number' ? `#${obj.initialColor.toString(16).padStart(6, '0')}` : obj.initialColor
        })),
        cabinets: cabinets.map(cabinet => ({
            ...cabinet,
            mesh: {
                position: { x: cabinet.mesh.position.x, y: cabinet.mesh.position.y, z: cabinet.mesh.position.z },
                rotation: { y: cabinet.mesh.rotation.y }
            },
            initialColor: typeof cabinet.initialColor === 'number' ? `#${cabinet.initialColor.toString(16).padStart(6, '0')}` : cabinet.initialColor
        })),
        room: {
            length: currentLength,
            height: currentWidth,
            width: currentHeight,
            color: document.getElementById('cubeColor').value,
            rotationX: cube ? cube.rotation.x : THREE.MathUtils.degToRad(30),
            rotationY: cube ? cube.rotation.y : THREE.MathUtils.degToRad(-30),
            kitchenParams: { ...kitchenGlobalParams }
        }
    };

    if (actionHistory.length >= maxHistorySize) {
        actionHistory.shift();
    }
    actionHistory.push(state);
}





// Функция отмены последнего действия
function undoLastAction() {
    if (actionHistory.length === 0) {
        console.log("No actions to undo");
        return;
    }

    const lastAction = actionHistory.pop();

    // Удаляем текущие объекты из сцены
    windows.forEach(obj => scene.remove(obj.mesh));
    cabinets.forEach(cabinet => scene.remove(cabinet.mesh));

    // Восстанавливаем окна
    windows = lastAction.windows.map(obj => {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(obj.width, obj.height, obj.depth),
            new THREE.MeshStandardMaterial({ color: obj.initialColor })
        );
        const edgesGeometry = new THREE.EdgesGeometry(mesh.geometry);
        const edges = new THREE.LineSegments(edgesGeometry, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }));
        edges.raycast = () => {};
        mesh.add(edges);
        mesh.position.set(obj.mesh.position.x, obj.mesh.position.y, obj.mesh.position.z);
        mesh.rotation.y = obj.mesh.rotation.y;
        scene.add(mesh);
        return { ...obj, mesh, edges };
    });

    // Восстанавливаем шкафы
    cabinets = lastAction.cabinets.map(cabinet => {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth),
            new THREE.MeshStandardMaterial({ color: cabinet.initialColor })
        );
        const edgesGeometry = new THREE.EdgesGeometry(mesh.geometry);
        const edges = new THREE.LineSegments(edgesGeometry, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }));
        edges.raycast = () => {};
        mesh.add(edges);
        mesh.position.set(cabinet.mesh.position.x, cabinet.mesh.position.y, cabinet.mesh.position.z);
        mesh.rotation.y = cabinet.mesh.rotation.y;
        scene.add(mesh);
        return { ...cabinet, mesh, edges };
    });

    // Восстанавливаем комнату
    const room = lastAction.room;
    createCube(room.length, room.height, room.width, room.color, room.rotationX, room.rotationY);

    // Синхронизируем поля ввода комнаты
    document.getElementById('length').value = room.length * 1000;
    document.getElementById('height').value = room.height * 1000;
    document.getElementById('width').value = room.width * 1000;
    document.getElementById('cubeColor').value = room.color;

    // Восстанавливаем параметры кухни
    Object.assign(kitchenGlobalParams, room.kitchenParams);

    // Синхронизируем поля ввода параметров кухни
    kitchenGlobalParams.countertopHeight = room.kitchenParams.countertopHeight;
    kitchenGlobalParams.countertopType = room.kitchenParams.countertopType;
    kitchenGlobalParams.countertopThickness = room.kitchenParams.countertopThickness;
    kitchenGlobalParams.countertopDepth = room.kitchenParams.countertopDepth;
    kitchenGlobalParams.plinthHeight = room.kitchenParams.plinthHeight;
    kitchenGlobalParams.handleType = room.kitchenParams.handleType;
    kitchenGlobalParams.kitchenType = room.kitchenParams.kitchenType;
    kitchenGlobalParams.apronHeight = room.kitchenParams.apronHeight;
    kitchenGlobalParams.totalHeight = room.kitchenParams.totalHeight;
    kitchenGlobalParams.mezzanineHeight = room.kitchenParams.mezzanineHeight;
    
    // Обновляем интерфейс
    rotateXSlider.value = THREE.MathUtils.radToDeg(room.rotationX);
    rotateYSlider.value = THREE.MathUtils.radToDeg(room.rotationY);
    //updateRotationDisplay();
    updateCountertopButtonVisibility();
    //updateEdgeColors();
    //updateSelectedFaceDisplay();
    //updateFaceBounds();
}

const objectTypes = {
    window: {
        defaultWidth: 1200 / 1000,
        defaultHeight: 1500 / 1000,
        defaultDepth: 300 / 1000,
        defaultoffsetAlongWall: 400 / 1000,
        defaultOffsetBottom: 860 / 1000,
        defaultoffsetFromParentWall: -290 / 1000,
        initialColor: 0xffff80,
        editable: ['width', 'height', 'offsetAlongWall', 'offsetBottom', 'offsetFromParentWall']
    },
    socket: {
        defaultWidth: 80 / 1000,
        defaultHeight: 80 / 1000,
        defaultDepth: 12 / 1000,
        defaultoffsetAlongWall: 0,
        defaultOffsetBottom: 0,
        defaultoffsetFromParentWall: 0,
        initialColor: 0xff3399,
        editable: ['offsetAlongWall', 'offsetBottom', 'offsetFromParentWall']
    },
    radiator: {
        defaultWidth: 800 / 1000,
        defaultHeight: 500 / 1000,
        defaultDepth: 80 / 1000,
        defaultoffsetAlongWall: 400 / 1000,
        defaultOffsetBottom: 150 / 1000,
        defaultoffsetFromParentWall: 50 / 1000,
        initialColor: 0xffa500,
        editable: ['width', 'height', 'offsetAlongWall', 'offsetBottom', 'offsetFromParentWall']
    },
    column: {
        defaultWidth: 200 / 1000,
        defaultHeight: currentWidth,
        defaultDepth: 200 / 1000,
        defaultoffsetAlongWall: 0,
        defaultOffsetBottom: 0,
        defaultoffsetFromParentWall: 0,
        initialColor: document.getElementById('cubeColor').value,
        editable: ['width', 'height', 'offsetAlongWall', 'offsetBottom', 'offsetFromParentWall']
    },
    door: {
        defaultCanvasWidth: 800 / 1000,
        defaultCanvasHeight: 2050 / 1000,
        defaultFrameWidth: 80 / 1000,
        defaultFrameThickness: 10 / 1000,
        defaultoffsetAlongWall: 500 / 1000,
        defaultOffsetBottom: 0,
        defaultCanvasDepth: 50 / 1000,
        defaultoffsetFromParentWall: -45 / 1000,
        initialColor: 0x666666,
        editable: ['canvasWidth', 'canvasHeight', 'frameWidth', 'frameThickness', 'offsetAlongWall', 'offsetBottom']
    },
    apron: {
        defaultWidth: 1500 / 1000,
        defaultHeight: 600 / 1000,
        defaultDepth: 10 / 1000,
        defaultoffsetAlongWall: 0 / 1000,
        defaultOffsetBottom: 910 / 1000,
        defaultoffsetFromParentWall: 0 / 1000,
        initialColor: 0xd0d0d0,
        editable: ['width', 'height', 'offsetAlongWall', 'offsetBottom', 'offsetFromParentWall']
    },
    lowerCabinet: {
        defaultWidth: 600 / 1000,
        defaultDepth: 520 / 1000,
        defaultoffsetAlongWall: 0,
        initialColor: 0xCCCC66,
        overhang: 18 / 1000,
        facadeThickness: 18 / 1000
        // Убираем defaultHeight, defaultOffsetBottom, defaultoffsetFromParentWall — будем вычислять в addObject
    },
    upperCabinet: {
        defaultWidth: 600 / 1000,
        defaultDepth: 350 / 1000,
        defaultoffsetAlongWall: 0,
        initialColor: 0xFFFFFF,
        facadeThickness: 18 / 1000,
        facadeGap: 3 / 1000,
        isMezzanine: 'normal',
        offsetFromParentWall: 20 / 1000 // <--- НОВЫЙ ПАРАМЕТР: отступ от стены (20мм по умолчанию)
        // Убираем defaultHeight, defaultOffsetBottom, defaultoffsetFromParentWall
    },
    freestandingCabinet: {
        defaultWidth: 600 / 1000,
        defaultDepth: 520 / 1000,
        defaultOffsetX: 0,
        defaultOffsetZ: 0,
        initialColor: 0xCCCC66,
        overhang: 18 / 1000,
        facadeThickness: 18 / 1000
        // Убираем defaultHeight, defaultOffsetBottom
    }
};

function addObject(type) {
    if (selectedFaceIndex === -1) return;

    saveState("addObject", { type: type, wallId: faceNormals[selectedFaceIndex].id });

    const wallId = faceNormals[selectedFaceIndex].id;
    let wallWidth, wallHeight;

    switch (wallId) {
        case "Back":
            wallWidth = currentLength;
            wallHeight = currentWidth;
            break;
        case "Left":
        case "Right":
            wallWidth = currentHeight;
            wallHeight = currentWidth;
            break;
        default:
            return;
    }

    wallWidth *= 1000; // Переводим в мм для проверки
    wallHeight *= 1000;

    const params = objectTypes[type];
    if (wallWidth < 1100 || wallHeight < 1200) {
        alert("Слишком маленькая стена, размещение объекта невозможно");
        return;
    }

    if (type === 'column') {
        params.defaultHeight = currentWidth; // Оставляем как есть
    }

    let mesh, width, height, depth, offsetAlongWall, offsetBottom, offsetFromParentWall;

    if (type === 'lowerCabinet' || type === 'upperCabinet') {
        
    } else if (type === 'door') {
        // Логика для дверей остаётся без изменений
        const groupId = Date.now();
        const canvasWidth = params.defaultCanvasWidth;
        const canvasHeight = params.defaultCanvasHeight;
        const frameWidth = params.defaultFrameWidth;
        const frameThickness = params.defaultFrameThickness;
        const offsetAlongWall = params.defaultoffsetAlongWall;
        const offsetBottom = params.defaultOffsetBottom;
        const canvasDepth = params.defaultCanvasDepth;

        const elements = [
            { width: canvasWidth, height: canvasHeight, depth: canvasDepth, offsetX: 0, offsetY: 0, offsetFromParentWall: (5 - canvasDepth * 1000) / 1000 },
            { width: frameWidth, height: canvasHeight + frameWidth, depth: frameThickness, offsetX: canvasWidth, offsetY: 0, offsetFromParentWall: 0 },
            { width: frameWidth, height: canvasHeight + frameWidth, depth: frameThickness, offsetX: -frameWidth, offsetY: 0, offsetFromParentWall: 0 },
            { width: canvasWidth, height: frameWidth, depth: frameThickness, offsetX: 0, offsetY: canvasHeight, offsetFromParentWall: 0 }
        ];

        elements.forEach((el, index) => {
            const geometry = new THREE.BoxGeometry(el.width, el.height, el.depth);
            const material = new THREE.MeshStandardMaterial({ color: params.initialColor });
            const mesh = new THREE.Mesh(geometry, material);

            const edgesGeometry = new THREE.EdgesGeometry(geometry);
            const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
            const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
            edges.raycast = () => {};
            mesh.add(edges);

            switch (wallId) {
                case "Back":
                    mesh.position.set(
                        -currentLength / 2 + offsetAlongWall + el.offsetX + el.width / 2,
                        -currentWidth / 2 + offsetBottom + el.offsetY + el.height / 2,
                        -currentHeight / 2 + el.offsetFromParentWall + el.depth / 2
                    );
                    break;
                case "Left":
                    mesh.position.set(
                        -currentLength / 2 + el.offsetFromParentWall + el.depth / 2,
                        -currentWidth / 2 + offsetBottom + el.offsetY + el.height / 2,
                        -currentHeight / 2 + offsetAlongWall + el.offsetX + el.width / 2
                    );
                    mesh.rotation.y = THREE.MathUtils.degToRad(90);
                    break;
                case "Right":
                    mesh.position.set(
                        currentLength / 2 - el.offsetFromParentWall - el.depth / 2,
                        -currentWidth / 2 + offsetBottom + el.offsetY + el.height / 2,
                        -currentHeight / 2 + offsetAlongWall + el.offsetX + el.width / 2
                    );
                    mesh.rotation.y = THREE.MathUtils.degToRad(-90);
                    break;
            }

            scene.add(mesh);
            const obj = {
                mesh: mesh,
                wallId: wallId,
                initialColor: params.initialColor,
                width: el.width,
                height: el.height,
                depth: el.depth,
                offsetAlongWall: offsetAlongWall + el.offsetX,
                offsetBottom: offsetBottom + el.offsetY,
                offsetFromParentWall: el.offsetFromParentWall,
                type: type,
                edges: edges,
                groupId: groupId,
                doorIndex: index
            };
            windows.push(obj);

            //mesh.material.color.set(0x00ffff);
            //edges.material.color.set(0x00ffff);
            //mesh.material.needsUpdate = true;
            //edges.material.needsUpdate = true;
        });

        const firstDoorElement = windows.find(w => w.groupId === groupId && w.doorIndex === 0);
        applyHighlight(firstDoorElement.mesh);
        selectedCabinets = [firstDoorElement]; // или другой массив, если ты используешь selectedObjects
        selectedCabinet = firstDoorElement;
        const center = new THREE.Vector3();
        firstDoorElement.mesh.getWorldPosition(center);
        const screenPos = center.project(camera);
        const rect = renderer.domElement.getBoundingClientRect();
        const x = (screenPos.x + 1) * rect.width / 2 + rect.left;
        const y = (-screenPos.y + 1) * rect.height / 2 + rect.top;
        showWindowMenu(x, y, firstDoorElement);
    } else {
        // Логика для остальных объектов (window, socket, radiator, column) остаётся без изменений
        const geometry = new THREE.BoxGeometry(params.defaultWidth, params.defaultHeight, params.defaultDepth);
        const material = new THREE.MeshStandardMaterial({ color: params.initialColor });
        mesh = new THREE.Mesh(geometry, material);

        const edgesGeometry = new THREE.EdgesGeometry(geometry);
        const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
        const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
        edges.raycast = () => {};
        mesh.add(edges);

        switch (wallId) {
            case "Back":
                mesh.position.set(
                    -currentLength / 2 + params.defaultoffsetAlongWall + params.defaultWidth / 2,
                    -currentWidth / 2 + params.defaultOffsetBottom + params.defaultHeight / 2,
                    -currentHeight / 2 + params.defaultoffsetFromParentWall + params.defaultDepth / 2
                );
                break;
            case "Left":
                mesh.position.set(
                    -currentLength / 2 + params.defaultoffsetFromParentWall + params.defaultDepth / 2,
                    -currentWidth / 2 + params.defaultOffsetBottom + params.defaultHeight / 2,
                    -currentHeight / 2 + params.defaultoffsetAlongWall + params.defaultWidth / 2
                );
                mesh.rotation.y = THREE.MathUtils.degToRad(90);
                break;
            case "Right":
                mesh.position.set(
                    currentLength / 2 - params.defaultoffsetFromParentWall - params.defaultDepth / 2,
                    -currentWidth / 2 + params.defaultOffsetBottom + params.defaultHeight / 2,
                    -currentHeight / 2 + params.defaultoffsetAlongWall + params.defaultWidth / 2
                );
                mesh.rotation.y = THREE.MathUtils.degToRad(-90);
                break;
        }

        scene.add(mesh);
        const obj = {
            mesh: mesh,
            wallId: wallId,
            initialColor: params.initialColor,
            width: params.defaultWidth,
            height: params.defaultHeight,
            depth: params.defaultDepth,
            offsetAlongWall: params.defaultoffsetAlongWall,
            offsetBottom: params.defaultOffsetBottom,
            offsetFromParentWall: params.defaultoffsetFromParentWall,
            type: type,
            edges: edges
        };
        windows.push(obj);

        applyHighlight(obj.mesh);
        selectedCabinets = [obj]; // или другой массив, если ты используешь selectedObjects
        selectedCabinet = obj;

        const center = new THREE.Vector3();
        mesh.getWorldPosition(center);
        const screenPos = center.project(camera);
        const rect = renderer.domElement.getBoundingClientRect();
        const x = (screenPos.x + 1) * rect.width / 2 + rect.left;
        const y = (-screenPos.y + 1) * rect.height / 2 + rect.top;

        if (type === 'socket') {
            showSocketMenu(x, y, obj);
        } else {
            showWindowMenu(x, y, obj);
        }
    }
}

function applyObjectChanges(objectIndex) {
    const obj = windows[objectIndex];
    const wallId = obj.wallId;
    const type = obj.type;
    const params = objectTypes[type];

    if (type === 'door') {
        const groupId = obj.groupId;
        const newCanvasWidth = parseFloat(document.getElementById('doorCanvasWidth').value) / 1000;
        const newCanvasHeight = parseFloat(document.getElementById('doorCanvasHeight').value) / 1000;
        const newFrameWidth = parseFloat(document.getElementById('doorFrameWidth').value) / 1000;
        const newFrameThickness = parseFloat(document.getElementById('doorFrameThickness').value) / 1000;
        const offsetAlongWall = parseFloat(document.getElementById('dooroffsetAlongWall').value) / 1000;
        const offsetBottom = parseFloat(document.getElementById('doorOffsetBottom').value) / 1000;

        // Обновляем все части двери с этим groupId
        windows.forEach(w => {
            if (w.groupId === groupId) {
                if (w.doorIndex === 0) { // Полотно двери
                    w.width = newCanvasWidth;
                    w.height = newCanvasHeight;
                    w.depth = params.defaultCanvasDepth;
                    w.offsetAlongWall = offsetAlongWall;
                    w.offsetBottom = offsetBottom;
                    w.offsetFromParentWall = (5 - params.defaultCanvasDepth * 1000) / 1000;
                } else if (w.doorIndex === 1) { // Боковой наличник справа
                    w.width = newFrameWidth;
                    w.height = newCanvasHeight + newFrameWidth;
                    w.depth = newFrameThickness;
                    w.offsetAlongWall = offsetAlongWall + newCanvasWidth;
                    w.offsetBottom = offsetBottom;
                    w.offsetFromParentWall = 0;
                } else if (w.doorIndex === 2) { // Боковой наличник слева
                    w.width = newFrameWidth;
                    w.height = newCanvasHeight + newFrameWidth;
                    w.depth = newFrameThickness;
                    w.offsetAlongWall = offsetAlongWall - newFrameWidth;
                    w.offsetBottom = offsetBottom;
                    w.offsetFromParentWall = 0;
                } else if (w.doorIndex === 3) { // Верхний наличник
                    w.width = newCanvasWidth;
                    w.height = newFrameWidth;
                    w.depth = newFrameThickness;
                    w.offsetAlongWall = offsetAlongWall;
                    w.offsetBottom = offsetBottom + newCanvasHeight;
                    w.offsetFromParentWall = 0;
                }

                // Обновляем геометрию и позицию
                w.mesh.geometry.dispose();
                w.mesh.geometry = new THREE.BoxGeometry(w.width, w.height, w.depth);
                w.edges.geometry.dispose();
                w.edges.geometry = new THREE.EdgesGeometry(w.mesh.geometry);

                switch (wallId) {
                    case "Back":
                        w.mesh.position.set(
                            -currentLength / 2 + w.offsetAlongWall + w.width / 2,
                            -currentWidth / 2 + w.offsetBottom + w.height / 2,
                            -currentHeight / 2 + w.offsetFromParentWall + w.depth / 2
                        );
                        w.mesh.rotation.y = 0;
                        break;
                    case "Left":
                        w.mesh.position.set(
                            -currentLength / 2 + w.offsetFromParentWall + w.depth / 2,
                            -currentWidth / 2 + w.offsetBottom + w.height / 2,
                            -currentHeight / 2 + w.offsetAlongWall + w.width / 2
                        );
                        w.mesh.rotation.y = THREE.MathUtils.degToRad(90);
                        break;
                    case "Right":
                        w.mesh.position.set(
                            currentLength / 2 - w.offsetFromParentWall - w.depth / 2,
                            -currentWidth / 2 + w.offsetBottom + w.height / 2,
                            -currentHeight / 2 + w.offsetAlongWall + w.width / 2
                        );
                        w.mesh.rotation.y = THREE.MathUtils.degToRad(-90);
                        break;
                }
                removeHighlight(obj.mesh);
                selectedCabinets = []; // или другой массив, если ты используешь selectedObjects
                selectedCabinet = null;              
            }
        });

        hideWindowMenu();
        return; // Завершаем выполнение для "двери"
    }

    // Логика для остальных объектов (окно, розетка, радиатор, колонна)
    let newWidth = obj.width;
    let newHeight = obj.height;
    let newDepth = obj.depth;
    let offsetAlongWall = obj.offsetAlongWall;
    let offsetBottom = obj.offsetBottom;
    let offsetFromParentWall = obj.offsetFromParentWall;

    if (type === 'window' || type === 'radiator' || type === 'column' || type === 'apron') {
        newWidth = parseFloat(document.getElementById('windowWidth').value) / 1000;
        newHeight = parseFloat(document.getElementById('windowHeight').value) / 1000;
        newDepth = parseFloat(document.getElementById('windowDepth').value) / 1000;
        offsetAlongWall = parseFloat(document.getElementById('windowoffsetAlongWallEdge').value) / 1000;
        offsetBottom = parseFloat(document.getElementById('windowOffsetBottomEdge').value) / 1000;
        offsetFromParentWall = parseFloat(document.getElementById('windowoffsetFromParentWall').value) / 1000 || 0;
    } else if (type === 'socket') {
        const socketWidthMm = eval(document.getElementById('socketWidth').value); // Новая ширина в мм
        const socketHeightMm = socketWidthMm; // Ширина = высота
        const offsetAlongWallCenter = eval(document.getElementById('socketoffsetAlongWallCenter').value); // До центра в мм
        const offsetBottomCenter = eval(document.getElementById('socketOffsetBottomCenter').value); // До центра в мм
        offsetAlongWall = (offsetAlongWallCenter - socketWidthMm / 2) / 1000; // До края в метрах
        offsetBottom = (offsetBottomCenter - socketHeightMm / 2) / 1000; // До края в метрах
        offsetFromParentWall = eval(document.getElementById('socketoffsetFromParentWall').value) / 1000 || 0;
        newWidth = socketWidthMm / 1000; // В метрах
        newHeight = socketHeightMm / 1000; // В метрах
        newDepth = obj.depth; // Оставляем как есть или задаём по умолчанию

        // Обновляем defaultWidth и defaultHeight в objectTypes.socket
        objectTypes.socket.defaultWidth = newWidth;
        objectTypes.socket.defaultHeight = newHeight;
    }

    let wallWidth, wallHeight, wallDepth;
    switch (wallId) {
        case "Back":
            wallWidth = currentLength;
            wallHeight = currentWidth;
            wallDepth = currentHeight;
            break;
        case "Left":
        case "Right":
            wallWidth = currentHeight;
            wallHeight = currentWidth;
            wallDepth = currentLength;
            break;
    }

    if (newWidth + offsetAlongWall > wallWidth || newHeight + offsetBottom > wallHeight || newDepth + offsetFromParentWall > wallDepth) {
        alert("Слишком большой габарит объекта, проверьте введённые размеры!");
        removeHighlight(obj.mesh);
        selectedCabinets = []; // или другой массив, если ты используешь selectedObjects
        selectedCabinet = null; 
        if (type === 'socket') hideSocketMenu();
        else hideWindowMenu();
        return;
    }

    obj.mesh.geometry.dispose();
    obj.mesh.geometry = new THREE.BoxGeometry(newWidth, newHeight, newDepth);
    obj.edges.geometry.dispose();
    obj.edges.geometry = new THREE.EdgesGeometry(obj.mesh.geometry);

    switch (wallId) {
        case "Back":
            obj.mesh.position.set(
                -currentLength / 2 + offsetAlongWall + newWidth / 2,
                -currentWidth / 2 + offsetBottom + newHeight / 2,
                -currentHeight / 2 + offsetFromParentWall + newDepth / 2
            );
            obj.mesh.rotation.y = 0;
            break;
        case "Left":
            obj.mesh.position.set(
                -currentLength / 2 + offsetFromParentWall + newDepth / 2,
                -currentWidth / 2 + offsetBottom + newHeight / 2,
                -currentHeight / 2 + offsetAlongWall + newWidth / 2
            );
            obj.mesh.rotation.y = THREE.MathUtils.degToRad(90);
            break;
        case "Right":
            obj.mesh.position.set(
                currentLength / 2 - offsetFromParentWall - newDepth / 2,
                -currentWidth / 2 + offsetBottom + newHeight / 2,
                -currentHeight / 2 + offsetAlongWall + newWidth / 2
            );
            obj.mesh.rotation.y = THREE.MathUtils.degToRad(-90);
            break;
    }

    obj.width = newWidth;
    obj.height = newHeight;
    obj.depth = newDepth;
    obj.offsetAlongWall = offsetAlongWall;
    obj.offsetBottom = offsetBottom;
    obj.offsetFromParentWall = offsetFromParentWall;

    removeHighlight(obj.mesh);
        selectedCabinets = []; // или другой массив, если ты используешь selectedObjects
        selectedCabinet = null; 
    if (type === 'socket') hideSocketMenu();
    else hideWindowMenu();
}

const rotateXSlider = document.getElementById('rotateX');
const rotateYSlider = document.getElementById('rotateY');
const rotateXValue = document.getElementById('rotateXValue');
const rotateYValue = document.getElementById('rotateYValue');
//export const zoomSlider = document.getElementById('zoom');
//const selectedFaceDisplay = document.getElementById('selectedFace');
const mouseXDisplay = document.getElementById('mouseX');
const mouseYDisplay = document.getElementById('mouseY');
const faceBoundsTable = document.getElementById('faceBoundsTable');

//--- 12.03 13:20
function attachExpressionValidator(input) {
    let lastValidValue = input.value; // Сохраняем начальное значение
    const regex = /^[\d\s+\-*/]+$/; // Проверка на цифры и операторы
    let isProcessing = false; // Флаг для предотвращения race condition

    input.addEventListener("blur", function() {
        if (isProcessing) return;
        isProcessing = true;

        let newValue = input.value.trim();
        
        if (regex.test(newValue)) {
            try {
                let result = eval(newValue); // Вычисляем результат
                if (isNaN(result) || result < parseFloat(input.dataset.min)) {
                    //console.log(input.dataset.min);
                    alert(`Значение должно быть числом не меньше ${input.dataset.min}!`);
                    input.value = lastValidValue;
                } else {
                    input.value = Math.round(result); // Записываем результат
                    lastValidValue = input.value;
                }
            } catch (e) {
                alert("Ошибка в выражении!");
                input.value = lastValidValue;
            }
        } else if (newValue === "" || isNaN(parseFloat(newValue))) {
            alert("Неверный формат! Используйте только цифры и операторы +, -, *, /");
            input.value = lastValidValue;
        } else {
            let numValue = parseFloat(newValue);
            if (numValue < parseFloat(input.dataset.min)) {
                alert(`Значение должно быть числом не меньше ${input.dataset.min}!`);
                input.value = lastValidValue;
            } else {
                input.value = Math.round(numValue);
                lastValidValue = input.value;
            }
        }

        isProcessing = false;
    });

    input.addEventListener("keydown", function(event) {
        if (event.key === "Enter" && !isProcessing) {
            input.blur(); // Вызываем blur для обработки значения
        }
    });
}
//-----

function showWindowMenu(x, y, window) {
    let menu = document.getElementById('windowMenu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'windowMenu';
        menu.style.position = 'absolute';
        //menu.style.background = '#f0f0f0';
        //menu.style.border = '1px solid #ccc';
        //menu.style.padding = '10px';
        //menu.style.borderRadius = '5px';
        document.body.appendChild(menu);
    }

    const wallId = window.wallId;
    let offsetAlongWall = (wallId === "Back") ? 
        (window.mesh.position.x + currentLength / 2 - window.mesh.geometry.parameters.width / 2) * 1000 : 
        (window.mesh.position.z + currentHeight / 2 - window.mesh.geometry.parameters.width / 2) * 1000;
    let offsetBottom = (window.mesh.position.y + currentWidth / 2 - window.mesh.geometry.parameters.height / 2) * 1000;
    let offsetFromParentWall = window.offsetFromParentWall * 1000;

    offsetAlongWall = Math.round(offsetAlongWall);
    offsetBottom = Math.round(offsetBottom);
    offsetFromParentWall = Math.round(offsetFromParentWall);
    if (Math.abs(offsetAlongWall) < 0.02) offsetAlongWall = 0;
    if (Math.abs(offsetBottom) < 0.02) offsetBottom = 0;
    if (Math.abs(offsetFromParentWall) < 0.02) offsetFromParentWall = 0;

    const windowWidth = window.mesh.geometry.parameters.width * 1000;
    const windowHeight = window.mesh.geometry.parameters.height * 1000;
    const windowDepth = window.mesh.geometry.parameters.depth * 1000;

    const title = window.type === 'radiator' ? 'Параметры радиатора' : 
                  window.type === 'column' ? 'Параметры колонны' : 
                  window.type === 'door' ? 'Параметры двери' : 
                  window.type === 'apron' ? 'Параметры фартука' :
                  'Параметры окна';

    let html = `
        <h3 style="margin: 0 0 10px 0; font-size: 14px;">${title}</h3>
        <div style="display: flex; flex-direction: column; gap: 5px;">
    `;

    if (window.type === 'door') {
        const groupId = window.groupId;
        let doorCanvas = groupId ? windows.find(w => w.groupId === groupId && w.doorIndex === 0) : window;
        let doorFrameLeft = groupId ? windows.find(w => w.groupId === groupId && w.doorIndex === 1) : null;

        if (!doorCanvas) {
            doorCanvas = window;
        }
        if (!doorFrameLeft) {
            doorFrameLeft = { width: 0.08, depth: 0.01 };
        }

        html += `
            <label>Ширина полотна, мм: <input type="text" id="doorCanvasWidth" value="${Math.round(doorCanvas.width * 1000)}" data-min="10" style="width: 100px; border-radius: 3px;"></label>
            <label>Высота полотна, мм: <input type="text" id="doorCanvasHeight" value="${Math.round(doorCanvas.height * 1000)}" data-min="10" style="width: 100px; border-radius: 3px;"></label>
            <label>Ширина наличника, мм: <input type="text" id="doorFrameWidth" value="${Math.round(doorFrameLeft.width * 1000)}" data-min="5" style="width: 100px; border-radius: 3px;"></label>
            <label>Толщина наличника, мм: <input type="text" id="doorFrameThickness" value="${Math.round(doorFrameLeft.depth * 1000)}" data-min="1" style="width: 100px; border-radius: 3px;"></label>
            <label>Отступ от угла, мм: <input type="text" id="dooroffsetAlongWall" value="${Math.round(doorCanvas.offsetAlongWall * 1000)}" data-min="0" style="width: 100px; border-radius: 3px;"></label>
            <label>Отступ от пола, мм: <input type="text" id="doorOffsetBottom" value="${Math.round(doorCanvas.offsetBottom * 1000)}" data-min="0" style="width: 100px; border-radius: 3px;"></label>
        `;
        const canvasIndex = windows.indexOf(doorCanvas);
        html += `
            <button onclick="applyObjectChanges(${canvasIndex})" style="margin-top: 5px;">Применить</button>
            <button onclick="deleteWindow(${windows.indexOf(window)})" style="margin-top: 5px;">Удалить</button>
        </div>
    `;
    } else {
        html += `
            <label>Ширина, мм: <input type="text" id="windowWidth" value="${Math.round(windowWidth)}" data-min="10" style="width: 100px; border-radius: 3px;"></label>
            <label>Высота, мм: <input type="text" id="windowHeight" value="${Math.round(windowHeight)}" data-min="10" style="width: 100px; border-radius: 3px;"></label>
            <label>Глубина, мм: <input type="text" id="windowDepth" value="${Math.round(windowDepth)}" data-min="5" style="width: 100px; border-radius: 3px;"></label>
            <label>От стены, мм: <input type="text" id="windowoffsetAlongWallEdge" value="${offsetAlongWall}" data-min="0" style="width: 100px; border-radius: 3px;"></label>
            <label>От пола, мм: <input type="text" id="windowOffsetBottomEdge" value="${offsetBottom}" data-min="0" style="width: 100px; border-radius: 3px;"></label>
            <label>Отступ от стены, мм: <input type="text" id="windowoffsetFromParentWall" value="${offsetFromParentWall}" data-min="0" style="width: 100px; border-radius: 3px;"></label>
            <button onclick="applyObjectChanges(${windows.indexOf(window)})">Применить</button>
            <button onclick="deleteWindow(${windows.indexOf(window)})" style="margin-top: 5px;">Удалить</button>
        </div>
    `;
    }

    menu.innerHTML = html;

    // Добавляем обработчики ко всем числовым полям
    const inputs = menu.querySelectorAll('input[type="text"]');
    inputs.forEach(input => attachExpressionValidator(input));

    menu.style.left = `${x + 30}px`;
    menu.style.top = `${y - 10}px`;
    menu.style.display = 'block';

    setTimeout(() => {
        const menuWidth = menu.offsetWidth;
        const menuHeight = menu.offsetHeight;
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        let left = x + 30;
        let top = y - 10;

        if (left + menuWidth > screenWidth) {
            left = screenWidth - menuWidth - 5;
        }
        if (left < 0) {
            left = 5;
        }
        if (top + menuHeight > screenHeight) {
            top = screenHeight - menuHeight - 5;
        }
        if (top < 0) {
            top = 5;
        }

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;

        const firstField = window.type === 'door' ? document.getElementById('doorCanvasWidth') : document.getElementById('windowWidth');
        firstField.focus();
        firstField.select();
    }, 0);
}

function hideWindowMenu() {
    const menu = document.getElementById('windowMenu');
    if (menu) menu.style.display = 'none';
}

function deleteWindow(windowIndex) {
    saveState("deleteWindow", { windowIndex: windowIndex });

    const window = windows[windowIndex];
    const groupId = window.groupId;

    if (groupId) {
        for (let i = windows.length - 1; i >= 0; i--) {
            if (windows[i].groupId === groupId) {
                scene.remove(windows[i].mesh);
                windows.splice(i, 1);
            }
        }
    } else {
        scene.remove(window.mesh);
        windows.splice(windowIndex, 1);
    }
    hideWindowMenu();
    hideSocketMenu();
}

function showSocketMenu(x, y, socket) {
    let menu = document.getElementById('socketMenu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'socketMenu';
        menu.style.position = 'absolute';
        menu.style.background = '#f0f0f0';
        menu.style.border = '1px solid #ccc';
        menu.style.padding = '10px';
        menu.style.borderRadius = '5px';
        document.body.appendChild(menu);
    }

    const wallId = socket.wallId;
    let offsetAlongWall = (wallId === "Back") ? 
        (socket.mesh.position.x + currentLength / 2 - socket.mesh.geometry.parameters.width / 2) * 1000 : 
        (socket.mesh.position.z + currentHeight / 2 - socket.mesh.geometry.parameters.width / 2) * 1000;
    let offsetBottom = (socket.mesh.position.y + currentWidth / 2 - socket.mesh.geometry.parameters.height / 2) * 1000;
    let offsetFromParentWall = socket.offsetFromParentWall * 1000;

    offsetAlongWall = Math.round(offsetAlongWall);
    offsetBottom = Math.round(offsetBottom);
    offsetFromParentWall = Math.round(offsetFromParentWall);
    if (Math.abs(offsetAlongWall) < 0.02) offsetAlongWall = 0;
    if (Math.abs(offsetBottom) < 0.02) offsetBottom = 0;
    if (Math.abs(offsetFromParentWall) < 0.02) offsetFromParentWall = 0;

    const socketWidthMm = socket.mesh.geometry.parameters.width * 1000; // 80 мм
    const socketHeightMm = socket.mesh.geometry.parameters.height * 1000; // 80 мм
    const offsetAlongWallCenter = offsetAlongWall + socketWidthMm / 2; // До центра
    const offsetBottomCenter = offsetBottom + socketHeightMm / 2; // До центра

    menu.innerHTML = `
        <h3 style="margin: 0 0 10px 0; font-size: 14px;">Параметры розетки</h3>
        <div style="display: flex; flex-direction: column; gap: 5px;">
            <label>Ширина розетки, мм: <input type="text" id="socketWidth" value="${socketWidthMm}" data-min="40" style="width: 80px; border-radius: 3px;"></label>
            <label>От стены до центра, мм: <input type="text" id="socketoffsetAlongWallCenter" value="${offsetAlongWallCenter}" data-min="40" style="width: 80px; border-radius: 3px;"></label>
            <label>От пола до центра, мм: <input type="text" id="socketOffsetBottomCenter" value="${offsetBottomCenter}" data-min="40" style="width: 80px; border-radius: 3px;"></label>
            <label>Отступ от стены, мм: <input type="text" id="socketoffsetFromParentWall" value="${offsetFromParentWall}" data-min="0" style="width: 80px; border-radius: 3px;"></label>
            <div style="margin-top: 10px;">
                <div style="display: flex; border: 1px solid #ccc;">
                    <div style="flex: 1; padding: 5px; text-align: center; font-size: 12px; background: #e0e0e0; border-bottom: 1px solid #ccc;">Добавить розетку</div>
                </div>
                <div style="display: flex; border: 1px solid #ccc; border-top: none;">
                    <div style="flex: 1; padding: 5px; text-align: center; border-right: 1px solid #ccc;">
                        <button onclick="addAdjacentSocket(${windows.indexOf(socket)}, 'left')" style="width: 22px; height: 22px; padding: 0; border: 1px solid #ccc; background: #fff;">←</button>
                    </div>
                    <div style="flex: 1; padding: 5px; text-align: center; border-right: 1px solid #ccc;">
                        <button onclick="addAdjacentSocket(${windows.indexOf(socket)}, 'up')" style="width: 22px; height: 22px; padding: 0; border: 1px solid #ccc; background: #fff;">↑</button>
                    </div>
                    <div style="flex: 1; padding: 5px; text-align: center; border-right: 1px solid #ccc;">
                        <button onclick="addAdjacentSocket(${windows.indexOf(socket)}, 'down')" style="width: 22px; height: 22px; padding: 0; border: 1px solid #ccc; background: #fff;">↓</button>
                    </div>
                    <div style="flex: 1; padding: 5px; text-align: center;">
                        <button onclick="addAdjacentSocket(${windows.indexOf(socket)}, 'right')" style="width: 22px; height: 22px; padding: 0; border: 1px solid #ccc; background: #fff;">→</button>
                    </div>
                </div>
            </div>
            <button onclick="applyObjectChanges(${windows.indexOf(socket)})" style="margin-top: 5px;">Применить</button>
            <button onclick="deleteWindow(${windows.indexOf(socket)})" style="margin-top: 5px;">Удалить</button>
        </div>
    `;

    menu.style.display = 'block';

    // Добавляем обработчики
    const inputs = menu.querySelectorAll('input[type="text"]');
    inputs.forEach(input => attachExpressionValidator(input));

    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    let left = x + 60;
    let top = y - 10;

    if (left + menuWidth > screenWidth) left = screenWidth - menuWidth - 5;
    if (left < 0) left = 5;
    if (top + menuHeight > screenHeight) top = screenHeight - menuHeight - 5;
    if (top < 0) top = 5;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    const socketoffsetAlongWallCenter = document.getElementById('socketoffsetAlongWallCenter');
    socketoffsetAlongWallCenter.focus();
    socketoffsetAlongWallCenter.select();

    //applyHighlight(socket.mesh);
    //selectedCabinets = [socket]; // или другой массив, если ты используешь selectedObjects
    //selectedCabinet = socket;
}

// Глобальная переменная для хранения начальных данных при открытии меню
let initialMenuData = {
    cabinetIndex: -1,
    originalType: null,         // Тип шкафа при открытии cabinetMenu
    originalConfig: null,     // Конфигурация шкафа при открытии cabinetMenu
    // Можно добавить и другие оригинальные значения, если они нужны для отката или сравнения
    originalWidth: null,
    originalDepth: null,
    originalHeight: null,
    originalOverhang: null,
    originalFacadeGap: null,
    // и т.д. для всех полей, которые есть в cabinetMenu
};

// В script.js
function showCabinetMenu(x, y, cabinet) {
    const cabinetIndex = cabinets.indexOf(cabinet);
    if (cabinetIndex === -1) {
        console.error("showCabinetMenu: Шкаф не найден в массиве cabinets");
        return;
    }
    console.log(`[showCabinetMenu] Открытие для шкафа ${cabinetIndex}. Тип: ${cabinet.cabinetType}, Конфиг: ${cabinet.cabinetConfig}`);
    // 1. ЗАПОМИНАЕМ ИСХОДНОЕ СОСТОЯНИЕ ШКАФА ПРИ ОТКРЫТИИ ЭТОГО МЕНЮ
    initialMenuData.cabinetIndex = cabinets.indexOf(cabinet); // Сохраняем индекс
    initialMenuData.originalType = cabinet.cabinetType;
    initialMenuData.originalConfig = cabinet.cabinetConfig;
    initialMenuData.originalWidth = cabinet.width;
    initialMenuData.originalDepth = cabinet.depth;
    initialMenuData.originalHeight = cabinet.height;
    initialMenuData.originalOverhang = cabinet.overhang;
    initialMenuData.originalFacadeGap = cabinet.facadeGap;
    // Запомните здесь также originalOffsetX, originalOffsetZ, originalOffsetAlongWall, originalIsMezzanine, если они есть в этом меню  // Конфиг на момент открытия cabinetMenu
    
    // 2. СОЗДАНИЕ ИЛИ ПОЛУЧЕНИЕ DOM-ЭЛЕМЕНТА МЕНЮ
    let menu = document.getElementById('cabinetMenu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'cabinetMenu';
        menu.className = 'popup-menu'; // Используем класс для общих стилей
        document.body.appendChild(menu);
    }

    // --- Удаляем старые элементы ввода размеров ---
    hideAllDimensionInputs(); // Прячем поля размеров от предыдущего выделения

    // 3. ГЕНЕРАЦИЯ HTML ДЛЯ МЕНЮ (Значения берутся из ТЕКУЩЕГО объекта cabinet)
    // Этот HTML должен содержать все поля, которые редактируются в cabinetMenu,
    // включая селекты для cabinetType и cabinetConfig.
    // Важно: значения для value="" и selected в <option> должны браться из ТЕКУЩЕГО cabinet.

    const headerText = cabinet.type === 'upperCabinet' ? 'Параметры верхнего шкафа' :
                      cabinet.type === 'freestandingCabinet' ? 'Параметры свободно стоящего шкафа' :
                      'Параметры нижнего шкафа';
    let html = `<h3>${headerText}</h3><div class="menu-content">`;

    // Общие поля
    html += `<label>Ширина, мм: <input type="number" id="cabinetWidth" value="${Math.round(cabinet.width * 1000)}" min="10" data-set-prop="width"></label>`;
    html += `<label>Глубина, мм: <input type="number" id="cabinetDepth" value="${Math.round(cabinet.depth * 1000)}" min="100" data-set-prop="depth"></label>`;

    // Поле высоты (редактируемость зависит от типа и isHeightIndependent)
    let heightDisabledAttr = '';
    if (cabinet.type === 'lowerCabinet' && !cabinet.isHeightIndependent) { // Для стандартных нижних высота обычно не редактируется здесь
        heightDisabledAttr = ' disabled';
    } else if (cabinet.type === 'upperCabinet' && !cabinet.isHeightIndependent && cabinet.isMezzanine !== 'normal') { // Для антресолей и под-антресолями высота может быть фиксированной
        // heightDisabledAttr = ' disabled'; // Раскомментируйте, если нужно
    }
    html += `<label>Высота, мм: <input type="number" id="cabinetHeight" value="${Math.round(cabinet.height * 1000)}" min="100"${heightDisabledAttr} data-set-prop="height"></label>`;


    if (cabinet.type === 'freestandingCabinet') {
        const offsetX = Math.round((cabinet.offsetX || 0) * 1000);
        const offsetZ = Math.round((cabinet.offsetZ || 0) * 1000);
        const rotationY = cabinet.mesh ? cabinet.mesh.rotation.y : 0; // Безопасный доступ к mesh
        const orientation = rotationY === 0 ? 'Back' :
                           rotationY === THREE.MathUtils.degToRad(90) ? 'Left' :
                           rotationY === THREE.MathUtils.degToRad(-90) ? 'Right' :
                           rotationY === THREE.MathUtils.degToRad(180) ? 'Front' :
                           'Back';
        html += `<label>Расстояние от угла по X, мм: <input type="number" id="cabinetOffsetX" value="${offsetX}" min="0" data-set-prop="offsetX"></label>`;
        html += `<label>Расстояние от угла по Z, мм: <input type="number" id="cabinetOffsetZ" value="${offsetZ}" min="0" data-set-prop="offsetZ"></label>`;
        html += `<label>Ориентация: <select id="cabinetOrientation" data-set-prop="orientation">
                    <option value="Back" ${orientation === 'Back' ? 'selected' : ''}>Back</option>
                    <option value="Left" ${orientation === 'Left' ? 'selected' : ''}>Left</option>
                    <option value="Right" ${orientation === 'Right' ? 'selected' : ''}>Right</option>
                    <option value="Front" ${orientation === 'Front' ? 'selected' : ''}>Front</option>
                 </select></label>`;
        html += `<label>Свес, мм: <input type="number" id="cabinetOverhang" value="${Math.round((cabinet.overhang || 0.018) * 1000)}" min="-100" step="1" data-set-prop="overhang"></label>`;
        html += `<label>Зазор между фасадами, мм: <input type="number" id="cabinetFacadeGap" value="${Math.round((cabinet.facadeGap || 0.003) * 1000)}" min="0" step="1" data-set-prop="facadeGap"></label>`;

    } else if (cabinet.type === 'upperCabinet') {
        const offsetAlongWall = Math.round((cabinet.offsetAlongWall || 0) * 1000);
        const offsetBottom = Math.round((cabinet.offsetBottom || 0) * 1000); // Это будет пересчитано, если isMezzanine меняется
        html += `<label>Расстояние до угла, мм: <input type="number" id="cabinetoffsetAlongWall" value="${offsetAlongWall}" min="0" data-set-prop="offsetAlongWall"></label>`;
        html += `<label>Отступ от пола, мм: <input type="number" id="cabinetOffsetBottom" value="${offsetBottom}" min="0" data-set-prop="offsetBottom"></label>`; // Это поле может быть readonly, если высота зависима
        html += `<label>Зазор между фасадами, мм: <input type="number" id="cabinetFacadeGap" value="${Math.round((cabinet.facadeGap || 0.003) * 1000)}" min="0" step="1" data-set-prop="facadeGap"></label>`;
        html += `<label>Тип верхнего шкафа: <select id="mezzanine" data-set-prop="isMezzanine">
                    <option value="normal" ${(cabinet.isMezzanine === 'normal' || !cabinet.isMezzanine) ? 'selected' : ''}>Обычный</option>
                    <option value="mezzanine" ${cabinet.isMezzanine === 'mezzanine' ? 'selected' : ''}>Антресольный</option>
                    <option value="underMezzanine" ${cabinet.isMezzanine === 'underMezzanine' ? 'selected' : ''}>Под антресолями</option>
                 </select></label>`;
    } else { // lowerCabinet у стены
        const offsetAlongWall = Math.round((cabinet.offsetAlongWall || 0) * 1000);
        html += `<label>Расстояние до угла, мм: <input type="number" id="cabinetoffsetAlongWall" value="${offsetAlongWall}" min="0" data-set-prop="offsetAlongWall"></label>`;
        html += `<label>Свес, мм: <input type="number" id="cabinetOverhang" value="${Math.round((cabinet.overhang || 0.018) * 1000)}" min="-100" step="1" data-set-prop="overhang"></label>`;
        html += `<label>Зазор между фасадами, мм: <input type="number" id="cabinetFacadeGap" value="${Math.round((cabinet.facadeGap || 0.003) * 1000)}" min="0" step="1" data-set-prop="facadeGap"></label>`;
    }

    // Селекты Типа и Конфигурации
    html += `<label>Тип шкафа: <select id="cabinetType" data-set-prop="cabinetType">`;
    // Опции для cabinetType (зависят от cabinet.type: lower, upper, freestanding)
    if (cabinet.type === 'upperCabinet') {
        html += `<option value="straightUpper" ${cabinet.cabinetType === 'straightUpper' ? 'selected' : ''}>Прямой</option>`;
        html += `<option value="cornerUpper" ${cabinet.cabinetType === 'cornerUpper' ? 'selected' : ''}>Угловой</option>`;
    } else { // lowerCabinet или freestandingCabinet
        html += `<option value="straight" ${cabinet.cabinetType === 'straight' ? 'selected' : ''}>Прямой</option>`;
        html += `<option value="corner" ${cabinet.cabinetType === 'corner' ? 'selected' : ''}>Угловой</option>`;
    }
    html += `</select></label>`;

    html += `<label>Конфигурация шкафа: <select id="cabinetConfig" data-set-prop="cabinetConfig">`;
    // Опции для cabinetConfig (зависят от выбранного cabinetType в этом же меню)
    // Их нужно будет обновлять динамически, если cabinetType меняется.
    // Пока что генерируем на основе текущего cabinet.cabinetType
    let configOptions = [];
    if (cabinet.cabinetType === 'straightUpper') {
        configOptions = [
            { value: 'swingUpper', text: 'Распашной' }, { value: 'liftUpper', text: 'С подъёмным механизмом' },
            { value: 'openUpper', text: 'Открытый' }
        ];
    } else if (cabinet.cabinetType === 'cornerUpper') {
        configOptions = [ { value: 'cornerUpperStorage', text: 'Угловой, хранение' }, { value: 'cornerUpperOpen', text: 'Угловой, открытый' } ];
    } else if (cabinet.cabinetType === 'corner') { // Для нижних/FS угловых
        configOptions = [ { value: 'sink', text: 'Шкаф с мойкой' }, { value: 'cornerStorage', text: 'Угловой, хранение' } ];
    } else if (cabinet.cabinetType === 'straight') { // Для нижних/FS прямых
        configOptions = [
            { value: 'swing', text: 'Распашной' }, { value: 'drawers', text: 'Выдвижные ящики' },
            { value: 'oven', text: 'Духовка' }, { value: 'tallStorage', text: 'Высокий пенал, хранение' },
            { value: 'tallOvenMicro', text: 'Высокий пенал, духовка+микроволновка' },
            { value: 'fridge', text: 'Встроенный холодильник' }, { value: 'dishwasher', text: 'Посудомойка' },
            { value: 'falsePanel', text: 'Фальш-панель/Декор.панель' }
        ];
    }
    configOptions.forEach(opt => {
        html += `<option value="${opt.value}" ${cabinet.cabinetConfig === opt.value ? 'selected' : ''}>${opt.text}</option>`;
    });
    html += `</select></label>`;

    html += `</div>`; // Закрываем .menu-content

   // 4. КНОПКИ
    html += `<div class="menu-buttons">
                <button type="button" id="configureCabinetBtn">Настроить</button>
                <button type="button" id="applyMainCabinetChangesBtn">Применить</button>
                <button type="button" id="deleteCabinetBtn">Удалить</button>
             </div>`;

    menu.innerHTML = html;

    console.log(" [showCabinetMenu] Поиск в cabinets (длина: " + cabinets.length + "). Ссылка на массив:", cabinets);
    console.log(" [showCabinetMenu] ID в текущем cabinets:", cabinets.map(c => c.id_data));

    // 5. УСТАНОВКА СЛУШАТЕЛЕЙ (после menu.innerHTML)
    const configureBtn = menu.querySelector('#configureCabinetBtn');
    if (configureBtn) {
        // Очищаем старые слушатели (если есть) перед добавлением нового
        const newConfigureBtn = configureBtn.cloneNode(true);
        configureBtn.parentNode.replaceChild(newConfigureBtn, configureBtn);
        newConfigureBtn.addEventListener('click', () => {
            console.log("[showCabinetMenu] Кнопка 'Настроить' нажата.");
            // Вызываем новую функцию, которая применит изменения из этого меню к объекту cabinet
            // и подготовит его для меню конфигурации.
            window.applyChangesAndPrepareForConfigMenu(cabinetIndex); // Эта функция будет создана в script.js

            if (typeof hideCabinetMenu === 'function') hideCabinetMenu(); // Скрываем это меню
            // prevMenuState больше не передаем, т.к. cabinet уже обновлен
            window.showCabinetConfigMenu(cabinetIndex, x, y, cabinets, window.kitchenGlobalParams);
        });
    }

    const applyBtn = menu.querySelector('#applyMainCabinetChangesBtn');
    if (applyBtn) {
        const newApplyBtn = applyBtn.cloneNode(true);
        applyBtn.parentNode.replaceChild(newApplyBtn, applyBtn);
        newApplyBtn.addEventListener('click', () => {
            window.applyCabinetChanges(cabinetIndex); // Ваша существующая функция применения
        });
    }

    const deleteBtn = menu.querySelector('#deleteCabinetBtn');
    if (deleteBtn) {
        const newDeleteBtn = deleteBtn.cloneNode(true);
        deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
        newDeleteBtn.addEventListener('click', () => {
            window.deleteCabinet(cabinetIndex);
        });
    }

    // Слушатель для динамического обновления опций #cabinetConfig при смене #cabinetType
    const typeSelect = menu.querySelector('#cabinetType');
    const configSelect = menu.querySelector('#cabinetConfig'); // configSelect теперь тоже получаем здесь
    if (typeSelect && configSelect) {
        const updateConfigOptions = () => {
            const selectedCabinetType = typeSelect.value;
            configSelect.innerHTML = ''; // Очищаем старые
            let newOptions = [];
            if (selectedCabinetType === 'straightUpper') {
                newOptions = [ { value: 'swingUpper', text: 'Распашной' }, { value: 'liftUpper', text: 'С подъёмным механизмом' }, { value: 'openUpper', text: 'Открытый' } ];
            } else if (selectedCabinetType === 'cornerUpper') {
                newOptions = [ { value: 'cornerUpperStorage', text: 'Угловой, хранение' }, { value: 'cornerUpperOpen', text: 'Угловой, открытый' } ];
            } else if (selectedCabinetType === 'corner') {
                newOptions = [ { value: 'sink', text: 'Шкаф с мойкой' }, { value: 'cornerStorage', text: 'Угловой, хранение' } ];
            } else if (selectedCabinetType === 'straight') {
                newOptions = [
                    { value: 'swing', text: 'Распашной' }, { value: 'drawers', text: 'Выдвижные ящики' },
                    { value: 'oven', text: 'Духовка' }, { value: 'tallStorage', text: 'Высокий пенал, хранение' },
                    { value: 'tallOvenMicro', text: 'Высокий пенал, духовка+микроволновка' },
                    { value: 'fridge', text: 'Встроенный холодильник' }, { value: 'dishwasher', text: 'Посудомойка' },
                    { value: 'falsePanel', text: 'Фальш-панель/Декор.панель' }
                ];
            }
            let currentConfigStillValid = false;
            newOptions.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.text = opt.text;
                // Пытаемся выбрать текущую конфигурацию шкафа, если она подходит для нового типа
                if (opt.value === cabinet.cabinetConfig) {
                    option.selected = true;
                    currentConfigStillValid = true;
                }
                configSelect.appendChild(option);
            });
            // Если текущая конфигурация не подходит, выбираем первую из списка
            if (!currentConfigStillValid && newOptions.length > 0) {
                configSelect.value = newOptions[0].value;
            }
        };
        typeSelect.removeEventListener('change', typeSelect._updateConfigListener); // Удаляем старый слушатель
        typeSelect._updateConfigListener = updateConfigOptions; // Сохраняем ссылку на новый
        typeSelect.addEventListener('change', updateConfigOptions);
        // updateConfigOptions(); // Вызываем один раз для начального заполнения, если нужно (но HTML уже сгенерирован с selected)
    }

    // --- Блок 6: Валидаторы ---
    const inputsToValidate = [];
    if (cabinet.type === 'freestandingCabinet') {
        inputsToValidate.push(
            document.getElementById('cabinetWidth'), document.getElementById('cabinetDepth'),
            document.getElementById('cabinetHeight'), document.getElementById('cabinetOffsetX'),
            document.getElementById('cabinetOffsetZ')
        );
    } else if (cabinet.type === 'upperCabinet') {
        inputsToValidate.push(
            document.getElementById('cabinetWidth'), document.getElementById('cabinetDepth'),
            document.getElementById('cabinetHeight'), document.getElementById('cabinetoffsetAlongWall'),
            document.getElementById('cabinetOffsetBottom')
        );
    } else { // lowerCabinet
        inputsToValidate.push(
            document.getElementById('cabinetWidth'), document.getElementById('cabinetDepth'),
            document.getElementById('cabinetoffsetAlongWall')
        );
    }
    inputsToValidate.filter(input => input !== null).forEach(input => attachExpressionValidator(input));

    // 7. ОТОБРАЖЕНИЕ И ПОЗИЦИОНИРОВАНИЕ МЕНЮ
    menu.style.left = `${x + 30}px`;
    menu.style.top = `${y - 10}px`;
    menu.style.display = 'block';

    // --- Блок 8: Позиционирование меню ---
     setTimeout(() => {
        // ... (ваш код позиционирования меню, чтобы не выходило за экран) ...
        const menuWidth = menu.offsetWidth;
        const menuHeight = menu.offsetHeight;
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        let left = parseFloat(menu.style.left);
        let top = parseFloat(menu.style.top);
        // ... (расчет left, top) ...
        if (left + menuWidth > screenWidth) left = screenWidth - menuWidth - 5;
        if (left < 0) left = 5;
        if (top + menuHeight > screenHeight) top = screenHeight - menuHeight - 5;
        if (top < 0) top = 5;
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;

        const firstField = menu.querySelector('input[type="number"], select');
        if (firstField) {
            firstField.focus();
            if (typeof firstField.select === 'function') firstField.select();
        }
    }, 0);
}

function deleteCabinet(cabinetIndex) {
    saveState("deleteCabinet", { cabinetIndex: cabinetIndex });

    const cabinet = cabinets[cabinetIndex];
    scene.remove(cabinet.mesh);
    cabinets.splice(cabinetIndex, 1);
    hideCabinetMenu();
}



function hideCabinetMenu() {
    const menu = document.getElementById('cabinetMenu');
    if (menu) menu.style.display = 'none';
}

let countertopMenu = null;

function showCountertopMenu(x, y, countertop) {
    // Удаляем старое меню, если оно есть
    hideCountertopMenu();
    
    // Создаём меню
    countertopMenu = document.createElement('div');
    countertopMenu.className = 'context-menu';
    countertopMenu.style.position = 'absolute';
    countertopMenu.style.background = '#fff';
    countertopMenu.style.border = '1px solid #ccc';
    countertopMenu.style.padding = '10px';
    countertopMenu.style.zIndex = '1000';
    hideAllDimensionInputs(); // Удаляем старые элементы

    // Поле глубины
    const depthLabel = document.createElement('label');
    depthLabel.textContent = 'Глубина (мм): ';
    const depthInput = document.createElement('input');
    depthInput.type = 'text';
    depthInput.value = Math.round(countertop.userData.depth * 1000);
    depthInput.style.width = '60px';
    depthLabel.appendChild(depthInput);
    countertopMenu.appendChild(depthLabel);
    countertopMenu.appendChild(document.createElement('br'));

    // Выбор материала
    const materialLabel = document.createElement('label');
    materialLabel.textContent = 'Материал: ';
    const materialSelect = document.createElement('select');
    const options = [
        { value: 'oak', text: 'Дуб' },
        { value: 'stone', text: 'Камень' },
        { value: 'solid', text: 'Однотонная' }
    ];
    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.text;
        materialSelect.appendChild(option);
    });
    materialSelect.value = countertop.userData.materialType || 'solid';
    materialLabel.appendChild(materialSelect);
    countertopMenu.appendChild(materialLabel);
    countertopMenu.appendChild(document.createElement('br'));

    // Поле цвета
    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Цвет: ';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = countertop.userData.solidColor || '#808080';
    colorLabel.appendChild(colorInput);
    countertopMenu.appendChild(colorLabel);
    countertopMenu.appendChild(document.createElement('br'));

    // Кнопка "Применить"
    const applyButton = document.createElement('button');
    applyButton.textContent = 'Применить';
    applyButton.style.marginTop = '10px';
    applyButton.addEventListener('click', () => {
        applyCountertopChanges(countertop, depthInput.value, materialSelect.value, colorInput.value);
        selectedCabinets = [];
        selectedCabinet = null;
        hideCountertopMenu();
    });
    countertopMenu.appendChild(applyButton);

    // Кнопка "Удалить"
    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Удалить';
    deleteButton.style.marginLeft = '10px';
    deleteButton.addEventListener('click', () => {
        removeCountertop(countertop);
        hideCountertopMenu();
    });
    countertopMenu.appendChild(deleteButton);

    // Добавляем меню в DOM
    document.body.appendChild(countertopMenu);

    // Позиционирование с проверкой границ
    const menuWidth = countertopMenu.offsetWidth;
    const menuHeight = countertopMenu.offsetHeight;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    let posX = x;
    let posY = y;
    if (posX + menuWidth > windowWidth) posX = windowWidth - menuWidth;
    if (posY + menuHeight > windowHeight) posY = windowHeight - menuHeight;
    if (posX < 0) posX = 0;
    if (posY < 0) posY = 0;

    countertopMenu.style.left = `${posX}px`;
    countertopMenu.style.top = `${posY}px`;
}

function hideCountertopMenu() {
    if (countertopMenu) {
        countertopMenu.remove();
        countertopMenu = null;
    }
}

function removeCountertop(countertop) {
    if (!countertop) return;

    // Безопасно удаляем материал
    if (Array.isArray(countertop.material)) {
        countertop.material.forEach(mat => mat?.dispose?.());
    } else {
        countertop.material?.dispose?.();
    }

    countertop.geometry?.dispose?.();

    // Удаление ребер
    if (countertop.userData?.edges) {
        countertop.userData.edges.geometry?.dispose?.();
        scene.remove(countertop.userData.edges);
    }

    scene.remove(countertop);
    countertops = countertops.filter(ct => ct !== countertop);
    updateHint("Столешница удалена");
}


// Проверка пересечений
function checkCabinetIntersections(cabinet) {
    cabinet.mesh.updateMatrixWorld();
    cube.updateMatrixWorld();

    const position = cabinet.mesh.position.clone();
    const width = cabinet.width;
    const height = cabinet.height;
    const depth = cabinet.depth;
    const rotationY = cabinet.mesh.rotation.y;

    let cabinetMin, cabinetMax;
    if (cabinet.type === 'freestandingCabinet') {
        if (rotationY === 0 || rotationY === THREE.MathUtils.degToRad(180)) { // Ширина по X, глубина по Z
            cabinetMin = new THREE.Vector3(
                position.x - width / 2,
                position.y - height / 2,
                position.z - depth / 2
            );
            cabinetMax = new THREE.Vector3(
                position.x + width / 2,
                position.y + height / 2,
                position.z + depth / 2
            );
        } else if (rotationY === THREE.MathUtils.degToRad(90) || rotationY === THREE.MathUtils.degToRad(-90)) { // Ширина по Z, глубина по X
            cabinetMin = new THREE.Vector3(
                position.x - depth / 2,
                position.y - height / 2,
                position.z - width / 2
            );
            cabinetMax = new THREE.Vector3(
                position.x + depth / 2,
                position.y + height / 2,
                position.z + width / 2
            );
        }
    } else {
        if (rotationY === 0) { // "Back" стена: X - ширина, Y - высота, Z - глубина
            cabinetMin = new THREE.Vector3(
                position.x - width / 2,
                position.y - height / 2,
                position.z - depth / 2
            );
            cabinetMax = new THREE.Vector3(
                position.x + width / 2,
                position.y + height / 2,
                position.z + depth / 2
            );
        } else if (rotationY === THREE.MathUtils.degToRad(90)) { // "Left" стена: Z - ширина, Y - высота, X - глубина
            cabinetMin = new THREE.Vector3(
                position.x - depth / 2,
                position.y - height / 2,
                position.z - width / 2
            );
            cabinetMax = new THREE.Vector3(
                position.x + depth / 2,
                position.y + height / 2,
                position.z + width / 2
            );
        } else if (rotationY === THREE.MathUtils.degToRad(-90)) { // "Right" стена: Z - ширина, Y - высота, X - глубина
            cabinetMin = new THREE.Vector3(
                position.x - depth / 2,
                position.y - height / 2,
                position.z - width / 2
            );
            cabinetMax = new THREE.Vector3(
                position.x + depth / 2,
                position.y + height / 2,
                position.z + width / 2
            );
        }
    }

    let hasIntersection = false;

    const halfLength = currentLength / 2;
    const halfWidth = currentWidth / 2;
    const halfHeight = currentHeight / 2;

    if (cabinetMin.x < -halfLength || cabinetMax.x > halfLength ||
        cabinetMin.y < -halfWidth || cabinetMax.y > halfWidth ||
        cabinetMin.z < -halfHeight || cabinetMax.z > halfHeight) {
        hasIntersection = true;
    }

    const intersectionThreshold = 0.0002; // 0.2 мм

    for (const window of windows) {
        window.mesh.updateMatrixWorld();
        const windowPosition = window.mesh.position.clone();
        const windowWidth = window.mesh.geometry.parameters.width;
        const windowHeight = window.mesh.geometry.parameters.height;
        const windowDepth = window.mesh.geometry.parameters.depth;
        const windowRotationY = window.mesh.rotation.y;

        let windowMin, windowMax;
        if (windowRotationY === 0) {
            windowMin = new THREE.Vector3(
                windowPosition.x - windowWidth / 2,
                windowPosition.y - windowHeight / 2,
                windowPosition.z - windowDepth / 2
            );
            windowMax = new THREE.Vector3(
                windowPosition.x + windowWidth / 2,
                windowPosition.y + windowHeight / 2,
                windowPosition.z + windowDepth / 2
            );
        } else if (windowRotationY === THREE.MathUtils.degToRad(90)) {
            windowMin = new THREE.Vector3(
                windowPosition.x - windowDepth / 2,
                windowPosition.y - windowHeight / 2,
                windowPosition.z - windowWidth / 2
            );
            windowMax = new THREE.Vector3(
                windowPosition.x + windowDepth / 2,
                windowPosition.y + windowHeight / 2,
                windowPosition.z + windowWidth / 2
            );
        } else if (windowRotationY === THREE.MathUtils.degToRad(-90)) {
            windowMin = new THREE.Vector3(
                windowPosition.x - windowDepth / 2,
                windowPosition.y - windowHeight / 2,
                windowPosition.z - windowWidth / 2
            );
            windowMax = new THREE.Vector3(
                windowPosition.x + windowDepth / 2,
                windowPosition.y + windowHeight / 2,
                windowPosition.z + windowWidth / 2
            );
        }

        if (cabinetMax.x > windowMin.x + intersectionThreshold && cabinetMin.x < windowMax.x - intersectionThreshold &&
            cabinetMax.y > windowMin.y + intersectionThreshold && cabinetMin.y < windowMax.y - intersectionThreshold &&
            cabinetMax.z > windowMin.z + intersectionThreshold && cabinetMin.z < windowMax.z - intersectionThreshold) {
            hasIntersection = true;
            break;
        }
    }

    for (const otherCabinet of cabinets) {
        if (otherCabinet !== cabinet) {
            otherCabinet.mesh.updateMatrixWorld();
            const otherPosition = otherCabinet.mesh.position.clone();
            const otherWidth = otherCabinet.width;
            const otherHeight = otherCabinet.height;
            const otherDepth = otherCabinet.depth;
            const otherRotationY = otherCabinet.mesh.rotation.y;

            let otherMin, otherMax;
            if (otherRotationY === 0 || otherRotationY === THREE.MathUtils.degToRad(180)) {
                otherMin = new THREE.Vector3(
                    otherPosition.x - otherWidth / 2,
                    otherPosition.y - otherHeight / 2,
                    otherPosition.z - otherDepth / 2
                );
                otherMax = new THREE.Vector3(
                    otherPosition.x + otherWidth / 2,
                    otherPosition.y + otherHeight / 2,
                    otherPosition.z + otherDepth / 2
                );
            } else if (otherRotationY === THREE.MathUtils.degToRad(90)) {
                otherMin = new THREE.Vector3(
                    otherPosition.x - otherDepth / 2,
                    otherPosition.y - otherHeight / 2,
                    otherPosition.z - otherWidth / 2
                );
                otherMax = new THREE.Vector3(
                    otherPosition.x + otherDepth / 2,
                    otherPosition.y + otherHeight / 2,
                    otherPosition.z + otherWidth / 2
                );
            } else if (otherRotationY === THREE.MathUtils.degToRad(-90)) {
                otherMin = new THREE.Vector3(
                    otherPosition.x - otherDepth / 2,
                    otherPosition.y - otherHeight / 2,
                    otherPosition.z - otherWidth / 2
                );
                otherMax = new THREE.Vector3(
                    otherPosition.x + otherDepth / 2,
                    otherPosition.y + otherHeight / 2,
                    otherPosition.z + otherWidth / 2
                );
            }

            if (cabinetMax.x > otherMin.x + intersectionThreshold && cabinetMin.x < otherMax.x - intersectionThreshold &&
                cabinetMax.y > otherMin.y + intersectionThreshold && cabinetMin.y < otherMax.y - intersectionThreshold &&
                cabinetMax.z > otherMin.z + intersectionThreshold && cabinetMin.z < otherMax.z - intersectionThreshold) {
                hasIntersection = true;
                break;
            }
        }
    }

    return hasIntersection;
}

let draggedCabinet = null;
let dragStartX = 0;
let dragStartY = 0;
let dragStartoffsetAlongWall = 0;
let dragStartOffsetX = 0; // Для X-позиции
let dragStartOffsetZ = 0; // Для Z-позиции
let justDragged = false;

let isCloningMode = false;
let groupDragObjects = []; // Сюда добавим столешницу и шкаф, если они выбраны вместе

/**
 * Начинает процесс перетаскивания шкафа (простого или детализированного).
 * @param {object} cabinet - Объект данных шкафа (свойство mesh может быть Mesh или Group).
 * @param {MouseEvent} event - Событие mousedown.
 * @param {boolean} wasSelected - Был ли шкаф выделен до начала перетаскивания.
 */
function startDraggingCabinet(cabinet, event, wasSelected) {
    //console.log(`Начало перетаскивания для cabinet UUID: ${cabinet.mesh?.uuid}. Был выделен: ${wasSelected}`); // Добавлен лог

    // Проверяем, передан ли корректный объект шкафа
    if (!cabinet || !cabinet.mesh) {
        console.error("startDraggingCabinet: Передан некорректный объект шкафа.", cabinet);
        return;
    }

    draggedCabinet = cabinet; // Устанавливаем глобальную переменную
    groupDragObjects = [];    // Очищаем группу перетаскиваемых объектов

    // --- Логика для группировки со столешницами (для freestanding) ---
    if (cabinet.type === 'freestandingCabinet') {
        const cabinetMesh = cabinet.mesh;
        console.log('Проверка привязанных столешниц для:', cabinetMesh.uuid);

        // Ищем столешницы, которые выделены ВМЕСТЕ С ЭТИМ ШКАФОМ
        // и находятся "над" ним (wallId === 'Bottom')
        const attachedCountertops = selectedCabinets.filter(obj =>
            obj !== cabinet && // Не сам шкаф
            obj.userData?.type === 'countertop' &&
            obj.userData?.wallId === 'Bottom' // Столешница для свободно стоящего
            // Можно добавить проверку близости по X/Z, если нужно
        );

        console.log(`Найдено привязанных столешниц: ${attachedCountertops.length}`);

        // Сохраняем относительные смещения ТОЛЬКО для найденных привязанных столешниц
        attachedCountertops.forEach(ct => {
            ct.userData.relativeOffsetX = ct.position.x - cabinetMesh.position.x;
            ct.userData.relativeOffsetZ = ct.position.z - cabinetMesh.position.z;
             console.log(` - Столешница ${ct.uuid}: отн. смещение X=${ct.userData.relativeOffsetX.toFixed(3)}, Z=${ct.userData.relativeOffsetZ.toFixed(3)}`);
        });

        // Добавляем в группу перетаскивания шкаф и найденные столешницы
        groupDragObjects = [cabinet, ...attachedCountertops];

    } else {
        // Для шкафов у стены перетаскиваем только сам шкаф
        groupDragObjects = [cabinet];
    }
    //console.log(`Объектов в группе перетаскивания (groupDragObjects): ${groupDragObjects.length}`);

    // --- Сохраняем флаг 'wasSelected' в userData перетаскиваемого объекта ---
    // Убедимся, что userData существует
    if (!draggedCabinet.mesh.userData) {
        draggedCabinet.mesh.userData = {};
    }
    draggedCabinet.mesh.userData.wasSelectedBeforeDrag = wasSelected;
    //console.log(` - Установлен флаг wasSelectedBeforeDrag: ${wasSelected}`);

    // --- Проверяем режим клонирования ---
    isCloningMode = event.shiftKey;
    //console.log(` - Режим клонирования (Shift): ${isCloningMode}`);

    // --- Сохраняем начальные координаты мыши и смещения шкафа ---
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    // Используем ?? для безопасного получения смещений (если их нет, будет 0)
    dragStartoffsetAlongWall = cabinet.offsetAlongWall ?? 0; // Для стенных
    dragStartOffsetX = cabinet.offsetX ?? 0; // Для FS
    dragStartOffsetZ = cabinet.offsetZ ?? 0; // Для FS
    //console.log(` - Начальные координаты мыши: X=${dragStartX}, Y=${dragStartY}`);
    //console.log(` - Начальные смещения: alongWall=${dragStartoffsetAlongWall.toFixed(3)}, offsetX=${dragStartOffsetX.toFixed(3)}, offsetZ=${dragStartOffsetZ.toFixed(3)}`);

    // --- Вывод координат для отладки ---
    //console.log('--- Позиции при старте перетаскивания ---');
    groupDragObjects.forEach((obj, index) => {
         const mesh = obj.mesh || obj; // Получаем mesh (для шкафа или столешницы)
         const type = obj.type || obj.userData?.type; // Получаем тип
         //console.log(`  Объект ${index} (Тип: ${type}, UUID: ${mesh.uuid}):`);
         //console.log(`    position.x: ${mesh.position.x.toFixed(3)}`);
         //console.log(`    position.y: ${mesh.position.y.toFixed(3)}`);
         //console.log(`    position.z: ${mesh.position.z.toFixed(3)}`);
         if (type === 'countertop') {
             //console.log(`    relativeOffset: X=${obj.userData.relativeOffsetX?.toFixed(3)}, Z=${obj.userData.relativeOffsetZ?.toFixed(3)}`);
         } else { // Шкаф
             //console.log(`    offset: alongWall=${obj.offsetAlongWall?.toFixed(3)}, X=${obj.offsetX?.toFixed(3)}, Z=${obj.offsetZ?.toFixed(3)}`);
         }
    });
    //console.log('---------------------------------------');


    // --- Добавляем слушатели для движения и отпускания мыши ---
    // Удаляем старые на всякий случай, чтобы не было дублей
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    // Добавляем новые
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    //console.log(" - Слушатели mousemove и mouseup добавлены к document.");

    // --- Устанавливаем стиль курсора ---
    document.body.style.cursor = 'grabbing';
}

let isDraggingForSave = false; // Глобальный флаг для отслеживания начала перетаскивания

function onMouseMove(event) {
    if (!draggedCabinet) return;

    // --- Initial setup on first move ---
    if (!isDraggingForSave) {
        const cabinetIndex = cabinets.indexOf(draggedCabinet);
        saveState("moveCabinet", {}); // Save initial state

        isDraggingForSave = true;

        // Remove highlight from all and highlight only the dragged item
        const allHighlightableData = [...cabinets, ...windows, ...countertops];
        allHighlightableData.forEach(itemData => removeHighlight(itemData.mesh || itemData));
        selectedCabinets = [];
        applyHighlight(draggedCabinet.mesh);
    }

    // --- Raycasting to find ground position ---
    const rect = renderer.domElement.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), activeCamera);
    const intersects = raycaster.intersectObject(cube, false);

    if (intersects.length > 0) {
        const intersectPoint = intersects[0].point.clone().applyMatrix4(cube.matrixWorld.clone().invert());

        if (draggedCabinet.type === 'freestandingCabinet') {
            const targetX = intersectPoint.x;
            const targetZ = intersectPoint.z;
            const step = 0.001;
            const rotationY = draggedCabinet.mesh.rotation.y;
        
            const halfWidthX = (rotationY === 0 || rotationY === Math.PI) ? draggedCabinet.width / 2 : draggedCabinet.depth / 2;
            const halfDepthZ = (rotationY === 0 || rotationY === Math.PI) ? draggedCabinet.depth / 2 : draggedCabinet.width / 2;
        
            const boundedTargetX = Math.max(-currentLength / 2 + halfWidthX, Math.min(currentLength / 2 - halfWidthX, targetX));
            const boundedTargetZ = Math.max(-currentHeight / 2 + halfDepthZ, Math.min(currentHeight / 2 - halfDepthZ, targetZ));
        
            const deltaX = boundedTargetX - draggedCabinet.mesh.position.x;
            const deltaZ = boundedTargetZ - draggedCabinet.mesh.position.z;
            const stepsX = Math.round(deltaX / step);
            const stepsZ = Math.round(deltaZ / step);
            const directionX = deltaX > 0 ? step : -step;
            const directionZ = deltaZ > 0 ? step : -step;
        
            let lastValidX = Math.round(draggedCabinet.mesh.position.x * 1000) / 1000;
            for (let i = 0; i < Math.abs(stepsX); i++) {
                const testX = Math.round((draggedCabinet.mesh.position.x + directionX) * 1000) / 1000;
                draggedCabinet.mesh.position.x = Math.round(boundedTargetX * 1000) / 1000;
                if (!checkCabinetIntersections(draggedCabinet)) {
                    break;
                }
                draggedCabinet.mesh.position.x = testX;
                if (checkCabinetIntersections(draggedCabinet)) {
                    draggedCabinet.mesh.position.x = lastValidX;
                    break;
                }
                lastValidX = testX;
            }
        
            let lastValidZ = Math.round(draggedCabinet.mesh.position.z * 1000) / 1000;
            for (let i = 0; i < Math.abs(stepsZ); i++) {
                const testZ = Math.round((draggedCabinet.mesh.position.z + directionZ) * 1000) / 1000;
                draggedCabinet.mesh.position.z = Math.round(boundedTargetZ * 1000) / 1000;
                if (!checkCabinetIntersections(draggedCabinet)) {
                    break;
                }
                draggedCabinet.mesh.position.z = testZ;
                if (checkCabinetIntersections(draggedCabinet)) {
                    draggedCabinet.mesh.position.z = lastValidZ;
                    break;
                }
                lastValidZ = testZ;
            }
        
            // --- Обновляем смещение draggedCabinet ---
            if (rotationY === 0 || rotationY === Math.PI) {
                draggedCabinet.offsetX = draggedCabinet.mesh.position.x + currentLength / 2 - draggedCabinet.width / 2;
                draggedCabinet.offsetZ = draggedCabinet.mesh.position.z + currentHeight / 2 - draggedCabinet.depth / 2;
            } else {
                draggedCabinet.offsetX = draggedCabinet.mesh.position.x + currentLength / 2 - draggedCabinet.depth / 2;
                draggedCabinet.offsetZ = draggedCabinet.mesh.position.z + currentHeight / 2 - draggedCabinet.width / 2;
            }
        
            // --- NEW: Двигаем все привязанные объекты из группы (шкафы + столешницы) ---
            groupDragObjects.forEach(obj => {
                if (!obj || obj === draggedCabinet) return;

                const mesh = obj.mesh || obj;

                // Устанавливаем позицию столешницы с учётом относительного смещения
                if (obj.userData?.type === 'countertop') {
                    mesh.position.x = draggedCabinet.mesh.position.x + (obj.userData.relativeOffsetX || 0);
                    mesh.position.z = draggedCabinet.mesh.position.z + (obj.userData.relativeOffsetZ || 0);
                    console.log(`Moving countertop to: x=${mesh.position.x.toFixed(3)}, z=${mesh.position.z.toFixed(3)}`);
                    obj.userData.offsetX = draggedCabinet.offsetX + (obj.userData.relativeOffsetX || 0);
                    obj.userData.offsetZ = draggedCabinet.offsetZ + (obj.userData.relativeOffsetZ || 0);
                } else if (obj.mesh) {
                    // Для других шкафов (если будут)
                    mesh.position.x += deltaMovedX;
                    mesh.position.z += deltaMovedZ;
                    obj.offsetX = (obj.offsetX || 0) + deltaMovedX;
                    obj.offsetZ = (obj.offsetZ || 0) + deltaMovedZ;
                }
            });
        
            // --- NEW: Перемещаем выделенные столешницы (если они wallId === "bottom") ---
            /*selectedCabinets.forEach(item => {
                if (item !== draggedCabinet && item.userData?.type === 'countertop' && item.wallId === 'bottom') {
                    item.position.x += deltaMovedX;
                    item.position.z += deltaMovedZ;
                    item.userData.offsetX = (item.userData.offsetX || 0) + deltaMovedX;
                    item.userData.offsetZ = (item.userData.offsetZ || 0) + deltaMovedZ;
                }
            });*/
        
            // --- Обновляем dragStartOffsetX/Z для следующего кадра ---
            dragStartOffsetX = draggedCabinet.mesh.position.x;
            dragStartOffsetZ = draggedCabinet.mesh.position.z;
        }
        

        // --- Если это не freestanding, логика не изменилась ---
        else {
            let newoffsetAlongWall;
            switch (draggedCabinet.wallId) {
                case "Back":
                    newoffsetAlongWall = intersectPoint.x + currentLength / 2 - draggedCabinet.width / 2;
                    break;
                case "Left":
                case "Right":
                    newoffsetAlongWall = intersectPoint.z + currentHeight / 2 - draggedCabinet.width / 2;
                    break;
            }

            const delta = newoffsetAlongWall - dragStartoffsetAlongWall;
            const step = 0.001;
            const steps = Math.round(delta / step);
            newoffsetAlongWall = dragStartoffsetAlongWall + steps * step;

            let wallWidth;
            switch (draggedCabinet.wallId) {
                case "Back":
                    wallWidth = currentLength;
                    break;
                case "Left":
                case "Right":
                    wallWidth = currentHeight;
                    break;
            }

            if (newoffsetAlongWall < 0) newoffsetAlongWall = 0;
            if (newoffsetAlongWall + draggedCabinet.width > wallWidth) newoffsetAlongWall = wallWidth - draggedCabinet.width;

            const originaloffsetAlongWall = Math.round(draggedCabinet.offsetAlongWall * 1000) / 1000;
            draggedCabinet.offsetAlongWall = Math.round(newoffsetAlongWall * 1000) / 1000;
            updateCabinetPosition(draggedCabinet);

            if (checkCabinetIntersections(draggedCabinet)) {
                const direction = newoffsetAlongWall > originaloffsetAlongWall ? -step : step;
                while (checkCabinetIntersections(draggedCabinet)) {
                    draggedCabinet.offsetAlongWall += direction;
                    updateCabinetPosition(draggedCabinet);
                    if (draggedCabinet.offsetAlongWall <= 0 || draggedCabinet.offsetAlongWall + draggedCabinet.width >= wallWidth) break;
                }
            }
        }
        // --- НАЧАЛО ИЗМЕНЕНИЯ: Обновляем позицию полей ввода ---
        // Выполняем ПОСЛЕ всей логики перемещения
        if (draggedCabinet) {
            // Вызываем функцию обновления позиций для НЕ детализированного шкафа
            // Эта функция должна уметь работать и с freestanding, и со стенными
            updateDimensionsInputPosition(draggedCabinet, cabinets);
            // console.log("Позиция полей ввода обновлена."); // Можно раскомментировать для отладки
        }
        // --- КОНЕЦ ИЗМЕНЕНИЯ ---
    }
}
 // End onMouseMove

// В script.js

function onMouseUp(event) {
    //console.log(`--- onMouseUp Сработало ---`); // Лог 1: Проверка вызова
    //console.log(`Перед проверкой: draggedCabinet существует? ${!!draggedCabinet}`); // Лог 2: Состояние до проверки

    // 1. Проверяем, было ли вообще что-то перетаскиваемо
    if (!draggedCabinet) {
        //console.log("onMouseUp: Нечего отпускать, выход.");
        // На всякий случай, если слушатели "зависли"
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        if (document.body.style.cursor === 'grabbing') { // Сбрасываем курсор, если он остался
            document.body.style.cursor = 'default';
        }
        return;
    }

    // 2. Сохраняем необходимые данные ЛОКАЛЬНО перед сбросом глобальных переменных
    const cabinet = draggedCabinet; // Локальная ссылка на объект данных
    const wasSelected = cabinet.mesh?.userData?.wasSelectedBeforeDrag; // Получаем флаг
    const cabinetUUID = cabinet.mesh?.uuid; // Для логирования

    //console.log(`onMouseUp: Обработка для UUID: ${cabinetUUID}. Был выделен: ${wasSelected}`); // Лог 3: Какой объект обрабатываем

    // 3. НЕМЕДЛЕННО Сбрасываем ГЛОБАЛЬНОЕ состояние перетаскивания
    draggedCabinet = null; // <--- КРИТИЧЕСКИ ВАЖНО
    groupDragObjects = [];
    isCloningMode = false;
    isDraggingForSave = false;

    // 4. НЕМЕДЛЕННО Удаляем слушатели событий
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp); // Удаляем СЕБЯ ЖЕ

    // 5. НЕМЕДЛЕННО Восстанавливаем курсор
    document.body.style.cursor = 'default';

    //console.log(`onMouseUp: Состояние сброшено, слушатели удалены для UUID: ${cabinetUUID}`); // Лог 4: Подтверждение сброса

    // 6. Устанавливаем флаг "только что перетащили", чтобы click не сработал сразу
    justDragged = true;
    setTimeout(() => {
        justDragged = false;
        //console.log("justDragged флаг сброшен."); // Лог 5: Сброс флага
    }, 50); // Небольшая задержка

    // 7. Теперь БЕЗОПАСНО выполняем остальную логику (проверка пересечений, выделение)
    // Используем локальную переменную 'cabinet'
    try { // Оборачиваем в try...catch на случай ошибок в этой логике
        if (!cabinet || !cabinet.mesh) {
             console.error("onMouseUp: Локальная переменная 'cabinet' или 'cabinet.mesh' невалидна после сброса!");
             return;
        }

        const hasIntersection = checkCabinetIntersections(cabinet);

        // Применяем цвет пересечения ТОЛЬКО для простого куба
        if (!cabinet.isDetailed && cabinet.mesh.material) {
            cabinet.mesh.material.color.set(hasIntersection ? 0xff0000 : cabinet.initialColor);
            cabinet.mesh.material.needsUpdate = true;
             //console.log(`onMouseUp: Установлен цвет пересечения/норм для простого куба UUID: ${cabinetUUID}`);
        } else if (cabinet.isDetailed && hasIntersection) {
             console.warn(`Детализированный шкаф ${cabinetUUID} пересекается после перетаскивания!`);
        }

        // Логика восстановления/установки выделения
        if (wasSelected) {
            //console.log(`onMouseUp: Восстановление выделения для UUID: ${cabinetUUID}`);
            // Убедимся, что объект все еще в массиве (на случай асинхронных удалений?)
            if (cabinets.some(c => c.mesh === cabinet.mesh)) {
                selectedCabinets = [cabinet]; // Восстанавливаем выделение
                selectedCabinet = cabinet;
                applyHighlight(cabinet.mesh); // Подсвечиваем

                // Показываем инпуты размеров ТОЛЬКО для НЕ детализированных
                if (!cabinet.isDetailed) {
                    // console.log(`onMouseUp: Показ инпутов для НЕ детализированного UUID: ${cabinetUUID}`);
                    if (cabinet.type === 'freestandingCabinet') {
                        showFreestandingCabinetDimensions(cabinet, cabinets);
                    } else if (['lowerCabinet', 'upperCabinet'].includes(cabinet.type)) {
                        showCabinetDimensionsInput(cabinet, cabinets);
                    }
                } else {
                    //console.log(`onMouseUp: Инпуты НЕ показываются для ДЕТАЛИЗИРОВАННОГО UUID: ${cabinetUUID}`);
                }
            } else {
                //console.warn(`onMouseUp: Шкаф UUID ${cabinetUUID} был выделен, но не найден в массиве cabinets?`);
                selectedCabinets = [];
                selectedCabinet = null;
            }
        } else {
            //console.log(`onMouseUp: Шкаф UUID ${cabinetUUID} не был выделен, убираем подсветку.`);
            removeHighlight(cabinet.mesh); // Убираем подсветку (на случай, если она была добавлена во время drag)
             // Если вдруг он оказался выделен - снимаем выделение
             if (selectedCabinets.some(c => c.mesh === cabinet.mesh)) {
                 selectedCabinets = [];
                 selectedCabinet = null;
             }
        }

    } catch (error) {
        console.error(`Ошибка в post-drag логике onMouseUp для UUID ${cabinetUUID}:`, error);
    }

    //console.log(`--- onMouseUp Завершено для UUID: ${cabinetUUID} ---`); // Лог 6: Конец выполнения
}

/**
 * Создает клон объекта данных шкафа, включая новый меш и ребра.
 * Копирует общие и специфичные для типа свойства.
 * @param {object} original - Оригинальный объект данных шкафа.
 * @returns {object | null} Новый объект данных клонированного шкафа или null в случае ошибки.
 */
function cloneCabinet(original) {
    // Проверка на наличие необходимых данных в оригинале
    // Добавь сюда проверку на ВСЕ свойства, которые критичны для создания меша
    if (!original || !original.mesh || !original.type || typeof original.width !== 'number' || typeof original.height !== 'number' || typeof original.depth !== 'number') {
        console.error("Cannot clone cabinet: Original object is missing essential properties (mesh, type, width, height, depth).", original);
        return null;
    }

    // 1. Создаем новую геометрию, материал, меш, ребра
    try {
        const geometry = new THREE.BoxGeometry(original.width, original.height, original.depth);
        // Используем MeshStandardMaterial - он лучше работает со светом и emissive
        const material = new THREE.MeshStandardMaterial({
             color: original.initialColor || '#c0c0c0' // Цвет по умолчанию - серый
        });
        const mesh = new THREE.Mesh(geometry, material);

        const edgesGeometry = new THREE.EdgesGeometry(geometry);
        const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
        const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
        edges.raycast = () => {}; // Ребра не участвуют в raycast
        mesh.add(edges); // Добавляем ребра к мешу

        // Копируем позицию и вращение меша из оригинала
        mesh.position.copy(original.mesh.position);
        mesh.rotation.copy(original.mesh.rotation);

        // 2. Создаем базовый объект клона с ОБЩИМИ свойствами
        const clone = {
            mesh: mesh,
            edges: edges,
            type: original.type,
            width: original.width,
            height: original.height,
            depth: original.depth, // <--- КОПИРУЕТСЯ
            initialColor: original.initialColor,
            // Используем ?? для установки значения по умолчанию, если в оригинале его нет
            facadeThickness: original.facadeThickness ?? 0.018, // Пример по умолчанию 18мм <--- КОПИРУЕТСЯ (с дефолтом)
            facadeGap: original.facadeGap ?? 0.003,
            cabinetType: original.cabinetType ?? 'straight',
            cabinetConfig: original.cabinetConfig ?? 'swing',
            isHeightIndependent: original.isHeightIndependent ?? false, // Пример дефолта
            isHeightEditable: original.isHeightEditable ?? false, // Пример дефолта
            facadeSet: original.facadeSet, // <-- Копируем ID набора фасадов
            textureDirection: original.textureDirection || 'vertical', // Копируем или ставим 'vertical' по умолчанию
            isDetailed: original.isDetailed
        };

        // 3. Добавляем СПЕЦИФИЧНЫЕ для типа свойства
        switch (original.type) {
            case 'lowerCabinet':
                clone.wallId = original.wallId;
                clone.offsetAlongWall = original.offsetAlongWall;
                clone.offsetBottom = original.offsetBottom;
                clone.offsetFromParentWall = original.offsetFromParentWall;
                clone.overhang = original.overhang ?? 0.02; // Пример по умолчанию 20мм <--- КОПИРУЕТСЯ (с дефолтом)
                // Копируем все остальные детальные конфиги, используя ?? для дефолтов
                clone.dishwasherWidth = original.dishwasherWidth ?? '600';
                clone.doorType = original.doorType ?? 'double';
                clone.shelfType = original.shelfType ?? 'none';
                clone.shelfCount = original.shelfCount ?? 0;
                clone.facadeCount = original.facadeCount ?? '2';
                clone.drawerSet = original.drawerSet ?? 'D+D';
                clone.ovenHeight = original.ovenHeight ?? '600';
                clone.ovenPosition = original.ovenPosition ?? 'top';
                clone.extraOffset = original.extraOffset ?? 0;
                clone.ovenType = original.ovenType ?? '600';
                clone.ovenLevel = original.ovenLevel ?? 'drawer';
                clone.microwaveType = original.microwaveType ?? '380';
                clone.underOvenFill = original.underOvenFill ?? 'drawers';
                clone.topShelves = original.topShelves ?? '2';
                clone.fridgeType = original.fridgeType ?? 'double';
                clone.shelvesAbove = original.shelvesAbove ?? '1';
                clone.visibleSide = original.visibleSide ?? 'none';
                clone.doorOpening = original.doorOpening ?? 'left';
                clone.verticalProfile = original.verticalProfile ?? 'none';
                clone.rearStretcher = original.rearStretcher ?? 'horizontal';
                clone.frontStretcher = original.frontStretcher ?? 'horizontal';
                clone.rearPanel = original.rearPanel ?? 'yes';
                //clone.falsePanels = original.falsePanels ?? 'none';
                clone.stretcherDrop = original.stretcherDrop ?? 0;
                clone.facadeSet = original.facadeSet ?? 'set1';
                clone.highDividerDepth = original.highDividerDepth ?? 560;
                break;

            case 'upperCabinet':
                clone.wallId = original.wallId;
                clone.offsetAlongWall = original.offsetAlongWall;
                clone.offsetBottom = original.offsetBottom;
                clone.offsetFromParentWall = original.offsetFromParentWall;
                clone.isMezzanine = original.isMezzanine; // Специфично для верхних
                // У верхних в твоем списке не было overhang. Если он нужен - добавь.
                break;

            case 'freestandingCabinet':
                clone.wallId = 'Bottom'; // У них всегда 'Bottom'
                clone.offsetX = original.offsetX;
                clone.offsetZ = original.offsetZ;
                clone.offsetBottom = original.offsetBottom;
                clone.overhang = original.overhang ?? 0.02; // <--- КОПИРУЕТСЯ (с дефолтом)
                clone.frontMarker = original.frontMarker; // Маркер переда
                break;

            default:
                console.warn("Cloning unknown cabinet type:", original.type);
                // Можно скопировать оставшиеся свойства из оригинала, если это безопасно
                Object.keys(original).forEach(key => {
                     if (!(key in clone) && key !== 'mesh' && key !== 'edges') {
                         clone[key] = original[key];
                     }
                 });
                break;
        }

        // 4. Копируем/очищаем userData меша
        clone.mesh.userData = {}; // Начинаем с чистого объекта
        if (original.mesh.userData) {
             // Копируем только "постоянные" данные, если они есть в userData меша оригинала
             // Например: clone.mesh.userData.somePersistentID = original.mesh.userData.somePersistentID;
        }
        // Временные флаги подсветки/перетаскивания не копируем

        console.log("Cabinet cloned:", clone);
        return clone;

    } catch (error) {
        console.error("Error during cabinet cloning:", error, "Original object:", original);
        return null; // Возвращаем null в случае ошибки
    }
}


// Обработчик правой кнопки для открытия меню (версия для Emissive / selectedCabinets)
renderer.domElement.addEventListener('contextmenu', (event) => {
    event.preventDefault(); // Отменяем стандартное меню браузера

    // --- Проверяем: выделен ли один объект
    if (selectedCabinets.length !== 1) {
        // Не выделено или выделено больше одного — ничего не делаем
        hideWindowMenu(); hideSocketMenu(); hideCabinetMenu(); hideCountertopMenu();
        return;
    }

    const selectedItem = selectedCabinets[0]; // Единственный выделенный объект
    let itemType = null;
    let menuFunction = null;
    let dataObject = selectedItem;

    // Определяем тип объекта и нужное меню
    if (selectedItem.isMesh && selectedItem.userData?.type === 'countertop') {
        itemType = 'countertop';
        menuFunction = showCountertopMenu;
    } else if (['lowerCabinet', 'upperCabinet', 'freestandingCabinet'].includes(selectedItem.type)) {
        itemType = 'cabinet';
        menuFunction = showCabinetMenu;
    } else if (['window', 'door', 'opening', 'socket', 'radiator', 'column', 'apron'].includes(selectedItem.type)) {
        if (selectedItem.type === 'socket') {
            itemType = 'socket';
            menuFunction = showSocketMenu;
        } else {
            itemType = 'window';
            menuFunction = showWindowMenu;

            // Если это группа окон/дверей, берем "ведущий" элемент
            const groupId = selectedItem.groupId;
            dataObject = groupId
                ? (windows.find(w => w.groupId === groupId && w.doorIndex === 0) || selectedItem)
                : selectedItem;
        }
    } else {
        // Неизвестный тип — ничего не показываем
        hideWindowMenu(); hideSocketMenu(); hideCabinetMenu(); hideCountertopMenu();
        return;
    }

    // --- Показываем нужное меню
    if (menuFunction) {
        hideWindowMenu(); hideSocketMenu(); hideCabinetMenu(); hideCountertopMenu();
        menuFunction(event.clientX, event.clientY, dataObject);
    }
});


function updateCabinetPosition(cabinet) {
    if (!cabinet || !cabinet.mesh) { return; }

    // --- Определяем отступ от родительской стены ---
    let actualOffsetFromParentWall = 0;
    if (cabinet.type === 'lowerCabinet' && cabinet.wallId !== 'Bottom') {
        actualOffsetFromParentWall = cabinet.offsetFromParentWall;
    } else if (cabinet.type === 'upperCabinet') {
        actualOffsetFromParentWall = cabinet.offsetFromParentWall || (20 / 1000); // Используем wallOffset или дефолт 20мм
    } else if (cabinet.type !== 'freestandingCabinet') { // Для других объектов у стены (окна и т.д.)
        actualOffsetFromParentWall = cabinet.offsetFromParentWall || 0;
    }

    switch (cabinet.wallId) {
        case "Back":
            cabinet.mesh.position.set(
                -currentLength / 2 + cabinet.offsetAlongWall + cabinet.width / 2,
                -currentWidth / 2 + cabinet.offsetBottom + cabinet.height / 2,
                -currentHeight / 2 + actualOffsetFromParentWall + cabinet.depth / 2
            );
            cabinet.mesh.rotation.y = 0;
            break;
        case "Left":
            cabinet.mesh.position.set(
                -currentLength / 2 + actualOffsetFromParentWall + cabinet.depth / 2,
                -currentWidth / 2 + cabinet.offsetBottom + cabinet.height / 2,
                -currentHeight / 2 + cabinet.offsetAlongWall + cabinet.width / 2
            );
            cabinet.mesh.rotation.y = THREE.MathUtils.degToRad(90);
            break;
        case "Right":
            cabinet.mesh.position.set(
                currentLength / 2 - actualOffsetFromParentWall - cabinet.depth / 2,
                -currentWidth / 2 + cabinet.offsetBottom + cabinet.height / 2,
                -currentHeight / 2 + cabinet.offsetAlongWall + cabinet.width / 2
            );
            cabinet.mesh.rotation.y = THREE.MathUtils.degToRad(-90);
            break;
        case "Bottom":
            const rotationY = THREE.MathUtils.radToDeg(cabinet.mesh.rotation.y) % 360;
            let cabinetX, cabinetZ;
            if (rotationY === 0) { // Back
                cabinetX = -currentLength / 2 + cabinet.offsetX + cabinet.width / 2;
                cabinetZ = -currentHeight / 2 + cabinet.offsetZ + cabinet.depth / 2;
            } else if (rotationY === 90 || rotationY === -270) { // Left
                cabinetX = -currentLength / 2 + cabinet.offsetX + cabinet.depth / 2;
                cabinetZ = -currentHeight / 2 + cabinet.offsetZ + cabinet.width / 2;
            } else if (rotationY === -90 || rotationY === 270) { // Right
                cabinetX = -currentLength / 2 + cabinet.offsetX + cabinet.depth / 2;
                cabinetZ = -currentHeight / 2 + cabinet.offsetZ + cabinet.width / 2;
            } else if (rotationY === 180 || rotationY === -180) { // Front
                cabinetX = -currentLength / 2 + cabinet.offsetX + cabinet.width / 2;
                cabinetZ = -currentHeight / 2 + cabinet.offsetZ + cabinet.depth / 2;
            }
            cabinet.mesh.position.set(
                cabinetX,
                -currentWidth / 2 + cabinet.offsetBottom + cabinet.height / 2,
                cabinetZ
            );
            break;  
    }
}

function addFreestandingCabinet(intersectPoint) {
    // --- Блок 1: Сохранение состояния и проверка условий ---
    // Сохраняем текущее состояние и проверяем наличие точки пересечения
    if (!intersectPoint) {
        alert("Пожалуйста, укажите точку на полу для добавления свободно стоящего шкафа.");
        return;
    }
    saveState("addFreestandingCabinet", { intersectPoint: intersectPoint.clone() });

    // --- Блок 2: Подготовка параметров ---
    // Получаем базовые параметры шкафа из objectTypes
    const params = objectTypes['freestandingCabinet'];

    // Используем kitchenGlobalParams для высоты
    const countertopHeight = kitchenGlobalParams.countertopHeight / 1000; // Переводим мм в метры
    const countertopThickness = kitchenGlobalParams.countertopThickness / 1000;
    const plinthHeight = kitchenGlobalParams.plinthHeight / 1000;

    // Устанавливаем размеры и отступы шкафа как у обычных нижних шкафов
    params.defaultHeight = countertopHeight - countertopThickness - plinthHeight;
    params.defaultOffsetBottom = plinthHeight;

    // --- Блок 3: Расчёт позиции относительно intersectPoint ---
    // Преобразуем точку пересечения в локальные координаты комнаты
    const localPoint = intersectPoint.clone().applyMatrix4(cube.matrixWorld.clone().invert());
    const offsetX = localPoint.x + currentLength / 2 - params.defaultWidth / 2; // От левого угла комнаты
    const offsetZ = localPoint.z + currentHeight / 2 - params.defaultDepth / 2; // От ближнего края комнаты

    // --- Блок 4: Создание 3D-объекта ---
    // Создаём геометрию, материал и рёбра шкафа
    const geometry = new THREE.BoxGeometry(params.defaultWidth, params.defaultHeight, params.defaultDepth);
    const material = new THREE.MeshStandardMaterial({ color: params.initialColor });
    const mesh = new THREE.Mesh(geometry, material);

    const edgesGeometry = new THREE.EdgesGeometry(geometry);
    const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edges.raycast = () => {}; // Отключаем raycast для рёбер
    mesh.add(edges);


    // Добавляем маркер передней грани
    const markerSize = Math.min(params.defaultWidth, params.defaultHeight) * 0.3; // 30% от меньшего размера
    const markerGeometry = new THREE.PlaneGeometry(markerSize, markerSize);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide }); // Зелёный для отладки
    const frontMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    frontMarker.position.set(0, 0, params.defaultDepth / 2 + 0.001); // Чуть впереди передней грани (+Z)
    frontMarker.raycast = () => {}; // Отключаем raycast для маркера
    mesh.add(frontMarker);



    // --- Блок 5: Позиционирование шкафа ---
    // Устанавливаем позицию в точке отпускания мыши на полу
    mesh.position.set(
        localPoint.x,
        -currentWidth / 2 + params.defaultOffsetBottom + params.defaultHeight / 2,
        localPoint.z
    );
    mesh.rotation.y = 0; // Ориентация по умолчанию

    // --- Блок 6: Добавление в сцену и создание объекта ---
    // Добавляем шкаф в комнату и сохраняем его в массив cabinets
    scene.add(mesh);
    const obj = {
        mesh: mesh,
        wallId: 'Bottom', // Привязан к полу
        initialColor: '#d2b48c',
        width: params.defaultWidth,
        height: params.defaultHeight,
        depth: params.defaultDepth,
        offsetX: offsetX, // От левого угла комнаты
        offsetZ: offsetZ, // От ближнего края комнаты
        offsetBottom: params.defaultOffsetBottom,
        id_data: THREE.MathUtils.generateUUID(),
        type: 'freestandingCabinet',
        edges: edges,
        overhang: params.overhang,
        facadeThickness: params.facadeThickness,
        isHeightIndependent: true, // Изначально не высокий, зависит от столешницы
        cabinetType: 'straight',
        cabinetConfig: 'swing',
        isDetailed: false, // <--- Add this flag for switch to detailed version
        frontMarker: frontMarker
    };
    cabinets.push(obj);

    // --- Блок 7: Визуальная индикация и вызов меню ---
    // Устанавливаем временный цвет и открываем меню конфигурации
    mesh.material.color.set(0x00ffff);
    edges.material.color.set(0x00ffff);
    mesh.material.needsUpdate = true;
    edges.material.needsUpdate = true;

    const center = new THREE.Vector3();
    mesh.getWorldPosition(center);
    const screenPos = center.project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    const x = (screenPos.x + 1) * rect.width / 2 + rect.left;
    const y = (-screenPos.y + 1) * rect.height / 2 + rect.top;
    showCabinetMenu(x, y, obj);
}

function lightenColor(hexColor, factor) {
    const color = new THREE.Color(hexColor);
    color.r += (1 - color.r) * factor;
    color.g += (1 - color.g) * factor;
    color.b += (1 - color.b) * factor;
    return color.getHex();
}

function orientCabinet(cabinetIndex, wall) {
    const cabinet = cabinets[cabinetIndex];
    if (cabinet.type !== 'freestandingCabinet') return;

    console.log('Orienting cabinet:', cabinetIndex, 'to wall:', wall);
    switch (wall) {
        case 'Back':
            cabinet.mesh.rotation.y = 0; // Лицевая сторона смотрит на Front (ширина вдоль X)
            console.log('Set rotation.y to 0');
            break;
        case 'Left':
            cabinet.mesh.rotation.y = THREE.MathUtils.degToRad(90); // Лицевая сторона смотрит на Right (ширина вдоль Z)
            console.log('Set rotation.y to 90°');
            break;
        case 'Right':
            cabinet.mesh.rotation.y = THREE.MathUtils.degToRad(-90); // Лицевая сторона смотрит на Left (ширина вдоль Z)
            console.log('Set rotation.y to -90°');
            break;
        case 'Front':
            cabinet.mesh.rotation.y = THREE.MathUtils.degToRad(180); // Лицевая сторона смотрит на back (ширина вдоль X)
            console.log('Set rotation.y to 180°');
            break;    
    }

    updateCabinetPosition(cabinet);
    const hasIntersection = checkCabinetIntersections(cabinet);
    cabinet.mesh.material.color.set(hasIntersection ? 0xff0000 : cabinet.initialColor);
    cabinet.edges.material.color.set(0x000000);
    cabinet.mesh.material.needsUpdate = true;
    cabinet.edges.material.needsUpdate = true;
}


function applyCabinetChanges(cabinetIndex) {
    // --- Блок 0: Проверка индекса и получение объекта ---
    if (cabinetIndex < 0 || cabinetIndex >= cabinets.length) {
        console.error("applyCabinetChanges: Неверный индекс шкафа", cabinetIndex);
        if (typeof hideCabinetMenu === 'function') hideCabinetMenu();
        return;
    }
    const cabinet = cabinets[cabinetIndex];
    if (!cabinet || !cabinet.mesh) {
        console.error("applyCabinetChanges: Не найден объект шкафа или его mesh для индекса", cabinetIndex);
        if (typeof hideCabinetMenu === 'function') hideCabinetMenu();
        return;
    }
    console.log(`[applyCabinetChanges] Начало для шкафа ${cabinetIndex}, Текущий тип: ${cabinet.cabinetType}, Конфиг: ${cabinet.cabinetConfig}`);

    // --- Блок 0.1: Сохранение состояния для отмены ---
    // const oldCabinetDataForSave = JSON.parse(JSON.stringify(cabinet));
    // delete oldCabinetDataForSave.mesh; delete oldCabinetDataForSave.edges; delete oldCabinetDataForSave.frontMarker;
    // if (typeof saveState === 'function') saveState("applyCabinetChanges", { cabinetIndex: cabinetIndex, previousData: oldCabinetDataForSave });
    // Если saveState еще глобальная: window.saveState(...)

    // --- Блок 0.2: Получение состояния на момент открытия ЭТОГО меню ---
    // initialMenuData должен быть заполнен в showCabinetMenu
    //const typeWhenMenuOpened = initialMenuData.originalType;
    //const configWhenMenuOpened = initialMenuData.originalConfig;
    //console.log(`[applyCabinetChanges] Состояние при открытии меню: Тип=${typeWhenMenuOpened}, Конфиг=${configWhenMenuOpened}`);

    // --- Блок 0.5: Временное упрощение, если шкаф детализирован ---
    let wasDetailed = false;
    if (cabinet.isDetailed) {
        console.log("[applyCabinetChanges] Шкаф детализирован, временное упрощение...");
        if (typeof toggleCabinetDetail === 'function') toggleCabinetDetail(cabinetIndex);
        wasDetailed = true;
        if (cabinet.isDetailed || !cabinet.mesh || cabinet.mesh.isGroup) {
            console.error("[applyCabinetChanges] Ошибка при временном упрощении!");
            if (typeof hideCabinetMenu === 'function') hideCabinetMenu();
            return;
        }
    }

    // --- Блок 1: Считывание НОВЫХ значений из DOM-элементов текущего меню (cabinetMenu) ---
    const typeWhenMenuOpened = initialMenuData.originalType;
    const configWhenMenuOpened = initialMenuData.originalConfig;
    const cabinetMenuDOM = document.getElementById('cabinetMenu');
    if (!cabinetMenuDOM) { /* ... error ... */ return; }

    let newWidthFromInputMm, newDepthFromInputMm, newHeightFromInputMm, newOverhangFromInputMm, newFacadeGapFromInputMm;
    let newOffsetXFromInputMm, newOffsetZFromInputMm; // Для freestanding
    let newOffsetAlongWallFromInputMm; // Для стенных

    const newCabinetTypeFromDOM = document.getElementById('cabinetType')?.value;
    const newCabinetConfigFromDOM = document.getElementById('cabinetConfig')?.value;

    //console.log(`[applyCabinetChanges] Считано из DOM: Тип=${newCabinetTypeFromDOM}, Конфиг=${newCabinetConfigFromDOM}`);
    const newValuesFromCabinetMenu = {};
    try {
        const widthInput = cabinetMenuDOM.querySelector('#cabinetWidth');
    if (widthInput) { const val = parseFloat(widthInput.value); if (!isNaN(val)) newValuesFromCabinetMenu.width = val / 1000; }
    
    const depthInput = cabinetMenuDOM.querySelector('#cabinetDepth');
    if (depthInput) { const val = parseFloat(depthInput.value); if (!isNaN(val)) newValuesFromCabinetMenu.depth = val / 1000; }

    const heightInput = cabinetMenuDOM.querySelector('#cabinetHeight');
    if (heightInput && !heightInput.disabled) {
        const val = parseFloat(heightInput.value);
        if (!isNaN(val)) newValuesFromCabinetMenu.height = val / 1000;
    }

    const overhangInput = cabinetMenuDOM.querySelector('#cabinetOverhang');
    if (overhangInput) { const val = parseFloat(overhangInput.value); if (!isNaN(val)) newValuesFromCabinetMenu.overhang = val / 1000; }
    
    const facadeGapInput = cabinetMenuDOM.querySelector('#cabinetFacadeGap');
    if (facadeGapInput) { const val = parseFloat(facadeGapInput.value); if (!isNaN(val)) newValuesFromCabinetMenu.facadeGap = val / 1000; }

    newValuesFromCabinetMenu.cabinetType = cabinetMenuDOM.querySelector('#cabinetType').value;
    newValuesFromCabinetMenu.cabinetConfig = cabinetMenuDOM.querySelector('#cabinetConfig').value;

    if (cabinet.type === 'freestandingCabinet') {
        const offsetXVal = parseFloat(cabinetMenuDOM.querySelector('#cabinetOffsetX')?.value);
        if (!isNaN(offsetXVal)) newValuesFromCabinetMenu.offsetX = offsetXVal / 1000;
        const offsetZVal = parseFloat(cabinetMenuDOM.querySelector('#cabinetOffsetZ')?.value);
        if (!isNaN(offsetZVal)) newValuesFromCabinetMenu.offsetZ = offsetZVal / 1000;
        const orientationSelect = cabinetMenuDOM.querySelector('#cabinetOrientation');
        if (orientationSelect) newValuesFromCabinetMenu.orientation = orientationSelect.value;

    } else if (cabinet.type === 'lowerCabinet' || cabinet.type === 'upperCabinet') {
        const offsetAlongWallVal = parseFloat(cabinetMenuDOM.querySelector('#cabinetoffsetAlongWall')?.value);
        if (!isNaN(offsetAlongWallVal)) newValuesFromCabinetMenu.offsetAlongWall = offsetAlongWallVal / 1000;
    }
    if (cabinet.type === 'upperCabinet') {
        const mezzanineSelect = cabinetMenuDOM.querySelector('#mezzanine');
        if (mezzanineSelect) newValuesFromCabinetMenu.isMezzanine = mezzanineSelect.value;
    }
    } catch (e) {
        console.error("[applyCabinetChanges] Ошибка при чтении данных из DOM:", e);
        if (wasDetailed && typeof toggleCabinetDetail === 'function') toggleCabinetDetail(cabinetIndex);
        if (typeof hideCabinetMenu === 'function') hideCabinetMenu();
        return;
    }

    // --- Блок 1.5: Проверка и обработка изменения основного типа/конфигурации ---
    const mainConfigOrTypeActuallyChanged = (newValuesFromCabinetMenu.cabinetType !== typeWhenMenuOpened) ||
                                            (newValuesFromCabinetMenu.cabinetConfig !== configWhenMenuOpened);

    cabinet.cabinetType = newValuesFromCabinetMenu.cabinetType;
    cabinet.cabinetConfig = newValuesFromCabinetMenu.cabinetConfig;

    if (mainConfigOrTypeActuallyChanged) {
        console.log(`[applyCabinetChanges] Тип/Конфиг изменился. Вызов prepareCabinetForNewConfig.`);
        window.prepareCabinetForNewConfig(cabinet, configWhenMenuOpened);
    } 

    // --- Блок 2: Применение размеров и других общих параметров из текущего меню ---
    // Эти значения могут переопределить дефолты, установленные clearCabinetConfig.
    if (newValuesFromCabinetMenu.width !== undefined) cabinet.width = newValuesFromCabinetMenu.width;
    if (newValuesFromCabinetMenu.depth !== undefined) cabinet.depth = newValuesFromCabinetMenu.depth;
    // --- ОБРАБОТКА ВЫСОТЫ ИЗ ОСНОВНОГО МЕНЮ ---
    const heightInputDOM = document.getElementById('cabinetHeight'); // Предполагаем, что это ID поля в cabinetMenu
    if (heightInputDOM && !heightInputDOM.disabled && newValuesFromCabinetMenu.height !== undefined) {
        cabinet.height = newValuesFromCabinetMenu.height;
        // Если высота редактировалась для типа, который может иметь независимую высоту
        const canBeIndependent = cabinet.type === 'upperCabinet' ||
                                 cabinet.type === 'freestandingCabinet' ||
                                 (cabinet.cabinetType === 'straight' && ['tallStorage', 'tallOvenMicro', 'fridge', 'highDivider'].includes(cabinet.cabinetConfig)) ||
                                 (cabinet.cabinetConfig === 'falsePanel' && cabinet.fp_height_option === 'freeHeight');
        if (canBeIndependent) {
            cabinet.isHeightIndependent = true;
        }
    }
    // --- КОНЕЦ ОБРАБОТКИ ВЫСОТЫ ---
    if (newValuesFromCabinetMenu.overhang !== undefined) cabinet.overhang = newValuesFromCabinetMenu.overhang;
    if (newValuesFromCabinetMenu.facadeGap !== undefined) cabinet.facadeGap = newValuesFromCabinetMenu.facadeGap;

    // --- Блок 3: Применение специфичных для типа шкафа параметров ---
    const wallId = cabinet.wallId; // WallId не меняется при этих операциях

    // --- ПРИНУДИТЕЛЬНЫЙ ПЕРЕСЧЕТ ВЫСОТЫ ДЛЯ "ВЫСОКИХ" ШКАФОВ ПОСЛЕ ВСЕХ ПРИМЕНЕНИЙ ИЗ ОСНОВНОГО МЕНЮ ---
    const isNowTallCabinet = (cabinet.cabinetType === 'straight' && ['tallStorage', 'tallOvenMicro', 'fridge'].includes(cabinet.cabinetConfig));
    if (isNowTallCabinet && !cabinet.isHeightIndependent) {
        cabinet.height = (kitchenGlobalParams.totalHeight - kitchenGlobalParams.plinthHeight) / 1000;
        cabinet.offsetBottom = kitchenGlobalParams.plinthHeight / 1000;
        console.log(`[applyCabinetChanges] Высота для высокого шкафа '${cabinet.cabinetConfig}' принудительно установлена: ${cabinet.height} м`);
    }
    // -------------------------------------------------------------------------------------------------

    

    // --- Блок 4: Обновление 3D геометрии и позиции ---
    if (cabinet.type === 'lowerCabinet' && wallId && wallId !== 'Bottom') {
        if (!isNaN(newOffsetAlongWallFromInputMm)) {
            cabinet.offsetAlongWall = newOffsetAlongWallFromInputMm / 1000;
        }
        // Пересчитываем отступ от стены ПОСЛЕ установки всех размеров и свеса
        cabinet.offsetFromParentWall = window.calculateLowerCabinetOffset(cabinet);

    } else if (cabinet.type === 'freestandingCabinet') {
        if (!isNaN(newOffsetXFromInputMm)) cabinet.offsetX = newOffsetXFromInputMm / 1000;
        if (!isNaN(newOffsetZFromInputMm)) cabinet.offsetZ = newOffsetZFromInputMm / 1000;

        // Обновление вращения (ориентации)
        const orientationSelect = document.getElementById('cabinetOrientation');
        if (orientationSelect && cabinet.mesh) {
            const orientation = orientationSelect.value;
            switch (orientation) {
                case 'Back': cabinet.mesh.rotation.y = 0; break;
                case 'Left': cabinet.mesh.rotation.y = THREE.MathUtils.degToRad(90); break;
                case 'Right': cabinet.mesh.rotation.y = THREE.MathUtils.degToRad(-90); break;
                case 'Front': cabinet.mesh.rotation.y = THREE.MathUtils.degToRad(180); break;
            }
        }
    } else if (cabinet.type === 'upperCabinet') {
        if (!isNaN(newOffsetAlongWallFromInputMm)) {
            cabinet.offsetAlongWall = newOffsetAlongWallFromInputMm / 1000;
        }
        const mezzanineSelect = document.getElementById('mezzanine');
        if (mezzanineSelect) {
            cabinet.isMezzanine = mezzanineSelect.value;
            // Пересчет высоты и offsetBottom для верхнего шкафа (эта логика уже была у вас и кажется корректной)
            const countertopHeightM = kitchenGlobalParams.countertopHeight / 1000;
            const apronHeightM = kitchenGlobalParams.apronHeight / 1000;
            const totalHeightM = kitchenGlobalParams.totalHeight / 1000;
            const mezzanineHeightM = kitchenGlobalParams.mezzanineHeight / 1000;
            const topApronEdgeM = apronHeightM + countertopHeightM;

            if (cabinet.isMezzanine === 'normal') {
                cabinet.height = totalHeightM - topApronEdgeM; // Высота от фартука до общей высоты
                cabinet.offsetBottom = topApronEdgeM;
            } else if (cabinet.isMezzanine === 'mezzanine') {
                cabinet.height = mezzanineHeightM;
                cabinet.offsetBottom = totalHeightM - mezzanineHeightM;
            } else if (cabinet.isMezzanine === 'underMezzanine') {
                cabinet.height = totalHeightM - topApronEdgeM - mezzanineHeightM;
                cabinet.offsetBottom = topApronEdgeM;
            }
        }
        cabinet.offsetFromParentWall = cabinet.offsetFromParentWall !== undefined ? cabinet.offsetFromParentWall : (20 / 1000);
    }
    // Геометрия простого куба (или временно упрощенного)
    if (!cabinet.isDetailed) { // Обновляем геометрию, только если это НЕ детализированный (или был упрощен)
        if (cabinet.mesh && cabinet.mesh.isMesh) {
            if (cabinet.mesh.geometry) cabinet.mesh.geometry.dispose();
            cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
            if (cabinet.edges && cabinet.edges.geometry) {
                cabinet.edges.geometry.dispose();
                cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
            }
        } else {
            console.warn("[applyCabinetChanges] Попытка обновить геометрию, но cabinet.mesh не является Mesh.");
        }
    }
    // Обновляем позицию всегда (даже для детализированного, его группа переместится)
    //if (typeof window.updateCabinetPosition === 'function') window.updateCabinetPosition(cabinet);
    window.updateCabinetPosition(cabinet); // Обновляем позицию

    // --- Блок 5: Проверка пересечений и финализация ---
    //const hasIntersection = typeof window.checkCabinetIntersections === 'function' ? window.checkCabinetIntersections(cabinet) : false;
    const hasIntersection = window.checkCabinetIntersections(cabinet); // Проверка пересечений
    if (cabinet.mesh && cabinet.mesh.material) { // Для Group материал будет у дочерних
        if (cabinet.mesh.isMesh) { // Цвет пересечения только для простого куба
            cabinet.mesh.material.color.set(hasIntersection ? 0xff0000 : cabinet.initialColor);
            cabinet.mesh.material.needsUpdate = true;
        }
    }
    if (cabinet.edges && cabinet.edges.material) { // Ребра только у простого куба
        cabinet.edges.material.color.set(0x000000);
        cabinet.edges.material.needsUpdate = true;
    }

    // --- Блок 6: Возвращаем детализацию, если она была ---
    if (wasDetailed) {
        console.log("[applyCabinetChanges] Восстановление детализации шкафа...");
        if (typeof toggleCabinetDetail === 'function') toggleCabinetDetail(cabinetIndex);
    }

    console.log("[applyCabinetChanges] Финальные данные шкафа ПОСЛЕ всех обновлений:", JSON.parse(JSON.stringify(cabinet)));
    if (typeof hideCabinetMenu === 'function') hideCabinetMenu();
}


function prepareCabinetForNewConfig(cabinet, oldConfig) {
    const newConfig = cabinet.cabinetConfig;
    const newCabinetType = cabinet.cabinetType; // Получаем и тип конструкции
    console.log(`[prepareCabinetForNewConfig] Шкаф ID: ${cabinet.mesh?.uuid}. newConfig: '${newConfig}', oldConfig: '${oldConfig}'`);

    // 1. Общие сбросы, если уходим от конфигурации, где были специфичные вещи.
    //    Эта часть важна для "очистки" свойств от предыдущей конфигурации.
    if (oldConfig === 'swing' && newConfig !== 'swing') {
        // Если уходили с распашного, где могли быть полки, а новая конфигурация их не имеет (например, ящики)
        if (newConfig === 'drawers' || newConfig === 'oven') { // Добавьте другие конфиги без полок
            cabinet.shelfType = 'none'; // Сброс, если не нужен в новой
            cabinet.shelfCount = 0;
        }
    }
    if (oldConfig === 'drawers' && newConfig !== 'drawers') {
        // cabinet.facadeCount = undefined; // или дефолт для новой
        // cabinet.drawerSet = undefined;
    }
    // ... и так далее для других "очисток" при смене КОНКРЕТНЫХ старых конфигов.

        // --- Определение, является ли НОВАЯ конфигурация "высокой" ---
    const isNewConfigTall = (newCabinetType === 'straight' && ['tallStorage', 'tallOvenMicro', 'fridge'].includes(newConfig));
    // 2. Установка дефолтов для НОВОЙ конфигурации (newConfig)
    //    Эти дефолты применяются, если свойство еще не установлено (undefined)
    //    ИЛИ если мы явно перешли с ДРУГОЙ конфигурации (oldConfig !== newConfig),
    //    чтобы переопределить старые дефолты на новые.

    if (newConfig === 'falsePanel') {
        console.log(`  [PP_FP] Установка/проверка дефолтов для 'falsePanel'`);
        if (cabinet.fp_type === undefined || oldConfig !== 'falsePanel') cabinet.fp_type = 'narrow';
        if (cabinet.fp_height_option === undefined || oldConfig !== 'falsePanel') cabinet.fp_height_option = 'cabinetHeight';
        if (cabinet.fp_vertical_align === undefined || oldConfig !== 'falsePanel') cabinet.fp_vertical_align = 'cabinetBottom';
        // Для ФП специфичные размеры рассчитываются позже, но основные параметры здесь.
        // Царги для ФП обычно не нужны, если это не сложная конструкция
        if (cabinet.rearStretcher === undefined || oldConfig !== 'falsePanel') cabinet.rearStretcher = 'none';
        if (cabinet.frontStretcher === undefined || oldConfig !== 'falsePanel') cabinet.frontStretcher = 'none';
        if (cabinet.stretcherDrop === undefined || oldConfig !== 'falsePanel') cabinet.stretcherDrop = 0.0; // метры
    } else if (newConfig === 'oven') {
        console.log(`  [PP_OVEN] Установка/проверка дефолтов для 'oven'`);
        if (cabinet.ovenHeight === undefined || oldConfig !== 'oven') cabinet.ovenHeight = '600';
        if (cabinet.ovenPosition === undefined || oldConfig !== 'oven') cabinet.ovenPosition = 'top';
        if (cabinet.extraOffset === undefined || oldConfig !== 'oven') cabinet.extraOffset = 0.0; // метры (будет конвертировано из мм в меню)
                                                                                               // или 0, если extraOffset хранится в мм в cabinetData
        if (cabinet.rearStretcher === undefined || oldConfig !== 'oven') cabinet.rearStretcher = 'horizontal';
        if (cabinet.frontStretcher === undefined || oldConfig !== 'oven') cabinet.frontStretcher = 'none';
        if (cabinet.stretcherDrop === undefined || oldConfig !== 'oven') cabinet.stretcherDrop = 0.040; // 40мм в метрах
        // Также могут быть дефолты для фасадов (например, 1 фасад)
        if (cabinet.facadeCount === undefined || oldConfig !== 'oven') cabinet.facadeCount = '1'; // Пример
        // Полки для oven обычно не основные, а специфичные (под/над духовкой)
        if (cabinet.shelfType === undefined || oldConfig !== 'oven') cabinet.shelfType = 'none'; // Основных полок нет
        if (cabinet.shelfCount === undefined || oldConfig !== 'oven') cabinet.shelfCount = 0;
        if (cabinet.ovenColor === undefined || oldConfig !== 'oven') cabinet.ovenColor = 'metallic'; // Дефолтный цвет - металлик
    } else if (newConfig === 'swing') {
        console.log(`  [PP_SWING] Установка/проверка дефолтов для 'swing'`);
        if (cabinet.doorType === undefined || oldConfig !== 'swing') cabinet.doorType = 'double';
        if (cabinet.shelfType === undefined || oldConfig !== 'swing') cabinet.shelfType = 'none';
        if (cabinet.shelfCount === undefined || oldConfig !== 'swing') cabinet.shelfCount = 0;
        if (cabinet.rearStretcher === undefined || oldConfig !== 'swing') cabinet.rearStretcher = 'horizontal';
        if (cabinet.frontStretcher === undefined || oldConfig !== 'drawers') {
            cabinet.frontStretcher = (kitchenGlobalParams.handleType === 'gola-profile' && cabinet.stretcherDrop > 0) ? 'none' : 'horizontal';
        }
        if (cabinet.stretcherDrop === undefined || oldConfig !== 'swing') cabinet.stretcherDrop = 0.0;
    } else if (newConfig === 'drawers') {
        console.log(`  [PP_DRAWERS] Установка/проверка дефолтов для 'drawers'`);
        if (cabinet.facadeCount === undefined || oldConfig !== 'drawers') cabinet.facadeCount = '2';
        if (cabinet.drawerSet === undefined || oldConfig !== 'drawers') cabinet.drawerSet = 'D+D'; // Типичный дефолт
        if (cabinet.rearStretcher === undefined || oldConfig !== 'drawers') cabinet.rearStretcher = 'horizontal';
        // Для ящиков с Gola передняя царга не нужна
        if (cabinet.frontStretcher === undefined || oldConfig !== 'drawers') {
            cabinet.frontStretcher = (kitchenGlobalParams.handleType === 'gola-profile' && cabinet.stretcherDrop > 0) ? 'none' : 'horizontal';
        }
        if (cabinet.stretcherDrop === undefined || oldConfig !== 'drawers') cabinet.stretcherDrop = 0.0;
    } else if (newConfig === 'tallOvenMicro') {
        console.log(`  [PP_TOM] Установка/проверка дефолтов для 'tallOvenMicro'`);
        if (cabinet.ovenType === undefined || oldConfig !== 'tallOvenMicro') cabinet.ovenType = '600';
        if (cabinet.ovenLevel === undefined || oldConfig !== 'tallOvenMicro') cabinet.ovenLevel = 'drawer';
        if (cabinet.microwaveType === undefined || oldConfig !== 'tallOvenMicro') cabinet.microwaveType = '362';
        if (cabinet.underOvenFill === undefined || oldConfig !== 'tallOvenMicro') cabinet.underOvenFill = 'drawers';
        if (cabinet.topShelves === undefined || oldConfig !== 'tallOvenMicro') cabinet.topShelves = '2';
        // --- НОВЫЕ ДЕФОЛТЫ ---
        if (cabinet.visibleSide === undefined || oldConfig !== 'tallOvenMicro') cabinet.visibleSide = 'none';
        if (cabinet.verticalGolaProfile === undefined || oldConfig !== 'tallOvenMicro') cabinet.verticalGolaProfile = 'none';
        if (cabinet.gapAboveTopFacadeMm === undefined || oldConfig !== 'tallOvenMicro') cabinet.gapAboveTopFacadeMm = 3; 
        if (cabinet.ovenColor === undefined || oldConfig !== 'tallOvenMicro') cabinet.ovenColor = 'metallic'; 
        cabinet.depth = 0.564; 
        
    } else if (newConfig === 'fridge') {
        if (cabinet.fridgeType === undefined || oldConfig !== 'fridge') cabinet.fridgeType = 'double';
        if (cabinet.shelvesAbove === undefined || oldConfig !== 'fridge') cabinet.shelvesAbove = '1';
        if (cabinet.fridgeNicheHeightMm === undefined || oldConfig !== 'fridge') {
            cabinet.fridgeNicheHeightMm = 1780; // Дефолт
        }
        if (cabinet.visibleSide === undefined || oldConfig !== 'fridge') cabinet.visibleSide = 'none';
        if (cabinet.doorOpening === undefined || oldConfig !== 'fridge') cabinet.doorOpening = 'left';
        if (cabinet.verticalGolaProfile === undefined || oldConfig !== 'fridge') cabinet.verticalGolaProfile = 'none';
    }
    // ... добавьте else if для других newConfig ...
    else {
        // Общие дефолты для неизвестных или не обработанных выше конфигураций,
        // если их свойства еще не определены
        if (cabinet.rearStretcher === undefined) cabinet.rearStretcher = 'horizontal';
        if (cabinet.frontStretcher === undefined) cabinet.frontStretcher = 'horizontal';
        if (cabinet.stretcherDrop === undefined) cabinet.stretcherDrop = 0.0;
        if (cabinet.freezerFacadeHeightMm === undefined || oldConfig !== 'fridge') cabinet.freezerFacadeHeightMm = 760;
        if (cabinet.topFacade1HeightMm === undefined || oldConfig !== 'fridge') cabinet.topFacade1HeightMm = 0; // Будет пересчитан
        if (cabinet.topFacade2HeightMm === undefined || oldConfig !== 'fridge') cabinet.topFacade2HeightMm = 0;
    }

    // 3. Дефолты для размеров и позиционирования (эта логика у вас уже есть и должна оставаться)
    //    Она применяется, если мы уходим от 'falsePanel' или если шкаф был "нулевой" по размерам.
    // --- Установка высоты и isHeightIndependent для НОВЫХ высоких шкафов ---
    if (isNewConfigTall) {
        // Если мы ПЕРЕХОДИМ на высокий тип, и высота еще не независима,
        // или если это новый шкаф, который сразу стал высоким.
        if (!cabinet.isHeightIndependent) {
            cabinet.height = (kitchenGlobalParams.totalHeight - kitchenGlobalParams.plinthHeight) / 1000;
            cabinet.offsetBottom = kitchenGlobalParams.plinthHeight / 1000;
            // isHeightIndependent пока false, пользователь должен явно включить свободную высоту
            console.log(`  [PP_TALL] Для высокого шкафа '${newConfig}' установлена расчетная высота: ${cabinet.height} м`);
        } else {
            // Если isHeightIndependent уже true (например, пользователь ранее установил свободную высоту
            // для этой же конфигурации), оставляем текущую высоту.
            console.log(`  [PP_TALL] Для высокого шкафа '${newConfig}' isHeightIndependent=true, высота остается ${cabinet.height} м`);
        }
    } else if (newConfig !== 'falsePanel') { // Для НЕ высоких и НЕ фальш-панелей
        if (oldConfig === 'falsePanel' || cabinet.width < 0.011 ||
            (oldConfig && ['tallStorage', 'tallOvenMicro', 'fridge'].includes(oldConfig) && !isNewConfigTall) // Если уходим с высокого на невысокий
           ) {
            cabinet.width = (window.objectTypes?.lowerCabinet?.defaultWidth || 600) / 1000;
            cabinet.depth = (window.objectTypes?.lowerCabinet?.defaultDepth || 520) / 1000;
            cabinet.overhang = (window.objectTypes?.lowerCabinet?.overhang || 18) / 1000;
        }
        // Высота и offsetBottom для стандартных нижних (если не высокий и не верхний)
        if (!cabinet.isHeightIndependent &&
            cabinet.type === 'lowerCabinet' &&
            !isNewConfigTall // Явно проверяем, что новая конфигурация не высокая
           ) {
            cabinet.height = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;
            cabinet.offsetBottom = kitchenGlobalParams.plinthHeight / 1000;
        }
    }
    console.log(`[prepareCabinetForNewConfig] Финальный cabinet для '${newConfig}':`, JSON.parse(JSON.stringify(cabinet)));
}

function applyChangesAndPrepareForConfigMenu(cabinetIndex) {
    const cabinet = cabinets[cabinetIndex];
    if (!cabinet) {
        console.error("applyChangesAndPrepareForConfigMenu: Шкаф не найден", cabinetIndex);
        return;
    }
    console.log(`[applyChangesAndPrepare] Для шкафа ${cabinetIndex}.`);

    // Получаем состояние, которое было у объекта cabinet НА МОМЕНТ ОТКРЫТИЯ cabinetMenu
    const typeWhenMenuOpened = initialMenuData.originalType;
    const configWhenMenuOpened = initialMenuData.originalConfig;

    // Считываем ТЕКУЩИЕ ВЫБРАННЫЕ значения из DOM-селектов и инпутов cabinetMenu
    const cabinetMenuDOM = document.getElementById('cabinetMenu');
    if (!cabinetMenuDOM) {
        console.error("[applyChangesAndPrepare] DOM-элемент cabinetMenu не найден!");
        return;
    }

    const newValuesFromCabinetMenu = {};
    const widthInput = cabinetMenuDOM.querySelector('#cabinetWidth');
    if (widthInput) { const val = parseFloat(widthInput.value); if (!isNaN(val)) newValuesFromCabinetMenu.width = val / 1000; }
    
    const depthInput = cabinetMenuDOM.querySelector('#cabinetDepth');
    if (depthInput) { const val = parseFloat(depthInput.value); if (!isNaN(val)) newValuesFromCabinetMenu.depth = val / 1000; }

    const heightInput = cabinetMenuDOM.querySelector('#cabinetHeight');
    if (heightInput && !heightInput.disabled) {
        const val = parseFloat(heightInput.value);
        if (!isNaN(val)) newValuesFromCabinetMenu.height = val / 1000;
    }

    const overhangInput = cabinetMenuDOM.querySelector('#cabinetOverhang');
    if (overhangInput) { const val = parseFloat(overhangInput.value); if (!isNaN(val)) newValuesFromCabinetMenu.overhang = val / 1000; }
    
    const facadeGapInput = cabinetMenuDOM.querySelector('#cabinetFacadeGap');
    if (facadeGapInput) { const val = parseFloat(facadeGapInput.value); if (!isNaN(val)) newValuesFromCabinetMenu.facadeGap = val / 1000; }

    newValuesFromCabinetMenu.cabinetType = cabinetMenuDOM.querySelector('#cabinetType').value;
    newValuesFromCabinetMenu.cabinetConfig = cabinetMenuDOM.querySelector('#cabinetConfig').value;

    if (cabinet.type === 'freestandingCabinet') {
        const offsetXVal = parseFloat(cabinetMenuDOM.querySelector('#cabinetOffsetX')?.value);
        if (!isNaN(offsetXVal)) newValuesFromCabinetMenu.offsetX = offsetXVal / 1000;
        const offsetZVal = parseFloat(cabinetMenuDOM.querySelector('#cabinetOffsetZ')?.value);
        if (!isNaN(offsetZVal)) newValuesFromCabinetMenu.offsetZ = offsetZVal / 1000;
        const orientationSelect = cabinetMenuDOM.querySelector('#cabinetOrientation');
        if (orientationSelect) newValuesFromCabinetMenu.orientation = orientationSelect.value;

    } else if (cabinet.type === 'lowerCabinet' || cabinet.type === 'upperCabinet') {
        const offsetAlongWallVal = parseFloat(cabinetMenuDOM.querySelector('#cabinetoffsetAlongWall')?.value);
        if (!isNaN(offsetAlongWallVal)) newValuesFromCabinetMenu.offsetAlongWall = offsetAlongWallVal / 1000;
    }
    if (cabinet.type === 'upperCabinet') {
        const mezzanineSelect = cabinetMenuDOM.querySelector('#mezzanine');
        if (mezzanineSelect) newValuesFromCabinetMenu.isMezzanine = mezzanineSelect.value;
    }

    console.log("[applyChangesAndPrepare] Считано из cabinetMenu:", JSON.parse(JSON.stringify(newValuesFromCabinetMenu)));

    // Проверяем, изменился ли основной тип/конфигурация по сравнению с тем, что было при открытии меню
    const mainConfigOrTypeActuallyChanged = (newValuesFromCabinetMenu.cabinetType !== typeWhenMenuOpened) ||
                                            (newValuesFromCabinetMenu.cabinetConfig !== configWhenMenuOpened);

    // ПРИМЕНЯЕМ новый тип и конфиг к объекту ДО вызова prepareCabinetForNewConfig
    cabinet.cabinetType = newValuesFromCabinetMenu.cabinetType;
    cabinet.cabinetConfig = newValuesFromCabinetMenu.cabinetConfig;

    if (mainConfigOrTypeActuallyChanged) {
        console.log(`[applyChangesAndPrepare] Тип/Конфиг изменился. Вызов prepareCabinetForNewConfig с oldConfig=${configWhenMenuOpened}.`);
        window.prepareCabinetForNewConfig(cabinet, configWhenMenuOpened);
        // prepareCabinetForNewConfig уже установила дефолтные размеры и параметры для НОВОГО cabinet.cabinetConfig
    }

    // Применяем остальные значения из newValuesFromCabinetMenu к объекту cabinet
    // Эти значения ПЕРЕОПРЕДЕЛЯТ дефолты, установленные prepareCabinetForNewConfig.
    if (newValuesFromCabinetMenu.width !== undefined) cabinet.width = newValuesFromCabinetMenu.width;
    if (newValuesFromCabinetMenu.depth !== undefined) cabinet.depth = newValuesFromCabinetMenu.depth;
    if (newValuesFromCabinetMenu.height !== undefined) { // Высота из основного меню
        cabinet.height = newValuesFromCabinetMenu.height;
        // Устанавливаем isHeightIndependent, если высота редактировалась для подходящего типа
        const heightInputDOM = cabinetMenuDOM.querySelector('#cabinetHeight');
        if (heightInputDOM && !heightInputDOM.disabled) {
             if ( (cabinet.type === 'upperCabinet' || (cabinet.cabinetType === 'straight' && ['tallStorage', 'tallOvenMicro', 'fridge', 'highDivider'].includes(cabinet.cabinetConfig)) || (cabinet.cabinetConfig === 'falsePanel' && cabinet.fp_height_option === 'freeHeight') ) ) {
                 cabinet.isHeightIndependent = true;
             }
        }
    }
    if (newValuesFromCabinetMenu.overhang !== undefined) cabinet.overhang = newValuesFromCabinetMenu.overhang;
    if (newValuesFromCabinetMenu.facadeGap !== undefined) cabinet.facadeGap = newValuesFromCabinetMenu.facadeGap;

    if (cabinet.type === 'freestandingCabinet') {
        if (newValuesFromCabinetMenu.offsetX !== undefined) cabinet.offsetX = newValuesFromCabinetMenu.offsetX;
        if (newValuesFromCabinetMenu.offsetZ !== undefined) cabinet.offsetZ = newValuesFromCabinetMenu.offsetZ;
        // Ориентация (вращение) для freestanding будет применена в applyFinalCabinetConfigChanges или applyCabinetChanges
        // Здесь мы только сохраняем выбранное значение, если оно было в newValuesFromCabinetMenu.orientation
        if (newValuesFromCabinetMenu.orientation !== undefined) cabinet.orientation = newValuesFromCabinetMenu.orientation; // Сохраняем для дальнейшего применения
    } else if (cabinet.type === 'lowerCabinet' || cabinet.type === 'upperCabinet') {
        if (newValuesFromCabinetMenu.offsetAlongWall !== undefined) cabinet.offsetAlongWall = newValuesFromCabinetMenu.offsetAlongWall;
    }

    if (cabinet.type === 'upperCabinet') {
        if (newValuesFromCabinetMenu.isMezzanine !== undefined) {
            cabinet.isMezzanine = newValuesFromCabinetMenu.isMezzanine;
            // Пересчитываем высоту и offsetBottom для верхнего шкафа СРАЗУ,
            // так как это влияет на то, как будет выглядеть меню конфигурации
            // и какие значения высоты будут там по умолчанию.
            const countertopHeightM = kitchenGlobalParams.countertopHeight / 1000;
            const apronHeightM = kitchenGlobalParams.apronHeight / 1000;
            const totalHeightM = kitchenGlobalParams.totalHeight / 1000;
            const mezzanineHeightM = kitchenGlobalParams.mezzanineHeight / 1000;
            const topApronEdgeM = apronHeightM + countertopHeightM;

            let newHeightForUpper = cabinet.height; // Сохраняем текущую на случай, если isHeightIndependent
            let newOffsetBottomForUpper = cabinet.offsetBottom;

            if (cabinet.isMezzanine === 'normal') {
                newHeightForUpper = totalHeightM - topApronEdgeM;
                newOffsetBottomForUpper = topApronEdgeM;
            } else if (cabinet.isMezzanine === 'mezzanine') {
                newHeightForUpper = mezzanineHeightM;
                newOffsetBottomForUpper = totalHeightM - mezzanineHeightM;
            } else if (cabinet.isMezzanine === 'underMezzanine') {
                newHeightForUpper = totalHeightM - topApronEdgeM - mezzanineHeightM;
                newOffsetBottomForUpper = topApronEdgeM;
            }
            // Применяем, только если высота не является независимой (т.е. не была установлена вручную)
            // Или если isMezzanine изменился, то высота должна пересчитаться.
            if (!cabinet.isHeightIndependent || (initialMenuData.originalIsMezzanine !== cabinet.isMezzanine)) { // initialMenuData.originalIsMezzanine нужно будет добавить
                cabinet.height = newHeightForUpper;
                cabinet.offsetBottom = newOffsetBottomForUpper;
                cabinet.isHeightIndependent = false; // При смене типа антресоли высота становится зависимой
            }
        }
    }
    // Тут не вызываем calculateLowerCabinetOffset, updateCabinetPosition, toggleDetail
    console.log(`[applyChangesAndPrepare] Объект cabinet обновлен:`, JSON.parse(JSON.stringify(cabinet)));
}

function applyCountertopChanges(countertop, depthValue, materialValue, colorValue) {
    const depth = parseFloat(depthValue) / 1000;
    const thickness = countertop.userData.thickness;
    const length = countertop.userData.length;

    // Обновим userData
    countertop.userData.depth = depth;
    countertop.userData.materialType = materialValue;
    countertop.userData.solidColor = colorValue;

    // Обновим геометрию
    countertop.geometry.dispose();
    countertop.geometry = new THREE.BoxGeometry(length, thickness, depth);

    // Применим материал
    const countertopMaterial = createCountertopMaterial({
        materialType: materialValue,
        solidColor: colorValue,
        textureType: kitchenGlobalParams.countertopType
    });
    countertop.material = countertopMaterial;

    // Обновим грани
    if (countertop.userData.edges) {
        countertop.userData.edges.geometry.dispose();
        countertop.userData.edges.geometry = new THREE.EdgesGeometry(countertop.geometry);
    }

    selectedCabinets = [];
    selectedCabinet = null;
    updateHint('Столешница обновлена');

    // Обновим текстуру при необходимости
    updateTextureScale(countertop);
    // Снимаем старую подсветку и принудительно сбрасываем флаг
    if (countertop.userData.isHighlighted) {
        removeHighlight(countertop);
    }

    console.log(`Applied countertop material: ${materialValue}, color: ${colorValue}, type: ${kitchenGlobalParams.countertopType}`);
}


function addAdjacentSocket(socketIndex, direction) {
    const socket = windows[socketIndex];
    const wallId = socket.wallId;
    const params = objectTypes['socket'];

    let newoffsetAlongWall = socket.offsetAlongWall;
    let newOffsetBottom = socket.offsetBottom;
    const offsetFromParentWall = socket.offsetFromParentWall;
    const socketWidth = params.defaultWidth;
    const socketHeight = params.defaultHeight;

    switch (direction) {
        case 'left':
            if (wallId == "Left") {
                newoffsetAlongWall += socketWidth;
            } else {
                newoffsetAlongWall -= socketWidth;
            }
            break;
        case 'up':
            newOffsetBottom += socketHeight;
            break;
        case 'down':
            newOffsetBottom -= socketHeight;
            break;
        case 'right':
            newoffsetAlongWall = wallId == "Left" ? newoffsetAlongWall - socketWidth : 
            newoffsetAlongWall + socketWidth;
            break;
    }

    let wallWidth, wallHeight;
    switch (wallId) {
        case "Back":
            wallWidth = currentLength;
            wallHeight = currentWidth;
            break;
        case "Left":
        case "Right":
            wallWidth = currentHeight;
            wallHeight = currentWidth;
            break;
    }

    if (newoffsetAlongWall < 0 || newoffsetAlongWall + socketWidth > wallWidth || 
        newOffsetBottom < 0 || newOffsetBottom + socketHeight > wallHeight) {
        alert("Новая розетка выходит за пределы стены!");
        return;
    }

    const geometry = new THREE.BoxGeometry(params.defaultWidth, params.defaultHeight, params.defaultDepth);
    const material = new THREE.MeshStandardMaterial({ color: params.initialColor });
    const mesh = new THREE.Mesh(geometry, material);

    const edgesGeometry = new THREE.EdgesGeometry(geometry);
    const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edges.raycast = () => {};
    mesh.add(edges);

    switch (wallId) {
        case "Back":
            mesh.position.set(
                -currentLength / 2 + newoffsetAlongWall + socketWidth / 2,
                -currentWidth / 2 + newOffsetBottom + socketHeight / 2,
                -currentHeight / 2 + offsetFromParentWall + params.defaultDepth / 2
            );
            break;
        case "Left":
            mesh.position.set(
                -currentLength / 2 + offsetFromParentWall + params.defaultDepth / 2,
                -currentWidth / 2 + newOffsetBottom + socketHeight / 2,
                -currentHeight / 2 + newoffsetAlongWall + socketWidth / 2
            );
            mesh.rotation.y = THREE.MathUtils.degToRad(90);
            break;
        case "Right":
            mesh.position.set(
                currentLength / 2 - offsetFromParentWall - params.defaultDepth / 2,
                -currentWidth / 2 + newOffsetBottom + socketHeight / 2,
                -currentHeight / 2 + newoffsetAlongWall + socketWidth / 2
            );
            mesh.rotation.y = THREE.MathUtils.degToRad(-90);
            break;
    }

    scene.add(mesh);
    const newSocket = {
        mesh: mesh,
        wallId: wallId,
        initialColor: params.initialColor,
        width: params.defaultWidth,
        height: params.defaultHeight,
        depth: params.defaultDepth,
        offsetAlongWall: newoffsetAlongWall,
        offsetBottom: newOffsetBottom,
        offsetFromParentWall: offsetFromParentWall,
        type: 'socket',
        edges: edges
    };
    windows.push(newSocket);

    removeHighlight(socket.mesh);   // убираем выделение с предыдущей розетки
    applyHighlight(newSocket.mesh);           // выделяем новую розетку
    selectedCabinets = [newSocket]; // правильнее было бы переименовать в selectedObjects?
    selectedCabinet = newSocket;

    const center = new THREE.Vector3();
    mesh.getWorldPosition(center);
    const screenPos = center.project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    const x = (screenPos.x + 1) * rect.width / 2 + rect.left;
    const y = (-screenPos.y + 1) * rect.height / 2 + rect.top;

    hideSocketMenu();
    showSocketMenu(x, y, newSocket);
    
}

function hideSocketMenu() {
    const menu = document.getElementById('socketMenu');
    if (menu) menu.style.display = 'none';
}

// Глобальная переменная для хранения поля ширины
let widthInput = null;
let depthInput = null;
let heightInput = null;
let toLeftLine = null;
let toRightLine = null;
let toLeftInput = null;
let toRightInput = null;
let toFrontInput, toBackInput;
let distanceLine = null; // Вместо toLeftLine и toRightLine
let distanceLineDepth = null; // Размерная линия по глубине для freeStandingCabinet

// Создаёт поле ввода с обработчиком Enter
// Принимает: cabinet (объект шкафа), config (конфигурация стены), isLeft (левое или правое поле)
// Создаёт поле ввода с обработчиком Enter
function createDimensionInput(cabinet, config, isLeft) { 
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'dimension-input';
    input.value = Math.round((isLeft ? config.leftValue(cabinet) : config.rightValue(cabinet)) * 1000);
    renderer.domElement.parentNode.appendChild(input);
    attachExpressionValidator(input);
    return input;
}

// создание линии
function createLine(start, end, color = 0x333333) {
    const material = new THREE.LineBasicMaterial({ color });
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const line = new THREE.Line(geometry, material);
    return line;
}

// Находит ближайшие шкафы слева и справа (или вдоль оси) с тем же wallId
function findNearestCabinets(cabinet, cabinets, axis, maxSize) {
    // 1. Инициализация параметров текущего шкафа
    const originalPosition = cabinet.mesh.position.clone();
    const width = cabinet.width;
    const depth = cabinet.depth;
    const height = cabinet.height;
    const rotationY = cabinet.mesh.rotation.y;
    const step = 0.001;

    // 2. Вычисление bounding box текущего шкафа
    let cabinetMin, cabinetMax;
    if (rotationY === 0) { // Back
        cabinetMin = new THREE.Vector3(
            originalPosition.x - width / 2,
            originalPosition.y - height / 2,
            originalPosition.z - depth / 2
        );
        cabinetMax = new THREE.Vector3(
            originalPosition.x + width / 2,
            originalPosition.y + height / 2,
            originalPosition.z + depth / 2
        );
    } else if (rotationY === THREE.MathUtils.degToRad(90) || rotationY === THREE.MathUtils.degToRad(-90)) { // Left or Right
        cabinetMin = new THREE.Vector3(
            originalPosition.x - depth / 2,
            originalPosition.y - height / 2,
            originalPosition.z - width / 2
        );
        cabinetMax = new THREE.Vector3(
            originalPosition.x + depth / 2,
            originalPosition.y + height / 2,
            originalPosition.z + width / 2
        );
    }

    // 3. Фильтрация шкафов на той же стене
    const sameWallCabinets = (cabinets || []).filter(c => c && c !== cabinet && c.wallId === cabinet.wallId);
    //console.log('sameWallCabinets:', sameWallCabinets.length, sameWallCabinets);

    // 4. Инициализация границ
    let leftBoundary = -maxSize / 2;
    let rightBoundary = maxSize / 2;

    // 5. Поиск влево
    let testPosition = originalPosition.clone();
    let testMin = cabinetMin.clone();
    let testMax = cabinetMax.clone();
    while (testPosition[axis] > -maxSize / 2) {
        testPosition[axis] -= step;
        testMin[axis] -= step;
        testMax[axis] -= step;

        for (const other of sameWallCabinets) {
            other.mesh.updateMatrixWorld();
            const otherPos = other.mesh.position.clone();
            const otherWidth = other.width;
            const otherDepth = other.depth;
            const otherHeight = other.height;
            const otherRotationY = other.mesh.rotation.y;

            let otherMin, otherMax;
            if (otherRotationY === 0) {
                otherMin = new THREE.Vector3(otherPos.x - otherWidth / 2, otherPos.y - otherHeight / 2, otherPos.z - otherDepth / 2);
                otherMax = new THREE.Vector3(otherPos.x + otherWidth / 2, otherPos.y + otherHeight / 2, otherPos.z + otherDepth / 2);
            } else if (otherRotationY === THREE.MathUtils.degToRad(90) || otherRotationY === THREE.MathUtils.degToRad(-90)) {
                otherMin = new THREE.Vector3(otherPos.x - otherDepth / 2, otherPos.y - otherHeight / 2, otherPos.z - otherWidth / 2);
                otherMax = new THREE.Vector3(otherPos.x + otherDepth / 2, otherPos.y + otherHeight / 2, otherPos.z + otherWidth / 2);
            }

            const epsilon = 0.0001; // Допуск на округление
            if (
                testMax.x > otherMin.x + epsilon && testMin.x < otherMax.x - epsilon &&
                testMax.y > otherMin.y + epsilon && testMin.y < otherMax.y - epsilon &&
                testMax.z > otherMin.z && testMin.z < otherMax.z
            ) {
                leftBoundary = axis === 'x' ? otherMax.x : otherMax.z;
                //console.log('Left intersection with:', other);
                //console.log('testMin:', testMin, 'testMax:', testMax);
                //console.log('otherMin:', otherMin, 'otherMax:', otherMax);
                break;
            }
        }
        if (leftBoundary !== -maxSize / 2) break;
    }

    // 6. Поиск вправо
    testPosition = originalPosition.clone();
    testMin = cabinetMin.clone();
    testMax = cabinetMax.clone();
    while (testPosition[axis] < maxSize / 2) {
        testPosition[axis] += step;
        testMin[axis] += step;
        testMax[axis] += step;

        for (const other of sameWallCabinets) {
            other.mesh.updateMatrixWorld();
            const otherPos = other.mesh.position.clone();
            const otherWidth = other.width;
            const otherDepth = other.depth;
            const otherHeight = other.height;
            const otherRotationY = other.mesh.rotation.y;

            let otherMin, otherMax;
            if (otherRotationY === 0) {
                otherMin = new THREE.Vector3(otherPos.x - otherWidth / 2, otherPos.y - otherHeight / 2, otherPos.z - otherDepth / 2);
                otherMax = new THREE.Vector3(otherPos.x + otherWidth / 2, otherPos.y + otherHeight / 2, otherPos.z + otherDepth / 2);
            } else if (otherRotationY === THREE.MathUtils.degToRad(90) || otherRotationY === THREE.MathUtils.degToRad(-90)) {
                otherMin = new THREE.Vector3(otherPos.x - otherDepth / 2, otherPos.y - otherHeight / 2, otherPos.z - otherWidth / 2);
                otherMax = new THREE.Vector3(otherPos.x + otherDepth / 2, otherPos.y + otherHeight / 2, otherPos.z + otherWidth / 2);
            }
            const epsilon = 0.0001; // Допуск на округление
            if (
                testMax.x > otherMin.x && testMin.x < otherMax.x &&
                testMax.y > otherMin.y + 0.0001 && testMin.y < otherMax.y - 0.0001 &&
                testMax.z > otherMin.z && testMin.z < otherMax.z
            ) {
                rightBoundary = axis === 'x' ? otherMin.x : otherMin.z;
                //console.log('Right intersection with:', other);
                //console.log('testMin:', testMin, 'testMax:', testMax);
                //console.log('otherMin:', otherMin, 'otherMax:', otherMax);
                break;
            }
        }
        if (rightBoundary !== maxSize / 2) break;
    }

    // 7. Возврат результата
    //console.log('Final leftBoundary:', leftBoundary);
    //console.log('Final rightBoundary:', rightBoundary);
    return { leftBoundary, rightBoundary };
}

// Функция для отображения ширины шкафа
function showCabinetDimensionsInput(cabinet, cabinets) {
    // Удаляем старые элементы, если они есть
    hideAllDimensionInputs(); // Используем общую функцию очистки

    if (countertopDepthInput) { countertopDepthInput.remove(); countertopDepthInput = null; }

    if (!['lowerCabinet', 'upperCabinet'].includes(cabinet.type)) {
        return;
    }

    const cabinetIndex = cabinets.findIndex(c => c.mesh?.uuid === cabinet.mesh.uuid); // Находим индекс по UUID
    if (cabinetIndex === -1) {
        console.error("showCabinetDimensionsInput: Не найден индекс для шкафа", cabinet.mesh.uuid);
        return;
    }
    const isCurrentlyDetailed = cabinet.isDetailed; // Запоминаем исходное состояние
    
    // Поле ширины
    widthInput = document.createElement('input');
    widthInput.type = 'text';
    widthInput.className = 'dimension-input';
    widthInput.value = Math.round(cabinet.width * 1000);
    widthInput.dataset.min = "12";  // Минимальное значение
    renderer.domElement.parentNode.appendChild(widthInput);
    attachExpressionValidator(widthInput);

    widthInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            const newWidthMm = parseFloat(widthInput.value);
            if (!isNaN(newWidthMm) && newWidthMm >= 12) {
                if (isCurrentlyDetailed) {
                    console.log(" - Переключаем на простой...");
                    toggleCabinetDetail(cabinetIndex); // -> Простой вид
                    // Обновляем данные шкафа (теперь cabinet.mesh - это простой куб)
                    cabinets[cabinetIndex].width = newWidthMm / 1000;
                     console.log(" - Обновляем геометрию простого...");
                    if(cabinets[cabinetIndex].mesh.geometry) cabinets[cabinetIndex].mesh.geometry.dispose();
                    cabinets[cabinetIndex].mesh.geometry = new THREE.BoxGeometry(cabinets[cabinetIndex].width, cabinets[cabinetIndex].height, cabinets[cabinetIndex].depth);
                    if(cabinets[cabinetIndex].edges?.geometry) { cabinets[cabinetIndex].edges.geometry.dispose(); cabinets[cabinetIndex].edges.geometry = new THREE.EdgesGeometry(cabinets[cabinetIndex].mesh.geometry); }
                    updateCabinetPosition(cabinets[cabinetIndex]); // Обновляем позицию простого
                     console.log(" - Переключаем обратно на детализацию...");
                    toggleCabinetDetail(cabinetIndex); // -> Детализированный вид с новыми размерами
                    updateDimensionsInputPosition(cabinet, cabinets);
                } else {
                    cabinet.width = newWidthMm / 1000;
                    cabinet.mesh.geometry.dispose();
                    cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
                    cabinet.edges.geometry.dispose();
                    cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
                    widthInput.value = Math.round(cabinet.width * 1000);
                    updateCabinetPosition(cabinet);
                    updateDimensionsInputPosition(cabinet, cabinets);
                }
            } else {
                widthInput.value = Math.round(cabinets[cabinetIndex].width * 1000); // Восстанавливаем старое значение
            }
            requestRender();
            event.stopPropagation();
        }
    });

    // Поле глубины
    depthInput = document.createElement('input');
    depthInput.type = 'text';
    depthInput.className = 'dimension-input';
    depthInput.value = Math.round(cabinet.depth * 1000);
    depthInput.dataset.min = "18";   // Минимальная глубина 18 мм
    renderer.domElement.parentNode.appendChild(depthInput);
    attachExpressionValidator(depthInput);

    depthInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            const newDepthMm = parseFloat(depthInput.value);
            if (!isNaN(newDepthMm) && newDepthMm >= 18) { // Минимальная глубина 18 мм
                // --- НАЧАЛО Логики с детализацией ---
                if (isCurrentlyDetailed) {
                    console.log(" - Переключаем на простой...");
                    toggleCabinetDetail(cabinetIndex);
                    cabinets[cabinetIndex].depth = newDepthMm / 1000;
                    // Пересчет отступа от стены для нижних
                    if (cabinets[cabinetIndex].type === 'lowerCabinet') {
                        cabinets[cabinetIndex].offsetFromParentWall = calculateLowerCabinetOffset(cabinets[cabinetIndex]);
                    }
                    console.log(" - Обновляем геометрию простого...");
                    if(cabinets[cabinetIndex].mesh.geometry) cabinets[cabinetIndex].mesh.geometry.dispose();
                    cabinets[cabinetIndex].mesh.geometry = new THREE.BoxGeometry(cabinets[cabinetIndex].width, cabinets[cabinetIndex].height, cabinets[cabinetIndex].depth);
                    if(cabinets[cabinetIndex].edges?.geometry) { cabinets[cabinetIndex].edges.geometry.dispose(); cabinets[cabinetIndex].edges.geometry = new THREE.EdgesGeometry(cabinets[cabinetIndex].mesh.geometry); }
                    updateCabinetPosition(cabinets[cabinetIndex]);
                    console.log(" - Переключаем обратно на детализацию...");
                    toggleCabinetDetail(cabinetIndex);
                    updateDimensionsInputPosition(cabinet, cabinets);
                } else {
                    // 1. Обновляем глубину шкафа в объекте cabinet
                    // Это важно сделать ДО вызова calculateLowerCabinetOffset
                    cabinet.depth = newDepthMm / 1000;
        
                    // 2. Пересчитываем отступ ТОЛЬКО для нижних шкафов, используя ПРАВИЛЬНУЮ функцию
                    if (cabinet.type === 'lowerCabinet') {
                        // Используем хелпер, который учтет глубину столешницы на стене cabinet.wallId
                        // и новую глубину самого шкафа (cabinet.depth)
                        cabinet.offsetFromParentWall = calculateLowerCabinetOffset(cabinet);
                        console.log(`Recalculated offsetFromParentWall for cabinet ${cabinet.mesh.uuid} to ${cabinet.offsetFromParentWall} using per-wall depth`);
                    }
                    // Для верхних шкафов offsetFromParentWall обычно не зависит от глубины шкафа или столешницы.
                    // Если зависит - добавь логику здесь.
        
                    // 3. Обновляем геометрию шкафа (и ребер)
                    cabinet.mesh.geometry.dispose();
                    cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
                    if (cabinet.edges) { // Проверяем, есть ли ребра
                        cabinet.edges.geometry.dispose();
                        cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
                    } else {
                        console.warn("Cabinet edges not found during depth update:", cabinet);
                    }
        
        
                    // 4. Обновляем значение в поле ввода
                    depthInput.value = Math.round(cabinet.depth * 1000);
        
                    // 5. Обновляем позицию шкафа
                    // updateCabinetPosition использует обновленный cabinet.offsetFromParentWall
                    updateCabinetPosition(cabinet);
        
                    // 6. Обновляем позицию размерных полей
                    updateDimensionsInputPosition(cabinet, cabinets);
                }

            } else {
                 // Восстанавливаем старое значение при невалидном вводе
                 console.warn("Invalid depth entered, reverting.");
                 depthInput.value = Math.round(cabinet.depth * 1000);
            }
            requestRender();
            event.stopPropagation(); // Остановка всплытия события
        }
    });

    // Поле высоты
    heightInput = document.createElement('input');
    heightInput.type = 'text';
    heightInput.className = 'dimension-input';
    heightInput.value = Math.round(cabinet.height * 1000);
    heightInput.readOnly = !cabinet.isHeightIndependent;
    renderer.domElement.parentNode.appendChild(heightInput);
    if (cabinet.isHeightIndependent) {
        attachExpressionValidator(heightInput);
        heightInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                const newHeightMm = parseFloat(heightInput.value);
                if (!isNaN(newHeightMm) && newHeightMm >= 100) {
                    cabinet.height = newHeightMm / 1000;
                    if (cabinet.type == 'upperCabinet') {
                        cabinet.offsetBottom = kitchenGlobalParams.totalHeight / 1000 - cabinet.height;
                    }
                    cabinet.mesh.geometry.dispose();
                    cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
                    cabinet.edges.geometry.dispose();
                    cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
                    heightInput.value = Math.round(cabinet.height * 1000);
                    updateCabinetPosition(cabinet);
                    updateDimensionsInputPosition(cabinet, cabinets);
                }
                requestRender();
                event.stopPropagation();
            }
        });
    } else {
        heightInput.classList.add('readonly');
    }

    const config = getWallConfig(cabinet.wallId, cabinet, cabinets);
    cabinet.boundaries = findNearestCabinets(cabinet, cabinets, config.axis, config.maxSize); // Один раз при выделении
    if (config) {
        distanceLine = createLine(config.lineStart(cabinet), config.lineEnd(cabinet));
        scene.add(distanceLine);

        toLeftInput = createDimensionInput(cabinet, config, true);
        toRightInput = createDimensionInput(cabinet, config, false);

        toLeftInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                const newValueMm = parseFloat(toLeftInput.value);
                const newValueM = newValueMm / 1000;
                const maxValue = config.maxSize - cabinet[config.sizeParam];
                if (!isNaN(newValueMm) && newValueM >= 0 && newValueM <= maxValue) {
                    const leftBoundary = cabinet.boundaries.leftBoundary + config.maxSize / 2;
                    cabinet[config.offsetParam] = leftBoundary + newValueM;
                    updateCabinetPosition(cabinet);
                    toLeftInput.value = Math.round(config.leftValue(cabinet) * 1000);
                    toRightInput.value = Math.round(config.rightValue(cabinet) * 1000);
                    updateDimensionsInputPosition(cabinet, cabinets);
                } else {
                    console.log('Invalid input:', newValueMm, 'Max:', maxValue);
                }
                requestRender();
                event.stopPropagation();
            }
        });

        toRightInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                console.log('Enter pressed:', toRightInput.value);
                const newValueMm = parseFloat(toRightInput.value);
                const newValueM = newValueMm / 1000;
                const maxValue = config.maxSize - cabinet[config.sizeParam];
                console.log('newValueM:', newValueM, 'maxValue:', maxValue);
                if (!isNaN(newValueMm) && newValueM >= 0 && newValueM <= maxValue) {
                    //console.log('Updating', config.offsetParam, 'to', maxValue - newValueM);
                    const rightBoundary = cabinet.boundaries.rightBoundary - config.maxSize / 2;
                    cabinet[config.offsetParam] = rightBoundary + config.maxSize - newValueM - cabinet.width;
                    updateCabinetPosition(cabinet);
                    toLeftInput.value = Math.round(config.leftValue(cabinet) * 1000);
                    toRightInput.value = Math.round(config.rightValue(cabinet) * 1000);
                    updateDimensionsInputPosition(cabinet, cabinets);
                } else {
                    console.log('Invalid input:', newValueMm, 'Max:', maxValue);
                }
                requestRender();
                event.stopPropagation();
            }
        });
    }
    updateDimensionsInputPosition(cabinet, cabinets); // Исправляем вызов
}

function showFreestandingCabinetDimensions(cabinet, cabinets) {
    // Удаляем старые элементы, если они есть
    hideAllDimensionInputs(); // Используем общую функцию очистки

    if (countertopDepthInput) { countertopDepthInput.remove(); countertopDepthInput = null; }

    if (cabinet.type !== 'freestandingCabinet') {
        return;
    }
    
    const cabinetIndex = cabinets.findIndex(c => c.mesh?.uuid === cabinet.mesh.uuid); // Находим индекс по UUID
    if (cabinetIndex === -1) {
        console.error("showCabinetDimensionsInput: Не найден индекс для шкафа", cabinet.mesh.uuid);
        return;
    }
    const isCurrentlyDetailed = cabinet.isDetailed; // Запоминаем исходное состояние

    // Поле ширины
    widthInput = document.createElement('input');
    widthInput.type = 'text';
    widthInput.className = 'dimension-input';
    widthInput.value = Math.round(cabinet.width * 1000);
    renderer.domElement.parentNode.appendChild(widthInput);
    attachExpressionValidator(widthInput);
    widthInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            const newWidthMm = parseFloat(widthInput.value);
            if (!isNaN(newWidthMm) && newWidthMm >= 12) {
                if (isCurrentlyDetailed) {
                    console.log(" - Переключаем на простой...");
                    toggleCabinetDetail(cabinetIndex); // -> Простой вид
                    // Обновляем данные шкафа (теперь cabinet.mesh - это простой куб)
                    cabinets[cabinetIndex].width = newWidthMm / 1000;
                     console.log(" - Обновляем геометрию простого...");
                    if(cabinets[cabinetIndex].mesh.geometry) cabinets[cabinetIndex].mesh.geometry.dispose();
                    cabinets[cabinetIndex].mesh.geometry = new THREE.BoxGeometry(cabinets[cabinetIndex].width, cabinets[cabinetIndex].height, cabinets[cabinetIndex].depth);
                    if(cabinets[cabinetIndex].edges?.geometry) { cabinets[cabinetIndex].edges.geometry.dispose(); cabinets[cabinetIndex].edges.geometry = new THREE.EdgesGeometry(cabinets[cabinetIndex].mesh.geometry); }
                    updateCabinetPosition(cabinets[cabinetIndex]); // Обновляем позицию простого
                     console.log(" - Переключаем обратно на детализацию...");
                    toggleCabinetDetail(cabinetIndex); // -> Детализированный вид с новыми размерами
                    updateDimensionsInputPosition(cabinet, cabinets);
                } else {
                    cabinet.width = newWidthMm / 1000;
                    cabinet.mesh.geometry.dispose();
                    cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
                    cabinet.edges.geometry.dispose();
                    cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
                    widthInput.value = Math.round(cabinet.width * 1000);
                    updateCabinetPosition(cabinet);
                    updateDimensionsInputPosition(cabinet, cabinets);
                }
            } else {
                widthInput.value = Math.round(cabinets[cabinetIndex].width * 1000); // Восстанавливаем старое значение
            }
            requestRender();
            event.stopPropagation();
        }
    });

    // Поле глубины
    depthInput = document.createElement('input');
    depthInput.type = 'text';
    depthInput.className = 'dimension-input';
    depthInput.value = Math.round(cabinet.depth * 1000);
    renderer.domElement.parentNode.appendChild(depthInput);
    attachExpressionValidator(depthInput);
    depthInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            const newDepthMm = parseFloat(depthInput.value);
            if (!isNaN(newDepthMm) && newDepthMm >= 12) {
                // --- НАЧАЛО Логики с детализацией ---
                if (isCurrentlyDetailed) {
                    console.log(" - Переключаем на простой...");
                    toggleCabinetDetail(cabinetIndex);
                    cabinets[cabinetIndex].depth = newDepthMm / 1000;
                    // Пересчет отступа от стены для нижних
                    if (cabinets[cabinetIndex].type === 'lowerCabinet') {
                        cabinets[cabinetIndex].offsetFromParentWall = calculateLowerCabinetOffset(cabinets[cabinetIndex]);
                    }
                    console.log(" - Обновляем геометрию простого...");
                    if(cabinets[cabinetIndex].mesh.geometry) cabinets[cabinetIndex].mesh.geometry.dispose();
                    cabinets[cabinetIndex].mesh.geometry = new THREE.BoxGeometry(cabinets[cabinetIndex].width, cabinets[cabinetIndex].height, cabinets[cabinetIndex].depth);
                    if(cabinets[cabinetIndex].edges?.geometry) { cabinets[cabinetIndex].edges.geometry.dispose(); cabinets[cabinetIndex].edges.geometry = new THREE.EdgesGeometry(cabinets[cabinetIndex].mesh.geometry); }
                    updateCabinetPosition(cabinets[cabinetIndex]);
                    console.log(" - Переключаем обратно на детализацию...");
                    toggleCabinetDetail(cabinetIndex);
                    updateDimensionsInputPosition(cabinet, cabinets);
                } else {
                    cabinet.depth = newDepthMm / 1000;
                    cabinet.mesh.geometry.dispose();
                    cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
                    cabinet.edges.geometry.dispose();
                    cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
                    depthInput.value = Math.round(cabinet.depth * 1000);
                    updateCabinetPosition(cabinet);
                    updateDimensionsInputPosition(cabinet, cabinets);
                }
            }
            requestRender();
            event.stopPropagation();
        } else {
            // Восстанавливаем старое значение при невалидном вводе
            console.warn("Invalid depth entered, reverting.");
            depthInput.value = Math.round(cabinet.depth * 1000);
       }
    });

    // Поле высоты
    heightInput = document.createElement('input');
    heightInput.type = 'text';
    heightInput.className = 'dimension-input';
    heightInput.value = Math.round(cabinet.height * 1000);
    heightInput.readOnly = !cabinet.isHeightIndependent;
    renderer.domElement.parentNode.appendChild(heightInput);
    if (cabinet.isHeightIndependent) {
        attachExpressionValidator(heightInput);
        heightInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                const newHeightMm = parseFloat(heightInput.value);
                if (!isNaN(newHeightMm) && newHeightMm >= 100) {
                    // --- НАЧАЛО Логики с детализацией ---
                    if (isCurrentlyDetailed) {
                        console.log("Изменение высоты (детализированный):");
                        console.log(" - Переключаем на простой...");
                        toggleCabinetDetail(cabinetIndex); // -> Простой вид
                        // Обновляем высоту в данных шкафа (он теперь cabinet = cabinets[cabinetIndex])
                        cabinets[cabinetIndex].height = newHeightMm / 1000;
                        // Получаем ссылку на простой меш
                        const simpleMesh = cabinets[cabinetIndex].mesh;
                        if (simpleMesh && simpleMesh.isMesh && simpleMesh.geometry) { // Проверяем, что это меш и есть геометрия
                            simpleMesh.geometry.dispose();
                            simpleMesh.geometry = new THREE.BoxGeometry(cabinets[cabinetIndex].width, cabinets[cabinetIndex].height, cabinets[cabinetIndex].depth);
                             // Обновляем ребра простого меша
                             if (cabinets[cabinetIndex].edges?.geometry) {
                                 cabinets[cabinetIndex].edges.geometry.dispose();
                                 cabinets[cabinetIndex].edges.geometry = new THREE.EdgesGeometry(simpleMesh.geometry);
                             }
                             updateCabinetPosition(cabinets[cabinetIndex]); // Обновляем позицию простого
                             console.log(" - Переключаем обратно на детализацию...");
                             toggleCabinetDetail(cabinetIndex); // -> Детализированный вид с новой высотой

                             // Обновляем значение в поле ввода после всех переключений
                             heightInput.value = Math.round(cabinets[cabinetIndex].height * 1000);
                             updateDimensionsInputPosition(cabinets[cabinetIndex], cabinets); // Обновляем позицию всех полей

                        } else {
                             console.error("Ошибка: не удалось получить простой меш после переключения для обновления высоты.");
                             // Попытка просто переключить обратно, если меша нет
                             toggleCabinetDetail(cabinetIndex);
                        }
                    } else {
                        cabinet.height = newHeightMm / 1000;
                        cabinet.mesh.geometry.dispose();
                        cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
                        cabinet.edges.geometry.dispose();
                        cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
                        heightInput.value = Math.round(cabinet.height * 1000);
                        updateCabinetPosition(cabinet);
                        updateDimensionsInputPosition(cabinet, cabinets);
                    }
                } else {
                    // Восстанавливаем старое значение при невалидном вводе
                     heightInput.value = Math.round(cabinets[cabinetIndex].height * 1000);
                }
                requestRender();
                event.stopPropagation();
            }
        });
    } else {
        heightInput.classList.add('readonly');
    }

    // Определяем ориентацию
    const rotationY = THREE.MathUtils.radToDeg(cabinet.mesh.rotation.y) % 360;
    const roomLength = currentLength; // X
    const roomHeight = currentHeight; // Z
    const x = cabinet.mesh.position.x;
    const y = cabinet.mesh.position.y;
    const z = cabinet.mesh.position.z;

    let widthLineStart, widthLineEnd, depthLineStart, depthLineEnd;
    let widthAxis, widthMaxSize, depthAxis, depthMaxSize;

    // Настройка линий и границ в зависимости от ориентации
    if (rotationY === 0) { // Back: Лицевая грань к Front
        widthAxis = 'x';
        widthMaxSize = roomLength;
        depthAxis = 'z';
        depthMaxSize = roomHeight;

        widthLineStart = new THREE.Vector3(-roomLength / 2, y + cabinet.height / 2, z + cabinet.depth / 2);
        widthLineEnd = new THREE.Vector3(roomLength / 2, y + cabinet.height / 2, z + cabinet.depth / 2);
        depthLineStart = new THREE.Vector3(x - cabinet.width / 2, y + cabinet.height / 2, -roomHeight / 2);
        depthLineEnd = new THREE.Vector3(x - cabinet.width / 2, y + cabinet.height / 2, roomHeight / 2);
    } else if (rotationY === 90 || rotationY === -270) { // Left: Лицевая грань к Right
        widthAxis = 'z';
        widthMaxSize = roomHeight;
        depthAxis = 'x';
        depthMaxSize = roomLength;

        widthLineStart = new THREE.Vector3(x + cabinet.depth / 2, y + cabinet.height / 2, -roomHeight / 2);
        widthLineEnd = new THREE.Vector3(x + cabinet.depth / 2, y + cabinet.height / 2, roomHeight / 2);
        depthLineStart = new THREE.Vector3(-roomLength / 2, y + cabinet.height / 2, z + cabinet.width / 2);
        depthLineEnd = new THREE.Vector3(roomLength / 2, y + cabinet.height / 2, z + cabinet.width / 2);
    } else if (rotationY === -90 || rotationY === 270) { // Right: Лицевая грань к Left
        widthAxis = 'z';
        widthMaxSize = roomHeight;
        depthAxis = 'x';
        depthMaxSize = roomLength;

        widthLineStart = new THREE.Vector3(x - cabinet.depth / 2, y + cabinet.height / 2, -roomHeight / 2);
        widthLineEnd = new THREE.Vector3(x - cabinet.depth / 2, y + cabinet.height / 2, roomHeight / 2);
        depthLineStart = new THREE.Vector3(-roomLength / 2, y + cabinet.height / 2, z - cabinet.width / 2);
        depthLineEnd = new THREE.Vector3(roomLength / 2, y + cabinet.height / 2, z - cabinet.width / 2);
    } else if (rotationY === 180 || rotationY === -180) { // Front: Лицевая грань к Back
        widthAxis = 'x';
        widthMaxSize = roomLength;
        depthAxis = 'z';
        depthMaxSize = roomHeight;

        widthLineStart = new THREE.Vector3(-roomLength / 2, y + cabinet.height / 2, z - cabinet.depth / 2);
        widthLineEnd = new THREE.Vector3(roomLength / 2, y + cabinet.height / 2, z - cabinet.depth / 2);
        depthLineStart = new THREE.Vector3(x + cabinet.width / 2, y + cabinet.height / 2, -roomHeight / 2);
        depthLineEnd = new THREE.Vector3(x + cabinet.width / 2, y + cabinet.height / 2, roomHeight / 2);
    }

    // Создаём линии
    distanceLine = createLine(widthLineStart, widthLineEnd);
    scene.add(distanceLine);
    distanceLineDepth = createLine(depthLineStart, depthLineEnd);
    scene.add(distanceLineDepth);

    // Поля расстояний
    toLeftInput = document.createElement('input');
    toLeftInput.type = 'text';
    toLeftInput.className = 'dimension-input';
    renderer.domElement.parentNode.appendChild(toLeftInput);
    attachExpressionValidator(toLeftInput);
    toLeftInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            const newValueMm = parseFloat(toLeftInput.value);
            const newValueM = newValueMm / 1000;
            const effectiveWidth = (rotationY === 0 || rotationY === 180) ? cabinet.width : cabinet.width; // Всегда ширина
            if (!isNaN(newValueMm) && newValueM >= 0 && newValueM <= widthMaxSize - effectiveWidth) {
                if (rotationY === 0 || rotationY === 180) cabinet.offsetX = newValueM;
                else cabinet.offsetZ = newValueM;
                updateCabinetPosition(cabinet);
                updateDimensionsInputPosition(cabinet, cabinets);
            }
            requestRender();
            event.stopPropagation();
        }
    });

    toRightInput = document.createElement('input');
    toRightInput.type = 'text';
    toRightInput.className = 'dimension-input';
    renderer.domElement.parentNode.appendChild(toRightInput);
    attachExpressionValidator(toRightInput);
    toRightInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            const newValueMm = parseFloat(toRightInput.value);
            const newValueM = newValueMm / 1000;
            const effectiveWidth = (rotationY === 0 || rotationY === 180) ? cabinet.width : cabinet.width; // Используем ширину
            if (!isNaN(newValueMm) && newValueM >= 0 && newValueM <= widthMaxSize - effectiveWidth) {
                if (rotationY === 0 || rotationY === 180) cabinet.offsetX = widthMaxSize - effectiveWidth - newValueM;
                else cabinet.offsetZ = widthMaxSize - effectiveWidth - newValueM;
                updateCabinetPosition(cabinet);
                updateDimensionsInputPosition(cabinet, cabinets);
            }
            requestRender();
            event.stopPropagation();
        }
    });

    toBackInput = document.createElement('input');
    toBackInput.type = 'text';
    toBackInput.className = 'dimension-input';
    renderer.domElement.parentNode.appendChild(toBackInput);
    attachExpressionValidator(toBackInput);
    toBackInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            const newValueMm = parseFloat(toBackInput.value);
            const newValueM = newValueMm / 1000;
            const effectiveDepth = (rotationY === 0 || rotationY === 180) ? cabinet.depth : cabinet.depth; // Используем глубину
            if (!isNaN(newValueMm) && newValueM >= 0 && newValueM <= depthMaxSize - effectiveDepth) {
                if (rotationY === 0 || rotationY === 180) cabinet.offsetZ = newValueM;
                else cabinet.offsetX = newValueM;
                updateCabinetPosition(cabinet);
                updateDimensionsInputPosition(cabinet, cabinets);
            }
            requestRender();
            event.stopPropagation();
        }
    });

    toFrontInput = document.createElement('input');
    toFrontInput.type = 'text';
    toFrontInput.className = 'dimension-input';
    renderer.domElement.parentNode.appendChild(toFrontInput);
    attachExpressionValidator(toFrontInput);
    toFrontInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            const newValueMm = parseFloat(toFrontInput.value);
            const newValueM = newValueMm / 1000;
            const effectiveDepth = (rotationY === 0 || rotationY === 180) ? cabinet.depth : cabinet.depth; // Используем глубину
            if (!isNaN(newValueMm) && newValueM >= 0 && newValueM <= depthMaxSize - effectiveDepth) {
                if (rotationY === 0 || rotationY === 180) cabinet.offsetZ = depthMaxSize - effectiveDepth - newValueM;
                else cabinet.offsetX = depthMaxSize - effectiveDepth - newValueM;
                updateCabinetPosition(cabinet);
                updateDimensionsInputPosition(cabinet, cabinets);
            }
            requestRender();
            event.stopPropagation();
        }
    });

    updateDimensionsInputPosition(cabinet, cabinets);
}

// Функция для обновления позиции полей
function updateDimensionsInputPosition(cabinet, cabinets) {
    const canvasRect = renderer.domElement.getBoundingClientRect();
    const x = cabinet.mesh.position.x;
    const y = cabinet.mesh.position.y;
    const z = cabinet.mesh.position.z;
    const roomLength = currentLength;
    const roomHeight = currentHeight;
    //console.log('x:', x); // Проверяем, получаем ли config

    if (widthInput) {
        const widthStart = new THREE.Vector3(-cabinet.width / 2, cabinet.height / 2, cabinet.depth / 2);
        const widthEnd = new THREE.Vector3(cabinet.width / 2, cabinet.height / 2, cabinet.depth / 2);
        widthStart.applyMatrix4(cabinet.mesh.matrixWorld);
        widthEnd.applyMatrix4(cabinet.mesh.matrixWorld);
        const widthCenter = widthStart.clone().lerp(widthEnd, 0.5);
        widthCenter.project(activeCamera);

        const screenX = (widthCenter.x + 1) * canvasRect.width / 2 + canvasRect.left;
        const screenY = (-widthCenter.y + 1) * canvasRect.height / 2 + canvasRect.top;
        const finalX = screenX - canvasRect.left;
        const finalY = screenY - canvasRect.top;

        widthInput.style.left = `${finalX - widthInput.offsetWidth / 2}px`;
        widthInput.style.top = `${finalY - widthInput.offsetHeight / 2}px`;
    }

    if (depthInput) {
        const depthStart = new THREE.Vector3(cabinet.width / 2, cabinet.height / 2, -cabinet.depth / 2);
        const depthEnd = new THREE.Vector3(cabinet.width / 2, cabinet.height / 2, cabinet.depth / 2);
        depthStart.applyMatrix4(cabinet.mesh.matrixWorld);
        depthEnd.applyMatrix4(cabinet.mesh.matrixWorld);
        const depthCenter = depthStart.clone().lerp(depthEnd, 0.5);
        depthCenter.project(activeCamera);

        const screenX = (depthCenter.x + 1) * canvasRect.width / 2 + canvasRect.left;
        const screenY = (-depthCenter.y + 1) * canvasRect.height / 2 + canvasRect.top;
        const finalX = screenX - canvasRect.left;
        const finalY = screenY - canvasRect.top;

        depthInput.style.left = `${finalX - depthInput.offsetWidth / 2}px`;
        depthInput.style.top = `${finalY - depthInput.offsetHeight / 2}px`;
    }

    if (heightInput) {
        const heightStart = new THREE.Vector3(cabinet.width / 2, cabinet.height / 2, cabinet.depth / 2);
        const heightEnd = new THREE.Vector3(cabinet.width / 2, -cabinet.height / 2, cabinet.depth / 2);
        heightStart.applyMatrix4(cabinet.mesh.matrixWorld);
        heightEnd.applyMatrix4(cabinet.mesh.matrixWorld);
        const heightCenter = heightStart.clone().lerp(heightEnd, 0.5);
        heightCenter.project(activeCamera);
        const screenX = (heightCenter.x + 1) * canvasRect.width / 2 + canvasRect.left;
        const screenY = (-heightCenter.y + 1) * canvasRect.height / 2 + canvasRect.top;
        const finalX = screenX - canvasRect.left;
        const finalY = screenY - canvasRect.top;
        heightInput.style.left = `${finalX - heightInput.offsetWidth / 2}px`;
        heightInput.style.top = `${finalY - heightInput.offsetHeight / 2}px`;
    }

    if (cabinet.type === 'freestandingCabinet') {
        const rotationY = THREE.MathUtils.radToDeg(cabinet.mesh.rotation.y) % 360;
        const isAlongX = (rotationY === 0 || rotationY === 180); // Back или Front

        let toLeftPos, toRightPos, toBackPos, toFrontPos;
        let effectiveWidth, effectiveDepth;
        let widthLineStart, widthLineEnd, depthLineStart, depthLineEnd;

        if (rotationY === 0) { // Back: Лицевая грань к Front
            effectiveWidth = cabinet.width;
            effectiveDepth = cabinet.depth;

            toLeftPos = new THREE.Vector3(-cabinet.width / 2 - cabinet.offsetX / 2, cabinet.height / 2, cabinet.depth / 2);
            toRightPos = new THREE.Vector3(cabinet.width / 2 + (roomLength - cabinet.width - cabinet.offsetX) / 2, cabinet.height / 2, cabinet.depth / 2);
            toBackPos = new THREE.Vector3(-cabinet.width / 2, cabinet.height / 2, -cabinet.depth / 2 - cabinet.offsetZ / 2);
            toFrontPos = new THREE.Vector3(-cabinet.width / 2, cabinet.height / 2, cabinet.depth / 2 + (roomHeight - cabinet.depth - cabinet.offsetZ) / 2);
            
            widthLineStart = new THREE.Vector3(-roomLength / 2, y + cabinet.height / 2, z + cabinet.depth / 2);
            widthLineEnd = new THREE.Vector3(roomLength / 2, y + cabinet.height / 2, z + cabinet.depth / 2);
            depthLineStart = new THREE.Vector3(x - cabinet.width / 2, y + cabinet.height / 2, -roomHeight / 2);
            depthLineEnd = new THREE.Vector3(x - cabinet.width / 2, y + cabinet.height / 2, roomHeight / 2);

            if (toLeftInput) toLeftInput.value = Math.round(cabinet.offsetX * 1000);
            if (toRightInput) toRightInput.value = Math.round((roomLength - cabinet.offsetX - cabinet.width) * 1000);
            if (toBackInput) toBackInput.value = Math.round(cabinet.offsetZ * 1000);
            if (toFrontInput) toFrontInput.value = Math.round((roomHeight - cabinet.offsetZ - cabinet.depth) * 1000);

        } else if (rotationY === 90 || rotationY === -270) { // Left: Лицевая грань к Right
            toLeftPos = new THREE.Vector3(cabinet.width / 2 + cabinet.offsetZ / 2, cabinet.height / 2, cabinet.depth / 2);
            toRightPos = new THREE.Vector3(-cabinet.width / 2 - (roomHeight - cabinet.width - cabinet.offsetZ) / 2, cabinet.height / 2, cabinet.depth / 2);
            toBackPos = new THREE.Vector3(-cabinet.width / 2, cabinet.height / 2, -cabinet.depth / 2 - cabinet.offsetX / 2);
            toFrontPos = new THREE.Vector3(-cabinet.width / 2, cabinet.height / 2, cabinet.depth / 2 + (roomLength - cabinet.depth - cabinet.offsetX) / 2);

            widthLineStart = new THREE.Vector3(x + cabinet.depth / 2, y + cabinet.height / 2, -roomHeight / 2);
            widthLineEnd = new THREE.Vector3(x + cabinet.depth / 2, y + cabinet.height / 2, roomHeight / 2);
            depthLineStart = new THREE.Vector3(-roomLength / 2, y + cabinet.height / 2, z + cabinet.width / 2);
            depthLineEnd = new THREE.Vector3(roomLength / 2, y + cabinet.height / 2, z + cabinet.width / 2);

            if (toLeftInput) toLeftInput.value = Math.round(cabinet.offsetZ * 1000);
            if (toRightInput) toRightInput.value = Math.round((roomHeight - cabinet.offsetZ - cabinet.width) * 1000); // Используем width
            if (toBackInput) toBackInput.value = Math.round(cabinet.offsetX * 1000);
            if (toFrontInput) toFrontInput.value = Math.round((roomLength - cabinet.offsetX - cabinet.depth) * 1000); // Используем depth

        } else if (rotationY === -90 || rotationY === 270) { // Right: Лицевая грань к Left
            toLeftPos = new THREE.Vector3(-cabinet.width / 2 - cabinet.offsetZ / 2, cabinet.height / 2, cabinet.depth / 2 ); // Оставляем как есть
            toRightPos = new THREE.Vector3(cabinet.width / 2 + (roomHeight - cabinet.width - cabinet.offsetZ) / 2, cabinet.height / 2, cabinet.width / 2); // Оставляем как есть
            toBackPos = new THREE.Vector3(-cabinet.width / 2, cabinet.height / 2, cabinet.width / 2 + cabinet.offsetX / 2);
            toFrontPos = new THREE.Vector3(-cabinet.width / 2, cabinet.height / 2, -cabinet.depth / 2 - (roomLength - cabinet.depth - cabinet.offsetX) / 2);

            widthLineStart = new THREE.Vector3(x - cabinet.depth / 2, y + cabinet.height / 2, -roomHeight / 2);
            widthLineEnd = new THREE.Vector3(x - cabinet.depth / 2, y + cabinet.height / 2, roomHeight / 2);
            depthLineStart = new THREE.Vector3(-roomLength / 2, y + cabinet.height / 2, z - cabinet.width / 2);
            depthLineEnd = new THREE.Vector3(roomLength / 2, y + cabinet.height / 2, z - cabinet.width / 2);

            if (toLeftInput) toLeftInput.value = Math.round(cabinet.offsetZ * 1000);  // Используем width
            if (toRightInput) toRightInput.value = Math.round((roomHeight - cabinet.offsetZ - cabinet.width) * 1000);
            if (toBackInput) toBackInput.value = Math.round(cabinet.offsetX * 1000); // Используем depth
            if (toFrontInput) toFrontInput.value = Math.round((roomLength - cabinet.offsetX - cabinet.depth) * 1000); 

        } else if (rotationY === 180 || rotationY === -180) { // Front: Лицевая грань к Back
            toRightPos = new THREE.Vector3(-cabinet.width / 2 - (roomLength - cabinet.width - cabinet.offsetX) / 2, cabinet.height / 2, cabinet.depth / 2);
            toLeftPos  = new THREE.Vector3(cabinet.width / 2 + cabinet.offsetX / 2, cabinet.height / 2, cabinet.depth / 2);
            toBackPos = new THREE.Vector3(-cabinet.width / 2, cabinet.height / 2, cabinet.depth / 2 + cabinet.offsetZ / 2);
            toFrontPos = new THREE.Vector3(-cabinet.width / 2, cabinet.height / 2, -cabinet.depth / 2 - (roomHeight - cabinet.depth - cabinet.offsetZ) / 2);

            widthLineStart = new THREE.Vector3(-roomLength / 2, y + cabinet.height / 2, z - cabinet.depth / 2);
            widthLineEnd = new THREE.Vector3(roomLength / 2, y + cabinet.height / 2, z - cabinet.depth / 2);
            depthLineStart = new THREE.Vector3(x + cabinet.width / 2, y + cabinet.height / 2, -roomHeight / 2);
            depthLineEnd = new THREE.Vector3(x + cabinet.width / 2, y + cabinet.height / 2, roomHeight / 2);

            if (toLeftInput) toLeftInput.value = Math.round(cabinet.offsetX * 1000);
            if (toRightInput) toRightInput.value = Math.round((roomLength - cabinet.offsetX - cabinet.width) * 1000);
            if (toBackInput) toBackInput.value = Math.round(cabinet.offsetZ * 1000);
            if (toFrontInput) toFrontInput.value = Math.round((roomHeight - cabinet.offsetZ - cabinet.depth) * 1000);
        }

        // Обновляем геометрию линий
        if (distanceLine && widthLineStart && widthLineEnd) {
            const positions = new Float32Array([
                widthLineStart.x, widthLineStart.y, widthLineStart.z,
                widthLineEnd.x, widthLineEnd.y, widthLineEnd.z
            ]);
            distanceLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            distanceLine.geometry.attributes.position.needsUpdate = true;
        }

        if (distanceLineDepth && depthLineStart && depthLineEnd) {
            const positions = new Float32Array([
                depthLineStart.x, depthLineStart.y, depthLineStart.z,
                depthLineEnd.x, depthLineEnd.y, depthLineEnd.z
            ]);
            distanceLineDepth.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            distanceLineDepth.geometry.attributes.position.needsUpdate = true;
        }

        
        // Позиционирование полей
        if (toLeftInput) {
            toLeftPos.applyMatrix4(cabinet.mesh.matrixWorld);
            toLeftPos.project(activeCamera);
            const screenX = (toLeftPos.x + 1) * canvasRect.width / 2 + canvasRect.left;
            const screenY = (-toLeftPos.y + 1) * canvasRect.height / 2 + canvasRect.top;
            const finalX = screenX - canvasRect.left;
            const finalY = screenY - canvasRect.top;
            toLeftInput.style.left = `${finalX - toLeftInput.offsetWidth / 2}px`;
            toLeftInput.style.top = `${finalY - toLeftInput.offsetHeight / 2}px`;
        }
        if (toRightInput) {
            toRightPos.applyMatrix4(cabinet.mesh.matrixWorld);
            toRightPos.project(activeCamera);
            const screenX = (toRightPos.x + 1) * canvasRect.width / 2 + canvasRect.left;
            const screenY = (-toRightPos.y + 1) * canvasRect.height / 2 + canvasRect.top;
            const finalX = screenX - canvasRect.left;
            const finalY = screenY - canvasRect.top;
            toRightInput.style.left = `${finalX - toRightInput.offsetWidth / 2}px`;
            toRightInput.style.top = `${finalY - toRightInput.offsetHeight / 2}px`;
        }
        if (toBackInput) {
            toBackPos.applyMatrix4(cabinet.mesh.matrixWorld);
            toBackPos.project(activeCamera);
            const screenX = (toBackPos.x + 1) * canvasRect.width / 2 + canvasRect.left;
            const screenY = (-toBackPos.y + 1) * canvasRect.height / 2 + canvasRect.top;
            const finalX = screenX - canvasRect.left;
            const finalY = screenY - canvasRect.top;
            toBackInput.style.left = `${finalX - toBackInput.offsetWidth / 2}px`;
            toBackInput.style.top = `${finalY - toBackInput.offsetHeight / 2}px`;
        }
        if (toFrontInput) {
            toFrontPos.applyMatrix4(cabinet.mesh.matrixWorld);
            toFrontPos.project(activeCamera);
            const screenX = (toFrontPos.x + 1) * canvasRect.width / 2 + canvasRect.left;
            const screenY = (-toFrontPos.y + 1) * canvasRect.height / 2 + canvasRect.top;
            const finalX = screenX - canvasRect.left;
            const finalY = screenY - canvasRect.top;
            toFrontInput.style.left = `${finalX - toFrontInput.offsetWidth / 2}px`;
            toFrontInput.style.top = `${finalY - toFrontInput.offsetHeight / 2}px`;
        }

    } else {
        // Для нижних и верхних шкафов
        const config = getWallConfig(cabinet.wallId, cabinet, cabinets);
        if (config) {
            if (toLeftInput) {
                const leftPoint = config.leftPoint(cabinet);
                leftPoint.applyMatrix4(cube.matrixWorld);
                leftPoint.project(activeCamera);
                const screenX = (leftPoint.x + 1) * canvasRect.width / 2 + canvasRect.left;
                const screenY = (-leftPoint.y + 1) * canvasRect.height / 2 + canvasRect.top;
                const finalX = screenX - canvasRect.left;
                const finalY = screenY - canvasRect.top;
                toLeftInput.style.left = `${finalX - toLeftInput.offsetWidth / 2}px`;
                toLeftInput.style.top = `${finalY - toLeftInput.offsetHeight / 2}px`;
                if (document.activeElement !== toLeftInput) {
                    toLeftInput.value = Math.round(config.leftValue(cabinet) * 1000);
                }
            }

            if (toRightInput) {
                const rightPoint = config.rightPoint(cabinet);
                rightPoint.applyMatrix4(cube.matrixWorld);
                rightPoint.project(activeCamera);
                const screenX = (rightPoint.x + 1) * canvasRect.width / 2 + canvasRect.left;
                const screenY = (-rightPoint.y + 1) * canvasRect.height / 2 + canvasRect.top;
                const finalX = screenX - canvasRect.left;
                const finalY = screenY - canvasRect.top;
                toRightInput.style.left = `${finalX - toRightInput.offsetWidth / 2}px`;
                toRightInput.style.top = `${finalY - toRightInput.offsetHeight / 2}px`;
                if (document.activeElement !== toRightInput) {
                    toRightInput.value = Math.round(config.rightValue(cabinet) * 1000);
                }
            }
        }
    }
}



function findNearestObstacles(countertop, cabinets, countertops) {
    const { length, depth, thickness, wallId } = countertop.userData;
    const roomWidth = currentLength;
    const roomDepth = currentHeight;
    const step = 0.001;

    const originalPosition = countertop.position.clone();
    // --- Определяем ОСЬ ПОИСКА для основной столешницы ---
    const axis = (wallId === 'Back' || wallId === 'Front' || wallId === 'Bottom') ? 'x' : 'z'; // Учитываем и Bottom для оси X
    const maxSize = (axis === 'x') ? roomWidth : roomDepth;

    let countertopMin, countertopMax;
    // ... (Расчет countertopMin, countertopMax для основной столешницы - как раньше) ...
     if (wallId === 'Back' || wallId === 'Front') {
        countertopMin = new THREE.Vector3( originalPosition.x - length / 2, originalPosition.y - thickness / 2, originalPosition.z - depth / 2 );
        countertopMax = new THREE.Vector3( originalPosition.x + length / 2, originalPosition.y + thickness / 2, originalPosition.z + depth / 2 );
     } else if (wallId === 'Left' || wallId === 'Right') {
        countertopMin = new THREE.Vector3( originalPosition.x - depth / 2, originalPosition.y - thickness / 2, originalPosition.z - length / 2 );
        countertopMax = new THREE.Vector3( originalPosition.x + depth / 2, originalPosition.y + thickness / 2, originalPosition.z + length / 2 );
     } else { // Bottom (Freestanding) - предполагаем, что "длина" вдоль X при rotation=0
         const rotY = countertop.rotation.y;
         const actualLength = (Math.abs(rotY) < 0.1 || Math.abs(Math.abs(rotY) - Math.PI) < 0.1) ? length : depth;
         const actualDepth  = (Math.abs(rotY) < 0.1 || Math.abs(Math.abs(rotY) - Math.PI) < 0.1) ? depth : length;
         countertopMin = new THREE.Vector3( originalPosition.x - actualLength / 2, originalPosition.y - thickness / 2, originalPosition.z - actualDepth / 2 );
         countertopMax = new THREE.Vector3( originalPosition.x + actualLength / 2, originalPosition.y + thickness / 2, originalPosition.z + actualDepth / 2 );
     }


    const otherCountertops = (countertops || []).filter(ct => ct !== countertop);
    const allCabinetsData = cabinets || [];

    // --- Функция для получения Bounding Box препятствия (МОДИФИЦИРОВАНА) ---
    const getObstacleBounds = (obstacleDataOrMesh) => {
        let obsMin, obsMax, obsPos, obsRotY;
        let obsWidthWorldX, obsWidthWorldZ; // Размеры препятствия вдоль МИРОВЫХ осей X и Z
        let obsHeight;

        if (obstacleDataOrMesh.userData?.type === 'countertop') {
            const ct = obstacleDataOrMesh;
            obsPos = ct.position.clone();
            obsRotY = ct.rotation?.y || 0;
            obsHeight = ct.userData.thickness || thickness;
            const ctLength = ct.userData.length;
            const ctDepth = ct.userData.depth;
            const ctWallId = ct.userData.wallId;

            // --- ИЗМЕНЕНИЕ: Определяем размеры вдоль мировых осей ---
            if (ctWallId === 'Back' || ctWallId === 'Front' || (ctWallId === 'Bottom' && (Math.abs(obsRotY) < 0.1 || Math.abs(Math.abs(obsRotY) - Math.PI) < 0.1))) {
                // Длина столешницы идет по X, глубина по Z
                obsWidthWorldX = ctLength;
                obsWidthWorldZ = ctDepth;
            } else { // Left, Right или повернутая Bottom
                // Длина столешницы идет по Z, глубина по X
                obsWidthWorldX = ctDepth;
                obsWidthWorldZ = ctLength;
            }
            // --- КОНЕЦ ИЗМЕНЕНИЯ ---

        } else { // Шкаф
            const cabinetData = obstacleDataOrMesh;
            if (!cabinetData || !cabinetData.mesh) return null;
            obsPos = cabinetData.mesh.position.clone();
            obsRotY = cabinetData.mesh.rotation?.y || 0;
            obsHeight = cabinetData.height;
            const cabWidth = cabinetData.width;
            const cabDepth = cabinetData.depth;

            // --- ИЗМЕНЕНИЕ: Определяем размеры вдоль мировых осей ---
            if (Math.abs(obsRotY) < 0.1 || Math.abs(Math.abs(obsRotY) - Math.PI) < 0.1) {
                // Не повернут или 180: ширина шкафа по X, глубина по Z
                obsWidthWorldX = cabWidth;
                obsWidthWorldZ = cabDepth;
            } else { // Повернут на 90/-90
                // Ширина шкафа по Z, глубина по X
                obsWidthWorldX = cabDepth;
                obsWidthWorldZ = cabWidth;
            }
             // --- КОНЕЦ ИЗМЕНЕНИЯ ---
        }

        // Рассчитываем Min/Max на основе размеров вдоль МИРОВЫХ осей
        obsMin = new THREE.Vector3( obsPos.x - obsWidthWorldX / 2, obsPos.y - obsHeight / 2, obsPos.z - obsWidthWorldZ / 2 );
        obsMax = new THREE.Vector3( obsPos.x + obsWidthWorldX / 2, obsPos.y + obsHeight / 2, obsPos.z + obsWidthWorldZ / 2 );

        return { min: obsMin, max: obsMax };
    };
    // --- КОНЕЦ: Функция для получения Bounding Box препятствия ---

    let leftBoundary = -maxSize / 2;
    let rightBoundary = maxSize / 2;

    // --- Поиск препятствий СПРАВА ---
    let testPositionRight = originalPosition.clone();
    let testMinRight = countertopMin.clone();
    let testMaxRight = countertopMax.clone();
    while (testPositionRight[axis] < maxSize / 2) { // Используем axis
        testPositionRight[axis] += step;
        testMinRight[axis] += step;
        testMaxRight[axis] += step;
        let intersectionFoundRight = false;

        // Проверяем другие столешницы и шкафы
        const obstacles = [...otherCountertops, ...allCabinetsData];
        for (const obstacle of obstacles) {
            // Пропускаем шкафы под столешницей (для стенных столешниц)
            if (wallId !== 'Bottom' && obstacle.type && obstacle.type.includes('Cabinet')) {
                 if (obstacle.mesh && (obstacle.mesh.position.y + obstacle.height / 2) < countertopMin.y) {
                      continue;
                 }
            }

            const bounds = getObstacleBounds(obstacle);
            if (!bounds) continue;
            const { min: obsMin, max: obsMax } = bounds;

            // Проверка пересечения (ось Y + основные оси)
            const epsilon = 0.0001;
            const intersectsY = testMaxRight.y > obsMin.y + epsilon && testMinRight.y < obsMax.y - epsilon;
            if (!intersectsY) continue;
            const intersectsX = testMaxRight.x > obsMin.x + epsilon && testMinRight.x < obsMax.x - epsilon;
            const intersectsZ = testMaxRight.z > obsMin.z + epsilon && testMinRight.z < obsMax.z - epsilon;

            if (intersectsX && intersectsZ) {
                // Граница - это МИНИМАЛЬНАЯ координата препятствия по оси ПОИСКА (axis)
                rightBoundary = obsMin[axis]; // Используем obsMin.x или obsMin.z
                intersectionFoundRight = true;
                // console.log(`[Right] Пересечение с ${obstacle.userData?.type || obstacle.type}, граница ${axis}=${rightBoundary.toFixed(3)}`);
                break;
            }
        }
        if (intersectionFoundRight) break;
    }

    // --- Поиск препятствий СЛЕВА ---
    let testPositionLeft = originalPosition.clone();
    let testMinLeft = countertopMin.clone();
    let testMaxLeft = countertopMax.clone();
    while (testPositionLeft[axis] > -maxSize / 2) { // Используем axis
         testPositionLeft[axis] -= step;
         testMinLeft[axis] -= step;
         testMaxLeft[axis] -= step;
         let intersectionFoundLeft = false;

         const obstacles = [...otherCountertops, ...allCabinetsData];
         for (const obstacle of obstacles) {
             // Пропускаем шкафы под столешницей
             if (wallId !== 'Bottom' && obstacle.type && obstacle.type.includes('Cabinet')) {
                  if (obstacle.mesh && (obstacle.mesh.position.y + obstacle.height / 2) < countertopMin.y) {
                       continue;
                  }
             }

             const bounds = getObstacleBounds(obstacle);
             if (!bounds) continue;
             const { min: obsMin, max: obsMax } = bounds;

             const epsilon = 0.0001;
             const intersectsY = testMaxLeft.y > obsMin.y + epsilon && testMinLeft.y < obsMax.y - epsilon;
             if (!intersectsY) continue;
             const intersectsX = testMaxLeft.x > obsMin.x + epsilon && testMinLeft.x < obsMax.x - epsilon;
             const intersectsZ = testMaxLeft.z > obsMin.z + epsilon && testMinLeft.z < obsMax.z - epsilon;

             if (intersectsX && intersectsZ) {
                 // Граница - это МАКСИМАЛЬНАЯ координата препятствия по оси ПОИСКА (axis)
                 leftBoundary = obsMax[axis]; // Используем obsMax.x или obsMax.z
                 intersectionFoundLeft = true;
                 // console.log(`[Left] Пересечение с ${obstacle.userData?.type || obstacle.type}, граница ${axis}=${leftBoundary.toFixed(3)}`);
                 break;
             }
         }
         if (intersectionFoundLeft) break;
    }

    //console.log(`Найдены границы для столешницы ${countertop.uuid}: Ось=${axis}, Left=${leftBoundary.toFixed(3)}, Right=${rightBoundary.toFixed(3)}`);
    return { leftBoundary, rightBoundary };
}


let countertopWidthInput, /*toLeftInput, toRightInput,*/ countertopDepthInput;
let leftBoundaryGlobal, rightBoundaryGlobal;

/**
 * Диспетчер: вызывает соответствующую функцию для отображения размеров
 * в зависимости от типа выделенной столешницы.
 * @param {THREE.Mesh} countertop - Меш выделенной столешницы.
 * @param {Array} countertops - Массив всех столешниц.
 * @param {Array} cabinets - Массив всех шкафов.
 */
function showCountertopDimensionsInput(countertop, countertops, cabinets) {
    // --- 1. Очистка старых элементов ---
    if (!countertop || !countertop.userData) {
        console.error("showCDI Dispatcher: Invalid countertop!");
        // Скрываем ВСЕ возможные поля на всякий случай
         hideAllDimensionInputs(); // Создай такую функцию, если нужно
        return;
    }
    const wallId = countertop.userData.wallId;
    console.log(`Dispatching dimension inputs for wallId: ${wallId}`);

    // Скрываем/удаляем старые элементы ввода/линии
    hideAllDimensionInputs(); // Используем общую функцию очистки

    // --- 2. Вызов специфичной функции ---
    if (wallId === 'Bottom') {
        showFreestandingCountertopDimensions(countertop, countertops, cabinets);
    } else if (['Back', 'Front', 'Left', 'Right'].includes(wallId)) {
        showWallCountertopDimensions(countertop, countertops, cabinets);
    } else {
        console.warn(`showCDI Dispatcher: Unknown wallId "${wallId}"`);
    }
}

/** Вспомогательная функция для скрытия всех полей ввода размеров и линий */
function hideAllDimensionInputs() {
    if (widthInput) widthInput.remove(); widthInput = null;
    if (toLeftInput) toLeftInput.remove(); toLeftInput = null;
    if (toRightInput) toRightInput.remove(); toRightInput = null;
    if (countertopDepthInput) countertopDepthInput.remove(); countertopDepthInput = null;
    if (distanceLine) { if(distanceLine.parent) distanceLine.parent.remove(distanceLine); distanceLine.geometry.dispose(); distanceLine.material.dispose(); distanceLine = null; }
    if (depthInput) depthInput.remove(); depthInput = null;
    if (heightInput) heightInput.remove(); heightInput = null;
    if (distanceLineDepth) { if(distanceLineDepth.parent) distanceLineDepth.parent.remove(distanceLineDepth); distanceLineDepth.geometry.dispose(); distanceLineDepth.material.dispose(); distanceLineDepth = null; }
    // Добавь сюда другие поля, если они есть
    if (distanceLineDepth) { scene.remove(distanceLineDepth); distanceLineDepth.geometry.dispose(); distanceLineDepth = null; }
    if (toFrontInput) { toFrontInput.remove(); toFrontInput = null; }
    if (toBackInput) { toBackInput.remove(); toBackInput = null; }
    if (lengthDisplayWall) { lengthDisplayWall.remove(); lengthDisplayWall = null; }
    if (countertopDepthInput) { countertopDepthInput.remove(); countertopDepthInput = null; }
}

let lengthDisplayWall = null;
let lengthDisplayFree = null;
/**
 * Показывает и настраивает поля ввода размеров для СТЕННОЙ столешницы.
 */
function showWallCountertopDimensions(countertop, countertops, cabinets) {
    const { length, depth, thickness, wallId } = countertop.userData;
    const lengthMM = Math.round(length * 1000);
    const roomWidth = currentLength; // X size
    const roomDepth = currentHeight; // Z size
    const parentDiv = renderer.domElement.parentNode;
    let leftBoundary, rightBoundary, leftDistanceMm, rightDistanceMm;
    let axisIsX = false;
    let boundariesValid = true;

    console.log("Showing dimensions for WALL countertop");

    // --- 1. Определяем границы (ПРЕПЯТСТВИЯ) и расстояния ---
    try {
        ({ leftBoundary, rightBoundary } = findNearestObstacles(countertop, cabinets, countertops));
        if (wallId === 'Back' || wallId === 'Front') { axisIsX = true; } else { axisIsX = false; }
        // Рассчитываем начальные расстояния
        const ctPos = countertop.position;
        if (axisIsX) {
            leftDistanceMm = ((ctPos.x - length / 2) - leftBoundary) * 1000;
            rightDistanceMm = (rightBoundary - (ctPos.x + length / 2)) * 1000;
        } else {
            leftDistanceMm = ((ctPos.z - length / 2) - leftBoundary) * 1000;
            rightDistanceMm = (rightBoundary - (ctPos.z + length / 2)) * 1000;
        }
        if (typeof leftBoundary !== 'number' || typeof rightBoundary !== 'number') boundariesValid = false;
    } catch (error) { boundariesValid = false; console.error("Error calculating wall boundaries/distances:", error); }

    // --- 2. Поле ГЛУБИНЫ (Редактируемое) ---
    countertopDepthInput = document.createElement('input');
    // ... (Настройка countertopDepthInput как раньше) ...
    countertopDepthInput.type = 'text';
    countertopDepthInput.value = (depth * 1000).toFixed(0);
    countertopDepthInput.className = 'dimension-input dimension-input-depth';
    countertopDepthInput.dataset.min = 100;
    parentDiv.appendChild(countertopDepthInput);
    attachExpressionValidator(countertopDepthInput);
    countertopDepthInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            // ... (Логика обработчика глубины - вызывает updateDepthForWall) ...
            const newDepthMm = parseFloat(countertopDepthInput.value);
            if (!isNaN(newDepthMm) && newDepthMm >= 100) {
                const newDepthM = newDepthMm / 1000;
                if (Math.abs(countertop.userData.depth - newDepthM) > 1e-5) {
                    updateDepthForWall(wallId, newDepthM); // wallId здесь точно не 'Bottom'
                }
                countertopDepthInput.value = Math.round(countertop.userData.depth * 1000);
                // Пересчитываем границы и позиционируем поля
                let lb, rb; try{ ({leftBoundary: lb, rightBoundary: rb} = findNearestObstacles(countertop, cabinets, countertops)); } catch(e){lb=undefined; rb=undefined;}
                updateWallCountertopDimensionsPosition(countertop, lb, rb); // Вызываем позиционер для стенных
            } else { countertopDepthInput.value = Math.round(countertop.userData.depth * 1000); }
            requestRender();
            event.stopPropagation();
        }
    });


    // --- 3. Поля РАССТОЯНИЙ (Редактируемые, если границы найдены) ---
    if (boundariesValid) {
        // Поле слева
        toLeftInput = document.createElement('input');
        // ... (Настройка toLeftInput как раньше) ...
        toLeftInput.type = 'text';
        toLeftInput.value = Math.round(leftDistanceMm);
        toLeftInput.className = 'dimension-input dimension-input-left';
        parentDiv.appendChild(toLeftInput);
        attachExpressionValidator(toLeftInput);
        toLeftInput.addEventListener('keydown', (event) => {
            // ... (ПОЛНЫЙ обработчик для toLeftInput для СТЕННЫХ столешниц) ...
            // Он должен менять length, offsetAlongWall, position, geometry, texture,
            // обновлять ОБА поля (toLeft, toRight), обновлять distanceLine
            // и вызывать updateWallCountertopDimensionsPosition(countertop, finalLB, finalRB)
             if (event.key === 'Enter') {
                const newDistanceMm = parseFloat(toLeftInput.value);
                const newDistanceM = newDistanceMm / 1000;
                const currentLength = countertop.userData.length;
                const currentThickness = countertop.userData.thickness;
                const currentDepth = countertop.userData.depth;
                let currentLB, currentRB, currentAxisIsX = axisIsX;
                 try { ({ leftBoundary: currentLB, rightBoundary: currentRB } = findNearestObstacles(countertop, cabinets, countertops)); }
                 catch(e) { console.error("Error getting boundaries on Left input enter", e); return; }

                if (!isNaN(newDistanceMm)) {
                    let oldLeftEdge = currentAxisIsX ? countertop.position.x - currentLength / 2 : countertop.position.z - currentLength / 2;
                    const newLeftEdge = currentLB + newDistanceM;
                    const newLength = currentLength + (oldLeftEdge - newLeftEdge);
                    if (newLength >= 0.1) {
                        countertop.userData.length = newLength;
                        let wallStartX = currentAxisIsX ? -roomWidth / 2 : -roomDepth / 2;
                        let newOffsetAlongWall = newLeftEdge - wallStartX;
                        countertop.userData.offsetAlongWall = Math.max(0, newOffsetAlongWall);
                        countertop.geometry.dispose();
                        countertop.geometry = new THREE.BoxGeometry(newLength, currentThickness, currentDepth);
                        const shift = (oldLeftEdge - newLeftEdge) / 2;
                        if (currentAxisIsX) { countertop.position.x -= shift; } else { countertop.position.z -= shift; }
                        if (countertop.userData.edges) { // Проверяем, есть ли вообще ребра у этого объекта
                            countertop.userData.edges.geometry.dispose(); // Освобождаем память от старой геометрии ребер
                            // Создаем НОВУЮ геометрию ребер на основе НОВОЙ геометрии столешницы
                            countertop.userData.edges.geometry = new THREE.EdgesGeometry(countertop.geometry);
                        } else {
                            console.warn("Could not update edges geometry: edges not found in userData for countertop:", countertop.uuid);
                        }
                        updateTextureScale(countertop);
                        let finalLB, finalRB;
                        try{ ({ leftBoundary: finalLB, rightBoundary: finalRB } = findNearestObstacles(countertop, cabinets, countertops)); }
                        catch(e){ finalLB = currentLB; finalRB = currentRB;}
                        let finalLeftEdge = currentAxisIsX ? countertop.position.x - newLength / 2 : countertop.position.z - newLength / 2;
                        let finalRightEdge = currentAxisIsX ? countertop.position.x + newLength / 2 : countertop.position.z + newLength / 2;
                        toLeftInput.value = Math.round((finalLeftEdge - finalLB) * 1000);
                        if (toRightInput) toRightInput.value = Math.round((finalRB - finalRightEdge) * 1000);
                        updateWallCountertopDimensionsPosition(countertop, finalLB, finalRB); // Вызываем позиционер для стенных
                        if (distanceLine) { /* ... обновить геометрию distanceLine */ }
                    } else { /* Малая длина */ }
                } else { /* Неверный ввод */ }
                requestRender();
                event.stopPropagation();
            }
        });

        // Поле справа
        toRightInput = document.createElement('input');
         // ... (Настройка toRightInput как раньше) ...
        toRightInput.type = 'text';
        toRightInput.value = Math.round(rightDistanceMm);
        toRightInput.className = 'dimension-input dimension-input-right';
        parentDiv.appendChild(toRightInput);
        attachExpressionValidator(toRightInput);
        toRightInput.addEventListener('keydown', (event) => {
             // ... (ПОЛНЫЙ обработчик для toRightInput для СТЕННЫХ столешниц) ...
             // Он должен менять length, position, geometry, texture,
             // обновлять ОБА поля (toLeft, toRight), обновлять distanceLine
             // и вызывать updateWallCountertopDimensionsPosition(countertop, finalLB, finalRB)
             if (event.key === 'Enter') {
                 const newDistanceMm = parseFloat(toRightInput.value);
                 const newDistanceM = newDistanceMm / 1000;
                 const currentLength = countertop.userData.length;
                 const currentThickness = countertop.userData.thickness;
                 const currentDepth = countertop.userData.depth;
                 let currentLB, currentRB; let currentAxisIsX = axisIsX;
                 try { ({ leftBoundary: currentLB, rightBoundary: currentRB } = findNearestObstacles(countertop, cabinets, countertops)); }
                 catch(e) { console.error("Error getting boundaries on Right input enter", e); return; }

                 if (!isNaN(newDistanceMm)) {
                     let oldRightEdge = currentAxisIsX ? countertop.position.x + currentLength / 2 : countertop.position.z + currentLength / 2;
                     const newRightEdge = currentRB - newDistanceM;
                     const newLength = currentLength + (newRightEdge - oldRightEdge);
                     if (newLength >= 0.1) {
                         countertop.userData.length = newLength;
                         // offsetAlongWall не меняется
                         countertop.geometry.dispose();
                         countertop.geometry = new THREE.BoxGeometry(newLength, currentThickness, currentDepth);
                         const shift = (newRightEdge - oldRightEdge) / 2;
                         if (currentAxisIsX) { countertop.position.x += shift; } else { countertop.position.z += shift; }
                         if (countertop.userData.edges) { // Проверяем, есть ли вообще ребра у этого объекта
                            countertop.userData.edges.geometry.dispose(); // Освобождаем память от старой геометрии ребер
                            // Создаем НОВУЮ геометрию ребер на основе НОВОЙ геометрии столешницы
                            countertop.userData.edges.geometry = new THREE.EdgesGeometry(countertop.geometry);
                        } else {
                            console.warn("Could not update edges geometry: edges not found in userData for countertop:", countertop.uuid);
                        }
                         updateTextureScale(countertop);
                         let finalLB, finalRB;
                         try{ ({ leftBoundary: finalLB, rightBoundary: finalRB } = findNearestObstacles(countertop, cabinets, countertops)); }
                         catch(e){ finalLB = currentLB; finalRB = currentRB; }
                         let finalLeftEdge = currentAxisIsX ? countertop.position.x - newLength / 2 : countertop.position.z - newLength / 2;
                         let finalRightEdge = currentAxisIsX ? countertop.position.x + newLength / 2 : countertop.position.z + newLength / 2;
                         if (toLeftInput) toLeftInput.value = Math.round((finalLeftEdge - finalLB) * 1000);
                         toRightInput.value = Math.round((finalRB - finalRightEdge) * 1000);
                         updateWallCountertopDimensionsPosition(countertop, finalLB, finalRB); // Вызываем позиционер для стенных
                         if (distanceLine) { /* ... обновить геометрию distanceLine ... */ }
                     } else { /* Малая длина */ }
                 } else { /* Неверный ввод */ }
                 requestRender();
                 event.stopPropagation();
            }
        });

        // --- Создаем РАЗМЕРНУЮ ЛИНИЮ (только для стенных) ---
        // Используем ТВОЮ СТАРУЮ ЛОГИКУ создания линии БЕЗ СМЕЩЕНИЯ
        const lineGeometry = new THREE.BufferGeometry();
        let vertices;
        const ctPosLine = countertop.position;
        const ctDepthLine = countertop.userData.depth;
        const ctThicknessLine = countertop.userData.thickness;
        const worldYLine = ctPosLine.y + ctThicknessLine / 2;
        // Используем leftBoundary / rightBoundary, определенные в начале
        if (axisIsX) {
            const lineZ = (wallId === 'Back') ? ctPosLine.z + ctDepthLine / 2 : ctPosLine.z - ctDepthLine / 2;
            vertices = new Float32Array([ leftBoundary, worldYLine, lineZ, rightBoundary, worldYLine, lineZ ]);
        } else {
            const lineX = (wallId === 'Left') ? ctPosLine.x + ctDepthLine / 2 : ctPosLine.x - ctDepthLine / 2;
            vertices = new Float32Array([ lineX, worldYLine, leftBoundary, lineX, worldYLine, rightBoundary ]);
        }
         if (vertices) {
             lineGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
             const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff });
             distanceLine = new THREE.Line(lineGeometry, lineMaterial);
             scene.add(distanceLine);
         }
    } // Конец if(boundariesValid)

    // НОВОЕ ПОЛЕ: ДЛИНА
    if (!lengthDisplayWall) {
        lengthDisplayWall = document.createElement('input');
        lengthDisplayWall.type = 'text';
        lengthDisplayWall.className = 'dimension-input readonly';
        lengthDisplayWall.readOnly = true;
        parentDiv.appendChild(lengthDisplayWall);
    }
    lengthDisplayWall.value = lengthMM;

    // Сохраняем границы
    countertop.userData.cachedLeftBoundary = leftBoundary;
    countertop.userData.cachedRightBoundary = rightBoundary;

    // --- 4. Первоначальное позиционирование полей ---
    updateWallCountertopDimensionsPosition(countertop, leftBoundary, rightBoundary); // Вызываем позиционер для стенных
}

/**
 * Показывает и настраивает поля ввода размеров для СВОБОДНО СТОЯЩЕЙ столешницы.
 */
function showFreestandingCountertopDimensions(countertop, countertops, cabinets) {
    const { length, depth, thickness, wallId } = countertop.userData; // wallId здесь 'Bottom'
    const roomWidth = currentLength; // X size
    const roomDepth = currentHeight; // Z size
    const parentDiv = renderer.domElement.parentNode;
    let leftBoundary, rightBoundary, leftDistanceMm, rightDistanceMm;
    let axisIsX = false; // Ось длины столешницы
    let boundariesValid = true;

    console.log("Showing dimensions for FREESTANDING countertop");

    // --- 1. Определяем границы (СТЕНЫ КОМНАТЫ) и расстояния ---
    try {
        const ctPos = countertop.position; const ctRotY = countertop.rotation.y;
        if (Math.abs(ctRotY) < 0.1 || Math.abs(Math.abs(ctRotY) - Math.PI) < 0.1) { // Длина вдоль X
             axisIsX = true; leftBoundary = -roomWidth / 2; rightBoundary = roomWidth / 2;
        } else { // Длина вдоль Z
             axisIsX = false; leftBoundary = -roomDepth / 2; rightBoundary = roomDepth / 2;
        }
        // Рассчитываем начальные расстояния до СТЕН
        if (axisIsX) {
            leftDistanceMm = ((ctPos.x - length / 2) - leftBoundary) * 1000;
            rightDistanceMm = (rightBoundary - (ctPos.x + length / 2)) * 1000;
        } else {
            leftDistanceMm = ((ctPos.z - length / 2) - leftBoundary) * 1000;
            rightDistanceMm = (rightBoundary - (ctPos.z + length / 2)) * 1000;
        }
         if (typeof leftBoundary !== 'number' || typeof rightBoundary !== 'number') boundariesValid = false;
    } catch (error) { boundariesValid = false; console.error("Error calculating freestanding boundaries/distances:", error); }


    // --- 2. Поле ГЛУБИНЫ (Редактируемое) ---
    countertopDepthInput = document.createElement('input');
    // ... (Настройка countertopDepthInput как раньше) ...
     countertopDepthInput.type = 'text';
     countertopDepthInput.value = (depth * 1000).toFixed(0);
     countertopDepthInput.className = 'dimension-input dimension-input-depth';
     countertopDepthInput.dataset.min = 100;
     parentDiv.appendChild(countertopDepthInput);
     attachExpressionValidator(countertopDepthInput);
    countertopDepthInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            // ... (Логика обработчика глубины ТОЛЬКО для FS) ...
             const newDepthMm = parseFloat(countertopDepthInput.value);
             if (!isNaN(newDepthMm) && newDepthMm >= 100) {
                 const newDepthM = newDepthMm / 1000;
                 const oldDepth = countertop.userData.depth;
                 if (Math.abs(oldDepth - newDepthM) > 1e-5) {
                     const depthChange = newDepthM - oldDepth;
                     const positionShift = depthChange / 2;
                     const backwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(countertop.quaternion);
                     countertop.position.addScaledVector(backwardDir, positionShift);
                     countertop.userData.depth = newDepthM;
                     countertop.geometry.dispose();
                     countertop.geometry = new THREE.BoxGeometry(countertop.userData.length, countertop.userData.thickness, newDepthM);
                     if (countertop.userData.edges) { // Проверяем, есть ли вообще ребра у этого объекта
                        countertop.userData.edges.geometry.dispose(); // Освобождаем память от старой геометрии ребер
                        // Создаем НОВУЮ геометрию ребер на основе НОВОЙ геометрии столешницы
                        countertop.userData.edges.geometry = new THREE.EdgesGeometry(countertop.geometry);
                    } else {
                        console.warn("Could not update edges geometry: edges not found in userData for countertop:", countertop.uuid);
                    }
                     updateTextureScale(countertop);
                 }
                 countertopDepthInput.value = Math.round(countertop.userData.depth * 1000);
                 // Пересчитываем границы стен и позиционируем поля
                  let lb, rb;
                  const ctPos = countertop.position; const ctRotY = countertop.rotation.y;
                  if (Math.abs(ctRotY) < 0.1 || Math.abs(Math.abs(ctRotY) - Math.PI) < 0.1) { lb = -roomWidth / 2; rb = roomWidth / 2; }
                  else { lb = -roomDepth / 2; rb = roomDepth / 2;}
                 updateFreestandingCountertopDimensionsPosition(countertop, lb, rb); // Вызов позиционера для FS
             } else { /* неверный ввод */ }
             requestRender();
             event.stopPropagation();
        }
    });

    // --- 3. Поля РАССТОЯНИЙ до СТЕН (Редактируемые, если границы валидны) ---
     if (boundariesValid) {
         // Поле слева
         toLeftInput = document.createElement('input');
         // ... (Настройка toLeftInput как раньше) ...
         toLeftInput.type = 'text';
         toLeftInput.value = Math.round(leftDistanceMm);
         toLeftInput.className = 'dimension-input dimension-input-left';
         parentDiv.appendChild(toLeftInput);
         attachExpressionValidator(toLeftInput);
         toLeftInput.addEventListener('keydown', (event) => {
             if (event.key === 'Enter') {
                 // ... (Логика обработчика для FS - меняет length, position) ...
                 const newDistanceMm = parseFloat(toLeftInput.value);
                 const newDistanceM = newDistanceMm / 1000;
                 const currentLength = countertop.userData.length;
                 const currentThickness = countertop.userData.thickness;
                 const currentDepth = countertop.userData.depth;
                 // Границы - это стены комнаты (leftBoundary, rightBoundary определены выше)
                 const currentLB = leftBoundary; const currentRB = rightBoundary;
                 let currentAxisIsX = axisIsX; // Ось длины

                 if (!isNaN(newDistanceMm)) {
                     let oldLeftEdge = currentAxisIsX ? countertop.position.x - currentLength / 2 : countertop.position.z - currentLength / 2;
                     const newLeftEdge = currentLB + newDistanceM;
                     const newLength = currentLength + (oldLeftEdge - newLeftEdge);
                     if (newLength >= 0.1) {
                         countertop.userData.length = newLength;
                         // offsetAlongWall не используется
                         countertop.geometry.dispose();
                         countertop.geometry = new THREE.BoxGeometry(newLength, currentThickness, currentDepth);
                         const shift = (oldLeftEdge - newLeftEdge) / 2;
                         if (currentAxisIsX) { countertop.position.x -= shift; } else { countertop.position.z -= shift; }
                         if (countertop.userData.edges) { // Проверяем, есть ли вообще ребра у этого объекта
                            countertop.userData.edges.geometry.dispose(); // Освобождаем память от старой геометрии ребер
                            // Создаем НОВУЮ геометрию ребер на основе НОВОЙ геометрии столешницы
                            countertop.userData.edges.geometry = new THREE.EdgesGeometry(countertop.geometry);
                        } else {
                            console.warn("Could not update edges geometry: edges not found in userData for countertop:", countertop.uuid);
                        }
                         updateTextureScale(countertop);
                         // Обновляем значения полей (границы стен не меняются)
                         let finalLeftEdge = currentAxisIsX ? countertop.position.x - newLength / 2 : countertop.position.z - newLength / 2;
                         let finalRightEdge = currentAxisIsX ? countertop.position.x + newLength / 2 : countertop.position.z + newLength / 2;
                         toLeftInput.value = Math.round((finalLeftEdge - currentLB) * 1000);
                         if (toRightInput) toRightInput.value = Math.round((currentRB - finalRightEdge) * 1000);
                         // Обновляем позицию полей
                         updateFreestandingCountertopDimensionsPosition(countertop, currentLB, currentRB); // Позиционер для FS
                     } else { /* Малая длина */ }
                 } else { /* Неверный ввод */ }
                 requestRender();
                 event.stopPropagation();
             }
         });

         // Поле справа
         toRightInput = document.createElement('input');
          // ... (Настройка toRightInput как раньше) ...
          toRightInput.type = 'text';
          toRightInput.value = Math.round(rightDistanceMm);
          toRightInput.className = 'dimension-input dimension-input-right';
          parentDiv.appendChild(toRightInput);
          attachExpressionValidator(toRightInput);
         toRightInput.addEventListener('keydown', (event) => {
              if (event.key === 'Enter') {
                 // ... (Логика обработчика для FS - меняет length, position) ...
                  const newDistanceMm = parseFloat(toRightInput.value);
                  const newDistanceM = newDistanceMm / 1000;
                  const currentLength = countertop.userData.length;
                  const currentThickness = countertop.userData.thickness;
                  const currentDepth = countertop.userData.depth;
                  const currentLB = leftBoundary; const currentRB = rightBoundary; // Стены
                  let currentAxisIsX = axisIsX;

                  if (!isNaN(newDistanceMm)) {
                      let oldRightEdge = currentAxisIsX ? countertop.position.x + currentLength / 2 : countertop.position.z + currentLength / 2;
                      const newRightEdge = currentRB - newDistanceM;
                      const newLength = currentLength + (newRightEdge - oldRightEdge);
                      if (newLength >= 0.1) {
                          countertop.userData.length = newLength;
                          countertop.geometry.dispose();
                          countertop.geometry = new THREE.BoxGeometry(newLength, currentThickness, currentDepth);
                          const shift = (newRightEdge - oldRightEdge) / 2;
                          if (currentAxisIsX) { countertop.position.x += shift; } else { countertop.position.z += shift; }
                          if (countertop.userData.edges) { // Проверяем, есть ли вообще ребра у этого объекта
                            countertop.userData.edges.geometry.dispose(); // Освобождаем память от старой геометрии ребер
                            // Создаем НОВУЮ геометрию ребер на основе НОВОЙ геометрии столешницы
                            countertop.userData.edges.geometry = new THREE.EdgesGeometry(countertop.geometry);
                            } else {
                                console.warn("Could not update edges geometry: edges not found in userData for countertop:", countertop.uuid);
                            }
                          updateTextureScale(countertop);
                          // Обновляем значения полей
                          let finalLeftEdge = currentAxisIsX ? countertop.position.x - newLength / 2 : countertop.position.z - newLength / 2;
                          let finalRightEdge = currentAxisIsX ? countertop.position.x + newLength / 2 : countertop.position.z + newLength / 2;
                          if (toLeftInput) toLeftInput.value = Math.round((finalLeftEdge - currentLB) * 1000);
                          toRightInput.value = Math.round((currentRB - finalRightEdge) * 1000);
                          // Обновляем позицию полей
                          updateFreestandingCountertopDimensionsPosition(countertop, currentLB, currentRB); // Позиционер для FS
                      } else { /* Малая длина */ }
                  } else { /* Неверный ввод */ }
                  requestRender();
                 event.stopPropagation();
             }
         });
     } // Конец if(boundariesValid)

     if (!lengthDisplayFree) {
        lengthDisplayFree = document.createElement('input');
        lengthDisplayFree.classList.add('dimension-input', 'readonly');
        lengthDisplayFree.type = 'text';
        lengthDisplayFree.readOnly = true;
        document.body.appendChild(lengthDisplayFree);
    }
    lengthDisplayFree.value = Math.round(countertop.userData.length * 1000).toString();
    

     // --- 4. Первоначальное позиционирование полей ---
     // Вызываем позиционер для FS, передавая границы стен
     updateFreestandingCountertopDimensionsPosition(countertop, leftBoundary, rightBoundary);
}

/**
 * Позиционирует поля ввода для СТЕННОЙ столешницы.
 * Использует ТВОЮ ОРИГИНАЛЬНУЮ логику расчета точек.
 * @param {THREE.Mesh} countertop
 * @param {number} currentLB - Левая/задняя граница (препятствие).
 * @param {number} currentRB - Правая/передняя граница (препятствие).
 */
function updateWallCountertopDimensionsPosition(countertop, currentLB1, currentRB1) {
    if (!countertop || !countertop.userData || !camera || !renderer || !renderer.domElement) return;
    const { length, depth, thickness, wallId} = countertop.userData;

    const currentLB = countertop.userData.cachedLeftBoundary;
    const currentRB = countertop.userData.cachedRightBoundary;

    if (typeof length !== 'number' || typeof depth !== 'number' || typeof thickness !== 'number') return;
    const canvasRect = renderer.domElement.getBoundingClientRect();
    const boundariesValid = typeof currentLB === 'number' && typeof currentRB === 'number';

    // Позиция поля глубины (твоя старая логика)
    if (countertopDepthInput) {
        try {
            const depthStartLocal = new THREE.Vector3(length / 2, thickness / 2, -depth / 2);
            const depthEndLocal = new THREE.Vector3(length / 2, thickness / 2, depth / 2);
            const depthCenterLocal = depthStartLocal.clone().lerp(depthEndLocal, 0.5);
            const depthCenterWorld = depthCenterLocal.applyMatrix4(countertop.matrixWorld);
            const depthCenterScreen = depthCenterWorld.project(activeCamera);
            // ... (расчет screenX/Y, finalX/Y) ...
            const screenX = (depthCenterScreen.x + 1) * canvasRect.width / 2 + canvasRect.left;
            //console.log('для глубины screenX = ' + screenX);
            const screenY = (-depthCenterScreen.y + 1) * canvasRect.height / 2 + canvasRect.top;
            countertopDepthInput.style.left = `${screenX - canvasRect.left - countertopDepthInput.offsetWidth / 2}px`;
            countertopDepthInput.style.top = `${screenY - canvasRect.top - countertopDepthInput.offsetHeight / 2}px`;
        } catch (error) { console.error("Error positioning depth input (Wall):", error); if(countertopDepthInput) countertopDepthInput.style.left = '-9999px';}
    }

    // Позиция поля слева (твоя старая логика)
    if (toLeftInput) {
        if (boundariesValid) {
            try {
                let leftTopFront;
                // Твои оригинальные расчеты с актуальными границами
                if (wallId === 'Back') { leftTopFront = new THREE.Vector3(-length/2 - (-(currentLB) + countertop.position.x - length/2)/2, thickness/2, depth/2); }
                else if (wallId === 'Front') { leftTopFront = new THREE.Vector3(-length/2, thickness/2, depth/2); }
                else if (wallId === 'Left') { leftTopFront = new THREE.Vector3(length/2 + (-(currentLB) + countertop.position.z - length/2)/2, thickness/2, depth/2); }
                else if (wallId === 'Right') { leftTopFront = new THREE.Vector3(length/2 + (-(currentLB) + countertop.position.z - length/2)/2, thickness/2, -depth/2); }

                if (leftTopFront && leftTopFront.isVector3) {
                    leftTopFront.applyMatrix4(countertop.matrixWorld); leftTopFront.project(activeCamera);
                    // ... (расчет screenX/Y, finalX/Y) ...
                    const screenX = (leftTopFront.x + 1) * canvasRect.width / 2 + canvasRect.left;
                    const screenY = (-leftTopFront.y + 1) * canvasRect.height / 2 + canvasRect.top;
                    toLeftInput.style.left = `${screenX - canvasRect.left - toLeftInput.offsetWidth / 2}px`;
                    toLeftInput.style.top = `${screenY - canvasRect.top - toLeftInput.offsetHeight / 2}px`;
                } else { toLeftInput.style.left = '-9999px'; }
            } catch (error) { console.error("Error positioning left input (Wall):", error); if(toLeftInput) toLeftInput.style.left = '-9999px';}
        } else { toLeftInput.style.left = '-9999px'; }
    }

     // Позиция поля справа (твоя старая логика)
     if (toRightInput) {
         if (boundariesValid) {
             try {
                 let rightTopFront;
                 // Твои оригинальные расчеты с актуальными границами
                  if (wallId === 'Back') { rightTopFront = new THREE.Vector3(length/2 + (currentRB - countertop.position.x - length/2)/2, thickness/2, depth/2); }
                  else if (wallId === 'Front') { rightTopFront = new THREE.Vector3(length/2, thickness/2, depth/2); }
                  else if (wallId === 'Left') { rightTopFront = new THREE.Vector3(-length/2 - (currentRB - countertop.position.z - length/2)/2, thickness/2, depth/2); }
                  else if (wallId === 'Right') { rightTopFront = new THREE.Vector3(-length/2 - (currentRB - countertop.position.z - length/2)/2, thickness/2, -depth/2); }

                 if (rightTopFront && rightTopFront.isVector3) {
                     rightTopFront.applyMatrix4(countertop.matrixWorld); rightTopFront.project(activeCamera);
                    // ... (расчет screenX/Y, finalX/Y) ...
                     const screenX = (rightTopFront.x + 1) * canvasRect.width / 2 + canvasRect.left;
                     const screenY = (-rightTopFront.y + 1) * canvasRect.height / 2 + canvasRect.top;
                    toRightInput.style.left = `${screenX - canvasRect.left - toRightInput.offsetWidth / 2}px`;
                    toRightInput.style.top = `${screenY - canvasRect.top - toRightInput.offsetHeight / 2}px`;
                 } else { toRightInput.style.left = '-9999px'; }
             } catch (error) { console.error("Error positioning right input (Wall):", error); if(toRightInput) toRightInput.style.left = '-9999px';}
         } else { toRightInput.style.left = '-9999px'; }
     }

     // === ПОЛЕ ДЛИНЫ (используем переднюю грань) ===
     if (lengthDisplayWall) {
        try {
            const lengthLocal = new THREE.Vector3(0, thickness / 2, depth / 2); // Центр переднего верхнего ребра
            const lengthWorld = lengthLocal.applyMatrix4(countertop.matrixWorld);
            const lengthScreen = lengthWorld.project(activeCamera);
            const screenX = (lengthScreen.x + 1) * canvasRect.width / 2 + canvasRect.left;
            //console.log('для длины screenX = ' + screenX);
            const screenY = (-lengthScreen.y + 1) * canvasRect.height / 2 + canvasRect.top;
            lengthDisplayWall.style.left = `${screenX - canvasRect.left - lengthDisplayWall.offsetWidth / 2}px`;
            lengthDisplayWall.style.top = `${screenY - canvasRect.top - lengthDisplayWall.offsetHeight / 2}px`;
        } catch (error) {
            console.error("Error positioning length display (Wall):", error);
            lengthDisplayWall.style.left = '-9999px';
        }
    }  
}

/**
 * Позиционирует поля ввода для СВОБОДНО СТОЯЩЕЙ столешницы.
 * Использует ТВОЮ ОРИГИНАЛЬНУЮ логику расчета точек (адаптированную).
 * @param {THREE.Mesh} countertop
 * @param {number} currentLB - Левая/задняя граница (стена комнаты).
 * @param {number} currentRB - Правая/передняя граница (стена комнаты).
 */
function updateFreestandingCountertopDimensionsPosition(countertop, currentLB, currentRB) {
     if (!countertop || !countertop.userData || !camera || !renderer || !renderer.domElement) return;
     const { length, depth, thickness, wallId } = countertop.userData; // wallId здесь 'Bottom'
     if (typeof length !== 'number' || typeof depth !== 'number' || typeof thickness !== 'number') return;
     const canvasRect = renderer.domElement.getBoundingClientRect();
     const boundariesValid = typeof currentLB === 'number' && typeof currentRB === 'number';
     const ctRotY = countertop.rotation.y;
     const axisIsX = (Math.abs(ctRotY) < 0.1 || Math.abs(Math.abs(ctRotY) - Math.PI) < 0.1);

     // Позиция поля глубины (твоя старая логика)
     if (countertopDepthInput) { /* ... (скопируй блок из updateWall...) ... */
        try {
            const depthStartLocal = new THREE.Vector3(length / 2, thickness / 2, -depth / 2);
            const depthEndLocal = new THREE.Vector3(length / 2, thickness / 2, depth / 2);
            const depthCenterLocal = depthStartLocal.clone().lerp(depthEndLocal, 0.5);
            const depthCenterWorld = depthCenterLocal.applyMatrix4(countertop.matrixWorld);
            const depthCenterScreen = depthCenterWorld.project(activeCamera);
            // ... (расчет screenX/Y, finalX/Y) ...
            const screenX = (depthCenterScreen.x + 1) * canvasRect.width / 2 + canvasRect.left;
            const screenY = (-depthCenterScreen.y + 1) * canvasRect.height / 2 + canvasRect.top;
            countertopDepthInput.style.left = `${screenX - canvasRect.left - countertopDepthInput.offsetWidth / 2}px`;
            countertopDepthInput.style.top = `${screenY - canvasRect.top - countertopDepthInput.offsetHeight / 2}px`;
        } catch (error) { console.error("Error positioning depth input (Wall):", error); if(countertopDepthInput) countertopDepthInput.style.left = '-9999px';}
     }

     // Позиция поля слева (твоя старая логика, адаптированная для FS)
    if (toLeftInput) {
        if (boundariesValid) {
            try {
                let leftTopFront;
                // Адаптируем оригинальные формулы для FS, используя displayLB = currentLB
                let edgePos = axisIsX ? countertop.position.x - length/2 : countertop.position.z - length/2;
                let midCoord = (edgePos + currentLB) / 2;
                if(axisIsX) { leftTopFront = new THREE.Vector3(midCoord - countertop.position.x, thickness/2, depth/2); } // Используем Z переднего края
                else { leftTopFront = new THREE.Vector3(depth/2, thickness/2, midCoord - countertop.position.z); } // Используем X правого края?

                if (leftTopFront && leftTopFront.isVector3) {
                    leftTopFront.applyMatrix4(countertop.matrixWorld); leftTopFront.project(activeCamera);
                    const screenX = (leftTopFront.x + 1) * canvasRect.width / 2 + canvasRect.left;
                    const screenY = (-leftTopFront.y + 1) * canvasRect.height / 2 + canvasRect.top;
                    toLeftInput.style.left = `${screenX - canvasRect.left - toLeftInput.offsetWidth / 2}px`;
                    toLeftInput.style.top = `${screenY - canvasRect.top - toLeftInput.offsetHeight / 2}px`;
                } else { toLeftInput.style.left = '-9999px'; }
            } catch (error) { console.error("Error positioning left input (FS):", error); if(toLeftInput) toLeftInput.style.left = '-9999px';}
        } else { toLeftInput.style.left = '-9999px'; }
    }

    // Позиция поля справа (твоя старая логика, адаптированная для FS)
     if (toRightInput) {
         if (boundariesValid) {
             try {
                 let rightTopFront;
                  // Адаптируем оригинальные формулы для FS, используя displayRB = currentRB
                  let edgePos = axisIsX ? countertop.position.x + length/2 : countertop.position.z + length/2;
                  let midCoord = (edgePos + currentRB) / 2;
                  if(axisIsX) { rightTopFront = new THREE.Vector3(midCoord - countertop.position.x, thickness/2, -depth/2); }
                  else { rightTopFront = new THREE.Vector3(depth/2, thickness/2, midCoord - countertop.position.z); }

                 if (rightTopFront && rightTopFront.isVector3) {
                     rightTopFront.applyMatrix4(countertop.matrixWorld); rightTopFront.project(activeCamera);
                     const screenX = (rightTopFront.x + 1) * canvasRect.width / 2 + canvasRect.left;
                     const screenY = (-rightTopFront.y + 1) * canvasRect.height / 2 + canvasRect.top;
                     toRightInput.style.left = `${screenX - canvasRect.left - toRightInput.offsetWidth / 2}px`;
                     toRightInput.style.top = `${screenY - canvasRect.top - toRightInput.offsetHeight / 2}px`;
                 } else { toRightInput.style.left = '-9999px'; }
             } catch (error) { console.error("Error positioning right input (FS):", error); if(toRightInput) toRightInput.style.left = '-9999px';}
         } else { toRightInput.style.left = '-9999px'; }
     }

     if (lengthDisplayFree) {
        try {
            const frontTopCenter = new THREE.Vector3(0, thickness / 2, depth / 2);
            frontTopCenter.applyMatrix4(countertop.matrixWorld);
            const screen = frontTopCenter.project(activeCamera);
            const screenX = (screen.x + 1) * canvasRect.width / 2 + canvasRect.left;
            const screenY = (-screen.y + 1) * canvasRect.height / 2 + canvasRect.top;
            lengthDisplayFree.style.left = `${screenX - canvasRect.left - lengthDisplayFree.offsetWidth / 2}px`;
            lengthDisplayFree.style.top = `${screenY - canvasRect.top - lengthDisplayFree.offsetHeight / 2}px`;
        } catch (e) {
            console.error("Error positioning lengthDisplayFree:", e);
            lengthDisplayFree.style.left = '-9999px';
        }
    }
       
}

/**
 * Обновляет 2D-позиции HTML-элементов ввода размеров на экране.
 * Использует оригинальную логику пользователя для позиционирования полей.
 * @param {THREE.Mesh} countertop - Меш выделенной столешницы.
 */
function updateCountertopDimensionsInputPosition(countertop) {
    // --- 1. Проверки и получение данных ---
    if (!countertop || !countertop.userData || !camera || !renderer || !renderer.domElement) return;
    const { length, depth, thickness, wallId } = countertop.userData;
    if (typeof length !== 'number' || typeof depth !== 'number' || typeof thickness !== 'number') return;
    const canvasRect = renderer.domElement.getBoundingClientRect();
    const roomWidth = currentLength; // X size
    const roomDepth = currentHeight; // Z size

    // --- 2. Определяем актуальные Границы (displayLB, displayRB) ---
    let displayLB, displayRB;
    let axisIsX = false;
    let boundariesValid = true;
    try {
        if (wallId !== 'Bottom') { // Стенная
            const { leftBoundary, rightBoundary } = findNearestObstacles(countertop, cabinets, countertops);
            displayLB = leftBoundary;
            displayRB = rightBoundary;
            if (wallId === 'Back' || wallId === 'Front') { axisIsX = true; } else { axisIsX = false; }
        } else { // Свободно стоящая
            const ctRotY = countertop.rotation.y;
            if (Math.abs(ctRotY) < 0.1 || Math.abs(Math.abs(ctRotY) - Math.PI) < 0.1) { axisIsX = true; displayLB = -roomWidth / 2; displayRB = roomWidth / 2; }
            else { axisIsX = false; displayLB = -roomDepth / 2; displayRB = roomDepth / 2; }
        }
        if (typeof displayLB !== 'number' || typeof displayRB !== 'number') boundariesValid = false;
    } catch (error) { boundariesValid = false; console.error("Error getting boundaries in updateCDIP:", error); }

    // --- 3. Позиция поля ГЛУБИНЫ (твоя старая логика) ---
    if (countertopDepthInput) {
        try {
            // Оригинальный расчет точки для поля глубины
            const depthStartLocal = new THREE.Vector3(length / 2, thickness / 2, -depth / 2);
            const depthEndLocal = new THREE.Vector3(length / 2, thickness / 2, depth / 2);
            const depthCenterLocal = depthStartLocal.clone().lerp(depthEndLocal, 0.5);
            const depthCenterWorld = depthCenterLocal.applyMatrix4(countertop.matrixWorld);
            const depthCenterScreen = depthCenterWorld.project(camera);
            const screenX = (depthCenterScreen.x + 1) * canvasRect.width / 2 + canvasRect.left;
            const screenY = (-depthCenterScreen.y + 1) * canvasRect.height / 2 + canvasRect.top;
            countertopDepthInput.style.left = `${screenX - canvasRect.left - countertopDepthInput.offsetWidth / 2}px`;
            countertopDepthInput.style.top = `${screenY - canvasRect.top - countertopDepthInput.offsetHeight / 2}px`; // Убрал доп. смещение -5
        } catch (error) { console.error("Error positioning depth input:", error); if(countertopDepthInput) countertopDepthInput.style.left = '-9999px';}
    }

    // --- 4. Позиция полей РАССТОЯНИЙ (твоя старая логика с актуальными границами) ---
    if (toLeftInput) {
        if (boundariesValid) { // Позиционируем только если границы корректны
            try {
                let leftTopFront; // Локальная или мировая точка? Оригинал выглядит как расчет локальной точки со смещением
                // Используем ТВОИ ОРИГИНАЛЬНЫЕ формулы расчета, подставляя displayLB/displayRB
                // ВАЖНО: Эти формулы могут быть неточными, особенно для Left/Right/Bottom,
                // так как они смешивают локальные размеры (length/2) с мировыми координатами (countertop.position, displayLB).
                // Если позиция будет неверной, нужно будет переписать эти формулы на чисто векторную математику.
                if (wallId === 'Back') {
                     leftTopFront = new THREE.Vector3( -length / 2 - (-(displayLB) + countertop.position.x - length / 2) / 2, thickness / 2, depth / 2 );
                } else if (wallId === 'Front') {
                     leftTopFront = new THREE.Vector3( -length / 2, thickness / 2, depth / 2 ); // Не использует границу?
                } else if (wallId === 'Left') {
                      leftTopFront = new THREE.Vector3( length / 2 + (-(displayLB) + countertop.position.z - length / 2) / 2, thickness / 2, depth / 2 );
                } else if (wallId === 'Right') {
                      leftTopFront = new THREE.Vector3( length / 2 + (-(displayLB) + countertop.position.z - length / 2) / 2, thickness / 2, -depth / 2 );
                } else if (wallId === 'Bottom') { // Логика для FS - позиционируем между краем и стеной
                    let edgePos = axisIsX ? countertop.position.x - length/2 : countertop.position.z - length/2;
                    let midCoord = (edgePos + displayLB) / 2; // Средняя мировая координата по оси
                    // Создаем вектор СМЕЩЕНИЯ от центра объекта к этой средней точке в локальных координатах
                    if(axisIsX) { leftTopFront = new THREE.Vector3(midCoord - countertop.position.x, thickness/2, -depth/2); } // Используем Z переднего края
                    else { leftTopFront = new THREE.Vector3(depth/2, thickness/2, midCoord - countertop.position.z); } // Используем X правого края?
                }

                if (leftTopFront && leftTopFront.isVector3) { // Если точка рассчитана
                    leftTopFront.applyMatrix4(countertop.matrixWorld); // Преобразуем в мировые
                    leftTopFront.project(camera); // Проецируем на экран
                    const screenX = (leftTopFront.x + 1) * canvasRect.width / 2 + canvasRect.left;
                    const screenY = (-leftTopFront.y + 1) * canvasRect.height / 2 + canvasRect.top;
                    toLeftInput.style.left = `${screenX - canvasRect.left - toLeftInput.offsetWidth / 2}px`;
                    toLeftInput.style.top = `${screenY - canvasRect.top - toLeftInput.offsetHeight / 2}px`;
                } else { toLeftInput.style.left = '-9999px'; } // Прячем, если не удалось рассчитать
            } catch (error) { console.error("Error positioning left input:", error); if(toLeftInput) toLeftInput.style.left = '-9999px';}
        } else { toLeftInput.style.left = '-9999px'; } // Прячем, если границы невалидны
    }

    if (toRightInput) { // Аналогично для правого поля
        if (boundariesValid) {
            try {
                let rightTopFront; // Локальная точка
                // ТВОИ ОРИГИНАЛЬНЫЕ формулы
                 if (wallId === 'Back') {
                     rightTopFront = new THREE.Vector3(length / 2 + (displayRB - countertop.position.x - length / 2) / 2, thickness / 2, depth / 2);
                 } else if (wallId === 'Front') {
                     rightTopFront = new THREE.Vector3(length / 2, thickness / 2, depth / 2); // Нет границы?
                 } else if (wallId === 'Left') {
                     rightTopFront = new THREE.Vector3(-length / 2 - (displayRB - countertop.position.z - length / 2) / 2, thickness / 2, depth / 2);
                 } else if (wallId === 'Right') {
                     rightTopFront = new THREE.Vector3(-length / 2 - (displayRB - countertop.position.z - length / 2) / 2, thickness / 2, -depth / 2);
                 } else if (wallId === 'Bottom') {
                     let edgePos = axisIsX ? countertop.position.x + length/2 : countertop.position.z + length/2;
                     let midCoord = (edgePos + displayRB) / 2;
                     if(axisIsX) { rightTopFront = new THREE.Vector3(midCoord - countertop.position.x, thickness/2, -depth/2); }
                     else { rightTopFront = new THREE.Vector3(depth/2, thickness/2, midCoord - countertop.position.z); }
                 }

                if (rightTopFront && rightTopFront.isVector3) {
                    rightTopFront.applyMatrix4(countertop.matrixWorld);
                    rightTopFront.project(camera);
                    const screenX = (rightTopFront.x + 1) * canvasRect.width / 2 + canvasRect.left;
                    const screenY = (-rightTopFront.y + 1) * canvasRect.height / 2 + canvasRect.top;
                    toRightInput.style.left = `${screenX - canvasRect.left - toRightInput.offsetWidth / 2}px`;
                    toRightInput.style.top = `${screenY - canvasRect.top - toRightInput.offsetHeight / 2}px`;
                } else { toRightInput.style.left = '-9999px'; }
            } catch (error) { console.error("Error positioning right input:", error); if(toRightInput) toRightInput.style.left = '-9999px';}
        } else { toRightInput.style.left = '-9999px'; }
    }
}




// --- Константы для подсветки ---
const HIGHLIGHT_EMISSIVE_COLOR = 0x00FFFF; // Цвет свечения
const HIGHLIGHT_EMISSIVE_INTENSITY = 0.8;  // Интенсивность

/** Применяет emissive подсветку к мешу или частям группы */
function applyHighlight(meshOrGroup) {
    if (!meshOrGroup || meshOrGroup.userData?.isHighlighted) return; // Пропускаем, если уже подсвечен

    if (meshOrGroup.isGroup && meshOrGroup.userData.isDetailedCabinet) {
        // --- Подсветка для группы (детализированный шкаф) ---
        console.log('Highlighting group:', meshOrGroup.uuid);
        meshOrGroup.traverse((child) => {
            if (child.isMesh && child.userData.isCabinetPart) { // Подсвечиваем только части шкафа
                 // Проверяем, что материал существует и имеет emissive
                if (child.material && child.material.emissive) {
                    child.material.userData = child.material.userData || {};
                    // Сохраняем оригинальный цвет, если еще не сохранен
                    if (child.material.userData.originalEmissive === undefined) {
                       child.material.userData.originalEmissive = child.material.emissive.getHex();
                    }
                     // Сохраняем оригинальную интенсивность, если еще не сохранена
                    if (child.material.userData.originalIntensity === undefined) {
                       child.material.userData.originalIntensity = child.material.emissiveIntensity ?? 0.0; // Исходная 0 для StandardMaterial
                    }

                    child.material.emissive.setHex(HIGHLIGHT_EMISSIVE_COLOR);
                    child.material.emissiveIntensity = HIGHLIGHT_EMISSIVE_INTENSITY;
                    child.material.needsUpdate = true;
                } else if (!child.material?.emissive) {
                     console.warn("Material missing or no emissive property on cabinet part:", child.name, child.material);
                }
            }
        });
        meshOrGroup.userData.isHighlighted = true; // Ставим флаг на саму группу

    } else if (meshOrGroup.isMesh) {
        // --- Подсветка для простого меша (куб, окно, столешница) ---
        //console.log('Highlighting mesh:', meshOrGroup.uuid, meshOrGroup.userData?.type);
        const materials = Array.isArray(meshOrGroup.material) ? meshOrGroup.material : [meshOrGroup.material];

        materials.forEach(mat => {
            if (!mat || !mat.emissive) return; // Пропускаем, если нет emissive

            mat.userData = mat.userData || {};
            if (mat.userData.originalEmissive === undefined) {
                 mat.userData.originalEmissive = mat.emissive.getHex();
            }
             if (mat.userData.originalIntensity === undefined) {
                mat.userData.originalIntensity = mat.emissiveIntensity ?? 0.0; // Исходная 0 для StandardMaterial
             }

            mat.emissive.setHex(HIGHLIGHT_EMISSIVE_COLOR);
            mat.emissiveIntensity = HIGHLIGHT_EMISSIVE_INTENSITY;
            mat.needsUpdate = true;
        });
        meshOrGroup.userData.isHighlighted = true; // Ставим флаг на меш
    } else {
         console.warn("Attempted to highlight an unsupported object type:", meshOrGroup);
    }
}


/** Снимает emissive подсветку с меша или частей группы */
function removeHighlight(meshOrGroup) {
    if (!meshOrGroup || !meshOrGroup.userData?.isHighlighted) return; // Пропускаем, если не подсвечен

    if (meshOrGroup.isGroup && meshOrGroup.userData.isDetailedCabinet) {
        // --- Снятие подсветки с группы ---
        console.log('Removing highlight from group:', meshOrGroup.uuid);
        meshOrGroup.traverse((child) => {
            if (child.isMesh && child.userData.isCabinetPart) {
                 if (child.material && child.material.emissive && child.material.userData) {
                    const originalColor = child.material.userData.originalEmissive ?? 0x000000;
                    const originalIntensity = child.material.userData.originalIntensity ?? 0.0; // Исходная 0

                    child.material.emissive.setHex(originalColor);
                    child.material.emissiveIntensity = originalIntensity;
                    child.material.needsUpdate = true;

                    // Очищаем сохраненные значения
                    delete child.material.userData.originalEmissive;
                    delete child.material.userData.originalIntensity;
                 }
            }
        });
         meshOrGroup.userData.isHighlighted = false; // Снимаем флаг с группы

    } else if (meshOrGroup.isMesh) {
        // --- Снятие подсветки с простого меша ---
        //console.log('Removing highlight from mesh:', meshOrGroup.uuid, meshOrGroup.userData?.type);
        const materials = Array.isArray(meshOrGroup.material) ? meshOrGroup.material : [meshOrGroup.material];

        materials.forEach(mat => {
            if (!mat || !mat.emissive || !mat.userData) return;

            const originalColor = mat.userData.originalEmissive ?? 0x000000;
            const originalIntensity = mat.userData.originalIntensity ?? 0.0; // Исходная 0

            mat.emissive.setHex(originalColor);
            mat.emissiveIntensity = originalIntensity;
            mat.needsUpdate = true;

            delete mat.userData.originalEmissive;
            delete mat.userData.originalIntensity;
        });
         meshOrGroup.userData.isHighlighted = false; // Снимаем флаг с меша
    }
}



// --- Обработчик кликов (ОБНОВЛЕННАЯ ВЕРСИЯ) ---
renderer.domElement.addEventListener('click', (event) => {
    // Игнорируем клик, если только что закончили перетаскивание
    if (justDragged) {
        justDragged = false; // Сбрасываем флаг для следующих кликов
        return;
    }
    // Игнорируем клик, если идет вращение сцены мышью
    if (isRotating) {
        return;
    }
     // Игнорируем, если нет комнаты
     if (!cube) return;


    // --- Расчет координат мыши и Raycaster ---
    const rect = renderer.domElement.getBoundingClientRect();
    const ndcMouseForPicking = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    mouse.x = ndcMouseForPicking.x;
    mouse.y = ndcMouseForPicking.y;
    raycaster.setFromCamera(ndcMouseForPicking, activeCamera);

    // --- Объекты для проверки пересечения ---
    const intersectableObjects = [
        ...cabinets.map(c => c.mesh), // Могут быть Mesh или Group
        ...windows.map(w => w.mesh),
        ...countertops // counterto могут быть Mesh или Group (если есть)
    ].filter(obj => obj); // Убираем null/undefined

    // Пересекаем рекурсивно, чтобы поймать части детализированного шкафа
    const objectIntersects = raycaster.intersectObjects(intersectableObjects, true); // recursive = true
    const wallIntersects = raycaster.intersectObject(cube, false);

    // --- Сохраняем предыдущее выделение ---
    const previouslySelectedData = [...selectedCabinets];

    // --- Сброс состояния (меню, поля, грань стены), КРОМЕ selectedCabinets ---
    // selectedFaceIndex = -1; // <--- УДАЛИТЬ ЭТУ СТРОКУ
    resetRoomSelectedFace(); // <--- ИСПОЛЬЗОВАТЬ НОВУЮ ФУНКЦИЮ
    hideWindowMenu();
    hideSocketMenu();
    hideCabinetMenu();
    hideCountertopMenu();
    hideCabinetConfigMenu(); // Скрываем и меню конфигурации
    hideAllDimensionInputs(); // Скрываем все поля размеров

    // --- Определение текущего выделения (обновление selectedCabinets) ---
    let currentHitData = null; // Данные найденного объекта (шкаф, окно, столешница)
    let finalHitObject = null; // Сам объект Mesh или Group

    if (objectIntersects.length > 0) {
        let hitObject = objectIntersects[0].object; // Объект, по которому кликнули

        // --- НАЧАЛО: Надежный поиск родительского объекта ---
        let searchTarget = hitObject;
        while (searchTarget && searchTarget !== cube && searchTarget !== scene) {
            currentHitData = cabinets.find(c => c.mesh === searchTarget);
            if (currentHitData) {
                finalHitObject = searchTarget;
                // console.log("Найден шкаф:", currentHitData.type, finalHitObject.uuid);
                break;
            }
            searchTarget = searchTarget.parent;
        }

        if (!currentHitData) {
            currentHitData = windows.find(w => w.mesh === hitObject);
            if (currentHitData) {
                finalHitObject = hitObject;
                // console.log("Найдено окно:", currentHitData.type, finalHitObject.uuid);
            } else {
                currentHitData = countertops.find(c => c === hitObject);
                if (currentHitData) {
                    finalHitObject = hitObject;
                    // console.log("Найдена столешница:", finalHitObject.uuid);
                }
            }
        }
        // --- КОНЕЦ: Надежный поиск родительского объекта ---

        if (currentHitData) {
            // console.log("Обработка клика для:", currentHitData.type || 'countertop');
            if (event.ctrlKey) { // Логика Ctrl+Click
                const index = selectedCabinets.findIndex(item => (item.mesh || item).uuid === (currentHitData.mesh || currentHitData).uuid); // Сравнение по UUID
                if (index === -1) {
                    selectedCabinets.push(currentHitData); // Добавить
                } else {
                    selectedCabinets.splice(index, 1); // Удалить
                }
            } else { // Логика одиночного клика
                const alreadySelected = selectedCabinets.length === 1 && (selectedCabinets[0].mesh || selectedCabinets[0]).uuid === (currentHitData.mesh || currentHitData).uuid;
                if (alreadySelected) {
                    selectedCabinets = []; // Повторный клик -> снять выделение
                    // Инпуты уже скрыты выше
                } else {
                    selectedCabinets = [currentHitData]; // Выделить только этот
                    // Показ меню/полей для одиночного выделения (ТОЛЬКО для НЕ детализированных шкафов)
                    if (currentHitData.userData?.type === 'countertop') {
                        showCountertopDimensionsInput(finalHitObject, countertops, cabinets);
                    } else if (currentHitData.type) {
                        if (currentHitData.type === 'freestandingCabinet') {
                            showFreestandingCabinetDimensions(currentHitData, cabinets);
                        } else if (['lowerCabinet', 'upperCabinet'].includes(currentHitData.type) && currentHitData.wallId) {
                            showCabinetDimensionsInput(currentHitData, cabinets);
                        }
                    }
                     // Для детализированных шкафов инпуты не показываем здесь
                }
            }
        } else {
            // console.log("Клик по объекту, но не найдено соответствия в данных.");
            selectedCabinets = []; // Сбрасываем выделение, если клик был по "неизвестному" объекту
        }

    } else if (wallIntersects.length > 0) { // Клик по стене
        // console.log("Обнаружено пересечение со стеной.");
        selectedCabinets = []; // Сбрасываем выделение ОБЪЕКТОВ
        selectedCabinet = null;
        // Инпуты и меню уже скрыты выше

        // --- Логика определения selectedFaceIndex ---
        const intersect = wallIntersects[0];
        
        // Вызываем функцию из roomManager для определения грани
        const clickedFaceIdx = determineClickedWallFace_OldLogic(intersect, ndcMouseForPicking);
        setRoomSelectedFace(clickedFaceIdx); // Устанавливаем выбранную грань

    } else { // Клик в пустоту
        selectedCabinets = []; // Снять выделение объектов
        //selectedFaceIndex = -1; // Снять выделение стены
         // Инпуты и меню уже скрыты выше
         const clickHandledByRoom = handleRoomClick(ndcMouseForPicking, activeCamera);
         if (clickHandledByRoom) {
            // Клик был по стене и обработан в roomManager
            // selectedFaceIndex уже установлен там
            // console.log("Клик по стене обработан roomManager.");
        } else {
            // Клик был в пустоту (не по объекту и не по комнате)
            // selectedFaceIndex уже сброшен через resetRoomSelectedFace() в начале
            // console.log("Клик в пустоту.");
        }
    }

    // Обновляем вспомогательную переменную selectedCabinet
    selectedCabinet = (selectedCabinets.length === 1 && selectedCabinets[0].mesh) ? selectedCabinets[0] : null;

    

    // --- Обновление ВИЗУАЛЬНОЙ подсветки (Emissive) ---
    const allHighlightableData = [...cabinets, ...windows, ...countertops];
    allHighlightableData.forEach(itemData => {
        const meshOrGroup = itemData.mesh || itemData; // Получаем Mesh или Group
        if (!meshOrGroup) return;

        const itemUUID = meshOrGroup.uuid; // Получаем UUID объекта
        const isNowSelected = selectedCabinets.some(s => (s.mesh || s).uuid === itemUUID);
        const wasPreviouslySelected = previouslySelectedData.some(s => (s.mesh || s).uuid === itemUUID);

        if (wasPreviouslySelected && !isNowSelected) {
            removeHighlight(meshOrGroup); // Передаем Mesh или Group
        } else if (isNowSelected && !wasPreviouslySelected) {
            applyHighlight(meshOrGroup); // Передаем Mesh или Group
        }
    });

    // --- Обновление ДРУГИХ визуальных состояний (цвет пересечений и т.д.) ---
    cabinets.forEach(c => {
        const hasIntersection = checkCabinetIntersections(c);
        // Применяем цвет пересечения ТОЛЬКО если это простой куб
        if (!c.isDetailed && c.mesh.material) {
            c.mesh.material.color.set(hasIntersection ? 0xff0000 : c.initialColor);
            c.mesh.material.needsUpdate = true;
        } else if (c.isDetailed && hasIntersection) {
            // console.warn(`Детализированный шкаф ${c.mesh.uuid} пересекается!`); // Можно раскомментировать для отладки
        }
        // Обновляем ребра простого куба
        if (c.edges && c.edges.material) {
            c.edges.material.needsUpdate = true;
        }
    });
    windows.forEach(w => {
         // Возвращаем исходный цвет окнам/дверям и т.п.
        if (w.mesh && w.mesh.material) {
            w.mesh.material.color.set(w.initialColor);
            w.mesh.material.needsUpdate = true;
        }
    });
     // Для столешниц цвет/материал управляется отдельно, здесь не трогаем

    // --- Обновление UI ---
    updateHint(selectedCabinets.length > 0 ? 'Выделено объектов: ' + selectedCabinets.length : 'Выделите объект или стену');
    updateCountertopButtonVisibility(); // Обновляем видимость кнопки столешницы
    //updateEdgeColors(); // Обновляем цвет ребер стен
    //updateSelectedFaceDisplay(); // Обновляем UI для грани/объекта

}); // Конец обработчика кликов

// Новый обработчик для начала перетаскивания с копированием через shift
// В script.js

renderer.domElement.addEventListener('mousedown', (event) => {
    // --- Начальные проверки: Игнорируем, если ---
    // - Нет куба (сцены)
    // - Нажата средняя кнопка (часто используется для системного панорамирования/вращения)
    // - Уже идет перетаскивание шкафа (ЛКМ)
    // - Уже идет вращение сцены (ЛКМ)
    // - Уже идет панорамирование (ПКМ)
    if (!cube || event.button === 1 || draggedCabinet || isRotating || isPanning) {
        console.log("Mousedown проигнорирован: button/dragged/rotating/panning");
        return;
    }

    // --- Обработка ЛЕВОЙ кнопки мыши (event.button === 0) ---
    if (event.button === 0) {
        //console.log("Mousedown ЛКМ");
        potentialDrag = false; // Сбрасываем флаг перед проверкой

        const rect = renderer.domElement.getBoundingClientRect();
        const mouseXCanvas = event.clientX - rect.left;
        const mouseYCanvas = event.clientY - rect.top;
        mouse.x = (mouseXCanvas / rect.width) * 2 - 1;
        mouse.y = -(mouseYCanvas / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, activeCamera); // Используем activeCamera

        // Пересекаем рекурсивно
        const intersectableObjects = cabinets.map(c => c.mesh).filter(m => m);
        const intersects = raycaster.intersectObjects(intersectableObjects, true);

        let cabinetHitData = null;
        let hitMeshOrGroup = null;

        if (intersects.length > 0) {
            // --- Находим главный объект шкафа ---
            let hitObject = intersects[0].object;
            let searchTarget = hitObject;
            while (searchTarget && searchTarget !== cube && searchTarget !== scene) {
                cabinetHitData = cabinets.find(c => c.mesh === searchTarget);
                if (cabinetHitData) { hitMeshOrGroup = searchTarget; break; }
                searchTarget = searchTarget.parent;
            }
        }

        if (cabinetHitData) {
            // --- НАЧАЛО: Логика для КЛИКА/DRAG НА ШКАФУ ---
            controls.enabled = false; // <<< ОТКЛЮЧАЕМ КАМЕРУ
            //console.log("Mousedown на шкафу UUID:", cabinetHitData.mesh?.uuid);
            potentialDrag = true; // Устанавливаем флаг потенциального перетаскивания
            //isRotating = false;   // Сбрасываем флаг вращения

            let dragStarted = false;
            let dragTimeoutId = null;
            const initialClientX = event.clientX;
            const initialClientY = event.clientY;
            const dragThreshold = 5; // Пиксели

            const startDragIfNeeded = (currentEvent) => {
                if (dragStarted || dragTimeoutId === null) return;
                potentialDrag = false; clearTimeout(dragTimeoutId); dragTimeoutId = null;
                dragStarted = true; document.removeEventListener('mouseup', cancelDragStartMouseUp);

                const wasSelectedBeforeDrag = selectedCabinets.includes(cabinetHitData);
                const isShiftPressed = currentEvent.shiftKey; // Проверяем Shift
                let cabinetToDrag = cabinetHitData; // Изначально тащим оригинал

                // --- ЛОГИКА КЛОНИРОВАНИЯ ---
                if (isShiftPressed && cabinetHitData.type && cabinetHitData.type.includes('Cabinet')) {
                    console.log("Shift нажат - клонируем!");
                    const cloned = cloneCabinet(cabinetHitData); // Создает клон (может быть простым)
                    if (cloned) {
                        cloned.mesh.uuid = THREE.MathUtils.generateUUID(); // Генерируем НОВЫЙ UUID
                        cloned.mesh.position.copy(cabinetHitData.mesh.position);
                        cloned.mesh.rotation.copy(cabinetHitData.mesh.rotation);
                        // Важно: cloneCabinet копирует isDetailed. Если оригинал был детальным, клон тоже будет isDetailed=true
                        console.log(`Клон создан. Данные isDetailed: ${cloned.isDetailed}`);

                        scene.add(cloned.mesh); // Добавляем ПРОСТОЙ меш клона в сцену
                        cabinets.push(cloned); // Добавляем ДАННЫЕ клона в массив
                        const cloneIndex = cabinets.length - 1;

                        cabinetToDrag = cloned; // Тащить будем клон

                        // Снимаем выделение с оригинала и клона
                        removeHighlight(cabinetHitData.mesh);
                        removeHighlight(cloned.mesh);
                        selectedCabinets = []; selectedCabinet = null;

                        // Если клон должен быть детализированным - детализируем его СРАЗУ
                        if (cloned.isDetailed) {
                             console.log(`Клон должен быть детализирован. Вызов toggleCabinetDetail(${cloneIndex})...`);
                             // ВАЖНО: toggleCabinetDetail заменит cloned.mesh на Group
                             toggleCabinetDetail(cloneIndex);
                             console.log(`Клон ${cloned.mesh.uuid} (теперь Group) детализирован.`);
                             // cabinetToDrag все еще ссылается на объект cloned, но cloned.mesh теперь Group
                        } else {
                             console.log(`Клон ${cloned.mesh.uuid} остается простым кубом.`);
                        }
                    } else {
                        console.error("Ошибка клонирования шкафа.");
                        document.removeEventListener('mousemove', checkDragStartMove);
                        if (typeof cancelDragStartMouseUp === 'function') { document.removeEventListener('mouseup', cancelDragStartMouseUp); }
                        return;
                    }
                } else if (isShiftPressed) {
                    console.log("Shift нажат, но объект не шкаф. Клонирование отменено.");
                    document.removeEventListener('mousemove', checkDragStartMove);
                    if (typeof cancelDragStartMouseUp === 'function') { document.removeEventListener('mouseup', cancelDragStartMouseUp); }
                    return;
                }
                // --- КОНЕЦ ЛОГИКИ КЛОНИРОВАНИЯ ---

                // Начинаем перетаскивание (оригинала или клона)
                startDraggingCabinet(cabinetToDrag, currentEvent, wasSelectedBeforeDrag);
                setContinuousRendering(true); // 🔥 активируем рендер при перемещении шкафа
            };

            const checkDragStartMove = (moveEvent) => {
                if (dragStarted || dragTimeoutId === null) { document.removeEventListener('mousemove', checkDragStartMove); return; }
                const deltaX = moveEvent.clientX - initialClientX; const deltaY = moveEvent.clientY - initialClientY;
                if (Math.sqrt(deltaX * deltaX + deltaY * deltaY) > dragThreshold) {
                    potentialDrag = false; startDragIfNeeded(moveEvent);
                    document.removeEventListener('mousemove', checkDragStartMove);
                }
            };

            const cancelDragStartMouseUp = (upEvent) => {
                if (!dragStarted) {
                    clearTimeout(dragTimeoutId); dragTimeoutId = null;
                    potentialDrag = false; //console.log("MouseUp до начала drag шкафа - отменен.");
                }
                document.removeEventListener('mousemove', checkDragStartMove);
                document.removeEventListener('mouseup', cancelDragStartMouseUp);
            };

            dragTimeoutId = setTimeout(() => {
                if (!dragStarted) { // Проверяем, не начался ли drag по движению
                     startDragIfNeeded(event);
                     document.removeEventListener('mousemove', checkDragStartMove);
                }
            }, 250);

            document.addEventListener('mousemove', checkDragStartMove);
            document.addEventListener('mouseup', cancelDragStartMouseUp);
            // --- КОНЕЦ: Логика для ШКАФА ---

        } else {
            // Клик ЛКМ НЕ по шкафу - начинаем вращение сцены
            //console.log("Mousedown ЛКМ не на шкафу - начинаем вращение.");
            potentialDrag = false; // Сбрасываем потенциальный drag
            //isRotating = true;   // Устанавливаем флаг вращения
            previousMouseX = event.clientX;
            previousMouseY = event.clientY;
            renderer.domElement.style.cursor = 'grabbing';

            setContinuousRendering(true); // 🔁 рендерим пока вращаем
        }
    }
    // --- Обработка ПРАВОЙ кнопки мыши (event.button === 2) ---
    else if (event.button === 2) {
        //console.log("Mousedown ПКМ");
        // Предотвращаем контекстное меню браузера
        event.preventDefault();

        // Начинаем панорамирование, если не идет drag шкафа
        if (!draggedCabinet) {
            renderer.domElement.style.cursor = 'grabbing'; // Или 'move'

            setContinuousRendering(true); // 👀 рендерим пока панорамируем
            // --- Расчет точки панорамирования (panTarget) удаляем ---

        } else {
            console.log(" - Mousedown ПКМ проигнорирован (идет перетаскивание шкафа).");
        }
   }
});

// В script.js (на верхнем уровне, НЕ внутри другой функции)

// Этот обработчик отвечает ТОЛЬКО за ОСТАНОВКУ ВРАЩЕНИЯ СЦЕНЫ
document.addEventListener('mouseup', () => {
  // Остановка вращения
  
    renderer.domElement.style.cursor = 'default';
    controls.enabled = true; // <<< ВКЛЮЧАЕМ КАМЕРУ ОБРАТНО
  

    // Сброс потенциального drag
    if (potentialDrag) {
        potentialDrag = false;
    }

  // 🆕 Вставляем после остановки всех действий:
  setContinuousRendering(false);  // ⛔ отключаем цикл
  requestRender();                // ✅ перерисовываем один кадр после взаимодействия
});
/*
document.addEventListener('mousemove', (event) => {
    if (isRotating && !potentialDrag) {
        const deltaX = event.clientX - previousMouseX;
        const deltaY = event.clientY - previousMouseY;

        // Ограничиваем вращение, чтобы избежать полного переворота (опционально)
        const currentRotX = cube.rotation.x;
        const currentRotY = cube.rotation.y;
        const maxRotX = THREE.MathUtils.degToRad(89.9); // Чуть меньше 90 градусов
        const minRotX = THREE.MathUtils.degToRad(-89.9);

        let newRotationY = currentRotY + THREE.MathUtils.degToRad(deltaX * rotationSpeed);
        let newRotationX = currentRotX + THREE.MathUtils.degToRad(deltaY * rotationSpeed);

        // Применяем ограничения
        newRotationX = Math.max(minRotX, Math.min(maxRotX, newRotationX));

        // Применяем вращение
        cube.rotation.y = Math.max(THREE.MathUtils.degToRad(-180), Math.min(THREE.MathUtils.degToRad(180), newRotationY));
        cube.rotation.x = newRotationX;
        if (edges) { // Проверяем, существуют ли ребра
            edges.rotation.y = cube.rotation.y;
            edges.rotation.x = cube.rotation.x;
        }

        // Обновляем слайдеры и UI
        rotateYSlider.value = THREE.MathUtils.radToDeg(cube.rotation.y);
        rotateXSlider.value = THREE.MathUtils.radToDeg(cube.rotation.x);
        //updateRotationDisplay();
        updateEdgeColors();
        //updateFaceBounds();

        // Обновляем предыдущие координаты
        previousMouseX = event.clientX;
        previousMouseY = event.clientY;
    }
    // --- НАЧАЛО: Панорамирование ---
    else if (isPanning) {
        const deltaX = event.clientX - previousPanX;
        const deltaY = event.clientY - previousPanY;

        // Рассчитываем векторы смещения в плоскости камеры
        const camera = activeCamera; // Используем активную камеру
        const element = renderer.domElement;

        // Вектор от камеры к цели панорамирования
        const targetToCamera = new THREE.Vector3().subVectors(camera.position, panTarget);
        // Расстояние до цели (используем для масштабирования смещения)
        let targetDistance = targetToCamera.length();
        targetDistance = Math.max(targetDistance, 1.0); // Избегаем деления на ноль и слишком малых значений

        // Рассчитываем смещение по горизонтали (вектор "вправо" от камеры)
        const panOffsetX = new THREE.Vector3();
        panOffsetX.setFromMatrixColumn(camera.matrix, 0); // Получаем X-ось камеры
        // Масштабируем смещение пропорционально расстоянию и размеру элемента
        // Для ортографической камеры масштаб зависит от frustum, для перспективной - от FOV/расстояния
        let panScaleFactorX = 1.0;
        let panScaleFactorY = 1.0;
        if (camera.isPerspectiveCamera) {
            // Для перспективной: чем дальше цель, тем больше должен быть сдвиг
             const vFov = THREE.MathUtils.degToRad(camera.fov);
             const heightScale = 2 * Math.tan(vFov / 2) * targetDistance;
             panScaleFactorX = heightScale * camera.aspect / element.clientWidth;
             panScaleFactorY = heightScale / element.clientHeight;
        } else if (camera.isOrthographicCamera) {
             // Для ортографической: масштаб зависит от размера видимой области
             panScaleFactorX = (camera.right - camera.left) / element.clientWidth;
             panScaleFactorY = (camera.top - camera.bottom) / element.clientHeight;
        }

        panOffsetX.multiplyScalar(-deltaX * panScaleFactorX);

        // Рассчитываем смещение по вертикали (вектор "вверх" от камеры)
        const panOffsetY = new THREE.Vector3();
        panOffsetY.setFromMatrixColumn(camera.matrix, 1); // Получаем Y-ось камеры
        panOffsetY.multiplyScalar(deltaY * panScaleFactorY);

        // Суммарный вектор смещения
        const panOffset = panOffsetX.add(panOffsetY);

        // Смещаем позицию камеры и цель панорамирования
        camera.position.add(panOffset);
        panTarget.add(panOffset); // Смещаем и точку, куда смотрим

        // Обновляем направление камеры (если panTarget не центр сцены)
        // camera.lookAt(panTarget); // Обновляем взгляд камеры на новую цель

        // Если вы используете OrbitControls, нужно обновить и их цель:
        // if (controls) controls.target.copy(panTarget);

        // Обновляем предыдущие координаты для панорамирования
        previousPanX = event.clientX;
        previousPanY = event.clientY;
        //requestRender();

        // Запрашиваем перерисовку, если не используется animate() постоянно
        // requestRenderIfNotRequested(); // Ваша функция запроса рендера
         // Если animate() всегда активен, эта строка не нужна

        //console.log("Panning: deltaX=", deltaX, "deltaY=", deltaY, "Offset=", panOffset); // Отладка
    }
    // --- КОНЕЦ: Панорамирование ---
});*/


document.addEventListener('keydown', (event) => {
    if (!cube) return;

    let rotateXDeg = parseFloat(rotateXSlider.value);
    let rotateYDeg = parseFloat(rotateYSlider.value);
    const step = 15;

    switch (event.key) {
        case 'ArrowUp':
            rotateXDeg = Math.min(180, rotateXDeg + step);
            cube.rotation.x = THREE.MathUtils.degToRad(rotateXDeg);
            edges.rotation.x = cube.rotation.x;
            rotateXSlider.value = rotateXDeg;
            break;
        case 'ArrowDown':
            rotateXDeg = Math.max(-180, rotateXDeg - step);
            cube.rotation.x = THREE.MathUtils.degToRad(rotateXDeg);
            edges.rotation.x = cube.rotation.x;
            rotateXSlider.value = rotateXDeg;
            break;
        case 'ArrowLeft':
            rotateYDeg = Math.max(-180, rotateYDeg - step);
            cube.rotation.y = THREE.MathUtils.degToRad(rotateYDeg);
            edges.rotation.y = cube.rotation.y;
            rotateYSlider.value = rotateYDeg;
            break;
        case 'ArrowRight':
            rotateYDeg = Math.min(180, rotateYDeg + step);
            cube.rotation.y = THREE.MathUtils.degToRad(rotateYDeg);
            edges.rotation.y = cube.rotation.y;
            rotateYSlider.value = rotateYDeg;
            break;
        case 'Enter':
            const windowMenu = document.getElementById('windowMenu');
            const socketMenu = document.getElementById('socketMenu');
            const cabinetMenu = document.getElementById('cabinetMenu');
            const kitchenParamsPopup = document.getElementById('kitchenParamsPopup');
            const configMenu = document.getElementById('cabinetConfigMenu');
        
            // Если открыто меню конфигурации, ничего не делаем
            if (configMenu && configMenu.style.display === 'block') {
                applyConfigMenuSettings(cabinetIndex);
            }
        
            if (selectedCabinets.length === 1) {
                const selected = selectedCabinets[0];
        
                if (windowMenu && windowMenu.style.display === 'block' && ['window', 'door', 'radiator', 'column', 'apron'].includes(selected.type)) {
                    applyObjectChanges(windows.indexOf(selected));
                } else if (socketMenu && socketMenu.style.display === 'block' && selected.type === 'socket') {
                    applyObjectChanges(windows.indexOf(selected));
                } else if (cabinetMenu && cabinetMenu.style.display === 'block' && ['lowerCabinet', 'upperCabinet', 'freestandingCabinet'].includes(selected.type)) {
                    applyCabinetChanges(cabinets.indexOf(selected));
                }
            } else if (kitchenParamsPopup && kitchenParamsPopup.style.display === 'block') {
                applyKitchenParams();
            } else {
                applyRoomSize();
            }
            requestRender();
            break;
        case 'z':
            if (event.ctrlKey) {
                undoLastAction();
            }
            break;
    }
    //updateRotationDisplay();
    //updateEdgeColors();
    //updateFaceBounds();
});

let lastRotationY = 0;
let lastSelectedCabinet = null;
let lastCabinetsLength = 0;
let lastOffsetAlongWall = null; // Для нижних и верхних шкафов
let lastOffsetX = null; // Для свободно стоящих шкафов
let lastOffsetZ = null; // Для свободно стоящих шкафов

// В script.js
/*
function animate() {
    // --- НАЧАЛО ИЗМЕНЕНИЯ: Проверка существования cube ---
    if (!cube) {
        // Если куб не существует (еще не создан или удален),
        // просто запрашиваем следующий кадр и выходим.
        requestAnimationFrame(animate);
        return;
    }
    // --- КОНЕЦ ИЗМЕНЕНИЯ ---

    if (!activeCamera || !scene) { // Проверяем и камеру, и сцену
        requestAnimationFrame(animate);
        return;
    }

    // Код ниже выполнится только если cube существует
    if (window.stopAnimation) {
        console.log('Animation stopped by window.stopAnimation');
        return;
    }
    requestAnimationFrame(animate); // Запрашиваем следующий кадр

    // Обновляем матрицу куба, если он есть
    if (cube) cube.updateMatrixWorld(true);
    else scene.updateMatrixWorld(true); // Обновляем всю сцену, если нет куба

    if (typeof composer !== 'undefined' && composer) {
        composer.render(); // Composer сам использует активную камеру из RenderPass
    } else {
        renderer.render(scene, activeCamera); // Используем activeCamera
    }


    // --- Остальная логика animate (проверка isRotating, isDragging, updateDimensionsInputPosition) ---
    const isRotatingNow = typeof isRotating !== 'undefined' && isRotating; // Безопасная проверка
    const isDraggingNow = typeof draggedCabinet !== 'undefined' && !!draggedCabinet; // Безопасная проверка

    const rotationChanged = cube.rotation.y !== lastRotationY; // Проверяем изменение вращения
    let positionChanged = false; // Флаг изменения позиции выделенного объекта

    // Проверка изменений для выбранного объекта
    if (selectedCabinets && selectedCabinets.length === 1) { // Проверяем selectedCabinets
        const selectedObject = selectedCabinets[0];
        if (selectedObject) { // Проверяем сам объект
            if (selectedObject.userData && selectedObject.userData.type === 'countertop') {
                // Логика проверки изменения позиции столешницы (если нужна)
                // positionChanged = lastCountertopPosX !== selectedObject.position.x || lastCountertopPosZ !== selectedObject.position.z;
            } else if (selectedObject.type === 'freestandingCabinet') {
                positionChanged = lastOffsetX !== selectedObject.offsetX || lastOffsetZ !== selectedObject.offsetZ;
            } else if (selectedObject.type && selectedObject.type !== 'countertop') { // Для других шкафов/окон
                positionChanged = lastOffsetAlongWall !== selectedObject.offsetAlongWall;
            }
        }
    }

    // Обновление позиций инпутов размеров
    if (isDraggingNow && draggedCabinet) {
        // Обновляем для перетаскиваемого объекта (если нужно показывать размеры при drag)
        // updateDimensionsInputPosition(draggedCabinet, cabinets); // Возможно, это нужно только при выделении?
    } else if (selectedCabinets && selectedCabinets.length === 1) {
        const selectedObject = selectedCabinets[0];
        if (selectedObject && (rotationChanged || positionChanged)) { // Обновляем только при изменении
             const isCountertop = selectedObject.userData?.type === 'countertop';
             if (isCountertop) {
                 // Обновление для столешницы
                  const wallId = selectedObject.userData.wallId;
                  if (wallId === 'Bottom') {
                      // Нужны границы стен для FS
                      const roomL = currentLength; const roomD = currentHeight;
                      const ctRotY = selectedObject.rotation.y;
                      const axisIsX = (Math.abs(ctRotY) < 0.1 || Math.abs(Math.abs(ctRotY) - Math.PI) < 0.1);
                      const lb = axisIsX ? -roomL/2 : -roomD/2;
                      const rb = axisIsX ? roomL/2 : roomD/2;
                      updateFreestandingCountertopDimensionsPosition(selectedObject, lb, rb);
                  } else if (['Back', 'Front', 'Left', 'Right'].includes(wallId)){
                      // Нужны границы препятствий для стенных
                      const {leftBoundary, rightBoundary} = findNearestObstacles(selectedObject, cabinets, countertops);
                      updateWallCountertopDimensionsPosition(selectedObject, leftBoundary, rightBoundary);
                  }
             } else if (true) { // Обновляем для НЕ детализированных шкафов
                 if (selectedObject.type === 'freestandingCabinet') {
                      showFreestandingCabinetDimensions(selectedObject, cabinets); // Перерисовываем с обновлением
                 } else if (['lowerCabinet', 'upperCabinet'].includes(selectedObject.type)) {
                      showCabinetDimensionsInput(selectedObject, cabinets); // Перерисовываем с обновлением
                 }
                 // Обновляем позицию существующих полей
                 updateDimensionsInputPosition(selectedObject, cabinets);
             }
        }
    }

    // Сохранение состояния для следующего кадра
    lastRotationY = cube.rotation.y;
    if (selectedCabinets && selectedCabinets.length === 1) {
        const selectedObject = selectedCabinets[0];
        if (selectedObject) {
            if (selectedObject.type === 'freestandingCabinet') {
                lastOffsetX = selectedObject.offsetX;
                lastOffsetZ = selectedObject.offsetZ;
            } else if (selectedObject.type && selectedObject.type !== 'countertop') {
                lastOffsetAlongWall = selectedObject.offsetAlongWall;
            }
            // Сохранение позиции столешницы (если нужно)
            // if (selectedObject.userData?.type === 'countertop') {
            //     lastCountertopPosX = selectedObject.position.x;
            //     lastCountertopPosZ = selectedObject.position.z;
            // }
        }
    } else { // Сбрасываем lastOffset, если ничего не выделено
        lastOffsetAlongWall = null;
        lastOffsetX = null;
        lastOffsetZ = null;
        // lastCountertopPosX = null;
        // lastCountertopPosZ = null;
    }
    // lastSelectedCabinet и lastCabinetsLength больше не используются в этой логике

} // Конец animate
*/

function renderFrame() {
  renderRequested = false;

  if (!scene || !activeCamera) return;

   // --- ИЗМЕНЕНИЕ: Добавляем controls.update() ---
  // Это должно быть здесь, чтобы рассчитать позицию камеры для этого кадра
  if (controls && controls.enabled) {
      controls.update();
  }

// --- ИЗМЕНЕНИЕ: Просто обновляем всю сцену, а не только куб ---
  scene.updateMatrixWorld(true);

  if (typeof composer !== 'undefined' && composer) {
    composer.render();
  } else {
    renderer.render(scene, activeCamera);
  }

  // --- Обновление UI/оверлеев ---
  //const isRotatingNow = typeof isRotating !== 'undefined' && isRotating;
  const isDraggingNow = typeof draggedCabinet !== 'undefined' && !!draggedCabinet;

  //const rotationChanged = cube ? (cube.rotation.y !== lastRotationY) : false;
  let positionChanged = false;

  if (selectedCabinets && selectedCabinets.length === 1) {
    const selectedObject = selectedCabinets[0];
    if (selectedObject) {
      if (selectedObject.type === 'freestandingCabinet') {
        positionChanged = lastOffsetX !== selectedObject.offsetX || lastOffsetZ !== selectedObject.offsetZ;
      } else if (selectedObject.type && selectedObject.type !== 'countertop') {
        positionChanged = lastOffsetAlongWall !== selectedObject.offsetAlongWall;
      }
    }
  }

  if (isDraggingNow && draggedCabinet) {
    // updateDimensionsInputPosition(draggedCabinet, cabinets);
  } else if (selectedCabinets && selectedCabinets.length === 1) {
    const selectedObject = selectedCabinets[0];
    if (selectedObject && (positionChanged)) {
      const isCountertop = selectedObject.userData?.type === 'countertop';
      if (isCountertop) {
        const wallId = selectedObject.userData.wallId;
        if (wallId === 'Bottom') {
          const roomL = currentLength; const roomD = currentHeight;
          const ctRotY = selectedObject.rotation.y;
          const axisIsX = (Math.abs(ctRotY) < 0.1 || Math.abs(Math.abs(ctRotY) - Math.PI) < 0.1);
          const lb = axisIsX ? -roomL/2 : -roomD/2;
          const rb = axisIsX ?  roomL/2 :  roomD/2;
          updateFreestandingCountertopDimensionsPosition(selectedObject, lb, rb);
        } else if (['Back', 'Front', 'Left', 'Right'].includes(wallId)) {
          const {leftBoundary, rightBoundary} = findNearestObstacles(selectedObject, cabinets, countertops);
          updateWallCountertopDimensionsPosition(selectedObject, leftBoundary, rightBoundary);
        }
      } else {
        if (selectedObject.type === 'freestandingCabinet') {
          showFreestandingCabinetDimensions(selectedObject, cabinets);
        } else if (['lowerCabinet', 'upperCabinet'].includes(selectedObject.type)) {
          showCabinetDimensionsInput(selectedObject, cabinets);
        }
        updateDimensionsInputPosition(selectedObject, cabinets);
      }
    }
  }

  if (selectedCabinets && selectedCabinets.length === 1) {
    const selectedObject = selectedCabinets[0];
    if (selectedObject) {
      if (selectedObject.type === 'freestandingCabinet') {
        lastOffsetX = selectedObject.offsetX;
        lastOffsetZ = selectedObject.offsetZ;
      } else if (selectedObject.type && selectedObject.type !== 'countertop') {
        lastOffsetAlongWall = selectedObject.offsetAlongWall;
      }
    }
  } else {
    lastOffsetAlongWall = null;
    lastOffsetX = null;
    lastOffsetZ = null;
  }

  if (shouldContinue()) {
    requestRender();
  }
}


let facadeOptionsData = null; // Глобальная переменная для хранения данных

async function loadFacadeOptions() {
    if (facadeOptionsData) return facadeOptionsData;
    try {
        const response = await fetch('./facadeData.json'); // Убедитесь, что путь верный
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const loadedData = await response.json(); // Сначала в локальную переменную
        //console.log("Данные опций фасадов успешно загружены:", loadedData);

        // --- ИСПРАВЛЕНИЕ: Присваиваем глобальной переменной ---
        facadeOptionsData = loadedData; // Для использования внутри script.js
        window.facadeOptionsData = loadedData; // Для доступа из menus.js
        // ----------------------------------------------------

        return facadeOptionsData; // Возвращаем загруженные данные
    } catch (error) {
        console.error("Ошибка загрузки данных опций фасадов:", error);
        alert("Не удалось загрузить данные для фасадов...");
        facadeOptionsData = {}; // Устанавливаем пустой объект при ошибке
        window.facadeOptionsData = {}; // И для window тоже
        return facadeOptionsData;
    }
}

/*
async function init() { // <-- Делаем функцию асинхронной
    try { 
        // --- 0. Предварительная загрузка моделей ---
        await preloadAllModels(); // ЖДЕМ загрузки всех моделей

        if (!allModelsLoaded && modelsToPreload.length > 0) {
            // Если есть модели в списке, но не все загрузились, возможно, стоит прервать
            // или показать более серьезное предупреждение.
            console.error("Не все обязательные модели были загружены. Дальнейшая работа может быть нестабильной.");
            // return; // Раскомментировать, если хотите остановить инициализацию при ошибке загрузки моделей
        }

        // --- 0.3 Инициализация рендерера ---
        initRenderer('canvasContainer');
        initRoomManagerDOM(); // Инициализируем DOM-элементы, используемые в roomManager
        // ---0.5 слушатели на кнопки
        const applySizeButton = document.getElementById('applySizeButton'); // Дайте кнопке ID
        if (applySizeButton) {
            applySizeButton.addEventListener('click', applyRoomSize);
        }
        const leftButton = document.getElementById('leftViewButton'); // Дайте кнопкам ID
        if (leftButton) {
            leftButton.addEventListener('click', () => {
                setLeftView(); // Вызываем импортированную функцию из roomManager
                updateRendererAndPostprocessingCamera(); // Обновляем рендерер/пост-обработку
            });
        }
        // Аналогично для Front, Top, 3D (setIsometricView)
        const frontButton = document.getElementById('frontViewButton');
        if (frontButton) {
            frontButton.addEventListener('click', () => {
                setFrontView();
                updateRendererAndPostprocessingCamera();
            });
        }
        const topButton = document.getElementById('topViewButton');
        if (topButton) {
            topButton.addEventListener('click', () => {
                setTopView();
                updateRendererAndPostprocessingCamera();
            });
        }
        const isometricButton = document.getElementById('isometricViewButton');
        if (isometricButton) {
            isometricButton.addEventListener('click', () => {
                setIsometricView();
                updateRendererAndPostprocessingCamera();
            });
        }


        // --- 1. Загрузка данных фасадов (Асинхронно) ---
        await loadFacadeOptions(); // Дожидаемся загрузки данных
        // Инициализируем глобальный массив для данных ИЗ DOM (если его еще нет)
        // или загружаем из localStorage
        window.facadeSetsData = JSON.parse(localStorage.getItem('facadeSets')) || [];

        // --- 2. Чтение размеров комнаты и цвета ---
        let length = parseFloat(document.getElementById('length').value) || 3500;
        let height = parseFloat(document.getElementById('height').value) || 2600;
        let width = parseFloat(document.getElementById('width').value) || 2500;
        const color = document.getElementById('cubeColor').value || '#d3d3d3';

        length = Math.max(100, Math.min(10000, length)) / 1000;
        height = Math.max(100, Math.min(10000, height)) / 1000;
        width = Math.max(100, Math.min(10000, width)) / 1000;

        // --- 4. Создание комнаты (куба) ---
        createCube(length, height, width, color, THREE.MathUtils.degToRad(30), THREE.MathUtils.degToRad(-30));
        if (!cube) { // Проверяем, создался ли куб
             throw new Error("Не удалось создать основной куб сцены в createCube.");
        }

        // --- 5. Запуск анимации ---
        if (typeof animate === 'function') {
            animate();
        } else { throw new Error("Функция animate не найдена!"); }

        // --- 6. Первоначальное обновление UI ---
        if (typeof updateSelectedFaceDisplay === 'function') updateSelectedFaceDisplay(); else console.warn("updateSelectedFaceDisplay не найдена");
        if (typeof updateEdgeColors === 'function') updateEdgeColors(); else console.warn("updateEdgeColors не найдена");
        if (typeof updateCountertopButtonVisibility === 'function') updateCountertopButtonVisibility(); else console.warn("updateCountertopButtonVisibility не найдена");
        if (typeof updateHint === 'function') updateHint("Конструктор готов к работе."); else console.warn("updateHint не найдена");

        // --- 7. Инициализация Drag-and-Drop из панели ---
        if (typeof initDragAndDrop === 'function') {
            initDragAndDrop();
        } else { console.warn("Функция initDragAndDrop не найдена!"); }

    } catch (error) {
        console.error("!!! КРИТИЧЕСКАЯ ОШИБКА ИНИЦИАЛИЗАЦИИ:", error);
        alert("Ошибка инициализации конструктора. Работа приложения может быть нарушена. Смотрите консоль разработчика (F12).");
        // Можно добавить здесь код для отображения сообщения об ошибке пользователю на странице
    }
}
*/

async function init() {
  try {
    await preloadAllModels();

    if (!allModelsLoaded && modelsToPreload.length > 0) {
      console.error("Не все обязательные модели были загружены.");
    }

    initRenderer('canvasContainer');
    controls.addEventListener('change', () => {
      // Каждый раз, когда OrbitControls меняет камеру (даже во время инерции),
      // мы запрашиваем перерисовку одного кадра.
      requestRender();

      // Это также идеальное место для обновления UI, которое зависит от вида камеры!
      if (selectedCabinets && selectedCabinets.length === 1) {
        // Обновляем позицию инпутов размеров, так как изменение вида камеры требует их пересчета.
        updateDimensionsInputPosition(selectedCabinets[0], cabinets);
      }
    });
    initRoomManagerDOM();

    const applySizeButton = document.getElementById('applySizeButton');
   if (applySizeButton) {
      applySizeButton.addEventListener('click', () => {
        applyRoomSize();
        // requestRender() здесь все еще полезен на случай, если размеры не изменились, но цвет да.
        requestRender();
      });
    }

    const leftButton = document.getElementById('leftViewButton');
    if (leftButton) {
      leftButton.addEventListener('click', () => {
        setLeftView();
        updateRendererAndPostprocessingCamera();
      });
    }

    const frontButton = document.getElementById('frontViewButton');
    if (frontButton) {
      frontButton.addEventListener('click', () => {
        setFrontView();
        updateRendererAndPostprocessingCamera();
      });
    }

    const topButton = document.getElementById('topViewButton');
    if (topButton) {
      topButton.addEventListener('click', () => {
        setTopView();
        updateRendererAndPostprocessingCamera();
      });
    }

    const isometricButton = document.getElementById('isometricViewButton');
    if (isometricButton) {
      isometricButton.addEventListener('click', () => {
        setIsometricView();
        updateRendererAndPostprocessingCamera();
      });
    }

    await loadFacadeOptions();
    window.facadeSetsData = JSON.parse(localStorage.getItem('facadeSets')) || [];

    let length = parseFloat(document.getElementById('length').value) || 3500;
    let height = parseFloat(document.getElementById('height').value) || 2600;
    let width = parseFloat(document.getElementById('width').value) || 2500;
    const color = document.getElementById('cubeColor').value || '#d3d3d3';

    length = Math.max(100, Math.min(10000, length)) / 1000;
    height = Math.max(100, Math.min(10000, height)) / 1000;
    width = Math.max(100, Math.min(10000, width)) / 1000;

    createCube(length, height, width, color);
    if (!cube) {
      throw new Error("Не удалось создать куб.");
    }

    requestRender(); // ⬅️ Первый старт рендера после подготовки сцены

    if (typeof updateSelectedFaceDisplay === 'function') updateSelectedFaceDisplay();
    if (typeof updateEdgeColors === 'function') updateEdgeColors();
    if (typeof updateCountertopButtonVisibility === 'function') updateCountertopButtonVisibility();
    if (typeof updateHint === 'function') updateHint("Конструктор готов к работе.");

    if (typeof initDragAndDrop === 'function') initDragAndDrop();

  } catch (error) {
    console.error("!!! КРИТИЧЕСКАЯ ОШИБКА ИНИЦИАЛИЗАЦИИ:", error);
    alert("Ошибка инициализации конструктора. Работа приложения может быть нарушена.");
  }
}



//init();

// Переменные для drag-and-drop
let isDragging = false;
let draggedCabinetType = null;


function initDragAndDrop() {
    const lowerCabinetButton = document.querySelector('#lowerCabinetContainer .lower-cabinet');
    const upperCabinetButton = document.querySelector('#lowerCabinetContainer .upper-cabinet');

    // Обработчик для нижнего шкафа
    lowerCabinetButton.addEventListener('mousedown', (event) => {
        if (selectedFaceIndex === -1) return;
        isDragging = true;
        draggedCabinetType = 'lowerCabinet'; // Сохраняем тип
        event.preventDefault();
        //console.log('Started dragging lower cabinet');
    });

    // Обработчик для верхнего шкафа
    upperCabinetButton.addEventListener('mousedown', (event) => {
        if (selectedFaceIndex === -1) return;
        isDragging = true;
        draggedCabinetType = 'upperCabinet'; // Сохраняем тип
        event.preventDefault();
        //console.log('Started dragging upper cabinet');
    });

    document.addEventListener('mousemove', (event) => {
        if (!isDragging) return;
        // Можно добавить визуальный индикатор перетаскивания, если нужно
    });

    document.addEventListener('mouseup', (event) => {
        if (!isDragging) return;
        isDragging = false;

        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, activeCamera);
        const intersects = raycaster.intersectObject(cube, false);

        if (intersects.length > 0 && selectedFaceIndex !== -1) {
            const wallId = faceNormals[selectedFaceIndex].id;
            if (wallId === 'Bottom') {
                addFreestandingCabinet(intersects[0].point);
            } else if (['Back', 'Left', 'Right'].includes(wallId)) {
                if (draggedCabinetType === 'lowerCabinet') {
                    addCabinet(intersects[0].point);
                } else if (draggedCabinetType === 'upperCabinet') {
                    addUpperCabinet(intersects[0].point);
                }
            }
        }

        // Сбрасываем тип после завершения перетаскивания
        draggedCabinetType = null;
    });
}

function addCabinet(intersectPoint) {
    // --- Блок 1: Сохранение состояния и проверка условий ---
    // Сохраняем текущее состояние для возможности отмены и проверяем выбор грани
    if (selectedFaceIndex === null) {
        alert("Пожалуйста, выберите грань для добавления шкафа.");
        return;
    }
    saveState("addCabinet", { wallId: faceNormals[selectedFaceIndex].id });

    // --- Блок 2: Подготовка параметров ---
    // Получаем ID стены и базовые параметры шкафа
    const wallId = faceNormals[selectedFaceIndex].id;
    const params = objectTypes['lowerCabinet'];

    // Используем kitchenGlobalParams вместо старого меню
    const countertopHeight = kitchenGlobalParams.countertopHeight / 1000; // Переводим мм в метры
    const countertopThickness = kitchenGlobalParams.countertopThickness / 1000;
    const plinthHeight = kitchenGlobalParams.plinthHeight / 1000;
    const countertopDepth = kitchenGlobalParams.countertopDepth / 1000;

    // Устанавливаем размеры и отступы шкафа
    params.defaultHeight = countertopHeight - countertopThickness - plinthHeight;
    params.defaultOffsetBottom = plinthHeight;
    //params.defaultoffsetFromParentWall = countertopDepth - params.defaultDepth - params.overhang - params.facadeThickness;
    // Используем новую функцию (нужно передать "черновик" объекта шкафа):
    const tempCabData = {
        wallId: wallId,
        type: 'lowerCabinet',
        depth: params.defaultDepth,
        overhang: params.overhang,
        facadeThickness: params.facadeThickness
    };
    params.defaultoffsetFromParentWall = calculateLowerCabinetOffset(tempCabData);

    // --- Блок 3: Расчёт позиции относительно intersectPoint ---
    // Преобразуем точку пересечения в локальные координаты комнаты
    const localPoint = intersectPoint.clone().applyMatrix4(cube.matrixWorld.clone().invert());
    let offsetAlongWall;

    switch (wallId) {
        case "Back":
            offsetAlongWall = localPoint.x + currentLength / 2 - params.defaultWidth / 2;
            offsetAlongWall = Math.round(offsetAlongWall * 1000) / 1000; // Округляем до мм
            break;
        case "Left":
        case "Right":
            offsetAlongWall = localPoint.z + currentHeight / 2 - params.defaultWidth / 2;
            offsetAlongWall = Math.round(offsetAlongWall * 1000) / 1000;
            break;
    }

    // --- Блок 4: Создание 3D-объекта ---
    // Создаём геометрию, материал и рёбра шкафа
    const geometry = new THREE.BoxGeometry(params.defaultWidth, params.defaultHeight, params.defaultDepth);
    const material = new THREE.MeshStandardMaterial({ color: params.initialColor });
    const mesh = new THREE.Mesh(geometry, material);

    const edgesGeometry = new THREE.EdgesGeometry(geometry);
    const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edges.raycast = () => {}; // Отключаем raycast для рёбер
    mesh.add(edges);

    // --- Блок 5: Позиционирование шкафа ---
    // Устанавливаем позицию и поворот в зависимости от стены
    switch (wallId) {
        case "Back":
            mesh.position.set(
                -currentLength / 2 + offsetAlongWall + params.defaultWidth / 2,
                -currentWidth / 2 + params.defaultOffsetBottom + params.defaultHeight / 2,
                -currentHeight / 2 + params.defaultoffsetFromParentWall + params.defaultDepth / 2
            );
            break;
        case "Left":
            mesh.position.set(
                -currentLength / 2 + params.defaultoffsetFromParentWall + params.defaultDepth / 2,
                -currentWidth / 2 + params.defaultOffsetBottom + params.defaultHeight / 2,
                -currentHeight / 2 + offsetAlongWall + params.defaultWidth / 2
            );
            mesh.rotation.y = THREE.MathUtils.degToRad(90);
            break;
        case "Right":
            mesh.position.set(
                currentLength / 2 - params.defaultoffsetFromParentWall - params.defaultDepth / 2,
                -currentWidth / 2 + params.defaultOffsetBottom + params.defaultHeight / 2,
                -currentHeight / 2 + offsetAlongWall + params.defaultWidth / 2
            );
            mesh.rotation.y = THREE.MathUtils.degToRad(-90);
            break;
    }

    // --- Блок 6: Добавление в сцену и создание объекта ---
    // Добавляем шкаф в комнату и сохраняем его в массив cabinets
    scene.add(mesh);
    mesh.renderOrder = 1;
    const obj = {
        mesh: mesh,
        wallId: wallId,
        initialColor: params.initialColor,
        width: params.defaultWidth,
        height: params.defaultHeight,
        depth: params.defaultDepth,
        offsetAlongWall: offsetAlongWall,
        offsetBottom: params.defaultOffsetBottom,
        offsetFromParentWall: params.defaultoffsetFromParentWall,
        type: 'lowerCabinet',
        edges: edges,
        overhang: params.overhang,
        facadeThickness: params.facadeThickness,
        facadeGap: 0.003,
        isHeightIndependent: false,
        isHeightEditable: false,
        cabinetType: 'straight',
        cabinetConfig: 'swing',
        isDetailed: false, // <--- Add this flag for switch to detailed version
        dishwasherWidth: '600',     // ширина посудомойки по умолчанию
        doorType: 'double',
        shelfType: 'none',
        shelfCount: 0,
        facadeCount: '2',
        drawerSet: 'D+D',
        ovenHeight: '600',
        ovenPosition: 'top',
        extraOffset: 0,
        ovenType: '600',
        ovenLevel: 'drawer',
        microwaveType: '362',
        underOvenFill: 'drawers',
        topShelves: '2',
        fridgeType: 'double',
        shelvesAbove: '1',
        visibleSide: 'none',
        doorOpening: 'left',
        verticalProfile: 'none',
        rearStretcher: 'horizontal',
        frontStretcher: 'horizontal',
        rearPanel: 'yes',
        //falsePanels: 'none',
        stretcherDrop: 0,
        facadeSet: 'set1',
        //highDividerDepth: 560,   //глубина вертикальной стойки-разделителя
        verticalGolaProfile: 'none',
        gapAboveTopFacadeMm: 3, // Дефолтный зазор 3 мм - над верхним фасадом для высоких шкафов
        fridgeNicheHeightMm: 1780, // Дефолтная высота ниши
        freezerFacadeHeightMm: 760,
        topFacade2HeightMm: 0,
        ovenColor: 'metallic'
    };
    obj.id_data = THREE.MathUtils.generateUUID();
    console.log("[addCabinet] Перед push, cabinets (ссылка):", cabinets);
    console.log("[addCabinet] ID в cabinets перед push:", cabinets.map(c => c.id_data));
    console.log("[addCabinet] Добавляемый obj.id_data:", obj.id_data);
    cabinets.push(obj);
    console.log("[addCabinet] После push, cabinets (ссылка):", cabinets);
    console.log("[addCabinet] ID в cabinets после push:", cabinets.map(c => c.id_data));

    // --- Блок 7: Визуальная индикация и вызов меню ---
    // Устанавливаем временный цвет и открываем меню конфигурации
    //mesh.material.color.set(0x00ffff);
    //edges.material.color.set(0x00ffff);
    mesh.material.needsUpdate = true;
    edges.material.needsUpdate = true;

    const center = new THREE.Vector3();
    mesh.getWorldPosition(center);
    const screenPos = center.project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    const x = (screenPos.x + 1) * rect.width / 2 + rect.left;
    const y = (-screenPos.y + 1) * rect.height / 2 + rect.top;
    updateCabinetPosition(obj);
    showCabinetMenu(x, y, obj);
}

function addUpperCabinet(intersectPoint) {
    // --- Блок 1: Сохранение состояния и проверка условий ---
    // Сохраняем текущее состояние и проверяем выбор грани
    if (selectedFaceIndex === null) {
        alert("Пожалуйста, выберите грань для добавления верхнего шкафа.");
        return;
    }
    saveState("addUpperCabinet", { wallId: faceNormals[selectedFaceIndex].id });

    // --- Блок 2: Подготовка параметров ---
    // Получаем ID стены и базовые параметры шкафа
    const wallId = faceNormals[selectedFaceIndex].id;
    const params = objectTypes['upperCabinet'];

    // Используем kitchenGlobalParams вместо старого меню
    const totalHeight = kitchenGlobalParams.totalHeight / 1000; // Переводим мм в метры
    const countertopHeight = kitchenGlobalParams.countertopHeight / 1000;
    const apronHeight = kitchenGlobalParams.apronHeight / 1000;

    // Устанавливаем размеры и отступы шкафа
    params.defaultHeight = totalHeight - countertopHeight - apronHeight;
    params.defaultOffsetBottom = countertopHeight + apronHeight;
    params.defaultoffsetFromParentWall = 0; // Верхние шкафы обычно у стены

    // --- Блок 3: Расчёт позиции относительно intersectPoint ---
    // Преобразуем точку пересечения в локальные координаты комнаты
    const localPoint = intersectPoint.clone().applyMatrix4(cube.matrixWorld.clone().invert());
    let offsetAlongWall;

    switch (wallId) {
        case "Back":
            offsetAlongWall = localPoint.x + currentLength / 2 - params.defaultWidth / 2;
            offsetAlongWall = Math.round(offsetAlongWall * 1000) / 1000; // Округляем до мм
            break;
        case "Left":
        case "Right":
            offsetAlongWall = localPoint.z + currentHeight / 2 - params.defaultWidth / 2;
            offsetAlongWall = Math.round(offsetAlongWall * 1000) / 1000;
            break;
    }

    // --- Блок 4: Создание 3D-объекта ---
    // Создаём геометрию, материал и рёбра шкафа
    const geometry = new THREE.BoxGeometry(params.defaultWidth, params.defaultHeight, params.defaultDepth);
    const material = new THREE.MeshStandardMaterial({ color: params.initialColor });
    const mesh = new THREE.Mesh(geometry, material);

    const edgesGeometry = new THREE.EdgesGeometry(geometry);
    const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edges.raycast = () => {}; // Отключаем raycast для рёбер
    mesh.add(edges);

    // --- Блок 5: Позиционирование шкафа ---
    // Устанавливаем позицию и поворот в зависимости от стены
    switch (wallId) {
        case "Back":
            mesh.position.set(
                -currentLength / 2 + offsetAlongWall + params.defaultWidth / 2,
                -currentWidth / 2 + params.defaultOffsetBottom + params.defaultHeight / 2,
                -currentHeight / 2 + params.defaultoffsetFromParentWall + params.defaultDepth / 2
            );
            break;
        case "Left":
            mesh.position.set(
                -currentLength / 2 + params.defaultoffsetFromParentWall + params.defaultDepth / 2,
                -currentWidth / 2 + params.defaultOffsetBottom + params.defaultHeight / 2,
                -currentHeight / 2 + offsetAlongWall + params.defaultWidth / 2
            );
            mesh.rotation.y = THREE.MathUtils.degToRad(90);
            break;
        case "Right":
            mesh.position.set(
                currentLength / 2 - params.defaultoffsetFromParentWall - params.defaultDepth / 2,
                -currentWidth / 2 + params.defaultOffsetBottom + params.defaultHeight / 2,
                -currentHeight / 2 + offsetAlongWall + params.defaultWidth / 2
            );
            mesh.rotation.y = THREE.MathUtils.degToRad(-90);
            break;
    }

    // --- Блок 6: Добавление в сцену и создание объекта ---
    // Добавляем шкаф в комнату и сохраняем его в массив cabinets
    scene.add(mesh);
    const obj = {
        mesh: mesh,
        wallId: wallId,
        id_data: THREE.MathUtils.generateUUID(),
        initialColor: params.initialColor,
        width: params.defaultWidth,
        height: params.defaultHeight,
        depth: params.defaultDepth,
        offsetAlongWall: offsetAlongWall,
        offsetBottom: params.defaultOffsetBottom,
        offsetFromParentWall: params.offsetFromParentWall, // <--- Используем новый параметр
        //offsetFromParentWall: params.defaultoffsetFromParentWall,
        type: 'upperCabinet',
        cabinetType: 'straightUpper',
        cabinetConfig: 'swingUpper',
        isMezzanine: 'normal',
        edges: edges,
        facadeThickness: params.facadeThickness,
        facadeGap: params.facadeGap,
        isHeightIndependent: true, // Изменяем с false на true
        isDetailed: false, // <--- Add this flag for switch to detailed version
        isHeightEditable: false
    };
    cabinets.push(obj);

    // --- Блок 7: Визуальная индикация и вызов меню ---
    // Устанавливаем временный цвет и открываем меню конфигурации
    mesh.material.color.set(0xEEEEEE);
    //edges.material.color.set(0x00ffff);
    mesh.material.needsUpdate = true;
    edges.material.needsUpdate = true;

    const center = new THREE.Vector3();
    mesh.getWorldPosition(center);
    const screenPos = center.project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    const x = (screenPos.x + 1) * rect.width / 2 + rect.left;
    const y = (-screenPos.y + 1) * rect.height / 2 + rect.top;
    updateCabinetPosition(obj);
    showCabinetMenu(x, y, obj);
}

// Вызовем инициализацию drag-and-drop после init
document.addEventListener('DOMContentLoaded', init);
/*
// Функция сохранения проекта
function saveProject() {
    const projectState = {
        room: {
            length: currentLength,
            height: currentWidth,
            width: currentHeight,
            color: document.getElementById('cubeColor').value,
            rotationX: cube.rotation.x,
            rotationY: cube.rotation.y
        },
        camera: {
            position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
            fov: camera.fov
        },
        kitchenParams: { ...kitchenGlobalParams },
        windows: windows.map(obj => ({
           // Сохраняем данные из исходного объекта в массиве windows
           ...obj, // Осторожно: убедись, что obj не содержит циклических ссылок или не-JSON данных
           // Лучше явно указывать сохраняемые поля: type, width, height, depth, wallId и т.д.
            mesh: undefined, // Не сохраняем сам mesh
            edges: undefined, // Не сохраняем edges
            // Явно сохраняем нужные свойства из mesh
            position: { x: obj.mesh.position.x, y: obj.mesh.position.y, z: obj.mesh.position.z },
            rotation: { y: obj.mesh.rotation.y }, // Сохраняем только Y? Может потребоваться полное сохранение
            initialColor: typeof obj.initialColor === 'number' ? `#${obj.initialColor.toString(16).padStart(6, '0')}` : obj.initialColor
        })),
        cabinets: cabinets.map(cabinet => ({
           // Аналогично окнам, лучше явно указать поля для сохранения из объекта cabinet
           ...cabinet, // Осторожно с этим
           mesh: undefined,
           edges: undefined,
           // Явно сохраняем нужные свойства из mesh
           position: { x: cabinet.mesh.position.x, y: cabinet.mesh.position.y, z: cabinet.mesh.position.z },
           rotation: { y: cabinet.mesh.rotation.y },
           initialColor: typeof cabinet.initialColor === 'number' ? `#${cabinet.initialColor.toString(16).padStart(6, '0')}` : cabinet.initialColor
        })),
        // ---- НАЧАЛО: Добавленный блок для столешниц ----
        countertops: countertops.map(ct => {
            // ct - это объект столешницы (вероятно, THREE.Mesh или THREE.Group)
            if (!ct || !ct.userData) {
                console.warn("Skipping invalid countertop object during save:", ct);
                return null; // Пропускаем некорректные объекты
            }
            return {
               // Основные данные из userData
               type: ct.userData.type, // 'countertop'
               wallId: ct.userData.wallId,
               length: ct.userData.length,
               depth: ct.userData.depth,
               thickness: ct.userData.thickness,
               offsetAlongWall: ct.userData.offsetAlongWall,
               countertopType: ct.userData.countertopType,
               materialType: ct.userData.materialType,
               solidColor: ct.userData.solidColor,
               // Трансформации объекта
               uuid: ct.uuid, // Уникальный ID объекта Three.js
               position: { x: ct.position.x, y: ct.position.y, z: ct.position.z },
               // Сохраняем полное вращение (в радианах) и порядок осей
               rotation: { x: ct.rotation.x, y: ct.rotation.y, z: ct.rotation.z, order: ct.rotation.order },
               scale: { x: ct.scale.x, y: ct.scale.y, z: ct.scale.z }
               // Не сохраняем userData.edges и userData.initialMaterial - их воссоздадим при загрузке
            };
       }).filter(data => data !== null) // Убираем null, если были некорректные объекты
       // ---- КОНЕЦ: Добавленный блок для столешниц ----
    };

    // Удаляем ссылки на mesh/edges из сохраненных данных окон и шкафов, если использовали `...obj`
    // Лучше изначально не копировать их, а перечислять нужные поля явно
    projectState.windows.forEach(w => { delete w.mesh; delete w.edges;  });
    projectState.cabinets.forEach(c => { delete c.mesh; delete c.edges;  });

    const json = JSON.stringify(projectState, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'kitchen_project.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    console.log("Project saved (with countertops)");
}

// Функция загрузки проекта
function loadProject() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (event) => {
        const file = event.target.files[0];
        selectedCabinets = []; // <--- ОЧИСТКА ВЫДЕЛЕНИЯ
        selectedCabinet = null;
        cabinets = [];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try { 
                    const projectState = JSON.parse(e.target.result);

                    // ---- НАЧАЛО: Очистка старых объектов ----
                    // Очищаем текущие объекты из сцены и массивов
                    windows.forEach(obj => obj.mesh && cube.remove(obj.mesh)); // Проверяем наличие mesh
                    cabinets.forEach(cabinet => cabinet.mesh && cube.remove(cabinet.mesh));
                    countertops.forEach(ct => { // <<-- Добавлена очистка столешниц
                        if (ct) { // Проверяем сам объект ct
                           cube.remove(ct); // Удаляем основной объект столешницы (mesh/group)
                           if (ct.userData && ct.userData.edges) { // Проверяем userData и edges
                               cube.remove(ct.userData.edges); // Удаляем ребра, если они в cube
                           }
                        }
                    });
                    windows = [];
                    cabinets = [];
                    countertops = []; // <<-- Добавлена очистка массива столешниц
                    // ---- КОНЕЦ: Очистка старых объектов ----

                    // Восстанавливаем комнату
                    createCube(
                        projectState.room.length,
                        projectState.room.height,
                        projectState.room.width,
                        projectState.room.color,
                        projectState.room.rotationX,
                        projectState.room.rotationY
                    );

                    // Синхронизируем поля ввода комнаты
                    document.getElementById('length').value = projectState.room.length * 1000;
                    document.getElementById('height').value = projectState.room.height * 1000;
                    document.getElementById('width').value = projectState.room.width * 1000;
                    document.getElementById('cubeColor').value = projectState.room.color;

                    // Восстанавливаем параметры кухни
                    // Убедись, что kitchenGlobalParams существует и используется
                    if (projectState.kitchenParams && typeof kitchenGlobalParams !== 'undefined') {
                        Object.assign(kitchenGlobalParams, projectState.kitchenParams);
                     }

                    // Восстанавливаем окна
                    if (projectState.windows) { // Добавим проверку на существование
                        windows = projectState.windows.map(obj => {
                            const mesh = new THREE.Mesh(
                                new THREE.BoxGeometry(obj.width, obj.height, obj.depth),
                                new THREE.MeshStandardMaterial({ color: obj.initialColor })
                            );
                            const edgesGeometry = new THREE.EdgesGeometry(mesh.geometry);
                            const edges = new THREE.LineSegments(edgesGeometry, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }));
                            edges.raycast = () => {};
                            mesh.add(edges);
                            mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
                            mesh.rotation.y = obj.rotation.y;
                            cube.add(mesh);
                            const { position, rotation, ...rest } = obj;
                            return { ...rest, mesh, edges };
                        });
                    }

                    // Восстанавливаем шкафы
                    if (projectState.cabinets) { // Добавим проверку на существование
                        cabinets = projectState.cabinets.map(cabinet => {
                            const mesh = new THREE.Mesh(
                                new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth),
                                new THREE.MeshStandardMaterial({ color: cabinet.initialColor })
                            );
                            const edgesGeometry = new THREE.EdgesGeometry(mesh.geometry);
                            const edges = new THREE.LineSegments(edgesGeometry, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }));
                            edges.raycast = () => {};
                            mesh.add(edges);
                            mesh.position.set(cabinet.position.x, cabinet.position.y, cabinet.position.z);
                            mesh.rotation.y = cabinet.rotation.y;
                            cube.add(mesh);

                            // Удаляем mesh из объекта, чтобы не дублировать ссылку
                            const { position, rotation, ...rest } = cabinet;
                            return { ...rest, mesh, edges };
                        });
                    }

                    // ---- НАЧАЛО: Добавленный блок для столешниц ----
                    if (projectState.countertops) { // Проверяем, есть ли данные столешниц
                        projectState.countertops.forEach(ctData => {
                            if (!ctData) return; // Пропускаем null/undefined записи

                            // Нужна функция для воссоздания столешницы по данным
                            const newCountertop = createCountertopFromData(ctData);

                            if (newCountertop) {
                                // Добавляем воссозданный объект в массив
                                countertops.push(newCountertop);
                                // Добавлять в cube не нужно, если createCountertopFromData это уже делает
                            } else {
                                console.warn("Failed to create countertop from data:", ctData);
                            }
                        });
                    }
                    // ---- КОНЕЦ: Добавленный блок для столешниц ----

                    // Синхронизируем камеру
                    camera.position.set(
                        projectState.camera?.position.x ?? 0,
                        projectState.camera?.position.y ?? 0,
                        projectState.camera?.position.z ?? 10
                    );
                    camera.fov = projectState.camera?.fov ?? 30;
                    camera.updateProjectionMatrix();
                    camera.lookAt(0, 0, 0);
                    //controls.target.set(0, 0, 0); // Обнови и цель для OrbitControls, если используешь
                    //controls.update(); // Обнови контроллер камеры

                    // Обновляем интерфейс
                    rotateXSlider.value = THREE.MathUtils.radToDeg(projectState.room.rotationX);
                    rotateYSlider.value = THREE.MathUtils.radToDeg(projectState.room.rotationY);
                    //updateRotationDisplay();
                    //updateEdgeColors();
                    //updateSelectedFaceDisplay();
                    //updateFaceBounds();

                    console.log("Project loaded (with countertops)");
                } catch (error) {
                    console.error("Failed to load project:", error);
                    alert("Ошибка при загрузке файла проекта. Файл поврежден или имеет неверный формат.");
                }
            };
            reader.readAsText(file);
        }
    };
    input.click();
}*/


// --- saveProject ---
function saveProject() {
    console.log("[saveProject] Начало сохранения проекта...");
    const projectState = {
        room: { // Сохраняем только размеры, цвет будет дефолтным при загрузке или из kitchenGlobalParams
            length: currentLength,
            height: currentWidth, // currentWidth - это высота комнаты (Y)
            width: currentHeight,  // currentHeight - это глубина комнаты (Z)
            // color: document.getElementById('cubeColor').value // Решили не сохранять, будет дефолт
        },
        // camera: { ... } // Решили не сохранять
        kitchenParams: { ...kitchenGlobalParams }, // Копируем все глобальные параметры кухни
        
        windows: windows.map(obj => {
            if (!obj) return null;
            // Сохраняем только необходимые данные, исключая mesh, edges и любые временные/вычисляемые свойства
            const { mesh, edges, ...dataToSave } = obj;
            return dataToSave;
        }).filter(Boolean), // Удаляем null если были некорректные объекты

        cabinets: cabinets.map(cabinet => {
            if (!cabinet) return null;
            // Исключаем mesh, edges, boundaries, calculatedPosition, calculatedRotation, frontMarker
            // и другие временные или специфичные для рендеринга свойства
            const { 
                mesh, 
                edges, 
                boundaries, 
                calculatedPosition, 
                calculatedRotation, 
                frontMarker, // Если есть такое свойство
                uuidForDetailing, // Если добавляли временное
                // Добавьте сюда другие свойства, которые не нужно сохранять
                ...dataToSave 
            } = cabinet;
            
            // Убедимся, что id_data сохраняется, если оно есть (оно должно быть)
            if (!dataToSave.id_data && cabinet.id_data) {
                 dataToSave.id_data = cabinet.id_data;
            } else if (!dataToSave.id_data) { // Если вдруг его нет, сгенерируем при загрузке
                 console.warn("[saveProject] У шкафа отсутствует id_data, будет сгенерирован при загрузке:", cabinet);
            }

            return dataToSave;
        }).filter(Boolean),

        countertops: countertops.map(ct => {
            if (!ct || !ct.userData) return null;
            // Сохраняем только необходимые данные из userData и трансформации
            const { edges: ctEdges, initialMaterial, cachedLeftBoundary, cachedRightBoundary, ...userDataToSave } = ct.userData;
            return {
               userData: userDataToSave, // Сохраняем основное из userData
               uuid_mesh: ct.uuid, // Сохраняем UUID самого меша, может пригодиться для отладки
               position: ct.position.clone(),
               rotation: { x: ct.rotation.x, y: ct.rotation.y, z: ct.rotation.z, order: ct.rotation.order },
               scale: ct.scale.clone()
            };
       }).filter(Boolean),

       facadeSetsData: window.facadeSetsData || [] // Сохраняем наборы фасадов
    };

    try {
        const json = JSON.stringify(projectState, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'kitchen_project_v2.json'; // Новое имя, чтобы не путать со старыми
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        console.log("[saveProject] Проект сохранен.");
        updateHint("Проект сохранен.");
    } catch (error) {
        console.error("[saveProject] Ошибка при сериализации или сохранении проекта:", error);
        alert("Ошибка сохранения проекта!");
    }
}

// --- loadProject  ---
function loadProject() { 
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = (event) => { // <--- async обработчик
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e_reader) => { // <--- async обработчик
                try {
                    console.log("[loadProject] Начало загрузки и обработки файла...");
                    const projectState = JSON.parse(e_reader.target.result);

                    // --- 1. Очистка текущей сцены ---
                    console.log("  [loadProject] Очистка текущей сцены...");
                    if (cabinets) cabinets.forEach(cab => { if (cab.mesh?.parent) cab.mesh.parent.remove(cab.mesh); /* ... dispose ... */ });
                    if (windows) windows.forEach(win => { if (win.mesh?.parent) win.mesh.parent.remove(win.mesh); /* ... dispose ... */ });
                    if (countertops) countertops.forEach(ct => { if (ct?.parent) ct.parent.remove(ct); /* ... dispose ... */ });
                    
                    cabinets = [];
                    windows = [];
                    countertops = [];
                    window.selectedCabinets = [];
                    window.selectedCabinet = null;

                    // hideAllMenusAndInputs(); // Ваша функция скрытия UI

                    // --- 2. Восстановление комнаты (дефолтные параметры) ---
                    console.log("  [loadProject] Восстановление комнаты...");
                    const roomData = projectState.room || {};
                    const roomLength = roomData.length || 3.5;
                    const roomHeight = roomData.height || 2.6; // Это currentWidth (Y)
                    const roomWidth = roomData.width || 2.5;   // Это currentHeight (Z)
                    
                    // createCube из roomManager.js, он обновит currentLength, etc.
                    // и установит и цвет
                    
                    createCube(roomLength, roomHeight, roomWidth, '#d3d3d3'); 
                    
                    // Обновляем значения в UI комнаты
                    if(document.getElementById('length')) document.getElementById('length').value = roomLength * 1000;
                    if(document.getElementById('height')) document.getElementById('height').value = roomHeight * 1000;
                    if(document.getElementById('width')) document.getElementById('width').value = roomWidth * 1000;
                    if(document.getElementById('cubeColor')) document.getElementById('cubeColor').value = '#d3d3d3'; // или цвет из kitchenParams, если есть

                    // Сброс камеры на дефолтный вид
                    if (typeof window.setIsometricView === 'function') window.setIsometricView(); // Предполагая, что setIsometricView сбрасывает камеру
                    else if (window.camera) { // Ручной сброс, если нет функции
                        window.camera.position.set(0,0,10); window.camera.fov = 30; window.camera.updateProjectionMatrix(); window.camera.lookAt(0,0,0);
                    }

                    // --- 3. Восстановление kitchenGlobalParams ---
                    if (projectState.kitchenParams) {
                        Object.assign(window.kitchenGlobalParams, projectState.kitchenParams);
                        console.log("  [loadProject] kitchenGlobalParams восстановлены.");
                    }

                    // --- 4. Восстановление facadeSetsData ---
                    if (projectState.facadeSetsData) {
                        window.facadeSetsData = projectState.facadeSetsData;
                        console.log("  [loadProject] facadeSetsData восстановлены.");
                        // Возможно, нужно обновить UI, если менеджер фасадов открыт или используется где-то еще
                    }

                    // --- 5. Восстановление windows ---
                    console.log("  [loadProject] Восстановление объектов стен (windows)...");
                    if (projectState.windows) {
                        projectState.windows.forEach(winData => {
                            if (!winData || !winData.type) return;
                            // Создаем объект и меш на основе winData (упрощенно)
                            // Ваша функция addObject уже сложная, здесь нужна более прямая логика
                            // или рефакторинг addObject для работы с данными.
                            // Пока создадим упрощенно, предполагая, что objectTypes доступен.
                            const params = window.objectTypes[winData.type];
                            if (!params) { console.warn(`Неизвестный тип объекта ${winData.type} при загрузке.`); return; }

                            const w_width = winData.width || params.defaultWidth;
                            const w_height = winData.height || params.defaultHeight;
                            const w_depth = winData.depth || params.defaultDepth;

                            const mesh = new THREE.Mesh(
                                new THREE.BoxGeometry(w_width, w_height, w_depth),
                                new THREE.MeshStandardMaterial({ color: winData.initialColor || params.initialColor })
                            );
                            const edgesGeom = new THREE.EdgesGeometry(mesh.geometry);
                            const edges = new THREE.LineSegments(edgesGeom, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }));
                            edges.raycast = () => {}; mesh.add(edges);
                            
                            // Позиционирование (нужен доступ к currentLength, currentWidth, currentHeight из roomManager)
                            const cL = roomDimensions.getLength();
                            const cW = roomDimensions.getWidth();
                            const cH = roomDimensions.getHeight();
                            switch (winData.wallId) {
                                case "Back": mesh.position.set(-cL/2 + winData.offsetAlongWall+w_width/2, -cW/2 + winData.offsetBottom+w_height/2, -cH/2 + winData.offsetFromParentWall+w_depth/2); mesh.rotation.y=0; break;
                                case "Left": mesh.position.set(-cL/2 + winData.offsetFromParentWall+w_depth/2, -cW/2 + winData.offsetBottom+w_height/2, -cH/2 + winData.offsetAlongWall+w_width/2); mesh.rotation.y=THREE.MathUtils.degToRad(90); break;
                                case "Right": mesh.position.set(cL/2 - winData.offsetFromParentWall-w_depth/2, -cW/2 + winData.offsetBottom+w_height/2, -cH/2 + winData.offsetAlongWall+w_width/2); mesh.rotation.y=THREE.MathUtils.degToRad(-90); break;
                            }
                            scene.add(mesh); // cube из roomManager
                            const newWindowObj = { ...winData, mesh, edges };
                            windows.push(newWindowObj);
                        });
                    }


                    // --- (бывший Блок 7) ТЕПЕРЬ БЛОК 6: Восстановление COUNTERTOPS ---
                    console.log("  [loadProject] Восстановление столешниц...");
                    if (projectState.countertops) {
                        projectState.countertops.forEach(ctSavedData => { // ctSavedData - это объект из JSON
                            if (!ctSavedData || !ctSavedData.userData) return;
                            const newCt = createCountertopFromData(ctSavedData); // <--- ВЫЗОВ ФУНКЦИИ СОЗДАНИЯ
                            if (newCt) {
                                // createCountertopFromData уже добавляет в массив countertops и в сцену
                                // Если нет, то: countertops.push(newCt); // <--- ВАЖНО: УБЕДИТЕСЬ, ЧТО newCt ДОБАВЛЯЕТСЯ В МАССИВ countertops

                                // ПЕРЕСЧЕТ ПОЗИЦИИ СТОЛЕШНИЦЫ ОТНОСИТЕЛЬНО НОВОЙ КОМНАТЫ
                                // Этот блок вы добавили в предыдущем ответе, он должен быть здесь:
                                const { wallId: ctWallId, offsetAlongWall: ctOAW, length: ctL, depth: ctD } = newCt.userData;
                                console.log("  [loadProject Countertops] newCt.userData ПЕРЕД деструктуризацией:", JSON.parse(JSON.stringify(newCt.userData))); // <--- НОВЫЙ ЛОГ
                                const ctOldY = newCt.position.y; 
                                let ctNewX, ctNewZ, ctNewRotY = newCt.rotation.y; 

                                const cL = roomDimensions.getLength(); 
                                const cH = roomDimensions.getHeight(); // Это Z-размер комнаты (глубина)
                                // const cW = roomDimensions.getWidth(); // Это Y-размер комнаты (высота) - не используется для XZ позиционирования столешницы

                                switch (ctWallId) {
                                    case 'Back':
                                        ctNewX = (ctOAW || 0) + ctL / 2 - cL / 2;
                                        ctNewZ = -cH / 2 + ctD / 2; // Передняя кромка столешницы будет на -cH/2 + ctD
                                        ctNewRotY = 0;
                                        break;
                                    case 'Front': 
                                        ctNewX = (ctOAW || 0) + ctL / 2 - cL / 2;
                                        ctNewZ = cH / 2 - ctD / 2;  // Задняя кромка столешницы будет на cH/2 - ctD
                                        ctNewRotY = 0;
                                        break;
                                    case 'Left':
                                        ctNewX = -cL / 2 + ctD / 2; // Передняя кромка столешницы будет на -cL/2 + ctD
                                        ctNewZ = (ctOAW || 0) + ctL / 2 - cH / 2;
                                        ctNewRotY = Math.PI / 2;
                                        break;
                                    case 'Right':
                                        ctNewX = cL / 2 - ctD / 2;  // Задняя кромка столешницы будет на cL/2 - ctD
                                        ctNewZ = (ctOAW || 0) + ctL / 2 - cH / 2;
                                        ctNewRotY = -Math.PI / 2; // или Math.PI / 2
                                        break;
                                    case 'Bottom': // Свободно стоящая
                                        // Для FS столешниц их position из файла JSON уже должна быть правильной абсолютной позицией
                                        // относительно (0,0,0) комнаты. Пересчет не нужен, если центр комнаты не смещается.
                                        ctNewX = newCt.position.x; 
                                        ctNewZ = newCt.position.z;
                                        // Вращение тоже берем из сохраненного
                                        ctNewRotY = newCt.rotation.y; 
                                        console.log(`  [loadProject Countertops] FS столешница ${newCt.uuid_mesh || newCt.uuid}. Позиция из файла: X=${ctNewX.toFixed(3)}, Z=${ctNewZ.toFixed(3)}`);
                                        break;
                                    default:
                                        ctNewX = newCt.position.x;
                                        ctNewZ = newCt.position.z;
                                        break;
                                }
                                newCt.position.set(ctNewX, ctOldY, ctNewZ);
                                newCt.rotation.set(newCt.rotation.x, ctNewRotY, newCt.rotation.z, newCt.rotation.order);
                                newCt.updateMatrixWorld(); 
                                console.log(`  [loadProject Countertops] Столешница ${newCt.uuid_mesh || newCt.uuid} (wallId: ${ctWallId}) спозиционирована: X=${ctNewX.toFixed(3)}, Y=${ctOldY.toFixed(3)}, Z=${ctNewZ.toFixed(3)}, RotY=${ctNewRotY.toFixed(2)}`);
                            }
                        });
                    }
                    console.log("  [loadProject] Столешницы восстановлены. Количество в массиве countertops:", countertops.length);
                    // --- (бывший Блок 6) ТЕПЕРЬ БЛОК 7: Восстановление CABINETS ---
                    console.log("  [loadProject] Восстановление шкафов (как простые меши)...");
                    const cabinetsToDetailAsync = [];
                    if (projectState.cabinets) {
                        projectState.cabinets.forEach((cabData, index) => {
                            if (!cabData || !cabData.type) return;
                            
                            const newCabObj = { ...cabData }; // Копируем все сохраненные данные
                            newCabObj.id_data = cabData.id_data || THREE.MathUtils.generateUUID(); // Гарантируем ID для данных

                            // Создаем простой меш
                            const simpleMesh = new THREE.Mesh(
                                new THREE.BoxGeometry(newCabObj.width, newCabObj.height, newCabObj.depth),
                                new THREE.MeshStandardMaterial({ color: newCabObj.initialColor })
                            );
                            simpleMesh.uuid = cabData.meshUUID || THREE.MathUtils.generateUUID(); // UUID для меша
                            
                            const edgesGeom = new THREE.EdgesGeometry(simpleMesh.geometry);
                            const cabEdges = new THREE.LineSegments(edgesGeom, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }));
                            cabEdges.raycast = () => {}; simpleMesh.add(cabEdges);

                            newCabObj.mesh = simpleMesh;
                            newCabObj.edges = cabEdges;
                            
                            // Рассчитываем и устанавливаем позицию
                            // Сначала обновляем зависимые отступы, если нужно
                            if (newCabObj.type === 'lowerCabinet' && newCabObj.wallId !== 'Bottom') {
                                newCabObj.offsetFromParentWall = window.calculateLowerCabinetOffset(newCabObj);
                            }
                            window.updateCabinetPosition(newCabObj); // Позиционирует newCabObj.mesh
                            
                            scene.add(newCabObj.mesh);
                            cabinets.push(newCabObj);

                            if (newCabObj.isDetailed) { // Если шкаф был сохранен как детализированный
                                cabinetsToDetailAsync.push(cabinets.length - 1); // Сохраняем индекс для последующей детализации
                            }
                        });
                        console.log("[loadProject] После маппинга из JSON, cabinets (ссылка):", cabinets);
                        console.log("[loadProject] ID загруженных шкафов:", cabinets.map(c => c.id_data));
                    }

                        // --- 8. СИНХРОННОЕ восстановление детализации шкафов ---
                    if (cabinetsToDetailAsync.length > 0) {
                        console.log(`  [loadProject] Запуск СИНХРОННОЙ детализации для ${cabinetsToDetailAsync.length} шкафов...`);
                        cabinetsToDetailAsync.forEach(cabIndex => {
                            console.log(`    Вызов toggleCabinetDetail для индекса ${cabIndex}`);
                            try {
                                window.toggleCabinetDetail(cabIndex); // Теперь это синхронный вызов
                            } catch (err) {
                                console.error(`Ошибка при синхронной детализации шкафа ${cabIndex} во время загрузки:`, err);
                                if (cabinets[cabIndex]) cabinets[cabIndex].isDetailed = false;
                            }
                        });
                        console.log("  [loadProject] Вся детализация шкафов после загрузки завершена.");
                    }
                    
                    // --- 9. Обновление UI ---
                    console.log("  [loadProject] Обновление UI...");
                    if (typeof window.updateSelectedFaceDisplay === 'function') window.updateSelectedFaceDisplay();
                    if (typeof window.updateEdgeColors === 'function') window.updateEdgeColors();
                    if (typeof window.updateFaceBounds === 'function') window.updateFaceBounds();
                    if (typeof window.updateCountertopButtonVisibility === 'function') window.updateCountertopButtonVisibility();
                    updateHint("Проект загружен.");
                    requestRender();
                    console.log("[loadProject] Загрузка проекта завершена.");

                } catch (error) {
                    console.error("[loadProject] Ошибка при парсинге или обработке файла проекта:", error);
                    alert("Ошибка загрузки файла проекта. Файл поврежден или имеет неверный формат.");
                }

            };
            reader.readAsText(file);
        }
    };
    input.click();
}



//--------
function showKitchenParamsMenu(x = window.innerWidth / 2, y = window.innerHeight / 2) {
    const existingMenu = document.getElementById('kitchenParamsMenu');
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement('div');
    menu.id = 'kitchenParamsMenu';
    menu.className = 'kitchen-params-menu';

    function createInputField(labelText, id, value, type = 'number') {
        const div = document.createElement('div');
        const label = document.createElement('label');
        label.textContent = labelText;
        label.htmlFor = id;

        const input = document.createElement('input');
        input.type = type;
        input.id = id;
        input.value = value;
        if (type === 'number') input.min = 0;

        div.appendChild(label);
        div.appendChild(input);
        return div;
    }

    function createSelectField(labelText, id, value, options, onChange = null) {
        const div = document.createElement('div');
        const label = document.createElement('label');
        label.textContent = labelText;
        label.htmlFor = id;

        const select = document.createElement('select');
        select.id = id;
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.text;
            if (opt.value === value) option.selected = true;
            select.appendChild(option);
        });

        if (onChange) {
            select.addEventListener('change', onChange);
        }

        div.appendChild(label);
        div.appendChild(select);
        return div;
    }

    menu.appendChild(createInputField('Высота столешницы (мм):', 'countertopHeight', kitchenGlobalParams.countertopHeight));
    menu.appendChild(createInputField('Толщина столешницы (мм):', 'countertopThickness', kitchenGlobalParams.countertopThickness));
    //menu.appendChild(createInputField('Глубина столешницы (мм):', 'countertopDepth', kitchenGlobalParams.countertopDepth));
    menu.appendChild(createInputField('Высота цоколя (мм):', 'plinthHeight', kitchenGlobalParams.plinthHeight));
    menu.appendChild(createInputField('Общая высота кухни (мм):', 'totalHeight', kitchenGlobalParams.totalHeight));
    menu.appendChild(createInputField('Высота фартука (мм):', 'apronHeight', kitchenGlobalParams.apronHeight));
    menu.appendChild(createInputField('Высота антресолей (мм):', 'mezzanineHeight', kitchenGlobalParams.mezzanineHeight));
    // --- === Новое поле для Гола === ---
    menu.appendChild(createInputField(
        'Мин. высота ручки Гола (мм):',
        'golaMinHeightMm', // ID поля
        kitchenGlobalParams.golaMinHeightMm, // Текущее значение
        'number', // Тип number
        3,        // min = 3
        50        // max = 50
    ));
    // --- ============================ ---
    
    const countertopTypeOptions = [
        { value: 'postforming', text: 'Постформинг' },
        { value: 'compact-plate', text: 'Компакт-плита' },
        { value: 'quartz', text: 'Кварц' }
    ];
    menu.appendChild(createSelectField(
        'Тип столешницы:',
        'countertopType',
        kitchenGlobalParams.countertopType,
        countertopTypeOptions,
        (e) => {
            const selectedType = e.target.value;
            const thicknessInput = document.getElementById('countertopThickness');
            if (selectedType === 'postforming') {
                thicknessInput.value = 38;
            } else if (selectedType === 'compact-plate') {
                thicknessInput.value = 12;
            } else if (selectedType === 'quartz') {
                thicknessInput.value = 20;
            }
        }
    ));

    const handleTypeOptions = [
        { value: 'standard', text: 'Стандартные ручки' },
        { value: 'aluminum-tv9', text: 'Врезные алюминиевые ТВ9' },
        { value: 'gola-profile', text: 'Гола-профиль' }
    ];
    menu.appendChild(createSelectField('Тип ручек:', 'handleType', kitchenGlobalParams.handleType, handleTypeOptions));

    const kitchenTypeOptions = [
        { value: 'linear', text: 'Линейная' },
        { value: 'corner', text: 'Угловая' },
        { value: 'u-shaped', text: 'U-образная' },
        { value: 'island', text: 'Островная' }
    ];
    menu.appendChild(createSelectField('Тип кухни:', 'kitchenType', kitchenGlobalParams.kitchenType, kitchenTypeOptions));

    // --- === Новая кнопка для Наборов Фасадов === ---
    const facadeSetsButton = document.createElement('input');
    facadeSetsButton.type = 'button';
    facadeSetsButton.value = 'Настроить Наборы Фасадов';
    facadeSetsButton.id = 'facadeSetsButton'; // Добавим ID для стилизации, если нужно
    facadeSetsButton.style.marginTop = '15px'; // Отступ сверху
    facadeSetsButton.onclick = () => {
        console.log("Кнопка 'Настроить Наборы Фасадов' нажата");
        // Вызываем функцию отображения нового меню
        if (typeof window.showFacadeSetsManager === 'function') {
            // Передаем координаты, чтобы новое меню появилось рядом
            window.showFacadeSetsManager(x, y + 50); // Смещаем немного вниз
            // Можно скрыть текущее меню, если нужно
            // menu.remove();
        } else {
            console.error("Функция showFacadeSetsManager не найдена!");
            alert("Функционал настройки наборов фасадов еще не реализован.");
        }
    };
    menu.appendChild(facadeSetsButton);
    // --- ======================================= ---

    const applyButton = document.createElement('input');
    applyButton.type = 'button';
    applyButton.value = 'Применить';
    applyButton.onclick = applyKitchenParams;
    menu.appendChild(applyButton);

    document.body.appendChild(menu);

    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = x - menuWidth / 2;
    let adjustedY = y - menuHeight / 2;

    if (adjustedX + menuWidth > viewportWidth) {
        adjustedX = viewportWidth - menuWidth - 10;
    }
    if (adjustedY + menuHeight > viewportHeight) {
        adjustedY = viewportHeight - menuHeight - 10;
    }
    adjustedX = Math.max(10, adjustedX);
    adjustedY = Math.max(10, adjustedY);

    menu.style.left = `${adjustedX}px`;
    menu.style.top = `${adjustedY}px`;

    // Добавляем обработчик Enter
    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); // Предотвращаем стандартное поведение (например, отправку формы)
            applyKitchenParams();   // Вызываем функцию применения параметров
        }
    };

    menu.addEventListener('keydown', handleKeyDown);

    // Удаляем обработчик при закрытии меню, чтобы избежать утечек памяти
    menu.onclose = () => {
        menu.removeEventListener('keydown', handleKeyDown);
    };

    // Фокусируем первый ввод для удобства
    const firstInput = menu.querySelector('input');
    if (firstInput) {
        firstInput.focus();
        firstInput.select();
    }
}

function applyKitchenParams() {
    console.log("--- applyKitchenParams ВЫЗВАНА ---");
    console.log("  Текущее состояние cabinets перед обработкой (длина):", cabinets.length);

    saveState("updateKitchenParams", { description: "Изменение параметров кухни" });

    // --- Блок 1: Запоминаем детализированные и временно упрощаем ВСЕ в данных ---
    const detailedCabinetInfo = []; 
    cabinets.forEach((cabinet, index) => {
        if (cabinet.isDetailed && cabinet.mesh && cabinet.mesh.isGroup) { 
            detailedCabinetInfo.push({ uuid: cabinet.mesh.uuid, index: index });
            console.log(`[applyKitchenParams] Блок 1: Обработка детализированного UUID ${cabinet.mesh.uuid}`);
            cabinet.isDetailed = false;
            cabinet.edges = null; 
        } else if (cabinet.isDetailed) {
            console.warn(`[applyKitchenParams] Блок 1: Шкаф ${index} isDetailed, но mesh не группа:`, cabinet.mesh);
            cabinet.isDetailed = false;
        }
    });
    console.log(`[applyKitchenParams] Запомнено ${detailedCabinetInfo.length} детализированных шкафов для восстановления:`, JSON.parse(JSON.stringify(detailedCabinetInfo)));

    // --- Блок 2: Обновление kitchenGlobalParams ---
    try { 
        kitchenGlobalParams.countertopHeight = parseFloat(document.getElementById('countertopHeight').value) || kitchenGlobalParams.countertopHeight;
        kitchenGlobalParams.countertopThickness = parseFloat(document.getElementById('countertopThickness').value) || kitchenGlobalParams.countertopThickness;
        kitchenGlobalParams.plinthHeight = parseFloat(document.getElementById('plinthHeight').value) || kitchenGlobalParams.plinthHeight;
        kitchenGlobalParams.totalHeight = parseFloat(document.getElementById('totalHeight').value) || kitchenGlobalParams.totalHeight;
        kitchenGlobalParams.apronHeight = parseFloat(document.getElementById('apronHeight').value) || kitchenGlobalParams.apronHeight;
        kitchenGlobalParams.mezzanineHeight = parseFloat(document.getElementById('mezzanineHeight').value) || kitchenGlobalParams.mezzanineHeight;
        kitchenGlobalParams.countertopType = document.getElementById('countertopType').value;
        kitchenGlobalParams.handleType = document.getElementById('handleType').value;
        kitchenGlobalParams.kitchenType = document.getElementById('kitchenType').value;
        kitchenGlobalParams.golaMinHeightMm = parseFloat(document.getElementById('golaMinHeightMm').value) || kitchenGlobalParams.golaMinHeightMm; 
        kitchenGlobalParams.golaMinHeightMm = Math.max(3, Math.min(50, kitchenGlobalParams.golaMinHeightMm));
    } catch (e) {
        console.error("Ошибка при чтении параметров из DOM в applyKitchenParams:", e);
        return; 
    }
    console.log("Глобальные параметры кухни обновлены.");

    // --- Блок 3: Пересчёт размеров/позиций ВСЕХ шкафов в данных ---
    console.log("[applyKitchenParams] Блок 3: Пересчёт размеров/позиций ВСЕХ шкафов в данных.");
    cabinets.forEach((cabinet, cabIndex_for_log) => {
        // Сохраним исходные значения для отладки, если что-то пойдет не так
        // const initialHeightForLog = cabinet.height;
        // const initialOffsetBottomForLog = cabinet.offsetBottom;

        const isTallCabinetType = (cabinet.cabinetType === 'straight' && ['tallStorage', 'tallOvenMicro', 'fridge'].includes(cabinet.cabinetConfig));
        const isLowerNonFPCabinet = (cabinet.type === 'lowerCabinet' && cabinet.cabinetConfig !== 'falsePanel');

        // --- СНАЧАЛА ОБРАБОТАЕМ ВЫСОТУ (cabinet.height) И ОТСТУП СНИЗУ (cabinet.offsetBottom) ---
        if (cabinet.isHeightIndependent) {
        // Если высота независима, cabinet.height НЕ МЕНЯЕТСЯ здесь (кроме ФП с kitchenHeight).
        // НО! offsetBottom может меняться для шкафов, стоящих на полу.

            if (cabinet.cabinetConfig === 'falsePanel') {
                // Для ФП offsetBottom зависит от fp_vertical_align
                if (cabinet.fp_vertical_align === 'floor') {
                    // Если от пола, offsetBottom берется из fp_offset_from_floor и НЕ ЗАВИСИТ от plinthHeight
                    // cabinet.offsetBottom остается таким, каким был (установлен в меню конфигурации)
                    // console.log(`  [applyKParams] ФП ${cabinet.id_data || cabIndex_for_log} (isHeightIndependent=true, align=floor) offsetBottom=${cabinet.offsetBottom.toFixed(3)}м НЕ МЕНЯЕТСЯ.`);
                } else { // fp_vertical_align === 'cabinetBottom'
                    // Если от низа шкафов, то offsetBottom = plinthHeight
                    cabinet.offsetBottom = kitchenGlobalParams.plinthHeight / 1000;
                    // console.log(`  [applyKParams] ФП ${cabinet.id_data || cabIndex_for_log} (isHeightIndependent=true, align=cabinetBottom) offsetBottom ОБНОВЛЕН: ${cabinet.offsetBottom.toFixed(3)}м`);
                }
                // Высота ФП с fp_height_option === 'kitchenHeight' зависит от totalHeight и нового offsetBottom
                if (cabinet.fp_height_option === 'kitchenHeight') {
                    cabinet.height = (kitchenGlobalParams.totalHeight / 1000) - cabinet.offsetBottom; // Используем уже обновленный cabinet.offsetBottom
                    cabinet.height = Math.max(0.01, cabinet.height || 0.01);
                    // console.log(`  [applyKParams] ФП ${cabinet.id_data || cabIndex_for_log} (fp_height_option='kitchenHeight') высота ОБНОВЛЕНА: H=${cabinet.height.toFixed(3)}м`);
                }
                // Для ФП с fp_height_option === 'freeHeight', высота не меняется.

            } else if (cabinet.type === 'freestandingCabinet' || isTallCabinetType) {
                // Для высоких и отдельно стоящих шкафов с isHeightIndependent=true,
                // высота не меняется, а offsetBottom = plinthHeight
                cabinet.offsetBottom = kitchenGlobalParams.plinthHeight / 1000;
                // console.log(`  [applyKParams] Шкаф ${cabinet.id_data || cabIndex_for_log} (type: ${cabinet.type}, isHeightIndependent=true) offsetBottom ОБНОВЛЕН: ${cabinet.offsetBottom.toFixed(3)}м. Высота ${cabinet.height.toFixed(3)}м НЕ МЕНЯЕТСЯ.`);
            }
            // Для верхних шкафов с isHeightIndependent=true, ни высота, ни offsetBottom не меняются от plinthHeight.
            // Их offsetBottom устанавливается относительно фартука/антресолей.

        } else { // Если высота ЗАВИСИМА (isHeightIndependent === false)
            if (isTallCabinetType) {
                cabinet.height = (kitchenGlobalParams.totalHeight - kitchenGlobalParams.plinthHeight) / 1000;
                cabinet.offsetBottom = kitchenGlobalParams.plinthHeight / 1000;
            } else if (isLowerNonFPCabinet) {
                cabinet.height = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;
                cabinet.offsetBottom = kitchenGlobalParams.plinthHeight / 1000;
            } else if (cabinet.type === 'upperCabinet') {
                // ... (логика для верхних шкафов без изменений) ...
                const countertopHeightM = kitchenGlobalParams.countertopHeight / 1000;
                const apronHeightM = kitchenGlobalParams.apronHeight / 1000;
                const totalHeightM = kitchenGlobalParams.totalHeight / 1000;
                const mezzanineHeightM = kitchenGlobalParams.mezzanineHeight / 1000;
                const topApronEdgeM = apronHeightM + countertopHeightM;
                if (cabinet.isMezzanine == 'normal') {
                    cabinet.height = totalHeightM - topApronEdgeM;
                    cabinet.offsetBottom = topApronEdgeM;
                } else if (cabinet.isMezzanine == 'mezzanine') {
                    cabinet.height = mezzanineHeightM;
                    cabinet.offsetBottom = totalHeightM - mezzanineHeightM;
                } else if (cabinet.isMezzanine == 'underMezzanine') {
                    cabinet.height = totalHeightM - topApronEdgeM - mezzanineHeightM;
                    cabinet.offsetBottom = topApronEdgeM;
                }
            } else if (cabinet.cabinetConfig === 'falsePanel') {
                // ... (логика для ФП с isHeightIndependent = false без изменений) ...
                const fpHeightOption = cabinet.fp_height_option || 'cabinetHeight';
                const currentOffsetBottomM_fp = ((cabinet.fp_vertical_align === 'floor' && cabinet.fp_offset_from_floor !== undefined)
                                        ? cabinet.fp_offset_from_floor
                                        : (kitchenGlobalParams.plinthHeight / 1000)) || 0;
                cabinet.offsetBottom = currentOffsetBottomM_fp;

                let calculatedFPHeightM = cabinet.height;
                if (fpHeightOption === 'cabinetHeight') {
                    calculatedFPHeightM = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - (currentOffsetBottomM_fp * 1000)) / 1000;
                } else if (fpHeightOption === 'toGola') {
                    const availableForGolaAndFacadesMm_fp = kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - (currentOffsetBottomM_fp * 1000);
                    const cabinetHeightForGolaCalculating_fp = kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight;
                    const golaHeightM_fp = (window.calculateActualGolaHeight ? window.calculateActualGolaHeight(kitchenGlobalParams.golaMinHeightMm, (cabinet.facadeGap || 0.003) * 1000, cabinetHeightForGolaCalculating_fp) / 1000 : 0.058);
                    calculatedFPHeightM = availableForGolaAndFacadesMm_fp / 1000 - golaHeightM_fp;
                }
                cabinet.height = calculatedFPHeightM;
            }
            cabinet.height = Math.max(0.01, cabinet.height || 0.01); // CLAMP
            // console.log(`  [applyKParams] Шкаф ${cabinet.id_data || cabIndex_for_log} (isHeightIndependent=false) высота/отступ ПЕРЕСЧИТАНЫ: H=${cabinet.height.toFixed(3)}м, OB=${cabinet.offsetBottom.toFixed(3)}м`);
        }

        // --- ТЕПЕРЬ ОБРАБОТАЕМ ОСТАЛЬНЫЕ ПАРАМЕТРЫ, КОТОРЫЕ МОГУТ ЗАВИСЕТЬ ОТ НОВЫХ РАЗМЕРОВ/ПОЗИЦИЙ ---

        // Пересчет отступа от стены для нижних шкафов (кроме фальш-панелей, для них это обычно 0 или не актуально)
        if (isLowerNonFPCabinet && cabinet.wallId !== 'Bottom') {
            cabinet.offsetFromParentWall = calculateLowerCabinetOffset(cabinet);
        }

        // Для фальш-панелей ширина и глубина могут зависеть от опций, но здесь мы их не меняем,
        // они должны были быть установлены в меню конфигурации.
        // Но если ФП была "узкая" или "декоративная", ее ширина = толщине фасада.
        // Это должно было быть установлено в applyConfigMenuSettings или applyChangesAndPrepareForConfigMenu.
        // На всякий случай, если `cabinet.width` для узкой ФП неверно, его можно скорректировать здесь,
        // но лучше это делать при изменении `facadeSet` или `fp_type`.
        if (cabinet.cabinetConfig === 'falsePanel') {
            if (cabinet.fp_type === 'narrow' || cabinet.fp_type === 'decorativePanel') {
                const { thickness: facadeThicknessM_fp } = getFacadeMaterialAndThickness(cabinet);
                if (Math.abs(cabinet.width - facadeThicknessM_fp) > 1e-5) {
                    // console.log(`  [applyKParams] Коррекция ширины для узкой/декоративной ФП ${cabinet.id_data || cabIndex_for_log} с ${cabinet.width.toFixed(3)}м на ${facadeThicknessM_fp.toFixed(3)}м`);
                    cabinet.width = facadeThicknessM_fp;
                }
            }
        }

        // Обновляем 3D позицию шкафа на основе обновленных cabinet.offsetBottom, cabinet.offsetFromParentWall и т.д.
        if (cabinet.mesh) { // Обновляем позицию, только если меш существует
            updateCabinetPosition(cabinet);
        }

        // Логируем изменения для отладки
        // if (Math.abs(initialHeightForLog - cabinet.height) > 1e-5 || Math.abs(initialOffsetBottomForLog - cabinet.offsetBottom) > 1e-5) {
        //     console.log(`  [applyKParams] ИЗМЕНЕНЫ H/OB для ${cabinet.id_data || cabIndex_for_log} (type: ${cabinet.type}, config: ${cabinet.cabinetConfig}, isIndep: ${cabinet.isHeightIndependent}):`);
        //     console.log(`    Старые: H=${initialHeightForLog.toFixed(3)}, OB=${initialOffsetBottomForLog.toFixed(3)}`);
        //     console.log(`    Новые: H=${cabinet.height.toFixed(3)}, OB=${cabinet.offsetBottom.toFixed(3)}`);
        // }
    });
    console.log("[applyKitchenParams] Данные (размеры/позиции) шкафов обновлены.");

    // --- Блок 3.5 - Обновление столешниц ---
     console.log("Обновление столешниц...");
     let newGlobalCountertopThickness = kitchenGlobalParams.countertopThickness / 1000;
     newGlobalCountertopThickness = Math.max(0.01, newGlobalCountertopThickness || 0.01); // CLAMP

     const newGlobalCountertopHeightFromFloor = kitchenGlobalParams.countertopHeight / 1000;
     const roomHeightMeters = currentWidth; 
     const floorY = -roomHeightMeters / 2;

     countertops.forEach(countertop => {
          if (!countertop || !countertop.userData) return;
          if (countertop.userData.heightDependsOnGlobal !== false) {
              const centerRelativeToFloor = newGlobalCountertopHeightFromFloor - newGlobalCountertopThickness / 2;
              const newCenterY = floorY + centerRelativeToFloor;
              countertop.position.y = newCenterY;
          }

          const needsGeometryUpdate = Math.abs(countertop.userData.thickness - newGlobalCountertopThickness) > 1e-5;
          if (needsGeometryUpdate) {
            console.log(` - Обновление геометрии для ${countertop.uuid}: толщина=${newGlobalCountertopThickness}`);
            countertop.userData.thickness = newGlobalCountertopThickness; 
            if (countertop.geometry) countertop.geometry.dispose();

            const l_ct = Math.max(0.01, countertop.userData.length || 0.01); // CLAMP
            const t_ct = newGlobalCountertopThickness; // Already clamped
            const d_ct = Math.max(0.01, countertop.userData.depth || 0.01); // CLAMP
            console.log(`[applyKitchenParams] PRE-GEOMETRY COUNTERTOP ${countertop.uuid || countertop.userData.id_data}: Original LTD: [${countertop.userData.length}, ${newGlobalCountertopThickness}, ${countertop.userData.depth}]. Clamped LTD: [${l_ct}, ${t_ct}, ${d_ct}]`);
            
            countertop.geometry = new THREE.BoxGeometry(l_ct, t_ct, d_ct); // USE CLAMPED

            if (countertop.userData.edges?.geometry) { 
                countertop.userData.edges.geometry.dispose();
                countertop.userData.edges.geometry = new THREE.EdgesGeometry(countertop.geometry);
            }
        }

        if (countertop.material) {
            if (Array.isArray(countertop.material)) {
                countertop.material.forEach(m => m?.dispose()); 
            } else {
                countertop.material?.dispose(); 
            }
        }
        const newMaterial = createCountertopMaterial({
            materialType: countertop.userData.materialType,        
            solidColor: countertop.userData.solidColor || '#808080', 
            textureType: kitchenGlobalParams.countertopType          
        });
        countertop.material = newMaterial;
        updateTextureScale(countertop); 
        if (Array.isArray(countertop.material)) {
            countertop.material.forEach(m => { if(m) m.needsUpdate = true; });
        } else if (countertop.material) {
            countertop.material.needsUpdate = true;
        }
     });
     console.log("Столешницы обновлены.");

    // --- Блок 4: Обновляем 3D-представление шкафов ---
    console.log("Обновление 3D представления шкафов...");
    cabinets.forEach((cabinet, index) => {
        const isOriginallyDetailed = detailedCabinetInfo.some(info => info.index === index);

        if (!cabinet.mesh && !isOriginallyDetailed) { // If simple and no mesh, might be an issue
             console.warn(`Простой шкаф (индекс ${index}, ID ${cabinet.id_data}) не имеет меша перед обновлением 3D. Попытка создать.`);
             // Attempt to create a mesh if it's missing for a simple cabinet
             cabinet.mesh = new THREE.Mesh(
                 new THREE.BoxGeometry(Math.max(0.01, cabinet.width || 0.01), Math.max(0.01, cabinet.height || 0.01), Math.max(0.01, cabinet.depth || 0.01)),
                 new THREE.MeshStandardMaterial({ color: cabinet.initialColor || '#FF00FF' }) // Default to magenta if color missing
             );
             cabinet.mesh.uuid = cabinet.id_data || THREE.MathUtils.generateUUID(); // Assign UUID
             // Add edges for this newly created mesh
             const edgesGeom = new THREE.EdgesGeometry(cabinet.mesh.geometry);
             cabinet.edges = new THREE.LineSegments(edgesGeom, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }));
             cabinet.edges.raycast = () => {};
             cabinet.mesh.add(cabinet.edges);
             updateCabinetPosition(cabinet); // Position it
             scene.add(cabinet.mesh); // Add to scene
        } else if (!cabinet.mesh && isOriginallyDetailed) {
             console.warn(`Детализированный шкаф (индекс ${index}, ID ${cabinet.id_data}) не имеет ссылки на mesh (должна быть старая группа). Восстановление может быть неточным.`);
             // This case is problematic, as we need the old mesh's transform for newDetailedGroup
        }


        if (isOriginallyDetailed) {
            console.log(`Восстановление детализации для индекса ${index}, исходный UUID предполагаемой группы: ${detailedCabinetInfo.find(info=>info.index===index)?.uuid}`);
            const oldGroup = detailedCabinetInfo.find(info=>info.index===index)?.oldMesh || cabinet.mesh; // Use oldMesh if available

            const newDetailedGroup = getDetailedCabinetRepresentation(cabinet); 

            if (newDetailedGroup) {
                if (oldGroup) newDetailedGroup.uuid = oldGroup.uuid; // Restore UUID from old group if possible
                else newDetailedGroup.uuid = cabinet.id_data || THREE.MathUtils.generateUUID(); // Fallback UUID

                if (oldGroup) { // If we have the old group/mesh reference
                    newDetailedGroup.position.copy(oldGroup.position);
                    newDetailedGroup.rotation.copy(oldGroup.rotation);
                    newDetailedGroup.scale.copy(oldGroup.scale);
                    if (oldGroup.parent) oldGroup.parent.remove(oldGroup);
                    oldGroup.traverse((child) => { 
                         if (child.isMesh || child.isLineSegments) {
                            if (child.geometry) child.geometry.dispose();
                            if (child.material) {
                                if (Array.isArray(child.material)) child.material.forEach(m => m?.dispose());
                                else child.material?.dispose();
                            }
                         }
                    });
                } else { // Fallback if oldGroup reference was lost
                    updateCabinetPosition(cabinet); // Calculate position based on cabinet data
                    newDetailedGroup.position.set(cabinet.calculatedPosition.x, cabinet.calculatedPosition.y, cabinet.calculatedPosition.z);
                    newDetailedGroup.rotation.set(cabinet.calculatedRotation.x, cabinet.calculatedRotation.y, cabinet.calculatedRotation.z);
                }
                
                cabinet.mesh = newDetailedGroup; 
                cabinet.isDetailed = true;       
                cabinet.edges = null;
                scene.add(newDetailedGroup);      
            } else {
                 console.error(`Не удалось воссоздать детализированную группу для индекса ${index}. Шкаф останется/станет простым.`);
                 cabinet.isDetailed = false; 
                 if (oldGroup && oldGroup.isGroup) {
                     if (oldGroup.parent) oldGroup.parent.remove(oldGroup);
                     oldGroup.traverse((child) => { /* ... dispose ... */ });
                     cabinet.mesh = new THREE.Mesh( new THREE.BoxGeometry(Math.max(0.01, cabinet.width || 0.01), Math.max(0.01, cabinet.height || 0.01), Math.max(0.01, cabinet.depth || 0.01)), new THREE.MeshStandardMaterial({ color: cabinet.initialColor }) );
                     cabinet.mesh.uuid = oldGroup.uuid;
                      const edgesGeom = new THREE.EdgesGeometry(cabinet.mesh.geometry);
                      cabinet.edges = new THREE.LineSegments(edgesGeom, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }));
                      cabinet.edges.raycast = () => {}; cabinet.mesh.add(cabinet.edges);
                     cabinet.mesh.position.copy(oldGroup.position); cabinet.mesh.rotation.copy(oldGroup.rotation); cabinet.mesh.scale.copy(oldGroup.scale);
                     scene.add(cabinet.mesh);
                 } else if (cabinet.mesh) { // If it became a simple mesh somehow
                      if (cabinet.mesh.geometry) cabinet.mesh.geometry.dispose();
                      cabinet.mesh.geometry = new THREE.BoxGeometry(Math.max(0.01, cabinet.width || 0.01), Math.max(0.01, cabinet.height || 0.01), Math.max(0.01, cabinet.depth || 0.01));
                      if (cabinet.edges?.geometry) { cabinet.edges.geometry.dispose(); cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry); }
                 }
            }
        } else if (cabinet.mesh) { // Update for simple cabinet
             console.log(`Обновление простого шкафа ${cabinet.id_data || cabinet.mesh.uuid}`);
             if (cabinet.mesh.geometry) cabinet.mesh.geometry.dispose();

             const w = Math.max(0.01, cabinet.width || 0.01); // CLAMP
             const h = Math.max(0.01, cabinet.height || 0.01); // CLAMP
             const d = Math.max(0.01, cabinet.depth || 0.01); // CLAMP
             console.log(`[applyKitchenParams] PRE-GEOMETRY SIMPLE cabinet ${cabinet.id_data || cabinet.mesh.uuid}: Original WHD: [${cabinet.width}, ${cabinet.height}, ${cabinet.depth}]. Clamped WHD: [${w}, ${h}, ${d}]`);
             
             cabinet.mesh.geometry = new THREE.BoxGeometry(w, h, d); // USE CLAMPED

             if (cabinet.edges?.geometry) {
                 cabinet.edges.geometry.dispose();
                 cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
             }
             const hasIntersection = checkCabinetIntersections(cabinet);
             if(cabinet.mesh.material){
                 cabinet.mesh.material.color.set(hasIntersection ? 0xff0000 : cabinet.initialColor);
                 cabinet.mesh.material.needsUpdate = true;
             }
             if(cabinet.edges?.material) cabinet.edges.material.needsUpdate = true;
        }
    });
    console.log("3D представление шкафов обновлено.");

    // --- Блок 5: Финальные шаги ---
    selectedCabinets = []; 
    selectedCabinet = null;
    scene.updateMatrixWorld(true); 

    const menu = document.getElementById('kitchenParamsMenu');
    if (menu) menu.remove();
    console.log("--- applyKitchenParams Завершено ---");
}


// Привязка кнопки к открытию меню
const kitchenParamsButton = document.getElementById('kitchenParamsButton');
kitchenParamsButton.addEventListener('click', (e) => {
    // Открываем меню в центре экрана или по координатам клика
    showKitchenParamsMenu(e.clientX, e.clientY);
});
//--------

// В script.js

export function applyConfigMenuSettings(cabinetIndex) { // НОВОЕ ИМЯ, БЕЗ prevMenuState
    // --- Блок 0: Проверка индекса и объекта ---
    if (cabinetIndex < 0 || cabinetIndex >= cabinets.length) {
        console.error("applyConfigMenuSettings: Неверный индекс шкафа", cabinetIndex);
        if (typeof hideCabinetConfigMenu === 'function') hideCabinetConfigMenu();
        return;
    }
    const cabinet = cabinets[cabinetIndex];
    if (!cabinet) {
        console.error("applyConfigMenuSettings: Не найден объект шкафа для индекса", cabinetIndex);
        if (typeof hideCabinetConfigMenu === 'function') hideCabinetConfigMenu();
        return;
    }
    hideAllDimensionInputs();

    console.log(`--- [applyConfigMenuSettings] Начало для шкафа ${cabinetIndex}. Текущий конфиг объекта: ${cabinet.cabinetConfig} ---`);
    // console.log("[ACMS] Объект cabinet ДО применения настроек из configMenu:", JSON.parse(JSON.stringify(cabinet)));

    // --- Блок 0.1: Сохранение состояния для отмены (опционально) ---
    // const oldDataForUndo = JSON.parse(JSON.stringify(cabinet));
    // window.saveState("applyConfigMenuSettings", { cabinetIndex: cabinetIndex, previousData: oldDataForUndo });


    // --- Блок 0.5: Временное упрощение детализированного шкафа ---
    let wasDetailed = false;
    if (cabinet.isDetailed) {
        //console.log("[ACMS] Шкаф детализирован, временное упрощение...");
        if (typeof window.toggleCabinetDetail === 'function') {
            window.toggleCabinetDetail(cabinetIndex);
            wasDetailed = true;
            if (cabinet.isDetailed || !cabinet.mesh || cabinet.mesh.isGroup) {
            console.error("[applyCabinetChanges] Ошибка при временном упрощении!");
            if (typeof hideCabinetMenu === 'function') hideCabinetMenu();
            return;
        }
        } else { console.warn("[ACMS] toggleCabinetDetail не найдена"); }
    }

    // --- Блок 1: Считывание значений из полей МЕНЮ КОНФИГУРАЦИИ (`configMenu`) ---
    const configMenu = document.getElementById('cabinetConfigMenu');
    if (!configMenu) {
        console.error("[ACMS] Меню конфигурации (cabinetConfigMenu) не найдено!");
        if (wasDetailed && typeof window.toggleCabinetDetail === 'function') window.toggleCabinetDetail(cabinetIndex);
        return;
    }

    const newSettings = {}; // Используем newSettings вместо newValues, чтобы не путать
    configMenu.querySelectorAll('input[type="number"], input[type="text"], select, input[type="color"]').forEach(el => { 
        const prop = el.dataset.setProp || el.id;
        if (prop && !['toggleDetailBtn', 'applyConfigBtnInMenu'].includes(el.id)) {
            const propsInMetersFromMm = [
                'height', 'sinkDiameter', 'stretcherDrop', 'extraOffset', 'offsetFromParentWall',
                'fp_custom_height', 'fp_offset_from_floor', 'fp_depth', 'wallOffset', 'offsetBottom'
            ];
            if (el.type === 'number' || el.type === 'text') {
                let rawValue = parseFloat(el.value.replace(',', '.'));
                if (el.id === 'facadeGap' && !isNaN(rawValue)) { newSettings[prop] = rawValue / 1000; }
                else if (propsInMetersFromMm.includes(prop)) {
                    if (!isNaN(rawValue)) { newSettings[prop] = rawValue / 1000; }
                    else if (el.value === '' && (prop === 'fp_custom_height' || prop === 'fp_offset_from_floor' || prop === 'fp_depth')) {
                        newSettings[prop] = undefined;
                    }
                } else if (!isNaN(rawValue)) { newSettings[prop] = rawValue; }
            } else if (el.type === 'color' && prop === 'initialColor') { newSettings[prop] = el.value; }
            else if (el.tagName === 'SELECT') { newSettings[prop] = el.value; }
        }
    });
    //console.log("[ACMS] Считано из configMenu (newSettings):", JSON.parse(JSON.stringify(newSettings)));

    // --- Блок 2: Применение считанных специфичных настроек к объекту cabinet ---
     //console.log("newSettings.offsetFromParentWall: " + newSettings.offsetFromParentWall);
     //console.log("newSettings.wallOffset: " + newSettings.wallOffset);

    // Эти свойства специфичны для конфигурации, которая УЖЕ установлена в cabinet.cabinetConfig
    if (newSettings.isHeightIndependent !== undefined) {
        cabinet.isHeightIndependent = newSettings.isHeightIndependent;
    }
    if (cabinet.type === 'upperCabinet' && cabinet.isMezzanine === 'normal') {
        const checkboxUpper = configMenu.querySelector('#isHeightIndependentCheckboxUpper');
        if (checkboxUpper) { // Если чекбокс существует в DOM
            cabinet.isHeightIndependent = checkboxUpper.checked;
        }
    }
    if (newSettings.fp_type !== undefined) cabinet.fp_type = newSettings.fp_type;
    if (newSettings.fp_height_option !== undefined) cabinet.fp_height_option = newSettings.fp_height_option;
    if (newSettings.fp_vertical_align !== undefined) cabinet.fp_vertical_align = newSettings.fp_vertical_align;
    if (newSettings.fp_custom_height !== undefined) cabinet.fp_custom_height = newSettings.fp_custom_height;
    if (newSettings.fp_offset_from_floor !== undefined) cabinet.fp_offset_from_floor = newSettings.fp_offset_from_floor;
    // fp_depth для узкой/декоративной ФП будет применено ниже, в Блоке 3

    if (newSettings.facadeSet !== undefined) cabinet.facadeSet = newSettings.facadeSet;
    if (newSettings.textureDirection !== undefined) cabinet.textureDirection = newSettings.textureDirection;
    if (newSettings.initialColor !== undefined) cabinet.initialColor = newSettings.initialColor; // Цвет корпуса
    if (newSettings.facadeGap !== undefined) cabinet.facadeGap = newSettings.facadeGap;
    if (newSettings.shelfCount !== undefined) cabinet.shelfCount = newSettings.shelfCount;
    if (newSettings.shelfType !== undefined) { cabinet.shelfType = newSettings.shelfType;}
    if (newSettings.doorType !== undefined) cabinet.doorType = newSettings.doorType;
    // ... и другие специфичные для конфигураций свойства (drawerSet, ovenType, rearStretcher и т.д.)
    if (newSettings.drawerSet !== undefined) cabinet.drawerSet = newSettings.drawerSet;
    if (newSettings.facadeCount !== undefined) cabinet.facadeCount = newSettings.facadeCount;
    if (newSettings.rearStretcher !== undefined) cabinet.rearStretcher = newSettings.rearStretcher;
    if (newSettings.frontStretcher !== undefined) cabinet.frontStretcher = newSettings.frontStretcher;
    if (newSettings.stretcherDrop !== undefined) cabinet.stretcherDrop = newSettings.stretcherDrop;
    if (newSettings.rearPanel !== undefined) cabinet.rearPanel = newSettings.rearPanel;
    if (newSettings.offsetFromParentWall !== undefined) cabinet.offsetFromParentWall = newSettings.offsetFromParentWall;
    if (newSettings.ovenHeight !== undefined) {cabinet.ovenHeight = newSettings.ovenHeight;}
    if (newSettings.ovenType !== undefined) {cabinet.ovenType = newSettings.ovenType;}
    if (newSettings.ovenLevel !== undefined) {cabinet.ovenLevel = newSettings.ovenLevel;}
    if (newSettings.microwaveType !== undefined) {cabinet.microwaveType = newSettings.microwaveType;}
    if (newSettings.underOvenFill !== undefined) {
        cabinet.underOvenFill = newSettings.underOvenFill;
    }
    if (newSettings.topShelves !== undefined) {
        cabinet.topShelves = newSettings.topShelves;
    }
    
    if (newSettings.ovenPosition !== undefined) {
        cabinet.ovenPosition = newSettings.ovenPosition; // 'top' или 'bottom'
    }
    if (newSettings.extraOffset !== undefined) {
        cabinet.extraOffset = newSettings.extraOffset; // Это будет число в метрах (если extraOffset в propsInMetersFromMm)
    }
    if (newSettings.ovenColor !== undefined) { // Попытка считать по data-set-prop
        cabinet.ovenColor = newSettings.ovenColor;
        //console.log(`  [ACMS] Установлено cabinet.ovenColor из newSettings.ovenColor: ${cabinet.ovenColor}`);
    } else if (newSettings.ovenColorSelect !== undefined) { // Запасной вариант, если data-set-prop не сработал и prop стал равен ID
        cabinet.ovenColor = newSettings.ovenColorSelect;
        //console.log(`  [ACMS] Установлено cabinet.ovenColor из newSettings.ovenColorSelect: ${cabinet.ovenColor}`);
    }
    if (newSettings.visibleSide !== undefined) cabinet.visibleSide = newSettings.visibleSide;
    if (newSettings.verticalGolaProfile !== undefined) cabinet.verticalGolaProfile = newSettings.verticalGolaProfile;
    if (newSettings.gapAboveTopFacadeMm !== undefined && newSettings.gapAboveTopFacadeMm !== null && !isNaN(parseFloat(newSettings.gapAboveTopFacadeMm))) {
        let parsedGap = parseFloat(newSettings.gapAboveTopFacadeMm); // newSettings.gapAboveTopFacadeMm может быть уже числом или строкой
        if (!isNaN(parsedGap)) { // Проверяем, что результат парсинга - число
            cabinet.gapAboveTopFacadeMm = Math.max(0, Math.round(parsedGap)); // Округляем до целого и не даем быть < 0
        } else {
            console.warn(`  [ACMS] Не удалось спарсить gapAboveTopFacadeMm: "${newSettings.gapAboveTopFacadeMm}". Оставляем старое значение или дефолт.`);
            cabinet.gapAboveTopFacadeMm = cabinet.gapAboveTopFacadeMm !== undefined ? cabinet.gapAboveTopFacadeMm : 3;
        }
    } else if (newSettings.gapAboveTopFacadeMm === '') { // Если пользователь стер значение
        cabinet.gapAboveTopFacadeMm = 3; // Пример: ставим дефолт
    }
    if (newSettings.fridgeNicheHeightMm !== undefined && !isNaN(parseFloat(newSettings.fridgeNicheHeightMm))) {
        cabinet.fridgeNicheHeightMm = Math.max(1000, Math.min(2500, Math.round(parseFloat(newSettings.fridgeNicheHeightMm)))); // Ограничение и округление
        console.log(`  [ACMS] Применено fridgeNicheHeightMm: ${cabinet.fridgeNicheHeightMm}`);
    }
    if (newSettings.fridgeType !== undefined) cabinet.fridgeType = newSettings.fridgeType;
    if (newSettings.shelvesAbove !== undefined) cabinet.shelvesAbove = newSettings.shelvesAbove;
    // ... (применение visibleSide, doorOpening, verticalGolaProfile, если их data-set-prop настроены)
    if (newSettings.doorOpening !== undefined) cabinet.doorOpening = newSettings.doorOpening;
    if (newSettings.freezerFacadeHeightMm !== undefined && !isNaN(parseFloat(newSettings.freezerFacadeHeightMm))) {
        cabinet.freezerFacadeHeightMm = Math.max(500, Math.round(parseFloat(newSettings.freezerFacadeHeightMm)));
    }
    if (newSettings.topFacade1HeightMm !== undefined && !isNaN(parseFloat(newSettings.topFacade1HeightMm))) {
        cabinet.topFacade1HeightMm = Math.max(50, Math.round(parseFloat(newSettings.topFacade1HeightMm)));
    }
    if (newSettings.topFacade2HeightMm !== undefined && !isNaN(parseFloat(newSettings.topFacade2HeightMm))) {
        cabinet.topFacade2HeightMm = Math.max(0, Math.round(parseFloat(newSettings.topFacade2HeightMm)));
    }
    // --- Логика для Посудомойки ---
    if (newSettings.dishwasherWidth !== undefined && cabinet.cabinetConfig === 'dishwasher') {
        // 1. Сохраняем выбранную опцию ('450' или '600') в объекте шкафа
        cabinet.dishwasherWidth = newSettings.dishwasherWidth; 
        
        // 2. Преобразуем строковое значение в число и метры
        const newWidthMeters = parseFloat(newSettings.dishwasherWidth) / 1000;

        // 3. Проверяем, что значение корректно, и ПРИМЕНЯЕМ его как ОСНОВНУЮ ШИРИНУ шкафа
        if (!isNaN(newWidthMeters) && newWidthMeters > 0) {
            cabinet.width = newWidthMeters; 
            console.log(`[ACMS] Для посудомойки установлена новая ширина шкафа: ${cabinet.width} м`);
        }
    }




    // --- Обновление высоты шкафа на основе newSettings.height и isHeightIndependent ---
    const isTallCabinet_apply = (cabinet.cabinetType === 'straight' && ['tallStorage', 'tallOvenMicro', 'fridge'].includes(cabinet.cabinetConfig));
    const isUpperNormal_apply = (cabinet.type === 'upperCabinet' && cabinet.isMezzanine === 'normal');
    if (newSettings.height !== undefined) { // Если поле высоты было в меню и было считано
        if (isTallCabinet_apply || (isUpperNormal_apply && cabinet.isHeightIndependent)) {
            if (cabinet.isHeightIndependent) { // Чекбокс был отмечен (или стал отмечен)
                cabinet.height = newSettings.height; // Берем значение из поля
            } else {
                // Если чекбокс был снят, cabinet.height уже должна быть расчетной
                // (установлена слушателем чекбокса). Мы не должны брать newSettings.height,
                // так как поле было disabled.
                // Просто логируем, что используем уже установленную расчетную высоту.
            }
        } else if (cabinet.type === 'upperCabinet' && cabinet.isMezzanine !== 'normal' && !cabinet.isHeightIndependent) {
            //cabinet.height = newSettings.height;
        } else if (cabinet.cabinetConfig === 'falsePanel' && cabinet.fp_height_option === 'freeHeight') {
            cabinet.height = newSettings.height;
            cabinet.fp_custom_height = newSettings.height;
        }
        // Для других случаев (стандартные нижние, зависимые верхние) высота из newSettings.height не применяется здесь.
    }
    // --- Конец обновления высоты 
    // Применение отступа от пола для ОБЫЧНЫХ ВЕРХНИХ со свободной высотой
    if (isUpperNormal_apply && cabinet.isHeightIndependent && newSettings.offsetBottom !== undefined) {
        cabinet.offsetBottom = newSettings.offsetBottom;
        // console.log(`[ACMS] Отступ от пола для верхнего шкафа ${cabinetIndex} (свободный) ПРИМЕНЕН из поля: ${cabinet.offsetBottom} м`);
    }


    // --- Блок 3: Окончательный Расчет и применение размеров/параметров для ФАЛЬШ-ПАНЕЛИ ---
    if (cabinet.cabinetConfig === 'falsePanel') {
        //console.log("[ACMS] Финальный расчет для ФАЛЬШ-ПАНЕЛИ. fp_type:", cabinet.fp_type);
        const { thickness: facadeThicknessMeters } = window.getFacadeMaterialAndThickness(cabinet);

        if (cabinet.fp_type === 'narrow' || cabinet.fp_type === 'decorativePanel') {
            cabinet.width = facadeThicknessMeters;
            // Глубина берется из поля fp_depth_input, которое было считано в newSettings.fp_depth
            cabinet.depth = newSettings.fp_depth !== undefined ? newSettings.fp_depth : (cabinet.fp_type === 'narrow' ? 0.080 : 0.582);
            cabinet.overhang = 0.018 - facadeThicknessMeters;
        } else if (cabinet.fp_type === 'wideLeft' || cabinet.fp_type === 'wideRight') {
            // cabinet.width (ширина лицевой части) и cabinet.depth (глубина держателя)
            // НЕ МЕНЯЮТСЯ ЗДЕСЬ. Они были установлены на предыдущем шаге
            // (applyChangesAndPrepareForConfigMenu -> prepareCabinetForNewConfig или из инпутов cabinetMenu).
            cabinet.overhang = 0.018;
        }

        // Расчет cabinet.offsetBottom (на основе уже примененных cabinet.fp_vertical_align и cabinet.fp_offset_from_floor)
        if (cabinet.fp_vertical_align === 'floor') {
            cabinet.offsetBottom = cabinet.fp_offset_from_floor !== undefined ? cabinet.fp_offset_from_floor : 0;
        } else { // cabinetBottom
            cabinet.offsetBottom = kitchenGlobalParams.plinthHeight / 1000;
        }

        // Расчет cabinet.height (на основе уже примененных cabinet.fp_height_option и др.)
        let calculatedHeightM = cabinet.height; // Начинаем с текущей
        if (cabinet.fp_height_option === 'cabinetHeight') {
            calculatedHeightM = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - (cabinet.offsetBottom * 1000)) / 1000;
        } else if (cabinet.fp_height_option === 'toGola') {
            //const availableForGolaAndFacadesMm = kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - (cabinet.offsetBottom * 1000);
            //const cabinetHeightForGolaCalculating = kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight;
            //const golaHeightM = (window.calculateActualGolaHeight ? window.calculateActualGolaHeight(kitchenGlobalParams.golaMinHeightMm, (cabinet.facadeGap || 0.003) * 1000, cabinetHeightForGolaCalculating) / 1000 : 0.058);
            //calculatedHeightM_final = availableForGolaAndFacadesMm / 1000 - golaHeightM;


            const availableForGolaMm = kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - (cabinet.offsetBottom * 1000);
            const cabinetHeightForGolaCalculating = kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight;
            const golaHeightM = (window.calculateActualGolaHeight ? window.calculateActualGolaHeight(kitchenGlobalParams.golaMinHeightMm, (cabinet.facadeGap || 0.003) * 1000, cabinetHeightForGolaCalculating) / 1000 : 0.058);
            const golaM = (window.calculateActualGolaHeight && typeof window.calculateActualGolaHeight === 'function'
                ? window.calculateActualGolaHeight(kitchenGlobalParams.golaMinHeightMm, (cabinet.facadeGap || 0.003) * 1000, availableForGolaMm) / 1000
                : 0.058);
            calculatedHeightM = availableForGolaMm / 1000 - golaM;
        } else if (cabinet.fp_height_option === 'kitchenHeight') {
            calculatedHeightM = (kitchenGlobalParams.totalHeight / 1000) - cabinet.offsetBottom;
        } else if (cabinet.fp_height_option === 'freeHeight') {
            // Если выбрана "свободная высота", значение берется из ОСНОВНОГО поля высоты шкафа (id="cabinetHeight"),
            // которое было считано в newSettings.height (если оно было в configMenu и активно).
            if (newSettings.height !== undefined) { // Это значение из поля <input id="cabinetHeight"> в configMenu
                calculatedHeightM = newSettings.height;
            } else if (cabinet.fp_custom_height !== undefined) { // Или из fp_custom_height, если оно было задано и #cabinetHeight не трогали
                calculatedHeightM = cabinet.fp_custom_height;
            } // else calculatedHeightM остается cabinet.height
            cabinet.fp_custom_height = calculatedHeightM; // Синхронизируем значение для поля "Свободная высота ФП"
        }
        cabinet.height = Math.max(0.05, calculatedHeightM);
        cabinet.isHeightIndependent = (cabinet.fp_height_option === 'freeHeight' || cabinet.fp_height_option === 'kitchenHeight');
        //console.log("[ACMS] ФП после финальных расчетов:", JSON.parse(JSON.stringify(cabinet)));

    } else { // Если это НЕ фальш-панель
        // Применяем значение из основного поля высоты (newSettings.height),
        // если оно было в configMenu, редактируемо и изменено.
        if (newSettings.height !== undefined) {
            const heightInputInConfigMenu = configMenu.querySelector('#cabinetHeight');
            if (heightInputInConfigMenu && !heightInputInConfigMenu.disabled) {
                // Сравниваем с тем, что было у объекта cabinet ДО применения newSettings
                // Это немного сложно, так как newSettings уже могли изменить cabinet.height
                // Проще: если поле было активно, применяем его значение.
                cabinet.height = newSettings.height;
                const isTallOrUpper = cabinet.type === 'upperCabinet' ||
                                     (cabinet.cabinetType === 'straight' && ['tallStorage', 'tallOvenMicro', 'fridge', 'highDivider'].includes(cabinet.cabinetConfig));
                if (isTallOrUpper) {
                    cabinet.isHeightIndependent = true;
                }
            }
        }
    }

    // --- Блок 4: Финальные расчеты и обновление 3D ---
    if (cabinet.type === 'lowerCabinet' && cabinet.wallId !== 'Bottom') {
        cabinet.offsetFromParentWall = window.calculateLowerCabinetOffset(cabinet);
    }

    // Обновление 3D
    //if (wasDetailed) { // Если ИЗНАЧАЛЬНО был детализирован, переключаем на простой
    //    window.toggleCabinetDetail(cabinetIndex); // Станет простым с новыми данными
    //}

    // Обновляем геометрию простого куба (или только что созданного простого)
    if (cabinet.mesh && cabinet.mesh.isMesh) {
        if (cabinet.mesh.geometry) cabinet.mesh.geometry.dispose();
        cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
        if (cabinet.edges && cabinet.edges.geometry) {
            cabinet.edges.geometry.dispose();
            cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
        }
        if (cabinet.mesh.material) {
            cabinet.mesh.material.color.set(cabinet.initialColor);
            cabinet.mesh.material.needsUpdate = true;
        }
    } else if (cabinet.mesh && cabinet.mesh.isGroup) {
        // Этого не должно быть здесь, если wasDetailed был true, мы переключили на простой.
        // Если wasDetailed false, а cabinet.mesh - группа, это ошибка в toggleCabinetDetail.
        console.warn("[ACMS] cabinet.mesh является группой, хотя ожидался Mesh после упрощения.");
    }
    window.updateCabinetPosition(cabinet);

    const hasIntersection = window.checkCabinetIntersections(cabinet);
    if (cabinet.mesh && cabinet.mesh.isMesh && cabinet.mesh.material) {
        cabinet.mesh.material.color.set(hasIntersection ? 0xff0000 : cabinet.initialColor);
        cabinet.mesh.material.needsUpdate = true;
    }

    if (wasDetailed) { // Если ИЗНАЧАЛЬНО был детализирован, возвращаем детализацию
        //console.log("[ACMS] Восстановление детализации...");
        window.toggleCabinetDetail(cabinetIndex); // Станет детализированным с новыми данными
        if (window.checkCabinetIntersections(cabinet)) {
            console.warn("[ACMS] Детализированный шкаф пересекается после применения настроек.");
        }
    }

    if (typeof hideCabinetConfigMenu === 'function') hideCabinetConfigMenu();
    //console.log(`--- [ACMS] Завершено для ${cabinetIndex}. Финальный объект cabinet:`, JSON.parse(JSON.stringify(cabinet)));
}


//------------

window.addEventListener('resize', () => {
    const canvasContainer = document.getElementById('canvasContainer');
    if (!canvasContainer) return;

    const canvasWidth = canvasContainer.clientWidth; // Используем clientWidth
    const canvasHeight = canvasContainer.clientHeight; // Используем clientHeight

    if (canvasWidth === 0 || canvasHeight === 0) return; // Игнорируем нулевые размеры

    renderer.setSize(canvasWidth, canvasHeight);

    const aspect = canvasWidth / canvasHeight;

    // --- Обновляем Перспективную Камеру ---
    camera.aspect = aspect;
    camera.updateProjectionMatrix();

    // --- Обновляем Ортографическую Камеру ---
    // Пересчитываем frustumSize на основе текущего вида, если он ортографический
    // Или используем фиксированный/адаптивный размер
    const roomSize = Math.max(currentLength, currentWidth, currentHeight) || 5;
    const zoomFactor = 1.2;
    const targetFrustumSize = roomSize * zoomFactor / orthoCamera.zoom; // Учитываем текущий зум!

    orthoCamera.left = targetFrustumSize * aspect / -2;
    orthoCamera.right = targetFrustumSize * aspect / 2;
    orthoCamera.top = targetFrustumSize / 2;
    orthoCamera.bottom = targetFrustumSize / -2;
    orthoCamera.updateProjectionMatrix();

    // Обновляем пост-обработку, если используется
    if (typeof composer !== 'undefined' && composer) {
        composer.setSize(canvasWidth, canvasHeight);
    }
    if (typeof outlinePass !== 'undefined' && outlinePass) {
        outlinePass.resolution.set(canvasWidth, canvasHeight);
    }
    // if (fxaaPass) { ... } // Обновление fxaaPass
    requestRender();
    //updateFaceBounds(); // Обновляем границы
});

function updateCountertopButtonVisibility() {
    const hasLowerCabinet = selectedCabinets.some(cab =>
        (cab.type === 'lowerCabinet' && !cab.isHeightIndependent) ||
        (cab.type === 'freestandingCabinet')
    );
    countertopButton.style.display = hasLowerCabinet ? 'block' : 'none';
}

const hintBar = document.getElementById('hint-bar');
function updateHint(text) {
    hintBar.textContent = text;
}

const countertopButton = document.createElement('button');
countertopButton.id = 'countertop-button';
countertopButton.textContent = 'Добавить столешницу';
document.getElementById('leftPanel').appendChild(countertopButton);

countertopButton.addEventListener('click', () => {
    if (selectedCabinets.length === 0) {
        updateHint('Выделите хотя бы один шкаф!');
        return;
    }

    const anchorCabinet = selectedCabinets[0];
    const isLowerAnchor = (anchorCabinet.type === 'lowerCabinet' && !anchorCabinet.isHeightIndependent) ||
                          (anchorCabinet.type === 'freestandingCabinet');

    if (!isLowerAnchor) {
        updateHint('Первый выделенный шкаф должен быть нижним!');
        return;
    }

    const filteredCabinets = selectedCabinets.filter(cab => {
        const isLower = (cab.type === 'lowerCabinet' && !cab.isHeightIndependent) ||
                        (cab.type === 'freestandingCabinet');
        if (!isLower) return false;

        if (anchorCabinet.wallId) {
            return cab.wallId === anchorCabinet.wallId;
        } else if (anchorCabinet.type === 'freestandingCabinet') {
            return selectedCabinets.some(c => {
                const box1 = new THREE.Box3().setFromObject(c.mesh);
                const box2 = new THREE.Box3().setFromObject(cab.mesh);
                return box1.intersectsBox(box2);
            });
        }
        return false;
    });

    if (filteredCabinets.length === 0) {
        updateHint('Нет подходящих нижних шкафов для столешницы!');
        return;
    }

    selectedCabinets = filteredCabinets;
    // Обновляем цвета всех шкафов (не только выделенных)
    cabinets.forEach(c => {
        const isSelectedForCountertop = selectedCabinets.includes(c);
        const hasIntersection = checkCabinetIntersections(c);

        // --- НАЧАЛО ИЗМЕНЕНИЯ ---
        // Применяем цвет ТОЛЬКО если это НЕ детализированный шкаф
        if (!c.isDetailed && c.mesh.material) {
            if (isSelectedForCountertop) {
                // Можно временно подсветить выбранные под столешницу, но пока оставим основной цвет или цвет пересечения
                c.mesh.material.color.set(hasIntersection ? 0xff0000 : c.initialColor); // Пример
                // c.mesh.material.color.set(0x00e0e0); // Или временная подсветка
            } else {
                c.mesh.material.color.set(hasIntersection ? 0xff0000 : c.initialColor);
            }
            c.mesh.material.needsUpdate = true;
        } else if (c.isDetailed && isSelectedForCountertop) {
            // Можно подсветить детализированный шкаф, если нужно
            // applyHighlight(c.mesh); // Например
        } else if (c.isDetailed && !isSelectedForCountertop) {
            // Снять подсветку, если она была
            // removeHighlight(c.mesh);
        }

        // Обновляем ребра простого куба
        if (c.edges && c.edges.material) {
            // c.edges.material.color.set(isSelectedForCountertop ? 0xff00ff : 0x000000); // Пример подсветки ребер
            c.edges.material.needsUpdate = true;
        }
        // --- КОНЕЦ ИЗМЕНЕНИЯ ---
    });

    createCountertop(selectedCabinets);
});

/**
 * Создает столешницу над выбранными шкафами.
 * @param {Array} selectedCabinets - Массив выбранных объектов шкафов.
 */
function createCountertop(selectedCabinets) {
    if (!selectedCabinets || selectedCabinets.length === 0) {
        updateHint('Не выбраны шкафы для создания столешницы.');
        return;
    }

    // Работаем только с первым выбранным шкафом для определения типа и базового положения
    const anchorCabinet = selectedCabinets[0];

    // --- ЛОГИКА ДЛЯ СВОБОДНО СТОЯЩЕГО ШКАФА ---
    if (anchorCabinet.type === 'freestandingCabinet') {
        console.log("Creating countertop for freestanding cabinet:", anchorCabinet.mesh.uuid);

        // Параметры по умолчанию и из шкафа
        const cabinet = anchorCabinet; // Для читаемости
        const defaultDepth = (kitchenGlobalParams.countertopDepth || 600) / 1000; // Глубина столешницы по умолчанию
        const thickness = (kitchenGlobalParams.countertopThickness || 38) / 1000;
        const cabOverhang = cabinet.overhang ?? 0.02;         // Свес фасада шкафа
        const cabFacadeThickness = cabinet.facadeThickness ?? 0.018; // Толщина фасада шкафа

        // Определяем "длину" столешницы = ширине шкафа вдоль его лицевой стороны
        const rotationY = cabinet.mesh.rotation.y;
        const length = (Math.abs(rotationY) < 0.1 || Math.abs(Math.abs(rotationY) - Math.PI) < 0.1)
                     ? cabinet.width  // Если не повернут или повернут на 180, длина = ширина шкафа
                     : cabinet.width; // Если повернут на 90/-90, длина = глубина шкафа

        // Геометрия и материал
        const geometry = new THREE.BoxGeometry(length, thickness, defaultDepth); // Длина, Толщина(Y), Глубина(Z)
        const material = new THREE.MeshStandardMaterial({ color: 0x808080 }); // Стандартный серый
        const countertop = new THREE.Mesh(geometry, material);

        // --- Расчет Позиции ---
        const cabinetCenter = cabinet.mesh.position;
        const cabinetQuaternion = cabinet.mesh.quaternion; // Используем кватернион для точного направления
        const cabinetHeight = cabinet.height;
        const cabinetDepth = (Math.abs(rotationY) < 0.1 || Math.abs(Math.abs(rotationY) - Math.PI) < 0.1)
                           ? cabinet.depth // Глубина шкафа вдоль его локальной Z
                           : cabinet.depth;

        // 1. Высота Y центра столешницы
        const targetY = cabinetCenter.y + cabinetHeight / 2 + thickness / 2;

        // 2. Смещение центра столешницы относительно центра шкафа,
        //    чтобы передняя кромка столешницы была перед фасадом шкафа
        //    на расстоянии (свес + толщина фасада)
        const forwardDir = new THREE.Vector3(0, 0, 1).applyQuaternion(cabinetQuaternion); // Направление "вперед" шкафа
        // Насколько центр столешницы должен быть смещен вперед от центра шкафа:
        // Смещение = (ГлубинаШкафа/2 + Свес + ТолщФасада) - (ГлубинаСтолешницы/2)
        const offsetMagnitude = (cabinetDepth / 2) + cabOverhang + cabFacadeThickness - (defaultDepth / 2);

        // 3. Финальная позиция центра столешницы
        const targetPos = cabinetCenter.clone().addScaledVector(forwardDir, offsetMagnitude);
        targetPos.y = targetY; // Устанавливаем правильную высоту

        // Применяем позицию и вращение (как у шкафа)
        countertop.position.copy(targetPos);
        countertop.rotation.copy(cabinet.mesh.rotation);

        // Заполняем userData
        countertop.userData = {
            type: 'countertop',
            wallId: 'Bottom', // Признак столешницы на свободно стоящем шкафу
            length: length,   // Длина вдоль "фасада" шкафа
            depth: defaultDepth, // Начальная глубина
            thickness: thickness,
            cabinetUuid: cabinet.mesh.uuid, // Ссылка на UUID родительского шкафа (ВАЖНО!)
            heightDependsOnGlobal: false,  // Высота НЕ зависит от глобальных настроек (ВАЖНО!)
            materialType: 'solid',
            solidColor: '#808080'
            // offsetAlongWall и т.п. здесь не нужны
        };

        // Добавляем ребра
        const edgesGeometry = new THREE.EdgesGeometry(geometry);
        const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
        const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
        edges.raycast = () => {};
        countertop.add(edges);
        countertop.userData.edges = edges; // Сохраняем ссылку

        // Добавляем в сцену и массив
        scene.add(countertop); // Добавляем в комнату
        countertops.push(countertop); // Добавляем в общий массив столешниц
        console.log('Freestanding countertop created:', countertop.uuid);
        updateHint('Столешница для свободно стоящего шкафа добавлена!');

    // --- ЛОГИКА ДЛЯ ШКАФОВ У СТЕН (ТВОЯ СУЩЕСТВУЮЩАЯ ЛОГИКА) ---
    } else if (['Back', 'Front', 'Left', 'Right'].includes(anchorCabinet.wallId)) {
        console.log("Creating countertop for wall cabinet(s)...");

        // Определяем размеры столешницы
        const wallId = anchorCabinet.wallId;
        const wallCabinets = selectedCabinets.filter(cab => cab.wallId === wallId);
        const positions = wallCabinets.map(cab => cab.offsetAlongWall);
        const minOffset = Math.min(...positions);
        const maxOffset = Math.max(...positions) + wallCabinets.find(cab => cab.offsetAlongWall === Math.max(...positions)).width;
        const length = maxOffset - minOffset; // В метрах
        const depth = kitchenGlobalParams.countertopDepth / 1000; // мм -> м
        const thickness = kitchenGlobalParams.countertopThickness / 1000; // мм -> м
        const countertopType = kitchenGlobalParams.countertopType;

        // Высота столешницы: центр шкафа + половина высоты
        const cabinetCenterY = anchorCabinet.mesh.position.y; // Центр по y
        const cabinetHeight = anchorCabinet.height; // Высота шкафа в метрах
        const cabinetTopY = cabinetCenterY + cabinetHeight / 2; // Верхняя грань

        // Размеры комнаты в метрах
        const roomWidth = currentLength;  // X, ширина комнаты
        const roomDepth = currentHeight;  // Z, глубина комнаты

        // Геометрия и материал
        const geometry = new THREE.BoxGeometry(length, thickness, depth);
        //const material = new THREE.MeshPhongMaterial({ color: 0x808080 }); // Коричневый
        const material = createCountertopMaterial({
            materialType: 'solid', // начальное значение
            solidColor: '#808080',
            textureType: kitchenGlobalParams.countertopType
        });
        const countertop = new THREE.Mesh(geometry, material);

        // Позиция в локальной системе cube
        let x, y, z;
        y = cabinetTopY + thickness / 2; // Нижняя грань столешницы = верх шкафа
        if (wallId === 'Back') {
            x = minOffset + length / 2 - roomWidth / 2; // Центр по ширине
            z = -roomDepth / 2 + depth / 2; // Центр столешницы от задней стены
        } else if (wallId === 'Front') {
            x = minOffset + length / 2 - roomWidth / 2;
            z = roomDepth / 2 - depth / 2; // Центр столешницы от передней стены
        } else if (wallId === 'Left') {
            x = -roomWidth / 2 + depth / 2; // Центр столешницы от левой стены
            z = minOffset + length / 2 - roomDepth / 2;
            countertop.rotation.y = Math.PI / 2;
        } else if (wallId === 'Right') {
            x = roomWidth / 2 - depth / 2; // Центр столешницы от правой стены
            z = minOffset + length / 2 - roomDepth / 2;
            countertop.rotation.y = Math.PI / 2;
        }

        countertop.position.set(x, y, z);
        // Заполняем userData с учётом countertopType
        countertop.userData = { 
            type: 'countertop', 
            wallId: wallId, 
            length: length, 
            depth: depth, 
            thickness: thickness,
            offsetAlongWall: minOffset, //размер, необходимый для пересчета расположения столешницы после обновления комнаты
            countertopType: countertopType, // Добавили тип столешницы
            materialType: 'solid', // Начальный тип материала
            solidColor: '#808080',  // Начальный цвет
            initialMaterial: Array.isArray(material)
                ? material.map(m => m.clone())
                : material.clone(), // Сохраняем начальный материал
            heightDependsOnGlobal: true
        };
        scene.add(countertop); // Добавляем в cube
        countertops.push(countertop);
        console.log('Countertops array:', countertops); // Проверим

        // Edges
        const edgesGeometry = new THREE.EdgesGeometry(geometry);
        const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
        const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
        // Делаем ребра невидимыми для Raycaster'а
        edges.raycast = () => {};

        // Добавляем ребра как дочерний объект к мешу столешницы
        countertop.add(edges); // <<-- ИЗМЕНЕНИЕ: добавляем к countertop, а не к cube

        // Сохраняем ссылку на ребра в userData
        countertop.userData.edges = edges;

        const box = new THREE.Box3().setFromObject(countertop);
        //console.log('Countertop bounding box (mesh only):', box);
        const fullBox = new THREE.Box3().setFromObject(cube);
        //console.log('Full cube bounding box:', fullBox);

        updateHint('Столешница добавлена! Длина: ' + (length * 1000).toFixed(0) + ' мм');
        //console.log('Countertop created:', countertop);
        //console.log('Anchor cabinet position:', anchorCabinet.mesh.position);
        //console.log('Anchor cabinet height:', anchorCabinet.height);
        //console.log('Countertop position:', countertop.position);
        //console.log('Room dimensions (width, depth):', roomWidth, roomDepth);
    } else {
        updateHint('Не удалось определить тип шкафа для создания столешницы.');
        console.warn("Cannot create countertop: Anchor cabinet type unknown or wallId invalid.", anchorCabinet);
    }
}

// Новая функция для создания столешницы из загруженных данных
function createCountertopFromData(ctData) { // ctData - это объект из projectState.countertops
    console.log("[createCountertopFromData] Попытка создать столешницу из ctSavedData:", JSON.parse(JSON.stringify(ctData)));
    
    const savedUserData = ctData.userData; // Получаем вложенный объект userData

    console.log("  [createCountertopFromData] savedUserData ПЕРЕД использованием:", JSON.parse(JSON.stringify(savedUserData)));
    
    if (!ctData || !savedUserData || savedUserData.type !== 'countertop') {
        console.error("  [createCountertopFromData] Неверные входные данные (ожидался savedUserData.type === 'countertop'):", ctData);
        return null;
    }

    // --- Размеры из savedUserData ---
    let length = savedUserData.length;
    let thickness = savedUserData.thickness;
    let depth = savedUserData.depth;

    // Проверка и установка дефолтов, если размеры некорректны или отсутствуют
    if (typeof length !== 'number' || length <= 0) { length = 1; /* лог */ }
    if (typeof thickness !== 'number' || thickness <= 0) {
        // При загрузке толщина ДОЛЖНА соответствовать типу столешницы, как он сохранен
        // или пересчитываться на основе сохраненного countertopType и kitchenGlobalParams
        if (savedUserData.countertopType === 'compact-plate') {
            thickness = (kitchenGlobalParams.countertopThicknessCompactPlate || 12) / 1000;
        } else if (savedUserData.countertopType === 'postforming') {
            thickness = (kitchenGlobalParams.countertopThicknessPostforming || 38) / 1000;
        } else if (savedUserData.countertopType === 'quartz') {
            thickness = (kitchenGlobalParams.countertopThicknessQuartz || 20) / 1000;
        } else {
            thickness = (kitchenGlobalParams.countertopThickness || 38) / 1000; // Общий дефолт
        }
        console.warn(`    Толщина для типа ${savedUserData.countertopType} была скорректирована/установлена на ${thickness.toFixed(3)}м.`);
    }
    if (typeof depth !== 'number' || depth <= 0) { depth = 0.6; /* лог */ }
    console.log(`  [createCountertopFromData] Финальные размеры для геометрии: L=${length.toFixed(3)}, T=${thickness.toFixed(3)}, D=${depth.toFixed(3)}`);

    const geometry = new THREE.BoxGeometry(length, thickness, depth);
    
    const material = createCountertopMaterial({
        materialType: savedUserData.materialType,    // Из savedUserData
        solidColor: savedUserData.solidColor,      // Из savedUserData
        textureType: savedUserData.countertopType  // Из savedUserData (это тип столешницы: postforming, compact-plate)
    });
    
    const countertopMesh = new THREE.Mesh(geometry, material);

    // Установка трансформаций из ctData (это правильно)
    if (ctData.position) { countertopMesh.position.copy(ctData.position); }
    if (ctData.rotation) { countertopMesh.rotation.set(ctData.rotation.x, ctData.rotation.y, ctData.rotation.z, ctData.rotation.order || 'XYZ'); }
    if (ctData.scale) { countertopMesh.scale.copy(ctData.scale); }
    countertopMesh.uuid = ctData.uuid_mesh || THREE.MathUtils.generateUUID(); // Используем сохраненный uuid_mesh

    // Восстановление userData для нового меша
    countertopMesh.userData = {}; // Начинаем с чистого
    // Копируем ВСЕ свойства из savedUserData, чтобы ничего не потерять
    for (const key in savedUserData) {
        if (Object.hasOwnProperty.call(savedUserData, key)) {
            countertopMesh.userData[key] = savedUserData[key];
        }
    }
    // Перезаписываем/гарантируем ключевые свойства с актуальными значениями, использованными для геометрии
    countertopMesh.userData.type = 'countertop'; 
    countertopMesh.userData.length = length;     
    countertopMesh.userData.thickness = thickness; 
    countertopMesh.userData.depth = depth;
    // Убедимся, что id_data есть (для выделения и работы с меню)
    if (!countertopMesh.userData.id_data) { 
        countertopMesh.userData.id_data = THREE.MathUtils.generateUUID();
    }
    
    console.log(`  [createCountertopFromData] countertopMesh.userData ПОСЛЕ присвоения:`, JSON.parse(JSON.stringify(countertopMesh.userData)));

    // Ребра
    const edgesGeometry = new THREE.EdgesGeometry(geometry);
    const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edges.raycast = () => {}; 
    countertopMesh.add(edges); 
    countertopMesh.userData.edges = edges;

    // Добавление в сцену и массив
    if (cube) { 
        scene.add(countertopMesh);
    } else { /* ... ошибка ... */ }

    // Добавляем в ГЛОБАЛЬНЫЙ массив countertops
    if (typeof countertops !== 'undefined' && Array.isArray(countertops)) {
        console.log("    [createCountertopFromData] Перед countertops.push. Длина:", countertops.length);
        countertops.push(countertopMesh);
        console.log("    [createCountertopFromData] После countertops.push. Длина:", countertops.length);
    } else { /* ... ошибка ... */ }
    
    updateTextureScale(countertopMesh);
    console.log(`  [createCountertopFromData] Столешница ${countertopMesh.uuid} (data ID: ${countertopMesh.userData.id_data}) создана.`);
    return countertopMesh;
}

function updateTextureScale(countertop) {
    if (countertop.userData.materialType === 'oak' || countertop.userData.materialType === 'stone') {
        const textureWidth = 2.8;  // метры, аналог ~2800мм
        const textureDepth = 1.3;  // метры, аналог ~1300мм
        const countertopWidth = countertop.userData.length;
        const countertopDepth = countertop.userData.depth;

        const material = countertop.material;

        // Поддержка мульти-материала (массив) — compact-плита
        if (Array.isArray(material)) {
            material.forEach((mat, i) => {
                const tex = mat.map;
                if (!tex) return;
                tex.rotation = Math.PI / 2;
                tex.repeat.set(countertopDepth / textureDepth, countertopWidth / textureWidth);
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                tex.needsUpdate = true;
            });
        } else {
            const tex = material.map;
            if (!tex) return;

            tex.rotation = Math.PI / 2;
            tex.repeat.set(countertopDepth / textureDepth, countertopWidth / textureWidth);
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.needsUpdate = true;
        }

        countertop.material.needsUpdate = true;
    }
}

// === Обновление материала столешницы (при изменении типа) ===
function updateCountertopMaterial(countertop) {
    const newMaterial = createCountertopMaterial(countertop.userData);
    countertop.material = Array.isArray(newMaterial) ? newMaterial : [newMaterial];
    countertop.material.needsUpdate = true;
}


/**
 * Получает глубину столешницы для указанной стены.
 * Ищет существующую столешницу на этой стене. Если не находит,
 * возвращает глубину по умолчанию из kitchenGlobalParams.
 * @param {string} wallId - ID стены ('Back', 'Front', 'Left', 'Right').
 * @returns {number} Глубина столешницы в метрах.
 */
function getCountertopDepthForWall(wallId) {
    const defaultDepthM = (kitchenGlobalParams.countertopDepth || 600) / 1000; // Значение по умолчанию в метрах
    if (!wallId || wallId === 'Bottom') { // Не применяем к полу
        return defaultDepthM;
     }

    // Ищем любую столешницу на этой стене
    const countertopOnWall = countertops.find(ct => ct.userData.wallId === wallId);

    // Возвращаем ее глубину или глубину по умолчанию
    return countertopOnWall ? countertopOnWall.userData.depth : defaultDepthM;
}

/**
 * Рассчитывает отступ нижнего шкафа от родительской стены.
 * Учитывает глубину столешницы, глубину шкафа, свес и ТОЛЩИНУ ФАСАДА из набора.
 * @param {object} cabinet - Объект шкафа из массива cabinets.
 * @returns {number} Рассчитанный отступ в метрах.
 */
function calculateLowerCabinetOffset(cabinet) {
    if (!cabinet || cabinet.type !== 'lowerCabinet' || !cabinet.wallId || cabinet.wallId === 'Bottom') {
        return cabinet ? cabinet.offsetFromParentWall || 0 : 0; // Возвращаем старый или 0
    }

    const wallCountertopDepth = getCountertopDepthForWall(cabinet.wallId); // Глубина столешницы в метрах

    // Получаем параметры шкафа
    const cabDepth = cabinet.depth; // Глубина корпуса шкафа в метрах
    const cabOverhang = cabinet.overhang; // Свес столешницы над фасадом в метрах

    // --- НАЧАЛО: Получаем толщину фасада из набора ---
    let facadeThicknessMeters = 18 / 1000; // Толщина по умолчанию, если набор не найден
    const facadeSetId = cabinet.facadeSet; // ID выбранного набора

    if (facadeSetId && window.facadeSetsData) {
        const setData = window.facadeSetsData.find(set => set.id === facadeSetId);
        if (setData && setData.thickness) {
            facadeThicknessMeters = setData.thickness / 1000; // Берем толщину из набора (она в мм)
             console.log(`[CalcOffset] Используется толщина фасада ${setData.thickness} мм из набора ${facadeSetId}`);
        } else if (setData) {
             // Если толщина в наборе не задана, берем дефолтную для типа материала
             const loadedFacadeData = window.facadeOptionsData || {};
             const materialInfo = loadedFacadeData[setData.materialType] || {};
             facadeThicknessMeters = (materialInfo.defaultThickness || 18) / 1000;
             console.log(`[CalcOffset] Толщина не найдена в наборе ${facadeSetId}, используется дефолтная ${facadeThicknessMeters * 1000} мм для типа ${setData.materialType}`);
        }
         else {
            //console.warn(`[CalcOffset] Набор фасадов ${facadeSetId} не найден. Используется толщина по умолчанию ${facadeThicknessMeters * 1000} мм.`);
        }
    } else {
         console.warn(`[CalcOffset] ID набора фасадов не задан для шкафа ${cabinet.mesh?.uuid}. Используется толщина по умолчанию ${facadeThicknessMeters * 1000} мм.`);
    }
    // --- КОНЕЦ: Получаем толщину фасада ---


    if (typeof cabDepth !== 'number' || typeof cabOverhang !== 'number') {
         console.warn("Отсутствуют свойства depth/overhang для расчета смещения шкафа:", cabinet);
         return cabinet.offsetFromParentWall || 0;
    }

    // Расчет отступа: ГлубинаСтол - Свес - ТолщинаФасада - ГлубинаКорпуса
    const offset = wallCountertopDepth - cabOverhang - facadeThicknessMeters - cabDepth;
    //console.log(`[CalcOffset] Расчет: ${wallCountertopDepth.toFixed(3)} - ${cabOverhang.toFixed(3)} - ${facadeThicknessMeters.toFixed(3)} - ${cabDepth.toFixed(3)} = ${offset.toFixed(3)}`);

    return offset;
}

/**
 * Обновляет глубину для всех столешниц на указанной стене
 * и пересчитывает отступы и позиции нижних шкафов на той же стене.
 * @param {string} wallId - ID стены для обновления.
 * @param {number} newDepthM - Новая глубина столешницы в метрах.
 */
function updateDepthForWall(wallId, newDepthM) {
    if (!wallId || wallId === 'Bottom' || isNaN(newDepthM) || newDepthM < 0.1) { // Мин. глубина 100мм
        console.warn(`Invalid parameters for updateDepthForWall: wallId=${wallId}, newDepthM=${newDepthM}`);
        return;
    }

    console.log(`Updating depth for wall ${wallId} to ${newDepthM * 1000}mm`);

    let depthActuallyChanged = false; // Флаг, что глубина хотя бы одной столешницы изменилась

    // --- Обновляем все столешницы на этой стене ---
    countertops.forEach(ct => {
        if (ct.userData.wallId === wallId) {

            const oldDepth = ct.userData.depth; // Сохраняем старую глубину ДО обновления

            // Проверяем, нужно ли обновление для этой конкретной столешницы
            if (Math.abs(oldDepth - newDepthM) > 1e-5) { // Сравниваем с допуском
                console.log(` - Updating countertop ${ct.uuid} depth from ${oldDepth} to ${newDepthM}`);
                depthActuallyChanged = true; // Отмечаем, что изменения были

                // 1. Обновляем данные и геометрию
                ct.userData.depth = newDepthM; // Обновляем данные
                const thickness = ct.userData.thickness;
                const length = ct.userData.length;
                ct.geometry.dispose();
                ct.geometry = new THREE.BoxGeometry(length, thickness, newDepthM); // Новая геометрия

                // Обновляем ребра
                if (ct.userData.edges) {
                    ct.userData.edges.geometry.dispose();
                    ct.userData.edges.geometry = new THREE.EdgesGeometry(ct.geometry);
                }

                // ---> 2. Корректируем позицию центра <---
                const depthDifference = newDepthM - oldDepth; // Насколько изменилась глубина
                const positionShift = depthDifference / 2; // Сдвигать нужно на половину изменения

                // Сдвигаем в направлении ОТ стены К центру комнаты
                switch (wallId) {
                    case 'Back':  // Стена сзади (-Z), двигаем вперед (+Z)
                        ct.position.z += positionShift;
                        break;
                    case 'Front': // Стена спереди (+Z), двигаем назад (-Z)
                        ct.position.z -= positionShift;
                        break;
                    case 'Left':  // Стена слева (-X), двигаем вправо (+X)
                        ct.position.x += positionShift;
                        break;
                    case 'Right': // Стена справа (+X), двигаем влево (-X)
                        ct.position.x -= positionShift;
                        break;
                }
                console.log(`   - Shifted position by ${positionShift} along ${wallId === 'Back' || wallId === 'Front' ? 'Z' : 'X'} axis`);

                // 3. Обновляем текстуру
                updateTextureScale(ct);
            }
        }
    });

    // --- Обновляем все нижние шкафы на этой стене (только если глубина менялась) ---
    if (depthActuallyChanged) {
        cabinets.forEach(cab => {
            if (cab.type === 'lowerCabinet' && cab.wallId === wallId) {
                console.log(`Checking cabinet: type=${cab.type}, wallId=${cab.wallId}, targetWallId=${wallId}, UUID=${cab.mesh?.uuid}`);
                 // Пересчитываем отступ (он сам возьмет новую глубину через getCountertopDepthForWall)
                 cab.offsetFromParentWall = calculateLowerCabinetOffset(cab);

                 // Обновляем позицию шкафа
                 updateCabinetPosition(cab);
            }
        });
        console.log(`Depth update complete for wall ${wallId}.`);
    } else {
         console.log(`No actual depth change needed for wall ${wallId}.`);
    }
    // requestRenderIfNotRequested(); // Возможно, нужен вызов рендера
}

function createCountertopMaterial({ materialType, solidColor, textureType }) {
    if (textureType === 'compact-plate') {
        // Чёрные боковые, текстурированные верх и низ
        const blackMaterial = new THREE.MeshPhongMaterial({
            color: 0x000000,
            emissive: 0x000000 // ⬅ обязательно, чтобы работала подсветка
        });

        let topBottomMaterial;

        if (materialType === 'oak' || materialType === 'stone') {
            const texturePath = materialType === 'oak' ? 'textures/oak.jpg' : 'textures/stone.jpg';
            const texture = new THREE.TextureLoader().load(texturePath);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            topBottomMaterial = new THREE.MeshPhongMaterial({
                map: texture,
                emissive: 0x000000 // ⬅ добавлено для поддержки подсветки
            });
        } else if (materialType === 'solid') {
            const colorHex = parseInt(solidColor.replace('#', '0x'), 16);
            topBottomMaterial = new THREE.MeshPhongMaterial({
                color: colorHex,
                emissive: 0x000000 // ⬅ добавлено
            });
        } else {
            // fallback
            topBottomMaterial = new THREE.MeshPhongMaterial({
                color: 0x808080,
                emissive: 0x000000
            });
        }

        return [
            blackMaterial,        // 0: Right
            blackMaterial,        // 1: Left
            topBottomMaterial,    // 2: Top
            topBottomMaterial,    // 3: Bottom
            blackMaterial,        // 4: Front
            blackMaterial         // 5: Back
        ];
    }

    // --- Постформинг и кварц: один цвет/текстура на всё
    if (materialType === 'oak' || materialType === 'stone') {
        const texturePath = materialType === 'oak' ? 'textures/oak.jpg' : 'textures/stone.jpg';
        const texture = new THREE.TextureLoader().load(texturePath);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return new THREE.MeshPhongMaterial({
            map: texture,
            emissive: 0x000000
        });
    } else if (materialType === 'solid') {
        const colorHex = parseInt(solidColor.replace('#', '0x'), 16);
        return new THREE.MeshPhongMaterial({
            color: colorHex,
            emissive: 0x000000
        });
    } else {
        return new THREE.MeshPhongMaterial({
            color: 0x808080,
            emissive: 0x000000
        });
    }
}

// В script.js

// --- Вспомогательная функция для создания панелей (выносим из createDetailedCabinetGeometry) ---
/**
 * Создает меш панели с ребрами и пользовательскими данными.
 * @param {number} w - Ширина панели (размер по X).
 * @param {number} h - Высота панели (размер по Y).
 * @param {number} d - Глубина панели (размер по Z).
 * @param {THREE.Material} mat - Материал панели.
 * @param {string} orientationType - Тип ориентации толщины ('vertical', 'horizontal', 'frontal').
 * @param {string} name - Имя панели для отладки.
 * @returns {THREE.Mesh | null} Меш панели или null при ошибке.
 */
function createPanel(w, h, d, mat, orientationType, name = "panel") {
    try {
        // Проверка на нулевые или отрицательные размеры (добавлено)
        if (w <= 0 || h <= 0 || d <= 0) {
            console.warn(`Попытка создать панель "${name}" с нулевыми или отрицательными размерами: w=${w}, h=${h}, d=${d}. Панель не будет создана.`);
            return null;
        }
        const geometry = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geometry, mat.clone()); // Клонируем материал

        const edgesGeom = new THREE.EdgesGeometry(geometry);
        const edgesMat = new THREE.LineBasicMaterial({ color: 0x333333, linewidth: 1 });
        const edges = new THREE.LineSegments(edgesGeom, edgesMat);
        edges.raycast = () => {};
        mesh.add(edges);

        mesh.userData = {
             isCabinetPart: true,
             objectType: 'cabinetPart',
             orientationType: orientationType,
             cabinetUUID: null // UUID будет добавлен позже
        };
        mesh.name = name;
        return mesh;
    } catch (error) {
        console.error(`Ошибка при создании панели "${name}" (w=${w}, h=${h}, d=${d}, type=${orientationType}):`, error);
        return null;
    }
}


// В script.js

/**
 * Получает материал и толщину для фасада на основе выбранного набора.
 * @param {object} cabinetData - Данные шкафа.
 * @returns {{material: THREE.Material, thickness: number}} Объект с материалом и толщиной фасада в метрах.
 */
function getFacadeMaterialAndThickness(cabinetData) {
    const defaultThicknessMeters = 18 / 1000;
    const defaultMaterial = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, name: "DefaultFacadeWhite" });

    const facadeSetId = cabinetData.facadeSet;
    const textureDirection = cabinetData.textureDirection || 'vertical';

    if (!facadeSetId || !window.facadeSetsData || window.facadeSetsData.length === 0) {
        //console.warn(`Набор фасадов не выбран или данные не загружены для шкафа ${cabinetData.mesh?.uuid}. Используется дефолтный белый фасад.`);
        return { material: defaultMaterial, thickness: defaultThicknessMeters };
    }

    const setData = window.facadeSetsData.find(set => set.id === facadeSetId);
    if (!setData) {
        console.warn(`Набор фасадов с ID ${facadeSetId} не найден. Используется дефолтный белый фасад.`);
        return { material: defaultMaterial, thickness: defaultThicknessMeters };
    }

    const loadedFacadeData = window.facadeOptionsData || {};
    const materialInfo = loadedFacadeData[setData.materialType] || {};
    const useColor = materialInfo.useColorPicker || false;
    const thicknessMeters = (setData.thickness || materialInfo.defaultThickness || 18) / 1000;

    let facadeMaterial = defaultMaterial;

    try {
        if (useColor) {
            const colorValue = setData.color || '#ffffff';
            facadeMaterial = new THREE.MeshStandardMaterial({
                 color: colorValue,
                 name: `Facade_${setData.materialType}_${colorValue}`,
                 // --- Добавляем параметры для лучшего вида ---
                 roughness: 0.8, // Можно сделать настраиваемым по типу материала
                 metalness: 0.05, // Небольшой металлик для пластиков/краски
                 // -----------------------------------------
            });
            console.log(`[Фасад] Используется цвет: ${colorValue}`);

        } else if (setData.texture) {
            const selectedDecor = materialInfo.decors?.find(d => d.value === setData.texture);
            let texturePath = null;

            // --- ИЗМЕНЕНИЕ: Формируем путь к текстуре XL ---
            if (selectedDecor && selectedDecor.previewImage) {
                // Пример previewImage: "textures/previews/ЛДСП/H1180.jpg"
                const parts = selectedDecor.previewImage.split('/');
                const filenameWithExt = parts.pop(); // "H1180.jpg"
                const filenameParts = filenameWithExt.split('.'); // ["H1180", "jpg"]
                if (filenameParts.length >= 2) {
                    const baseName = filenameParts[0]; // "H1180"
                    const extension = filenameParts.pop(); // "jpg"
                    texturePath = `textures/xl/${baseName}_XL.${extension}`; // "textures/xl/H1180_XL.jpg"
                    //console.log(`[Фасад] Сформирован путь к XL текстуре: ${texturePath}`);
                } else {
                    console.warn(`Не удалось разобрать имя файла из previewImage: ${selectedDecor.previewImage}`);
                }
            } else if (selectedDecor) {
                 console.warn(`Декор ${setData.texture} найден, но у него нет previewImage для формирования пути XL текстуры.`);
            } else {
                 console.warn(`Декор ${setData.texture} не найден в данных для материала ${setData.materialType}.`);
            }
            // --- КОНЕЦ ИЗМЕНЕНИЯ ---

            if (texturePath) {
                //console.log(`[Фасад] Загрузка текстуры: ${texturePath}`);
                const textureLoader = new THREE.TextureLoader();
                const texture = textureLoader.load(
                    texturePath,
                    (tex) => {
                        //console.log(` - Текстура ${texturePath} загружена успешно.`);
                        tex.wrapS = THREE.RepeatWrapping;
                        tex.wrapT = THREE.RepeatWrapping;
                        // Трансформацию применим позже, когда известны точные размеры фасада
                        tex.needsUpdate = true;
                        requestRender();
                    },
                    undefined,
                    (err) => {
                        console.error(`Ошибка загрузки текстуры ${texturePath}:`, err);
                        facadeMaterial.color.set(selectedDecor?.displayColor || '#cccccc'); // Устанавливаем цвет, если текстура не загрузилась
                        facadeMaterial.map = null; // Убираем карту
                        facadeMaterial.needsUpdate = true;
                    }
                );
                facadeMaterial = new THREE.MeshStandardMaterial({  
                     map: texture,
                     color: new THREE.Color(0xBBBBBB),
                     name: `Facade_${setData.materialType}_${setData.texture}`,
                     // --- Добавляем параметры ---
                     roughness: 0.8, // Немного шероховатости для текстур
                     metalness: 0.15,
                     envMapIntensity: 0.3 // Фасады будут отражать окружение вполовину слабее
                     // --------------------------
                });
            } else {
                console.warn(`Путь к текстуре XL не был сформирован. Используется цвет ${selectedDecor?.displayColor || '#cccccc'}.`);
                facadeMaterial = new THREE.MeshStandardMaterial({
                     color: selectedDecor?.displayColor || '#cccccc',
                     name: `Facade_NoTexture_${setData.texture}`,
                      roughness: 0.8, metalness: 0.05
                });
            }
        } else {
             console.warn(`Для материала ${setData.materialType} не задан ни цвет, ни текстура в наборе ${facadeSetId}. Используется дефолтный белый.`);
             // facadeMaterial остается defaultMaterial
        }
    } catch (error) {
        console.error("Ошибка при создании материала фасада:", error);
        facadeMaterial = defaultMaterial;
    }

    // Добавляем проверку на случай, если материал все еще дефолтный
    if (!facadeMaterial.name || facadeMaterial.name === "DefaultFacadeWhite") {
       //console.log(`[Фасад] Финальный материал: DefaultFacadeWhite, Толщина: ${thicknessMeters * 1000} мм`);
    } else {
       //console.log(`[Фасад] Финальный материал: ${facadeMaterial.name}, Толщина: ${thicknessMeters * 1000} мм`);
    }
    return { material: facadeMaterial, thickness: thicknessMeters };
}

// --- НОВАЯ Вспомогательная функция для трансформации текстуры ---
/**
 * Применяет поворот и масштабирование к текстуре фасада.
 * @param {THREE.Texture} texture - Текстура для трансформации.
 * @param {string} direction - 'vertical' или 'horizontal'.
 * @param {number} facadeWidth - Ширина фасада в метрах.
 * @param {number} facadeHeight - Высота фасада в метрах.
 * @returns {THREE.Texture | null} Новая (клонированная и трансформированная) текстура или null.
 */
function applyTextureTransform(texture, direction, facadeWidth, facadeHeight) {
    if (!texture) return null; // Выходим, если текстуры нет

    // --- КЛОНИРУЕМ ТЕКСТУРУ ---
    const clonedTexture  = texture.clone();
    // ВАЖНО: Говорим Three.js, что это новый объект текстуры,
    // и его нужно будет заново загрузить в GPU при необходимости.
    clonedTexture .needsUpdate = true;
    // -------------------------

    const textureImageWidthMeters = 1.3; // Ширина исходного изображения текстуры (условно)
    const textureImageHeightMeters = 2.8; // Высота исходного изображения текстуры (условно)

    clonedTexture.center.set(0.5, 0.5); // Центр вращения/масштабирования
    clonedTexture.wrapS = THREE.RepeatWrapping; // Устанавливаем и здесь на всякий случай
    clonedTexture.wrapT = THREE.RepeatWrapping;

    if (direction === 'horizontal') {
        clonedTexture.rotation = -Math.PI / 2; // Поворот на -90 градусов
        // Масштаб: по X фасада -> высота текстуры, по Y фасада -> ширина текстуры
        clonedTexture.repeat.set(
            facadeHeight / textureImageWidthMeters,
            facadeWidth / textureImageHeightMeters
        );
         console.log(`[Текстура Горизонтально] Rot: ${texture.rotation}, Repeat: (${texture.repeat.x.toFixed(2)}, ${texture.repeat.y.toFixed(2)})`);
    } else { // vertical (по умолчанию)
        clonedTexture.rotation = 0; // Без поворота
        // Масштаб: по X фасада -> ширина текстуры, по Y фасада -> высота текстуры
        clonedTexture.repeat.set(
            facadeWidth / textureImageWidthMeters,
            facadeHeight / textureImageHeightMeters
        );
         console.log(`[Текстура Вертикально] Rot: ${texture.rotation}, Repeat: (${texture.repeat.x.toFixed(2)}, ${texture.repeat.y.toFixed(2)})`);
    }
    // WrapS/WrapT должны наследоваться при клонировании, но можно установить явно:
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    return clonedTexture; // Возвращаем НОВУЮ текстуру
}
const supportedConfigs = ['swing', 'drawers']; // Поддерживаемые конфиги

// В script.js

// Список поддерживаемых конфигураций для основной функции детализации
const generalDetailingSupportedConfigs = ['swing', 'drawers', 'falsePanel', 'oven', 'tallOvenMicro', 'fridge', 'dishwasher']; // Можно вынести как константу модуля

/**
 * Функция-диспетчер для получения детализированного представления шкафа.
 * Вызывает соответствующую функцию генерации геометрии в зависимости от типа и конфигурации шкафа.
 * @param {object} cabinetData - Объект данных шкафа.
 * @returns {THREE.Group | null} Группа с детализированной моделью или null, если детализация не поддерживается/ошибка.
 */
function getDetailedCabinetRepresentation(cabinetData) {
    if (!cabinetData) {
        console.error("[Dispatcher] cabinetData не предоставлен.");
        return null;
    }

    console.log(`[Dispatcher] Попытка детализации для: type=${cabinetData.type}, cabinetType=${cabinetData.cabinetType}, config=${cabinetData.cabinetConfig}`);

    // --- Шаг 1: Проверка, поддерживается ли вообще детализация для данной конфигурации ---
    // Мы проверяем cabinetConfig, так как он обычно более специфичен.
    // Для 'falsePanel' cabinetType может быть 'straight', но cabinetConfig будет 'falsePanel'.
    if (!generalDetailingSupportedConfigs.includes(cabinetData.cabinetConfig)) {
        console.warn(`[Dispatcher] Детализация для конфигурации "${cabinetData.cabinetConfig}" (тип шкафа: ${cabinetData.type}, тип конструкции: ${cabinetData.cabinetType}) пока не поддерживается.`);
        // alert можно убрать, так как это может вызываться при глобальных обновлениях
        // alert(`Детализация для конфигурации "${cabinetData.cabinetConfig}" еще не реализована.`);
        return null; // Детализация невозможна
    }

    // --- Шаг 2: Вызов специфической функции детализации на основе конфигурации/типа ---
    if (cabinetData.cabinetConfig === 'falsePanel') {
        console.log(`[Dispatcher] -> Вызов createDetailedFalsePanelGeometry для 'falsePanel'`);
        return createDetailedFalsePanelGeometry(cabinetData);
    } else if (
        (cabinetData.type === 'lowerCabinet' || cabinetData.type === 'freestandingCabinet') && // Для нижних и отдельно стоящих
        cabinetData.cabinetType === 'straight' &&
        (cabinetData.cabinetConfig === 'swing' || cabinetData.cabinetConfig === 'drawers') // Явно проверяем конфиги для createDetailedCabinetGeometry
    ) {
        console.log(`[Dispatcher] -> Вызов createDetailedCabinetGeometry для '${cabinetData.cabinetConfig}'`);
        return createDetailedCabinetGeometry(cabinetData);
    } else if (
        (cabinetData.type === 'lowerCabinet' || cabinetData.type === 'freestandingCabinet') && // Условие для типа шкафа
        cabinetData.cabinetType === 'straight' && // Условие для типа конструкции
        cabinetData.cabinetConfig === 'oven' // Условие для конфигурации
    ) {
        console.log(`[Dispatcher] -> Вызов createDetailedOvenCabinetGeometry для '${cabinetData.cabinetConfig}'`);
        return createDetailedOvenCabinetGeometry(cabinetData); // <--- ВЫЗОВ НОВОЙ ФУНКЦИИ
    } else if (
        (cabinetData.type === 'lowerCabinet') &&
        cabinetData.cabinetType === 'straight' &&
        cabinetData.cabinetConfig === 'tallOvenMicro'
    ) {
        console.log(`[Dispatcher] -> Вызов createDetailedTallOvenMicroGeometry для '${cabinetData.cabinetConfig}'`);
        return createDetailedTallOvenMicroGeometry(cabinetData); // <--- ВЫЗОВ НОВОЙ ФУНКЦИИ
    } else if ( // <--- НОВЫЙ БЛОК ДЛЯ FRIDGE ---
        (cabinetData.type === 'lowerCabinet') &&
        cabinetData.cabinetType === 'straight' &&
        cabinetData.cabinetConfig === 'fridge'
    ) {
        console.log(`[Dispatcher] -> Вызов createDetailedFridgeCabinetGeometry для '${cabinetData.cabinetConfig}'`);
        return createDetailedFridgeCabinetGeometry(cabinetData); // <--- ВЫЗОВ НОВОЙ ФУНКЦИИ
    } else if ( // <--- НОВЫЙ БЛОК ДЛЯ FRIDGE ---
        (cabinetData.type === 'lowerCabinet') &&
        cabinetData.cabinetType === 'straight' &&
        cabinetData.cabinetConfig === 'dishwasher'
    ) {
        console.log(`[Dispatcher] -> Вызов createDetailedFridgeCabinetGeometry для '${cabinetData.cabinetConfig}'`);
        return createDetailedDishwasherGeometry(cabinetData); // <--- ВЫЗОВ НОВОЙ ФУНКЦИИ
    }
    // --- Добавьте сюда 'else if' для других типов и их функций детализации ---
    // Например, если у вас будет отдельная функция для верхних шкафов:
    // else if (cabinetData.type === 'upperCabinet' && 
    //            (cabinetData.cabinetConfig === 'swingUpper' || cabinetData.cabinetConfig === 'liftUpper') ) {
    //     console.log(`[Dispatcher] -> Вызов createDetailedUpperCabinetGeometry для '${cabinetData.cabinetConfig}'`);
    //     return createDetailedUpperCabinetGeometry(cabinetData); // Предполагая, что такая функция есть
    // }
    else {
        // Эта ветка не должна достигаться, если generalDetailingSupportedConfigs актуален
        // и все поддерживаемые конфиги имеют свои обработчики выше.
        // Но на всякий случай оставим.
        console.warn(`[Dispatcher] Конфигурация "${cabinetData.cabinetConfig}" есть в supportedConfigs, но для нее нет явного вызова функции детализации.`);
        return null;
    }
}

// --- Функция создания детализированной геометрии (Обновленная) ---
/**
 * Создает THREE.Group представляющую детализированную модель шкафа.
 * @param {object} cabinetData - Объект шкафа из массива 'cabinets'.
 * @returns {THREE.Group | null} Группа со всеми частями шкафа или null при ошибке.
 */
function createDetailedCabinetGeometry(cabinetData) {
    // Проверяем, применима ли детализация
    //const supportedConfigs = ['swing', 'drawers']; // Поддерживаемые конфиги
    //if (cabinetData.cabinetType !== 'straight' || !supportedConfigs.includes(cabinetData.cabinetConfig)) {
    //    console.warn(`Детализация пока не поддерживается для типа "${cabinetData.cabinetType}" / конфигурации "${cabinetData.cabinetConfig}"`);
    //    alert(`Детализация пока доступна только для прямых шкафов с конфигурацией: ${supportedConfigs.join(', ')}.`);
    //    return null;
    //}
    if (!cabinetData.mesh || !cabinetData.mesh.uuid) {
         console.error("createDetailedCabinetGeometry: Отсутствует mesh или UUID у cabinetData.");
         return null;
    }

    const group = new THREE.Group();
    const panelThickness = getPanelThickness();
    const backPanelThickness = 3 / 1000;

    const width = cabinetData.width;
    const height = cabinetData.height;
    const depth = cabinetData.depth;
    const cabinetUUID = cabinetData.mesh.uuid; // Получаем UUID основного объекта
    const handleType = kitchenGlobalParams.handleType || 'standard';
    // --- Получаем количество фасадов (важно для боковин с Гола) ---
    const facadeCount = parseInt(cabinetData.facadeCount) || 1; // По умолчанию 1, если не задано
    const config = cabinetData.cabinetConfig;

    const boxAvailableHeightMeters = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;
    const minGolaHeightMeters = (kitchenGlobalParams.golaMinHeightMm || 30) / 1000;
    const facadeGapMeters = cabinetData.facadeGap || (3 / 1000);
    const actualGolaHeightMeters = calculateActualGolaHeight(
        minGolaHeightMeters * 1000, facadeGapMeters * 1000,
        boxAvailableHeightMeters * 1000 
    ) / 1000;
    //console.log(`[Гола] Расчетная актуальная высота Гола: ${actualGolaHeightMeters.toFixed(3)} м`);

    // --- === Новые Константы для Фальш-панелей === ---
    const flatFalsePanelWidthMm = 80;
    const wideFalsePanelWidthMm = 60;
    const flatFalsePanelFrontOffsetMm = 2; // Отступ плоской от переда
    const wideFalsePanelHolderWidthMm = 60; // Ширина держателя = ширина широкой панели? Уточнить. Пока так.

    const flatFalsePanelWidth = flatFalsePanelWidthMm / 1000;
    const wideFalsePanelWidth = wideFalsePanelWidthMm / 1000;
    const flatFalsePanelFrontOffset = flatFalsePanelFrontOffsetMm / 1000;
    const wideFalsePanelHolderWidth = wideFalsePanelHolderWidthMm / 1000;
    // --- ========================================= ---

    // --- Материалы ---
    const cabinetMaterial = new THREE.MeshStandardMaterial({
        color: cabinetData.initialColor, // Цвет корпуса
        roughness: 0.8, metalness: 0.1
    });
    const backPanelMaterial = new THREE.MeshStandardMaterial({
        color: 0xf0f0f0, // Светло-серый
        roughness: 0.9, metalness: 0.0
    });
    const golaMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xAAAAAA, metalness: 0.8, roughness: 0.4 }); // Алюминий
    
    // --- === ПОЛУЧАЕМ ДАННЫЕ ДЛЯ ФАСАДА === ---
    // Эта функция вернет объект { material: THREE.Material, thickness: number }
    const facadeData = getFacadeMaterialAndThickness(cabinetData);
    const facadeMaterialToClone = facadeData.material; // Материал, который будем клонировать для каждого фасада
    const textureDirection = cabinetData.textureDirection || 'vertical';
    // -----------------------------------------

    // --- Расчет и создание частей (согласно вашим последним формулам) ---
    const stretcherDropMeters = cabinetData.stretcherDrop || 0;

    // --- НАЧАЛО БЛОКА 1 и 2: Боковины (На основе ВАШЕГО кода) ---
    //console.log(`[createDetailedCabinetGeometry] Создание боковин. Ручка: ${handleType}, Фасадов: ${facadeCount}, Конфиг: ${config}`);
    // Размеры панели боковины (ваши расчеты)
    const sidePanelHeight = height - panelThickness;
    const sidePanelDepth = depth;

    // Определяем, нужен ли двойной вырез Гола
    const useDoubleGolaCutoutShape = (handleType === 'gola-profile' && config === 'drawers' && facadeCount > 1);

    // 1. Создаем КОНТУР боковины (Shape в плоскости XY)
    const sideShape = new THREE.Shape();
    sideShape.moveTo(0, 0); // Зад-Низ

    if (handleType === 'gola-profile') {
        // Параметры выреза
        const cutoutHeight = 58 / 1000;
        const cutoutDepth = 27 / 1000;
        const frontPointX = sidePanelDepth; // Передняя точка (по X шейпа = Z мировая)
        const topPointY = sidePanelHeight; // Верхняя точка (по Y шейпа = Y мировая)
        const cutout1_BottomY = topPointY - cutoutHeight;
        const cutout1_BackX = frontPointX - cutoutDepth;

        if (useDoubleGolaCutoutShape) {
            const heightFirctGolaCut = (height - actualGolaHeightMeters * 2) / 2 - 58 / 1000 + actualGolaHeightMeters - panelThickness;
            sideShape.lineTo(frontPointX, 0);
            sideShape.lineTo(frontPointX, heightFirctGolaCut);
            sideShape.lineTo(cutout1_BackX, heightFirctGolaCut);
            sideShape.lineTo(cutout1_BackX, heightFirctGolaCut + 70 / 1000);
            sideShape.lineTo(frontPointX, heightFirctGolaCut + 70 / 1000);
            sideShape.lineTo(frontPointX, cutout1_BottomY);
            sideShape.lineTo(cutout1_BackX, cutout1_BottomY);
            sideShape.lineTo(cutout1_BackX, topPointY);
            sideShape.lineTo(0, topPointY);
        } else {
            // Форма с одним вырезом
            console.log(" - Формирование контура боковины С ОДНИМ вырезом Гола");
            sideShape.lineTo(frontPointX, 0);
            sideShape.lineTo(frontPointX, cutout1_BottomY);
            sideShape.lineTo(cutout1_BackX, cutout1_BottomY);
            sideShape.lineTo(cutout1_BackX, topPointY);
            sideShape.lineTo(0, topPointY);
        }
    } else {
        // Обычный прямоугольный контур
        console.log(" - Формирование простого прямоугольного контура боковины");
        sideShape.lineTo(sidePanelDepth, 0);
        sideShape.lineTo(sidePanelDepth, sidePanelHeight);
        sideShape.lineTo(0, sidePanelHeight);
    }
    sideShape.closePath();

    // 2. Настройки экструзии (БЕЗ ФАСКИ)
    const sideExtrudeSettings = {
        steps: 1,
        depth: panelThickness, // Глубина выдавливания = толщина панели
        bevelEnabled: false
    };

    // 3. Создаем геометрию боковины
    let sideGeometry = null;
    try {
        sideGeometry = new THREE.ExtrudeGeometry(sideShape, sideExtrudeSettings);
        // Центрируем геометрию по оси ВЫДАВЛИВАНИЯ (локальная Z)
        sideGeometry.translate(0, 0, -panelThickness / 2);
    } catch (error) { console.error("Ошибка создания геометрии боковины:", error); }

    // 4. Создаем и позиционируем МЕШИ боковин
    if (sideGeometry) {
        // --- Левая боковина (Код позиционирования и вращения ИЗ ВАШЕГО ПРИМЕРА) ---
        const leftSide = new THREE.Mesh(sideGeometry, cabinetMaterial.clone());
        leftSide.name = "leftSide_extruded";
        leftSide.userData = { isCabinetPart: true, objectType: 'cabinetPart', orientationType: 'vertical', cabinetUUID: cabinetUUID };

        // Вращаем геометрию
        leftSide.rotation.y = -Math.PI / 2; // Поворот на -90 градусов вокруг Y

        // Рассчитываем позицию ЦЕНТРА (ВАШИ ФОРМУЛЫ)
        const leftSideCenterX = -width / 2 + panelThickness / 2;
        const leftSideCenterY = -height / 2 + panelThickness; // <- ВАШ РАСЧЕТ Y
        const leftSideCenterZ = -depth / 2;                  // <- ВАШ РАСЧЕТ Z
        leftSide.position.set(leftSideCenterX, leftSideCenterY, leftSideCenterZ);

        group.add(leftSide);

        // --- Правая боковина (Код позиционирования и вращения ИЗ ВАШЕГО ПРИМЕРА) ---
        // Клонируем геометрию, чтобы не влиять на левую
        const rightSide = new THREE.Mesh(sideGeometry.clone(), cabinetMaterial.clone());
        rightSide.name = "rightSide_extruded";
        rightSide.userData = { isCabinetPart: true, objectType: 'cabinetPart', orientationType: 'vertical', cabinetUUID: cabinetUUID };

        // Вращаем геометрию
        // !!! В ВАШЕМ ПРИМЕРЕ ДЛЯ ПРАВОЙ БОКОВИНЫ ТОЖЕ БЫЛО -Math.PI / 2 !!!
        // ОСТАВЛЯЮ КАК У ВАС, НО ЭТО МОЖЕТ БЫТЬ ОШИБКОЙ. ПРОВЕРЬТЕ!
        // Если правая должна быть зеркальной, вращение должно быть +Math.PI / 2
        rightSide.rotation.y = -Math.PI / 2; // <- ВАШЕ ЗНАЧЕНИЕ ВРАЩЕНИЯ

        // Рассчитываем позицию ЦЕНТРА (ВАШИ ФОРМУЛЫ)
        const rightSideCenterX = width / 2 - panelThickness / 2;
        // Центр Y и Z такие же, как у левой (по вашему коду Z=0 для правой?)
        // Использую ваши значения Y и Z для правой из вашего примера:
        const rightSideCenterY = leftSideCenterY;   // <- ВАШ РАСЧЕТ Y (как у левой)
        const rightSideCenterZ = leftSideCenterZ;   // <- ВАШ РАСЧЕТ Z

        rightSide.position.set(rightSideCenterX, rightSideCenterY, rightSideCenterZ);

        group.add(rightSide);

    } else {
        console.error("Не удалось создать геометрию боковин!");
    }
    // --- КОНЕЦ БЛОКА 1 и 2 ---

    // 3) Дно (Толщина по Y)
    // Ширина дна = общая ширина шкафа
    const bottomWidth = width;
    const bottom = createPanel(bottomWidth, panelThickness, depth, cabinetMaterial, 'horizontal', "bottom");
    if (bottom) {
        // Центр Y дна = нижняя точка шкафа + половина толщины дна
        bottom.position.set(0, -height / 2 + panelThickness / 2, 0);
        bottom.userData.cabinetUUID = cabinetUUID;
        group.add(bottom);
    }

    // --- Блок 4: Задняя стенка и Перемычка (Новая логика) ---
    const rearPanelType = cabinetData.rearPanel || 'yes'; // Значение по умолчанию 'yes'
    //const stretcherDropMeters = cabinetData.stretcherDrop || 0;
    const backPanelInset = 0; // Смещение ЗС внутрь
    const backPanelSideOffset = 2; //добавим отступ, чтобы не хардкодить.
    let backPanel = null;
    let middleStretcher = null; // Переменная для перемычки


    if (rearPanelType === 'yes') {
        // --- 1.1: Вариант "Да" (как было, но с испр. расчетом высоты) ---
        // Высота ЗС = общая высота - толщина дна - толщина гориз. царги (или высота верт.) - опуск - допуски
         
        const topStretcherHeight = (cabinetData.rearStretcher === 'vertical') ? (60 / 1000) : panelThickness;
        const backPanelHeight = height - (backPanelSideOffset * 2 / 1000) - stretcherDropMeters; // Высота ЗС
        const backPanelWidth = width - (backPanelSideOffset * 2 / 1000); // Ширина ЗС
        
        backPanel = createPanel(backPanelWidth, backPanelHeight, backPanelThickness, backPanelMaterial, 'frontal', "backPanelFull");
        if (backPanel) {
            // Центр Y ЗС = низ шкафа + толщина дна + допуск снизу + половина высоты ЗС
            const backPanelCenterY = -height / 2 + (backPanelSideOffset / 1000) + backPanelHeight / 2;
            const backPanelCenterX = 0; // Центрируем по X
            const backPanelCenterZ = -depth / 2 + backPanelInset - backPanelThickness / 2; // Передняя грань на -depth/2
            backPanel.position.set(backPanelCenterX, backPanelCenterY, backPanelCenterZ);
            backPanel.userData.cabinetUUID = cabinetUUID;
            group.add(backPanel);
        }

    } else if (rearPanelType === 'no') {
        // --- 1.2: Вариант "Нет" ---

    } else if (rearPanelType === 'halfTop' || rearPanelType === 'halfBottom') {
        // --- 1.3 & 1.4: Варианты "Половина сверху" или "Половина снизу" ---

        // --- 1.3.1 / 1.4.1: Создаем Перемычку ---
        const stretcherWidth = width - 2 * panelThickness; // Ширина между боковинами
        const stretcherDepth = 80 / 1000; // Глубина как у горизонтальной задней царги
        middleStretcher = createPanel(stretcherWidth, panelThickness, stretcherDepth, cabinetMaterial, 'horizontal', "middleStretcher");

        if (middleStretcher) {
            // Центр Y перемычки = центр высоты шкафа (округленный до мм)
            // Сначала считаем в метрах, потом округляем до мм, потом обратно в метры
            const middleYExact = 0; // Центр шкафа по Y = 0 в локальных координатах
            const middleYMm = Math.round(middleYExact * 1000);
            const middleYRoundedMeters = middleYMm / 1000;

            // Центр Z перемычки = как у задней царги
            const middleStretcherCenterZ = -depth / 2 + stretcherDepth / 2;
            middleStretcher.position.set(0, middleYRoundedMeters, middleStretcherCenterZ);
            middleStretcher.userData.cabinetUUID = cabinetUUID;
            group.add(middleStretcher);
            console.log(` - Создана средняя перемычка (Y: ${middleYRoundedMeters})`);

            // --- 1.3.2 / 1.4.2: Создаем Половину Задней Стенки ---
            const backPanelWidthHalf = width - (backPanelSideOffset * 2 / 1000); // Ширина та же
            let backPanelHeightHalf = 0;
            let backPanelCenterYHalf = 0;

            // Y-координата низа перемычки
            const middleStretcherBottomY = middleStretcher.position.y - panelThickness / 2;
            // Y-координата верха перемычки
            const middleStretcherTopY = middleStretcher.position.y + panelThickness / 2;
            // Y-координата верха шкафа (внутреннего)
            const cabinetInnerTopY = height / 2 - panelThickness - stretcherDropMeters; // Учитываем дно и опуск
            const cabinetOutsideTopY = height / 2 - stretcherDropMeters; //наружный габарит
             // Y-координата низа шкафа (внутреннего)
            const cabinetInnerBottomY = -height / 2 + panelThickness; // Учитываем дно
            const cabinetOutsideBottomY = -height / 2; // наружный габарит

            if (rearPanelType === 'halfTop') {
                // Высота ЗС = Верх шкафа - Низ перемычки - допуски
                 backPanelHeightHalf = cabinetOutsideTopY - middleStretcherBottomY - (backPanelSideOffset * 2 / 1000);
                 // Центр Y ЗС = Низ перемычки + допуск снизу (2мм) + половина высоты ЗС
                 backPanelCenterYHalf = middleStretcherBottomY + (backPanelSideOffset / 1000) + backPanelHeightHalf / 2;
                 //console.log(` - Расчет для halfTop: Высота ЗС=${backPanelHeightHalf}, Центр Y ЗС=${backPanelCenterYHalf}`);

            } else { // halfBottom
                 // Высота ЗС = Верх перемычки - Низ шкафа - допуски
                 backPanelHeightHalf = middleStretcherTopY - cabinetOutsideBottomY - (backPanelSideOffset * 2 / 1000);
                 // Центр Y ЗС = Низ шкафа + допуск снизу (2мм) + половина высоты ЗС
                 backPanelCenterYHalf = cabinetOutsideBottomY + (backPanelSideOffset / 1000) + backPanelHeightHalf / 2;
            }

            // Создаем панель, только если высота положительная
             if (backPanelHeightHalf > 0) {
                 backPanel = createPanel(backPanelWidthHalf, backPanelHeightHalf, backPanelThickness, backPanelMaterial, 'frontal', `backPanel${rearPanelType}`);
                 if (backPanel) {
                     const backPanelCenterXHalf = 0; // Центрируем по X
                     const backPanelCenterZHalf = -depth / 2 + backPanelInset - backPanelThickness / 2; // Позиция Z та же
                     backPanel.position.set(backPanelCenterXHalf, backPanelCenterYHalf, backPanelCenterZHalf);
                     backPanel.userData.cabinetUUID = cabinetUUID;
                     group.add(backPanel);
                 }
             } else {
                  console.warn(` - Невозможно создать заднюю стенку ${rearPanelType}: расчетная высота <= 0 (${backPanelHeightHalf})`);
             }
        } else {
            console.error(" - Не удалось создать среднюю перемычку, задняя стенка не будет создана.");
        }
    }
    // --- Конец Блока 4 ---

     // 5) Передняя царга
     const frontStretcherType = cabinetData.frontStretcher || 'none';
     let frontStretcher = null;
     if (frontStretcherType !== 'none') {
         const stretcherWidth = width - 2 * panelThickness;
         let frontStretcherY;
         let frontStretcherCenterZ; // <--- Объявляем переменную для Z
 
         // --- НАЧАЛО ИЗМЕНЕНИЯ: Учет типа ручек для Z-позиции ---
         const handleType = kitchenGlobalParams.handleType || 'standard';
         const golaProfileOffsetZ = (handleType === 'gola-profile') ? -(27 / 1000) : 0; // Смещение назад для Gola
         //console.log(`[createDetailedCabinetGeometry] Тип ручек: ${handleType}, Смещение царги Z: ${golaProfileOffsetZ}`);
         // --- КОНЕЦ ИЗМЕНЕНИЯ ---
 
         if (frontStretcherType === 'horizontal') { // Толщина по Y
             const stretcherDepth = 80 / 1000;
             frontStretcher = createPanel(stretcherWidth, panelThickness, stretcherDepth, cabinetMaterial, 'horizontal', "frontStretcherH");
             if (frontStretcher) {
                 frontStretcherY = height / 2 - panelThickness / 2 - stretcherDropMeters;
                 // Рассчитываем Z с учетом смещения Gola
                 frontStretcherCenterZ = depth / 2 - stretcherDepth / 2 + golaProfileOffsetZ;
                 frontStretcher.position.set(0, frontStretcherY, frontStretcherCenterZ);
             }
         } else { // vertical (Толщина по Z)
             const stretcherHeight = 60 / 1000;
             frontStretcher = createPanel(stretcherWidth, stretcherHeight, panelThickness, cabinetMaterial, 'frontal', "frontStretcherV");
             if (frontStretcher) {
                 frontStretcherY = height / 2 - stretcherHeight / 2 - stretcherDropMeters;
                 // Рассчитываем Z с учетом смещения Gola
                 frontStretcherCenterZ = depth / 2 - panelThickness / 2 + golaProfileOffsetZ;
                 frontStretcher.position.set(0, frontStretcherY, frontStretcherCenterZ);
             }
         }
         if (frontStretcher) {
             frontStretcher.userData.cabinetUUID = cabinetUUID;
             group.add(frontStretcher);
         }
     }
     // --- Конец Блока 5 ---

     // 6) Задняя царга
     const rearStretcherType = cabinetData.rearStretcher || 'none'; // Значение по умолчанию 'none'
     let rearStretcher = null;
     if (rearStretcherType !== 'none') {
         const stretcherWidth = width - 2 * panelThickness;
         let rearStretcherY;
         if (rearStretcherType === 'horizontal') { // Толщина по Y
             const stretcherDepth = 80 / 1000;
             rearStretcher = createPanel(stretcherWidth, panelThickness, stretcherDepth, cabinetMaterial, 'horizontal', "rearStretcherH");
             if (rearStretcher) {
                 // Центр Y = верхняя точка шкафа - половина толщины царги - опуск
                 rearStretcherY = height / 2 - panelThickness / 2 - stretcherDropMeters;
                 // Центр Z = задняя точка шкафа + половина глубины царги
                 const rearStretcherCenterZ = -depth / 2 + stretcherDepth / 2;
                 rearStretcher.position.set(0, rearStretcherY, rearStretcherCenterZ);
             }
         } else { // vertical (Толщина по Z)
             const stretcherHeight = 60 / 1000;
             rearStretcher = createPanel(stretcherWidth, stretcherHeight, panelThickness, cabinetMaterial, 'frontal', "rearStretcherV");
             if (rearStretcher) {
                 // Центр Y = верхняя точка шкафа - половина высоты царги - опуск
                 rearStretcherY = height / 2 - stretcherHeight / 2 - stretcherDropMeters;
                 // Центр Z = задняя точка шкафа + половина толщины царги (panelThickness)
                 const rearStretcherCenterZ = -depth / 2 + panelThickness / 2;
                 rearStretcher.position.set(0, rearStretcherY, rearStretcherCenterZ);
             }
         }
         if (rearStretcher) {
             rearStretcher.userData.cabinetUUID = cabinetUUID;
             group.add(rearStretcher);
         }
     }
        // --- БЛОК 7: Гола-профиль ---
        if (handleType === 'gola-profile') {
            const golaProfileLengthM = width;
            const golaProfileMesh1 = createGolaProfileMesh(golaProfileLengthM, golaMaterial, `golaProfile_Top`, cabinetUUID);
            if (golaProfileMesh1) {
                golaProfileMesh1.rotation.y = Math.PI / 2;
                const golaTopCenterY = height / 2 - 58 / 1000;
                const golaTopCenterX = 0;
                const golaTopCenterZ = depth / 2; // Задняя точка профиля в 27мм от переда
                golaProfileMesh1.position.set(golaTopCenterX, golaTopCenterY, golaTopCenterZ);
                group.add(golaProfileMesh1);
                // --- Второй Гола-профиль (для drawers с facadeCount > 1) ---
                if (config === 'drawers' && facadeCount > 1) {
                    const golaProfileMesh2 = createGolaProfileMesh(golaProfileLengthM, golaMaterial, `golaProfile_Middle`, cabinetUUID);
                    golaProfileMesh2.rotation.y = Math.PI / 2;   
                    // Высота нижнего фасада (если 2 или 3 фасада)
                    let bottomFacadeHeight = 0;
                    if (facadeCount === 2 || facadeCount === 3) {
                        bottomFacadeHeight = (height - 2 * actualGolaHeightMeters) / 2; 
                    }
                    // Y-центр второго профиля: Низ шкафа + Высота нижнего фасада + Половина высоты Гола
                    const golaMidCenterY = -height / 2 + bottomFacadeHeight - 58 / 1000 + actualGolaHeightMeters;
                    golaProfileMesh2.position.set(golaTopCenterX, golaMidCenterY, golaTopCenterZ);
                    group.add(golaProfileMesh2);
                }
            }
        }
        // --- КОНЕЦ БЛОКА 7 ---
        
        const { material: facadeMaterial, thickness: facadeThicknessMeters } = getFacadeMaterialAndThickness(cabinetData);
        const tb9HandleHeightMeters = 30 / 1000;
    
        // --- БЛОК 8: Фасады ---
        //console.log(`[Фасады] Конфиг: ${config}, Тип ручки: ${handleType}, Кол-во фасадов: ${facadeCount}`);
    
        if (config === 'swing') {
            const doorType = cabinetData.doorType || 'double';
            //console.log(`[Фасады SWING] Тип двери: ${doorType}`);
    
            if (doorType !== 'none') {
                let facadeHeight = 0;
                let facadeCenterYOffset = 0;
    
                if (handleType === 'aluminum-tv9') {
                    facadeHeight = height - facadeGapMeters - tb9HandleHeightMeters;
                    facadeCenterYOffset = -(facadeGapMeters + tb9HandleHeightMeters) / 2;
                } else if (handleType === 'gola-profile') {
                    // actualGolaHeightMeters должен быть рассчитан в Блоке 7 (Гола-профиль)
                    facadeHeight = height - actualGolaHeightMeters; // <--- Используем actualGolaHeightMeters
                    facadeCenterYOffset = -(actualGolaHeightMeters) / 2; // <--- Используем actualGolaHeightMeters
                } else { // standard
                    facadeHeight = height - facadeGapMeters;
                    facadeCenterYOffset = -facadeGapMeters / 2;
                }
    
                if (facadeHeight <= 0) {
                     console.error(`Swing Facade Height <= 0: ${facadeHeight.toFixed(3)}`);
                     facadeHeight = 0.1;
                }
    
                let facadesToCreate = [];
                if (doorType === 'left' || doorType === 'right') {
                    const facadeWidth = width - facadeGapMeters; // Вы писали, что зазор отнимаем
                    facadesToCreate.push({ width: facadeWidth, xOffset: 0, isTB9Handle: (handleType === 'aluminum-tv9') });
                } else if (doorType === 'double') {
                    const facadeWidth = (width - facadeGapMeters * 2) / 2; // Вы писали, что ДВА зазора
                    const xOffset = facadeWidth / 2 + facadeGapMeters / 2;
                    facadesToCreate.push({ width: facadeWidth, xOffset: -xOffset, isTB9Handle: (handleType === 'aluminum-tv9') });
                    facadesToCreate.push({ width: facadeWidth, xOffset: xOffset,  isTB9Handle: (handleType === 'aluminum-tv9') });
                }
    
                facadesToCreate.forEach((facadeInfo, index) => {
                    // --- ИЗМЕНЕНИЕ: Передаем материал для клонирования в createPanel ---
                    const facadeMesh = createPanel(
                        facadeInfo.width, facadeHeight, facadeThicknessMeters,
                        facadeMaterialToClone, // <--- Передаем материал, полученный из getFacadeMaterialAndThickness
                        'frontal', `facade_swing_${index}`
                    );
                    // --- КОНЕЦ ИЗМЕНЕНИЯ ---
                    if (facadeMesh) {
                        const facadeCenterZ = depth / 2 + facadeThicknessMeters / 2;
                        facadeMesh.position.set(facadeInfo.xOffset, facadeCenterYOffset, facadeCenterZ);
                        facadeMesh.userData.cabinetUUID = cabinetUUID;
                         // --- Работаем с текстурой КОНКРЕТНОГО меша ---
                        const actualFacadeMaterial = facadeMesh.material; // Получаем СКЛОНИРОВАННЫЙ материал
                        if (facadeMaterial.map?.isTexture) {
                            const originalTexture = actualFacadeMaterial.map; // Берем исходную текстуру
                            // Создаем НОВУЮ трансформированную текстуру
                            const transformedTexture = applyTextureTransform(
                                actualFacadeMaterial.map,
                                textureDirection,
                                facadeInfo.width, // или drawerFacadeWidth
                                facadeHeight      // или fData.height
                            );
                            // Назначаем НОВУЮ текстуру материалу этого меша
                            actualFacadeMaterial.map = transformedTexture;
                            actualFacadeMaterial.needsUpdate = true; // Обновляем материал
                        }
                        group.add(facadeMesh);
    
                        if (facadeInfo.isTB9Handle) {
                            // ... (Ваш код создания и позиционирования ручки TB9 для распашного фасада) ...
                            // Важно: facadeTopY и facadeCenterX для ручки должны использовать
                            // facadeCenterYOffset и facadeInfo.xOffset соответственно.
                            const handleWidthMm = 19; // Ширина профиля ручки
                            const handleHeightMm = 30; // Высота профиля ручки = 30
                            const handleLengthMeters = facadeInfo.width; // Длина ручки = ширина фасада

                            // Создаем Shape ручки (простой прямоугольник)
                            const handleShape = new THREE.Shape();
                            handleShape.moveTo(0, 0);
                            handleShape.lineTo(handleWidthMm, 0);
                            handleShape.lineTo(handleWidthMm, handleHeightMm);
                            handleShape.lineTo(handleWidthMm - 1.5, handleHeightMm);
                            handleShape.lineTo(handleWidthMm - 1.5, 1);
                            handleShape.lineTo(0, 1);
                            handleShape.closePath();
                            const handleExtrudeSettings = {
                                steps: 1,
                                depth: handleLengthMeters * 1000, // Глубина экструзии в мм
                                bevelEnabled: false
                            };
                            let handleGeometry = null; 
                            try {
                                handleGeometry = new THREE.ExtrudeGeometry(handleShape, handleExtrudeSettings);
                                // Центрируем по Z (оси выдавливания) и масштабируем
                                handleGeometry.translate(0, 0, -handleLengthMeters * 1000 / 2);
                                handleGeometry.scale(1/1000, 1/1000, 1/1000);
                            } catch (e) { console.error("Ошибка создания геометрии ручки TB9:", e); }
           
                            if (handleGeometry) {
                                const handleMesh = new THREE.Mesh(handleGeometry, golaMaterial.clone()); /* ... name, userData ... */
                                handleMesh.rotation.y = Math.PI / 2;
                                const facadeTopY = facadeCenterYOffset + facadeHeight / 2;
                                const handleCenterY = facadeTopY; // Уточнено, ручка на уровне верха фасада
                                const handleCenterX = facadeInfo.xOffset;
                                const handleCenterZ = facadeCenterZ - facadeThicknessMeters / 2 + (19 / 1000); // 19мм - ширина профиля ручки
                                handleMesh.position.set(handleCenterX, handleCenterY, handleCenterZ);
                                group.add(handleMesh);
                            }
                        }
                    }
                });
            }
            // --- === КОНЕЦ: РАБОЧИЙ КОД для РАСПАШНЫХ ФАСАДОВ (swing) === ---
    
        } else if (config === 'drawers' && facadeCount > 0) {
            // --- === НАЧАЛО: НОВЫЙ КОД для ФАСАДОВ ЯЩИКОВ (drawers) === ---
            const drawerFacadeWidth = width - facadeGapMeters; // Ширина фасада ящика (с боковыми зазорами от корпуса)
            let yCurrentPosition = -height / 2; // Начинаем снизу шкафа (внешняя нижняя точка)
            let facadesData = []; // [{ height, yOffset, addTB9Handle }]
    
            if (facadeCount === 1) {
                let h = height; let addTB9 = false;
                if (handleType === 'gola-profile') {
                     // Один фасад, один верхний Гола-профиль
                     h = height - actualGolaHeightMeters; // Высота фасада под один профиль
                } else if (handleType === 'aluminum-tv9') {
                     h = height - tb9HandleHeightMeters - facadeGapMeters; // Один зазор (сверху от ручки)
                     addTB9 = true;
                } else if (handleType === 'standard') {
                    h = height - facadeGapMeters; // Один зазор (сверху)
               }
    
                if (h <= 0) { console.error("Высота фасада ящика <= 0"); h = 0.1; }
                // Центр Y = низ шкафа + половина высоты фасада
                facadesData.push({ height: h, yOffset: yCurrentPosition + h / 2, addTB9Handle: addTB9 });
    
            } else if (facadeCount === 2) {
                let h_each = 0; let addTB9_each = false;
                let gapBetweenFacades = facadeGapMeters;
    
                if (handleType === 'gola-profile') {
                    // 2 фасада, 2 профиля Гола (верхний и средний)
                    h_each = (height - 2 * actualGolaHeightMeters) / 2;
                } else if (handleType === 'aluminum-tv9') {
                    // 2 фасада, 2 ручки TB9, 2 зазора между фасадами
                    h_each = (height - 2 * tb9HandleHeightMeters - 2 * facadeGapMeters) / 2;
                    addTB9_each = true;
                } else { // standard
                    // 2 фасада, 2 зазора между ними
                    h_each = (height - facadeGapMeters * 2) / 2;
                }
                if (h_each <= 0) { console.error("Высота фасада ящика (2) <= 0"); h_each = 0.1; }
    
                // Нижний фасад
                facadesData.push({ height: h_each, yOffset: yCurrentPosition + h_each / 2, addTB9Handle: addTB9_each });
                if (handleType === 'gola-profile') {
                    yCurrentPosition += h_each + actualGolaHeightMeters;
                } else if (handleType === 'aluminum-tv9') {
                    yCurrentPosition += h_each + tb9HandleHeightMeters + facadeGapMeters;
                } else {
                    yCurrentPosition += h_each + facadeGapMeters;
                }
                //yCurrentPosition += h_each + facadeGapMeters + (handleType === 'gola-profile' ? actualGolaHeightMeters : (handleType === 'aluminum-tv9' ? tb9HandleHeightMeters : 0));
                // Верхний фасад
                facadesData.push({ height: h_each, yOffset: yCurrentPosition + h_each / 2, addTB9Handle: addTB9_each });
    
            } else if (facadeCount === 3) {
                let h_bottom = 0;
                let h_top_1 = 0;
                let h_top_2 = 0;
                let h_each = 0; 
                let addTB9_each = false;
                let totalGapsAndHandlesHeight = 0;
    
                if (handleType === 'gola-profile') {
                    // 3 фасада, 2 профиля Гола (верхний и средний), 1 зазор между двумя верхними фасадами
                    totalGapsAndHandlesHeight = 2 * actualGolaHeightMeters;
                    h_bottom = (height - totalGapsAndHandlesHeight) / 2;
                    h_top_1 = Math.round((h_bottom - facadeGapMeters) * 1000 / 2) / 1000;
                    h_top_2 = h_bottom - h_top_1 - facadeGapMeters;
                } else if (handleType === 'aluminum-tv9') {
                    // 3 фасада, 3 ручки TB9, 2 зазора между фасадами
                    totalGapsAndHandlesHeight = 2 * tb9HandleHeightMeters + 2 * facadeGapMeters;
                    addTB9_each = true;
                    h_bottom = (height - totalGapsAndHandlesHeight) / 2;
                    h_top_1 = Math.round((h_bottom - facadeGapMeters - tb9HandleHeightMeters) * 1000 / 2) / 1000;
                    h_top_2 = h_bottom - h_top_1 - facadeGapMeters - tb9HandleHeightMeters;
                } else { // standard
                    // 3 фасада, 2 зазора между ними и один над ними
                    totalGapsAndHandlesHeight = 2 * facadeGapMeters;
                    h_bottom = (height - totalGapsAndHandlesHeight) / 2;
                    h_top_1 = Math.round((h_bottom - facadeGapMeters) * 1000 / 2) / 1000;
                    h_top_2 = h_bottom - h_top_1 - facadeGapMeters;
                }

                h_each = (height - totalGapsAndHandlesHeight) / 3;
                if (h_each <= 0) { console.error("Высота фасада ящика (3) <= 0"); h_each = 0.1; }
    
                // 1-й (нижний)
                facadesData.push({ height: h_bottom, yOffset: yCurrentPosition + h_bottom / 2, addTB9Handle: addTB9_each });
                if (handleType === 'gola-profile') {
                    yCurrentPosition += h_bottom + actualGolaHeightMeters;
                } else if (handleType === 'aluminum-tv9') {
                    yCurrentPosition += h_bottom + tb9HandleHeightMeters + facadeGapMeters;
                } else {
                    yCurrentPosition += h_bottom + facadeGapMeters;
                }
                //yCurrentPosition += h_bottom + (handleType === 'gola-profile' ? actualGolaHeightMeters : (handleType === 'aluminum-tv9' ? tb9HandleHeightMeters + facadeGapMeters : 0));
                // 2-й (средний)
                facadesData.push({ height: h_top_1, yOffset: yCurrentPosition + h_top_1 / 2, addTB9Handle: addTB9_each });
                if (handleType === 'gola-profile' || handleType === 'standard') {
                    yCurrentPosition += h_top_1 + facadeGapMeters;
                } else {
                    yCurrentPosition += h_top_1 + tb9HandleHeightMeters + facadeGapMeters;
                }
                // 3-й (верхний)
                facadesData.push({ height: h_top_2, yOffset: yCurrentPosition + h_top_2 / 2, addTB9Handle: addTB9_each });
    
            } else if (facadeCount === 4) {
                // ЗАГЛУШКА: создаем как для 2-х фасадов
                console.warn("Создание 4 фасадов ящиков пока не реализовано, создаем как для 2-х.");
                let h_each = 0; let addTB9_each = false;
                if (handleType === 'gola-profile') h_each = (height - 2 * actualGolaHeightMeters - facadeGapMeters) / 2;
                else if (handleType === 'aluminum-tv9') { h_each = (height - 2 * tb9HandleHeightMeters - facadeGapMeters) / 2; addTB9_each = true; }
                else h_each = (height - facadeGapMeters) / 2;
                if (h_each <= 0) h_each = 0.1;
                facadesData.push({ height: h_each, yOffset: yCurrentPosition + h_each / 2, addTB9Handle: addTB9_each });
                yCurrentPosition += h_each + facadeGapMeters + (handleType === 'gola-profile' ? actualGolaHeightMeters : (handleType === 'aluminum-tv9' ? tb9HandleHeightMeters : 0));
                facadesData.push({ height: h_each, yOffset: yCurrentPosition + h_each / 2, addTB9Handle: addTB9_each });
            }
    
            // Создаем меши фасадов ящиков
            facadesData.forEach((fData, index) => {
                //console.log(`  - Создание фасада ящика ${index + 1}: W=${drawerFacadeWidth.toFixed(3)}, H=${fData.height.toFixed(3)}, Yoff=${fData.yOffset.toFixed(3)}`);
                
                const facadeMesh = createPanel(
                    drawerFacadeWidth, fData.height, facadeThicknessMeters,
                    facadeMaterialToClone, // <--- Передаем материал, полученный из getFacadeMaterialAndThickness
                    'frontal', `facade_drawer_${index}`
                );
                if (facadeMesh) {
                    const facadeCenterZ = depth / 2 + facadeThicknessMeters / 2;
                    facadeMesh.position.set(0, fData.yOffset, facadeCenterZ); // xOffset = 0 для ящиков
                    facadeMesh.userData.cabinetUUID = cabinetUUID;
                     // --- Работаем с текстурой КОНКРЕТНОГО меша ---
                    const actualFacadeMaterial = facadeMesh.material; // Получаем СКЛОНИРОВАННЫЙ материал
                    if (facadeMaterial.map?.isTexture) {
                        const originalTexture = actualFacadeMaterial.map; // Берем исходную текстуру
                        // Создаем НОВУЮ трансформированную текстуру
                        const transformedTexture = applyTextureTransform(
                            actualFacadeMaterial.map,
                            textureDirection,
                            drawerFacadeWidth, // или drawerFacadeWidth
                            fData.height      // или fData.height
                        );
                        // Назначаем НОВУЮ текстуру материалу этого меша
                        actualFacadeMaterial.map = transformedTexture;
                        actualFacadeMaterial.needsUpdate = true; // Обновляем материал
                    }

                    group.add(facadeMesh);
    
                    // Создание ручки TB9 для этого фасада ящика
                    if (fData.addTB9Handle) {
                        const handleLengthMeters = drawerFacadeWidth;
                        // Создаем Shape ручки (простой прямоугольник)
                        const handleShape = new THREE.Shape();
                        handleShape.moveTo(0, 0);
                        handleShape.lineTo(19, 0);
                        handleShape.lineTo(19, 30);
                        handleShape.lineTo(19 - 1.5, 30);
                        handleShape.lineTo(19 - 1.5, 1);
                        handleShape.lineTo(0, 1);
                        handleShape.closePath();
                        const handleExtrudeSettings = {
                            steps: 1,
                            depth: handleLengthMeters * 1000, 
                            bevelEnabled: false
                        };
                        let handleGeometry = null; 
                        try {
                            handleGeometry = new THREE.ExtrudeGeometry(handleShape, handleExtrudeSettings);
                            // Центрируем по Z (оси выдавливания) и масштабируем
                            handleGeometry.translate(0, 0, -handleLengthMeters * 1000 / 2);
                            handleGeometry.scale(1/1000, 1/1000, 1/1000);
                        } catch (e) { console.error("Ошибка создания геометрии ручки TB9:", e); }
                        if (handleGeometry) {
                            const handleMesh = new THREE.Mesh(handleGeometry, golaMaterial.clone());
                            handleMesh.name = `handle_TB9_drawer_${index}`;
                            handleMesh.userData = { isCabinetPart: true, objectType: 'cabinetHandle', cabinetUUID: cabinetUUID };
                            handleMesh.rotation.y = Math.PI / 2;
    
                            const facadeTopY = fData.yOffset + fData.height / 2; // Верх ТЕКУЩЕГО фасада
                            const handleCenterY = facadeTopY; // Ручка по верхнему краю фасада
                            const handleCenterX = 0; // Центр по X
                            // Передняя грань фасада + половина толщины фасада + половина ширины профиля ручки (19мм)
                            const handleCenterZ = facadeCenterZ - facadeThicknessMeters / 2 + (19 / 1000);
                            handleMesh.position.set(handleCenterX, handleCenterY, handleCenterZ);
                            group.add(handleMesh);
                        }
                    }
                }
            });
            // --- === КОНЕЦ: НОВЫЙ КОД для ФАСАДОВ ЯЩИКОВ (drawers) === ---
        } else {
            console.log("[Фасады] Не создаются (тип/конфигурация не подходят или кол-во 0).");
        }
        // --- КОНЕЦ БЛОКА 8 ---

    // --- НАЧАЛО БЛОКА 9: Полки ---
    const shelfType = cabinetData.shelfType || 'none';
    const shelfCount = parseInt(cabinetData.shelfCount) || 0; // Преобразуем в число
    const shelfFrontOffsetMeters = 2 / 1000; // Отступ полки от фасада (2мм) - можно вынести в параметры

    if (shelfType !== 'none' && shelfCount > 0) {
        // 9.1: Расчет размеров полки
        const shelfHeight = panelThickness; // Высота полки = толщина материала
        let shelfWidth = 0;
        let shelfDepth = 0;

        if (shelfType === 'confirmat') {
            shelfWidth = width - 2 * panelThickness; // Между боковинами
            shelfDepth = depth - shelfFrontOffsetMeters; // От задней стенки до отступа спереди
        } else { // shelfHolder или secura_7
            shelfWidth = width - 2 * panelThickness - (2 / 1000); // Между боковинами минус зазор 1+1 мм
            shelfDepth = depth - shelfFrontOffsetMeters; // Так же, как у конфирмата? Или тоже нужен зазор? Пока так.
        }

        // Проверка на валидные размеры полки
        if (shelfWidth <= 0 || shelfDepth <= 0) {
             console.warn(" - Невозможно создать полки: расчетная ширина или глубина <= 0.");
        } else {
            // 9.2: Расчет шага и позиций по Y
            // Доступная высота = Общая высота - толщина дна - толщина/высота верхней царги - опуск царг
            const topStructureHeight = (cabinetData.frontStretcher === 'vertical' || cabinetData.rearStretcher === 'vertical') ? (60/1000) : panelThickness;
            const availableHeight = height - panelThickness - topStructureHeight - stretcherDropMeters;

            if (availableHeight > 0) {
                const shelfStepYMm = Math.round((availableHeight * 1000) / (shelfCount + 1)); // Шаг в мм, округленный
                const shelfStepYMeters = shelfStepYMm / 1000; // Шаг в метрах
                console.log(` - Доступная высота для полок: ${availableHeight.toFixed(3)} м, Шаг по Y: ${shelfStepYMeters.toFixed(3)} м`);

                // 9.3: Создание и позиционирование полок в цикле
                for (let i = 1; i <= shelfCount; i++) {
                    const shelfCenterY = -height / 2 + panelThickness + shelfStepYMeters * i; // Низ шкафа + дно + шаг * номер
                    const shelfCenterX = 0; // Центр по X
                    // Центр по Z = передняя грань - отступ - половина глубины полки
                    const shelfCenterZ = depth / 2 - shelfFrontOffsetMeters - shelfDepth / 2;
                     // Возможно, нужно учесть и толщину фасада?
                     // const { thickness: facadeThicknessMeters } = getFacadeMaterialAndThickness(cabinetData);
                     // shelfCenterZ = depth / 2 - facadeThicknessMeters - shelfFrontOffsetMeters - shelfDepth / 2;

                    const shelfMesh = createPanel(
                        shelfWidth, shelfHeight, shelfDepth,
                        cabinetMaterial, // Материал корпуса
                        'horizontal',    // Ориентация полки
                        `shelf_${i}`
                    );

                    if (shelfMesh) {
                        shelfMesh.position.set(shelfCenterX, shelfCenterY, shelfCenterZ);
                        shelfMesh.userData.cabinetUUID = cabinetUUID;
                        group.add(shelfMesh);
                    } else {
                         console.error(`   - Не удалось создать меш для полки #${i}`);
                    }
                } // Конец цикла for
            } else {
                 console.warn(" - Невозможно создать полки: доступная высота <= 0.");
            }
        } // Конец if (размеры полки > 0)
    } else {
        console.log("[createDetailedCabinetGeometry] Полки не создаются (Тип 'none' или Кол-во 0).");
    }
    // --- КОНЕЦ БЛОКА 9: Полки ---
    

    group.userData.isDetailedCabinet = true;
    group.userData.objectType = 'cabinet';
    return group;
}
/**
 * СОЗДАЕТ ДЕТАЛИЗИРОВАННУЮ ГЕОМЕТРИЮ ДЛЯ ФАЛЬШ-ПАНЕЛИ
 * @param {object} cabinetData - Объект данных шкафа (с cabinetConfig === 'falsePanel').
 * @returns {THREE.Group | null} Группа с деталями фальш-панели или null.
 */
// В script.js


// В script.js

function createDetailedFalsePanelGeometry(cabinetData) {

    if (cabinetData.cabinetConfig !== 'falsePanel') {
        console.warn(`[createDetailedFPGeom] Попытка создать ФП для конфига: ${cabinetData.cabinetConfig}`);
        return null;
    }

    const group = new THREE.Group();
    group.userData.isDetailedCabinet = true;
    group.userData.objectType = 'cabinet'; // Тип объекта - шкаф (даже если это панель)
    const cabinetUUID = cabinetData.mesh?.uuid || THREE.MathUtils.generateUUID(); // UUID для связи

    // Получаем материалы и толщины
    const { material: facadeMaterialToClone, thickness: facadeThicknessMeters } = getFacadeMaterialAndThickness(cabinetData);
    const cabinetMaterialForHolder = new THREE.MeshStandardMaterial({ color: cabinetData.initialColor }); // Цвет корпуса для держателя

    const fpType = cabinetData.fp_type || 'narrow';
    // Габариты "контейнера" или основной части ФП из cabinetData
    const containerWidthM = cabinetData.width;
    const containerHeightM = cabinetData.height;
    const containerDepthM = cabinetData.depth; // Для широкой ФП - это глубина держателя/корпусной части

    console.log(`  - Тип ФП: ${fpType}`);
    console.log(`  - Габариты контейнера ФП: W=${containerWidthM.toFixed(3)}, H=${containerHeightM.toFixed(3)}, D=${containerDepthM.toFixed(3)}`);

    if (containerHeightM <= 0) { // Основная проверка - высота
        console.warn(`[createDetailedFPGeom] Некорректная высота для создания ФП.`);
        return group; // Возвращаем пустую группу
    }

    if (fpType === 'narrow' || fpType === 'decorativePanel') {
        // --- УЗКАЯ или ДЕКОРАТИВНАЯ ФАЛЬШ-ПАНЕЛЬ (одна деталь) ---
        // panelWidthM для createPanel здесь - это толщина фасада (из facadeThicknessMeters)
        // panelDepthM для createPanel здесь - это "видимая глубина" панели, если она у стены (из cabinetData.depth)
        const panelActualWidthForCreatePanel = facadeThicknessMeters; // Толщина фасада идет как "ширина" для createPanel с ориентацией 'vertical'
        const panelActualHeightForCreatePanel = containerHeightM;
        const panelActualDepthForCreatePanel = containerDepthM; // Это "глубина" узкой/декоративной панели

        if (panelActualWidthForCreatePanel <=0 || panelActualDepthForCreatePanel <=0) {
            console.warn(`[createDetailedFPGeom] Некорректные размеры для узкой/декоративной ФП.`);
            return group;
        }

        const panelOrientation = 'vertical'; // Толщина по X геометрии
        const mainPanelMesh = createPanel(
            panelActualWidthForCreatePanel,
            panelActualHeightForCreatePanel,
            panelActualDepthForCreatePanel,
            facadeMaterialToClone, // Используем материал фасада
            panelOrientation,
            `falsePanel_${fpType}`
        );

        if (mainPanelMesh) {
            mainPanelMesh.position.set(0, 0, 0); // Центрирована в группе
            mainPanelMesh.userData.cabinetUUID = cabinetUUID;

            // Наложение текстуры для узкой/декоративной
            const actualFacadeMaterial = mainPanelMesh.material;
            if (actualFacadeMaterial.map?.isTexture) {
                // Видимая "ширина" текстуры - это panelActualDepthForCreatePanel (глубина панели)
                // Видимая "высота" текстуры - это panelActualHeightForCreatePanel (высота панели)
                const transformedTexture = applyTextureTransform(
                    actualFacadeMaterial.map,
                    cabinetData.textureDirection || 'vertical',
                    panelActualDepthForCreatePanel, // Видимая ширина для текстуры
                    panelActualHeightForCreatePanel // Видимая высота для текстуры
                );
                if (transformedTexture) {
                    actualFacadeMaterial.map = transformedTexture;
                    actualFacadeMaterial.needsUpdate = true;
                }
            }
            group.add(mainPanelMesh);
            console.log(`   - Создана узкая/декоративная ФП. Размеры для createPanel: W=${panelActualWidthForCreatePanel.toFixed(4)}, H=${panelActualHeightForCreatePanel.toFixed(4)}, D=${panelActualDepthForCreatePanel.toFixed(4)}`);
        }

    } else if (fpType === 'wideLeft' || fpType === 'wideRight') {
        // --- ШИРОКАЯ ФАЛЬШ-ПАНЕЛЬ (ЛЕВАЯ/ПРАВАЯ) - две детали ---

        // === ДЕТАЛЬ 1: Лицевая фальш-панель (из материала фасада) ===
        const facadeGapMeters = cabinetData.facadeGap || 0.003; // Зазор, если не задан, то 3мм
        const facadeGapOffset = Math.round((facadeGapMeters / 2) * 1000) / 1000;

        // Размеры лицевой панели
        const facadePartActualWidth = containerWidthM - facadeGapOffset;
        const facadePartActualDepth = facadeThicknessMeters; // Толщина самого фасадного материала
        const facadePartActualHeight = containerHeightM;

        if (facadePartActualWidth <=0 || facadePartActualDepth <=0) {
            console.warn(`[createDetailedFPGeom] Некорректные размеры для лицевой части широкой ФП.`);
            return group; // Возвращаем пустую группу или только держатель, если он уже создан
        }

        const facadePartOrientation = 'frontal'; // Толщина по Z геометрии
        const facadePartMesh = createPanel(
            facadePartActualWidth,
            facadePartActualHeight,
            facadePartActualDepth,
            facadeMaterialToClone,
            facadePartOrientation,
            `fp_wide_facade_${fpType}`
        );

        if (facadePartMesh) {
            const facadePartCenterY = 0; // Центр группы по Y
            // Позиция Z: передняя грань "контейнера" + половина толщины самой фасадной доски
            // "Контейнер" имеет глубину containerDepthM (например, 60мм)
            // Его передняя грань в локальных координатах группы на Z = containerDepthM / 2
            const facadePartCenterZ = (containerDepthM / 2) + (facadePartActualDepth / 2);
            let facadePartCenterX = 0;

            if (fpType === 'wideLeft') {
                // Лицевая панель примыкает к левому краю "контейнера"
                // Центр X = - (ширина контейнера / 2) + (ширина лицевой панели / 2)
                facadePartCenterX = -(containerWidthM / 2) + (facadePartActualWidth / 2);
            } else { // wideRight
                // Лицевая панель примыкает к правому краю "контейнера"
                // Центр X = (ширина контейнера / 2) - (ширина лицевой панели / 2)
                facadePartCenterX = (containerWidthM / 2) - (facadePartActualWidth / 2);
            }

            facadePartMesh.position.set(facadePartCenterX, facadePartCenterY, facadePartCenterZ);
            facadePartMesh.userData.cabinetUUID = cabinetUUID;

            // Наложение текстуры на лицевую часть
            const actualFacadeMaterial = facadePartMesh.material;
            if (actualFacadeMaterial.map?.isTexture) {
                const transformedTexture = applyTextureTransform(
                    actualFacadeMaterial.map,
                    cabinetData.textureDirection || 'vertical',
                    facadePartActualWidth,    // Ширина, видимая на фасаде
                    facadePartActualHeight    // Высота, видимая на фасаде
                );
                if (transformedTexture) {
                    actualFacadeMaterial.map = transformedTexture;
                    actualFacadeMaterial.needsUpdate = true;
                }
            }
            group.add(facadePartMesh);
            console.log(`   - Создана лицевая часть широкой ФП (${fpType}). Pos: X=${facadePartCenterX.toFixed(4)}, Z=${facadePartCenterZ.toFixed(4)}`);
        }

        // === ДЕТАЛЬ 2: Держатель/Корпусная часть (из материала корпуса) ===
        // Размеры держателя
        const holderActualWidth = getPanelThickness(); // Толщина материала корпуса
        const holderActualHeight = containerHeightM;
        const holderActualDepth = containerDepthM; // На всю глубину "контейнера" ФП (например, 60мм)

         if (holderActualWidth <=0 || holderActualDepth <=0) {
            console.warn(`[createDetailedFPGeom] Некорректные размеры для держателя широкой ФП.`);
            // Если лицевая часть создана, возвращаем группу с ней
            return group.children.length > 0 ? group : null;
        }

        const holderOrientation = 'vertical'; // Толщина по X геометрии
        const holderMesh = createPanel(
            holderActualWidth,
            holderActualHeight,
            holderActualDepth,
            cabinetMaterialForHolder,
            holderOrientation,
            `fp_wide_holder_${fpType}`
        );

        if (holderMesh) {
            const holderCenterY = 0;
            const holderCenterZ = 0; // Центрирован по глубине "контейнера" ФП
            let holderCenterX = 0;

            if (fpType === 'wideLeft') {
                // Держатель СПРАВА от лицевой панели, примыкает к правому краю "контейнера"
                holderCenterX = (containerWidthM / 2) - (holderActualWidth / 2);
            } else { // wideRight
                // Держатель СЛЕВА от лицевой панели, примыкает к левому краю "контейнера"
                holderCenterX = -(containerWidthM / 2) + (holderActualWidth / 2);
            }

            holderMesh.position.set(holderCenterX, holderCenterY, holderCenterZ);
            holderMesh.userData.cabinetUUID = cabinetUUID;
            group.add(holderMesh);
            console.log(`   - Создан держатель широкой ФП (${fpType}). Pos X: ${holderCenterX.toFixed(4)}`);
        }
    } else {
        console.warn(`[createDetailedFPGeom] Неизвестный тип ФП: ${fpType}`);
    }

    //console.log(`[createDetailedFPGeom] Завершено для ${cabinetUUID}. Добавлено детей: ${group.children.length}`);
    return group.children.length > 0 ? group : null; // Возвращаем группу, только если в ней есть что-то
}

/**
 * Создает THREE.Group представляющую детализированную модель шкафа для духовки.
 * @param {object} cabinetData - Объект шкафа из массива 'cabinets'.
 * @returns {THREE.Group | null} Группа со всеми частями шкафа или null при ошибке.
 */
function createDetailedOvenCabinetGeometry(cabinetData) {

    const group = new THREE.Group();
    group.userData.isDetailedCabinet = true;
    group.userData.objectType = 'cabinet'; // Тип объекта
    group.userData.cabinetType = cabinetData.cabinetType; // e.g., 'straight'
    group.userData.cabinetConfig = cabinetData.cabinetConfig; // e.g., 'oven'
    const cabinetUUID = cabinetData.mesh.uuid; // UUID для связи деталей с основным объектом

    // --- Основные размеры и параметры из cabinetData ---
    const panelThicknessM = getPanelThickness();       // Толщина материала корпуса (м)
    const cabWidthM = cabinetData.width;             // Общая ширина модуля (м)
    const cabHeightM = cabinetData.height;           // Общая высота модуля (м)
    const cabDepthM = cabinetData.depth;             // Общая глубина модуля (м)

    // --- Параметры духовки из cabinetData ---
    const ovenHeightType = cabinetData.ovenHeight || '600';       // '600' или '450' (строка)
    const ovenActualHeightM = parseFloat(ovenHeightType) / 1000;  // Высота самой духовки (м)
    const ovenPosition = cabinetData.ovenPosition || 'top';       // 'top' или 'bottom'
    const extraOffsetTopM = (cabinetData.extraOffset || 0);// Опуск духовки от верха (м), если ovenPosition = 'top'

    // --- Параметры фасадов и ручек ---
    const facadeGapM = cabinetData.facadeGap || 0.003;            // Зазор между/вокруг фасадов (м)
    const handleType = kitchenGlobalParams.handleType || 'standard'; // Тип ручек из глобальных параметров

    // --- Материалы ---
    const cabinetMaterial = new THREE.MeshStandardMaterial({ 
        color: cabinetData.initialColor, 
        roughness: 0.8, 
        metalness: 0.1,
        name: `OvenCabBodyMat_${cabinetUUID.substring(0,4)}`
    });
    const { material: facadeMaterialToClone, thickness: facadeThicknessMeters } = getFacadeMaterialAndThickness(cabinetData);
    const golaMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xAAAAAA, // Серый алюминий
        metalness: 0.8, 
        roughness: 0.4,
        name: "GolaProfileMat" 
    });
    
    // --- Актуальная высота Гола (если используется) ---
    let actualGolaHeightMeters = 0;
    if (handleType === 'gola-profile') {
        // Высота модуля, доступная для фасадов и Гола (обычно это высота нижних шкафов)
        const boxAvailableHeightForGolaCalcM = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;
        actualGolaHeightMeters = calculateActualGolaHeight(
            (kitchenGlobalParams.golaMinHeightMm || 30), // minGolaHeightMm
            facadeGapM * 1000,                          // facadeGapMm
            boxAvailableHeightForGolaCalcM * 1000       // boxAvailableHeightMm (высота стандартного нижнего ящика)
        ) / 1000;
    }

    // --- Параметры царг из cabinetData ---
    const rearStretcherType = cabinetData.rearStretcher || 'none';
    const frontStretcherType = cabinetData.frontStretcher || 'none';
    const stretcherDropM = (cabinetData.stretcherDrop || 0) / 1000; // Опуск царг от верха модуля (м)

    // --- 1. Боковины ---
    
    let sidePanelActualHeight;
    let sidePanelCenterY_inGroup; // Y-координата центра боковины в системе координат группы шкафа

    if (ovenPosition === 'top') {
        // Духовка сверху: боковины стоят НА дне, их высота меньше на толщину дна
        sidePanelActualHeight = cabHeightM - panelThicknessM;
        // Низ боковин на Y_локальный = -cabHeightM/2 + panelThicknessM (над дном)
        // Центр боковин по Y_локальный = (-cabHeightM/2 + panelThicknessM) + sidePanelActualHeight/2
        sidePanelCenterY_inGroup = (-cabHeightM / 2) + panelThicknessM + (sidePanelActualHeight / 2);
    } else { // ovenPosition === 'bottom'
        // Духовка снизу: боковины полной высоты cabHeightM, дно (если это плита) будет ПОД ними.
        sidePanelActualHeight = cabHeightM;
        sidePanelCenterY_inGroup = 0; // Центр боковин совпадает с центром шкафа по высоте
    }

    // Глубина боковин - полная глубина шкафа
    const sidePanelDepth = cabDepthM; 

    const sideShape = new THREE.Shape();
    // Начало координат шейпа (0,0) - это задний нижний угол формы боковины
    // Высота формы шейпа всегда sidePanelActualHeight
    sideShape.moveTo(0, 0); 

    if (handleType === 'gola-profile') {
        const golaCutoutHeight = (58 / 1000); 
        const golaCutoutDepth = (27 / 1000);  

        const shapeFrontX = sidePanelDepth;        
        const shapeTopY = sidePanelActualHeight; // Используем актуальную высоту боковины для формы
        
        const cutoutBottomY = shapeTopY - golaCutoutHeight;    
        const cutoutRearX = shapeFrontX - golaCutoutDepth;     

        sideShape.lineTo(shapeFrontX, 0);                     
        sideShape.lineTo(shapeFrontX, cutoutBottomY);         
        sideShape.lineTo(cutoutRearX, cutoutBottomY);         
        sideShape.lineTo(cutoutRearX, shapeTopY);             
        sideShape.lineTo(0, shapeTopY);                       
    } else {
        sideShape.lineTo(sidePanelDepth, 0);
        sideShape.lineTo(sidePanelDepth, sidePanelActualHeight); // Используем актуальную высоту
        sideShape.lineTo(0, sidePanelActualHeight);             // Используем актуальную высоту
    }
    sideShape.closePath();

    const sideExtrudeSettings = {
        depth: panelThicknessM, 
        bevelEnabled: false,
        steps: 1
    };

    let sideGeometry = null;
    try {
        sideGeometry = new THREE.ExtrudeGeometry(sideShape, sideExtrudeSettings);
        // Центрируем геометрию относительно ЕЁ СОБСТВЕННЫХ размеров:
        // X шейпа (глубина боковины) -> центр на -sidePanelDepth / 2
        // Y шейпа (высота боковины) -> центр на -sidePanelActualHeight / 2
        // Z экструзии (толщина боковины) -> центр на -panelThicknessM / 2
        sideGeometry.translate(-sidePanelDepth / 2, -sidePanelActualHeight / 2, -panelThicknessM / 2);
    } catch (e) {
        console.error("    [OVEN] Ошибка создания геометрии боковины:", e);
    }

    if (sideGeometry) {
        // Левая боковина
        const leftSide = new THREE.Mesh(sideGeometry, cabinetMaterial.clone());
        leftSide.name = `leftSide_oven_${cabinetUUID.substring(0,4)}`;
        leftSide.userData = { isCabinetPart: true, objectType: 'cabinetPart', panelType: 'side_left', orientationType: 'vertical', cabinetUUID: cabinetUUID };
        leftSide.rotation.y = -Math.PI / 2; 
        
        const sideCenterX_inGroup = -cabWidthM / 2 + panelThicknessM / 2;
        leftSide.position.set(sideCenterX_inGroup, sidePanelCenterY_inGroup, 0); // Z=0, т.к. геометрия центрирована по своей глубине
        group.add(leftSide);

        // Правая боковина (клонируем геометрию)
        const rightSide = new THREE.Mesh(sideGeometry.clone(), cabinetMaterial.clone()); 
        rightSide.name = `rightSide_oven_${cabinetUUID.substring(0,4)}`;
        rightSide.userData = { ...leftSide.userData, panelType: 'side_right' };
        rightSide.rotation.y = -Math.PI / 2; 
        
        const rightSideCenterX_inGroup = cabWidthM / 2 - panelThicknessM / 2;
        rightSide.position.set(rightSideCenterX_inGroup, sidePanelCenterY_inGroup, 0);
        group.add(rightSide);
    }
    // --- Конец создания боковин ---

        // --- 2. Дно шкафа ---
    let bottomPanelMesh = null;

    if (ovenPosition === 'top') {
        // Духовка сверху: стандартное дно МЕЖДУ боковинами
        const bottomPanelWidth = cabWidthM;
        const bottomPanelDepth = cabDepthM; // На всю глубину
        const bottomPanelThickness = panelThicknessM;

        if (bottomPanelWidth > 0 && bottomPanelDepth > 0) { // Проверка на > 0
            bottomPanelMesh = createPanel(
                bottomPanelWidth,
                bottomPanelThickness, // Толщина панели (ее "высота" в createPanel)
                bottomPanelDepth,
                cabinetMaterial,
                'horizontal', // Ориентация: толщина по Y
                `bottom_internal_oven_top_${cabinetUUID.substring(0,4)}`
            );
            if (bottomPanelMesh) {
                // Центр Y: на самом низу модуля, боковины стоят на этом дне
                const bottomPanelCenterY = -cabHeightM / 2 + panelThicknessM / 2;
                bottomPanelMesh.position.set(0, bottomPanelCenterY, 0);
                bottomPanelMesh.userData.cabinetUUID = cabinetUUID; // Не забываем UUID
                group.add(bottomPanelMesh);
            }
        } else {
            console.warn("    [OVEN] Невозможно создать внутреннее дно: ширина или глубина <= 0.");
        }

    } else { // ovenPosition === 'bottom'
        // Духовка снизу: плита-основание ПОД боковинами
        const bottomPlateWidth = cabWidthM; // На всю ширину модуля
        const bottomPlateDepth = cabDepthM - 0.040; // Укорочено на 40мм
        const bottomPlateThickness = panelThicknessM;

        if (bottomPlateWidth > 0 && bottomPlateDepth > 0) { // Проверка на > 0
            bottomPanelMesh = createPanel(
                bottomPlateWidth,
                bottomPlateThickness, // Толщина плиты
                bottomPlateDepth,
                cabinetMaterial,
                'horizontal',
                `bottom_plate_oven_bottom_${cabinetUUID.substring(0,4)}`
            );
            if (bottomPanelMesh) {
                // Центр Y: под габаритом шкафа
                const bottomPlateCenterY = -cabHeightM / 2 - bottomPlateThickness / 2;
                // Центр Z: смещено назад на половину "укорочения"
                const bottomPlateCenterZ = - (0.040 / 2); // То есть -0.020
                bottomPanelMesh.position.set(0, bottomPlateCenterY, bottomPlateCenterZ);
                bottomPanelMesh.userData.cabinetUUID = cabinetUUID; // UUID
                group.add(bottomPanelMesh);
            }
        } else {
            console.warn("    [OVEN] Невозможно создать плиту-основание: ширина или глубина <= 0.");
        }
    }
    // --- Конец создания дна ---
    // --- 4. Царги (передняя и задняя) ---
    const stretcherWidth = cabWidthM - 2 * panelThicknessM; // Ширина царги между боковинами
    const stretcherDropFromTopM = (cabinetData.stretcherDrop); // Опуск от верха модуля (м), дефолт 40мм для духовки


    // --- 4.1 Задняя царга ---
    const rearStretcherTypeLocal = cabinetData.rearStretcher || 'horizontal'; // Дефолт 'horizontal' для духовки
    let rearStretcherMesh = null;

    if (rearStretcherTypeLocal !== 'none') {
        let rearStretcherHeightM;
        let rearStretcherDepthM;
        let rearStretcherOrientation;
        let rearStretcherName;

        if (rearStretcherTypeLocal === 'horizontal') { // Толщина по Y (вертикали шкафа)
            rearStretcherHeightM = panelThicknessM;    // "Высота" царги = толщина материала
            rearStretcherDepthM = 80 / 1000;         // Стандартная глубина горизонтальной царги
            rearStretcherOrientation = 'horizontal';
            rearStretcherName = `rearStretcherH_oven_${cabinetUUID.substring(0,4)}`;
        } else { // 'vertical' - Толщина по Z (глубине шкафа)
            rearStretcherHeightM = 60 / 1000;        // Стандартная высота вертикальной царги
            rearStretcherDepthM = panelThicknessM;   // "Глубина" царги = толщина материала
            rearStretcherOrientation = 'frontal';    // 'frontal', так как ее "широкая" сторона смотрит вперед/назад
            rearStretcherName = `rearStretcherV_oven_${cabinetUUID.substring(0,4)}`;
        }

        if (stretcherWidth > 0 && rearStretcherHeightM > 0 && rearStretcherDepthM > 0) {
            rearStretcherMesh = createPanel(
                stretcherWidth,
                rearStretcherHeightM,
                rearStretcherDepthM,
                cabinetMaterial,
                rearStretcherOrientation,
                rearStretcherName
            );

            if (rearStretcherMesh) {
                // Центр Y: Верх модуля - опуск - половина ВЫСОТЫ царги
                const rearStretcherCenterY = (cabHeightM / 2) - stretcherDropFromTopM - (rearStretcherHeightM / 2);
                // Центр Z: Задняя часть шкафа + половина ГЛУБИНЫ царги
                const rearStretcherCenterZ = -cabDepthM / 2 + rearStretcherDepthM / 2;
                
                rearStretcherMesh.position.set(0, rearStretcherCenterY, rearStretcherCenterZ);
                rearStretcherMesh.userData.cabinetUUID = cabinetUUID;
                group.add(rearStretcherMesh);
            }
        } else {
            console.warn("    [OVEN] Невозможно создать заднюю царгу: расчетные размеры <= 0.");
        }
    }

    // --- 4.2 Передняя царга ---
    const frontStretcherTypeLocal = cabinetData.frontStretcher || 'none'; // Дефолт 'none' для духовки
    let frontStretcherMesh = null;

    if (frontStretcherTypeLocal !== 'none') {
        let frontStretcherHeightM;
        let frontStretcherDepthM; // Это будет "толщина" царги, если она vertical, или ее глубина, если horizontal
        let frontStretcherOrientation;
        let frontStretcherName;

        // Смещение передней царги назад для Gola-профиля
        const golaProfileOffsetZ = (handleType === 'gola-profile') ? -(27 / 1000) : 0;

        if (frontStretcherTypeLocal === 'horizontal') {
            frontStretcherHeightM = panelThicknessM;
            frontStretcherDepthM = 80 / 1000;
            frontStretcherOrientation = 'horizontal';
            frontStretcherName = `frontStretcherH_oven_${cabinetUUID.substring(0,4)}`;
        } else { // 'vertical'
            frontStretcherHeightM = 60 / 1000;
            frontStretcherDepthM = panelThicknessM;
            frontStretcherOrientation = 'frontal';
            frontStretcherName = `frontStretcherV_oven_${cabinetUUID.substring(0,4)}`;
        }

        if (stretcherWidth > 0 && frontStretcherHeightM > 0 && frontStretcherDepthM > 0) {
            frontStretcherMesh = createPanel(
                stretcherWidth,
                frontStretcherHeightM,
                frontStretcherDepthM,
                cabinetMaterial,
                frontStretcherOrientation,
                frontStretcherName
            );

            if (frontStretcherMesh) {
                const frontStretcherCenterY = (cabHeightM / 2) - stretcherDropFromTopM - (frontStretcherHeightM / 2);
                // Центр Z: Передняя часть шкафа - половина ГЛУБИНЫ царги + смещение для Gola
                const frontStretcherCenterZ = cabDepthM / 2 - frontStretcherDepthM / 2 + golaProfileOffsetZ;

                frontStretcherMesh.position.set(0, frontStretcherCenterY, frontStretcherCenterZ);
                frontStretcherMesh.userData.cabinetUUID = cabinetUUID;
                group.add(frontStretcherMesh);
            }
        } else {
            console.warn("    [OVEN] Невозможно создать переднюю царгу: расчетные размеры <= 0.");
        }
    }
    // --- Конец создания царг ---
    // --- 5. Полка для установки духовки (только если духовка СВЕРХУ) ---
    let ovenSupportShelfMesh = null;
    let topOfOvenSupportShelfY = 0;  // Y-координата ВЕРХНЕЙ плоскости полки
    let bottomOfOvenSupportShelfY = 0; // Y-координата НИЖНЕЙ плоскости полки (понадобится для фасада)
    const ovenHeightConstant = (ovenHeightType === '600') ? (595 / 1000) : (455 / 1000); // 0.595м или 0.455м


    if (ovenPosition === 'top') {
        const shelfWidth = cabWidthM - 2 * panelThicknessM;
        const shelfDepth = cabDepthM; 
        const shelfThickness = panelThicknessM;
        
        if (shelfWidth > 0 && shelfDepth > 0) {
            let shelfCenterY;
            
            // Базовая верхняя точка шкафа, от которой идут вычеты
            const cabinetTopReferenceY = cabHeightM / 2;

            // Вычеты для определения ЦЕНТРА полки
            let deductions = ovenHeightConstant + extraOffsetTopM + (shelfThickness / 2);

            if (handleType === 'gola-profile') {
                deductions += actualGolaHeightMeters;
                console.log(`    [OVEN] Полка (Gola): cabTopRef=${cabinetTopReferenceY.toFixed(3)}, ovenConst=${ovenHeightConstant}, gola=${actualGolaHeightMeters.toFixed(3)}, extraOffset=${extraOffsetTopM.toFixed(3)}, shelfThick/2=${(shelfThickness / 2).toFixed(3)}`);
            } else { // standard или tv9 (предполагаем, что ручка TV9 не влияет на Y-положение полки, а только на высоту фасада под ней)
                deductions += facadeGapM; // Зазор над фасадом, который будет под полкой
                console.log(`    [OVEN] Полка (Не Gola): cabTopRef=${cabinetTopReferenceY.toFixed(3)}, ovenConst=${ovenHeightConstant}, facadeGap=${facadeGapM.toFixed(3)}, extraOffset=${extraOffsetTopM.toFixed(3)}, shelfThick/2=${(shelfThickness / 2).toFixed(3)}`);
            }
            
            shelfCenterY = cabinetTopReferenceY - deductions;
            
            // Рассчитаем также верхнюю и нижнюю плоскость полки для последующих расчетов
            topOfOvenSupportShelfY = shelfCenterY + shelfThickness / 2;
            bottomOfOvenSupportShelfY = shelfCenterY - shelfThickness / 2;

            ovenSupportShelfMesh = createPanel(
                shelfWidth,
                shelfThickness, 
                shelfDepth,
                cabinetMaterial,
                'horizontal', 
                `oven_support_shelf_${cabinetUUID.substring(0,4)}`
            );

            if (ovenSupportShelfMesh) {
                ovenSupportShelfMesh.position.set(0, shelfCenterY, 0);
                ovenSupportShelfMesh.userData.cabinetUUID = cabinetUUID;
                group.add(ovenSupportShelfMesh);
            }
        } else {
            console.warn("    [OVEN] Невозможно создать полку под духовку: расчетная ширина или глубина <= 0.");
            // Пока исходим из того, что полка есть.
        }
    } else { // ovenPosition === 'bottom'
        // Духовка стоит на дне (или плите-основании).
        // Рассчитаем 'topOfOvenSupportShelfY' как эффективный верх духовки для расчета верхнего фасада.
        let ovenBottomPlaneY;
        // Если дно - это плита под модулем (согласно предыдущему шагу для ovenPosition: 'bottom')
        // то верхняя плоскость этой плиты находится на Y = -cabHeightM / 2.
        ovenBottomPlaneY = -cabHeightM / 2; 
        
        topOfOvenSupportShelfY = ovenBottomPlaneY + ovenHeightConstant; 
        bottomOfOvenSupportShelfY = ovenBottomPlaneY; // Низ пространства, занимаемого духовкой
        console.log(`  [OVEN] Духовка снизу. Эффективный верх духовки Y=${topOfOvenSupportShelfY.toFixed(3)}, Низ духовки Y=${bottomOfOvenSupportShelfY.toFixed(3)}`);
    }
    // --- Конец создания полки для духовки ---
    // --- Переменные для ручки TV9 ---
    const tb9HandleHeightMeters = 30 / 1000; // Высота профиля ручки TV9
    const tb9HandleProfileWidthM = 19 / 1000; // "Толщина" или выступ профиля ручки TV9

    // --- 6. Основной фасад (под/над духовкой) ---
    let mainFacadeHeightM_calc = 0; // Расчетная высота самого полотна фасада
    let mainFacadeCenterY = 0;
    let yTopOfActualFacade = 0;    // Y-координата верхней плоскости полотна фасада
    let yBottomOfActualFacade = 0; // Y-координата нижней плоскости полотна фасада

    const mainFacadeWidthM = cabWidthM - facadeGapM; 
    const constBottomSubtractionForTopOvenFacade = (ovenHeightType === '600') ? 2 / 1000 : 8 / 1000;

    if (mainFacadeWidthM <= 0) {
        console.warn("    [OVEN] Расчетная ширина основного фасада <= 0. Фасад не будет создан.");
    } else {
        if (ovenPosition === 'top') {
            // ФАСАД СНИЗУ
            let spaceAboveFacade; 
            if (handleType === 'gola-profile') {
                spaceAboveFacade = actualGolaHeightMeters;
            } else if (handleType === 'aluminum-tv9') {
                spaceAboveFacade = tb9HandleHeightMeters; // Пространство под ручку TV9
            } else { // standard
                spaceAboveFacade = facadeGapM;
            }

            const mountingHeightDeductM = (ovenHeightType === '600') ? (595 / 1000) : (455 / 1000);
            const availableHeightForLowerFacadeAndTopStructure = cabHeightM - mountingHeightDeductM - extraOffsetTopM;
            mainFacadeHeightM_calc = availableHeightForLowerFacadeAndTopStructure - spaceAboveFacade - constBottomSubtractionForTopOvenFacade;

            if (mainFacadeHeightM_calc > 0.01) {
                yBottomOfActualFacade = -cabHeightM / 2; // Низ фасада на уровне низа модуля
                mainFacadeCenterY = yBottomOfActualFacade + mainFacadeHeightM_calc / 2;
                yTopOfActualFacade = yBottomOfActualFacade + mainFacadeHeightM_calc;
            } else {
                mainFacadeHeightM_calc = 0;
            }

        } else { // ovenPosition === 'bottom'
            // ФАСАД СВЕРХУ (над духовкой, под самым верхом шкафа)
            let spaceAboveUpperFacade; // Полная высота структуры над полотном фасада (зазор/ручка_TV9/Гола)
            const spaceBelowUpperFacade = facadeGapM; // Зазор ПОД этим верхним фасадом (над духовкой)

            if (handleType === 'gola-profile') {
                spaceAboveUpperFacade = actualGolaHeightMeters;
            } else if (handleType === 'aluminum-tv9') {
                spaceAboveUpperFacade = facadeGapM + tb9HandleHeightMeters;
            } else { // standard
                spaceAboveUpperFacade = facadeGapM;
            }
            
            // Верхняя граница доступного пространства для фасада и структур над ним - это ВЕРХ ШКАФА
            const yTopLimitForFacadeStructure = cabHeightM / 2;
            // Нижняя граница доступного пространства - это ВЕРХ ДУХОВКИ
            // topOfOvenSupportShelfY для ovenPosition === 'bottom' содержит Y_верха_духовки
            const yBottomOfFacadeStructure = topOfOvenSupportShelfY;

            const availableHeightForUpperFacadeAndStructures = yTopLimitForFacadeStructure - yBottomOfFacadeStructure;
            mainFacadeHeightM_calc = availableHeightForUpperFacadeAndStructures - spaceAboveUpperFacade - spaceBelowUpperFacade;

            if (mainFacadeHeightM_calc > 0.01) {
                // Верхняя грань ПОЛОТНА фасада:
                // (верх модуля) - (полная высота структуры НАД полотном фасада)
                yTopOfActualFacade = (cabHeightM / 2) - spaceAboveUpperFacade;
                
                mainFacadeCenterY = yTopOfActualFacade - mainFacadeHeightM_calc / 2;
                yBottomOfActualFacade = yTopOfActualFacade - mainFacadeHeightM_calc;
            } else {
                mainFacadeHeightM_calc = 0;
                console.log("      Верхний фасад не создается (недостаточно высоты).");
            }
        }

        if (mainFacadeHeightM_calc > 0.01) {
            const facadeMesh = createPanel(
                mainFacadeWidthM,
                mainFacadeHeightM_calc, // Используем рассчитанную высоту полотна
                facadeThicknessMeters,
                facadeMaterialToClone.clone(),
                'frontal',
                `oven_main_facade_${cabinetUUID.substring(0,4)}`
            );
            if (facadeMesh) {
                const facadeCenterZ = (cabDepthM / 2) + (facadeThicknessMeters / 2);
                facadeMesh.position.set(0, mainFacadeCenterY, facadeCenterZ);
                facadeMesh.userData.cabinetUUID = cabinetUUID;
                // ... (код наложения текстуры, он остается без изменений) ...
                const actualFacadeMaterial = facadeMesh.material; 
                if (actualFacadeMaterial.map?.isTexture) {
                    const transformedTexture = applyTextureTransform(
                        actualFacadeMaterial.map, 
                        cabinetData.textureDirection || 'vertical',
                        mainFacadeWidthM,
                        mainFacadeHeightM_calc // Используем высоту полотна
                    );
                    if (transformedTexture) {
                        actualFacadeMaterial.map = transformedTexture;
                        actualFacadeMaterial.needsUpdate = true;
                    }
                }
                group.add(facadeMesh);

                // --- Ручка TV9 для этого фасада ---
                if (handleType === 'aluminum-tv9') {
                    const handleLengthMeters_tv9 = mainFacadeWidthM;
                    const handleShape_tv9 = new THREE.Shape(); 
                        handleShape_tv9.moveTo(0, 0); handleShape_tv9.lineTo(19,0); handleShape_tv9.lineTo(19,30);
                        handleShape_tv9.lineTo(19 - 1.5, 30); handleShape_tv9.lineTo(19 - 1.5, 1); handleShape_tv9.lineTo(0,1);
                        handleShape_tv9.closePath(); // Размеры в мм
                    const handleExtrudeSettings_tv9 = { depth: handleLengthMeters_tv9 * 1000, steps: 1, bevelEnabled: false };
                    let handleGeometry_tv9 = null; 
                    try {
                        handleGeometry_tv9 = new THREE.ExtrudeGeometry(handleShape_tv9, handleExtrudeSettings_tv9);
                        handleGeometry_tv9.translate(0, 0, -handleLengthMeters_tv9 * 1000 / 2); 
                        handleGeometry_tv9.scale(1/1000, 1/1000, 1/1000);
                    } catch (e) { console.error("        [OVEN] Ошибка геометрии ручки TV9:", e); }
           
                    if (handleGeometry_tv9) {
                        const handleMesh_tv9 = new THREE.Mesh(handleGeometry_tv9, golaMaterial.clone()); // Можно использовать golaMaterial
                        handleMesh_tv9.name = `handle_TV9_oven_facade_${cabinetUUID.substring(0,4)}`;
                        handleMesh_tv9.userData = { isCabinetPart: true, objectType: 'cabinetHandle', cabinetUUID: cabinetUUID };
                        handleMesh_tv9.rotation.y = Math.PI / 2; 

                        // Ручка TV9 ставится НАД полотном фасада
                        const handleCenterY_tv9 = yTopOfActualFacade; 
                        // Z-позиция ручки TV9 (ее "тело" выступает вперед от фасада)
                        // Передняя грань фасада: facadeCenterZ + facadeThicknessMeters / 2
                        // Центр ручки по Z: (Передняя грань фасада) + (половина ширины профиля ручки TV9)
                        const handleCenterZ_tv9 = (facadeCenterZ - facadeThicknessMeters / 2) + (tb9HandleProfileWidthM);
                        
                        handleMesh_tv9.position.set(0, handleCenterY_tv9, handleCenterZ_tv9);
                        group.add(handleMesh_tv9);
                    }
                }
            }
        }
    } // Конец if (mainFacadeWidthM > 0)
    // --- Конец создания основного фасада ---
    // --- 7. Gola-профиль (если handleType === 'gola-profile') ---
    // Gola-профиль ВСЕГДА ТОЛЬКО СВЕРХУ шкафа (как для распашного)
    if (handleType === 'gola-profile') {
        // Длина профиля МЕЖДУ боковинами
        const golaProfileLengthM = cabWidthM; 

        const golaProfileMesh = createGolaProfileMesh(golaProfileLengthM, golaMaterial, `gola_top_oven_${cabinetUUID.substring(0,4)}`, cabinetUUID);

        if (golaProfileMesh) {
            golaProfileMesh.rotation.y = Math.PI / 2; 
            const golaShapeHeightM = 58 / 1000; // Фактическая высота профиля Гола по его форме
            const topEdgeOfSidePanelY = sidePanelCenterY_inGroup + sidePanelActualHeight / 2; // Верхняя кромка текущей боковины
            const golaMeshCenterY = topEdgeOfSidePanelY - (golaShapeHeightM);
            const golaMeshCenterZ = (cabDepthM / 2);

            golaProfileMesh.position.set(0, golaMeshCenterY, golaMeshCenterZ); // X=0, т.к. между боковинами
            group.add(golaProfileMesh);
        } else {
            console.warn("    [OVEN] Невозможно создать Gola-профиль: расчетная длина <= 0.");
        }
    }
    // --- Конец Gola-профиля ---
        // --- 8. Верхняя фальш-панель-заглушка (если духовка сверху и есть опуск) ---
    if (ovenPosition === 'top' && extraOffsetTopM > 0.001) {
        const fpTopWidthM = mainFacadeWidthM; // Ширина как у основного фасада под духовкой
        const fpTopHeightM = extraOffsetTopM;   // Высота = величине опуска
        const fpTopDepthM = facadeThicknessMeters; // Глубина = толщина фасадного материала

        if (fpTopWidthM > 0.01 && fpTopHeightM > 0.001) { // Минимальные размеры для создания
            const fpTopMesh = createPanel(
                fpTopWidthM,
                fpTopHeightM,
                fpTopDepthM,
                facadeMaterialToClone.clone(), // Используем тот же материал, что и для основного фасада
                'frontal',
                `oven_top_filler_panel_${cabinetUUID.substring(0,4)}`
            );

            if (fpTopMesh) {
                const fpTopCenterX = 0; // Центрирована по X
                // Z-позиция такая же, как у основного фасада (выступает вперед)
                const fpTopCenterZ = (cabDepthM / 2) + (facadeThicknessMeters / 2); 

                // Рассчитываем Y-позицию центра фальш-панели
                let yTopOf_fpTop; // Y-координата верхней грани этой фальш-панели
                const yStructuralTopOfCabinet = (cabHeightM / 2) - stretcherDropM; // Верхняя конструктивная линия шкафа (под царгами)

                if (handleType === 'gola-profile') {
                    // Верх заглушки под профилем Гола
                    yTopOf_fpTop = yStructuralTopOfCabinet - actualGolaHeightMeters;
                } else { // standard или tv9
                    // Верх заглушки под стандартным зазором (или под ручкой TV9, если она там есть)
                    // Если TV9, то над ней еще зазор facadeGapM до царг.
                    // Поэтому отступ от верха конструкций = facadeGapM.
                    // Если ручка TV9 ставится в этот facadeGapM, то это уже учтено при позиционировании самой TV9.
                    yTopOf_fpTop = yStructuralTopOfCabinet - facadeGapM;
                }
                
                const fpTopCenterY = yTopOf_fpTop - (fpTopHeightM / 2);

                fpTopMesh.position.set(fpTopCenterX, fpTopCenterY, fpTopCenterZ);
                fpTopMesh.userData.cabinetUUID = cabinetUUID;

                // Наложение текстуры на фальш-панель
                const actualFillerMaterial = fpTopMesh.material;
                if (actualFillerMaterial.map?.isTexture) {
                    const transformedTexture = applyTextureTransform(
                        actualFillerMaterial.map,
                        cabinetData.textureDirection || 'vertical',
                        fpTopWidthM,
                        fpTopHeightM 
                    );
                    if (transformedTexture) {
                        actualFillerMaterial.map = transformedTexture;
                        actualFillerMaterial.needsUpdate = true;
                    }
                }
                group.add(fpTopMesh);
            }
        } else {
            console.warn("    [OVEN] Верхняя фальш-панель не создана (ширина или высота <= 0.01м).");
        }
    }
    // --- Конец создания верхней фальш-панели ---
    // --- 9. Загрузка и размещение 3D-модели духовки ---
    //console.log("  [OVEN] Подготовка к загрузке/размещению модели духовки...");
    const ovenModelFileName = `oven_${ovenHeightType}.glb`; // ovenHeightType это '600' или '450'

    // Определяем Y-координату НИЗА духовки
    let targetOvenBottomSurfaceY; 
    if (ovenPosition === 'top') {
        // Духовка стоит на ВЕРХНЕЙ плоскости полки ovenSupportShelfMesh
        // topOfOvenSupportShelfY была рассчитана как Y-координата ВЕРХА полки
        targetOvenBottomSurfaceY = topOfOvenSupportShelfY;  
        //console.log(`    [OVEN Model] Духовка сверху. Низ на Y=${ovenBottomY.toFixed(3)} (верх полки)`);
    } else { // ovenPosition === 'bottom'
        // Духовка стоит на дне/плите-основании.
        // Низ боковин на -cabHeightM / 2. Плита-основание под ними.
        // Верх плиты-основания (где стоит духовка) на Y = -cabHeightM / 2.
        targetOvenBottomSurfaceY = -cabHeightM / 2;
        //console.log(`    [OVEN Model] Духовка снизу. Низ на Y=${ovenBottomY.toFixed(3)} (верх плиты-основания)`);
    }
// Координаты для установки ORIGIN'а модели духовки
    const targetOvenOriginX = 0; // Центр шкафа по X
    const targetOvenOriginY = targetOvenBottomSurfaceY; // Низ модели (ее Y=0) ставим на опорную поверхность
    const targetOvenOriginZ = cabDepthM / 2;      // Передняя плоскость модели (ее Z=0) на передней грани корпуса шкафа
    
    // Используем синхронную функцию получения из кэша (предполагая, что предзагрузка реализована)
    const ovenModel = getPreloadedModelClone(ovenModelFileName); 

    if (ovenModel) {
        //console.log(`    [OVEN Model] Модель ${ovenModelFileName} получена из кэша.`);
        ovenModel.name = `oven_model_${ovenHeightType}_${cabinetUUID.substring(0,4)}`;
        ovenModel.userData = { 
            isCabinetPart: true, 
            objectType: 'appliance_oven', 
            cabinetUUID: cabinetUUID 
        };

        // --- СОЗДАНИЕ И ПРИМЕНЕНИЕ МАТЕРИАЛА ДУХОВКИ В ЗАВИСИМОСТИ ОТ ЦВЕТА ---
        let ovenMaterial;
        const selectedOvenColor = cabinetData.ovenColor || 'metallic'; // Дефолт, если не установлено

        switch (selectedOvenColor) {
            case 'black':
                ovenMaterial = new THREE.MeshStandardMaterial({
                    color: 0x222222, // Очень темно-серый, почти черный
                    metalness: 0.5,  // Немного металла для глубины
                    roughness: 0.6,  // Не слишком глянцевый
                    name: "OvenBlackMat"
                });
                break;
            case 'white':
                ovenMaterial = new THREE.MeshStandardMaterial({
                    color: 0xE5E5E5, // Очень светло-серый, почти белый
                    metalness: 0.1,  // Минимальный металл
                    roughness: 0.15,  // Достаточно глянцевый, как стекло или эмаль
                    // Для эффекта "стекла" можно добавить:
                    // transparent: true, // Если есть части, которые должны быть прозрачными
                    // opacity: 0.9,      // Если не полностью прозрачный
                    name: "OvenWhiteGlossMat"
                });
                break;
            case 'metallic':
            default: // По умолчанию будет металлик
                ovenMaterial = new THREE.MeshStandardMaterial({
                    color: 0x7B7B7B, // Средне-серый цвет нержавейки
                    metalness: 0.9,  // Высокий металлик
                    roughness: 0.3,  // Умеренная шероховатость для эффекта шлифовки
                    name: "OvenMetallicMat"
                    // Для анизотропного эффекта шлифованной стали нужны более сложные шейдеры или текстуры анизотропии,
                    // MeshStandardMaterial напрямую это не поддерживает так просто.
                    // Можно добавить карту нормалей, если есть текстура шлифовки.
                });
                break;
        }

        ovenModel.traverse((child) => {
            if (child.isMesh) {
                if (child.material) { 
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
                child.material = ovenMaterial; // Присваиваем новый созданный материал
                child.castShadow = true;
                child.receiveShadow = true; 
            }
        });
        // --- КОНЕЦ ПРИМЕНЕНИЯ МАТЕРИАЛА ---
        // Устанавливаем позицию origin'а модели
        ovenModel.position.set(targetOvenOriginX, targetOvenOriginY, targetOvenOriginZ);
        
        // Масштаб (если модели уже в метрах, то 1,1,1)
        ovenModel.scale.set(1, 1, 1); 
        
        // Вращение (если модели изначально правильно ориентированы, то не нужно)
        // ovenModel.rotation.y = 0; 

        group.add(ovenModel);
    } else {
        console.error(`    [OVEN Model] Модель ${ovenModelFileName} НЕ НАЙДЕНА в кэше! Духовка не будет добавлена.`);
        // Создаем красную заглушку, чтобы было видно проблему
        const placeholderWidth = cabWidthM * 0.8; // Чуть меньше шкафа
        const placeholderHeight = ovenActualHeightM * 0.95; // Чуть меньше реальной духовки
        const placeholderDepth = cabDepthM * 0.7; // Немного не доходит до задней стенки
        
        const placeholderGeo = new THREE.BoxGeometry(placeholderWidth, placeholderHeight, placeholderDepth);
        const placeholderMat = new THREE.MeshBasicMaterial({color: 0xff0000, wireframe: false, name: "OvenErrorPlaceholderMat"});
        const errorPlaceholder = new THREE.Mesh(placeholderGeo, placeholderMat);
        errorPlaceholder.name = "OVEN_ERROR_PLACEHOLDER";

        // Позиционируем ЦЕНТР заглушки
        const placeholderCenterX = targetOvenOriginX;
        const placeholderCenterY = targetOvenOriginY + ovenActualHeightM / 2; // Центр по высоте духовки
        const placeholderCenterZ = targetOvenOriginZ - placeholderDepth / 2; // Центр по глубине заглушки, смещенный от переда
        
        errorPlaceholder.position.set(placeholderCenterX, placeholderCenterY, placeholderCenterZ);
        group.add(errorPlaceholder);
        console.log(`      [OVEN Model] Добавлена красная заглушка вместо модели духовки. Pos: ${errorPlaceholder.position.x.toFixed(3)}, Y=${errorPlaceholder.position.y.toFixed(3)}, Z=${errorPlaceholder.position.z.toFixed(3)}`);
    }
    // --- Конец блока 9 ---
    
    if (group.children.length === 0) { 
        // Если ничего не добавили (например, из-за ошибок или если это заглушка),
        // вернем null, чтобы toggleCabinetDetail знал, что детализация не удалась.
        // console.warn("[createDetailedOvenCabinetGeometry] Группа пуста, возвращаем null.");
        // return null; 
        // Пока оставим возврат группы, чтобы можно было ее видеть.
    }
    return group;
}

/**
 * Создает THREE.Group, представляющую детализированную модель высокого шкафа
 * с духовкой и микроволновкой.
 * @param {object} cabinetData - Объект шкафа из массива 'cabinets'.
 * @returns {THREE.Group | null} Группа со всеми частями шкафа или null при ошибке.
 */
function createDetailedTallOvenMicroGeometry(cabinetData) {
    console.log(`[createDetailedTallOvenMicro] Начало для шкафа: ${cabinetData.mesh?.uuid}, Config: ${cabinetData.cabinetConfig}`);

    if (!cabinetData || cabinetData.cabinetConfig !== 'tallOvenMicro') {
        console.error("[createDetailedTallOvenMicro] Неверные данные шкафа или конфигурация не 'tallOvenMicro'.");
        return null;
    }

    const group = new THREE.Group();
    group.userData.isDetailedCabinet = true;
    group.userData.objectType = 'cabinet';
    group.userData.cabinetType = cabinetData.cabinetType;
    group.userData.cabinetConfig = cabinetData.cabinetConfig;
    const cabinetUUID = cabinetData.mesh?.uuid || THREE.MathUtils.generateUUID();

    // --- Основные размеры и параметры ---
    const panelThicknessM = getPanelThickness();
    const cabWidthM = cabinetData.width;
    const cabHeightM = cabinetData.height;
    const cabDepthM = cabinetData.depth;
    const boxAvailableHeightMeters = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;

    // --- Материалы ---
    const cabinetMaterial = new THREE.MeshStandardMaterial({
        color: cabinetData.initialColor,
        roughness: 0.8,
        metalness: 0.1,
        name: `TallOvenMicroBodyMat_${cabinetUUID.substring(0,4)}`
    });

    // --- 1. ДНО ШКАФА (методом экструзии) ---
    const bottomPanelShapeWidth = cabWidthM;   // Это будет X для Shape (ширина шкафа)
    const bottomPanelShapeDepth = cabDepthM;   // Это будет Y для Shape (глубина шкафа)
    const bottomPanelExtrudeDepth = panelThicknessM; // Это будет глубина экструзии (толщина дна)

    console.log(`  [TallOvenMicro] Дно (экструзия): Shape W (X шкафа)=${bottomPanelShapeWidth.toFixed(3)}, Shape D (Z шкафа)=${bottomPanelShapeDepth.toFixed(3)}, Extrude Depth (Y шкафа - толщина)=${bottomPanelExtrudeDepth.toFixed(3)}`);

    if (bottomPanelShapeWidth <= 0 || bottomPanelShapeDepth <= 0 || bottomPanelExtrudeDepth <= 0) {
        console.error("  [TallOvenMicro] Некорректные размеры для создания дна экструзией.");
    } else {
        // --- Создаем Shape для дна (простой прямоугольник в плоскости XY шейпа) ---
        // Начало координат Shape (0,0) будет соответствовать одному из углов дна.
        // Например, задний левый угол в плоскости XZ шкафа.
        const bottomShape = new THREE.Shape();
        const radius = 0.008; // 8 мм

        // Координаты углов, которые мы будем скруглять
        const corner1X = bottomPanelShapeWidth - 0.08;
        const corner1Y = bottomPanelShapeDepth - 0.04;

        const corner2X = 0.08;
        const corner2Y = bottomPanelShapeDepth - 0.04;

        bottomShape.moveTo(0, 0);
        bottomShape.lineTo(bottomPanelShapeWidth, 0);
        bottomShape.lineTo(bottomPanelShapeWidth, bottomPanelShapeDepth);
        bottomShape.lineTo(corner1X, bottomPanelShapeDepth);

        bottomShape.lineTo(corner1X, corner1Y + radius); // Точка начала первой дуги
        // Первое скругление (правый верхний угол выреза)
        bottomShape.quadraticCurveTo(
            corner1X,       // cpX (вершина угла)
            corner1Y,       // cpY (вершина угла)
            corner1X - radius, // endX
            corner1Y        // endY
        );
        bottomShape.lineTo(corner2X + radius, corner2Y); // Точка начала второй дуги

        bottomShape.quadraticCurveTo(
            corner2X,       // cpX (вершина угла)
            corner2Y,       // cpY (вершина угла)
            corner2X,       // endX
            corner2Y + radius  // endY
        );

        // Линия до передней кромки шкафа (на левой стороне выреза)
        bottomShape.lineTo(0.08, bottomPanelShapeDepth);
        bottomShape.lineTo(0, bottomPanelShapeDepth);
        bottomShape.closePath(); // Замыкаем контур

        const extrudeSettings = {
            steps: 1,
            depth: bottomPanelExtrudeDepth, // Глубина выдавливания = толщина дна
            bevelEnabled: false
        };

        let bottomGeometry = null;
        try {
            bottomGeometry = new THREE.ExtrudeGeometry(bottomShape, extrudeSettings);
        } catch (error) {
            console.error("  [TallOvenMicro] Ошибка создания ExtrudeGeometry для дна:", error);
        }

        if (bottomGeometry) {
            const bottomPanelMesh = new THREE.Mesh(bottomGeometry, cabinetMaterial.clone());
            bottomPanelMesh.name = `bottom_extruded_tall_oven_micro_${cabinetUUID.substring(0,4)}`;
            bottomPanelMesh.userData = {
                isCabinetPart: true,
                objectType: 'cabinetPart',
                panelType: 'bottom', // Можно добавить для идентификации
                orientationType: 'horizontal_extruded', // Указываем, что это экструзия для горизонтальной панели
                cabinetUUID: cabinetUUID
            };

            // --- Позиционирование и ориентация экструдированного дна ---
            //    Поворачиваем на -90 градусов вокруг оси X.
            bottomPanelMesh.rotation.x = -Math.PI / 2;

            // 2. Смещение:
            const posX = -bottomPanelShapeWidth / 2;
            const posY = -cabHeightM / 2 + bottomPanelExtrudeDepth * 0; 
            const posZ = bottomPanelShapeDepth / 2;

            bottomPanelMesh.position.set(
                posX, //x
                posY, //y
                posZ //z
            );

            group.add(bottomPanelMesh);
            console.log(`  [TallOvenMicro] Дно (экструзия) создано и добавлено. Pos: X=${bottomPanelMesh.position.x.toFixed(3)}, Y=${bottomPanelMesh.position.y.toFixed(3)}, Z=${bottomPanelMesh.position.z.toFixed(3)}`);
        } else {
            console.error("  [TallOvenMicro] Не удалось создать геометрию дна экструзией.");
        }
    }
    // --- КОНЕЦ КОДА ДЛЯ ДНА ---

     // --- ОБЩИЕ ПАРАМЕТРЫ ДЛЯ БОКОВИН И ВЫРЕЗОВ ГОЛА ---
    const handleType = kitchenGlobalParams.handleType || 'standard';
    const verticalGolaSetting = cabinetData.verticalGolaProfile || 'none';
    const golaCutDepthFromFront = 0.027; // Глубина "въедания" выреза от переднего торца ВНУТРЬ панели (27 мм)
    const golaCutVerticalLength = 0.070; // Вертикальная длина самого выреза Гола (70 мм)
    let actualGolaHeightMeters = 0;

    if (handleType === 'gola-profile') {
        const boxAvailableHeightMetersForGolaCalc = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;
        const facadeGapMeters = cabinetData.facadeGap || 0.003;
        actualGolaHeightMeters = calculateActualGolaHeight(
            kitchenGlobalParams.golaMinHeightMm,
            facadeGapMeters * 1000,
            boxAvailableHeightMetersForGolaCalc * 1000
        ) / 1000;
        console.log(`  [TallOvenMicro] actualGolaHeightMeters (для расчета фасадов/секций) = ${actualGolaHeightMeters.toFixed(3)}м`);
    }

    // --- НОВАЯ СТРОКА: Объявляем переменные для вырезов левой боковины на уровне функции ---
    let shapeType = 'simple';
    let y_start_cutout1 = -1, y_end_cutout1 = -1;
    let y_start_cutout2 = -1, y_end_cutout2 = -1;
    // ------------------------------------------------------------------------------------

    // --- НАЧАЛО БЛОКА 2: ЛЕВАЯ БОКОВИНА ---
    console.log(`  [TallOvenMicro] Создание ЛЕВОЙ боковины...`);

    // --- 2.1 РАСЧЕТ РАЗМЕРОВ для левой боковины (ваша логика) ---
    const leftSide_Height = cabHeightM - panelThicknessM;
    let leftSide_Depth = cabDepthM;
    const leftSide_Thickness = panelThicknessM;

    if (verticalGolaSetting === 'left' || verticalGolaSetting === 'both') {
        leftSide_Depth = cabDepthM - 0.012;
        // console.log(`    Левая боковина: глубина (X Shape) уменьшена до ${leftSide_Depth.toFixed(3)}м`);
    }
    // console.log(`    Левая боковина: Размеры для Shape: Shape_X (Глубина) = ${leftSide_Depth.toFixed(3)}, Shape_Y (Высота) = ${leftSide_Height.toFixed(3)}. Экструзия (Толщина) = ${leftSide_Thickness.toFixed(3)}`);

    if (leftSide_Height <= 0 || leftSide_Depth <= 0 || leftSide_Thickness <= 0) {
        console.error("  [TallOvenMicro] Некорректные размеры для создания левой боковины.");
    } else {
        // --- 2.2 ОПРЕДЕЛЕНИЕ ТИПА КОНТУРА И РАСЧЕТ Y-КООРДИНАТ ВЫРЕЗОВ ---
        //let shapeType = 'simple'; // 'simple', 'one_cutout', 'two_cutouts'
        //let y_start_cutout1 = -1, y_end_cutout1 = -1;
        //let y_start_cutout2 = -1, y_end_cutout2 = -1;

        const ovenLevel = cabinetData.ovenLevel || 'drawer';
        const underOvenFill = cabinetData.underOvenFill || 'drawers';

        // Горизонтальные вырезы нужны ТОЛЬКО если тип ручек Гола И НЕТ никаких вертикальных Гола-профилей.
        let needsHorizontalGolaCutsLeft = false; // Переименовал для ясности
        if (handleType === 'gola-profile' && verticalGolaSetting === 'none') { // НОВАЯ СТРОКА (изменение условия)
            needsHorizontalGolaCutsLeft = true;                                // НОВАЯ СТРОКА
        }

        if (needsHorizontalGolaCutsLeft) {
            console.log(`    Левая боковина: Горизонтальные вырезы Гола разрешены.`);
            const baseHeightForStandardCuts = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;

            if (ovenLevel === 'drawer' && underOvenFill === 'drawers') {
                shapeType = 'one_cutout';
                // Нижний вырез (cutout1) - как у стандартного нижнего шкафа с 2-мя ящиками
                const heightOfLowestFacadeSectionInBox = (baseHeightForStandardCuts - 2 * actualGolaHeightMeters) / 2 - 58 / 1000 + actualGolaHeightMeters - panelThicknessM;
                y_start_cutout1 = heightOfLowestFacadeSectionInBox;
                y_end_cutout1 = y_start_cutout1 + golaCutVerticalLength;
                y_start_cutout2 = -1; y_end_cutout2 = -1; // Нет второго выреза

            } else if (ovenLevel === 'countertop' && underOvenFill === 'drawers') {
                shapeType = 'two_cutouts';
                // Нижний вырез (cutout1) - как у стандартного нижнего шкафа с 2-мя ящиками
                const heightOfLowestFacadeSectionInBox = (baseHeightForStandardCuts - 2 * actualGolaHeightMeters) / 2 - 58 / 1000 + actualGolaHeightMeters - panelThicknessM;
                y_start_cutout1 = heightOfLowestFacadeSectionInBox;
                y_end_cutout1 = y_start_cutout1 + golaCutVerticalLength;

                // Верхний вырез (cutout2) - над следующей секцией
                y_start_cutout2 = baseHeightForStandardCuts - 0.058 - panelThicknessM;
                y_end_cutout2 = y_start_cutout2 + golaCutVerticalLength;

            } else if (ovenLevel === 'countertop' && underOvenFill === 'swing') {
                shapeType = 'one_cutout';
                // Только один верхний вырез у верха боковины пенала
                y_start_cutout1 = baseHeightForStandardCuts - 0.058 - panelThicknessM;
                y_end_cutout1 = y_start_cutout1 + golaCutVerticalLength;
                y_start_cutout2 = -1; y_end_cutout2 = -1; // Нет второго выреза
            } else {
                shapeType = 'simple'; // Для других комбинаций (или если Гола не используется)
            }

            // Валидация и коррекция вырезов
            const allCuts = [];
            if (y_start_cutout1 !== -1 && y_end_cutout1 > y_start_cutout1 && y_start_cutout1 >= 0 && y_end_cutout1 <= leftSide_Height + 0.0001) {
                allCuts.push({ start: y_start_cutout1, end: y_end_cutout1 });
            } else {
                y_start_cutout1 = -1; y_end_cutout1 = -1;
            }
            if (y_start_cutout2 !== -1 && y_end_cutout2 > y_start_cutout2 && y_start_cutout2 >= 0 && y_end_cutout2 <= leftSide_Height + 0.0001) {
                allCuts.push({ start: y_start_cutout2, end: y_end_cutout2 });
            } else {
                y_start_cutout2 = -1; y_end_cutout2 = -1;
            }

            allCuts.sort((a, b) => a.start - b.start); // Сортируем вырезы по их началу

            // Проверка на пересечение отсортированных вырезов
            for (let k = 0; k < allCuts.length - 1; k++) {
                if (allCuts[k].end > allCuts[k+1].start - 0.0005) { // Если конец одного выреза заходит на начало следующего
                    console.warn(`      Обнаружено пересечение или слишком близкое расположение вырезов Гола. Вырез ${k+1} будет отменен.`);
                    if (allCuts[k+1].start === y_start_cutout1 && allCuts[k+1].end === y_end_cutout1) { y_start_cutout1 = -1; y_end_cutout1 = -1; }
                    if (allCuts[k+1].start === y_start_cutout2 && allCuts[k+1].end === y_end_cutout2) { y_start_cutout2 = -1; y_end_cutout2 = -1; }
                    allCuts.splice(k+1, 1); // Удаляем пересекающийся вырез
                    k--; // Повторяем проверку для текущего индекса, так как массив изменился
                }
            }
            // Обновляем shapeType на основе количества валидных вырезов
            const validCutsCount = allCuts.length;
            if (validCutsCount === 0) shapeType = 'simple';
            else if (validCutsCount === 1) {
                shapeType = 'one_cutout';
                // Переназначаем y_start_cutout1/end1 на единственный валидный вырез
                y_start_cutout1 = allCuts[0].start; y_end_cutout1 = allCuts[0].end;
                y_start_cutout2 = -1; y_end_cutout2 = -1;
            } else if (validCutsCount === 2) {
                shapeType = 'two_cutouts';
                y_start_cutout1 = allCuts[0].start; y_end_cutout1 = allCuts[0].end;
                y_start_cutout2 = allCuts[1].start; y_end_cutout2 = allCuts[1].end;
            }

        } else { // allowHorizontalGolaCuts = false
            shapeType = 'simple';
            console.log(`    Левая боковина: Горизонтальные вырезы Гола НЕ разрешены (из-за verticalGolaSetting или типа ручек). Тип формы: simple.`);
        }


        // --- 2.2.1 СОЗДАНИЕ ФОРМЫ (Shape) на основе shapeType ---
        const leftSideShape = new THREE.Shape();
        const x_front_edge_shape = leftSide_Depth; // X в Shape = глубина боковины
        const x_gola_inner_edge_shape = leftSide_Depth - golaCutDepthFromFront;

        leftSideShape.moveTo(0, 0); // Задний нижний
        leftSideShape.lineTo(0, leftSide_Height); // Задняя кромка до верха
        leftSideShape.lineTo(x_front_edge_shape, leftSide_Height); // Верхняя кромка до переда

        // Рисуем переднюю кромку сверху вниз
        if (shapeType === 'simple') {
            leftSideShape.lineTo(x_front_edge_shape, 0); // Прямая передняя кромка
        } else if (shapeType === 'one_cutout') {
            // Один вырез (используем y_start_cutout1, y_end_cutout1)
            leftSideShape.lineTo(x_front_edge_shape, y_end_cutout1);
            leftSideShape.lineTo(x_gola_inner_edge_shape, y_end_cutout1);
            leftSideShape.lineTo(x_gola_inner_edge_shape, y_start_cutout1);
            leftSideShape.lineTo(x_front_edge_shape, y_start_cutout1);
            leftSideShape.lineTo(x_front_edge_shape, 0);
        } else if (shapeType === 'two_cutouts') {
            // Два выреза (используем y_start_cutout2/end2 для верхнего, y_start_cutout1/end1 для нижнего)
            leftSideShape.lineTo(x_front_edge_shape, y_end_cutout2);    // До верха верхнего выреза
            leftSideShape.lineTo(x_gola_inner_edge_shape, y_end_cutout2); // Вырез 2
            leftSideShape.lineTo(x_gola_inner_edge_shape, y_start_cutout2);
            leftSideShape.lineTo(x_front_edge_shape, y_start_cutout2);

            leftSideShape.lineTo(x_front_edge_shape, y_end_cutout1);    // Прямой участок до верха нижнего выреза
            leftSideShape.lineTo(x_gola_inner_edge_shape, y_end_cutout1); // Вырез 1
            leftSideShape.lineTo(x_gola_inner_edge_shape, y_start_cutout1);
            leftSideShape.lineTo(x_front_edge_shape, y_start_cutout1);

            leftSideShape.lineTo(x_front_edge_shape, 0);                // До низа
        }
        leftSideShape.closePath(); // Замкнет на (0,0)

        // --- 2.3 СОЗДАНИЕ ГЕОМЕТРИИ И МЕША (как было) ---
        const extrudeSettingsSide = { depth: leftSide_Thickness, steps: 1, bevelEnabled: false };
        let leftSideGeometry = null;
        try {
            leftSideGeometry = new THREE.ExtrudeGeometry(leftSideShape, extrudeSettingsSide);
        } catch (error) { /* ... */ }

        if (leftSideGeometry) {
            const leftSideMesh = new THREE.Mesh(leftSideGeometry, cabinetMaterial.clone());
            leftSideMesh.name = `leftSide_ext_tall_oven_micro_${cabinetUUID.substring(0,4)}`;
            leftSideMesh.userData = {
                isCabinetPart: true, objectType: 'cabinetPart', panelType: 'leftSide',
                orientationType: 'vertical_extruded', cabinetUUID: cabinetUUID
            };

            // --- 2.4 ПОВОРОТ для левой боковины (как было) ---
            leftSideMesh.rotation.y = -Math.PI / 2;

            // --- 2.5 ПОЗИЦИОНИРОВАНИЕ левой боковины (вновь отлаженная версия) ---
            const meshPosX = -cabWidthM / 2 + leftSide_Thickness;
            const meshPosY = -cabHeightM / 2 + panelThicknessM; // Низ боковины на уровне верха дна
            const meshPosZ = -cabDepthM / 2;                   // Задний край боковины на заднем крае шкафа

            leftSideMesh.position.set(meshPosX, meshPosY, meshPosZ);

            group.add(leftSideMesh);
            console.log(`      Левая боковина (${shapeType}) создана. Pos: X=${leftSideMesh.position.x.toFixed(3)}, Y=${leftSideMesh.position.y.toFixed(3)}, Z=${leftSideMesh.position.z.toFixed(3)}`);
        }
    }
    // --- КОНЕЦ БЛОКА 2: ЛЕВАЯ БОКОВИНА ---

   // --- НАЧАЛО БЛОКА 3: ПРАВАЯ БОКОВИНА ---
    console.log(`  [TallOvenMicro] Создание ПРАВОЙ боковины...`);

    // --- 3.1 РАСЧЕТ РАЗМЕРОВ для правой боковины ---
    const rightSide_Height = cabHeightM - panelThicknessM; // Y Shape
    let rightSide_Depth = cabDepthM;                    // X Shape (глубина панели)
    const rightSide_Thickness = panelThicknessM;        // Глубина экструзии (толщина панели)

    // Условие для уменьшения глубины правой боковины из-за вертикального Гола
    if (verticalGolaSetting === 'right' || verticalGolaSetting === 'both') {
        rightSide_Depth = cabDepthM - 0.012;
        console.log(`    Правая боковина: глубина (X Shape) уменьшена до ${rightSide_Depth.toFixed(3)}м из-за verticalGola: ${verticalGolaSetting}`);
    }
    // console.log(`    Правая боковина: Размеры для Shape: Shape_X (Глубина) = ${rightSide_Depth.toFixed(3)}, Shape_Y (Высота) = ${rightSide_Height.toFixed(3)}. Экструзия (Толщина) = ${rightSide_Thickness.toFixed(3)}`);

    if (rightSide_Height <= 0 || rightSide_Depth <= 0 || rightSide_Thickness <= 0) {
        console.error("  [TallOvenMicro] Некорректные размеры для создания правой боковины.");
    } else {
        // --- 3.2 ОПРЕДЕЛЕНИЕ ТИПА КОНТУРА И РАСЧЕТ Y-КООРДИНАТ ВЫРЕЗОВ ---
        let shapeType_R = 'simple'; // 'simple', 'one_cutout', 'two_cutouts'
        let y_start_cutout1_R = -1, y_end_cutout1_R = -1;
        let y_start_cutout2_R = -1, y_end_cutout2_R = -1;

        const ovenLevel_R = cabinetData.ovenLevel || 'drawer'; // Используем те же настройки шкафа
        const underOvenFill_R = cabinetData.underOvenFill || 'drawers';

        // Горизонтальные вырезы нужны ТОЛЬКО если тип ручек Гола И НЕТ никаких вертикальных Гола-профилей.
        let needsHorizontalGolaCutsLeft = false; // Переименовал для ясности
        if (handleType === 'gola-profile' && verticalGolaSetting === 'none') { // НОВАЯ СТРОКА (изменение условия)
            needsHorizontalGolaCutsLeft = true;                                // НОВАЯ СТРОКА
        }

        if (needsHorizontalGolaCutsLeft) {
            console.log(`    Правая боковина: Горизонтальные вырезы Гола разрешены.`);
            const baseHeightForStandardCuts_R = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;

            if (ovenLevel_R === 'drawer' && underOvenFill_R === 'drawers') {
                shapeType_R = 'one_cutout'; // Как и для левой, согласно вашему коду
                const heightOfLowestFacadeSectionInBox_R = (baseHeightForStandardCuts_R - 2 * actualGolaHeightMeters) / 2 - 58 / 1000 + actualGolaHeightMeters - panelThicknessM;
                y_start_cutout1_R = heightOfLowestFacadeSectionInBox_R;
                y_end_cutout1_R = y_start_cutout1_R + golaCutVerticalLength;
                y_start_cutout2_R = -1; y_end_cutout2_R = -1;
            } else if (ovenLevel_R === 'countertop' && underOvenFill_R === 'drawers') {
                shapeType_R = 'two_cutouts';
                const heightOfLowestFacadeSectionInBox_R = (baseHeightForStandardCuts_R - 2 * actualGolaHeightMeters) / 2 - 58 / 1000 + actualGolaHeightMeters - panelThicknessM;
                y_start_cutout1_R = heightOfLowestFacadeSectionInBox_R;
                y_end_cutout1_R = y_start_cutout1_R + golaCutVerticalLength;
                y_start_cutout2_R = baseHeightForStandardCuts_R - 0.058 - panelThicknessM;
                y_end_cutout2_R = y_start_cutout2_R + golaCutVerticalLength;
            } else if (ovenLevel_R === 'countertop' && underOvenFill_R === 'swing') {
                shapeType_R = 'one_cutout';
                y_start_cutout1_R = baseHeightForStandardCuts_R - 0.058 - panelThicknessM; // Используем _cutout1 для единственного
                y_end_cutout1_R = y_start_cutout1_R + golaCutVerticalLength;
                y_start_cutout2_R = -1; y_end_cutout2_R = -1;
            } else {
                shapeType_R = 'simple';
            }

            // Валидация и коррекция вырезов для правой боковины
            const allCuts_R = [];
            if (y_start_cutout1_R !== -1 && y_end_cutout1_R > y_start_cutout1_R && y_start_cutout1_R >= 0 && y_end_cutout1_R <= rightSide_Height + 0.0001) {
                allCuts_R.push({ start: y_start_cutout1_R, end: y_end_cutout1_R });
            } else { y_start_cutout1_R = -1; y_end_cutout1_R = -1; }
            if (y_start_cutout2_R !== -1 && y_end_cutout2_R > y_start_cutout2_R && y_start_cutout2_R >= 0 && y_end_cutout2_R <= rightSide_Height + 0.0001) {
                allCuts_R.push({ start: y_start_cutout2_R, end: y_end_cutout2_R });
            } else { y_start_cutout2_R = -1; y_end_cutout2_R = -1; }
            allCuts_R.sort((a, b) => a.start - b.start);
            for (let k = 0; k < allCuts_R.length - 1; k++) {
                if (allCuts_R[k].end > allCuts_R[k+1].start - 0.0005) {
                    if (allCuts_R[k+1].start === y_start_cutout1_R && allCuts_R[k+1].end === y_end_cutout1_R) { y_start_cutout1_R = -1; y_end_cutout1_R = -1; }
                    if (allCuts_R[k+1].start === y_start_cutout2_R && allCuts_R[k+1].end === y_end_cutout2_R) { y_start_cutout2_R = -1; y_end_cutout2_R = -1; }
                    allCuts_R.splice(k+1, 1); k--;
                }
            }
            const validCutsCount_R = allCuts_R.length;
            if (validCutsCount_R === 0) shapeType_R = 'simple';
            else if (validCutsCount_R === 1) {
                shapeType_R = 'one_cutout';
                y_start_cutout1_R = allCuts_R[0].start; y_end_cutout1_R = allCuts_R[0].end;
                y_start_cutout2_R = -1; y_end_cutout2_R = -1;
            } else if (validCutsCount_R === 2) {
                shapeType_R = 'two_cutouts';
                y_start_cutout1_R = allCuts_R[0].start; y_end_cutout1_R = allCuts_R[0].end;
                y_start_cutout2_R = allCuts_R[1].start; y_end_cutout2_R = allCuts_R[1].end;
            }
        } else {
            shapeType_R = 'simple';
            // console.log(`    Правая боковина: Горизонтальные вырезы Гола НЕ разрешены. Тип формы: simple.`);
        }

        // --- 3.2.1 СОЗДАНИЕ ФОРМЫ (Shape) на основе shapeType_R ---
        const rightSideShape = new THREE.Shape();
        const x_front_edge_shape_R = rightSide_Depth;
        const x_gola_inner_edge_shape_R = rightSide_Depth - golaCutDepthFromFront;

        rightSideShape.moveTo(0, 0);
        rightSideShape.lineTo(0, rightSide_Height);
        rightSideShape.lineTo(x_front_edge_shape_R, rightSide_Height);

        if (shapeType_R === 'simple') {
            rightSideShape.lineTo(x_front_edge_shape_R, 0);
        } else if (shapeType_R === 'one_cutout') {
            rightSideShape.lineTo(x_front_edge_shape_R, y_end_cutout1_R);
            rightSideShape.lineTo(x_gola_inner_edge_shape_R, y_end_cutout1_R);
            rightSideShape.lineTo(x_gola_inner_edge_shape_R, y_start_cutout1_R);
            rightSideShape.lineTo(x_front_edge_shape_R, y_start_cutout1_R);
            rightSideShape.lineTo(x_front_edge_shape_R, 0);
        } else if (shapeType_R === 'two_cutouts') {
            rightSideShape.lineTo(x_front_edge_shape_R, y_end_cutout2_R);
            rightSideShape.lineTo(x_gola_inner_edge_shape_R, y_end_cutout2_R);
            rightSideShape.lineTo(x_gola_inner_edge_shape_R, y_start_cutout2_R);
            rightSideShape.lineTo(x_front_edge_shape_R, y_start_cutout2_R);
            rightSideShape.lineTo(x_front_edge_shape_R, y_end_cutout1_R);
            rightSideShape.lineTo(x_gola_inner_edge_shape_R, y_end_cutout1_R);
            rightSideShape.lineTo(x_gola_inner_edge_shape_R, y_start_cutout1_R);
            rightSideShape.lineTo(x_front_edge_shape_R, y_start_cutout1_R);
            rightSideShape.lineTo(x_front_edge_shape_R, 0);
        }
        rightSideShape.closePath();

        // --- 3.3 СОЗДАНИЕ ГЕОМЕТРИИ И МЕША для правой боковины ---
        const extrudeSettingsSideR = { depth: rightSide_Thickness, steps: 1, bevelEnabled: false };
        let rightSideGeometry = null;
        try {
            rightSideGeometry = new THREE.ExtrudeGeometry(rightSideShape, extrudeSettingsSideR);
        } catch (error) { console.error(`    [TallOvenMicro] Ошибка ExtrudeGeometry для правой боковины:`, error); }

        if (rightSideGeometry) {
            const rightSideMesh = new THREE.Mesh(rightSideGeometry, cabinetMaterial.clone());
            rightSideMesh.name = `rightSide_ext_tall_oven_micro_${cabinetUUID.substring(0,4)}`;
            rightSideMesh.userData = {
                isCabinetPart: true, objectType: 'cabinetPart', panelType: 'rightSide',
                orientationType: 'vertical_extruded', cabinetUUID: cabinetUUID
            };

            // --- 3.4 ПОВОРОТ для правой боковины ---
            rightSideMesh.rotation.y = -Math.PI / 2; // Поворот в 

            // --- 3.5 ПОЗИЦИОНИРОВАНИЕ правой боковины ---

            const meshPosX_R = cabWidthM / 2; // Внешняя плоскость боковины (бывшая Z экструзии=thickness) на правом краю шкафа
            const meshPosY_R = -cabHeightM / 2 + panelThicknessM;
            const meshPosZ_R = -cabDepthM / 2;

            rightSideMesh.position.set(meshPosX_R, meshPosY_R, meshPosZ_R);

            group.add(rightSideMesh);
            console.log(`      Правая боковина (${shapeType_R}) создана. Pos: X=${rightSideMesh.position.x.toFixed(3)}, Y=${rightSideMesh.position.y.toFixed(3)}, Z=${rightSideMesh.position.z.toFixed(3)}`);
        }
    }
    // --- КОНЕЦ БЛОКА 3: ПРАВАЯ БОКОВИНА ---
    // --- БЛОКА 4: ГОЛА ПРОФИЛИ ---
    // Материал для Гола-профилей
    const golaMaterial = new THREE.MeshStandardMaterial({
        color: 0xAAAAAA, // Серый алюминий
        metalness: 0.8,
        roughness: 0.4,
        name: `GolaProfileMat_Tall_${cabinetUUID.substring(0,4)}`
    });
    //const golaShapeActualHeightM = 0.058; // Фактическая высота сечения Гола-профиля (58мм)
    // --- 4.1 Горизонтальные Гола-профили ---
    if (handleType === 'gola-profile' && verticalGolaSetting === 'none') {
        const horizontalGolaLength = cabWidthM; // Длина профиля

        if (horizontalGolaLength > 0.01) {
            // Профиль 1 (нижний или единственный)
            if (y_start_cutout1 !== -1) { // Если y_start_cutout1 был рассчитан и он валиден
                const golaProfileMesh1 = createGolaProfileMesh(horizontalGolaLength, golaMaterial, "gola_H_1_tall", cabinetUUID);
                if (golaProfileMesh1) {
                    golaProfileMesh1.rotation.y = Math.PI / 2; // Длина профиля по X шкафа
                    // Позиционирование Y:
                    const gola1_CenterY_Global = (-cabHeightM / 2 + panelThicknessM) + y_start_cutout1;
                    // Позиционирование Z:
                    const gola_Z_rear_plane_Global = cabDepthM / 2;
                    
                    golaProfileMesh1.position.set(0, gola1_CenterY_Global, gola_Z_rear_plane_Global);
                    group.add(golaProfileMesh1);
                    console.log(`      Горизонтальный Гола-1 добавлен. Y=${gola1_CenterY_Global.toFixed(3)}, Z=${gola_Z_rear_plane_Global.toFixed(3)} (Длина: ${horizontalGolaLength.toFixed(3)})`);
                }
            }

            // Профиль 2 (верхний, если есть)
            if (y_start_cutout2 !== -1) { // Если y_start_cutout2 был рассчитан и он валиден
                const golaProfileMesh2 = createGolaProfileMesh(horizontalGolaLength, golaMaterial, "gola_H_2_tall", cabinetUUID);
                if (golaProfileMesh2) {
                    golaProfileMesh2.rotation.y = Math.PI / 2;
                    const gola2_CenterY_Global = (-cabHeightM / 2 + panelThicknessM) + y_start_cutout2;
                    const gola_Z_rear_plane_Global = cabDepthM / 2; // Z такое же

                    golaProfileMesh2.position.set(0, gola2_CenterY_Global, gola_Z_rear_plane_Global);
                    group.add(golaProfileMesh2);
                    console.log(`      Горизонтальный Гола-2 добавлен. Y=${gola2_CenterY_Global.toFixed(3)}, Z=${gola_Z_rear_plane_Global.toFixed(3)} (Длина: ${horizontalGolaLength.toFixed(3)})`);
                }
            }
        } else {
            console.log(`    Горизонтальные Гола-профили не созданы (недостаточная ширина шкафа: ${horizontalGolaLength.toFixed(3)}м).`);
        }
    } else {
        console.log(`    Горизонтальные Гола-профили не требуются (тип ручек: ${handleType}).`);
    }
    // --- КОНЕЦ БЛОКА 4 ---
    // --- НАЧАЛО БЛОКА 5: ПОЛКА ДЛЯ ДУХОВКИ ---
    console.log(`  [TallOvenMicro] Создание ПОЛКИ для духовки...`);

    const ovenLevel = cabinetData.ovenLevel || 'drawer'; // drawer или countertop
    let ovenSupportShelfMesh = null;

    // --- 5.1 Расчет размеров полки ---
    const shelfWidth = cabWidthM - 2 * panelThicknessM;
    const shelfThickness = panelThicknessM; // "Высота" для createPanel
    let shelfDepth;

    if (handleType !== 'gola-profile' || verticalGolaSetting !== 'none') {
        shelfDepth = cabDepthM - 0.040; // Полка короче на 40мм
        console.log(`    Полка (не Гола): глубина = ${cabDepthM.toFixed(3)} - 0.040 = ${shelfDepth.toFixed(3)}м`);
    } else if (handleType === 'gola-profile' && verticalGolaSetting === 'none'){ // handleType === 'gola-profile'
        shelfDepth = cabDepthM - 0.040 - 0.027; // Полка короче на 40мм и еще на 27мм
        console.log(`    Полка (Гола): глубина = ${cabDepthM.toFixed(3)} - 0.040 - 0.027 = ${shelfDepth.toFixed(3)}м`);
    }

    if (shelfWidth <= 0 || shelfThickness <= 0 || shelfDepth <= 0) {
        console.error("  [TallOvenMicro] Некорректные размеры для создания полки духовки.");
    } else {
        // --- 5.2 Расчет Y-координаты ЦЕНТРА полки ---
        let shelf_top_surface_Y_from_side_bottom; // Y ВЕРХНЕЙ плоскости полки от НИЗА БОКОВИНЫ

        if (handleType !== 'gola-profile' || verticalGolaSetting !== 'none') {
            const baseHeightForStandardCuts = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;
            const facadeGapMeters = cabinetData.facadeGap || 0.003;
            // Высота нижнего фасада, если бы это был стандартный нижний шкаф с двумя ящиками и обычными ручками
            const height_of_standard_lower_facade = (baseHeightForStandardCuts - facadeGapMeters * 2) / 2; // Ваша формула
            if (ovenLevel === 'drawer') {
                shelf_top_surface_Y_from_side_bottom = height_of_standard_lower_facade + 0.008; // Ваша формула: ВЕРХ полки
            } else {
                shelf_top_surface_Y_from_side_bottom = height_of_standard_lower_facade * 2 + 0.008 + facadeGapMeters; // Ваша формула: ВЕРХ полки
            }
        } else { // handleType === 'gola-profile'
            // Y ВЕРХА полки = нижняя точка СООТВЕТСТВУЮЩЕГО выреза Гола + высота самого сечения Гола (58мм)
            // Используем y-координаты вырезов левой боковины (left_y_start_cutout1 или left_y_start_cutout2)
            let relevant_gola_cut_bottom_Y;
            if (ovenLevel === 'drawer') {
                // Духовка на уровне первого ящика, значит полка под первым (нижним) Гола-профилем.
                // Гола-профиль будет НАД этой полкой.
                // Значит, ВЕРХ полки = НИЗ первого выреза Гола.
                relevant_gola_cut_bottom_Y = y_start_cutout1; // Это Y низа первого выреза от низа боковины
            } else { // ovenLevel === 'countertop'
                // Духовка на уровне столешницы, значит полка под ВТОРЫМ (верхним) Гола-профилем.
                // ВЕРХ полки = НИЗ второго выреза Гола.
                relevant_gola_cut_bottom_Y = y_start_cutout2; // Это Y низа второго выреза от низа боковины
                // Если второго выреза нет (например, в 'countertop'/'swing'), а духовка сверху,
                // то полка должна быть под единственным верхним вырезом Гола.
                // В этом случае left_y_start_cutout1 будет содержать Y этого единственного верхнего выреза.
                if (relevant_gola_cut_bottom_Y === -1 && y_start_cutout1 !== -1) {
                    relevant_gola_cut_bottom_Y = y_start_cutout1;
                }
            }

            if (relevant_gola_cut_bottom_Y === -1 || relevant_gola_cut_bottom_Y === undefined) {
                console.warn("    Полка (Гола): не удалось определить Y-координату выреза Гола для позиционирования полки. Используется аварийное значение.");
                // Аварийное значение: например, середина высоты боковины минус половина высоты духовки
                const approxOvenHeight = 0.6; // Примерно
                shelf_top_surface_Y_from_side_bottom = leftSide_Height / 2 - approxOvenHeight / 2;
            } else {
                shelf_top_surface_Y_from_side_bottom = relevant_gola_cut_bottom_Y + panelThicknessM + 0.058; // ВЕРХ полки = НИЗ выреза Гола
                console.log(`    Полка (Гола): Y верха полки (от низа боковины) = ${relevant_gola_cut_bottom_Y.toFixed(3)} (низ выреза Гола)`);
            }
        }

        // Глобальная Y-координата центра полки
        const shelfGlobalY_bottom_of_side = -cabHeightM / 2; // Низ шкафа
        const shelfCenterY_Global = shelfGlobalY_bottom_of_side + shelf_top_surface_Y_from_side_bottom - (shelfThickness / 2);

        // --- 5.3 Расчет Z-координаты ЦЕНТРА полки ---
        let shelfCenterZ_Global;
        const cabinetFrontEdgeGlobalZ = cabDepthM / 2;

        if (handleType !== 'gola-profile' || verticalGolaSetting !== 'none') {
            shelfCenterZ_Global = cabinetFrontEdgeGlobalZ - shelfDepth / 2;
            console.log(`    Полка (не Гола): Z-центр = ${cabinetFrontEdgeGlobalZ.toFixed(3)} (перед шкафа) - ${shelfDepth.toFixed(3)}/2 = ${shelfCenterZ_Global.toFixed(3)}м`);
        } else { // handleType === 'gola-profile'
            shelfCenterZ_Global = (cabinetFrontEdgeGlobalZ - 0.028) - shelfDepth / 2;
            console.log(`    Полка (Гола): Z-центр = (${cabinetFrontEdgeGlobalZ.toFixed(3)} (перед шкафа) - 0.028) - ${shelfDepth.toFixed(3)}/2 = ${shelfCenterZ_Global.toFixed(3)}м`);
        }


        // --- 5.4 Создание меша полки ---
            ovenSupportShelfMesh = createPanel(
            shelfWidth,
            shelfThickness, // Толщина полки
            shelfDepth,
            cabinetMaterial, // Используем материал корпуса
            'horizontal',    // Ориентация толщины по Y
            `oven_support_shelf_${cabinetUUID.substring(0,4)}`
        );

        if (ovenSupportShelfMesh) {
            ovenSupportShelfMesh.position.set(0, shelfCenterY_Global, shelfCenterZ_Global);
            ovenSupportShelfMesh.userData.cabinetUUID = cabinetUUID;
            group.add(ovenSupportShelfMesh);
            console.log(`    Полка для духовки создана. Pos: X=0, Y=${shelfCenterY_Global.toFixed(3)}, Z=${shelfCenterZ_Global.toFixed(3)}`);
        } else {
            console.error("  [TallOvenMicro] Не удалось создать меш полки для духовки.");
        }
    }
    // --- КОНЕЦ БЛОКА 5: ПОЛКА ДЛЯ ДУХОВКИ ---
    // --- НАЧАЛО БЛОКА 6: ПОЛКА ДЛЯ МИКРОВОЛНОВКИ ---
    // Эта полка создается, только если есть предыдущая полка (ovenSupportShelfMesh)
    // и если в конфигурации шкафа предусмотрена микроволновка (например, cabinetData.microwaveType !== 'none')
    let microShelfMesh = null;

    if (ovenSupportShelfMesh && (cabinetData.microwaveType && cabinetData.microwaveType !== 'none')) {

        // --- 6.1 Расчет размеров полки для СВЧ ---
        const microShelfWidth = cabWidthM - 2 * panelThicknessM - 0.002; // Зазор по 1мм
        const microShelfThickness = panelThicknessM; // "Высота" для createPanel
        const microShelfDepth = cabDepthM - 0.060;   // Короче на 60мм

        if (microShelfWidth <= 0 || microShelfThickness <= 0 || microShelfDepth <= 0) {
            console.error("  [TallOvenMicro] Некорректные размеры для создания полки СВЧ.");
        } else {
            // --- 6.2 Расчет Y-координаты ЦЕНТРА полки для СВЧ ---
            // Y-координата ВЕРХА полки для духовки (из Блока 5)
            const ovenShelf_TopSurfaceY_Global = ovenSupportShelfMesh.position.y + (ovenSupportShelfMesh.geometry.parameters.height / 2); // shelfThickness / 2

            // Высота самой духовки + небольшой зазор над ней.
            // Используем cabinetData.ovenType для определения высоты духовки.
            let ovenActualMountingHeightM;
            if (cabinetData.ovenType === '600') {
                ovenActualMountingHeightM = 0.595 + 0.001; // 595мм духовка + 1мм зазор
            } else if (cabinetData.ovenType === '450') {
                ovenActualMountingHeightM = 0.450 + 0.001; // 450мм духовка + 1мм зазор
            } else { // Если ovenType не задан или 'none', берем высоту 600мм духовки как худший случай для расчета
                console.warn(`    [TallOvenMicro] Тип духовки (ovenType) не определен или 'none' для расчета высоты под СВЧ. Используется 0.596м.`);
                ovenActualMountingHeightM = 0.380;
            }
            console.log(`    Полка СВЧ: Высота духовки для расчета = ${ovenActualMountingHeightM.toFixed(3)}м`);

            // Низ полки СВЧ будет на уровне верха пространства под духовку
            const microShelf_BottomSurfaceY_Global = ovenShelf_TopSurfaceY_Global + ovenActualMountingHeightM;
            // Центр полки СВЧ
            const microShelfCenterY_Global = microShelf_BottomSurfaceY_Global + microShelfThickness / 2;
            console.log(`    Полка СВЧ: Y верха полки духовки=${ovenShelf_TopSurfaceY_Global.toFixed(3)}, Y низа полки СВЧ=${microShelf_BottomSurfaceY_Global.toFixed(3)}, Y центра полки СВЧ=${microShelfCenterY_Global.toFixed(3)}`);

            // --- 6.3 Расчет Z-координаты ЦЕНТРА полки для СВЧ ---
            // "передний торец полки по переднему торцу шкафа"
            // Это значит, что 60мм отступа сзади.
            const cabinetFrontEdgeGlobalZ = cabDepthM / 2; // Передний край шкафа (внутренний, у боковин)
            const microShelfCenterZ_Global = cabinetFrontEdgeGlobalZ - microShelfDepth / 2;
            console.log(`    Полка СВЧ: Z-центр = ${cabinetFrontEdgeGlobalZ.toFixed(3)} (перед шкафа) - ${microShelfDepth.toFixed(3)}/2 = ${microShelfCenterZ_Global.toFixed(3)}м`);

            // --- 6.4 Создание меша полки для СВЧ ---
                microShelfMesh = createPanel(
                microShelfWidth,
                microShelfThickness,
                microShelfDepth,
                cabinetMaterial, // Используем материал корпуса
                'horizontal',
                `microwave_shelf_${cabinetUUID.substring(0,4)}`
            );

            if (microShelfMesh) {
                microShelfMesh.position.set(0, microShelfCenterY_Global, microShelfCenterZ_Global);
                microShelfMesh.userData.cabinetUUID = cabinetUUID;
                group.add(microShelfMesh);
                console.log(`    Полка для СВЧ создана. Pos: X=0, Y=${microShelfCenterY_Global.toFixed(3)}, Z=${microShelfCenterZ_Global.toFixed(3)}`);
            } else {
                console.error("  [TallOvenMicro] Не удалось создать меш полки для СВЧ.");
            }
        }
    } else {
        if (!ovenSupportShelfMesh) {
            console.log(`  [TallOvenMicro] Полка для СВЧ не создается: отсутствует полка для духовки.`);
        }
        if (!cabinetData.microwaveType || cabinetData.microwaveType === 'none') {
            console.log(`  [TallOvenMicro] Полка для СВЧ не создается: тип СВЧ не указан или 'none'.`);
        }
    }
    // --- КОНЕЦ БЛОКА 6: ПОЛКА ДЛЯ МИКРОВОЛНОВКИ ---
    // --- НАЧАЛО БЛОКА 7: ПОЛКА НАД СВЧ (ДНО ВЕРХНЕЙ СЕКЦИИ) ---
    
    // --- 7.1 Расчет размеров полки ---
    const tsbs_Width = cabWidthM - 2 * panelThicknessM;     // tsbs = Top Section Bottom Shelf
    const tsbs_Thickness = panelThicknessM;                 // "Высота" для createPanel
    const tsbs_Depth = cabDepthM - 0.060 - panelThicknessM;; // Пока считаем
    let topSectionBottomShelfMesh = null;

    if (tsbs_Width <= 0 || tsbs_Thickness <= 0 || tsbs_Depth <= 0) {
        console.error("  [TallOvenMicro] Блок 7: Некорректные размеры для создания дна верхней секции.");
    } else {
        // --- 7.2 Расчет Y-координаты ЦЕНТРА полки ---
        let top_of_space_below_Y_Global; // Верхняя точка пространства ПОД этой полкой

        if (cabinetData.microwaveType && cabinetData.microwaveType !== 'none' && microShelfMesh) {
            // Случай 1: СВЧ ЕСТЬ, и полка для нее была создана
            const microShelf_TopSurfaceY_Global = microShelfMesh.position.y + (microShelfMesh.geometry.parameters.height / 2);
            
            let microwaveActualMountingHeightM;
            if (cabinetData.microwaveType === '362') microwaveActualMountingHeightM = 0.362 + 0; // 362мм СВЧ + 1мм зазор
            else if (cabinetData.microwaveType === '380') microwaveActualMountingHeightM = 0.380 + 0; // 380мм СВЧ + 1мм зазор
            else { // Неизвестный тип СВЧ, берем больший для безопасности
                console.warn(`    [TallOvenMicro] Блок 7: Неизвестный тип СВЧ (${cabinetData.microwaveType}) для расчета высоты. Используется 0.381м.`);
                microwaveActualMountingHeightM = 0.380;
            }
            top_of_space_below_Y_Global = microShelf_TopSurfaceY_Global + microwaveActualMountingHeightM;
            console.log(`    Дно в/секц (СВЧ есть): Y верха полки СВЧ=${microShelf_TopSurfaceY_Global.toFixed(3)}, Высота СВЧ=${microwaveActualMountingHeightM.toFixed(3)}, Y верха пространства под СВЧ=${top_of_space_below_Y_Global.toFixed(3)}`);

        } else {
            // Случай 2: СВЧ НЕТ (или ее полка не создана). Рассчитываем от полки духовки.
            if (!ovenSupportShelfMesh) { // ovenSupportShelfMesh должен быть объявлен на уровне функции
                console.error("  [TallOvenMicro] Блок 7: Ошибка - полка для духовки (ovenSupportShelfMesh) не найдена для расчета позиции дна верхней секции!");
                // В этом случае позиционирование будет некорректным, но попытаемся создать полку хотя бы где-то
                top_of_space_below_Y_Global = 0; // Аварийное значение
            } else {
                const ovenShelf_TopSurfaceY_Global_B7 = ovenSupportShelfMesh.position.y + (ovenSupportShelfMesh.geometry.parameters.height / 2); // Верх полки духовки
                
                let ovenActualMountingHeightM_B7;
                if (cabinetData.ovenType === '600') ovenActualMountingHeightM_B7 = 0.595 + 0.001;
                else if (cabinetData.ovenType === '450') ovenActualMountingHeightM_B7 = 0.450 + 0.001;
                else ovenActualMountingHeightM_B7 = 0.380;

                const imaginary_microShelf_BottomY_Global = ovenShelf_TopSurfaceY_Global_B7 + ovenActualMountingHeightM_B7;
                //const imaginary_microShelf_TopY_Global = imaginary_microShelf_BottomY_Global + panelThicknessM; // Добавляем толщину "воображаемой" полки СВЧ

                // Высота "воображаемой" СВЧ (берем 380мм по умолчанию, если СВЧ нет)
                //const microwaveActualMountingHeightM_default = 0.380 + 0;
                top_of_space_below_Y_Global = imaginary_microShelf_BottomY_Global;
                //console.log(`      Y верха полки дух.=${ovenShelf_TopSurfaceY_Global_B7.toFixed(3)}, Y верха вообр.полки СВЧ=${imaginary_microShelf_TopY_Global.toFixed(3)}, Y верха пространства под СВЧ=${top_of_space_below_Y_Global.toFixed(3)}`);
            }
        }

        // Низ текущей полки (дна верхней секции) будет на top_of_space_below_Y_Global
        const tsbs_CenterY_Global = top_of_space_below_Y_Global + tsbs_Thickness / 2;

        // --- 7.3 Расчет Z-координаты ЦЕНТРА полки ---
        // "передний торец полки по переднему торцу шкафа"
        // Глубина полки tsbs_Depth (сейчас = cabDepthM - 0.060)
        const cabinetFrontEdgeGlobalZ_B7 = cabDepthM / 2;
        const tsbs_CenterZ_Global = cabinetFrontEdgeGlobalZ_B7 - tsbs_Depth / 2;
        // console.log(`    Дно в/секц: Z-центр = ${cabinetFrontEdgeGlobalZ_B7.toFixed(3)} (перед шкафа) - ${tsbs_Depth.toFixed(3)}/2 = ${tsbs_CenterZ_Global.toFixed(3)}м`);

        // --- 7.4 Создание меша полки ---
        topSectionBottomShelfMesh = createPanel(
            tsbs_Width,
            tsbs_Thickness,
            tsbs_Depth,
            cabinetMaterial,
            'horizontal',
            `top_section_bottom_shelf_${cabinetUUID.substring(0,4)}`
        );

        if (topSectionBottomShelfMesh) {
            topSectionBottomShelfMesh.position.set(0, tsbs_CenterY_Global, tsbs_CenterZ_Global);
            topSectionBottomShelfMesh.userData.cabinetUUID = cabinetUUID;
            group.add(topSectionBottomShelfMesh);
            console.log(`    Дно верхней секции создано. Pos: X=0, Y=${tsbs_CenterY_Global.toFixed(3)}, Z=${tsbs_CenterZ_Global.toFixed(3)}`);
        } else {
            console.error("  [TallOvenMicro] Блок 7: Не удалось создать меш дна верхней секции.");
        }
    }
    // --- КОНЕЦ БЛОКА 7: ПОЛКА НАД СВЧ (ДНО ВЕРХНЕЙ СЕКЦИИ) ---
    // --- НАЧАЛО БЛОКА 8: КРЫША ШКАФА ---
    console.log(`  [TallOvenMicro] Создание КРЫШИ шкафа...`);
    let roofMesh = null;

    // --- 8.1 Расчет размеров крыши ---
    const roof_Width = cabWidthM - 2 * panelThicknessM;
    const roof_Thickness = panelThicknessM; // "Высота" для createPanel
    const roof_Depth = cabDepthM - 0.060 - panelThicknessM;   // Такая же глубина, как у полки дна верхней секции

    console.log(`    Крыша: W=${roof_Width.toFixed(3)}, H(толщина)=${roof_Thickness.toFixed(3)}, D=${roof_Depth.toFixed(3)}`);

    if (roof_Width <= 0 || roof_Thickness <= 0 || roof_Depth <= 0) {
        console.error("  [TallOvenMicro] Блок 8: Некорректные размеры для создания крыши.");
    } else {
        // --- 8.2 Расчет Y-координаты ЦЕНТРА крыши ---
        // Верхняя грань крыши на Y_глоб = cabHeightM / 2
        const roof_CenterY_Global = cabHeightM / 2 - roof_Thickness / 2;
        console.log(`    Крыша: Y-центр = ${cabHeightM / 2 .toFixed(3)} (верх шкафа) - ${roof_Thickness.toFixed(3)}/2 = ${roof_CenterY_Global.toFixed(3)}м`);

        // --- 8.3 Расчет Z-координаты ЦЕНТРА крыши ---
        // Передний торец крыши по переднему торцу шкафа, отступ 60мм сзади
        const cabinetFrontEdgeGlobalZ_B8 = cabDepthM / 2;
        const roof_CenterZ_Global = cabinetFrontEdgeGlobalZ_B8 - roof_Depth / 2;
        console.log(`    Крыша: Z-центр = ${cabinetFrontEdgeGlobalZ_B8.toFixed(3)} (перед шкафа) - ${roof_Depth.toFixed(3)}/2 = ${roof_CenterZ_Global.toFixed(3)}м`);

        // --- 8.4 Создание меша крыши ---
        roofMesh = createPanel(
            roof_Width,
            roof_Thickness, // Толщина для createPanel
            roof_Depth,
            cabinetMaterial, // Используем материал корпуса
            'horizontal',    // Ориентация толщины по Y
            `roof_tall_oven_micro_${cabinetUUID.substring(0,4)}`
        );

        if (roofMesh) {
            roofMesh.position.set(0, roof_CenterY_Global, roof_CenterZ_Global); // X=0 (центр шкафа)
            roofMesh.userData.cabinetUUID = cabinetUUID;
            roofMesh.userData.panelType = 'roof'; // Добавляем тип панели
            group.add(roofMesh);
            console.log(`    Крыша создана. Pos: X=0, Y=${roof_CenterY_Global.toFixed(3)}, Z=${roof_CenterZ_Global.toFixed(3)}`);
        } else {
            console.error("  [TallOvenMicro] Блок 8: Не удалось создать меш крыши.");
        }
    }
    // --- КОНЕЦ БЛОКА 8: КРЫША ШКАФА ---
    // --- НАЧАЛО БЛОКА 9: ЗАДНЯЯ СТЕНКА ВЕРХНЕЙ СЕКЦИИ ---
    console.log(`  [TallOvenMicro] Создание ЗАДНЕЙ СТЕНКИ ВЕРХНЕЙ СЕКЦИИ...`);

    // Нам нужен доступ к topSectionBottomShelfMesh из Блока 7
    //let topSectionBottomShelfMesh_from_Block7 = null;
    let tsbs_Thickness_from_Block7 = panelThicknessM; // Дефолт, если полка не найдена
    let tsbs_Depth_from_Block7 = cabDepthM - 0.060 - panelThicknessM;   // Дефолт, если полка не найдена
   

    if (!topSectionBottomShelfMesh) {
        console.error("  [TallOvenMicro] Блок 9: Ошибка - дно верхней секции (topSectionBottomShelfMesh) не найдено! Задняя стенка не будет создана.");
    } else {
        // --- 9.1 Расчет размеров задней стенки ---
        // Ширина такая же, как у дна верхней секции
        const rpots_Width = topSectionBottomShelfMesh.geometry.parameters.width; // rpots = Rear Panel Of Top Section
        
        // Высота: от низа дна верхней секции до верха шкафа, минус 1мм
        const bottom_of_tsbs_Y_Global = topSectionBottomShelfMesh.position.y - (tsbs_Thickness_from_Block7 / 2);
        const top_of_cabinet_Y_Global = cabHeightM / 2;
        const rpots_Height = top_of_cabinet_Y_Global - bottom_of_tsbs_Y_Global - 0.001;

        const rpots_Thickness = panelThicknessM; // Толщина задней стенки (это будет "глубина" для createPanel frontal)

        console.log(`    Задняя стенка в/с: W=${rpots_Width.toFixed(3)}, H=${rpots_Height.toFixed(3)}, Thickness(глубина)=${rpots_Thickness.toFixed(3)}`);

        if (rpots_Width <= 0 || rpots_Height <= 0 || rpots_Thickness <= 0) {
            console.error("  [TallOvenMicro] Блок 9: Некорректные размеры для создания задней стенки верхней секции.");
        } else {
            // --- 9.2 Расчет Y-координаты ЦЕНТРА задней стенки ---
            // Низ задней стенки на уровне низа дна верхней секции
            const rpots_CenterY_Global = bottom_of_tsbs_Y_Global + rpots_Height / 2;
            console.log(`    Задняя стенка в/с: Y-центр = ${bottom_of_tsbs_Y_Global.toFixed(3)} (низ дна в/с) + ${rpots_Height.toFixed(3)}/2 = ${rpots_CenterY_Global.toFixed(3)}м`);

            // --- 9.3 Расчет Z-координаты ЦЕНТРА задней стенки ---
            // Передняя грань задней стенки совпадает с задней гранью дна верхней секции
            const rear_face_of_tsbs_Z_Global = topSectionBottomShelfMesh.position.z - (tsbs_Depth_from_Block7 / 2);
            // Центр задней стенки по Z
            const rpots_CenterZ_Global = rear_face_of_tsbs_Z_Global - rpots_Thickness / 2;
            console.log(`    Задняя стенка в/с: Z-центр = ${rear_face_of_tsbs_Z_Global.toFixed(3)} (зад дна в/с) + ${rpots_Thickness.toFixed(3)}/2 = ${rpots_CenterZ_Global.toFixed(3)}м`);

            // --- 9.4 Создание меша задней стенки ---
            const rearPanelTopSectionMesh = createPanel(
                rpots_Width,
                rpots_Height,
                rpots_Thickness, // Толщина задней стенки (будет глубиной для createPanel с 'frontal')
                cabinetMaterial, // Используем материал корпуса (или специальный материал для задних стенок)
                'frontal',       // Ориентация толщины по Z
                `rear_panel_top_section_${cabinetUUID.substring(0,4)}`
            );

            if (rearPanelTopSectionMesh) {
                rearPanelTopSectionMesh.position.set(0, rpots_CenterY_Global, rpots_CenterZ_Global); // X=0 (центр шкафа)
                rearPanelTopSectionMesh.userData.cabinetUUID = cabinetUUID;
                rearPanelTopSectionMesh.userData.panelType = 'rearPanelTopSection';
                group.add(rearPanelTopSectionMesh);
                console.log(`    Задняя стенка верхней секции создана. Pos: X=0, Y=${rpots_CenterY_Global.toFixed(3)}, Z=${rpots_CenterZ_Global.toFixed(3)}`);
            } else {
                console.error("  [TallOvenMicro] Блок 9: Не удалось создать меш задней стенки верхней секции.");
            }
        }
    }
    // --- КОНЕЦ БЛОКА 9: ЗАДНЯЯ СТЕНКА ВЕРХНЕЙ СЕКЦИИ ---
    // --- НАЧАЛО БЛОКА 10: ВЕРХНИЕ ПОЛКИ (НАД topSectionBottomShelfMesh, ПОД КРЫШЕЙ ШКАФА) ---
    console.log(`  [TallOvenMicro] Блок 9: Создание ВЕРХНИХ ПОЛОК...`);

    // Убедимся, что topSectionBottomShelfMesh существует и имеет геометрию
    if (!topSectionBottomShelfMesh || !topSectionBottomShelfMesh.geometry || !topSectionBottomShelfMesh.geometry.parameters) {
        console.warn("    [TallOvenMicro][Блок 9] topSectionBottomShelfMesh не определена или не имеет корректной геометрии. Верхние полки не будут созданы.");
    } else {
        const topShelvesCount = parseInt(cabinetData.topShelves) || 0; // 'none' или не число станет 0

        if (topShelvesCount > 0) {
            // --- 10.1 Расчет размеров одной полки ---
            const shelfWidth = cabWidthM - 2 * panelThicknessM - 0.002; // -2мм зазор
            const shelfThickness = panelThicknessM; // Толщина полки (это будет высота для createPanel)
            
            // Глубина полки = глубина опорной нижней полки секции минус 5мм
            // Используем параметры геометрии опорной полки
            const supportShelfDepth = topSectionBottomShelfMesh.geometry.parameters.depth;
            const shelfDepth = supportShelfDepth - 0.005;

            console.log(`    [Блок 9] Верхние полки: Кол-во=${topShelvesCount}, W=${shelfWidth.toFixed(3)}, H(толщина)=${shelfThickness.toFixed(3)}, D=${shelfDepth.toFixed(3)}`);

            if (shelfWidth <= 0 || shelfDepth <= 0) {
                console.warn("      [Блок 9] Некорректные размеры для верхних полок (ширина или глубина <= 0). Полки не будут созданы.");
            } else {
                // --- 10.2 Расчет позиций по Y ---
                const cabinetTopGlobalY = cabHeightM / 2; // Верхняя точка всего шкафа-пенала в локальных координатах группы
                
                // Y-координата ВЕРХНЕЙ плоскости опорной полки (topSectionBottomShelfMesh)
                const supportShelfThickness = topSectionBottomShelfMesh.geometry.parameters.height; // Предполагаем, что .height - это толщина
                const topEdgeOfSupportShelfY = topSectionBottomShelfMesh.position.y + supportShelfThickness / 2;

                // Доступная высота для размещения полок: от верха опорной полки до НИЗА КРЫШИ шкафа.
                // Предполагаем, что крыша шкафа (еще не создана в этом коде) будет иметь толщину panelThicknessM.
                const availableHeightForShelves = cabinetTopGlobalY - panelThicknessM - topEdgeOfSupportShelfY;
                console.log(`      [Блок 9] Доступная высота под полки (между опорной и крышей): ${availableHeightForShelves.toFixed(3)}м`);

                // Проверка, достаточно ли места для полок и минимальных зазоров
                // (topShelvesCount * shelfThickness) - общая высота самих полок
                // ((topShelvesCount - 1) * 0.010) - минимальные зазоры МЕЖДУ полками (если полок > 1)
                // (2 * 0.005) - минимальные зазоры над/под крайними полками (по 5мм)
                const minRequiredHeight = (topShelvesCount * shelfThickness) + 
                                        (topShelvesCount > 1 ? (topShelvesCount - 1) * 0.010 : 0) + 
                                        (2 * 0.005);

                if (availableHeightForShelves < minRequiredHeight) {
                    console.warn(`      [Блок 9] Недостаточно доступной высоты (${availableHeightForShelves.toFixed(3)}м) для ${topShelvesCount} полок (требуется мин ${minRequiredHeight.toFixed(3)}м). Полки не будут созданы.`);
                } else {
                    // Расстояние между ЦЕНТРАМИ соседних полок, или между опорной/крышей и центром ближайшей полки
                    const shelfSpacingY_raw = availableHeightForShelves / (topShelvesCount + 1);
                    const shelfSpacingY_mm = Math.round(shelfSpacingY_raw * 1000);
                    const shelfSpacingY = shelfSpacingY_mm / 1000;
                    console.log(`      [Блок 9] Шаг расположения полок (shelfSpacingY): ${shelfSpacingY.toFixed(3)}м (${shelfSpacingY_mm}мм)`);

                    // --- 9.3 Создание полок в цикле ---
                    for (let i = 1; i <= topShelvesCount; i++) {
                        const shelfName = `top_shelf_${i}_tall_oven_micro_${cabinetUUID.substring(0,4)}`;
                        const topShelfMesh = createPanel(
                            shelfWidth,
                            shelfThickness, // высота для createPanel - это толщина полки
                            shelfDepth,
                            cabinetMaterial, // Используем общий материал корпуса
                            'horizontal',    // Ориентация толщины по Y
                            shelfName
                        );

                        if (topShelfMesh) {
                            // Позиционирование
                            const shelfCenterX = 0; // По центру ширины шкафа

                            // Y-координата НИЖНЕЙ плоскости i-й полки, отсчитывая от ВЕРХА опорной полки
                            const bottomPlaneOfCurrentShelfY = topEdgeOfSupportShelfY + (shelfSpacingY * i);
                            // Y-координата ЦЕНТРА i-й полки
                            const shelfCenterY_i = bottomPlaneOfCurrentShelfY - (shelfSpacingY / 2) + (shelfThickness / 2); // Скорректировано для центрирования в своем "слоте"
                                                                                                    // Проще: низ опорной + шаг*i + толщина/2
                            // Пересчет shelfCenterY_i по вашей формуле:
                            // расположение первой полки по Y = topSectionBottomShelfMesh.верхняя грань + шагРасположенияПолок * 1; (это низ полки)
                            // shelfCenterY_i = (topEdgeOfSupportShelfY + shelfSpacingY * i) + shelfThickness / 2;
                            const currentShelfBottomY = topEdgeOfSupportShelfY + shelfSpacingY * i;
                            const currentShelfCenterY = currentShelfBottomY + shelfThickness / 2;


                            // Z-координата ЗАДНЕЙ плоскости i-й полки = задняя плоскость опорной полки
                            const rearFaceZ_SupportShelf = topSectionBottomShelfMesh.position.z - supportShelfDepth / 2;
                            // Z-координата ЦЕНТРА i-й полки
                            const shelfCenterZ_i = rearFaceZ_SupportShelf + shelfDepth / 2;

                            topShelfMesh.position.set(shelfCenterX, currentShelfCenterY, shelfCenterZ_i);
                            topShelfMesh.userData.cabinetUUID = cabinetUUID;
                            group.add(topShelfMesh);
                            console.log(`        [Блок 9] Верхняя полка ${i} создана. Pos: Y=${currentShelfCenterY.toFixed(3)}, Z=${shelfCenterZ_i.toFixed(3)}`);
                        }
                    }
                }
            }
        } else {
            console.log(`    [Блок 9] Верхние полки не требуются (кол-во: ${topShelvesCount}).`);
        }
    }
    // --- КОНЕЦ БЛОКА 10: ВЕРХНИЕ ПОЛКИ ---
    // --- НАЧАЛО БЛОКА 11: ФАСАДЫ ПОД ДУХОВКОЙ ---
    const underOvenFill = cabinetData.underOvenFill || 'drawers';
    const facadeGapMeters = cabinetData.facadeGap / 1;
    // 1. Получение материала и толщины фасада
    const { material: facadeMaterialToClone, thickness: facadeThicknessMeters } = getFacadeMaterialAndThickness(cabinetData);
    const textureDirection = cabinetData.textureDirection || 'vertical';

    // 2. Базовая высота для секции под духовкой (эквивалент высоты фасадов стандартного нижнего короба)
    const baseSectionHeightM = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;

    const tb9HandleHeightMeters = 0.030;
    let facadesToCreateData = []; // { yPosBottom: number, height: number, width: number, addTB9Handle: boolean, namePrefix: string }

    // 3. Определение количества, высот и Y-позиций фасадов
    const facadeWidth = cabWidthM - facadeGapMeters; // Ширина фасада (один общий зазор по бокам шкафа)
    let addTB9Global = (handleType === 'aluminum-tv9');

    if (ovenLevel === 'drawer') {
        // --- Сценарий 1: Духовка на уровне первого ящика (снизу ОДИН фасад) ---
        // Высота этого одного фасада = высота одного фасада стандартного нижнего ящика
        // (если в baseSectionHeightM помещается два ящика и два Гола/ручки/зазора)
        let currentFacadeHeight = 0;
        if (handleType === 'standard') {
            currentFacadeHeight = (baseSectionHeightM - 2 * facadeGapMeters) / 2; // Высота одного из двух фасадов
        } else if (handleType === 'gola-profile') {
            currentFacadeHeight = (baseSectionHeightM - 2 * actualGolaHeightMeters) / 2;
        } else if (handleType === 'aluminum-tv9') {
            currentFacadeHeight = (baseSectionHeightM - 2 * tb9HandleHeightMeters - 2 * facadeGapMeters) / 2;
        }
        
        if (currentFacadeHeight < 0.05) { // Минимальная высота фасада
            console.warn(`      [Блок 11 / Сценарий 1] Расчетная высота фасада (${currentFacadeHeight.toFixed(3)}м) слишком мала. Установлена мин. 0.05м.`);
            currentFacadeHeight = 0.05;
        }

        const yPosBottomFacade = -cabHeightM / 2; // Низ фасада = низ пенала
        facadesToCreateData.push({
            yPosBottom: yPosBottomFacade,
            height: currentFacadeHeight,
            width: facadeWidth,
            addTB9Handle: addTB9Global,
            namePrefix: "bottom_single_facade"
        });

    } else if (ovenLevel === 'countertop') {
        // --- Сценарий 2: Духовка на уровне столешницы ---
        if (underOvenFill === 'drawers') {
            // --- Сценарий 2а: Под духовкой выдвижные ящики (ДВА фасада) ---
            let facadeHeightEach = 0;
            if (handleType === 'standard') {
                facadeHeightEach = (baseSectionHeightM - 2 * facadeGapMeters) / 2;
            } else if (handleType === 'gola-profile') {
                facadeHeightEach = (baseSectionHeightM - 2 * actualGolaHeightMeters) / 2;
            } else if (handleType === 'aluminum-tv9') {
                facadeHeightEach = (baseSectionHeightM - 2 * tb9HandleHeightMeters - 2 * facadeGapMeters) / 2;
            }

            if (facadeHeightEach < 0.05) {
                console.warn(`      [Блок 11 / Сценарий 2а] Расчетная высота фасада ящика (${facadeHeightEach.toFixed(3)}м) слишком мала. Установлена мин. 0.05м.`);
                facadeHeightEach = 0.05;
            }
            
            // Нижний фасад
            const yPosBottomLower = -cabHeightM / 2;
            facadesToCreateData.push({
                yPosBottom: yPosBottomLower,
                height: facadeHeightEach,
                width: facadeWidth,
                addTB9Handle: addTB9Global,
                namePrefix: "bottom_drawer_facade_1"
            });

            // Верхний фасад
            const yTopOfLowerFacade = yPosBottomLower + facadeHeightEach;
            let gapOrHandleAboveLower = 0;
            if (handleType === 'standard') gapOrHandleAboveLower = facadeGapMeters;
            else if (handleType === 'gola-profile') gapOrHandleAboveLower = actualGolaHeightMeters;
            else if (handleType === 'aluminum-tv9') gapOrHandleAboveLower = tb9HandleHeightMeters + facadeGapMeters;
            
            const yPosBottomUpper = yTopOfLowerFacade + gapOrHandleAboveLower;
            facadesToCreateData.push({
                yPosBottom: yPosBottomUpper,
                height: facadeHeightEach, // Второй фасад той же высоты
                width: facadeWidth,
                addTB9Handle: addTB9Global,
                namePrefix: "bottom_drawer_facade_2"
            });

        } else if (underOvenFill === 'swing') {
            // --- Сценарий 2б: Под духовкой распашная дверь (ОДИН фасад) ---
            let swingFacadeHeight = 0;
            if (handleType === 'standard') {
                swingFacadeHeight = baseSectionHeightM - facadeGapMeters; // Зазор сверху
            } else if (handleType === 'gola-profile') {
                swingFacadeHeight = baseSectionHeightM - actualGolaHeightMeters; // Гола сверху
            } else if (handleType === 'aluminum-tv9') {
                swingFacadeHeight = baseSectionHeightM - facadeGapMeters - tb9HandleHeightMeters; // ТВ9 сверху + зазор
            }

            if (swingFacadeHeight < 0.05) {
                console.warn(`      [Блок 11 / Сценарий 2б] Расчетная высота распашного фасада (${swingFacadeHeight.toFixed(3)}м) слишком мала. Установлена мин. 0.05м.`);
                swingFacadeHeight = 0.05;
            }

            const yPosBottomFacade = -cabHeightM / 2;
            facadesToCreateData.push({
                yPosBottom: yPosBottomFacade,
                height: swingFacadeHeight,
                width: facadeWidth,
                addTB9Handle: addTB9Global,
                namePrefix: "bottom_swing_facade"
            });
        }
    }

    // 4. Создание мешей фасадов
    if (facadesToCreateData.length > 0) {
        facadesToCreateData.forEach((facadeData, index) => {
            if (facadeData.height <= 0 || facadeData.width <=0) {
                console.warn(`      Пропуск создания фасада ${index + 1} из-за некорректных размеров: H=${facadeData.height}, W=${facadeData.width}`);
                return; // Пропускаем этот фасад
            }

            const facadeMesh = createPanel(
                facadeData.width,
                facadeData.height,
                facadeThicknessMeters,
                facadeMaterialToClone.clone(), // Клонируем материал для каждого фасада
                'frontal',
                `${facadeData.namePrefix}_${index}_${cabinetUUID.substring(0,4)}`
            );

            if (facadeMesh) {
                // Позиционирование
                facadeMesh.position.x = 0; // Центр по X шкафа
                facadeMesh.position.y = facadeData.yPosBottom + facadeData.height / 2; // Центр фасада по Y
                facadeMesh.position.z = cabDepthM / 2 + facadeThicknessMeters / 2; // Передняя плоскость корпуса + половина толщины фасада

                facadeMesh.userData.cabinetUUID = cabinetUUID;
                facadeMesh.userData.isFacade = true; // Доп. флаг, если нужен
                if (facadeData.addTB9Handle) {
                    facadeMesh.userData.needsTB9Handle = true;
                }

                // --- НАЧАЛО: Логика добавления ручки ТВ9 ---
                if (facadeData.addTB9Handle) { // Этот флаг устанавливался при расчете facadeData
                    facadeMesh.userData.needsTB9Handle = true; // Отмечаем, что у этого фасада должна быть ручка

                    const handleLengthMeters_tv9 = facadeData.width; // Длина ручки = ширина фасада
                    const tb9ProfileWidthMm = 19;  // Ширина сечения профиля ручки по оси "вперед-назад" от фасада
                    const tb9ProfileHeightMm = 30; // Высота сечения профиля ручки

                    const handleShape_tv9 = new THREE.Shape();
                    handleShape_tv9.moveTo(0, 0);              // Низ-зад профиля
                    handleShape_tv9.lineTo(tb9ProfileWidthMm, 0); // Низ-перед
                    handleShape_tv9.lineTo(tb9ProfileWidthMm, tb9ProfileHeightMm); // Верх-перед
                    handleShape_tv9.lineTo(tb9ProfileWidthMm - 1.5, tb9ProfileHeightMm); // Внутрь паза сверху
                    handleShape_tv9.lineTo(tb9ProfileWidthMm - 1.5, 1);               // Вниз по пазу
                    handleShape_tv9.lineTo(0, 1);              // К задней стенке паза
                    handleShape_tv9.closePath();             // Замыкаем на (0,0)

                    const handleExtrudeSettings_tv9 = {
                        steps: 1,
                        depth: handleLengthMeters_tv9 * 1000, // Глубина экструзии в мм
                        bevelEnabled: false
                    };
                    let handleGeometry_tv9 = null;
                    try {
                        handleGeometry_tv9 = new THREE.ExtrudeGeometry(handleShape_tv9, handleExtrudeSettings_tv9);
                        // Центрируем по оси экструзии (длине ручки) и масштабируем в метры
                        handleGeometry_tv9.translate(0, 0, -handleLengthMeters_tv9 * 1000 / 2);
                        handleGeometry_tv9.scale(1 / 1000, 1 / 1000, 1 / 1000);
                    } catch (e) {
                        console.error(`      [Блок 11] Ошибка создания геометрии для ручки ТВ9 фасада ${index + 1}:`, e);
                    }

                    if (handleGeometry_tv9) {
                        const handleMesh_tv9 = new THREE.Mesh(handleGeometry_tv9, golaMaterial.clone()); // Используем golaMaterial или специальный для ручек
                        handleMesh_tv9.name = `handle_TV9_${facadeData.namePrefix}_${index}_${cabinetUUID.substring(0,4)}`;
                        handleMesh_tv9.userData = {
                            isCabinetPart: true,
                            objectType: 'cabinetHandle',
                            handleType: 'tv9',
                            cabinetUUID: cabinetUUID,
                            parentFacadeUUID: facadeMesh.uuid // Связь с фасадом (если нужно)
                        };

                        // Поворот: длина ручки (бывшая Z экструзии) должна идти вдоль X шкафа (ширины фасада)
                        handleMesh_tv9.rotation.y = Math.PI / 2;

                        // Позиционирование:
                        // Ручка крепится СВЕРХУ фасада.
                        // Локальный Y=0 ручки (низ профиля) должен быть на уровне верха фасада.
                        const yTopOfFacade = facadeMesh.position.y + facadeData.height / 2;
                        handleMesh_tv9.position.y = yTopOfFacade;

                        // X ручки совпадает с X фасада (центр)
                        handleMesh_tv9.position.x = facadeMesh.position.x;

                        // Z ручки: задняя плоскость ручки (бывшая X_shape=0) должна быть на передней плоскости фасада.
                        // Передняя плоскость фасада: facadeMesh.position.z + facadeThicknessMeters / 2
                        // Локальная X_shape=0 ручки после rotation.y = PI/2 смотрит в -Z.
                        // Чтобы задняя часть ручки была на передней части фасада:
                        handleMesh_tv9.position.z = facadeMesh.position.z + facadeThicknessMeters / 2;

                        group.add(handleMesh_tv9);
                    }
                }
                // --- КОНЕЦ: Логика добавления ручки ТВ9 ---

                // Применение текстуры
                const actualFacadeMaterial = facadeMesh.material;
                if (actualFacadeMaterial.map && actualFacadeMaterial.map.isTexture) {
                    const transformedTexture = applyTextureTransform(
                        actualFacadeMaterial.map, // Передаем текстуру из СКЛОНИРОВАННОГО материала
                        textureDirection,
                        facadeData.width,
                        facadeData.height
                    );
                    if (transformedTexture) {
                        actualFacadeMaterial.map = transformedTexture; // Применяем НОВУЮ текстуру
                        actualFacadeMaterial.needsUpdate = true;
                    }
                }
                group.add(facadeMesh);
            }
        });
    } else {
        console.log(`    [Блок 11] Фасады под духовкой не создаются согласно конфигурации.`);
    }
    // --- КОНЕЦ БЛОКА 11: ФАСАДЫ ПОД ДУХОВКОЙ ---
    // --- НАЧАЛО БЛОКА 12: ВЕРХНИЙ ФАСАД (НАД СВЧ/ДУХОВКОЙ) ---

    if (!topSectionBottomShelfMesh || !topSectionBottomShelfMesh.geometry || !topSectionBottomShelfMesh.geometry.parameters) {
        console.warn("    [TallOvenMicro][Блок 12] Дно верхней секции (topSectionBottomShelfMesh) не найдено. Верхний фасад не будет создан.");
    } else {
        // 1. Параметры для верхнего фасада
        const topFacadeWidth = cabWidthM - facadeGapMeters; // Ширина фасада (один общий зазор по бокам шкафа, т.к. фасад один)
                                                            // Если бы было 2 фасада, то cabWidthM - 2 * facadeGapMeters
        //const gapAboveTopFacadeM = (cabinetData.gapAboveTopFacadeMm || 3) / 1000; // Зазор над этим фасадом (из настроек)
        // --- ИСПРАВЛЕНИЕ ДЛЯ gapAboveFacadeM ---
        let gapAboveUserValueMm = cabinetData.gapAboveTopFacadeMm;
        if (typeof gapAboveUserValueMm !== 'number' || isNaN(gapAboveUserValueMm)) {
            gapAboveUserValueMm = 3; // Если не число или undefined, ставим дефолт 3 мм
        }
        const gapAboveTopFacadeM = gapAboveUserValueMm / 1000; // Теперь 0 останется 0, а undefined станет 0.003
        // --- КОНЕЦ ИСПРАВЛЕНИЯ ---
        const fixedOverlapLowerM = 0.007; // 7 мм - фиксированный параметр "наезда" или смещения
        const tb9HandleHeightM = 0.030;   // 30 мм - высота ручки ТВ9

        // 2. Расчет ВЫСОТЫ верхнего фасада (topFacadeHeight)
        // Y-координата ВЕРХНЕЙ плоскости шкафа (под крышей, если она есть)
        const y_top_structure_line = cabHeightM / 2; // Предполагаем, что крыша толщиной panelThicknessM будет НАД этой линией

        // Y-координата ВЕРХНЕЙ плоскости дна верхней секции (topSectionBottomShelfMesh)
        const tsbs_Thickness_B12 = topSectionBottomShelfMesh.geometry.parameters.height; // Толщина этой полки
        const y_top_of_tsbs = topSectionBottomShelfMesh.position.y + tsbs_Thickness_B12 / 2;

        let topFacadeHeight;
        if (handleType === 'aluminum-tv9') {
            topFacadeHeight = (y_top_structure_line - gapAboveTopFacadeM - y_top_of_tsbs - tb9HandleHeightM) + fixedOverlapLowerM;
        } else { // standard или gola-profile
            topFacadeHeight = (y_top_structure_line - gapAboveTopFacadeM - y_top_of_tsbs) + fixedOverlapLowerM;
        }

        if (handleType === 'aluminum-tv9') console.log(`      tb9HandleHeightM=${tb9HandleHeightM.toFixed(3)}`);

        if (topFacadeWidth > 0.01 && topFacadeHeight > 0.05) { // Минимальные размеры
            // 3. Создание меша фасада
            const topFacadeMesh = createPanel(
                topFacadeWidth,
                topFacadeHeight,
                facadeThicknessMeters,
                facadeMaterialToClone.clone(),
                'frontal',
                `top_facade_tall_oven_micro_${cabinetUUID.substring(0,4)}`
            );

            if (topFacadeMesh) {
                // 4. Расчет Y-позиции ЦЕНТРА верхнего фасада
                let y_bottom_plane_of_top_facade;
                if (handleType === 'aluminum-tv9') {
                    // нижняя грань фасада на 23 мм ВЫШЕ верхней грани topSectionBottomShelfMesh
                    // 23 мм = 30 мм (высота ручки) - 7 мм (наезд)
                    y_bottom_plane_of_top_facade = y_top_of_tsbs + (tb9HandleHeightM - fixedOverlapLowerM);
                } else { // standard или gola-profile
                    // нижняя грань фасада на 7 мм НИЖЕ верхней грани topSectionBottomShelfMesh
                    y_bottom_plane_of_top_facade = y_top_of_tsbs - fixedOverlapLowerM;
                }
                const topFacadeCenterY = y_bottom_plane_of_top_facade + topFacadeHeight / 2;

                // Позиционирование фасада
                topFacadeMesh.position.x = 0; // Центр по X
                topFacadeMesh.position.y = topFacadeCenterY;
                topFacadeMesh.position.z = cabDepthM / 2 + facadeThicknessMeters / 2;

                topFacadeMesh.userData.cabinetUUID = cabinetUUID;
                topFacadeMesh.userData.isFacade = true;

                // Применение текстуры (как раньше)
                const actualTopFacadeMaterial = topFacadeMesh.material;
                if (actualTopFacadeMaterial.map && actualTopFacadeMaterial.map.isTexture) {
                    const transformedTexture = applyTextureTransform(
                        actualTopFacadeMaterial.map, textureDirection,
                        topFacadeWidth, topFacadeHeight
                    );
                    if (transformedTexture) {
                        actualTopFacadeMaterial.map = transformedTexture;
                        actualTopFacadeMaterial.needsUpdate = true;
                    }
                }
                group.add(topFacadeMesh);

                // 5. Создание ручки ТВ9 (если нужно)
                if (handleType === 'aluminum-tv9') {
                    topFacadeMesh.userData.needsTB9Handle = true;
                    const handleLength_top_tv9 = topFacadeWidth;
                    const tb9ProfileWidthOnFacadeMm = 19; // Ширина профиля ручки, которая "лежит" на фасаде (выступает вперед)
                    const tb9ProfileHeightMm = 30;    // Высота сечения профиля ручки

                    const handleShape_top_tv9 = new THREE.Shape();
                    handleShape_top_tv9.moveTo(0, 0);
                    handleShape_top_tv9.lineTo(tb9ProfileWidthOnFacadeMm, 0);
                    handleShape_top_tv9.lineTo(tb9ProfileWidthOnFacadeMm, tb9ProfileHeightMm);
                    handleShape_top_tv9.lineTo(tb9ProfileWidthOnFacadeMm - 1.5, tb9ProfileHeightMm);
                    handleShape_top_tv9.lineTo(tb9ProfileWidthOnFacadeMm - 1.5, 1);
                    handleShape_top_tv9.lineTo(0, 1);
                    handleShape_top_tv9.closePath();

                    const handleExtrudeSettings_top_tv9 = { depth: handleLength_top_tv9 * 1000, steps: 1, bevelEnabled: false };
                    let handleGeometry_top_tv9 = null;
                    try {
                        handleGeometry_top_tv9 = new THREE.ExtrudeGeometry(handleShape_top_tv9, handleExtrudeSettings_top_tv9);
                        handleGeometry_top_tv9.translate(0, 0, -handleLength_top_tv9 * 1000 / 2);
                        handleGeometry_top_tv9.scale(1 / 1000, 1 / 1000, 1 / 1000);
                    } catch (e) { console.error(`      [Блок 12] Ошибка геометрии ручки ТВ9 для верхнего фасада:`, e); }

                    if (handleGeometry_top_tv9) {
                        const handleMesh_top_tv9 = new THREE.Mesh(handleGeometry_top_tv9, golaMaterial.clone());
                        handleMesh_top_tv9.name = `handle_TV9_top_facade_${cabinetUUID.substring(0,4)}`;
                        handleMesh_top_tv9.userData = { /* ... userData для ручки ... */ };
                        
                        // Поворот ручки:
                        handleMesh_top_tv9.rotation.y = -Math.PI / 2; // Длина ручки (бывшая Z экструзии) вдоль X шкафа
                        handleMesh_top_tv9.rotation.x = Math.PI;     

                        const y_bottom_plane_of_facade = topFacadeMesh.position.y - topFacadeHeight / 2;
                        handleMesh_top_tv9.position.y = y_bottom_plane_of_facade;

                        handleMesh_top_tv9.position.x = topFacadeMesh.position.x; // Центр по X

                        handleMesh_top_tv9.position.z = topFacadeMesh.position.z - facadeThicknessMeters / 2 + 0.019;

                        group.add(handleMesh_top_tv9);
                    }
                }
            }
        } else {
            console.warn(`    [Блок 12] Верхний фасад не создан (ширина или высота некорректны).`);
        }
    }
    // --- КОНЕЦ БЛОКА 12: ВЕРХНИЙ ФАСАД ---
    // --- НАЧАЛО БЛОКА 13: УСТАНОВКА МОДЕЛИ ДУХОВКИ ---
    console.log(`  [TallOvenMicro] Блок 13: Установка МОДЕЛИ ДУХОВКИ...`);

    const ovenTypeSetting = cabinetData.ovenType || '600'; // Дефолт, если не задано
    const ovenColorSetting = cabinetData.ovenColor || 'metallic';

    if (ovenTypeSetting === 'none') {
        console.log("      [Блок 13] Духовка не выбрана (ovenType === 'none'). Модель не будет добавлена.");
    } else if (!ovenSupportShelfMesh || !ovenSupportShelfMesh.geometry || !ovenSupportShelfMesh.geometry.parameters) {
        console.warn("      [Блок 13] Полка для духовки (ovenSupportShelfMesh) не найдена или некорректна. Модель духовки не будет добавлена.");
    } else {
        const ovenModelFileName = `oven_${ovenTypeSetting}.glb`;
        const ovenModel = getPreloadedModelClone(ovenModelFileName);

        if (ovenModel) {
            console.log(`      [Блок 13] Модель духовки ${ovenModelFileName} получена из кэша.`);
            ovenModel.name = `oven_model_${ovenTypeSetting}_tall_${cabinetUUID.substring(0,4)}`;
            ovenModel.userData = {
                isCabinetPart: true,
                objectType: 'appliance_oven',
                cabinetUUID: cabinetUUID
            };

            // --- Создание и применение материала духовки ---
            let ovenMaterialInstance; // Переименовал, чтобы не конфликтовать с cabinetMaterial
            switch (ovenColorSetting) {
                case 'black':
                    ovenMaterialInstance = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.6, name: "OvenBlackMat_Tall" });
                    break;
                case 'white':
                    ovenMaterialInstance = new THREE.MeshStandardMaterial({ color: 0xE5E5E5, metalness: 0.1, roughness: 0.15, name: "OvenWhiteMat_Tall" });
                    break;
                case 'metallic':
                default:
                    ovenMaterialInstance = new THREE.MeshStandardMaterial({ color: 0x7B7B7B, metalness: 0.9, roughness: 0.3, name: "OvenMetallicMat_Tall" });
                    break;
            }
            ovenModel.traverse((child) => {
                if (child.isMesh) {
                    if (child.material) {
                        if (Array.isArray(child.material)) child.material.forEach(mat => mat.dispose());
                        else child.material.dispose();
                    }
                    child.material = ovenMaterialInstance; // Присваиваем один инстанс материала всем частям
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            console.log(`        Материал духовки установлен: ${ovenColorSetting}`);

            // --- Позиционирование модели духовки ---
            // Y-координата НИЗА духовки = верхняя плоскость ovenSupportShelfMesh
            const supportShelfThickness = ovenSupportShelfMesh.geometry.parameters.height;
            const ovenBottomSurfaceY_Global = ovenSupportShelfMesh.position.y + supportShelfThickness / 2;
            
            // Предполагаем, что локальный Y=0 модели духовки - это ее низ.
            const targetOvenOriginY = ovenBottomSurfaceY_Global;
            const targetOvenOriginX = 0; // По центру шкафа
            // Z-координата: передняя плоскость модели духовки (ее локальный Z=0)
            // выровнена по передней плоскости корпуса шкафа.
            const targetOvenOriginZ = cabDepthM / 2; 

            ovenModel.position.set(targetOvenOriginX, targetOvenOriginY, targetOvenOriginZ);
            ovenModel.scale.set(1, 1, 1); // Предполагаем, что модель уже в метрах
            // ovenModel.rotation.set(0, 0, 0); // Если нужно сбросить вращение модели

            group.add(ovenModel);
            console.log(`        Модель духовки ${ovenModelFileName} добавлена. Pos: Y_низ=${targetOvenOriginY.toFixed(3)}, Z_перед=${targetOvenOriginZ.toFixed(3)}`);

        } else {
            console.error(`      [Блок 13] Модель духовки ${ovenModelFileName} НЕ НАЙДЕНА в кэше! Будет создана заглушка.`);
            // Создаем красную заглушку (как в createDetailedOvenCabinetGeometry)
            const ovenActualHeightForPlaceholder = parseFloat(ovenTypeSetting) / 1000 || 0.595;
            const placeholderWidth = cabWidthM * 0.8;
            const placeholderHeight = ovenActualHeightForPlaceholder * 0.95;
            const placeholderDepth = cabDepthM * 0.7;
            
            const placeholderGeo = new THREE.BoxGeometry(placeholderWidth, placeholderHeight, placeholderDepth);
            const placeholderMat = new THREE.MeshBasicMaterial({color: 0xff0000, wireframe: false, name: "OvenErrorPlaceholderMat_Tall"});
            const errorPlaceholder = new THREE.Mesh(placeholderGeo, placeholderMat);
            errorPlaceholder.name = `OVEN_ERROR_PLACEHOLDER_TALL_${ovenTypeSetting}`;

            const supportShelfThickness = ovenSupportShelfMesh.geometry.parameters.height;
            const ovenBottomSurfaceY_Global = ovenSupportShelfMesh.position.y + supportShelfThickness / 2;
            
            const placeholderCenterX = 0;
            const placeholderCenterY = ovenBottomSurfaceY_Global + placeholderHeight / 2; // Центр заглушки по высоте
            const placeholderCenterZ = cabDepthM / 2 - placeholderDepth / 2; // Центр заглушки по глубине
            
            errorPlaceholder.position.set(placeholderCenterX, placeholderCenterY, placeholderCenterZ);
            group.add(errorPlaceholder);
        }
    }
    // --- КОНЕЦ БЛОКА 13: УСТАНОВКА МОДЕЛИ ДУХОВКИ ---
    // --- НАЧАЛО БЛОКА 14: УСТАНОВКА МОДЕЛИ МИКРОВОЛНОВКИ ---
    console.log(`  [TallOvenMicro] Блок 14: Установка МОДЕЛИ МИКРОВОЛНОВКИ...`);

    const microwaveTypeSetting = cabinetData.microwaveType || 'none'; // '362', '380', 'none'
    // Цвет микроволновки берем тот же, что и для духовки (из cabinetData.ovenColor)
    const applianceColorSetting = cabinetData.ovenColor || 'metallic'; // Используем общее или ovenColor

    // microShelfMesh должен был быть создан в Блоке 6
    if (microwaveTypeSetting === 'none') {
        console.log("      [Блок 14] Микроволновка не выбрана (microwaveType === 'none'). Модель не будет добавлена.");
    } else if (!microShelfMesh || !microShelfMesh.geometry || !microShelfMesh.geometry.parameters) {
        console.warn("      [Блок 14] Полка для СВЧ (microShelfMesh) не найдена или некорректна. Модель СВЧ не будет добавлена.");
    } else {
        let microwaveModelFileName = '';
        if (microwaveTypeSetting === '362') {
            microwaveModelFileName = 'mkw_362.glb';
        } else if (microwaveTypeSetting === '380') {
            // Если у вас есть модель для 380мм, укажите ее имя здесь.
            // Пока будем использовать ту же модель, что и для 362, или заглушку.
            console.warn(`      [Блок 14] Модель для микроволновки типа '380' не указана, будет использована 'mkw_362.glb' или заглушка.`);
            microwaveModelFileName = 'mkw_362.glb'; // ЗАГЛУШКА - используем 362, пока нет другой
        } else {
            console.warn(`      [Блок 14] Неизвестный тип микроволновки: ${microwaveTypeSetting}. Модель не будет добавлена.`);
        }

        if (microwaveModelFileName) {
            const microwaveModel = getPreloadedModelClone(microwaveModelFileName);

            if (microwaveModel) {
                console.log(`      [Блок 14] Модель СВЧ ${microwaveModelFileName} получена из кэша.`);
                microwaveModel.name = `microwave_model_${microwaveTypeSetting}_tall_${cabinetUUID.substring(0,4)}`;
                microwaveModel.userData = {
                    isCabinetPart: true,
                    objectType: 'appliance_microwave',
                    cabinetUUID: cabinetUUID
                };

                // --- Создание и применение материала СВЧ (используем ту же логику, что и для духовки) ---
                let microwaveMaterialInstance;
                switch (applianceColorSetting) { // Используем applianceColorSetting
                    case 'black':
                        microwaveMaterialInstance = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.6, name: "MicrowaveBlackMat_Tall" });
                        break;
                    case 'white':
                        microwaveMaterialInstance = new THREE.MeshStandardMaterial({ color: 0xE5E5E5, metalness: 0.1, roughness: 0.15, name: "MicrowaveWhiteMat_Tall" });
                        break;
                    case 'metallic':
                    default:
                        microwaveMaterialInstance = new THREE.MeshStandardMaterial({ color: 0x7B7B7B, metalness: 0.9, roughness: 0.3, name: "MicrowaveMetallicMat_Tall" });
                        break;
                }
                microwaveModel.traverse((child) => {
                    if (child.isMesh) {
                        if (child.material) {
                            if (Array.isArray(child.material)) child.material.forEach(mat => mat.dispose());
                            else child.material.dispose();
                        }
                        child.material = microwaveMaterialInstance;
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                console.log(`        Материал СВЧ установлен: ${applianceColorSetting}`);

                // --- Позиционирование модели СВЧ ---
                // Y-координата НИЗА СВЧ = верхняя плоскость microShelfMesh
                const microShelfThickness = microShelfMesh.geometry.parameters.height;
                const microwaveBottomSurfaceY_Global = microShelfMesh.position.y + microShelfThickness / 2;
                
                const targetMicrowaveOriginY = microwaveBottomSurfaceY_Global;
                const targetMicrowaveOriginX = 0; // По центру шкафа
                // Z-координата: передняя плоскость модели СВЧ (ее локальный Z=0)
                // выровнена по передней плоскости корпуса шкафа.
                const targetMicrowaveOriginZ = cabDepthM / 2; 

                microwaveModel.position.set(targetMicrowaveOriginX, targetMicrowaveOriginY, targetMicrowaveOriginZ);
                microwaveModel.scale.set(1, 1, 1); // Предполагаем, что модель уже в метрах

                group.add(microwaveModel);
                console.log(`        Модель СВЧ ${microwaveModelFileName} добавлена. Pos: Y_низ=${targetMicrowaveOriginY.toFixed(3)}, Z_перед=${targetMicrowaveOriginZ.toFixed(3)}`);

            } else {
                console.error(`      [Блок 14] Модель СВЧ ${microwaveModelFileName} НЕ НАЙДЕНА в кэше! Будет создана заглушка.`);
                // Создаем красную заглушку
                let microwaveActualHeightForPlaceholder = 0.362; // Дефолтная высота для заглушки
                if (microwaveTypeSetting === '380') microwaveActualHeightForPlaceholder = 0.380;
                
                const placeholderWidth = cabWidthM * 0.75; // Чуть уже, чем для духовки
                const placeholderHeight = microwaveActualHeightForPlaceholder * 0.95;
                const placeholderDepth = cabDepthM * 0.6; // Менее глубокая
                
                const placeholderGeo = new THREE.BoxGeometry(placeholderWidth, placeholderHeight, placeholderDepth);
                const placeholderMat = new THREE.MeshBasicMaterial({color: 0xff0000, wireframe: false, name: "MicrowaveErrorPlaceholderMat_Tall"});
                const errorPlaceholder = new THREE.Mesh(placeholderGeo, placeholderMat);
                errorPlaceholder.name = `MICROWAVE_ERROR_PLACEHOLDER_TALL_${microwaveTypeSetting}`;

                const microShelfThickness = microShelfMesh.geometry.parameters.height;
                const microwaveBottomSurfaceY_Global = microShelfMesh.position.y + microShelfThickness / 2;
                
                const placeholderCenterX = 0;
                const placeholderCenterY = microwaveBottomSurfaceY_Global + placeholderHeight / 2;
                const placeholderCenterZ = cabDepthM / 2 - placeholderDepth / 2;
                
                errorPlaceholder.position.set(placeholderCenterX, placeholderCenterY, placeholderCenterZ);
                group.add(errorPlaceholder);
            }
        } // конец if (microwaveModelFileName)
    }
    // --- КОНЕЦ БЛОКА 14: УСТАНОВКА МОДЕЛИ МИКРОВОЛНОВКИ ---

    return group;
}

/**
 * Создает THREE.Group, представляющую детализированную модель шкафа
 * для встроенного холодильника.
 * @param {object} cabinetData - Объект шкафа из массива 'cabinets'.
 * @returns {THREE.Group | null} Группа со всеми частями шкафа или null при ошибке.
 */
function createDetailedFridgeCabinetGeometry(cabinetData) {

    if (!cabinetData || cabinetData.cabinetConfig !== 'fridge') {
        console.error("[createDetailedFridgeCabinet] Неверные данные шкафа или конфигурация не 'fridge'.");
        return null;
    }

    const group = new THREE.Group();
    group.userData.isDetailedCabinet = true;
    group.userData.objectType = 'cabinet';
    group.userData.cabinetType = cabinetData.cabinetType;   // 'straight'
    group.userData.cabinetConfig = cabinetData.cabinetConfig; // 'fridge'
    const cabinetUUID = cabinetData.mesh?.uuid || THREE.MathUtils.generateUUID();

    // --- Основные размеры и параметры ---
    const panelThicknessM = getPanelThickness();
    const cabWidthM = cabinetData.width;
    const cabHeightM = cabinetData.height; // Общая высота пенала
    const cabDepthM = cabinetData.depth;

    const handleType = kitchenGlobalParams.handleType || 'standard';

    // --- Материалы ---
    const cabinetMaterial = new THREE.MeshStandardMaterial({
        color: cabinetData.initialColor,
        roughness: 0.8,
        metalness: 0.1,
        name: `FridgeCabBodyMat_${cabinetUUID.substring(0,4)}`
    });

    // Блоки будут добавляться сюда
    // --- НАЧАЛО БЛОКА 1: ДНО ШКАФА (с вырезом, КОПИЯ из tallOvenMicro) ---
    const bottomPanelShapeWidth = cabWidthM;   // Имя переменной оставляем для совместимости с кодом Shape
    const bottomPanelShapeDepth = cabDepthM;
    const bottomPanelExtrudeDepth = panelThicknessM;

    if (bottomPanelShapeWidth <= 0 || bottomPanelShapeDepth <= 0 || bottomPanelExtrudeDepth <= 0) {
        console.error("    [FridgeCab][Блок 1] Некорректные размеры для создания дна экструзией.");
    } else {
        // Ваш отлаженный код для bottomShape с вырезом и скруглениями
        const bottomShape = new THREE.Shape();
        const radius = 0.008; // 8 мм (или 0.005, как было в предыдущей итерации - используйте ваше финальное значение)
                               // В вашем последнем коде для tallOvenMicro было 0.008

        // Координаты углов, которые мы будем скруглять (отступы по 80мм, вырез 40мм)
        const corner1X = bottomPanelShapeWidth - 0.08;
        const corner1Y = bottomPanelShapeDepth - 0.04; // Y в Shape - это глубина шкафа

        const corner2X = 0.08;
        const corner2Y = bottomPanelShapeDepth - 0.04;

        bottomShape.moveTo(0, 0);                                           // Зад-лево
        bottomShape.lineTo(bottomPanelShapeWidth, 0);                       // Зад-право
        bottomShape.lineTo(bottomPanelShapeWidth, bottomPanelShapeDepth);    // Перед-право
        bottomShape.lineTo(corner1X, bottomPanelShapeDepth);                // Вдоль передней кромки до начала правого "ушка" выреза

        bottomShape.lineTo(corner1X, corner1Y + radius);                    // Вертикально вниз до начала первого скругления
        // Первое скругление (правый "верхний" угол выреза, если смотреть на Shape)
        bottomShape.quadraticCurveTo(
            corner1X,       // cpX (вершина угла)
            corner1Y,       // cpY (вершина угла)
            corner1X - radius, // endX
            corner1Y        // endY
        );
        // Горизонтальная часть выреза
        bottomShape.lineTo(corner2X + radius, corner2Y);                   // До начала второго скругления

        // Второе скругление (левый "верхний" угол выреза)
        bottomShape.quadraticCurveTo(
            corner2X,       // cpX (вершина угла)
            corner2Y,       // cpY (вершина угла)
            corner2X,       // endX
            corner2Y + radius  // endY
        );

        // Вертикальная часть левого "ушка" выреза
        bottomShape.lineTo(0.08, bottomPanelShapeDepth); // До передней кромки шкафа
        bottomShape.lineTo(0, bottomPanelShapeDepth);    // Вдоль передней кромки до левого края
        bottomShape.closePath();                         // Замыкаем контур (на 0,0)

        const extrudeSettings = {
            steps: 1,
            depth: bottomPanelExtrudeDepth, // Глубина выдавливания = толщина дна
            bevelEnabled: false
        };

        let bottomGeometry = null;
        try {
            bottomGeometry = new THREE.ExtrudeGeometry(bottomShape, extrudeSettings);
        } catch (error) {
            console.error("    [FridgeCab][Блок 1] Ошибка создания ExtrudeGeometry для дна:", error);
        }

        if (bottomGeometry) {
            const bottomPanelMesh = new THREE.Mesh(bottomGeometry, cabinetMaterial.clone());
            bottomPanelMesh.name = `bottom_extruded_fridge_${cabinetUUID.substring(0,4)}`; // Изменил имя для Fridge
            bottomPanelMesh.userData = {
                isCabinetPart: true,
                objectType: 'cabinetPart',
                panelType: 'bottom_with_vent', // Тип такой же, раз форма та же
                orientationType: 'horizontal_extruded',
                cabinetUUID: cabinetUUID
            };

            bottomPanelMesh.rotation.x = -Math.PI / 2;

            // Ваше отлаженное позиционирование
            const posX_bottom = -bottomPanelShapeWidth / 2;
            const posY_bottom = -cabHeightM / 2; // Ваш вариант: ... + bottomPanelExtrudeDepth * 0;
            const posZ_bottom = bottomPanelShapeDepth / 2;

            bottomPanelMesh.position.set(posX_bottom, posY_bottom, posZ_bottom);
            group.add(bottomPanelMesh);
        } else {
            console.error("    [FridgeCab][Блок 1] Не удалось создать геометрию дна экструзией.");
        }
    }
    // --- КОНЕЦ БЛОКА 1: ДНО ШКАФА ---
    // --- НАЧАЛО БЛОКА 2: ЛЕВАЯ БОКОВИНА (через createPanel) ---

    // --- 2.1 РАСЧЕТ РАЗМЕРОВ для левой боковины ---
    const leftSideHeight_fridge = cabHeightM - panelThicknessM;
    const leftSideThickness_fridge = panelThicknessM; // Это будет 'width' для createPanel с orientation 'vertical'
    let leftSideDepth_fridge = cabDepthM;         // Это будет 'depth' для createPanel

    if (cabinetData.verticalGolaProfile === 'left' || cabinetData.verticalGolaProfile === 'both') {
        leftSideDepth_fridge = cabDepthM - 0.012;
    }
    // console.log(`    [FridgeCab][Блок 2] Левая боковина: Размеры для createPanel: W(толщина X)=${leftSideThickness_fridge.toFixed(3)}, H(высота Y)=${leftSideHeight_fridge.toFixed(3)}, D(глубина Z)=${leftSideDepth_fridge.toFixed(3)}`);

    if (leftSideHeight_fridge <= 0 || leftSideDepth_fridge <= 0 || leftSideThickness_fridge <= 0) {
        console.error("    [FridgeCab][Блок 2] Некорректные размеры для создания левой боковины.");
    } else {
        // --- 2.2 СОЗДАНИЕ МЕША левой боковины ---
        const leftSideMesh_fridge = createPanel(
            leftSideThickness_fridge, // width для createPanel (толщина боковины по X шкафа)
            leftSideHeight_fridge,    // height для createPanel (высота боковины по Y шкафа)
            leftSideDepth_fridge,     // depth для createPanel (глубина боковины по Z шкафа)
            cabinetMaterial,          // Общий материал корпуса
            'vertical',               // Ориентация: толщина панели задается первым параметром (width)
            `leftSide_panel_fridge_${cabinetUUID.substring(0,4)}`
        );

        if (leftSideMesh_fridge) {
            // --- 2.3 ПОЗИЦИОНИРОВАНИЕ левой боковины ---
            // createPanel размещает локальный (0,0,0) в центре созданного BoxGeometry.

            // X: Внешняя левая плоскость боковины на -cabWidthM / 2.
            const meshPosX = -cabWidthM / 2 + leftSideThickness_fridge / 2;

            // Y: Нижняя плоскость боковины стоит на дне (на высоте -cabHeightM / 2 + panelThicknessM).
            const meshPosY = (-cabHeightM / 2 + panelThicknessM) + leftSideHeight_fridge / 2;

            // Z: Задняя плоскость боковины на -cabDepthM / 2.
            const meshPosZ = -cabDepthM / 2 + leftSideDepth_fridge / 2;

            leftSideMesh_fridge.position.set(meshPosX, meshPosY, meshPosZ);
            
            leftSideMesh_fridge.userData.panelType = 'leftSide_fridge'; // Уточняем тип панели

            group.add(leftSideMesh_fridge);
        } else {
            console.error("    [FridgeCab][Блок 2] Не удалось создать меш левой боковины с помощью createPanel.");
        }
    }
    // --- КОНЕЦ БЛОКА 2: ЛЕВАЯ БОКОВИНА ---
    // --- НАЧАЛО БЛОКА 3: ПРАВАЯ БОКОВИНА (через createPanel) ---

    // --- 3.1 РАСЧЕТ РАЗМЕРОВ для правой боковины ---
    const rightSideHeight_fridge = cabHeightM - panelThicknessM; // Такая же высота, как у левой
    const rightSideThickness_fridge = panelThicknessM;         // Такая же толщина
    let rightSideDepth_fridge = cabDepthM;                     // Начальная глубина

    // Условие для уменьшения глубины правой боковины
    if (cabinetData.verticalGolaProfile === 'right' || cabinetData.verticalGolaProfile === 'both') {
        rightSideDepth_fridge = cabDepthM - 0.012;
    }
    // console.log(`    [FridgeCab][Блок 3] Правая боковина: Размеры для createPanel: W(толщина X)=${rightSideThickness_fridge.toFixed(3)}, H(высота Y)=${rightSideHeight_fridge.toFixed(3)}, D(глубина Z)=${rightSideDepth_fridge.toFixed(3)}`);

    if (rightSideHeight_fridge <= 0 || rightSideDepth_fridge <= 0 || rightSideThickness_fridge <= 0) {
        console.error("    [FridgeCab][Блок 3] Некорректные размеры для создания правой боковины.");
    } else {
        // --- 3.2 СОЗДАНИЕ МЕША правой боковины ---
        const rightSideMesh_fridge = createPanel(
            rightSideThickness_fridge, // width для createPanel (толщина боковины по X шкафа)
            rightSideHeight_fridge,    // height для createPanel (высота боковины по Y шкафа)
            rightSideDepth_fridge,     // depth для createPanel (глубина боковины по Z шкафа)
            cabinetMaterial,           // Общий материал корпуса
            'vertical',                // Ориентация: толщина панели задается первым параметром (width)
            `rightSide_panel_fridge_${cabinetUUID.substring(0,4)}`
        );

        if (rightSideMesh_fridge) {
            // --- 3.3 ПОЗИЦИОНИРОВАНИЕ правой боковины ---
            // X: Внешняя правая плоскость боковины на +cabWidthM / 2.
            const meshPosX_R = cabWidthM / 2 - rightSideThickness_fridge / 2;

            // Y: Такой же, как у левой боковины (стоит на дне, центр по высоте)
            const meshPosY_R = (-cabHeightM / 2 + panelThicknessM) + rightSideHeight_fridge / 2;

            // Z: Такой же, как у левой боковины (задняя плоскость на -cabDepthM / 2, центр по ее актуальной глубине)
            const meshPosZ_R = -cabDepthM / 2 + rightSideDepth_fridge / 2;

            rightSideMesh_fridge.position.set(meshPosX_R, meshPosY_R, meshPosZ_R);
            
            rightSideMesh_fridge.userData.panelType = 'rightSide_fridge'; // Уточняем тип панели

            group.add(rightSideMesh_fridge);
        } else {
            console.error("    [FridgeCab][Блок 3] Не удалось создать меш правой боковины с помощью createPanel.");
        }
    }
    // --- КОНЕЦ БЛОКА 3: ПРАВАЯ БОКОВИНА ---
    // --- ПЕРЕМЕННАЯ ДЛЯ ССЫЛКИ НА ЭТУ ПОЛКУ (дно верхней секции) ---
    let shelfAboveFridgeMesh = null;

    // --- НАЧАЛО БЛОКА 4: ПОЛКА НАД ХОЛОДИЛЬНИКОМ (ДНО ВЕРХНЕЙ СЕКЦИИ) ---
    // Эта полка по конструкции аналогична topSectionBottomShelfMesh из tallOvenMicro

    // --- 4.1 Расчет размеров полки ---
    // Ширина: между боковинами (без доп. зазоров, т.к. это конструктивный элемент - дно секции)
    const shelfWidth_fridgeTop = cabWidthM - 2 * panelThicknessM;
    const shelfThickness_fridgeTop = panelThicknessM; // "Высота" для createPanel

    // Глубина: как у дна верхней секции в tallOvenMicro (общая глубина - 60мм - толщина задней стенки ВЕРХНЕЙ секции)
    const shelfDepth_fridgeTop = cabDepthM - 0.060 - panelThicknessM;


    if (shelfWidth_fridgeTop <= 0 || shelfThickness_fridgeTop <= 0 || shelfDepth_fridgeTop <= 0) {
        console.error("      [FridgeCab][Блок 4] Некорректные размеры для создания полки над холодильником.");
    } else {
        // --- 4.2 Расчет Y-координаты ЦЕНТРА полки ---
        // Y-координата ВЕРХНЕЙ плоскости дна шкафа (созданного в Блоке 1)
        const y_top_of_bottom_panel = -cabHeightM / 2 + panelThicknessM; // Низ шкафа + толщина дна

        const fridgeNicheHeightM = (cabinetData.fridgeNicheHeightMm || 1780) / 1000;
        // console.log(`      [FridgeCab][Блок 4] Y верха дна шкафа=${y_top_of_bottom_panel.toFixed(3)}, Высота ниши=${fridgeNicheHeightM.toFixed(3)}`);

        // Y-координата НИЖНЕЙ плоскости полки над холодильником
        const y_bottom_plane_shelf_above_fridge = y_top_of_bottom_panel + fridgeNicheHeightM;
        // Y-координата ЦЕНТРА полки над холодильником
        const shelfCenterY_fridgeTop = y_bottom_plane_shelf_above_fridge + shelfThickness_fridgeTop / 2;
        // console.log(`      [FridgeCab][Блок 4] Y низа полки над холод.=${y_bottom_plane_shelf_above_fridge.toFixed(3)}, Y центра=${shelfCenterY_fridgeTop.toFixed(3)}`);

        // --- 4.3 Расчет Z-координаты ЦЕНТРА полки ---
        // Передний торец этой полки выравнивается по переднему торцу корпуса шкафа.
        const cabinetFrontEdgeGlobalZ_B4 = cabDepthM / 2; // Передняя плоскость корпуса
        // Центр полки по глубине: от переднего края шкафа смещаемся назад на половину глубины полки
        const shelfCenterZ_fridgeTop = cabinetFrontEdgeGlobalZ_B4 - shelfDepth_fridgeTop / 2;

        // --- 4.4 Создание меша полки ---
        shelfAboveFridgeMesh = createPanel(
            shelfWidth_fridgeTop,
            shelfThickness_fridgeTop,
            shelfDepth_fridgeTop,
            cabinetMaterial,
            'horizontal',
            `shelf_above_fridge_${cabinetUUID.substring(0,4)}`
        );

        if (shelfAboveFridgeMesh) {
            shelfAboveFridgeMesh.position.set(0, shelfCenterY_fridgeTop, shelfCenterZ_fridgeTop);
            shelfAboveFridgeMesh.userData.cabinetUUID = cabinetUUID;
            shelfAboveFridgeMesh.userData.panelType = 'shelf_above_fridge'; // Дно верхней секции
            group.add(shelfAboveFridgeMesh);
        } else {
            console.error("      [FridgeCab][Блок 4] Не удалось создать меш полки над холодильником.");
        }
    }
    // --- КОНЕЦ БЛОКА 4: ПОЛКА НАД ХОЛОДИЛЬНИКОМ ---
    // --- НАЧАЛО БЛОКА 5: КРЫША ШКАФА ---
    let roofMesh_fridge = null; // Переменная для ссылки на меш крыши

    // --- 5.1 Расчет размеров крыши (аналогично полке из Блока 4) ---
    const roofWidth_fridge = cabWidthM - 2 * panelThicknessM;
    const roofThickness_fridge = panelThicknessM; // "Высота" для createPanel
    const roofDepth_fridge = cabDepthM - 0.060 - panelThicknessM; // Такая же глубина, как у полки над холодильником

    if (roofWidth_fridge <= 0 || roofThickness_fridge <= 0 || roofDepth_fridge <= 0) {
        console.error("      [FridgeCab][Блок 5] Некорректные размеры для создания крыши.");
    } else {
        // --- 5.2 Расчет Y-координаты ЦЕНТРА крыши ---
        // Верхняя плоскость крыши должна совпадать с верхней плоскостью шкафа (Y_глоб = cabHeightM / 2)
        const y_top_plane_of_cabinet_B5 = cabHeightM / 2;
        const roofCenterY_fridge = y_top_plane_of_cabinet_B5 - roofThickness_fridge / 2;
        // console.log(`      [FridgeCab][Блок 5] Y верха шкафа=${y_top_plane_of_cabinet_B5.toFixed(3)}, Y центра крыши=${roofCenterY_fridge.toFixed(3)}`);

        // --- 5.3 Расчет Z-координаты ЦЕНТРА крыши (аналогично полке из Блока 4) ---
        // Передний торец крыши выравнивается по переднему торцу корпуса шкафа.
        const cabinetFrontEdgeGlobalZ_B5 = cabDepthM / 2;
        const roofCenterZ_fridge = cabinetFrontEdgeGlobalZ_B5 - roofDepth_fridge / 2;
        // console.log(`      [FridgeCab][Блок 5] Z-центр крыши = ${roofCenterZ_fridge.toFixed(3)}м`);

        // --- 5.4 Создание меша крыши ---
        roofMesh_fridge = createPanel(
            roofWidth_fridge,
            roofThickness_fridge, // Толщина для createPanel
            roofDepth_fridge,
            cabinetMaterial,
            'horizontal',
            `roof_fridge_${cabinetUUID.substring(0,4)}`
        );

        if (roofMesh_fridge) {
            roofMesh_fridge.position.set(0, roofCenterY_fridge, roofCenterZ_fridge); // X=0 (центр шкафа)
            roofMesh_fridge.userData.cabinetUUID = cabinetUUID;
            roofMesh_fridge.userData.panelType = 'roof_fridge'; // Уточняем тип
            group.add(roofMesh_fridge);
        } else {
            console.error("      [FridgeCab][Блок 5] Не удалось создать меш крыши.");
        }
    }
    // --- КОНЕЦ БЛОКА 5: КРЫША ШКАФА ---
    // --- НАЧАЛО БЛОКА 6: ЗАДНЯЯ СТЕНКА ВЕРХНЕЙ СЕКЦИИ (УПРОЩЕННЫЙ ВАРИАНТ) ---

    // Нам нужен shelfAboveFridgeMesh (из Блока 4)
    if (!shelfAboveFridgeMesh || !shelfAboveFridgeMesh.geometry || !shelfAboveFridgeMesh.geometry.parameters) {
        console.warn("    [FridgeCab][Блок 6] Полка над холодильником (shelfAboveFridgeMesh) не найдена. Задняя стенка верхней секции не будет создана.");
    } else {
        // --- 6.1 Расчет размеров задней стенки ---
        const rearPanelWidth_fridgeTopSec = shelfAboveFridgeMesh.geometry.parameters.width;
        const rearPanelThickness_fridgeTopSec = panelThicknessM; // Толщина задней стенки (будет "глубиной" для createPanel 'frontal')

        // Высота: от НИЖНЕЙ грани shelfAboveFridgeMesh до ВЕРХА шкафа (под крышей)
        const y_bottom_plane_shelf_above_fridge = shelfAboveFridgeMesh.position.y - (shelfAboveFridgeMesh.geometry.parameters.height / 2);
        // Верхняя внутренняя граница шкафа (предполагаем, что крыша толщиной panelThicknessM будет НАД этой линией)
        const y_top_interior_cabinet = cabHeightM / 2; 
        // Если крыши не будет или она будет другой толщины, или задняя стенка доходит до самого верха боковин, то:
        // const y_top_interior_cabinet = cabHeightM / 2; // До самого верха боковин

        const rearPanelHeight_fridgeTopSec = y_top_interior_cabinet - y_bottom_plane_shelf_above_fridge;

        if (rearPanelWidth_fridgeTopSec <= 0 || rearPanelHeight_fridgeTopSec <= 0.001 || rearPanelThickness_fridgeTopSec <= 0) { // Допуск для высоты
            console.error("      [FridgeCab][Блок 6] Некорректные размеры для создания задней стенки верхней секции (высота может быть слишком мала).");
        } else {
            // --- 6.2 Расчет Y-координаты ЦЕНТРА задней стенки ---
            const rearPanelCenterY_fridgeTopSec = y_bottom_plane_shelf_above_fridge + rearPanelHeight_fridgeTopSec / 2;

            // --- 6.3 Расчет Z-координаты ЦЕНТРА задней стенки ---
            const z_rear_plane_of_shelf = shelfAboveFridgeMesh.position.y - shelfAboveFridgeMesh.geometry.parameters.depth / 2; // Ошибка здесь, должно быть .position.z
            const z_rear_plane_of_shelf_corrected = shelfAboveFridgeMesh.position.z - shelfAboveFridgeMesh.geometry.parameters.depth / 2;
            const rearPanelCenterZ_fridgeTopSec = z_rear_plane_of_shelf_corrected - rearPanelThickness_fridgeTopSec / 2;

            // --- 6.4 Создание меша задней стенки ---
            const rearPanelTopSectionMesh_fridge = createPanel(
                rearPanelWidth_fridgeTopSec,
                rearPanelHeight_fridgeTopSec,
                rearPanelThickness_fridgeTopSec,
                cabinetMaterial, // Можно использовать более тонкий материал HDF, если он есть
                'frontal',
                `rear_panel_top_section_fridge_${cabinetUUID.substring(0,4)}`
            );

            if (rearPanelTopSectionMesh_fridge) {
                rearPanelTopSectionMesh_fridge.position.set(0, rearPanelCenterY_fridgeTopSec, rearPanelCenterZ_fridgeTopSec);
                rearPanelTopSectionMesh_fridge.userData.cabinetUUID = cabinetUUID;
                rearPanelTopSectionMesh_fridge.userData.panelType = 'rearPanelTopSection_fridge';
                group.add(rearPanelTopSectionMesh_fridge);
            } else {
                console.error("      [FridgeCab][Блок 6] Не удалось создать меш задней стенки верхней секции.");
            }
        }
    }
    // --- КОНЕЦ БЛОКА 6: ЗАДНЯЯ СТЕНКА ВЕРХНЕЙ СЕКЦИИ ---
    // --- НАЧАЛО БЛОКА 7: ПОЛКИ В ВЕРХНЕЙ СЕКЦИИ ---
    if (!shelfAboveFridgeMesh || !shelfAboveFridgeMesh.geometry || !shelfAboveFridgeMesh.geometry.parameters) {
        console.warn("    [FridgeCab][Блок 7] Дно верхней секции (shelfAboveFridgeMesh) не найдено. Полки не будут созданы.");
    } else if (!roofMesh_fridge || !roofMesh_fridge.geometry || !roofMesh_fridge.geometry.parameters) {
        console.warn("    [FridgeCab][Блок 7] Крыша (roofMesh_fridge) не найдена. Полки не будут созданы.");
    } else {
        const topShelvesCount_fridge = parseInt(cabinetData.shelvesAbove) || 0;

        if (topShelvesCount_fridge > 0) {
            // --- 7.1 Расчет размеров одной полки ---
            const shelfW_fridgeTopSec = cabWidthM - 2 * panelThicknessM - 0.002; // Ширина с зазором
            const shelfH_thickness_fridgeTopSec = panelThicknessM;               // Толщина полки
            const shelfD_fridgeTopSec = roofMesh_fridge.geometry.parameters.depth - 0.006; // Глубина less then у крыши (и дна секции) on 5 mm

            if (shelfW_fridgeTopSec <= 0 || shelfD_fridgeTopSec <= 0) {
                console.warn("      [FridgeCab][Блок 7] Некорректные размеры для полок в/с (ширина или глубина <= 0). Полки не будут созданы.");
            } else {
                // --- 7.2 Расчет позиций по Y ---
                const y_top_of_bottom_shelf_of_section = shelfAboveFridgeMesh.position.y + (shelfAboveFridgeMesh.geometry.parameters.height / 2);
                const y_bottom_of_roof_of_section = roofMesh_fridge.position.y - (roofMesh_fridge.geometry.parameters.height / 2);
                
                const availableHeightForShelves_fridge = y_bottom_of_roof_of_section - y_top_of_bottom_shelf_of_section;
                console.log(`      [FridgeCab][Блок 7] Доступная высота для полок в/с: ${availableHeightForShelves_fridge.toFixed(3)}м (между Y=${y_top_of_bottom_shelf_of_section.toFixed(3)} и Y=${y_bottom_of_roof_of_section.toFixed(3)})`);

                const minRequiredHeight_fridge = (topShelvesCount_fridge * shelfH_thickness_fridgeTopSec) +
                                            (topShelvesCount_fridge > 1 ? (topShelvesCount_fridge - 1) * 0.010 : 0) +
                                            (2 * 0.005); // Мин. зазоры сверху/снизу по 5мм

                if (availableHeightForShelves_fridge < minRequiredHeight_fridge) {
                    console.warn(`      [FridgeCab][Блок 7] Недостаточно высоты (${availableHeightForShelves_fridge.toFixed(3)}м) для ${topShelvesCount_fridge} полок (требуется мин ${minRequiredHeight_fridge.toFixed(3)}м).`);
                } else {
                    const shelfSpacingY_fridge_raw = availableHeightForShelves_fridge / (topShelvesCount_fridge + 1);
                    const shelfSpacingY_fridge_mm = Math.round(shelfSpacingY_fridge_raw * 1000);
                    const shelfSpacingY_fridge = shelfSpacingY_fridge_mm / 1000;
                    console.log(`      [FridgeCab][Блок 7] Шаг расположения полок в/с (shelfSpacingY_fridge): ${shelfSpacingY_fridge.toFixed(3)}м`);

                    // --- 7.3 Создание полок в цикле ---
                    for (let i = 1; i <= topShelvesCount_fridge; i++) {
                        const shelfName = `top_section_shelf_${i}_fridge_${cabinetUUID.substring(0,4)}`;
                        const shelfMeshInstance = createPanel(
                            shelfW_fridgeTopSec,
                            shelfH_thickness_fridgeTopSec,
                            shelfD_fridgeTopSec,
                            cabinetMaterial,
                            'horizontal',
                            shelfName
                        );

                        if (shelfMeshInstance) {
                            // Позиционирование Y:
                            const currentShelfBottomYPlane = y_top_of_bottom_shelf_of_section + (shelfSpacingY_fridge * i);
                            const currentShelfCenterY = currentShelfBottomYPlane + shelfH_thickness_fridgeTopSec / 2;

                            // Позиционирование Z (как у дна секции и крыши):
                            const shelfCenterZ_fridgeSec = shelfAboveFridgeMesh.position.z - 0.003; // Центр по Z такой же, как у дна секции

                            shelfMeshInstance.position.set(0, currentShelfCenterY, shelfCenterZ_fridgeSec);
                            shelfMeshInstance.userData.cabinetUUID = cabinetUUID;
                            shelfMeshInstance.userData.panelType = 'top_section_shelf_fridge';
                            group.add(shelfMeshInstance);
                            console.log(`        [FridgeCab][Блок 7] Полка в/с ${i} создана. Pos: Y=${currentShelfCenterY.toFixed(3)}, Z=${shelfCenterZ_fridgeSec.toFixed(3)}`);
                        }
                    }
                }
            }
        } else {
            console.log(`    [FridgeCab][Блок 7] Полки в верхней секции не требуются (кол-во: ${topShelvesCount_fridge}).`);
        }
    }
    // --- КОНЕЦ БЛОКА 7: ПОЛКИ В ВЕРХНЕЙ СЕКЦИИ ---
    // --- НАЧАЛО БЛОКА 8: ФАСАДЫ ШКАФА ХОЛОДИЛЬНИКА ---
    console.log(`  [FridgeCab] Блок 8: Создание ФАСАДОВ...`);

    const fridgeType_B8 = cabinetData.fridgeType || 'double';
    const { material: facadeMaterialToClone_B8, thickness: facadeThicknessMeters_B8 } = getFacadeMaterialAndThickness(cabinetData);
    const textureDirection_B8 = cabinetData.textureDirection || 'vertical';
    const facadeGapM_B8 = (cabinetData.facadeGap || 3 / 1000) ; // Используем сохраненный зазор, дефолт 3мм

    // Общая ширина для всех фасадов
    // Ваше описание: "ширина шкафа минус один зазор между фасадами"
    // Если это означает, что фасад один по ширине и он чуть уже шкафа на величину одного зазора:
    let facadeWidth_B8 = cabWidthM - facadeGapM_B8;
    // Если же имелось в виду, что зазоры по бокам от корпуса, то:
    // facadeWidth_B8 = cabWidthM - 2 * facadeGapM_B8;
    // Оставляю ваш вариант:
    console.log(`    [Блок 8] Общая ширина фасадов: ${facadeWidth_B8.toFixed(3)} (cabWidthM=${cabWidthM.toFixed(3)} - facadeGapM_B8=${facadeGapM_B8.toFixed(3)})`);


    // Z-координата центральной плоскости фасадов
    const facadeCenterZ_B8 = cabDepthM / 2 + facadeThicknessMeters_B8 / 2;

    // Начальная Y-координата для нижней грани первого фасада
    let currentY_bottom_plane_of_facade = -cabHeightM / 2; // Низ шкафа

    const facadesCreationData = []; // { heightMm, nameSuffix, needsTB9HandleAt: 'top' | 'bottom' | 'none' }

    // 1. Фасад морозильной камеры
    if (fridgeType_B8 === 'double' && cabinetData.freezerFacadeHeightMm > 0) {
        facadesCreationData.push({
            heightMm: cabinetData.freezerFacadeHeightMm,
            nameSuffix: "freezer",
            needsTB9HandleAt: handleType === 'aluminum-tv9' ? 'top' : 'none' // ТВ9 обычно сверху морозилки
        });
    }

    // 2. Фасад холодильной камеры
    if (cabinetData.fridgeDoorFacadeHeightMm > 0) {
        facadesCreationData.push({
            heightMm: cabinetData.fridgeDoorFacadeHeightMm,
            nameSuffix: "fridge_door",
            needsTB9HandleAt: handleType === 'aluminum-tv9' ? 'top' : 'none'
        });
    }

    // 3. Верхний фасад №1
    if (cabinetData.topFacade1HeightMm > 0) {
        facadesCreationData.push({
            heightMm: cabinetData.topFacade1HeightMm,
            nameSuffix: "top_1",
            // Для самого верхнего фасада (если он один) ручка ТВ9 снизу. Если их два, то у первого сверху.
            needsTB9HandleAt: handleType === 'aluminum-tv9' ? (cabinetData.topFacade2HeightMm > 0 ? 'top' : 'bottom') : 'none'
        });
    }

    // 4. Верхний фасад №2
    if (cabinetData.topFacade2HeightMm > 0) {
        facadesCreationData.push({
            heightMm: cabinetData.topFacade2HeightMm,
            nameSuffix: "top_2",
            needsTB9HandleAt: handleType === 'aluminum-tv9' ? 'bottom' : 'none' // У самого верхнего ТВ9 снизу
        });
    }

    console.log(`    [Блок 8] Данные для создания фасадов:`, JSON.parse(JSON.stringify(facadesCreationData)));

    facadesCreationData.forEach((facadeInfo, index) => {
        const facadeHeightM = facadeInfo.heightMm / 1000;
        if (facadeHeightM <= 0.01) { // Пропускаем фасады с нулевой или слишком маленькой высотой
            console.log(`      Пропуск фасада ${facadeInfo.nameSuffix} из-за малой высоты: ${facadeHeightM.toFixed(3)}м`);
            return;
        }

        const facadeMesh = createPanel(
            facadeWidth_B8,
            facadeHeightM,
            facadeThicknessMeters_B8,
            facadeMaterialToClone_B8.clone(),
            'frontal',
            `facade_${facadeInfo.nameSuffix}_fridge_${cabinetUUID.substring(0,4)}`
        );

        if (facadeMesh) {
            // Позиционирование
            facadeMesh.position.x = 0;
            facadeMesh.position.y = currentY_bottom_plane_of_facade + facadeHeightM / 2;
            facadeMesh.position.z = facadeCenterZ_B8;

            facadeMesh.userData.cabinetUUID = cabinetUUID;
            facadeMesh.userData.isFacade = true;

            // Применение текстуры
            const actualFacadeMaterial = facadeMesh.material;
            if (actualFacadeMaterial.map && actualFacadeMaterial.map.isTexture) {
                const transformedTexture = applyTextureTransform(
                    actualFacadeMaterial.map, textureDirection_B8,
                    facadeWidth_B8, facadeHeightM
                );
                if (transformedTexture) {
                    actualFacadeMaterial.map = transformedTexture;
                    actualFacadeMaterial.needsUpdate = true;
                }
            }
            group.add(facadeMesh);
            console.log(`      Фасад "${facadeInfo.nameSuffix}" создан. Y_низ=${currentY_bottom_plane_of_facade.toFixed(3)}, H=${facadeHeightM.toFixed(3)}, Y_центр=${facadeMesh.position.y.toFixed(3)}`);

            // Создание ручки ТВ9
            if (facadeInfo.needsTB9HandleAt !== 'none') {
                // Материал для Гола-профилей
                const golaMaterial = new THREE.MeshStandardMaterial({
                    color: 0xAAAAAA, // Серый алюминий
                    metalness: 0.8,
                    roughness: 0.4,
                    name: `GolaProfileMat_Tall_${cabinetUUID.substring(0,4)}`
                });
                
                const handleLength_tv9 = facadeWidth_B8;
                const tb9ProfileWidthOnFacadeMm = 19;
                const tb9ProfileHeightMm = 30;

                const handleShape_tv9 = new THREE.Shape();
                handleShape_tv9.moveTo(0, 0); handleShape_tv9.lineTo(tb9ProfileWidthOnFacadeMm, 0);
                handleShape_tv9.lineTo(tb9ProfileWidthOnFacadeMm, tb9ProfileHeightMm);
                handleShape_tv9.lineTo(tb9ProfileWidthOnFacadeMm - 1.5, tb9ProfileHeightMm);
                handleShape_tv9.lineTo(tb9ProfileWidthOnFacadeMm - 1.5, 1);
                handleShape_tv9.lineTo(0, 1); handleShape_tv9.closePath();

                const handleExtrudeSettings_tv9 = { depth: handleLength_tv9 * 1000, steps: 1, bevelEnabled: false };
                let handleGeometry_tv9 = null;
                try {
                    handleGeometry_tv9 = new THREE.ExtrudeGeometry(handleShape_tv9, handleExtrudeSettings_tv9);
                    handleGeometry_tv9.translate(0, 0, -handleLength_tv9 * 1000 / 2);
                    handleGeometry_tv9.scale(1 / 1000, 1 / 1000, 1 / 1000);
                } catch (e) { console.error(`      [Блок 8] Ошибка геометрии ручки ТВ9 для фасада ${facadeInfo.nameSuffix}:`, e); }

                if (handleGeometry_tv9) {
                    const handleMesh_tv9 = new THREE.Mesh(handleGeometry_tv9, golaMaterial.clone()); // golaMaterial должен быть определен
                    handleMesh_tv9.name = `handle_TV9_${facadeInfo.nameSuffix}_${cabinetUUID.substring(0,4)}`;
                    handleMesh_tv9.userData = { isCabinetPart: true, objectType: 'cabinetHandle', handleType: 'tv9', cabinetUUID: cabinetUUID };
                    handleMesh_tv9.rotation.y = Math.PI / 2; // Длина ручки по X шкафа

                    handleMesh_tv9.position.x = facadeMesh.position.x; // Центр по X
                    // Z: Задняя плоскость ручки на передней плоскости фасада
                    handleMesh_tv9.position.z = facadeMesh.position.z - facadeThicknessMeters_B8 / 2;

                    if (facadeInfo.needsTB9HandleAt === 'top') {
                        // Ручка СВЕРХУ фасада
                        const yTopOfFacade = facadeMesh.position.y + facadeHeightM / 2;
                        handleMesh_tv9.position.y = yTopOfFacade; // Низ ручки на уровне верха фасада
                    } else { // 'bottom'
                        // Ручка СНИЗУ фасада, ПЕРЕВЕРНУТА
                        handleMesh_tv9.rotation.z = Math.PI; // Переворачиваем на 180 градусов вокруг своей оси Z (которая стала Y после первого поворота)
                        const yBottomOfFacade = facadeMesh.position.y - facadeHeightM / 2;
                        handleMesh_tv9.position.y = yBottomOfFacade; // "Верх" перевернутой ручки на уровне низа фасада
                    }
                    group.add(handleMesh_tv9);
                    console.log(`        Ручка ТВ9 для фасада "${facadeInfo.nameSuffix}" (положение: ${facadeInfo.needsTB9HandleAt}) создана.`);
                }
            }
            // Обновляем Y для следующего фасада
            currentY_bottom_plane_of_facade += facadeHeightM + facadeGapM_B8;
        } else {
            console.warn(`      Пропущен фасад ${facadeInfo.nameSuffix} из-за нулевой или некорректной высоты: ${facadeInfo.heightMm}мм`);
        }
    });
    // --- КОНЕЦ БЛОКА 8: ФАСАДЫ ШКАФА ХОЛОДИЛЬНИКА ---
    // Блок 9: Гола-профили (если нужны)

    if (group.children.length === 0) {
         console.warn("[createDetailedFridgeCabinet] Группа пуста после попытки создания всех частей, возможно, были ошибки в размерах.");
         // Можно вернуть простой куб как заглушку, если ничего не создалось
         // const placeholderGeo = new THREE.BoxGeometry(cabWidthM, cabHeightM, cabDepthM);
         // const placeholderMat = new THREE.MeshBasicMaterial({color: 0x00ff00, wireframe: true});
         // const placeholderMesh = new THREE.Mesh(placeholderGeo, placeholderMat);
         // group.add(placeholderMesh);
         // return group;
         // Пока вернем null, если совсем пусто
         if (!(cabWidthM > 0 && cabHeightM > 0 && cabDepthM > 0)) return null;
    }

    return group;
}

/**
 * Создает THREE.Group, представляющую детализированную модель шкафа для посудомойки.
 * @param {object} cabinetData - Объект шкафа из массива 'cabinets'.
 * @returns {THREE.Group | null} Группа со всеми частями шкафа или null при ошибке.
 */
function createDetailedDishwasherGeometry(cabinetData) {
    console.log(`[Dishwasher] Начало детализации для шкафа UUID: ${cabinetData.mesh.uuid}`);

    const group = new THREE.Group();
    group.userData.isDetailedCabinet = true;
    group.userData.objectType = 'cabinet';
    group.userData.cabinetConfig = 'dishwasher'; // Устанавливаем конфиг
    const cabinetUUID = cabinetData.mesh.uuid;

    // --- 1. Основные параметры ---
    const width = cabinetData.width;   // Ширина модуля (ожидается 0.45 или 0.6)
    const height = cabinetData.height; // Высота модуля (высота нижних шкафов)
    const depth = cabinetData.depth;   // Глубина модуля

    const handleType = kitchenGlobalParams.handleType || 'standard';
    const facadeGapM = cabinetData.facadeGap || (3 / 1000);

    // --- Материалы ---
    // Материал для перемычки (из материала корпуса)
    const cabinetMaterial = new THREE.MeshStandardMaterial({
        color: cabinetData.initialColor,
        roughness: 0.8, metalness: 0.1
    });
    // Материал для фасада
    const { material: facadeMaterialToClone, thickness: facadeThicknessMeters } = getFacadeMaterialAndThickness(cabinetData);
    // Материал для ручек/профилей
    const golaMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xAAAAAA, metalness: 0.8, roughness: 0.4 
    });


    // --- 2. Загрузка и размещение 3D-модели посудомойки ---
    // Используем напрямую сохраненную настройку из меню, а не реальную ширину. Это надежнее.
    const dishwasherWidthType = cabinetData.dishwasherWidth || '600'; // '450' или '600'. '600' - значение по умолчанию
    const dishwasherModelFileName = `dishwasher_${dishwasherWidthType}.glb`; // dishwasher_450.glb или dishwasher_600.glb

    const dishwasherModel = getPreloadedModelClone(dishwasherModelFileName);

    if (dishwasherModel) {
        console.log(`[Dishwasher] Модель ${dishwasherModelFileName} получена из кэша.`);
        dishwasherModel.name = `dishwasher_model_${cabinetUUID.substring(0, 4)}`;
        dishwasherModel.userData = { isCabinetPart: true, objectType: 'appliance_dishwasher', cabinetUUID: cabinetUUID };
        
        // Позиционируем модель. Origin модели (0,0,0) должен быть в левом нижнем переднем углу.
        // Ставим ее на "пол" внутри габаритного куба
        const modelX = -width / 2 + dishwasherWidthType / 2000;
        const modelY = -height / 2 - kitchenGlobalParams.plinthHeight / 1000;
        // Центрируем по ширине и сдвигаем к передней части
        const modelZ = depth / 2; // Предполагаем, что глубина модели посудомойки ~600мм
        dishwasherModel.position.set(modelX, modelY, modelZ);
        
        // Масштабирование, если нужно. Если модели в метрах, то 1,1,1.
        dishwasherModel.scale.set(1, 1, 1);
                // --- ИЗМЕНЕНИЕ 3: Применение материала металла к модели ---
        dishwasherModel.traverse((child) => {
            if (child.isMesh) {
                // Опционально: освобождаем старые материалы, чтобы избежать утечек памяти
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
                // Присваиваем новый материал (клонируем на всякий случай)
                child.material = golaMaterial.clone(); 
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        group.add(dishwasherModel);

    } else {
        console.error(`[Dishwasher] Модель ${dishwasherModelFileName} НЕ НАЙДЕНА в кэше!`);
        // Можно создать красную заглушку, как в функции для духовки, чтобы было видно ошибку
        const placeholderGeo = new THREE.BoxGeometry(width * 0.9, height * 0.9, depth * 0.9);
        const placeholderMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
        const errorPlaceholder = new THREE.Mesh(placeholderGeo, placeholderMat);
        errorPlaceholder.name = "DISHWASHER_ERROR_PLACEHOLDER";
        group.add(errorPlaceholder);
    }


    // --- 3. Расчет размеров и создание фасада ---
    // Эта логика полностью заимствована из createDetailedCabinetGeometry для 'swing'
    let facadeHeight = 0;
    let facadeCenterYOffset = 0;
    const tb9HandleHeightMeters = 30 / 1000;

    if (handleType === 'aluminum-tv9') {
        // Высота = общая высота - зазор под ручкой - высота ручки
        facadeHeight = height - facadeGapM - tb9HandleHeightMeters;
        // Смещение центра фасада вниз
        facadeCenterYOffset = -(facadeGapM + tb9HandleHeightMeters) / 2;
    } else if (handleType === 'gola-profile') {
        // Рассчитываем актуальную высоту Гола (как в вашей функции)
        const boxAvailableHeightMeters = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;
        const minGolaHeightMeters = (kitchenGlobalParams.golaMinHeightMm || 30) / 1000;
        const actualGolaHeightMeters = calculateActualGolaHeight(
            minGolaHeightMeters * 1000, facadeGapM * 1000, boxAvailableHeightMeters * 1000
        ) / 1000;

        facadeHeight = height - actualGolaHeightMeters;
        facadeCenterYOffset = -actualGolaHeightMeters / 2;
    } else { // 'standard'
        facadeHeight = height - facadeGapM;
        facadeCenterYOffset = -facadeGapM / 2;
    }

    if (facadeHeight <= 0) {
        console.error(`[Dishwasher] Расчетная высота фасада <= 0: ${facadeHeight}`);
    } else {
        // Для посудомойки всегда один фасад
        const facadeWidth = width - facadeGapM; // Зазор по бокам

        const facadeMesh = createPanel(
            facadeWidth, facadeHeight, facadeThicknessMeters,
            facadeMaterialToClone, // Передаем материал для клонирования
            'frontal', `facade_dishwasher`
        );

        if (facadeMesh) {
            // Позиция фасада: спереди шкафа
            const facadeCenterZ = depth / 2 + facadeThicknessMeters / 2;
            facadeMesh.position.set(0, facadeCenterYOffset, facadeCenterZ); // X=0 т.к. один фасад
            facadeMesh.userData.cabinetUUID = cabinetUUID;

            // Наложение текстуры (как в вашей функции)
            const actualFacadeMaterial = facadeMesh.material;
            if (actualFacadeMaterial.map?.isTexture) {
                const textureDirection = cabinetData.textureDirection || 'vertical';
                const transformedTexture = applyTextureTransform(
                    actualFacadeMaterial.map, textureDirection, facadeWidth, facadeHeight
                );
                actualFacadeMaterial.map = transformedTexture;
                actualFacadeMaterial.needsUpdate = true;
            }
            group.add(facadeMesh);

            // --- 4. Создание ручки (Gola или TV9), если требуется ---
            if (handleType === 'gola-profile') {
                const golaProfileMesh = createGolaProfileMesh(width, golaMaterial, `golaProfile_Dishwasher`, cabinetUUID);
                if (golaProfileMesh) {
                    golaProfileMesh.rotation.y = Math.PI / 2;
                    // Y позиция такая же, как у верхнего профиля в createDetailedCabinetGeometry
                    const golaTopCenterY = height / 2 - 58 / 1000; 
                    const golaTopCenterZ = depth / 2; // Передняя грань шкафа
                    golaProfileMesh.position.set(0, golaTopCenterY, golaTopCenterZ);
                    group.add(golaProfileMesh);
                }
            } else if (handleType === 'aluminum-tv9') {
                // Код для ручки TV9, адаптированный из вашей функции
                // ... (Вставьте сюда ваш код создания геометрии ручки TB9) ...
                // ВАЖНО: я предполагаю, что у вас есть готовый код для создания геометрии ручки.
                // Я просто напишу логику ее позиционирования.
                
                const handleWidthMm = 19; // Ширина профиля ручки
                const handleHeightMm = 30; // Высота профиля ручки = 30
                const handleLengthMeters = width; // Длина ручки = ширина фасада

                // Создаем Shape ручки (простой прямоугольник)
                const handleShape = new THREE.Shape();
                handleShape.moveTo(0, 0);
                handleShape.lineTo(handleWidthMm, 0);
                handleShape.lineTo(handleWidthMm, handleHeightMm);
                handleShape.lineTo(handleWidthMm - 1.5, handleHeightMm);
                handleShape.lineTo(handleWidthMm - 1.5, 1);
                handleShape.lineTo(0, 1);
                handleShape.closePath();
                const handleExtrudeSettings = {
                    steps: 1,
                    depth: handleLengthMeters * 1000, // Глубина экструзии в мм
                    bevelEnabled: false
                };
                let handleGeometry = null; 
                try {
                    handleGeometry = new THREE.ExtrudeGeometry(handleShape, handleExtrudeSettings);
                    // Центрируем по Z (оси выдавливания) и масштабируем
                    handleGeometry.translate(0, 0, -handleLengthMeters * 1000 / 2);
                    handleGeometry.scale(1/1000, 1/1000, 1/1000);
                } catch (e) { console.error("Ошибка создания геометрии ручки TB9:", e); }

                if (handleGeometry) {
                    const handleMesh = new THREE.Mesh(handleGeometry, golaMaterial.clone()); 
                    handleMesh.rotation.y = Math.PI / 2;
                    const facadeTopY = facadeCenterYOffset + facadeHeight / 2;
                    const handleCenterY = facadeTopY; // Уточнено, ручка на уровне верха фасада
                    const handleCenterX = 0;
                    const handleCenterZ = facadeCenterZ - facadeThicknessMeters / 2 + (19 / 1000); // 19мм - ширина профиля ручки
                    handleMesh.position.set(handleCenterX, handleCenterY, handleCenterZ);
                    group.add(handleMesh);
                }
                // Примерный код, если у вас есть функция createTB9HandleGeometry(length)
                // const handleMesh = createTB9HandleGeometry(facadeWidth); 
                // handleMesh.material = golaMaterial.clone();

                // Позиционирование ручки
                //const facadeTopY = facadeCenterYOffset + facadeHeight / 2;
                //const handleCenterY = facadeTopY; // Ручка располагается на уровне верха фасада
                //const handleCenterZ = facadeCenterZ - facadeThicknessMeters / 2 + (19 / 1000); // 19мм - ширина профиля
                
                // handleMesh.position.set(0, handleCenterY, handleCenterZ);
                // group.add(handleMesh);
                console.log("[Dishwasher] Требуется создать ручку TV9. Логику создания геометрии нужно перенести сюда.");
            }
        }
    }


    // --- 5. Создание верхней перемычки (условно) ---
    // Условие: высота столешницы из глобальных параметров > 840мм
    const bottomCountrtopLevel = kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness;
    if (bottomCountrtopLevel > 838) {
        console.log(`[Dishwasher] Создание перемычки, т.к. высота до столешницы ${bottomCountrtopLevel} > 8838`);

        const jumperWidth = width;
        const jumperHeight = getPanelThickness(); // Толщина материала
        const jumperDepth = 400 / 1000; // Стандартная глубина царги, ПРОВЕРЬТЕ это значение

        const jumperMesh = createPanel(
            jumperWidth, jumperHeight, jumperDepth,
            cabinetMaterial, // Используем материал КОРПУСА
            'horizontal', 'dishwasher_jumper'
        );

        if (jumperMesh) {
            // Позиционируем перемычку вверху шкафа, как переднюю царгу
            const jumperCenterY = height / 2 - jumperHeight / 2;
            let jumperCenterZ = depth / 2 - jumperDepth / 2; // Базовая позиция (у передней грани)
            if (handleType === 'gola-profile') {
                jumperCenterZ -= 28 / 1000; // Сдвигаем назад (вглубь) на 30 мм
                console.log(`[Dishwasher] Перемычка сдвинута назад для Gola-профиля.`);
            }

            jumperMesh.position.set(0, jumperCenterY, jumperCenterZ);
            jumperMesh.userData.cabinetUUID = cabinetUUID;
            group.add(jumperMesh);
        }
    }

    return group;
}


/**
 * Создает меш Гола-профиля заданной длины.
 * @param {number} lengthMeters - Длина профиля в метрах.
 * @param {THREE.Material} material - Материал для профиля.
 * @param {string} [profileName="golaProfile"] - Имя для меша.
 * @param {string} [cabinetUUID=""] - UUID родительского шкафа для userData.
 * @returns {THREE.Mesh | null} Меш Гола-профиля или null при ошибке.
 */
function createGolaProfileMesh(lengthMeters, material, profileName = "golaProfile", cabinetUUID) {
    if (lengthMeters <= 0) {
        console.warn(`[createGolaProfileMesh] Длина профиля должна быть больше 0. Получено: ${lengthMeters}`);
        return null;
    }

    // 1. Определяем Shape сечения Гола-профиля (в мм, потом масштабируем)
    const golaShape = new THREE.Shape();
    golaShape.moveTo(0, 0);    // Нижняя точка задней части
    golaShape.lineTo(0, 5);    // Вверх
    golaShape.lineTo(14, 5);   // Вперед
    golaShape.absarc(14, 10, 5, -Math.PI / 2, 0, false); // Дуга вверх-вперед (центр (14,10), радиус 5, от -90 до 0 град)
    // После дуги мы в точке (14+5=19, 10)
    golaShape.lineTo(19, 57);  // Вверх до конца видимой части
    golaShape.lineTo(27, 57);  // Вперед (полная глубина профиля)
    // "Возвращаемся" для формирования толщины и паза
    golaShape.lineTo(27, 54);  // Немного вниз
    golaShape.lineTo(20, 54);  // Назад
    golaShape.lineTo(20, 10);  // Вниз до уровня центра дуги
    golaShape.quadraticCurveTo(20, 4, 14, 4); // Кривая к задней части
    golaShape.lineTo(3, 4);    // Горизонтально назад
    golaShape.lineTo(3, 0);    // Вниз к начальной точке
    golaShape.closePath();     // Замыкаем (соединит (3,0) с (0,0))

    // 2. Настройки экструзии
    const extrudeSettings = {
        steps: 1,
        depth: lengthMeters * 1000, // Глубина экструзии = длина профиля в мм
        bevelEnabled: false
    };

    let golaGeometry = null;
    try {
        golaGeometry = new THREE.ExtrudeGeometry(golaShape, extrudeSettings);
        
        // 3. Трансформации геометрии:
        golaGeometry.translate(0, 0, -lengthMeters * 1000 / 2);
        golaGeometry.scale(1 / 1000, 1 / 1000, 1 / 1000); // Масштабируем всю геометрию
        
    } catch (error) {
        console.error(`[createGolaProfileMesh] Ошибка создания ExtrudeGeometry:`, error);
        return null;
    }

    // 4. Создание меша
    const golaMesh = new THREE.Mesh(golaGeometry, material); // Используем переданный материал
    golaMesh.name = `${profileName}_${(lengthMeters * 1000).toFixed(0)}mm`;
    golaMesh.userData = {
        isCabinetPart: true,
        objectType: 'cabinetProfile', // или 'golaProfile'
        profileType: 'horizontal', // или можно передавать как параметр, если будут разные
        cabinetUUID: cabinetUUID
    };

    return golaMesh;
}

// --- Функция переключения детализации ---
/**
 * Переключает между простым кубом и детализированным представлением шкафа.
 * @param {number} cabinetIndex - Индекс шкафа в массиве 'cabinets'.
 */
function toggleCabinetDetail(cabinetIndex) {
    // ... (проверка индекса)
    const cabinet = cabinets[cabinetIndex];
    if (!cabinet) { /*...*/ return; } // Добавим проверку cabinet
    const currentMeshOrGroup = cabinet.mesh;
    
    const wasSelected = selectedCabinets.includes(cabinet);
    hideAllDimensionInputs();
    //console.log(`--- toggleCabinetDetail для индекса ${cabinetIndex} ---`);
    //console.log("Текущее состояние:", { isDetailed: cabinet.isDetailed, type: cabinet.type, w: cabinet.width, h: cabinet.height, d: cabinet.depth });

    if (!cabinet.isDetailed || !cabinet.mesh.isGroup) {
        // --- Переключение НА Детализацию ---
        //console.log(`Переключение НА детализацию для ${currentMeshOrGroup?.uuid}`);
        const detailedGroup = getDetailedCabinetRepresentation(cabinet); // <--- ИСПОЛЬЗУЕМ ДИСПЕТЧЕР

        if (!detailedGroup) { /* ... обработка ошибки ... */
             alert(`Не удалось создать детализацию для этого типа/конфигурации шкафа.`);
            const button = document.getElementById('toggleDetailBtn'); // Предполагаем, что кнопка в DOM
            if (button && button.textContent.includes('Скрыть')) { // Если кнопка была в состоянии "Скрыть детали"
                 button.textContent = 'Показать детали';
            }
             return;
        }
        try {
            // --- Упрощенная замена ---
            detailedGroup.uuid = currentMeshOrGroup.uuid; // Сохраняем UUID
            // Позицию/вращение возьмем из текущих данных cabinet
            updateCabinetPosition(cabinet); // Рассчитаем позицию по данным
            detailedGroup.position.copy(cabinet.mesh.position); // Копируем из (возможно) временного меша
            detailedGroup.rotation.copy(cabinet.mesh.rotation);
            detailedGroup.scale.copy(cabinet.mesh.scale);

            if (cabinet.mesh.parent) cabinet.mesh.parent.remove(cabinet.mesh);
            if (cabinet.mesh.geometry) cabinet.mesh.geometry.dispose();
            if (cabinet.mesh.material) { if(Array.isArray(cabinet.mesh.material)) cabinet.mesh.material.forEach(m=>m?.dispose()); else cabinet.mesh.material?.dispose(); }
            if (cabinet.edges?.geometry) cabinet.edges.geometry.dispose();
            if (cabinet.edges?.material) cabinet.edges.material.dispose();

            cabinet.mesh = detailedGroup;
            cabinet.isDetailed = true;
            cabinet.edges = null;
            scene.add(detailedGroup); // Добавляем в ТЕКУЩИЙ куб

            if (wasSelected) applyHighlight(detailedGroup);
            const button = document.getElementById('toggleDetailBtn');
            if (button) button.textContent = 'Скрыть детали';
            updateHint("Показана детализация шкафа");
            // --- Конец упрощенной замены ---
        } catch (error) { /* ... обработка ошибки ... */
            console.error("Ошибка при переключении НА детализацию:", error, cabinet);
            cabinet.isDetailed = false; // Возвращаем флаг
            alert("Не удалось создать детализированную модель шкафа.");
        }
    } else {
        // --- Переключение НА Простой Куб ---
        //console.log(`Переключение НА простой куб для ${currentMeshOrGroup?.uuid}`);
        try {
            const simpleGeometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
            const simpleMaterial = new THREE.MeshStandardMaterial({ color: cabinet.initialColor });
            const simpleMesh = new THREE.Mesh(simpleGeometry, simpleMaterial);
            simpleMesh.uuid = cabinet.mesh.uuid;

            updateCabinetPosition(cabinet); // Обновит позицию в cabinet.mesh (который еще группа тут)
            simpleMesh.position.copy(cabinet.mesh.position);
            simpleMesh.rotation.copy(cabinet.mesh.rotation);
            simpleMesh.scale.copy(cabinet.mesh.scale);

            const edgesGeometry = new THREE.EdgesGeometry(simpleGeometry);
            const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
            const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
            edges.raycast = () => {}; simpleMesh.add(edges);

            if (cabinet.mesh.parent) cabinet.mesh.parent.remove(cabinet.mesh);
            cabinet.mesh.traverse((child) => { if (child.isMesh || child.isLineSegments) { if (child.geometry) child.geometry.dispose(); if (child.material) { if (Array.isArray(child.material)) child.material.forEach(m=>m?.dispose()); else child.material?.dispose(); } } });

            cabinet.mesh = simpleMesh;
            cabinet.isDetailed = false;
            cabinet.edges = edges;
            scene.add(simpleMesh);

            if (wasSelected) {
                 applyHighlight(simpleMesh);
                 if (cabinet.type === 'freestandingCabinet') showFreestandingCabinetDimensions(cabinet, cabinets);
                 else if (['lowerCabinet', 'upperCabinet'].includes(cabinet.type)) showCabinetDimensionsInput(cabinet, cabinets);
                 updateDimensionsInputPosition(cabinet, cabinets);
            }
            const button = document.getElementById('toggleDetailBtn');
            if (button) button.textContent = 'Показать детали';
            // updateHint("Показан простой вид шкафа");

            const hasIntersection = checkCabinetIntersections(cabinet);
            if (cabinet.mesh.material) { cabinet.mesh.material.color.set(hasIntersection ? 0xff0000 : cabinet.initialColor); cabinet.mesh.material.needsUpdate = true; }

        } catch (error) {
             console.error("Ошибка при переключении НА простой вид в toggleCabinetDetail:", error, cabinet);
        }
    }
}


/**
 * Рассчитывает фактическую высоту зазора под Гола-профиль,
 * @param {number} minGolaHeightMm - Минимальная желаемая высота Гола (из kitchenGlobalParams).
 * @param {number} facadeGapMm - Зазор между фасадами (из настроек шкафа).
 * @param {number} boxAvailableHeightMm - Доступная высота для ДВУХ фасадов и ДВУХ профилей
 *                                        (ВысотаСтолешницы - ТолщинаСтол - ВысотаЦоколя).
 * @returns {number} Фактическая высота Гола-профиля в миллиметрах.
 */
function calculateActualGolaHeight(minGolaHeightMm, facadeGapMm, boxAvailableHeightMm) {
    let actualGolaHeight = Math.max(3, Math.min(50, minGolaHeightMm)); // Ограничиваем начальное значение
    const maxGolaHeight = 50; // Максимальный предел итерации
  
    // Итеративно подбираем высоту Гола
    for (let currentGola = actualGolaHeight; currentGola <= maxGolaHeight; currentGola++) {
        // Рассчитываем высоту ОДНОГО фасада при текущей высоте Гола
        const facadeHeight = (boxAvailableHeightMm - currentGola * 2) / 2;

        // 1. Высота фасада должна быть "почти" целой (допуск на погрешность float)
        const isInteger = Math.abs(facadeHeight - Math.round(facadeHeight)) < 0.01; // Допуск 0.01 мм

        // 2. (Высота фасада - зазор) должно быть четным (или "почти" четным)
        const diff = facadeHeight - facadeGapMm;
        const isEvenDiff = Math.abs((diff / 2) - Math.round(diff / 2)) < 0.01;

        if (isInteger && isEvenDiff) {
            actualGolaHeight = currentGola; // Нашли подходящую высоту Гола
            //console.log(`--- Найдена высота Гола: ${actualGolaHeight} (Фасад: ${Math.round(facadeHeight)} мм) ---`);
            return actualGolaHeight; // Возвращаем найденное значение
        }
    }

    // Если цикл завершился без находки (маловероятно при диапазоне 3-50)
    console.warn(`Не удалось подобрать высоту Гола для доступной высоты ${boxAvailableHeightMm} и зазора ${facadeGapMm}. Используется минимальное значение: ${minGolaHeightMm}`);
    return minGolaHeightMm; // Возвращаем исходное минимальное как fallback
}

/**
 * Определяет мировую нормаль "лицевой" (наиболее видимой) стороны панели шкафа.
 * @param {THREE.Mesh} panelMesh - Меш конкретной панели (боковина, дно и т.д.).
 * @param {THREE.Group} cabinetGroup - Группа, представляющая весь шкаф.
 * @returns {THREE.Vector3 | null} Вектор нормали в мировых координатах или null, если не удалось определить.
 */
function getPanelFaceNormal(panelMesh, cabinetGroup) {
    if (!panelMesh || !panelMesh.isMesh || !cabinetGroup || !cabinetGroup.isGroup) {
        console.error("getPanelFaceNormal: Неверные аргументы.");
        return null;
    }

    // 1. Получаем мировую матрицу панели
    panelMesh.updateWorldMatrix(true, false); // Обновляем матрицу панели
    const worldMatrix = panelMesh.matrixWorld;

    // 2. Определяем локальную нормаль, которая соответствует "толщине"
    const panelOrientation = panelMesh.userData.orientationType;
    let localNormal;

    switch (panelOrientation) {
        case 'vertical': // Толщина по X
            localNormal = new THREE.Vector3(1, 0, 0); // Локальная нормаль оси +X
            break;
        case 'horizontal': // Толщина по Y
            localNormal = new THREE.Vector3(0, 1, 0); // Локальная нормаль оси +Y
            break;
        case 'frontal': // Толщина по Z
            localNormal = new THREE.Vector3(0, 0, 1); // Локальная нормаль оси +Z
            break;
        default:
            console.warn("getPanelFaceNormal: Неизвестный тип ориентации панели:", panelOrientation);
            // Можно попробовать угадать по размерам геометрии, но это менее надежно
            const geomParams = panelMesh.geometry?.parameters;
            if (geomParams) {
                 if (geomParams.width < geomParams.height && geomParams.width < geomParams.depth) localNormal = new THREE.Vector3(1,0,0);
                 else if (geomParams.height < geomParams.width && geomParams.height < geomParams.depth) localNormal = new THREE.Vector3(0,1,0);
                 else localNormal = new THREE.Vector3(0,0,1);
            } else {
                 return null; // Не можем определить без userData или геометрии
            }
    }

    // 3. Преобразуем локальную нормаль в мировую
    // Используем только вращение из мировой матрицы (извлекаем базисные векторы)
    const worldNormal = new THREE.Vector3();
    worldNormal.copy(localNormal).applyMatrix4(worldMatrix).sub(worldMatrix.getPosition(new THREE.Vector3())).normalize();

    // 4. Определяем, какая сторона "лицевая" (направлена от центра шкафа)
    // Вектор от центра шкафа к центру панели
    const cabinetCenterWorld = cabinetGroup.position; // Позиция группы - это ее центр
    const panelCenterWorld = panelMesh.getWorldPosition(new THREE.Vector3());
    const centerToPanelVec = panelCenterWorld.clone().sub(cabinetCenterWorld).normalize();

    // Сравниваем направление мировой нормали с вектором от центра
    if (worldNormal.dot(centerToPanelVec) >= 0) {
        // Нормаль уже направлена "наружу" - это и есть лицевая сторона
        return worldNormal;
    } else {
        // Нормаль направлена "внутрь", значит лицевая - противоположная
        return worldNormal.negate(); // Возвращаем инвертированную нормаль
    }
}

/**
 * Рассчитывает площадь "лицевой" стороны панели.
 * @param {THREE.Mesh} panelMesh - Меш панели.
 * @returns {number} Площадь в квадратных метрах или 0 при ошибке.
 */
function calculatePanelFaceArea(panelMesh) {
    if (!panelMesh || !panelMesh.geometry || !panelMesh.geometry.parameters) {
        return 0;
    }
    const params = panelMesh.geometry.parameters;
    const orientation = panelMesh.userData.orientationType;

    switch (orientation) {
        case 'vertical':   return params.height * params.depth; // Площадь YZ
        case 'horizontal': return params.width * params.depth;  // Площадь XZ
        case 'frontal':    return params.width * params.height; // Площадь XY
        default:
             // Пытаемся угадать по наименьшему размеру (толщине)
             if (params.width <= params.height && params.width <= params.depth) return params.height * params.depth;
             if (params.height <= params.width && params.height <= params.depth) return params.width * params.depth;
             return params.width * params.height; // По умолчанию XY
    }
}



function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
    composer.setSize(width, height); // Обновляем composer
    outlinePass.resolution.set(width, height); // Обновляем OutlinePass

    // Опционально: Обновляем FXAA
    /*
    const pixelRatio = renderer.getPixelRatio();
    fxaaPass.material.uniforms['resolution'].value.x = 1 / (width * pixelRatio);
    fxaaPass.material.uniforms['resolution'].value.y = 1 / (height * pixelRatio);
    */
}

//window.addEventListener('resize', onWindowResize);

function updateRendererAndPostprocessingCamera() {
    if (typeof composer !== 'undefined' && composer) { // composer - это ваш объект EffectComposer
        requestRender();
        // Composer обычно сам обновляет свои пассы при изменении renderPass.camera,
        // но если у вас есть специфичные пассы, которым нужно явно передать камеру:
        if (renderPass) renderPass.camera = activeCamera; // activeCamera импортирована из sceneSetup
        if (outlinePass) outlinePass.renderCamera = activeCamera;
    }
    // console.log("[script.js] Активная камера обновлена для рендерера/пост-обработки:", activeCamera.type);
}


// Привязка слушателей
// Экспорт функций в window для доступа из HTML (onclick)
// Основные функции
window.globalSaveState = saveState; // Делаем ее доступной глобально
window.addObject = addObject;
window.undoLastAction = undoLastAction;
window.setLeftView = setLeftView;
window.setFrontView = setFrontView;
window.setTopView = setTopView;
window.setIsometricView = setIsometricView;
window.saveProject = saveProject;
window.loadProject = loadProject;
//window.applySize = applySize;
// Функции для окон/дверей/розеток
window.applyObjectChanges = applyObjectChanges;
window.deleteWindow = deleteWindow;
window.addAdjacentSocket = addAdjacentSocket;
// Функции для шкафов
window.applyCabinetChanges = applyCabinetChanges;
window.deleteCabinet = deleteCabinet;
//window.applyCabinetConfigChanges = applyCabinetConfigChanges;
window.hideCabinetConfigMenu = hideCabinetConfigMenu; // Из menus.js
window.toggleCabinetDetail = toggleCabinetDetail;
window.createDetailedCabinetGeometry = createDetailedCabinetGeometry;
window.createDetailedFalsePanelGeometry = createDetailedFalsePanelGeometry;
window.getDetailedCabinetRepresentation = getDetailedCabinetRepresentation;

window.orientCabinet = orientCabinet; // Если вызывается из onchange
// Функции для глобальных параметров
window.applyKitchenParams = applyKitchenParams; // Уже должно быть
// Функции для менеджера фасадов
window.showFacadeSetsManager = showFacadeSetsManager; // <--- Экспортируем
window.hideFacadeSetsManager = hideFacadeSetsManager; // <--- Экспортируем
window.addFacadeSetRow = addFacadeSetRow;             // <--- Экспортируем
window.applyFacadeSetsChanges = applyFacadeSetsChanges; // <--- Экспортируем
// Другие нужные функции...
window.cabinets = cabinets; // Экспорт массива (если нужен)
window.windows = windows;
window.countertops = countertops;

window.calculateLowerCabinetOffset = calculateLowerCabinetOffset;
window.getFacadeMaterialAndThickness = getFacadeMaterialAndThickness; // Экспортируем и эту, т.к. она тоже нужна
window.objectTypes = objectTypes; // Экспортируем objectTypes, т.к. он нужен для дефолтов

window.updateCabinetPosition = updateCabinetPosition;
window.checkCabinetIntersections = checkCabinetIntersections;
window.calculateActualGolaHeight = calculateActualGolaHeight;
window.getFacadeMaterialAndThickness = getFacadeMaterialAndThickness;
window.getPanelThickness = getPanelThickness;
window.updateCabinetPosition = updateCabinetPosition;
//window.clearCabinetConfig = clearCabinetConfig;
window.applyChangesAndPrepareForConfigMenu = applyChangesAndPrepareForConfigMenu;
window.showCabinetConfigMenu = showCabinetConfigMenu;
window.prepareCabinetForNewConfig = prepareCabinetForNewConfig;
window.applyConfigMenuSettings = applyConfigMenuSettings;
window.kitchenGlobalParams = kitchenGlobalParams;
window.hideAllDimensionInputs = hideAllDimensionInputs;
window.requestRender = requestRender;

kitchenGlobalParams.countertopHeight