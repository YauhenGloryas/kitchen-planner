
/**
 * Создает столешницу над выбранными шкафами, делегируя отрисовку updateCountertop3D.
 * @param {Array} selectedCabinets - Массив выбранных объектов шкафов.
 */
function createCountertop(selectedCabinets) {
    if (!selectedCabinets || selectedCabinets.length === 0) return;

    const anchorCabinet = selectedCabinets[0];
    const defaultMaterialInfo = window.countertopOptionsData[0]; 
    const currentCountertopType = kitchenGlobalParams.countertopType;
    const currentThickness = kitchenGlobalParams.countertopThickness / 1000;

    let initialUserData = {};
    let initialPosition = new THREE.Vector3();
    let initialRotation = new THREE.Euler();

    if (anchorCabinet.type === 'freestandingCabinet') {
        const cabinet = anchorCabinet;
        const thickness = currentThickness;
        const depth = kitchenGlobalParams.countertopDepth / 1000;
        const rotationY = cabinet.mesh.rotation.y;
        const length = cabinet.width;
        
        // --- Расчет Позиции (Ваш код) ---
        const cabinetCenter = cabinet.mesh.position;
        const cabinetQuaternion = cabinet.mesh.quaternion;
        const cabinetHeight = cabinet.height;
        const cabinetDepth = cabinet.depth;
        const cabOverhang = cabinet.overhang ?? 0.018;
        const cabFacadeThickness = cabinet.facadeThickness ?? 0.018;
        
        const targetY = cabinetCenter.y + cabinetHeight / 2 + thickness / 2;
        const forwardDir = new THREE.Vector3(0, 0, 1).applyQuaternion(cabinetQuaternion);
        const offsetMagnitude = (cabinetDepth / 2) + cabOverhang + cabFacadeThickness - (depth / 2);
        const targetPos = cabinetCenter.clone().addScaledVector(forwardDir, offsetMagnitude);
        targetPos.y = targetY;

        initialPosition.copy(targetPos);
        initialRotation.copy(cabinet.mesh.rotation);
        
        initialUserData = {
            type: 'countertop',
            id_data: THREE.MathUtils.generateUUID(),
            wallId: 'Bottom',
            length: length,
            depth: depth,
            thickness: currentThickness,
            cabinetUuid: cabinet.mesh.uuid,
            heightDependsOnGlobal: false,
            materialId: defaultMaterialInfo.id,
            countertopType: currentCountertopType
        };

    } else if (['Back', 'Front', 'Left', 'Right'].includes(anchorCabinet.wallId)) {
        const wallId = anchorCabinet.wallId;
        const wallCabinets = selectedCabinets.filter(cab => cab.wallId === wallId);
        const positions = wallCabinets.map(cab => cab.offsetAlongWall);
        const minOffset = Math.min(...positions);
        const maxOffset = Math.max(...positions) + wallCabinets.find(cab => cab.offsetAlongWall === Math.max(...positions)).width;
        
        const length = maxOffset - minOffset;
        const depth = kitchenGlobalParams.countertopDepth / 1000;
        const thickness = currentThickness;
        
        // --- Расчет Позиции (Ваш код) ---
        const cabinetTopY = anchorCabinet.mesh.position.y + anchorCabinet.height / 2;
        const roomWidth = currentLength;
        const roomDepth = currentHeight;
        
        let x, y, z;
        y = cabinetTopY + thickness / 2;
        
        if (wallId === 'Back') {
            x = minOffset + length / 2 - roomWidth / 2;
            z = -roomDepth / 2 + depth / 2;
        } else if (wallId === 'Front') {
            x = minOffset + length / 2 - roomWidth / 2;
            z = roomDepth / 2 - depth / 2;
            initialRotation.y = Math.PI;
        } else if (wallId === 'Left') {
            x = -roomWidth / 2 + depth / 2;
            z = minOffset + length / 2 - roomDepth / 2;
            initialRotation.y = Math.PI / 2;
        } else if (wallId === 'Right') {
            x = roomWidth / 2 - depth / 2;
            z = minOffset + length / 2 - roomDepth / 2;
            initialRotation.y = -Math.PI / 2;
        }
        initialPosition.set(x, y, z);

        initialUserData = {
            type: 'countertop',
            id_data: THREE.MathUtils.generateUUID(),
            wallId: wallId,
            length: length,
            depth: depth,
            thickness: currentThickness,
            offsetAlongWall: minOffset,
            materialId: defaultMaterialInfo.id, 
            countertopType: currentCountertopType, 
            heightDependsOnGlobal: true
        };
    } else {
        return;
    }

    // --- ОБЩИЙ КОД ---
    // 1. Создаем ПУСТОЙ меш-контейнер
    const countertop = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    
    // 2. Устанавливаем его начальную позицию, вращение и userData
    countertop.position.copy(initialPosition);
    countertop.rotation.copy(initialRotation);
    countertop.userData = initialUserData;

    // 3. ВЫЗЫВАЕМ нашу новую умную функцию, чтобы она все построила
    // Она создаст геометрию, материал, текстуру и ребра.
    window.updateCountertop3D(countertop, countertop.userData);
    
    // 4. Добавляем в историю и сцену
    const command = new AddObjectCommand(scene, countertops, countertop);
    historyManager.execute(command);
    updateHint('Столешница добавлена!');
}

