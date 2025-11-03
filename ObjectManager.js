import { Cabinet } from './Cabinet.js';
import * as THREE from 'three';
import { UpdateObjectCommand } from './Commands.js';
import * as MaterialManager from './MaterialManager.js';

class ObjectManager {
    constructor() {
        this.scene = null;
        this.cabinets = [];
        this.dependencies = {}; 
        this.historyManager = null;
    }

    // Метод для инициализации
    init(scene, dependencies, historyManager) { 
        this.scene = scene;
        this.dependencies = dependencies; 
        this.historyManager = historyManager;
    }

    addCabinet(options) {
        try {
            // ==> ИЗМЕНЕНИЕ: Добавляем зависимости в options для конструктора Cabinet <==
            const fullOptions = {
                ...options,
                ...this.dependencies // Добавляем все зависимости из хранилища
            };

            const cabinet = new Cabinet(fullOptions); // Передаем полный набор опций

            //this.scene.add(cabinet.mesh);
            //this.cabinets.push(cabinet);
            
            //console.log(`[ObjectManager] Added ${cabinet.type} with ID ${cabinet.id_data}`);
            
            return this.registerCabinet(cabinet);

        } catch (error) {
            console.error("[ObjectManager] Error creating cabinet:", error);
            alert("Произошла ошибка при добавлении шкафа.");
            return null;
        }
    }
    
    // Будущие методы
        /**
     * Удаляет шкаф из массива и его меш из сцены.
     * @param {Cabinet} cabinetToRemove - Экземпляр класса Cabinet, который нужно удалить.
     */
    removeCabinet(cabinetToRemove) {
        if (!cabinetToRemove || !this.scene) return;

        // 1. Находим и удаляем меш из сцены
        if (cabinetToRemove.mesh && cabinetToRemove.mesh.parent) {
            this.scene.remove(cabinetToRemove.mesh);
        }

        // 2. (Опционально, но очень рекомендуется) Очищаем ресурсы, чтобы избежать утечек памяти
        if (cabinetToRemove.mesh) {
             cabinetToRemove.mesh.traverse((child) => {
                 if (child.isMesh) {
                     child.geometry?.dispose();
                     if (Array.isArray(child.material)) {
                         child.material.forEach(mat => mat?.dispose());
                     } else {
                         child.material?.dispose();
                     }
                 }
             });
        }
        
        // 3. Удаляем объект шкафа из внутреннего массива
        this.cabinets = this.cabinets.filter(cab => cab.id_data !== cabinetToRemove.id_data);

        console.log(`[ObjectManager] Шкаф ${cabinetToRemove.id_data} удален.`);
    }

