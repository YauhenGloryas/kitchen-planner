import * as THREE from 'three'; // Импорт ядра Three.js

import { scene, camera, orthoCamera, renderer, activeCamera, setActiveSceneCamera } from './sceneSetup.js'; // Возможно, понадобится renderer для aspect ratio в ortho камере
import { directionalLight } from './sceneSetup.js';
//import { updateFaceBounds } from './script.js';

let cube, edges;
let selectedFaceIndex = -1;
let currentLength = 1, currentWidth = 1, currentHeight = 1;
const roomDimensions = { // Объект для экспорта
    getLength: () => currentLength,
    getWidth: () => currentWidth,   // Это Y-размер комнаты (высота)
    getHeight: () => currentHeight, // Это Z-размер комнаты (глубина)
    // Можно добавить и сеттеры, если нужно менять их извне, но обычно это делает createCube
};
let materials = [];

// Переменные для DOM-элементов, инициализируются в initRoomManagerDOM
let selectedFaceDisplayInput_RM; // Переименовал, чтобы было ясно, что это переменная модуля
let wallEditMenu_RM;
let lowerCabinetContainer_RM;

let lengthInput, heightInput, widthInput, cubeColorInput;
let rotateXSlider, rotateYSlider, zoomSlider;
let rotateXValue, rotateYValue, selectedFaceDisplayInput;

const faceNormals = [
    { id: "Right", normal: new THREE.Vector3(1, 0, 0) },
    { id: "Left", normal: new THREE.Vector3(-1, 0, 0) },
    { id: "Top", normal: new THREE.Vector3(0, 1, 0) },
    { id: "Bottom", normal: new THREE.Vector3(0, -1, 0) },
    { id: "Front", normal: new THREE.Vector3(0, 0, 1) },
    { id: "Back", normal: new THREE.Vector3(0, 0, -1) }
];

const selectedFaceDisplay = document.getElementById('selectedFace');

// --- НОВЫЕ КОНСТАНТЫ ДЛЯ ЗУМА КОЛЕСОМ ---
const ZOOM_SPEED_PERSPECTIVE_RM = 0.5; 
const MIN_Z_PERSPECTIVE_RM = 1;      
const MAX_Z_PERSPECTIVE_RM = 50;     

const ZOOM_SPEED_ORTHOGRAPHIC_RM = 0.1; 
const MIN_ZOOM_ORTHO_RM = 0.1;         
const MAX_ZOOM_ORTHO_RM = 5.0;  

// --- Локальная функция для обновления отображения углов ---
function updateRotationDisplayLocal() {
    if (rotateXValue && rotateXSlider) { // Проверяем, что элементы существуют
        rotateXValue.value = `${Math.round(parseFloat(rotateXSlider.value))}°`;
    }
    if (rotateYValue && rotateYSlider) {
        rotateYValue.value = `${Math.round(parseFloat(rotateYSlider.value))}°`;
    }
}

