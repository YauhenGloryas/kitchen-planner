// Commands.js
import * as THREE from 'three';
import * as MaterialManager from './MaterialManager.js';
import { roomDimensions } from './roomManager.js';

// Команда для добавления шкафа
export class AddCabinetCommand {
    constructor(objectManager, options) {
        this.objectManager = objectManager;
        this.options = options; // Начальные опции для создания
        this.addedCabinetData = null; // Здесь будем хранить ПОЛНЫЕ данные созданного шкафа
    }

    execute() {
        if (!this.addedCabinetData) {
        const newCabinet = this.objectManager.addCabinet(this.options);
        if (newCabinet) {
            // Сохраняем не сам объект, а его копию данных
            const { mesh, edges, frontMarker, dependencies, ...dataToSave } = newCabinet;
            this.addedCabinetData = dataToSave;
        }
    } else {
            // ПОВТОРНЫЙ ВЫЗОВ (REDO): "воскрешаем" шкаф из сохраненных данных
            const restoredCabinet = this.objectManager.createCabinetFromData(this.addedCabinetData);
            if (restoredCabinet) {
                this.objectManager.registerCabinet(restoredCabinet);
                if (this.addedCabinetData.isDetailed) {
                    const newIndex = this.objectManager.getAllCabinets().length - 1;
                    window.toggleCabinetDetail(newIndex);
                }
            }
        }
    }

    undo() {
        if (this.addedCabinetData) {
            const cabinetToRemove = this.objectManager.getAllCabinets().find(cab => cab.id_data === this.addedCabinetData.id_data);
            if (cabinetToRemove) {
                this.objectManager.removeCabinet(cabinetToRemove);
            }
        }
    }

    // Вспомогательный метод, который понадобится в main.js
    getAddedCabinet() {
        if (!this.addedCabinetData) return null;
        return this.objectManager.getAllCabinets().find(cab => cab.id_data === this.addedCabinetData.id_data);
    }
}

export class RemoveCabinetCommand {
    constructor(objectManager, cabinetToRemove) {
        this.objectManager = objectManager;
        // Сохраняем КОПИЮ ПОЛНЫХ ДАННЫХ, но без 3D-объектов
        const { mesh, edges, frontMarker, ...dataToSave } = cabinetToRemove;
        this.cabinetData = dataToSave; 
        this.cabinetIndex = -1;
    }

    execute() {
        const cabinet = this.objectManager.getAllCabinets().find(cab => cab.id_data === this.cabinetData.id_data);
        if (!cabinet) return;

        this.cabinetIndex = this.objectManager.getAllCabinets().indexOf(cabinet);
        this.objectManager.removeCabinet(cabinet);
    }

    undo() {
        // "Воскрешаем" шкаф из сохраненных данных
        const restoredCabinet = this.objectManager.createCabinetFromData(this.cabinetData);
        if (restoredCabinet) {
            this.objectManager.registerCabinetAtIndex(restoredCabinet, this.cabinetIndex);

            // Восстанавливаем детализацию, если она была
            if (this.cabinetData.isDetailed) {
                // Индекс, на который мы вставили, теперь правильный
                window.toggleCabinetDetail(this.cabinetIndex);
            }
        }
    }
}

/**
 * Универсальная команда для изменения свойств объекта ПО ЕГО ID.
 */
/*
export class ChangePropertiesCommand {
    constructor(objectManager, target, newProperties, oldProperties, name = 'Change Properties') {
        this.objectManager = objectManager;
        this.targetId = target.id_data; // <== ИЗМЕНЕНИЕ: Храним ID, а не сам объект
        this.newProperties = { ...newProperties };
        this.oldProperties = { ...oldProperties };
        this.name = name;
    }

    // Вспомогательная функция для поиска актуального объекта
    _getTarget() {
        return this.objectManager.getAllCabinets().find(cab => cab.id_data === this.targetId);
    }

    execute() {
        const target = this._getTarget(); // <== ИЗМЕНЕНИЕ: Находим объект перед действием
        if (!target) {
            console.error(`[Command Execute] ${this.name}: Не найден объект с ID ${this.targetId}`);
            return;
        }
        
        Object.assign(target, this.newProperties);
        
        if (typeof target.updatePosition === 'function') {
            target.updatePosition();
        }
    }

    undo() {
        const target = this._getTarget(); // <== ИЗМЕНЕНИЕ: Находим объект перед действием
        if (!target) {
            console.error(`[Command Undo] ${this.name}: Не найден объект с ID ${this.targetId}`);
            return;
        }

        Object.assign(target, this.oldProperties);

        if (typeof target.updatePosition === 'function') {
            target.updatePosition();
        }
    }
}*/

