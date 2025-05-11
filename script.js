import * as THREE from 'three'; // Импорт ядра Three.js

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

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, window.innerWidth * 0.7 / window.innerHeight, 0.1, 1000);
camera.position.z = 10;

// --- Ортографическая камера (новая) ---
// Начальные размеры frustum - будут обновляться при переключении вида и ресайзе
const aspect = window.innerWidth * 0.7 / window.innerHeight;
const frustumSize = 5; // Начальный размер видимой области (подберем позже)
const orthoCamera = new THREE.OrthographicCamera(
    frustumSize * aspect / -2, // left
    frustumSize * aspect / 2,  // right
    frustumSize / 2,           // top
    frustumSize / -2,          // bottom
    0.1,                       // near
    1000                       // far
);
// Начальная позиция и направление для ортографической камеры (не так важны до первого переключения)
orthoCamera.position.z = 10;
orthoCamera.lookAt(scene.position);

// --- Переменная для активной камеры ---
let activeCamera = camera; // Начинаем с перспективной


const renderer = new THREE.WebGLRenderer();


renderer.setSize(window.innerWidth * 0.7, window.innerHeight);
document.getElementById('canvasContainer').appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight( 0xffffff, 1.5 ); // Цвет, Интенсивность (попробуй 1.0 - 2.0)
directionalLight.position.set( 5, 10, 7.5 ); // Позиция (X, Y, Z) - откуда светит
scene.add(directionalLight);

// Настройки теней (опционально, но рекомендуется для реализма)
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024; // Разрешение карты теней
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
// Настроить область камеры теней по размеру сцены
let shadowCamSize = 10; // Примерный размер области тени
directionalLight.shadow.camera.left = -shadowCamSize;
directionalLight.shadow.camera.right = shadowCamSize;
directionalLight.shadow.camera.top = shadowCamSize;
directionalLight.shadow.camera.bottom = -shadowCamSize;

scene.add( directionalLight );

// Также убедись, что у рендерера включены карты теней
renderer.shadowMap.enabled = true; // Добавь это при настройке renderer
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Тип теней (опционально)

// И у объектов, которые должны отбрасывать/принимать тени, включены свойства:
//mesh.castShadow = true;
//mesh.receiveShadow = true;
//planeMesh.receiveShadow = true; // Например, пол


const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Вызови эту функцию один раз при инициализации приложения
//setupPostprocessing();

//onWindowResize();

let cube, edges;
let selectedFaceIndex = -1;
let currentLength = 1, currentWidth = 1, currentHeight = 1;
let materials = [];
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
    windows.forEach(obj => cube.remove(obj.mesh));
    cabinets.forEach(cabinet => cube.remove(cabinet.mesh));

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
        cube.add(mesh);
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
        cube.add(mesh);
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
    updateRotationDisplay();
    updateCountertopButtonVisibility();
    updateEdgeColors();
    updateSelectedFaceDisplay();
    updateFaceBounds();
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
        wallOffset: 20 / 1000 // <--- НОВЫЙ ПАРАМЕТР: отступ от стены (20мм по умолчанию)
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

            cube.add(mesh);
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

        cube.add(mesh);
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
const faceNormals = [
    { id: "Right", normal: new THREE.Vector3(1, 0, 0) },
    { id: "Left", normal: new THREE.Vector3(-1, 0, 0) },
    { id: "Top", normal: new THREE.Vector3(0, 1, 0) },
    { id: "Bottom", normal: new THREE.Vector3(0, -1, 0) },
    { id: "Front", normal: new THREE.Vector3(0, 0, 1) },
    { id: "Back", normal: new THREE.Vector3(0, 0, -1) }
];

const rotateXSlider = document.getElementById('rotateX');
const rotateYSlider = document.getElementById('rotateY');
const rotateXValue = document.getElementById('rotateXValue');
const rotateYValue = document.getElementById('rotateYValue');
const zoomSlider = document.getElementById('zoom');
const selectedFaceDisplay = document.getElementById('selectedFace');
const mouseXDisplay = document.getElementById('mouseX');
const mouseYDisplay = document.getElementById('mouseY');
const faceBoundsTable = document.getElementById('faceBoundsTable');

// В script.js
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
    selectedFaceIndex = -1; updateSelectedFaceDisplay();
    adjustCameraAndScale(length, height, width); updateFaceBounds();

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
                     const newDetailedGroup = createDetailedCabinetGeometry(cabinet); // <--- Передаем объект данных

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

function adjustCameraAndScale(length, height, width) {
    const maxDimension = Math.max(length, height, width);
    const scaleFactor = 4 / maxDimension;
    cube.scale.set(scaleFactor, scaleFactor, scaleFactor);
    edges.scale.set(scaleFactor, scaleFactor, scaleFactor);
    const zoomValue = parseFloat(zoomSlider.value);
    camera.position.z = zoomValue;
    directionalLight.position.set(0, 0, zoomValue);
    camera.updateProjectionMatrix();
    updateFaceBounds();
}

function applySize() {
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

    saveState("resizeRoom", {
        length: currentLength,
        height: currentWidth,
        width: currentHeight,
        color: document.getElementById('cubeColor').value
    });

    createCube(newLength, newHeight, newWidth, newColor, cube.rotation.x, cube.rotation.y);

    lengthInput.value = newLength * 1000;
    heightInput.value = newHeight * 1000;
    widthInput.value = newWidth * 1000;
    colorInput.value = newColor;
}

function setLeftView() {
    if (!cube) return;
    setupOrthoCameraView('Left');
    // Сбрасываем вращение куба для чистого вида
    cube.rotation.set(0, 0, 0);
    if (edges) edges.rotation.copy(cube.rotation);
    rotateXSlider.value = 0; rotateYSlider.value = 0; updateRotationDisplay();
}

function setFrontView() {
    if (!cube) return;
    setupOrthoCameraView('Front');
    // Сбрасываем вращение куба
    cube.rotation.set(0, 0, 0);
    if (edges) edges.rotation.copy(cube.rotation);
    rotateXSlider.value = 0; rotateYSlider.value = 0; updateRotationDisplay();
}

function setTopView() {
    if (!cube) return;
    setupOrthoCameraView('Top');
     // Сбрасываем вращение куба (вид сверху не зависит от вращения куба вокруг X/Y)
     cube.rotation.set(0, 0, 0); // Можно оставить или сбросить
     if (edges) edges.rotation.copy(cube.rotation);
     rotateXSlider.value = 0; rotateYSlider.value = 0; updateRotationDisplay();
}

function setIsometricView() { // Или set3DView
    if (!cube) return;
    activeCamera = camera; // Переключаемся обратно на перспективную
    console.log("Переключение на перспективную камеру.");

    // Восстанавливаем FOV и стандартную позицию/вращение
    camera.fov = 30;
    camera.position.set(0, 0, 10); // Стандартная позиция для 3D
    camera.up.set(0, 1, 0); // Стандартный вектор "вверх"
    camera.lookAt(scene.position);
    camera.updateProjectionMatrix();

    // Восстанавливаем вращение куба для изометрии
    cube.rotation.x = THREE.MathUtils.degToRad(30);
    cube.rotation.y = THREE.MathUtils.degToRad(-30);
    if (edges) edges.rotation.copy(cube.rotation);

    // Обновляем UI
    rotateXSlider.value = 30;
    rotateYSlider.value = -30;
    updateRotationDisplay();
    updateRendererAndPostprocessingCamera(); // Обновляем рендерер/пост-обработку
    updateFaceBounds();
    updateEdgeColors();
}

function updateRotationDisplay() {
    rotateXValue.value = `${Math.round(parseFloat(rotateXSlider.value))}°`;
    rotateYValue.value = `${Math.round(parseFloat(rotateYSlider.value))}°`;
}

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
}
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
                cube.remove(windows[i].mesh);
                windows.splice(i, 1);
            }
        }
    } else {
        cube.remove(window.mesh);
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
    originalType: null,
    originalConfig: null
};

// В script.js
function showCabinetMenu(x, y, cabinet) {
    // --- ЗАПОМИНАЕМ ИСХОДНЫЕ ДАННЫЕ ШКАФА ПРИ ОТКРЫТИИ МЕНЮ ---
    initialMenuData.originalType = cabinet.cabinetType;
    initialMenuData.originalConfig = cabinet.cabinetConfig;
    // --- Блок 1: Создание или получение меню ---
    let menu = document.getElementById('cabinetMenu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'cabinetMenu';
        menu.className = 'popup-menu'; // Используем класс для общих стилей
        document.body.appendChild(menu);
    }

    // --- Удаляем старые элементы ввода размеров ---
    hideAllDimensionInputs(); // Прячем поля размеров от предыдущего выделения

    // --- Блок 2: Заголовок и БАЗОВЫЕ поля (данные из объекта cabinet) ---
    const headerText = cabinet.type === 'upperCabinet' ? 'Параметры верхнего шкафа' :
                      cabinet.type === 'freestandingCabinet' ? 'Параметры свободно стоящего шкафа' :
                      'Параметры нижнего шкафа';
    let html = `
        <h3>${headerText}</h3>
        <div class="menu-content">
            <label>Ширина, мм: <input type="text" id="cabinetWidth" value="${Math.round(cabinet.width * 1000)}" data-min="12"></label>
            <label>Глубина, мм: <input type="text" id="cabinetDepth" value="${Math.round(cabinet.depth * 1000)}" data-min="12"></label>
    `;

    // --- Блок 3: Специфичные поля ---
    if (cabinet.type === 'freestandingCabinet') {
        // Берем сохраненные смещения и текущее вращение
        const offsetX = Math.round((cabinet.offsetX || 0) * 1000);
        const offsetZ = Math.round((cabinet.offsetZ || 0) * 1000);
        const rotationY = cabinet.mesh.rotation.y; // Текущее вращение для селектора
        const orientation = rotationY === 0 ? 'Back' :
                           rotationY === THREE.MathUtils.degToRad(90) ? 'Left' :
                           rotationY === THREE.MathUtils.degToRad(-90) ? 'Right' :
                           rotationY === THREE.MathUtils.degToRad(180) ? 'Front' :
                           'Back';

        html += `
            <label>Высота, мм: <input type="text" id="cabinetHeight" value="${Math.round(cabinet.height * 1000)}" data-min="100"></label>
            <label>Расстояние от угла по X, мм: <input type="text" id="cabinetOffsetX" value="${offsetX}" data-min="0"></label>
            <label>Расстояние от угла по Z, мм: <input type="text" id="cabinetOffsetZ" value="${offsetZ}" data-min="0"></label>
            <label>Свес, мм: <input type="number" id="cabinetOverhang" value="${Math.round((cabinet.overhang ?? 0) * 1000)}" min="-100" step="1"></label>
            <label>Зазор между фасадами, мм: <input type="number" id="cabinetFacadeGap" value="${Math.round((cabinet.facadeGap || 0.003) * 1000)}" min="0" step="1"></label>
            <label>Тип шкафа:</label>
            <select id="cabinetType">
                <option value="corner" ${cabinet.cabinetType === 'corner' ? 'selected' : ''}>Угловой</option>
                <option value="straight" ${cabinet.cabinetType === 'straight' ? 'selected' : ''}>Прямой</option>
            </select>
            <label>Ориентация:</label>
            <select id="cabinetOrientation" onchange="orientCabinet(${cabinets.indexOf(cabinet)}, this.value)">
                <option value="Back" ${orientation === 'Back' ? 'selected' : ''}>Back</option>
                <option value="Left" ${orientation === 'Left' ? 'selected' : ''}>Left</option>
                <option value="Right" ${orientation === 'Right' ? 'selected' : ''}>Right</option>
                <option value="Front" ${orientation === 'Front' ? 'selected' : ''}>Front</option>
            </select>
            <label>Конфигурация шкафа:</label>
            <select id="cabinetConfig"></select>
            <button type="button" id="configureCabinetBtn">Настроить шкаф</button>
        `;
    } else if (cabinet.type === 'upperCabinet') {
        // Берем сохраненные смещения
        const offsetAlongWall = Math.round((cabinet.offsetAlongWall || 0) * 1000);
        const offsetBottom = Math.round((cabinet.offsetBottom || 0) * 1000);

        html += `
            <label>Высота, мм: <input type="text" id="cabinetHeight" value="${Math.round(cabinet.height * 1000)}" data-min="100"></label>
            <label>Расстояние до угла, мм: <input type="text" id="cabinetoffsetAlongWall" value="${offsetAlongWall}" data-min="0"></label>
            <label>Отступ от пола, мм: <input type="text" id="cabinetOffsetBottom" value="${offsetBottom}" data-min="0"></label>
            <label>Зазор между фасадами, мм: <input type="number" id="cabinetFacadeGap" value="${Math.round((cabinet.facadeGap || 0.003) * 1000)}" min="0" step="1"></label>
            <label>Тип верхнего шкафа:</label>
            <select id="mezzanine">
                <option value="normal" ${(cabinet.isMezzanine === 'normal' || !cabinet.isMezzanine) ? 'selected' : ''}>Обычный</option>
                <option value="mezzanine" ${cabinet.isMezzanine === 'mezzanine' ? 'selected' : ''}>Антресольный</option>
                <option value="underMezzanine" ${cabinet.isMezzanine === 'underMezzanine' ? 'selected' : ''}>Под антресолями</option>
            </select>
            <label>Тип шкафа:</label>
            <select id="cabinetType">
                <option value="straightUpper" ${cabinet.cabinetType === 'straightUpper' ? 'selected' : ''}>Прямой</option>
                <option value="cornerUpper" ${cabinet.cabinetType === 'cornerUpper' ? 'selected' : ''}>Угловой</option>
            </select>
            <label>Конфигурация шкафа:</label>
            <select id="cabinetConfig"></select>
            <button type="button" id="configureCabinetBtn">Настроить шкаф</button>
        `;
    } else { // lowerCabinet у стены
        // Берем сохраненное смещение
        const offsetAlongWall = Math.round((cabinet.offsetAlongWall || 0) * 1000);

        html += `
            <label>Высота, мм: <input type="text" id="cabinetHeight" value="${Math.round(cabinet.height * 1000)}" data-min="100" disabled></label>
            <label>Расстояние до угла, мм: <input type="text" id="cabinetoffsetAlongWall" value="${offsetAlongWall}" data-min="0"></label>
            <label>Свес, мм: <input type="number" id="cabinetOverhang" value="${Math.round((cabinet.overhang ?? 0) * 1000)}" min="-100" step="1"></label>
            <label>Зазор между фасадами, мм: <input type="number" id="cabinetFacadeGap" value="${Math.round((cabinet.facadeGap || 0.003) * 1000)}" min="0" step="1"></label>
            <label>Тип шкафа:</label>
            <select id="cabinetType">
                <option value="corner" ${cabinet.cabinetType === 'corner' ? 'selected' : ''}>Угловой</option>
                <option value="straight" ${cabinet.cabinetType === 'straight' ? 'selected' : ''}>Прямой</option>
            </select>
            <label>Конфигурация шкафа:</label>
            <select id="cabinetConfig"></select>
            <button type="button" id="configureCabinetBtn">Настроить шкаф</button>
        `;
    }

    // --- Блок 4: Кнопки управления ---
    const cabinetIndex = cabinets.findIndex(c => c.mesh?.uuid === cabinet.mesh?.uuid); // Ищем по UUID
    if (cabinetIndex === -1) {
        console.error("showCabinetMenu: Не удалось найти индекс шкафа по UUID!");
        html += `</div><div>Ошибка: Шкаф не найден!</div>`; // Закрываем menu-content и добавляем ошибку
    } else {
        html += `
            </div> 
            <div class="menu-buttons"> 
                <button type="button" id="applyCabinetChangesBtn" onclick="applyCabinetChanges(${cabinetIndex})">Применить</button>
                <button type="button" onclick="deleteCabinet(${cabinetIndex})">Удалить</button>
            </div>
        `;
    }

    menu.innerHTML = html;
    menu.style.left = `${x + 30}px`;
    menu.style.top = `${y - 10}px`;
    menu.style.display = 'block';

    // --- Блок 5: Слушатель кнопки "Настроить шкаф" ---
    const configureButton = document.getElementById('configureCabinetBtn');
    if (configureButton) {
        configureButton.replaceWith(configureButton.cloneNode(true)); // Очистка старых слушателей
        document.getElementById('configureCabinetBtn').addEventListener('click', () => {
            if (cabinetIndex !== -1) {
                //console.log(`Нажата кнопка Настроить для индекса ${cabinetIndex}`);
                showCabinetConfigMenu(cabinetIndex, x, y, cabinets, kitchenGlobalParams);
            } else {
                 console.error("Невозможно открыть меню конфигурации: индекс шкафа не найден.");
            }
        });
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

    // --- Блок 7: Выпадающие списки (ОБНОВЛЕННЫЙ) ---
const typeSelect = menu.querySelector('#cabinetType');   // Ищем в текущем созданном 'menu'
const configSelect = menu.querySelector('#cabinetConfig'); // Ищем в текущем созданном 'menu'

// Функция для обновления опций КОНФИГУРАЦИИ и данных cabinet.cabinetConfig
function updateConfigOptionsAndCabinetData() {
    if (!typeSelect || !configSelect || !cabinet) return;

    const selectedCabinetType = typeSelect.value;
    // Обновляем тип в объекте данных НЕМЕДЛЕННО
    if (cabinet.cabinetType !== selectedCabinetType) {
        //console.log(`[Меню Шкафа] Тип изменен с ${cabinet.cabinetType} на ${selectedCabinetType}`);
        cabinet.cabinetType = selectedCabinetType;
        // При смене типа, cabinetConfig может стать невалидным, поэтому его нужно будет переустановить
        // на дефолтный для нового типа. Это произойдет ниже.
    }

    configSelect.innerHTML = ''; // Очищаем старые опции конфигурации
    let options = [];
    let newDefaultConfigForType = null; // Для установки дефолтной конфигурации при смене типа

    // Ваша логика генерации массива `options` на основе `selectedCabinetType`
    // и типа самого `cabinet` (например, `cabinet.type` который 'lowerCabinet', 'upperCabinet')
    if (cabinet.type === 'upperCabinet') { // Это 'upperCabinet', 'lowerCabinet' и т.д.
        if (selectedCabinetType === 'cornerUpper') { // Это 'cornerUpper', 'straightUpper'
            options = [
                { value: 'cornerUpperStorage', text: 'Угловой, хранение' },
                { value: 'cornerUpperOpen', text: 'Угловой, открытый' }
            ];
            if (options.length > 0) newDefaultConfigForType = options[0].value;
        } else if (selectedCabinetType === 'straightUpper') {
            options = [
                { value: 'swingUpper', text: 'Распашной' },
                { value: 'liftUpper', text: 'С подъёмным механизмом' },
                { value: 'openUpper', text: 'Открытый' }
            ];
            if (options.length > 0) newDefaultConfigForType = options[0].value;
        }
    } else { // lowerCabinet или freestandingCabinet
          if (selectedCabinetType === 'corner') {
             options = [
                { value: 'sink', text: 'Шкаф с мойкой' },
                { value: 'cornerStorage', text: 'Угловой, хранение' }
             ];
             if (options.length > 0) newDefaultConfigForType = options[0].value;
          } else if (selectedCabinetType === 'straight') {
              options = [
                 { value: 'swing', text: 'Распашной' }, { value: 'drawers', text: 'Выдвижные ящики' },
                 { value: 'oven', text: 'Духовка' }, { value: 'tallStorage', text: 'Высокий пенал, хранение' },
                 { value: 'tallOvenMicro', text: 'Высокий пенал, духовка+микроволновка' },
                 { value: 'fridge', text: 'Встроенный холодильник' }, { value: 'dishwasher', text: 'Посудомойка' },
                 { value: 'falsePanel', text: 'Фальш-панель/Декор.панель' }
              ];
              if (options.length > 0) newDefaultConfigForType = options[0].value;
          }
    }

    let currentConfigStillValid = false;
    if (options.length > 0) {
        options.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.text = option.text;
            // Выбираем опцию, если она соответствует cabinet.cabinetConfig ИЛИ
            // если cabinet.cabinetConfig был сброшен (например, из-за смены типа) и это первая опция
            if (option.value === cabinet.cabinetConfig) {
                opt.selected = true;
                currentConfigStillValid = true;
            }
            configSelect.appendChild(opt);
        });

        // Если текущий cabinet.cabinetConfig не найден среди новых опций
        // (например, после смены cabinetType), или если cabinet.cabinetConfig был сброшен ранее,
        // то устанавливаем первую опцию как выбранную и обновляем данные.
        if (!currentConfigStillValid && newDefaultConfigForType) {
            configSelect.value = newDefaultConfigForType;
            if (cabinet.cabinetConfig !== newDefaultConfigForType) {
                //console.log(`[Меню Шкафа] Конфигурация сброшена на дефолтную для типа: ${newDefaultConfigForType}`);
                cabinet.cabinetConfig = newDefaultConfigForType;
            }
        } else if (!currentConfigStillValid && options.length > 0) {
            // Если newDefaultConfigForType не установлен, но опции есть, берем первую
            configSelect.value = options[0].value;
            if (cabinet.cabinetConfig !== options[0].value) {
                //console.log(`[Меню Шкафа] Конфигурация сброшена на первую доступную: ${options[0].value}`);
                cabinet.cabinetConfig = options[0].value;
            }
        } else if (options.length === 0) {
            const opt = document.createElement('option');
            opt.value = ""; opt.text = "-- Нет --"; opt.disabled = true; opt.selected = true;
            configSelect.appendChild(opt);
            if (cabinet.cabinetConfig !== "") {
                console.log(`[Меню Шкафа] Конфигурация сброшена (нет опций).`);
                cabinet.cabinetConfig = "";
            }
        }
    } else { // Если для выбранного типа вообще нет опций конфигурации
        const opt = document.createElement('option');
        opt.value = ""; opt.text = "-- Нет конфигураций --"; opt.disabled = true; opt.selected = true;
        configSelect.appendChild(opt);
        if (cabinet.cabinetConfig !== "") {
            console.log(`[Меню Шкафа] Конфигурация сброшена (нет опций для типа).`);
            cabinet.cabinetConfig = "";
        }
    }
    // После обновления опций, если выбранное значение в configSelect не соответствует
    // cabinet.cabinetConfig (например, если DOM изменился, а данные еще нет), обновляем данные.
    if (configSelect.value !== cabinet.cabinetConfig) {
        console.log(`[Меню Шкафа] Финальное обновление cabinet.cabinetConfig на ${configSelect.value}`);
        cabinet.cabinetConfig = configSelect.value;
    }
    //console.log("[Меню Шкафа] Обновленные данные после type/config change:", cabinet.cabinetType, cabinet.cabinetConfig);
}

