// menus.js
import { historyManager } from './HistoryManager.js';
import { UpdateCountertopCommand } from './Commands.js';
import { applyMaterialToWall,
        getWallMaterial,
        getOriginalWallMaterial,
            materials
        } from './roomManager.js'; 
         
import * as MaterialManager from './MaterialManager.js';

import { getAdjacentWallId, findNearestNeighbor, calculateCornerPivotPosition } from './CabinetUtils.js';


window.facadeSetsData = window.facadeSetsData || [];

// --- Данные для Выпадающих Списков (Заглушка) ---
// В будущем будем загружать из файла

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
            <button id="bodyMaterialPickerBtn" class="config-menu-button">Выбрать материал корпуса</button>
            <div id="specificConfigFields">
                <!-- Сюда будут вставляться поля -->
            </div>
        </div> 
        <div class="menu-buttons"> 
            <button id="toggleDetailBtn">${detailButtonText}</button> 
            <button type="button" id="applyConfigBtnInMenu">Применить</button>
            <button type="button" onclick="hideCabinetConfigMenu()">Отмена</button>
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
    let fieldsHtml = ``;
    

    if (isTallCabinet) {
        const isHeightIndependentChecked = cabinet.isHeightIndependent || false;
        fieldsHtml += `
            <label style="flex-direction: row; align-items: center;">
                <input type="checkbox" id="isHeightIndependentCheckbox" data-set-prop="isHeightIndependent" ${isHeightIndependentChecked ? 'checked' : ''}>
                Свободная высота
            </label>
        `;
    }

    // // Чекбокс и поле "Отступ от пола" для ОБЫЧНЫХ ВЕРХНИХ шкафов
    // if (isUpperCabinet && cabinet.isMezzanine === 'normal') {
    //     // all in showCabinetMenu
    // } else if (isUpperCabinet) { // Для антресолей/подантресолей показываем нередактируемый отступ
    //     fieldsHtml += `
    //         <label>Отступ от пола, мм: <input type="number" id="cabinetOffsetBottomUpper" value="${initialOffsetBottomForFieldMm}" min="0" disabled data-set-prop="offsetBottom"></label>
    //     `;
    // }

    const handleType = window.kitchenGlobalParams.handleType || 'standard';
    // Определяем, можно ли редактировать "дельту"
    const isCornerElementEditable = (handleType !== 'gola-profile');
    const cornerElementDisabledAttr = isCornerElementEditable ? '' : 'disabled';

    // --- Остальной HTML для других полей (без изменений, как в вашем коде) ---
    if (isUpperCabinet) {
        //fieldsHtml += `
        //<label>Отступ от стены, мм: <input type="number" id="wallOffset" value="${Math.round((cabinet.offsetFromParentWall || 0.02) * 1000)}" min="0" data-set-prop="offsetFromParentWall"></label>`;
        //fieldsHtml += `
        //    <label>Ширина, мм: <input type="number" id="cabinetWidth" value="${Math.round(cabinet.width * 1000)}" min="10" data-set-prop="width"></label>
        //    <label>Глубина, мм: <input type="number" id="cabinetDepth" value="${Math.round(cabinet.depth * 1000)}" min="100" data-set-prop="depth"></label>
        //    <label>Зазор между фасадами, мм: <input type="number" id="facadeGap" value="${Math.round((cabinet.facadeGap || 0.003) * 1000)}" min="0" step="1" data-set-prop="facadeGap"></label>`;
        // if (cabinetConfig !== 'openUpper') {
        //      fieldsHtml += generateFacadeSetSelectHTML(cabinet);
        //      fieldsHtml += generateTextureDirectionSelectHTML(cabinet);
        // }
        switch (cabinetConfig) {
            case 'swingUpper':
                fieldsHtml += `
                    <label>Тип дна: <select id="bottomType" data-set-prop="bottomType"></select></label>
                    <label>Конструкция дна: <select id="bottomConstruction" data-set-prop="bottomConstruction"></select></label>
                    <label>Отступ дна спереди, мм: <input type="number" id="bottomFrontOffset" data-set-prop="bottomFrontOffset"></label>
                    <label>Выступ дна сзади, мм: <input type="number" id="bottomOverhangRear" data-set-prop="bottomOverhangRear" min="0" max="20" value="0"></label>
                    <hr>
                    <label>Выступ левой боковины сзади, мм: <input type="number" id="leftSideOverhangRear" data-set-prop="leftSideOverhangRear" min="0" max="20" value="0"></label>
                    <label>Выступ правой боковины сзади, мм: <input type="number" id="rightSideOverhangRear" data-set-prop="rightSideOverhangRear" min="0" max="20" value="0"></label>
                    <hr>
                    <label>Задняя стенка: <select id="backPanel" data-set-prop="backPanel"></select></label>
                    <label>Углубление ЗС, мм: <input type="number" id="backPanelOffset" data-set-prop="backPanelOffset"></label>
                    <hr>
                    <label>Дверь: <select id="doorType" data-set-prop="doorType"></select></label>
                    <label>Отступ двери снизу, мм: <input type="number" id="doorOffsetBottom" data-set-prop="doorOffsetBottom"></label>
                    <label>Отступ двери сверху, мм: <input type="number" id="doorOffsetTop" data-set-prop="doorOffsetTop"></label>
                    <hr>
                    <label>Spacers: <select id="spacers" data-set-prop="spacers"></select></label>
                    <label id="spacerWidthLabel">Ширина спейсера, мм: <input type="number" id="spacerWidth" data-set-prop="spacerWidth"></label>
                    <hr>
                    <label>Количество полок, шт: <input type="number" id="shelfCount" data-set-prop="shelfCount" min="0" max="10"></label>
                    <label>Полки: <select id="shelfType" data-set-prop="shelfType"></select></label>
                    <label id="shelfLayoutLabel">Расположение полок: <select id="shelfLayout" data-set-prop="shelfLayout"></select></label>
                    <label id="topShelfSpaceLabel">Высота над верхней полкой, мм: <input type="number" id="topShelfSpace" data-set-prop="topShelfSpace"></label>
                `;
                break;
            case 'cornerUpperStorage':
                // --- НОВЫЙ БЛОК ДЛЯ ВЕРХНЕГО УГЛОВОГО ---
                fieldsHtml += `
                    <p style="text-align: center; color: #555; margin-top:10px; font-weight:bold;">-- Настройки углового шкафа --</p>
                    <label>Направление угла (авто): <input type="text" id="cornerDirectionDisplay" readonly class="readonly-style"></label>
                    <label>Ширина фасада, мм: <input type="number" id="facadeWidth" min="50" step="10" data-set-prop="facadeWidth"></label>
                    <label>Ширина углового элемента, мм: <input type="number" id="cornerElementWidth" min="10" step="1" data-set-prop="cornerElementWidth"></label>
                    <label>Глубина соседа, мм (авто): <input type="number" id="neighborDepth" readonly class="readonly-style"></label>
                    <hr>
                    <label>Тип дна: <select id="bottomType" data-set-prop="bottomType"></select></label>
                    <label>Конструкция дна: <select id="bottomConstruction" data-set-prop="bottomConstruction"></select></label>
                    <label>Отступ дна спереди, мм: <input type="number" id="bottomFrontOffset" data-set-prop="bottomFrontOffset"></label>
                    <label>Выступ дна сзади, мм: <input type="number" id="bottomOverhangRear" data-set-prop="bottomOverhangRear" min="0" max="20" value="0"></label>
                    <hr>
                    <label>Выступ левой боковины сзади, мм: <input type="number" id="leftSideOverhangRear" data-set-prop="leftSideOverhangRear" min="0" max="20" value="0"></label>
                    <label>Выступ правой боковины сзади, мм: <input type="number" id="rightSideOverhangRear" data-set-prop="rightSideOverhangRear" min="0" max="20" value="0"></label>
                    <hr>
                    <label>Задняя стенка: <select id="backPanel" data-set-prop="backPanel"></select></label>
                    <label>Углубление ЗС, мм: <input type="number" id="backPanelOffset" data-set-prop="backPanelOffset"></label>
                    <hr>
                    <label>Отступ двери снизу, мм: <input type="number" id="doorOffsetBottom" data-set-prop="doorOffsetBottom"></label>
                    <label>Отступ двери сверху, мм: <input type="number" id="doorOffsetTop" data-set-prop="doorOffsetTop"></label>
                    <hr>
                    <label>Количество полок, шт: <input type="number" id="shelfCount" data-set-prop="shelfCount" min="0" max="10"></label>
                    <label>Полки: <select id="shelfType" data-set-prop="shelfType"></select></label>
                    <label id="shelfLayoutLabel">Расположение полок: <select id="shelfLayout" data-set-prop="shelfLayout"></select></label>
                    <label id="topShelfSpaceLabel">Высота над верхней полкой, мм: <input type="number" id="topShelfSpace" data-set-prop="topShelfSpace"></label>
                `;
                break;
            case 'swingHood':
                case 'swingHood':
                fieldsHtml += `
                    <label>Конструкция дна: <select id="bottomConstruction" data-set-prop="bottomConstruction"></select></label>
                    <label>Отступ дна спереди, мм: <input type="number" id="bottomFrontOffset" data-set-prop="bottomFrontOffset"></label>
                    <label>Выступ дна сзади, мм: <input type="number" id="bottomOverhangRear" data-set-prop="bottomOverhangRear" min="0" max="20" value="0"></label>
                    <hr>
                    <p style="text-align: center; color: #555; font-weight:bold;">-- Параметры вытяжки --</p>
                    <label>Ширина вытяжки, мм: <input type="number" id="hoodWidth" data-set-prop="hoodWidth" min="300" max="1000"></label>
                    <label>Глубина вытяжки, мм: <input type="number" id="hoodDepth" data-set-prop="hoodDepth" min="150" max="400"></label>
                    <label>Высота вытяжки, мм: <input type="number" id="hoodHeight" data-set-prop="hoodHeight" min="40" max="600"></label>
                    <label>Диаметр воздуховода, мм: <input type="number" id="hoodDuctDiameter" data-set-prop="hoodDuctDiameter" min="100" max="150"></label>
                    <label>Смещение центра вытяжки от левого края, мм: <input type="number" id="hoodOffsetX" data-set-prop="hoodOffsetX"></label>
                    <hr>
                    <label>Выступ левой боковины сзади, мм: <input type="number" id="leftSideOverhangRear" data-set-prop="leftSideOverhangRear" min="0" max="20" value="0"></label>
                    <label>Выступ правой боковины сзади, мм: <input type="number" id="rightSideOverhangRear" data-set-prop="rightSideOverhangRear" min="0" max="20" value="0"></label>
                    <hr>
                    <label>Задняя стенка: <select id="backPanel" data-set-prop="backPanel"></select></label>
                    <label>Углубление ЗС, мм: <input type="number" id="backPanelOffset" data-set-prop="backPanelOffset"></label>
                    <hr>
                    <label>Дверь: <select id="doorType" data-set-prop="doorType"></select></label>
                    <label>Отступ двери снизу, мм: <input type="number" id="doorOffsetBottom" data-set-prop="doorOffsetBottom"></label>
                    <label>Отступ двери сверху, мм: <input type="number" id="doorOffsetTop" data-set-prop="doorOffsetTop"></label>
                    <hr>
                    <label>Spacers: <select id="spacers" data-set-prop="spacers"></select></label>
                    <label id="spacerWidthLabel">Ширина спейсера, мм: <input type="number" id="spacerWidth" data-set-prop="spacerWidth"></label>
                    <hr>
                    <label>Количество полок, шт: <input type="number" id="shelfCount" data-set-prop="shelfCount" min="0" max="10"></label>
                    <label>Полки: <select id="shelfType" data-set-prop="shelfType"></select></label>
                    <label id="shelfLayoutLabel">Расположение полок: <select id="shelfLayout" data-set-prop="shelfLayout"></select></label>
                    <label id="topShelfSpaceLabel">Высота над верхней полкой, мм: <input type="number" id="topShelfSpace" data-set-prop="topShelfSpace"></label>
                `;
                break;
            case 'liftUpper':
                fieldsHtml += `
                    <label>Тип дна: <select id="bottomType" data-set-prop="bottomType"></select></label>
                    <label>Конструкция дна: <select id="bottomConstruction" data-set-prop="bottomConstruction"></select></label>
                    <label>Отступ дна спереди, мм: <input type="number" id="bottomFrontOffset" data-set-prop="bottomFrontOffset"></label>
                    <label>Выступ дна сзади, мм: <input type="number" id="bottomOverhangRear" data-set-prop="bottomOverhangRear" min="0" max="20" value="0"></label>
                    <hr>
                    <label>Выступ левой боковины сзади, мм: <input type="number" id="leftSideOverhangRear" data-set-prop="leftSideOverhangRear" min="0" max="20" value="0"></label>
                    <label>Выступ правой боковины сзади, мм: <input type="number" id="rightSideOverhangRear" data-set-prop="rightSideOverhangRear" min="0" max="20" value="0"></label>
                    <hr>
                    <label>Задняя стенка: <select id="backPanel" data-set-prop="backPanel"></select></label>
                    <label>Углубление ЗС, мм: <input type="number" id="backPanelOffset" data-set-prop="backPanelOffset"></label>
                    <hr>
                    <label>Отступ двери снизу, мм: <input type="number" id="doorOffsetBottom" data-set-prop="doorOffsetBottom"></label>
                    <label>Отступ двери сверху, мм: <input type="number" id="doorOffsetTop" data-set-prop="doorOffsetTop"></label>
                    
                    <label>Конструкция двери: <select id="liftDoorConstruction" data-set-prop="liftDoorConstruction"></select></label>
                    
                    <div class="menu-subsection">
                        <p>-- Верхний фасад --</p>
                        <label>Высота, мм: <input type="number" id="liftTopFacadeHeight" data-set-prop="liftTopFacadeHeight" min="240" max="600"></label>
                        <label>Механизм: <select id="liftTopMechanism" data-set-prop="liftTopMechanism"></select></label>
                    </div>

                    <div id="liftBottomFacadeSection" class="menu-subsection">
                        <p>-- Нижний фасад --</p>
                        <label>Высота, мм: <input type="number" id="liftBottomFacadeHeight" readonly class="readonly-style"></label>
                        <label>Механизм: <select id="liftBottomMechanism" data-set-prop="liftBottomMechanism"></select></label>
                    </div>
                    <button type="button" id="makeLiftFacadesSymmetricalBtn" class="menu-button-small">Сделать фасады симметричными</button>
                    <hr>
                    <label>Spacers: <select id="spacers" data-set-prop="spacers"></select></label>
                    <label id="spacerWidthLabel">Ширина спейсера, мм: <input type="number" id="spacerWidth" data-set-prop="spacerWidth"></label>
                    <hr>
                    <label>Количество полок, шт: <input type="number" id="shelfCount" data-set-prop="shelfCount" min="0" max="10"></label>
                    <label>Полки: <select id="shelfType" data-set-prop="shelfType"></select></label>
                    <label id="shelfLayoutLabel">Расположение полок: <select id="shelfLayout" data-set-prop="shelfLayout"></select></label>
                    <label id="topShelfSpaceLabel">Высота над верхней полкой, мм: <input type="number" id="topShelfSpace" data-set-prop="topShelfSpace"></label>
                `;
                break;
            case 'liftHood':
                // Заглушка для будущих типов
                fieldsHtml += `<p>Настройки для "${cabinetConfig}" еще не реализованы.</p>`;
                break;
            case 'falsePanelUpper':
                fieldsHtml += `
                    <label>Отступ панели сверху, мм: <input type="number" id="doorOffsetTop" data-set-prop="doorOffsetTop"></label>
                    <label>Отступ панели снизу, мм: <input type="number" id="doorOffsetBottom" data-set-prop="doorOffsetBottom"></label>
                    <!-- НОВЫЙ СЕЛЕКТ -->
                    <label>Ориентация: 
                        <select id="fp_side" data-set-prop="fp_side">
                            <option value="left" ${cabinet.fp_side === 'left' ? 'selected' : ''}>Левая (лицо влево)</option>
                            <option value="right" ${cabinet.fp_side === 'right' ? 'selected' : ''}>Правая (лицо вправо)</option>
                        </select>
                    </label>
                `;
                break;    
            case 'openUpper':
                fieldsHtml += `
                    <label>Конструкция дна: <select id="bottomConstruction" data-set-prop="bottomConstruction"></select></label>
                    <label>Отступ дна спереди, мм: <input type="number" id="bottomFrontOffset" data-set-prop="bottomFrontOffset"></label>
                    <label>Выступ дна сзади, мм: <input type="number" id="bottomOverhangRear" data-set-prop="bottomOverhangRear" min="0" max="20"></label>
                    <hr>
                    <label>Выступ левой боковины сзади, мм: <input type="number" id="leftSideOverhangRear" data-set-prop="leftSideOverhangRear" min="0" max="20"></label>
                    <label>Выступ правой боковины сзади, мм: <input type="number" id="rightSideOverhangRear" data-set-prop="rightSideOverhangRear" min="0" max="20"></label>
                    <hr>
                    <label>Конструкция крыши: <select id="topConstruction" data-set-prop="topConstruction"></select></label>
                    <hr>
                    <label>Задняя стенка: <select id="backPanel" data-set-prop="backPanel"></select></label>
                    <label>Углубление ЗС, мм: <input type="number" id="backPanelOffset" data-set-prop="backPanelOffset"></label>
                    <label>Материал ЗС: <select id="backPanelMaterial" data-set-prop="backPanelMaterial"></select></label>
                    <hr>
                    <label>Количество полок, шт: <input type="number" id="shelfCount" data-set-prop="shelfCount" min="0" max="10"></label>
                    <label id="shelfTypeLabel">Тип крепления полок: <select id="shelfType" data-set-prop="shelfType"></select></label>
                    <label id="shelfMaterialLabel">Материал полок: <select id="shelfMaterial" data-set-prop="shelfMaterial"></select></label>
                    <hr>
                    <label id="doorOffsetTopLabel">Отступ двери сверху, мм: <input type="number" id="doorOffsetTop" data-set-prop="doorOffsetTop"></label>
                    <label id="doorOffsetBottomLabel">Отступ двери снизу, мм: <input type="number" id="doorOffsetBottom" data-set-prop="doorOffsetBottom"></label>
                    <hr>
                    <label>Алюминиевый фасад: <select id="frameFacade" data-set-prop="frameFacade"></select></label>
                    <label id="frameColorLabel">Цвет рамки: <select id="frameColor" data-set-prop="frameColor"></select></label>
                `;
                break;
        }
        // ==> ВОТ ИСПРАВЛЕНИЕ: ОБЩИЙ БЛОК ДЛЯ ВСЕХ ВЕРХНИХ ШКАФОВ С ФАСАДАМИ <==
        if (cabinetConfig !== 'openUpper') {
            fieldsHtml += '<hr>'; // Добавим разделитель для красоты
            fieldsHtml += generateFacadeSetSelectHTML(cabinet);
            fieldsHtml += generateTextureDirectionSelectHTML(cabinet);
        }
    } else { // Не верхний
        if (cabinetType === 'corner') {
            if (cabinetConfig === 'sink') {

                // Получаем текущее или дефолтное значение
                // Важно: `cornerElementWidth` - это новое свойство, которое мы будем хранить в cabinet.
                const currentCornerElementWidth = Math.round((cabinet.cornerElementWidth || 0.060) * 1000);


                fieldsHtml += `
                    <p style="text-align: center; color: #555; margin-top:10px; font-weight:bold;">-- Настройки угловой мойки --</p>
                    
                    <label>Направление угла:
                        <select id="cornerDirection" data-set-prop="cornerDirection">
                            <!-- Опции будут добавлены через populateSelectOptions -->
                        </select>
                    </label>

                    <label>Ширина фасада, мм:
                        <input type="number" id="facadeWidth" min="50" step="10" data-set-prop="facadeWidth">
                    </label>
                    
                    <label>Ширина углового элемента, мм:
                        <input type="number" id="cornerElementWidth" value="${currentCornerElementWidth}" min="10" step="1" 
                            data-set-prop="cornerElementWidth" ${cornerElementDisabledAttr}>
                    </label>
                    
                    <label>Глубина соседа, мм (авто):
                        <input type="number" id="neighborDepth" readonly class="readonly-style">
                    </label>
                `;
                // Мы НЕ добавляем здесь generate...SelectHTML, так как они добавляются ниже.
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
                        const setData = window.facadeSetsData.find(set => set.id === cabinet.facadeSet);
                        // Вызываем функцию из MaterialManager, передавая ей эти данные
                        const { thickness: facadeThicknessM } = MaterialManager.getMaterial(setData);
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
            const currentCabinetData = cabinets[cabinetIndex]; 
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
                    else { 
                        const setData = window.facadeSetsData.find(set => set.id === currentCabinetData.facadeSet);
                        const { thickness: ftM } = MaterialManager.getMaterial(setData);
                        fpDepthInput.value = Math.round(ftM * 1000); 
                        fpDepthInput.disabled = true; 
                    }
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

    if (cabinetConfig === 'sink') {
        setTimeout(() => {
             const cornerElementInput = configMenuElement.querySelector('#cornerElementWidth');
             // Добавим "живую" логику: если меняется тип ручки, это поле должно обновляться
            // Эта логика будет в `applyKitchenParams` (глобальное обновление)
            
            // Но нам нужно, чтобы при открытии меню оно имело правильное значение
            if (!isCornerElementEditable) {
                // Для Gola "дельта" равна толщине фасада
                const facadeSet = window.facadeSetsData.find(set => set.id === cabinet.facadeSet);
                const { thickness: facadeThicknessM } = MaterialManager.getMaterial(facadeSet);
                cornerElementInput.value = Math.round(facadeThicknessM * 1000);
            }
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

    // ==> НАЧАЛО БЛОКА ДЛЯ `swingUpper` <==
    if (cabinet.type === 'upperCabinet' && cabinet.cabinetConfig === 'swingUpper') {
        const configMenu = document.getElementById('cabinetConfigMenu');
        
        // --- Получаем ссылки на все элементы ---
        const bottomTypeSelect = configMenu.querySelector('#bottomType');
        const bottomConstructionSelect = configMenu.querySelector('#bottomConstruction');
        const bottomFrontOffsetInput = configMenu.querySelector('#bottomFrontOffset');
        const bottomOverhangRearInput = configMenu.querySelector('#bottomOverhangRear'); // <-- Новая ссылка
        const leftSideOverhangRearInput = configMenu.querySelector('#leftSideOverhangRear'); // <-- Новая ссылка
        const rightSideOverhangRearInput = configMenu.querySelector('#rightSideOverhangRear'); // <-- Новая ссылка
        const backPanelSelect = configMenu.querySelector('#backPanel');
        const backPanelOffsetInput = configMenu.querySelector('#backPanelOffset');
        const doorTypeSelect = configMenu.querySelector('#doorType');
        const doorOffsetBottomInput = configMenu.querySelector('#doorOffsetBottom');
        const doorOffsetTopInput = configMenu.querySelector('#doorOffsetTop');
        const spacersSelect = configMenu.querySelector('#spacers');
        const spacerWidthInput = configMenu.querySelector('#spacerWidth');
        const shelfTypeSelect = configMenu.querySelector('#shelfType');
        const shelfCountInput = configMenu.querySelector('#shelfCount');
        const shelfLayoutSelect = configMenu.querySelector('#shelfLayout');
        const topShelfSpaceInput = configMenu.querySelector('#topShelfSpace');

        const shelfLayoutLabel = document.getElementById('shelfLayoutLabel');
        const topShelfSpaceLabel = document.getElementById('topShelfSpaceLabel');
        const spacerWidthLabel = document.getElementById('spacerWidthLabel');
        
        // --- Заполняем `select`-ы опциями ---
        _fillSelect(bottomTypeSelect, [ {value: 'solid', text: 'Сплошное'}, {value: 'slats', text: 'Планки (сушка)'} ], cabinet.bottomType || 'solid');
        _fillSelect(bottomConstructionSelect, [ {value: 'inset', text: 'Вкладное'}, {value: 'overlay', text: 'Накладное'}, {value: 'insetGola', text: 'Вкладное с Gola'}, {value: 'overlayGola', text: 'Накладное с Gola'} ], cabinet.bottomConstruction || 'inset');
        _fillSelect(backPanelSelect, [ {value: 'yes', text: 'Да'}, {value: 'no', text: 'Нет'} ], cabinet.backPanel || 'yes');
        _fillSelect(doorTypeSelect, [ {value: 'double', text: 'Двойная'}, {value: 'left', text: 'Левая'}, {value: 'right', text: 'Правая'} ], cabinet.doorType || 'double');
        _fillSelect(spacersSelect, [ {value: 'none', text: 'Нет'}, {value: 'left_narrow', text: 'Левый узкий'}, {value: 'right_narrow', text: 'Правый узкий'}, {value: 'left_wide', text: 'Левый широкий'}, {value: 'right_wide', text: 'Правый широкий'} ], cabinet.spacers || 'none');
        _fillSelect(shelfTypeSelect, [ {value: 'confirmat', text: 'Евровинт'}, {value: 'shelfHolder', text: 'Полкодержатель'}, {value: 'secura7', text: 'Secura 7'} ], cabinet.shelfType || 'none');
        _fillSelect(shelfLayoutSelect, [ {value: 'even', text: 'Равномерно'}, {value: 'uneven', text: 'Неравномерно'} ], cabinet.shelfLayout || 'even');
        
        // --- Заполняем `input`-ы значениями ---
        bottomFrontOffsetInput.value = cabinet.bottomFrontOffset ?? 0;
        bottomOverhangRearInput.value = cabinet.bottomOverhangRear ?? 0;
        leftSideOverhangRearInput.value = cabinet.leftSideOverhangRear ?? 0;
        rightSideOverhangRearInput.value = cabinet.rightSideOverhangRear ?? 0;
        backPanelOffsetInput.value = cabinet.backPanelOffset ?? 0;
        doorOffsetBottomInput.value = cabinet.doorOffsetBottom || 0;
        doorOffsetTopInput.value = cabinet.doorOffsetTop || 0;
        spacerWidthInput.value = cabinet.spacerWidth || 60;
        topShelfSpaceInput.value = cabinet.topShelfSpace || 300;
        shelfCountInput.value = cabinet.shelfCount ?? 0; 


        // --- Функция для "умной" логики меню ---
        const updateMenuLogic = () => {
            // Считываем текущие значения из полей
            const bottomConstruction = bottomConstructionSelect.value;
            const shelfCount = parseInt(shelfCountInput.value) || 0;
            const shelfLayout = shelfLayoutSelect.value;
            const spacers = configMenu.querySelector('#spacers').value; // spacersSelect

            // Логика для отступа дна
            const isGolaBottom = bottomConstruction.includes('Gola');
            bottomFrontOffsetInput.readOnly = isGolaBottom;
            bottomFrontOffsetInput.classList.toggle('readonly-style', isGolaBottom);
            if (isGolaBottom) {
                bottomFrontOffsetInput.value = 20;
            }

            if (shelfLayoutLabel) {
                shelfLayoutLabel.style.display = (shelfCount > 0) ? '' : 'none'; // Используем '', браузер сам подставит display
            }
            if (topShelfSpaceLabel) {
                const showTopShelfSpace = (shelfCount > 0 && shelfLayout === 'uneven');
                topShelfSpaceLabel.style.display = showTopShelfSpace ? '' : 'none';
            }
            if (shelfTypeSelect) {
                // ==> ВОТ ИСПРАВЛЕНИЕ ДЛЯ БЛОКИРОВКИ <==
                shelfTypeSelect.disabled = (shelfCount === 0);
            }

            // --- Логика для спейсера ---
            if (spacerWidthLabel) {
                const showSpacerWidth = spacers.includes('wide');
                spacerWidthLabel.style.display = showSpacerWidth ? '' : 'none';
            }
        };

        // --- Вешаем слушатели ---
        bottomConstructionSelect.addEventListener('change', updateMenuLogic);
        shelfCountInput.addEventListener('input', updateMenuLogic);
        shelfLayoutSelect.addEventListener('change', updateMenuLogic);
        spacersSelect.addEventListener('change', updateMenuLogic);

        // --- Первоначальный запуск ---
        updateMenuLogic();
        //console.log("cabinet = ", cabinet);
    } else if (cabinet.type === 'upperCabinet' && cabinet.cabinetConfig === 'swingHood') {
        // --- НОВЫЙ БЛОК ДЛЯ ШКАФА С ВЫТЯЖКОЙ ---
        const configMenu = document.getElementById('cabinetConfigMenu');
        const panelThickness = window.getPanelThickness();
        
        // --- Получаем ссылки на ВСЕ элементы (копируем из swingUpper) ---
        const bottomConstructionSelect = configMenu.querySelector('#bottomConstruction');
        const bottomFrontOffsetInput = configMenu.querySelector('#bottomFrontOffset');
        const bottomOverhangRearInput = configMenu.querySelector('#bottomOverhangRear'); // <-- Новая ссылка
        const leftSideOverhangRearInput = configMenu.querySelector('#leftSideOverhangRear'); // <-- Новая ссылка
        const rightSideOverhangRearInput = configMenu.querySelector('#rightSideOverhangRear'); // <-- Новая ссылка
        const backPanelSelect = configMenu.querySelector('#backPanel');
        const backPanelOffsetInput = configMenu.querySelector('#backPanelOffset');
        const doorTypeSelect = configMenu.querySelector('#doorType');
        const doorOffsetBottomInput = configMenu.querySelector('#doorOffsetBottom');
        const doorOffsetTopInput = configMenu.querySelector('#doorOffsetTop');
        const spacersSelect = configMenu.querySelector('#spacers');
        const spacerWidthInput = configMenu.querySelector('#spacerWidth');
        const shelfTypeSelect = configMenu.querySelector('#shelfType');
        const shelfCountInput = configMenu.querySelector('#shelfCount');
        const shelfLayoutSelect = configMenu.querySelector('#shelfLayout');
        const topShelfSpaceInput = configMenu.querySelector('#topShelfSpace');
        const shelfLayoutLabel = document.getElementById('shelfLayoutLabel');
        const topShelfSpaceLabel = document.getElementById('topShelfSpaceLabel');
        const spacerWidthLabel = document.getElementById('spacerWidthLabel');
        // --- НОВЫЕ ССЫЛКИ ---
        const hoodWidthInput = configMenu.querySelector('#hoodWidth');
        const hoodDepthInput = configMenu.querySelector('#hoodDepth');
        const hoodHeightInput = configMenu.querySelector('#hoodHeight');
        const hoodDuctDiameterInput = configMenu.querySelector('#hoodDuctDiameter');
        const hoodOffsetXInput = configMenu.querySelector('#hoodOffsetX');

        // --- Заполняем `select`-ы опциями (копируем из swingUpper) ---
        // Убираем _fillSelect для bottomType, так как его больше нет
        _fillSelect(bottomConstructionSelect, [ {value: 'inset', text: 'Вкладное'}, {value: 'overlay', text: 'Накладное'}, {value: 'insetGola', text: 'Вкладное с Gola'}, {value: 'overlayGola', text: 'Накладное с Gola'} ], cabinet.bottomConstruction || 'inset');
        _fillSelect(backPanelSelect, [ {value: 'yes', text: 'Да'}, {value: 'no', text: 'Нет'} ], cabinet.backPanel || 'yes');
        _fillSelect(doorTypeSelect, [ {value: 'double', text: 'Двойная'}, {value: 'left', text: 'Левая'}, {value: 'right', text: 'Правая'} ], cabinet.doorType || 'double');
        _fillSelect(spacersSelect, [ {value: 'none', text: 'Нет'}, {value: 'left_narrow', text: 'Левый узкий'}, {value: 'right_narrow', text: 'Правый узкий'}, {value: 'left_wide', text: 'Левый широкий'}, {value: 'right_wide', text: 'Правый широкий'} ], cabinet.spacers || 'none');
        _fillSelect(shelfTypeSelect, [ {value: 'confirmat', text: 'Евровинт'}, {value: 'shelfHolder', text: 'Полкодержатель'}, {value: 'secura7', text: 'Secura 7'} ], cabinet.shelfType || 'none');
        _fillSelect(shelfLayoutSelect, [ {value: 'even', text: 'Равномерно'}, {value: 'uneven', text: 'Неравномерно'} ], cabinet.shelfLayout || 'even');
        
        // 1. Рассчитываем внутреннюю ширину шкафа
        const innerWidth = cabinet.width - 2 * panelThickness;

        // 2. Рассчитываем максимально допустимую ширину вытяжки
        const maxHoodWidth = innerWidth - (2 / 1000); // Зазор по 1мм с каждой стороны
        
        // 3. Определяем и корректируем текущую ширину вытяжки
        let currentHoodWidth = cabinet.hoodWidth ?? (cabinet.width >= 0.6 ? 560 : Math.floor(maxHoodWidth * 1000));
        if (currentHoodWidth > maxHoodWidth * 1000) {
            currentHoodWidth = Math.floor(maxHoodWidth * 1000);
        }
        // Принудительно обновляем значение в объекте, если оно изменилось
        cabinet.hoodWidth = currentHoodWidth;
        
        // 4. Рассчитываем максимально допустимое смещение центра от ЦЕНТРА шкафа
        const maxOffsetFromCenter = (innerWidth - (currentHoodWidth / 1000)) / 2 - (1 / 1000);

        // 5. Рассчитываем мин/макс значения для поля "Смещение от ЛЕВОГО КРАЯ"
        const centerOfCabinet = cabinet.width / 2;
        const minOffsetX = centerOfCabinet - maxOffsetFromCenter;
        const maxOffsetX = centerOfCabinet + maxOffsetFromCenter;

        // 6. Определяем и корректируем текущее смещение
        let currentOffsetX = cabinet.hoodOffsetX ?? (cabinet.width / 2 * 1000);
        if (currentOffsetX < minOffsetX * 1000) currentOffsetX = Math.round(minOffsetX * 1000);
        if (currentOffsetX > maxOffsetX * 1000) currentOffsetX = Math.round(maxOffsetX * 1000);
        cabinet.hoodOffsetX = currentOffsetX;

        // --- Заполняем `input`-ы значениями ---
        bottomFrontOffsetInput.value = cabinet.bottomFrontOffset ?? 0;
        bottomOverhangRearInput.value = cabinet.bottomOverhangRear ?? 0;
        leftSideOverhangRearInput.value = cabinet.leftSideOverhangRear ?? 0;
        rightSideOverhangRearInput.value = cabinet.rightSideOverhangRear ?? 0;
        backPanelOffsetInput.value = cabinet.backPanelOffset ?? 0;
        doorOffsetBottomInput.value = cabinet.doorOffsetBottom || 0;
        doorOffsetTopInput.value = cabinet.doorOffsetTop || 0;
        spacerWidthInput.value = cabinet.spacerWidth || 60;
        topShelfSpaceInput.value = cabinet.topShelfSpace || 300;
        shelfCountInput.value = cabinet.shelfCount ?? 0; 
        // --- НОВЫЕ ПОЛЯ (с дефолтами) ---
        hoodWidthInput.value = currentHoodWidth;
        hoodOffsetXInput.value = currentOffsetX;
        hoodOffsetXInput.min = Math.round(minOffsetX * 1000); // Устанавливаем динамические лимиты
        hoodOffsetXInput.max = Math.round(maxOffsetX * 1000);
        hoodDepthInput.value = cabinet.hoodDepth ?? 260;
        hoodHeightInput.value = cabinet.hoodHeight ?? 200;
        hoodDuctDiameterInput.value = cabinet.hoodDuctDiameter ?? 150;
        // --- Функция для "умной" логики меню ---
        const updateMenuLogic = () => {
            // Считываем текущие значения из полей
            const bottomConstruction = bottomConstructionSelect.value;
            const shelfCount = parseInt(shelfCountInput.value) || 0;
            const shelfLayout = shelfLayoutSelect.value;
            const spacers = configMenu.querySelector('#spacers').value; // spacersSelect

            // Логика для отступа дна
            const isGolaBottom = bottomConstruction.includes('Gola');
            bottomFrontOffsetInput.readOnly = isGolaBottom;
            bottomFrontOffsetInput.classList.toggle('readonly-style', isGolaBottom);
            if (isGolaBottom) {
                bottomFrontOffsetInput.value = 20;
            }

            if (shelfLayoutLabel) {
                shelfLayoutLabel.style.display = (shelfCount > 0) ? '' : 'none'; // Используем '', браузер сам подставит display
            }
            if (topShelfSpaceLabel) {
                const showTopShelfSpace = (shelfCount > 0 && shelfLayout === 'uneven');
                topShelfSpaceLabel.style.display = showTopShelfSpace ? '' : 'none';
            }
            if (shelfTypeSelect) {
                // ==> ВОТ ИСПРАВЛЕНИЕ ДЛЯ БЛОКИРОВКИ <==
                shelfTypeSelect.disabled = (shelfCount === 0);
            }

            // --- Логика для спейсера ---
            if (spacerWidthLabel) {
                const showSpacerWidth = spacers.includes('wide');
                spacerWidthLabel.style.display = showSpacerWidth ? '' : 'none';
            }
        };

        // --- Вешаем слушатели ---
        bottomConstructionSelect.addEventListener('change', updateMenuLogic);
        shelfCountInput.addEventListener('input', updateMenuLogic);
        shelfLayoutSelect.addEventListener('change', updateMenuLogic);
        spacersSelect.addEventListener('change', updateMenuLogic);
        // Вешаем слушатель на ширину вытяжки, чтобы она влияла на смещение
        hoodWidthInput.addEventListener('input', () => {
            const newHoodWidth = parseFloat(hoodWidthInput.value);
            if (isNaN(newHoodWidth)) return;
            
            // Пересчитываем лимиты для смещения "на лету"
            const newMaxOffsetFromCenter = (innerWidth - (newHoodWidth / 1000)) / 2 - (1 / 1000);
            const newMinOffsetX = centerOfCabinet - newMaxOffsetFromCenter;
            const newMaxOffsetX = centerOfCabinet + newMaxOffsetFromCenter;

            hoodOffsetXInput.min = Math.round(newMinOffsetX * 1000);
            hoodOffsetXInput.max = Math.round(newMaxOffsetX * 1000);

            // Если текущее смещение вышло за рамки, корректируем его
            if (parseFloat(hoodOffsetXInput.value) < newMinOffsetX * 1000) {
                hoodOffsetXInput.value = Math.round(newMinOffsetX * 1000);
            }
            if (parseFloat(hoodOffsetXInput.value) > newMaxOffsetX * 1000) {
                hoodOffsetXInput.value = Math.round(newMaxOffsetX * 1000);
            }
        });

        // --- Первоначальный запуск ---
        updateMenuLogic();
    } else if (cabinet.type === 'upperCabinet' && cabinet.cabinetConfig === 'liftUpper') {
        const configMenu = document.getElementById('cabinetConfigMenu');
        
        // --- Получаем ссылки на все элементы ---
        const bottomTypeSelect = configMenu.querySelector('#bottomType');
        const bottomConstructionSelect = configMenu.querySelector('#bottomConstruction');
        const bottomFrontOffsetInput = configMenu.querySelector('#bottomFrontOffset');
        const bottomOverhangRearInput = configMenu.querySelector('#bottomOverhangRear'); // <-- Новая ссылка
        const leftSideOverhangRearInput = configMenu.querySelector('#leftSideOverhangRear'); // <-- Новая ссылка
        const rightSideOverhangRearInput = configMenu.querySelector('#rightSideOverhangRear'); // <-- Новая ссылка
        const backPanelSelect = configMenu.querySelector('#backPanel');
        const backPanelOffsetInput = configMenu.querySelector('#backPanelOffset');
        //const doorTypeSelect = configMenu.querySelector('#doorType');
        //const doorOffsetBottomInput = configMenu.querySelector('#doorOffsetBottom');
        //const doorOffsetTopInput = configMenu.querySelector('#doorOffsetTop');
        const spacersSelect = configMenu.querySelector('#spacers');
        const spacerWidthInput = configMenu.querySelector('#spacerWidth');
        const shelfTypeSelect = configMenu.querySelector('#shelfType');
        const shelfCountInput = configMenu.querySelector('#shelfCount');
        const shelfLayoutSelect = configMenu.querySelector('#shelfLayout');
        const topShelfSpaceInput = configMenu.querySelector('#topShelfSpace');

        const shelfLayoutLabel = document.getElementById('shelfLayoutLabel');
        const topShelfSpaceLabel = document.getElementById('topShelfSpaceLabel');
        const spacerWidthLabel = document.getElementById('spacerWidthLabel');

        // --- НОВЫЕ ССЫЛКИ ДЛЯ ПОДЪЕМНИКА ---
        const doorOffsetBottomInput = configMenu.querySelector('#doorOffsetBottom');
        const doorOffsetTopInput = configMenu.querySelector('#doorOffsetTop');
        const liftDoorConstructionSelect = configMenu.querySelector('#liftDoorConstruction');
        const liftTopFacadeHeightInput = configMenu.querySelector('#liftTopFacadeHeight');
        const liftTopMechanismSelect = configMenu.querySelector('#liftTopMechanism');
        const liftBottomFacadeSection = configMenu.querySelector('#liftBottomFacadeSection');
        const liftBottomFacadeHeightInput = configMenu.querySelector('#liftBottomFacadeHeight');
        const liftBottomMechanismSelect = configMenu.querySelector('#liftBottomMechanism');
        const makeSymmetricalBtn = configMenu.querySelector('#makeLiftFacadesSymmetricalBtn');
        
        // --- Заполняем `select`-ы опциями ---
        _fillSelect(bottomTypeSelect, [ {value: 'solid', text: 'Сплошное'}, {value: 'slats', text: 'Планки (сушка)'} ], cabinet.bottomType || 'solid');
        _fillSelect(bottomConstructionSelect, [ {value: 'inset', text: 'Вкладное'}, {value: 'overlay', text: 'Накладное'}, {value: 'insetGola', text: 'Вкладное с Gola'}, {value: 'overlayGola', text: 'Накладное с Gola'} ], cabinet.bottomConstruction || 'inset');
        _fillSelect(backPanelSelect, [ {value: 'yes', text: 'Да'}, {value: 'no', text: 'Нет'} ], cabinet.backPanel || 'yes');
        //_fillSelect(doorTypeSelect, [ {value: 'double', text: 'Двойная'}, {value: 'left', text: 'Левая'}, {value: 'right', text: 'Правая'} ], cabinet.doorType || 'double');
        _fillSelect(spacersSelect, [ {value: 'none', text: 'Нет'}, {value: 'left_narrow', text: 'Левый узкий'}, {value: 'right_narrow', text: 'Правый узкий'}, {value: 'left_wide', text: 'Левый широкий'}, {value: 'right_wide', text: 'Правый широкий'} ], cabinet.spacers || 'none');
        _fillSelect(shelfTypeSelect, [ {value: 'confirmat', text: 'Евровинт'}, {value: 'shelfHolder', text: 'Полкодержатель'}, {value: 'secura7', text: 'Secura 7'} ], cabinet.shelfType || 'none');
        _fillSelect(shelfLayoutSelect, [ {value: 'even', text: 'Равномерно'}, {value: 'uneven', text: 'Неравномерно'} ], cabinet.shelfLayout || 'even');
        // --- ЗАПОЛНЯЕМ НОВЫЕ СЕЛЕКТЫ ---
        // --- ДИНАМИЧЕСКОЕ ЗАПОЛНЕНИЕ "КОНСТРУКЦИИ ДВЕРИ" ---
        const cabinetHeightMm = Math.round(cabinet.height * 1000);
        let constructionOptions = [];

        if (cabinetHeightMm >= 240 && cabinetHeightMm <= 479) {
            constructionOptions = [
                {value: 'single', text: 'Одинарная'}
            ];
        } else if (cabinetHeightMm >= 480 && cabinetHeightMm <= 600) {
            constructionOptions = [
                {value: 'single', text: 'Одинарная'},
                {value: 'double_separate', text: 'Двойная (отдельные подъемники)'},
                {value: 'double_folding', text: 'Двойная (складной подъемник)'}
            ];
        } else if (cabinetHeightMm > 600) {
            constructionOptions = [
                {value: 'double_separate', text: 'Двойная (отдельные подъемники)'},
                {value: 'double_folding', text: 'Двойная (складной подъемник)'}
            ];
        }

        // Проверяем, является ли текущее сохраненное значение допустимым
        let currentConstruction = cabinet.liftDoorConstruction || 'single';
        const isCurrentValueValid = constructionOptions.some(opt => opt.value === currentConstruction);
        
        // Если текущее значение недопустимо (например, высота изменилась),
        // выбираем первое доступное значение по умолчанию.
        if (!isCurrentValueValid && constructionOptions.length > 0) {
            currentConstruction = constructionOptions[0].value;
            cabinet.liftDoorConstruction = currentConstruction; // Сразу обновляем данные
        }
        
        // Заполняем селект отфильтрованными опциями
        _fillSelect(liftDoorConstructionSelect, constructionOptions, currentConstruction);

        _fillSelect(liftTopMechanismSelect, [
            {value: 'hk_xs', text: 'Aventos HK-XS'},
            {value: 'hk_s', text: 'Aventos HK-S'},
            {value: 'hk_top', text: 'Aventos HK-Top'},
            {value: 'hf_top', text: 'Aventos HF Top'}
        ], cabinet.liftTopMechanism || 'hk_top');
        
        _fillSelect(liftBottomMechanismSelect, [
            {value: 'hk_xs', text: 'Aventos HK-XS'},
            {value: 'hk_s', text: 'Aventos HK-S'},
            {value: 'hk_top', text: 'Aventos HK-Top'},
            {value: 'hf_top', text: 'Aventos HF Top'}
        ], cabinet.liftBottomMechanism || 'hk_top');

        // --- Заполняем `input`-ы значениями ---
        bottomFrontOffsetInput.value = cabinet.bottomFrontOffset ?? 0;
        bottomOverhangRearInput.value = cabinet.bottomOverhangRear ?? 0;
        leftSideOverhangRearInput.value = cabinet.leftSideOverhangRear ?? 0;
        rightSideOverhangRearInput.value = cabinet.rightSideOverhangRear ?? 0;
        backPanelOffsetInput.value = cabinet.backPanelOffset ?? 0;
        //doorOffsetBottomInput.value = cabinet.doorOffsetBottom || 0;
        //doorOffsetTopInput.value = cabinet.doorOffsetTop || 0;
        spacerWidthInput.value = cabinet.spacerWidth || 60;
        topShelfSpaceInput.value = cabinet.topShelfSpace || 300;
        shelfCountInput.value = cabinet.shelfCount ?? 0; 
        // --- ЗАПОЛНЯЕМ НОВЫЕ ИНПУТЫ ---
        doorOffsetBottomInput.value = cabinet.doorOffsetBottom ?? 0;
        doorOffsetTopInput.value = cabinet.doorOffsetTop ?? 0;
        liftTopFacadeHeightInput.value = cabinet.liftTopFacadeHeight ?? 240; // Дефолт 240


        // --- Функция для "умной" логики меню ---
        const updateLiftMenuLogic = () => {
            // Считываем текущие значения из полей
            const bottomConstruction = bottomConstructionSelect.value;
            const shelfCount = parseInt(shelfCountInput.value) || 0;
            const shelfLayout = shelfLayoutSelect.value;
            const spacers = configMenu.querySelector('#spacers').value; // spacersSelect

            const cabinetHeightMm = Math.round(cabinet.height * 1000);
            const construction = liftDoorConstructionSelect.value;
            const topFacadeHeight = parseInt(liftTopFacadeHeightInput.value) || 0;
            const facadeGap = cabinet.facadeGap ? Math.round(cabinet.facadeGap * 1000) : 3;
            const offsetTop = parseInt(configMenu.querySelector('#doorOffsetTop').value) || 0;
            const offsetBottom = parseInt(configMenu.querySelector('#doorOffsetBottom').value) || 0;

            // --- 3.2: Логика для селектов "Механизм" ---
            const hkOptions = [
                {value: 'hk_xs', text: 'Aventos HK-XS'},
                {value: 'hk_s', text: 'Aventos HK-S'},
                {value: 'hk_top', text: 'Aventos HK-Top'}
            ];
            const hfOption = [{value: 'hf_top', text: 'Aventos HF Top'}];

            if (construction === 'double_folding') {
                _fillSelect(liftTopMechanismSelect, hfOption, cabinet.liftTopMechanism || 'hf_top');
                _fillSelect(liftBottomMechanismSelect, hfOption, cabinet.liftBottomMechanism || 'hf_top');
            } else { // 'single' или 'double_separate'
                _fillSelect(liftTopMechanismSelect, hkOptions, cabinet.liftTopMechanism || 'hk_top');
                if (construction === 'double_separate') {
                    _fillSelect(liftBottomMechanismSelect, hkOptions, cabinet.liftBottomMechanism || 'hk_top');
                } else { // 'single'
                    // Для одинарного фасада нижний селект должен быть пустым
                    _fillSelect(liftBottomMechanismSelect, [], ''); 
                }
            }
            
            // --- 3.3: Видимость блока "Нижний фасад" и кнопки "Симметричные" ---
            const isDoubleDoor = construction.includes('double');
            liftBottomFacadeSection.style.display = isDoubleDoor ? 'block' : 'none';
            makeSymmetricalBtn.style.display = isDoubleDoor ? 'block' : 'none';

            
            // --- НОВАЯ ЛОГИКА ДЛЯ ПОЛЯ "ВЫСОТА ВЕРХНЕГО ФАСАДА" ---
            if (construction === 'single') {
                // --- СЛУЧАЙ "ОДИНАРНАЯ ДВЕРЬ" ---
                // 1. Делаем поле нередактируемым
                liftTopFacadeHeightInput.readOnly = true;
                liftTopFacadeHeightInput.classList.add('readonly-style');

                // 2. Рассчитываем и устанавливаем полную высоту фасада
                const singleFacadeHeight = cabinetHeightMm - offsetTop - offsetBottom;
                liftTopFacadeHeightInput.value = singleFacadeHeight;

            } else { // 'double_separate' или 'double_folding'
                // --- СЛУЧАЙ "ДВОЙНАЯ ДВЕРЬ" ---
                // 1. Делаем поле редактируемым
                liftTopFacadeHeightInput.readOnly = false;
                liftTopFacadeHeightInput.classList.remove('readonly-style');

                // 2. Рассчитываем и устанавливаем МАКСИМАЛЬНОЕ значение
                const minBottomFacadeHeight = 240; // Минимальная высота для нижнего фасада
                const maxTopFacadeHeight = cabinetHeightMm - offsetTop - offsetBottom - facadeGap - minBottomFacadeHeight;
                liftTopFacadeHeightInput.max = Math.max(0, maxTopFacadeHeight);

                // 3. Проверяем, не превышает ли текущее значение максимум, и корректируем при необходимости
                let currentTopHeight = parseInt(liftTopFacadeHeightInput.value) || 0;
                if (currentTopHeight > maxTopFacadeHeight) {
                    currentTopHeight = maxTopFacadeHeight;
                    liftTopFacadeHeightInput.value = currentTopHeight;
                }

                // 4. Расчет высоты нижнего фасада "на лету" (как и раньше)
                const bottomHeight = cabinetHeightMm - offsetTop - offsetBottom - currentTopHeight - facadeGap;
                liftBottomFacadeHeightInput.value = Math.max(0, bottomHeight);
            }

            // Логика для отступа дна
            const isGolaBottom = bottomConstruction.includes('Gola');
            bottomFrontOffsetInput.readOnly = isGolaBottom;
            bottomFrontOffsetInput.classList.toggle('readonly-style', isGolaBottom);
            if (isGolaBottom) {
                bottomFrontOffsetInput.value = 20;
            }

            if (shelfLayoutLabel) {
                shelfLayoutLabel.style.display = (shelfCount > 0) ? '' : 'none'; // Используем '', браузер сам подставит display
            }
            if (topShelfSpaceLabel) {
                const showTopShelfSpace = (shelfCount > 0 && shelfLayout === 'uneven');
                topShelfSpaceLabel.style.display = showTopShelfSpace ? '' : 'none';
            }
            if (shelfTypeSelect) {
                // ==> ВОТ ИСПРАВЛЕНИЕ ДЛЯ БЛОКИРОВКИ <==
                shelfTypeSelect.disabled = (shelfCount === 0);
            }

            // --- Логика для спейсера ---
            if (spacerWidthLabel) {
                const showSpacerWidth = spacers.includes('wide');
                spacerWidthLabel.style.display = showSpacerWidth ? '' : 'none';
            }
        };

        // --- Вешаем слушатели ---
        bottomConstructionSelect.addEventListener('change', updateLiftMenuLogic);
        shelfCountInput.addEventListener('input', updateLiftMenuLogic);
        shelfLayoutSelect.addEventListener('change', updateLiftMenuLogic);
        spacersSelect.addEventListener('change', updateLiftMenuLogic);

        // НОВЫЕ слушатели
        liftDoorConstructionSelect.addEventListener('change', updateLiftMenuLogic);
        liftTopFacadeHeightInput.addEventListener('input', updateLiftMenuLogic);
        configMenu.querySelector('#doorOffsetTop').addEventListener('input', updateLiftMenuLogic);
        configMenu.querySelector('#doorOffsetBottom').addEventListener('input', updateLiftMenuLogic);

        // Слушатель для кнопки "Симметричные"
        makeSymmetricalBtn.addEventListener('click', () => {
            const facadeGap = cabinet.facadeGap ? Math.round(cabinet.facadeGap * 1000) : 3;
            const offsetTop = parseInt(configMenu.querySelector('#doorOffsetTop').value) || 0;
            const offsetBottom = parseInt(configMenu.querySelector('#doorOffsetBottom').value) || 0;
            const totalFacadeHeight = Math.round(cabinet.height * 1000) - offsetTop - offsetBottom;

            const symmetricalHeight = Math.ceil((totalFacadeHeight - facadeGap) / 2);

            // Устанавливаем новое значение и снова запускаем всю логику обновления
            liftTopFacadeHeightInput.value = symmetricalHeight;
            updateLiftMenuLogic();
        });


        // --- Первоначальный запуск ---
        updateLiftMenuLogic();
        //console.log("cabinet = ", cabinet);
    } else if (cabinet.type === 'upperCabinet' && cabinet.cabinetConfig === 'falsePanelUpper') {
        const configMenu = document.getElementById('cabinetConfigMenu');
        
        const doorOffsetTopInput = configMenu.querySelector('#doorOffsetTop');
        const doorOffsetBottomInput = configMenu.querySelector('#doorOffsetBottom');

        doorOffsetTopInput.value = cabinet.doorOffsetTop ?? 0;
        doorOffsetBottomInput.value = cabinet.doorOffsetBottom ?? 0;
    } else if (cabinet.type === 'upperCabinet' && cabinet.cabinetConfig === 'openUpper') {
        // --- НОВЫЙ БЛОК ДЛЯ ОТКРЫТЫХ ПОЛОК ---
        const configMenu = document.getElementById('cabinetConfigMenu');
        
        // 2.1: Получаем ссылки на все элементы
        const bottomConstructionSelect = configMenu.querySelector('#bottomConstruction');
        const bottomFrontOffsetInput = configMenu.querySelector('#bottomFrontOffset');
        const bottomOverhangRearInput = configMenu.querySelector('#bottomOverhangRear');
        const leftSideOverhangRearInput = configMenu.querySelector('#leftSideOverhangRear');
        const rightSideOverhangRearInput = configMenu.querySelector('#rightSideOverhangRear');
        const topConstructionSelect = configMenu.querySelector('#topConstruction');
        const backPanelSelect = configMenu.querySelector('#backPanel');
        const backPanelOffsetInput = configMenu.querySelector('#backPanelOffset');
        const backPanelMaterialSelect = configMenu.querySelector('#backPanelMaterial');
        const shelfCountInput = configMenu.querySelector('#shelfCount');
        const shelfTypeLabel = configMenu.querySelector('#shelfTypeLabel');
        const shelfTypeSelect = configMenu.querySelector('#shelfType');
        const shelfMaterialLabel = configMenu.querySelector('#shelfMaterialLabel');
        const shelfMaterialSelect = configMenu.querySelector('#shelfMaterial');
        const frameFacadeSelect = configMenu.querySelector('#frameFacade');
        // --- НОВЫЕ СТРОКИ ---
        const doorOffsetTopLabel = configMenu.querySelector('#doorOffsetTopLabel');
        const doorOffsetTopInput = configMenu.querySelector('#doorOffsetTop');
        const doorOffsetBottomLabel = configMenu.querySelector('#doorOffsetBottomLabel');
        const doorOffsetBottomInput = configMenu.querySelector('#doorOffsetBottom');
        // --- КОНЕЦ НОВЫХ СТРОК ---
        const frameColorLabel = configMenu.querySelector('#frameColorLabel');
        const frameColorSelect = configMenu.querySelector('#frameColor');

        // 2.2: Заполняем `select`-ы опциями
        _fillSelect(bottomConstructionSelect, [ {value: 'inset', text: 'Вкладное'}, {value: 'overlay', text: 'Накладное'}, {value: 'insetGola', text: 'Вкладное с Gola'}, {value: 'overlayGola', text: 'Накладное с Gola'} ], cabinet.bottomConstruction || 'inset');
        _fillSelect(topConstructionSelect, [ {value: 'inset', text: 'Вкладное'}, {value: 'overlay', text: 'Накладное'} ], cabinet.topConstruction || 'inset');
        _fillSelect(backPanelSelect, [ {value: 'yes', text: 'Да'}, {value: 'no', text: 'Нет'} ], cabinet.backPanel || 'yes');
        _fillSelect(backPanelMaterialSelect, [ {value: 'hdf', text: 'ХДФ (белый)'}, {value: 'corpus', text: 'ЛДСП (материал корпуса)'} ], cabinet.backPanelMaterial || 'hdf');
        _fillSelect(shelfTypeSelect, [ {value: 'confirmat', text: 'Евровинт'}, {value: 'shelfHolder', text: 'Полкодержатель'} ], cabinet.shelfType || 'confirmat');
        _fillSelect(shelfMaterialSelect, [ {value: 'corpus', text: 'ЛДСП'}, {value: 'glass', text: 'Стекло'} ], cabinet.shelfMaterial || 'corpus');
        _fillSelect(frameFacadeSelect, [ 
            {value: 'none', text: 'Нет'}, 
            {value: 'z1', text: 'Рамка Z-1'}, 
            {value: 'z9', text: 'Рамка Z-9'}, // <-- Переименовано
            {value: 'z12', text: 'Рамка Z-12'} // <-- Добавлено
        ], cabinet.frameFacade || 'none');
        _fillSelect(frameColorSelect, [ {value: 'aluminum', text: 'Алюминий'}, {value: 'black', text: 'Черный'}, {value: 'white', text: 'Белый'}, {value: 'bronze', text: 'Бронза'} ], cabinet.frameColor || 'aluminum');

        // 2.3: Заполняем `input`-ы значениями
        bottomFrontOffsetInput.value = cabinet.bottomFrontOffset ?? 0;
        bottomOverhangRearInput.value = cabinet.bottomOverhangRear ?? 0;
        leftSideOverhangRearInput.value = cabinet.leftSideOverhangRear ?? 0;
        rightSideOverhangRearInput.value = cabinet.rightSideOverhangRear ?? 0;
        backPanelOffsetInput.value = cabinet.backPanelOffset ?? 0;
        shelfCountInput.value = cabinet.shelfCount ?? 2;
        doorOffsetTopInput.value = cabinet.doorOffsetTop ?? 0;
        doorOffsetBottomInput.value = cabinet.doorOffsetBottom ?? 0;

        // 2.4: "Умная" логика меню
        const updateOpenUpperMenuLogic = () => {
            const hasBackPanel = backPanelSelect.value === 'yes';
            const shelfCount = parseInt(shelfCountInput.value) || 0;
            const shelfMaterial = shelfMaterialSelect.value;
            const hasFrameFacade = frameFacadeSelect.value !== 'none';
            const bottomConstruction = bottomConstructionSelect.value;

            // Видимость полей задней стенки
            backPanelOffsetInput.parentElement.style.display = hasBackPanel ? 'flex' : 'none';
            backPanelMaterialSelect.parentElement.style.display = hasBackPanel ? 'flex' : 'none';

            // Видимость полей полок
            const showShelfFields = shelfCount > 0;
            shelfMaterialLabel.style.display = showShelfFields ? 'flex' : 'none';
            shelfTypeLabel.style.display = (showShelfFields && shelfMaterial === 'corpus') ? 'flex' : 'none';

            // Видимость полей фасада
            doorOffsetTopLabel.style.display = hasFrameFacade ? 'flex' : 'none';
            doorOffsetBottomLabel.style.display = hasFrameFacade ? 'flex' : 'none';
            frameColorLabel.style.display = hasFrameFacade ? 'flex' : 'none';

             // --- НОВЫЙ БЛОК ДЛЯ GOLA ---
            const isGolaBottom = bottomConstruction.includes('Gola');
            bottomFrontOffsetInput.readOnly = isGolaBottom;
            bottomFrontOffsetInput.classList.toggle('readonly-style', isGolaBottom);
            if (isGolaBottom) {
                bottomFrontOffsetInput.value = 20;
            }

            // --- КОНЕЦ НОВОГО БЛОКА ---
        };

        // 2.5: Вешаем слушатели
        bottomConstructionSelect.addEventListener('change', updateOpenUpperMenuLogic);
        backPanelSelect.addEventListener('change', updateOpenUpperMenuLogic);
        shelfCountInput.addEventListener('input', updateOpenUpperMenuLogic);
        shelfMaterialSelect.addEventListener('change', updateOpenUpperMenuLogic);
        frameFacadeSelect.addEventListener('change', updateOpenUpperMenuLogic);

        // 2.6: Первоначальный запуск
        updateOpenUpperMenuLogic();
    }


    // ==> НАЧАЛО ИЗМЕНЕНИЙ: ДОБАВЛЯЕМ ЛОГИКУ ДЛЯ УГЛОВОЙ МОЙКИ В КОНЕЦ ФУНКЦИИ <==
    if (cabinet.cabinetType === 'corner' && cabinet.cabinetConfig === 'sink') {
        
        const directionSelect = configMenuElement.querySelector('#cornerDirection');
        const facadeWidthInput = configMenuElement.querySelector('#facadeWidth');
        const neighborDepthInput = configMenuElement.querySelector('#neighborDepth');

        if (directionSelect && facadeWidthInput && neighborDepthInput) {
            // --- 1. Заполняем поля начальными значениями ---
            const currentDirection = cabinet.cornerDirection || 'left';
            directionSelect.innerHTML = `
                <option value="left" ${currentDirection === 'left' ? 'selected' : ''}>Левый</option>
                <option value="right" ${currentDirection === 'right' ? 'selected' : ''}>Правый</option>
            `;
            
            facadeWidthInput.value = Math.round((cabinet.facadeWidth || 0.45) * 1000);

            // --- 2. Вешаем "живую" логику ---
            const updateNeighborInfo = () => {
                const newDirection = directionSelect.value;
                const tempCabinet = { ...cabinet, cornerDirection: newDirection }; // Моделируем изменение
                // Получаем ID соседней стены
                const adjacentWallId = getAdjacentWallId(tempCabinet.wallId, tempCabinet.cornerDirection);
                if (!adjacentWallId) {
                    neighborDepthInput.value = 0;
                    return;
                }
                const neighbor = findNearestNeighbor(tempCabinet);
                const countertopDepth = window.getCountertopDepthForWall(adjacentWallId);

                let pivotPositionM;
                if (neighbor) {
                    pivotPositionM = countertopDepth - (neighbor.overhang ?? 0.018);
                } else {
                    pivotPositionM = countertopDepth - (cabinet.overhang ?? 0.018);
                }
                neighborDepthInput.value = Math.round(pivotPositionM * 1000);
            };

            // Удаляем старый слушатель, чтобы избежать дублирования
            directionSelect.removeEventListener('change', updateNeighborInfo);
            // Вешаем новый
            directionSelect.addEventListener('change', updateNeighborInfo);

            // Вызываем один раз, чтобы заполнить поле "Глубина соседа" при открытии
            updateNeighborInfo();
        }
    } else if (cabinet.cabinetType === 'cornerUpper') {
    // --- ФИНАЛЬНЫЙ БЛОК ДЛЯ ВЕРХНЕГО УГЛОВОГО ШКАФА ---

    // --- ЧАСТЬ 1: Логика от corner/sink (поиск соседа и угловые параметры) ---
    const directionDisplay = configMenuElement.querySelector('#cornerDirectionDisplay');
    const facadeWidthInput = configMenuElement.querySelector('#facadeWidth');
    const cornerElementInput = configMenuElement.querySelector('#cornerElementWidth');
    const neighborDepthInput = configMenuElement.querySelector('#neighborDepth');

    if (directionDisplay && facadeWidthInput && neighborDepthInput) {
        // 1.1: Заполняем поля начальными значениями
        const currentDirection = cabinet.cornerDirection || 'left';
        directionDisplay.value = (currentDirection === 'left') ? 'Левый' : 'Правый';
        
        facadeWidthInput.value = Math.round((cabinet.facadeWidth || 0.45) * 1000);
        cornerElementInput.value = Math.round((cabinet.cornerElementWidth || 0.018) * 1000);

        // 1.2: Блокируем поле "ширина углового элемента" для Gola
        const handleType = window.kitchenGlobalParams.handleType || 'standard';
        cornerElementInput.disabled = (handleType === 'gola-profile');
        if (handleType === 'gola-profile') {
            // Для Gola "дельта" равна толщине фасада
            const facadeSet = window.facadeSetsData.find(set => set.id === cabinet.facadeSet);
            const { thickness: facadeThicknessM } = MaterialManager.getMaterial(facadeSet);
            cornerElementInput.value = Math.round(facadeThicknessM * 1000);
        }

        // 1.3: "Живая" логика для поля "глубина соседа"
        const neighbor = findNearestNeighbor(cabinet);
        const pivotPositionM = calculateCornerPivotPosition(cabinet, neighbor, MaterialManager);
        neighborDepthInput.value = Math.round(pivotPositionM * 1000);
    }
    
    // --- ЧАСТЬ 2: Логика от swingUpper (полки, дно и т.д.) ---
    
    // 2.1: Получаем ссылки на все остальные элементы
    const bottomTypeSelect = configMenuElement.querySelector('#bottomType');
    const bottomConstructionSelect = configMenuElement.querySelector('#bottomConstruction');
    const bottomFrontOffsetInput = configMenuElement.querySelector('#bottomFrontOffset'); 
    const bottomOverhangRearInput = configMenuElement.querySelector('#bottomOverhangRear');
    const leftSideOverhangRearInput = configMenuElement.querySelector('#leftSideOverhangRear');
    const rightSideOverhangRearInput = configMenuElement.querySelector('#rightSideOverhangRear');
    const backPanelSelect = configMenuElement.querySelector('#backPanel');
    const backPanelOffsetInput = configMenuElement.querySelector('#backPanelOffset');
    const doorOffsetBottomInput = configMenuElement.querySelector('#doorOffsetBottom');
    const doorOffsetTopInput = configMenuElement.querySelector('#doorOffsetTop');
    const shelfCountInput = configMenuElement.querySelector('#shelfCount');
    const shelfTypeSelect = configMenuElement.querySelector('#shelfType');
    const shelfLayoutSelect = configMenuElement.querySelector('#shelfLayout');
    const topShelfSpaceInput = configMenuElement.querySelector('#topShelfSpace');
    const shelfLayoutLabel = configMenuElement.querySelector('#shelfLayoutLabel');
    const topShelfSpaceLabel = configMenuElement.querySelector('#topShelfSpaceLabel');

    // 2.2: Заполняем `select`-ы опциями
    _fillSelect(bottomTypeSelect, [ {value: 'solid', text: 'Сплошное'}, {value: 'slats', text: 'Планки (сушка)'} ], cabinet.bottomType || 'solid');
    _fillSelect(bottomConstructionSelect, [ {value: 'inset', text: 'Вкладное'}, {value: 'overlay', text: 'Накладное'}, {value: 'insetGola', text: 'Вкладное с Gola'}, {value: 'overlayGola', text: 'Накладное с Gola'} ], cabinet.bottomConstruction || 'inset');
    _fillSelect(backPanelSelect, [ {value: 'yes', text: 'Да'}, {value: 'no', text: 'Нет'} ], cabinet.backPanel || 'yes');
    // --- ИСПРАВЛЕНИЕ: Убираем "Без полок" ---
    _fillSelect(shelfTypeSelect, [ {value: 'confirmat', text: 'Евровинт'}, {value: 'shelfHolder', text: 'Полкодержатель'}, {value: 'secura7', text: 'Secura 7'} ], cabinet.shelfType || 'confirmat');
    _fillSelect(shelfLayoutSelect, [ {value: 'even', text: 'Равномерно'}, {value: 'uneven', text: 'Неравномерно'} ], cabinet.shelfLayout || 'even');
    
    // 2.3: Заполняем `input`-ы значениями
    // --- ИЗМЕНЕНИЕ: Жестко задаем и блокируем отступ спереди для углового ---
    if (bottomFrontOffsetInput) {
        const panelThickness = window.getPanelThickness();
        bottomFrontOffsetInput.value = Math.round(panelThickness * 1000);
        bottomFrontOffsetInput.readOnly = true;
        bottomFrontOffsetInput.classList.add('readonly-style');
        // Также принудительно записываем это значение в сам объект шкафа
        //cabinet.bottomFrontOffset = panelThickness;
    }
    bottomOverhangRearInput.value = cabinet.bottomOverhangRear ?? 0;
    leftSideOverhangRearInput.value = cabinet.leftSideOverhangRear ?? 0;
    rightSideOverhangRearInput.value = cabinet.rightSideOverhangRear ?? 0;
    backPanelOffsetInput.value = cabinet.backPanelOffset ?? 0;
    doorOffsetBottomInput.value = cabinet.doorOffsetBottom ?? 0;
    doorOffsetTopInput.value = cabinet.doorOffsetTop ?? 0;
    shelfCountInput.value = cabinet.shelfCount ?? 2; // Дефолт для углового - 2 полки
    topShelfSpaceInput.value = cabinet.topShelfSpace || 300;

    // 2.4: "Умная" логика меню (видимость/блокировка полей)
    const updateUpperCornerMenuLogic = () => {
        const bottomConstruction = bottomConstructionSelect.value;
        const shelfCount = parseInt(shelfCountInput.value) || 0;
        const shelfLayout = shelfLayoutSelect.value;

        // Логика для отступа дна (Gola)
        // const isGolaBottom = bottomConstruction.includes('Gola');
        // bottomFrontOffsetInput.readOnly = isGolaBottom;
        // bottomFrontOffsetInput.classList.toggle('readonly-style', isGolaBottom);
        // if (isGolaBottom) bottomFrontOffsetInput.value = 20;

        // Логика для полей полок
        const showShelfFields = shelfCount > 0;
        shelfTypeSelect.disabled = !showShelfFields;
        shelfLayoutLabel.style.display = showShelfFields ? '' : 'none';
        topShelfSpaceLabel.style.display = (showShelfFields && shelfLayout === 'uneven') ? '' : 'none';
    };

    // 2.5: Вешаем слушатели
    bottomConstructionSelect.addEventListener('change', updateUpperCornerMenuLogic);
    shelfCountInput.addEventListener('input', updateUpperCornerMenuLogic);
    shelfLayoutSelect.addEventListener('change', updateUpperCornerMenuLogic);

    // 2.6: Первоначальный запуск для установки правильного состояния
    updateUpperCornerMenuLogic();
}

    // ==> КОНЕЦ ИЗМЕНЕНИЙ <==

}

function _fillSelect(selectElement, options, currentValue) {
    if (!selectElement) return;
    selectElement.innerHTML = '';
    options.forEach(opt => {
        const optionEl = new Option(opt.text, opt.value);
        if (opt.value === currentValue) {
            optionEl.selected = true;
        }
        selectElement.appendChild(optionEl);
    });
}

export function showCabinetConfigMenu(cabinetIndex, x, y, dependencies) {

    // ==> ИЗМЕНЕНИЕ 2: "Распаковываем" зависимости в локальные переменные <==
    const { objectManager, kitchenGlobalParams, toggleCabinetDetail } = dependencies;
    const cabinets = objectManager.getAllCabinets(); // Получаем массив шкафов

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
    menu.style.top = `${y - 150}px`;
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
        
        // ==> ИЗМЕНЕНИЕ 3: Переписываем слушатель <==
        toggleDetailButton._toggleDetailListener = () => {
            // Используем функцию, которую нам передали
            if (typeof toggleCabinetDetail === 'function') {
                toggleCabinetDetail(cabinetIndex);

                // Получаем актуальное состояние шкафа из objectManager
                const cabinet = objectManager.getAllCabinets()[cabinetIndex]; 
                
                if (cabinet) {
                     toggleDetailButton.textContent = cabinet.isDetailed ? 'Скрыть детали' : 'Показать детали';
                }
            } else {
                console.error("Функция toggleCabinetDetail не была передана в dependencies!");
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

    // ==> НОВЫЙ БЛОК: Слушатель для кнопки выбора материала корпуса <==
    const bodyMaterialBtn = menu.querySelector('#bodyMaterialPickerBtn');
    if (bodyMaterialBtn) {
        bodyMaterialBtn.onclick = () => {
            // Передаем индекс шкафа в модалку
            openBodyMaterialPickerModal(cabinetIndex); 
        };
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
    menu.removeEventListener('keydown', menu._handleKeyDown);
    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            
            // Вызываем функцию применения изменений
            if (typeof window.applyConfigMenuSettings === 'function') {
                window.applyConfigMenuSettings(cabinetIndex);
            }
            
            // ==> ИЗМЕНЕНИЕ: Добавляем вызов рендера <==
            if (typeof window.requestRender === 'function') {
                window.requestRender();
            }
        }
    };
    menu.addEventListener('keydown', handleKeyDown);
    menu._handleKeyDown = handleKeyDown;

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
    let isNewMenu = false;
    if (!managerMenu) {
        managerMenu = document.createElement('div');
        managerMenu.id = 'facadeSetsManagerMenu';
        managerMenu.className = 'facade-sets-manager'; // Новый класс для стилей
        document.body.appendChild(managerMenu);
        isNewMenu = true; // Это новое меню
    }


    // Генерируем HTML меню
    managerMenu.innerHTML = createFacadeSetsManagerHTML();

    // Позиционирование меню
    managerMenu.style.display = 'block';
    if (isNewMenu) {
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
    }

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

// --- Функция генерации HTML для ОДНОЙ Строки ---
function createFacadeSetRowHTML(setData, index) {
    const loadedFacadeData = window.facadeOptionsData || {};
    const setId = setData.id || `set_${Date.now()}_${index}`;
    const setName = setData.name || `Набор фасадов ${index + 1}`;
    
    // Определяем тип материала
    let currentMaterialType = setData.materialType;
    if (!currentMaterialType || !loadedFacadeData[currentMaterialType]) {
        currentMaterialType = Object.keys(loadedFacadeData)[0] || 'ldsp';
    }

    const currentMaterialInfo = loadedFacadeData[currentMaterialType] || {};
    
    // ФЛАГИ: Что нужно показать для этого материала?
    const showColorPicker = currentMaterialInfo.useColorPicker || false;
    const showDecorButton = currentMaterialInfo.decors && currentMaterialInfo.decors.length > 0;

    const currentThickness = setData.thickness !== undefined ? setData.thickness : currentMaterialInfo.defaultThickness || 18;
    const isThicknessEditable = currentMaterialInfo.isThicknessEditable !== undefined ? currentMaterialInfo.isThicknessEditable : true;
    const minThickness = currentMaterialInfo.minThickness || 12;
    const maxThickness = currentMaterialInfo.maxThickness || 22;

    // --- Опции типа материала ---
    const materialKeys = Object.keys(loadedFacadeData);
    const materialOptions = materialKeys.map(key => {
        const info = loadedFacadeData[key];
        const name = info?.name || key;
        const selected = key === currentMaterialType ? 'selected' : '';
        return `<option value="${key}" ${selected}>${name}</option>`;
    }).join('');

    // --- Содержимое колонки Декор/Цвет ---
    let decorColorContent = '';

    // 1. Кнопка Декора (если есть список decors)
    if (showDecorButton) {
        decorColorContent += `
            <button type="button" class="decor-select-btn" title="Выбрать декор/тип" style="flex-grow: 1;">
                <!-- Текст обновится JS-ом -->
                Выбрать...
            </button>
        `;
    }

    // 2. Инпут Цвета (если useColorPicker)
    if (showColorPicker) {
        // Добавляем отступ, если есть кнопка
        const marginStyle = showDecorButton ? 'margin-left: 5px;' : '';
        decorColorContent += `
            <div style="display: flex; align-items: center; ${marginStyle}">
                <input type="color" class="set-color-input" value="${setData.color || '#ffffff'}" 
                       style="width: 40px; height: 30px; cursor: pointer; border: 1px solid #ccc; padding: 0;">
            </div>
        `;
    }

    // Если ничего нет (странно, но бывает)
    if (!showDecorButton && !showColorPicker) {
        decorColorContent = '<span style="color:#aaa; font-size:12px;">Нет опций</span>';
    }

    return `
        <div class="facade-set-row" data-id="${setId}" data-index="${index}">
            <div class="facade-set-cell name-col">
                <input type="text" value="${setName}" placeholder="Введите имя..." data-set-prop="name">
            </div>
            <div class="facade-set-cell material-col">
                <select class="material-type-select" data-set-prop="materialType">${materialOptions}</select>
            </div>
            <div class="facade-set-cell decor-color-col" style="display: flex; align-items: center;">
                ${decorColorContent}
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

// --- Обновление обработчиков (updateRowHandlers) ---
function updateRowHandlers() {
    const rowsContainer = document.getElementById('facadeSetsRowsContainer');
    if (!rowsContainer) return;

    rowsContainer.querySelectorAll('.facade-set-row').forEach(row => {
        const setId = row.dataset.id;
        const rowIndex = parseInt(row.dataset.index);

        // --- 1. Обновляем вид кнопки декора (если она есть) ---
        const decorButton = row.querySelector('.decor-select-btn');
        if (decorButton) {
            updateDecorButtonView(decorButton, row);
            
            // Клик по кнопке декора
            decorButton.onclick = () => {
                // Вызываем модалку выбора из СПИСКА (для типа фрезеровки или текстуры)
                openDecorPickerModal(rowIndex, setId);
            };
        }

        // --- 2. Обработчик Цвета (если есть) ---
        const colorInput = row.querySelector('.set-color-input');
        if (colorInput) {
            colorInput.oninput = (e) => {
                const val = e.target.value;
                const sd = window.facadeSetsData.find(s => s.id === setId);
                if (sd) sd.color = val;
            };
        }

        // --- 3. Остальные стандартные обработчики ---
        const nameInput = row.querySelector('input[type="text"]');
        if (nameInput) nameInput.onchange = (e) => { 
            const sd = window.facadeSetsData.find(s=>s.id===setId); 
            if(sd) sd.name = e.target.value; 
        };

        const materialSelect = row.querySelector('.material-type-select');
        if (materialSelect) {
            materialSelect.onchange = (e) => handleMaterialTypeChange(e);
        }

        const thicknessInput = row.querySelector('.thickness-input');
        if (thicknessInput) thicknessInput.onchange = handleThicknessChange;

        const deleteButton = row.querySelector('.delete-set-btn');
        if (deleteButton) deleteButton.onclick = handleDeleteSet;
    });
}

// --- Вспомогательная: Вид кнопки декора ---
function updateDecorButtonView(btn, row) {
    const setId = row.dataset.id;
    const setData = window.facadeSetsData.find(s => s.id === setId);
    const matInfo = window.facadeOptionsData[setData.materialType];

    let content = '';
    // Если выбран декор (texture) и в материале есть список декоров
    if (setData.texture && matInfo.decors) {
        const decorInfo = matInfo.decors.find(d => d.value === setData.texture);
        if (decorInfo) {
            const img = decorInfo.preview || decorInfo.textureImage || decorInfo.previewImage;
            if (img) {
                content += `<img src="${img}" class="decor-preview-img">`;
            } else {
                // === ВОТ ТУТ ОШИБКА ИЛИ ОТСУТСТВИЕ КОДА ===
                // Если у декора нет картинки (это униколор из базы, например 'U708 Серый'),
                // нужно показать его displayColor.
                const col = decorInfo.displayColor || decorInfo.color || '#ccc';
                content += `<span class="color-swatch" style="background:${col}"></span>`;
            }
            content += `<span class="decor-select-text">${decorInfo.text || decorInfo.name}</span>`;
        }
    } else {
        // Если картинки нет, показываем цветной квадрат (для униколоров из базы)
        const color = decorInfo.displayColor || decorInfo.color || '#ccc';
        content += `<span class="color-swatch" style="background:${color}; width:20px;height:20px;display:inline-block;vertical-align:middle;border:1px solid #ddd;margin-right:5px;"></span>`;
    }
    
    if (!content) content = "Выбрать...";
    btn.innerHTML = content;
}

// --- Обработчик изменения типа материала ---
function handleMaterialTypeChange(event) {
    const select = event.target;
    const row = select.closest('.facade-set-row');
    const setId = row.dataset.id;
    const newMaterialType = select.value;
    const setData = window.facadeSetsData.find(set => set.id === setId);
    const newMaterialInfo = window.facadeOptionsData[newMaterialType];

    setData.materialType = newMaterialType;

    const useColor = newMaterialInfo.useColorPicker || false;
    const hasDecors = newMaterialInfo.decors && newMaterialInfo.decors.length > 0;

    // 1. Инициализация ЦВЕТА
    if (useColor) {
        if (!setData.color) setData.color = '#ffffff';
    } else {
        setData.color = null;
    }

    // 2. Инициализация ДЕКОРА
    if (hasDecors) {
        // Если текущий декор не подходит, берем первый из списка
        const currentValid = newMaterialInfo.decors.some(d => d.value === setData.texture);
        if (!setData.texture || !currentValid) {
            setData.texture = newMaterialInfo.decors[0].value;
        }
    } else {
        setData.texture = null;
    }
    
    // 3. Обновление ТОЛЩИНЫ (если нужно)
    if (newMaterialInfo.defaultThickness) {
        setData.thickness = newMaterialInfo.defaultThickness;
    }

    // 4. Перерисовка меню
    // Теперь меню не прыгнет, так как мы добавили проверку isNewMenu
    showFacadeSetsManager(); 
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
    const materialType = setData.materialType;
    const materialInfo = loadedFacadeData[materialType] || {};
    
    // ПРОВЕРКА: Если декоров нет, то и выбирать нечего (цвет выбираем в строке)
    if (!materialInfo.decors || materialInfo.decors.length === 0) {
        console.warn("Нет декоров для выбора (возможно, только цвет).");
        // Если это просто крашеный фасад (без фрезеровок), то кнопка может быть не нужна,
        // или можно показать уведомление.
        return;
    }

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
            <div class="decor-picker-header">Выбор декора: ${materialInfo.name || materialType}</div>
    `;

    // МЫ ВСЕГДА ПОКАЗЫВАЕМ СПИСОК ДЕКОРОВ, если они есть
    // Игнорируем useColor, так как цвет выбирается отдельно
    
    modalContentHTML += '<div class="decor-grid">';
    materialInfo.decors.forEach(decor => {
        let previewElement = '';
        // Если есть картинка - показываем
        if (decor.previewImage || decor.preview) {
            previewElement = `<img src="${decor.previewImage || decor.preview}" alt="${decor.text}" class="decor-preview-img">`;
        } else {
            // Если картинки нет (например, это просто форма фрезеровки), можно показать иконку или текст
            // Или цветной квадрат (но для фрезеровки цвет не важен в этом списке)
            const color = decor.displayColor || decor.color || '#ccc';
            previewElement = `<span class="color-swatch" style="background-color:${color}; width:100%; height:80px; display:block;"></span>`;
        }
        
        modalContentHTML += `
            <div class="decor-grid-item" data-decor-value="${decor.value}" title="${decor.text}">
                ${previewElement}
                <span>${decor.text}</span>
            </div>
        `;
    });
    modalContentHTML += '</div>'; // end decor-grid

    modalContentHTML += '</div>'; // end decor-picker-content
    modal.innerHTML = modalContentHTML;

    // --- Обработчики ---
    const closeButton = modal.querySelector('.decor-picker-close');
    if (closeButton) closeButton.onclick = () => modal.style.display = 'none';
    modal.onclick = (event) => { if (event.target === modal) modal.style.display = 'none'; };

    // Обработчик клика по ячейке
    modal.querySelectorAll('.decor-grid-item').forEach(item => {
        item.onclick = () => {
            const selectedDecorValue = item.dataset.decorValue;
            console.log(`Выбран декор: ${selectedDecorValue} для ${setId}`);
            // Обновляем ТОЛЬКО декор (цвет не трогаем)
            updateFacadeSelection(rowIndex, setId, selectedDecorValue, null); 
            modal.style.display = 'none';
        };
    });

    modal.style.display = 'block';
}

function openBodyMaterialPickerModal(cabinetIndex) {
    const loadedFacadeData = window.facadeOptionsData || {};
    const materialInfo = loadedFacadeData['ldsp']; // <== Берем ТОЛЬКО ЛДСП
    if (!materialInfo || !materialInfo.decors) {
        alert("Данные для материалов корпуса (ЛДСП) не загружены!");
        return;
    }

    let modal = document.getElementById('bodyMaterialPickerModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'bodyMaterialPickerModal';
        modal.className = 'decor-picker-modal'; // Используем те же стили
        document.body.appendChild(modal);
    }

    let modalContentHTML = `
        <div class="decor-picker-content">
            <span class="decor-picker-close">×</span>
            <div class="decor-picker-header">Выбор материала корпуса (ЛДСП)</div>
            <div class="decor-grid">`;
    
    materialInfo.decors.forEach(decor => {
        let previewElement = decor.previewImage
            ? `<img src="${decor.previewImage}" alt="${decor.text}" class="decor-preview-img">`
            : `<span class="color-swatch" style="background-color:${decor.displayColor || '#ccc'};"></span>`;
        
        modalContentHTML += `
            <div class="decor-grid-item" data-decor-value="${decor.value}" title="${decor.text}">
                ${previewElement}
                <span>${decor.text}</span>
            </div>
        `;
    });
    modalContentHTML += '</div></div>';
    modal.innerHTML = modalContentHTML;

    // --- Обработчики ---
    modal.querySelector('.decor-picker-close').onclick = () => modal.style.display = 'none';
    modal.onclick = (event) => { if (event.target === modal) modal.style.display = 'none'; };

    modal.querySelectorAll('.decor-grid-item').forEach(item => {
        item.onclick = () => {
            const selectedDecorValue = item.dataset.decorValue;
            
            // Получаем актуальный массив шкафов
            const cabinets = window.objectManager.getAllCabinets();
            const cabinetToUpdate = cabinets[cabinetIndex];

            if (cabinetToUpdate) {
                // ==> ИЗМЕНЕНИЕ: Обновляем свойство у КОНКРЕТНОГО шкафа <==
                cabinetToUpdate.bodyMaterial = selectedDecorValue;

                // Перерисовываем ТОЛЬКО этот шкаф
                window.objectManager.updateCabinetRepresentation(cabinetToUpdate);
                window.requestRender();
            }
            modal.style.display = 'none';            
        };
    });

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

export function openCountertopPickerModal(countertop) {
    if (!window.countertopOptionsData) {
        alert("Данные для материалов столешниц не загружены!");
        return;
    }

    let modal = document.getElementById('countertopPickerModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'countertopPickerModal';
        modal.className = 'decor-picker-modal'; // Используйте ваши стили
        document.body.appendChild(modal);
    }

    let modalContentHTML = `<div class="decor-picker-content">
        <div class="decor-picker-header"><span>Выбор материала</span><span class="decor-picker-close">×</span></div>
        <div class="decor-picker-body"><div class="decor-grid">`;

    window.countertopOptionsData.forEach(decor => {
        modalContentHTML += `
            <div class="decor-grid-item" data-id="${decor.id}" title="${decor.name}">
                <img src="${decor.preview}" alt="${decor.name}">
                <span>${decor.name}</span>
            </div>`;
    });

    modalContentHTML += `</div></div></div>`;
    modal.innerHTML = modalContentHTML;

    // --- Обработчики --- 
    modal.querySelector('.decor-picker-close').onclick = () => modal.style.display = 'none';
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };

    modal.querySelectorAll('.decor-grid-item').forEach(item => {
        item.onclick = () => {
            const selectedMaterialId = item.dataset.id;
            const materialInfo = window.countertopOptionsData.find(m => m.id === selectedMaterialId);

            if (!materialInfo) return;

            // 1. Сохраняем старое состояние
            const oldState = { ...countertop.userData };

            // 2. Создаем новое состояние
            const newState = {
                ...oldState,
                materialId: selectedMaterialId
                //countertopType: materialInfo.countertopType
            };

            // 3. Создаем и выполняем команду
            const command = new UpdateCountertopCommand(countertop, newState, oldState);
            historyManager.execute(command);
            
            modal.style.display = 'none';
        };
    });

    modal.style.display = 'block';
}

/**
 * Открывает окно выбора материала для фартука (плитка или панель).
 * @param {object} apronObject - Объект фартука (для чтения текущих данных)
 * @param {string} currentType - 'tiles' или 'panel' (определяет какую базу грузить)
 * @param {function} onSelectCallback - Функция обратного вызова (id, type) -> void
 */
export function openApronMaterialPicker(apronObject, currentType, onSelectCallback) {
    let dataArray = [];
    let title = "";

    // 1. Определяем источник данных
    if (currentType === 'tiles') {
        if (!window.tilesOptionsData) {
            alert("Ошибка: База данных плитки (tilesOptionsData) не загружена!"); 
            return;
        }
        dataArray = window.tilesOptionsData;
        title = "Выбор декора плитки";
    } else {
        // Для панели используем базу столешниц
        if (!window.countertopOptionsData) {
            alert("Ошибка: База данных столешниц (countertopOptionsData) не загружена!");
            return;
        }
        dataArray = window.countertopOptionsData;
        title = "Выбор декора панели (Скиналь)";
    }

    // 2. Ищем или создаем контейнер модалки
    let modal = document.getElementById('apronMaterialModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'apronMaterialModal';
        modal.className = 'decor-picker-modal'; // Используем твои существующие CSS классы
        document.body.appendChild(modal);
    }

    // 3. Генерируем HTML
    let html = `
    <div class="decor-picker-content">
        <div class="decor-picker-header">
            <span>${title}</span>
            <span class="decor-picker-close">×</span>
        </div>
        <div class="decor-picker-body">
            <div class="decor-grid">`;

    dataArray.forEach(item => {
        // Определяем, что показывать: картинку или цвет
        let visualBlock = '';
        
        // Логика: если есть preview - показываем его. 
        // Если нет preview, но есть textureImage - показываем её.
        // Если нет картинок - показываем цвет.
        const imgPath = item.preview || item.textureImage;

        if (imgPath) {
            visualBlock = `<img src="${imgPath}" alt="${item.name}" class="decor-preview-img" style="width:100%; height:80px; object-fit:cover;">`;
        } else {
            // Фалбек на цвет (если задан, или серый)
            const color = item.color || item.baseColor || '#cccccc';
            visualBlock = `<div style="width:100%; height:80px; background-color:${color}; border:1px solid #ddd;"></div>`;
        }

        html += `
            <div class="decor-grid-item" data-id="${item.id}" title="${item.name}">
                ${visualBlock}
                <span>${item.name}</span>
            </div>`;
    });

    html += `
            </div>
        </div>
    </div>`;
    
    modal.innerHTML = html;

    // 4. Навешиваем обработчики
    const closeModal = () => modal.style.display = 'none';
    
    // Закрытие по крестику
    const closeBtn = modal.querySelector('.decor-picker-close');
    if (closeBtn) closeBtn.onclick = closeModal;

    // Закрытие по клику вне окна
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };

    // Клик по элементу
    modal.querySelectorAll('.decor-grid-item').forEach(div => {
        div.onclick = () => {
            const id = div.dataset.id;
            
            // Вызываем callback, передавая данные
            // Мы передаем также type, чтобы MaterialManager знал, в какой базе искать ID
            if (onSelectCallback) {
                onSelectCallback({ id: id, type: currentType });
            }
            
            closeModal();
        };
    });

    modal.style.display = 'block';
}

/**
 * Открывает окно выбора материала для цоколя (из базы фасадов).
 */
export function openPlinthMaterialPicker(plinthObject, onSelectCallback) {
    // Используем базу фасадов
    // Но ты говорил, что там должны быть еще 5 цветов пластика.
    // Мы можем объединить их: [ ...facadeData.ldsp, ...plasticColors ]
    // Или использовать только ldsp/mdf если пластика пока нет в JSON.
    
    // Предположим, мы показываем вкладку 'ldsp' из фасадов + доп. цвета
    // Или просто список всех декоров.
    
    const facadeData = window.facadeOptionsData;
    if (!facadeData) { alert("База фасадов не загружена"); return; }

    // Собираем список для отображения.
    // Обычно фасады разбиты по категориям (ldsp, mdf...).
    // Давай возьмем декоры из 'ldsp' как основу.
    let items = [];
    if (facadeData['ldsp'] && facadeData['ldsp'].decors) {
        items = [...facadeData['ldsp'].decors];
    }
    
    // Добавляем спец. цвета для цоколя (если их нет в базе)
    const specialColors = [
        { id: 'plinth_white_matt', name: 'Белый матовый', color: '#FFFFFF', isSolid: true },
        { id: 'plinth_white_gloss', name: 'Белый глянец', color: '#FFFFFF', isSolid: true, roughness: 0.1 },
        { id: 'plinth_black_matt', name: 'Черный матовый', color: '#111111', isSolid: true },
        { id: 'plinth_black_gloss', name: 'Черный глянец', color: '#111111', isSolid: true, roughness: 0.1 },
        { id: 'plinth_silver', name: 'Серебристый', color: '#C0C0C0', isSolid: true, metalness: 0.8 }
    ];
    items = [...specialColors, ...items];

    // Создаем модалку (код аналогичен ApronPicker)
    let modal = document.getElementById('plinthMaterialModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'plinthMaterialModal';
        modal.className = 'decor-picker-modal';
        document.body.appendChild(modal);
    }

    let html = `
    <div class="decor-picker-content">
        <div class="decor-picker-header"><span>Материал цоколя</span><span class="decor-picker-close">×</span></div>
        <div class="decor-picker-body"><div class="decor-grid">`;

    items.forEach(item => {
        // Визуал
        let visual = '';
        // Проверяем textureImage (из фасадов) или color (из спец цветов)
        // В фасадах поле называется textureImage или previewImage? 
        // В твоем примере было: "textureImage": "textures/xl/..."
        
        const img = item.previewImage || item.textureImage || item.preview; 
        
        if (img) {
            visual = `<img src="${img}" style="width:100%; height:80px; object-fit:cover;">`;
        } else {
            const col = item.displayColor || item.color || '#ccc';
            visual = `<div style="width:100%; height:80px; background:${col}; border:1px solid #ddd;"></div>`;
        }

        // Используем value или id как идентификатор
        const id = item.value || item.id; 

        html += `
            <div class="decor-grid-item" data-id="${id}" title="${item.text || item.name}">
                ${visual}
                <span>${item.text || item.name}</span>
            </div>`;
    });

    html += `</div></div></div>`;
    modal.innerHTML = html;

    // Обработчики
    const closeModal = () => modal.style.display = 'none';
    modal.querySelector('.decor-picker-close').onclick = closeModal;
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };

    modal.querySelectorAll('.decor-grid-item').forEach(div => {
        div.onclick = () => {
            const id = div.dataset.id;
            
            // Ищем полные данные о выбранном элементе
            const selectedItem = items.find(i => (i.value || i.id) === id);
            
            if (onSelectCallback) {
                onSelectCallback(selectedItem); // Передаем весь объект, чтобы MaterialManager мог его прочитать
            }
            closeModal();
        };
    });

    modal.style.display = 'block';
}

// Функция для контекстного меню стены
export function showWallContextMenu(x, y, faceIndex) {
    // Сначала прячем все другие возможные меню
    if (typeof window.hideAllContextMenus === 'function') {
        window.hideAllContextMenus();
    }

    const menu = document.createElement('div');
    menu.className = 'context-menu'; 
    menu.style.position = 'absolute';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.zIndex = '1001'; 
    menu.style.padding = '10px';
    menu.style.backgroundColor = '#fff';
    menu.style.border = '1px solid #ccc';
    menu.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    menu.style.display = 'flex';
    menu.style.flexDirection = 'column';
    menu.style.gap = '8px';
    
    // Кнопка выбора материала (текстуры)
    const button = document.createElement('button');
    button.textContent = 'Настроить материал';
    button.style.padding = '5px 10px';
    button.style.cursor = 'pointer';
    button.onclick = () => {
        // Вызываем функцию из этого же файла
        openWallMaterialPicker(faceIndex);
        
        if (menu.parentNode) { 
            menu.parentNode.removeChild(menu);
        }
    };
    menu.appendChild(button);
    document.body.appendChild(menu);

    // --- БЛОК ЦВЕТА СТЕНЫ ---
    const colorPickerContainer = document.createElement('div');
    colorPickerContainer.style.borderTop = '1px solid #eee';
    colorPickerContainer.style.paddingTop = '8px';
    colorPickerContainer.style.display = 'flex';
    colorPickerContainer.style.flexDirection = 'column';
    colorPickerContainer.style.gap = '5px';

    // 1. Определение начального цвета
    let initColor = '#ffffff';
    let isCurrentColorReal = false; 

    // Получаем текущий материал
    let currentMat = getWallMaterial(faceIndex);

    // === ФИКС ДЛЯ ВЫДЕЛЕННОЙ СТЕНЫ ===
    // Если мы кликнули по выделенной стене, currentMat будет "голубым".
    // Нам нужен оригинал.
    if (getOriginalWallMaterial) { // Или через импорт
        const originalMat = getOriginalWallMaterial();
        // Проверяем: оригинал существует И выделена именно эта стена
        // (Хотя, если мы кликнули ПКМ по стене, она обычно выделена).
        if (originalMat) {
            currentMat = originalMat;
        }
    }

    if (currentMat) {
        // Приоритет 1: Берем цвет из ID материала (это истинный цвет, даже если стена выделена)
        if (currentMat.userData && currentMat.userData.materialId && currentMat.userData.materialId.startsWith('color_')) {
            initColor = '#' + currentMat.userData.materialId.replace('color_', '');
            isCurrentColorReal = true;
        } 
        // Приоритет 2: Если это не цвет по ID, но материал стандартный (и не текстура)
        // (Осторожно: тут может быть цвет выделения!)
        else if (currentMat.isMeshStandardMaterial && !currentMat.map) {
            // Можно добавить проверку: если цвет совпадает с цветом выделения - игнорировать?
            // Или лучше оставить как есть, надеясь на ID.
            initColor = '#' + currentMat.color.getHexString();
            isCurrentColorReal = true;
        }
    }

    if (!isCurrentColorReal && window.lastSelectedWallColor) {
        initColor = window.lastSelectedWallColor;
    }

    // 2. Ряд с Color Picker
    const pickerRow = document.createElement('div');
    pickerRow.style.display = 'flex';
    pickerRow.style.alignItems = 'center';
    pickerRow.style.justifyContent = 'space-between';
    
    const label = document.createElement('label');
    label.textContent = 'Цвет: ';
    label.style.fontSize = '14px';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = initColor;
    colorInput.style.cursor = 'pointer';
    colorInput.style.height = '30px';
    colorInput.style.width = '50px';
    colorInput.style.padding = '0';
    colorInput.style.border = 'none';
    colorInput.style.backgroundColor = 'transparent';

    pickerRow.appendChild(label);
    pickerRow.appendChild(colorInput);
    colorPickerContainer.appendChild(pickerRow);

    // 3. Ряд с инструментами (Hex + Copy + Paste)
    const toolsRow = document.createElement('div');
    toolsRow.style.display = 'flex';
    toolsRow.style.gap = '5px';
    toolsRow.style.alignItems = 'center';

    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.value = initColor;
    hexInput.style.width = '70px';
    hexInput.style.fontSize = '12px';
    hexInput.style.padding = '2px 4px';
    hexInput.style.border = '1px solid #ccc';
    hexInput.style.borderRadius = '3px';
    
    // Кнопка Копировать
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'C';
    copyBtn.title = 'Копировать код цвета';
    copyBtn.style.width = '24px';
    copyBtn.style.height = '24px';
    copyBtn.style.padding = '0';
    copyBtn.style.cursor = 'pointer';
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(hexInput.value)
            .then(() => {
                copyBtn.textContent = 'ok';
                setTimeout(() => copyBtn.textContent = 'C', 1000);
            })
            .catch(err => console.error('Ошибка копирования:', err));
    };

    // Кнопка Вставить
    const pasteBtn = document.createElement('button');
    pasteBtn.textContent = 'V';
    pasteBtn.title = 'Вставить код цвета';
    pasteBtn.style.width = '24px';
    pasteBtn.style.height = '24px';
    pasteBtn.style.padding = '0';
    pasteBtn.style.cursor = 'pointer';
    pasteBtn.onclick = async () => {
        try {
            const text = await navigator.clipboard.readText();
            let val = text.trim();
            // Добавляем # если нет, но есть 6 hex цифр
            if (!val.startsWith('#') && /^[0-9A-F]{6}$/i.test(val)) val = '#' + val;
            
            if (/^#[0-9A-F]{6}$/i.test(val)) {
                updateColor(val);
            } else {
                alert('В буфере обмена нет корректного кода цвета (HEX)');
            }
        } catch (err) {
            console.error('Ошибка вставки:', err);
            const manual = prompt("Введите код цвета (#RRGGBB):", "");
            if (manual && /^#[0-9A-F]{6}$/i.test(manual)) updateColor(manual);
        }
    };

    toolsRow.appendChild(hexInput);
    toolsRow.appendChild(copyBtn);
    toolsRow.appendChild(pasteBtn);
    colorPickerContainer.appendChild(toolsRow);

    menu.appendChild(colorPickerContainer);

    // --- ОБЩАЯ ЛОГИКА ОБНОВЛЕНИЯ ---
    function updateColor(hexValue) {
        colorInput.value = hexValue;
        hexInput.value = hexValue;
        
        const colorId = `color_${hexValue.replace('#', '')}`;
        window.lastSelectedWallColor = hexValue; // Используем window только для хранения сессии
        
        // Применяем через импортированную функцию
        applyMaterialToWall(faceIndex, colorId);
    }

    // Слушатель изменения Пикера (Live update)
    colorInput.addEventListener('input', (e) => {
        hexInput.value = e.target.value;
        updateColor(e.target.value);
    });

    // Слушатель изменения Текстового поля
    hexInput.addEventListener('change', (e) => {
        let val = e.target.value;
        if (!val.startsWith('#')) val = '#' + val;
        if (/^#[0-9A-F]{6}$/i.test(val)) {
            updateColor(val);
        } else {
            // Возвращаем старое значение
            hexInput.value = colorInput.value;
        }
    });

    // --- Закрытие меню ---
    const closeMenuHandler = (event) => {
        if (!menu.contains(event.target)) {
            if (menu.parentNode) {
                menu.parentNode.removeChild(menu);
            }
            document.removeEventListener('click', closeMenuHandler, true);
        }
    };
    setTimeout(() => document.addEventListener('click', closeMenuHandler, true), 0);
}

// Функция для модального окна выбора материала стены
export function openWallMaterialPicker(faceIndex) {
    // Проверяем, загружены ли данные
    if (!window.wallMaterialsData || window.wallMaterialsData.length === 0) {
        alert("Данные для материалов стен не загружены!");
        return;
    }

    // Ищем или создаем модальное окно
    let modal = document.getElementById('wallMaterialPickerModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'wallMaterialPickerModal';
        modal.className = 'decor-picker-modal'; // Используйте тот же стиль, что и у других модалок
        document.body.appendChild(modal);
    }
    
    // Генерируем HTML-содержимое
    let modalContentHTML = `<div class="decor-picker-content">
        <div class="decor-picker-header">
            <span>Выбор материала для стены</span>
            <span class="decor-picker-close">×</span>
        </div>
        <div class="decor-picker-body"><div class="decor-grid">`;

    window.wallMaterialsData.forEach(decor => {
        // Создаем превью: либо картинка, либо цветной квадрат
        const previewElement = decor.type === 'texture'
            ? `<img src="${decor.preview}" alt="${decor.name}">`
            : `<div class="color-swatch" style="background-color: ${decor.value};"></div>`;
        
        modalContentHTML += `
            <div class="decor-grid-item" data-id="${decor.id}" title="${decor.name}">
                ${previewElement}
                <span>${decor.name}</span>
            </div>`;
    });

    modalContentHTML += `</div></div></div>`; // Закрываем .decor-grid, .decor-picker-body, .decor-picker-content
    modal.innerHTML = modalContentHTML;
    
    // --- Вешаем обработчики ---
    
    // Закрытие по клику на крестик
    modal.querySelector('.decor-picker-close').onclick = () => {
        modal.style.display = 'none';
    };
    
    // Закрытие по клику на фон
    modal.onclick = (event) => { 
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };

    // ГЛАВНОЕ: Обработчики для каждого материала
    modal.querySelectorAll('.decor-grid-item').forEach(item => {
        item.onclick = () => {
            const selectedMaterialId = item.dataset.id;
            
            // Вызываем функцию из roomManager для применения материала
            applyMaterialToWall(faceIndex, selectedMaterialId);
            
            // Закрываем модальное окно
            modal.style.display = 'none';
        };
    });

    // Показываем модальное окно
    modal.style.display = 'block';
}

export function showFloorContextMenu(x, y) {
    window.hideAllContextMenus();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.position = 'absolute';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    
    // Кнопка меняет текст в зависимости от того, есть ли уже пол
    const buttonText = window.floorObject ? 'Настроить покрытие' : 'Создать покрытие';
    
    const button = document.createElement('button');
    button.textContent = buttonText;
    button.onclick = () => {
        showFloorSettingsMenu(x, y); // Вызываем основное меню настроек
        menu.remove();
    };
    menu.appendChild(button);
    document.body.appendChild(menu);
    // ... добавьте логику закрытия по клику в стороне ...
    // Добавим обработчик для закрытия меню по клику в стороне
    const closeMenuHandler = (event) => {
        if (!menu.contains(event.target)) {
            if (menu.parentNode) {
                menu.parentNode.removeChild(menu);
            }
            document.removeEventListener('click', closeMenuHandler, true);
        }
    };
    // Используем `setTimeout`, чтобы этот обработчик не сработал на тот же клик, что его создал
    setTimeout(() => document.addEventListener('click', closeMenuHandler, true), 0);
}

/*
// Основное меню настроек ПОЛА
export function showFloorSettingsMenu(x, y) {
    // Ищем, есть ли меню, если нет - создаем
    let menu = document.getElementById('floorSettingsMenu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'floorSettingsMenu';
        menu.className = 'kitchen-params-menu'; // Используем тот же стиль
        document.body.appendChild(menu);
    }



    menu.innerHTML = `
        <h3>Настройки напольного покрытия</h3>
        <label>Ширина планки (мм): <input type="number" id="plankWidth" value="${currentSettings.plankWidth}"></label>
        <label>Длина планки (мм): <input type="number" id="plankLength" value="${currentSettings.plankLength}"></label>
        <label>Зазор (мм): <input type="number" id="gap" value="${currentSettings.gap}"></label>
        <label>Смещение рядов (%): <input type="number" id="offset" value="${currentSettings.offset}" min="0" max="100"></label>
        <label>Направление: 
            <select id="direction">
                <option value="0" ${currentSettings.direction == 0 ? 'selected' : ''}>Вдоль длины комнаты (0°)</option>
                <option value="90" ${currentSettings.direction == 90 ? 'selected' : ''}>Вдоль глубины комнаты (90°)</option>
            </select>
        </label>
        <hr>
        <button id="floorApplyButton">Применить</button>
        <button id="floorCancelButton">Отмена</button>
        <button id="floorMaterialButton">Выбрать материал</button>
    `;

    menu.style.display = 'block';

    menu.style.left = `${x + 30}px`;
    menu.style.top = `${y - 150}px`;
    //menu.style.display = 'flex';

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

    });
    // Добавим обработчик для закрытия меню по клику в стороне
    const closeMenuHandler = (event) => {
        if (!menu.contains(event.target)) {
            if (menu.parentNode) {
                menu.parentNode.removeChild(menu);
            }
            document.removeEventListener('click', closeMenuHandler, true);
        }
    };
    // Используем `setTimeout`, чтобы этот обработчик не сработал на тот же клик, что его создал
    setTimeout(() => document.addEventListener('click', closeMenuHandler, true), 0);
    // ... код для позиционирования меню по центру экрана ...
}*/

// Основное меню настроек ПОЛА (ИНТЕРАКТИВНАЯ ВЕРСИЯ)

export function showFloorSettingsMenu(x, y) {
    let menu = document.getElementById('floorSettingsMenu');
    if (menu) menu.remove();

    // ==> ИЗМЕНЕНИЕ: Объявляем переменную здесь <==
    let closeMenuHandler; 

    const removeCloseHandler = () => {
        document.removeEventListener('click', closeMenuHandler, true);
    }

    menu = document.createElement('div');
    menu.id = 'floorSettingsMenu';
    menu.className = 'kitchen-params-menu';
    document.body.appendChild(menu);

    // Сохраняем начальный объект пола. Это НАСТОЯЩИЙ пол, который сейчас в сцене.
    const initialFloorObject = window.floorObject;
    // Эта переменная будет хранить временный объект для предпросмотра.
    let previewFloorObject = null;
    let currentSettings = {
        plankWidth: 200,
        plankLength: 1200,
        plankHeight: 2, // Или 10
        gap: 2,
        offset: 20,
        direction: 0,
        materialId: null
    };

    if (window.floorObject && window.floorObject.userData) {
        // ИЩЕМ В ПРАВИЛЬНОМ МЕСТЕ (floorParams)
        const savedParams = window.floorObject.userData.floorParams;
        if (savedParams) {
            currentSettings = { ...currentSettings, ...savedParams };
        }
        
        // Материал лежит отдельно или внутри params?
        // В floorGenerator мы писали: floorMesh.userData.materialId = materialId;
        if (window.floorObject.userData.materialId) {
            currentSettings.materialId = window.floorObject.userData.materialId;
        }
    }

    menu.innerHTML = `
        <h3>Настройки напольного покрытия</h3>
        <label>Ширина планки (мм): <input type="number" id="plankWidth" value="${currentSettings.plankWidth}"></label>
        <label>Длина планки (мм): <input type="number" id="plankLength" value="${currentSettings.plankLength}"></label>
        <label>Толщина планки (мм): <input type="number" id="plankHeight" value="${currentSettings.plankHeight}"></label>
        <label>Зазор (мм): <input type="number" id="gap" value="${currentSettings.gap}"></label>
        <label>Смещение рядов (%): <input type="number" id="offset" value="${currentSettings.offset}" min="0" max="100"></label>
        <label>Направление: 
            <select id="direction">
                <option value="0" ${currentSettings.direction == 0 ? 'selected' : ''}>Вдоль длины (0°)</option>
                <option value="90" ${currentSettings.direction == 90 ? 'selected' : ''}>Вдоль глубины (90°)</option>
            </select>
        </label>
        <hr>
        <button id="floorApplyButton">Применить</button>
        <button id="floorCancelButton">Отмена</button>
        <button id="floorMaterialButton">Выбрать материал</button>
        <button id="floorDeleteButton" style="background-color: #E57373; color: white; margin-top: 5px;" ${!initialFloorObject ? 'disabled' : ''}>Удалить</button>
    `;

    menu.dataset.selectedMaterialId = currentSettings.materialId; // Сохраняем начальный materialId

    const updatePreview = () => {
        const params = {
            plankHeight: parseFloat(document.getElementById('plankHeight').value) || 2,
            plankWidth: parseFloat(document.getElementById('plankWidth').value) || 200,
            plankLength: parseFloat(document.getElementById('plankLength').value) || 1200,
            gap: parseFloat(document.getElementById('gap').value) || 0,
            offset: parseFloat(document.getElementById('offset').value) || 0,
            direction: parseInt(document.getElementById('direction').value) || 0
        };

        if (params.plankWidth <= 0 || params.plankLength <= 0) return;
        
        if (previewFloorObject && previewFloorObject.parent) {
            previewFloorObject.parent.remove(previewFloorObject);
            // TODO: очистка геометрии/материала
        }

        const materialId = menu.dataset.selectedMaterialId;
        previewFloorObject = window.floorGenerator(params, true, materialId);
        
        if (previewFloorObject) {
            window.scene.add(previewFloorObject);
        }
        window.requestRender();
    };

    // --- Управление видимостью и позиционированием (ВАШ КОД) ---
    menu.style.display = 'block';
    menu.style.position = 'absolute';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    setTimeout(() => {
        const menuWidth = menu.offsetWidth;
        const menuHeight = menu.offsetHeight;
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        let left = x - menuWidth / 2;
        let top = y - menuHeight / 2;

        if (left + menuWidth > screenWidth) left = screenWidth - menuWidth - 5;
        if (left < 5) left = 5;
        if (top + menuHeight > screenHeight) top = screenHeight - menuHeight - 5;
        if (top < 5) top = 5;

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;

        const firstInput = menu.querySelector('input, select');
        if (firstInput) {
            firstInput.focus();
            if(firstInput.select) firstInput.select();
        }
    });

    // --- ОБРАБОТЧИКИ КНОПОК И ПОЛЕЙ ---
    if (initialFloorObject) {
        initialFloorObject.visible = false;
    }

    const inputs = menu.querySelectorAll('input, select');
    inputs.forEach(input => input.addEventListener('input', updatePreview));

    menu.querySelector('#floorCancelButton').onclick = () => {
        if (previewFloorObject && previewFloorObject.parent) {
            previewFloorObject.parent.remove(previewFloorObject);
        }
        if (initialFloorObject) {
            initialFloorObject.visible = true;
        }
        menu.remove();
        removeCloseHandler();
        window.requestRender();
    };

    menu.querySelector('#floorApplyButton').onclick = () => {
        if (initialFloorObject && initialFloorObject.parent) {
            initialFloorObject.parent.remove(initialFloorObject);
        }

        const finalParams = {
                plankHeight: parseFloat(document.getElementById('plankHeight').value),
                plankWidth: parseFloat(document.getElementById('plankWidth').value),
                plankLength: parseFloat(document.getElementById('plankLength').value),
                gap: parseFloat(document.getElementById('gap').value),
                offset: parseFloat(document.getElementById('offset').value),
                direction: parseInt(document.getElementById('direction').value)
            };
        const finalMaterialId = menu.dataset.selectedMaterialId;

        const newFloor = window.floorGenerator(finalParams, false, finalMaterialId);
        if (newFloor) {
            window.scene.add(newFloor);
            window.setFloorObject(newFloor);
            window.floorObject.userData.floorParams = finalParams;
            window.floorObject.userData.materialId = finalMaterialId;

        } else {
            // Если генерация не удалась, сбрасываем объект
            window.setFloorObject(null);
        }
        if (previewFloorObject && previewFloorObject.parent) {
            previewFloorObject.parent.remove(previewFloorObject);
        }       
        
        previewFloorObject = null;
        menu.remove();
        removeCloseHandler();
        window.requestRender();
    };

    // ==> ИЗМЕНЕНИЕ: Передаем функцию удаления в обработчик кнопки <==
    menu.querySelector('#floorMaterialButton').onclick = () => {
        openFloorMaterialPicker((selectedMaterialId) => {
            menu.dataset.selectedMaterialId = selectedMaterialId;
        }, removeCloseHandler); // Передаем функцию удаления
    };

    // ==> НОВЫЙ ОБРАБОТЧИК КНОПКИ "УДАЛИТЬ" <==
    const deleteButton = menu.querySelector('#floorDeleteButton');
    if (deleteButton) {
        deleteButton.onclick = () => {
            if (window.floorObject && window.floorObject.parent) {
                window.floorObject.parent.remove(window.floorObject);
                // TODO: очистка геометрии/материала
            }
            window.setFloorObject(null);
            
            // Удаляем и объект превью на всякий случай
            if (previewFloorObject && previewFloorObject.parent) {
                previewFloorObject.parent.remove(previewFloorObject);
            }

            menu.remove();
            window.requestRender();
        };
    }
    
    updatePreview();
}

export function openFloorMaterialPicker(onMaterialSelectCallback, onOpenCallback) {
    if (!window.floorMaterialsData || window.floorMaterialsData.length === 0) {
        alert("Материалы для пола не загружены!");
        return;
    }

    if (onOpenCallback) {
        onOpenCallback(); // Это удалит слушатель `closeMenuHandler` из родительского меню
    }

    let modal = document.getElementById('floorMaterialPickerModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'floorMaterialPickerModal';
        modal.className = 'decor-picker-modal';
        document.body.appendChild(modal);
    }
    
    // Генерация HTML (аналогично другим пикерам)
   let modalContentHTML = `<div class="decor-picker-content">
        <div class="decor-picker-header"><span>Выбор материала</span><span class="decor-picker-close">×</span></div>
        <div class="decor-picker-body"><div class="decor-grid">`;

    window.floorMaterialsData.forEach(decor => {
        modalContentHTML += `
            <div class="decor-grid-item" data-id="${decor.id}" title="${decor.name}">
                <img src="${decor.preview}" alt="${decor.name}">
                <span>${decor.name}</span>
            </div>`;
    });
    modalContentHTML += `</div></div></div>`;
    modal.innerHTML = modalContentHTML;
    
    // Обработчики
    modal.querySelector('.decor-picker-close').onclick = () => modal.style.display = 'none';
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };

    modal.querySelectorAll('.decor-grid-item').forEach(item => {
        item.onclick = () => {
            const selectedMaterialId = item.dataset.id;
            // Вызываем callback и передаем ему ID
            if (onMaterialSelectCallback) {
                onMaterialSelectCallback(selectedMaterialId);
            }
            modal.style.display = 'none';
        };
    });

    modal.style.display = 'block';
}