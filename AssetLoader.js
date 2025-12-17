import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const cache = new Map();
const loader = new GLTFLoader();

/**
 * Загружает модель (или берет из кэша).
 * @param {string} url 
 * @returns {Promise<THREE.Group>}
 */
export function loadModel(url) {
    if (cache.has(url)) {
        return Promise.resolve(cache.get(url).clone()); // Возвращаем клон!
    }

    return new Promise((resolve, reject) => {
        loader.load(
            url,
            (gltf) => {
                const model = gltf.scene;
                // Оптимизация: Traverse и включение теней
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = false;
                        child.receiveShadow = false;
                        // Если в модели есть материалы, их можно сохранить или заменить позже
                    }
                });
                
                cache.set(url, model);
                resolve(model.clone());
            },
            undefined,
            (error) => {
                console.error(`Ошибка загрузки модели ${url}:`, error);
                reject(error);
            }
        );
    });
}

/**
 * Предзагрузка всех моделей из JSON фасадов (вызвать при старте)
 */
export async function preloadFacadeModels() {
    const data = window.facadeOptionsData;
    if (!data || !data.mdf_milled) return;

    const promises = [];
    
    // Перебираем все декоры фрезеровки
    data.mdf_milled.decors.forEach(decor => {
        // Если есть LOD структура
        if (decor.lod) {
            Object.values(decor.lod).forEach(lodLevel => {
                if (lodLevel.models) {
                    if (lodLevel.models.corner) promises.push(loadModel(lodLevel.models.corner));
                    if (lodLevel.models.edge) promises.push(loadModel(lodLevel.models.edge));
                }
            });
        } 
        // Если старая структура (просто models)
        else if (decor.models) {
            if (decor.models.corner) promises.push(loadModel(decor.models.corner));
            if (decor.models.edge) promises.push(loadModel(decor.models.edge));
        }
    });

    try {
        await Promise.all(promises);
        console.log("Модели фасадов предзагружены.");
    } catch (e) {
        console.warn("Не все модели фасадов удалось загрузить:", e);
    }
}