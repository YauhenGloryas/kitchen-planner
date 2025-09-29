// --- Импорты, которые нам понадобятся в будущем ---
import * as THREE from 'three';

// ==========================================================
// ===         СЕКЦИЯ 1: СОСТОЯНИЕ (ПЕРЕМЕННЫЕ)           ===
// ==========================================================
// Все переменные, которые раньше были глобальными в script.js,
// теперь живут здесь. Имя с подчеркиванием (_) означает, что
// переменную не следует менять напрямую из других файлов.

// --- Состояние камеры (устаревшее, для совместимости на время перехода) ---
let _isRotating = false;
let _isPanning = false;
let _previousMouse = { x: 0, y: 0 };
let _panTarget = new THREE.Vector3(0, 0, 0);

// --- Состояние перетаскивания объектов (Drag & Drop) ---
let _isDraggingObject = false;  // Главный флаг: идет ли перетаскивание объекта
let _draggedCabinet = null;     // Какой именно объект мы тащим
let _groupDragObjects = [];     // Группа объектов для совместного перетаскивания
let _isCloningMode = false;     // Включен ли режим клонирования (Shift)
let _justDragged = false;       // Флаг, чтобы отличить drag от click

// --- Вспомогательные переменные для расчетов ---
let _potentialDrag = false;     // Флаг: mousedown был на шкафу, но еще неясно, клик это или drag
let _dragStartData = {          // Начальные данные в момент mousedown
    clientX: 0,
    clientY: 0,
    offsetAlongWall: 0,
    offsetX: 0,
    offsetZ: 0
};


// ==========================================================
// === СЕКЦИЯ 2: ФУНКЦИИ ДОСТУПА К СОСТОЯНИЮ (ГЕТТЕРЫ/СЕТТЕРЫ) ===
// ==========================================================
// Через эти функции мы будем безопасно читать и изменять состояние
// из нашего основного файла script.js

// --- Функции для состояния камеры (пока оставим) ---
export function setRotating(state, event) {
    _isRotating = state;
    if (event) {
        _previousMouse.x = event.clientX;
        _previousMouse.y = event.clientY;
    }
}
export function isRotating() { return _isRotating; }
export function getPreviousMouse() { return _previousMouse; }
export function setPreviousMouse(x, y) { _previousMouse.x = x; _previousMouse.y = y; }

export function setPanning(state, event) {
    _isPanning = state;
    if (event) {
        _previousMouse.x = event.clientX;
        _previousMouse.y = event.clientY;
    }
}
export function isPanning() { return _isPanning; }
export function getPanTarget() { return _panTarget; }


// --- Функции для состояния перетаскивания ---
export function setDraggingObject(state, cabinet = null) {
    _isDraggingObject = state;
    _draggedCabinet = cabinet;
    if (!state) { // При сбросе очищаем все связанные данные
        _groupDragObjects = [];
        _isCloningMode = false;
    }
}
export function isDraggingObject() { return _isDraggingObject; }
export function getDraggedCabinet() { return _draggedCabinet; }

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


// --- Вспомогательные функции состояния ---
export function setPotentialDrag(state) { _potentialDrag = state; }
export function isPotentialDrag() { return _potentialDrag; }

export function saveDragStartData(event, cabinet) {
    _dragStartData.clientX = event.clientX;
    _dragStartData.clientY = event.clientY;
    _dragStartData.offsetAlongWall = cabinet?.offsetAlongWall ?? 0;
    _dragStartData.offsetX = cabinet?.offsetX ?? 0;
    _dragStartData.offsetZ = cabinet?.offsetZ ?? 0;
}
export function getDragStartData() { return _dragStartData; }


// ==========================================================
// ===      СЕКЦИЯ 3: ГЛАВНАЯ ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ       ===
// ==========================================================

// Здесь будут храниться ссылки на объекты и функции из script.js
let dependencies = {
    renderer: null,
    activeCamera: null,
    scene: null,
    controls: null,
    cabinets: [],
    windows: [],
    countertops: [],
    selectedCabinets: [],
    // Ссылки на функции из script.js
    cloneCabinet: null, 
    checkCabinetIntersections: null,
    updateCabinetPosition: null,
    // ... и так далее
};

/**
 * Инициализирует менеджер ввода, получает все зависимости и вешает слушатели.
 * @param {object} deps - Объект с зависимостями.
 */
export function initInputManager(deps) {
    Object.assign(dependencies, deps);
    
    const canvas = dependencies.renderer.domElement;

    // --- ВСТАВЛЯЕМ НАШ НОВЫЙ СЛУШАТЕЛЬ ЗДЕСЬ ---
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp); 
    window.addEventListener('mousemove', onMouseMove);
    
    // В будущем здесь будут и другие слушатели
    // canvas.addEventListener('mousemove', onMouseMove);
    // ...
    
    console.log("Input Manager инициализирован.");
}

