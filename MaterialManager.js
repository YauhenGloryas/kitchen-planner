// MaterialManager.js
import * as THREE from 'three';

// Кэш для загруженных текстур, чтобы не загружать одну и ту же несколько раз
const textureCache = new Map();
const loader = new THREE.TextureLoader();

/**
 * Загружает и кэширует текстуру.
 * @param {string} path - Путь к файлу текстуры.
 * @returns {THREE.Texture}
 */
export function loadTexture(path) {
    if (textureCache.has(path)) {
        return textureCache.get(path);
    }
    const texture = loader.load(
        path,
        (tex) => {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.needsUpdate = true;
            if (window.requestRender) window.requestRender();
        },
        undefined,
        (err) => {
            console.error(`Ошибка загрузки текстуры ${path}:`, err);
        }
    );
    textureCache.set(path, texture);
    return texture;
}


/**
 * Главная функция для создания PBR материала на основе настроек.
 * @param {object} setData - Объект настроек из facadeSetsData (e.g., { materialType, texture, color }).
 * @returns {{material: THREE.Material, thickness: number}}
 */
export function getMaterial(setData) {
    const defaultThicknessMeters = 18 / 1000;
    const defaultMaterial = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, name: "DefaultWhite" });

    if (!setData) {
        return { material: defaultMaterial, thickness: defaultThicknessMeters };
    }
    
    const loadedFacadeData = window.facadeOptionsData || {};
    const materialInfo = loadedFacadeData[setData.materialType] || {};
    const thicknessMeters = (setData.thickness || materialInfo.defaultThickness || 18) / 1000;

    let material;

    try {
        if (materialInfo.useColorPicker) {
            // --- Логика для материалов с выбором цвета (остается без изменений) ---
            material = new THREE.MeshStandardMaterial({
                color: setData.color || '#ffffff',
                name: `Mat_${setData.materialType}_${setData.color}`,
                roughness: materialInfo.roughness ?? 0.5,
                metalness: materialInfo.metalness ?? 0.1,
            });
        } else {
            // --- ОБНОВЛЕННАЯ Логика для материалов с декорами/текстурами ---
            const selectedDecor = materialInfo.decors?.find(d => d.value === setData.texture);
            if (!selectedDecor) {
                // ... (код для случая, если декор не найден - без изменений)
            }

            // --- 1. Создаем объект со свойствами материала ---
            // Сначала добавляем базовые свойства из JSON
            const materialProperties = {
                color: selectedDecor.baseColor || '#BBBBBB',
                name: `Mat_${setData.materialType}_${setData.texture}`,
                roughness: selectedDecor.roughness ?? 0.8,
                metalness: selectedDecor.metalness ?? 0.1,
                envMapIntensity: 0.3,
            };

            // --- 2. Добавляем основную текстуру (map) ---
            // Убираем старую "магию" с _XL, используем явный путь
            if (selectedDecor.textureImage) {
                materialProperties.map = loadTexture(selectedDecor.textureImage);
            }

            // --- 3. Добавляем ДОПОЛНИТЕЛЬНЫЕ карты (normalMap, roughnessMap), если они есть ---
            if (selectedDecor.normalMap) {
                materialProperties.normalMap = loadTexture(selectedDecor.normalMap);
            }
            if (selectedDecor.roughnessMap) {
                materialProperties.roughnessMap = loadTexture(selectedDecor.roughnessMap);
                materialProperties.roughness = 1.0; 
            }
            if (selectedDecor.bumpMap) {
                materialProperties.bumpMap = loadTexture(selectedDecor.bumpMap);
                // bumpScale можно задать прямо в JSON или использовать дефолт
                materialProperties.bumpScale = selectedDecor.bumpScale ?? 0.005; 
            }
            
            // --- 4. Создаем финальный материал ---
            if (materialProperties.map) {
                // Если есть хотя бы основная текстура
                material = new THREE.MeshStandardMaterial(materialProperties);
            } else {
                // Если текстур нет вообще (декор - это просто цвет)
                material = new THREE.MeshStandardMaterial({
                    color: selectedDecor.displayColor || '#cccccc',
                    name: `Mat_NoTexture_${setData.texture}`,
                    roughness: selectedDecor.roughness ?? 0.8,
                    metalness: selectedDecor.metalness ?? 0.1,
                });
            }
        }
    } catch (error) {
        console.error("Ошибка при создании материала:", error);
        material = defaultMaterial;
    }

    return { material, thickness: thicknessMeters };
}

