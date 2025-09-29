import * as THREE from 'three';
import { scene, camera, orthoCamera, renderer, activeCamera, setActiveSceneCamera, controls } from './sceneSetup.js';
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

let dependencies = {
    requestRender: () => console.error("requestRender not provided to roomManager"),
    // Здесь могут быть и другие зависимости в будущем
};

// Переменные для DOM-элементов
// --- ИЗМЕНЕНИЕ: Объявляем все DOM-переменные в начале модуля ---
let selectedFaceDisplayInput_RM;
let wallEditMenu_RM;
let lowerCabinetContainer_RM;
let lengthInput, heightInput, widthInput, cubeColorInput;
let cubeColorInput_RM;
let faceBoundsTable_RM;
let selectedFaceDisplayInput;

const faceNormals = [
    { id: "Right", normal: new THREE.Vector3(1, 0, 0) },
    { id: "Left", normal: new THREE.Vector3(-1, 0, 0) },
    { id: "Top", normal: new THREE.Vector3(0, 1, 0) },
    { id: "Bottom", normal: new THREE.Vector3(0, -1, 0) },
    { id: "Front", normal: new THREE.Vector3(0, 0, 1) },
    { id: "Back", normal: new THREE.Vector3(0, 0, -1) }
];

/**
 * Инициализирует менеджер комнаты и получает внешние зависимости.
 * @param {object} deps - Объект с зависимостями из script.js
 */
export function initRoomManager(deps) {
    Object.assign(dependencies, deps);
    console.log("Room Manager инициализирован.");
}

export function initRoomManagerDOM() {
    cubeColorInput = document.getElementById('cubeColor');
    lengthInput = document.getElementById('length');
    heightInput = document.getElementById('height');
    widthInput = document.getElementById('width');
    selectedFaceDisplayInput = document.getElementById('selectedFace');
    selectedFaceDisplayInput_RM = document.getElementById('selectedFace');
    wallEditMenu_RM = document.getElementById('wallEditMenu');
    lowerCabinetContainer_RM = document.getElementById('lowerCabinetContainer');
    cubeColorInput_RM = document.getElementById('cubeColor');
    faceBoundsTable_RM = document.getElementById('faceBoundsTable');
    
    // --- ИЗМЕНЕНИЕ: Весь код для ручного управления вращением и зумом (слайдеры, обработчик 'wheel') УДАЛЕН.
    // Этим теперь полностью занимается OrbitControls.

    // Вызываем функции, которые должны обновить UI при инициализации
    updateSelectedFaceDisplay_RM();
    updateEdgeColors_RM();
    updateFaceBounds_RM();
}

// --- ИЗМЕНЕНИЕ: Функция больше не масштабирует куб, а настраивает камеру для обзора всей комнаты.
function adjustCameraAndScale(length, height, width) {
    const maxDimension = Math.max(length, height, width);

    // Устанавливаем позицию камеры так, чтобы вся комната была видна.
    // Эти значения можно подобрать для лучшего вида.
    camera.position.x = maxDimension * 0.8;
    camera.position.y = maxDimension * 0.6;
    camera.position.z = maxDimension * 0.8;

    // Убеждаемся, что OrbitControls знают, куда смотреть
    if (controls) {
        controls.target.set(0, 0, 0); // Смотрим на центр комнаты
        controls.update(); // Применяем изменения
    }

    if (typeof updateFaceBounds_RM === 'function') updateFaceBounds_RM();
}

// Эту функцию мы определим здесь, так как она специфична для настройки орто-видов комнаты
function setupOrthoCameraViewRM(viewType) {
    if (!orthoCamera || !renderer || !scene) {
        console.error("setupOrthoCameraViewRM: Отсутствуют orthoCamera, renderer или scene.");
        return;
    }
    setActiveSceneCamera(orthoCamera);
    orthoCamera.zoom = 1;

    const roomSizeForView = Math.max(currentLength, currentWidth, currentHeight, 1);
    const zoomFactor = 1.2;
    let targetFrustumSize = roomSizeForView * zoomFactor;

    const aspect = renderer.domElement.clientWidth / renderer.domElement.clientHeight;
    orthoCamera.left = targetFrustumSize * aspect / -2;
    orthoCamera.right = targetFrustumSize * aspect / 2;
    orthoCamera.top = targetFrustumSize / 2;
    orthoCamera.bottom = targetFrustumSize / -2;
    orthoCamera.near = 0.1;
    orthoCamera.far = 1000;

    const distance = roomSizeForView * 5;

    switch (viewType) {
        case 'Left':
            orthoCamera.position.set(distance, 0, 0);
            orthoCamera.up.set(0, 1, 0);
            break;
        case 'Right':
            orthoCamera.position.set(-distance, 0, 0);
            orthoCamera.up.set(0, 1, 0);
            break;
        case 'Front': // Вид на стену Back
            orthoCamera.position.set(0, 0, distance);
            orthoCamera.up.set(0, 1, 0);
            break;
        case 'Back': // Вид на стену Front
            orthoCamera.position.set(0, 0, -distance);
            orthoCamera.up.set(0, 1, 0);
            break;
        case 'Top':
            orthoCamera.position.set(0, distance, 0);
            orthoCamera.up.set(0, 0, -1);
            break;
        case 'Bottom':
            orthoCamera.position.set(0, -distance, 0);
            orthoCamera.up.set(0, 0, 1);
            break;
        default:
            return;
    }
    orthoCamera.lookAt(scene.position);
    orthoCamera.updateProjectionMatrix();

    if (typeof updateFaceBounds_RM === 'function') updateFaceBounds_RM();
    if (typeof updateEdgeColors_RM === 'function') updateEdgeColors_RM();
}