// ==========================================================
// ===               ОБРАБОТЧИКИ СОБЫТИЙ                  ===
// ==========================================================

function onMouseDown(event) {
    // Не распаковываем dependencies здесь!
    
    if (event.button !== 0) return; // Работаем только с левой кнопкой

    // --- 1. Проверяем, попали ли в шкаф ---
    const rect = dependencies.renderer.domElement.getBoundingClientRect();
    dependencies.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    dependencies.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    dependencies.raycaster.setFromCamera(dependencies.mouse, dependencies.activeCamera);

    const intersectableObjects = dependencies.cabinets.map(c => c.mesh).filter(m => m);
    const intersects = dependencies.raycaster.intersectObjects(intersectableObjects, true);

    let cabinetHitData = null;
    if (intersects.length > 0) {
        let searchTarget = intersects[0].object;
        while (searchTarget && searchTarget !== dependencies.scene) {
            cabinetHitData = dependencies.cabinets.find(c => c.mesh === searchTarget);
            if (cabinetHitData) break;
            searchTarget = searchTarget.parent;
        }
    }
    
    // --- 2. Если попали - запускаем твою логику с таймерами ---
    if (cabinetHitData) {
        dependencies.controls.enabled = false;   // Выключаем камеру
        _potentialDrag = true;
        
        // --- Твоя работающая логика с таймерами, но с dependencies ---
        let dragStarted = false;
        let dragTimeoutId = null;
        const initialClientX = event.clientX;
        const initialClientY = event.clientY;
        const dragThreshold = 5;

        const startDragIfNeeded = (currentEvent) => {
            if (dragStarted || dragTimeoutId === null) return;
            _potentialDrag = false; clearTimeout(dragTimeoutId); dragTimeoutId = null;
            dragStarted = true; document.removeEventListener('mouseup', cancelDragStartMouseUp);

            const wasSelectedBeforeDrag = dependencies.selectedCabinets.includes(cabinetHitData);
            let cabinetToDrag = cabinetHitData;

            
            if (currentEvent.shiftKey && cabinetHitData.type?.includes('Cabinet')) {
                const cloned = dependencies.cloneCabinet(cabinetHitData);
                if (cloned) {
                    cloned.mesh.uuid = THREE.MathUtils.generateUUID();
                    cloned.mesh.position.copy(cabinetHitData.mesh.position);
                    cloned.mesh.rotation.copy(cabinetHitData.mesh.rotation);
                    dependencies.scene.add(cloned.mesh);
                    dependencies.cabinets.push(cloned);
                    const cloneIndex = dependencies.cabinets.length - 1;
                    cabinetToDrag = cloned;
                    dependencies.removeHighlight(cabinetHitData.mesh);
                    dependencies.removeHighlight(cloned.mesh);
                    dependencies.selectedCabinets.length = 0;

                    if (cloned.isDetailed) {
                         dependencies.toggleCabinetDetail(cloneIndex);
                    }
                } else {
                    document.removeEventListener('mousemove', checkDragStartMove);
                    if (typeof cancelDragStartMouseUp === 'function') { document.removeEventListener('mouseup', cancelDragStartMouseUp); }
                    return;
                }
            }
            
            dependencies.startDraggingCabinet(cabinetToDrag, currentEvent, wasSelectedBeforeDrag);
            _isDraggingObject = true;
            _draggedCabinet = cabinetToDrag;

            //console.log(`%c[InputManager] Drag Started. Object:`, 'color: blue; font-weight: bold;', _draggedCabinet);
            dependencies.setContinuousRendering(true);
        };

        const checkDragStartMove = (moveEvent) => {
            if (dragStarted || dragTimeoutId === null) { document.removeEventListener('mousemove', checkDragStartMove); return; }
            const deltaX = moveEvent.clientX - initialClientX;
            const deltaY = moveEvent.clientY - initialClientY;
            if (Math.sqrt(deltaX * deltaX + deltaY * deltaY) > dragThreshold) {
                _potentialDrag = false; startDragIfNeeded(moveEvent);
                document.removeEventListener('mousemove', checkDragStartMove);
            }
        };

        const cancelDragStartMouseUp = (upEvent) => {
            if (!dragStarted) {
                clearTimeout(dragTimeoutId); dragTimeoutId = null;
                _potentialDrag = false;
                dependencies.controls.enabled = true; // Включаем камеру, если drag не начался
            }
            document.removeEventListener('mousemove', checkDragStartMove);
            document.removeEventListener('mouseup', cancelDragStartMouseUp);
        };

        dragTimeoutId = setTimeout(() => {
            if (!dragStarted) {
                 startDragIfNeeded(event);
                 document.removeEventListener('mousemove', checkDragStartMove);
            }
        }, 250);

        document.addEventListener('mousemove', checkDragStartMove);
        document.addEventListener('mouseup', cancelDragStartMouseUp);

        window.dragLastValidPosition.copy(cabinetHitData.mesh.position);
    }
    
    // Если не попали - ничего не делаем, OrbitControls работает.
}