    /**
     * Полностью пересоздает или обновляет 3D-представление шкафа 
     * на основе его текущих данных (размеров, детализации и т.д.).
     * @param {object} cabinet - Экземпляр шкафа, который нужно обновить.
     */
    updateCabinetRepresentation(cabinet) {
    if (!cabinet) {
        console.warn("[updateCabinetRepresentation] Вызван для несуществующего шкафа.");
        return;
    }

    const cabinetIndex = this.getAllCabinets().indexOf(cabinet);
    if (cabinetIndex === -1) {
        console.error("[updateCabinetRepresentation] Не удалось найти индекс для шкафа:", cabinet.id_data);
        return;
    }

    if (cabinet.isDetailed) {
        // === ЛОГИКА ДЛЯ ДЕТАЛИЗИРОВАННОГО ШКАФА (без изменений) ===
        console.log("   - Шкаф детализирован. Запускаем цикл упрощения -> детализации.");
        window.toggleCabinetDetail(cabinetIndex); 
        window.toggleCabinetDetail(cabinetIndex);
        console.log("   - Цикл обновления детализации завершен.");

    } else {
        // === ЛОГИКА ДЛЯ ПРОСТОГО ШКАФА (ИЗМЕНЕНА) ===
        if (!cabinet.mesh || !cabinet.mesh.isMesh) {
            console.error(`[updateCabinetRepresentation] Простой шкаф ${cabinet.id_data} не имеет корректного меша.`);
            return;
        }
        
        // 1. Обновляем геометрию (как и раньше)
        if (cabinet.mesh.geometry) cabinet.mesh.geometry.dispose();
        cabinet.mesh.geometry = new THREE.BoxGeometry(cabinet.width, cabinet.height, cabinet.depth);
        
        if (cabinet.edges?.geometry) {
            cabinet.edges.geometry.dispose();
            cabinet.edges.geometry = new THREE.EdgesGeometry(cabinet.mesh.geometry);
        }

        // ==> НОВЫЙ БЛОК: ОБНОВЛЕНИЕ МАТЕРИАЛА ПРОСТОГО ШКАФА <==
        
        // 2. Создаем "виртуальный" набор данных для материала корпуса
        const bodySet = {
            materialType: 'ldsp', // Корпус всегда ЛДСП
            texture: cabinet.bodyMaterial // Берем `value` декора из данных шкафа
        };
        
        // 3. Получаем fallback-материал (простой цвет) из MaterialManager
        const newMaterial = MaterialManager.getFallbackMaterial(bodySet);

        // 4. Применяем новый материал
        if (cabinet.mesh.material) cabinet.mesh.material.dispose();
        cabinet.mesh.material = newMaterial;
        
        // ==> КОНЕЦ НОВОГО БЛОКА <==

        // 5. Обновляем позицию на основе новых размеров
        cabinet.updatePosition();
    }

    // Вне зависимости от типа, проверяем пересечения и обновляем подсветку
    const wasSelected = window.selectedCabinets && window.selectedCabinets.includes(cabinet);
    if (wasSelected) {
        window.applyHighlight(cabinet.mesh);
    }
    
    // ==> ДОПОЛНЕНИЕ: Проверка пересечений для простого шкафа <==
    if (!cabinet.isDetailed) {
        const hasIntersection = window.checkCabinetIntersections(cabinet);
        if(hasIntersection) {
            cabinet.mesh.material.color.set(0xff0000); // Окрашиваем в красный, если есть пересечение
        }
    }
}

    /**
     * Автоматизирует создание и выполнение команды обновления.
     * @param {object} target - Целевой объект (шкаф).
     * @param {function} action - Функция, которая производит изменения над объектом.
     * @param {string} commandName - Имя команды для истории.
     */
    createAndExecuteUpdateCommand(target, action, commandName) {
        if (!target) return;

        // ==> ИЗМЕНЕНИЕ 1: Создаем "чистую" копию данных ДО действия <==
        // Мы используем деструктуризацию, чтобы "выкинуть" сложные объекты
        const { mesh, edges, frontMarker, dependencies, ...oldStateData } = target;
        const oldStateCopy = JSON.parse(JSON.stringify(oldStateData)); // Теперь это безопасно

        // 2. Выполняем само действие (изменение данных)
        action(target);

        // 3. Сразу после изменения данных обновляем 3D-модель
        this.updateCabinetRepresentation(target);
        
        // ==> ИЗМЕНЕНИЕ 2: Создаем "чистую" копию данных ПОСЛЕ действия <==
        const { mesh: n_mesh, edges: n_edges, frontMarker: n_fm, dependencies: n_dep, ...newStateData } = target;
        const newStateCopy = JSON.parse(JSON.stringify(newStateData));

        // 4. Сравниваем и создаем команду
        if (JSON.stringify(oldStateCopy) !== JSON.stringify(newStateCopy)) {
            const command = new UpdateObjectCommand(
                this,
                target.id_data,
                newStateCopy,
                oldStateCopy,
                commandName
            );
            
            this.historyManager.execute(command, true);
        }
    }

    /**
     * Очищает сцену от всех шкафов и сбрасывает внутренний массив.
     */
    clearAll() {
        this.cabinets.forEach(cabinet => {
            if (cabinet.mesh && cabinet.mesh.parent) {
                this.scene.remove(cabinet.mesh);
                // В будущем здесь можно добавить очистку геометрии и материалов
            }
        });
        this.cabinets = [];
    }

    /**
     * Полностью заменяет текущие шкафы на новый набор (для undo/load).
     * @param {Array} newCabinetsArray - Массив полностью готовых объектов шкафов с мешами.
     */
    restoreState(newCabinetsArray) {
        // 1. Очищаем старое состояние
        this.clearAll();

        // 2. Устанавливаем новый массив и добавляем все меши в сцену
        this.cabinets = newCabinetsArray;
        this.cabinets.forEach(cabinet => {
            if (cabinet.mesh) {
                this.scene.add(cabinet.mesh);
            }
        });
        console.log(`[ObjectManager] Восстановлено ${this.cabinets.length} шкафов.`);
    }

