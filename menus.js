// menus.js
export function createCabinetConfigMenu(cabinetIndex, cabinets) {
    const cabinet = cabinets[cabinetIndex];
    
    let colorValue = cabinet.initialColor;
    if (typeof colorValue === 'number') {
        colorValue = `#${colorValue.toString(16).padStart(6, '0')}`;
    } else if (!colorValue.startsWith('#')) {
        colorValue = '#d2b48c';
    }

    let html = `
        <h3>Настройки шкафа</h3>
        <div class="menu-content scrollable">
            <label>Цвет фасада: <input type="color" id="cabinetFacadeColor" value="${colorValue}"></label>
            <div id="specificConfigFields"></div>
            <div class="menu-buttons">
                <button onclick="applyCabinetConfigChanges(${cabinetIndex})">Применить</button>
                <button onclick="hideCabinetConfigMenu()">Отмена</button>
            </div>
        </div>
    `;

    return html;
}


export function updateSpecificConfigFields(cabinetIndex, cabinets, kitchenGlobalParams) {
    const cabinet = cabinets[cabinetIndex];
    const cabinetType = document.getElementById('cabinetType').value;
    const cabinetConfig = document.getElementById('cabinetConfig').value;
    const specificFields = document.getElementById('specificConfigFields');

    // Определяем, можно ли редактировать высоту
    const isHeightEditable = cabinet.type === 'upperCabinet' || (cabinetType === 'straight' && ['tallStorage', 'tallOvenMicro', 'fridge', 'highDivider'].includes(cabinetConfig));
    const heightDisabledAttr = isHeightEditable ? '' : ' disabled';

    // Устанавливаем значение высоты по умолчанию
    let defaultHeight = cabinet.height * 1000; // Текущее значение шкафа в мм

    // Если высота ещё не независима, устанавливаем значения из kitchenGlobalParams
    if (!cabinet.isHeightIndependent) {
        if (cabinet.type === 'upperCabinet') {
            const totalHeight = kitchenGlobalParams.totalHeight / 1000; // в метрах
            const countertopHeight = kitchenGlobalParams.countertopHeight / 1000;
            const apronHeight = kitchenGlobalParams.apronHeight / 1000;
            defaultHeight = Math.round((totalHeight - countertopHeight - apronHeight) * 1000);
            cabinet.height = defaultHeight / 1000; // Обновляем значение в метрах
        } else if (cabinet.type === 'lowerCabinet' || cabinet.type === 'freestandingCabinet') {
            const countertopHeight = kitchenGlobalParams.countertopHeight / 1000;
            const countertopThickness = kitchenGlobalParams.countertopThickness / 1000;
            const plinthHeight = kitchenGlobalParams.plinthHeight / 1000;
            defaultHeight = Math.round((countertopHeight - countertopThickness - plinthHeight) * 1000);
            cabinet.height = defaultHeight / 1000;
        }
    }

    // Для высоких шкафов с редактируемой высотой устанавливаем totalHeight - plinthHeight, если высота ещё не задана
    if (isHeightEditable && (cabinetType === 'straight' && ['tallStorage', 'tallOvenMicro', 'fridge', 'highDivider'].includes(cabinetConfig))) {
        if (!cabinet.isHeightIndependent || !cabinet.height || cabinet.height === 0) {
            const totalHeight = kitchenGlobalParams.totalHeight / 1000;
            const plinthHeight = kitchenGlobalParams.plinthHeight / 1000;
            defaultHeight = Math.round((totalHeight - plinthHeight) * 1000);
            cabinet.height = defaultHeight / 1000;
        }
    }


    let fieldsHtml = `
        <label>Высота шкафа, мм: <input type="number" id="cabinetHeight" value="${defaultHeight}" min="100"${heightDisabledAttr}></label>
    `;

    // Поля для верхнего шкафа
    if (cabinet.type === 'upperCabinet') {
        fieldsHtml += `
            <label>Ширина, мм: <input type="number" id="cabinetWidth" value="${Math.round(cabinet.width * 1000)}" min="100"></label>
            <label>Глубина, мм: <input type="number" id="cabinetDepth" value="${Math.round(cabinet.depth * 1000)}" min="100"></label>
            <label>Отступ от пола, мм: <input type="number" id="cabinetOffsetBottom" value="${Math.round(cabinet.offsetBottom * 1000)}" min="0"></label>
            <label>Зазор между фасадами, мм: <input type="number" id="facadeGap" value="${Math.round(cabinet.facadeGap * 1000)}" min="0"></label>
        `;
    } 
    // Поля для остальных типов шкафов
    else if (cabinetType === 'corner') {
        if (cabinetConfig === 'sink') {
            fieldsHtml += `
                <label>Диаметр мойки, мм: <input type="number" id="sinkDiameter" value="${Math.round((cabinet.sinkDiameter || 0.45) * 1000)}" min="100"></label>
                <label>Тип мойки:
                    <select id="sinkType">
                        <option value="round" ${cabinet.sinkType === 'round' ? 'selected' : ''}>Круглая</option>
                        <option value="square" ${cabinet.sinkType === 'square' ? 'selected' : ''}>Квадратная</option>
                    </select>
                </label>
            `;
        } else if (cabinetConfig === 'cornerStorage') {
            fieldsHtml += `
                <label>Количество полок: <input type="number" id="shelfCount" value="${cabinet.shelfCount || 2}" min="0"></label>
            `;
        }
    } else if (cabinetType === 'straight') {
        switch (cabinetConfig) {
            case 'swing':
                fieldsHtml += `
                    <label>Дверь:
                        <select id="doorType">
                            <option value="none" ${cabinet.doorType === 'none' ? 'selected' : ''}>Без двери</option>
                            <option value="left" ${cabinet.doorType === 'left' ? 'selected' : ''}>Левая</option>
                            <option value="right" ${cabinet.doorType === 'right' ? 'selected' : ''}>Правая</option>
                            <option value="double" ${cabinet.doorType === 'double' ? 'selected' : ''}>Двойная</option>
                        </select>
                    </label>
                    <label>Полка:
                        <select id="shelfType">
                            <option value="none" ${cabinet.shelfType === 'none' ? 'selected' : ''}>Без полок</option>
                            <option value="confirmat" ${cabinet.shelfType === 'confirmat' ? 'selected' : ''}>Конфирмат</option>
                            <option value="shelfHolder" ${cabinet.shelfType === 'shelfHolder' ? 'selected' : ''}>Полкодержатель</option>
                            <option value="secura_7" ${cabinet.shelfType === 'secura_7' ? 'selected' : ''}>Secura _7</option>
                        </select>
                    </label>
                    <label>Количество полок, шт: <input type="number" id="shelfCount" value="${cabinet.shelfCount || 0}" min="0"></label>
                    <label>Задняя царга:
                        <select id="rearStretcher">
                            <option value="horizontal" ${cabinet.rearStretcher === 'horizontal' ? 'selected' : ''}>Горизонтальная</option>
                            <option value="vertical" ${cabinet.rearStretcher === 'vertical' ? 'selected' : ''}>Вертикальная</option>
                            <option value="none" ${cabinet.rearStretcher === 'none' ? 'selected' : ''}>Нет</option>
                        </select>
                    </label>
                    <label>Передняя царга:
                        <select id="frontStretcher">
                            <option value="horizontal" ${cabinet.frontStretcher === 'horizontal' ? 'selected' : ''}>Горизонтальная</option>
                            <option value="vertical" ${cabinet.frontStretcher === 'vertical' ? 'selected' : ''}>Вертикальная</option>
                            <option value="none" ${cabinet.frontStretcher === 'none' ? 'selected' : ''}>Нет</option>
                        </select>
                    </label>
                    <label>Опуск царг от верха, мм: <input type="number" id="stretcherDrop" value="${Math.round((cabinet.stretcherDrop || 0) * 1000)}" min="0"></label>
                    <label>Задняя панель:
                        <select id="rearPanel">
                            <option value="yes" ${cabinet.rearPanel === 'yes' ? 'selected' : ''}>Да</option>
                            <option value="no" ${cabinet.rearPanel === 'no' ? 'selected' : ''}>Нет</option>
                            <option value="halfTop" ${cabinet.rearPanel === 'halfTop' ? 'selected' : ''}>До половины сверху</option>
                        </select>
                    </label>
                    <label>Фальш-панели:
                        <select id="falsePanels">
                            <option value="leftFlat" ${cabinet.falsePanels === 'leftFlat' ? 'selected' : ''}>Левая плоская</option>
                            <option value="leftWide" ${cabinet.falsePanels === 'leftWide' ? 'selected' : ''}>Левая широкая</option>
                            <option value="rightFlat" ${cabinet.falsePanels === 'rightFlat' ? 'selected' : ''}>Правая плоская</option>
                            <option value="rightWide" ${cabinet.falsePanels === 'rightWide' ? 'selected' : ''}>Правая широкая</option>
                            <option value="none" ${cabinet.falsePanels === 'none' ? 'selected' : ''}>Нет</option>
                        </select>
                    </label>
                    <label>Фасады:
                        <select id="facadeSet">
                            <option value="set1" ${cabinet.facadeSet === 'set1' ? 'selected' : ''}>Набор 1</option>
                            <option value="set2" ${cabinet.facadeSet === 'set2' ? 'selected' : ''}>Набор 2</option>
                            <option value="set3" ${cabinet.facadeSet === 'set3' ? 'selected' : ''}>Набор 3</option>
                        </select>
                    </label>
                `;
                break;
            case 'drawers':
                fieldsHtml += `
                    <label>Количество фасадов:
                        <select id="facadeCount">
                            <option value="1" ${cabinet.facadeCount === '1' ? 'selected' : ''}>1</option>
                            <option value="2" ${cabinet.facadeCount === '2' ? 'selected' : ''}>2</option>
                            <option value="3" ${cabinet.facadeCount === '3' ? 'selected' : ''}>3</option>
                            <option value="4" ${cabinet.facadeCount === '4' ? 'selected' : ''}>4</option>
                        </select>
                    </label>
                    <label>Набор ящиков:
                        <select id="drawerSet">
                            <option value="D" ${cabinet.drawerSet === 'D' ? 'selected' : ''}>D</option>
                            <option value="D+D" ${cabinet.drawerSet === 'D+D' ? 'selected' : ''}>D+D</option>
                            <option value="D+C+M" ${cabinet.drawerSet === 'D+C+M' ? 'selected' : ''}>D+C+M</option>
                            <option value="D+M+M" ${cabinet.drawerSet === 'D+M+M' ? 'selected' : ''}>D+M+M</option>
                            <option value="D+M" ${cabinet.drawerSet === 'D+M' ? 'selected' : ''}>D+M</option>
                            <option value="D+C" ${cabinet.drawerSet === 'D+C' ? 'selected' : ''}>D+C</option>
                            <option value="C+C+M" ${cabinet.drawerSet === 'C+C+M' ? 'selected' : ''}>C+C+M</option>
                            <option value="M+M+M+M" ${cabinet.drawerSet === 'M+M+M+M' ? 'selected' : ''}>M+M+M+M</option>
                            <option value="cargoBlum" ${cabinet.drawerSet === 'cargoBlum' ? 'selected' : ''}>Карго BLUM</option>
                            <option value="cargoMesh" ${cabinet.drawerSet === 'cargoMesh' ? 'selected' : ''}>Карго сетчатое</option>
                        </select>
                    </label>
                    <label>Задняя царга:
                        <select id="rearStretcher">
                            <option value="horizontal" ${cabinet.rearStretcher === 'horizontal' ? 'selected' : ''}>Горизонтальная</option>
                            <option value="vertical" ${cabinet.rearStretcher === 'vertical' ? 'selected' : ''}>Вертикальная</option>
                            <option value="none" ${cabinet.rearStretcher === 'none' ? 'selected' : ''}>Нет</option>
                        </select>
                    </label>
                    <label>Передняя царга:
                        <select id="frontStretcher">
                            <option value="horizontal" ${cabinet.frontStretcher === 'horizontal' ? 'selected' : ''}>Горизонтальная</option>
                            <option value="vertical" ${cabinet.frontStretcher === 'vertical' ? 'selected' : ''}>Вертикальная</option>
                            <option value="none" ${cabinet.frontStretcher === 'none' ? 'selected' : ''}>Нет</option>
                        </select>
                    </label>
                    <label>Опуск царг от верха, мм: <input type="number" id="stretcherDrop" value="${Math.round((cabinet.stretcherDrop || 0) * 1000)}" min="0"></label>
                    <label>Задняя панель:
                        <select id="rearPanel">
                            <option value="yes" ${cabinet.rearPanel === 'yes' ? 'selected' : ''}>Да</option>
                            <option value="no" ${cabinet.rearPanel === 'no' ? 'selected' : ''}>Нет</option>
                            <option value="halfTop" ${cabinet.rearPanel === 'halfTop' ? 'selected' : ''}>До половины сверху</option>
                        </select>
                    </label>
                    <label>Фальш-панели:
                        <select id="falsePanels">
                            <option value="leftFlat" ${cabinet.falsePanels === 'leftFlat' ? 'selected' : ''}>Левая плоская</option>
                            <option value="leftWide" ${cabinet.falsePanels === 'leftWide' ? 'selected' : ''}>Левая широкая</option>
                            <option value="rightFlat" ${cabinet.falsePanels === 'rightFlat' ? 'selected' : ''}>Правая плоская</option>
                            <option value="rightWide" ${cabinet.falsePanels === 'rightWide' ? 'selected' : ''}>Правая широкая</option>
                            <option value="none" ${cabinet.falsePanels === 'none' ? 'selected' : ''}>Нет</option>
                        </select>
                    </label>
                    <label>Фасады:
                        <select id="facadeSet">
                            <option value="set1" ${cabinet.facadeSet === 'set1' ? 'selected' : ''}>Набор 1</option>
                            <option value="set2" ${cabinet.facadeSet === 'set2' ? 'selected' : ''}>Набор 2</option>
                            <option value="set3" ${cabinet.facadeSet === 'set3' ? 'selected' : ''}>Набор 3</option>
                        </select>
                    </label>
                `;
                break;
            case 'oven':
                fieldsHtml += `
                    <label>Высота духовки:
                        <select id="ovenHeight">
                            <option value="600" ${cabinet.ovenHeight === '600' ? 'selected' : ''}>600 мм</option>
                            <option value="450" ${cabinet.ovenHeight === '450' ? 'selected' : ''}>450 мм</option>
                        </select>
                    </label>
                    <label>Расположение духовки:
                        <select id="ovenPosition">
                            <option value="top" ${cabinet.ovenPosition === 'top' ? 'selected' : ''}>Верхнее</option>
                            <option value="bottom" ${cabinet.ovenPosition === 'bottom' ? 'selected' : ''}>Нижнее</option>
                        </select>
                    </label>
                    <label>Доп. отступ от столешницы, мм: <input type="number" id="extraOffset" value="${Math.round((cabinet.extraOffset || 0) * 1000)}" min="0"></label>
                `;
                break;
            case 'tallStorage':
                fieldsHtml += `
                    <label>Количество полок: <input type="number" id="shelfCount" value="${cabinet.shelfCount || 4}" min="0"></label>
                `;
                break;
            case 'tallOvenMicro':
                fieldsHtml += `
                    <label>Тип духовки:
                        <select id="ovenType">
                            <option value="600" ${cabinet.ovenType === '600' ? 'selected' : ''}>600 мм</option>
                            <option value="450" ${cabinet.ovenType === '450' ? 'selected' : ''}>450 мм</option>
                            <option value="none" ${cabinet.ovenType === 'none' ? 'selected' : ''}>Нет</option>
                        </select>
                    </label>
                    <label>Уровень размещения духовки:
                        <select id="ovenLevel">
                            <option value="drawer" ${cabinet.ovenLevel === 'drawer' ? 'selected' : ''}>Уровень первого выдвижного ящика</option>
                            <option value="countertop" ${cabinet.ovenLevel === 'countertop' ? 'selected' : ''}>Уровень столешницы</option>
                        </select>
                    </label>
                    <label>Тип СВЧ:
                        <select id="microwaveType">
                            <option value="362" ${cabinet.microwaveType === '362' ? 'selected' : ''}>Встроенная 362 мм</option>
                            <option value="380" ${cabinet.microwaveType === '380' ? 'selected' : ''}>Встроенная 380 мм</option>
                            <option value="none" ${cabinet.microwaveType === 'none' ? 'selected' : ''}>Нет</option>
                        </select>
                    </label>
                    <label>Заполнение пространства под духовкой:
                        <select id="underOvenFill">
                            <option value="drawers" ${cabinet.underOvenFill === 'drawers' ? 'selected' : ''}>Выдвижные ящики</option>
                            <option value="swing" ${cabinet.underOvenFill === 'swing' ? 'selected' : ''}>Распашная дверь</option>
                        </select>
                    </label>
                    <label>Полки в верхней части шкафа:
                        <select id="topShelves">
                            <option value="none" ${cabinet.topShelves === 'none' ? 'selected' : ''}>Нет</option>
                            <option value="1" ${cabinet.topShelves === '1' ? 'selected' : ''}>1</option>
                            <option value="2" ${cabinet.topShelves === '2' ? 'selected' : ''}>2</option>
                            <option value="3" ${cabinet.topShelves === '3' ? 'selected' : ''}>3</option>
                        </select>
                    </label>
                    <label>Фасады:
                        <select id="facadeSet">
                            <option value="set1" ${cabinet.facadeSet === 'set1' ? 'selected' : ''}>Набор 1</option>
                            <option value="set2" ${cabinet.facadeSet === 'set2' ? 'selected' : ''}>Набор 2</option>
                            <option value="set3" ${cabinet.facadeSet === 'set3' ? 'selected' : ''}>Набор 3</option>
                        </select>
                    </label>
                `;
                break;
            case 'fridge':
                fieldsHtml += `
                    <label>Тип холодильника:
                        <select id="fridgeType">
                            <option value="single" ${cabinet.fridgeType === 'single' ? 'selected' : ''}>Однокамерный</option>
                            <option value="double" ${cabinet.fridgeType === 'double' ? 'selected' : ''}>Двухкамерный</option>
                        </select>
                    </label>
                    <label>Количество полок над холодильником:
                        <select id="shelvesAbove">
                            <option value="none" ${cabinet.shelvesAbove === 'none' ? 'selected' : ''}>Нет</option>
                            <option value="1" ${cabinet.shelvesAbove === '1' ? 'selected' : ''}>1</option>
                            <option value="2" ${cabinet.shelvesAbove === '2' ? 'selected' : ''}>2</option>
                        </select>
                    </label>
                    <label>Видимая сторона:
                        <select id="visibleSide">
                            <option value="left" ${cabinet.visibleSide === 'left' ? 'selected' : ''}>Левая</option>
                            <option value="right" ${cabinet.visibleSide === 'right' ? 'selected' : ''}>Правая</option>
                            <option value="both" ${cabinet.visibleSide === 'both' ? 'selected' : ''}>Обе</option>
                            <option value="none" ${cabinet.visibleSide === 'none' ? 'selected' : ''}>Нет</option>
                        </select>
                    </label>
                    <label>Открывание двери:
                        <select id="doorOpening">
                            <option value="left" ${cabinet.doorOpening === 'left' ? 'selected' : ''}>Левое</option>
                            <option value="right" ${cabinet.doorOpening === 'right' ? 'selected' : ''}>Правое</option>
                        </select>
                    </label>
                    <label>Вертикальный гола профиль:
                        <select id="verticalProfile">
                            <option value="none" ${cabinet.verticalProfile === 'none' ? 'selected' : ''}>Нет</option>
                            <option value="double" ${cabinet.verticalProfile === 'double' ? 'selected' : ''}>Да, двухсторонний</option>
                            <option value="singleWithPanel" ${cabinet.verticalProfile === 'singleWithPanel' ? 'selected' : ''}>Да, односторонний с боковой панелью</option>
                        </select>
                    </label>
                    <label>Фасады:
                        <select id="facadeSet">
                            <option value="set1" ${cabinet.facadeSet === 'set1' ? 'selected' : ''}>Набор 1</option>
                            <option value="set2" ${cabinet.facadeSet === 'set2' ? 'selected' : ''}>Набор 2</option>
                            <option value="set3" ${cabinet.facadeSet === 'set3' ? 'selected' : ''}>Набор 3</option>
                        </select>
                    </label>
                `;
                break;
                case 'dishwasher':
                fieldsHtml += `
                    <label>Ширина посудомойки: 
                        <select id="dishwasherWidth">
                            <option value="450" ${cabinet.dishwasherWidth === '450' ? 'selected' : ''}>450</option>
                            <option value="600" ${cabinet.dishwasherWidth === '600' ? 'selected' : ''}>600</option>
                        </select>
                    </label>
                `;
                break;
                case 'highDivider':
                fieldsHtml += ` 
                        <label>Глубина стойки: <input type="number" id="highDividerDepth" value="${cabinet.highDividerDepth || 560}" min="0"></label>
                `;
                break;
        }
    }

    specificFields.innerHTML = fieldsHtml;
}

