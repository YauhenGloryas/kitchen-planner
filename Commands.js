// Commands.js
import * as THREE from 'three';
import * as MaterialManager from './MaterialManager.js';
import { roomDimensions } from './roomManager.js';
import { buildApronGeometry } from './ApronBuilder.js';
import { createPlinth } from './PlinthFactory.js';

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

    _apply(state, prevState) {
        // Вызываем центральную функцию обновления, как и раньше
        window.updateCountertop3D(this.target, state, prevState);

        // --- НОВЫЙ БЛОК: Обновляем зависимые шкафы ---
        const wallId = state.wallId;
        if (wallId && wallId !== 'Bottom') {
            window.objectManager.getAllCabinets().forEach(cab => {
                if (cab.type === 'lowerCabinet' && cab.wallId === wallId) {
                    // Пересчитываем отступ (он сам возьмет новую глубину через getCountertopDepthForWall)
                    cab.offsetFromParentWall = window.calculateLowerCabinetOffset(cab);
                    // Обновляем 3D-позицию шкафа
                    window.updateCabinetPosition(cab);
                }
            });
        }
    }

    execute() {
        this._apply(this.newState, this.oldState);
    }

    undo() {
        this._apply(this.oldState, this.newState);
    }
}

/**
 * Команда для обновления состояния И ПОЗИЦИИ столешницы.
 */
export class UpdateCountertopCommandWithPos {
    constructor(target, newState, oldState, newPosition) {
        this.target = target;
        this.newState = { ...newState };
        this.oldState = { ...oldState };
        this.newPosition = newPosition.clone();
        this.oldPosition = target.position.clone();
    }

    execute() {
        this.target.position.copy(this.newPosition);
        // Вызываем центральную функцию, она сделает все остальное
        window.updateCountertop3D(this.target, this.newState, this.oldState);
    }

