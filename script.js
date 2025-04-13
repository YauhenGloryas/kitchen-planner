import * as THREE from 'three'; // Импорт ядра Three.js
import {
    showCabinetConfigMenu,
    createCabinetConfigMenu,
    updateSpecificConfigFields,
    //hideCabinetConfigMenu
  } from './menus.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, window.innerWidth * 0.7 / window.innerHeight, 0.1, 1000);
camera.position.z = 10;



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
    mezzanineHeight: 400           // Высота антресольных шкафов, мм
};

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
        isMezzanine: 'normal'
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

            mesh.material.color.set(0x00ffff);
            edges.material.color.set(0x00ffff);
            mesh.material.needsUpdate = true;
            edges.material.needsUpdate = true;
        });

        const firstDoorElement = windows.find(w => w.groupId === groupId && w.doorIndex === 0);
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

        mesh.material.color.set(0x00ffff);
        edges.material.color.set(0xff0000);
        mesh.material.needsUpdate = true;
        edges.material.needsUpdate = true;

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

                w.mesh.material.color.set(w.initialColor);
                w.edges.material.color.set(0x000000);
                w.mesh.material.needsUpdate = true;
                w.edges.material.needsUpdate = true;
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
        obj.mesh.material.color.set(obj.initialColor);
        obj.edges.material.color.set(0x000000);
        obj.mesh.material.needsUpdate = true;
        obj.edges.material.needsUpdate = true;
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

    obj.mesh.material.color.set(obj.initialColor);
    obj.edges.material.color.set(0x000000);
    obj.mesh.material.needsUpdate = true;
    obj.edges.material.needsUpdate = true;
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

function createCube(length, height, width, color, rotationX = 0, rotationY = 0) {
    if (cube) scene.remove(cube);
    if (edges) scene.remove(edges);

    const geometry = new THREE.BoxGeometry(length, height, width);
    geometry.groups.forEach((group, index) => group.materialIndex = index);

    materials = [
        new THREE.MeshPhongMaterial({ color: color, side: THREE.BackSide }),
        new THREE.MeshPhongMaterial({ color: color, side: THREE.BackSide }),
        new THREE.MeshPhongMaterial({ color: color, side: THREE.BackSide }),
        new THREE.MeshPhongMaterial({ color: color, side: THREE.BackSide }),
        new THREE.MeshPhongMaterial({ color: color, side: THREE.BackSide }),
        new THREE.MeshPhongMaterial({ color: color, side: THREE.BackSide })
    ];

    cube = new THREE.Mesh(geometry, materials);
    cube.rotation.x = rotationX;
    cube.rotation.y = rotationY;
    scene.add(cube);

    const edgesGeometry = new THREE.EdgesGeometry(geometry);
    const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edges.rotation.x = rotationX;
    edges.rotation.y = rotationY;
    scene.add(edges);

    currentLength = length;
    currentWidth = height;
    currentHeight = width;

    selectedFaceIndex = -1;
    updateSelectedFaceDisplay();
    adjustCameraAndScale(length, height, width);
    updateFaceBounds();

    // Обновляем окна
    windows.forEach(obj => {
        scene.remove(obj.mesh);
        cube.add(obj.mesh);

        const objWidth = obj.width;
        const objHeight = obj.height;
        const objDepth = obj.depth;
        const offsetAlongWall = obj.offsetAlongWall;
        const offsetBottom = obj.offsetBottom;
        const offsetFromParentWall = obj.offsetFromParentWall;

        switch (obj.wallId) {
            case "Back":
                obj.mesh.position.set(
                    -currentLength / 2 + offsetAlongWall + objWidth / 2,
                    -currentWidth / 2 + offsetBottom + objHeight / 2,
                    -currentHeight / 2 + offsetFromParentWall + objDepth / 2
                );
                obj.mesh.rotation.y = 0;
                break;
            case "Left":
                obj.mesh.position.set(
                    -currentLength / 2 + offsetFromParentWall + objDepth / 2,
                    -currentWidth / 2 + offsetBottom + objHeight / 2,
                    -currentHeight / 2 + offsetAlongWall + objWidth / 2
                );
                obj.mesh.rotation.y = THREE.MathUtils.degToRad(90);
                break;
            case "Right":
                obj.mesh.position.set(
                    currentLength / 2 - offsetFromParentWall - objDepth / 2,
                    -currentWidth / 2 + offsetBottom + objHeight / 2,
                    -currentHeight / 2 + offsetAlongWall + objWidth / 2
                );
                obj.mesh.rotation.y = THREE.MathUtils.degToRad(-90);
                break;
        }

        obj.edges.geometry.dispose();
        obj.edges.geometry = new THREE.EdgesGeometry(obj.mesh.geometry);
    });

    // Обновляем шкафы с учётом kitchenGlobalParams
    cabinets.forEach(cabinet => {
        scene.remove(cabinet.mesh);
        cube.add(cabinet.mesh);

        if (cabinet.type === 'lowerCabinet' && !cabinet.isHeightIndependent) {

            cabinet.mesh.geometry.dispose();
            cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
            cabinet.edges.geometry.dispose();
            cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
        } else if (cabinet.type === 'upperCabinet' && !cabinet.isHeightIndependent) {

            cabinet.mesh.geometry.dispose();
            cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
            cabinet.edges.geometry.dispose();
            cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
        }

        if (cabinet.type === 'lowerCabinet' && cabinet.wallId !== 'Bottom') {
            cabinet.offsetFromParentWall = calculateLowerCabinetOffset(cabinet);
        }

        updateCabinetPosition(cabinet);

        const hasIntersection = checkCabinetIntersections(cabinet);
        cabinet.mesh.material.color.set(hasIntersection ? 0xff0000 : cabinet.initialColor);
        cabinet.edges.material.needsUpdate = true;
    });

    // ---- НАЧАЛО: Добавленный блок для столешниц ----
    countertops.forEach(countertop => {
        if (!countertop || !countertop.userData) return; // Пропускаем некорректные

        // 1. Убедимся, что столешница добавлена в новый куб
         if (countertop.parent !== cube) { // Если еще не дочерний объект нового куба
             if(countertop.parent) countertop.parent.remove(countertop); // Отсоединить от старого родителя
             cube.add(countertop); // Добавляем к новому кубу
         }


        // 2. Пересчитываем позицию X/Z и поворот Y
        const { wallId, offsetAlongWall, length, depth } = countertop.userData;
        const roomWidth = currentLength;  // Новая ширина комнаты (X)
        const roomDepth = currentHeight; // Новая глубина комнаты (Z)
        // Предполагаем, что высота Y не меняется при простом ресайзе комнаты
        const newY = countertop.position.y;

        let newX, newZ, newRotY;

        switch (wallId) {
            case 'Back':
                newX = offsetAlongWall + length / 2 - roomWidth / 2;
                newZ = -roomDepth / 2 + depth / 2;
                newRotY = 0;
                break;
            case 'Front':
                newX = offsetAlongWall + length / 2 - roomWidth / 2;
                newZ = roomDepth / 2 - depth / 2;
                newRotY = 0;
                break;
            case 'Left':
                newX = -roomWidth / 2 + depth / 2;
                newZ = offsetAlongWall + length / 2 - roomDepth / 2;
                newRotY = Math.PI / 2;
                break;
            case 'Right':
                newX = roomWidth / 2 - depth / 2;
                newZ = offsetAlongWall + length / 2 - roomDepth / 2;
                newRotY = Math.PI / 2;
                break;
            default:
                console.warn(`Unknown wallId "${wallId}" for countertop ${countertop.uuid}`);
                // Оставляем как есть или перемещаем в центр?
                newX = countertop.position.x;
                newZ = countertop.position.z;
                newRotY = countertop.rotation.y;
                break;
        }

        // 3. Применяем новую позицию и поворот
        countertop.position.set(newX, newY, newZ);
        countertop.rotation.y = newRotY;

        // 4. Обновлять геометрию столешницы и ребер здесь НЕ НУЖНО,
        // т.к. размеры самой столешницы не меняются при ресайзе комнаты.
        // Ребра (дочерний объект) автоматически переместятся вместе со столешницей.
    });
    // ---- КОНЕЦ: Добавленный блок для столешниц ----
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
    if (cube) {
        camera.fov = 0.5;
        camera.position.z = 400;
        camera.updateProjectionMatrix();
        cube.rotation.x = 0;
        cube.rotation.y = THREE.MathUtils.degToRad(90);
        edges.rotation.x = 0;
        edges.rotation.y = THREE.MathUtils.degToRad(90);
        rotateXSlider.value = 0;
        rotateYSlider.value = 90;
        updateRotationDisplay();
        updateEdgeColors();
        updateFaceBounds();
    }
}

function setFrontView() {
    if (cube) {
        camera.fov = 0.5;
        camera.position.z = 400;
        camera.updateProjectionMatrix();
        cube.rotation.x = 0;
        cube.rotation.y = 0;
        edges.rotation.x = 0;
        edges.rotation.y = 0;
        rotateXSlider.value = 0;
        rotateYSlider.value = 0;
        updateRotationDisplay();
        updateEdgeColors();
        updateFaceBounds();
    }
}

function setTopView() {
    if (cube) {
        camera.fov = 0.5;
        camera.position.z = 400;
        camera.updateProjectionMatrix();
        cube.rotation.x = THREE.MathUtils.degToRad(90);
        cube.rotation.y = 0;
        edges.rotation.x = THREE.MathUtils.degToRad(90);
        edges.rotation.y = 0;
        rotateXSlider.value = 90;
        rotateYSlider.value = 0;
        updateRotationDisplay();
        updateEdgeColors();
        updateFaceBounds();
    }
}

function setIsometricView() {
    if (cube) {
        camera.fov = 30;
        camera.position.z = 10;
        camera.updateProjectionMatrix();
        cube.rotation.x = THREE.MathUtils.degToRad(30);
        cube.rotation.y = THREE.MathUtils.degToRad(-30);
        edges.rotation.x = THREE.MathUtils.degToRad(30);
        edges.rotation.y = THREE.MathUtils.degToRad(-30);
        //camera.position.set(10, 10, 10);
        //camera.lookAt(0, 0, 0);
        rotateXSlider.value = 30;
        rotateYSlider.value = -30;
        updateRotationDisplay();
        updateEdgeColors();
        updateFaceBounds();
    }
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
}

