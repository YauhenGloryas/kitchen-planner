import * as THREE from 'three';
import { scene, camera, orthoCamera, renderer, activeCamera, setActiveSceneCamera, controls } from './sceneSetup.js';
import { directionalLight } from './sceneSetup.js';
import { updateRoomReference } from './inputManager.js';

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
    //if (typeof updateEdgeColors_RM === 'function') updateEdgeColors_RM();
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


export function createCube(length, height, width, color) {
    // --- 1. Сохраняем старые материалы стен ---
    const oldMaterialIds = materials.map(mat => mat.userData.materialId || null);
    
    // --- 2. Сбрасываем состояние подсветки ---
    originalMaterialForHighlight = null;
    highlightedFaceIndex = -1;
    
    // --- 3. Удаляем старые 3D-объекты комнаты ---
    if (cube) scene.remove(cube);
    //if (edges) scene.remove(edges);

    // --- 4. Создаем новую геометрию и материалы комнаты ---
    const geometry = new THREE.BoxGeometry(length, height, width);
    
    const newMaterials = [];
    for (let i = 0; i < 6; i++) {
        const oldId = oldMaterialIds[i];
        let material;
        
        // Если для этой грани был сохранен кастомный материал, восстанавливаем его
        if (oldId) {
            let materialInfo;
            // Проверяем, это "виртуальный" цвет или материал из JSON
            if (oldId.startsWith('color_')) {
                const colorHex = `#${oldId.split('_')[1]}`;
                materialInfo = { id: oldId, type: 'color', value: colorHex, roughness: 0.9 };
            } else {
                materialInfo = window.wallMaterialsData.find(m => m.id === oldId);
            }

            // Если нашли информацию (в JSON или это цвет), создаем материал
            if (materialInfo) {
                if (materialInfo.type === 'texture') {
                    const texture = new THREE.TextureLoader().load(materialInfo.value);
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    material = new THREE.MeshStandardMaterial({
                        name: `WallMaterial_${i}_${materialInfo.id}`,
                        map: texture,
                        side: THREE.BackSide,
                        color: materialInfo.baseColor || '#FFFFFF',
                        roughness: materialInfo.roughness || 0.8
                    });
                    // Сразу масштабируем текстуру под новые размеры стены
                    updateWallTextureScale(material.map, i, materialInfo);
                } else { // color
                    material = new THREE.MeshStandardMaterial({
                        name: `WallMaterial_${i}_${materialInfo.id}`,
                        color: materialInfo.value,
                        side: THREE.BackSide,
                        roughness: materialInfo.roughness || 0.8
                    });
                }
                material.userData.materialId = oldId;
            }
        }
        
        // Если материал не был создан (не было ID или не нашли в JSON),
        // создаем материал по умолчанию на основе глобального цвета.
        if (!material) {
             if (i === 3) { // Индекс 3 - это Bottom
                material = new THREE.MeshStandardMaterial({
                    name: `FloorMaterial_Base`,
                    color: '#808080', // Простой серый цвет для "чернового" пола
                    side: THREE.BackSide
                });
            } else {
                material = new THREE.MeshStandardMaterial({
                    name: `WallMaterial_${i}_${color}`,
                    color: color,
                    side: THREE.BackSide,
                    roughness: 0.8
                });
            }
        }
        
        newMaterials.push(material);
    }
    materials = newMaterials;
    
    const newCube = new THREE.Mesh(geometry, materials);
    scene.add(newCube);

    // const edgesGeometry = new THREE.EdgesGeometry(geometry);
    // const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    // const newEdges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    //scene.add(newEdges);
    
    // --- 5. Обновляем глобальные переменные и состояние ---
    cube = newCube;
    //edges = newEdges;
    currentLength = length;
    currentWidth = height;
    currentHeight = width;
    selectedFaceIndex = -1;

    // --- 6. Обновляем позиции ТОЛЬКО простых объектов (окон и т.д.) ---
    // Вся логика для шкафов и столешниц отсюда УДАЛЕНА.
    if (typeof windows !== 'undefined' && Array.isArray(windows)) {
        windows.forEach(obj => {
            if (!obj.mesh) return;
            // Обновляем позицию на основе новых размеров комнаты
            window.updateSimpleObjectPosition(obj); // Используем существующую функцию!
        });
    }

    // --- 7. Обновляем камеру и UI, связанные с комнатой ---
    updateSelectedFaceDisplay_RM();
    adjustCameraAndScale(length, height, width);
    updateFaceBounds_RM();
    updateRoomReference(cube);
    // Запрос на рендер здесь больше не нужен, он будет в applySize
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

    // ==> 2. ВЫЗЫВАЕМ НОВУЮ ЦЕНТРАЛЬНУЮ ФУНКЦИЮ ОБНОВЛЕНИЯ ПОЗИЦИЙ <==
    if (typeof window.updateAllPositionsAfterRoomResize === 'function') {
        window.updateAllPositionsAfterRoomResize();
    } else {
        console.warn("Функция updateAllPositionsAfterRoomResize еще не определена!");
    }


    window.requestRender();

    lengthInput.value = newLength * 1000;
    heightInput.value = newHeight * 1000;
    widthInput.value = newWidth * 1000;
    colorInput.value = newColor;
}