// --- НОВАЯ, УМНАЯ ВЕРСИЯ onMouseUp ---
function onMouseUp(event) {
    const { controls, renderer, finishDragging, handleClick, setContinuousRendering, requestRender } = dependencies;

    // Проверяем, был ли установлен флаг в onMouseDown
    const wasDragging = _isDraggingObject; 

    // --- Сбрасываем все флаги в любом случае ---
    _isDraggingObject = false;
    _potentialDrag = false;
    
    // --- Включаем камеру и сбрасываем курсор ---
    controls.enabled = true;
    renderer.domElement.style.cursor = 'default';

    // --- Теперь решаем, что делать ---
    if (wasDragging) {
        // Если флаг был, значит, мы либо тащили, либо просто кликнули по шкафу.
        // Вызываем `finishDragging` - он разберется, что произошло.
        if (finishDragging) {
            finishDragging(event);
        }
    } else {
        // Если флага не было, значит, это был клик по стене или пустому месту.
        // Вызываем `handleClick` для обработки выделения стен и т.д.
        if (handleClick) {
            handleClick(event);
        }
    }
    
    if (setContinuousRendering) {
        setContinuousRendering(false);
    }
    if (requestRender) {
        requestRender();
    }
}

// --- НОВАЯ ФУНКЦИЯ-ОБРАБОТЧИК ДЛЯ MOUSEMOVE ---
function onMouseMove(event) {

    const { moveDraggedObject } = dependencies;

    // Выполняем код, только если мы находимся в состоянии перетаскивания объекта
    // Флаг `_isDraggingObject` устанавливается в onMouseDown.
    if (_isDraggingObject) {
        // Вызываем функцию из script.js, которая содержит всю сложную логику
        // перемещения объекта по сцене.
        if (moveDraggedObject) {
            moveDraggedObject(event);
        }
    }
    
    // Если мы не перетаскиваем объект, мы НИЧЕГО не делаем.
    // Это позволяет OrbitControls свободно вращать/панорамировать камеру.
}

function onContextMenu(event) {
    event.preventDefault(); // Предотвращаем стандартное меню браузера

    const { 
        selectedCabinets, showCabinetMenu, showWindowMenu, // и другие show...Menu
        raycaster, mouse, activeCamera, cabinets, windows, countertops, scene,
        applyHighlight, removeHighlight // Функции для управления подсветкой
    } = dependencies;

    // --- Логика 1: Определяем, на какой объект кликнули ---
    const rect = dependencies.renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, activeCamera);

    const intersectableObjects = [...cabinets.map(c => c.mesh), ...windows.map(w => w.mesh), ...countertops].filter(m => m);
    const intersects = raycaster.intersectObjects(intersectableObjects, true);

    let hitData = null;
    if (intersects.length > 0) {
        let searchTarget = intersects[0].object;
        while (searchTarget && searchTarget !== scene) {
            // Ищем совпадение во всех массивах
            hitData = cabinets.find(c => c.mesh === searchTarget) || 
                      windows.find(w => w.mesh === searchTarget) ||
                      countertops.find(c => c === searchTarget);
            if (hitData) break;
            searchTarget = searchTarget.parent;
        }
    }

    // --- Логика 2: Выделение и вызов меню ---
    if (hitData) {
        // Если кликнули на объект, который НЕ был выделен,
        // сначала снимаем все старые выделения и выделяем только его.
        const isAlreadySelected = selectedCabinets.some(sel => (sel.mesh || sel) === (hitData.mesh || hitData));
        if (!isAlreadySelected) {
            // Снимаем подсветку со всех ранее выделенных
            selectedCabinets.forEach(sel => removeHighlight(sel.mesh || sel));
            // Устанавливаем новое выделение
            selectedCabinets.length = 0;
            selectedCabinets.push(hitData);
            applyHighlight(hitData.mesh || hitData);
        }

        // Теперь, когда объект точно выделен, вызываем для него соответствующее меню
        if (hitData.type?.includes("Cabinet")) {
            showCabinetMenu(event.clientX, event.clientY, hitData);
        } else if (hitData.type === "window") {
            // showWindowMenu(event.clientX, event.clientY, hitData);
        }
        // ... и т.д. для других типов меню
    }
    // Если кликнули не по объекту, ничего не делаем.
}