import * as THREE from 'three';
import * as MaterialManager from './MaterialManager.js';

// Максимальное количество плиток, чтобы не повесить браузер
const MAX_TILES = 1500; 
// Минимальный разумный размер плитки (в метрах), например 1см
const MIN_TILE_SIZE = 0.01; 

/**
 * Создает 3D-объект фартука.
 */
export function buildApronGeometry(params) {
    const {
        width, height, depth,
        apronType,
        materialData, // Теперь ожидаем объект { id: "...", type: "tiles"|"panel" }
        tileParams,
        textureOrientation
    } = params;

    const group = new THREE.Group();
    group.userData.isApron = true;

    // === HITBOX ===
    const eps = 0.001; // 0.5 мм (в метрах)
    // Защита: если фартук супер-тонкий, не вычитаем больше, чем есть
    const safeW = width > eps ? width - eps : width;
    const safeH = height > eps ? height - eps : height;
    const safeD = depth > eps ? depth - eps : depth;

    const hitBoxGeo = new THREE.BoxGeometry(safeW, safeH, safeD);
    
    const hitBoxMat = new THREE.MeshBasicMaterial({ 
        visible: true, 
        opacity: 0,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false // Это свойство тоже помогает, оставляем его
    });
    
    const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
    hitBox.name = "ApronHitBox";
    
    // Важно: отключаем отбрасывание теней самим хитбоксом, на всякий случай
    hitBox.castShadow = false; 
    hitBox.receiveShadow = false;

    group.add(hitBox);
    group.userData.hitBox = hitBox;

    // === ПОЛУЧЕНИЕ МАТЕРИАЛА ===
    // Передаем направление укладки, чтобы материал мог повернуть текстуру
    const layoutDir = tileParams?.layoutDirection || 'horizontal';
    
    // Формируем правильный объект запроса материала
    // Если materialData не задан, создаем дефолтный
    const matRequest = materialData || { id: null, type: apronType };
    
    // Получаем готовый материал
    const materialOrArray = MaterialManager.getApronMaterial(matRequest, layoutDir);

    // === ГЕНЕРАЦИЯ ===

    if (apronType === 'panel') {
        const mat = Array.isArray(materialOrArray) ? materialOrArray[0] : materialOrArray;
        const mesh = createExtrudedPanel(width, height, depth, mat, true);
        // --- ИСПРАВЛЕНИЕ ПОЛОС (Shadow Acne) ---
        mesh.castShadow = true;      // Фартук отбрасывает тень
        mesh.receiveShadow = false;  // Фартук НЕ принимает тени (убирает самозатенение и полосы)
        // ---------------------------------------
        const orient = textureOrientation || 'horizontal';
        // Для панели используем старый метод (random offset)
        MaterialManager.applyTextureToExtruded(mesh, orient, width, height);
        group.add(mesh);

    } else if (apronType === 'tiles') {
        const tW_raw = tileParams.width / 1000;
        const tH_raw = tileParams.height / 1000;
        const gap = tileParams.gap / 1000;
        
        if (tW_raw < MIN_TILE_SIZE || tH_raw < MIN_TILE_SIZE) return group;

        const offsetPercent = tileParams.rowOffset || 0;

        let tileMainDim, tileCrossDim;
        if (layoutDir === 'horizontal') {
            tileMainDim = tW_raw; tileCrossDim = tH_raw;
        } else {
            tileMainDim = tH_raw; tileCrossDim = tW_raw;
        }

        const startX = -width / 2;
        const startY = -height / 2;
        const totalCrossDim = (layoutDir === 'horizontal') ? height : width;
        const totalMainDim = (layoutDir === 'horizontal') ? width : height;

        // Защита от перегрузки
        if ((totalCrossDim / tileCrossDim) * (totalMainDim / tileMainDim) > MAX_TILES) return group;

        let currentCross = 0;
        let rowIndex = 0;

        while (currentCross < totalCrossDim - 0.001) {
            let currentTileCrossSize = tileCrossDim;
            if (currentCross + tileCrossDim > totalCrossDim) {
                currentTileCrossSize = totalCrossDim - currentCross;
            }

            let rowOffset = 0;
            if (rowIndex % 2 !== 0) {
                rowOffset = (tileMainDim + gap) * (offsetPercent / 100);
            }

            let currentMain = -rowOffset;

            while (currentMain < totalMainDim - 0.001) {
                if (currentMain + tileMainDim <= 0) {
                    currentMain += tileMainDim + gap;
                    continue;
                }
                
                let drawStart = Math.max(0, currentMain);
                let drawEnd = Math.min(totalMainDim, currentMain + tileMainDim);
                let drawSize = drawEnd - drawStart;

                if (drawSize > 0.001) {
                    let tileCenterX, tileCenterY, actualW, actualH;

                    if (layoutDir === 'horizontal') {
                        actualW = drawSize;
                        actualH = currentTileCrossSize;
                        tileCenterX = startX + drawStart + actualW / 2;
                        tileCenterY = startY + currentCross + actualH / 2;
                    } else {
                        actualW = currentTileCrossSize;
                        actualH = drawSize;
                        tileCenterX = startX + currentCross + actualW / 2;
                        tileCenterY = startY + drawStart + actualH / 2;
                    }

                    // === ВЫБОР МАТЕРИАЛА ДЛЯ ТЕКУЩЕЙ ПЛИТКИ ===
                    let currentTileMaterial;
                    
                    if (Array.isArray(materialOrArray)) {
                        // Если это микс - берем случайный
                        const randomIndex = Math.floor(Math.random() * materialOrArray.length);
                        currentTileMaterial = materialOrArray[randomIndex];
                    } else {
                        // Если обычная плитка
                        currentTileMaterial = materialOrArray;
                    }
                    // ==========================================

                    // Создаем плитку с ТЕМ ЖЕ материалом
                    const tileMesh = createExtrudedPanel(actualW, actualH, depth, currentTileMaterial, true);
                    // --- ИСПРАВЛЕНИЕ ПОЛОС (Shadow Acne) ---
                    tileMesh.castShadow = true;
                    tileMesh.receiveShadow = false; // Убираем полосы на плитке
                    // ---------------------------------------
                    tileMesh.position.set(tileCenterX, tileCenterY, 0);
                    
                    // === ТЕКСТУРИРОВАНИЕ ПЛИТКИ ===
                    // Передаем реальные размеры (actual) и исходные размеры (tileMainDim/CrossDim),
                    // чтобы функция могла посчитать обрезку UV.
                    // Для функции mapping: W всегда "ширина картинки", H - "высота картинки"
                    // Если layoutDir horizontal: W=Main, H=Cross
                    // Если layoutDir vertical: W=Cross, H=Main (потому что мы повернули текстуру в материале на 90)
                    
                    let originalWforUV = (layoutDir === 'horizontal') ? tileMainDim : tileCrossDim;
                    let originalHforUV = (layoutDir === 'horizontal') ? tileCrossDim : tileMainDim;
                    
                    let actualWforUV = (layoutDir === 'horizontal') ? actualW : actualH;
                    let actualHforUV = (layoutDir === 'horizontal') ? actualH : actualW;

                    MaterialManager.mapTileUVs(tileMesh, actualWforUV, actualHforUV, originalWforUV, originalHforUV);

                    group.add(tileMesh);
                }
                currentMain += tileMainDim + gap;
            }
            currentCross += tileCrossDim + gap;
            rowIndex++;
        }
    }

    return group;
}