function forceCameraReset(cameraInstance) {
    cameraInstance.position.set(0, 0, 0);
    cameraInstance.rotation.set(0, 0, 0);
    cameraInstance.quaternion.set(0, 0, 0, 1);
    cameraInstance.updateMatrixWorld(true);
}

// --- ИЗМЕНЕНИЕ: Версия 3. Более надежные функции переключения видов. ---

export function setLeftView() {
    if (!cube) return;
    
    // Сначала отключаем controls, чтобы они не мешали.
    if (controls) {
        controls.enabled = false; // Выключаем, чтобы остановить любое движение
        controls.enabled = true;  // Включаем, чтобы применить остановку
    }

    setActiveSceneCamera(orthoCamera);

    // Сбрасываем все трансформации камеры, чтобы начать с чистого листа.
    orthoCamera.position.set(0, 0, 0);
    orthoCamera.rotation.set(0, 0, 0);
    orthoCamera.quaternion.set(0, 0, 0, 1);
    orthoCamera.up.set(0, 1, 0); // Стандартный "верх"
    
    // Устанавливаем новую позицию.
    const distance = currentLength; // Дистанция равна размеру комнаты
    orthoCamera.position.x = distance;
    
    // Смотрим в центр сцены.
    orthoCamera.lookAt(0, 0, 0);
    
    // Обновляем камеру.
    orthoCamera.updateProjectionMatrix();
    orthoCamera.updateMatrixWorld();

    // Теперь, когда камера на месте, "перезагружаем" controls.
    if (controls) {
        controls.target.set(0, 0, 0); // Устанавливаем новую цель
        controls.enabled = true;      // Включаем обратно
        controls.update();            // Синхронизируем
    }
}

export function setFrontView() {
    if (!cube) return;
    
    if (controls) {
        controls.enabled = false; // Выключаем, чтобы остановить любое движение
        controls.enabled = true;  // Включаем, чтобы применить остановку
    }
    setActiveSceneCamera(orthoCamera);

    orthoCamera.position.set(0, 0, 0);
    orthoCamera.rotation.set(0, 0, 0);
    orthoCamera.quaternion.set(0, 0, 0, 1);
    orthoCamera.up.set(0, 1, 0);

    const distance = currentHeight;
    orthoCamera.position.z = distance;
    
    orthoCamera.lookAt(0, 0, 0);

    orthoCamera.updateProjectionMatrix();
    orthoCamera.updateMatrixWorld();

    if (controls) {
        controls.target.set(0, 0, 0);
        controls.enabled = true;
        controls.update();
    }
}

export function setTopView() {
    if (!cube) return;
    
    if (controls) {
        controls.enabled = false; // Выключаем, чтобы остановить любое движение
        controls.enabled = true;  // Включаем, чтобы применить остановку
    }
    setActiveSceneCamera(orthoCamera);

    orthoCamera.position.set(0, 0, 0);
    orthoCamera.rotation.set(0, 0, 0);
    orthoCamera.quaternion.set(0, 0, 0, 1);
    
    // ВАЖНО: для вида сверху меняем направление "вверх"
    orthoCamera.up.set(0, 0, -1); 

    const distance = currentWidth;
    orthoCamera.position.y = distance;
    
    orthoCamera.lookAt(0, 0, 0);
    
    orthoCamera.updateProjectionMatrix();
    orthoCamera.updateMatrixWorld();

    if (controls) {
        controls.target.set(0, 0, 0);
        controls.enabled = true;
        controls.update();
    }
}