    undo() {
        this.target.position.copy(this.oldPosition);
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

/**
 * Команда для добавления техники на столешницу.
 */
export class AddApplianceCommand {
    constructor(countertop, applianceData) {
        this.countertop = countertop;
        this.applianceData = { ...applianceData };
        this.applianceId = applianceData.id;
        this.createdAppliance = null; // Можно хранить для оптимизации, но осторожно
    }

    execute() {
        // Всегда ищем, есть ли уже такой объект (на случай повторных нажатий)
        const existing = this.countertop.children.find(c => c.userData && c.userData.id === this.applianceId);
        if (existing) return; // Уже есть

        if (window.createCountertopApplianceFromData) {
            // Создаем новый
            const mesh = window.createCountertopApplianceFromData(this.countertop, this.applianceData);
            if (mesh) {
                this.countertop.userData.appliances.push(mesh.userData);
                this.createdAppliance = mesh;
            }
        }
        window.updateCountertop3D(this.countertop, this.countertop.userData);
    }

    undo() {
        // Ищем по ID и удаляем
        const target = this.countertop.children.find(c => c.userData && c.userData.id === this.applianceId);
        if (target) {
            // --- НОВОЕ: Снимаем выделение перед удалением ---
            if (window.selectedCabinets && window.selectedCabinets.includes(target)) {
                window.clearSelection(); // Или selectedCabinets = [];
                // Также полезно скрыть меню, если оно открыто
                if (window.hideAllDimensionInputs) window.hideAllDimensionInputs();
                const menu = document.getElementById('applianceMenu');
                if (menu) menu.remove();
            }
            // ------------------------------------------------
            
            this.countertop.remove(target);
            const index = this.countertop.userData.appliances.findIndex(a => a.id === this.applianceId);
            if (index > -1) this.countertop.userData.appliances.splice(index, 1);
        }
        window.updateCountertop3D(this.countertop, this.countertop.userData);
    }
}

/**
 * Команда для удаления техники.
 */
export class RemoveApplianceCommand {
    constructor(countertop, appliance) {
        this.countertop = countertop;
        this.applianceId = appliance.userData.id; // Храним ID
        this.applianceData = { ...appliance.userData }; // Копия данных для восстановления
        
        // Для undo нам нужно будет создать объект заново.
        // Мы не можем просто вернуть "старый" меш, если он был удален и очищен.
        // Поэтому мы будем использовать createCountertopApplianceFromData.
    }

    execute() {
        // Ищем актуальный меш по ID
        const target = this.countertop.children.find(c => c.userData && c.userData.id === this.applianceId);
        if (target) {
            this.countertop.remove(target);
            // Очистка ресурсов
            target.traverse(child => {
                if (child.isMesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else if (child.material) {
                        child.material.dispose();
                    }
                }
            });
            // Удаляем из userData
            const index = this.countertop.userData.appliances.findIndex(a => a.id === this.applianceId);
            if (index > -1) this.countertop.userData.appliances.splice(index, 1);
        }
        window.updateCountertop3D(this.countertop, this.countertop.userData);
    }

    undo() {
        // Восстанавливаем
        if (window.createCountertopApplianceFromData) {
            const newMesh = window.createCountertopApplianceFromData(this.countertop, this.applianceData);
            if (newMesh) {
                // Добавляем в массив данных
                this.countertop.userData.appliances.push(newMesh.userData);
            }
        }
        window.updateCountertop3D(this.countertop, this.countertop.userData);
    }
}

/**
 * Команда для изменения свойств техники (замена модели).
 */
export class UpdateApplianceCommand {
    constructor(appliance, newData, oldData) {
        // Мы храним не ссылку на меш, а ID и ссылку на родителя (столешницу),
        // чтобы найти актуальный меш.
        this.parentCountertop = appliance.parent;
        this.applianceId = appliance.userData.id;
        
        this.newData = newData;
        this.oldData = oldData;
    }
    
    _findAppliance() {
        if (!this.parentCountertop) return null;
        // Ищем среди детей столешницы объект с нужным ID
        return this.parentCountertop.children.find(child => 
            child.userData && child.userData.id === this.applianceId
        );
    }

    _apply(data) {
        const currentApplianceMesh = this._findAppliance();
        if (!currentApplianceMesh) {
            console.error("UpdateApplianceCommand: Не найден объект техники для обновления!");
            return;
        }

        if (window.replaceApplianceModel) {
            // replaceApplianceModel заменит меш в сцене и вернет новый.
            // ID в userData останется тем же, так что в следующий раз мы снова его найдем.
            const newMesh = window.replaceApplianceModel(currentApplianceMesh, data.modelName);
            
            if (newMesh) {
                // Обновляем остальные данные
                Object.assign(newMesh.userData, data);
                // Также обновляем данные в массиве родителя, чтобы при сохранении было актуально
                const appIndex = this.parentCountertop.userData.appliances.findIndex(a => a.id === this.applianceId);
                if (appIndex > -1) {
                    Object.assign(this.parentCountertop.userData.appliances[appIndex], data);
                }
            }
        }
    }

    execute() {
        this._apply(this.newData);
        if (this.parentCountertop && this.parentCountertop.userData) {
            window.updateCountertop3D(this.parentCountertop, this.parentCountertop.userData);
        }
    }

    undo() {
        this._apply(this.oldData);
        if (this.parentCountertop && this.parentCountertop.userData) {
            window.updateCountertop3D(this.parentCountertop, this.parentCountertop.userData);
        }
    }
}

export class UpdateAppliancePosCommand {
    constructor(appliance, newPos, oldPos, newDist, oldDist) {
        this.appliance = appliance;
        this.parentCountertop = appliance.parent; // <-- СОХРАНЯЕМ ССЫЛКУ
        this.newPos = newPos.clone();
        this.oldPos = oldPos.clone();
        this.newDist = newDist;
        this.oldDist = oldDist;
    }

    execute() {
        this.appliance.position.copy(this.newPos);
        this.appliance.userData.distFromLeft = this.newDist;

        console.log("UpdatePos Parent UUID:", this.parentCountertop.uuid, "In Scene:", this.parentCountertop.parent ? "Yes" : "No");

        // --- ВОТ ЭТОГО НЕ ХВАТАЕТ! ---
        if (this.parentCountertop && this.parentCountertop.userData && this.parentCountertop.userData.appliances) {
             const appData = this.parentCountertop.userData.appliances.find(a => a.id === this.appliance.userData.id);
             if (appData) {
                 // Обновляем данные в массиве, который пойдет в сохранение
                 if (appData.localPosition && typeof appData.localPosition.copy === 'function') {
                     appData.localPosition.copy(this.newPos);
                 } else {
                     appData.localPosition = { x: this.newPos.x, y: this.newPos.y, z: this.newPos.z };
                 }
                 appData.distFromLeft = this.newDist;
                 console.log("Массив данных обновлен для сохранения.");
             } else {
                 console.error("Ошибка: объект не найден в массиве данных родителя!");
             }
        }
        // -----------------------------
        
        // Обновляем вырез в столешнице!
        if (this.parentCountertop && this.parentCountertop.userData) {
             window.updateCountertop3D(this.parentCountertop, this.parentCountertop.userData);
        }
        
        // Обновляем размеры и инпуты
        if (window.selectedCabinets && window.selectedCabinets.includes(this.appliance)) {
             if (typeof window.showApplianceDimensions === 'function') {
                 window.showApplianceDimensions(this.appliance);
             }
        }
        if (typeof window.requestRender === 'function') window.requestRender();
    }

    undo() {
        this.appliance.position.copy(this.oldPos);
        this.appliance.userData.distFromLeft = this.oldDist;
        
        // Обновляем вырез (возвращаем назад)
        if (this.parentCountertop && this.parentCountertop.userData) {
             window.updateCountertop3D(this.parentCountertop, this.parentCountertop.userData);
        }

         if (window.selectedCabinets && window.selectedCabinets.includes(this.appliance)) {
             if (typeof window.showApplianceDimensions === 'function') {
                 window.showApplianceDimensions(this.appliance);
             }
        }
        if (typeof window.requestRender === 'function') window.requestRender();
    }
}

/**
 * Команда для обновления Фартука (Switch between Panel and Tiles).
 */
export class UpdateApronCommand {
    constructor(target, newState, oldState) {
        this.target = target;
        this.newState = JSON.parse(JSON.stringify(newState));
        this.oldState = JSON.parse(JSON.stringify(oldState));
    }

    _applyState(state) {
        // 1. Применяем данные
        Object.assign(this.target, state);

        // 2. Очистка старого меша
        if (this.target.mesh) {
            if (this.target.mesh.parent) {
                this.target.mesh.parent.remove(this.target.mesh);
            }
            // Рекурсивная очистка памяти
            this.target.mesh.traverse(child => {
                if (child.isMesh) {
                    if (child.geometry) child.geometry.dispose();
                    // Материалы не удаляем, они кэшируются
                }
            });
        }

        // 3. Создаем новый объект (Группу с плитками и hitBox-ом)
        // Подготовка параметров (добавляем layoutDirection)
        const buildParams = {
            width: state.width,
            height: state.height,
            depth: state.depth,
            apronType: state.apronType || 'panel',
            materialData: state.materialData,
            tileParams: {
                width: state.tileWidth || 200,
                height: state.tileHeight || 100,
                gap: state.tileGap !== undefined ? state.tileGap : 3,
                rowOffset: state.tileRowOffset || 0,
                layoutDirection: state.tileLayoutDirection || 'horizontal' // <== НОВЫЙ ПАРАМЕТР
            },
            textureOrientation: state.textureOrientation || 'horizontal'
        };

        const newMeshGroup = buildApronGeometry(buildParams);
        
        // ВАЖНО: Присваиваем обратно ссылку на userData.obj (если у тебя такая связь используется)
        newMeshGroup.userData = { ...state, isApron: true }; 
        // Если твоя система выделения полагается на uuid или id в userData:
        newMeshGroup.userData.id = this.target.id || this.target.userData?.id; 

        this.target.mesh = newMeshGroup;

        // 4. Создаем рамку выделения (Edges)
        // Ищем hitBox внутри группы (мы его там создали в Builder)
        const hitBox = newMeshGroup.userData.hitBox;
        
        if (hitBox) {
            const edgesGeometry = new THREE.EdgesGeometry(hitBox.geometry);
            const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
            const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
            
            // Edges тоже добавляем в группу, но позиционируем так же, как hitBox (он в 0,0,0 группы)
            newMeshGroup.add(edges);
            this.target.edges = edges; // Обновляем ссылку в объекте данных
        }

        // 5. Позиционируем
        if (window.updateSimpleObjectPosition) {
            window.updateSimpleObjectPosition(this.target);
        }

        // 6. Добавляем на сцену
        if (window.scene) {
            window.scene.add(newMeshGroup);
            // ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ МАТРИЦ
            newMeshGroup.updateMatrixWorld(true);
        }

        // 7. Восстанавливаем выделение (Хак для фикса "потери фокуса")
        // Если этот объект был выделен, обновляем ссылку в selectedCabinets
        if (window.selectedCabinets && window.selectedCabinets.length > 0) {
            // Если мы редактировали текущий выделенный объект
            if (window.selectedCabinets && window.selectedCabinets.includes(this.target)) {
                if (window.applyHighlight) {
                    window.applyHighlight(newMeshGroup);
                }
            }
        }
    }

    execute() {
        this._applyState(this.newState);
        if (typeof window.requestRender === 'function') window.requestRender();
    }

    undo() {
        this._applyState(this.oldState);
        if (typeof window.requestRender === 'function') window.requestRender();
    }
}

export class AddPlinthCommand {
    constructor(scene, plinthsArray, cabinets) {
        this.scene = scene;
        this.plinthsArray = plinthsArray; // Ссылка на window.plinths
        
        // Сохраняем ID шкафов, чтобы при загрузке найти их заново
        this.cabinetIds = cabinets.map(c => c.id_data);
        
        this.createdPlinth = null; // Здесь будет объект { mesh, cabinetIds, id, materialData }
    }

    execute() {
        if (!this.createdPlinth) {
            // Первый запуск: создаем геометрию
            // Находим актуальные объекты шкафов по ID (на случай undo/redo шкафов)
            const currentCabinets = window.objectManager.getAllCabinets().filter(c => this.cabinetIds.includes(c.id_data));
            
            if (currentCabinets.length === 0) return; // Шкафы удалены?

            const meshGroup = createPlinth(currentCabinets);
            if (!meshGroup) return;

            // Генерируем уникальный ID для цоколя
            const plinthId = 'plinth_' + Math.random().toString(36).substr(2, 9);
            
            // Создаем объект данных
            this.createdPlinth = {
                id: plinthId,
                type: 'plinth',
                cabinetIds: this.cabinetIds,
                materialData: null, // Пока дефолт
                mesh: meshGroup
            };
            
            // Привязываем данные к мешу
            meshGroup.userData = this.createdPlinth;
        } else {
            // Redo: восстанавливаем меш на сцену
            if (!this.createdPlinth.mesh) {
                 // Если меш был удален из памяти, пересоздаем
                 const currentCabinets = window.objectManager.getAllCabinets().filter(c => this.cabinetIds.includes(c.id_data));
                 this.createdPlinth.mesh = createPlinth(currentCabinets);
                 this.createdPlinth.mesh.userData = this.createdPlinth;
                 // Восстанавливаем материал, если был
                 // ... (позже добавим)
            }
        }

        this.plinthsArray.push(this.createdPlinth);
        this.scene.add(this.createdPlinth.mesh);
    }

    undo() {
        if (this.createdPlinth) {
            const index = this.plinthsArray.indexOf(this.createdPlinth);
            if (index > -1) {
                this.plinthsArray.splice(index, 1);
            }
            if (this.createdPlinth.mesh) {
                this.scene.remove(this.createdPlinth.mesh);
            }
        }
    }
}

export class UpdatePlinthCommand {
    constructor(target, newState, oldState) {
        this.target = target; // Объект из window.plinths
        this.newState = newState;
        this.oldState = oldState;
    }

    _apply(state) {
        Object.assign(this.target, state);
        
        // Удаляем старый меш со сцены
        if (this.target.mesh) {
            window.scene.remove(this.target.mesh);
            // dispose...
        }
        
        // Создаем новый с учетом нового материала
        // Нам нужно найти шкафы заново, так как createPlinth требует шкафы
        const cabinets = window.objectManager.getAllCabinets().filter(c => this.target.cabinetIds.includes(c.id_data));
        console.log("Command Apply: Material Data:", state.materialData); // <--- ЛОГ 2
        const newMeshGroup = createPlinth(cabinets, state.materialData); // Передаем материал!
        
        this.target.mesh = newMeshGroup;
        newMeshGroup.userData = this.target;
        
        window.scene.add(newMeshGroup);
        
        // Восстанавливаем выделение
        if (window.selectedCabinets && window.selectedCabinets.includes(this.target)) {
            if (window.applyHighlight) {
                window.applyHighlight(newMeshGroup);
            }
        }
    }

    execute() { this._apply(this.newState); }
    undo() { this._apply(this.oldState); }
}