export function initRoomManagerDOM() {
    // Получаем ссылки на DOM-элементы, которые будут использоваться функциями этого модуля
    cubeColorInput = document.getElementById('cubeColor'); // Получаем ссылку на input цвета
    lengthInput = document.getElementById('length');
    heightInput = document.getElementById('height');
    widthInput = document.getElementById('width');
    cubeColorInput = document.getElementById('cubeColor');
    selectedFaceDisplayInput = document.getElementById('selectedFace'); // Инициализация здесь
    zoomSlider = document.getElementById('zoom');
    selectedFaceDisplayInput_RM = document.getElementById('selectedFace'); // Инициализируем переменную модуля
    wallEditMenu_RM = document.getElementById('wallEditMenu');
    lowerCabinetContainer_RM = document.getElementById('lowerCabinetContainer');
    cubeColorInput_RM = document.getElementById('cubeColor');
    faceBoundsTable_RM = document.getElementById('faceBoundsTable');
    //console.log("[roomManager.js] Element with ID 'zoom' in initRoomManagerDOM:", zoomSlider);

       // --- ДОБАВЛЕНИЕ ОБРАБОТЧИКА 'wheel' ДЛЯ ЗУМА ---
    if (renderer && renderer.domElement) { // Убедимся, что рендерер доступен
        renderer.domElement.addEventListener('wheel', function(event) {
            event.preventDefault(); 

            if (!activeCamera) return; // activeCamera импортируется из sceneSetup

            let zoomDirectionFactor = 0; // Переименовал для ясности
            if (event.deltaY < 0) {
                zoomDirectionFactor = 1; // Приближение
            } else if (event.deltaY > 0) {
                zoomDirectionFactor = -1; // Отдаление
            }

            if (zoomDirectionFactor === 0) return;

            if (activeCamera.isPerspectiveCamera) {
                let newZ = activeCamera.position.z - zoomDirectionFactor * ZOOM_SPEED_PERSPECTIVE_RM;
                // newZ = Math.max(MIN_Z_PERSPECTIVE_RM, Math.min(MAX_Z_PERSPECTIVE_RM, newZ)); // Ограничения
                activeCamera.position.z = newZ;

                if (directionalLight) { // directionalLight импортируется из sceneSetup
                     directionalLight.position.z = newZ; // Обновляем свет, если он привязан к Z камеры
                }

                if (zoomSlider) { // zoomSlider - переменная этого модуля, инициализированная выше
                    zoomSlider.value = activeCamera.position.z;
                    // Если есть функция обновления текстового поля зума, которая тоже в этом модуле:
                    // updateZoomDisplayLocal(); 
                }

            } else if (activeCamera.isOrthographicCamera) {
                let newOrthoZoom = activeCamera.zoom + zoomDirectionFactor * ZOOM_SPEED_ORTHOGRAPHIC_RM * activeCamera.zoom;
                // newOrthoZoom = Math.max(MIN_ZOOM_ORTHO_RM, Math.min(MAX_ZOOM_ORTHO_RM, newOrthoZoom)); // Ограничения
                
                activeCamera.zoom = newOrthoZoom;
                activeCamera.updateProjectionMatrix();

                if (zoomSlider) {
                    // Логика обновления слайдера для орто-камеры (если нужна и если она корректна)
                    // Пока закомментирована, как и ранее
                    /*
                    let sliderValueEquivalent;
                    if (newOrthoZoom >= 1) {
                        sliderValueEquivalent = 10 - (newOrthoZoom - 1) / MAX_ZOOM_ORTHO_RM * 9; 
                    } else {
                        sliderValueEquivalent = 10 + (1 - newOrthoZoom) / (1 - MIN_ZOOM_ORTHO_RM) * 10; 
                    }
                    // zoomSlider.value = Math.max(parseFloat(zoomSlider.min), Math.min(parseFloat(zoomSlider.max), sliderValueEquivalent));
                    // updateZoomDisplayLocal(); 
                    */
                }
            }
            
            // Вызов функции обновления границ (она должна быть определена в этом файле или импортирована)
            if (typeof updateFaceBounds_RM === 'function') { 
                updateFaceBounds_RM();
            }

        }, { passive: false });
        console.log("[roomManager] Обработчик 'wheel' для зума добавлен.");
    } else {
        console.error("[roomManager] Не удалось добавить обработчик 'wheel': renderer или renderer.domElement не найдены.");
    }
    // --- КОНЕЦ ДОБАВЛЕНИЯ ОБРАБОТЧИКА 'wheel' ---

    // --- СЛУШАТЕЛИ СОБЫТИЙ ТЕПЕРЬ ЗДЕСЬ ---
    /*
    if (zoomSlider) {
        zoomSlider.addEventListener('input', () => {
            if (cube && camera && orthoCamera && activeCamera && directionalLight) { // Добавил directionalLight в проверку
                const zoomValue = parseFloat(zoomSlider.value);
                if (activeCamera === camera) {
                    camera.position.z = zoomValue;
                    directionalLight.position.set(0, 0, camera.position.z); // Обновляем позицию света
                    camera.updateProjectionMatrix();
                } else if (activeCamera === orthoCamera) {
                    // Ваша логика зума для орто камеры
                    let newOrthoZoom = 1;
                    if (zoomValue < 10) newOrthoZoom = 1 - ((10 - zoomValue) / 9 * 0.8);
                    else if (zoomValue > 10) newOrthoZoom = 1 + ((zoomValue - 10) / 10 * 1.0);
                    orthoCamera.zoom = Math.max(0.1, newOrthoZoom);
                    orthoCamera.updateProjectionMatrix();
                }

                if (typeof updateFaceBounds_RM === 'function') updateFaceBounds_RM();

            }
        });
    } else {
        console.warn("DOM element with ID 'zoom' not found in initRoomManagerDOM.");
    }
    */
    // Добавьте здесь слушатели для rotateXSlider и rotateYSlider таким же образом
    rotateXSlider = document.getElementById('rotateX');
    if (rotateXSlider) {
        rotateXSlider.addEventListener('input', () => {
            if (cube) {
                cube.rotation.x = THREE.MathUtils.degToRad(parseFloat(rotateXSlider.value));
                if (edges) edges.rotation.x = cube.rotation.x;
                if (typeof updateRotationDisplayLocal === 'function') updateRotationDisplayLocal(); // Если есть локальная
                if (typeof updateEdgeColors_RM === 'function') updateEdgeColors_RM();
                if (typeof updateFaceBounds_RM === 'function') updateFaceBounds_RM();
            }
        });
    }

    rotateYSlider = document.getElementById('rotateY');
    if (rotateYSlider) {
        rotateYSlider.addEventListener('input', () => {
            if (cube) {
                cube.rotation.y = THREE.MathUtils.degToRad(parseFloat(rotateYSlider.value));
                if (edges) edges.rotation.y = cube.rotation.y;
                if (typeof updateRotationDisplayLocal === 'function') updateRotationDisplayLocal();
                if (typeof updateEdgeColors_RM === 'function') updateEdgeColors_RM();
                if (typeof updateFaceBounds_RM === 'function') updateFaceBounds_RM();
            }
        });
    }
    
    // Инициализация rotateXValue, rotateYValue
    rotateXValue = document.getElementById('rotateXValue');
    rotateYValue = document.getElementById('rotateYValue');

    // Инициализация UI
    
    // Вызываем функции, которые должны обновить UI при инициализации
    if (typeof updateRotationDisplayLocal === 'function') updateRotationDisplayLocal();
    if (typeof updateSelectedFaceDisplay_RM === 'function') updateSelectedFaceDisplay_RM();
    if (typeof updateEdgeColors_RM === 'function') updateEdgeColors_RM();
    if (typeof updateFaceBounds_RM === 'function') updateFaceBounds_RM();
}

function adjustCameraAndScale(length, height, width) {
    const maxDimension = Math.max(length, height, width);
    const scaleFactor = 4 / maxDimension;
    cube.scale.set(scaleFactor, scaleFactor, scaleFactor);
    edges.scale.set(scaleFactor, scaleFactor, scaleFactor);
    const zoomValue = parseFloat(zoomSlider.value);
    camera.position.z = zoomValue;
    directionalLight.position.set(0, 0, zoomValue);
    camera.updateProjectionMatrix();
    if (typeof updateFaceBounds_RM === 'function') updateFaceBounds_RM();
}

// Эту функцию мы определим здесь, так как она специфична для настройки орто-видов комнаты
function setupOrthoCameraViewRM(viewType) {
    if (!orthoCamera || !renderer || !scene) {
        console.error("setupOrthoCameraViewRM: Отсутствуют orthoCamera, renderer или scene.");
        return;
    }
    setActiveSceneCamera(orthoCamera); // Устанавливаем ортографическую камеру как активную
    // console.log(`[roomManager] Переключение на ортографическую камеру для вида: ${viewType}`);

    // --- СБРОС ЗУМА ОРТОГРАФИЧЕСКОЙ КАМЕРЫ НА ДЕФОЛТ ---
    orthoCamera.zoom = 1; // Устанавливаем зум в 1 (без увеличения/уменьшения)
    console.log(`  [OrthoSetup] orthoCamera.zoom сброшен на 1.`);
    // --- КОНЕЦ СБРОСА ЗУМА ---

    // Определяем размер сцены для настройки frustum
    const roomSizeForView = Math.max(currentLength, currentWidth, currentHeight, 1); // Базовый размер, минимум 1
    const zoomFactor = 1.2; // Небольшой отступ по краям
    let targetFrustumSize = roomSizeForView * zoomFactor;


    const aspect = renderer.domElement.clientWidth / renderer.domElement.clientHeight;
    orthoCamera.left = targetFrustumSize * aspect / -2;
    orthoCamera.right = targetFrustumSize * aspect / 2;
    orthoCamera.top = targetFrustumSize / 2;
    orthoCamera.bottom = targetFrustumSize / -2;
    orthoCamera.near = 0.1;
    orthoCamera.far = 1000;

    const distance = roomSizeForView * 5; // Отодвинем камеру

    switch (viewType) {
        case 'Left': // Смотрим на грань -X комнаты (из +X глобально)
            orthoCamera.position.set(distance, 0, 0);
            orthoCamera.up.set(0, 1, 0); // Y - вверх
            break;
        case 'Right': // Смотрим на грань +X комнаты (из -X глобально) - ДОБАВЛЕНО ДЛЯ ПОЛНОТЫ
            orthoCamera.position.set(-distance, 0, 0);
            orthoCamera.up.set(0, 1, 0);
            break;
        case 'Front': // Смотрим на грань -Z комнаты ("Back" по faceNormals, из +Z глобально)
            orthoCamera.position.set(0, 0, distance);
            orthoCamera.up.set(0, 1, 0); // Y - вверх
            break;
        case 'Back': // Смотрим на грань +Z комнаты ("Front" по faceNormals, из -Z глобально) - ДОБАВЛЕНО ДЛЯ ПОЛНОТЫ
            orthoCamera.position.set(0, 0, -distance);
            orthoCamera.up.set(0, 1, 0);
            break;
        case 'Top': // Смотрим на грань +Y комнаты (потолок, из +Y глобально)
            orthoCamera.position.set(0, distance, 0);
            orthoCamera.up.set(0, 0, -1); // -Z это "вперед" на виде сверху (чтобы +X было вправо)
            break;
        case 'Bottom': // Смотрим на грань -Y комнаты (пол, из -Y глобально) - ДОБАВЛЕНО ДЛЯ ПОЛНОТЫ
            orthoCamera.position.set(0, -distance, 0);
            orthoCamera.up.set(0, 0, 1); // +Z это "вперед" на виде снизу
            break;
        default:
            console.warn("Неизвестный тип вида для ортографической камеры:", viewType);
            return;
    }
    orthoCamera.lookAt(scene.position); // Смотрим на центр сцены (0,0,0)
    orthoCamera.updateProjectionMatrix();

    // Функции обновления UI, которые должны вызываться ПОСЛЕ смены камеры
    // updateRendererAndPostprocessingCamera(); // Эту функцию будет вызывать script.js
    if (typeof updateFaceBounds_RM === 'function') updateFaceBounds_RM();
    if (typeof updateEdgeColors_RM === 'function') updateEdgeColors_RM();
}