export function setIsometricView() {
    if (!cube || !camera) return;

    // --- Вот решение для "возврата в исходную позицию" ---
    if (controls) {
        controls.enabled = false; // Выключаем, чтобы остановить любое движение
        controls.enabled = true;  // Включаем, чтобы применить остановку
    }
    setActiveSceneCamera(camera);
    
    // 1. Устанавливаем стандартную "красивую" изометрическую позицию.
    // Мы берем размеры комнаты, чтобы камера всегда была на адекватном расстоянии.
    camera.position.set(currentLength * 0.9, currentWidth * 0.8, currentHeight * 0.9);
    
    // 2. Сбрасываем цель вращения в центр комнаты.
    if (controls) {
        controls.target.set(0, 0, 0);
    }
    
    // 3. Указываем камере посмотреть на эту цель.
    camera.lookAt(controls.target);

    // 4. Сбрасываем направление "вверх" на стандартное.
    camera.up.set(0, 1, 0);

    // 5. Обновляем все.
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    
    // 6. Включаем controls и синхронизируем их с новой позицией камеры и цели.
    if (controls) {
        controls.enabled = true;
        controls.update();
    }
}


const roomRaycaster = new THREE.Raycaster(); // Локальный raycaster для комнаты

function handleRoomClick(mouseNDC, currentActiveCamera) {
    if (!cube || !currentActiveCamera) return false;

    roomRaycaster.setFromCamera(mouseNDC, currentActiveCamera);
    const intersects = roomRaycaster.intersectObject(cube, false);

    if (intersects.length > 0) {
        const intersect = intersects[0];
        const clickedFaceIdx = determineClickedWallFace_OldLogic(intersect, mouseNDC);
        setRoomSelectedFace(clickedFaceIdx);
        return true;
    }
    return false;
}

