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
    
    const candidates = allCabinets.filter(cab => 
        cab.wallId === adjacentWallId &&
        cab.type === 'lowerCabinet' &&
        cab.id_data !== cornerCabinet.id_data
    );

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => a.offsetAlongWall - b.offsetAlongWall);
    
    return candidates[0];
}