export function setLeftView() {
    if (!cube) { console.warn("setLeftView: cube is not defined"); return; }
    setupOrthoCameraViewRM('Left'); // Вызываем локальную функцию настройки орто-камеры

    // Сбрасываем вращение куба для чистого вида
    cube.rotation.set(0, 0, 0);
    if (edges) edges.rotation.copy(cube.rotation);

    // Обновляем UI слайдеров
    if (rotateXSlider) rotateXSlider.value = 0;
    if (rotateYSlider) rotateYSlider.value = 0;
    updateRotationDisplayLocal(); // Обновляем текстовые поля углов
    // updateEdgeColorsLocal(); // Уже вызывается из setupOrthoCameraViewRM
    // updateFaceBoundsLocal(); // Уже вызывается из setupOrthoCameraViewRM
}

export function setFrontView() {
    if (!cube) { console.warn("setFrontView: cube is not defined"); return; }
    setupOrthoCameraViewRM('Front'); // 'Front' в контексте Three.js обычно вид с +Z

    cube.rotation.set(0, 0, 0);
    if (edges) edges.rotation.copy(cube.rotation);

    if (rotateXSlider) rotateXSlider.value = 0;
    if (rotateYSlider) rotateYSlider.value = 0;
    updateRotationDisplayLocal();
}

export function setTopView() {
    if (!cube) { console.warn("setTopView: cube is not defined"); return; }
    setupOrthoCameraViewRM('Top');

    // Вращение куба для вида сверху обычно не имеет значения, но для консистентности можно сбросить
    cube.rotation.set(0, 0, 0);
    if (edges) edges.rotation.copy(cube.rotation);

    if (rotateXSlider) rotateXSlider.value = 0;
    if (rotateYSlider) rotateYSlider.value = 0;
    updateRotationDisplayLocal();
}

export function setIsometricView() { // Или set3DView
    if (!cube || !camera || !scene) { // camera и scene импортированы
        console.warn("setIsometricView: cube, camera, or scene is not defined");
        return;
    }
    setActiveSceneCamera(camera); // Переключаемся обратно на перспективную
    // console.log("[roomManager] Переключение на перспективную камеру.");

    // Восстанавливаем FOV и стандартную позицию/вращение для перспективной камеры
    camera.fov = 30;
    camera.position.set(0, 0, 10); // Стандартная позиция
    camera.up.set(0, 1, 0);
    camera.lookAt(scene.position); // scene.position обычно (0,0,0)
    camera.updateProjectionMatrix();

    // Восстанавливаем вращение куба для изометрии
    cube.rotation.x = THREE.MathUtils.degToRad(30);
    cube.rotation.y = THREE.MathUtils.degToRad(-30);
    if (edges) edges.rotation.copy(cube.rotation);

    // Обновляем UI слайдеров
    if (rotateXSlider) rotateXSlider.value = 30;
    if (rotateYSlider) rotateYSlider.value = -30;
    updateRotationDisplayLocal();
    

    // Функции обновления UI, которые должны вызываться ПОСЛЕ смены камеры
    // updateRendererAndPostprocessingCamera(); // Эту функцию будет вызывать script.js
    if (typeof updateFaceBounds_RM === 'function') updateFaceBounds_RM();
    if (typeof updateEdgeColors_RM === 'function') updateEdgeColors_RM();
}

const roomRaycaster = new THREE.Raycaster(); // Локальный raycaster для комнаты

function handleRoomClick(mouseNDC, currentActiveCamera) { // Принимаем NDC мыши и активную камеру
    if (!cube || !currentActiveCamera) {
        // console.warn("handleRoomClick: Куб или активная камера не определены.");
        return false; // Клик не обработан
    }

    roomRaycaster.setFromCamera(mouseNDC, currentActiveCamera);
    const intersects = roomRaycaster.intersectObject(cube, false); // Raycast только по кубу

    if (intersects.length > 0) {
        const intersect = intersects[0];
        // Вызываем функцию из roomManager для определения грани
        const clickedFaceIdx = determineClickedWallFace_OldLogic(intersect, mouseNDC); // mouseNDC уже есть
        setRoomSelectedFace(clickedFaceIdx); // Устанавливаем выбранную грань
        // console.log("[roomManager] Клик по стене обработан, выбрана грань:", selectedFaceIndex);
        return true; // Клик был по комнате
    }
    // console.log("[roomManager] Клик не попал в комнату.");
    return false; // Клик не попал в комнату
}