// Слушатель для изменения КОНФИГУРАЦИИ (обновляет только данные cabinet.cabinetConfig)
function handleConfigChange() {
    if (!configSelect || !cabinet) return;
    if (cabinet.cabinetConfig !== configSelect.value) {
        console.log(`[Меню Шкафа] Конфигурация изменена (только данные) с ${cabinet.cabinetConfig} на ${configSelect.value}`);
        cabinet.cabinetConfig = configSelect.value;
    }
}

// --- Привязка слушателей ---
if (typeSelect) {
    // Вызываем один раз для первоначальной загрузки опций конфигурации
    updateConfigOptionsAndCabinetData();
    // Удаляем старый слушатель, чтобы избежать дублирования
    typeSelect.removeEventListener('change', typeSelect._updateListener);
    typeSelect._updateListener = updateConfigOptionsAndCabinetData; // Сохраняем ссылку на обработчик
    typeSelect.addEventListener('change', updateConfigOptionsAndCabinetData);
} else {
     // Если typeSelect нет, но есть configSelect, нужно его инициализировать
     if (configSelect) updateConfigOptionsAndCabinetData(); // Вызовет с текущим cabinet.cabinetType
}

if (configSelect) {
    // Удаляем старый слушатель
    configSelect.removeEventListener('change', configSelect._updateListener);
    configSelect._updateListener = handleConfigChange; // Сохраняем ссылку
    configSelect.addEventListener('change', handleConfigChange);
}
// --- Конец Блока 7 ---

    // --- Блок 8: Позиционирование меню ---
    setTimeout(() => {
        // ... (код позиционирования) ...
         const menuWidth = menu.offsetWidth;
         const menuHeight = menu.offsetHeight;
         const screenWidth = window.innerWidth;
         const screenHeight = window.innerHeight;

         let left = parseFloat(menu.style.left);
         let top = parseFloat(menu.style.top);

         if (left + menuWidth > screenWidth) left = screenWidth - menuWidth - 5;
         if (left < 0) left = 5;
         if (top + menuHeight > screenHeight) top = screenHeight - menuHeight - 5;
         if (top < 0) top = 5;

         menu.style.left = `${left}px`;
         menu.style.top = `${top}px`;

        // Фокус на первом поле ввода
        const firstField = menu.querySelector('#cabinetWidth'); // Фокусируемся на ширине
        if (firstField) {
            firstField.focus();
            firstField.select();
        }
    }, 0);
}