/**
 * Создает материал для цоколя.
 * @param {object} materialData - Объект с данными (из меню или JSON).
 */
export function getPlinthMaterial(materialData) {
    const defaultMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF });
    if (!materialData) return defaultMat;

    // 1. Спец. цвета (пластик)
    if (materialData.isSolid) {
        return new THREE.MeshStandardMaterial({
            color: materialData.color,
            roughness: materialData.roughness ?? 0.6,
            metalness: materialData.metalness ?? 0.0
        });
    }

    // 2. Материал из базы фасадов (Текстура)
    if (materialData.textureImage) {
        // Используем твою функцию getMaterial, но она ожидает { materialType, texture ... }
        // А у нас уже есть готовый объект декора.
        // Можем просто загрузить текстуру напрямую.
        
        const texture = loadTexture(materialData.textureImage);
        // Клонируем для настроек
        const map = texture.clone();
        map.needsUpdate = true;
        map.wrapS = THREE.RepeatWrapping;
        map.wrapT = THREE.RepeatWrapping;
        
        // Цоколь всегда горизонтальный.
        // Если текстура "вертикальная" (древесные волокна вверх), её надо повернуть на 90,
        // чтобы волокна шли вдоль длинного цоколя.
        // Обычно текстуры фасадов вертикальные.
        map.rotation = -Math.PI / 2; 
        map.center.set(0.5, 0.5);

        return new THREE.MeshStandardMaterial({
            map: map,
            color: materialData.baseColor || '#ffffff', // Подмешиваем цвет, если есть
            roughness: materialData.roughness ?? 0.6
        });
    }

    // 3. Если нет текстуры, но есть цвет (Униколоры из базы фасадов)
    if (!materialData.textureImage && (materialData.displayColor || materialData.baseColor)) {
        return new THREE.MeshStandardMaterial({
            color: materialData.displayColor || materialData.baseColor,
            roughness: materialData.roughness ?? 0.65,
            metalness: materialData.metalness ?? 0.0
        });
    }

    return defaultMat;
}


/**
 * Возвращает простой цветной материал для упрощенного отображения.
 * @param {object} setData - Объект настроек из facadeSetsData.
 * @returns {THREE.Material}
 */
export function getFallbackMaterial(setData) {
    if (!setData) {
        return new THREE.MeshStandardMaterial({ color: 0xcccccc }); // Серый по умолчанию
    }

    const loadedFacadeData = window.facadeOptionsData || {};
    const materialInfo = loadedFacadeData[setData.materialType] || {};

    if (materialInfo.useColorPicker) {
        return new THREE.MeshStandardMaterial({ color: setData.color || '#ffffff' });
    } else {
        const selectedDecor = materialInfo.decors?.find(d => d.value === setData.texture);
        return new THREE.MeshStandardMaterial({ color: selectedDecor?.displayColor || '#cccccc' });
    }
}


/**
 * Применяет трансформации ко ВСЕМ картам материала фасада.
 * @param {THREE.Material} material - Материал фасада.
 * @param {THREE.Texture} originalTexture - Оригинальная текстура для клонирования.
 * @param {string} direction - 'vertical' или 'horizontal'.
 * @param {number} objectWidth - Ширина объекта в метрах.
 * @param {number} objectHeight - Высота объекта в метрах.
 * @returns {THREE.Texture | null} Новая текстура или null.
 */
