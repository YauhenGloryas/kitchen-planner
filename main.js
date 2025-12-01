import * as THREE from 'three'; // Импорт ядра Three.js
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { scene, camera, orthoCamera, renderer, activeCamera, ambientLight, directionalLight, setActiveSceneCamera, initRenderer } from './sceneSetup.js';

import {
    showCabinetConfigMenu,
    createCabinetConfigMenu, // Убедитесь, что он импортирован, если используется напрямую
    updateSpecificConfigFields,
    hideCabinetConfigMenu,
    showFacadeSetsManager, // <--- Импортируем
    hideFacadeSetsManager, // <--- Импортируем
    addFacadeSetRow,       // <--- Импортируем (для onclick)
    applyFacadeSetsChanges, // <--- Импортируем (для onclick)
    openCountertopPickerModal,
    showWallContextMenu,
    showFloorContextMenu,
    openApronMaterialPicker,
    openPlinthMaterialPicker 
  } from './menus.js';

  import {
    cube, edges, // Нужен для добавления объектов, проверки пересечений и т.д.
    selectedFaceIndex, // Важен для логики добавления объектов
    currentLength, currentWidth, currentHeight, // Нужны для расчетов в других местах
    faceNormals, // Нужны для определения стены
    createCube, 
    initRoomManagerDOM,// Будет вызываться из init и applySize (который теперь в roomManager)
    materials as RM_materials,
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
    roomDimensions,
    getRoomSelectedFaceIndex,
    applyMaterialToWall,
    getWallMaterial 
    // ... другие необходимые импорты ...
} from './roomManager.js';

import { controls } from './sceneSetup.js';

import * as InputManager from './inputManager.js';

import { objectManager } from './ObjectManager.js';
import { Cabinet } from './Cabinet.js'; // Может понадобиться для instanceof

import { historyManager } from './HistoryManager.js';
import { 
    AddCabinetCommand, 
    RemoveCabinetCommand, 
    UpdateObjectCommand, 
    AddClonedCabinetCommand, 
    AddObjectCommand, 
    RemoveObjectCommand, 
    AddGroupCommand, 
    RemoveGroupCommand, 
    UpdateSimpleObjectCommand, 
    UpdateObjectsGroupCommand,
    RemoveCountertopCommand, 
    UpdateCountertopCommand, 
    //UpdateCountertopAndCabinetsCommand, 
    UpdateGlobalParamsCommand,
    UpdateCountertopCommandWithPos,
    AddApplianceCommand,
    RemoveApplianceCommand,
    UpdateApplianceCommand,
    UpdateAppliancePosCommand,
    UpdateApronCommand,
    AddPlinthCommand,
    UpdatePlinthCommand
} from './Commands.js';

import * as MaterialManager from './MaterialManager.js'
import { getAdjacentWallId, findNearestNeighbor, findNearestCornerDirection, calculateCornerPivotPosition } from './CabinetUtils.js';
import { 
    createDetailedUpperSwingGeometry, 
    createDetailedCornerSinkGeometry,
    createDetailedUpperCornerGeometry,
    createDetailedOpenUpperGeometry,
    createDetailedSwingHoodGeometry,
    createDetailedLiftUpperGeometry,
    createDetailedFalsePanelUpperGeometry,
    createDetailedTallOvenMicroGeometry
} from './CabinetFactory.js';
import { buildApronGeometry } from './ApronBuilder.js';
import { createPlinth } from './PlinthFactory.js';
import { preloadFacadeModels } from './AssetLoader.js';


//test block ---------
import { createMilledFacade } from './FacadeBuilder.js';
window.createMilledFacade = createMilledFacade;
//import * as MaterialManager from './MaterialManager.js';
window.MaterialManager = MaterialManager;
window.THREE = THREE;
//end pf test block==============


// Также убедись, что у рендерера включены карты теней
//renderer.shadowMap.enabled = true; // Добавь это при настройке renderer
//renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Тип теней (опционально)

// И у объектов, которые должны отбрасывать/принимать тени, включены свойства:
//mesh.castShadow = true;
//mesh.receiveShadow = true;
//planeMesh.receiveShadow = true; // Например, пол


const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

const dependencies = {
        // Мы используем getter, чтобы roomDimensions всегда были актуальными
        get roomDimensions() {
            return {
                length: currentLength,
                width: currentWidth,
                height: currentHeight
            };
        },
        calculateLowerCabinetOffset: calculateLowerCabinetOffset
        // В будущем сюда можно будет добавить и другие функции-хелперы
    };

let windows = [];

function getSelectedCabinets() {
    return selectedCabinets;
}
// Делаем ее доступной для других модулей
window.getSelectedCabinets = getSelectedCabinets;


//let cabinets = [];
let selectedCabinet = null; // Добавляем глобальную переменную
let selectedCabinets = []; // массив шкафов для множественного выделения
let countertops = [];
let floorObject = null;
window.plinths = [];
// НОВЫЙ СЕТТЕР, который будет виден из других модулей
function setFloorObject(newFloor) {
    floorObject = newFloor;
    window.floorObject = newFloor; // Дублируем в window для надежности
    console.log("Global floorObject updated:", window.floorObject);
}
// Делаем сеттер доступным глобально
window.setFloorObject = setFloorObject;

let dragStartProperties = null; // <-- НОВАЯ ГЛОБАЛЬНАЯ ПЕРЕМЕННАЯ (или в InputManager)

let potentialDrag = false; // Флаг: true, если mousedown был на шкафу, но drag еще не 

const gltfLoaderInstance = new GLTFLoader();
const gltfLoaderInstance_Preload = new GLTFLoader(); // Можно использовать тот же инстанс, что и раньше, или новый
const modelsToPreload = [
    'oven_450.glb',
    'oven_600.glb',
    'mkw_362.glb',
    'dishwasher_600.glb',
    'dishwasher_450.glb',
    'induct_600_black.glb',
    'induct_450_black.glb',
    'induct_300_black.glb',
    'induct_600_w.glb',
    'induct_450_w.glb',
    'induct_300_w.glb',
    'gas_600_black.glb',
    'gas_600_w.glb',
    'gas_450_black.glb',
    'gas_300_black.glb',
    'gas_300_w.glb',
    'sink_inox.glb',
    'sink_stone.glb',
    'mixer.glb'

 // Добавьте сюда все нужные модели
    // 'microwave_large.glb',
    // 'fridge_standard.glb',
];
const loadedModelsCache = new Map(); // Кэш для загруженных моделей
//const preloadedModelsCache = new Map();

let allModelsLoaded = false; // Флаг для индикации завершения загрузки


let widthInputSimple, heightInputSimple, 
    offsetLeftInput, offsetRightInput, offsetBottomInput,
    lineLeft, lineRight, lineBottom, depthInputSimple;

// Стек истории действий (максимум 20)
//const actionHistory = [];
//const maxHistorySize = 20;

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
    golaMinHeightMm: 30, 
    bodyMaterial: "W960SM"
};


// ---- Render scheduler ----
let renderRequested = false;
let continuousRendering = false;

window.roomDimensions = {
    getDimensions: () => ({
        currentLength: currentLength,
        currentWidth: currentWidth,
        currentHeight: currentHeight
    })
};

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
  //const isRotatingNow = InputManager.isRotating();
  const isDraggingNow = !!InputManager.getDraggedCabinet();
  //const isPanningNow = InputManager.isPanning();
  return continuousRendering || isDraggingNow;
}

let wallMaterialsData = [];
async function loadWallMaterials() {
    try {
        const response = await fetch('./wallMaterials.json');
        wallMaterialsData = await response.json();
        window.wallMaterialsData = wallMaterialsData; // Делаем доступным глобально
        console.log("Материалы для стен загружены.");
    } catch (error) {
        console.error("Ошибка загрузки wallMaterials.json:", error);
    }
}

let floorMaterialsData = [];
window.floorMaterialsData = floorMaterialsData; // Сразу делаем доступным

async function loadFloorMaterials() {
    try {
        const response = await fetch('./floorMaterials.json');
        const data = await response.json();
        floorMaterialsData.push(...data); // Наполняем массив
        console.log("Материалы для пола загружены.");
    } catch (error) {
        console.error("Ошибка загрузки floorMaterials.json:", error);
    }
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
        
        // 1. Клонируем структуру
        const clone = originalScene.clone(true);

        // 2. Проходимся по клону и клонируем материалы
        clone.traverse((child) => {
            if (child.isMesh) {
                // Клонируем материал, чтобы подсветка не влияла на оригинал
                if (Array.isArray(child.material)) {
                    child.material = child.material.map(m => m.clone());
                } else if (child.material) {
                    child.material = child.material.clone();
                }
                
                // Сбрасываем userData, связанные с подсветкой (на всякий случай)
                if (child.userData) {
                    delete child.userData.isHighlighted;
                }
                // Очищаем userData материала
                if (child.material.userData) {
                    delete child.material.userData.originalEmissive;
                    delete child.material.userData.originalIntensity;
                }
                
                // Убедимся, что эмиссия сброшена
                if (child.material.emissive) {
                    child.material.emissive.setHex(0x000000);
                }
            }
        });

        return clone;
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
 * Генерирует 3D-объект напольного покрытия (ламинат/плитка).
 * @param {object} params - Объект с параметрами { plankWidth, plankLength, gap, offset, direction }.
 * @param {boolean} isPreview - Если true, используется простой серый материал для предпросмотра.
 * @returns {THREE.Mesh | null} - Возвращает единый Mesh всего покрытия или null в случае ошибки.
 */
function floorGenerator(params, isPreview = false, materialId = null) {
    console.log("floorGenerator запущен. Режим превью:", isPreview, "Material ID:", materialId);

    // === ЗАЩИТА ===
    if (!params) {
        console.warn("floorGenerator: Параметры не переданы! Генерация отменена.");
        return null;
    }
    // ==============

    // --- 1. Подготовка: конвертация мм в метры и получение размеров комнаты ---
    const plankWidth = params.plankWidth / 1000;
    const plankLength = params.plankLength / 1000;
    const gap = params.gap / 1000;
    const offsetPercent = params.offset / 100;
    const direction = params.direction || 0;

    const roomLength = roomDimensions.getLength(); // X
    const roomDepth = roomDimensions.getHeight();  // Z
    const floorY = -roomDimensions.getWidth() / 2; // Y-координата пола

    const plankHeight = params.plankHeight / 1000 || 2 / 1000; // Толщина плашки 2мм

    // Определяем, по какой оси идет укладка
    const mainAxisSize = (direction === 0) ? roomLength : roomDepth;
    const crossAxisSize = (direction === 0) ? roomDepth : roomLength;

    // ==> НАЧАЛО: Защита от перегрузки <==
    const MAX_PLANKS = 1200; // Максимальное количество плашек
    const estimatedPlanksX = Math.ceil(roomLength / plankLength);
    const estimatedPlanksY = Math.ceil(roomDepth / plankWidth);
    
    if (estimatedPlanksX * estimatedPlanksY > MAX_PLANKS) {
        console.warn(`Слишком много плашек (${estimatedPlanksX * estimatedPlanksY}). Генерация отменена.`);
        // Можно показать пользователю сообщение
        // updateHint(`Слишком маленький размер планок. Максимум ${MAX_PLANKS} штук.`);
        return null; // Прерываем выполнение
    }
    // ==> КОНЕЦ: Защита от перегрузки <==
    
    // --- 2. Создание плашек ---
    const geometries = [];
    let yPos = -crossAxisSize / 2;
    while (yPos < crossAxisSize / 2) {
        const remainingCrossAxis = crossAxisSize / 2 - yPos;
        const currentPlankCrossSize = Math.min(plankWidth, remainingCrossAxis);
        if (currentPlankCrossSize < 0.001) break;

        const rowIndex = Math.round((yPos + crossAxisSize / 2) / (plankWidth + gap));
        const rowOffset = (plankLength * offsetPercent * rowIndex);
        let xPos = -mainAxisSize / 2 - rowOffset;
        
        while (xPos < mainAxisSize / 2) {
            const startX = Math.max(-mainAxisSize / 2, xPos);
            const endX = Math.min(mainAxisSize / 2, xPos + plankLength);
            const currentPlankMainSize = endX - startX;

            if (currentPlankMainSize > 0.001) {
                // --- ИСПОЛЬЗУЕМ ВАШУ РАБОЧУЮ ЛОГИКУ СОЗДАНИЯ ГЕОМЕТРИИ ---
                const geomWidth = (direction === 0) ? currentPlankMainSize : currentPlankCrossSize;
                const geomDepth = (direction === 0) ? currentPlankCrossSize : currentPlankMainSize;

                const plankGeom = new THREE.BoxGeometry(geomWidth, plankHeight, geomDepth);

                // --- ФИНАЛЬНАЯ ЛОГИКА UV-МАППИНГА ---
                if (!isPreview && materialId) {
                    const materialInfo = window.floorMaterialsData.find(m => m.id === materialId);
                    if (materialInfo && materialInfo.type === 'texture') {
                        const uvAttribute = plankGeom.attributes.uv;
                        const textureLengthM = (materialInfo.textureLengthMm || 1200) / 1000;
                        const textureWidthM = (materialInfo.textureWidthMm || 200) / 1000;
                        
                        const randomU = Math.random();
                        const randomV = Math.random();
                        
                        // ВАША РАБОЧАЯ ФОРМУЛА МАСШТАБА для повернутой текстуры
                        let scaleU = geomWidth / textureWidthM;
                        let scaleV = geomDepth / textureLengthM;

                        if (direction === 0) {
                            scaleU = geomWidth / textureLengthM;
                            scaleV = geomDepth / textureWidthM;
                        } 
                        
                        for (let i = 0; i < uvAttribute.count; i++) {
                            let u = uvAttribute.getX(i);
                            let v = uvAttribute.getY(i);
                            
                            // Поворачиваем UV, только если плашки идут вдоль оси X (direction = 0)
                            if (direction === 0) {
                                // Поворачиваем UV
                                [u, v] = [v, u];
                                
                                // И ПРИМЕНЯЕМ МАСШТАБ, ПОМЕНЯВ МЕСТАМИ scaleU и scaleV!
                                // К новой 'u' (бывшей 'v') применяем scaleV.
                                // К новой 'v' (бывшей 'u') применяем scaleU.
                                uvAttribute.setXY(i, (u * scaleV) + randomU, (v * scaleU) + randomV);

                            } else { // direction === 90
                                // Оставляем как есть, здесь все работает.
                                uvAttribute.setXY(i, (u * scaleU) + randomU, (v * scaleV) + randomV);
                            }
                        }
                    }
                }
                
                // --- ИСПОЛЬЗУЕМ ВАШУ РАБОЧУЮ ЛОГИКУ ПОЗИЦИОНИРОВАНИЯ ---
                const centerMainAxis = startX + currentPlankMainSize / 2;
                const centerCrossAxis = yPos + currentPlankCrossSize / 2;
                
                if (direction === 0) {
                    plankGeom.translate(centerMainAxis, floorY + plankHeight / 2, centerCrossAxis);
                } else {
                    // Для direction 90, mainAxis - это Z, crossAxis - это X
                    plankGeom.translate(centerCrossAxis, floorY + plankHeight / 2, centerMainAxis);
                }
                
                geometries.push(plankGeom);
            }
            xPos += plankLength + gap;
        }
        yPos += plankWidth + gap;
    }

    if (geometries.length === 0) {
        console.warn("Не создано ни одной плашки.");
        return null;
    }

     // --- 3. Слияние и создание Mesh (без изменений) ---
    if (geometries.length === 0) return null;
    const mergedGeometry = mergeGeometries(geometries, false);
    if (!mergedGeometry) return null;

    // --- 4. Создание материала ---
    let finalMaterial;
    if (isPreview) {
        finalMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 });
    } else {
        const materialInfo = window.floorMaterialsData.find(m => m.id === materialId);
        if (materialInfo && materialInfo.type === 'texture') {
            const texture = new THREE.TextureLoader().load(materialInfo.value);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            finalMaterial = new THREE.MeshStandardMaterial({
                map: texture,
                color: materialInfo.baseColor || '#FFFFFF',
                roughness: 0.7
            });
        } else if (materialInfo) { // color
            finalMaterial = new THREE.MeshStandardMaterial({ color: materialInfo.value, roughness: 0.8 });
        } else {
            finalMaterial = new THREE.MeshStandardMaterial({ color: 0xAAAAAA, roughness: 0.7 });
        }
    }

    const floorMesh = new THREE.Mesh(mergedGeometry, finalMaterial);
    floorMesh.name = "ProceduralFloor";
    floorMesh.userData.floorParams = params; // Сохраняем параметры внутри объекта!
    floorMesh.userData.materialId = materialId;

    window.floorObject = floorMesh; 
    
    return floorMesh;
}

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
function getWallConfig(wallId, cabinet) {
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
        offsetFromParentWall: 20 / 1000, // <--- НОВЫЙ ПАРАМЕТР: отступ от стены (20мм по умолчанию)
        isHeightIndependent: false
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

function addDoorAtPoint(intersectPoint) {
    if (selectedFaceIndex === -1) return;

    const wallId = faceNormals[selectedFaceIndex].id;
    const params = objectTypes['door'];

    // Рассчитываем отступы от точки клика
    const localPoint = intersectPoint.clone().applyMatrix4(cube.matrixWorld.clone().invert());
    let baseOffsetAlongWall;
    if (wallId === 'Back') {
        baseOffsetAlongWall = localPoint.x + currentLength / 2;
    } else { // Left or Right
        baseOffsetAlongWall = localPoint.z + currentHeight / 2;
    }

    // Корректируем, чтобы курсор был в центре полотна
    const canvasWidth = params.defaultCanvasWidth;
    let finalOffsetAlongWall = baseOffsetAlongWall - canvasWidth / 2;
    
    // Ограничиваем границами стены
    const totalDoorWidth = canvasWidth + 2 * params.defaultFrameWidth;
    const wallLength = (wallId === 'Back') ? currentLength : currentHeight;
    finalOffsetAlongWall = Math.max(params.defaultFrameWidth, finalOffsetAlongWall); // Чтобы левый наличник не выходил за стену
    finalOffsetAlongWall = Math.min(wallLength - canvasWidth - params.defaultFrameWidth, finalOffsetAlongWall);


        const groupId = Date.now();
        //const canvasWidth = params.defaultCanvasWidth;
        const canvasHeight = params.defaultCanvasHeight;
        const frameWidth = params.defaultFrameWidth;
        const frameThickness = params.defaultFrameThickness;
        const offsetAlongWall = finalOffsetAlongWall;
        const offsetBottom = params.defaultOffsetBottom;
        const canvasDepth = params.defaultCanvasDepth;

        const elements = [
            { width: canvasWidth, height: canvasHeight, depth: canvasDepth, offsetX: 0, offsetY: 0, offsetFromParentWall: (5 - canvasDepth * 1000) / 1000 },
            { width: frameWidth, height: canvasHeight + frameWidth, depth: frameThickness, offsetX: canvasWidth, offsetY: 0, offsetFromParentWall: 0 },
            { width: frameWidth, height: canvasHeight + frameWidth, depth: frameThickness, offsetX: -frameWidth, offsetY: 0, offsetFromParentWall: 0 },
            { width: canvasWidth, height: frameWidth, depth: frameThickness, offsetX: 0, offsetY: canvasHeight, offsetFromParentWall: 0 }
        ];

        // ==> ИЗМЕНЕНИЕ 1: Собираем все части двери в один массив <==
        const doorParts = [];

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
                    mesh.position.set(-currentLength / 2 + offsetAlongWall + el.offsetX + el.width / 2, -currentWidth / 2 + offsetBottom + el.offsetY + el.height / 2, -currentHeight / 2 + el.offsetFromParentWall + el.depth / 2);
                    break;
                case "Left":
                    mesh.position.set(-currentLength / 2 + el.offsetFromParentWall + el.depth / 2, -currentWidth / 2 + offsetBottom + el.offsetY + el.height / 2, -currentHeight / 2 + offsetAlongWall + el.offsetX + el.width / 2);
                    mesh.rotation.y = THREE.MathUtils.degToRad(90);
                    break;
                case "Right":
                    mesh.position.set(currentLength / 2 - el.offsetFromParentWall - el.depth / 2, -currentWidth / 2 + offsetBottom + el.offsetY + el.height / 2, -currentHeight / 2 + offsetAlongWall + el.offsetX + el.width / 2);
                    mesh.rotation.y = THREE.MathUtils.degToRad(-90);
                    break;
            }

            const obj = {
                mesh: mesh, wallId: wallId, initialColor: params.initialColor,
                width: el.width, height: el.height, depth: el.depth,
                offsetAlongWall: offsetAlongWall + el.offsetX,
                offsetBottom: offsetBottom + el.offsetY,
                offsetFromParentWall: el.offsetFromParentWall,
                type: 'door', 
                edges: edges, groupId: groupId, doorIndex: index
            };
            
            // Вместо push в глобальный массив, собираем в локальный
            doorParts.push(obj);
        });

        // ==> ИЗМЕНЕНИЕ 2: Создаем и выполняем ОДНУ команду для всей группы <==
        const command = new AddGroupCommand(scene, windows, doorParts);
        historyManager.execute(command);

        clearSelection();

        // --- Остальная логика (выделение, показ меню) остается без изменений ---
        const firstDoorElement = windows.find(w => w.groupId === groupId && w.doorIndex === 0);
        applyHighlight(firstDoorElement.mesh);
        selectedCabinets = [firstDoorElement];
        selectedCabinet = firstDoorElement;
        const center = new THREE.Vector3();
        firstDoorElement.mesh.getWorldPosition(center);
        const screenPos = center.project(camera);
        const rect = renderer.domElement.getBoundingClientRect();
        const x = (screenPos.x + 1) * rect.width / 2 + rect.left;
        const y = (-screenPos.y + 1) * rect.height / 2 + rect.top;
        showWindowMenu(x, y, firstDoorElement);       
}

/**
 * Создает и размещает технику (варочная, мойка) на столешнице.
 * @param {string} type - Тип техники ('hob', 'sink_model').
 * @param {THREE.Vector3} worldPosition - Точка вставки (мировые координаты, из рейкастера).
 * @param {THREE.Mesh} countertop - Меш столешницы.
 */
function createCountertopAppliance(type, worldPosition, countertop) {
    console.log(`[Main] Создание техники ${type} на столешнице ${countertop.uuid}`);

    // 1. Получаем модель
    let modelName;
    if (type === 'hob') {
        modelName = 'induct_600_black.glb';
    } else if (type === 'sink_model') {
        modelName = 'sink_inox.glb'; // Заглушка
    }

    const applianceMesh = getPreloadedModelClone(modelName);
    if (!applianceMesh) {
        console.error(`Не удалось получить модель ${modelName}`);
        return;
    }

    if (type === 'sink_model') {
        // Загружаем смеситель
        const mixerMesh = getPreloadedModelClone('mixer.glb'); // Ваша модель
        
        if (mixerMesh) {
             console.log("Смеситель загружен, добавляем к мойке");
             mixerMesh.userData.isMixer = true;
             applianceMesh.add(mixerMesh);
        } else {
             console.error("Не удалось загрузить смеситель!");
        }
    }

    // 2. Преобразуем мировую позицию в локальную систему координат столешницы
    // counterTop.worldToLocal(vector) преобразует вектор на месте
    const localPosition = worldPosition.clone();
    countertop.worldToLocal(localPosition);

    // 1. Позиция вдоль длины (X) - берем из клика
    applianceMesh.position.x = localPosition.x;
    // 2. Позиция по высоте (Z в локальных координатах Extrude)
    // Верхняя грань = thickness / 2.
    applianceMesh.position.y = countertop.userData.thickness / 2;
    
    // 3. Позиция по глубине (Y в локальных координатах Extrude)
    const ctDepth = countertop.userData.depth;
    if (type === 'hob') {
        const applianceDepth = 0.520;
        const offsetFromFront = 0.040;
        // Y = (Передняя грань) - отступ - половина варочной
        applianceMesh.position.z = (ctDepth / 2) - offsetFromFront - (applianceDepth / 2);
    } else if (type === 'sink_model') {
        // Для мойки: pivot = передняя грань - 260мм
        const offsetFromFront = 0.250 + 0.06; // 260мм
        applianceMesh.position.z = (ctDepth / 2) - offsetFromFront;
    }
        
    // 4. Сохранение данных
    if (!countertop.userData.appliances) {
        countertop.userData.appliances = [];
    }
    
    const applianceData = {
        type: type,
        id: THREE.MathUtils.generateUUID(),
        modelName: modelName,
        localPosition: applianceMesh.position.clone(),
        rotation: applianceMesh.rotation.clone(),
        
        // --- НОВОЕ: Сохраняем отступ от левого края ---
        distFromLeft: applianceMesh.position.x - (-countertop.userData.length / 2)
    };

    // Добавляем размеры выреза, если это мойка
    if (type === 'sink_model') {
         if (modelName === 'sink_stone.glb') {
             applianceData.cutoutSize = { width: 0.490, depth: 0.490 }; 
         } else {
             applianceData.cutoutSize = { width: 0.480, depth: 0.480 }; 
         }
    }
    
    applianceMesh.userData = applianceData; // Привязываем данные к мешу
    applianceMesh.traverse((child) => {
        if (child.isMesh) {
            //console.log('Appliance material:', child.material);
            // Если материал слишком темный, можно попробовать "высветлить" его
            if (child.material.map) {
                child.material.map.encoding = THREE.sRGBEncoding; // Важно для корректного цвета
            }
            // child.material.envMapIntensity = 1.0; // Усилить отражения
        }
    });


    //countertop.userData.appliances.push(applianceData);

    // 5. Добавляем в сцену
    //countertop.add(applianceMesh);
    const command = new AddApplianceCommand(countertop, applianceData);
    historyManager.execute(command);
    
}

function createCountertopApplianceFromData(countertop, data) {
    const mesh = getPreloadedModelClone(data.modelName);
    if (!mesh) return null;

    mesh.position.copy(data.localPosition);
    mesh.rotation.copy(data.rotation);
    mesh.scale.copy(data.scale || new THREE.Vector3(1, 1, 1));
    mesh.userData = { ...data }; // Копируем данные

    mesh.userData.isHighlighted = false;

    // --- НОВЫЙ БЛОК: Добавляем смеситель, если это мойка ---
    if (data.type === 'sink_model') {
         const mixerMesh = getPreloadedModelClone('mixer.glb');
         if (mixerMesh) {
             mixerMesh.userData.isMixer = true;
             mesh.add(mixerMesh);
             // Позиционирование произойдет в updateCountertop3D
         }
    }
    // -------------------------------------------------------

    countertop.add(mesh);
    
    // Если в countertop.userData.appliances еще нет записи об этом объекте, добавляем
    // (это нужно при загрузке)
    // Но при Undo/Redo мы управляем массивом вручную.
    
    return mesh;
}

/**
 * Рассчитывает новые состояния для всех частей двери на основе базовых размеров.
 * @param {Array} doorParts - Массив текущих объектов частей двери.
 * @param {object} params - Объект с новыми базовыми размерами (canvasWidth, canvasHeight и т.д.).
 * @returns {Array} - Массив новых объектов состояния для команды.
 */
function calculateDoorPartStates(doorParts, params) {
    const { canvasWidth, canvasHeight, frameWidth, offsetAlongWall, offsetBottom } = params;
    const frameThickness = doorParts.find(p=>p.doorIndex===2)?.depth || 0.01; // Берем толщину из существующей
    const canvasDepth = doorParts.find(p=>p.doorIndex===0)?.depth || 0.05;

    return doorParts.map(part => {
        const newState = JSON.parse(JSON.stringify(part)); // Начинаем с копии
        
        // Применяем изменения к КОПИИ в зависимости от индекса
        if (newState.doorIndex === 0) { // Полотно
            newState.width = canvasWidth;
            newState.height = canvasHeight;
            newState.offsetAlongWall = offsetAlongWall;
            newState.offsetBottom = offsetBottom;
        } else if (newState.doorIndex === 2) { // Наличник слева
            newState.width = frameWidth;
            newState.height = canvasHeight + frameWidth;
            newState.offsetAlongWall = offsetAlongWall - frameWidth;
            newState.offsetBottom = offsetBottom;
            newState.depth = frameThickness;
        } else if (newState.doorIndex === 1) { // Наличник справа
            newState.width = frameWidth;
            newState.height = canvasHeight + frameWidth;
            newState.offsetAlongWall = offsetAlongWall + canvasWidth;
            newState.offsetBottom = offsetBottom;
            newState.depth = frameThickness;
        } else if (newState.doorIndex === 3) { // Верхний наличник
            newState.width = canvasWidth;
            newState.height = frameWidth;
            newState.offsetAlongWall = offsetAlongWall;
            newState.offsetBottom = offsetBottom + canvasHeight;
            newState.depth = frameThickness;
        }
        
        delete newState.mesh;
        delete newState.edges;
        return newState;
    });
}

// staht coutertop cash
//1
//2
// 3

function applyObjectChanges(objectIndex) {
    const obj = windows[objectIndex];
    if (!obj) return;

    const type = obj.type;

    if (type === 'door') {
        const groupId = obj.groupId;
        const partsToUpdate = windows.filter(w => w.groupId === groupId);
        
        // 1. Сохраняем старые состояния всех частей
        const oldStates = partsToUpdate.map(part => {
            const { mesh, edges, ...oldStateData } = part;
            return JSON.parse(JSON.stringify(oldStateData));
        });

        // 2. Считываем новые значения из DOM
        const params = objectTypes[type];
        const newCanvasWidth = parseFloat(document.getElementById('doorCanvasWidth').value) / 1000;
        const newCanvasHeight = parseFloat(document.getElementById('doorCanvasHeight').value) / 1000;
        const newFrameWidth = parseFloat(document.getElementById('doorFrameWidth').value) / 1000;
        const newFrameThickness = parseFloat(document.getElementById('doorFrameThickness').value) / 1000;
        const newOffsetAlongWall = parseFloat(document.getElementById('dooroffsetAlongWall').value) / 1000;
        const newOffsetBottom = parseFloat(document.getElementById('doorOffsetBottom').value) / 1000;

        // 3. Создаем массив с НОВЫМИ состояниями для всех частей
        const newStates = partsToUpdate.map(part => {
            // Сначала создаем полную копию данных текущей части
            const newPartData = JSON.parse(JSON.stringify(part));
            
            // Удаляем 3D-объекты из копии, так как мы храним только данные
            delete newPartData.mesh;
            delete newPartData.edges;

            // Применяем изменения к КОПИИ в зависимости от индекса
            if (newPartData.doorIndex === 0) { // Полотно
                newPartData.width = newCanvasWidth;
                newPartData.height = newCanvasHeight;
                newPartData.depth = params.defaultCanvasDepth;
                newPartData.offsetAlongWall = newOffsetAlongWall;
                newPartData.offsetBottom = newOffsetBottom;
                newPartData.offsetFromParentWall = (5 - params.defaultCanvasDepth * 1000) / 1000;
            } else if (newPartData.doorIndex === 1) { // Наличник справа
                newPartData.width = newFrameWidth;
                newPartData.height = newCanvasHeight + newFrameWidth;
                newPartData.depth = newFrameThickness;
                newPartData.offsetAlongWall = newOffsetAlongWall + newCanvasWidth;
                newPartData.offsetBottom = newOffsetBottom;
                newPartData.offsetFromParentWall = 0;
            } else if (newPartData.doorIndex === 2) { // Наличник слева
                newPartData.width = newFrameWidth;
                newPartData.height = newCanvasHeight + newFrameWidth;
                newPartData.depth = newFrameThickness;
                newPartData.offsetAlongWall = newOffsetAlongWall - newFrameWidth;
                newPartData.offsetBottom = newOffsetBottom;
                newPartData.offsetFromParentWall = 0;
            } else if (newPartData.doorIndex === 3) { // Верхний наличник
                newPartData.width = newCanvasWidth; // <== КЛЮЧЕВОЙ МОМЕНТ
                newPartData.height = newFrameWidth;
                newPartData.depth = newFrameThickness;
                newPartData.offsetAlongWall = newOffsetAlongWall;
                newPartData.offsetBottom = newOffsetBottom + newCanvasHeight;
                newPartData.offsetFromParentWall = 0;
            }
            
            // Возвращаем "чистый" объект с данными
            return newPartData;
        });

        // 4. Создаем и выполняем команду
        const command = new UpdateObjectsGroupCommand(partsToUpdate, newStates, oldStates);
        historyManager.execute(command);
        
        hideWindowMenu();
        removeHighlight(obj.mesh);
        selectedCabinets = [];
        selectedCabinet = null;
        requestRender();
        return;
    }

    // --- Логика для ОДИНОЧНЫХ объектов (окно, розетка) ---
    
    // 1. Сохраняем старое состояние
    const { mesh, edges, ...oldStateData } = obj;
    const oldState = JSON.parse(JSON.stringify(oldStateData));
    
    // 2. Создаем объект с новым состоянием
    const newState = { ...oldState }; // Начинаем с копии старого
    
    if (type === 'window' || type === 'radiator' || type === 'column' || type === 'apron') {
        newState.width = parseFloat(document.getElementById('windowWidth').value) / 1000;
        newState.height = parseFloat(document.getElementById('windowHeight').value) / 1000;
        newState.depth = parseFloat(document.getElementById('windowDepth').value) / 1000;
        newState.offsetAlongWall = parseFloat(document.getElementById('windowoffsetAlongWallEdge').value) / 1000;
        newState.offsetBottom = parseFloat(document.getElementById('windowOffsetBottomEdge').value) / 1000;
        newState.offsetFromParentWall = parseFloat(document.getElementById('windowoffsetFromParentWall').value) / 1000 || 0;
    } else if (type === 'socket') {
        const socketWidthMm = eval(document.getElementById('socketWidth').value);
        const offsetAlongWallCenter = eval(document.getElementById('socketoffsetAlongWallCenter').value);
        const offsetBottomCenter = eval(document.getElementById('socketOffsetBottomCenter').value);
        newState.offsetAlongWall = (offsetAlongWallCenter - socketWidthMm / 2) / 1000;
        newState.offsetBottom = (offsetBottomCenter - socketWidthMm / 2) / 1000;
        newState.offsetFromParentWall = eval(document.getElementById('socketoffsetFromParentWall').value) / 1000 || 0;
        newState.width = socketWidthMm / 1000;
        newState.height = socketWidthMm / 1000;
    }
    
    // 3. Создаем и выполняем команду
    const command = new UpdateSimpleObjectCommand(obj, newState, oldState);
    historyManager.execute(command);

    // Скрываем UI
    removeHighlight(obj.mesh);
    selectedCabinets = [];
    selectedCabinet = null;
    if (type === 'socket') hideSocketMenu();
    else hideWindowMenu();
    requestRender();
}

/**
 * НОВАЯ ЦЕНТРАЛЬНАЯ ФУНКЦИЯ
 * Проходится по всем шкафам и столешницам и обновляет их 3D-позиции
 * в соответствии с новыми размерами комнаты.
 * Вызывается после createCube.
 */
function updateAllPositionsAfterRoomResize() {
    console.log("[updateAllPositions] Запуск обновления позиций после изменения размеров комнаты...");

    // --- 1. Обновление позиций ШКАФОВ ---
    const allCabinets = objectManager.getAllCabinets();
    console.log(`  - Обновление ${allCabinets.length} шкафов...`);
    allCabinets.forEach(cabinet => {
        if (typeof cabinet.updatePosition === 'function') {
            cabinet.updatePosition();
        } else {
            console.warn(`У шкафа ${cabinet.id_data} нет метода updatePosition.`);
        }
    });

    // --- 2. Обновление позиций СТОЛЕШНИЦ ---
    console.log(`  - Обновление ${countertops.length} столешниц...`);
    countertops.forEach(ct => {
        if (!ct || !ct.userData) return;

        // Используем логику, "украденную" из createCountertopFromData
        const { wallId, offsetAlongWall, length, depth } = ct.userData;
        const oldY = ct.position.y; // Y-координату не трогаем, ее меняет UpdateGlobalParamsCommand
        let newX, newZ, newRotY = ct.rotation.y;

        // Получаем новые размеры комнаты
        const roomLength = roomDimensions.getLength();
        const roomDepth = roomDimensions.getHeight(); // Z-размер

        switch (wallId) {
            case 'Back':
                newX = (offsetAlongWall || 0) + length / 2 - roomLength / 2;
                newZ = -roomDepth / 2 + depth / 2;
                newRotY = 0;
                break;
            case 'Front':
                newX = (offsetAlongWall || 0) + length / 2 - roomLength / 2;
                newZ = roomDepth / 2 - depth / 2;
                newRotY = 0;
                break;
            case 'Left':
                newX = -roomLength / 2 + depth / 2;
                newZ = (offsetAlongWall || 0) + length / 2 - roomDepth / 2;
                newRotY = Math.PI / 2;
                break;
            case 'Right':
                newX = roomLength / 2 - depth / 2;
                newZ = (offsetAlongWall || 0) + length / 2 - roomDepth / 2;
                newRotY = -Math.PI / 2;
                break;
            case 'Bottom':
                // Для свободно стоящих столешниц позиция зависит от шкафа,
                // который уже был передвинут. Нам нужно найти этот шкаф и пересчитать.
                const parentCabinet = allCabinets.find(cab => cab.mesh.uuid === ct.userData.cabinetUuid);
                if (parentCabinet) {
                    // Эту логику нужно будет дописать, она сложнее.
                    // Пока просто оставим ее на месте.
                    console.log(`  - Столешница ${ct.uuid} на 'острове'. Требуется дополнительная логика для обновления.`);
                    newX = ct.position.x; // Временно не двигаем
                    newZ = ct.position.z;
                }
                break;
            default:
                // Если тип неизвестен, не двигаем
                newX = ct.position.x;
                newZ = ct.position.z;
                break;
        }

        // Применяем новые X, Z и вращение, сохраняя старый Y
        ct.position.set(newX, oldY, newZ);
        ct.rotation.y = newRotY;
    });
    
    console.log("[updateAllPositions] Обновление позиций завершено.");
}

// Сделайте эту функцию доступной глобально, чтобы ее могла вызвать applySize
window.updateAllPositionsAfterRoomResize = updateAllPositionsAfterRoomResize;

//const rotateXSlider = document.getElementById('rotateX');
//const rotateYSlider = document.getElementById('rotateY');
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
    hideAllDimensionInputs();
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
    const objectToRemove = windows[windowIndex];
    if (!objectToRemove) return;

    const groupId = objectToRemove.groupId;

    if (groupId) {
        // --- Логика для ГРУППЫ (дверь) ---
        
        // 1. Находим все части группы, которые нужно удалить
        const partsToRemove = windows.filter(w => w.groupId === groupId);

        // 2. Создаем и выполняем ОДНУ команду для всей группы
        if (partsToRemove.length > 0) {
            const command = new RemoveGroupCommand(scene, windows, partsToRemove);
            historyManager.execute(command);
        }

    } else {
        // --- Логика для ОДИНОЧНОГО объекта (окно, розетка) ---
        const command = new RemoveObjectCommand(scene, windows, objectToRemove);
        historyManager.execute(command);
    }

    // Скрываем UI
    hideWindowMenu();
    hideSocketMenu();
}

/**
 * Показывает контекстное меню специально для Фартука.
 * (Исправленная версия с авто-позиционированием и кнопками)
 */
function showApronMenu(x, y, apronObject) {
    hideAllDimensionInputs();
    
    let menu = document.getElementById('apronMenu');
    if (menu) menu.remove();

    menu = document.createElement('div');
    menu.id = 'apronMenu';
    menu.className = 'popup-menu';
    menu.style.height = 'auto'; 
    menu.style.maxHeight = '90vh';
    document.body.appendChild(menu);

    // === 1. СОХРАНЯЕМ ИСХОДНОЕ СОСТОЯНИЕ (для отмены) ===
    // Копируем данные (без 3D объектов)
    const { mesh, edges, ...initialData } = apronObject;
    const oldState = JSON.parse(JSON.stringify(initialData));

    // Подготовка значений для UI
    const wMm = Math.round(apronObject.width * 1000);
    const hMm = Math.round(apronObject.height * 1000);
    const dMm = Math.round(apronObject.depth * 1000);
    
    const type = apronObject.apronType || 'panel';
    const tW = apronObject.tileWidth || 200;
    const tH = apronObject.tileHeight || 100;
    const tGap = apronObject.tileGap !== undefined ? apronObject.tileGap : 3;
    const tOffset = apronObject.tileRowOffset || 0;
    const orientation = apronObject.textureOrientation || 'horizontal';
    const tileDir = apronObject.tileLayoutDirection || 'horizontal';

    menu.innerHTML = `
        <h3>Параметры фартука</h3>
        <div class="menu-content">
            <label>Тип фартука:
                <select id="apronTypeSelect">
                    <option value="panel" ${type === 'panel' ? 'selected' : ''}>Скиналь (Панель)</option>
                    <option value="tiles" ${type === 'tiles' ? 'selected' : ''}>Плитка</option>
                </select>
            </label>

            <label>Ширина, мм: <input type="number" id="apronTotalWidth" value="${wMm}"></label>
            <label>Высота, мм: <input type="number" id="apronTotalHeight" value="${hMm}"></label>
            <label>Толщина, мм: <input type="number" id="apronDepth" value="${dMm}"></label>

            <div id="tileSettingsBlock" style="display: ${type === 'tiles' ? 'block' : 'none'}; border-top: 1px solid #eee; margin-top: 5px; padding-top: 5px;">
                <label style="font-weight:bold; font-size:12px; margin-bottom:5px;">Настройки плитки:</label>
                <label>Направление рядов:
                    <select id="apronTileDir">
                        <option value="horizontal" ${tileDir === 'horizontal' ? 'selected' : ''}>Горизонтально</option>
                        <option value="vertical" ${tileDir === 'vertical' ? 'selected' : ''}>Вертикально</option>
                    </select>
                </label>
                <label>Ширина плитки, мм: <input type="number" id="apronTileWidth" value="${tW}"></label>
                <label>Высота плитки, мм: <input type="number" id="apronTileHeight" value="${tH}"></label>
                <label>Зазор (шов), мм: <input type="number" id="apronTileGap" value="${tGap}"></label>
                <label>Смещение рядов, %: <input type="number" id="apronTileOffset" value="${tOffset}"></label>
            </div>

            <div id="panelSettingsBlock" style="display: ${type === 'panel' ? 'block' : 'none'}; margin-top: 5px;">
                 <label>Направление текстуры:
                    <select id="apronTexOrient">
                        <option value="horizontal" ${orientation === 'horizontal' ? 'selected' : ''}>Горизонтально</option>
                        <option value="vertical" ${orientation === 'vertical' ? 'selected' : ''}>Вертикально</option>
                    </select>
                </label>
            </div>

            <button id="apronMaterialBtn" style="margin-top:10px; background-color:#17a2b8; color:white; border:none; padding:8px; border-radius:3px; cursor:pointer;">Выбрать материал</button>
        </div>

        <div class="menu-buttons" style="margin-top: auto; padding-top: 15px; border-top: 1px solid #eee; display: flex; gap: 5px;">
            <button id="apronApplyBtn" style="background-color: #28a745; color: white; flex-grow: 1;">Применить</button>
            <button id="apronCancelBtn" style="background-color: #6c757d; color: white; flex-grow: 1;">Отмена</button>
            <button id="apronDeleteBtn" style="background-color: #dc3545; color: white; flex-grow: 1;">Удалить</button>
        </div>
    `;

    // Позиционирование (код тот же)
    const repositionMenu = () => {
        const rect = menu.getBoundingClientRect();
        let newTop = y;
        if (newTop + rect.height > window.innerHeight - 10) {
            newTop = window.innerHeight - rect.height - 10;
        }
        if (newTop < 10) newTop = 10;
        menu.style.top = `${newTop}px`;
        let newLeft = x;
        if (newLeft + rect.width > window.innerWidth - 10) {
            newLeft = window.innerWidth - rect.width - 10;
        }
        menu.style.left = `${newLeft}px`;
    };
    menu.style.left = `${x}px`; menu.style.top = `${y}px`;
    setTimeout(repositionMenu, 0);

    // === LIVE PREVIEW ФУНКЦИЯ ===
    // Считывает данные из UI и обновляет 3D модель БЕЗ записи в историю
    const updatePreview = () => {
        const newState = getApronDataFromUI();

        // ЗАЩИТА UI: Если значения некорректны (пусто, 0 или слишком мало), не перестраиваем
        // Это предотвратит попытки построить фартук из плитки размером "1" (пока ты пишешь "100")
        if (newState.apronType === 'tiles') {
             if (!newState.tileWidth || newState.tileWidth < 10) return; // меньше 10мм не строим
             if (!newState.tileHeight || newState.tileHeight < 10) return;
        }
        
        // Удаляем старый меш
        if (apronObject.mesh) {
            if (apronObject.mesh.parent) apronObject.mesh.parent.remove(apronObject.mesh);
            // dispose... (для оптимизации можно пропускать при частом обновлении, но лучше делать)
        }
        
        // Строим новый
        const buildParams = {
            width: newState.width,
            height: newState.height,
            depth: newState.depth,
            apronType: newState.apronType,
            materialData: apronObject.materialData, // Материал пока старый (или временный)
            tileParams: {
                width: newState.tileWidth,
                height: newState.tileHeight,
                gap: newState.tileGap,
                rowOffset: newState.tileRowOffset,
                layoutDirection: newState.tileLayoutDirection
            },
            textureOrientation: newState.textureOrientation
        };

        const newMesh = buildApronGeometry(buildParams);
        
        // Важно: Привязываем новый меш к объекту данных
        apronObject.mesh = newMesh;
        
        // Восстанавливаем ссылку на hitBox (для выделения)
        // ВНИМАНИЕ: это делает ApronBuilder внутри себя (group.userData.hitBox)
        
        // Добавляем на сцену
        window.scene.add(newMesh);
        
        // Позиционируем
        // Для превью обновляем данные в объекте, но если нажмем отмену - откатим
        Object.assign(apronObject, newState); 
        window.updateSimpleObjectPosition(apronObject);
        
        // ВОССТАНАВЛИВАЕМ ПОДСВЕТКУ (HIGHLIGHT)
        // Так как меш новый, старый highlight (BoxHelper) сломался.
        if (window.selectedCabinet === apronObject) {
            window.applyHighlight(newMesh); // Твоя функция выделения
        }

        window.requestRender();
    };

    // Функция сбора данных
    const getApronDataFromUI = () => {
        return {
            width: parseFloat(document.getElementById('apronTotalWidth').value) / 1000,
            height: parseFloat(document.getElementById('apronTotalHeight').value) / 1000,
            depth: parseFloat(document.getElementById('apronDepth').value) / 1000,
            apronType: document.getElementById('apronTypeSelect').value,
            
            tileWidth: parseFloat(document.getElementById('apronTileWidth').value),
            tileHeight: parseFloat(document.getElementById('apronTileHeight').value),
            tileGap: parseFloat(document.getElementById('apronTileGap').value),
            tileRowOffset: parseFloat(document.getElementById('apronTileOffset').value),
            tileLayoutDirection: document.getElementById('apronTileDir').value,
            
            textureOrientation: document.getElementById('apronTexOrient').value,

            // === ВАЖНОЕ ДОБАВЛЕНИЕ ===
            // Переносим данные о материале из текущего объекта в новое состояние
            materialData: apronObject.materialData 
        };
    };

    // === LISTENERS ===
    const typeSelect = document.getElementById('apronTypeSelect');
    const tileBlock = document.getElementById('tileSettingsBlock');
    const panelBlock = document.getElementById('panelSettingsBlock');
    
    // Вешаем updatePreview на все инпуты
    const inputs = menu.querySelectorAll('input, select');
    inputs.forEach(el => {
        el.addEventListener('input', updatePreview);
        el.addEventListener('change', updatePreview); // Для селектов
    });

    // Спец-обработка для переключения типа (видимость блоков)
    typeSelect.addEventListener('change', (e) => {
        if (e.target.value === 'tiles') {
            tileBlock.style.display = 'block';
            panelBlock.style.display = 'none';
        } else {
            tileBlock.style.display = 'none';
            panelBlock.style.display = 'block';
        }
        repositionMenu();
    });

    // === BUTTONS ===
    document.getElementById('apronApplyBtn').onclick = () => {
        const finalState = getApronDataFromUI();
        // В объекте apronObject уже лежат новые данные (из-за preview), 
        // но нам нужно сформировать Команду Undo/Redo.
        
        // Чтобы команда сработала корректно (Undo возвращало oldState),
        // мы создаем команду перехода oldState -> finalState.
        
        // НЮАНС: preview уже изменил apronObject "грязно".
        // Мы можем либо просто зарегистрировать команду (и она сама при execute перезапишет),
        // либо откатить preview и выполнить команду чисто. 
        // Проще всего: выполнить команду. Она пересоздаст меш еще раз (не страшно) и запишет в стек.
        
        const command = new UpdateApronCommand(apronObject, finalState, oldState);
        historyManager.execute(command);

        // === ИСПРАВЛЕНИЕ ПЕРВОГО КЛИКА ===
        // Принудительно очищаем выделение, чтобы следующий клик по фартуку
        // считался "новым выделением", а не "снятием текущего".
        if (window.clearSelection) {
            clearSelection();
        } else {
            // Если функции clearSelection нет, делаем вручную:
            selectedCabinets = [];
            selectedCabinet = null;
            hideAllDimensionInputs();
            if (window.removeHighlight && apronObject.mesh) {
                removeHighlight(apronObject.mesh);
            }
        }
        // ================================
        
        menu.remove();
        if (requestRender) requestRender();
    };

    document.getElementById('apronCancelBtn').onclick = () => {
        // ОТКАТ (Revert)
        // Так как мы меняли объект "на живую", нужно вернуть всё как было
        const command = new UpdateApronCommand(apronObject, oldState, apronObject); 
        // Не пушим в историю, просто выполняем метод восстановления
        command._applyState(oldState); 
        requestRender();
        
        menu.remove();
    };

    document.getElementById('apronDeleteBtn').onclick = () => {
        deleteWindow(windows.indexOf(apronObject));
        menu.remove();
    };
    
    document.getElementById('apronMaterialBtn').onclick = () => {
        // 1. Считываем актуальный тип фартука из селекта (вдруг пользователь его переключил, но не применил)
        const currentTypeUI = document.getElementById('apronTypeSelect').value;
        
        // 2. Вызываем окно выбора
        // Если модули не работают напрямую, убедись что openApronMaterialPicker доступна (например через window)
        const pickerFunc = window.openApronMaterialPicker || openApronMaterialPicker;
        
        pickerFunc(apronObject, currentTypeUI, (newMaterialData) => {
            // === КОЛЛБЕК ПОСЛЕ ВЫБОРА ===
            console.log("Выбран материал:", newMaterialData);

            // 1. Обновляем данные объекта (временно, для превью)
            // Мы сохраняем и ID, и тип (откуда этот ID пришел)
            apronObject.materialData = {
                id: newMaterialData.id,
                type: newMaterialData.type
            };
            
            // 2. Запускаем Live Preview
            // Функция updatePreview определена внутри showApronMenu и использует getApronDataFromUI
            // Важно: updatePreview внутри себя вызывает buildApronGeometry, 
            // которая дергает MaterialManager.getApronMaterial, передавая туда наш новый materialData.
            updatePreview(); 
        });
    };
}

function showPlinthMenu(x, y, plinthObject) {
    hideAllDimensionInputs();
    // Удаляем старые
    let menu = document.getElementById('plinthMenu');
    if (menu) menu.remove();

    menu = document.createElement('div');
    menu.id = 'plinthMenu';
    menu.className = 'popup-menu'; // Твой стиль
    document.body.appendChild(menu);

    menu.innerHTML = `
        <h3>Цоколь</h3>
        <div class="menu-content">
            <button id="plinthMaterialBtn">Выбрать материал</button>
        </div>
        <div class="menu-buttons">
            <!-- Кнопки действий. Классы или ID для стилизации -->
            <button id="plinthApplyBtn" style="display:none">Применить</button> <!-- Скрыта, т.к. пока нечего применять -->
            <button id="plinthCancelBtn">Отмена</button>
            <button id="plinthDeleteBtn">Удалить</button>
        </div>
    `;

    // Позиционирование (код тот же)
    const repositionMenu = () => {
        const rect = menu.getBoundingClientRect();
        let newTop = y;
        if (newTop + rect.height > window.innerHeight - 10) {
            newTop = window.innerHeight - rect.height - 10;
        }
        if (newTop < 10) newTop = 10;
        menu.style.top = `${newTop}px`;
        let newLeft = x;
        if (newLeft + rect.width > window.innerWidth - 10) {
            newLeft = window.innerWidth - rect.width - 10;
        }
        menu.style.left = `${newLeft}px`;
    };
    menu.style.left = `${x}px`; menu.style.top = `${y}px`;
    setTimeout(repositionMenu, 0);

    // Обработчики
    document.getElementById('plinthDeleteBtn').onclick = () => {
        // Используем команду удаления
        const command = new RemoveObjectCommand(window.scene, window.plinths, plinthObject);
        historyManager.execute(command);
        menu.remove();
        selectedCabinets = []; // Сброс выделения
        requestRender();
    };

    document.getElementById('plinthMaterialBtn').onclick = () => {
         const picker = openPlinthMaterialPicker;
         const { mesh, ...dataToSave } = plinthObject;

          picker(plinthObject, (selectedMaterial) => {
            // 1. Сохраняем выбор в данные
            // Мы сохраняем весь объект декора, чтобы потом восстановить
            // (или можно только ID, если потом найдем в базе)
            // Для спец. цветов лучше сохранить весь объект.
            
            // 2. Выполняем команду обновления
            const oldState = JSON.parse(JSON.stringify(dataToSave));
            const newState = JSON.parse(JSON.stringify(dataToSave));
            newState.materialData = selectedMaterial;
            
            console.log("Main: Selected Material:", selectedMaterial); // <--- ЛОГ 1

            const command = new UpdatePlinthCommand(plinthObject, newState, oldState);
            historyManager.execute(command);
            
            requestRender();
        });
    };

    document.getElementById('plinthCancelBtn').onclick = () => menu.remove();
}

/**
 * Применяет изменения из меню к объекту Фартука.
 */
function applyApronChanges(apronObj) {
    const index = windows.indexOf(apronObj);
    if (index === -1) return;

    // 1. Сохраняем старое состояние (Deep copy)
    // Важно скопировать все поля данных, исключая тяжелые 3D объекты
    const { mesh, edges, ...oldData } = apronObj;
    const oldState = JSON.parse(JSON.stringify(oldData));

    // 2. Считываем данные из формы
    const newType = document.getElementById('apronTypeSelect').value;
    
    // Формируем новое состояние
    const newState = {
        ...oldState,
        width: parseFloat(document.getElementById('apronTotalWidth').value) / 1000,
        height: parseFloat(document.getElementById('apronTotalHeight').value) / 1000,
        depth: parseFloat(document.getElementById('apronDepth').value) / 1000,
        apronType: newType,
        
        // Поля плитки
        tileWidth: parseFloat(document.getElementById('apronTileWidth').value),
        tileHeight: parseFloat(document.getElementById('apronTileHeight').value),
        tileGap: parseFloat(document.getElementById('apronTileGap').value),
        tileRowOffset: parseFloat(document.getElementById('apronTileOffset').value),
        tileLayoutDirection: document.getElementById('apronTileDir') ? document.getElementById('apronTileDir').value : 'horizontal',
        
        // Поля панели
        textureOrientation: document.getElementById('apronTexOrient').value,

        // Если был выбран новый материал (сохранен во временное поле), применяем его
        // materialData: apronObj.pendingMaterial || oldState.materialData
    };
    
    // Очищаем временное поле
    // delete apronObj.pendingMaterial;

    // 3. Выполняем команду
    const command = new UpdateApronCommand(apronObj, newState, oldState);
    historyManager.execute(command);

    // Сброс выделения
    removeHighlight(apronObj.mesh);
    selectedCabinets = [];
    selectedCabinet = null;
}

/**
 * Показывает контекстное меню для техники (варочная панель, мойка).
 */
function showApplianceMenu(x, y, appliance) {
    hideAllDimensionInputs();
    
    // 1. Удаляем старое меню
    const oldMenu = document.getElementById('applianceMenu');
    if (oldMenu) oldMenu.remove();

    // 2. Создаем DOM
    const menu = document.createElement('div');
    menu.id = 'applianceMenu';
    menu.className = 'popup-menu'; // Используем ваш общий стиль
    // Если стиля нет, добавьте базовые стили прямо здесь:
    if (!menu.className) {
        menu.style.position = 'absolute';
        menu.style.background = '#fff';
        menu.style.border = '1px solid #ccc';
        menu.style.padding = '10px';
        menu.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
        menu.style.zIndex = '2000';
    }
    document.body.appendChild(menu);

    // 3. Данные
    const currentWidth = appliance.userData.widthType || '600';
    const currentColor = appliance.userData.colorType || 'black';
    const currentType = appliance.userData.applianceType || 'induction';
    const currentSinkMaterial = appliance.userData.sinkMaterial || 'steel';

    // Определяем заголовок
    const title = appliance.userData.type === 'hob' ? 'Варочная панель' : 'Мойка';

    // 4. HTML
    let html = `<h3 style="margin: 0 0 10px 0; font-size: 14px;">${title}</h3>`;
    html += `<div class="menu-content" style="display: flex; flex-direction: column; gap: 5px;">`;
    
    // Селекты (пока только для варочной)
    if (appliance.userData.type === 'hob') {
        html += `<label>Тип: <select id="applianceType">
                    <option value="induction" ${currentType === 'induction' ? 'selected' : ''}>Индукция</option>
                    <option value="gas" ${currentType === 'gas' ? 'selected' : ''}>Газ</option>
                 </select></label>`;

        html += `<label>Ширина: <select id="applianceWidth">
                    <option value="600" ${currentWidth === '600' ? 'selected' : ''}>600 мм (4 конфорки)</option>
                    <option value="450" ${currentWidth === '450' ? 'selected' : ''}>450 мм (3 конфорки)</option>
                    <option value="300" ${currentWidth === '300' ? 'selected' : ''}>300 мм (2 конфорки)</option>
                 </select></label>`;
                 
        html += `<label>Цвет: <select id="applianceColor">
                    <option value="black" ${currentColor === 'black' ? 'selected' : ''}>Черный</option>
                    <option value="white" ${currentColor === 'white' ? 'selected' : ''}>Белый</option>
                 </select></label>`;
    }

    if (appliance.userData.type === 'sink_model') {
        html += `<label>Материал: <select id="sinkMaterial">
                    <option value="steel" ${currentSinkMaterial === 'steel' ? 'selected' : ''}>Нержавеющая сталь</option>
                    <option value="stone" ${currentSinkMaterial === 'stone' ? 'selected' : ''}>Искусственный камень</option>
                 </select></label>`;
    }
    
    // Кнопки
    html += `<button type="button" id="centerApplianceBtn" style="margin-top: 10px; background-color: #17a2b8; color: white; padding: 5px;">Центрировать по шкафу</button>`;
    html += `<button type="button" id="deleteApplianceBtn" style="margin-top: 5px; background-color: #dc3545; color: white; padding: 5px;">Удалить</button>`;
    html += `<button type="button" id="closeApplianceMenuBtn" style="margin-top: 10px; background-color: #6c757d; color: white; padding: 5px;">ок</button>`;
    html += `</div>`;

    menu.innerHTML = html;

    // 5. Обработчики

    // --- Удаление ---
    menu.querySelector('#deleteApplianceBtn').addEventListener('click', () => {
        const target = parentCountertop.children.find(c => c.userData && c.userData.id === currentApplianceId);
        if (target) {
            const command = new RemoveApplianceCommand(parentCountertop, target);
            historyManager.execute(command);
        }

        const parent = appliance.parent;
        if (parent && parent.userData && parent.userData.appliances) {
            // Удаляем из данных родителя
            const index = parent.userData.appliances.findIndex(a => a.id === appliance.userData.id);
            if (index > -1) parent.userData.appliances.splice(index, 1);
        }
        
        // Удаляем меш
        if (parent) parent.remove(appliance);
        
        // TODO: Dispose geometry/material
        
        menu.remove();
        selectedCabinets = [];
        //updateDimensionsInputPosition(null);
        requestRender();
    });

    // --- Центрирование ---
    menu.querySelector('#centerApplianceBtn').addEventListener('click', () => {
        const target = parentCountertop.children.find(c => c.userData && c.userData.id === currentApplianceId);
        if (target) {
            alignApplianceToNearestCabinet(target);
        }
        menu.remove();
        // Обновляем размеры (если они были показаны)
        showApplianceDimensions(appliance);
        requestRender();
    });

     menu.querySelector('#closeApplianceMenuBtn').addEventListener('click', () => {
        menu.remove();
        // Можно снять выделение, если хотите, или оставить
        selectedCabinets = []; 
        //updateDimensionsInputPosition(null);
        requestRender();
    });

    if (appliance.userData.type === 'sink_model') {
        const updateSinkModel = () => {
            const newMaterial = menu.querySelector('#sinkMaterial').value;
            
            // Явный выбор имени файла
            let newModelName;
            if (newMaterial === 'steel') {
                newModelName = 'sink_inox.glb';
            } else if (newMaterial === 'stone') {
                newModelName = 'sink_stone.glb';
            }

            // --- Дальше стандартная логика обновления (как для варочной) ---
            
            // Ищем АКТУАЛЬНЫЙ объект меша
            const currentMesh = parentCountertop.children.find(c => c.userData && c.userData.id === currentApplianceId);
            if (!currentMesh) return;

            // Проверка на изменения
            if (currentMesh.userData.modelName === newModelName) return;

            const oldData = { 
                modelName: currentMesh.userData.modelName,
                sinkMaterial: currentMesh.userData.sinkMaterial,
                // ... другие поля, если есть
            };
            const newData = {
                modelName: newModelName,
                sinkMaterial: newMaterial,
                // ...
            };
            
            const command = new UpdateApplianceCommand(currentMesh, newData, oldData);
            historyManager.execute(command);
            
            // Обновляем ссылку
            const newMeshRef = parentCountertop.children.find(c => c.userData && c.userData.id === currentApplianceId);
            if (newMeshRef) appliance = newMeshRef;
            
            requestRender();
        };
        
        menu.querySelector('#sinkMaterial').addEventListener('change', updateSinkModel);
    }

    const currentApplianceId = appliance.userData.id;
    const parentCountertop = appliance.parent;

    // --- Изменение параметров ---
    if (appliance.userData.type === 'hob') {
        const updateModel = () => {
            const newType = menu.querySelector('#applianceType').value;
            const newWidth = menu.querySelector('#applianceWidth').value;
            const newColor = menu.querySelector('#applianceColor').value;

            const typePrefix = newType === 'induction' ? 'induct' : 'gas';
            const colorSuffix = newColor === 'white' ? 'w' : 'black';
            const newModelName = `${typePrefix}_${newWidth}_${colorSuffix}.glb`;
            
            // Ищем АКТУАЛЬНЫЙ объект меша
            // (делаем это в самом начале, до любых изменений)
            const currentMesh = parentCountertop.children.find(c => c.userData && c.userData.id === currentApplianceId);
        
            if (!currentMesh) {
                console.error("Не удалось найти актуальный меш для обновления меню!");
                return;
            }

            // ВАЖНО: Проверка на изменения
            if (currentMesh.userData.modelName === newModelName) {
                console.log("Модель не изменилась, пропускаем.");
                return;
            }

            // 1. Формируем oldData из ТЕКУЩЕГО (нетронутого) состояния
            const oldData = { 
                modelName: currentMesh.userData.modelName,
                widthType: currentMesh.userData.widthType,
                colorType: currentMesh.userData.colorType,
                applianceType: currentMesh.userData.applianceType // Добавил, чтобы было полно
            };

            // 2. Формируем newData
            const newData = {
                modelName: newModelName,
                widthType: newWidth,
                colorType: newColor,
                applianceType: newType
            };
            
            // 3. Создаем и выполняем команду
            // Команда сама вызовет replaceApplianceModel и обновит userData
            const command = new UpdateApplianceCommand(currentMesh, newData, oldData);
            historyManager.execute(command);

            // 4. Обновляем ссылку на appliance в замыкании (для следующих кликов)
            // Ищем меш заново, так как команда его заменила
            const newMesh = parentCountertop.children.find(c => c.userData && c.userData.id === currentApplianceId);
            if (newMesh) {
                appliance = newMesh; 
            }
            
            // Убрали блок `if (newModelName !== ...)`, так как все делает команда
            // Убрали ручное обновление userData
            
            requestRender();
        };

        menu.querySelector('#applianceType').addEventListener('change', updateModel);
        menu.querySelector('#applianceWidth').addEventListener('change', updateModel);
        menu.querySelector('#applianceColor').addEventListener('change', updateModel);
    }

    // 6. Позиционирование и показ
    menu.style.left = `${x + 20}px`;
    menu.style.top = `${y - 50}px`;
    menu.style.display = 'block';
    
    // Коррекция позиции (чтобы не вылезало за экран)
    setTimeout(() => {
        const menuRect = menu.getBoundingClientRect();
        if (menuRect.right > window.innerWidth) menu.style.left = `${window.innerWidth - menuRect.width - 10}px`;
        if (menuRect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - menuRect.height - 10}px`;
    }, 0);
}

function alignApplianceToNearestCabinet(appliance) {
    const parentCountertop = appliance.parent;
    const wallId = parentCountertop.userData.wallId;
    if (!wallId || wallId === 'Bottom') return;

    // 1. Запоминаем старое состояние
    const oldPos = appliance.position.clone();
    const oldDist = appliance.userData.distFromLeft;

    const allCabinets = objectManager.getAllCabinets();
    
    // Упростим: найдем центр варочной в МИРОВЫХ координатах
    const applianceWorldPos = new THREE.Vector3();
    appliance.getWorldPosition(applianceWorldPos);

    let bestCabinet = null;
    let minDistance = Infinity;

    allCabinets.forEach(cab => {
        if (cab.type === 'lowerCabinet' && cab.wallId === wallId) {
            // Центр шкафа в мировых
            const cabWorldPos = cab.mesh.position; // Центр
            
            // Расстояние между центрами (на плоскости стены)
            let distance;
            if (wallId === 'Back' || wallId === 'Front') {
                distance = Math.abs(cabWorldPos.x - applianceWorldPos.x);
            } else {
                distance = Math.abs(cabWorldPos.z - applianceWorldPos.z);
            }

            if (distance < 0.5 && distance < minDistance) { // < 500мм
                minDistance = distance;
                bestCabinet = cab;
            }
        }
    });

    if (bestCabinet) {
        // 2. Вычисляем новое положение
        // Переводим мировой центр шкафа в локальную систему столешницы
        const targetLocalPos = parentCountertop.worldToLocal(bestCabinet.mesh.position.clone());
        
        // Создаем вектор для новой позиции, копируя старую и меняя только X
        const newPos = oldPos.clone();
        newPos.x = targetLocalPos.x;

        // Вычисляем новый отступ
        const newDist = newPos.x - (-parentCountertop.userData.length / 2);
        
        // 3. Создаем и выполняем команду
        // (Команда сама применит newPos и newDist к объекту)
        const command = new UpdateAppliancePosCommand(appliance, newPos, oldPos, newDist, oldDist);
        historyManager.execute(command);

        console.log(`Варочная отцентрована по шкафу ${bestCabinet.id_data}`);
        // updateDimensionsInputPosition вызовется внутри execute команды или при рендере
    } else {
        console.log("Подходящий шкаф для центрирования не найден.");
    }
}

/**
 * Заменяет 3D-модель техники, сохраняя позицию и параметры.
 * @param {THREE.Mesh} oldAppliance - Текущий объект техники.
 * @param {string} newModelName - Имя файла новой модели.
 * @returns {THREE.Mesh} Новый объект техники.
 */
function replaceApplianceModel(oldAppliance, newModelName) {
    const parent = oldAppliance.parent;
    if (!parent) return null;

    if (oldAppliance.userData.isHighlighted) {
        removeHighlight(oldAppliance);
    }

    // 1. Получаем новую модель
    const newMesh = getPreloadedModelClone(newModelName);
    if (!newMesh) {
        console.error(`Модель ${newModelName} не найдена!`);
        return null;
    }

    // 2. Копируем трансформации
    newMesh.position.copy(oldAppliance.position);
    newMesh.rotation.copy(oldAppliance.rotation);
    newMesh.scale.copy(oldAppliance.scale);

    // 3. Копируем и обновляем userData
    newMesh.userData = { ...oldAppliance.userData };
    newMesh.userData.isHighlighted = false;
    newMesh.userData.modelName = newModelName;
    // Обновляем widthType и colorType на основе имени файла (если нужно) или они уже обновлены в меню
    // Обновляем размеры выреза, если это мойка
    if (newMesh.userData.type === 'sink_model') {
         if (newModelName === 'sink_stone.glb') {
             newMesh.userData.cutoutSize = { width: 0.480, depth: 0.480 };
         } else {
             newMesh.userData.cutoutSize = { width: 0.480, depth: 0.480 };
         }
    }

    // --- НОВЫЙ БЛОК: Перенос детей (смесителя) ---
    const childrenToMove = [];
    oldAppliance.children.forEach(child => {
        if (child.userData && child.userData.isMixer) {
            removeHighlight(child);
            childrenToMove.push(child);
        }
    });

    childrenToMove.forEach(child => {
        oldAppliance.remove(child); // Удаляем из старой
        newMesh.add(child);         // Добавляем в новую
    });
    // ---------------------------------------------

    // 4. Заменяем в сцене
    parent.remove(oldAppliance);
    parent.add(newMesh);

    // 5. Обновляем ссылку в данных родителя (countertop.userData.appliances)
    const appDataIndex = parent.userData.appliances.findIndex(a => a.id === oldAppliance.userData.id);
    if (appDataIndex > -1) {
        // Обновляем данные в массиве, чтобы они соответствовали новой модели
        parent.userData.appliances[appDataIndex].modelName = newModelName;
        // Также обновляем тип/цвет, если они изменились
        parent.userData.appliances[appDataIndex].widthType = newMesh.userData.widthType;
        parent.userData.appliances[appDataIndex].colorType = newMesh.userData.colorType;
    }

    // 6. Обновляем выделение (иначе меню пропадет или сломается)
    if (selectedCabinets.includes(oldAppliance)) {
        clearSelection(); // Очищаем массив и убираем подсветку со старого (хотя он удален)
        hideAllDimensionInputs(); // Прячем старые размеры
    }

    requestRender();

    return newMesh;
}

/**
 * НОВАЯ ЦЕНТРАЛЬНАЯ ФУНКЦИЯ
 * Находит и удаляет все возможные контекстные меню.
 */
function hideAllContextMenus() {
    // Вызываем все существующие функции скрытия
    if (typeof hideWindowMenu === 'function') hideWindowMenu();
    if (typeof hideSocketMenu === 'function') hideSocketMenu();
    if (typeof hideCabinetMenu === 'function') hideCabinetMenu();
    if (typeof hideCountertopMenu === 'function') hideCountertopMenu();

    // Также ищем и удаляем меню по ID или классу, если они создаются динамически
    const wallMenu = document.querySelector('.context-menu'); // Предполагаем, что у всех меню есть этот класс
    if (wallMenu) {
        wallMenu.remove();
    }
}

// Сделаем эту функцию доступной глобально, чтобы ее мог вызвать menus.js
window.hideAllContextMenus = hideAllContextMenus;



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

function showCabinetMenu(x, y, cabinet) {
    const cabinetIndex = objectManager.getAllCabinets().indexOf(cabinet);
    if (cabinetIndex === -1) {
        console.error("showCabinetMenu: Шкаф не найден.");
        return;
    }

    // 1. ЗАПОМИНАЕМ ИСХОДНОЕ СОСТОЯНИЕ (без изменений)
    initialMenuData.cabinetIndex = objectManager.getAllCabinets().indexOf(cabinet); // Сохраняем индекс
    initialMenuData.originalType = cabinet.cabinetType;
    initialMenuData.originalConfig = cabinet.cabinetConfig;
    initialMenuData.originalWidth = cabinet.width;
    initialMenuData.originalDepth = cabinet.depth;
    initialMenuData.originalHeight = cabinet.height;
    initialMenuData.originalOverhang = cabinet.overhang;
    initialMenuData.originalFacadeGap = cabinet.facadeGap;
    initialMenuData.originalIsMezzanine = cabinet.isMezzanine;

    // 2. СОЗДАНИЕ DOM-ЭЛЕМЕНТА МЕНЮ (без изменений)
    let menu = document.getElementById('cabinetMenu');
    if (menu) menu.remove(); // Всегда пересоздаем меню для чистоты
    menu = document.createElement('div');
    menu.id = 'cabinetMenu';
    menu.className = 'popup-menu';
    document.body.appendChild(menu);

    hideAllDimensionInputs();

    // 3. ГЕНЕРАЦИЯ HTML
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
        html += `<label>Высота, мм: <input type="number" id="cabinetHeight" value="${Math.round(cabinet.height * 1000)}" min="100"${heightDisabledAttr} data-set-prop="height"></label>`;
    } else if (cabinet.type === 'upperCabinet' && !cabinet.isHeightIndependent && cabinet.isMezzanine !== 'normal') { // Для антресолей и под-антресолями высота может быть фиксированной
        // heightDisabledAttr = ' disabled'; // Раскомментируйте, если нужно
    }
    

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
        html += `<label>Свес, мм: <input type="number" id="cabinetOverhang" value="${Math.round((cabinet.overhang ?? 0.018) * 1000)}" min="-100" step="1" data-set-prop="overhang"></label>`;
        html += `<label>Зазор между фасадами, мм: <input type="number" id="cabinetFacadeGap" value="${Math.round((cabinet.facadeGap || 0.003) * 1000)}" min="0" step="1" data-set-prop="facadeGap"></label>`;

    } else if (cabinet.type === 'upperCabinet') {
        const isHeightIndependent = cabinet.isHeightIndependent || false;
        const heightDisabledAttr = isHeightIndependent ? '' : ' disabled';
        const offsetBottomDisabledAttr = isHeightIndependent ? '' : ' disabled';
        const offsetAlongWall = Math.round((cabinet.offsetAlongWall || 0) * 1000);
        const offsetBottom = Math.round((cabinet.offsetBottom || 0) * 1000); // Это будет пересчитано, если isMezzanine меняется
        html += `<label>Высота, мм: <input type="number" id="cabinetHeight" value="${Math.round(cabinet.height * 1000)}" ${heightDisabledAttr} data-set-prop="height"></label>`;
        html += `<label>Расстояние до угла, мм: <input type="number" id="cabinetoffsetAlongWall" value="${offsetAlongWall}" min="0" data-set-prop="offsetAlongWall"></label>`;
        html += `<label>Отступ от пола, мм: <input type="number" id="cabinetOffsetBottom" value="${Math.round(cabinet.offsetBottom * 1000)}" ${offsetBottomDisabledAttr} data-set-prop="offsetBottom"></label>`;
        html += `<label>Отступ от стены, мм: <input type="number" id="cabinetWallOffset" value="${Math.round(cabinet.offsetFromParentWall * 1000)}" data-set-prop="offsetFromParentWall"></label>`;
        html += `<label>Зазор между фасадами, мм: <input type="number" id="cabinetFacadeGap" value="${Math.round((cabinet.facadeGap || 0.003) * 1000)}" min="0" step="1" data-set-prop="facadeGap"></label>`;
        html += `<label style="flex-direction: row; align-items: center;">
                    <input type="checkbox" id="isHeightIndependentCheckbox" ${isHeightIndependent ? 'checked' : ''}>
                    Свободная высота/положение
                 </label>`;
        html += `<label>Тип верхнего шкафа: <select id="mezzanine" data-set-prop="isMezzanine">
                    <option value="normal" ${(cabinet.isMezzanine === 'normal' || !cabinet.isMezzanine) ? 'selected' : ''}>Обычный</option>
                    <option value="mezzanine" ${cabinet.isMezzanine === 'mezzanine' ? 'selected' : ''}>Антресольный</option>
                    <option value="underMezzanine" ${cabinet.isMezzanine === 'underMezzanine' ? 'selected' : ''}>Под антресолями</option>
                 </select></label>`;
    } else { // lowerCabinet у стены
        const offsetAlongWall = Math.round((cabinet.offsetAlongWall || 0) * 1000);
        html += `<label>Расстояние до угла, мм: <input type="number" id="cabinetoffsetAlongWall" value="${offsetAlongWall}" min="0" data-set-prop="offsetAlongWall"></label>`;
        html += `<label>Свес, мм: <input type="number" id="cabinetOverhang" value="${Math.round((cabinet.overhang ?? 0.018) * 1000)}" min="-100" step="1" data-set-prop="overhang"></label>`;
        html += `<label>Зазор между фасадами, мм: <input type="number" id="cabinetFacadeGap" value="${Math.round((cabinet.facadeGap || 0.003) * 1000)}" min="0" step="1" data-set-prop="facadeGap"></label>`;
    }

    // --- Селекты Типа и Конфигурации (КЛЮЧЕВЫЕ ИЗМЕНЕНИЯ) ---

    // Тип шкафа (прямой/угловой)
    html += `<label>Тип шкафа: <select id="cabinetType" data-set-prop="cabinetType">`;
    if (cabinet.type === 'upperCabinet') {
        html += `<option value="straightUpper" ${cabinet.cabinetType === 'straightUpper' ? 'selected' : ''}>Прямой</option>`;
        html += `<option value="cornerUpper" ${cabinet.cabinetType === 'cornerUpper' ? 'selected' : ''}>Угловой</option>`;
    } else {
        html += `<option value="straight" ${cabinet.cabinetType === 'straight' ? 'selected' : ''}>Прямой</option>`;
        html += `<option value="corner" ${cabinet.cabinetType === 'corner' ? 'selected' : ''}>Угловой</option>`;
    }
    html += `</select></label>`;

    // Конфигурация шкафа (динамический блок)
    html += `<label>Конфигурация шкафа: <select id="cabinetConfig" data-set-prop="cabinetConfig"></select></label>`;
    
    html += `</div>`; // Закрываем .menu-content

    // 4. КНОПКИ (без изменений)
    // 4. КНОПКИ
    html += `<div class="menu-buttons">
                <button type="button" id="configureCabinetBtn">Настроить</button>
                <button type="button" id="applyMainCabinetChangesBtn">Применить</button>
                <button type="button" id="deleteCabinetBtn">Удалить</button>
             </div>`;

    menu.innerHTML = html;

    // 5. УСТАНОВКА СЛУШАТЕЛЕЙ (улучшенная версия)
    
    // --- Определяем "живые" функции-обработчики ---
    const onConfigureClick = () => {
        window.applyChangesAndPrepareForConfigMenu(cabinetIndex);
        hideCabinetMenu();
        const deps = {
                objectManager: objectManager, // Передаем сам менеджер
                kitchenGlobalParams: window.kitchenGlobalParams, // Глобальные параметры
                toggleCabinetDetail: window.toggleCabinetDetail  // Передаем саму функцию
            };
        window.showCabinetConfigMenu(cabinetIndex, x, y, deps);
    };
    const onApplyClick = () => window.applyCabinetChanges(cabinetIndex);
    const onDeleteClick = () => window.deleteCabinet(cabinetIndex);

    // --- Привязываем обработчики к кнопкам ---
    menu.querySelector('#configureCabinetBtn').addEventListener('click', onConfigureClick);
    menu.querySelector('#applyMainCabinetChangesBtn').addEventListener('click', onApplyClick);
    menu.querySelector('#deleteCabinetBtn').addEventListener('click', onDeleteClick);

    // ==> НОВЫЙ СЛУШАТЕЛЬ ДЛЯ ЧЕКБОКСА <==
    if (cabinet.type === 'upperCabinet') {
        const checkbox = menu.querySelector('#isHeightIndependentCheckbox');
        const heightInput = menu.querySelector('#cabinetHeight');
        const offsetBottomInput = menu.querySelector('#cabinetOffsetBottom');

        if (checkbox && heightInput && offsetBottomInput) {
            checkbox.addEventListener('change', () => {
                const isChecked = checkbox.checked;
                // Сразу сохраняем состояние в объект
                cabinet.isHeightIndependent = isChecked; 
                // Блокируем/разблокируем поля
                heightInput.disabled = !isChecked;
                offsetBottomInput.disabled = !isChecked;
                // Если сняли, можно вернуть расчетные значения, но это сделает `applyCabinetChanges`
            });
        }
    }
    
    // --- Динамическое обновление списка конфигураций ---
    const typeSelect = menu.querySelector('#cabinetType');
    const configSelect = menu.querySelector('#cabinetConfig');

    const updateConfigOptions = () => {
        const selectedType = typeSelect.value;
        configSelect.innerHTML = ''; // Очищаем
        let options = [];

        // ==> НАША НОВАЯ ЛОГИКА ДЛЯ ВЕРХНИХ ШКАФОВ <==
        if (selectedType === 'straightUpper') {
            options = [
                { value: 'swingUpper', text: '1. Распашной, простой' },
                { value: 'swingHood', text: '2. Распашной, с вытяжкой' },
                { value: 'liftUpper', text: '3. С подъемником, простой' },
                { value: 'liftHood', text: '4. С подъемником, с вытяжкой' },
                { value: 'openUpper', text: '5. Открытые полки' },
                { value: 'falsePanelUpper', text: '6. Фальш-панель' }
            ];
        } 
        // ==> КОНЕЦ НОВОЙ ЛОГИКИ <==

        else if (selectedType === 'cornerUpper') {
            options = [ { value: 'cornerUpperStorage', text: 'Угловой, хранение' }, 
                        { value: 'cornerUpperOpen', text: 'Угловой, открытый' } 
                    ];
        } else if (selectedType === 'corner') {
            options = [ { value: 'sink', text: 'Шкаф с мойкой' }, 
                        { value: 'cornerStorage', text: 'Угловой, хранение' } 
                    ];
        } else if (selectedType === 'straight') {
            options = [ { value: 'swing', text: 'Распашной' }, { value: 'drawers', text: 'Выдвижные ящики' },
                        { value: 'oven', text: 'Духовка' }, { value: 'tallStorage', text: 'Высокий пенал, хранение' },
                        { value: 'tallOvenMicro', text: 'Высокий пенал, духовка+микроволновка' },
                        { value: 'fridge', text: 'Встроенный холодильник' }, { value: 'dishwasher', text: 'Посудомойка' },
                        { value: 'falsePanel', text: 'Фальш-панель/Декор.панель' } 
                    ];
        }

        let currentConfigIsValid = false;
        options.forEach(opt => {
            const optionEl = new Option(opt.text, opt.value);
            if (opt.value === cabinet.cabinetConfig) {
                optionEl.selected = true;
                currentConfigIsValid = true;
            }
            configSelect.add(optionEl);
        });

        if (!currentConfigIsValid && options.length > 0) {
            configSelect.value = options[0].value;
        }
    };
    
    typeSelect.addEventListener('change', updateConfigOptions);
    updateConfigOptions(); // <== ВЫЗЫВАЕМ ОДИН РАЗ, ЧТОБЫ ЗАПОЛНИТЬ СПИСОК ПРИ ОТКРЫТИИ

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
    menu.style.top = `${y - 280}px`;
    menu.style.display = 'flex';

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

    // 1. Получаем объект шкафа из менеджера по индексу
    const cabinet = objectManager.getAllCabinets()[cabinetIndex];

    // 2. Если шкаф найден, вызываем метод менеджера для его удаления
    if (cabinet) {
        // 2. Создаем команду для удаления
        const command = new RemoveCabinetCommand(objectManager, cabinet);
        
        // 3. Выполняем ее через historyManager
        historyManager.execute(command);
        
        // 4. Прячем UI
        hideCabinetMenu();
        hideAllDimensionInputs();
    } else {
        console.error(`[deleteCabinet] Не удалось найти шкаф с индексом ${cabinetIndex}`);
    }
}



function hideCabinetMenu() {
    const menu = document.getElementById('cabinetMenu');
    if (menu) menu.style.display = 'none';
}

let countertopMenu = null;

function showCountertopMenu(x, y, countertop) {
    hideCountertopMenu();
    
    countertopMenu = document.createElement('div');
    countertopMenu.className = 'context-menu';
    countertopMenu.style.position = 'absolute';
    countertopMenu.style.background = '#fff';
    countertopMenu.style.border = '1px solid #ccc';
    countertopMenu.style.padding = '10px';
    countertopMenu.style.zIndex = '1000';
    hideAllDimensionInputs(); // Удаляем старые элементы
    // Позиционирование меню, как и раньше
    const menuWidth = 150; // Примерная ширина
    const menuHeight = 80;  // Примерная высота
    let posX = x;
    let posY = y;
    if (posX + menuWidth > window.innerWidth) posX = window.innerWidth - menuWidth;
    if (posY + menuHeight > window.innerHeight) posY = window.innerHeight - menuHeight;
    countertopMenu.style.left = `${posX}px`;
    countertopMenu.style.top = `${posY}px`;

    // Кнопка выбора материала
    const pickerButton = document.createElement('button');
    pickerButton.textContent = 'Выбрать материал...';
    pickerButton.onclick = () => {
        // Передаем сам объект столешницы в модальное окно
        openCountertopPickerModal(countertop);
        hideCountertopMenu();
    };
    countertopMenu.appendChild(pickerButton);
    countertopMenu.appendChild(document.createElement('br'));

    // Кнопка "Удалить"
    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Удалить';
    deleteButton.style.marginTop = '5px';
    deleteButton.addEventListener('click', () => {
        const command = new RemoveCountertopCommand(scene, countertops, countertop);
        historyManager.execute(command);
        hideCountertopMenu();
    });
    countertopMenu.appendChild(deleteButton);

    document.body.appendChild(countertopMenu);
}

function hideCountertopMenu() {
    if (countertopMenu) {
        countertopMenu.remove();
        countertopMenu = null;
    }
}

/*
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
}*/


// Проверка пересечений
/**
 * Проверяет, пересекается ли данный шкаф с другими шкафами, стенами или объектами.
 * Использует BoundingBox для точного определения реальных габаритов.
 * @param {object} cabinet - Шкаф для проверки.
 * @returns {boolean} - true, если есть пересечение, иначе false.
 */
function checkCabinetIntersections(cabinet) {
    if (!cabinet || !cabinet.mesh) {
        return false;
    }

    cabinet.mesh.updateMatrixWorld(true);

    // 1. Создаем точный BoundingBox для текущего шкафа.
    const box1 = new THREE.Box3().setFromObject(cabinet.mesh, true);

    // 2. Проверка на выход за пределы комнаты
    const halfLength = currentLength / 2;
    const halfWidth = currentWidth / 2;
    const halfHeight = currentHeight / 2;
    const epsilon = 0.0002; // Маленький допуск

    if (box1.min.x < -halfLength - epsilon || box1.max.x > halfLength + epsilon ||
        box1.min.y < -halfWidth - epsilon || box1.max.y > halfWidth + epsilon ||
        box1.min.z < -halfHeight - epsilon || box1.max.z > halfHeight + epsilon) {
        return true;
    }

    // 3. Проверка пересечения с ОКНАМИ и другими простыми объектами
    for (const windowObj of windows) {
        if (!windowObj.mesh) continue;
        
        windowObj.mesh.updateMatrixWorld(true);
        const box2 = new THREE.Box3().setFromObject(windowObj.mesh, true);
        
        if (box1.intersectsBox(box2)) {
             return true;
        }
    }

    // 4. Проверка пересечения с ДРУГИМИ ШКАФАМИ
    // 4. Проверка пересечения с ДРУГИМИ ШКАФАМИ
    for (const otherCabinet of objectManager.getAllCabinets()) {
        if (otherCabinet === cabinet || !otherCabinet.mesh) {
            continue;
        }

        const box2 = new THREE.Box3().setFromObject(otherCabinet.mesh, true);
        
        // ==> НАЧАЛО ИЗМЕНЕНИЙ: УМНОЕ СЖАТИЕ <==
        
        // Допуск для "прилипания" по горизонтали. 1мм должно быть достаточно.
        const tolerance = 0.0001; 

        // Проверяем пересечение по каждой оси ОТДЕЛЬНО
        const intersectsX = (box1.max.x > box2.min.x + tolerance) && (box1.min.x < box2.max.x - tolerance);
        const intersectsZ = (box1.max.z > box2.min.z + tolerance) && (box1.min.z < box2.max.z - tolerance);
        
        // А по оси Y проверяем точное касание/пересечение БЕЗ допуска!
        const intersectsY = (box1.max.y > box2.min.y + tolerance) && (box1.min.y < box2.max.y - tolerance);

        if (intersectsX && intersectsY && intersectsZ) {
            return true;
        }
        
        // ==> КОНЕЦ ИЗМЕНЕНИЙ <==
    }

    // Если ни одного пересечения не найдено
    return false;
}

//let draggedCabinet = null;
//let dragStartX = 0;
//let dragStartY = 0;
//let dragStartOffsetX = 0; // Для X-позиции
//let dragStartOffsetZ = 0; // Для Z-позиции
let dragStartoffsetAlongWall = 0;
let justDragged = false;

//let isCloningMode = false;
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

    InputManager.setDraggedCabinet(cabinet);
    //groupDragObjects = [];    // Очищаем группу перетаскиваемых объектов

    let objectsToDrag = [cabinet];

    // --- Логика для группировки со столешницами (для freestanding) ---
    if (cabinet.type === 'freestandingCabinet') {
        const cabinetMesh = cabinet.mesh;
        //console.log('Проверка привязанных столешниц для:', cabinetMesh.uuid);

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
        objectsToDrag = [cabinet, ...attachedCountertops];
        // Добавляем в группу перетаскивания шкаф и найденные столешницы
        
    } else {
        // Для шкафов у стены перетаскиваем только сам шкаф
        objectsToDrag = [cabinet];
    }

    // --- Сохраняем флаг 'wasSelected' в userData перетаскиваемого объекта ---
    // Убедимся, что userData существует
    InputManager.setGroupDragObjects(objectsToDrag);

    if (!cabinet.mesh.userData) {
        cabinet.mesh.userData = {};
    }
    cabinet.mesh.userData.wasSelectedBeforeDrag = wasSelected;
    //console.log(` - Установлен флаг wasSelectedBeforeDrag: ${wasSelected}`);

    // --- Проверяем режим клонирования ---
    InputManager.setCloningMode(event.shiftKey);

    dragStartoffsetAlongWall = cabinet.offsetAlongWall ?? 0; // Для стенных

    // ==> ЗАПОМИНАЕМ СВОЙСТВА <==
    dragStartProperties = (cabinet.type === 'freestandingCabinet')
        ? { offsetX: cabinet.offsetX, offsetZ: cabinet.offsetZ }
        : { offsetAlongWall: cabinet.offsetAlongWall };
    // ==> конец изменения <==

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
     const draggedCabinet = InputManager.getDraggedCabinet();
    if (!draggedCabinet) return;

    // --- Initial setup on first move ---
    if (!isDraggingForSave) {
        const cabinetIndex = objectManager.getAllCabinets().indexOf(draggedCabinet);
        //saveState("moveCabinet", {}); // Save initial state

        isDraggingForSave = true;

        // Remove highlight from all and highlight only the dragged item
        const allHighlightableData = [...objectManager.getAllCabinets(), ...windows, ...countertops];
        allHighlightableData.forEach(itemData => removeHighlight(itemData.mesh || itemData));
        selectedCabinets = [];
        applyHighlight(draggedCabinet.mesh);
    }

    // --- Raycasting to find ground position ---
    const rect = renderer.domElement.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), activeCamera);
    const targets = [cube];
    if (floorObject) {
        targets.push(floorObject);
    }
    const intersects = raycaster.intersectObject(cube, false);

    if (intersects.length > 0) {
       const intersectPoint = intersects[0].point;
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
            updateDimensionsInputPosition(draggedCabinet, objectManager.getAllCabinets());
            // console.log("Позиция полей ввода обновлена."); // Можно раскомментировать для отладки
        }
        // --- КОНЕЦ ИЗМЕНЕНИЯ ---
    }
}
 // End onMouseMove

/**
 * Применяет или снимает цвет пересечения (красный) для простого меша,
 * не затрагивая его основной материал.
 * @param {THREE.Mesh} mesh - Меш простого шкафа.
 * @param {boolean} hasIntersection - Есть ли пересечение.
 */
function applyIntersectionColor(mesh, hasIntersection) {
    if (!mesh || !mesh.material || Array.isArray(mesh.material)) return;

    if (hasIntersection) {
        // Если есть пересечение, красим в красный
        mesh.material.color.set(0xff0000);
    } else {
        // Если пересечения нет, нужно ВЕРНУТЬ исходный цвет материала.
        // Мы не можем использовать `initialColor`, так как он может быть устаревшим.
        // Вместо этого, мы должны получить актуальный цвет из MaterialManager.
        
        // Находим объект cabinet, к которому относится меш
        const cabinet = mesh.userData.cabinet; 
        if (cabinet) {
            const bodySet = {
                materialType: 'ldsp',
                texture: cabinet.bodyMaterial
            };
            // Получаем "правильный" материал (который может быть просто цветом)
            const correctMaterial = MaterialManager.getFallbackMaterial(bodySet);
            // Применяем его цвет
            mesh.material.color.set(correctMaterial.color);
        }
        // Если cabinet не найден, мы ничего не делаем, чтобы не сбросить цвет на дефолтный
    }
    mesh.material.needsUpdate = true;
}



// В script.js

function onMouseUp(event) {
    const draggedCabinet_local = InputManager.getDraggedCabinet(); 

    if (draggedCabinet_local) {
        // ==> ИЗМЕНЕНИЕ: Используем новую обертку <==
        objectManager.createAndExecuteUpdateCommand(
            draggedCabinet_local, 
            (cab) => {
                // Действие уже произошло в onMouseMove, так что здесь ничего не делаем.
                // Просто фиксируем финальное состояние.
            }, 
            'Перемещение шкафа'
        );
    }
    // ==> КОНЕЦ ИЗМЕНЕНИЯ <==


    // 1. Проверяем, было ли вообще что-то перетаскиваемо
    if (!draggedCabinet_local) {
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
    const cabinet = draggedCabinet_local; // Локальная ссылка на объект данных
    const wasSelected = cabinet.mesh?.userData?.wasSelectedBeforeDrag; // Получаем флаг
    const cabinetUUID = cabinet.mesh?.uuid; // Для логирования

    //console.log(`onMouseUp: Обработка для UUID: ${cabinetUUID}. Был выделен: ${wasSelected}`); // Лог 3: Какой объект обрабатываем

    // 3. НЕМЕДЛЕННО Сбрасываем ГЛОБАЛЬНОЕ состояние перетаскивания
    InputManager.setDraggedCabinet(null); // <--- КРИТИЧЕСКИ ВАЖНО
    InputManager.setGroupDragObjects([]);
    InputManager.setCloningMode(false);
    isDraggingForSave = false;

    // 4. НЕМЕДЛЕННО Удаляем слушатели событий
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp); // Удаляем СЕБЯ ЖЕ

    // 5. НЕМЕДЛЕННО Восстанавливаем курсор
    document.body.style.cursor = 'default';

    //console.log(`onMouseUp: Состояние сброшено, слушатели удалены для UUID: ${cabinetUUID}`); // Лог 4: Подтверждение сброса

    // 6. Устанавливаем флаг "только что перетащили", чтобы click не сработал сразу
    InputManager.setJustDragged(true);
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
        if (!cabinet.isDetailed) {
            const hasIntersection = checkCabinetIntersections(cabinet); // Убедись, что `hasIntersection` вычислено
            applyIntersectionColor(cabinet.mesh, hasIntersection);
        } else if (cabinet.isDetailed && hasIntersection) {
             console.warn(`Детализированный шкаф ${cabinetUUID} пересекается после перетаскивания!`);
        }

        // Логика восстановления/установки выделения
        if (wasSelected) {
            //console.log(`onMouseUp: Восстановление выделения для UUID: ${cabinetUUID}`);
            // Убедимся, что объект все еще в массиве (на случай асинхронных удалений?)
            if (objectManager.getAllCabinets().some(c => c.mesh === cabinet.mesh)) {
                selectedCabinets = [cabinet]; // Восстанавливаем выделение
                selectedCabinet = cabinet;
                applyHighlight(cabinet.mesh); // Подсвечиваем
                 if (cabinet.cabinetType === 'corner') {
                    showCornerCabinetDimensions(cabinet);
                } else if (cabinet.cabinetType === 'cornerUpper') { // <--- ДОБАВЛЕНО
                    showUpperCornerCabinetDimensions(cabinet);
                } else if (cabinet.type === 'freestandingCabinet') {
                    showFreestandingCabinetDimensions(cabinet, objectManager.getAllCabinets());
                } else if (['lowerCabinet', 'upperCabinet'].includes(cabinet.type)) {
                    showCabinetDimensionsInput(cabinet, objectManager.getAllCabinets());
                }
                // Обязательно обновляем позицию сразу после создания
                updateDimensionsInputPosition(cabinet, objectManager.getAllCabinets());

                
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
}

/**
 * Создает клон объекта шкафа как новый экземпляр класса Cabinet.
 * @param {Cabinet} original - Оригинальный экземпляр класса Cabinet.
 * @returns {Cabinet | null} Новый экземпляр Cabinet или null в случае ошибки.
 */
function cloneCabinet(original) {
    if (!(original instanceof Cabinet)) {
        console.error("cloneCabinet: Можно клонировать только экземпляр класса Cabinet.");
        return null;
    }

    // 1. Создаем глубокую копию ДАННЫХ оригинала.
    const { mesh, edges, frontMarker, dependencies, ...dataToClone } = original;
    const clonedData = JSON.parse(JSON.stringify(dataToClone));

    // 2. Генерируем новый уникальный ID для клона.
    clonedData.id_data = THREE.MathUtils.generateUUID();

    // 3. Используем статический метод Cabinet.fromData для "воскрешения" объекта.
    // ==> ИСПРАВЛЕНИЕ: Мы не объявляем `dependencies` заново. <==
    //    Мы предполагаем, что `dependencies` - это переменная, доступная в 
    //    области видимости `main.js`, как мы и сделали.
    
    const cloneInstance = Cabinet.fromData(clonedData, dependencies);
    
    return cloneInstance;
}


renderer.domElement.addEventListener('contextmenu', (event) => {
    event.preventDefault();

    // --- 1. Настройка Raycaster (ПОЛНАЯ ВЕРСИЯ) ---
    const rect = renderer.domElement.getBoundingClientRect();
    const mouseNDC = new THREE.Vector2();
    mouseNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouseNDC, activeCamera);

    // ==> ВОЗВРАЩАЕМ ЭТИ СТРОКИ ИЗ ОТЛАДОЧНОЙ ВЕРСИИ
    raycaster.ray.at(1, raycaster.camera.getWorldDirection(new THREE.Vector3()));
    raycaster.params.Line = { threshold: 0.1 };
    raycaster.params.Points = { threshold: 0.1 };
    
    // Временно устанавливаем `side`, чтобы видеть внутренние грани
    const originalSide = raycaster.params.Mesh?.side;
    if (!raycaster.params.Mesh) raycaster.params.Mesh = {};
    raycaster.params.Mesh.side = THREE.DoubleSide;

    // Бросаем луч
    const intersects = raycaster.intersectObjects(scene.children, true);

    // Возвращаем `side` к исходному состоянию
    if (originalSide !== undefined) {
        raycaster.params.Mesh.side = originalSide;
    } else {
        delete raycaster.params.Mesh.side;
    }

    if (intersects.length === 0) {
        return;
    }
    
    const intersectedObject = intersects[0].object;

    // --- 2. Логика для СТЕН (как в отладочной версии) ---
    if (intersectedObject === cube) {
        const faceIndex = determineClickedWallFace_OldLogic(intersects[0], mouseNDC);
        
        if (faceIndex !== -1 && ['Back', 'Left', 'Right'].includes(faceNormals[faceIndex].id)) {
            clearSelection(); 
            hideAllDimensionInputs();
            setRoomSelectedFace(faceIndex); 
            showWallContextMenu(event.clientX, event.clientY, faceIndex);
        } else if (faceNormals[faceIndex].id === 'Bottom') {
            // Кликнули по ПОЛУ
            clearSelection(); 
            hideAllDimensionInputs();
            setRoomSelectedFace(faceIndex); 
            // Вызываем новое контекстное меню для пола
            showFloorContextMenu(event.clientX, event.clientY);
        }
        return; 
    }

    // ==> НОВЫЙ БЛОК: Логика для уже созданного объекта ПОЛА <==
    if (floorObject && intersectedObject === floorObject) {
        console.log("Правый клик по объекту floorObject!");
        // Здесь мы тоже должны вызвать меню
        // Это позволит редактировать уже созданный пол
        clearSelection();
        hideAllDimensionInputs();
        showFloorContextMenu(event.clientX, event.clientY);
        return; // Завершаем обработку
    }

    // --- 3. Логика для ОСТАЛЬНЫХ ОБЪЕКТОВ (полная версия, как у вас) ---
    if (selectedCabinets.length !== 1) {
        return;
    }

    const selectedItem = selectedCabinets[0];

    // ==> НАЧАЛО ИЗМЕНЕНИЯ <==

    // Определяем, с каким 3D-объектом мы должны сравнивать пересечение
    const targetMesh = selectedItem.mesh || selectedItem;

    const isClickOnSelectedItem = intersects.some(intersect => {
        let currentObj = intersect.object;
        // Проверяем сам объект и всех его "родителей" вверх по иерархии
        while (currentObj) {
            if (currentObj === targetMesh) return true;
            currentObj = currentObj.parent;
        }
        return false;
    });

// ==> КОНЕЦ ИЗМЕНЕНИЯ <==
    
    if (!isClickOnSelectedItem) {
        return;
    }
    
    let menuFunction = null;
    let dataObject = selectedItem;

    if (selectedItem.isMesh && selectedItem.userData?.type === 'countertop') {
        menuFunction = showCountertopMenu;
    } else if (selectedItem.userData && (selectedItem.userData.type === 'hob' || selectedItem.userData.type === 'sink_model')) {
        // ==> НОВЫЙ ВЫЗОВ ДЛЯ ТЕХНИКИ <==
        menuFunction = showApplianceMenu;
    } else if (['lowerCabinet', 'upperCabinet', 'freestandingCabinet'].includes(selectedItem.type)) {
        menuFunction = showCabinetMenu;
    } else if (['window', 'door', 'socket', 'radiator', 'column', 'apron'].includes(selectedItem.type)) {
        if (selectedItem.type === 'socket') {
            menuFunction = showSocketMenu;
        } else if (selectedItem.type === 'apron') {
            menuFunction = showApronMenu; // Вызываем наше новое спец-меню
        } else {
            menuFunction = showWindowMenu;
            if (selectedItem.groupId) {
                dataObject = windows.find(w => w.groupId === selectedItem.groupId && w.doorIndex === 0) || selectedItem;
            }
        }
    } else if (selectedItem.type === 'plinth') {
        // Добавляем вызов меню
        menuFunction = showPlinthMenu; 
    } else {
        return;
    }

    if (menuFunction) {
        // Прячем все остальные меню перед показом нового
        hideAllContextMenus(); 
        
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

function lightenColor(hexColor, factor) {
    const color = new THREE.Color(hexColor);
    color.r += (1 - color.r) * factor;
    color.g += (1 - color.g) * factor;
    color.b += (1 - color.b) * factor;
    return color.getHex();
}

function orientCabinet(cabinetIndex, wall) {
    const cabinet = objectManager.getAllCabinets()[cabinetIndex];
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
    applyIntersectionColor(cabinet.mesh, hasIntersection);
    cabinet.edges.material.color.set(0x000000);
    //cabinet.mesh.material.needsUpdate = true;
    cabinet.edges.material.needsUpdate = true;
}


function applyCabinetChanges(cabinetIndex) {
    // 1. Находим целевой объект
    const cabinetToChange = objectManager.getAllCabinets()[cabinetIndex];
    if (!cabinetToChange) {
        console.error("applyCabinetChanges: Шкаф не найден по индексу", cabinetIndex);
        hideCabinetMenu();
        return;
    }

    const oldCabinetType = cabinetToChange.cabinetType;
    
    // 2. Используем "обертку" для записи в историю
    objectManager.createAndExecuteUpdateCommand(
        cabinetToChange,
        (cab) => {
            // ==> Вся логика изменения ДАННЫХ теперь находится здесь <==
            // Она применяется к временному объекту `cab`.
            
            const cabinetMenuDOM = document.getElementById('cabinetMenu');
            if (!cabinetMenuDOM) {
                console.error("[applyCabinetChanges:action] Меню #cabinetMenu не найдено!");
                return; // Прерываем действие, если меню исчезло
            }

            // --- Блок 1: Считывание НОВЫХ значений из DOM ---
            const newValues = {};
            try {
                const widthInput = cabinetMenuDOM.querySelector('#cabinetWidth');
                if (widthInput) { const val = parseFloat(widthInput.value); if (!isNaN(val)) newValues.width = val / 1000; }
                
                const depthInput = cabinetMenuDOM.querySelector('#cabinetDepth');
                if (depthInput) { const val = parseFloat(depthInput.value); if (!isNaN(val)) newValues.depth = val / 1000; }

                const heightInput = cabinetMenuDOM.querySelector('#cabinetHeight');
                if (heightInput && !heightInput.disabled) {
                    const val = parseFloat(heightInput.value);
                    if (!isNaN(val)) newValues.height = val / 1000;
                }

                const overhangInput = cabinetMenuDOM.querySelector('#cabinetOverhang');
                if (overhangInput) { const val = parseFloat(overhangInput.value); if (!isNaN(val)) newValues.overhang = val / 1000; }
                
                const facadeGapInput = cabinetMenuDOM.querySelector('#cabinetFacadeGap');
                if (facadeGapInput) { const val = parseFloat(facadeGapInput.value); if (!isNaN(val)) newValues.facadeGap = val / 1000; }

                newValues.cabinetType = cabinetMenuDOM.querySelector('#cabinetType').value;
                newValues.cabinetConfig = cabinetMenuDOM.querySelector('#cabinetConfig').value;

                if (cab.type === 'freestandingCabinet') {
                    const offsetXVal = parseFloat(cabinetMenuDOM.querySelector('#cabinetOffsetX')?.value);
                    if (!isNaN(offsetXVal)) newValues.offsetX = offsetXVal / 1000;
                    
                    const offsetZVal = parseFloat(cabinetMenuDOM.querySelector('#cabinetOffsetZ')?.value);
                    if (!isNaN(offsetZVal)) newValues.offsetZ = offsetZVal / 1000;
                    
                    // Вращение - это свойство меша, а не данных. Мы сохраним его отдельно.
                    const orientationSelect = cabinetMenuDOM.querySelector('#cabinetOrientation');
                    if (orientationSelect) newValues.orientation = orientationSelect.value;

                } else if (cab.type === 'lowerCabinet' || cab.type === 'upperCabinet') {
                    const offsetAlongWallVal = parseFloat(cabinetMenuDOM.querySelector('#cabinetoffsetAlongWall')?.value);
                    if (!isNaN(offsetAlongWallVal)) newValues.offsetAlongWall = offsetAlongWallVal / 1000;
                }
                
                if (cab.type === 'upperCabinet') {
                    const mezzanineSelect = cabinetMenuDOM.querySelector('#mezzanine');
                    if (mezzanineSelect) newValues.isMezzanine = mezzanineSelect.value;

                    // Отступ от стены
                    const wallOffsetInput = cabinetMenuDOM.querySelector('#cabinetWallOffset');
                    if (wallOffsetInput) {
                        const val = parseFloat(wallOffsetInput.value);
                        if (!isNaN(val)) newValues.offsetFromParentWall = val / 1000;
                    }

                    // Отступ от пола
                    const offsetBottomInput = cabinetMenuDOM.querySelector('#cabinetOffsetBottom');
                    if (offsetBottomInput && !offsetBottomInput.disabled) { // Только если поле активно
                        const val = parseFloat(offsetBottomInput.value);
                        if (!isNaN(val)) newValues.offsetBottom = val / 1000;
                    }

                     // Высота (если поле активно)
                    const heightInput = cabinetMenuDOM.querySelector('#cabinetHeight');
                    if (heightInput && !heightInput.disabled) { // Только если поле активно
                        const val = parseFloat(heightInput.value);
                        if (!isNaN(val)) newValues.height = val / 1000;
                    }

                    // isHeightIndependent (чекбокс)
                    const isHeightIndependentCheckbox = cabinetMenuDOM.querySelector('#isHeightIndependentCheckbox');
                    if (isHeightIndependentCheckbox) {
                        newValues.isHeightIndependent = isHeightIndependentCheckbox.checked;
                    }
                }

            } catch (e) {
                console.error("[applyCabinetChanges:action] Ошибка при чтении данных из DOM:", e);
                return; // Прерываем, чтобы не сломать объект
            }

            // 2. Определяем, менялся ли тип
            const newCabinetType = newValues.cabinetType;

            // Применяем остальные считанные значения
            
            if (newValues.depth !== undefined) cab.depth = newValues.depth;
            if (newValues.overhang !== undefined) cab.overhang = newValues.overhang;
            if (newValues.facadeGap !== undefined) cab.facadeGap = newValues.facadeGap;
            if (newValues.overhang !== undefined) cab.overhang = newValues.overhang;
            
            if (newValues.offsetX !== undefined) cab.offsetX = newValues.offsetX;
            if (newValues.offsetZ !== undefined) cab.offsetZ = newValues.offsetZ;
            if (newValues.offsetAlongWall !== undefined) cab.offsetAlongWall = newValues.offsetAlongWall;

            // ==> НАЧАЛО: ПРИМЕНЕНИЕ НОВЫХ ПОЛЕЙ <==
            if (newValues.offsetFromParentWall !== undefined) cab.offsetFromParentWall = newValues.offsetFromParentWall;
            if (newValues.offsetBottom !== undefined) cab.offsetBottom = newValues.offsetBottom;
            //console.log("newValues.offsetBottom ACC = " + newValues.offsetBottom);
            if (newValues.height !== undefined) cab.height = newValues.height;
            //console.log("newValues.height ACC = " + newValues.height);
            if (newValues.isHeightIndependent !== undefined) cab.isHeightIndependent = newValues.isHeightIndependent;
            if (newValues.isMezzanine !== undefined) cab.isMezzanine = newValues.isMezzanine;
            // ==> КОНЕЦ: ПРИМЕНЕНИЕ НОВЫХ ПОЛЕЙ <==


            // console.log("newValues.offsetAlongWall ACC = " + newValues.offsetAlongWall);
            // console.log("cab.offsetAlongWall ACC = " + cab.offsetAlongWall);

            if (newValues.width !== undefined) cab.width = newValues.width;
            // --- Блок 2: Применение новых значений к объекту `cab` ---
            //const newCabinetType = newValues.cabinetType;

            const isSwitchingToCorner = (newCabinetType === 'corner' || newCabinetType === 'cornerUpper') && 
                            (oldCabinetType !== 'corner' && oldCabinetType !== 'cornerUpper');

            if (isSwitchingToCorner) {
                console.log("Переключение на угловой шкаф. Запуск авто-настройки...");

                // 1. Автоматически определяем направление
                const direction = findNearestCornerDirection(cab);
                cab.cornerDirection = direction;

                // 2. Ищем соседа
                const neighbor = findNearestNeighbor(cab);
                
                // 3. Рассчитываем pivotPositionM с помощью новой универсальной функции
                const pivotPositionM = calculateCornerPivotPosition(cab, neighbor, MaterialManager);
                cab.sideLength = pivotPositionM;

                // Дефолтная "дельта" для углового элемента. Для верхнего шкафа она может быть другой.
                const DELTA_M = cab.cornerElementWidth || ( (cab.type === 'upperCabinet') ? 0.018 : 0.020 );
                
                // 4. Рассчитываем новую ширину и положение (эта логика универсальна и остается)
                if (direction === 'left') {
                    let finalOffsetAlongWall = 0; // Прижимаем к углу по умолчанию
                    // Логика сохранения отступа, если он уже корректен
                    if (cab.offsetAlongWall >= 0 && cab.offsetAlongWall < pivotPositionM - 0.1) {
                        finalOffsetAlongWall = cab.offsetAlongWall;
                    }
                    cab.offsetAlongWall = finalOffsetAlongWall;
                    const rightPartSizeM = (cab.facadeWidth || 0.45) + DELTA_M;
                    const leftPartSizeM = pivotPositionM - cab.offsetAlongWall;
                    cab.width = leftPartSizeM + rightPartSizeM;

                } else { // direction === 'right'
                    const wallLength = (cab.wallId === 'Back' || cab.wallId === 'Front') 
                        ? roomDimensions.getLength() 
                        : roomDimensions.getHeight();
                    const currentOffsetFromRight = wallLength - cab.offsetAlongWall - cab.width;

                    if (currentOffsetFromRight >= 0 && currentOffsetFromRight < pivotPositionM - 0.1) {
                        const leftPartSizeM = (cab.facadeWidth || 0.45) + DELTA_M;
                        const rightPartSizeM = pivotPositionM - currentOffsetFromRight;
                        cab.width = leftPartSizeM + rightPartSizeM;
                        cab.offsetAlongWall = wallLength - cab.width - currentOffsetFromRight;
                    } else {
                        const leftPartSizeM = (cab.facadeWidth || 0.45) + DELTA_M;
                        const rightPartSizeM_forRightCorner = pivotPositionM;
                        cab.width = leftPartSizeM + rightPartSizeM_forRightCorner;
                        cab.offsetAlongWall = wallLength - cab.width;
                    }
                }
                console.log(`[Авто-настройка] Тип: ${cab.type}, Направление: ${direction}, Ширина: ${cab.width.toFixed(3)}, Отступ: ${cab.offsetAlongWall.toFixed(3)}`);
            } else {
                // Старая логика для НЕ угловых шкафов - остается без изменений
                // if (newValues.offsetAlongWall !== undefined) cab.offsetAlongWall = newValues.offsetAlongWall;
                if (newValues.cabinetConfig !== 'falsePanelUpper' && newValues.width !== undefined) {
                    cab.width = newValues.width;
                }
            }

            // --- НОВЫЙ БЛОК для Фальш-панели ---
            console.log(`[applyCabinetChanges] newValues.cabinetConfig = ${newValues.cabinetConfig}`);
            if (newValues.cabinetConfig === 'falsePanelUpper') {
                const facadeSet = window.facadeSetsData.find(set => set.id === cab.facadeSet);
                // Используем MaterialManager, который мы передаем в другие функции
                const { thickness: facadeThicknessM } = MaterialManager.getMaterial(facadeSet);
                cab.width = facadeThicknessM; // Принудительно меняем ширину
                console.log(`[applyCabinetChanges] Ширина для falsePanelUpper установлена в ${cab.width.toFixed(3)}м`);
            }
            // --- КОНЕЦ БЛОКА ---

            // Если тип/конфиг изменились, вызываем подготовку
            const mainConfigOrTypeActuallyChanged = (newValues.cabinetType !== cab.cabinetType) || (newValues.cabinetConfig !== cab.cabinetConfig);

            if (mainConfigOrTypeActuallyChanged) {
                const oldConfig = cab.cabinetConfig;

                // --- НОВЫЙ БЛОК ВАЛИДАЦИИ для liftUpper ---
                if (newValues.cabinetConfig === 'liftUpper') {
                    const minH = 240 / 1000;
                    const maxH = 1200 / 1000;
                    if (cab.height < minH || cab.height > maxH) {
                        alert(`Невозможно установить подъемник. Высота шкафа должна быть в диапазоне от 240мм до 1200мм. Текущая высота: ${Math.round(cab.height*1000)}мм.`);
                        // Отменяем смену конфига на liftUpper, возвращая swingUpper
                        cab.cabinetConfig = 'swingUpper';
                        // Обновляем UI, если нужно
                        const configSelect = document.getElementById('cabinetConfig');
                        if (configSelect) configSelect.value = 'swingUpper';
                        return; // Прерываем дальнейшее применение изменений
                    }
                }
                // --- КОНЕЦ БЛОКА ВАЛИДАЦИИ ---

                cab.cabinetType = newValues.cabinetType;

                // --- НОВЫЙ БЛОК ЗАЩИТЫ ---
                if (newValues.cabinetConfig === 'swingHood') {
                    const minWidth = 0.450; // 450мм
                    const minDepth = 0.260; // 260мм
                    if (cab.width < minWidth || cab.depth < minDepth) {
                        alert(`Для установки вытяжки шкаф должен быть не менее ${minWidth*1000}мм в ширину и ${minDepth*1000}мм в глубину.`);
                        // Отменяем смену конфига, возвращая старый
                        newValues.cabinetConfig = oldCabinetType === 'corner' ? cab.cabinetConfig : oldCabinetType;
                        // И тип тоже
                        newValues.cabinetType = cab.cabinetType;
                        
                        // Сбрасываем селекты в UI
                        document.getElementById('cabinetConfig').value = cab.cabinetConfig;
                        document.getElementById('cabinetType').value = cab.cabinetType;
                        return; // Прерываем дальнейшее выполнение
                    }
                }
                // --- КОНЕЦ БЛОКА ЗАЩИТЫ ---
                
                // --- НОВАЯ ЛОГИКА РАЗДЕЛЕНИЯ КОНФИГОВ ---
                if (newValues.cabinetType === 'corner' && newValues.cabinetConfig === 'cornerStorage' && cab.type === 'upperCabinet') {
                    // Если это верхний угловой шкаф для хранения, даем ему уникальный конфиг
                    cab.cabinetConfig = 'cornerUpper';
                } else {
                    // Во всех остальных случаях просто присваиваем выбранное значение
                    cab.cabinetConfig = newValues.cabinetConfig;
                }
                
                window.prepareCabinetForNewConfig(cab, oldConfig);
            }

            // Обработка высоты
            if (newValues.height !== undefined) {
                cab.height = newValues.height;
                const canBeIndependent = cab.type === 'upperCabinet' || cab.type === 'freestandingCabinet' || (cab.cabinetType === 'straight' && ['tallStorage', 'tallOvenMicro', 'fridge'].includes(cab.cabinetConfig));
                if (canBeIndependent) {
                    cab.isHeightIndependent = true;
                }
            }

            // --- Блок 3: Пересчет зависимых свойств ---

            // Высота для высоких шкафов
            const isNowTallCabinet = (cab.cabinetType === 'straight' && ['tallStorage', 'tallOvenMicro', 'fridge'].includes(cab.cabinetConfig));
            if (isNowTallCabinet && !cab.isHeightIndependent) {
                cab.height = (kitchenGlobalParams.totalHeight - kitchenGlobalParams.plinthHeight) / 1000;
                cab.offsetBottom = kitchenGlobalParams.plinthHeight / 1000;
            }

            // Отступ от стены для нижних
            if (cab.type === 'lowerCabinet' && cab.wallId !== 'Bottom') {
                cab.offsetFromParentWall = window.calculateLowerCabinetOffset(cab);
            }

            // Высота и положение для верхних
            if (cab.type === 'upperCabinet') {
                // Если тип антресоли изменился, нужно сбросить флаг независимости
                if (newValues.isMezzanine !== undefined && newValues.isMezzanine !== cab.isMezzanine) {
                    cab.isMezzanine = newValues.isMezzanine;
                    cab.isHeightIndependent = false; // При смене типа высота всегда становится зависимой
                }
                
                // ПЕРЕСЧИТЫВАЕМ высоту и положение, ТОЛЬКО ЕСЛИ ВЫСОТА НЕЗАВИСИМАЯ ОТКЛЮЧЕНА
                if (!cab.isHeightIndependent) {
                    const countertopHeightM = kitchenGlobalParams.countertopHeight / 1000;
                    const apronHeightM = kitchenGlobalParams.apronHeight / 1000;
                    const totalHeightM = kitchenGlobalParams.totalHeight / 1000;
                    const mezzanineHeightM = kitchenGlobalParams.mezzanineHeight / 1000;
                    const topApronEdgeM = apronHeightM + countertopHeightM;

                    if (cab.isMezzanine === 'normal') {
                        cab.height = totalHeightM - topApronEdgeM;
                        cab.offsetBottom = topApronEdgeM;
                    } else if (cab.isMezzanine === 'mezzanine') {
                        cab.height = mezzanineHeightM;
                        cab.offsetBottom = totalHeightM - mezzanineHeightM;
                    } else if (cab.isMezzanine === 'underMezzanine') {
                        cab.height = totalHeightM - topApronEdgeM - mezzanineHeightM;
                        cab.offsetBottom = topApronEdgeM;
                    }
                }
            }
            
            // Вращение для freestanding - это свойство меша, обрабатывается отдельно
            if (cab.type === 'freestandingCabinet' && newValues.orientation !== undefined && cab.mesh) {
                switch (newValues.orientation) {
                    case 'Back': cab.mesh.rotation.y = 0; break;
                    case 'Left': cab.mesh.rotation.y = THREE.MathUtils.degToRad(90); break;
                    case 'Right': cab.mesh.rotation.y = THREE.MathUtils.degToRad(-90); break;
                    case 'Front': cab.mesh.rotation.y = THREE.MathUtils.degToRad(180); break;
                }
            }
            console.log("cab.overhan in the end = " + cab.overhang);
            //console.log("cab.width the end = " + cab.width);
            updateCabinetPosition(cab);
        },
        'Изменение настроек шкафа'
    );

    //console.log("cab.overhang = " + rightPartSizeM);

    // 3. После выполнения команды просто скрываем меню.
    // Обновление 3D-модели и рендер произойдут автоматически внутри.
    clearSelection();
    updateCountertopButtonVisibility();
    hideCabinetMenu();
    requestRender();
}


function prepareCabinetForNewConfig(cabinet, oldConfig) {
    const newConfig = cabinet.cabinetConfig;
    const newCabinetType = cabinet.cabinetType; // Получаем и тип конструкции
    console.log(`[prepareCabinetForNewConfig] Шкаф ID: ${cabinet.mesh?.uuid}. newConfig: '${newConfig}', oldConfig: '${oldConfig}'`);

    // if (newCabinetType === 'corner' && cabinet.type !== 'cornerUpper') {
    //             console.log("prepareCabinetForNewConfig: Обнаружен переход на угловой тип. Запуск авто-настройки...");

    //             // 1. Автоматически определяем направление
    //             if (!cabinet.cornerDirection) {
    //                 cabinet.cornerDirection = findNearestCornerDirection(cabinet);
    //             }

    //             // 2. Прижимаем к углу
    //             //cabinet.offsetAlongWall = 0;
    //             //console.log("cab.offsetAlongWall = " + cab.offsetAlongWall);

    //             // 3. Ищем соседа и рассчитываем `sideLength`
    //             const neighbor = findNearestNeighbor(cabinet);
    //             if (neighbor) {
    //                 cabinet.neighborCabinetId = neighbor.id_data;
    //                 const countertopDepth = getCountertopDepthForWall(neighbor.wallId);
    //                 cabinet.sideLength = countertopDepth - (neighbor.overhang ?? 0.018);
    //             } else {
    //                 cabinet.neighborCabinetId = null;
    //                 const adjacentWallId = getAdjacentWallId(cabinet.wallId, cabinet.cornerDirection);
    //                 cabinet.sideLength = (getCountertopDepthForWall(adjacentWallId) || 0.6) - (cabinet.overhang ?? 0.018);
    //             }

    //             // 4. Пересчитываем ОБЩУЮ ШИРИНУ шкафа
    //             const DELTA_M = 0.020;
    //             const pivotPositionM = cabinet.sideLength;
    //             const rightPartSizeM = (cabinet.facadeWidth || 0.45) + DELTA_M;
    //             const leftPartSizeM = pivotPositionM - cabinet.offsetAlongWall; // offsetAlongWall здесь 0
    //             cabinet.width = leftPartSizeM + rightPartSizeM;
    //         }
    // 1. Общие сбросы, если уходим от конфигурации, где были специфичные вещи.
    //    Эта часть важна для "очистки" свойств от предыдущей конфигурации.

    // --- НОВЫЙ БЛОК: Устанавливаем дефолты для Верхнего Углового ---
    if (cabinet.cabinetType === 'cornerUpper' && cabinet.cabinetConfig === 'cornerUpperStorage') {
        const panelThickness = getPanelThickness(); // Эта функция здесь доступна!
        
        // Принудительно устанавливаем отступ, равный толщине панели
        cabinet.bottomFrontOffset = Math.round(panelThickness * 1000);
        
        // Можно здесь же установить и другие дефолты, например, кол-во полок
        if (cabinet.shelfCount === undefined) {
            cabinet.shelfCount = 2;
        }
    }

    // --- НОВЫЙ/РАСШИРЕННЫЙ БЛОК для liftUpper ---
    if (cabinet.cabinetConfig === 'liftUpper') {
        const cabinetHeightMm = Math.round(cabinet.height * 1000);
        
        // 1. Определяем, какая конструкция двери должна быть по умолчанию
        let defaultConstruction = 'single';
        if (cabinetHeightMm > 600) {
            defaultConstruction = 'double_folding';
        } else if (cabinetHeightMm >= 480) {
            // Для среднего диапазона можно выбрать любой, например, 'double_folding'
            defaultConstruction = 'double_folding';
        }
        cabinet.liftDoorConstruction = defaultConstruction;

        // 2. Рассчитываем и присваиваем высоты фасадов
        const offsetTop = cabinet.doorOffsetTop ?? 0;
        const offsetBottom = cabinet.doorOffsetBottom ?? 0;
        const facadeGap = cabinet.facadeGap ?? (3 / 1000);
        const totalFacadeHeight = cabinet.height - offsetTop - offsetBottom;

        if (defaultConstruction === 'single') {
            cabinet.liftTopFacadeHeight = Math.round(totalFacadeHeight * 1000);
            delete cabinet.liftBottomFacadeHeight; // Удаляем ненужное свойство
        } else { // 'double_...'
            // Устанавливаем симметричные высоты по умолчанию
            const symmetricalHeight = Math.ceil((totalFacadeHeight - facadeGap) * 1000 / 2);
            cabinet.liftTopFacadeHeight = symmetricalHeight;
            // Нижнюю высоту можно не хранить, так как она всегда вычисляется
        }
        
        console.log(`[prepareCabinet] Инициализация liftUpper: Конструкция=${defaultConstruction}, Высота верхнего=${cabinet.liftTopFacadeHeight}`);
    }

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
            if (cabinet.overhang === undefined) {
                cabinet.overhang = (window.objectTypes?.lowerCabinet?.overhang || 18) / 1000;
            }
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
    //console.log(`[prepareCabinetForNewConfig] Финальный cabinet для '${newConfig}':`, JSON.parse(JSON.stringify(cabinet)));
}

function applyChangesAndPrepareForConfigMenu(cabinetIndex) {
    const cabinet = objectManager.getAllCabinets()[cabinetIndex];
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

    const isHeightIndependentCheckbox = cabinetMenuDOM.querySelector('#isHeightIndependentCheckbox');
    if (isHeightIndependentCheckbox) {
        cabinet.isHeightIndependent = isHeightIndependentCheckbox.checked;
        console.log("[applyChangesAndPrepare] Чекбокс isHeightIndependent:", cabinet.isHeightIndependent);
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
}

function applyCountertopChanges(countertop, depthValue, materialValue, colorValue) {
    // 1. Сохраняем старое состояние данных
    const oldState = {
        depth: countertop.userData.depth,
        materialType: countertop.userData.materialType,
        solidColor: countertop.userData.solidColor
    };
    
    // 2. Создаем объект с новым состоянием
    const newState = {
        ...oldState, // Начинаем со старого, чтобы не потерять другие свойства
        depth: parseFloat(depthValue) / 1000,
        materialType: materialValue,
        solidColor: colorValue
    };
    
    // 3. Создаем и выполняем команду
    const command = new UpdateCountertopCommand(countertop, newState, oldState);
    historyManager.execute(command);

    // 4. Логика UI
    selectedCabinets = [];
    selectedCabinet = null;
    hideCountertopMenu();
    updateHint('Столешница обновлена');
    requestRender();
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
            newoffsetAlongWall += (wallId === "Left" ? socketWidth : -socketWidth);
            break;
        case 'up':
            newOffsetBottom += socketHeight;
            break;
        case 'down':
            newOffsetBottom -= socketHeight;
            break;
        case 'right':
            newoffsetAlongWall += (wallId === "Left" ? -socketWidth : socketWidth);
            break;
    }

    let wallWidth, wallHeight;
    switch (wallId) {
        case "Back": wallWidth = currentLength; wallHeight = currentWidth; break;
        case "Left": case "Right": wallWidth = currentHeight; wallHeight = currentWidth; break;
    }

    if (newoffsetAlongWall < 0 || newoffsetAlongWall + socketWidth > wallWidth || 
        newOffsetBottom < 0 || newOffsetBottom + socketHeight > wallHeight) {
        alert("Новая розетка выходит за пределы стены!");
        return;
    }

    // --- Создаем объект, но пока не добавляем его ---
    const geometry = new THREE.BoxGeometry(params.defaultWidth, params.defaultHeight, params.defaultDepth);
    const material = new THREE.MeshStandardMaterial({ color: params.initialColor });
    const mesh = new THREE.Mesh(geometry, material);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }));
    edges.raycast = () => {};
    mesh.add(edges);

    const newSocket = {
        mesh, wallId, edges,
        initialColor: params.initialColor,
        width: params.defaultWidth, height: params.defaultHeight, depth: params.defaultDepth,
        offsetAlongWall: newoffsetAlongWall, offsetBottom: newOffsetBottom,
        offsetFromParentWall: offsetFromParentWall, type: 'socket'
    };
    
    // Вызываем нашу вспомогательную функцию, чтобы спозиционировать меш
    updateSimpleObjectPosition(newSocket);

    // ==> ИЗМЕНЕНИЕ: Создаем и выполняем команду <==
    const command = new AddObjectCommand(scene, windows, newSocket);
    historyManager.execute(command);

    // Старая розетка `socket` будет очищена вместе со всеми.
    clearSelection();

    // --- Логика UI после добавления ---
    //removeHighlight(socket.mesh);
    applyHighlight(newSocket.mesh);
    selectedCabinets = [newSocket];
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


/**
 * Отображает интерактивные размеры и линии для выделенного простого объекта (окна).
 * @param {object} object - Выделенный объект из массива `windows`.
 */
function showSimpleObjectDimensions(object) {
    // 1. Очищаем все предыдущие размерные элементы
    hideAllDimensionInputs();

    // <== 1. РАСШИРЯЕМ СПИСОК
    const supportedTypes = ['window', 'radiator', 'apron', 'column', 'socket', 'door'];
    if (!supportedTypes.includes(object.type)) {
        return;
    }

    const parentDiv = renderer.domElement.parentNode;
    const wallId = object.wallId;

    // --- 2. Создание HTML-полей ввода ---
    if (object.type === 'door') {
        // Находим все части двери по groupId
        const doorParts = windows.filter(w => w.groupId === object.groupId);
        const doorCanvas = doorParts.find(p => p.doorIndex === 0); // Полотно
        const doorFrame = doorParts.find(p => p.doorIndex === 2);  // Левый наличник (для ширины)

        if (!doorCanvas || !doorFrame) return; // На всякий случай

        // Поле "Ширина полотна"
        widthInputSimple = document.createElement('input');
        widthInputSimple.type = 'text';
        widthInputSimple.className = 'dimension-input';
        widthInputSimple.value = Math.round(doorCanvas.width * 1000);
        parentDiv.appendChild(widthInputSimple);
        attachExpressionValidator(widthInputSimple);

        // Поле "Высота полотна"
        heightInputSimple = document.createElement('input');
        heightInputSimple.type = 'text';
        heightInputSimple.className = 'dimension-input';
        heightInputSimple.value = Math.round(doorCanvas.height * 1000);
        parentDiv.appendChild(heightInputSimple);
        attachExpressionValidator(heightInputSimple);
        
        // Поле "Ширина наличника" - это будет наше поле Глубины
        depthInputSimple = document.createElement('input');
        depthInputSimple.type = 'text';
        depthInputSimple.className = 'dimension-input';
        depthInputSimple.value = Math.round(doorFrame.width * 1000);
        parentDiv.appendChild(depthInputSimple);
        attachExpressionValidator(depthInputSimple);

        // Поля отступов (относительно полотна)
        offsetLeftInput = document.createElement('input'); // Отступ слева (от угла до полотна)
        offsetRightInput = document.createElement('input'); // Отступ справа
        offsetBottomInput = document.createElement('input'); // Отступ от пола
        
        parentDiv.appendChild(offsetLeftInput); attachExpressionValidator(offsetLeftInput);
        parentDiv.appendChild(offsetRightInput); attachExpressionValidator(offsetRightInput);
        parentDiv.appendChild(offsetBottomInput); attachExpressionValidator(offsetBottomInput);
        
    } else if (object.type !== 'socket') { // not for socket 
        // Поле "Ширина"
        widthInputSimple = document.createElement('input');
        widthInputSimple.type = 'text';
        widthInputSimple.className = 'dimension-input';
        widthInputSimple.value = Math.round(object.width * 1000);
        parentDiv.appendChild(widthInputSimple);
        attachExpressionValidator(widthInputSimple);

        // Поле "Высота"
        heightInputSimple = document.createElement('input');
        heightInputSimple.type = 'text';
        heightInputSimple.className = 'dimension-input';
        heightInputSimple.value = Math.round(object.height * 1000);
        parentDiv.appendChild(heightInputSimple);
        attachExpressionValidator(heightInputSimple);

        // ==> 2.1. ДОБАВЛЯЕМ ПОЛЕ "ГЛУБИНА" <==
        depthInputSimple = document.createElement('input');
        depthInputSimple.type = 'text';
        depthInputSimple.className = 'dimension-input';
        depthInputSimple.value = Math.round(object.depth * 1000);
        parentDiv.appendChild(depthInputSimple);
        attachExpressionValidator(depthInputSimple);
    }

    // Поле "Отступ слева"
    offsetLeftInput = document.createElement('input');
    offsetLeftInput.type = 'text';
    offsetLeftInput.className = 'dimension-input';
    parentDiv.appendChild(offsetLeftInput);
    attachExpressionValidator(offsetLeftInput);

    // Поле "Отступ справа"
    offsetRightInput = document.createElement('input');
    offsetRightInput.type = 'text';
    offsetRightInput.className = 'dimension-input';
    parentDiv.appendChild(offsetRightInput);
    attachExpressionValidator(offsetRightInput);

    // Поле "Отступ от пола"
    offsetBottomInput = document.createElement('input');
    offsetBottomInput.type = 'text';
    offsetBottomInput.className = 'dimension-input';
    offsetBottomInput.value = Math.round(object.offsetBottom * 1000);
    parentDiv.appendChild(offsetBottomInput);
    attachExpressionValidator(offsetBottomInput);

    // --- 3. Создание 3D-линий ---
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x333333 });
    lineLeft = new THREE.Line(new THREE.BufferGeometry(), lineMaterial);
    lineRight = new THREE.Line(new THREE.BufferGeometry(), lineMaterial);
    lineBottom = new THREE.Line(new THREE.BufferGeometry(), lineMaterial);
    scene.add(lineLeft, lineRight, lineBottom);

    // --- 4. Обработчики событий для полей ввода ---

    const createAndExecuteChange = (action) => {
        // Копируем данные БЕЗ тяжелых 3D-ссылок
        const { mesh, edges, ...initialData } = object;
        const oldState = JSON.parse(JSON.stringify(initialData));
        const newState = JSON.parse(JSON.stringify(initialData));

        action(newState); // Применяем изменения к данным (ширина, высота и т.д.)

        let command;

        // === РАЗВИЛКА ЛОГИКИ ===
        if (object.type === 'apron') {
            // Для фартука используем его СПЕЦИАЛЬНУЮ команду, 
            // которая умеет перестраивать плитку/панель.
            // Класс UpdateApronCommand должен быть доступен здесь (импортирован или в window)
            // Если ты используешь модули без бандлера, убедись, что экспортировал его в window.
            const CommandClass = window.UpdateApronCommand || UpdateApronCommand; 
            command = new CommandClass(object, newState, oldState);
        } else {
            // Для окон, розеток и радиаторов - старая простая команда
            // (Она просто меняет размеры BoxGeometry)
            const CommandClass = window.UpdateSimpleObjectCommand || UpdateSimpleObjectCommand;
            command = new CommandClass(object, newState, oldState);
        }
        
        historyManager.execute(command);
        requestRender();
    };

    // ================== ОБРАБОТЧИКИ ДЛЯ ДВЕРИ ==================
    if (object.type === 'door') {
        const createAndExecuteDoorChange = () => {
            // 1. Находим все части двери и сохраняем их старые состояния
            const doorParts = windows.filter(w => w.groupId === object.groupId);
            const oldStates = doorParts.map(part => JSON.parse(JSON.stringify(part)));

            // 2. Считываем новые базовые размеры из полей
            const newCanvasWidth = parseFloat(widthInputSimple.value) / 1000;
            const newCanvasHeight = parseFloat(heightInputSimple.value) / 1000;
            const newFrameWidth = parseFloat(depthInputSimple.value) / 1000; // Используем поле "глубины" для ширины наличника
            const newOffsetAlong = parseFloat(offsetLeftInput.value) / 1000;
            const newOffsetBottom = 0; // Дверь всегда на полу

            // 3. Рассчитываем новые состояния для КАЖДОЙ части
            const newStates = calculateDoorPartStates(doorParts, {
                canvasWidth: newCanvasWidth,
                canvasHeight: newCanvasHeight,
                frameWidth: newFrameWidth,
                offsetAlongWall: newOffsetAlong,
                offsetBottom: newOffsetBottom
            });
            
            // 4. Создаем и выполняем групповую команду
            const command = new UpdateObjectsGroupCommand(doorParts, newStates, oldStates);
            historyManager.execute(command);

            requestRender();
            updateSimpleObjectDimensionsPosition(object); // Обновляем UI
        };

        // Вешаем ОДИНАКОВЫЙ обработчик на все поля
        const allDoorInputs = [widthInputSimple, heightInputSimple, depthInputSimple, offsetLeftInput, offsetRightInput];
        allDoorInputs.forEach(input => {
            input.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                    // При изменении отступа справа, пересчитываем отступ слева
                    if (e.target === offsetRightInput) {
                        const wallLength = (wallId === 'Back' || wallId === 'Front') ? currentLength : currentHeight;
                        const newCanvasWidth = parseFloat(widthInputSimple.value) / 1000;
                        const newOffsetRight = parseFloat(offsetRightInput.value) / 1000;
                        offsetLeftInput.value = Math.round((wallLength - newCanvasWidth - newOffsetRight) * 1000);
                    }
                    createAndExecuteDoorChange();
                }
            });
        });

    } else {
        if (object.type !== 'socket') {
            // Изменение ШИРИНЫ
            widthInputSimple.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                    const newWidth = parseFloat(widthInputSimple.value) / 1000;
                    if (isNaN(newWidth) || newWidth <= 0) {
                        widthInputSimple.value = Math.round(object.width * 1000);
                        return;
                    }
                    createAndExecuteChange(state => {
                        state.width = newWidth;
                    });
                    updateSimpleObjectDimensionsPosition(object);
                    requestRender();
                }
            });

            // Изменение ВЫСОТЫ
            heightInputSimple.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                    const newHeight = parseFloat(heightInputSimple.value) / 1000;
                    if (isNaN(newHeight) || newHeight <= 0) {
                        heightInputSimple.value = Math.round(object.height * 1000);
                        return;
                    }
                    createAndExecuteChange(state => {
                        state.height = newHeight;
                    });
                    updateSimpleObjectDimensionsPosition(object);
                    requestRender();
                }
            });

            // ==> 4.1. ДОБАВЛЯЕМ ОБРАБОТЧИК ДЛЯ ГЛУБИНЫ <==
            depthInputSimple.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                    const newDepth = parseFloat(depthInputSimple.value) / 1000;
                    if (isNaN(newDepth) || newDepth <= 0) {
                        depthInputSimple.value = Math.round(object.depth * 1000);
                        return;
                    }
                    createAndExecuteChange(state => {
                        state.depth = newDepth;
                    });
                    // Обновляем UI, чтобы линии корректно перерисовались
                    updateSimpleObjectDimensionsPosition(object);
                }
            });
        }

        // Изменение ОТСТУПА СЛЕВА (двигаем объект)
        offsetLeftInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                const newOffsetCenter = parseFloat(offsetLeftInput.value) / 1000;
                if (isNaN(newOffsetCenter)) return;

                createAndExecuteChange(state => {
                    if (state.type === 'socket') {
                        // Считаем отступ для левого нижнего угла
                        state.offsetAlongWall = newOffsetCenter - state.width / 2;
                    } else {
                        state.offsetAlongWall = newOffsetCenter;
                    }
                });
                updateSimpleObjectDimensionsPosition(object);
            }
        });
        
        // Изменение ОТСТУПА СПРАВА (меняем ширину объекта)
        offsetRightInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                const newOffsetCenter = parseFloat(offsetRightInput.value) / 1000;
                if (isNaN(newOffsetCenter)) return;
                
                createAndExecuteChange(state => {
                    const wallLength = (wallId === 'Back' || wallId === 'Front') ? currentLength : currentHeight;
                    if (state.type === 'socket') {
                        // Для розетки меняем позицию, а не размер
                        const newOffsetLeftCenter = wallLength - newOffsetCenter;
                        state.offsetAlongWall = newOffsetLeftCenter - state.width / 2;
                    } else {
                        // Для окон и др. меняем ширину
                        state.width = wallLength - state.offsetAlongWall - newOffsetCenter;
                    }
                });
                updateSimpleObjectDimensionsPosition(object);
            }
        });

        // Изменение ОТСТУПА ОТ ПОЛА (двигаем объект)
        offsetBottomInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                const newOffsetCenter = parseFloat(offsetBottomInput.value) / 1000;
                if (isNaN(newOffsetCenter)) return;

                createAndExecuteChange(state => {
                    if (state.type === 'socket') {
                        state.offsetBottom = newOffsetCenter - state.height / 2;
                    } else {
                        state.offsetBottom = newOffsetCenter;
                    }
                });
                updateSimpleObjectDimensionsPosition(object);
            }
        });
    }
    // 5. Первоначальное позиционирование всех элементов
    updateSimpleObjectDimensionsPosition(object);
}

/**
 * Обновляет позицию HTML-полей и геометрию 3D-линий для простого объекта.
 * @param {object} object - Выделенный объект.
 */
function updateSimpleObjectDimensionsPosition(object) {
    if (!object || !object.mesh) return;

    let mesh = object.mesh;
    let { width, height, depth, offsetAlongWall, offsetBottom, wallId } = object;
    const canvasRect = renderer.domElement.getBoundingClientRect();
    let halfW = width / 2, halfH = height / 2, halfD = depth / 2;

    // --- Расчет ключевых точек в мировых координатах ---
    const worldPos = new THREE.Vector3();
    mesh.getWorldPosition(worldPos);

    // Точки для полей на объекте
    
    const widthCenterPoint = new THREE.Vector3(0, halfH, halfD).applyMatrix4(mesh.matrixWorld);
    const heightCenterPoint = new THREE.Vector3(halfW, 0, halfD).applyMatrix4(mesh.matrixWorld);
    const depthCenterPoint = new THREE.Vector3(halfW, halfH, 0).applyMatrix4(mesh.matrixWorld);

    // Начальные точки линий (от объекта)
    let leftEdgePoint, rightEdgePoint, bottomEdgePoint;

    if (object.type === 'door') {
        const doorParts = windows.filter(w => w.groupId === object.groupId);
        const doorCanvas = doorParts.find(p => p.doorIndex === 0);
        if (!doorCanvas) return;
        
        // Переопределяем mesh и half-размеры на основе полотна
        mesh = doorCanvas.mesh;
        width = doorCanvas.width; height = doorCanvas.height; depth = doorCanvas.depth;
        halfW = width / 2; halfH = height / 2; halfD = depth / 2;
    }

    if (object.type === 'socket') {
        // Для розеток все линии идут от центра объекта
        leftEdgePoint = worldPos.clone();
        rightEdgePoint = worldPos.clone();
        bottomEdgePoint = worldPos.clone();
    } else {
        // Для остальных объектов - от передних граней (ваш исправленный код)
        leftEdgePoint = new THREE.Vector3(-halfW, halfH, halfD).applyMatrix4(mesh.matrixWorld);
        rightEdgePoint = new THREE.Vector3(halfW, halfH, halfD).applyMatrix4(mesh.matrixWorld);
        bottomEdgePoint = new THREE.Vector3(0, -halfH, halfD).applyMatrix4(mesh.matrixWorld);
    }

    // Точки для линий и отступов
    const wallLength = (wallId === 'Back' || wallId === 'Front') ? currentLength : currentHeight;
    const floorY = -currentWidth / 2;

    // Конечные точки линий (стены и пол)
    const leftWallPoint = new THREE.Vector3();
    const rightWallPoint = new THREE.Vector3();
    const lineY = leftEdgePoint.y;
    //let floorPoint = new THREE.Vector3(worldPos.x, floorY, worldPos.z + object.depth / 2);
    if (wallId === 'Back') {
        leftWallPoint.set(-currentLength / 2, lineY, worldPos.z + object.depth / 2);
        rightWallPoint.set(currentLength / 2, lineY, worldPos.z + object.depth / 2);
        //floorPoint = new THREE.Vector3(worldPos.x, floorY, worldPos.z + object.depth / 2);
    } else if (wallId === 'Left') { // Left/Right
        leftWallPoint.set(worldPos.x + object.depth / 2, lineY, -currentHeight / 2);
        rightWallPoint.set(worldPos.x + object.depth / 2, lineY, currentHeight / 2);
        //floorPoint = new THREE.Vector3(worldPos.x + object.depth / 2, floorY, worldPos.z);
    } else if (wallId === 'Right') { // Left/Right
        leftWallPoint.set(worldPos.x - object.depth / 2, lineY, -currentHeight / 2);
        rightWallPoint.set(worldPos.x - object.depth / 2, lineY, currentHeight / 2);
        //floorPoint = new THREE.Vector3(worldPos.x - object.depth / 2, floorY, worldPos.z);
    }
    // Точка для линии до пола остается без изменений
    const floorPoint = new THREE.Vector3(wallId === 'Left' ? worldPos.x + object.depth / 2 : (wallId === 'Right' ? worldPos.x - object.depth / 2 : worldPos.x), floorY, wallId === 'Back' ? worldPos.z + object.depth / 2 : worldPos.z);
   

    // --- Обновление 3D-линий ---
    lineLeft.geometry.setFromPoints([leftEdgePoint, leftWallPoint]);
    lineRight.geometry.setFromPoints([rightEdgePoint, rightWallPoint]);
    lineBottom.geometry.setFromPoints([bottomEdgePoint, floorPoint]);

    // --- Обновление HTML-полей ---
    const toScreen = (point) => {
        const screenPos = point.project(activeCamera);
        return {
            x: (screenPos.x + 1) * canvasRect.width / 2,
            y: (-screenPos.y + 1) * canvasRect.height / 2
        };
    };

    const positionInput = (input, point) => {
        if (!input) return;
        const pos = toScreen(point);
        const finalX = pos.x - input.offsetWidth / 2;
        const finalY = pos.y - input.offsetHeight / 2;

        input.style.left = `${finalX}px`;
        input.style.top = `${finalY}px`;
    };
    
    if (object.type !== 'socket') {
        positionInput(widthInputSimple, widthCenterPoint);
        positionInput(heightInputSimple, heightCenterPoint);
        positionInput(depthInputSimple, depthCenterPoint);
    }

    if (wallId === 'Left') {
        positionInput(offsetLeftInput, rightEdgePoint.clone().lerp(leftWallPoint, 0.5));
        positionInput(offsetRightInput, leftEdgePoint.clone().lerp(rightWallPoint, 0.5));
    } else {
        positionInput(offsetLeftInput, leftEdgePoint.clone().lerp(leftWallPoint, 0.5));
        positionInput(offsetRightInput, rightEdgePoint.clone().lerp(rightWallPoint, 0.5));
    } 
    positionInput(offsetBottomInput, bottomEdgePoint.clone().lerp(floorPoint, 0.5));

    // Обновляем значения в полях отступов (кроме активного)

    if (object.type === 'door') {
        const doorParts = windows.filter(w => w.groupId === object.groupId);
        const doorCanvas = doorParts.find(p => p.doorIndex === 0);
        const doorFrame = doorParts.find(p => p.doorIndex === 2);
        if (!doorCanvas || !doorFrame) return;

        if (document.activeElement !== widthInputSimple) widthInputSimple.value = Math.round(doorCanvas.width * 1000);
        if (document.activeElement !== heightInputSimple) heightInputSimple.value = Math.round(doorCanvas.height * 1000);
        if (document.activeElement !== depthInputSimple) depthInputSimple.value = Math.round(doorFrame.width * 1000); // Ширина наличника
        if (document.activeElement !== offsetLeftInput) offsetLeftInput.value = Math.round(doorCanvas.offsetAlongWall * 1000);
        if (document.activeElement !== offsetRightInput) {
             const wallLength = (object.wallId === 'Back' || object.wallId === 'Front') ? currentLength : currentHeight;
             const offsetRight = wallLength - doorCanvas.offsetAlongWall - doorCanvas.width;
             offsetRightInput.value = Math.round(offsetRight * 1000);
        }
        // отступ от пола для двери всегда 0
        if (offsetBottomInput) offsetBottomInput.value = 0;

    } else {    
        if (object.type !== 'socket') {    
            if (document.activeElement !== widthInputSimple && widthInputSimple) {
                widthInputSimple.value = Math.round(object.width * 1000);
            }
            if (document.activeElement !== heightInputSimple && heightInputSimple) {
                heightInputSimple.value = Math.round(object.height * 1000);
            }
            if (document.activeElement !== depthInputSimple && depthInputSimple) {
                depthInputSimple.value = Math.round(object.depth * 1000);
            }
        }

        if (document.activeElement !== offsetLeftInput && offsetLeftInput) {
            let offsetLeftValue;
            if (object.type === 'socket') {
                offsetLeftValue = object.offsetAlongWall + object.width / 2;
            } else {
                offsetLeftValue = object.offsetAlongWall;
            }
            offsetLeftInput.value = Math.round(offsetLeftValue * 1000);
        }

        if (document.activeElement !== offsetRightInput && offsetRightInput) {
            const wallLength = (object.wallId === 'Back' || object.wallId === 'Front') ? currentLength : currentHeight;
            let offsetRightValue;
            if (object.type === 'socket') {
                const offsetLeftCenter = object.offsetAlongWall + object.width / 2;
                offsetRightValue = wallLength - offsetLeftCenter;
            } else {
                offsetRightValue = wallLength - object.offsetAlongWall - object.width;
            }
            offsetRightInput.value = Math.round(offsetRightValue * 1000);
        }

        if (document.activeElement !== offsetBottomInput && offsetBottomInput) {
            let offsetBottomValue;
            if (object.type === 'socket') {
                offsetBottomValue = object.offsetBottom + object.height / 2;
            } else {
                offsetBottomValue = object.offsetBottom;
            }
            offsetBottomInput.value = Math.round(offsetBottomValue * 1000);
        }
    }
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

/**
 * Создает и настраивает HTML-поле для интерактивных размеров.
 * @param {string} id - ID для нового input элемента.
 * @param {string} property - Имя свойства в объекте cabinet, которое это поле будет отображать.
 * @param {number} valueInMeters - Начальное значение в метрах.
 * @returns {HTMLInputElement}
 */
function createCornerDimensionInput(id, property, valueInMeters) {
    const parentDiv = renderer.domElement.parentNode;
    
    let input = document.getElementById(id);
    if (input) input.remove();

    input = document.createElement('input');
    input.id = id;
    input.type = 'text';
    input.className = 'dimension-input';
    input.value = Math.round(valueInMeters * 1000);
    
    parentDiv.appendChild(input);
    attachExpressionValidator(input);
    
    input.dataset.property = property; // Сохраняем имя свойства для обработчиков

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
            event.stopPropagation();
            const newWidthMm = parseFloat(widthInput.value);

            // 1. Проверяем, что введенное значение корректно
            if (isNaN(newWidthMm) || newWidthMm < 12) {
                // Если значение неверное, просто восстанавливаем старое и выходим
                const cabinetToRestore = objectManager.getAllCabinets()[cabinetIndex];
                if (cabinetToRestore) {
                    widthInput.value = Math.round(cabinetToRestore.width * 1000);
                }
                return;
            }

            // 2. Получаем объект шкафа, который будем изменять
            const cabinetToChange = objectManager.getAllCabinets()[cabinetIndex];
            if (!cabinetToChange) return;

            // 3. Используем нашу новую "волшебную" функцию-обертку
            objectManager.createAndExecuteUpdateCommand(
                cabinetToChange,
                (cab) => {
                    // Действие: просто меняем ширину.
                    cab.width = newWidthMm / 1000;
                },
                'Изменение ширины'
            );
            // 4. После того, как команда выполнена и свойство обновлено,
            // мы обновляем пользовательский интерфейс.
            // `cabinetToChange` теперь содержит уже обновленную ширину.
            cabinetToChange.mesh.updateMatrixWorld(true);
            updateDimensionsInputPosition(cabinetToChange, objectManager.getAllCabinets());
            //widthInput.value = Math.round(cabinetToChange.width * 1000);
            requestRender();
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
            event.stopPropagation();
            const newDepthMm = parseFloat(depthInput.value);

            if (isNaN(newDepthMm) || newDepthMm < 18) {
                const cabinetToRestore = objectManager.getAllCabinets()[cabinetIndex];
                if (cabinetToRestore) depthInput.value = Math.round(cabinetToRestore.depth * 1000);
                return;
            }
            
            const cabinetToChange = objectManager.getAllCabinets()[cabinetIndex];
            if (!cabinetToChange) return;

            objectManager.createAndExecuteUpdateCommand(
                cabinetToChange,
                (cab) => {
                    // Действие: меняем глубину и зависимое свойство offsetFromParentWall
                    cab.depth = newDepthMm / 1000;
                    if (cab.type === 'lowerCabinet' && cab.wallId !== 'Bottom') {
                        cab.offsetFromParentWall = calculateLowerCabinetOffset(cab);
                    }
                },
                'Изменение глубины'
            );

            // Обновляем UI
            cabinetToChange.mesh.updateMatrixWorld(true);
            updateDimensionsInputPosition(cabinetToChange, objectManager.getAllCabinets());
            requestRender();
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
                // Проверяем, что поле вообще можно редактировать
                if (heightInput.readOnly || heightInput.disabled) return;

                event.stopPropagation();
                const newHeightMm = parseFloat(heightInput.value);

                if (isNaN(newHeightMm) || newHeightMm < 100) {
                    const cabinetToRestore = objectManager.getAllCabinets()[cabinetIndex];
                    if (cabinetToRestore) heightInput.value = Math.round(cabinetToRestore.height * 1000);
                    return;
                }

                const cabinetToChange = objectManager.getAllCabinets()[cabinetIndex];
                if (!cabinetToChange) return;

                // --- НОВЫЙ БЛОК ВАЛИДАЦИИ для liftUpper ---
                if (cabinetToChange.cabinetConfig === 'liftUpper') {
                    const newHeightM = newHeightMm / 1000;
                    const minH = 240 / 1000;
                    const maxH = 1200 / 1000;
                    if (newHeightM < minH || newHeightM > maxH) {
                        alert(`Высота вне допустимого диапазона для подъемника (240-1200мм). Конфигурация будет изменена на 'Распашной'.`);
                        // Сразу меняем конфиг
                        cabinetToChange.cabinetConfig = 'swingUpper';
                    }
                }
                // --- КОНЕЦ БЛОКА ВАЛИДАЦИИ ---

                objectManager.createAndExecuteUpdateCommand(
                    cabinetToChange,
                    (cab) => {
                        // Меняем высоту и флаг независимости
                        cab.height = newHeightMm / 1000;
                        cab.isHeightIndependent = true; // Если пользователь ввел значение, высота становится независимой
                        
                        // Для верхних шкафов при изменении высоты нужно пересчитать отступ снизу
                        if (cab.type === 'upperCabinet') {
                            cab.offsetBottom = (kitchenGlobalParams.totalHeight / 1000) - cab.height;
                        }
                    },
                    'Изменение высоты'
                );

                // Обновляем UI
                updateDimensionsInputPosition(cabinetToChange, objectManager.getAllCabinets());
                requestRender();
            }
    });
    } else {
        heightInput.classList.add('readonly');
    }

    const config = getWallConfig(cabinet.wallId, cabinet);
    
    if (config) {
        cabinet.boundaries = findNearestCabinets(cabinet, cabinets, config.axis, config.maxSize); // Один раз при выделении
        distanceLine = createLine(config.lineStart(cabinet), config.lineEnd(cabinet));
        scene.add(distanceLine);

        toLeftInput = createDimensionInput(cabinet, config, true);
        toRightInput = createDimensionInput(cabinet, config, false);

        toLeftInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.stopPropagation();
                const newValueMm = parseFloat(toLeftInput.value);

                const cabinetToChange = objectManager.getAllCabinets()[cabinetIndex];
                if (!cabinetToChange) return;

                // Получаем config, он нужен для расчетов
                const config = getWallConfig(cabinetToChange.wallId, cabinetToChange);
                if (!config) return;

                const newValueM = newValueMm / 1000;
                const maxValue = config.maxSize - cabinetToChange.width;

                if (isNaN(newValueMm) || newValueM < 0 || newValueM > maxValue) {
                    // Восстанавливаем старое значение
                    toLeftInput.value = Math.round(config.leftValue(cabinetToChange) * 1000);
                    return;
                }
                
                objectManager.createAndExecuteUpdateCommand(
                    cabinetToChange,
                    (cab) => {
                        // Вычисляем и меняем offsetAlongWall
                        const leftBoundary = cab.boundaries.leftBoundary + config.maxSize / 2;
                        cab.offsetAlongWall = leftBoundary + newValueM;
                    },
                    'Изменение отступа слева'
                );

                // ==> ПОСЛЕ ИЗМЕНЕНИЯ, ПЕРЕСЧИТЫВАЕМ ГРАНИЦЫ <==
                const updatedCabinet = objectManager.getAllCabinets().find(c => c.id_data === cabinet.id_data);
                updatedCabinet.boundaries = findNearestCabinets(updatedCabinet, objectManager.getAllCabinets(), config.axis, config.maxSize);
                
                updateDimensionsInputPosition(updatedCabinet, objectManager.getAllCabinets());
                requestRender();
            }
        });

        toRightInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.stopPropagation();
                const newValueMm = parseFloat(toRightInput.value);

                const cabinetToChange = objectManager.getAllCabinets()[cabinetIndex];
                if (!cabinetToChange) return;

                const config = getWallConfig(cabinetToChange.wallId, cabinetToChange);
                if (!config) return;

                const newValueM = newValueMm / 1000;
                const maxValue = config.maxSize - cabinetToChange.width;

                if (isNaN(newValueMm) || newValueM < 0 || newValueM > maxValue) {
                    toRightInput.value = Math.round(config.rightValue(cabinetToChange) * 1000);
                    return;
                }
                
                objectManager.createAndExecuteUpdateCommand(
                    cabinetToChange,
                    (cab) => {
                        // Вычисляем и меняем offsetAlongWall
                        const rightBoundary = cab.boundaries.rightBoundary - config.maxSize / 2;
                        cab.offsetAlongWall = rightBoundary + config.maxSize - newValueM - cab.width;
                    },
                    'Изменение отступа справа'
                );
                
                const updatedCabinet = objectManager.getAllCabinets().find(c => c.id_data === cabinet.id_data);
                updatedCabinet.boundaries = findNearestCabinets(updatedCabinet, objectManager.getAllCabinets(), config.axis, config.maxSize);
                updateDimensionsInputPosition(updatedCabinet, objectManager.getAllCabinets());
                requestRender();
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
            event.stopPropagation();
            const newWidthMm = parseFloat(widthInput.value);

            // 1. Проверяем, что введенное значение корректно
            if (isNaN(newWidthMm) || newWidthMm < 12) {
                // Если значение неверное, просто восстанавливаем старое и выходим
                const cabinetToRestore = objectManager.getAllCabinets()[cabinetIndex];
                if (cabinetToRestore) {
                    widthInput.value = Math.round(cabinetToRestore.width * 1000);
                }
                return;
            }

            // 2. Получаем объект шкафа, который будем изменять
            const cabinetToChange = objectManager.getAllCabinets()[cabinetIndex];
            if (!cabinetToChange) return;

            // 3. Используем нашу новую "волшебную" функцию-обертку
            objectManager.createAndExecuteUpdateCommand(
                cabinetToChange,
                (cab) => {
                    // Действие: просто меняем ширину.
                    cab.width = newWidthMm / 1000;
                },
                'Изменение ширины'
            );
            // 4. После того, как команда выполнена и свойство обновлено,
            // мы обновляем пользовательский интерфейс.
            // `cabinetToChange` теперь содержит уже обновленную ширину.
            cabinetToChange.mesh.updateMatrixWorld(true);
            updateDimensionsInputPosition(cabinetToChange, objectManager.getAllCabinets());
            //widthInput.value = Math.round(cabinetToChange.width * 1000);
            requestRender();
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
            event.stopPropagation();
            const newDepthMm = parseFloat(depthInput.value);

            if (isNaN(newDepthMm) || newDepthMm < 18) {
                const cabinetToRestore = objectManager.getAllCabinets()[cabinetIndex];
                if (cabinetToRestore) depthInput.value = Math.round(cabinetToRestore.depth * 1000);
                return;
            }
            
            const cabinetToChange = objectManager.getAllCabinets()[cabinetIndex];
            if (!cabinetToChange) return;

            objectManager.createAndExecuteUpdateCommand(
                cabinetToChange,
                (cab) => {
                    // Действие: меняем глубину и зависимое свойство offsetFromParentWall
                    cab.depth = newDepthMm / 1000;
                    if (cab.type === 'lowerCabinet' && cab.wallId !== 'Bottom') {
                        cab.offsetFromParentWall = calculateLowerCabinetOffset(cab);
                    }
                },
                'Изменение глубины'
            );

            // Обновляем UI
            cabinetToChange.mesh.updateMatrixWorld(true);
            updateDimensionsInputPosition(cabinetToChange, objectManager.getAllCabinets());
            requestRender();
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
                // Проверяем, что поле вообще можно редактировать
                if (heightInput.readOnly || heightInput.disabled) return;

                event.stopPropagation();
                const newHeightMm = parseFloat(heightInput.value);

                if (isNaN(newHeightMm) || newHeightMm < 100) {
                    const cabinetToRestore = objectManager.getAllCabinets()[cabinetIndex];
                    if (cabinetToRestore) heightInput.value = Math.round(cabinetToRestore.height * 1000);
                    return;
                }

                const cabinetToChange = objectManager.getAllCabinets()[cabinetIndex];
                if (!cabinetToChange) return;

                objectManager.createAndExecuteUpdateCommand(
                    cabinetToChange,
                    (cab) => {
                        // Меняем высоту и флаг независимости
                        cab.height = newHeightMm / 1000;
                        cab.isHeightIndependent = true; // Если пользователь ввел значение, высота становится независимой
                        
                        // Для верхних шкафов при изменении высоты нужно пересчитать отступ снизу
                        if (cab.type === 'upperCabinet') {
                            cab.offsetBottom = (kitchenGlobalParams.totalHeight / 1000) - cab.height;
                        }
                    },
                    'Изменение высоты'
                );

                // Обновляем UI
                updateDimensionsInputPosition(cabinetToChange, objectManager.getAllCabinets());
                requestRender();
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
function updateDimensionsInputPosition(selectedObject, allCabinets) {

    // console.log("UpdateDims called for:", selectedObject); // <-- СЮДА
    // console.log("UserData:", selectedObject.userData); // <-- И СЮДА

    const canvasRect = renderer.domElement.getBoundingClientRect();

    // ==> НАЧАЛО: ОПРЕДЕЛЯЕМ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ЗДЕСЬ <==
    // В самом начале функции, чтобы они были доступны везде внутри нее.
    
    const toScreen = (point) => {
        const screenPos = point.clone().project(activeCamera); // Используем clone(), чтобы не менять исходную точку
        return {
            x: (screenPos.x + 1) * canvasRect.width / 2, // <-- ДОБАВИТЬ + left
            y: (-screenPos.y + 1) * canvasRect.height / 2 // <-- ДОБАВИТЬ + top
        };
    };
    
    const positionInput = (input, point) => {
        if (!input) return;
        const pos = toScreen(point);
        input.style.left = `${pos.x - input.offsetWidth / 2}px`;
        input.style.top = `${pos.y - input.offsetHeight / 2}px`;
    };

        // --- НОВЫЙ БЛОК: Если выбрана ТЕХНИКА ---
    if (selectedObject.userData && (selectedObject.userData.type === 'hob' || selectedObject.userData.type === 'sink_model')) {
        const appliance = selectedObject;
        const parent = appliance.parent;
        // --- ИСПРАВЛЕНИЕ: Проверка родителя ---
        if (!parent || !parent.userData) {
            // Объект удален из сцены, но остался выделенным.
            // Скрываем размеры и выходим.
            if (toLeftInput) toLeftInput.style.display = 'none';
            if (toRightInput) toRightInput.style.display = 'none';
            return; 
        }
        const ctLength = parent.userData.length;

        // Точки для левого и правого размера
        // Левая точка: середина отрезка между левым краем столешницы и центром техники
        // Правая точка: ...
        
        // Проще: ставим поля по краям техники или посередине расстояния.
        
        // Давайте найдем мировые координаты левого края столешницы
        const leftEdgeLocal = new THREE.Vector3(-ctLength / 2, 0, 0);
        const rightEdgeLocal = new THREE.Vector3(ctLength / 2, 0, 0);
        
        // Центр техники в локальных координатах столешницы
        const applianceCenterLocal = appliance.position.clone(); 
        // (учтите, что y и z могут быть смещены, но для размеров вдоль длины нам важен X)
        applianceCenterLocal.y = 0; applianceCenterLocal.z = 0;

        // Точки, где должны висеть цифры (середина расстояния)
        const leftLabelLocal = new THREE.Vector3().addVectors(leftEdgeLocal, applianceCenterLocal).multiplyScalar(0.5);
        const rightLabelLocal = new THREE.Vector3().addVectors(rightEdgeLocal, applianceCenterLocal).multiplyScalar(0.5);

        // Переводим в мировые
        parent.updateMatrixWorld(true);
        leftLabelLocal.applyMatrix4(parent.matrixWorld);
        rightLabelLocal.applyMatrix4(parent.matrixWorld);
        
        // Немного поднимаем, чтобы было над столешницей
        leftLabelLocal.y += 0.01; 
        rightLabelLocal.y += 0.01;

        //console.log("Left Label World Pos:", leftLabelLocal);

        positionInput(toLeftInput, leftLabelLocal);
        positionInput(toRightInput, rightLabelLocal);
        
        return; // Выходим, чтобы не выполнять логику для шкафов
    }

    let meshToPosition;
    let cabinetData; // Будет содержать данные объекта (для столешницы это userData)
    if (selectedObject.userData && selectedObject.userData.type === 'countertop') {
        // Это столешница, она сама является мешем
        meshToPosition = selectedObject;
        cabinetData = selectedObject.userData;
    } else if (selectedObject.mesh) {
        // Это объект шкафа, у него есть свойство .mesh
        meshToPosition = selectedObject.mesh;
        cabinetData = selectedObject;
    } else {
        // Неизвестный объект, ничего не делаем
        // console.warn("updateDimensionsInputPosition: передан неизвестный тип объекта.", selectedObject);
        return;
    }

    // ==> КОНЕЦ: ОПРЕДЕЛЯЕМ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ <==

    const x = meshToPosition.position.x;
    const y = meshToPosition.position.y;
    const z = meshToPosition.position.z;
    const roomLength = currentLength;
    const roomHeight = currentHeight;

    if (widthInput) {
        const widthStart = new THREE.Vector3(-cabinetData.width / 2, cabinetData.height / 2, cabinetData.depth / 2);
        const widthEnd = new THREE.Vector3(cabinetData.width / 2, cabinetData.height / 2, cabinetData.depth / 2);
        widthStart.applyMatrix4(meshToPosition.matrixWorld);
        widthEnd.applyMatrix4(meshToPosition.matrixWorld);
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
        const depthStart = new THREE.Vector3(cabinetData.width / 2, cabinetData.height / 2, -cabinetData.depth / 2);
        const depthEnd = new THREE.Vector3(cabinetData.width / 2, cabinetData.height / 2, cabinetData.depth / 2);
        depthStart.applyMatrix4(meshToPosition.matrixWorld);
        depthEnd.applyMatrix4(meshToPosition.matrixWorld);
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
        const heightStart = new THREE.Vector3(cabinetData.width / 2, cabinetData.height / 2, cabinetData.depth / 2);
        const heightEnd = new THREE.Vector3(cabinetData.width / 2, -cabinetData.height / 2, cabinetData.depth / 2);
        heightStart.applyMatrix4(meshToPosition.matrixWorld);
        heightEnd.applyMatrix4(meshToPosition.matrixWorld);
        const heightCenter = heightStart.clone().lerp(heightEnd, 0.5);
        heightCenter.project(activeCamera);
        const screenX = (heightCenter.x + 1) * canvasRect.width / 2 + canvasRect.left;
        const screenY = (-heightCenter.y + 1) * canvasRect.height / 2 + canvasRect.top;
        const finalX = screenX - canvasRect.left;
        const finalY = screenY - canvasRect.top;
        heightInput.style.left = `${finalX - heightInput.offsetWidth / 2}px`;
        heightInput.style.top = `${finalY - heightInput.offsetHeight / 2}px`;
    }

    // ==> НАЧАЛО НОВОГО БЛОКА <==
    // --- Позиционирование и обновление УНИКАЛЬНЫХ полей для УГЛОВОГО шкафа ---
    if (cabinetData.cabinetType === 'corner' || cabinetData.cabinetType === 'cornerUpper') {
        const cabinetMatrix = meshToPosition.matrixWorld;
        // Позиционирование
        if (cornerFacadeWidthInput) {
            const DELTA_M = cabinetData.cornerElementWidth || 0.018;
            let facadeCenterOffset;
            let depthOffset = cabinetData.depth / 2; // Смещение по оси Z геометрии (вперед)

            if (cabinetData.wallId === 'Left') {
                if (cabinetData.cornerDirection === 'left') { // Ближе к Front
                    const rightPartSizeM = (cabinetData.facadeWidth || 0.45) + DELTA_M;
                    const pivotFromLeft = cabinetData.width - rightPartSizeM;
                    const facadeCenterFromLeft = pivotFromLeft + (cabinetData.facadeWidth || 0.45) / 2 + DELTA_M;
                    facadeCenterOffset = -facadeCenterFromLeft + cabinetData.width / 2;
                } else { // 'right' (ближе к Back)
                    const leftPartSizeM = (cabinetData.facadeWidth || 0.45) + DELTA_M;
                    const facadeCenterFromLeft = leftPartSizeM - (cabinetData.facadeWidth || 0.45) / 2 - DELTA_M;
                    facadeCenterOffset = -facadeCenterFromLeft + cabinetData.width / 2;
                }
            } else {            
                if (cabinetData.cornerDirection === 'left') {
                    const rightPartSizeM = (cabinetData.facadeWidth || 0.45) + DELTA_M;
                    const pivotFromLeft = cabinetData.width - rightPartSizeM;
                    const facadeCenterFromLeft = pivotFromLeft + (cabinetData.facadeWidth || 0.45) / 2 + DELTA_M;
                    facadeCenterOffset = facadeCenterFromLeft - cabinetData.width / 2;
                    //console.log("facadeCenterOffset =", facadeCenterOffset);
                } else { // 'right'
                    const leftPartSizeM = (cabinetData.facadeWidth || 0.45) + DELTA_M;
                    const facadeCenterFromLeft = leftPartSizeM - (cabinetData.facadeWidth || 0.45) / 2 - DELTA_M;
                    facadeCenterOffset = facadeCenterFromLeft - cabinetData.width / 2;
                }
            }

            const facadeCenterPoint = new THREE.Vector3(
                facadeCenterOffset, 
                -cabinetData.height / 2, 
                depthOffset).applyMatrix4(meshToPosition.matrixWorld);
            positionInput(cornerFacadeWidthInput, facadeCenterPoint);
        }

        if (cornerTotalWidthDisplay) {
            // Рассчитываем 3D-точку на центре верхнего заднего ребра
            const totalWidthCenterPoint = new THREE.Vector3(0, cabinetData.height / 2, -cabinetData.depth / 2)
                .applyMatrix4(meshToPosition.matrixWorld);
            
            positionInput(cornerTotalWidthDisplay, totalWidthCenterPoint);

        }
        // --- Позиционирование поля, которое есть ТОЛЬКО у ВЕРХНЕГО углового ---
        if (cabinetData.cabinetType === 'cornerUpper' && offsetBottomInput) {
            // Точка на полу прямо под центром шкафа
            const pointOnFloor = new THREE.Vector3(0, -cabinetData.height / 2, 0);
            pointOnFloor.applyMatrix4(cabinetMatrix);
            pointOnFloor.y -= 0.3; // "опускаем" на полметра ниже шкафа
            positionInput(offsetBottomInput, pointOnFloor);
        }

        // --- Обновляем ЗНАЧЕНИЯ во всех полях ---
        // Условие `document.activeElement !== ...` предотвращает "прыгание" значения при вводе
        if (document.activeElement !== widthInput && widthInput) widthInput.value = Math.round(cabinetData.width * 1000);
        if (document.activeElement !== depthInput && depthInput) depthInput.value = Math.round(cabinetData.depth * 1000);
        if (document.activeElement !== heightInput && heightInput) heightInput.value = Math.round(cabinetData.height * 1000);
        if (document.activeElement !== cornerFacadeWidthInput && cornerFacadeWidthInput) {
            cornerFacadeWidthInput.value = Math.round((cabinetData.facadeWidth || 0.45) * 1000);
        }
        if (cabinetData.cabinetType === 'cornerUpper' && document.activeElement !== offsetBottomInput && offsetBottomInput) {
            offsetBottomInput.value = Math.round(cabinetData.offsetBottom * 1000);
        }
        if (cornerTotalWidthDisplay) {
            let totalWidthValue;
            if (cabinetData.cornerDirection === 'left') {
                // Габарит от ЛЕВОГО угла до правого края шкафа
                totalWidthValue = cabinetData.offsetAlongWall + cabinetData.width; 
            } else { // 'right'
                // Габарит от ПРАВОГО угла до левого края шкафа
                const wallLength = (cabinetData.wallId === 'Back' || cabinetData.wallId === 'Front') 
                    ? roomDimensions.getLength() 
                    : roomDimensions.getHeight();
                totalWidthValue = wallLength - cabinetData.offsetAlongWall;
            }
            cornerTotalWidthDisplay.value = Math.round(totalWidthValue * 1000);
        }


        // ==> КОНЕЦ НОВОГО БЛОКА <==
    }
    // ==> КОНЕЦ НОВОГО БЛОКА <==



    if (cabinetData.type === 'countertop') {
        // ==> НОВЫЙ БЛОК: Логика обновления позиции полей для СТОЛЕШНИЦЫ <==
        // Мы просто вызываем соответствующие функции, которые мы уже создали
        if (cabinetData.wallId === 'Bottom') {
            const roomL = currentLength; 
            const roomD = currentHeight;
            const ctRotY = meshToPosition.rotation.y;
            const axisIsX = (Math.abs(ctRotY) < 0.1 || Math.abs(Math.abs(ctRotY) - Math.PI) < 0.1);
            const lb = axisIsX ? -roomL/2 : -roomD/2;
            const rb = axisIsX ?  roomL/2 :  roomD/2;
            updateFreestandingCountertopDimensionsPosition(meshToPosition, lb, rb);
        } else if (['Back', 'Front', 'Left', 'Right'].includes(cabinetData.wallId)) {
            // Для стенных столешниц тоже нужно пересчитывать границы
            const {leftBoundary, rightBoundary} = findNearestObstacles(meshToPosition, allCabinets, countertops);
            updateWallCountertopDimensionsPosition(meshToPosition, leftBoundary, rightBoundary);
        }

    } else if (cabinetData.type === 'freestandingCabinet') {
        const rotationY = THREE.MathUtils.radToDeg(meshToPosition.rotation.y) % 360;
        //const isAlongX = (rotationY === 0 || rotationY === 180); // Back или Front

        let toLeftPos, toRightPos, toBackPos, toFrontPos;
        let effectiveWidth, effectiveDepth;
        let widthLineStart, widthLineEnd, depthLineStart, depthLineEnd;

        if (rotationY === 0) { // Back: Лицевая грань к Front
            effectiveWidth = cabinetData.width;
            effectiveDepth = cabinetData.depth;

            toLeftPos = new THREE.Vector3(-cabinetData.width / 2 - cabinetData.offsetX / 2, cabinetData.height / 2, cabinetData.depth / 2);
            toRightPos = new THREE.Vector3(cabinetData.width / 2 + (roomLength - cabinetData.width - cabinetData.offsetX) / 2, cabinetData.height / 2, cabinetData.depth / 2);
            toBackPos = new THREE.Vector3(-cabinetData.width / 2, cabinetData.height / 2, -cabinetData.depth / 2 - cabinetData.offsetZ / 2);
            toFrontPos = new THREE.Vector3(-cabinetData.width / 2, cabinetData.height / 2, cabinetData.depth / 2 + (roomHeight - cabinetData.depth - cabinetData.offsetZ) / 2);
            
            widthLineStart = new THREE.Vector3(-roomLength / 2, y + cabinetData.height / 2, z + cabinetData.depth / 2);
            widthLineEnd = new THREE.Vector3(roomLength / 2, y + cabinetData.height / 2, z + cabinetData.depth / 2);
            depthLineStart = new THREE.Vector3(x - cabinetData.width / 2, y + cabinetData.height / 2, -roomHeight / 2);
            depthLineEnd = new THREE.Vector3(x - cabinetData.width / 2, y + cabinetData.height / 2, roomHeight / 2);

            if (toLeftInput) toLeftInput.value = Math.round(cabinetData.offsetX * 1000);
            if (toRightInput) toRightInput.value = Math.round((roomLength - cabinetData.offsetX - cabinetData.width) * 1000);
            if (toBackInput) toBackInput.value = Math.round(cabinetData.offsetZ * 1000);
            if (toFrontInput) toFrontInput.value = Math.round((roomHeight - cabinetData.offsetZ - cabinetData.depth) * 1000);

        } else if (rotationY === 90 || rotationY === -270) { // Left: Лицевая грань к Right
            toLeftPos = new THREE.Vector3(cabinetData.width / 2 + cabinetData.offsetZ / 2, cabinetData.height / 2, cabinetData.depth / 2);
            toRightPos = new THREE.Vector3(-cabinetData.width / 2 - (roomHeight - cabinetData.width - cabinetData.offsetZ) / 2, cabinetData.height / 2, cabinetData.depth / 2);
            toBackPos = new THREE.Vector3(-cabinetData.width / 2, cabinetData.height / 2, -cabinetData.depth / 2 - cabinetData.offsetX / 2);
            toFrontPos = new THREE.Vector3(-cabinetData.width / 2, cabinetData.height / 2, cabinetData.depth / 2 + (roomLength - cabinetData.depth - cabinetData.offsetX) / 2);

            widthLineStart = new THREE.Vector3(x + cabinetData.depth / 2, y + cabinetData.height / 2, -roomHeight / 2);
            widthLineEnd = new THREE.Vector3(x + cabinetData.depth / 2, y + cabinetData.height / 2, roomHeight / 2);
            depthLineStart = new THREE.Vector3(-roomLength / 2, y + cabinetData.height / 2, z + cabinetData.width / 2);
            depthLineEnd = new THREE.Vector3(roomLength / 2, y + cabinetData.height / 2, z + cabinetData.width / 2);

            if (toLeftInput) toLeftInput.value = Math.round(cabinetData.offsetZ * 1000);
            if (toRightInput) toRightInput.value = Math.round((roomHeight - cabinetData.offsetZ - cabinetData.width) * 1000); // Используем width
            if (toBackInput) toBackInput.value = Math.round(cabinetData.offsetX * 1000);
            if (toFrontInput) toFrontInput.value = Math.round((roomLength - cabinetData.offsetX - cabinetData.depth) * 1000); // Используем depth

        } else if (rotationY === -90 || rotationY === 270) { // Right: Лицевая грань к Left
            toLeftPos = new THREE.Vector3(-cabinetData.width / 2 - cabinetData.offsetZ / 2, cabinetData.height / 2, cabinetData.depth / 2 ); // Оставляем как есть
            toRightPos = new THREE.Vector3(cabinetData.width / 2 + (roomHeight - cabinetData.width - cabinetData.offsetZ) / 2, cabinetData.height / 2, cabinetData.width / 2); // Оставляем как есть
            toBackPos = new THREE.Vector3(-cabinetData.width / 2, cabinetData.height / 2, cabinetData.width / 2 + cabinetData.offsetX / 2);
            toFrontPos = new THREE.Vector3(-cabinetData.width / 2, cabinetData.height / 2, -cabinetData.depth / 2 - (roomLength - cabinetData.depth - cabinetData.offsetX) / 2);

            widthLineStart = new THREE.Vector3(x - cabinetData.depth / 2, y + cabinetData.height / 2, -roomHeight / 2);
            widthLineEnd = new THREE.Vector3(x - cabinetData.depth / 2, y + cabinetData.height / 2, roomHeight / 2);
            depthLineStart = new THREE.Vector3(-roomLength / 2, y + cabinetData.height / 2, z - cabinetData.width / 2);
            depthLineEnd = new THREE.Vector3(roomLength / 2, y + cabinetData.height / 2, z - cabinetData.width / 2);

            if (toLeftInput) toLeftInput.value = Math.round(cabinetData.offsetZ * 1000);  // Используем width
            if (toRightInput) toRightInput.value = Math.round((roomHeight - cabinetData.offsetZ - cabinetData.width) * 1000);
            if (toBackInput) toBackInput.value = Math.round(cabinetData.offsetX * 1000); // Используем depth
            if (toFrontInput) toFrontInput.value = Math.round((roomLength - cabinetData.offsetX - cabinetData.depth) * 1000); 

        } else if (rotationY === 180 || rotationY === -180) { // Front: Лицевая грань к Back
            toRightPos = new THREE.Vector3(-cabinetData.width / 2 - (roomLength - cabinetData.width - cabinetData.offsetX) / 2, cabinetData.height / 2, cabinetData.depth / 2);
            toLeftPos  = new THREE.Vector3(cabinetData.width / 2 + cabinetData.offsetX / 2, cabinetData.height / 2, cabinetData.depth / 2);
            toBackPos = new THREE.Vector3(-cabinetData.width / 2, cabinetData.height / 2, cabinetData.depth / 2 + cabinetData.offsetZ / 2);
            toFrontPos = new THREE.Vector3(-cabinetData.width / 2, cabinetData.height / 2, -cabinetData.depth / 2 - (roomHeight - cabinetData.depth - cabinetData.offsetZ) / 2);

            widthLineStart = new THREE.Vector3(-roomLength / 2, y + cabinetData.height / 2, z - cabinetData.depth / 2);
            widthLineEnd = new THREE.Vector3(roomLength / 2, y + cabinetData.height / 2, z - cabinetData.depth / 2);
            depthLineStart = new THREE.Vector3(x + cabinetData.width / 2, y + cabinetData.height / 2, -roomHeight / 2);
            depthLineEnd = new THREE.Vector3(x + cabinetData.width / 2, y + cabinetData.height / 2, roomHeight / 2);

            if (toLeftInput) toLeftInput.value = Math.round(cabinetData.offsetX * 1000);
            if (toRightInput) toRightInput.value = Math.round((roomLength - cabinetData.offsetX - cabinetData.width) * 1000);
            if (toBackInput) toBackInput.value = Math.round(cabinetData.offsetZ * 1000);
            if (toFrontInput) toFrontInput.value = Math.round((roomHeight - cabinetData.offsetZ - cabinetData.depth) * 1000);
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
            toLeftPos.applyMatrix4(meshToPosition.matrixWorld);
            toLeftPos.project(activeCamera);
            const screenX = (toLeftPos.x + 1) * canvasRect.width / 2 + canvasRect.left;
            const screenY = (-toLeftPos.y + 1) * canvasRect.height / 2 + canvasRect.top;
            const finalX = screenX - canvasRect.left;
            const finalY = screenY - canvasRect.top;
            toLeftInput.style.left = `${finalX - toLeftInput.offsetWidth / 2}px`;
            toLeftInput.style.top = `${finalY - toLeftInput.offsetHeight / 2}px`;
        }
        if (toRightInput) {
            toRightPos.applyMatrix4(meshToPosition.matrixWorld);
            toRightPos.project(activeCamera);
            const screenX = (toRightPos.x + 1) * canvasRect.width / 2 + canvasRect.left;
            const screenY = (-toRightPos.y + 1) * canvasRect.height / 2 + canvasRect.top;
            const finalX = screenX - canvasRect.left;
            const finalY = screenY - canvasRect.top;
            toRightInput.style.left = `${finalX - toRightInput.offsetWidth / 2}px`;
            toRightInput.style.top = `${finalY - toRightInput.offsetHeight / 2}px`;
        }
        if (toBackInput) {
            toBackPos.applyMatrix4(meshToPosition.matrixWorld);
            toBackPos.project(activeCamera);
            const screenX = (toBackPos.x + 1) * canvasRect.width / 2 + canvasRect.left;
            const screenY = (-toBackPos.y + 1) * canvasRect.height / 2 + canvasRect.top;
            const finalX = screenX - canvasRect.left;
            const finalY = screenY - canvasRect.top;
            toBackInput.style.left = `${finalX - toBackInput.offsetWidth / 2}px`;
            toBackInput.style.top = `${finalY - toBackInput.offsetHeight / 2}px`;
        }
        if (toFrontInput) {
            toFrontPos.applyMatrix4(meshToPosition.matrixWorld);
            toFrontPos.project(activeCamera);
            const screenX = (toFrontPos.x + 1) * canvasRect.width / 2 + canvasRect.left;
            const screenY = (-toFrontPos.y + 1) * canvasRect.height / 2 + canvasRect.top;
            const finalX = screenX - canvasRect.left;
            const finalY = screenY - canvasRect.top;
            toFrontInput.style.left = `${finalX - toFrontInput.offsetWidth / 2}px`;
            toFrontInput.style.top = `${finalY - toFrontInput.offsetHeight / 2}px`;
        }

    } else if (cabinetData.wallId && cabinetData.wallId !== 'Bottom') {
        // Для нижних и верхних шкафов
        const config = getWallConfig(cabinetData.wallId, cabinetData);
        if (config) {
            //cabinetData.boundaries = findNearestCabinets(cabinetData, allCabinets, config.axis, config.maxSize);
            if (toLeftInput) {
                const leftPoint = config.leftPoint(cabinetData);
                leftPoint.applyMatrix4(cube.matrixWorld);
                leftPoint.project(activeCamera);
                const screenX = (leftPoint.x + 1) * canvasRect.width / 2 + canvasRect.left;
                const screenY = (-leftPoint.y + 1) * canvasRect.height / 2 + canvasRect.top;
                const finalX = screenX - canvasRect.left;
                const finalY = screenY - canvasRect.top;
                toLeftInput.style.left = `${finalX - toLeftInput.offsetWidth / 2}px`;
                toLeftInput.style.top = `${finalY - toLeftInput.offsetHeight / 2}px`;
                if (document.activeElement !== toLeftInput) {
                    toLeftInput.value = Math.round(config.leftValue(cabinetData) * 1000);
                }
            }

            if (toRightInput) {
                const rightPoint = config.rightPoint(cabinetData);
                rightPoint.applyMatrix4(cube.matrixWorld);
                rightPoint.project(activeCamera);
                const screenX = (rightPoint.x + 1) * canvasRect.width / 2 + canvasRect.left;
                const screenY = (-rightPoint.y + 1) * canvasRect.height / 2 + canvasRect.top;
                const finalX = screenX - canvasRect.left;
                const finalY = screenY - canvasRect.top;
                toRightInput.style.left = `${finalX - toRightInput.offsetWidth / 2}px`;
                toRightInput.style.top = `${finalY - toRightInput.offsetHeight / 2}px`;
                if (document.activeElement !== toRightInput) {
                    toRightInput.value = Math.round(config.rightValue(cabinetData) * 1000);
                }
            }
        }
    }
}

let cornerWidthInput, cornerDepthInput, cornerHeightInput, 
    cornerOffsetLeftInput, cornerOffsetRightDisplay,
    cornerLineLeft, cornerLineRight, cornerFacadeWidthInput, 
    cornerTotalWidthDisplay;

/**
 * Отображает интерактивные размеры для УГЛОВОГО шкафа с его уникальной логикой.
 * @param {object} cabinet - Объект углового шкафа.
 */

function showCornerCabinetDimensions(cabinet) {
    hideAllDimensionInputs();
    
    const parentDiv = renderer.domElement.parentNode;
    const DELTA_M = cabinet.cornerElementWidth || 0.020;
    const DELTA_MM = DELTA_M * 1000;
    const allCabinets = objectManager.getAllCabinets();
    const cabinetIndex = allCabinets.indexOf(cabinet);
    const direction = cabinet.cornerDirection || 'left';

    // --- 1. Получаем размеры стены ---
    const wallLength = (cabinet.wallId === 'Back' || cabinet.wallId === 'Front') 
        ? roomDimensions.getLength() 
        : roomDimensions.getHeight()

     // --- 2. Расчет "пояса" (pivot) ---
    const neighbor = findNearestNeighbor(cabinet);
    let pivotPositionM;
    if (neighbor) {
        const countertopDepth = getCountertopDepthForWall(neighbor.wallId);
        pivotPositionM = countertopDepth - (neighbor.overhang ?? 0.018);
    } else {
        const adjacentWallId = getAdjacentWallId(cabinet.wallId, direction);
        pivotPositionM = (getCountertopDepthForWall(adjacentWallId) || 0.6) - (cabinet.overhang ?? 0.018);
    }

    // --- 3. Создаем поля ввода ---
    
    // Поле "Общая ширина"
    widthInput = document.createElement('input'); // Используем глобальную `widthInput`
    widthInput.type = 'text';
    widthInput.className = 'dimension-input';
    widthInput.value = Math.round(cabinet.width * 1000);
    parentDiv.appendChild(widthInput);
    attachExpressionValidator(widthInput);

    // Поле "Глубина"
    depthInput = document.createElement('input');
    depthInput.type = 'text';
    depthInput.className = 'dimension-input';
    depthInput.value = Math.round(cabinet.depth * 1000);
    depthInput.dataset.min = "18";   // Минимальная глубина 18 мм
    renderer.domElement.parentNode.appendChild(depthInput);
    attachExpressionValidator(depthInput);

    depthInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.stopPropagation();
            const newDepthMm = parseFloat(depthInput.value);

            if (isNaN(newDepthMm) || newDepthMm < 18) {
                const cabinetToRestore = objectManager.getAllCabinets()[cabinetIndex];
                if (cabinetToRestore) depthInput.value = Math.round(cabinetToRestore.depth * 1000);
                return;
            }
            
            const cabinetToChange = objectManager.getAllCabinets()[cabinetIndex];
            if (!cabinetToChange) return;

            objectManager.createAndExecuteUpdateCommand(
                cabinetToChange,
                (cab) => {
                    // Действие: меняем глубину и зависимое свойство offsetFromParentWall
                    cab.depth = newDepthMm / 1000;
                    if (cab.type === 'lowerCabinet' && cab.wallId !== 'Bottom') {
                        cab.offsetFromParentWall = calculateLowerCabinetOffset(cab);
                    }
                },
                'Изменение глубины'
            );

            // Обновляем UI
            cabinetToChange.mesh.updateMatrixWorld(true);
            updateDimensionsInputPosition(cabinetToChange, objectManager.getAllCabinets());
            requestRender();
        }
    });

    // Поле "Высота"
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
                // Проверяем, что поле вообще можно редактировать
                if (heightInput.readOnly || heightInput.disabled) return;

                event.stopPropagation();
                const newHeightMm = parseFloat(heightInput.value);

                if (isNaN(newHeightMm) || newHeightMm < 100) {
                    const cabinetToRestore = objectManager.getAllCabinets()[cabinetIndex];
                    if (cabinetToRestore) heightInput.value = Math.round(cabinetToRestore.height * 1000);
                    return;
                }

                const cabinetToChange = objectManager.getAllCabinets()[cabinetIndex];
                if (!cabinetToChange) return;

                objectManager.createAndExecuteUpdateCommand(
                    cabinetToChange,
                    (cab) => {
                        // Меняем высоту и флаг независимости
                        cab.height = newHeightMm / 1000;
                        cab.isHeightIndependent = true; // Если пользователь ввел значение, высота становится независимой
                        
                        // Для верхних шкафов при изменении высоты нужно пересчитать отступ снизу
                        if (cab.type === 'upperCabinet') {
                            cab.offsetBottom = (kitchenGlobalParams.totalHeight / 1000) - cab.height;
                        }
                    },
                    'Изменение высоты'
                );

                // Обновляем UI
                updateDimensionsInputPosition(cabinetToChange, objectManager.getAllCabinets());
                requestRender();
            }
    });
    } else {
        heightInput.classList.add('readonly');
    }

    // НОВОЕ ПОЛЕ "ШИРИНА ФАСАДА"
    cornerFacadeWidthInput = document.createElement('input');
    cornerFacadeWidthInput.type = 'text';
    cornerFacadeWidthInput.className = 'dimension-input';
    cornerFacadeWidthInput.value = Math.round((cabinet.facadeWidth || 0.45) * 1000);
    parentDiv.appendChild(cornerFacadeWidthInput);
    attachExpressionValidator(cornerFacadeWidthInput);

    // --- 4. Логика для отступов и линий ---
    const config = getWallConfig(cabinet.wallId, cabinet);
    if (config) {
        cabinet.boundaries = findNearestCabinets(cabinet, allCabinets, config.axis, config.maxSize);
        distanceLine = createLine(config.lineStart(cabinet), config.lineEnd(cabinet));
        scene.add(distanceLine);

        // Поля отступов
        toLeftInput = createDimensionInput(cabinet, config, true);
        toRightInput = createDimensionInput(cabinet, config, false);

        // ==> НАСТРАИВАЕМ РЕДАКТИРУЕМОСТЬ В ЗАВИСИМОСТИ ОТ НАПРАВЛЕНИЯ <==
        if (direction === 'left') {
            toRightInput.readOnly = true;
            toRightInput.classList.add('readonly');
        } else { // direction === 'right'
            toLeftInput.readOnly = true;
            toLeftInput.classList.add('readonly');
        }
    }

    // ==> НАЧАЛО: НОВОЕ ПОЛЕ "ОБЩИЙ ГАБАРИТ" <==
    cornerTotalWidthDisplay = document.createElement('input');
    cornerTotalWidthDisplay.type = 'text';
    cornerTotalWidthDisplay.className = 'dimension-input readonly';
    cornerTotalWidthDisplay.readOnly = true;
    parentDiv.appendChild(cornerTotalWidthDisplay);
    // ==> КОНЕЦ: НОВОЕ ПОЛЕ <==
    
    // --- 5. Обработчики событий ---

     // 5.1. Изменение ШИРИНЫ ФАСАДА (влияет на общую ширину и/или отступ)
    cornerFacadeWidthInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.stopPropagation();

        const newFacadeWidthM = parseFloat(cornerFacadeWidthInput.value) / 1000;
        
         if (isNaN(newFacadeWidthM) || newFacadeWidthM < 0.300) {
            alert(`Минимальная ширина фасада: 300 мм`);
            updateDimensionsInputPosition(cabinet, allCabinets);
            return;
        }
        
        let newWidthM;
        let newOffsetM = cabinet.offsetAlongWall; // По умолчанию отступ не меняется (для левого шкафа)

        if (direction === 'left') {
            // --- Логика для ЛЕВОГО (она у вас работала) ---
            const leftPartSizeM = pivotPositionM - cabinet.offsetAlongWall;
            const newRightPartSizeM = newFacadeWidthM + (DELTA_MM / 1000);
            newWidthM = leftPartSizeM + newRightPartSizeM;

        } else { // direction === 'right'
            // --- НОВАЯ, ПРАВИЛЬНАЯ ЛОГИКА ДЛЯ ПРАВОГО ---
            
            // 1. Сохраняем НЕИЗМЕННЫЙ отступ от правого края
            const offsetFromRight = wallLength - cabinet.offsetAlongWall - cabinet.width;

            // 2. Рассчитываем размер правой части (она не меняется)
            const rightPartSizeM = pivotPositionM - offsetFromRight;

            // 3. Рассчитываем НОВЫЙ размер левой части на основе нового фасада
            const newLeftPartSizeM = newFacadeWidthM + (DELTA_MM / 1000);
            
            // 4. Рассчитываем НОВУЮ общую ширину
            newWidthM = newLeftPartSizeM + rightPartSizeM;

            // 5. Рассчитываем НОВЫЙ отступ от левого края
            newOffsetM = wallLength - newWidthM - offsetFromRight;
        }
        
        // Принудительно обновляем значение в поле общей ширины
        if (widthInput) {
            widthInput.value = Math.round(newWidthM * 1000);
        }
        // Также обновим и поле левого отступа, если это правый шкаф
        if (toLeftInput && direction === 'right') {
            toLeftInput.value = Math.round(newOffsetM * 1000);
        }
        
        // Выполняем команду с новыми данными
        objectManager.createAndExecuteUpdateCommand(cabinet, (cab) => {
            cab.facadeWidth = newFacadeWidthM;
            cab.width = newWidthM;
            cab.offsetAlongWall = newOffsetM; // Применяем новый отступ
        }, 'Изменение фасада углового шкафа');

        // Обновляем UI после команды
        const updatedCabinet = allCabinets[cabinetIndex];
        updatedCabinet.boundaries = findNearestCabinets(updatedCabinet, allCabinets, config.axis, config.maxSize);
        updateDimensionsInputPosition(updatedCabinet, allCabinets);
        requestRender();
    });

    // Изменение ШИРИНЫ
    widthInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.stopPropagation();
        const newWidthM = parseFloat(widthInput.value) / 1000;

        if (direction === 'left') {
            const rightPartSizeM = (cabinet.facadeWidth || 0.45) + (DELTA_MM / 1000);
            if (isNaN(newWidthM) || newWidthM < rightPartSizeM) {
                alert(`Минимальная ширина: ${Math.round(rightPartSizeM * 1000)} мм`);
                updateDimensionsInputPosition(cabinet, allCabinets); // Обновляем UI старыми значениями
                return;
            }
            
            const leftPartSizeM = newWidthM - rightPartSizeM;
            const newOffsetM = pivotPositionM - leftPartSizeM;
            if (newOffsetM < 0) {
                alert(`Невозможно установить такую ширину. Максимальная ширина: ${Math.round((pivotPositionM + rightPartSizeM) * 1000)} мм`);
                updateDimensionsInputPosition(cabinet, allCabinets);
                return;
            }

            objectManager.createAndExecuteUpdateCommand(cabinet, (cab) => {
                cab.width = newWidthM;
                cab.offsetAlongWall = newOffsetM;
            }, 'Изменение ширины (угл. левый)');

        } else { // direction === 'right'
            const leftPartSizeM = (cabinet.facadeWidth || 0.45) + (DELTA_MM / 1000);
            if (isNaN(newWidthM) || newWidthM < leftPartSizeM) { /* ... alert ... */ return; }

            const rightPartSizeM = newWidthM - leftPartSizeM;
            const newOffsetM = wallLength - newWidthM - (pivotPositionM - rightPartSizeM);
            // Эта формула сложная, давайте проще:
            const newOffsetFromRight = pivotPositionM - rightPartSizeM;
            if (newOffsetFromRight < 0) {
                alert(`Невозможно установить такую ширину. Максимальная ширина: ${Math.round((pivotPositionM + leftPartSizeM) * 1000)} мм`);
                updateDimensionsInputPosition(cabinet, allCabinets);
                return;
            }
            
            objectManager.createAndExecuteUpdateCommand(cabinet, (cab) => {
                cab.width = newWidthM;
                // `offsetAlongWall` изменится автоматически, если `width` изменился
                cab.offsetAlongWall = wallLength - newWidthM - newOffsetFromRight;
            }, 'Изменение ширины (угл. правый)');
            // Обновляем UI после команды
        }
        
        // Обновляем UI
        const updatedCabinet = allCabinets[cabinetIndex];
        updatedCabinet.boundaries = findNearestCabinets(updatedCabinet, allCabinets, config.axis, config.maxSize);
        updateDimensionsInputPosition(updatedCabinet, allCabinets);
        requestRender();
    });

    // Изменение ОТСТУПА (Левого или Правого)
    const activeOffsetInput = (direction === 'left') ? toLeftInput : toRightInput;
    if (activeOffsetInput) {
        activeOffsetInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.stopPropagation();
            const newOffsetValueM = parseFloat(activeOffsetInput.value) / 1000;

            if (direction === 'left') {
                if (isNaN(newOffsetValueM) || newOffsetValueM < 0 || newOffsetValueM > pivotPositionM) { /* ... alert ... */ return; }
                
                const leftPartSizeM = pivotPositionM - newOffsetValueM;
                const rightPartSizeM = (cabinet.facadeWidth || 0.45) + (DELTA_MM / 1000);
                const newWidthM = leftPartSizeM + rightPartSizeM;

                if (widthInput) { // Используем `widthInput`, так как мы его переиспользовали
                    widthInput.value = Math.round(newWidthM * 1000);
                }

                objectManager.createAndExecuteUpdateCommand(cabinet, (cab) => {
                    cab.offsetAlongWall = newOffsetValueM;
                    cab.width = newWidthM;
                }, 'Изменение отступа (угл. левый)');

            } else { // direction === 'right'
                const pivotPositionFromRight = wallLength - pivotPositionM;
                if (isNaN(newOffsetValueM) || newOffsetValueM < 0 || newOffsetValueM > pivotPositionM) { /* ... alert ... */ return; }

                const rightPartSizeM = pivotPositionM - newOffsetValueM;
                const leftPartSizeM = (cabinet.facadeWidth || 0.45) + (DELTA_MM / 1000);
                const newWidthM = leftPartSizeM + rightPartSizeM;
                const newOffsetM = pivotPositionFromRight - leftPartSizeM;

                if (widthInput) { // Используем `widthInput`, так как мы его переиспользовали
                    widthInput.value = Math.round(newWidthM * 1000);
                }

                objectManager.createAndExecuteUpdateCommand(cabinet, (cab) => {
                    cab.offsetAlongWall = newOffsetM;
                    cab.width = newWidthM;
                }, 'Изменение отступа (угл. правый)');
            }
            
            const updatedCabinet = allCabinets[cabinetIndex];
            updatedCabinet.boundaries = findNearestCabinets(updatedCabinet, allCabinets, config.axis, config.maxSize);
            updateDimensionsInputPosition(updatedCabinet, allCabinets);
            requestRender();
        });
    }

    
    // --- 5. Первоначальный вызов для позиционирования ---
    updateDimensionsInputPosition(cabinet, allCabinets);
}

/**
 * Отображает интерактивные размеры для ВЕРХНЕГО углового шкафа.
 * @param {object} cabinet - Объект верхнего углового шкафа.
 */
function showUpperCornerCabinetDimensions(cabinet) {
    hideAllDimensionInputs();
    
    const parentDiv = renderer.domElement.parentNode;
    const allCabinets = objectManager.getAllCabinets();
    const cabinetIndex = allCabinets.indexOf(cabinet);
    const direction = cabinet.cornerDirection || 'left';
    
    // --- 1. Расчет "пояса" (pivot) ---
    // Используем универсальную функцию, которая сама определит тип шкафа
    const neighbor = findNearestNeighbor(cabinet);
    const pivotPositionM = calculateCornerPivotPosition(cabinet, neighbor, MaterialManager);

    // --- 2. Создаем поля ввода (копируем логику из showCornerCabinetDimensions) ---
    widthInput = document.createElement('input'); 
    widthInput.type = 'text';
    widthInput.className = 'dimension-input';
    widthInput.value = Math.round(cabinet.width * 1000);
    parentDiv.appendChild(widthInput);
    attachExpressionValidator(widthInput);
    
    depthInput = document.createElement('input');
    depthInput.type = 'text';
    depthInput.className = 'dimension-input';
    depthInput.value = Math.round(cabinet.depth * 1000);
    parentDiv.appendChild(depthInput);
    attachExpressionValidator(depthInput);
    
    heightInput = document.createElement('input');
    heightInput.type = 'text';
    heightInput.className = 'dimension-input';
    heightInput.value = Math.round(cabinet.height * 1000);
    parentDiv.appendChild(heightInput);

    cornerFacadeWidthInput = document.createElement('input');
    cornerFacadeWidthInput.type = 'text';
    cornerFacadeWidthInput.className = 'dimension-input';
    cornerFacadeWidthInput.value = Math.round((cabinet.facadeWidth || 0.45) * 1000);
    parentDiv.appendChild(cornerFacadeWidthInput);
    attachExpressionValidator(cornerFacadeWidthInput);

    // --- НОВОЕ ПОЛЕ: Отступ от пола для верхнего шкафа ---
    offsetBottomInput = document.createElement('input');
    offsetBottomInput.type = 'text';
    offsetBottomInput.className = 'dimension-input';
    offsetBottomInput.value = Math.round(cabinet.offsetBottom * 1000);
    parentDiv.appendChild(offsetBottomInput);

    if (cabinet.isHeightIndependent) {
        // Если высота свободная, делаем поля редактируемыми
        heightInput.readOnly = false;
        offsetBottomInput.readOnly = false;
        attachExpressionValidator(heightInput);
        attachExpressionValidator(offsetBottomInput);
    } else {
        // Иначе - только для чтения
        heightInput.readOnly = true;
        heightInput.classList.add('readonly');
        offsetBottomInput.readOnly = true;
        offsetBottomInput.classList.add('readonly');
    }
   
    const config = getWallConfig(cabinet.wallId, cabinet);
    if (config) {
        cabinet.boundaries = findNearestCabinets(cabinet, allCabinets, config.axis, config.maxSize);
        distanceLine = createLine(config.lineStart(cabinet), config.lineEnd(cabinet));
        scene.add(distanceLine);

        toLeftInput = createDimensionInput(cabinet, config, true);
        toRightInput = createDimensionInput(cabinet, config, false);

        if (direction === 'left') {
            toRightInput.readOnly = true;
            toRightInput.classList.add('readonly');
        } else {
            toLeftInput.readOnly = true;
            toLeftInput.classList.add('readonly');
        }
    }

    cornerTotalWidthDisplay = document.createElement('input');
    cornerTotalWidthDisplay.type = 'text';
    cornerTotalWidthDisplay.className = 'dimension-input readonly';
    cornerTotalWidthDisplay.readOnly = true;
    parentDiv.appendChild(cornerTotalWidthDisplay);
    
    // --- 3. Обработчики событий (адаптируем логику) ---

    const onEnterPress = (e) => {
        if (e.key !== 'Enter') return;
        e.stopPropagation();

        const activeInput = e.target;
        const cabinetToChange = objectManager.getAllCabinets()[cabinetIndex];
        if (!cabinetToChange) return;
        
        // --- НОВЫЙ БЛОК ВАЛИДАЦИИ ---
        if (activeInput === cornerFacadeWidthInput) {
            const newFacadeWidthM = parseFloat(activeInput.value) / 1000;
            if (isNaN(newFacadeWidthM) || newFacadeWidthM < 0.200) {
                alert('Минимальная ширина фасада: 200 мм');
                activeInput.value = Math.round((cabinetToChange.facadeWidth || 0.45) * 1000);
                return; // Прерываем выполнение
            }
        } else if (activeInput === toLeftInput) {
            const newOffsetM = parseFloat(activeInput.value) / 1000;
            if (isNaN(newOffsetM) || newOffsetM < 0 || newOffsetM > pivotPositionM - 0.1) {
                alert(`Отступ от угла не может быть больше ${Math.round((pivotPositionM - 0.1) * 1000)} мм`);
                activeInput.value = Math.round(cabinetToChange.offsetAlongWall * 1000);
                return; // Прерываем выполнение
            }
        } else if (activeInput === toRightInput) {
            const newOffsetFromRightM = parseFloat(activeInput.value) / 1000;
            if (isNaN(newOffsetFromRightM) || newOffsetFromRightM < 0 || newOffsetFromRightM > pivotPositionM - 0.1) {
                alert(`Отступ от угла не может быть больше ${Math.round((pivotPositionM - 0.1) * 1000)} мм`);
                const wallLength = (cabinetToChange.wallId === 'Back' || cabinetToChange.wallId === 'Front') ? roomDimensions.getLength() : roomDimensions.getHeight();
                activeInput.value = Math.round((wallLength - cabinetToChange.offsetAlongWall - cabinetToChange.width) * 1000);
                return; // Прерываем выполнение
            }
        }
        // --- КОНЕЦ БЛОКА ВАЛИДАЦИИ ---
        // --- ПЕРЕСЧЕТ ЗНАЧЕНИЙ (новая, полная версия) ---
        let newValues = {};
        const DELTA_M = cabinetToChange.cornerElementWidth || 0.018;

        if (activeInput === widthInput) {
            // --- НОВАЯ ЛОГИКА ДЛЯ ИЗМЕНЕНИЯ ОБЩЕЙ ШИРИНЫ ---
            const newWidthM = parseFloat(activeInput.value) / 1000;

            if (direction === 'left') {
                const rightPartSizeM = (cabinetToChange.facadeWidth || 0.45) + DELTA_M;
                if (isNaN(newWidthM) || newWidthM < rightPartSizeM + 0.1) {
                    alert(`Минимальная ширина: ${Math.round(rightPartSizeM * 1000 + 100)} мм`);
                    updateDimensionsInputPosition(cabinetToChange, allCabinets);
                    return;
                }
                const leftPartSizeM = newWidthM - rightPartSizeM;
                const newOffsetM = pivotPositionM - leftPartSizeM;
                if (newOffsetM < 0) {
                    alert(`Невозможно установить такую ширину. Максимальная ширина: ${Math.round((pivotPositionM + rightPartSizeM) * 1000)} мм`);
                    updateDimensionsInputPosition(cabinetToChange, allCabinets);
                    return;
                }
                newValues.width = newWidthM;
                newValues.offsetAlongWall = newOffsetM;
            } else { // direction === 'right'
                const leftPartSizeM = (cabinetToChange.facadeWidth || 0.45) + DELTA_M;
                if (isNaN(newWidthM) || newWidthM < leftPartSizeM + 0.1) {
                    alert(`Минимальная ширина: ${Math.round(leftPartSizeM * 1000 + 100)} мм`);
                    updateDimensionsInputPosition(cabinetToChange, allCabinets);
                    return;
                }
                const rightPartSizeM = newWidthM - leftPartSizeM;
                const newOffsetFromRight = pivotPositionM - rightPartSizeM;
                if (newOffsetFromRight < 0) {
                    alert(`Невозможно установить такую ширину. Максимальная ширина: ${Math.round((pivotPositionM + leftPartSizeM) * 1000)} мм`);
                    updateDimensionsInputPosition(cabinetToChange, allCabinets);
                    return;
                }
                const wallLength = (cabinetToChange.wallId === 'Back' || cabinetToChange.wallId === 'Front') ? roomDimensions.getLength() : roomDimensions.getHeight();
                newValues.width = newWidthM;
                newValues.offsetAlongWall = wallLength - newWidthM - newOffsetFromRight;
            }
        } else if (activeInput === cornerFacadeWidthInput || activeInput === toLeftInput || activeInput === toRightInput) {
            // --- Старая логика для других полей ---
            const newFacadeWidthM = parseFloat(cornerFacadeWidthInput.value) / 1000;

            if (direction === 'left') {
                const newOffsetM = parseFloat(toLeftInput.value) / 1000;
                newValues.width = (pivotPositionM - newOffsetM) + (newFacadeWidthM + DELTA_M);
                newValues.offsetAlongWall = newOffsetM;
            } else { // right
                const wallLength = (cabinetToChange.wallId === 'Back' || cabinetToChange.wallId === 'Front') ? roomDimensions.getLength() : roomDimensions.getHeight();
                const newOffsetFromRightM = parseFloat(toRightInput.value) / 1000;
                newValues.width = (pivotPositionM - newOffsetFromRightM) + (newFacadeWidthM + DELTA_M);
                newValues.offsetAlongWall = wallLength - newValues.width - newOffsetFromRightM;
            }
        }
        
        // Добавляем остальные значения в объект
        newValues.facadeWidth = parseFloat(cornerFacadeWidthInput.value) / 1000;
        newValues.height = parseFloat(heightInput.value) / 1000;
        newValues.depth = parseFloat(depthInput.value) / 1000;
        newValues.offsetBottom = parseFloat(offsetBottomInput.value) / 1000;

        // Выполняем команду
        objectManager.createAndExecuteUpdateCommand(cabinetToChange, (cab) => {
            for (const key in newValues) {
                if (newValues[key] !== undefined && !isNaN(newValues[key])) {
                    cab[key] = newValues[key];
                }
            }
        }, 'Изменение размеров верхнего углового шкафа');

        // Обновляем UI
        const updatedCabinet = allCabinets[cabinetIndex];
        if (config) {
            updatedCabinet.boundaries = findNearestCabinets(updatedCabinet, allCabinets, config.axis, config.maxSize);
        }
        updateDimensionsInputPosition(updatedCabinet, allCabinets);
        requestRender();
    };

    // Вешаем слушатели на РЕДАКТИРУЕМЫЕ поля
    [cornerFacadeWidthInput, toLeftInput, toRightInput, widthInput, depthInput, heightInput, offsetBottomInput].forEach(input => {
        if (input && !input.readOnly) {
            input.addEventListener('keydown', onEnterPress);
        }
    });

    updateDimensionsInputPosition(cabinet, allCabinets);
}


/**
 * Обновляет позицию HTML-полей и геометрию 3D-линий для УГЛОВОГО шкафа.
 * Вызывается в цикле рендера.
 * @param {object} cabinet - Объект углового шкафа.
 */
function updateCornerCabinetDimensionsPosition(cabinet) {
    if (!cabinet || !cabinet.mesh) return;

    const meshToPosition = cabinet.mesh;
    const cabinetData = cabinet;
    const canvasRect = renderer.domElement.getBoundingClientRect();
    
    // Вспомогательная функция для проецирования точки на экран
    const toScreen = (point) => {
        const screenPos = point.project(activeCamera);
        return {
            x: (screenPos.x + 1) * canvasRect.width / 2,
            y: (-screenPos.y + 1) * canvasRect.height / 2
        };
    };
    
    // Вспомогательная функция для позиционирования поля ввода
    const positionInput = (input, point) => {
        if (!input) return;
        const pos = toScreen(point);
        input.style.left = `${pos.x - input.offsetWidth / 2}px`;
        input.style.top = `${pos.y - input.offsetHeight / 2}px`;
    };

    // --- Позиционирование полей на самом шкафе ---
    
    // Поле ШИРИНЫ
    if (cornerWidthInput) {
        const widthCenter = new THREE.Vector3(0, cabinetData.height / 2, cabinetData.depth / 2)
            .applyMatrix4(meshToPosition.matrixWorld);
        positionInput(cornerWidthInput, widthCenter);
    }
    
    // Поле ГЛУБИНЫ
    if (cornerDepthInput) {
        const depthCenter = new THREE.Vector3(cabinetData.width / 2, cabinetData.height / 2, 0)
            .applyMatrix4(meshToPosition.matrixWorld);
        positionInput(cornerDepthInput, depthCenter);
    }
    
    // Поле ВЫСОТЫ
    if (cornerHeightInput) {
        const heightCenter = new THREE.Vector3(cabinetData.width / 2, 0, cabinetData.depth / 2)
            .applyMatrix4(meshToPosition.matrixWorld);
        positionInput(cornerHeightInput, heightCenter);
    }

    // --- Позиционирование полей ОТСТУПОВ и обновление линий ---
    
    const config = getWallConfig(cabinetData.wallId, cabinetData);
    if (config) {
        // Обновляем геометрию линий
        if (cornerLineLeft) {
            const lineStart = config.lineStart(cabinetData);
            const lineEnd = config.leftPoint(cabinetData).lerp(lineStart, 1); // Используем только левую точку
            lineEnd.y = lineStart.y; // Выравниваем по высоте
            cornerLineLeft.geometry.setFromPoints([lineStart, lineEnd]);
        }
        if (cornerLineRight) {
            const lineStart = config.lineEnd(cabinetData);
            const lineEnd = config.rightPoint(cabinetData).lerp(lineStart, 1);
            lineEnd.y = lineStart.y;
            cornerLineRight.geometry.setFromPoints([lineStart, lineEnd]);
        }

        // Позиционирование полей отступов
        if (cornerOffsetLeftInput) {
            const leftPoint = config.leftPoint(cabinetData);
            leftPoint.applyMatrix4(cube.matrixWorld); // Используем cube.matrixWorld для стенных линий
            positionInput(cornerOffsetLeftInput, leftPoint);
        }
        if (cornerOffsetRightDisplay) {
            const rightPoint = config.rightPoint(cabinetData);
            rightPoint.applyMatrix4(cube.matrixWorld);
            positionInput(cornerOffsetRightDisplay, rightPoint);
        }
    }
    
    // --- Обновление ЗНАЧЕНИЙ в полях (кроме активного) ---
    if (cornerWidthInput && document.activeElement !== cornerWidthInput) {
        cornerWidthInput.value = Math.round(cabinetData.width * 1000);
    }
    if (cornerDepthInput && document.activeElement !== cornerDepthInput) {
        cornerDepthInput.value = Math.round(cabinetData.depth * 1000);
    }
    if (cornerHeightInput) { // Высота всегда readonly
        cornerHeightInput.value = Math.round(cabinetData.height * 1000);
    }
    if (cornerOffsetLeftInput && document.activeElement !== cornerOffsetLeftInput) {
        cornerOffsetLeftInput.value = Math.round(cabinetData.offsetAlongWall * 1000);
    }
    if (cornerOffsetRightDisplay) { // Отступ справа всегда readonly
        let wallLength;
        if (cabinetData.wallId === 'Back' || cabinetData.wallId === 'Front') {
            wallLength = roomDimensions.getLength();
        } else {
            wallLength = roomDimensions.getHeight();
        }
        const offsetRightValue = wallLength - cabinetData.offsetAlongWall - cabinetData.width;
        cornerOffsetRightDisplay.value = Math.round(offsetRightValue * 1000);
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
    // ==> блок для простых объектов <==
    if (widthInputSimple) widthInputSimple.remove(); widthInputSimple = null;
    if (heightInputSimple) heightInputSimple.remove(); heightInputSimple = null;
    if (offsetLeftInput) offsetLeftInput.remove(); offsetLeftInput = null;
    if (offsetRightInput) offsetRightInput.remove(); offsetRightInput = null;
    if (offsetBottomInput) offsetBottomInput.remove(); offsetBottomInput = null;

    if (lengthDisplayFree) lengthDisplayFree.remove(); lengthDisplayFree = null;
    if (cornerFacadeWidthInput) cornerFacadeWidthInput.remove(); cornerFacadeWidthInput = null;
    if (cornerTotalWidthDisplay) cornerTotalWidthDisplay.remove(); cornerTotalWidthDisplay = null;

    if (lineLeft) { scene.remove(lineLeft); lineLeft.geometry.dispose(); lineLeft = null; }
    if (lineRight) { scene.remove(lineRight); lineRight.geometry.dispose(); lineRight = null; }
    if (lineBottom) { scene.remove(lineBottom); lineBottom.geometry.dispose(); lineBottom = null; }
    if (depthInputSimple) depthInputSimple.remove(); depthInputSimple = null;
    
    if (cornerWidthInput) cornerWidthInput.remove(); cornerWidthInput = null;
    if (cornerDepthInput) cornerDepthInput.remove(); cornerDepthInput = null;
    if (cornerHeightInput) cornerHeightInput.remove(); cornerHeightInput = null;
    if (cornerOffsetLeftInput) cornerOffsetLeftInput.remove(); cornerOffsetLeftInput = null;
    if (cornerOffsetRightDisplay) cornerOffsetRightDisplay.remove(); cornerOffsetRightDisplay = null;
    
    if (cornerLineLeft) { scene.remove(cornerLineLeft); cornerLineLeft.geometry.dispose(); cornerLineLeft = null; }
    if (cornerLineRight) { scene.remove(cornerLineRight); cornerLineRight.geometry.dispose(); cornerLineRight = null; }

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
        // Кэшируем найденные границы в userData
        if (!countertop.userData) countertop.userData = {};
        countertop.userData.cachedBoundaries = { leftBoundary, rightBoundary };

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
        if (boundariesValid) {
            // Кэшируем найденные границы в userData
            if (!countertop.userData) countertop.userData = {};
            countertop.userData.cachedBoundaries = { leftBoundary, rightBoundary };
    
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
        }
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

            showCountertopDimensionsInput(selectedCabinet, countertops, objectManager.getAllCabinets());
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
            if (event.key !== 'Enter') return;
            event.stopPropagation();
            
            const newDistanceM = parseFloat(toLeftInput.value) / 1000;
            const { leftBoundary: currentLB } = countertop.userData.cachedBoundaries;

            if (isNaN(newDistanceM)) { /* ... код восстановления значения ... */ return; }

            // --- РАСЧЕТ НОВОГО СОСТОЯНИЯ ---
            const oldState = { ...countertop.userData };
            
            const oldLeftEdge = axisIsX ? countertop.position.x - oldState.length / 2 : countertop.position.z - oldState.length / 2;
            const newLeftEdge = currentLB + newDistanceM;
            const newLength = oldState.length + (oldLeftEdge - newLeftEdge);

            if (newLength < 0.1) { /* ... alert ... */ return; }
            
            const shift = (oldLeftEdge - newLeftEdge) / 2;
            const newPosition = countertop.position.clone();
            if (axisIsX) { newPosition.x -= shift; } else { newPosition.z -= shift; }
            
            const wallStartX = axisIsX ? -roomWidth / 2 : -roomDepth / 2;
            const newOffsetAlongWall = newLeftEdge - wallStartX;

            const newState = {
                ...oldState,
                length: newLength,
                offsetAlongWall: Math.max(0, newOffsetAlongWall)
            };

            // --- ВЫПОЛНЕНИЕ КОМАНДЫ ---
            // Команда сама обновит и userData, и позицию, и 3D
            const command = new UpdateCountertopCommandWithPos(countertop, newState, oldState, newPosition);
            historyManager.execute(command);
            
            // Обновляем отображение полей после выполнения
            showCountertopDimensionsInput(selectedCabinet, countertops, objectManager.getAllCabinets());
            requestRender();
        });

        // Поле справа
        toRightInput = document.createElement('input');
        toRightInput.type = 'text';
        toRightInput.value = Math.round(rightDistanceMm);
        toRightInput.className = 'dimension-input dimension-input-right';
        parentDiv.appendChild(toRightInput);
        attachExpressionValidator(toRightInput);
        toRightInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.stopPropagation();
            
            const newDistanceM = parseFloat(toRightInput.value) / 1000;
            const { rightBoundary: currentRB } = countertop.userData.cachedBoundaries;

            if (isNaN(newDistanceM)) { /* ... */ return; }

            const oldState = { ...countertop.userData };
            
            const oldRightEdge = axisIsX ? countertop.position.x + oldState.length / 2 : countertop.position.z + oldState.length / 2;
            const newRightEdge = currentRB - newDistanceM;
            const newLength = oldState.length + (newRightEdge - oldRightEdge);
            
            if (newLength < 0.1) { /* ... */ return; }
            
            const shift = (newRightEdge - oldRightEdge) / 2;
            const newPosition = countertop.position.clone();
            if (axisIsX) { newPosition.x += shift; } else { newPosition.z += shift; }

            const newState = { ...oldState, length: newLength };
            
            const command = new UpdateCountertopCommandWithPos(countertop, newState, oldState, newPosition);
            historyManager.execute(command);
            
            showCountertopDimensionsInput(selectedCabinet, countertops, objectManager.getAllCabinets());
            requestRender();
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
    updateWallCountertopDimensionsPosition(countertop); // Вызываем позиционер для стенных
}

/**
 * Показывает размеры для техники на столешнице.
 * @param {THREE.Mesh} appliance - Объект техники.
 */
function showApplianceDimensions(appliance) {
    hideAllDimensionInputs();
    const parentCountertop = appliance.parent;
    if (!parentCountertop || parentCountertop.userData.type !== 'countertop') return;

    const ctLength = parentCountertop.userData.length;
    
    // Локальная позиция X техники (относительно центра столешницы)
    const localX = appliance.position.x;
    
    // Расстояние до левого края (локальный край = -length/2)
    const distLeftM = localX - (-ctLength / 2);
    
    // Расстояние до правого края (локальный край = length/2)
    const distRightM = (ctLength / 2) - localX;

    // Создаем поле слева
    toLeftInput = document.createElement('input');
    toLeftInput.id = 'toLeftInput';
    toLeftInput.type = 'text';
    toLeftInput.className = 'dimension-input';
    toLeftInput.value = Math.round(distLeftM * 1000);
    renderer.domElement.parentNode.appendChild(toLeftInput);
    attachExpressionValidator(toLeftInput);

    // Создаем поле справа
    toRightInput = document.createElement('input');
    toRightInput.id = 'toRightInput';
    toRightInput.type = 'text';
    toRightInput.className = 'dimension-input';
    toRightInput.value = Math.round(distRightM * 1000);
    renderer.domElement.parentNode.appendChild(toRightInput);
    attachExpressionValidator(toRightInput);

    const onEnterPress = (e) => {
        if (e.key !== 'Enter') return;
        e.stopPropagation();
        
        const newValMm = parseFloat(e.target.value);
        if (isNaN(newValMm)) return;
        const newValM = newValMm / 1000;

        let newLocalX;
        if (e.target === toLeftInput) {
            newLocalX = (-ctLength / 2) + newValM;
        } else {
            newLocalX = (ctLength / 2) - newValM;
        }

        newLocalX = Math.max(-ctLength/2, Math.min(ctLength/2, newLocalX));

        // --- СОЗДАЕМ ДАННЫЕ ДЛЯ КОМАНДЫ ---
        const oldPos = appliance.position.clone();
        const newPos = oldPos.clone();
        newPos.x = newLocalX; // Меняем только X

        const oldDist = appliance.userData.distFromLeft;
        const newDist = newLocalX - (-ctLength / 2);

        // --- ВЫПОЛНЯЕМ КОМАНДУ ---
        // Вместо прямого изменения appliance.position.x = ...
        const command = new UpdateAppliancePosCommand(appliance, newPos, oldPos, newDist, oldDist);
        historyManager.execute(command);

        // Обновление UI произойдет внутри команды
    };

    toLeftInput.addEventListener('keydown', onEnterPress);
    toRightInput.addEventListener('keydown', onEnterPress);

    updateDimensionsInputPosition(appliance);
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
                     MaterialManager.updateCountertopTexture(countertop);
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
                         MaterialManager.updateCountertopTexture(countertop);
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
                          MaterialManager.updateCountertopTexture(countertop);
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

    const { leftBoundary: currentLB, rightBoundary: currentRB } = countertop.userData.cachedBoundaries;

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
                else if (wallId === 'Right') { leftTopFront = new THREE.Vector3(-length/2 - (-(currentLB) + countertop.position.z - length/2)/2, thickness/2, depth/2); }

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
                  else if (wallId === 'Right') { rightTopFront = new THREE.Vector3(length/2 + (currentRB - countertop.position.z - length/2)/2, thickness/2, depth/2); }

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

// --- Константы для подсветки ---
const HIGHLIGHT_EMISSIVE_COLOR = 0x00FFFF; // Цвет свечения
const HIGHLIGHT_EMISSIVE_INTENSITY = 0.8;  // Интенсивность

/** Применяет emissive подсветку к мешу или всей группе */
function applyHighlight(object) {
    if (!object || object.userData?.isHighlighted) return;

    // Вспомогательная функция для подсветки одного меша
    const highlightMesh = (mesh) => {
        if (!mesh.isMesh || !mesh.material) return;
        
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        
        materials.forEach(mat => {
            if (!mat || !mat.emissive) return;

            mat.userData = mat.userData || {};
            
            // Сохраняем оригинал только если еще не сохранили
            if (mat.userData.originalEmissive === undefined) {
                mat.userData.originalEmissive = mat.emissive.getHex();
                mat.userData.originalIntensity = mat.emissiveIntensity ?? 0.0;
            }

            mat.emissive.setHex(HIGHLIGHT_EMISSIVE_COLOR);
            mat.emissiveIntensity = HIGHLIGHT_EMISSIVE_INTENSITY;
            mat.needsUpdate = true;
        });
    };

    if (object.isGroup) {
        // --- Для ЛЮБОЙ группы (шкаф, техника и т.д.) ---
        console.log('Highlighting group:', object.uuid);
        object.traverse((child) => {
            // Подсвечиваем либо части шкафа, либо ВСЕ меши в обычной группе (техника)
            if (child.isMesh) {
                // Если это шкаф - проверяем флаг isCabinetPart. Если техника - подсвечиваем всё.
                const shouldHighlight = object.userData.isDetailedCabinet ? child.userData.isCabinetPart : true;
                
                if (shouldHighlight) {
                    highlightMesh(child);
                }
            }
        });
    } else if (object.isMesh) {
        // --- Для одиночного меша ---
        highlightMesh(object);
    } else {
        console.warn("Attempted to highlight an unsupported object type:", object);
        return;
    }

    object.userData.isHighlighted = true; // Ставим флаг на сам объект
}

/** Снимает emissive подсветку */
function removeHighlight(object) {
    if (!object || !object.userData?.isHighlighted) return;

    // Вспомогательная функция для снятия с одного меша
    const unhighlightMesh = (mesh) => {
        if (!mesh.isMesh || !mesh.material) return;
        
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        
        materials.forEach(mat => {
            if (!mat || !mat.emissive || !mat.userData) return;
            
            if (mat.userData.originalEmissive !== undefined) {
                mat.emissive.setHex(mat.userData.originalEmissive);
                mat.emissiveIntensity = mat.userData.originalIntensity;
                mat.needsUpdate = true;

                delete mat.userData.originalEmissive;
                delete mat.userData.originalIntensity;
            }
        });
    };

    if (object.isGroup) {
        console.log('Removing highlight from group:', object.uuid);
        object.traverse((child) => {
            if (child.isMesh) {
                const shouldUnhighlight = object.userData.isDetailedCabinet ? child.userData.isCabinetPart : true;
                if (shouldUnhighlight) {
                    unhighlightMesh(child);
                }
            }
        });
    } else if (object.isMesh) {
        unhighlightMesh(object);
    }

    object.userData.isHighlighted = false;
}


renderer.domElement.addEventListener('click', (event) => {
    // --- Блок 1: Предварительные проверки и настройка Raycaster ---
    if (justDragged || InputManager.isRotating() || !cube) {
        return;
    }

    const rect = renderer.domElement.getBoundingClientRect();
    const ndcMouseForPicking = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    mouse.x = ndcMouseForPicking.x;
    mouse.y = ndcMouseForPicking.y;
    raycaster.setFromCamera(ndcMouseForPicking, activeCamera);

    // --- Блок 2: Основная логика ---
    const previouslySelectedData = [...selectedCabinets];
    let newHint = "Выделите объект или стену"; // Подсказка по умолчанию

    // Сбрасываем все меню и поля размеров ПЕРЕД тем, как решать, что показать
    hideWindowMenu();
    hideSocketMenu();
    hideCabinetMenu();
    hideCountertopMenu();
    hideCabinetConfigMenu();
    hideAllDimensionInputs();

    const appliances = [];
    countertops.forEach(ct => {
        if (ct.children) {
            ct.children.forEach(child => {
                if (child.userData && (child.userData.type === 'hob' || child.userData.type === 'sink_model')) {
                    appliances.push(child);
                }
            });
        }
    });
    
    const intersectableObjects = [
        ...objectManager.getAllCabinets().map(c => c.mesh),
        ...windows.map(w => w.mesh),
        ...countertops,
        ...appliances,
        ...window.plinths.map(p => p.mesh)
    ];
    if (floorObject) {
        intersectableObjects.push(floorObject);
    }

    const objectIntersects = raycaster.intersectObjects(intersectableObjects, true);

    // --- СЦЕНАРИЙ 1: Клик по ОБЪЕКТУ ---
    if (objectIntersects.length > 0) {
        const hitObject = objectIntersects[0].object;
        resetRoomSelectedFace(); // Клик по объекту всегда снимает выделение со стены

        if (floorObject && hitObject === floorObject) {
            // --- Подсценарий 1.1: Клик по ПОЛУ ---
            const alreadySelected = selectedCabinets.length === 1 && selectedCabinets[0] === floorObject;
            if (alreadySelected) {
                selectedCabinets = [];
            } else {
                selectedCabinets = [floorObject];
                newHint = "Выделено: Напольное покрытие";
            }
        } else {
            // --- Подсценарий 1.2: Клик по другому объекту (шкаф, окно...) ---
            let currentHitData = null;
            let finalHitObject = null;
            let searchTarget = hitObject;
            while (searchTarget && searchTarget !== scene) {
                currentHitData = objectManager.getAllCabinets().find(c => c.mesh === searchTarget);
                if (currentHitData) { finalHitObject = searchTarget; break; }
                searchTarget = searchTarget.parent;
            }
            if (!currentHitData) {
                // --- НОВАЯ ПРОВЕРКА ДЛЯ ТЕХНИКИ ---
                // Проверяем, является ли объект техникой или ее частью (т.к. модель сложная)
                let applianceTarget = hitObject;
                while (applianceTarget && applianceTarget !== scene) {
                     if (applianceTarget.userData && (applianceTarget.userData.type === 'hob' || applianceTarget.userData.type === 'sink_model')) {
                         currentHitData = applianceTarget; // Нашли технику!
                         finalHitObject = applianceTarget;
                         break;
                     }
                     applianceTarget = applianceTarget.parent;
                }

                if (!currentHitData) {
                    currentHitData = windows.find(w => {
                        if (!w.mesh) return false;
                        
                        // 1. Прямое совпадение (для простых окон/розеток)
                        if (w.mesh === hitObject) return true;

                        // 2. Если w.mesh - это Группа (Фартук, Дверь), проверяем, 
                        // является ли hitObject её потомком.
                        // Идем вверх от hitObject, пока не найдем w.mesh или не упремся в null
                        let parent = hitObject.parent;
                        while (parent) {
                            if (parent === w.mesh) return true;
                            parent = parent.parent;
                        }
                        return false;
                    });
                    if (!currentHitData) {
                        currentHitData = window.plinths.find(p => {
                            if (!p.mesh) return false;
                            // Прямое совпадение (редко для группы)
                            if (p.mesh === hitObject) return true;
                            // Поиск родителя
                            let parent = hitObject.parent;
                            while (parent) {
                                if (parent === p.mesh) return true;
                                parent = parent.parent;
                            }
                            return false;
                        });
                    }
                    if (currentHitData) { finalHitObject = hitObject; } 
                    else {
                        currentHitData = countertops.find(c => c === hitObject);
                        if (currentHitData) { finalHitObject = hitObject; }
                    }
                }
            }
            
            if (currentHitData) {
                if (event.ctrlKey) {
                    const index = selectedCabinets.findIndex(item => (item.mesh || item).uuid === (currentHitData.mesh || currentHitData).uuid);
                    if (index === -1) { selectedCabinets.push(currentHitData); } 
                    else { selectedCabinets.splice(index, 1); }
                    newHint = `Выделено объектов: ${selectedCabinets.length}`;
                } else {
                    const alreadySelected = selectedCabinets.length === 1 && (selectedCabinets[0].mesh || selectedCabinets[0]).uuid === (currentHitData.mesh || currentHitData).uuid;
                    if (alreadySelected) {
                        selectedCabinets = [];
                    } else {
                        selectedCabinets = [currentHitData];
                        newHint = `Выделено: ${currentHitData.userData?.type || currentHitData.type || 'Объект'}`;
                        
                        // ==> ВОССТАНОВЛЕННАЯ ЛОГИКА ПОКАЗА РАЗМЕРОВ <==
                        //console.log("currentHitData.cabinetType = " + currentHitData.cabinetType);
                        if (currentHitData.cabinetType === 'corner') { // <== НОВАЯ ПРОВЕРКА
                            showCornerCabinetDimensions(currentHitData);
                        } else if (currentHitData.cabinetType === 'cornerUpper') {
                            showUpperCornerCabinetDimensions(currentHitData); // <-- НАШ ВЫЗОВ  
                        }  else if (currentHitData.userData?.type === 'hob' || currentHitData.userData?.type === 'sink_model') {
                            showApplianceDimensions(currentHitData);
                        } else if (currentHitData.userData?.type === 'countertop') {
                            showCountertopDimensionsInput(finalHitObject, countertops, objectManager.getAllCabinets());
                        } else if (['window', 'door', 'socket', 'radiator', 'column', 'apron'].includes(currentHitData.type)) {
                            showSimpleObjectDimensions(currentHitData);
                        } else if (currentHitData.type === 'plinth') {
                            // Пока ничего не показываем или показываем алерт
                            console.log("Выделен цоколь:", currentHitData);
                            // showPlinthMenu(currentHitData); // Это мы сделаем на следующем шаге
                        } else if (currentHitData.type) {
                            if (currentHitData.type === 'freestandingCabinet') {
                                showFreestandingCabinetDimensions(currentHitData, objectManager.getAllCabinets());
                            } else if (['lowerCabinet', 'upperCabinet'].includes(currentHitData.type) && currentHitData.wallId) {
                                showCabinetDimensionsInput(currentHitData, objectManager.getAllCabinets());
                            }
                        }
                    }
                }
            } else {
                selectedCabinets = [];
            }
        }
    
    // --- СЦЕНАРИЙ 2: Клик НЕ по объекту ---
    } else {
        selectedCabinets = []; // Клик мимо объектов -> всегда сбрасываем их выделение
        
        const originalSide = raycaster.params.Mesh?.side;
        if (!raycaster.params.Mesh) raycaster.params.Mesh = {};
        raycaster.params.Mesh.side = THREE.DoubleSide;
        const wallIntersects = raycaster.intersectObject(cube, false);
        if (originalSide !== undefined) { raycaster.params.Mesh.side = originalSide; } 
        else { delete raycaster.params.Mesh.side; }

        if (wallIntersects.length > 0) {
            const intersect = wallIntersects[0];
            const clickedFaceIdx = determineClickedWallFace_OldLogic(intersect, ndcMouseForPicking);
            setRoomSelectedFace(clickedFaceIdx);
            const faceId = clickedFaceIdx !== -1 ? faceNormals[clickedFaceIdx].id : 'None';
            newHint = `Выделена стена: ${faceId}`;
        } else {
            resetRoomSelectedFace();
        }
    }

    // --- УПРАВЛЕНИЕ ПАНЕЛЯМИ ИНСТРУМЕНТОВ ---
    const lowerCabContainer = document.getElementById('lowerCabinetContainer');
    const upperCabContainer = document.getElementById('upperCabinetContainer');
    const countertopToolbar = document.getElementById('countertopToolbar');
    
    // Сброс
    if (lowerCabContainer) lowerCabContainer.style.display = 'none';
    if (upperCabContainer) upperCabContainer.style.display = 'none';
    if (countertopToolbar) countertopToolbar.style.display = 'none';

    const selectedFaceIndex = getRoomSelectedFaceIndex(); // Получаем индекс грани

    if (selectedCabinets.length > 0) {
        const selectedItem = selectedCabinets[0];
        
        if (selectedItem === floorObject) {
            // Выделено НАПОЛЬНОЕ ПОКРЫТИЕ -> Только нижние
            if (lowerCabContainer) lowerCabContainer.style.display = 'block';
            
        } else if (selectedItem.userData && selectedItem.userData.type === 'countertop') {
            // Выделена СТОЛЕШНИЦА -> Панель техники
            if (countertopToolbar) countertopToolbar.style.display = 'block';
        }

    } else {
        // Объекты не выделены, проверяем стены/пол комнаты
        if (selectedFaceIndex !== -1) {
            // Индекс 2 - это Bottom (пол), 3 - Top (потолок) - проверьте ваши индексы в faceNormals!
            // Обычно: 0=Right, 1=Left, 2=Top, 3=Bottom, 4=Front, 5=Back (порядок может отличаться)
            // Вам нужно точно знать индекс вашего пола. Предположим, вы знаете, что это 'Bottom'.
            // Но getRoomSelectedFaceIndex возвращает число.
            // Давайте проверим через faceNormals, если они доступны.
            // Или просто используем newHint, если в нем написано "Выделена стена: Bottom"
            
            // Самый надежный способ, если faceNormals глобальны:
            const faceName = window.faceNormals && window.faceNormals[selectedFaceIndex] ? window.faceNormals[selectedFaceIndex].id : '';

            if (newHint.includes('Bottom')) {
                // ПОЛ
                if (lowerCabContainer) lowerCabContainer.style.display = 'block';
            } else if (newHint.includes('Top')) {
                // ПОТОЛОК - скрываем все
            } else if (newHint.includes('Выделена стена:')) {
                // СТЕНЫ (Back, Front, Left, Right)
                if (lowerCabContainer) lowerCabContainer.style.display = 'block';
                if (upperCabContainer) upperCabContainer.style.display = 'block';
            }
        }
    }

    // --- БЛОК 3: ФИНАЛЬНОЕ ОБНОВЛЕНИЕ UI ---
    selectedCabinet = (selectedCabinets.length === 1 && selectedCabinets[0]?.type) ? selectedCabinets[0] : null;

    // Обновление подсветки
    
    const allHighlightableData = [
        ...objectManager.getAllCabinets(), 
        ...windows, 
        ...countertops, 
        floorObject,
        ...appliances, // <-- ДОБАВЛЯЕМ ТЕХНИКУ В СПИСОК ПОДСВЕЧИВАЕМЫХ
        ...window.plinths
    ].filter(Boolean);

    allHighlightableData.forEach(itemData => {
        const meshOrGroup = itemData.mesh || itemData;
        const isSelected = selectedCabinets.includes(itemData);
        const wasSelected = previouslySelectedData.includes(itemData);

        if (isSelected && !wasSelected) applyHighlight(meshOrGroup);
        else if (!isSelected && wasSelected) removeHighlight(meshOrGroup);
    });
    
    objectManager.getAllCabinets().forEach(c => {
        // Проверяем пересечения для каждого шкафа
        const hasIntersection = checkCabinetIntersections(c);

        // Применяем цвет пересечения или правильный цвет корпуса ТОЛЬКО для простых кубов
        if (!c.isDetailed) {
            applyIntersectionColor(c.mesh, hasIntersection);
        }
        
        // Обновление ребер простого куба (остается без изменений)
        if (c.edges && c.edges.material) {
            c.edges.material.needsUpdate = true;
        }
    });
    windows.forEach(w => {
         // Возвращаем исходный цвет окнам/дверям и т.п.
        if (w.mesh && w.mesh.material) {
            // Эта логика может конфликтовать с подсветкой, но если она вам нужна, оставляем
            w.mesh.material.color.set(w.initialColor);
            w.mesh.material.needsUpdate = true;
        }
    });

    updateHint(newHint);
    updateCountertopButtonVisibility();

    if (typeof updateSelectedFaceDisplay === 'function') {
        updateSelectedFaceDisplay();
    }
});

// Новый обработчик для начала перетаскивания с копированием через shift

renderer.domElement.addEventListener('mousedown', (event) => {
    // --- Начальные проверки: Игнорируем, если ---
    // - Нет куба (сцены)
    // - Нажата средняя кнопка (часто используется для системного панорамирования/вращения)
    // - Уже идет перетаскивание шкафа (ЛКМ)
    // - Уже идет вращение сцены (ЛКМ)
    // - Уже идет панорамирование (ПКМ)
    if (!cube || event.button === 1 || InputManager.getDraggedCabinet() || InputManager.isRotating() || InputManager.isPanning()) {
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
        const intersectableObjects = objectManager.getAllCabinets().map(c => c.mesh).filter(m => m);
        const intersects = raycaster.intersectObjects(intersectableObjects, true);

        let cabinetHitData = null;
        let hitMeshOrGroup = null;

        if (intersects.length > 0) {
            // --- Находим главный объект шкафа ---
            let hitObject = intersects[0].object;
            let searchTarget = hitObject;
            while (searchTarget && searchTarget !== cube && searchTarget !== scene) {
                cabinetHitData = objectManager.getAllCabinets().find(c => c.mesh === searchTarget);
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

                // ==> запрет на перемещение углового шкафа <==
                if (cabinetToDrag.cabinetType === 'corner' || cabinetToDrag.cabinetType === 'cornerUpper') {
                    console.log("Перетаскивание отменено: угловые шкафы нельзя перемещать.");
                    updateHint("Угловые шкафы нельзя перемещать, только изменять размеры.");
                    
                    // "Отменяем" все, что могло начаться
                    dragStarted = false;
                    document.removeEventListener('mousemove', checkDragStartMove);
                    controls.enabled = true; // Возвращаем управление камере
                    setContinuousRendering(false); // Выключаем постоянный рендер
                    return; // Выходим, не начиная drag
                }
                // ==> КОНЕЦ НОВОЙ ПРОВЕРКИ <==

                // --- ЛОГИКА КЛОНИРОВАНИЯ ---
                if (isShiftPressed && cabinetHitData.type && cabinetHitData.type.includes('Cabinet')) {
    console.log("Shift нажат - клонируем!");
    
    // ==> ИЗМЕНЕНИЕ 1: Создаем клон, но пока не добавляем его никуда <==
    const cloned = cloneCabinet(cabinetHitData);
    
                    if (cloned) {
                        // Копируем начальное положение и вращение с оригинала
                        cloned.mesh.position.copy(cabinetHitData.mesh.position);
                        cloned.mesh.rotation.copy(cabinetHitData.mesh.rotation);
                        
                        console.log(`Клон создан. Данные isDetailed: ${cloned.isDetailed}`);
                        
                        // ==> ИЗМЕНЕНИЕ 2: Создаем КОМАНДУ для добавления этого клона <==
                        // Мы используем специальную версию AddCabinetCommand, которая будет работать с уже готовым объектом
                        const command = new AddClonedCabinetCommand(objectManager, cloned);
                        historyManager.execute(command); // Выполняем команду, она добавит клон в objectManager

                        // ==> ИЗМЕНЕНИЕ 3: Получаем индекс из objectManager <==
                        const cloneIndex = objectManager.getAllCabinets().length - 1;

                        cabinetToDrag = cloned; // Тащить будем клон

                        // Снимаем выделение
                        removeHighlight(cabinetHitData.mesh);
                        removeHighlight(cloned.mesh);
                        selectedCabinets = []; selectedCabinet = null;

                        // Детализация, если нужно
                        if (cloned.isDetailed) {
                            console.log(`Клон должен быть детализирован. Вызов toggleCabinetDetail(${cloneIndex})...`);
                            toggleCabinetDetail(cloneIndex);
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
            //previousMouseX = event.clientX;
            //previousMouseY = event.clientY;
            InputManager.setPreviousMouse(event.clientX, event.clientY);
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
        if (!InputManager.getDraggedCabinet()) {
            renderer.domElement.style.cursor = 'grabbing'; // Или 'move'

            setContinuousRendering(true); // 👀 рендерим пока панорамируем
            // --- Расчет точки панорамирования (panTarget) удаляем ---

        } else {
            console.log(" - Mousedown ПКМ проигнорирован (идет перетаскивание шкафа).");
        }
   }
});


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


document.addEventListener('keydown', (event) => {
    if (!cube) return;

    //let rotateXDeg = parseFloat(rotateXSlider.value);
    //let rotateYDeg = parseFloat(rotateYSlider.value);
    const step = 15;

    switch (event.key) {
        // case 'ArrowUp':
        //     rotateXDeg = Math.min(180, rotateXDeg + step);
        //     cube.rotation.x = THREE.MathUtils.degToRad(rotateXDeg);
        //     edges.rotation.x = cube.rotation.x;
        //     //rotateXSlider.value = rotateXDeg;
        //     break;
        // case 'ArrowDown':
        //     rotateXDeg = Math.max(-180, rotateXDeg - step);
        //     cube.rotation.x = THREE.MathUtils.degToRad(rotateXDeg);
        //     edges.rotation.x = cube.rotation.x;
        //     rotateXSlider.value = rotateXDeg;
        //     break;
        // case 'ArrowLeft':
        //     rotateYDeg = Math.max(-180, rotateYDeg - step);
        //     cube.rotation.y = THREE.MathUtils.degToRad(rotateYDeg);
        //     edges.rotation.y = cube.rotation.y;
        //     rotateYSlider.value = rotateYDeg;
        //     break;
        // case 'ArrowRight':
        //     rotateYDeg = Math.min(180, rotateYDeg + step);
        //     cube.rotation.y = THREE.MathUtils.degToRad(rotateYDeg);
        //     edges.rotation.y = cube.rotation.y;
        //     rotateYSlider.value = rotateYDeg;
        //     break;
        case 'Enter':
            const windowMenu = document.getElementById('windowMenu');
            const socketMenu = document.getElementById('socketMenu');
            const cabinetMenu = document.getElementById('cabinetMenu');
            const kitchenParamsPopup = document.getElementById('kitchenParamsPopup');
            const configMenu = document.getElementById('cabinetConfigMenu');
        
            // Если открыто меню конфигурации, ничего не делаем
            if (configMenu && configMenu.style.display !== 'none') {
                if(selectedCabinet) {
                    applyConfigMenuSettings(objectManager.getAllCabinets().indexOf(selectedCabinet));
                    requestRender(); // <== Вот он
                }
            } else {
        
                if (selectedCabinets.length === 1) {
                    const selected = selectedCabinets[0];
            
                    if (windowMenu && windowMenu.style.display === 'block' && ['window', 'door', 'radiator', 'column', 'apron'].includes(selected.type)) {
                        applyObjectChanges(windows.indexOf(selected));
                    } else if (socketMenu && socketMenu.style.display === 'block' && selected.type === 'socket') {
                        applyObjectChanges(windows.indexOf(selected));
                    } else if (cabinetMenu && cabinetMenu.style.display === 'block' && ['lowerCabinet', 'upperCabinet', 'freestandingCabinet'].includes(selected.type)) {
                        applyCabinetChanges(objectManager.getAllCabinets().indexOf(selected));
                    }
                } else if (kitchenParamsPopup && kitchenParamsPopup.style.display === 'block') {
                    applyKitchenParams();
                } else {
                    applyRoomSize();
                }
                requestRender();
            }
            break;
        case 'z':
            if (event.ctrlKey) {
                undoLastAction();
            }
            break;
    }
});

let lastOffsetAlongWall = null; // Для нижних и верхних шкафов
let lastOffsetX = null; // Для свободно стоящих шкафов
let lastOffsetZ = null; // Для свободно стоящих шкафов


function renderFrame() {
  renderRequested = false;

  if (!scene || !activeCamera) return;

  // Обновляем OrbitControls, если они используются
  if (controls && controls.enabled) {
      controls.update();
  }

  // Обновляем матрицы всех объектов в сцене
  scene.updateMatrixWorld(true);
  
  // Рендерим сцену через composer или напрямую
  if (typeof composer !== 'undefined' && composer) {
    composer.render();
  } else {
    renderer.render(scene, activeCamera);
  }

  // ================================================================
  // --- НОВЫЙ, ОПТИМИЗИРОВАННЫЙ БЛОК ОБНОВЛЕНИЯ UI-ЭЛЕМЕНТОВ ---
  // ================================================================

  // 1. Проверяем, есть ли вообще выделенный объект
  const selectedObject = selectedCabinet; // Используем selectedCabinet, так как он у вас главный
  
  if (selectedObject) {
      // 2. Определяем тип выделенного объекта
      // (учитываем, что у столешниц тип в userData)
      const type = selectedObject.userData?.type || selectedObject.type;
      
      // 3. Создаем списки типов для удобства
      const cabinetTypes = ['lowerCabinet', 'upperCabinet', 'freestandingCabinet'];
      const simpleObjectTypes = ['window', 'socket', 'door', 'radiator', 'column', 'apron'];
      const countertopType = 'countertop';

      // 4. Вызываем ТОЛЬКО нужную функцию обновления в зависимости от типа
      // Мы также проверяем наличие хотя бы одного поля ввода, чтобы не делать лишних вызовов
      
    if ((cabinetTypes.includes(type) || type === countertopType) && (widthInput || countertopDepthInput)) {
        // Эта функция теперь отвечает и за шкафы, и за столешницы
        updateDimensionsInputPosition(selectedObject, objectManager.getAllCabinets());
    } else if (simpleObjectTypes.includes(type) && offsetLeftInput) {
        // А эта - только за простые объекты
        updateSimpleObjectDimensionsPosition(selectedObject);
    } else if (selectedCabinets.length > 0) {
        updateDimensionsInputPosition(selectedCabinets[0], objectManager.getAllCabinets());
    }
  }
  
  // ================================================================
  // --- КОНЕЦ НОВОГО БЛОКА ---
  // ================================================================

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

let countertopOptionsData = null; // Новая глобальная переменная для данных столешниц

async function loadCountertopOptions() {
    // Проверяем, не загружены ли уже данные
    if (countertopOptionsData) return countertopOptionsData;

    try {
        const response = await fetch('./countertopData.json'); // Убедись, что путь к файлу верный
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const loadedData = await response.json();
        
        countertopOptionsData = loadedData;
        window.countertopOptionsData = loadedData; // Делаем доступным для menus.js

        console.log("Данные для материалов столешниц успешно загружены.");
        return countertopOptionsData;
    } catch (error) {
        console.error("Ошибка загрузки данных для столешниц (countertopData.json):", error);
        alert("Не удалось загрузить данные для материалов столешниц.");
        // Устанавливаем пустые объекты при ошибке, чтобы код не падал
        countertopOptionsData = {};
        window.countertopOptionsData = {};
        return countertopOptionsData;
    }
}

let tilesOptionsData = null; // Глобальная переменная для данных плитки

async function loadTilesOptions() {
    if (tilesOptionsData) return tilesOptionsData;
    try {
        const response = await fetch('./tilesData.json'); // Проверь путь! Если лежит в корне, то './tilesData.json'
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const loadedData = await response.json();

        tilesOptionsData = loadedData;
        window.tilesOptionsData = loadedData; // Для доступа из menus.js и MaterialManager.js

        console.log("Данные для плитки успешно загружены.");
        return tilesOptionsData;
    } catch (error) {
        console.error("Ошибка загрузки данных для плитки (tilesData.json):", error);
        // Не критичная ошибка, но алерт можно показать или в консоль вывести
        tilesOptionsData = [];
        window.tilesOptionsData = [];
        return tilesOptionsData;
    }
}

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
        updateDimensionsInputPosition(selectedCabinets[0], objectManager.getAllCabinets());
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

    // ==> ДОБАВЬ ЭТОТ БЛОК <==
    const rebuildSceneButton = document.getElementById('rebuildSceneButton');
    if (rebuildSceneButton) {
        rebuildSceneButton.addEventListener('click', rebuildScene);
    }

    const detailAllBtn = document.getElementById('detailAllButton');
    if (detailAllBtn) {
        detailAllBtn.addEventListener('click', detailAllCabinets);
    }
    
    const simplifyAllBtn = document.getElementById('simplifyAllButton');
    if (simplifyAllBtn) {
        simplifyAllBtn.addEventListener('click', simplifyAllCabinets);
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

    document.getElementById('undoButton').addEventListener('click', () => {
        historyManager.undo();
        // ВАЖНО: После действия нужно обновить сцену
        // и UI, который может зависеть от количества/положения объектов
        hideAllDimensionInputs();
        updateCountertopButtonVisibility(); // Например
        requestRender(); 
    });

    document.getElementById('redoButton').addEventListener('click', () => {
        historyManager.redo();
        hideAllDimensionInputs();
        updateCountertopButtonVisibility();
        requestRender();
    });

    await loadFacadeOptions();
    await loadCountertopOptions();
    await loadWallMaterials();
    await loadFloorMaterials();
    await loadTilesOptions();
    await preloadFacadeModels();


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
  // ==> НОВОЕ: Собираем объект с зависимостями <==
    

    objectManager.init(scene, dependencies, historyManager);
    // ==> СОЗДАЕМ БОЛЬШОЙ ОБЪЕКТ ЗАВИСИМОСТЕЙ <==
        const inputManagerDependencies = {
            // Объекты Three.js
            scene: scene,
            camera: activeCamera,
            renderer: renderer,
            raycaster: raycaster,
            mouse: mouse,
            cube: cube,
            roomDimensions: window.roomDimensions,

            // Глобальные данные и функции-хелперы
            objectTypes: objectTypes,
            faceNormals: faceNormals,
            determineClickedWallFace_OldLogic: determineClickedWallFace_OldLogic,
            setRoomSelectedFace: setRoomSelectedFace,
            getSelectedFaceIndex: () => selectedFaceIndex, // Функция, чтобы получать актуальное значение
            requestRender: requestRender,

            isFloorSelected: () => {
                    return selectedCabinets.length === 1 && selectedCabinets[0] === floorObject;
            },

            
            
            // "Колбэки" - функции, которые InputManager будет вызывать, когда что-то произойдет
            callbacks: {
                onObjectCreate: (type, point, wallId) => {
                    //const wallId = faceNormals[selectedFaceIndex].id;
                    if (type === 'lowerCabinet' || type === 'lower-cabinet') {
                        if (['Back', 'Left', 'Right'].includes(wallId)) addCabinet(point);
                        else if (wallId === 'Bottom') addFreestandingCabinet(point);
                    } else if (type === 'upperCabinet' || type === 'upper-cabinet') {
                        if (['Back', 'Left', 'Right'].includes(wallId)) addUpperCabinet(point);
                    } else if (type === 'door') {
                        addDoorAtPoint(point); // Вызываем специальную функцию для двери
                    } else {
                        if (['Back', 'Left', 'Right'].includes(wallId)) addObjectAtPoint(type, point);
                    }
                },
                onApplianceCreate: (type, position, countertopMesh) => {
                    createCountertopAppliance(type, position, countertopMesh);

                },
            }
        };

    // ==> ВЫЗЫВАЕМ INIT С НОВЫМ ОБЪЕКТОМ <==
    InputManager.initInputManager(inputManagerDependencies);
}



//init();


/**
 * Создает простой объект (окно, розетка и т.д.) в указанной точке на стене.
 * @param {string} type - Тип объекта ('window', 'socket', etc.).
 * @param {THREE.Vector3} intersectPoint - Точка пересечения луча со стеной в мировых координатах.
 */
function addObjectAtPoint(type, intersectPoint) {
    if (selectedFaceIndex === -1) return;

    const wallId = faceNormals[selectedFaceIndex].id;
    const params = objectTypes[type];
    if (!params) return;

    // 1. Получаем размеры объекта и стены
    const objWidth = params.defaultWidth || 0;
    const objHeight = (type === 'column') ? currentWidth : (params.defaultHeight || 0);
    const objDepth = params.defaultDepth || 0;

    let wallLength, wallHeight; // Ширина и высота стены в метрах
    if (wallId === 'Back') { wallLength = currentLength; wallHeight = currentWidth; }
    else if (wallId === 'Left' || wallId === 'Right') { wallLength = currentHeight; wallHeight = currentWidth; }
    else return; // Не добавляем на пол/потолок

    // 2. Вычисляем начальные отступы от угла и от пола
    const localPoint = intersectPoint.clone().applyMatrix4(cube.matrixWorld.clone().invert());
    let offsetAlongWall, offsetBottom;

    if (wallId === 'Back') {
        offsetAlongWall = localPoint.x + currentLength / 2;
        offsetBottom = localPoint.y + currentWidth / 2;
    } else { // Left or Right
        offsetAlongWall = localPoint.z + currentHeight / 2;
        offsetBottom = localPoint.y + currentWidth / 2;
    }

    // Центрируем объект по курсору
    offsetAlongWall -= objWidth / 2;
    offsetBottom -= objHeight / 2;
    let obj;

    // 3. Применяем правила позиционирования для разных типов
    if (type === 'radiator') {
        offsetBottom = 150 / 1000; // 150мм от пола до низа
    } else if (type === 'column') {
        offsetBottom = 0; // Всегда от пола
    } else if (type === 'door') {
        offsetBottom = 0; // Всегда от пола
    }
    // Для фартука оставляем его дефолтные отступы, игнорируя intersectPoint
    if (type === 'apron') {
        offsetAlongWall = params.defaultoffsetAlongWall;
        offsetBottom = params.defaultOffsetBottom;
        // === ДОБАВИТЬ ЭТО ===
        obj = {
            ...obj, // существующие поля
            apronType: 'panel', // по умолчанию
            tileWidth: 200,
            tileHeight: 100,
            tileGap: 2,
            tileRowOffset: 50, // 50%
            textureOrientation: 'horizontal',
            tileLayoutDirection: 'horizontal',
            materialData: null // дефолтный
        };
    }

    // 4. Ограничиваем позицию границами стены
    offsetAlongWall = Math.max(0, offsetAlongWall);
    offsetAlongWall = Math.min(wallLength - objWidth, offsetAlongWall);
    offsetBottom = Math.max(0, offsetBottom);
    offsetBottom = Math.min(wallHeight - objHeight, offsetBottom);

    // 5. Создаем объект (меш и данные `obj`), как в твоей старой `addObject`
    // Это очень похоже на твой код, но немного упрощено.
    
    if (type === 'door') {
        // Логика для двери сложнее, пока оставим ее на кнопке с `addObject`,
        // или нужно будет переписать ее здесь. Пока делаем заглушку.
        console.error("Drag-n-drop для дверей требует отдельной реализации. Используйте кнопку.");
        return; // ВРЕМЕННО
    } else {
        const geometry = new THREE.BoxGeometry(objWidth, objHeight, objDepth);
        const material = new THREE.MeshStandardMaterial({ color: params.initialColor });
        const mesh = new THREE.Mesh(geometry, material);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }));
        edges.raycast = () => {};
        mesh.add(edges);

        obj = {
            mesh, wallId, edges, type,
            initialColor: params.initialColor,
            width: objWidth, height: objHeight, depth: objDepth,
            offsetAlongWall, offsetBottom,
            offsetFromParentWall: params.defaultoffsetFromParentWall || 0
        };
        
        // Обновляем 3D-позицию меша на основе вычисленных отступов
        updateSimpleObjectPosition(obj);
    }
    
    // 6. Создаем команду и выполняем ее
    const command = new AddObjectCommand(scene, windows, obj);
    historyManager.execute(command);

    // ==> ИЗМЕНЕНИЕ: Очищаем старое выделение перед новым <==
    clearSelection();
    
    // 7. Логика UI после добавления
    applyHighlight(obj.mesh);
    selectedCabinets = [obj];
    selectedCabinet = obj;
    // ... (показ меню, если нужно)
}

/**
 * Снимает выделение и подсветку со всех ранее выделенных объектов.
 */
function clearSelection() {
    // Снимаем подсветку
    selectedCabinets.forEach(obj => {
        const mesh = obj.mesh || obj; // Работает и для шкафов, и для столешниц
        if (mesh) {
            removeHighlight(mesh);
        }
    });
    
    // Очищаем массивы
    selectedCabinets = [];
    selectedCabinet = null;
}

/**
 * Вспомогательная функция для обновления 3D-позиции простых объектов.
 */
function updateSimpleObjectPosition(obj) {
    if (!obj || !obj.mesh) return;
    switch (obj.wallId) {
        case "Back":
            obj.mesh.position.set(-currentLength/2 + obj.offsetAlongWall + obj.width/2, -currentWidth/2 + obj.offsetBottom + obj.height/2, -currentHeight/2 + obj.offsetFromParentWall + obj.depth/2);
            obj.mesh.rotation.y = 0;
            break;
        case "Left":
            obj.mesh.position.set(-currentLength/2 + obj.offsetFromParentWall + obj.depth/2, -currentWidth/2 + obj.offsetBottom + obj.height/2, -currentHeight/2 + obj.offsetAlongWall + obj.width/2);
            obj.mesh.rotation.y = THREE.MathUtils.degToRad(90);
            break;
        case "Right":
            obj.mesh.position.set(currentLength/2 - obj.offsetFromParentWall - obj.depth/2, -currentWidth/2 + obj.offsetBottom + obj.height/2, -currentHeight/2 + obj.offsetAlongWall + obj.width/2);
            obj.mesh.rotation.y = THREE.MathUtils.degToRad(-90);
            break;
    }
}
window.updateSimpleObjectPosition = updateSimpleObjectPosition;

// ЗАМЕНА ДЛЯ addCabinet (для нижних)
function addCabinet(intersectPoint) {
    // 1. Проверяем условия (эта логика остается в main.js)
    if (selectedFaceIndex === null) {
        alert("Пожалуйста, выберите грань для добавления шкафа.");
        return;
    }
    const wallId = faceNormals[selectedFaceIndex].id;

    // 2. Готовим опции для создания нового экземпляра Cabinet
    const options = {
        type: 'lowerCabinet',
        wallId: wallId,
        intersectPoint: intersectPoint,
        kitchenGlobalParams: kitchenGlobalParams,
        roomDimensions: { length: currentLength, width: currentWidth, height: currentHeight },
        roomInverseMatrix: cube.matrixWorld.clone().invert(),
        calculateLowerCabinetOffset: calculateLowerCabinetOffset // Передаем ссылку на функцию-хелпер
    };

        // ==> ИЗМЕНЕНИЕ: Создаем и выполняем команду <==
    const command = new AddCabinetCommand(objectManager, options);
    historyManager.execute(command);

    const newCabinet = command.getAddedCabinet();

    if (newCabinet) {
        // 4. Отображаем UI (эта логика тоже остается в main.js)
        const center = new THREE.Vector3();
        newCabinet.mesh.getWorldPosition(center);
        const screenPos = center.project(camera);
        const rect = renderer.domElement.getBoundingClientRect();
        const x = (screenPos.x + 1) * rect.width / 2 + rect.left;
        const y = (-screenPos.y + 1) * rect.height / 2 + rect.top;
        showCabinetMenu(x, y, newCabinet);
    }
}

// ЗАМЕНА ДЛЯ addUpperCabinet
function addUpperCabinet(intersectPoint) {
    if (selectedFaceIndex === null) {
        alert("Пожалуйста, выберите грань для добавления верхнего шкафа.");
        return;
    }
    const wallId = faceNormals[selectedFaceIndex].id;
    
    const options = {
        type: 'upperCabinet',
        wallId: wallId,
        //isHeightIndependent: false,
        intersectPoint: intersectPoint,
        kitchenGlobalParams: kitchenGlobalParams,
        roomDimensions: { length: currentLength, width: currentWidth, height: currentHeight },
        roomInverseMatrix: cube.matrixWorld.clone().invert(),
        calculateLowerCabinetOffset: calculateLowerCabinetOffset 
    };

    const command = new AddCabinetCommand(objectManager, options);
    historyManager.execute(command);
    
    const newCabinet = command.getAddedCabinet();

    if (newCabinet) {
        const center = new THREE.Vector3();
        newCabinet.mesh.getWorldPosition(center);
        const screenPos = center.project(camera);
        const rect = renderer.domElement.getBoundingClientRect();
        const x = (screenPos.x + 1) * rect.width / 2 + rect.left;
        const y = (-screenPos.y + 1) * rect.height / 2 + rect.top;
        showCabinetMenu(x, y, newCabinet);
    }
}

// ЗАМЕНА ДЛЯ addFreestandingCabinet
function addFreestandingCabinet(intersectPoint) {
    if (!intersectPoint) {
        alert("Пожалуйста, укажите точку на полу для добавления шкафа.");
        return;
    }
    
    const options = {
        type: 'freestandingCabinet',
        wallId: 'Bottom',
        intersectPoint: intersectPoint,
        kitchenGlobalParams: kitchenGlobalParams,
        roomDimensions: { length: currentLength, width: currentWidth, height: currentHeight },
        roomInverseMatrix: cube.matrixWorld.clone().invert(),
        calculateLowerCabinetOffset: calculateLowerCabinetOffset
    };
   
    const command = new AddCabinetCommand(objectManager, options);
    historyManager.execute(command);

    const newCabinet = command.getAddedCabinet();

    if (newCabinet) {
        const center = new THREE.Vector3();
        newCabinet.mesh.getWorldPosition(center);
        const screenPos = center.project(camera);
        const rect = renderer.domElement.getBoundingClientRect();
        const x = (screenPos.x + 1) * rect.width / 2 + rect.left;
        const y = (-screenPos.y + 1) * rect.height / 2 + rect.top;
        showCabinetMenu(x, y, newCabinet);
    }
}


// Вызовем инициализацию drag-and-drop после init
document.addEventListener('DOMContentLoaded', init);


// --- saveProject ---
function saveProject() {
    console.log("[saveProject] Начало сохранения проекта...");

    // 1. Подготовка цоколей
    // Проверяем наличие массива и фильтруем
    const plinthsData = (window.plinths || []).map(p => {
        const { mesh, ...dataToSave } = p;
        return dataToSave;
    });

    // ОТЛАДКА ПОЛА
    console.log("[saveProject] Проверка пола:");
    console.log("window.floorObject:", window.floorObject);
    if (window.floorObject) {
        console.log("userData:", window.floorObject.userData);
        console.log("floorParams:", window.floorObject.userData.floorParams);
    }

    // 2. Подготовка пола
    // Важно: проверяем window.floorObject (если он привязан к window) или локальную floorObject
    // Если используешь модули, убедись что переменная доступна
    const floorObj = window.floorObject; 
    let floorData = null;
    
    if (floorObj && floorObj.userData && floorObj.userData.floorParams) {
        floorData = {
            params: floorObj.userData.floorParams,
            materialId: floorObj.userData.materialId
        };
        console.log("[saveProject] Данные пола подготовлены:", floorData);
    } else {
        console.warn("[saveProject] Пол не сохранен! Причина: floorObj=" + !!floorObj + 
                     ", userData=" + (floorObj ? !!floorObj.userData : "N/A") + 
                     ", params=" + (floorObj && floorObj.userData ? !!floorObj.userData.floorParams : "N/A"));
    }


    const projectState = {
        room: { 
            length: currentLength, // Убедись, что эти переменные доступны
            height: currentWidth, 
            width: currentHeight,  
            materials: (RM_materials).map(mat => mat.userData.materialId || null)
        },
        kitchenParams: { ...window.kitchenGlobalParams },
        
        windows: window.windows.map(obj => {
            if (!obj) return null;
            const { mesh, edges, ...dataToSave } = obj;
            return dataToSave;
        }).filter(Boolean),

        cabinets: window.objectManager.getAllCabinets().map(cabinet => {
            if (!cabinet) return null;
            const { mesh, edges, boundaries, calculatedPosition, calculatedRotation, frontMarker, uuidForDetailing, ...dataToSave } = cabinet;
            if (!dataToSave.id_data && cabinet.id_data) dataToSave.id_data = cabinet.id_data;
            return dataToSave;
        }).filter(Boolean),

        countertops: window.countertops.map(ct => {
            if (!ct || !ct.userData) return null;
            const { edges: ctEdges, initialMaterial, cachedLeftBoundary, cachedRightBoundary, ...userDataToSave } = ct.userData;
            return {
               userData: userDataToSave,
               uuid_mesh: ct.uuid,
               position: ct.position.clone(),
               rotation: { x: ct.rotation.x, y: ct.rotation.y, z: ct.rotation.z, order: ct.rotation.order },
               scale: ct.scale.clone()
            };
       }).filter(Boolean),

       // === ВАЖНО: СОХРАНЯЕМ ПОЛ И ЦОКОЛИ ===
       floor: floorData,
       plinths: plinthsData,
       // =====================================

       facadeSetsData: window.facadeSetsData || []
    };

    try {
        const json = JSON.stringify(projectState, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'kitchen_project_v2.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        console.log("[saveProject] Проект сохранен.");
        updateHint("Проект сохранен.");
    } catch (error) {
        console.error("[saveProject] Ошибка при сериализации:", error);
        alert("Ошибка сохранения проекта!");
    }
}

/**
 * Полностью удаляет все простые объекты (окна, розетки и т.д.) со сцены и из памяти.
 */
function clearAllWindows() {
    console.log(`  [Clear] Удаление ${windows.length} простых объектов...`);
    windows.forEach(obj => {
        if (obj.mesh) {
            // Удаляем 3D-объект со сцены
            scene.remove(obj.mesh);
            // Очищаем геометрию и материалы, чтобы освободить память GPU
            obj.mesh.traverse(child => {
                if (child.isMesh) {
                    child.geometry?.dispose();
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat?.dispose());
                    } else {
                        child.material?.dispose();
                    }
                }
            });
        }
    });
    // Полностью очищаем массив
    windows.length = 0;
}


/**
 * Полностью удаляет все столешницы со сцены и из памяти.
 */
function clearAllCountertops() {
    console.log(`  [Clear] Удаление ${countertops.length} столешниц...`);
    countertops.forEach(ct => {
        if (ct) {
            scene.remove(ct);
            ct.traverse(child => {
                if (child.isMesh || child.isLineSegments) {
                    child.geometry?.dispose();
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat?.dispose());
                    } else {
                        child.material?.dispose();
                    }
                }
            });
        }
    });
    countertops.length = 0;
}

function loadProject() { 
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e_reader) => {
                try {
                    console.log("[loadProject] Загрузка файла...");
                    const projectState = JSON.parse(e_reader.target.result);

                    // --- 1. ОЧИСТКА ---
                    console.log("  [loadProject] Очистка сцены...");
                    clearSelection();
                    hideAllContextMenus();
                    hideAllDimensionInputs();
                    window.objectManager.clearAll();
                    clearAllWindows(); // Должна чистить и windows, и apron
                    clearAllCountertops();
                    
                    // Очистка пола
                    if (window.floorObject) {
                        window.scene.remove(window.floorObject);
                        if (window.floorObject.geometry) window.floorObject.geometry.dispose();
                        window.floorObject = null;
                    }
                    // Очистка цоколей
                    if (window.plinths) {
                        window.plinths.forEach(p => { if(p.mesh) window.scene.remove(p.mesh); });
                        window.plinths = [];
                    }

                    window.selectedCabinets = [];
                    window.selectedCabinet = null;

                    // --- 2. КОМНАТА ---
                    console.log("  [loadProject] Комната...");
                    const roomData = projectState.room || {};
                    const roomL = roomData.length || 3.5;
                    const roomH = roomData.height || 2.6; 
                    const roomW = roomData.width || 2.5;
                    createCube(roomL, roomH, roomW, '#d3d3d3'); 
                    // (обновление инпутов размеров комнаты...)

                    // --- 2.1 Восстановление материалов стен ---
                    console.log("  [loadProject] Материалы стен...");
                    if (roomData.materials && Array.isArray(roomData.materials)) {
                        roomData.materials.forEach((matId, faceIndex) => {
                            if (matId) {
                                // Вызываем нашу функцию applyMaterialToWall
                                // (Убедись, что она доступна: импортирована или window.applyMaterialToWall)
                                if (applyMaterialToWall) {
                                    applyMaterialToWall(faceIndex, matId);
                                } else {
                                    // Если функция в модуле roomManager, нужно вызывать её оттуда
                                    // Например: roomManager.applyMaterialToWall(faceIndex, matId);
                                    console.warn("applyMaterialToWall not available");
                                }
                            }
                        });
                    }

                    // --- 3. ПАРАМЕТРЫ ---
                    if (projectState.kitchenParams) Object.assign(window.kitchenGlobalParams, projectState.kitchenParams);
                    if (projectState.facadeSetsData) window.facadeSetsData = projectState.facadeSetsData;

                    // --- 4. ОКНА И ФАРТУК ---
                    console.log("  [loadProject] Окна/Фартук...");
                    if (projectState.windows) {
                        projectState.windows.forEach(winData => {
                            if (!winData || !winData.type) return;
                            
                            // ФАРТУК (спец. обработка)
                            if (winData.type === 'apron') {
                                const apronObject = { ...winData };
                                // Импорт или доступ через window
                                // Предполагаем, что buildApronGeometry доступна
                                const buildParams = {
                                    width: winData.width, height: winData.height, depth: winData.depth,
                                    apronType: winData.apronType || 'panel',
                                    materialData: winData.materialData,
                                    tileParams: {
                                        width: winData.tileWidth, height: winData.tileHeight,
                                        gap: winData.tileGap, rowOffset: winData.tileRowOffset,
                                        layoutDirection: winData.tileLayoutDirection
                                    },
                                    textureOrientation: winData.textureOrientation
                                };
                                // ВАЖНО: buildApronGeometry должна быть доступна!
                                const meshGroup = buildApronGeometry(buildParams);
                                // Если вы используете модули, то buildApronGeometry должна быть импортирована в main.js
                                // const meshGroup = buildApronGeometry(buildParams); 

                                if (meshGroup) {
                                    apronObject.mesh = meshGroup;
                                    updateSimpleObjectPosition(apronObject);
                                    window.scene.add(apronObject.mesh);
                                    window.windows.push(apronObject);
                                }
                                return;
                            }

                             // --- ВАРИАНТ 2: ОБЫЧНЫЕ ОКНА (Window, Door, Socket...) ---
                            
                            // Получаем параметры типа (для цвета и размеров)
                            const params = window.objectTypes[winData.type];
                            if (!params) { console.warn(`Неизвестный тип объекта ${winData.type}`); return; }

                            // Создаем геометрию
                            const geometry = new THREE.BoxGeometry(winData.width, winData.height, winData.depth);
                            const material = new THREE.MeshStandardMaterial({ 
                                color: winData.initialColor || params.initialColor 
                            });
                            
                            const mesh = new THREE.Mesh(geometry, material);
                            
                            // Создаем ребра (обводку)
                            const edgesGeom = new THREE.EdgesGeometry(geometry);
                            const edgesMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
                            const edges = new THREE.LineSegments(edgesGeom, edgesMat);
                            edges.raycast = () => {}; // Игнорируем ребра при клике
                            mesh.add(edges);
                            
                            // Собираем объект данных
                            const newWindowObj = { 
                                ...winData, 
                                mesh: mesh, 
                                edges: edges 
                            };
                            
                            // Позиционирование
                            if (window.updateSimpleObjectPosition) {
                                window.updateSimpleObjectPosition(newWindowObj);
                            } else {
                                // Фалбек (на всякий случай, если функции нет)
                                const cL = window.roomDimensions.getLength();
                                const cW = window.roomDimensions.getWidth(); // Height Y
                                const cH = window.roomDimensions.getHeight(); // Depth Z
                                
                                switch (winData.wallId) {
                                    case "Back": 
                                        mesh.position.set(-cL/2 + winData.offsetAlongWall + winData.width/2, -cW/2 + winData.offsetBottom + winData.height/2, -cH/2 + winData.offsetFromParentWall + winData.depth/2); 
                                        mesh.rotation.y = 0; 
                                        break;
                                    case "Left": 
                                        mesh.position.set(-cL/2 + winData.offsetFromParentWall + winData.depth/2, -cW/2 + winData.offsetBottom + winData.height/2, -cH/2 + winData.offsetAlongWall + winData.width/2); 
                                        mesh.rotation.y = THREE.MathUtils.degToRad(90); 
                                        break;
                                    case "Right": 
                                        mesh.position.set(cL/2 - winData.offsetFromParentWall - winData.depth/2, -cW/2 + winData.offsetBottom + winData.height/2, -cH/2 + winData.offsetAlongWall + winData.width/2); 
                                        mesh.rotation.y = THREE.MathUtils.degToRad(-90); 
                                        break;
                                }
                            }

                            window.scene.add(mesh);
                            window.windows.push(newWindowObj);
                        });
                    }

                    // --- 5. ШКАФЫ ---
                    console.log("  [loadProject] Шкафы...");
                    const cabinetsToDetail = [];
                    if (projectState.cabinets) {
                        projectState.cabinets.forEach(cabData => {
                            const newCabinetInstance = Cabinet.fromData(cabData, dependencies);
                            if (newCabinetInstance) {
                                window.objectManager.registerCabinet(newCabinetInstance);
                                if (newCabinetInstance.isDetailed) {
                                    cabinetsToDetail.push(window.objectManager.getAllCabinets().length - 1);
                                }
                            }
                        });
                    }

                    // --- 6. СТОЛЕШНИЦЫ ---
                    console.log("  [loadProject] Столешницы...");
                    if (projectState.countertops) {
                        projectState.countertops.forEach(ctData => {
                            const newCt = createCountertopFromData(ctData);
                            if (newCt) newCt.updateMatrixWorld();
                        });
                    }

                    // --- 7. ПОЛ (НОВЫЙ БЛОК) ---
                    if (projectState.floor && projectState.floor.params) {
                        console.log("  [loadProject] Пол...");
                        const floorMesh = floorGenerator(projectState.floor.params, false, projectState.floor.materialId);
                        
                        if (floorMesh) {
                            // ИСПОЛЬЗУЕМ СЕТТЕР, чтобы обновить и локальную переменную внутри main.js
                            if (typeof window.setFloorObject === 'function') {
                                window.setFloorObject(floorMesh);
                            } else {
                                // Фалбек, если сеттера нет (но он должен быть)
                                window.floorObject = floorMesh;
                            }
                            
                            // Добавляем на сцену (setFloorObject это не делает сам, обычно)
                            window.scene.add(floorMesh);
                        }
                    } else {
                        console.log("  [loadProject] Пол отсутствует в файле.");
                    }

                    // --- 8. ЦОКОЛИ (НОВЫЙ БЛОК) ---
                    if (projectState.plinths) {
                        console.log("  [loadProject] Цоколи...");
                        window.plinths = []; 
                        projectState.plinths.forEach(plinthData => {
                            // Ищем шкафы
                            const cabinets = window.objectManager.getAllCabinets().filter(c => 
                                plinthData.cabinetIds.includes(c.id_data)
                            );
                            
                            if (cabinets.length > 0) {
                                // createPlinth должен быть доступен!
                                const meshGroup = createPlinth(cabinets, plinthData.materialData);
                                if (meshGroup) {
                                    const restoredPlinth = { ...plinthData, mesh: meshGroup };
                                    meshGroup.userData = restoredPlinth;
                                    window.plinths.push(restoredPlinth);
                                    window.scene.add(meshGroup);
                                }
                            }
                        });
                    }

                    // --- 9. ДЕТАЛИЗАЦИЯ ---
                    if (cabinetsToDetail.length > 0) {
                        console.log(`  [loadProject] Детализация ${cabinetsToDetail.length} шкафов...`);
                        cabinetsToDetail.forEach(idx => window.toggleCabinetDetail(idx));
                    }

                    // --- 10. ФИНАЛ ---
                    console.log("  [loadProject] Обновление UI...");
                    if (window.updateCountertopButtonVisibility) window.updateCountertopButtonVisibility();
                    window.requestRender();
                    console.log("[loadProject] Готово.");

                } catch (error) {
                    console.error("[loadProject] Ошибка:", error);
                    alert("Ошибка загрузки файла.");
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
    console.log("--- applyKitchenParams: Создание команды для изменения глобальных параметров ---");

    // 1. Сохраняем старые глобальные параметры
    const oldGlobalParams = { ...kitchenGlobalParams };
    
    // 2. Создаем объект с новыми параметрами, считывая их из DOM
    const newGlobalParams = { ...oldGlobalParams }; // Начинаем с копии, чтобы не потерять то, чего нет в меню
    try {
        newGlobalParams.countertopHeight = parseFloat(document.getElementById('countertopHeight').value);
        newGlobalParams.countertopThickness = parseFloat(document.getElementById('countertopThickness').value);
        newGlobalParams.plinthHeight = parseFloat(document.getElementById('plinthHeight').value);
        newGlobalParams.totalHeight = parseFloat(document.getElementById('totalHeight').value);
        newGlobalParams.apronHeight = parseFloat(document.getElementById('apronHeight').value);
        newGlobalParams.mezzanineHeight = parseFloat(document.getElementById('mezzanineHeight').value);
        newGlobalParams.golaMinHeightMm = parseFloat(document.getElementById('golaMinHeightMm').value);
        newGlobalParams.countertopType = document.getElementById('countertopType').value;
        // ==> ДОБАВЬ ЭТОТ ЛОГ <==
    //console.log(`[applyKitchenParams] 1. Считано из DOM: countertopType = "${newGlobalParams.countertopType}" (тип: ${typeof newGlobalParams.countertopType})`);
        newGlobalParams.handleType = document.getElementById('handleType').value;
        newGlobalParams.kitchenType = document.getElementById('kitchenType').value;
        // Добавь сюда другие параметры, если они есть в меню
    } catch (e) {
        console.error("Ошибка при чтении параметров из DOM:", e);
        return; // Прерываем выполнение, если не удалось считать данные
    }

    // 3. Создаем команду, передавая ей старое и новое состояние глобальных параметров
    const command = new UpdateGlobalParamsCommand(newGlobalParams, oldGlobalParams);
    
    // 4. Выполняем команду через historyManager
    historyManager.execute(command);
    
    // 5. Обновляем UI
    requestRender(); // Запрашиваем перерисовку сцены
    const menu = document.getElementById('kitchenParamsMenu');
    if (menu) menu.remove(); // Закрываем меню
}


// Привязка кнопки к открытию меню
const kitchenParamsButton = document.getElementById('kitchenParamsButton');
kitchenParamsButton.addEventListener('click', (e) => {
    // Открываем меню в центре экрана или по координатам клика
    showKitchenParamsMenu(e.clientX, e.clientY);
});

export function applyConfigMenuSettings(cabinetIndex) {
    // 1. Находим целевой объект
    const cabinetToChange = objectManager.getAllCabinets()[cabinetIndex];
    if (!cabinetToChange) {
        console.error("applyConfigMenuSettings: Шкаф не найден по индексу", cabinetIndex);
        hideCabinetConfigMenu();
        return;
    }
    
    // Прячем все поля размеров, так как сейчас будет обновление
    hideAllDimensionInputs();
    console.log("BEFORE update command:", cabinetToChange.isHeightIndependent);

    // 2. Используем "обертку" для записи в историю
    objectManager.createAndExecuteUpdateCommand(
        cabinetToChange,
        (cab) => {
            // ==> Вся логика изменения ДАННЫХ теперь находится здесь <==
            // Она применяется к временному объекту `cab`.

            const configMenu = document.getElementById('cabinetConfigMenu');
            if (!configMenu) {
                console.error("[ACMS:action] Меню конфигурации (cabinetConfigMenu) не найдено!");
                return;
            }

            // --- Блок 1: Считывание всех значений из DOM-элементов меню ---
            const newSettings = {};
            configMenu.querySelectorAll('input[type="number"], input[type="text"], input[type="color"], select, input[type="checkbox"]').forEach(el => {
                const prop = el.dataset.setProp;
                if (!prop || ['toggleDetailBtn', 'applyConfigBtnInMenu'].includes(el.id)) return;
                if (prop === 'isHeightIndependent') return; 

                let value;
                if (el.type === 'checkbox') {
                    value = el.checked;
                } else if (el.type === 'color') {
                    value = el.value;
                } else if (el.tagName === 'SELECT') {
                    value = el.value;
                } else { // number, text
                    value = el.value.replace(',', '.'); // На случай ввода запятой
                }

                // Преобразуем в числа и метры, где необходимо
                const propsInMetersFromMm = [
                    'height', 'sinkDiameter', 'stretcherDrop', 'extraOffset', 'offsetFromParentWall',
                    'fp_custom_height', 'fp_offset_from_floor', 'fp_depth', 'wallOffset', 'offsetBottom',
                    'facadeWidth', 'cornerElementWidth'
                ];

                if (propsInMetersFromMm.includes(prop)) {
                    const numVal = parseFloat(value);
                    newSettings[prop] = !isNaN(numVal) ? numVal / 1000 : undefined;
                } else if (el.type === 'number' || el.type === 'text') {
                    const numVal = parseFloat(value);
                    newSettings[prop] = !isNaN(numVal) ? numVal : value; // Если не число, оставляем как строку (для выражений)
                } else {
                    newSettings[prop] = value;
                }
            });

            // --- Блок 2: Применение всех считанных настроек к объекту `cab` ---
            for (const key in newSettings) {
                if (Object.hasOwnProperty.call(newSettings, key) && newSettings[key] !== undefined) {
                    cab[key] = newSettings[key];
                }
            }

            // --- Блок 3: Пересчет зависимых свойств (самая важная часть) ---

            // ==> НАЧАЛО НОВОГО, КЛЮЧЕВОГО БЛОКА <==
            // Проверяем, является ли шкаф, который мы настраиваем, угловым.
            const isCornerCabinet = (cab.cabinetType === 'corner' && cab.cabinetConfig === 'sink') || 
                        (cab.cabinetType === 'cornerUpper' && cab.cabinetConfig === 'cornerUpperStorage');

            if (isCornerCabinet) {
                // --- Общая логика пересчета для ЛЮБОГО углового шкафа ---

                // 1. Определяем "пояс" (pivot) на основе соседа, используя универсальную функцию
                const direction = findNearestCornerDirection(cab);
                cab.cornerDirection = direction;
                const neighbor = findNearestNeighbor(cab);
                const pivotPositionM = calculateCornerPivotPosition(cab, neighbor, MaterialManager);
                cab.sideLength = pivotPositionM;
                

                // 2. Рассчитываем новую ширину и положение
                // Эта математика универсальна для верхних и нижних шкафов
                
                // Используем разные "дельты" для верхних и нижних
                const DELTA_M = cab.cornerElementWidth || ( (cab.type === 'upperCabinet') ? 0.018 : 0.020 );
                
                if (cab.cornerDirection === 'left') {
                    // Логика для левого угла (копипаст из вашего примера)
                    let finalOffsetAlongWall = 0;
                    if (cab.offsetAlongWall >= 0 && cab.offsetAlongWall < pivotPositionM - 0.1) {
                        finalOffsetAlongWall = cab.offsetAlongWall;
                    }
                    cab.offsetAlongWall = finalOffsetAlongWall;
                    const rightPartSizeM = (cab.facadeWidth || 0.45) + DELTA_M;
                    const leftPartSizeM = pivotPositionM - cab.offsetAlongWall;
                    cab.width = leftPartSizeM + rightPartSizeM;

                } else { // cab.cornerDirection === 'right'
                    // Логика для правого угла (копипаст из вашего примера)
                    const wallLength = (cab.wallId === 'Back' || cab.wallId === 'Front') 
                        ? roomDimensions.getLength() 
                        : roomDimensions.getHeight();
                    const currentOffsetFromRight = wallLength - cab.offsetAlongWall - cab.width;

                    if (currentOffsetFromRight >= 0 && currentOffsetFromRight < pivotPositionM - 0.1) {
                        const leftPartSizeM = (cab.facadeWidth || 0.45) + DELTA_M;
                        const rightPartSizeM = pivotPositionM - currentOffsetFromRight;
                        cab.width = leftPartSizeM + rightPartSizeM;
                        cab.offsetAlongWall = wallLength - cab.width - currentOffsetFromRight;
                    } else {
                        const leftPartSizeM = (cab.facadeWidth || 0.45) + DELTA_M;
                        const rightPartSizeM_forRightCorner = pivotPositionM;
                        cab.width = leftPartSizeM + rightPartSizeM_forRightCorner;
                        cab.offsetAlongWall = wallLength - cab.width;
                    }
                }

                // --- ОТЛАДОЧНЫЙ БЛОК ---
                console.log("--- ОТЛАДКА ACMS ---");
                console.log("Новая ширина фасада:", cab.facadeWidth);
                console.log("Pivot (глубина соседа):", pivotPositionM);
                console.log("Рассчитанная общая ширина:", cab.width);
                console.log("Рассчитанный отступ:", cab.offsetAlongWall);
                console.log("--------------------");

                console.log(`[ACMS] Пересчет углового шкафа: W=${cab.width.toFixed(3)}, Offset=${cab.offsetAlongWall.toFixed(3)}`);
            }

            console.log("[DEBUG] newSettings keys:", Object.keys(newSettings));
            console.log("[DEBUG] cab.isHeightIndependent:", cab.isHeightIndependent);

            console.log("[DEBUG] Before recalc: isHeightIndependent =", cab.isHeightIndependent);
            const isUpperNormal_apply = (cab.type === 'upperCabinet' && cab.isMezzanine === 'normal');
            if (isUpperNormal_apply && !cab.isHeightIndependent) {
                console.log("[DEBUG] Пересчет высоты сработал! (значит флаг false)");
                const countertopHeightM = kitchenGlobalParams.countertopHeight / 1000;
                const apronHeightM = kitchenGlobalParams.apronHeight / 1000;
                const totalHeightM = kitchenGlobalParams.totalHeight / 1000;
                cab.height = totalHeightM - countertopHeightM - apronHeightM;
                cab.offsetBottom = countertopHeightM + apronHeightM;
            }
            
            // Ширина для посудомойки
            if (cab.cabinetConfig === 'dishwasher' && cab.dishwasherWidth) {
                const newWidthMeters = parseFloat(cab.dishwasherWidth) / 1000;
                if (!isNaN(newWidthMeters) && newWidthMeters > 0) {
                    cab.width = newWidthMeters;
                }
            }
            
            // Логика для фальш-панели (ФП)
            if (cab.cabinetConfig === 'falsePanel') {
                const facadeSet = window.facadeSetsData.find(set => set.id === cab.facadeSet);
                const { thickness: facadeThicknessMeters } = MaterialManager.getMaterial(facadeSet);

                if (cab.fp_type === 'narrow' || cab.fp_type === 'decorativePanel') {
                    cab.width = facadeThicknessMeters;
                    cab.depth = cab.fp_depth !== undefined ? cab.fp_depth : (cab.fp_type === 'narrow' ? 0.080 : 0.582);
                    cab.overhang = 0.018 - facadeThicknessMeters;
                } else {
                    cab.overhang = 0.018;
                }

                if (cab.fp_vertical_align === 'floor') {
                    cab.offsetBottom = cab.fp_offset_from_floor !== undefined ? cab.fp_offset_from_floor : 0;
                } else {
                    cab.offsetBottom = kitchenGlobalParams.plinthHeight / 1000;
                }

                let calculatedHeightM = cab.height;
                if (cab.fp_height_option === 'cabinetHeight') {
                    calculatedHeightM = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - (cab.offsetBottom * 1000)) / 1000;
                } else if (cab.fp_height_option === 'toGola') {
                    const availableForGolaMm = kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - (cab.offsetBottom * 1000);
                    const cabHeightForGola = kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight;
                    const golaM = (window.calculateActualGolaHeight(kitchenGlobalParams.golaMinHeightMm, (cab.facadeGap || 0.003) * 1000, cabHeightForGola)) / 1000;
                    calculatedHeightM = availableForGolaMm / 1000 - golaM;
                } else if (cab.fp_height_option === 'kitchenHeight') {
                    calculatedHeightM = (kitchenGlobalParams.totalHeight / 1000) - cab.offsetBottom;
                } else if (cab.fp_height_option === 'freeHeight') {
                    calculatedHeightM = cab.fp_custom_height !== undefined ? cab.fp_custom_height : cab.height;
                    cab.fp_custom_height = calculatedHeightM;
                }
                cab.height = Math.max(0.05, calculatedHeightM);
                cab.isHeightIndependent = (cab.fp_height_option === 'freeHeight' || cab.fp_height_option === 'kitchenHeight');
            }

            // Финальный пересчет отступа от стены для нижних шкафов (после всех изменений глубины, фасадов и т.д.)
            if (cab.type === 'lowerCabinet' && cab.wallId !== 'Bottom') {
                cab.offsetFromParentWall = window.calculateLowerCabinetOffset(cab);
            }
            // Авто-ширина для верхней фальш-панели
            if (cab.type === 'upperCabinet' && cab.cabinetConfig === 'falsePanelUpper') {
                const facadeSet = window.facadeSetsData.find(set => set.id === cab.facadeSet);
                // Используем window.MaterialManager, если он доступен, или импорт
                // Предполагаем, что MaterialManager доступен в области видимости (он импортирован в main.js)
                if (window.MaterialManager && window.MaterialManager.getMaterial) {
                    const { thickness } = window.MaterialManager.getMaterial(facadeSet);
                    cab.width = thickness;
                    console.log(`[ACMS] Ширина фальш-панели установлена: ${cab.width}м`);
                }
            }
        },
        'Изменение конфигурации шкафа' // Имя команды
    );

    // 3. После выполнения команды просто скрываем меню.
    clearSelection();
    hideCabinetConfigMenu();
}

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
    const ctBtn = document.getElementById('countertop-button');
    const plBtn = document.getElementById('plinth-button');

    if (ctBtn) ctBtn.style.display = hasLowerCabinet ? 'block' : 'none';
    
    // Кнопка цоколя ведет себя так же
    if (plBtn) plBtn.style.display = hasLowerCabinet ? 'block' : 'none';
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
    objectManager.getAllCabinets().forEach(c => {
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

// --- НОВАЯ КНОПКА: ЦОКОЛЬ ---
const plinthButton = document.createElement('button');
plinthButton.id = 'plinth-button';
plinthButton.textContent = 'Добавить цоколь';
// Стилизуем так же, как кнопку столешницы, чтобы они были близнецами
// plinthButton.style.display = 'none'; // По умолчанию скрыта
// plinthButton.style.width = '100%';
// plinthButton.style.padding = '10px';
// plinthButton.style.marginTop = '5px'; // Отступ от кнопки столешницы
// plinthButton.style.backgroundColor = '#4CAF50'; // Зеленый, как у столешницы
// plinthButton.style.color = 'white';
// plinthButton.style.border = 'none';
// plinthButton.style.cursor = 'pointer';

// Эффект наведения
// plinthButton.onmouseover = function() { this.style.backgroundColor = '#45a049'; };
// plinthButton.onmouseout = function() { this.style.backgroundColor = '#4CAF50'; };

document.getElementById('leftPanel').appendChild(plinthButton);

// Обработчик нажатия (пока заглушка с алертом, но с валидацией выделения)
plinthButton.addEventListener('click', () => {
    // 1. Валидация: выделено ли что-то?
    if (selectedCabinets.length === 0) {
        updateHint('Выделите хотя бы один нижний шкаф!');
        return;
    }

    // 2. Валидация: подходит ли тип?
    // Логика такая же, как для столешницы: нужны нижние шкафы или пеналы (freestanding)
    const validCabinets = selectedCabinets.filter(cab => 
        (cab.type === 'lowerCabinet') ||
        (cab.type === 'freestandingCabinet')
    );

    if (validCabinets.length === 0) {
        updateHint('Цоколь можно добавить только к нижним шкафам или пеналам!');
        return;
    }

    // 3. Вызов функции создания (которую мы напишем позже)
   
    const plinthGroup = createPlinth(validCabinets); // Передаем ВСЕ шкафы
    
    // Вызываем команду
    const command = new AddPlinthCommand(window.scene, window.plinths, validCabinets);
    historyManager.execute(command);
        
    requestRender();
});



/**
 * Создает столешницу над выбранными шкафами, делегируя отрисовку updateCountertop3D.
 * @param {Array} selectedCabinets - Массив выбранных объектов шкафов.
 */
function createCountertop(selectedCabinets) {
    if (!selectedCabinets || selectedCabinets.length === 0) return;

    const anchorCabinet = selectedCabinets[0];
    const defaultMaterialInfo = window.countertopOptionsData[0]; 
    const currentCountertopType = kitchenGlobalParams.countertopType;
    const currentThickness = kitchenGlobalParams.countertopThickness / 1000;

    let initialUserData = {};
    let initialPosition = new THREE.Vector3();
    let initialRotation = new THREE.Euler();

    if (anchorCabinet.type === 'freestandingCabinet') {
        const cabinet = anchorCabinet;
        const thickness = currentThickness;
        const depth = kitchenGlobalParams.countertopDepth / 1000;
        const rotationY = cabinet.mesh.rotation.y;
        const length = cabinet.width;
        
        // --- Расчет Позиции (Ваш код) ---
        const cabinetCenter = cabinet.mesh.position;
        const cabinetQuaternion = cabinet.mesh.quaternion;
        const cabinetHeight = cabinet.height;
        const cabinetDepth = cabinet.depth;
        const cabOverhang = cabinet.overhang ?? 0.018;
        const cabFacadeThickness = cabinet.facadeThickness ?? 0.018;
        
        const targetY = cabinetCenter.y + cabinetHeight / 2 + thickness / 2;
        const forwardDir = new THREE.Vector3(0, 0, 1).applyQuaternion(cabinetQuaternion);
        const offsetMagnitude = (cabinetDepth / 2) + cabOverhang + cabFacadeThickness - (depth / 2);
        const targetPos = cabinetCenter.clone().addScaledVector(forwardDir, offsetMagnitude);
        targetPos.y = targetY;

        initialPosition.copy(targetPos);
        initialRotation.copy(cabinet.mesh.rotation);
        
        initialUserData = {
            type: 'countertop',
            id_data: THREE.MathUtils.generateUUID(),
            wallId: 'Bottom',
            length: length,
            depth: depth,
            thickness: currentThickness,
            cabinetUuid: cabinet.mesh.uuid,
            heightDependsOnGlobal: false,
            materialId: defaultMaterialInfo.id,
            countertopType: currentCountertopType
        };

    } else if (['Back', 'Front', 'Left', 'Right'].includes(anchorCabinet.wallId)) {
        const wallId = anchorCabinet.wallId;
        const wallCabinets = selectedCabinets.filter(cab => cab.wallId === wallId);
        const positions = wallCabinets.map(cab => cab.offsetAlongWall);
        const minOffset = Math.min(...positions);
        const maxOffset = Math.max(...positions) + wallCabinets.find(cab => cab.offsetAlongWall === Math.max(...positions)).width;
        
        const length = maxOffset - minOffset;
        const depth = kitchenGlobalParams.countertopDepth / 1000;
        const thickness = currentThickness;
        
        // --- Расчет Позиции (Ваш код) ---
        const cabinetTopY = anchorCabinet.mesh.position.y + anchorCabinet.height / 2;
        const roomWidth = currentLength;
        const roomDepth = currentHeight;
        
        let x, y, z;
        y = cabinetTopY + thickness / 2;
        
        if (wallId === 'Back') {
            x = minOffset + length / 2 - roomWidth / 2;
            z = -roomDepth / 2 + depth / 2;
        } else if (wallId === 'Front') {
            x = minOffset + length / 2 - roomWidth / 2;
            z = roomDepth / 2 - depth / 2;
            initialRotation.y = Math.PI;
        } else if (wallId === 'Left') {
            x = -roomWidth / 2 + depth / 2;
            z = minOffset + length / 2 - roomDepth / 2;
            initialRotation.y = Math.PI / 2;
        } else if (wallId === 'Right') {
            x = roomWidth / 2 - depth / 2;
            z = minOffset + length / 2 - roomDepth / 2;
            initialRotation.y = -Math.PI / 2;
        }
        initialPosition.set(x, y, z);

        initialUserData = {
            type: 'countertop',
            id_data: THREE.MathUtils.generateUUID(),
            wallId: wallId,
            length: length,
            depth: depth,
            thickness: currentThickness,
            offsetAlongWall: minOffset,
            materialId: defaultMaterialInfo.id, 
            countertopType: currentCountertopType, 
            heightDependsOnGlobal: true
        };
    } else {
        return;
    }

    // --- ОБЩИЙ КОД ---
    // 1. Создаем ПУСТОЙ меш-контейнер
    const countertop = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    
    // 2. Устанавливаем его начальную позицию, вращение и userData
    countertop.position.copy(initialPosition);
    countertop.rotation.copy(initialRotation);
    countertop.userData = initialUserData;

    // 3. ВЫЗЫВАЕМ нашу новую умную функцию, чтобы она все построила
    // Она создаст геометрию, материал, текстуру и ребра.
    window.updateCountertop3D(countertop, countertop.userData);
    
    // 4. Добавляем в историю и сцену
    const command = new AddObjectCommand(scene, countertops, countertop);
    historyManager.execute(command);
    updateHint('Столешница добавлена!');
}


/**
 * НОВАЯ ЦЕНТРАЛЬНАЯ ФУНКЦИЯ ОБНОВЛЕНИЯ СТОЛЕШНИЦЫ
 * @param {THREE.Mesh} countertop - 3D объект столешницы для обновления.
 * @param {object} stateToApply - Новое состояние (объект userData), которое нужно применить.
 * @param {object} previousState - Предыдущее состояние, нужное для расчета сдвигов.
 */
window.updateCountertop3D = function(countertop, stateToApply, previousState) {
    if (!countertop || !stateToApply) return;

    const oldState = previousState || { ...countertop.userData };
    Object.assign(countertop.userData, stateToApply);
    
    const { length, depth, wallId, materialId, countertopType, thickness } = countertop.userData;


    // --- 0. Расчет вырезов ---
    const holes = [];
    
    if (countertop.children) {
        //console.log("Детей у столешницы:", countertop.children.length); // <-- ЛОГ 1
        countertop.children.forEach(child => {
            if (child.userData && child.userData.type === 'sink_model' && child.userData.cutoutSize) {
                // 1. Получаем локальную позицию мойки (X - длина, Z - глубина)
                
                // --- НОВАЯ ЛОГИКА РАЗМЕРОВ ВЫРЕЗА ---
                let cutoutW = child.userData.cutoutSize.width;
                let cutoutD = child.userData.cutoutSize.depth;
                let cutoutOffsetZ = 0; // Смещение центра выреза по глубине
                let cornerRadius = 10 / 1000; // Стандартный радиус

                const isCompact = countertopType === 'compact-plate';
                const isSteel = child.userData.modelName === 'sink_inox.glb';

                if (isCompact && isSteel) {
                    // Подстольный монтаж: вырез меньше
                    // Например, уменьшаем на 20мм с каждой стороны (или как нужно по ТЗ)
                    cutoutW = 0.440; // Пример: 400мм (ширина чаши)
                    cutoutD = 0.398; // Пример: 400мм (глубина чаши)
                    
                    // Смещение, если чаша не по центру мойки
                    cutoutOffsetZ = 0.025; 
                    
                    // Радиус может быть другим для чаши
                    cornerRadius = 20 / 1000; 
                }

                const shapeCenterX = child.position.x + length / 2;
                const shapeCenterY = child.position.z + depth / 2 + cutoutOffsetZ;
                
                // 2. Создаем прямоугольный путь для дырки
                const hole = new THREE.Path();
                const radius = 10 / 1000; // Радиус 10мм
                const minX = shapeCenterX - cutoutW / 2;
                const maxX = shapeCenterX + cutoutW / 2;
                const minY = shapeCenterY - cutoutD / 2;
                const maxY = shapeCenterY + cutoutD / 2;
                
                hole.moveTo(minX, minY + radius);
                hole.lineTo(minX, maxY - radius);
                hole.quadraticCurveTo(minX, maxY, minX + radius, maxY);
                hole.lineTo(maxX - radius, maxY);
                hole.quadraticCurveTo(maxX, maxY, maxX, maxY - radius);
                hole.lineTo(maxX, minY + radius);
                hole.quadraticCurveTo(maxX, minY, maxX - radius, minY);
                hole.lineTo(minX + radius, minY);
                hole.quadraticCurveTo(minX, minY, minX, minY + radius);
                
                holes.push(hole);
            }
        });
    }
     //console.log("Всего вырезов:", holes.length); // <-- ЛОГ 4

    // --- ЭТАП 1: Запоминаем мировые позиции техники ---
    const applianceWorldPositions = [];
    if (countertop.children) {
        countertop.children.forEach(child => {
            if (child.userData && (child.userData.type === 'hob' || child.userData.type === 'sink_model')) {
                const worldPos = new THREE.Vector3();
                child.getWorldPosition(worldPos);
                applianceWorldPositions.push({ child: child, worldPos: worldPos });
            }
        });
    }
    
    // 1. Обновляем геометрию, используя нашу фабрику
    const newGeometry = createCountertopGeometry(length, depth, thickness, holes);
    if (!newGeometry) return;

    // "Чиним" геометрию, как в createCountertop
    newGeometry.rotateX(Math.PI / 2);
    newGeometry.translate(-length / 2, thickness / 2, -depth / 2);

    countertop.geometry.dispose();
    countertop.geometry = newGeometry;

    //console.log("Обновление ребер. Старые:", countertop.userData.edges ? "есть" : "нет");
    
    if (countertop.userData.edges) {
        // Удаляем ВСЕ LineSegments из детей (это наши ребра)
        for (let i = countertop.children.length - 1; i >= 0; i--) {
            const child = countertop.children[i];
            if (child.isLineSegments) {
                child.geometry.dispose();
                child.material.dispose();
                countertop.remove(child);
            }
        }
    }

    // --- НОВЫЙ БЛОК: Создаем новые ребра ---
    const edgesGeometry = new THREE.EdgesGeometry(countertop.geometry);
    const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edges.raycast = () => {}; // Не мешать кликам
    countertop.add(edges);
    countertop.userData.edges = edges;

    //console.log("Новые ребра добавлены. Вершин:", edgesGeometry.attributes.position.count);

    // 2. Обновляем материал
    const materialInfo = window.countertopOptionsData.find(m => m.id === materialId);
    const newMaterial = MaterialManager.createCountertopMaterial(materialInfo, countertopType);
    if (Array.isArray(countertop.material)) {
        countertop.material.forEach(mat => mat.dispose());
    } else if (countertop.material) {
        countertop.material.dispose();
    }
    countertop.material = newMaterial;
    
    // 3. Применяем текстуру
    // (Этот блок был в updateTextureScale, теперь он здесь)
    if (Array.isArray(countertop.material)) {
        // Логика для компакт-плиты
        MaterialManager.applyTextureToExtruded(countertop, 'horizontal', length, depth, countertop.material[0]);
    } else {
        MaterialManager.applyTextureToExtruded(countertop, 'horizontal', length, depth, countertop.material);
    }
 
    // 4. Позиция. `UpdateGlobalParamsCommand` уже сама правильно меняет Y.
    const depthDifference = depth - (oldState.depth || depth);

    if (Math.abs(depthDifference) > 1e-5) {
        const shift = depthDifference / 2;
        
        // Вектор, направленный "вперед" от стены
        let forwardVector = new THREE.Vector3();
        if (wallId === 'Back')  forwardVector.set(0, 0, 1);
        if (wallId === 'Front') forwardVector.set(0, 0, -1);
        if (wallId === 'Left')  forwardVector.set(1, 0, 0);
        if (wallId === 'Right') forwardVector.set(-1, 0, 0);
        
        // Сдвигаем позицию центра столешницы в этом направлении на половину изменения глубины
        countertop.position.addScaledVector(forwardVector, shift);
    }
    countertop.updateMatrixWorld(true);
    
    // --- ЭТАП 5: Восстанавливаем позиции техники ---
    if (countertop.children) {
        countertop.children.forEach(child => {
            if (child.userData && (child.userData.type === 'hob' || child.userData.type === 'sink_model')) {
                // 1. X: Восстанавливаем отступ от левого края
                // (Если distFromLeft еще нет, высчитываем его на лету из старой длины)
                let dist = child.userData.distFromLeft;
                if (dist === undefined) {
                     const oldLength = oldState.length || length;
                     dist = child.position.x - (-oldLength / 2);
                     child.userData.distFromLeft = dist; // Сохраняем на будущее
                }
                
                child.position.x = (-length / 2) + dist;

                // 2. Y: Высота (как и было)
                // Логика для мойки
                let posY = thickness / 2;

                if (child.userData.type === 'sink_model') {
                    const isCompact = countertopType === 'compact-plate';
                    const modelName = child.userData.modelName;
                    const isSteel = modelName === 'sink_inox.glb'; 

                    if (isCompact && isSteel) {
                        // Монтаж ПОД столешницу
                        // Нижняя грань столешницы = -thickness/2
                        // Смещаем еще на 2мм вниз
                        posY = -thickness / 2 - (3 / 1000);
                    }
                }

                child.position.y = posY;

                // --- ПОЗИЦИОНИРОВАНИЕ СМЕСИТЕЛЯ ---
                const mixer = child.children.find(c => c.userData && c.userData.isMixer);

                console.log("mixer = ", mixer);
                if (mixer) {
                    const isCompact = countertopType === 'compact-plate';
                    const modelName = child.userData.modelName;
                    const isSteel = modelName === 'sink_inox.glb'
                    
                    // Z (вдоль глубины столешницы):
                    // В локальных координатах мойки, ось Z совпадает с осью Z столешницы (если нет вращения).
                    // Pivot мойки = 0.
                    let mixerZ = -0.182; // -182мм (по умолчанию для камня)
                    
                    if (isSteel) {
                         mixerZ = -0.220; // -220мм
                    }
                    
                    // Y (Высота):
                    // Смеситель должен стоять на верхней грани столешницы.
                    // Верхняя грань столешницы в мировых = (центр стола Y) + thickness/2.
                    // Мойка стоит на posY (относительно центра стола).
                    // Значит, верхняя грань относительно мойки = (thickness/2) - posY.
                    
                    let mixerY = (thickness / 2) - posY;
                    
                    if (isSteel && !isCompact) { // Постформинг + сталь
                         // y = pivot мойки + 1 мм;
                         // Мойка стоит на thickness/2.
                         // Значит mixerY = 1мм (относительно мойки)
                         mixerY = 1 / 1000;
                    } else if (!isSteel) { // Камень
                         // y = pivot мойки + 10 мм;
                         mixerY = 3 / 1000;
                    }
                    // Для компакт+сталь: mixerY = (thickness/2) - posY. (Это уже посчитано выше)

                    mixer.position.set(0, mixerY, mixerZ); // X=0 (центр мойки)
                }


                // 3. Z: Глубина (как и было)
                if (child.userData.type === 'hob') {
                    const applianceDepth = 0.520;
                    const offsetFromFront = 0.040;
                    child.position.z = (depth / 2) - offsetFromFront - (applianceDepth / 2);
                } else if (child.userData.type === 'sink_model') {
                    // Для мойки: pivot = передняя грань - 260мм
                    const offsetFromFront = 0.250 + 0.06; // 260мм
                    child.position.z = (depth / 2) - offsetFromFront;
                }
                
            }
        });
    }
};


// Новая функция для создания столешницы из загруженных данных
function createCountertopFromData(ctData) {
    console.log("[createCountertopFromData] Загрузка столешницы...", ctData);
    
    const savedUserData = ctData.userData;
    if (!ctData || !savedUserData || savedUserData.type !== 'countertop') return null;

    // 1. Создаем ПУСТОЙ меш-контейнер
    const countertopMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());

    // 2. Восстанавливаем позицию, вращение и масштаб "как есть" из JSON
    // (updateCountertop3D потом "починит" геометрию внутри этого меша)
    if (ctData.position) countertopMesh.position.copy(ctData.position);
    if (ctData.rotation) countertopMesh.rotation.set(ctData.rotation.x, ctData.rotation.y, ctData.rotation.z, ctData.rotation.order || 'XYZ');
    if (ctData.scale) countertopMesh.scale.copy(ctData.scale);
    
    countertopMesh.uuid = ctData.uuid_mesh || THREE.MathUtils.generateUUID();

    // 3. Восстанавливаем userData
    countertopMesh.userData = { ...savedUserData };
    // Убедимся, что id_data есть
    if (!countertopMesh.userData.id_data) { 
        countertopMesh.userData.id_data = THREE.MathUtils.generateUUID();
    }

     // --- СНАЧАЛА ВОССТАНАВЛИВАЕМ ДЕТЕЙ ---
    if (savedUserData.appliances && Array.isArray(savedUserData.appliances)) {
        countertopMesh.userData.appliances = []; 
        savedUserData.appliances.forEach(appData => {
            const appMesh = createCountertopApplianceFromData(countertopMesh, appData);
            if (appMesh) {
                countertopMesh.userData.appliances.push(appMesh.userData);
            }
        });
    }

    // 4. ВЫЗЫВАЕМ НАШУ УМНУЮ ФУНКЦИЮ
    // Она создаст ExtrudeGeometry, повернет ее, сдвинет pivot, создаст материал и текстуру.
    // Важно: мы передаем `null` как previousState, чтобы она не пыталась сдвигать позицию,
    // а просто отрисовала то, что есть.
    window.updateCountertop3D(countertopMesh, countertopMesh.userData);

    // 5. Добавляем ребра (вручную, т.к. updateCountertop3D удаляет старые, но не создает новые для чистоты)
    // const edgesGeometry = new THREE.EdgesGeometry(countertopMesh.geometry);
    // const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    // const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    // edges.raycast = () => {};
    // countertopMesh.add(edges);
    // countertopMesh.userData.edges = edges;

    // 6. Добавляем в сцену и массив
    if (cube) scene.add(countertopMesh);
    if (typeof countertops !== 'undefined' && Array.isArray(countertops)) {
        countertops.push(countertopMesh);
    }

    // if (savedUserData.appliances && Array.isArray(savedUserData.appliances)) {
    //     // Очищаем массив, так как мы будем его пересоздавать
    //     countertopMesh.userData.appliances = []; 
        
    //     savedUserData.appliances.forEach(appData => {
    //         const appMesh = createCountertopApplianceFromData(countertopMesh, appData);
    //         if (appMesh) {
    //             countertopMesh.userData.appliances.push(appMesh.userData);
    //         }
    //     });
    // }

    console.log(`  [createCountertopFromData] Столешница ${countertopMesh.uuid} восстановлена.`);
    console.log(`  [createCountertopFromData] Столешница.wallId ${countertopMesh.wallId} `);
    return countertopMesh;
}



// === Обновление материала столешницы (при изменении типа) ===
//function updateCountertopMaterial(countertop) {
//    const newMaterial = createCountertopMaterial(countertop.userData);
//    countertop.material = Array.isArray(newMaterial) ? newMaterial : [newMaterial];
//    countertop.material.needsUpdate = true;
//}


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
    if (!wallId || wallId === 'Bottom' || isNaN(newDepthM) || newDepthM < 0.1) return;

    // --- Обновляем все столешницы на этой стене через КОМАНДЫ ---
    countertops.forEach(ct => {
        if (ct.userData.wallId === wallId && Math.abs(ct.userData.depth - newDepthM) > 1e-5) {
            
            const oldState = { ...ct.userData };
            const newState = { ...ct.userData, depth: newDepthM };

            // Создаем и выполняем команду для каждой столешницы
            const command = new UpdateCountertopCommand(ct, newState, oldState);
            historyManager.execute(command);
        }
    });

    // Обновление шкафов теперь будет происходить внутри команды, если нужно
    console.log(`Команды на обновление глубины для стены ${wallId} выполнены.`);
}

/**
 * Создает геометрию столешницы с учетом вырезов.
 * @param {number} length 
 * @param {number} depth 
 * @param {number} thickness 
 * @param {Array<THREE.Path>} holes - Массив контуров для вырезов (опционально).
 */
function createCountertopGeometry(length, depth, thickness, holes = []) {
    if (length <= 0 || depth <= 0 || thickness <= 0) return null;
    const countertopShape = new THREE.Shape();
    countertopShape.moveTo(0, 0);
    countertopShape.lineTo(length, 0);
    countertopShape.lineTo(length, depth);
    countertopShape.lineTo(0, depth);
    //console.log(`[createCountertopGeometry] length =  ${length}, depth =  ${depth},  thickness ${thickness}`);
    
    // --- ДОБАВЛЯЕМ ВЫРЕЗЫ ---
    if (holes && holes.length > 0) {
        countertopShape.holes = holes;
    }

    const bevelSize = 0.001; // 1.5мм
    const bevelThickness = 0.001; // 1.5мм
    const effectiveThickness = thickness - 2 * bevelThickness;

    const extrudeSettings = { 
        depth: effectiveThickness, 
        bevelEnabled: true,      // <--- ВКЛЮЧАЕМ
        bevelThickness: bevelThickness,   // <--- Высота фаски 2мм
        bevelSize: bevelSize,        // <--- Ширина фаски 2мм
        bevelOffset: -bevelSize,
        bevelSegments: 1         // <--- 1 сегмент = плоский срез
    };
    return new THREE.ExtrudeGeometry(countertopShape, extrudeSettings);
}

/**
 * Обновляет ОДИН шкаф на основе текущих kitchenGlobalParams.
 * Вызывается из UpdateGlobalParamsCommand.
 * @param {Cabinet} cabinet 
 */
function updateCabinetOnGlobalChange(cabinet) {
    const { countertopHeight, countertopThickness, plinthHeight, totalHeight, apronHeight, mezzanineHeight, golaMinHeightMm } = window.kitchenGlobalParams;
    const { handleType } = window.kitchenGlobalParams;
    // Конвертируем в метры
    const countertopHeightM = countertopHeight / 1000;
    const countertopThicknessM = countertopThickness / 1000;
    const plinthHeightM = plinthHeight / 1000;
    const totalHeightM = totalHeight / 1000;
    const apronHeightM = apronHeight / 1000;
    const mezzanineHeightM = mezzanineHeight / 1000;
    
    // --- НАЧАЛО ИЗМЕНЕНИЙ ---

       // ==> НАЧАЛО НОВОГО БЛОКА <==
    // Приоритетная проверка: если это угловой шкаф, пересчитываем его геометрию
    const isCornerCabinet = (cabinet.cabinetType === 'corner' && cabinet.cabinetConfig === 'sink') || 
                            (cabinet.cabinetType === 'cornerUpper' && cabinet.cabinetConfig === 'cornerUpperStorage');

    if (isCornerCabinet) {
        console.log(`[Global Update] Пересчет углового шкафа ${cabinet.id_data} (Тип: ${cabinet.type})`);
        
        // 1. Устанавливаем правильную "дельту" (cornerElementWidth)
        const handleType = window.kitchenGlobalParams.handleType || 'standard';
        if (handleType === 'gola-profile') {
            const facadeSet = window.facadeSetsData.find(set => set.id === cabinet.facadeSet);
            const { thickness: facadeThicknessM } = MaterialManager.getMaterial(facadeSet);
            cabinet.cornerElementWidth = facadeThicknessM;
        } else {
            const facadeSet = window.facadeSetsData.find(set => set.id === cabinet.facadeSet);
            const { thickness: facadeThicknessM } = MaterialManager.getMaterial(facadeSet);
            
            if (cabinet.cornerElementWidth === undefined) {
                // Разные дефолты для верхних и нижних
                cabinet.cornerElementWidth = (cabinet.type === 'upperCabinet') ? facadeThicknessM : 0.060;
                //cabinet.cornerElementWidth = (cabinet.type === 'upperCabinet') ? 0.018 : 0.060;
            }
        }
        const DELTA_M = cabinet.cornerElementWidth;
        
        // 2. Ищем актуального соседа и "пояс" (pivot)
        const neighbor = findNearestNeighbor(cabinet);
        const pivotPositionM = calculateCornerPivotPosition(cabinet, neighbor, MaterialManager);
        cabinet.sideLength = pivotPositionM;

        // 3. Пересчитываем `width` и `offsetAlongWall` (логика универсальна)
        if (cabinet.cornerDirection === 'left') {
            const rightPartSizeM = (cabinet.facadeWidth || 0.45) + DELTA_M;
            const leftPartSizeM = pivotPositionM - cabinet.offsetAlongWall;
            cabinet.width = leftPartSizeM + rightPartSizeM;
        } else { // 'right'
            const wallLength = (cabinet.wallId === 'Back' || cabinet.wallId === 'Front') 
                ? roomDimensions.getLength() : roomDimensions.getHeight();
            
            // --- БОЛЕЕ НАДЕЖНЫЙ РАСЧЕТ ДЛЯ ПРАВОГО УГЛА ---
            // Мы не можем доверять `offsetAlongWall`, так как он мог "уехать"
            // Лучше считать отступ от правого края, который должен быть постоянным
            const offsetFromRight = wallLength - (cabinet.offsetAlongWall + cabinet.width);
            
            const rightPartSizeM = pivotPositionM - offsetFromRight;
            const leftPartSizeM = (cabinet.facadeWidth || 0.45) + DELTA_M;
            cabinet.width = leftPartSizeM + rightPartSizeM;
            cabinet.offsetAlongWall = wallLength - cabinet.width - offsetFromRight; // Пересчитываем отступ
        }
        
        console.log(`[Global Update] Новые размеры: W=${cabinet.width.toFixed(3)}, Offset=${cabinet.offsetAlongWall.toFixed(3)}`);
    }
    // ==> КОНЕЦ НОВОГО БЛОКА <==

    // Проверяем, является ли шкаф фальш-панелью
    if (cabinet.cabinetConfig === 'falsePanel') {
        // --- Логика для Фальш-панели ---
        
        const heightOption = cabinet.fp_height_option || 'cabinetHeight';
        const verticalAlign = cabinet.fp_vertical_align || 'cabinetBottom';

        // Определяем отступ снизу
        let offsetBottomM;
        if (verticalAlign === 'floor') {
            offsetBottomM = cabinet.fp_offset_from_floor || 0;
        } else { // cabinetBottom
            offsetBottomM = plinthHeightM;
        }
        cabinet.offsetBottom = offsetBottomM;

        // Определяем высоту (если она не "свободная")
        if (heightOption !== 'freeHeight') {
            let newHeightM;
            switch (heightOption) {
                case 'cabinetHeight':
                    newHeightM = countertopHeightM - countertopThicknessM - offsetBottomM;
                    break;
                case 'toGola':
                    const availableForGolaAndFacadesM = countertopHeightM - countertopThicknessM - offsetBottomM;
                    const cabHeightForGola = countertopHeightM - countertopThicknessM - plinthHeightM;
                    const golaHeightM = (typeof window.calculateActualGolaHeight === 'function')
                        ? window.calculateActualGolaHeight(golaMinHeightMm, (cabinet.facadeGap || 0.003) * 1000, cabHeightForGola) / 1000
                        : 0.058;
                    newHeightM = availableForGolaAndFacadesM - golaHeightM;
                    break;
                case 'kitchenHeight':
                    newHeightM = totalHeightM - offsetBottomM;
                    break;
                default:
                    // Если неизвестный тип, возвращаемся к высоте шкафа
                    newHeightM = countertopHeightM - countertopThicknessM - offsetBottomM;
                    break;
            }
            cabinet.height = Math.max(0.05, newHeightM); // Мин. высота 50мм
        }
        // Если высота 'freeHeight', мы НЕ трогаем cabinet.height, оно остается таким, какое задал пользователь.
        
    } else if (!cabinet.isHeightIndependent) {
        // --- Ваша существующая логика для ОБЫЧНЫХ шкафов ---
        const isTallCabinet = (cabinet.cabinetType === 'straight' && ['tallStorage', 'tallOvenMicro', 'fridge'].includes(cabinet.cabinetConfig));
        if (isTallCabinet) {
            cabinet.height = totalHeightM - plinthHeightM;
            cabinet.offsetBottom = plinthHeightM;
        } else if (cabinet.type === 'lowerCabinet') {
            cabinet.height = countertopHeightM - countertopThicknessM - plinthHeightM;
            cabinet.offsetBottom = plinthHeightM;
        } else if (cabinet.type === 'upperCabinet') {
            const topApronEdgeM = apronHeightM + countertopHeightM;
            if (cabinet.isMezzanine === 'normal') {
                cabinet.height = totalHeightM - topApronEdgeM;
                cabinet.offsetBottom = topApronEdgeM;
            } else if (cabinet.isMezzanine === 'mezzanine') {
                cabinet.height = mezzanineHeightM;
                cabinet.offsetBottom = totalHeightM - mezzanineHeightM;
            } else if (cabinet.isMezzanine === 'underMezzanine') {
                cabinet.height = totalHeightM - topApronEdgeM - mezzanineHeightM;
                cabinet.offsetBottom = topApronEdgeM;
            }
        }
    }

    // --- НОВЫЙ БЛОК ВАЛИДАЦИИ для liftUpper ---
    if (cabinet.cabinetConfig === 'liftUpper') {
        const minH = 240 / 1000;
        const maxH = 1200 / 1000;
        // Пересчитываем высоту шкафа, если она зависимая
        if (!cabinet.isHeightIndependent) {
            if (cabinet.type === 'upperCabinet') {
                const topApronEdgeM = apronHeightM + countertopHeightM;
                if (cabinet.isMezzanine === 'normal') {
                    cabinet.height = totalHeightM - topApronEdgeM;
                    cabinet.offsetBottom = topApronEdgeM;
                } else if (cabinet.isMezzanine === 'mezzanine') {
                    cabinet.height = mezzanineHeightM;
                    cabinet.offsetBottom = totalHeightM - mezzanineHeightM;
                } else if (cabinet.isMezzanine === 'underMezzanine') {
                    cabinet.height = totalHeightM - topApronEdgeM - mezzanineHeightM;
                    cabinet.offsetBottom = topApronEdgeM;
                }
            }
        }

        // Проверяем новую высоту
        if (cabinet.height < minH || cabinet.height > maxH) {
            cabinet.cabinetConfig = 'swingUpper';
            console.warn(`Шкаф ${cabinet.id_data} с подъемником вышел за пределы допустимой высоты. Конфигурация изменена.`);
            // Важно! После смены конфига нужно выйти, чтобы не выполнять логику для liftUpper
            return; 
        }

        // --- 2. НОВАЯ ЛОГИКА: Пересчет высот фасадов ---
        const construction = cabinet.liftDoorConstruction || 'single';
        const offsetTop = cabinet.doorOffsetTop / 1000 ?? 0;
        const offsetBottom = cabinet.doorOffsetBottom / 1000 ?? 0;
        const facadeGap = cabinet.facadeGap ?? (3 / 1000);
        const totalFacadeHeight = cabinet.height - offsetTop - offsetBottom;

        if (construction === 'single') {
            // Для одинарной просто обновляем высоту
            cabinet.liftTopFacadeHeight = Math.round(totalFacadeHeight * 1000);
        } else {
            // Для двойной двери сохраняем пропорцию высот.
            // 1. Получаем СТАРУЮ высоту верхнего фасада из объекта cabinet
            const topHeight_old_mm = cabinet.liftTopFacadeHeight;
            if (topHeight_old_mm === undefined) {
                // Аварийный случай: если высоты нет, делаем симметричными
                cabinet.liftTopFacadeHeight = Math.ceil((totalFacadeHeight - facadeGap) * 1000 / 2);
            } else {
                // 2. Рассчитываем СТАРУЮ высоту нижнего фасада
                // Мы не можем использовать cabinet.height, т.к. он уже НОВЫЙ.
                // Но мы можем вычислить СТАРУЮ общую высоту фасадов, сложив их.
                // `totalFacadeHeight` - это НОВАЯ общая высота.
                const topHeight_old_m = topHeight_old_mm / 1000;
                
                // Ключевой момент: мы не знаем старую `cabinet.height`. Но нам и не надо.
                // Мы знаем, что пользователь задал `liftTopFacadeHeight`. Мы можем предположить,
                // что нижний фасад занимал все остальное место.
                // Но это сложно. Давайте проще!
                
                // САМЫЙ ПРОСТОЙ И НАДЕЖНЫЙ СПОСОБ:
                // Если пользователь не задавал асимметрию, фасады должны оставаться симметричными.
                // Если задавал, то при глобальном изменении высоты кухни логично
                // сохранить высоту ВЕРХНЕГО фасада, а менять только НИЖНИЙ.
                // Это самое предсказуемое поведение.
                
                // Просто проверяем, не стал ли верхний фасад слишком большим для нового размера.
                const minBottomHeight = 240 / 1000;
                const maxTopHeight = totalFacadeHeight - facadeGap - minBottomHeight;

                if (topHeight_old_m > maxTopHeight) {
                    // Если старая высота верхнего теперь слишком большая, урезаем ее до максимума.
                    cabinet.liftTopFacadeHeight = Math.round(maxTopHeight * 1000);
                }
                // Если же старая высота в пределах нормы, мы ее НЕ ТРОГАЕМ.
                // Нижний фасад автоматически "подстроится" при отрисовке.
            }
        }
        console.log(`[Global Update] Пересчет фасадов liftUpper. Новая высота верхнего: ${cabinet.liftTopFacadeHeight}`);

        objectManager.updateCabinetRepresentation(cabinet);

    }





    // --- КОНЕЦ ИЗМЕНЕНИЙ ---

    // Пересчитываем отступ для нижних шкафов (остается без изменений)
    if (cabinet.type === 'lowerCabinet' && cabinet.wallId !== 'Bottom') {
        cabinet.offsetFromParentWall = window.calculateLowerCabinetOffset(cabinet);
    }

    // Запускаем полное обновление 3D-модели (остается без изменений)
    window.objectManager.updateCabinetRepresentation(cabinet);
}


//window.applyCountertopState = applyCountertopState;
window.updateCabinetOnGlobalChange = updateCabinetOnGlobalChange;

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
        edges.name = `${name}_edges`;
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

/**
 * Создает меш панели с ребрами из экструдированной геометрии.
 * @param {THREE.Shape} shape - 2D-контур панели.
 * @param {object} extrudeSettings - Настройки для экструзии (включая `depth`).
 * @param {THREE.Material} mat - Материал панели.
 * @param {string} orientationType - Тип ориентации толщины.
 * @param {string} name - Имя панели для отладки.
 * @returns {THREE.Mesh | null} Меш панели или null при ошибке.
 */
function createExtrudedPanel(shape, extrudeSettings, mat, orientationType, name = "extrudedPanel") {
    try {
        if (!shape || !extrudeSettings || extrudeSettings.depth <= 0) {
            console.warn(`Попытка создать экструдированную панель "${name}" с некорректными параметрами.`);
            return null;
        }

        // 1. Создаем геометрию и Mesh
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        const mesh = new THREE.Mesh(geometry, mat.clone());

        // 2. Создаем ребра "вручную"
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x333333, linewidth: 1 });
        const points = shape.getPoints();
        const extrudeDepth = extrudeSettings.depth;

        // Создаем группу для всех ребер
        const edgesGroup = new THREE.Group();
        edgesGroup.name = `${name}_edges`;

        // a) Передний контур (используем LineLoop для автоматического замыкания)
        const frontPoints3D = points.map(p => new THREE.Vector3(p.x, p.y, extrudeDepth));
        const frontLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(frontPoints3D), lineMaterial);
        edgesGroup.add(frontLine);

        // b) Задний контур
        const backPoints3D = points.map(p => new THREE.Vector3(p.x, p.y, 0));
        const backLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(backPoints3D), lineMaterial);
        edgesGroup.add(backLine);
        
        // c) Соединительные ребра по углам
        for (let i = 0; i < points.length; i++) {
            const lineGeom = new THREE.BufferGeometry().setFromPoints([frontPoints3D[i], backPoints3D[i]]);
            const edgeLine = new THREE.Line(lineGeom, lineMaterial);
            edgesGroup.add(edgeLine);
        }
        
        edgesGroup.raycast = () => {}; // Делаем все ребра "некликабельными"
        // Пробегаемся по всем дочерним линиям и отключаем у них тоже
        edgesGroup.traverse((child) => {
            if (child.isLine || child.isLineLoop || child.isLineSegments) {
                child.raycast = () => {};
            }
        });
        mesh.add(edgesGroup);

        // 3. Заполняем userData
        mesh.userData = {
             isCabinetPart: true,
             objectType: 'cabinetPart',
             orientationType: orientationType,
             edges: edgesGroup, // Сохраняем ссылку на ребра
             cabinetUUID: null
        };
        mesh.name = name;
        return mesh;

    } catch (error) {
        console.error(`Ошибка при создании экструдированной панели "${name}":`, error);
        return null;
    }
}

// Список поддерживаемых конфигураций для основной функции детализации
const generalDetailingSupportedConfigs = ['swing', 'drawers', 'falsePanel', 'oven', 
                                        'tallOvenMicro', 'fridge', 'dishwasher',
                                        'sink', 'swingUpper', 'cornerUpperStorage', 
                                        'openUpper', 'swingHood', 'liftUpper',
                                        'falsePanelUpper']; // Можно вынести как константу модуля

/**
 * Проходит по всем шкафам и переводит в детализированный вид те,
 * которые еще не детализированы и поддерживают эту операцию.
 */
function detailAllCabinets() {
    console.log("--- [detailAllCabinets] Запуск детализации всех шкафов ---");
    let detailedCount = 0;
    
    objectManager.getAllCabinets().forEach((cabinet, index) => {
        // Проверяем, что шкаф:
        // 1. Еще не детализирован.
        // 2. Его конфигурация поддерживается.
        if (!cabinet.isDetailed && generalDetailingSupportedConfigs.includes(cabinet.cabinetConfig)) {
            try {
                toggleCabinetDetail(index);
                detailedCount++;
            } catch (error) {
                console.error(`Ошибка при детализации шкафа ${index} (ID: ${cabinet.id_data}):`, error);
            }
        }
    });

    console.log(`Детализировано ${detailedCount} шкафов.`);
    hideAllDimensionInputs();
    updateHint(`Детализировано ${detailedCount} шкафов.`);
    requestRender();
}

/**
 * Проходит по всем шкафам и переводит их в упрощенный вид.
 */
function simplifyAllCabinets() {
    console.log("--- [simplifyAllCabinets] Запуск упрощения всех шкафов ---");
    let simplifiedCount = 0;
    
    objectManager.getAllCabinets().forEach((cabinet, index) => {
        // Просто проверяем, что шкаф уже детализирован
        if (cabinet.isDetailed) {
            try {
                toggleCabinetDetail(index);
                simplifiedCount++;
            } catch (error) {
                console.error(`Ошибка при упрощении шкафа ${index} (ID: ${cabinet.id_data}):`, error);
            }
        }
    });

    console.log(`Упрощено ${simplifiedCount} шкафов.`);
    hideAllDimensionInputs();
    updateHint(`Упрощено ${simplifiedCount} шкафов.`);
    requestRender();
}

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
        return createDetailedTallOvenMicroGeometry(cabinetData, kitchenGlobalParams, MaterialManager, getPanelThickness); // <--- ВЫЗОВ НОВОЙ ФУНКЦИИ
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
    } else if (
        cabinetData.cabinetType === 'corner' &&
        cabinetData.cabinetConfig === 'sink'
    ) {
        console.log(`[Dispatcher] -> Вызов createDetailedCornerSinkGeometry для угловой мойки`);
        // Создаем временную копию данных, чтобы не изменять оригинал
        const dataForDetailing = { ...cabinetData };

        // Если шкаф на левой стене, инвертируем его "внутреннее" направление
        if (dataForDetailing.wallId === 'Left') {
            dataForDetailing.cornerDirection = (dataForDetailing.cornerDirection === 'left') ? 'right' : 'left';
            console.log(`  - Обнаружена левая стена. Направление инвертировано на '${dataForDetailing.cornerDirection}' для детализации.`);
        }

        // Передаем в функцию детализации измененные данные
        return createDetailedCornerSinkGeometry(
            dataForDetailing,
            kitchenGlobalParams,
            MaterialManager,
            getPanelThickness,
            calculateActualGolaHeight // <-- Важно! Убедитесь, что эта функция доступна здесь
        );
    } else if (
        cabinetData.type === 'upperCabinet' &&
        cabinetData.cabinetConfig === 'swingUpper'
    ) {
        console.log(`[Dispatcher] -> Вызов createDetailedUpperSwingGeometry для '${cabinetData.cabinetConfig}'`);
        // Передаем все необходимые зависимости в нашу новую функцию
        return createDetailedUpperSwingGeometry(cabinetData, kitchenGlobalParams, MaterialManager, getPanelThickness);
    } else if (cabinetData.type === 'upperCabinet' && cabinetData.cabinetConfig === 'swingHood') {
        console.log(`[Dispatcher] -> Вызов createDetailedSwingHoodGeometry`);
        return createDetailedSwingHoodGeometry(cabinetData, kitchenGlobalParams, MaterialManager, getPanelThickness);
    } else if (cabinetData.cabinetType === 'cornerUpper' && cabinetData.cabinetConfig === 'cornerUpperStorage') {
        console.log(`[Dispatcher] -> Вызов createDetailedUpperCornerGeometry`);
    
        // --- НАЧАЛО ХИТРОГО ТРЮКА (как у нижнего шкафа) ---
        // Создаем временную копию данных, чтобы не изменять оригинал
        const dataForDetailing = { ...cabinetData };

        // Если шкаф на левой стене, инвертируем его "внутреннее" направление для функции детализации
        if (dataForDetailing.wallId === 'Left') {
            dataForDetailing.cornerDirection = (dataForDetailing.cornerDirection === 'left') ? 'right' : 'left';
            console.log(`  - Обнаружена левая стена. Направление для детализации инвертировано на '${dataForDetailing.cornerDirection}'.`);
        } 
        // --- КОНЕЦ ХИТРОГО ТРЮКА ---

        // Передаем в функцию детализации измененные данные
        return createDetailedUpperCornerGeometry(
            dataForDetailing, // <-- Передаем измененную копию
            kitchenGlobalParams, 
            MaterialManager, 
            getPanelThickness
        );
    } else if (cabinetData.type === 'upperCabinet' && cabinetData.cabinetConfig === 'openUpper') {
        console.log(`[Dispatcher] -> Вызов createDetailedOpenUpperGeometry`);
        return createDetailedOpenUpperGeometry(cabinetData, kitchenGlobalParams, MaterialManager, getPanelThickness);
    } else if (cabinetData.type === 'upperCabinet' && cabinetData.cabinetConfig === 'liftUpper') {
        console.log(`[Dispatcher] -> Вызов createDetailedLiftUpperGeometry`);
        // Вызываем с полным набором зависимостей
        return createDetailedLiftUpperGeometry(cabinetData, kitchenGlobalParams, MaterialManager, getPanelThickness);
    } else if (cabinetData.type === 'upperCabinet' && cabinetData.cabinetConfig === 'falsePanelUpper') {
        // Вызываем с полным набором зависимостей
        return createDetailedFalsePanelUpperGeometry(cabinetData, kitchenGlobalParams, MaterialManager, getPanelThickness);
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

    // --- Материалы ---
    const cabinetMaterial = MaterialManager.getBodyMaterial(cabinetData);
    const backPanelMaterial = new THREE.MeshStandardMaterial({
        color: 0xf0f0f0, // Светло-серый
        roughness: 0.9, metalness: 0.0
    });
    const golaMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xAAAAAA, metalness: 0.8, roughness: 0.4 }); // Алюминий
    
    // --- === ПОЛУЧАЕМ ДАННЫЕ ДЛЯ ФАСАДА === ---
    const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);

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
                    // 1. Получаем базовый материал и толщину
                    const { material: baseFacadeMaterial, thickness: facadeThicknessMeters } = MaterialManager.getMaterial(facadeSet);
                    const facadeMaterial = baseFacadeMaterial.clone();
                    // 2. Создаем панель
                    const facadeMesh = createPanel(
                        facadeInfo.width, facadeHeight, facadeThicknessMeters,
                        facadeMaterial, // <--- Передаем материал, полученный из getFacadeMaterialAndThickness
                        'frontal', `facade_swing_${index}`
                    );

                    if (facadeMesh) {
                        const facadeCenterZ = depth / 2 + facadeThicknessMeters / 2;
                        facadeMesh.position.set(facadeInfo.xOffset, facadeCenterYOffset, facadeCenterZ);
                        facadeMesh.userData.cabinetUUID = cabinetUUID;
                         // --- Работаем с текстурой КОНКРЕТНОГО меша ---
                        const actualFacadeMaterial = facadeMesh.material;
                        if (actualFacadeMaterial.map && actualFacadeMaterial.map.isTexture) {
                            // Вызываем transform, который вернет НОВУЮ текстуру
                            const transformedTexture = MaterialManager.applyTextureTransform(
                                actualFacadeMaterial.map,
                                cabinetData.textureDirection || 'vertical',
                                facadeInfo.width, // или drawerFacadeWidth
                                facadeHeight      // или fData.height
                            );
                            
                            // Присваиваем эту НОВУЮ текстуру свойству map
                            actualFacadeMaterial.map = transformedTexture;
                            actualFacadeMaterial.needsUpdate = true; // Говорим three.js обновить материал
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
                //let gapBetweenFacades = facadeGapMeters;
    
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
                const { material: baseFacadeMaterial, thickness: facadeThicknessMeters } = MaterialManager.getMaterial(facadeSet);
                const facadeMaterial = baseFacadeMaterial.clone();
                const facadeMesh = createPanel(
                    drawerFacadeWidth, fData.height, facadeThicknessMeters,
                    facadeMaterial, // <--- Передаем материал, полученный из getFacadeMaterialAndThickness
                    'frontal', `facade_drawer_${index}`
                );
                if (facadeMesh) {
                    const facadeCenterZ = depth / 2 + facadeThicknessMeters / 2;
                    facadeMesh.position.set(0, fData.yOffset, facadeCenterZ); // xOffset = 0 для ящиков
                    facadeMesh.userData.cabinetUUID = cabinetUUID;
                     // --- Работаем с текстурой КОНКРЕТНОГО меша ---
                    const actualFacadeMaterial = facadeMesh.material; // Получаем СКЛОНИРОВАННЫЙ материал
                    if (actualFacadeMaterial.map && actualFacadeMaterial.map.isTexture) {
                        // Вызываем transform, который вернет НОВУЮ текстуру
                        const transformedTexture = MaterialManager.applyTextureTransform(
                            actualFacadeMaterial.map,
                            cabinetData.textureDirection || 'vertical',
                            drawerFacadeWidth, // или drawerFacadeWidth
                            fData.height      // или fData.height
                        );
                        
                        // Присваиваем эту НОВУЮ текстуру свойству map
                        actualFacadeMaterial.map = transformedTexture;
                        actualFacadeMaterial.needsUpdate = true; // Говорим three.js обновить материал
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
function createDetailedFalsePanelGeometry(cabinetData) {

    if (cabinetData.cabinetConfig !== 'falsePanel') {
        console.warn(`[createDetailedFPGeom] Попытка создать ФП для конфига: ${cabinetData.cabinetConfig}`);
        return null;
    }

    const group = new THREE.Group();
    group.userData.isDetailedCabinet = true;
    group.userData.objectType = 'cabinet';
    const cabinetUUID = cabinetData.mesh?.uuid || THREE.MathUtils.generateUUID();
    const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
    const cabinetMaterial = MaterialManager.getBodyMaterial(cabinetData);

    const fpType = cabinetData.fp_type || 'narrow';
    const containerHeightM = cabinetData.height;
    const containerDepthM = cabinetData.depth;

    //console.log(`  - Тип ФП: ${fpType}`);
    //console.log(`  - Габариты контейнера ФП: W=${containerWidthM.toFixed(3)}, H=${containerHeightM.toFixed(3)}, D=${containerDepthM.toFixed(3)}`);

    if (containerHeightM <= 0) { // Основная проверка - высота
        console.warn(`[createDetailedFPGeom] Некорректная высота для создания ФП.`);
        return null; // Возвращаем пустую группу
    }

    if (fpType === 'narrow' || fpType === 'decorativePanel') {
        // --- УЗКАЯ или ДЕКОРАТИВНАЯ ФАЛЬШ-ПАНЕЛЬ (одна деталь) ---

        const { material: baseFacadeMaterial, thickness: facadeThicknessMeters } = MaterialManager.getMaterial(facadeSet);
        const facadeMaterial = baseFacadeMaterial.clone();

        const panelGeomWidth = facadeThicknessMeters;   // Размер геометрии по X
        const panelGeomHeight = containerHeightM;        // Размер геометрии по Y
        const panelGeomDepth = containerDepthM;         // Размер геометрии по Z

        if (panelGeomWidth <= 0 || panelGeomDepth <= 0) {
            console.warn(`[createDetailedFPGeom] Некорректные размеры для узкой/декоративной ФП.`);
            return null;
        }

        //const panelOrientation = 'vertical'; // Толщина по X геометрии
        const mainPanelMesh = createPanel(
            panelGeomWidth,
            panelGeomHeight,
            panelGeomDepth,
            facadeMaterial,
            'vertical', // Толщина по X
            `falsePanel_${fpType}`
        );

        if (mainPanelMesh) {
            mainPanelMesh.position.set(0, 0, 0); // Центрирована в группе
            mainPanelMesh.userData.cabinetUUID = cabinetUUID;

            if (mainPanelMesh.material.map && mainPanelMesh.material.map.isTexture) {
                
                // ==> ГЛАВНОЕ ИСПРАВЛЕНИЕ <==
                // Для текстуры важны размеры видимой грани.
                // У узкой панели, стоящей торцом, видимая грань имеет размеры
                // Глубина Панели x Высота Панели.
                // В терминах геометрии, это грань, перпендикулярная оси X.
                // UV-развертка на этой грани идет так: U ~ Z, V ~ Y.
                // Поэтому для правильного масштабирования мы передаем:
                const textureWidth = panelGeomDepth;  // Ширина текстуры = глубина геометрии
                const textureHeight = panelGeomHeight; // Высота текстуры = высота геометрии

                const transformedTexture = MaterialManager.applyTextureTransform(
                    mainPanelMesh.material.map,
                    cabinetData.textureDirection || 'vertical',
                    textureWidth,
                    textureHeight
                );
                mainPanelMesh.material.map = transformedTexture;
            }
            group.add(mainPanelMesh);
        }

    } else if (fpType === 'wideLeft' || fpType === 'wideRight') {
    // --- ШИРОКАЯ ФАЛЬШ-ПАНЕЛЬ (ЛЕВАЯ/ПРАВАЯ) - две детали ---

    // === ДЕТАЛЬ 1: Лицевая фальш-панель (из материала фасада) ===
    const { material: baseFacadeMaterial, thickness: facadeThicknessMeters } = MaterialManager.getMaterial(facadeSet);
    const facadeMaterial = baseFacadeMaterial.clone();

    const facadeGapMeters = cabinetData.facadeGap || 0.003;
    const facadeGapOffset = facadeGapMeters / 2;

    // Размеры геометрии лицевой панели
    const facadePartGeomWidth = cabinetData.width - facadeGapOffset; // <== Используем cabinetData.width
    const facadePartGeomHeight = containerHeightM;
    const facadePartGeomDepth = facadeThicknessMeters;

    if (facadePartGeomWidth <= 0 || facadePartGeomDepth <= 0) {
        console.warn(`[createDetailedFPGeom] Некорректные размеры для лицевой части широкой ФП.`);
        return null;
    }

    const facadePartMesh = createPanel(
        facadePartGeomWidth,
        facadePartGeomHeight,
        facadePartGeomDepth,
        facadeMaterial,
        'frontal',
        `fp_wide_facade_${fpType}`
    );

    if (facadePartMesh) {
        // ==> ИСПРАВЛЕНИЕ: Используем правильные имена переменных <==
        
        const facadePartCenterY = 0;
        // `containerDepthM` - это глубина "держателя", `facadePartGeomDepth` - толщина фасада
        const facadePartCenterZ = (containerDepthM / 2) + (facadePartGeomDepth / 2);
        let facadePartCenterX = 0;
        
        // `containerWidthM` - это ширина "держателя" (например 60мм), `facadePartGeomWidth` - ширина лицевой части
        // Но `cabinetData.width` - это общая ширина контейнера.
        const containerWidth = cabinetData.width; // <== Берем общую ширину из данных

        if (fpType === 'wideLeft') {
            facadePartCenterX = -(containerWidth / 2) + (facadePartGeomWidth / 2);
        } else { // wideRight
            facadePartCenterX = (containerWidth / 2) - (facadePartGeomWidth / 2);
        }
        
        facadePartMesh.position.set(facadePartCenterX, facadePartCenterY, facadePartCenterZ);
        facadePartMesh.userData.cabinetUUID = cabinetUUID;

        // Применяем текстуру
        if (facadePartMesh.material.map && facadePartMesh.material.map.isTexture) {
            const transformedTexture = MaterialManager.applyTextureTransform(
                facadePartMesh.material.map,
                cabinetData.textureDirection || 'vertical',
                facadePartGeomWidth,
                facadePartGeomHeight
            );
            facadePartMesh.material.map = transformedTexture;
        }
        group.add(facadePartMesh);
    }

    // === ДЕТАЛЬ 2: Держатель/Корпусная часть (остается без изменений) ===
    const holderActualWidth = getPanelThickness();
    const holderActualHeight = containerHeightM;
    const holderActualDepth = containerDepthM;

    if (holderActualWidth > 0 && holderActualHeight > 0 && holderActualDepth > 0) {
        const holderMesh = createPanel(
            holderActualWidth,
            holderActualHeight,
            holderActualDepth,
            cabinetMaterial,
            'vertical',
            `fp_wide_holder_${fpType}`
        );
        if(holderMesh) {
            const holderCenterY = 0;
            const holderCenterZ = 0;
            let holderCenterX = 0;
            const containerWidth = cabinetData.width; // <== Берем общую ширину из данных

            if (fpType === 'wideLeft') {
                holderCenterX = (containerWidth / 2) - (holderActualWidth / 2);
            } else { // wideRight
                holderCenterX = -(containerWidth / 2) + (holderActualWidth / 2);
            }
            holderMesh.position.set(holderCenterX, holderCenterY, holderCenterZ);
            holderMesh.userData.cabinetUUID = cabinetUUID;
            group.add(holderMesh);
        }
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
    const cabinetMaterial = MaterialManager.getBodyMaterial(cabinetData);
    const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
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
            const { material: baseFacadeMaterial, thickness: facadeThicknessMeters } = MaterialManager.getMaterial(facadeSet);
            const facadeMaterial = baseFacadeMaterial.clone(); // Клонируем для уникальности

            const facadeMesh = createPanel(
                mainFacadeWidthM,
                mainFacadeHeightM_calc, // Используем рассчитанную высоту полотна
                facadeThicknessMeters,
                facadeMaterial,
                'frontal',
                `oven_main_facade_${cabinetUUID.substring(0,4)}`
            );
            if (facadeMesh) {
                const facadeCenterZ = (cabDepthM / 2) + (facadeThicknessMeters / 2);
                facadeMesh.position.set(0, mainFacadeCenterY, facadeCenterZ);
                facadeMesh.userData.cabinetUUID = cabinetUUID;
                // ... (код наложения текстуры, он остается без изменений) ...
                const actualFacadeMaterial = facadeMesh.material; 
                if (facadeMesh.material.map && facadeMesh.material.map.isTexture) {
                    const transformedTexture = MaterialManager.applyTextureTransform(
                        facadeMesh.material.map,
                        cabinetData.textureDirection || 'vertical',
                        mainFacadeWidthM,
                        mainFacadeHeightM_calc
                    );
                    facadeMesh.material.map = transformedTexture;
                    facadeMesh.material.needsUpdate = true;
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

        const { material: baseFacadeMaterial, thickness: facadeThicknessMeters } = MaterialManager.getMaterial(facadeSet);
        const facadeMaterial = baseFacadeMaterial.clone();

        const fpTopWidthM = mainFacadeWidthM; // Эта переменная рассчитана ранее
        const fpTopHeightM = extraOffsetTopM; // Высота = величине опуска
        const fpTopDepthM = facadeThicknessMeters; // Глубина = ТОЛЬКО ЧТО ПОЛУЧЕННАЯ толщина фасада

        if (fpTopWidthM > 0.01 && fpTopHeightM > 0.001) { // Минимальные размеры для создания

            const { material: baseFacadeMaterial, thickness: facadeThicknessMeters } = MaterialManager.getMaterial(facadeSet);
            const facadeMaterial = baseFacadeMaterial.clone();

            const fpTopMesh = createPanel(
                fpTopWidthM,
                fpTopHeightM,
                fpTopDepthM,
                facadeMaterial, // Используем тот же материал, что и для основного фасада
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
                //const actualFillerMaterial = fpTopMesh.material;
                if (fpTopMesh.material.map && fpTopMesh.material.map.isTexture) {
                    const transformedTexture = MaterialManager.applyTextureTransform(
                        fpTopMesh.material.map,
                        cabinetData.textureDirection || 'vertical',
                        fpTopWidthM,
                        fpTopHeightM 
                    );
                    if (transformedTexture) {
                        fpTopMesh.material.map = transformedTexture;
                        fpTopMesh.material.needsUpdate = true;
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
    const cabinetMaterial = MaterialManager.getBodyMaterial(cabinetData);

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
    const textureDirection_B8 = cabinetData.textureDirection || 'vertical';
    const facadeGapM_B8 = (cabinetData.facadeGap || 3 / 1000) ; // Используем сохраненный зазор, дефолт 3мм

    const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);

    // Общая ширина для всех фасадов
    // Ваше описание: "ширина шкафа минус один зазор между фасадами"
    // Если это означает, что фасад один по ширине и он чуть уже шкафа на величину одного зазора:
    let facadeWidth_B8 = cabWidthM - facadeGapM_B8;
    // Если же имелось в виду, что зазоры по бокам от корпуса, то:
    // facadeWidth_B8 = cabWidthM - 2 * facadeGapM_B8;
    // Оставляю ваш вариант:
    console.log(`    [Блок 8] Общая ширина фасадов: ${facadeWidth_B8.toFixed(3)} (cabWidthM=${cabWidthM.toFixed(3)} - facadeGapM_B8=${facadeGapM_B8.toFixed(3)})`);


    // Z-координата центральной плоскости фасадов
    //const facadeCenterZ_B8 = cabDepthM / 2 + facadeThicknessMeters_B8 / 2;

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

        const { material: baseFacadeMaterial, thickness: facadeThicknessMeters } = MaterialManager.getMaterial(facadeSet);
        const facadeMaterial = baseFacadeMaterial.clone();

        const facadeMesh = createPanel(
            facadeWidth_B8,
            facadeHeightM,
            facadeThicknessMeters, // <== Используем новую, правильную толщину
            facadeMaterial,        // <== Используем новый, уникальный материал
            'frontal',
            `facade_${facadeInfo.nameSuffix}_fridge_${cabinetUUID.substring(0,4)}`
        );

        if (facadeMesh) {
            // Позиционирование
            facadeMesh.position.x = 0;
            facadeMesh.position.y = currentY_bottom_plane_of_facade + facadeHeightM / 2;
            facadeMesh.position.z = cabDepthM / 2 + facadeThicknessMeters / 2;

            facadeMesh.userData.cabinetUUID = cabinetUUID;
            facadeMesh.userData.isFacade = true;

            // Применение текстуры
            //const actualFacadeMaterial = facadeMesh.material;
            if (facadeMesh.material.map && facadeMesh.material.map.isTexture) {
                const transformedTexture = MaterialManager.applyTextureTransform(
                    facadeMesh.material.map,
                    textureDirection_B8,
                    facadeWidth_B8,
                    facadeHeightM
                );
                facadeMesh.material.map = transformedTexture;
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
                    handleMesh_tv9.position.z = facadeMesh.position.z - facadeThicknessMeters / 2;

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
    const cabinetMaterial = MaterialManager.getBodyMaterial(cabinetData);
    // Материал для фасада
    const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
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

        const { material: baseFacadeMaterial, thickness: facadeThicknessMeters } = MaterialManager.getMaterial(facadeSet);
        const facadeMaterial = baseFacadeMaterial.clone();

        const facadeMesh = createPanel(
            facadeWidth, facadeHeight, facadeThicknessMeters,
            facadeMaterial, // Передаем материал для клонирования
            'frontal', `facade_dishwasher`
        );

        if (facadeMesh) {
            // Позиция фасада: спереди шкафа
            const facadeCenterZ = depth / 2 + facadeThicknessMeters / 2;
            facadeMesh.position.set(0, facadeCenterYOffset, facadeCenterZ); // X=0 т.к. один фасад
            facadeMesh.userData.cabinetUUID = cabinetUUID;

            // Наложение текстуры (как в вашей функции)
            //const actualFacadeMaterial = facadeMesh.material;
            if (facadeMesh.material.map && facadeMesh.material.map.isTexture) {
                const textureDirection = cabinetData.textureDirection || 'vertical';
                const transformedTexture = MaterialManager.applyTextureTransform(
                    facadeMesh.material.map, 
                    textureDirection, 
                    facadeWidth, 
                    facadeHeight
                );
                facadeMesh.material.map = transformedTexture;
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
    const cabinet = objectManager.getAllCabinets()[cabinetIndex];
    if (!cabinet) { /*...*/ return; } // Добавим проверку cabinet
    const currentMeshOrGroup = cabinet.mesh;
    
    const wasSelected = selectedCabinets.includes(cabinet);
    //hideAllDimensionInputs();
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
            const bodySet = {
                materialType: 'ldsp',
                texture: cabinet.bodyMaterial 
            };
            const simpleMaterial = MaterialManager.getFallbackMaterial(bodySet);
            const simpleMesh = new THREE.Mesh(simpleGeometry, simpleMaterial);
            simpleMesh.uuid = cabinet.mesh.uuid;

            simpleMesh.userData.cabinet = cabinet;

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
                 if (cabinet.cabinetType === 'corner') {
                     // Нижний угловой
                     showCornerCabinetDimensions(cabinet);
                 } else if (cabinet.cabinetType === 'cornerUpper') {
                     // Верхний угловой
                     showUpperCornerCabinetDimensions(cabinet);
                 } else if (cabinet.type === 'freestandingCabinet') {
                     // Отдельно стоящий
                     showFreestandingCabinetDimensions(cabinet, objectManager.getAllCabinets());
                 } else if (['lowerCabinet', 'upperCabinet'].includes(cabinet.type)) {
                     // Стандартные прямые шкафы
                     showCabinetDimensionsInput(cabinet, objectManager.getAllCabinets());
                 }
                 updateDimensionsInputPosition(cabinet, objectManager.getAllCabinets());
            }
            const button = document.getElementById('toggleDetailBtn');
            if (button) button.textContent = 'Показать детали';
            // updateHint("Показан простой вид шкафа");

            const hasIntersection = checkCabinetIntersections(cabinet);
            applyIntersectionColor(cabinet.mesh, hasIntersection);

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


/**
 * Запускает полное перестроение всех объектов сцены на основе
 * текущих глобальных параметров. Аналогично нажатию "Применить"
 * в меню глобальных настроек, но без считывания новых значений.
 */
function rebuildScene() {
    console.log("--- [rebuildScene] Запущено полное перестроение модели ---");

    // Мы создаем команду, где "старые" и "новые" параметры одинаковы.
    // Это заставит команду просто переприменить текущие глобальные настройки
    // ко всем объектам, "починив" их состояние.
    const currentGlobalParams = { ...kitchenGlobalParams };
    
    const command = new UpdateGlobalParamsCommand(currentGlobalParams, currentGlobalParams);
    
    // Выполняем команду. Важно, что мы НЕ добавляем ее в историю,
    // так как это "корректирующее" действие, а не новое действие пользователя.
    // Мы просто "вручную" вызываем ее метод execute.
    command.execute();
    
    // Запрашиваем перерисовку.
    requestRender();
    
    updateHint("Модель перестроена.");
}

export {
    //applyTextureTransform,
    createPanel,
    createGolaProfileMesh,
    calculateActualGolaHeight,
    getPanelThickness,
    getPreloadedModelClone,
    kitchenGlobalParams
    // ... и любые другие функции, которые понадобятся в будущем
};




// Привязка слушателей
// Экспорт функций в window для доступа из HTML (onclick)
// Основные функции
//window.globalSaveState = saveState; // Делаем ее доступной глобально
//window.addObject = addObject;
//window.undoLastAction = undoLastAction;
window.scene = scene;

window.setLeftView = setLeftView;
window.setFrontView = setFrontView;
window.setTopView = setTopView;
window.setIsometricView = setIsometricView;
window.saveProject = saveProject;
window.loadProject = loadProject;
// Функции для окон/дверей/розеток
window.applyObjectChanges = applyObjectChanges;
window.deleteWindow = deleteWindow;
window.addAdjacentSocket = addAdjacentSocket;
// Функции для шкафов
window.applyCabinetChanges = applyCabinetChanges;
window.deleteCabinet = deleteCabinet;
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
window.windows = windows;
window.countertops = countertops;

window.calculateLowerCabinetOffset = calculateLowerCabinetOffset;
window.objectTypes = objectTypes; // Экспортируем objectTypes, т.к. он нужен для дефолтов

window.updateCabinetPosition = updateCabinetPosition;
window.checkCabinetIntersections = checkCabinetIntersections;
window.calculateActualGolaHeight = calculateActualGolaHeight;
window.getPanelThickness = getPanelThickness;
window.updateCabinetPosition = updateCabinetPosition;
window.applyChangesAndPrepareForConfigMenu = applyChangesAndPrepareForConfigMenu;
window.showCabinetConfigMenu = showCabinetConfigMenu;
window.prepareCabinetForNewConfig = prepareCabinetForNewConfig;
window.applyConfigMenuSettings = applyConfigMenuSettings;
window.kitchenGlobalParams = kitchenGlobalParams;
window.objectManager = objectManager; // <--- ДОБАВЬТЕ ЭТУ СТРОКУ
window.hideAllDimensionInputs = hideAllDimensionInputs;
window.requestRender = requestRender;
window.getCountertopDepthForWall = getCountertopDepthForWall;

window.rebuildScene = rebuildScene;
window.currentWidth = currentWidth;
window.floorGenerator = floorGenerator;
//window.updateCountertop3D = updateCountertop3D;
window.createCountertopApplianceFromData = createCountertopApplianceFromData;
window.replaceApplianceModel = replaceApplianceModel;
window.createCountertopAppliance = createCountertopAppliance;
window.getPreloadedModelClone = getPreloadedModelClone;