function showCabinetMenu(x, y, cabinet) {
    // --- Блок 1: Создание или получение меню ---
    // Проверяем, существует ли меню, или создаём новое
    let menu = document.getElementById('cabinetMenu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'cabinetMenu';
        menu.className = 'popup-menu';
        document.body.appendChild(menu);
    }

    //удаляем поля с размерами шкафа
    // Удаляем старые элементы
    if (widthInput) { widthInput.remove(); widthInput = null; }
    if (depthInput) { depthInput.remove(); depthInput = null; }
    if (heightInput) { heightInput.remove(); heightInput = null; }
    if (distanceLine) { cube.remove(distanceLine); distanceLine.geometry.dispose(); distanceLine = null; }
    if (distanceLineDepth) { cube.remove(distanceLineDepth); distanceLineDepth.geometry.dispose(); distanceLineDepth = null; }
    if (toLeftInput) { toLeftInput.remove(); toLeftInput = null; }
    if (toRightInput) { toRightInput.remove(); toRightInput = null; }
    if (toFrontInput) { toFrontInput.remove(); toFrontInput = null; }
    if (toBackInput) { toBackInput.remove(); toBackInput = null; }

    // --- Блок 2: Заголовок и базовые поля ---
    // Определяем заголовок в зависимости от типа шкафа
    const headerText = cabinet.type === 'upperCabinet' ? 'Параметры верхнего шкафа' :
                      cabinet.type === 'freestandingCabinet' ? 'Параметры свободно стоящего шкафа' :
                      'Параметры нижнего шкафа';
    let html = `
        <h3>${headerText}</h3>
        <div class="menu-content">
            <label>Ширина, мм: <input type="text" id="cabinetWidth" value="${Math.round(cabinet.width * 1000)}" data-min="18" ></label>
            <label>Глубина, мм: <input type="text" id="cabinetDepth" value="${Math.round(cabinet.depth * 1000)}" data-min="100" ></label>
    `;

    // --- Блок 3: Специфичные поля для типов шкафов ---
    if (cabinet.type === 'freestandingCabinet') {
        // Вычисляем текущую ориентацию и смещения
        const rotationY = cabinet.mesh.rotation.y;
        let offsetX, offsetZ;
        if (rotationY === 0) { // Back
            offsetX = Math.round((cabinet.mesh.position.x + currentLength / 2 - cabinet.width / 2) * 1000);
            offsetZ = Math.round((cabinet.mesh.position.z + currentHeight / 2 - cabinet.depth / 2) * 1000);
        } else if (rotationY === THREE.MathUtils.degToRad(90)) { // Left
            offsetX = Math.round((cabinet.mesh.position.x + currentLength / 2 - cabinet.depth / 2) * 1000);
            offsetZ = Math.round((cabinet.mesh.position.z + currentHeight / 2 - cabinet.width / 2) * 1000);
        } else if (rotationY === THREE.MathUtils.degToRad(-90)) { // Right
            offsetX = Math.round((cabinet.mesh.position.x + currentLength / 2 - cabinet.depth / 2) * 1000);
            offsetZ = Math.round((cabinet.mesh.position.z + currentHeight / 2 - cabinet.width / 2) * 1000);
        } else if (rotationY === THREE.MathUtils.degToRad(180)) { // Front
            offsetX = Math.round((cabinet.mesh.position.x + currentLength / 2 - cabinet.width / 2) * 1000);
            offsetZ = Math.round((cabinet.mesh.position.z + currentHeight / 2 - cabinet.depth / 2) * 1000);
        } else { // Дефолт
            offsetX = cabinet.offsetX ? Math.round(cabinet.offsetX * 1000) : 0;
            offsetZ = cabinet.offsetZ ? Math.round(cabinet.offsetZ * 1000) : 0;
        }

        const orientation = rotationY === 0 ? 'Back' :
                           rotationY === THREE.MathUtils.degToRad(90) ? 'Left' :
                           rotationY === THREE.MathUtils.degToRad(-90) ? 'Right' : 
                           rotationY === THREE.MathUtils.degToRad(180) ? 'Front' :
                           'Back';

        html += `
            <label>Высота, мм: <input type="text" id="cabinetHeight" value="${Math.round(cabinet.height * 1000)}" data-min="100" ></label>
            <label>Расстояние от угла по X, мм: <input type="text" id="cabinetOffsetX" value="${offsetX}" data-min="0" ></label>
            <label>Расстояние от угла по Z, мм: <input type="text" id="cabinetOffsetZ" value="${offsetZ}" data-min="0" ></label>
            <label>Свес, мм: <input type="number" id="cabinetOverhang" value="${Math.round((cabinet.overhang) * 1000)}" min="-100" step="1"></label>
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
            <button id="configureCabinetBtn">Настроить шкаф</button>
        `;
    } else if (cabinet.type === 'upperCabinet') {
        // Вычисляем смещение для верхних шкафов
        let offsetAlongWall = (cabinet.wallId === "Back") ?
            (cabinet.mesh.position.x + currentLength / 2 - cabinet.mesh.geometry.parameters.width / 2) * 1000 :
            (cabinet.mesh.position.z + currentHeight / 2 - cabinet.mesh.geometry.parameters.width / 2) * 1000;
        offsetAlongWall = Math.round(offsetAlongWall);

        html += `
            <label>Высота, мм: <input type="text" id="cabinetHeight" value="${Math.round(cabinet.height * 1000)}" data-min="100" ></label>
            <label>Расстояние до угла, мм: <input type="text" id="cabinetoffsetAlongWall" value="${offsetAlongWall}" data-min="0" ></label>
            <label>Отступ от пола, мм: <input type="text" id="cabinetOffsetBottom" value="${Math.round(cabinet.offsetBottom * 1000)}" data-min="0" ></label>
            <label>Зазор между фасадами, мм: <input type="number" id="cabinetFacadeGap" value="${Math.round((cabinet.facadeGap || 0.003) * 1000)}" min="0" step="1"></label>
            <label>Тип верхнего шкафа:</label>
            <select id="mezzanine">
                <option value="normal" ${cabinet.isMezzanine == 'standard'? 'selected' : ''}>Обычный</option>
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
            <button id="configureCabinetBtn">Настроить шкаф</button>
        `;
    } else {
        // Нижние шкафы у стены
        let offsetAlongWall = (cabinet.wallId === "Back") ?
            (cabinet.mesh.position.x + currentLength / 2 - cabinet.mesh.geometry.parameters.width / 2) * 1000 :
            (cabinet.mesh.position.z + currentHeight / 2 - cabinet.mesh.geometry.parameters.width / 2) * 1000;
        offsetAlongWall = Math.round(offsetAlongWall);

        html += `
            <label>Расстояние до угла, мм: <input type="text" id="cabinetoffsetAlongWall" value="${offsetAlongWall}" data-min="0" ></label>
            <label>Свес, мм: <input type="number" id="cabinetOverhang" value="${Math.round((cabinet.overhang) * 1000)}" min="-100" step="1"></label>
            <label>Зазор между фасадами, мм: <input type="number" id="cabinetFacadeGap" value="${Math.round((cabinet.facadeGap || 0.003) * 1000)}" min="0" step="1"></label>
            <label>Тип шкафа:</label>
            <select id="cabinetType">
                <option value="corner" ${cabinet.cabinetType === 'corner' ? 'selected' : ''}>Угловой</option>
                <option value="straight" ${cabinet.cabinetType === 'straight' ? 'selected' : ''}>Прямой</option>
            </select>
            <label>Конфигурация шкафа:</label>
            <select id="cabinetConfig"></select>
            <button id="configureCabinetBtn">Настроить шкаф</button>
        `;
    }

    // --- Блок 4: Кнопки управления ---
    html += `
            <button id="applyCabinetChanges" onclick="applyCabinetChanges(${cabinets.indexOf(cabinet)})">Применить</button>
            <button onclick="deleteCabinet(${cabinets.indexOf(cabinet)})">Удалить</button>
        </div>
    `;

    menu.innerHTML = html;
    menu.style.left = `${x + 30}px`;
    menu.style.top = `${y - 10}px`;
    menu.style.display = 'block';
    document.getElementById('configureCabinetBtn')?.addEventListener('click', () => {
        console.log("pressed conf but");
        showCabinetConfigMenu(cabinets.indexOf(cabinet), x, y, cabinets, kitchenGlobalParams);
    });

    // --- Блок 5: Применяем attachExpressionValidator к нужным полям ---
    const inputsToValidate = [];
    if (cabinet.type === 'freestandingCabinet') {
        inputsToValidate.push(
            document.getElementById('cabinetWidth'),
            document.getElementById('cabinetDepth'),
            document.getElementById('cabinetHeight'),
            document.getElementById('cabinetOffsetX'),
            document.getElementById('cabinetOffsetZ')
        );
    } else if (cabinet.type === 'upperCabinet') {
        inputsToValidate.push(
            document.getElementById('cabinetWidth'),
            document.getElementById('cabinetDepth'),
            document.getElementById('cabinetHeight'),
            document.getElementById('cabinetoffsetAlongWall'),
            document.getElementById('cabinetOffsetBottom')
        );
    } else {
        inputsToValidate.push(
            document.getElementById('cabinetWidth'),
            document.getElementById('cabinetDepth'),
            document.getElementById('cabinetoffsetAlongWall')
        );
    }

    inputsToValidate.forEach(input => attachExpressionValidator(input));

    // --- Блок 6: Обработка выпадающих списков ---
    // Динамически заполняем конфигурации в зависимости от типа шкафа
    const typeSelect = document.getElementById('cabinetType');
    const configSelect = document.getElementById('cabinetConfig');

    function updateConfigOptions() {
        const selectedType = typeSelect ? typeSelect.value : cabinet.cabinetType;
        configSelect.innerHTML = '';

        let options = [];
        if (cabinet.type === 'upperCabinet') {
            if (selectedType === 'cornerUpper') {
                options = [
                    { value: 'cornerUpperStorage', text: 'Угловой, хранение' },
                    { value: 'cornerUpperOpen', text: 'Угловой, открытый' }
                ];
            } else if (selectedType === 'straightUpper') {
                options = [
                    { value: 'swingUpper', text: 'Распашной' },
                    { value: 'liftUpper', text: 'С подъёмным механизмом' },
                    { value: 'openUpper', text: 'Открытый' }
                ];
            }
        } else {
            if (selectedType === 'corner') {
                options = [
                    { value: 'sink', text: 'Шкаф с мойкой' },
                    { value: 'cornerStorage', text: 'Угловой, хранение' }
                ];
            } else if (selectedType === 'straight') {
                options = [
                    { value: 'swing', text: 'Распашной' },
                    { value: 'drawers', text: 'Выдвижные ящики' },
                    { value: 'oven', text: 'Духовка' },
                    { value: 'tallStorage', text: 'Высокий пенал, хранение' },
                    { value: 'tallOvenMicro', text: 'Высокий пенал, духовка+микроволновка' },
                    { value: 'fridge', text: 'Встроенный холодильник' },
                    { value: 'dishwasher', text: 'Посудомойка' },
                    { value: 'highDivider', text: 'Боковая декоративная панель' }
                ];
            }
        }

        options.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.text = option.text;
            opt.selected = option.value === cabinet.cabinetConfig;
            configSelect.appendChild(opt);
        });
    }

    if (typeSelect) {
        updateConfigOptions();
        typeSelect.addEventListener('change', updateConfigOptions);
    } else if (cabinet.type === 'freestandingCabinet') {
        updateConfigOptions(); // Для свободно стоящих без typeSelect
    }

    // --- Блок 6: Позиционирование меню ---
    // Корректируем позицию меню, чтобы не выходило за экран
    setTimeout(() => {
        const menuWidth = menu.offsetWidth;
        const menuHeight = menu.offsetHeight;
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        let left = x + 30;
        let top = y - 10;

        if (left + menuWidth > screenWidth) left = screenWidth - menuWidth - 5;
        if (left < 0) left = 5;
        if (top + menuHeight > screenHeight) top = screenHeight - menuHeight - 5;
        if (top < 0) top = 5;

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;

        const firstField = document.getElementById('cabinetWidth');
        firstField.focus();
        firstField.select();
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
    if (countertop.userData.edges) {
        cube.remove(countertop.userData.edges);
        countertop.userData.edges.geometry.dispose();
        countertop.userData.edges.material.dispose();
    }
    cube.remove(countertop);
    countertop.geometry.dispose();
    countertop.material.dispose();
    // Удаляем из массива countertops
    const index = countertops.indexOf(countertop);
    if (index !== -1) countertops.splice(index, 1);
    // Скрываем поля ввода
    if (toLeftInput) toLeftInput.remove();
    if (toRightInput) toRightInput.remove();
    if (countertopDepthInput) countertopDepthInput.remove();
    if (distanceLine) {
        cube.remove(distanceLine);
        distanceLine.geometry.dispose();
        distanceLine = null;
    }
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

/**
 * Начинает процесс перетаскивания шкафа.
 * @param {object} cabinet - Объект данных шкафа.
 * @param {MouseEvent} event - Событие mousedown.
 * @param {boolean} wasSelected - Был ли шкаф выделен до начала перетаскивания.
 */
function startDraggingCabinet(cabinet, event, wasSelected) { // Добавлен параметр wasSelected
    //console.log(`Dragging started for cabinet ${cabinet.mesh.uuid}. Was selected: ${wasSelected}`);
    draggedCabinet = cabinet;
    // ---> Сохраняем флаг в userData перетаскиваемого шкафа <---
    draggedCabinet.mesh.userData.wasSelectedBeforeDrag = wasSelected;
    isCloningMode = event.shiftKey; // флаг для копирования

    // Сохраняем начальные позиции/офсеты
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragStartoffsetAlongWall = cabinet.offsetAlongWall ?? 0;
    dragStartOffsetX = cabinet.offsetX ?? 0;
    dragStartOffsetZ = cabinet.offsetZ ?? 0;

    // Добавляем слушатели для движения и отпускания мыши
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Можно добавить стиль курсора 'grabbing'
    document.body.style.cursor = 'grabbing';
}

let isDraggingForSave = false; // Глобальный флаг для отслеживания начала перетаскивания

function onMouseMove(event) {
    if (!draggedCabinet) return;

    // --- Initial setup on first move ---
    if (!isDraggingForSave) {
        const cabinetIndex = cabinets.indexOf(draggedCabinet);
        saveState("moveCabinet", { /* ... */ }); // Save initial state
        isDraggingForSave = true;
        // Apply highlight only to dragged item
        const allHighlightableData = [...cabinets, ...windows, ...countertops];
        allHighlightableData.forEach(itemData => removeHighlight(itemData.mesh || itemData));
        selectedCabinets = [];
        applyHighlight(draggedCabinet.mesh);
        // Hide dimension inputs during drag
        // ... (hide inputs) ...
    }

    // --- Raycasting ---
    const rect = renderer.domElement.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
    const intersects = raycaster.intersectObject(cube, false);

    if (intersects.length > 0) {
        const intersectPoint = intersects[0].point.clone().applyMatrix4(cube.matrixWorld.clone().invert());

        // --- Freestanding Cabinet Movement (EXACTLY FROM OLD USER CODE) ---
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

            // Обновляем offsetX и offsetZ с учётом ориентации
            if (rotationY === 0 || rotationY === Math.PI) {
                draggedCabinet.offsetX = draggedCabinet.mesh.position.x + currentLength / 2 - draggedCabinet.width / 2;
                draggedCabinet.offsetZ = draggedCabinet.mesh.position.z + currentHeight / 2 - draggedCabinet.depth / 2;
            } else {
                draggedCabinet.offsetX = draggedCabinet.mesh.position.x + currentLength / 2 - draggedCabinet.depth / 2;
                draggedCabinet.offsetZ = draggedCabinet.mesh.position.z + currentHeight / 2 - draggedCabinet.width / 2;
            }

        } else {
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
    } else {
        // No intersection with cube surface. Maybe stop drag? Or keep last position?
         //console.log("No intersection with cube surface.");
    }
} // End onMouseMove

function onMouseUp(event) {
    if (!draggedCabinet) return;

    const cabinet = draggedCabinet;
    const wasSelected = cabinet.mesh.userData.wasSelectedBeforeDrag;

    // --- Просто завершаем перемещение (клонирование уже было) ---
    const hasIntersection = checkCabinetIntersections(cabinet);
    cabinet.mesh.material.color.set(hasIntersection ? 0xff0000 : cabinet.initialColor);
    cabinet.mesh.material.needsUpdate = true;

    // Если он был выделен ДО начала, восстановим выбор
    if (wasSelected) {
        selectedCabinets = [cabinet];
        selectedCabinet = cabinet;

        if (['lowerCabinet', 'upperCabinet'].includes(cabinet.type)) {
            showCabinetDimensionsInput(cabinet, cabinets);
        } else if (cabinet.type === 'freestandingCabinet') {
            showFreestandingCabinetDimensions(cabinet, cabinets);
        }
    } else {
        // Убираем выделение и эмиссию
        removeHighlight(cabinet.mesh);
        selectedCabinets = [];
        selectedCabinet = null;
    }

    // --- Сброс ---
    draggedCabinet = null;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'default';
    isCloningMode = false;
    justDragged = true;
    isDraggingForSave = false;
    setTimeout(() => justDragged = false, 0);
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
            // Добавь сюда другие свойства, которые ТОЧНО есть у ВСЕХ типов шкафов
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
                clone.falsePanels = original.falsePanels ?? 'none';
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
    } else if (['window', 'door', 'opening', 'socket'].includes(selectedItem.type)) {
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
    switch (cabinet.wallId) {
        case "Back":
            cabinet.mesh.position.set(
                -currentLength / 2 + cabinet.offsetAlongWall + cabinet.width / 2,
                -currentWidth / 2 + cabinet.offsetBottom + cabinet.height / 2,
                -currentHeight / 2 + cabinet.offsetFromParentWall + cabinet.depth / 2
            );
            cabinet.mesh.rotation.y = 0;
            break;
        case "Left":
            cabinet.mesh.position.set(
                -currentLength / 2 + cabinet.offsetFromParentWall + cabinet.depth / 2,
                -currentWidth / 2 + cabinet.offsetBottom + cabinet.height / 2,
                -currentHeight / 2 + cabinet.offsetAlongWall + cabinet.width / 2
            );
            cabinet.mesh.rotation.y = THREE.MathUtils.degToRad(90);
            break;
        case "Right":
            cabinet.mesh.position.set(
                currentLength / 2 - cabinet.offsetFromParentWall - cabinet.depth / 2,
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
    // --- Блок 1: Подготовка данных ---
    // Получаем объект шкафа по индексу
    const cabinet = cabinets[cabinetIndex];
    const wallId = cabinet.wallId;

    // Считываем новые параметры из меню конфигурации шкафа
    const newWidth = parseFloat(document.getElementById('cabinetWidth').value) / 1000 || cabinet.width;
    const newDepth = parseFloat(document.getElementById('cabinetDepth').value) / 1000 || cabinet.depth;
    const newFacadeGap = parseFloat(document.getElementById('cabinetFacadeGap').value) / 1000 || cabinet.facadeGap;
    const newOverhangTop = 20 / 1000; // Фиксированный отступ сверху для верхних шкафов

    // --- Блок 2: Обновление нижних шкафов ---
    if (cabinet.type === 'lowerCabinet' && wallId) {
        // Считываем специфичные параметры для нижнего шкафа
        const newoffsetAlongWall = parseFloat(document.getElementById('cabinetoffsetAlongWall').value) / 1000 || cabinet.offsetAlongWall;
        const overhangInput = document.getElementById('cabinetOverhang').value;
        const newOverhang = overhangInput !== '' && overhangInput !== null && !isNaN(parseFloat(overhangInput))
        ? parseFloat(overhangInput) / 1000
        : cabinet.overhang;

        const countertopDepth = kitchenGlobalParams.countertopDepth / 1000; // Из глобальных параметров
        const facadeThickness = cabinet.facadeThickness;
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

        // Обновляем геометрию и позицию
        cabinet.mesh.geometry.dispose();
        cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
        cabinet.edges.geometry.dispose();
        cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
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


        // Обновляем геометрию и позицию
        cabinet.mesh.geometry.dispose();
        cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
        cabinet.mesh.position.set(cabinetX, cabinet.mesh.position.y, cabinetZ);
        cabinet.edges.geometry.dispose();
        cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
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
        cabinet.offsetFromParentWall = newOverhangTop;
        cabinet.offsetBottom = newOffsetBottom;
        cabinet.isMezzanine = isMezzanine;
        cabinet.cabinetType = document.getElementById('cabinetType').value || cabinet.cabinetType;
        cabinet.cabinetConfig = document.getElementById('cabinetConfig').value || cabinet.cabinetConfig;

        // Обновляем геометрию и позицию
        cabinet.mesh.geometry.dispose();
        cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
        cabinet.edges.geometry.dispose();
        cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
        updateCabinetPosition(cabinet);
    }

    // --- Блок 5: Проверка пересечений и финализация ---
    // Проверяем пересечения и обновляем визуальные материалы
    const hasIntersection = checkCabinetIntersections(cabinet);
    cabinet.mesh.material.color.set(hasIntersection ? 0xff0000 : cabinet.initialColor);
    cabinet.edges.material.color.set(0x000000);
    cabinet.mesh.material.needsUpdate = true;
    cabinet.edges.material.needsUpdate = true;

    // Закрываем меню конфигурации
    hideCabinetMenu();
}

function applyCountertopChanges(countertop, depthValue, materialType, colorValue) {
    const newDepthMm = parseFloat(depthValue);
    //const thickness = kitchenGlobalParams.countertopThickness / 1000;

    // --- Обновление Глубины (и связанных объектов) ---
    if (!isNaN(newDepthMm) && newDepthMm >= 100) {
        updateDepthForWall(countertop.userData.wallId, newDepthMm / 1000);
    } else {
         console.warn("Invalid depth value entered in countertop menu.");
    }

    countertop.userData.materialType = materialType;
    countertop.userData.solidColor = colorValue;

    let newMaterial;
    if (materialType === 'oak' || materialType === 'stone') {
        const texturePath = materialType === 'oak' ? 'textures/oak.jpg' : 'textures/stone.jpg';
        const texture = new THREE.TextureLoader().load(texturePath);
        newMaterial = new THREE.MeshPhongMaterial({ map: texture });
    } else if (materialType === 'solid') {
        newMaterial = new THREE.MeshPhongMaterial({ color: parseInt(colorValue.replace('#', '0x'), 16) });
    }
    countertop.material.dispose();
    countertop.material = newMaterial;
    countertop.userData.initialMaterial = newMaterial.clone();

    // Обновляем текстуру после изменения материала или геометрии
    updateTextureScale(countertop);

    if (countertop.material.color.getHex() === 0x00ffff) {
        updateCountertopDimensionsInputPosition(countertop);
    }
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

    hideSocketMenu();
    showSocketMenu(x, y, newSocket);
    
}
/*
function syncSocketFields(socketWidthMm, socketHeightMm) {
    const socketoffsetAlongWallEdge = document.getElementById('socketoffsetAlongWallEdge');
    const socketoffsetAlongWallCenter = document.getElementById('socketoffsetAlongWallCenter');
    const socketOffsetBottomEdge = document.getElementById('socketOffsetBottomEdge');
    const socketOffsetBottomCenter = document.getElementById('socketOffsetBottomCenter');

    socketoffsetAlongWallEdge.addEventListener('input', function() {
        const edge = parseFloat(this.value) || 0;
        socketoffsetAlongWallCenter.value = Math.round(edge + socketWidthMm / 2);
    });

    socketoffsetAlongWallCenter.addEventListener('input', function() {
        const center = parseFloat(this.value) || 0;
        socketoffsetAlongWallEdge.value = Math.round(center - socketWidthMm / 2) >= 0 ? Math.round(center - socketWidthMm / 2) : 0;
    });

    socketOffsetBottomEdge.addEventListener('input', function() {
        const edge = parseFloat(this.value) || 0;
        socketOffsetBottomCenter.value = Math.round(edge + socketHeightMm / 2);
    });

    socketOffsetBottomCenter.addEventListener('input', function() {
        const center = parseFloat(this.value) || 0;
        socketOffsetBottomEdge.value = Math.round(center - socketHeightMm / 2) >= 0 ? Math.round(center - socketHeightMm / 2) : 0;
    });
}*/

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
    if (widthInput) { widthInput.remove(); widthInput = null; }
    if (depthInput) { depthInput.remove(); depthInput = null; }
    if (heightInput) { heightInput.remove(); heightInput = null; }
    if (distanceLine) { cube.remove(distanceLine); distanceLine.geometry.dispose(); distanceLine = null; }
    if (distanceLineDepth) { cube.remove(distanceLineDepth); distanceLineDepth.geometry.dispose(); distanceLineDepth = null; }
    if (toLeftInput) { toLeftInput.remove(); toLeftInput = null; }
    if (toRightInput) { toRightInput.remove(); toRightInput = null; }
    if (toFrontInput) { toFrontInput.remove(); toFrontInput = null; }
    if (toBackInput) { toBackInput.remove(); toBackInput = null; }

    if (countertopDepthInput) { countertopDepthInput.remove(); countertopDepthInput = null; }

    if (!['lowerCabinet', 'upperCabinet'].includes(cabinet.type)) {
        return;
    }
    
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
            if (!isNaN(newWidthMm) && newWidthMm >= 18) {
                cabinet.width = newWidthMm / 1000;
                cabinet.mesh.geometry.dispose();
                cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
                cabinet.edges.geometry.dispose();
                cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
                widthInput.value = Math.round(cabinet.width * 1000);
                updateCabinetPosition(cabinet);
                updateDimensionsInputPosition(cabinet, cabinets);
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
    // Удаляем старые элементы
    if (widthInput) { widthInput.remove(); widthInput = null; }
    if (depthInput) { depthInput.remove(); depthInput = null; }
    if (heightInput) { heightInput.remove(); heightInput = null; }
    if (distanceLine) { cube.remove(distanceLine); distanceLine.geometry.dispose(); distanceLine = null; }
    if (distanceLineDepth) { cube.remove(distanceLineDepth); distanceLineDepth.geometry.dispose(); distanceLineDepth = null; }
    if (toLeftInput) { toLeftInput.remove(); toLeftInput = null; }
    if (toRightInput) { toRightInput.remove(); toRightInput = null; }
    if (toFrontInput) { toFrontInput.remove(); toFrontInput = null; }
    if (toBackInput) { toBackInput.remove(); toBackInput = null; }

    if (countertopDepthInput) { countertopDepthInput.remove(); countertopDepthInput = null; }

    if (cabinet.type !== 'freestandingCabinet') {
        return;
    }

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
            if (!isNaN(newWidthMm) && newWidthMm >= 100) {
                cabinet.width = newWidthMm / 1000;
                cabinet.mesh.geometry.dispose();
                cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
                cabinet.edges.geometry.dispose();
                cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
                widthInput.value = Math.round(cabinet.width * 1000);
                updateCabinetPosition(cabinet);
                updateDimensionsInputPosition(cabinet, cabinets);
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
            if (!isNaN(newDepthMm) && newDepthMm >= 100) {
                cabinet.depth = newDepthMm / 1000;
                cabinet.mesh.geometry.dispose();
                cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
                cabinet.edges.geometry.dispose();
                cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
                depthInput.value = Math.round(cabinet.depth * 1000);
                updateCabinetPosition(cabinet);
                updateDimensionsInputPosition(cabinet, cabinets);
            }
            event.stopPropagation();
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
        widthCenter.project(camera);

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
        depthCenter.project(camera);

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
        heightCenter.project(camera);
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
            toBackPos = new THREE.Vector3(cabinet.width / 2, cabinet.height / 2, cabinet.depth / 2);
            toFrontPos = new THREE.Vector3(cabinet.width / 2, cabinet.height / 2, cabinet.depth / 2 + (roomHeight - cabinet.depth - cabinet.offsetZ) / 2);
            
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
            toLeftPos = new THREE.Vector3(-cabinet.width / 2 - cabinet.offsetX / 2, cabinet.height / 2, -cabinet.depth / 2);
            toRightPos = new THREE.Vector3(cabinet.width / 2 + (roomLength - cabinet.width - cabinet.offsetX) / 2, cabinet.height / 2, -cabinet.depth / 2);
            toBackPos = new THREE.Vector3(cabinet.width / 2, cabinet.height / 2, cabinet.depth / 2 + (roomHeight - cabinet.depth - cabinet.offsetZ) / 2);
            toFrontPos = new THREE.Vector3(cabinet.width / 2, cabinet.height / 2, -cabinet.depth / 2 - cabinet.offsetZ / 2);

            widthLineStart = new THREE.Vector3(-roomLength / 2, y + cabinet.height / 2, z - cabinet.depth / 2);
            widthLineEnd = new THREE.Vector3(roomLength / 2, y + cabinet.height / 2, z - cabinet.depth / 2);
            depthLineStart = new THREE.Vector3(x + cabinet.width / 2, y + cabinet.height / 2, -roomHeight / 2);
            depthLineEnd = new THREE.Vector3(x + cabinet.width / 2, y + cabinet.height / 2, roomHeight / 2);

            if (toLeftInput) toLeftInput.value = Math.round((roomLength - cabinet.offsetX - cabinet.width) * 1000);
            if (toRightInput) toRightInput.value = Math.round(cabinet.offsetX * 1000);
            if (toBackInput) toBackInput.value = Math.round((roomHeight - cabinet.offsetZ - cabinet.depth) * 1000);
            if (toFrontInput) toFrontInput.value = Math.round(cabinet.offsetZ * 1000);
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
            toLeftPos.project(camera);
            const screenX = (toLeftPos.x + 1) * canvasRect.width / 2 + canvasRect.left;
            const screenY = (-toLeftPos.y + 1) * canvasRect.height / 2 + canvasRect.top;
            const finalX = screenX - canvasRect.left;
            const finalY = screenY - canvasRect.top;
            toLeftInput.style.left = `${finalX - toLeftInput.offsetWidth / 2}px`;
            toLeftInput.style.top = `${finalY - toLeftInput.offsetHeight / 2}px`;
        }
        if (toRightInput) {
            toRightPos.applyMatrix4(cabinet.mesh.matrixWorld);
            toRightPos.project(camera);
            const screenX = (toRightPos.x + 1) * canvasRect.width / 2 + canvasRect.left;
            const screenY = (-toRightPos.y + 1) * canvasRect.height / 2 + canvasRect.top;
            const finalX = screenX - canvasRect.left;
            const finalY = screenY - canvasRect.top;
            toRightInput.style.left = `${finalX - toRightInput.offsetWidth / 2}px`;
            toRightInput.style.top = `${finalY - toRightInput.offsetHeight / 2}px`;
        }
        if (toBackInput) {
            toBackPos.applyMatrix4(cabinet.mesh.matrixWorld);
            toBackPos.project(camera);
            const screenX = (toBackPos.x + 1) * canvasRect.width / 2 + canvasRect.left;
            const screenY = (-toBackPos.y + 1) * canvasRect.height / 2 + canvasRect.top;
            const finalX = screenX - canvasRect.left;
            const finalY = screenY - canvasRect.top;
            toBackInput.style.left = `${finalX - toBackInput.offsetWidth / 2}px`;
            toBackInput.style.top = `${finalY - toBackInput.offsetHeight / 2}px`;
        }
        if (toFrontInput) {
            toFrontPos.applyMatrix4(cabinet.mesh.matrixWorld);
            toFrontPos.project(camera);
            const screenX = (toFrontPos.x + 1) * canvasRect.width / 2 + canvasRect.left;
            const screenY = (-toFrontPos.y + 1) * canvasRect.height / 2 + canvasRect.top;
            const finalX = screenX - canvasRect.left;
            const finalY = screenY - canvasRect.top;
            toFrontInput.style.left = `${finalX - toFrontInput.offsetWidth / 2}px`;
            toFrontInput.style.top = `${finalY - toFrontInput.offsetHeight / 2}px`;
        }

/*
        if (toLeftInput) {
            const leftPoint = new THREE.Vector3(
                isAlongX ? -cabinet.width / 2 - cabinet.offsetX / 2 : -cabinet.width / 2,
                cabinet.height / 2,
                isAlongX ? cabinet.depth / 2 : -cabinet.depth / 2 - cabinet.offsetX / 2
            );
            
            leftPoint.applyMatrix4(cabinet.mesh.matrixWorld);
            leftPoint.project(camera);
            const screenX = (leftPoint.x + 1) * canvasRect.width / 2 + canvasRect.left;
            const screenY = (-leftPoint.y + 1) * canvasRect.height / 2 + canvasRect.top;
            const finalX = screenX - canvasRect.left;
            const finalY = screenY - canvasRect.top;
            toLeftInput.style.left = `${finalX - toLeftInput.offsetWidth / 2}px`;
            toLeftInput.style.top = `${finalY - toLeftInput.offsetHeight / 2}px`;
            if (document.activeElement !== toLeftInput) {
                toLeftInput.value = Math.round((isAlongX ? cabinet.offsetX : cabinet.offsetX + (cabinet.width - cabinet.depth)) * 1000);
            }
        }

        if (toRightInput) {
            const rightPoint = new THREE.Vector3(
                isAlongX ? cabinet.width / 2 + (roomLength - cabinet.width - cabinet.offsetX) / 2 : -cabinet.width / 2 - (roomHeight - cabinet.width - cabinet.offsetZ) / 2,
                cabinet.height / 2,
                isAlongX ? cabinet.depth / 2 : cabinet.depth / 2
            );

            rightPoint.applyMatrix4(cabinet.mesh.matrixWorld);
            rightPoint.project(camera);
            const screenX = (rightPoint.x + 1) * canvasRect.width / 2 + canvasRect.left;
            const screenY = (-rightPoint.y + 1) * canvasRect.height / 2 + canvasRect.top;
            const finalX = screenX - canvasRect.left;
            const finalY = screenY - canvasRect.top;
            toRightInput.style.left = `${finalX - toRightInput.offsetWidth / 2}px`;
            toRightInput.style.top = `${finalY - toRightInput.offsetHeight / 2}px`;
            if (document.activeElement !== toRightInput) {
                toRightInput.value = Math.round(((isAlongX ? roomLength : roomHeight) - (isAlongX ? cabinet.offsetX : cabinet.offsetZ) - cabinet.width) * 1000);
            }
        }

        if (toBackInput) {
            const backPoint = new THREE.Vector3(
                isAlongX ? -cabinet.width / 2 : -cabinet.width / 2,
                cabinet.height / 2,
                isAlongX ? -cabinet.depth / 2 - cabinet.offsetZ / 2 : 0
            );
            
            backPoint.applyMatrix4(cabinet.mesh.matrixWorld);
            backPoint.project(camera);
            const screenX = (backPoint.x + 1) * canvasRect.width / 2 + canvasRect.left;
            const screenY = (-backPoint.y + 1) * canvasRect.height / 2 + canvasRect.top;
            const finalX = screenX - canvasRect.left;
            const finalY = screenY - canvasRect.top;
            toBackInput.style.left = `${finalX - toBackInput.offsetWidth / 2}px`;
            toBackInput.style.top = `${finalY - toBackInput.offsetHeight / 2}px`;
            if (document.activeElement !== toBackInput) {
                toBackInput.value = Math.round((isAlongX ? cabinet.offsetZ : cabinet.offsetX) * 1000);
            }
        }

        if (toFrontInput) {
            const frontPoint = new THREE.Vector3(
                isAlongX ? -cabinet.width / 2 : cabinet.width / 2 + cabinet.offsetZ / 2,
                cabinet.height / 2,
                isAlongX ? cabinet.depth / 2 + (roomHeight - cabinet.depth - cabinet.offsetZ) / 2 : cabinet.depth / 2
            );
            frontPoint.applyMatrix4(cabinet.mesh.matrixWorld);
            frontPoint.project(camera);
            const screenX = (frontPoint.x + 1) * canvasRect.width / 2 + canvasRect.left;
            const screenY = (-frontPoint.y + 1) * canvasRect.height / 2 + canvasRect.top;
            const finalX = screenX - canvasRect.left;
            const finalY = screenY - canvasRect.top;
            toFrontInput.style.left = `${finalX - toFrontInput.offsetWidth / 2}px`;
            toFrontInput.style.top = `${finalY - toFrontInput.offsetHeight / 2}px`;
            if (document.activeElement !== toFrontInput) {
                toFrontInput.value = Math.round(((isAlongX ? roomHeight : roomLength) - (isAlongX ? cabinet.offsetZ : cabinet.offsetX) - cabinet.depth) * 1000);
            }
        }*/
    } else {
        // Для нижних и верхних шкафов
        const config = getWallConfig(cabinet.wallId, cabinet, cabinets);
        if (config) {
            if (toLeftInput) {
                const leftPoint = config.leftPoint(cabinet);
                leftPoint.applyMatrix4(cube.matrixWorld);
                leftPoint.project(camera);
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
                rightPoint.project(camera);
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
    const axis = (wallId === 'Back' || wallId === 'Front') ? 'x' : 'z';
    const maxSize = (axis === 'x') ? roomWidth : roomDepth;

    let countertopMin, countertopMax;
    if (wallId === 'Back' || wallId === 'Front') {
        countertopMin = new THREE.Vector3(
            originalPosition.x - length / 2,
            originalPosition.y - thickness / 2,
            originalPosition.z - depth / 2
        );
        countertopMax = new THREE.Vector3(
            originalPosition.x + length / 2,
            originalPosition.y + thickness / 2,
            originalPosition.z + depth / 2
        );
    } else {
        countertopMin = new THREE.Vector3(
            originalPosition.x - depth / 2,
            originalPosition.y - thickness / 2,
            originalPosition.z - length / 2
        );
        countertopMax = new THREE.Vector3(
            originalPosition.x + depth / 2,
            originalPosition.y + thickness / 2,
            originalPosition.z + length / 2
        );
    }

    const allCabinets = (cabinets || []).filter(c => c && c.mesh && c.mesh.position);
    const allCountertops = (countertops || []).filter(ct => ct !== countertop);
    const obstacles = [...allCabinets.map(c => c.mesh), ...allCountertops];

    let leftBoundary = -maxSize / 2;
    let rightBoundary = maxSize / 2;

    // Поиск вправо
    let testPosition = originalPosition.clone();
    let testMin = countertopMin.clone();
    let testMax = countertopMax.clone();
    while (testPosition[axis] < maxSize / 2) {
        testPosition[axis] += step;
        testMin[axis] += step;
        testMax[axis] += step;

        for (const obstacle of obstacles) {
            if (!obstacle || !obstacle.position) continue;

            obstacle.updateMatrixWorld?.();
            const obsPos = obstacle.position.clone();
            const obsRotationY = obstacle.rotation?.y || 0;

            let obsWidth, obsDepth, obsHeight;

            if (obstacle.userData.type === 'countertop') {
                const obsWallId = obstacle.userData.wallId;
                if (obsWallId === 'Back' || obsWallId === 'Front') {
                    obsWidth = obstacle.userData.length;
                    obsDepth = obstacle.userData.depth;
                } else if (obsWallId === 'Left' || obsWallId === 'Right') {
                    obsWidth = obstacle.userData.depth;
                    obsDepth = obstacle.userData.length;
                }
                obsHeight = obstacle.userData.thickness || thickness;
            } else {
                const cabinetData = cabinets.find(c => c.mesh === obstacle)?.userData || {};
                if (obsRotationY === 0) {
                    obsWidth = cabinetData.width || (obstacle.geometry?.parameters?.width) || 0.6;
                    obsDepth = cabinetData.depth || (obstacle.geometry?.parameters?.depth) || 0.6;
                } else {
                    obsWidth = cabinetData.depth || (obstacle.geometry?.parameters?.depth) || 0.6;
                    obsDepth = cabinetData.width || (obstacle.geometry?.parameters?.width) || 0.6;
                }
                obsHeight = cabinetData.height || (obstacle.geometry?.parameters?.height) || 0.9;
            }

            const obsMin = new THREE.Vector3(
                obsPos.x - obsWidth / 2,
                obsPos.y - obsHeight / 2,
                obsPos.z - obsDepth / 2
            );
            const obsMax = new THREE.Vector3(
                obsPos.x + obsWidth / 2,
                obsPos.y + obsHeight / 2,
                obsPos.z + obsDepth / 2
            );

            // Проверка пересечения по Y
            const epsilon = 0.0001; // Допуск на округление
            const intersectsY = testMax.y > obsMin.y + epsilon && testMin.y < obsMax.y - epsilon;
            if (!intersectsY) continue;

            // Изменённое условие пересечения: исключаем соприкосновение по границе
            //const epsilon = 0.0001; // Допуск на округление
            const intersectsX = testMax.x > obsMin.x + epsilon && testMin.x < obsMax.x - epsilon;
            const intersectsZ = testMax.z > obsMin.z + epsilon && testMin.z < obsMax.z - epsilon;
            const touchesXBoundary = testMax.x === obsMin.x || testMin.x === obsMax.x;
            const touchesZBoundary = testMax.z === obsMin.z || testMin.z === obsMax.z;

            if (
                intersectsX && intersectsZ &&
                !(touchesXBoundary && !intersectsZ) && // Только касание по X
                !(touchesZBoundary && !intersectsX)    // Только касание по Z
            ) {
                rightBoundary = axis === 'x' ? obsMin.x : obsMin.z;
                break;
            }
        }
        if (rightBoundary !== maxSize / 2) break;
    }

    // Поиск влево
    testPosition = originalPosition.clone();
    testMin = countertopMin.clone();
    testMax = countertopMax.clone();
    while (testPosition[axis] > -maxSize / 2) {
        testPosition[axis] -= step;
        testMin[axis] -= step;
        testMax[axis] -= step;

        for (const obstacle of obstacles) {
            if (!obstacle || !obstacle.position) continue;

            obstacle.updateMatrixWorld?.();
            const obsPos = obstacle.position.clone();
            const obsRotationY = obstacle.rotation?.y || 0;

            let obsWidth, obsDepth, obsHeight;

            if (obstacle.userData.type === 'countertop') {
                const obsWallId = obstacle.userData.wallId;
                if (obsWallId === 'Back' || obsWallId === 'Front') {
                    obsWidth = obstacle.userData.length;
                    obsDepth = obstacle.userData.depth;
                } else if (obsWallId === 'Left' || obsWallId === 'Right') {
                    obsWidth = obstacle.userData.depth;
                    obsDepth = obstacle.userData.length;
                }
                obsHeight = obstacle.userData.thickness || thickness;
            } else {
                const cabinetData = cabinets.find(c => c.mesh === obstacle)?.userData || {};
                if (obsRotationY === 0) {
                    obsWidth = cabinetData.width || (obstacle.geometry?.parameters?.width) || 0.6;
                    obsDepth = cabinetData.depth || (obstacle.geometry?.parameters?.depth) || 0.6;
                } else {
                    obsWidth = cabinetData.depth || (obstacle.geometry?.parameters?.depth) || 0.6;
                    obsDepth = cabinetData.width || (obstacle.geometry?.parameters?.width) || 0.6;
                }
                obsHeight = cabinetData.height || (obstacle.geometry?.parameters?.height) || 0.9;
            }

            const obsMin = new THREE.Vector3(
                obsPos.x - obsWidth / 2,
                obsPos.y - obsHeight / 2,
                obsPos.z - obsDepth / 2
            );
            const obsMax = new THREE.Vector3(
                obsPos.x + obsWidth / 2,
                obsPos.y + obsHeight / 2,
                obsPos.z + obsDepth / 2
            );

            // Проверка пересечения по Y
            const epsilon = 0.0001; // Допуск на округление
            const intersectsY = testMax.y > obsMin.y + epsilon && testMin.y < obsMax.y - epsilon;
            if (!intersectsY) continue;

            // Изменённое условие пересечения: исключаем соприкосновение по границе
            const intersectsX = testMax.x > obsMin.x + epsilon && testMin.x < obsMax.x - epsilon;
            const intersectsZ = testMax.z > obsMin.z + epsilon && testMin.z < obsMax.z - epsilon;
            
            const touchesXBoundary = testMax.x === obsMin.x || testMin.x === obsMax.x;
            const touchesZBoundary = testMax.z === obsMin.z || testMin.z === obsMax.z;

            if (
                intersectsX && intersectsZ &&
                !(touchesXBoundary && !intersectsZ) && // Только касание по X
                !(touchesZBoundary && !intersectsX)    // Только касание по Z
            ) {
                leftBoundary = axis === 'x' ? obsMax.x : obsMax.z;
                break;
            }
        }
        if (leftBoundary !== -maxSize / 2) break;
    }

    return { leftBoundary, rightBoundary };
}


let countertopWidthInput, /*toLeftInput, toRightInput,*/ countertopDepthInput;
let leftBoundaryGlobal, rightBoundaryGlobal;

function showCountertopDimensionsInput(countertop, countertops, cabinets) {
    const { length, depth, wallId } = countertop.userData;
    const roomWidth = currentLength; // X
    const roomDepth = currentHeight; // Z
    const thickness = kitchenGlobalParams.countertopThickness / 1000; 
    const countertopDepth = kitchenGlobalParams.countertopDepth / 1000;
    let leftDistance, rightDistance;

    // Скрываем старые элементы
    if (widthInput) { widthInput.remove(); widthInput = null; }
    if (toLeftInput) { toLeftInput.remove(); toLeftInput = null; }
    if (toRightInput) { toRightInput.remove(); toRightInput = null; }
    if (depthInput) { depthInput.remove(); depthInput = null; }
    if (countertopDepthInput) { countertopDepthInput.remove(); countertopDepthInput = null; }
    if (distanceLine) { cube.remove(distanceLine); distanceLine.geometry.dispose(); distanceLine = null; }
    if (distanceLineDepth) { cube.remove(distanceLineDepth); distanceLineDepth.geometry.dispose(); distanceLineDepth = null; }

    // Поиск ближайших препятствий
    const { leftBoundary, rightBoundary } = findNearestObstacles(countertop, cabinets, countertops);
    // Расстояния до стен или препятствий
    if (wallId === 'Back') {
        leftDistance = ((countertop.position.x - length / 2) - leftBoundary) * 1000;
        rightDistance = (rightBoundary - (countertop.position.x + length / 2)) * 1000;
    } else if (wallId === 'Front') {
        leftDistance = ((countertop.position.x - length / 2) - leftBoundary) * 1000;
        rightDistance = (rightBoundary - (countertop.position.x + length / 2)) * 1000;
    } else if (wallId === 'Left') {
        leftDistance = ((countertop.position.z - length / 2) - leftBoundary) * 1000;
        rightDistance = (rightBoundary - (countertop.position.z + length / 2)) * 1000;
    } else if (wallId === 'Right') {
        leftDistance = ((countertop.position.z - length / 2) - leftBoundary) * 1000;
        rightDistance = (rightBoundary - (countertop.position.z + length / 2)) * 1000;
    }
    
    // Поле глубины
    countertopDepthInput = document.createElement('input');
    countertopDepthInput.type = 'text';
    countertopDepthInput.value = (depth * 1000).toFixed(0);
    countertopDepthInput.className = 'dimension-input';
    countertopDepthInput.dataset.min = 100;
    renderer.domElement.parentNode.appendChild(countertopDepthInput);
    attachExpressionValidator(countertopDepthInput);

    countertopDepthInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            const newDepthMm = parseFloat(countertopDepthInput.value);
            if (!isNaN(newDepthMm) && newDepthMm >= 100) { // Мин. 100 мм
                // ---> Вызываем новую функцию обновления для стены <---
                updateDepthForWall(countertop.userData.wallId, newDepthMm / 1000);
                // Обновляем значение в поле ввода (на случай округления или ограничений)
                 const actualDepth = getCountertopDepthForWall(countertop.userData.wallId);
                 countertopDepthInput.value = Math.round(actualDepth * 1000);
                 // Обновляем позицию этого поля ввода
                 updateCountertopDimensionsInputPosition(countertop);
            } else {
                 // Восстанавливаем старое значение
                 countertopDepthInput.value = Math.round(countertop.userData.depth * 1000);
            }
            event.stopPropagation();
        }
    });
            /*if (!isNaN(newDepthMm) && newDepthMm >= 100) {
                const depthChange = (newDepthMm / 1000 - countertop.userData.depth) / 2;

                if (wallId === 'Back') {
                    countertop.position.z += depthChange; // Сдвигаем к стене
                } else if (wallId === 'Front') {
                    countertop.position.z -= depthChange;
                } else if (wallId === 'Left') {
                    countertop.position.x += depthChange;
                } else if (wallId === 'Right') {
                    countertop.position.x -= depthChange;
                }
                countertop.userData.depth = newDepthMm / 1000;
                countertop.geometry.dispose();
                countertop.geometry = new THREE.BoxGeometry(length, thickness, countertop.userData.depth);
                // Обновляем ребра
                if (countertop.userData.edges) {
                    countertop.userData.edges.geometry.dispose();
                    countertop.userData.edges.geometry = new THREE.EdgesGeometry(countertop.geometry);
                    //countertop.userData.edges.position.copy(countertop.position); // Синхронизируем позицию
                }
                countertopDepthInput.value = Math.round(countertop.userData.depth * 1000);
                updateTextureScale(countertop);

                updateCountertopDimensionsInputPosition(countertop);
            }
            event.stopPropagation();
        }
    });*/

    // Поле расстояния до левого препятствия
    toLeftInput = document.createElement('input');
    toLeftInput.type = 'text';
    toLeftInput.value = Math.round(leftDistance);
    toLeftInput.className = 'dimension-input';
    toLeftInput.dataset.min = -20;
    renderer.domElement.parentNode.appendChild(toLeftInput);
    attachExpressionValidator(toLeftInput);

    toLeftInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            const newDistanceMm = parseFloat(toLeftInput.value);
            const newDistanceM = newDistanceMm / 1000;
    
            // Получаем текущие размеры комнаты в момент редактирования
            const roomWidth = currentLength;  // Размер по X
            const roomDepth = currentHeight; // Размер по Z
            const wallId = countertop.userData.wallId;
    
            // Проверка валидности ввода (можно добавить проверку на maxDistance, если нужно)
            if (!isNaN(newDistanceMm) && newDistanceM >= 0) {
                const oldLength = countertop.userData.length;
                const thickness = countertop.userData.thickness; // Нужна для BoxGeometry
                const depth = countertop.userData.depth;       // Нужна для BoxGeometry
    
                let oldLeftEdge, axisIsX, wallStartX, wallStartZ;
    
                // Определяем ось стены и ее начальную координату
                if (wallId === 'Back' || wallId === 'Front') {
                    axisIsX = true;
                    wallStartX = -roomWidth / 2; // Начало стены по X
                    oldLeftEdge = countertop.position.x - oldLength / 2; // Текущая мировая координата левого края
                } else { // Left or Right wall
                    axisIsX = false;
                    wallStartZ = -roomDepth / 2; // Начало стены по Z
                    oldLeftEdge = countertop.position.z - oldLength / 2; // Текущая мировая координата "левого" (заднего) края
                }
    
                // Вычисляем НОВУЮ мировую координату левого края
                // leftBoundary - это мировая координата препятствия слева
                const newLeftEdge = leftBoundary + newDistanceM;
    
                // Вычисляем НОВУЮ длину
                const newLength = oldLength + (oldLeftEdge - newLeftEdge);
    
                if (newLength >= 0.1) { // Минимальная длина 10 см
    
                    // Вычисляем НОВЫЙ ОТНОСИТЕЛЬНЫЙ отступ от начала стены
                    let newOffsetAlongWall;
                    if (axisIsX) {
                        newOffsetAlongWall = newLeftEdge - wallStartX;
                    } else {
                        newOffsetAlongWall = newLeftEdge - wallStartZ;
                    }
                    // Убедимся, что отступ не отрицательный из-за ошибок округления
                     newOffsetAlongWall = Math.max(0, newOffsetAlongWall);
    
                    // Обновляем userData правильными значениями
                    countertop.userData.length = newLength;
                    countertop.userData.offsetAlongWall = newOffsetAlongWall; // Сохраняем ОТНОСИТЕЛЬНЫЙ отступ
    
                    // Обновляем геометрию
                    countertop.geometry.dispose();
                    // Убедись, что порядок аргументов BoxGeometry правильный (length, thickness, depth)
                    countertop.geometry = new THREE.BoxGeometry(newLength, thickness, depth);
    
                    // Обновляем центральную позицию столешницы
                    // Сдвигаем центр на половину изменения положения левого края
                    const shift = (oldLeftEdge - newLeftEdge) / 2;
                    if (axisIsX) {
                        countertop.position.x -= shift;
                    } else {
                        countertop.position.z -= shift;
                    }
    
                    // Обновляем геометрию ребер (позиция обновится автоматически)
                    if (countertop.userData.edges) {
                        countertop.userData.edges.geometry.dispose();
                        countertop.userData.edges.geometry = new THREE.EdgesGeometry(countertop.geometry);
                    }
    
                    updateTextureScale(countertop); // Обновляем масштаб текстуры, если нужно
    
                    // --- Пересчет значений для полей ввода ПОСЛЕ всех изменений ---
                    const { leftBoundary: newLB, rightBoundary: newRB } = findNearestObstacles(countertop, cabinets, countertops);
                    leftBoundaryGlobal = newLB; // Обновляем глобальные переменные, если они используются
                    rightBoundaryGlobal = newRB;
    
                    let currentLeftEdgeCoord, currentRightEdgeCoord;
                    if (axisIsX) {
                        currentLeftEdgeCoord = countertop.position.x - newLength / 2;
                        currentRightEdgeCoord = countertop.position.x + newLength / 2;
                    } else {
                        currentLeftEdgeCoord = countertop.position.z - newLength / 2;
                        currentRightEdgeCoord = countertop.position.z + newLength / 2;
                    }
                    // Обновляем значения в полях ввода новыми РАССЧИТАННЫМИ расстояниями
                    toLeftInput.value = Math.round((currentLeftEdgeCoord - newLB) * 1000);
                    toRightInput.value = Math.round((newRB - currentRightEdgeCoord) * 1000);
                    // --- Конец пересчета значений для полей ввода ---
    
                    updateCountertopDimensionsInputPosition(countertop); // Обновляем позицию полей ввода
    
                } else {
                    console.warn('Warning: New length too small:', newLength);
                    // Восстанавливаем старое значение в поле ввода
                    toLeftInput.value = Math.round((oldLeftEdge - leftBoundary) * 1000);
                }
            } else {
                console.warn('Warning: Invalid distance entered:', newDistanceM);
                // Восстанавливаем старое значение (нужно рассчитать старое расстояние)
                 let oldDistanceM;
                 if (axisIsX) {
                     oldDistanceM = countertop.position.x - countertop.userData.length / 2 - leftBoundary;
                 } else {
                     oldDistanceM = countertop.position.z - countertop.userData.length / 2 - leftBoundary;
                 }
                 toLeftInput.value = Math.round(oldDistanceM * 1000);
            }
            event.stopPropagation(); // Остановка дальнейшего всплытия события
        }
    });

    // Поле расстояния до правого препятствия
    toRightInput = document.createElement('input');
    toRightInput.type = 'text';
    toRightInput.value = Math.round(rightDistance);
    toRightInput.className = 'dimension-input';
    toRightInput.dataset.min = -20;
    
    renderer.domElement.parentNode.appendChild(toRightInput);
    attachExpressionValidator(toRightInput);

    toRightInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            const newDistanceMm = parseFloat(toRightInput.value);
            const newDistanceM = newDistanceMm / 1000;
            const maxDistance = (wallId === 'Back' || wallId === 'Front') 
                ? roomWidth - (countertop.position.x - length / 2 - leftBoundary) 
                : roomDepth - (countertop.position.z - length / 2 - leftBoundary);
            
            if (!isNaN(newDistanceMm) && newDistanceM >= -0.02 && newDistanceM <= maxDistance) {
                const oldLength = countertop.userData.length;
                const oldRightEdge = (wallId === 'Back' || wallId === 'Front') 
                    ? countertop.position.x + oldLength / 2 
                    : countertop.position.z + oldLength / 2;
                const newRightEdge = rightBoundary - newDistanceM;
                const newLength = oldLength + (newRightEdge - oldRightEdge);

                if (newLength > 0.1) { // Минимальная длина 10 см
                    countertop.userData.length = newLength;
                    countertop.geometry.dispose();
                    countertop.geometry = new THREE.BoxGeometry(newLength, thickness, depth);
                    // Смещаем центр, сохраняя левый край
                    if (wallId === 'Back' || wallId === 'Front') {
                        countertop.position.x += (newRightEdge - oldRightEdge) / 2;
                    } else if (wallId === 'Left' || wallId === 'Right') {
                        countertop.position.z += (newRightEdge - oldRightEdge) / 2;
                    }

                    // Обновляем ребра: сначала позиция, потом геометрия
                    if (countertop.userData.edges) {
                        //countertop.userData.edges.position.copy(countertop.position); // Сначала синхронизируем позицию
                        countertop.userData.edges.geometry.dispose();
                        countertop.userData.edges.geometry = new THREE.EdgesGeometry(countertop.geometry); // Потом геометрия
                    }

                    updateTextureScale(countertop);

                    // Обновляем глобальные границы
                    const { leftBoundary: newLeftBoundary, rightBoundary: newRightBoundary } = findNearestObstacles(countertop, cabinets, countertops);
                    leftBoundaryGlobal = newLeftBoundary;
                    rightBoundaryGlobal = newRightBoundary;

                    // Обновляем значения полей
                    const newLeftDistance = (wallId === 'Back' || wallId === 'Front') 
                        ? (countertop.position.x - newLength / 2 - newLeftBoundary) * 1000 
                        : (countertop.position.z - newLength / 2 - newLeftBoundary) * 1000;
                    const newRightDistance = (wallId === 'Back' || wallId === 'Front') 
                        ? (newRightBoundary - (countertop.position.x + newLength / 2)) * 1000 
                        : (newRightBoundary - (countertop.position.z + newLength / 2)) * 1000;
                    toLeftInput.value = Math.round(newLeftDistance);
                    toRightInput.value = Math.round(newRightDistance);

                    updateCountertopDimensionsInputPosition(countertop);
                } else {
                    console.log('Error: New length too small:', newLength);
                }
            } else {
                console.log('Error: Invalid distance:', newDistanceM, 'Max:', maxDistance);
            }
            event.stopPropagation();
        }
    });

    // Размерная линия от левого препятствия до правого
    const lineGeometry = new THREE.BufferGeometry();
    let vertices;

    if (wallId === 'Back') {
        vertices = new Float32Array([
            leftBoundary, countertop.position.y + thickness / 2, countertop.position.z + depth / 2,
            rightBoundary, countertop.position.y + thickness / 2, countertop.position.z + depth / 2
        ]);
    } else if (wallId === 'Front') {
        vertices = new Float32Array([
            leftBoundary, countertop.position.y + thickness / 2, countertop.position.z - depth / 2,
            rightBoundary, countertop.position.y + thickness / 2, countertop.position.z - depth / 2
        ]);
    } else if (wallId === 'Left') {
        vertices = new Float32Array([
            countertop.position.x + depth / 2, countertop.position.y + thickness / 2, leftBoundary,
            countertop.position.x + depth / 2, countertop.position.y + thickness / 2, rightBoundary
        ]);
    } else if (wallId === 'Right') {
        vertices = new Float32Array([
            countertop.position.x - depth / 2, countertop.position.y + thickness / 2, leftBoundary,
            countertop.position.x - depth / 2, countertop.position.y + thickness / 2, rightBoundary
        ]);
    }
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff });
    distanceLine = new THREE.Line(lineGeometry, lineMaterial);
    cube.add(distanceLine);
    leftBoundaryGlobal = leftBoundary;
    rightBoundaryGlobal = rightBoundary;
    updateCountertopDimensionsInputPosition(countertop);
}