function deleteCabinet(cabinetIndex) {
    saveState("deleteCabinet", { cabinetIndex: cabinetIndex });

    const cabinet = cabinets[cabinetIndex];
    cube.remove(cabinet.mesh);
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

    // Удаляем старые элементы
    if (widthInput) { widthInput.remove(); widthInput = null; }
    if (countertopDepthInput) { countertopDepthInput.remove(); countertopDepthInput = null; }
    if (heightInput) { heightInput.remove(); heightInput = null; }
    if (distanceLine) { cube.remove(distanceLine); distanceLine.geometry.dispose(); distanceLine = null; }
    if (distanceLineDepth) { cube.remove(distanceLineDepth); distanceLineDepth.geometry.dispose(); distanceLineDepth = null; }
    if (toLeftInput) { toLeftInput.remove(); toLeftInput = null; }
    if (toRightInput) { toRightInput.remove(); toRightInput = null; }
    if (toFrontInput) { toFrontInput.remove(); toFrontInput = null; }
    if (toBackInput) { toBackInput.remove(); toBackInput = null; }
    if (lengthDisplayWall) { lengthDisplayWall.remove(); lengthDisplayWall = null; }


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
        cube.remove(countertop.userData.edges);
    }

    cube.remove(countertop);
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
         actualOffsetFromParentWall = calculateLowerCabinetOffset(cabinet);
    } else if (cabinet.type === 'upperCabinet') {
         actualOffsetFromParentWall = cabinet.wallOffset || (20 / 1000); // Используем wallOffset или дефолт 20мм
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
    cube.add(mesh);
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
        hideCabinetMenu(); // Скрываем меню в любом случае
        return;
    }
    const cabinet = cabinets[cabinetIndex];
    if (!cabinet || !cabinet.mesh) {
        console.error("applyCabinetChanges: Не найден объект шкафа или его mesh для индекса", cabinetIndex);
        hideCabinetMenu();
        return;
    }

    // --- СОХРАНЯЕМ ИСХОДНЫЕ ДАННЫЕ ДЛЯ СРАВНЕНИЯ И ОТМЕНЫ ---
    const oldCabinetDataForSave = JSON.parse(JSON.stringify(cabinet));
    delete oldCabinetDataForSave.mesh; delete oldCabinetDataForSave.edges; delete oldCabinetDataForSave.frontMarker;
    saveState("applyCabinetChanges", { cabinetIndex: cabinetIndex, previousData: oldCabinetDataForSave });

    //const wasDetailedInitially = cabinet.isDetailed; // Запоминаем, был ли шкаф детализирован
    const oldType = initialMenuData.originalType;           // Запоминаем старый тип
    const oldConfig = initialMenuData.originalConfig;        // Запоминаем старый конфиг

    // --- Блок 0.5: Временное упрощение, если шкаф детализирован ---
    let wasDetailed = false;
    if (cabinet.isDetailed) {
        console.log("Шкаф детализирован, временно переключаем на простой вид...");
        toggleCabinetDetail(cabinetIndex); // Переключает на куб, обновляет cabinet.isDetailed и cabinet.mesh
        wasDetailed = true;
        // ВАЖНО: После toggleCabinetDetail cabinet.mesh теперь указывает на простой куб
        if (cabinet.isDetailed || !cabinet.mesh || cabinet.mesh.isGroup) {
            // Проверка на случай, если toggleCabinetDetail не сработал
            console.error("Ошибка при временном переключении на простой вид в applyCabinetChanges!");
            // Можно прервать выполнение или продолжить с риском ошибки
             hideCabinetMenu(); return; // Прерываем
        }
        console.log("Шкаф временно упрощен.");
    }

    // --- Блок 1: Подготовка данных ---
    const wallId = cabinet.wallId; // WallId не меняется
    let newWidth = cabinet.width; // Инициализируем текущими значениями
    let newDepth = cabinet.depth;
    let newHeight = cabinet.height; // Высота тоже может меняться для некоторых типов
    let newOffsetAlongWall = cabinet.offsetAlongWall;
    let newOffsetX = cabinet.offsetX;
    let newOffsetZ = cabinet.offsetZ;
    let newOverhang = cabinet.overhang;
    let newFacadeGap = cabinet.facadeGap;
    let newCabinetType = cabinet.cabinetType;
    let newCabinetConfig = cabinet.cabinetConfig;

    try { // Обернем получение данных из DOM
        const widthInput = document.getElementById('cabinetWidth');
        const depthInput = document.getElementById('cabinetDepth');
        const heightInput = document.getElementById('cabinetHeight'); // Учтем и высоту
        const offsetAlongWallInput = document.getElementById('cabinetoffsetAlongWall');
        const offsetXInput = document.getElementById('cabinetOffsetX');
        const offsetZInput = document.getElementById('cabinetOffsetZ');
        const overhangInput = document.getElementById('cabinetOverhang');
        const facadeGapInput = document.getElementById('cabinetFacadeGap');
        const typeSelect = document.getElementById('cabinetType');
        const configSelect = document.getElementById('cabinetConfig');

        if (widthInput) newWidth = parseFloat(widthInput.value) / 1000 || cabinet.width;
        if (depthInput) newDepth = parseFloat(depthInput.value) / 1000 || cabinet.depth;
        // Обновляем высоту, только если поле активно (не disabled)
        if (heightInput && !heightInput.disabled) {
             newHeight = parseFloat(heightInput.value) / 1000 || cabinet.height;
             // Если высоту изменили вручную, делаем ее независимой (для upper/tall)
             if (Math.abs(newHeight - cabinet.height) > 1e-5 && (cabinet.type === 'upperCabinet' || cabinet.isHeightEditable)) {
                 cabinet.isHeightIndependent = true;
             }
        }

        if (offsetAlongWallInput) newOffsetAlongWall = parseFloat(offsetAlongWallInput.value) / 1000; // Не || cabinet.offsetAlongWall, т.к. 0 - валидное значение
        if (offsetXInput) newOffsetX = parseFloat(offsetXInput.value) / 1000;
        if (offsetZInput) newOffsetZ = parseFloat(offsetZInput.value) / 1000;
        if (overhangInput) newOverhang = parseFloat(overhangInput.value) / 1000; // Здесь ?? может быть лучше
        if (facadeGapInput) newFacadeGap = parseFloat(facadeGapInput.value) / 1000 ?? cabinet.facadeGap; // Используем ?? для default
        if (typeSelect) newCabinetType = typeSelect.value;
        if (configSelect) newCabinetConfig = configSelect.value;

    } catch (e) {
        console.error("Ошибка при чтении данных из меню в applyCabinetChanges:", e);
        // Если была детализация, надо вернуть обратно
        if (wasDetailed) {
            console.log("Возвращаем детализацию из-за ошибки чтения данных...");
            toggleCabinetDetail(cabinetIndex); // Вернуть детализацию
        }
        hideCabinetMenu(); return; // Прерываем
    }
     //console.log("Новые параметры прочитаны:", {newWidth, newDepth, newHeight, newOffsetAlongWall, newOffsetX, newOffsetZ});

    // --- ОПРЕДЕЛЯЕМ, ИЗМЕНИЛСЯ ЛИ ТИП ИЛИ КОНФИГУРАЦИЯ ---
          
    const typeOrConfigChanged = (oldType !== newCabinetType) || (oldConfig !== newCabinetConfig);

    //console.log("Сброс специфичных свойств из-за смены типа/конфигурации..." + typeOrConfigChanged);
    // --- ЕСЛИ ТИП/КОНФИГ ИЗМЕНИЛИСЬ И ШКАФ БЫЛ ДЕТАЛИЗИРОВАН -> УПРОЩАЕМ ---
    /*if (typeOrConfigChanged && wasDetailedInitially) {
        console.log(`Тип/конфиг изменились для детализированного шкафа ${cabinetIndex}. Временно упрощаем.`);
        toggleCabinetDetail(cabinetIndex); // Переключит на куб, cabinet.isDetailed станет false
        if (cabinet.isDetailed || !cabinet.mesh || cabinet.mesh.isGroup) {
            console.error("Ошибка при временном переключении на простой вид в applyCabinetChanges!");
            hideCabinetMenu(); return;
        }
        console.log("Шкаф успешно переключен на простой вид для обновления.");
    }*/

    if (typeOrConfigChanged) {
        newWidth = clearCabinetConfig(cabinet, oldConfig);
    }

    // --- Блок 2: Обновление нижних шкафов ---
    if (cabinet.type === 'lowerCabinet' && wallId) {
        // Считываем специфичные параметры для нижнего шкафа
        const newoffsetAlongWall = parseFloat(document.getElementById('cabinetoffsetAlongWall').value) / 1000 || cabinet.offsetAlongWall;
        const overhangInput = document.getElementById('cabinetOverhang').value;
        const newOverhang = overhangInput !== '' && overhangInput !== null && !isNaN(parseFloat(overhangInput))
        ? parseFloat(overhangInput) / 1000
        : cabinet.overhang;

        //const countertopDepth = kitchenGlobalParams.countertopDepth / 1000; // Из глобальных параметров
        //const facadeThickness = cabinet.facadeThickness;
        //const newoffsetFromParentWall = countertopDepth - newDepth - newOverhang - facadeThickness;
        // Обновляем временный объект шкафа новыми данными и передаем в функцию:
        const tempCabData = {
            ...cabinet, // Копируем существующие данные
            depth: newDepth, // Используем новую глубину шкафа
            overhang: newOverhang // Используем новый свес
        };
        const newoffsetFromParentWall = calculateLowerCabinetOffset(tempCabData);
        // ... затем обновляем cabinet.offsetFromParentWall = newoffsetFromParentWall; ...

        // Проверяем, не выходит ли шкаф за пределы стены
        let wallWidth;
        switch (wallId) {
            case "Back":
                wallWidth = currentLength;
                break;
            case "Left":
            case "Right":
                wallWidth = currentHeight;
                break;
        }
        if (newoffsetAlongWall < 0 || newoffsetAlongWall + newWidth > wallWidth) {
            alert("Шкаф выходит за пределы стены по ширине!");
            return;
        }

        // Обновляем параметры шкафа
        cabinet.width = newWidth;
        cabinet.depth = newDepth;
        cabinet.offsetAlongWall = newoffsetAlongWall;
        cabinet.overhang = newOverhang;
        cabinet.facadeGap = newFacadeGap;
        cabinet.offsetFromParentWall = newoffsetFromParentWall;
        cabinet.cabinetType = document.getElementById('cabinetType').value || cabinet.cabinetType;
        cabinet.cabinetConfig = document.getElementById('cabinetConfig').value || cabinet.cabinetConfig;

        // --- НАЧАЛО ИЗМЕНЕНИЯ ---
        // Обновляем геометрию и позицию ТОЛЬКО если это НЕ детализированный шкаф
        if (!cabinet.isDetailed) {
            if (cabinet.mesh.geometry) cabinet.mesh.geometry.dispose(); // Проверка на существование
            cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
            if (cabinet.edges && cabinet.edges.geometry) { // Проверка ребер
                cabinet.edges.geometry.dispose();
                cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
            }
        } else {
            console.warn("Применение изменений к детализированному шкафу. Геометрия не обновлена, требуется пересоздание.");
            // В будущем здесь можно вызывать пересоздание группы,
            // но пока просто пропускаем обновление геометрии куба.
        }
        // --- КОНЕЦ ИЗМЕНЕНИЯ ---
        updateCabinetPosition(cabinet);
    }

    // --- Блок 3: Обновление свободностоящих шкафов ---
    else if (cabinet.type === 'freestandingCabinet') {
        // Считываем параметры для высокого шкафа
        const newOffsetX = parseFloat(document.getElementById('cabinetOffsetX').value) / 1000 || cabinet.offsetX;
        const newOffsetZ = parseFloat(document.getElementById('cabinetOffsetZ').value) / 1000 || cabinet.offsetZ;
        const orientation = document.getElementById('cabinetOrientation').value || "Back";
        //const newOverhang = parseFloat(document.getElementById('cabinetOverhang').value) / 1000 || cabinet.overhang;
        const overhangInput = document.getElementById('cabinetOverhang').value;
        const newOverhang = overhangInput !== '' && overhangInput !== null && !isNaN(parseFloat(overhangInput))
        ? parseFloat(overhangInput) / 1000
        : cabinet.overhang;
        const newHeight = parseFloat(document.getElementById('cabinetHeight').value) / 1000 || cabinet.height;

        // Обновляем параметры
        cabinet.width = newWidth;
        cabinet.depth = newDepth;
        cabinet.height = newHeight;
        cabinet.offsetX = newOffsetX;
        cabinet.offsetZ = newOffsetZ;
        cabinet.overhang = newOverhang;
        cabinet.facadeGap = newFacadeGap;
        cabinet.cabinetType = document.getElementById('cabinetType').value || cabinet.cabinetType;
        cabinet.cabinetConfig = document.getElementById('cabinetConfig').value || cabinet.cabinetConfig;

        // Позиционирование в зависимости от ориентации
        let cabinetX, cabinetZ;
        if (orientation === "Back") {
            cabinetX = -currentLength / 2 + newOffsetX + cabinet.width / 2;
            cabinetZ = -currentHeight / 2 + newOffsetZ + cabinet.depth / 2;
            cabinet.mesh.rotation.y = 0;
        } else if (orientation === "Left") {
            cabinetX = -currentLength / 2 + newOffsetX + cabinet.depth / 2;
            cabinetZ = -currentHeight / 2 + newOffsetZ + cabinet.width / 2;
            cabinet.mesh.rotation.y = THREE.MathUtils.degToRad(90);
        } else if (orientation === "Right") {
            cabinetX = -currentLength / 2 + newOffsetX + cabinet.depth / 2;
            cabinetZ = -currentHeight / 2 + newOffsetZ + cabinet.width / 2;
            cabinet.mesh.rotation.y = THREE.MathUtils.degToRad(-90);
        } else if (orientation === "Front") {
            cabinetX = -currentLength / 2 + newOffsetX + cabinet.depth / 2;
            cabinetZ = -currentHeight / 2 + newOffsetZ + cabinet.width / 2;
            cabinet.mesh.rotation.y = THREE.MathUtils.degToRad(180);
        }


        // Обновляем геометрию и позицию ТОЛЬКО если НЕ детализированный
        if (!cabinet.isDetailed) {
            if (cabinet.mesh.geometry) cabinet.mesh.geometry.dispose();
            cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
            if (cabinet.edges && cabinet.edges.geometry) {
                cabinet.edges.geometry.dispose();
                cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
            }
        } else {
            console.warn("Применение изменений к детализированному шкафу. Геометрия не обновлена.");
        }
        // Позицию обновляем в любом случае
        cabinet.mesh.position.set(cabinetX, cabinet.mesh.position.y, cabinetZ);
    }

    // --- Блок 4: Обновление верхних шкафов ---
    else if (cabinet.type === 'upperCabinet') {
        // Считываем параметры для верхнего шкафа
        const newoffsetAlongWall = parseFloat(document.getElementById('cabinetoffsetAlongWall').value) / 1000 || cabinet.offsetAlongWall;     
        const isMezzanine = document.getElementById('mezzanine').value; // Предполагаем, что это <select> с "true"/"false"
        // Используем kitchenGlobalParams для глобальных размеров
        const countertopHeight = kitchenGlobalParams.countertopHeight / 1000;
        const apronHeight = kitchenGlobalParams.apronHeight / 1000;
        const totalHeight = kitchenGlobalParams.totalHeight / 1000;
        const topApronEdge = apronHeight + countertopHeight;
        //console.log(isMezzanine);
        let newHeightTop = totalHeight - topApronEdge;
        if (isMezzanine == 'normal'){
            //newHeightTop = totalHeight - topApronEdge || cabinet.height;
            //console.log(newHeightTop);
        } else if (isMezzanine == 'mezzanine') {
            newHeightTop = kitchenGlobalParams.mezzanineHeight / 1000;   
            //console.log("антресоль!");
        } else if (isMezzanine == 'underMezzanine') {
            newHeightTop -= kitchenGlobalParams.mezzanineHeight / 1000;
        }
        
        let newOffsetBottom = topApronEdge; 
        // находим расстояние от пола в зависимости от типа шкафа: обычный (0), антресольный (1) или под антресольным (2)
        if (isMezzanine == 'mezzanine') {
            newOffsetBottom = totalHeight - newHeightTop;            
        } else {
            newOffsetBottom = topApronEdge;
        }
        
        // Обновляем параметры шкафа
        cabinet.width = newWidth;
        cabinet.depth = newDepth;
        cabinet.height = newHeightTop;
        cabinet.offsetAlongWall = newoffsetAlongWall;
        cabinet.facadeGap = newFacadeGap;
        cabinet.offsetFromParentWall = 20 / 1000;
        cabinet.offsetBottom = newOffsetBottom;
        cabinet.isMezzanine = isMezzanine;
        cabinet.cabinetType = document.getElementById('cabinetType').value || cabinet.cabinetType;
        cabinet.cabinetConfig = document.getElementById('cabinetConfig').value || cabinet.cabinetConfig;

        // Обновляем геометрию и позицию ТОЛЬКО если НЕ детализированный
        if (!cabinet.isDetailed) {
            if (cabinet.mesh.geometry) cabinet.mesh.geometry.dispose();
            cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
            if (cabinet.edges && cabinet.edges.geometry) {
                cabinet.edges.geometry.dispose();
                cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
            }
        } else {
            console.warn("Применение изменений к детализированному шкафу. Геометрия не обновлена.");
        }
        updateCabinetPosition(cabinet);
    }

    // --- Блок 5: Проверка пересечений и финализация ---
    const hasIntersection = checkCabinetIntersections(cabinet); // Проверяем пересечение для ТЕКУЩЕГО (простого) меша
    // Применяем цвет пересечения к простому кубу
    if (cabinet.mesh.material) {
        cabinet.mesh.material.color.set(hasIntersection ? 0xff0000 : cabinet.initialColor);
        cabinet.mesh.material.needsUpdate = true;
    }
    if (cabinet.edges?.material) {
        cabinet.edges.material.color.set(0x000000); // Возвращаем черный цвет ребер
        cabinet.edges.material.needsUpdate = true;
    }

    // --- Блок 6: Возвращаем детализацию, если она была ---
    if (wasDetailed) {
        console.log("Возвращаем детализацию шкафа...");
        // toggleCabinetDetail удалит текущий простой куб и создаст
        // новую детализированную группу с УЖЕ ОБНОВЛЕННЫМИ размерами из объекта cabinet
        toggleCabinetDetail(cabinetIndex);
        console.log("Детализация восстановлена.");
    }

    // Закрываем меню конфигурации
    hideCabinetMenu();
}

