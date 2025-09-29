import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
// --- ИЗМЕНЕНИЕ: Импортируем OrbitControls ---
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, window.innerWidth * 0.7 / window.innerHeight, 0.1, 1000);
camera.position.z = 15;
camera.position.y = 2.5; // Немного приподнимем камеру для лучшего обзора

const aspect = window.innerWidth * 0.7 / window.innerHeight;
const frustumSize = 5;
const orthoCamera = new THREE.OrthographicCamera(
    frustumSize * aspect / -2, frustumSize * aspect / 2,
    frustumSize / 2, frustumSize / -2,
    0.1, 1000
);
orthoCamera.position.z = 10;
orthoCamera.lookAt(scene.position);

let activeCamera = camera;

const renderer = new THREE.WebGLRenderer({ antialias: true }); // Добавил antialias для сглаживания

// --- ИЗМЕНЕНИЕ: Создаем, но пока не настраиваем OrbitControls ---
// Инициализация будет в главном файле после создания рендерера
const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false; // Выключим их по умолчанию, включим после инициализации

const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xFFFFFF, 0.9);
directionalLight.position.set(-2, 8, 5);
scene.add(directionalLight);

directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
let shadowCamSize = 10;
directionalLight.shadow.camera.left = -shadowCamSize;
directionalLight.shadow.camera.right = shadowCamSize;
directionalLight.shadow.camera.top = shadowCamSize;
directionalLight.shadow.camera.bottom = -shadowCamSize;

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;

const rgbeLoader = new RGBELoader();
rgbeLoader.setDataType(THREE.HalfFloatType);

rgbeLoader.load('./assets/hdri/FreeHDR_1730_Sunset01_ligth.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
    console.log("HDRI окружение загружено и установлено.");
}, undefined, (error) => {
    console.error("Ошибка загрузки HDRI:", error);
});

// --- ИЗМЕНЕНИЕ: Экспортируем 'controls' ---
export { scene, camera, orthoCamera, renderer, activeCamera, ambientLight, directionalLight, controls };

export function setActiveSceneCamera(newCamera) {
    if (newCamera instanceof THREE.Camera) {
        activeCamera = newCamera;
        // --- ИЗМЕНЕНИЕ: При смене камеры, нужно обновить и controls ---
        controls.object = newCamera;
        controls.update();
        console.log("Active camera set in sceneSetup:", activeCamera.type);
    } else {
        console.error("Invalid camera object passed to setActiveSceneCamera");
    }
}

export function initRenderer(containerId) {
    const canvasContainer = document.getElementById(containerId);
    if (canvasContainer) {
        renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
        canvasContainer.appendChild(renderer.domElement);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // --- ИЗМЕНЕНИЕ: Добавляем явные настройки зума ---
        controls.enabled = true;
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.target.set(0, 0, 0);

        // Настройки зума
        controls.enableZoom = true; // Убедимся, что зум включен (это значение по умолчанию, но для надежности)
        controls.zoomSpeed = 1.0;   // Скорость зума, можно подстроить
        
        // Ограничения (очень полезно!)
        controls.minDistance = 0.5; // Минимальное расстояние до цели (как близко можно приблизиться)
        controls.maxDistance = 50;  // Максимальное расстояние (как далеко можно отдалиться)
        
        // Ограничение вращения по вертикали (чтобы не уйти "под пол")
        controls.maxPolarAngle = Math.PI / 2 + 0.5; // Чуть меньше 90 градусов
        
        controls.update(); // Применяем все настройки

    } else {
        console.error(`Container with id "${containerId}" not found for renderer.`);
    }
}