/**
 * Создает экструдированную панель/плитку с компенсацией размера фаски.
 */
function createExtrudedPanel(w, h, fullDepth, material, useBevel) {
    const bevelSize = 0.001; // 1мм фаска
    
    // Если деталь слишком маленькая, отключаем фаску, чтобы не было артефактов
    const safeBevel = (w > bevelSize * 3 && h > bevelSize * 3) && useBevel;

    const shape = new THREE.Shape();
    // Рисуем прямоугольник по центру
    shape.moveTo(-w / 2, -h / 2);
    shape.lineTo(w / 2, -h / 2);
    shape.lineTo(w / 2, h / 2);
    shape.lineTo(-w / 2, h / 2);
    shape.lineTo(-w / 2, -h / 2);

    let extrudeDepth = fullDepth;
    let extrudeSettings = {
        steps: 1,
        depth: fullDepth,
        bevelEnabled: false
    };

    if (safeBevel) {
        // КОМПЕНСАЦИЯ РАЗМЕРОВ:
        // 1. По глубине: Extrude добавляет bevelThickness спереди и сзади.
        // Чтобы итоговая глубина была fullDepth, вычитаем 2 * bevelSize.
        extrudeDepth = fullDepth - (bevelSize * 2);
        
        // 2. По ширине/высоте: BevelOffset (отрицательный) сдвигает контур внутрь перед фаской.
        // BevelSize добавляет фаску наружу.
        // Если bevelOffset = -bevelSize, то внешний габарит остается исходным (w, h).
        
        extrudeSettings = {
            steps: 1,
            depth: extrudeDepth,
            bevelEnabled: true,
            bevelThickness: bevelSize,
            bevelSize: bevelSize,
            bevelOffset: -bevelSize, // <== КЛЮЧЕВАЯ ФИШКА
            bevelSegments: 1
        };
    }

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    
    // Центрируем по Z. 
    // Геометрия строится от Z=0 до Z=extrudeDepth (+фаски).
    // Нам нужно, чтобы 0 был в центре полной глубины.
    geometry.translate(0, 0, -fullDepth / 2 + (safeBevel ? bevelSize : 0)); 
    // Логика смещения: (fullDepth/2) сдвигает центр, но начало было в 0.
    // Проще: Geometry center is now roughly at 0.

    // Точное центрирование bounding box
    geometry.computeBoundingBox();
    const centerOffset = -0.5 * (geometry.boundingBox.max.z - geometry.boundingBox.min.z); // не совсем верно, т.к. min.z = 0
    // Лучше просто сдвинуть назад на половину ОБЩЕЙ глубины
    geometry.center(); // Центрирует всё (X, Y, Z) в 0,0,0 - это то, что нужно для плитки

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}