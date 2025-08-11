// menus.js
window.facadeSetsData = window.facadeSetsData || [];

// --- Данные для Выпадающих Списков (Заглушка) ---
// В будущем будем загружать из файла
const facadeMaterialTypes = [
    { value: 'ldsp', text: 'ЛДСП' },
    { value: 'agt_supramat', text: 'AGT Supramat' },
    { value: 'agt_one_side', text: 'AGT односторонний' },
    { value: 'pet', text: 'B-Matt PET пластик' },
    { value: 'mdf_smooth', text: 'Крашеный МДФ гладкий' },
    { value: 'mdf_milled', text: 'Крашеный МДФ с фрезеровкой' },
    { value: 'cleaf', text: 'CLEAF' }
];

// Заглушка для текстур - ключ: materialType.value, значение: массив опций
const facadeTextures = {
    'ldsp': [{ value: 'oak_natural', text: 'Дуб Натуральный' }, { value: 'walnut_dark', text: 'Орех Темный' }, /*...*/],
    'agt_supramat': [{ value: 'agt_white', text: 'Белый супермат' }, { value: 'agt_grey', text: 'Серый супермат' }, /*...*/],
    'agt_one_side': [{ value: 'agt_os_white', text: 'Белый одностор.' }, { value: 'agt_os_grey', text: 'Серый одностор.' }, /*...*/],
    'pet': [{ value: 'pet_white', text: 'Белый PET' }, { value: 'pet_anthracite', text: 'Антрацит PET' }, /*...*/],
    'cleaf': [{ value: 'cleaf_concrete', text: 'Бетон' }, { value: 'cleaf_wood', text: 'Дерево Cleaf' }, /*...*/],
    // Для крашеного МДФ текстур нет
    'mdf_smooth': [],
    'mdf_milled': []
};

export function createCabinetConfigMenu(cabinetIndex, cabinets) {
    const cabinet = cabinets[cabinetIndex];
    
    let colorValue = cabinet.initialColor;
    if (typeof colorValue === 'number') {
        colorValue = `#${colorValue.toString(16).padStart(6, '0')}`;
    } else if (!colorValue.startsWith('#')) {
        colorValue = '#d2b48c';
    }

    // Получаем цвет материала шкафа
    let materialColorValue = cabinet.initialColor; // initialColor теперь цвет материала
    if (typeof materialColorValue === 'number') {
        materialColorValue = `#${materialColorValue.toString(16).padStart(6, '0')}`;
    } else if (!materialColorValue || !materialColorValue.startsWith('#')) {
        materialColorValue = '#d2b48c'; // Fallback color
    }

    // Определяем текст кнопки детализации
    const detailButtonText = cabinet.isDetailed ? 'Скрыть детали' : 'Показать детали';

    let html = `
        <h3>Настройки шкафа</h3>
        <div class="menu-content scrollable"> 
            <label>Цвет материала шкафа: <input type="color" id="cabinetMaterialColor" value="${materialColorValue}" data-set-prop="initialColor"></label> 
            <div id="specificConfigFields">
                <!-- Сюда будут вставляться поля из updateSpecificConfigFields -->
            </div>
        </div> 
        <div class="menu-buttons"> 
            <button id="toggleDetailBtn">${detailButtonText}</button> 
            <button type="button" id="applyConfigBtnInMenu">Применить</button> <!-- Добавил type="button" и window. для onclick -->
            <button type="button" onclick="hideCabinetConfigMenu()">Отмена</button> <!-- Добавил type="button" -->
        </div>
    `;
    return html;
}