export function applyTextureTransform(material, direction, objectWidth, objectHeight) {
    if (!material || !material.map || !material.map.isTexture) {
        return; // Выходим, если нет основной карты
    }

    // 1. Рассчитываем параметры
    const textureSheetWidth = 1.3;
    const textureSheetHeight = 2.8;
    let rotation, repeat;
    if (direction === 'horizontal') {
        rotation = -Math.PI / 2;
        repeat = new THREE.Vector2(objectHeight / textureSheetWidth, objectWidth / textureSheetHeight);
    } else { // vertical
        rotation = 0;
        repeat = new THREE.Vector2(objectWidth / textureSheetWidth, objectHeight / textureSheetHeight);
    }
    const offset = new THREE.Vector2(Math.random() * 0.5, Math.random() * 0.3);
    //const offset = new THREE.Vector2(0, 0);
    const center = new THREE.Vector2(0.5, 0.5);

    // 2. Обрабатываем каждую карту ПО ОТДЕЛЬНОСТИ и ЯВНО
    
    // --- Основная карта (map) ---
    if (material.map && material.map.isTexture) {
        material.map = material.map.clone(); // Клонируем
        
        // Применяем все трансформации
        material.map.needsUpdate = true;
        material.map.wrapS = THREE.RepeatWrapping;
        material.map.wrapT = THREE.RepeatWrapping;
        material.map.center.copy(center);
        material.map.offset.copy(offset);
        material.map.rotation = rotation;
        material.map.repeat.copy(repeat);
    }

    // --- Карта нормалей (normalMap) ---
    if (material.normalMap && material.normalMap.isTexture) {
        material.normalMap = material.normalMap.clone();
        
        material.normalMap.needsUpdate = true;
        material.normalMap.wrapS = THREE.RepeatWrapping;
        material.normalMap.wrapT = THREE.RepeatWrapping;
        material.normalMap.center.copy(center);
        material.normalMap.offset.copy(offset); // То же смещение, что и у map
        material.normalMap.rotation = rotation;  // Тот же поворот
        material.normalMap.repeat.copy(repeat);  // Тот же repeat
    }
    
    // --- Карта шероховатости (roughnessMap) ---
    if (material.roughnessMap && material.roughnessMap.isTexture) {
        material.roughnessMap = material.roughnessMap.clone();
        
        material.roughnessMap.needsUpdate = true;
        material.roughnessMap.wrapS = THREE.RepeatWrapping;
        material.roughnessMap.wrapT = THREE.RepeatWrapping;
        material.roughnessMap.center.copy(center);
        material.roughnessMap.offset.copy(offset);
        material.roughnessMap.rotation = rotation;
        material.roughnessMap.repeat.copy(repeat);
    }
    
     if (material.bumpMap && material.bumpMap.isTexture) {
        material.bumpMap = material.bumpMap.clone();
        
        material.bumpMap.needsUpdate = true;
        material.bumpMap.wrapS = THREE.RepeatWrapping;
        material.bumpMap.wrapT = THREE.RepeatWrapping;
        material.bumpMap.center.copy(center);

        // ВАЖНО: bumpScale не трогаем, а вот трансформации применяем
        material.bumpMap.offset.copy(offset);
        material.bumpMap.rotation = rotation;
        material.bumpMap.repeat.copy(repeat);
    }
    
    material.needsUpdate = true;
}

/**
 * Создает материал для КОРПУСА шкафа.
 * @param {object} cabinetData - Данные конкретного шкафа.
 * @returns {THREE.Material}
 */
export function getBodyMaterial(cabinetData) {
    const loadedFacadeData = window.facadeOptionsData || {};
    const materialInfo = loadedFacadeData['ldsp']; // Всегда ЛДСП
    if (!materialInfo) return new THREE.MeshStandardMaterial({ color: 0xcccccc });

    const selectedDecorValue = cabinetData.bodyMaterial || 'W960SM';
    const selectedDecor = materialInfo.decors?.find(d => d.value === selectedDecorValue);
    if (!selectedDecor) return new THREE.MeshStandardMaterial({ color: 0xcccccc });

    // --- ИСПРАВЛЕННАЯ ЛОГИКА ---
    // Используем новое поле textureImage, если оно есть
    if (selectedDecor.textureImage) {
        const texture = loadTexture(selectedDecor.textureImage); // <-- Берем правильный путь
        
        // Создаем PBR-материал со всеми картами
        const materialProperties = {
            map: texture,
            color: selectedDecor.baseColor || '#BBBBBB',
            roughness: selectedDecor.roughness ?? 0.8,
            metalness: selectedDecor.metalness ?? 0.1,
        };
        
        // Добавляем доп. карты, если они есть
        // if (selectedDecor.normalMap) {
        //     materialProperties.normalMap = loadTexture(selectedDecor.normalMap);
        // }
        // if (selectedDecor.roughnessMap) {
        //     materialProperties.roughnessMap = loadTexture(selectedDecor.roughnessMap);
        //     materialProperties.roughness = 1.0;
        // }
        // if (selectedDecor.bumpMap) {
        //     materialProperties.bumpMap = loadTexture(selectedDecor.bumpMap);
        //     materialProperties.bumpScale = selectedDecor.bumpScale ?? 0.005;
        // }

        return new THREE.MeshStandardMaterial(materialProperties);

    } else {
        // Если текстуры нет, возвращаем простой цветной материал
        return new THREE.MeshStandardMaterial({
            color: selectedDecor.displayColor || '#cccccc',
            roughness: selectedDecor.roughness ?? 0.8,
            metalness: selectedDecor.metalness ?? 0.1,
        });
    }
}

