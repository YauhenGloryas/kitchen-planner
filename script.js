const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, window.innerWidth * 0.7 / window.innerHeight, 0.1, 1000);
camera.position.z = 10;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth * 0.7, window.innerHeight);
document.getElementById('canvasContainer').appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0x404040);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(0, 0, 5);
scene.add(directionalLight);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let cube, edges;
let selectedFaceIndex = -1;
let currentLength = 1, currentWidth = 1, currentHeight = 1;
let materials = [];
let windows = [];
let cabinets = [];
let selectedCabinet = null; // Добавляем глобальную переменную

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
            new THREE.MeshBasicMaterial({ color: obj.initialColor })
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
            new THREE.MeshBasicMaterial({ color: cabinet.initialColor })
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
        initialColor: 0xd2b48c,
        overhang: 18 / 1000,
        facadeThickness: 18 / 1000
        // Убираем defaultHeight, defaultOffsetBottom, defaultoffsetFromParentWall — будем вычислять в addObject
    },
    upperCabinet: {
        defaultWidth: 600 / 1000,
        defaultDepth: 350 / 1000,
        defaultoffsetAlongWall: 0,
        initialColor: 0xd2b48c,
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
        initialColor: 0xd2b48c,
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
            const material = new THREE.MeshBasicMaterial({ color: params.initialColor });
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
        const material = new THREE.MeshBasicMaterial({ color: params.initialColor });
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

        updateCabinetPosition(cabinet);

        const hasIntersection = checkCabinetIntersections(cabinet);
        cabinet.mesh.material.color.set(hasIntersection ? 0xff0000 : cabinet.initialColor);
        cabinet.edges.material.needsUpdate = true;
    });
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
            <label>Ширина полотна, мм: <input type="text" id="doorCanvasWidth" value="${Math.round(doorCanvas.width * 1000)}" data-min="100" style="width: 100px; border-radius: 3px;"></label>
            <label>Высота полотна, мм: <input type="text" id="doorCanvasHeight" value="${Math.round(doorCanvas.height * 1000)}" data-min="100" style="width: 100px; border-radius: 3px;"></label>
            <label>Ширина наличника, мм: <input type="text" id="doorFrameWidth" value="${Math.round(doorFrameLeft.width * 1000)}" data-min="10" style="width: 100px; border-radius: 3px;"></label>
            <label>Толщина наличника, мм: <input type="text" id="doorFrameThickness" value="${Math.round(doorFrameLeft.depth * 1000)}" data-min="5" style="width: 100px; border-radius: 3px;"></label>
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
            <label>Ширина, мм: <input type="text" id="windowWidth" value="${Math.round(windowWidth)}" data-min="100" style="width: 100px; border-radius: 3px;"></label>
            <label>Высота, мм: <input type="text" id="windowHeight" value="${Math.round(windowHeight)}" data-min="100" style="width: 100px; border-radius: 3px;"></label>
            <label>Глубина, мм: <input type="text" id="windowDepth" value="${Math.round(windowDepth)}" data-min="10" style="width: 100px; border-radius: 3px;"></label>
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
            <label>Ширина, мм: <input type="text" id="cabinetWidth" value="${Math.round(cabinet.width * 1000)}" data-min="100" ></label>
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
            <button id="configureCabinetBtn" onclick="showCabinetConfigMenu(${cabinets.indexOf(cabinet)}, ${x}, ${y})">Настроить шкаф</button>
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
            <button id="configureCabinetBtn" onclick="showCabinetConfigMenu(${cabinets.indexOf(cabinet)}, ${x}, ${y})">Настроить шкаф</button>
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
            <button id="configureCabinetBtn" onclick="showCabinetConfigMenu(${cabinets.indexOf(cabinet)}, ${x}, ${y})">Настроить шкаф</button>
        `;
    }

    // --- Блок 4: Кнопки управления ---
    html += `
            <button onclick="applyCabinetChanges(${cabinets.indexOf(cabinet)})">Применить</button>
            <button onclick="deleteCabinet(${cabinets.indexOf(cabinet)})">Удалить</button>
        </div>
    `;

    menu.innerHTML = html;
    menu.style.left = `${x + 30}px`;
    menu.style.top = `${y - 10}px`;
    menu.style.display = 'block';

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

function startDraggingCabinet(cabinet, event) {
    draggedCabinet = cabinet;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragStartoffsetAlongWall = cabinet.offsetAlongWall || 0; // Для обычных шкафов
    dragStartOffsetX = cabinet.offsetX || 0;       // Для свободно-стоящих по X
    dragStartOffsetZ = cabinet.offsetZ || 0;       // Для свободно-стоящих по Z

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

let isDraggingForSave = false; // Глобальный флаг для отслеживания начала перетаскивания

function onMouseMove(event) {
    if (!draggedCabinet) return;

    // Сохраняем состояние и настраиваем выделение только при первом движении
    if (!isDraggingForSave) {
        const cabinetIndex = cabinets.indexOf(draggedCabinet);
        saveState("moveCabinet", { cabinetIndex });
        isDraggingForSave = true;

        // Снимаем выделение со всех шкафов и выделяем текущий
        cabinets.forEach(c => {
            if (c !== draggedCabinet) {
                c.mesh.material.color.set(c.initialColor);
                c.edges.material.color.set(0x000000);
                c.mesh.material.needsUpdate = true;
                c.edges.material.needsUpdate = true;
            }
        });
        selectedCabinet = draggedCabinet; // Устанавливаем перетаскиваемый шкаф как выделенный
        draggedCabinet.mesh.material.color.set(0x00ffff); // Цвет выделения
        draggedCabinet.edges.material.color.set(0x009933);
        draggedCabinet.mesh.material.needsUpdate = true;
        draggedCabinet.edges.material.needsUpdate = true;

        // Показываем размеры в зависимости от типа шкафа
        if (draggedCabinet.type === 'freestandingCabinet') {
            showFreestandingCabinetDimensions(draggedCabinet, cabinets);
        } else if (draggedCabinet.wallId) {
            const config = getWallConfig(draggedCabinet.wallId, draggedCabinet, cabinets);
            draggedCabinet.boundaries = findNearestCabinets(draggedCabinet, cabinets, config.axis, config.maxSize);
            showCabinetDimensionsInput(draggedCabinet, cabinets);
        }
    }

    const rect = renderer.domElement.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
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

        draggedCabinet.mesh.material.color.set(0x00ffff);
        draggedCabinet.edges.material.color.set(0x009933);
        draggedCabinet.mesh.material.needsUpdate = true;
        draggedCabinet.edges.material.needsUpdate = true;

        // Обновляем размеры, используя сохранённые boundaries
        if (draggedCabinet.type === 'freestandingCabinet') {
            updateDimensionsInputPosition(draggedCabinet, cabinets);
        } else {
            updateDimensionsInputPosition(draggedCabinet, cabinets);
        }
    }
}

function onMouseUp(event) {
    if (!draggedCabinet) return;

    const cabinet = draggedCabinet;
    draggedCabinet = null;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    const hasIntersection = checkCabinetIntersections(cabinet);
    cabinet.mesh.material.color.set(hasIntersection ? 0xff0000 : cabinet.initialColor);
    cabinet.edges.material.color.set(0x000000);
    cabinet.mesh.material.needsUpdate = true;
    cabinet.edges.material.needsUpdate = true;

    justDragged = true;
    isDraggingForSave = false;
    setTimeout(() => justDragged = false, 0);

    // Сбрасываем выделение после перетаскивания
    selectedCabinet = null;
    if (widthInput) { widthInput.remove(); widthInput = null; }
    if (depthInput) { depthInput.remove(); depthInput = null; }
    if (heightInput) { heightInput.remove(); heightInput = null; }
    if (distanceLine) { cube.remove(distanceLine); distanceLine.geometry.dispose(); distanceLine = null; }
    if (distanceLineDepth) { cube.remove(distanceLineDepth); distanceLineDepth.geometry.dispose(); distanceLineDepth = null; }
    if (toLeftInput) { toLeftInput.remove(); toLeftInput = null; }
    if (toRightInput) { toRightInput.remove(); toRightInput = null; }
    if (toFrontInput) { toFrontInput.remove(); toFrontInput = null; }
    if (toBackInput) { toBackInput.remove(); toBackInput = null; }
}

// Обработчик правой кнопки для открытия меню выделенного объекта
renderer.domElement.addEventListener('contextmenu', (event) => {
    event.preventDefault();

    if (!cube) return;

    // Ищем уже выделенный объект (голубой)
    const selectedCabinet = cabinets.find(c => c.mesh.material.color.getHex() === 0x00ffff);
    const selectedWindow = windows.find(w => w.mesh.material.color.getHex() === 0x00ffff);

    // Открываем меню только для уже выделенного объекта
    if (selectedCabinet) {
        hideWindowMenu();
        hideSocketMenu();
        hideCabinetMenu();
        showCabinetMenu(event.clientX, event.clientY, selectedCabinet);
    } else if (selectedWindow) {
        hideWindowMenu();
        hideSocketMenu();
        hideCabinetMenu();
        const groupId = selectedWindow.groupId;
        // Используем selectedWindow как запасной вариант, если группа не найдена
        const firstGroupElement = groupId ? windows.find(w => w.groupId === groupId && w.doorIndex === 0) || selectedWindow : selectedWindow;
        if (selectedWindow.type === 'socket') {
            showSocketMenu(event.clientX, event.clientY, selectedWindow);
        } else {
            showWindowMenu(event.clientX, event.clientY, firstGroupElement);
        }
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
    const material = new THREE.MeshBasicMaterial({ color: params.initialColor });
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
        const newoffsetFromParentWall = countertopDepth - newDepth - newOverhang - facadeThickness;

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
    const material = new THREE.MeshBasicMaterial({ color: params.initialColor });
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

            if (
                testMax.x > otherMin.x && testMin.x < otherMax.x &&
                testMax.y > otherMin.y && testMin.y < otherMax.y &&
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

            if (
                testMax.x > otherMin.x && testMin.x < otherMax.x &&
                testMax.y > otherMin.y && testMin.y < otherMax.y &&
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

    if (!['lowerCabinet', 'upperCabinet'].includes(cabinet.type) || cabinet.mesh.material.color.getHex() !== 0x00ffff) {
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
                // Для нижних шкафов обновляем offsetFromParentWall, для верхних — нет
                if (cabinet.type === 'lowerCabinet') {
                    cabinet.offsetFromParentWall = kitchenGlobalParams.countertopDepth / 1000 - cabinet.depth - cabinet.overhang - cabinet.facadeThickness;
                }
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

    if (cabinet.type !== 'freestandingCabinet' || cabinet.mesh.material.color.getHex() !== 0x00ffff) {
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
    console.log('x:', x); // Проверяем, получаем ли config

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


// Обработчик кликов для выделения объектов и стен
renderer.domElement.addEventListener('click', (event) => {
    if (!cube || justDragged) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const allObjects = [...cabinets.map(c => c.mesh), ...windows.map(w => w.mesh)];
    const objectIntersects = raycaster.intersectObjects(allObjects, true);
    const wallIntersects = raycaster.intersectObject(cube, false);

    // Сбрасываем выделение всех объектов перед новой обработкой
    windows.forEach(w => {
        w.mesh.material.color.set(w.initialColor);
        w.edges.material.color.set(0x000000);
        w.mesh.material.needsUpdate = true;
        w.edges.material.needsUpdate = true;
    });
    cabinets.forEach(c => {
        const hasIntersection = checkCabinetIntersections(c);
        c.mesh.material.color.set(hasIntersection ? 0xff0000 : c.initialColor);
        c.edges.material.color.set(0x000000);
        c.mesh.material.needsUpdate = true;
        c.edges.material.needsUpdate = true;
    });
    selectedFaceIndex = -1;

    // Скрываем все меню и поле ширины
    hideWindowMenu();
    hideSocketMenu();
    hideCabinetMenu();
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

    if (objectIntersects.length > 0) {
        const intersect = objectIntersects[0];
        const hitCabinet = cabinets.find(c => c.mesh === intersect.object);
        const hitWindow = windows.find(w => w.mesh === intersect.object);

        if (hitCabinet) {
            selectedCabinet = hitCabinet; // Устанавливаем выделение
            console.log('Selected cabinet on click:', selectedCabinet);
            hitCabinet.mesh.material.color.set(0x00ffff);
            hitCabinet.edges.material.color.set(0xff00ff);
            hitCabinet.mesh.material.needsUpdate = true;
            hitCabinet.edges.material.needsUpdate = true;
            lastSelectedCabinet = null; // Сбрасываем для обновления
            lastCabinetState = null;
            if (['lowerCabinet', 'upperCabinet'].includes(hitCabinet.type) && hitCabinet.wallId) {
                showCabinetDimensionsInput(hitCabinet, cabinets);
            } else if (hitCabinet.type === 'freestandingCabinet') {
                showFreestandingCabinetDimensions(hitCabinet, cabinets);
            }
        } else if (hitWindow) {
            selectedCabinet = null; // Сбрасываем при выборе окна
            const groupId = hitWindow.groupId;
            if (groupId) {
                windows.forEach(w => {
                    if (w.groupId === groupId) {
                        w.mesh.material.color.set(0x00ffff);
                        w.edges.material.color.set(0x00ffff);
                        w.mesh.material.needsUpdate = true;
                        w.edges.material.needsUpdate = true;
                    }
                });
            } else {
                hitWindow.mesh.material.color.set(0x00ffff);
                hitWindow.edges.material.color.set(0x00ffff);
                hitWindow.mesh.material.needsUpdate = true;
                hitWindow.edges.material.needsUpdate = true;
            }
        }
    } else if (wallIntersects.length > 0) {
        selectedCabinet = null; // Сбрасываем при клике на стену
        const intersect = wallIntersects[0];
        const normal = intersect.face.normal.clone().applyEuler(cube.rotation);
        const cameraDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

        faceNormals.forEach((face, index) => {
            const globalNormal = face.normal.clone().applyEuler(cube.rotation);
            const dot = globalNormal.dot(cameraDirection);

            if (dot > 0) {
                const vertices = getFaceVertices(face.id);
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

                vertices.forEach(vertex => {
                    const proj = vertex.clone().applyMatrix4(cube.matrixWorld).project(camera);
                    minX = Math.min(minX, proj.x);
                    minY = Math.min(minY, proj.y);
                    maxX = Math.max(maxX, proj.x);
                    maxY = Math.max(maxY, proj.y);
                });

                if (mouse.x >= minX && mouse.x <= maxX && mouse.y >= minY && mouse.y <= maxY) {
                    const angle = normal.angleTo(face.normal);
                    if (angle <= Math.PI / 2) {
                        selectedFaceIndex = index;
                    }
                }
            }
        });
    }

    updateEdgeColors();
    updateSelectedFaceDisplay();
});

// Новый обработчик для начала перетаскивания
renderer.domElement.addEventListener('mousedown', (event) => {
    if (!cube || event.button !== 0) return; // Только левая кнопка

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const cabinetIntersects = raycaster.intersectObjects(cabinets.map(c => c.mesh), true);

    if (cabinetIntersects.length > 0) {
        const intersect = cabinetIntersects[0];
        const cabinetHit = cabinets.find(c => c.mesh === intersect.object);
        if (cabinetHit) {
            // Задержка для различения клика и перетаскивания
            const dragTimeout = setTimeout(() => {
                startDraggingCabinet(cabinetHit, event);
            }, 200); // 200 мс — порог для начала перетаскивания

            // Отменяем перетаскивание, если клик завершён раньше
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
            //console.log("Enter pressed globally"); // Отладка
            const windowMenu = document.getElementById('windowMenu');
            const socketMenu = document.getElementById('socketMenu');
            const cabinetMenu = document.getElementById('cabinetMenu');
            const kitchenParamsPopup = document.getElementById('kitchenParamsPopup');
            const configMenu = document.getElementById('cabinetConfigMenu');

            // Если открыто меню конфигурации, ничего не делаем
            if (configMenu && configMenu.style.display === 'block') {
                return; // Enter уже обработан в showCabinetConfigMenu
            }
            // Обрабатываем Enter для других меню
            if (windowMenu && windowMenu.style.display === 'block') {
                const selectedObj = windows.find(w => w.mesh.material.color.getHex() === 0x00ffff);
                if (selectedObj) applyObjectChanges(windows.indexOf(selectedObj));
            } else if (socketMenu && socketMenu.style.display === 'block') {
                const selectedObj = windows.find(w => w.mesh.material.color.getHex() === 0x00ffff);
                if (selectedObj) applyObjectChanges(windows.indexOf(selectedObj));
            } else if (cabinetMenu && cabinetMenu.style.display === 'block') {
                const selectedCabinet = cabinets.find(c => c.mesh.material.color.getHex() === 0x00ffff);
                if (selectedCabinet) applyCabinetChanges(cabinets.indexOf(selectedCabinet));
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
    if (window.stopAnimation) return;
    requestAnimationFrame(animate);

    cube.updateMatrixWorld(true);
    renderer.render(scene, camera);

    const isRotating = cube.rotation.y !== lastRotationY;
    const isDragging = !!draggedCabinet;
    let isPositionChanged = false;
    if (selectedCabinet) {
        if (selectedCabinet.type === 'freestandingCabinet') {
            isPositionChanged = lastOffsetX !== selectedCabinet.offsetX || lastOffsetZ !== selectedCabinet.offsetZ;
        } else {
            isPositionChanged = lastOffsetAlongWall !== selectedCabinet.offsetAlongWall;
        }
    }

    if (isDragging && cabinets) {
        //console.log('Updating for draggedCabinet', draggedCabinet);
        updateDimensionsInputPosition(draggedCabinet, cabinets);
    } else if (selectedCabinet && cabinets && (isRotating || isDragging || isPositionChanged)) {
        //console.log('Updating for selectedCabinet', selectedCabinet);
        updateDimensionsInputPosition(selectedCabinet, cabinets);
    } else if (selectedCabinet && (selectedCabinet !== lastSelectedCabinet || cabinets.length !== lastCabinetsLength)) {
        //console.log('Scene state changed, updating selectedCabinet', selectedCabinet);
        updateDimensionsInputPosition(selectedCabinet, cabinets);
    }

    lastRotationY = cube.rotation.y;
    lastSelectedCabinet = selectedCabinet;
    lastCabinetsLength = cabinets.length;
    if (selectedCabinet) {
        if (selectedCabinet.type === 'freestandingCabinet') {
            lastOffsetX = selectedCabinet.offsetX;
            lastOffsetZ = selectedCabinet.offsetZ;
        } else {
            lastOffsetAlongWall = selectedCabinet.offsetAlongWall;
        }
    }

    if (isRotating || isDragging || isPositionChanged || selectedCabinet !== lastSelectedCabinet || cabinets.length !== lastCabinetsLength) {
        //console.log('Scene active:', { isRotating, isDragging, isPositionChanged, selectedCabinet, cabinets });
    } else if (!selectedCabinet && (selectedCabinet !== lastSelectedCabinet || cabinets.length !== lastCabinetsLength)) {
        //console.log('No cabinet selected or dragged', { selectedCabinet, cabinets });
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
    params.defaultoffsetFromParentWall = countertopDepth - params.defaultDepth - params.overhang - params.facadeThickness;

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
    const material = new THREE.MeshBasicMaterial({ color: params.initialColor });
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
        initialColor: '#d2b48c',
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
    const material = new THREE.MeshBasicMaterial({ color: params.initialColor });
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
            ...obj,
            position: { x: obj.mesh.position.x, y: obj.mesh.position.y, z: obj.mesh.position.z },
            rotation: { y: obj.mesh.rotation.y },
            initialColor: typeof obj.initialColor === 'number' ? `#${obj.initialColor.toString(16).padStart(6, '0')}` : obj.initialColor
        })),
        cabinets: cabinets.map(cabinet => ({
            ...cabinet,
            position: { x: cabinet.mesh.position.x, y: cabinet.mesh.position.y, z: cabinet.mesh.position.z },
            rotation: { y: cabinet.mesh.rotation.y },
            initialColor: typeof cabinet.initialColor === 'number' ? `#${cabinet.initialColor.toString(16).padStart(6, '0')}` : cabinet.initialColor
        }))
    };

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
    console.log("Project saved");
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
                const projectState = JSON.parse(e.target.result);

                // Очищаем текущие объекты из сцены
                windows.forEach(obj => cube.remove(obj.mesh));
                cabinets.forEach(cabinet => cube.remove(cabinet.mesh));
                windows = [];
                cabinets = [];

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
                Object.assign(kitchenGlobalParams, projectState.kitchenParams);

                // Восстанавливаем окна
                windows = projectState.windows.map(obj => {
                    const mesh = new THREE.Mesh(
                        new THREE.BoxGeometry(obj.width, obj.height, obj.depth),
                        new THREE.MeshBasicMaterial({ color: obj.initialColor })
                    );
                    const edgesGeometry = new THREE.EdgesGeometry(mesh.geometry);
                    const edges = new THREE.LineSegments(edgesGeometry, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }));
                    edges.raycast = () => {};
                    mesh.add(edges);
                    mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
                    mesh.rotation.y = obj.rotation.y;
                    cube.add(mesh);

                    // Удаляем mesh из объекта, чтобы не дублировать ссылку
                    const { position, rotation, ...rest } = obj;
                    return { ...rest, mesh, edges };
                });

                // Восстанавливаем шкафы
                cabinets = projectState.cabinets.map(cabinet => {
                    const mesh = new THREE.Mesh(
                        new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth),
                        new THREE.MeshBasicMaterial({ color: cabinet.initialColor })
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

                // Синхронизируем камеру
                camera.position.set(
                    projectState.camera?.position.x ?? 0,
                    projectState.camera?.position.y ?? 0,
                    projectState.camera?.position.z ?? 10
                );
                camera.fov = projectState.camera?.fov ?? 30;
                camera.updateProjectionMatrix();
                camera.lookAt(0, 0, 0);

                // Обновляем интерфейс
                rotateXSlider.value = THREE.MathUtils.radToDeg(projectState.room.rotationX);
                rotateYSlider.value = THREE.MathUtils.radToDeg(projectState.room.rotationY);
                updateRotationDisplay();
                updateEdgeColors();
                updateSelectedFaceDisplay();
                updateFaceBounds();

                console.log("Project loaded");
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
    menu.appendChild(createInputField('Глубина столешницы (мм):', 'countertopDepth', kitchenGlobalParams.countertopDepth));
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
    kitchenGlobalParams.countertopDepth = parseFloat(document.getElementById('countertopDepth').value) || kitchenGlobalParams.countertopDepth;
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
            cabinet.offsetFromParentWall = (kitchenGlobalParams.countertopDepth - cabinet.depth * 1000 - cabinet.overhang * 1000 - cabinet.facadeThickness * 1000) / 1000;

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