/**
 * Универсальная команда для обновления состояния объекта.
 * Сохраняет полную копию данных до и после изменения.
 */
export class UpdateObjectCommand {
    constructor(objectManager, targetId, newState, oldState, name = 'Update Object') {
        this.objectManager = objectManager;
        this.targetId = targetId;
        
        // Удаляем ссылки на 3D-объекты из состояний, сохраняем только данные.
        const { mesh: n_mesh, edges: n_edges, ...newStateData } = newState;
        const { mesh: o_mesh, edges: o_edges, ...oldStateData } = oldState;

        this.newState = newStateData;
        this.oldState = oldStateData;
        this.name = name;
    }

    _getTarget() {
        return this.objectManager.getAllCabinets().find(cab => cab.id_data === this.targetId);
    }

    _applyState(state) {
        const target = this._getTarget();
        if (!target) {
            console.error(`[Command] ${this.name}: Не найден объект с ID ${this.targetId}`);
            return;
        }

        // Применяем все свойства из сохраненного состояния
        Object.assign(target, state);

        // После изменения свойств нужно полностью обновить 3D-представление.
        // Простого updatePosition может быть недостаточно, если изменился размер.
        // Нам нужна функция, которая пересоздаст меш.
        this.objectManager.updateCabinetRepresentation(target);
    }

    execute() {
        this._applyState(this.newState);
        console.log(`[Command] Executed: ${this.name}`);
    }

    undo() {
        this._applyState(this.oldState);
        console.log(`[Command] Undone: ${this.name}`);
    }
}

/**
 * Команда для добавления уже созданного (клонированного) объекта шкафа.
 */
export class AddClonedCabinetCommand {
    constructor(objectManager, clonedCabinet) {
        this.objectManager = objectManager;
        this.clonedCabinet = clonedCabinet; // Храним ссылку на уже созданный клон
        this.targetId = clonedCabinet.id_data; // Для обновления UI
    }

    execute() {
        // Просто регистрируем готовый объект в менеджере
        this.objectManager.registerCabinet(this.clonedCabinet);
    }

    undo() {
        // Удаляем этот же объект
        this.objectManager.removeCabinet(this.clonedCabinet);
    }
}

// Команда для перемещения шкафа - пока нигде не используется, вероятно можно удалить
export class MoveCabinetCommand {
    constructor(cabinet, newPosition, oldPosition) {
        this.cabinet = cabinet;
        
        // newPosition и oldPosition - это объекты с данными о позиции,
        // а не просто Vector3, т.к. у нас разные типы шкафов.
        // Например: { offsetAlongWall: 1.2 } или { offsetX: 0.5, offsetZ: 1.8 }
        this.newPosition = { ...newPosition };
        this.oldPosition = { ...oldPosition };
    }

    execute() {
        // Применяем НОВУЮ позицию к шкафу
        Object.assign(this.cabinet, this.newPosition);
        this.cabinet.updatePosition(); // Вызываем метод шкафа для обновления 3D
    }

    undo() {
        // Возвращаем СТАРУЮ позицию
        Object.assign(this.cabinet, this.oldPosition);
        this.cabinet.updatePosition();
    }
}

/**
 * Команда для добавления ГРУППЫ простых объектов (например, частей двери).
 */
export class AddGroupCommand {
    constructor(scene, objectArray, objectsToAdd) { // <== ИЗМЕНЕНИЕ: Добавлен аргумент scene
        this.scene = scene; // <== ИЗМЕНЕНИЕ: Используем аргумент
        this.objectArray = objectArray; 
        this.objectsToAdd = objectsToAdd;
    }

