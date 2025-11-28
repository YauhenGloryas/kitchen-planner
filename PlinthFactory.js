import * as THREE from 'three';
import * as MaterialManager from './MaterialManager.js';
import { roomDimensions } from './roomManager.js';
import { createPanel } from './CabinetFactory.js';
// import { getAdjacentWallId } from './CabinetUtils.js'; // Можно использовать, но мы и сами справимся
import { findNearestCornerDirection } from './CabinetUtils.js';

const PLINTH_OFFSET = 0.04; 
const DEFAULT_THICKNESS = 0.018; 
const GAP_TO_WALL = 0.005; 
const CORNER_OFFSET = 0.1; // 100мм от pivot

function isCornerCabinet(cabinet) {
    // Проверка типа шкафа
    return cabinet.cabinetType === 'corner' || cabinet.type === 'cornerLower' || cabinet.cabinetType === 'cornerLower'; 
}

/**
 * Возвращает мировые координаты "внутреннего угла" шкафа (Pivot Point)
 * на основе sideLength.
 */
function getCornerPivotCoord(cabinet, roomL, roomH, side) {
    const sLen = cabinet.sideLength || 0.6; 
    const backLeftX = -roomL/2;
    const backRightX = roomL/2;
    const backZ = -roomH/2; // Min Z
    const frontZ = roomH/2; // Max Z
    
    if (cabinet.wallId === 'Back') {
        if (side === 'left') return backLeftX + sLen;
        else return backRightX - sLen;
    } 
    else if (cabinet.wallId === 'Left') {
        // Left wall: "Left" is Back(MinZ), "Right" is Front(MaxZ).
        if (side === 'left') return backZ + sLen; // Отступаем от Back
        else return frontZ - sLen; // Отступаем от Front
    }
    else if (cabinet.wallId === 'Right') {
        // Right wall: "Left" is Back(MinZ), "Right" is Front(MaxZ).
        if (side === 'left') return backZ + sLen;
        else return frontZ - sLen;
    }
    return 0;
}


export function createPlinth(allSelectedCabinets, materialData) {
    console.log("Selected Cabinets:", allSelectedCabinets);
    //console.log("Factory: Create Plinth with Material:", materialData); // <--- ЛОГ 3
    allSelectedCabinets.forEach(c => console.log(`Cab ID: ${c.id}, Wall: ${c.wallId}, Type: ${c.cabinetType}`));
    if (!allSelectedCabinets || allSelectedCabinets.length === 0) return null;

    const mainGroup = new THREE.Group();
    mainGroup.userData = { type: 'plinth_group', isPlinth: true };

    const groups = { 'Left': [], 'Back': [], 'Right': [], 'Front': [] };
    allSelectedCabinets.forEach(cab => {
        if (groups[cab.wallId]) groups[cab.wallId].push(cab);
    });

    // Сортировка (важно для определения Left/Right Cab)
    groups['Back'].sort((a, b) => a.mesh.position.x - b.mesh.position.x);
    // Left: Z min->max (Back->Front)
    groups['Left'].sort((a, b) => a.mesh.position.z - b.mesh.position.z); 
    // Right: Z min->max (Back->Front)
    groups['Right'].sort((a, b) => a.mesh.position.z - b.mesh.position.z);

    const roomL = roomDimensions.getLength();
    const roomH = roomDimensions.getHeight();

    // Строим для каждой стены
    if (groups['Left'].length > 0) {
        // Левая стена. Левый сосед: Front (обычно нет). Правый сосед: Back.
        const plinth = buildWallPlinth('Left', groups['Left'], groups['Front'], groups['Back'], roomL, roomH, materialData);
        if (plinth) mainGroup.add(plinth);
    }
    if (groups['Back'].length > 0) {
        // Задняя стена. Левый сосед: Left. Правый сосед: Right.
        const plinth = buildWallPlinth('Back', groups['Back'], groups['Left'], groups['Right'], roomL, roomH, materialData);
        if (plinth) mainGroup.add(plinth);
    }
    if (groups['Right'].length > 0) {
        // Правая стена. Левый сосед: Back. Правый сосед: Front.
        const plinth = buildWallPlinth('Right', groups['Right'], groups['Back'], groups['Front'], roomL, roomH, materialData);
        if (plinth) mainGroup.add(plinth);
    }

    return mainGroup;
}