export function updateSpecificConfigFields(cabinetIndex, cabinets, kitchenGlobalParams) {
    const cabinet = cabinets[cabinetIndex];
    if (!cabinet) { console.error("updateSpecificConfigFields: Шкаф не найден", cabinetIndex); return; }

    // Получаем ТЕКУЩИЙ cabinetType и cabinetConfig из объекта cabinet,
    // т.к. они могли быть обновлены перед вызовом этого меню (например, в applyChangesAndPrepareForConfigMenu)
    const cabinetType = cabinet.cabinetType;
    const cabinetConfig = cabinet.cabinetConfig;
    const specificFields = document.getElementById('specificConfigFields');
    const configMenuElement = document.getElementById('cabinetConfigMenu');

    if (!specificFields) { console.error("Element 'specificConfigFields' not found."); return; }
    // --- ПОЛУЧАЕМ ССЫЛКУ НА САМО МЕНЮ КОНФИГУРАЦИИ ---
    if (!configMenuElement) {
        console.error("[menus.js] updateSpecificConfigFields: Элемент #cabinetConfigMenu не найден!");
        return;
    }

    // --- Определение, является ли шкаф "высоким" ---
    const isTallCabinet = (cabinetType === 'straight' && ['tallStorage', 'tallOvenMicro', 'fridge'].includes(cabinetConfig));
    const isUpperCabinet = cabinet.type === 'upperCabinet'; // Флаг верхнего шкафа
    // -------------------------------------------------

    let initialCabinetHeightForFieldMm = Math.round(cabinet.height * 1000);
    let initialOffsetBottomForFieldMm = Math.round(cabinet.offsetBottom * 1000); // Для отступа от пола
    let isCabinetHeightFieldEditable = false; // По умолчанию нередактируемо, меняем при необходимости
    let isOffsetBottomFieldEditable = false; // Новое поле для редактирования отступа


    if (isUpperCabinet) {
        if (cabinet.isMezzanine === 'normal') {
            isCabinetHeightFieldEditable = cabinet.isHeightIndependent || false;
            isOffsetBottomFieldEditable = cabinet.isHeightIndependent || false; // Отступ тоже редактируем, если высота свободная

            if (!cabinet.isHeightIndependent) {
                // Расчетная высота для обычного верхнего
                initialCabinetHeightForFieldMm = Math.round(
                    (kitchenGlobalParams.totalHeight - kitchenGlobalParams.countertopHeight - kitchenGlobalParams.apronHeight)
                );
                // Расчетный отступ для обычного верхнего
                initialOffsetBottomForFieldMm = Math.round(
                    kitchenGlobalParams.countertopHeight + kitchenGlobalParams.apronHeight
                );
            } else {
                // Если свободная высота, берем текущие значения шкафа
                initialCabinetHeightForFieldMm = Math.round(cabinet.height * 1000);
                initialOffsetBottomForFieldMm = Math.round(cabinet.offsetBottom * 1000);
            }
        } else if (cabinet.isMezzanine === 'mezzanine') {
            isCabinetHeightFieldEditable = false; // Не редактируется
            isOffsetBottomFieldEditable = false;  // Не редактируется
            initialCabinetHeightForFieldMm = Math.round(kitchenGlobalParams.mezzanineHeight);
            initialOffsetBottomForFieldMm = Math.round(
                kitchenGlobalParams.totalHeight - kitchenGlobalParams.mezzanineHeight
            );
        } else if (cabinet.isMezzanine === 'underMezzanine') {
            isCabinetHeightFieldEditable = false; // Не редактируется
            isOffsetBottomFieldEditable = false;  // Не редактируется
            initialCabinetHeightForFieldMm = Math.round(
                kitchenGlobalParams.totalHeight - kitchenGlobalParams.countertopHeight - kitchenGlobalParams.apronHeight - kitchenGlobalParams.mezzanineHeight
            );
            initialOffsetBottomForFieldMm = Math.round(
                kitchenGlobalParams.countertopHeight + kitchenGlobalParams.apronHeight
            );
        }
    } else if (isTallCabinet) {
        isCabinetHeightFieldEditable = cabinet.isHeightIndependent || false;
        if (!cabinet.isHeightIndependent) {
            // Высота = Общая высота кухни - высота цоколя
            initialCabinetHeightForFieldMm = Math.round(kitchenGlobalParams.totalHeight - kitchenGlobalParams.plinthHeight);
        } else {
            // Если isHeightIndependent = true, берем текущую высоту шкафа
            initialCabinetHeightForFieldMm = Math.round(cabinet.height * 1000);
        }
    } else if (cabinetConfig === 'falsePanel') {
        const currentFpHeightOption = cabinet.fp_height_option || 'cabinetHeight';
        isCabinetHeightFieldEditable = (currentFpHeightOption === 'freeHeight');
        if (!isCabinetHeightFieldEditable) {
            const currentOffsetBottomM = ((cabinet.fp_vertical_align === 'floor' && cabinet.fp_offset_from_floor !== undefined)
                                     ? cabinet.fp_offset_from_floor
                                     : (kitchenGlobalParams.plinthHeight / 1000)) || 0;
            let calculatedFPHeightM = 0;
            switch (currentFpHeightOption) {
                case 'cabinetHeight':
                    calculatedFPHeightM = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - (currentOffsetBottomM * 1000)) / 1000;
                    break;
                case 'toGola':
                    const availableForGolaAndFacadesMm = kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - (currentOffsetBottomM * 1000);
                    const cabHeight = kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight; // <-- Важно: высота корпуса для Гола
                    const golaHeightM = (window.calculateActualGolaHeight && typeof window.calculateActualGolaHeight === 'function'
                        ? window.calculateActualGolaHeight(kitchenGlobalParams.golaMinHeightMm, (cabinet.facadeGap || 0.003) * 1000, cabHeight) / 1000 // <-- Передаем cabHeight
                        : 0.058);
                    calculatedFPHeightM = availableForGolaAndFacadesMm / 1000 - golaHeightM;
                    break;
                case 'kitchenHeight':
                    calculatedFPHeightM = (kitchenGlobalParams.totalHeight / 1000) - currentOffsetBottomM;
                    break;
            }
            initialCabinetHeightForFieldMm = Math.round(Math.max(50, calculatedFPHeightM * 1000));
        } else { // freeHeight
            initialCabinetHeightForFieldMm = cabinet.fp_custom_height !== undefined ? Math.round(cabinet.fp_custom_height * 1000) : Math.round(cabinet.height * 1000);
        }
    } else if (cabinet.type === 'lowerCabinet') {
        // Для обычных нижних шкафов высота всегда нередактируема в этом меню
        isCabinetHeightFieldEditable = false;
        initialCabinetHeightForFieldMm = Math.round(kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight);
    }
    // Для freestandingCabinet высота всегда редактируема (если isHeightIndependent = true, что по дефолту так)
    // и берется из cabinet.height, если не переопределено выше.

    const cabinetHeightFieldDisabledAttr = isCabinetHeightFieldEditable ? '' : ' disabled';
    const offsetBottomFieldDisabledAttr = isOffsetBottomFieldEditable ? '' : ' disabled'; // Для нового поля
    let fieldsHtml = `
        <label>Высота шкафа, мм: <input type="number" id="cabinetHeight" value="${initialCabinetHeightForFieldMm}" min="50"${cabinetHeightFieldDisabledAttr} data-set-prop="height"></label>`;

    if (isTallCabinet) {
        const isHeightIndependentChecked = cabinet.isHeightIndependent || false;
        fieldsHtml += `
            <label style="flex-direction: row; align-items: center;">
                <input type="checkbox" id="isHeightIndependentCheckbox" data-set-prop="isHeightIndependent" ${isHeightIndependentChecked ? 'checked' : ''}>
                Свободная высота
            </label>
        `;
    }

    // Чекбокс и поле "Отступ от пола" для ОБЫЧНЫХ ВЕРХНИХ шкафов
    if (isUpperCabinet && cabinet.isMezzanine === 'normal') {
        const isHeightIndependentChecked = cabinet.isHeightIndependent || false;
        fieldsHtml += `
            <label style="flex-direction: row; align-items: center;">
                <input type="checkbox" id="isHeightIndependentCheckboxUpper" ${isHeightIndependentChecked ? 'checked' : ''} style="width: auto; margin-right: 8px;">
                Свободная высота/положение
            </label>
            <label>Отступ от пола, мм: <input type="number" id="cabinetOffsetBottomUpper" value="${initialOffsetBottomForFieldMm}" min="0"${offsetBottomFieldDisabledAttr} data-set-prop="offsetBottom"></label>
        `;
    } else if (isUpperCabinet) { // Для антресолей/подантресолей показываем нередактируемый отступ
        fieldsHtml += `
            <label>Отступ от пола, мм: <input type="number" id="cabinetOffsetBottomUpper" value="${initialOffsetBottomForFieldMm}" min="0" disabled data-set-prop="offsetBottom"></label>
        `;
    }

    // --- Остальной HTML для других полей (без изменений, как в вашем коде) ---
    if (isUpperCabinet) {
        fieldsHtml += `
        <label>Отступ от стены, мм: <input type="number" id="wallOffset" value="${Math.round((cabinet.offsetFromParentWall || 0.02) * 1000)}" min="0" data-set-prop="offsetFromParentWall"></label>`;
        fieldsHtml += `
            <label>Ширина, мм: <input type="number" id="cabinetWidth" value="${Math.round(cabinet.width * 1000)}" min="10" data-set-prop="width"></label>
            <label>Глубина, мм: <input type="number" id="cabinetDepth" value="${Math.round(cabinet.depth * 1000)}" min="100" data-set-prop="depth"></label>
            <label>Зазор между фасадами, мм: <input type="number" id="facadeGap" value="${Math.round((cabinet.facadeGap || 0.003) * 1000)}" min="0" step="1" data-set-prop="facadeGap"></label>`;
        if (cabinetConfig !== 'openUpper') {
             fieldsHtml += generateFacadeSetSelectHTML(cabinet);
             fieldsHtml += generateTextureDirectionSelectHTML(cabinet);
        }
        switch (cabinetConfig) {
            case 'swingUpper':
                 fieldsHtml += `<label>Дверь: <select id="doorType">...</select></label>`;
                 fieldsHtml += `<label>Полка: <select id="shelfType">...</select></label>`;
                 fieldsHtml += `<label>Количество полок, шт: <input type="number" id="shelfCount" value="${cabinet.shelfCount || 0}" min="0" data-set-prop="shelfCount"></label>`;
                break;
            case 'liftUpper': /* ... */ break;
            case 'openUpper':
                  fieldsHtml += `<label>Количество полок: <input type="number" id="shelfCount" value="${cabinet.shelfCount || 2}" min="0" data-set-prop="shelfCount"></label>`;
                 break;
             case 'cornerUpperStorage':
                  fieldsHtml += `<label>Количество полок: <input type="number" id="shelfCount" value="${cabinet.shelfCount || 2}" min="0" data-set-prop="shelfCount"></label>`;
                  break;
        }
    } else { // Не верхний
        if (cabinetType === 'corner') {
            if (cabinetConfig === 'sink') {
                fieldsHtml += `
                    <label>Диаметр мойки, мм: <input type="number" id="sinkDiameter" value="${Math.round((cabinet.sinkDiameter || 0.45) * 1000)}" min="100" data-set-prop="sinkDiameter"></label>
                    <label>Тип мойки: <select id="sinkType">...</select></label>
                `;
            } else if (cabinetConfig === 'cornerStorage') {
                fieldsHtml += `<label>Количество полок: <input type="number" id="shelfCount" value="${cabinet.shelfCount || 2}" min="0" data-set-prop="shelfCount"></label>`;
            }
            fieldsHtml += generateFacadeSetSelectHTML(cabinet);
            fieldsHtml += generateTextureDirectionSelectHTML(cabinet);
        } else if (cabinetType === 'straight') {
            switch (cabinetConfig) {
                case 'swing':
                    fieldsHtml += `
                        <label>Дверь: <select id="doorType">...</select></label>
                        <label>Полка: <select id="shelfType">...</select></label>
                        <label>Количество полок, шт: <input type="number" id="shelfCount" value="${cabinet.shelfCount || 0}" min="0" data-set-prop="shelfCount"></label>
                        <label>Задняя царга: <select id="rearStretcher">...</select></label>
                        <label>Передняя царга: <select id="frontStretcher">...</select></label>
                        <label>Опуск царг от верха, мм: <input type="number" id="stretcherDrop" value="${Math.round((cabinet.stretcherDrop || 0) * 1000)}" min="0" data-set-prop="stretcherDrop"></label> 
                        <label>Задняя панель: <select id="rearPanel">...</select></label>
                    `;
                    fieldsHtml += generateFacadeSetSelectHTML(cabinet);
                    fieldsHtml += generateTextureDirectionSelectHTML(cabinet);
                    break;
                case 'drawers':
                    fieldsHtml += `
                        <label>Количество фасадов: <select id="facadeCount">...</select></label>
                        <label>Набор ящиков: <select id="drawerSet">...</select></label>
                        <label>Задняя царга: <select id="rearStretcher">...</select></label>
                        <label>Передняя царга: <select id="frontStretcher">...</select></label>
                        <label>Опуск царг от верха, мм: <input type="number" id="stretcherDrop" value="${Math.round((cabinet.stretcherDrop || 0) * 1000)}" min="0" data-set-prop="stretcherDrop"></label> 
                        <label>Задняя панель: <select id="rearPanel">...</select></label>
                    `;
                    fieldsHtml += generateFacadeSetSelectHTML(cabinet);
                    fieldsHtml += generateTextureDirectionSelectHTML(cabinet);
                    break;
                case 'oven':
                    fieldsHtml += `
                        <label>Высота духовки: <select id="ovenHeight" data-set-prop="ovenHeight">...</select></label>
                        <label>Расположение духовки: <select id="ovenPosition" data-set-prop="ovenPosition">...</select></label>
                        <label>Доп. отступ от столешницы, мм: <input type="number" id="extraOffset" value="${Math.round((cabinet.extraOffset || 0) * 1000)}" min="0" data-set-prop="extraOffset"></label>
                        <label>Цвет духовки: <select id="ovenColorSelect" data-set-prop="ovenColor">...</select></label>
                        <label>Задняя царга: <select id="rearStretcher" data-set-prop="rearStretcher">...</select></label>
                        <label>Передняя царга: <select id="frontStretcher" data-set-prop="frontStretcher">...</select></label>
                        <label>Опуск царг от верха, мм: <input type="number" id="stretcherDrop" value="${Math.round((cabinet.stretcherDrop || 0) * 1000)}" min="0" data-set-prop="stretcherDrop"></label> 
                    `;
                    fieldsHtml += generateFacadeSetSelectHTML(cabinet);
                    fieldsHtml += generateTextureDirectionSelectHTML(cabinet);
                    break;
                case 'tallStorage':
                    fieldsHtml += `<label>Количество полок: <input type="number" id="shelfCount" value="${cabinet.shelfCount || 4}" min="0" data-set-prop="shelfCount"></label>`;
                    fieldsHtml += generateFacadeSetSelectHTML(cabinet);
                    fieldsHtml += generateTextureDirectionSelectHTML(cabinet);
                    break;
                case 'tallOvenMicro': // Этот блок будет дополнен позже
                    const currentGapAbove = (typeof cabinet.gapAboveTopFacadeMm === 'number') ? cabinet.gapAboveTopFacadeMm : 3;
                    fieldsHtml += `
                        <label>Тип духовки: <select id="ovenType" data-set-prop="ovenType">...</select></label>
                        <label>Уровень духовки: <select id="ovenLevel" data-set-prop="ovenLevel">...</select></label>
                        <label>Тип СВЧ: <select id="microwaveType" data-set-prop="microwaveType">...</select></label>
                        <label>Цвет духовки/СВЧ: <select id="ovenColorSelect" data-set-prop="ovenColor">...</select></label>
                        <label>Заполнение под духовкой: <select id="underOvenFill" data-set-prop="underOvenFill">...</select></label>
                        <label>Полки сверху: <select id="topShelves" data-set-prop="topShelves">...</select></label>
                        <label>Зазор над верхним фасадом, мм: 
                            <input type="number" id="gapAboveTopFacadeInput" value="${currentGapAbove}" min="0" step="1" data-set-prop="gapAboveTopFacadeMm">
                        </label>
                        <label>Видимая сторона: 
                            <select id="visibleSideTall" data-set-prop="visibleSide">
                                <!-- Опции будут добавлены через populateSelectOptions -->
                            </select>
                        </label>
                        <label>Вертикальный Гола-профиль: 
                            <select id="verticalGolaProfileTall" data-set-prop="verticalGolaProfile">
                                <!-- Опции будут добавлены через populateSelectOptions -->
                            </select>
                        </label>
                    `;
                    fieldsHtml += generateFacadeSetSelectHTML(cabinet);
                    fieldsHtml += generateTextureDirectionSelectHTML(cabinet);
                    break;
                case 'fridge':
                      // Получаем текущие значения из cabinetData или устанавливаем дефолты для отображения
                    const currentFridgeType_fridge = cabinet.fridgeType || 'double';
                    const currentShelvesAbove_fridge = cabinet.shelvesAbove || '1';
                    const currentFridgeNicheHeightMm_fridge = cabinet.fridgeNicheHeightMm || 1780;
                    const currentGapAboveTopFacadeMm_fridge = cabinet.gapAboveTopFacadeMm !== undefined ? cabinet.gapAboveTopFacadeMm : 3;

                    // Дефолты для фасадов (для первоначального отображения, если их еще нет в cabinetData)
                    const currentFreezerFacadeHeightMm_fridge = cabinet.freezerFacadeHeightMm || 760;
                    // fridgeDoorFacadeHeightMm, topFacade1HeightMm, topFacade2HeightMm будут рассчитаны позже
                    // или взяты из cabinetData, если уже есть.
                    // Пока для value оставим дефолт или значение из cabinetData.
                    const currentFridgeDoorFacadeHeightMm_fridge = cabinet.fridgeDoorFacadeHeightMm || 0; // Будет readonly
                    const currentTopFacade1HeightMm_fridge = cabinet.topFacade1HeightMm || 0;
                    const currentTopFacade2HeightMm_fridge = cabinet.topFacade2HeightMm || 0;


                    fieldsHtml += `
                        <label>Тип холодильника: 
                            <select id="fridgeTypeSelect_Fridge" data-set-prop="fridgeType">
                                <!-- Опции будут добавлены через populateSelectOptions -->
                            </select>
                        </label>
                        <label>Полки над холодильником: 
                            <select id="shelvesAboveSelect_Fridge" data-set-prop="shelvesAbove">
                                <!-- Опции будут добавлены через populateSelectOptions -->
                            </select>
                        </label>
                        <label>Высота ниши под холодильник, мм: 
                            <input type="number" id="fridgeNicheHeightInput_Fridge" value="${currentFridgeNicheHeightMm_fridge}" 
                                   min="1000" max="2500" step="1" data-set-prop="fridgeNicheHeightMm">
                        </label>
                        
                        <hr style="margin: 10px 0; border-color: #eee;">
                        <p style="text-align: center; font-weight: bold; color: #444; margin-bottom: 5px;">Высоты фасадов, мм:</p>
                        
                        <label id="freezerFacadeHeightLabel_Fridge" style="display: ${currentFridgeType_fridge === 'double' ? 'flex' : 'none'};">Фасад морозильной камеры: 
                            <input type="number" id="freezerFacadeHeightInput_Fridge" value="${currentFreezerFacadeHeightMm_fridge}" 
                                   min="500" step="1" data-set-prop="freezerFacadeHeightMm">
                        </label>
                        <label>Фасад холодильной камеры: 
                            <input type="number" id="fridgeDoorFacadeHeightInput_Fridge" value="${currentFridgeDoorFacadeHeightMm_fridge}" 
                                   readonly class="readonly-style" data-set-prop="fridgeDoorFacadeHeightMm">
                        </label>
                        <label>Верхний фасад №1: 
                            <input type="number" id="topFacade1HeightInput_Fridge" value="${currentTopFacade1HeightMm_fridge}" 
                                   min="50" step="1" data-set-prop="topFacade1HeightMm">
                        </label>
                        <label>Верхний фасад №2: 
                            <input type="number" id="topFacade2HeightInput_Fridge" value="${currentTopFacade2HeightMm_fridge}" 
                                   min="0" step="1" data-set-prop="topFacade2HeightMm">
                        </label>
                        <hr style="margin: 10px 0; border-color: #eee;">

                        <label>Зазор над верхним фасадом, мм: 
                            <input type="number" id="gapAboveTopFacadeFridgeInput" value="${currentGapAboveTopFacadeMm_fridge}" 
                                   min="0" step="1" data-set-prop="gapAboveTopFacadeMm">
                        </label>
                        <label>Видимая сторона: 
                            <select id="visibleSideFridge" data-set-prop="visibleSide">
                                <!-- Опции будут добавлены через populateSelectOptions -->
                            </select>
                        </label>
                        <label>Открывание (для однокамерного): 
                            <select id="doorOpeningFridge" data-set-prop="doorOpening">
                                <!-- Опции будут добавлены через populateSelectOptions -->
                            </select>
                        </label>
                        <label>Вертикальный Гола-профиль: 
                            <select id="verticalGolaProfileFridge" data-set-prop="verticalGolaProfile">
                                <!-- Опции будут добавлены через populateSelectOptions -->
                            </select>
                        </label>
                    `;
                    fieldsHtml += generateFacadeSetSelectHTML(cabinet);
                    fieldsHtml += generateTextureDirectionSelectHTML(cabinet);
                    break;
                case 'dishwasher':
                    fieldsHtml += `<label>Ширина ПММ: <select id="dishwasherWidth">...</select></label>`;
                    fieldsHtml += generateFacadeSetSelectHTML(cabinet);
                    fieldsHtml += generateTextureDirectionSelectHTML(cabinet);
                    break;
                case 'falsePanel':
                    // ... (Ваш существующий HTML для falsePanel без поля высоты) ...
                    const fpTypeCurrent_UI = cabinet.fp_type || 'narrow';
                    const fpHeightOptionCurrent_UI = cabinet.fp_height_option || 'cabinetHeight'; // Уже не используется для поля #cabinetHeight
                    const fpVerticalAlignCurrent_UI = cabinet.fp_vertical_align || 'cabinetBottom';
                    const fpDisplayWideWidthMm_UI = Math.round(cabinet.width * 1000);
                    const fpDisplayWideDepthMm_UI = Math.round(cabinet.depth * 1000);
                    let initialFpDepthInputMm_UI = 80;
                    if (fpTypeCurrent_UI === 'decorativePanel') initialFpDepthInputMm_UI = 582;
                    else if (fpTypeCurrent_UI === 'wideLeft' || fpTypeCurrent_UI === 'wideRight') {
                        const { thickness: facadeThicknessM } = window.getFacadeMaterialAndThickness(cabinet);
                        initialFpDepthInputMm_UI = Math.round(facadeThicknessM * 1000);
                    }
                    // Для поля "Свободная высота ФП" (#fp_custom_height), значение будет равно initialCabinetHeightForFieldMm,
                    // если fp_height_option === 'freeHeight'. Иначе оно будет равно той же расчетной высоте, что и #cabinetHeight
                    const fpCustomHeightMmValue_UI = initialCabinetHeightForFieldMm; // Используем уже рассчитанное значение

                    const fpOffsetFromFloorMmValue_UI = cabinet.fp_offset_from_floor !== undefined ? Math.round(cabinet.fp_offset_from_floor * 1000) : 0;
                    const customHeightDisabledAttrFP_UI = (cabinet.fp_height_option || 'cabinetHeight') !== 'freeHeight' ? 'disabled' : ''; // Для #fp_custom_height
                    const offsetFromFloorDisabledAttrFP_UI = (cabinet.fp_vertical_align || 'cabinetBottom') !== 'floor' ? 'disabled' : '';
                    const fpDepthInputDisabledAttr_UI = (fpTypeCurrent_UI === 'wideLeft' || fpTypeCurrent_UI === 'wideRight') ? 'disabled' : '';

                    fieldsHtml += `
                        <p style="text-align: center; color: #555; margin-top:10px; font-weight:bold;">-- Настройки Фальш-панели --</p>
                        <label>Тип фальш-панели:
                            <select id="fp_type" data-set-prop="fp_type">
                                <option value="narrow" ${fpTypeCurrent_UI === 'narrow' ? 'selected' : ''}>Узкая (торец)</option>
                                <option value="wideLeft" ${fpTypeCurrent_UI === 'wideLeft' ? 'selected' : ''}>Широкая (слева от шкафа)</option>
                                <option value="wideRight" ${fpTypeCurrent_UI === 'wideRight' ? 'selected' : ''}>Широкая (справа от шкафа)</option>
                                <option value="decorativePanel" ${fpTypeCurrent_UI === 'decorativePanel' ? 'selected' : ''}>Декоративная панель (на стену)</option>
                            </select>
                        </label>

                        <label style="display: ${ (fpTypeCurrent_UI === 'wideLeft' || fpTypeCurrent_UI === 'wideRight') ? 'flex' : 'none' };" id="fp_display_wide_width_label">Ширина лицевой части, мм (для широкой):
                            <input type="number" id="fp_display_wide_width" value="${fpDisplayWideWidthMm_UI}" readonly class="readonly-style">
                        </label>
                        <label style="display: ${ (fpTypeCurrent_UI === 'wideLeft' || fpTypeCurrent_UI === 'wideRight') ? 'flex' : 'none' };" id="fp_display_wide_depth_label">Глубина держателя, мм (для широкой):
                            <input type="number" id="fp_display_wide_depth" value="${fpDisplayWideDepthMm_UI}" readonly class="readonly-style">
                        </label>

                        <label>Глубина панели/фасада, мм (для узкой/декор./широкой):
                            <input type="number" id="fp_depth_input" value="${initialFpDepthInputMm_UI}" min="10" data-set-prop="fp_depth" ${fpDepthInputDisabledAttr_UI}>
                        </label>

                        <label>Высота фальш-панели:
                            <select id="fp_height_option" data-set-prop="fp_height_option">
                                <option value="cabinetHeight" ${fpHeightOptionCurrent_UI === 'cabinetHeight' ? 'selected' : ''}>По высоте шкафа</option>
                                <option value="toGola" ${fpHeightOptionCurrent_UI === 'toGola' ? 'selected' : ''}>До Гола-профиля</option>
                                <option value="kitchenHeight" ${fpHeightOptionCurrent_UI === 'kitchenHeight' ? 'selected' : ''}>По высоте кухни</option>
                                <option value="freeHeight" ${fpHeightOptionCurrent_UI === 'freeHeight' ? 'selected' : ''}>Свободная высота</option>
                            </select>
                        </label>
                        <label>Свободная высота, мм (ФП):
                            <input type="number" id="fp_custom_height" value="${fpCustomHeightMmValue_UI}" min="50" data-set-prop="fp_custom_height" ${customHeightDisabledAttrFP_UI}>
                        </label>
                        <label>Расположение по высоте:
                            <select id="fp_vertical_align" data-set-prop="fp_vertical_align">
                                <option value="cabinetBottom" ${fpVerticalAlignCurrent_UI === 'cabinetBottom' ? 'selected' : ''}>От низа шкафов</option>
                                <option value="floor" ${fpVerticalAlignCurrent_UI === 'floor' ? 'selected' : ''}>От пола</option>
                            </select>
                        </label>
                        <label>Расстояние от пола, мм (ФП):
                            <input type="number" id="fp_offset_from_floor" value="${fpOffsetFromFloorMmValue_UI}" min="0" data-set-prop="fp_offset_from_floor" ${offsetFromFloorDisabledAttrFP_UI}>
                        </label>
                    `;
                    fieldsHtml += generateFacadeSetSelectHTML(cabinet);
                    fieldsHtml += generateTextureDirectionSelectHTML(cabinet);
                    break;
                default: break;
            }
        }
    }
    // -------------------------------------------------------------------

    specificFields.innerHTML = fieldsHtml;
    populateSelectOptions(cabinet); // Заполняет опции для всех select'ов

        // --- Слушатели для динамического обновления полей фасадов холодильника ---
    if (cabinet.cabinetConfig === 'fridge') {
        const fridgeInputsToWatch = [
            'fridgeTypeSelect_Fridge',
            'fridgeNicheHeightInput_Fridge',
            'freezerFacadeHeightInput_Fridge',
            'topFacade1HeightInput_Fridge',
            'topFacade2HeightInput_Fridge',
            'gapAboveTopFacadeFridgeInput'
        ];

        fridgeInputsToWatch.forEach(inputId => {
            // Для select используем событие 'change', для input[type=number] - 'input' или 'change'
            // Внутри configMenuElement ищем input/select с нужным ID
            const element = configMenuElement.querySelector(`#${inputId}`);
            if (element) {
                const eventType = (element.tagName === 'SELECT') ? 'change' : 'input';
                
                // Удаляем старый слушатель, если он был (по имени функции)
                if (element._fridgeFieldsUpdateListener) {
                    element.removeEventListener(eventType, element._fridgeFieldsUpdateListener);
                }

                // Создаем новый слушатель
                element._fridgeFieldsUpdateListener = (event) => {
                    console.log(`Событие ${eventType} на элементе ${event.target.id}`);
                    // Вызываем updateFridgeFacadeFieldsLogic, передавая ID измененного инпута
                    updateFridgeFacadeFieldsLogic(cabinets[cabinetIndex], configMenuElement, kitchenGlobalParams, event.target.id);
                };
                element.addEventListener(eventType, element._fridgeFieldsUpdateListener);
            }
        });

        // --- Первоначальный вызов для расчета значений при открытии меню ---
        console.log("Первоначальный вызов updateFridgeFacadeFieldsLogic при открытии меню холодильника");
        updateFridgeFacadeFieldsLogic(cabinets[cabinetIndex], configMenuElement, kitchenGlobalParams, null);
    }
    // --- Конец слушателей для холодильника ---

    const isTallCabinet_forListener = (cabinet.cabinetType === 'straight' && ['tallStorage', 'tallOvenMicro', 'fridge'].includes(cabinet.cabinetConfig));
    
    // --- Добавляем слушатель для чекбокса "Свободная высота" ---
    if (isTallCabinet_forListener) {
        console.log(`[menus.js] updateSpecificConfigFields: Настройка слушателя для высокого шкафа, индекс ${cabinetIndex}`);

        // --- ИЗМЕНЕНИЕ: Ищем элементы ВНУТРИ configMenuElement ---
        const isHeightIndependentCheckbox = configMenuElement.querySelector('#isHeightIndependentCheckbox');
        const cabinetHeightInput = configMenuElement.querySelector('#cabinetHeight');
        // --------------------------------------------------------

        console.log(`  DOM Checkbox (из configMenu):`, isHeightIndependentCheckbox);
        console.log(`  DOM Height Input (из configMenu):`, cabinetHeightInput);

        if (isHeightIndependentCheckbox && cabinetHeightInput) {
            // ... (остальной код слушателя без изменений, он теперь будет работать с правильными элементами) ...
            const oldListener = isHeightIndependentCheckbox._listener;
            if (oldListener) {
                isHeightIndependentCheckbox.removeEventListener('change', oldListener);
            }

            const listener = (event) => {
                console.log(`[menus.js] Listener ЧЕКБОКСА 'isHeightIndependent' сработал для индекса ${cabinetIndex}`);
                const isChecked = event.target.checked;
                console.log(`  Чекбокс теперь: ${isChecked ? 'ОТМЕЧЕН' : 'СНЯТ'}`);

                cabinets[cabinetIndex].isHeightIndependent = isChecked;
                console.log(`  cabinets[${cabinetIndex}].isHeightIndependent обновлен на: ${cabinets[cabinetIndex].isHeightIndependent}`);

                cabinetHeightInput.disabled = !isChecked; // Эта строка ТЕПЕРЬ должна работать правильно
                console.log(`  cabinetHeightInput.disabled установлен в: ${cabinetHeightInput.disabled}`);

                if (!isChecked) {
                    const calculatedHeightMm = Math.round(kitchenGlobalParams.totalHeight - kitchenGlobalParams.plinthHeight);
                    cabinetHeightInput.value = calculatedHeightMm;
                    console.log(`  Полю cabinetHeightInput присвоено значение (расчетное): ${cabinetHeightInput.value} мм`);
                    
                    cabinets[cabinetIndex].height = calculatedHeightMm / 1000;
                    console.log(`  Высота cabinets[${cabinetIndex}].height ПЕРЕСЧИТАНА (чекбокс снят): ${cabinets[cabinetIndex].height} м`);
                } else {
                    console.log(`  Поле cabinetHeightInput РАЗБЛОКИРОВАНО. Текущее значение в поле: ${cabinetHeightInput.value} мм`);
                    console.log(`  Значение cabinets[${cabinetIndex}].height остается: ${cabinets[cabinetIndex].height} м`);
                }
                console.log(`  ПРОВЕРКА ПОСЛЕ: cabinetHeightInput.disabled = ${cabinetHeightInput.disabled}, cabinetHeightInput.value = ${cabinetHeightInput.value}`);
                console.log(`  ПРОВЕРКА ПОСЛЕ: cabinets[${cabinetIndex}].isHeightIndependent = ${cabinets[cabinetIndex].isHeightIndependent}, cabinets[${cabinetIndex}].height = ${cabinets[cabinetIndex].height}`);
            };
            isHeightIndependentCheckbox.addEventListener('change', listener);
            isHeightIndependentCheckbox._listener = listener;

            console.log(`  ИНИЦИАЛИЗАЦИЯ ПОЛЕЙ для шкафа ${cabinetIndex}:`);
            console.log(`    Начальное cabinet.isHeightIndependent: ${cabinets[cabinetIndex].isHeightIndependent}`);
            console.log(`    Начальное cabinet.height: ${cabinets[cabinetIndex].height} м`);

            if (!cabinets[cabinetIndex].isHeightIndependent) {
                 const calculatedHeightMmOnInit = Math.round(kitchenGlobalParams.totalHeight - kitchenGlobalParams.plinthHeight);
                 cabinetHeightInput.value = calculatedHeightMmOnInit;
                 console.log(`    Полю cabinetHeightInput (т.к. НЕ isHeightIndependent) присвоено: ${cabinetHeightInput.value} мм`);
            } else {
                 cabinetHeightInput.value = Math.round(cabinets[cabinetIndex].height * 1000);
                 console.log(`    Полю cabinetHeightInput (т.к. isHeightIndependent) присвоено: ${cabinetHeightInput.value} мм (из cabinet.height)`);
            }
            
            cabinetHeightInput.disabled = !cabinets[cabinetIndex].isHeightIndependent;
            console.log(`    Финальное cabinetHeightInput.disabled при инициализации: ${cabinetHeightInput.disabled}`);
        } else {
            if (!isHeightIndependentCheckbox) console.error(`  [menus.js] Элемент #isHeightIndependentCheckbox в #cabinetConfigMenu НЕ НАЙДЕН!`);
            if (!cabinetHeightInput) console.error(`  [menus.js] Элемент #cabinetHeight в #cabinetConfigMenu НЕ НАЙДЕН!`);
        }
    }

    // --- НОВЫЙ Слушатель для чекбокса "Свободная высота/положение" ОБЫЧНЫХ ВЕРХНИХ шкафов ---
    if (isUpperCabinet && cabinet.isMezzanine === 'normal') {
        const isHeightIndependentCheckboxUpper = configMenuElement.querySelector('#isHeightIndependentCheckboxUpper');
        const cabinetHeightInputUpper = configMenuElement.querySelector('#cabinetHeight'); // То же поле высоты
        const cabinetOffsetBottomInputUpper = configMenuElement.querySelector('#cabinetOffsetBottomUpper');

        if (isHeightIndependentCheckboxUpper && cabinetHeightInputUpper && cabinetOffsetBottomInputUpper) {
            const oldListener = isHeightIndependentCheckboxUpper._listenerUpper;
            if (oldListener) {
                isHeightIndependentCheckboxUpper.removeEventListener('change', oldListener);
            }

            const listenerUpper = (event) => {
                const isChecked = event.target.checked;
                cabinets[cabinetIndex].isHeightIndependent = isChecked; // Обновляем данные шкафа
                cabinetHeightInputUpper.disabled = !isChecked;
                cabinetOffsetBottomInputUpper.disabled = !isChecked;

                if (!isChecked) { // Чекбокс снят -> расчетные значения
                    const calculatedHeightMm = Math.round(
                        (kitchenGlobalParams.totalHeight - kitchenGlobalParams.countertopHeight - kitchenGlobalParams.apronHeight)
                    );
                    const calculatedOffsetBottomMm = Math.round(
                        kitchenGlobalParams.countertopHeight + kitchenGlobalParams.apronHeight
                    );

                    cabinetHeightInputUpper.value = calculatedHeightMm;
                    cabinetOffsetBottomInputUpper.value = calculatedOffsetBottomMm;

                    cabinets[cabinetIndex].height = calculatedHeightMm / 1000;
                    cabinets[cabinetIndex].offsetBottom = calculatedOffsetBottomMm / 1000;
                    console.log(`Верхний шкаф ${cabinetIndex} ПЕРЕСЧИТАН (чекбокс снят): H=${cabinets[cabinetIndex].height.toFixed(3)}м, OB=${cabinets[cabinetIndex].offsetBottom.toFixed(3)}м`);
                } else { // Чекбокс установлен
                    // Значения в полях остаются теми, что были до установки чекбокса (или текущие из cabinet)
                    // Пользователь теперь может их редактировать.
                    // cabinets[cabinetIndex].height и .offsetBottom НЕ МЕНЯЮТСЯ здесь.
                    // Они изменятся, только если пользователь введет новые значения и нажмет "Применить".
                    console.log(`Поля для верхнего шкафа ${cabinetIndex} РАЗБЛОКИРОВАНЫ. H_field=${cabinetHeightInputUpper.value}, OB_field=${cabinetOffsetBottomInputUpper.value}`);
                }
            };
            isHeightIndependentCheckboxUpper.addEventListener('change', listenerUpper);
            isHeightIndependentCheckboxUpper._listenerUpper = listenerUpper;

            // Инициализация состояния полей при открытии
            cabinetHeightInputUpper.disabled = !cabinets[cabinetIndex].isHeightIndependent;
            cabinetOffsetBottomInputUpper.disabled = !cabinets[cabinetIndex].isHeightIndependent;
            if (!cabinets[cabinetIndex].isHeightIndependent) {
                cabinetHeightInputUpper.value = initialCabinetHeightForFieldMm; // Уже рассчитано выше
                cabinetOffsetBottomInputUpper.value = initialOffsetBottomForFieldMm; // Уже рассчитано выше
            }
        }
    }

    // Слушатели для ФП (остаются без изменений)
    if (cabinetConfig === 'falsePanel') {
        setTimeout(() => {
            //const configMenu = document.getElementById('cabinetConfigMenu');
            if (!configMenuElement || configMenuElement.style.display === 'none') return;
            const currentCabinetData = window.cabinets[cabinetIndex];
            if (!currentCabinetData || currentCabinetData.cabinetConfig !== 'falsePanel') return;

            const fpTypeSelect = configMenuElement.querySelector('#fp_type');
            const fpDepthInput = configMenuElement.querySelector('#fp_depth_input');
            const fpDisplayWideWidthLabel = configMenuElement.querySelector('#fp_display_wide_width_label');
            const fpDisplayWideDepthLabel = configMenuElement.querySelector('#fp_display_wide_depth_label');
            const fpDisplayWideWidthInput = configMenuElement.querySelector('#fp_display_wide_width');
            const fpDisplayWideDepthInput = configMenuElement.querySelector('#fp_display_wide_depth');
            const fpHeightOptionSelect = configMenuElement.querySelector('#fp_height_option');
            const fpCustomHeightInput = configMenuElement.querySelector('#fp_custom_height');
            const fpVerticalAlignSelect = configMenuElement.querySelector('#fp_vertical_align');
            const fpOffsetFromFloorInput = configMenuElement.querySelector('#fp_offset_from_floor');
            const mainCabinetHeightInput = configMenuElement.querySelector('#cabinetHeight');

            const updateFPMenuUI = () => {
                if (!fpTypeSelect || !currentCabinetData) return;
                const selectedFPType = fpTypeSelect.value;
                const selectedHeightOption = fpHeightOptionSelect ? fpHeightOptionSelect.value : currentCabinetData.fp_height_option || 'cabinetHeight';
                const selectedVerticalAlign = fpVerticalAlignSelect ? fpVerticalAlignSelect.value : currentCabinetData.fp_vertical_align || 'cabinetBottom';

                let newMainCabinetHeightMm = Math.round(currentCabinetData.height * 1000);
                let newFpCustomHeightMm = currentCabinetData.fp_custom_height !== undefined ? Math.round(currentCabinetData.fp_custom_height * 1000) : newMainCabinetHeightMm;
                let mainCabinetHeightDisabled = true;
                let fpCustomHeightDisabled = true;

                if (selectedHeightOption === 'freeHeight') {
                    mainCabinetHeightDisabled = false;
                    fpCustomHeightDisabled = false;
                    newMainCabinetHeightMm = newFpCustomHeightMm;
                } else {
                    mainCabinetHeightDisabled = true;
                    fpCustomHeightDisabled = true;
                    const currentOffsetBottomM_listener = (selectedVerticalAlign === 'floor' && fpOffsetFromFloorInput && fpOffsetFromFloorInput.value !== '')
                        ? (parseFloat(fpOffsetFromFloorInput.value) / 1000)
                        : (currentCabinetData.fp_vertical_align === 'floor' && currentCabinetData.fp_offset_from_floor !== undefined ? currentCabinetData.fp_offset_from_floor : (kitchenGlobalParams.plinthHeight / 1000));
                    let calculatedFPHeightM_listener = 0;
                    switch (selectedHeightOption) {
                        case 'cabinetHeight': calculatedFPHeightM_listener = (kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - (currentOffsetBottomM_listener * 1000)) / 1000; break;
                        case 'toGola':
                            const availableForGolaMm = kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - (currentOffsetBottomM_listener * 1000);
                            const cabHeight = kitchenGlobalParams.countertopHeight - kitchenGlobalParams.countertopThickness - kitchenGlobalParams.plinthHeight;
                            const golaM = (window.calculateActualGolaHeight ? window.calculateActualGolaHeight(kitchenGlobalParams.golaMinHeightMm, (currentCabinetData.facadeGap || 0.003) * 1000, cabHeight) / 1000 : 0.058);
                            calculatedFPHeightM_listener = availableForGolaMm / 1000 - golaM; break;
                        case 'kitchenHeight': calculatedFPHeightM_listener = (kitchenGlobalParams.totalHeight / 1000) - currentOffsetBottomM_listener; break;
                    }
                    newMainCabinetHeightMm = Math.round(Math.max(50, calculatedFPHeightM_listener * 1000));
                    newFpCustomHeightMm = newMainCabinetHeightMm;
                }
                if (mainCabinetHeightInput) { mainCabinetHeightInput.value = newMainCabinetHeightMm; mainCabinetHeightInput.disabled = mainCabinetHeightDisabled; }
                if (fpCustomHeightInput) { fpCustomHeightInput.value = newFpCustomHeightMm; fpCustomHeightInput.disabled = fpCustomHeightDisabled; }
                if (fpDepthInput) {
                    if (selectedFPType === 'narrow') { fpDepthInput.value = 80; fpDepthInput.disabled = false; }
                    else if (selectedFPType === 'decorativePanel') { fpDepthInput.value = 582; fpDepthInput.disabled = false; }
                    else { const { thickness: ftM } = window.getFacadeMaterialAndThickness(currentCabinetData); fpDepthInput.value = Math.round(ftM * 1000); fpDepthInput.disabled = true; }
                }
                const showWide = selectedFPType === 'wideLeft' || selectedFPType === 'wideRight';
                if (fpDisplayWideWidthLabel) fpDisplayWideWidthLabel.style.display = showWide ? 'flex' : 'none';
                if (fpDisplayWideDepthLabel) fpDisplayWideDepthLabel.style.display = showWide ? 'flex' : 'none';
                if (showWide) {
                    if (fpDisplayWideWidthInput) fpDisplayWideWidthInput.value = Math.round(currentCabinetData.width * 1000);
                    if (fpDisplayWideDepthInput) fpDisplayWideDepthInput.value = Math.round(currentCabinetData.depth * 1000);
                }
                if (fpVerticalAlignSelect && fpOffsetFromFloorInput) {
                    const isFloor = selectedVerticalAlign === 'floor';
                    fpOffsetFromFloorInput.disabled = !isFloor;
                    if (!isFloor) fpOffsetFromFloorInput.value = 0;
                    else if (fpOffsetFromFloorInput.value === '' || !fpOffsetFromFloorInput.checkValidity()) {
                       fpOffsetFromFloorInput.value = currentCabinetData.fp_offset_from_floor !== undefined ? Math.round(currentCabinetData.fp_offset_from_floor * 1000) : 0;
                    }
                }
            };
            if (fpTypeSelect) { fpTypeSelect.removeEventListener('change', fpTypeSelect._listenerFPTypeUpdateUI); fpTypeSelect._listenerFPTypeUpdateUI = updateFPMenuUI; fpTypeSelect.addEventListener('change', updateFPMenuUI); }
            if (fpHeightOptionSelect) { fpHeightOptionSelect.removeEventListener('change', fpHeightOptionSelect._listenerHeightUpdateUI); fpHeightOptionSelect._listenerHeightUpdateUI = updateFPMenuUI; fpHeightOptionSelect.addEventListener('change', updateFPMenuUI); }
            if (fpVerticalAlignSelect) { fpVerticalAlignSelect.removeEventListener('change', fpVerticalAlignSelect._listenerAlignUpdateUI); fpVerticalAlignSelect._listenerAlignUpdateUI = updateFPMenuUI; fpVerticalAlignSelect.addEventListener('change', updateFPMenuUI); }
            updateFPMenuUI();
        }, 0);
    }
}

