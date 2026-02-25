"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import * as THREE from "three";

type MessageType = "ok" | "error";

interface IPInfo {
  ip: string;
  city: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
  org: string;
}

export default function HomePage() {
  const router = useRouter();
  const authBlockRef = useRef<HTMLElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const globeRef = useRef<THREE.Points | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [requires2FA, setRequires2FA] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: MessageType; text: string } | null>(null);
  const [ipInfo, setIpInfo] = useState<IPInfo | null>(null);
  const [isSecure, setIsSecure] = useState(false);
  const [showLoginAnimation, setShowLoginAnimation] = useState(false);
  const [loginLogs, setLoginLogs] = useState<string[]>([]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!authBlockRef.current) return;
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      const moveX = (x - 0.5) * 15;
      const moveY = (y - 0.5) * 15;
      authBlockRef.current.style.transform = `perspective(1000px) rotateY(${moveX}deg) rotateX(${-moveY}deg)`;
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    // Check if connection is secure
    setIsSecure(window.location.protocol === "https:");

    // Fetch IP and geolocation info
    const fetchIPInfo = async () => {
      try {
        const response = await fetch("https://ipapi.co/json/");
        if (response.ok) {
          const data = await response.json();
          setIpInfo({
            ip: data.ip,
            city: data.city,
            region: data.region,
            country: data.country_name,
            latitude: data.latitude,
            longitude: data.longitude,
            org: data.org,
          });
        }
      } catch (error) {
        console.error("Failed to fetch IP info:", error);
      }
    };

    fetchIPInfo();
  }, []);

  const addLog = (log: string) => {
    setLoginLogs(prev => [...prev, log]);
  };

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const initThreeJS = () => {
    if (!canvasContainerRef.current || sceneRef.current) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 250;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;
    canvasContainerRef.current.appendChild(renderer.domElement);

    // Create dot-sphere globe
    const dotGeometry = new THREE.BufferGeometry();
    const positions = [];
    const vector = new THREE.Vector3();
    for (let i = 0; i < 8000; i++) {
      const phi = Math.acos(-1 + (2 * i) / 8000);
      const theta = Math.sqrt(8000 * Math.PI) * phi;
      vector.setFromSphericalCoords(80, phi, theta);
      positions.push(vector.x, vector.y, vector.z);
    }
    dotGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.5,
      transparent: true,
      opacity: 0.15,
    });
    
    const globe = new THREE.Points(dotGeometry, material);
    globeRef.current = globe;
    scene.add(globe);

    // Atmosphere glow
    const glowGeo = new THREE.SphereGeometry(82, 64, 64);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x00ff41,
      transparent: true,
      opacity: 0.03,
      side: THREE.BackSide,
    });
    const glowSphere = new THREE.Mesh(glowGeo, glowMat);
    scene.add(glowSphere);

    // Network lines (filaments)
    createFilaments(globe);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      if (globeRef.current) {
        globeRef.current.rotation.y += 0.0015;
        globeRef.current.rotation.x += 0.0005;
      }
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  };

  const createFilaments = (globe: THREE.Points) => {
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.05,
    });

    for (let i = 0; i < 20; i++) {
      const geometry = new THREE.BufferGeometry();
      const start = new THREE.Vector3().setFromSphericalCoords(
        80,
        Math.random() * Math.PI,
        Math.random() * Math.PI * 2
      );
      const end = new THREE.Vector3().setFromSphericalCoords(
        80,
        Math.random() * Math.PI,
        Math.random() * Math.PI * 2
      );

      const mid = start.clone().lerp(end, 0.5).normalize().multiplyScalar(90);
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const curvePoints = curve.getPoints(50);

      geometry.setFromPoints(curvePoints);
      const line = new THREE.Line(geometry, lineMat);
      globe.add(line);
    }
  };

  const triggerBeam = () => {
    if (!globeRef.current) return;

    const globe = globeRef.current;
    const start = new THREE.Vector3().setFromSphericalCoords(80, 1.2, 0.5);
    const end = new THREE.Vector3().setFromSphericalCoords(80, 0.5, 4.2);

    // User pulse point
    const userPulseGeo = new THREE.SphereGeometry(2, 16, 16);
    const userPulseMat = new THREE.MeshBasicMaterial({ color: 0x00ff41 });
    const userPulse = new THREE.Mesh(userPulseGeo, userPulseMat);
    userPulse.position.copy(start);
    globe.add(userPulse);

    // Server pulse point
    const serverPulseGeo = new THREE.SphereGeometry(2, 16, 16);
    const serverPulseMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const serverPulse = new THREE.Mesh(serverPulseGeo, serverPulseMat);
    serverPulse.position.copy(end);
    globe.add(serverPulse);

    // The beam path
    const mid = start.clone().lerp(end, 0.5).normalize().multiplyScalar(120);
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const curvePoints = curve.getPoints(100);

    const beamGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
    const beamMat = new THREE.LineBasicMaterial({
      color: 0x00ff41,
      transparent: true,
      opacity: 0,
      linewidth: 2,
    });
    const beam = new THREE.Line(beamGeo, beamMat);
    globe.add(beam);

    // Animate beam fade in
    let opac = 0;
    const fadeIn = setInterval(() => {
      opac += 0.05;
      beamMat.opacity = Math.min(opac, 0.8);
      if (opac >= 0.8) clearInterval(fadeIn);
    }, 50);

    // Create data packets
    for (let i = 0; i < 5; i++) {
      setTimeout(() => createPacket(curve, globe), i * 300);
    }
  };

  const createPacket = (curve: THREE.QuadraticBezierCurve3, globe: THREE.Points) => {
    const pGeo = new THREE.SphereGeometry(0.8, 8, 8);
    const pMat = new THREE.MeshBasicMaterial({ color: 0x00ff41 });
    const p = new THREE.Mesh(pGeo, pMat);
    globe.add(p);

    let progress = 0;
    const move = setInterval(() => {
      progress += 0.01;
      const pos = curve.getPointAt(Math.min(progress, 1));
      p.position.copy(pos);
      if (progress >= 1) {
        clearInterval(move);
        globe.remove(p);
      }
    }, 16);
  };

  const highlightServer = (color: number) => {
    if (!globeRef.current) return;
    
    const globe = globeRef.current;
    const end = new THREE.Vector3().setFromSphericalCoords(80, 0.5, 4.2);
    const flashGeo = new THREE.SphereGeometry(4, 32, 32);
    const flashMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8,
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.copy(end);
    globe.add(flash);

    let s = 1;
    const pulse = setInterval(() => {
      s += 0.1;
      flash.scale.set(s, s, s);
      flashMat.opacity -= 0.02;
      if (flashMat.opacity <= 0) {
        clearInterval(pulse);
        globe.remove(flash);
      }
    }, 16);
  };

  const handleLogin = async () => {
    setLoading(true);
    setMessage(null);
    setShowLoginAnimation(true);
    setLoginLogs([]);
    
    // Initialize Three.js scene
    setTimeout(() => initThreeJS(), 100);
    
    try {
      addLog("[SYS] Initializing secure connection...");
      await delay(300);
      addLog(`[NET] Routing request from ${ipInfo?.city || 'Unknown'}, ${ipInfo?.country || 'Unknown'}`);
      await delay(400);
      addLog(`[NET] Connecting to server [VAULT-CORE-01]...`);
      
      // Trigger the beam animation
      setTimeout(() => triggerBeam(), 200);
      
      await delay(500);
      addLog("[AUTH] Transmitting encrypted credentials...");
      await delay(350);
      
      const normalizedEmail = email.trim().toLowerCase();
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });

      addLog("[AUTH] Verifying identity matrix...");
      await delay(400);
      
      const data = await response.json();
      if (!response.ok) {
        addLog("[ERROR] Authentication failed");
        await delay(600);
        highlightServer(0xef4444); // Red for failure
        throw new Error(data.error ?? "Login failed");
      }

      addLog("[AUTH] Identity verified ✓");
      await delay(300);

      if (data.requires2FA) {
        addLog("[2FA] Two-factor authentication required");
        await delay(500);
        setRequires2FA(true);
        setMessage({ type: "ok", text: "2FA_VERIFICATION_REQUIRED" });
        setShowLoginAnimation(false);
        return;
      }

      addLog("[SYS] Establishing secure session...");
      await delay(400);
      addLog("[SYS] Access granted - Redirecting to vault");
      highlightServer(0x10b981); // Green for success
      await delay(800);
      
      router.push("/vault");
    } catch (error) {
      const text = error instanceof Error ? error.message : "ACCESS_DENIED";
      setMessage({ type: "error", text });
      setTimeout(() => setShowLoginAnimation(false), 1500);
    } finally {
      setLoading(false);
    }
  };

  const handle2FAVerify = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: twoFactorCode }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "2FA verification failed");
      }

      router.push("/vault");
    } catch (error) {
      const text = error instanceof Error ? error.message : "2FA_AUTH_FAILED";
      setMessage({ type: "error", text });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="perforation-overlay" />
      <div className="graphite-grain" />

      <main className="relative z-10 mx-auto grid w-full max-w-[1100px] items-center gap-20 px-10 py-20 md:grid-cols-[1fr_400px]" style={{fontFamily: 'var(--font-inter)'}}>
        <section className="animate-[slideIn_1.2s_ease-out_forwards]">
          <div style={{fontFamily: 'var(--font-space-mono)'}} className="text-[11px] uppercase tracking-[0.2em] text-[#444]">
            System Node: 0x4FF2 // Level 9
          </div>
          <h1 className="mt-4 text-[clamp(3rem,8vw,7rem)] font-[900] uppercase leading-[0.9] tracking-[-0.05em]" style={{fontFamily: 'var(--font-inter)', color: '#2a2a2a', WebkitTextStroke: '1px rgba(255,255,255,0.15)'}}>
            Black<span className="block" style={{color: '#ffffff', WebkitTextStroke: '0'}}>Node</span>
          </h1>
          <div style={{fontFamily: 'var(--font-space-mono)'}} className="mt-2 text-[11px] uppercase tracking-[0.2em] text-[#444]">
            Personal Data Sequestration Layer
          </div>
        </section>

        <section
          ref={authBlockRef}
          className="relative animate-[revealSlab_1s_cubic-bezier(0.16,1,0.3,1)_forwards] border border-[#1a1a1a] bg-[#121212] px-10 py-[60px] shadow-[40px_40px_80px_rgba(0,0,0,0.5),inset_1px_1px_0_rgba(255,255,255,0.05)] transition-transform"
        >
          <div className="absolute -top-5 -left-5 h-10 w-10 border-l-2 border-t-2 border-[#333]" />
          <div className="absolute -top-3.5 -right-3.5 h-2 w-2 rounded-full border border-[#222] bg-[#151515]" />
          <div className="absolute -top-3.5 -left-3.5 h-2 w-2 rounded-full border border-[#222] bg-[#151515]" />
          <div className="absolute -bottom-3.5 -right-3.5 h-2 w-2 rounded-full border border-[#222] bg-[#151515]" />
          <div className="absolute -bottom-3.5 -left-3.5 h-2 w-2 rounded-full border border-[#222] bg-[#151515]" />

          <form onSubmit={(e) => e.preventDefault()} className="space-y-10">
            <div className="relative">
              <label className="block font-mono text-[10px] uppercase tracking-[0.1em] text-[#666] mb-2" style={{fontFamily: 'var(--font-space-mono)'}}>
                IDENTIFIER
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border-0 border-b border-[#222] bg-transparent py-3 text-base text-white outline-none transition-all focus:border-white"
                style={{fontFamily: 'var(--font-inter)'}}
                autoComplete="email"
              />
            </div>

            <div className="relative">
              <label className="block font-mono text-[10px] uppercase tracking-[0.1em] text-[#666] mb-2" style={{fontFamily: 'var(--font-space-mono)'}}>
                ENCRYPTION PASSKEY
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border-0 border-b border-[#222] bg-transparent py-3 text-base text-white outline-none transition-all focus:border-white"
                style={{fontFamily: 'var(--font-inter)'}}
                autoComplete="current-password"
              />
            </div>

            {requires2FA && (
              <div className="relative">
                <label className="block font-mono text-[10px] uppercase tracking-[0.1em] text-[#666] mb-2" style={{fontFamily: 'var(--font-space-mono)'}}>
                  2FA_CODE
                </label>
                <input
                  type="text"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value)}
                  className="w-full border-0 border-b border-[#222] bg-transparent py-3 text-base text-white outline-none transition-all focus:border-white"
                  style={{fontFamily: 'var(--font-inter)'}}
                  autoComplete="one-time-code"
                />
              </div>
            )}

            <div className="space-y-3">
              {!requires2FA && (
                <button
                  onClick={handleLogin}
                  disabled={loading}
                  style={{fontFamily: 'var(--font-space-mono)'}}
                  className="w-full bg-white px-5 py-4 text-xs font-bold uppercase tracking-[0.1em] text-black transition-all hover:-translate-y-0.5 hover:bg-[#e0e0e0] hover:shadow-[0_10px_30px_rgba(255,255,255,0.1)] active:translate-y-0 disabled:opacity-50"
                >
                  {loading ? "AUTHENTICATING..." : "Initialize Access"}
                </button>
              )}

              {requires2FA && (
                <button
                  onClick={handle2FAVerify}
                  disabled={loading}
                  style={{fontFamily: 'var(--font-space-mono)'}}
                  className="w-full bg-white px-5 py-4 text-xs font-bold uppercase tracking-[0.1em] text-black transition-all hover:-translate-y-0.5 hover:bg-[#e0e0e0] hover:shadow-[0_10px_30px_rgba(255,255,255,0.1)] active:translate-y-0 disabled:opacity-50"
                >
                  {loading ? "VERIFYING..." : "Verify 2FA"}
                </button>
              )}
            </div>
          </form>

          {message && (
            <div
              style={{fontFamily: 'var(--font-space-mono)'}}
              className={`mt-4 text-xs uppercase tracking-wide ${
                message.type === "error" ? "text-[#ff3e3e]" : "text-[#00ff41]"
              }`}
            >
              {message.text}
            </div>
          )}

          <div style={{fontFamily: 'var(--font-space-mono)'}} className="absolute -bottom-[60px] left-0 flex items-center gap-4 text-[10px] text-[#333]">
            <div className="h-1.5 w-1.5 animate-[pulse_2s_infinite] rounded-full bg-[#00ff00] shadow-[0_0_10px_#00ff00]" />
            <span>CORE_STATUS: SECURED_STATIONARY_STATE</span>
          </div>
        </section>

        {/* Network & Location Info Panel */}
        <div className="fixed bottom-6 left-6 z-20 border border-[#1a1a1a] bg-[#0a0a0a]/95 px-6 py-5 backdrop-blur-sm" style={{fontFamily: 'var(--font-space-mono)'}}>
          <div className="mb-3 flex items-center gap-2 border-b border-[#222] pb-2">
            <div className={`h-1.5 w-1.5 rounded-full ${isSecure ? 'bg-[#00ff00] shadow-[0_0_8px_#00ff00]' : 'bg-[#ff3e3e] shadow-[0_0_8px_#ff3e3e]'}`} />
            <div className="text-[9px] uppercase tracking-[0.15em] text-[#666]">
              CONNECTION_STATUS
            </div>
          </div>
          
          <div className="space-y-2 text-[10px]">
            <div className="flex items-center gap-2">
              <span className="text-[#444]">PROTOCOL:</span>
              <span className={isSecure ? 'text-[#00ff41]' : 'text-[#ff3e3e]'}>
                {isSecure ? 'HTTPS_SECURED' : 'HTTP_UNSECURED'}
              </span>
            </div>
            
            {ipInfo ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[#444]">IPv4:</span>
                  <span className="text-[#888]">{ipInfo.ip}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-[#444]">PROVIDER:</span>
                  <span className="text-[#888]">{ipInfo.org}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-[#444]">COUNTRY:</span>
                  <span className="text-[#888]">{ipInfo.country}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-[#444]">REGION:</span>
                  <span className="text-[#888]">{ipInfo.city}, {ipInfo.region}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-[#444]">COORDS:</span>
                  <span className="text-[#888]">{ipInfo.latitude.toFixed(4)}°, {ipInfo.longitude.toFixed(4)}°</span>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[#444]">STATUS:</span>
                <span className="text-[#666] animate-pulse">SCANNING_NETWORK...</span>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Login Animation Overlay */}
      {showLoginAnimation && (
        <div className="fixed inset-0 z-50 bg-[#0a0a0a]">
          {/* Perforation Overlay */}
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.03) 1.5px, transparent 0)',
            backgroundSize: '24px 24px',
            pointerEvents: 'none'
          }} />

          {/* Graphite Grain */}
          <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{
            background: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")"
          }} />

          {/* Three.js Canvas Container */}
          <div 
            ref={canvasContainerRef}
            className="absolute inset-0 opacity-100 transition-opacity duration-1000"
            style={{ opacity: showLoginAnimation ? 1 : 0 }}
          />

          {/* Location Markers Overlay */}
          {ipInfo && (
            <>
              <div className="absolute left-[20%] top-[35%] flex flex-col items-center pointer-events-none">
                <div className="h-4 w-4 animate-pulse rounded-full bg-[#00ff41] shadow-[0_0_30px_#00ff41]" />
                <div className="mt-3 rounded bg-[#121212]/90 border border-[#1a1a1a] px-3 py-2 backdrop-blur-sm">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-[#666] mb-1" style={{fontFamily: 'var(--font-space-mono)'}}>
                    USER_LOCATION
                  </div>
                  <div className="text-[12px] font-bold text-[#00ff41]" style={{fontFamily: 'var(--font-inter)'}}>
                    {ipInfo.city}
                  </div>
                  <div className="text-[9px] text-[#444]" style={{fontFamily: 'var(--font-space-mono)'}}>
                    {ipInfo.country}
                  </div>
                </div>
              </div>

              <div className="absolute right-[20%] bottom-[30%] flex flex-col items-center pointer-events-none">
                <div className="h-4 w-4 animate-pulse rounded-full bg-white shadow-[0_0_30px_rgba(255,255,255,0.8)]" />
                <div className="mt-3 rounded bg-[#121212]/90 border border-[#1a1a1a] px-3 py-2 backdrop-blur-sm">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-[#666] mb-1" style={{fontFamily: 'var(--font-space-mono)'}}>
                    SERVER_NODE
                  </div>
                  <div className="text-[12px] font-bold text-white" style={{fontFamily: 'var(--font-inter)'}}>
                    VAULT-CORE-01
                  </div>
                  <div className="text-[9px] text-[#444]" style={{fontFamily: 'var(--font-space-mono)'}}>
                    SECURED_FACILITY
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Login Logs Panel */}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full max-w-[600px] px-6">
            <div className="border border-[#1a1a1a] bg-[#121212]/95 backdrop-blur-sm p-6">
              <div className="mb-4 flex items-center gap-2 border-b border-[#222] pb-3">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00ff00] shadow-[0_0_10px_#00ff00]" />
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#444]" style={{fontFamily: 'var(--font-space-mono)'}}>
                  System Activity Log
                </div>
              </div>
              
              <div className="max-h-[180px] space-y-2 overflow-y-auto">
                {loginLogs.map((log, index) => (
                  <div
                    key={index}
                    className="animate-[logSlide_0.4s_ease-out_forwards] text-[11px] text-[#666] opacity-0"
                    style={{
                      fontFamily: 'var(--font-space-mono)',
                      animationDelay: `${index * 0.08}s`,
                      animationFillMode: 'forwards'
                    }}
                  >
                    <span className="text-[#333] mr-2">[{new Date().toLocaleTimeString([], {hour12: false})}]</span>
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-40px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes revealSlab {
          from {
            opacity: 0;
            transform: translateY(40px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes pulse {
          0% {
            opacity: 0.3;
          }
          50% {
            opacity: 1;
          }
          100% {
            opacity: 0.3;
          }
        }

        @keyframes scan {
          0% {
            top: 0%;
          }
          100% {
            top: 100%;
          }
        }

        @keyframes logSlide {
          from {
            opacity: 0;
            transform: translateX(10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}