/**
 * Создает PBR материал(ы) для столешницы.
 * @param {object} materialInfo - Объект с данными о материале из JSON для столешниц.
 * @param {string} countertopType - ТИП столешницы ('postforming', 'compact-plate', 'quartz').
 * @returns {THREE.Material | Array<THREE.Material>}
 */
export function createCountertopMaterial(materialInfo, countertopType) {
    const defaultMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    if (!materialInfo) return defaultMaterial;

    let mainMaterial;

    // --- ОБНОВЛЕННАЯ ЛОГИКА СОЗДАНИЯ PBR МАТЕРИАЛА ---
    if (materialInfo.textureImage) {
        // --- Вариант 1: Материал с текстурой ---
        const materialProperties = {
            map: loadTexture(materialInfo.textureImage),
            color: materialInfo.baseColor || '#BBBBBB',
            roughness: materialInfo.roughness ?? 0.7,
            metalness: materialInfo.metalness ?? 0.0,
        };
        
        // Добавляем доп. карты, если они есть
        if (materialInfo.normalMap) {
            materialProperties.normalMap = loadTexture(materialInfo.normalMap);
        }
        if (materialInfo.roughnessMap) {
            materialProperties.roughnessMap = loadTexture(materialInfo.roughnessMap);
            materialProperties.roughness = 1.0;
        }
        if (materialInfo.bumpMap) {
            materialProperties.bumpMap = loadTexture(materialInfo.bumpMap);
            materialProperties.bumpScale = materialInfo.bumpScale ?? 0.005;
        }

        mainMaterial = new THREE.MeshStandardMaterial(materialProperties);

    } else {
        // --- Вариант 2: Материал - просто цвет ---
        mainMaterial = new THREE.MeshStandardMaterial({
            color: materialInfo.value, // Предполагаем, что value хранит цвет, e.g., '#ffffff'
            roughness: materialInfo.roughness ?? 0.7,
            metalness: materialInfo.metalness ?? 0.0,
        });
    }

    // Логика для компакт-плиты остается без изменений
    if (countertopType === 'compact-plate') {
        const blackMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
        // Для ExtrudeGeometry: [0] - крышки, [1] - боковины
        return [
            mainMaterial,   // [0] - передняя и задняя "крышки" (верх и низ столешницы)
            blackMaterial   // [1] - боковые стенки экструзии (торцы столешницы)
        ];
    }

    return mainMaterial;
}

/**
 * Главная функция для корректного наложения текстуры на меш.
 * Использует простой метод масштабирования, но делает это централизованно.
 * @param {THREE.Mesh} mesh - Меш, который нужно текстурировать.
 * @param {string} textureDirection - 'vertical' или 'horizontal' из данных шкафа.
 * @param {string} partOrientation - 'horizontal', 'vertical', 'frontal' из createPanel.
 */
