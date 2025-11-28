// inputManager.js

import * as THREE from 'three';
import { roomDimensions } from './roomManager.js';

// =======================================================
// === ВНУТРЕННИЕ (ПРИВАТНЫЕ) ПЕРЕМЕННЫЕ МОДУЛЯ ==========
// =======================================================

// Зависимости, которые передаст main.js
let _scene, _camera, _renderer, _raycaster, _mouse, _cube;
let _dependencies = {};

// Состояние Drag-n-Drop с панели
let _isDraggingFromPanel = false;
let _draggedObjectType = null;
let _phantomObject = null;

// Твои существующие переменные состояния
let _isRotating = false;
let _isPanning = false;
let _previousMouseX = 0;
let _previousMouseY = 0;
let _draggedCabinet = null;
let _groupDragObjects = [];
let _isCloningMode = false;
let _justDragged = false;
let _potentialDrag = false;
let _activeMoveCommand = null; // Для команды перемещения
let _dragInitialFaceIndex = -1;


// =======================================================
// === ПУБЛИЧНЫЕ ГЕТТЕРЫ/СЕТТЕРЫ (API МОДУЛЯ) ============
// =======================================================

export function setRotating(state) { 
    _isRotating = state;
    if (state) _draggedCabinet = null; // Если вращаем, то не таскаем
}
export function isRotating() { return _isRotating; }

export function setPanning(state) { _isPanning = state; }
export function isPanning() { return _isPanning; }

export function setPreviousMouse(x, y) { _previousMouseX = x; _previousMouseY = y; }
export function getPreviousMouse() { return { x: _previousMouseX, y: _previousMouseY }; }

export function setDraggedCabinet(cabinet) { 
    _draggedCabinet = cabinet;
    if (cabinet) _isRotating = false; // Если таскаем, то не вращаем
}
export function getDraggedCabinet() { return _draggedCabinet; }

export function getActiveMoveCommand() { return _activeMoveCommand; }
export function setActiveMoveCommand(command) { _activeMoveCommand = command; }

export function setGroupDragObjects(objects) { _groupDragObjects = objects; }
export function getGroupDragObjects() { return _groupDragObjects; }

export function setCloningMode(state) { _isCloningMode = state; }
export function isCloning() { return _isCloningMode; }

export function setJustDragged(state) {
    _justDragged = state;
    if (state) {
        setTimeout(() => { _justDragged = false; }, 50);
    }
}
export function justDragged() { return _justDragged; }

export function setPotentialDrag(state) { _potentialDrag = state; }
export function isPotentialDrag() { return _potentialDrag; }

// Функции isDragging и draggedCabinetType теперь заменены на isDraggingFromPanel и draggedObjectType
// Но мы оставим их на случай, если они используются в старой логике, которую еще не перенесли
export function isDragging() { return _isDraggingFromPanel; }
export function getDraggedCabinetType() { return _draggedObjectType; }


// =======================================================
// === ЛОГИКА DRAG-N-DROP С ПАНЕЛИ (теперь приватная) ====
// =======================================================