// Вспомогательная функция для безопасного получения числового значения из инпута
function getNumericValue(inputId, defaultValue, configMenuElement) {
    const input = configMenuElement.querySelector(`#${inputId}`);
    if (input && input.value !== '') {
        const parsed = parseFloat(input.value);
        if (!isNaN(parsed)) {
            return parsed;
        }
    }
    return defaultValue;
}

/**
 * Рассчитывает и обновляет поля высот фасадов для шкафа "Встроенный холодильник".
 * @param {object} cabinet - Текущий объект данных шкафа.
 * @param {HTMLElement} configMenuElement - DOM-элемент меню конфигурации.
 * @param {object} kitchenGlobalParams - Глобальные параметры кухни.
 * @param {string} [changedInputId] - ID инпута, который вызвал обновление (опционально).
 */
function updateFridgeFacadeFieldsLogic(cabinet, configMenuElement, kitchenGlobalParams, changedInputId) {
    if (!cabinet || cabinet.cabinetConfig !== 'fridge' || !configMenuElement) {
        return;
    }

    console.log(`[updateFridgeFacadeFieldsLogic] Запуск обновления для шкафа ${cabinet.id_data || cabinet.mesh?.uuid}. Изменен инпут: ${changedInputId || 'N/A'}`);

    // Получаем ссылки на DOM-элементы инпутов
    const fridgeTypeSelect = configMenuElement.querySelector('#fridgeTypeSelect_Fridge');
    const nicheHeightInput = configMenuElement.querySelector('#fridgeNicheHeightInput_Fridge');
    const freezerFacadeHeightInput = configMenuElement.querySelector('#freezerFacadeHeightLabel_Fridge input'); // Ищем инпут внутри label
    const fridgeDoorFacadeHeightInput = configMenuElement.querySelector('#fridgeDoorFacadeHeightInput_Fridge');
    const topFacade1HeightInput = configMenuElement.querySelector('#topFacade1HeightInput_Fridge');
    const topFacade2HeightInput = configMenuElement.querySelector('#topFacade2HeightInput_Fridge');
    const gapAboveTopFacadeInput = configMenuElement.querySelector('#gapAboveTopFacadeFridgeInput');
    const freezerFacadeLabel = configMenuElement.querySelector('#freezerFacadeHeightLabel_Fridge');


    if (!fridgeTypeSelect || !nicheHeightInput || !freezerFacadeHeightInput || !fridgeDoorFacadeHeightInput || !topFacade1HeightInput || !topFacade2HeightInput || !gapAboveTopFacadeInput || !freezerFacadeLabel) {
        console.error("[updateFridgeFacadeFieldsLogic] Не все необходимые DOM-элементы найдены!");
        return;
    }

    // --- Получаем текущие значения из DOM или данных шкафа (в мм) ---
    const currentFridgeType = fridgeTypeSelect.value;
    const nicheHeightMm = getNumericValue('fridgeNicheHeightInput_Fridge', cabinet.fridgeNicheHeightMm || 1780, configMenuElement);
    
    let freezerFacadeHeightMm = 0;
    if (currentFridgeType === 'double') {
        freezerFacadeHeightMm = getNumericValue('freezerFacadeHeightInput_Fridge', cabinet.freezerFacadeHeightMm || 760, configMenuElement);
        freezerFacadeLabel.style.display = 'flex';
        freezerFacadeHeightInput.disabled = false;
    } else {
        freezerFacadeLabel.style.display = 'none';
        freezerFacadeHeightInput.disabled = true;
        freezerFacadeHeightInput.value = 0; // Сбрасываем значение в поле, если оно невидимо
    }

    const topFacade1UserValueMm = getNumericValue('topFacade1HeightInput_Fridge', cabinet.topFacade1HeightMm || 0, configMenuElement);
    const topFacade2UserValueMm = getNumericValue('topFacade2HeightInput_Fridge', cabinet.topFacade2HeightMm || 0, configMenuElement);
    const gapAboveMm = getNumericValue('gapAboveTopFacadeFridgeInput', cabinet.gapAboveTopFacadeMm !== undefined ? cabinet.gapAboveTopFacadeMm : 3, configMenuElement);

    // --- Константы и параметры шкафа (в метрах для расчетов) ---
    const panelThicknessM = window.getPanelThickness(); // Предполагаем, что getPanelThickness доступна глобально или импортирована
    const cabOverallHeightM = cabinet.height;
    const facadeGapM = (cabinet.facadeGap || 0.003);

    // 1. Общая высота для фасадов холодильника и морозильника (totalHeightForFridgeFacadesM)
    //    fridgeNicheHeightM + толщина полки НАД холодильником + 10мм "наезда" фасадов
    const totalHeightForFridgeFacadesM = (nicheHeightMm / 1000) + panelThicknessM + 0.010;

    // 2. Высота фасада холодильной камеры (fridgeDoorFacadeHeightM)
    let fridgeDoorFacadeHeightM = 0;
    if (currentFridgeType === 'double') {
        fridgeDoorFacadeHeightM = totalHeightForFridgeFacadesM - (freezerFacadeHeightMm / 1000) - facadeGapM;
    } else { // single
        fridgeDoorFacadeHeightM = totalHeightForFridgeFacadesM;
    }
    fridgeDoorFacadeHeightM = Math.max(0, fridgeDoorFacadeHeightM); // Не может быть отрицательной
    fridgeDoorFacadeHeightInput.value = Math.round(fridgeDoorFacadeHeightM * 1000);

    // 3. Оставшееся пространство для ВЕРХНИХ фасадов (totalAvailableForTopTwoFacadesAndTheirGapM)
    //    Y верха дна шкафа: -cabOverallHeightM / 2 + panelThicknessM
    //    Y верха полки над холодильником (она же дно верхней секции):
    const y_top_of_shelf_above_fridge = (-cabOverallHeightM / 2 + panelThicknessM) + (nicheHeightMm / 1000) + panelThicknessM;
    //    Y низа крыши шкафа:
    const y_bottom_of_cabinet_roof = cabOverallHeightM / 2 - panelThicknessM;
    //    Пространство между верхом полки над холодильником и низом крыши:
    const spaceForTopSectionContentM = cabOverallHeightM - totalHeightForFridgeFacadesM - facadeGapM;//y_bottom_of_cabinet_roof - y_top_of_shelf_above_fridge;
    //    Пространство для самих фасадов (вычитаем зазор над самым верхним фасадом)
    const totalAvailableForTopTwoFacadesAndTheirGapM = spaceForTopSectionContentM - (gapAboveMm / 1000);

    // 4. Расчет и обновление Верхнего фасада №1 и №2
    let topFacade1CalcMm = 0;
    let topFacade2CalcMm = 0;

    if (totalAvailableForTopTwoFacadesAndTheirGapM > 0) {
        if (changedInputId === 'topFacade1HeightInput_Fridge') {
            // Изменился Фасад 1, пересчитываем Фасад 2
            topFacade1CalcMm = Math.max(1, topFacade1UserValueMm); // Мин. высота для введенного
            const remainingForFacade2 = (totalAvailableForTopTwoFacadesAndTheirGapM * 1000) - topFacade1CalcMm - (facadeGapM * 1000);
            topFacade2CalcMm = Math.max(0, Math.round(remainingForFacade2));
        } else if (changedInputId === 'topFacade2HeightInput_Fridge') {
            // Изменился Фасад 2, пересчитываем Фасад 1
            topFacade2CalcMm = Math.max(0, topFacade2UserValueMm); // Может быть 0
            const remainingForFacade1 = (totalAvailableForTopTwoFacadesAndTheirGapM * 1000) - topFacade2CalcMm - (facadeGapM * 1000);
            topFacade1CalcMm = Math.max(50, Math.round(remainingForFacade1));
             // Коррекция, если Фасад 1 стал меньше минимума из-за Фасада 2
             if (topFacade1CalcMm < 50 && topFacade2CalcMm > 0) {
                topFacade1CalcMm = 50;
                topFacade2CalcMm = Math.max(0, Math.round((totalAvailableForTopTwoFacadesAndTheirGapM * 1000) - topFacade1CalcMm - (facadeGapM * 1000)));
            } else if (topFacade1CalcMm < 50 && topFacade2CalcMm == 0){
                topFacade1CalcMm = Math.round(totalAvailableForTopTwoFacadesAndTheirGapM * 1000);
            }
        } else {
            // Инициализация или изменение других полей (fridgeType, nicheHeight, freezerFacadeHeight, gapAbove)
            // По вашей логике: "Изначально вся эта величина минус один зазор между фасадами вписывается в поле 2.3, а поле 2.4 равно 0"
            // Это значит, если topFacade2UserValueMm (из cabinetData) равно 0, то topFacade1 занимает всё место.
            if (topFacade2UserValueMm === 0 && (cabinet.topFacade2HeightMm === 0 || cabinet.topFacade2HeightMm === undefined )) { // ИЛИ если в данных тоже 0 (первый расчет)
                topFacade1CalcMm = Math.round(totalAvailableForTopTwoFacadesAndTheirGapM * 1000); // Без вычета зазора, т.к. второго фасада нет
                topFacade2CalcMm = 0;
            } else { // Если topFacade2 УЖЕ имеет значение > 0 (из cabinetData или был введен ранее)
                // Используем значения из полей, но приоритет отдаем изменившемуся, если он есть
                 if (changedInputId && changedInputId.startsWith('topFacade')) {
                     // Эта логика уже покрыта выше, но для ясности:
                     // Если topFacade1 изменился, topFacade1CalcMm уже установлен, topFacade2CalcMm пересчитан.
                     // Если topFacade2 изменился, topFacade2CalcMm уже установлен, topFacade1CalcMm пересчитан.
                 } else { // Изменилось что-то другое, влияющее на totalAvailable...
                      // Пытаемся сохранить пропорции или одно из значений, если это возможно
                      // Пока просто: если есть topFacade1UserValueMm, считаем от него. Иначе от topFacade2UserValueMm.
                      // Это самая сложная часть, т.к. нужно "умно" перераспределить.
                      // Проще всего: если totalAvailable... изменилось, а фасады не трогали,
                      // можно, например, пропорционально изменить оба или один из них.
                      // ДЛЯ ПРОСТОТЫ: пересчитаем как при инициализации (Фасад1 занимает все, Фасад2 = 0),
                      // ЕСЛИ ТОЛЬКО пользователь не вводил их явно (т.е. changedInputId не topFacade)
                      // ИЛИ если значения из cabinet.topFacade1HeightMm / topFacade2HeightMm невалидны
                      const sumFromData = (cabinet.topFacade1HeightMm || 0) + (cabinet.topFacade2HeightMm || 0) + ( (cabinet.topFacade1HeightMm && cabinet.topFacade2HeightMm) ? facadeGapM*1000:0 );
                      if (Math.abs(sumFromData - totalAvailableForTopTwoFacadesAndTheirGapM*1000) > 1 || !changedInputId) { // Если сумма не сходится или это первый расчет
                          topFacade1CalcMm = Math.round(totalAvailableForTopTwoFacadesAndTheirGapM * 1000);
                          topFacade2CalcMm = 0;
                           if (topFacade1CalcMm < 50 && topFacade1CalcMm >0) {topFacade1CalcMm = 50;} // если есть место хоть на один фасад, он будет мин 50
                            else if(topFacade1CalcMm <=0) {topFacade1CalcMm = 0;} // если вообще нет места
                      } else { // Сумма сходится, используем пользовательские значения
                          topFacade1CalcMm = topFacade1UserValueMm;
                          topFacade2CalcMm = topFacade2UserValueMm;
                      }
                 }
            }
        }
    } else { // totalAvailableForTopTwoFacadesAndTheirGapM <= 0
        topFacade1CalcMm = 0;
        topFacade2CalcMm = 0;
    }

    topFacade1HeightInput.value = topFacade1CalcMm;
    topFacade2HeightInput.value = topFacade2CalcMm;

    // Обновляем данные в объекте cabinet, чтобы они сохранились при нажатии "Применить"
    // Важно: это НЕ заменяет сохранение в applyConfigMenuSettings,
    // это для того, чтобы при следующем вызове updateFridgeFacadeFieldsLogic (до нажатия "Применить")
    // мы брали актуальные значения из полей.
    cabinet.fridgeType = currentFridgeType;
    cabinet.fridgeNicheHeightMm = nicheHeightMm;
    cabinet.freezerFacadeHeightMm = (currentFridgeType === 'double') ? freezerFacadeHeightMm : 0;
    cabinet.fridgeDoorFacadeHeightMm = Math.round(fridgeDoorFacadeHeightM * 1000);
    cabinet.topFacade1HeightMm = topFacade1CalcMm;
    cabinet.topFacade2HeightMm = topFacade2CalcMm;
    cabinet.gapAboveTopFacadeMm = gapAboveMm;

    console.log(`  [updateFridgeFacadeFieldsLogic] Результат: freezer=${cabinet.freezerFacadeHeightMm}, fridgeDoor=${cabinet.fridgeDoorFacadeHeightMm}, top1=${cabinet.topFacade1HeightMm}, top2=${cabinet.topFacade2HeightMm}`);
}






