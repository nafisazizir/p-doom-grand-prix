// GARAGE STARTUP: warm sunset, cardboard boxes, pizza, beanbags, whiteboard with a line going up and to the right.
import { THREE, toon, glow, G, mesh, group, textPanel } from '../toolkit.js';

const CARD = '#c99a5b', CARD_D = '#a87a3f';

function cardboardBox() {
  const g = group(mesh(G.rbox(2.2, 1.8, 2.2, 0.08), toon(CARD), 0, 0.9, 0));
  g.add(mesh(G.box(2.24, 0.25, 0.6), toon('#e8d7a8'), 0, 1.1, 0)); // tape
  const g2 = mesh(G.rbox(1.6, 1.3, 1.6, 0.08), toon(CARD_D), 0.2, 2.45, 0.1);
  g2.rotation.y = 0.4;
  g.add(g2);
  return g;
}
function pizzaStack() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const b = mesh(G.box(1.8, 0.22, 1.8), toon(i % 2 ? '#f2efe6' : '#e8e2d2'), (i % 2) * 0.12, 0.11 + i * 0.24, 0);
    b.rotation.y = i * 0.15;
    g.add(b);
  }
  const lid = mesh(G.box(1.8, 0.05, 1.8), toon('#f2efe6'), 0, 1.4, -0.7);
  lid.rotation.x = -1.1;
  g.add(lid);
  const slice = mesh(G.cone(0.7, 0.12, 3), toon('#ffb84a'), 0, 1.02, 0.2);
  slice.rotation.y = 0.5;
  g.add(slice);
  g.add(mesh(G.cyl(0.12, 0.12, 0.05, 10), toon('#d8452b'), 0.15, 1.1, 0.25));
  return g;
}
function beanbag(color) {
  const g = new THREE.Group();
  const b = mesh(G.sphere(1.2, 16), toon(color), 0, 0.8, 0);
  b.scale.set(1.2, 0.7, 1.1);
  g.add(b);
  return g;
}
function whiteboard() {
  const g = new THREE.Group();
  const pm = toon('#7a7f8c');
  g.add(mesh(G.box(0.2, 2.5, 0.2), pm, -1.8, 1.25, 0));
  g.add(mesh(G.box(0.2, 2.5, 0.2), pm, 1.8, 1.25, 0));
  g.add(mesh(G.rbox(4.6, 3.0, 0.2, 0.06), toon('#d0d4dc'), 0, 3.6, -0.05));
  const c = document.createElement('canvas');
  c.width = 512; c.height = 320;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 512, 320);
  x.strokeStyle = '#222'; x.lineWidth = 6;
  x.beginPath(); x.moveTo(50, 20); x.lineTo(50, 290); x.lineTo(490, 290); x.stroke();
  x.strokeStyle = '#e4387a'; x.lineWidth = 10; x.lineCap = 'round';
  x.beginPath(); x.moveTo(60, 270);
  for (let i = 0; i <= 40; i++) { const u = i / 40; x.lineTo(60 + u * 420, 270 - Math.pow(u, 4) * 260); }
  x.stroke();
  x.fillStyle = '#2244aa'; x.font = "bold 40px Fredoka, sans-serif";
  x.fillText('AGI', 410, 60);
  x.font = "bold 26px Fredoka, sans-serif";
  x.fillText('revenue (vibes)', 120, 250);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicMaterial({ map: tex });
  m.userData.outlineParameters = { visible: false };
  const p = new THREE.Mesh(G.plane(4.3, 2.7), m);
  p.position.set(0, 3.6, 0.07);
  g.add(p);
  return g;
}
function garageDoor() {
  // a little suburban garage with the door open, a desk + glowing monitor inside
  const g = new THREE.Group();
  g.add(mesh(G.box(7, 4.5, 6), toon('#f4e3c3'), 0, 2.25, -3));
  const roof = mesh(G.cone(5.4, 2.4, 4), toon('#b84a3a'), 0, 5.7, -3);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.85);
  g.add(roof);
  g.add(mesh(G.box(5.2, 3.4, 0.2), toon('#3a2c3f'), 0, 1.7, 0.02));
  g.add(mesh(G.box(5.2, 0.6, 0.3), toon('#e9e2d0'), 0, 3.6, 0.05)); // rolled-up door
  g.add(mesh(G.box(2.6, 0.15, 1.2), toon('#8a5a3a'), 0, 1.1, -0.6));
  g.add(mesh(G.box(1.4, 0.9, 0.12), toon('#222'), 0, 1.75, -0.9));
  g.add(mesh(G.box(1.2, 0.72, 0.05), glow('#7af7ff'), 0, 1.75, -0.82));
  return g;
}
function tutorialSign() {
  const g = new THREE.Group();
  const pm = toon('#5a4a6a');
  g.add(mesh(G.box(0.4, 8.5, 0.4), pm, -9, 4.25, 0));
  g.add(mesh(G.box(0.4, 8.5, 0.4), pm, 9, 4.25, 0));
  const p = textPanel(['HOLD THE WHEEL.', 'DRIVE THROUGH THE GPUS.', 'SAVE HUMANITY.'], { width: 17, height: 5, bg: '#ffe066', fg: '#2b1840', border: '#2b1840' });
  p.position.set(0, 9.5, 0);
  g.add(p);
  return g;
}

export default {
  id: 'garage',
  title: 'GARAGE STARTUP',
  subtitle: 'two founders, one GPU, zero safety team',
  night: false,
  palette: {
    skyTop: '#5b6cff', skyBottom: '#ffb26b', road: '#6b5b7a', ground: '#8fd17a', kerb: '#ffffff',
    accent1: '#ff6b8b', accent2: '#ffd23f',
  },
  spacing: 12,
  layout(zf, rng, sec) {
    const out = [];
    const rel = zf - sec.start * 30;
    if (rel > 55 && rel <= 67) out.push({ kind: 'tutorial', x: 0, y: 0 });
    for (const side of [-1, 1]) {
      const r = rng();
      const x = side * rng.range(10, 16);
      if (r < 0.32) out.push({ kind: 'box', x, rotY: rng.range(-0.6, 0.6) });
      else if (r < 0.5) out.push({ kind: 'pizza', x, rotY: rng.range(-1, 1) });
      else if (r < 0.62) out.push({ kind: rng.chance(0.5) ? 'beanbagA' : 'beanbagB', x });
      else if (r < 0.74) out.push({ kind: 'whiteboard', x: side * 11, rotY: -side * 0.4 });
      else if (r < 0.86) out.push({ kind: 'garage', x: side * rng.range(17, 22), rotY: -side * 0.5 });
    }
    return out;
  },
  makeProp(kind) {
    switch (kind) {
      case 'box': return cardboardBox();
      case 'pizza': return pizzaStack();
      case 'beanbagA': return beanbag('#ff7aa8');
      case 'beanbagB': return beanbag('#6ad1ff');
      case 'whiteboard': return whiteboard();
      case 'garage': return garageDoor();
      case 'tutorial': return tutorialSign();
    }
  },
  billboards: ['SERIES A ✓', "WE'RE BASICALLY AGI (BETA)", 'NOW HIRING: 10x PROMPT ENGINEER', 'STEALTH MODE (PLEASE CLAP)'],
  billboardEvery: 80,
  billboardStyle: { bg: '#fff3d6', fg: '#3a1f4d', frame: '#ff6b8b' },
  hazards: [],
  enterLines: ['WELCOME TO THE GARAGE'],
};