function clearCabinetConfig(cabinet, oldConfig) {
    console.log("Сброс специфичных свойств из-за смены типа/конфигурации...");
    // ВАЖНО: Здесь нужно обнулить/сбросить свойства, которые НЕ ПРИНАДЛЕЖАТ
    // НОВОЙ комбинации newCabinetType и newCabinetConfig.
    // Например, если перешли с 'swing' на 'drawers', обнуляем полки.
    // Если перешли с 'drawers' на 'swing', обнуляем параметры ящиков.

    // Общий сброс (можно уточнить)      
    //cabinet.doorType = 'none'; // Или дефолт для нового типа/конфига
    cabinet.facadeCount = '1';
    cabinet.drawerSet = null;
    cabinet.stretcherDrop = 0;
    cabinet.rearPanel = 'yes';
    // ... и т.д. для всех конфигурационных свойств ...
    //cabinet.sinkDiameter = null; cabinet.sinkType = null;
    //cabinet.ovenHeight = null; cabinet.ovenPosition = null; cabinet.extraOffset = null;
    //cabinet.ovenType = null; cabinet.ovenLevel = null; cabinet.microwaveType = null;
    //cabinet.underOvenFill = null; cabinet.topShelves = null;
    //cabinet.fridgeType = null; cabinet.shelvesAbove = null; cabinet.visibleSide = null;
    //cabinet.doorOpening = null; cabinet.verticalProfile = null;
    //cabinet.dishwasherWidth = 450;
    //cabinet.highDividerDepth = null;

    // Устанавливаем ДЕФОЛТНЫЕ значения для НОВОЙ конфигурации, если это необходимо
    // Например, если newCabinetConfig === 'swing', то cabinet.doorType = 'double';
    if (cabinet.cabinetType !== 'upperCabinet' && cabinet.cabinetConfig === 'swing') {
            cabinet.doorType = cabinet.doorType || 'double'; // Если не было установлено специфично
            cabinet.shelfCount = cabinet.shelfCount || 0;   // Если не было установлено
            cabinet.shelfType = cabinet.shelfType || 'none';
    }
    if (cabinet.cabinetType !== 'upperCabinet' && cabinet.cabinetConfig === 'drawers') {
            cabinet.facadeCount = '2';
            cabinet.drawerSet = cabinet.drawerSet || 'D+D';
            cabinet.shelfCount = 0;
            cabinet.shelfType = 'none';
    }
    // --- === НАЧАЛО: Логика для ширины при смене с falsePanel === ---
    if (oldConfig === 'falsePanel' && cabinet.cabinetConfig!== 'falsePanel') {
        console.log(" - Конфигурация изменена с 'falsePanel'. Установка ширины на дефолтную.");
        return 600 / 1000; // Устанавливаем дефолтную ширину 600мм для нового типа
    }
    return cabinet.width;
    // --- === КОНЕЦ: Логика для ширины === ---
    // ... и так далее для других ...
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

    cube.add(mesh);
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

function updateEdgeColors() {
    if (!edges) return;

    const positions = edges.geometry.attributes.position.array;
    const colors = new Float32Array(positions.length);

    for (let i = 0; i < positions.length; i += 6) {
        const x1 = positions[i], y1 = positions[i + 1], z1 = positions[i + 2];
        const x2 = positions[i + 3], y2 = positions[i + 4], z2 = positions[i + 5];

        let isSelectedEdge = false;
        if (selectedFaceIndex !== -1) {
            const face = faceNormals[selectedFaceIndex];
            const nx = face.normal.x * currentLength / 2;
            const ny = face.normal.y * currentWidth / 2;
            const nz = face.normal.z * currentHeight / 2;
            const threshold = Math.max(currentLength, currentWidth, currentHeight) / 2 * 0.6;

            if (nx !== 0 && Math.abs(x1 - nx) < threshold && Math.abs(x2 - nx) < threshold) isSelectedEdge = true;
            if (ny !== 0 && Math.abs(y1 - ny) < threshold && Math.abs(y2 - ny) < threshold) isSelectedEdge = true;
            if (nz !== 0 && Math.abs(z1 - nz) < threshold && Math.abs(z2 - nz) < threshold) isSelectedEdge = true;
        }

        const color = isSelectedEdge ? [0, 1, 1] : [0, 0, 0];
        colors[i] = color[0]; colors[i + 1] = color[1]; colors[i + 2] = color[2];
        colors[i + 3] = color[0]; colors[i + 4] = color[1]; colors[i + 5] = color[2];
    }

    if (!edges.geometry.attributes.color) {
        edges.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        edges.material = new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 3 });
    } else {
        edges.geometry.attributes.color.array.set(colors);
        edges.geometry.attributes.color.needsUpdate = true;
        edges.material.linewidth = selectedFaceIndex !== -1 ? 3 : 2;
        edges.material.needsUpdate = true;
    }

    const baseColor = document.getElementById('cubeColor').value;
    materials.forEach((material, index) => {
        material.color.set(index === selectedFaceIndex ? 0xADD8E6 : baseColor);
    });
}

