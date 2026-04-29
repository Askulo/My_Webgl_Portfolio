import { useEffect, useRef } from 'react';
import Experience from './components/canvas/Experience';

export default function App() {
  const fpsRef = useRef<HTMLSpanElement>(null);
  const secCurRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // FPS counter
    let frames = 0;
    let last = performance.now();
    let requestId: number;

    const tick = (now: number) => {
      frames++;
      if (now - last >= 1000) {
        const fps = Math.round((frames * 1000) / (now - last));
        if (fpsRef.current) fpsRef.current.textContent = String(fps);
        frames = 0;
        last = now;
      }
      requestId = requestAnimationFrame(tick);
    };
    requestId = requestAnimationFrame(tick);

    // Intersection observer for fade-up
    const fadeObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('visible');
        });
      },
      { threshold: 0.15 }
    );
    document.querySelectorAll('.fade-up').forEach((el) => fadeObs.observe(el));

    // Section tracker for HUD
    const sections = ['hero', 'work', 'about'];
    const sObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const i = sections.indexOf(e.target.id) + 1;
            if (i && secCurRef.current) {
              secCurRef.current.textContent = String(i).padStart(2, '0');
            }
          }
        });
      },
      { threshold: 0.4 }
    );
    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el) sObs.observe(el);
    });

    // Nav active link
    const navLinks = document.querySelectorAll('.nav-links a');
    const allObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            navLinks.forEach((a) => a.classList.remove('active'));
            const match = document.querySelector(`.nav-links a[href="#${e.target.id}"]`);
            if (match) match.classList.add('active');
          }
        });
      },
      { threshold: 0.5 }
    );
    document.querySelectorAll('section').forEach((s) => allObs.observe(s));

    return () => {
      cancelAnimationFrame(requestId);
      fadeObs.disconnect();
      sObs.disconnect();
      allObs.disconnect();
    };
  }, []);

  return (
    <div className="page">
      <nav>
        <div className="nav-logo">ASKULO</div>
        <ul className="nav-links">
          <li><a href="#hero" className="active">HOME</a></li>
          <li><a href="#work">WORK</a></li>
          <li><a href="#about">ABOUT</a></li>
          <li><a href="#contact">CONTACT</a></li>
        </ul>
        <div className="nav-status">
          <div className="status-dot"></div>
          <span>AVAILABLE FOR WORK</span>
        </div>
      </nav>

      {/* HERO */}
      <section id="hero">
        <div className="hero-bg">
          <div className="hero-grid"></div>
          <div className="hero-crosshair"><div className="dot"></div></div>
        </div>

        <div className="bracket tl"></div>
        <div className="bracket tr"></div>
        <div className="bracket bl"></div>
        <div className="bracket br"></div>

        <div className="fade-up" style={{ transitionDelay: '0.1s' }}>
          <p className="hero-label">01 — HERO</p>
          <p className="hero-sub">Crafting immersive 3D experiences where<br />code becomes art.</p>
          <div className="tags">
            <span className="tag">THREE.JS</span>
            <span className="tag">GLSL</span>
            <span className="tag">WEBGL</span>
          </div>
          <div className="hero-scroll">
            <div className="scroll-line"></div>
            SCROLL
          </div>
        </div>

        {/* <div className="hero-coords">36.8219° N / 174.7° E</div> */}
        <div className="hero-index">01 — HERO</div>
      </section>

      {/* HUD */}
      <div className="hud-bar">
        <div className="hud-item">FPS <span className="hud-val" ref={fpsRef}>60</span></div>
        <div className="hud-item">TRIANGLES <span className="hud-val">14.2K</span></div>
        <div className="hud-item">DRAW CALLS <span className="hud-val">10</span></div>
        <div className="hud-item">SECTION <span className="hud-val" ref={secCurRef}>01</span> / <span className="hud-val">03</span></div>
        <div className="hud-item">SHADER <span className="hud-val green">ACTIVE</span></div>
      </div>

      {/* WORK */}
      <section id="work">
        <div className="bracket tl"></div>
        <div className="bracket tr"></div>
        <div className="bracket bl"></div>
        <div className="bracket br"></div>

        <span className="section-num-bg">02</span>

        <div className="section-header fade-up">02 — SELECTED WORK</div>

        <div className="work-list">
          <div className="work-item fade-up" style={{ transitionDelay: '0.1s' }}>
            <div className="work-left">
              <span className="work-num">01</span>
              <a href="https://dog-studio-lyart-ten.vercel.app/" target="_blank" rel="noopener noreferrer" className="work-title no-underline hover:underline">DOG STUDIO</a>
            </div>
            <div className="work-right ">
              <span className="tag">THREE.JS</span>
              <span className="tag">GLSL</span>
              <span className="tag">R3F</span>
              <span className="tag">GSAP</span>
              <a href="https://dog-studio-lyart-ten.vercel.app/" target="_blank" rel="noopener noreferrer" className="work-arrow">→</a>
            </div>
          </div>
          <div className="work-item fade-up" style={{ transitionDelay: '0.2s' }}>
            <div className="work-left">
              <span className="work-num">02</span>
              <a href="https://www.paintingwing.com/" target="_blank" rel="noopener noreferrer" className="work-title">PAINTING WING</a>
            </div>
            <div className="work-right">
              <span className="tag">R3F</span>
              <span className="tag">GLTF</span>
              <span className="tag">NEXTJS</span>
              <span className="tag">GSAP</span>
              <a href="https://www.paintingwing.com/" target="_blank" rel="noopener noreferrer" className="work-arrow">→</a>
            </div>
          </div>
          <div className="work-item fade-up" style={{ transitionDelay: '0.3s' }}>
            <div className="work-left">
              <span className="work-num">03</span>
              <a href="https://watch-visualization.vercel.app/" target="_blank" rel="noopener noreferrer" className="work-title no-underline hover:underline">CLAVDER</a>
            </div>
            <div className="work-right">
              <span className="tag">VITE</span>
              <span className="tag">THREEJS</span>
              <span className="tag">BLENDER</span>
              <a href="https://watch-visualization.vercel.app/" target="_blank" rel="noopener noreferrer" className="work-arrow">→</a>
            </div>
          </div>
          <div className="work-item fade-up" style={{ transitionDelay: '0.4s' }}>
            <div className="work-left">
              <span className="work-num">04</span>
              <a href="https://hexa-sort-game.vercel.app/" target="_blank" rel="noopener noreferrer" className="work-title no-underline hover:underline">HEXASORT</a>
            </div>
            <div className="work-right">
              <span className="tag">VITE</span>
              <span className="tag">ThreeJS</span>
              <span className="tag">RAPIER</span>

              <a href="https://hexa-sort-game.vercel.app/" target="_blank" rel="noopener noreferrer" className="work-arrow">→</a>
            </div>
          </div>
          <div className="work-item fade-up" style={{ transitionDelay: '0.4s' }}>
            <div className="work-left">
              <span className="work-num">05</span>
              <a href="https://arvr-c51.vercel.app/" target="_blank" rel="noopener noreferrer" className="work-title no-underline hover:underline">ARVR</a>
            </div>
            <div className="work-right">
              <span className="tag">WebXR</span>
              <span className="tag">ThreeJS</span>
              <span className="tag">GSAP</span>

              <a href="https://arvr-c51.vercel.app/" target="_blank" rel="noopener noreferrer" className="work-arrow">→</a>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about">
        <div className="bracket tl"></div>
        <div className="bracket tr"></div>
        <div className="bracket bl"></div>
        <div className="bracket br"></div>

        <div>
          <div className="section-header fade-up">03 — ABOUT</div>
          <div className="about-title fade-up" style={{ transitionDelay: '0.1s' }}>CREATIVE<br />DEVELOPER</div>
          <p className="about-bio fade-up" style={{ transitionDelay: '0.2s' }}>
            Building at the intersection of<br />code, mathematics &amp; visual art.<br />2+ years shaping the web in 3D.
          </p>
        </div>

        <div>
          <div className="about-skills fade-up" style={{ transitionDelay: '0.15s' }}>
            <span className="skill-tag">THREE.JS</span>
            <span className="skill-tag">WEBGL</span>
            <span className="skill-tag">GLSL</span>
            <span className="skill-tag">R3F</span>
            <span className="skill-tag">BLENDER</span>
            <span className="skill-tag">GSAP</span>
            <span className="skill-tag">SPLINE</span>
            <span className="skill-tag">GPGPU</span>
            <span className="skill-tag">WGPU</span>
          </div>

          <span className="section-num-bg" style={{ top: 'auto', bottom: '32px', right: '32px', fontSize: '140px' }}>03</span>
        </div>
      </section>

      {/* FOOTER / CONTACT */}
      <footer id="contact" className="modern-footer">
        {/* Status - Pulsing Icon */}
        <div className="footer-item">
          <div className="status-indicator">
            <span className="dot"></span>
            <span className="status-text">AVAILABLE FOR WORK</span>
          </div>
        </div>

        <div className="footer-links">
          {/* Email */}
          <a href="mailto:aashishkumarlohra9@gmail.com" className="icon-link" title="Email Me">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="footer-icon">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
              <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
          </a>

          {/* GitHub */}
          <a href="https://github.com/Askulo" target="_blank" rel="noreferrer" className="icon-link" title="GitHub Profile">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="footer-icon">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
            </svg>
          </a>

          {/* LinkedIn */}
          <a href="https://www.linkedin.com/in/aashish-kumar-lohra-a09715256/" target="_blank" rel="noreferrer" className="icon-link" title="LinkedIn Profile">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="footer-icon">
              <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
              <rect x="2" y="9" width="4" height="12"></rect>
              <circle cx="4" cy="4" r="2"></circle>
            </svg>
          </a>
        </div>
      </footer>

      <Experience />
    </div>
  );
}