function _createPhantomObject(type) {
    if (_phantomObject) _scene.remove(_phantomObject);

    // --- НОВАЯ ЛОГИКА ДЛЯ ТЕХНИКИ ---
    if (type === 'hob') {
        // Призрак варочной панели
        const width = 0.595; // 595мм
        const depth = 0.520; // 520мм
        const thickness = 0.006; // 6мм
        const geometry = new THREE.BoxGeometry(width, thickness, depth);
        const material = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.5, transparent: true });
        _phantomObject = new THREE.Mesh(geometry, material);
        
        // Смещаем геометрию, чтобы pivot был снизу по центру (как у реальной модели)
        geometry.translate(0, thickness / 2, 0);
        
    } else if (type === 'sink_model') {
        // Призрак мойки (пока просто коробка)
        const width = 0.550; // Примерная ширина
        const depth = 0.500; 
        const thickness = 0.200; // Глубина чаши
        const geometry = new THREE.BoxGeometry(width, thickness, depth);
        const material = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, opacity: 0.5, transparent: true });
        _phantomObject = new THREE.Mesh(geometry, material);
        // Смещаем так, чтобы верх был на уровне стола
        geometry.translate(0, -thickness / 2, 0);

    } else {
        // --- СТАРАЯ ЛОГИКА ДЛЯ ШКАФОВ И СТЕН ---
        if (!_dependencies.objectTypes) {
            console.error("   - ОШИБКА: _dependencies.objectTypes не определен!");
            return;
        }
        const params = _dependencies.objectTypes[type] || {};
        const width = params.defaultWidth || 0.6;
        let height = params.defaultHeight || 0.8;
        if (type === 'column') height = roomDimensions.getWidth(); // или getHeight, проверьте вашу логику
        const depth = params.defaultDepth || 0.1;

        const geometry = new THREE.BoxGeometry(width, height, depth);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ffff, opacity: 0.5, transparent: true });
        _phantomObject = new THREE.Mesh(geometry, material);
    }
    
    _phantomObject.visible = false;
    if (!_scene) { console.error("   - ОШИБКА: _scene не определена!"); return; }
    _scene.add(_phantomObject);
}

function _onDragMouseMove(event) {
    if (!_isDraggingFromPanel || !_phantomObject) return;

    // --- 1. Получаем АКТУАЛЬНЫЕ размеры комнаты ---
    const roomLength = roomDimensions.getLength();
    const roomWidth = roomDimensions.getWidth();
    const roomHeight = roomDimensions.getHeight();

    // --- 2. Рейкастинг (без изменений) ---
    const rect = _renderer.domElement.getBoundingClientRect();
    _mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    _mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_mouse, _camera);
    
    // ВАЖНО: Мы все еще пересекаем _cube, который теперь всегда актуален
    let targets = [];
    if (['hob', 'sink_model'].includes(_draggedObjectType)) {
        // Если тащим технику, цель - только столешницы!
        // Нам нужно получить массив мешей столешниц. 
        // Предположим, что они доступны через _dependencies.countertops
        // или window.countertops (если нет другого выхода)
        if (window.countertops) targets = window.countertops;
    } else {
        // Если тащим шкафы - стены и пол
        targets = [_cube];
        if (window.floorObject) targets.push(window.floorObject);
    }

    const intersects = _raycaster.intersectObjects(targets, false);

    if (intersects.length > 0) {
        _phantomObject.visible = true;
        const intersect = intersects[0];

        if (['hob', 'sink_model'].includes(_draggedObjectType)) {
            // --- ЛОГИКА ДЛЯ ТЕХНИКИ ---
            const countertop = intersect.object;
            const point = intersect.point;

            // Привязываем к позиции курсора, но фиксируем Y и Z
            _phantomObject.position.copy(point);
            
            // Коррекция высоты: ставим НА столешницу
            // Точка пересечения уже лежит на поверхности, если мы кликаем сверху.
            // Но для надежности можно взять Y верха столешницы.
            
            // Ориентация: поворачиваем так же, как столешницу
            _phantomObject.rotation.copy(countertop.rotation);
            // Если столешница была повернута для экструзии (x=-90), это может сбить с толку.
            // Проще всего: сбросить вращение призрака и повернуть только по Y, как у шкафа под ним.
            
            // Упрощенная логика: просто следуем за курсором по поверхности
            _phantomObject.position.y = point.y + 0.001; // Чуть выше поверхности
             
             // Для моек, которые врезаются, позиция Y будет другой, но пока так.

        } else {
            // --- 3. Позиционирование "призрака" (логика из вашей старой addObjectAtPoint) ---
            const pointOnSurface = intersect.point;
            const faceIdx = _dependencies.determineClickedWallFace_OldLogic(intersect, _mouse);
            const wallId = (faceIdx !== -1) ? _dependencies.faceNormals[faceIdx].id : null;

            if (!wallId) {
                _phantomObject.visible = false;
                return;
            }

            const phantomParams = _phantomObject.geometry.parameters;
            let objWidth = phantomParams.width;
            let objHeight = phantomParams.height;
            let objDepth = phantomParams.depth;
            
            // Для FREESTANDING объектов (на полу), нам нужно учесть вращение
            if (wallId === 'Bottom' && _draggedObjectType === 'freestandingCabinet') {
                // Здесь можно добавить логику определения вращения призрака
                // Например, на основе того, к какой стене ближе курсор.
                // Пока оставим вращение по умолчанию.
            } else {
                _phantomObject.rotation.y = 0;
                if (wallId === 'Left') _phantomObject.rotation.y = THREE.MathUtils.degToRad(90);
                else if (wallId === 'Right') _phantomObject.rotation.y = THREE.MathUtils.degToRad(-90);
            }

            // Клонируем точку пересечения, чтобы не изменять оригинал
            let finalPos = pointOnSurface.clone();

            // Ограничиваем позицию границами комнаты/стены
            finalPos.x = Math.max(-roomLength / 2 + objWidth / 2, Math.min(roomLength / 2 - objWidth / 2, finalPos.x));
            finalPos.y = Math.max(-roomWidth / 2 + objHeight / 2, Math.min(roomWidth / 2 - objHeight / 2, finalPos.y));
            finalPos.z = Math.max(-roomHeight / 2 + objDepth / 2, Math.min(roomHeight / 2 - objDepth / 2, finalPos.z));

            // "Приклеиваем" к стене
            const offset = objDepth / 2;
            if (wallId === 'Back') finalPos.z = -roomHeight / 2 + offset;
            else if (wallId === 'Front') finalPos.z = roomHeight / 2 - offset;
            else if (wallId === 'Left') finalPos.x = -roomLength / 2 + offset;
            else if (wallId === 'Right') finalPos.x = roomLength / 2 - offset;
            else if (wallId === 'Bottom') finalPos.y = -roomWidth / 2 + objHeight / 2;

            _phantomObject.position.copy(finalPos);
        }
    } else {
        _phantomObject.visible = false;
    }
    _dependencies.requestRender();
}