    execute() {
        this.objectsToAdd.forEach(obj => {
            this.objectArray.push(obj);
            if (obj.mesh) {
                this.scene.add(obj.mesh);
            }
        });
    }

    undo() {
        this.objectsToAdd.forEach(obj => {
            const index = this.objectArray.indexOf(obj);
            if (index > -1) {
                this.objectArray.splice(index, 1);
            }
            if (obj.mesh && obj.mesh.parent) {
                this.scene.remove(obj.mesh);
            }
        });
    }
}

/**
 * Команда для добавления простых объектов (окна, розетки и т.д.).
 */
export class AddObjectCommand {
    constructor(scene, objectArray, objectToAdd) {
        this.scene = scene;
        this.objectArray = objectArray; 
        this.objectToAdd = objectToAdd;
    }

    execute() {
        // Добавляем объект в массив данных
        if (!this.objectArray.includes(this.objectToAdd)) {
            this.objectArray.push(this.objectToAdd);
        }

        // Определяем, какой 3D-объект нужно добавить на сцену
        const objectForScene = this.objectToAdd.mesh || this.objectToAdd;
        
        // Добавляем 3D-объект на сцену, если его там еще нет
        if (this.scene && !objectForScene.parent) {
            this.scene.add(objectForScene);
        }
        
        if (typeof window.requestRender === 'function') {
            window.requestRender();
        }
    }

    undo() {
        // --- Удаляем объект из массива данных ---
        const index = this.objectArray.indexOf(this.objectToAdd);
        if (index > -1) {
            this.objectArray.splice(index, 1);
        }

        // ==> ИСПРАВЛЕНИЕ: Используем ту же логику для определения 3D-объекта <==
        const objectForScene = this.objectToAdd.mesh || this.objectToAdd;

        // --- Удаляем 3D-объект со сцены ---
        if (objectForScene.parent) {
            objectForScene.parent.remove(objectForScene);
        }
        
        if (typeof window.requestRender === 'function') {
            window.requestRender();
        }
    }
}

/**
 * Команда для удаления простых объектов.
 */
export class RemoveObjectCommand {
    constructor(scene, objectArray, objectToRemove) { // <== ИЗМЕНЕНИЕ: Добавлен аргумент scene
        this.scene = scene; // <== ИЗМЕНЕНИЕ: Используем аргумент
        this.objectArray = objectArray;
        this.objectToRemove = objectToRemove;
        this.index = -1;
    }

    execute() {
        this.index = this.objectArray.indexOf(this.objectToRemove);
        if (this.index > -1) {
            this.objectArray.splice(this.index, 1);
        }
        if (this.objectToRemove.mesh && this.objectToRemove.mesh.parent) {
            this.scene.remove(this.objectToRemove.mesh);
        }
    }

    undo() {
        if (this.index > -1) {
            this.objectArray.splice(this.index, 0, this.objectToRemove);
        }
        if (this.objectToRemove.mesh) {
            this.scene.add(this.objectToRemove.mesh);
        }
    }
}

/**
 * Команда для удаления ГРУППЫ простых объектов (например, частей двери).
 */
export class RemoveGroupCommand {
    constructor(scene, objectArray, objectsToRemove) {
        this.scene = scene;
        this.objectArray = objectArray;
        this.objectsToRemove = objectsToRemove; // Массив объектов для удаления
        this.removedInfo = []; // Здесь сохраним объекты и их исходные индексы
    }

    execute() {
        this.removedInfo = []; // Очищаем на случай Redo
        // Сортируем объекты для удаления по индексу в обратном порядке,
        // чтобы удаление одного не сбивало индексы следующих.
        const sortedObjects = [...this.objectsToRemove].sort((a, b) => {
            return this.objectArray.indexOf(b) - this.objectArray.indexOf(a);
        });

        sortedObjects.forEach(obj => {
            const index = this.objectArray.indexOf(obj);
            if (index > -1) {
                this.removedInfo.push({ object: obj, index: index }); // Сохраняем объект и его индекс
                this.objectArray.splice(index, 1);
                if (obj.mesh && obj.mesh.parent) {
                    this.scene.remove(obj.mesh);
                }
            }
        });
    }