// Новая функция для создания столешницы из загруженных данных
function createCountertopFromData(ctData) {
    console.log("[createCountertopFromData] Загрузка столешницы...", ctData);
    
    const savedUserData = ctData.userData;
    if (!ctData || !savedUserData || savedUserData.type !== 'countertop') return null;

    // 1. Создаем ПУСТОЙ меш-контейнер
    const countertopMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());

    // 2. Восстанавливаем позицию, вращение и масштаб "как есть" из JSON
    // (updateCountertop3D потом "починит" геометрию внутри этого меша)
    if (ctData.position) countertopMesh.position.copy(ctData.position);
    if (ctData.rotation) countertopMesh.rotation.set(ctData.rotation.x, ctData.rotation.y, ctData.rotation.z, ctData.rotation.order || 'XYZ');
    if (ctData.scale) countertopMesh.scale.copy(ctData.scale);
    
    countertopMesh.uuid = ctData.uuid_mesh || THREE.MathUtils.generateUUID();

    // 3. Восстанавливаем userData
    countertopMesh.userData = { ...savedUserData };
    // Убедимся, что id_data есть
    if (!countertopMesh.userData.id_data) { 
        countertopMesh.userData.id_data = THREE.MathUtils.generateUUID();
    }

     // --- СНАЧАЛА ВОССТАНАВЛИВАЕМ ДЕТЕЙ ---
    if (savedUserData.appliances && Array.isArray(savedUserData.appliances)) {
        countertopMesh.userData.appliances = []; 
        savedUserData.appliances.forEach(appData => {
            const appMesh = createCountertopApplianceFromData(countertopMesh, appData);
            if (appMesh) {
                countertopMesh.userData.appliances.push(appMesh.userData);
            }
        });
    }

    // 4. ВЫЗЫВАЕМ НАШУ УМНУЮ ФУНКЦИЮ
    // Она создаст ExtrudeGeometry, повернет ее, сдвинет pivot, создаст материал и текстуру.
    // Важно: мы передаем `null` как previousState, чтобы она не пыталась сдвигать позицию,
    // а просто отрисовала то, что есть.
    window.updateCountertop3D(countertopMesh, countertopMesh.userData);

    // 5. Добавляем ребра (вручную, т.к. updateCountertop3D удаляет старые, но не создает новые для чистоты)
    // const edgesGeometry = new THREE.EdgesGeometry(countertopMesh.geometry);
    // const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    // const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    // edges.raycast = () => {};
    // countertopMesh.add(edges);
    // countertopMesh.userData.edges = edges;

    // 6. Добавляем в сцену и массив
    if (cube) scene.add(countertopMesh);
    if (typeof countertops !== 'undefined' && Array.isArray(countertops)) {
        countertops.push(countertopMesh);
    }

    if (savedUserData.appliances && Array.isArray(savedUserData.appliances)) {
        // Очищаем массив, так как мы будем его пересоздавать
        countertopMesh.userData.appliances = []; 
        
        savedUserData.appliances.forEach(appData => {
            const appMesh = createCountertopApplianceFromData(countertopMesh, appData);
            if (appMesh) {
                countertopMesh.userData.appliances.push(appMesh.userData);
            }
        });
    }

    console.log(`  [createCountertopFromData] Столешница ${countertopMesh.uuid} восстановлена.`);
    console.log(`  [createCountertopFromData] Столешница.wallId ${countertopMesh.wallId} `);
    return countertopMesh;
}

