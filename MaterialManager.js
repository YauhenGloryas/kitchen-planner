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
function loadTexture(path) {
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
 * Главная функция для создания материала на основе настроек.
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
            // --- Логика для материалов с выбором цвета (крашеный МДФ) ---
            material = new THREE.MeshStandardMaterial({
                color: setData.color || '#ffffff',
                name: `Mat_${setData.materialType}_${setData.color}`,
                roughness: materialInfo.roughness ?? 0.5,
                metalness: materialInfo.metalness ?? 0.1,
            });
        } else {
            // --- Логика для материалов с декорами/текстурами ---
            const selectedDecor = materialInfo.decors?.find(d => d.value === setData.texture);
            if (!selectedDecor) {
                console.warn(`Декор ${setData.texture} не найден. Используется цвет по умолчанию.`);
                return { 
                    material: new THREE.MeshStandardMaterial({ color: materialInfo.displayColor || '#cccccc' }),
                    thickness: thicknessMeters
                };
            }

            let texturePath = null;
            if (selectedDecor.previewImage) {
                const parts = selectedDecor.previewImage.split('/');
                const filenameWithExt = parts.pop();
                const baseName = filenameWithExt.split('.')[0];
                texturePath = `textures/xl/${baseName}_XL.jpg`; // Предполагаем jpg
            }

            if (texturePath) {
                const texture = loadTexture(texturePath);
                console.log("selectedDecor.baseColor = " + selectedDecor.baseColor);
                material = new THREE.MeshStandardMaterial({
                    map: texture,
                    color: selectedDecor.baseColor || '#BBBBBB',
                    name: `Mat_${setData.materialType}_${setData.texture}`,
                    roughness: selectedDecor.roughness ?? 0.8,
                    metalness: selectedDecor.metalness ?? 0.1,
                    envMapIntensity: 0.3,
                });
            } else { // Декор без текстуры (просто цвет)
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
 * СОЗДАЕТ И ВОЗВРАЩАЕТ НОВУЮ, клонированную и трансформированную текстуру.
 * @param {THREE.Texture} originalTexture - Оригинальная текстура для клонирования.
 * @param {string} direction - 'vertical' или 'horizontal'.
 * @param {number} objectWidth - Ширина объекта в метрах.
 * @param {number} objectHeight - Высота объекта в метрах.
 * @returns {THREE.Texture | null} Новая текстура или null.
 */
export function applyTextureTransform(originalTexture, direction, objectWidth, objectHeight) {
    if (!originalTexture || !originalTexture.isTexture) return null;

    // ==> ГЛАВНОЕ ИСПРАВЛЕНИЕ: Клонируем текстуру в самом начале <==
    const texture = originalTexture.clone();
    texture.needsUpdate = true; // Важно, чтобы three.js понял, что это новый ресурс

    const textureImageWidthMeters = 1.3;
    const textureImageHeightMeters = 2.8;

    texture.center.set(0.5, 0.5);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    if (direction === 'horizontal') {
        texture.rotation = -Math.PI / 2;
        texture.repeat.set(
            objectHeight / textureImageWidthMeters,
            objectWidth / textureImageHeightMeters
        );
    } else { // vertical
        texture.rotation = 0;
        texture.repeat.set(
            objectWidth / textureImageWidthMeters,
            objectHeight / textureImageHeightMeters
        );
    }

    return texture; // Возвращаем НОВЫЙ, уникальный экземпляр текстуры
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

    let texturePath = null;
    if (selectedDecor.previewImage) {
        const parts = selectedDecor.previewImage.split('/');
        const filename = parts.pop().split('.')[0];
        texturePath = `textures/xl/${filename}_XL.jpg`;
    }

    if (texturePath) {
        const texture = loadTexture(texturePath); // Используем наш кэширующий загрузчик
        return new THREE.MeshStandardMaterial({
            map: texture,
            color: selectedDecor.baseColor || '#BBBBBB',
            roughness: selectedDecor.roughness ?? 0.8,
            metalness: selectedDecor.metalness ?? 0.1,
        });
    } else {
        return new THREE.MeshStandardMaterial({
            color: selectedDecor.displayColor || '#cccccc',
            roughness: selectedDecor.roughness ?? 0.8,
            metalness: selectedDecor.metalness ?? 0.1,
        });
    }
}

/**
 * Создает материал(ы) для столешницы.
 * @param {object} materialInfo - Объект с данными о материале из JSON.
 * @param {string} countertopType - ТИП столешницы ('postforming', 'compact-plate', 'quartz').
 * @returns {THREE.Material | Array<THREE.Material>}
 */
export function createCountertopMaterial(materialInfo, countertopType) { // <== ИЗМЕНЕНИЕ: добавлен второй аргумент
    const defaultMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    if (!materialInfo) return defaultMaterial;

    let mainMaterial;
    if (materialInfo.materialType === 'texture') {
        const texture = loadTexture(materialInfo.value);
        mainMaterial = new THREE.MeshStandardMaterial({
            map: texture,
            color: materialInfo.baseColor || '#BBBBBB',
            roughness: 0.8, metalness: 0.1
        });
    } else { // color
        mainMaterial = new THREE.MeshStandardMaterial({
            color: materialInfo.value,
            roughness: 0.7, metalness: 0.1
        });
    }

    // <== ИЗМЕНЕНИЕ: Логика теперь зависит от countertopType, а не от данных материала
    if (countertopType === 'compact-plate') {
        const blackMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
        // Порядок: +X, -X, +Y, -Y, +Z, -Z
        return [
            blackMaterial, blackMaterial, // left/right
            mainMaterial, mainMaterial,   // top/bottom
            blackMaterial, blackMaterial    // front/back
        ];
    }

    // Для 'postforming' и 'quartz' возвращаем один материал для всех граней.
    return mainMaterial;
}