function buildWallPlinth(wallId, cabinets, leftNeighborGroup, rightNeighborGroup, roomL, roomH, materialData) {
    
    const plinthHeight = (window.kitchenGlobalParams?.plinthHeight || 100) / 1000 - 0.002;
    const thickness = DEFAULT_THICKNESS;

    // Получаем материал
    let material;

    if (materialData) {
        material = MaterialManager.getPlinthMaterial(materialData);
        console.log("Factory: Material created:", material); // <--- ЛОГ 4
    }
    
    if (materialData) {
        material = MaterialManager.getPlinthMaterial(materialData);
    } else {
        material = new THREE.MeshStandardMaterial({ color: 0xFFFFFF });
    }
    
    // 1. Определяем крайние шкафы
    let leftCab, rightCab;
    // (Логика сортировки та же, что и была)
     if (wallId === 'Back') {
        // X min -> max. (Left -> Right) - ВЕРНО
        leftCab = cabinets[0]; 
        rightCab = cabinets[cabinets.length - 1];
    } else if (wallId === 'Left') {
        // ТВОЯ ЛОГИКА: Z min (Back) -> Z max (Front).
        // Значит LeftCab = тот, что у Back стены (min Z).
        leftCab = cabinets[0]; // Min Z (после сортировки)
        rightCab = cabinets[cabinets.length - 1]; // Max Z
    } else if (wallId === 'Right') {
        // ТВОЯ ЛОГИКА: Z min (Back) -> Z max (Front).
        // Обычно Right стена зеркальна Left.
        // Если для Left стены "Лево" это Back, то для Right стены "Лево" это Back? 
        // Или для Right стены (лицом к ней) "Лево" это Back?
        // Давай предположим симметрию: Z min -> max всегда.
        leftCab = cabinets[0]; 
        rightCab = cabinets[cabinets.length - 1];
    }

    let depthPos = calculateCarcassDepthPos(wallId, cabinets, roomL, roomH);
    // === ВАЖНО: ОБЪЯВЛЕНИЕ СОСЕДЕЙ ===
    // Должно быть здесь, на верхнем уровне!
    const neighborLeft = (leftNeighborGroup && leftNeighborGroup.length > 0) 
        ? getClosestNeighbor(leftNeighborGroup, leftCab) : null;
        
    const neighborRight = (rightNeighborGroup && rightNeighborGroup.length > 0) 
        ? getClosestNeighbor(rightNeighborGroup, rightCab) : null;
    // ================================
    const leftCabBox = new THREE.Box3().setFromObject(leftCab.mesh);
    const rightCabBox = new THREE.Box3().setFromObject(rightCab.mesh);
    
    let startCoord, endCoord;

    // === 1. ЛЕВАЯ СТОРОНА (Start) ===
    let createLeftSide = true;

    // Проверяем: Является ли левый шкаф "Левым Угловым"?
    // Он должен быть типа 'corner' И стоять в левом углу.
    const isLeftCornerCab = isCornerCabinet(leftCab) && findNearestCornerDirection(leftCab) === 'left';

    if (isLeftCornerCab) {
        // Логика для Левого Углового
        const pivotX = getCornerPivotCoord(leftCab, roomL, roomH, 'left'); // Передаем сторону угла
        
        // ТЗ: Pivot + 100мм (внутрь планки)
        if (wallId === 'Back') startCoord = pivotX - CORNER_OFFSET;
        else if (wallId === 'Left') startCoord = pivotX - CORNER_OFFSET; // Z уменьшается вправо
        else if (wallId === 'Right') startCoord = pivotX - CORNER_OFFSET; // Z увеличивается вправо
        
        createLeftSide = false; // Боковину не строим
    } else {
        // 1.2. Проверка: Сосед угловой?
        console.log(`Building Plinth for ${wallId}`);
        console.log(`Left Neighbor Group:`, leftNeighborGroup);
        console.log(`Found Left Neighbor:`, neighborLeft);
        if (neighborLeft && isCornerCabinet(neighborLeft)) {
            // Логика 2: Сосед угловой -> Стыковка
            
            // Считаем "лицо" соседа (это перпендикулярная координата для нас)
            const neighborFace = calculateCarcassDepthPos(neighborLeft.wallId, [neighborLeft], roomL, roomH);          
            startCoord = neighborFace - (PLINTH_OFFSET - thickness);           
            createLeftSide = false;
        } else {
            // Логика 3: Обычный край
            if (wallId === 'Back') startCoord = leftCabBox.min.x;
            else if (wallId === 'Left') startCoord = leftCabBox.min.z;
            else if (wallId === 'Right') startCoord = leftCabBox.min.z;
            
            if (checkWallTouch(wallId, 'left', startCoord, roomL, roomH)) {
                createLeftSide = false;
            } else {
                startCoord += (PLINTH_OFFSET - thickness);
            }
        }
    }

    // === 2. ПРАВАЯ СТОРОНА (End) ===
    let createRightSide = true;

    // Проверяем: Является ли правый шкаф "Правым Угловым"?
    const isRightCornerCab = isCornerCabinet(rightCab) && findNearestCornerDirection(rightCab) === 'right';

    if (isRightCornerCab) {
        const pivotX = getCornerPivotCoord(rightCab, roomL, roomH, 'right');
        
        // ТЗ: Pivot + 100мм (внутрь планки, т.е. влево от пивота)
        // Для Back: влево это минус.
        if (wallId === 'Back') endCoord = pivotX + CORNER_OFFSET;
        else if (wallId === 'Left') endCoord = pivotX + CORNER_OFFSET; // Z увеличивается влево
        else if (wallId === 'Right') endCoord = pivotX + CORNER_OFFSET; // Z увеличивается 
        
        createRightSide = false;
    } else {
        if (neighborRight && isCornerCabinet(neighborRight)) {
            // Сосед справа угловой
            const neighborFace = calculateCarcassDepthPos(neighborRight.wallId, [neighborRight], roomL, roomH);
            
            // Сдвиг ВЛЕВО (внутрь) = МИНУС
            endCoord = neighborFace + (PLINTH_OFFSET - thickness);
            
            createRightSide = false;
        } else {
            if (wallId === 'Back') endCoord = rightCabBox.max.x;
            else if (wallId === 'Left') endCoord = rightCabBox.max.z;
            else if (wallId === 'Right') endCoord = rightCabBox.max.z;

            if (checkWallTouch(wallId, 'right', endCoord, roomL, roomH)) {
                createRightSide = false;
            } else {
                endCoord -= (PLINTH_OFFSET - thickness);
            }
        }
    }

    // === СОЗДАНИЕ МЕШЕЙ ===
    // (Код создания Mesh практически не меняется, только координаты)
    const group = new THREE.Group();


    // 1. FRONT
    const frontLen = Math.abs(endCoord - startCoord);
    if (frontLen > 0.001) {
        const frontMesh = createPanel(frontLen, plinthHeight, thickness, material, 'frontal', 'plinth_front');
        if (material.map) {
            MaterialManager.applyTexture(frontMesh, 'horizontal', 'frontal');
        }
        const roomW = roomDimensions.getWidth();
        const posY = -roomW/2 + plinthHeight/2;
        
        if (wallId === 'Back') {
            const centerX = (startCoord + endCoord) / 2;
            const posZ = depthPos - PLINTH_OFFSET + thickness/2;
            frontMesh.position.set(centerX, posY, posZ);
        } else if (wallId === 'Left') {
            const centerZ = (startCoord + endCoord) / 2;
            const posX = depthPos - PLINTH_OFFSET + thickness/2;
            frontMesh.position.set(posX, posY, centerZ);
            frontMesh.rotation.y = -Math.PI / 2;
        } else if (wallId === 'Right') {
            const centerZ = (startCoord + endCoord) / 2;
            const posX = depthPos + PLINTH_OFFSET - thickness/2;
            frontMesh.position.set(posX, posY, centerZ);
            frontMesh.rotation.y = Math.PI / 2;
        }
        group.add(frontMesh);
    }

    // 2. LEFT SIDE (только если нужно)
    if (createLeftSide) {
        let sideLen = calculateSideLength(wallId, depthPos, roomL, roomH);
        const sideMesh = createPanel(thickness, plinthHeight, sideLen, material, 'vertical', 'plinth_left');
        if (material.map) {
            MaterialManager.applyTexture(sideMesh, 'horizontal', 'vertical');
        }
        positionSideMesh(sideMesh, wallId, 'left', startCoord, depthPos, sideLen, thickness, roomDimensions.getWidth(), plinthHeight);
        group.add(sideMesh);
    }

    // 3. RIGHT SIDE
    if (createRightSide) {
        let sideLen = calculateSideLength(wallId, depthPos, roomL, roomH);
        const sideMesh = createPanel(thickness, plinthHeight, sideLen, material, 'vertical', 'plinth_right');
        if (material.map) {
            MaterialManager.applyTexture(sideMesh, 'horizontal', 'vertical');
        }
        positionSideMesh(sideMesh, wallId, 'right', endCoord, depthPos, sideLen, thickness, roomDimensions.getWidth(), plinthHeight);
        group.add(sideMesh);
    }

    return group;
}

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (остаются те же или чуть подправленные) ===
// getClosestNeighbor ищет просто ближайший по дистанции (самый надежный способ)
function getClosestNeighbor(neighborGroup, targetCab) {
    let minDist = Infinity;
    let closest = null;
    const targetPos = targetCab.mesh.position;
    neighborGroup.forEach(ng => {
        const dist = ng.mesh.position.distanceTo(targetPos);
        if (dist < minDist) {
            minDist = dist;
            closest = ng;
        }
    });
    return closest;
}