    /**
     * Регистрирует уже существующий объект шкафа в менеджере.
     * Используется для клонирования, загрузки проекта и т.д.
     * @param {object} cabinetObject - Готовый объект данных шкафа с мешем.
     * @returns {object} The registered cabinet object.
     */
    registerCabinet(cabinetObject) {
        if (!(cabinetObject instanceof Cabinet)) {
            console.error("[ObjectManager] Попытка зарегистрировать невалидный объект шкафа.");
            return null;
        }

        // 1. Добавляем меш в сцену
        this.scene.add(cabinetObject.mesh);

        // 2. Добавляем объект в массив
        this.cabinets.push(cabinetObject);

        //console.log(`[ObjectManager] Зарегистрирован существующий шкаф: ${cabinetObject.id_data || cabinetObject.mesh.uuid}`);

        // 3. Возвращаем сам объект для дальнейшего использования
        return cabinetObject;
    }

    /**
     * Регистрирует существующий объект шкафа в менеджере на определенной позиции.
     * Используется для операции Undo.
     * @param {object} cabinetObject - Готовый объект данных шкафа с мешем.
     * @param {number} index - Индекс, на который нужно вставить объект.
     */
    registerCabinetAtIndex(cabinetObject, index) {
        if (!(cabinetObject instanceof Cabinet)) {
            console.error("[ObjectManager] Попытка зарегистрировать невалидный объект шкафа.");
            return null;
        }

        // 1. Добавляем меш обратно в сцену
        this.scene.add(cabinetObject.mesh);

        // 2. Вставляем объект в массив на его прежнее место
        if (index >= 0 && index <= this.cabinets.length) {
            this.cabinets.splice(index, 0, cabinetObject);
        } else {
            // Если индекс некорректен, просто добавляем в конец
            this.cabinets.push(cabinetObject);
        }

        //console.log(`[ObjectManager] Восстановлен шкаф ${cabinetObject.id_data} на позицию ${index}`);
        return cabinetObject;
    }

    /**
     * Создает объект шкафа с мешем из сохраненных данных (для undo/load).
     * @param {object} cabinetData - Объект с данными шкафа, но без меша.
     * @returns {object|null} Полностью собранный объект шкафа.
     */
    createCabinetFromData(cabinetData) {
        const newCabObject = { ...cabinetData };
        
        // Создаем простой меш
        const simpleMesh = new THREE.Mesh(
            new THREE.BoxGeometry(newCabObject.width, newCabObject.height, newCabObject.depth),
            new THREE.MeshStandardMaterial({ color: newCabObject.initialColor })
        );
        // UUID меша можно не восстанавливать, т.к. он временный. А вот id_data важен.
        
        const edgesGeom = new THREE.EdgesGeometry(simpleMesh.geometry);
        const cabEdges = new THREE.LineSegments(edgesGeom, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }));
        cabEdges.raycast = () => {}; 
        simpleMesh.add(cabEdges);

        newCabObject.mesh = simpleMesh;
        newCabObject.edges = cabEdges;
        
        // Привязываем экземпляр КЛАССА, а не просто объект
        // TODO: Когда перейдем на классы полностью, здесь будет `new Cabinet(...)`
        simpleMesh.userData.cabinet = newCabObject; 
        
        // Рассчитываем позицию
        window.updateCabinetPosition(newCabObject);
        
        return Cabinet.fromData(cabinetData, this.dependencies);
    }
    
    getCabinetByMesh(mesh) {
        return this.cabinets.find(cab => cab.mesh === mesh);
    }

    getAllCabinets() {
        return this.cabinets;
    }

    clearAll() {
        this.cabinets.forEach(cab => {
            this.scene.remove(cab.mesh);
            // ... тут нужно будет добавить очистку геометрии и материалов
        });
        this.cabinets = [];
    }
}

// Экспортируем один экземпляр менеджера (синглтон)
export const objectManager = new ObjectManager();