// --- НОВАЯ Вспомогательная функция для генерации <select> Набора Фасадов ---
function generateFacadeSetSelectHTML(cabinet) {
    let selectHTML = `<label>Фасады: <select id="facadeSet" data-set-prop="facadeSet">`;
    let currentSetValid = false; // Флаг валидности текущего выбора шкафа

    if (window.facadeSetsData && window.facadeSetsData.length > 0) {
        window.facadeSetsData.forEach((set) => {
            const isSelected = set.id === cabinet.facadeSet;
            if (isSelected) currentSetValid = true;
            selectHTML += `<option value="${set.id}" ${isSelected ? 'selected' : ''}>${set.name || `Набор (ID: ${set.id.substring(0,4)}...)`}</option>`;
        });

        // Если у шкафа невалидный или отсутствующий ID набора, выбираем первый
        if (!currentSetValid) {
             const firstSetId = window.facadeSetsData[0].id;
             console.warn(`Невалидный facadeSet (${cabinet.facadeSet}) для шкафа ${cabinet.mesh?.uuid}. Установлен первый: ${firstSetId}`);
             cabinet.facadeSet = firstSetId; // Обновляем данные шкафа (важно!)
             // Генерируем опции заново с выбранным первым
             selectHTML = `<label>Фасады: <select id="facadeSet" data-set-prop="facadeSet">`;
             window.facadeSetsData.forEach((set, index) => {
                  selectHTML += `<option value="${set.id}" ${index === 0 ? 'selected' : ''}>${set.name || `Набор ${index + 1}`}</option>`;
             });
        }
    } else {
        selectHTML += `<option value="" selected disabled>-- создайте набор фасадов --</option>`;
    }
    selectHTML += `</select></label>`;
    return selectHTML;
}