function calculateCarcassDepthPos(wallId, cabinets, roomL, roomH) {
    // Тот же код поиска максимума, что был раньше
    // ...
    let maxVal = -Infinity;
    let minVal = Infinity;
    cabinets.forEach(cab => {
        const offset = cab.offsetFromParentWall || 0;
        const cabDepth = cab.depth || 0.56;
        if (wallId === 'Back') {
            const val = (-roomH / 2) + offset + cabDepth;
            if (val > maxVal) maxVal = val;
        } else if (wallId === 'Left') {
            const val = (-roomL / 2) + offset + cabDepth;
            if (val > maxVal) maxVal = val;
        } else if (wallId === 'Right') {
            const val = (roomL / 2) - offset - cabDepth;
            if (val < minVal) minVal = val;
        }
    });
    return (wallId === 'Right') ? minVal : maxVal;
}

function checkWallTouch(wallId, side, coord, roomL, roomH) {
    if (wallId === 'Back') {
        const wallX = (side === 'left') ? -roomL/2 : roomL/2;
        return Math.abs(coord - wallX) < GAP_TO_WALL;
    }
    if (wallId === 'Left') {
        // Left side = Back Wall (-roomH/2). Right side = Front Wall (roomH/2).
        const wallZ = (side === 'left') ? -roomH/2 : roomH/2;
        return Math.abs(coord - wallZ) < GAP_TO_WALL;
    }
    if (wallId === 'Right') {
        // Left side = Back Wall (-roomH/2). Right side = Front Wall (roomH/2).
        const wallZ = (side === 'left') ? -roomH/2 : roomH/2;
        return Math.abs(coord - wallZ) < GAP_TO_WALL;
    }
    return false;
}

