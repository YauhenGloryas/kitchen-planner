# 3D Kitchen Configurator

This project is a web-based 3D kitchen configurator that allows users to visualize and customize kitchen designs in real-time.

## Features

- Real-time 3D visualization of kitchen environments.
- Selection of different cabinet models.
- Customization of textures for various surfaces (e.g., countertops, cabinet fronts, floors, walls).
- Selection of different facade materials for cabinets.
- Dynamic lighting using High Dynamic Range (HDR) environment maps.
- Interactive controls for navigating the scene and adjusting views.

## Technologies Used

- HTML
- CSS
- JavaScript
- Three.js (r128)
  - `GLTFLoader.js` for loading 3D models.
  - `RGBELoader.js` for loading HDR environment maps.
  - `BufferGeometryUtils.js` for geometry utilities.

## Project Structure

```
.
├── assets/                     # Contains 3D models (.glb), HDRI (.hdr) environment maps
│   ├── hdri/
│   └── models/
├── facadeData.json             # Configuration data for facade materials and textures
├── favicon.ico                 # Favicon for the website
├── index.html                  # Main HTML file for the application
├── js/                         # JavaScript files
│   ├── loaders/                # Three.js loaders (GLTFLoader, RGBELoader)
│   └── utils/                  # Three.js utility scripts (BufferGeometryUtils)
├── menus.js                    # Handles the UI menus and interactions
├── roomManager.js              # Manages the 3D room elements, objects, and interactions
├── sceneSetup.js               # Sets up the main Three.js scene, camera, renderer, and lighting
├── script.js                   # Main application logic, event handling, and initialization
├── styles.css                  # CSS styles for the application
└── textures/                   # Texture images for materials
    ├── previews/               # Preview images for textures shown in the UI
    │   ├── CLEAF/
    │   └── ЛДСП/
    └── xl/                     # XL versions of textures (likely higher resolution)
```

- **`index.html`**: The main entry point of the application.
- **`styles.css`**: Contains all the styles for the HTML elements.
- **`script.js`**: Initializes the application, loads necessary data, and orchestrates the overall functionality.
- **`sceneSetup.js`**: Responsible for setting up the Three.js scene, including the renderer, camera, lights, and initial environment.
- **`roomManager.js`**: Manages the 3D objects within the scene, such as walls, floors, and furniture (cabinets). Handles logic for updating these objects.
- **`menus.js`**: Controls the user interface elements, such as dropdown menus for selecting models, textures, and facade materials. Handles user interactions with these menus.
- **`assets/`**: This directory stores all static assets.
    - `hdri/`: Contains HDR image files used for environment lighting.
    - `models/`: Contains 3D models of kitchen cabinets in `.glb` format.
- **`js/`**: Contains JavaScript libraries and utility modules.
    - `loaders/`: Includes Three.js loaders like `GLTFLoader` (for `.glb` models) and `RGBELoader` (for `.hdr` files).
    - `utils/`: May contain helper scripts like `BufferGeometryUtils.js`.
- **`textures/`**: Stores all the image textures used for materials in the 3D scene.
    - `previews/`: Contains smaller preview images of textures, likely used in the UI.
    - `xl/`: Seems to contain larger, possibly higher-resolution versions of the main textures.
- **`facadeData.json`**: A JSON file that likely holds configuration data for different facade materials, linking them to specific textures and properties.

## How to Run

1. Clone this repository to your local machine or download the files.
2. Ensure you have a modern web browser that supports WebGL (e.g., Chrome, Firefox, Edge, Safari).
3. Open the `index.html` file in your web browser.

The application should then load, and you can start configuring your kitchen design. No special build steps or local server (for basic functionality) are required, as it's a client-side JavaScript application. However, some browsers might have security restrictions if you load local files directly; in such cases, serving the files through a simple local HTTP server might be necessary (e.g., using Python's `http.server` or a VS Code Live Server extension).

## Contributing

Contributions to this project are welcome! If you have suggestions for improvements, new features, or find any bugs, please feel free to:

1.  **Fork the repository.**
2.  **Create a new branch** for your feature or bug fix:
    ```bash
    git checkout -b feature/your-feature-name
    ```
    or
    ```bash
    git checkout -b fix/your-bug-fix
    ```
3.  **Make your changes.**
4.  **Commit your changes** with a clear and descriptive commit message.
5.  **Push your changes** to your forked repository.
6.  **Open a Pull Request** to the main repository's `main` branch.

Please ensure your code follows the existing style and that you test your changes thoroughly.