function updateCountertopDimensionsInputPosition(countertop) {
    const { length, depth, thickness, wallId } = countertop.userData;
    const canvasRect = renderer.domElement.getBoundingClientRect();
    const roomWidth = currentLength; // X
    const roomDepth = currentHeight; // Z

    // Поле глубины (по центру верхнего правого ребра)
    if (countertopDepthInput) {
        const depthStart = new THREE.Vector3(length / 2, thickness / 2, -depth / 2);
        const depthEnd = new THREE.Vector3(length / 2, thickness / 2, depth / 2);
        const depthCenter = depthStart.clone().lerp(depthEnd, 0.5);
        depthCenter.applyMatrix4(countertop.matrixWorld);
        depthCenter.project(camera);

        const screenX = (depthCenter.x + 1) * canvasRect.width / 2 + canvasRect.left;
        const screenY = (-depthCenter.y + 1) * canvasRect.height / 2 + canvasRect.top;
        const finalX = screenX - canvasRect.left;
        const finalY = screenY - canvasRect.top;

        countertopDepthInput.style.left = `${finalX - countertopDepthInput.offsetWidth / 2}px`;
        countertopDepthInput.style.top = `${finalY - countertopDepthInput.offsetHeight / 2}px`;
    }

    // Поле расстояния до левой стены (на левой верхней вершине, ближе к камере)
    if (toLeftInput) {
        let leftTopFront;

        if (wallId === 'Back') {
            leftTopFront = new THREE.Vector3(
                -length / 2 - (-leftBoundaryGlobal + countertop.position.x - length / 2) / 2,    // Левый край
                thickness / 2,  // Верхняя грань
                depth / 2      // Передний край (к камере, ближе к Front)
            );
        } else if (wallId === 'Front') {
            leftTopFront = new THREE.Vector3(
                -length / 2,    // Левый край
                thickness / 2,  // Верхняя грань
                depth / 2       // Передний край (к камере, ближе к Back)
            );
        } else if (wallId === 'Left') {
            leftTopFront = new THREE.Vector3(
                length / 2 + (-leftBoundaryGlobal + countertop.position.z - length / 2) / 2,     // Левый край (глубина становится X)
                thickness / 2,  // Верхняя грань
                depth / 2  // Передний край (длина становится Z)
            );
        } else if (wallId === 'Right') {
            leftTopFront = new THREE.Vector3(
                length / 2 + (-leftBoundaryGlobal + countertop.position.z - length / 2) / 2,      // Левый край (глубина становится X, поворот меняет знак)
                thickness / 2,  // Верхняя грань
                -depth / 2     // Передний край (длина становится Z)
            );
        }

        leftTopFront.applyMatrix4(countertop.matrixWorld);
        leftTopFront.project(camera);

        const screenX = (leftTopFront.x + 1) * canvasRect.width / 2 + canvasRect.left;
        const screenY = (-leftTopFront.y + 1) * canvasRect.height / 2 + canvasRect.top;
        const finalX = screenX - canvasRect.left;
        const finalY = screenY - canvasRect.top;

        toLeftInput.style.left = `${finalX - toLeftInput.offsetWidth / 2}px`;
        toLeftInput.style.top = `${finalY - toLeftInput.offsetHeight / 2}px`;
    }
    // Поле расстояния до правой стены (на правой верхней вершине, ближе к камере)
    if (toRightInput) {
        let rightTopFront;
        if (wallId === 'Back') {
            rightTopFront = new THREE.Vector3(length / 2 + (rightBoundaryGlobal - countertop.position.x - length / 2) / 2, thickness / 2, depth / 2);
        } else if (wallId === 'Front') {
            rightTopFront = new THREE.Vector3(length / 2, thickness / 2, depth / 2);
        } else if (wallId === 'Left') {
            rightTopFront = new THREE.Vector3(-length / 2 - (rightBoundaryGlobal - countertop.position.z - length / 2) / 2, thickness / 2, depth / 2);
        } else if (wallId === 'Right') {
            rightTopFront = new THREE.Vector3(-length / 2 - (rightBoundaryGlobal - countertop.position.z - length / 2) / 2, thickness / 2, -depth / 2);
        }
        rightTopFront.applyMatrix4(countertop.matrixWorld);
        rightTopFront.project(camera);

        const screenX = (rightTopFront.x + 1) * canvasRect.width / 2 + canvasRect.left;
        const screenY = (-rightTopFront.y + 1) * canvasRect.height / 2 + canvasRect.top;
        const finalX = screenX - canvasRect.left;
        const finalY = screenY - canvasRect.top;

        toRightInput.style.left = `${finalX - toRightInput.offsetWidth / 2}px`;
        toRightInput.style.top = `${finalY - toRightInput.offsetHeight / 2}px`;
    }
}