function calculateSideLength(wallId, depthPos, roomL, roomH) {
    if (wallId === 'Back') return Math.abs(depthPos - (-roomH/2)) - PLINTH_OFFSET;
    if (wallId === 'Left') return Math.abs(depthPos - (-roomL/2)) - PLINTH_OFFSET;
    if (wallId === 'Right') return Math.abs(depthPos - (roomL/2)) - PLINTH_OFFSET;
    return 0.5;
}

function positionSideMesh(mesh, wallId, side, xCoord, depthPos, len, thick, roomW, h) {
    const posY = -roomW/2 + h/2;
    // ... (логика координат из предыдущего шага)
    let centerX, centerZ;
    if (wallId === 'Back') {
        centerX = xCoord + (side === 'left' ? thick/2 : -thick/2);
        centerZ = depthPos - PLINTH_OFFSET - len/2; 
        mesh.position.set(centerX, posY, centerZ);
    } else if (wallId === 'Left') {
        if (side === 'left') {
            centerZ = xCoord + thick/2;
        } else {
            centerZ = xCoord - thick/2
        }
        //centerZ = xCoord + (side === 'left' ? thick/2 : -thick/2); // Z axis logic
        const posX = depthPos - PLINTH_OFFSET - len/2;
        mesh.position.set(posX, posY, centerZ);
        mesh.rotation.y = -Math.PI / 2;
    } else if (wallId === 'Right') {
        centerZ = xCoord + (side === 'left' ? thick/2 : -thick/2);
        const posX = depthPos + PLINTH_OFFSET + len/2;
        mesh.position.set(posX, posY, centerZ);
        mesh.rotation.y = Math.PI / 2;
    }
}