    undo() {
        // Восстанавливаем объекты в их исходные позиции,
        // идя по `removedInfo` в обратном порядке (от меньшего индекса к большему).
        [...this.removedInfo].reverse().forEach(info => {
            this.objectArray.splice(info.index, 0, info.object);
            if (info.object.mesh) {
                this.scene.add(info.object.mesh);
            }
        });
    }
}

/**
 * Команда для обновления свойств ОДИНОЧНОГО простого объекта (окно, розетка).
 */
export class UpdateSimpleObjectCommand {
    constructor(target, newState, oldState) {
        this.target = target; // Прямая ссылка на объект в массиве `windows`
        this.newState = newState;
        this.oldState = oldState;
    }

    // Вспомогательный метод, который делает всю работу
    _applyState(state) {
        // 1. Применяем данные к объекту
        Object.assign(this.target, state);
        
        // 2. Обновляем его 3D-представление
        if (this.target.mesh) {
            this.target.mesh.geometry.dispose();
            this.target.mesh.geometry = new THREE.BoxGeometry(this.target.width, this.target.height, this.target.depth);
            if (this.target.edges) {
                this.target.edges.geometry.dispose();
                this.target.edges.geometry = new THREE.EdgesGeometry(this.target.mesh.geometry);
            }
            
            // Получаем размеры комнаты для позиционирования
            const currentLength = roomDimensions.getLength();
            const currentWidth = roomDimensions.getWidth();
            const currentHeight = roomDimensions.getHeight();
            
            // Код позиционирования (из твоей старой функции)
            switch (this.target.wallId) {
                case "Back":
                    this.target.mesh.position.set(-currentLength / 2 + this.target.offsetAlongWall + this.target.width / 2, -currentWidth / 2 + this.target.offsetBottom + this.target.height / 2, -currentHeight / 2 + this.target.offsetFromParentWall + this.target.depth / 2);
                    this.target.mesh.rotation.y = 0;
                    break;
                case "Left":
                    this.target.mesh.position.set(-currentLength / 2 + this.target.offsetFromParentWall + this.target.depth / 2, -currentWidth / 2 + this.target.offsetBottom + this.target.height / 2, -currentHeight / 2 + this.target.offsetAlongWall + this.target.width / 2);
                    this.target.mesh.rotation.y = THREE.MathUtils.degToRad(90);
                    break;
                case "Right":
                    this.target.mesh.position.set(currentLength / 2 - this.target.offsetFromParentWall - this.target.depth / 2, -currentWidth / 2 + this.target.offsetBottom + this.target.height / 2, -currentHeight / 2 + this.target.offsetAlongWall + this.target.width / 2);
                    this.target.mesh.rotation.y = THREE.MathUtils.degToRad(-90);
                    break;
            }
        }
    }

    execute() {
        this._applyState(this.newState);
    }

    undo() {
        this._applyState(this.oldState);
    }
}


/**
 * Команда для обновления свойств ГРУППЫ простых объектов (дверь).
 */
export class UpdateObjectsGroupCommand {
    constructor(targets, newStates, oldStates) {
        // targets - массив ссылок на объекты, newStates/oldStates - массивы данных
        this.targets = targets;
        this.newStates = newStates;
        this.oldStates = oldStates;
    }