function updateFaceBounds() {
    if (!cube) return;

    const cameraDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const projector = new THREE.Vector3();
    faceBoundsTable.innerHTML = '';

    faceNormals.forEach((face, index) => {
        const globalNormal = face.normal.clone().applyEuler(cube.rotation);
        const dot = globalNormal.dot(cameraDirection);
        const isVisible = dot > 0;

        let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
        if (isVisible) {
            const vertices = getFaceVertices(face.id);
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

            vertices.forEach(vertex => {
                projector.copy(vertex).applyMatrix4(cube.matrixWorld).project(camera);
                minX = Math.min(minX, projector.x);
                minY = Math.min(minY, projector.y);
                maxX = Math.max(maxX, projector.x);
                maxY = Math.max(maxY, projector.y);
            });

            x1 = minX.toFixed(2);
            y1 = minY.toFixed(2);
            x2 = maxX.toFixed(2);
            y2 = maxY.toFixed(2);
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${face.id}</td>
            <td>${x1}</td>
            <td>${y1}</td>
            <td>${x2}</td>
            <td>${y2}</td>
        `;
        faceBoundsTable.appendChild(row);
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

rotateXSlider.addEventListener('input', () => {
    if (cube) {
        cube.rotation.x = THREE.MathUtils.degToRad(parseFloat(rotateXSlider.value));
        edges.rotation.x = cube.rotation.x;
        updateRotationDisplay();
        updateEdgeColors();
        updateFaceBounds();
    }
});

rotateYSlider.addEventListener('input', () => {
    if (cube) {
        cube.rotation.y = THREE.MathUtils.degToRad(parseFloat(rotateYSlider.value));
        edges.rotation.y = cube.rotation.y;
        updateRotationDisplay();
        updateEdgeColors();
        updateFaceBounds();
    }
});

zoomSlider.addEventListener('input', () => {
    if (cube) {
        camera.position.z = parseFloat(zoomSlider.value);
        directionalLight.position.set(0, 0, camera.position.z);
        camera.updateProjectionMatrix();
        updateFaceBounds();
    }
});

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
        cube.add(distanceLine);

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
    cube.add(distanceLine);
    distanceLineDepth = createLine(depthLineStart, depthLineEnd);
    cube.add(distanceLineDepth);

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
    if (distanceLineDepth) { cube.remove(distanceLineDepth); distanceLineDepth.geometry.dispose(); distanceLineDepth = null; }
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
             cube.add(distanceLine);
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
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, activeCamera);

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
    selectedFaceIndex = -1; // Сбрасываем выделение стены
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
        if (intersect.face) {
            const normal = intersect.face.normal.clone().applyEuler(cube.rotation);
            const cameraDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            let bestMatchIndex = -1;
            let highestDot = -Infinity;

            faceNormals.forEach((face, index) => {
                const globalNormal = face.normal.clone().applyEuler(cube.rotation);
                const dot = globalNormal.dot(cameraDirection);
                if (dot > 0.1) { // Порог видимости
                    const vertices = getFaceVertices(face.id);
                    if (vertices && vertices.length > 0) {
                        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                        vertices.forEach(vertex => {
                            const proj = vertex.clone().applyMatrix4(cube.matrixWorld).project(camera);
                            minX = Math.min(minX, proj.x); minY = Math.min(minY, proj.y);
                            maxX = Math.max(maxX, proj.x); maxY = Math.max(maxY, proj.y);
                        });
                        if (mouse.x >= minX && mouse.x <= maxX && mouse.y >= minY && mouse.y <= maxY) {
                            const angle = normal.angleTo(globalNormal);
                            if (angle < 0.1) {
                                if (dot > highestDot) {
                                    highestDot = dot;
                                    bestMatchIndex = index;
                                }
                            }
                        }
                    }
                }
            });
            selectedFaceIndex = bestMatchIndex;
            // console.log("Выбрана стена:", selectedFaceIndex !== -1 ? faceNormals[selectedFaceIndex].id : "None");
        } else {
            // console.warn("Пересечение со стеной без face.");
            selectedFaceIndex = -1;
        }
        // --- Конец логики определения selectedFaceIndex ---

    } else { // Клик в пустоту
        selectedCabinets = []; // Снять выделение объектов
        selectedFaceIndex = -1; // Снять выделение стены
         // Инпуты и меню уже скрыты выше
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
    updateEdgeColors(); // Обновляем цвет ребер стен
    updateSelectedFaceDisplay(); // Обновляем UI для грани/объекта

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
            //console.log("Mousedown на шкафу UUID:", cabinetHitData.mesh?.uuid);
            potentialDrag = true; // Устанавливаем флаг потенциального перетаскивания
            isRotating = false;   // Сбрасываем флаг вращения

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

                        cube.add(cloned.mesh); // Добавляем ПРОСТОЙ меш клона в сцену
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
            isRotating = true;   // Устанавливаем флаг вращения
            previousMouseX = event.clientX;
            previousMouseY = event.clientY;
            renderer.domElement.style.cursor = 'grabbing';
        }
    }
    // --- Обработка ПРАВОЙ кнопки мыши (event.button === 2) ---
    else if (event.button === 2) {
        //console.log("Mousedown ПКМ");
        // Предотвращаем контекстное меню браузера
        event.preventDefault();

        // Начинаем панорамирование, если не идет drag шкафа
        if (!draggedCabinet) {
           //console.log(" - Начинаем панорамирование.");
           isPanning = true;       // <--- Устанавливаем флаг панорамирования
           isRotating = false;     // <--- Сбрасываем флаг вращения
           potentialDrag = false;  // <--- Сбрасываем флаг потенциального drag
           previousPanX = event.clientX;
           previousPanY = event.clientY;
           renderer.domElement.style.cursor = 'grabbing'; // Или 'move'

            // --- Расчет точки панорамирования (panTarget) удаляем ---

        } else {
            console.log(" - Mousedown ПКМ проигнорирован (идет перетаскивание шкафа).");
        }
   }
});

// В script.js (на верхнем уровне, НЕ внутри другой функции)

// Этот обработчик отвечает ТОЛЬКО за ОСТАНОВКУ ВРАЩЕНИЯ СЦЕНЫ
document.addEventListener('mouseup', () => {
    // Этот обработчик вызывается ВСЕГДА при отпускании ЛЮБОЙ кнопки мыши на документе

    // Останавливаем вращение, если оно было активно
    if (isRotating) {
        //console.log("Mouseup (глобальный) - Остановка вращения."); // Лог
        isRotating = false; // Сбрасываем флаг вращения

        // Сбрасываем курсор, только если НЕ идет перетаскивание шкафа
        // (onMouseUp для перетаскивания сам сбросит курсор)
        if (!draggedCabinet) {
            renderer.domElement.style.cursor = 'default'; // Возвращаем курсор по умолчанию
            //console.log("Mouseup (глобальный) - Курсор сброшен (не было перетаскивания)."); // Лог
        } else {
            //console.log("Mouseup (глобальный) - Курсор НЕ сброшен (идет перетаскивание)."); // Лог
        }
    }
    // --- НАЧАЛО: Останавливаем панорамирование ---
    if (isPanning) {
        //console.log("Mouseup - Остановка панорамирования.");
        isPanning = false;
         // Сбрасываем курсор, только если не вращение и не перетаскивание
        if (!isRotating && !draggedCabinet) {
             renderer.domElement.style.cursor = 'default';
        }
    }
    // --- КОНЕЦ: Останавливаем панорамирование ---

    // В любом случае сбрасываем флаг потенциального перетаскивания,
    // если вдруг он остался установлен после mousedown на шкафу без последующего drag
    if (potentialDrag) {
        //console.log("Mouseup (глобальный) - Сброс флага potentialDrag."); // Лог
        potentialDrag = false;
    }
});

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
        updateRotationDisplay();
        updateEdgeColors();
        updateFaceBounds();

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

        // Запрашиваем перерисовку, если не используется animate() постоянно
        // requestRenderIfNotRequested(); // Ваша функция запроса рендера
         // Если animate() всегда активен, эта строка не нужна

        //console.log("Panning: deltaX=", deltaX, "deltaY=", deltaY, "Offset=", panOffset); // Отладка
    }
    // --- КОНЕЦ: Панорамирование ---
});


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
                applyCabinetConfigChanges(cabinetIndex, cabinets);
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
                applySize();
            }
            break;
        case 'z':
            if (event.ctrlKey) {
                undoLastAction();
            }
            break;
    }
    updateRotationDisplay();
    updateEdgeColors();
    updateFaceBounds();
});

let lastRotationY = 0;
let lastSelectedCabinet = null;
let lastCabinetsLength = 0;
let lastOffsetAlongWall = null; // Для нижних и верхних шкафов
let lastOffsetX = null; // Для свободно стоящих шкафов
let lastOffsetZ = null; // Для свободно стоящих шкафов

// В script.js

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


async function init() { // <-- Делаем функцию асинхронной
    //console.log("--- Начинаем init ---");
    try { // Оборачиваем всю инициализацию в try...catch

        // --- 1. Загрузка данных фасадов (Асинхронно) ---
        await loadFacadeOptions(); // Дожидаемся загрузки данных
        // Инициализируем глобальный массив для данных ИЗ DOM (если его еще нет)
        // или загружаем из localStorage
        window.facadeSetsData = JSON.parse(localStorage.getItem('facadeSets')) || [];
        //console.log("Данные фасадов загружены/инициализированы.");

        // --- 2. Чтение размеров комнаты и цвета ---
        let length = parseFloat(document.getElementById('length').value) || 3500;
        let height = parseFloat(document.getElementById('height').value) || 2600;
        let width = parseFloat(document.getElementById('width').value) || 2500;
        const color = document.getElementById('cubeColor').value || '#d3d3d3';

        length = Math.max(100, Math.min(10000, length)) / 1000;
        height = Math.max(100, Math.min(10000, height)) / 1000;
        width = Math.max(100, Math.min(10000, width)) / 1000;
        //console.log(`Размеры комнаты: L=${length}, H=${height}, W=${width}`);

        // --- 3. Создание осей ---
        //const axesHelper = new THREE.AxesHelper(0.2);
        //axesHelper.position.set(-length / 2 + 0.01, -height / 2 + 0.01, -width / 2 + 0.01);
        //scene.add(axesHelper);
        //console.log("AxesHelper добавлен в сцену.");

        // --- 4. Создание комнаты (куба) ---
        // Вызов createCube теперь внутри try...catch не нужен, т.к. вся init обернута
        createCube(length, height, width, color, THREE.MathUtils.degToRad(30), THREE.MathUtils.degToRad(-30));
        if (!cube) { // Проверяем, создался ли куб
             throw new Error("Не удалось создать основной куб сцены в createCube.");
        }
        //console.log("createCube успешно завершена, куб создан.");

        // --- 5. Запуск анимации ---
        if (typeof animate === 'function') {
            animate();
        } else { throw new Error("Функция animate не найдена!"); }

        // --- 6. Первоначальное обновление UI ---
        if (typeof updateRotationDisplay === 'function') updateRotationDisplay(); else console.warn("updateRotationDisplay не найдена");
        if (typeof updateSelectedFaceDisplay === 'function') updateSelectedFaceDisplay(); else console.warn("updateSelectedFaceDisplay не найдена");
        if (typeof updateEdgeColors === 'function') updateEdgeColors(); else console.warn("updateEdgeColors не найдена");
        if (typeof updateFaceBounds === 'function') updateFaceBounds(); else console.warn("updateFaceBounds не найдена");
        if (typeof updateCountertopButtonVisibility === 'function') updateCountertopButtonVisibility(); else console.warn("updateCountertopButtonVisibility не найдена");
        if (typeof updateHint === 'function') updateHint("Конструктор готов к работе."); else console.warn("updateHint не найдена");

        // --- 7. Инициализация Drag-and-Drop из панели ---
        if (typeof initDragAndDrop === 'function') {
            initDragAndDrop();
        } else { console.warn("Функция initDragAndDrop не найдена!"); }

        //console.log("--- init Завершено успешно ---");

    } catch (error) {
        console.error("!!! КРИТИЧЕСКАЯ ОШИБКА ИНИЦИАЛИЗАЦИИ:", error);
        alert("Ошибка инициализации конструктора. Работа приложения может быть нарушена. Смотрите консоль разработчика (F12).");
        // Можно добавить здесь код для отображения сообщения об ошибке пользователю на странице
    }
}

// Убедитесь, что глобальные переменные cube и edges объявлены в начале файла:
// let cube, edges;
// let cabinets = [];
// let windows = [];
// let countertops = [];
// ... и т.д.

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
    cube.add(mesh);
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
        microwaveType: '380',
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
        highDividerDepth: 560   //глубина вертикальной стойки-разделителя
    };
    cabinets.push(obj);

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
    cube.add(mesh);
    const obj = {
        mesh: mesh,
        wallId: wallId,
        initialColor: params.initialColor,
        width: params.defaultWidth,
        height: params.defaultHeight,
        depth: params.defaultDepth,
        offsetAlongWall: offsetAlongWall,
        offsetBottom: params.defaultOffsetBottom,
        wallOffset: params.wallOffset, // <--- Используем новый параметр
        //offsetFromParentWall: params.defaultoffsetFromParentWall,
        type: 'upperCabinet',
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
init();
initDragAndDrop();

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
    projectState.windows.forEach(w => { delete w.mesh; delete w.edges; /* delete w.другие_ненужные_поля; */ });
    projectState.cabinets.forEach(c => { delete c.mesh; delete c.edges; /* delete c.другие_ненужные_поля; */ });

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
                    updateRotationDisplay();
                    updateEdgeColors();
                    updateSelectedFaceDisplay();
                    updateFaceBounds();

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
    //console.log("--- Начинаем applyKitchenParams ---");
    saveState("updateKitchenParams", { description: "Изменение параметров кухни" });

    // --- Блок 1: Запоминаем детализированные и временно упрощаем ВСЕ в данных ---
    const detailedCabinetInfo = []; // Сохраняем { uuid, index }
    cabinets.forEach((cabinet, index) => {
        if (cabinet.isDetailed && cabinet.mesh && cabinet.mesh.isGroup) { // Проверяем, что это действительно группа
            detailedCabinetInfo.push({ uuid: cabinet.mesh.uuid, index: index });
            console.log(`Запомнен детализированный для applyKitchenParams: UUID ${cabinet.mesh.uuid}, Индекс ${index}`);
            // Временно меняем ТОЛЬКО флаг в данных. Не трогаем mesh здесь.
            cabinet.isDetailed = false;
            // cabinet.mesh = null; // Пока не обнуляем mesh, он понадобится для получения позиции/вращения
            cabinet.edges = null; // У детализированных нет глобальных ребер
        } else if (cabinet.isDetailed) {
            // Если isDetailed=true, но mesh не группа, сбрасываем флаг
            console.warn(`Шкаф ${cabinet.mesh?.uuid} помечен как isDetailed, но mesh не Group. Сбрасываем флаг.`);
            cabinet.isDetailed = false;
        }
    });
    console.log(`Запомнено ${detailedCabinetInfo.length} детализированных шкафов.`);

    // --- Блок 2: Обновление kitchenGlobalParams ---
    try { // Обернем получение значений в try...catch
        kitchenGlobalParams.countertopHeight = parseFloat(document.getElementById('countertopHeight').value) || kitchenGlobalParams.countertopHeight;
        kitchenGlobalParams.countertopThickness = parseFloat(document.getElementById('countertopThickness').value) || kitchenGlobalParams.countertopThickness;
        kitchenGlobalParams.plinthHeight = parseFloat(document.getElementById('plinthHeight').value) || kitchenGlobalParams.plinthHeight;
        kitchenGlobalParams.totalHeight = parseFloat(document.getElementById('totalHeight').value) || kitchenGlobalParams.totalHeight;
        kitchenGlobalParams.apronHeight = parseFloat(document.getElementById('apronHeight').value) || kitchenGlobalParams.apronHeight;
        kitchenGlobalParams.mezzanineHeight = parseFloat(document.getElementById('mezzanineHeight').value) || kitchenGlobalParams.mezzanineHeight;
        kitchenGlobalParams.countertopType = document.getElementById('countertopType').value;
        kitchenGlobalParams.handleType = document.getElementById('handleType').value;
        kitchenGlobalParams.kitchenType = document.getElementById('kitchenType').value;
        kitchenGlobalParams.golaMinHeightMm = parseFloat(document.getElementById('golaMinHeightMm').value) || kitchenGlobalParams.golaMinHeightMm; // Считываем новое значение
        // Ограничиваем значение Гола
        kitchenGlobalParams.golaMinHeightMm = Math.max(3, Math.min(50, kitchenGlobalParams.golaMinHeightMm));
    } catch (e) {
        console.error("Ошибка при чтении параметров из DOM в applyKitchenParams:", e);
        // Можно прервать выполнение или использовать старые значения
        return; // Прерываем, если не смогли прочитать параметры
    }
    console.log("Глобальные параметры кухни обновлены.");

    // --- Блок 3: Пересчёт размеров/позиций ВСЕХ шкафов в данных ---
    console.log("Пересчет данных шкафов...");
    cabinets.forEach(cabinet => {
        // --- Ваша СУЩЕСТВУЮЩАЯ логика расчета новой высоты, offsetBottom, offsetFromParentWall ---
        // --- Обновляет свойства ТОЛЬКО в объекте cabinet ---
        // ... (вставьте сюда вашу логику расчета cabinet.height, cabinet.offsetBottom и т.д.)
        if (cabinet.type === 'lowerCabinet' && !cabinet.isHeightIndependent) {
            cabinet.height = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;
            cabinet.offsetBottom = kitchenGlobalParams.plinthHeight / 1000;
            cabinet.offsetFromParentWall = calculateLowerCabinetOffset(cabinet);
        } else if (cabinet.type === 'upperCabinet') {
            if (cabinet.isMezzanine == 'normal') { /*...*/ cabinet.height = (kitchenGlobalParams.totalHeight - kitchenGlobalParams.countertopHeight - kitchenGlobalParams.apronHeight) / 1000; cabinet.offsetBottom = (kitchenGlobalParams.countertopHeight + kitchenGlobalParams.apronHeight) / 1000; }
            else if (cabinet.isMezzanine == 'mezzanine') { /*...*/ cabinet.height = kitchenGlobalParams.mezzanineHeight / 1000; cabinet.offsetBottom = (kitchenGlobalParams.totalHeight - kitchenGlobalParams.mezzanineHeight) / 1000; }
            else if (cabinet.isMezzanine == 'underMezzanine') { /*...*/ cabinet.height = (kitchenGlobalParams.totalHeight - kitchenGlobalParams.countertopHeight - kitchenGlobalParams.apronHeight - kitchenGlobalParams.mezzanineHeight) / 1000; cabinet.offsetBottom = (kitchenGlobalParams.countertopHeight + kitchenGlobalParams.apronHeight) / 1000; }
        } else if (cabinet.isHeightIndependent && cabinet.type !== 'freestandingCabinet') {
            cabinet.height = (kitchenGlobalParams.totalHeight - kitchenGlobalParams.plinthHeight) / 1000;
            cabinet.offsetBottom = kitchenGlobalParams.plinthHeight / 1000;
        }
        // --- Конец логики расчета ---

        // Обновляем позицию в данных на основе НОВЫХ размеров/отступов
        // Функция updateCabinetPosition должна использовать данные из cabinet и обновлять cabinet.mesh.position
        // Важно: cabinet.mesh здесь может быть как старой группой, так и простым мешем.
        // updateCabinetPosition должна корректно работать с обоими.
        if (cabinet.mesh) { // Обновляем позицию только если есть mesh
            updateCabinetPosition(cabinet);
        }
    });
    console.log("Данные (размеры/позиции) шкафов обновлены.");

    // --- Блок 3.5 - Обновление столешниц ---
    // ... (Ваш код обновления столешниц остается без изменений) ...
     console.log("Обновление столешниц...");
     const newGlobalCountertopHeightFromFloor = kitchenGlobalParams.countertopHeight / 1000;
     const newGlobalCountertopThickness = kitchenGlobalParams.countertopThickness / 1000;
     const roomHeightMeters = currentWidth; const floorY = -roomHeightMeters / 2;
     countertops.forEach(countertop => {
          if (!countertop || !countertop.userData) return;
          if (countertop.userData.heightDependsOnGlobal !== false) {
              const centerRelativeToFloor = newGlobalCountertopHeightFromFloor - newGlobalCountertopThickness / 2;
              const newCenterY = floorY + centerRelativeToFloor;
              countertop.position.y = newCenterY;
          }
          const currentLength = countertop.userData.length;
          const currentDepth = countertop.userData.depth;
          const needsGeometryUpdate = Math.abs(countertop.userData.thickness - newGlobalCountertopThickness) > 1e-5;
          if (needsGeometryUpdate) {
            console.log(` - Обновление геометрии для ${countertop.uuid}: толщина=${newGlobalCountertopThickness}`);
            countertop.userData.thickness = newGlobalCountertopThickness; // Обновляем толщину в данных

            // Очищаем старую геометрию
            if (countertop.geometry) countertop.geometry.dispose();

            // Создаем новую геометрию с АКТУАЛЬНЫМИ размерами и НОВОЙ толщиной
            countertop.geometry = new THREE.BoxGeometry(
                countertop.userData.length,
                newGlobalCountertopThickness, // Новая толщина
                countertop.userData.depth
            );

            // Обновляем геометрию ребер, если они есть
            if (countertop.userData.edges?.geometry) { // Безопасный доступ
                countertop.userData.edges.geometry.dispose();
                // Создаем ребра на основе НОВОЙ геометрии столешницы
                countertop.userData.edges.geometry = new THREE.EdgesGeometry(countertop.geometry);
            }
        }

        // 1. Очищаем старый материал(ы)
        if (countertop.material) {
            if (Array.isArray(countertop.material)) {
                countertop.material.forEach(m => m?.dispose()); // Безопасно очищаем каждый материал в массиве
            } else {
                countertop.material?.dispose(); // Безопасно очищаем одиночный материал
            }
        }

        // 2. Создаем НОВЫЙ материал с АКТУАЛЬНЫМИ параметрами
        const newMaterial = createCountertopMaterial({
            materialType: countertop.userData.materialType,        // Текущий тип материала столешницы (oak, stone, solid)
            solidColor: countertop.userData.solidColor || '#808080', // Текущий цвет столешницы
            textureType: kitchenGlobalParams.countertopType          // *** Используем АКТУАЛЬНЫЙ глобальный тип ***
        });

        // 3. Назначаем новый материал
        countertop.material = newMaterial;

        // 4. Обновляем масштаб текстуры (если применимо)
        updateTextureScale(countertop); // Вызываем всегда после обновления материала

        // 5. Устанавливаем флаг needsUpdate для материала (на всякий случай)
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

        if (!cabinet.mesh) {
            console.warn(`Шкаф с индексом ${index} не имеет меша. Пропускаем обновление 3D.`);
            return;
        }

        if (isOriginallyDetailed) {
            // --- Восстанавливаем детализацию ---
            console.log(`Восстановление детализации для индекса ${index}, UUID ${cabinet.mesh.uuid}`);
            const oldGroup = cabinet.mesh; // Ссылка на старую группу (или временный меш, если был сбой)

            const newDetailedGroup = createDetailedCabinetGeometry(cabinet); // Создаем НОВУЮ группу с НОВЫМИ размерами

            if (newDetailedGroup) {
                newDetailedGroup.uuid = oldGroup.uuid; // Восстанавливаем UUID
                // Копируем позицию/вращение/масштаб из объекта, обновленного updateCabinetPosition
                newDetailedGroup.position.copy(oldGroup.position);
                newDetailedGroup.rotation.copy(oldGroup.rotation);
                newDetailedGroup.scale.copy(oldGroup.scale);

                // Удаляем старый объект из сцены и очищаем его ресурсы
                if (oldGroup.parent) oldGroup.parent.remove(oldGroup);
                oldGroup.traverse((child) => { /* ... код очистки dispose() ... */
                     if (child.isMesh || child.isLineSegments) {
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) {
                            if (Array.isArray(child.material)) child.material.forEach(m => m?.dispose());
                            else child.material?.dispose();
                        }
                     }
                });

                cabinet.mesh = newDetailedGroup; // Обновляем ссылку
                cabinet.isDetailed = true;       // Восстанавливаем флаг
                cabinet.edges = null;
                cube.add(newDetailedGroup);      // Добавляем новую группу в сцену
                console.log(` - Детализация для ${newDetailedGroup.uuid} восстановлена.`);
            } else {
                 console.error(`Не удалось воссоздать детализированную группу для индекса ${index}. Шкаф останется/станет простым.`);
                 cabinet.isDetailed = false; // Сбрасываем флаг
                 // Если старый объект был группой, нужно создать простой меш
                 if (oldGroup.isGroup) {
                     if (oldGroup.parent) oldGroup.parent.remove(oldGroup);
                     oldGroup.traverse((child) => { /* ... код очистки dispose() ... */ });
                     // Создаем простой меш
                     cabinet.mesh = new THREE.Mesh( new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth), new THREE.MeshStandardMaterial({ color: cabinet.initialColor }) );
                     cabinet.mesh.uuid = oldGroup.uuid;
                     // ... добавляем ребра ...
                      const edgesGeom = new THREE.EdgesGeometry(cabinet.mesh.geometry);
                      cabinet.edges = new THREE.LineSegments(edgesGeom, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }));
                      cabinet.edges.raycast = () => {}; cabinet.mesh.add(cabinet.edges);
                     // Устанавливаем позицию/вращение
                     cabinet.mesh.position.copy(oldGroup.position); cabinet.mesh.rotation.copy(oldGroup.rotation); cabinet.mesh.scale.copy(oldGroup.scale);
                     cube.add(cabinet.mesh);
                 } else {
                      // Если старый объект УЖЕ был простым мешем (из-за сбоя в 1 блоке), просто обновляем геометрию
                      if (cabinet.mesh.geometry) cabinet.mesh.geometry.dispose();
                      cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
                      if (cabinet.edges?.geometry) { cabinet.edges.geometry.dispose(); cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry); }
                 }
            }
        } else {
            // --- Обновляем простой шкаф ---
             console.log(`Обновление простого шкафа ${cabinet.mesh.uuid}`);
             if (cabinet.mesh.geometry) cabinet.mesh.geometry.dispose();
             cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
             if (cabinet.edges?.geometry) {
                 cabinet.edges.geometry.dispose();
                 cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
             }
             // Цвет пересечения
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
    selectedCabinets = []; // Сбрасываем выделение
    selectedCabinet = null;
    scene.updateMatrixWorld(true); // Обновляем матрицы

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

/* будем использовать эту функцию из менюс.жс
function hideCabinetConfigMenu() {
    const menu = document.getElementById('cabinetConfigMenu');
    if (menu) menu.style.display = 'none';
}*/


// В script.js

function applyCabinetConfigChanges(cabinetIndex) {
    // --- Проверка индекса и объекта ---
    if (cabinetIndex < 0 || cabinetIndex >= cabinets.length) {
        console.error("applyCabinetConfigChanges: Неверный индекс шкафа", cabinetIndex);
        hideCabinetConfigMenu(); return;
    }
    const cabinet = cabinets[cabinetIndex];
    if (!cabinet) {
        console.error("applyCabinetConfigChanges: Не найден объект шкафа для индекса", cabinetIndex);
        hideCabinetConfigMenu(); return;
    }

    console.log(`--- Начинаем applyCabinetConfigChanges для индекса ${cabinetIndex} (UUID: ${cabinet.mesh?.uuid}) ---`);
    // --- Сохраняем состояние ДО изменений ---
    const previousStateCopy = JSON.parse(JSON.stringify(cabinet)); // Глубокая копия для отмены
    delete previousStateCopy.mesh; delete previousStateCopy.edges; delete previousStateCopy.frontMarker;
    saveState("editCabinetConfig", { cabinetIndex: cabinetIndex, previousState: previousStateCopy });

    const originalTypeFromMenuOpen = initialMenuData.cabinetIndex = initialMenuData.originalType;
    const originalConfigFromMenuOpen = initialMenuData.cabinetIndex = initialMenuData.originalConfig;

    // --- Получаем значения из МЕНЮ КОНФИГУРАЦИИ ---
    const configMenu = document.getElementById('cabinetConfigMenu');
    const newValues = {}; // Объект для сбора новых значений

    if (configMenu && configMenu.style.display !== 'none') {
        configMenu.querySelectorAll('input[type="number"], input[type="text"], select, input[type="color"]').forEach(el => {
            const prop = el.dataset.setProp || el.id;
            if (prop && prop !== 'configureCabinetBtn' && prop !== 'toggleDetailBtn' && prop !== 'applyCabinetConfigChanges') { // Исключаем кнопки
                // Список свойств, которые хранятся в метрах и требуют конвертации из мм
                const propsInMeters = [
                    'height', 'width', 'depth', 'offsetBottom', 'sinkDiameter',
                    'stretcherDrop', 'extraOffset', 'highDividerDepth', 'wallOffset',
                    'cabinetWidth', 'cabinetHeight', 'cabinetDepth', 'cabinetOffsetBottom',
                    'fp_custom_height', 'fp_offset_from_floor', 'fp_depth' // Добавляем свойства фальш-панели
                ];
                const isSizeToConvert = propsInMeters.includes(prop);

                if (el.type === 'number' || el.type === 'text') {
                    const rawValue = parseFloat(el.value.replace(',', '.'));
                    if (!isNaN(rawValue)) {
                        newValues[prop] = isSizeToConvert ? rawValue / 1000 : rawValue;
                    } else {
                        newValues[prop] = cabinet[prop]; // Оставляем старое при ошибке
                        console.warn(`Некорректное значение в поле ${prop}: '${el.value}'. Используется старое.`);
                    }
                } else if (el.type === 'color') {
                    if (prop === 'cabinetMaterialColor') newValues['initialColor'] = el.value;
                    else newValues[prop] = el.value;
                } else if (el.tagName === 'SELECT') {
                    newValues[prop] = el.value;
                }
            }
        });
        console.log("[ApplyConfig] Собранные значения из меню КОНФИГУРАЦИИ:", newValues);
    } else {
        console.log("[ApplyConfig] Меню конфигурации не видимо, значения из него не считываются.");
        // Если меню не видимо, то и применять нечего, но на всякий случай продолжим с текущими данными cabinet
    }
    kitchenGlobalParams.countertopThickness
    const typeActuallyChanged = originalTypeFromMenuOpen !== cabinet.cabinetType;
    const configActuallyChanged = originalConfigFromMenuOpen !== cabinet.cabinetConfig;
    // Также проверяем, не изменился ли config ВНУТРИ самого configMenu (если там есть такой селект)
    const configChangedInConfigMenu = newValues.cabinetConfig !== undefined && newValues.cabinetConfig !== cabinet.cabinetConfig;

    const significantConfigChange = typeActuallyChanged || configActuallyChanged || configChangedInConfigMenu;
    if (significantConfigChange) {
        cabinet.width = clearCabinetConfig(cabinet, originalConfigFromMenuOpen);
    }
    
    // --- Применяем считанные значения к объекту cabinet ---
    // Сначала обновим те свойства, которые могут повлиять на isHeightIndependent или расчет высоты
    if (newValues.fp_height_option !== undefined) cabinet.fp_height_option = newValues.fp_height_option;
    if (newValues.fp_vertical_align !== undefined) cabinet.fp_vertical_align = newValues.fp_vertical_align;
    if (newValues.fp_type !== undefined) cabinet.fp_type = newValues.fp_type; // Для логики в createDetailed...

    // Применяем остальные значения
    Object.assign(cabinet, newValues);
    console.log("[ApplyConfig] Параметры объекта cabinet обновлены:", JSON.parse(JSON.stringify(cabinet)));
    // --- === НАЧАЛО: Авто-расчет глубины для декоративной панели === ---
    // удалено
    // --- === КОНЕЦ: Авто-расчет глубины === ---
    // --- === НАЧАЛО: ОБНОВЛЕНИЕ ШИРИНЫ для ФАЛЬШ-ПАНЕЛИ === ---
    if (cabinet.cabinetConfig === 'falsePanel') {
        if (cabinet.fp_type === 'narrow' || cabinet.fp_type === 'decorativePanel') {
            const { thickness: facadeThicknessM } = getFacadeMaterialAndThickness(cabinet);
            // cabinet.fp_depth УЖЕ должно быть установлено из newValuesFromConfigMenu (в метрах)
            // Ширина контейнера = толщине фасада
            cabinet.width = facadeThicknessM;
            console.log(`[ApplyConfig][FP] Установлена ширина для '${cabinet.fp_type}': ${cabinet.width * 1000} мм`);
        } else if (cabinet.fp_type === 'wideLeft' || cabinet.fp_type === 'wideRight') {
            // Ширина контейнера = cabinet.fp_wide_width (из newValuesFromConfigMenu, в метрах)
            cabinet.width = cabinet.fp_wide_width || (100 / 1000); // Дефолт 100мм, если не задано
            console.log(`[ApplyConfig][FP] Установлена ширина для широкой ФП: ${cabinet.width * 1000} мм`);
        }
        // Глубина контейнера cabinet.depth НЕ МЕНЯЕТСЯ здесь, она должна быть равна глубине соседнего шкафа
        // и устанавливаться при создании/изменении ФП через основное меню applyCabinetChanges
    }
    // --- === КОНЕЦ: ОБНОВЛЕНИЕ ШИРИНЫ для ФАЛЬШ-ПАНЕЛИ === ---


    // --- Устанавливаем isHeightIndependent для фальш-панели ---
    if (cabinet.cabinetConfig === 'falsePanel') {
        if (cabinet.fp_height_option === 'freeHeight' || cabinet.fp_height_option === 'kitchenHeight') {
            cabinet.isHeightIndependent = true;
        } else { // 'cabinetHeight', 'toGola'
            cabinet.isHeightIndependent = false;
        }
        console.log(`[ApplyConfig][FP] isHeightIndependent установлен в: ${cabinet.isHeightIndependent}`);
    } else if (cabinet.type === 'upperCabinet') {
        // Для верхних шкафов, если высота редактировалась в этом меню
        const heightInput = configMenu ? configMenu.querySelector('#cabinetHeight') : null;
        if (heightInput && !heightInput.disabled && newValues.cabinetHeight !== undefined) {
             if (Math.abs(newValues.cabinetHeight - oldCabinetDataForSave.height) > 1e-5) { // Сравниваем с тем, что было ДО открытия меню
                 cabinet.isHeightIndependent = true;
                 console.log(`[ApplyConfig][Upper] Высота изменена вручную, isHeightIndependent=true`);
             }
        }
    } else if (cabinet.cabinetType === 'straight' && ['tallStorage', 'tallOvenMicro', 'fridge', 'highDivider'].includes(cabinet.cabinetConfig)) {
        // Для высоких шкафов, если высота редактировалась
        const heightInput = configMenu ? configMenu.querySelector('#cabinetHeight') : null;
        if (heightInput && !heightInput.disabled && newValues.cabinetHeight !== undefined) {
            if (Math.abs(newValues.cabinetHeight - oldCabinetDataForSave.height) > 1e-5) {
                 cabinet.isHeightIndependent = true;
                 console.log(`[ApplyConfig][Tall] Высота изменена вручную, isHeightIndependent=true`);
            }
        }
    }
    // Для обычных нижних/FS isHeightIndependent обычно false или управляется из другого места


    // --- ПЕРЕСЧЕТ cabinet.height и cabinet.offsetBottom для ФАЛЬШ-ПАНЕЛИ ---
    // Этот расчет должен произойти ПОСЛЕ установки isHeightIndependent
    if (cabinet.cabinetConfig === 'falsePanel') {
        const baseCabinetHeightForFP = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;
        let calculatedFPHeight = baseCabinetHeightForFP;
        let calculatedFPOffsetBottom = kitchenGlobalParams.plinthHeight / 1000;

        // Рассчитываем ОТСТУП ОТ ПОЛА (cabinet.offsetBottom)
        if (cabinet.fp_vertical_align === 'floor') {
            cabinet.offsetBottom = cabinet.fp_offset_from_floor || 0; // Уже в метрах
        } else { // 'cabinetBottom'
            cabinet.offsetBottom = kitchenGlobalParams.plinthHeight / 1000;
        }
        calculatedFPOffsetBottom = cabinet.offsetBottom; // Используем установленное значение

        // Рассчитываем ВЫСОТУ фальш-панели
        switch (cabinet.fp_height_option) {
            case 'cabinetHeight':
                calculatedFPHeight = baseCabinetHeightForFP;
                break;
            case 'toGola':
                const golaH = calculateActualGolaHeight(
                    kitchenGlobalParams.golaMinHeightMm,
                    (cabinet.facadeGap || 0.003) * 1000,
                    baseCabinetHeightForFP * 1000
                ) / 1000;
                calculatedFPHeight = baseCabinetHeightForFP - golaH;
                break;
            case 'kitchenHeight':
                calculatedFPHeight = (kitchenGlobalParams.totalHeight / 1000) - calculatedFPOffsetBottom;
                break;
            case 'freeHeight':
                calculatedFPHeight = cabinet.fp_custom_height || baseCabinetHeightForFP; // fp_custom_height уже в метрах
                break;
        }
        cabinet.height = Math.max(0.05, calculatedFPHeight); // Применяем высоту
        console.log(`[ApplyConfig][FP] Финальные расчетные: height=${cabinet.height.toFixed(3)}м, offsetBottom=${cabinet.offsetBottom.toFixed(3)}м`);
    }
    // Для других типов шкафов cabinet.height УЖЕ должен быть обновлен из поля cabinetHeight (если оно было активно)
    // или будет обновлен в applyKitchenParams/createCube, если isHeightIndependent=false


    // --- Обновление 3D объекта ---
    const wasDetailed = cabinet.isDetailed; // Проверяем текущее состояние детализации
    let geometryChanged = true; // По умолчанию считаем, что геометрия могла измениться

    if (wasDetailed) {
        console.log("[ApplyConfig] Шкаф был детализирован, переключаем на простой для обновления...");
        toggleCabinetDetail(cabinetIndex); // -> простой куб
        if (cabinet.isDetailed || !cabinet.mesh || cabinet.mesh.isGroup) {
            console.error("Ошибка при временном упрощении в applyCabinetConfigChanges!");
            hideCabinetConfigMenu(); return;
        }
    }

    // Теперь cabinet.mesh - это простой куб
    console.log("[ApplyConfig] Обновление геометрии/материала простого куба...");
    try {
        if (cabinet.mesh?.geometry) cabinet.mesh.geometry.dispose();
        cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth); // Используем обновленные width, height, depth
        if (cabinet.edges?.geometry) cabinet.edges.geometry.dispose();
        if (cabinet.edges) {
            cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
        } else { /* создаем ребра, если их не было */ }

        if (cabinet.mesh?.material) {
            cabinet.mesh.material.color.set(cabinet.initialColor); // Обновленный цвет
            cabinet.mesh.material.needsUpdate = true;
        }
        if (cabinet.edges?.material) cabinet.edges.material.needsUpdate = true;
    } catch (e) {
         console.error("[ApplyConfig] Ошибка при обновлении геометрии/материала:", e);
         if (wasDetailed) toggleCabinetDetail(cabinetIndex); // Пытаемся вернуть
         hideCabinetConfigMenu(); return;
    }

    console.log("[ApplyConfig] Обновление позиции...");
    updateCabinetPosition(cabinet);

    const hasIntersection = checkCabinetIntersections(cabinet);
    if (cabinet.mesh?.material) {
        cabinet.mesh.material.color.set(hasIntersection ? 0xff0000 : cabinet.initialColor);
    }

    // Если шкаф был детализирован ИЗНАЧАЛЬНО, возвращаем детализацию
    if (wasDetailed) {
        console.log("[ApplyConfig] Восстанавливаем детализацию...");
        toggleCabinetDetail(cabinetIndex); // Создаст новую группу с обновленными данными
        console.log(`[ApplyConfig] Детализация восстановлена. isDetailed: ${cabinets[cabinetIndex].isDetailed}`);
        if (checkCabinetIntersections(cabinets[cabinetIndex])) { console.warn(`[ApplyConfig] Восстановленный шкаф пересекается!`); }
    }

    hideCabinetConfigMenu();
    console.log(`--- applyCabinetConfigChanges для индекса ${cabinetIndex} Завершено ---`);
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

    updateFaceBounds(); // Обновляем границы
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
        cube.add(countertop); // Добавляем в комнату
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
        cube.add(countertop); // Добавляем в cube
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
function createCountertopFromData(ctData) {
    // 1. Проверка данных (опционально, но полезно)
    if (!ctData || ctData.type !== 'countertop') {
        console.error("Invalid data passed to createCountertopFromData:", ctData);
        return null;
    }

    // 2. Создание геометрии (используя размеры из ctData)
    const geometry = new THREE.BoxGeometry(
        ctData.length || 1, // Значения по умолчанию, если данные отсутствуют
        ctData.thickness || 0.038,
        ctData.depth || 0.6
    );

    // 3. Создание материала (используя тип и цвет из ctData)
    // ---- НАЧАЛО: ИЗМЕНЕННЫЙ БЛОК СОЗДАНИЯ МАТЕРИАЛА ----
    /*let material;
    if (ctData.materialType === 'oak' || ctData.materialType === 'stone') {
        // Загружаем текстуру
        const texturePath = ctData.materialType === 'oak' ? 'textures/oak.jpg' : 'textures/stone.jpg';
        try {
             // Используем try-catch на случай ошибки загрузки текстуры
             const texture = new THREE.TextureLoader().load(texturePath);
             // Создаем материал с текстурой
             // Используй тот же тип материала, что и в applyCountertopChanges (MeshPhongMaterial или MeshStandardMaterial)
             material = new THREE.MeshPhongMaterial({ map: texture }); // или MeshStandardMaterial
             console.log(`Texture loaded for ${ctData.materialType}: ${texturePath}`);
        } catch (error) {
            console.error(`Failed to load texture ${texturePath}:`, error);
            // Резервный серый материал в случае ошибки
            material = new THREE.MeshPhongMaterial({ color: '#cccccc' });
        }

    } else if (ctData.materialType === 'solid') {
        // Создаем однотонный материал
        // Убедись, что ctData.solidColor приходит в правильном формате (например, '#RRGGBB')
         try {
             material = new THREE.MeshPhongMaterial({ color: parseInt(String(ctData.solidColor).replace('#', '0x'), 16) }); // Преобразуем цвет
         } catch (error) {
             console.error(`Invalid color format for solid material: ${ctData.solidColor}`, error);
              material = new THREE.MeshPhongMaterial({ color: '#808080' }); // Резервный цвет
         }
    } else {
        // Резервный вариант для неизвестных типов материала
        console.warn(`Unknown material type "${ctData.materialType}", using fallback.`);
        material = new THREE.MeshPhongMaterial({ color: '#cccccc' });
    }*/
        const material = createCountertopMaterial({
            materialType: ctData.materialType,
            solidColor: ctData.solidColor,
            textureType: kitchenGlobalParams.countertopType
        });
    // ---- КОНЕЦ: ИЗМЕНЕННЫЙ БЛОК СОЗДАНИЯ МАТЕРИАЛА ----
    // Установи другие свойства материала, если нужно (roughness, metalness и т.д.)

    // 4. Создание меша (основного объекта столешницы)
    const countertopMesh = new THREE.Mesh(geometry, material);

    // 5. Установка позиции, вращения, масштаба
    if (ctData.position) {
        countertopMesh.position.set(ctData.position.x, ctData.position.y, ctData.position.z);
    }
    if (ctData.rotation) {
        // Важно: rotation из JSON - это {x, y, z, order}, используем Euler
        countertopMesh.rotation.set(ctData.rotation.x, ctData.rotation.y, ctData.rotation.z, ctData.rotation.order || 'XYZ');
    }
    if (ctData.scale) {
        countertopMesh.scale.set(ctData.scale.x, ctData.scale.y, ctData.scale.z);
    }
     // Установка UUID, если нужно сохранить тот же ID
     if (ctData.uuid) {
         countertopMesh.uuid = ctData.uuid;
     }

    // 6. Восстановление userData
    countertopMesh.userData = {
        type: 'countertop', // Восстанавливаем тип
        wallId: ctData.wallId,
        length: ctData.length,
        depth: ctData.depth,
        thickness: ctData.thickness,
        offsetAlongWall: ctData.offsetAlongWall,
        countertopType: ctData.countertopType,
        materialType: ctData.materialType,
        solidColor: ctData.solidColor,
        // Не восстанавливаем initialMaterial и edges из данных, их создадим заново
    };

    // 7. Создание ребер (Edges)
    const edgesGeometry = new THREE.EdgesGeometry(geometry); // Используем ту же геометрию
    const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 }); // Цвет ребер
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edges.raycast = () => {}; // Делаем ребра невидимыми для Raycaster'а
    // Ребра должны быть спозиционированы так же, как меш.
    // Проще добавить их как дочерний объект к мешу столешницы:
    countertopMesh.add(edges); // Добавляем ребра к мешу столешницы
    // Сохраняем ссылку на ребра в userData, как ты делал в createCountertop
    countertopMesh.userData.edges = edges;

    // 8. Добавление в сцену (в твой 'cube')
    cube.add(countertopMesh); // Добавляем основной меш (с ребрами внутри) в куб

    // ---- НАЧАЛО: ДОБАВЛЕННЫЙ ВЫЗОВ ----
    // Применяем правильный масштаб и поворот текстуры СРАЗУ после создания
    updateTextureScale(countertopMesh);
    // ---- КОНЕЦ: ДОБАВЛЕННЫЙ ВЫЗОВ ----

    console.log('Countertop created from data:', countertopMesh.uuid);

    // 9. Возвращаем созданный объект (меш столешницы)
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
        console.warn(`Набор фасадов не выбран или данные не загружены для шкафа ${cabinetData.mesh?.uuid}. Используется дефолтный белый фасад.`);
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
                 metalness: 0.05 // Небольшой металлик для пластиков/краски
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
                    console.log(`[Фасад] Сформирован путь к XL текстуре: ${texturePath}`);
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
                console.log(`[Фасад] Загрузка текстуры: ${texturePath}`);
                const textureLoader = new THREE.TextureLoader();
                const texture = textureLoader.load(
                    texturePath,
                    (tex) => {
                        console.log(` - Текстура ${texturePath} загружена успешно.`);
                        tex.wrapS = THREE.RepeatWrapping;
                        tex.wrapT = THREE.RepeatWrapping;
                        // Трансформацию применим позже, когда известны точные размеры фасада
                        tex.needsUpdate = true;
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
                     name: `Facade_${setData.materialType}_${setData.texture}`,
                     // --- Добавляем параметры ---
                     roughness: 0.7, // Немного шероховатости для текстур
                     metalness: 0.0
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
       console.log(`[Фасад] Финальный материал: DefaultFacadeWhite, Толщина: ${thicknessMeters * 1000} мм`);
    } else {
       console.log(`[Фасад] Финальный материал: ${facadeMaterial.name}, Толщина: ${thicknessMeters * 1000} мм`);
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
// --- Функция создания детализированной геометрии (Обновленная) ---
/**
 * Создает THREE.Group представляющую детализированную модель шкафа.
 * @param {object} cabinetData - Объект шкафа из массива 'cabinets'.
 * @returns {THREE.Group | null} Группа со всеми частями шкафа или null при ошибке.
 */
function createDetailedCabinetGeometry(cabinetData) {
    // Проверяем, применима ли детализация
    //const supportedConfigs = ['swing', 'drawers']; // Поддерживаемые конфиги
    if (cabinetData.cabinetType !== 'straight' || !supportedConfigs.includes(cabinetData.cabinetConfig)) {
        console.warn(`Детализация пока не поддерживается для типа "${cabinetData.cabinetType}" / конфигурации "${cabinetData.cabinetConfig}"`);
        alert(`Детализация пока доступна только для прямых шкафов с конфигурацией: ${supportedConfigs.join(', ')}.`);
        return null;
    }
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
    console.log(`[Гола] Расчетная актуальная высота Гола: ${actualGolaHeightMeters.toFixed(3)} м`);

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
    console.log(`[createDetailedCabinetGeometry] Создание боковин. Ручка: ${handleType}, Фасадов: ${facadeCount}, Конфиг: ${config}`);
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
            console.log(" - Формирование контура боковины С ДВУМЯ вырезами Гола (ЗАГЛУШКА!)");
            // --- ЗАГЛУШКА: Используем пока форму с ОДНИМ вырезом ---
            // TODO: Заменить этот блок на создание формы с двумя вырезами
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
            // --- КОНЕЦ ЗАГЛУШКИ ---
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
        console.log(` - Левая боковина создана. Pos: ${leftSideCenterX.toFixed(3)}, ${leftSideCenterY.toFixed(3)}, ${leftSideCenterZ.toFixed(3)} RotY: ${leftSide.rotation.y.toFixed(2)}`);

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
        console.log(` - Правая боковина создана. Pos: ${rightSideCenterX.toFixed(3)}, ${rightSideCenterY.toFixed(3)}, ${rightSideCenterZ.toFixed(3)} RotY: ${rightSide.rotation.y.toFixed(2)}`);

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

    console.log(`[createDetailedCabinetGeometry] Тип задней панели: ${rearPanelType}`);

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
            console.log(` - Создана полная задняя стенка (Высота: ${backPanelHeight})`);
        }

    } else if (rearPanelType === 'no') {
        // --- 1.2: Вариант "Нет" ---
        console.log(" - Задняя стенка не создается (тип 'no').");
        // Ничего не делаем

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
                 console.log(` - Расчет для halfBottom: Высота ЗС=${backPanelHeightHalf}, Центр Y ЗС=${backPanelCenterYHalf}`);
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
                     console.log(` - Создана задняя стенка ${rearPanelType}`);
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
         console.log(`[createDetailedCabinetGeometry] Тип ручек: ${handleType}, Смещение царги Z: ${golaProfileOffsetZ}`);
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
        console.log(`[Гола] Тип ручки: ${handleType}, Кол-во фасадов: ${facadeCount}, Конфиг: ${config}`);
                                                // так как Гола может быть и сверху, и между ящиками
        
    
    
        if (handleType === 'gola-profile') {
            const golaShape = new THREE.Shape(); /* ... ваш shape ... */
             golaShape.moveTo(0, 0); golaShape.lineTo(0, 5); golaShape.lineTo(14, 5); golaShape.absarc(14, 10, 5, -Math.PI / 2, 0, false);
             golaShape.lineTo(19, 57); golaShape.lineTo(27, 57); golaShape.lineTo(27, 54); golaShape.lineTo(20, 54);
             golaShape.lineTo(20, 10); golaShape.quadraticCurveTo(20, 4, 14, 4); golaShape.lineTo(3, 4); golaShape.lineTo(3, 0); golaShape.closePath();
            const golaProfileLengthMm = (width) * 1000;
            const extrudeSettings = { depth: golaProfileLengthMm, steps: 1, bevelEnabled: false };
            let golaGeometry = null;
            try { /* ... создание и масштабирование golaGeometry ... */
                golaGeometry = new THREE.ExtrudeGeometry(golaShape, extrudeSettings);
                golaGeometry.translate(0, 0, -golaProfileLengthMm / 2); // Центрируем по оси выдавливания
                 // Смещаем шейп так, чтобы его "задняя" точка (X=0) была в локальном 0 по X геометрии
                 //golaGeometry.translate(-0, -actualGolaHeightMeters*1000 / 2, 0); // Центрируем шейп по Y относительно его высоты
                golaGeometry.scale(1/1000, 1/1000, 1/1000);
            } catch (e) { console.error("Err Gola Geom:", e); }
    
            if (golaGeometry) {
                // --- Верхний Гола-профиль (создается всегда, если handleType='gola-profile') ---
                const golaProfileMesh1 = new THREE.Mesh(golaGeometry, golaMaterial.clone());
                golaProfileMesh1.name = "golaProfile_Top";
                golaProfileMesh1.userData = { isCabinetPart: true, objectType: 'cabinetProfile', orientationType: 'extruded', cabinetUUID: cabinetUUID };
                golaProfileMesh1.rotation.y = Math.PI / 2;
                // Y-центр: Верх шкафа - Половина актуальной высоты Гола
                const golaTopCenterY = height / 2 - 58 / 1000;
                const golaTopCenterX = 0;
                const golaTopCenterZ = depth / 2; // Задняя точка профиля в 27мм от переда
                golaProfileMesh1.position.set(golaTopCenterX, golaTopCenterY, golaTopCenterZ);
                group.add(golaProfileMesh1);
                console.log(` - Верхний Гола-профиль добавлен (Y: ${golaTopCenterY.toFixed(3)})`);
    
                // --- Второй Гола-профиль (для drawers с facadeCount > 1) ---
                if (config === 'drawers' && facadeCount > 1) {
                    console.log("   - Создание второго (среднего) Гола-профиля");
                    const golaProfileMesh2 = new THREE.Mesh(golaGeometry.clone(), golaMaterial.clone());
                    golaProfileMesh2.name = "golaProfile_Middle";
                    golaProfileMesh2.userData = { ...golaProfileMesh1.userData };
                    golaProfileMesh2.rotation.y = Math.PI / 2;
    
                    // Высота нижнего фасада (если 2 или 3 фасада)
                    let bottomFacadeHeight = 0;
                    if (facadeCount === 2 || facadeCount === 3) {
                        bottomFacadeHeight = (height - 2 * actualGolaHeightMeters) / 2; 
                        console.log(`[Гола] Расчетная высота нижнего фасада для 2-го профиля: ${bottomFacadeHeight.toFixed(3)} м`);
                    }
    
                    // Y-центр второго профиля: Низ шкафа + Высота нижнего фасада + Половина высоты Гола
                    const golaMidCenterY = -height / 2 + bottomFacadeHeight - 58 / 1000 + actualGolaHeightMeters;
    
                    golaProfileMesh2.position.set(golaTopCenterX, golaMidCenterY, golaTopCenterZ);
                    group.add(golaProfileMesh2);
                    console.log(`   - Средний Гола-профиль добавлен (Y: ${golaMidCenterY.toFixed(3)})`);
                }
            }
        }
        // --- КОНЕЦ БЛОКА 7 ---
        
        const { material: facadeMaterial, thickness: facadeThicknessMeters } = getFacadeMaterialAndThickness(cabinetData);
        const tb9HandleHeightMeters = 30 / 1000;
    
        // --- БЛОК 8: Фасады ---
        console.log(`[Фасады] Конфиг: ${config}, Тип ручки: ${handleType}, Кол-во фасадов: ${facadeCount}`);
    
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
            console.log(`[Фасады DRAWERS] Кол-во: ${facadeCount}, Тип ручки: ${handleType}`);
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
                //yCurrentPosition += h_each + facadeGapMeters + (handleType === 'aluminum-tv9' ? tb9HandleHeightMeters : 0); // Для Гола здесь нет профиля между 2 и 3 фасадом
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
                
                // --- ИЗМЕНЕНИЕ: Передаем материал для клонирования в createPanel ---
                const facadeMesh = createPanel(
                    drawerFacadeWidth, fData.height, facadeThicknessMeters,
                    facadeMaterialToClone, // <--- Передаем материал, полученный из getFacadeMaterialAndThickness
                    'frontal', `facade_drawer_${index}`
                );
                // --- КОНЕЦ ИЗМЕНЕНИЯ ---
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
                        console.log(`Установлена трансформированная текстура для фасада ${index}`);
                    }

                    group.add(facadeMesh);
    
                    // Создание ручки TB9 для этого фасада ящика
                    if (fData.addTB9Handle) {
                        console.log(`   - Создание ручки TB9 для фасада ящика ${index + 1}`);
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

    console.log(`[createDetailedCabinetGeometry] Создание полок: Тип=${shelfType}, Количество=${shelfCount}`);

    if (shelfType !== 'none' && shelfCount > 0) {
        // 9.1: Расчет размеров полки
        const shelfHeight = panelThickness; // Высота полки = толщина материала
        let shelfWidth = 0;
        let shelfDepth = 0;

        if (shelfType === 'confirmat') {
            shelfWidth = width - 2 * panelThickness; // Между боковинами
            shelfDepth = depth - shelfFrontOffsetMeters; // От задней стенки до отступа спереди
            // Возможно, нужно учесть и толщину задней стенки?
            // shelfDepth = depth - backPanelThickness - shelfFrontOffsetMeters;
             console.log(` - Размеры полки (Конфирмат): W=${shelfWidth.toFixed(3)}, D=${shelfDepth.toFixed(3)}`);
        } else { // shelfHolder или secura_7
            shelfWidth = width - 2 * panelThickness - (2 / 1000); // Между боковинами минус зазор 1+1 мм
            shelfDepth = depth - shelfFrontOffsetMeters; // Так же, как у конфирмата? Или тоже нужен зазор? Пока так.
            // Возможно: shelfDepth = depth - backPanelThickness - shelfFrontOffsetMeters - backClearance;
             console.log(` - Размеры полки (Полкодерж.): W=${shelfWidth.toFixed(3)}, D=${shelfDepth.toFixed(3)}`);
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

                    console.log(`  - Создание полки #${i}: Y=${shelfCenterY.toFixed(3)}, Z=${shelfCenterZ.toFixed(3)}`);
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

function createDetailedFalsePanelGeometry(cabinetData) {
    console.log(`[createDetailedFPGeom] Вызвана для:`, JSON.parse(JSON.stringify(cabinetData)));

    if (cabinetData.cabinetConfig !== 'falsePanel') { /* ... */ return null; }

    const group = new THREE.Group();
    group.userData.isDetailedCabinet = true; // Помечаем как детализированный (хотя панель одна)
    group.userData.objectType = 'cabinet';
    const cabinetUUID = cabinetData.mesh?.uuid || THREE.MathUtils.generateUUID();

    const { material: facadeMaterialToClone, thickness: facadeThicknessMeters } = getFacadeMaterialAndThickness(cabinetData);
    const cabinetMaterialForHolder = new THREE.MeshStandardMaterial({ color: cabinetData.initialColor }); // Для держателя

    const fpType = cabinetData.fp_type || 'narrow';
    // Используем cabinetData.width, cabinetData.height, cabinetData.depth как габариты самой панели
    const panelWidthM = cabinetData.width;
    const panelHeightM = cabinetData.height;
    const panelDepthM = cabinetData.depth;

    console.log(`  - Тип ФП: ${fpType}`);
    console.log(`  - Геометрия панели: W=${panelWidthM.toFixed(3)}, H=${panelHeightM.toFixed(3)}, D=${panelDepthM.toFixed(3)}`);

    if (panelHeightM <= 0 || panelWidthM <= 0 || panelDepthM <= 0) {
        console.warn(`[createDetailedFPGeom] Некорректные габариты для создания панели ФП.`);
        return group; // Возвращаем пустую группу
    }

    let mainPanelMesh = null;
    let panelOrientation = 'frontal'; // По умолчанию для широкой

    if (fpType === 'narrow' || fpType === 'decorativePanel') {
        // Для узкой/декоративной "ширина" геометрии = panelWidthM (это толщина фасада)
        // "глубина" геометрии = panelDepthM (это заданная глубина панели, напр. 582мм)
        panelOrientation = 'vertical'; // Толщина по X геометрии
        mainPanelMesh = createPanel(
            panelWidthM,    // width для createPanel = толщина фасада
            panelHeightM,   // height
            panelDepthM,    // depth для createPanel = заданная глубина ФП
            facadeMaterialToClone,
            panelOrientation,
            `falsePanel_${fpType}`
        );
    } else if (fpType === 'wideLeft' || fpType === 'wideRight') {
        // Для широкой "ширина" геометрии = panelWidthM (напр. 100мм)
        // "глубина" геометрии = panelDepthM (толщина фасада)
        panelOrientation = 'frontal'; // Толщина по Z геометрии
        mainPanelMesh = createPanel(
            panelWidthM,    // width для createPanel = ширина широкой ФП
            panelHeightM,   // height
            panelDepthM,    // depth для createPanel = толщина фасада
            facadeMaterialToClone,
            panelOrientation,
            `falsePanel_${fpType}_facade`
        );

        // --- Добавляем ДЕРЖАТЕЛЬ для широкой ФП ---
        // Держатель ставится сзади лицевой части
        const holderActualWidth = getPanelThickness(); // Ширина держателя = толщина корпуса
        const holderActualHeight = panelHeightM;
        // Глубина держателя = общая глубина "шкафа-контейнера" (cabinetData.depth) МИНУС толщина лицевой части (panelDepthM)
        // Но для широкой ФП cabinetData.depth УЖЕ должно быть глубиной фасада.
        // Глубина держателя должна быть глуб<i>ной примыкающего шкафа</i>
        const adjacentCabinetBodyDepth = objectTypes.lowerCabinet.defaultDepth || (520/1000); // Глубина корпуса соседнего шкафа
        const holderActualDepth = adjacentCabinetBodyDepth - panelDepthM; // panelDepthM здесь - это толщина фасадной части широкой ФП

        if (holderActualDepth > 0.001) {
            const holderMesh = createPanel(
                holderActualWidth, holderActualHeight, holderActualDepth,
                cabinetMaterialForHolder, 'vertical', `falsePanel_${fpType}_holder`
            );
            if (holderMesh) {
                let holderCenterX = 0;
                // Центр Z держателя = задняя грань "шкафа-контейнера" + глубина держателя / 2
                // "Шкаф-контейнер" для широкой ФП имеет глубину panelDepthM (толщина фасада)
                // Держатель ставится СЗАДИ лицевой части.
                // Его передняя грань совпадает с задней гранью лицевой части.
                // Центр Z держателя = - толщина_лицевой/2 - глубина_держателя/2
                const holderCenterZ = - (panelDepthM / 2) - (holderActualDepth / 2);

                if (fpType === 'wideLeft') { // Держатель справа от центра "шкафа-контейнера" ФП
                    holderCenterX = (panelWidthM / 2) - (holderActualWidth / 2);
                } else { // wideRight, держатель слева
                    holderCenterX = -(panelWidthM / 2) + (holderActualWidth / 2);
                }
                holderMesh.position.set(holderCenterX, 0, holderCenterZ);
                holderMesh.userData.cabinetUUID = cabinetUUID;
                group.add(holderMesh);
                console.log(`   - Создан держатель для широкой ФП (${fpType}). Pos Z: ${holderCenterZ.toFixed(3)}`);
            }
        }
    }

    if (mainPanelMesh) {
        // Панель всегда центрирована в своей группе (X=0, Y=0, Z=0),
        // так как размеры группы теперь совпадают с размерами панели.
        mainPanelMesh.position.set(0, 0, 0);
        mainPanelMesh.userData.cabinetUUID = cabinetUUID;

        // Наложение текстуры
        const actualFacadeMaterial = mainPanelMesh.material;
        if (actualFacadeMaterial.map?.isTexture) {
            let textureRenderWidth = panelWidthM;
            let textureRenderHeight = panelHeightM;
            if (panelOrientation === 'vertical') { // Для узкой/декоративной
                textureRenderWidth = panelDepthM; // Видимая "ширина" - это глубина панели
            }
            console.log(`   - Текстура для ${fpType}: TexRenderW=${textureRenderWidth.toFixed(4)}, TexRenderH=${textureRenderHeight.toFixed(4)}`);
            applyTextureTransform(
                actualFacadeMaterial.map,
                cabinetData.textureDirection || 'vertical',
                textureRenderWidth,
                textureRenderHeight
            );
        }
        group.add(mainPanelMesh);
        console.log(`   - Создана основная панель ФП: ${fpType}.`);
    }

    console.log(`[createDetailedFPGeom] Завершено для ${cabinetUUID}. Добавлено детей: ${group.children.length}`);
    return group;
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
    // Проверяем, существует ли mesh перед доступом к userData или isGroup
    if (!currentMeshOrGroup) {
        console.error(`toggleCabinetDetail: Отсутствует mesh для шкафа ${cabinetIndex}. Невозможно переключить.`);
        // Лучше выйти, т.к. состояние данных некорректно
        return;
    }
    const wasSelected = selectedCabinets.includes(cabinet);
    hideAllDimensionInputs();
    console.log(`--- toggleCabinetDetail для индекса ${cabinetIndex} ---`);
    console.log("Текущее состояние:", { isDetailed: cabinet.isDetailed, type: cabinet.type, w: cabinet.width, h: cabinet.height, d: cabinet.depth });

    if (!cabinet.isDetailed || !currentMeshOrGroup.isGroup) {
        // --- Переключение НА Детализацию ---
        console.log(`Переключение НА детализацию для ${currentMeshOrGroup?.uuid}`);
        let detailedGroup = null;
        //const detailedGroup = createDetailedCabinetGeometry(cabinet);
        // --- ИЗМЕНЕНИЕ: Выбираем какую функцию детализации вызвать ---
        if (cabinet.cabinetConfig === 'falsePanel') {
            detailedGroup = createDetailedFalsePanelGeometry(cabinet);
        } else if (cabinet.cabinetType === 'straight' && supportedConfigs.includes(cabinet.cabinetConfig)) { // или другие поддерживаемые
            detailedGroup = createDetailedCabinetGeometry(cabinet);
        } else {
            console.warn(`Детализация для cabinetConfig="${cabinet.cabinetConfig}" (type="${cabinet.cabinetType}") пока не поддерживается напрямую в toggleCabinetDetail.`);
            alert(`Детализация для данной конфигурации шкафа (${cabinet.cabinetConfig}) еще не реализована.`);
            // Можно вернуть кнопку в состояние "Показать детали"
            const button = document.getElementById('toggleDetailBtn');
            if (button) button.textContent = 'Показать детали';
            return; // Выходим, не переключаем
        }
        // --- КОНЕЦ ИЗМЕНЕНИЯ ---
        if (!detailedGroup) { /* ... обработка ошибки ... */
             alert(`Не удалось создать детализацию для этого типа/конфигурации шкафа.`);
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

            if (currentMeshOrGroup?.parent) currentMeshOrGroup.parent.remove(currentMeshOrGroup);
            // Очистка старого меша/ребер
            if (currentMeshOrGroup?.geometry) currentMeshOrGroup.geometry.dispose();
            if (currentMeshOrGroup?.material) { /* ... dispose material(s) ... */
                 if(Array.isArray(currentMeshOrGroup.material)) currentMeshOrGroup.material.forEach(m=>m?.dispose()); else currentMeshOrGroup.material?.dispose();
            }
            if (cabinet.edges?.geometry) cabinet.edges.geometry.dispose();
            if (cabinet.edges?.material) cabinet.edges.material.dispose();

            cabinet.mesh = detailedGroup;
            cabinet.isDetailed = true;
            cabinet.edges = null;
            cube.add(detailedGroup); // Добавляем в ТЕКУЩИЙ куб

            if (wasSelected) applyHighlight(detailedGroup);
            const button = document.getElementById('toggleDetailBtn');
            if (button) button.textContent = 'Скрыть детали';
            updateHint("Показана детализация шкафа");
            // --- Конец упрощенной замены ---
        } catch (error) { /* ... обработка ошибки ... */
             console.error("Ошибка при переключении НА детализацию:", error, cabinet);
             alert("Не удалось создать детализированную модель шкафа.");
        }
    } else {
        // --- Переключение НА Простой Куб ---
        console.log(`Переключение НА простой куб для ${currentMeshOrGroup?.uuid}`);
        try {
            // --- Упрощенная замена ---
            const simpleGeometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
            const simpleMaterial = new THREE.MeshStandardMaterial({ color: cabinet.initialColor });
            const simpleMesh = new THREE.Mesh(simpleGeometry, simpleMaterial);
            simpleMesh.uuid = currentMeshOrGroup.uuid; // Сохраняем UUID

            // Позицию/вращение возьмем из данных cabinet
            updateCabinetPosition(cabinet); // Рассчитаем позицию
            simpleMesh.position.copy(cabinet.mesh.position); // Копируем из группы
            simpleMesh.rotation.copy(cabinet.mesh.rotation);
            simpleMesh.scale.copy(cabinet.mesh.scale);

            const edgesGeometry = new THREE.EdgesGeometry(simpleGeometry);
            const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
            const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
            edges.raycast = () => {}; simpleMesh.add(edges);

            if (currentMeshOrGroup?.parent) currentMeshOrGroup.parent.remove(currentMeshOrGroup);
            // Очистка старой группы
            currentMeshOrGroup?.traverse((child) => { /* ... код dispose() ... */
                 if (child.isMesh || child.isLineSegments) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) child.material.forEach(m=>m?.dispose());
                        else child.material?.dispose();
                    }
                 }
            });

            cabinet.mesh = simpleMesh;
            cabinet.isDetailed = false;
            cabinet.edges = edges;
            cube.add(simpleMesh); // Добавляем в ТЕКУЩИЙ куб

            if (wasSelected) {
                 applyHighlight(simpleMesh);
                 // Показываем инпуты
                 if (cabinet.type === 'freestandingCabinet') showFreestandingCabinetDimensions(cabinet, cabinets);
                 else if (['lowerCabinet', 'upperCabinet'].includes(cabinet.type)) showCabinetDimensionsInput(cabinet, cabinets);
                // Обновляем их позицию сразу
                updateDimensionsInputPosition(cabinet, cabinets);
            }
            const button = document.getElementById('toggleDetailBtn');
            if (button) button.textContent = 'Показать детали';
            updateHint("Показан простой вид шкафа");
            // --- Конец упрощенной замены ---

             // Перепроверяем пересечения для нового куба
             const hasIntersection = checkCabinetIntersections(cabinet);
             if (cabinet.mesh.material) {
                 cabinet.mesh.material.color.set(hasIntersection ? 0xff0000 : cabinet.initialColor);
                 cabinet.mesh.material.needsUpdate = true;
             }

        } catch (error) { /* ... обработка ошибки ... */
             console.error("Ошибка при переключении НА простой вид:", error, cabinet);
             alert("Не удалось вернуться к простому виду шкафа.");
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
    // Обновляем камеру в рендерере (хотя он берет из render() или composer)
    // Обновляем камеру в пассах пост-обработки, если они используются
    if (typeof renderPass !== 'undefined' && renderPass) {
        renderPass.camera = activeCamera;
    }
    if (typeof outlinePass !== 'undefined' && outlinePass) {
        outlinePass.renderCamera = activeCamera;
    }
    // Обновляем raycaster (ВАЖНО!)
    if(raycaster) {
       // raycaster.camera = activeCamera; // Raycaster сам берет камеру из setFromCamera
    }
    console.log("Активная камера обновлена для рендерера/пост-обработки:", activeCamera.type);
}

// --- Настройка ортографической камеры ---
function setupOrthoCameraView(viewType) {
    activeCamera = orthoCamera; // Переключаемся на ортографическую
    console.log(`Переключение на ортографическую камеру для вида: ${viewType}`);

    // Определяем размер сцены для настройки frustum
    // Используем габариты комнаты или находим bounding box всей сцены
    const roomSize = Math.max(currentLength, currentWidth, currentHeight) || 5; // Базовый размер
    const zoomFactor = 1.2; // Небольшой отступ по краям
    const targetFrustumSize = roomSize * zoomFactor;

    // Обновляем frustum ортографической камеры
    const aspect = renderer.domElement.clientWidth / renderer.domElement.clientHeight;
    orthoCamera.left = targetFrustumSize * aspect / -2;
    orthoCamera.right = targetFrustumSize * aspect / 2;
    orthoCamera.top = targetFrustumSize / 2;
    orthoCamera.bottom = targetFrustumSize / -2;
    orthoCamera.near = 0.1;
    orthoCamera.far = 1000; // Увеличим far на всякий случай

    // Устанавливаем позицию и направление камеры
    const distance = roomSize * 5; // Отодвинем камеру подальше

    switch (viewType) {
        case 'Left':
            orthoCamera.position.set(-distance, 0, 0); // Смотрим с -X
            orthoCamera.up.set(0, 1, 0); // Y - вверх
            break;
        case 'Front':
            orthoCamera.position.set(0, 0, distance); // Смотрим с +Z
            orthoCamera.up.set(0, 1, 0); // Y - вверх
            break;
        case 'Top':
            orthoCamera.position.set(0, distance, 0); // Смотрим с +Y
            orthoCamera.up.set(0, 0, -1); // -Z - это "вверх" на виде сверху
            break;
    }
    orthoCamera.lookAt(scene.position); // Смотрим на центр сцены (0,0,0)
    orthoCamera.updateProjectionMatrix(); // Применяем изменения frustum
    console.log("Параметры ортографической камеры обновлены.");

    updateRendererAndPostprocessingCamera(); // Обновляем рендерер/пост-обработку
    updateFaceBounds(); // Обновляем границы граней для новой камеры
    updateEdgeColors(); // Обновляем цвета ребер (если нужно)
}


// Привязка слушателей
// Экспорт функций в window для доступа из HTML (onclick)
// Основные функции
window.addObject = addObject;
window.undoLastAction = undoLastAction;
window.setLeftView = setLeftView;
window.setFrontView = setFrontView;
window.setTopView = setTopView;
window.setIsometricView = setIsometricView;
window.saveProject = saveProject;
window.loadProject = loadProject;
window.applySize = applySize;
// Функции для окон/дверей/розеток
window.applyObjectChanges = applyObjectChanges;
window.deleteWindow = deleteWindow;
window.addAdjacentSocket = addAdjacentSocket;
// Функции для шкафов
window.applyCabinetChanges = applyCabinetChanges;
window.deleteCabinet = deleteCabinet;
window.applyCabinetConfigChanges = applyCabinetConfigChanges;
window.hideCabinetConfigMenu = hideCabinetConfigMenu; // Из menus.js
window.toggleCabinetDetail = toggleCabinetDetail;
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

window.calculateLowerCabinetOffset = calculateLowerCabinetOffset;
window.getFacadeMaterialAndThickness = getFacadeMaterialAndThickness; // Экспортируем и эту, т.к. она тоже нужна
window.objectTypes = objectTypes; // Экспортируем objectTypes, т.к. он нужен для дефолтов