import * as THREE from 'three';
import { createPanel, createGolaProfileMesh, calculateActualGolaHeight, getPanelThickness, getPreloadedModelClone } from './main.js'; // Импортируем нужные функции из main.js
import { kitchenGlobalParams } from './main.js'; // Импортируем глобальные параметры


// Этот объект можно будет потом вынести в отдельный файл конфигурации
const cabinetDefaultParams = {
    lowerCabinet: {
        width: 600 / 1000,
        depth: 520 / 1000,
        initialColor: 0xCCCC66,
        overhang: 18 / 1000,
        facadeThickness: 18 / 1000, // Это значение будет переопределяться из getFacadeMaterialAndThickness
        facadeGap: 0.003,
        isHeightIndependent: false,
        isHeightEditable: false,
        cabinetType: 'straight',
        cabinetConfig: 'swing',
    },
    upperCabinet: {
        width: 600 / 1000,
        depth: 350 / 1000,
        initialColor: 0xFFFFFF,
        facadeThickness: 18 / 1000,
        facadeGap: 3 / 1000,
        offsetFromParentWall: 20 / 1000,
        isHeightIndependent: false,
        isHeightEditable: false,
        cabinetType: 'straightUpper',
        cabinetConfig: 'swingUpper',
        isMezzanine: 'normal',
    },
    freestandingCabinet: {
        width: 600 / 1000,
        depth: 520 / 1000,
        initialColor: 0xCCCC66,
        overhang: 18 / 1000,
        facadeThickness: 18 / 1000,
        isHeightIndependent: true,
        cabinetType: 'straight',
        cabinetConfig: 'swing',
    }
};

// Прочие дефолтные параметры, которые ты добавляешь в большом объекте `obj`
const otherDefaults = {
    isDetailed: false,
    dishwasherWidth: '600',
    doorType: 'double',
    shelfType: 'none',
    shelfCount: 0,
    facadeCount: '2',
    drawerSet: 'D+D',
    ovenHeight: '600',
    ovenPosition: 'top',
    extraOffset: 0,
    ovenType: '600',
    ovenLevel: 'drawer',
    microwaveType: '362',
    underOvenFill: 'drawers',
    topShelves: '2',
    fridgeType: 'double',
    shelvesAbove: '1',
    visibleSide: 'none',
    doorOpening: 'left',
    verticalProfile: 'none',
    rearStretcher: 'horizontal',
    frontStretcher: 'horizontal',
    rearPanel: 'yes',
    stretcherDrop: 0,
    facadeSet: 'set1',
    bodyMaterial: 'W960SM',
    verticalGolaProfile: 'none',
    gapAboveTopFacadeMm: 3,
    fridgeNicheHeightMm: 1780,
    freezerFacadeHeightMm: 760,
    topFacade2HeightMm: 0,
    ovenColor: 'metallic',
    cornerElementWidth: 60 / 1000
};


export class Cabinet {
    constructor(options) {
        // --- 1. Инициализация ---
        this.type = options.type; // 'lowerCabinet', 'upperCabinet', 'freestandingCabinet'
        this.id_data = THREE.MathUtils.generateUUID();
        this.wallId = options.wallId;

        const defaults = cabinetDefaultParams[this.type];
        if (!defaults) throw new Error(`Unknown cabinet type: ${this.type}`);
        
        // Объединяем дефолты: сначала общие, потом для типа
        Object.assign(this, otherDefaults, defaults);

        // ==> НОВОЕ: Сохраняем зависимости внутри экземпляра класса <==
        this.dependencies = {
            roomDimensions: options.roomDimensions,
            calculateLowerCabinetOffset: options.calculateLowerCabinetOffset
        };

        // --- 2. Расчет размеров и начальных отступов ---
        this._calculateInitialDimensions(options);
        this._calculateInitialOffsets(options);

        // --- 3. Создание 3D объекта (простого куба-контейнера) ---
        this.mesh = this._createMesh();
        this.mesh.userData.cabinet = this; // ВАЖНО: обратная ссылка от Mesh к экземпляру класса

        // --- 4. Финальное позиционирование ---
        this.updatePosition();
    }

    /**
     * Создает экземпляр Cabinet из объекта с данными.
     * @param {object} data - Объект данных (из undo, save-файла).
     * @param {object} dependencies - Зависимости (roomDimensions, etc.).
     * @returns {Cabinet}
     */
    static fromData(data, dependencies) {
        // 1. Создаем "пустой" экземпляр класса, обходя конструктор
        const cabinet = Object.create(Cabinet.prototype);

        // 2. Копируем все данные из data в новый экземпляр
        Object.assign(cabinet, data);
        
        // 3. Устанавливаем зависимости
        cabinet.dependencies = dependencies;

        // 4. Создаем 3D-меш для этого экземпляра
        cabinet.mesh = cabinet._createMesh(); // Используем метод _createMesh
        cabinet.mesh.userData.cabinet = cabinet; // Обратная ссылка

        // 5. Позиционируем его
        cabinet.updatePosition();

        return cabinet;
    }