    _applyStates(states) {
        this.targets.forEach((target, index) => {
            const state = states[index];
            if (target && state) {
                // Это "мини-версия" _applyState из команды выше
                Object.assign(target, state);
                if (target.mesh) {
                    target.mesh.geometry.dispose();
                    target.mesh.geometry = new THREE.BoxGeometry(target.width, target.height, target.depth);
                    if (target.edges) {
                        target.edges.geometry.dispose();
                        target.edges.geometry = new THREE.EdgesGeometry(target.mesh.geometry);
                    }
                    const currentLength = roomDimensions.getLength();
                    const currentWidth = roomDimensions.getWidth();
                    const currentHeight = roomDimensions.getHeight();
                    switch (target.wallId) {
                        case "Back":
                            target.mesh.position.set(-currentLength / 2 + target.offsetAlongWall + target.width / 2, -currentWidth / 2 + target.offsetBottom + target.height / 2, -currentHeight / 2 + target.offsetFromParentWall + target.depth / 2);
                            target.mesh.rotation.y = 0;
                            break;
                        case "Left":
                            target.mesh.position.set(-currentLength / 2 + target.offsetFromParentWall + target.depth / 2, -currentWidth / 2 + target.offsetBottom + target.height / 2, -currentHeight / 2 + target.offsetAlongWall + target.width / 2);
                            target.mesh.rotation.y = THREE.MathUtils.degToRad(90);
                            break;
                        case "Right":
                            target.mesh.position.set(currentLength / 2 - target.offsetFromParentWall - target.depth / 2, -currentWidth / 2 + target.offsetBottom + target.height / 2, -currentHeight / 2 + target.offsetAlongWall + target.width / 2);
                            target.mesh.rotation.y = THREE.MathUtils.degToRad(-90);
                            break;
                    }
                }
            }
        });
    }

    execute() {
        this._applyStates(this.newStates);
    }

    undo() {
        this._applyStates(this.oldStates);
    }
}

/**
 * Команда для удаления столешницы с правильной очисткой ресурсов.
 */
export class RemoveCountertopCommand {
    constructor(scene, countertopsArray, countertopToRemove) {
        this.scene = scene;
        this.countertopsArray = countertopsArray;
        this.countertopToRemove = countertopToRemove;
        this.index = -1;
    }

    execute() {
        this.index = this.countertopsArray.indexOf(this.countertopToRemove);
        if (this.index === -1) return;

        this.countertopsArray.splice(this.index, 1);
        
        if (this.countertopToRemove.parent) {
            this.countertopToRemove.parent.remove(this.countertopToRemove);
        }
        this.countertopToRemove.traverse(child => {
            if (child.isMesh || child.isLineSegments) {
                child.geometry?.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat?.dispose());
                } else {
                    child.material?.dispose();
                }
            }
        });
    }

    undo() {
        if (this.index === -1) return;
        
        this.countertopsArray.splice(this.index, 0, this.countertopToRemove);
        this.scene.add(this.countertopToRemove);
    }
}


/**
 * НОВАЯ, УНИВЕРСАЛЬНАЯ КОМАНДА ДЛЯ ОБНОВЛЕНИЯ СТОЛЕШНИЦЫ.
 * Хранит полное состояние до и после, что делает ее очень надежной.
 */
export class UpdateCountertopCommand {
    constructor(target, newState, oldState) {
        this.target = target; // Прямая ссылка на 3D-объект столешницы
        
        // Сохраняем копии состояний (объектов userData)
        this.newState = { ...newState };
        this.oldState = { ...oldState };
    }

    execute() {
        // Вызываем центральную функцию обновления, передавая ей целевое состояние и предыдущее
        // `oldState` нужен функции `updateCountertop3D` для корректного расчета сдвигов
        window.updateCountertop3D(this.target, this.newState, this.oldState);
    }

    undo() {
        // Для отмены мы применяем старое состояние, а в качестве "предыдущего" передаем новое.
        // Это позволяет `updateCountertop3D` корректно рассчитать сдвиги в обратную сторону.
        window.updateCountertop3D(this.target, this.oldState, this.newState);
    }
}

/**
 * Составная команда для обновления столешницы и связанных с ней шкафов.
 */
export class UpdateCountertopAndCabinetsCommand {
    constructor(countertop, countertopNewState, countertopOldState, affectedCabinetsStates) {
        this.countertop = countertop; // Прямая ссылка на меш столешницы
        this.countertopNewState = countertopNewState;
        this.countertopOldState = countertopOldState;
        
        // Массив вида [{ target, newState, oldState }] для каждого затронутого шкафа
        this.affectedCabinetsStates = affectedCabinetsStates; 
    }