/**
 * НОВАЯ ЦЕНТРАЛЬНАЯ ФУНКЦИЯ ОБНОВЛЕНИЯ СТОЛЕШНИЦЫ
 * @param {THREE.Mesh} countertop - 3D объект столешницы для обновления.
 * @param {object} stateToApply - Новое состояние (объект userData), которое нужно применить.
 * @param {object} previousState - Предыдущее состояние, нужное для расчета сдвигов.
 */
window.updateCountertop3D = function(countertop, stateToApply, previousState) {
    if (!countertop || !stateToApply) return;

    const oldState = previousState || { ...countertop.userData };
    Object.assign(countertop.userData, stateToApply);
    
    const { length, depth, wallId, materialId, countertopType, thickness } = countertop.userData;


    // --- 0. Расчет вырезов ---
    const holes = [];
    
    if (countertop.children) {
        //console.log("Детей у столешницы:", countertop.children.length); // <-- ЛОГ 1
        countertop.children.forEach(child => {
            if (child.userData && child.userData.type === 'sink_model' && child.userData.cutoutSize) {
                // 1. Получаем локальную позицию мойки (X - длина, Z - глубина)
                
                // --- НОВАЯ ЛОГИКА РАЗМЕРОВ ВЫРЕЗА ---
                let cutoutW = child.userData.cutoutSize.width;
                let cutoutD = child.userData.cutoutSize.depth;
                let cutoutOffsetZ = 0; // Смещение центра выреза по глубине
                let cornerRadius = 10 / 1000; // Стандартный радиус

                const isCompact = countertopType === 'compact-plate';
                const isSteel = child.userData.modelName === 'sink_inox.glb';

                if (isCompact && isSteel) {
                    // Подстольный монтаж: вырез меньше
                    // Например, уменьшаем на 20мм с каждой стороны (или как нужно по ТЗ)
                    cutoutW = 0.440; // Пример: 400мм (ширина чаши)
                    cutoutD = 0.398; // Пример: 400мм (глубина чаши)
                    
                    // Смещение, если чаша не по центру мойки
                    cutoutOffsetZ = 0.025; 
                    
                    // Радиус может быть другим для чаши
                    cornerRadius = 20 / 1000; 
                }

                const shapeCenterX = child.position.x + length / 2;
                const shapeCenterY = child.position.z + depth / 2 + cutoutOffsetZ;
                
                // 2. Создаем прямоугольный путь для дырки
                const hole = new THREE.Path();
                const radius = 10 / 1000; // Радиус 10мм
                const minX = shapeCenterX - cutoutW / 2;
                const maxX = shapeCenterX + cutoutW / 2;
                const minY = shapeCenterY - cutoutD / 2;
                const maxY = shapeCenterY + cutoutD / 2;
                
                hole.moveTo(minX, minY + radius);
                hole.lineTo(minX, maxY - radius);
                hole.quadraticCurveTo(minX, maxY, minX + radius, maxY);
                hole.lineTo(maxX - radius, maxY);
                hole.quadraticCurveTo(maxX, maxY, maxX, maxY - radius);
                hole.lineTo(maxX, minY + radius);
                hole.quadraticCurveTo(maxX, minY, maxX - radius, minY);
                hole.lineTo(minX + radius, minY);
                hole.quadraticCurveTo(minX, minY, minX, minY + radius);
                
                holes.push(hole);
            }
        });
    }
     //console.log("Всего вырезов:", holes.length); // <-- ЛОГ 4

    // --- ЭТАП 1: Запоминаем мировые позиции техники ---
    const applianceWorldPositions = [];
    if (countertop.children) {
        countertop.children.forEach(child => {
            if (child.userData && (child.userData.type === 'hob' || child.userData.type === 'sink_model')) {
                const worldPos = new THREE.Vector3();
                child.getWorldPosition(worldPos);
                applianceWorldPositions.push({ child: child, worldPos: worldPos });
            }
        });
    }
    
    // 1. Обновляем геометрию, используя нашу фабрику
    const newGeometry = createCountertopGeometry(length, depth, thickness, holes);
    if (!newGeometry) return;

    // "Чиним" геометрию, как в createCountertop
    newGeometry.rotateX(Math.PI / 2);
    newGeometry.translate(-length / 2, thickness / 2, -depth / 2);

    countertop.geometry.dispose();
    countertop.geometry = newGeometry;

    //console.log("Обновление ребер. Старые:", countertop.userData.edges ? "есть" : "нет");
    
    if (countertop.userData.edges) {
        // Удаляем ВСЕ LineSegments из детей (это наши ребра)
        for (let i = countertop.children.length - 1; i >= 0; i--) {
            const child = countertop.children[i];
            if (child.isLineSegments) {
                child.geometry.dispose();
                child.material.dispose();
                countertop.remove(child);
            }
        }
    }

    // --- НОВЫЙ БЛОК: Создаем новые ребра ---
    const edgesGeometry = new THREE.EdgesGeometry(countertop.geometry);
    const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edges.raycast = () => {}; // Не мешать кликам
    countertop.add(edges);
    countertop.userData.edges = edges;

    //console.log("Новые ребра добавлены. Вершин:", edgesGeometry.attributes.position.count);

    // 2. Обновляем материал
    const materialInfo = window.countertopOptionsData.find(m => m.id === materialId);
    const newMaterial = MaterialManager.createCountertopMaterial(materialInfo, countertopType);
    if (Array.isArray(countertop.material)) {
        countertop.material.forEach(mat => mat.dispose());
    } else if (countertop.material) {
        countertop.material.dispose();
    }
    countertop.material = newMaterial;
    
    // 3. Применяем текстуру
    // (Этот блок был в updateTextureScale, теперь он здесь)
    if (Array.isArray(countertop.material)) {
        // Логика для компакт-плиты
        MaterialManager.applyTextureToExtruded(countertop, 'horizontal', length, depth, countertop.material[0]);
    } else {
        MaterialManager.applyTextureToExtruded(countertop, 'horizontal', length, depth, countertop.material);
    }
 
    // 4. Позиция. `UpdateGlobalParamsCommand` уже сама правильно меняет Y.
    const depthDifference = depth - (oldState.depth || depth);

    if (Math.abs(depthDifference) > 1e-5) {
        const shift = depthDifference / 2;
        
        // Вектор, направленный "вперед" от стены
        let forwardVector = new THREE.Vector3();
        if (wallId === 'Back')  forwardVector.set(0, 0, 1);
        if (wallId === 'Front') forwardVector.set(0, 0, -1);
        if (wallId === 'Left')  forwardVector.set(1, 0, 0);
        if (wallId === 'Right') forwardVector.set(-1, 0, 0);
        
        // Сдвигаем позицию центра столешницы в этом направлении на половину изменения глубины
        countertop.position.addScaledVector(forwardVector, shift);
    }
    countertop.updateMatrixWorld(true);
    
    // --- ЭТАП 5: Восстанавливаем позиции техники ---
    if (countertop.children) {
        countertop.children.forEach(child => {
            if (child.userData && (child.userData.type === 'hob' || child.userData.type === 'sink_model')) {
                // 1. X: Восстанавливаем отступ от левого края
                // (Если distFromLeft еще нет, высчитываем его на лету из старой длины)
                let dist = child.userData.distFromLeft;
                if (dist === undefined) {
                     const oldLength = oldState.length || length;
                     dist = child.position.x - (-oldLength / 2);
                     child.userData.distFromLeft = dist; // Сохраняем на будущее
                }
                
                child.position.x = (-length / 2) + dist;

                // 2. Y: Высота (как и было)
                // Логика для мойки
                let posY = thickness / 2;

                if (child.userData.type === 'sink_model') {
                    const isCompact = countertopType === 'compact-plate';
                    const modelName = child.userData.modelName;
                    const isSteel = modelName === 'sink_inox.glb'; 

                    if (isCompact && isSteel) {
                        // Монтаж ПОД столешницу
                        // Нижняя грань столешницы = -thickness/2
                        // Смещаем еще на 2мм вниз
                        posY = -thickness / 2 - (3 / 1000);
                    }
                }

                child.position.y = posY;

                // --- ПОЗИЦИОНИРОВАНИЕ СМЕСИТЕЛЯ ---
                const mixer = child.children.find(c => c.userData && c.userData.isMixer);

                console.log("mixer = ", mixer);
                if (mixer) {
                    const isCompact = countertopType === 'compact-plate';
                    const modelName = child.userData.modelName;
                    const isSteel = modelName === 'sink_inox.glb'
                    
                    // Z (вдоль глубины столешницы):
                    // В локальных координатах мойки, ось Z совпадает с осью Z столешницы (если нет вращения).
                    // Pivot мойки = 0.
                    let mixerZ = -0.182; // -182мм (по умолчанию для камня)
                    
                    if (isSteel) {
                         mixerZ = -0.220; // -220мм
                    }
                    
                    // Y (Высота):
                    // Смеситель должен стоять на верхней грани столешницы.
                    // Верхняя грань столешницы в мировых = (центр стола Y) + thickness/2.
                    // Мойка стоит на posY (относительно центра стола).
                    // Значит, верхняя грань относительно мойки = (thickness/2) - posY.
                    
                    let mixerY = (thickness / 2) - posY;
                    
                    if (isSteel && !isCompact) { // Постформинг + сталь
                         // y = pivot мойки + 1 мм;
                         // Мойка стоит на thickness/2.
                         // Значит mixerY = 1мм (относительно мойки)
                         mixerY = 1 / 1000;
                    } else if (!isSteel) { // Камень
                         // y = pivot мойки + 10 мм;
                         mixerY = 3 / 1000;
                    }
                    // Для компакт+сталь: mixerY = (thickness/2) - posY. (Это уже посчитано выше)

                    mixer.position.set(0, mixerY, mixerZ); // X=0 (центр мойки)
                }


                // 3. Z: Глубина (как и было)
                if (child.userData.type === 'hob') {
                    const applianceDepth = 0.520;
                    const offsetFromFront = 0.040;
                    child.position.z = (depth / 2) - offsetFromFront - (applianceDepth / 2);
                } else if (child.userData.type === 'sink_model') {
                    // Для мойки: pivot = передняя грань - 260мм
                    const offsetFromFront = 0.250 + 0.06; // 260мм
                    child.position.z = (depth / 2) - offsetFromFront;
                }
                
            }
        });
    }
};