// --- Константы для подсветки ---
const HIGHLIGHT_EMISSIVE_COLOR = 0x00FFFF; // Цвет свечения
const HIGHLIGHT_EMISSIVE_INTENSITY = 0.8;  // Интенсивность

/** Применяет emissive подсветку к мешу */
function applyHighlight(mesh) {
    if (!mesh || !mesh.material || !mesh.material.emissive || mesh.userData?.isHighlighted) {
         // Пропускаем, если нет меша/материала/emissive или уже подсвечен
         return;
    }
    // Сохраняем исходные значения
    mesh.userData.originalEmissive = mesh.material.emissive.getHex();
    mesh.userData.originalIntensity = mesh.material.emissiveIntensity ?? 1.0; // Используем 1.0 как дефолт, если intensity не задан
    // Применяем подсветку
    mesh.material.emissive.setHex(HIGHLIGHT_EMISSIVE_COLOR);
    mesh.material.emissiveIntensity = HIGHLIGHT_EMISSIVE_INTENSITY;
    mesh.material.needsUpdate = true;
    mesh.userData.isHighlighted = true; // Ставим флаг
    // console.log(`Highlighted: ${mesh.uuid}`);
}

/** Снимает emissive подсветку с меша */
function removeHighlight(mesh) {
    if (!mesh || !mesh.material || !mesh.material.emissive || !mesh.userData?.isHighlighted) {
        // Пропускаем, если нет меша/материала/emissive или не подсвечен
        return;
    }
    // Восстанавливаем исходные значения
    mesh.material.emissive.setHex(mesh.userData.originalEmissive ?? 0x000000); // Восстанавливаем или ставим черный
    mesh.material.emissiveIntensity = mesh.userData.originalIntensity ?? 1.0; // Восстанавливаем или ставим 1.0
    mesh.material.needsUpdate = true;
    mesh.userData.isHighlighted = false; // Снимаем флаг
    // Удаляем сохраненные значения
    delete mesh.userData.originalEmissive;
    delete mesh.userData.originalIntensity;
    // console.log(`Unhighlighted: ${mesh.uuid}`);
}