function createCube(length, height, width, color, rotationX = 0, rotationY = 0) {
    //console.log("--- Начинаем createCube ---");

    const detailedCabinetData = []; // Сохраняем { uuid, index, oldMesh: group }
    let newCube = null; // Локальная переменная для нового куба
    let newEdges = null; // Локальная переменная для новых ребер

    try { // Оборачиваем основную часть создания куба
        // --- Блок 1: Запоминаем детализированные ---
        //const detailedCabinetData = [];
        if (typeof cabinets !== 'undefined' && Array.isArray(cabinets)) {
            cabinets.forEach((cabinet, index) => {
                if (cabinet.isDetailed && cabinet.mesh && cabinet.mesh.isGroup) {
                    detailedCabinetData.push({ uuid: cabinet.mesh.uuid, index: index, oldMesh: cabinet.mesh });
                    //console.log(`[createCube] Запомнен дет. UUID: ${cabinet.mesh.uuid}`);
                    if (cabinet.mesh.parent) cabinet.mesh.parent.remove(cabinet.mesh);
                } else if (cabinet.isDetailed) {
                     console.warn(`[createCube] Шкаф ${index} помечен дет., но mesh некорректен.`);
                     cabinet.isDetailed = false; cabinet.mesh = null;
                }
            });
             //console.log(`[createCube] Запомнено ${detailedCabinetData.length} дет. шкафов.`);
        } else { console.log("[createCube] Массив 'cabinets' не инициализирован (1)."); }

        // --- Блок 2: Удаление старого куба и создание нового ---
        if (cube) scene.remove(cube); 
        if (edges) scene.remove(edges); 

        //console.log("[createCube] Создание геометрии и материалов...");
        const geometry = new THREE.BoxGeometry(length, height, width);
        geometry.groups.forEach((group, index) => group.materialIndex = index);
        materials = [ /* ... создание материалов ... */
            new THREE.MeshPhongMaterial({ color: color, side: THREE.BackSide }), new THREE.MeshPhongMaterial({ color: color, side: THREE.BackSide }),
            new THREE.MeshPhongMaterial({ color: color, side: THREE.BackSide }), new THREE.MeshPhongMaterial({ color: color, side: THREE.BackSide }),
            new THREE.MeshPhongMaterial({ color: color, side: THREE.BackSide }), new THREE.MeshPhongMaterial({ color: color, side: THREE.BackSide }) ];

        //console.log("[createCube] Создание newCube Mesh...");
        newCube = new THREE.Mesh(geometry, materials); // Присваиваем ЛОКАЛЬНОЙ переменной
        newCube.rotation.x = rotationX; newCube.rotation.y = rotationY;
        scene.add(newCube); // Добавляем новый куб в сцену
        //console.log("[createCube] newCube создан и добавлен в сцену.");

        //console.log("[createCube] Создание newEdges...");
        const edgesGeometry = new THREE.EdgesGeometry(geometry);
        const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
        newEdges = new THREE.LineSegments(edgesGeometry, edgesMaterial); // Присваиваем ЛОКАЛЬНОЙ переменной
        newEdges.rotation.x = rotationX; newEdges.rotation.y = rotationY;
        scene.add(newEdges); // Добавляем новые ребра в сцену
        //console.log("[createCube] newEdges созданы и добавлены в сцену.");

    } catch (error) {
        console.error("!!! КРИТИЧЕСКАЯ ОШИБКА при создании базового куба или ребер:", error);
        // Если базовый куб не создан, дальше идти бессмысленно
        cube = null; // Убедимся, что глобальная переменная сброшена
        edges = null;
        return; // Прерываем выполнение функции
    }

    // --- Присваиваем глобальные переменные ПОСЛЕ успешного создания ---
    cube = newCube;
    edges = newEdges;
    //console.log("[createCube] Глобальные 'cube' и 'edges' установлены.");

    // Обновляем глобальные размеры и UI
    currentLength = length; currentWidth = height; currentHeight = width;
    selectedFaceIndex = -1; updateSelectedFaceDisplay_RM();
    adjustCameraAndScale(length, height, width); updateFaceBounds_RM();

    // --- Блок 3: Обработка ОКОН ---
     //console.log("[createCube] Обработка окон...");
     if (typeof windows !== 'undefined' && Array.isArray(windows)) {
         windows.forEach(obj => {
             try { // Обернем обработку каждого окна
                 if (!obj.mesh) return;
                 // Удалять из старой сцены не нужно, т.к. старый куб удален
                 cube.add(obj.mesh); // Добавляем в НОВЫЙ куб
                 // ... (Обновление позиции/ребер окон) ...
                  const objWidth = obj.width; /*...*/ const objHeight = obj.height; const objDepth = obj.depth;
                  const offsetAlongWall = obj.offsetAlongWall; const offsetBottom = obj.offsetBottom; const offsetFromParentWall = obj.offsetFromParentWall;
                  switch (obj.wallId) { /* ... обновление позиции ... */
                       case "Back": obj.mesh.position.set(-currentLength / 2 + offsetAlongWall + objWidth / 2, -currentWidth / 2 + offsetBottom + objHeight / 2, -currentHeight / 2 + offsetFromParentWall + objDepth / 2); obj.mesh.rotation.y = 0; break;
                       case "Left": obj.mesh.position.set(-currentLength / 2 + offsetFromParentWall + objDepth / 2, -currentWidth / 2 + offsetBottom + objHeight / 2, -currentHeight / 2 + offsetAlongWall + objWidth / 2); obj.mesh.rotation.y = THREE.MathUtils.degToRad(90); break;
                       case "Right": obj.mesh.position.set(currentLength / 2 - offsetFromParentWall - objDepth / 2, -currentWidth / 2 + offsetBottom + objHeight / 2, -currentHeight / 2 + offsetAlongWall + objWidth / 2); obj.mesh.rotation.y = THREE.MathUtils.degToRad(-90); break;
                  }
                  if (obj.edges?.geometry && obj.mesh.geometry) { obj.edges.geometry.dispose(); obj.edges.geometry = new THREE.EdgesGeometry(obj.mesh.geometry); }
             } catch(e) { console.error(`[createCube] Ошибка при обработке окна:`, obj, e); }
         });
     } else { console.log("[createCube] Массив 'windows' не инициализирован (3)."); }

    // --- Блок 4: Обработка НЕ детализированных шкафов ---
    //console.log("[createCube] Обработка НЕ детализированных шкафов...");
     if (typeof cabinets !== 'undefined' && Array.isArray(cabinets)) {
         cabinets.forEach(cabinet => {
             if (!cabinet.isDetailed) { // Только простые
                 try { // Обернем обработку каждого шкафа
                      console.log(`[createCube] Обработка простого шкафа ${cabinet.mesh?.uuid ?? '(новый)'}`);
                     // Создаем НОВЫЙ меш
                     const simpleGeometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
                     const simpleMaterial = new THREE.MeshStandardMaterial({ color: cabinet.initialColor });
                     const oldSimpleMeshUUID = cabinet.mesh?.uuid; // Сохраняем старый UUID, если был
                     // Очищаем старый меш перед перезаписью ссылки
                     if (cabinet.mesh?.geometry) cabinet.mesh.geometry.dispose();
                     if (cabinet.mesh?.material) { /* dispose material */ if(Array.isArray(cabinet.mesh.material)) cabinet.mesh.material.forEach(m=>m?.dispose()); else cabinet.mesh.material?.dispose(); }
                     if (cabinet.edges?.geometry) cabinet.edges.geometry.dispose();
                     if (cabinet.edges?.material) cabinet.edges.material.dispose();

                     cabinet.mesh = new THREE.Mesh(simpleGeometry, simpleMaterial);
                     if(oldSimpleMeshUUID) cabinet.mesh.uuid = oldSimpleMeshUUID; // Пытаемся восстановить UUID

                     const edgesGeom = new THREE.EdgesGeometry(cabinet.mesh.geometry);
                     cabinet.edges = new THREE.LineSegments(edgesGeom, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }));
                     cabinet.edges.raycast = () => {}; cabinet.mesh.add(cabinet.edges);

                     // Пересчет отступа и позиции
                     if (cabinet.type === 'lowerCabinet' && cabinet.wallId !== 'Bottom') { cabinet.offsetFromParentWall = calculateLowerCabinetOffset(cabinet); }
                     updateCabinetPosition(cabinet); // Обновит позицию НОВОГО cabinet.mesh
                     cube.add(cabinet.mesh); // Добавляем в НОВЫЙ куб

                     // Цвет пересечения
                     const hasIntersection = checkCabinetIntersections(cabinet);
                     if(cabinet.mesh.material) { cabinet.mesh.material.color.set(hasIntersection ? 0xff0000 : cabinet.initialColor); cabinet.mesh.material.needsUpdate = true; }
                     if(cabinet.edges?.material) cabinet.edges.material.needsUpdate = true;

                 } catch (e) { console.error(`[createCube] Ошибка при обработке простого шкафа:`, cabinet, e); }
             }
         });
     } else { console.log("[createCube] Массив 'cabinets' не инициализирован (4)."); }


    // --- Блок 5: Обработка СТОЛЕШНИЦ ---
    //console.log("[createCube] Обработка столешниц...");
     if (typeof countertops !== 'undefined' && Array.isArray(countertops)) {
         countertops.forEach(countertop => {
              try { // Обернем обработку столешницы
                 if (!countertop) return;
                 cube.add(countertop);
                 // ... (Обновление позиции столешниц) ...
                  const { wallId, offsetAlongWall, length, depth } = countertop.userData;
                  const roomWidth = currentLength; const roomDepth = currentHeight; const newY = countertop.position.y;
                  let newX, newZ, newRotY;
                  switch (wallId) { /* ... ваш switch ... */
                      case 'Back': newX = offsetAlongWall + length / 2 - roomWidth / 2; newZ = -roomDepth / 2 + depth / 2; newRotY = 0; break;
                      case 'Front': newX = offsetAlongWall + length / 2 - roomWidth / 2; newZ = roomDepth / 2 - depth / 2; newRotY = 0; break;
                      case 'Left': newX = -roomWidth / 2 + depth / 2; newZ = offsetAlongWall + length / 2 - roomDepth / 2; newRotY = Math.PI / 2; break;
                      case 'Right': newX = roomWidth / 2 - depth / 2; newZ = offsetAlongWall + length / 2 - roomDepth / 2; newRotY = Math.PI / 2; break;
                      case 'Bottom':
                           const parentCabData = (typeof cabinets !== 'undefined' && Array.isArray(cabinets))
                               ? cabinets.find(cab => cab.mesh?.uuid === countertop.userData?.cabinetUuid)
                               : null;
                           if (parentCabData && parentCabData.mesh) { /* ... */
                               const cabinetCenter = parentCabData.mesh.position; const cabinetQuaternion = parentCabData.mesh.quaternion;
                               const cabOverhang = parentCabData.overhang ?? 0.02; const cabFacadeThickness = parentCabData.facadeThickness ?? 0.018;
                               const cabinetDepth = parentCabData.depth; const ctDepth = countertop.userData.depth;
                               const forwardDir = new THREE.Vector3(0, 0, 1).applyQuaternion(cabinetQuaternion);
                               const offsetMagnitude = (cabinetDepth / 2) + cabOverhang + cabFacadeThickness - (ctDepth / 2);
                               const targetPos = cabinetCenter.clone().addScaledVector(forwardDir, offsetMagnitude); targetPos.y = countertop.position.y;
                               newX = targetPos.x; newZ = targetPos.z; newRotY = parentCabData.mesh.rotation.y;
                           } else { /* ... */ }
                           break;
                      default: newX = countertop.position.x; newZ = countertop.position.z; newRotY = countertop.rotation.y; break;
                  }
                  countertop.position.set(newX, newY, newZ);
                  countertop.rotation.y = newRotY;
              } catch (e) { console.error(`[createCube] Ошибка при обработке столешницы:`, countertop, e); }
         });
     } else { console.log("[createCube] Массив 'countertops' не инициализирован (5)."); }


    // --- Блок 6: Восстанавливаем детализированные шкафы ---
    //console.log("[createCube] Восстановление детализированных шкафов...");
     if (typeof cabinets !== 'undefined' && Array.isArray(cabinets)) {
         detailedCabinetData.forEach(data => {
             const cabinet = cabinets[data.index];
             if (cabinet && cabinet.isDetailed) {
                  console.log(` - Воссоздание группы для UUID: ${data.uuid}, Индекс: ${data.index}`);
                 try { // Обернем воссоздание
                     // Передаем cabinet (данные) в функцию создания
                     const newDetailedGroup = getDetailedCabinetRepresentation(cabinet); // <--- Передаем объект данных

                     if (newDetailedGroup) {
                          newDetailedGroup.uuid = data.uuid; // Восстанавливаем UUID
                          if (data.oldMesh) { // Копируем трансформации из старой группы
                              newDetailedGroup.position.copy(data.oldMesh.position);
                              newDetailedGroup.rotation.copy(data.oldMesh.rotation);
                              newDetailedGroup.scale.copy(data.oldMesh.scale);
                          } else {
                               console.warn(`[createCube] oldMesh не найдена для UUID ${data.uuid}, позиция может быть неточной.`);
                               // Пытаемся позиционировать по данным, но mesh еще не назначен
                               updateCabinetPosition(cabinet); // Эта функция ожидает cabinet.mesh... может не сработать
                          }
                          cabinet.mesh = newDetailedGroup; // Обновляем ссылку
                          cabinet.edges = null;
                          cube.add(newDetailedGroup); // Добавляем в НОВЫЙ куб
                          console.log(` - Детализированная группа для UUID ${data.uuid} восстановлена.`);

                          // Очистка старой группы
                          if (data.oldMesh) {
                              console.log(` - Очистка старой группы ${data.oldMesh.uuid}`);
                              data.oldMesh.traverse((child) => { /* ... код dispose() ... */
                                   if (child.isMesh || child.isLineSegments) { if (child.geometry) child.geometry.dispose(); if (child.material) { if (Array.isArray(child.material)) child.material.forEach(m=>m?.dispose()); else child.material?.dispose(); } } });
                          }
                          // Восстанавливаем подсветку
                          if (typeof selectedCabinets !== 'undefined' && selectedCabinets.some(selCab => selCab.mesh?.uuid === data.uuid)) {
                              applyHighlight(newDetailedGroup);
                          }
                     } else { // createDetailedCabinetGeometry вернула null
                          console.error(`Не удалось воссоздать детализированную группу для UUID: ${data.uuid}. Шкаф станет простым.`);
                          cabinet.isDetailed = false;
                          // Создаем простой меш
                          cabinet.mesh = new THREE.Mesh( new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth), new THREE.MeshStandardMaterial({ color: cabinet.initialColor }) );
                          cabinet.mesh.uuid = data.uuid;
                          const edgesGeom = new THREE.EdgesGeometry(cabinet.mesh.geometry); cabinet.edges = new THREE.LineSegments(edgesGeom, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }));
                          cabinet.edges.raycast = () => {}; cabinet.mesh.add(cabinet.edges);
                          updateCabinetPosition(cabinet); cube.add(cabinet.mesh);
                     }
                 } catch (e) {
                      console.error(`[createCube] КРИТИЧЕСКАЯ ОШИБКА при воссоздании детализированного шкафа UUID: ${data.uuid}`, cabinet, e);
                      cabinet.isDetailed = false; // Считаем его простым при ошибке
                      // Пытаемся создать простой меш как fallback
                      try {
                          cabinet.mesh = new THREE.Mesh( new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth), new THREE.MeshStandardMaterial({ color: cabinet.initialColor }) );
                          cabinet.mesh.uuid = data.uuid;
                          const edgesGeom = new THREE.EdgesGeometry(cabinet.mesh.geometry); cabinet.edges = new THREE.LineSegments(edgesGeom, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }));
                          cabinet.edges.raycast = () => {}; cabinet.mesh.add(cabinet.edges);
                          updateCabinetPosition(cabinet); cube.add(cabinet.mesh);
                      } catch (fallbackError) {
                           console.error("!!! НЕ УДАЛОСЬ СОЗДАТЬ ДАЖЕ ПРОСТОЙ МЕШ ПОСЛЕ ОШИБКИ ДЕТАЛИЗАЦИИ !!!", fallbackError);
                      }
                 }
             } else { /* ... */ }
         });
     } else { console.log("[createCube] Массив 'cabinets' не инициализирован (6)."); }

    //console.log("--- createCube Завершено ---");
}
/*
function updateSelectedFaceDisplay() {
    selectedFaceDisplay.value = selectedFaceIndex === -1 ? "None" : faceNormals[selectedFaceIndex].id;
    const wallEditMenu = document.getElementById('wallEditMenu');
    const lowerCabinetContainer = document.getElementById('lowerCabinetContainer');
    
    if (selectedFaceIndex !== -1 && ['Back', 'Left', 'Right'].includes(faceNormals[selectedFaceIndex].id)) {
        wallEditMenu.style.display = 'block';
        lowerCabinetContainer.style.display = 'block'; // Видна для стен
    } else if (selectedFaceIndex !== -1 && faceNormals[selectedFaceIndex].id === 'Bottom') {
        wallEditMenu.style.display = 'none'; // Скрываем меню стен для пола
        lowerCabinetContainer.style.display = 'block'; // Видна для пола
    } else {
        wallEditMenu.style.display = 'none';
        lowerCabinetContainer.style.display = 'none'; // Скрыта для остальных граней
    }
}*/

