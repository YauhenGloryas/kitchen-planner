// ---- Render scheduler ----
export let renderRequested = false;
export let continuousRendering = false;

export function requestRender() {
  if (!renderRequested) {
    renderRequested = true;
    requestAnimationFrame(renderFrame);
  }
}

export function setContinuousRendering(on) {
  if (on && !continuousRendering) {
    continuousRendering = true;
    requestRender();
  } else {
    continuousRendering = false;
  }
}

function shouldContinue() {
  return continuousRendering
    || (typeof isRotating !== 'undefined' && isRotating)
    || (typeof draggedCabinet !== 'undefined' && !!draggedCabinet)
    || (typeof isPanning !== 'undefined' && isPanning);
}

export function renderFrame(scene, activeCamera, renderer) {
  renderRequested = false;

  if (!scene || !activeCamera) return;

  if (cube) cube.updateMatrixWorld(true);
  else scene.updateMatrixWorld(true);

  if (typeof composer !== 'undefined' && composer) {
    composer.render();
  } else {
    renderer.render(scene, activeCamera);
  }

  // --- Обновление UI/оверлеев ---
  const isRotatingNow = typeof isRotating !== 'undefined' && isRotating;
  const isDraggingNow = typeof draggedCabinet !== 'undefined' && !!draggedCabinet;

  const rotationChanged = cube ? (cube.rotation.y !== lastRotationY) : false;
  let positionChanged = false;

  if (selectedCabinets && selectedCabinets.length === 1) {
    const selectedObject = selectedCabinets[0];
    if (selectedObject) {
      if (selectedObject.type === 'freestandingCabinet') {
        positionChanged = lastOffsetX !== selectedObject.offsetX || lastOffsetZ !== selectedObject.offsetZ;
      } else if (selectedObject.type && selectedObject.type !== 'countertop') {
        positionChanged = lastOffsetAlongWall !== selectedObject.offsetAlongWall;
      }
    }
  }

  if (isDraggingNow && draggedCabinet) {
    // updateDimensionsInputPosition(draggedCabinet, cabinets);
  } else if (selectedCabinets && selectedCabinets.length === 1) {
    const selectedObject = selectedCabinets[0];
    if (selectedObject && (rotationChanged || positionChanged)) {
      const isCountertop = selectedObject.userData?.type === 'countertop';
      if (isCountertop) {
        const wallId = selectedObject.userData.wallId;
        if (wallId === 'Bottom') {
          const roomL = currentLength; const roomD = currentHeight;
          const ctRotY = selectedObject.rotation.y;
          const axisIsX = (Math.abs(ctRotY) < 0.1 || Math.abs(Math.abs(ctRotY) - Math.PI) < 0.1);
          const lb = axisIsX ? -roomL/2 : -roomD/2;
          const rb = axisIsX ?  roomL/2 :  roomD/2;
          updateFreestandingCountertopDimensionsPosition(selectedObject, lb, rb);
        } else if (['Back', 'Front', 'Left', 'Right'].includes(wallId)) {
          const {leftBoundary, rightBoundary} = findNearestObstacles(selectedObject, cabinets, countertops);
          updateWallCountertopDimensionsPosition(selectedObject, leftBoundary, rightBoundary);
        }
      } else {
        if (selectedObject.type === 'freestandingCabinet') {
          showFreestandingCabinetDimensions(selectedObject, cabinets);
        } else if (['lowerCabinet', 'upperCabinet'].includes(selectedObject.type)) {
          showCabinetDimensionsInput(selectedObject, cabinets);
        }
        updateDimensionsInputPosition(selectedObject, cabinets);
      }
    }
  }

  if (cube) lastRotationY = cube.rotation.y;
  if (selectedCabinets && selectedCabinets.length === 1) {
    const selectedObject = selectedCabinets[0];
    if (selectedObject) {
      if (selectedObject.type === 'freestandingCabinet') {
        lastOffsetX = selectedObject.offsetX;
        lastOffsetZ = selectedObject.offsetZ;
      } else if (selectedObject.type && selectedObject.type !== 'countertop') {
        lastOffsetAlongWall = selectedObject.offsetAlongWall;
      }
    }
  } else {
    lastOffsetAlongWall = null;
    lastOffsetX = null;
    lastOffsetZ = null;
  }

  if (shouldContinue()) {
    requestRender();
  }
}