import * as THREE from 'three';
import { loadModel } from './AssetLoader.js'; // Или используй window.loadModel

/**
 * Создает сложный фасад.
 * @param {number} width - Ширина (м)
 * @param {number} height - Высота (м)
 * @param {object} profileData - Объект декора из JSON (с полями models, cornerSize...)
 * @param {THREE.Material} material - Материал
 */
export async function createMilledFacade(width, height, profileData, material) {
    const group = new THREE.Group();
    group.name = "MilledFacade";

    const minDimMm = Math.min(width, height) * 1000;
    let modelsData = null;

    // Выбор LOD
    if (profileData.lod) {
        if (minDimMm >= profileData.lod.full.minSize) {
            modelsData = profileData.lod.full; // Тут лежит cornerSize, models, centerThickness
        } else if (minDimMm >= profileData.lod.simple.minSize) {
            modelsData = profileData.lod.simple;
        } else {
            // Меньше минимума -> Заглушка
            return new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.019), material);
        }
    } else {
        // Фалбек
        modelsData = profileData; // Или profileData.models, зависит от JSON
    }

    // Определяем, где лежат параметры (внутри modelsData или внутри modelsData.models)
    const paramsSource = modelsData.models || modelsData; 

    // Параметры профиля (переводим в метры)
    const cornerSize = (paramsSource.cornerSize || 100) / 1000;
    const centerTh = (paramsSource.centerThickness || 6) / 1000; // <--- ВОТ ТАК
    const centerZ = (paramsSource.centerOffsetZ || 0) / 1000;
    const edgeThick = (paramsSource.edgeThickness || 19) / 1000;

    
    
    // Проверка: влезают ли углы?
    if (width < cornerSize * 2 || height < cornerSize * 2) {
        console.warn("Фасад слишком маленький для фрезеровки, строим заглушку.");
        // Возвращаем простой бокс
        const box = new THREE.Mesh(new THREE.BoxGeometry(width, height, edgeThick), material);
        return box; 
    }

    // Загрузка моделей
    const cornerPath = modelsData.models ? modelsData.models.corner : modelsData.corner;
    const edgePath = modelsData.models ? modelsData.models.edge : modelsData.edge;

    // Загружаем модели (они должны быть уже в кэше)
    const cornerModel = await loadModel(cornerPath);
    const edgeModel = await loadModel(edgePath);

    // Применяем материал ко всем частям
    const applyMat = (obj) => {
        obj.traverse(child => {
            if (child.isMesh) {
                child.material = material;
            }
        });
    };
    applyMat(cornerModel);
    applyMat(edgeModel);

    // === 1. УГЛЫ (4 шт) ===
    // Твоя модель: Pivot в верхнем-левом углу (Back side). 
    // Y вверх, X вправо, Z на нас (от задней стенки).
    // Значит (0,0,0) - это точка: Верхний край, Левый край, Задняя стенка.
    
    // Но обычно в WebGL удобнее Pivot в центре объекта или в левом нижнем углу.
    // Давай позиционировать исходя из твоего описания.
    // Центр фасада в (0,0,0).
    // Левый верхний угол фасада: x = -W/2, y = H/2.
    // Если Pivot модели совпадает с этим углом, то ставим прямо туда.

    // 1.1. Top-Left (Original)
    const tl = cornerModel.clone();
    tl.rotation.x = Math.PI / 2;
    tl.position.set(-width / 2, height / 2, -edgeThick/2); // Z смещаем, чтобы центр фасада был в 0?
    // Обычно фасад строится так, что Z=0 - это центр толщины, или задняя стенка.
    // Твой createPanel строит BoxGeometry центрированный.
    // Если твоя модель имеет Pivot на задней стенке, то надо сдвинуть на -thickness/2 (если Z фасада 0 - это центр).
    // Давай считать, что Z=0 группы фасада - это центр толщины.
    // Задняя стенка = -edgeThick/2.
    tl.position.z = -edgeThick / 2;
    group.add(tl);

    // 1.2. Top-Right (Mirror X)
    const tr = cornerModel.clone();
    // Отражение по X. Или поворот на -90 вокруг Z?
    // Угол "смотрит" внутрь (вправо-вниз).
    // Если повернуть на -90 (вокруг Z): Y станет X, X станет -Y.
    // Лучше скейлить (-1 по X).
    tr.scale.x = -1; 
    tr.rotation.x = Math.PI / 2;
    tr.position.set(width / 2, height / 2, -edgeThick / 2);
    // При scale -1 нормали могут вывернуться. В Three.js это обычно ок, но если будут черные - надо пересчитать.
    group.add(tr);

    // 1.3. Bottom-Left (Mirror Y)
    const bl = cornerModel.clone();
    bl.scale.y = -1;
    bl.rotation.x = -Math.PI / 2;
    bl.position.set(-width / 2, -height / 2, -edgeThick / 2);
    group.add(bl);

    // 1.4. Bottom-Right (Mirror XY)
    const br = cornerModel.clone();
    br.scale.set(-1, -1, 1);
    br.rotation.x = -Math.PI / 2;
    br.position.set(width / 2, -height / 2, -edgeThick / 2);
    group.add(br);


    // === 2. КРАЯ (EDGES) (4 шт) ===
    // Твой Edge: Длина 100мм по X. Высота 106мм по Y.
    // Pivot: Центр по X, Верхний край по Y, Задняя стенка по Z.
    // Нам нужно растянуть его между углами.
    
    const hDist = width - cornerSize * 2; // Длина горизонтальной вставки
    const vDist = height - cornerSize * 2; // Длина вертикальной вставки
    
    // Исходная длина модели Edge (надо знать точно! допустим 0.1м)
    const originalEdgeLen = 0.1; 
    const scaleH = hDist / originalEdgeLen;
    const scaleV = vDist / originalEdgeLen;

    // 2.1. Top Edge
    const topEdge = edgeModel.clone();
    topEdge.scale.set(scaleH, 1, 1); 
    // Позиция: По X - центр (0). По Y - верх (H/2). Z - зад (-Th/2).
    // Твой Pivot по X - центр. Значит X=0.
    topEdge.rotation.x = Math.PI / 2;
    topEdge.position.set(0, height / 2, -edgeThick / 2);
    group.add(topEdge);

    // 2.2. Bottom Edge
    const botEdge = edgeModel.clone();
    botEdge.scale.set(scaleH, -1, 1); // Mirror Y
    botEdge.rotation.x = -Math.PI / 2;
    botEdge.position.set(0, -height / 2, -edgeThick / 2);
    group.add(botEdge);

    // 2.3. Left Edge (Vertical)
    // Нам нужно повернуть горизонтальный Edge на 90 градусов.
    const leftEdge = edgeModel.clone();
    leftEdge.rotation.z = Math.PI / 2; 
    leftEdge.rotation.y = Math.PI / 2;
    // Теперь его длина идет вдоль Y.
    // Scale нужно применять к "новой" длине. Изначально длина была по X.
    // После поворота ось X модели смотрит вверх (Y сцены).
    leftEdge.scale.set(scaleV, 1, 1);
    
    // Позиция: X = -W/2. Y = 0.
    // Но после поворота Pivot тоже повернулся.
    // Изначально Pivot: Top-Center.
    // Поворот +90: Top (Y max) переходит в Left (X min).
    // Значит Pivot стал: Left-Center.
    // Ставим в -W/2, 0.
    leftEdge.position.set(-width / 2, 0, -edgeThick / 2);
    group.add(leftEdge);

    // 2.4. Right Edge
    const rightEdge = edgeModel.clone();
    rightEdge.rotation.z = -Math.PI / 2; 
    rightEdge.scale.set(scaleV, 1, 1);
    rightEdge.rotation.y = -Math.PI / 2;
    rightEdge.position.set(width / 2, 0, -edgeThick / 2);
    group.add(rightEdge);


    // === 3. ЦЕНТР (ФИЛЕНКА) ===
    // Это просто плоскость/бокс, закрывающий дырку.
    // Размер дырки:
    // Ширина = Width - 2 * (Ширина профиля). 
    // Твоя модель Corner 106x106. Значит ширина профиля = 106? Или это с канавкой?
    // Ты писал: "106 х 106 мм (это полная рамка 79 мм + 27 мм полный размер "канавки")".
    // Значит "дырка" начинается после 106мм.
    
    const centerW = width - cornerSize * 2;
    const centerH = height - cornerSize * 2;
    //const centerTh = (modelsData.centerThickness || 6) / 1000; // <--- ВОТ ТУТ БЫЛА ОШИБКА?
    //const centerZ = (profileData.models.centerOffsetZ || 0) / 1000;

    if (centerW > 0 && centerH > 0) {
        const centerGeo = new THREE.BoxGeometry(centerW, centerH, centerTh);
        // Центрируем по Z относительно 0
        const center = new THREE.Mesh(centerGeo, material);
        
        // Позиция Z:
        // Рамка стоит от -edgeThick/2 до +edgeThick/2.
        // Филенка обычно утоплена. centerOffsetZ отсчитывается от чего?
        // Допустим, от передней плоскости.
        // Или просто выровняем по задней стенке?
        // Z = -edgeThick/2 + centerTh/2 (заподлицо сзади).
        center.position.z = -edgeThick / 2 + centerTh / 2 + centerZ; 
        
        group.add(center);
    }

    return group;
}