export function applyTexture(mesh, textureDirection, partOrientation) {
    // 1. Проверка, есть ли текстура
    if (!mesh || !mesh.material || !mesh.material.map || !mesh.material.map.isTexture) {
        return;
    }

    // 2. Клонируем текстуру, чтобы иметь уникальный экземпляр для каждой детали
    const texture = mesh.material.map.clone();
    texture.needsUpdate = true; // Важно для клонированной текстуры

    // 3. Устанавливаем свойства текстуры
    texture.offset.set(Math.random(), Math.random()); // Случайное смещение, чтобы детали не выглядели одинаково
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.center.set(0.5, 0.5); // Вращение вокруг центра
    
    // 4. Размеры "листа" текстуры в метрах (можно вынести в константы)
    const textureSheetWidth = 1.3;
    const textureSheetHeight = 2.8;

    // 5. Получаем реальные размеры детали, независимо от ее типа геометрии
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    
    // Определяем размеры для расчета repeat в зависимости от ориентации
    let detailWidth, detailHeight;
    if (partOrientation === 'horizontal') {
        // Для горизонтальной детали "ширина" - это X, "высота" - это Z
        detailWidth = size.x;
        detailHeight = size.z;
    } else if (partOrientation === 'vertical') {
        // Для вертикальной "ширина" - это Z, "высота" - это Y
        detailWidth = size.z;
        detailHeight = size.y;
    } else { // 'frontal'
        // Для фронтальной "ширина" - это X, "высота" - это Y
        detailWidth = size.x;
        detailHeight = size.y;
    }
    
    // 6. Определяем финальное направление текстуры
    let finalDirection = textureDirection || 'vertical';
    // Ваше правило: для горизонтальных деталей - всегда горизонтально
    if (partOrientation === 'horizontal') {
        finalDirection = 'horizontal';
    }

    // 7. Рассчитываем и устанавливаем repeat и rotation
    if (finalDirection === 'horizontal') {
        texture.rotation = -Math.PI / 2;
        // "Высота" детали (которая теперь идет вдоль) ложится на "длину" листа (W).
        // "Ширина" детали ложится на "ширину" листа (H).
        texture.repeat.set(detailHeight / textureSheetWidth, detailWidth / textureSheetHeight);
    } else { // vertical
        texture.rotation = 0;
        texture.repeat.set(detailWidth / textureSheetWidth, detailHeight / textureSheetHeight);
    }

    // 8. Присваиваем новую, настроенную текстуру материалу
    mesh.material.map = texture;
    mesh.material.needsUpdate = true;
}

/**
 * Корректно накладывает и масштабирует ВСЕ КАРТЫ для ExtrudeGeometry.
 * @param {THREE.Mesh} mesh
 * @param {string} partOrientation
 * @param {number} shapeWidth
 * @param {number} shapeHeight
 * @param {THREE.Material} [targetMaterial=null] - Опционально, для массивов материалов.
 */
export function applyTextureToExtruded(mesh, partOrientation, shapeWidth, shapeHeight, targetMaterial = null) {
    const material = targetMaterial || mesh.material;
    
    if (!material || !material.map || !material.map.isTexture) return;
    if (!mesh || mesh.geometry.type !== 'ExtrudeGeometry') return;
    
    const geometry = mesh.geometry;
    const uvAttribute = geometry.attributes.uv;
    if (!uvAttribute || shapeWidth <= 0 || shapeHeight <= 0) return;

    // --- 1. Модификация UV-атрибута (остается без изменений) ---
    // (Этот блок уже работает правильно, мы его не трогаем)
    const textureSheetLength = 2.8;
    const textureSheetWidth = 1.3;
    let scaleU, scaleV;
    if (partOrientation === 'horizontal') {
        scaleU = shapeWidth / textureSheetLength;
        scaleV = shapeHeight / textureSheetWidth;
    } else {
        scaleU = shapeWidth / textureSheetWidth;
        scaleV = shapeHeight / textureSheetLength;
    }
    const randomU = Math.random();
    const randomV = Math.random();
    for (let i = 0; i < uvAttribute.count; i++) {
        const u = uvAttribute.getX(i);
        const v = uvAttribute.getY(i);
        const normalizedU = u / shapeWidth;
        const normalizedV = v / shapeHeight;
        uvAttribute.setXY(i, (normalizedU * scaleU) + randomU, (normalizedV * scaleV) + randomV);
    }
    uvAttribute.needsUpdate = true;
    
    // --- 2. НОВЫЙ БЛОК: Синхронная настройка ВСЕХ текстур материала ---
    const rotation = (partOrientation === 'horizontal') ? -Math.PI / 2 : 0;
    const offset = new THREE.Vector2(randomU, randomV); // Используем то же смещение, что и для UV!
    const center = new THREE.Vector2(0.5, 0.5);

    // Проходимся по всем возможным картам
    ['map', 'normalMap', 'roughnessMap', 'bumpMap'].forEach(mapType => {
        if (material[mapType] && material[mapType].isTexture) {
            // Клонируем каждую карту
            material[mapType] = material[mapType].clone();
            const texture = material[mapType];
            
            texture.needsUpdate = true;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.center.copy(center);
            texture.offset.copy(offset); // Применяем одинаковое смещение
            texture.rotation = rotation;  // Применяем одинаковый поворот
            
            // ВАЖНО: .repeat для ExtrudeGeometry НЕ ТРОГАЕМ!
            // Масштаб уже задан через UV-атрибут. Установка repeat его "сломает".
            // texture.repeat.set(1, 1); // Можно принудительно сбросить, на всякий случай.
        }
    });
    
    material.needsUpdate = true;
    console.log(`ApplyTexture (Extrude): UV и ВСЕ карты для "${mesh.name}" пересчитаны.`);
}

