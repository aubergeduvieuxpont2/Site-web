<script lang="ts">
  import { onMount } from 'svelte';

  let canvasEl: HTMLCanvasElement;
  let wrapperEl: HTMLDivElement;

  // ── GLSL source ──────────────────────────────────────────────────────────────

  const VS = `
    attribute vec2 a_position;
    varying vec2 v_texCoord;
    void main() {
      v_texCoord = a_position * 0.5 + 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  // Colors match --color-surface (#f7f9fb) and --color-surface-container (#eceef0)
  const FS = `
    precision highp float;
    uniform float u_time;
    uniform vec2 u_resolution;
    varying vec2 v_texCoord;
    void main() {
      vec2 uv = v_texCoord;
      float noise = sin(uv.x * 2.0 + u_time * 0.2) * cos(uv.y * 2.0 + u_time * 0.1);
      vec3 color1 = vec3(0.969, 0.976, 0.984); /* --color-surface    #f7f9fb */
      vec3 color2 = vec3(0.925, 0.933, 0.941); /* --color-surface-container #eceef0 */
      gl_FragColor = vec4(mix(color1, color2, noise * 0.5 + 0.5), 1.0);
    }
  `;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  onMount(() => {
    // 1. Reduced-motion gate — do NOT touch WebGL at all
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      wrapperEl.classList.add('hero-shader--reduced-motion');
      return;
    }

    // 2. WebGL context
    const gl =
      (canvasEl.getContext('webgl') ||
      canvasEl.getContext('experimental-webgl')) as WebGLRenderingContext | null;

    if (!gl) {
      wrapperEl.classList.add('hero-shader--no-webgl');
      return;
    }

    // 3. Compile & link program
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    // 4. Full-screen quad geometry
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    const aPosLoc = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(aPosLoc);
    gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes  = gl.getUniformLocation(prog, 'u_resolution');

    // 5. Drawing-buffer ↔ CSS layout sync
    function syncSize() {
      const w = canvasEl.clientWidth  || 1280;
      const h = canvasEl.clientHeight || 720;
      if (canvasEl.width !== w || canvasEl.height !== h) {
        canvasEl.width  = w;
        canvasEl.height = h;
      }
    }

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(syncSize);
      ro.observe(canvasEl);
    }
    syncSize();

    // 6. Render loop — accumulates elapsed time so pause/resume has no visual jump
    let rafId: number | null       = null;
    let elapsedMs                  = 0;
    let lastStamp: number | null   = null;

    function render(now: number) {
      if (lastStamp !== null) elapsedMs += now - lastStamp;
      lastStamp = now;
      if (typeof ResizeObserver === 'undefined') syncSize(); // fallback for old browsers
      gl!.viewport(0, 0, canvasEl.width, canvasEl.height);
      if (uTime) gl!.uniform1f(uTime, elapsedMs * 0.001);
      if (uRes)  gl!.uniform2f(uRes, canvasEl.width, canvasEl.height);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
      rafId = requestAnimationFrame(render);
    }

    function startRender() {
      if (!rafId) rafId = requestAnimationFrame(render);
    }

    function stopRender() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      lastStamp = null; // so elapsed resumes cleanly on next startRender
    }

    // 7. IntersectionObserver — pause when hero scrolls off-screen
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) startRender();
        else stopRender();
      },
      { threshold: 0 }
    );
    io.observe(canvasEl);
    startRender(); // begin immediately if already in viewport

    // 8. Cleanup on component destroy
    return () => {
      stopRender();
      io.disconnect();
      if (ro) ro.disconnect();
    };
  });
</script>

<div class="hero-shader" bind:this={wrapperEl} data-testid="hero-shader">
  <!-- Semantic fallback — always in DOM, carries ARIA; shown when canvas is inactive -->
  <div
    class="hero-shader__fallback"
    role="img"
    aria-label="Vue de l'auberge"
    data-testid="hero-shader-fallback"
  ></div>

  <!-- WebGL canvas — decorative, never read by AT -->
  <canvas
    class="hero-shader__canvas"
    bind:this={canvasEl}
    aria-hidden="true"
    data-testid="hero-shader-canvas"
  ></canvas>
</div>

<style>
  .hero-shader {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--color-surface, #f7f9fb);
  }

  /* Fallback gradient — always rendered as the base layer */
  .hero-shader__fallback {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      160deg,
      var(--color-surface-container-highest, #e0e3e5) 0%,
      var(--color-surface, #f7f9fb) 50%,
      var(--color-surface-container-lowest, #ffffff) 100%
    );
  }

  /* Canvas stacks on top of fallback */
  .hero-shader__canvas {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
  }

  /* Hide canvas under reduced-motion (CSS safety net before JS loads) */
  @media (prefers-reduced-motion: reduce) {
    .hero-shader__canvas {
      display: none;
    }
  }

  /* Hide canvas when JS detects reduced-motion or WebGL failure */
  /* :global() required because these modifier classes are added dynamically at runtime */
  :global(.hero-shader--reduced-motion) .hero-shader__canvas,
  :global(.hero-shader--no-webgl) .hero-shader__canvas {
    display: none;
  }
</style>