// --- НОВАЯ Вспомогательная функция для генерации <select> Направления Текстуры ---
function generateTextureDirectionSelectHTML(cabinet) {
    // Получаем текущее значение, по умолчанию 'vertical'
    const currentDirection = cabinet.textureDirection || 'vertical';

    let selectHTML = `<label>Направление текстуры:
        <select id="textureDirection" data-set-prop="textureDirection">
            <option value="vertical" ${currentDirection === 'vertical' ? 'selected' : ''}>Вертикально</option>
            <option value="horizontal" ${currentDirection === 'horizontal' ? 'selected' : ''}>Горизонтально</option>
        </select>
    </label>`;
    return selectHTML;
}

// --- НОВАЯ Вспомогательная функция для заполнения опций других select ---
function populateSelectOptions(cabinet) {
    const configMenuElement = document.getElementById('cabinetConfigMenu'); // Получаем меню
    if (!configMenuElement) return; // Если меню не существует, выходим

    // Заполняем опции для существующих select'ов (которые имели '...')
    const optionsMap = {
        'doorType': [
            { value: "none", text: "Без двери" }, { value: "left", text: "Левая" },
            { value: "right", text: "Правая" }, { value: "double", text: "Двойная" }
        ],
        'shelfType': [
                { value: "none", text: "Без полок" }, { value: "confirmat", text: "Конфирмат" },
                { value: "shelfHolder", text: "Полкодержатель" }, { value: "secura_7", text: "Secura _7" }
        ],
        'rearStretcher': [
                { value: "horizontal", text: "Горизонтальная" }, { value: "vertical", text: "Вертикальная" },
                { value: "none", text: "Нет" }
        ],
        'frontStretcher': [
                { value: "horizontal", text: "Горизонтальная" }, { value: "vertical", text: "Вертикальная" },
                { value: "none", text: "Нет" }
        ],
            'rearPanel': [
                { value: "yes", text: "Да" }, { value: "no", text: "Нет" },
                { value: "halfTop", text: "До половины сверху" }, { value: "halfBottom", text: "До половины снизу" }
            ],
            'facadeCount': [ { value: "1", text: "1" }, { value: "2", text: "2" }, { value: "3", text: "3" }, { value: "4", text: "4" } ],
            'drawerSet': [ // <-- Добавляем полный список для ящиков
            { value: "D", text: "D" }, { value: "D+D", text: "D+D" },
            { value: "D+C+M", text: "D+C+M" }, { value: "D+M+M", text: "D+M+M" },
            { value: "D+M", text: "D+M" }, { value: "D+C", text: "D+C" },
            { value: "C+C+M", text: "C+C+M" }, { value: "M+M+M+M", text: "M+M+M+M" },
            { value: "cargoBlum", text: "Карго BLUM" }, { value: "cargoMesh", text: "Карго сетчатое" }
        ],
         'ovenColorSelect': [ // Используем ID селекта как ключ
        { value: "metallic", text: "Металлик (Нерж. сталь)" },
        { value: "black", text: "Черный" },
        { value: "white", text: "Белый (глянец)" }
        ],
        'ovenHeight': [ { value: "600", text: "600 мм" }, { value: "450", text: "450 мм" } ],
        'ovenPosition': [ { value: "top", text: "Верхнее" }, { value: "bottom", text: "Нижнее" } ],
        // ... добавьте опции для ВСЕХ остальных select'ов ...
        'sinkType': [ { value: "round", text: "Круглая" }, { value: "square", text: "Квадратная" } ],
        'ovenType': [ { value: "600", text: "600 мм" }, { value: "450", text: "450 мм" }, { value: "none", text: "Нет" } ],
        'ovenLevel': [ { value: "drawer", text: "Уровень первого ящика" }, { value: "countertop", text: "Уровень столешницы" } ],
        'microwaveType': [ { value: "362", text: "Встр. 362 мм" }, { value: "380", text: "Встр. 380 мм" }, { value: "none", text: "Нет" } ],
        'underOvenFill': [ { value: "drawers", text: "Выдвижные ящики" }, { value: "swing", text: "Распашная дверь" } ],
        'topShelves': [ { value: "none", text: "Нет" }, { value: "1", text: "1" }, { value: "2", text: "2" }, { value: "3", text: "3" } ],
        'fridgeType': [ { value: "single", text: "Однокамерный" }, { value: "double", text: "Двухкамерный" } ],
        'shelvesAbove': [ { value: "none", text: "Нет" }, { value: "1", text: "1" }, { value: "2", text: "2" } ],
        'visibleSide': [ { value: "none", text: "Нет" }, { value: "left", text: "Левая" }, { value: "right", text: "Правая" }, { value: "both", text: "Обе" } ],
        'doorOpening': [ { value: "left", text: "Левое" }, { value: "right", text: "Правое" } ],
        'verticalProfile': [ { value: "none", text: "Нет" }, { value: "double", text: "Двухсторонний" }, { value: "singleWithPanel", text: "Односторонний с панелью" } ],
        'dishwasherWidth': [ { value: "450", text: "450" }, { value: "600", text: "600" } ],
        'visibleSideTall': [ 
            { value: "none", text: "Нет" },
            { value: "left", text: "Левая" },
            { value: "right", text: "Правая" },
            { value: "both", text: "Обе" }
        ],
        'verticalGolaProfileTall': [ 
            { value: "none", text: "Нет" },
            { value: "left", text: "Слева" },
            { value: "right", text: "Справа" },
            { value: "both", text: "С обоих сторон" }
        ],
        'fridgeTypeSelect_Fridge': [ // ID из HTML
            { value: "double", text: "Двухкамерный" },
            { value: "single", text: "Однокамерный" }
        ],
        'shelvesAboveSelect_Fridge': [ // ID из HTML
            { value: "none", text: "Нет" },
            { value: "1", text: "1" },
            { value: "2", text: "2" },
            { value: "3", text: "3" } // Можно добавить больше, если нужно
        ],
        'visibleSideFridge': [ /* ... как visibleSideTall ... */
            { value: "none", text: "Нет" }, { value: "left", text: "Левая" },
            { value: "right", text: "Правая" }, { value: "both", text: "Обе" }
        ],
        'doorOpeningFridge': [ /* ... как doorOpening ... */
            { value: "left", text: "Левое" }, { value: "right", text: "Правое" }
        ],
        'verticalGolaProfileFridge': [ /* ... как verticalGolaProfileTall ... */
            { value: "none", text: "Нет" }, { value: "left", text: "Слева" },
            { value: "right", text: "Справа" }, { value: "both", text: "С обоих сторон" }
        ]
};

     for (const selectId_from_map in optionsMap) { 
        const selectElement = configMenuElement.querySelector(`#${selectId_from_map}`); // Ищем ВНУТРИ меню
        
        if (selectElement) {
            selectElement.innerHTML = ''; // Очищаем placeholder '...'
            
            // Определяем имя свойства в объекте cabinet
            // Приоритет data-set-prop, если он был установлен при генерации HTML
            const propertyNameInCabinet = selectElement.dataset.setProp || selectId_from_map;
            let currentValueInCabinet = cabinet[propertyNameInCabinet];
            if (currentValueInCabinet === undefined && (propertyNameInCabinet === 'visibleSide' || propertyNameInCabinet === 'verticalGolaProfile')) {
                currentValueInCabinet = 'none';
                cabinet[propertyNameInCabinet] = 'none'; // Сохраняем дефолт в данные шкафа
            }

            // Установка дефолтов при первом открытии, если свойство не определено
            if (currentValueInCabinet === undefined) {
                switch(propertyNameInCabinet) {
                    case 'fridgeType': currentValueInCabinet = 'double'; break;
                    case 'shelvesAbove': currentValueInCabinet = '1'; break;
                    case 'visibleSide': currentValueInCabinet = 'none'; break;
                    case 'doorOpening': currentValueInCabinet = 'left'; break;
                    case 'verticalGolaProfile': currentValueInCabinet = 'none'; break;
                }
                if (currentValueInCabinet !== undefined) { // Если дефолт был назначен
                    cabinet[propertyNameInCabinet] = currentValueInCabinet;
                    console.log(`    [populate] Установлен дефолт для ${propertyNameInCabinet} (fridge): ${currentValueInCabinet}`);
                }
            }

            console.log(`  [populateSelectOptions] Для select ID: "${selectId_from_map}", ищем свойство: "${propertyNameInCabinet}", текущее значение в cabinet: "${currentValueInCabinet}"`);

            if (selectId_from_map === 'facadeSet') { // Особая обработка для facadeSet
                 if (window.facadeSetsData && window.facadeSetsData.length > 0) {
                     window.facadeSetsData.forEach((set) => {
                         const option = document.createElement('option');
                         option.value = set.id;
                         option.textContent = set.name || `Набор (ID: ${set.id.substring(0,4)}...)`;
                         if (set.id === currentValueInCabinet) {
                             option.selected = true;
                         }
                         selectElement.appendChild(option);
                     });
                 } else {
                     const option = document.createElement('option');
                     option.value = ""; option.textContent = "-- создайте набор --"; option.disabled = true; option.selected = true;
                     selectElement.appendChild(option);
                 }
            } else if (optionsMap[selectId_from_map]) { // Для всех остальных из optionsMap
                optionsMap[selectId_from_map].forEach(opt => {
                    const option = document.createElement('option');
                    option.value = opt.value;
                    option.textContent = opt.text;
                    if (opt.value === currentValueInCabinet) {
                        option.selected = true;
                    }
                    selectElement.appendChild(option);
                });
            }

            // Устанавливаем data-set-prop, ТОЛЬКО если он не был задан ранее при генерации HTML
            // Это предотвратит перезапись правильного data-set-prop="ovenColor" на data-set-prop="ovenColorSelect"
            if (!selectElement.dataset.setProp) {
                selectElement.dataset.setProp = selectId_from_map; 
            }
        }
    }
}