// --- ИЗМЕНЕНИЕ: Функция больше не принимает и не использует параметры вращения.
export function createCube(length, height, width, color) {
    const detailedCabinetData = [];
    let newCube = null;
    let newEdges = null;

    try {
        if (typeof cabinets !== 'undefined' && Array.isArray(cabinets)) {
            cabinets.forEach((cabinet, index) => {
                if (cabinet.isDetailed && cabinet.mesh && cabinet.mesh.isGroup) {
                    detailedCabinetData.push({ uuid: cabinet.mesh.uuid, index: index, oldMesh: cabinet.mesh });
                    if (cabinet.mesh.parent) cabinet.mesh.parent.remove(cabinet.mesh);
                }
            });
        }

        if (cube) scene.remove(cube);
        if (edges) scene.remove(edges);

        const geometry = new THREE.BoxGeometry(length, height, width);
        geometry.groups.forEach((group, index) => group.materialIndex = index);
        materials = [
            new THREE.MeshPhongMaterial({ color: color, side: THREE.BackSide }), new THREE.MeshPhongMaterial({ color: color, side: THREE.BackSide }),
            new THREE.MeshPhongMaterial({ color: color, side: THREE.BackSide }), new THREE.MeshPhongMaterial({ color: color, side: THREE.BackSide }),
            new THREE.MeshPhongMaterial({ color: color, side: THREE.BackSide }), new THREE.MeshPhongMaterial({ color: color, side: THREE.BackSide })
        ];

        newCube = new THREE.Mesh(geometry, materials);
        // --- ИЗМЕНЕНИЕ: Вращение не устанавливается, оно всегда (0,0,0) ---
        scene.add(newCube);

        const edgesGeometry = new THREE.EdgesGeometry(geometry);
        const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
        newEdges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
        scene.add(newEdges);

    } catch (error) {
        console.error("Критическая ошибка при создании куба:", error);
        return;
    }

    cube = newCube;
    edges = newEdges;

    currentLength = length;
    currentWidth = height;
    currentHeight = width;
    selectedFaceIndex = -1;
    updateSelectedFaceDisplay_RM();
    adjustCameraAndScale(length, height, width);
    updateFaceBounds_RM();


    // --- ИЗМЕНЕНИЕ: Все дочерние объекты теперь добавляются в SCENE, а не в CUBE ---
    // Это самое важное архитектурное изменение.

    // Обработка ОКОН
    if (typeof windows !== 'undefined' && Array.isArray(windows)) {
        windows.forEach(obj => {
            if (!obj.mesh) return;
            scene.add(obj.mesh); // <-- ИЗМЕНЕНИЕ
            // ... (обновление позиции окон, формулы остаются прежними, т.к. куб в (0,0,0))
            const { width: objWidth, height: objHeight, depth: objDepth, offsetAlongWall, offsetBottom, offsetFromParentWall, wallId } = obj;
            switch (wallId) {
                case "Back": obj.mesh.position.set(-currentLength / 2 + offsetAlongWall + objWidth / 2, -currentWidth / 2 + offsetBottom + objHeight / 2, -currentHeight / 2 + offsetFromParentWall + objDepth / 2); obj.mesh.rotation.y = 0; break;
                case "Left": obj.mesh.position.set(-currentLength / 2 + offsetFromParentWall + objDepth / 2, -currentWidth / 2 + offsetBottom + objHeight / 2, -currentHeight / 2 + offsetAlongWall + objWidth / 2); obj.mesh.rotation.y = THREE.MathUtils.degToRad(90); break;
                case "Right": obj.mesh.position.set(currentLength / 2 - offsetFromParentWall - objDepth / 2, -currentWidth / 2 + offsetBottom + objHeight / 2, -currentHeight / 2 + offsetAlongWall + objWidth / 2); obj.mesh.rotation.y = THREE.MathUtils.degToRad(-90); break;
            }
        });
    }

    // Обработка НЕ детализированных шкафов
    if (typeof cabinets !== 'undefined' && Array.isArray(cabinets)) {
        cabinets.forEach(cabinet => {
            if (!cabinet.isDetailed) {
                // ... (логика создания нового меша)
                updateCabinetMeshFromData(cabinet);
                scene.add(cabinet.mesh); // <-- ИЗМЕНЕНИЕ
                // ... (проверка пересечений)
            }
        });
    }

    // Обработка СТОЛЕШНИЦ
    if (typeof countertops !== 'undefined' && Array.isArray(countertops)) {
        countertops.forEach(countertop => {
            if (!countertop) return;
            scene.add(countertop); // <-- ИЗМЕНЕНИЕ
            // ... (обновление позиции столешниц)
        });
    }

    // Восстановление детализированных шкафов
    if (typeof cabinets !== 'undefined' && Array.isArray(cabinets)) {
        detailedCabinetData.forEach(data => {
            const cabinet = cabinets[data.index];
            if (cabinet && cabinet.isDetailed) {
                const newDetailedGroup = getDetailedCabinetRepresentation(cabinet);
                if (newDetailedGroup) {
                    // ... (восстановление UUID и трансформаций)
                    cabinet.mesh = newDetailedGroup;
                    scene.add(newDetailedGroup); // <-- ИЗМЕНЕНИЕ
                    // ... (очистка, подсветка)
                } else {
                    // ... (обработка ошибки, создание простого меша)
                    scene.add(cabinet.mesh); // <-- ИЗМЕНЕНИЕ
                }
            }
        });
    }

    window.requestRender();
}

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
    
    createCube(newLength, newHeight, newWidth, newColor);

    window.requestRender();

    lengthInput.value = newLength * 1000;
    heightInput.value = newHeight * 1000;
    widthInput.value = newWidth * 1000;
    colorInput.value = newColor;
}

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
    if (!cube || !activeCamera || !intersect || !intersect.face || !mouseNDC) return -1;

    // --- ИЗМЕНЕНИЕ: Убираем .applyEuler(cube.rotation), так как куб не вращается.
    // Локальная нормаль полигона теперь совпадает с мировой.
    const normalFromIntersectedFace = intersect.face.normal.clone();

    const cameraDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(activeCamera.quaternion);
    let bestMatchIndex = -1;
    let highestDot = -Infinity;

    faceNormals.forEach((faceData, index) => {
        // --- ИЗМЕНЕНИЕ: Убираем .applyEuler(cube.rotation) и здесь.
        const globalFaceNormalFromPreset = faceData.normal.clone();
        const dotToCamera = globalFaceNormalFromPreset.dot(cameraDirection);

        if (dotToCamera > 0.1) {
            const vertices = getFaceVertices(faceData.id);
            if (vertices && vertices.length > 0) {
                let minX_proj = Infinity, minY_proj = Infinity, maxX_proj = -Infinity, maxY_proj = -Infinity;
                const projector = new THREE.Vector3();

                vertices.forEach(vertex => {
                    // --- ИЗМЕНЕНИЕ: матрица мира куба теперь единичная, но для общности оставим applyMatrix4
                    projector.copy(vertex).applyMatrix4(cube.matrixWorld).project(activeCamera);
                    minX_proj = Math.min(minX_proj, projector.x);
                    minY_proj = Math.min(minY_proj, projector.y);
                    maxX_proj = Math.max(maxX_proj, projector.x);
                    maxY_proj = Math.max(maxY_proj, projector.y);
                });

                if (mouseNDC.x >= minX_proj && mouseNDC.x <= maxX_proj &&
                    mouseNDC.y >= minY_proj && mouseNDC.y <= maxY_proj) {

                    const angleBetweenNormals = normalFromIntersectedFace.angleTo(globalFaceNormalFromPreset);
                    if (angleBetweenNormals < 0.1) {
                        if (dotToCamera > highestDot) {
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
    cube, 
    edges,
    selectedFaceIndex, 
    currentLength,
    currentWidth,
    currentHeight,
    faceNormals,
    materials,
    // createCube - уже экспортируется через 'export function'
    updateSelectedFaceDisplay_RM as updateSelectedFaceDisplay, 
    updateEdgeColors_RM as updateEdgeColors, 
    updateFaceBounds_RM as updateFaceBounds, 
    handleRoomClick,
    roomDimensions
};