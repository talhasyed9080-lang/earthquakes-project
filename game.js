'use strict';
/* Classroom Earthquake Survival — pure WebGL, no external libraries. */
(function () {
  // =====================================================================
  // Setup
  // =====================================================================
  const canvas = document.getElementById('game');
  const gl = canvas.getContext('webgl', { antialias: true }) || canvas.getContext('experimental-webgl');
  const ui = {
    hud: document.getElementById('hud'),
    status: document.getElementById('status'),
    message: document.getElementById('message'),
    hint: document.getElementById('hint'),
    menu: document.getElementById('menu'),
    complete: document.getElementById('complete'),
    start: document.getElementById('startBtn'),
    again: document.getElementById('againBtn'),
  };
  if (!gl) {
    document.getElementById('fatal').classList.remove('hidden');
    ui.menu.classList.add('hidden');
    return;
  }

  const VS = `
    attribute vec3 aPos; attribute vec3 aNor;
    uniform mat4 uProj, uView, uModel; uniform float uYaw;
    varying vec3 vN; varying vec3 vW; varying float vDepth;
    void main() {
      vec4 w = uModel * vec4(aPos, 1.0);
      vW = w.xyz;
      float c = cos(uYaw), s = sin(uYaw);
      vN = vec3(c * aNor.x + s * aNor.z, aNor.y, -s * aNor.x + c * aNor.z);
      vec4 v = uView * w;
      vDepth = -v.z;
      gl_Position = uProj * v;
    }`;
  const FS = `
    precision mediump float;
    uniform vec3 uColor; uniform float uEmis, uAlpha, uPat;
    varying vec3 vN; varying vec3 vW; varying float vDepth;
    void main() {
      vec3 n = normalize(vN);
      vec3 col = uColor;
      if (uPat > 2.5) {            // sky gradient for windows
        col = mix(vec3(0.62, 0.82, 0.98), vec3(0.28, 0.55, 0.92), clamp((vW.y - 1.0) / 1.4, 0.0, 1.0));
        if (vW.y < 1.25) col = vec3(0.42, 0.68, 0.36);
      } else if (uPat > 1.5) {     // ceiling tiles
        vec2 g = fract(vW.xz / 1.2);
        if (g.x < 0.03 || g.y < 0.03) col *= 0.82;
      } else if (uPat > 0.5) {     // wooden planks
        float plank = floor(vW.x * 2.0);
        float r = fract(sin(plank * 12.9898) * 43758.5453);
        float seg = fract(vW.z * 0.4 + r);
        col *= 0.86 + 0.18 * r + 0.04 * sin(vW.z * 9.0 + r * 20.0);
        if (fract(vW.x * 2.0) < 0.014 || seg < 0.006) col *= 0.8;
      }
      vec3 L = normalize(vec3(-0.6, 0.8, 0.25));
      float d = max(dot(n, L), 0.0);
      float hemi = 0.5 + 0.5 * n.y;
      float pool = 0.25 * exp(-dot(vW.xz, vW.xz) * 0.012);
      vec3 lit = col * (vec3(0.53, 0.57, 0.59) + vec3(1.0, 0.98, 0.95) * d * 0.42 + hemi * vec3(0.16, 0.19, 0.2) + pool * 0.3);
      lit = mix(lit, col, uEmis);
      float fog = clamp((vDepth - 150.0) / 1500.0, 0.0, 0.75);
      lit = mix(lit, vec3(0.65, 0.84, 0.92), fog);
      gl_FragColor = vec4(lit, uAlpha);
    }`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const loc = {};
  ['uProj', 'uView', 'uModel', 'uYaw', 'uColor', 'uEmis', 'uAlpha', 'uPat'].forEach(n => (loc[n] = gl.getUniformLocation(prog, n)));
  const aPos = gl.getAttribLocation(prog, 'aPos');
  const aNor = gl.getAttribLocation(prog, 'aNor');

  const meshes={};
  // Unit cube geometry (centered at origin, size 1)
  (function buildCube() {
    const faces = [
      [[1, 0, 0], [[.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5], [.5, -.5, .5]]],
      [[-1, 0, 0], [[-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5], [-.5, -.5, -.5]]],
      [[0, 1, 0], [[-.5, .5, -.5], [-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5]]],
      [[0, -1, 0], [[-.5, -.5, .5], [-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5]]],
      [[0, 0, 1], [[.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5], [-.5, -.5, .5]]],
      [[0, 0, -1], [[-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5], [.5, -.5, -.5]]],
    ];
    const data = [], idx = [];
    faces.forEach((f, i) => {
      f[1].forEach(v => data.push(v[0], v[1], v[2], f[0][0], f[0][1], f[0][2]));
      const b = i * 4;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    meshes.cube={vb,ib,count:36};
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(aNor);
    gl.vertexAttribPointer(aNor, 3, gl.FLOAT, false, 24, 12);
  })();

  (function buildSphere(){
    const data=[],indices=[],n=16;
    for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){const a=i/n*Math.PI*2,b=j/n*Math.PI,x=Math.sin(b)*Math.cos(a),y=Math.cos(b),z=Math.sin(b)*Math.sin(a);data.push(x*.5,y*.5,z*.5,x,y,z);}
    for(let j=0;j<n;j++)for(let i=0;i<n;i++){const a=j*(n+1)+i,b=a+n+1;indices.push(a,a+1,b,b,a+1,b+1);}
    const vb=gl.createBuffer(),ib=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);meshes.sphere={vb,ib,count:indices.length};
  })();
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  function hex(h) {
    const n = parseInt(h.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  // Scene graph: groups with transforms, parts are boxes relative to a group
  const settings = { sensitivity: 1, volume: 0.6, fov: 72, cameraShake: true };
  const scenarios = {
    classroom: { name: 'Classroom', intro: 'Mr.BOB starting class...', description: 'Tip: stay away from windows' },
    gym: { name: 'Gym', intro: 'Mr.BOB is starting gym', description: 'Tip: Stay away from hoops' },
    library: { name: 'Library', intro: 'Its library time ', description: 'Tip: stay away from the book shelfs' },
    bathroom: { name: 'Washroom', intro: 'You are pooping in the washroom', description: 'Tip: stay away from the mirrors (the washroom was Azariahs suggestion)' },
    recess: { name: 'Recess', intro: 'Have fun its recess', description: 'Tip: stay away from the school building and the playstructure' },
  };
  let selectedScenario = 'classroom';
  let mode = 'drill', schoolMode = false, currentRoom = null, corridorReturn = null;
  const doors = [], balls = [], hoops = [], projectiles = [], schoolRooms = [];
  let heldPerson = null, score = 0, travel = null;
  const CAMPUS = { classrooms: 50, gyms: 2, libraries: 1, boysWashrooms: 2, girlsWashrooms: 2 };
  for(let i=0;i<50;i++) schoolRooms.push({id:'classroom-'+(i+1),type:'classroom',name:'Classroom '+(i+1),x:i%2 ? 5 : -5,z:-Math.floor(i/2)*24});
  ['gym','gym','library','bathroom','bathroom','bathroom','bathroom','recess'].forEach((type,i)=>schoolRooms.push({id:type+'-'+i,type,name:type==='bathroom' ? (i<5?'Boys':'Girls')+' Washroom '+(i%2+1) : type==='gym'?'Gym '+(i+1):type==='library'?'Grand Library':'door1 (the onlu door outside)',x:i%2?5:-5,z:-620-i*24}));
  let paused = false, settingsFrom = 'menu', heldChair = null, holdDistance = 0, leftHeld = false;
  const chairs = [];
  const objects = [];
  const groups = [];
  function makeGroup(x, z, yaw) {
    const g = { x, y: 0, z, yaw: yaw || 0, bx: x, bz: z, shakeX: 0, shakeY: 0, shakeZ: 0, tags: {} };
    groups.push(g);
    return g;
  }
  function box(g, x, y, z, sx, sy, sz, color, opt) {
    opt = opt || {};
    objects.push({ g, p: [x, y, z], s: [sx, sy, sz], c: typeof color === 'string' ? hex(color) : color, e: opt.e || 0, a: opt.a == null ? 1 : opt.a, pat: opt.pat || 0, tag: opt.tag || null, sphere:Boolean(opt.sphere) });
  }

  // =====================================================================
  // Classroom
  // =====================================================================
  const ROOM = { x0: -7, x1: 7, z0: -9, z1: 9, h: 3.2 };
  const obstacles = []; // {x0,x1,z0,z1,low}
  const room = makeGroup(0, 0, 0);

  function buildClassroom() {
    const wall = '#efe6d4', trim = '#b88b5a';
    box(room, 0, -0.05, 0, 14, 0.1, 18, '#b07a45', { pat: 1 });                 // floor
    box(room, 0, ROOM.h + 0.05, 0, 14, 0.1, 18, '#f4f1ea', { pat: 2 });         // ceiling
    box(room, 0, 1.6, 9.05, 14.2, 3.2, 0.1, wall);                              // back wall
    box(room, 0, 1.6, -9.05, 14.2, 3.2, 0.1, wall);                             // front wall
    box(room, 7.05, 1.6, 1.5, 0.1, 3.2, 15.2, wall);
    box(room, 7.05, 1.6, -8.7, .1, 3.2, .6, wall);
    box(room, 7.05, 2.8, -7.2, .1, .8, 2.4, wall);                              // right wall
    box(room, -7.05, 1.6, 0, 0.1, 3.2, 18.2, '#f2e9d6');                        // left (window) wall
    // baseboards
    box(room, 0, 0.06, 8.98, 14, 0.12, 0.04, trim);
    box(room, 0, 0.06, -8.98, 14, 0.12, 0.04, trim);
    box(room, 6.98, 0.06, 0, 0.04, 0.12, 18, trim);
    box(room, -6.98, 0.06, 0, 0.04, 0.12, 18, trim);

    // Windows on the left wall with blue sky
    [-5, 0, 5].forEach(z => {
      box(room, -6.99, 1.75, z, 0.02, 1.4, 3, '#88c4f5', { e: 1, pat: 3 });
      box(room, -6.96, 1.03, z, 0.08, 0.06, 3.1, '#ffffff');
      box(room, -6.96, 2.47, z, 0.08, 0.06, 3.1, '#ffffff');
      box(room, -6.96, 1.75, z - 1.52, 0.08, 1.5, 0.06, '#ffffff');
      box(room, -6.96, 1.75, z + 1.52, 0.08, 1.5, 0.06, '#ffffff');
      box(room, -6.96, 1.75, z, 0.06, 1.4, 0.05, '#ffffff');
      box(room, -6.85, 0.98, z, 0.3, 0.05, 3.2, '#e9e2d3');                    // sill
    });

    // Whiteboard
    box(room, 0, 1.65, -8.97, 6.2, 1.7, 0.06, '#9aa1a8');
    box(room, 0, 1.65, -8.93, 6, 1.5, 0.04, '#fbfcfd', { e: 0.35 });
    box(room, 0, 0.88, -8.85, 6, 0.05, 0.16, '#9aa1a8');                       // marker tray
    box(room, -1.5, 0.92, -8.82, 0.15, 0.04, 0.04, '#d33');
    box(room, -1.2, 0.92, -8.82, 0.15, 0.04, 0.04, '#2650c7');
    // "writing" on board
    [[-2.2, 2.15, 2.0, '#2650c7'], [-2.0, 1.95, 2.6, '#333'], [-2.1, 1.75, 1.6, '#333'], [-1.9, 1.55, 2.4, '#333'], [1.6, 2.1, 1.6, '#c62828'], [1.7, 1.6, 1.2, '#2e7d32']].forEach(w => {
      box(room, w[0] + w[2] / 2, w[1], -8.9, w[2], 0.05, 0.02, w[3], { e: 0.3 });
    });
    box(room, 1.4, 1.85, -8.9, 0.05, 0.5, 0.02, '#c62828', { e: 0.3 });

    // Clock
    box(room, 4.5, 2.7, -8.97, 0.45, 0.45, 0.06, '#222');
    box(room, 4.5, 2.7, -8.93, 0.38, 0.38, 0.04, '#fff', { e: 0.4 });
    box(room, 4.5, 2.76, -8.9, 0.03, 0.14, 0.02, '#111');
    box(room, 4.55, 2.7, -8.9, 0.12, 0.03, 0.02, '#111');

    // Posters on right wall and back wall
    [['#e57373', -6], ['#64b5f6', -3], ['#ffd54f', 3], ['#81c784', 6]].forEach(p => {
      box(room, 6.97, 1.9, p[1], 0.04, 1.0, 0.8, '#fff');
      box(room, 6.95, 1.95, p[1], 0.04, 0.75, 0.65, p[0]);
    });
    box(room, -2, 1.8, 8.97, 3, 1.2, 0.06, '#c9935a');                         // cork board
    [['#fff59d', -3], ['#90caf9', -2.2], ['#f48fb1', -1.3], ['#a5d6a7', -0.8]].forEach((p, i) => {
      box(room, p[1], 1.8 + (i % 2 ? 0.2 : -0.15), 8.93, 0.5, 0.6, 0.02, p[0]);
    });

    // Door on right wall near front
    addDoor(6.95,-7.2,Math.PI/2,2.3,true);

    // Ceiling lights
    [[-3.5, -5], [3.5, -5], [-3.5, 0], [3.5, 0], [-3.5, 5], [3.5, 5]].forEach(l => {
      box(room, l[0], ROOM.h - 0.03, l[1], 1.2, 0.06, 0.6, '#fffbea', { e: 1 });
    });

    // Bookshelf in back corner
    box(room, 5.6, 0.9, 8.6, 2.2, 1.8, 0.6, '#8a5a34');
    obstacles.push({ x0: 4.5, x1: 6.7, z0: 8.3, z1: 9, low: false });
    const bookColors = ['#c62828', '#1565c0', '#2e7d32', '#f9a825', '#6a1b9a', '#ef6c00'];
    [0.45, 1.05, 1.6].forEach(y => {
      for (let i = 0; i < 9; i++) {
        const h = 0.3 + ((i * 7) % 5) * 0.03;
        box(room, 4.75 + i * 0.2, y + h / 2 - 0.1, 8.28, 0.16, h, 0.35, bookColors[(i + Math.round(y * 3)) % 6]);
      }
    });
    // Trash bin
    box(room, -6.3, 0.25, -8.2, 0.4, 0.5, 0.4, '#4a6b8a');
  }

  // Desk with chair (classmate or empty)
  function buildDesk(x, z) {
    const g = makeGroup(x, z, 0);
    const wood = '#d9a066', metal = '#6b7178';
    box(g, 0, 0.74, 0, 1.1, 0.05, 0.65, wood);
    [[-0.5, -0.27], [0.5, -0.27], [-0.5, 0.27], [0.5, 0.27]].forEach(l => box(g, l[0], 0.36, l[1], 0.05, 0.72, 0.05, metal));
    box(g, 0, 0.6, -0.05, 1.0, 0.03, 0.5, '#9b6a3e');                           // book shelf under
    buildChair(x, z + 0.6);
    obstacles.push({ x0: x - 0.58, x1: x + 0.58, z0: z - 0.36, z1: z + 0.36, low: true });
    return g;
  }

  function buildTeacherDesk() {
    const g = makeGroup(3, -6.6, 0);
    const wood = '#8a5530';
    box(g, 0, 0.78, 0, 2.2, 0.07, 0.95, wood);
    box(g, -1.05, 0.38, 0, 0.08, 0.76, 0.9, wood);
    box(g, 1.05, 0.38, 0, 0.08, 0.76, 0.9, wood);
    box(g, 0, 0.42, 0.42, 2.1, 0.6, 0.05, '#7a4a28');
    box(g, -0.5, 0.86, 0, 0.5, 0.08, 0.35, '#1565c0');                          // books
    box(g, 0.4, 0.9, -0.1, 0.5, 0.03, 0.35, '#333');                            // laptop
    box(g, 0.75, 0.88, 0.15, 0.1, 0.12, 0.1, '#e53935');                        // apple
    buildChair(3, -7.65, Math.PI, '#333333');
    obstacles.push({ x0: 1.85, x1: 4.15, z0: -7.1, z1: -6.1, low: false });
  }

  // =====================================================================
  // Characters
  // =====================================================================
  const classmates = [];
  let teacher = null;

  function buildPerson(g, shirt, pants, skin, hair, seated) {
    const eye = '#222';
    if (seated) {
      box(g, -0.11, 0.5, -0.2, 0.16, 0.16, 0.45, pants);
      box(g, 0.11, 0.5, -0.2, 0.16, 0.16, 0.45, pants);
      box(g, -0.11, 0.25, -0.42, 0.15, 0.5, 0.15, pants);
      box(g, 0.11, 0.25, -0.42, 0.15, 0.5, 0.15, pants);
      box(g, 0, 0.84, 0.02, 0.46, 0.56, 0.26, shirt);
      box(g, -0.3, 0.85, -0.12, 0.12, 0.12, 0.42, shirt, { tag: 'arm' });
      box(g, 0.3, 0.85, -0.12, 0.12, 0.12, 0.42, shirt, { tag: 'arm' });
      box(g, 0, 1.3, 0, 0.32, 0.32, 0.3, skin, { tag: 'head' });
      box(g, 0, 1.48, 0.02, 0.35, 0.1, 0.34, hair, { tag: 'head' });
      box(g, 0, 1.36, 0.14, 0.35, 0.22, 0.08, hair, { tag: 'head' });
      box(g, -0.07, 1.33, -0.155, 0.05, 0.05, 0.02, eye, { tag: 'head' });
      box(g, 0.07, 1.33, -0.155, 0.05, 0.05, 0.02, eye, { tag: 'head' });
    } else {
      box(g, -0.12, 0.42, 0, 0.18, 0.84, 0.2, pants, { tag: 'legs' });
      box(g, 0.12, 0.42, 0, 0.18, 0.84, 0.2, pants, { tag: 'legs' });
      box(g, -0.12, 0.04, -0.04, 0.2, 0.08, 0.28, '#3b2a1d', { tag: 'legs' });
      box(g, 0.12, 0.04, -0.04, 0.2, 0.08, 0.28, '#3b2a1d', { tag: 'legs' });
      box(g, 0, 1.15, 0, 0.54, 0.66, 0.3, shirt);
      box(g, 0, 1.4, -0.155, 0.12, 0.12, 0.02, '#c62828');                     // tie/collar
      box(g, -0.35, 1.15, 0, 0.14, 0.6, 0.15, shirt, { tag: 'armL' });
      box(g, 0.35, 1.15, 0, 0.14, 0.6, 0.15, shirt, { tag: 'armR' });
      box(g, -0.35, 0.8, 0, 0.12, 0.12, 0.12, skin, { tag: 'armL' });
      box(g, 0.35, 0.8, 0, 0.12, 0.12, 0.12, skin, { tag: 'armR' });
      box(g, 0, 1.68, 0, 0.36, 0.36, 0.34, skin, { tag: 'head' });
      box(g, 0, 1.89, 0.02, 0.39, 0.1, 0.38, hair, { tag: 'head' });
      box(g, -0.08, 1.72, -0.175, 0.05, 0.05, 0.02, eye, { tag: 'head' });
      box(g, 0.08, 1.72, -0.175, 0.05, 0.05, 0.02, eye, { tag: 'head' });
      box(g, 0, 1.6, -0.175, 0.12, 0.03, 0.02, '#8d3b3b', { tag: 'head' });
    }
    box(g, 0, 0.012, seated ? -0.1 : 0, 0.7, 0.01, 0.7, '#000000', { a: 0.22 }); // blob shadow
  }

  function buildCharacters() {
    const cols = [-4, 0, 4], rows = [-3, 0, 3, 6];
    const empty = { '0,6': 1, '4,3': 1, '-4,0': 1, '0,-3': 1 };
    const looks = [
      ['#e53935', '#1e3a5f', '#f1c27d', '#3b2a1d'], ['#43a047', '#333333', '#8d5524', '#111111'],
      ['#fdd835', '#5d4037', '#ffdbac', '#c68642'], ['#8e24aa', '#263238', '#c68642', '#1b1b1b'],
      ['#fb8c00', '#37474f', '#e0ac69', '#4e342e'], ['#1e88e5', '#4e342e', '#ffdbac', '#e8c07a'],
      ['#00897b', '#212121', '#8d5524', '#222222'], ['#ec407a', '#283593', '#f1c27d', '#6d4c41'],
    ];
    let k = 0;
    rows.forEach(z => cols.forEach(x => {
      buildDesk(x, z);
      if (empty[x + ',' + z]) return;
      const g = makeGroup(x, z + 0.55, 0);
      const L = looks[k % looks.length];
      buildPerson(g, L[0], L[1], L[2], L[3], true);
      g.phase = k * 1.37; g.coverX=x; g.coverZ=z; g.person=true;
      classmates.push(g);
      obstacles.push({ x0: x - 0.3, x1: x + 0.3, z0: z + 0.3, z1: z + 0.9, low: false });
      k++;
    }));
    teacher = makeGroup(-0.5, -7.4, Math.PI); teacher.coverX=3; teacher.coverZ=-6.6;
    buildPerson(teacher, '#2e6fb5', '#3e3e44', '#e0ac69', '#5a3a22', false);
    obstacles.push({ x0: -0.85, x1: -0.15, z0: -7.75, z1: -7.05, low: false });
  }

  function buildChair(x, z, yaw = 0, color = '#3f74b5') {
    const g = makeGroup(x, z, yaw);
    g.chair = true;
    chairs.push(g);
    box(g, 0, 0.45, 0, 0.48, 0.06, 0.48, color);
    box(g, 0, 0.77, 0.22, 0.48, 0.58, 0.05, color);
    [[-.2,-.2],[.2,-.2],[-.2,.2],[.2,.2]].forEach(l => box(g,l[0],.22,l[1],.045,.44,.045,'#6b7178'));
    return g;
  }

  function solid(x,y,z,w,h,d,color,low = false) {
    box(room,x,y,z,w,h,d,color);
    obstacles.push({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,low});
  }
  function table(x,z) {
    box(room,x,.78,z,2.4,.12,1.2,'#d9a066');
    [[-1,-.45],[1,-.45],[-1,.45],[1,.45]].forEach(l => box(room,x+l[0],.36,z+l[1],.09,.72,.09,'#6b7178'));
    obstacles.push({x0:x-1.2,x1:x+1.2,z0:z-.6,z1:z+.6,low:true});
    buildChair(x,z+1);
    buildChair(x,z-1,Math.PI);
  }
  // Shared architecture, sports grounds and a streamed, connected campus.
  function addDoor(x,z,yaw=0,width=1.5,exit=false,destination=null) {
    const g=makeGroup(x,z,yaw); g.door=true;
    const d={g,x,z,yaw,width,exit,destination,open:false}; doors.push(d);
    box(g,0,1.2,0,width,2.4,.09,'#287f88');
    box(g,0,1.65,-.06,width*.6,.65,.04,'#99d7e9',{e:.3});
    box(g,width*.35,1,-.09,.12,.08,.1,'#f1cd63');
    const frame=makeGroup(x,z,yaw);
    [-width/2-.06,width/2+.06].forEach(a=>box(frame,a,1.25,0,.1,2.5,.16,'#394b56'));
    box(frame,0,2.5,0,width+.2,.12,.16,'#394b56');
    return d;
  }
  function circle(x,z,r,color,y=.018) {
    const n=64;
    for(let i=0;i<n;i++) {const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2;
      const g=makeGroup(x+(Math.cos(a)+Math.cos(b))*r/2,z+(Math.sin(a)+Math.sin(b))*r/2,-a);
      box(g,0,y,0,.065,.015,2*r*Math.sin(Math.PI/n),color);
    }
  }
  function basketballCourt(x,z) {
    box(room,x,.004,z,15,.015,28,'#c57b55',{pat:1});
    const ink='#eff9f8';
    [-7.5,7.5].forEach(a=>box(room,x+a,.02,z,.065,.02,28,ink));
    [-14,0,14].forEach(a=>box(room,x,.02,z+a,15,.02,.065,ink));
    circle(x,z,1.8,ink);
    [-1,1].forEach(sign=> {
      const hz=z+sign*12.4;
      box(room,x,3.75,z+sign*14.7,.16,7.5,.16,'#394b56');
      box(room,x,3.6,z+sign*13.2,1.8,1.05,.08,'#f7fafb');
      box(room,x,3.6,z+sign*13.13,.8,.55,.02,'#d45958');
      const ring=makeGroup(x,hz,0);
      for(let i=0;i<24;i++) {const a=i/24*Math.PI*2;box(ring,Math.cos(a)*.23,3.05,Math.sin(a)*.23,.065,.055,.065,'#ef7646');}
      for(let i=0;i<12;i++) {const a=i/12*Math.PI*2;box(ring,Math.cos(a)*.18,2.82,Math.sin(a)*.18,.022,.4,.022,ink);}
      hoops.push({x,z:hz,y:3.05});
      [-2.45,2.45].forEach(a=>box(room,x+a,.022,z+sign*11,.06,.02,6,ink));
      box(room,x,.022,z+sign*8,4.9,.02,.06,ink);circle(x,z+sign*8,1.8,ink);
    });
    const g=makeGroup(x,z+5,0);g.y=.25;g.ball=true;
    box(g,0,0,0,.48,.48,.48,'#ed8b42',{sphere:true});
    balls.push(g);
  }
  function soccerField(x,z) {
    box(room,x,.01,z,68,.02,105,'#3f9567');
    for(let i=0;i<10;i++)box(room,x,.024,z-47.25+i*10.5,68,.01,10.5,i%2?'#4ba573':'#3f9567');
    [-34,34].forEach(a=>box(room,x+a,.04,z,.12,.01,105,'#eff9f8'));
    [-52.5,0,52.5].forEach(a=>box(room,x,.04,z+a,68,.01,.12,'#eff9f8'));
    circle(x,z,9.15,'#eff9f8',.045);
    [-1,1].forEach(sign=> {
      const gz=z+sign*52.5;
      [-3.66,3.66].forEach(a=>box(room,x+a,1.22,gz,.12,2.44,.12,'#eff9f8'));
      box(room,x,2.44,gz,7.32,.12,.12,'#eff9f8');
      for(let i=0;i<16;i++)box(room,x-3.66+i*.488,1.22,gz+sign*1.5,.025,2.44,.025,'#b9ceca');
      for(let i=0;i<7;i++)box(room,x,i*.4,gz+sign*1.5,7.32,.025,.025,'#b9ceca');
      [-20.16,20.16].forEach(a=>box(room,x+a,.04,z+sign*44.25,.12,.01,16.5,'#eff9f8'));
      box(room,x,.04,z+sign*36,40.32,.01,.12,'#eff9f8');
    });
  }
  function playground() {
    // Broad elevated fort with stairs, rails and a long slide.
    [[22,13],[28,13],[22,19],[28,19]].forEach(p=>solid(p[0],2.25,p[1],.22,4.5,.22,'#287f88'));
    box(room,25,4.5,16,6.4,.18,6.4,'#e6b644');
    box(room,25,7,16,7,.2,7,'#d45958');
    [[22,16],[28,16]].forEach(p=>box(room,p[0],5.2,p[1],.1,1.3,6,'#287f88'));
    for(let i=0;i<18;i++)box(room,25,(i+1)*.25,25-i*.32,2,.2,.34,'#287f88');
    for(let i=0;i<100;i++) {
      const t=i/99;box(room,25,4.5*(1-t),12.8-t*14,2,.12,.2,'#f1cd63');
      [-1.08,1.08].forEach(a=>box(room,25+a,4.5*(1-t)+.2,12.8-t*14,.12,.5,.22,'#d45958'));
    }
    // Monkey bars and swings.
    [34,40].forEach(x=>[10,18].forEach(z=>solid(x,1.8,z,.18,3.6,.18,'#287f88')));
    for(let z=10;z<=18;z++)box(room,37,3.6,z,6,.1,.1,'#f1cd63');
    [-8,-2].forEach(x=>solid(x,1.8,18,.18,3.6,.18,'#287f88'));
    box(room,-5,3.6,18,6,.16,.16,'#287f88');
    [-6.5,-3.5].forEach(x=> {[-.25,.25].forEach(a=>box(room,x+a,2.3,18,.03,2.5,.03,'#394b56'));box(room,x,1.05,18,.7,.08,.5,'#d45958');});
  }
  function shell(w,d,h) {
    Object.assign(ROOM,{x0:-w/2,x1:w/2,z0:-d/2,z1:d/2,h});
    box(room,0,-.06,0,w,.12,d,selectedScenario==='gym'?'#b9936c':'#d7e7e5',{pat:selectedScenario==='gym'?1:0});
    box(room,0,h,0,w,.12,d,'#eff7f6',{pat:2});
    box(room,0,h/2,-d/2,w,h,.12,'#d7e7e5');
    [-w/2,w/2].forEach(x=>box(room,x,h/2,0,.12,h,d,'#d7e7e5'));
    [-1,1].forEach(sign=>box(room,sign*(w/4+.7),h/2,d/2,w/2-1.4,h,.12,'#d7e7e5'));
    box(room,0,(h+2.5)/2,d/2,2.8,h-2.5,.12,'#d7e7e5');
    addDoor(0,d/2-.06,0,2.7,true);
    for(let x=-w/2+4;x<w/2;x+=8)for(let z=-d/2+4;z<d/2;z+=10)box(room,x,h-.1,z,2,.08,.8,'#eff9f8',{e:1});
    for(let z=-d/2+5;z<d/2-3;z+=8) {
      [-1,1].forEach(sign=>{box(room,sign*(w/2-.08),h*.6,z,.03,1.8,4,'#99d7e9',{e:.65,pat:3});box(room,sign*(w/2-.12),h*.6,z,.06,1.8,.06,'#eff9f8');});
    }
  }
  function buildCorridor() {
    Object.assign(ROOM,{x0:-6,x1:6,z0:-820,z1:15,h:4});
    box(room,0,-.05,-402,12,.1,834,'#d7e7e5');box(room,0,4,-402,12,.1,834,'#eff9f8',{pat:2});
    for(let z=8;z>-820;z-=6) {
      box(room,0,3.9,z,4,.1,.4,'#eff9f8',{e:1});
      [-1,1].forEach(sign=>box(room,sign*5.8,2,z,.16,4,3,'#287f88'));
      box(room,0,.012,z,1.2,.01,3,'#e6b644');
    }
    schoolRooms.forEach(r=> {
      const door=addDoor(r.x,r.z,Math.PI/2,2.4,false,r);door.label=r.name;
      const frame=makeGroup(r.x,r.z,Math.PI/2);box(frame,0,2.9,0,2.4,.45,.08,r.type==='classroom'?'#e6b644':r.type==='gym'?'#d45958':'#99d7e9');
    });
    box(room,0,2,15,12,4,.1,'#287f88');
  }
  function buildScenario() {
    objects.length=0;groups.length=0;obstacles.length=0;classmates.length=0;chairs.length=0;
    doors.length=0;balls.length=0;hoops.length=0;projectiles.length=0;heldPerson=null;travel=null;
    teacher=null;groups.push(room);room.shakeX=room.shakeZ=0;
    Object.assign(ROOM,{x0:-7,x1:7,z0:-9,z1:9,h:3.2});
    if(selectedScenario==='school') {buildCorridor();return;}
    if(selectedScenario==='classroom') {buildClassroom();buildTeacherDesk();buildCharacters();return;}
    if(selectedScenario==='gym'||selectedScenario==='library') shell(44.272,56.92,selectedScenario==='gym'?9:5);
    else if(selectedScenario==='bathroom')shell(14,18,3.2);
    else {
      const side=Math.sqrt(14*18*100000);
      Object.assign(ROOM,{x0:-side/2,x1:side/2,z0:-side/2,z1:side/2,h:100});
      box(room,0,-.12,0,side,.2,side,'#74b080');
      box(room,-35,.01,-16,16,.04,120,'#d7e7e5');
      box(room,0,5,-38,70,10,1,'#d7e7e5');
      for(let x=-30;x<=30;x+=6)box(room,x,5,-37.45,3,2,.08,'#99d7e9',{e:.5,pat:3});
      addDoor(-35,-37,0,2.7,true);
      basketballCourt(0,-10);soccerField(95,10);playground();
      for(let i=0;i<80;i++) {const a=i*2.4,x=Math.cos(a)*(180+i*6),z=Math.sin(a)*(180+i*6);
        box(room,x,2,z,.5,4,.5,'#8a5a34');box(room,x,5,z,4,4,4,'#3f9567');}
      for(let i=0;i<20;i++) {box(room,-44,1.3,i*12-35,.12,2.6,6,'#287f88');}
    }
    if(selectedScenario==='gym') {
      basketballCourt(0,0);
      [-18,18].forEach(x=>{for(let i=0;i<4;i++)solid(x, .3+i*.4, -10+i*1.2,4,.4,1,'#287f88');});
      for(let i=0;i<8;i++) {box(room,-21.9,2,-20+i*5,.08,1.4,2.5,i%2?'#e6b644':'#d45958');}
    } else if(selectedScenario==='library') {
      for(let x=-17;x<=17;x+=8)for(let z=-20;z<=12;z+=8) {
        solid(x,1.4,z,1.2,2.8,4,'#8a5a34');
        [.45,1.05,1.65,2.25].forEach(y=>{for(let i=0;i<14;i++)box(room,x+.64,y,z-1.8+i*.27,.09,.35+(i%3)*.06,.21,['#d45958','#287f88','#e6b644','#99d7e9'][i%4]);});
      }
      [-10,0,10].forEach(x=>table(x,21));
    } else if(selectedScenario==='bathroom') {
      [-5,-2,1,4].forEach(x=> {
        solid(x-1.35,1.2,-6,.1,2.4,5,'#287f88');
        // Stalls have independent hinges and physical collision, not painted doors.
        addDoor(x,-3.5,0,2.6);
        solid(x,.38,-7,.65,.45,.85,'#eff9f8');box(room,x,.8,-7.4,.65,.9,.25,'#eff9f8');
        box(room,x,.63,-7,.5,.05,.7,'#394b56');box(room,x,.66,-7,.36,.025,.48,'#eff9f8');
        box(room,x-1.27,.85,-6.6,.15,.2,.2,'#eff9f8');
      });
      solid(5.35,1.2,-6,.1,2.4,5,'#287f88');
      [-2,1,4].forEach(z=> {solid(6,.85,z,1.4,.2,1.1,'#eff9f8');box(room,6.9,1.7,z,.04,1.1,1.1,'#99d7e9',{e:.45});box(room,6,.98,z,.06,.2,.06,'#394b56');});
    }
    if(selectedScenario!=='bathroom') [[-3,-1],[3,2],[-2,-6]].forEach((p,i)=> {
      const g=makeGroup(p[0],p[1],0);g.phase=i;g.person=true;classmates.push(g);
      buildPerson(g,['#d45958','#287f88','#e6b644'][i],'#394b56','#e0ac69','#5a3a22',false);
    });
  }


  // =====================================================================
  // Player
  // =====================================================================
  const PLAYER = { RADIUS: 0.3, WALK: 3.0, CROUCH_SPEED: 1.3, EYE: 1.6, CROUCH_EYE: 0.6 };
  const player = { height:0, x: 0, z: 8, yaw: 0, pitch: 0, eye: PLAYER.EYE, crouch: false };

  function resetPlayer() {
    player.x = selectedScenario==='recess'?-14:selectedScenario==='gym'?-7:0; player.z = selectedScenario==='school'?8:selectedScenario==='gym'||selectedScenario==='library'?24:8; player.yaw=selectedScenario==='recess'?-.7:0; player.pitch=selectedScenario==='classroom'?-.46:0;player.height=0;
    player.eye = PLAYER.EYE; player.crouch = false;
  }

  function blocked(x, z) {
    const r = PLAYER.RADIUS;
    if (x-r<ROOM.x0 || x+r>ROOM.x1 || z-r<ROOM.z0 || z+r>ROOM.z1) return true;
    for(const d of doors) if(!d.open) {
      const sideways=Math.abs(Math.sin(d.yaw))>.5;
      if(sideways ? Math.abs(x-d.x)<r+.08 && Math.abs(z-d.z)<d.width/2+r : Math.abs(z-d.z)<r+.08 && Math.abs(x-d.x)<d.width/2+r) return true;
    }
    for (const c of chairs) {
      if(c.y>.8)continue;
      if (x + r > c.x-.25 && x-r < c.x+.25 && z+r > c.z-.25 && z-r < c.z+.25) return true;
    }
    for (const o of obstacles) {
      if (o.low && player.crouch) continue; // crouching lets you get under desks
      if (x + r > o.x0 && x - r < o.x1 && z + r > o.z0 && z - r < o.z1) return true;
    }
    return false;
  }

  function underDesk() {
    return obstacles.some(o => o.low && player.x > o.x0 - 0.1 && player.x < o.x1 + 0.1 && player.z > o.z0 - 0.15 && player.z < o.z1 + 0.15);
  }
  function nearDesk() {
    return obstacles.some(o => o.low && player.x > o.x0 - 0.9 && player.x < o.x1 + 0.9 && player.z > o.z0 - 0.9 && player.z < o.z1 + 0.9);
  }

  function updatePlayer(dt) {
    if(travel) {
      travel.t=Math.min(1,travel.t+dt/travel.duration);
      const t=travel.t;player.x=travel.x;player.z=travel.z0+(travel.z1-travel.z0)*t;
      player.height=travel.h0+(travel.h1-travel.h0)*t;player.eye=player.height+PLAYER.EYE;
      if(t===1)travel=null;
      return;
    }
    let f = 0, s = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1;
    if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) s += 1;
    if (keys.KeyA || keys.ArrowLeft) s -= 1;
    const len = Math.hypot(f, s);
    if (len > 0) {
      f /= len; s /= len;
      const speed = player.crouch ? PLAYER.CROUCH_SPEED : (keys.ShiftLeft||keys.ShiftRight) ? 12 : PLAYER.WALK;
      const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
      const dx = (-sy * f + cy * s) * speed * dt;
      const dz = (-cy * f - sy * s) * speed * dt;
      if (!blocked(player.x + dx, player.z)) player.x += dx;
      if (!blocked(player.x, player.z + dz)) player.z += dz;
    }
    if(selectedScenario==='recess' && Math.abs(player.x-25)<1.2 && player.z>=19.2 && player.z<=25.4)player.height=Math.max(0,(25.4-player.z)/6.2*4.5);
    else if(selectedScenario==='recess'&&player.height>0&&Math.abs(player.x-25)<3.2&&player.z>=12.5&&player.z<=19.2)player.height=4.5;
    else player.height=0;
    checkExits();
    const target = player.height+(player.crouch ? PLAYER.CROUCH_EYE : PLAYER.EYE);
    player.eye += (target - player.eye) * (1 - Math.exp(-10 * dt));
  }

  function setCrouch(on) {
    if (on) { player.crouch = true; return; }
    // only stand up if there's room (not under a desk)
    player.crouch = false;
    if (blocked(player.x, player.z)) player.crouch = true;
  }

  // =====================================================================
  // Controls
  // =====================================================================
  const keys = {};
  let dragging = false, lastMX = 0, lastMY = 0;
  // Ray-box picking checks the visible geometry, so furniture/walls occlude chairs.
  function rayBox(origin, direction, min, max) {
    let near = 0, far = 3.5;
    for (let i=0;i<3;i++) {
      if (Math.abs(direction[i]) < 1e-7) { if(origin[i]<min[i] || origin[i]>max[i]) return null; }
      else {
        let a=(min[i]-origin[i])/direction[i], b=(max[i]-origin[i])/direction[i];
        if(a>b) [a,b]=[b,a]; near=Math.max(near,a); far=Math.min(far,b);
        if(near>far) return null;
      }
    }
    return near;
  }
  function aimedObject() {
    let closest=3.5, hit=null;
    const cp=Math.cos(player.pitch), dir=[-Math.sin(player.yaw)*cp,Math.sin(player.pitch),-Math.cos(player.yaw)*cp];
    for(const o of objects) {
      if(o.a<1) continue;
      const g=o.g,c=Math.cos(g.yaw),sn=Math.sin(g.yaw), dx=player.x-g.x, dz=player.z-g.z;
      const origin=[c*dx-sn*dz,player.eye-g.y,sn*dx+c*dz];
      const direction=[c*dir[0]-sn*dir[2],dir[1],sn*dir[0]+c*dir[2]];
      const distance=rayBox(origin,direction,o.p.map((v,i)=>v-o.s[i]/2),o.p.map((v,i)=>v+o.s[i]/2));
      if(distance!==null && distance<closest) {closest=distance;hit=g;}
    }
    return hit;
  }
  function aimedChair() {const g=aimedObject();return g&&g.chair?g:null;}
  function releaseChair() { if(heldPerson && !projectiles.some(p=>p.g===heldPerson))heldPerson.y=0; heldPerson=null;heldChair=null;leftHeld=false;dragging=false; }
  function canThrow() {return mode==='roam' && ['classroom','recess'].includes(selectedScenario);}
  function closestDoor() {
    const hit=aimedObject();
    if(hit&&hit.door)return doors.find(d=>d.g===hit)||null;
    return doors.find(d=>Math.hypot(d.x-player.x,d.z-player.z)<2.6)||null;
  }
  function freezeExit() {
    releaseChair();stopRumble();releaseLock();paused=false;state='caught';quakeIntensity=0;
    document.getElementById('caught').classList.remove('hidden');ui.hud.classList.add('hidden');
    for(const k in keys)keys[k]=false;
  }
  function leaveRoom(d) {
    if(mode==='drill'&&['classroom','gym','library'].includes(selectedScenario)) {freezeExit();return;}
    if(!schoolMode)return;
    if(d.destination) {
      corridorReturn={x:d.x>0?3:-3,z:d.z};currentRoom=d.destination;
      selectedScenario=d.destination.type;releaseChair();buildScenario();resetPlayer();
      if(selectedScenario==='classroom'){player.x=5.5;player.z=-7.2;player.yaw=Math.PI/2;}
    }else {
      selectedScenario='school';currentRoom=null;releaseChair();buildScenario();resetPlayer();
      if(corridorReturn){player.x=corridorReturn.x;player.z=corridorReturn.z;}
    }
    updateLocation();
  }
  function checkExits() {
    for(const d of doors)if(d.open && (d.exit||d.destination)) {
      const side=Math.abs(Math.sin(d.yaw))>.5;
      if(side ? Math.abs(player.x-d.x)<.55 && Math.abs(player.z-d.z)<d.width/2 : Math.abs(player.z-d.z)<.55 && Math.abs(player.x-d.x)<d.width/2) {leaveRoom(d);return;}
    }
  }
  function interact() {
    if(!isPlaying())return;
    if(selectedScenario==='recess'&&Math.abs(player.x-25)<3 && Math.abs(player.z-24)<3) {
      travel={t:0,duration:2.5,x:25,z0:player.z,z1:16,h0:player.height,h1:4.5};return;
    }
    if(selectedScenario==='recess'&&player.height>3 && Math.abs(player.x-25)<3 && player.z<17) {
      travel={t:0,duration:2,x:25,z0:12.8,z1:-2,h0:4.5,h1:0};return;
    }
    const d=closestDoor();if(d) {
      if(d.open&&(d.exit||d.destination)){leaveRoom(d);return;}
      d.open=!d.open;d.g.yaw=d.yaw+(d.open?Math.PI/2:0);
      d.g.x=d.x+(d.open?Math.cos(d.yaw)*d.width/2:0);d.g.z=d.z-(d.open?Math.sin(d.yaw)*d.width/2:0);
    }
  }
  function throwHeld() {
    if(!isPlaying()||!canThrow())return;
    const g=heldChair||heldPerson;if(!g)return;
    g.y=Math.max(g.y,player.eye-.4);projectiles.push({g,vx:-Math.sin(player.yaw)*18,vy:8+Math.sin(player.pitch)*12,vz:-Math.cos(player.yaw)*18,age:0,person:Boolean(g.person),homeX:g.bx,homeZ:g.bz});
    heldChair=null;heldPerson=null;leftHeld=false;
  }
  function shootBall() {
    if(!isPlaying()||!['gym','recess'].includes(selectedScenario))return;
    const g=balls.find(b=>!projectiles.some(p=>p.g===b)&&Math.hypot(b.x-player.x,b.z-player.z)<3.5);if(!g)return;
    const cp=Math.cos(player.pitch);g.x=player.x;g.z=player.z;g.y=player.eye-.2;
    projectiles.push({g,vx:-Math.sin(player.yaw)*cp*12,vy:5+Math.sin(player.pitch)*12,vz:-Math.cos(player.yaw)*cp*12,age:0,ball:true,scored:false});
  }
  function updateActivities(dt) {
    if(heldPerson) {heldPerson.x=player.x-Math.sin(player.yaw)*1.6;heldPerson.z=player.z-Math.cos(player.yaw)*1.6;heldPerson.y=player.eye-.8;}
    for(let i=projectiles.length-1;i>=0;i--) {
      const p=projectiles[i],g=p.g,prevY=g.y;p.age+=dt;p.vy-=9.8*dt;
      g.x+=p.vx*dt;g.z+=p.vz*dt;g.y+=p.vy*dt;g.yaw+=dt*2;
      if(p.ball && !p.scored && p.vy<0)for(const h of hoops)if(prevY>=h.y&&g.y<h.y&&Math.hypot(g.x-h.x,g.z-h.z)<.38){score+=2;p.scored=true;}
      if(g.y<(p.ball?.25:0)) {g.y=p.ball?.25:0;p.vy=Math.abs(p.vy)*.5;p.vx*=.6;p.vz*=.6;}
      if(p.person&&p.age>3) {g.x=p.homeX;g.z=p.homeZ;g.y=0;projectiles.splice(i,1);}
      else if(!p.person&&p.age>8){g.bx=g.x;g.bz=g.z;projectiles.splice(i,1);if(p.ball&&Math.hypot(g.x-player.x,g.z-player.z)>30){g.x=player.x;g.z=player.z-2;}}
    }
  }
  function updateLocation() {document.getElementById('locationLabel').textContent=(currentRoom?currentRoom.name:selectedScenario==='school'?'School • Main Hall':scenarios[selectedScenario].name).toUpperCase();}

  function chairBlocked(chair,x,z) {
    const r=.23;
    if(x-r<ROOM.x0 || x+r>ROOM.x1 || z-r<ROOM.z0 || z+r>ROOM.z1) return true;
    if(Math.hypot(x-player.x,z-player.z)<.58) return true;
    return obstacles.some(o=>x+r>o.x0 && x-r<o.x1 && z+r>o.z0 && z-r<o.z1) || chairs.some(c=>c!==chair && Math.abs(c.x-x)<.52 && Math.abs(c.z-z)<.52);
  }
  function updateChair(dt) {
    if(!leftHeld || !heldChair) return;
    const x=player.x-Math.sin(player.yaw)*holdDistance, z=player.z-Math.cos(player.yaw)*holdDistance;
    const blend=1-Math.exp(-12*dt), nx=heldChair.x+(x-heldChair.x)*blend, nz=heldChair.z+(z-heldChair.z)*blend;
    if(!chairBlocked(heldChair,nx,heldChair.z)) heldChair.x=nx;
    if(!chairBlocked(heldChair,heldChair.x,nz)) heldChair.z=nz;
    heldChair.bx=heldChair.x; heldChair.bz=heldChair.z;
  }


  window.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (e.code === 'KeyC' && !e.repeat && isPlaying()) setCrouch(!player.crouch);
    if(e.code==='KeyE'&&!e.repeat)interact();
    if(e.code==='KeyQ'&&!e.repeat)throwHeld();
    if(e.code==='Space'&&!e.repeat)shootBall();
    if(e.code==='KeyM'&&!e.repeat&&isPlaying()&&schoolMode){pauseGame();document.getElementById('campusNav').classList.remove('hidden');}
    if (e.code === 'KeyR' && isPlaying()) startGame();
    if (e.code === 'Escape' && !e.repeat) { if(!document.getElementById('settings').classList.contains('hidden')) closeSettings(); else if(paused) resumeGame(); else if(isPlaying()) pauseGame(); }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; releaseChair(); if(isPlaying()) pauseGame(); });

  function look(dx, dy) {
    player.yaw -= dx * .0025 * settings.sensitivity;
    player.pitch = Math.max(-1.4, Math.min(1.4, player.pitch - dy * .0025 * settings.sensitivity));
  }
  document.addEventListener('mousemove', e => {
    if (!isPlaying()) return;
    if (document.pointerLockElement === canvas) look(e.movementX || 0, e.movementY || 0);
    else if (dragging) { look(e.clientX - lastMX, e.clientY - lastMY); lastMX = e.clientX; lastMY = e.clientY; }
  });
  canvas.addEventListener('mousedown', e => {
    if (!isPlaying() || e.button !== 0) return;
    leftHeld = true; heldChair = aimedChair();
    const hit=aimedObject();if(!heldChair&&canThrow()&&hit&&hit.person)heldPerson=hit;
    if(heldChair) holdDistance = Math.hypot(heldChair.x-player.x,heldChair.z-player.z);
    dragging = true; lastMX = e.clientX; lastMY = e.clientY;
    requestLock();
  });
  window.addEventListener('mouseup', () => { releaseChair(); });
  canvas.addEventListener('contextmenu', e=>{e.preventDefault();throwHeld();});

  function requestLock() {
    try {
      const p = canvas.requestPointerLock && canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (err) { /* drag-to-look fallback stays active */ }
  }
  function releaseLock() {
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  }

  // =====================================================================
  // Camera
  // =====================================================================
  const proj = new Float32Array(16), view = new Float32Array(16), model = new Float32Array(16);

  function perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out.fill(0);
    out[0] = f / aspect; out[5] = f; out[10] = (far + near) * nf; out[11] = -1; out[14] = 2 * far * near * nf;
  }
  function lookAt(out, ex, ey, ez, fx, fy, fz) {
    // forward f is normalized; right = f x up, up' = r x f
    let rx = -fz, ry = 0, rz = fx;
    const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
    out[0] = rx; out[1] = ux; out[2] = -fx; out[3] = 0;
    out[4] = ry; out[5] = uy; out[6] = -fy; out[7] = 0;
    out[8] = rz; out[9] = uz; out[10] = -fz; out[11] = 0;
    out[12] = -(rx * ex + ry * ey + rz * ez);
    out[13] = -(ux * ex + uy * ey + uz * ez);
    out[14] = fx * ex + fy * ey + fz * ez;
    out[15] = 1;
  }
  function updateCamera(time) {
    const q = settings.cameraShake ? quakeIntensity : 0;
    const jx = q * 0.06 * (Math.sin(time * 37) + Math.sin(time * 23.1) * 0.6);
    const jy = q * 0.04 * Math.sin(time * 41.3);
    const jz = q * 0.06 * Math.sin(time * 29.7 + 1.3);
    const yaw = player.yaw + q * 0.015 * Math.sin(time * 31);
    const pitch = player.pitch + q * 0.015 * Math.sin(time * 27);
    const cp = Math.cos(pitch);
    lookAt(view, player.x + jx, player.eye + jy, player.z + jz, -Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    perspective(proj, settings.fov * Math.PI / 180, canvas.width / canvas.height, 0.05, 1800);
  }
  window.addEventListener('resize', resize);
  resize();

  // =====================================================================
  // Earthquake
  // =====================================================================
  const QUAKE = { CLASS_TIME: 5, DURATION: 10, CALM_TIME: 4 };
  let quakeIntensity = 0;
  let audio = null;

  function startRumble() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audio) audio = { ctx: new AC() };
      const ctx = audio.ctx;
      if (ctx.state === 'suspended') ctx.resume();
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
      const gain = ctx.createGain(); gain.gain.value = 0;
      src.connect(lp); lp.connect(gain); gain.connect(ctx.destination);
      src.start();
      audio.src = src; audio.gain = gain;
    } catch (err) { audio = null; }
  }
  function setRumble(v) { if (audio && audio.gain) audio.gain.gain.setTargetAtTime(v * settings.volume, audio.ctx.currentTime, 0.1); }
  function stopRumble() {
    if (audio && audio.src) { try { audio.src.stop(); } catch (err) { /* already stopped */ } audio.src = null; audio.gain = null; }
  }

  function updateQuake(time) {
    if (state === 'quake') {
      const t = stateTime;
      const env = Math.min(1, t / 1.2) * Math.min(1, (QUAKE.DURATION - t) / 1.5);
      quakeIntensity = Math.max(0, env) * (0.8 + 0.2 * Math.sin(t * 3));
    } else {
      quakeIntensity = Math.max(0, quakeIntensity - 0.05);
    }
    setRumble(quakeIntensity);

    const q = quakeIntensity;
    // furniture/room jitter
    for (const g of groups) {
      if (g === teacher || classmates.includes(g)) continue;
      g.shakeX = q * 0.025 * Math.sin(time * 33 + g.bx);
      g.shakeZ = q * 0.025 * Math.sin(time * 28 + g.bz);
    }
    // classmates: shake and duck down
    const duck = state === 'quake' ? Math.min(1, Math.max(0, (stateTime - 1) / 0.8)) : (state === 'calm' ? Math.max(0, 1 - stateTime / 2) : 0);
    classmates.forEach(c => {
      c.shakeX = q * 0.06 * Math.sin(time * 30 + c.phase);
      c.shakeZ = q * 0.05 * Math.sin(time * 26 + c.phase * 2);
      if(heldPerson===c||projectiles.some(p=>p.g===c))return;
      if(selectedScenario==='classroom') {
        c.x=c.bx+(c.coverX-c.bx)*duck;c.z=c.bz+(c.coverZ-c.bz)*duck;c.y=-.82*duck;
      }else c.y=-.28*duck;
      c.tags.arm = [0, 0.35 * duck, 0.1 * duck];
      c.tags.head = [0, -0.05 * duck + 0.01 * Math.sin(time * 2 + c.phase), -0.12 * duck];
    });
    // teacher: gestures during class, crouches and covers head during the quake
    if (teacher) {
      const tDuck = state === 'quake' ? Math.min(1, stateTime / 0.6) : duck;
      teacher.shakeX = q * 0.05 * Math.sin(time * 34);
      teacher.x=teacher.bx+(teacher.coverX-teacher.bx)*tDuck;teacher.z=teacher.bz+(teacher.coverZ-teacher.bz)*tDuck;teacher.y=-1.3*tDuck;
      teacher.tags.legs = [0, 0.45 * tDuck, 0];
      const g = state === 'class' || state === 'menu' ? Math.max(0, Math.sin(time * 2.2)) : 0;
      teacher.tags.armR = [0, 0.35 * g + 0.6 * tDuck, -0.15 * g];
      teacher.tags.armL = [0, 0.6 * tDuck, 0];
      teacher.tags.head = [0, -0.1 * tDuck, 0];
      teacher.yaw = Math.PI + (state === 'class' ? 0.35 * Math.sin(time * 0.8) : 0);
    }
  }

  // =====================================================================
  // Game states
  // =====================================================================
  let state = 'menu';
  let stateTime = 0;
  function isPlaying() { return !paused && (state === 'class' || state === 'quake' || state === 'calm' || state==='roam'); }

  function setState(s) {
    state = s; stateTime = 0;
    if (s === 'quake') startRumble();
    if (s === 'calm') stopRumble();
    if (s === 'complete') {
      releaseChair();
      stopRumble();
      releaseLock();
      ui.complete.classList.remove('hidden');
      ui.hud.classList.add('hidden');
    }
  }

  function startGame() {
    paused=false;releaseChair();score=0;schoolMode=selectedScenario==='school'||schoolMode;
    if(schoolMode)selectedScenario='school';currentRoom=null;buildScenario();resetPlayer();
    document.getElementById('caught').classList.add('hidden');
    document.getElementById('campusNav').classList.add('hidden');
    document.getElementById('pause').classList.add('hidden');
    document.getElementById('settings').classList.add('hidden');
    updateLocation();
    for (const k in keys) keys[k] = false;
    quakeIntensity = 0;
    stopRumble();
    ui.menu.classList.add('hidden');
    ui.complete.classList.add('hidden');
    ui.hud.classList.remove('hidden');
    setState(mode==='roam'?'roam':'class');
  }

  function updateGame(dt) {
    stateTime += dt;
    if (state === 'class' && stateTime >= QUAKE.CLASS_TIME) setState('quake');
    else if (state === 'quake' && stateTime >= QUAKE.DURATION) setState('calm');
    else if (state === 'calm' && stateTime >= QUAKE.CALM_TIME) setState('complete');
  }

  function pauseGame() {
    if(!isPlaying()) return;
    paused=true; releaseChair(); releaseLock(); setRumble(0);
    for(const k in keys) keys[k]=false;
    document.getElementById('pauseLocation').textContent=currentRoom?currentRoom.name:selectedScenario==='school'?'School':scenarios[selectedScenario].name;
    document.getElementById('pause').classList.remove('hidden');
    ui.hud.classList.add('hidden');
  }
  function resumeGame() {
    paused=false; document.getElementById('campusNav').classList.add('hidden');document.getElementById('pause').classList.add('hidden'); ui.hud.classList.remove('hidden');
  }
  function mainMenu() {
    paused=false; state='menu'; stateTime=0; quakeIntensity=0; releaseChair(); releaseLock(); stopRumble();
    ['pause','settings','complete','hud','caught','campusNav'].forEach(id=>document.getElementById(id).classList.add('hidden'));
    ui.menu.classList.remove('hidden'); if(selectedScenario==='school')selectedScenario='classroom';schoolMode=false;resetPlayer();
  }
  function openSettings(from) {
    settingsFrom=from;
    document.getElementById(from).classList.add('hidden');
    document.getElementById('settings').classList.remove('hidden');
  }
  function closeSettings() {
    document.getElementById('settings').classList.add('hidden');
    document.getElementById(settingsFrom).classList.remove('hidden');
  }
  function syncSettings() {
    document.getElementById('sensitivity').value=settings.sensitivity;
    document.getElementById('volume').value=Math.round(settings.volume*100);
    document.getElementById('fov').value=settings.fov;
    document.getElementById('cameraShake').checked=settings.cameraShake;
    document.getElementById('sensitivityValue').textContent=settings.sensitivity.toFixed(1)+'×';
    document.getElementById('volumeValue').textContent=Math.round(settings.volume*100)+'%';
    document.getElementById('fovValue').textContent=settings.fov+'°'; resize();
  }
  document.querySelectorAll('[data-scenario]').forEach(btn=>btn.addEventListener('click',()=> {
    selectedScenario=btn.dataset.scenario;schoolMode=false;
    document.querySelectorAll('[data-scenario]').forEach(b=> { const on=b===btn; b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on)); });
    document.getElementById('scenarioDescription').textContent=scenarios[selectedScenario].description;
    ROOM.h=3.2; buildScenario(); resetPlayer();
  }));
  document.getElementById('pauseBtn').addEventListener('click',pauseGame);
  document.getElementById('resumeBtn').addEventListener('click',resumeGame);
  document.getElementById('restartBtn').addEventListener('click',startGame);
  ['mainMenuBtn','completeMenuBtn'].forEach(id=>document.getElementById(id).addEventListener('click',mainMenu));
  document.getElementById('settingsBtn').addEventListener('click',()=>openSettings('menu'));
  document.getElementById('pauseSettingsBtn').addEventListener('click',()=>openSettings('pause'));
  document.getElementById('settingsBackBtn').addEventListener('click',closeSettings);
  document.getElementById('resetSettingsBtn').addEventListener('click',()=> { Object.assign(settings,{sensitivity:1,volume:.6,fov:72,cameraShake:true});syncSettings(); });
  ['sensitivity','volume','fov'].forEach(id=>document.getElementById(id).addEventListener('input',e=> {
    settings[id]=Number(e.target.value)/(id==='volume'?100:1);syncSettings();
  }));
  document.getElementById('cameraShake').addEventListener('change',e=>settings.cameraShake=e.target.checked);

  ui.start.addEventListener('click', () => {mode='drill';schoolMode=false;startRumbleUnlock();startGame();});
  document.getElementById('roamBtn').addEventListener('click',()=>{mode='roam';schoolMode=false;startGame();});
  document.getElementById('schoolBtn').addEventListener('click',()=>{mode='roam';schoolMode=true;selectedScenario='school';startGame();});
  document.getElementById('caughtAgainBtn').addEventListener('click',startGame);
  document.getElementById('caughtMenuBtn').addEventListener('click',mainMenu);
  document.getElementById('campusCloseBtn').addEventListener('click',resumeGame);
  document.getElementById('campusBtn').addEventListener('click',()=>{pauseGame();document.getElementById('campusNav').classList.remove('hidden');});
  const destinations=document.getElementById('destinations');
  schoolRooms.forEach(r=> {const b=document.createElement('button');b.type='button';b.textContent=r.name;b.addEventListener('click',()=> {
    currentRoom=r;corridorReturn={x:r.x>0?3:-3,z:r.z};selectedScenario=r.type;releaseChair();buildScenario();resetPlayer();updateLocation();resumeGame();
  });destinations.appendChild(b);});

  ui.again.addEventListener('click', () => { startGame(); });
  function startRumbleUnlock() {
    // Create/resume the audio context during a user gesture so rumble can play later.
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC && !audio) audio = { ctx: new AC() };
      if (audio && audio.ctx.state === 'suspended') audio.ctx.resume();
    } catch (err) { audio = null; }
  }

  // =====================================================================
  // UI
  // =====================================================================
  let lastUI = '';
  function updateUI() {
    let status = 'READY', statusCls = '', msg = '', msgCls = '', hint = '';
    if(state==='roam'){status=schoolMode?'SCHOOL FREE ROAM':'';hint=['gym','recess'].includes(selectedScenario)?'BASKETS '+score:'';}
    else if (state === 'class') {
      status = scenarios[selectedScenario].name.toUpperCase();
      msg = scenarios[selectedScenario].intro;
    } else if (state === 'quake') {
      if (player.crouch) {
        status = 'TAKE COVER'; statusCls = 'cover';
        msg = 'GOOD! STAY LOW AND TRY NOT TO DIE'; msgCls = 'good';
        hint = selectedScenario === 'recess' ? 'Stay in the open. Protect your self' : ['gym','bathroom'].includes(selectedScenario) ? '.' : underDesk() ? 'Stay under that desk to survive' : (nearDesk() ? 'Crawl under the desk for extra protection.' : 'Stay low and move toward a desk.');
      } else {
        status = 'EARTHQUAKE'; statusCls = 'quake';
        msg = 'EARTHQUAKE! DROP, COVER, AND HOLD ON!'; msgCls = 'alert';
        hint = ['gym','bathroom','recess'].includes(selectedScenario) ? 'Drop low and protect your head.' : 'Press C to crouch, then get under a desk.';
      }
    } else if (state === 'calm') {
      status = 'CALM'; statusCls = 'calm';
      msg = 'The shaking stopped. Stay calm and wait for Mr.BOB.';
    }
    const target=isPlaying()?aimedObject():null,d=isPlaying()?closestDoor():null;
    const prompt=heldPerson?'Q / RIGHT CLICK — THROW CLASSMATE':heldChair?(canThrow()?'Q / RIGHT CLICK — THROW CHAIR':'MOVING CHAIR — RELEASE TO DROP'):d?(d.open?(d.exit||d.destination?'E — ENTER / EXIT':'E — CLOSE STALL'):'E — OPEN '+(d.label||'DOOR')):target&&target.chair?'HOLD LEFT CLICK — MOVE CHAIR':target&&target.person&&canThrow()?'HOLD LEFT CLICK — PICK UP CLASSMATE':balls.some(b=>Math.hypot(b.x-player.x,b.z-player.z)<3.5)?'SPACE — SHOOT BASKETBALL':selectedScenario==='recess'&&Math.abs(player.x-25)<3&&Math.abs(player.z-24)<3?'E — CLIMB PLAYGROUND':selectedScenario==='recess'&&player.height>3&&player.z<17?'E — SLIDE':'';
    document.getElementById('interaction').textContent=prompt;
    document.querySelector('.crosshair').classList.toggle('target',Boolean(prompt));
    document.getElementById('campusBtn').classList.toggle('hidden',!schoolMode);
    const key = status + msg + hint;
    if (key === lastUI) return;
    lastUI = key;
    ui.status.textContent = status;
    ui.status.className = 'status ' + statusCls;
    ui.message.textContent = msg;
    ui.message.className = 'message ' + msgCls + (msg ? ' show' : '');
    ui.hint.textContent = hint;
  }

  // =====================================================================
  // Rendering
  // =====================================================================
  function drawObject(o) {
    const g=o.g;
    if(Math.abs(g.x+o.p[0]-player.x)>190 && o.s[0]<190)return;
    if(Math.abs(g.z+o.p[2]-player.z)>190 && o.s[2]<190)return;
    const mesh=o.sphere?meshes.sphere:meshes.cube;
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.vb);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.ib);gl.vertexAttribPointer(aPos,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(aNor,3,gl.FLOAT,false,24,12);
    const c=Math.cos(g.yaw),s=Math.sin(g.yaw);
    let px = o.p[0], py = o.p[1], pz = o.p[2];
    if (o.tag && g.tags[o.tag]) { const t = g.tags[o.tag]; px += t[0]; py += t[1]; pz += t[2]; }
    const tx = g.x + g.shakeX + c * px + s * pz;
    const ty = g.y + g.shakeY + py;
    const tz = g.z + g.shakeZ - s * px + c * pz;
    const sx = o.s[0], sy = o.s[1], sz = o.s[2];
    model[0] = c * sx; model[1] = 0; model[2] = -s * sx; model[3] = 0;
    model[4] = 0; model[5] = sy; model[6] = 0; model[7] = 0;
    model[8] = s * sz; model[9] = 0; model[10] = c * sz; model[11] = 0;
    model[12] = tx; model[13] = o.tag === null && o.a < 1 ? 0.012 : ty; model[14] = tz; model[15] = 1;
    gl.uniformMatrix4fv(loc.uModel, false, model);
    gl.uniform1f(loc.uYaw, g.yaw);
    gl.uniform3fv(loc.uColor, o.c);
    gl.uniform1f(loc.uEmis, o.e);
    gl.uniform1f(loc.uAlpha, o.a);
    gl.uniform1f(loc.uPat, o.pat);
    gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_SHORT,0);
  }

  function render(time) {
    gl.clearColor(0.65, 0.84, 0.92, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    updateCamera(time);
    gl.uniformMatrix4fv(loc.uProj, false, proj);
    gl.uniformMatrix4fv(loc.uView, false, view);
    for (const o of objects) if (o.a >= 1) drawObject(o);
    gl.enable(gl.BLEND); gl.depthMask(false);
    for (const o of objects) if (o.a < 1) drawObject(o);
    gl.disable(gl.BLEND); gl.depthMask(true);
  }

  // Main loop
  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    const time = now / 1000;
    if (isPlaying()) {
      updateGame(dt);
      if(isPlaying()){updatePlayer(dt);if(isPlaying()){updateChair(dt);updateActivities(dt);}}
    }
    {
      if(!paused && state!=='menu' && state!=='caught')updateQuake(time);
      render(time);
      updateUI();
    }
    requestAnimationFrame(frame);
  }
  buildScenario(); resetPlayer(); syncSettings();
  requestAnimationFrame(frame);
})();