export function showCabinetConfigMenu(cabinetIndex, x, y, cabinets, kitchenGlobalParams) {

    let menu = document.getElementById('cabinetConfigMenu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'cabinetConfigMenu';
        menu.className = 'popup-menu'; // Используем класс для общих стилей
        document.body.appendChild(menu);
    }

    // Создаем HTML для меню
    menu.innerHTML = createCabinetConfigMenu(cabinetIndex, cabinets);

    // Устанавливаем начальную позицию
    menu.style.left = `${x + 30}px`;
    menu.style.top = `${y + 80}px`;
    menu.style.display = 'flex';

    // Находим селекторы ТИПА и КОНФИГУРАЦИИ (они могут быть в основном меню шкафа)
    const cabinetMenu = document.getElementById('cabinetMenu');
    let typeSelect = cabinetMenu ? cabinetMenu.querySelector('#cabinetType') : null;
    let configSelect = cabinetMenu ? cabinetMenu.querySelector('#cabinetConfig') : null;

    // Обновляем специфичные поля сразу при открытии
    updateSpecificConfigFields(cabinetIndex, cabinets, kitchenGlobalParams);

    const applyBtn = menu.querySelector('#applyConfigBtnInMenu'); // Предполагая, что у кнопки есть ID
    if (applyBtn) {
        // Удаляем старый слушатель, если он был, чтобы избежать дублирования и утечек
        applyBtn.removeEventListener('click', applyBtn._applyListener);
        // Создаем новый слушатель с замыканием на prevMenuState
        applyBtn._applyListener = () => {
            window.applyConfigMenuSettings(cabinetIndex);
        };
        applyBtn.addEventListener('click', applyBtn._applyListener);
    }

    // --- НОВЫЙ БЛОК ДЛЯ toggleDetailBtn ---
    const toggleDetailButton = menu.querySelector('#toggleDetailBtn');
    if (toggleDetailButton) {
        // Удаляем старый слушатель, если он мог быть (на всякий случай)
        toggleDetailButton.removeEventListener('click', toggleDetailButton._toggleDetailListener);
        
        // Создаем новый слушатель
        toggleDetailButton._toggleDetailListener = () => {
            if (typeof window.toggleCabinetDetail === 'function') {
                window.toggleCabinetDetail(cabinetIndex);
                // Обновляем текст кнопки ПОСЛЕ переключения
                const cabinet = window.cabinets[cabinetIndex]; // Получаем актуальное состояние шкафа
                if (cabinet) { // Проверяем, что шкаф еще существует
                     toggleDetailButton.textContent = cabinet.isDetailed ? 'Скрыть детали' : 'Показать детали';
                }
            } else {
                console.error("Функция window.toggleCabinetDetail не найдена!");
            }
        };
        toggleDetailButton.addEventListener('click', toggleDetailButton._toggleDetailListener);
    }
    // --- КОНЕЦ НОВОГО БЛОКА ---

    // Добавляем слушатели НА ПЕРЕКЛЮЧЕНИЕ ТИПА/КОНФИГУРАЦИИ в основном меню шкафа
    // Эти слушатели будут обновлять поля в меню конфигурации
    const updateFields = () => {
         // Проверяем, открыто ли еще меню конфигурации
         if (menu.style.display === 'block') {
              updateSpecificConfigFields(cabinetIndex, cabinets, kitchenGlobalParams);
         }
    };

    // Добавляем слушатели, если селекторы найдены
    if (typeSelect) {
        // Удаляем старый слушатель, если он был, чтобы избежать дублирования
        typeSelect.removeEventListener('change', typeSelect._updateConfigFieldsListener);
        // Сохраняем ссылку на новый слушатель
        typeSelect._updateConfigFieldsListener = updateFields;
        typeSelect.addEventListener('change', updateFields);
    }
    if (configSelect) {
        configSelect.removeEventListener('change', configSelect._updateConfigFieldsListener);
        configSelect._updateConfigFieldsListener = updateFields;
        configSelect.addEventListener('change', updateFields);
    }

    // Автоматический select() при фокусе на числовые поля
    const inputs = menu.querySelectorAll('input[type="number"]');
    inputs.forEach(input => {
        input.addEventListener('focus', () => input.select());
    });

    // Скрываем основное меню шкафа, если оно открыто
    if (cabinetMenu) {
        cabinetMenu.style.display = 'none';
    }

    // Обработка Enter внутри меню конфигурации
    menu.removeEventListener('keydown', menu._handleKeyDown); // Удаляем старый
    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            // Вызываем функцию применения изменений КОНФИГУРАЦИИ
            window.applyConfigMenuSettings(cabinetIndex); // Убедись, что эта функция доступна глобально
        }
    };
    menu.addEventListener('keydown', handleKeyDown);
    menu._handleKeyDown = handleKeyDown; // Сохраняем ссылку

    // Корректировка позиции меню
    setTimeout(() => {
        const menuWidth = menu.offsetWidth;
        const menuHeight = menu.offsetHeight;
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        let left = parseFloat(menu.style.left); // Получаем текущее значение
        let top = parseFloat(menu.style.top);

        if (left + menuWidth > screenWidth) left = screenWidth - menuWidth - 5;
        if (left < 0) left = 5;
        // --- ИСПРАВЛЕНИЕ: Коррекция по НИЖНЕЙ границе ---
        if (top + menuHeight > screenHeight) {
            top = screenHeight - menuHeight - 35; // Поднимаем меню вверх
            console.log(`[showCabinetConfigMenu] Меню скорректировано по высоте: top=${top}px`);
        }
        // --- КОНЕЦ ИСПРАВЛЕНИЯ ---
        if (top < 0) top = 40;

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;

        // Фокус на первом поле ввода в меню КОНФИГУРАЦИИ
        const firstInput = menu.querySelector('input, select');
        if (firstInput) {
            firstInput.focus();
             if(firstInput.select) firstInput.select(); // select() для текстовых/числовых полей
        }

    }, 0);
}


// Функция скрытия меню конфигурации
export function hideCabinetConfigMenu() {
    const menu = document.getElementById('cabinetConfigMenu');
    if (menu) {
        menu.style.display = 'none';
        // Удаляем слушатели с typeSelect/configSelect при закрытии, чтобы не вызывать updateFields зря
         const cabinetMenu = document.getElementById('cabinetMenu');
         if (cabinetMenu) {
             const typeSelect = cabinetMenu.querySelector('#cabinetType');
             const configSelect = cabinetMenu.querySelector('#cabinetConfig');
             if (typeSelect && typeSelect._updateConfigFieldsListener) {
                  typeSelect.removeEventListener('change', typeSelect._updateConfigFieldsListener);
                  delete typeSelect._updateConfigFieldsListener; // Очищаем ссылку
             }
             if (configSelect && configSelect._updateConfigFieldsListener) {
                  configSelect.removeEventListener('change', configSelect._updateConfigFieldsListener);
                  delete configSelect._updateConfigFieldsListener;
             }
              // Показываем основное меню шкафа обратно
              //cabinetMenu.style.display = 'block';
         }
         // Удаляем обработчик Enter
         if (menu._handleKeyDown) {
             menu.removeEventListener('keydown', menu._handleKeyDown);
             delete menu._handleKeyDown;
         }
    }
}

// --- Функция отображения Менеджера Наборов Фасадов ---
export function showFacadeSetsManager(x = window.innerWidth / 2, y = window.innerHeight / 2) {
    console.log("Открытие менеджера наборов фасадов");
    // Закрываем другие меню, если нужно
    hideKitchenParamsMenu(); // Скроем меню глобальных настроек

    let managerMenu = document.getElementById('facadeSetsManagerMenu');
    if (!managerMenu) {
        managerMenu = document.createElement('div');
        managerMenu.id = 'facadeSetsManagerMenu';
        managerMenu.className = 'facade-sets-manager'; // Новый класс для стилей
        document.body.appendChild(managerMenu);
    }

    // Генерируем HTML меню
    managerMenu.innerHTML = createFacadeSetsManagerHTML();

    // Позиционирование меню
    managerMenu.style.display = 'block';
    setTimeout(() => { // Даем время на рендеринг для расчета размеров
        const menuWidth = managerMenu.offsetWidth;
        const menuHeight = managerMenu.offsetHeight;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let adjustedX = x - menuWidth / 2; // Центрируем по X относительно точки вызова
        let adjustedY = y; // Y оставляем как передан

        // Коррекция по границам окна
        if (adjustedX + menuWidth > viewportWidth) adjustedX = viewportWidth - menuWidth - 10;
        if (adjustedY + menuHeight > viewportHeight) adjustedY = viewportHeight - menuHeight - 10;
        adjustedX = Math.max(10, adjustedX);
        adjustedY = Math.max(10, adjustedY);

        managerMenu.style.left = `${adjustedX}px`;
        managerMenu.style.top = `${adjustedY}px`;
    }, 0);

    // Добавляем обработчики (например, для кнопки "Добавить")
    const addButton = managerMenu.querySelector('#addFacadeSetBtn');
    if (addButton) {
        addButton.onclick = addFacadeSetRow; // Вызываем функцию добавления строки
    }

     // Добавляем обработчики для существующих строк (если они были загружены)
     updateRowHandlers(); // Функция для обновления обработчиков строк
}

// --- Функция генерации HTML для Менеджера ---
function createFacadeSetsManagerHTML() {
    let tableHeader = `
        <div class="facade-set-row header">
            <div class="facade-set-cell name-col">Название набора</div>
            <div class="facade-set-cell material-col">Тип материала</div>
            <div class="facade-set-cell texture-col">Текстура</div>
            <div class="facade-set-cell color-col">Цвет</div>
            <div class="facade-set-cell thickness-col">Толщина, мм</div>
            <div class="facade-set-cell actions-col"></div> 
        </div>
    `;

    let tableRows = '';
    // Генерируем строки для существующих наборов в window.facadeSetsData
    window.facadeSetsData.forEach((setData, index) => {
        tableRows += createFacadeSetRowHTML(setData, index); // Используем данные из массива
    });

    return `
        <h3>Наборы Фасадов</h3>
        <div class="facade-sets-table-container">
            ${tableHeader}
            <div id="facadeSetsRowsContainer">
                ${tableRows}
            </div>
        </div>
        <div class="manager-buttons">
            <button id="addFacadeSetBtn">Добавить набор</button>
            <button onclick="applyFacadeSetsChanges()">Применить все</button>
            <button onclick="hideFacadeSetsManager()">Закрыть</button>
        </div>
    `;
}