// Объявите эти две переменные вверху вашего файла roomManager.js,
// чтобы они были доступны для всей области видимости модуля.
let originalMaterialForHighlight = null;
let highlightedFaceIndex = -1;

// Теперь замените вашу старую функцию updateEdgeColors_RM на эту:
function updateEdgeColors_RM() {
    // --- ЧАСТЬ 1: ОБНОВЛЕНИЕ ЦВЕТА РЕБЕР (EDGES) ---
    // Эта часть кода остается точно такой же, как у вас была,
    // так как она отвечает за подсветку линий и работает правильно.
    if (edges) {
        const positions = edges.geometry.attributes.position.array;
        const colors = new Float32Array(positions.length);

        for (let i = 0; i < positions.length; i += 6) {
            const x1 = positions[i], y1 = positions[i + 1], z1 = positions[i + 2];
            const x2 = positions[i + 3], y2 = positions[i + 4], z2 = positions[i + 5];

            let isSelectedEdge = false;
            if (selectedFaceIndex !== -1 && faceNormals[selectedFaceIndex]) {
                const face = faceNormals[selectedFaceIndex];
                const nx = face.normal.x * currentLength / 2;
                const ny = face.normal.y * currentWidth / 2;
                const nz = face.normal.z * currentHeight / 2;
                const threshold = 0.01;

                if (Math.abs(face.normal.x) > 0.5 && Math.abs(x1 - nx) < threshold && Math.abs(x2 - nx) < threshold) isSelectedEdge = true;
                if (Math.abs(face.normal.y) > 0.5 && Math.abs(y1 - ny) < threshold && Math.abs(y2 - ny) < threshold) isSelectedEdge = true;
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
            edges.material.needsUpdate = true;
        }
    }


    // --- ЧАСТЬ 2: НОВАЯ, ИСПРАВЛЕННАЯ ЛОГИКА ДЛЯ МАТЕРИАЛОВ СТЕН ---
    // Этот блок полностью заменяет ваш старый `materials.forEach(...)`.
    //console.log(`[UPDATE_VISUALS] Запущена. selectedFaceIndex=${selectedFaceIndex}, highlightedFaceIndex=${highlightedFaceIndex}`);

    // Шаг A: Сначала всегда "отменяем" предыдущую подсветку, если она была.
    // Мы возвращаем стене ее НАСТОЯЩИЙ материал, который мы сохранили.
    if (highlightedFaceIndex !== -1 && originalMaterialForHighlight) {
        if (materials[highlightedFaceIndex]) materials[highlightedFaceIndex].dispose(); // Очищаем временный голубой материал
        materials[highlightedFaceIndex] = originalMaterialForHighlight;
        originalMaterialForHighlight = null;
    }

    // Шаг B: Теперь смотрим на ТЕКУЩЕЕ состояние selectedFaceIndex.
    // Если какая-то стена ДОЛЖНА БЫТЬ выделена...
    if (selectedFaceIndex !== -1 && materials[selectedFaceIndex]) {
        //console.log(`%c[UPDATE_VISUALS] Сохраняем материал '${materials[selectedFaceIndex].name}' и подсвечиваем стену №${selectedFaceIndex}`, 'color: blue;');
        // ...то мы подсвечиваем ее.
        // Сохраняем ее текущий, настоящий материал (например, "Кирпич")
        originalMaterialForHighlight = materials[selectedFaceIndex];
        // Запоминаем, какую стену подсветили
        highlightedFaceIndex = selectedFaceIndex;
        
        // И временно заменяем его на голубой
        materials[selectedFaceIndex] = new THREE.MeshStandardMaterial({ 
            color: 0xADD8E6,
            side: THREE.BackSide 
        });
    } else {
        // Если никакая стена не должна быть выделена (selectedFaceIndex === -1),
        // то просто сбрасываем индекс подсвеченной.
        highlightedFaceIndex = -1;
    }

    // Шаг C: Применяем итоговый массив материалов к кубу.
    if (cube) {
        cube.material = materials;
    }
}

export function getOriginalWallMaterial() {
    return originalMaterialForHighlight;
}

function updateSelectedFaceDisplay_RM() { // Переименовали
    if (selectedFaceDisplayInput_RM) { // Используем переменную модуля
        const faceId = selectedFaceIndex === -1 || !faceNormals[selectedFaceIndex] ? "None" : faceNormals[selectedFaceIndex].id;
        selectedFaceDisplayInput_RM.value = faceId;

        if (wallEditMenu_RM && lowerCabinetContainer_RM) { // Используем переменные модуля
            const showWallMenu = selectedFaceIndex !== -1 && faceNormals[selectedFaceIndex] && ['Back', 'Left', 'Right'].includes(faceNormals[selectedFaceIndex].id);
            const showForBottom = selectedFaceIndex !== -1 && faceNormals[selectedFaceIndex] && faceNormals[selectedFaceIndex].id === 'Bottom';

            // ==> НОВОЕ УСЛОВИЕ: Проверяем, не выделен ли объект пола <==
            const currentSelection = window.getSelectedCabinets ? window.getSelectedCabinets() : [];
            const isFloorObjectSelected = currentSelection.length === 1 && currentSelection[0] === window.floorObject;

            wallEditMenu_RM.style.display = showWallMenu ? 'block' : 'none';
            lowerCabinetContainer_RM.style.display = (showWallMenu || showForBottom || isFloorObjectSelected) ? 'block' : 'none';
        }
    } else {
        // console.warn("updateSelectedFaceDisplay_RM: selectedFaceDisplayInput_RM не найден.");
    }
}

export function setRoomSelectedFace(index) {
    if (typeof index === 'number' && (index >= -1 && index < faceNormals.length)) {
        // Просто меняем состояние
        selectedFaceIndex = index;

        // И просим UI обновиться
        updateEdgeColors_RM();
        updateSelectedFaceDisplay_RM();
    } else {
        console.warn("Попытка установить некорректный selectedFaceIndex:", index);
    }
}

// Для сброса
export function resetRoomSelectedFace() {
    selectedFaceIndex = -1;

    updateEdgeColors_RM();
    updateSelectedFaceDisplay_RM(); // Эта функция обновит UI меню
}

/**
 * Возвращает индекс текущей выделенной грани.
 * @returns {number} Индекс грани или -1.
 */
export function getRoomSelectedFaceIndex() {
    return selectedFaceIndex;
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

export function applyMaterialToWall(faceIndex, materialId) {
    if (faceIndex < 0 || faceIndex >= materials.length) {
        console.error("applyMaterialToWall: неверный индекс грани", faceIndex);
        return;
    }

    let materialInfo;
    // --- НАЧАЛО: Проверяем, является ли ID цветом ---
    if (materialId.startsWith('color_')) {
        const colorHex = `#${materialId.split('_')[1]}`;
        materialInfo = {
            id: materialId,
            type: 'color',
            value: colorHex,
            roughness: 0.9 // Значение по умолчанию для краски
        };
    } else {
        // Если это не цвет, ищем в JSON, как и раньше
        materialInfo = window.wallMaterialsData.find(m => m.id === materialId);
    }
    // --- КОНЕЦ: Проверяем, является ли ID цветом ---

    //const materialInfo = window.wallMaterialsData.find(m => m.id === materialId);
    if (!materialInfo) {
        console.error("applyMaterialToWall: материал не найден", materialId);
        return;
    }

    // Удаляем старый материал, чтобы избежать утечек памяти
    materials[faceIndex].dispose();

    let newMaterial;
    
    // Создаем новый материал на основе данных из JSON
    if (materialInfo.type === 'texture') {
        const texture = new THREE.TextureLoader().load(materialInfo.value);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;

        newMaterial = new THREE.MeshStandardMaterial({
            map: texture,
            side: THREE.BackSide,
            color: materialInfo.baseColor || '#BBBBBB',
            roughness: materialInfo.roughness || 0.8,
            metalness: materialInfo.metalness || 0.1
        });

        // Масштабируем текстуру
        updateWallTextureScale(newMaterial.map, faceIndex, materialInfo);

    } else { // type: 'color'
        newMaterial = new THREE.MeshStandardMaterial({
            color: materialInfo.value,
            side: THREE.BackSide,
            roughness: materialInfo.roughness || 0.8,
            metalness: materialInfo.metalness || 0.1
        });
    }

    // Заменяем материал в массиве
    materials[faceIndex] = newMaterial;
    
    // Сохраняем ID материала в самом материале для Undo/Redo
    newMaterial.userData.materialId = materialId;
    newMaterial.name = materialId;

    // ==> ДОБАВЬТЕ ЭТОТ ЛОГ <==
    console.log(`%c[APPLY] Применяем материал '${materialId}' к стене №${faceIndex}.`, 'color: green; font-weight: bold;');

    // Заменяем материал в массиве
    materials[faceIndex] = newMaterial;
    originalMaterialForHighlight = null;
    //updateEdgeColors_RM();
    // Важно! Сообщаем мешу, что его материалы нужно обновить
    if (cube) {
        cube.material = materials;
        cube.material.needsUpdate = true;
    }

    dependencies.requestRender(); // Вызываем рендер через зависимость
}

// Новая вспомогательная функция для масштабирования текстуры стены
function updateWallTextureScale(texture, faceIndex, materialInfo) {
    const faceId = faceNormals[faceIndex].id;
    
    const textureWidthM = (materialInfo.textureWidthMm || 2000) / 1000;
    const textureHeightM = (materialInfo.textureHeightMm || 2000) / 1000;

    let wallWidth, wallHeight;

    // Определяем ширину и высоту стены
    switch(faceId) {
        case 'Back':
        case 'Front':
            wallWidth = currentLength;
            wallHeight = currentWidth;
            break;
        case 'Left':
        case 'Right':
            wallWidth = currentHeight;
            wallHeight = currentWidth;
            break;
        default: // Top, Bottom
            wallWidth = currentLength;
            wallHeight = currentHeight;
    }

    texture.repeat.set(wallWidth / textureWidthM, wallHeight / textureHeightM);
    texture.needsUpdate = true;
}

export function getWallMaterial(faceIndex) {
    return materials[faceIndex];
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