// --- Обработчик кликов для выделения через Emissive ---
renderer.domElement.addEventListener('click', (event) => {
    if (!cube || justDragged) {
        justDragged = false;
        return;
    }

    // --- Расчет координат мыши и Raycaster ---
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // --- Объекты для проверки пересечения ---
    const intersectableMeshes = [
        ...cabinets.map(c => c.mesh),
        ...windows.map(w => w.mesh),
        ...countertops
    ].filter(mesh => mesh);
    const objectIntersects = raycaster.intersectObjects(intersectableMeshes, false);
    const wallIntersects = raycaster.intersectObject(cube, false);

    // --- Сохраняем предыдущее выделение ---
    // Копируем массив selectedCabinets ДО его изменения, чтобы знать, с чего снимать подсветку
    const previouslySelectedData = [...selectedCabinets];

    // --- Сброс состояния (меню, поля, грань стены) ---
    selectedFaceIndex = -1;
    // Скрываем все меню и поля ввода
    hideWindowMenu();
    hideSocketMenu();
    hideCabinetMenu();
    hideCountertopMenu();
    if (widthInput) { widthInput.remove(); widthInput = null; }
    if (depthInput) { depthInput.remove(); depthInput = null; }
    if (heightInput) { heightInput.remove(); heightInput = null; }
    if (distanceLine) { cube.remove(distanceLine); distanceLine.geometry.dispose(); distanceLine = null; }
    if (distanceLineDepth) { cube.remove(distanceLineDepth); distanceLineDepth.geometry.dispose(); distanceLineDepth = null; }
    if (toLeftInput) { toLeftInput.remove(); toLeftInput = null; }
    if (toRightInput) { toRightInput.remove(); toRightInput = null; }
    if (toFrontInput) { toFrontInput.remove(); toFrontInput = null; }
    if (toBackInput) { toBackInput.remove(); toBackInput = null; }
    if (countertopDepthInput) { countertopDepthInput.remove(); countertopDepthInput = null; }

    // --- Определение текущего выделения (обновление selectedCabinets) ---
    let currentHitData = null;
    if (objectIntersects.length > 0) {
        const hitMesh = objectIntersects[0].object;
        
        currentHitData = cabinets.find(c => c.mesh === hitMesh) ||
                         windows.find(w => w.mesh === hitMesh) ||
                         countertops.find(c => c === hitMesh);

        if (currentHitData) {
            if (event.ctrlKey) { // Логика Ctrl+Click (добавить/удалить)
                const index = selectedCabinets.indexOf(currentHitData);
                if (index === -1) selectedCabinets.push(currentHitData);
                else selectedCabinets.splice(index, 1);
            } else { // Логика одиночного клика
                if (selectedCabinets.length === 1 && selectedCabinets[0] === currentHitData) {
                    selectedCabinets = []; // Повторный клик по выделенному -> снять выделение
                } else {
                    selectedCabinets = [currentHitData]; // Выделить только этот объект
                    // Показ меню/полей для одиночного выделения
                    if (currentHitData.userData?.type === 'countertop') { 
                        showCountertopDimensionsInput(currentHitData, countertops, cabinets); 
                    } else if (['lowerCabinet', 'upperCabinet'].includes(currentHitData.type) && currentHitData.wallId) {
                         showCabinetDimensionsInput(currentHitData, cabinets); 
                         //console.log("Cabinet Hit:", hitMesh); // Оставляем лог
                    } else if (currentHitData.type === 'freestandingCabinet') {
                        showFreestandingCabinetDimensions(currentHitData, cabinets);
                        //console.log("Free Cabinet Hit:", hitMesh); // Оставляем лог
                    }

                    // ... и т.д. ...
                }
            }
        } else { // Кликнули на неизвестный объект из intersectableMeshes
            selectedCabinets = [];
        }
    } else if (wallIntersects.length > 0) { // Клик по стене
        //console.log("Wall intersection detected.");
        selectedCabinets = []; // Сбрасываем выделение ОБЪЕКТОВ
        selectedCabinet = null; // Сбрасываем одиночный выбор шкафа
        // outlinePass.selectedObjects = []; // Если бы использовали OutlinePass, очистили бы и его
    
        // --- НАЧАЛО: Возвращенная логика определения selectedFaceIndex ---
        const intersect = wallIntersects[0];
        // Проверяем, есть ли лицо у пересечения (может быть пересечение с ребром?)
        if (intersect.face) {
            const normal = intersect.face.normal.clone().applyEuler(cube.rotation); // Нормаль грани, по которой кликнули
            const cameraDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion); // Направление камеры
    
            let bestMatchIndex = -1; // Индекс лучшего совпадения грани
            let highestDot = -Infinity; // Для поиска самой "фронтальной" грани
    
            faceNormals.forEach((face, index) => { // faceNormals - твой массив данных о гранях
                const globalNormal = face.normal.clone().applyEuler(cube.rotation); // Глобальная нормаль грани из массива
                const dot = globalNormal.dot(cameraDirection); // Проверка видимости грани для камеры
    
                // Обрабатываем только грани, видимые камере (dot > 0)
                // Можно добавить порог, например dot > 0.1, чтобы исключить грани "на ребре"
                if (dot > 0) {
                    // Проверяем, попала ли мышь в экранные границы этой грани
                    // Функция getFaceVertices должна возвращать вершины грани в локальных координатах куба
                    const vertices = getFaceVertices(face.id); // Убедись, что эта функция работает
                    if (vertices && vertices.length > 0) {
                        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                        vertices.forEach(vertex => {
                            const proj = vertex.clone().applyMatrix4(cube.matrixWorld).project(camera);
                            minX = Math.min(minX, proj.x); minY = Math.min(minY, proj.y);
                            maxX = Math.max(maxX, proj.x); maxY = Math.max(maxY, proj.y);
                        });
    
                        // Если клик внутри экранных границ грани
                        if (mouse.x >= minX && mouse.x <= maxX && mouse.y >= minY && mouse.y <= maxY) {
                            // Дополнительно проверяем, что нормаль пересеченной грани совпадает
                            // с нормалью текущей грани из faceNormals (на случай неточностей Raycaster'а)
                            const angle = normal.angleTo(globalNormal);
                            // Сравниваем с небольшим допуском (например, ~6 градусов)
                            if (angle < 0.1) {
                                 // Если эта грань "более фронтальна" к камере, чем предыдущая найденная
                                 if (dot > highestDot) {
                                     highestDot = dot;
                                     bestMatchIndex = index; // Запоминаем индекс этой грани
                                 }
                            }
                        }
                    } else {
                         console.warn("getFaceVertices returned no vertices for face:", face.id);
                    }
                }
            });
    
            selectedFaceIndex = bestMatchIndex; // Устанавливаем найденный индекс (-1, если не найдено)
            console.log("Wall face selected index:", selectedFaceIndex); // Лог для проверки
        } else {
             // Пересечение со стеной есть, но нет face? Странно. Сбрасываем индекс.
             console.warn("Wall intersection detected, but no face found.");
             selectedFaceIndex = -1;
        }
        // --- КОНЕЦ: Возвращенная логика определения selectedFaceIndex ---
    
        //updateSelectedFaceDisplay(); // Обновляем UI для грани
    } else { // Клик в пустоту
        selectedCabinets = []; // Снять выделение объектов
    }

    // Обновляем вспомогательную переменную selectedCabinet (если она нужна где-то еще)
    selectedCabinet = (selectedCabinets.length === 1 && selectedCabinets[0].mesh) ? selectedCabinets[0] : null;


    // --- Обновление ВИЗУАЛЬНОЙ подсветки (Emissive) ---
    // Все объекты, которые МОГЛИ БЫТЬ выделены
    const allHighlightableData = [...cabinets, ...windows, ...countertops];

    allHighlightableData.forEach(itemData => {
        const mesh = itemData.mesh || itemData; // Получаем меш
        if (!mesh || !mesh.material || !mesh.material.emissive) {
            // Пропускаем, если нет меша, материала или материал не поддерживает emissive
            // (MeshBasicMaterial не поддерживает, используй MeshPhongMaterial или MeshStandardMaterial)
            // if(mesh && mesh.material) console.warn(`Material ${mesh.material.type} on ${mesh.uuid} does not support emissive highlight.`);
            return;
        }

        const isNowSelected = selectedCabinets.includes(itemData);
        const wasPreviouslySelected = previouslySelectedData.includes(itemData); // Проверяем по старому массиву

        // Снимаем подсветку, если был выделен, а теперь нет
        if (wasPreviouslySelected && !isNowSelected) {
            mesh.material.emissive.setHex(mesh.userData.originalEmissive || 0x000000);
            mesh.material.emissiveIntensity = mesh.userData.originalIntensity === undefined ? 1.0 : mesh.userData.originalIntensity; // Восстанавливаем интенсивность (по умолчанию 1?)
            mesh.material.needsUpdate = true;
            delete mesh.userData.originalEmissive;
            delete mesh.userData.originalIntensity;
            mesh.userData.isHighlighted = false; // Сбрасываем флаг (если используешь)
            // console.log(`Unhighlighted: ${mesh.uuid}`);
        }
        // Включаем подсветку, если выделен сейчас, а раньше не был
        else if (isNowSelected && !wasPreviouslySelected) {
            // Сохраняем исходные значения перед изменением
            mesh.userData.originalEmissive = mesh.material.emissive.getHex();
            mesh.userData.originalIntensity = mesh.material.emissiveIntensity;
            // Применяем подсветку
            mesh.material.emissive.setHex(HIGHLIGHT_EMISSIVE_COLOR);
            mesh.material.emissiveIntensity = HIGHLIGHT_EMISSIVE_INTENSITY;
            mesh.material.needsUpdate = true;
            mesh.userData.isHighlighted = true; // Устанавливаем флаг (если нужен)
            // console.log(`Highlighted: ${mesh.uuid}`);
        }
    });


    // --- Обновление ДРУГИХ визуальных состояний (цвет пересечений и т.д.) ---
     cabinets.forEach(c => {
        const hasIntersection = checkCabinetIntersections(c);
        // Устанавливаем базовый цвет или цвет пересечения (подсветка emissive не мешает)
        c.mesh.material.color.set(hasIntersection ? 0xff0000 : c.initialColor);
        c.mesh.material.needsUpdate = true;
        // ... (обновление ребер шкафов, если нужно) ...
     });
     windows.forEach(w => {
         // Аналогично для окон, если нужно
         w.mesh.material.color.set(w.initialColor);
         w.mesh.material.needsUpdate = true;
     });
     // Для столешниц цвет не меняем, т.к. там текстура


    // --- Обновление UI подсказок ---
    updateHint(selectedCabinets.length > 0 ? 'Выделено объектов: ' + selectedCabinets.length : 'Выделите объект или стену');
    updateCountertopButtonVisibility();
    updateEdgeColors(); // Возможно, обновить цвет ребер стен?
    updateSelectedFaceDisplay();

}); // Конец обработчика кликов