/**
 * Применяет и масштабирует текстуру для столешниц.
 * @param {THREE.Mesh} countertop 
 */
export function updateCountertopTexture(countertop) {
    if (!countertop || !countertop.userData.materialId) return;

    const materialInfo = window.countertopOptionsData.find(m => m.id === countertop.userData.materialId);
    if (!materialInfo || !materialInfo.textureImage) return;

    // Размеры "листа" текстуры в метрах
    const textureSheetLength = 2.8; // Длинная сторона
    const textureSheetWidth = 1.3;  // Короткая сторона

    // Размеры столешницы
    const countertopLength = countertop.userData.length;
    const countertopDepth = countertop.userData.depth;

    const applyTransform = (material) => {
        if (!material) return;

        // --- НОВАЯ, ПРАВИЛЬНАЯ ЛОГИКА ТРАНСФОРМАЦИИ ---

        // 1. Рассчитываем параметры трансформации
        const rotation = Math.PI / 2; // Поворачиваем текстуру на 90 градусов
        const center = new THREE.Vector2(0.5, 0.5);
        const offset = new THREE.Vector2(Math.random(), Math.random());
        
        // После поворота на 90 градусов:
        // - Ось U текстуры (repeat.x) идет вдоль ГЛУБИНЫ столешницы (Z).
        // - Ось V текстуры (repeat.y) идет вдоль ДЛИНЫ столешницы (X).
        // Мы хотим, чтобы длинная сторона текстуры (textureSheetLength) шла вдоль длины столешницы.
        const repeat = new THREE.Vector2(
            countertopDepth / textureSheetWidth,  // repeat.x = глубина / короткая сторона
            countertopLength / textureSheetLength // repeat.y = длина / длинная сторона
        );
        
        // 2. Применяем эти параметры ко всем картам в материале
        ['map', 'normalMap', 'roughnessMap', 'bumpMap'].forEach(mapType => {
            if (material[mapType] && material[mapType].isTexture) {
                material[mapType] = material[mapType].clone();
                const texture = material[mapType];
                
                texture.needsUpdate = true;
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.center.copy(center);
                texture.offset.copy(offset);
                texture.rotation = rotation;
                texture.repeat.copy(repeat);
            }
        });
        material.needsUpdate = true;
    };

    // Применяем трансформацию (без изменений)
    if (Array.isArray(countertop.material)) {
        // Для compact-plate текстурируем ПЕРВЫЙ материал (крышки)
        applyTextureToExtruded(countertop, 'horizontal', countertopLength, countertopDepth, countertop.material[0]);
    } else {
        applyTransform(countertop.material);
    }
}

/**
 * Получает материал для фартука.
 * @param {object} materialData - { id: string, type: 'panel'|'tiles' }
 * @param {string} layoutDirection - 'horizontal' | 'vertical' (влияет на поворот текстуры плитки)
 */
