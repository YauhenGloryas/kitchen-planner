// import * as THREE from 'three';
import { roomDimensions } from './roomManager.js';

/**
 * Определяет ID смежной стены на основе текущей стены и направления.
 * @param {string} currentWallId 
 * @param {'left' | 'right'} direction 
 * @returns {string | null}
 */
export function getAdjacentWallId(currentWallId, direction) {
    if (currentWallId === 'Back') {
        return direction === 'left' ? 'Left' : 'Right';
    }
    // ==> ВАШ ОСОБЫЙ СЛУЧАЙ <==
    if (currentWallId === 'Left') {
        // Для левой стены "левый" угол - с Front, "правый" - с Back
        return direction === 'left' ? 'Back' : 'Front'; 
    }
    if (currentWallId === 'Right') {
        return direction === 'left' ? 'Back' : 'Front';
    }
    return null;
}

/**
 * Определяет, к какому углу (левому или правому) ближе всего находится шкаф.
 * @param {object} cabinet - Объект шкафа.
 * @returns {'left' | 'right'}
 */
export function findNearestCornerDirection(cabinet) {
    const wallLength = (cabinet.wallId === 'Back' || cabinet.wallId === 'Front') 
        ? roomDimensions.getLength() 
        : roomDimensions.getHeight();
    
    if (cabinet.offsetAlongWall + cabinet.width / 2 < wallLength / 2) {
        return 'left';
    } else {
        return 'right';
    }
}

/**
 * Находит ближайший соседний шкаф на смежной стене.
 * @param {object} cornerCabinet - Объект углового шкафа.
 * @returns {object | null}
 */
export function findNearestNeighbor(cornerCabinet) {
    const adjacentWallId = getAdjacentWallId(cornerCabinet.wallId, cornerCabinet.cornerDirection);
    if (!adjacentWallId) return null;

    const allCabinets = window.objectManager.getAllCabinets();
    
    let neighborCabinetType;
    if (cornerCabinet.type === 'lowerCabinet') {
        neighborCabinetType = 'straight'; 
    } else if (cornerCabinet.type === 'upperCabinet') {
        neighborCabinetType = 'straightUpper'; 
    } else {
        return null; 
    }

    const candidates = allCabinets.filter(cab => 
        cab.wallId === adjacentWallId &&
        cab.cabinetType === neighborCabinetType && 
        cab.id_data !== cornerCabinet.id_data
    );

    if (candidates.length === 0) return null;

    // === ИСПРАВЛЕННАЯ СОРТИРОВКА ПО ДИСТАНЦИИ ===
    
    // Получаем позицию углового шкафа (если меш еще не создан, используем calculatedPosition)
    const targetPos = cornerCabinet.mesh ? cornerCabinet.mesh.position : cornerCabinet.calculatedPosition;
    
    if (!targetPos) {
        // Если позиция неизвестна, используем старую логику как фалбек
        candidates.sort((a, b) => a.offsetAlongWall - b.offsetAlongWall);
        return candidates[0];
    }

    // Сортируем кандидатов по 3D расстоянию до углового шкафа
    candidates.sort((a, b) => {
        const posA = a.mesh ? a.mesh.position : a.calculatedPosition;
        const posB = b.mesh ? b.mesh.position : b.calculatedPosition;
        
        if (!posA || !posB) return 0; // Защита
        
        const distA = targetPos.distanceTo(posA);
        const distB = targetPos.distanceTo(posB);
        
        return distA - distB;
    });
    
    return candidates[0];
}

/**
 * Рассчитывает "боковую длину" (pivot) для углового шкафа, основываясь на соседе.
 * @param {object} cornerCabinet - Объект углового шкафа.
 * @param {object | null} neighbor - Найденный соседний шкаф.
 * @param {object} MaterialManager - Менеджер материалов. // <-- НОВЫЙ ПАРАМЕТР
 * @returns {number} Расстояние в метрах.
 */
export function calculateCornerPivotPosition(cornerCabinet, neighbor, MaterialManager) {
    if (cornerCabinet.type === 'lowerCabinet') {
        // --- Логика для НИЖНЕГО шкафа ---
        if (neighbor) {
            const countertopDepth = window.getCountertopDepthForWall(neighbor.wallId);
            return countertopDepth - (neighbor.overhang ?? 0.018);
        } else {
            const adjacentWallId = getAdjacentWallId(cornerCabinet.wallId, cornerCabinet.cornerDirection);
            // Если соседа нет, берем стандартную глубину столешницы
            return (window.getCountertopDepthForWall(adjacentWallId) || 0.6) - (cornerCabinet.overhang ?? 0.018);
        }
    } else if (cornerCabinet.type === 'upperCabinet') {
        // --- НОВАЯ, ПРАВИЛЬНАЯ ЛОГИКА ДЛЯ ВЕРХНЕГО шкафа ---
        if (neighbor) {         
            const neighborOffset = neighbor.offsetFromParentWall || (20 / 1000);
            const neighborDepth = neighbor.depth;
            let neighborFacadeThickness = 18 / 1000; // Дефолт

            // Проверяем, есть ли у соседа ВООБЩЕ фасад
            if (neighbor.cabinetConfig !== 'openUpper') {
                // Если это не открытые полки, то фасад есть.
                
                if (neighbor.facadeSet) {
                    // Если набор фасадов ВЫБРАН, берем его точную толщину
                    const facadeSet = window.facadeSetsData.find(set => set.id === neighbor.facadeSet);
                    if (facadeSet) {
                        const { thickness } = MaterialManager.getMaterial(facadeSet); 
                        neighborFacadeThickness = thickness;
                    } else {
                        // На всякий случай, если facadeSet указан, но не найден
                        neighborFacadeThickness = 18 / 1000;
                    }
                } else {
                    // Если набор фасадов НЕ ВЫБРАН, используем толщину по умолчанию
                    neighborFacadeThickness = 18 / 1000;
                }
            } else {
                console.log("neighbor.frameFacade = " + neighbor.frameFacade);
                neighborFacadeThickness = 100/1000;
                if (neighbor.frameFacade && neighbor.frameFacade !== 'none'){
                    neighborFacadeThickness = 20 / 1000;
                } else {
                    neighborFacadeThickness = 0;
                }
            }
            
            return neighborOffset + neighborDepth + neighborFacadeThickness;

        } else {
            // Если соседа нет, используем значения по умолчанию
            const defaultOffset = 20 / 1000;
            const defaultDepth = 300 / 1000;
            const defaultFacadeThickness = 18 / 1000;
            return defaultOffset + defaultDepth + defaultFacadeThickness;
        }
    }
    
    // Дефолт на всякий случай
    return 0.6; 
}