// --- Функция генерации HTML для ОДНОЙ Строки Набора Фасадов ---

function createFacadeSetRowHTML(setData, index) {
    const loadedFacadeData = window.facadeOptionsData || {}; // Получаем загруженные данные
    // --- Добавляем лог для проверки данных ---
    // console.log("[createFacadeSetRowHTML] Данные для генерации строки:", loadedFacadeData);
    if (Object.keys(loadedFacadeData).length === 0) {
        console.error("[createFacadeSetRowHTML] Ошибка: Загруженные данные facadeOptionsData пусты!");
    }
    // -----------------------------------------

    const setId = setData.id || `set_${Date.now()}_${index}`;
    const setName = setData.name || `Набор фасадов ${index + 1}`;
    // Определяем текущий тип материала, проверяя, есть ли он в загруженных данных
    let currentMaterialType = setData.materialType;
    if (!currentMaterialType || !loadedFacadeData[currentMaterialType]) {
        // Если тип не задан или некорректен, берем первый ключ из загруженных данных
        currentMaterialType = Object.keys(loadedFacadeData)[0];
        console.warn(`[createFacadeSetRowHTML] Тип материала для ${setId} не найден или некорректен, используется дефолтный: ${currentMaterialType}`);
        if (!currentMaterialType) { // На случай, если и данных нет
            console.error("[createFacadeSetRowHTML] Не найдено ни одного типа материала в загруженных данных!");
            currentMaterialType = 'ldsp'; // Крайний случай
        }
    }

    const currentMaterialInfo = loadedFacadeData[currentMaterialType] || {};
    const useColor = currentMaterialInfo.useColorPicker || false;
    const currentTextureValue = setData.texture;
    const currentColorValue = setData.color || '#ffffff';
    const currentThickness = setData.thickness !== undefined ? setData.thickness : currentMaterialInfo.defaultThickness || 18;
    const isThicknessEditable = currentMaterialInfo.isThicknessEditable !== undefined ? currentMaterialInfo.isThicknessEditable : true;
    const minThickness = currentMaterialInfo.minThickness || 12;
    const maxThickness = currentMaterialInfo.maxThickness || 22;

    const textureDisabled = useColor ? 'disabled' : '';
    const colorDisabled = !useColor ? 'disabled' : '';

    // --- Формируем опции для ТИПА МАТЕРИАЛА с отладкой ---
    let materialOptions = ''; // Инициализируем пустой строкой
    try {
        const materialKeys = Object.keys(loadedFacadeData);
        console.log(`[createFacadeSetRowHTML] Ключи материалов для селекта (${setId}):`, materialKeys); // Лог ключей
        if (materialKeys.length === 0) {
             console.warn(`[createFacadeSetRowHTML] Нет ключей материалов в loadedFacadeData для генерации опций!`);
        }
        materialOptions = materialKeys.map(key => {
            const materialInfo = loadedFacadeData[key];
            const name = materialInfo?.name || key; // Используем имя или ключ как fallback
            const selectedAttr = key === currentMaterialType ? 'selected' : '';
            // console.log(` - Генерация опции: value=${key}, text=${name}, selected=${selectedAttr}`); // Лог для каждой опции
            return `<option value="${key}" ${selectedAttr}>${name}</option>`;
        }).join('');
         console.log(`[createFacadeSetRowHTML] Сгенерированные опции материала (${setId}): ${materialOptions.length > 100 ? materialOptions.substring(0,100)+'...' : materialOptions}`); // Лог результата
    } catch (error) {
        console.error(`[createFacadeSetRowHTML] Ошибка при генерации опций материала для ${setId}:`, error);
        materialOptions = '<option value="">Ошибка</option>'; // Показываем ошибку в селекте
    }
    // --- Конец блока генерации опций материала ---

    // Формируем опции для текстуры/декора (оставляем как было)
    let textureOptions = '';
    // ... (Ваш существующий код генерации textureOptions) ...
    if (!useColor && currentMaterialInfo.decors && currentMaterialInfo.decors.length > 0) {
        textureOptions = currentMaterialInfo.decors.map(decor => {
            const colorSwatch = `<span class="color-swatch" style="background-color:${decor.displayColor || '#ccc'};"></span>`;
            return `<option value="${decor.value}" data-color="${decor.displayColor || '#ccc'}" ${decor.value === currentTextureValue ? 'selected' : ''}>${decor.text}</option>`;
        }).join('');
        // Добавляем цветные квадратики в CSS через data-атрибут
         const styles = currentMaterialInfo.decors.map(decor =>
            `.facade-set-row .texture-select option[data-color="${decor.displayColor || '#ccc'}"] {
                 background-image: linear-gradient(to right, ${decor.displayColor || '#ccc'}, ${decor.displayColor || '#ccc'} 16px, transparent 16px);
             }`
         ).join('\n');
         // Добавляем стили динамически (менее предпочтительно, лучше в CSS)
         /*
         let styleSheet = document.getElementById('dynamic-facade-styles');
         if (!styleSheet) {
             styleSheet = document.createElement('style');
             styleSheet.id = 'dynamic-facade-styles';
             document.head.appendChild(styleSheet);
         }
         styleSheet.textContent = styles; // Перезаписываем стили
         */

    } else if (!useColor) {
        textureOptions = '<option value="">-- Нет декоров --</option>';
    }

    // Генерируем HTML строки
    return `
        <div class="facade-set-row" data-id="${setId}" data-index="${index}">
            <div class="facade-set-cell name-col">
                <input type="text" value="${setName}" placeholder="Введите имя..." data-set-prop="name">
            </div>
            <div class="facade-set-cell material-col">
                <select class="material-type-select" data-set-prop="materialType">${materialOptions}</select>
            </div>
            <div class="facade-set-cell decor-color-col">
                <button type="button" class="decor-select-btn" title="Выбрать декор или цвет">
                </button>
            </div>
            <div class="facade-set-cell thickness-col">
                <input type="number" class="thickness-input" value="${currentThickness}"
                       min="${minThickness}" max="${maxThickness}" ${isThicknessEditable ? '' : 'readonly'}
                       data-set-prop="thickness" ${isThicknessEditable ? '' : 'class="readonly-style"'}>
            </div>
            <div class="facade-set-cell actions-col">
                 <button class="delete-set-btn" title="Удалить набор">🗑️</button>
            </div>
        </div>
    `;

    // --- Расчет displayContent и displayText для кнопки (после генерации основного HTML) ---
     // Этот код должен быть ВНУТРИ функции, но ПОСЛЕ генерации основного HTML строки
     // и перед return, чтобы обновить кнопку.
     // Проще обновить кнопку через JS после вставки строки в DOM.
     // Поэтому этот блок пока удаляем отсюда. Обновление кнопки будет в updateRowHandlers.
}

// --- Вспомогательные функции для толщины ---
function getDefaultFacadeThickness(materialType) {
    switch (materialType) {
        case 'mdf_smooth':
        case 'mdf_milled':
            return 19;
        case 'ldsp':
        case 'agt_supramat':
        case 'agt_one_side':
        case 'pet':
        case 'cleaf':
        default:
            return 18;
    }
}

function isFacadeThicknessEditable(materialType) {
    switch (materialType) {
        case 'ldsp':
        case 'mdf_smooth':
        case 'mdf_milled':
            return true;
        default:
            return false;
    }
}

function getFacadeThicknessConstraints(materialType) {
    switch (materialType) {
        case 'ldsp':
            return { minThickness: 12, maxThickness: 22 };
        case 'mdf_smooth':
        case 'mdf_milled':
            return { minThickness: 19, maxThickness: 22 };
        default:
            // Для нередактируемых возвращаем их значение по умолчанию
            const defaultThickness = getDefaultFacadeThickness(materialType);
            return { minThickness: defaultThickness, maxThickness: defaultThickness };
    }
}

// --- Функция добавления новой строки в таблицу ---
// --- Обновляем addFacadeSetRow ---
export function addFacadeSetRow() {
    console.log("Добавление нового набора фасадов");
    const loadedFacadeData = window.facadeOptionsData || {};
    const firstMaterialType = Object.keys(loadedFacadeData)[0] || 'ldsp'; // Первый доступный тип
    const firstMaterialInfo = loadedFacadeData[firstMaterialType] || {};
    const firstDecor = firstMaterialInfo.decors?.[0];

    const nextIndex = window.facadeSetsData.length;
    const newSetData = {
        id: `set_${Date.now()}_${nextIndex}`,
        name: `Набор фасадов ${nextIndex + 1}`,
        materialType: firstMaterialType,
        texture: firstMaterialInfo.useColorPicker ? null : (firstDecor?.value || ''), // Текстура или null
        color: firstMaterialInfo.useColorPicker ? '#ffffff' : null, // Белый или null
        thickness: firstMaterialInfo.defaultThickness || 18,
        // isThicknessEditable, min/max не храним здесь
    };
    window.facadeSetsData.push(newSetData);

    const rowsContainer = document.getElementById('facadeSetsRowsContainer');
    if (rowsContainer) {
        rowsContainer.insertAdjacentHTML('beforeend', createFacadeSetRowHTML(newSetData, nextIndex));
        updateRowHandlers();
    } else { console.error("Контейнер #facadeSetsRowsContainer не найден!"); }
}

// --- Обновляем updateRowHandlers, чтобы он вызывал обновление кнопки ---
function updateRowHandlers() {
    const rowsContainer = document.getElementById('facadeSetsRowsContainer');
    if (!rowsContainer) return;

    rowsContainer.querySelectorAll('.facade-set-row').forEach(row => {
        const setId = row.dataset.id;
        const rowIndex = parseInt(row.dataset.index);

        // --- Обновляем кнопку выбора декора/цвета СРАЗУ ---
        updateDecorColorButton(row); // <--- Вызываем новую функцию

        // --- Имя, Материал, Толщина, Удаление (как раньше) ---
        const nameInput = row.querySelector('input[type="text"]');
         if (nameInput) { nameInput.onchange = (e) => { const sd = window.facadeSetsData.find(s=>s.id===setId); if(sd) sd.name = e.target.value; updateDecorColorButton(row);}; } // Обновляем кнопку при смене имени тоже
        const materialSelect = row.querySelector('.material-type-select');
         if(materialSelect){ materialSelect.removeEventListener('change', handleMaterialTypeChange); materialSelect.addEventListener('change', (e) => { handleMaterialTypeChange(e); updateDecorColorButton(row); }); } // Обновляем кнопку после смены материала
        const thicknessInput = row.querySelector('.thickness-input');
         if(thicknessInput){ thicknessInput.removeEventListener('change', handleThicknessChange); thicknessInput.addEventListener('change', handleThicknessChange); }
        const deleteButton = row.querySelector('.delete-set-btn');
         if(deleteButton){ deleteButton.removeEventListener('click', handleDeleteSet); deleteButton.addEventListener('click', handleDeleteSet); }

        // --- Слушатель для кнопки выбора декора ---
        const decorButton = row.querySelector('.decor-select-btn');
        if (decorButton) {
            decorButton.replaceWith(decorButton.cloneNode(true));
            row.querySelector('.decor-select-btn').addEventListener('click', () => {
                openDecorPickerModal(rowIndex, setId);
            });
        }
    });
}

// --- Обработчик изменения типа материала ---
// --- Обновляем handleMaterialTypeChange ---
function handleMaterialTypeChange(event) {
    const select = event.target;
    const row = select.closest('.facade-set-row');
    if (!row) return;

    const newMaterialType = select.value;
    const rowIndex = parseInt(row.dataset.index);
    const setId = row.dataset.id;
    const loadedFacadeData = window.facadeOptionsData || {};
    const newMaterialInfo = loadedFacadeData[newMaterialType] || {};

    console.log(`Изменен тип материала для ${setId} на: ${newMaterialType}`);

    const setData = window.facadeSetsData.find(set => set.id === setId);
    if (!setData) { console.error(`Не найдены данные для ID ${setId}`); return; }

    // Обновляем тип материала в данных
    setData.materialType = newMaterialType;

    // Обновляем Текстуру/Цвет
    const textureSelectContainer = row.querySelector('.texture-col'); // Находим контейнер селекта
    const colorInputContainer = row.querySelector('.color-col'); // Находим контейнер цвета
    const decorButton = row.querySelector('.decor-select-btn'); // Кнопка для вызова модалки
    const useColor = newMaterialInfo.useColorPicker || false;

    // Скрываем/показываем нужные элементы УПРАВЛЕНИЯ (селект или инпут цвета)
    // Вместо этого мы обновляем кнопку decorButton ниже

    // --- ИСПРАВЛЕНИЕ: Обновление данных setData.texture или setData.color ---
    if (useColor) {
        setData.texture = null; // Сбрасываем текстуру
        // Устанавливаем цвет по умолчанию, если его нет
        if (!setData.color) {
            setData.color = '#ffffff';
        }
        console.log(` - Установлен режим выбора цвета. Цвет: ${setData.color}`);
    } else { // Используем текстуры/декоры
        setData.color = null; // Сбрасываем цвет
        // Назначаем ПЕРВЫЙ декор из списка нового материала по умолчанию
        if (newMaterialInfo.decors && newMaterialInfo.decors.length > 0) {
            setData.texture = newMaterialInfo.decors[0].value; // <--- Устанавливаем первый декор
            console.log(` - Установлен режим выбора текстуры. Декор по умолчанию: ${setData.texture}`);
        } else {
            setData.texture = ''; // Нет декоров для этого типа
            console.log(` - Текстуры для типа ${newMaterialType} не найдены.`);
        }
    }
    // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

    // Обновляем поле Толщина
    const thicknessInput = row.querySelector('.thickness-input');
    if (thicknessInput) {
        const defaultThickness = newMaterialInfo.defaultThickness || 18;
        const isEditable = newMaterialInfo.isThicknessEditable !== undefined ? newMaterialInfo.isThicknessEditable : true;
        const minThickness = newMaterialInfo.minThickness || 12;
        const maxThickness = newMaterialInfo.maxThickness || 22;

        thicknessInput.value = defaultThickness;
        thicknessInput.readOnly = !isEditable;
        thicknessInput.min = minThickness;
        thicknessInput.max = maxThickness;
        thicknessInput.classList.toggle('readonly-style', !isEditable);

        // Обновляем данные толщины
        setData.thickness = defaultThickness;
    }

    // Обновляем вид кнопки выбора декора/цвета
    updateDecorColorButton(row); // Вызываем обновление кнопки

    console.log("Обновленные данные setData после смены типа:", setData);
}