export function getApronMaterial(materialData, layoutDirection = 'horizontal') {
    const defaultMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
    if (!materialData || !materialData.id) return defaultMat;

    // 1. Скиналь (без изменений)
    if (materialData.type === 'panel') {
        const decor = window.countertopOptionsData?.find(d => d.id === materialData.id);
        if (!decor) return defaultMat;
        return createCountertopMaterial(decor, 'postforming'); 
    }

    // 2. Плитка
    if (materialData.type === 'tiles') {
        const decor = window.tilesOptionsData?.find(d => d.id === materialData.id);
        if (!decor) return defaultMat;

        const baseParams = {
            color: decor.baseColor || '#ffffff',
            roughness: decor.roughness ?? 0.5,
            metalness: decor.metalness ?? 0.0
        };

        // --- ВАРИАНТ А: МИКС ТЕКСТУР ---
        if (decor.textureVariants && Array.isArray(decor.textureVariants)) {
            return decor.textureVariants.map(texturePath => {
                const texture = loadTexture(texturePath);
                const map = texture.clone();
                map.needsUpdate = true;
                map.wrapS = THREE.RepeatWrapping;
                map.wrapT = THREE.RepeatWrapping;
                map.center.set(0.5, 0.5);

                if (layoutDirection === 'vertical') {
                    map.rotation = Math.PI / 2;
                } else {
                    map.rotation = 0;
                }

                return new THREE.MeshStandardMaterial({
                    ...baseParams, // Здесь уже сидит правильный baseColor
                    map: map
                    // УБРАЛИ строчку: color: '#ffffff'
                });
            });
        }

        // --- ВАРИАНТ Б: ОДНА ТЕКСТУРА ---
        if (decor.textureImage) {
            const texture = loadTexture(decor.textureImage);
            const map = texture.clone();
            map.needsUpdate = true;
            map.wrapS = THREE.RepeatWrapping;
            map.wrapT = THREE.RepeatWrapping;
            map.center.set(0.5, 0.5);

            if (layoutDirection === 'vertical') {
                map.rotation = Math.PI / 2; 
            } else {
                map.rotation = 0;
            }
            
            baseParams.map = map;
            // УБРАЛИ строчку: baseParams.color = '#ffffff'; 
            // Теперь используется цвет, заданный при инициализации baseParams
        }
        return new THREE.MeshStandardMaterial(baseParams);
    }

    return defaultMat;
}

/**
 * Настраивает UV-координаты для ПЛИТКИ (с учетом обрезки).
 * Вместо создания кучи материалов, мы просто говорим геометрии:
 * "Бери только часть картинки".
 * 
 * @param {THREE.Mesh} mesh - Меш плитки
 * @param {number} actualW - Реальная (текущая) ширина плитки
 * @param {number} actualH - Реальная (текущая) высота плитки
 * @param {number} originalW - Исходная (полная) ширина плитки из настроек
 * @param {number} originalH - Исходная (полная) высота плитки из настроек
 */
export function mapTileUVs(mesh, actualW, actualH, originalW, originalH) {
    if (!mesh.geometry || !mesh.geometry.attributes.uv) return;

    const uvAttribute = mesh.geometry.attributes.uv;
    const count = uvAttribute.count;

    // Коэффициенты масштабирования UV (сколько процентов от оригинала мы видим)
    // Если плитка целая, ratio = 1. Если обрезана наполовину, ratio = 0.5
    const ratioU = actualW / originalW;
    const ratioV = actualH / originalH;

    // В ExtrudeGeometry UV по умолчанию накладываются от 0 до размера в мировых единицах,
    // либо нормализуются. Нам нужно получить чистые 0..1 для полной плитки.
    
    // Для Shape geometry (которая внутри Extrude), UV обычно идут по X/Y координатам shape.
    // Наша Shape центрирована в 0,0. Координаты вершин идут от -W/2 до +W/2.
    
    for (let i = 0; i < count; i++) {
        const x = mesh.geometry.attributes.position.getX(i);
        const y = mesh.geometry.attributes.position.getY(i);
        const z = mesh.geometry.attributes.position.getZ(i);

        // Игнорируем боковые грани (фаски/глубину), текстурируем только "лицо"
        // У ExtrudeGeometry лицо обычно имеет нормаль Z (или близкую к ней, если есть bevel)
        // Но проще проверить по Z координате. Передняя грань (после geometry.center()) будет при Z > 0
        // (Примерно половина глубины).
        
        // Но самый надежный способ для UV на плоскости XY:
        // Нормализуем координаты относительно размеров САМОЙ ПЛИТКИ (actualW/H)
        
        let u = (x / actualW) + 0.5; // -w/2 -> 0, +w/2 -> 1
        let v = (y / actualH) + 0.5; // -h/2 -> 0, +h/2 -> 1
        
        // А теперь самое важное:
        // Если плитка обрезана, то "1" по U должна соответствовать не краю текстуры,
        // а месту разреза.
        
        // Пример: Плитка 20см, обрезана до 10см (ratioU = 0.5).
        // Наша геометрия имеет ширину 10см. u идет от 0 до 1.
        // Но текстура должна быть показана только от 0 до 0.5.
        
        u = u * ratioU;
        v = v * ratioV;
        
        uvAttribute.setXY(i, u, v);
    }
    
    uvAttribute.needsUpdate = true;
}