// Новый обработчик для начала перетаскивания с копированием через shift
renderer.domElement.addEventListener('mousedown', (event) => {
    // Только левая кнопка, не во время другого перетаскивания
    if (!cube || event.button !== 0 || draggedCabinet) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const cabinetIntersects = raycaster.intersectObjects(cabinets.map(c => c.mesh), false);

    if (cabinetIntersects.length > 0) {
        const intersect = cabinetIntersects[0];
        const cabinetHit = cabinets.find(c => c.mesh === intersect.object);

        if (cabinetHit) {
            const wasSelectedBeforeDrag = selectedCabinets.includes(cabinetHit);
            const isShiftPressed = event.shiftKey;

            const dragTimeout = setTimeout(() => {
                let cabinetToDrag = cabinetHit;

                if (isShiftPressed) {
                    const cloned = cloneCabinet(cabinetHit);
                    cloned.mesh.position.copy(cabinetHit.mesh.position);
                    cloned.mesh.rotation.copy(cabinetHit.mesh.rotation);
                    cube.add(cloned.mesh);
                    cabinets.push(cloned);
                    cabinetToDrag = cloned;

                    // Клонированный не должен быть выделен
                    removeHighlight(cloned.mesh);
                    selectedCabinets = [];
                    selectedCabinet = null;
                }

                startDraggingCabinet(cabinetToDrag, event, wasSelectedBeforeDrag);
            }, 200); // Порог для начала перетаскивания

            const cancelDrag = () => {
                clearTimeout(dragTimeout);
                document.removeEventListener('mouseup', cancelDrag);
            };
            document.addEventListener('mouseup', cancelDrag, { once: true });
        }
    }
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
        
                if (windowMenu && windowMenu.style.display === 'block' && ['window', 'door', 'opening'].includes(selected.type)) {
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

function animate() {
    if (window.stopAnimation) {
        console.log('Animation stopped by window.stopAnimation');
        return;
    }
    requestAnimationFrame(animate);

    cube.updateMatrixWorld(true);
    renderer.render(scene, camera);
    //composer.render();

    const isRotating = cube.rotation.y !== lastRotationY;
    const isDragging = !!draggedCabinet;
    let isPositionChanged = false;

    // Проверка изменений для выбранного объекта
    if (selectedCabinets.length === 1) {
        const selectedObject = selectedCabinets[0];
        if (selectedObject.userData && selectedObject.userData.type === 'countertop') {
            // Для столешницы пока не отслеживаем позицию, но можем добавить позже
            isPositionChanged = false; // Пока не меняем позицию столешницы
        } else if (selectedObject.type === 'freestandingCabinet') {
            isPositionChanged = lastOffsetX !== selectedObject.offsetX || lastOffsetZ !== selectedObject.offsetZ;
        } else {
            isPositionChanged = lastOffsetAlongWall !== selectedObject.offsetAlongWall;
        }
    }

    // Обновление размеров
    if (isDragging && draggedCabinet) {
        updateDimensionsInputPosition(draggedCabinet, cabinets);
    } else if (selectedCabinets.length === 1) {
        const selectedObject = selectedCabinets[0];
        if (selectedObject.userData && selectedObject.userData.type === 'countertop' && (isRotating || isDragging || isPositionChanged)) {
            updateCountertopDimensionsInputPosition(selectedObject);
        } else if (selectedObject && cabinets && (isRotating || isDragging || isPositionChanged)) {
            updateDimensionsInputPosition(selectedObject, cabinets);
        }
    }

    // Сохранение состояния
    lastRotationY = cube.rotation.y;
    if (selectedCabinets.length === 1) {
        const selectedObject = selectedCabinets[0];
        if (selectedObject.type === 'freestandingCabinet') {
            lastOffsetX = selectedObject.offsetX;
            lastOffsetZ = selectedObject.offsetZ;
        } else if (!selectedObject.userData || selectedObject.userData.type !== 'countertop') {
            lastOffsetAlongWall = selectedObject.offsetAlongWall;
        }
    }
    lastSelectedCabinet = selectedCabinets.length === 1 ? selectedCabinets[0] : null;
    lastCabinetsLength = cabinets.length;

    if (isRotating || isDragging || isPositionChanged || (selectedCabinets.length === 1 && selectedCabinets[0] !== lastSelectedCabinet) || cabinets.length !== lastCabinetsLength) {
        //console.log('Scene active:', { isRotating, isDragging, isPositionChanged, selectedCabinets, cabinets });
    } else if (selectedCabinets.length === 0 && (selectedCabinets.length !== (lastSelectedCabinet ? 1 : 0) || cabinets.length !== lastCabinetsLength)) {
        //console.log('No object selected or dragged', { selectedCabinets, cabinets });
    }
}

function init() {
    let length = parseFloat(document.getElementById('length').value);
    let height = parseFloat(document.getElementById('height').value); // Высота комнаты (Y)
    let width = parseFloat(document.getElementById('width').value);  // Глубина комнаты (Z)
    const color = document.getElementById('cubeColor').value;

    length = Math.max(100, Math.min(10000, length)) / 1000;
    height = Math.max(100, Math.min(10000, height)) / 1000; // Высота (Y)
    width = Math.max(100, Math.min(10000, width)) / 1000;   // Глубина (Z)

    const axesHelper = new THREE.AxesHelper(0.2); // Длина осей 1000 мм
    scene.add(axesHelper);
    axesHelper.position.set(-length / 2 + 1 / 1000, -height / 2 + 1 / 1000, -width / 2 + 1 / 1000);   

    createCube(length, height, width, color, THREE.MathUtils.degToRad(30), THREE.MathUtils.degToRad(-30)); // Передаём: длина (X), высота (Y), глубина (Z)
    cube.add(axesHelper);
    animate();
    updateRotationDisplay();

    // Добавляем обработчики для вращения мышью
    const canvas = renderer.domElement;

    canvas.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return; // Только левая кнопка мыши

        // Проверяем, попал ли клик на перетаскиваемый объект
        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.width) * 2 - 1;
        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const intersects = raycaster.intersectObjects(cabinets.map(c => c.mesh), false);

        if (intersects.length === 0) { // Если не попали на шкафы
            isRotating = true;
            previousMouseX = event.clientX;
            previousMouseY = event.clientY;
            canvas.style.cursor = 'grabbing'; // Меняем курсор для визуального отклика
        }
    });

    document.addEventListener('mousemove', (event) => {
        if (isRotating) {
            const deltaX = event.clientX - previousMouseX;
            const deltaY = event.clientY - previousMouseY;

            const newRotationY = cube.rotation.y + THREE.MathUtils.degToRad(deltaX * rotationSpeed);
            const newRotationX = cube.rotation.x + THREE.MathUtils.degToRad(deltaY * rotationSpeed);

            cube.rotation.y = Math.max(THREE.MathUtils.degToRad(-180), Math.min(THREE.MathUtils.degToRad(180), newRotationY));
            cube.rotation.x = Math.max(THREE.MathUtils.degToRad(-180), Math.min(THREE.MathUtils.degToRad(180), newRotationX));
            edges.rotation.y = cube.rotation.y;
            edges.rotation.x = cube.rotation.x;

            rotateYSlider.value = THREE.MathUtils.radToDeg(cube.rotation.y);
            rotateXSlider.value = THREE.MathUtils.radToDeg(cube.rotation.x);
            updateRotationDisplay();

            previousMouseX = event.clientX;
            previousMouseY = event.clientY;

            updateEdgeColors();
            updateFaceBounds();
        }
    });

    document.addEventListener('mouseup', () => {
        if (isRotating) {
            isRotating = false;
            canvas.style.cursor = 'default';
        }
    });
}

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

        raycaster.setFromCamera(mouse, camera);
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
        falsePanels: 'none',
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
        offsetFromParentWall: params.defaultoffsetFromParentWall,
        type: 'upperCabinet',
        edges: edges,
        facadeThickness: params.facadeThickness,
        facadeGap: params.facadeGap,
        isHeightIndependent: true, // Изменяем с false на true
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
    // --- Блок 1: Сохранение текущего состояния для отмены ---
    // Сохраняем текущее состояние сцены и параметров перед изменением
    saveState("updateKitchenParams", { description: "Изменение параметров кухни" });

    // --- Блок 2: Обновление kitchenGlobalParams из полей меню ---
    // Считываем новые значения из полей ввода и обновляем глобальный объект
    let tempTotalHeight = kitchenGlobalParams.totalHeight;
    let tempApronHeight = kitchenGlobalParams.apronHeight;
    let tempCountertopHeight = kitchenGlobalParams.countertopHeight;

    kitchenGlobalParams.countertopHeight = parseFloat(document.getElementById('countertopHeight').value) || kitchenGlobalParams.countertopHeight;
    kitchenGlobalParams.countertopThickness = parseFloat(document.getElementById('countertopThickness').value) || kitchenGlobalParams.countertopThickness;
    //kitchenGlobalParams.countertopDepth = parseFloat(document.getElementById('countertopDepth').value) || kitchenGlobalParams.countertopDepth;
    kitchenGlobalParams.plinthHeight = parseFloat(document.getElementById('plinthHeight').value) || kitchenGlobalParams.plinthHeight;
    kitchenGlobalParams.totalHeight = parseFloat(document.getElementById('totalHeight').value) || kitchenGlobalParams.totalHeight;
    kitchenGlobalParams.apronHeight = parseFloat(document.getElementById('apronHeight').value) || kitchenGlobalParams.apronHeight;
    kitchenGlobalParams.mezzanineHeight = parseFloat(document.getElementById('mezzanineHeight').value) || kitchenGlobalParams.mezzanineHeight;
    kitchenGlobalParams.countertopType = document.getElementById('countertopType').value;
    kitchenGlobalParams.handleType = document.getElementById('handleType').value;
    kitchenGlobalParams.kitchenType = document.getElementById('kitchenType').value;

    // --- Блок 3: Пересчёт шкафов на основе новых параметров ---
    // Обновляем размеры и позиции всех шкафов в зависимости от их типа
    cabinets.forEach(cabinet => {
        if (cabinet.type === 'lowerCabinet' && !cabinet.isHeightIndependent) {
            // Нижние шкафы: высота зависит от столешницы и цоколя
            cabinet.height = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;
            cabinet.offsetBottom = kitchenGlobalParams.plinthHeight / 1000;
            // ---> Пересчитываем отступ перед обновлением позиции <---
            cabinet.offsetFromParentWall = calculateLowerCabinetOffset(cabinet);

            // Обновляем геометрию и позицию
            cabinet.mesh.geometry.dispose();
            cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
            cabinet.edges.geometry.dispose();
            cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
            updateCabinetPosition(cabinet);

            // Проверяем пересечения
            const hasIntersection = checkCabinetIntersections(cabinet);
            cabinet.mesh.material.color.set(hasIntersection ? 0xff0000 : cabinet.initialColor);
            cabinet.edges.material.needsUpdate = true;
        } else if (cabinet.type === 'upperCabinet') {
            // Верхние шкафы: высота зависит от общей высоты, столешницы и фартука
            if (cabinet.isMezzanine == 'normal') {
                cabinet.height = (kitchenGlobalParams.totalHeight - kitchenGlobalParams.countertopHeight - kitchenGlobalParams.apronHeight) / 1000;
                cabinet.offsetBottom = (kitchenGlobalParams.countertopHeight + kitchenGlobalParams.apronHeight) / 1000;
            } else if (cabinet.isMezzanine == 'mezzanine') {
                cabinet.height = kitchenGlobalParams.mezzanineHeight / 1000;
                cabinet.offsetBottom = (kitchenGlobalParams.totalHeight - kitchenGlobalParams.mezzanineHeight) / 1000;
            } else if (cabinet.isMezzanine == 'underMezzanine') {
                cabinet.height = (kitchenGlobalParams.totalHeight - kitchenGlobalParams.countertopHeight - kitchenGlobalParams.apronHeight - kitchenGlobalParams.mezzanineHeight) / 1000;
                cabinet.offsetBottom = (kitchenGlobalParams.countertopHeight + kitchenGlobalParams.apronHeight) / 1000;
            }

            // Обновляем геометрию и позицию
            cabinet.mesh.geometry.dispose();
            cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
            cabinet.edges.geometry.dispose();
            cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
            updateCabinetPosition(cabinet);

            // Проверяем пересечения
            const hasIntersection = checkCabinetIntersections(cabinet);
            cabinet.mesh.material.color.set(hasIntersection ? 0xff0000 : cabinet.initialColor);
            cabinet.edges.material.needsUpdate = true;
        } else if (cabinet.isHeightIndependent && cabinet.type !== 'freestandingCabinet') {
            // Высокие шкафы: высота зависит только от totalHeight
            cabinet.height = (kitchenGlobalParams.totalHeight - kitchenGlobalParams.plinthHeight) / 1000;
            //cabinet.offsetBottom = kitchenGlobalParams.plinthHeight; // Предполагаем, что высокие шкафы стоят на полу

            // Обновляем геометрию и позицию
            cabinet.mesh.geometry.dispose();
            cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
            cabinet.edges.geometry.dispose();
            cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
            updateCabinetPosition(cabinet);

            // Проверяем пересечения
            const hasIntersection = checkCabinetIntersections(cabinet);
            cabinet.mesh.material.color.set(hasIntersection ? 0xff0000 : cabinet.initialColor);
            cabinet.edges.material.needsUpdate = true;
        } 
    });

    // ---- НАЧАЛО: Блок 3.5 - Обновление столешниц ----
    console.log("Updating countertops based on global params...");
    const newGlobalCountertopHeightFromFloor = kitchenGlobalParams.countertopHeight / 1000; // м, от ПОЛА
    const newGlobalCountertopThickness = kitchenGlobalParams.countertopThickness / 1000; // м
    const newGlobalCountertopDepth = kitchenGlobalParams.countertopDepth / 1000; // м

    // Получаем текущую ВЫСОТУ комнаты (размер по Y в метрах)
    // Убедись, что 'currentWidth' действительно хранит ВЫСОТУ комнаты (Y-размер)
    const roomHeightMeters = currentWidth;
    const floorY = -roomHeightMeters / 2; // Y-координата пола относительно центра сцены

    countertops.forEach(countertop => {
        if (!countertop || !countertop.userData) return; // Пропуск некорректных

        console.log(`Updating countertop ${countertop.uuid}, heightDependsOnGlobal: ${countertop.userData.heightDependsOnGlobal}`);

        // --- Обновление Y-позиции (высоты) ---
        if (countertop.userData.heightDependsOnGlobal !== false) {
            // Вычисляем позицию ЦЕНТРА столешницы относительно ПОЛА
            const centerRelativeToFloor = newGlobalCountertopHeightFromFloor - newGlobalCountertopThickness / 2;
            // Преобразуем в координату относительно ЦЕНТРА СЦЕНЫ (0,0,0)
            const newCenterY = floorY + centerRelativeToFloor; // <--- ИСПРАВЛЕННЫЙ РАСЧЕТ

            countertop.position.y = newCenterY;
            console.log(` - Updated Y position to: ${newCenterY} (FloorY: ${floorY}, TargetHeightFromFloor: ${newGlobalCountertopHeightFromFloor})`);
        } else {
            console.log(` - Skipping Y position update (heightDependsOnGlobal=false)`);
            // В будущем - обновление Y на основе высоты родительского шкафа
        }

        // --- Обновление Геометрии (толщина, глубина) ---
        const currentLength = countertop.userData.length; // Длину не меняем
        const currentDepth = countertop.userData.depth; // Используем текущую глубину столешницы
        //const newGlobalCountertopThickness = kitchenGlobalParams.countertopThickness / 1000;
        
        const needsGeometryUpdate =
            Math.abs(countertop.userData.thickness - newGlobalCountertopThickness) > 1e-5; // Проверяем только толщину

        if (needsGeometryUpdate) {
            console.log(` - Updating geometry: thickness=${newGlobalCountertopThickness}`);
            countertop.userData.thickness = newGlobalCountertopThickness;

            // Обновляем геометрию меша
            countertop.geometry.dispose();

            // Используем currentDepth вместо newGlobalCountertopDepth
            countertop.geometry = new THREE.BoxGeometry(currentLength, newGlobalCountertopThickness, currentDepth);

            // Обновляем геометрию ребер
            if (countertop.userData.edges) {
                countertop.userData.edges.geometry.dispose();
                countertop.userData.edges.geometry = new THREE.EdgesGeometry(countertop.geometry);
            }

             // Обновляем текстуру
             updateTextureScale(countertop);

        } else {
             console.log(` - Geometry doesn't need update (thickness/depth unchanged)`);
        }
    });
    // ---- КОНЕЦ: Блок 3.5 - Обновление столешниц ----

    // --- Блок 4: Обновление сцены ---
    // Пересоздаём комнату с текущими размерами, чтобы синхронизировать все объекты
    createCube(currentLength, currentWidth, currentHeight, document.getElementById('cubeColor').value, cube.rotation.x, cube.rotation.y);

    // --- Блок 5: Закрытие меню ---
    // Убираем меню после применения изменений
    const menu = document.getElementById('kitchenParamsMenu');
    if (menu) menu.remove();
}



