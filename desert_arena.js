/*
 * Desert Arena — mapa competitivo original e low-poly para Three.js.
 *
 * Uso:
 *   const arena = DesertArena.create(THREE, scene);
 *   // arena.colliders: AABBs para colisão
 *   // arena.navigation: nós e ligações para pathfinding de bots
 *   // arena.spawns.ct / arena.spawns.tr: posições iniciais seguras
 *   // arena.dispose(): libera geometrias, materiais e texturas
 */
(function exposeDesertArena(root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.DesertArena = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function desertArenaFactory() {
    "use strict";

    const MAP_NAME = "de_sirocco_crossing";
    const PLAYER_RADIUS = 0.72;
    const PLAYER_HEIGHT = 1.8;

    // Todos os blocos são ortogonais para produzir colisões previsíveis e evitar
    // quinas inclinadas. Corredores jogáveis têm pelo menos 6 unidades de largura.
    const BLOCKS = [
        // Limites externos
        ["north-boundary", 0, -58, 116, 2, 8, "stone"],
        ["south-boundary", 0, 58, 116, 2, 8, "stone"],
        ["west-boundary", -58, 0, 2, 116, 8, "stone"],
        ["east-boundary", 58, 0, 2, 116, 8, "stone"],

        // Long A: linha aberta para AWP, com recuos de cobertura
        ["long-west", -48, 10, 2, 72, 7, "sand"],
        ["long-east-upper", -37, -16, 2, 20, 7, "sand"],
        ["long-east-lower", -37, 28, 2, 30, 7, "sand"],
        ["long-divider", -27, -27, 22, 2, 7, "sand"],
        ["a-back", -41, -46, 32, 2, 6, "plaster"],

        // Short/catwalk: caminho elevado alternativo para A
        ["short-west", -23, -13, 2, 30, 5, "plaster"],
        ["short-east", -13, -20, 2, 22, 5, "plaster"],
        ["short-corner", -18, -31, 12, 2, 5, "plaster"],

        // Mid: duas faixas, portas no centro e aberturas laterais
        ["mid-west-top", -7, -43, 2, 20, 7, "stone"],
        ["mid-west-bottom", -7, 35, 2, 30, 7, "stone"],
        ["mid-east-top", 7, -40, 2, 26, 7, "stone"],
        ["mid-east-bottom", 7, 38, 2, 24, 7, "stone"],
        ["mid-door-left", -3.4, 3, 3.2, 1, 5, "wood"],
        ["mid-door-right", 3.4, 3, 3.2, 1, 5, "wood"],

        // B e acesso externo: área defensiva com duas entradas
        ["b-north", 37, -46, 40, 2, 7, "sand"],
        ["b-east", 48, -30, 2, 32, 7, "sand"],
        ["b-south-left", 18, -22, 20, 2, 7, "sand"],
        ["b-south-right", 46, -22, 6, 2, 7, "sand"],
        ["b-window-left", 25, -34, 2, 12, 5, "plaster"],
        ["b-window-right", 25, -47, 2, 8, 5, "plaster"],

        // Túneis: circuito em L com saída para B e retorno ao Mid
        ["tunnel-outer-north", 31, 17, 48, 2, 6, "tunnel"],
        ["tunnel-inner-north", 25, 27, 28, 2, 6, "tunnel"],
        ["tunnel-outer-east", 54, 34, 2, 36, 6, "tunnel"],
        ["tunnel-inner-east", 40, 38, 2, 22, 6, "tunnel"],
        ["tunnel-turn", 47, 49, 14, 2, 6, "tunnel"],
        ["tunnel-b-link-west", 31, -4, 2, 20, 6, "tunnel"],
        ["tunnel-b-link-east", 41, -5, 2, 22, 6, "tunnel"],

        // Separadores do spawn TR; as duas saídas impedem gargalo único
        ["tr-yard-west", 9, 50, 20, 2, 5, "plaster"],
        ["tr-yard-east", 34, 50, 12, 2, 5, "plaster"],
        ["tr-mid-guide", 17, 39, 2, 16, 5, "plaster"],
    ];

    const CRATES = [
        // Coberturas não bloqueiam o eixo central de cada rota.
        ["a-double-1", -43, -37, 2.6, 2.6, 2.6],
        ["a-double-2", -40.1, -37, 2.6, 2.6, 2.6],
        ["a-long-cover", -43, -7, 2.8, 2.8, 2.8],
        ["short-cover", -17.8, -25, 2.4, 2.4, 2.4],
        ["mid-cover-north", 3.2, -18, 2.6, 2.6, 2.6],
        ["mid-cover-south", -3.2, 25, 2.6, 2.6, 2.6],
        ["b-back-cover", 43, -40, 3, 3, 3],
        ["b-center-cover", 34, -33, 2.8, 2.8, 2.8],
        ["tunnel-cover", 47, 31, 2.6, 2.6, 2.6],
        ["tr-yard-cover", 29, 43, 2.8, 2.8, 2.8],
    ];

    const STAIRS = [
        // Short sobe 2,4 unidades em degraus largos.
        ["short-stairs", -19, -9, 0, -1, 6],
        // A saída dos túneis oferece um ponto alto de rifle em B.
        ["b-stairs", 36, -16, 0, -1, 6],
    ];

    const SPAWNS = {
        ct: [[-30, -39], [-27, -39], [-24, -39], [-30, -35], [-27, -35], [-24, -35]],
        tr: [[22, 44], [25, 44], [22, 40], [25, 40], [32, 44], [35, 44]],
    };

    const SITES = {
        a: { x: -34, z: -38, radius: 6 },
        b: { x: 38, z: -36, radius: 6 },
    };

    // Nós explícitos mantêm os bots no centro dos corredores. Cada área possui ao
    // menos duas saídas e o grafo completo é validado durante a criação do mapa.
    const NODES = [
        ["ct", -27, -37], ["a", -34, -38], ["a-long", -43, -21],
        ["long-bend", -43, 8], ["long-entry", -43, 42], ["tr-long", -28, 46],
        ["short", -18, -23], ["short-low", -18, -5], ["mid-north", 0, -30],
        ["mid-doors", 0, 8], ["mid-south", 0, 31], ["tr", 24, 43],
        ["b", 38, -36], ["b-entry", 36, -18], ["b-link", 36, 5],
        ["tunnel-west", 18, 22], ["tunnel-turn", 47, 22], ["tunnel-south", 47, 43],
        ["tr-tunnel", 37, 52], ["mid-flank", 14, 22], ["b-window", 28, -29],
    ];

    const LINKS = [
        ["ct", "a"], ["ct", "short"], ["ct", "mid-north"],
        ["a", "a-long"], ["a", "short"], ["a-long", "long-bend"],
        ["long-bend", "long-entry"], ["long-entry", "tr-long"], ["tr-long", "tr"],
        ["short", "short-low"], ["short-low", "mid-doors"], ["short-low", "mid-north"],
        ["mid-north", "mid-doors"], ["mid-doors", "mid-south"], ["mid-south", "tr"],
        ["mid-south", "mid-flank"], ["mid-flank", "tunnel-west"], ["mid-flank", "tr"],
        ["tr", "tr-tunnel"], ["tr-tunnel", "tunnel-south"], ["tunnel-south", "tunnel-turn"],
        ["tunnel-turn", "tunnel-west"], ["tunnel-turn", "b-link"], ["tunnel-west", "b-link"],
        ["b-link", "b-entry"], ["b-entry", "b"], ["b-entry", "b-window"], ["b-window", "b"],
        ["mid-north", "b-window"],
    ];

    function overlaps2D(point, collider, padding) {
        return point.x + padding > collider.min.x && point.x - padding < collider.max.x
            && point.z + padding > collider.min.z && point.z - padding < collider.max.z;
    }

    function validateLayout(colliders, navigation, spawns) {
        const spawnErrors = Object.entries(spawns).flatMap(([team, points]) => points
            .filter((point) => colliders.some((box) => overlaps2D(point, box, PLAYER_RADIUS)))
            .map((point) => `${team.toUpperCase()} (${point.x}, ${point.z})`));
        if (spawnErrors.length) throw new Error(`Spawn dentro de colisão: ${spawnErrors.join(", ")}`);

        const visited = new Set([navigation.nodes[0].id]);
        const queue = [navigation.nodes[0]];
        while (queue.length) {
            const node = queue.shift();
            node.links.forEach((id) => {
                if (!visited.has(id)) { visited.add(id); queue.push(navigation.nodes[id]); }
            });
        }
        if (visited.size !== navigation.nodes.length) {
            const unreachable = navigation.nodes.filter((node) => !visited.has(node.id)).map((node) => node.name);
            throw new Error(`Áreas inacessíveis: ${unreachable.join(", ")}`);
        }
        return { spawnClearance: true, allAreasReachable: true, nodeCount: navigation.nodes.length };
    }

    function createSandTexture(THREE) {
        if (typeof document === "undefined") return null;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 64;
        const context = canvas.getContext("2d");
        context.fillStyle = "#c8a66d";
        context.fillRect(0, 0, 64, 64);
        context.fillStyle = "rgba(92, 67, 40, .10)";
        for (let y = 0; y < 64; y += 16) {
            context.fillRect(0, y, 64, 2);
            for (let x = (y / 16 % 2) * 12; x < 64; x += 24) context.fillRect(x, y, 2, 16);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        return texture;
    }

    function create(THREE, scene, options) {
        if (!THREE || !scene) throw new TypeError("DesertArena.create requer THREE e uma scene.");
        const settings = Object.assign({ shadows: false, labels: false }, options);
        const group = new THREE.Group();
        group.name = MAP_NAME;
        scene.add(group);

        const texture = createSandTexture(THREE);
        const materials = {
            ground: new THREE.MeshLambertMaterial({ color: 0xb8915b }),
            sand: new THREE.MeshLambertMaterial({ color: 0xc5a068, map: texture }),
            stone: new THREE.MeshLambertMaterial({ color: 0x9a8569 }),
            plaster: new THREE.MeshLambertMaterial({ color: 0xd0b98d }),
            tunnel: new THREE.MeshLambertMaterial({ color: 0x76644e }),
            wood: new THREE.MeshLambertMaterial({ color: 0x684629 }),
            crate: new THREE.MeshLambertMaterial({ color: 0x8b633a }),
            siteA: new THREE.MeshBasicMaterial({ color: 0xb34e34 }),
            siteB: new THREE.MeshBasicMaterial({ color: 0xc28c32 }),
        };
        const geometries = new Map();
        const meshes = [];
        const colliders = [];

        const geometryFor = (w, h, d) => {
            const key = `${w}:${h}:${d}`;
            if (!geometries.has(key)) geometries.set(key, new THREE.BoxGeometry(w, h, d));
            return geometries.get(key);
        };
        const addBlock = (name, x, z, w, d, h, material, y = h / 2, collision = true) => {
            const mesh = new THREE.Mesh(geometryFor(w, h, d), materials[material]);
            mesh.name = name;
            mesh.position.set(x, y, z);
            mesh.castShadow = settings.shadows;
            mesh.receiveShadow = settings.shadows;
            group.add(mesh);
            meshes.push(mesh);
            if (collision) colliders.push({
                name,
                min: { x: x - w / 2, y: y - h / 2, z: z - d / 2 },
                max: { x: x + w / 2, y: y + h / 2, z: z + d / 2 },
            });
            return mesh;
        };

        addBlock("ground", 0, 0, 116, 116, 0.3, "ground", -0.15, false);
        BLOCKS.forEach(([name, x, z, w, d, h, material]) => addBlock(name, x, z, w, d, h, material));
        CRATES.forEach(([name, x, z, w, d, h]) => addBlock(name, x, z, w, d, h, "crate"));

        STAIRS.forEach(([name, startX, startZ, stepX, stepZ, count]) => {
            for (let index = 0; index < count; index += 1) {
                const height = (index + 1) * 0.4;
                addBlock(`${name}-${index + 1}`, startX + stepX * index, startZ + stepZ * index,
                    stepX === 0 ? 6 : 1, stepZ === 0 ? 6 : 1, height, "stone", height / 2);
            }
        });

        Object.entries(SITES).forEach(([key, site]) => {
            const marker = new THREE.Mesh(new THREE.CylinderGeometry(site.radius, site.radius, 0.04, 12), materials[`site${key.toUpperCase()}`]);
            marker.name = `bombsite-${key}`;
            marker.position.set(site.x, 0.03, site.z);
            group.add(marker);
            meshes.push(marker);
        });

        const nodeByName = new Map();
        const nodes = NODES.map(([name, x, z], id) => {
            const node = { id, name, position: { x, y: 0, z }, links: [] };
            nodeByName.set(name, node);
            return node;
        });
        LINKS.forEach(([from, to]) => {
            const a = nodeByName.get(from);
            const b = nodeByName.get(to);
            if (!a || !b) throw new Error(`Ligação inválida: ${from} -> ${to}`);
            a.links.push(b.id);
            b.links.push(a.id);
        });
        const navigation = { minimumCorridorWidth: 6, playerClearance: PLAYER_RADIUS, nodes };
        const spawns = Object.fromEntries(Object.entries(SPAWNS).map(([team, points]) => [team,
            points.map(([x, z]) => ({ x, y: PLAYER_HEIGHT / 2, z }))]));
        const validation = validateLayout(colliders, navigation, spawns);

        // Uma luz hemisférica e um sol sem sombras por padrão mantêm baixo o custo
        // de renderização em celulares. O jogo pode optar por ativar sombras.
        const skyLight = new THREE.HemisphereLight(0xffe6b5, 0x756047, 1.35);
        const sun = new THREE.DirectionalLight(0xffd79a, 1.15);
        sun.position.set(-35, 70, 25);
        sun.castShadow = settings.shadows;
        group.add(skyLight, sun);

        return {
            name: MAP_NAME,
            group,
            colliders,
            navigation,
            spawns,
            bombsites: SITES,
            validation,
            stats: { meshes: meshes.length, uniqueBoxGeometries: geometries.size, materials: Object.keys(materials).length },
            dispose() {
                scene.remove(group);
                geometries.forEach((geometry) => geometry.dispose());
                Object.values(materials).forEach((material) => material.dispose());
                if (texture) texture.dispose();
            },
        };
    }

    return Object.freeze({ name: MAP_NAME, create, validateLayout });
}));
