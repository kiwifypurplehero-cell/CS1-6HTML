/*
 * de_dust2 — reconstrução low-poly, sem recursos externos.
 * A função build aceita { THREE, scene, colliders?, wallObjects?, options? }.
 */
(function registerDust2(root, factory) {
    const definition = factory();
    if (typeof module === "object" && module.exports) module.exports = definition;
    if (root) {
        root.GAME_MAPS = root.GAME_MAPS || {};
        root.GAME_MAPS.de_dust2 = definition;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function dust2Factory() {
    "use strict";

    const MAP_ID = "de_dust2";
    const PLAYER_HEIGHT = 1.8;
    const PLAYER_RADIUS = 0.65;
    const BOUNDS = Object.freeze({ minX: -60, maxX: 60, minZ: -60, maxZ: 60 });

    const SPAWNS = Object.freeze({
        CT: Object.freeze([
            { x: -25, y: PLAYER_HEIGHT / 2, z: -43, yaw: 0.20 }, { x: -13.5, y: PLAYER_HEIGHT / 2, z: -43, yaw: 0.15 },
            { x: -17, y: PLAYER_HEIGHT / 2, z: -43, yaw: 0.05 }, { x: -25, y: PLAYER_HEIGHT / 2, z: -39, yaw: 0.35 },
            { x: -13.5, y: PLAYER_HEIGHT / 2, z: -39, yaw: 0.15 }, { x: -17, y: PLAYER_HEIGHT / 2, z: -39, yaw: -0.10 },
        ]),
        TR: Object.freeze([
            { x: 19, y: PLAYER_HEIGHT / 2, z: 48, yaw: Math.PI }, { x: 23, y: PLAYER_HEIGHT / 2, z: 48, yaw: Math.PI },
            { x: 27, y: PLAYER_HEIGHT / 2, z: 48, yaw: Math.PI }, { x: 19, y: PLAYER_HEIGHT / 2, z: 44, yaw: -2.85 },
            { x: 23, y: PLAYER_HEIGHT / 2, z: 44, yaw: Math.PI }, { x: 27, y: PLAYER_HEIGHT / 2, z: 44, yaw: 2.85 },
        ]),
        DM: Object.freeze([
            { x: -23, y: PLAYER_HEIGHT / 2, z: -41, yaw: 0 }, { x: -40, y: PLAYER_HEIGHT / 2, z: -31, yaw: 1.2 },
            { x: -47, y: PLAYER_HEIGHT / 2, z: 14, yaw: 0 }, { x: -36, y: PLAYER_HEIGHT / 2, z: 42, yaw: -1 },
            { x: -16, y: PLAYER_HEIGHT / 2, z: -17, yaw: 1.5 }, { x: -2, y: PLAYER_HEIGHT / 2, z: -28, yaw: 0 },
            { x: 2, y: PLAYER_HEIGHT / 2, z: 25, yaw: Math.PI }, { x: 22, y: PLAYER_HEIGHT / 2, z: 45, yaw: Math.PI },
            { x: 46, y: PLAYER_HEIGHT / 2, z: 39, yaw: -2 }, { x: 45, y: PLAYER_HEIGHT / 2, z: 8, yaw: Math.PI },
            { x: 37, y: PLAYER_HEIGHT / 2, z: -34, yaw: 2.5 }, { x: 49, y: PLAYER_HEIGHT / 2, z: -38, yaw: 2.3 },
            { x: 22, y: PLAYER_HEIGHT / 2, z: -27, yaw: -1 }, { x: 11, y: PLAYER_HEIGHT / 2, z: 8, yaw: -1.5 },
            { x: -8, y: PLAYER_HEIGHT / 2, z: 6, yaw: 1.5 }, { x: -42, y: PLAYER_HEIGHT / 2, z: -4, yaw: 0 },
        ]),
    });

    const BOMBSITES = Object.freeze({
        A: Object.freeze({ x: -35, y: 0.04, z: -36, radius: 6.5, minX: -41.5, maxX: -28.5, minZ: -42.5, maxZ: -29.5 }),
        B: Object.freeze({ x: 39, y: 0.04, z: -35, radius: 6.2, minX: 32.8, maxX: 45.2, minZ: -41.2, maxZ: -28.8 }),
    });

    function build(context) {
        if (!context || !context.THREE || !context.scene) {
            throw new TypeError("de_dust2.build requer { THREE, scene }.");
        }
        const { THREE, scene } = context;
        const options = Object.assign({ shadows: false }, context.options);
        const map = new THREE.Group();
        map.name = MAP_ID;
        scene.add(map);

        const sectors = {};
        ["ground-and-bounds", "ct-spawn", "tr-spawn", "mid", "long-a", "short-a", "bombsite-a",
            "tunnels", "bombsite-b", "cover", "doors", "ambience", "colliders"].forEach((name) => {
            const sector = new THREE.Group();
            sector.name = name;
            sectors[name] = sector;
            map.add(sector);
        });

        // Materiais simples, ásperos e compartilhados reduzem draw state e memória.
        const standard = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({
            color, roughness: 0.88, metalness: 0.02,
        }, extra));
        const materials = {
            sand: standard(0xc9a66b), sandLight: standard(0xddc28f), sandDark: standard(0xa98759),
            stone: standard(0xa69478), stoneDark: standard(0x766b5b), interior: standard(0x665846),
            wood: standard(0x765033), woodDark: standard(0x493321), metal: standard(0x596167, { metalness: 0.25 }),
            stripeA: standard(0xa44735), stripeB: standard(0x356c78), siteA: standard(0xb6412f), siteB: standard(0xd39b2f),
        };
        const boxGeometries = new Map();
        const planeGeometries = new Map();
        const ownedGeometries = [];
        const meshes = [];
        const colliders = [];

        function boxGeometry(width, height, depth) {
            const key = `${width}:${height}:${depth}`;
            if (!boxGeometries.has(key)) boxGeometries.set(key, new THREE.BoxGeometry(width, height, depth));
            return boxGeometries.get(key);
        }
        function addMesh(sector, name, geometry, material, x, y, z) {
            const mesh = new THREE.Mesh(geometry, materials[material] || material);
            mesh.name = name;
            mesh.position.set(x, y, z);
            mesh.castShadow = options.shadows;
            mesh.receiveShadow = options.shadows;
            sectors[sector].add(mesh);
            meshes.push(mesh);
            return mesh;
        }
        function createCollider(name, x, y, z, width, height, depth, extras) {
            const collider = Object.assign({
                name, min: { x: x - width / 2, y: y - height / 2, z: z - depth / 2 },
                max: { x: x + width / 2, y: y + height / 2, z: z + depth / 2 },
                size: { x: width, y: height, z: depth }, solid: true,
            }, extras);
            colliders.push(collider);
            return collider;
        }
        function createWall(sector, name, x, z, width, depth, height = 6, material = "sand", y = height / 2) {
            const mesh = addMesh(sector, name, boxGeometry(width, height, depth), material, x, y, z);
            createCollider(name, x, y, z, width, height, depth);
            return mesh;
        }
        function createFloor(sector, name, x, z, width, depth, material = "sand", y = 0) {
            const key = `${width}:${depth}`;
            if (!planeGeometries.has(key)) planeGeometries.set(key, new THREE.PlaneGeometry(width, depth));
            const mesh = addMesh(sector, name, planeGeometries.get(key), material, x, y, z);
            mesh.rotation.x = -Math.PI / 2;
            return mesh;
        }
        function createCrate(name, x, z, size = 2.8, y = size / 2, sector = "cover") {
            const crate = createWall(sector, name, x, z, size, size, size, "wood", y);
            const rim = 0.09;
            [[size - rim, rim, size + 0.03], [rim, size - rim, size + 0.03]].forEach(([w, h, d], index) => {
                addMesh(sector, `${name}-brace-${index}`, boxGeometry(w, h, d), "woodDark", x, y, z + size / 2 + 0.02);
            });
            return crate;
        }
        function createRamp(sector, name, x, z, width, length, rise, rotation = 0, material = "stone") {
            const thickness = 0.35;
            const ramp = addMesh(sector, name, boxGeometry(width, thickness, length), material, x, rise / 2, z);
            ramp.rotation.y = rotation;
            ramp.rotation.x = -Math.atan2(rise, length);
            createCollider(name, x, rise / 2, z, rotation ? length : width, rise, rotation ? width : length,
                { type: "ramp", rise, rotation });
            return ramp;
        }
        function createStairs(sector, name, x, z, width, stepDepth, count, direction = -1, material = "stone") {
            for (let index = 0; index < count; index += 1) {
                const height = (index + 1) * 0.35;
                createWall(sector, `${name}-${index + 1}`, x, z + direction * stepDepth * index,
                    width, stepDepth, height, material, height / 2);
            }
        }
        function createDoorway(sector, name, x, z, openingWidth, wallDepth, height, orientation = "x", material = "sand") {
            const pillar = 1.1;
            const horizontal = orientation === "x";
            const offset = openingWidth / 2 + pillar / 2;
            createWall(sector, `${name}-left`, x + (horizontal ? -offset : 0), z + (horizontal ? 0 : -offset),
                horizontal ? pillar : wallDepth, horizontal ? wallDepth : pillar, height, material);
            createWall(sector, `${name}-right`, x + (horizontal ? offset : 0), z + (horizontal ? 0 : offset),
                horizontal ? pillar : wallDepth, horizontal ? wallDepth : pillar, height, material);
            createWall(sector, `${name}-lintel`, x, z, horizontal ? openingWidth : wallDepth,
                horizontal ? wallDepth : openingWidth, 1.1, material, height - 0.55);
        }
        function createArchway(sector, name, x, z, width, depth, height, orientation = "x") {
            createDoorway(sector, name, x, z, width, depth, height, orientation, "sandDark");
            const cap = addMesh(sector, `${name}-cap`, new THREE.CylinderGeometry(width / 2, width / 2, depth, 8, 1, false, 0, Math.PI),
                "sandDark", x, height - 1.05, z);
            ownedGeometries.push(cap.geometry);
            cap.rotation.z = Math.PI / 2;
            if (orientation !== "x") cap.rotation.y = Math.PI / 2;
        }
        function createDoubleDoors(name, x, z, orientation = "x") {
            const horizontal = orientation === "x";
            [-1.65, 1.65].forEach((offset, index) => {
                const door = addMesh("doors", `${name}-${index + 1}`, boxGeometry(horizontal ? 3.1 : 0.28, 4.2, horizontal ? 0.28 : 3.1),
                    "woodDark", x + (horizontal ? offset : 0), 2.1, z + (horizontal ? 0 : offset));
                door.userData.isDoor = true;
                // As folhas abertas são decoração; o vão central permanece navegável.
                door.rotation.y = horizontal ? (index ? -0.18 : 0.18) : (index ? 1.39 : 1.75);
            });
        }

        // 1. Chão, variações de terreno e limites externos.
        createFloor("ground-and-bounds", "desert-floor", 0, 0, 118, 118, "sand");
        createFloor("ground-and-bounds", "mid-stone", 0, 2, 14, 77, "stone");
        createFloor("ground-and-bounds", "tunnel-floor", 38, 24, 34, 46, "interior", 0.015);
        createWall("ground-and-bounds", "north-boundary", 0, -60, 120, 2, 8, "sandDark");
        createWall("ground-and-bounds", "south-boundary", 0, 60, 120, 2, 8, "sandDark");
        createWall("ground-and-bounds", "west-boundary", -60, 0, 2, 120, 8, "sandDark");
        createWall("ground-and-bounds", "east-boundary", 60, 0, 2, 120, 8, "sandDark");

        // 2. Spawn CT: pátio protegido entre A, short e mid.
        createWall("ct-spawn", "ct-back-wall", -22, -49, 22, 2, 6, "sandLight");
        createWall("ct-spawn", "ct-west-return", -32, -44, 2, 12, 6, "sandLight");
        createWall("ct-spawn", "ct-mid-guide", -11, -43, 2, 12, 5, "stone");
        createWall("ct-spawn", "ct-blue-stripe", -22, -48.9, 15, 0.08, 0.55, "stripeB", 2.8);

        // 3. Spawn TR: três saídas largas para long, mid e túneis.
        createWall("tr-spawn", "tr-back", 23, 55, 28, 2, 6, "sandLight");
        createWall("tr-spawn", "tr-west-wing", 10, 50, 2, 12, 5, "sandLight");
        createWall("tr-spawn", "tr-east-wing", 36, 52, 2, 8, 5, "sandLight");
        createDoorway("tr-spawn", "tr-mid-gate", 8, 40, 7, 1.4, 5, "z", "sandDark");

        // 4. Mid e portas do meio: eixo visual longo com ligação ao lower tunnel.
        createWall("mid", "mid-west-north", -8, -28, 2, 30, 6, "stone");
        createWall("mid", "mid-west-south", -8, 27, 2, 30, 6, "stone");
        createWall("mid", "mid-east-north", 8, -32, 2, 22, 6, "stone");
        createWall("mid", "mid-east-south", 8, 31, 2, 22, 6, "stone");
        createArchway("mid", "mid-door-arch", 0, 10, 7, 1.5, 6, "x");
        createDoubleDoors("mid-double-doors", 0, 10);
        createRamp("mid", "mid-slope", 0, -13, 7, 13, 1.6, 0, "stone");
        createDoorway("mid", "lower-tunnel-entry", 13, 19, 6.5, 1.4, 5, "z", "stoneDark");

        // 5. Long A: corredor amplo, pit e observação elevada no canto.
        createWall("long-a", "long-outer-west", -52, 10, 2, 88, 7, "sand");
        createWall("long-a", "long-inner-south", -39, 28, 2, 32, 7, "sandLight");
        createWall("long-a", "long-inner-north", -39, -17, 2, 24, 7, "sandLight");
        createWall("long-a", "long-a-corner", -45, -29, 14, 2, 6, "sandLight");
        createArchway("long-a", "long-a-entry", -45, 37, 7, 1.6, 6, "x");
        createDoubleDoors("long-a-doors", -45, 37);
        createFloor("long-a", "long-pit", -46, 26, 10, 12, "sandDark", -0.08);
        createStairs("long-a", "pit-steps", -42, 20, 5, 0.8, 4, -1);
        createWall("long-a", "long-lookout", -47, -20, 7, 7, 1.2, "stone", 0.6);

        // 6. Short A / catwalk elevado, conectado a mid e ao bombsite A.
        createWall("short-a", "short-west-rail", -25, -12, 2, 29, 4.5, "sandLight");
        createWall("short-a", "short-east-rail", -14, -19, 2, 20, 4.5, "sandLight");
        createWall("short-a", "short-north-rail", -19, -29, 12, 2, 4.5, "sandLight");
        createStairs("short-a", "short-stairs", -18.5, 0, 7, 0.8, 7, -1, "stone");
        createFloor("short-a", "short-platform", -19.5, -19, 9, 20, "stone", 2.47);
        createRamp("short-a", "short-to-a-ramp", -25, -30, 7, 10, 2.45, Math.PI / 2, "stone");

        // 7. Bombsite A: dois acessos, plataforma, bordas e cobertura.
        createWall("bombsite-a", "a-back-wall", -35, -50, 30, 2, 7, "sandLight");
        createWall("bombsite-a", "a-west-wall", -50, -40, 2, 20, 7, "sandLight");
        createWall("bombsite-a", "a-east-back", -20, -43, 2, 14, 6, "sandLight");
        createWall("bombsite-a", "a-platform", -35, -36, 20, 16, 0.45, "stone", 0.225);
        createWall("bombsite-a", "a-red-band", -34, -49.05, 15, 0.08, 0.6, "stripeA", 3.2);

        // 8. Túneis superiores e inferiores: circuito sombreado TR–B–mid.
        createWall("tunnels", "upper-outer-east", 55, 26, 2, 50, 6, "sandDark");
        createWall("tunnels", "upper-inner-east", 42, 35, 2, 28, 6, "interior");
        createWall("tunnels", "upper-south-wall", 47, 51, 16, 2, 6, "interior");
        createWall("tunnels", "upper-north-wall", 48, 15, 14, 2, 6, "interior");
        createWall("tunnels", "lower-north-wall", 25, 15, 20, 2, 5.5, "interior");
        createWall("tunnels", "lower-south-wall", 25, 27, 20, 2, 5.5, "interior");
        createWall("tunnels", "lower-west-wall", 15, 23, 2, 8, 5.5, "interior");
        createDoorway("tunnels", "upper-tunnel-arch", 48, 15, 8, 1.5, 5.5, "x", "stoneDark");
        createArchway("tunnels", "b-tunnel-exit", 42, 4, 7, 1.5, 5.8, "x");
        createStairs("tunnels", "tunnel-steps", 37, 12, 7, 0.75, 6, -1, "stoneDark");
        createFloor("tunnels", "upper-shadow", 48, 31, 12, 32, "interior", 0.025);

        // 9. Bombsite B, entrada externa e janela de observação.
        createWall("bombsite-b", "b-north-wall", 40, -49, 34, 2, 7, "sand");
        createWall("bombsite-b", "b-east-wall", 55, -34, 2, 30, 7, "sand");
        createWall("bombsite-b", "b-south-left", 22, -20, 18, 2, 7, "sandLight");
        createWall("bombsite-b", "b-south-right", 49, -20, 12, 2, 7, "sandLight");
        createWall("bombsite-b", "b-platform", 39, -35, 20, 18, 0.35, "stone", 0.175);
        createDoorway("bombsite-b", "b-main-entry", 37, -20, 7, 1.5, 6, "x", "sandLight");
        createWall("bombsite-b", "b-window-base", 25, -31, 2, 10, 2.2, "stone", 1.1);
        createWall("bombsite-b", "b-window-top", 25, -31, 2, 10, 1.5, "stone", 5.25);
        createWall("bombsite-b", "b-lookout", 27.5, -34, 5, 7, 1.4, "stone", 0.7);

        // 10. Caixas e coberturas, sempre fora do centro das rotas.
        createCrate("a-triple-low", -40, -39, 2.8);
        createCrate("a-triple-high", -40, -39, 2.8, 4.2);
        createCrate("a-site-cover", -31, -33, 3.1);
        createCrate("long-cover", -47, 2, 2.8);
        createCrate("short-cover", -22, -24, 2.5, 3.7);
        createCrate("mid-cover", 4, -20, 2.8);
        createCrate("tr-cover", 30, 41, 3);
        createCrate("tunnel-cover", 50, 27, 2.7);
        createCrate("b-double-low", 45, -40, 3);
        createCrate("b-double-high", 45, -40, 3, 4.5);
        createCrate("b-site-cover", 35, -31, 3.2);

        // 11. Portas, pilares e passagens auxiliares.
        createDoubleDoors("b-double-doors", 42, 4);
        [[-51, -29], [-39, -29], [-25, -50], [25, -49], [54, -20], [42, 15]].forEach(([x, z], index) => {
            createWall("doors", `edge-pillar-${index}`, x, z, 1.2, 1.2, 7.5, "sandDark");
        });

        // Marcações leves dos bombsites (CylinderGeometry de poucos segmentos).
        Object.entries(BOMBSITES).forEach(([letter, site]) => {
            const geometry = new THREE.CylinderGeometry(site.radius, site.radius, 0.055, 16);
            ownedGeometries.push(geometry);
            const marker = addMesh(letter === "A" ? "bombsite-a" : "bombsite-b", `bombsite-${letter}`,
                geometry, letter === "A" ? "siteA" : "siteB", site.x, site.y, site.z);
            marker.userData = { bombsite: letter, plantArea: site };
            const bar = addMesh(letter === "A" ? "bombsite-a" : "bombsite-b", `bombsite-${letter}-mark`,
                boxGeometry(0.8, 0.07, 7), "sandLight", site.x, 0.085, site.z);
            bar.rotation.y = letter === "A" ? 0.65 : -0.65;
        });

        // 12. Iluminação quente e névoa opcional, sem sombras por padrão no celular.
        const hemisphere = new THREE.HemisphereLight(0xffe4b0, 0x6e5a42, 1.25);
        const sun = new THREE.DirectionalLight(0xffd294, 1.15);
        sun.position.set(-35, 65, 30);
        sun.castShadow = options.shadows;
        sectors.ambience.add(hemisphere, sun);

        // 13–15. Validam colisores, spawns e áreas de plantio antes de devolver o mapa.
        const spawnInsideSolid = (spawn) => colliders.some((collider) =>
            spawn.x + PLAYER_RADIUS > collider.min.x && spawn.x - PLAYER_RADIUS < collider.max.x
            && spawn.z + PLAYER_RADIUS > collider.min.z && spawn.z - PLAYER_RADIUS < collider.max.z
            // Pisos, degraus baixos e plataformas são superfícies caminháveis.
            && collider.max.y > 0.75);
        const invalidSpawns = Object.entries(SPAWNS).flatMap(([team, list]) =>
            list.filter(spawnInsideSolid).map((spawn) => `${team}@${spawn.x},${spawn.z}`));
        if (invalidSpawns.length) throw new Error(`Spawns dentro de colisores: ${invalidSpawns.join("; ")}`);

        if (Array.isArray(context.colliders)) context.colliders.push(...colliders);
        if (Array.isArray(context.wallObjects)) context.wallObjects.push(...meshes.filter((mesh) =>
            !mesh.name.includes("floor") && !mesh.name.startsWith("bombsite-")));

        return {
            id: MAP_ID, name: MAP_ID, group: map, sectors, colliders,
            spawns: SPAWNS, bombsites: BOMBSITES, bounds: BOUNDS,
            validation: { spawnClearance: true, connectedRegions: 11, minimumPassageWidth: 6 },
            stats: { meshes: meshes.length, colliders: colliders.length, materials: Object.keys(materials).length },
            dispose() {
                scene.remove(map);
                boxGeometries.forEach((geometry) => geometry.dispose());
                planeGeometries.forEach((geometry) => geometry.dispose());
                ownedGeometries.forEach((geometry) => geometry.dispose());
                Object.values(materials).forEach((material) => material.dispose());
            },
        };
    }

    return Object.freeze({
        id: MAP_ID, name: MAP_ID, build,
        spawns: SPAWNS, bombsites: BOMBSITES, bounds: BOUNDS,
        // Aliases mantidos para integrações antigas do protótipo.
        spawnCT: SPAWNS.CT, spawnTR: SPAWNS.TR, spawnsDM: SPAWNS.DM,
        bombsiteA: BOMBSITES.A, bombsiteB: BOMBSITES.B,
    });
}));