function _onDragMouseUp(event) {
    if (!_isDraggingFromPanel) return;

    _isDraggingFromPanel = false;
    document.removeEventListener('mousemove', _onDragMouseMove);
    document.removeEventListener('mouseup', _onDragMouseUp);
    
    if (_phantomObject) {
        _scene.remove(_phantomObject);
        _phantomObject.geometry.dispose();
        _phantomObject.material.dispose();
        _phantomObject = null;
    }
    _dependencies.requestRender();

    // Определяем точку отпускания
    const rect = _renderer.domElement.getBoundingClientRect();
    const ndcMouse = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    _raycaster.setFromCamera(ndcMouse, _camera);

    let targets = [];
    if (['hob', 'sink_model'].includes(_draggedObjectType)) {
        targets = window.countertops || [];
    } else {
        targets = [_cube];
        if (window.floorObject) targets.push(window.floorObject);
    }

    const intersects = _raycaster.intersectObjects(targets, false);

    if (intersects.length > 0) {
        const intersect = intersects[0];
        if (['hob', 'sink_model'].includes(_draggedObjectType)) {
            // --- СОЗДАНИЕ ТЕХНИКИ ---
            const targetCountertop = intersect.object;
            // Вызываем колбэк, который создаст объект
            // Передаем тип, точку вставки и саму столешницу
            if (_dependencies.callbacks.onApplianceCreate) {
                _dependencies.callbacks.onApplianceCreate(_draggedObjectType, intersect.point, targetCountertop);
            }
        } else {
            // Стена, над которой ФАКТИЧЕСКИ отпустили мышь
            const finalFaceIdx = _dependencies.determineClickedWallFace_OldLogic(intersect, ndcMouse);
            
            if (finalFaceIdx !== -1) {
                const finalWallId = _dependencies.faceNormals[finalFaceIdx].id;
                let canPlace = false; // Флаг, разрешено ли размещение

                // ==> ГЛАВНОЕ ИЗМЕНЕНИЕ: ЛОГИКА РАЗРЕШЕНИЯ <==
                if (_dragInitialFaceIndex !== -1) {
                    // Если мы НАЧАЛИ с выделенной стены...
                    const initialWallId = _dependencies.faceNormals[_dragInitialFaceIndex].id;
                    const isInitialVertical = ['Back', 'Left', 'Right'].includes(initialWallId);
                    const isFinalVertical = ['Back', 'Left', 'Right'].includes(finalWallId);
                    
                    if (isInitialVertical && isFinalVertical) {
                        // Начали с вертикальной и закончили на вертикальной -> РАЗРЕШЕНО
                        canPlace = true;
                    } else if (!isInitialVertical && !isFinalVertical) {
                        // Начали с НЕ-вертикальной (пол) и закончили на НЕ-вертикальной -> РАЗРЕШЕНО
                        canPlace = true;
                    }
                } else {
                    // Если мы начали БЕЗ выделенной стены, разрешаем ставить куда угодно
                    // (актуально для шкафов, которые можно ставить и на пол, и на стену)
                    canPlace = true;
                }
                
                if (canPlace) {
                    // Если размещение разрешено, используем стену под курсором
                    _dependencies.setRoomSelectedFace(finalFaceIdx);
                    _dependencies.callbacks.onObjectCreate(_draggedObjectType, intersect.point, finalWallId);
                } else {
                    // Размещение запрещено (например, тянули со стены на пол)
                    console.log("Размещение отменено: смена типа поверхности (стена -> пол или наоборот).");
                }
            }
        } 
    }
    _draggedObjectType = null;
    _dragInitialFaceIndex = -1; // Сбрасываем
}

