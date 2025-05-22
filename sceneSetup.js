import * as THREE from 'three'; 
import { RGBELoader } from './js/loaders/RGBELoader.js'; // Путь может отличаться

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, window.innerWidth * 0.7 / window.innerHeight, 0.1, 1000);
camera.position.z = 10;

// --- Ортографическая камера ---
// Начальные размеры frustum - будут обновляться при переключении вида и ресайзе
const aspect = window.innerWidth * 0.7 / window.innerHeight;
const frustumSize = 5; // Начальный размер видимой области (подберем позже)
const orthoCamera = new THREE.OrthographicCamera(
    frustumSize * aspect / -2, // left
    frustumSize * aspect / 2,  // right
    frustumSize / 2,           // top
    frustumSize / -2,          // bottom
    0.1,                       // near
    1000                       // far
);
// Начальная позиция и направление для ортографической камеры
orthoCamera.position.z = 10;
orthoCamera.lookAt(scene.position);

// --- Переменная для активной камеры ---
let activeCamera = camera; // Начинаем с перспективной

const renderer = new THREE.WebGLRenderer();

const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight( 0xFFFFFF, 0.9); // Цвет, Интенсивность (попробуй 1.0 - 2.0)
directionalLight.position.set( -2, 8, 5 ); // Позиция (X, Y, Z) - откуда светит
scene.add( directionalLight );

// Настройки теней
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024; // Разрешение карты теней
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
// Настроить область камеры теней по размеру сцены
let shadowCamSize = 10; // Примерный размер области тени
directionalLight.shadow.camera.left = -shadowCamSize;
directionalLight.shadow.camera.right = shadowCamSize;
directionalLight.shadow.camera.top = shadowCamSize;
directionalLight.shadow.camera.bottom = -shadowCamSize;

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4; 

const rgbeLoader = new RGBELoader();
rgbeLoader.setDataType(THREE.HalfFloatType); // Или THREE.FloatType, зависит от HDRI

rgbeLoader.load('./assets/hdri/FreeHDR_1730_Sunset01_ligth.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping; // или ReflectionMapping, если это кубмапа
    //texture.mapping = THREE.EquirectangularRefractionMapping; // для преломлений, если нужно

    scene.environment = texture; // <--- КЛЮЧЕВОЙ МОМЕНТ для PBR материалов
    //scene.background = texture; // <--- Если хотите, чтобы HDRI была и фоном (опционально)
                                // Либо можно оставить scene.background = new THREE.Color(0xRRGGBB);
    
    console.log("HDRI окружение загружено и установлено.");
}, undefined, (error) => {
    console.error("Ошибка загрузки HDRI:", error);
});

export { scene, camera, orthoCamera, renderer, activeCamera, ambientLight, directionalLight };

// Функция для установки активной камеры, если потребуется управлять этим извне модуля
export function setActiveSceneCamera(newCamera) { // Переименовал, чтобы не конфликтовать с другими setActiveCamera
    if (newCamera instanceof THREE.Camera) {
        activeCamera = newCamera;
        console.log("Active camera set in sceneSetup:", activeCamera.type);
    } else {
        console.error("Invalid camera object passed to setActiveSceneCamera");
    }
}

// Функция для инициализации рендерера и добавления его в DOM
// Эту функцию можно будет вызывать из main.js
export function initRenderer(containerId) {
    const canvasContainer = document.getElementById(containerId);
    if (canvasContainer) {
        // Устанавливаем размер рендерера здесь, чтобы он зависел от актуальных размеров контейнера при инициализации
        renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
        canvasContainer.appendChild(renderer.domElement);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    } else {
        console.error(`Container with id "${containerId}" not found for renderer.`);
    }
}