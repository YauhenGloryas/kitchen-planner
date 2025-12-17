// File: CabinetFactory.js

import * as THREE from 'three';
import * as MaterialManager from './MaterialManager.js';
import { createMilledFacade } from './FacadeBuilder.js';

// Временно копируем фабрики сюда. Позже мы удалим их из main.js
// и будем использовать только эти. Убедитесь, что вы скопировали
// ИМЕННО ВАШИ версии этих функций из main.js, если они отличаются.

/**
 * Создает меш панели с ребрами и пользовательскими данными.
 * @param {number} w - Ширина панели.
 * @param {number} h - Высота панели.
 * @param {number} d - Глубина панели.
 * @param {THREE.Material} mat - Материал.
 * @param {string} orientationType - Тип ориентации.
 * @param {string} name - Имя панели.
 * @param {object} [options={}] - Дополнительные опции.
 * @param {number} [options.bevelSize=0] - Размер фаски в метрах.
 * @param {number} [options.bevelSegments=2] - Количество сегментов фаски.
 * @returns {THREE.Mesh | null}
 */
export function createPanel(w, h, d, mat, orientationType, name = "panel", options = {}) {
    try {
        if (w <= 0 || h <= 0 || d <= 0) { /* ... (проверка) ... */ return null; }

        const { bevelSize = 0, bevelSegments = 2 } = options;
        
        // --- ИЗМЕНЕНИЕ: Создаем геометрию с фаской, если она задана ---
        const geometry = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
        
        if (bevelSize > 0) {
            // Чтобы добавить фаску, мы используем модификатор.
            // Это сложнее, чем просто опция в BoxGeometry, но работает надежнее
            // Для простоты, пока будем использовать стандартную опцию, но с оговорками.
            // ПРАВИЛЬНЫЙ путь - через BufferGeometryUtils.applyBevel, но он сложнее.
            // Давайте для начала упростим и модифицируем BoxGeometry напрямую, если понадобится.
            // Пока что BoxGeometry не имеет встроенной опции фаски. Будем имитировать.
            // Для стекла нам нужна простая геометрия без ребер.
        }

        let mesh;
        if (name.includes('glass')) {
            // Для стекла создаем меш без кастомных ребер
            mesh = new THREE.Mesh(geometry, mat.clone());
        } else {
            // Для обычных панелей - с ребрами
            mesh = new THREE.Mesh(geometry, mat.clone());
            const edgesGeom = new THREE.EdgesGeometry(geometry);
            const edgesMat = new THREE.LineBasicMaterial({ color: 0x333333, linewidth: 1 });
            const edges = new THREE.LineSegments(edgesGeom, edgesMat);
            edges.name = `${name}_edges`;
            edges.raycast = () => {};
            mesh.add(edges);
        }

        mesh.userData = {
             isCabinetPart: true,
             objectType: 'cabinetPart',
             orientationType: orientationType,
             cabinetUUID: null
        };
        mesh.name = name;
        return mesh;
    } catch (error) {
        console.error(`Ошибка при создании панели "${name}":`, error);
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

/**
 * Создает меш ВЕРХНЕГО Гола-профиля заданной длины.
 * @param {number} lengthMeters - Длина профиля в метрах.
 * @param {THREE.Material} material - Материал для профиля.
 * @param {string} [cabinetUUID=""] - UUID родительского шкафа.
 * @returns {THREE.Mesh | null}
 */
function createUpperGolaProfileMesh(lengthMeters, material, cabinetUUID) {
    if (lengthMeters <= 0) return null;

    // 1. Shape сечения профиля (простой квадрат 20x20 мм для начала)
    const golaShape = new THREE.Shape();
    golaShape.moveTo(0, 0);
    golaShape.lineTo(1, 0);
    golaShape.lineTo(2, 18);
    golaShape.lineTo(13, 18);
    golaShape.lineTo(13, 16);
    golaShape.lineTo(18, 14);
    golaShape.lineTo(20, 16);
    golaShape.lineTo(20, 18);
    golaShape.lineTo(18, 20);
    golaShape.lineTo(0, 20);
    golaShape.closePath();

    // 2. Настройки экструзии
    const extrudeSettings = {
        steps: 1,
        depth: lengthMeters * 1000, // Длина в мм
        bevelEnabled: false
    };

    let golaGeometry = null;
    try {
        golaGeometry = new THREE.ExtrudeGeometry(golaShape, extrudeSettings);
        
        // 3. Трансформации: центрируем по длине и масштабируем
        golaGeometry.translate(0, 0, -lengthMeters * 1000 / 2);
        golaGeometry.scale(1 / 1000, 1 / 1000, 1 / 1000);
        
    } catch (error) {
        console.error(`[createUpperGolaProfileMesh] Ошибка создания геометрии:`, error);
        return null;
    }

    // 4. Создание меша
    const golaMesh = new THREE.Mesh(golaGeometry, material);
    golaMesh.name = `upperGolaProfile`;
    golaMesh.userData = {
        isCabinetPart: true,
        objectType: 'golaProfile',
        cabinetUUID: cabinetUUID
    };

    return golaMesh;
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

/**
 * Создает геометрию одной рамки с "дыркой" и выдавливает ее.
 * Вспомогательная функция для createZ4FrameFacade.
 * @param {number} width - Внешняя ширина.
 * @param {number} height - Внешняя высота.
 * @param {number} plankWidth - Ширина планок рамки.
 * @param {number} depth - Глубина выдавливания.
 * @returns {THREE.BufferGeometry | null}
 */
function createSingleFrameGeometry(width, height, plankWidth, depth) {
    if (width <= plankWidth * 2 || height <= plankWidth * 2) {
        console.warn("Невозможно создать рамку: ширина планок больше габаритов.");
        return null;
    }
    // Внешний контур
    const mainShape = new THREE.Shape();
    mainShape.moveTo(0, 0);
    mainShape.lineTo(width, 0);
    mainShape.lineTo(width, height);
    mainShape.lineTo(0, height);
    
    // Дырка
    const holePath = new THREE.Path();
    holePath.moveTo(plankWidth, plankWidth);
    holePath.lineTo(width - plankWidth, plankWidth);
    holePath.lineTo(width - plankWidth, height - plankWidth);
    holePath.lineTo(plankWidth, height - plankWidth);
    mainShape.holes.push(holePath);
    
    const extrudeSettings = { depth: depth, bevelEnabled: false };
    return new THREE.ExtrudeGeometry(mainShape, extrudeSettings);
}


/**
 * Собирает сложный фасад типа Z4 ("слоеный пирог") из нескольких частей.
 * @param {number} width - Габаритная ширина фасада в метрах.
 * @param {number} height - Габаритная высота фасада в метрах.
 * @param {THREE.Material} frameMaterial - Материал для рамки.
 * @returns {THREE.Group | null}
 */
function createZ9FrameFacade(width, height, frameMaterial) {
    try {
        const group = new THREE.Group();

        // --- 1. Параметры всех частей (в метрах) ---
        const part1_plankW = 6 / 1000;
        const part1_depth = 1 / 1000;

        const part2_plankW = 2 / 1000;
        const part2_depth = 5 / 1000;

        const part3_plankW = 45 / 1000;
        const part3_depth = 13 / 1000;

        const glass_thickness = 4 / 1000;
        
        // --- 2. Создание геометрий ---
        const geomPart1 = createSingleFrameGeometry(width, height, part1_plankW, part1_depth);
        const geomPart2 = createSingleFrameGeometry(width, height, part2_plankW, part2_depth);
        const geomPart3 = createSingleFrameGeometry(width, height, part3_plankW, part3_depth);
        
        const glassWidth = width - part2_plankW * 2;
        const glassHeight = height - part2_plankW * 2;
        const geomGlass = new THREE.BoxGeometry(glassWidth, glassHeight, glass_thickness);
        
        if (!geomPart1 || !geomPart2 || !geomPart3) { /* ... (проверка) ... */ return null; }

        // --- 3. Создание материалов (без изменений) ---
        const glassMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xcccccc,      // Легкий сероватый оттенок для тонировки
            metalness: 0.2,       // Добавляет блики на краях
            roughness: 0.0,      // Уменьшаем "мутность", делаем стекло более глянцевым
            transmission: 0.95,   // 95% света проходит насквозь
            transparent: true,    // Включаем прозрачность (на всякий случай)
            ior: 1.5,             // Коэффициент преломления (как у стекла)
            thickness: glass_thickness, // Толщина для расчета преломления
            name: "GlassMaterial_Tinted"
        });

        // --- 4. Создание мешей (без изменений) ---
        const meshPart1 = new THREE.Mesh(geomPart1, frameMaterial);
        const meshPart2 = new THREE.Mesh(geomPart2, frameMaterial);
        const meshPart3 = new THREE.Mesh(geomPart3, frameMaterial);
        const meshGlass = new THREE.Mesh(geomGlass, glassMaterial);

        // --- 5. ИСПРАВЛЕННОЕ Позиционирование ---
        
        // --- ИСПРАВЛЕНИЕ №1: Правильный порядок сборки (от стены к нам) ---
        // Задняя часть (самая толстая) начинается с z = 0
        meshPart3.position.z = 0;
        // Паз ставится перед ней
        meshPart2.position.z = part3_depth;
        // Лицевая рамка - самая последняя
        meshPart1.position.z = part3_depth + part2_depth;
        
        // --- ИСПРАВЛЕНИЕ №2: Центрирование всех частей относительно друг друга ---
        // Сдвигаем все экструдированные рамки, чтобы их центр совпал с (0,0)
        meshPart1.position.x = -width / 2;
        meshPart1.position.y = -height / 2;
        meshPart2.position.x = -width / 2;
        meshPart2.position.y = -height / 2;
        meshPart3.position.x = -width / 2;
        meshPart3.position.y = -height / 2;
        
        // Стекло (BoxGeometry) уже отцентрировано, его двигать по X и Y не нужно.
        // Ставим его в "паз" по оси Z
        meshGlass.position.z = part3_depth + (part2_depth - glass_thickness) / 2;

        // Добавляем все в группу
        group.add(meshPart1, meshPart2, meshPart3, meshGlass);
        
        // --- 6. Центрируем ВСЮ ГРУППУ целиком ---
        // Общая глубина не изменилась
        const totalDepth = part1_depth + part2_depth + part3_depth;
        // Теперь мы не сдвигаем группу по X и Y, так как мы уже отцентрировали все части внутри нее.
        // Сдвигаем только по Z, чтобы центр группы был в ее середине.
        group.position.z = -totalDepth / 2;

        return { frameObject: group, totalDepth: totalDepth };

    } catch(e) {
        console.error("Ошибка внутри createZ4FrameFacade:", e);
        return null;
    }
}

/**
 * Собирает сложный фасад типа Z1 из нескольких частей.
 * @param {number} width - Габаритная ширина фасада в метрах.
 * @param {number} height - Габаритная высота фасада в метрах.
 * @param {THREE.Material} frameMaterial - Материал для рамки.
 * @returns {{frameObject: THREE.Group, totalDepth: number} | null}
 */
function createZ1FrameFacade(width, height, frameMaterial) {
    try {
        const group = new THREE.Group();

        // --- 1. Параметры профиля Z1 ---
        const part1_plankW = 19 / 1000;
        const part1_depth = 2 / 1000;

        const part2_plankW = 12 / 1000;
        const part2_depth = 5 / 1000;

        const part3_plankW = 19 / 1000;
        const part3_depth = 13 / 1000;

        const glass_thickness = 4 / 1000;
        
        // --- 2. Создание геометрий ---
        const geomPart1 = createSingleFrameGeometry(width, height, part1_plankW, part1_depth);
        const geomPart2 = createSingleFrameGeometry(width, height, part2_plankW, part2_depth);
        const geomPart3 = createSingleFrameGeometry(width, height, part3_plankW, part3_depth);
        
        // Стекло вставляется в деталь 2
        const glassWidth = width - part2_plankW * 2;
        const glassHeight = height - part2_plankW * 2;
        const geomGlass = new THREE.BoxGeometry(glassWidth, glassHeight, glass_thickness);
        
        if (!geomPart1 || !geomPart2 || !geomPart3) return null;

        // --- 3. Создание материалов (без изменений) ---
        const glassMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xcccccc,      // Легкий сероватый оттенок для тонировки
            metalness: 0.2,       // Добавляет блики на краях
            roughness: 0.05,      // Уменьшаем "мутность", делаем стекло более глянцевым
            transmission: 0.75,   // 95% света проходит насквозь
            transparent: true,    // Включаем прозрачность (на всякий случай)
            ior: 1.5,             // Коэффициент преломления (как у стекла)
            thickness: glass_thickness, // Толщина для расчета преломления
            name: "GlassMaterial_Tinted"
        });

        // --- 4. Создание мешей ---
        const meshPart1 = new THREE.Mesh(geomPart1, frameMaterial);
        const meshPart2 = new THREE.Mesh(geomPart2, frameMaterial);
        const meshPart3 = new THREE.Mesh(geomPart3, frameMaterial);
        const meshGlass = new THREE.Mesh(geomGlass, glassMaterial);

        // --- 5. Позиционирование ---
        // Собираем от стены (Z=0) к нам
        meshPart3.position.z = 0; // Задняя часть
        meshPart2.position.z = part3_depth; // Паз
        meshPart1.position.z = part3_depth + part2_depth; // Лицевая часть

        // Центрируем рамки по X и Y
        [meshPart1, meshPart2, meshPart3].forEach(mesh => {
            mesh.position.x = -width / 2;
            mesh.position.y = -height / 2;
        });
        
        // Стекло по центру "паза" (деталь 2)
        meshGlass.position.z = part3_depth + (part2_depth / 2);
        
        group.add(meshPart1, meshPart2, meshPart3, meshGlass);
        
        // --- 6. Центрируем всю группу ---
        const totalDepth = part1_depth + part2_depth + part3_depth;
        group.position.z = -totalDepth / 2;

        return { frameObject: group, totalDepth: totalDepth };

    } catch(e) { /* ... */ return null; }
}

/**
 * Собирает сложный фасад типа Z12 из нескольких частей.
 * ...
 */
function createZ12FrameFacade(width, height, frameMaterial) {
    try {
        const group = new THREE.Group();

        // --- 1. Параметры профиля Z12 ---
        const part1_plankW = 1 / 1000;
        const part1_depth = 4 / 1000;

        const part2_plankW = 45 / 1000;
        const part2_depth = 16 / 1000;

        const glass_thickness = 4 / 1000;
        
        // --- 2. Создание геометрий ---
        const geomPart1 = createSingleFrameGeometry(width, height, part1_plankW, part1_depth);
        const geomPart2 = createSingleFrameGeometry(width, height, part2_plankW, part2_depth);
        
        // Стекло вставляется в деталь 1
        const glassWidth = width - part1_plankW * 2;
        const glassHeight = height - part1_plankW * 2;
        const geomGlass = new THREE.BoxGeometry(glassWidth, glassHeight, glass_thickness);
        
        if (!geomPart1 || !geomPart2) return null;

        // --- 3. Создание материалов (без изменений) ---
        const glassMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xcccccc,      // Легкий сероватый оттенок для тонировки
            metalness: 0.2,       // Добавляет блики на краях
            roughness: 0.05,      // Уменьшаем "мутность", делаем стекло более глянцевым
            transmission: 0.95,   // 95% света проходит насквозь
            transparent: true,    // Включаем прозрачность (на всякий случай)
            ior: 1.5,             // Коэффициент преломления (как у стекла)
            thickness: glass_thickness, // Толщина для расчета преломления
            name: "GlassMaterial_Tinted"
        });

        // --- 4. Создание мешей ---
        const meshPart1 = new THREE.Mesh(geomPart1, frameMaterial);
        const meshPart2 = new THREE.Mesh(geomPart2, frameMaterial);
        const meshGlass = new THREE.Mesh(geomGlass, glassMaterial);

        // --- 5. Позиционирование ---
        meshPart2.position.z = 0; // Задняя часть
        meshPart1.position.z = part2_depth; // Паз/лицевая часть

        [meshPart1, meshPart2].forEach(mesh => {
            mesh.position.x = -width / 2;
            mesh.position.y = -height / 2;
        });
        
        // Стекло по центру "паза" (деталь 1)
        meshGlass.position.z = part2_depth + (part1_depth / 2);
        
        group.add(meshPart1, meshPart2, meshGlass);
        
        // --- 6. Центрируем всю группу ---
        const totalDepth = part1_depth + part2_depth;
        group.position.z = -totalDepth / 2;

        return { frameObject: group, totalDepth: totalDepth };

    } catch(e) { /* ... */ return null; }
}


/**
 * Главная функция для создания детализированного верхнего распашного шкафа.
 * @param {object} cabinetData - Объект данных шкафа.
 * @param {object} kitchenGlobalParams - Глобальные параметры кухни.
 * @param {object} MaterialManager - Менеджер материалов.
 * @param {function} getPanelThickness - Функция для получения толщины панели.
 * @returns {THREE.Group | null}
 */
export function createDetailedUpperSwingGeometry(cabinetData, kitchenGlobalParams, MaterialManager, getPanelThickness) {
    if (!cabinetData) {
        console.error("createDetailedUpperSwingGeometry: cabinetData не предоставлен.");
        return null;
    }

    const group = new THREE.Group();
    group.userData.isDetailedCabinet = true;
    group.userData.objectType = 'cabinet';

    // --- Параметры ---
    const { width, height, depth } = cabinetData;
    const cabinetUUID = cabinetData.mesh?.uuid; // Безопасно получаем UUID

    // Получаем толщину материала (ЛДСП). Предположим, она глобальная.
    // Если она зависит от материала, логику нужно будет уточнить.
    //const panelThickness = 16 / 1000; // 16 мм, как стандарт. Замените на вашу переменную, если есть.
    
    // --- Материалы ---
    const bodyMaterial = MaterialManager.getBodyMaterial(cabinetData);
    const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
    const { material: facadeMaterial, thickness: facadeThickness } = MaterialManager.getMaterial(facadeSet);

    console.log(`--- Начало детализации swingUpper: ${width*1000}x${height*1000}x${depth*1000} ---`);

    // ==================================================================
    // 1. Боковины (Левая и Правая)
    // ==================================================================

    // 1.1. Расчет размеров и параметров
    const bottomConstruction = cabinetData.bottomConstruction || 'inset';
    const panelThickness = getPanelThickness(); // Используем переданную функцию

    // --- Общие параметры для обеих боковин ---
    let sidePanelHeight;
    let sidePanelCenterY;

    if (bottomConstruction.includes('overlay')) {
        sidePanelHeight = height - panelThickness;
        sidePanelCenterY = (height / 2) - (sidePanelHeight / 2);
    } else { // 'inset' и по умолчанию
        sidePanelHeight = height;
        sidePanelCenterY = 0;
    }
    const sidePanelThicknessAsWidth = panelThickness;

    // --- Уникальные параметры для ЛЕВОЙ боковины ---
    const leftSideOverhangRearMm = cabinetData.leftSideOverhangRear ?? 0;
    const leftSideOverhangRearM = leftSideOverhangRearMm / 1000;
    const leftSideDepth = depth + leftSideOverhangRearM; // Новая глубина
    // Сдвигаем центр по Z назад на половину выступа, чтобы передняя грань осталась на месте
    const leftSideCenterZ = -leftSideOverhangRearM / 2; 

    // --- Уникальные параметры для ПРАВОЙ боковины ---
    const rightSideOverhangRearMm = cabinetData.rightSideOverhangRear ?? 0;
    const rightSideOverhangRearM = rightSideOverhangRearMm / 1000;
    const rightSideDepth = depth + rightSideOverhangRearM; // Новая глубина
    // Сдвигаем центр по Z назад на половину выступа
    const rightSideCenterZ = -rightSideOverhangRearM / 2;

    // 1.2. Создание деталей
    const leftSide = createPanel(sidePanelThicknessAsWidth, sidePanelHeight, leftSideDepth, bodyMaterial, 'vertical', 'leftSide');
    const rightSide = createPanel(sidePanelThicknessAsWidth, sidePanelHeight, rightSideDepth, bodyMaterial, 'vertical', 'rightSide');

    // 1.3. Позиционирование деталей
    if (leftSide) {
        const leftSideCenterX = -width / 2 + panelThickness / 2;
        leftSide.position.set(leftSideCenterX, sidePanelCenterY, leftSideCenterZ); // Используем новую Z-координату
        leftSide.userData.cabinetUUID = cabinetUUID;

        MaterialManager.applyTexture(leftSide, cabinetData.textureDirection, 'vertical');
        group.add(leftSide);
    }

    if (rightSide) {
        const rightSideCenterX = width / 2 - panelThickness / 2;
        rightSide.position.set(rightSideCenterX, sidePanelCenterY, rightSideCenterZ); // Используем новую Z-координату
        rightSide.userData.cabinetUUID = cabinetUUID;

        MaterialManager.applyTexture(rightSide, cabinetData.textureDirection, 'vertical');
        group.add(rightSide);
    }

    console.log(` - Боковины созданы (Конструкция дна: ${bottomConstruction}, Выступ Л/П: ${leftSideOverhangRearMm}мм / ${rightSideOverhangRearMm}мм)`);
    
    // ==================================================================
    // 2. Дно
    // ==================================================================

    // 2.1. Расчет параметров для дна
    const bottomType = cabinetData.bottomType || 'solid';
    //const bottomConstruction = cabinetData.bottomConstruction || 'inset';
    const spacers = cabinetData.spacers || 'none';
    const bottomFrontOffsetMm = cabinetData.bottomFrontOffset ?? 0;
    const bottomOverhangRearMm = cabinetData.bottomOverhangRear ?? 0;
    // --- НОВЫЙ ПАРАМЕТР ---
    const backPanelOffsetMm = cabinetData.backPanelOffset ?? 0;

    const bottomFrontOffsetM = bottomFrontOffsetMm / 1000;
    const bottomOverhangRearM = bottomOverhangRearMm / 1000;
    const backPanelOffsetM = backPanelOffsetMm / 1000;

    let bottomPanelWidth;
    let bottomPanelCenterX = 0;
    const bottomPanelThickness = panelThickness;
    const bottomPanelCenterY = -height / 2 + bottomPanelThickness / 2;
    let finalConsoleLog = ""; // Переменная для лога

    if (bottomConstruction.includes('inset')) {
        // --- Логика для ВКЛАДНОГО дна ---
        bottomPanelWidth = width - 2 * panelThickness;
        // bottomPanelCenterX остается 0

        if (bottomType === 'solid') {
            // --- Вкладное сплошное дно ---
            // Глубина уменьшается на углубление ЗС
            const bottomPanelDepth = depth - bottomFrontOffsetM + bottomOverhangRearM - backPanelOffsetM;
            const bottomPanel = createPanel(bottomPanelWidth, bottomPanelThickness, bottomPanelDepth, bodyMaterial, 'horizontal', 'bottomPanel_solid_inset');
            if (bottomPanel) {
                // Позиционирование по передней грани остается прежним
                const requiredFrontFaceZ = depth / 2 - bottomFrontOffsetM;
                const currentFrontFaceZ = bottomPanelDepth / 2;
                const bottomPanelCenterZ = requiredFrontFaceZ - currentFrontFaceZ;
                bottomPanel.position.set(0, bottomPanelCenterY, bottomPanelCenterZ);
                bottomPanel.userData.cabinetUUID = cabinetUUID;

                MaterialManager.applyTexture(bottomPanel, cabinetData.textureDirection, 'horizontal');

                group.add(bottomPanel);
                finalConsoleLog = ` - Дно (solid, inset) создано (Г: ${Math.round(bottomPanelDepth*1000)}мм)`;
            }
        } else if (bottomType === 'slats') {
            // --- Вкладное дно "планки" ---
            const frontSlatDepth = 90 / 1000;
            const frontSlat = createPanel(bottomPanelWidth, bottomPanelThickness, frontSlatDepth, bodyMaterial, 'horizontal', 'bottomPanel_frontSlat_inset');
            if (frontSlat) {
                // Позиционирование передней планки не меняется
                const requiredFrontFaceZ = depth / 2 - bottomFrontOffsetM;
                const currentFrontFaceZ = frontSlatDepth / 2;
                const frontSlatCenterZ = requiredFrontFaceZ - currentFrontFaceZ;
                frontSlat.position.set(0, bottomPanelCenterY, frontSlatCenterZ);
                frontSlat.userData.cabinetUUID = cabinetUUID;
                MaterialManager.applyTexture(frontSlat, cabinetData.textureDirection, 'horizontal');
                group.add(frontSlat);
            }

            const rearSlatDepth = (90 / 1000) + bottomOverhangRearM;
            const rearSlat = createPanel(bottomPanelWidth, bottomPanelThickness, rearSlatDepth, bodyMaterial, 'horizontal', 'bottomPanel_rearSlat_inset');
            if (rearSlat) {
                // Позиционирование задней планки смещается ВПЕРЕД на углубление ЗС
                const requiredRearFaceZ = -depth / 2 - bottomOverhangRearM + backPanelOffsetM; // <-- ИЗМЕНЕНИЕ
                const currentRearFaceZ = -rearSlatDepth / 2;
                const rearSlatCenterZ = requiredRearFaceZ - currentRearFaceZ;
                rearSlat.position.set(0, bottomPanelCenterY, rearSlatCenterZ);
                rearSlat.userData.cabinetUUID = cabinetUUID;
                MaterialManager.applyTexture(rearSlat, cabinetData.textureDirection, 'horizontal');
                group.add(rearSlat);
            }
            finalConsoleLog = ` - Дно (slats, inset) создано.`;
        }

    } else { // --- Логика для НАКЛАДНОГО дна ('overlay') ---
        bottomPanelWidth = width; // Базовая ширина
        // ... (весь блок со спейсерами остается БЕЗ ИЗМЕНЕНИЙ) ...
        if (spacers !== 'none') {
            if (spacers.includes('narrow')) {
                const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
                const { thickness: facadeThicknessM } = MaterialManager.getMaterial(facadeSet);
                bottomPanelWidth += facadeThicknessM;
            } else if (spacers.includes('wide')) {
                const spacerWidthMm = cabinetData.spacerWidth || 60;
                const spacerWidthM = spacerWidthMm / 1000;
                bottomPanelWidth += spacerWidthM;
            }
            const deltaWidth = bottomPanelWidth - width;
            if (spacers.includes('left')) {
                const requiredRightFaceX = width / 2;
                const currentRightFaceX = bottomPanelWidth / 2;
                bottomPanelCenterX = requiredRightFaceX - currentRightFaceX;
            } else if (spacers.includes('right')) {
                const requiredLeftFaceX = -width / 2;
                const currentLeftFaceX = -bottomPanelWidth / 2;
                bottomPanelCenterX = requiredLeftFaceX - currentLeftFaceX;
            }
        }
        // ... (конец блока со спейсерами) ...

        // Создание и позиционирование для накладного дна (углубление ЗС не влияет)
        if (bottomType === 'solid') {
            const bottomPanelDepth = depth - bottomFrontOffsetM + bottomOverhangRearM;
            const bottomPanel = createPanel(bottomPanelWidth, bottomPanelThickness, bottomPanelDepth, bodyMaterial, 'horizontal', 'bottomPanel_solid_overlay');
            if (bottomPanel) {
                const requiredFrontFaceZ = depth / 2 - bottomFrontOffsetM;
                const currentFrontFaceZ = bottomPanelDepth / 2;
                const bottomPanelCenterZ = requiredFrontFaceZ - currentFrontFaceZ;
                bottomPanel.position.set(bottomPanelCenterX, bottomPanelCenterY, bottomPanelCenterZ);
                bottomPanel.userData.cabinetUUID = cabinetUUID;

                MaterialManager.applyTexture(bottomPanel, cabinetData.textureDirection, 'horizontal');

                group.add(bottomPanel);
            }
        } else if (bottomType === 'slats') {
            const frontSlatDepth = 90 / 1000;
            const frontSlat = createPanel(bottomPanelWidth, bottomPanelThickness, frontSlatDepth, bodyMaterial, 'horizontal', 'bottomPanel_frontSlat_overlay');
            if (frontSlat) {
                const requiredFrontFaceZ = depth / 2 - bottomFrontOffsetM;
                const currentFrontFaceZ = frontSlatDepth / 2;
                const frontSlatCenterZ = requiredFrontFaceZ - currentFrontFaceZ;
                frontSlat.position.set(bottomPanelCenterX, bottomPanelCenterY, frontSlatCenterZ);
                frontSlat.userData.cabinetUUID = cabinetUUID;

                MaterialManager.applyTexture(frontSlat, cabinetData.textureDirection, 'horizontal');

                group.add(frontSlat);
            }
            const rearSlatDepth = (90 / 1000) + bottomOverhangRearM;
            const rearSlat = createPanel(bottomPanelWidth, bottomPanelThickness, rearSlatDepth, bodyMaterial, 'horizontal', 'bottomPanel_rearSlat_overlay');
            if (rearSlat) {
                const requiredRearFaceZ = -depth / 2 - bottomOverhangRearM;
                const currentRearFaceZ = -rearSlatDepth / 2;
                const rearSlatCenterZ = requiredRearFaceZ - currentRearFaceZ;
                rearSlat.position.set(bottomPanelCenterX, bottomPanelCenterY, rearSlatCenterZ);
                rearSlat.userData.cabinetUUID = cabinetUUID;

                MaterialManager.applyTexture(rearSlat, cabinetData.textureDirection, 'horizontal');

                group.add(rearSlat);
            }
        }
        finalConsoleLog = ` - Дно (overlay) создано (X-центр: ${bottomPanelCenterX.toFixed(3)})`;
    }

    console.log(finalConsoleLog);

    // ==================================================================
    // 3. Крыша
    // ==================================================================

    // 3.1. Расчет размеров и параметров
    // Крыша всегда вкладная, поэтому ширина = общая ширина - 2 толщины.
    const topPanelWidth = width - 2 * panelThickness;
    const topPanelThickness = panelThickness;

    // Глубина крыши = общая глубина - углубление для задней стенки.
    const topPanelDepth = depth - backPanelOffsetM;

    // 3.2. Создание детали
    const topPanel = createPanel(topPanelWidth, topPanelThickness, topPanelDepth, bodyMaterial, 'horizontal', 'topPanel');

    // 3.3. Позиционирование детали
    if (topPanel) {
        const topPanelCenterX = 0;

        // Верхняя грань крыши (+h/2) должна быть равна верхней грани шкафа (+height/2)
        // => center.y + h/2 = height/2
        // => center.y = height/2 - h/2
        const topPanelCenterY = height / 2 - topPanelThickness / 2;
        
        // Позиционируем крышу так, чтобы ее передняя грань совпадала с передней гранью шкафа.
        // Логика та же, что и у дна с отступом = 0.
        const requiredFrontFaceZ = depth / 2; // Отступа нет
        const currentFrontFaceZ = topPanelDepth / 2;
        const topPanelCenterZ = requiredFrontFaceZ - currentFrontFaceZ;
        
        topPanel.position.set(topPanelCenterX, topPanelCenterY, topPanelCenterZ);
        topPanel.userData.cabinetUUID = cabinetUUID;
        MaterialManager.applyTexture(topPanel, cabinetData.textureDirection, 'horizontal');
        group.add(topPanel);

        console.log(` - Крыша создана (Г: ${Math.round(topPanelDepth*1000)}мм)`);
    }

    // ==================================================================
    // 4. Задняя стенка (ДВП/ХДФ)
    // ==================================================================
    const hasBackPanel = cabinetData.backPanel || 'yes';

    if (hasBackPanel === 'yes') {
        // 4.1. Расчет размеров и параметров
        const backPanelThickness = 3 / 1000;
        const backPanelMaterial = new THREE.MeshStandardMaterial({
            color: 0xf0f0f0, // Светло-серый
            roughness: 0.9,
            metalness: 0.0,
            name: "BackPanelMaterial"
        });

        // --- Расчет ширины и отступов по X ---
        const leftSideOverhangM = (cabinetData.leftSideOverhangRear ?? 0) / 1000;
        const rightSideOverhangM = (cabinetData.rightSideOverhangRear ?? 0) / 1000;

        const backPanelOffsetX_Left = (leftSideOverhangM > 0) ? (10 / 1000) : (2 / 1000);
        const backPanelOffsetX_Right = (rightSideOverhangM > 0) ? (10 / 1000) : (2 / 1000);
        
        const backPanelWidth = width - backPanelOffsetX_Left - backPanelOffsetX_Right;

        // --- Расчет высоты и отступов по Y ---
        const bottomOverhangRearM = (cabinetData.bottomOverhangRear ?? 0) / 1000;
        const isOverlayBottom = (cabinetData.bottomConstruction || 'inset').includes('overlay');

        const backPanelOffsetY_Top = 2 / 1000;
        let backPanelOffsetY_Bottom;

        if (bottomOverhangRearM > 0) {
            backPanelOffsetY_Bottom = 10 / 1000;
        } else if (isOverlayBottom && backPanelOffsetM > 0) {
            backPanelOffsetY_Bottom = 10 / 1000;
        } else {
            backPanelOffsetY_Bottom = 2 / 1000;
        }
        
        const backPanelHeight = height - backPanelOffsetY_Top - backPanelOffsetY_Bottom;

        // 4.2. Создание детали
        const backPanel = createPanel(backPanelWidth, backPanelHeight, backPanelThickness, backPanelMaterial, 'frontal', 'backPanel');

        // 4.3. Позиционирование детали
        if (backPanel) {
            // По X: левая грань ЗС = левая грань шкафа + отступ слева
            const requiredLeftFaceX = -width / 2 + backPanelOffsetX_Left;
            const currentLeftFaceX = -backPanelWidth / 2;
            const backPanelCenterX = requiredLeftFaceX - currentLeftFaceX;

            // По Y: верхняя грань ЗС = верхняя грань шкафа - отступ сверху
            const requiredTopFaceY = height / 2 - backPanelOffsetY_Top;
            const currentTopFaceY = backPanelHeight / 2;
            const backPanelCenterY = requiredTopFaceY - currentTopFaceY;
            
            // По Z: передняя грань ЗС = задняя грань шкафа + углубление ЗС
            // (задняя грань шкафа = -depth/2, углубление смещает ВПЕРЕД)
            const requiredFrontFaceZ = -depth / 2 + backPanelOffsetM;
            const currentFrontFaceZ = backPanelThickness / 2;
            const backPanelCenterZ = requiredFrontFaceZ - currentFrontFaceZ;
            
            backPanel.position.set(backPanelCenterX, backPanelCenterY, backPanelCenterZ);
            backPanel.userData.cabinetUUID = cabinetUUID;
            group.add(backPanel);
            
            console.log(` - Задняя стенка создана (Ш: ${Math.round(backPanelWidth*1000)}, В: ${Math.round(backPanelHeight*1000)})`);
        }
    }

    // ==================================================================
    // 5. Shelves
    // ==================================================================
    const shelfCount = parseInt(cabinetData.shelfCount) || 0;
    const shelfLayout = cabinetData.shelfLayout || 'even';

    if (shelfCount > 0) {
        // 5.1. Calculate shelf dimensions
        const shelfType = cabinetData.shelfType || 'confirmat'; // Get shelf type
        const shelfThickness = panelThickness; // Shelf height is panel thickness

        let shelfWidth;
        if (shelfType === 'confirmat') {
            shelfWidth = width - 2 * panelThickness;
        } else { // shelfHolder, secura7, etc.
            shelfWidth = width - 2 * panelThickness - (2 / 1000); // Add 2mm gap
        }

        // Shelves need to account for the back panel inset
        const shelfDepth = depth - backPanelOffsetM - 0.002;
        
        // Check for valid shelf dimensions
        if (shelfWidth <= 0 || shelfDepth <= 0) {
            console.warn(" - Cannot create shelves: calculated width or depth <= 0.");
        } else {
            // 5.2. Calculate available space and positions
            
            // The top of the available space is the bottom of the top panel
            const availableSpaceTopY = (height / 2) - panelThickness;
            // The bottom of the available space is the top of the bottom panel
            const availableSpaceBottomY = -height / 2 + panelThickness;
            
            let topShelfPositioned = false;

            // 5.3. Create and position shelves
            const shelfPositionsY = []; // Array to store the Y-center of each shelf

            if (shelfLayout === 'uneven' && shelfCount > 0) {
                // --- Uneven layout ---
                const topShelfSpaceMm = cabinetData.topShelfSpace || 300;
                const topShelfSpaceM = topShelfSpaceMm / 1000;
                
                // 1. Position the top shelf
                const topShelfTopFaceY = availableSpaceTopY - topShelfSpaceM;
                const topShelfCenterY = topShelfTopFaceY - (shelfThickness / 2);
                shelfPositionsY.push(topShelfCenterY);

                // 2. Position the rest of the shelves evenly in the remaining space
                if (shelfCount > 1) {
                    const remainingShelfCount = shelfCount - 1;
                    // The new "top" for the remaining space is the bottom of the top shelf
                    const remainingSpaceTopY = topShelfCenterY - (shelfThickness / 2);
                    const remainingSpaceBottomY = availableSpaceBottomY;
                    const remainingAvailableHeight = remainingSpaceTopY - remainingSpaceBottomY;
                    
                    if (remainingAvailableHeight > 0) {
                        const shelfStepY = remainingAvailableHeight / (remainingShelfCount + 1);
                        for (let i = 1; i <= remainingShelfCount; i++) {
                            const shelfY_from_bottom = remainingSpaceBottomY + shelfStepY * i;
                            shelfPositionsY.push(shelfY_from_bottom);
                        }
                    }
                }
            } else if (shelfCount > 0) {
                // --- Even layout ---
                const availableHeight = availableSpaceTopY - availableSpaceBottomY;
                const shelfStepY = availableHeight / (shelfCount + 1);
                for (let i = 1; i <= shelfCount; i++) {
                    const shelfY_from_bottom = availableSpaceBottomY + shelfStepY * i;
                    shelfPositionsY.push(shelfY_from_bottom);
                }
            }

            // --- Common creation and positioning logic using the calculated positions ---
            shelfPositionsY.forEach((shelfCenterY_raw, index) => {
                // Round to nearest mm
                const shelfCenterY = Math.round(shelfCenterY_raw * 1000) / 1000;

                const shelfMesh = createPanel(shelfWidth, shelfThickness, shelfDepth, bodyMaterial, 'horizontal', `shelf_${index + 1}`);
                
                if (shelfMesh) {
                    const requiredFrontFaceZ = depth / 2;
                    const currentFrontFaceZ = shelfDepth / 2;
                    const shelfCenterZ = requiredFrontFaceZ - currentFrontFaceZ;
                    
                    shelfMesh.position.set(0, shelfCenterY, shelfCenterZ);
                    shelfMesh.userData.cabinetUUID = cabinetUUID;
                    group.add(shelfMesh);
                }
            });
            console.log(` - Shelves created: ${shelfCount} (Layout: ${shelfLayout})`);
        }
    }

    // ==================================================================
    // 6. Фасады
    // ==================================================================

    const doorType = cabinetData.doorType || 'double';

    if (doorType !== 'none') {
        const doorOffsetTopM = (cabinetData.doorOffsetTop ?? 0) / 1000;
        const doorOffsetBottomM = (cabinetData.doorOffsetBottom ?? 0) / 1000;
        const facadeGapM = (cabinetData.facadeGap ?? 3 / 1000);

        const facadeHeight = height - doorOffsetTopM - doorOffsetBottomM;
        const facadeCenterY = (doorOffsetBottomM - doorOffsetTopM) / 2;
        
        // 1. Базовый материал (из набора) - нужен для fallback и спейсеров
        const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
        const { material: baseMat, thickness: baseTh } = MaterialManager.getMaterial(facadeSet);

        // 2. Определение стратегии построения (Override vs Set)
        let buildStrategy = 'flat'; // 'flat', 'milled', 'aluminum'
        let profileData = null;
        let finalMaterial = baseMat;
        let finalThickness = baseTh;

        // А. Проверяем локальный Override (если есть поле в cabinetData)
        if (cabinetData.facadeOverride && cabinetData.facadeOverride.startsWith('aluminum')) {
            buildStrategy = 'aluminum';
            // Тут можно определить тип профиля (Z1, Z9...) из строки override
        } 
        // Б. Если нет Override, смотрим на набор
        else {
            // Ищем декор в mdf_milled
            if (window.facadeOptionsData['mdf_milled']) {
                 const decor = window.facadeOptionsData['mdf_milled'].decors.find(d => d.value === facadeSet?.texture);
                 if (decor && decor.profileType === '9slice') {
                     buildStrategy = 'milled';
                     profileData = decor;
                 }
            }
        }

        // Подготовка списка фасадов (размеры)
        const facadesToCreate = [];
        if (doorType === 'left' || doorType === 'right') {
            const facadeWidth = width - facadeGapM;
            if (facadeWidth > 0 && facadeHeight > 0) facadesToCreate.push({ width: facadeWidth, xOffset: 0 });
        } else if (doorType === 'double') {
            const facadeWidth = (width - facadeGapM * 2) / 2;
            if (facadeWidth > 0 && facadeHeight > 0) {
                const xOffset = facadeWidth / 2 + facadeGapM / 2;
                facadesToCreate.push({ width: facadeWidth, xOffset: -xOffset });
                facadesToCreate.push({ width: facadeWidth, xOffset: xOffset });
            }
        }

        // Создание
        facadesToCreate.forEach((facadeInfo, index) => {
            // Центр по Z зависит от толщины (которая может меняться для разных типов)
            // Для фрезеровки и плоского берем из материала. Для алюминия - своя.
            
            const container = new THREE.Group();
            container.userData.cabinetUUID = cabinetUUID;
            
            if (buildStrategy === 'milled') {
                // === ФРЕЗЕРОВКА ===
                const z = depth / 2 + finalThickness / 2;
                container.position.set(facadeInfo.xOffset, facadeCenterY, z);
                group.add(container);

                createMilledFacade(facadeInfo.width, facadeHeight, profileData, finalMaterial.clone())
                    .then(mesh => {
                        container.add(mesh);
                        mesh.updateMatrixWorld();
                    })
                    .catch(e => console.error(e));

            } else if (buildStrategy === 'aluminum') {
                // === АЛЮМИНИЙ ===
                // Вызываем твои функции createZ...
                // const mesh = createZ1FrameFacade(...)
                // container.add(mesh)
                // group.add(container)
                
            } else {
                // === ПЛОСКИЙ (Default) ===
                const z = depth / 2 + finalThickness / 2;
                
                // Пересоздаем материал для клонирования текстур
                const { material: mat } = MaterialManager.getMaterial(facadeSet);
                
                const mesh = createPanel(
                    facadeInfo.width, facadeHeight, finalThickness,
                    mat, 'frontal', `facade_${doorType}_${index}`
                );

                if (mesh) {
                    if (mesh.material.map) {
                        MaterialManager.applyTextureTransform(mesh.material, cabinetData.textureDirection || 'vertical', facadeInfo.width, facadeHeight);
                    }
                    mesh.position.set(facadeInfo.xOffset, facadeCenterY, z);
                    mesh.userData.cabinetUUID = cabinetUUID;
                    group.add(mesh);
                }
            }
        });
        
        console.log(` - Фасады созданы: ${facadesToCreate.length} шт. (${buildStrategy})`);
    }

    // ==================================================================
    // 7. Спейсеры
    // ==================================================================
    const spacersType = cabinetData.spacers || 'none';
    const isOverlayBottomForSpacer = (cabinetData.bottomConstruction || 'inset').includes('overlay');

    // --- Узкий спейсер для НАКЛАДНОГО дна ---
    if (spacersType.includes('narrow') && isOverlayBottomForSpacer) {
        // 7.1. Расчет размеров и параметров
        const doorOffsetTopM = (cabinetData.doorOffsetTop ?? 0) / 1000;
        const doorOffsetBottomM = (cabinetData.doorOffsetBottom ?? 0) / 1000;
        
        // Получаем материал и толщину фасада (она же - толщина спейсера)
        const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
        const { material: baseFacadeMaterial, thickness: facadeThicknessM } = MaterialManager.getMaterial(facadeSet);
        
        const spacerHeight = height - doorOffsetTopM - doorOffsetBottomM;
        const spacerWidth = 80 / 1000; // Это будет "ширина" нашего Shape (вдоль оси X контура)
        const spacerThickness = facadeThicknessM; // Это будет "глубина" экструзии


        if (spacerHeight > 0 && spacerWidth > 0) {
            // 7.2. Создание Shape и экструзия
            const spacerShape = new THREE.Shape();
            spacerShape.moveTo(0, 0.05);          
            spacerShape.lineTo(spacerWidth - spacerThickness - bottomFrontOffsetM, 0.05);
            spacerShape.lineTo(spacerWidth - spacerThickness - bottomFrontOffsetM, 0);
            spacerShape.lineTo(spacerWidth, 0);
            spacerShape.lineTo(spacerWidth, spacerHeight);
            spacerShape.lineTo(0, spacerHeight);
            spacerShape.closePath();

            const extrudeSettings = {
                steps: 1,
                depth: spacerThickness, // Глубина выдавливания = толщина
                bevelEnabled: false
            };

            const spacerPanel = createExtrudedPanel(
                spacerShape, extrudeSettings, baseFacadeMaterial.clone(), 'frontal', 
                `spacer_narrow_${spacersType.includes('left') ? 'left' : 'right'}`
            );

            if (spacerPanel) {
                // 7.3. Позиционирование
                // Геометрия создана в плоскости XY. Нам нужно повернуть ее и сдвинуть.
                spacerPanel.rotation.y = -Math.PI / 2; // Поворачиваем на -90 градусов, чтобы она встала вдоль оси Z

                // Центр по Y рассчитывается так же, как у фасада
                const spacerCenterY = - height / 2 + doorOffsetBottomM;
                
                let spacerCenterX;

                if (spacersType.includes('left')) {
                    // Левый спейсер: правая грань = левая грань шкафа
                    // Правая грань повернутого спейсера = center.x + thickness/2
                    // Левая грань шкафа = -width/2
                    spacerCenterX = -width / 2;
                } else { // правый
                    // Правый спейсер: левая грань = правая грань шкафа
                    // Левая грань повернутого спейсера = center.x - thickness/2
                    // Правая грань шкафа = width/2
                    spacerCenterX = width / 2 + spacerThickness;
                }
                
                // Центр по Z: передняя грань спейсера = передняя грань фасада
                const facadeFrontFaceZ = depth / 2 + facadeThicknessM;
                // Передняя грань повернутого спейсера = center.z + width/2
                const spacerCenterZ = facadeFrontFaceZ - spacerWidth / 1;
                
                spacerPanel.position.set(spacerCenterX, spacerCenterY, spacerCenterZ);
                spacerPanel.userData.cabinetUUID = cabinetUUID;
                
                // 7.4. Коррекция UV-координат (адаптированный ваш код)
                MaterialManager.applyTextureToExtruded(
                    spacerPanel,
                    'vertical', // <-- Передаем направление ИЗ ФАСАДА
                    spacerWidth,             // Ширина Shape
                    spacerHeight                  // Высота Shape
                );

                group.add(spacerPanel);
                console.log(` - Узкий спейсер (накладной) создан.`);
            }
        }
    } else if (spacersType.includes('narrow') && !isOverlayBottomForSpacer) {
        // --- Узкий спейсер для ВКЛАДНОГО дна ---

        // 7.1. Расчет общих параметров
        const { material: baseFacadeMaterial, thickness: facadeThicknessM } = MaterialManager.getMaterial(facadeSet);
        const doorOffsetTopM = (cabinetData.doorOffsetTop ?? 0) / 1000;
        const doorOffsetBottomM = (cabinetData.doorOffsetBottom ?? 0) / 1000;

        // --- 7.2. Создание и позиционирование 1-й детали (Вертикальная планка) ---
        const verticalPartHeight = height - doorOffsetTopM - doorOffsetBottomM;
        const verticalPartWidth = facadeThicknessM; // Ширина по X
        const verticalPartDepth = 80 / 1000;         // Глубина по Z

        const verticalSpacerPart = createPanel(verticalPartWidth, verticalPartHeight, verticalPartDepth, baseFacadeMaterial.clone(), 'vertical', 'spacer_inset_vertical');
        
        if (verticalSpacerPart) {
            let partCenterX;
            if (spacersType.includes('left')) {
                // Левый: правая грань = левая грань шкафа
                partCenterX = -width / 2 - verticalPartWidth / 2;
            } else { // правый
                // Правый: левая грань = правая грань шкафа
                partCenterX = width / 2 + verticalPartWidth / 2;
            }

            // По Y позиция как у фасада
            const partCenterY = (doorOffsetBottomM - doorOffsetTopM) / 2;
            
            // По Z передняя грань = передняя грань фасада
            const facadeFrontFaceZ = depth / 2 + facadeThicknessM;
            const partCenterZ = facadeFrontFaceZ - verticalPartDepth / 2;

            verticalSpacerPart.position.set(partCenterX, partCenterY, partCenterZ);
            verticalSpacerPart.userData.cabinetUUID = cabinetUUID;
            // Применяем трансформацию текстуры
            const verticalMaterial = verticalSpacerPart.material;
            if (verticalMaterial.map && verticalMaterial.map.isTexture) {
                MaterialManager.applyTextureTransform(
                    verticalMaterial,
                    cabinetData.textureDirection || 'vertical',
                    verticalPartDepth,
                    verticalPartHeight
                );
            }
            group.add(verticalSpacerPart);
        }
        
        // --- 7.3. Создание и позиционирование 2-й детали (Горизонтальная планка) ---
        const horizontalPartHeight = 80 / 1000;
        const horizontalPartWidth = facadeThicknessM;
        const horizontalPartDepth = depth + facadeThicknessM - (80 / 1000); // 80мм - глубина верт. планки

        const horizontalSpacerPart = createPanel(horizontalPartWidth, horizontalPartHeight, horizontalPartDepth, baseFacadeMaterial.clone(), 'vertical', 'spacer_inset_horizontal');

        if (horizontalSpacerPart) {
            let partCenterX;
            if (spacersType.includes('left')) {
                partCenterX = -width / 2 - horizontalPartWidth / 2;
            } else { // правый
                partCenterX = width / 2 + horizontalPartWidth / 2;
            }
            
            // По Y: нижняя грань = нижняя грань шкафа
            const partCenterY = -height / 2 + horizontalPartHeight / 2;
            
            // По Z: задняя грань = задняя грань шкафа
            const requiredRearFaceZ = -depth / 2;
            const currentRearFaceZ = -horizontalPartDepth / 2;
            const partCenterZ = requiredRearFaceZ - currentRearFaceZ;
            
            horizontalSpacerPart.position.set(partCenterX, partCenterY, partCenterZ);
            horizontalSpacerPart.userData.cabinetUUID = cabinetUUID;
            // Применяем трансформацию текстуры
            const horizontalMaterial = horizontalSpacerPart.material;
            if (horizontalMaterial.map && horizontalMaterial.map.isTexture) {
                const transformedTexture = MaterialManager.applyTextureTransform(
                    horizontalMaterial.map,
                    cabinetData.textureDirection || 'vertical',
                    horizontalPartDepth,
                    horizontalPartHeight
                );
                horizontalMaterial.map = transformedTexture;
                horizontalMaterial.needsUpdate = true;
            }
            group.add(horizontalSpacerPart);
        }

        console.log(` - Узкий спейсер (вкладной, 2 части) создан.`);
    } else if (spacersType.includes('wide')) {
        // --- Широкий спейсер ---

        // --- 7.1. Держатель спейсера (из материала корпуса) ---
        
        // 7.1.1. Расчет размеров и параметров
        const doorOffsetTopM = (cabinetData.doorOffsetTop ?? 0) / 1000;
        const doorOffsetBottomM = (cabinetData.doorOffsetBottom ?? 0) / 1000;

        const holderHeight = height - panelThickness - doorOffsetTopM;
        const holderWidth = panelThickness; // Ширина по X
        const holderDepth = 60 / 1000;      // Глубина по Z

        // 7.1.2. Создание детали
        // Используем bodyMaterial, т.к. держатель из материала корпуса
        const spacerHolder = createPanel(holderWidth, holderHeight, holderDepth, bodyMaterial, 'vertical', 'spacer_holder');

        if (spacerHolder) {
            // 7.1.3. Позиционирование
            let holderCenterX;
            if (spacersType.includes('left')) {
                // Левый: правая грань = левая грань шкафа
                holderCenterX = -width / 2 - holderWidth / 2;
            } else { // Правый
                // Правый: левая грань = правая грань шкафа
                holderCenterX = width / 2 + holderWidth / 2;
            }

            // По Y: нижняя грань = нижняя грань шкафа + толщина дна
            // Нижняя грань шкафа = -height/2. Низ дна (вкладного) = -height/2. Верх дна (вкладного) = -height/2 + panelThickness.
            // Нам нужно, чтобы держатель стоял НА дне.
            // Поэтому его нижняя грань должна быть на уровне верха дна.
            const requiredBottomFaceY = -height / 2 + panelThickness;
            const holderCenterY = requiredBottomFaceY + holderHeight / 2;
            
            // По Z: передняя грань = передняя грань шкафа
            const requiredFrontFaceZ = depth / 2;
            const holderCenterZ = requiredFrontFaceZ - holderDepth / 2;

            spacerHolder.position.set(holderCenterX, holderCenterY, holderCenterZ);
            spacerHolder.userData.cabinetUUID = cabinetUUID;
            group.add(spacerHolder);
        }
             
        console.log(` - Держатель для широкого спейсера создан.`);

        // --- 7.2. Фасадная часть спейсера (из материала фасада) ---
    
        // 7.2.1. Расчет размеров и параметров
        const spacerFacadeHeight = height - doorOffsetTopM - doorOffsetBottomM;
        const spacerWidthMm = cabinetData.spacerWidth || 60;
        const spacerFacadeWidth = (spacerWidthMm - 1) / 1000;

        const { material: baseFacadeMaterial, thickness: facadeThicknessM } = MaterialManager.getMaterial(facadeSet);
        const spacerFacadeDepth = facadeThicknessM;

        // 7.2.2. Определение стратегии (Фрезеровка или Плоский)
        let isMilled = false;
        let profileData = null;
        
        if (window.facadeOptionsData['mdf_milled']) {
             const decor = window.facadeOptionsData['mdf_milled'].decors.find(d => d.value === facadeSet?.texture);
             if (decor && decor.profileType === '9slice') {
                 isMilled = true;
                 profileData = decor;
             }
        }

        // 7.2.3. Позиционирование (общие координаты центра)
        let facadeCenterX;
        const oneMm = 1 / 1000;
        if (spacersType.includes('left')) {
            // правая грань = левая грань шкафа - 1мм
            const requiredRightFaceX = -width / 2 - oneMm;
            facadeCenterX = requiredRightFaceX - spacerFacadeWidth / 2;
        } else { // Правый
            // левая грань = правая грань шкафа + 1мм
            const requiredLeftFaceX = width / 2 + oneMm;
            facadeCenterX = requiredLeftFaceX + spacerFacadeWidth / 2;
        }

        const requiredBottomFaceY = -height / 2 + doorOffsetBottomM;
        const facadeCenterY = requiredBottomFaceY + spacerFacadeHeight / 2;
        
        const requiredRearFaceZ = depth / 2;
        const facadeCenterZ = requiredRearFaceZ + spacerFacadeDepth / 2;


        // 7.2.4. Создание
        if (isMilled) {
            // === ВАРИАНТ 1: ФРЕЗЕРОВКА ===
            // Создаем контейнер
            const spacerContainer = new THREE.Group();
            spacerContainer.position.set(facadeCenterX, facadeCenterY, facadeCenterZ);
            spacerContainer.userData.cabinetUUID = cabinetUUID;
            group.add(spacerContainer);

            // Запускаем билдер
            // FacadeBuilder сам решит (LOD), делать ли сложный профиль или заглушку,
            // если спейсер слишком узкий.
            createMilledFacade(spacerFacadeWidth, spacerFacadeHeight, profileData, baseFacadeMaterial.clone())
                .then(mesh => {
                    spacerContainer.add(mesh);
                    mesh.updateMatrixWorld();
                })
                .catch(e => console.error("Ошибка спейсера:", e));

        } else {
            // === ВАРИАНТ 2: ПЛОСКИЙ ===
            const spacerFacade = createPanel(spacerFacadeWidth, spacerFacadeHeight, spacerFacadeDepth, baseFacadeMaterial.clone(), 'frontal', 'spacer_facade');

            if (spacerFacade) {
                spacerFacade.position.set(facadeCenterX, facadeCenterY, facadeCenterZ);
                spacerFacade.userData.cabinetUUID = cabinetUUID;

                const facadeMaterial = spacerFacade.material;
                if (facadeMaterial.map && facadeMaterial.map.isTexture) {
                    MaterialManager.applyTextureTransform(
                        facadeMaterial,
                        cabinetData.textureDirection || 'vertical',
                        spacerFacadeWidth,
                        spacerFacadeHeight
                    );
                }
                group.add(spacerFacade);
            }
        }
        console.log(` - Фасадная часть для широкого спейсера создана (${isMilled ? 'Milled' : 'Flat'}).`);
    }

    // ==================================================================
    // 8. Гола-профиль
    // ==================================================================
    if ((cabinetData.bottomConstruction || 'inset').includes('Gola')) {
        
        // 8.1. Расчет размеров и параметров
        const golaMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xAAAAAA, metalness: 0.8, roughness: 0.4, name: "GolaMaterial"
        });
        
        let profileLength;
        let profileCenterX;

        if (isOverlayBottomForSpacer) { // Накладное дно
            if (spacersType.includes('wide')) {
                const spacerWidthMm = cabinetData.spacerWidth || 60;
                profileLength = width + (spacerWidthMm / 1000);
            } else {
                profileLength = width;
            }
            
            // Позиционирование для накладного
            if (spacersType.includes('left')) {
                // правая грань = правая грань шкафа
                profileCenterX = width / 2 - profileLength / 2;
            } else { // правый спейсер или нет спейсера
                // левая грань = левая грань шкафа
                profileCenterX = -width / 2 + profileLength / 2;
            }

        } else { // Вкладное дно
            profileLength = width - 2 * panelThickness;
            // левая грань = левая грань шкафа + толщина
            profileCenterX = -width / 2 + panelThickness + profileLength / 2;
        }
        
        // 8.2. Создание детали
        const golaProfile = createUpperGolaProfileMesh(profileLength, golaMaterial, cabinetUUID);

        if (golaProfile) {
            // 8.3. Позиционирование
            // Геометрия создана в плоскости XY, ее нужно повернуть и сдвинуть.
            golaProfile.rotation.y = -Math.PI / 2; // Поворачиваем, чтобы XY-плоскость стала ZY-плоскостью

            // По Y: центр = нижняя грань шкафа + толщина дна / 2
            // Это не совсем верно. Нижняя грань дна = -height/2. Верхняя = -height/2 + panelThickness.
            // Профиль должен стоять НА дне, его нижняя грань = верхняя грань дна.
            const profileHeight = 20 / 1000; // Высота сечения
            const requiredBottomFaceY = -height / 2 + panelThickness / 2;
            const profileCenterY = requiredBottomFaceY - profileHeight / 2;
            
            // По Z: задняя грань = передняя грань шкафа - отступ дна спереди
            const bottomFrontOffsetM = (cabinetData.bottomFrontOffset ?? 20) / 1000;
            const profileDepth = 20 / 1000; // Глубина сечения
            const requiredRearFaceZ = depth / 2 - bottomFrontOffsetM;
            const profileCenterZ = requiredRearFaceZ; // Pivot point у Shape в (0,0), поэтому так
            
            golaProfile.position.set(profileCenterX, profileCenterY, profileCenterZ);
            
            group.add(golaProfile);
            console.log(` - Верхний Гола-профиль создан (Длина: ${Math.round(profileLength*1000)}мм).`);
        }
    }

    return group;
}

/**
 * Главная функция для создания детализированного верхнего lift шкафа.
 * @param {object} cabinetData - Объект данных шкафа.
 * @param {object} kitchenGlobalParams - Глобальные параметры кухни.
 * @param {object} MaterialManager - Менеджер материалов.
 * @param {function} getPanelThickness - Функция для получения толщины панели.
 * @returns {THREE.Group | null}
 */
export function createDetailedLiftUpperGeometry(cabinetData, kitchenGlobalParams, MaterialManager, getPanelThickness) {
    if (!cabinetData) {
        console.error("createDetailedUpperSwingGeometry: cabinetData не предоставлен.");
        return null;
    }

    const group = new THREE.Group();
    group.userData.isDetailedCabinet = true;
    group.userData.objectType = 'cabinet';

    // --- Параметры ---
    const { width, height, depth } = cabinetData;
    const cabinetUUID = cabinetData.mesh?.uuid; // Безопасно получаем UUID

    // Получаем толщину материала (ЛДСП). Предположим, она глобальная.
    // Если она зависит от материала, логику нужно будет уточнить.
    //const panelThickness = 16 / 1000; // 16 мм, как стандарт. Замените на вашу переменную, если есть.
    
    // --- Материалы ---
    const bodyMaterial = MaterialManager.getBodyMaterial(cabinetData);
    const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
    const { material: facadeMaterial, thickness: facadeThickness } = MaterialManager.getMaterial(facadeSet);

    console.log(`--- Начало детализации swingUpper: ${width*1000}x${height*1000}x${depth*1000} ---`);

    // ==================================================================
    // 1. Боковины (Левая и Правая)
    // ==================================================================

    // 1.1. Расчет размеров и параметров
    const bottomConstruction = cabinetData.bottomConstruction || 'inset';
    const panelThickness = getPanelThickness(); // Используем переданную функцию

    // --- Общие параметры для обеих боковин ---
    let sidePanelHeight;
    let sidePanelCenterY;

    if (bottomConstruction.includes('overlay')) {
        sidePanelHeight = height - panelThickness;
        sidePanelCenterY = (height / 2) - (sidePanelHeight / 2);
    } else { // 'inset' и по умолчанию
        sidePanelHeight = height;
        sidePanelCenterY = 0;
    }
    const sidePanelThicknessAsWidth = panelThickness;

    // --- Уникальные параметры для ЛЕВОЙ боковины ---
    const leftSideOverhangRearMm = cabinetData.leftSideOverhangRear ?? 0;
    const leftSideOverhangRearM = leftSideOverhangRearMm / 1000;
    const leftSideDepth = depth + leftSideOverhangRearM; // Новая глубина
    // Сдвигаем центр по Z назад на половину выступа, чтобы передняя грань осталась на месте
    const leftSideCenterZ = -leftSideOverhangRearM / 2; 

    // --- Уникальные параметры для ПРАВОЙ боковины ---
    const rightSideOverhangRearMm = cabinetData.rightSideOverhangRear ?? 0;
    const rightSideOverhangRearM = rightSideOverhangRearMm / 1000;
    const rightSideDepth = depth + rightSideOverhangRearM; // Новая глубина
    // Сдвигаем центр по Z назад на половину выступа
    const rightSideCenterZ = -rightSideOverhangRearM / 2;

    // 1.2. Создание деталей
    const leftSide = createPanel(sidePanelThicknessAsWidth, sidePanelHeight, leftSideDepth, bodyMaterial, 'vertical', 'leftSide');
    const rightSide = createPanel(sidePanelThicknessAsWidth, sidePanelHeight, rightSideDepth, bodyMaterial, 'vertical', 'rightSide');

    // 1.3. Позиционирование деталей
    if (leftSide) {
        const leftSideCenterX = -width / 2 + panelThickness / 2;
        leftSide.position.set(leftSideCenterX, sidePanelCenterY, leftSideCenterZ); // Используем новую Z-координату
        leftSide.userData.cabinetUUID = cabinetUUID;

        MaterialManager.applyTexture(leftSide, cabinetData.textureDirection, 'vertical');
        group.add(leftSide);
    }

    if (rightSide) {
        const rightSideCenterX = width / 2 - panelThickness / 2;
        rightSide.position.set(rightSideCenterX, sidePanelCenterY, rightSideCenterZ); // Используем новую Z-координату
        rightSide.userData.cabinetUUID = cabinetUUID;

        MaterialManager.applyTexture(rightSide, cabinetData.textureDirection, 'vertical');
        group.add(rightSide);
    }

    console.log(` - Боковины созданы (Конструкция дна: ${bottomConstruction}, Выступ Л/П: ${leftSideOverhangRearMm}мм / ${rightSideOverhangRearMm}мм)`);
    
    // ==================================================================
    // 2. Дно
    // ==================================================================

    // 2.1. Расчет параметров для дна
    const bottomType = cabinetData.bottomType || 'solid';
    //const bottomConstruction = cabinetData.bottomConstruction || 'inset';
    const spacers = cabinetData.spacers || 'none';
    const bottomFrontOffsetMm = cabinetData.bottomFrontOffset ?? 0;
    const bottomOverhangRearMm = cabinetData.bottomOverhangRear ?? 0;
    // --- НОВЫЙ ПАРАМЕТР ---
    const backPanelOffsetMm = cabinetData.backPanelOffset ?? 0;

    const bottomFrontOffsetM = bottomFrontOffsetMm / 1000;
    const bottomOverhangRearM = bottomOverhangRearMm / 1000;
    const backPanelOffsetM = backPanelOffsetMm / 1000;

    let bottomPanelWidth;
    let bottomPanelCenterX = 0;
    const bottomPanelThickness = panelThickness;
    const bottomPanelCenterY = -height / 2 + bottomPanelThickness / 2;
    let finalConsoleLog = ""; // Переменная для лога

    if (bottomConstruction.includes('inset')) {
        // --- Логика для ВКЛАДНОГО дна ---
        bottomPanelWidth = width - 2 * panelThickness;
        // bottomPanelCenterX остается 0

        if (bottomType === 'solid') {
            // --- Вкладное сплошное дно ---
            // Глубина уменьшается на углубление ЗС
            const bottomPanelDepth = depth - bottomFrontOffsetM + bottomOverhangRearM - backPanelOffsetM;
            const bottomPanel = createPanel(bottomPanelWidth, bottomPanelThickness, bottomPanelDepth, bodyMaterial, 'horizontal', 'bottomPanel_solid_inset');
            if (bottomPanel) {
                // Позиционирование по передней грани остается прежним
                const requiredFrontFaceZ = depth / 2 - bottomFrontOffsetM;
                const currentFrontFaceZ = bottomPanelDepth / 2;
                const bottomPanelCenterZ = requiredFrontFaceZ - currentFrontFaceZ;
                bottomPanel.position.set(0, bottomPanelCenterY, bottomPanelCenterZ);
                bottomPanel.userData.cabinetUUID = cabinetUUID;

                MaterialManager.applyTexture(bottomPanel, cabinetData.textureDirection, 'horizontal');

                group.add(bottomPanel);
                finalConsoleLog = ` - Дно (solid, inset) создано (Г: ${Math.round(bottomPanelDepth*1000)}мм)`;
            }
        } else if (bottomType === 'slats') {
            // --- Вкладное дно "планки" ---
            const frontSlatDepth = 90 / 1000;
            const frontSlat = createPanel(bottomPanelWidth, bottomPanelThickness, frontSlatDepth, bodyMaterial, 'horizontal', 'bottomPanel_frontSlat_inset');
            if (frontSlat) {
                // Позиционирование передней планки не меняется
                const requiredFrontFaceZ = depth / 2 - bottomFrontOffsetM;
                const currentFrontFaceZ = frontSlatDepth / 2;
                const frontSlatCenterZ = requiredFrontFaceZ - currentFrontFaceZ;
                frontSlat.position.set(0, bottomPanelCenterY, frontSlatCenterZ);
                frontSlat.userData.cabinetUUID = cabinetUUID;
                MaterialManager.applyTexture(frontSlat, cabinetData.textureDirection, 'horizontal');
                group.add(frontSlat);
            }

            const rearSlatDepth = (90 / 1000) + bottomOverhangRearM;
            const rearSlat = createPanel(bottomPanelWidth, bottomPanelThickness, rearSlatDepth, bodyMaterial, 'horizontal', 'bottomPanel_rearSlat_inset');
            if (rearSlat) {
                // Позиционирование задней планки смещается ВПЕРЕД на углубление ЗС
                const requiredRearFaceZ = -depth / 2 - bottomOverhangRearM + backPanelOffsetM; // <-- ИЗМЕНЕНИЕ
                const currentRearFaceZ = -rearSlatDepth / 2;
                const rearSlatCenterZ = requiredRearFaceZ - currentRearFaceZ;
                rearSlat.position.set(0, bottomPanelCenterY, rearSlatCenterZ);
                rearSlat.userData.cabinetUUID = cabinetUUID;
                MaterialManager.applyTexture(rearSlat, cabinetData.textureDirection, 'horizontal');
                group.add(rearSlat);
            }
            finalConsoleLog = ` - Дно (slats, inset) создано.`;
        }

    } else { // --- Логика для НАКЛАДНОГО дна ('overlay') ---
        bottomPanelWidth = width; // Базовая ширина
        // ... (весь блок со спейсерами остается БЕЗ ИЗМЕНЕНИЙ) ...
        if (spacers !== 'none') {
            if (spacers.includes('narrow')) {
                const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
                const { thickness: facadeThicknessM } = MaterialManager.getMaterial(facadeSet);
                bottomPanelWidth += facadeThicknessM;
            } else if (spacers.includes('wide')) {
                const spacerWidthMm = cabinetData.spacerWidth || 60;
                const spacerWidthM = spacerWidthMm / 1000;
                bottomPanelWidth += spacerWidthM;
            }
            const deltaWidth = bottomPanelWidth - width;
            if (spacers.includes('left')) {
                const requiredRightFaceX = width / 2;
                const currentRightFaceX = bottomPanelWidth / 2;
                bottomPanelCenterX = requiredRightFaceX - currentRightFaceX;
            } else if (spacers.includes('right')) {
                const requiredLeftFaceX = -width / 2;
                const currentLeftFaceX = -bottomPanelWidth / 2;
                bottomPanelCenterX = requiredLeftFaceX - currentLeftFaceX;
            }
        }
        // ... (конец блока со спейсерами) ...

        // Создание и позиционирование для накладного дна (углубление ЗС не влияет)
        if (bottomType === 'solid') {
            const bottomPanelDepth = depth - bottomFrontOffsetM + bottomOverhangRearM;
            const bottomPanel = createPanel(bottomPanelWidth, bottomPanelThickness, bottomPanelDepth, bodyMaterial, 'horizontal', 'bottomPanel_solid_overlay');
            if (bottomPanel) {
                const requiredFrontFaceZ = depth / 2 - bottomFrontOffsetM;
                const currentFrontFaceZ = bottomPanelDepth / 2;
                const bottomPanelCenterZ = requiredFrontFaceZ - currentFrontFaceZ;
                bottomPanel.position.set(bottomPanelCenterX, bottomPanelCenterY, bottomPanelCenterZ);
                bottomPanel.userData.cabinetUUID = cabinetUUID;

                MaterialManager.applyTexture(bottomPanel, cabinetData.textureDirection, 'horizontal');

                group.add(bottomPanel);
            }
        } else if (bottomType === 'slats') {
            const frontSlatDepth = 90 / 1000;
            const frontSlat = createPanel(bottomPanelWidth, bottomPanelThickness, frontSlatDepth, bodyMaterial, 'horizontal', 'bottomPanel_frontSlat_overlay');
            if (frontSlat) {
                const requiredFrontFaceZ = depth / 2 - bottomFrontOffsetM;
                const currentFrontFaceZ = frontSlatDepth / 2;
                const frontSlatCenterZ = requiredFrontFaceZ - currentFrontFaceZ;
                frontSlat.position.set(bottomPanelCenterX, bottomPanelCenterY, frontSlatCenterZ);
                frontSlat.userData.cabinetUUID = cabinetUUID;

                MaterialManager.applyTexture(frontSlat, cabinetData.textureDirection, 'horizontal');

                group.add(frontSlat);
            }
            const rearSlatDepth = (90 / 1000) + bottomOverhangRearM;
            const rearSlat = createPanel(bottomPanelWidth, bottomPanelThickness, rearSlatDepth, bodyMaterial, 'horizontal', 'bottomPanel_rearSlat_overlay');
            if (rearSlat) {
                const requiredRearFaceZ = -depth / 2 - bottomOverhangRearM;
                const currentRearFaceZ = -rearSlatDepth / 2;
                const rearSlatCenterZ = requiredRearFaceZ - currentRearFaceZ;
                rearSlat.position.set(bottomPanelCenterX, bottomPanelCenterY, rearSlatCenterZ);
                rearSlat.userData.cabinetUUID = cabinetUUID;

                MaterialManager.applyTexture(rearSlat, cabinetData.textureDirection, 'horizontal');

                group.add(rearSlat);
            }
        }
        finalConsoleLog = ` - Дно (overlay) создано (X-центр: ${bottomPanelCenterX.toFixed(3)})`;
    }

    console.log(finalConsoleLog);

    // ==================================================================
    // 3. Крыша
    // ==================================================================

    // 3.1. Расчет размеров и параметров
    // Крыша всегда вкладная, поэтому ширина = общая ширина - 2 толщины.
    const topPanelWidth = width - 2 * panelThickness;
    const topPanelThickness = panelThickness;

    // Глубина крыши = общая глубина - углубление для задней стенки.
    const topPanelDepth = depth - backPanelOffsetM;

    // 3.2. Создание детали
    const topPanel = createPanel(topPanelWidth, topPanelThickness, topPanelDepth, bodyMaterial, 'horizontal', 'topPanel');

    // 3.3. Позиционирование детали
    if (topPanel) {
        const topPanelCenterX = 0;

        // Верхняя грань крыши (+h/2) должна быть равна верхней грани шкафа (+height/2)
        // => center.y + h/2 = height/2
        // => center.y = height/2 - h/2
        const topPanelCenterY = height / 2 - topPanelThickness / 2;
        
        // Позиционируем крышу так, чтобы ее передняя грань совпадала с передней гранью шкафа.
        // Логика та же, что и у дна с отступом = 0.
        const requiredFrontFaceZ = depth / 2; // Отступа нет
        const currentFrontFaceZ = topPanelDepth / 2;
        const topPanelCenterZ = requiredFrontFaceZ - currentFrontFaceZ;
        
        topPanel.position.set(topPanelCenterX, topPanelCenterY, topPanelCenterZ);
        topPanel.userData.cabinetUUID = cabinetUUID;
        MaterialManager.applyTexture(topPanel, cabinetData.textureDirection, 'horizontal');
        group.add(topPanel);

        console.log(` - Крыша создана (Г: ${Math.round(topPanelDepth*1000)}мм)`);
    }

    // ==================================================================
    // 4. Задняя стенка (ДВП/ХДФ)
    // ==================================================================
    const hasBackPanel = cabinetData.backPanel || 'yes';

    if (hasBackPanel === 'yes') {
        // 4.1. Расчет размеров и параметров
        const backPanelThickness = 3 / 1000;
        const backPanelMaterial = new THREE.MeshStandardMaterial({
            color: 0xf0f0f0, // Светло-серый
            roughness: 0.9,
            metalness: 0.0,
            name: "BackPanelMaterial"
        });

        // --- Расчет ширины и отступов по X ---
        const leftSideOverhangM = (cabinetData.leftSideOverhangRear ?? 0) / 1000;
        const rightSideOverhangM = (cabinetData.rightSideOverhangRear ?? 0) / 1000;

        const backPanelOffsetX_Left = (leftSideOverhangM > 0) ? (10 / 1000) : (2 / 1000);
        const backPanelOffsetX_Right = (rightSideOverhangM > 0) ? (10 / 1000) : (2 / 1000);
        
        const backPanelWidth = width - backPanelOffsetX_Left - backPanelOffsetX_Right;

        // --- Расчет высоты и отступов по Y ---
        const bottomOverhangRearM = (cabinetData.bottomOverhangRear ?? 0) / 1000;
        const isOverlayBottom = (cabinetData.bottomConstruction || 'inset').includes('overlay');

        const backPanelOffsetY_Top = 2 / 1000;
        let backPanelOffsetY_Bottom;

        if (bottomOverhangRearM > 0) {
            backPanelOffsetY_Bottom = 10 / 1000;
        } else if (isOverlayBottom && backPanelOffsetM > 0) {
            backPanelOffsetY_Bottom = 10 / 1000;
        } else {
            backPanelOffsetY_Bottom = 2 / 1000;
        }
        
        const backPanelHeight = height - backPanelOffsetY_Top - backPanelOffsetY_Bottom;

        // 4.2. Создание детали
        const backPanel = createPanel(backPanelWidth, backPanelHeight, backPanelThickness, backPanelMaterial, 'frontal', 'backPanel');

        // 4.3. Позиционирование детали
        if (backPanel) {
            // По X: левая грань ЗС = левая грань шкафа + отступ слева
            const requiredLeftFaceX = -width / 2 + backPanelOffsetX_Left;
            const currentLeftFaceX = -backPanelWidth / 2;
            const backPanelCenterX = requiredLeftFaceX - currentLeftFaceX;

            // По Y: верхняя грань ЗС = верхняя грань шкафа - отступ сверху
            const requiredTopFaceY = height / 2 - backPanelOffsetY_Top;
            const currentTopFaceY = backPanelHeight / 2;
            const backPanelCenterY = requiredTopFaceY - currentTopFaceY;
            
            // По Z: передняя грань ЗС = задняя грань шкафа + углубление ЗС
            // (задняя грань шкафа = -depth/2, углубление смещает ВПЕРЕД)
            const requiredFrontFaceZ = -depth / 2 + backPanelOffsetM;
            const currentFrontFaceZ = backPanelThickness / 2;
            const backPanelCenterZ = requiredFrontFaceZ - currentFrontFaceZ;
            
            backPanel.position.set(backPanelCenterX, backPanelCenterY, backPanelCenterZ);
            backPanel.userData.cabinetUUID = cabinetUUID;
            group.add(backPanel);
            
            console.log(` - Задняя стенка создана (Ш: ${Math.round(backPanelWidth*1000)}, В: ${Math.round(backPanelHeight*1000)})`);
        }
    }

    // ==================================================================
    // 6. Средняя полка (обязательная для double_separate)
    // ==================================================================
    const construction = cabinetData.liftDoorConstruction || 'single';
    let middleShelfCenterY = null; // Нам понадобится эта координата для расчета полок

    if (construction === 'double_separate') {
        // 1. Расчет размеров
        const middleShelfFrontGap = 1 / 1000;
        const middleShelfDepth = depth - backPanelOffsetM - middleShelfFrontGap;
        const middleShelfWidth = width - 2 * panelThickness; // Как конфирмат
        const middleShelfThickness = panelThickness;

        if (middleShelfWidth > 0 && middleShelfDepth > 0) {
            const middleShelf = createPanel(middleShelfWidth, middleShelfThickness, middleShelfDepth, bodyMaterial, 'horizontal', 'middleShelf_mandatory');

            if (middleShelf) {
                // 2. Позиционирование
                const topFacadeHeightM = (cabinetData.liftTopFacadeHeight || 240) / 1000;
                const doorOffsetTopM = (cabinetData.doorOffsetTop ?? 0) / 1000;
                
                const requiredTopFaceY = (height / 2) - doorOffsetTopM - topFacadeHeightM;
                middleShelfCenterY = requiredTopFaceY - (middleShelfThickness / 2); // Сохраняем центр

                const middleShelfCenterX = 0;
                const requiredFrontFaceZ = depth / 2 - middleShelfFrontGap;
                const middleShelfCenterZ = requiredFrontFaceZ - middleShelfDepth / 2;

                middleShelf.position.set(middleShelfCenterX, middleShelfCenterY, middleShelfCenterZ);
                middleShelf.userData.cabinetUUID = cabinetUUID;
                //MaterialManager.applyTexture(middleShelf, 'horizontal');
                group.add(middleShelf);
                console.log(` - Обязательная средняя полка создана.`);
            }
        }
    }

    // ==================================================================
    // 5. Shelves
    // ==================================================================
    const shelfCount = parseInt(cabinetData.shelfCount) || 0;
    const shelfLayout = cabinetData.shelfLayout || 'even';
    const constructionForShelves = cabinetData.liftDoorConstruction || 'single';


    if (shelfCount > 0) {
        let shelfDepth;
        const shelfLayout = cabinetData.shelfLayout || 'even';
        
        // --- 6.1. Определяем отступ и глубину полки в зависимости от конструкции ---
        let frontShelfGap;
        if (constructionForShelves === 'double_folding') {
            frontShelfGap = 22 / 1000;
        } else if (constructionForShelves === 'double_separate') {
            console.log(" - Создание дополнительных полок для 'double_separate'...");
    
            // 1. Общие параметры
            const shelfFrontGap = 4 / 1000;
            const shelfDepth = depth - backPanelOffsetM - shelfFrontGap;
            const shelfWidth = width - 2 * panelThickness - (2 / 1000);
            const shelfThickness = panelThickness;
            const shelfLayout = cabinetData.shelfLayout || 'even';

            if (shelfWidth > 0 && shelfDepth > 0) {
                
                // --- 2. Заполнение НИЖНЕЙ секции ---
                const bottomSectionTopY = middleShelfCenterY - (shelfThickness / 2);
                const bottomSectionBottomY = -height / 2 + panelThickness;
                const bottomAvailableHeight = bottomSectionTopY - bottomSectionBottomY;

                if (bottomAvailableHeight > shelfThickness) {
                    const bottomShelfPositions = [];
                    if (shelfLayout === 'uneven' && shelfCount > 0) {
                        const topShelfSpaceM = (cabinetData.topShelfSpace || 300) / 1000;
                        const topShelfTopFaceY = bottomSectionTopY - topShelfSpaceM;
                        const topShelfCenterY = topShelfTopFaceY - (shelfThickness / 2);
                        bottomShelfPositions.push(topShelfCenterY);
                        if (shelfCount > 1) {
                            // Логика для остальных полок
                            const remainingShelfCount = shelfCount - 1;
                            const remainingSpaceTopY = topShelfCenterY - (shelfThickness / 2);
                            const remainingAvailableHeight = remainingSpaceTopY - bottomSectionBottomY;
                            if (remainingAvailableHeight > 0) {
                                const shelfStepY = remainingAvailableHeight / (remainingShelfCount + 1);
                                for (let i = 1; i <= remainingShelfCount; i++) {
                                    bottomShelfPositions.push(bottomSectionBottomY + shelfStepY * i - (shelfThickness / 2));
                                }
                            }
                        }
                    } else if (shelfCount > 0) {
                        const shelfStepY = bottomAvailableHeight / (shelfCount + 1);
                        for (let i = 1; i <= shelfCount; i++) {
                            bottomShelfPositions.push(bottomSectionBottomY + shelfStepY * i - (shelfThickness / 2));
                        }
                    }
                    
                    bottomShelfPositions.forEach((shelfCenterY, index) => {
                        const shelfMesh = createPanel(shelfWidth, shelfThickness, shelfDepth, bodyMaterial, 'horizontal', `shelf_bottom_sep_${index + 1}`);
                        if (shelfMesh) {
                            const requiredFrontFaceZ = depth / 2 - shelfFrontGap;
                            const shelfCenterZ = requiredFrontFaceZ - shelfDepth / 2;
                            shelfMesh.position.set(0, shelfCenterY, shelfCenterZ);
                            shelfMesh.userData.cabinetUUID = cabinetUUID;
                            MaterialManager.applyTexture(shelfMesh, 'horizontal');
                            group.add(shelfMesh);
                        }
                    });
                    console.log(`   - Полки в нижней секции созданы: ${bottomShelfPositions.length} шт.`);
                }
                
                // --- 3. Заполнение ВЕРХНЕЙ секции ---
                const topSectionTopY = height / 2 - panelThickness;
                const topSectionBottomY = middleShelfCenterY + (shelfThickness / 2);
                const topAvailableHeight = topSectionTopY - topSectionBottomY;

                if (topAvailableHeight > shelfThickness) {
                    const topShelfPositions = [];
                    if (shelfLayout === 'uneven' && shelfCount > 0) {
                        const topShelfSpaceM = (cabinetData.topShelfSpace || 300) / 1000;
                        const topShelfTopFaceY = topSectionTopY - topShelfSpaceM;
                        const topShelfCenterY = topShelfTopFaceY - (shelfThickness / 2);
                        topShelfPositions.push(topShelfCenterY);
                        if (shelfCount > 1) {
                            const remainingShelfCount = shelfCount - 1;
                            const remainingSpaceTopY = topShelfCenterY - (shelfThickness / 2);
                            const remainingAvailableHeight = remainingSpaceTopY - topSectionBottomY;
                            if (remainingAvailableHeight > 0) {
                                const shelfStepY = remainingAvailableHeight / (remainingShelfCount + 1);
                                for (let i = 1; i <= remainingShelfCount; i++) {
                                    topShelfPositions.push(topSectionBottomY + shelfStepY * i - (shelfThickness / 2));
                                }
                            }
                        }
                    } else if (shelfCount > 0) {
                        const shelfStepY = topAvailableHeight / (shelfCount + 1);
                        for (let i = 1; i <= shelfCount; i++) {
                            topShelfPositions.push(topSectionBottomY + shelfStepY * i - (shelfThickness / 2));
                        }
                    }

                    topShelfPositions.forEach((shelfCenterY, index) => {
                        const shelfMesh = createPanel(shelfWidth, shelfThickness, shelfDepth, bodyMaterial, 'horizontal', `shelf_top_sep_${index + 1}`);
                        if (shelfMesh) {
                            const requiredFrontFaceZ = depth / 2 - shelfFrontGap;
                            const shelfCenterZ = requiredFrontFaceZ - shelfDepth / 2;
                            shelfMesh.position.set(0, shelfCenterY, shelfCenterZ);
                            shelfMesh.userData.cabinetUUID = cabinetUUID;
                            MaterialManager.applyTexture(shelfMesh, 'horizontal');
                            group.add(shelfMesh);
                        }
                    });
                    console.log(`   - Полки в верхней секции созданы: ${topShelfPositions.length} шт.`);
                }
            }
        } else { // 'single'
            frontShelfGap = 4 / 1000;
        }

        if (frontShelfGap) { // Выполняем, только если frontShelfGap определен
            shelfDepth = depth - backPanelOffsetM - frontShelfGap;

            // 6.2. Расчет размеров (копируем из swingUpper)
            const shelfThickness = panelThickness;

                // 5.1. Calculate shelf dimensions
            const shelfType = cabinetData.shelfType || 'confirmat'; // Get shelf type
            const shelfLayout = cabinetData.shelfLayout || 'even';

            let shelfWidth;
            if (shelfType === 'confirmat') {
                    shelfWidth = width - 2 * panelThickness;
                } else { // shelfHolder, secura7, etc.
                    shelfWidth = width - 2 * panelThickness - (2 / 1000); // Add 2mm gap
            }

            if (shelfWidth > 0 && shelfDepth > 0) {
                // 6.3. Расчет Y-позиций (копируем из swingUpper)
                const availableSpaceTopY = height / 2 - panelThickness;
                const availableSpaceBottomY = -height / 2 + panelThickness;
                const availableHeight = availableSpaceTopY - availableSpaceBottomY;
                
                const shelfPositionsY = [];
                // ... (здесь полностью копируем блок if/else if для 'uneven'/'even' из swingUpper)
                if (shelfLayout === 'uneven' && shelfCount > 0) {
                    const topShelfSpaceM = (cabinetData.topShelfSpace || 300) / 1000;
                    const topShelfTopFaceY = availableSpaceTopY - topShelfSpaceM;
                    const topShelfCenterY = topShelfTopFaceY - (shelfThickness / 2);
                    shelfPositionsY.push(topShelfCenterY);
                    if (shelfCount > 1) { 
                        const remainingShelfCount = shelfCount - 1;
                        // The new "top" for the remaining space is the bottom of the top shelf
                        const remainingSpaceTopY = topShelfCenterY - (shelfThickness / 2);
                        const remainingSpaceBottomY = availableSpaceBottomY;
                        const remainingAvailableHeight = remainingSpaceTopY - remainingSpaceBottomY;
                        
                        if (remainingAvailableHeight > 0) {
                            const shelfStepY = remainingAvailableHeight / (remainingShelfCount + 1);
                            for (let i = 1; i <= remainingShelfCount; i++) {
                                const shelfY_from_bottom = remainingSpaceBottomY + shelfStepY * i;
                                shelfPositionsY.push(shelfY_from_bottom);
                            }
                        }
                    }
                } else if (shelfCount > 0) {
                    const shelfStepY = availableHeight / (shelfCount + 1);
                    for (let i = 1; i <= shelfCount; i++) {
                        shelfPositionsY.push(availableSpaceBottomY + shelfStepY * i - (shelfThickness / 2));
                    }
                }
                // ... (конец скопированного блока)

                // 6.4. Создание и позиционирование
                shelfPositionsY.forEach((shelfCenterY, index) => {
                    const shelfMesh = createPanel(shelfWidth, shelfThickness, shelfDepth, bodyMaterial, 'horizontal', `shelf_lift_${index + 1}`);
                    if (shelfMesh) {
                        const requiredFrontFaceZ = depth / 2 - frontShelfGap;
                        const shelfCenterZ = requiredFrontFaceZ - shelfDepth / 2;
                        
                        shelfMesh.position.set(0, shelfCenterY, shelfCenterZ); // Полки всегда по центру X
                        shelfMesh.userData.cabinetUUID = cabinetUUID;
                        //MaterialManager.applyTexture(shelfMesh, 'horizontal');
                        group.add(shelfMesh);
                    }
                });
                console.log(` - Полки (подъемник) созданы: ${shelfPositionsY.length} шт.`);
            }
        }
    }


    // ==================================================================
    // 5. Фасады (для подъемника)
    // ==================================================================

    // 5.1. Подготовка общих параметров
    // const construction = cabinetData.liftDoorConstruction || 'single'; (уже определено выше)
    const isDoubleDoor = construction.includes('double');
    const facadeGapM = cabinetData.facadeGap ?? (3 / 1000);
    const doorOffsetTopM = (cabinetData.doorOffsetTop ?? 0) / 1000;
    const doorOffsetBottomM = (cabinetData.doorOffsetBottom ?? 0) / 1000;
    const facadeWidth = width - facadeGapM;

    // 1. Базовый материал (из набора)
    //const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
    const { material: baseFacadeMaterial, thickness: baseTh } = MaterialManager.getMaterial(facadeSet);

    // 2. Определение стратегии
    let buildStrategy = 'flat';
    let profileData = null;
    let finalMaterial = baseFacadeMaterial;
    let finalThickness = baseTh;

    // А. Override (локальный выбор алюминия)
    if (cabinetData.facadeOverride && cabinetData.facadeOverride.startsWith('aluminum')) {
        buildStrategy = 'aluminum';
        // finalThickness = ... (для алюминия своя толщина)
    } 
    // Б. Набор (фрезеровка)
    else if (window.facadeOptionsData['mdf_milled']) {
         const decor = window.facadeOptionsData['mdf_milled'].decors.find(d => d.value === facadeSet?.texture);
         if (decor && decor.profileType === '9slice') {
             buildStrategy = 'milled';
             profileData = decor;
         }
    }

    // 3. Подготовка списка фасадов (размеры и смещения)
    const facadesToCreate = [];

    // Верхний фасад
    const topFacadeHeightM = (cabinetData.liftTopFacadeHeight ?? 240) / 1000;
    if (facadeWidth > 0 && topFacadeHeightM > 0) {
        // Позиция Y: Верхняя грань = H/2 - OffsetTop. Центр = Верх - H/2.
        const facadeCenterY = (height / 2 - doorOffsetTopM) - topFacadeHeightM / 2;
        facadesToCreate.push({ 
            height: topFacadeHeightM, 
            y: facadeCenterY, 
            name: 'topFacade_lift' 
        });
    }

    // Нижний фасад
    if (isDoubleDoor) {
        const totalFacadeSpace = height - doorOffsetTopM - doorOffsetBottomM;
        const bottomFacadeHeightM = totalFacadeSpace - topFacadeHeightM - facadeGapM;
        if (facadeWidth > 0 && bottomFacadeHeightM > 0.05) {
            // Позиция Y: Нижняя грань = -H/2 + OffsetBot. Центр = Низ + H/2.
            const facadeCenterY = (-height / 2 + doorOffsetBottomM) + bottomFacadeHeightM / 2;
            facadesToCreate.push({ 
                height: bottomFacadeHeightM, 
                y: facadeCenterY, 
                name: 'bottomFacade_lift' 
            });
        }
    }

    // 4. Генерация в цикле
    facadesToCreate.forEach(facadeInfo => {
        const container = new THREE.Group();
        container.userData.cabinetUUID = cabinetUUID;
        
        if (buildStrategy === 'milled') {
            // === ФРЕЗЕРОВКА ===
            const z = depth / 2 + finalThickness / 2;
            container.position.set(0, facadeInfo.y, z); // X=0 (центр)
            group.add(container);

            createMilledFacade(facadeWidth, facadeInfo.height, profileData, finalMaterial.clone())
                .then(mesh => {
                    container.add(mesh);
                    mesh.updateMatrixWorld();
                })
                .catch(e => console.error(e));

        } else if (buildStrategy === 'aluminum') {
            // === АЛЮМИНИЙ ===
            // const mesh = createZ1FrameFacade(facadeWidth, facadeInfo.height, ...);
            // container.add(mesh);
            // group.add(container);

        } else {
            // === ПЛОСКИЙ ===
            const z = depth / 2 + finalThickness / 2;
            const mesh = createPanel(
                facadeWidth, facadeInfo.height, finalThickness,
                finalMaterial.clone(), 'frontal', facadeInfo.name
            );

            if (mesh) {
                if (mesh.material.map) {
                    MaterialManager.applyTextureTransform(
                        mesh.material, cabinetData.textureDirection || 'vertical',
                        facadeWidth, facadeInfo.height
                    );
                }
                mesh.position.set(0, facadeInfo.y, z);
                mesh.userData.cabinetUUID = cabinetUUID;
                group.add(mesh);
            }
        }
    });
    
    console.log(` - Фасады подъемника созданы: ${facadesToCreate.length} шт. (${buildStrategy})`);

    // ==================================================================
    // 7. Спейсеры
    // ==================================================================
    const spacersType = cabinetData.spacers || 'none';
    const isOverlayBottomForSpacer = (cabinetData.bottomConstruction || 'inset').includes('overlay');

    // --- Узкий спейсер для НАКЛАДНОГО дна ---
    if (spacersType.includes('narrow') && isOverlayBottomForSpacer) {
        // 7.1. Расчет размеров и параметров
        const doorOffsetTopM = (cabinetData.doorOffsetTop ?? 0) / 1000;
        const doorOffsetBottomM = (cabinetData.doorOffsetBottom ?? 0) / 1000;
        
        // Получаем материал и толщину фасада (она же - толщина спейсера)
        const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
        const { material: baseFacadeMaterial, thickness: facadeThicknessM } = MaterialManager.getMaterial(facadeSet);
        
        const spacerHeight = height - doorOffsetTopM - doorOffsetBottomM;
        const spacerWidth = 80 / 1000; // Это будет "ширина" нашего Shape (вдоль оси X контура)
        const spacerThickness = facadeThicknessM; // Это будет "глубина" экструзии


        if (spacerHeight > 0 && spacerWidth > 0) {
            // 7.2. Создание Shape и экструзия
            const spacerShape = new THREE.Shape();
            spacerShape.moveTo(0, 0.05);          
            spacerShape.lineTo(spacerWidth - spacerThickness - bottomFrontOffsetM, 0.05);
            spacerShape.lineTo(spacerWidth - spacerThickness - bottomFrontOffsetM, 0);
            spacerShape.lineTo(spacerWidth, 0);
            spacerShape.lineTo(spacerWidth, spacerHeight);
            spacerShape.lineTo(0, spacerHeight);
            spacerShape.closePath();

            const extrudeSettings = {
                steps: 1,
                depth: spacerThickness, // Глубина выдавливания = толщина
                bevelEnabled: false
            };

            const spacerPanel = createExtrudedPanel(
                spacerShape, extrudeSettings, baseFacadeMaterial.clone(), 'frontal', 
                `spacer_narrow_${spacersType.includes('left') ? 'left' : 'right'}`
            );

            if (spacerPanel) {
                // 7.3. Позиционирование
                // Геометрия создана в плоскости XY. Нам нужно повернуть ее и сдвинуть.
                spacerPanel.rotation.y = -Math.PI / 2; // Поворачиваем на -90 градусов, чтобы она встала вдоль оси Z

                // Центр по Y рассчитывается так же, как у фасада
                const spacerCenterY = - height / 2 + doorOffsetBottomM;
                
                let spacerCenterX;

                if (spacersType.includes('left')) {
                    // Левый спейсер: правая грань = левая грань шкафа
                    // Правая грань повернутого спейсера = center.x + thickness/2
                    // Левая грань шкафа = -width/2
                    spacerCenterX = -width / 2;
                } else { // правый
                    // Правый спейсер: левая грань = правая грань шкафа
                    // Левая грань повернутого спейсера = center.x - thickness/2
                    // Правая грань шкафа = width/2
                    spacerCenterX = width / 2 + spacerThickness;
                }
                
                // Центр по Z: передняя грань спейсера = передняя грань фасада
                const facadeFrontFaceZ = depth / 2 + facadeThicknessM;
                // Передняя грань повернутого спейсера = center.z + width/2
                const spacerCenterZ = facadeFrontFaceZ - spacerWidth / 1;
                
                spacerPanel.position.set(spacerCenterX, spacerCenterY, spacerCenterZ);
                spacerPanel.userData.cabinetUUID = cabinetUUID;
                
                // 7.4. Коррекция UV-координат (адаптированный ваш код)
                MaterialManager.applyTextureToExtruded(
                    spacerPanel,
                    'vertical', // <-- Передаем направление ИЗ ФАСАДА
                    spacerWidth,             // Ширина Shape
                    spacerHeight                  // Высота Shape
                );

                group.add(spacerPanel);
                console.log(` - Узкий спейсер (накладной) создан.`);
            }
        }
    } else if (spacersType.includes('narrow') && !isOverlayBottomForSpacer) {
        // --- Узкий спейсер для ВКЛАДНОГО дна ---

        // 7.1. Расчет общих параметров
        const { material: baseFacadeMaterial, thickness: facadeThicknessM } = MaterialManager.getMaterial(facadeSet);
        const doorOffsetTopM = (cabinetData.doorOffsetTop ?? 0) / 1000;
        const doorOffsetBottomM = (cabinetData.doorOffsetBottom ?? 0) / 1000;

        // --- 7.2. Создание и позиционирование 1-й детали (Вертикальная планка) ---
        const verticalPartHeight = height - doorOffsetTopM - doorOffsetBottomM;
        const verticalPartWidth = facadeThicknessM; // Ширина по X
        const verticalPartDepth = 80 / 1000;         // Глубина по Z

        const verticalSpacerPart = createPanel(verticalPartWidth, verticalPartHeight, verticalPartDepth, baseFacadeMaterial.clone(), 'vertical', 'spacer_inset_vertical');
        
        if (verticalSpacerPart) {
            let partCenterX;
            if (spacersType.includes('left')) {
                // Левый: правая грань = левая грань шкафа
                partCenterX = -width / 2 - verticalPartWidth / 2;
            } else { // правый
                // Правый: левая грань = правая грань шкафа
                partCenterX = width / 2 + verticalPartWidth / 2;
            }

            // По Y позиция как у фасада
            const partCenterY = (doorOffsetBottomM - doorOffsetTopM) / 2;
            
            // По Z передняя грань = передняя грань фасада
            const facadeFrontFaceZ = depth / 2 + facadeThicknessM;
            const partCenterZ = facadeFrontFaceZ - verticalPartDepth / 2;

            verticalSpacerPart.position.set(partCenterX, partCenterY, partCenterZ);
            verticalSpacerPart.userData.cabinetUUID = cabinetUUID;
            // Применяем трансформацию текстуры
            const verticalMaterial = verticalSpacerPart.material;
            if (verticalMaterial.map && verticalMaterial.map.isTexture) {
                const transformedTexture = MaterialManager.applyTextureTransform(
                    verticalMaterial.map,
                    cabinetData.textureDirection || 'vertical',
                    verticalPartDepth,
                    verticalPartHeight
                );
                verticalMaterial.map = transformedTexture;
                verticalMaterial.needsUpdate = true;
            }
            group.add(verticalSpacerPart);
        }
        
        // --- 7.3. Создание и позиционирование 2-й детали (Горизонтальная планка) ---
        const horizontalPartHeight = 80 / 1000;
        const horizontalPartWidth = facadeThicknessM;
        const horizontalPartDepth = depth + facadeThicknessM - (80 / 1000); // 80мм - глубина верт. планки

        const horizontalSpacerPart = createPanel(horizontalPartWidth, horizontalPartHeight, horizontalPartDepth, baseFacadeMaterial.clone(), 'vertical', 'spacer_inset_horizontal');

        if (horizontalSpacerPart) {
            let partCenterX;
            if (spacersType.includes('left')) {
                partCenterX = -width / 2 - horizontalPartWidth / 2;
            } else { // правый
                partCenterX = width / 2 + horizontalPartWidth / 2;
            }
            
            // По Y: нижняя грань = нижняя грань шкафа
            const partCenterY = -height / 2 + horizontalPartHeight / 2;
            
            // По Z: задняя грань = задняя грань шкафа
            const requiredRearFaceZ = -depth / 2;
            const currentRearFaceZ = -horizontalPartDepth / 2;
            const partCenterZ = requiredRearFaceZ - currentRearFaceZ;
            
            horizontalSpacerPart.position.set(partCenterX, partCenterY, partCenterZ);
            horizontalSpacerPart.userData.cabinetUUID = cabinetUUID;
            // Применяем трансформацию текстуры
            const horizontalMaterial = horizontalSpacerPart.material;
            if (horizontalMaterial.map && horizontalMaterial.map.isTexture) {
                const transformedTexture = MaterialManager.applyTextureTransform(
                    horizontalMaterial.map,
                    cabinetData.textureDirection || 'vertical',
                    horizontalPartDepth,
                    horizontalPartHeight
                );
                horizontalMaterial.map = transformedTexture;
                horizontalMaterial.needsUpdate = true;
            }
            group.add(horizontalSpacerPart);
        }

        console.log(` - Узкий спейсер (вкладной, 2 части) создан.`);
    } else if (spacersType.includes('wide')) {
        // --- Широкий спейсер ---

        // --- 7.1. Держатель спейсера (из материала корпуса) ---
        
        // 7.1.1. Расчет размеров и параметров
        const doorOffsetTopM = (cabinetData.doorOffsetTop ?? 0) / 1000;
        const doorOffsetBottomM = (cabinetData.doorOffsetBottom ?? 0) / 1000;

        const holderHeight = height - panelThickness - doorOffsetTopM;
        const holderWidth = panelThickness; // Ширина по X
        const holderDepth = 60 / 1000;      // Глубина по Z

        // 7.1.2. Создание детали
        // Используем bodyMaterial, т.к. держатель из материала корпуса
        const spacerHolder = createPanel(holderWidth, holderHeight, holderDepth, bodyMaterial, 'vertical', 'spacer_holder');

        if (spacerHolder) {
            // 7.1.3. Позиционирование
            let holderCenterX;
            if (spacersType.includes('left')) {
                // Левый: правая грань = левая грань шкафа
                holderCenterX = -width / 2 - holderWidth / 2;
            } else { // Правый
                // Правый: левая грань = правая грань шкафа
                holderCenterX = width / 2 + holderWidth / 2;
            }

            // По Y: нижняя грань = нижняя грань шкафа + толщина дна
            // Нижняя грань шкафа = -height/2. Низ дна (вкладного) = -height/2. Верх дна (вкладного) = -height/2 + panelThickness.
            // Нам нужно, чтобы держатель стоял НА дне.
            // Поэтому его нижняя грань должна быть на уровне верха дна.
            const requiredBottomFaceY = -height / 2 + panelThickness;
            const holderCenterY = requiredBottomFaceY + holderHeight / 2;
            
            // По Z: передняя грань = передняя грань шкафа
            const requiredFrontFaceZ = depth / 2;
            const holderCenterZ = requiredFrontFaceZ - holderDepth / 2;

            spacerHolder.position.set(holderCenterX, holderCenterY, holderCenterZ);
            spacerHolder.userData.cabinetUUID = cabinetUUID;
            group.add(spacerHolder);
        }
             
        console.log(` - Держатель для широкого спейсера создан.`);

        // --- 7.2. Фасадная часть спейсера (из материала фасада) ---
    
        // 7.2.1. Расчет размеров и параметров
        const spacerFacadeHeight = height - doorOffsetTopM - doorOffsetBottomM;
        const spacerWidthMm = cabinetData.spacerWidth || 60;
        const spacerFacadeWidth = (spacerWidthMm - 1) / 1000;

        const { material: baseFacadeMaterial, thickness: facadeThicknessM } = MaterialManager.getMaterial(facadeSet);
        const spacerFacadeDepth = facadeThicknessM;

        // 7.2.2. Определение стратегии (Фрезеровка или Плоский)
        let isMilled = false;
        let profileData = null;
        
        if (window.facadeOptionsData['mdf_milled']) {
             const decor = window.facadeOptionsData['mdf_milled'].decors.find(d => d.value === facadeSet?.texture);
             if (decor && decor.profileType === '9slice') {
                 isMilled = true;
                 profileData = decor;
             }
        }

        // 7.2.3. Позиционирование (общие координаты центра)
        let facadeCenterX;
        const oneMm = 1 / 1000;
        if (spacersType.includes('left')) {
            // правая грань = левая грань шкафа - 1мм
            const requiredRightFaceX = -width / 2 - oneMm;
            facadeCenterX = requiredRightFaceX - spacerFacadeWidth / 2;
        } else { // Правый
            // левая грань = правая грань шкафа + 1мм
            const requiredLeftFaceX = width / 2 + oneMm;
            facadeCenterX = requiredLeftFaceX + spacerFacadeWidth / 2;
        }

        const requiredBottomFaceY = -height / 2 + doorOffsetBottomM;
        const facadeCenterY = requiredBottomFaceY + spacerFacadeHeight / 2;
        
        const requiredRearFaceZ = depth / 2;
        const facadeCenterZ = requiredRearFaceZ + spacerFacadeDepth / 2;


        // 7.2.4. Создание
        if (isMilled) {
            // === ВАРИАНТ 1: ФРЕЗЕРОВКА ===
            // Создаем контейнер
            const spacerContainer = new THREE.Group();
            spacerContainer.position.set(facadeCenterX, facadeCenterY, facadeCenterZ);
            spacerContainer.userData.cabinetUUID = cabinetUUID;
            group.add(spacerContainer);

            // Запускаем билдер
            // FacadeBuilder сам решит (LOD), делать ли сложный профиль или заглушку,
            // если спейсер слишком узкий.
            createMilledFacade(spacerFacadeWidth, spacerFacadeHeight, profileData, baseFacadeMaterial.clone())
                .then(mesh => {
                    spacerContainer.add(mesh);
                    mesh.updateMatrixWorld();
                })
                .catch(e => console.error("Ошибка спейсера:", e));

        } else {
            // === ВАРИАНТ 2: ПЛОСКИЙ ===
            const spacerFacade = createPanel(spacerFacadeWidth, spacerFacadeHeight, spacerFacadeDepth, baseFacadeMaterial.clone(), 'frontal', 'spacer_facade');

            if (spacerFacade) {
                spacerFacade.position.set(facadeCenterX, facadeCenterY, facadeCenterZ);
                spacerFacade.userData.cabinetUUID = cabinetUUID;

                const facadeMaterial = spacerFacade.material;
                if (facadeMaterial.map && facadeMaterial.map.isTexture) {
                    MaterialManager.applyTextureTransform(
                        facadeMaterial,
                        cabinetData.textureDirection || 'vertical',
                        spacerFacadeWidth,
                        spacerFacadeHeight
                    );
                }
                group.add(spacerFacade);
            }
        }
        console.log(` - Фасадная часть для широкого спейсера создана (${isMilled ? 'Milled' : 'Flat'}).`);
    }

    // ==================================================================
    // 8. Гола-профиль
    // ==================================================================
    if ((cabinetData.bottomConstruction || 'inset').includes('Gola')) {
        
        // 8.1. Расчет размеров и параметров
        const golaMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xAAAAAA, metalness: 0.8, roughness: 0.4, name: "GolaMaterial"
        });
        
        let profileLength;
        let profileCenterX;

        if (isOverlayBottomForSpacer) { // Накладное дно
            if (spacersType.includes('wide')) {
                const spacerWidthMm = cabinetData.spacerWidth || 60;
                profileLength = width + (spacerWidthMm / 1000);
            } else {
                profileLength = width;
            }
            
            // Позиционирование для накладного
            if (spacersType.includes('left')) {
                // правая грань = правая грань шкафа
                profileCenterX = width / 2 - profileLength / 2;
            } else { // правый спейсер или нет спейсера
                // левая грань = левая грань шкафа
                profileCenterX = -width / 2 + profileLength / 2;
            }

        } else { // Вкладное дно
            profileLength = width - 2 * panelThickness;
            // левая грань = левая грань шкафа + толщина
            profileCenterX = -width / 2 + panelThickness + profileLength / 2;
        }
        
        // 8.2. Создание детали
        const golaProfile = createUpperGolaProfileMesh(profileLength, golaMaterial, cabinetUUID);

        if (golaProfile) {
            // 8.3. Позиционирование
            // Геометрия создана в плоскости XY, ее нужно повернуть и сдвинуть.
            golaProfile.rotation.y = -Math.PI / 2; // Поворачиваем, чтобы XY-плоскость стала ZY-плоскостью

            // По Y: центр = нижняя грань шкафа + толщина дна / 2
            // Это не совсем верно. Нижняя грань дна = -height/2. Верхняя = -height/2 + panelThickness.
            // Профиль должен стоять НА дне, его нижняя грань = верхняя грань дна.
            const profileHeight = 20 / 1000; // Высота сечения
            const requiredBottomFaceY = -height / 2 + panelThickness / 2;
            const profileCenterY = requiredBottomFaceY - profileHeight / 2;
            
            // По Z: задняя грань = передняя грань шкафа - отступ дна спереди
            const bottomFrontOffsetM = (cabinetData.bottomFrontOffset ?? 20) / 1000;
            const profileDepth = 20 / 1000; // Глубина сечения
            const requiredRearFaceZ = depth / 2 - bottomFrontOffsetM;
            const profileCenterZ = requiredRearFaceZ; // Pivot point у Shape в (0,0), поэтому так
            
            golaProfile.position.set(profileCenterX, profileCenterY, profileCenterZ);
            
            group.add(golaProfile);
            console.log(` - Верхний Гола-профиль создан (Длина: ${Math.round(profileLength*1000)}мм).`);
        }
    }

    return group;
}

/**
 * Главная функция для создания детализированного верхнего распашного шкафа with hood.
 * @param {object} cabinetData - Объект данных шкафа.
 * @param {object} kitchenGlobalParams - Глобальные параметры кухни.
 * @param {object} MaterialManager - Менеджер материалов.
 * @param {function} getPanelThickness - Функция для получения толщины панели.
 * @returns {THREE.Group | null}
 */
export function createDetailedSwingHoodGeometry(cabinetData, kitchenGlobalParams, MaterialManager, getPanelThickness) {
    if (!cabinetData) {
        console.error("createDetailedUpperSwingGeometry: cabinetData не предоставлен.");
        return null;
    }

    const group = new THREE.Group();
    group.userData.isDetailedCabinet = true;
    group.userData.objectType = 'cabinet';

    // --- Параметры ---
    const { width, height, depth } = cabinetData;
    const cabinetUUID = cabinetData.mesh?.uuid; // Безопасно получаем UUID

    // Получаем толщину материала (ЛДСП). Предположим, она глобальная.
    // Если она зависит от материала, логику нужно будет уточнить.
    //const panelThickness = 16 / 1000; // 16 мм, как стандарт. Замените на вашу переменную, если есть.
    
    // --- Материалы ---
    const bodyMaterial = MaterialManager.getBodyMaterial(cabinetData);
    const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
    const { material: facadeMaterial, thickness: facadeThickness } = MaterialManager.getMaterial(facadeSet);

    // ==================================================================
    // 1. Боковины (Левая и Правая)
    // ==================================================================

    // 1.1. Расчет размеров и параметров
    const bottomConstruction = cabinetData.bottomConstruction || 'inset';
    const panelThickness = getPanelThickness(); // Используем переданную функцию

    // --- Общие параметры для обеих боковин ---
    let sidePanelHeight;
    let sidePanelCenterY;

    if (bottomConstruction.includes('overlay')) {
        sidePanelHeight = height - panelThickness;
        sidePanelCenterY = (height / 2) - (sidePanelHeight / 2);
    } else { // 'inset' и по умолчанию
        sidePanelHeight = height;
        sidePanelCenterY = 0;
    }
    const sidePanelThicknessAsWidth = panelThickness;

    // --- Уникальные параметры для ЛЕВОЙ боковины ---
    const leftSideOverhangRearMm = cabinetData.leftSideOverhangRear ?? 0;
    const leftSideOverhangRearM = leftSideOverhangRearMm / 1000;
    const leftSideDepth = depth + leftSideOverhangRearM; // Новая глубина
    // Сдвигаем центр по Z назад на половину выступа, чтобы передняя грань осталась на месте
    const leftSideCenterZ = -leftSideOverhangRearM / 2; 

    // --- Уникальные параметры для ПРАВОЙ боковины ---
    const rightSideOverhangRearMm = cabinetData.rightSideOverhangRear ?? 0;
    const rightSideOverhangRearM = rightSideOverhangRearMm / 1000;
    const rightSideDepth = depth + rightSideOverhangRearM; // Новая глубина
    // Сдвигаем центр по Z назад на половину выступа
    const rightSideCenterZ = -rightSideOverhangRearM / 2;

    // 1.2. Создание деталей
    const leftSide = createPanel(sidePanelThicknessAsWidth, sidePanelHeight, leftSideDepth, bodyMaterial, 'vertical', 'leftSide');
    const rightSide = createPanel(sidePanelThicknessAsWidth, sidePanelHeight, rightSideDepth, bodyMaterial, 'vertical', 'rightSide');

    // 1.3. Позиционирование деталей
    if (leftSide) {
        const leftSideCenterX = -width / 2 + panelThickness / 2;
        leftSide.position.set(leftSideCenterX, sidePanelCenterY, leftSideCenterZ); // Используем новую Z-координату
        leftSide.userData.cabinetUUID = cabinetUUID;

        MaterialManager.applyTexture(leftSide, cabinetData.textureDirection, 'vertical');
        group.add(leftSide);
    }

    if (rightSide) {
        const rightSideCenterX = width / 2 - panelThickness / 2;
        rightSide.position.set(rightSideCenterX, sidePanelCenterY, rightSideCenterZ); // Используем новую Z-координату
        rightSide.userData.cabinetUUID = cabinetUUID;

        MaterialManager.applyTexture(rightSide, cabinetData.textureDirection, 'vertical');
        group.add(rightSide);
    }

    console.log(` - Боковины созданы (Конструкция дна: ${bottomConstruction}, Выступ Л/П: ${leftSideOverhangRearMm}мм / ${rightSideOverhangRearMm}мм)`);
    
    // ==================================================================
    // 2. Дно
    // ==================================================================

    // 2.1. Расчет параметров для дна
    //const bottomConstruction = cabinetData.bottomConstruction || 'inset';
    const spacers = cabinetData.spacers || 'none';
    const bottomFrontOffsetMm = cabinetData.bottomFrontOffset ?? 0;
    const bottomOverhangRearMm = cabinetData.bottomOverhangRear ?? 0;
    // --- НОВЫЙ ПАРАМЕТР ---
    const backPanelOffsetMm = cabinetData.backPanelOffset ?? 0;

    const bottomFrontOffsetM = bottomFrontOffsetMm / 1000;
    const bottomOverhangRearM = bottomOverhangRearMm / 1000;
    const backPanelOffsetM = backPanelOffsetMm / 1000;

    let bottomPanelWidth;
    let bottomPanelCenterX = 0;
    const bottomPanelThickness = panelThickness;
    const bottomPanelCenterY = -height / 2 + bottomPanelThickness / 2;

    if (bottomConstruction.includes('inset')) {
        // --- Логика для ВКЛАДНОГО дна ---
        bottomPanelWidth = width - 2 * panelThickness;     
    } else { // --- Логика для НАКЛАДНОГО дна ('overlay') ---
        bottomPanelWidth = width; // Базовая ширина
        // ... (весь блок со спейсерами остается БЕЗ ИЗМЕНЕНИЙ) ...
        if (spacers !== 'none') {
            if (spacers.includes('narrow')) {
                const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
                const { thickness: facadeThicknessM } = MaterialManager.getMaterial(facadeSet);
                bottomPanelWidth += facadeThicknessM;
            } else if (spacers.includes('wide')) {
                const spacerWidthMm = cabinetData.spacerWidth || 60;
                const spacerWidthM = spacerWidthMm / 1000;
                bottomPanelWidth += spacerWidthM;
            }
            const deltaWidth = bottomPanelWidth - width;
            if (spacers.includes('left')) {
                const requiredRightFaceX = width / 2;
                const currentRightFaceX = bottomPanelWidth / 2;
                bottomPanelCenterX = requiredRightFaceX - currentRightFaceX;
            } else if (spacers.includes('right')) {
                const requiredLeftFaceX = -width / 2;
                const currentLeftFaceX = -bottomPanelWidth / 2;
                bottomPanelCenterX = requiredLeftFaceX - currentLeftFaceX;
            }
        }
    }

        // Определяем глубину (копипаст из swingUpper)
    const bottomPanelDepth = (bottomConstruction.includes('inset'))
        ? depth - bottomFrontOffsetM + bottomOverhangRearM - backPanelOffsetM
        : depth - bottomFrontOffsetM + bottomOverhangRearM;


    // 2.2. Создание и позиционирование
    const bottomPanel = createPanel(bottomPanelWidth, bottomPanelThickness, bottomPanelDepth, bodyMaterial, 'horizontal', 'bottomPanel_hood');
    if (bottomPanel) {
        const requiredFrontFaceZ = depth / 2 - bottomFrontOffsetM;
        const bottomPanelCenterZ = requiredFrontFaceZ - bottomPanelDepth / 2;
        
        bottomPanel.position.set(bottomPanelCenterX, bottomPanelCenterY, bottomPanelCenterZ);
        bottomPanel.userData.cabinetUUID = cabinetUUID;
        
        MaterialManager.applyTexture(bottomPanel, 'horizontal', 'horizontal'); // <-- Исправленный вызов
        
        group.add(bottomPanel);
        console.log(` - Дно (для вытяжки) создано.`);
    }
    

    // ==================================================================
    // 3. Крыша (с вырезом под воздуховод)
    // ==================================================================

    // 3.1. Расчет размеров и параметров
    //const topConstruction = cabinetData.topConstruction || 'inset'; // Пока не используется, но оставим
    
    // Длина и глубина крыши (размеры для Shape)
    const topPanelLength = width - 2 * panelThickness;
    const topPanelDepth = depth - backPanelOffsetM;
    const topPanelThickness = panelThickness;

    // 3.2. Создание Shape с круглым вырезом
    // Внешний прямоугольный контур
    const topPanelShape = new THREE.Shape();
    topPanelShape.moveTo(0, 0); // задний-левый угол Shape
    topPanelShape.lineTo(topPanelLength, 0); // задний-правый
    topPanelShape.lineTo(topPanelLength, topPanelDepth); // передний-правый
    topPanelShape.lineTo(0, topPanelDepth); // передний-левый
    
    // Параметры выреза
    const hoodDuctDiameterM = (cabinetData.hoodDuctDiameter || 150) / 1000;
    const hoodOffsetXM = (cabinetData.hoodOffsetX || (width / 2)) / 1000;
    
    const holeRadius = (hoodDuctDiameterM + 30 / 1000) / 2;
    // Координаты центра отверстия в системе координат Shape
    const holeCenterX = hoodOffsetXM - panelThickness;
    const holeCenterY = topPanelDepth - (110 / 1000); // Отступ 110мм от переднего края

    // Создаем "дырку" (Path)
    const holePath = new THREE.Path();
    holePath.absarc(holeCenterX, holeCenterY, holeRadius, 0, Math.PI * 2, true); // `true` для против часовой стрелки

    // Добавляем дырку к основному Shape
    topPanelShape.holes.push(holePath);

    // 3.3. Создание детали через экструзию
    const extrudeSettings = {
        depth: topPanelThickness,
        bevelEnabled: false
    };
    const topPanel = createExtrudedPanel(topPanelShape, extrudeSettings, bodyMaterial, 'horizontal', 'topPanel_hood');

    // 3.4. Позиционирование
    if (topPanel) {
        // Поворачиваем, чтобы Shape лег в плоскость XZ
        topPanel.rotation.x = -Math.PI / 2;
        
        // Позиционируем так, чтобы левый-задний угол Shape совпал с нужной точкой
        const posX = -width / 2 + panelThickness; // Левая грань
        const posY = height / 2 - topPanelThickness; // Низ крыши
        const posZ = depth / 2; // Задняя грань

        topPanel.position.set(posX, posY, posZ);
        
        topPanel.userData.cabinetUUID = cabinetUUID;
        
        // Применяем текстуру
        MaterialManager.applyTextureToExtruded(topPanel, 'horizontal', topPanelLength, topPanelDepth);
        
        group.add(topPanel);
        console.log(` - Крыша с вырезом создана.`);
    }

    // ==================================================================
    // 4. Задняя стенка (ДВП/ХДФ)
    // ==================================================================
    const hasBackPanel = cabinetData.backPanel || 'yes';

    if (hasBackPanel === 'yes') {
        // 4.1. Расчет размеров и параметров
        const backPanelThickness = 3 / 1000;
        const backPanelMaterial = new THREE.MeshStandardMaterial({
            color: 0xf0f0f0, // Светло-серый
            roughness: 0.9,
            metalness: 0.0,
            name: "BackPanelMaterial"
        });

        // --- Расчет ширины и отступов по X ---
        const leftSideOverhangM = (cabinetData.leftSideOverhangRear ?? 0) / 1000;
        const rightSideOverhangM = (cabinetData.rightSideOverhangRear ?? 0) / 1000;

        const backPanelOffsetX_Left = (leftSideOverhangM > 0) ? (10 / 1000) : (2 / 1000);
        const backPanelOffsetX_Right = (rightSideOverhangM > 0) ? (10 / 1000) : (2 / 1000);
        
        const backPanelWidth = width - backPanelOffsetX_Left - backPanelOffsetX_Right;

        // --- Расчет высоты и отступов по Y ---
        const bottomOverhangRearM = (cabinetData.bottomOverhangRear ?? 0) / 1000;
        const isOverlayBottom = (cabinetData.bottomConstruction || 'inset').includes('overlay');

        const backPanelOffsetY_Top = 2 / 1000;
        let backPanelOffsetY_Bottom;

        if (bottomOverhangRearM > 0) {
            backPanelOffsetY_Bottom = 10 / 1000;
        } else if (isOverlayBottom && backPanelOffsetM > 0) {
            backPanelOffsetY_Bottom = 10 / 1000;
        } else {
            backPanelOffsetY_Bottom = 2 / 1000;
        }
        
        const backPanelHeight = height - backPanelOffsetY_Top - backPanelOffsetY_Bottom;

        // 4.2. Создание детали
        const backPanel = createPanel(backPanelWidth, backPanelHeight, backPanelThickness, backPanelMaterial, 'frontal', 'backPanel');

        // 4.3. Позиционирование детали
        if (backPanel) {
            // По X: левая грань ЗС = левая грань шкафа + отступ слева
            const requiredLeftFaceX = -width / 2 + backPanelOffsetX_Left;
            const currentLeftFaceX = -backPanelWidth / 2;
            const backPanelCenterX = requiredLeftFaceX - currentLeftFaceX;

            // По Y: верхняя грань ЗС = верхняя грань шкафа - отступ сверху
            const requiredTopFaceY = height / 2 - backPanelOffsetY_Top;
            const currentTopFaceY = backPanelHeight / 2;
            const backPanelCenterY = requiredTopFaceY - currentTopFaceY;
            
            // По Z: передняя грань ЗС = задняя грань шкафа + углубление ЗС
            // (задняя грань шкафа = -depth/2, углубление смещает ВПЕРЕД)
            const requiredFrontFaceZ = -depth / 2 + backPanelOffsetM;
            const currentFrontFaceZ = backPanelThickness / 2;
            const backPanelCenterZ = requiredFrontFaceZ - currentFrontFaceZ;
            
            backPanel.position.set(backPanelCenterX, backPanelCenterY, backPanelCenterZ);
            backPanel.userData.cabinetUUID = cabinetUUID;
            group.add(backPanel);
            
            console.log(` - Задняя стенка создана (Ш: ${Math.round(backPanelWidth*1000)}, В: ${Math.round(backPanelHeight*1000)})`);
        }
    }

    // ==================================================================
    // 4. Полка над вытяжкой
    // ==================================================================

    // 4.1. Расчет размеров и параметров
    const hoodShelfLength = width - 2 * panelThickness;
    const hoodShelfDepth = depth - backPanelOffsetM - (2 / 1000); // Глубина с пазом и отступом
    const hoodShelfThickness = panelThickness;

    if (hoodShelfLength > 0 && hoodShelfDepth > 0) {
        // 4.2. Создание Shape с прямоугольным скругленным вырезом
        const hoodShelfShape = new THREE.Shape();
        hoodShelfShape.moveTo(0, 0);
        hoodShelfShape.lineTo(hoodShelfLength, 0);
        hoodShelfShape.lineTo(hoodShelfLength, hoodShelfDepth);
        hoodShelfShape.lineTo(0, hoodShelfDepth);

        // Параметры выреза
        const hoodDuctDiameterM = (cabinetData.hoodDuctDiameter || 150) / 1000;
        const hoodOffsetXM = (cabinetData.hoodOffsetX || (width / 2)) / 1000;
        
        const holeWidth = hoodDuctDiameterM + (40 / 1000);
        const holeHeight = hoodDuctDiameterM + (30 / 1000);
        const holeRadius = 8 / 1000;
        
        // Центр отверстия (такой же, как у крыши)
        const holeCenterX = hoodOffsetXM - panelThickness;
        const holeCenterY_shape = hoodShelfDepth - (110 / 1000);
        
        // Координаты углов прямоугольника выреза
        const minX = holeCenterX - holeWidth / 2;
        const maxX = holeCenterX + holeWidth / 2;
        const minY = holeCenterY_shape - holeHeight / 2;
        const maxY = holeCenterY_shape + holeHeight / 2;

        const holePath = new THREE.Path();
        // Рисуем прямоугольник со скругленными углами
        holePath.moveTo(minX + holeRadius, minY);
        holePath.lineTo(maxX - holeRadius, minY);
        holePath.quadraticCurveTo(maxX, minY, maxX, minY + holeRadius);
        holePath.lineTo(maxX, maxY - holeRadius);
        holePath.quadraticCurveTo(maxX, maxY, maxX - holeRadius, maxY);
        holePath.lineTo(minX + holeRadius, maxY);
        holePath.quadraticCurveTo(minX, maxY, minX, maxY - holeRadius);
        holePath.lineTo(minX, minY + holeRadius);
        holePath.quadraticCurveTo(minX, minY, minX + holeRadius, minY);
        
        hoodShelfShape.holes.push(holePath);
        
        // 4.3. Создание детали
        const extrudeSettings = { depth: hoodShelfThickness, bevelEnabled: false };
        const hoodShelf = createExtrudedPanel(hoodShelfShape, extrudeSettings, bodyMaterial, 'horizontal', 'hoodShelf');

        // 4.4. Позиционирование
        if (hoodShelf) {
            hoodShelf.rotation.x = -Math.PI / 2;
            
            // По Y: нижняя грань = низ шкафа + высота вытяжки + 10мм
            const hoodHeightM = (cabinetData.hoodHeight || 200) / 1000;
            const requiredBottomFaceY = -height / 2 + hoodHeightM + (10 / 1000);
            const posY = requiredBottomFaceY;
            
            // По X и Z позиционируем так же, как крышу/дно
            const posX = -width / 2 + panelThickness;
            const requiredFrontFaceZ = depth / 2 - (2 / 1000);
            const posZ = requiredFrontFaceZ;

            hoodShelf.position.set(posX, posY, posZ);
            hoodShelf.userData.cabinetUUID = cabinetUUID;
            
            MaterialManager.applyTextureToExtruded(hoodShelf, 'horizontal', hoodShelfLength, hoodShelfDepth);

            group.add(hoodShelf);
            console.log(` - Полка над вытяжкой создана.`);
        }
    }

    // ==================================================================
    // 5. Внутренние перегородки
    // ==================================================================

    // --- 5.1. Левая перегородка ---

    // 5.1.1. Расчет параметров и проверка условия
    const hoodWidthM = (cabinetData.hoodWidth || 560) / 1000;
    //const hoodOffsetXM = (cabinetData.hoodOffsetX || (width / 2)) / 1000;
    const hoodHeightM = (cabinetData.hoodHeight || 200) / 1000;

    const spaceToTheLeft = hoodOffsetXM - (hoodWidthM / 2);
    const leftPartitionRequiredSpace = (40 / 1000); // 40мм

    if (spaceToTheLeft > leftPartitionRequiredSpace) {
        // 5.1.2. Расчет размеров
        const partitionThickness = panelThickness; // Толщина по X
        const partitionHeight = hoodHeightM - panelThickness + (10 / 1000);
        const partitionDepth = depth - bottomFrontOffsetM - backPanelOffsetM - (4 / 1000) - panelThickness;

        // 5.1.3. Создание детали
        const leftPartition = createPanel(partitionThickness, partitionHeight, partitionDepth, bodyMaterial, 'vertical', 'leftPartition');
        
        if (leftPartition) {
            // 5.1.4. Позиционирование
            // По X: правая грань = левая грань шкафа + ...
            // ВНИМАНИЕ: Формула в ТЗ, вероятно, имела в виду `... - ширина вытяжки / 2`.
            const requiredRightFaceX = -width / 2 + hoodOffsetXM - (hoodWidthM / 2) - (1 / 1000);
            const partitionCenterX = requiredRightFaceX - partitionThickness / 2;

            // По Y: нижняя грань = низ шкафа + толщина дна
            const requiredBottomFaceY = -height / 2 + panelThickness;
            const partitionCenterY = requiredBottomFaceY + partitionHeight / 2;

            // По Z: передняя грань = передняя грань шкафа - отступ дна - 4мм
            const requiredFrontFaceZ = depth / 2 - bottomFrontOffsetM - (4 / 1000) - panelThickness;
            const partitionCenterZ = requiredFrontFaceZ - partitionDepth / 2;
            
            leftPartition.position.set(partitionCenterX, partitionCenterY, partitionCenterZ);
            leftPartition.userData.cabinetUUID = cabinetUUID;
            
            //MaterialManager.applyTexture(leftPartition, 'vertical', 'vertical');

            group.add(leftPartition);
            console.log(` - Левая перегородка создана.`);
        }
    } else {
        console.log(` - Левая перегородка не создана (недостаточно места).`);
    }
    // --- 5.2. Правая перегородка --

    // 5.2.1. Расчет условия
    const spaceToTheRight = (width - hoodOffsetXM) - (hoodWidthM / 2);
    const rightPartitionRequiredSpace = (40 / 1000);

    if (spaceToTheRight > rightPartitionRequiredSpace) {
        // 5.2.2. Расчет размеров (такие же, как у левой)
        const partitionThickness = panelThickness;
        const partitionHeight = hoodHeightM - panelThickness + (10 / 1000);
        const partitionDepth = depth - bottomFrontOffsetM - backPanelOffsetM - (4 / 1000) - panelThickness;

        // 5.2.3. Создание детали
        const rightPartition = createPanel(partitionThickness, partitionHeight, partitionDepth, bodyMaterial, 'vertical', 'rightPartition');
        
        if (rightPartition) {
            // 5.2.4. Позиционирование
            // По X: левая грань = ...
            const requiredLeftFaceX = -width / 2 + hoodOffsetXM + (hoodWidthM / 2) + (1 / 1000);
            const partitionCenterX = requiredLeftFaceX + partitionThickness / 2;

            // По Y и Z - так же, как у левой
            const requiredBottomFaceY = -height / 2 + panelThickness;
            const partitionCenterY = requiredBottomFaceY + partitionHeight / 2;
            
            const requiredFrontFaceZ = depth / 2 - bottomFrontOffsetM - (4 / 1000) - panelThickness;
            const partitionCenterZ = requiredFrontFaceZ - partitionDepth / 2;
            
            rightPartition.position.set(partitionCenterX, partitionCenterY, partitionCenterZ);
            rightPartition.userData.cabinetUUID = cabinetUUID;
            
            //MaterialManager.applyTexture(rightPartition, 'vertical');

            group.add(rightPartition);
            console.log(` - Правая перегородка создана.`);
        }
    } else {
        console.log(` - Правая перегородка не создана (недостаточно места).`);
    }

    // --- 5.3. Зашивка вытяжки ---

    // 5.3.1. Расчет "виртуальных" границ перегородок
    // Координата X левой грани левой перегородки
    const leftPartition_leftFaceX = -width / 2 + hoodOffsetXM - (hoodWidthM / 2) - (1 / 1000) - panelThickness;
    // Координата X правой грани правой перегородки
    const rightPartition_rightFaceX = -width / 2 + hoodOffsetXM + (hoodWidthM / 2) + (1 / 1000) + panelThickness;

    // 5.3.2. Расчет размеров зашивки
    const coverWidth = rightPartition_rightFaceX - leftPartition_leftFaceX;
    const coverHeight = hoodHeightM - panelThickness + (10 / 1000); // Такая же высота, как у перегородок
    const coverDepth = panelThickness; // Толщина

    if (coverWidth > 0.001) {
        // 5.3.3. Создание детали
        const hoodCover = createPanel(coverWidth, coverHeight, coverDepth, bodyMaterial, 'frontal', 'hoodCover');

        if (hoodCover) {
            // 5.3.4. Позиционирование
            // По X: левая грань = левая грань левой перегородки
            const coverCenterX = leftPartition_leftFaceX + coverWidth / 2;

            // По Y: нижняя грань = нижняя грань левой перегородки
            const requiredBottomFaceY = -height / 2 + panelThickness;
            const coverCenterY = requiredBottomFaceY + coverHeight / 2;

            // По Z: задняя грань = передняя грань левой перегородки
            const partitionFrontFaceZ = depth / 2 - bottomFrontOffsetM - (4 / 1000) - panelThickness;
            const coverCenterZ = partitionFrontFaceZ + coverDepth / 2;
            
            hoodCover.position.set(coverCenterX, coverCenterY, coverCenterZ);
            hoodCover.userData.cabinetUUID = cabinetUUID;
            
            // Эта деталь видима, поэтому текстурируем
            //MaterialManager.applyTexture(hoodCover, 'frontal');

            group.add(hoodCover);
            //console.log(` - Зашивка вытяжки создана.`);
        }
    } else {
        console.log(` - Зашивка вытяжки не создана (недостаточно места).`);
    }

    // ==================================================================
    // 6. Зашивка воздуховода
    // ==================================================================

    // --- 6.1. Левая перегородка воздуховода ---

    // 6.1.1. Расчет размеров
    const ductPartitionThickness = panelThickness; // Толщина по X
    const ductPartitionHeight = height - hoodHeightM - (panelThickness * 2) - (10 / 1000);
    const ductPartitionDepth = depth - backPanelOffsetM - (4 / 1000);

    if (ductPartitionHeight > 0 && ductPartitionDepth > 0) {
        // 6.1.2. Создание детали
        const leftDuctPartition = createPanel(ductPartitionThickness, ductPartitionHeight, ductPartitionDepth, bodyMaterial, 'vertical', 'leftDuctPartition');

        if (leftDuctPartition) {
            // 6.1.3. Позиционирование
            const hoodDuctDiameterM = (cabinetData.hoodDuctDiameter || 150) / 1000;
            
            // По X: правая грань = ...
            const requiredRightFaceX = -width / 2 + hoodOffsetXM - (hoodDuctDiameterM / 2) - (40 / 1000);
            const partitionCenterX = requiredRightFaceX - ductPartitionThickness / 2;
            
            // По Y: верхняя грань = верхняя грань шкафа - толщина крыши
            const requiredTopFaceY = height / 2 - panelThickness;
            const partitionCenterY = requiredTopFaceY - ductPartitionHeight / 2;

            // По Z: передняя грань = передняя грань шкафа - 4мм
            const requiredFrontFaceZ = depth / 2 - (4 / 1000);
            const partitionCenterZ = requiredFrontFaceZ - ductPartitionDepth / 2;

            leftDuctPartition.position.set(partitionCenterX, partitionCenterY, partitionCenterZ);
            leftDuctPartition.userData.cabinetUUID = cabinetUUID;
            
            MaterialManager.applyTexture(leftDuctPartition, 'vertical');
            
            group.add(leftDuctPartition);
            console.log(` - Левая перегородка воздуховода создана.`);
        }
    }

    // --- 6.2. Правая перегородка воздуховода ---
    if (ductPartitionHeight > 0 && ductPartitionDepth > 0) {
        // 6.2.1. Размеры такие же, как у левой. Создаем деталь.
        const rightDuctPartition = createPanel(ductPartitionThickness, ductPartitionHeight, ductPartitionDepth, bodyMaterial, 'vertical', 'rightDuctPartition');

        if (rightDuctPartition) {
            // 6.2.2. Позиционирование
            // По X: левая грань = ...
            const requiredLeftFaceX = -width / 2 + hoodOffsetXM + (hoodDuctDiameterM / 2) + (40 / 1000);
            const partitionCenterX = requiredLeftFaceX + ductPartitionThickness / 2;
            
            // По Y и Z - так же, как у левой
            const requiredTopFaceY = height / 2 - panelThickness;
            const partitionCenterY = requiredTopFaceY - ductPartitionHeight / 2;
            
            const requiredFrontFaceZ = depth / 2 - (4 / 1000);
            const partitionCenterZ = requiredFrontFaceZ - ductPartitionDepth / 2;

            rightDuctPartition.position.set(partitionCenterX, partitionCenterY, partitionCenterZ);
            rightDuctPartition.userData.cabinetUUID = cabinetUUID;
            
            MaterialManager.applyTexture(rightDuctPartition, 'vertical');
            
            group.add(rightDuctPartition);
            console.log(` - Правая перегородка воздуховода создана.`);
        }
    }

    // --- 6.3. Передняя зашивка воздуховода ---

    // 6.3.1. Расчет "виртуальных" границ перегородок
    const leftDuctPartition_rightFaceX = -width / 2 + hoodOffsetXM - (hoodDuctDiameterM / 2) - (40 / 1000);
    const rightDuctPartition_leftFaceX = -width / 2 + hoodOffsetXM + (hoodDuctDiameterM / 2) + (40 / 1000);

    // 6.3.2. Расчет размеров
    const ductCoverWidth = rightDuctPartition_leftFaceX - leftDuctPartition_rightFaceX;
    const ductCoverHeight = ductPartitionHeight; // Высота такая же, как у перегородок
    const ductCoverDepth = panelThickness; // Глубина = толщина

    if (ductCoverWidth > 0.001) {
        // 6.3.3. Создание детали
        const ductCover = createPanel(ductCoverWidth, ductCoverHeight, ductCoverDepth, bodyMaterial, 'frontal', 'ductCover');

        if (ductCover) {
            // 6.3.4. Позиционирование
            // По X: левая грань = правая грань левой перегородки
            const coverCenterX = leftDuctPartition_rightFaceX + ductCoverWidth / 2;
            
            // По Y: нижняя грань = нижняя грань левой перегородки
            const requiredBottomFaceY = height / 2 - panelThickness - ductCoverHeight; // Низ перегородки
            const coverCenterY = requiredBottomFaceY + ductCoverHeight / 2;
            
            // По Z: задняя грань = ...
            const requiredRearFaceZ = -depth / 2 + (110 / 1000) + (hoodDuctDiameterM / 2) + (15 / 1000);
            const coverCenterZ = requiredRearFaceZ + ductCoverDepth / 2 + backPanelOffsetM;

            ductCover.position.set(coverCenterX, coverCenterY, coverCenterZ);
            ductCover.userData.cabinetUUID = cabinetUUID;
            
            //MaterialManager.applyTexture(ductCover, 'frontal');

            group.add(ductCover);
            //console.log(` - Передняя зашивка воздуховода создана.`);
        }
    } else {
        console.log(` - Передняя зашивка воздуховода не создана (недостаточно места).`);
    }

    // ==================================================================
    // 7. Полки
    // ==================================================================
    const shelfCount = parseInt(cabinetData.shelfCount) || 0;
    const shelfLayout = cabinetData.shelfLayout || 'even';

    if (shelfCount > 0) {
        // --- 7.1. Левая секция полок ---

        // 7.1.1. Расчет размеров полки
        const leftDuctPartition_leftFaceX = -width / 2 + hoodOffsetXM - (hoodDuctDiameterM / 2) - (40 / 1000) - ductPartitionThickness;
        
        const shelfWidth_L = leftDuctPartition_leftFaceX - (-width / 2) - panelThickness - (2 / 1000);
        const shelfDepth_L = depth - backPanelOffsetM - (10 / 1000);
        const shelfThickness_L = panelThickness;
        const shelfPositionsY = [];

        // Проверяем, есть ли вообще место для этой секции
        if (shelfWidth_L > 0.01) { // Минимальная ширина секции 10мм
            
            // 7.1.2. Расчет диапазона по высоте
            const availableSpaceBottomY = -height / 2 + hoodHeightM + (10 / 1000) + panelThickness; // Верх полки вытяжки
            const availableSpaceTopY = height / 2 - panelThickness; // Низ крыши
            
            const availableHeight = availableSpaceTopY - availableSpaceBottomY;

            if (availableHeight > shelfThickness_L) {
                
                // 7.1.3. Расчет Y-позиций (копируем логику из openUpper/swingUpper)
                
                if (shelfLayout === 'uneven' && shelfCount > 0) {
                    const topShelfSpaceM = (cabinetData.topShelfSpace || 300) / 1000;
                    const topShelfTopFaceY = availableSpaceTopY - topShelfSpaceM;
                    const topShelfCenterY = topShelfTopFaceY - (shelfThickness_L / 2);
                    shelfPositionsY.push(topShelfCenterY);
                    if (shelfCount > 1) {
                        const remainingShelfCount = shelfCount - 1;
                        const remainingSpaceTopY = topShelfCenterY - (shelfThickness_L / 2);
                        const remainingAvailableHeight = remainingSpaceTopY - availableSpaceBottomY;
                        if (remainingAvailableHeight > 0) {
                            const shelfStepY = remainingAvailableHeight / (remainingShelfCount + 1);
                            for (let i = 1; i <= remainingShelfCount; i++) {
                                shelfPositionsY.push(availableSpaceBottomY + shelfStepY * i + (shelfThickness_L / 2)); // Центр полки
                            }
                        }
                    }
                } else if (shelfCount > 0) {
                    const shelfStepY = availableHeight / (shelfCount + 1);
                    for (let i = 1; i <= shelfCount; i++) {
                        shelfPositionsY.push(availableSpaceBottomY + shelfStepY * i - (shelfThickness_L / 2)); // Центр полки
                    }
                }

                // 7.1.4. Создание и позиционирование в цикле
                shelfPositionsY.forEach((shelfCenterY, index) => {
                    const shelfMesh = createPanel(shelfWidth_L, shelfThickness_L, shelfDepth_L, bodyMaterial, 'horizontal', `shelf_L_${index + 1}`);
                    if (shelfMesh) {
                        // По X: левая грань = левая грань шкафа + толщина + 1мм
                        const requiredLeftFaceX = -width / 2 + panelThickness + (1 / 1000);
                        const shelfCenterX = requiredLeftFaceX + shelfWidth_L / 2;
                        
                        // По Z: передняя грань = перед шкафа - 10мм
                        const requiredFrontFaceZ = depth / 2 - (10 / 1000);
                        const shelfCenterZ = requiredFrontFaceZ - shelfDepth_L / 2;
                        
                        shelfMesh.position.set(shelfCenterX, shelfCenterY, shelfCenterZ);
                        shelfMesh.userData.cabinetUUID = cabinetUUID;
                        //MaterialManager.applyTexture(shelfMesh, 'horizontal');
                        group.add(shelfMesh);
                    }
                });
                //console.log(` - Полки (левая секция) созданы: ${shelfPositionsY.length} шт.`);
            }
        }

        // --- 7.2. Правая секция полок ---

        // 7.2.1. Расчет размеров полки
        const rightDuctPartition_rightFaceX = -width / 2 + hoodOffsetXM + (hoodDuctDiameterM / 2) + (40 / 1000) + ductPartitionThickness;

        const shelfWidth_R = (width / 2) - rightDuctPartition_rightFaceX - panelThickness - (2 / 1000);
        const shelfDepth_R = depth - backPanelOffsetM - (10 / 1000); // Такая же глубина, как у левых
        const shelfThickness_R = panelThickness;

        if (shelfWidth_R > 0.01) {
            // 7.2.2. Создание и позиционирование в цикле
            // Мы ПЕРЕИСПОЛЬЗУЕМ массив Y-координат `shelfPositionsY`, рассчитанный для левой секции!
            shelfPositionsY.forEach((shelfCenterY, index) => {
                const shelfMesh = createPanel(shelfWidth_R, shelfThickness_R, shelfDepth_R, bodyMaterial, 'horizontal', `shelf_R_${index + 1}`);
                if (shelfMesh) {
                    // По X: правая грань полки = правая грань шкафа - толщина - 1мм
                    const requiredRightFaceX = width / 2 - panelThickness - (1 / 1000);
                    const shelfCenterX = requiredRightFaceX - shelfWidth_R / 2;
                    
                    // По Z: так же, как у левых полок
                    const requiredFrontFaceZ = depth / 2 - (10 / 1000);
                    const shelfCenterZ = requiredFrontFaceZ - shelfDepth_R / 2;
                    
                    shelfMesh.position.set(shelfCenterX, shelfCenterY, shelfCenterZ);
                    shelfMesh.userData.cabinetUUID = cabinetUUID;
                    //MaterialManager.applyTexture(shelfMesh, 'horizontal');
                    group.add(shelfMesh);
                }
            });
            //console.log(` - Полки (правая секция) созданы: ${shelfPositionsY.length} шт.`);
        }
        // --- 7.3. Центральная (задняя) секция полок ---

        // 7.3.1. Расчет размеров полки
        // Ширина = ширина передней зашивки
        const shelfWidth_C = rightDuctPartition_leftFaceX - leftDuctPartition_rightFaceX; 
        
        const shelfDepth_C = depth - (110 / 1000) - (hoodDuctDiameterM / 2) - (15 / 1000) - panelThickness - backPanelOffsetM - (10 / 1000);
        const shelfThickness_C = panelThickness;

        // Проверяем, есть ли место
        if (shelfWidth_C > 0.01 && shelfDepth_C > 0.060) { // Ширина > 10мм, Глубина > 60мм
            // 7.3.2. Создание и позиционирование в цикле
            // Снова переиспользуем `shelfPositionsY`
            shelfPositionsY.forEach((shelfCenterY, index) => {
                const shelfMesh = createPanel(shelfWidth_C, shelfThickness_C, shelfDepth_C, bodyMaterial, 'horizontal', `shelf_C_${index + 1}`);
                if (shelfMesh) {
                    // По X: левая грань = ...
                    const requiredLeftFaceX = -width / 2 + hoodOffsetXM - (hoodDuctDiameterM / 2) - (40 / 1000); // <-- Опечатка в ТЗ? должно быть 40?
                    const shelfCenterX = requiredLeftFaceX + shelfWidth_C / 2;
                    
                    // По Z: передняя грань = передняя грань шкафа - 10мм
                    const requiredFrontFaceZ = depth / 2 - (10 / 1000);
                    const shelfCenterZ = requiredFrontFaceZ - shelfDepth_C / 2;

                    shelfMesh.position.set(shelfCenterX, shelfCenterY, shelfCenterZ);
                    shelfMesh.userData.cabinetUUID = cabinetUUID;
                    //MaterialManager.applyTexture(shelfMesh, 'horizontal');
                    group.add(shelfMesh);
                }
            });
            //console.log(` - Полки (центральная секция) созданы: ${shelfPositionsY.length} шт.`);
        }
    }

    // ==================================================================
    // 6. Фасады
    // ==================================================================

    const doorType = cabinetData.doorType || 'double';

    if (doorType !== 'none') {
        const doorOffsetTopM = (cabinetData.doorOffsetTop ?? 0) / 1000;
        const doorOffsetBottomM = (cabinetData.doorOffsetBottom ?? 0) / 1000;
        const facadeGapM = (cabinetData.facadeGap ?? 3 / 1000);

        const facadeHeight = height - doorOffsetTopM - doorOffsetBottomM;
        const facadeCenterY = (doorOffsetBottomM - doorOffsetTopM) / 2;
        
        // 1. Базовый материал (из набора) - нужен для fallback и спейсеров
        const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
        const { material: baseMat, thickness: baseTh } = MaterialManager.getMaterial(facadeSet);

        // 2. Определение стратегии построения (Override vs Set)
        let buildStrategy = 'flat'; // 'flat', 'milled', 'aluminum'
        let profileData = null;
        let finalMaterial = baseMat;
        let finalThickness = baseTh;

        // А. Проверяем локальный Override (если есть поле в cabinetData)
        if (cabinetData.facadeOverride && cabinetData.facadeOverride.startsWith('aluminum')) {
            buildStrategy = 'aluminum';
            // Тут можно определить тип профиля (Z1, Z9...) из строки override
        } 
        // Б. Если нет Override, смотрим на набор
        else {
            // Ищем декор в mdf_milled
            if (window.facadeOptionsData['mdf_milled']) {
                 const decor = window.facadeOptionsData['mdf_milled'].decors.find(d => d.value === facadeSet?.texture);
                 if (decor && decor.profileType === '9slice') {
                     buildStrategy = 'milled';
                     profileData = decor;
                 }
            }
        }

        // Подготовка списка фасадов (размеры)
        const facadesToCreate = [];
        if (doorType === 'left' || doorType === 'right') {
            const facadeWidth = width - facadeGapM;
            if (facadeWidth > 0 && facadeHeight > 0) facadesToCreate.push({ width: facadeWidth, xOffset: 0 });
        } else if (doorType === 'double') {
            const facadeWidth = (width - facadeGapM * 2) / 2;
            if (facadeWidth > 0 && facadeHeight > 0) {
                const xOffset = facadeWidth / 2 + facadeGapM / 2;
                facadesToCreate.push({ width: facadeWidth, xOffset: -xOffset });
                facadesToCreate.push({ width: facadeWidth, xOffset: xOffset });
            }
        }

        // Создание
        facadesToCreate.forEach((facadeInfo, index) => {
            // Центр по Z зависит от толщины (которая может меняться для разных типов)
            // Для фрезеровки и плоского берем из материала. Для алюминия - своя.
            
            const container = new THREE.Group();
            container.userData.cabinetUUID = cabinetUUID;
            
            if (buildStrategy === 'milled') {
                // === ФРЕЗЕРОВКА ===
                const z = depth / 2 + finalThickness / 2;
                container.position.set(facadeInfo.xOffset, facadeCenterY, z);
                group.add(container);

                createMilledFacade(facadeInfo.width, facadeHeight, profileData, finalMaterial.clone())
                    .then(mesh => {
                        container.add(mesh);
                        mesh.updateMatrixWorld();
                    })
                    .catch(e => console.error(e));

            } else if (buildStrategy === 'aluminum') {
                // === АЛЮМИНИЙ ===
                // Вызываем твои функции createZ...
                // const mesh = createZ1FrameFacade(...)
                // container.add(mesh)
                // group.add(container)
                
            } else {
                // === ПЛОСКИЙ (Default) ===
                const z = depth / 2 + finalThickness / 2;
                
                // Пересоздаем материал для клонирования текстур
                const { material: mat } = MaterialManager.getMaterial(facadeSet);
                
                const mesh = createPanel(
                    facadeInfo.width, facadeHeight, finalThickness,
                    mat, 'frontal', `facade_${doorType}_${index}`
                );

                if (mesh) {
                    if (mesh.material.map) {
                        MaterialManager.applyTextureTransform(mesh.material, cabinetData.textureDirection || 'vertical', facadeInfo.width, facadeHeight);
                    }
                    mesh.position.set(facadeInfo.xOffset, facadeCenterY, z);
                    mesh.userData.cabinetUUID = cabinetUUID;
                    group.add(mesh);
                }
            }
        });
        
        console.log(` - Фасады созданы: ${facadesToCreate.length} шт. (${buildStrategy})`);
    }

    // ==================================================================
    // 8. Панель вытяжки (декоративная)
    // ==================================================================

    // 8.1. Расчет размеров и параметров
    const hoodPanelWidth = hoodWidthM + (32 / 1000); // По X
    const hoodPanelDepth = ((cabinetData.hoodDepth || 260) / 1000) + (20 / 1000); // По Z
    const hoodPanelThickness = 4 / 1000; // Толщина (выдавливание по Y)

    // 8.2. Создание Shape
    const hoodPanelShape = new THREE.Shape();
    hoodPanelShape.moveTo(0, 0); // задний-левый угол
    hoodPanelShape.lineTo(hoodPanelWidth, 0); // задний-правый
    hoodPanelShape.lineTo(hoodPanelWidth, hoodPanelDepth); // передний-правый
    hoodPanelShape.lineTo(0, hoodPanelDepth); // передний-левый

    // 8.3. Создание детали с фаской
    const extrudeSettingsHood = {
        steps: 1,
        depth: hoodPanelThickness, // Выдавливаем по Y
        bevelEnabled: true,
        bevelThickness: 1 / 1000, // Глубина фаски
        bevelSize: 1 / 1000,      // Ширина фаски
        bevelSegments: 2
    };

    const hoodPanelMaterial = new THREE.MeshStandardMaterial({
        color: 0x111111, // Черный
        metalness: 0.1,
        roughness: 0.1,  // Глянцевый, но не идеальное зеркало
        transparent: false,
        name: "HoodPanelMaterial"
    });

    const hoodPanel = createExtrudedPanel(hoodPanelShape, extrudeSettingsHood, hoodPanelMaterial, 'horizontal', 'hoodPanel');

    // 8.4. Позиционирование
    if (hoodPanel) {
        // Поворачиваем, чтобы Shape лег в плоскость XZ
        hoodPanel.rotation.x = -Math.PI / 2;
        
        // По X: центр панели = смещение центра вытяжки
        const panelCenterX = hoodOffsetXM - (width / 2) - hoodPanelWidth / 2;
        
        // По Y: верхняя грань = низ шкафа
        const requiredTopFaceY = -height / 2;
        const panelCenterY = requiredTopFaceY - hoodPanelThickness;
        
        // По Z: задняя грань = задняя грань шкафа + 20мм
        const requiredRearFaceZ = -depth / 2 + (20 / 1000) + hoodPanelDepth;
        // Pivot у Shape в (0,0), а после поворота это задняя грань.
        const panelCenterZ = requiredRearFaceZ;
        
        hoodPanel.position.set(panelCenterX, panelCenterY, panelCenterZ);
        hoodPanel.userData.cabinetUUID = cabinetUUID;
        
        group.add(hoodPanel);
        console.log(` - Панель вытяжки создана.`);
    }

    // ==================================================================
    // 7. Спейсеры
    // ==================================================================
    const spacersType = cabinetData.spacers || 'none';
    const isOverlayBottomForSpacer = (cabinetData.bottomConstruction || 'inset').includes('overlay');

    // --- Узкий спейсер для НАКЛАДНОГО дна ---
    if (spacersType.includes('narrow') && isOverlayBottomForSpacer) {
        // 7.1. Расчет размеров и параметров
        const doorOffsetTopM = (cabinetData.doorOffsetTop ?? 0) / 1000;
        const doorOffsetBottomM = (cabinetData.doorOffsetBottom ?? 0) / 1000;
        
        // Получаем материал и толщину фасада (она же - толщина спейсера)
        const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
        const { material: baseFacadeMaterial, thickness: facadeThicknessM } = MaterialManager.getMaterial(facadeSet);
        
        const spacerHeight = height - doorOffsetTopM - doorOffsetBottomM;
        const spacerWidth = 80 / 1000; // Это будет "ширина" нашего Shape (вдоль оси X контура)
        const spacerThickness = facadeThicknessM; // Это будет "глубина" экструзии


        if (spacerHeight > 0 && spacerWidth > 0) {
            // 7.2. Создание Shape и экструзия
            const spacerShape = new THREE.Shape();
            spacerShape.moveTo(0, 0.05);          
            spacerShape.lineTo(spacerWidth - spacerThickness - bottomFrontOffsetM, 0.05);
            spacerShape.lineTo(spacerWidth - spacerThickness - bottomFrontOffsetM, 0);
            spacerShape.lineTo(spacerWidth, 0);
            spacerShape.lineTo(spacerWidth, spacerHeight);
            spacerShape.lineTo(0, spacerHeight);
            spacerShape.closePath();

            const extrudeSettings = {
                steps: 1,
                depth: spacerThickness, // Глубина выдавливания = толщина
                bevelEnabled: false
            };

            const spacerPanel = createExtrudedPanel(
                spacerShape, extrudeSettings, baseFacadeMaterial.clone(), 'frontal', 
                `spacer_narrow_${spacersType.includes('left') ? 'left' : 'right'}`
            );

            if (spacerPanel) {
                // 7.3. Позиционирование
                // Геометрия создана в плоскости XY. Нам нужно повернуть ее и сдвинуть.
                spacerPanel.rotation.y = -Math.PI / 2; // Поворачиваем на -90 градусов, чтобы она встала вдоль оси Z

                // Центр по Y рассчитывается так же, как у фасада
                const spacerCenterY = - height / 2 + doorOffsetBottomM;
                
                let spacerCenterX;

                if (spacersType.includes('left')) {
                    // Левый спейсер: правая грань = левая грань шкафа
                    // Правая грань повернутого спейсера = center.x + thickness/2
                    // Левая грань шкафа = -width/2
                    spacerCenterX = -width / 2;
                } else { // правый
                    // Правый спейсер: левая грань = правая грань шкафа
                    // Левая грань повернутого спейсера = center.x - thickness/2
                    // Правая грань шкафа = width/2
                    spacerCenterX = width / 2 + spacerThickness;
                }
                
                // Центр по Z: передняя грань спейсера = передняя грань фасада
                const facadeFrontFaceZ = depth / 2 + facadeThicknessM;
                // Передняя грань повернутого спейсера = center.z + width/2
                const spacerCenterZ = facadeFrontFaceZ - spacerWidth / 1;
                
                spacerPanel.position.set(spacerCenterX, spacerCenterY, spacerCenterZ);
                spacerPanel.userData.cabinetUUID = cabinetUUID;
                
                // 7.4. Коррекция UV-координат (адаптированный ваш код)
                MaterialManager.applyTextureToExtruded(
                    spacerPanel,
                    'vertical', // <-- Передаем направление ИЗ ФАСАДА
                    spacerWidth,             // Ширина Shape
                    spacerHeight                  // Высота Shape
                );

                group.add(spacerPanel);
                console.log(` - Узкий спейсер (накладной) создан.`);
            }
        }
    } else if (spacersType.includes('narrow') && !isOverlayBottomForSpacer) {
        // --- Узкий спейсер для ВКЛАДНОГО дна ---

        // 7.1. Расчет общих параметров
        const { material: baseFacadeMaterial, thickness: facadeThicknessM } = MaterialManager.getMaterial(facadeSet);
        const doorOffsetTopM = (cabinetData.doorOffsetTop ?? 0) / 1000;
        const doorOffsetBottomM = (cabinetData.doorOffsetBottom ?? 0) / 1000;

        // --- 7.2. Создание и позиционирование 1-й детали (Вертикальная планка) ---
        const verticalPartHeight = height - doorOffsetTopM - doorOffsetBottomM;
        const verticalPartWidth = facadeThicknessM; // Ширина по X
        const verticalPartDepth = 80 / 1000;         // Глубина по Z

        const verticalSpacerPart = createPanel(verticalPartWidth, verticalPartHeight, verticalPartDepth, baseFacadeMaterial.clone(), 'vertical', 'spacer_inset_vertical');
        
        if (verticalSpacerPart) {
            let partCenterX;
            if (spacersType.includes('left')) {
                // Левый: правая грань = левая грань шкафа
                partCenterX = -width / 2 - verticalPartWidth / 2;
            } else { // правый
                // Правый: левая грань = правая грань шкафа
                partCenterX = width / 2 + verticalPartWidth / 2;
            }

            // По Y позиция как у фасада
            const partCenterY = (doorOffsetBottomM - doorOffsetTopM) / 2;
            
            // По Z передняя грань = передняя грань фасада
            const facadeFrontFaceZ = depth / 2 + facadeThicknessM;
            const partCenterZ = facadeFrontFaceZ - verticalPartDepth / 2;

            verticalSpacerPart.position.set(partCenterX, partCenterY, partCenterZ);
            verticalSpacerPart.userData.cabinetUUID = cabinetUUID;
            // Применяем трансформацию текстуры
            const verticalMaterial = verticalSpacerPart.material;
            if (verticalMaterial.map && verticalMaterial.map.isTexture) {
                const transformedTexture = MaterialManager.applyTextureTransform(
                    verticalMaterial.map,
                    cabinetData.textureDirection || 'vertical',
                    verticalPartDepth,
                    verticalPartHeight
                );
                verticalMaterial.map = transformedTexture;
                verticalMaterial.needsUpdate = true;
            }
            group.add(verticalSpacerPart);
        }
        
        // --- 7.3. Создание и позиционирование 2-й детали (Горизонтальная планка) ---
        const horizontalPartHeight = 80 / 1000;
        const horizontalPartWidth = facadeThicknessM;
        const horizontalPartDepth = depth + facadeThicknessM - (80 / 1000); // 80мм - глубина верт. планки

        const horizontalSpacerPart = createPanel(horizontalPartWidth, horizontalPartHeight, horizontalPartDepth, baseFacadeMaterial.clone(), 'vertical', 'spacer_inset_horizontal');

        if (horizontalSpacerPart) {
            let partCenterX;
            if (spacersType.includes('left')) {
                partCenterX = -width / 2 - horizontalPartWidth / 2;
            } else { // правый
                partCenterX = width / 2 + horizontalPartWidth / 2;
            }
            
            // По Y: нижняя грань = нижняя грань шкафа
            const partCenterY = -height / 2 + horizontalPartHeight / 2;
            
            // По Z: задняя грань = задняя грань шкафа
            const requiredRearFaceZ = -depth / 2;
            const currentRearFaceZ = -horizontalPartDepth / 2;
            const partCenterZ = requiredRearFaceZ - currentRearFaceZ;
            
            horizontalSpacerPart.position.set(partCenterX, partCenterY, partCenterZ);
            horizontalSpacerPart.userData.cabinetUUID = cabinetUUID;
            // Применяем трансформацию текстуры
            const horizontalMaterial = horizontalSpacerPart.material;
            if (horizontalMaterial.map && horizontalMaterial.map.isTexture) {
                const transformedTexture = MaterialManager.applyTextureTransform(
                    horizontalMaterial.map,
                    cabinetData.textureDirection || 'vertical',
                    horizontalPartDepth,
                    horizontalPartHeight
                );
                horizontalMaterial.map = transformedTexture;
                horizontalMaterial.needsUpdate = true;
            }
            group.add(horizontalSpacerPart);
        }

        console.log(` - Узкий спейсер (вкладной, 2 части) создан.`);
    } else if (spacersType.includes('wide')) {
        // --- Широкий спейсер ---

        // --- 7.1. Держатель спейсера (из материала корпуса) ---
        
        // 7.1.1. Расчет размеров и параметров
        const doorOffsetTopM = (cabinetData.doorOffsetTop ?? 0) / 1000;
        const doorOffsetBottomM = (cabinetData.doorOffsetBottom ?? 0) / 1000;

        const holderHeight = height - panelThickness - doorOffsetTopM;
        const holderWidth = panelThickness; // Ширина по X
        const holderDepth = 60 / 1000;      // Глубина по Z

        // 7.1.2. Создание детали
        // Используем bodyMaterial, т.к. держатель из материала корпуса
        const spacerHolder = createPanel(holderWidth, holderHeight, holderDepth, bodyMaterial, 'vertical', 'spacer_holder');

        if (spacerHolder) {
            // 7.1.3. Позиционирование
            let holderCenterX;
            if (spacersType.includes('left')) {
                // Левый: правая грань = левая грань шкафа
                holderCenterX = -width / 2 - holderWidth / 2;
            } else { // Правый
                // Правый: левая грань = правая грань шкафа
                holderCenterX = width / 2 + holderWidth / 2;
            }

            // По Y: нижняя грань = нижняя грань шкафа + толщина дна
            // Нижняя грань шкафа = -height/2. Низ дна (вкладного) = -height/2. Верх дна (вкладного) = -height/2 + panelThickness.
            // Нам нужно, чтобы держатель стоял НА дне.
            // Поэтому его нижняя грань должна быть на уровне верха дна.
            const requiredBottomFaceY = -height / 2 + panelThickness;
            const holderCenterY = requiredBottomFaceY + holderHeight / 2;
            
            // По Z: передняя грань = передняя грань шкафа
            const requiredFrontFaceZ = depth / 2;
            const holderCenterZ = requiredFrontFaceZ - holderDepth / 2;

            spacerHolder.position.set(holderCenterX, holderCenterY, holderCenterZ);
            spacerHolder.userData.cabinetUUID = cabinetUUID;
            group.add(spacerHolder);
        }
             
        console.log(` - Держатель для широкого спейсера создан.`);

        // --- 7.2. Фасадная часть спейсера (из материала фасада) ---
    
        // 7.2.1. Расчет размеров и параметров
        const spacerFacadeHeight = height - doorOffsetTopM - doorOffsetBottomM;
        const spacerWidthMm = cabinetData.spacerWidth || 60;
        const spacerFacadeWidth = (spacerWidthMm - 1) / 1000;

        const { material: baseFacadeMaterial, thickness: facadeThicknessM } = MaterialManager.getMaterial(facadeSet);
        const spacerFacadeDepth = facadeThicknessM;

        // 7.2.2. Определение стратегии (Фрезеровка или Плоский)
        let isMilled = false;
        let profileData = null;
        
        if (window.facadeOptionsData['mdf_milled']) {
             const decor = window.facadeOptionsData['mdf_milled'].decors.find(d => d.value === facadeSet?.texture);
             if (decor && decor.profileType === '9slice') {
                 isMilled = true;
                 profileData = decor;
             }
        }

        // 7.2.3. Позиционирование (общие координаты центра)
        let facadeCenterX;
        const oneMm = 1 / 1000;
        if (spacersType.includes('left')) {
            // правая грань = левая грань шкафа - 1мм
            const requiredRightFaceX = -width / 2 - oneMm;
            facadeCenterX = requiredRightFaceX - spacerFacadeWidth / 2;
        } else { // Правый
            // левая грань = правая грань шкафа + 1мм
            const requiredLeftFaceX = width / 2 + oneMm;
            facadeCenterX = requiredLeftFaceX + spacerFacadeWidth / 2;
        }

        const requiredBottomFaceY = -height / 2 + doorOffsetBottomM;
        const facadeCenterY = requiredBottomFaceY + spacerFacadeHeight / 2;
        
        const requiredRearFaceZ = depth / 2;
        const facadeCenterZ = requiredRearFaceZ + spacerFacadeDepth / 2;


        // 7.2.4. Создание
        if (isMilled) {
            // === ВАРИАНТ 1: ФРЕЗЕРОВКА ===
            // Создаем контейнер
            const spacerContainer = new THREE.Group();
            spacerContainer.position.set(facadeCenterX, facadeCenterY, facadeCenterZ);
            spacerContainer.userData.cabinetUUID = cabinetUUID;
            group.add(spacerContainer);

            // Запускаем билдер
            // FacadeBuilder сам решит (LOD), делать ли сложный профиль или заглушку,
            // если спейсер слишком узкий.
            createMilledFacade(spacerFacadeWidth, spacerFacadeHeight, profileData, baseFacadeMaterial.clone())
                .then(mesh => {
                    spacerContainer.add(mesh);
                    mesh.updateMatrixWorld();
                })
                .catch(e => console.error("Ошибка спейсера:", e));

        } else {
            // === ВАРИАНТ 2: ПЛОСКИЙ ===
            const spacerFacade = createPanel(spacerFacadeWidth, spacerFacadeHeight, spacerFacadeDepth, baseFacadeMaterial.clone(), 'frontal', 'spacer_facade');

            if (spacerFacade) {
                spacerFacade.position.set(facadeCenterX, facadeCenterY, facadeCenterZ);
                spacerFacade.userData.cabinetUUID = cabinetUUID;

                const facadeMaterial = spacerFacade.material;
                if (facadeMaterial.map && facadeMaterial.map.isTexture) {
                    MaterialManager.applyTextureTransform(
                        facadeMaterial,
                        cabinetData.textureDirection || 'vertical',
                        spacerFacadeWidth,
                        spacerFacadeHeight
                    );
                }
                group.add(spacerFacade);
            }
        }
        console.log(` - Фасадная часть для широкого спейсера создана (${isMilled ? 'Milled' : 'Flat'}).`);
    }

    // ==================================================================
    // 8. Гола-профиль
    // ==================================================================
    if ((cabinetData.bottomConstruction || 'inset').includes('Gola')) {
        
        // 8.1. Расчет размеров и параметров
        const golaMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xAAAAAA, metalness: 0.8, roughness: 0.4, name: "GolaMaterial"
        });
        
        let profileLength;
        let profileCenterX;

        if (isOverlayBottomForSpacer) { // Накладное дно
            if (spacersType.includes('wide')) {
                const spacerWidthMm = cabinetData.spacerWidth || 60;
                profileLength = width + (spacerWidthMm / 1000);
            } else {
                profileLength = width;
            }
            
            // Позиционирование для накладного
            if (spacersType.includes('left')) {
                // правая грань = правая грань шкафа
                profileCenterX = width / 2 - profileLength / 2;
            } else { // правый спейсер или нет спейсера
                // левая грань = левая грань шкафа
                profileCenterX = -width / 2 + profileLength / 2;
            }

        } else { // Вкладное дно
            profileLength = width - 2 * panelThickness;
            // левая грань = левая грань шкафа + толщина
            profileCenterX = -width / 2 + panelThickness + profileLength / 2;
        }
        
        // 8.2. Создание детали
        const golaProfile = createUpperGolaProfileMesh(profileLength, golaMaterial, cabinetUUID);

        if (golaProfile) {
            // 8.3. Позиционирование
            // Геометрия создана в плоскости XY, ее нужно повернуть и сдвинуть.
            golaProfile.rotation.y = -Math.PI / 2; // Поворачиваем, чтобы XY-плоскость стала ZY-плоскостью

            // По Y: центр = нижняя грань шкафа + толщина дна / 2
            // Это не совсем верно. Нижняя грань дна = -height/2. Верхняя = -height/2 + panelThickness.
            // Профиль должен стоять НА дне, его нижняя грань = верхняя грань дна.
            const profileHeight = 20 / 1000; // Высота сечения
            const requiredBottomFaceY = -height / 2 + panelThickness / 2;
            const profileCenterY = requiredBottomFaceY - profileHeight / 2;
            
            // По Z: задняя грань = передняя грань шкафа - отступ дна спереди
            const bottomFrontOffsetM = (cabinetData.bottomFrontOffset ?? 20) / 1000;
            const profileDepth = 20 / 1000; // Глубина сечения
            const requiredRearFaceZ = depth / 2 - bottomFrontOffsetM;
            const profileCenterZ = requiredRearFaceZ; // Pivot point у Shape в (0,0), поэтому так
            
            golaProfile.position.set(profileCenterX, profileCenterY, profileCenterZ);
            
            group.add(golaProfile);
            console.log(` - Верхний Гола-профиль создан (Длина: ${Math.round(profileLength*1000)}мм).`);
        }
    }

    return group;
}




/**
 * Создает THREE.Group для детализированной модели УГЛОВОГО ШКАФА С МОЙКОЙ.
 * @param {object} cabinetData - Объект углового шкафа.
 * @returns {THREE.Group | null}
 */
export function createDetailedCornerSinkGeometry(cabinetData, kitchenGlobalParams, MaterialManager, getPanelThickness, calculateActualGolaHeight) {
    console.log(`[Детализация] Запуск createDetailedCornerSinkGeometry для шкафа ID: ${cabinetData.id_data}`);

    const group = new THREE.Group();
    const panelThickness = getPanelThickness();
    const handleType = kitchenGlobalParams.handleType || 'standard';
    
    const { width, height, depth, cornerDirection } = cabinetData;
    const cabinetMaterial = MaterialManager.getBodyMaterial(cabinetData);
    const cabinetUUID = cabinetData.mesh.uuid;

    
    // =======================================================
    // === ЭЛЕМЕНТ: ДНО (bottomPanel) =======================
    // =======================================================
    //console.log(" - Создание дна (Extrude)...");

     // 1. Создаем контур (Shape) дна в плоскости XZ.
    const bottomShape = new THREE.Shape();
    bottomShape.moveTo(0, 0);       // Локальный (0,0) для Shape
    bottomShape.lineTo(width, 0);   // Локальный (width, 0)
    bottomShape.lineTo(width, depth);
    bottomShape.lineTo(0, depth);
    bottomShape.closePath();

    // 2. Настройки для "выдавливания" вверх по оси Y
    const bottomExtrudeSettings = {
        steps: 1,
        depth: panelThickness, // Выдавливаем на толщину панели
        bevelEnabled: false
    };
    
    // 3. Создаем геометрию. Она будет создана в плоскости XY и выдавлена по Z.
    //const bottomGeometry = new THREE.ExtrudeGeometry(bottomShape, extrudeSettings);

    // 4. Создаем Mesh
    const bottomPanel = createExtrudedPanel(bottomShape, bottomExtrudeSettings, cabinetMaterial, 'horizontal', "bottomPanel");
    //bottomPanel.name = "bottomPanel";

    // 5. Позиционируем.

     if (bottomPanel) {
        bottomPanel.rotation.x = -Math.PI / 2;
        bottomPanel.position.set(-width / 2, -height / 2, depth / 2);
        MaterialManager.applyTextureToExtruded(
            bottomPanel, 
            'horizontal',
            width,  // Ширина Shape
            depth   // Высота Shape
        );
        group.add(bottomPanel);
    }

    // =======================================================
    // === НОВЫЙ ЭЛЕМЕНТ: БОКОВИНА (sidePanel) ==============
    // =======================================================
    console.log(" - Создание боковины...");

    const sidePanelHeight = height - panelThickness; // Высота = общая - толщина дна

    // 1. Создаем контур боковины в плоскости ZY (как будто смотрим на нее сбоку)
    const sideShape = new THREE.Shape();
    sideShape.moveTo(0, 0);
    sideShape.lineTo(depth, 0);
    sideShape.lineTo(depth, sidePanelHeight);
    sideShape.lineTo(0, sidePanelHeight);
    sideShape.closePath();

    // 2. Настройки экструзии (выдавливаем "вбок" на толщину панели)
    const sideExtrudeSettings = {
        steps: 1,
        depth: panelThickness,
        bevelEnabled: false
    };
    
    // 3. Создаем геометрию и Mesh
    const sidePanel = createExtrudedPanel(sideShape, sideExtrudeSettings, cabinetMaterial, 'vertical', "sidePanel");

    // 4. Позиционируем в зависимости от направления угла
    sidePanel.rotation.y = -Math.PI / 2; // Поворот на -90 градусов вокруг Y

    if (sidePanel) {
        const sidePanelY = -height / 2 + panelThickness;
        if (cornerDirection === 'left') {
            const sidePanelX = -width / 2 + panelThickness;
            sidePanel.position.set(sidePanelX, sidePanelY, -depth / 2);
        } else { // 'right'
            const sidePanelX = width / 2;
            sidePanel.position.set(sidePanelX, sidePanelY, -depth / 2);
        }
        MaterialManager.applyTexture(sidePanel, cabinetData.textureDirection, 'vertical');
        group.add(sidePanel);
    }


    // =======================================================
    // === НОВЫЙ ЭЛЕМЕНЕНТ: ВТОРАЯ БОКОВИНА (farSidePanel) ====
    // =======================================================
    console.log(" - Создание второй (дальней) боковины...");
    
    //const handleType = kitchenGlobalParams.handleType || 'standard';
    
    // 1. Определяем размеры панели (высота та же, что и у первой боковины)
    const farSidePanelHeight = height - panelThickness;
    const farSidePanelDepth = depth;

    // 2. Создаем КОНТУР боковины (Shape), копируя логику из createDetailedCabinetGeometry
    const farSideShape = new THREE.Shape();
    farSideShape.moveTo(0, 0); // Задний-нижний угол

    if (handleType === 'gola-profile') {
        // Логика с вырезом под Gola-профиль
        const cutoutHeight = 58 / 1000;
        const cutoutDepth = 27 / 1000;
        const frontPointX = farSidePanelDepth;
        const topPointY = farSidePanelHeight;
        const cutoutBottomY = topPointY - cutoutHeight;
        const cutoutBackX = frontPointX - cutoutDepth;
        
        farSideShape.lineTo(frontPointX, 0);
        farSideShape.lineTo(frontPointX, cutoutBottomY);
        farSideShape.lineTo(cutoutBackX, cutoutBottomY);
        farSideShape.lineTo(cutoutBackX, topPointY);
        farSideShape.lineTo(0, topPointY);

    } else {
        // Обычный прямоугольный контур
        farSideShape.lineTo(farSidePanelDepth, 0);
        farSideShape.lineTo(farSidePanelDepth, farSidePanelHeight);
        farSideShape.lineTo(0, farSidePanelHeight);
    }
    farSideShape.closePath();

    // 3. Настройки экструзии с ФАСКОЙ
    const farSideExtrudeSettings = {
        steps: 1,
        depth: panelThickness,
        bevelEnabled: false
    };

    // 4. Создаем геометрию и Mesh
    const farSidePanel = createExtrudedPanel(farSideShape, farSideExtrudeSettings, cabinetMaterial, 'vertical', "farSidePanel");
    farSidePanel.name = "farSidePanel";

    // 5. Позиционируем в зависимости от направления угла

    
    if (farSidePanel) {
        // Поворачиваем, как и первую боковину
        farSidePanel.rotation.y = -Math.PI / 2;
        const farSidePanelY = -height / 2 + panelThickness;
        const farSidePanelZ = -depth / 2;

        if (cabinetData.cornerDirection === 'left') {
            // --- ЛЕВЫЙ УГЛ ---
            // Эта боковина будет СПРАВА. Ее позиция X = правый край контейнера - половина толщины.
            const farSidePanelX = width / 2;
            farSidePanel.position.set(farSidePanelX, farSidePanelY, farSidePanelZ);

        } else { // 'right'
            // --- ПРАВЫЙ УГЛ ---
            // Эта боковина будет СЛЕВА. Ее позиция X = левый край контейнера + половина толщины.
            const farSidePanelX = -width / 2 + panelThickness;
            farSidePanel.position.set(farSidePanelX, farSidePanelY, farSidePanelZ);
        }
        MaterialManager.applyTextureToExtruded(
            farSidePanel, 
            'vertical',
            farSidePanelDepth,  // Ширина Shape
            farSidePanelHeight   // Высота Shape
        );
        group.add(farSidePanel);
    }

    // =======================================================
    // === НОВЫЙ ЭЛЕМЕНТ: ЗАДНЯЯ НИЖНЯЯ ПЕРЕМЫЧКА ==========
    // =======================================================
    console.log(" - Создание задней нижней перемычки...");

    // 1. Определяем размеры
    const stretcherLength = width - 2 * panelThickness; // Длина (по X)
    const stretcherHeight = 100 / 1000;                 // Высота (по Y)
    const stretcherDepth = panelThickness;              // Глубина (по Z)

    // 2. Создаем геометрию
    const rearStretcher = createPanel(stretcherLength, stretcherHeight, stretcherDepth, cabinetMaterial, 'frontal', "rearBottomStretcher");

    // 3. Позиционирование
    if (rearStretcher) {    
        const stretcherX = 0;
        const stretcherY = (-height / 2 + panelThickness) + (stretcherHeight / 2);
        const stretcherZ = -depth / 2 + stretcherDepth / 2;
        rearStretcher.position.set(stretcherX, stretcherY, stretcherZ);
        MaterialManager.applyTexture(rearStretcher, cabinetData.textureDirection, 'horizontal');
        group.add(rearStretcher);
    }

    // =======================================================
    // === ЭЛЕМЕНТ: ПЕРЕДНЯЯ ФАЛЬШ-СТЕНКА (ОБНОВЛЕННАЯ ЛОГИКА) ===
    // =======================================================
    console.log(` - Создание передней фальш-стенки для ручек типа: ${handleType}`);

    const DELTA_M = cabinetData.cornerElementWidth; // 20мм, как в формулах для ширин

    let panelLength, panelHeight, panelDepth;
    let panelX, panelY, panelZ;
    const facadeWidth = cabinetData.facadeWidth || 0.45;

    if (handleType === 'gola-profile') {
        // --- ВАША СУЩЕСТВУЮЩАЯ, РАБОЧАЯ ЛОГИКА ДЛЯ GOLA ---
        panelLength = width - facadeWidth - panelThickness - (80 / 1000);
        panelHeight = height - panelThickness;
        panelDepth = panelThickness;

        panelY = (height / 2) - (panelHeight / 2);
        panelZ = (depth / 2) - (panelDepth / 2);

        if (cabinetData.cornerDirection === 'left') {
            panelX = (-width / 2 + panelThickness) + (panelLength / 2);
        } else { // 'right'
            panelX = (width / 2 - panelThickness) - (panelLength / 2);
        }

    } else { // 'standard' или 'aluminum-tv9'
        // --- НОВАЯ ЛОГИКА ДЛЯ СТАНДАРТНЫХ РУЧЕК ---
        
        // Получаем толщину фасада
        const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
        const { thickness: facadeThicknessM } = MaterialManager.getMaterial(facadeSet);
        
        // 1. Размеры
        
        panelLength = width - facadeWidth - DELTA_M - facadeThicknessM;
        panelHeight = height;
        panelDepth = panelThickness;
        
        // 2. Позиционирование
        panelY = 0; // Центр панели по высоте совпадает с центром шкафа

        // Задняя грань панели совпадает с передней гранью шкафа
        // Центр Z = перед шкафа (depth/2) + половина глубины панели (panelDepth/2)
        panelZ = (depth / 2) + (panelDepth / 2);

        if (cabinetData.cornerDirection === 'left') {
            // Левый край панели = левый край шкафа
            // Центр X = левый край шкафа + половина длины панели
            panelX = -width / 2 + panelLength / 2;
        } else { // 'right'
            // Правый край панели = правый край шкафа
            // Центр X = правый край шкафа - половина длины панели
            panelX = width / 2 - panelLength / 2;
        }
    }
    
    // --- Общий код для создания Mesh ---

    const frontFalsePanel = createPanel(panelLength, panelHeight, panelDepth, cabinetMaterial, 'frontal', "frontFalsePanel");

    if (frontFalsePanel) {
        frontFalsePanel.position.set(panelX, panelY, panelZ);
        group.add(frontFalsePanel); 
    } 
    // =======================================================
    // === НОВЫЙ ЭЛЕМЕНТ: ЗАДНЯЯ ВЕРХНЯЯ ЦАРГА ==============
    // =======================================================
    console.log(" - Создание задней верхней царги...");

    // 1. Определяем размеры с новыми именами
    const topStretcherLength = width;
    const topStretcherHeight = 120 / 1000;
    const topStretcherDepth = panelThickness;

    // 2. Создаем геометрию и Mesh
    const rearTopStretcher = createPanel(topStretcherLength, topStretcherHeight, topStretcherDepth, cabinetMaterial, 'frontal', "rearTopStretcher");
    //const topStretcherGeometry = new THREE.BoxGeometry(topStretcherLength, topStretcherHeight, topStretcherDepth);
    //const rearTopStretcher = new THREE.Mesh(topStretcherGeometry, cabinetMaterial.clone());
    //rearTopStretcher.name = "rearTopStretcher";

    // 3. Рассчитываем и применяем позицию
    if(rearTopStretcher){
        const topStretcherX = 0;
        const topStretcherY = (height / 2) - (topStretcherHeight / 2);
        const topStretcherZ = (-depth / 2) - (topStretcherDepth / 2);
        rearTopStretcher.position.set(topStretcherX, topStretcherY, topStretcherZ);
        group.add(rearTopStretcher);
    }

    // =======================================================
    // === НОВЫЙ ЭЛЕМЕНТ: ПЕРЕДНЯЯ ВЕРХНЯЯ ЦАРГА ============
    // =======================================================
    
    // Создаем эту деталь, только если тип ручки НЕ Gola
    if (handleType !== 'gola-profile') {
        console.log(" - Создание передней верхней царги...");

        // 1. Определяем размеры
        const stretcherLength = width - 2 * panelThickness; // Длина (по X)
        const stretcherHeight = 60 / 1000;                  // Высота (по Y)
        const stretcherDepth = panelThickness;               // Глубина (по Z)

        // Используем нашу "фабрику" createPanel, так как это простой бокс
        const frontTopStretcher = createPanel(
            stretcherLength, 
            stretcherHeight, 
            stretcherDepth, 
            cabinetMaterial, 
            'frontal', 
            "frontTopStretcher"
        );
        
        if (frontTopStretcher) {
            // 2. Рассчитываем и применяем позицию
            
            // Позиция по X: 0 (центр)
            const stretcherX = 0;

            // Позиция по Y: верхняя грань совпадает с верхом шкафа
            // Центр Y = верх шкафа - половина высоты царги
            const stretcherY = (height / 2) - (stretcherHeight / 2);

            // Позиция по Z: передняя грань совпадает с передом шкафа
            // Центр Z = перед шкафа - половина глубины царги
            const stretcherZ = (depth / 2) - (stretcherDepth / 2);

            frontTopStretcher.position.set(stretcherX, stretcherY, stretcherZ);

            group.add(frontTopStretcher);
            console.log("   - Передняя верхняя царга создана.");
        }
    } else {
        console.log(" - Передняя верхняя царга не создается (тип ручек: Gola).");
    }

// =======================================================
    // === ОСНОВНОЙ ФАСАД ====================================
    // =======================================================
    console.log(" - Создание основного фасада...");

    // 1. ПАРАМЕТРЫ
    const facadeWidthBase = cabinetData.facadeWidth || 0.45; // Ширина из настроек (включая зазоры?) или чистая? 
    // Обычно facadeWidth - это "номинальная" ширина.
    const facadeGapMeters = cabinetData.facadeGap || 0.003;
    const tb9HandleHeightMeters = 30 / 1000;

    // 2. МАТЕРИАЛ И СТРАТЕГИЯ
    const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
    const { material: baseFacadeMaterial, thickness: facadeThicknessMeters } = MaterialManager.getMaterial(facadeSet);

    let buildStrategy = 'flat';
    let profileData = null;
    let finalMaterial = baseFacadeMaterial;

    if (cabinetData.facadeOverride?.startsWith('aluminum')) {
        buildStrategy = 'aluminum';
    } else if (window.facadeOptionsData['mdf_milled']) {
        const decor = window.facadeOptionsData['mdf_milled'].decors.find(d => d.value === facadeSet?.texture);
        if (decor && decor.profileType === '9slice') {
            buildStrategy = 'milled';
            profileData = decor;
        }
    }

    // 3. РАСЧЕТ ВЫСОТЫ И Y
    let facadeHeight, facadeCenterYOffset;
    const boxAvailableHeightMeters = height; 
    const actualGolaHeightMeters = (handleType === 'gola-profile') 
        ? calculateActualGolaHeight(kitchenGlobalParams.golaMinHeightMm, facadeGapMeters * 1000, boxAvailableHeightMeters * 1000) / 1000
        : 0;

    let addTB9 = false;
    if (handleType === 'aluminum-tv9' && buildStrategy === 'flat') {
        facadeHeight = height - facadeGapMeters - tb9HandleHeightMeters;
        facadeCenterYOffset = -(facadeGapMeters + tb9HandleHeightMeters) / 2;
        addTB9 = true;
    } else if (handleType === 'gola-profile') {
        facadeHeight = height - actualGolaHeightMeters;
        facadeCenterYOffset = -actualGolaHeightMeters / 2;
    } else { 
        facadeHeight = height - facadeGapMeters;
        facadeCenterYOffset = -facadeGapMeters / 2;
    }

    if (facadeHeight <= 0) {
        console.error("Высота фасада <= 0");
        facadeHeight = 0.1; 
    }

    // 4. РАСЧЕТ ШИРИНЫ И X
    // Предполагаем, что facadeWidthBase - это ширина проема/модуля под фасад.
    // Вычитаем зазор.
    const finalFacadeWidth = facadeWidthBase - facadeGapMeters;
    
    let facadeCenterXOffset;

    if (cabinetData.cornerDirection === 'left') {
        // ЛЕВЫЙ УГОЛ: фасад СПРАВА
        // Правый край фасада = правый край шкафа - зазор/2
        // Центр = ПравыйКрайШкафа - Зазор/2 - ШиринаФасада/2
        facadeCenterXOffset = (width / 2) - facadeGapMeters / 2 - (finalFacadeWidth / 2);
    } else { 
        // ПРАВЫЙ УГОЛ: фасад СЛЕВА
        // Левый край фасада = левый край шкафа + зазор/2
        // Центр = ЛевыйКрайШкафа + Зазор/2 + ШиринаФасада/2
        facadeCenterXOffset = (-width / 2) + facadeGapMeters / 2 + (finalFacadeWidth / 2);
    }
    
    // 5. СОЗДАНИЕ (КОНТЕЙНЕР)
    const container = new THREE.Group();
    // Z позиция: Передняя грань корпуса (depth/2) + половина толщины фасада
    const zPos = depth / 2 + facadeThicknessMeters / 2;
    container.position.set(facadeCenterXOffset, facadeCenterYOffset, zPos);
    container.userData.cabinetUUID = cabinetUUID;
    group.add(container);

    // 6. НАПОЛНЕНИЕ
    if (buildStrategy === 'milled') {
        // === ФРЕЗЕРОВКА ===
        createMilledFacade(finalFacadeWidth, facadeHeight, profileData, finalMaterial.clone())
            .then(mesh => {
                container.add(mesh);
                mesh.updateMatrixWorld();
            });

    } else if (buildStrategy === 'aluminum') {
        // === АЛЮМИНИЙ (Пока пусто) ===
        // container.add(createZ1FrameFacade(...));

    } else {
        // === ПЛОСКИЙ (Стандарт) ===
        const facadeMesh = createPanel(
            finalFacadeWidth, 
            facadeHeight, 
            facadeThicknessMeters,
            finalMaterial.clone(), 
            'frontal', 
            'facadePanel'
        );
        
        if (facadeMesh) {
            if (facadeMesh.material.map) {
                MaterialManager.applyTextureTransform(
                    facadeMesh.material, 
                    cabinetData.textureDirection || 'vertical', 
                    finalFacadeWidth, 
                    facadeHeight
                );
            }
            container.add(facadeMesh);
            
            // === РУЧКА TB9 ===
            if (addTB9) {
                const handleLen = finalFacadeWidth;
                const handleWidthMm = 19 / 1000; 
                const handleHeightMm = 30 / 1000;
                
                const hShape = new THREE.Shape();
                hShape.moveTo(0, 0);
                hShape.lineTo(handleWidthMm, 0);
                hShape.lineTo(handleWidthMm, handleHeightMm);
                hShape.lineTo(handleWidthMm - 0.0015, handleHeightMm);
                hShape.lineTo(handleWidthMm - 0.0015, 0.001);
                hShape.lineTo(0, 0.001);
                hShape.closePath();
                
                const hExtrude = { steps: 1, depth: handleLen, bevelEnabled: false };
                // Материал ручки (алюминий)
                const hMat = new THREE.MeshStandardMaterial({ color: 0xAAAAAA, metalness: 0.8, roughness: 0.4 });
                const hMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(hShape, hExtrude), hMat);
                
                hMesh.rotation.y = Math.PI / 2; 
                hMesh.position.x = -handleLen / 2; 
                // Ручка ставится на верхний торец фасада (внутри контейнера Y=0 - это центр фасада)
                hMesh.position.y = facadeHeight / 2; 
                hMesh.position.z = 0.010; 
                
                container.add(hMesh);
            }
        }
    }
    console.log("   - Основной фасад создан.");

    // Получаем материал и толщину фасада (нам это понадобится много раз)
    //const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
    //const { material: baseFacadeMaterial, thickness: facadeThicknessMeters } = MaterialManager.getMaterial(facadeSet);
    
    // ... (код создания `frontTopStretcher`) ...
    // group.add(frontTopStretcher);

    // =======================================================
    // === НОВЫЙ ЭЛЕМЕНТ: ГЛУХОЙ ФАЛЬШ-ФАСАД ===============
    // =======================================================
    console.log(" - Создание глухого фальш-фасада...");

    // 1. Параметры
    let blindPanelLength;
    let useMilled = false; 
    
    // Временные переменные для формы
    const blindFacadeShape = new THREE.Shape();

    // 2. Логика размеров и формы
    if (handleType === 'gola-profile') {
        // --- GOLA (Сложная форма) ---
        const actualGolaHeightMeters = calculateActualGolaHeight(kitchenGlobalParams.golaMinHeightMm, facadeGapMeters * 1000, boxAvailableHeightMeters * 1000) / 1000;
        facadeHeight = height - actualGolaHeightMeters;
        blindPanelLength = 200 / 1000; 
        let horizontalOffset = DELTA_M + facadeThicknessMeters - Math.round(facadeGapMeters / 2 * 1000)/1000;

        blindFacadeShape.moveTo(0, 0);
        blindFacadeShape.lineTo(blindPanelLength, 0);
        blindFacadeShape.lineTo(blindPanelLength, facadeHeight);
        blindFacadeShape.lineTo(blindPanelLength - horizontalOffset, facadeHeight);
        blindFacadeShape.lineTo(blindPanelLength - horizontalOffset, facadeHeight - actualGolaHeightMeters);
        blindFacadeShape.lineTo(0, facadeHeight - actualGolaHeightMeters);
        blindFacadeShape.closePath();
        
        useMilled = false; // Фрезеровка невозможна на сложной форме

    } else {
        // --- STANDARD (Прямоугольник) ---
        facadeHeight = height - (cabinetData.facadeGap || 0.003);
        blindPanelLength = DELTA_M + facadeThicknessMeters;
        
        blindFacadeShape.moveTo(0, 0);
        blindFacadeShape.lineTo(blindPanelLength, 0);
        blindFacadeShape.lineTo(blindPanelLength, facadeHeight);
        blindFacadeShape.lineTo(0, facadeHeight);
        blindFacadeShape.closePath();
        
        // Разрешаем фрезеровку, если она выбрана в стратегии
        useMilled = (buildStrategy === 'milled');
    }

    // 3. Позиционирование (Общие координаты угла детали)
    //let panelX, panelY, panelZ;
    panelY = -height / 2; 
    panelZ = depth / 2;

    if (handleType === 'gola-profile') {
        if (cabinetData.cornerDirection === 'left') {
            const rightEdge = width / 2 - finalFacadeWidth - Math.round(facadeGapMeters / 2 * 1000)/1000;
            panelX = rightEdge - blindPanelLength;
        } else { 
            const leftEdge = -width / 2 + finalFacadeWidth + Math.round(facadeGapMeters / 2 * 1000)/1000;
            panelX = leftEdge + blindPanelLength;
            panelZ += facadeThicknessMeters; 
            // Поворот будет применен к мешу или контейнеру
        }
    } else {
        if (cabinetData.cornerDirection === 'left') {
            const pivotPositionFromLeft = cabinetData.width - (cabinetData.facadeWidth || 0.45) - DELTA_M;
            panelX = pivotPositionFromLeft - facadeThicknessMeters - cabinetData.width / 2;
        } else { 
            const pivotPositionFromLeft = (cabinetData.facadeWidth || 0.45) + DELTA_M;
            panelX = pivotPositionFromLeft + facadeThicknessMeters - blindPanelLength;
            panelX -= width/2;
        }
    }

    // 4. Создание
    if (useMilled) {
        // === ВАРИАНТ 1: ФРЕЗЕРОВКА (Только прямоугольник) ===
        const container = new THREE.Group();
        
        // Центрируем контейнер
        const cx = panelX + blindPanelLength / 2;
        const cy = panelY + facadeHeight / 2;
        const cz = panelZ + facadeThicknessMeters / 2;
        
        container.position.set(cx, cy, cz);
        container.userData.cabinetUUID = cabinetUUID;
        group.add(container);

        createMilledFacade(blindPanelLength, facadeHeight, profileData, finalMaterial.clone())
            .then(mesh => {
                container.add(mesh);
                mesh.updateMatrixWorld();
            });

    } else {
        // === ВАРИАНТ 2: ПЛОСКИЙ (Shape) ===
        const extrudeSettings = { steps: 1, depth: facadeThicknessMeters, bevelEnabled: false };
        
        const blindFacadePanel = createExtrudedPanel(
            blindFacadeShape, 
            extrudeSettings, 
            finalMaterial.clone(), 
            'frontal', 
            'blindFacadePanel'
        );

        if (blindFacadePanel) {
            blindFacadePanel.position.set(panelX, panelY, panelZ);
            
            // Поворот для Gola Right
            if (handleType === 'gola-profile' && cabinetData.cornerDirection !== 'left') {
                blindFacadePanel.rotation.y = -Math.PI;
            }

            if (blindFacadePanel.material.map) {
                MaterialManager.applyTextureToExtruded(
                    blindFacadePanel,
                    cabinetData.textureDirection,
                    blindPanelLength,
                    facadeHeight
                );
            }
            
            group.add(blindFacadePanel);
        }
    }
    console.log("   - Глухой фальш-фасад создан.");

    // =======================================================
    // === НОВЫЙ ЭЛЕМЕНТ: ДИСТАНЦИОННАЯ ПРОКЛАДКА ===========
    // =======================================================
    
    // Создаем эту деталь, только если тип ручки стандартный или врезная

    if (handleType === 'gola-profile') {
        // =======================================================
        // === НОВЫЙ ЭЛЕМЕНТ: СПЕЙСЕР ДЛЯ GOLA-ПРОФИЛЯ ========
        // =======================================================
        console.log("   - Создание спейсера для Gola...");

        // 1. Размеры
        const spacerWidth = 80 / 1000; // Ширина (по X)
        // Высота и глубина (толщина) такие же, как у глухого фасада
        const spacerHeight = facadeHeight; 
        const spacerDepth = facadeThicknessMeters;

        // 2. Создаем контур (Shape). Он тоже должен иметь вырез, как и глухой фасад.
        // Мы можем просто скопировать код создания `blindFacadeShape`.
        const golaSpacerShape = new THREE.Shape();
        // ... (скопируйте сюда ваш код создания Shape с вырезом для Gola,
        // но используйте `spacerWidth` вместо `blindPanelLength`)
        // Пример (если это простой прямоугольник, пока без выреза):
        golaSpacerShape.moveTo(0, 0);
        golaSpacerShape.lineTo(spacerWidth, 0);
        golaSpacerShape.lineTo(spacerWidth, spacerHeight);
        golaSpacerShape.lineTo(spacerWidth - facadeThicknessMeters, spacerHeight);
        golaSpacerShape.lineTo(spacerWidth - facadeThicknessMeters, spacerHeight - actualGolaHeightMeters);
        golaSpacerShape.lineTo(0, spacerHeight - actualGolaHeightMeters);
        golaSpacerShape.closePath();
        
        // 3. Настройки экструзии
        const spacerExtrudeSettings = {
            steps: 1,
            depth: spacerDepth,
            bevelEnabled: false
        };

        // 4. Используем "фабрику"
        const golaSpacerPanel = createExtrudedPanel(
            golaSpacerShape,
            spacerExtrudeSettings,
            baseFacadeMaterial, // Материал фасада
            'frontal',
            'golaSpacerPanel'
        );

        if (golaSpacerPanel) {
            // 5. Позиционирование
            const panelY = -height / 2; // Нижняя грань = низ шкафа
            let panelZ = depth / 2 + facadeThicknessMeters;     // Задняя грань = перед шкафа

            let panelX;
            if (cabinetData.cornerDirection === 'left') {
                // Правая грань = `width/2 - facadeWidth - DELTA_M`
                // Позиция X (левая грань) = Правая грань - ширина спейсера
                panelX = (width / 2 - facadeWidth - DELTA_M) - spacerWidth;
            } else { // 'right'
                // Левая грань = `-width/2 + facadeWidth + DELTA_M`
                // Позиция X (левая грань) = Левая грань
                panelX = -width / 2 + facadeWidth + DELTA_M;
                panelZ += facadeThicknessMeters;
            }
            
            golaSpacerPanel.position.set(panelX, panelY, panelZ);

            // Если для правого шкафа нужно зеркальное отражение, как и для глухого фасада
            if (cabinetData.cornerDirection === 'right') {
                golaSpacerPanel.rotation.y = Math.PI; // Поворот на 180 градусов
                // Может потребоваться доп. смещение после поворота
                golaSpacerPanel.position.x += spacerWidth; 
            }

            MaterialManager.applyTextureToExtruded(
                golaSpacerPanel,
                cabinetData.textureDirection, // <-- Передаем направление ИЗ ФАСАДА
                spacerWidth,             // Ширина Shape
                spacerHeight                  // Высота Shape
            );

            group.add(golaSpacerPanel);
            console.log("     - Спейсер для Gola создан.");
        }

        // =======================================================
        // === НОВЫЙ ЭЛЕМЕНТ: GOLA-ПРОФИЛЬ (2 ФРАГМЕНТА) =======
        // =======================================================
        console.log("   - Создание Gola-профиля...");

        const golaMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xAAAAAA, metalness: 0.8, roughness: 0.4 
        });
        
        // --- ЭЛЕМЕНТ 1: Длинный фрагмент (вдоль основного фасада) ---

        // 1.1. Длина
        const golaLength1 = facadeWidth + DELTA_M + facadeThicknessMeters + (27 / 1000);
        
        // 1.2. Создаем меш
        const golaProfile1 = createGolaProfileMesh(golaLength1, golaMaterial, "golaProfile_main");
        
        if (golaProfile1) {
            // 1.3. Позиционирование (аналогично распашному шкафу)
            golaProfile1.rotation.y = Math.PI / 2; // Поворачиваем, чтобы "положить" вдоль X
            
            const golaTopCenterY = height / 2 - (58 / 1000); // Центр высоты профиля (58мм)
            const golaTopCenterZ = depth / 2;                   // Задняя точка на передней грани корпуса
            
            let golaTopCenterX;
            if (cabinetData.cornerDirection === 'left') {
                // Правая грань профиля = правая грань шкафа
                golaTopCenterX = width / 2 - golaLength1 / 2;
            } else { // 'right'
                // Левая грань профиля = левая грань шкафа
                golaTopCenterX = -width / 2 + golaLength1 / 2;
            }
            
            golaProfile1.position.set(golaTopCenterX, golaTopCenterY, golaTopCenterZ);
            group.add(golaProfile1);
            console.log("     - Gola-профиль (основной) создан.");
        }
        
        // --- ЭЛЕМЕНТ 2: Короткий угловой фрагмент ---

        // 2.1. Длина
        const golaLength2 = facadeThicknessMeters * 2 + (27 / 1000);

        // 2.2. Создаем меш
        const golaProfile2 = createGolaProfileMesh(golaLength2, golaMaterial, "golaProfile_corner");

        if (golaProfile2) {
            // 2.3. Позиционирование
            const golaY = height / 2 - (58 / 1000); // Та же высота, что и у первого
            
            // Позиция X: в зоне "пояса"
            let golaX;
            if (cabinetData.cornerDirection === 'left') {
                const pivotPositionFromLeft = width - facadeWidth - DELTA_M;
                golaX = pivotPositionFromLeft - width / 2 - facadeThicknessMeters;
                golaProfile2.rotation.y = Math.PI; // Поворачиваем на +90 относительно первого
            } else { // 'right'
                const pivotPositionFromLeft = facadeWidth + DELTA_M;
                golaX = pivotPositionFromLeft - width / 2 + facadeThicknessMeters;
                golaProfile2.rotation.y = 0; // Поворачиваем на -90 относительно первого
            }
            
            // Z-координата будет такой же, как у первого
            const golaZ = depth / 2 + facadeThicknessMeters * 2 - golaLength2 / 2;

            golaProfile2.position.set(golaX, golaY, golaZ);
            group.add(golaProfile2);
            console.log("     - Gola-профиль (угловой) создан.");
        }



    } else {
        console.log(" - Создание дистанционной прокладки...");
        
        const spacerLength = Math.round((DELTA_M - (facadeGapMeters / 2)) * 1000) / 1000;
        const spacerHeight = height - facadeGapMeters;
        const spacerThickness = facadeThicknessMeters; 
        
        if (spacerLength > 0) {
            // Создаем контейнер
            const container = new THREE.Group();
            
            // Позиционирование контейнера (Центр детали)
            const panelY = -height / 2 + spacerHeight / 2;
            
            // Твой расчет Z центра:
            const panelZ = (depth / 2) + facadeThicknessMeters + (spacerLength / 2);
            
            let panelX;
            // Твой расчет X центра:
            if (cabinetData.cornerDirection === 'left') {
                const pivotPositionFromLeft = cabinetData.width - (cabinetData.facadeWidth || 0.45) - DELTA_M;
                const blindFacadeLeftX = pivotPositionFromLeft - facadeThicknessMeters - cabinetData.width / 2;
                panelX = blindFacadeLeftX + facadeThicknessMeters / 2;
            } else { 
                const pivotPositionFromLeft = (cabinetData.facadeWidth || 0.45) + DELTA_M;
                const blindFacadeRightX = pivotPositionFromLeft + facadeThicknessMeters - cabinetData.width / 2;
                panelX = blindFacadeRightX - facadeThicknessMeters / 2;
            }
            
            container.position.set(panelX, panelY, panelZ);
            
            // ПОВОРОТ: Прокладка стоит вдоль Z.
            // Лицо прокладки должно смотреть? (Обычно наружу от угла).
            // Если Left Corner: прокладка стоит справа от фальш-фасада. Смотрит вправо (+X).
            // Если Right Corner: прокладка стоит слева. Смотрит влево (-X).
            
            if (cabinetData.cornerDirection === 'left') {
                // Смотрит вправо (+X). Поворот -90 (-PI/2).
                container.rotation.y = Math.PI / 2;
            } else {
                // Смотрит влево (-X). Поворот +90 (PI/2).
                container.rotation.y = -Math.PI / 2;
            }
            
            container.userData.cabinetUUID = cabinetUUID;
            group.add(container);


            // ГЕНЕРАЦИЯ ВНУТРИ КОНТЕЙНЕРА
            if (buildStrategy === 'milled') {
                // Фрезеровка
                // Ширина = spacerLength. Высота = spacerHeight.
                createMilledFacade(spacerLength, spacerHeight, profileData, finalMaterial.clone())
                    .then(mesh => {
                        container.add(mesh);
                        mesh.updateMatrixWorld();
                    });

            } else if (buildStrategy === 'aluminum') {
                // ...
            } else {
                // Плоский (как было, но внутри контейнера)
                // createPanel строит фронтально (w, h, th).
                // Контейнер уже повернут.
                const mesh = createPanel(
                    spacerLength, spacerHeight, facadeThicknessMeters, 
                    finalMaterial.clone(), 'frontal', 'spacerPanel'
                );
                
                if (mesh) {
                    if (mesh.material.map) {
                        MaterialManager.applyTextureTransform(
                            mesh.material, cabinetData.textureDirection || 'vertical', spacerLength, spacerHeight
                        );
                    }
                    // mesh в 0,0,0 контейнера
                    container.add(mesh);
                }
            }
            
            console.log("   - Дистанционная прокладка создана (Strategy: " + buildStrategy + ").");
        }

        // =======================================================
        // === НОВЫЙ ЭЛЕМЕНТ: ДЕРЖАТЕЛЬ ПРОКЛАДКИ ==============
        // =======================================================
        console.log(" - Создание держателя прокладки...");
        
        // 1. Определяем размеры
        const holderLength = DELTA_M;            // Длина (по Z шкафа)
        const holderHeight = height;             // Высота (по Y)
        const holderThickness = panelThickness;  // Толщина (по X)
        
        if (holderLength > 0) {
            // 2. Используем createPanel, передавая материал КОРПУСА
            const spacerHolder = createPanel(
                holderThickness, // W -> толщина
                holderHeight,    // H -> высота
                holderLength,    // D -> длина
                cabinetMaterial, // <== МАТЕРИАЛ КОРПУСА
                'vertical',
                "spacerHolder"
            );
            
            if (spacerHolder) {
                // 3. Рассчитываем и применяем позицию
                
                // Позиция по Y: центр по высоте
                const panelY = 0;
                
                // Позиция по Z: передняя грань = передняя грань фасада
                const panelZ = (depth / 2) + facadeThicknessMeters + holderLength / 2;

                // Позиция по X: примыкает к дистанционной прокладке
                let panelX;
                if (cabinetData.cornerDirection === 'left') {
                    // --- ЛЕВЫЙ УГОЛ ---
                    // Правая грань держателя = левая грань прокладки
                    // Левая грань прокладки = X-позиция центра прокладки - половина ее толщины
                    // X-позиция центра прокладки = `blindFacadeLeftX + spacerThickness / 2`
                    // Значит, левая грань прокладки = `blindFacadeLeftX`
                    const pivotPositionFromLeft = cabinetData.width - facadeWidth - DELTA_M;
                    const blindFacadeLeftX = pivotPositionFromLeft - facadeThicknessMeters - cabinetData.width / 2;
                    const spacerLeftX = blindFacadeLeftX;
                    
                    // Центр X держателя = левая грань прокладки - половина толщины держателя
                    panelX = spacerLeftX - holderThickness / 2;
                    
                } else { // 'right'
                    // --- ПРАВЫЙ УГОЛ ---
                    // Левая грань держателя = правая грань прокладки
                    const pivotPositionFromLeft = facadeWidth + DELTA_M;
                    const blindFacadeRightX = pivotPositionFromLeft + facadeThicknessMeters - cabinetData.width / 2;
                    const spacerRightX = blindFacadeRightX;
                    
                    // Центр X держателя = правая грань прокладки + половина толщины держателя
                    panelX = spacerRightX + holderThickness / 2;
                }
                
                spacerHolder.position.set(panelX, panelY, panelZ);
                
                // 4. Текстура (если у материала корпуса есть текстура)
                // (Этот блок можно скопировать и адаптировать для `spacerHolder`, если нужно)
                
                group.add(spacerHolder);
                console.log("   - Держатель прокладки создан.");

                // 4. Создаем КЛОН
                const supportPanel = spacerHolder.clone();
                supportPanel.name = "supportPanel";

                // Отключаем у самого клона (на всякий случай) и у его группы ребер
                //supportPanel.raycast = () => {};
                const clonedEdgesGroup = supportPanel.getObjectByName("spacerHolder_edges"); // Ищем группу ребер по имени
                if (clonedEdgesGroup) {
                    clonedEdgesGroup.raycast = () => {};
                    
                    // И рекурсивно отключаем у всех линий внутри
                    clonedEdgesGroup.traverse((child) => {
                        if (child.isLine || child.isLineLoop || child.isLineSegments) {
                            child.raycast = () => {};
                        }
                    });
                }
                
                // 5. Рассчитываем и применяем НОВУЮ позицию для КЛОНА
                let clonePanelX;
                const offsetFromEdge = 60 / 1000;

                if (cabinetData.cornerDirection === 'left') {
                    clonePanelX = -width / 2 + offsetFromEdge;
                } else { // 'right'
                    clonePanelX = width / 2 - offsetFromEdge;
                }
                
                // Y и Z у клона такие же, как у оригинала
                supportPanel.position.set(clonePanelX, panelY, panelZ);
                group.add(supportPanel);
                console.log("   - Второй держатель (клон) создан.");
            }
        }


    }
    // =======================================================
    
    group.userData.isDetailedCabinet = true;
    group.userData.objectType = 'cabinet';
    return group;
}

/**
 * Создает детализированную модель ВЕРХНЕГО УГЛОВОГО шкафа.
 * @param {object} cabinetData - Объект данных шкафа.
 * @param {object} kitchenGlobalParams - Глобальные параметры кухни.
 * @param {object} MaterialManager - Менеджер материалов.
 * @param {function} getPanelThickness - Функция для получения толщины панели.
 * @returns {THREE.Group | null}
 */
export function createDetailedUpperCornerGeometry(cabinetData, kitchenGlobalParams, MaterialManager, getPanelThickness) {
    if (!cabinetData) {
        console.error("createDetailedUpperCornerGeometry: cabinetData не предоставлен.");
        return null;
    }

    const group = new THREE.Group();
    group.userData.isDetailedCabinet = true;
    group.userData.objectType = 'cabinet';

    // --- Параметры ---
    const { width, height, depth, cornerDirection = 'left' } = cabinetData;
    const cabinetUUID = cabinetData.mesh?.uuid;
    const panelThickness = getPanelThickness();
    const facadeWidth = cabinetData.facadeWidth || 0.45; // 450мм по умолчанию
    const DELTA_M = cabinetData.cornerElementWidth || 0.018; // 60мм по умолчанию для верхнего
    
    // --- Материалы ---
    const bodyMaterial = MaterialManager.getBodyMaterial(cabinetData);
    
    console.log(`--- Начало детализации UpperCorner: ${width*1000}x${height*1000}x${depth*1000} ---`);

    // ==================================================================
    // 1. Дно
    // ==================================================================
    
    // 1.1. Расчет размеров и параметров
    const bottomConstruction = cabinetData.bottomConstruction || 'inset';
    const bottomFrontOffsetM = (cabinetData.bottomFrontOffset ?? 0) / 1000;
    const bottomOverhangRearM = (cabinetData.bottomOverhangRear ?? 0) / 1000;
    const backPanelOffsetM = (cabinetData.backPanelOffset ?? 2) / 1000;

    let bottomPanelLength; // Длина по X
    let outerSideExtention;
    if (bottomConstruction.includes('inset')) {
        bottomPanelLength = width - 2 * panelThickness;
        outerSideExtention = panelThickness;
    } else { // overlay
        bottomPanelLength = width - panelThickness;
        outerSideExtention = 0;
    }

    // Глубина по Z, как у прямого шкафа
    const bottomPanelWidth = depth - bottomFrontOffsetM + bottomOverhangRearM - backPanelOffsetM;
    const bottomPanelThickness = panelThickness; // Толщина "выдавливания"

    // 1.2. Создание Shape и экструзия
    let bottomShape;
    const isGolaBottom = bottomConstruction.includes('Gola');

    if (isGolaBottom) {
        // --- Логика для дна С ВЫРЕЗОМ под Gola-профиль ---
        bottomShape = new THREE.Shape();
        const golaCutoutDepth = 20 / 1000;  // Глубина паза под профиль
        const golaCutoutHeight = 20 / 1000; // Высота паза
        const addGolaDepth = golaCutoutDepth - panelThickness;
        const golaCutLength = facadeWidth - outerSideExtention + DELTA_M + 0.06;
        
        if (cornerDirection === 'left') {
            // Контур для ЛЕВОГО шкафа (вырез спереди-справа)
            bottomShape.moveTo(0, 0); // задний-левый угол
            bottomShape.lineTo(bottomPanelLength, 0); // ->  до правого края
            bottomShape.lineTo(bottomPanelLength, bottomPanelWidth - addGolaDepth); // ^ вверх
            bottomShape.lineTo(bottomPanelLength - golaCutLength, bottomPanelWidth - addGolaDepth); // <- до golaCutLength
            bottomShape.lineTo(bottomPanelLength - golaCutLength, bottomPanelWidth); // ^ до передне-правого
            bottomShape.lineTo(0, bottomPanelWidth); // <- до передне-левого
            bottomShape.closePath();
        } else { // 'right'
            // ЗЕРКАЛЬНЫЙ контур для ПРАВОГО шкафа (вырез спереди-слева)
            bottomShape.moveTo(0, 0); // начинаем с отступом
            bottomShape.lineTo(bottomPanelLength, 0); // -> до правого края
            bottomShape.lineTo(bottomPanelLength, bottomPanelWidth); // ^ до передне-правого
            bottomShape.lineTo(golaCutLength, bottomPanelWidth); // <- до передне-левого
            bottomShape.lineTo(golaCutLength, bottomPanelWidth - addGolaDepth); // v вниз
            bottomShape.lineTo(0, bottomPanelWidth - addGolaDepth); // -> до конца выреза
            bottomShape.closePath();
        }

    } else {
        // --- Логика для простого ПРЯМОУГОЛЬНОГО дна ---
        bottomShape = new THREE.Shape();
        bottomShape.moveTo(0, 0);
        bottomShape.lineTo(bottomPanelLength, 0);
        bottomShape.lineTo(bottomPanelLength, bottomPanelWidth);
        bottomShape.lineTo(0, bottomPanelWidth);
        bottomShape.closePath();
    }

    const extrudeSettings = {
        steps: 1,
        depth: bottomPanelThickness,
        bevelEnabled: false
    };

    const bottomPanel = createExtrudedPanel(bottomShape, extrudeSettings, bodyMaterial, 'horizontal', 'bottomPanel_corner');

    // 1.3. Позиционирование
    if (bottomPanel) {
        // Сначала поворачиваем, чтобы Shape лег в плоскость XZ
        bottomPanel.rotation.x = Math.PI / 2;

        // --- Новая, правильная логика позиционирования ---

        // Позиция по Y:
        // Нижняя грань дна (-height/2) = нижняя грань шкафа (-height/2)
        // Но так как pivot у Shape в (0,0), а мы повернули геометрию,
        // то ее "низ" по Y тоже в 0.
        // Значит, позиция по Y должна быть равна нижней грани шкафа.
        const bottomPanelPosY = -height / 2 + bottomPanelThickness;
        
        // Позиция по Z:
        // Передняя грань дна = передняя грань шкафа - отступ спереди
        const requiredFrontFaceZ = depth / 2 - bottomFrontOffsetM;
        // Передняя грань нашей повернутой геометрии (бывшая ось Y у Shape) находится в `position.z + bottomPanelWidth`.
        // => position.z + bottomPanelWidth = requiredFrontFaceZ
        const bottomPanelPosZ = requiredFrontFaceZ - bottomPanelWidth;

        // Асимметричная позиция по X:
        let bottomPanelPosX;
        if (cornerDirection === 'left') {
            // левая грань дна = левая грань шкафа + толщина
            // Левая грань нашей геометрии (бывшая ось X у Shape) находится в `position.x`.
            bottomPanelPosX = -width / 2 + panelThickness;
        } else { // right
            // правая грань дна = правая грань шкафа - толщина
            // Правая грань геометрии = position.x + bottomPanelLength
            const requiredRightFaceX = width / 2 - panelThickness;
            bottomPanelPosX = requiredRightFaceX - bottomPanelLength;
        }
        
        bottomPanel.position.set(bottomPanelPosX, bottomPanelPosY, bottomPanelPosZ);
        bottomPanel.userData.cabinetUUID = cabinetUUID;
        MaterialManager.applyTextureToExtruded(bottomPanel, 'horizontal', bottomPanelLength, bottomPanelWidth);
        group.add(bottomPanel);
        console.log(` - Дно (угловое) создано.`);
    }

    // ==================================================================
    // 2. Ближняя боковина (у основной стены)
    // ==================================================================

    // 2.1. Расчет размеров и параметров
    const nearSideHeight = height; // Полная высота
    const nearSideThickness = panelThickness;

    let nearSideDepth;
    let nearSideCenterZ;

    if (cornerDirection === 'left') {
        // Для левого шкафа ближняя боковина - левая. Берем ее выступ.
        const leftSideOverhangM = (cabinetData.leftSideOverhangRear ?? 0) / 1000;
        nearSideDepth = depth + leftSideOverhangM;
        // Сдвигаем центр назад на половину выступа, чтобы передняя грань осталась на месте
        nearSideCenterZ = -leftSideOverhangM / 2;
    } else { // right
        // Для правого шкафа ближняя боковина - правая.
        const rightSideOverhangM = (cabinetData.rightSideOverhangRear ?? 0) / 1000;
        nearSideDepth = depth + rightSideOverhangM;
        nearSideCenterZ = -rightSideOverhangM / 2;
    }

    // 2.2. Создание детали
    const nearSidePanel = createPanel(nearSideThickness, nearSideHeight, nearSideDepth, bodyMaterial, 'vertical', 'nearSidePanel');

    // 2.3. Позиционирование
    if (nearSidePanel) {
        // Позиция по Y: нижняя грань = низ шкафа
        const nearSideCenterY = -height / 2 + nearSideHeight / 2; // = 0
        
        // Позиция по X: зависит от направления
        let nearSideCenterX;
        if (cornerDirection === 'left') {
            // Левая боковина
            nearSideCenterX = -width / 2 + nearSideThickness / 2;
        } else { // right
            // Правая боковина
            nearSideCenterX = width / 2 - nearSideThickness / 2;
        }
        
        nearSidePanel.position.set(nearSideCenterX, nearSideCenterY, nearSideCenterZ);
        nearSidePanel.userData.cabinetUUID = cabinetUUID;
        MaterialManager.applyTexture(nearSidePanel, cabinetData.textureDirection, 'vertical');
        group.add(nearSidePanel);
        console.log(` - Ближняя боковина создана.`);
    }

    // ==================================================================
    // 3. Дальняя боковина (у смежной стены)
    // ==================================================================

    // 3.1. Расчет размеров и параметров (копируем логику из createDetailedUpperSwingGeometry)
    let farSideHeight;
    let farSideCenterY;

    if (bottomConstruction.includes('overlay')) {
        farSideHeight = height - panelThickness;
        farSideCenterY = (height / 2) - (farSideHeight / 2);
    } else { // 'inset' и по умолчанию
        farSideHeight = height;
        farSideCenterY = 0;
    }
    const farSideThickness = panelThickness;

    let farSideDepth;
    let farSideCenterZ;

    if (cornerDirection === 'left') {
        // Для левого шкафа дальняя боковина - ПРАВАЯ. Берем ее выступ.
        const rightSideOverhangM = (cabinetData.rightSideOverhangRear ?? 0) / 1000;
        farSideDepth = depth + rightSideOverhangM;
        farSideCenterZ = -rightSideOverhangM / 2;
    } else { // right
        // Для правого шкафа дальняя боковина - ЛЕВАЯ.
        const leftSideOverhangM = (cabinetData.leftSideOverhangRear ?? 0) / 1000;
        farSideDepth = depth + leftSideOverhangM;
        farSideCenterZ = -leftSideOverhangM / 2;
    }

    // 3.2. Создание детали
    const farSidePanel = createPanel(farSideThickness, farSideHeight, farSideDepth, bodyMaterial, 'vertical', 'farSidePanel');

    // 3.3. Позиционирование
    if (farSidePanel) {
        let farSideCenterX;
        if (cornerDirection === 'left') {
            // Левый шкаф -> дальняя боковина ПРАВАЯ
            farSideCenterX = width / 2 - farSideThickness / 2;
        } else { // right
            // Правый шкаф -> дальняя боковина ЛЕВАЯ
            farSideCenterX = -width / 2 + farSideThickness / 2;
        }

        farSidePanel.position.set(farSideCenterX, farSideCenterY, farSideCenterZ);
        farSidePanel.userData.cabinetUUID = cabinetUUID;
        MaterialManager.applyTexture(farSidePanel, cabinetData.textureDirection, 'vertical');
        group.add(farSidePanel);
        console.log(` - Дальняя боковина создана.`);
    }

    // ==================================================================
    // 4. Крыша
    // ==================================================================

    // 4.1. Расчет размеров и параметров
    // Крыша всегда вкладная.
    // Ее длина (по X) зависит от того, является ли дно накладным.
    // Если дно накладное, то боковины уже, и крыша тоже должна быть уже.
    let topPanelLength;
    if (bottomConstruction.includes('overlay')) {
        // Если дно накладное, боковины сдвинуты внутрь, но общая ширина та же.
        // Ширина между боковинами = общая ширина - 2 * толщина.
        topPanelLength = width - 2 * panelThickness;
    } else { // вкладное
        // Для вкладного дна ширина между боковинами такая же
        topPanelLength = width - 2 * panelThickness;
    }

    const topPanelThickness = panelThickness;
    // Глубина крыши = общая глубина - углубление для задней стенки.
    const topPanelWidth = depth - backPanelOffsetM;

    // 4.2. Создание детали
    const topPanel = createPanel(topPanelLength, topPanelThickness, topPanelWidth, bodyMaterial, 'horizontal', 'topPanel_corner');

    // 4.3. Позиционирование
    if (topPanel) {
        // Позиция по Y: верхняя грань = верх шкафа
        const topPanelCenterY = height / 2 - topPanelThickness / 2;
        
        // Позиция по Z: передняя грань = перед шкафа
        const requiredFrontFaceZ = depth / 2;
        const currentFrontFaceZ = topPanelWidth / 2;
        const topPanelCenterZ = requiredFrontFaceZ - currentFrontFaceZ;
        
        // Асимметричная позиция по X (как у дна)
        let topPanelCenterX;
        if (cornerDirection === 'left') {
            const requiredLeftFaceX = -width / 2 + panelThickness;
            topPanelCenterX = requiredLeftFaceX + topPanelLength / 2;
        } else { // right
            const requiredRightFaceX = width / 2 - panelThickness;
            topPanelCenterX = requiredRightFaceX - topPanelLength / 2;
        }

        topPanel.position.set(topPanelCenterX, topPanelCenterY, topPanelCenterZ);
        topPanel.userData.cabinetUUID = cabinetUUID;
        MaterialManager.applyTexture(topPanel, cabinetData.textureDirection, 'horizontal');
        group.add(topPanel);

        console.log(` - Крыша создана.`);
    }

    // ==================================================================
    // 5. Задняя стенка (ДВП/ХДФ)
    // ==================================================================
    const hasBackPanel = cabinetData.backPanel || 'yes';

    if (hasBackPanel === 'yes') {
        // 5.1. Расчет размеров и параметров (полная копия из swingUpper)
        const backPanelThickness = 3 / 1000;
        const backPanelMaterial = new THREE.MeshStandardMaterial({
            color: 0xf0f0f0,
            roughness: 0.9,
            metalness: 0.0,
            name: "BackPanelMaterial"
        });

        const leftSideOverhangM = (cabinetData.leftSideOverhangRear ?? 0) / 1000;
        const rightSideOverhangM = (cabinetData.rightSideOverhangRear ?? 0) / 1000;
        
        // Отступы по бокам
        const backPanelOffsetX_Left = (leftSideOverhangM > 0) ? (10 / 1000) : (2 / 1000);
        const backPanelOffsetX_Right = (rightSideOverhangM > 0) ? (10 / 1000) : (2 / 1000);
        const backPanelWidth = width - backPanelOffsetX_Left - backPanelOffsetX_Right;

        // Отступы по высоте
        const bottomOverhangRearM = (cabinetData.bottomOverhangRear ?? 0) / 1000;
        const isOverlayBottom = (cabinetData.bottomConstruction || 'inset').includes('overlay');
        const backPanelOffsetY_Top = 2 / 1000;
        let backPanelOffsetY_Bottom;
        if (bottomOverhangRearM > 0) {
            backPanelOffsetY_Bottom = 10 / 1000;
        } else if (isOverlayBottom && backPanelOffsetM > 0) {
            backPanelOffsetY_Bottom = 10 / 1000;
        } else {
            backPanelOffsetY_Bottom = 2 / 1000;
        }
        const backPanelHeight = height - backPanelOffsetY_Top - backPanelOffsetY_Bottom;

        // 5.2. Создание детали
        const backPanel = createPanel(backPanelWidth, backPanelHeight, backPanelThickness, backPanelMaterial, 'frontal', 'backPanel_corner');

        // 5.3. Позиционирование
        if (backPanel) {
            // По X: левая грань ЗС = левая грань шкафа + отступ слева
            const requiredLeftFaceX = -width / 2 + backPanelOffsetX_Left;
            const backPanelCenterX = requiredLeftFaceX + backPanelWidth / 2;

            // По Y: верхняя грань ЗС = верхняя грань шкафа - отступ сверху
            const requiredTopFaceY = height / 2 - backPanelOffsetY_Top;
            const backPanelCenterY = requiredTopFaceY - backPanelHeight / 2;
            
            // По Z: передняя грань ЗС = задняя грань шкафа + углубление ЗС
            const requiredFrontFaceZ = -depth / 2 + backPanelOffsetM;
            const backPanelCenterZ = requiredFrontFaceZ - backPanelThickness / 2;
            
            backPanel.position.set(backPanelCenterX, backPanelCenterY, backPanelCenterZ);
            backPanel.userData.cabinetUUID = cabinetUUID;
            group.add(backPanel);
            
            console.log(` - Задняя стенка создана.`);
        }
    }

    // ==================================================================
    // 6. Полки
    // ==================================================================
    const shelfCount = parseInt(cabinetData.shelfCount) || 0;
    const shelfLayout = cabinetData.shelfLayout || 'even';

    if (shelfCount > 0) {
        // 6.1. Расчет размеров полок
        const shelfType = cabinetData.shelfType || 'confirmat';
        const shelfThickness = panelThickness;

        let shelfLength; // Длина по X
        if (shelfType === 'confirmat') {
            shelfLength = width - 2 * panelThickness;
        } else { // shelfHolder, secura7
            shelfLength = width - 2 * panelThickness - (2 / 1000);
        }
        
        // --- ИЗМЕНЕНИЕ: Новая формула для глубины полки ---
        const shelfDepth = depth - backPanelOffsetM - panelThickness - (2 / 1000);
        
        if (shelfLength <= 0 || shelfDepth <= 0) {
            console.warn(" - Невозможно создать полки: расчетная ширина или глубина <= 0.");
        } else {
            // 6.2. Расчет доступного пространства и Y-позиций (полная копия из swingUpper)
            const availableSpaceTopY = (height / 2) - panelThickness;
            const availableSpaceBottomY = -height / 2 + panelThickness;
            
            const shelfPositionsY = [];
            if (shelfLayout === 'uneven' && shelfCount > 0) {
                // ... (логика для неравномерного распределения, полная копия)
                const topShelfSpaceM = (cabinetData.topShelfSpace || 300) / 1000;
                const topShelfTopFaceY = availableSpaceTopY - topShelfSpaceM;
                const topShelfCenterY = topShelfTopFaceY - (shelfThickness / 2);
                shelfPositionsY.push(topShelfCenterY);
                if (shelfCount > 1) {
                    const remainingShelfCount = shelfCount - 1;
                    const remainingSpaceTopY = topShelfCenterY - (shelfThickness / 2);
                    const remainingAvailableHeight = remainingSpaceTopY - availableSpaceBottomY;
                    if (remainingAvailableHeight > 0) {
                        const shelfStepY = remainingAvailableHeight / (remainingShelfCount + 1);
                        for (let i = 1; i <= remainingShelfCount; i++) {
                            shelfPositionsY.push(availableSpaceBottomY + shelfStepY * i);
                        }
                    }
                }
            } else if (shelfCount > 0) {
                // ... (логика для равномерного распределения, полная копия)
                const availableHeight = availableSpaceTopY - availableSpaceBottomY;
                const shelfStepY = availableHeight / (shelfCount + 1);
                for (let i = 1; i <= shelfCount; i++) {
                    shelfPositionsY.push(availableSpaceBottomY + shelfStepY * i);
                }
            }

            // 6.3. Создание и позиционирование полок в цикле
            shelfPositionsY.forEach((shelfCenterY_raw, index) => {
                const shelfCenterY = Math.round(shelfCenterY_raw * 1000) / 1000;
                const shelfMesh = createPanel(shelfLength, shelfThickness, shelfDepth, bodyMaterial, 'horizontal', `shelf_${index + 1}`);
                
                if (shelfMesh) {
                    // Позиция по Z: передняя грань = передняя грань шкафа
                    const requiredFrontFaceZ = -depth / 2;
                    const shelfCenterZ = requiredFrontFaceZ + shelfDepth / 2;
                    
                    // --- ИЗМЕНЕНИЕ: Асимметричная позиция по X ---
                    let shelfCenterX = 0;
                    
                    shelfMesh.position.set(shelfCenterX, shelfCenterY, shelfCenterZ);
                    shelfMesh.userData.cabinetUUID = cabinetUUID;
                    group.add(shelfMesh);
                }
            });
            console.log(` - Полки созданы: ${shelfCount} шт.`);
        }
    }

    // ==================================================================
    // 7. Передняя заглушка
    // ==================================================================

    // 7.1. Расчет размеров и параметров
    const plugHeight = height - panelThickness;
    // Ширина = ширина шкафа - ширина фасада - дельта - 55мм - толщина
    const plugWidth = width - facadeWidth - DELTA_M - (55 / 1000) - panelThickness;
    const plugDepth = panelThickness; // Глубина = толщина

    // 7.2. Создание детали
    const frontPlug = createPanel(plugWidth, plugHeight, plugDepth, bodyMaterial, 'frontal', 'frontPlug');

    // 7.3. Позиционирование
    if (frontPlug) {
        let plugCenterX;
        if (cornerDirection === 'left') {
            // левая грань = левая грань шкафа + толщина
            const requiredLeftFaceX = -width / 2 + panelThickness;
            plugCenterX = requiredLeftFaceX + plugWidth / 2;
        } else { // right
            // правая грань = правая грань шкафа - толщина
            const requiredRightFaceX = width / 2 - panelThickness;
            plugCenterX = requiredRightFaceX - plugWidth / 2;
        }

        // По Y: нижняя грань детали = нижняя грань шкафа
        const plugCenterY = -height / 2 + plugHeight / 2;
        
        // По Z: передняя грань детали = передняя грань шкафа
        const requiredFrontFaceZ = depth / 2;
        const plugCenterZ = requiredFrontFaceZ - plugDepth / 2;
        
        frontPlug.position.set(plugCenterX, plugCenterY, plugCenterZ);
        frontPlug.userData.cabinetUUID = cabinetUUID;
        group.add(frontPlug);

        console.log(` - Передняя заглушка создана.`);
    }

    // ==================================================================
    // 8. Фасад
    // ==================================================================

    // 8.1. Расчет размеров и параметров (копируем логику из swingUpper)
    const doorOffsetTopM = (cabinetData.doorOffsetTop ?? 0) / 1000;
    const doorOffsetBottomM = (cabinetData.doorOffsetBottom ?? 0) / 1000;
    const facadeGapM = cabinetData.facadeGap ?? (3 / 1000);

    // Высота и Y-позиция - как у прямого шкафа
    const facadeHeight = height - doorOffsetTopM - doorOffsetBottomM;
    const facadeCenterY = (doorOffsetBottomM - doorOffsetTopM) / 2;

    // Ширина - по вашей формуле
    const finalFacadeWidth = facadeWidth - facadeGapM;

    // Материал и толщина
    const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
    const { material: baseFacadeMaterial, thickness: facadeThicknessM } = MaterialManager.getMaterial(facadeSet);

    // 8.2. Создание детали
    const facadePanel = createPanel(finalFacadeWidth, facadeHeight, facadeThicknessM, baseFacadeMaterial.clone(), 'frontal', 'facadePanel_corner');

    // 8.3. Позиционирование
    if (facadePanel) {
        let facadeCenterX;
        if (cornerDirection === 'left') {
            // правая грань фасада = правая грань шкафа - зазор / 2
            const requiredRightFaceX = width / 2 - facadeGapM / 2;
            facadeCenterX = requiredRightFaceX - finalFacadeWidth / 2;
        } else { // right
            // левая грань фасада = левая грань шкафа + зазор / 2
            // ОШИБКА В ТЗ? Должно быть `+`, а не `-`
            const requiredLeftFaceX = -width / 2 + facadeGapM / 2;
            facadeCenterX = requiredLeftFaceX + finalFacadeWidth / 2;
        }

        // Позиция по Z - как у прямого шкафа (навешивается спереди)
        const facadeCenterZ = depth / 2 + facadeThicknessM / 2;
        
        facadePanel.position.set(facadeCenterX, facadeCenterY, facadeCenterZ);
        facadePanel.userData.cabinetUUID = cabinetUUID;

        // 8.4. Применение и масштабирование текстуры (копия из swingUpper)
        const actualFacadeMaterial = facadePanel.material; 

        // 4. Применяем трансформацию текстуры, если она есть
        if (actualFacadeMaterial.map && actualFacadeMaterial.map.isTexture) {
            MaterialManager.applyTextureTransform(
                actualFacadeMaterial,
                cabinetData.textureDirection || 'vertical',
                finalFacadeWidth,
                facadeHeight
            );
        }

        group.add(facadePanel);
        console.log(` - Фасад создан.`);
    }

    // ==================================================================
    // 9. Основная фальш-панель
    // ==================================================================

    // 9.1. Расчет размеров и параметров
    // Высота, Y-позиция, материал и толщина - такие же, как у основного фасада.
    // Мы можем переиспользовать переменные из блока "8. Фасад".
    const blindPanelHeight = facadeHeight;
    const blindPanelWidth = 200 / 1000; // Фиксированная ширина 200мм
    const blindPanelDepth = facadeThicknessM;
    const facadeCenterZ = depth / 2 + facadeThicknessM / 2;

    // 9.2. Создание детали
    const blindPanel = createPanel(blindPanelWidth, blindPanelHeight, blindPanelDepth, baseFacadeMaterial.clone(), 'frontal', 'blindPanel_main');

    // 9.3. Позиционирование
    if (blindPanel) {
        let blindPanelCenterX;
        // Округляем до мм и переводим в метры, чтобы избежать ошибок с плавающей точкой
        const roundedGapHalfM = Math.round(facadeGapM / 2 * 1000) / 1000;

        if (cornerDirection === 'left') {
            // правая грань = правая грань шкафа - ширина фасада - половина зазора
            const requiredRightFaceX = (width / 2) - facadeWidth - roundedGapHalfM;
            blindPanelCenterX = requiredRightFaceX - blindPanelWidth / 2;
        } else { // right
            // левая грань = левая грань шкафа + ширина фасада + половина зазора
            const requiredLeftFaceX = (-width / 2) + facadeWidth + roundedGapHalfM;
            blindPanelCenterX = requiredLeftFaceX + blindPanelWidth / 2;
        }
        
        // Позиции по Y и Z - такие же, как у фасада
        const blindPanelCenterY = facadeCenterY;
        const blindPanelCenterZ = facadeCenterZ;
        
        blindPanel.position.set(blindPanelCenterX, blindPanelCenterY, blindPanelCenterZ);
        blindPanel.userData.cabinetUUID = cabinetUUID;

        // 9.4. Применение и масштабирование текстуры

        const actualFacadeMaterial = blindPanel.material; 

        // 4. Применяем трансформацию текстуры, если она есть
        if (actualFacadeMaterial.map && actualFacadeMaterial.map.isTexture) {
            MaterialManager.applyTextureTransform(
                actualFacadeMaterial,
                cabinetData.textureDirection || 'vertical',
                blindPanelWidth,
                blindPanelHeight
            );
        }
        
        group.add(blindPanel);
        console.log(` - Основная фальш-панель создана.`);
    }

    // ==================================================================
    // 10. Вторая (угловая) фальш-панель
    // ==================================================================

    // 10.1. Расчет размеров и параметров
    const roundedGapHalfM = Math.round(facadeGapM / 2 * 1000) / 1000;
    // Длина = ширина шкафа - ширина фасада - половина зазора - 200мм (ширина основной фальш-панели)
    const cornerPanelLength = width - facadeWidth - roundedGapHalfM - (200 / 1000);

    // Проверяем, что длина положительная
    if (cornerPanelLength > 0.001) { // 1мм - минимальный порог
        const cornerPanelHeight = 60 / 1000; // Фиксированная высота 60мм
        const cornerPanelDepth = facadeThicknessM;

        // 10.2. Создание детали
        const cornerPanel = createPanel(cornerPanelLength, cornerPanelHeight, cornerPanelDepth, baseFacadeMaterial.clone(), 'frontal', 'blindPanel_corner');

        // 10.3. Позиционирование
        if (cornerPanel) {
            let cornerPanelCenterX;
            if (cornerDirection === 'left') {
                // левая грань = левая грань шкафа
                const requiredLeftFaceX = -width / 2;
                cornerPanelCenterX = requiredLeftFaceX + cornerPanelLength / 2;
            } else { // right
                // правая грань = правая грань шкафа
                const requiredRightFaceX = width / 2;
                cornerPanelCenterX = requiredRightFaceX - cornerPanelLength / 2;
            }

            // По Y: нижняя грань = нижняя грань шкафа
            const cornerPanelCenterY = -height / 2 + cornerPanelHeight / 2;
            
            // По Z: так же, как у фасада
            const cornerPanelCenterZ = facadeCenterZ;

            cornerPanel.position.set(cornerPanelCenterX, cornerPanelCenterY, cornerPanelCenterZ);
            cornerPanel.userData.cabinetUUID = cabinetUUID;

            // 10.4. Применение и масштабирование текстуры
            const actualFacadeMaterial = cornerPanel.material; 

            // 4. Применяем трансформацию текстуры, если она есть
            if (actualFacadeMaterial.map && actualFacadeMaterial.map.isTexture) {
                MaterialManager.applyTextureTransform(
                    actualFacadeMaterial,
                    cabinetData.textureDirection || 'vertical',
                    cornerPanelLength,
                    cornerPanelHeight
                );
            }

            group.add(cornerPanel);
            console.log(` - Угловая фальш-панель создана.`);
        }
    } else {
        console.log(` - Угловая фальш-панель не создана (недостаточно места).`);
    }

    // ==================================================================
    // 11. Гола-профиль
    // ==================================================================
    if (bottomConstruction.includes('Gola')) {
        
        // 11.1. Расчет размеров и параметров
        const golaMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xAAAAAA, metalness: 0.8, roughness: 0.4, name: "GolaMaterial"
        });
        
        // --- НОВАЯ ЛОГИКА С УЧЕТОМ ТИПА ДНА ---
        let profileLength;
        let profileCenterX;
        const baseLength = facadeWidth + DELTA_M + (55 / 1000);

        const isOverlayBottomForGola = bottomConstruction.includes('overlay');

        if (isOverlayBottomForGola) {
            // --- ДНО НАКЛАДНОЕ ---
            profileLength = baseLength;
        } else {
            // --- ДНО ВКЛАДНОЕ ---
            profileLength = baseLength - panelThickness;
        }

        // Проверяем, что есть место для профиля
        if (profileLength > 0.001) {
            
            if (cornerDirection === 'left') {
                // правая грань профиля = ...
                const requiredRightFaceX = isOverlayBottomForGola 
                    ? width / 2 
                    : width / 2 - panelThickness;
                profileCenterX = requiredRightFaceX - profileLength / 2;
            } else { // 'right'
                // левая грань профиля = ...
                const requiredLeftFaceX = isOverlayBottomForGola 
                    ? -width / 2 
                    : -width / 2 + panelThickness;
                profileCenterX = requiredLeftFaceX + profileLength / 2;
            }

            // 11.2. Создание детали (без изменений)
            const golaProfile = createUpperGolaProfileMesh(profileLength, golaMaterial, cabinetUUID);

            if (golaProfile) {
                // 11.3. Позиционирование по Y и Z (без изменений)
                golaProfile.rotation.y = -Math.PI / 2;

                const profileHeight = 20 / 1000;
                const requiredBottomFaceY = -height / 2 + panelThickness / 2;
                const profileCenterY = requiredBottomFaceY - profileHeight / 2;
                
                const bottomFrontOffsetForGola = 20 / 1000; // Для Gola всегда 20
                const requiredRearFaceZ = depth / 2 - bottomFrontOffsetForGola;
                const profileCenterZ = requiredRearFaceZ;
                
                golaProfile.position.set(profileCenterX, profileCenterY, profileCenterZ);
                
                group.add(golaProfile);
                console.log(` - Верхний Гола-профиль (угловой) создан (Длина: ${Math.round(profileLength*1000)}мм).`);
            }
        } else {
            console.log(` - Верхний Гола-профиль (угловой) не создан (недостаточно места).`);
        }
    }

    return group;
}

/**
 * Создает детализированную модель ВЕРХНЕГО ШКАФА С ОТКРЫТЫМИ ПОЛКАМИ.
 * @param {object} cabinetData - Объект данных шкафа.
 * @param {object} kitchenGlobalParams - Глобальные параметры кухни.
 * @param {object} MaterialManager - Менеджер материалов.
 * @param {function} getPanelThickness - Функция для получения толщины панели.
 * @returns {THREE.Group | null}
 */
export function createDetailedOpenUpperGeometry(cabinetData, kitchenGlobalParams, MaterialManager, getPanelThickness) {
    if (!cabinetData) {
        console.error("createDetailedOpenUpperGeometry: cabinetData не предоставлен.");
        return null;
    }

    const group = new THREE.Group();
    group.userData.isDetailedCabinet = true;
    group.userData.objectType = 'cabinet';

    // --- Параметры ---
    const { width, height, depth } = cabinetData;
    const cabinetUUID = cabinetData.mesh?.uuid;
    const panelThickness = getPanelThickness();
    
    // --- Материалы ---
    const bodyMaterial = MaterialManager.getBodyMaterial(cabinetData);
    
    //console.log(`--- Начало детализации OpenUpper: ${width*1000}x${height*1000}x${depth*1000} ---`);

    // ==================================================================
    // 2. Дно
    // ==================================================================

    // 2.1. Расчет параметров для дна
    const bottomType = cabinetData.bottomType || 'solid';
    const bottomConstruction = cabinetData.bottomConstruction || 'inset';
    const spacers = cabinetData.spacers || 'none';
    const bottomFrontOffsetMm = cabinetData.bottomFrontOffset ?? 0;
    const bottomOverhangRearMm = cabinetData.bottomOverhangRear ?? 0;
    // --- НОВЫЙ ПАРАМЕТР ---
    const backPanelOffsetMm = cabinetData.backPanelOffset ?? 0;

    const bottomFrontOffsetM = bottomFrontOffsetMm / 1000;
    const bottomOverhangRearM = bottomOverhangRearMm / 1000;
    const backPanelOffsetM = backPanelOffsetMm / 1000;

    let bottomPanelWidth;
    let bottomPanelCenterX = 0;
    const bottomPanelThickness = panelThickness;
    const bottomPanelCenterY = -height / 2 + bottomPanelThickness / 2;
    //let finalConsoleLog = ""; // Переменная для лога

    if (bottomConstruction.includes('inset')) {
        // --- Логика для ВКЛАДНОГО дна ---
        bottomPanelWidth = width - 2 * panelThickness;
        // bottomPanelCenterX остается 0

        if (bottomType === 'solid') {
            // --- Вкладное сплошное дно ---
            // Глубина уменьшается на углубление ЗС
            const bottomPanelDepth = depth - bottomFrontOffsetM + bottomOverhangRearM - backPanelOffsetM;
            const bottomPanel = createPanel(bottomPanelWidth, bottomPanelThickness, bottomPanelDepth, bodyMaterial, 'horizontal', 'bottomPanel_solid_inset');
            if (bottomPanel) {
                // Позиционирование по передней грани остается прежним
                const requiredFrontFaceZ = depth / 2 - bottomFrontOffsetM;
                const currentFrontFaceZ = bottomPanelDepth / 2;
                const bottomPanelCenterZ = requiredFrontFaceZ - currentFrontFaceZ;
                bottomPanel.position.set(0, bottomPanelCenterY, bottomPanelCenterZ);
                bottomPanel.userData.cabinetUUID = cabinetUUID;

                MaterialManager.applyTexture(bottomPanel, cabinetData.textureDirection, 'horizontal');

                group.add(bottomPanel);
                //finalConsoleLog = ` - Дно (solid, inset) создано (Г: ${Math.round(bottomPanelDepth*1000)}мм)`;
            }
        } else if (bottomType === 'slats') {
            // --- Вкладное дно "планки" ---
            const frontSlatDepth = 90 / 1000;
            const frontSlat = createPanel(bottomPanelWidth, bottomPanelThickness, frontSlatDepth, bodyMaterial, 'horizontal', 'bottomPanel_frontSlat_inset');
            if (frontSlat) {
                // Позиционирование передней планки не меняется
                const requiredFrontFaceZ = depth / 2 - bottomFrontOffsetM;
                const currentFrontFaceZ = frontSlatDepth / 2;
                const frontSlatCenterZ = requiredFrontFaceZ - currentFrontFaceZ;
                frontSlat.position.set(0, bottomPanelCenterY, frontSlatCenterZ);
                frontSlat.userData.cabinetUUID = cabinetUUID;
                MaterialManager.applyTexture(frontSlat, cabinetData.textureDirection, 'horizontal');
                group.add(frontSlat);
            }

            const rearSlatDepth = (90 / 1000) + bottomOverhangRearM;
            const rearSlat = createPanel(bottomPanelWidth, bottomPanelThickness, rearSlatDepth, bodyMaterial, 'horizontal', 'bottomPanel_rearSlat_inset');
            if (rearSlat) {
                // Позиционирование задней планки смещается ВПЕРЕД на углубление ЗС
                const requiredRearFaceZ = -depth / 2 - bottomOverhangRearM + backPanelOffsetM; // <-- ИЗМЕНЕНИЕ
                const currentRearFaceZ = -rearSlatDepth / 2;
                const rearSlatCenterZ = requiredRearFaceZ - currentRearFaceZ;
                rearSlat.position.set(0, bottomPanelCenterY, rearSlatCenterZ);
                rearSlat.userData.cabinetUUID = cabinetUUID;
                MaterialManager.applyTexture(rearSlat, cabinetData.textureDirection, 'horizontal');
                group.add(rearSlat);
            }
            //finalConsoleLog = ` - Дно (slats, inset) создано.`;
        }

    } else { // --- Логика для НАКЛАДНОГО дна ('overlay') ---
        bottomPanelWidth = width; // Базовая ширина
        // ... (весь блок со спейсерами остается БЕЗ ИЗМЕНЕНИЙ) ...
        if (spacers !== 'none') {
            if (spacers.includes('narrow')) {
                const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
                const { thickness: facadeThicknessM } = MaterialManager.getMaterial(facadeSet);
                bottomPanelWidth += facadeThicknessM;
            } else if (spacers.includes('wide')) {
                const spacerWidthMm = cabinetData.spacerWidth || 60;
                const spacerWidthM = spacerWidthMm / 1000;
                bottomPanelWidth += spacerWidthM;
            }
            const deltaWidth = bottomPanelWidth - width;
            if (spacers.includes('left')) {
                const requiredRightFaceX = width / 2;
                const currentRightFaceX = bottomPanelWidth / 2;
                bottomPanelCenterX = requiredRightFaceX - currentRightFaceX;
            } else if (spacers.includes('right')) {
                const requiredLeftFaceX = -width / 2;
                const currentLeftFaceX = -bottomPanelWidth / 2;
                bottomPanelCenterX = requiredLeftFaceX - currentLeftFaceX;
            }
        }
        // ... (конец блока со спейсерами) ...

        // Создание и позиционирование для накладного дна (углубление ЗС не влияет)
        if (bottomType === 'solid') {
            const bottomPanelDepth = depth - bottomFrontOffsetM + bottomOverhangRearM;
            const bottomPanel = createPanel(bottomPanelWidth, bottomPanelThickness, bottomPanelDepth, bodyMaterial, 'horizontal', 'bottomPanel_solid_overlay');
            if (bottomPanel) {
                const requiredFrontFaceZ = depth / 2 - bottomFrontOffsetM;
                const currentFrontFaceZ = bottomPanelDepth / 2;
                const bottomPanelCenterZ = requiredFrontFaceZ - currentFrontFaceZ;
                bottomPanel.position.set(bottomPanelCenterX, bottomPanelCenterY, bottomPanelCenterZ);
                bottomPanel.userData.cabinetUUID = cabinetUUID;

                MaterialManager.applyTexture(bottomPanel, cabinetData.textureDirection, 'horizontal');

                group.add(bottomPanel);
            }
        } else if (bottomType === 'slats') {
            const frontSlatDepth = 90 / 1000;
            const frontSlat = createPanel(bottomPanelWidth, bottomPanelThickness, frontSlatDepth, bodyMaterial, 'horizontal', 'bottomPanel_frontSlat_overlay');
            if (frontSlat) {
                const requiredFrontFaceZ = depth / 2 - bottomFrontOffsetM;
                const currentFrontFaceZ = frontSlatDepth / 2;
                const frontSlatCenterZ = requiredFrontFaceZ - currentFrontFaceZ;
                frontSlat.position.set(bottomPanelCenterX, bottomPanelCenterY, frontSlatCenterZ);
                frontSlat.userData.cabinetUUID = cabinetUUID;

                MaterialManager.applyTexture(frontSlat, cabinetData.textureDirection, 'horizontal');

                group.add(frontSlat);
            }
            const rearSlatDepth = (90 / 1000) + bottomOverhangRearM;
            const rearSlat = createPanel(bottomPanelWidth, bottomPanelThickness, rearSlatDepth, bodyMaterial, 'horizontal', 'bottomPanel_rearSlat_overlay');
            if (rearSlat) {
                const requiredRearFaceZ = -depth / 2 - bottomOverhangRearM;
                const currentRearFaceZ = -rearSlatDepth / 2;
                const rearSlatCenterZ = requiredRearFaceZ - currentRearFaceZ;
                rearSlat.position.set(bottomPanelCenterX, bottomPanelCenterY, rearSlatCenterZ);
                rearSlat.userData.cabinetUUID = cabinetUUID;

                MaterialManager.applyTexture(rearSlat, cabinetData.textureDirection, 'horizontal');

                group.add(rearSlat);
            }
        }
        //finalConsoleLog = ` - Дно (overlay) создано (X-центр: ${bottomPanelCenterX.toFixed(3)})`;
    }

    //console.log(finalConsoleLog);

    // ==================================================================
    // 2. Боковины
    // ==================================================================

    // 2.1. Расчет размеров и параметров
    const topConstruction = cabinetData.topConstruction || 'inset';

    let sidePanelHeight = height; // Начинаем с полной высоты
    let sidePanelCenterY = 0;   // И центрированного положения

    // Уменьшаем высоту, если дно накладное
    if (bottomConstruction.includes('overlay')) {
        sidePanelHeight -= panelThickness;
    }
    // Уменьшаем высоту, если крыша накладная
    if (topConstruction === 'overlay') {
        sidePanelHeight -= panelThickness;
    }

    // Пересчитываем Y-центр с учетом всех изменений
    // Новая позиция верха боковины
    const sidePanelTopY = (topConstruction === 'overlay') ? (height / 2 - panelThickness) : (height / 2);
    // Центр = верхняя точка - половина новой высоты
    sidePanelCenterY = sidePanelTopY - sidePanelHeight / 2;


    const leftSideOverhangM = (cabinetData.leftSideOverhangRear ?? 0) / 1000;
    const leftSideDepth = depth + leftSideOverhangM;
    const leftSideCenterZ = -leftSideOverhangM / 2; 

    const rightSideOverhangM = (cabinetData.rightSideOverhangRear ?? 0) / 1000;
    const rightSideDepth = depth + rightSideOverhangM;
    const rightSideCenterZ = -rightSideOverhangM / 2;

    // 2.2. Создание деталей
    const leftSide = createPanel(panelThickness, sidePanelHeight, leftSideDepth, bodyMaterial, 'vertical', 'leftSide');
    const rightSide = createPanel(panelThickness, sidePanelHeight, rightSideDepth, bodyMaterial, 'vertical', 'rightSide');

    // 2.3. Позиционирование
    if (leftSide) {
        const leftSideCenterX = -width / 2 + panelThickness / 2;
        leftSide.position.set(leftSideCenterX, sidePanelCenterY, leftSideCenterZ);
        leftSide.userData.cabinetUUID = cabinetUUID;
        MaterialManager.applyTexture(leftSide, cabinetData.textureDirection, 'vertical');
        group.add(leftSide);
    }

    if (rightSide) {
        const rightSideCenterX = width / 2 - panelThickness / 2;
        rightSide.position.set(rightSideCenterX, sidePanelCenterY, rightSideCenterZ);
        rightSide.userData.cabinetUUID = cabinetUUID;
        MaterialManager.applyTexture(rightSide, cabinetData.textureDirection, 'vertical');
        group.add(rightSide);
    }

    //console.log(` - Боковины созданы (Конструкция дна: ${bottomConstruction}, крыши: ${topConstruction})`);

    // ==================================================================
    // 3. Крыша
    // ==================================================================

    // 3.1. Расчет размеров и параметров
    // topConstruction уже определен в блоке боковин
    let topPanelWidth;
    if (topConstruction === 'inset') {
        topPanelWidth = width - 2 * panelThickness;
    } else { // 'overlay'
        topPanelWidth = width;
    }

    const topPanelThickness = panelThickness;
    const topPanelDepth = (topConstruction === 'inset')
        ? depth - backPanelOffsetM // Вкладное: учитываем паз
        : depth;                   // Накладное: не учитываем паз (полная глубина)

    // 3.2. Создание детали
    const topPanel = createPanel(topPanelWidth, topPanelThickness, topPanelDepth, bodyMaterial, 'horizontal', 'topPanel_open');

    // 3.3. Позиционирование
    if (topPanel) {
        // Позиция по Y: верхняя грань = верх шкафа
        const topPanelCenterY = height / 2 - topPanelThickness / 2;
        
        // Позиция по Z: передняя грань = перед шкафа
        const requiredFrontFaceZ = depth / 2;
        const topPanelCenterZ = requiredFrontFaceZ - topPanelDepth / 2;
        
        // Позиция по X: всегда в центре
        const topPanelCenterX = 0;

        topPanel.position.set(topPanelCenterX, topPanelCenterY, topPanelCenterZ);
        topPanel.userData.cabinetUUID = cabinetUUID;
        MaterialManager.applyTexture(topPanel, cabinetData.textureDirection, 'horizontal');
        group.add(topPanel);
        //console.log(` - Крыша создана (Конструкция: ${topConstruction})`);
    }

    // ==================================================================
    // 4. Задняя стенка
    // ==================================================================
    const hasBackPanel = cabinetData.backPanel || 'yes';

    if (hasBackPanel === 'yes') {
        const backPanelMaterialType = cabinetData.backPanelMaterial || 'hdf';
        
        let backPanel, backPanelWidth, backPanelHeight, backPanelThickness, backPanelMaterial;
        let backPanelCenterX, backPanelCenterY, backPanelCenterZ;

        if (backPanelMaterialType === 'corpus') {
            // --- ВАРИАНТ 1: Задняя стенка из ЛДСП (материал корпуса) ---
            
            // 4.1. Расчет размеров
            backPanelWidth = width - 2 * panelThickness;
            backPanelHeight = height - 2 * panelThickness; // Учитываем дно и крышу
            backPanelThickness = panelThickness; // Толщина равна толщине корпуса
            backPanelMaterial = bodyMaterial; // Используем материал корпуса
            
            // 4.2. Расчет позиции
            backPanelCenterX = 0; // По центру X
            backPanelCenterY = 0; // По центру Y
            
            // задняя грань = задняя грань шкафа + углубление
            const requiredRearFaceZ = -depth / 2 + backPanelOffsetM;
            backPanelCenterZ = requiredRearFaceZ + backPanelThickness / 2;

        } else { // 'hdf'
            // --- ВАРИАНТ 2: Задняя стенка из ХДФ (копируем логику из swingUpper) ---
            
            // 4.1. Расчет размеров
            backPanelThickness = 3 / 1000;
            backPanelMaterial = new THREE.MeshStandardMaterial({
                color: 0xf0f0f0, roughness: 0.9, metalness: 0.0, name: "BackPanelMaterial"
            });

            const leftSideOverhangM = (cabinetData.leftSideOverhangRear ?? 0) / 1000;
            const rightSideOverhangM = (cabinetData.rightSideOverhangRear ?? 0) / 1000;
            const offsetX_Left = (leftSideOverhangM > 0) ? (10 / 1000) : (2 / 1000);
            const offsetX_Right = (rightSideOverhangM > 0) ? (10 / 1000) : (2 / 1000);
            backPanelWidth = width - offsetX_Left - offsetX_Right;

            const bottomOverhangRearM = (cabinetData.bottomOverhangRear ?? 0) / 1000;
            const offsetY_Top = 2 / 1000;
            let offsetY_Bottom = 2 / 1000;
            if (bottomOverhangRearM > 0) {
                offsetY_Bottom = 10 / 1000;
            } else if ((bottomConstruction === 'overlay' || topConstruction === 'overlay') && backPanelOffsetM > 0) {
                // Уточнил условие: если хотя бы дно ИЛИ крыша накладные
                offsetY_Bottom = 10 / 1000;
            }
            backPanelHeight = height - offsetY_Top - offsetY_Bottom;
            
            // 4.2. Расчет позиции
            const requiredLeftFaceX = -width / 2 + offsetX_Left;
            backPanelCenterX = requiredLeftFaceX + backPanelWidth / 2;
            
            const requiredTopFaceY = height / 2 - offsetY_Top;
            backPanelCenterY = requiredTopFaceY - backPanelHeight / 2;
            
            const requiredFrontFaceZ = -depth / 2 + backPanelOffsetM;
            backPanelCenterZ = requiredFrontFaceZ - backPanelThickness / 2;
        }
        
        // 4.3. Создание и позиционирование (общий код для обоих вариантов)
        backPanel = createPanel(backPanelWidth, backPanelHeight, backPanelThickness, backPanelMaterial, 'frontal', 'backPanel_open');
        if (backPanel) {
            backPanel.position.set(backPanelCenterX, backPanelCenterY, backPanelCenterZ);
            backPanel.userData.cabinetUUID = cabinetUUID;
            MaterialManager.applyTexture(backPanel, cabinetData.textureDirection, 'frontal');
            group.add(backPanel);
            console.log(` - Задняя стенка создана (Материал: ${backPanelMaterialType})`);
        }
    }

    // ==================================================================
    // 5. Полки
    // ==================================================================
    const shelfCount = parseInt(cabinetData.shelfCount) || 0;

    if (shelfCount > 0) {
        // 5.1. Расчет размеров и материалов
        const shelfMaterialType = cabinetData.shelfMaterial || 'corpus';
        
        let shelfThickness, shelfMaterial, shelfNamePrefix;
        
        if (shelfMaterialType === 'glass') {
            shelfThickness = 6 / 1000;
            shelfMaterial = new THREE.MeshPhysicalMaterial({
                color: 0xffffff,
                metalness: 0.1,
                roughness: 0.05,
                transmission: 0.8, // Прозрачность
                thickness: 6 / 1000, // Толщина для расчета преломления
                ior: 1.5,
                name: "GlassMaterial"
            });
            shelfNamePrefix = 'shelf_glass';
        } else { // 'corpus'
            shelfThickness = panelThickness;
            shelfMaterial = bodyMaterial;
            shelfNamePrefix = 'shelf_corpus';
        }
        
        const shelfType = cabinetData.shelfType || 'confirmat';
        let shelfWidth;
        if (shelfType === 'confirmat') {
            shelfWidth = width - 2 * panelThickness;
        } else { // shelfHolder для ЛДСП
            shelfWidth = width - 2 * panelThickness - (2 / 1000);
        }
        
        // Глубина полки учитывает паз под ЗС и зазор до края
        //const shelfDepth = depth - backPanelOffsetM - (10 / 1000); // 10мм зазор спереди
        // Глубина полки зависит от материала задней стенки
        let shelfDepth;
        const backPanelMaterialTypeForShelves = cabinetData.backPanelMaterial || 'hdf';
        const frontShelfGap = 4 / 1000; // 10мм зазор спереди

        if (backPanelMaterialTypeForShelves === 'corpus') {
            // Если ЗС из ЛДСП, она стоит ВНУТРИ. Полка упирается в нее.
            // Глубина полки = Глубина шкафа - отступ спереди - толщина ЗС из ЛДСП
            shelfDepth = depth - frontShelfGap - panelThickness - backPanelOffsetM;
        } else { // 'hdf'
            // Если ЗС из ХДФ, она стоит в ПАЗУ. Полка стоит ПЕРЕД ней.
            // Глубина полки = Глубина шкафа - отступ спереди - углубление паза
            shelfDepth = depth - frontShelfGap - backPanelOffsetM;
        }

        if (shelfWidth <= 0 || shelfDepth <= 0) {
            console.warn(" - Невозможно создать полки: расчетная ширина или глубина <= 0.");
        } else {
            // 5.2. Расчет Y-позиций (всегда равномерно)
            const availableSpaceTopY = (topConstruction === 'overlay') ? (height / 2 - panelThickness) : (height / 2);
            const availableSpaceBottomY = (bottomConstruction === 'overlay') ? (-height / 2 + panelThickness) : (-height / 2);
            const availableHeight = availableSpaceTopY - availableSpaceBottomY;
            
            const shelfStepY = availableHeight / (shelfCount + 1);

            // 5.3. Создание и позиционирование в цикле
            for (let i = 1; i <= shelfCount; i++) {
                const shelfCenterY = availableSpaceBottomY + shelfStepY * i;
                const shelfMesh = createPanel(shelfWidth, shelfThickness, shelfDepth, shelfMaterial, 'horizontal', `${shelfNamePrefix}_${i}`);
                
                if (shelfMesh) {
                    const requiredFrontFaceZ = depth / 2 - frontShelfGap; // Передняя кромка полки с отступом 10мм
                    const shelfCenterZ = requiredFrontFaceZ - shelfDepth / 2;
                    
                    shelfMesh.position.set(0, shelfCenterY, shelfCenterZ);
                    shelfMesh.userData.cabinetUUID = cabinetUUID;
                    MaterialManager.applyTexture(shelfMesh, cabinetData.textureDirection, 'horizontal');
                    group.add(shelfMesh);
                }
            }
            //console.log(` - Полки созданы: ${shelfCount} шт. (Материал: ${shelfMaterialType})`);
        }
    }

    // ==================================================================
    // 6. Алюминиевый фасад
    // ==================================================================
    const frameFacadeType = cabinetData.frameFacade || 'none';

    if (frameFacadeType !== 'none') {
        // 6.1. Расчет размеров (общий для всех)
        const facadeGapM = cabinetData.facadeGap ?? (3 / 1000);
        const doorOffsetTopM = (cabinetData.doorOffsetTop ?? 0) / 1000;
        const doorOffsetBottomM = (cabinetData.doorOffsetBottom ?? 0) / 1000;
        const facadeWidth = width - facadeGapM;
        const facadeHeight = height - doorOffsetTopM - doorOffsetBottomM;

        if (facadeWidth > 0 && facadeHeight > 0) {
            // 6.2. Выбор материала рамки (общий для всех)
            const frameColor = cabinetData.frameColor || 'aluminum';
            let colorValue;
            switch(frameColor) {
                case 'black': colorValue = 0x111111; break;
                case 'white': colorValue = 0xf0f0f0; break;
                case 'bronze': colorValue = 0xD3A873; break;
                default: colorValue = 0xAAAAAA;
            }
            const frameMaterial = new THREE.MeshStandardMaterial({
                color: colorValue, metalness: 0.9, roughness: 0.4, name: `FrameMaterial_${frameColor}`
            });

            // 6.3. ДИСПЕТЧЕР: Вызов нужной фабрики
            let facadeCreationResult = null;
            if (frameFacadeType === 'z9') {
                facadeCreationResult = createZ9FrameFacade(facadeWidth, facadeHeight, frameMaterial);
            } else if (frameFacadeType === 'z1') {
                facadeCreationResult = createZ1FrameFacade(facadeWidth, facadeHeight, frameMaterial);
            } else if (frameFacadeType === 'z12') {
                facadeCreationResult = createZ12FrameFacade(facadeWidth, facadeHeight, frameMaterial);
            }

            // 6.4. Позиционирование (общее для всех)
            if (facadeCreationResult) {
                const { frameObject, totalDepth } = facadeCreationResult;
                const facadeCenterY = (doorOffsetBottomM - doorOffsetTopM) / 2;
                const facadeCenterZ = depth / 2;
                frameObject.position.set(0, facadeCenterY, facadeCenterZ);
                frameObject.userData.cabinetUUID = cabinetUUID;
                group.add(frameObject);
                console.log(` - Алюминиевая рамка создана (Тип: ${frameFacadeType})`);
            }
        }
    }  

    // ==================================================================
    // 8. Гола-профиль
    // ==================================================================

    const isOverlayBottomForGola = (cabinetData.bottomConstruction || 'inset').includes('overlay');
    const spacersType = cabinetData.spacers || 'none'; // Спейсеры влияют на длину профиля

    if ((cabinetData.bottomConstruction || 'inset').includes('Gola')) {
        
        // 8.1. Расчет размеров и параметров
        const golaMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xAAAAAA, metalness: 0.8, roughness: 0.4, name: "GolaMaterial"
        });
        
        let profileLength;
        let profileCenterX;

        if (isOverlayBottomForGola) { // Накладное дно
            if (spacersType.includes('wide')) {
                const spacerWidthMm = cabinetData.spacerWidth || 60;
                profileLength = width + (spacerWidthMm / 1000);
            } else {
                profileLength = width;
            }
            
            // Позиционирование для накладного
            if (spacersType.includes('left')) {
                // правая грань = правая грань шкафа
                profileCenterX = width / 2 - profileLength / 2;
            } else { // правый спейсер или нет спейсера
                // левая грань = левая грань шкафа
                profileCenterX = -width / 2 + profileLength / 2;
            }

        } else { // Вкладное дно
            profileLength = width - 2 * panelThickness;
            // левая грань = левая грань шкафа + толщина
            profileCenterX = -width / 2 + panelThickness + profileLength / 2;
        }
        
        // 8.2. Создание детали
        const golaProfile = createUpperGolaProfileMesh(profileLength, golaMaterial, cabinetUUID);

        if (golaProfile) {
            // 8.3. Позиционирование
            // Геометрия создана в плоскости XY, ее нужно повернуть и сдвинуть.
            golaProfile.rotation.y = -Math.PI / 2; // Поворачиваем, чтобы XY-плоскость стала ZY-плоскостью

            // По Y: центр = нижняя грань шкафа + толщина дна / 2
            // Это не совсем верно. Нижняя грань дна = -height/2. Верхняя = -height/2 + panelThickness.
            // Профиль должен стоять НА дне, его нижняя грань = верхняя грань дна.
            const profileHeight = 20 / 1000; // Высота сечения
            const requiredBottomFaceY = -height / 2 + panelThickness / 2;
            const profileCenterY = requiredBottomFaceY - profileHeight / 2;
            
            // По Z: задняя грань = передняя грань шкафа - отступ дна спереди
            const bottomFrontOffsetM = (cabinetData.bottomFrontOffset ?? 20) / 1000;
            const profileDepth = 20 / 1000; // Глубина сечения
            const requiredRearFaceZ = depth / 2 - bottomFrontOffsetM;
            const profileCenterZ = requiredRearFaceZ; // Pivot point у Shape в (0,0), поэтому так
            
            golaProfile.position.set(profileCenterX, profileCenterY, profileCenterZ);
            
            group.add(golaProfile);
            console.log(` - Верхний Гола-профиль создан (Длина: ${Math.round(profileLength*1000)}мм).`);
        }
    }
    return group;
}

/**
 * Создает детализированную модель ВЕРХНЕЙ ФАЛЬШ-ПАНЕЛИ.
 */
export function createDetailedFalsePanelUpperGeometry(cabinetData, kitchenGlobalParams, MaterialManager, getPanelThickness) {
    if (!cabinetData) return null;

    const group = new THREE.Group();
    group.userData.isDetailedCabinet = true;
    group.userData.objectType = 'cabinet';

    const { height, depth } = cabinetData;
    const cabinetUUID = cabinetData.mesh?.uuid;

    // --- 1. Расчет размеров и параметров ---
    const doorOffsetTopM = (cabinetData.doorOffsetTop ?? 0) / 1000;
    const doorOffsetBottomM = (cabinetData.doorOffsetBottom ?? 0) / 1000;
    const panelHeight = height - doorOffsetTopM - doorOffsetBottomM;
    const panelWidthAsDepth = depth; // Глубина шкафа становится шириной фасада

    // --- 2. Материал и Стратегия ---
    const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
    const { material: baseFacadeMaterial, thickness: baseTh } = MaterialManager.getMaterial(facadeSet);

    let buildStrategy = 'flat';
    let profileData = null;
    let finalMaterial = baseFacadeMaterial;
    let finalThickness = baseTh;

    // Проверяем фрезеровку в базе
    if (window.facadeOptionsData['mdf_milled']) {
         const decor = window.facadeOptionsData['mdf_milled'].decors.find(d => d.value === facadeSet?.texture);
         if (decor && decor.profileType === '9slice') {
             buildStrategy = 'milled';
             profileData = decor;
         }
    }

    // Считываем сторону ориентации (по умолчанию левая)
    const side = cabinetData.fp_side || 'left';

    // --- 3. Создание ---
    const container = new THREE.Group();
    container.userData.cabinetUUID = cabinetUUID;
    
    // Позиция Y: Центр высоты панели (с учетом отступов)
    const panelCenterY = (height / 2 - doorOffsetTopM) - panelHeight / 2;
    
    // Позиция X, Z: Центр шкафа (0,0)
    container.position.set(0, panelCenterY, 0); 
    
    // ПОВОРОТ: 
    // Left: Лицо смотрит влево (-X). Поворот +90 (Math.PI/2) -> Z переходит в -X.
    // Right: Лицо смотрит вправо (+X). Поворот -90 (-Math.PI/2) -> Z переходит в +X.
    if (side === 'left') {
        container.rotation.y = -Math.PI / 2; 
    } else {
        container.rotation.y = Math.PI / 2;
    }

    group.add(container);

    if (buildStrategy === 'milled') {
        // === ВАРИАНТ 1: ФРЕЗЕРОВКА ===
        // Передаем depth как ширину фасада!
        createMilledFacade(panelWidthAsDepth, panelHeight, profileData, finalMaterial.clone())
            .then(mesh => {
                container.add(mesh);
                mesh.updateMatrixWorld();
            })
            .catch(e => console.error("Ошибка фальш-панели:", e));

    } else {
        // === ВАРИАНТ 2: ПЛОСКИЙ ===
        const mesh = createPanel(
            panelWidthAsDepth, panelHeight, finalThickness,
            finalMaterial.clone(), 'frontal', 'falsePanelUpper'
        );

        if (mesh) {
            if (mesh.material.map) {
                MaterialManager.applyTextureTransform(
                    mesh.material, cabinetData.textureDirection || 'vertical',
                    panelWidthAsDepth, panelHeight
                );
            }
            container.add(mesh);
        }
    }
    
    console.log(` - Верхняя фальш-панель создана (${buildStrategy}, side: ${side}).`);
    
    return group;
}


/**
 * Создает THREE.Group, представляющую детализированную модель высокого шкафа
 * с духовкой и микроволновкой.
 * @param {object} cabinetData - Объект шкафа из массива 'cabinets'.
 * @returns {THREE.Group | null} Группа со всеми частями шкафа или null при ошибке.
 */
export function createDetailedTallOvenMicroGeometry(cabinetData, kitchenGlobalParams, MaterialManager, getPanelThickness) {

    if (!cabinetData || cabinetData.cabinetConfig !== 'tallOvenMicro') {
        console.error("[createDetailedTallOvenMicro] Неверные данные шкафа или конфигурация не 'tallOvenMicro'.");
        return null;
    }

    const group = new THREE.Group();
    group.userData.isDetailedCabinet = true;
    group.userData.objectType = 'cabinet';
    group.userData.cabinetType = cabinetData.cabinetType;
    group.userData.cabinetConfig = cabinetData.cabinetConfig;
    const cabinetUUID = cabinetData.mesh?.uuid || THREE.MathUtils.generateUUID();

    // --- Основные размеры и параметры ---
    const panelThicknessM = getPanelThickness();
    const cabWidthM = cabinetData.width;
    const cabHeightM = cabinetData.height;
    const cabDepthM = cabinetData.depth;
    //const boxAvailableHeightMeters = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;

    // --- Материалы ---
    const cabinetMaterial = MaterialManager.getBodyMaterial(cabinetData);
    const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);

    // --- 1. ДНО ШКАФА (методом экструзии) ---
    const bottomPanelShapeWidth = cabWidthM;   // Это будет X для Shape (ширина шкафа)
    const bottomPanelShapeDepth = cabDepthM;   // Это будет Y для Shape (глубина шкафа)
    const bottomPanelExtrudeDepth = panelThicknessM; // Это будет глубина экструзии (толщина дна)

    if (bottomPanelShapeWidth <= 0 || bottomPanelShapeDepth <= 0 || bottomPanelExtrudeDepth <= 0) {
        console.error("  [TallOvenMicro] Некорректные размеры для создания дна экструзией.");
    } else {
        const bottomShape = new THREE.Shape();
        const radius = 0.008; // 8 мм

        // Координаты углов, которые мы будем скруглять
        const corner1X = bottomPanelShapeWidth - 0.08;
        const corner1Y = bottomPanelShapeDepth - 0.04;

        const corner2X = 0.08;
        const corner2Y = bottomPanelShapeDepth - 0.04;

        bottomShape.moveTo(0, 0);
        bottomShape.lineTo(bottomPanelShapeWidth, 0);
        bottomShape.lineTo(bottomPanelShapeWidth, bottomPanelShapeDepth);
        bottomShape.lineTo(corner1X, bottomPanelShapeDepth);

        bottomShape.lineTo(corner1X, corner1Y + radius); // Точка начала первой дуги
        // Первое скругление (правый верхний угол выреза)
        bottomShape.quadraticCurveTo(
            corner1X,       // cpX (вершина угла)
            corner1Y,       // cpY (вершина угла)
            corner1X - radius, // endX
            corner1Y        // endY
        );
        bottomShape.lineTo(corner2X + radius, corner2Y); // Точка начала второй дуги

        bottomShape.quadraticCurveTo(
            corner2X,       // cpX (вершина угла)
            corner2Y,       // cpY (вершина угла)
            corner2X,       // endX
            corner2Y + radius  // endY
        );

        // Линия до передней кромки шкафа (на левой стороне выреза)
        bottomShape.lineTo(0.08, bottomPanelShapeDepth);
        bottomShape.lineTo(0, bottomPanelShapeDepth);
        bottomShape.closePath(); // Замыкаем контур

        const extrudeSettings = {
            steps: 1,
            depth: bottomPanelExtrudeDepth, // Глубина выдавливания = толщина дна
            bevelEnabled: false
        };

        let bottomGeometry = null;
        try {
            bottomGeometry = new THREE.ExtrudeGeometry(bottomShape, extrudeSettings);
        } catch (error) {
            console.error("  [TallOvenMicro] Ошибка создания ExtrudeGeometry для дна:", error);
        }

        if (bottomGeometry) {
            const bottomPanelMesh = new THREE.Mesh(bottomGeometry, cabinetMaterial.clone());
            bottomPanelMesh.name = `bottom_extruded_tall_oven_micro_${cabinetUUID.substring(0,4)}`;
            bottomPanelMesh.userData = {
                isCabinetPart: true,
                objectType: 'cabinetPart',
                panelType: 'bottom', // Можно добавить для идентификации
                orientationType: 'horizontal_extruded', // Указываем, что это экструзия для горизонтальной панели
                cabinetUUID: cabinetUUID
            };

            // --- Позиционирование и ориентация экструдированного дна ---
            //    Поворачиваем на -90 градусов вокруг оси X.
            bottomPanelMesh.rotation.x = -Math.PI / 2;

            // 2. Смещение:
            const posX = -bottomPanelShapeWidth / 2;
            const posY = -cabHeightM / 2 + bottomPanelExtrudeDepth * 0; 
            const posZ = bottomPanelShapeDepth / 2;

            bottomPanelMesh.position.set(
                posX, //x
                posY, //y
                posZ //z
            );

            group.add(bottomPanelMesh);
            console.log(`  [TallOvenMicro] Дно (экструзия) создано и добавлено. Pos: X=${bottomPanelMesh.position.x.toFixed(3)}, Y=${bottomPanelMesh.position.y.toFixed(3)}, Z=${bottomPanelMesh.position.z.toFixed(3)}`);
        } else {
            console.error("  [TallOvenMicro] Не удалось создать геометрию дна экструзией.");
        }
    }
    // --- КОНЕЦ КОДА ДЛЯ ДНА ---

     // --- ОБЩИЕ ПАРАМЕТРЫ ДЛЯ БОКОВИН И ВЫРЕЗОВ ГОЛА ---
    const handleType = kitchenGlobalParams.handleType || 'standard';
    const verticalGolaSetting = cabinetData.verticalGolaProfile || 'none';
    const golaCutDepthFromFront = 0.027; // Глубина "въедания" выреза от переднего торца ВНУТРЬ панели (27 мм)
    const golaCutVerticalLength = 0.070; // Вертикальная длина самого выреза Гола (70 мм)
    let actualGolaHeightMeters = 0;

    if (handleType === 'gola-profile') {
        const boxAvailableHeightMetersForGolaCalc = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;
        const facadeGapMeters = cabinetData.facadeGap || 0.003;
        actualGolaHeightMeters = calculateActualGolaHeight(
            kitchenGlobalParams.golaMinHeightMm,
            facadeGapMeters * 1000,
            boxAvailableHeightMetersForGolaCalc * 1000
        ) / 1000;
        console.log(`  [TallOvenMicro] actualGolaHeightMeters (для расчета фасадов/секций) = ${actualGolaHeightMeters.toFixed(3)}м`);
    }

    // --- НОВАЯ СТРОКА: Объявляем переменные для вырезов левой боковины на уровне функции ---
    let shapeType = 'simple';
    let y_start_cutout1 = -1, y_end_cutout1 = -1;
    let y_start_cutout2 = -1, y_end_cutout2 = -1;
    // ------------------------------------------------------------------------------------

    // --- НАЧАЛО БЛОКА 2: ЛЕВАЯ БОКОВИНА ---
    //console.log(`  [TallOvenMicro] Создание ЛЕВОЙ боковины...`);

    // --- 2.1 РАСЧЕТ РАЗМЕРОВ для левой боковины (ваша логика) ---
    const leftSide_Height = cabHeightM - panelThicknessM;
    let leftSide_Depth = cabDepthM;
    const leftSide_Thickness = panelThicknessM;

    if (verticalGolaSetting === 'left' || verticalGolaSetting === 'both') {
        leftSide_Depth = cabDepthM - 0.012;
        // console.log(`    Левая боковина: глубина (X Shape) уменьшена до ${leftSide_Depth.toFixed(3)}м`);
    }
    // console.log(`    Левая боковина: Размеры для Shape: Shape_X (Глубина) = ${leftSide_Depth.toFixed(3)}, Shape_Y (Высота) = ${leftSide_Height.toFixed(3)}. Экструзия (Толщина) = ${leftSide_Thickness.toFixed(3)}`);

    if (leftSide_Height <= 0 || leftSide_Depth <= 0 || leftSide_Thickness <= 0) {
        console.error("  [TallOvenMicro] Некорректные размеры для создания левой боковины.");
    } else {
        // --- 2.2 ОПРЕДЕЛЕНИЕ ТИПА КОНТУРА И РАСЧЕТ Y-КООРДИНАТ ВЫРЕЗОВ ---
        //let shapeType = 'simple'; // 'simple', 'one_cutout', 'two_cutouts'
        //let y_start_cutout1 = -1, y_end_cutout1 = -1;
        //let y_start_cutout2 = -1, y_end_cutout2 = -1;

        const ovenLevel = cabinetData.ovenLevel || 'drawer';
        const underOvenFill = cabinetData.underOvenFill || 'drawers';

        // Горизонтальные вырезы нужны ТОЛЬКО если тип ручек Гола И НЕТ никаких вертикальных Гола-профилей.
        let needsHorizontalGolaCutsLeft = false; // Переименовал для ясности
        if (handleType === 'gola-profile' && verticalGolaSetting === 'none') { // НОВАЯ СТРОКА (изменение условия)
            needsHorizontalGolaCutsLeft = true;                                // НОВАЯ СТРОКА
        }

        if (needsHorizontalGolaCutsLeft) {
            console.log(`    Левая боковина: Горизонтальные вырезы Гола разрешены.`);
            const baseHeightForStandardCuts = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;

            if (ovenLevel === 'drawer' && underOvenFill === 'drawers') {
                shapeType = 'one_cutout';
                // Нижний вырез (cutout1) - как у стандартного нижнего шкафа с 2-мя ящиками
                const heightOfLowestFacadeSectionInBox = (baseHeightForStandardCuts - 2 * actualGolaHeightMeters) / 2 - 58 / 1000 + actualGolaHeightMeters - panelThicknessM;
                y_start_cutout1 = heightOfLowestFacadeSectionInBox;
                y_end_cutout1 = y_start_cutout1 + golaCutVerticalLength;
                y_start_cutout2 = -1; y_end_cutout2 = -1; // Нет второго выреза

            } else if (ovenLevel === 'countertop' && underOvenFill === 'drawers') {
                shapeType = 'two_cutouts';
                // Нижний вырез (cutout1) - как у стандартного нижнего шкафа с 2-мя ящиками
                const heightOfLowestFacadeSectionInBox = (baseHeightForStandardCuts - 2 * actualGolaHeightMeters) / 2 - 58 / 1000 + actualGolaHeightMeters - panelThicknessM;
                y_start_cutout1 = heightOfLowestFacadeSectionInBox;
                y_end_cutout1 = y_start_cutout1 + golaCutVerticalLength;

                // Верхний вырез (cutout2) - над следующей секцией
                y_start_cutout2 = baseHeightForStandardCuts - 0.058 - panelThicknessM;
                y_end_cutout2 = y_start_cutout2 + golaCutVerticalLength;

            } else if (ovenLevel === 'countertop' && underOvenFill === 'swing') {
                shapeType = 'one_cutout';
                // Только один верхний вырез у верха боковины пенала
                y_start_cutout1 = baseHeightForStandardCuts - 0.058 - panelThicknessM;
                y_end_cutout1 = y_start_cutout1 + golaCutVerticalLength;
                y_start_cutout2 = -1; y_end_cutout2 = -1; // Нет второго выреза
            } else {
                shapeType = 'simple'; // Для других комбинаций (или если Гола не используется)
            }

            // Валидация и коррекция вырезов
            const allCuts = [];
            if (y_start_cutout1 !== -1 && y_end_cutout1 > y_start_cutout1 && y_start_cutout1 >= 0 && y_end_cutout1 <= leftSide_Height + 0.0001) {
                allCuts.push({ start: y_start_cutout1, end: y_end_cutout1 });
            } else {
                y_start_cutout1 = -1; y_end_cutout1 = -1;
            }
            if (y_start_cutout2 !== -1 && y_end_cutout2 > y_start_cutout2 && y_start_cutout2 >= 0 && y_end_cutout2 <= leftSide_Height + 0.0001) {
                allCuts.push({ start: y_start_cutout2, end: y_end_cutout2 });
            } else {
                y_start_cutout2 = -1; y_end_cutout2 = -1;
            }

            allCuts.sort((a, b) => a.start - b.start); // Сортируем вырезы по их началу

            // Проверка на пересечение отсортированных вырезов
            for (let k = 0; k < allCuts.length - 1; k++) {
                if (allCuts[k].end > allCuts[k+1].start - 0.0005) { // Если конец одного выреза заходит на начало следующего
                    console.warn(`      Обнаружено пересечение или слишком близкое расположение вырезов Гола. Вырез ${k+1} будет отменен.`);
                    if (allCuts[k+1].start === y_start_cutout1 && allCuts[k+1].end === y_end_cutout1) { y_start_cutout1 = -1; y_end_cutout1 = -1; }
                    if (allCuts[k+1].start === y_start_cutout2 && allCuts[k+1].end === y_end_cutout2) { y_start_cutout2 = -1; y_end_cutout2 = -1; }
                    allCuts.splice(k+1, 1); // Удаляем пересекающийся вырез
                    k--; // Повторяем проверку для текущего индекса, так как массив изменился
                }
            }
            // Обновляем shapeType на основе количества валидных вырезов
            const validCutsCount = allCuts.length;
            if (validCutsCount === 0) shapeType = 'simple';
            else if (validCutsCount === 1) {
                shapeType = 'one_cutout';
                // Переназначаем y_start_cutout1/end1 на единственный валидный вырез
                y_start_cutout1 = allCuts[0].start; y_end_cutout1 = allCuts[0].end;
                y_start_cutout2 = -1; y_end_cutout2 = -1;
            } else if (validCutsCount === 2) {
                shapeType = 'two_cutouts';
                y_start_cutout1 = allCuts[0].start; y_end_cutout1 = allCuts[0].end;
                y_start_cutout2 = allCuts[1].start; y_end_cutout2 = allCuts[1].end;
            }

        } else { // allowHorizontalGolaCuts = false
            shapeType = 'simple';
            console.log(`    Левая боковина: Горизонтальные вырезы Гола НЕ разрешены (из-за verticalGolaSetting или типа ручек). Тип формы: simple.`);
        }


        // --- 2.2.1 СОЗДАНИЕ ФОРМЫ (Shape) на основе shapeType ---
        const leftSideShape = new THREE.Shape();
        const x_front_edge_shape = leftSide_Depth; // X в Shape = глубина боковины
        const x_gola_inner_edge_shape = leftSide_Depth - golaCutDepthFromFront;

        leftSideShape.moveTo(0, 0); // Задний нижний
        leftSideShape.lineTo(0, leftSide_Height); // Задняя кромка до верха
        leftSideShape.lineTo(x_front_edge_shape, leftSide_Height); // Верхняя кромка до переда

        // Рисуем переднюю кромку сверху вниз
        if (shapeType === 'simple') {
            leftSideShape.lineTo(x_front_edge_shape, 0); // Прямая передняя кромка
        } else if (shapeType === 'one_cutout') {
            // Один вырез (используем y_start_cutout1, y_end_cutout1)
            leftSideShape.lineTo(x_front_edge_shape, y_end_cutout1);
            leftSideShape.lineTo(x_gola_inner_edge_shape, y_end_cutout1);
            leftSideShape.lineTo(x_gola_inner_edge_shape, y_start_cutout1);
            leftSideShape.lineTo(x_front_edge_shape, y_start_cutout1);
            leftSideShape.lineTo(x_front_edge_shape, 0);
        } else if (shapeType === 'two_cutouts') {
            // Два выреза (используем y_start_cutout2/end2 для верхнего, y_start_cutout1/end1 для нижнего)
            leftSideShape.lineTo(x_front_edge_shape, y_end_cutout2);    // До верха верхнего выреза
            leftSideShape.lineTo(x_gola_inner_edge_shape, y_end_cutout2); // Вырез 2
            leftSideShape.lineTo(x_gola_inner_edge_shape, y_start_cutout2);
            leftSideShape.lineTo(x_front_edge_shape, y_start_cutout2);

            leftSideShape.lineTo(x_front_edge_shape, y_end_cutout1);    // Прямой участок до верха нижнего выреза
            leftSideShape.lineTo(x_gola_inner_edge_shape, y_end_cutout1); // Вырез 1
            leftSideShape.lineTo(x_gola_inner_edge_shape, y_start_cutout1);
            leftSideShape.lineTo(x_front_edge_shape, y_start_cutout1);

            leftSideShape.lineTo(x_front_edge_shape, 0);                // До низа
        }
        leftSideShape.closePath(); // Замкнет на (0,0)

        // --- 2.3 СОЗДАНИЕ ГЕОМЕТРИИ И МЕША (как было) ---
        const extrudeSettingsSide = { depth: leftSide_Thickness, steps: 1, bevelEnabled: false };
        let leftSideGeometry = null;
        try {
            leftSideGeometry = new THREE.ExtrudeGeometry(leftSideShape, extrudeSettingsSide);
        } catch (error) { /* ... */ }

        if (leftSideGeometry) {
            const leftSideMesh = new THREE.Mesh(leftSideGeometry, cabinetMaterial.clone());
            leftSideMesh.name = `leftSide_ext_tall_oven_micro_${cabinetUUID.substring(0,4)}`;
            leftSideMesh.userData = {
                isCabinetPart: true, objectType: 'cabinetPart', panelType: 'leftSide',
                orientationType: 'vertical_extruded', cabinetUUID: cabinetUUID
            };

            // --- 2.4 ПОВОРОТ для левой боковины (как было) ---
            leftSideMesh.rotation.y = -Math.PI / 2;

            // --- 2.5 ПОЗИЦИОНИРОВАНИЕ левой боковины (вновь отлаженная версия) ---
            const meshPosX = -cabWidthM / 2 + leftSide_Thickness;
            const meshPosY = -cabHeightM / 2 + panelThicknessM; // Низ боковины на уровне верха дна
            const meshPosZ = -cabDepthM / 2;                   // Задний край боковины на заднем крае шкафа

            leftSideMesh.position.set(meshPosX, meshPosY, meshPosZ);

            if (leftSideMesh.material.map && leftSideMesh.material.map.isTexture) {
                // ==> ИСПРАВЛЕНИЕ: Для ExtrudeGeometry UV идут от 0 до 1 по bounding box.
                // Нам нужно вручную настроить `repeat`, чтобы компенсировать это.
                const texture = leftSideMesh.material.map;
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                
                // Масштабируем по реальным размерам шейпа
                texture.repeat.set(leftSide_Depth, leftSide_Height);
            }

            group.add(leftSideMesh);
            console.log(`      Левая боковина (${shapeType}) создана. Pos: X=${leftSideMesh.position.x.toFixed(3)}, Y=${leftSideMesh.position.y.toFixed(3)}, Z=${leftSideMesh.position.z.toFixed(3)}`);
        }
    }
    // --- КОНЕЦ БЛОКА 2: ЛЕВАЯ БОКОВИНА ---

   // --- НАЧАЛО БЛОКА 3: ПРАВАЯ БОКОВИНА ---
    console.log(`  [TallOvenMicro] Создание ПРАВОЙ боковины...`);

    // --- 3.1 РАСЧЕТ РАЗМЕРОВ для правой боковины ---
    const rightSide_Height = cabHeightM - panelThicknessM; // Y Shape
    let rightSide_Depth = cabDepthM;                    // X Shape (глубина панели)
    const rightSide_Thickness = panelThicknessM;        // Глубина экструзии (толщина панели)

    // Условие для уменьшения глубины правой боковины из-за вертикального Гола
    if (verticalGolaSetting === 'right' || verticalGolaSetting === 'both') {
        rightSide_Depth = cabDepthM - 0.012;
        console.log(`    Правая боковина: глубина (X Shape) уменьшена до ${rightSide_Depth.toFixed(3)}м из-за verticalGola: ${verticalGolaSetting}`);
    }
    // console.log(`    Правая боковина: Размеры для Shape: Shape_X (Глубина) = ${rightSide_Depth.toFixed(3)}, Shape_Y (Высота) = ${rightSide_Height.toFixed(3)}. Экструзия (Толщина) = ${rightSide_Thickness.toFixed(3)}`);

    if (rightSide_Height <= 0 || rightSide_Depth <= 0 || rightSide_Thickness <= 0) {
        console.error("  [TallOvenMicro] Некорректные размеры для создания правой боковины.");
    } else {
        // --- 3.2 ОПРЕДЕЛЕНИЕ ТИПА КОНТУРА И РАСЧЕТ Y-КООРДИНАТ ВЫРЕЗОВ ---
        let shapeType_R = 'simple'; // 'simple', 'one_cutout', 'two_cutouts'
        let y_start_cutout1_R = -1, y_end_cutout1_R = -1;
        let y_start_cutout2_R = -1, y_end_cutout2_R = -1;

        const ovenLevel_R = cabinetData.ovenLevel || 'drawer'; // Используем те же настройки шкафа
        const underOvenFill_R = cabinetData.underOvenFill || 'drawers';

        // Горизонтальные вырезы нужны ТОЛЬКО если тип ручек Гола И НЕТ никаких вертикальных Гола-профилей.
        let needsHorizontalGolaCutsLeft = false; // Переименовал для ясности
        if (handleType === 'gola-profile' && verticalGolaSetting === 'none') { // НОВАЯ СТРОКА (изменение условия)
            needsHorizontalGolaCutsLeft = true;                                // НОВАЯ СТРОКА
        }

        if (needsHorizontalGolaCutsLeft) {
            console.log(`    Правая боковина: Горизонтальные вырезы Гола разрешены.`);
            const baseHeightForStandardCuts_R = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;

            if (ovenLevel_R === 'drawer' && underOvenFill_R === 'drawers') {
                shapeType_R = 'one_cutout'; // Как и для левой, согласно вашему коду
                const heightOfLowestFacadeSectionInBox_R = (baseHeightForStandardCuts_R - 2 * actualGolaHeightMeters) / 2 - 58 / 1000 + actualGolaHeightMeters - panelThicknessM;
                y_start_cutout1_R = heightOfLowestFacadeSectionInBox_R;
                y_end_cutout1_R = y_start_cutout1_R + golaCutVerticalLength;
                y_start_cutout2_R = -1; y_end_cutout2_R = -1;
            } else if (ovenLevel_R === 'countertop' && underOvenFill_R === 'drawers') {
                shapeType_R = 'two_cutouts';
                const heightOfLowestFacadeSectionInBox_R = (baseHeightForStandardCuts_R - 2 * actualGolaHeightMeters) / 2 - 58 / 1000 + actualGolaHeightMeters - panelThicknessM;
                y_start_cutout1_R = heightOfLowestFacadeSectionInBox_R;
                y_end_cutout1_R = y_start_cutout1_R + golaCutVerticalLength;
                y_start_cutout2_R = baseHeightForStandardCuts_R - 0.058 - panelThicknessM;
                y_end_cutout2_R = y_start_cutout2_R + golaCutVerticalLength;
            } else if (ovenLevel_R === 'countertop' && underOvenFill_R === 'swing') {
                shapeType_R = 'one_cutout';
                y_start_cutout1_R = baseHeightForStandardCuts_R - 0.058 - panelThicknessM; // Используем _cutout1 для единственного
                y_end_cutout1_R = y_start_cutout1_R + golaCutVerticalLength;
                y_start_cutout2_R = -1; y_end_cutout2_R = -1;
            } else {
                shapeType_R = 'simple';
            }

            // Валидация и коррекция вырезов для правой боковины
            const allCuts_R = [];
            if (y_start_cutout1_R !== -1 && y_end_cutout1_R > y_start_cutout1_R && y_start_cutout1_R >= 0 && y_end_cutout1_R <= rightSide_Height + 0.0001) {
                allCuts_R.push({ start: y_start_cutout1_R, end: y_end_cutout1_R });
            } else { y_start_cutout1_R = -1; y_end_cutout1_R = -1; }
            if (y_start_cutout2_R !== -1 && y_end_cutout2_R > y_start_cutout2_R && y_start_cutout2_R >= 0 && y_end_cutout2_R <= rightSide_Height + 0.0001) {
                allCuts_R.push({ start: y_start_cutout2_R, end: y_end_cutout2_R });
            } else { y_start_cutout2_R = -1; y_end_cutout2_R = -1; }
            allCuts_R.sort((a, b) => a.start - b.start);
            for (let k = 0; k < allCuts_R.length - 1; k++) {
                if (allCuts_R[k].end > allCuts_R[k+1].start - 0.0005) {
                    if (allCuts_R[k+1].start === y_start_cutout1_R && allCuts_R[k+1].end === y_end_cutout1_R) { y_start_cutout1_R = -1; y_end_cutout1_R = -1; }
                    if (allCuts_R[k+1].start === y_start_cutout2_R && allCuts_R[k+1].end === y_end_cutout2_R) { y_start_cutout2_R = -1; y_end_cutout2_R = -1; }
                    allCuts_R.splice(k+1, 1); k--;
                }
            }
            const validCutsCount_R = allCuts_R.length;
            if (validCutsCount_R === 0) shapeType_R = 'simple';
            else if (validCutsCount_R === 1) {
                shapeType_R = 'one_cutout';
                y_start_cutout1_R = allCuts_R[0].start; y_end_cutout1_R = allCuts_R[0].end;
                y_start_cutout2_R = -1; y_end_cutout2_R = -1;
            } else if (validCutsCount_R === 2) {
                shapeType_R = 'two_cutouts';
                y_start_cutout1_R = allCuts_R[0].start; y_end_cutout1_R = allCuts_R[0].end;
                y_start_cutout2_R = allCuts_R[1].start; y_end_cutout2_R = allCuts_R[1].end;
            }
        } else {
            shapeType_R = 'simple';
            // console.log(`    Правая боковина: Горизонтальные вырезы Гола НЕ разрешены. Тип формы: simple.`);
        }

        // --- 3.2.1 СОЗДАНИЕ ФОРМЫ (Shape) на основе shapeType_R ---
        const rightSideShape = new THREE.Shape();
        const x_front_edge_shape_R = rightSide_Depth;
        const x_gola_inner_edge_shape_R = rightSide_Depth - golaCutDepthFromFront;

        rightSideShape.moveTo(0, 0);
        rightSideShape.lineTo(0, rightSide_Height);
        rightSideShape.lineTo(x_front_edge_shape_R, rightSide_Height);

        if (shapeType_R === 'simple') {
            rightSideShape.lineTo(x_front_edge_shape_R, 0);
        } else if (shapeType_R === 'one_cutout') {
            rightSideShape.lineTo(x_front_edge_shape_R, y_end_cutout1_R);
            rightSideShape.lineTo(x_gola_inner_edge_shape_R, y_end_cutout1_R);
            rightSideShape.lineTo(x_gola_inner_edge_shape_R, y_start_cutout1_R);
            rightSideShape.lineTo(x_front_edge_shape_R, y_start_cutout1_R);
            rightSideShape.lineTo(x_front_edge_shape_R, 0);
        } else if (shapeType_R === 'two_cutouts') {
            rightSideShape.lineTo(x_front_edge_shape_R, y_end_cutout2_R);
            rightSideShape.lineTo(x_gola_inner_edge_shape_R, y_end_cutout2_R);
            rightSideShape.lineTo(x_gola_inner_edge_shape_R, y_start_cutout2_R);
            rightSideShape.lineTo(x_front_edge_shape_R, y_start_cutout2_R);
            rightSideShape.lineTo(x_front_edge_shape_R, y_end_cutout1_R);
            rightSideShape.lineTo(x_gola_inner_edge_shape_R, y_end_cutout1_R);
            rightSideShape.lineTo(x_gola_inner_edge_shape_R, y_start_cutout1_R);
            rightSideShape.lineTo(x_front_edge_shape_R, y_start_cutout1_R);
            rightSideShape.lineTo(x_front_edge_shape_R, 0);
        }
        rightSideShape.closePath();

        // --- 3.3 СОЗДАНИЕ ГЕОМЕТРИИ И МЕША для правой боковины ---
        const extrudeSettingsSideR = { depth: rightSide_Thickness, steps: 1, bevelEnabled: false };
        let rightSideGeometry = null;
        try {
            rightSideGeometry = new THREE.ExtrudeGeometry(rightSideShape, extrudeSettingsSideR);
        } catch (error) { console.error(`    [TallOvenMicro] Ошибка ExtrudeGeometry для правой боковины:`, error); }

        if (rightSideGeometry) {
            const rightSideMesh = new THREE.Mesh(rightSideGeometry, cabinetMaterial.clone());
            rightSideMesh.name = `rightSide_ext_tall_oven_micro_${cabinetUUID.substring(0,4)}`;
            rightSideMesh.userData = {
                isCabinetPart: true, objectType: 'cabinetPart', panelType: 'rightSide',
                orientationType: 'vertical_extruded', cabinetUUID: cabinetUUID
            };

            // --- 3.4 ПОВОРОТ для правой боковины ---
            rightSideMesh.rotation.y = -Math.PI / 2; // Поворот в 

            // --- 3.5 ПОЗИЦИОНИРОВАНИЕ правой боковины ---

            const meshPosX_R = cabWidthM / 2; // Внешняя плоскость боковины (бывшая Z экструзии=thickness) на правом краю шкафа
            const meshPosY_R = -cabHeightM / 2 + panelThicknessM;
            const meshPosZ_R = -cabDepthM / 2;

            rightSideMesh.position.set(meshPosX_R, meshPosY_R, meshPosZ_R);
            if (rightSideMesh.material.map && rightSideMesh.material.map.isTexture) {
                    const texture = rightSideMesh.material.map;
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    texture.repeat.set(0.77, 0.3572);
                }
            group.add(rightSideMesh);
            console.log(`      Правая боковина (${shapeType_R}) создана. Pos: X=${rightSideMesh.position.x.toFixed(3)}, Y=${rightSideMesh.position.y.toFixed(3)}, Z=${rightSideMesh.position.z.toFixed(3)}`);
        }
    }
    // --- КОНЕЦ БЛОКА 3: ПРАВАЯ БОКОВИНА ---
    // --- БЛОКА 4: ГОЛА ПРОФИЛИ ---
    // Материал для Гола-профилей
    const golaMaterial = new THREE.MeshStandardMaterial({
        color: 0xAAAAAA, // Серый алюминий
        metalness: 0.8,
        roughness: 0.4,
        name: `GolaProfileMat_Tall_${cabinetUUID.substring(0,4)}`
    });
    //const golaShapeActualHeightM = 0.058; // Фактическая высота сечения Гола-профиля (58мм)
    // --- 4.1 Горизонтальные Гола-профили ---
    if (handleType === 'gola-profile' && verticalGolaSetting === 'none') {
        const horizontalGolaLength = cabWidthM; // Длина профиля

        if (horizontalGolaLength > 0.01) {
            // Профиль 1 (нижний или единственный)
            if (y_start_cutout1 !== -1) { // Если y_start_cutout1 был рассчитан и он валиден
                const golaProfileMesh1 = createGolaProfileMesh(horizontalGolaLength, golaMaterial, "gola_H_1_tall", cabinetUUID);
                if (golaProfileMesh1) {
                    golaProfileMesh1.rotation.y = Math.PI / 2; // Длина профиля по X шкафа
                    // Позиционирование Y:
                    const gola1_CenterY_Global = (-cabHeightM / 2 + panelThicknessM) + y_start_cutout1;
                    // Позиционирование Z:
                    const gola_Z_rear_plane_Global = cabDepthM / 2;
                    
                    golaProfileMesh1.position.set(0, gola1_CenterY_Global, gola_Z_rear_plane_Global);
                    group.add(golaProfileMesh1);
                    console.log(`      Горизонтальный Гола-1 добавлен. Y=${gola1_CenterY_Global.toFixed(3)}, Z=${gola_Z_rear_plane_Global.toFixed(3)} (Длина: ${horizontalGolaLength.toFixed(3)})`);
                }
            }

            // Профиль 2 (верхний, если есть)
            if (y_start_cutout2 !== -1) { // Если y_start_cutout2 был рассчитан и он валиден
                const golaProfileMesh2 = createGolaProfileMesh(horizontalGolaLength, golaMaterial, "gola_H_2_tall", cabinetUUID);
                if (golaProfileMesh2) {
                    golaProfileMesh2.rotation.y = Math.PI / 2;
                    const gola2_CenterY_Global = (-cabHeightM / 2 + panelThicknessM) + y_start_cutout2;
                    const gola_Z_rear_plane_Global = cabDepthM / 2; // Z такое же

                    golaProfileMesh2.position.set(0, gola2_CenterY_Global, gola_Z_rear_plane_Global);
                    group.add(golaProfileMesh2);
                    console.log(`      Горизонтальный Гола-2 добавлен. Y=${gola2_CenterY_Global.toFixed(3)}, Z=${gola_Z_rear_plane_Global.toFixed(3)} (Длина: ${horizontalGolaLength.toFixed(3)})`);
                }
            }
        } else {
            console.log(`    Горизонтальные Гола-профили не созданы (недостаточная ширина шкафа: ${horizontalGolaLength.toFixed(3)}м).`);
        }
    } else {
        console.log(`    Горизонтальные Гола-профили не требуются (тип ручек: ${handleType}).`);
    }
    // --- КОНЕЦ БЛОКА 4 ---
    // --- НАЧАЛО БЛОКА 5: ПОЛКА ДЛЯ ДУХОВКИ ---
    console.log(`  [TallOvenMicro] Создание ПОЛКИ для духовки...`);

    const ovenLevel = cabinetData.ovenLevel || 'drawer'; // drawer или countertop
    let ovenSupportShelfMesh = null;

    // --- 5.1 Расчет размеров полки ---
    const shelfWidth = cabWidthM - 2 * panelThicknessM;
    const shelfThickness = panelThicknessM; // "Высота" для createPanel
    let shelfDepth;

    if (handleType !== 'gola-profile' || verticalGolaSetting !== 'none') {
        shelfDepth = cabDepthM - 0.040; // Полка короче на 40мм
        console.log(`    Полка (не Гола): глубина = ${cabDepthM.toFixed(3)} - 0.040 = ${shelfDepth.toFixed(3)}м`);
    } else if (handleType === 'gola-profile' && verticalGolaSetting === 'none'){ // handleType === 'gola-profile'
        shelfDepth = cabDepthM - 0.040 - 0.027; // Полка короче на 40мм и еще на 27мм
        console.log(`    Полка (Гола): глубина = ${cabDepthM.toFixed(3)} - 0.040 - 0.027 = ${shelfDepth.toFixed(3)}м`);
    }

    if (shelfWidth <= 0 || shelfThickness <= 0 || shelfDepth <= 0) {
        console.error("  [TallOvenMicro] Некорректные размеры для создания полки духовки.");
    } else {
        // --- 5.2 Расчет Y-координаты ЦЕНТРА полки ---
        let shelf_top_surface_Y_from_side_bottom; // Y ВЕРХНЕЙ плоскости полки от НИЗА БОКОВИНЫ

        if (handleType !== 'gola-profile' || verticalGolaSetting !== 'none') {
            const baseHeightForStandardCuts = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;
            const facadeGapMeters = cabinetData.facadeGap || 0.003;
            // Высота нижнего фасада, если бы это был стандартный нижний шкаф с двумя ящиками и обычными ручками
            const height_of_standard_lower_facade = (baseHeightForStandardCuts - facadeGapMeters * 2) / 2; // Ваша формула
            if (ovenLevel === 'drawer') {
                shelf_top_surface_Y_from_side_bottom = height_of_standard_lower_facade + 0.008; // Ваша формула: ВЕРХ полки
            } else {
                shelf_top_surface_Y_from_side_bottom = height_of_standard_lower_facade * 2 + 0.008 + facadeGapMeters; // Ваша формула: ВЕРХ полки
            }
        } else { // handleType === 'gola-profile'
            // Y ВЕРХА полки = нижняя точка СООТВЕТСТВУЮЩЕГО выреза Гола + высота самого сечения Гола (58мм)
            // Используем y-координаты вырезов левой боковины (left_y_start_cutout1 или left_y_start_cutout2)
            let relevant_gola_cut_bottom_Y;
            if (ovenLevel === 'drawer') {
                // Духовка на уровне первого ящика, значит полка под первым (нижним) Гола-профилем.
                // Гола-профиль будет НАД этой полкой.
                // Значит, ВЕРХ полки = НИЗ первого выреза Гола.
                relevant_gola_cut_bottom_Y = y_start_cutout1; // Это Y низа первого выреза от низа боковины
            } else { // ovenLevel === 'countertop'
                // Духовка на уровне столешницы, значит полка под ВТОРЫМ (верхним) Гола-профилем.
                // ВЕРХ полки = НИЗ второго выреза Гола.
                relevant_gola_cut_bottom_Y = y_start_cutout2; // Это Y низа второго выреза от низа боковины
                // Если второго выреза нет (например, в 'countertop'/'swing'), а духовка сверху,
                // то полка должна быть под единственным верхним вырезом Гола.
                // В этом случае left_y_start_cutout1 будет содержать Y этого единственного верхнего выреза.
                if (relevant_gola_cut_bottom_Y === -1 && y_start_cutout1 !== -1) {
                    relevant_gola_cut_bottom_Y = y_start_cutout1;
                }
            }

            if (relevant_gola_cut_bottom_Y === -1 || relevant_gola_cut_bottom_Y === undefined) {
                console.warn("    Полка (Гола): не удалось определить Y-координату выреза Гола для позиционирования полки. Используется аварийное значение.");
                // Аварийное значение: например, середина высоты боковины минус половина высоты духовки
                const approxOvenHeight = 0.6; // Примерно
                shelf_top_surface_Y_from_side_bottom = leftSide_Height / 2 - approxOvenHeight / 2;
            } else {
                shelf_top_surface_Y_from_side_bottom = relevant_gola_cut_bottom_Y + panelThicknessM + 0.058; // ВЕРХ полки = НИЗ выреза Гола
                console.log(`    Полка (Гола): Y верха полки (от низа боковины) = ${relevant_gola_cut_bottom_Y.toFixed(3)} (низ выреза Гола)`);
            }
        }

        // Глобальная Y-координата центра полки
        const shelfGlobalY_bottom_of_side = -cabHeightM / 2; // Низ шкафа
        const shelfCenterY_Global = shelfGlobalY_bottom_of_side + shelf_top_surface_Y_from_side_bottom - (shelfThickness / 2);

        // --- 5.3 Расчет Z-координаты ЦЕНТРА полки ---
        let shelfCenterZ_Global;
        const cabinetFrontEdgeGlobalZ = cabDepthM / 2;

        if (handleType !== 'gola-profile' || verticalGolaSetting !== 'none') {
            shelfCenterZ_Global = cabinetFrontEdgeGlobalZ - shelfDepth / 2;
            console.log(`    Полка (не Гола): Z-центр = ${cabinetFrontEdgeGlobalZ.toFixed(3)} (перед шкафа) - ${shelfDepth.toFixed(3)}/2 = ${shelfCenterZ_Global.toFixed(3)}м`);
        } else { // handleType === 'gola-profile'
            shelfCenterZ_Global = (cabinetFrontEdgeGlobalZ - 0.028) - shelfDepth / 2;
            console.log(`    Полка (Гола): Z-центр = (${cabinetFrontEdgeGlobalZ.toFixed(3)} (перед шкафа) - 0.028) - ${shelfDepth.toFixed(3)}/2 = ${shelfCenterZ_Global.toFixed(3)}м`);
        }


        // --- 5.4 Создание меша полки ---
            ovenSupportShelfMesh = createPanel(
            shelfWidth,
            shelfThickness, // Толщина полки
            shelfDepth,
            cabinetMaterial, // Используем материал корпуса
            'horizontal',    // Ориентация толщины по Y
            `oven_support_shelf_${cabinetUUID.substring(0,4)}`
        );

        if (ovenSupportShelfMesh) {
            ovenSupportShelfMesh.position.set(0, shelfCenterY_Global, shelfCenterZ_Global);
            ovenSupportShelfMesh.userData.cabinetUUID = cabinetUUID;
            group.add(ovenSupportShelfMesh);
            console.log(`    Полка для духовки создана. Pos: X=0, Y=${shelfCenterY_Global.toFixed(3)}, Z=${shelfCenterZ_Global.toFixed(3)}`);
        } else {
            console.error("  [TallOvenMicro] Не удалось создать меш полки для духовки.");
        }
    }
    // --- КОНЕЦ БЛОКА 5: ПОЛКА ДЛЯ ДУХОВКИ ---
    // --- НАЧАЛО БЛОКА 6: ПОЛКА ДЛЯ МИКРОВОЛНОВКИ ---
    // Эта полка создается, только если есть предыдущая полка (ovenSupportShelfMesh)
    // и если в конфигурации шкафа предусмотрена микроволновка (например, cabinetData.microwaveType !== 'none')
    let microShelfMesh = null;

    if (ovenSupportShelfMesh && (cabinetData.microwaveType && cabinetData.microwaveType !== 'none')) {

        // --- 6.1 Расчет размеров полки для СВЧ ---
        const microShelfWidth = cabWidthM - 2 * panelThicknessM - 0.002; // Зазор по 1мм
        const microShelfThickness = panelThicknessM; // "Высота" для createPanel
        const microShelfDepth = cabDepthM - 0.060;   // Короче на 60мм

        if (microShelfWidth <= 0 || microShelfThickness <= 0 || microShelfDepth <= 0) {
            console.error("  [TallOvenMicro] Некорректные размеры для создания полки СВЧ.");
        } else {
            // --- 6.2 Расчет Y-координаты ЦЕНТРА полки для СВЧ ---
            // Y-координата ВЕРХА полки для духовки (из Блока 5)
            const ovenShelf_TopSurfaceY_Global = ovenSupportShelfMesh.position.y + (ovenSupportShelfMesh.geometry.parameters.height / 2); // shelfThickness / 2

            // Высота самой духовки + небольшой зазор над ней.
            // Используем cabinetData.ovenType для определения высоты духовки.
            let ovenActualMountingHeightM;
            if (cabinetData.ovenType === '600') {
                ovenActualMountingHeightM = 0.595 + 0.001; // 595мм духовка + 1мм зазор
            } else if (cabinetData.ovenType === '450') {
                ovenActualMountingHeightM = 0.450 + 0.001; // 450мм духовка + 1мм зазор
            } else { // Если ovenType не задан или 'none', берем высоту 600мм духовки как худший случай для расчета
                console.warn(`    [TallOvenMicro] Тип духовки (ovenType) не определен или 'none' для расчета высоты под СВЧ. Используется 0.596м.`);
                ovenActualMountingHeightM = 0.380;
            }
            console.log(`    Полка СВЧ: Высота духовки для расчета = ${ovenActualMountingHeightM.toFixed(3)}м`);

            // Низ полки СВЧ будет на уровне верха пространства под духовку
            const microShelf_BottomSurfaceY_Global = ovenShelf_TopSurfaceY_Global + ovenActualMountingHeightM;
            // Центр полки СВЧ
            const microShelfCenterY_Global = microShelf_BottomSurfaceY_Global + microShelfThickness / 2;
            console.log(`    Полка СВЧ: Y верха полки духовки=${ovenShelf_TopSurfaceY_Global.toFixed(3)}, Y низа полки СВЧ=${microShelf_BottomSurfaceY_Global.toFixed(3)}, Y центра полки СВЧ=${microShelfCenterY_Global.toFixed(3)}`);

            // --- 6.3 Расчет Z-координаты ЦЕНТРА полки для СВЧ ---
            // "передний торец полки по переднему торцу шкафа"
            // Это значит, что 60мм отступа сзади.
            const cabinetFrontEdgeGlobalZ = cabDepthM / 2; // Передний край шкафа (внутренний, у боковин)
            const microShelfCenterZ_Global = cabinetFrontEdgeGlobalZ - microShelfDepth / 2;
            console.log(`    Полка СВЧ: Z-центр = ${cabinetFrontEdgeGlobalZ.toFixed(3)} (перед шкафа) - ${microShelfDepth.toFixed(3)}/2 = ${microShelfCenterZ_Global.toFixed(3)}м`);

            // --- 6.4 Создание меша полки для СВЧ ---
                microShelfMesh = createPanel(
                microShelfWidth,
                microShelfThickness,
                microShelfDepth,
                cabinetMaterial, // Используем материал корпуса
                'horizontal',
                `microwave_shelf_${cabinetUUID.substring(0,4)}`
            );

            if (microShelfMesh) {
                microShelfMesh.position.set(0, microShelfCenterY_Global, microShelfCenterZ_Global);
                microShelfMesh.userData.cabinetUUID = cabinetUUID;
                group.add(microShelfMesh);
                console.log(`    Полка для СВЧ создана. Pos: X=0, Y=${microShelfCenterY_Global.toFixed(3)}, Z=${microShelfCenterZ_Global.toFixed(3)}`);
            } else {
                console.error("  [TallOvenMicro] Не удалось создать меш полки для СВЧ.");
            }
        }
    } else {
        if (!ovenSupportShelfMesh) {
            console.log(`  [TallOvenMicro] Полка для СВЧ не создается: отсутствует полка для духовки.`);
        }
        if (!cabinetData.microwaveType || cabinetData.microwaveType === 'none') {
            console.log(`  [TallOvenMicro] Полка для СВЧ не создается: тип СВЧ не указан или 'none'.`);
        }
    }
    // --- КОНЕЦ БЛОКА 6: ПОЛКА ДЛЯ МИКРОВОЛНОВКИ ---
    // --- НАЧАЛО БЛОКА 7: ПОЛКА НАД СВЧ (ДНО ВЕРХНЕЙ СЕКЦИИ) ---
    
    // --- 7.1 Расчет размеров полки ---
    const tsbs_Width = cabWidthM - 2 * panelThicknessM;     // tsbs = Top Section Bottom Shelf
    const tsbs_Thickness = panelThicknessM;                 // "Высота" для createPanel
    const tsbs_Depth = cabDepthM - 0.060 - panelThicknessM;; // Пока считаем
    let topSectionBottomShelfMesh = null;

    if (tsbs_Width <= 0 || tsbs_Thickness <= 0 || tsbs_Depth <= 0) {
        console.error("  [TallOvenMicro] Блок 7: Некорректные размеры для создания дна верхней секции.");
    } else {
        // --- 7.2 Расчет Y-координаты ЦЕНТРА полки ---
        let top_of_space_below_Y_Global; // Верхняя точка пространства ПОД этой полкой

        if (cabinetData.microwaveType && cabinetData.microwaveType !== 'none' && microShelfMesh) {
            // Случай 1: СВЧ ЕСТЬ, и полка для нее была создана
            const microShelf_TopSurfaceY_Global = microShelfMesh.position.y + (microShelfMesh.geometry.parameters.height / 2);
            
            let microwaveActualMountingHeightM;
            if (cabinetData.microwaveType === '362') microwaveActualMountingHeightM = 0.362 + 0; // 362мм СВЧ + 1мм зазор
            else if (cabinetData.microwaveType === '380') microwaveActualMountingHeightM = 0.380 + 0; // 380мм СВЧ + 1мм зазор
            else { // Неизвестный тип СВЧ, берем больший для безопасности
                console.warn(`    [TallOvenMicro] Блок 7: Неизвестный тип СВЧ (${cabinetData.microwaveType}) для расчета высоты. Используется 0.381м.`);
                microwaveActualMountingHeightM = 0.380;
            }
            top_of_space_below_Y_Global = microShelf_TopSurfaceY_Global + microwaveActualMountingHeightM;
            console.log(`    Дно в/секц (СВЧ есть): Y верха полки СВЧ=${microShelf_TopSurfaceY_Global.toFixed(3)}, Высота СВЧ=${microwaveActualMountingHeightM.toFixed(3)}, Y верха пространства под СВЧ=${top_of_space_below_Y_Global.toFixed(3)}`);

        } else {
            // Случай 2: СВЧ НЕТ (или ее полка не создана). Рассчитываем от полки духовки.
            if (!ovenSupportShelfMesh) { // ovenSupportShelfMesh должен быть объявлен на уровне функции
                console.error("  [TallOvenMicro] Блок 7: Ошибка - полка для духовки (ovenSupportShelfMesh) не найдена для расчета позиции дна верхней секции!");
                // В этом случае позиционирование будет некорректным, но попытаемся создать полку хотя бы где-то
                top_of_space_below_Y_Global = 0; // Аварийное значение
            } else {
                const ovenShelf_TopSurfaceY_Global_B7 = ovenSupportShelfMesh.position.y + (ovenSupportShelfMesh.geometry.parameters.height / 2); // Верх полки духовки
                
                let ovenActualMountingHeightM_B7;
                if (cabinetData.ovenType === '600') ovenActualMountingHeightM_B7 = 0.595 + 0.001;
                else if (cabinetData.ovenType === '450') ovenActualMountingHeightM_B7 = 0.450 + 0.001;
                else ovenActualMountingHeightM_B7 = 0.380;

                const imaginary_microShelf_BottomY_Global = ovenShelf_TopSurfaceY_Global_B7 + ovenActualMountingHeightM_B7;
                //const imaginary_microShelf_TopY_Global = imaginary_microShelf_BottomY_Global + panelThicknessM; // Добавляем толщину "воображаемой" полки СВЧ

                // Высота "воображаемой" СВЧ (берем 380мм по умолчанию, если СВЧ нет)
                //const microwaveActualMountingHeightM_default = 0.380 + 0;
                top_of_space_below_Y_Global = imaginary_microShelf_BottomY_Global;
                //console.log(`      Y верха полки дух.=${ovenShelf_TopSurfaceY_Global_B7.toFixed(3)}, Y верха вообр.полки СВЧ=${imaginary_microShelf_TopY_Global.toFixed(3)}, Y верха пространства под СВЧ=${top_of_space_below_Y_Global.toFixed(3)}`);
            }
        }

        // Низ текущей полки (дна верхней секции) будет на top_of_space_below_Y_Global
        const tsbs_CenterY_Global = top_of_space_below_Y_Global + tsbs_Thickness / 2;

        // --- 7.3 Расчет Z-координаты ЦЕНТРА полки ---
        // "передний торец полки по переднему торцу шкафа"
        // Глубина полки tsbs_Depth (сейчас = cabDepthM - 0.060)
        const cabinetFrontEdgeGlobalZ_B7 = cabDepthM / 2;
        const tsbs_CenterZ_Global = cabinetFrontEdgeGlobalZ_B7 - tsbs_Depth / 2;
        // console.log(`    Дно в/секц: Z-центр = ${cabinetFrontEdgeGlobalZ_B7.toFixed(3)} (перед шкафа) - ${tsbs_Depth.toFixed(3)}/2 = ${tsbs_CenterZ_Global.toFixed(3)}м`);

        // --- 7.4 Создание меша полки ---
        topSectionBottomShelfMesh = createPanel(
            tsbs_Width,
            tsbs_Thickness,
            tsbs_Depth,
            cabinetMaterial,
            'horizontal',
            `top_section_bottom_shelf_${cabinetUUID.substring(0,4)}`
        );

        if (topSectionBottomShelfMesh) {
            topSectionBottomShelfMesh.position.set(0, tsbs_CenterY_Global, tsbs_CenterZ_Global);
            topSectionBottomShelfMesh.userData.cabinetUUID = cabinetUUID;
            group.add(topSectionBottomShelfMesh);
            console.log(`    Дно верхней секции создано. Pos: X=0, Y=${tsbs_CenterY_Global.toFixed(3)}, Z=${tsbs_CenterZ_Global.toFixed(3)}`);
        } else {
            console.error("  [TallOvenMicro] Блок 7: Не удалось создать меш дна верхней секции.");
        }
    }
    // --- КОНЕЦ БЛОКА 7: ПОЛКА НАД СВЧ (ДНО ВЕРХНЕЙ СЕКЦИИ) ---
    // --- НАЧАЛО БЛОКА 8: КРЫША ШКАФА ---
    console.log(`  [TallOvenMicro] Создание КРЫШИ шкафа...`);
    let roofMesh = null;

    // --- 8.1 Расчет размеров крыши ---
    const roof_Width = cabWidthM - 2 * panelThicknessM;
    const roof_Thickness = panelThicknessM; // "Высота" для createPanel
    const roof_Depth = cabDepthM - 0.060 - panelThicknessM;   // Такая же глубина, как у полки дна верхней секции

    console.log(`    Крыша: W=${roof_Width.toFixed(3)}, H(толщина)=${roof_Thickness.toFixed(3)}, D=${roof_Depth.toFixed(3)}`);

    if (roof_Width <= 0 || roof_Thickness <= 0 || roof_Depth <= 0) {
        console.error("  [TallOvenMicro] Блок 8: Некорректные размеры для создания крыши.");
    } else {
        // --- 8.2 Расчет Y-координаты ЦЕНТРА крыши ---
        // Верхняя грань крыши на Y_глоб = cabHeightM / 2
        const roof_CenterY_Global = cabHeightM / 2 - roof_Thickness / 2;
        console.log(`    Крыша: Y-центр = ${cabHeightM / 2 .toFixed(3)} (верх шкафа) - ${roof_Thickness.toFixed(3)}/2 = ${roof_CenterY_Global.toFixed(3)}м`);

        // --- 8.3 Расчет Z-координаты ЦЕНТРА крыши ---
        // Передний торец крыши по переднему торцу шкафа, отступ 60мм сзади
        const cabinetFrontEdgeGlobalZ_B8 = cabDepthM / 2;
        const roof_CenterZ_Global = cabinetFrontEdgeGlobalZ_B8 - roof_Depth / 2;
        console.log(`    Крыша: Z-центр = ${cabinetFrontEdgeGlobalZ_B8.toFixed(3)} (перед шкафа) - ${roof_Depth.toFixed(3)}/2 = ${roof_CenterZ_Global.toFixed(3)}м`);

        // --- 8.4 Создание меша крыши ---
        roofMesh = createPanel(
            roof_Width,
            roof_Thickness, // Толщина для createPanel
            roof_Depth,
            cabinetMaterial, // Используем материал корпуса
            'horizontal',    // Ориентация толщины по Y
            `roof_tall_oven_micro_${cabinetUUID.substring(0,4)}`
        );

        if (roofMesh) {
            roofMesh.position.set(0, roof_CenterY_Global, roof_CenterZ_Global); // X=0 (центр шкафа)
            roofMesh.userData.cabinetUUID = cabinetUUID;
            roofMesh.userData.panelType = 'roof'; // Добавляем тип панели
            group.add(roofMesh);
            console.log(`    Крыша создана. Pos: X=0, Y=${roof_CenterY_Global.toFixed(3)}, Z=${roof_CenterZ_Global.toFixed(3)}`);
        } else {
            console.error("  [TallOvenMicro] Блок 8: Не удалось создать меш крыши.");
        }
    }
    // --- КОНЕЦ БЛОКА 8: КРЫША ШКАФА ---
    // --- НАЧАЛО БЛОКА 9: ЗАДНЯЯ СТЕНКА ВЕРХНЕЙ СЕКЦИИ ---
    console.log(`  [TallOvenMicro] Создание ЗАДНЕЙ СТЕНКИ ВЕРХНЕЙ СЕКЦИИ...`);

    // Нам нужен доступ к topSectionBottomShelfMesh из Блока 7
    //let topSectionBottomShelfMesh_from_Block7 = null;
    let tsbs_Thickness_from_Block7 = panelThicknessM; // Дефолт, если полка не найдена
    let tsbs_Depth_from_Block7 = cabDepthM - 0.060 - panelThicknessM;   // Дефолт, если полка не найдена
   

    if (!topSectionBottomShelfMesh) {
        console.error("  [TallOvenMicro] Блок 9: Ошибка - дно верхней секции (topSectionBottomShelfMesh) не найдено! Задняя стенка не будет создана.");
    } else {
        // --- 9.1 Расчет размеров задней стенки ---
        // Ширина такая же, как у дна верхней секции
        const rpots_Width = topSectionBottomShelfMesh.geometry.parameters.width; // rpots = Rear Panel Of Top Section
        
        // Высота: от низа дна верхней секции до верха шкафа, минус 1мм
        const bottom_of_tsbs_Y_Global = topSectionBottomShelfMesh.position.y - (tsbs_Thickness_from_Block7 / 2);
        const top_of_cabinet_Y_Global = cabHeightM / 2;
        const rpots_Height = top_of_cabinet_Y_Global - bottom_of_tsbs_Y_Global - 0.001;

        const rpots_Thickness = panelThicknessM; // Толщина задней стенки (это будет "глубина" для createPanel frontal)

        console.log(`    Задняя стенка в/с: W=${rpots_Width.toFixed(3)}, H=${rpots_Height.toFixed(3)}, Thickness(глубина)=${rpots_Thickness.toFixed(3)}`);

        if (rpots_Width <= 0 || rpots_Height <= 0 || rpots_Thickness <= 0) {
            console.error("  [TallOvenMicro] Блок 9: Некорректные размеры для создания задней стенки верхней секции.");
        } else {
            // --- 9.2 Расчет Y-координаты ЦЕНТРА задней стенки ---
            // Низ задней стенки на уровне низа дна верхней секции
            const rpots_CenterY_Global = bottom_of_tsbs_Y_Global + rpots_Height / 2;
            console.log(`    Задняя стенка в/с: Y-центр = ${bottom_of_tsbs_Y_Global.toFixed(3)} (низ дна в/с) + ${rpots_Height.toFixed(3)}/2 = ${rpots_CenterY_Global.toFixed(3)}м`);

            // --- 9.3 Расчет Z-координаты ЦЕНТРА задней стенки ---
            // Передняя грань задней стенки совпадает с задней гранью дна верхней секции
            const rear_face_of_tsbs_Z_Global = topSectionBottomShelfMesh.position.z - (tsbs_Depth_from_Block7 / 2);
            // Центр задней стенки по Z
            const rpots_CenterZ_Global = rear_face_of_tsbs_Z_Global - rpots_Thickness / 2;
            console.log(`    Задняя стенка в/с: Z-центр = ${rear_face_of_tsbs_Z_Global.toFixed(3)} (зад дна в/с) + ${rpots_Thickness.toFixed(3)}/2 = ${rpots_CenterZ_Global.toFixed(3)}м`);

            // --- 9.4 Создание меша задней стенки ---
            const rearPanelTopSectionMesh = createPanel(
                rpots_Width,
                rpots_Height,
                rpots_Thickness, // Толщина задней стенки (будет глубиной для createPanel с 'frontal')
                cabinetMaterial, // Используем материал корпуса (или специальный материал для задних стенок)
                'frontal',       // Ориентация толщины по Z
                `rear_panel_top_section_${cabinetUUID.substring(0,4)}`
            );

            if (rearPanelTopSectionMesh) {
                rearPanelTopSectionMesh.position.set(0, rpots_CenterY_Global, rpots_CenterZ_Global); // X=0 (центр шкафа)
                rearPanelTopSectionMesh.userData.cabinetUUID = cabinetUUID;
                rearPanelTopSectionMesh.userData.panelType = 'rearPanelTopSection';
                group.add(rearPanelTopSectionMesh);
                console.log(`    Задняя стенка верхней секции создана. Pos: X=0, Y=${rpots_CenterY_Global.toFixed(3)}, Z=${rpots_CenterZ_Global.toFixed(3)}`);
            } else {
                console.error("  [TallOvenMicro] Блок 9: Не удалось создать меш задней стенки верхней секции.");
            }
        }
    }
    // --- КОНЕЦ БЛОКА 9: ЗАДНЯЯ СТЕНКА ВЕРХНЕЙ СЕКЦИИ ---
    // --- НАЧАЛО БЛОКА 10: ВЕРХНИЕ ПОЛКИ (НАД topSectionBottomShelfMesh, ПОД КРЫШЕЙ ШКАФА) ---
    console.log(`  [TallOvenMicro] Блок 9: Создание ВЕРХНИХ ПОЛОК...`);

    // Убедимся, что topSectionBottomShelfMesh существует и имеет геометрию
    if (!topSectionBottomShelfMesh || !topSectionBottomShelfMesh.geometry || !topSectionBottomShelfMesh.geometry.parameters) {
        console.warn("    [TallOvenMicro][Блок 9] topSectionBottomShelfMesh не определена или не имеет корректной геометрии. Верхние полки не будут созданы.");
    } else {
        const topShelvesCount = parseInt(cabinetData.topShelves) || 0; // 'none' или не число станет 0

        if (topShelvesCount > 0) {
            // --- 10.1 Расчет размеров одной полки ---
            const shelfWidth = cabWidthM - 2 * panelThicknessM - 0.002; // -2мм зазор
            const shelfThickness = panelThicknessM; // Толщина полки (это будет высота для createPanel)
            
            // Глубина полки = глубина опорной нижней полки секции минус 5мм
            // Используем параметры геометрии опорной полки
            const supportShelfDepth = topSectionBottomShelfMesh.geometry.parameters.depth;
            const shelfDepth = supportShelfDepth - 0.005;

            console.log(`    [Блок 9] Верхние полки: Кол-во=${topShelvesCount}, W=${shelfWidth.toFixed(3)}, H(толщина)=${shelfThickness.toFixed(3)}, D=${shelfDepth.toFixed(3)}`);

            if (shelfWidth <= 0 || shelfDepth <= 0) {
                console.warn("      [Блок 9] Некорректные размеры для верхних полок (ширина или глубина <= 0). Полки не будут созданы.");
            } else {
                // --- 10.2 Расчет позиций по Y ---
                const cabinetTopGlobalY = cabHeightM / 2; // Верхняя точка всего шкафа-пенала в локальных координатах группы
                
                // Y-координата ВЕРХНЕЙ плоскости опорной полки (topSectionBottomShelfMesh)
                const supportShelfThickness = topSectionBottomShelfMesh.geometry.parameters.height; // Предполагаем, что .height - это толщина
                const topEdgeOfSupportShelfY = topSectionBottomShelfMesh.position.y + supportShelfThickness / 2;

                // Доступная высота для размещения полок: от верха опорной полки до НИЗА КРЫШИ шкафа.
                // Предполагаем, что крыша шкафа (еще не создана в этом коде) будет иметь толщину panelThicknessM.
                const availableHeightForShelves = cabinetTopGlobalY - panelThicknessM - topEdgeOfSupportShelfY;
                console.log(`      [Блок 9] Доступная высота под полки (между опорной и крышей): ${availableHeightForShelves.toFixed(3)}м`);

                // Проверка, достаточно ли места для полок и минимальных зазоров
                // (topShelvesCount * shelfThickness) - общая высота самих полок
                // ((topShelvesCount - 1) * 0.010) - минимальные зазоры МЕЖДУ полками (если полок > 1)
                // (2 * 0.005) - минимальные зазоры над/под крайними полками (по 5мм)
                const minRequiredHeight = (topShelvesCount * shelfThickness) + 
                                        (topShelvesCount > 1 ? (topShelvesCount - 1) * 0.010 : 0) + 
                                        (2 * 0.005);

                if (availableHeightForShelves < minRequiredHeight) {
                    console.warn(`      [Блок 9] Недостаточно доступной высоты (${availableHeightForShelves.toFixed(3)}м) для ${topShelvesCount} полок (требуется мин ${minRequiredHeight.toFixed(3)}м). Полки не будут созданы.`);
                } else {
                    // Расстояние между ЦЕНТРАМИ соседних полок, или между опорной/крышей и центром ближайшей полки
                    const shelfSpacingY_raw = availableHeightForShelves / (topShelvesCount + 1);
                    const shelfSpacingY_mm = Math.round(shelfSpacingY_raw * 1000);
                    const shelfSpacingY = shelfSpacingY_mm / 1000;
                    console.log(`      [Блок 9] Шаг расположения полок (shelfSpacingY): ${shelfSpacingY.toFixed(3)}м (${shelfSpacingY_mm}мм)`);

                    // --- 9.3 Создание полок в цикле ---
                    for (let i = 1; i <= topShelvesCount; i++) {
                        const shelfName = `top_shelf_${i}_tall_oven_micro_${cabinetUUID.substring(0,4)}`;
                        const topShelfMesh = createPanel(
                            shelfWidth,
                            shelfThickness, // высота для createPanel - это толщина полки
                            shelfDepth,
                            cabinetMaterial, // Используем общий материал корпуса
                            'horizontal',    // Ориентация толщины по Y
                            shelfName
                        );

                        if (topShelfMesh) {
                            // Позиционирование
                            const shelfCenterX = 0; // По центру ширины шкафа

                            // Y-координата НИЖНЕЙ плоскости i-й полки, отсчитывая от ВЕРХА опорной полки
                            const bottomPlaneOfCurrentShelfY = topEdgeOfSupportShelfY + (shelfSpacingY * i);
                            // Y-координата ЦЕНТРА i-й полки
                            const shelfCenterY_i = bottomPlaneOfCurrentShelfY - (shelfSpacingY / 2) + (shelfThickness / 2); // Скорректировано для центрирования в своем "слоте"
                                                                                                    // Проще: низ опорной + шаг*i + толщина/2
                            // Пересчет shelfCenterY_i по вашей формуле:
                            // расположение первой полки по Y = topSectionBottomShelfMesh.верхняя грань + шагРасположенияПолок * 1; (это низ полки)
                            // shelfCenterY_i = (topEdgeOfSupportShelfY + shelfSpacingY * i) + shelfThickness / 2;
                            const currentShelfBottomY = topEdgeOfSupportShelfY + shelfSpacingY * i;
                            const currentShelfCenterY = currentShelfBottomY + shelfThickness / 2;


                            // Z-координата ЗАДНЕЙ плоскости i-й полки = задняя плоскость опорной полки
                            const rearFaceZ_SupportShelf = topSectionBottomShelfMesh.position.z - supportShelfDepth / 2;
                            // Z-координата ЦЕНТРА i-й полки
                            const shelfCenterZ_i = rearFaceZ_SupportShelf + shelfDepth / 2;

                            topShelfMesh.position.set(shelfCenterX, currentShelfCenterY, shelfCenterZ_i);
                            topShelfMesh.userData.cabinetUUID = cabinetUUID;
                            group.add(topShelfMesh);
                            console.log(`        [Блок 9] Верхняя полка ${i} создана. Pos: Y=${currentShelfCenterY.toFixed(3)}, Z=${shelfCenterZ_i.toFixed(3)}`);
                        }
                    }
                }
            }
        } else {
            console.log(`    [Блок 9] Верхние полки не требуются (кол-во: ${topShelvesCount}).`);
        }
    }
    // --- КОНЕЦ БЛОКА 10: ВЕРХНИЕ ПОЛКИ ---
    // --- НАЧАЛО БЛОКА 11: ФАСАДЫ ПОД ДУХОВКОЙ ---
    const underOvenFill = cabinetData.underOvenFill || 'drawers';
    const facadeGapMeters = cabinetData.facadeGap / 1 || 0.003;
    // 1. Получение материала и толщины фасада
    const textureDirection = cabinetData.textureDirection || 'vertical';

    // 2. Базовая высота для секции под духовкой (эквивалент высоты фасадов стандартного нижнего короба)
    const baseSectionHeightM = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;

    const tb9HandleHeightMeters = 0.030;
    let facadesToCreateData = []; // { yPosBottom: number, height: number, width: number, addTB9Handle: boolean, namePrefix: string }

    // 3. Определение количества, высот и Y-позиций фасадов
    const facadeWidth = cabWidthM - facadeGapMeters; // Ширина фасада (один общий зазор по бокам шкафа)
    let addTB9Global = (handleType === 'aluminum-tv9');

    if (ovenLevel === 'drawer') {
        // --- Сценарий 1: Духовка на уровне первого ящика (снизу ОДИН фасад) ---
        // Высота этого одного фасада = высота одного фасада стандартного нижнего ящика
        // (если в baseSectionHeightM помещается два ящика и два Гола/ручки/зазора)
        let currentFacadeHeight = 0;
        if (handleType === 'standard') {
            currentFacadeHeight = (baseSectionHeightM - 2 * facadeGapMeters) / 2; // Высота одного из двух фасадов
        } else if (handleType === 'gola-profile') {
            currentFacadeHeight = (baseSectionHeightM - 2 * actualGolaHeightMeters) / 2;
        } else if (handleType === 'aluminum-tv9') {
            currentFacadeHeight = (baseSectionHeightM - 2 * tb9HandleHeightMeters - 2 * facadeGapMeters) / 2;
        }
        
        if (currentFacadeHeight < 0.05) { // Минимальная высота фасада
            console.warn(`      [Блок 11 / Сценарий 1] Расчетная высота фасада (${currentFacadeHeight.toFixed(3)}м) слишком мала. Установлена мин. 0.05м.`);
            currentFacadeHeight = 0.05;
        }

        const yPosBottomFacade = -cabHeightM / 2; // Низ фасада = низ пенала
        facadesToCreateData.push({
            yPosBottom: yPosBottomFacade,
            height: currentFacadeHeight,
            width: facadeWidth,
            addTB9Handle: addTB9Global,
            namePrefix: "bottom_single_facade"
        });

    } else if (ovenLevel === 'countertop') {
        // --- Сценарий 2: Духовка на уровне столешницы ---
        if (underOvenFill === 'drawers') {
            // --- Сценарий 2а: Под духовкой выдвижные ящики (ДВА фасада) ---
            let facadeHeightEach = 0;
            if (handleType === 'standard') {
                facadeHeightEach = (baseSectionHeightM - 2 * facadeGapMeters) / 2;
            } else if (handleType === 'gola-profile') {
                facadeHeightEach = (baseSectionHeightM - 2 * actualGolaHeightMeters) / 2;
            } else if (handleType === 'aluminum-tv9') {
                facadeHeightEach = (baseSectionHeightM - 2 * tb9HandleHeightMeters - 2 * facadeGapMeters) / 2;
            }

            if (facadeHeightEach < 0.05) {
                console.warn(`      [Блок 11 / Сценарий 2а] Расчетная высота фасада ящика (${facadeHeightEach.toFixed(3)}м) слишком мала. Установлена мин. 0.05м.`);
                facadeHeightEach = 0.05;
            }
            
            // Нижний фасад
            const yPosBottomLower = -cabHeightM / 2;
            facadesToCreateData.push({
                yPosBottom: yPosBottomLower,
                height: facadeHeightEach,
                width: facadeWidth,
                addTB9Handle: addTB9Global,
                namePrefix: "bottom_drawer_facade_1"
            });

            // Верхний фасад
            const yTopOfLowerFacade = yPosBottomLower + facadeHeightEach;
            let gapOrHandleAboveLower = 0;
            if (handleType === 'standard') gapOrHandleAboveLower = facadeGapMeters;
            else if (handleType === 'gola-profile') gapOrHandleAboveLower = actualGolaHeightMeters;
            else if (handleType === 'aluminum-tv9') gapOrHandleAboveLower = tb9HandleHeightMeters + facadeGapMeters;
            
            const yPosBottomUpper = yTopOfLowerFacade + gapOrHandleAboveLower;
            facadesToCreateData.push({
                yPosBottom: yPosBottomUpper,
                height: facadeHeightEach, // Второй фасад той же высоты
                width: facadeWidth,
                addTB9Handle: addTB9Global,
                namePrefix: "bottom_drawer_facade_2"
            });

        } else if (underOvenFill === 'swing') {
            // --- Сценарий 2б: Под духовкой распашная дверь (ОДИН фасад) ---
            let swingFacadeHeight = 0;
            if (handleType === 'standard') {
                swingFacadeHeight = baseSectionHeightM - facadeGapMeters; // Зазор сверху
            } else if (handleType === 'gola-profile') {
                swingFacadeHeight = baseSectionHeightM - actualGolaHeightMeters; // Гола сверху
            } else if (handleType === 'aluminum-tv9') {
                swingFacadeHeight = baseSectionHeightM - facadeGapMeters - tb9HandleHeightMeters; // ТВ9 сверху + зазор
            }

            if (swingFacadeHeight < 0.05) {
                console.warn(`      [Блок 11 / Сценарий 2б] Расчетная высота распашного фасада (${swingFacadeHeight.toFixed(3)}м) слишком мала. Установлена мин. 0.05м.`);
                swingFacadeHeight = 0.05;
            }

            const yPosBottomFacade = -cabHeightM / 2;
            facadesToCreateData.push({
                yPosBottom: yPosBottomFacade,
                height: swingFacadeHeight,
                width: facadeWidth,
                addTB9Handle: addTB9Global,
                namePrefix: "bottom_swing_facade"
            });
        }
    }

    // 4. Создание мешей фасадов
    if (facadesToCreateData.length > 0) {
        
        // === А. Определение стратегии (Один раз для всех фасадов) ===
        const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
        const { material: baseFacadeMaterial, thickness: baseTh } = MaterialManager.getMaterial(facadeSet);
        
        let buildStrategy = 'flat';
        let profileData = null;
        let finalMaterial = baseFacadeMaterial;
        let finalThickness = baseTh;

        if (cabinetData.facadeOverride?.startsWith('aluminum')) {
            buildStrategy = 'aluminum';
        } else if (window.facadeOptionsData['mdf_milled']) {
             const decor = window.facadeOptionsData['mdf_milled'].decors.find(d => d.value === facadeSet?.texture);
             if (decor && decor.profileType === '9slice') {
                 buildStrategy = 'milled';
                 profileData = decor;
                 // Обновление толщины для фрезеровки
                 const lodData = decor.lod?.full || decor.lod?.simple || decor.models;
                 const modelThickMm = lodData.edgeThickness || 19;
                 finalThickness = modelThickMm / 1000;
             }
        }
        // ============================================================

        facadesToCreateData.forEach((facadeData, index) => {
            if (facadeData.height <= 0 || facadeData.width <= 0) return;

            // Создаем контейнер
            const container = new THREE.Group();
            container.userData.cabinetUUID = cabinetUUID;
            container.userData.isFacade = true;
            
            // Позиционирование контейнера
            // Y: Центр фасада. Z: Передняя грань корпуса + половина толщины.
            const facadeCenterY = facadeData.yPosBottom + facadeData.height / 2;
            const facadeCenterZ = cabDepthM / 2 + finalThickness / 2;
            container.position.set(0, facadeCenterY, facadeCenterZ); // X=0 (центр)
            group.add(container);

            if (buildStrategy === 'milled') {
                // === ВАРИАНТ 1: ФРЕЗЕРОВКА ===
                // Передаем правильные размеры (width, height)
                createMilledFacade(facadeData.width, facadeData.height, profileData, finalMaterial.clone())
                    .then(mesh => {
                        container.add(mesh);
                        mesh.updateMatrixWorld();
                    });
            
            } else if (buildStrategy === 'aluminum') {
                // === ВАРИАНТ 2: АЛЮМИНИЙ ===
                // if (window.createZ1FrameFacade) { ... }

            } else {
                // === ВАРИАНТ 3: ПЛОСКИЙ (Старый код, но внутри контейнера) ===
                const facadeMesh = createPanel(
                    facadeData.width,
                    facadeData.height,
                    finalThickness,
                    finalMaterial.clone(), 
                    'frontal',
                    `${facadeData.namePrefix}_${index}`
                );

                if (facadeMesh) {
                    // Применение текстуры
                    if (facadeMesh.material.map) {
                        MaterialManager.applyTextureTransform(
                            facadeMesh.material,
                            cabinetData.textureDirection || 'vertical',
                            facadeData.width,
                            facadeData.height
                        );
                    }
                    // Меш внутри контейнера (0,0,0)
                    container.add(facadeMesh);

                    // === РУЧКА TB9 (Только для плоских) ===
                    if (facadeData.addTB9Handle) {
                        const handleLen = facadeData.width;
                        // ... (Код создания шейпа ручки без изменений) ...
                        const tb9ProfileWidthMm = 19;
                        const tb9ProfileHeightMm = 30;
                        const handleShape_tv9 = new THREE.Shape();
                        handleShape_tv9.moveTo(0, 0);
                        handleShape_tv9.lineTo(tb9ProfileWidthMm, 0);
                        handleShape_tv9.lineTo(tb9ProfileWidthMm, tb9ProfileHeightMm);
                        handleShape_tv9.lineTo(tb9ProfileWidthMm - 1.5, tb9ProfileHeightMm);
                        handleShape_tv9.lineTo(tb9ProfileWidthMm - 1.5, 1);
                        handleShape_tv9.lineTo(0, 1);
                        handleShape_tv9.closePath();

                        const hExtrude = { steps: 1, depth: handleLen * 1000, bevelEnabled: false };
                        const hMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(handleShape_tv9, hExtrude), golaMaterial.clone());
                        
                        // Трансформации для ручки внутри контейнера
                        hMesh.geometry.translate(0, 0, -handleLen * 1000 / 2); // Центрируем по длине
                        hMesh.geometry.scale(0.001, 0.001, 0.001);
                        
                        hMesh.rotation.y = Math.PI / 2;

                        // Позиция: Y=верх фасада. Z=перед фасада.
                        // Внутри контейнера: Y = +height/2. Z = +thickness/2.
                        hMesh.position.set(0, facadeData.height / 2, tb9ProfileWidthMm / 1000 - finalThickness / 2); 
                        // Возможно Z нужно скорректировать (на ширину профиля ручки), как у тебя было:
                        // hMesh.position.z = finalThickness / 2; // задняя грань ручки касается переда фасада
                        
                        container.add(hMesh);
                    }
                }
            }
        });
    } else {
        console.log(`    [Блок 11] Фасады под духовкой не создаются согласно конфигурации.`);
    }
    // --- КОНЕЦ БЛОКА 11: ФАСАДЫ ПОД ДУХОВКОЙ ---
    // --- НАЧАЛО БЛОКА 12: ВЕРХНИЙ ФАСАД (НАД СВЧ/ДУХОВКОЙ) ---

    if (!topSectionBottomShelfMesh || !topSectionBottomShelfMesh.geometry || !topSectionBottomShelfMesh.geometry.parameters) {
        console.warn("    [TallOvenMicro][Блок 12] Дно верхней секции (topSectionBottomShelfMesh) не найдено. Верхний фасад не будет создан.");
    } else {
        // 1. Параметры для верхнего фасада
        const topFacadeWidth = cabWidthM - facadeGapMeters; // Ширина фасада (один общий зазор по бокам шкафа, т.к. фасад один)
                                                            // Если бы было 2 фасада, то cabWidthM - 2 * facadeGapMeters
        //const gapAboveTopFacadeM = (cabinetData.gapAboveTopFacadeMm || 3) / 1000; // Зазор над этим фасадом (из настроек)
        // --- ИСПРАВЛЕНИЕ ДЛЯ gapAboveFacadeM ---
        let gapAboveUserValueMm = cabinetData.gapAboveTopFacadeMm;
        if (typeof gapAboveUserValueMm !== 'number' || isNaN(gapAboveUserValueMm)) {
            gapAboveUserValueMm = 3; // Если не число или undefined, ставим дефолт 3 мм
        }
        const gapAboveTopFacadeM = gapAboveUserValueMm / 1000; // Теперь 0 останется 0, а undefined станет 0.003
        // --- КОНЕЦ ИСПРАВЛЕНИЯ ---
        const fixedOverlapLowerM = 0.007; // 7 мм - фиксированный параметр "наезда" или смещения
        const tb9HandleHeightM = 0.030;   // 30 мм - высота ручки ТВ9

        // 2. Расчет ВЫСОТЫ верхнего фасада (topFacadeHeight)
        // Y-координата ВЕРХНЕЙ плоскости шкафа (под крышей, если она есть)
        const y_top_structure_line = cabHeightM / 2; // Предполагаем, что крыша толщиной panelThicknessM будет НАД этой линией

        // Y-координата ВЕРХНЕЙ плоскости дна верхней секции (topSectionBottomShelfMesh)
        const tsbs_Thickness_B12 = topSectionBottomShelfMesh.geometry.parameters.height; // Толщина этой полки
        const y_top_of_tsbs = topSectionBottomShelfMesh.position.y + tsbs_Thickness_B12 / 2;

        let topFacadeHeight;
        if (handleType === 'aluminum-tv9') {
            topFacadeHeight = (y_top_structure_line - gapAboveTopFacadeM - y_top_of_tsbs - tb9HandleHeightM) + fixedOverlapLowerM;
        } else { // standard или gola-profile
            topFacadeHeight = (y_top_structure_line - gapAboveTopFacadeM - y_top_of_tsbs) + fixedOverlapLowerM;
        }

        if (handleType === 'aluminum-tv9') console.log(`      tb9HandleHeightM=${tb9HandleHeightM.toFixed(3)}`);

        if (topFacadeWidth > 0.01 && topFacadeHeight > 0.05) { // Минимальные размеры
             // 1. Стратегия (повторяем или выносим в начало функции)
            const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
            const { material: baseFacadeMaterial, thickness: baseTh } = MaterialManager.getMaterial(facadeSet);
            let buildStrategy = 'flat';
            let profileData = null;
            let finalMaterial = baseFacadeMaterial;
            let finalThickness = baseTh;

            if (cabinetData.facadeOverride?.startsWith('aluminum')) buildStrategy = 'aluminum';
            else if (window.facadeOptionsData['mdf_milled']) {
                const decor = window.facadeOptionsData['mdf_milled'].decors.find(d => d.value === facadeSet?.texture);
                if (decor && decor.profileType === '9slice') {
                    buildStrategy = 'milled';
                    profileData = decor;
                    finalThickness = (decor.lod?.full?.edgeThickness || 19) / 1000;
                }
            }

            // 3. Создание контейнера
            const container = new THREE.Group();
            
            // 4. Расчет Y-позиции ЦЕНТРА (твой код)
            let y_bottom_plane_of_top_facade;
            if (handleType === 'aluminum-tv9') {
                y_bottom_plane_of_top_facade = y_top_of_tsbs + (tb9HandleHeightM - fixedOverlapLowerM);
            } else {
                y_bottom_plane_of_top_facade = y_top_of_tsbs - fixedOverlapLowerM;
            }
            const topFacadeCenterY = y_bottom_plane_of_top_facade + topFacadeHeight / 2;

            // Позиционирование контейнера
            container.position.x = 0;
            container.position.y = topFacadeCenterY;
            container.position.z = cabDepthM / 2 + finalThickness / 2; // Используем finalThickness
            
            container.userData.cabinetUUID = cabinetUUID;
            group.add(container);

        // 5. Наполнение
        if (buildStrategy === 'milled') {
             createMilledFacade(topFacadeWidth, topFacadeHeight, profileData, finalMaterial.clone())
                .then(mesh => container.add(mesh));

        } else if (buildStrategy === 'aluminum') {
             // ...
        } else {
             // === ПЛОСКИЙ ===
             const topFacadeMesh = createPanel(
                topFacadeWidth, topFacadeHeight, finalThickness,
                finalMaterial.clone(), 'frontal', `top_facade`
             );
             
             if (topFacadeMesh) {
                 if (topFacadeMesh.material.map) {
                    MaterialManager.applyTextureTransform(topFacadeMesh.material, cabinetData.textureDirection || 'vertical', topFacadeWidth, topFacadeHeight);
                 }
                 container.add(topFacadeMesh);
                 
                 // === РУЧКА TB9 ===
                 if (handleType === 'aluminum-tv9') {
                     // Твой код ручки для верха
                     // Внимание: Ручка на верхнем фасаде ТВ9 ставится СНИЗУ фасада.
                     // В твоем старом коде: handleMesh_top_tv9.rotation.x = Math.PI; (перевернута)
                     // И Y = y_bottom_plane_of_facade.
                     
                     // В контейнере: Низ фасада = -topFacadeHeight/2.
                     
                     const handleLen = topFacadeWidth;
                     const tb9ProfileWidthMm = 19;
                    const tb9ProfileHeightMm = 30;
                     // ... (создание шейпа и экструзии как раньше) ...
                     const hShape = new THREE.Shape(); // ... (копируй шейп)
                    hShape.moveTo(0, 0);
                    hShape.lineTo(tb9ProfileWidthMm, 0);
                    hShape.lineTo(tb9ProfileWidthMm, tb9ProfileHeightMm);
                    hShape.lineTo(tb9ProfileWidthMm - 1.5, tb9ProfileHeightMm);
                    hShape.lineTo(tb9ProfileWidthMm - 1.5, 1);
                    hShape.lineTo(0, 1);
                    hShape.closePath();
                     // ...
                     const hExtrude = { depth: handleLen * 1000, steps: 1, bevelEnabled: false };
                     const hMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(hShape, hExtrude), golaMaterial.clone());
                     
                     hMesh.geometry.translate(0, 0, -handleLen * 1000 / 2);
                     hMesh.geometry.scale(0.001, 0.001, 0.001);

                     hMesh.rotation.y = -Math.PI / 2; 
                     hMesh.rotation.x = Math.PI; // Вверх ногами

                     // Позиция: СНИЗУ
                     hMesh.position.set(0, -topFacadeHeight / 2, tb9ProfileWidthMm / 1000 - finalThickness / 2); 
                     // Z: +0.019 (смещение вперед, как у тебя было)
                     
                     container.add(hMesh);
                 }
             }
        }
        } else {
            console.warn(`    [Блок 12] Верхний фасад не создан (ширина или высота некорректны).`);
        }
    }
    // --- КОНЕЦ БЛОКА 12: ВЕРХНИЙ ФАСАД ---
    // --- НАЧАЛО БЛОКА 13: УСТАНОВКА МОДЕЛИ ДУХОВКИ ---
    console.log(`  [TallOvenMicro] Блок 13: Установка МОДЕЛИ ДУХОВКИ...`);

    const ovenTypeSetting = cabinetData.ovenType || '600'; // Дефолт, если не задано
    const ovenColorSetting = cabinetData.ovenColor || 'metallic';

    if (ovenTypeSetting === 'none') {
        console.log("      [Блок 13] Духовка не выбрана (ovenType === 'none'). Модель не будет добавлена.");
    } else if (!ovenSupportShelfMesh || !ovenSupportShelfMesh.geometry || !ovenSupportShelfMesh.geometry.parameters) {
        console.warn("      [Блок 13] Полка для духовки (ovenSupportShelfMesh) не найдена или некорректна. Модель духовки не будет добавлена.");
    } else {
        const ovenModelFileName = `oven_${ovenTypeSetting}.glb`;
        const ovenModel = window.getPreloadedModelClone(ovenModelFileName);

        if (ovenModel) {
            console.log(`      [Блок 13] Модель духовки ${ovenModelFileName} получена из кэша.`);
            ovenModel.name = `oven_model_${ovenTypeSetting}_tall_${cabinetUUID.substring(0,4)}`;
            ovenModel.userData = {
                isCabinetPart: true,
                objectType: 'appliance_oven',
                cabinetUUID: cabinetUUID
            };

            // --- Создание и применение материала духовки ---
            let ovenMaterialInstance; // Переименовал, чтобы не конфликтовать с cabinetMaterial
            switch (ovenColorSetting) {
                case 'black':
                    ovenMaterialInstance = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.0, roughness: 0.05, name: "OvenBlackMat_Tall" });
                    break;
                case 'white':
                    ovenMaterialInstance = new THREE.MeshStandardMaterial({ color: 0xE5E5E5, metalness: 0.0, roughness: 0.05, name: "OvenWhiteMat_Tall" });
                    break;
                case 'metallic':
                default:
                    ovenMaterialInstance = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1.0, roughness: 0.4, name: "OvenMetallicMat_Tall" });
                    break;
            }
            ovenModel.traverse((child) => {
                if (child.isMesh) {
                    if (child.material) {
                        if (Array.isArray(child.material)) child.material.forEach(mat => mat.dispose());
                        else child.material.dispose();
                    }
                    child.material = ovenMaterialInstance; // Присваиваем один инстанс материала всем частям
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            //console.log(`        Материал духовки установлен: ${ovenColorSetting}`);

            // --- Позиционирование модели духовки ---
            // Y-координата НИЗА духовки = верхняя плоскость ovenSupportShelfMesh
            const supportShelfThickness = ovenSupportShelfMesh.geometry.parameters.height;
            const ovenBottomSurfaceY_Global = ovenSupportShelfMesh.position.y + supportShelfThickness / 2;
            
            // Предполагаем, что локальный Y=0 модели духовки - это ее низ.
            const targetOvenOriginY = ovenBottomSurfaceY_Global;
            const targetOvenOriginX = 0; // По центру шкафа
            // Z-координата: передняя плоскость модели духовки (ее локальный Z=0)
            // выровнена по передней плоскости корпуса шкафа.
            const targetOvenOriginZ = cabDepthM / 2; 

            ovenModel.position.set(targetOvenOriginX, targetOvenOriginY, targetOvenOriginZ);
            ovenModel.scale.set(1, 1, 1); // Предполагаем, что модель уже в метрах
            // ovenModel.rotation.set(0, 0, 0); // Если нужно сбросить вращение модели

            group.add(ovenModel);
            //console.log(`        Модель духовки ${ovenModelFileName} добавлена. Pos: Y_низ=${targetOvenOriginY.toFixed(3)}, Z_перед=${targetOvenOriginZ.toFixed(3)}`);

        } else {
            console.error(`      [Блок 13] Модель духовки ${ovenModelFileName} НЕ НАЙДЕНА в кэше! Будет создана заглушка.`);
            // Создаем красную заглушку (как в createDetailedOvenCabinetGeometry)
            const ovenActualHeightForPlaceholder = parseFloat(ovenTypeSetting) / 1000 || 0.595;
            const placeholderWidth = cabWidthM * 0.8;
            const placeholderHeight = ovenActualHeightForPlaceholder * 0.95;
            const placeholderDepth = cabDepthM * 0.7;
            
            const placeholderGeo = new THREE.BoxGeometry(placeholderWidth, placeholderHeight, placeholderDepth);
            const placeholderMat = new THREE.MeshBasicMaterial({color: 0xff0000, wireframe: false, name: "OvenErrorPlaceholderMat_Tall"});
            const errorPlaceholder = new THREE.Mesh(placeholderGeo, placeholderMat);
            errorPlaceholder.name = `OVEN_ERROR_PLACEHOLDER_TALL_${ovenTypeSetting}`;

            const supportShelfThickness = ovenSupportShelfMesh.geometry.parameters.height;
            const ovenBottomSurfaceY_Global = ovenSupportShelfMesh.position.y + supportShelfThickness / 2;
            
            const placeholderCenterX = 0;
            const placeholderCenterY = ovenBottomSurfaceY_Global + placeholderHeight / 2; // Центр заглушки по высоте
            const placeholderCenterZ = cabDepthM / 2 - placeholderDepth / 2; // Центр заглушки по глубине
            
            errorPlaceholder.position.set(placeholderCenterX, placeholderCenterY, placeholderCenterZ);
            group.add(errorPlaceholder);
        }
    }
    // --- КОНЕЦ БЛОКА 13: УСТАНОВКА МОДЕЛИ ДУХОВКИ ---
    // --- НАЧАЛО БЛОКА 14: УСТАНОВКА МОДЕЛИ МИКРОВОЛНОВКИ ---
    //console.log(`  [TallOvenMicro] Блок 14: Установка МОДЕЛИ МИКРОВОЛНОВКИ...`);

    const microwaveTypeSetting = cabinetData.microwaveType || 'none'; // '362', '380', 'none'
    // Цвет микроволновки берем тот же, что и для духовки (из cabinetData.ovenColor)
    const applianceColorSetting = cabinetData.ovenColor || 'metallic'; // Используем общее или ovenColor

    // microShelfMesh должен был быть создан в Блоке 6
    if (microwaveTypeSetting === 'none') {
        console.log("      [Блок 14] Микроволновка не выбрана (microwaveType === 'none'). Модель не будет добавлена.");
    } else if (!microShelfMesh || !microShelfMesh.geometry || !microShelfMesh.geometry.parameters) {
        console.warn("      [Блок 14] Полка для СВЧ (microShelfMesh) не найдена или некорректна. Модель СВЧ не будет добавлена.");
    } else {
        let microwaveModelFileName = '';
        if (microwaveTypeSetting === '362') {
            microwaveModelFileName = 'mkw_362.glb';
        } else if (microwaveTypeSetting === '380') {
            // Если у вас есть модель для 380мм, укажите ее имя здесь.
            // Пока будем использовать ту же модель, что и для 362, или заглушку.
            console.warn(`      [Блок 14] Модель для микроволновки типа '380' не указана, будет использована 'mkw_362.glb' или заглушка.`);
            microwaveModelFileName = 'mkw_362.glb'; // ЗАГЛУШКА - используем 362, пока нет другой
        } else {
            console.warn(`      [Блок 14] Неизвестный тип микроволновки: ${microwaveTypeSetting}. Модель не будет добавлена.`);
        }

        if (microwaveModelFileName) {
            const microwaveModel = window.getPreloadedModelClone(microwaveModelFileName);

            if (microwaveModel) {
                console.log(`      [Блок 14] Модель СВЧ ${microwaveModelFileName} получена из кэша.`);
                microwaveModel.name = `microwave_model_${microwaveTypeSetting}_tall_${cabinetUUID.substring(0,4)}`;
                microwaveModel.userData = {
                    isCabinetPart: true,
                    objectType: 'appliance_microwave',
                    cabinetUUID: cabinetUUID
                };

                // --- Создание и применение материала СВЧ (используем ту же логику, что и для духовки) ---
                let microwaveMaterialInstance;
                switch (applianceColorSetting) { // Используем applianceColorSetting
                    case 'black':
                        microwaveMaterialInstance = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.0, roughness: 0.05, name: "MicrowaveBlackMat_Tall" });
                        break;
                    case 'white':
                        microwaveMaterialInstance = new THREE.MeshStandardMaterial({ color: 0xE5E5E5, metalness: 0.0, roughness: 0.05, name: "MicrowaveWhiteMat_Tall" });
                        break;
                    case 'metallic':
                    default:
                        microwaveMaterialInstance = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1.0, roughness: 0.4, name: "MicrowaveMetallicMat_Tall" });
                        break;
                }
                
                microwaveModel.traverse((child) => {
                    if (child.isMesh) {
                        if (child.material) {
                            if (Array.isArray(child.material)) child.material.forEach(mat => mat.dispose());
                            else child.material.dispose();
                        }
                        child.material = microwaveMaterialInstance;
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                //console.log(`        Материал СВЧ установлен: ${applianceColorSetting}`);

                // --- Позиционирование модели СВЧ ---
                // Y-координата НИЗА СВЧ = верхняя плоскость microShelfMesh
                const microShelfThickness = microShelfMesh.geometry.parameters.height;
                const microwaveBottomSurfaceY_Global = microShelfMesh.position.y + microShelfThickness / 2;
                
                const targetMicrowaveOriginY = microwaveBottomSurfaceY_Global;
                const targetMicrowaveOriginX = 0; // По центру шкафа
                // Z-координата: передняя плоскость модели СВЧ (ее локальный Z=0)
                // выровнена по передней плоскости корпуса шкафа.
                const targetMicrowaveOriginZ = cabDepthM / 2; 

                microwaveModel.position.set(targetMicrowaveOriginX, targetMicrowaveOriginY, targetMicrowaveOriginZ);
                microwaveModel.scale.set(1, 1, 1); // Предполагаем, что модель уже в метрах

                group.add(microwaveModel);
                //console.log(`        Модель СВЧ ${microwaveModelFileName} добавлена. Pos: Y_низ=${targetMicrowaveOriginY.toFixed(3)}, Z_перед=${targetMicrowaveOriginZ.toFixed(3)}`);

            } else {
                console.error(`      [Блок 14] Модель СВЧ ${microwaveModelFileName} НЕ НАЙДЕНА в кэше! Будет создана заглушка.`);
                // Создаем красную заглушку
                let microwaveActualHeightForPlaceholder = 0.362; // Дефолтная высота для заглушки
                if (microwaveTypeSetting === '380') microwaveActualHeightForPlaceholder = 0.380;
                
                const placeholderWidth = cabWidthM * 0.75; // Чуть уже, чем для духовки
                const placeholderHeight = microwaveActualHeightForPlaceholder * 0.95;
                const placeholderDepth = cabDepthM * 0.6; // Менее глубокая
                
                const placeholderGeo = new THREE.BoxGeometry(placeholderWidth, placeholderHeight, placeholderDepth);
                const placeholderMat = new THREE.MeshBasicMaterial({color: 0xff0000, wireframe: false, name: "MicrowaveErrorPlaceholderMat_Tall"});
                const errorPlaceholder = new THREE.Mesh(placeholderGeo, placeholderMat);
                errorPlaceholder.name = `MICROWAVE_ERROR_PLACEHOLDER_TALL_${microwaveTypeSetting}`;

                const microShelfThickness = microShelfMesh.geometry.parameters.height;
                const microwaveBottomSurfaceY_Global = microShelfMesh.position.y + microShelfThickness / 2;
                
                const placeholderCenterX = 0;
                const placeholderCenterY = microwaveBottomSurfaceY_Global + placeholderHeight / 2;
                const placeholderCenterZ = cabDepthM / 2 - placeholderDepth / 2;
                
                errorPlaceholder.position.set(placeholderCenterX, placeholderCenterY, placeholderCenterZ);
                group.add(errorPlaceholder);
            }
        } // конец if (microwaveModelFileName)
    }
    // --- КОНЕЦ БЛОКА 14: УСТАНОВКА МОДЕЛИ МИКРОВОЛНОВКИ ---

    return group;
}


export function createDetailedLowerSwingGeometry(cabinetData, kitchenGlobalParams, MaterialManager, getPanelThickness) {
    if (!cabinetData || !cabinetData.mesh) return null;

    const group = new THREE.Group();
    group.userData.isDetailedCabinet = true;
    group.userData.objectType = 'cabinet';

    // 1. ПАРАМЕТРЫ
    const { width, height, depth } = cabinetData;
    const cabinetUUID = cabinetData.mesh.uuid;
    const panelThickness = getPanelThickness();
    const backPanelThickness = 3 / 1000;
    const handleType = kitchenGlobalParams.handleType || 'standard';
    const doorType = cabinetData.doorType || 'double';
    
    // 2. МАТЕРИАЛЫ
    const bodyMaterial = MaterialManager.getBodyMaterial(cabinetData);
    const backPanelMaterial = new THREE.MeshStandardMaterial({
        color: 0xf0f0f0, // Светло-серый
        roughness: 0.9, metalness: 0.0
    });
    const golaMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xAAAAAA, metalness: 0.8, roughness: 0.4 }); // Алюминий

    const boxAvailableHeightMeters = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;
    const stretcherDropMeters = cabinetData.stretcherDrop || 0;
    const minGolaHeightMeters = (kitchenGlobalParams.golaMinHeightMm || 30) / 1000;
    const facadeGapMeters = cabinetData.facadeGap || (3 / 1000);
    const actualGolaHeightMeters = calculateActualGolaHeight(
        minGolaHeightMeters * 1000, facadeGapMeters * 1000,
        boxAvailableHeightMeters * 1000 
    ) / 1000;

    // 3. БОКОВИНЫ
    const sidePanelHeight = height - panelThickness;
    const sidePanelDepth = depth;
   
    const sideShape = new THREE.Shape();
    sideShape.moveTo(0, 0);
    
    if (handleType === 'gola-profile') {
        // L-образный вырез сверху
        const cutoutHeight = 58 / 1000;
        const cutoutDepth = 27 / 1000;
        sideShape.lineTo(sidePanelDepth, 0);
        sideShape.lineTo(sidePanelDepth, sidePanelHeight - cutoutHeight);
        sideShape.lineTo(sidePanelDepth - cutoutDepth, sidePanelHeight - cutoutHeight);
        sideShape.lineTo(sidePanelDepth - cutoutDepth, sidePanelHeight);
        sideShape.lineTo(0, sidePanelHeight);
    } else {
        sideShape.lineTo(sidePanelDepth, 0);
        sideShape.lineTo(sidePanelDepth, sidePanelHeight);
        sideShape.lineTo(0, sidePanelHeight);
    }
    sideShape.closePath();
    
    const sideExtrudeSettings = { steps: 1, depth: panelThickness, bevelEnabled: false };
    const leftSide = createExtrudedPanel(
        sideShape, sideExtrudeSettings, 
        bodyMaterial.clone(), 'vertical', 'leftSide'
    );
    
    if (leftSide) {     
        leftSide.rotation.y = -Math.PI / 2;
        
        const leftX = -width / 2 + panelThickness; 
        const bottomY = -height / 2 + panelThickness; // На дно
        const backZ = -depth / 2;
        
        leftSide.position.set(leftX, bottomY, backZ);
        
        // Материал и текстура
        if (bodyMaterial.map && bodyMaterial.map.isTexture) {    
        MaterialManager.applyTextureToExtruded(
                            leftSide,
                            'vertical', // <-- Передаем направление 
                            sidePanelDepth,             // Ширина Shape
                            sidePanelHeight                  // Высота Shape
                        );
        }
        group.add(leftSide);
    }
    

    // ПРАВАЯ БОКОВИНА
    const rightSide = createExtrudedPanel(sideShape, sideExtrudeSettings, bodyMaterial.clone(), 'vertical', 'rightSide');
    if (rightSide) {
        rightSide.rotation.y = -Math.PI / 2;
        const rightX = width / 2;
        const bottomY = -height / 2 + panelThickness;
        const backZ = -depth / 2;
        
        rightSide.position.set(rightX, bottomY, backZ);
        if (bodyMaterial.map && bodyMaterial.map.isTexture) {    
            MaterialManager.applyTextureToExtruded(
                            rightSide,
                            'vertical', // <-- Передаем направление
                            sidePanelDepth,             // Ширина Shape
                            sidePanelHeight             // Высота Shape
                        );
        }
        group.add(rightSide);
    }
    

    // 4. ДНО
    const bottom = createPanel(width, panelThickness, depth, bodyMaterial, 'horizontal', 'bottom');
    if (bottom) {
        bottom.position.set(0, -height / 2 + panelThickness / 2, 0);
        MaterialManager.applyTexture(bottom, 'horizontal', 'horizontal');
        group.add(bottom);
    }


    // --- Блок 5: Задняя стенка и Перемычка (Новая логика) ---
    const rearPanelType = cabinetData.rearPanel || 'yes'; // Значение по умолчанию 'yes'
    //const stretcherDropMeters = cabinetData.stretcherDrop || 0;
    const backPanelInset = 0; // Смещение ЗС внутрь
    const backPanelSideOffset = 2; //добавим отступ, чтобы не хардкодить.
    let backPanel = null;
    let middleStretcher = null; // Переменная для перемычки


    if (rearPanelType === 'yes') {
         
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
        middleStretcher = createPanel(stretcherWidth, panelThickness, stretcherDepth, bodyMaterial, 'horizontal', "middleStretcher");

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
    // --- Конец Блока 5 ---
    // 6) Передняя царга
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
             frontStretcher = createPanel(stretcherWidth, panelThickness, stretcherDepth, bodyMaterial, 'horizontal', "frontStretcherH");
             if (frontStretcher) {
                 frontStretcherY = height / 2 - panelThickness / 2 - stretcherDropMeters;
                 // Рассчитываем Z с учетом смещения Gola
                 frontStretcherCenterZ = depth / 2 - stretcherDepth / 2 + golaProfileOffsetZ;
                 frontStretcher.position.set(0, frontStretcherY, frontStretcherCenterZ);
             }
         } else { // vertical (Толщина по Z)
             const stretcherHeight = 60 / 1000;
             frontStretcher = createPanel(stretcherWidth, stretcherHeight, panelThickness, bodyMaterial, 'frontal', "frontStretcherV");
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
     // --- Конец Блока 6 ---
     // 7) Задняя царга
    const rearStretcherType = cabinetData.rearStretcher || 'none'; // Значение по умолчанию 'none'
    let rearStretcher = null;
    if (rearStretcherType !== 'none') {
        const stretcherWidth = width - 2 * panelThickness;
        let rearStretcherY;
        if (rearStretcherType === 'horizontal') { // Толщина по Y
            const stretcherDepth = 80 / 1000;
            rearStretcher = createPanel(stretcherWidth, panelThickness, stretcherDepth, bodyMaterial, 'horizontal', "rearStretcherH");
            if (rearStretcher) {
                // Центр Y = верхняя точка шкафа - половина толщины царги - опуск
                rearStretcherY = height / 2 - panelThickness / 2 - stretcherDropMeters;
                // Центр Z = задняя точка шкафа + половина глубины царги
                const rearStretcherCenterZ = -depth / 2 + stretcherDepth / 2;
                rearStretcher.position.set(0, rearStretcherY, rearStretcherCenterZ);
            }
        } else { // vertical (Толщина по Z)
            const stretcherHeight = 60 / 1000;
            rearStretcher = createPanel(stretcherWidth, stretcherHeight, panelThickness, bodyMaterial, 'frontal', "rearStretcherV");
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

    // 6. ГОЛА-ПРОФИЛЬ (Если выбран)
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
        }
    }

    // 7. ФАСАДЫ (УНИВЕРСАЛЬНЫЙ БЛОК)
    if (doorType !== 'none') {
        const facadeGapM = cabinetData.facadeGap ?? (3 / 1000);
        const tb9Height = 30 / 1000;

        // Стратегия (Фрезеровка / Алюминий / Плоский)
        const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
        const { material: baseMat, thickness: baseTh } = MaterialManager.getMaterial(facadeSet);
        
        let buildStrategy = 'flat';
        let profileData = null;
        let finalMaterial = baseMat;
        let finalThickness = baseTh;

        // Override (Алюминий)
        if (cabinetData.facadeOverride && cabinetData.facadeOverride.startsWith('aluminum')) {
            buildStrategy = 'aluminum';
        } 
        // Фрезеровка
        else if (window.facadeOptionsData['mdf_milled']) {
             const decor = window.facadeOptionsData['mdf_milled'].decors.find(d => d.value === facadeSet?.texture);
             if (decor && decor.profileType === '9slice') {
                 buildStrategy = 'milled';
                 profileData = decor;
             }
        }
        // 2. Расчет высоты фасада
        let facadeHeight = height - facadeGapM; 
        let facadeYOffset = -facadeGapM / 2;
        let addTB9 = false;

        // ЛОГИКА TB9: Применяем ТОЛЬКО для плоских фасадов
        if (handleType === 'aluminum-tv9' && buildStrategy === 'flat') {
            facadeHeight = height - facadeGapM - tb9Height;
            // Центр смещается вниз, так как сверху добавилась ручка
            facadeYOffset = -(facadeGapM + tb9Height) / 2; 
            addTB9 = true;
        } else if (handleType === 'gola-profile') {
            // Если Gola, фасад ниже
            // (Нужно взять расчет actualGolaHeightMeters или константу)
            //const golaH = 35 / 1000; // Примерно
            facadeHeight = height - actualGolaHeightMeters; 
            facadeYOffset = -actualGolaHeightMeters / 2;
        }

        // Подготовка списка
        const facades = [];
        if (doorType === 'left' || doorType === 'right') {
            const w = width - facadeGapM;
            facades.push({ width: w, x: 0 });
        } else {
            const w = (width - facadeGapM * 2) / 2;
            const offset = w / 2 + facadeGapM / 2;
            facades.push({ width: w, x: -offset });
            facades.push({ width: w, x: offset });
        }
      
        facades.forEach((f, idx) => {
            const container = new THREE.Group();
            // Z позиция: Передняя грань шкафа (depth/2) + половина толщины
            const z = depth / 2 + finalThickness / 2;
            container.position.set(f.x, facadeYOffset, z);
            group.add(container);

            if (buildStrategy === 'milled') {
                // === ФРЕЗЕРОВКА ===
                createMilledFacade(f.width, facadeHeight, profileData, finalMaterial.clone())
                    .then(mesh => {
                        container.add(mesh);
                        mesh.updateMatrixWorld();
                    })
                    .catch(e => console.error(e));
            } else if (buildStrategy === 'aluminum') {
                // === АЛЮМИНИЙ (Заглушка) ===
                // const mesh = createZ1FrameFacade(...)
                // container.add(mesh);
            } else {
                // === ПЛОСКИЙ ===
                const mesh = createPanel(f.width, facadeHeight, finalThickness, finalMaterial.clone(), 'frontal', 'facade');
                if (mesh) {
                    if (mesh.material.map) MaterialManager.applyTextureTransform(mesh.material, cabinetData.textureDirection || 'vertical', f.width, facadeHeight);
                    container.add(mesh);
                    
                    // === ДОБАВЛЯЕМ РУЧКУ TB9 ===
                    if (addTB9) {
                        const handleLen = f.width;
                        const handleWidthMm = 19 / 1000; // Ширина профиля ручки
                        const handleHeightMm = 30 / 1000; // Высота профиля ручки = 30
                        // Создаем Shape ручки (простой профиль)
                        const hShape = new THREE.Shape();
                        //hShape.moveTo(0,0); hShape.lineTo(0.019,0); hShape.lineTo(0.019,0.03); hShape.lineTo(0,0.03); // Упрощенно
                        hShape.moveTo(0, 0);
                        hShape.lineTo(handleWidthMm, 0);
                        hShape.lineTo(handleWidthMm, handleHeightMm);
                        hShape.lineTo(handleWidthMm - 1.5 / 1000, handleHeightMm);
                        hShape.lineTo(handleWidthMm - 1.5 / 1000, 1 / 1000);
                        hShape.lineTo(0, 1 / 1000 );
                        hShape.closePath();
                        const hExtrude = { steps: 1, depth: handleLen, bevelEnabled: false };
                        //const hMat = new THREE.MeshStandardMaterial({ color: 0xAAAAAA, metalness: 0.8, roughness: 0.4 });
                        const hMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(hShape, hExtrude), golaMaterial);
                        
                        // Позиционируем НАД фасадом
                        // Внутри контейнера фасад отцентрован (0,0,0).
                        // Его верх = +facadeHeight/2.
                        // Ручка должна быть НАД ним.
                        // Y = facadeHeight/2.
                        // Ручка создана в XY, Extrude по Z (длина).
                        // Нужно повернуть: Длина по X (ширина фасада).
                        hMesh.rotation.y = Math.PI / 2; 
                        
                        // X: Центр ручки (длина) должен быть в 0.
                        // Extrude идет от 0 до Len. Значит смещаем на -Len/2.
                        hMesh.position.x = -handleLen / 2; 
                        
                        hMesh.position.y = facadeHeight / 2; // Снизу вверх (Shape Y 0..30mm)
                        hMesh.position.z = 0.010; // В плоскости фасада (или чуть глубже?)
                        // Профиль TB9 накладывается на торец. 
                        // Обычно он имеет "усик", который врезается.
                        // Выравниваем по передней грани или по центру толщины.
                        
                        container.add(hMesh);
                    }
                }
            }
        });
    }

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
                        bodyMaterial, // Материал корпуса
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

export function createDetailedDrawerCabinetGeometry(cabinetData, kitchenGlobalParams, MaterialManager, getPanelThickness) {
    if (!cabinetData || !cabinetData.mesh) return null;

    const group = new THREE.Group();
    group.userData.isDetailedCabinet = true;
    group.userData.objectType = 'cabinet';

    // 1. ПАРАМЕТРЫ
    const { width, height, depth } = cabinetData;
    const cabinetUUID = cabinetData.mesh.uuid;
    const panelThickness = getPanelThickness();
    const backPanelThickness = 3 / 1000;
    const handleType = kitchenGlobalParams.handleType || 'standard';
    const doorType = cabinetData.doorType || 'double';
    const facadeCount = parseInt(cabinetData.facadeCount) || 2; // Кол-во ящиков
    
    // 2. МАТЕРИАЛЫ
    const bodyMaterial = MaterialManager.getBodyMaterial(cabinetData);
    const backPanelMaterial = new THREE.MeshStandardMaterial({
        color: 0xf0f0f0, // Светло-серый
        roughness: 0.9, metalness: 0.0
    });
    const golaMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xAAAAAA, metalness: 0.8, roughness: 0.4 }); // Алюминий

    const boxAvailableHeightMeters = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;
    const stretcherDropMeters = cabinetData.stretcherDrop || 0;
    const minGolaHeightMeters = (kitchenGlobalParams.golaMinHeightMm || 30) / 1000;
    const facadeGapMeters = cabinetData.facadeGap || (3 / 1000);
    const actualGolaHeightMeters = calculateActualGolaHeight(
        minGolaHeightMeters * 1000, facadeGapMeters * 1000,
        boxAvailableHeightMeters * 1000 
    ) / 1000;

    // 3. БОКОВИНЫ
    const sidePanelHeight = height - panelThickness;
    const sidePanelDepth = depth;
    const sideShape = new THREE.Shape();
    sideShape.moveTo(0, 0);

    // Определяем, нужен ли ДВОЙНОЙ вырез (для Gola + Ящики > 1)
    const useDoubleGola = (handleType === 'gola-profile' && facadeCount > 1);
    
    if (handleType === 'gola-profile') {
        // L-образный вырез сверху
        const cutoutHeight = 58 / 1000;
        const cutoutDepth = 27 / 1000;
        const cProfileHeight = 70 / 1000; // C-профиль (средний)

        // Координаты
        const frontX = sidePanelDepth;
        const topY = sidePanelHeight;
        const lProfileBottomY = topY - cutoutHeight;
        const lProfileBackX = frontX - cutoutDepth;

         if (useDoubleGola) {
            // Расчет высоты первого (нижнего) ящика для позиции C-профиля
            // Если 2 ящика: они равны (минус профили).
            // Если 3 ящика: нижний большой, два верхних меньше.
            // Нам нужна высота НИЖНЕГО фасада, чтобы поставить профиль НАД ним.
            
            // Упрощенно: возьмем расчет из блока фасадов
            // Или продублируем логику
            let h_bottom = 0;
            if (facadeCount === 2) {
                h_bottom = (height - 2 * actualGolaHeightMeters) / 2;
            } else {
                // Для 3-х: 2 профиля, 1 зазор. 
                const totalGaps = 2 * actualGolaHeightMeters;
                h_bottom = (height - totalGaps) / 2; // Примерно
            }
            
            // Позиция C-профиля (низ выреза)
            // Низ шкафа = 0 (в локальных координатах Shape).
            // Профиль начинается на высоте: h_bottom (фасад) + ???
            // Точный расчет: 
            // C-профиль центр Y = -height/2 + h_bottom - 58/1000 + actualGolaHeight.
            // В Shape Y=0 это низ боковины (которая стоит на дне).
            // Дно = panelThickness.
            // Значит Y_shape = Y_world + height/2 - panelThickness.
            
            // Давай возьмем координаты из твоего старого кода (он был верный):
            // const heightFirctGolaCut = (height - actualGolaHeightMeters * 2) / 2 - 58/1000 + actualGolaHeightMeters - panelThickness;
            
            // Адаптируем под 3 ящика, если нужно, или используем твой расчет
            let heightFirstCut = (height - 2 * actualGolaHeightMeters) / 2 - 58/1000 + actualGolaHeightMeters - panelThickness;
            if (facadeCount === 3) {
                // Для 3 ящиков нижний фасад такой же большой, как для 2-х.
                // Значит позиция первого профиля (снизу) та же.
            }
            
            sideShape.lineTo(frontX, 0);
            sideShape.lineTo(frontX, heightFirstCut);
            sideShape.lineTo(lProfileBackX, heightFirstCut);
            sideShape.lineTo(lProfileBackX, heightFirstCut + cProfileHeight);
            sideShape.lineTo(frontX, heightFirstCut + cProfileHeight);
            sideShape.lineTo(frontX, lProfileBottomY);
            sideShape.lineTo(lProfileBackX, lProfileBottomY);
            sideShape.lineTo(lProfileBackX, topY);
            sideShape.lineTo(0, topY);

        } else {
            // Один вырез (как в swing)
            sideShape.lineTo(frontX, 0);
            sideShape.lineTo(frontX, lProfileBottomY);
            sideShape.lineTo(lProfileBackX, lProfileBottomY);
            sideShape.lineTo(lProfileBackX, topY);
            sideShape.lineTo(0, topY);
        }
    } else {
        sideShape.lineTo(sidePanelDepth, 0);
        sideShape.lineTo(sidePanelDepth, sidePanelHeight);
        sideShape.lineTo(0, sidePanelHeight);
    }
    sideShape.closePath();
    
    const sideExtrudeSettings = { steps: 1, depth: panelThickness, bevelEnabled: false };
    const leftSide = createExtrudedPanel(
        sideShape, sideExtrudeSettings, 
        bodyMaterial.clone(), 'vertical', 'leftSide'
    );
    
    if (leftSide) {
        leftSide.rotation.y = -Math.PI / 2;
        leftSide.position.set(-width / 2 + panelThickness, -height / 2 + panelThickness, -depth / 2);
        if (bodyMaterial.map) MaterialManager.applyTextureToExtruded(leftSide, 'vertical', sidePanelDepth, sidePanelHeight);
        group.add(leftSide);
    }
    
    // ПРАВАЯ БОКОВИНА
    const rightSide = createExtrudedPanel(sideShape, sideExtrudeSettings, bodyMaterial.clone(), 'vertical', 'rightSide');
    if (rightSide) {
        rightSide.rotation.y = -Math.PI / 2;
        rightSide.position.set(width / 2, -height / 2 + panelThickness, -depth / 2);
        if (bodyMaterial.map) MaterialManager.applyTextureToExtruded(rightSide, 'vertical', sidePanelDepth, sidePanelHeight);
        group.add(rightSide);
    }
    

    // 4. ДНО
    const bottom = createPanel(width, panelThickness, depth, bodyMaterial, 'horizontal', 'bottom');
    if (bottom) {
        bottom.position.set(0, -height / 2 + panelThickness / 2, 0);
        MaterialManager.applyTexture(bottom, 'horizontal', 'horizontal');
        group.add(bottom);
    }


    // --- Блок 5: Задняя стенка и Перемычка (Новая логика) ---
    const rearPanelType = cabinetData.rearPanel || 'yes'; // Значение по умолчанию 'yes'
    //const stretcherDropMeters = cabinetData.stretcherDrop || 0;
    const backPanelInset = 0; // Смещение ЗС внутрь
    const backPanelSideOffset = 2; //добавим отступ, чтобы не хардкодить.
    let backPanel = null;
    let middleStretcher = null; // Переменная для перемычки


    if (rearPanelType === 'yes') {
         
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
        middleStretcher = createPanel(stretcherWidth, panelThickness, stretcherDepth, bodyMaterial, 'horizontal', "middleStretcher");

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
    // --- Конец Блока 5 ---
    // 6) Передняя царга
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
             frontStretcher = createPanel(stretcherWidth, panelThickness, stretcherDepth, bodyMaterial, 'horizontal', "frontStretcherH");
             if (frontStretcher) {
                 frontStretcherY = height / 2 - panelThickness / 2 - stretcherDropMeters;
                 // Рассчитываем Z с учетом смещения Gola
                 frontStretcherCenterZ = depth / 2 - stretcherDepth / 2 + golaProfileOffsetZ;
                 frontStretcher.position.set(0, frontStretcherY, frontStretcherCenterZ);
             }
         } else { // vertical (Толщина по Z)
             const stretcherHeight = 60 / 1000;
             frontStretcher = createPanel(stretcherWidth, stretcherHeight, panelThickness, bodyMaterial, 'frontal', "frontStretcherV");
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
     // --- Конец Блока 6 ---
     // 7) Задняя царга
    const rearStretcherType = cabinetData.rearStretcher || 'none'; // Значение по умолчанию 'none'
    let rearStretcher = null;
    if (rearStretcherType !== 'none') {
        const stretcherWidth = width - 2 * panelThickness;
        let rearStretcherY;
        if (rearStretcherType === 'horizontal') { // Толщина по Y
            const stretcherDepth = 80 / 1000;
            rearStretcher = createPanel(stretcherWidth, panelThickness, stretcherDepth, bodyMaterial, 'horizontal', "rearStretcherH");
            if (rearStretcher) {
                // Центр Y = верхняя точка шкафа - половина толщины царги - опуск
                rearStretcherY = height / 2 - panelThickness / 2 - stretcherDropMeters;
                // Центр Z = задняя точка шкафа + половина глубины царги
                const rearStretcherCenterZ = -depth / 2 + stretcherDepth / 2;
                rearStretcher.position.set(0, rearStretcherY, rearStretcherCenterZ);
            }
        } else { // vertical (Толщина по Z)
            const stretcherHeight = 60 / 1000;
            rearStretcher = createPanel(stretcherWidth, stretcherHeight, panelThickness, bodyMaterial, 'frontal', "rearStretcherV");
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

    // 6. ГОЛА-ПРОФИЛЬ (Если выбран)
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
            if (useDoubleGola) {
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

// 5. ФАСАДЫ ЯЩИКОВ
    const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
    const { material: baseMat, thickness: baseTh } = MaterialManager.getMaterial(facadeSet);

    // Стратегия
    let buildStrategy = 'flat';
    let profileData = null;
    let finalMaterial = baseMat;
    let finalThickness = baseTh;

    if (cabinetData.facadeOverride?.startsWith('aluminum')) buildStrategy = 'aluminum';
    else if (window.facadeOptionsData['mdf_milled']) {
        const decor = window.facadeOptionsData['mdf_milled'].decors.find(d => d.value === facadeSet?.texture);
        if (decor && decor.profileType === '9slice') {
            buildStrategy = 'milled';
            profileData = decor;
            // === ПРИМЕНЕНИЕ СВОЙСТВ ДЕКОРА К МАТЕРИАЛУ ===
            // if (profileData.roughness !== undefined) finalMaterial.roughness = profileData.roughness;
            // if (profileData.metalness !== undefined) finalMaterial.metalness = profileData.metalness;
        }
    }

    // Расчет высот
    const drawerWidth = width - facadeGapMeters;
    let facadesData = [];
    let currentY = -height / 2; // Начинаем снизу

    // Логика TB9
    const tb9Height = 30 / 1000;

    if (facadeCount === 1) {
        let h = height; let addTB9 = false;
        if (handleType === 'gola-profile') {
                // Один фасад, один верхний Гола-профиль
                h = height - actualGolaHeightMeters; // Высота фасада под один профиль
        } else if (handleType === 'aluminum-tv9' && buildStrategy === 'flat') {
                h = height - tb9HandleHeightMeters - facadeGapMeters; // Один зазор (сверху от ручки)
                addTB9 = true;
        } else if (handleType === 'standard') {
            h = height - facadeGapMeters; // Один зазор (сверху)
        }

        if (h <= 0) { console.error("Высота фасада ящика <= 0"); h = 0.1; }
        // Центр Y = низ шкафа + половина высоты фасада
        facadesData.push({ height: h, y: currentY + h / 2, addTB9: addTB9 });

    } else if (facadeCount === 2) {
        let h = 0;
        let addTB9 = false;

        if (handleType === 'gola-profile') {
            h = (height - 2 * actualGolaHeightMeters) / 2;
        } else if (handleType === 'aluminum-tv9' && buildStrategy === 'flat') {
            h = (height - 2 * tb9Height - 2 * facadeGapMeters) / 2;
            addTB9 = true;
        } else { // standard
            h = (height - 2 * facadeGapMeters) / 2;
        }
        
        if (h <= 0) h = 0.1;

        // Нижний
        facadesData.push({ height: h, y: currentY + h / 2, addTB9: addTB9 });
        
        // Сдвиг для следующего
        if (handleType === 'gola-profile') currentY += h + actualGolaHeightMeters;
        else if (addTB9) currentY += h + tb9Height + facadeGapMeters;
        else currentY += h + facadeGapMeters;
        
        // Верхний
        facadesData.push({ height: h, y: currentY + h / 2, addTB9: addTB9 });

    } else if (facadeCount === 3) {
        let h_bottom = 0;
        let h_top_1 = 0;
        let h_top_2 = 0;
        let addTB9 = false;
        let totalGaps = 0;

        if (handleType === 'gola-profile') {
            totalGaps = 2 * actualGolaHeightMeters;
            h_bottom = (height - totalGaps) / 2;
            // Остаток делим на два верхних ящика
            const remainingHeight = height - h_bottom - totalGaps;
            h_top_1 = (remainingHeight - facadeGapMeters) / 2; // Примерно пополам
            h_top_2 = remainingHeight - h_top_1 - facadeGapMeters;

        } else if (handleType === 'aluminum-tv9' && buildStrategy === 'flat') {
            // 3 ручки, 2 зазора между фасадами
            // (или 3 зазора, если сверху тоже есть?)
            // Предположим: Фасад+Ручка+Зазор, Фасад+Ручка+Зазор, Фасад+Ручка
            // Твой код: 2 * tb9Height + 2 * facadeGapMeters. Это для 2-х верхних.
            // А нижний?
            
            totalGaps = 2 * tb9Height + 2 * facadeGapMeters; // Между ящиками
            // Нижний большой
            h_bottom = (height - totalGaps) / 2; // Грубый расчет, если нижний = половине высоты
            
            //const remaining = height - h_bottom - totalGaps;
            // Верхние
            h_top_1 = Math.round((h_bottom - facadeGapMeters - tb9Height) * 1000 / 2) / 1000; // Тут логика может быть сложнее
            h_top_2 = h_bottom - h_top_1 - facadeGapMeters - tb9Height; // Подгонка
            
            // Упростим: Равномерно? Нет. 
            // Давай возьмем твой код расчета высот, он был рабочим, просто заменим переменную.
            
            addTB9 = true;
            
        } else { // standard
            // 3 фасада, 2 зазора
            totalGaps = 2 * facadeGapMeters;
            h_bottom = (height - totalGaps) / 2;
            const h_top_total = height - h_bottom - totalGaps;
            h_top_1 = Math.round((h_bottom * 1000 - facadeGapMeters * 1000) / 2) / 1000;//h_top_total / 2;
            h_top_2 = h_bottom - h_top_1 - facadeGapMeters;
        }

        // 1-й (нижний)
        facadesData.push({ height: h_bottom, y: currentY + h_bottom / 2, addTB9: addTB9 });
        
        // Сдвиг
        if (handleType === 'gola-profile') currentY += h_bottom + actualGolaHeightMeters;
        else if (addTB9) currentY += h_bottom + tb9Height + facadeGapMeters;
        else currentY += h_bottom + facadeGapMeters;

        // 2-й (средний)
        facadesData.push({ height: h_top_1, y: currentY + h_top_1 / 2, addTB9: addTB9 });
        
        // Сдвиг
        if (handleType === 'gola-profile') currentY += h_top_1 + facadeGapMeters; // Между средним и верхним нет Гола? (обычно нет)
        else if (addTB9) currentY += h_top_1 + tb9Height + facadeGapMeters;
        else currentY += h_top_1 + facadeGapMeters;

        // 3-й (верхний)
        facadesData.push({ height: h_top_2, y: currentY + h_top_2 / 2, addTB9: addTB9 });

    } else {
        // Default / 4 drawers...
    }

    // Генерация
    facadesData.forEach((f, idx) => {
        const container = new THREE.Group();
        const z = depth / 2 + finalThickness / 2;
        container.position.set(0, f.y, z);
        group.add(container);

        if (buildStrategy === 'milled') {
            // Используем f.height
            createMilledFacade(drawerWidth, f.height, profileData, finalMaterial.clone())
                .then(mesh => container.add(mesh));
        } else if (buildStrategy === 'aluminum') {
            // ...
        } else {
            // Используем f.height
            const mesh = createPanel(drawerWidth, f.height, finalThickness, finalMaterial.clone(), 'frontal', `drawer_${idx}`);
            if (mesh) {
                if (mesh.material.map) MaterialManager.applyTextureTransform(mesh.material, cabinetData.textureDirection || 'vertical', drawerWidth, f.height);
                container.add(mesh);
                
                if (f.addTB9) {
                    // Ручка TB9
                    const handleLen = drawerWidth;
                    const handleWidthMm = 19 / 1000; 
                    const handleHeightMm = 30 / 1000;
                    const hShape = new THREE.Shape();
                    hShape.moveTo(0, 0);
                    hShape.lineTo(handleWidthMm, 0);
                    hShape.lineTo(handleWidthMm, handleHeightMm);
                    hShape.lineTo(handleWidthMm - 0.0015, handleHeightMm);
                    hShape.lineTo(handleWidthMm - 0.0015, 0.001);
                    hShape.lineTo(0, 0.001);
                    hShape.closePath();
                    
                    const hExtrude = { steps: 1, depth: handleLen, bevelEnabled: false };
                    const hMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(hShape, hExtrude), golaMaterial.clone());
                    
                    hMesh.rotation.y = Math.PI / 2; 
                    hMesh.position.x = -handleLen / 2; 
                    // Ручка ставится на верхний торец фасада
                    // Центр фасада (в контейнере) Y=0. Верх = +height/2.
                    hMesh.position.y = f.height / 2; 
                    hMesh.position.z = 0.010; // Смещение вперед
                    
                    container.add(hMesh);
                }
            }
        }
    });

    // 7. ФАСАДЫ (УНИВЕРСАЛЬНЫЙ БЛОК)
    // if (doorType !== 'none') {
    //     const facadeGapM = cabinetData.facadeGap ?? (3 / 1000);
    //     const tb9Height = 30 / 1000;

    //     // Стратегия (Фрезеровка / Алюминий / Плоский)
    //     const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
    //     const { material: baseMat, thickness: baseTh } = MaterialManager.getMaterial(facadeSet);
        
    //     let buildStrategy = 'flat';
    //     let profileData = null;
    //     let finalMaterial = baseMat;
    //     let finalThickness = baseTh;

    //     // Override (Алюминий)
    //     if (cabinetData.facadeOverride && cabinetData.facadeOverride.startsWith('aluminum')) {
    //         buildStrategy = 'aluminum';
    //     } 
    //     // Фрезеровка
    //     else if (window.facadeOptionsData['mdf_milled']) {
    //          const decor = window.facadeOptionsData['mdf_milled'].decors.find(d => d.value === facadeSet?.texture);
    //          if (decor && decor.profileType === '9slice') {
    //              buildStrategy = 'milled';
    //              profileData = decor;
    //          }
    //     }
    //     // 2. Расчет высоты фасада
    //     let facadeHeight = height - facadeGapM; 
    //     let facadeYOffset = -facadeGapM / 2;
    //     let addTB9 = false;

    //     // ЛОГИКА TB9: Применяем ТОЛЬКО для плоских фасадов
    //     if (handleType === 'aluminum-tv9' && buildStrategy === 'flat') {
    //         facadeHeight = height - facadeGapM - tb9Height;
    //         // Центр смещается вниз, так как сверху добавилась ручка
    //         facadeYOffset = -(facadeGapM + tb9Height) / 2; 
    //         addTB9 = true;
    //     } else if (handleType === 'gola-profile') {
    //         // Если Gola, фасад ниже
    //         // (Нужно взять расчет actualGolaHeightMeters или константу)
    //         //const golaH = 35 / 1000; // Примерно
    //         facadeHeight = height - actualGolaHeightMeters; 
    //         facadeYOffset = -actualGolaHeightMeters / 2;
    //     }

    //     // Подготовка списка
    //     const facades = [];
    //     if (doorType === 'left' || doorType === 'right') {
    //         const w = width - facadeGapM;
    //         facades.push({ width: w, x: 0 });
    //     } else {
    //         const w = (width - facadeGapM * 2) / 2;
    //         const offset = w / 2 + facadeGapM / 2;
    //         facades.push({ width: w, x: -offset });
    //         facades.push({ width: w, x: offset });
    //     }
      
    //     facades.forEach((f, idx) => {
    //         const container = new THREE.Group();
    //         // Z позиция: Передняя грань шкафа (depth/2) + половина толщины
    //         const z = depth / 2 + finalThickness / 2;
    //         container.position.set(f.x, facadeYOffset, z);
    //         group.add(container);

    //         if (buildStrategy === 'milled') {
    //             // === ФРЕЗЕРОВКА ===
    //             createMilledFacade(f.width, facadeHeight, profileData, finalMaterial.clone())
    //                 .then(mesh => {
    //                     container.add(mesh);
    //                     mesh.updateMatrixWorld();
    //                 })
    //                 .catch(e => console.error(e));
    //         } else if (buildStrategy === 'aluminum') {
    //             // === АЛЮМИНИЙ (Заглушка) ===
    //             // const mesh = createZ1FrameFacade(...)
    //             // container.add(mesh);
    //         } else {
    //             // === ПЛОСКИЙ ===
    //             const mesh = createPanel(f.width, facadeHeight, finalThickness, finalMaterial.clone(), 'frontal', 'facade');
    //             if (mesh) {
    //                 if (mesh.material.map) MaterialManager.applyTextureTransform(mesh.material, cabinetData.textureDirection || 'vertical', f.width, facadeHeight);
    //                 container.add(mesh);
                    
    //                 // === ДОБАВЛЯЕМ РУЧКУ TB9 ===
    //                 if (addTB9) {
    //                     const handleLen = f.width;
    //                     const handleWidthMm = 19 / 1000; // Ширина профиля ручки
    //                     const handleHeightMm = 30 / 1000; // Высота профиля ручки = 30
    //                     // Создаем Shape ручки (простой профиль)
    //                     const hShape = new THREE.Shape();
    //                     //hShape.moveTo(0,0); hShape.lineTo(0.019,0); hShape.lineTo(0.019,0.03); hShape.lineTo(0,0.03); // Упрощенно
    //                     hShape.moveTo(0, 0);
    //                     hShape.lineTo(handleWidthMm, 0);
    //                     hShape.lineTo(handleWidthMm, handleHeightMm);
    //                     hShape.lineTo(handleWidthMm - 1.5 / 1000, handleHeightMm);
    //                     hShape.lineTo(handleWidthMm - 1.5 / 1000, 1 / 1000);
    //                     hShape.lineTo(0, 1 / 1000 );
    //                     hShape.closePath();
    //                     const hExtrude = { steps: 1, depth: handleLen, bevelEnabled: false };
    //                     //const hMat = new THREE.MeshStandardMaterial({ color: 0xAAAAAA, metalness: 0.8, roughness: 0.4 });
    //                     const hMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(hShape, hExtrude), golaMaterial);
                        
    //                     // Позиционируем НАД фасадом
    //                     // Внутри контейнера фасад отцентрован (0,0,0).
    //                     // Его верх = +facadeHeight/2.
    //                     // Ручка должна быть НАД ним.
    //                     // Y = facadeHeight/2.
    //                     // Ручка создана в XY, Extrude по Z (длина).
    //                     // Нужно повернуть: Длина по X (ширина фасада).
    //                     hMesh.rotation.y = Math.PI / 2; 
                        
    //                     // X: Центр ручки (длина) должен быть в 0.
    //                     // Extrude идет от 0 до Len. Значит смещаем на -Len/2.
    //                     hMesh.position.x = -handleLen / 2; 
                        
    //                     hMesh.position.y = facadeHeight / 2; // Снизу вверх (Shape Y 0..30mm)
    //                     hMesh.position.z = 0.010; // В плоскости фасада (или чуть глубже?)
    //                     // Профиль TB9 накладывается на торец. 
    //                     // Обычно он имеет "усик", который врезается.
    //                     // Выравниваем по передней грани или по центру толщины.
                        
    //                     container.add(hMesh);
    //                 }
    //             }
    //         }
    //     });
    //}

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
                        bodyMaterial, // Материал корпуса
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
 * Создает THREE.Group представляющую детализированную модель шкафа для духовки.
 * @param {object} cabinetData - Объект шкафа из массива 'cabinets'.
 * @returns {THREE.Group | null} Группа со всеми частями шкафа или null при ошибке.
 */
export function createDetailedOvenCabinetGeometry(cabinetData, kitchenGlobalParams, MaterialManager, getPanelThickness) {

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
        // 1. Материал и Стратегия
        const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
        const { material: baseFacadeMaterial, thickness: facadeThicknessMeters } = MaterialManager.getMaterial(facadeSet);
        
        let buildStrategy = 'flat';
        let profileData = null;
        let finalMaterial = baseFacadeMaterial;
        let finalThickness = facadeThicknessMeters;

        if (cabinetData.facadeOverride?.startsWith('aluminum')) {
            buildStrategy = 'aluminum';
        } else if (window.facadeOptionsData['mdf_milled']) {
            const decor = window.facadeOptionsData['mdf_milled'].decors.find(d => d.value === facadeSet?.texture);
            if (decor && decor.profileType === '9slice') {
                buildStrategy = 'milled';
                profileData = decor;
                // Обновляем толщину для фрезеровки
                const lodData = decor.lod?.full || decor.lod?.simple || decor.models;
                const modelThickMm = lodData.edgeThickness || 19;
                finalThickness = modelThickMm / 1000;
            }
        }

        // 2. Создание контейнера
        const container = new THREE.Group();
        // Z: Передняя грань корпуса + половина финальной толщины
        const facadeCenterZ = (cabDepthM / 2) + (finalThickness / 2);
        
        container.position.set(0, mainFacadeCenterY, facadeCenterZ); // X=0 (центр)
        container.userData.cabinetUUID = cabinetUUID;
        group.add(container);

        // 3. Наполнение
        if (buildStrategy === 'milled') {
            // === ФРЕЗЕРОВКА ===
            createMilledFacade(mainFacadeWidthM, mainFacadeHeightM_calc, profileData, finalMaterial.clone())
                .then(mesh => {
                    container.add(mesh);
                    mesh.updateMatrixWorld();
                });

        } else if (buildStrategy === 'aluminum') {
            // === АЛЮМИНИЙ ===
            // container.add(createZ1FrameFacade(mainFacadeWidthM, mainFacadeHeightM_calc, ...));

        } else {
            // === ПЛОСКИЙ ===
            const facadeMesh = createPanel(
                mainFacadeWidthM,
                mainFacadeHeightM_calc,
                finalThickness, // Используем finalThickness
                finalMaterial.clone(),
                'frontal',
                `oven_main_facade_${cabinetUUID.substring(0,4)}`
            );

            if (facadeMesh) {
                if (facadeMesh.material.map) {
                    MaterialManager.applyTextureTransform(
                        facadeMesh.material,
                        cabinetData.textureDirection || 'vertical',
                        mainFacadeWidthM,
                        mainFacadeHeightM_calc
                    );
                }
                container.add(facadeMesh);

                // --- Ручка TV9 для этого фасада ---
                if (handleType === 'aluminum-tv9') {
                    const handleLengthMeters_tv9 = mainFacadeWidthM;
                    const tb9ProfileWidthMm = 19; 
                    const tb9ProfileHeightMm = 30;
                    const handleShape_tv9 = new THREE.Shape(); 
                    handleShape_tv9.moveTo(0, 0); handleShape_tv9.lineTo(tb9ProfileWidthMm,0); handleShape_tv9.lineTo(tb9ProfileWidthMm,tb9ProfileHeightMm);
                    handleShape_tv9.lineTo(tb9ProfileWidthMm - 1.5, tb9ProfileHeightMm); handleShape_tv9.lineTo(tb9ProfileWidthMm - 1.5, 1); handleShape_tv9.lineTo(0,1);
                    handleShape_tv9.closePath();
                    const handleExtrudeSettings_tv9 = { depth: handleLengthMeters_tv9 * 1000, steps: 1, bevelEnabled: false };
                    const handleMesh_tv9 = new THREE.Mesh(new THREE.ExtrudeGeometry(handleShape_tv9, handleExtrudeSettings_tv9), golaMaterial.clone());
                               
                    // Центрируем и скейлим
                    handleMesh_tv9.geometry.translate(0, 0, -handleLengthMeters_tv9 * 1000 / 2); 
                    handleMesh_tv9.geometry.scale(1/1000, 1/1000, 1/1000);
                    
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
    // --- 8. Верхняя фальш-панель-заглушка ---
    if (ovenPosition === 'top' && extraOffsetTopM > 0.001) {

        const fpTopWidthM = mainFacadeWidthM;
        const fpTopHeightM = extraOffsetTopM;

        if (fpTopWidthM > 0.01 && fpTopHeightM > 0.001) {
            // 1. Стратегия (повторяем, так как переменные локальные)
            const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
            const { material: baseFacadeMaterial, thickness: baseTh } = MaterialManager.getMaterial(facadeSet);
            
            let buildStrategy = 'flat';
            let profileData = null;
            let finalMaterial = baseFacadeMaterial;
            let finalThickness = baseTh;

            if (window.facadeOptionsData['mdf_milled']) {
                 const decor = window.facadeOptionsData['mdf_milled'].decors.find(d => d.value === facadeSet?.texture);
                 if (decor && decor.profileType === '9slice') {
                     buildStrategy = 'milled';
                     profileData = decor;
                     finalThickness = (decor.lod?.full?.edgeThickness || 19) / 1000;
                 }
            }

            // 2. Расчет Y (твой код)
            let yTopOf_fpTop; 
            const yStructuralTopOfCabinet = (cabHeightM / 2) - stretcherDropM; 

            if (handleType === 'gola-profile') {
                yTopOf_fpTop = yStructuralTopOfCabinet - actualGolaHeightMeters;
            } else { 
                yTopOf_fpTop = yStructuralTopOfCabinet - facadeGapM;
            }
            const fpTopCenterY = yTopOf_fpTop - (fpTopHeightM / 2);

            // 3. Контейнер
            const container = new THREE.Group();
            const fpTopCenterZ = (cabDepthM / 2) + (finalThickness / 2); 
            container.position.set(0, fpTopCenterY, fpTopCenterZ);
            container.userData.cabinetUUID = cabinetUUID;
            group.add(container);

            // 4. Наполнение
            if (buildStrategy === 'milled') {
                 createMilledFacade(fpTopWidthM, fpTopHeightM, profileData, finalMaterial.clone())
                    .then(mesh => container.add(mesh));
            } else {
                 const fpTopMesh = createPanel(
                    fpTopWidthM, fpTopHeightM, finalThickness,
                    finalMaterial.clone(), 'frontal', 
                    `oven_top_filler_panel_${cabinetUUID.substring(0,4)}`
                 );
                 if (fpTopMesh) {
                     if (fpTopMesh.material.map) {
                        MaterialManager.applyTextureTransform(fpTopMesh.material, cabinetData.textureDirection || 'vertical', fpTopWidthM, fpTopHeightM);
                     }
                     container.add(fpTopMesh);
                 }
            }
        } else {
            console.warn("    [OVEN] Верхняя фальш-панель не создана (маленький размер).");
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
 * Создает THREE.Group, представляющую детализированную модель шкафа для посудомойки.
 * @param {object} cabinetData - Объект шкафа из массива 'cabinets'.
 * @returns {THREE.Group | null} Группа со всеми частями шкафа или null при ошибке.
 */
export function createDetailedDishwasherGeometry(cabinetData, kitchenGlobalParams, MaterialManager, getPanelThickness) {
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
    console.log(" - Создание фасада посудомойки...");
    
    // 1. Материал и Стратегия
    const { material: baseFacadeMaterial, thickness: baseTh } = MaterialManager.getMaterial(facadeSet);

    let buildStrategy = 'flat';
    let profileData = null;
    let finalMaterial = baseFacadeMaterial;
    let finalThickness = baseTh;

    if (cabinetData.facadeOverride?.startsWith('aluminum')) {
        buildStrategy = 'aluminum';
    } else if (window.facadeOptionsData['mdf_milled']) {
         const decor = window.facadeOptionsData['mdf_milled'].decors.find(d => d.value === facadeSet?.texture);
         if (decor && decor.profileType === '9slice') {
             buildStrategy = 'milled';
             profileData = decor;
             const lodData = decor.lod?.full || decor.lod?.simple || decor.models;
             finalThickness = (lodData.edgeThickness || 19) / 1000;
         }
    }

    // 2. Расчет высоты и Y (твой код)
    let facadeHeight = 0;
    let facadeCenterYOffset = 0;
    const tb9HandleHeightMeters = 30 / 1000;
    const facadeWidth = width - facadeGapM;
    
    let addTB9 = false;

    if (handleType === 'aluminum-tv9' && buildStrategy === 'flat') {
        facadeHeight = height - facadeGapM - tb9HandleHeightMeters;
        facadeCenterYOffset = -(facadeGapM + tb9HandleHeightMeters) / 2;
        addTB9 = true;
    } else if (handleType === 'gola-profile') {
        const boxAvailableHeightMeters = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;
        const minGolaHeightMeters = (kitchenGlobalParams.golaMinHeightMm || 30) / 1000;
        const actualGolaHeightMeters = calculateActualGolaHeight(
            minGolaHeightMeters * 1000, facadeGapM * 1000, boxAvailableHeightMeters * 1000
        ) / 1000;

        facadeHeight = height - actualGolaHeightMeters;
        facadeCenterYOffset = -actualGolaHeightMeters / 2;
    } else { 
        facadeHeight = height - facadeGapM;
        facadeCenterYOffset = -facadeGapM / 2;
    }

    if (facadeHeight <= 0) {
        console.error(`[Dishwasher] Расчетная высота фасада <= 0: ${facadeHeight}`);
    } else {
        // 3. Создание (Контейнер)
        const container = new THREE.Group();
        const z = depth / 2 + finalThickness / 2;
        container.position.set(0, facadeCenterYOffset, z);
        container.userData.cabinetUUID = cabinetUUID;
        group.add(container);

        // 4. Наполнение
        if (buildStrategy === 'milled') {
            createMilledFacade(facadeWidth, facadeHeight, profileData, finalMaterial.clone())
                .then(mesh => {
                    container.add(mesh);
                    mesh.updateMatrixWorld();
                });

        } else if (buildStrategy === 'aluminum') {
            // ...
        } else {
            // === ПЛОСКИЙ ===
            const facadeMesh = createPanel(
                facadeWidth, facadeHeight, finalThickness,
                finalMaterial.clone(), 'frontal', `facade_dishwasher`
            );

            if (facadeMesh) {
                if (facadeMesh.material.map) {
                    MaterialManager.applyTextureTransform(
                        facadeMesh.material, cabinetData.textureDirection || 'vertical',
                        facadeWidth, facadeHeight
                    );
                }
                container.add(facadeMesh);

                // --- Ручка TV9 (Твой код для плоского) ---
                if (addTB9) {
                    const handleLengthMeters = facadeWidth;
                    const handleWidthMm = 19; 
                    const handleHeightMm = 30; 
                    
                    const handleShape = new THREE.Shape();
                    handleShape.moveTo(0, 0);
                    handleShape.lineTo(handleWidthMm, 0);
                    handleShape.lineTo(handleWidthMm, handleHeightMm);
                    handleShape.lineTo(handleWidthMm - 1.5, handleHeightMm);
                    handleShape.lineTo(handleWidthMm - 1.5, 1);
                    handleShape.lineTo(0, 1);
                    handleShape.closePath();
                    
                    const handleExtrudeSettings = { steps: 1, depth: handleLengthMeters * 1000, bevelEnabled: false };
                    let handleGeometry = null; 
                    try {
                        handleGeometry = new THREE.ExtrudeGeometry(handleShape, handleExtrudeSettings);
                        handleGeometry.translate(0, 0, -handleLengthMeters * 1000 / 2);
                        handleGeometry.scale(1/1000, 1/1000, 1/1000);
                    } catch (e) { console.error(e); }

                    if (handleGeometry) {
                        const handleMesh = new THREE.Mesh(handleGeometry, golaMaterial.clone()); 
                        handleMesh.rotation.y = Math.PI / 2;
                        
                        // Позиция внутри контейнера (центр фасада 0,0,0)
                        // Y: Верх фасада = +height/2.
                        handleMesh.position.y = facadeHeight / 2; 
                        handleMesh.position.x = 0;
                        handleMesh.position.z = 0.010; // Z чуть вперед
                        
                        container.add(handleMesh);
                    }
                }
            }
        }
        
        // --- 5. Ручка Gola (Твой код) ---
        if (handleType === 'gola-profile') {
             // L-профиль сверху
             // Важно: Gola создается ОТДЕЛЬНО от фасада (крепится к корпусу), поэтому group.add
             const golaProfileMesh = createGolaProfileMesh(width, golaMaterial, `golaProfile_Dishwasher`, cabinetUUID);
             if (golaProfileMesh) {
                 golaProfileMesh.rotation.y = Math.PI / 2;
                 const golaTopCenterY = height / 2 - 58 / 1000; 
                 const golaTopCenterZ = depth / 2;
                 golaProfileMesh.position.set(0, golaTopCenterY, golaTopCenterZ);
                 group.add(golaProfileMesh);
             }
        }
    }


    // --- 5. Создание верхней перемычки (условно) ---
    // Условие: высота столешницы из глобальных параметров > 840мм
    const bottomCountrtopLevel = kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness;
    if (bottomCountrtopLevel > 838) {
        console.log(`[Dishwasher] Создание перемычки, т.к. высота до столешницы ${bottomCountrtopLevel} > 838`);

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
 * СОЗДАЕТ ДЕТАЛИЗИРОВАННУЮ ГЕОМЕТРИЮ ДЛЯ ФАЛЬШ-ПАНЕЛИ
 * @param {object} cabinetData - Объект данных шкафа (с cabinetConfig === 'falsePanel').
 * @returns {THREE.Group | null} Группа с деталями фальш-панели или null.
 */
export function createDetailedFalsePanelGeometry(cabinetData, kitchenGlobalParams, MaterialManager, getPanelThickness) {
    if (cabinetData.cabinetConfig !== 'falsePanel') return null;

    const group = new THREE.Group();
    group.userData.isDetailedCabinet = true;
    group.userData.objectType = 'cabinet';
    const cabinetUUID = cabinetData.mesh?.uuid || THREE.MathUtils.generateUUID();
    
    // 1. Материалы
    const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
    const { material: baseFacadeMaterial, thickness: baseTh } = MaterialManager.getMaterial(facadeSet);
    const cabinetMaterial = MaterialManager.getBodyMaterial(cabinetData);

    // 2. Стратегия
    let buildStrategy = 'flat';
    let profileData = null;
    let finalMaterial = baseFacadeMaterial;
    let finalThickness = baseTh;

    if (window.facadeOptionsData['mdf_milled']) {
         const decor = window.facadeOptionsData['mdf_milled'].decors.find(d => d.value === facadeSet?.texture);
         if (decor && decor.profileType === '9slice') {
             buildStrategy = 'milled';
             profileData = decor;
             const lodData = decor.lod?.full || decor.lod?.simple || decor.models;
             finalThickness = (lodData.edgeThickness || 19) / 1000;
         }
    }

    // 3. Параметры
    const fpType = cabinetData.fp_type || 'narrow';
    const heightM = cabinetData.height;
    const depthM = cabinetData.depth;
    
    // Ориентация для узких панелей
    const side = cabinetData.fp_side || 'left';

    if (heightM <= 0) return null;

    // === ВАРИАНТ A: УЗКАЯ / ДЕКОРАТИВНАЯ (Одна панель, повернутая) ===
    if (fpType === 'narrow' || fpType === 'decorativePanel') {
        const container = new THREE.Group();
        container.userData.cabinetUUID = cabinetUUID;
        
        // Позиция: Центр 0,0,0
        // Поворот:
        if (side === 'left') container.rotation.y = -Math.PI / 2;
        else container.rotation.y = Math.PI / 2;
        
        group.add(container);
        
        // Размеры "фасада": Ширина = Глубина шкафа. Высота = Высота шкафа.
        const facadeW = depthM;
        const facadeH = heightM;

        if (buildStrategy === 'milled') {
            createMilledFacade(facadeW, facadeH, profileData, finalMaterial.clone())
                .then(mesh => {
                    container.add(mesh);
                    mesh.updateMatrixWorld();
                });
        } else {
            // Плоский (создаем фронтально внутри повернутого контейнера)
            const mesh = createPanel(facadeW, facadeH, finalThickness, finalMaterial.clone(), 'frontal', `fp_${fpType}`);
            if (mesh) {
                if (mesh.material.map) MaterialManager.applyTextureTransform(mesh.material, cabinetData.textureDirection || 'vertical', facadeW, facadeH);
                container.add(mesh);
            }
        }
    } 
    
    // === ВАРИАНТ B: ШИРОКАЯ (Две детали: Лицо + Держатель) ===
    else if (fpType === 'wideLeft' || fpType === 'wideRight') {
        const facadeGapMeters = cabinetData.facadeGap || 0.003;
        const facadeGapOffset = facadeGapMeters / 2;
        
        // 1. Лицевая часть (Фасад)
        const facadeW = cabinetData.width - facadeGapOffset;
        const facadeH = heightM;
        
        const container = new THREE.Group();
        container.userData.cabinetUUID = cabinetUUID;

        // Позиция X
        const containerWidth = cabinetData.width;
        let centerX = 0;
        if (fpType === 'wideLeft') centerX = -(containerWidth / 2) + (facadeW / 2);
        else centerX = (containerWidth / 2) - (facadeW / 2);
        
        // Позиция Z: Держатель (глубиной depthM) стоит по центру Z=0.
        // Фасад стоит перед держателем.
        // Держатель занимает от -depth/2 до +depth/2.
        // Фасад должен быть прижат к +depth/2?
        // Обычно фасад стоит на одном уровне с фасадами соседних шкафов.
        // Соседние шкафы имеют фасад на Z = depth/2 + thick/2.
        // Значит и наш фасад ставим туда же.
        const centerZ = depthM / 2 + finalThickness / 2;
        
        container.position.set(centerX, 0, centerZ);
        group.add(container);

        if (buildStrategy === 'milled') {
            createMilledFacade(facadeW, facadeH, profileData, finalMaterial.clone())
                .then(mesh => {
                    container.add(mesh);
                    mesh.updateMatrixWorld();
                });
        } else {
            const mesh = createPanel(facadeW, facadeH, finalThickness, finalMaterial.clone(), 'frontal', `fp_${fpType}`);
            if (mesh) {
                if (mesh.material.map) MaterialManager.applyTextureTransform(mesh.material, cabinetData.textureDirection || 'vertical', facadeW, facadeH);
                container.add(mesh);
            }
        }

        // 2. Держатель (Корпус) - Всегда плоский
        const holderThick = getPanelThickness(); // Толщина материала корпуса
        const holderH = heightM;
        const holderD = depthM; // Глубина держателя = глубина шкафа (или меньше?)
        // Обычно держатель - это боковина корпуса.

        const holderMesh = createPanel(holderThick, holderH, holderD, cabinetMaterial, 'vertical', `holder_${fpType}`);
        if (holderMesh) {
            // Позиция:
            let holderX = 0;
            if (fpType === 'wideLeft') holderX = (containerWidth / 2) - (holderThick / 2); // Справа
            else holderX = -(containerWidth / 2) + (holderThick / 2); // Слева
            
            holderMesh.position.set(holderX, 0, 0); // Центр по Z
            holderMesh.userData.cabinetUUID = cabinetUUID;
            
            // Текстура корпуса
            if (holderMesh.material.map) MaterialManager.applyTextureTransform(holderMesh.material, 'vertical', holderD, holderH);

            group.add(holderMesh);
        }
    }

    return group.children.length > 0 ? group : null;
}

/**
 * Создает THREE.Group, представляющую детализированную модель шкафа
 * для встроенного холодильника.
 * @param {object} cabinetData - Объект шкафа из массива 'cabinets'.
 * @returns {THREE.Group | null} Группа со всеми частями шкафа или null при ошибке.
 */
export function createDetailedFridgeCabinetGeometry(cabinetData, kitchenGlobalParams, MaterialManager, getPanelThickness) {

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

            if (leftSideMesh_fridge.material.map && leftSideMesh_fridge.material.map.isTexture) {
                MaterialManager.applyTextureTransform(
                    leftSideMesh_fridge.material,
                    'vertical',
                    leftSideDepth_fridge,
                    leftSideHeight_fridge
                );
            }

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

            if (rightSideMesh_fridge.material.map && rightSideMesh_fridge.material.map.isTexture) {
                MaterialManager.applyTextureTransform(
                    rightSideMesh_fridge.material,
                    'vertical',
                    rightSideDepth_fridge,
                    rightSideHeight_fridge
                );
            }

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

    // === ПРОВЕРКА НА ФРЕЗЕРОВКУ ===
    //const facadeSet = window.facadeSetsData.find(set => set.id === cabinetData.facadeSet);
    const { material: baseFacadeMaterial, thickness: facadeThicknessMeters } = MaterialManager.getMaterial(facadeSet); // Старое имя переменной
    
    let isMilled = false;
    let profileData = null;
    let milledMaterial = baseFacadeMaterial;
    let milledThickness = facadeThicknessMeters;

    if (window.facadeOptionsData['mdf_milled']) {
        const decor = window.facadeOptionsData['mdf_milled'].decors.find(d => d.value === facadeSet?.texture);
        if (decor && decor.profileType === '9slice') {
            isMilled = true;
            profileData = decor;
            milledThickness = (decor.lod?.full?.edgeThickness || 19) / 1000;
        }
    }
    // =============================

    facadesCreationData.forEach((facadeInfo, index) => {
        const facadeHeightM = facadeInfo.heightMm / 1000;
        if (facadeHeightM <= 0.01) return;

        // Расчет позиции (как было у тебя)
        const posX = 0;
        const posY = currentY_bottom_plane_of_facade + facadeHeightM / 2;
        // Для фрезеровки используем milledThickness, для плоского - facadeThicknessMeters
        const posZ = cabDepthM / 2 + (isMilled ? milledThickness : facadeThicknessMeters) / 2;

        if (isMilled) {
            // === ВАРИАНТ 1: ФРЕЗЕРОВКА ===
            const container = new THREE.Group();
            container.position.set(posX, posY, posZ);
            container.userData.cabinetUUID = cabinetUUID;
            group.add(container);

            createMilledFacade(facadeWidth_B8, facadeHeightM, profileData, milledMaterial.clone())
                .then(mesh => {
                    container.add(mesh);
                    mesh.updateMatrixWorld();
                });

        } else {
            // === ВАРИАНТ 2: ТВОЙ СТАРЫЙ РАБОЧИЙ КОД (ПЛОСКИЙ + РУЧКИ) ===
            // (Я просто копирую твой код из сообщения выше)
            
            const facadeMaterial = baseFacadeMaterial.clone();
            const facadeMesh = createPanel(
                facadeWidth_B8,
                facadeHeightM,
                facadeThicknessMeters,
                facadeMaterial,
                'frontal',
                `facade_${facadeInfo.nameSuffix}_fridge_${cabinetUUID.substring(0,4)}`
            );

            if (facadeMesh) {
                // Позиционирование (Твое)
                facadeMesh.position.x = posX;
                facadeMesh.position.y = posY;
                facadeMesh.position.z = posZ;

                facadeMesh.userData.cabinetUUID = cabinetUUID;
                facadeMesh.userData.isFacade = true;

                if (facadeMesh.material.map && facadeMesh.material.map.isTexture) {
                    MaterialManager.applyTextureTransform(
                        facadeMesh.material,
                        textureDirection_B8,
                        facadeWidth_B8,
                        facadeHeightM
                    );
                }
                group.add(facadeMesh);

                // --- Ручка TV9 (Твой код без изменений) ---
                if (facadeInfo.needsTB9HandleAt !== 'none') {
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
                    let handleGeometry_tv9 = new THREE.ExtrudeGeometry(handleShape_tv9, handleExtrudeSettings_tv9);
                    handleGeometry_tv9.translate(0, 0, -handleLength_tv9 * 1000 / 2);
                    handleGeometry_tv9.scale(1 / 1000, 1 / 1000, 1 / 1000);

                    const handleMesh_tv9 = new THREE.Mesh(handleGeometry_tv9, golaMaterial.clone());
                    handleMesh_tv9.rotation.y = Math.PI / 2;

                    handleMesh_tv9.position.x = facadeMesh.position.x;
                    handleMesh_tv9.position.z = facadeMesh.position.z - facadeThicknessMeters / 2;

                    if (facadeInfo.needsTB9HandleAt === 'top') {
                        const yTopOfFacade = facadeMesh.position.y + facadeHeightM / 2;
                        handleMesh_tv9.position.y = yTopOfFacade;
                    } else { 
                        handleMesh_tv9.rotation.z = Math.PI; 
                        const yBottomOfFacade = facadeMesh.position.y - facadeHeightM / 2;
                        handleMesh_tv9.position.y = yBottomOfFacade; 
                    }
                    group.add(handleMesh_tv9);
                }
            }
        }

        // Обновляем Y для следующего фасада
        currentY_bottom_plane_of_facade += facadeHeightM + facadeGapM_B8;
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