let faceBoundsTable_RM; // Переменная для DOM-элемента <table id="faceBoundsTable">

function updateFaceBounds_RM() { // Переименовали и используем activeCamera
    if (!cube || !activeCamera) return; // Добавили проверку activeCamera

    const cameraDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(activeCamera.quaternion); // Используем activeCamera
    const projector = new THREE.Vector3();
    
    if (!faceBoundsTable_RM) { // Проверка, что таблица существует
        // console.warn("updateFaceBounds_RM: faceBoundsTable_RM не найдена.");
        return;
    }
    faceBoundsTable_RM.innerHTML = '';

    faceNormals.forEach((face, index) => {
        const globalNormal = face.normal.clone().applyEuler(cube.rotation);
        const dot = globalNormal.dot(cameraDirection);
        const isVisible = dot > 0; // Используем небольшой положительный порог для большей надежности, 
                                 // но для отладки граней > 0 должно быть достаточно.

        let x1_proj_str = "N/A", y1_proj_str = "N/A", x2_proj_str = "N/A", y2_proj_str = "N/A"; // Строки для вывода

        if (isVisible) {
            const vertices = getFaceVertices(face.id); // getFaceVertices уже в roomManager.js
            if (vertices && vertices.length > 0) { // Добавил проверку на существование vertices
                let minX_proj = Infinity, minY_proj = Infinity, maxX_proj = -Infinity, maxY_proj = -Infinity;

                vertices.forEach(vertex => {
                    projector.copy(vertex).applyMatrix4(cube.matrixWorld).project(activeCamera); // Используем activeCamera
                    minX_proj = Math.min(minX_proj, projector.x);
                    minY_proj = Math.min(minY_proj, projector.y);
                    maxX_proj = Math.max(maxX_proj, projector.x);
                    maxY_proj = Math.max(maxY_proj, projector.y);
                });

                x1_proj_str = minX_proj.toFixed(2);
                y1_proj_str = minY_proj.toFixed(2);
                x2_proj_str = maxX_proj.toFixed(2);
                y2_proj_str = maxY_proj.toFixed(2);
            }
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${face.id}</td>
            <td>${x1_proj_str}</td>
            <td>${y1_proj_str}</td>
            <td>${x2_proj_str}</td>
            <td>${y2_proj_str}</td>
        `;
        faceBoundsTable_RM.appendChild(row);
    });
}

function getFaceVertices(faceId) {
    const halfLength = currentLength / 2;
    const halfWidth = currentWidth / 2;
    const halfHeight = currentHeight / 2;
    const vertices = [];

    switch (faceId) {
        case "Right":
            vertices.push(new THREE.Vector3(halfLength, -halfWidth, -halfHeight));
            vertices.push(new THREE.Vector3(halfLength, halfWidth, -halfHeight));
            vertices.push(new THREE.Vector3(halfLength, halfWidth, halfHeight));
            vertices.push(new THREE.Vector3(halfLength, -halfWidth, halfHeight));
            break;
        case "Left":
            vertices.push(new THREE.Vector3(-halfLength, -halfWidth, -halfHeight));
            vertices.push(new THREE.Vector3(-halfLength, -halfWidth, halfHeight));
            vertices.push(new THREE.Vector3(-halfLength, halfWidth, halfHeight));
            vertices.push(new THREE.Vector3(-halfLength, halfWidth, -halfHeight));
            break;
        case "Top":
            vertices.push(new THREE.Vector3(-halfLength, halfWidth, -halfHeight));
            vertices.push(new THREE.Vector3(halfLength, halfWidth, -halfHeight));
            vertices.push(new THREE.Vector3(halfLength, halfWidth, halfHeight));
            vertices.push(new THREE.Vector3(-halfLength, halfWidth, halfHeight));
            break;
        case "Bottom":
            vertices.push(new THREE.Vector3(-halfLength, -halfWidth, -halfHeight));
            vertices.push(new THREE.Vector3(halfLength, -halfWidth, -halfHeight));
            vertices.push(new THREE.Vector3(halfLength, -halfWidth, halfHeight));
            vertices.push(new THREE.Vector3(-halfLength, -halfWidth, halfHeight));
            break;
        case "Front":
            vertices.push(new THREE.Vector3(-halfLength, -halfWidth, halfHeight));
            vertices.push(new THREE.Vector3(halfLength, -halfWidth, halfHeight));
            vertices.push(new THREE.Vector3(halfLength, halfWidth, halfHeight));
            vertices.push(new THREE.Vector3(-halfLength, halfWidth, halfHeight));
            break;
        case "Back":
            vertices.push(new THREE.Vector3(-halfLength, -halfWidth, -halfHeight));
            vertices.push(new THREE.Vector3(halfLength, -halfWidth, -halfHeight));
            vertices.push(new THREE.Vector3(halfLength, halfWidth, -halfHeight));
            vertices.push(new THREE.Vector3(-halfLength, halfWidth, -halfHeight));
            break;
    }
    return vertices;
}

export function applySize() {
    console.log("Начинаем applySize");
    const lengthInput = document.getElementById('length');
    const heightInput = document.getElementById('height');
    const widthInput = document.getElementById('width');
    const colorInput = document.getElementById('cubeColor');

    let newLength = parseFloat(lengthInput.value) / 1000;
    let newHeight = parseFloat(heightInput.value) / 1000;
    let newWidth = parseFloat(widthInput.value) / 1000;
    const newColor = colorInput.value;

    if (isNaN(newLength) || isNaN(newHeight) || isNaN(newWidth) || newLength <= 0 || newHeight <= 0 || newWidth <= 0) {
        alert("Пожалуйста, введите корректные размеры комнаты (больше 0).");
        lengthInput.value = currentLength * 1000;
        heightInput.value = currentWidth * 1000;
        widthInput.value = currentHeight * 1000;
        return;
    }

    if (typeof window.globalSaveState === 'function') {
        window.globalSaveState("resizeRoom", {
            length: currentLength,
            height: currentWidth,
            width: currentHeight,
            color: document.getElementById('cubeColor').value
        });
    } else {
        console.warn("globalSaveState не найдена.");
    }
    
    createCube(newLength, newHeight, newWidth, newColor, cube.rotation.x, cube.rotation.y);

    lengthInput.value = newLength * 1000;
    heightInput.value = newHeight * 1000;
    widthInput.value = newWidth * 1000;
    colorInput.value = newColor;
}

let cubeColorInput_RM; // Переменная для DOM-элемента <input id="cubeColor">

function updateEdgeColors_RM() { // Переименовали
    if (!edges) return;

    // Получаем актуальный цвет комнаты из DOM-элемента
    const baseColorValue = cubeColorInput_RM ? cubeColorInput_RM.value : '#d3d3d3'; // Значение по умолчанию, если элемент не найден

    const positions = edges.geometry.attributes.position.array;
    const colors = new Float32Array(positions.length);

    for (let i = 0; i < positions.length; i += 6) {
        const x1 = positions[i], y1 = positions[i + 1], z1 = positions[i + 2];
        const x2 = positions[i + 3], y2 = positions[i + 4], z2 = positions[i + 5];

        let isSelectedEdge = false;
        if (selectedFaceIndex !== -1 && faceNormals[selectedFaceIndex]) { // Добавил проверку faceNormals[selectedFaceIndex]
            const face = faceNormals[selectedFaceIndex];
            // ВНИМАНИЕ: currentLength, currentWidth, currentHeight используются здесь для определения "границ" куба.
            // currentWidth соответствует высоте (Y), currentHeight - глубине (Z) в вашей терминологии комнаты.
            const nx = face.normal.x * currentLength / 2;  // currentLength - это длина комнаты (X)
            const ny = face.normal.y * currentWidth / 2;   // currentWidth - это ВЫСОТА комнаты (Y)
            const nz = face.normal.z * currentHeight / 2;  // currentHeight - это ГЛУБИНА комнаты (Z)
            
            // Порог для определения принадлежности ребра к грани.
            // Можно сделать его чуть менее строгим, если ребра не всегда подсвечиваются.
            const threshold = 0.01; // Небольшой порог для сравнения координат

            // Логика определения, принадлежит ли ребро выбранной грани, может быть сложной
            // из-за вращения куба. Простая проверка по координатам может не всегда работать.
            // Более надежный способ - проверять, лежат ли обе вершины ребра на выбранной грани.

            // Упрощенная проверка (может потребовать доработки для всех вращений):
            // Если нормаль грани по X не 0, и X-координаты ребра близки к X-координате грани
            if (Math.abs(face.normal.x) > 0.5 && Math.abs(x1 - nx) < threshold && Math.abs(x2 - nx) < threshold) isSelectedEdge = true;
            // Если нормаль грани по Y не 0, и Y-координаты ребра близки к Y-координате грани
            if (Math.abs(face.normal.y) > 0.5 && Math.abs(y1 - ny) < threshold && Math.abs(y2 - ny) < threshold) isSelectedEdge = true;
            // Если нормаль грани по Z не 0, и Z-координаты ребра близки к Z-координате грани
            if (Math.abs(face.normal.z) > 0.5 && Math.abs(z1 - nz) < threshold && Math.abs(z2 - nz) < threshold) isSelectedEdge = true;
        }

        const color = isSelectedEdge ? [0, 1, 1] : [0, 0, 0]; // Cyan для выбранных, Black для остальных
        colors[i] = color[0]; colors[i + 1] = color[1]; colors[i + 2] = color[2];
        colors[i + 3] = color[0]; colors[i + 4] = color[1]; colors[i + 5] = color[2];
    }

    if (!edges.geometry.attributes.color) {
        edges.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        edges.material = new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 3 });
    } else {
        edges.geometry.attributes.color.array.set(colors);
        edges.geometry.attributes.color.needsUpdate = true;
        // edges.material.linewidth = selectedFaceIndex !== -1 ? 3 : 2; // Можно вернуть, если нужно менять толщину
        edges.material.needsUpdate = true;
    }

    // Обновляем цвет граней (материалов куба)
    materials.forEach((material, index) => {
        if (material) { // Проверка, что материал существует
             material.color.set(index === selectedFaceIndex ? 0xADD8E6 : baseColorValue); // LightBlue для выбранной грани
        }
    });
}

function updateSelectedFaceDisplay_RM() { // Переименовали
    if (selectedFaceDisplayInput_RM) { // Используем переменную модуля
        const faceId = selectedFaceIndex === -1 || !faceNormals[selectedFaceIndex] ? "None" : faceNormals[selectedFaceIndex].id;
        selectedFaceDisplayInput_RM.value = faceId;

        if (wallEditMenu_RM && lowerCabinetContainer_RM) { // Используем переменные модуля
            const showWallMenu = selectedFaceIndex !== -1 && faceNormals[selectedFaceIndex] && ['Back', 'Left', 'Right'].includes(faceNormals[selectedFaceIndex].id);
            const showForBottom = selectedFaceIndex !== -1 && faceNormals[selectedFaceIndex] && faceNormals[selectedFaceIndex].id === 'Bottom';

            wallEditMenu_RM.style.display = showWallMenu ? 'block' : 'none';
            lowerCabinetContainer_RM.style.display = (showWallMenu || showForBottom) ? 'block' : 'none';
        }
    } else {
        // console.warn("updateSelectedFaceDisplay_RM: selectedFaceDisplayInput_RM не найден.");
    }
}

// --- НОВАЯ ЭКСПОРТИРУЕМАЯ ФУНКЦИЯ ---
export function setRoomSelectedFace(index) {
    if (typeof index === 'number' && (index >= -1 && index < faceNormals.length)) {
        selectedFaceIndex = index;
        updateSelectedFaceDisplay_RM(); // Обновляем UI после изменения
        if (typeof updateEdgeColors_RM === 'function') updateEdgeColors_RM();
    } else {
        console.warn("Попытка установить некорректный selectedFaceIndex:", index);
    }
}

// Для сброса
export function resetRoomSelectedFace() {
    selectedFaceIndex = -1;
    updateSelectedFaceDisplay_RM();
    updateEdgeColors_RM();
}

export function determineClickedWallFace_OldLogic(intersect, mouseNDC) {
    if (!cube || !activeCamera || !intersect || !intersect.face || !mouseNDC) {
        // console.warn("determineClickedWallFace_OldLogic: не хватает входных данных.");
        return -1;
    }

    // Логика из вашего старого обработчика клика в script.js
    const normalFromIntersectedFace = intersect.face.normal.clone().applyEuler(cube.rotation); // Нормаль грани, по которой кликнули, в мировых координатах с учетом вращения куба
    const cameraDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(activeCamera.quaternion);
    let bestMatchIndex = -1;
    let highestDot = -Infinity; // Для выбора наиболее "лицевой" к камере грани, если несколько подходят

    faceNormals.forEach((faceData, index) => {
        const globalFaceNormalFromPreset = faceData.normal.clone().applyEuler(cube.rotation); // Мировая нормаль эталонной грани
        const dotToCamera = globalFaceNormalFromPreset.dot(cameraDirection);

        if (dotToCamera > 0.1) { // Грань смотрит в сторону камеры (порог видимости)
            const vertices = getFaceVertices(faceData.id); // Используем локальную getFaceVertices
            if (vertices && vertices.length > 0) {
                let minX_proj = Infinity, minY_proj = Infinity, maxX_proj = -Infinity, maxY_proj = -Infinity;
                const projector = new THREE.Vector3(); // Вспомогательный вектор

                vertices.forEach(vertex => {
                    projector.copy(vertex).applyMatrix4(cube.matrixWorld).project(activeCamera);
                    minX_proj = Math.min(minX_proj, projector.x);
                    minY_proj = Math.min(minY_proj, projector.y);
                    maxX_proj = Math.max(maxX_proj, projector.x);
                    maxY_proj = Math.max(maxY_proj, projector.y);
                });

                // Проверяем, попадает ли курсор мыши (mouseNDC) в 2D-проекцию этой грани
                if (mouseNDC.x >= minX_proj && mouseNDC.x <= maxX_proj &&
                    mouseNDC.y >= minY_proj && mouseNDC.y <= maxY_proj) {

                    // Дополнительная проверка: нормаль пересеченного треугольника должна быть очень близка
                    // к ожидаемой нормали этой грани. Это помогает отличить грани, если луч попал на ребро.
                    const angleBetweenNormals = normalFromIntersectedFace.angleTo(globalFaceNormalFromPreset);

                    if (angleBetweenNormals < 0.1) { // Маленький угол означает, что нормали почти совпадают
                        if (dotToCamera > highestDot) { // Выбираем ту, что "прямее" смотрит на камеру
                            highestDot = dotToCamera;
                            bestMatchIndex = index;
                        }
                    }
                }
            }
        }
    });
    return bestMatchIndex;
}


export {
    cube, // Экспортируем сам объект комнаты, т.к. к нему добавляются другие объекты
    edges,
    selectedFaceIndex, // Если нужен для определения, на какую стену добавлять объекты
    currentLength,
    currentWidth,
    currentHeight,
    faceNormals,
    materials,
    createCube,
    updateSelectedFaceDisplay_RM as updateSelectedFaceDisplay, // Экспортируем под старым именем для script.js
    updateEdgeColors_RM as updateEdgeColors, // Экспортируем под старым именем
    updateFaceBounds_RM as updateFaceBounds, // Экспортируем под старым именем
    handleRoomClick,
    roomDimensions
    //zoomSlider,
    //applySize,
    //setLeftView,
    //setFrontView,
    //setTopView,
    //setIsometricView,
    // Возможно, adjustCameraAndScale, если вызывается извне
    // Возможно, updateEdgeColors, getFaceVertices, updateFaceBounds, если они специфичны для комнаты
    // Переменные слайдеров и их обработчики обычно не экспортируются,
    // они инкапсулируются внутри модуля, а модуль предоставляет функции для изменения состояния
};