export function showCabinetConfigMenu(cabinetIndex, x, y, cabinets, kitchenGlobalParams) { // Добавлены параметры x, y
    //console.log('showCabinetConfigMenu called with x:', x, 'y:', y); // Отладочный вывод

    let menu = document.getElementById('cabinetConfigMenu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'cabinetConfigMenu';
        menu.className = 'popup-menu';
        document.body.appendChild(menu);
    }

    menu.innerHTML = createCabinetConfigMenu(cabinetIndex, cabinets);

    // Устанавливаем начальную позицию в точке клика
    menu.style.left = `${x + 30}px`; // Смещение вправо, как в showCabinetMenu
    menu.style.top = `${y - 10}px`;  // Смещение вверх, как в showCabinetMenu
    menu.style.display = 'block';

    const inputs = menu.querySelectorAll('input[type="number"]');
    inputs.forEach(input => {
        input.addEventListener('focus', () => input.select());
    });

    const cabinetMenu = document.getElementById('cabinetMenu');
    if (cabinetMenu) {
        cabinetMenu.style.display = 'none';
    }

    // Удаляем старый обработчик keydown, если он был
    menu.removeEventListener('keydown', menu.onkeydown);
    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            applyCabinetConfigChanges(cabinetIndex);
        }
    };
    menu.addEventListener('keydown', handleKeyDown);
    menu.onkeydown = handleKeyDown;

    // Обновляем специфичные поля при изменении типа или конфигурации
    const typeSelect = document.getElementById('cabinetType');
    const configSelect = document.getElementById('cabinetConfig');
    const updateFields = () => updateSpecificConfigFields(cabinetIndex, cabinets, kitchenGlobalParams);
    typeSelect.addEventListener('change', updateFields);
    configSelect.addEventListener('change', updateFields);

    // Изначально заполняем поля
    updateSpecificConfigFields(cabinetIndex, cabinets, kitchenGlobalParams);

    // Корректируем позицию, чтобы не выходить за пределы окна
    setTimeout(() => {
        const menuWidth = menu.offsetWidth;
        const menuHeight = menu.offsetHeight;
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        let left = x + 30;
        let top = y - 10;

        if (left + menuWidth > screenWidth) left = screenWidth - menuWidth - 5;
        if (left < 0) left = 5;
        if (top + menuHeight > screenHeight) top = screenHeight - menuHeight - 5;
        if (top < 0) top = 5;

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
    }, 0);
}

export function hideCabinetConfigMenu() {
    const menu = document.getElementById('cabinetConfigMenu');
    if (menu) {
        menu.style.display = 'none';
        const cabinetMenu = document.getElementById('cabinetMenu');
        if (cabinetMenu) {
            cabinetMenu.style.display = 'block';
        }
    }
}