    _applyState(countertopState, cabinetsStates) {
        // --- 1. Применяем состояние к столешнице ---
        Object.assign(this.countertop.userData, countertopState);
        
        // Обновляем 3D столешницы (код из старой UpdateCountertopCommand)
        const { length, thickness, depth, materialType, solidColor, countertopType } = this.countertop.userData;
        this.countertop.geometry.dispose();
        this.countertop.geometry = new THREE.BoxGeometry(length, thickness, depth);
        this.countertop.material = window.createCountertopMaterial({ materialType, solidColor, countertopType });
        if (this.countertop.userData.edges) {
            this.countertop.userData.edges.geometry.dispose();
            this.countertop.userData.edges.geometry = new THREE.EdgesGeometry(this.countertop.geometry);
        }
        window.updateTextureScale(this.countertop);
        
        // --- 2. Применяем состояния ко всем затронутым шкафам ---
        cabinetsStates.forEach(cabState => {
            Object.assign(cabState.target, cabState.state);
            // Вызываем updateRepresentation, который сделает все остальное
            window.objectManager.updateCabinetRepresentation(cabState.target);
        });
    }

    execute() {
        const cabinetsNewStates = this.affectedCabinetsStates.map(s => ({ target: s.target, state: s.newState }));
        this._applyState(this.countertopNewState, cabinetsNewStates);
    }

    undo() {
        const cabinetsOldStates = this.affectedCabinetsStates.map(s => ({ target: s.target, state: s.oldState }));
        this._applyState(this.countertopOldState, cabinetsOldStates);
    }
}

/**
 * Команда для изменения глобальных параметров кухни.
 * ИСПРАВЛЕННАЯ ВЕРСИЯ
 */
export class UpdateGlobalParamsCommand {
    constructor(newGlobalParams, oldGlobalParams) {
        this.newGlobalParams = { ...newGlobalParams };
        this.oldGlobalParams = { ...oldGlobalParams };
    }

    _applyState(paramsToApply) {
        // 1. Применяем новые глобальные параметры
        Object.assign(window.kitchenGlobalParams, paramsToApply);

        // 2. Обновляем шкафы (этот блок работает, не трогаем)
        window.objectManager.getAllCabinets().forEach(cabinet => {
            if (typeof window.updateCabinetOnGlobalChange === 'function') {
                window.updateCabinetOnGlobalChange(cabinet);
            }
        });

        // 3. Обновляем все столешницы
        window.countertops.forEach(countertop => {
            if (!countertop || !countertop.userData) {
                return;
            }
            
            // --- ШАГ А: Сохраняем ПОЛНОЕ старое состояние столешницы ---
            const oldState = { ...countertop.userData };

            // --- ШАГ Б: Создаем НОВОЕ состояние с обновленными глобальными параметрами ---
            const newState = {
                ...oldState,
                countertopType: paramsToApply.countertopType,
                thickness: paramsToApply.countertopThickness / 1000
            };

            // --- ШАГ В: Рассчитываем и применяем новую Y-позицию ---
            const roomHeight = roomDimensions.getWidth();
            const floorY = -roomHeight / 2;
            const newThickness = newState.thickness; // Берем толщину из НОВОГО состояния
            
            const targetTopY = floorY + (paramsToApply.countertopHeight / 1000);
            
            // Прямо здесь меняем 3D-позицию объекта
            countertop.position.y = targetTopY - newThickness / 2;
            
            // --- ШАГ Г: Вызываем функцию-визуализатор, чтобы она обновила всё остальное ---
            // Передаем ей newState (чтобы она нарисовала модель с новой толщиной и типом)
            // и oldState (чтобы она могла, если нужно, рассчитать разницу для сдвига по глубине).
            window.updateCountertop3D(countertop, newState, oldState);
        });
        
        // 4. Запрашиваем перерисовку сцены
        window.requestRender();
    }

    execute() {
        this._applyState(this.newGlobalParams);
    }

    undo() {
        this._applyState(this.oldGlobalParams);
    }
}