// Привязка кнопки к открытию меню
const kitchenParamsButton = document.getElementById('kitchenParamsButton');
kitchenParamsButton.addEventListener('click', (e) => {
    // Открываем меню в центре экрана или по координатам клика
    showKitchenParamsMenu(e.clientX, e.clientY);
});
//--------


function hideCabinetConfigMenu() {
    const menu = document.getElementById('cabinetConfigMenu');
    if (menu) menu.style.display = 'none';
}

// script.js
function applyCabinetConfigChanges(cabinetIndex) {
    saveState("editCabinetConfig", { cabinetIndex });
    const cabinet = cabinets[cabinetIndex];
    const cabinetType = document.getElementById('cabinetType').value;
    const cabinetConfig = document.getElementById('cabinetConfig').value;

    // Применяем цвет фасада
    cabinet.initialColor = document.getElementById('cabinetFacadeColor').value;

    // Обработка верхнего шкафа
    if (cabinet.type === 'upperCabinet') {
        cabinet.width = parseFloat(document.getElementById('cabinetWidth').value) / 1000;
        cabinet.depth = parseFloat(document.getElementById('cabinetDepth').value) / 1000;
        cabinet.height = parseFloat(document.getElementById('cabinetHeight').value) / 1000;
        cabinet.offsetBottom = parseFloat(document.getElementById('cabinetOffsetBottom').value) / 1000;
        cabinet.facadeGap = parseFloat(document.getElementById('facadeGap').value) / 1000;
        cabinet.isHeightIndependent = true; // Высота теперь независима после редактирования
    }

    // Определяем, зависит ли высота от глобальных параметров
    const isHeightEditable = cabinetType === 'straight' && ['tallStorage', 'tallOvenMicro', 'fridge', 'highDivider'].includes(cabinetConfig);
    if (isHeightEditable) {
        cabinet.isHeightIndependent = true;
        cabinet.height = parseFloat(document.getElementById('cabinetHeight').value) / 1000; // Пользователь ввёл высоту
    } else if (cabinet.type !== 'upperCabinet') {
        cabinet.isHeightIndependent = false;
        // Высота определяется глобальными параметрами для swing, drawers, oven
        const countertopHeight = kitchenGlobalParams.countertopHeight / 1000;
        const countertopThickness = kitchenGlobalParams.countertopThickness / 1000;
        const plinthHeight = kitchenGlobalParams.plinthHeight / 1000;
        cabinet.height = countertopHeight - countertopThickness - plinthHeight;
    }

    // Применяем изменения в зависимости от типа и конфигурации
    cabinet.cabinetType = cabinetType;
    cabinet.cabinetConfig = cabinetConfig;

    // Объявляем все переменные заранее
    const sinkDiameterInput = document.getElementById('sinkDiameter');
    const sinkTypeSelect = document.getElementById('sinkType');
    const shelfCountInput = document.getElementById('shelfCount');
    const doorTypeSelect = document.getElementById('doorType');
    const shelfTypeSelect = document.getElementById('shelfType');
    const rearStretcherSelect = document.getElementById('rearStretcher');
    const frontStretcherSelect = document.getElementById('frontStretcher');
    const stretcherDropInput = document.getElementById('stretcherDrop');
    const rearPanelSelect = document.getElementById('rearPanel');
    const falsePanelsSelect = document.getElementById('falsePanels');
    const facadeSetSelect = document.getElementById('facadeSet');
    const facadeCountSelect = document.getElementById('facadeCount');
    const drawerSetSelect = document.getElementById('drawerSet');
    const ovenHeightSelect = document.getElementById('ovenHeight');
    const ovenPositionSelect = document.getElementById('ovenPosition');
    const extraOffsetInput = document.getElementById('extraOffset');
    const ovenTypeSelect = document.getElementById('ovenType');
    const ovenLevelSelect = document.getElementById('ovenLevel');
    const microwaveTypeSelect = document.getElementById('microwaveType');
    const underOvenFillSelect = document.getElementById('underOvenFill');
    const topShelvesSelect = document.getElementById('topShelves');
    const fridgeTypeSelect = document.getElementById('fridgeType');
    const shelvesAboveSelect = document.getElementById('shelvesAbove');
    const visibleSideSelect = document.getElementById('visibleSide');
    const doorOpeningSelect = document.getElementById('doorOpening');
    const verticalProfileSelect = document.getElementById('verticalProfile');
    const dishwasherWidth = document.getElementById('dishwasherWidth');
    const highDividerDepth = document.getElementById('highDividerDepth');

    if (cabinetType === 'corner') {
        if (cabinetConfig === 'sink') {
            if (sinkDiameterInput) cabinet.sinkDiameter = parseFloat(sinkDiameterInput.value) / 1000;
            if (sinkTypeSelect) cabinet.sinkType = sinkTypeSelect.value;
        } else if (cabinetConfig === 'cornerStorage') {
            if (shelfCountInput) cabinet.shelfCount = parseInt(shelfCountInput.value);
        }
    } else if (cabinetType === 'straight') {
        switch (cabinetConfig) {
            case 'swing':
                if (doorTypeSelect) cabinet.doorType = doorTypeSelect.value;
                if (shelfTypeSelect) cabinet.shelfType = shelfTypeSelect.value;
                if (shelfCountInput) cabinet.shelfCount = parseInt(shelfCountInput.value);
                if (rearStretcherSelect) cabinet.rearStretcher = rearStretcherSelect.value;
                if (frontStretcherSelect) cabinet.frontStretcher = frontStretcherSelect.value;
                if (stretcherDropInput) cabinet.stretcherDrop = parseFloat(stretcherDropInput.value) / 1000;
                if (rearPanelSelect) cabinet.rearPanel = rearPanelSelect.value;
                if (falsePanelsSelect) cabinet.falsePanels = falsePanelsSelect.value;
                if (facadeSetSelect) cabinet.facadeSet = facadeSetSelect.value;
                cabinet.isHeightIndependent = false;
                cabinet.isHeightEditable = false;
                //cabinet.offsetBottom = kitchenGlobalParams.plinthHeight / 1000;
                break;
            case 'drawers':
                if (facadeCountSelect) cabinet.facadeCount = facadeCountSelect.value;
                if (drawerSetSelect) cabinet.drawerSet = drawerSetSelect.value;
                if (rearStretcherSelect) cabinet.rearStretcher = rearStretcherSelect.value;
                if (frontStretcherSelect) cabinet.frontStretcher = frontStretcherSelect.value;
                if (stretcherDropInput) cabinet.stretcherDrop = parseFloat(stretcherDropInput.value) / 1000;
                if (rearPanelSelect) cabinet.rearPanel = rearPanelSelect.value;
                if (falsePanelsSelect) cabinet.falsePanels = falsePanelsSelect.value;
                if (facadeSetSelect) cabinet.facadeSet = facadeSetSelect.value;
                cabinet.isHeightIndependent = false;
                cabinet.isHeightEditable = false;
                break;
            case 'oven':
                if (ovenHeightSelect) cabinet.ovenHeight = ovenHeightSelect.value;
                if (ovenPositionSelect) cabinet.ovenPosition = ovenPositionSelect.value;
                if (extraOffsetInput) cabinet.extraOffset = parseFloat(extraOffsetInput.value) / 1000;
                cabinet.isHeightIndependent = false;
                cabinet.isHeightEditable = false;
                break;
            case 'tallStorage':
                if (shelfCountInput) cabinet.shelfCount = parseInt(shelfCountInput.value);
                break;
            case 'tallOvenMicro':
                if (ovenTypeSelect) cabinet.ovenType = ovenTypeSelect.value;
                if (ovenLevelSelect) cabinet.ovenLevel = ovenLevelSelect.value;
                if (microwaveTypeSelect) cabinet.microwaveType = microwaveTypeSelect.value;
                if (underOvenFillSelect) cabinet.underOvenFill = underOvenFillSelect.value;
                if (topShelvesSelect) cabinet.topShelves = topShelvesSelect.value;
                if (facadeSetSelect) cabinet.facadeSet = facadeSetSelect.value;
                break;
            case 'fridge':
                if (fridgeTypeSelect) cabinet.fridgeType = fridgeTypeSelect.value;
                if (shelvesAboveSelect) cabinet.shelvesAbove = shelvesAboveSelect.value;
                if (visibleSideSelect) cabinet.visibleSide = visibleSideSelect.value;
                if (doorOpeningSelect) cabinet.doorOpening = doorOpeningSelect.value;
                if (verticalProfileSelect) cabinet.verticalProfile = verticalProfileSelect.value;
                if (facadeSetSelect) cabinet.facadeSet = facadeSetSelect.value;
                break;
            case 'dishwasher':
                if (dishwasherWidth) {
                    cabinet.width = parseInt(dishwasherWidth.value) / 1000;
                } 
                break;
            case 'highDivider':
                if (highDividerDepth) {
                    cabinet.depth = parseInt(highDividerDepth.value) / 1000;
                    cabinet.width = 18 / 1000;
                    cabinet.isHeightIndependent = true;
                    cabinet.isHeightEditable = true;
                    cabinet.offsetFromParentWall = (kitchenGlobalParams.countertopDepth / 1000) - cabinet.depth - cabinet.overhang - cabinet.facadeThickness;
                } 
                break;    
        }
    }

    // Обновляем геометрию и позицию шкафа
    cabinet.mesh.geometry.dispose();
    cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
    cabinet.edges.geometry.dispose();
    cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
    updateCabinetPosition(cabinet);

    // Проверяем пересечения и обновляем цвет
    const hasIntersection = checkCabinetIntersections(cabinet);
    cabinet.mesh.material.color.set(hasIntersection ? 0xff0000 : cabinet.initialColor);
    cabinet.edges.material.color.set(0x000000);
    cabinet.mesh.material.needsUpdate = true;
    cabinet.edges.material.needsUpdate = true;

    hideCabinetConfigMenu();
}
//------------