function _onDragMouseDown(event) {
    const button = event.currentTarget;
    const objectType = button.dataset.type;
    

    // Запоминаем выделенную стену В МОМЕНТ НАЧАЛА <==
     _dragInitialFaceIndex = _dependencies.getSelectedFaceIndex();

     // --- НОВАЯ, БОЛЕЕ ЧЕТКАЯ ЛОГИКА ---
    // 1. Определяем типы, которые можно ставить на пол
    const canPlaceOnFloor = ['freestandingCabinet'].includes(objectType);

    // 2. Определяем типы техники для столешницы
    const isAppliance = ['hob', 'sink_model'].includes(objectType);

    const isLowerCabinet = objectType === 'lowerCabinet';

    if (_dragInitialFaceIndex === -1) {
        // Если стена не выбрана, разрешаем ТОЛЬКО freestanding И технику
        if (!canPlaceOnFloor && !isAppliance) { // <-- Добавили проверку
            // Если это нижний шкаф и выделен пол - разрешаем
            if (isLowerCabinet && _dependencies.isFloorSelected()) {
                // Разрешаем! (ничего не делаем, код пойдет дальше)
            } else {
                console.log(`Drag-n-drop отменен...`);
                return;
            }
        }
    }

    _isDraggingFromPanel = true;
    _draggedObjectType = objectType;
    event.preventDefault();
    
    _createPhantomObject(_draggedObjectType);

    document.addEventListener('mousemove', _onDragMouseMove);
    document.addEventListener('mouseup', _onDragMouseUp);
}

// =======================================================
// === ГЛАВНАЯ ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ =====================
// =======================================================
export function initInputManager(deps) {
    console.log("Input Manager инициализируется...");
    _dependencies = deps;
    _scene = deps.scene;
    _camera = deps.camera;
    _renderer = deps.renderer;
    _raycaster = deps.raycaster;
    _mouse = deps.mouse;
    _cube = deps.cube;

    const draggableButtons = document.querySelectorAll('.draggable-object-button');
    draggableButtons.forEach(button => {
        button.addEventListener('mousedown', _onDragMouseDown);
    });

    // Здесь мы будем постепенно добавлять остальные обработчики (клики, mousedown на сцене и т.д.)
    console.log("Input Manager готов.");
}

/**
 * Обновляет внутреннюю ссылку на объект комнаты (куб).
 * Должна вызываться из roomManager каждый раз после вызова createCube.
 * @param {THREE.Mesh} newCube - Новый объект комнаты.
 */
export function updateRoomReference(newCube) {
    _cube = newCube;
    console.log("[InputManager] Ссылка на объект комнаты обновлена.");
}