    _calculateInitialDimensions(options) {
        const { kitchenGlobalParams } = options;
        // width и depth уже установлены из defaults

        switch (this.type) {
            case 'lowerCabinet':
            case 'freestandingCabinet':
                this.height = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight) / 1000;
                break;
            case 'upperCabinet':
                this.height = (kitchenGlobalParams.totalHeight - kitchenGlobalParams.countertopHeight - kitchenGlobalParams.apronHeight) / 1000;
                break;
        }
    }

    _calculateInitialOffsets(options) {
        const { intersectPoint, roomDimensions, roomInverseMatrix, kitchenGlobalParams, calculateLowerCabinetOffset } = options;
        const localPoint = intersectPoint.clone().applyMatrix4(roomInverseMatrix);

        switch (this.type) {
            case 'lowerCabinet':
                this.offsetBottom = kitchenGlobalParams.plinthHeight / 1000;
                // Временный объект для расчета отступа
                const tempCabData = { wallId: this.wallId, type: 'lowerCabinet', depth: this.depth, overhang: this.overhang };
                this.offsetFromParentWall = calculateLowerCabinetOffset(tempCabData);
                // ... расчет offsetAlongWall ...
                break;
            case 'upperCabinet':
                this.offsetBottom = (kitchenGlobalParams.countertopHeight + kitchenGlobalParams.apronHeight) / 1000;
                this.offsetFromParentWall = this.offsetFromParentWall; // Берется из дефолтов
                // ... расчет offsetAlongWall ...
                break;
             case 'freestandingCabinet':
                this.offsetBottom = kitchenGlobalParams.plinthHeight / 1000;
                this.offsetX = localPoint.x + roomDimensions.length / 2 - this.width / 2;
                this.offsetZ = localPoint.z + roomDimensions.height / 2 - this.depth / 2;
                return; // Выходим, т.к. offsetAlongWall не нужен
        }
        
        // Общий расчет offsetAlongWall для стенных шкафов
        switch (this.wallId) {
            case "Back":
                this.offsetAlongWall = localPoint.x + roomDimensions.length / 2 - this.width / 2;
                break;
            case "Left":
            case "Right":
                this.offsetAlongWall = localPoint.z + roomDimensions.height / 2 - this.width / 2;
                break;
        }
        this.offsetAlongWall = Math.round(this.offsetAlongWall * 1000) / 1000;
    }

    _createMesh() {
        const geometry = new THREE.BoxGeometry(this.width, this.height, this.depth);
        const material = new THREE.MeshStandardMaterial({ color: this.initialColor });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 1;

        const edgesGeometry = new THREE.EdgesGeometry(geometry);
        const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
        this.edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
        this.edges.raycast = () => {};
        mesh.add(this.edges);

        if (this.type === 'freestandingCabinet') {
            const markerSize = Math.min(this.width, this.height) * 0.3;
            const markerGeometry = new THREE.PlaneGeometry(markerSize, markerSize);
            const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
            this.frontMarker = new THREE.Mesh(markerGeometry, markerMaterial);
            this.frontMarker.position.set(0, 0, this.depth / 2 + 0.001);
            this.frontMarker.raycast = () => {};
            mesh.add(this.frontMarker);
        }
        return mesh;
    }
    
    updatePosition() {
        if (!this.mesh) return;
        
        // ==> ИЗМЕНЕНИЕ: Берем зависимости из this.dependencies, сохраненных в конструкторе <==
        const { roomDimensions, calculateLowerCabinetOffset } = this.dependencies;
        
        if (!roomDimensions) {
            console.error("[Cabinet.updatePosition] Ошибка: roomDimensions не были переданы в конструктор!");
            return;
        }

        const { length: currentLength, width: currentWidth, height: currentHeight } = roomDimensions;

        let actualOffsetFromParentWall = 0;
        if (this.type === 'lowerCabinet' && this.wallId !== 'Bottom') {
            // Убедимся, что и эта зависимость на месте
            if (typeof calculateLowerCabinetOffset === 'function') {
                actualOffsetFromParentWall = calculateLowerCabinetOffset(this);
            } else {
                console.error("[Cabinet.updatePosition] Ошибка: функция calculateLowerCabinetOffset не передана!");
            }
        } else {
            actualOffsetFromParentWall = this.offsetFromParentWall || 0;
        }

        // --- Остальная часть функции остается без изменений ---
        switch (this.wallId) {
            case "Back":
                this.mesh.position.set( -currentLength / 2 + this.offsetAlongWall + this.width / 2, -currentWidth / 2 + this.offsetBottom + this.height / 2, -currentHeight / 2 + actualOffsetFromParentWall + this.depth / 2 );
                this.mesh.rotation.y = 0;
                break;
            case "Left":
                this.mesh.position.set( -currentLength / 2 + actualOffsetFromParentWall + this.depth / 2, -currentWidth / 2 + this.offsetBottom + this.height / 2, -currentHeight / 2 + this.offsetAlongWall + this.width / 2 );
                this.mesh.rotation.y = THREE.MathUtils.degToRad(90);
                break;
            case "Right":
                this.mesh.position.set( currentLength / 2 - actualOffsetFromParentWall - this.depth / 2, -currentWidth / 2 + this.offsetBottom + this.height / 2, -currentHeight / 2 + this.offsetAlongWall + this.width / 2 );
                this.mesh.rotation.y = THREE.MathUtils.degToRad(-90);
                break;
            case "Bottom": // freestanding
                const cabinetX = -roomDimensions.length / 2 + this.offsetX + this.width / 2;
                const cabinetZ = -roomDimensions.height / 2 + this.offsetZ + this.depth / 2;

                this.mesh.position.set(
                    cabinetX,
                    -roomDimensions.width / 2 + this.offsetBottom + this.height / 2,
                    cabinetZ
                );
                break;
        }
    }
}