window.addEventListener('resize', () => {
    const canvasWidth = window.innerWidth * 0.7;
    const canvasHeight = window.innerHeight;
    renderer.setSize(canvasWidth, canvasHeight);
    camera.aspect = canvasWidth / canvasHeight;
    camera.updateProjectionMatrix();
    updateFaceBounds();
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
                          (anchorCabinet.type === 'freestandingCabinet' && anchorCabinet.height <= kitchenGlobalParams.standardHeight);

    if (!isLowerAnchor) {
        updateHint('Первый выделенный шкаф должен быть нижним!');
        return;
    }

    const filteredCabinets = selectedCabinets.filter(cab => {
        const isLower = (cab.type === 'lowerCabinet' && !cab.isHeightIndependent) ||
                        (cab.type === 'freestandingCabinet' && cab.height <= kitchenGlobalParams.standardHeight);
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
    cabinets.forEach(c => {
        if (selectedCabinets.includes(c)) {
            //c.mesh.material.color.set(0x00e0e0);
            //c.edges.material.color.set(0xff00ff);
        } else {
            const hasIntersection = checkCabinetIntersections(c);
            c.mesh.material.color.set(hasIntersection ? 0xff0000 : c.initialColor);
            //c.edges.material.color.set(0x000000);
        }
        c.mesh.material.needsUpdate = true;
        c.edges.material.needsUpdate = true;
    });

    createCountertop(selectedCabinets);
});

function createCountertop(selectedCabinets) {
    if (selectedCabinets.length === 0) return;

    const anchorCabinet = selectedCabinets[0];
    if (!anchorCabinet.wallId) {
        updateHint('Столешница для свободно стоящих шкафов будет добавлена позже.');
        console.log('Ожидаем логику для freestandingCabinet');
        return;
    }

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
    const material = new THREE.MeshPhongMaterial({ color: 0x808080 }); // Коричневый
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
        initialMaterial: material.clone(), // Сохраняем начальный материал
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
    //edges.position.copy(countertop.position);
    //edges.rotation.copy(countertop.rotation);

    // Сохраняем ссылку на ребра в userData
    countertop.userData.edges = edges;

    //console.log('Countertop geometry:', geometry.parameters);
    //console.log('Countertop position:', countertop.position);
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
        ctData.thickness || 0.04,
        ctData.depth || 0.6
    );

    // 3. Создание материала (используя тип и цвет из ctData)
    // ---- НАЧАЛО: ИЗМЕНЕННЫЙ БЛОК СОЗДАНИЯ МАТЕРИАЛА ----
    let material;
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
    }
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
        const textureWidth = 2.8;  // 1300 мм
        const textureDepth = 1.3;  // 2800 мм
        const countertopWidth = countertop.userData.length;
        const countertopDepth = countertop.userData.depth;

        //console.log(`updateTextureScale called for ${countertop.uuid}. Length: ${countertopLength}, Depth: ${countertopDepth}`);

        const texture = countertop.material.map;
        if (texture) {
            texture.rotation = Math.PI / 2; // Поворот на 90 градусов
            texture.repeat.set(countertopDepth / textureDepth, countertopWidth / textureWidth);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            countertop.material.needsUpdate = true;
        }
    }
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
 * Учитывает глубину столешницы на этой стене, глубину шкафа, свес и толщину фасада.
 * @param {object} cabinet - Объект шкафа из массива cabinets.
 * @returns {number} Рассчитанный отступ в метрах.
 */
function calculateLowerCabinetOffset(cabinet) {
    if (!cabinet || cabinet.type !== 'lowerCabinet' || !cabinet.wallId || cabinet.wallId === 'Bottom') {
        // Возвращаем текущий отступ или 0, если расчет невозможен/не нужен
        return cabinet ? cabinet.offsetFromParentWall : 0;
    }

    const wallCountertopDepth = getCountertopDepthForWall(cabinet.wallId);

    // Получаем параметры шкафа (из объекта или из умолчаний, если нужно)
    // Убедись, что cabinet.depth, cabinet.overhang, cabinet.facadeThickness доступны
    const cabDepth = cabinet.depth;
    const cabOverhang = cabinet.overhang;
    const cabFacadeThickness = cabinet.facadeThickness;

    if (typeof cabDepth !== 'number' || typeof cabOverhang !== 'number' || typeof cabFacadeThickness !== 'number') {
         console.warn("Missing properties (depth/overhang/facadeThickness) for cabinet offset calculation:", cabinet);
         // Можно вернуть значение по умолчанию или текущее значение
         return cabinet.offsetFromParentWall;
    }

    const offset = wallCountertopDepth - cabDepth - cabOverhang - cabFacadeThickness;
    // Добавим небольшую проверку, чтобы отступ не был слишком большим (шкаф за стеной)
    // или слишком маленьким (шкаф внутри столешницы). Пороговые значения нужно подобрать.
    // return Math.max(-0.1, Math.min(wallCountertopDepth - cabDepth, offset)); // Пример ограничения
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

function setupPostprocessing() {
    composer = new EffectComposer(renderer);
    renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    outlinePass = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera);
    // Настройки внешнего вида обводки (подбери по вкусу)
    outlinePass.edgeStrength = 3.0;    // Сила
    outlinePass.edgeGlow = 0.5;      // Свечение
    outlinePass.edgeThickness = 1.0;   // Толщина
    outlinePass.pulsePeriod = 0;     // Пульсация (0 = нет)
    outlinePass.visibleEdgeColor.set('#00ffff'); // Цвет видимых ребер (голубой)
    outlinePass.hiddenEdgeColor.set('#005588');  // Цвет ребер за объектами (темнее)
    // Важно: Начальный массив выделенных объектов пуст
    outlinePass.selectedObjects = [];
    composer.addPass(outlinePass);

    // Опционально: Сглаживание FXAA (рекомендуется)
    /*
    const fxaaPass = new ShaderPass(FXAAShader);
    const pixelRatio = renderer.getPixelRatio();
    fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * pixelRatio);
    fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * pixelRatio);
    composer.addPass(fxaaPass);
    */

    console.log("Postprocessing setup complete.");
    console.log('Composer initialized:', composer);
    console.log('OutlinePass initialized:', outlinePass);
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

function logCountertopInfo(countertop) {
    if (!countertop || !countertop.userData) {
        console.log("Нет выбранной столешницы.");
        return;
    }

    const { length, depth, thickness, wallId } = countertop.userData;
    const position = countertop.position.clone();
    const roomWidth = currentLength;
    const roomDepth = currentHeight;

    let minX = position.x - (wallId === 'Back' || wallId === 'Front' ? length / 2 : depth / 2);
    let maxX = position.x + (wallId === 'Back' || wallId === 'Front' ? length / 2 : depth / 2);
    let minZ = position.z - (wallId === 'Back' || wallId === 'Front' ? depth / 2 : length / 2);
    let maxZ = position.z + (wallId === 'Back' || wallId === 'Front' ? depth / 2 : length / 2);

    let leftOffset = minX + roomWidth / 2;
    let rightOffset = roomWidth / 2 - maxX;
    let frontOffset = minZ + roomDepth / 2;
    let backOffset = roomDepth / 2 - maxZ;

    console.log("------ Данные о столешнице ------");
    console.log(`Сторона стены: ${wallId}`);
    console.log(`Размеры (Длина x Глубина x Толщина): ${length} x ${depth} x ${thickness}`);
    console.log(`Позиция (X, Z): (${position.x}, ${position.z})`);
    console.log(`Границы (minX: ${minX}, maxX: ${maxX}, minZ: ${minZ}, maxZ: ${maxZ})`);
    console.log("Отступы от углов:");
    console.log(`Левый угол: ${leftOffset} мм`);
    console.log(`Правый угол: ${rightOffset} мм`);
    console.log(`Передний угол: ${frontOffset} мм`);
    console.log(`Задний угол: ${backOffset} мм`);
}


// Привязка слушателей
//document.getElementById('applyRoomChanges').addEventListener('click', applySize());
// Экспорт нужных функций в window
window.addObject = addObject;
window.undoLastAction = undoLastAction;
window.setLeftView = setLeftView;
window.setFrontView = setFrontView;
window.setTopView = setTopView;
window.setIsometricView = setIsometricView;
window.saveProject = saveProject;
window.loadProject = loadProject;
window.applySize = applySize;
window.applyObjectChanges = applyObjectChanges;
window.deleteWindow = deleteWindow;
window.addAdjacentSocket = addAdjacentSocket;
window.showCabinetConfigMenu = showCabinetConfigMenu;
window.applyCabinetChanges = applyCabinetChanges;
window.deleteCabinet = deleteCabinet;
window.applyCabinetConfigChanges = applyCabinetConfigChanges;
window.hideCabinetConfigMenu = hideCabinetConfigMenu;