/**
 * Создает и размещает технику (варочная, мойка) на столешнице.
 * @param {string} type - Тип техники ('hob', 'sink_model').
 * @param {THREE.Vector3} worldPosition - Точка вставки (мировые координаты, из рейкастера).
 * @param {THREE.Mesh} countertop - Меш столешницы.
 */
function createCountertopAppliance(type, worldPosition, countertop) {
    console.log(`[Main] Создание техники ${type} на столешнице ${countertop.uuid}`);

    // 1. Получаем модель
    let modelName;
    if (type === 'hob') {
        modelName = 'induct_600_black.glb';
    } else if (type === 'sink_model') {
        modelName = 'sink_inox.glb'; // Заглушка
    }

    const applianceMesh = getPreloadedModelClone(modelName);
    if (!applianceMesh) {
        console.error(`Не удалось получить модель ${modelName}`);
        return;
    }

    if (type === 'sink_model') {
        // Загружаем смеситель
        const mixerMesh = getPreloadedModelClone('mixer.glb'); // Ваша модель
        
        if (mixerMesh) {
             console.log("Смеситель загружен, добавляем к мойке");
             mixerMesh.userData.isMixer = true;
             applianceMesh.add(mixerMesh);
        } else {
             console.error("Не удалось загрузить смеситель!");
        }
    }

    // 2. Преобразуем мировую позицию в локальную систему координат столешницы
    // counterTop.worldToLocal(vector) преобразует вектор на месте
    const localPosition = worldPosition.clone();
    countertop.worldToLocal(localPosition);

    // 1. Позиция вдоль длины (X) - берем из клика
    applianceMesh.position.x = localPosition.x;
    // 2. Позиция по высоте (Z в локальных координатах Extrude)
    // Верхняя грань = thickness / 2.
    applianceMesh.position.y = countertop.userData.thickness / 2;
    
    // 3. Позиция по глубине (Y в локальных координатах Extrude)
    const ctDepth = countertop.userData.depth;
    if (type === 'hob') {
        const applianceDepth = 0.520;
        const offsetFromFront = 0.040;
        // Y = (Передняя грань) - отступ - половина варочной
        applianceMesh.position.z = (ctDepth / 2) - offsetFromFront - (applianceDepth / 2);
    } else if (type === 'sink_model') {
        // Для мойки: pivot = передняя грань - 260мм
        const offsetFromFront = 0.250 + 0.06; // 260мм
        applianceMesh.position.z = (ctDepth / 2) - offsetFromFront;
    }
        
    // 4. Сохранение данных
    if (!countertop.userData.appliances) {
        countertop.userData.appliances = [];
    }
    
    const applianceData = {
        type: type,
        id: THREE.MathUtils.generateUUID(),
        modelName: modelName,
        localPosition: applianceMesh.position.clone(),
        rotation: applianceMesh.rotation.clone(),
        
        // --- НОВОЕ: Сохраняем отступ от левого края ---
        distFromLeft: applianceMesh.position.x - (-countertop.userData.length / 2)
    };

    // Добавляем размеры выреза, если это мойка
    if (type === 'sink_model') {
         if (modelName === 'sink_stone.glb') {
             applianceData.cutoutSize = { width: 0.490, depth: 0.490 }; 
         } else {
             applianceData.cutoutSize = { width: 0.480, depth: 0.480 }; 
         }
    }
    
    applianceMesh.userData = applianceData; // Привязываем данные к мешу
    applianceMesh.traverse((child) => {
        if (child.isMesh) {
            //console.log('Appliance material:', child.material);
            // Если материал слишком темный, можно попробовать "высветлить" его
            if (child.material.map) {
                child.material.map.encoding = THREE.sRGBEncoding; // Важно для корректного цвета
            }
            // child.material.envMapIntensity = 1.0; // Усилить отражения
        }
    });


    //countertop.userData.appliances.push(applianceData);

    // 5. Добавляем в сцену
    //countertop.add(applianceMesh);
    const command = new AddApplianceCommand(countertop, applianceData);
    historyManager.execute(command);
    
}

function createCountertopApplianceFromData(countertop, data) {
    const mesh = getPreloadedModelClone(data.modelName);
    if (!mesh) return null;

    mesh.position.copy(data.localPosition);
    mesh.rotation.copy(data.rotation);
    mesh.scale.copy(data.scale || new THREE.Vector3(1, 1, 1));
    mesh.userData = { ...data }; // Копируем данные

    mesh.userData.isHighlighted = false;

    // --- НОВЫЙ БЛОК: Добавляем смеситель, если это мойка ---
    if (data.type === 'sink_model') {
         const mixerMesh = getPreloadedModelClone('mixer.glb');
         if (mixerMesh) {
             mixerMesh.userData.isMixer = true;
             mesh.add(mixerMesh);
             // Позиционирование произойдет в updateCountertop3D
         }
    }
    // -------------------------------------------------------

    countertop.add(mesh);
    
    // Если в countertop.userData.appliances еще нет записи об этом объекте, добавляем
    // (это нужно при загрузке)
    // Но при Undo/Redo мы управляем массивом вручную.
    
    return mesh;
}