// --- Обработчик изменения толщины (Пример валидации) ---
function handleThicknessChange(event) {
    const input = event.target;
    const row = input.closest('.facade-set-row');
    if (!row) return;
    const setId = row.dataset.id;
    const setData = window.facadeSetsData.find(set => set.id === setId);

    // Получаем информацию о редактируемости и ограничениях
    const loadedFacadeData = window.facadeOptionsData || {};
    const materialInfo = loadedFacadeData[setData?.materialType] || {};
    const isEditable = materialInfo.isThicknessEditable !== undefined ? materialInfo.isThicknessEditable : true;
    const constraints = getFacadeThicknessConstraints(setData?.materialType);

    // Проверяем, найдены ли данные и редактируема ли толщина
    if (!setData || !isEditable) {
        console.log(`Толщина для ${setId} не редактируема или данные не найдены.`);
        // Восстанавливаем значение из данных или дефолтное
        input.value = setData ? (setData.thickness || constraints.minThickness) : constraints.minThickness;
        return;
    }

    let newValueMm = parseFloat(input.value.replace(',', '.'));

    // Валидация и ограничение
    if (isNaN(newValueMm)) {
         // Восстанавливаем предыдущее значение из setData ИЛИ минимум
         newValueMm = setData.thickness || constraints.minThickness;
         console.warn(`Некорректный ввод толщины, восстановлено: ${newValueMm} мм`);
    } else {
         // Ограничиваем значение по min/max
         newValueMm = Math.round(Math.max(constraints.minThickness, Math.min(constraints.maxThickness, newValueMm))); // Округляем до целого мм
    }

    input.value = newValueMm; // Обновляем поле ввода (в мм)

    // --- ИСПРАВЛЕНО: Обновляем данные в window.facadeSetsData (в мм) ---
    setData.thickness = newValueMm; // Сохраняем округленное целое значение
    // --------------------------------------------------------------

    console.log(`Толщина для ${setId} (${setData.name}) изменена на ${newValueMm} мм`);

    // --- ДОБАВЛЕНО: Пересчет позиции нижних шкафов, использующих этот набор ---
    console.log(`Пересчет позиции нижних шкафов, использующих набор ${setId}...`);
    let cabinetsUpdated = 0;
    if (typeof window.cabinets !== 'undefined' && Array.isArray(window.cabinets)) {
         window.cabinets.forEach((cab, cabIndex) => {
              if (cab.facadeSet === setId && cab.type === 'lowerCabinet' && cab.wallId !== 'Bottom') {
                   const oldOffset = cab.offsetFromParentWall;
                   cab.offsetFromParentWall = calculateLowerCabinetOffset(cab); // Пересчитываем
                   if (Math.abs(oldOffset - cab.offsetFromParentWall) > 1e-5) {
                        console.log(` - Обновление позиции шкафа ${cab.mesh?.uuid} (индекс ${cabIndex})`);
                        updateCabinetPosition(cab);
                        // Если шкаф детализирован, его нужно пересоздать, чтобы отразить новую позицию деталей
                        if (cab.isDetailed) {
                             console.log(`   - Пересоздание детализации для шкафа ${cab.mesh?.uuid}`);
                             toggleCabinetDetail(cabIndex); // -> Простой
                             toggleCabinetDetail(cabIndex); // -> Детализированный с новой позицией
                        }
                        cabinetsUpdated++;
                   }
              }
         });
    }
     console.log(`Обновлено позиций шкафов: ${cabinetsUpdated}`);
    // --- КОНЕЦ ПЕРЕСЧЕТА ---
}


// --- Обработчик удаления строки ---
function handleDeleteSet(event) {
    const button = event.target;
    const row = button.closest('.facade-set-row');
    if (!row) return;

    const setId = row.dataset.id;
    const rowIndex = parseInt(row.dataset.index);

    if (confirm(`Удалить "${window.facadeSetsData[rowIndex]?.name || 'этот набор'}"?`)) {
        console.log(`Удаление набора ID: ${setId}, Индекс: ${rowIndex}`);
        // Удаляем данные из массива
        window.facadeSetsData = window.facadeSetsData.filter(set => set.id !== setId);
        // Удаляем строку из DOM
        row.remove();
        // TODO: Перенумеровать data-index у оставшихся строк, если это важно
        // TODO: Проверить, используется ли этот набор где-то, и сбросить на дефолтный
    }
}


// --- Обновляем applyFacadeSetsChanges ---
export function applyFacadeSetsChanges() {
    // Данные УЖЕ должны быть обновлены в window.facadeSetsData благодаря onchange обработчикам
    console.log("Применение изменений наборов фасадов");
    console.log("Финальные данные:", JSON.stringify(window.facadeSetsData, null, 2));

    // TODO: Здесь можно добавить логику для сохранения данных (например, в localStorage)
    // localStorage.setItem('facadeSets', JSON.stringify(window.facadeSetsData));

    // TODO: Обновить выпадающие списки выбора набора фасадов в других частях интерфейса, если они есть
    // updateFacadeSetSelectorsInCabinets();

    if (typeof window.applyKitchenParams === 'function') {
        console.log("Вызов window.applyKitchenParams() для обновления сцены после изменения наборов фасадов...");
        window.applyKitchenParams(); // <--- ВЫЗЫВАЕМ ГЛОБАЛЬНУЮ ФУНКЦИЮ
    } else {
        console.error("Функция window.applyKitchenParams не найдена! Сцена не будет обновлена автоматически.");
        alert("Наборы фасадов сохранены, но для обновления сцены может потребоваться дополнительное действие (например, применить общие параметры кухни).");
    }

    hideFacadeSetsManager();
}

// --- Функция скрытия Менеджера ---
export function hideFacadeSetsManager() {
    const managerMenu = document.getElementById('facadeSetsManagerMenu');
    if (managerMenu) {
        managerMenu.style.display = 'none';
        // Можно показать меню глобальных настроек обратно, если оно было скрыто
         // const kitchenMenu = document.getElementById('kitchenParamsMenu');
         // if (kitchenMenu) kitchenMenu.style.display = 'block';
    }
}

export function hideKitchenParamsMenu() {
    const menu = document.getElementById('kitchenParamsMenu');
    if (menu) {
        menu.style.display = 'none';
        // Возможно, нужно удалить обработчик keydown, если он добавлялся
         if (menu._handleKeyDown) {
             menu.removeEventListener('keydown', menu._handleKeyDown);
             delete menu._handleKeyDown;
         }
    }
}

// --- Вспомогательная функция для обновления списков в меню шкафов (Пример) ---
function updateFacadeSetSelectorsInCabinets() {
    const facadeSetOptionsHTML = window.facadeSetsData.map((set, index) =>
        `<option value="${set.id}">${set.name}</option>`
    ).join('');

    // Находим все select'ы с фасадами в ДОМ (например, в открытых меню шкафов)
    document.querySelectorAll('#cabinetConfig, #cabinetConfigMenu select#facadeSet').forEach(select => {
        // Сохраняем текущее выбранное значение, если оно есть и валидно
        const currentSelectedId = select.value;
        const stillExists = window.facadeSetsData.some(set => set.id === currentSelectedId);

        select.innerHTML = facadeSetOptionsHTML; // Обновляем опции

        // Пытаемся восстановить выбор
        if (stillExists) {
            select.value = currentSelectedId;
        } else if (window.facadeSetsData.length > 0) {
            select.value = window.facadeSetsData[0].id; // Выбираем первый, если старый удален
        }
    });
}

// --- Функция открытия Модального Окна Выбора Декора ---
function openDecorPickerModal(rowIndex, setId) {
    const loadedFacadeData = window.facadeOptionsData || {};
    const setData = window.facadeSetsData.find(set => set.id === setId);
    if (!setData) { console.error("Не найдены данные для открытия модального окна"); return; }

    const materialType = setData.materialType;
    const materialInfo = loadedFacadeData[materialType] || {};
    const useColor = materialInfo.useColorPicker || false;

    // --- Создаем или находим модальное окно ---
    let modal = document.getElementById('decorPickerModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'decorPickerModal';
        modal.className = 'decor-picker-modal';
        document.body.appendChild(modal);
    }

    // --- Генерируем содержимое модального окна ---
    let modalContentHTML = `
        <div class="decor-picker-content">
            <span class="decor-picker-close">×</span>
            <div class="decor-picker-header">Выбор для: ${materialInfo.name || materialType}</div>
    `;

    if (useColor) {
        // --- Отображаем Color Picker ---
        modalContentHTML += `
            <div class="decor-color-picker-container">
                <label for="modalColorPicker">Выберите цвет:</label>
                <input type="color" id="modalColorPicker" value="${setData.color || '#ffffff'}">
            </div>
        `;
    } else if (materialInfo.decors && materialInfo.decors.length > 0) {
        // --- Отображаем Сетку Превью ---
        modalContentHTML += '<div class="decor-grid">';
        materialInfo.decors.forEach(decor => {
            let previewElement = '';
            if (decor.previewImage) {
                previewElement = `<img src="${decor.previewImage}" alt="${decor.text}" class="decor-preview-img">`;
            } else {
                previewElement = `<span class="color-swatch" style="background-color:${decor.displayColor || '#ccc'};"></span>`;
            }
            modalContentHTML += `
                <div class="decor-grid-item" data-decor-value="${decor.value}" title="${decor.text}">
                    ${previewElement}
                    <span>${decor.text}</span>
                </div>
            `;
        });
        modalContentHTML += '</div>'; // end decor-grid
    } else {
        // --- Нет ни цвета, ни декоров ---
        modalContentHTML += `<div style="text-align: center; padding: 20px;">Нет доступных опций для материала "${materialInfo.name || materialType}".</div>`;
    }

    modalContentHTML += '</div>'; // end decor-picker-content
    modal.innerHTML = modalContentHTML;

    // --- Добавляем Обработчики для Модального Окна ---
    const closeButton = modal.querySelector('.decor-picker-close');
    if (closeButton) {
        closeButton.onclick = () => modal.style.display = 'none';
    }

    // Закрытие по клику вне окна
    modal.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };

    if (useColor) {
        // Обработчик для color picker
        const colorPicker = modal.querySelector('#modalColorPicker');
        if (colorPicker) {
            colorPicker.onchange = (event) => {
                const newColor = event.target.value;
                console.log(`Выбран цвет: ${newColor} для ${setId}`);
                updateFacadeSelection(rowIndex, setId, null, newColor); // Обновляем данные и кнопку
                modal.style.display = 'none'; // Закрываем окно
            };
        }
    } else {
        // Обработчик клика по ячейке сетки
        modal.querySelectorAll('.decor-grid-item').forEach(item => {
            item.onclick = () => {
                const selectedDecorValue = item.dataset.decorValue;
                console.log(`Выбран декор: ${selectedDecorValue} для ${setId}`);
                updateFacadeSelection(rowIndex, setId, selectedDecorValue, null); // Обновляем данные и кнопку
                modal.style.display = 'none'; // Закрываем окно
            };
        });
    }

    // --- Показываем модальное окно ---
    modal.style.display = 'block';
}
// --- Вспомогательная функция для обновления данных и кнопки после выбора в модальном окне ---
// --- Обновляем updateFacadeSelection, чтобы она вызывала updateDecorColorButton ---
function updateFacadeSelection(rowIndex, setId, newTextureValue, newColorValue) {
    const setData = window.facadeSetsData.find(set => set.id === setId);
    if (!setData) return;
    const row = document.querySelector(`.facade-set-row[data-id="${setId}"]`);
    if (!row) return;

    // Обновляем данные
    setData.texture = newTextureValue;
    setData.color = newColorValue;

    // Обновляем вид кнопки
    updateDecorColorButton(row);

    console.log(`Данные для ${setId} обновлены:`, setData);
}

// --- НОВАЯ функция для обновления кнопки выбора декора/цвета ---
function updateDecorColorButton(rowElement) {
    if (!rowElement) return;
    const setId = rowElement.dataset.id;
    const setData = window.facadeSetsData.find(set => set.id === setId);
    if (!setData) return;

    const decorSelectBtn = rowElement.querySelector('.decor-select-btn');
    if (!decorSelectBtn) return;

    const loadedFacadeData = window.facadeOptionsData || {};
    const materialInfo = loadedFacadeData[setData.materialType] || {};
    const useColor = materialInfo.useColorPicker || false;

    let displayContent = '';
    let displayText = 'Выбрать...';

    if (useColor) {
        displayContent = `<span class="color-swatch" style="background-color:${setData.color || '#ffffff'}; border: 1px solid #eee;"></span>`;
        displayText = setData.color || '#ffffff';
    } else if (setData.texture) {
        const selectedDecor = materialInfo.decors?.find(d => d.value === setData.texture);
        if (selectedDecor) {
             if (selectedDecor.previewImage) {
                 displayContent = `<img src="${selectedDecor.previewImage}" alt="${selectedDecor.text}" class="decor-preview-img">`;
             } else {
                 displayContent = `<span class="color-swatch" style="background-color:${selectedDecor.displayColor || '#ccc'};"></span>`;
             }
             displayText = selectedDecor.text || setData.texture;
        } else {
             displayText = `Не найден: ${setData.texture}`; // Если декор удален из данных
        }
    }

    decorSelectBtn.innerHTML = `
        ${displayContent}
        <span class="decor-select-text">${displayText}</span>
    `;
}